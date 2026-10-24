from django.apps import AppConfig


class CoreConfig(AppConfig):
    name = "apps.core"
    verbose_name = "Paramétrage"

    def ready(self):
        from apps.core import audit  # noqa: F401 - connecte les signaux d'audit
