"""Règles de gestion du crédit : simulation, circuit de la demande, décaissement, remboursements.

Circuit : saisie (accueil ou agent de crédit) → soumission → analyse (agent de crédit) → décision
du comité (approbation ou rejet) → décaissement (caisse) → remboursements → soldé. Chaque étape est
tracée dans l'historique du dossier.

Le membre doit avoir déjà déposé une part du montant (18 % au départ, `epargne_garantie_taux` du
produit) ; cette épargne est bloquée du décaissement jusqu'au solde du crédit.
"""

from dataclasses import dataclass
from datetime import date, timedelta
from decimal import Decimal

from django.db import transaction
from django.db.models import Sum
from django.utils import timezone

from apps.accounting import services as compta
from apps.accounting.initialisation import charger_regles
from apps.accounting.models import CompteComptable, RegleComptable, Sens
from apps.cash import services as caisse
from apps.core import services as core
from apps.core.exceptions import ErreurMetier
from apps.core.models import Devise
from apps.core.money import ZERO, arrondir, en_decimal
from apps.credits import echeancier
from apps.credits.models import (
    Credit,
    Echeance,
    HistoriqueCredit,
    PlafondCredit,
    ProduitCredit,
    Remboursement,
    SequenceCredit,
)
from apps.members.models import Membre
from apps.savings import services as epargne
from apps.savings.models import CompteEpargne, MouvementEpargne, ProduitEpargne

# Valeurs par défaut, à remplacer par la politique de crédit réelle (paramètre daté).
PARAMETRE_REGLES = "credits.regles"
DEFAUT_REGLES = {"credits_simultanes_max": 1, "taux_endettement_max": "0.40"}

S = Credit.Statut
# Dossiers qui engagent le membre (et comptent dans la limite de crédits simultanés).
STATUTS_ENGAGES = (S.SOUMIS, S.ANALYSE, S.APPROUVE, S.EN_COURS)


def regles_credit(a_date: date | None = None) -> dict:
    valeur = core.parametre(PARAMETRE_REGLES, a_date, defaut=DEFAUT_REGLES)
    return {
        "credits_simultanes_max": int(valeur["credits_simultanes_max"]),
        "taux_endettement_max": en_decimal(valeur["taux_endettement_max"]),
    }


# --- Produits ------------------------------------------------------------------------------

DECAISSEMENT = "CREDIT_DECAISSEMENT"
REMBOURSEMENT = "CREDIT_REMBOURSEMENT"
COMPTE_FRAIS = "7061"
COMPTE_PENALITES = "7713"


def regles_produit(compte_encours: str, compte_interets: str) -> list:
    """Schéma comptable d'un produit : seuls l'encours (41x) et les intérêts (77x) lui sont
    propres ; frais de dossier et pénalités vont aux comptes communs."""
    # (type d'opération, journal, libellé, [(sens, élément, compte fixe ou None, variable)])
    return [
        (
            DECAISSEMENT,
            "CR",
            "Décaissement crédit {reference}",
            [
                ("D", "capital", compte_encours, ""),
                ("C", "frais", COMPTE_FRAIS, ""),
                ("C", "net", None, "TRESORERIE"),
            ],
        ),
        (
            REMBOURSEMENT,
            "CR",
            "Remboursement crédit {reference}",
            [
                ("D", "total", None, "TRESORERIE"),
                ("C", "capital", compte_encours, ""),
                ("C", "interet", compte_interets, ""),
                ("C", "penalite", COMPTE_PENALITES, ""),
            ],
        ),
    ]


def _compte_produit(numero: str, prefixe: str, nature: str) -> str:
    compte = CompteComptable.objects.filter(numero=numero).first()
    if compte is None or not numero.startswith(prefixe) or not compte.est_mouvementable:
        raise ErreurMetier(
            f"Compte {nature} invalide : choisissez un compte {prefixe}x mouvementable.", "compte"
        )
    return numero


