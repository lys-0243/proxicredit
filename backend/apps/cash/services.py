"""Règles de gestion de la caisse : sessions des caissiers, mouvements d'espèces, coffre, comptage.

Les modules métiers (membres, épargne, crédit) n'écrivent jamais directement une opération de
caisse : ils obtiennent le compte qui reçoit ou verse l'argent avec `tresorerie()`, comptabilisent
leur opération, puis la rattachent à la session du caissier avec `tracer()`.
"""

from dataclasses import dataclass
from decimal import Decimal

from django.db import transaction
from django.db.models import Sum
from django.utils import timezone

from apps.accounting import services as compta
from apps.accounting.models import CompteComptable, Ecriture
from apps.cash.models import Caisse, OperationCaisse, SessionCaisse, SoldeSession
from apps.core import services as core
from apps.core.exceptions import ErreurMetier
from apps.core.models import Agence, Devise
from apps.core.money import ZERO, arrondir, en_decimal

# Pour le démarrage, l'argent des membres passe uniquement par les caisses (57). La banque (52) et
# Mobile Money (55) seront ajoutés ici avec la phase 7.
PREFIXES_TRESORERIE = ("57",)
PREFIXE_CAISSE = "57"
COMPTE_ECARTS = "4712"


def _devise(devise: Devise | str) -> Devise:
    return devise if isinstance(devise, Devise) else Devise.objects.get(code=devise)


def _montant_positif(montant, devise: Devise) -> Decimal:
    montant = en_decimal(montant)
    if montant <= 0:
        raise ErreurMetier("Le montant doit être strictement positif.", "montant")
    if montant != arrondir(montant, devise.decimales):
        raise ErreurMetier(
            f"Montant non arrondi à {devise.decimales} décimale(s) ({devise}).", "arrondi"
        )
    return montant


# --- Sessions -------------------------------------------------------------------------


def session_ouverte(utilisateur) -> SessionCaisse | None:
    return (
        SessionCaisse.objects.select_related("caisse__compte", "caisse__agence")
        .filter(caissier=utilisateur, statut=SessionCaisse.Statut.OUVERTE)
        .first()
    )


def controle_sessions_fermees(agence: Agence) -> str | None:
    """Contrôle de fermeture de journée : toutes les caisses de l'agence doivent être fermées."""
    ouvertes = SessionCaisse.objects.filter(
        caisse__agence=agence, statut=SessionCaisse.Statut.OUVERTE
    ).select_related("caisse", "caissier")
    if not ouvertes:
        return None
    detail = ", ".join(f"{s.caisse.code} ({s.caissier})" for s in ouvertes)
    return f"Sessions de caisse encore ouvertes : {detail}."


@transaction.atomic
def ouvrir_session(caisse: Caisse, utilisateur) -> SessionCaisse:
    """Ouvre la session du caissier ; les fonds d'ouverture reprennent le dernier comptage."""
    caisse = Caisse.objects.select_for_update().get(pk=caisse.pk)
    if caisse.type != Caisse.Type.GUICHET or not caisse.active:
        raise ErreurMetier("Seul un guichet actif peut être ouvert.", "caisse")
    if caisse.agence_id != utilisateur.agence_id:
        raise ErreurMetier("Cette caisse n'appartient pas à votre agence.", "agence")
    if session_ouverte(utilisateur):
        raise ErreurMetier("Vous avez déjà une session de caisse ouverte.", "session_ouverte")
    if SessionCaisse.objects.filter(caisse=caisse, statut=SessionCaisse.Statut.OUVERTE).exists():
        raise ErreurMetier("Cette caisse est déjà ouverte par un autre caissier.", "caisse_occupee")
    jour = core.date_comptable(caisse.agence)

    precedente = (
        SessionCaisse.objects.filter(caisse=caisse, statut=SessionCaisse.Statut.FERMEE)
        .order_by("-fermee_le")
        .first()
    )
    reports = {s.devise_id: s.compte for s in precedente.soldes.all()} if precedente else {}
    session = SessionCaisse.objects.create(caisse=caisse, caissier=utilisateur, date_comptable=jour)
    SoldeSession.objects.bulk_create(
        SoldeSession(session=session, devise=devise, ouverture=reports.get(devise.code) or ZERO)
        for devise in Devise.objects.filter(active=True)
    )
    return session


def solde_theorique(session: SessionCaisse, devise: Devise | str) -> Decimal:
    devise = _devise(devise)
    ouverture = (
        SoldeSession.objects.filter(session=session, devise=devise)
        .values_list("ouverture", flat=True)
        .first()
        or ZERO
    )
    totaux = {
        r["sens"]: r["total"]
        for r in session.operations.filter(devise=devise)
        .values("sens")
        .annotate(total=Sum("montant"))
    }
    return (
        ouverture
        + (totaux.get(OperationCaisse.Sens.ENTREE) or ZERO)
        - (totaux.get(OperationCaisse.Sens.SORTIE) or ZERO)
    )


