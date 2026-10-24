import uuid
from datetime import date
from decimal import Decimal

import pytest
from django.core.files.uploadedfile import SimpleUploadedFile

from apps.accounting import services as compta
from apps.accounting.models import Ecriture
from apps.core.exceptions import ErreurMetier
from apps.core.services import fermer_journee
from apps.members import services
from apps.members.models import DocumentMembre, Membre, MembreGroupe

pytestmark = pytest.mark.django_db

D = Decimal
JPEG = b"\xff\xd8\xff\xe0" + b"\x00" * 100
PNG = b"\x89PNG\r\n\x1a\n" + b"\x00" * 100
PDF = b"%PDF-1.7\n" + b"\x00" * 100


def fichier(contenu=JPEG, nom="photo.jpg"):
    return SimpleUploadedFile(nom, contenu)


def cle():
    return str(uuid.uuid4())


@pytest.fixture
def accueil(creer_utilisateur):
    return creer_utilisateur("AGENT_RECEPTION", username="accueil")


@pytest.fixture
def chef(creer_utilisateur):
    return creer_utilisateur("CHEF_AGENCE", username="chef")


@pytest.fixture
def caissier(creer_utilisateur):
    return creer_utilisateur("CAISSIER", username="caissier")


IDENTITE = {
    "type": "PHYSIQUE",
    "nom": "Mbuyi",
    "postnom": "Kalala",
    "prenom": "Grâce",
    "sexe": "F",
    "date_naissance": "1990-04-12",
    "type_piece": "CARTE_ELECTEUR",
    "numero_piece": "CE-001",
    "telephone": "+243810000001",
}


def physique(utilisateur, **champs):
    donnees = {**IDENTITE, **champs}
    donnees["date_naissance"] = date.fromisoformat(donnees["date_naissance"])
    donnees.pop("type")
    return services.creer_membre({"type": Membre.Type.PHYSIQUE, **donnees}, utilisateur)


def completer_kyc(membre, utilisateur):
    for type_document, contenu in (("PIECE_IDENTITE", PDF), ("PHOTO", JPEG), ("SIGNATURE", PNG)):
        services.ajouter_document(membre, type_document, fichier(contenu), utilisateur)


def membre_actif(accueil, chef, caissier, numero_piece="CE-001", telephone="+243810000001"):
    membre = physique(accueil, numero_piece=numero_piece, telephone=telephone)
    completer_kyc(membre, accueil)
    services.encaisser_adhesion(
        membre,
        nombre_parts=1,
        compte_tresorerie="5712",
        utilisateur=caissier,
        cle_idempotence=cle(),
    )
    return services.activer(membre, chef)


class TestCreation:
    def test_numerotation_par_agence(self, accueil, creer_utilisateur, autre_agence):
        assert physique(accueil).numero == "AG001-000001"
        assert physique(accueil, numero_piece="CE-002").numero == "AG001-000002"
        ailleurs = creer_utilisateur("AGENT_RECEPTION", agence_=autre_agence)
        assert physique(ailleurs, numero_piece="CE-003").numero == "AG002-000001"

    def test_creation_api_par_l_accueil(self, client_api, accueil):
        reponse = client_api(accueil).post(
            "/api/membres", {**IDENTITE, "raison_sociale": "ignoré"}, format="json"
        )
        assert reponse.status_code == 201, reponse.data
        assert reponse.data["statut"] == "PROSPECT"
        assert reponse.data["nom_complet"] == "MBUYI KALALA Grâce"
        assert reponse.data["raison_sociale"] == ""  # champ d'un autre type ignoré
        membre = Membre.objects.get(pk=reponse.data["id"])
        assert membre.agence.code == "AG001"
        assert membre.historique_statuts.count() == 1

    def test_champs_obligatoires_selon_le_type(self, client_api, accueil):
        client = client_api(accueil)
        assert (
            client.post("/api/membres", {"type": "PHYSIQUE", "nom": "X"}, format="json").status_code
            == 400
        )
        reponse = client.post("/api/membres", {"type": "MORALE", "nom": "X"}, format="json")
        assert "raison_sociale" in reponse.data
        assert (
            client.post(
                "/api/membres", {"type": "GROUPE", "nom_groupe": "Les Battantes"}, format="json"
            ).status_code
            == 201
        )

    def test_piece_identite_en_double_refusee(self, client_api, accueil):
        client = client_api(accueil)
        assert client.post("/api/membres", IDENTITE, format="json").status_code == 201
        reponse = client.post("/api/membres", {**IDENTITE, "nom": "Autre"}, format="json")
        assert reponse.status_code == 400
        assert "déjà enregistrée" in str(reponse.data["numero_piece"])

    def test_recherche_de_doublons(self, client_api, accueil):
        physique(accueil)
        resultats = client_api(accueil).get("/api/membres/doublons", {"nom": "mbuyi"}).data
        assert [m["numero"] for m in resultats] == ["AG001-000001"]