@transaction.atomic
def creer_produit(
    donnees: dict, plafonds: list[dict], *, compte_encours: str, compte_interets: str
) -> ProduitCredit:
    """Crée le produit, ses plafonds et ses règles de comptabilisation."""
    compte_encours = _compte_produit(compte_encours, "41", "d'encours")
    compte_interets = _compte_produit(compte_interets, "77", "d'intérêts")
    if not plafonds:
        raise ErreurMetier("Indiquez les montants autorisés dans au moins une devise.", "plafonds")
    produit = ProduitCredit.objects.create(**donnees)
    for plafond in plafonds:
        PlafondCredit.objects.create(produit=produit, **plafond)
    charger_regles(regles_produit(compte_encours, compte_interets), code_produit=produit.code)
    return produit


def comptes_produit(produit: ProduitCredit) -> dict[str, str | None]:
    """Comptes d'encours et d'intérêts lus dans les règles du produit."""
    comptes = dict.fromkeys(("encours", "interets"))
    regle = (
        RegleComptable.objects.filter(type_operation=REMBOURSEMENT, code_produit=produit.code)
        .prefetch_related("lignes__compte")
        .first()
    )
    for ligne in regle.lignes.all() if regle else []:
        if ligne.compte and ligne.element == "capital":
            comptes["encours"] = ligne.compte.numero
        elif ligne.compte and ligne.element == "interet":
            comptes["interets"] = ligne.compte.numero
    return comptes


# --- Conditions et simulation --------------------------------------------------------------


def plafond(produit: ProduitCredit, devise: Devise | str) -> PlafondCredit:
    code = devise if isinstance(devise, str) else devise.code
    trouve = produit.plafonds.filter(devise_id=code).first()
    if trouve is None:
        raise ErreurMetier(f"Le produit {produit.libelle} n'est pas proposé en {code}.", "devise")
    return trouve


def controler_conditions(produit: ProduitCredit, devise, montant: Decimal, duree: int) -> None:
    if not produit.actif:
        raise ErreurMetier("Ce produit de crédit n'est plus proposé.", "produit")
    limites = plafond(produit, devise)
    if not limites.montant_min <= montant <= limites.montant_max:
        raise ErreurMetier(
            f"Montant hors des limites du produit : de {limites.montant_min} à "
            f"{limites.montant_max} {limites.devise_id}.",
            "montant",
        )
    if not produit.duree_min <= duree <= produit.duree_max:
        raise ErreurMetier(
            f"Durée hors des limites du produit : de {produit.duree_min} à {produit.duree_max} "
            "échéances.",
            "duree",
        )
    devise_obj = limites.devise
    if montant != arrondir(montant, devise_obj.decimales):
        raise ErreurMetier(
            f"Montant non arrondi à {devise_obj.decimales} décimale(s) ({devise_obj}).", "arrondi"
        )


def calculer_echeancier(
    produit: ProduitCredit,
    devise: Devise,
    montant: Decimal,
    duree: int,
    depart: date,
    taux: Decimal | None = None,
) -> list[echeancier.LigneEcheancier]:
    return echeancier.calculer(
        montant=montant,
        taux=produit.taux_interet if taux is None else taux,
        duree=duree,
        methode=produit.methode,
        periodicite=produit.periodicite,
        depart=depart,
        decimales=devise.decimales,
        ajuster_date=core.jour_ouvre_suivant,
    )


@dataclass(frozen=True)
class Simulation:
    lignes: list[echeancier.LigneEcheancier]
    total_interets: Decimal
    frais_dossier: Decimal
    epargne_garantie: Decimal
    montant_net: Decimal


def simuler(
    produit: ProduitCredit, devise: Devise, montant, duree: int, depart: date | None = None
) -> Simulation:
    montant = en_decimal(montant)
    controler_conditions(produit, devise, montant, duree)
    lignes = calculer_echeancier(produit, devise, montant, duree, depart or timezone.localdate())
    frais = arrondir(montant * produit.frais_dossier_taux, devise.decimales)
    return Simulation(
        lignes=lignes,
        total_interets=sum((ligne.interet for ligne in lignes), start=ZERO),
        frais_dossier=frais,
        epargne_garantie=arrondir(montant * produit.epargne_garantie_taux, devise.decimales),
        montant_net=montant - frais,
    )


# --- Circuit de la demande --------------------------------------------------------------------


def _prochain_numero(agence) -> str:
    sequence, _ = SequenceCredit.objects.select_for_update().get_or_create(agence=agence)
    sequence.dernier_numero += 1
    sequence.save(update_fields=["dernier_numero"])
    return f"{agence.code}-CR{sequence.dernier_numero:06d}"


