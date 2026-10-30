from django.apps import AppConfig


class CashConfig(AppConfig):
    name = "apps.cash"
    verbose_name = "Caisse"

    def ready(self):
        from apps.cash.services import controle_sessions_fermees
        from apps.core.services import CONTROLES_FERMETURE

        CONTROLES_FERMETURE.append(controle_sessions_fermees)
