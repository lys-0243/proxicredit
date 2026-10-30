from rest_framework import serializers

from apps.core.models import Agence, Devise, JourFerie, JourneeComptable, Parametre, TauxChange


class DeviseSerializer(serializers.ModelSerializer):
    class Meta:
        model = Devise
        fields = ["code", "nom", "symbole", "decimales", "est_reference", "active"]
        read_only_fields = ["code", "decimales", "est_reference"]


class AgenceSerializer(serializers.ModelSerializer):
    class Meta:
        model = Agence
        fields = ["id", "code", "nom", "adresse", "telephone", "est_siege", "active"]


class TauxChangeSerializer(serializers.ModelSerializer):
    saisi_par = serializers.StringRelatedField(read_only=True)

    class Meta:
        model = TauxChange
        fields = [
            "id",
            "date",
            "devise_source",
            "devise_cible",
            "taux_achat",
            "taux_vente",
            "taux_reference",
            "saisi_par",
            "cree_le",
        ]

    def validate(self, attrs):
        achat, vente, ref = (
            attrs.get("taux_achat"),
            attrs.get("taux_vente"),
            attrs.get("taux_reference"),
        )
        if achat and vente and achat > vente:
            raise serializers.ValidationError(
                "Le taux d'achat ne peut pas dépasser le taux de vente."
            )
        if achat and vente and ref and not (achat <= ref <= vente):
            raise serializers.ValidationError(
                "Le taux de référence doit être compris entre l'achat et la vente."
            )
        return attrs


class JourFerieSerializer(serializers.ModelSerializer):
    class Meta:
        model = JourFerie
        fields = ["id", "date", "libelle", "recurrent"]


class JourneeComptableSerializer(serializers.ModelSerializer):
    agence = AgenceSerializer(read_only=True)
    ouverte_par = serializers.StringRelatedField()
    fermee_par = serializers.StringRelatedField()

    class Meta:
        model = JourneeComptable
        fields = [
            "id",
            "agence",
            "date",
            "statut",
            "ouverte_par",
            "ouverte_le",
            "fermee_par",
            "fermee_le",
        ]


class OuvrirJourneeSerializer(serializers.Serializer):
    agence = serializers.PrimaryKeyRelatedField(queryset=Agence.objects.filter(active=True))
    date = serializers.DateField()


class FermerJourneeSerializer(serializers.Serializer):
    agence = serializers.PrimaryKeyRelatedField(queryset=Agence.objects.filter(active=True))


class ParametreSerializer(serializers.ModelSerializer):
    class Meta:
        model = Parametre
        fields = ["id", "cle", "valeur", "date_effet", "description"]
