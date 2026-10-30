import pyotp
import pytest
from django.contrib.auth.models import Group, Permission
from django.core.files.uploadedfile import SimpleUploadedFile
from rest_framework.test import APIClient

from apps.accounts.models import JournalConnexion, Utilisateur
from conftest import MOT_DE_PASSE

# En-tête minimal JPEG (signature FF D8 FF).
JPEG = b"\xff\xd8\xff\xe0" + b"\x00" * 64

pytestmark = pytest.mark.django_db


@pytest.fixture
def navigateur():
    """Client qui se comporte comme le navigateur : cookies + contrôle CSRF actif."""
    client = APIClient(enforce_csrf_checks=True)
    client.get("/api/auth/csrf")
    client.csrf = client.cookies["csrftoken"].value
    return client


def post(client, url, data=None):
    return client.post(url, data or {}, format="json", HTTP_X_CSRFTOKEN=client.csrf)


def connexion(client, username, password=MOT_DE_PASSE, code_otp=None):
    data = {"username": username, "password": password}
    if code_otp:
        data["code_otp"] = code_otp
    return post(client, "/api/auth/connexion", data)


class TestConnexion:
    def test_connexion_pose_des_cookies_httponly(self, navigateur, creer_utilisateur):
        creer_utilisateur("CAISSIER", username="caissier")
        reponse = connexion(navigateur, "caissier")
        assert reponse.status_code == 200
        assert reponse.data["roles"] == ["CAISSIER"]
        assert navigateur.cookies["pc_access"]["httponly"]
        assert navigateur.cookies["pc_refresh"]["httponly"]
        assert navigateur.cookies["pc_session"].value == "1"
        assert navigateur.get("/api/auth/moi").data["username"] == "caissier"
        assert JournalConnexion.objects.filter(
            identifiant="caissier", evenement=JournalConnexion.Evenement.SUCCES
        ).exists()

    def test_requete_sans_jeton_csrf_refusee(self, navigateur, creer_utilisateur):
        creer_utilisateur("CAISSIER", username="caissier")
        connexion(navigateur, "caissier")
        reponse = navigateur.post("/api/auth/mot-de-passe", {"ancien": "x", "nouveau": "y"})
        assert reponse.status_code == 403
        assert "CSRF" in str(reponse.data)

    def test_mauvais_mot_de_passe(self, navigateur, creer_utilisateur):
        creer_utilisateur("CAISSIER", username="caissier")
        reponse = connexion(navigateur, "caissier", "mauvais")
        assert reponse.status_code == 401
        assert "pc_access" not in navigateur.cookies

    def test_verrouillage_apres_cinq_echecs(self, navigateur, creer_utilisateur):
        creer_utilisateur("CAISSIER", username="caissier")
        for _ in range(5):
            connexion(navigateur, "caissier", "mauvais")
        reponse = connexion(navigateur, "caissier")
        assert reponse.status_code == 429
        assert reponse.json()["code"] == "compte_verrouille"
        assert JournalConnexion.objects.filter(
            identifiant="caissier", evenement=JournalConnexion.Evenement.VERROUILLE
        ).exists()

    def test_rafraichir_puis_deconnexion(self, navigateur, creer_utilisateur):
        creer_utilisateur("CAISSIER", username="caissier")
        connexion(navigateur, "caissier")
        assert post(navigateur, "/api/auth/rafraichir").status_code == 204
        refresh = navigateur.cookies["pc_refresh"].value
        assert post(navigateur, "/api/auth/deconnexion").status_code == 204
        assert navigateur.cookies["pc_session"].value == ""
        navigateur.cookies["pc_refresh"] = refresh  # tentative de réutilisation après déconnexion
        assert post(navigateur, "/api/auth/rafraichir").status_code == 401


