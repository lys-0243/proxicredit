from django.contrib import admin
from simple_history.admin import SimpleHistoryAdmin

from apps.accounting.models import (
    CompteComptable,
    Ecriture,
    Journal,
    LigneEcriture,
    RegleComptable,
    RegleComptableLigne,
)


@admin.register(CompteComptable)
class CompteComptableAdmin(SimpleHistoryAdmin):
    list_display = ["numero", "libelle", "classe", "sens_normal", "est_mouvementable", "actif"]
    list_filter = ["classe", "est_mouvementable", "actif"]
    search_fields = ["numero", "libelle"]


@admin.register(Journal)
class JournalAdmin(admin.ModelAdmin):
    list_display = ["code", "libelle", "actif"]


class LigneEcritureInline(admin.TabularInline):
    model = LigneEcriture
    extra = 0

    def has_change_permission(self, request, obj=None):
        return False

    def has_add_permission(self, request, obj=None):
        return False

    def has_delete_permission(self, request, obj=None):
        return False


@admin.register(Ecriture)
class EcritureAdmin(admin.ModelAdmin):
    """Consultation seule : les écritures passent exclusivement par les services comptables."""

    list_display = ["numero", "date_comptable", "journal", "agence", "devise", "libelle", "statut"]
    list_filter = ["statut", "journal", "agence", "devise"]
    search_fields = ["numero", "libelle", "reference"]
    inlines = [LigneEcritureInline]

    def has_add_permission(self, request):
        return False

    def has_change_permission(self, request, obj=None):
        return False

    def has_delete_permission(self, request, obj=None):
        return False


class RegleComptableLigneInline(admin.TabularInline):
    model = RegleComptableLigne
    extra = 1


@admin.register(RegleComptable)
class RegleComptableAdmin(SimpleHistoryAdmin):
    list_display = ["type_operation", "code_produit", "devise", "journal", "actif"]
    list_filter = ["type_operation", "actif"]
    inlines = [RegleComptableLigneInline]
