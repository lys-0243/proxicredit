"""Règles de gestion de l'épargne : ouverture des comptes, dépôts et retraits, mouvements générés
par les autres modules (décaissement et remboursement de crédit par le compte du membre).

Un membre a au plus un compte par devise (CDF, USD), ouvert à sa demande ; le premier dépôt, d'un
montant minimum, est la condition de son activation. Une part de l'épargne peut être bloquée en
garantie d'un crédit (`BLOCAGES`).
"""

from collections.abc import Callable
from decimal import Decimal

from django.db import transaction
from django.db.models import Sum

from apps.accounting import services as compta
from apps.accounting.models import Ecriture, Sens
from apps.cash import services as caisse
from apps.core import services as core
from apps.core.exceptions import ErreurMetier
from apps.core.models import Devise
from apps.core.money import ZERO, arrondir, en_decimal
from apps.members.models import Membre
from apps.savings.models import (
    CompteEpargne,
    MouvementEpargne,
    ProduitEpargne,
    SequenceCompteEpargne,
)

# Valeur de départ, à remplacer par les conditions réelles (paramètre daté).
PARAMETRE_DEPOT_INITIAL = "epargne.depot_initial"
DEFAUT_DEPOT_INITIAL = {"CDF": "10000", "USD": "5"}

# Épargne bloquée en garantie : le module crédit enregistre ici (dans son AppConfig.ready) une
# fonction (membre, code devise) → montant bloqué.
BLOCAGES: list[Callable[[Membre, str], Decimal]] = []


def _code(devise: Devise | str) -> str:
    return devise if isinstance(devise, str) else devise.code


def _prochain_numero(agence) -> str:
    sequence, _ = SequenceCompteEpargne.objects.select_for_update().get_or_create(agence=agence)
    sequence.dernier_numero += 1
    sequence.save(update_fields=["dernier_numero"])
    return f"{agence.code}-EP{sequence.dernier_numero:06d}"


def _montant(montant, compte: CompteEpargne) -> Decimal:
    montant = en_decimal(montant)
    if montant <= 0:
        raise ErreurMetier("Le montant doit être strictement positif.", "montant")
    if montant != arrondir(montant, compte.devise.decimales):
        raise ErreurMetier(
            f"Montant non arrondi à {compte.devise.decimales} décimale(s) ({compte.devise}).",
            "arrondi",
        )
    return montant


# --- Ouverture ----------------------------------------------------------------------------


def produit_de_la_devise(devise: Devise | str) -> ProduitEpargne:
    """Produit d'épargne proposé à l'ouverture dans une devise."""
    code = _code(devise)
    produit = (
        ProduitEpargne.objects.filter(devise_id=code, actif=True, type=ProduitEpargne.Type.VUE)
        .order_by("code")
        .first()
    )
    if produit is None:
        raise ErreurMetier(f"Aucun produit d'épargne actif en {code}.", "produit")
    return produit


def compte_de_la_devise(membre: Membre, devise: Devise | str) -> CompteEpargne | None:
    return (
        CompteEpargne.objects.filter(membre=membre, devise_id=_code(devise))
        .exclude(statut=CompteEpargne.Statut.CLOS)
        .first()
    )


@transaction.atomic
def ouvrir_compte(membre: Membre, devise: Devise | str, utilisateur) -> CompteEpargne:
    """Ouvre le compte du membre dans une devise. Possible dès le dossier créé (prospect) : le
    premier dépôt est l'une des conditions de son activation."""
    membre = Membre.objects.select_for_update().get(pk=membre.pk)
    if membre.statut not in (Membre.Statut.PROSPECT, Membre.Statut.ACTIF):
        raise ErreurMetier(
            f"Ouverture impossible : membre {membre.get_statut_display().lower()}.", "statut"
        )
    if membre.en_liste_noire:
        raise ErreurMetier("Membre inscrit sur la liste noire.", "liste_noire")
    produit = produit_de_la_devise(devise)
    if compte_de_la_devise(membre, produit.devise_id):
        raise ErreurMetier(f"Le membre a déjà un compte en {produit.devise_id}.", "compte_existant")
    return CompteEpargne.objects.create(
        numero=_prochain_numero(membre.agence),
        membre=membre,
        produit=produit,
        agence=membre.agence,
        devise=produit.devise,
        date_ouverture=core.date_comptable(membre.agence),
        ouvert_par=utilisateur,
    )


# --- Solde, blocage, disponible -------------------------------------------------------------


