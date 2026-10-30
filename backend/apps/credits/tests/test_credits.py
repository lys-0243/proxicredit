import uuid
from datetime import date
from decimal import Decimal

import pytest

from apps.accounting import services as compta
from apps.accounting.services import Ligne
from apps.cash.models import OperationCaisse
from apps.cash.services import solde_theorique, transferer_coffre
from apps.core.exceptions import ErreurMetier
from apps.core.models import Devise
from apps.credits import echeancier, services
from apps.credits.models import Credit, ProduitCredit
from apps.members import services as membres
from apps.savings import services as epargne

pytestmark = pytest.mark.django_db

D = Decimal
S = Credit.Statut


def cle():
    return str(uuid.uuid4())


@pytest.fixture
def agent_credit(creer_utilisateur):
    return creer_utilisateur("AGENT_CREDIT", username="agent.credit")


@pytest.fixture
def comite(creer_utilisateur):
    return creer_utilisateur("MEMBRE_COMITE", username="comite")


@pytest.fixture
def edu():
    return ProduitCredit.objects.get(code="EDU")


@pytest.fixture
def caisse_approvisionnee(caisse_ouverte, comptable, chef, agence):
    """Coffre alimenté par la banque, puis 2 000 000 CDF remis au caissier."""
    compta.comptabiliser(
        journal="CA",
        agence=agence,
        devise="CDF",
        libelle="Retrait banque vers coffre",
        lignes=[Ligne("5711", debit=D("5000000")), Ligne("5211", credit=D("5000000"))],
        utilisateur=comptable,
        type_operation="ALIMENTATION_COFFRE",
    )
    transferer_coffre(
        caisse_ouverte,
        sens=OperationCaisse.Sens.ENTREE,
        devise="CDF",
        montant=D("2000000"),
        utilisateur=chef,
        cle_idempotence=cle(),
    )
    return caisse_ouverte


def demande(membre, utilisateur, produit, montant="1000000", duree=10, devise="CDF"):
    return services.creer_demande(
        {
            "membre": membre,
            "produit": produit,
            "devise": Devise.objects.get(code=devise),
            "montant_demande": D(montant),
            "duree_demandee": duree,
            "objet": "Frais scolaires",
        },
        utilisateur,
    )


def epargner(membre, caissier, montant="180000"):
    """Dépôt en caisse sur le compte CDF du membre (ouvert au premier dépôt)."""
    return epargne.deposer_pour_membre(
        membre,
        devise="CDF",
        montant=D(montant),
        compte_tresorerie="5712",
        utilisateur=caissier,
        cle_idempotence=cle(),
    ).compte


@pytest.fixture
def membre_eligible(fabrique_membre, caissier, caisse_ouverte):
    """Membre actif ayant déjà déposé 18 % d'un crédit de 1 000 000 CDF."""

    def fabrique(montant="180000"):
        membre = fabrique_membre()
        epargner(membre, caissier, montant)
        return membre

    return fabrique


def approuve(membre, accueil, agent_credit, comite, produit, montant="1000000", duree=10):
    credit = demande(membre, accueil, produit, montant, duree)
    services.soumettre(credit, accueil)
    services.analyser(
        credit,
        agent_credit,
        avis="FAVORABLE",
        commentaire="Revenus réguliers",
        montant_propose=D(montant),
        duree_proposee=duree,
    )
    return services.statuer(credit, comite, approuver=True, motif="Dossier solide")


