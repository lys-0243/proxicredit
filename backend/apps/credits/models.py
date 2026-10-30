from django.conf import settings
from django.db import models
from django.db.models import Q
from simple_history.models import HistoricalRecords

from apps.core.audit import ModeleHistoriqueAudit
from apps.core.models import Horodatage, champ_montant, champ_taux


class ProduitCredit(Horodatage):
    """Conditions d'un produit (Éducation, Secours...). Les comptes mouvementés sont ceux des règles
    de comptabilisation dont le code produit est `code`."""

    class Methode(models.TextChoices):
        DEGRESSIF = "DEGRESSIF", "Dégressif (échéances constantes)"
        FLAT = "FLAT", "Intérêts fixes sur le capital initial"

    class Periodicite(models.TextChoices):
        MENSUELLE = "MENSUELLE", "Mensuelle"
        HEBDOMADAIRE = "HEBDOMADAIRE", "Hebdomadaire"

    code = models.CharField(max_length=10, unique=True)
    libelle = models.CharField(max_length=100)
    description = models.TextField(blank=True)
    methode = models.CharField(max_length=10, choices=Methode.choices, default=Methode.DEGRESSIF)
    periodicite = models.CharField(
        max_length=12, choices=Periodicite.choices, default=Periodicite.MENSUELLE
    )
    taux_interet = champ_taux(help_text="Taux par période (0,02 = 2 % par mois si mensuel).")
    duree_min = models.PositiveSmallIntegerField(help_text="Nombre minimum d'échéances.")
    duree_max = models.PositiveSmallIntegerField(help_text="Nombre maximum d'échéances.")
    frais_dossier_taux = champ_taux(
        default=0, help_text="Frais de dossier en proportion du montant, retenus au décaissement."
    )
    epargne_garantie_taux = champ_taux(
        default=0,
        help_text="Épargne que le membre doit avoir déjà déposée, en proportion du montant ; "
        "bloquée pendant le crédit.",
    )
    taux_penalite_jour = champ_taux(
        default=0, help_text="Pénalité par jour de retard, en proportion du montant impayé."
    )
    jours_grace = models.PositiveSmallIntegerField(
        default=0, help_text="Jours de retard tolérés avant de compter des pénalités."
    )
    actif = models.BooleanField(default=True)

    history = HistoricalRecords(bases=[ModeleHistoriqueAudit])

    class Meta:
        ordering = ["code"]
        verbose_name = "produit de crédit"
        verbose_name_plural = "produits de crédit"
        constraints = [
            models.CheckConstraint(
                condition=Q(duree_min__gte=1) & Q(duree_max__gte=models.F("duree_min")),
                name="produit_durees_coherentes",
            ),
            models.CheckConstraint(condition=Q(taux_interet__gte=0), name="produit_taux_positif"),
        ]

    def __str__(self):
        return f"{self.code} - {self.libelle}"


class PlafondCredit(models.Model):
    """Montants autorisés d'un produit dans une devise (définit aussi les devises proposées)."""

    produit = models.ForeignKey(ProduitCredit, on_delete=models.CASCADE, related_name="plafonds")
    devise = models.ForeignKey("core.Devise", on_delete=models.PROTECT, related_name="+")
    montant_min = champ_montant()
    montant_max = champ_montant()

    class Meta:
        ordering = ["devise"]
        verbose_name = "plafond de crédit"
        constraints = [
            models.UniqueConstraint(fields=["produit", "devise"], name="plafond_unique"),
            models.CheckConstraint(
                condition=Q(montant_min__gt=0) & Q(montant_max__gte=models.F("montant_min")),
                name="plafond_coherent",
            ),
        ]

    def __str__(self):
        return f"{self.produit.code} {self.devise_id} {self.montant_min}–{self.montant_max}"


