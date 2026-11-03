import mimetypes

import pyotp
from axes.utils import reset as axes_reset
from django.conf import settings
from django.contrib.auth import authenticate, update_session_auth_hash
from django.contrib.auth.models import Group
from django.http import FileResponse, JsonResponse
from django.utils import timezone
from django.utils.decorators import method_decorator
from django.views.decorators.csrf import ensure_csrf_cookie
from drf_spectacular.utils import extend_schema
from rest_framework import mixins, status, viewsets
from rest_framework.decorators import action
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework_simplejwt.exceptions import TokenError
from rest_framework_simplejwt.serializers import TokenRefreshSerializer
from rest_framework_simplejwt.tokens import RefreshToken

from apps.accounts import serializers as s
from apps.accounts.authentication import verifier_csrf
from apps.accounts.models import JournalConnexion, Utilisateur
from apps.core.audit import adresse_ip
from apps.core.exceptions import ErreurMetier
from apps.core.scoping import FiltreAgenceMixin

TAILLE_MAX_PHOTO = 2 * 1024 * 1024
SIGNATURES_PHOTO = {
    "image/jpeg": (b"\xff\xd8\xff",),
    "image/png": (b"\x89PNG\r\n\x1a\n",),
}


def _extension_photo(fichier) -> str:
    if getattr(fichier, "size", 0) > TAILLE_MAX_PHOTO:
        raise ErreurMetier("Photo trop volumineuse (2 Mo maximum).", "taille")
    debut = fichier.read(8)
    fichier.seek(0)
    for type_contenu, signatures in SIGNATURES_PHOTO.items():
        if any(debut.startswith(sig) for sig in signatures):
            return {"image/jpeg": "jpg", "image/png": "png"}[type_contenu]
    raise ErreurMetier("Format non accepté : JPEG ou PNG uniquement.", "format")


EMETTEUR_OTP = "ProxiCrédit"


def _journaliser(request, identifiant, evenement, utilisateur=None):
    JournalConnexion.objects.create(
        utilisateur=utilisateur,
        identifiant=identifiant[:150],
        evenement=evenement,
        adresse_ip=adresse_ip(request),
        navigateur=request.META.get("HTTP_USER_AGENT", "")[:255],
    )


def _poser_cookies(reponse, access: str, refresh: str | None = None):
    options = {
        "httponly": True,
        "secure": settings.AUTH_COOKIE_SECURE,
        "samesite": settings.AUTH_COOKIE_SAMESITE,
    }
    duree_access = int(settings.SIMPLE_JWT["ACCESS_TOKEN_LIFETIME"].total_seconds())
    reponse.set_cookie(
        settings.AUTH_COOKIE_ACCESS, access, max_age=duree_access, path="/", **options
    )
    if refresh:
        duree_refresh = int(settings.SIMPLE_JWT["REFRESH_TOKEN_LIFETIME"].total_seconds())
        reponse.set_cookie(
            settings.AUTH_COOKIE_REFRESH,
            refresh,
            max_age=duree_refresh,
            path="/api/auth",
            **options,
        )
        # Témoin sans valeur secrète, visible sur tout le site : le frontend sait qu'une session
        # existe (et qu'il peut la rafraîchir) même quand le jeton d'accès a expiré.
        reponse.set_cookie(
            settings.AUTH_COOKIE_SESSION, "1", max_age=duree_refresh, path="/", **options
        )


def _effacer_cookies(reponse):
    reponse.delete_cookie(settings.AUTH_COOKIE_ACCESS, path="/")
    reponse.delete_cookie(settings.AUTH_COOKIE_REFRESH, path="/api/auth")
    reponse.delete_cookie(settings.AUTH_COOKIE_SESSION, path="/")


MESSAGE_VERROUILLAGE = "Compte verrouillé après plusieurs échecs. Réessayez dans 30 minutes."


def reponse_verrouillage(request, original_response=None, credentials=None):
    """Réponse renvoyée par django-axes quand un identifiant est verrouillé."""
    return JsonResponse(
        {"detail": MESSAGE_VERROUILLAGE, "code": "compte_verrouille"},
        status=status.HTTP_429_TOO_MANY_REQUESTS,
    )


