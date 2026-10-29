from drf_spectacular.utils import extend_schema_field
from rest_framework import serializers

from apps.cash import services
from apps.cash.models import Caisse, OperationCaisse, SessionCaisse


class CaisseSerializer(serializers.ModelSerializer):
    agence_code = serializers.CharField(source="agence.code", read_only=True)
    compte_numero = serializers.CharField(source="compte.numero", read_only=True)
    session_ouverte = serializers.SerializerMethodField()

    class Meta:
        model = Caisse
        fields = [
            "id",
            "agence",
            "agence_code",
            "code",
            "libelle",
            "type",
            "compte",
            "compte_numero",
            "active",
            "session_ouverte",
        ]

    def get_session_ouverte(self, obj) -> int | None:
        session = obj.sessions.filter(statut=SessionCaisse.Statut.OUVERTE).first()
        return session.pk if session else None

    def validate_compte(self, compte):
        if not compte.numero.startswith(services.PREFIXE_CAISSE) or not compte.est_mouvementable:
            raise serializers.ValidationError("Choisissez un compte de caisse (57) mouvementable.")
        return compte


class SituationDeviseSerializer(serializers.Serializer):
    devise = serializers.CharField()
    ouverture = serializers.DecimalField(max_digits=20, decimal_places=2)
    entrees = serializers.DecimalField(max_digits=20, decimal_places=2)
    sorties = serializers.DecimalField(max_digits=20, decimal_places=2)
    theorique = serializers.DecimalField(max_digits=20, decimal_places=2)
    compte = serializers.DecimalField(max_digits=20, decimal_places=2, allow_null=True)
    ecart = serializers.DecimalField(max_digits=20, decimal_places=2, allow_null=True)


class SessionCaisseSerializer(serializers.ModelSerializer):
    caisse_code = serializers.CharField(source="caisse.code", read_only=True)
    caisse_libelle = serializers.CharField(source="caisse.libelle", read_only=True)
    compte_numero = serializers.CharField(source="caisse.compte.numero", read_only=True)
    caissier = serializers.StringRelatedField()
    situation = serializers.SerializerMethodField()

    class Meta:
        model = SessionCaisse
        fields = [
            "id",
            "caisse",
            "caisse_code",
            "caisse_libelle",
            "compte_numero",
            "caissier",
            "date_comptable",
            "statut",
            "ouverte_le",
            "fermee_le",
            "commentaire",
            "situation",
        ]
        read_only_fields = fields

    @extend_schema_field(SituationDeviseSerializer(many=True))
    def get_situation(self, obj):
        return SituationDeviseSerializer(services.situation(obj), many=True).data


class OperationCaisseSerializer(serializers.ModelSerializer):
    ecriture_numero = serializers.CharField(source="ecriture.numero", read_only=True)
    membre_numero = serializers.CharField(source="membre.numero", read_only=True, default=None)
    membre_nom = serializers.CharField(source="membre.nom_complet", read_only=True, default=None)
    cree_par = serializers.StringRelatedField()

    class Meta:
        model = OperationCaisse
        fields = [
            "id",
            "session",
            "type_operation",
            "sens",
            "devise",
            "montant",
            "libelle",
            "membre",
            "membre_numero",
            "membre_nom",
            "ecriture",
            "ecriture_numero",
            "cree_par",
            "cree_le",
        ]
        read_only_fields = fields


class OuvrirSessionSerializer(serializers.Serializer):
    caisse = serializers.PrimaryKeyRelatedField(
        queryset=Caisse.objects.filter(type=Caisse.Type.GUICHET, active=True)
    )


class FermerSessionSerializer(serializers.Serializer):
    comptages = serializers.DictField(
        child=serializers.DecimalField(max_digits=20, decimal_places=2, min_value=0),
        help_text='Montant compté par devise, ex. {"CDF": "150000.00", "USD": "0.00"}.',
    )
    commentaire = serializers.CharField(
        max_length=255, required=False, allow_blank=True, default=""
    )


class TransfertCoffreSerializer(serializers.Serializer):
    sens = serializers.ChoiceField(
        choices=OperationCaisse.Sens.choices,
        help_text="ENTREE : approvisionnement depuis le coffre ; SORTIE : délestage vers lui.",
    )
    devise = serializers.CharField(max_length=3)
    montant = serializers.DecimalField(max_digits=20, decimal_places=2)
    cle_idempotence = serializers.CharField(max_length=100)