class TestObligations:
    def test_mot_de_passe_provisoire_a_changer(self, navigateur, creer_utilisateur):
        creer_utilisateur("CAISSIER", username="nouveau", doit_changer_mdp=True)
        connexion(navigateur, "nouveau")
        bloque = navigateur.get("/api/devises")
        assert bloque.status_code == 403
        assert bloque.data["code"] == "mdp_a_changer"
        change = post(
            navigateur,
            "/api/auth/mot-de-passe",
            {"ancien": MOT_DE_PASSE, "nouveau": "Nouveau-mdp-tres-solide-1"},
        )
        assert change.status_code == 204
        assert navigateur.get("/api/devises").status_code == 200

    def test_2fa_obligatoire_pour_le_comptable(self, navigateur, creer_utilisateur):
        user = creer_utilisateur("COMPTABLE", username="compta")
        connexion(navigateur, "compta")
        bloque = navigateur.get("/api/comptabilite/comptes")
        assert bloque.status_code == 403
        assert bloque.data["code"] == "2fa_obligatoire"

        secret = post(navigateur, "/api/auth/2fa/configurer").data["secret"]
        assert post(navigateur, "/api/auth/2fa/activer", {"code": "000000"}).status_code == 400
        code = pyotp.TOTP(secret).now()
        assert post(navigateur, "/api/auth/2fa/activer", {"code": code}).status_code == 204
        assert navigateur.get("/api/comptabilite/comptes").status_code == 200

        user.refresh_from_db()
        assert user.otp_active
        nouveau = APIClient(enforce_csrf_checks=True)
        nouveau.get("/api/auth/csrf")
        nouveau.csrf = nouveau.cookies["csrftoken"].value
        assert connexion(nouveau, "compta").data == {"otp_requis": True}
        assert "pc_access" not in nouveau.cookies
        assert connexion(nouveau, "compta", code_otp="123456").status_code == 401
        assert connexion(nouveau, "compta", code_otp=pyotp.TOTP(secret).now()).status_code == 200

    def test_essais_de_code_2fa_limites(self, navigateur, creer_utilisateur):
        user = creer_utilisateur(
            "CAISSIER", username="caissier", otp_active=True, otp_secret=pyotp.random_base32()
        )
        for _ in range(5):
            connexion(navigateur, "caissier", code_otp="000000")
        reponse = connexion(navigateur, "caissier", code_otp=pyotp.TOTP(user.otp_secret).now())
        assert reponse.status_code == 429


class TestProfil:
    def test_mettre_a_jour_informations(self, navigateur, creer_utilisateur):
        creer_utilisateur("CAISSIER", username="caissier", first_name="Jean")
        connexion(navigateur, "caissier")
        reponse = navigateur.patch(
            "/api/auth/moi",
            {
                "first_name": "Grace",
                "last_name": "Mbuyi",
                "email": "grace@exemple.cd",
                "telephone": "+243900000000",
            },
            format="json",
            HTTP_X_CSRFTOKEN=navigateur.csrf,
        )
        assert reponse.status_code == 200, reponse.data
        assert reponse.data["first_name"] == "Grace"
        assert reponse.data["last_name"] == "Mbuyi"
        assert reponse.data["email"] == "grace@exemple.cd"
        assert reponse.data["telephone"] == "+243900000000"
        assert reponse.data["photo"] is None

    def test_photo_profil_depot_lecture_suppression(self, navigateur, creer_utilisateur):
        user = creer_utilisateur("CAISSIER", username="caissier")
        connexion(navigateur, "caissier")
        depot = navigateur.post(
            "/api/auth/moi/photo",
            {"photo": SimpleUploadedFile("avatar.jpg", JPEG, content_type="image/jpeg")},
            format="multipart",
            HTTP_X_CSRFTOKEN=navigateur.csrf,
        )
        assert depot.status_code == 200, depot.data
        assert depot.data["photo"]
        user.refresh_from_db()
        assert user.photo

        lecture = navigateur.get("/api/auth/moi/photo")
        assert lecture.status_code == 200
        assert lecture["Content-Type"].startswith("image/")

        suppression = navigateur.delete("/api/auth/moi/photo", HTTP_X_CSRFTOKEN=navigateur.csrf)
        assert suppression.status_code == 200
        assert suppression.data["photo"] is None
        user.refresh_from_db()
        assert not user.photo

    def test_photo_refus_si_pas_une_image(self, navigateur, creer_utilisateur):
        creer_utilisateur("CAISSIER", username="caissier")
        connexion(navigateur, "caissier")
        reponse = navigateur.post(
            "/api/auth/moi/photo",
            {"photo": SimpleUploadedFile("x.txt", b"pas une image", content_type="text/plain")},
            format="multipart",
            HTTP_X_CSRFTOKEN=navigateur.csrf,
        )
        assert reponse.status_code == 400