def _transition(credit: Credit, nouveau: str, utilisateur, commentaire: str = "") -> Credit:
    ancien = credit.statut
    credit.statut = nouveau
    credit.save()
    HistoriqueCredit.objects.create(
        credit=credit, ancien=ancien, nouveau=nouveau, commentaire=commentaire, par=utilisateur
    )
    return credit


def _verrouiller(credit: Credit, *statuts: str) -> Credit:
    credit = (
        Credit.objects.select_for_update()
        .select_related("produit", "devise", "membre", "agence")
        .get(pk=credit.pk)
    )
    if statuts and credit.statut not in statuts:
        raise ErreurMetier(
            f"Action impossible : le dossier est « {credit.get_statut_display().lower()} ».",
            "statut",
        )
    return credit


@transaction.atomic
def creer_demande(donnees: dict, utilisateur) -> Credit:
    membre = donnees["membre"]
    if membre.statut in (Membre.Statut.DEMISSIONNAIRE, Membre.Statut.DECEDE):
        raise ErreurMetier("Le dossier de ce membre est clôturé.", "statut")
    controler_conditions(
        donnees["produit"], donnees["devise"], donnees["montant_demande"], donnees["duree_demandee"]
    )
    credit = Credit.objects.create(
        **donnees,
        numero=_prochain_numero(membre.agence),
        agence=membre.agence,
        cree_par=utilisateur,
        revenu_mensuel=membre.revenu_mensuel if membre.devise_revenu == donnees["devise"] else None,
        charges_mensuelles=(
            membre.charges_mensuelles if membre.devise_revenu == donnees["devise"] else None
        ),
    )
    HistoriqueCredit.objects.create(
        credit=credit, nouveau=credit.statut, commentaire="Saisie de la demande", par=utilisateur
    )
    return credit


@transaction.atomic
def modifier_demande(credit: Credit, donnees: dict) -> Credit:
    credit = _verrouiller(credit, S.BROUILLON)
    for champ, valeur in donnees.items():
        setattr(credit, champ, valeur)
    controler_conditions(
        credit.produit, credit.devise, credit.montant_demande, credit.duree_demandee
    )
    credit.save()
    return credit


def elements_bloquants(credit: Credit) -> list[str]:
    """Ce qui empêche le dossier d'avancer (soumission, décision, décaissement)."""
    bloquants = []
    membre = credit.membre
    if membre.statut != Membre.Statut.ACTIF:
        bloquants.append(f"Le membre n'est pas actif ({membre.get_statut_display().lower()})")
    if membre.en_liste_noire:
        bloquants.append("Membre inscrit sur la liste noire")
    maximum = regles_credit()["credits_simultanes_max"]
    autres = (
        Credit.objects.filter(membre=membre, statut__in=STATUTS_ENGAGES)
        .exclude(pk=credit.pk)
        .values_list("numero", flat=True)
    )
    if len(autres) >= maximum:
        bloquants.append(
            f"Le membre a déjà {len(autres)} crédit(s) en cours ou en instruction "
            f"({', '.join(autres)}) ; maximum autorisé : {maximum}"
        )
    if credit.statut not in (S.EN_COURS, S.SOLDE):
        exigee = epargne_exigee(credit)
        detenue = epargne.epargne_disponible(membre, credit.devise)
        if detenue < exigee:
            bloquants.append(
                f"Épargne insuffisante : {detenue} {credit.devise_id} disponibles, {exigee} exigés "
                f"({credit.produit.epargne_garantie_taux * 100:g} % du montant)"
            )
    return bloquants


def epargne_exigee(credit: Credit) -> Decimal:
    """Épargne à détenir : la part du produit appliquée au montant accordé, proposé ou demandé."""
    montant = credit.montant_accorde or credit.montant_propose or credit.montant_demande
    return arrondir(montant * credit.produit.epargne_garantie_taux, credit.devise.decimales)


def bloque_par_credits(membre: Membre, devise: str) -> Decimal:
    """Épargne bloquée par les crédits en cours du membre dans une devise (enregistrée auprès du
    module épargne : elle n'est plus retirable jusqu'au solde du crédit)."""
    return (
        Credit.objects.filter(membre=membre, devise_id=devise, statut=S.EN_COURS).aggregate(
            t=Sum("epargne_bloquee")
        )["t"]
        or ZERO
    )


