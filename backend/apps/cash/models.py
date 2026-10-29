from django.conf import settings
from django.db import models
from django.db.models import Q
from simple_history.models import HistoricalRecords

from apps.core.audit import ModeleHistoriqueAudit
from apps.core.models import Horodatage, champ_montant


class Caisse(Horodatage):
    """Guichet d'un caissier ou coffre de l'agence. Plusieurs guichets peuvent partager le même
    compte comptable : le solde propre à chacun est suivi par ses sessions."""

    class Type(models.TextChoices):
        GUICHET = "GUICHET", "Guichet"
        COFFRE = "COFFRE", "Coffre"

    agence = models.ForeignKey("core.Agence", on_delete=models.PROTECT, related_name="caisses")
    code = models.CharField(max_length=10)
    libelle = models.CharField(max_length=100)
    type = models.CharField(max_length=10, choices=Type.choices, default=Type.GUICHET)
    compte = models.ForeignKey(
        "accounting.CompteComptable",
        on_delete=models.PROTECT,
        related_name="+",
        help_text="Compte de caisse (57x) mouvementé par les opérations.",
    )
    active = models.BooleanField(default=True)

    history = HistoricalRecords(bases=[ModeleHistoriqueAudit])

    class Meta:
        ordering = ["agence", "type", "code"]
        permissions = [
            ("ouvrir_session_caisse", "Ouvrir et fermer sa session de caisse"),
            ("gerer_coffre", "Approvisionner ou délester une caisse depuis le coffre"),
        ]
        constraints = [
            models.UniqueConstraint(fields=["agence", "code"], name="caisse_code_unique"),
            models.UniqueConstraint(
                fields=["agence"],
                condition=Q(type="COFFRE", active=True),
                name="un_seul_coffre_actif_par_agence",
            ),
        ]

    def __str__(self):
        return f"{self.agence.code} {self.code} - {self.libelle}"


class SessionCaisse(models.Model):
    """Journée de travail d'un caissier à un guichet : tous ses encaissements et décaissements en
    espèces y sont rattachés, et il la ferme en déclarant le comptage de chaque devise."""

    class Statut(models.TextChoices):
        OUVERTE = "OUVERTE", "Ouverte"
        FERMEE = "FERMEE", "Fermée"

    caisse = models.ForeignKey(Caisse, on_delete=models.PROTECT, related_name="sessions")
    caissier = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.PROTECT, related_name="sessions_caisse"
    )
    date_comptable = models.DateField()
    statut = models.CharField(max_length=10, choices=Statut.choices, default=Statut.OUVERTE)
    ouverte_le = models.DateTimeField(auto_now_add=True)
    fermee_le = models.DateTimeField(null=True, blank=True)
    commentaire = models.CharField(max_length=255, blank=True)

    class Meta:
        ordering = ["-ouverte_le"]
        verbose_name = "session de caisse"
        verbose_name_plural = "sessions de caisse"
        constraints = [
            models.UniqueConstraint(
                fields=["caisse"], condition=Q(statut="OUVERTE"), name="une_session_par_caisse"
            ),
            models.UniqueConstraint(
                fields=["caissier"],
                condition=Q(statut="OUVERTE"),
                name="une_session_par_caissier",
            ),
        ]

    def __str__(self):
        return f"{self.caisse.code} {self.date_comptable} {self.caissier}"


class SoldeSession(models.Model):
    """Par devise : fonds à l'ouverture (report du comptage précédent), puis comptage et écart à la
    fermeture."""

    session = models.ForeignKey(SessionCaisse, on_delete=models.CASCADE, related_name="soldes")
    devise = models.ForeignKey("core.Devise", on_delete=models.PROTECT, related_name="+")
    ouverture = champ_montant(default=0)
    theorique = champ_montant(null=True, blank=True, help_text="Calculé à la fermeture.")
    compte = champ_montant(null=True, blank=True, help_text="Montant compté à la fermeture.")
    ecart = champ_montant(null=True, blank=True, help_text="Compté − théorique.")

    class Meta:
        ordering = ["devise"]
        constraints = [
            models.UniqueConstraint(fields=["session", "devise"], name="solde_session_unique")
        ]

    def __str__(self):
        return f"{self.session} {self.devise_id}"


class OperationCaisse(models.Model):
    """Mouvement d'espèces d'une session, toujours adossé à une écriture comptable validée."""

    class Sens(models.TextChoices):
        ENTREE = "ENTREE", "Entrée"
        SORTIE = "SORTIE", "Sortie"

    session = models.ForeignKey(SessionCaisse, on_delete=models.PROTECT, related_name="operations")
    type_operation = models.CharField(max_length=50, help_text="Type de l'écriture d'origine.")
    sens = models.CharField(max_length=6, choices=Sens.choices)
    devise = models.ForeignKey("core.Devise", on_delete=models.PROTECT, related_name="+")
    montant = champ_montant()
    libelle = models.CharField(max_length=255)
    membre = models.ForeignKey(
        "members.Membre", on_delete=models.PROTECT, null=True, blank=True, related_name="+"
    )
    ecriture = models.OneToOneField(
        "accounting.Ecriture", on_delete=models.PROTECT, related_name="operation_caisse"
    )
    cree_par = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.PROTECT, related_name="+"
    )
    cree_le = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-cree_le", "-id"]
        verbose_name = "opération de caisse"
        verbose_name_plural = "opérations de caisse"
        constraints = [
            models.CheckConstraint(condition=Q(montant__gt=0), name="operation_caisse_positive")
        ]

    def __str__(self):
        return f"{self.get_sens_display()} {self.montant} {self.devise_id} ({self.type_operation})"
