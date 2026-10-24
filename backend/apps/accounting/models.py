from django.conf import settings
from django.contrib.contenttypes.fields import GenericForeignKey
from django.contrib.contenttypes.models import ContentType
from django.db import models
from django.db.models import Q
from simple_history.models import HistoricalRecords

from apps.core.audit import ModeleHistoriqueAudit
from apps.core.exceptions import ErreurMetier
from apps.core.models import Horodatage, champ_montant, champ_taux


class Sens(models.TextChoices):
    DEBIT = "D", "Débit"
    CREDIT = "C", "Crédit"


class CompteComptable(Horodatage):
    numero = models.CharField(max_length=20, unique=True)
    libelle = models.CharField(max_length=150)
    classe = models.PositiveSmallIntegerField(editable=False)
    sens_normal = models.CharField(max_length=1, choices=Sens.choices)
    parent = models.ForeignKey(
        "self", on_delete=models.PROTECT, null=True, blank=True, related_name="enfants"
    )
    est_mouvementable = models.BooleanField(
        default=True, help_text="Seuls les comptes mouvementables reçoivent des écritures."
    )
    devise = models.ForeignKey(
        "core.Devise",
        on_delete=models.PROTECT,
        null=True,
        blank=True,
        help_text="Vide : le compte accepte toutes les devises (soldes suivis par devise).",
    )
    actif = models.BooleanField(default=True)

    history = HistoricalRecords(bases=[ModeleHistoriqueAudit])

    class Meta:
        ordering = ["numero"]
        verbose_name = "compte comptable"

    def __str__(self):
        return f"{self.numero} {self.libelle}"

    def save(self, *args, **kwargs):
        if not self.numero[:1].isdigit():
            raise ErreurMetier("Le numéro de compte doit commencer par le chiffre de la classe.")
        self.classe = int(self.numero[0])
        super().save(*args, **kwargs)


class Journal(Horodatage):
    code = models.CharField(max_length=5, unique=True)
    libelle = models.CharField(max_length=100)
    actif = models.BooleanField(default=True)

    class Meta:
        ordering = ["code"]
        verbose_name = "journal"

    def __str__(self):
        return f"{self.code} - {self.libelle}"


class SequenceEcriture(models.Model):
    journal = models.ForeignKey(Journal, on_delete=models.PROTECT)
    annee = models.PositiveSmallIntegerField()
    dernier_numero = models.PositiveIntegerField(default=0)

    class Meta:
        constraints = [models.UniqueConstraint(fields=["journal", "annee"], name="sequence_unique")]

    def __str__(self):
        return f"{self.journal_id}-{self.annee} : {self.dernier_numero}"


class Ecriture(models.Model):
    """Écriture en partie double, dans une seule devise.

    Immuable une fois validée : ni modification ni suppression (contrôlé ici et par des
    triggers en base). Une erreur se corrige par contre-passation.
    """

    class Statut(models.TextChoices):
        BROUILLON = "BROUILLON", "Brouillon"
        VALIDEE = "VALIDEE", "Validée"

    SAISIE_MANUELLE = "SAISIE_MANUELLE"
    CONTRE_PASSATION = "CONTRE_PASSATION"

    numero = models.CharField(max_length=30, unique=True, null=True, blank=True)
    journal = models.ForeignKey(Journal, on_delete=models.PROTECT, related_name="ecritures")
    agence = models.ForeignKey("core.Agence", on_delete=models.PROTECT, related_name="ecritures")
    date_comptable = models.DateField(null=True, blank=True)
    libelle = models.CharField(max_length=255)
    devise = models.ForeignKey("core.Devise", on_delete=models.PROTECT)
    taux_reference = champ_taux(
        null=True, blank=True, help_text="Contre-valeur d'une unité en devise de référence."
    )
    type_operation = models.CharField(max_length=50, default=SAISIE_MANUELLE, db_index=True)
    reference = models.CharField(max_length=100, blank=True, help_text="Pièce justificative.")
    piece_type = models.ForeignKey(
        ContentType, on_delete=models.PROTECT, null=True, blank=True, related_name="+"
    )
    piece_id = models.PositiveBigIntegerField(null=True, blank=True)
    piece = GenericForeignKey("piece_type", "piece_id")
    statut = models.CharField(max_length=10, choices=Statut.choices, default=Statut.BROUILLON)
    cle_idempotence = models.CharField(max_length=100, unique=True, null=True, blank=True)
    contre_passation_de = models.OneToOneField(
        "self", on_delete=models.PROTECT, null=True, blank=True, related_name="contre_passation"
    )
    cree_par = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.PROTECT, related_name="+"
    )
    cree_le = models.DateTimeField(auto_now_add=True)
    valide_par = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.PROTECT, null=True, blank=True, related_name="+"
    )
    valide_le = models.DateTimeField(null=True, blank=True)

    class Meta:
        ordering = ["-date_comptable", "-id"]
        verbose_name = "écriture"
        permissions = [
            ("valider_ecriture", "Valider une écriture"),
            ("contre_passer_ecriture", "Contre-passer une écriture"),
            ("voir_etats", "Consulter les états comptables"),
        ]
        indexes = [models.Index(fields=["piece_type", "piece_id"])]

    def __str__(self):
        return self.numero or f"Brouillon #{self.pk}"

    def _statut_en_base(self):
        if self.pk is None:
            return None
        return Ecriture.objects.filter(pk=self.pk).values_list("statut", flat=True).first()

    def save(self, *args, **kwargs):
        if self._statut_en_base() == self.Statut.VALIDEE:
            raise ErreurMetier("Une écriture validée ne peut pas être modifiée.", "immuable")
        super().save(*args, **kwargs)

    def delete(self, *args, **kwargs):
        if self._statut_en_base() == self.Statut.VALIDEE:
            raise ErreurMetier("Une écriture validée ne peut pas être supprimée.", "immuable")
        return super().delete(*args, **kwargs)


