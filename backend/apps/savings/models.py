from django.conf import settings
from django.db import models
from django.db.models import Q
from simple_history.models import HistoricalRecords

from apps.accounting.models import Sens
from apps.core.audit import ModeleHistoriqueAudit
from apps.core.models import Horodatage, champ_montant, champ_taux


class ProduitEpargne(Horodatage):
    class Type(models.TextChoices):
        VUE = "VUE", "Épargne à vue"
        OBLIGATOIRE = "OBLIGATOIRE", "Épargne obligatoire (garantie crédit)"
        TERME = "TERME", "Dépôt à terme"

    code = models.CharField(max_length=10, unique=True)
    libelle = models.CharField(max_length=100)
    type = models.CharField(max_length=12, choices=Type.choices)
    devise = models.ForeignKey("core.Devise", on_delete=models.PROTECT, related_name="+")
    compte = models.ForeignKey(
        "accounting.CompteComptable",
        on_delete=models.PROTECT,
        related_name="+",
        help_text="Compte des dépôts (419x) crédité par les versements.",
    )
    solde_minimum = champ_montant(
        default=0, help_text="Solde qui doit rester sur le compte après un retrait."
    )
    retrait_libre = models.BooleanField(
        default=True,
        help_text="Faux : aucun retrait au guichet (épargne obligatoire, dépôt à terme).",
    )
    taux_interet_annuel = champ_taux(
        default=0, help_text="Rémunération annuelle (0,03 = 3 %) ; calcul en phase 6."
    )
    actif = models.BooleanField(default=True)

    history = HistoricalRecords(bases=[ModeleHistoriqueAudit])

    class Meta:
        ordering = ["code"]
        verbose_name = "produit d'épargne"
        verbose_name_plural = "produits d'épargne"

    def __str__(self):
        return f"{self.code} - {self.libelle}"


class CompteEpargne(Horodatage):
    """Compte d'un membre. Le solde est tenu à jour par les mouvements (sous verrou) et toujours
    égal à leur somme."""

    class Statut(models.TextChoices):
        ACTIF = "ACTIF", "Actif"
        BLOQUE = "BLOQUE", "Bloqué"
        CLOS = "CLOS", "Clos"

    numero = models.CharField(max_length=30, unique=True, editable=False)
    membre = models.ForeignKey(
        "members.Membre", on_delete=models.PROTECT, related_name="comptes_epargne"
    )
    produit = models.ForeignKey(ProduitEpargne, on_delete=models.PROTECT, related_name="comptes")
    agence = models.ForeignKey(
        "core.Agence", on_delete=models.PROTECT, related_name="comptes_epargne"
    )
    devise = models.ForeignKey("core.Devise", on_delete=models.PROTECT, related_name="+")
    statut = models.CharField(max_length=10, choices=Statut.choices, default=Statut.ACTIF)
    solde = champ_montant(default=0, editable=False)
    motif_blocage = models.CharField(max_length=255, blank=True)
    date_ouverture = models.DateField()
    ouvert_par = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.PROTECT, related_name="+"
    )

    class Meta:
        ordering = ["-cree_le"]
        verbose_name = "compte d'épargne"
        verbose_name_plural = "comptes d'épargne"
        permissions = [
            ("deposer_epargne", "Enregistrer un dépôt d'épargne"),
            ("retirer_epargne", "Payer un retrait d'épargne"),
            ("bloquer_compte_epargne", "Bloquer ou débloquer un compte d'épargne"),
        ]
        constraints = [
            # Au plus un compte non clos par membre et par devise (CDF, USD).
            models.UniqueConstraint(
                fields=["membre", "devise"],
                condition=~Q(statut="CLOS"),
                name="un_compte_ouvert_par_devise",
            ),
            models.CheckConstraint(condition=Q(solde__gte=0), name="solde_epargne_positif"),
        ]

    def __str__(self):
        return f"{self.numero} ({self.devise_id})"


class MouvementEpargne(models.Model):
    """Crédit (versement) ou débit (retrait) d'un compte, adossé à une écriture validée."""

    class Type(models.TextChoices):
        DEPOT = "DEPOT", "Dépôt"
        RETRAIT = "RETRAIT", "Retrait"
        DECAISSEMENT_CREDIT = "DECAISSEMENT_CREDIT", "Décaissement de crédit"
        REMBOURSEMENT_CREDIT = "REMBOURSEMENT_CREDIT", "Remboursement de crédit"

    compte = models.ForeignKey(CompteEpargne, on_delete=models.PROTECT, related_name="mouvements")
    type = models.CharField(max_length=25, choices=Type.choices)
    sens = models.CharField(
        max_length=1, choices=Sens.choices, help_text="C : augmente le solde ; D : le diminue."
    )
    montant = champ_montant()
    solde_apres = champ_montant()
    libelle = models.CharField(max_length=255)
    ecriture = models.ForeignKey("accounting.Ecriture", on_delete=models.PROTECT, related_name="+")
    date_comptable = models.DateField()
    cree_par = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.PROTECT, related_name="+"
    )
    cree_le = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-cree_le", "-id"]
        verbose_name = "mouvement d'épargne"
        constraints = [
            models.CheckConstraint(condition=Q(montant__gt=0), name="mouvement_epargne_positif"),
            models.UniqueConstraint(
                fields=["compte", "ecriture"], name="un_mouvement_par_ecriture_et_compte"
            ),
        ]

    def __str__(self):
        return f"{self.compte.numero} {self.get_type_display()} {self.montant}"


class SequenceCompteEpargne(models.Model):
    agence = models.OneToOneField("core.Agence", on_delete=models.PROTECT)
    dernier_numero = models.PositiveIntegerField(default=0)

    def __str__(self):
        return f"{self.agence_id} : {self.dernier_numero}"
