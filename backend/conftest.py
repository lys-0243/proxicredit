from datetime import date
from decimal import Decimal

import pytest
from rest_framework.test import APIClient

from apps.accounting.initialisation import charger_plan_comptable
from apps.accounts.models import Utilisateur
from apps.accounts.roles import synchroniser_roles
from apps.core.initialisation import charger_referentiel
from apps.core.models import Agence, Devise, TauxChange

JOUR = date(2026, 10, 1)
MOT_DE_PASSE = "Motdepasse-solide-2026"


@pytest.fixture(autouse=True)
def referentiel(db):
    charger_referentiel()
    charger_plan_comptable()
    synchroniser_roles()


@pytest.fixture
def agence(db) -> Agence:
    return Agence.objects.get(code="AG001")


@pytest.fixture
def autre_agence(db) -> Agence:
    return Agence.objects.create(code="AG002", nom="Agence de Limete")


@pytest.fixture
def cdf(db) -> Devise:
    return Devise.objects.get(code="CDF")


@pytest.fixture
def usd(db) -> Devise:
    return Devise.objects.get(code="USD")


@pytest.fixture
def creer_utilisateur(db, agence):
    compteur = iter(range(1, 10_000))

    def fabrique(*roles: str, agence_=None, **champs) -> Utilisateur:
        user = Utilisateur.objects.create_user(
            username=champs.pop("username", f"user{next(compteur)}"),
            password=MOT_DE_PASSE,
            agence=agence_ or agence,
            **champs,
        )
        from django.contrib.auth.models import Group

        user.groups.set(Group.objects.filter(name__in=roles))
        return user

    return fabrique


@pytest.fixture
def directeur(creer_utilisateur):
    return creer_utilisateur("DIRECTEUR", username="directeur", otp_active=True)


@pytest.fixture
def comptable(creer_utilisateur):
    return creer_utilisateur("COMPTABLE", username="comptable", otp_active=True)


@pytest.fixture
def comptable2(creer_utilisateur):
    return creer_utilisateur("COMPTABLE", username="comptable2", otp_active=True)


@pytest.fixture
def journee(agence, directeur):
    from apps.core.services import ouvrir_journee

    return ouvrir_journee(agence, JOUR, directeur)


@pytest.fixture
def taux_usd(usd, cdf, directeur):
    return TauxChange.objects.create(
        date=JOUR,
        devise_source=usd,
        devise_cible=cdf,
        taux_achat=Decimal("2840"),
        taux_vente=Decimal("2860"),
        taux_reference=Decimal("2850"),
        saisi_par=directeur,
    )


@pytest.fixture
def client_api():
    """Client API authentifié directement (sans cookies) pour les tests de permissions."""

    def fabrique(user) -> APIClient:
        client = APIClient()
        client.force_authenticate(user)
        return client

    return fabrique