def _exiger_eligible(credit: Credit) -> None:
    bloquants = elements_bloquants(credit)
    if bloquants:
        raise ErreurMetier(" ; ".join(bloquants) + ".", "non_eligible")


@transaction.atomic
def soumettre(credit: Credit, utilisateur) -> Credit:
    credit = _verrouiller(credit, S.BROUILLON)
    controler_conditions(
        credit.produit, credit.devise, credit.montant_demande, credit.duree_demandee
    )
    _exiger_eligible(credit)
    credit.soumis_par = utilisateur
    credit.soumis_le = timezone.now()
    return _transition(credit, S.SOUMIS, utilisateur, "Soumission à l'analyse")


def capacite_remboursement(credit: Credit) -> dict:
    """Ratio d'endettement : première échéance du montant proposé (ou demandé) rapportée au revenu
    disponible (revenu − charges). Indicatif : la décision revient au comité."""
    montant = credit.montant_propose or credit.montant_demande
    duree = credit.duree_proposee or credit.duree_demandee
    lignes = echeancier.calculer(
        montant=montant,
        taux=credit.produit.taux_interet,
        duree=duree,
        methode=credit.produit.methode,
        periodicite=credit.produit.periodicite,
        depart=timezone.localdate(),
        decimales=credit.devise.decimales,
    )
    echeance = max(ligne.total for ligne in lignes)
    disponible = None
    ratio = None
    if credit.revenu_mensuel is not None:
        disponible = credit.revenu_mensuel - (credit.charges_mensuelles or ZERO)
        if disponible > 0:
            # Une échéance hebdomadaire pèse environ 52/12 fois par mois.
            mensuelle = (
                echeance * Decimal(52) / Decimal(12)
                if credit.produit.periodicite == ProduitCredit.Periodicite.HEBDOMADAIRE
                else echeance
            )
            ratio = (mensuelle / disponible).quantize(Decimal("0.0001"))
    seuil = regles_credit()["taux_endettement_max"]
    return {
        "echeance_max": echeance,
        "revenu_disponible": disponible,
        "taux_endettement": ratio,
        "taux_endettement_max": seuil,
        "depasse": ratio is not None and ratio > seuil,
    }


@transaction.atomic
def analyser(
    credit: Credit,
    utilisateur,
    *,
    avis: str,
    commentaire: str,
    montant_propose,
    duree_proposee: int,
    revenu_mensuel=None,
    charges_mensuelles=None,
) -> Credit:
    """L'agent de crédit consigne son analyse ; elle peut être reprise tant que le comité n'a pas
    statué."""
    credit = _verrouiller(credit, S.SOUMIS, S.ANALYSE)
    if not commentaire.strip():
        raise ErreurMetier("Le commentaire d'analyse est obligatoire.", "commentaire")
    montant_propose = en_decimal(montant_propose)
    controler_conditions(credit.produit, credit.devise, montant_propose, duree_proposee)
    if montant_propose > credit.montant_demande:
        raise ErreurMetier("Le montant proposé ne peut pas dépasser le montant demandé.", "montant")
    credit.avis_analyse = avis
    credit.commentaire_analyse = commentaire.strip()
    credit.montant_propose = montant_propose
    credit.duree_proposee = duree_proposee
    credit.revenu_mensuel = revenu_mensuel
    credit.charges_mensuelles = charges_mensuelles
    credit.analyse_par = utilisateur
    credit.analyse_le = timezone.now()
    return _transition(
        credit, S.ANALYSE, utilisateur, f"Avis {Credit.Avis(avis).label.lower()} : {commentaire}"
    )


@transaction.atomic
def renvoyer(credit: Credit, utilisateur, motif: str) -> Credit:
    """Retour du dossier à la saisie pour complément (avant la décision du comité)."""
    if not motif.strip():
        raise ErreurMetier("Le motif est obligatoire.", "motif")
    credit = _verrouiller(credit, S.SOUMIS, S.ANALYSE)
    return _transition(credit, S.BROUILLON, utilisateur, f"Renvoyé pour complément : {motif}")


