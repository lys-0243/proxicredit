from datetime import date

from django.conf import settings
from django.db import models
from django.db.models import Q
from simple_history.models import HistoricalRecords

from apps.core.audit import ModeleHistoriqueAudit


class Horodatage(models.Model):
    cree_le = models.DateTimeField(auto_now_add=True)
    modifie_le = models.DateTimeField(auto_now=True)

    class Meta:
        abstract = True


def champ_montant(**kwargs):
    """Montant monétaire : toujours Decimal, jamais float."""
    kwargs.setdefault("max_digits", 20)
    kwargs.setdefault("decimal_places", 2)
    return models.DecimalField(**kwargs)


def champ_taux(**kwargs):
    kwargs.setdefault("max_digits", 20)
    kwargs.setdefault("decimal_places", 6)
    return models.DecimalField(**kwargs)


class Devise(Horodatage):
    code = models.CharField(max_length=3, primary_key=True)
    nom = models.CharField(max_length=50)
    symbole = models.CharField(max_length=5)
    decimales = models.PositiveSmallIntegerField(
        default=2, help_text="Nombre de décimales utilisées pour l'arrondi des montants."
    )
    est_reference = models.BooleanField(
        default=False, help_text="Devise de référence comptable (contre-valeurs)."
    )
    active = models.BooleanField(default=True)

    history = HistoricalRecords(bases=[ModeleHistoriqueAudit])

    class Meta:
        ordering = ["code"]
        constraints = [
            models.UniqueConstraint(
                fields=["est_reference"],
                condition=Q(est_reference=True),
                name="une_seule_devise_reference",
            )
        ]

    def __str__(self):
        return self.code

    @classmethod
    def reference(cls) -> "Devise":
        return cls.objects.get(est_reference=True)


class Agence(Horodatage):
    code = models.CharField(max_length=10, unique=True)
    nom = models.CharField(max_length=100)
    adresse = models.CharField(max_length=255, blank=True)
    telephone = models.CharField(max_length=30, blank=True)
    est_siege = models.BooleanField(default=False)
    active = models.BooleanField(default=True)

    history = HistoricalRecords(bases=[ModeleHistoriqueAudit])

    class Meta:
        ordering = ["code"]
        permissions = [("voir_toutes_agences", "Voir les données de toutes les agences")]

    def __str__(self):
        return f"{self.code} - {self.nom}"


class TauxChangeQuerySet(models.QuerySet):
    def en_vigueur(self, source: str, cible: str, a_date: date):
        """Dernier taux saisi à la date donnée ou avant."""
        return (
            self.filter(devise_source_id=source, devise_cible_id=cible, date__lte=a_date)
            .order_by("-date")
            .first()
        )


class TauxChange(Horodatage):
    """1 unité de devise_source = taux devise_cible (ex. 1 USD = 2850 CDF)."""

    date = models.DateField()
    devise_source = models.ForeignKey(Devise, on_delete=models.PROTECT, related_name="+")
    devise_cible = models.ForeignKey(Devise, on_delete=models.PROTECT, related_name="+")
    taux_achat = champ_taux()
    taux_vente = champ_taux()
    taux_reference = champ_taux()
    saisi_par = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.PROTECT, null=True, related_name="+"
    )

    objects = TauxChangeQuerySet.as_manager()
    history = HistoricalRecords(bases=[ModeleHistoriqueAudit])

    class Meta:
        ordering = ["-date", "devise_source"]
        verbose_name = "taux de change"
        verbose_name_plural = "taux de change"
        constraints = [
            models.UniqueConstraint(
                fields=["date", "devise_source", "devise_cible"], name="taux_unique_par_jour"
            ),
            models.CheckConstraint(
                condition=~Q(devise_source=models.F("devise_cible")),
                name="taux_devises_differentes",
            ),
            models.CheckConstraint(
                condition=Q(taux_achat__gt=0) & Q(taux_vente__gt=0) & Q(taux_reference__gt=0),
                name="taux_positifs",
            ),
        ]

    def __str__(self):
        return (
            f"{self.date} 1 {self.devise_source_id} = {self.taux_reference} {self.devise_cible_id}"
        )


class JourFerie(Horodatage):
    date = models.DateField()
    libelle = models.CharField(max_length=100)
    recurrent = models.BooleanField(
        default=True, help_text="Se répète chaque année au même jour et au même mois."
    )

    class Meta:
        ordering = ["date"]
        verbose_name = "jour férié"
        verbose_name_plural = "jours fériés"

    def __str__(self):
        return f"{self.date:%d/%m} {self.libelle}"


class JourneeComptable(models.Model):
    """La « journée ouverte » d'une agence : toutes les opérations sont datées de cette date."""

    class Statut(models.TextChoices):
        OUVERTE = "OUVERTE", "Ouverte"
        FERMEE = "FERMEE", "Fermée"

    agence = models.ForeignKey(Agence, on_delete=models.PROTECT, related_name="journees")
    date = models.DateField()
    statut = models.CharField(max_length=10, choices=Statut.choices, default=Statut.OUVERTE)
    ouverte_par = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.PROTECT, related_name="+"
    )
    ouverte_le = models.DateTimeField(auto_now_add=True)
    fermee_par = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.PROTECT, null=True, blank=True, related_name="+"
    )
    fermee_le = models.DateTimeField(null=True, blank=True)

    class Meta:
        ordering = ["-date"]
        verbose_name = "journée comptable"
        permissions = [
            ("ouvrir_journee", "Ouvrir une journée comptable"),
            ("fermer_journee", "Fermer une journée comptable"),
        ]
        constraints = [
            models.UniqueConstraint(fields=["agence", "date"], name="journee_unique_par_agence"),
            models.UniqueConstraint(
                fields=["agence"],
                condition=Q(statut="OUVERTE"),
                name="une_seule_journee_ouverte_par_agence",
            ),
        ]

    def __str__(self):
        return f"{self.agence.code} {self.date} ({self.get_statut_display()})"


class Parametre(Horodatage):
    """Paramètre global versionné : la valeur applicable est la dernière dont la date d'effet est
    antérieure ou égale à la date demandée."""

    cle = models.CharField(max_length=100)
    valeur = models.JSONField()
    date_effet = models.DateField()
    description = models.CharField(max_length=255, blank=True)

    history = HistoricalRecords(bases=[ModeleHistoriqueAudit])

    class Meta:
        ordering = ["cle", "-date_effet"]
        constraints = [
            models.UniqueConstraint(fields=["cle", "date_effet"], name="parametre_unique_par_date")
        ]

    def __str__(self):
        return f"{self.cle} ({self.date_effet})"