def mouvementer(
    compte: CompteEpargne,
    *,
    type_mouvement: str,
    sens: str,
    montant: Decimal,
    ecriture: Ecriture,
    utilisateur,
) -> MouvementEpargne:
    """Met à jour le solde d'un compte pour une écriture déjà comptabilisée (sous verrou).

    Appelé par ce module et par les modules qui mouvementent le compte d'un membre (crédit).
    Idempotent : une écriture rejouée ne mouvemente le compte qu'une fois.
    """
    compte = CompteEpargne.objects.select_for_update().get(pk=compte.pk)
    existant = MouvementEpargne.objects.filter(compte=compte, ecriture=ecriture).first()
    if existant:
        return existant
    if compte.statut == CompteEpargne.Statut.CLOS:
        raise ErreurMetier("Ce compte d'épargne est clos.", "compte_clos")
    nouveau_solde = compte.solde + montant if sens == Sens.CREDIT else compte.solde - montant
    if nouveau_solde < 0:
        raise ErreurMetier(
            f"Solde insuffisant sur le compte {compte.numero} ({compte.solde} {compte.devise_id}).",
            "solde_insuffisant",
        )
    compte.solde = nouveau_solde
    compte.save(update_fields=["solde", "modifie_le"])
    return MouvementEpargne.objects.create(
        compte=compte,
        type=type_mouvement,
        sens=sens,
        montant=montant,
        solde_apres=nouveau_solde,
        libelle=ecriture.libelle,
        ecriture=ecriture,
        date_comptable=ecriture.date_comptable,
        cree_par=utilisateur,
    )


def bloque(membre: Membre, devise: Devise | str) -> Decimal:
    """Épargne du membre bloquée en garantie de ses crédits dans une devise."""
    return sum((blocage(membre, _code(devise)) for blocage in BLOCAGES), start=ZERO)


def disponible(compte: CompteEpargne) -> Decimal:
    """Montant retirable au guichet : solde moins le solde minimum et la part bloquée."""
    if compte.statut != CompteEpargne.Statut.ACTIF or not compte.produit.retrait_libre:
        return ZERO
    retenu = compte.produit.solde_minimum + bloque(compte.membre, compte.devise_id)
    return max(compte.solde - retenu, ZERO)


def epargne_disponible(membre: Membre, devise: Devise | str) -> Decimal:
    """Épargne du membre dans une devise qui n'est pas déjà bloquée par un crédit."""
    solde = (
        CompteEpargne.objects.filter(membre=membre, devise_id=_code(devise))
        .exclude(statut=CompteEpargne.Statut.CLOS)
        .aggregate(t=Sum("solde"))["t"]
        or ZERO
    )
    return max(solde - bloque(membre, devise), ZERO)


def verifier_debit(compte: CompteEpargne, montant: Decimal) -> None:
    """Contrôles d'un débit à l'initiative du membre (retrait, remboursement par son compte)."""
    if compte.statut != CompteEpargne.Statut.ACTIF:
        raise ErreurMetier(
            f"Le compte {compte.numero} est {compte.get_statut_display().lower()}.", "compte_bloque"
        )
    if not compte.produit.retrait_libre:
        raise ErreurMetier(
            f"Aucun retrait possible sur un compte « {compte.produit.libelle} ».",
            "retrait_interdit",
        )
    if montant > disponible(compte):
        garantie = bloque(compte.membre, compte.devise_id)
        detail = f"solde minimum {compte.produit.solde_minimum}" + (
            f", {garantie} bloqués en garantie de crédit" if garantie else ""
        )
        raise ErreurMetier(
            f"Solde disponible insuffisant : {disponible(compte)} {compte.devise_id} ({detail}).",
            "solde_insuffisant",
        )


# --- Opérations au guichet ---------------------------------------------------------------


@transaction.atomic
def deposer(
    compte: CompteEpargne, *, montant, compte_tresorerie: str, utilisateur, cle_idempotence: str
) -> MouvementEpargne:
    deja = MouvementEpargne.objects.filter(ecriture__cle_idempotence=cle_idempotence).first()
    if deja:
        return deja
    compte = CompteEpargne.objects.select_related("produit", "devise", "membre").get(pk=compte.pk)
    if compte.statut == CompteEpargne.Statut.CLOS:
        raise ErreurMetier("Ce compte d'épargne est clos.", "compte_clos")
    montant = _montant(montant, compte)
    tresorerie = caisse.tresorerie(compte_tresorerie, utilisateur, compte.agence)
    ecriture = compta.comptabiliser_operation(
        "EPARGNE_DEPOT",
        montants={"montant": montant},
        comptes={"TRESORERIE": tresorerie.compte, "EPARGNE": compte.produit.compte},
        agence=compte.agence,
        devise=compte.devise,
        utilisateur=utilisateur,
        code_produit=compte.produit.code,
        reference=compte.numero,
        piece=compte,
        cle_idempotence=cle_idempotence,
    )
    caisse.tracer(
        tresorerie,
        ecriture,
        sens="ENTREE",
        montant=montant,
        utilisateur=utilisateur,
        membre=compte.membre,
    )
    return mouvementer(
        compte,
        type_mouvement=MouvementEpargne.Type.DEPOT,
        sens=Sens.CREDIT,
        montant=montant,
        ecriture=ecriture,
        utilisateur=utilisateur,
    )


