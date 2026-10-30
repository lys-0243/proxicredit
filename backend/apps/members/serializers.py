from decimal import Decimal

from drf_spectacular.utils import extend_schema_field
from rest_framework import serializers

from apps.core.models import Devise
from apps.members import services
from apps.members.models import (
    Beneficiaire,
    DocumentMembre,
    HistoriqueStatut,
    Membre,
    MembreGroupe,
)

CHAMPS_PHYSIQUE = [
    "nom",
    "postnom",
    "prenom",
    "sexe",
    "date_naissance",
    "lieu_naissance",
    "nationalite",
    "etat_civil",
    "personnes_a_charge",
    "type_piece",
    "numero_piece",
    "piece_delivree_le",
    "piece_expire_le",
    "profession",
    "employeur",
]
CHAMPS_MORALE = [
    "raison_sociale",
    "forme_juridique",
    "rccm",
    "id_nat",
    "numero_impot",
    "date_creation",
    "representant_nom",
    "representant_fonction",
    "representant_telephone",
]
CHAMPS_GROUPE = ["nom_groupe"]
CHAMPS_COMMUNS = [
    "telephone",
    "telephone_secondaire",
    "email",
    "province",
    "ville",
    "commune",
    "quartier",
    "avenue",
    "numero_adresse",
    "activite",
    "revenu_mensuel",
    "devise_revenu",
    "charges_mensuelles",
]
CHAMPS_PAR_TYPE = {
    Membre.Type.PHYSIQUE: CHAMPS_PHYSIQUE,
    Membre.Type.MORALE: CHAMPS_MORALE,
    Membre.Type.GROUPE: CHAMPS_GROUPE,
}
OBLIGATOIRES_A_LA_CREATION = {
    Membre.Type.PHYSIQUE: {
        "nom": "Le nom est obligatoire.",
        "prenom": "Le prénom est obligatoire.",
    },
    Membre.Type.MORALE: {"raison_sociale": "La raison sociale est obligatoire."},
    Membre.Type.GROUPE: {"nom_groupe": "Le nom du groupe est obligatoire."},
}


class MembreListeSerializer(serializers.ModelSerializer):
    agence_code = serializers.CharField(source="agence.code", read_only=True)

    class Meta:
        model = Membre
        fields = [
            "id",
            "numero",
            "type",
            "statut",
            "nom_complet",
            "telephone",
            "agence",
            "agence_code",
            "en_liste_noire",
            "cree_le",
        ]
        read_only_fields = fields


class GroupeActuelSerializer(serializers.Serializer):
    id = serializers.IntegerField()
    numero = serializers.CharField()
    nom = serializers.CharField()
    fonction = serializers.CharField()


class MembreSerializer(serializers.ModelSerializer):
    agence_code = serializers.CharField(source="agence.code", read_only=True)
    cree_par = serializers.StringRelatedField()
    active_par = serializers.StringRelatedField()
    photo = serializers.SerializerMethodField()
    signature = serializers.SerializerMethodField()
    groupe_actuel = serializers.SerializerMethodField()
    devise_revenu = serializers.PrimaryKeyRelatedField(
        queryset=Devise.objects.all(), required=False, allow_null=True
    )

    class Meta:
        model = Membre
        fields = [
            "id",
            "numero",
            "type",
            "statut",
            "nom_complet",
            "agence",
            "agence_code",
            *CHAMPS_PHYSIQUE,
            *CHAMPS_MORALE,
            *CHAMPS_GROUPE,
            *CHAMPS_COMMUNS,
            "en_liste_noire",
            "motif_liste_noire",
            "cree_par",
            "cree_le",
            "active_par",
            "active_le",
            "photo",
            "signature",
            "groupe_actuel",
        ]
        # Unicité de la pièce et du RCCM vérifiée dans validate(), avec un message explicite.
        validators = []
        read_only_fields = [
            "numero",
            "statut",
            "nom_complet",
            "agence",
            "en_liste_noire",
            "motif_liste_noire",
            "cree_le",
            "active_le",
        ]

    def _dernier_document(self, obj, type_document) -> int | None:
        document = obj.documents.filter(type=type_document).order_by("-ajoute_le").first()
        return document.pk if document else None

    def get_photo(self, obj) -> int | None:
        return self._dernier_document(obj, DocumentMembre.Type.PHOTO)

    def get_signature(self, obj) -> int | None:
        return self._dernier_document(obj, DocumentMembre.Type.SIGNATURE)

    @extend_schema_field(GroupeActuelSerializer(allow_null=True))
    def get_groupe_actuel(self, obj):
        lien = (
            obj.groupes.filter(date_sortie__isnull=True).select_related("groupe").first()
            if obj.type == Membre.Type.PHYSIQUE
            else None
        )
        if lien is None:
            return None
        return {
            "id": lien.groupe_id,
            "numero": lien.groupe.numero,
            "nom": lien.groupe.nom_complet,
            "fonction": lien.get_fonction_display(),
        }

    def validate(self, attrs):
        type_membre = attrs.get("type", self.instance.type if self.instance else None)
        if self.instance and "type" in attrs and attrs["type"] != self.instance.type:
            raise serializers.ValidationError({"type": "Le type d'un membre ne peut pas changer."})

        # Les champs propres aux autres types sont ignorés.
        for autre, champs in CHAMPS_PAR_TYPE.items():
            if autre != type_membre:
                for champ in champs:
                    attrs.pop(champ, None)

        if self.instance is None:
            erreurs = {
                champ: message
                for champ, message in OBLIGATOIRES_A_LA_CREATION[type_membre].items()
                if not str(attrs.get(champ, "")).strip()
            }
            if erreurs:
                raise serializers.ValidationError(erreurs)

        def valeur(champ):
            return attrs.get(champ, getattr(self.instance, champ, None) if self.instance else None)

        if valeur("revenu_mensuel") is not None and not valeur("devise_revenu"):
            raise serializers.ValidationError({"devise_revenu": "Précisez la devise du revenu."})
        for champ in ("revenu_mensuel", "charges_mensuelles"):
            if attrs.get(champ) is not None and attrs[champ] < Decimal(0):
                raise serializers.ValidationError({champ: "Le montant ne peut pas être négatif."})

        autres = Membre.objects.exclude(pk=self.instance.pk) if self.instance else Membre.objects
        if valeur("numero_piece"):
            doublon = autres.filter(
                type_piece=valeur("type_piece"), numero_piece=valeur("numero_piece")
            ).first()
            if doublon:
                raise serializers.ValidationError(
                    {"numero_piece": f"Pièce déjà enregistrée pour le membre {doublon}."}
                )
        if valeur("rccm"):
            doublon = autres.filter(rccm=valeur("rccm")).first()
            if doublon:
                raise serializers.ValidationError(
                    {"rccm": f"RCCM déjà enregistré pour le membre {doublon}."}
                )
        livree, expire = valeur("piece_delivree_le"), valeur("piece_expire_le")
        if livree and expire and expire <= livree:
            raise serializers.ValidationError(
                {"piece_expire_le": "La date d'expiration doit suivre la date de délivrance."}
            )
        return attrs

    def create(self, validated_data):
        return services.creer_membre(validated_data, self.context["request"].user)

    def update(self, instance, validated_data):
        services.verifier_modifiable(instance)
        return super().update(instance, validated_data)


