import uuid
from decimal import Decimal

import pytest

from apps.accounting import services as compta
from apps.accounting.models import CompteComptable
from apps.cash.models import OperationCaisse
from apps.cash.services import solde_theorique, transferer_coffre
from apps.core.exceptions import ErreurMetier
from apps.members import services as membres
from apps.savings import services
from apps.savings.models import CompteEpargne, ProduitEpargne

pytestmark = pytest.mark.django_db

D = Decimal


def cle():
    return str(uuid.uuid4())


@pytest.fixture
def compte(fabrique_membre, accueil, journee):
    return services.ouvrir_compte(fabrique_membre(), "CDF", accueil)


def deposer(compte, caissier, montant="50000", cle_unique=None):
    return services.deposer(
        compte,
        montant=D(montant),
        compte_tresorerie="5712",
        utilisateur=caissier,
        cle_idempotence=cle_unique or cle(),
    )


def retirer(compte, caissier, montant):
    return services.retirer(
        compte,
        montant=D(montant),
        compte_tresorerie="5712",
        utilisateur=caissier,
        cle_idempotence=cle(),
    )


class TestOuverture:
    def test_un_compte_par_devise(self, compte, accueil, taux_usd):
        assert compte.numero == "AG001-EP000001"
        assert compte.produit.code == "EPV-CDF"
        with pytest.raises(ErreurMetier, match="déjà un compte en CDF"):
            services.ouvrir_compte(compte.membre, "CDF", accueil)
        en_dollars = services.ouvrir_compte(compte.membre, "USD", accueil)
        assert en_dollars.produit.code == "EPV-USD"

    def test_ouverture_pour_un_prospect(self, accueil, journee):
        prospect = membres.creer_membre({"type": "PHYSIQUE", "nom": "X", "prenom": "Y"}, accueil)
        assert services.ouvrir_compte(prospect, "CDF", accueil).membre == prospect

    def test_dossier_clos_ou_liste_noire(self, accueil, chef, journee):
        membre = membres.creer_membre({"type": "PHYSIQUE", "nom": "X", "prenom": "Y"}, accueil)
        membres.liste_noire(membre, True, "Fraude", chef)
        with pytest.raises(ErreurMetier, match="liste noire"):
            services.ouvrir_compte(membre, "CDF", accueil)
        membres.changer_statut(membre, "deces", "Décès", chef)
        with pytest.raises(ErreurMetier, match="décédé"):
            services.ouvrir_compte(membre, "USD", accueil)

    def test_ouverture_par_l_accueil(self, client_api, accueil, fabrique_membre, journee):
        membre = fabrique_membre()
        reponse = client_api(accueil).post(
            "/api/epargne/comptes", {"membre": membre.pk, "devise": "CDF"}, format="json"
        )
        assert reponse.status_code == 201, reponse.data
        assert reponse.data["solde"] == "0.00"
        assert reponse.data["bloque"] == "0"

    def test_produits_de_depart(self):
        actifs = ProduitEpargne.objects.filter(actif=True).values_list("code", flat=True)
        assert sorted(actifs) == ["EPV-CDF", "EPV-USD"]