class TestEcheancier:
    def test_degressif(self):
        lignes = echeancier.calculer(
            montant=D("100000"),
            taux=D("0.02"),
            duree=10,
            methode="DEGRESSIF",
            periodicite="MENSUELLE",
            depart=date(2026, 10, 1),
        )
        assert len(lignes) == 10
        assert (lignes[0].interet, lignes[0].capital, lignes[0].total) == (
            D("2000.00"),
            D("9132.65"),
            D("11132.65"),
        )
        assert sum(ligne.capital for ligne in lignes) == D("100000")
        assert lignes[-1].capital_restant == 0
        # Échéances constantes, à l'arrondi près sur la dernière
        assert {ligne.total for ligne in lignes[:-1]} == {D("11132.65")}
        assert abs(lignes[-1].total - D("11132.65")) < D("0.10")

    def test_interets_fixes(self):
        lignes = echeancier.calculer(
            montant=D("100000"),
            taux=D("0.02"),
            duree=3,
            methode="FLAT",
            periodicite="MENSUELLE",
            depart=date(2026, 10, 1),
        )
        assert [ligne.interet for ligne in lignes] == [D("2000.00")] * 3
        assert [ligne.capital for ligne in lignes] == [D("33333.33"), D("33333.33"), D("33333.34")]

    def test_dates_fin_de_mois_et_hebdomadaires(self):
        mensuel = echeancier.calculer(
            montant=D("3000"),
            taux=D(0),
            duree=3,
            methode="DEGRESSIF",
            periodicite="MENSUELLE",
            depart=date(2026, 1, 31),
        )
        assert [ligne.date for ligne in mensuel] == [
            date(2026, 2, 28),
            date(2026, 3, 31),
            date(2026, 4, 30),
        ]
        hebdo = echeancier.calculer(
            montant=D("3000"),
            taux=D(0),
            duree=2,
            methode="DEGRESSIF",
            periodicite="HEBDOMADAIRE",
            depart=date(2026, 10, 1),
        )
        assert [ligne.date for ligne in hebdo] == [date(2026, 10, 8), date(2026, 10, 15)]

    def test_simulation_par_l_accueil(self, client_api, accueil, edu):
        reponse = client_api(accueil).post(
            "/api/credits/produits/simuler",
            {
                "produit": edu.pk,
                "devise": "CDF",
                "montant": "1000000",
                "duree": 10,
                "date_depart": "2026-10-01",
            },
            format="json",
        )
        assert reponse.status_code == 200, reponse.data
        assert reponse.data["frais_dossier"] == "20000.00"
        assert reponse.data["epargne_garantie"] == "180000.00"
        assert reponse.data["montant_net"] == "980000.00"
        # 1er novembre 2026 : un dimanche, reporté au lundi
        assert reponse.data["lignes"][0]["date"] == "2026-11-02"

    def test_conditions_du_produit(self, client_api, accueil, edu):
        reponse = client_api(accueil).post(
            "/api/credits/produits/simuler",
            {"produit": edu.pk, "devise": "CDF", "montant": "10000000", "duree": 10},
            format="json",
        )
        assert reponse.status_code == 400
        assert "limites" in reponse.data["detail"]


