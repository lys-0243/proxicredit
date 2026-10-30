from datetime import date
from decimal import Decimal

import pytest
from rest_framework.test import APIClient

from apps.accounting.initialisation import charger_plan_comptable
from apps.accounts.models import Utilisateur
from apps.accounts.roles import synchroniser_roles
from apps.cash.initialisation import charger_parametrage_caisse
from apps.core.initialisation import charger_referentiel
from apps.core.models import Agence, Devise, TauxChange
from apps.credits.initialisation import charger_parametrage_credit
from apps.members.initialisation import charger_parametrage_membres
from apps.savings.initialisation import charger_parametrage_epargne

JOUR = date(2026, 10, 1)
MOT_DE_PASSE = "Motdepasse-solide-2026"


@pytest.fixture(autouse=True)
def referentiel(db):
    charger_referentiel()
    charger_plan_comptable()
    charger_parametrage_membres()
    charger_parametrage_caisse()
    charger_parametrage_epargne()
    charger_parametrage_credit()
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
def accueil(creer_utilisateur):
    return creer_utilisateur("AGENT_RECEPTION", username="accueil")


@pytest.fixture
def chef(creer_utilisateur):
    return creer_utilisateur("CHEF_AGENCE", username="chef")


@pytest.fixture
def caissier(creer_utilisateur):
    return creer_utilisateur("CAISSIER", username="caissier")


@pytest.fixture
def caisse_ouverte(caissier, journee, agence):
    """Session de caisse du caissier au guichet G01 (journée ouverte)."""
    from apps.cash.models import Caisse
    from apps.cash.services import ouvrir_session

    return ouvrir_session(Caisse.objects.get(agence=agence, code="G01"), caissier)


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


@pytest.fixture
def fabrique_membre(accueil):
    """Membres actifs prêts à l'emploi pour les modules financiers (le parcours d'activation
    complet est testé dans le module membres)."""
    from apps.members.models import Membre
    from apps.members.services import creer_membre

    compteur = iter(range(1, 10_000))

    def fabrique(**champs) -> Membre:
        n = next(compteur)
        membre = creer_membre(
            {
                "type": Membre.Type.PHYSIQUE,
                "nom": f"Membre{n}",
                "prenom": "Test",
                "telephone": f"+24381{n:07d}",
                **champs,
            },
            accueil,
        )
        Membre.objects.filter(pk=membre.pk).update(statut=Membre.Statut.ACTIF)
        membre.refresh_from_db()
        return membre

    return fabrique
