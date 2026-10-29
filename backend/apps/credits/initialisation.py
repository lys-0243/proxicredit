from datetime import date
from decimal import Decimal

from apps.accounting.initialisation import charger_regles
from apps.core.models import Devise, Parametre
from apps.credits import services
from apps.credits.models import ProduitCredit

# Conditions de départ, à remplacer par la politique de crédit réelle (à confirmer).
PRODUITS = [
    {
        "code": "EDU",
        "libelle": "Crédit Éducation",
        "description": "Frais scolaires et académiques.",
        "methode": "DEGRESSIF",
        "periodicite": "MENSUELLE",
        "taux_interet": Decimal("0.02"),
        "duree_min": 1,
        "duree_max": 10,
        "frais_dossier_taux": Decimal("0.02"),
        "epargne_garantie_taux": Decimal("0.18"),
        "taux_penalite_jour": Decimal("0.001"),
        "jours_grace": 3,
        "plafonds": {"CDF": ("50000", "5000000"), "USD": ("20", "2000")},
        # Comptes propres au produit : encours sain et intérêts.
        "comptes": ("4111", "7711"),
    },
    {
        "code": "SEC",
        "libelle": "Crédit Secours",
        "description": "Besoins urgents : santé, deuil, imprévus.",
        "methode": "DEGRESSIF",
        "periodicite": "MENSUELLE",
        "taux_interet": Decimal("0.025"),
        "duree_min": 1,
        "duree_max": 6,
        "frais_dossier_taux": Decimal("0.02"),
        "epargne_garantie_taux": Decimal("0.18"),
        "taux_penalite_jour": Decimal("0.001"),
        "jours_grace": 3,
        "plafonds": {"CDF": ("20000", "2000000"), "USD": ("10", "700")},
        "comptes": ("4112", "7712"),
    },
]


def charger_parametrage_credit() -> None:
    """Idempotent : ne remplace jamais un produit, un paramètre ou une règle déjà présents."""
    if not Parametre.objects.filter(cle=services.PARAMETRE_REGLES).exists():
        Parametre.objects.create(
            cle=services.PARAMETRE_REGLES,
            valeur=services.DEFAUT_REGLES,
            date_effet=date(2000, 1, 1),
            description="Crédits simultanés par membre et taux d'endettement maximal (à confirmer)",
        )
    for modele in PRODUITS:
        donnees = dict(modele)
        plafonds = donnees.pop("plafonds")
        compte_encours, compte_interets = donnees.pop("comptes")
        produit, cree = ProduitCredit.objects.get_or_create(
            code=donnees.pop("code"), defaults=donnees
        )
        if cree:
            for devise, (minimum, maximum) in plafonds.items():
                produit.plafonds.create(
                    devise=Devise.objects.get(code=devise),
                    montant_min=Decimal(minimum),
                    montant_max=Decimal(maximum),
                )
        charger_regles(
            services.regles_produit(compte_encours, compte_interets), code_produit=produit.code
        )