class Credit(Horodatage):
    """Dossier de crédit, de la demande au solde : saisie, soumission, analyse, décision du
    comité, décaissement, remboursements."""

    class Statut(models.TextChoices):
        BROUILLON = "BROUILLON", "En saisie"
        SOUMIS = "SOUMIS", "Soumis à l'analyse"
        ANALYSE = "ANALYSE", "Analysé, en attente du comité"
        APPROUVE = "APPROUVE", "Approuvé, à décaisser"
        REJETE = "REJETE", "Rejeté"
        ANNULE = "ANNULE", "Annulé"
        EN_COURS = "EN_COURS", "En cours de remboursement"
        SOLDE = "SOLDE", "Soldé"

    class Avis(models.TextChoices):
        FAVORABLE = "FAVORABLE", "Favorable"
        RESERVE = "RESERVE", "Favorable avec réserves"
        DEFAVORABLE = "DEFAVORABLE", "Défavorable"

    numero = models.CharField(max_length=30, unique=True, editable=False)
    agence = models.ForeignKey("core.Agence", on_delete=models.PROTECT, related_name="credits")
    membre = models.ForeignKey("members.Membre", on_delete=models.PROTECT, related_name="credits")
    produit = models.ForeignKey(ProduitCredit, on_delete=models.PROTECT, related_name="credits")
    devise = models.ForeignKey("core.Devise", on_delete=models.PROTECT, related_name="+")
    statut = models.CharField(max_length=10, choices=Statut.choices, default=Statut.BROUILLON)

    # --- Demande ---
    montant_demande = champ_montant()
    duree_demandee = models.PositiveSmallIntegerField(help_text="Nombre d'échéances.")
    objet = models.CharField(max_length=255, help_text="Usage prévu : frais scolaires, soins...")
    cree_par = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.PROTECT, related_name="+"
    )
    soumis_par = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.PROTECT, null=True, blank=True, related_name="+"
    )
    soumis_le = models.DateTimeField(null=True, blank=True)

    # --- Analyse (agent de crédit) ---
    revenu_mensuel = champ_montant(null=True, blank=True)
    charges_mensuelles = champ_montant(null=True, blank=True)
    avis_analyse = models.CharField(max_length=12, choices=Avis.choices, blank=True)
    commentaire_analyse = models.TextField(blank=True)
    montant_propose = champ_montant(null=True, blank=True)
    duree_proposee = models.PositiveSmallIntegerField(null=True, blank=True)
    analyse_par = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.PROTECT, null=True, blank=True, related_name="+"
    )
    analyse_le = models.DateTimeField(null=True, blank=True)

    # --- Décision (comité) ---
    montant_accorde = champ_montant(null=True, blank=True)
    duree_accordee = models.PositiveSmallIntegerField(null=True, blank=True)
    taux_interet = champ_taux(null=True, blank=True, help_text="Taux du produit à la décision.")
    motif_decision = models.TextField(blank=True)
    decide_par = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.PROTECT, null=True, blank=True, related_name="+"
    )
    decide_le = models.DateTimeField(null=True, blank=True)

    # --- Décaissement ---
    frais_dossier = champ_montant(null=True, blank=True)
    epargne_bloquee = champ_montant(
        default=0, help_text="Épargne du membre bloquée du décaissement jusqu'au solde."
    )
    date_decaissement = models.DateField(null=True, blank=True)
    ecriture_decaissement = models.ForeignKey(
        "accounting.Ecriture", on_delete=models.PROTECT, null=True, blank=True, related_name="+"
    )
    decaisse_par = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.PROTECT, null=True, blank=True, related_name="+"
    )
    solde_le = models.DateField(null=True, blank=True)

    history = HistoricalRecords(bases=[ModeleHistoriqueAudit])

    class Meta:
        ordering = ["-cree_le"]
        verbose_name = "crédit"
        permissions = [
            ("analyser_credit", "Analyser une demande de crédit"),
            ("approuver_credit", "Statuer sur une demande de crédit (comité)"),
            ("decaisser_credit", "Décaisser un crédit approuvé"),
            ("rembourser_credit", "Encaisser un remboursement de crédit"),
        ]
        constraints = [
            models.CheckConstraint(
                condition=Q(montant_demande__gt=0), name="credit_montant_positif"
            ),
        ]

    def __str__(self):
        return f"{self.numero} {self.membre.nom_complet}"


class HistoriqueCredit(models.Model):
    """Trace de chaque étape du dossier (qui, quand, pourquoi)."""

    credit = models.ForeignKey(Credit, on_delete=models.CASCADE, related_name="historique")
    ancien = models.CharField(max_length=10, blank=True)
    nouveau = models.CharField(max_length=10)
    commentaire = models.TextField(blank=True)
    par = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.PROTECT, related_name="+")
    le = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-le", "-id"]
        verbose_name = "étape du dossier de crédit"

    def __str__(self):
        return f"{self.credit.numero} {self.ancien} → {self.nouveau}"


class Echeance(models.Model):
    """Ligne de l'échéancier : montants dus et montants déjà payés."""

    credit = models.ForeignKey(Credit, on_delete=models.CASCADE, related_name="echeances")
    numero = models.PositiveSmallIntegerField()
    date = models.DateField()
    capital = champ_montant()
    interet = champ_montant()
    capital_paye = champ_montant(default=0)
    interet_paye = champ_montant(default=0)
    penalite = champ_montant(default=0, help_text="Pénalités de retard calculées.")
    penalite_payee = champ_montant(default=0)
    penalites_calculees_au = models.DateField(null=True, blank=True)
    soldee_le = models.DateField(null=True, blank=True)

    class Meta:
        ordering = ["credit", "numero"]
        verbose_name = "échéance"
        constraints = [
            models.UniqueConstraint(fields=["credit", "numero"], name="echeance_unique"),
            models.CheckConstraint(
                condition=Q(capital_paye__lte=models.F("capital"))
                & Q(interet_paye__lte=models.F("interet"))
                & Q(penalite_payee__lte=models.F("penalite")),
                name="echeance_pas_de_trop_percu",
            ),
        ]

    def __str__(self):
        return f"{self.credit.numero} n°{self.numero} au {self.date}"

    @property
    def total(self):
        return self.capital + self.interet

    @property
    def reste_du(self):
        return (
            self.capital
            - self.capital_paye
            + self.interet
            - self.interet_paye
            + self.penalite
            - self.penalite_payee
        )


class Remboursement(models.Model):
    credit = models.ForeignKey(Credit, on_delete=models.PROTECT, related_name="remboursements")
    montant = champ_montant()
    capital = champ_montant()
    interet = champ_montant()
    penalite = champ_montant()
    date_comptable = models.DateField()
    ecriture = models.OneToOneField(
        "accounting.Ecriture", on_delete=models.PROTECT, related_name="remboursement_credit"
    )
    cree_par = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.PROTECT, related_name="+"
    )
    cree_le = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-cree_le", "-id"]
        verbose_name = "remboursement"

    def __str__(self):
        return f"{self.credit.numero} {self.montant} le {self.date_comptable}"


class SequenceCredit(models.Model):
    agence = models.OneToOneField("core.Agence", on_delete=models.PROTECT)
    dernier_numero = models.PositiveIntegerField(default=0)

    def __str__(self):
        return f"{self.agence_id} : {self.dernier_numero}"
