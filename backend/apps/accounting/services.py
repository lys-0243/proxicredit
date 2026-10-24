"""Point d'entrée unique de toute écriture comptable.

Les modules métiers (crédits, épargne, caisse, mobile money...) n'écrivent jamais directement dans
les tables comptables : ils appellent `comptabiliser_operation()` (règles paramétrées) ou
`comptabiliser()` (lignes explicites).
"""

from dataclasses import dataclass
from datetime import date
from decimal import Decimal

from django.contrib.contenttypes.models import ContentType
from django.db import transaction
from django.db.models import Q, Sum
from django.utils import timezone

from apps.accounting.models import (
    CompteComptable,
    Ecriture,
    Journal,
    LigneEcriture,
    RegleComptable,
    Sens,
    SequenceEcriture,
)
from apps.core import services as core
from apps.core.exceptions import ErreurMetier
from apps.core.models import Agence, Devise
from apps.core.money import ZERO, arrondir, en_decimal


@dataclass(frozen=True)
class Ligne:
    compte: CompteComptable | str  # objet ou numéro de compte
    debit: Decimal = ZERO
    credit: Decimal = ZERO
    libelle: str = ""


def _compte(compte: CompteComptable | str) -> CompteComptable:
    if isinstance(compte, CompteComptable):
        return compte
    try:
        return CompteComptable.objects.get(numero=compte)
    except CompteComptable.DoesNotExist:
        raise ErreurMetier(f"Compte comptable {compte} introuvable.", "compte_inconnu") from None


def _journal(journal: Journal | str) -> Journal:
    return journal if isinstance(journal, Journal) else Journal.objects.get(code=journal)


def _controler_montants(debit: Decimal, credit: Decimal, devise: Devise) -> None:
    """Contrôle d'une ligne avant insertion (la base arrondirait silencieusement)."""
    for montant in (debit, credit):
        if montant < 0:
            raise ErreurMetier("Les montants doivent être positifs.", "montant_negatif")
        if montant != arrondir(montant, devise.decimales):
            raise ErreurMetier(
                f"Montant {montant} non arrondi à {devise.decimales} décimale(s) ({devise}).",
                "arrondi",
            )
    if (debit > 0) == (credit > 0):
        raise ErreurMetier(
            "Chaque ligne porte soit un débit, soit un crédit (strictement positif).",
            "ligne_invalide",
        )


def _controler_lignes(lignes: list[LigneEcriture], devise: Devise) -> None:
    if len(lignes) < 2:
        raise ErreurMetier("Une écriture comporte au moins deux lignes.", "desequilibre")
    total_debit = total_credit = ZERO
    for ligne in lignes:
        _controler_montants(ligne.debit, ligne.credit, devise)
        compte = ligne.compte
        if not compte.actif or not compte.est_mouvementable:
            raise ErreurMetier(f"Le compte {compte.numero} n'est pas mouvementable.", "compte")
        if compte.devise_id and compte.devise_id != devise.code:
            raise ErreurMetier(
                f"Le compte {compte.numero} n'accepte que la devise {compte.devise_id}.", "compte"
            )
        total_debit += ligne.debit
        total_credit += ligne.credit
    if total_debit != total_credit:
        raise ErreurMetier(
            f"Écriture déséquilibrée : débit {total_debit} ≠ crédit {total_credit}.", "desequilibre"
        )


def _numeroter(journal: Journal, annee: int) -> str:
    sequence, _ = SequenceEcriture.objects.select_for_update().get_or_create(
        journal=journal, annee=annee
    )
    sequence.dernier_numero += 1
    sequence.save(update_fields=["dernier_numero"])
    return f"{journal.code}-{annee}-{sequence.dernier_numero:06d}"


@transaction.atomic
def creer_brouillon(
    *,
    journal: Journal | str,
    agence: Agence,
    devise: Devise | str,
    libelle: str,
    lignes: list[Ligne],
    utilisateur,
    type_operation: str = Ecriture.SAISIE_MANUELLE,
    reference: str = "",
    piece=None,
    cle_idempotence: str | None = None,
) -> Ecriture:
    devise = devise if isinstance(devise, Devise) else Devise.objects.get(code=devise)
    ecriture = Ecriture.objects.create(
        journal=_journal(journal),
        agence=agence,
        devise=devise,
        libelle=libelle,
        type_operation=type_operation,
        reference=reference,
        piece_type=ContentType.objects.get_for_model(piece) if piece is not None else None,
        piece_id=piece.pk if piece is not None else None,
        cle_idempotence=cle_idempotence,
        cree_par=utilisateur,
    )
    remplacer_lignes(ecriture, lignes)
    return ecriture