@transaction.atomic
def statuer(
    credit: Credit,
    utilisateur,
    *,
    approuver: bool,
    motif: str,
    montant_accorde=None,
    duree_accordee: int | None = None,
) -> Credit:
    """Décision du comité. Contrôle à quatre yeux : ni l'auteur de la demande ni l'analyste."""
    credit = _verrouiller(credit, S.ANALYSE)
    if not motif.strip():
        raise ErreurMetier("Le motif de la décision est obligatoire.", "motif")
    if utilisateur.pk in (credit.cree_par_id, credit.analyse_par_id):
        raise ErreurMetier(
            "Contrôle à quatre yeux : l'auteur de la demande ou de l'analyse ne peut pas statuer.",
            "quatre_yeux",
        )
    credit.motif_decision = motif.strip()
    credit.decide_par = utilisateur
    credit.decide_le = timezone.now()
    if not approuver:
        return _transition(credit, S.REJETE, utilisateur, f"Rejet : {motif}")

    _exiger_eligible(credit)
    montant = en_decimal(montant_accorde or credit.montant_propose or credit.montant_demande)
    duree = duree_accordee or credit.duree_proposee or credit.duree_demandee
    controler_conditions(credit.produit, credit.devise, montant, duree)
    if montant > credit.montant_demande:
        raise ErreurMetier("Le montant accordé ne peut pas dépasser le montant demandé.", "montant")
    credit.montant_accorde = montant
    credit.duree_accordee = duree
    credit.taux_interet = credit.produit.taux_interet
    return _transition(
        credit,
        S.APPROUVE,
        utilisateur,
        f"Approuvé : {montant} {credit.devise_id} en {duree} échéances. {motif}",
    )


@transaction.atomic
def annuler(credit: Credit, utilisateur, motif: str) -> Credit:
    if not motif.strip():
        raise ErreurMetier("Le motif est obligatoire.", "motif")
    credit = _verrouiller(credit, S.BROUILLON, S.SOUMIS, S.ANALYSE, S.APPROUVE)
    return _transition(credit, S.ANNULE, utilisateur, f"Annulation : {motif}")


# --- Décaissement -----------------------------------------------------------------------------


def _compte_membre(credit: Credit, compte: CompteEpargne) -> CompteEpargne:
    compte = CompteEpargne.objects.select_related("produit", "devise").get(pk=compte.pk)
    if compte.membre_id != credit.membre_id:
        raise ErreurMetier("Ce compte d'épargne n'appartient pas au membre.", "compte_epargne")
    if compte.devise_id != credit.devise_id:
        raise ErreurMetier("Le compte d'épargne n'est pas dans la devise du crédit.", "devise")
    if compte.produit.type != ProduitEpargne.Type.VUE:
        raise ErreurMetier("Utilisez un compte d'épargne à vue.", "compte_epargne")
    return compte


