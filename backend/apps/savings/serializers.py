from rest_framework import serializers

from apps.core.models import Devise
from apps.members.models import Membre
from apps.savings import services
from apps.savings.models import CompteEpargne, MouvementEpargne, ProduitEpargne


class ProduitEpargneSerializer(serializers.ModelSerializer):
    compte_numero = serializers.CharField(source="compte.numero", read_only=True)

    class Meta:
        model = ProduitEpargne
        fields = [
            "id",
            "code",
            "libelle",
            "type",
            "devise",
            "compte",
            "compte_numero",
            "solde_minimum",
            "retrait_libre",
            "taux_interet_annuel",
            "actif",
        ]

    # Ils déterminent le compte et la devise des soldes déjà détenus par les membres.
    FIGES = {"code": "Le code", "type": "Le type", "devise": "La devise", "compte": "Le compte"}

    def validate_compte(self, compte):
        if not compte.numero.startswith("419") or not compte.est_mouvementable:
            raise serializers.ValidationError("Choisissez un compte de dépôts (419) mouvementable.")
        return compte

    def validate(self, attrs):
        if self.instance is not None:
            for champ, nom in self.FIGES.items():
                if champ in attrs and attrs[champ] != getattr(self.instance, champ):
                    raise serializers.ValidationError(
                        {champ: f"{nom} d'un produit ne change pas après création."}
                    )
        return attrs


class CompteEpargneSerializer(serializers.ModelSerializer):
    membre_numero = serializers.CharField(source="membre.numero", read_only=True)
    membre_nom = serializers.CharField(source="membre.nom_complet", read_only=True)
    produit_libelle = serializers.CharField(source="produit.libelle", read_only=True)
    produit_type = serializers.CharField(source="produit.type", read_only=True)
    agence_code = serializers.CharField(source="agence.code", read_only=True)
    ouvert_par = serializers.StringRelatedField()
    disponible = serializers.SerializerMethodField()
    bloque = serializers.SerializerMethodField()

    class Meta:
        model = CompteEpargne
        fields = [
            "id",
            "numero",
            "membre",
            "membre_numero",
            "membre_nom",
            "produit",
            "produit_libelle",
            "produit_type",
            "agence",
            "agence_code",
            "devise",
            "statut",
            "solde",
            "disponible",
            "bloque",
            "motif_blocage",
            "date_ouverture",
            "ouvert_par",
            "cree_le",
        ]
        read_only_fields = fields

    def get_disponible(self, obj) -> str:
        return str(services.disponible(obj))

    def get_bloque(self, obj) -> str:
        return str(services.bloque(obj.membre, obj.devise_id))


class OuvertureCompteSerializer(serializers.Serializer):
    membre = serializers.PrimaryKeyRelatedField(queryset=Membre.objects.all())
    devise = serializers.PrimaryKeyRelatedField(queryset=Devise.objects.filter(active=True))


class MouvementEpargneSerializer(serializers.ModelSerializer):
    ecriture_numero = serializers.CharField(source="ecriture.numero", read_only=True)
    cree_par = serializers.StringRelatedField()

    class Meta:
        model = MouvementEpargne
        fields = [
            "id",
            "type",
            "sens",
            "montant",
            "solde_apres",
            "libelle",
            "date_comptable",
            "ecriture",
            "ecriture_numero",
            "cree_par",
            "cree_le",
        ]
        read_only_fields = fields


class OperationGuichetSerializer(serializers.Serializer):
    montant = serializers.DecimalField(max_digits=20, decimal_places=2)
    compte_tresorerie = serializers.CharField(
        help_text="Compte de la caisse du caissier (session ouverte) qui reçoit ou verse l'argent."
    )
    cle_idempotence = serializers.CharField(
        max_length=100, help_text="Identifiant unique généré par le client pour cette opération."
    )


class DepotMembreSerializer(OperationGuichetSerializer):
    """Dépôt pour un membre dans une devise : ouvre son compte s'il n'en a pas encore."""

    membre = serializers.PrimaryKeyRelatedField(queryset=Membre.objects.all())
    devise = serializers.PrimaryKeyRelatedField(queryset=Devise.objects.filter(active=True))


class DepotsInitiauxSerializer(serializers.Serializer):
    devise = serializers.CharField()
    montant = serializers.DecimalField(max_digits=20, decimal_places=2)


class BlocageSerializer(serializers.Serializer):
    bloquer = serializers.BooleanField()
    motif = serializers.CharField(max_length=255)
