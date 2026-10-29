from django.apps import AppConfig


class CreditsConfig(AppConfig):
    name = "apps.credits"
    verbose_name = "Crédit"

    def ready(self):
        from apps.credits.services import bloque_par_credits, controle_sortie_membre
        from apps.members.services import CONTROLES_DEMISSION
        from apps.savings.services import BLOCAGES

        CONTROLES_DEMISSION.append(controle_sortie_membre)
        BLOCAGES.append(bloque_par_credits)