class TestActivation:
    def test_controle_du_dossier(self, client_api, accueil):
        membre = physique(accueil)
        reponse = client_api(accueil).get(f"/api/membres/{membre.pk}/controle-activation").data
        assert not reponse["pret"]
        assert "Photo" in reponse["manquants"]
        assert "Frais d'adhésion payés" in reponse["manquants"]

    def test_activation_a_quatre_yeux(self, accueil, chef, caissier, journee):
        membre = physique(accueil)
        completer_kyc(membre, accueil)
        with pytest.raises(ErreurMetier, match="Dossier incomplet"):
            services.activer(membre, chef)
        services.encaisser_adhesion(
            membre,
            nombre_parts=1,
            compte_tresorerie="5712",
            utilisateur=caissier,
            cle_idempotence=cle(),
        )
        assert services.elements_manquants(membre) == []
        with pytest.raises(ErreurMetier, match="quatre yeux"):
            services.activer(membre, accueil)
        actif = services.activer(membre, chef)
        assert actif.statut == Membre.Statut.ACTIF
        assert actif.active_par == chef

    def test_accueil_ne_peut_pas_activer(self, client_api, accueil, journee):
        membre = physique(accueil)
        assert client_api(accueil).post(f"/api/membres/{membre.pk}/activer").status_code == 403

    def test_mineur_refuse(self, accueil):
        membre = physique(accueil, date_naissance="2015-01-01")
        assert any("18 ans" in m for m in services.elements_manquants(membre))

    def test_piece_expiree(self, accueil):
        membre = physique(accueil)
        membre.piece_expire_le = date(2020, 1, 1)
        membre.save()
        assert "Pièce d'identité expirée" in services.elements_manquants(membre)


class TestAdhesion:
    def test_encaissement_comptabilise(self, client_api, accueil, caissier, journee):
        membre = physique(accueil)
        reponse = client_api(caissier).post(
            f"/api/membres/{membre.pk}/adhesion",
            {"nombre_parts": 2, "compte_tresorerie": "5712", "cle_idempotence": cle()},
            format="json",
        )
        assert reponse.status_code == 201, reponse.data
        assert reponse.data["nombre_parts"] == 2
        assert reponse.data["adhesion"]["frais"] == "5000.00"
        # 5 000 de frais + 2 parts × 10 000, en une seule écriture équilibrée
        assert compta.solde("5712", "CDF") == D("25000.00")
        assert compta.solde("7062", "CDF") == D("-5000.00")
        assert compta.solde("1013", "CDF") == D("-20000.00")
        ecriture = Ecriture.objects.get(type_operation="MEMBRE_ADHESION")
        assert ecriture.reference == membre.numero
        assert ecriture.piece == membre

    def test_le_caissier_voit_les_comptes_de_tresorerie(self, client_api, caissier):
        comptes = client_api(caissier).get("/api/comptabilite/comptes", {"classe": 5})
        assert comptes.status_code == 200
        assert "5712" in [c["numero"] for c in comptes.data]

    def test_idempotence_et_paiement_unique(self, accueil, caissier, journee):
        membre = physique(accueil)
        cle_unique = cle()
        premiere = services.encaisser_adhesion(
            membre,
            nombre_parts=1,
            compte_tresorerie="5712",
            utilisateur=caissier,
            cle_idempotence=cle_unique,
        )
        rejouee = services.encaisser_adhesion(
            membre,
            nombre_parts=1,
            compte_tresorerie="5712",
            utilisateur=caissier,
            cle_idempotence=cle_unique,
        )
        assert premiere.pk == rejouee.pk
        assert Ecriture.objects.count() == 1
        with pytest.raises(ErreurMetier, match="déjà payée"):
            services.encaisser_adhesion(
                membre,
                nombre_parts=1,
                compte_tresorerie="5712",
                utilisateur=caissier,
                cle_idempotence=cle(),
            )

    @pytest.mark.parametrize(
        "parametres, message",
        [
            ({"nombre_parts": 0, "compte_tresorerie": "5712"}, "part"),
            ({"nombre_parts": 1, "compte_tresorerie": "7062"}, "caisse, une banque"),
            ({"nombre_parts": 1, "compte_tresorerie": "571"}, "caisse, une banque"),
            ({"nombre_parts": 1, "compte_tresorerie": "5851"}, "caisse, une banque"),
        ],
    )
    def test_encaissements_invalides(self, accueil, caissier, journee, parametres, message):
        membre = physique(accueil)
        with pytest.raises(ErreurMetier, match=message):
            services.encaisser_adhesion(
                membre, utilisateur=caissier, cle_idempotence=cle(), **parametres
            )
        assert not Ecriture.objects.exists()

    def test_journee_fermee(self, accueil, caissier, directeur, journee, agence):
        fermer_journee(agence, directeur)
        with pytest.raises(ErreurMetier, match="journée"):
            services.encaisser_adhesion(
                physique(accueil),
                nombre_parts=1,
                compte_tresorerie="5712",
                utilisateur=caissier,
                cle_idempotence=cle(),
            )

    def test_parts_supplementaires(self, client_api, accueil, caissier, journee):
        membre = physique(accueil)
        with pytest.raises(ErreurMetier, match="adhésion"):
            services.souscrire_parts(
                membre,
                nombre=1,
                compte_tresorerie="5712",
                utilisateur=caissier,
                cle_idempotence=cle(),
            )
        services.encaisser_adhesion(
            membre,
            nombre_parts=1,
            compte_tresorerie="5712",
            utilisateur=caissier,
            cle_idempotence=cle(),
        )
        reponse = client_api(caissier).post(
            f"/api/membres/{membre.pk}/parts-sociales",
            {"nombre": 3, "compte_tresorerie": "5712", "cle_idempotence": cle()},
            format="json",
        )
        assert reponse.status_code == 201, reponse.data
        assert services.nombre_parts(membre) == 4
        assert compta.solde("1013", "CDF") == D("-40000.00")
        assert len(client_api(caissier).get(f"/api/membres/{membre.pk}/parts-sociales").data) == 2


