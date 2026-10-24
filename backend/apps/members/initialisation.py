from datetime import date

from apps.accounting.models import CompteComptable, Journal, RegleComptable
from apps.core.models import Parametre
from apps.members import services

# Valeurs de départ, à remplacer par les conditions réelles (Paramétrage, nouvelle date d'effet).
PARAMETRES = [
    (
        services.PARAMETRE_ADHESION,
        services.DEFAUT_ADHESION,
        "Frais d'adhésion, valeur et nombre minimum de parts sociales (à confirmer)",
    ),
    (
        services.PARAMETRE_GROUPE,
        services.DEFAUT_GROUPE,
        "Taille minimale et maximale d'un groupe solidaire (à confirmer)",
    ),
]

# (type d'opération, journal, libellé, [(sens, élément, compte fixe ou None, compte variable)])
REGLES = [
    (
        "MEMBRE_ADHESION",
        "CA",
        "Adhésion membre {reference}",
        [
            ("D", "total", None, "TRESORERIE"),
            ("C", "frais", "7062", ""),
            ("C", "parts", "1013", ""),
        ],
    ),
    (
        "MEMBRE_PARTS_SOCIALES",
        "CA",
        "Parts sociales membre {reference}",
        [
            ("D", "montant", None, "TRESORERIE"),
            ("C", "montant", "1013", ""),
        ],
    ),
]


def charger_parametrage_membres() -> None:
    """Idempotent : ne remplace jamais un paramètre ou une règle déjà présents."""
    for cle, valeur, description in PARAMETRES:
        if not Parametre.objects.filter(cle=cle).exists():
            Parametre.objects.create(
                cle=cle, valeur=valeur, date_effet=date(2000, 1, 1), description=description
            )
    for type_operation, journal, libelle, lignes in REGLES:
        regle, cree = RegleComptable.objects.get_or_create(
            type_operation=type_operation,
            code_produit="",
            devise=None,
            defaults={"journal": Journal.objects.get(code=journal), "libelle": libelle},
        )
        if cree:
            for ordre, (sens, element, compte, variable) in enumerate(lignes, start=1):
                regle.lignes.create(
                    ordre=ordre,
                    sens=sens,
                    element=element,
                    compte=CompteComptable.objects.get(numero=compte) if compte else None,
                    compte_variable=variable,
                )
