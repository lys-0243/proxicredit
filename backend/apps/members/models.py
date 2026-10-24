from django.conf import settings
from django.db import models
from django.db.models import Q
from simple_history.models import HistoricalRecords

from apps.core.audit import ModeleHistoriqueAudit
from apps.core.models import Horodatage, champ_montant


class Membre(Horodatage):
    """Client de la microfinance. Un seul modèle pour les trois types ; les champs propres à un type
    restent vides pour les autres (contrôlés par le serializer)."""

    class Type(models.TextChoices):
        PHYSIQUE = "PHYSIQUE", "Personne physique"
        MORALE = "MORALE", "Personne morale"
        GROUPE = "GROUPE", "Groupe solidaire"

    class Statut(models.TextChoices):
        PROSPECT = "PROSPECT", "Prospect"
        ACTIF = "ACTIF", "Actif"
        SUSPENDU = "SUSPENDU", "Suspendu"
        DEMISSIONNAIRE = "DEMISSIONNAIRE", "Démissionnaire"
        DECEDE = "DECEDE", "Décédé"

    class Sexe(models.TextChoices):
        M = "M", "Masculin"
        F = "F", "Féminin"

    class EtatCivil(models.TextChoices):
        CELIBATAIRE = "CELIBATAIRE", "Célibataire"
        MARIE = "MARIE", "Marié(e)"
        DIVORCE = "DIVORCE", "Divorcé(e)"
        VEUF = "VEUF", "Veuf / veuve"
        UNION_LIBRE = "UNION_LIBRE", "Union libre"

    class TypePiece(models.TextChoices):
        CARTE_ELECTEUR = "CARTE_ELECTEUR", "Carte d'électeur"
        PASSEPORT = "PASSEPORT", "Passeport"
        PERMIS = "PERMIS", "Permis de conduire"
        CARTE_SERVICE = "CARTE_SERVICE", "Carte de service"
        CARTE_ETUDIANT = "CARTE_ETUDIANT", "Carte d'étudiant"
        AUTRE = "AUTRE", "Autre"

    numero = models.CharField(max_length=20, unique=True, editable=False)
    agence = models.ForeignKey("core.Agence", on_delete=models.PROTECT, related_name="membres")
    type = models.CharField(max_length=10, choices=Type.choices)
    statut = models.CharField(max_length=15, choices=Statut.choices, default=Statut.PROSPECT)
    nom_complet = models.CharField(
        max_length=255, editable=False, db_index=True, help_text="Calculé : sert à la recherche."
    )

    # --- Personne physique ---
    nom = models.CharField(max_length=100, blank=True)
    postnom = models.CharField(max_length=100, blank=True)
    prenom = models.CharField(max_length=100, blank=True)
    sexe = models.CharField(max_length=1, choices=Sexe.choices, blank=True)
    date_naissance = models.DateField(null=True, blank=True)
    lieu_naissance = models.CharField(max_length=100, blank=True)
    nationalite = models.CharField(max_length=50, blank=True, default="Congolaise")
    etat_civil = models.CharField(max_length=15, choices=EtatCivil.choices, blank=True)
    personnes_a_charge = models.PositiveSmallIntegerField(null=True, blank=True)
    type_piece = models.CharField(max_length=20, choices=TypePiece.choices, blank=True)
    numero_piece = models.CharField(max_length=50, blank=True)
    piece_delivree_le = models.DateField(null=True, blank=True)
    piece_expire_le = models.DateField(null=True, blank=True)
    profession = models.CharField(max_length=100, blank=True)
    employeur = models.CharField(max_length=150, blank=True)

    # --- Personne morale ---
    raison_sociale = models.CharField(max_length=200, blank=True)
    forme_juridique = models.CharField(max_length=50, blank=True, help_text="SARL, ASBL, SA...")
    rccm = models.CharField("RCCM", max_length=50, blank=True)
    id_nat = models.CharField("identification nationale", max_length=50, blank=True)
    numero_impot = models.CharField(max_length=50, blank=True)
    date_creation = models.DateField(null=True, blank=True)
    representant_nom = models.CharField("représentant légal", max_length=150, blank=True)
    representant_fonction = models.CharField(max_length=100, blank=True)
    representant_telephone = models.CharField(max_length=30, blank=True)

    # --- Groupe solidaire ---
    nom_groupe = models.CharField(max_length=150, blank=True)

    # --- Commun ---
    telephone = models.CharField(max_length=30, blank=True, db_index=True)
    telephone_secondaire = models.CharField(max_length=30, blank=True)
    email = models.EmailField(blank=True)
    province = models.CharField(max_length=50, blank=True, default="Kinshasa")
    ville = models.CharField(max_length=50, blank=True, default="Kinshasa")
    commune = models.CharField(max_length=50, blank=True)
    quartier = models.CharField(max_length=50, blank=True)
    avenue = models.CharField(max_length=100, blank=True)
    numero_adresse = models.CharField("numéro (adresse)", max_length=20, blank=True)
    activite = models.CharField(
        "activité principale", max_length=150, blank=True, help_text="Commerce, enseignement..."
    )
    revenu_mensuel = champ_montant(null=True, blank=True)
    devise_revenu = models.ForeignKey(
        "core.Devise", on_delete=models.PROTECT, null=True, blank=True, related_name="+"
    )
    charges_mensuelles = champ_montant(null=True, blank=True)

    # --- Liste noire ---
    en_liste_noire = models.BooleanField(default=False)
    motif_liste_noire = models.CharField(max_length=255, blank=True)

    # --- Traçabilité ---
    cree_par = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.PROTECT, related_name="+"
    )
    active_par = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.PROTECT, null=True, blank=True, related_name="+"
    )
    active_le = models.DateTimeField(null=True, blank=True)

    history = HistoricalRecords(bases=[ModeleHistoriqueAudit])

    class Meta:
        ordering = ["-cree_le"]
        permissions = [
            ("activer_membre", "Activer un membre (validation du dossier)"),
            ("changer_statut_membre", "Suspendre, réactiver ou clôturer un membre"),
            ("gerer_liste_noire", "Inscrire ou retirer un membre de la liste noire"),
            ("encaisser_adhesion", "Encaisser l'adhésion et les parts sociales"),
        ]
        constraints = [
            # Une même pièce d'identité ne peut servir qu'à un seul membre.
            models.UniqueConstraint(
                fields=["type_piece", "numero_piece"],
                condition=~Q(numero_piece=""),
                name="piece_identite_unique",
            ),
            models.UniqueConstraint(fields=["rccm"], condition=~Q(rccm=""), name="rccm_unique"),
        ]

    def __str__(self):
        return f"{self.numero} {self.nom_complet}"

    def calculer_nom_complet(self) -> str:
        if self.type == self.Type.MORALE:
            return self.raison_sociale
        if self.type == self.Type.GROUPE:
            return self.nom_groupe
        return " ".join(p for p in (self.nom.upper(), self.postnom.upper(), self.prenom) if p)

    def save(self, *args, **kwargs):
        self.nom_complet = self.calculer_nom_complet()
        super().save(*args, **kwargs)