def _code_valide(user, code: str) -> bool:
    return bool(user.otp_secret) and pyotp.TOTP(user.otp_secret).verify(code, valid_window=1)


def _trop_echecs_otp(user) -> bool:
    """Le mot de passe correct remet à zéro le compteur d'axes : on limite donc aussi les
    essais de code 2FA, sur la même fenêtre que le verrouillage."""
    depuis = timezone.now() - settings.AXES_COOLOFF_TIME
    return (
        JournalConnexion.objects.filter(
            utilisateur=user, evenement=JournalConnexion.Evenement.OTP_ECHEC, date__gte=depuis
        ).count()
        >= settings.AXES_FAILURE_LIMIT
    )


@method_decorator(ensure_csrf_cookie, name="get")
class CsrfView(APIView):
    """Pose le cookie CSRF : à appeler avant la première requête POST."""

    authentication_classes = []
    permission_classes = [AllowAny]

    @extend_schema(responses={200: dict})
    def get(self, request):
        return Response({"detail": "ok"})


class ConnexionView(APIView):
    authentication_classes = []
    permission_classes = [AllowAny]

    @extend_schema(request=s.ConnexionSerializer, responses=s.MoiSerializer)
    def post(self, request):
        verifier_csrf(request)
        ser = s.ConnexionSerializer(data=request.data)
        ser.is_valid(raise_exception=True)
        identifiant = ser.validated_data["username"]
        user = authenticate(
            request._request, username=identifiant, password=ser.validated_data["password"]
        )
        if user is None:
            if getattr(request._request, "axes_locked_out", False):
                _journaliser(request, identifiant, JournalConnexion.Evenement.VERROUILLE)
                return reponse_verrouillage(request)
            _journaliser(request, identifiant, JournalConnexion.Evenement.ECHEC)
            return Response(
                {"detail": "Identifiant ou mot de passe incorrect.", "code": "identifiants"},
                status=status.HTTP_401_UNAUTHORIZED,
            )

        if user.otp_active:
            code = ser.validated_data.get("code_otp")
            if not code:
                return Response({"otp_requis": True}, status=status.HTTP_200_OK)
            if _trop_echecs_otp(user):
                _journaliser(request, identifiant, JournalConnexion.Evenement.VERROUILLE, user)
                return reponse_verrouillage(request)
            if not _code_valide(user, code):
                _journaliser(request, identifiant, JournalConnexion.Evenement.OTP_ECHEC, user)
                return Response(
                    {"detail": "Code de vérification invalide.", "code": "otp_invalide"},
                    status=status.HTTP_401_UNAUTHORIZED,
                )

        refresh = RefreshToken.for_user(user)
        _journaliser(request, identifiant, JournalConnexion.Evenement.SUCCES, user)
        reponse = Response(s.MoiSerializer(user).data)
        _poser_cookies(reponse, str(refresh.access_token), str(refresh))
        return reponse


class RafraichirView(APIView):
    authentication_classes = []
    permission_classes = [AllowAny]

    @extend_schema(request=None, responses={204: None})
    def post(self, request):
        verifier_csrf(request)
        jeton = request.COOKIES.get(settings.AUTH_COOKIE_REFRESH)
        if not jeton:
            # On efface aussi le témoin de session, sinon le frontend bouclerait entre la page
            # de connexion et l'application.
            reponse = Response({"detail": "Session expirée."}, status=status.HTTP_401_UNAUTHORIZED)
            _effacer_cookies(reponse)
            return reponse
        ser = TokenRefreshSerializer(data={"refresh": jeton})
        try:
            ser.is_valid(raise_exception=True)
        except TokenError:
            reponse = Response({"detail": "Session expirée."}, status=status.HTTP_401_UNAUTHORIZED)
            _effacer_cookies(reponse)
            return reponse
        reponse = Response(status=status.HTTP_204_NO_CONTENT)
        _poser_cookies(reponse, ser.validated_data["access"], ser.validated_data.get("refresh"))
        return reponse


