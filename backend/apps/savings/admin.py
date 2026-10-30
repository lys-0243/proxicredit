from django.contrib import admin
from simple_history.admin import SimpleHistoryAdmin

from apps.savings.models import CompteEpargne, ProduitEpargne


@admin.register(ProduitEpargne)
class ProduitEpargneAdmin(SimpleHistoryAdmin):
    list_display = ["code", "libelle", "type", "devise", "compte", "retrait_libre", "actif"]
    list_filter = ["type", "devise", "actif"]


@admin.register(CompteEpargne)
class CompteEpargneAdmin(admin.ModelAdmin):
    """Consultation seule : le solde n'évolue que par des mouvements comptabilisés."""

    list_display = ["numero", "membre", "produit", "devise", "solde", "statut"]
    list_filter = ["statut", "produit", "agence"]
    search_fields = ["numero", "membre__numero", "membre__nom_complet"]

    def has_add_permission(self, request):
        return False

    def has_change_permission(self, request, obj=None):
        return False

    def has_delete_permission(self, request, obj=None):
        return False