def remplacer_lignes(ecriture: Ecriture, lignes: list[Ligne]) -> None:
    if ecriture.statut != Ecriture.Statut.BROUILLON:
        raise ErreurMetier("Seul un brouillon peut être modifié.", "immuable")
    nouvelles = []
    for ligne in lignes:
        debit, credit = en_decimal(ligne.debit), en_decimal(ligne.credit)
        _controler_montants(debit, credit, ecriture.devise)
        nouvelles.append(
            LigneEcriture(
                ecriture=ecriture,
                compte=_compte(ligne.compte),
                libelle=ligne.libelle or ecriture.libelle,
                debit=debit,
                credit=credit,
            )
        )
    ecriture.lignes.all().delete()
    LigneEcriture.objects.bulk_create(nouvelles)


@transaction.atomic
def valider(ecriture: Ecriture, utilisateur, *, quatre_yeux: bool = True) -> Ecriture:
    """Contrôle et passe l'écriture au grand livre, à la date comptable ouverte de l'agence.

    `quatre_yeux` : le validateur doit être différent de l'auteur (saisies manuelles et
    contre-passations). Les écritures automatiques des modules ont déjà été validées en amont.
    """
    ecriture = Ecriture.objects.select_for_update().get(pk=ecriture.pk)
    if ecriture.statut != Ecriture.Statut.BROUILLON:
        raise ErreurMetier("Cette écriture est déjà validée.", "deja_validee")
    if quatre_yeux and ecriture.cree_par_id == utilisateur.pk:
        raise ErreurMetier(
            "Contrôle à quatre yeux : l'auteur ne peut pas valider sa propre écriture.",
            "quatre_yeux",
        )
    if not ecriture.journal.actif:
        raise ErreurMetier(f"Le journal {ecriture.journal.code} est inactif.", "journal")

    lignes = list(ecriture.lignes.select_related("compte"))
    _controler_lignes(lignes, ecriture.devise)

    jour = core.date_comptable(ecriture.agence)
    ecriture.date_comptable = jour
    ecriture.taux_reference = core.taux_reference(ecriture.devise, jour)
    ecriture.numero = _numeroter(ecriture.journal, jour.year)
    ecriture.statut = Ecriture.Statut.VALIDEE
    ecriture.valide_par = utilisateur
    ecriture.valide_le = timezone.now()
    ecriture.save()
    return ecriture


@transaction.atomic
def comptabiliser(
    *,
    journal: Journal | str,
    agence: Agence,
    devise: Devise | str,
    libelle: str,
    lignes: list[Ligne],
    utilisateur,
    type_operation: str,
    reference: str = "",
    piece=None,
    cle_idempotence: str | None = None,
) -> Ecriture:
    """Écriture automatique d'un module métier : créée et validée en une seule transaction.

    Idempotente : avec une `cle_idempotence` déjà utilisée, renvoie l'écriture existante.
    """
    if cle_idempotence:
        existante = Ecriture.objects.filter(cle_idempotence=cle_idempotence).first()
        if existante:
            return existante
    ecriture = creer_brouillon(
        journal=journal,
        agence=agence,
        devise=devise,
        libelle=libelle,
        lignes=lignes,
        utilisateur=utilisateur,
        type_operation=type_operation,
        reference=reference,
        piece=piece,
        cle_idempotence=cle_idempotence,
    )
    return valider(ecriture, utilisateur, quatre_yeux=False)


def trouver_regle(type_operation: str, code_produit: str, devise: Devise | str) -> RegleComptable:
    code_devise = devise if isinstance(devise, str) else devise.code
    candidates = RegleComptable.objects.filter(
        Q(code_produit=code_produit) | Q(code_produit=""),
        Q(devise_id=code_devise) | Q(devise__isnull=True),
        type_operation=type_operation,
        actif=True,
    ).prefetch_related("lignes__compte")

    def precision(regle):
        return (regle.code_produit != "", regle.devise_id is not None)

    regles = sorted(candidates, key=precision, reverse=True)
    if not regles:
        raise ErreurMetier(
            f"Aucune règle de comptabilisation pour « {type_operation} » "
            f"(produit {code_produit or '*'}, devise {code_devise}).",
            "regle_manquante",
        )
    return regles[0]