def situation(session: SessionCaisse) -> list[dict]:
    """Par devise : ouverture, entrées, sorties, solde théorique (et comptage si fermée)."""
    lignes = []
    for solde in session.soldes.select_related("devise"):
        totaux = {
            r["sens"]: r["total"]
            for r in session.operations.filter(devise=solde.devise)
            .values("sens")
            .annotate(total=Sum("montant"))
        }
        entrees = totaux.get(OperationCaisse.Sens.ENTREE) or ZERO
        sorties = totaux.get(OperationCaisse.Sens.SORTIE) or ZERO
        lignes.append(
            {
                "devise": solde.devise_id,
                "ouverture": solde.ouverture,
                "entrees": entrees,
                "sorties": sorties,
                "theorique": solde.ouverture + entrees - sorties,
                "compte": solde.compte,
                "ecart": solde.ecart,
            }
        )
    return lignes


@transaction.atomic
def fermer_session(
    session: SessionCaisse, comptages: dict[str, Decimal], utilisateur, commentaire: str = ""
) -> SessionCaisse:
    """Le caissier déclare le comptage de chaque devise. Un écart est comptabilisé en compte
    d'attente (4712) pour être régularisé par l'agence."""
    session = SessionCaisse.objects.select_for_update().select_related("caisse").get(pk=session.pk)
    if session.statut != SessionCaisse.Statut.OUVERTE:
        raise ErreurMetier("Cette session est déjà fermée.", "session_fermee")
    if session.caissier_id != utilisateur.pk:
        raise ErreurMetier("Seul le caissier de la session peut la fermer.", "caissier")
    soldes = list(session.soldes.select_related("devise"))
    manquants = [s.devise_id for s in soldes if s.devise_id not in comptages]
    if manquants:
        raise ErreurMetier(
            f"Comptage manquant pour : {', '.join(manquants)}.", "comptage_incomplet"
        )
    for solde in soldes:
        compte = en_decimal(comptages[solde.devise_id])
        if compte < 0 or compte != arrondir(compte, solde.devise.decimales):
            raise ErreurMetier(f"Comptage {solde.devise_id} invalide.", "comptage")
        theorique = solde_theorique(session, solde.devise)
        ecart = compte - theorique
        if ecart:
            excedent = ecart > 0
            _mouvementer(
                session,
                "CAISSE_EXCEDENT" if excedent else "CAISSE_MANQUANT",
                sens=OperationCaisse.Sens.ENTREE if excedent else OperationCaisse.Sens.SORTIE,
                devise=solde.devise,
                montant=abs(ecart),
                comptes={"CAISSE": session.caisse.compte},
                utilisateur=utilisateur,
                controler_disponible=False,
            )
        solde.theorique, solde.compte, solde.ecart = theorique, compte, ecart
        solde.save(update_fields=["theorique", "compte", "ecart"])
    session.statut = SessionCaisse.Statut.FERMEE
    session.fermee_le = timezone.now()
    session.commentaire = commentaire
    session.save(update_fields=["statut", "fermee_le", "commentaire"])
    return session


# --- Mouvements ------------------------------------------------------------------------


def _verifier_disponible(session: SessionCaisse, devise: Devise, montant: Decimal) -> None:
    disponible = solde_theorique(session, devise)
    if montant > disponible:
        raise ErreurMetier(
            f"Fonds insuffisants en caisse : disponible {disponible} {devise.code}.",
            "caisse_insuffisante",
        )


def _mouvementer(
    session: SessionCaisse,
    type_operation: str,
    *,
    sens: str,
    devise: Devise,
    montant: Decimal,
    comptes: dict,
    utilisateur,
    controler_disponible: bool = True,
    cle_idempotence: str | None = None,
) -> OperationCaisse:
    if sens == OperationCaisse.Sens.SORTIE and controler_disponible:
        _verifier_disponible(session, devise, montant)
    ecriture = compta.comptabiliser_operation(
        type_operation,
        montants={"montant": montant},
        comptes=comptes,
        agence=session.caisse.agence,
        devise=devise,
        utilisateur=utilisateur,
        reference=session.caisse.code,
        piece=session,
        cle_idempotence=cle_idempotence,
    )
    return tracer(session, ecriture, sens=sens, montant=montant, utilisateur=utilisateur)


def _session_a_jour(session: SessionCaisse) -> SessionCaisse:
    session = SessionCaisse.objects.select_for_update().select_related("caisse").get(pk=session.pk)
    if session.statut != SessionCaisse.Statut.OUVERTE:
        raise ErreurMetier("Cette session de caisse est fermée.", "session_fermee")
    return session


