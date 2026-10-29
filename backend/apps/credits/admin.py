from django.contrib import admin
from simple_history.admin import SimpleHistoryAdmin

from apps.credits.models import Credit, PlafondCredit, ProduitCredit


class PlafondCreditInline(admin.TabularInline):
    model = PlafondCredit
    extra = 0


@admin.register(ProduitCredit)
class ProduitCreditAdmin(SimpleHistoryAdmin):
    list_display = ["code", "libelle", "methode", "periodicite", "taux_interet", "actif"]
    inlines = [PlafondCreditInline]


@admin.register(Credit)
class CreditAdmin(SimpleHistoryAdmin):
    """Consultation seule : le dossier avance exclusivement par le circuit de l'application."""

    list_display = ["numero", "membre", "produit", "devise", "montant_demande", "statut"]
    list_filter = ["statut", "produit", "agence"]
    search_fields = ["numero", "membre__numero", "membre__nom_complet"]

    def has_add_permission(self, request):
        return False

    def has_change_permission(self, request, obj=None):
        return False

    def has_delete_permission(self, request, obj=None):
        return False