def chemin_document(instance, nom_fichier: str) -> str:
    extension = nom_fichier.rsplit(".", 1)[-1].lower()
    membre = instance.membre
    return f"kyc/{membre.agence_id}/{membre.pk}/{instance.type}-{instance.uuid}.{extension}"


class DocumentMembre(models.Model):
    """Pièce du dossier KYC. Les fichiers ne sont jamais servis publiquement : uniquement via l'API,
    après contrôle des droits."""

    class Type(models.TextChoices):
        PIECE_IDENTITE = "PIECE_IDENTITE", "Pièce d'identité"
        PHOTO = "PHOTO", "Photo"
        SIGNATURE = "SIGNATURE", "Spécimen de signature"
        JUSTIFICATIF_DOMICILE = "JUSTIFICATIF_DOMICILE", "Justificatif de domicile"
        STATUTS = "STATUTS", "Statuts / RCCM"
        PV_GROUPE = "PV_GROUPE", "PV de constitution du groupe"
        AUTRE = "AUTRE", "Autre"

    uuid = models.UUIDField(unique=True, editable=False)
    membre = models.ForeignKey(Membre, on_delete=models.PROTECT, related_name="documents")
    type = models.CharField(max_length=25, choices=Type.choices)
    fichier = models.FileField(upload_to=chemin_document)
    nom_origine = models.CharField(max_length=255)
    type_contenu = models.CharField(max_length=100)
    taille = models.PositiveIntegerField()
    description = models.CharField(max_length=255, blank=True)
    ajoute_par = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.PROTECT, related_name="+"
    )
    ajoute_le = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-ajoute_le"]
        verbose_name = "document du membre"

    def __str__(self):
        return f"{self.get_type_display()} – {self.membre.numero}"