class TestRoles:
    def test_permissions_resolues(self):
        admin = Group.objects.get(name="ADMINISTRATEUR")
        assert admin.permissions.count() == Permission.objects.count()
        reception = set(
            Group.objects.get(name="AGENT_RECEPTION").permissions.values_list("codename", flat=True)
        )
        assert "view_tauxchange" in reception
        assert "add_tauxchange" not in reception
        auditeur = Group.objects.get(name="AUDITEUR").permissions.values_list("codename", flat=True)
        assert not [p for p in auditeur if p.startswith(("add_", "change_", "delete_"))]

    def test_administrateur_cree_un_agent_de_reception(self, client_api, creer_utilisateur, agence):
        admin = creer_utilisateur("ADMINISTRATEUR", otp_active=True)
        reponse = client_api(admin).post(
            "/api/utilisateurs",
            {
                "username": "accueil1",
                "first_name": "Grâce",
                "last_name": "Mbuyi",
                "agence": agence.pk,
                "roles": ["AGENT_RECEPTION"],
                "mot_de_passe": "Provisoire-solide-2026",
                "is_active": True,
            },
            format="json",
        )
        assert reponse.status_code == 201, reponse.data
        cree = Utilisateur.objects.get(username="accueil1")
        assert cree.doit_changer_mdp
        assert cree.roles == ["AGENT_RECEPTION"]

        cree.doit_changer_mdp = False
        cree.save()
        refus = client_api(cree).get("/api/utilisateurs")
        assert refus.status_code == 403
        assert "code" not in refus.data  # refus de permission, pas une obligation en attente


def test_comptes_de_demonstration(settings):
    from django.core.management import CommandError, call_command

    settings.DEBUG = False
    with pytest.raises(CommandError, match="hors développement"):
        call_command("creer_comptes_demo")

    settings.DEBUG = True
    call_command("creer_comptes_demo")
    accueil = Utilisateur.objects.get(username="accueil.demo")
    assert accueil.roles == ["AGENT_RECEPTION"]
    assert accueil.agence.code == "AG001"
    assert accueil.check_password("Demo-ProxiCredit-2026")
    assert Utilisateur.objects.filter(username__endswith=".demo").count() == 10

    call_command("creer_comptes_demo", "--desactiver")
    assert not Utilisateur.objects.filter(username__endswith=".demo", is_active=True).exists()


def test_comptes_de_demonstration_serveur_de_test(settings):
    from django.core.management import CommandError, call_command

    settings.DEBUG = False
    settings.DEMO_AUTORISE = True
    with pytest.raises(CommandError, match="mot de passe propre"):
        call_command("creer_comptes_demo")

    call_command("creer_comptes_demo", "--mot-de-passe", "Partenaires-Test-2026!")
    caissier = Utilisateur.objects.get(username="caissier.demo")
    assert caissier.is_active
    assert caissier.check_password("Partenaires-Test-2026!")
    assert not caissier.check_password("Demo-ProxiCredit-2026")

    # La désactivation reste possible sans mot de passe propre.
    call_command("creer_comptes_demo", "--desactiver")
    assert not Utilisateur.objects.filter(username__endswith=".demo", is_active=True).exists()
