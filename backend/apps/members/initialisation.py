from datetime import date

from apps.core.models import Parametre
from apps.members import services

# Valeurs de départ, à remplacer par les conditions réelles (Paramétrage, nouvelle date d'effet).
# Le dépôt initial exigé à l'activation est un paramètre du module épargne.
PARAMETRES = [
    (
        services.PARAMETRE_GROUPE,
        services.DEFAUT_GROUPE,
        "Taille minimale et maximale d'un groupe solidaire (à confirmer)",
    ),
]


def charger_parametrage_membres() -> None:
    """Idempotent : ne remplace jamais un paramètre déjà présent."""
    for cle, valeur, description in PARAMETRES:
        if not Parametre.objects.filter(cle=cle).exists():
            Parametre.objects.create(
                cle=cle, valeur=valeur, date_effet=date(2000, 1, 1), description=description
            )
