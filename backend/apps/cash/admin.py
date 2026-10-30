from django.contrib import admin
from simple_history.admin import SimpleHistoryAdmin

from apps.cash.models import Caisse, OperationCaisse, SessionCaisse


@admin.register(Caisse)
class CaisseAdmin(SimpleHistoryAdmin):
    list_display = ["code", "libelle", "agence", "type", "compte", "active"]
    list_filter = ["agence", "type", "active"]


class ConsultationSeuleAdmin(admin.ModelAdmin):
    """Les sessions et opérations passent exclusivement par l'application."""

    def has_add_permission(self, request):
        return False

    def has_change_permission(self, request, obj=None):
        return False

    def has_delete_permission(self, request, obj=None):
        return False


@admin.register(SessionCaisse)
class SessionCaisseAdmin(ConsultationSeuleAdmin):
    list_display = ["caisse", "caissier", "date_comptable", "statut", "ouverte_le", "fermee_le"]
    list_filter = ["statut", "caisse__agence"]


@admin.register(OperationCaisse)
class OperationCaisseAdmin(ConsultationSeuleAdmin):
    list_display = ["session", "type_operation", "sens", "montant", "devise", "cree_le"]
    list_filter = ["sens", "devise", "type_operation"]