class TestCircuit:
    def test_parcours_complet_par_l_api(
        self,
        client_api,
        accueil,
        agent_credit,
        comite,
        caissier,
        fabrique_membre,
        edu,
        caisse_approvisionnee,
    ):
        membre = fabrique_membre()

        # 1. L'accueil saisit et soumet la demande
        creation = client_api(accueil).post(
            "/api/credits/dossiers",
            {
                "membre": membre.pk,
                "produit": edu.pk,
                "devise": "CDF",
                "montant_demande": "1000000",
                "duree_demandee": 10,
                "objet": "Frais scolaires 2026-2027",
            },
            format="json",
        )
        assert creation.status_code == 201, creation.data
        assert creation.data["numero"] == "AG001-CR000001"
        url = f"/api/credits/dossiers/{creation.data['id']}"

        # Il faut avoir déjà déposé 18 % du montant demandé : 180 000 CDF
        compte = epargner(membre, caissier, "150000")
        refus = client_api(accueil).post(f"{url}/soumettre")
        assert refus.status_code == 400
        assert "150000.00 CDF disponibles, 180000.00 exigés" in refus.data["detail"]
        epargner(membre, caissier, "30000")
        assert client_api(accueil).post(f"{url}/soumettre").data["statut"] == S.SOUMIS

        # 2. L'accueil n'analyse pas ; l'agent de crédit, oui
        analyse = {
            "avis": "FAVORABLE",
            "commentaire": "Commerçante, revenus stables",
            "montant_propose": "900000",
            "duree_proposee": 10,
            "revenu_mensuel": "800000",
            "charges_mensuelles": "300000",
        }
        assert client_api(accueil).post(f"{url}/analyser", analyse, format="json").status_code == (
            403
        )
        reponse = client_api(agent_credit).post(f"{url}/analyser", analyse, format="json")
        assert reponse.data["statut"] == S.ANALYSE
        capacite = client_api(agent_credit).get(f"{url}/controle").data["capacite"]
        assert capacite["revenu_disponible"] == "500000.00"
        assert not capacite["depasse"]

        # 3. Le comité accorde le montant proposé
        decision = client_api(comite).post(
            f"{url}/statuer", {"approuver": True, "motif": "Avis favorable"}, format="json"
        )
        assert decision.status_code == 200, decision.data
        assert decision.data["statut"] == S.APPROUVE
        assert decision.data["montant_accorde"] == "900000.00"

        # 4. Décaissement : 18 % du montant accordé (162 000) sont bloqués sur l'épargne
        versement = {"compte_tresorerie": "5712", "cle_idempotence": cle()}
        decaisse = client_api(caissier).post(f"{url}/decaisser", versement, format="json")
        assert decaisse.status_code == 200, decaisse.data
        assert decaisse.data["statut"] == S.EN_COURS
        assert decaisse.data["frais_dossier"] == "18000.00"
        assert decaisse.data["epargne_bloquee"] == "162000.00"
        assert compta.solde("4111", "CDF") == D("900000")
        assert compta.solde("7061", "CDF") == D("-18000")
        # 2 000 000 reçus du coffre + 180 000 d'épargne − 882 000 versés
        assert solde_theorique(caisse_approvisionnee, "CDF") == D("1298000")
        lecture = client_api(caissier).get(f"/api/epargne/comptes/{compte.pk}").data
        assert (lecture["bloque"], lecture["disponible"]) == ("162000.00", "18000.00")
        with pytest.raises(ErreurMetier, match="bloqués en garantie"):
            epargne.retirer(
                compte,
                montant=D("20000"),
                compte_tresorerie="5712",
                utilisateur=caissier,
                cle_idempotence=cle(),
            )

        echeances = client_api(caissier).get(f"{url}/echeancier").data
        assert len(echeances) == 10
        assert echeances[0]["date"] == "2026-11-02"

        # 5. Premier remboursement, puis solde du crédit
        premiere = echeances[0]["total"]
        reponse = client_api(caissier).post(
            f"{url}/rembourser",
            {"montant": premiere, "compte_tresorerie": "5712", "cle_idempotence": cle()},
            format="json",
        )
        assert reponse.status_code == 201, reponse.data
        assert reponse.data["interet"] == "18000.00"
        assert compta.solde("7711", "CDF") == D("-18000")
        situation = client_api(caissier).get(url).data["situation"]
        assert situation["capital_restant"] == str(D("900000") - D(reponse.data["capital"]))

        reste = situation["total_du"]
        client_api(caissier).post(
            f"{url}/rembourser",
            {"montant": reste, "compte_tresorerie": "5712", "cle_idempotence": cle()},
            format="json",
        )
        final = client_api(caissier).get(url).data
        assert final["statut"] == S.SOLDE
        assert final["situation"]["total_du"] == "0.00"
        assert compta.solde("4111", "CDF") == 0
        # Crédit soldé : l'épargne redevient entièrement disponible
        compte.refresh_from_db()
        assert epargne.disponible(compte) == D("180000")

        etapes = [h["nouveau"] for h in client_api(caissier).get(f"{url}/historique").data]
        assert etapes == [S.SOLDE, S.EN_COURS, S.APPROUVE, S.ANALYSE, S.SOUMIS, S.BROUILLON]

    def test_quatre_yeux_au_comite(self, chef, agent_credit, membre_eligible, edu):
        credit = demande(membre_eligible(), chef, edu)
        services.soumettre(credit, chef)
        services.analyser(
            credit,
            agent_credit,
            avis="FAVORABLE",
            commentaire="RAS",
            montant_propose=D("1000000"),
            duree_proposee=10,
        )
        with pytest.raises(ErreurMetier, match="quatre yeux"):
            services.statuer(credit, chef, approuver=True, motif="OK")

    def test_rejet_et_renvoi(self, accueil, agent_credit, comite, membre_eligible, edu):
        credit = demande(membre_eligible(), accueil, edu)
        services.soumettre(credit, accueil)
        services.renvoyer(credit, agent_credit, "Bulletin de salaire manquant")
        credit.refresh_from_db()
        assert credit.statut == S.BROUILLON
        services.soumettre(credit, accueil)
        services.analyser(
            credit,
            agent_credit,
            avis="DEFAVORABLE",
            commentaire="Endettement excessif",
            montant_propose=D("1000000"),
            duree_proposee=10,
        )
        rejete = services.statuer(credit, comite, approuver=False, motif="Capacité insuffisante")
        assert rejete.statut == S.REJETE
        with pytest.raises(ErreurMetier, match="rejeté"):
            services.soumettre(rejete, accueil)

    def test_eligibilite(self, accueil, agent_credit, comite, membre_eligible, edu):
        prospect = membres.creer_membre({"type": "PHYSIQUE", "nom": "N", "prenom": "P"}, accueil)
        with pytest.raises(ErreurMetier, match="pas actif"):
            services.soumettre(demande(prospect, accueil, edu), accueil)

        membre = membre_eligible()
        approuve(membre, accueil, agent_credit, comite, edu)
        second = demande(membre, accueil, ProduitCredit.objects.get(code="SEC"), "100000", 3)
        with pytest.raises(ErreurMetier, match="maximum autorisé : 1"):
            services.soumettre(second, accueil)

    def test_annulation_reservee_au_comite_apres_analyse(
        self, client_api, accueil, agent_credit, comite, membre_eligible, edu
    ):
        credit = approuve(membre_eligible(), accueil, agent_credit, comite, edu)
        url = f"/api/credits/dossiers/{credit.pk}/annuler"
        corps = {"motif": "Le membre renonce"}
        assert client_api(accueil).post(url, corps, format="json").status_code == 403
        assert client_api(comite).post(url, corps, format="json").data["statut"] == S.ANNULE

    def test_epargne_verifiee_jusqu_a_la_decision(
        self, accueil, agent_credit, comite, caissier, membre_eligible, edu
    ):
        membre = membre_eligible("90000")  # 18 % de 500 000
        credit = demande(membre, accueil, edu, "500000", 6)
        services.soumettre(credit, accueil)
        services.analyser(
            credit,
            agent_credit,
            avis="FAVORABLE",
            commentaire="RAS",
            montant_propose=D("500000"),
            duree_proposee=6,
        )
        # Le membre retire une partie de son épargne avant le comité
        epargne.retirer(
            epargne.compte_de_la_devise(membre, "CDF"),
            montant=D("1000"),
            compte_tresorerie="5712",
            utilisateur=caissier,
            cle_idempotence=cle(),
        )
        with pytest.raises(ErreurMetier, match="Épargne insuffisante"):
            services.statuer(credit, comite, approuver=True, motif="OK")