@transaction.atomic
def comptabiliser_operation(
    type_operation: str,
    *,
    montants: dict[str, Decimal],
    agence: Agence,
    devise: Devise | str,
    utilisateur,
    comptes: dict[str, CompteComptable | str] | None = None,
    code_produit: str = "",
    reference: str = "",
    piece=None,
    cle_idempotence: str | None = None,
) -> Ecriture:
    """Comptabilise une opération métier selon sa règle paramétrée.

    `montants` : montant par élément de la règle (les éléments nuls ou absents sont ignorés).
    `comptes` : comptes variables (ex. {"CAISSE": compte_de_la_caisse}).
    """
    regle = trouver_regle(type_operation, code_produit, devise)
    comptes = comptes or {}
    lignes = []
    for modele in regle.lignes.all():
        montant = en_decimal(montants.get(modele.element, ZERO))
        if montant == 0:
            continue
        if modele.compte_variable:
            if modele.compte_variable not in comptes:
                raise ErreurMetier(
                    f"Compte variable « {modele.compte_variable} » non fourni pour "
                    f"« {type_operation} ».",
                    "compte_variable",
                )
            compte = comptes[modele.compte_variable]
        else:
            compte = modele.compte
        lignes.append(
            Ligne(
                compte=compte,
                debit=montant if modele.sens == Sens.DEBIT else ZERO,
                credit=montant if modele.sens == Sens.CREDIT else ZERO,
                libelle=modele.libelle,
            )
        )
    return comptabiliser(
        journal=regle.journal,
        agence=agence,
        devise=devise,
        libelle=regle.libelle.format(reference=reference),
        lignes=lignes,
        utilisateur=utilisateur,
        type_operation=type_operation,
        reference=reference,
        piece=piece,
        cle_idempotence=cle_idempotence,
    )


@transaction.atomic
def contre_passer(
    ecriture: Ecriture, utilisateur, motif: str, *, depuis_module: bool = False
) -> Ecriture:
    """Prépare la contre-passation (lignes inversées) d'une écriture validée.

    Le brouillon produit doit être validé par un autre utilisateur (quatre yeux). Les écritures
    générées par un module métier ne sont contre-passées que par ce module (`depuis_module`), pour
    que le sous-ledger (crédit, compte membre...) reste cohérent.
    """
    if not motif.strip():
        raise ErreurMetier("Le motif de contre-passation est obligatoire.", "motif")
    ecriture = Ecriture.objects.select_for_update().get(pk=ecriture.pk)
    if ecriture.statut != Ecriture.Statut.VALIDEE:
        raise ErreurMetier("Seule une écriture validée peut être contre-passée.", "non_validee")
    if not depuis_module and ecriture.type_operation not in (
        Ecriture.SAISIE_MANUELLE,
        Ecriture.CONTRE_PASSATION,
    ):
        raise ErreurMetier(
            "Cette écriture provient d'une opération métier : annulez l'opération dans son module.",
            "ecriture_module",
        )
    if Ecriture.objects.filter(contre_passation_de=ecriture).exists():
        raise ErreurMetier("Cette écriture a déjà été contre-passée.", "deja_contre_passee")

    inverse = creer_brouillon(
        journal=ecriture.journal,
        agence=ecriture.agence,
        devise=ecriture.devise,
        libelle=f"Contre-passation {ecriture.numero} : {motif}"[:255],
        lignes=[
            Ligne(
                compte=ligne.compte, debit=ligne.credit, credit=ligne.debit, libelle=ligne.libelle
            )
            for ligne in ecriture.lignes.select_related("compte")
        ],
        utilisateur=utilisateur,
        type_operation=Ecriture.CONTRE_PASSATION,
        reference=ecriture.numero,
    )
    inverse.contre_passation_de = ecriture
    inverse.save(update_fields=["contre_passation_de"])
    return inverse


# --- Consultation ------------------------------------------------------------------


