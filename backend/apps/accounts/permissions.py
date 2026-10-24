from rest_framework import exceptions
from rest_framework.permissions import DjangoModelPermissions


def verifier_obligations(user, view) -> None:
    """Bloque l'accès tant que le mot de passe provisoire n'est pas changé ou que la 2FA
    obligatoire n'est pas configurée."""
    if getattr(view, "exempt_obligations", False):
        return
    if user.doit_changer_mdp:
        raise exceptions.PermissionDenied(
            {"detail": "Vous devez changer votre mot de passe.", "code": "mdp_a_changer"}
        )
    if user.doit_configurer_2fa:
        raise exceptions.PermissionDenied(
            {
                "detail": "La double authentification est obligatoire pour votre rôle.",
                "code": "2fa_obligatoire",
            }
        )


class PermissionsModele(DjangoModelPermissions):
    """Permission par défaut de l'API (refus par défaut).

    - `permissions_action = {"valider": ["accounting.valider_ecriture"]}` : permissions exigées
      pour une action précise d'un ViewSet ;
    - `permissions_requises = [...]` : permissions exigées pour une APIView sans modèle ;
    - sinon, permissions du modèle (y compris `view_*` pour la lecture).
    """

    perms_map = {
        **DjangoModelPermissions.perms_map,
        "GET": ["%(app_label)s.view_%(model_name)s"],
        "HEAD": ["%(app_label)s.view_%(model_name)s"],
    }

    def has_permission(self, request, view):
        user = request.user
        if not (user and user.is_authenticated):
            return False
        verifier_obligations(user, view)
        action = getattr(view, "action", None)
        par_action = getattr(view, "permissions_action", {})
        if action in par_action:
            return user.has_perms(par_action[action])
        requises = getattr(view, "permissions_requises", None)
        if requises is not None:
            return user.has_perms(requises)
        if hasattr(view, "get_queryset"):
            return super().has_permission(request, view)
        return False