class DeconnexionView(APIView):
    permission_classes = [IsAuthenticated]
    exempt_obligations = True

    @extend_schema(request=None, responses={204: None})
    def post(self, request):
        jeton = request.COOKIES.get(settings.AUTH_COOKIE_REFRESH)
        if jeton:
            try:
                RefreshToken(jeton).blacklist()
            except TokenError:
                pass
        _journaliser(
            request, request.user.username, JournalConnexion.Evenement.DECONNEXION, request.user
        )
        reponse = Response(status=status.HTTP_204_NO_CONTENT)
        _effacer_cookies(reponse)
        return reponse


class MoiView(APIView):
    permission_classes = [IsAuthenticated]
    exempt_obligations = True

    @extend_schema(responses=s.MoiSerializer)
    def get(self, request):
        return Response(s.MoiSerializer(request.user).data)

    @extend_schema(request=s.MettreAJourProfilSerializer, responses=s.MoiSerializer)
    def patch(self, request):
        ser = s.MettreAJourProfilSerializer(request.user, data=request.data, partial=True)
        ser.is_valid(raise_exception=True)
        ser.save()
        return Response(s.MoiSerializer(request.user).data)


class PhotoProfilView(APIView):
    """Photo de profil : lecture authentifiée, dépôt et suppression par le titulaire du compte."""

    permission_classes = [IsAuthenticated]
    exempt_obligations = True

    @extend_schema(responses={200: bytes, 404: None})
    def get(self, request):
        if not request.user.photo:
            return Response(status=status.HTTP_404_NOT_FOUND)
        type_contenu = (
            mimetypes.guess_type(request.user.photo.name)[0] or "application/octet-stream"
        )
        reponse = FileResponse(request.user.photo.open("rb"), content_type=type_contenu)
        reponse["Cache-Control"] = "private, max-age=3600"
        return reponse

    @extend_schema(request=s.PhotoProfilSerializer, responses=s.MoiSerializer)
    def post(self, request):
        ser = s.PhotoProfilSerializer(data=request.data)
        ser.is_valid(raise_exception=True)
        fichier = ser.validated_data["photo"]
        extension = _extension_photo(fichier)
        user = request.user
        if user.photo:
            user.photo.delete(save=False)
        user.photo.save(f"photo.{extension}", fichier, save=True)
        return Response(s.MoiSerializer(user).data)

    @extend_schema(request=None, responses=s.MoiSerializer)
    def delete(self, request):
        user = request.user
        if user.photo:
            user.photo.delete(save=True)
        return Response(s.MoiSerializer(user).data)


class ChangerMotDePasseView(APIView):
    permission_classes = [IsAuthenticated]
    exempt_obligations = True

    @extend_schema(request=s.ChangerMotDePasseSerializer, responses={204: None})
    def post(self, request):
        ser = s.ChangerMotDePasseSerializer(data=request.data, context={"request": request})
        ser.is_valid(raise_exception=True)
        user = request.user
        user.set_password(ser.validated_data["nouveau"])
        user.doit_changer_mdp = False
        user.save(update_fields=["password", "doit_changer_mdp"])
        update_session_auth_hash(request, user)
        return Response(status=status.HTTP_204_NO_CONTENT)


class Configurer2FAView(APIView):
    """Génère un nouveau secret TOTP (non actif tant qu'il n'est pas confirmé par un code)."""

    permission_classes = [IsAuthenticated]
    exempt_obligations = True

    @extend_schema(request=None, responses={200: dict})
    def post(self, request):
        user = request.user
        if user.otp_active:
            return Response(
                {"detail": "La 2FA est déjà active."}, status=status.HTTP_400_BAD_REQUEST
            )
        user.otp_secret = pyotp.random_base32()
        user.save(update_fields=["otp_secret"])
        uri = pyotp.TOTP(user.otp_secret).provisioning_uri(user.username, issuer_name=EMETTEUR_OTP)
        return Response({"secret": user.otp_secret, "uri": uri})


