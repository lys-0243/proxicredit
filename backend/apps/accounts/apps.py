from django.apps import AppConfig


class AccountsConfig(AppConfig):
    name = "apps.accounts"
    verbose_name = "Utilisateurs et sécurité"

    def ready(self):
        from apps.accounts import schema  # noqa: F401 - extension OpenAPI de l'authentification