def _coffre(agence: Agence) -> Caisse:
    coffre = Caisse.objects.filter(agence=agence, type=Caisse.Type.COFFRE, active=True).first()
    if coffre is None:
        raise ErreurMetier("Aucun coffre actif pour cette agence.", "coffre")
    return coffre


@transaction.atomic
def transferer_coffre(
    session: SessionCaisse,
    *,
    sens: str,
    devise: Devise | str,
    montant,
    utilisateur,
    cle_idempotence: str,
) -> OperationCaisse:
    """Approvisionnement (coffre → guichet, sens ENTREE) ou délestage (guichet → coffre, SORTIE),
    exécuté par le responsable du coffre, distinct du caissier."""
    existante = OperationCaisse.objects.filter(ecriture__cle_idempotence=cle_idempotence).first()
    if existante:
        return existante
    session = _session_a_jour(session)
    if session.caissier_id == utilisateur.pk:
        raise ErreurMetier(
            "Contrôle à quatre yeux : le caissier ne mouvemente pas lui-même le coffre.",
            "quatre_yeux",
        )
    devise = _devise(devise)
    montant = _montant_positif(montant, devise)
    coffre = _coffre(session.caisse.agence)
    approvisionnement = sens == OperationCaisse.Sens.ENTREE
    if approvisionnement:
        disponible = compta.solde(coffre.compte, devise, agence=coffre.agence)
        if montant > disponible:
            raise ErreurMetier(
                f"Fonds insuffisants au coffre : disponible {disponible} {devise.code}.",
                "coffre_insuffisant",
            )
    return _mouvementer(
        session,
        "CAISSE_APPROVISIONNEMENT" if approvisionnement else "CAISSE_DELESTAGE",
        sens=sens,
        devise=devise,
        montant=montant,
        comptes={"CAISSE": session.caisse.compte, "COFFRE": coffre.compte},
        utilisateur=utilisateur,
        cle_idempotence=cle_idempotence,
    )


# --- Point d'entrée des modules métiers --------------------------------------------------


@dataclass(frozen=True)
class Tresorerie:
    """Compte qui reçoit ou verse l'argent, et session de caisse s'il s'agit d'espèces."""

    compte: CompteComptable
    session: SessionCaisse | None


def tresorerie(numero_compte: str, utilisateur, agence: Agence) -> Tresorerie:
    compte = CompteComptable.objects.filter(numero=numero_compte).first()
    if (
        compte is None
        or not compte.numero.startswith(PREFIXES_TRESORERIE)
        or not compte.est_mouvementable
        or not compte.actif
    ):
        raise ErreurMetier(
            "Pour l'instant, les opérations se font uniquement en espèces, à la caisse.",
            "compte_tresorerie",
        )
    if not compte.numero.startswith(PREFIXE_CAISSE):
        return Tresorerie(compte, None)
    session = session_ouverte(utilisateur)
    if session is None:
        raise ErreurMetier(
            "Opération en espèces : ouvrez d'abord votre session de caisse.", "session_requise"
        )
    if session.caisse.agence_id != agence.pk:
        raise ErreurMetier(
            "Votre caisse appartient à une autre agence que celle du membre.", "agence"
        )
    if session.caisse.compte_id != compte.pk:
        raise ErreurMetier(
            f"Votre caisse utilise le compte {session.caisse.compte.numero}.", "compte_tresorerie"
        )
    return Tresorerie(compte, session)


def verifier_sortie(tresorerie: Tresorerie, devise: Devise | str, montant: Decimal) -> None:
    """À appeler avant de comptabiliser un paiement en espèces (retrait, décaissement)."""
    if tresorerie.session is not None:
        _verifier_disponible(tresorerie.session, _devise(devise), montant)


def tracer(
    session_ou_tresorerie: SessionCaisse | Tresorerie | None,
    ecriture: Ecriture,
    *,
    sens: str,
    montant: Decimal,
    utilisateur,
    membre=None,
) -> OperationCaisse | None:
    """Rattache une écriture déjà comptabilisée à la session de caisse (rien hors espèces).
    Idempotent : une écriture rejouée n'est tracée qu'une fois."""
    session = (
        session_ou_tresorerie.session
        if isinstance(session_ou_tresorerie, Tresorerie)
        else session_ou_tresorerie
    )
    if session is None:
        return None
    if session.statut != SessionCaisse.Statut.OUVERTE:
        raise ErreurMetier("Cette session de caisse est fermée.", "session_fermee")
    operation, _ = OperationCaisse.objects.get_or_create(
        ecriture=ecriture,
        defaults={
            "session": session,
            "type_operation": ecriture.type_operation,
            "sens": sens,
            "devise_id": ecriture.devise_id,
            "montant": montant,
            "libelle": ecriture.libelle,
            "membre": membre,
            "cree_par": utilisateur,
        },
    )
    return operation