class TestRemboursements:
    @pytest.fixture
    def credit(
        self, accueil, agent_credit, comite, caissier, membre_eligible, edu, caisse_approvisionnee
    ):
        credit = approuve(membre_eligible(), accueil, agent_credit, comite, edu)
        return services.decaisser(credit, caissier, compte_tresorerie="5712", cle_idempotence=cle())

    def test_penalites_incrementales(self, credit):
        premiere = credit.echeances.get(numero=1)
        assert premiere.date == date(2026, 11, 2)
        # Délai de grâce de 3 jours : pénalités à partir du 5 novembre
        services.actualiser_penalites(credit, date(2026, 11, 5))
        premiere.refresh_from_db()
        assert premiere.penalite == 0
        services.actualiser_penalites(credit, date(2026, 11, 12))
        services.actualiser_penalites(credit, date(2026, 11, 12))  # pas de double comptage
        premiere.refresh_from_db()
        attendu = (premiere.total * D("0.001") * 7).quantize(D("0.01"))
        assert premiere.penalite == attendu
        situation = services.situation(credit, date(2026, 11, 12))
        assert situation["jours_retard"] == 10
        assert situation["impaye"] == premiere.total + attendu

    def test_imputation_penalites_interets_capital(self, credit):
        echeances = list(credit.echeances.all())
        echeances[0].penalite = D("500")
        reparti = services._imputer(echeances, D("10500"))
        assert reparti == {"penalite": D("500"), "interet": D("10000"), "capital": D(0)}
        assert (echeances[0].penalite_payee, echeances[0].interet_paye) == (D("500"), D("10000"))

    def test_trop_percu_refuse(self, credit, caissier):
        total = services.situation(credit)["total_du"]
        with pytest.raises(ErreurMetier, match="total restant dû"):
            services.rembourser(
                credit,
                caissier,
                montant=total + 1,
                compte_tresorerie="5712",
                cle_idempotence=cle(),
            )

    def test_remboursement_idempotent(self, credit, caissier):
        cle_unique = cle()
        arguments = {"montant": D("5000"), "compte_tresorerie": "5712"}
        premier = services.rembourser(credit, caissier, cle_idempotence=cle_unique, **arguments)
        rejoue = services.rembourser(credit, caissier, cle_idempotence=cle_unique, **arguments)
        assert premier.pk == rejoue.pk
        assert credit.remboursements.count() == 1

    def test_par_le_compte_d_epargne_hors_part_bloquee(self, credit, caissier):
        # 180 000 déposés, entièrement bloqués (18 % de 1 000 000) : seul un nouveau dépôt sert
        compte = epargner(credit.membre, caissier, "50000")
        assert epargne.disponible(compte) == D("50000")
        services.rembourser(
            credit, caissier, montant=D("30000"), compte_epargne=compte, cle_idempotence=cle()
        )
        compte.refresh_from_db()
        assert compte.solde == D("200000")
        with pytest.raises(ErreurMetier, match="disponible insuffisant"):
            services.rembourser(
                credit, caissier, montant=D("30000"), compte_epargne=compte, cle_idempotence=cle()
            )

    def test_demission_impossible_avec_un_credit(self, credit, chef):
        with pytest.raises(ErreurMetier, match="Crédits en cours"):
            membres.changer_statut(credit.membre, "demission", "Départ", chef)