class TestDocuments:
    def test_depot_et_lecture_protegee(self, client_api, accueil, caissier, creer_utilisateur):
        membre = physique(accueil)
        depot = client_api(accueil).post(
            f"/api/membres/{membre.pk}/documents",
            {"type": "PHOTO", "fichier": fichier()},
            format="multipart",
        )
        assert depot.status_code == 201, depot.data
        assert depot.data["type_contenu"] == "image/jpeg"
        url = f"/api/membres/{membre.pk}/documents/{depot.data['id']}/fichier"

        lecture = client_api(caissier).get(url)  # le caissier vérifie la photo au guichet
        assert lecture.status_code == 200
        assert b"".join(lecture.streaming_content) == JPEG
        assert lecture["X-Content-Type-Options"] == "nosniff"
        assert lecture["Cache-Control"] == "private, no-store"

        comptable = creer_utilisateur("COMPTABLE", otp_active=True)
        assert client_api(comptable).get(url).status_code == 403
        assert (
            client_api(accueil).get(f"/api/membres/{membre.pk}").data["photo"] == depot.data["id"]
        )

    @pytest.mark.parametrize(
        "type_document, contenu, message",
        [
            ("PHOTO", PDF, "images"),
            ("PIECE_IDENTITE", b"MZ\x90\x00exe" * 10, "Format"),
            ("PIECE_IDENTITE", PDF + b"\x00" * (5 * 1024 * 1024), "volumineux"),
        ],
        ids=["pdf-en-photo", "executable", "trop-gros"],
    )
    def test_fichiers_refuses(self, accueil, type_document, contenu, message):
        with pytest.raises(ErreurMetier, match=message):
            services.ajouter_document(
                physique(accueil), type_document, fichier(contenu, "x.jpg"), accueil
            )
        assert not DocumentMembre.objects.exists()

    def test_documents_d_une_autre_agence(
        self, client_api, accueil, creer_utilisateur, autre_agence
    ):
        membre = physique(accueil)
        document = services.ajouter_document(membre, "PHOTO", fichier(), accueil)
        ailleurs = creer_utilisateur("CAISSIER", agence_=autre_agence)
        url = f"/api/membres/{membre.pk}/documents/{document.pk}/fichier"
        assert client_api(ailleurs).get(url).status_code == 404