class Beneficiaire(models.Model):
    """Ayant droit désigné par le membre (décès)."""

    membre = models.ForeignKey(Membre, on_delete=models.CASCADE, related_name="beneficiaires")
    nom_complet = models.CharField(max_length=200)
    lien = models.CharField("lien de parenté", max_length=50)
    telephone = models.CharField(max_length=30, blank=True)
    pourcentage = models.DecimalField(max_digits=5, decimal_places=2, default=100)

    class Meta:
        ordering = ["id"]
        verbose_name = "bénéficiaire"

    def __str__(self):
        return f"{self.nom_complet} ({self.lien})"


class MembreGroupe(models.Model):
    """Appartenance d'une personne physique à un groupe solidaire."""

    class Fonction(models.TextChoices):
        PRESIDENT = "PRESIDENT", "Président(e)"
        SECRETAIRE = "SECRETAIRE", "Secrétaire"
        TRESORIER = "TRESORIER", "Trésorier(ère)"
        MEMBRE = "MEMBRE", "Membre"

    groupe = models.ForeignKey(Membre, on_delete=models.PROTECT, related_name="composition")
    membre = models.ForeignKey(Membre, on_delete=models.PROTECT, related_name="groupes")
    fonction = models.CharField(max_length=12, choices=Fonction.choices, default=Fonction.MEMBRE)
    date_entree = models.DateField()
    date_sortie = models.DateField(null=True, blank=True)

    class Meta:
        ordering = ["fonction", "id"]
        verbose_name = "membre d'un groupe"
        constraints = [
            # Une personne n'appartient qu'à un seul groupe solidaire à la fois.
            models.UniqueConstraint(
                fields=["membre"],
                condition=Q(date_sortie__isnull=True),
                name="un_seul_groupe_actif",
            ),
        ]

    def __str__(self):
        return f"{self.membre} dans {self.groupe} ({self.get_fonction_display()})"


class MouvementPartsSociales(models.Model):
    """Souscriptions (et futurs remboursements) de parts sociales. Le capital détenu par un membre
    est la somme de ses mouvements."""

    class Type(models.TextChoices):
        SOUSCRIPTION = "SOUSCRIPTION", "Souscription"
        REMBOURSEMENT = "REMBOURSEMENT", "Remboursement"

    membre = models.ForeignKey(Membre, on_delete=models.PROTECT, related_name="parts_sociales")
    type = models.CharField(max_length=15, choices=Type.choices)
    nombre = models.IntegerField(help_text="Positif en souscription, négatif en remboursement.")
    valeur_unitaire = champ_montant()
    montant = champ_montant()
    devise = models.ForeignKey("core.Devise", on_delete=models.PROTECT, related_name="+")
    ecriture = models.ForeignKey("accounting.Ecriture", on_delete=models.PROTECT, related_name="+")
    date_comptable = models.DateField()
    cree_par = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.PROTECT, related_name="+"
    )
    cree_le = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-cree_le"]
        verbose_name = "mouvement de parts sociales"

    def __str__(self):
        return f"{self.membre.numero} {self.type} {self.nombre} part(s)"


class Adhesion(models.Model):
    """Paiement des frais d'adhésion (une seule fois par membre)."""

    membre = models.OneToOneField(Membre, on_delete=models.PROTECT, related_name="adhesion")
    frais = champ_montant()
    devise = models.ForeignKey("core.Devise", on_delete=models.PROTECT, related_name="+")
    ecriture = models.ForeignKey("accounting.Ecriture", on_delete=models.PROTECT, related_name="+")
    date_comptable = models.DateField()
    encaisse_par = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.PROTECT, related_name="+"
    )
    encaisse_le = models.DateTimeField(auto_now_add=True)

    class Meta:
        verbose_name = "adhésion"

    def __str__(self):
        return f"Adhésion {self.membre.numero}"


class HistoriqueStatut(models.Model):
    membre = models.ForeignKey(Membre, on_delete=models.CASCADE, related_name="historique_statuts")
    ancien = models.CharField(max_length=15, blank=True)
    nouveau = models.CharField(max_length=15)
    motif = models.CharField(max_length=255, blank=True)
    par = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.PROTECT, related_name="+")
    le = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-le", "-id"]
        verbose_name = "changement de statut"

    def __str__(self):
        return f"{self.membre.numero} {self.ancien} → {self.nouveau}"


class SequenceMembre(models.Model):
    agence = models.OneToOneField("core.Agence", on_delete=models.PROTECT)
    dernier_numero = models.PositiveIntegerField(default=0)

    def __str__(self):
        return f"{self.agence_id} : {self.dernier_numero}"
