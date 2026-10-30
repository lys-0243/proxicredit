from datetime import date
from decimal import Decimal

from apps.accounting.initialisation import charger_regles
from apps.accounting.models import CompteComptable
from apps.core.models import Devise, Parametre
from apps.savings import services
from apps.savings.models import ProduitEpargne

# Un produit par devise : le membre a au plus un compte en CDF et un en USD.
# (code, libellé, type, devise, compte, solde minimum, retrait libre)
PRODUITS = [
    ("EPV-CDF", "Épargne CDF", "VUE", "CDF", "4191", "0", True),
    ("EPV-USD", "Épargne USD", "VUE", "USD", "4191", "0", True),
]

# Les règles sont génériques : le compte des dépôts (EPARGNE) est celui du produit.
REGLES = [
    (
        "EPARGNE_DEPOT",
        "EP",
        "Dépôt épargne {reference}",
        [("D", "montant", None, "TRESORERIE"), ("C", "montant", None, "EPARGNE")],
    ),
    (
        "EPARGNE_RETRAIT",
        "EP",
        "Retrait épargne {reference}",
        [("D", "montant", None, "EPARGNE"), ("C", "montant", None, "TRESORERIE")],
    ),
]


def charger_parametrage_epargne() -> None:
    """Idempotent : ne remplace jamais un produit, un paramètre ou une règle déjà présents."""
    for code, libelle, type_, devise, compte, minimum, retrait_libre in PRODUITS:
        ProduitEpargne.objects.get_or_create(
            code=code,
            defaults={
                "libelle": libelle,
                "type": type_,
                "devise": Devise.objects.get(code=devise),
                "compte": CompteComptable.objects.get(numero=compte),
                "solde_minimum": Decimal(minimum),
                "retrait_libre": retrait_libre,
            },
        )
    if not Parametre.objects.filter(cle=services.PARAMETRE_DEPOT_INITIAL).exists():
        Parametre.objects.create(
            cle=services.PARAMETRE_DEPOT_INITIAL,
            valeur=services.DEFAUT_DEPOT_INITIAL,
            date_effet=date(2000, 1, 1),
            description="Premier dépôt minimum par devise pour activer un membre (à confirmer)",
        )
    charger_regles(REGLES)
