from django.contrib import admin
from django.contrib.auth.admin import UserAdmin
from simple_history.admin import SimpleHistoryAdmin

from apps.accounts.models import JournalConnexion, Utilisateur


@admin.register(Utilisateur)
class UtilisateurAdmin(UserAdmin, SimpleHistoryAdmin):
    list_display = ["username", "first_name", "last_name", "agence", "is_active", "otp_active"]
    list_filter = ["agence", "is_active", "groups"]
    fieldsets = UserAdmin.fieldsets + (
        ("ProxiCrédit", {"fields": ("agence", "telephone", "otp_active", "doit_changer_mdp")}),
    )


@admin.register(JournalConnexion)
class JournalConnexionAdmin(admin.ModelAdmin):
    list_display = ["date", "identifiant", "evenement", "adresse_ip"]
    list_filter = ["evenement"]
    search_fields = ["identifiant"]

    def has_change_permission(self, request, obj=None):
        return False

    def has_delete_permission(self, request, obj=None):
        return False