@transaction.atomic
def deposer_pour_membre(
    membre: Membre,
    *,
    devise: Devise | str,
    montant,
    compte_tresorerie: str,
    utilisateur,
    cle_idempotence: str,
) -> MouvementEpargne:
    """Dépôt au guichet dans une devise ; ouvre le compte s'il n'existe pas (premier dépôt)."""
    deja = MouvementEpargne.objects.filter(ecriture__cle_idempotence=cle_idempotence).first()
    if deja:
        return deja
    compte = compte_de_la_devise(membre, devise) or ouvrir_compte(membre, devise, utilisateur)
    return deposer(
        compte,
        montant=montant,
        compte_tresorerie=compte_tresorerie,
        utilisateur=utilisateur,
        cle_idempotence=cle_idempotence,
    )


@transaction.atomic
def retirer(
    compte: CompteEpargne, *, montant, compte_tresorerie: str, utilisateur, cle_idempotence: str
) -> MouvementEpargne:
    deja = MouvementEpargne.objects.filter(ecriture__cle_idempotence=cle_idempotence).first()
    if deja:
        return deja
    compte = (
        CompteEpargne.objects.select_for_update()
        .select_related("produit", "devise", "membre")
        .get(pk=compte.pk)
    )
    montant = _montant(montant, compte)
    if compte.membre.statut not in (Membre.Statut.ACTIF, Membre.Statut.SUSPENDU):
        raise ErreurMetier("Le dossier du membre n'est pas actif.", "statut")
    verifier_debit(compte, montant)
    tresorerie = caisse.tresorerie(compte_tresorerie, utilisateur, compte.agence)
    caisse.verifier_sortie(tresorerie, compte.devise, montant)
    ecriture = compta.comptabiliser_operation(
        "EPARGNE_RETRAIT",
        montants={"montant": montant},
        comptes={"TRESORERIE": tresorerie.compte, "EPARGNE": compte.produit.compte},
        agence=compte.agence,
        devise=compte.devise,
        utilisateur=utilisateur,
        code_produit=compte.produit.code,
        reference=compte.numero,
        piece=compte,
        cle_idempotence=cle_idempotence,
    )
    caisse.tracer(
        tresorerie,
        ecriture,
        sens="SORTIE",
        montant=montant,
        utilisateur=utilisateur,
        membre=compte.membre,
    )
    return mouvementer(
        compte,
        type_mouvement=MouvementEpargne.Type.RETRAIT,
        sens=Sens.DEBIT,
        montant=montant,
        ecriture=ecriture,
        utilisateur=utilisateur,
    )


@transaction.atomic
def changer_blocage(compte: CompteEpargne, bloquer: bool, motif: str) -> CompteEpargne:
    if not motif.strip():
        raise ErreurMetier("Le motif est obligatoire.", "motif")
    compte = CompteEpargne.objects.select_for_update().get(pk=compte.pk)
    attendu = CompteEpargne.Statut.ACTIF if bloquer else CompteEpargne.Statut.BLOQUE
    if compte.statut != attendu:
        raise ErreurMetier(
            f"Impossible depuis le statut « {compte.get_statut_display()} ».", "statut"
        )
    compte.statut = CompteEpargne.Statut.BLOQUE if bloquer else CompteEpargne.Statut.ACTIF
    compte.motif_blocage = motif.strip() if bloquer else ""
    compte.save(update_fields=["statut", "motif_blocage", "modifie_le"])
    return compte


# --- Contrôles enregistrés auprès du module membres -----------------------------------------


def depots_initiaux(a_date=None) -> dict[str, Decimal]:
    valeur = core.parametre(PARAMETRE_DEPOT_INITIAL, a_date, defaut=DEFAUT_DEPOT_INITIAL)
    return {code: en_decimal(montant) for code, montant in valeur.items()}


def _montant_lisible(montant: Decimal) -> str:
    return f"{montant.normalize():,f}".replace(",", " ")


def condition_depot_initial(membre: Membre) -> str | None:
    """Condition d'activation : un compte du membre atteint le dépôt initial de sa devise (un
    prospect ne peut pas retirer : le solde suffit donc)."""
    minimums = depots_initiaux()
    comptes = CompteEpargne.objects.filter(membre=membre).exclude(statut=CompteEpargne.Statut.CLOS)
    if any(c.devise_id in minimums and c.solde >= minimums[c.devise_id] for c in comptes):
        return None
    attendus = " ou ".join(f"{_montant_lisible(m)} {code}" for code, m in minimums.items())
    return f"Dépôt initial d'au moins {attendus}"


def controle_sortie_membre(membre: Membre) -> str | None:
    """Une démission suppose des comptes d'épargne soldés."""
    comptes = CompteEpargne.objects.filter(membre=membre, solde__gt=0)
    if not comptes:
        return None
    return "Comptes d'épargne non soldés : " + ", ".join(c.numero for c in comptes) + "."