def _lignes_validees(*, devise=None, agence=None, du: date | None = None, au: date | None = None):
    qs = LigneEcriture.objects.filter(ecriture__statut=Ecriture.Statut.VALIDEE)
    if devise is not None:
        qs = qs.filter(ecriture__devise=devise)
    if agence is not None:
        qs = qs.filter(ecriture__agence=agence)
    if du is not None:
        qs = qs.filter(ecriture__date_comptable__gte=du)
    if au is not None:
        qs = qs.filter(ecriture__date_comptable__lte=au)
    return qs


def solde(compte: CompteComptable | str, devise, *, agence=None, au: date | None = None) -> Decimal:
    """Solde débiteur (positif) ou créditeur (négatif) d'un compte dans une devise."""
    t = (
        _lignes_validees(devise=devise, agence=agence, au=au)
        .filter(compte=_compte(compte))
        .aggregate(d=Sum("debit"), c=Sum("credit"))
    )
    return (t["d"] or ZERO) - (t["c"] or ZERO)


def balance(devise, *, agence=None, du: date | None = None, au: date | None = None) -> list[dict]:
    """Balance générale d'une devise : solde d'ouverture, mouvements de la période, solde final."""

    def par_compte(qs):
        return {
            r["compte"]: r for r in qs.values("compte").annotate(d=Sum("debit"), c=Sum("credit"))
        }

    ouverture = (
        par_compte(
            _lignes_validees(devise=devise, agence=agence).filter(ecriture__date_comptable__lt=du)
        )
        if du
        else {}
    )
    periode = par_compte(_lignes_validees(devise=devise, agence=agence, du=du, au=au))
    comptes = CompteComptable.objects.filter(pk__in=set(ouverture) | set(periode))

    lignes = []
    for compte in comptes.order_by("numero"):
        o = ouverture.get(compte.pk, {})
        p = periode.get(compte.pk, {})
        solde_ouverture = (o.get("d") or ZERO) - (o.get("c") or ZERO)
        debit, credit = p.get("d") or ZERO, p.get("c") or ZERO
        solde_final = solde_ouverture + debit - credit
        lignes.append(
            {
                "compte": compte.numero,
                "libelle": compte.libelle,
                "classe": compte.classe,
                "solde_ouverture": solde_ouverture,
                "debit": debit,
                "credit": credit,
                "solde_debiteur": solde_final if solde_final > 0 else ZERO,
                "solde_crediteur": -solde_final if solde_final < 0 else ZERO,
            }
        )
    return lignes


COLONNES_BALANCE = ("solde_ouverture", "debit", "credit", "solde_debiteur", "solde_crediteur")


def totaliser(lignes: list[dict]) -> dict:
    """Totaux (en Decimal) des colonnes d'une balance : par classe ou général."""
    return {col: sum((ligne[col] for ligne in lignes), start=ZERO) for col in COLONNES_BALANCE}


def grand_livre(
    compte: CompteComptable | str,
    devise,
    *,
    agence=None,
    du: date | None = None,
    au: date | None = None,
) -> dict:
    compte = _compte(compte)
    report = ZERO
    if du:
        t = (
            _lignes_validees(devise=devise, agence=agence)
            .filter(compte=compte, ecriture__date_comptable__lt=du)
            .aggregate(d=Sum("debit"), c=Sum("credit"))
        )
        report = (t["d"] or ZERO) - (t["c"] or ZERO)
    mouvements = []
    cumul = report
    qs = (
        _lignes_validees(devise=devise, agence=agence, du=du, au=au)
        .filter(compte=compte)
        .select_related("ecriture")
        .order_by("ecriture__date_comptable", "ecriture__id", "id")
    )
    for ligne in qs:
        cumul += ligne.debit - ligne.credit
        mouvements.append(
            {
                "date": ligne.ecriture.date_comptable,
                "numero": ligne.ecriture.numero,
                "ecriture_id": ligne.ecriture_id,
                "libelle": ligne.libelle,
                "debit": ligne.debit,
                "credit": ligne.credit,
                "solde": cumul,
            }
        )
    return {
        "compte": compte.numero,
        "libelle": compte.libelle,
        "report": report,
        "mouvements": mouvements,
        "solde_final": cumul,
    }
