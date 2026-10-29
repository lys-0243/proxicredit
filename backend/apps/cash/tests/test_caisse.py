import uuid
from decimal import Decimal

import pytest

from apps.accounting import services as compta
from apps.accounting.services import Ligne
from apps.cash import services
from apps.cash.models import Caisse, OperationCaisse, SessionCaisse
from apps.core.exceptions import ErreurMetier
from apps.core.services import fermer_journee

pytestmark = pytest.mark.django_db

D = Decimal


def cle():
    return str(uuid.uuid4())


@pytest.fixture
def coffre_alimente(agence, comptable, journee):
    """Coffre de l'agence alimenté depuis la banque : 5 000 000 CDF."""
    return compta.comptabiliser(
        journal="CA",
        agence=agence,
        devise="CDF",
        libelle="Retrait banque vers coffre",
        lignes=[Ligne("5711", debit=D("5000000")), Ligne("5211", credit=D("5000000"))],
        utilisateur=comptable,
        type_operation="ALIMENTATION_COFFRE",
    )


def approvisionner(session, chef, montant="1000000", devise="CDF"):
    return services.transferer_coffre(
        session,
        sens=OperationCaisse.Sens.ENTREE,
        devise=devise,
        montant=D(montant),
        utilisateur=chef,
        cle_idempotence=cle(),
    )


class TestSession:
    def test_ouverture_et_cloisonnement(self, caissier, creer_utilisateur, agence, journee):
        guichet = Caisse.objects.get(agence=agence, code="G01")
        session = services.ouvrir_session(guichet, caissier)
        assert session.date_comptable == journee.date
        assert {s.devise_id for s in session.soldes.all()} == {"CDF", "USD"}
        with pytest.raises(ErreurMetier, match="déjà une session"):
            services.ouvrir_session(guichet, caissier)
        autre = creer_utilisateur("CAISSIER")
        with pytest.raises(ErreurMetier, match="déjà ouverte"):
            services.ouvrir_session(guichet, autre)
        coffre = Caisse.objects.get(agence=agence, type=Caisse.Type.COFFRE)
        with pytest.raises(ErreurMetier, match="guichet"):
            services.ouvrir_session(coffre, autre)

    def test_journee_fermee_interdit_l_ouverture(self, caissier, agence):
        with pytest.raises(ErreurMetier, match="journée"):
            services.ouvrir_session(Caisse.objects.get(agence=agence, code="G01"), caissier)

    def test_la_journee_ne_ferme_pas_avec_une_caisse_ouverte(
        self, caisse_ouverte, caissier, directeur, agence
    ):
        with pytest.raises(ErreurMetier, match="Sessions de caisse encore ouvertes"):
            fermer_journee(agence, directeur)
        services.fermer_session(caisse_ouverte, {"CDF": D(0), "USD": D(0)}, caissier)
        assert fermer_journee(agence, directeur).statut == "FERMEE"

    def test_ma_session_par_l_api(self, client_api, caissier, journee, agence):
        client = client_api(caissier)
        assert client.get("/api/caisse/sessions/ma-session").status_code == 204
        guichet = Caisse.objects.get(agence=agence, code="G01")
        ouverte = client.post("/api/caisse/sessions/ouvrir", {"caisse": guichet.pk}, format="json")
        assert ouverte.status_code == 201, ouverte.data
        reponse = client.get("/api/caisse/sessions/ma-session")
        assert reponse.status_code == 200
        assert reponse.data["caisse_code"] == "G01"


class TestCoffre:
    def test_approvisionnement_par_le_chef(self, caisse_ouverte, chef, coffre_alimente):
        operation = approvisionner(caisse_ouverte, chef)
        assert operation.sens == OperationCaisse.Sens.ENTREE
        assert services.solde_theorique(caisse_ouverte, "CDF") == D("1000000")
        assert compta.solde("5712", "CDF") == D("1000000")
        assert compta.solde("5711", "CDF") == D("4000000")

    def test_quatre_yeux_et_fonds_du_coffre(self, caisse_ouverte, caissier, chef, coffre_alimente):
        with pytest.raises(ErreurMetier, match="quatre yeux"):
            approvisionner(caisse_ouverte, caissier)
        with pytest.raises(ErreurMetier, match="insuffisants au coffre"):
            approvisionner(caisse_ouverte, chef, "6000000")

    def test_delestage_limite_au_disponible(self, caisse_ouverte, chef, coffre_alimente):
        approvisionner(caisse_ouverte, chef, "300000")
        with pytest.raises(ErreurMetier, match="insuffisants en caisse"):
            services.transferer_coffre(
                caisse_ouverte,
                sens=OperationCaisse.Sens.SORTIE,
                devise="CDF",
                montant=D("400000"),
                utilisateur=chef,
                cle_idempotence=cle(),
            )

    def test_le_caissier_ne_gere_pas_le_coffre(self, client_api, caisse_ouverte, caissier):
        reponse = client_api(caissier).post(
            f"/api/caisse/sessions/{caisse_ouverte.pk}/transfert-coffre",
            {"sens": "ENTREE", "devise": "CDF", "montant": "1000", "cle_idempotence": cle()},
            format="json",
        )
        assert reponse.status_code == 403


class TestFermeture:
    def test_manquant_comptabilise_et_report(
        self, caisse_ouverte, caissier, chef, coffre_alimente, agence
    ):
        approvisionner(caisse_ouverte, chef, "500000")
        session = services.fermer_session(
            caisse_ouverte, {"CDF": D("499000"), "USD": D(0)}, caissier, "Billet manquant"
        )
        assert session.statut == SessionCaisse.Statut.FERMEE
        cdf = session.soldes.get(devise="CDF")
        assert (cdf.theorique, cdf.compte, cdf.ecart) == (D("500000"), D("499000"), D("-1000"))
        assert compta.solde("4712", "CDF") == D("1000")
        assert compta.solde("5712", "CDF") == D("499000")

        # Le comptage devient les fonds d'ouverture de la session suivante
        suivante = services.ouvrir_session(Caisse.objects.get(agence=agence, code="G01"), caissier)
        assert suivante.soldes.get(devise="CDF").ouverture == D("499000")

    def test_comptage_obligatoire_pour_chaque_devise(self, caisse_ouverte, caissier):
        with pytest.raises(ErreurMetier, match="USD"):
            services.fermer_session(caisse_ouverte, {"CDF": D(0)}, caissier)

    def test_seul_le_caissier_ferme_sa_session(self, caisse_ouverte, chef):
        with pytest.raises(ErreurMetier, match="Seul le caissier"):
            services.fermer_session(caisse_ouverte, {"CDF": D(0), "USD": D(0)}, chef)


class TestTresorerie:
    def test_especes_sans_session_refusees(self, caissier, agence, journee):
        with pytest.raises(ErreurMetier, match="session de caisse"):
            services.tresorerie("5712", caissier, agence)

    # Pour le démarrage : ni Mobile Money (5521) ni banque (5211), uniquement les caisses.
    @pytest.mark.parametrize("numero", ["5521", "5211", "7062", "571", "5851"])
    def test_seules_les_caisses_sont_acceptees(self, caissier, agence, numero):
        with pytest.raises(ErreurMetier, match="uniquement en espèces"):
            services.tresorerie(numero, caissier, agence)
