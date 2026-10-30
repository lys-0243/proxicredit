from apps.accounting.initialisation import charger_regles
from apps.accounting.models import CompteComptable
from apps.cash.models import Caisse
from apps.core.models import Agence

# (type d'opération, journal, libellé, [(sens, élément, compte fixe ou None, compte variable)])
REGLES = [
    (
        "CAISSE_APPROVISIONNEMENT",
        "CA",
        "Approvisionnement caisse {reference}",
        [("D", "montant", None, "CAISSE"), ("C", "montant", None, "COFFRE")],
    ),
    (
        "CAISSE_DELESTAGE",
        "CA",
        "Délestage caisse {reference}",
        [("D", "montant", None, "COFFRE"), ("C", "montant", None, "CAISSE")],
    ),
    (
        "CAISSE_MANQUANT",
        "CA",
        "Manquant de caisse {reference}",
        [("D", "montant", "4712", ""), ("C", "montant", None, "CAISSE")],
    ),
    (
        "CAISSE_EXCEDENT",
        "CA",
        "Excédent de caisse {reference}",
        [("D", "montant", None, "CAISSE"), ("C", "montant", "4712", "")],
    ),
]


def charger_parametrage_caisse() -> None:
    """Règles comptables et, pour chaque agence qui n'en a pas, un coffre et un premier guichet."""
    charger_regles(REGLES)
    coffre = CompteComptable.objects.get(numero="5711")
    guichet = CompteComptable.objects.get(numero="5712")
    for agence in Agence.objects.filter(active=True, caisses__isnull=True):
        Caisse.objects.create(
            agence=agence, code="COFFRE", libelle="Coffre", type=Caisse.Type.COFFRE, compte=coffre
        )
        Caisse.objects.create(agence=agence, code="G01", libelle="Guichet 1", compte=guichet)