class TestDecaissementSurCompte:
    def test_versement_sur_le_compte_d_epargne(
        self, accueil, agent_credit, comite, caissier, membre_eligible, edu, caisse_ouverte
    ):
        membre = membre_eligible()
        compte = epargne.compte_de_la_devise(membre, "CDF")
        credit = approuve(membre, accueil, agent_credit, comite, edu)
        services.decaisser(credit, caissier, compte_epargne=compte, cle_idempotence=cle())
        compte.refresh_from_db()
        assert compte.solde == D("1160000")  # 180 000 d'épargne + 980 000 versés
        assert epargne.disponible(compte) == D("980000")  # 180 000 bloqués
        assert compta.solde("4191", "CDF") == D("-1160000")
        # Aucun mouvement d'espèces pour le décaissement
        assert solde_theorique(caisse_ouverte, "CDF") == D("180000")


class TestProduits:
    NOUVEAU = {
        "code": "AGR",
        "libelle": "Crédit Agricole",
        "methode": "FLAT",
        "periodicite": "MENSUELLE",
        "taux_interet": "0.03",
        "duree_min": 3,
        "duree_max": 12,
        "frais_dossier_taux": "0.01",
        "epargne_garantie_taux": "0.05",
        "taux_penalite_jour": "0.001",
        "jours_grace": 5,
        "plafonds": [{"devise": "USD", "montant_min": "50", "montant_max": "1500"}],
        "compte_encours": "4111",
        "compte_interets": "7711",
    }

    def test_creation_avec_regles_comptables(self, client_api, directeur):
        reponse = client_api(directeur).post("/api/credits/produits", self.NOUVEAU, format="json")
        assert reponse.status_code == 201, reponse.data
        assert reponse.data["comptes"] == {"encours": "4111", "interets": "7711"}
        produit = ProduitCredit.objects.get(code="AGR")
        assert compta.trouver_regle("CREDIT_DECAISSEMENT", "AGR", "USD").code_produit == "AGR"
        assert compta.trouver_regle("CREDIT_REMBOURSEMENT", "AGR", "USD").code_produit == "AGR"
        assert services.simuler(produit, Devise.objects.get(code="USD"), D("600"), 6).lignes

    def test_comptes_obligatoires_et_controles(self, client_api, directeur):
        client = client_api(directeur)
        sans_comptes = {k: v for k, v in self.NOUVEAU.items() if not k.startswith("compte_")}
        reponse = client.post("/api/credits/produits", sans_comptes, format="json")
        assert set(reponse.data) >= {"compte_encours", "compte_interets"}
        mauvais = {**self.NOUVEAU, "compte_encours": "5712"}
        assert (
            "encours" in client.post("/api/credits/produits", mauvais, format="json").data["detail"]
        )
        assert not ProduitCredit.objects.filter(code="AGR").exists()

    def test_modification_sans_toucher_code_ni_comptes(self, client_api, directeur, edu):
        client = client_api(directeur)
        url = f"/api/credits/produits/{edu.pk}"
        reponse = client.patch(url, {"taux_interet": "0.018", "actif": False}, format="json")
        assert reponse.status_code == 200, reponse.data
        edu.refresh_from_db()
        assert edu.taux_interet == D("0.018") and not edu.actif
        assert client.patch(url, {"code": "EDU2"}, format="json").status_code == 400
        assert client.patch(url, {"compte_encours": "4112"}, format="json").status_code == 400

    def test_reserve_a_la_direction(self, client_api, chef, edu):
        client = client_api(chef)
        assert client.post("/api/credits/produits", self.NOUVEAU, format="json").status_code == 403
        assert client.patch(f"/api/credits/produits/{edu.pk}", {"actif": False}).status_code == 403
