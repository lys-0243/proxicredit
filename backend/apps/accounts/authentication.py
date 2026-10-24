from django.conf import settings
from rest_framework import exceptions
from rest_framework.authentication import CSRFCheck
from rest_framework_simplejwt.authentication import JWTAuthentication


def verifier_csrf(request) -> None:
    """Les jetons étant dans des cookies, toute requête non sûre doit porter le jeton CSRF."""
    check = CSRFCheck(lambda req: None)
    check.process_request(request)
    raison = check.process_view(request, None, (), {})
    if raison:
        raise exceptions.PermissionDenied(f"Échec de la vérification CSRF : {raison}")


class CookieJWTAuthentication(JWTAuthentication):
    """JWT lu dans le cookie httpOnly (navigateur) ou dans l'en-tête Authorization (clients API)."""

    def authenticate(self, request):
        entete = self.get_header(request)
        if entete is not None:
            brut = self.get_raw_token(entete)
            via_cookie = False
        else:
            brut = request.COOKIES.get(settings.AUTH_COOKIE_ACCESS)
            via_cookie = True
        if brut is None:
            return None
        jeton = self.get_validated_token(brut)
        utilisateur = self.get_user(jeton)
        if via_cookie:
            verifier_csrf(request)
        return utilisateur, jeton

    def authenticate_header(self, request):
        # 401 (et non 403) si le jeton est absent ou expiré : le client sait qu'il doit rafraîchir.
        return 'Bearer realm="api"'
