"""Calcul de l'échéancier d'un crédit (sans accès à la base : utilisé par la simulation, le
décaissement et les tests).

- Dégressif : échéances constantes ; l'intérêt de chaque période porte sur le capital restant dû.
- Intérêts fixes (« flat ») : l'intérêt de chaque période porte sur le capital initial.

Les montants sont arrondis à la devise ; la dernière échéance absorbe les écarts d'arrondi du
capital, pour que la somme du capital amorti soit exactement le montant prêté.
"""

import calendar
from collections.abc import Callable
from dataclasses import dataclass
from datetime import date, timedelta
from decimal import Decimal

from apps.core.money import ZERO, arrondir, en_decimal

DEGRESSIF = "DEGRESSIF"
FLAT = "FLAT"
MENSUELLE = "MENSUELLE"
HEBDOMADAIRE = "HEBDOMADAIRE"


@dataclass(frozen=True)
class LigneEcheancier:
    numero: int
    date: date
    capital: Decimal
    interet: Decimal
    total: Decimal
    capital_restant: Decimal


def ajouter_mois(jour: date, mois: int) -> date:
    """Même jour du mois, ramené au dernier jour si le mois est plus court (31/01 + 1 → 28/02)."""
    rang = jour.month - 1 + mois
    annee, mois_cible = jour.year + rang // 12, rang % 12 + 1
    dernier = calendar.monthrange(annee, mois_cible)[1]
    return jour.replace(year=annee, month=mois_cible, day=min(jour.day, dernier))


def date_echeance(depart: date, rang: int, periodicite: str) -> date:
    """Date théorique de la `rang`-ième échéance, toujours calculée depuis le départ (pas de
    dérive d'un mois court sur les suivants)."""
    if periodicite == HEBDOMADAIRE:
        return depart + timedelta(weeks=rang)
    return ajouter_mois(depart, rang)


def calculer(
    *,
    montant,
    taux,
    duree: int,
    methode: str,
    periodicite: str,
    depart: date,
    decimales: int = 2,
    ajuster_date: Callable[[date], date] = lambda jour: jour,
) -> list[LigneEcheancier]:
    """`taux` : taux par période. `ajuster_date` : report sur un jour ouvré."""
    montant, taux = en_decimal(montant), en_decimal(taux)
    if montant <= 0:
        raise ValueError("Le montant doit être positif.")
    if duree < 1:
        raise ValueError("La durée doit être d'au moins une échéance.")
    if taux < 0:
        raise ValueError("Le taux ne peut pas être négatif.")

    if methode == DEGRESSIF:
        annuite = montant / duree if taux == 0 else montant * taux / (1 - (1 + taux) ** -duree)
        annuite = arrondir(annuite, decimales)
    else:
        interet_fixe = arrondir(montant * taux, decimales)
        capital_fixe = arrondir(montant / duree, decimales)

    lignes = []
    restant = montant
    for numero in range(1, duree + 1):
        if methode == DEGRESSIF:
            interet = arrondir(restant * taux, decimales)
            capital = restant if numero == duree else min(annuite - interet, restant)
        else:
            interet = interet_fixe
            capital = restant if numero == duree else min(capital_fixe, restant)
        capital = max(capital, ZERO)
        restant -= capital
        lignes.append(
            LigneEcheancier(
                numero=numero,
                date=ajuster_date(date_echeance(depart, numero, periodicite)),
                capital=capital,
                interet=interet,
                total=capital + interet,
                capital_restant=restant,
            )
        )
    return lignes
