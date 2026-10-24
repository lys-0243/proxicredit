"""Utilitaires monétaires. Règle absolue : Decimal partout, jamais float."""

from decimal import ROUND_HALF_UP, Decimal

ZERO = Decimal("0")


def en_decimal(valeur) -> Decimal:
    if isinstance(valeur, float):
        raise TypeError("Les montants ne doivent jamais être des float.")
    return valeur if isinstance(valeur, Decimal) else Decimal(str(valeur))


def arrondir(montant, decimales: int = 2) -> Decimal:
    """Arrondi commercial (demi supérieur) au nombre de décimales de la devise."""
    pas = Decimal(1).scaleb(-decimales)
    return en_decimal(montant).quantize(pas, rounding=ROUND_HALF_UP)
