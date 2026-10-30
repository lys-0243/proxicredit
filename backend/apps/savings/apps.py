from django.apps import AppConfig


class SavingsConfig(AppConfig):
    name = "apps.savings"
    verbose_name = "Épargne"

    def ready(self):
        from apps.members.services import CONDITIONS_ACTIVATION, CONTROLES_DEMISSION
        from apps.savings.services import condition_depot_initial, controle_sortie_membre

        CONTROLES_DEMISSION.append(controle_sortie_membre)
        CONDITIONS_ACTIVATION.append(condition_depot_initial)