class Activer2FAView(APIView):
    permission_classes = [IsAuthenticated]
    exempt_obligations = True

    @extend_schema(request=s.CodeOtpSerializer, responses={204: None})
    def post(self, request):
        ser = s.CodeOtpSerializer(data=request.data)
        ser.is_valid(raise_exception=True)
        user = request.user
        if not _code_valide(user, ser.validated_data["code"]):
            return Response({"detail": "Code invalide."}, status=status.HTTP_400_BAD_REQUEST)
        user.otp_active = True
        user.save(update_fields=["otp_active"])
        return Response(status=status.HTTP_204_NO_CONTENT)


class Desactiver2FAView(APIView):
    permission_classes = [IsAuthenticated]

    @extend_schema(request=s.Desactiver2FASerializer, responses={204: None})
    def post(self, request):
        ser = s.Desactiver2FASerializer(data=request.data)
        ser.is_valid(raise_exception=True)
        user = request.user
        if not user.check_password(ser.validated_data["mot_de_passe"]) or not _code_valide(
            user, ser.validated_data["code"]
        ):
            return Response(
                {"detail": "Mot de passe ou code invalide."}, status=status.HTTP_400_BAD_REQUEST
            )
        if any(r in settings.ROLES_2FA_OBLIGATOIRE for r in user.roles):
            return Response(
                {"detail": "La 2FA est obligatoire pour votre rôle."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        user.otp_active = False
        user.otp_secret = ""
        user.save(update_fields=["otp_active", "otp_secret"])
        return Response(status=status.HTTP_204_NO_CONTENT)


class UtilisateurViewSet(
    FiltreAgenceMixin,
    mixins.ListModelMixin,
    mixins.RetrieveModelMixin,
    mixins.CreateModelMixin,
    mixins.UpdateModelMixin,
    viewsets.GenericViewSet,
):
    queryset = Utilisateur.objects.select_related("agence").prefetch_related("groups")
    serializer_class = s.UtilisateurSerializer
    search_fields = ["username", "first_name", "last_name", "email"]
    filterset_fields = ["is_active", "groups__name"]
    permissions_action = {
        "reinitialiser_mot_de_passe": ["accounts.change_utilisateur"],
        "deverrouiller": ["accounts.change_utilisateur"],
        "reinitialiser_2fa": ["accounts.change_utilisateur"],
    }

    @extend_schema(request=s.ReinitialiserMotDePasseSerializer, responses={204: None})
    @action(detail=True, methods=["post"], url_path="reinitialiser-mot-de-passe")
    def reinitialiser_mot_de_passe(self, request, pk=None):
        user = self.get_object()
        ser = s.ReinitialiserMotDePasseSerializer(data=request.data)
        ser.is_valid(raise_exception=True)
        user.set_password(ser.validated_data["mot_de_passe"])
        user.doit_changer_mdp = True
        user.save(update_fields=["password", "doit_changer_mdp"])
        return Response(status=status.HTTP_204_NO_CONTENT)

    @extend_schema(request=None, responses={204: None})
    @action(detail=True, methods=["post"])
    def deverrouiller(self, request, pk=None):
        axes_reset(username=self.get_object().username)
        return Response(status=status.HTTP_204_NO_CONTENT)

    @extend_schema(request=None, responses={204: None})
    @action(detail=True, methods=["post"], url_path="reinitialiser-2fa")
    def reinitialiser_2fa(self, request, pk=None):
        user = self.get_object()
        user.otp_active = False
        user.otp_secret = ""
        user.save(update_fields=["otp_active", "otp_secret"])
        return Response(status=status.HTTP_204_NO_CONTENT)


class RoleViewSet(viewsets.ReadOnlyModelViewSet):
    queryset = Group.objects.order_by("name")
    serializer_class = s.RoleSerializer
    pagination_class = None
    permissions_action = {"list": [], "retrieve": []}


class JournalConnexionViewSet(viewsets.ReadOnlyModelViewSet):
    queryset = JournalConnexion.objects.all()
    serializer_class = s.JournalConnexionSerializer
    filterset_fields = ["evenement", "utilisateur"]
    search_fields = ["identifiant"]
