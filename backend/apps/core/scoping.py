"""Filtrage des données par agence selon les droits de l'utilisateur."""


def voit_toutes_agences(user) -> bool:
    return user.is_superuser or user.has_perm("core.voir_toutes_agences")


class FiltreAgenceMixin:
    """ViewSet dont le modèle porte un champ `agence` : l'utilisateur ne voit que son agence,
    sauf s'il a la permission de voir toutes les agences (siège)."""

    champ_agence = "agence"

    def get_queryset(self):
        qs = super().get_queryset()
        user = self.request.user
        if voit_toutes_agences(user):
            agence = self.request.query_params.get("agence")
            return qs.filter(**{self.champ_agence: agence}) if agence else qs
        return qs.filter(**{self.champ_agence: user.agence_id})