@transaction.atomic
def decaisser(
    credit: Credit,
    utilisateur,
    *,
    cle_idempotence: str,
    compte_tresorerie: str = "",
    compte_epargne: CompteEpargne | None = None,
) -> Credit:
    """Verse le crédit (net des frais de dossier) en espèces ou sur le compte d'épargne du membre,
    bloque l'épargne exigée et établit l'échéancier à partir de la date comptable."""
    credit = _verrouiller(credit)
    if credit.statut == S.EN_COURS and (
        credit.ecriture_decaissement.cle_idempotence == cle_idempotence
    ):
        return credit  # même demande rejouée
    credit = _verrouiller(credit, S.APPROUVE)
    if bool(compte_tresorerie) == (compte_epargne is not None):
        raise ErreurMetier(
            "Indiquez soit un compte de trésorerie, soit le compte d'épargne du membre.", "mode"
        )
    _exiger_eligible(credit)  # dont l'épargne exigée, bloquée ci-dessous
    produit, devise = credit.produit, credit.devise
    montant = credit.montant_accorde

    frais = arrondir(montant * produit.frais_dossier_taux, devise.decimales)
    net = montant - frais
    if compte_epargne is not None:
        compte_epargne = _compte_membre(credit, compte_epargne)
        contrepartie, tresorerie = compte_epargne.produit.compte, None
    else:
        tresorerie = caisse.tresorerie(compte_tresorerie, utilisateur, credit.agence)
        caisse.verifier_sortie(tresorerie, devise, net)
        contrepartie = tresorerie.compte

    ecriture = compta.comptabiliser_operation(
        DECAISSEMENT,
        montants={"capital": montant, "frais": frais, "net": net},
        comptes={"TRESORERIE": contrepartie},
        agence=credit.agence,
        devise=devise,
        utilisateur=utilisateur,
        code_produit=produit.code,
        reference=credit.numero,
        piece=credit,
        cle_idempotence=cle_idempotence,
    )
    if compte_epargne is not None:
        epargne.mouvementer(
            compte_epargne,
            type_mouvement=MouvementEpargne.Type.DECAISSEMENT_CREDIT,
            sens=Sens.CREDIT,
            montant=net,
            ecriture=ecriture,
            utilisateur=utilisateur,
        )
    else:
        caisse.tracer(
            tresorerie,
            ecriture,
            sens="SORTIE",
            montant=net,
            utilisateur=utilisateur,
            membre=credit.membre,
        )

    lignes = calculer_echeancier(
        produit,
        devise,
        montant,
        credit.duree_accordee,
        ecriture.date_comptable,
        credit.taux_interet,
    )
    Echeance.objects.bulk_create(
        Echeance(
            credit=credit,
            numero=ligne.numero,
            date=ligne.date,
            capital=ligne.capital,
            interet=ligne.interet,
        )
        for ligne in lignes
    )
    credit.frais_dossier = frais
    credit.epargne_bloquee = epargne_exigee(credit)
    credit.date_decaissement = ecriture.date_comptable
    credit.ecriture_decaissement = ecriture
    credit.decaisse_par = utilisateur
    return _transition(
        credit,
        S.EN_COURS,
        utilisateur,
        f"Décaissé : {net} {devise.code} versés (frais de dossier {frais}).",
    )


# --- Remboursements ---------------------------------------------------------------------------


def actualiser_penalites(credit: Credit, a_date: date) -> None:
    """Ajoute les pénalités courues depuis le dernier calcul sur chaque échéance en retard.

    Pénalité = montant impayé (capital + intérêt) × taux journalier × jours de retard au-delà du
    délai de grâce. Calcul incrémental : appelé avant chaque remboursement (et, en phase 6, par la
    clôture journalière), il ne compte jamais deux fois les mêmes jours.
    """
    produit = credit.produit
    if not produit.taux_penalite_jour:
        return
    decimales = credit.devise.decimales
    for e in credit.echeances.filter(soldee_le__isnull=True, date__lt=a_date):
        debut_penalites = e.date + timedelta(days=produit.jours_grace)
        depuis = max(debut_penalites, e.penalites_calculees_au or debut_penalites)
        jours = (a_date - depuis).days
        impaye = e.capital - e.capital_paye + e.interet - e.interet_paye
        if jours <= 0 or impaye <= 0:
            continue
        e.penalite += arrondir(impaye * produit.taux_penalite_jour * jours, decimales)
        e.penalites_calculees_au = a_date
        e.save(update_fields=["penalite", "penalites_calculees_au"])


def situation(credit: Credit, a_date: date | None = None) -> dict:
    """Encours, impayés et retard d'un crédit à une date (sans enregistrer les pénalités)."""
    a_date = a_date or timezone.localdate()
    echeances = list(credit.echeances.all())
    restantes = [e for e in echeances if e.soldee_le is None]
    echues = [e for e in restantes if e.date < a_date]
    impaye = sum((e.reste_du for e in echues), start=ZERO)
    return {
        "capital_restant": sum((e.capital - e.capital_paye for e in echeances), start=ZERO),
        "interet_restant": sum((e.interet - e.interet_paye for e in echeances), start=ZERO),
        "penalites_dues": sum((e.penalite - e.penalite_payee for e in echeances), start=ZERO),
        "total_du": sum((e.reste_du for e in echeances), start=ZERO),
        "impaye": impaye,
        "echeances_en_retard": len(echues),
        "jours_retard": (a_date - echues[0].date).days if echues else 0,
        "prochaine_echeance": restantes[0].date if restantes else None,
        "prochain_montant": restantes[0].reste_du if restantes else ZERO,
    }