class DocumentMembreSerializer(serializers.ModelSerializer):
    ajoute_par = serializers.StringRelatedField()

    class Meta:
        model = DocumentMembre
        fields = [
            "id",
            "type",
            "nom_origine",
            "type_contenu",
            "taille",
            "description",
            "ajoute_par",
            "ajoute_le",
        ]
        read_only_fields = fields


class AjoutDocumentSerializer(serializers.Serializer):
    type = serializers.ChoiceField(choices=DocumentMembre.Type.choices)
    fichier = serializers.FileField()
    description = serializers.CharField(
        max_length=255, required=False, allow_blank=True, default=""
    )


class BeneficiaireSerializer(serializers.ModelSerializer):
    class Meta:
        model = Beneficiaire
        fields = ["id", "nom_complet", "lien", "telephone", "pourcentage"]

    def validate_pourcentage(self, valeur):
        if not Decimal(0) < valeur <= Decimal(100):
            raise serializers.ValidationError("Entre 0 et 100 %.")
        return valeur


class MembreGroupeSerializer(serializers.ModelSerializer):
    membre_numero = serializers.CharField(source="membre.numero", read_only=True)
    membre_nom = serializers.CharField(source="membre.nom_complet", read_only=True)
    membre_statut = serializers.CharField(source="membre.statut", read_only=True)

    class Meta:
        model = MembreGroupe
        fields = [
            "id",
            "membre",
            "membre_numero",
            "membre_nom",
            "membre_statut",
            "fonction",
            "date_entree",
            "date_sortie",
        ]
        read_only_fields = fields


class AjoutGroupeSerializer(serializers.Serializer):
    membre = serializers.PrimaryKeyRelatedField(
        queryset=Membre.objects.filter(type=Membre.Type.PHYSIQUE)
    )
    fonction = serializers.ChoiceField(
        choices=MembreGroupe.Fonction.choices, default=MembreGroupe.Fonction.MEMBRE
    )


class HistoriqueStatutSerializer(serializers.ModelSerializer):
    par = serializers.StringRelatedField()

    class Meta:
        model = HistoriqueStatut
        fields = ["id", "ancien", "nouveau", "motif", "par", "le"]
        read_only_fields = fields


class ControleActivationSerializer(serializers.Serializer):
    pret = serializers.BooleanField()
    manquants = serializers.ListField(child=serializers.CharField())


class ChangerStatutSerializer(serializers.Serializer):
    action = serializers.ChoiceField(choices=list(services.TRANSITIONS))
    motif = serializers.CharField(max_length=255)


class ListeNoireSerializer(serializers.Serializer):
    inscrire = serializers.BooleanField()
    motif = serializers.CharField(max_length=255)
