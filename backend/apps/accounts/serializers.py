from django.contrib.auth.models import Group
from django.contrib.auth.password_validation import validate_password
from rest_framework import serializers

from apps.accounts.models import JournalConnexion, Utilisateur
from apps.accounts.roles import LIBELLES_ROLES
from apps.core.models import Agence
from apps.core.services import journee_ouverte


class AgenceCourteSerializer(serializers.ModelSerializer):
    class Meta:
        model = Agence
        fields = ["id", "code", "nom", "est_siege"]


class MoiSerializer(serializers.ModelSerializer):
    agence = AgenceCourteSerializer(read_only=True)
    roles = serializers.ListField(child=serializers.CharField(), read_only=True)
    roles_libelles = serializers.SerializerMethodField()
    permissions = serializers.SerializerMethodField()
    doit_configurer_2fa = serializers.BooleanField(read_only=True)
    date_comptable = serializers.SerializerMethodField()
    photo = serializers.SerializerMethodField()

    class Meta:
        model = Utilisateur
        fields = [
            "id",
            "username",
            "first_name",
            "last_name",
            "email",
            "telephone",
            "photo",
            "agence",
            "roles",
            "roles_libelles",
            "permissions",
            "otp_active",
            "doit_changer_mdp",
            "doit_configurer_2fa",
            "date_comptable",
            "is_superuser",
        ]
        read_only_fields = fields

    def get_roles_libelles(self, obj) -> list[str]:
        return [LIBELLES_ROLES.get(code, code) for code in obj.roles]

    def get_permissions(self, obj) -> list[str]:
        return sorted(obj.get_all_permissions())

    def get_date_comptable(self, obj) -> str | None:
        journee = journee_ouverte(obj.agence) if obj.agence else None
        return journee.date.isoformat() if journee else None

    def get_photo(self, obj) -> str | None:
        if not obj.photo:
            return None
        # Le nom de fichier change à chaque dépôt : sert de cache-buster côté navigateur.
        return f"/api/auth/moi/photo?v={obj.photo.name.rsplit('/', 1)[-1]}"


class MettreAJourProfilSerializer(serializers.ModelSerializer):
    class Meta:
        model = Utilisateur
        fields = ["first_name", "last_name", "email", "telephone"]


class PhotoProfilSerializer(serializers.Serializer):
    photo = serializers.FileField()


class ConnexionSerializer(serializers.Serializer):
    username = serializers.CharField()
    password = serializers.CharField(style={"input_type": "password"})
    code_otp = serializers.CharField(required=False, allow_blank=True)


class ChangerMotDePasseSerializer(serializers.Serializer):
    ancien = serializers.CharField()
    nouveau = serializers.CharField()

    def validate(self, attrs):
        user = self.context["request"].user
        if not user.check_password(attrs["ancien"]):
            raise serializers.ValidationError({"ancien": "Mot de passe actuel incorrect."})
        if attrs["ancien"] == attrs["nouveau"]:
            raise serializers.ValidationError({"nouveau": "Le nouveau mot de passe doit différer."})
        validate_password(attrs["nouveau"], user)
        return attrs


class CodeOtpSerializer(serializers.Serializer):
    code = serializers.CharField()


class Desactiver2FASerializer(serializers.Serializer):
    mot_de_passe = serializers.CharField()
    code = serializers.CharField()


class RoleSerializer(serializers.ModelSerializer):
    code = serializers.CharField(source="name")
    libelle = serializers.SerializerMethodField()

    class Meta:
        model = Group
        fields = ["id", "code", "libelle"]

    def get_libelle(self, obj) -> str:
        return LIBELLES_ROLES.get(obj.name, obj.name)


class UtilisateurSerializer(serializers.ModelSerializer):
    roles = serializers.SlugRelatedField(
        source="groups", many=True, slug_field="name", queryset=Group.objects.all()
    )
    agence_detail = AgenceCourteSerializer(source="agence", read_only=True)
    mot_de_passe = serializers.CharField(write_only=True, required=False)

    class Meta:
        model = Utilisateur
        fields = [
            "id",
            "username",
            "first_name",
            "last_name",
            "email",
            "telephone",
            "agence",
            "agence_detail",
            "roles",
            "is_active",
            "otp_active",
            "doit_changer_mdp",
            "last_login",
            "date_joined",
            "mot_de_passe",
        ]
        read_only_fields = ["otp_active", "doit_changer_mdp", "last_login", "date_joined"]

    def validate(self, attrs):
        if self.instance is None and not attrs.get("mot_de_passe"):
            raise serializers.ValidationError({"mot_de_passe": "Mot de passe provisoire requis."})
        if attrs.get("mot_de_passe"):
            validate_password(attrs["mot_de_passe"])
        return attrs

    def create(self, validated_data):
        groupes = validated_data.pop("groups", [])
        mdp = validated_data.pop("mot_de_passe")
        user = Utilisateur(**validated_data, doit_changer_mdp=True)
        user.set_password(mdp)
        user.save()
        user.groups.set(groupes)
        return user

    def update(self, instance, validated_data):
        validated_data.pop("mot_de_passe", None)  # le mot de passe passe par l'action dédiée
        return super().update(instance, validated_data)


class ReinitialiserMotDePasseSerializer(serializers.Serializer):
    mot_de_passe = serializers.CharField()

    def validate_mot_de_passe(self, valeur):
        validate_password(valeur)
        return valeur


class JournalConnexionSerializer(serializers.ModelSerializer):
    class Meta:
        model = JournalConnexion
        fields = [
            "id",
            "utilisateur",
            "identifiant",
            "evenement",
            "adresse_ip",
            "navigateur",
            "date",
        ]
