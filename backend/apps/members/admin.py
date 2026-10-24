from django.contrib import admin
from simple_history.admin import SimpleHistoryAdmin

from apps.members.models import DocumentMembre, HistoriqueStatut, Membre, MembreGroupe


@admin.register(Membre)
class MembreAdmin(SimpleHistoryAdmin):
    """Consultation et dépannage : la gestion courante se fait dans l'application."""

    list_display = ["numero", "nom_complet", "type", "statut", "agence", "en_liste_noire"]
    list_filter = ["type", "statut", "agence", "en_liste_noire"]
    search_fields = ["numero", "nom_complet", "telephone", "numero_piece"]
    readonly_fields = ["numero", "nom_complet", "statut", "cree_par", "active_par", "active_le"]

    def has_delete_permission(self, request, obj=None):
        return False


@admin.register(DocumentMembre)
class DocumentMembreAdmin(admin.ModelAdmin):
    list_display = ["membre", "type", "nom_origine", "ajoute_par", "ajoute_le"]
    list_filter = ["type"]
    exclude = ["fichier"]  # jamais de lien direct vers un fichier KYC

    def has_add_permission(self, request):
        return False

    def has_change_permission(self, request, obj=None):
        return False

    def has_delete_permission(self, request, obj=None):
        return False


admin.site.register(MembreGroupe)
admin.site.register(HistoriqueStatut)
