from apps.core.models import Agence, Devise

DEVISES = [
    {
        "code": "CDF",
        "nom": "Franc congolais",
        "symbole": "FC",
        "decimales": 2,
        "est_reference": True,
    },
    {
        "code": "USD",
        "nom": "Dollar américain",
        "symbole": "$",
        "decimales": 2,
        "est_reference": False,
    },
]


def charger_referentiel() -> None:
    for devise in DEVISES:
        Devise.objects.get_or_create(code=devise["code"], defaults=devise)
    if not Agence.objects.exists():
        Agence.objects.create(code="AG001", nom="Agence principale", est_siege=True)
