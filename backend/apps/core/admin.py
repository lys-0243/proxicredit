from django.contrib import admin
from simple_history.admin import SimpleHistoryAdmin

from apps.core.models import Agence, Devise, JourFerie, JourneeComptable, Parametre, TauxChange


@admin.register(Devise)
class DeviseAdmin(SimpleHistoryAdmin):
    """Les devises (CDF et USD) sont créées par `manage.py initialiser`, jamais à la main."""

    list_display = ["code", "nom", "symbole", "decimales", "est_reference", "active"]
    readonly_fields = ["code", "decimales", "est_reference"]

    def has_add_permission(self, request):
        return False

    def has_delete_permission(self, request, obj=None):
        return False


@admin.register(Agence)
class AgenceAdmin(SimpleHistoryAdmin):
    list_display = ["code", "nom", "est_siege", "active"]


@admin.register(TauxChange)
class TauxChangeAdmin(SimpleHistoryAdmin):
    list_display = [
        "date",
        "devise_source",
        "devise_cible",
        "taux_achat",
        "taux_vente",
        "taux_reference",
    ]
    list_filter = ["devise_source", "devise_cible"]


@admin.register(JourFerie)
class JourFerieAdmin(admin.ModelAdmin):
    list_display = ["date", "libelle", "recurrent"]


@admin.register(JourneeComptable)
class JourneeComptableAdmin(admin.ModelAdmin):
    list_display = ["agence", "date", "statut", "ouverte_par", "fermee_par"]
    list_filter = ["agence", "statut"]


@admin.register(Parametre)
class ParametreAdmin(SimpleHistoryAdmin):
    list_display = ["cle", "date_effet", "valeur"]
    list_filter = ["cle"]