class LigneEcriture(models.Model):
    ecriture = models.ForeignKey(Ecriture, on_delete=models.CASCADE, related_name="lignes")
    compte = models.ForeignKey(CompteComptable, on_delete=models.PROTECT, related_name="lignes")
    libelle = models.CharField(max_length=255, blank=True)
    debit = champ_montant(default=0)
    credit = champ_montant(default=0)

    class Meta:
        ordering = ["id"]
        verbose_name = "ligne d'écriture"
        constraints = [
            models.CheckConstraint(
                condition=(Q(debit__gt=0) & Q(credit=0)) | (Q(credit__gt=0) & Q(debit=0)),
                name="ligne_un_seul_sens_positif",
            )
        ]

    def __str__(self):
        return f"{self.compte_id} D {self.debit} / C {self.credit}"

    def _ecriture_validee(self) -> bool:
        return Ecriture.objects.filter(pk=self.ecriture_id, statut=Ecriture.Statut.VALIDEE).exists()

    def save(self, *args, **kwargs):
        if self._ecriture_validee():
            raise ErreurMetier("Une écriture validée ne peut pas être modifiée.", "immuable")
        super().save(*args, **kwargs)

    def delete(self, *args, **kwargs):
        if self._ecriture_validee():
            raise ErreurMetier("Une écriture validée ne peut pas être modifiée.", "immuable")
        return super().delete(*args, **kwargs)


class RegleComptable(Horodatage):
    """Schéma comptable d'un type d'opération : quels comptes débiter et créditer.

    La règle la plus précise l'emporte : produit + devise > produit > devise > générique.
    """

    type_operation = models.CharField(max_length=50, db_index=True)
    code_produit = models.CharField(
        max_length=30, blank=True, help_text="Vide : tous les produits."
    )
    devise = models.ForeignKey(
        "core.Devise",
        on_delete=models.PROTECT,
        null=True,
        blank=True,
        help_text="Vide : toutes les devises.",
    )
    journal = models.ForeignKey(Journal, on_delete=models.PROTECT)
    libelle = models.CharField(
        max_length=255, help_text="Modèle de libellé, ex. « Décaissement crédit {reference} »."
    )
    actif = models.BooleanField(default=True)

    history = HistoricalRecords(bases=[ModeleHistoriqueAudit])

    class Meta:
        ordering = ["type_operation", "code_produit"]
        verbose_name = "règle de comptabilisation"
        verbose_name_plural = "règles de comptabilisation"
        constraints = [
            models.UniqueConstraint(
                fields=["type_operation", "code_produit", "devise"],
                condition=Q(devise__isnull=False),
                name="regle_unique_avec_devise",
            ),
            models.UniqueConstraint(
                fields=["type_operation", "code_produit"],
                condition=Q(devise__isnull=True),
                name="regle_unique_sans_devise",
            ),
        ]

    def __str__(self):
        return f"{self.type_operation} {self.code_produit or '*'} {self.devise_id or '*'}"


class RegleComptableLigne(models.Model):
    regle = models.ForeignKey(RegleComptable, on_delete=models.CASCADE, related_name="lignes")
    ordre = models.PositiveSmallIntegerField(default=0)
    sens = models.CharField(max_length=1, choices=Sens.choices)
    element = models.CharField(
        max_length=50, help_text="Clé du montant fourni par le module, ex. « capital », « frais »."
    )
    compte = models.ForeignKey(CompteComptable, on_delete=models.PROTECT, null=True, blank=True)
    compte_variable = models.CharField(
        max_length=50,
        blank=True,
        help_text="Compte fourni à l'exécution par le module, ex. « CAISSE », « COMPTE_MEMBRE ».",
    )
    libelle = models.CharField(max_length=255, blank=True)

    class Meta:
        ordering = ["ordre", "id"]
        constraints = [
            models.CheckConstraint(
                condition=(Q(compte__isnull=False) & Q(compte_variable=""))
                | (Q(compte__isnull=True) & ~Q(compte_variable="")),
                name="regle_ligne_compte_fixe_ou_variable",
            )
        ]

    def __str__(self):
        return f"{self.get_sens_display()} {self.element}"
