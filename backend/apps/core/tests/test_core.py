from datetime import date
from decimal import Decimal

import pytest

from apps.core import services
from apps.core.exceptions import ErreurMetier
from apps.core.models import JourFerie, JourneeComptable, Parametre, TauxChange
from apps.core.money import arrondir, en_decimal
from conftest import JOUR

pytestmark = pytest.mark.django_db


class TestMonnaie:
    def test_arrondi_commercial(self):
        assert arrondir(Decimal("178.525"), 2) == Decimal("178.53")
        assert arrondir(Decimal("178.524"), 2) == Decimal("178.52")
        assert arrondir(Decimal("2849.5"), 0) == Decimal("2850")

    def test_float_interdit(self):
        with pytest.raises(TypeError):
            en_decimal(0.1)


class TestJourneeComptable:
    def test_cycle_ouverture_fermeture(self, agence, directeur):
        with pytest.raises(ErreurMetier):
            services.date_comptable(agence)
        services.ouvrir_journee(agence, JOUR, directeur)
        assert services.date_comptable(agence) == JOUR
        with pytest.raises(ErreurMetier, match="déjà ouverte"):
            services.ouvrir_journee(agence, date(2026, 10, 2), directeur)
        services.fermer_journee(agence, directeur)
        with pytest.raises(ErreurMetier, match="postérieure"):
            services.ouvrir_journee(agence, JOUR, directeur)
        services.ouvrir_journee(agence, date(2026, 10, 2), directeur)
        assert services.date_comptable(agence) == date(2026, 10, 2)

    def test_api_ouvrir_journee_reservee_aux_roles_habilites(
        self, client_api, creer_utilisateur, directeur, agence
    ):
        reception = creer_utilisateur("AGENT_RECEPTION")
        donnees = {"agence": agence.pk, "date": "2026-10-01"}
        assert client_api(reception).post("/api/journees/ouvrir", donnees).status_code == 403
        reponse = client_api(directeur).post("/api/journees/ouvrir", donnees)
        assert reponse.status_code == 201
        assert reponse.data["statut"] == JourneeComptable.Statut.OUVERTE

    def test_chef_agence_limite_a_son_agence(self, client_api, creer_utilisateur, autre_agence):
        chef = creer_utilisateur("CHEF_AGENCE")
        reponse = client_api(chef).post(
            "/api/journees/ouvrir", {"agence": autre_agence.pk, "date": "2026-10-01"}
        )
        assert reponse.status_code == 403


class TestCalendrier:
    def test_jours_feries_et_dimanche(self):
        JourFerie.objects.create(date=date(2000, 6, 30), libelle="Indépendance", recurrent=True)
        JourFerie.objects.create(date=date(2026, 12, 24), libelle="Exceptionnel", recurrent=False)
        assert not services.est_jour_ouvre(date(2026, 6, 30))  # récurrent
        assert not services.est_jour_ouvre(date(2026, 10, 4))  # dimanche
        assert services.est_jour_ouvre(date(2027, 12, 24))  # non récurrent
        assert services.jour_ouvre_suivant(date(2026, 10, 4)) == date(2026, 10, 5)


class TestChange:
    def test_taux_en_vigueur(self, taux_usd, usd, cdf, directeur):
        TauxChange.objects.create(
            date=date(2026, 10, 5),
            devise_source=usd,
            devise_cible=cdf,
            taux_achat=Decimal("2870"),
            taux_vente=Decimal("2890"),
            taux_reference=Decimal("2880"),
            saisi_par=directeur,
        )
        assert services.taux_reference("USD", date(2026, 10, 4)) == Decimal("2850")
        assert services.taux_reference("USD", date(2026, 10, 9)) == Decimal("2880")
        assert services.taux_reference("CDF", date(2026, 10, 9)) == 1
        with pytest.raises(ErreurMetier, match="Aucun taux"):
            services.taux_reference("USD", date(2026, 9, 30))

    def test_api_controle_coherence_des_taux(self, client_api, directeur):
        reponse = client_api(directeur).post(
            "/api/taux-change",
            {
                "date": "2026-10-01",
                "devise_source": "USD",
                "devise_cible": "CDF",
                "taux_achat": "2900",
                "taux_vente": "2860",
                "taux_reference": "2850",
            },
        )
        assert reponse.status_code == 400


class TestParametres:
    def test_valeur_selon_date_d_effet(self):
        Parametre.objects.create(cle="frais_adhesion", valeur="5000", date_effet=date(2026, 1, 1))
        Parametre.objects.create(cle="frais_adhesion", valeur="7500", date_effet=date(2026, 7, 1))
        assert services.parametre("frais_adhesion", date(2026, 3, 1)) == "5000"
        assert services.parametre("frais_adhesion", date(2026, 8, 1)) == "7500"
        assert services.parametre("inconnu", defaut=None) is None
        with pytest.raises(ErreurMetier):
            services.parametre("frais_adhesion", date(2025, 1, 1))


def test_historique_audit_avec_ip(client_api, creer_utilisateur, agence):
    admin = creer_utilisateur("ADMINISTRATEUR", otp_active=True)
    reponse = client_api(admin).patch(
        f"/api/agences/{agence.pk}", {"telephone": "+243810000000"}, REMOTE_ADDR="10.0.0.7"
    )
    assert reponse.status_code == 200
    dernier = agence.history.first()
    assert dernier.history_user == admin
    assert dernier.adresse_ip == "10.0.0.7"
    assert dernier.telephone == "+243810000000"