class TestStatuts:
    def test_cycle_de_vie(self, client_api, accueil, chef, caissier, journee):
        membre = membre_actif(accueil, chef, caissier)
        client = client_api(chef)
        url = f"/api/membres/{membre.pk}/statut"
        assert (
            client.post(url, {"action": "suspendre", "motif": ""}, format="json").status_code == 400
        )
        assert (
            client.post(
                url, {"action": "suspendre", "motif": "Retards répétés"}, format="json"
            ).data["statut"]
            == "SUSPENDU"
        )
        assert (
            client.post(url, {"action": "reactiver", "motif": "Régularisé"}, format="json").data[
                "statut"
            ]
            == "ACTIF"
        )
        assert (
            client.post(url, {"action": "demission", "motif": "Déménagement"}, format="json").data[
                "statut"
            ]
            == "DEMISSIONNAIRE"
        )
        # Dossier clos : plus aucune modification
        modification = client.patch(
            f"/api/membres/{membre.pk}", {"telephone": "+243"}, format="json"
        )
        assert modification.status_code == 400
        historique = client.get(f"/api/membres/{membre.pk}/historique").data
        assert [h["nouveau"] for h in historique][:3] == ["DEMISSIONNAIRE", "ACTIF", "SUSPENDU"]

    def test_transition_impossible(self, accueil, chef):
        with pytest.raises(ErreurMetier, match="Impossible"):
            services.changer_statut(physique(accueil), "suspendre", "motif", chef)

    def test_liste_noire_bloque_l_activation_et_l_adhesion(self, accueil, chef, caissier, journee):
        membre = physique(accueil)
        services.liste_noire(membre, True, "Fraude avérée dans une autre IMF", chef)
        membre.refresh_from_db()
        assert "Membre inscrit sur la liste noire" in services.elements_manquants(membre)
        with pytest.raises(ErreurMetier, match="liste noire"):
            services.encaisser_adhesion(
                membre,
                nombre_parts=1,
                compte_tresorerie="5712",
                utilisateur=caissier,
                cle_idempotence=cle(),
            )


class TestGroupes:
    def test_constitution_et_activation_d_un_groupe(
        self, client_api, accueil, chef, caissier, journee
    ):
        membres = [
            membre_actif(accueil, chef, caissier, f"CE-10{i}", f"+24381000010{i}") for i in range(3)
        ]
        groupe = services.creer_membre(
            {"type": "GROUPE", "nom_groupe": "Les Battantes", "telephone": "+243810000999"}, accueil
        )
        client = client_api(accueil)
        url = f"/api/membres/{groupe.pk}/composition"
        for membre, fonction in zip(membres, ["PRESIDENT", "SECRETAIRE", "TRESORIER"], strict=True):
            reponse = client.post(url, {"membre": membre.pk, "fonction": fonction}, format="json")
            assert reponse.status_code == 201, reponse.data

        # Une seule présidente, et une personne n'est que dans un groupe à la fois
        doublon = client.post(url, {"membre": membres[0].pk, "fonction": "MEMBRE"}, format="json")
        assert "appartient déjà" in str(doublon.data)
        autre = physique(accueil, numero_piece="CE-200", telephone="+243810000200")
        assert "déjà un(e) président" in str(
            client.post(url, {"membre": autre.pk, "fonction": "PRESIDENT"}, format="json").data
        )

        assert "PV de constitution du groupe" in services.elements_manquants(groupe)
        services.ajouter_document(groupe, "PV_GROUPE", fichier(PDF, "pv.pdf"), accueil)
        services.encaisser_adhesion(
            groupe,
            nombre_parts=1,
            compte_tresorerie="5712",
            utilisateur=caissier,
            cle_idempotence=cle(),
        )
        assert services.activer(groupe, chef).statut == Membre.Statut.ACTIF
        assert client.get(f"/api/membres/{membres[0].pk}").data["groupe_actuel"]["nom"] == (
            "Les Battantes"
        )

    def test_groupe_et_membre_de_la_meme_agence(self, accueil, creer_utilisateur, autre_agence):
        groupe = services.creer_membre({"type": "GROUPE", "nom_groupe": "G"}, accueil)
        ailleurs = physique(creer_utilisateur("AGENT_RECEPTION", agence_=autre_agence))
        with pytest.raises(ErreurMetier, match="même agence"):
            services.ajouter_au_groupe(groupe, ailleurs, MembreGroupe.Fonction.MEMBRE, accueil)


class TestCloisonnement:
    def test_un_agent_ne_voit_que_son_agence(
        self, client_api, accueil, creer_utilisateur, autre_agence
    ):
        membre = physique(accueil)
        ailleurs = creer_utilisateur("AGENT_RECEPTION", agence_=autre_agence)
        assert client_api(ailleurs).get("/api/membres").data["count"] == 0
        assert client_api(ailleurs).get(f"/api/membres/{membre.pk}").status_code == 404
        assert client_api(accueil).get("/api/membres").data["count"] == 1

    def test_beneficiaires_limites_a_100_pourcent(self, client_api, accueil):
        membre = physique(accueil)
        url = f"/api/membres/{membre.pk}/beneficiaires"
        client = client_api(accueil)
        assert (
            client.post(
                url, {"nom_complet": "A", "lien": "Fils", "pourcentage": "60"}, format="json"
            ).status_code
            == 201
        )
        refus = client.post(
            url, {"nom_complet": "B", "lien": "Fille", "pourcentage": "50"}, format="json"
        )
        assert refus.status_code == 400
        assert "100 %" in str(refus.data)
