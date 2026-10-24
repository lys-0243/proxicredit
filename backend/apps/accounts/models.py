from django.conf import settings
from django.contrib.auth.models import AbstractUser
from django.db import models
from simple_history.models import HistoricalRecords

from apps.core.audit import ModeleHistoriqueAudit


class Utilisateur(AbstractUser):
    agence = models.ForeignKey(
        "core.Agence", on_delete=models.PROTECT, null=True, blank=True, related_name="utilisateurs"
    )
    telephone = models.CharField(max_length=30, blank=True)
    otp_secret = models.CharField(max_length=64, blank=True)
    otp_active = models.BooleanField("2FA activée", default=False)
    doit_changer_mdp = models.BooleanField("doit changer son mot de passe", default=False)

    history = HistoricalRecords(
        bases=[ModeleHistoriqueAudit], excluded_fields=["password", "last_login", "otp_secret"]
    )

    class Meta:
        verbose_name = "utilisateur"
        ordering = ["username"]

    @property
    def roles(self) -> list[str]:
        return [g.name for g in self.groups.all()]

    @property
    def doit_configurer_2fa(self) -> bool:
        if self.otp_active:
            return False
        return any(r in settings.ROLES_2FA_OBLIGATOIRE for r in self.roles)


class JournalConnexion(models.Model):
    class Evenement(models.TextChoices):
        SUCCES = "SUCCES", "Connexion réussie"
        ECHEC = "ECHEC", "Échec"
        VERROUILLE = "VERROUILLE", "Compte verrouillé"
        OTP_ECHEC = "OTP_ECHEC", "Code 2FA invalide"
        DECONNEXION = "DECONNEXION", "Déconnexion"

    utilisateur = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, blank=True
    )
    identifiant = models.CharField(max_length=150)
    evenement = models.CharField(max_length=12, choices=Evenement.choices)
    adresse_ip = models.GenericIPAddressField(null=True, blank=True)
    navigateur = models.CharField(max_length=255, blank=True)
    date = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-date"]
        verbose_name = "journal de connexion"
        verbose_name_plural = "journal des connexions"

    def __str__(self):
        return f"{self.date:%d/%m/%Y %H:%M} {self.identifiant} {self.evenement}"