def _imputer(echeances: list[Echeance], montant: Decimal) -> dict[str, Decimal]:
    """Répartit un paiement, échéance par échéance dans l'ordre : pénalités, intérêts, capital.

    Un paiement supérieur aux échéances échues règle les suivantes par anticipation (sans remise
    d'intérêts : la politique de remboursement anticipé viendra avec le paramétrage du crédit).
    """
    reparti = {"penalite": ZERO, "interet": ZERO, "capital": ZERO}
    reste = montant
    for e in echeances:
        for element, du, paye in (
            ("penalite", "penalite", "penalite_payee"),
            ("interet", "interet", "interet_paye"),
            ("capital", "capital", "capital_paye"),
        ):
            part = min(reste, getattr(e, du) - getattr(e, paye))
            if part > 0:
                setattr(e, paye, getattr(e, paye) + part)
                reparti[element] += part
                reste -= part
        if reste == 0:
            break
    return reparti


@transaction.atomic
def rembourser(
    credit: Credit,
    utilisateur,
    *,
    montant,
    cle_idempotence: str,
    compte_tresorerie: str = "",
    compte_epargne: CompteEpargne | None = None,
) -> Remboursement:
    deja = Remboursement.objects.filter(ecriture__cle_idempotence=cle_idempotence).first()
    if deja:
        return deja
    credit = _verrouiller(credit, S.EN_COURS)
    if bool(compte_tresorerie) == (compte_epargne is not None):
        raise ErreurMetier(
            "Indiquez soit un compte de trésorerie, soit le compte d'épargne du membre.", "mode"
        )
    devise = credit.devise
    montant = en_decimal(montant)
    if montant <= 0 or montant != arrondir(montant, devise.decimales):
        raise ErreurMetier("Montant invalide.", "montant")

    jour = core.date_comptable(credit.agence)
    actualiser_penalites(credit, jour)
    echeances = list(credit.echeances.select_for_update().filter(soldee_le__isnull=True))
    total_du = sum((e.reste_du for e in echeances), start=ZERO)
    if montant > total_du:
        raise ErreurMetier(
            f"Le montant dépasse le total restant dû ({total_du} {devise.code}).", "trop_percu"
        )

    if compte_epargne is not None:
        compte_epargne = _compte_membre(credit, compte_epargne)
        epargne.verifier_debit(compte_epargne, montant)
        contrepartie, tresorerie = compte_epargne.produit.compte, None
    else:
        tresorerie = caisse.tresorerie(compte_tresorerie, utilisateur, credit.agence)
        contrepartie = tresorerie.compte

    reparti = _imputer(echeances, montant)
    ecriture = compta.comptabiliser_operation(
        REMBOURSEMENT,
        montants={"total": montant, **reparti},
        comptes={"TRESORERIE": contrepartie},
        agence=credit.agence,
        devise=devise,
        utilisateur=utilisateur,
        code_produit=credit.produit.code,
        reference=credit.numero,
        piece=credit,
        cle_idempotence=cle_idempotence,
    )
    if compte_epargne is not None:
        epargne.mouvementer(
            compte_epargne,
            type_mouvement=MouvementEpargne.Type.REMBOURSEMENT_CREDIT,
            sens=Sens.DEBIT,
            montant=montant,
            ecriture=ecriture,
            utilisateur=utilisateur,
        )
    else:
        caisse.tracer(
            tresorerie,
            ecriture,
            sens="ENTREE",
            montant=montant,
            utilisateur=utilisateur,
            membre=credit.membre,
        )

    for e in echeances:
        if e.reste_du == 0:
            e.soldee_le = ecriture.date_comptable
        e.save(update_fields=["capital_paye", "interet_paye", "penalite_payee", "soldee_le"])
    remboursement = Remboursement.objects.create(
        credit=credit,
        montant=montant,
        date_comptable=ecriture.date_comptable,
        ecriture=ecriture,
        cree_par=utilisateur,
        **reparti,
    )
    if not credit.echeances.filter(soldee_le__isnull=True).exists():
        credit.solde_le = ecriture.date_comptable
        _transition(credit, S.SOLDE, utilisateur, "Crédit entièrement remboursé")
    return remboursement


def controle_sortie_membre(membre: Membre) -> str | None:
    """Une démission suppose qu'aucun crédit n'est en cours ou en instruction."""
    credits = Credit.objects.filter(membre=membre, statut__in=STATUTS_ENGAGES)
    if not credits:
        return None
    return "Crédits en cours ou en instruction : " + ", ".join(c.numero for c in credits) + "."
