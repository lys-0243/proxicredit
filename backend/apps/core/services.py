from datetime import date, timedelta
from decimal import Decimal

from django.db import transaction
from django.db.models import Q
from django.utils import timezone

from apps.core.exceptions import ErreurMetier
from apps.core.models import Agence, Devise, JourFerie, JourneeComptable, Parametre, TauxChange

_ABSENT = object()


# --- Journée comptable --------------------------------------------------------


def journee_ouverte(agence: Agence) -> JourneeComptable | None:
    return JourneeComptable.objects.filter(
        agence=agence, statut=JourneeComptable.Statut.OUVERTE
    ).first()


def date_comptable(agence: Agence) -> date:
    """Date comptable courante de l'agence. Lève une erreur si aucune journée n'est ouverte."""
    journee = journee_ouverte(agence)
    if journee is None:
        raise ErreurMetier(
            f"Aucune journée comptable ouverte pour l'agence {agence.code}.", "journee_fermee"
        )
    return journee.date


@transaction.atomic
def ouvrir_journee(agence: Agence, a_date: date, utilisateur) -> JourneeComptable:
    Agence.objects.select_for_update().get(pk=agence.pk)
    if journee_ouverte(agence):
        raise ErreurMetier(
            "Une journée est déjà ouverte pour cette agence.", "journee_deja_ouverte"
        )
    derniere = JourneeComptable.objects.filter(agence=agence).order_by("-date").first()
    if derniere and a_date <= derniere.date:
        raise ErreurMetier(
            f"La date doit être postérieure à la dernière journée ({derniere.date:%d/%m/%Y}).",
            "date_anterieure",
        )
    return JourneeComptable.objects.create(agence=agence, date=a_date, ouverte_par=utilisateur)


@transaction.atomic
def fermer_journee(agence: Agence, utilisateur) -> JourneeComptable:
    journee = (
        JourneeComptable.objects.select_for_update()
        .filter(agence=agence, statut=JourneeComptable.Statut.OUVERTE)
        .first()
    )
    if journee is None:
        raise ErreurMetier("Aucune journée ouverte à fermer.", "journee_fermee")
    # Les contrôles de clôture (caisses fermées, cohérence grand livre...) s'ajouteront ici
    # au fil des modules (phase 6 : clôture journalière complète).
    journee.statut = JourneeComptable.Statut.FERMEE
    journee.fermee_par = utilisateur
    journee.fermee_le = timezone.now()
    journee.save(update_fields=["statut", "fermee_par", "fermee_le"])
    return journee


# --- Calendrier ----------------------------------------------------------------


def est_ferie(jour: date) -> bool:
    return JourFerie.objects.filter(
        Q(date=jour) | Q(recurrent=True, date__day=jour.day, date__month=jour.month)
    ).exists()


def est_jour_ouvre(jour: date) -> bool:
    return jour.weekday() != 6 and not est_ferie(jour)  # dimanche non ouvré


def jour_ouvre_suivant(jour: date) -> date:
    while not est_jour_ouvre(jour):
        jour += timedelta(days=1)
    return jour


# --- Paramètres ----------------------------------------------------------------


def parametre(cle: str, a_date: date | None = None, defaut=_ABSENT):
    a_date = a_date or timezone.localdate()
    p = Parametre.objects.filter(cle=cle, date_effet__lte=a_date).order_by("-date_effet").first()
    if p is not None:
        return p.valeur
    if defaut is _ABSENT:
        raise ErreurMetier(f"Paramètre « {cle} » non défini au {a_date:%d/%m/%Y}.", "parametre")
    return defaut


# --- Change ----------------------------------------------------------------------


def taux_reference(devise: Devise | str, a_date: date) -> Decimal:
    """Taux pour convertir 1 unité de `devise` en devise de référence."""
    code = devise if isinstance(devise, str) else devise.code
    reference = Devise.reference()
    if code == reference.code:
        return Decimal("1")
    taux = TauxChange.objects.en_vigueur(code, reference.code, a_date)
    if taux is None:
        raise ErreurMetier(
            f"Aucun taux de change {code}/{reference.code} saisi au {a_date:%d/%m/%Y}.",
            "taux_manquant",
        )
    return taux.taux_reference