class TestOperations:
    def test_depot_en_especes(self, compte, caissier, caisse_ouverte):
        mouvement = deposer(compte, caissier)
        compte.refresh_from_db()
        assert compte.solde == mouvement.solde_apres == D("50000")
        assert compta.solde("4191", "CDF") == D("-50000")
        assert compta.solde("5712", "CDF") == D("50000")
        operation = OperationCaisse.objects.get(ecriture=mouvement.ecriture)
        assert operation.sens == "ENTREE" and operation.membre == compte.membre
        assert solde_theorique(caisse_ouverte, "CDF") == D("50000")

    def test_premier_depot_ouvre_le_compte(self, accueil, caissier, caisse_ouverte):
        prospect = membres.creer_membre({"type": "PHYSIQUE", "nom": "X", "prenom": "Y"}, accueil)
        arguments = {"devise": "CDF", "compte_tresorerie": "5712", "utilisateur": caissier}
        premier = services.deposer_pour_membre(
            prospect, montant=D("10000"), cle_idempotence=cle(), **arguments
        )
        second = services.deposer_pour_membre(
            prospect, montant=D("5000"), cle_idempotence=cle(), **arguments
        )
        assert premier.compte == second.compte
        assert second.solde_apres == D("15000")

    def test_especes_uniquement(self, compte, caissier, caisse_ouverte):
        with pytest.raises(ErreurMetier, match="uniquement en espèces"):
            services.deposer(
                compte,
                montant=D("1000"),
                compte_tresorerie="5521",
                utilisateur=caissier,
                cle_idempotence=cle(),
            )

    def test_depot_idempotent(self, compte, caissier, caisse_ouverte):
        cle_unique = cle()
        assert deposer(compte, caissier, cle_unique=cle_unique).pk == (
            deposer(compte, caissier, cle_unique=cle_unique).pk
        )
        compte.refresh_from_db()
        assert compte.solde == D("50000")

    def test_retrait_et_solde_minimum(self, compte, caissier, caisse_ouverte):
        produit = compte.produit
        produit.solde_minimum = D("10000")
        produit.save()
        deposer(compte, caissier, "50000")
        with pytest.raises(ErreurMetier, match="disponible insuffisant"):
            retirer(compte, caissier, "45000")
        mouvement = retirer(compte, caissier, "40000")
        assert mouvement.solde_apres == D("10000")
        assert solde_theorique(caisse_ouverte, "CDF") == D("10000")

    def test_retrait_limite_aux_fonds_de_la_caisse(self, compte, caissier, chef, caisse_ouverte):
        deposer(compte, caissier, "50000")
        # Les espèces repartent au coffre : la caisse ne peut plus payer le retrait.
        transferer_coffre(
            caisse_ouverte,
            sens=OperationCaisse.Sens.SORTIE,
            devise="CDF",
            montant=D("50000"),
            utilisateur=chef,
            cle_idempotence=cle(),
        )
        with pytest.raises(ErreurMetier, match="insuffisants en caisse"):
            retirer(compte, caissier, "20000")

    def test_compte_bloque(self, compte, caissier, caisse_ouverte):
        deposer(compte, caissier)
        services.changer_blocage(compte, True, "Opposition judiciaire")
        with pytest.raises(ErreurMetier, match="bloqué"):
            retirer(compte, caissier, "1000")
        services.changer_blocage(compte, False, "Mainlevée")
        assert retirer(compte, caissier, "1000").solde_apres == D("49000")

    def test_demission_impossible_avec_un_solde(self, compte, caissier, caisse_ouverte):
        deposer(compte, caissier)
        with pytest.raises(ErreurMetier, match="non soldés"):
            membres.changer_statut(compte.membre, "demission", "Départ", caissier)


class TestPermissions:
    def test_seul_le_guichet_encaisse(self, client_api, compte, accueil, caissier, caisse_ouverte):
        corps = {"montant": "1000", "compte_tresorerie": "5712", "cle_idempotence": cle()}
        url = f"/api/epargne/comptes/{compte.pk}/deposer"
        assert client_api(accueil).post(url, corps, format="json").status_code == 403
        reponse = client_api(caissier).post(url, corps, format="json")
        assert reponse.status_code == 201, reponse.data
        assert reponse.data["solde_apres"] == "1000.00"

    def test_depots_initiaux(self, client_api, accueil):
        reponse = client_api(accueil).get("/api/epargne/comptes/depots-initiaux")
        assert reponse.data == [
            {"devise": "CDF", "montant": "10000.00"},
            {"devise": "USD", "montant": "5.00"},
        ]

    def test_cloisonnement_par_agence(self, client_api, compte, creer_utilisateur, autre_agence):
        ailleurs = creer_utilisateur("CAISSIER", agence_=autre_agence)
        assert client_api(ailleurs).get(f"/api/epargne/comptes/{compte.pk}").status_code == 404
        assert CompteEpargne.objects.count() == 1


class TestProduits:
    def test_creation_et_champs_figes(self, client_api, directeur, chef):
        corps = {
            "code": "EPT-USD",
            "libelle": "Dépôt à terme USD",
            "type": "TERME",
            "devise": "USD",
            "compte": CompteComptable.objects.get(numero="4193").pk,
            "solde_minimum": "100",
            "retrait_libre": False,
        }
        assert (
            client_api(chef).post("/api/epargne/produits", corps, format="json").status_code == 403
        )
        reponse = client_api(directeur).post("/api/epargne/produits", corps, format="json")
        assert reponse.status_code == 201, reponse.data
        url = f"/api/epargne/produits/{reponse.data['id']}"
        client = client_api(directeur)
        assert client.patch(url, {"solde_minimum": "200"}, format="json").status_code == 200
        assert client.patch(url, {"devise": "CDF"}, format="json").status_code == 400

    def test_compte_de_depots_obligatoire(self, client_api, directeur):
        corps = {
            "code": "X",
            "libelle": "X",
            "type": "VUE",
            "devise": "CDF",
            "compte": CompteComptable.objects.get(numero="5712").pk,
        }
        reponse = client_api(directeur).post("/api/epargne/produits", corps, format="json")
        assert "compte" in reponse.data
