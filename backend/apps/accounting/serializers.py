from django.db import transaction
from rest_framework import serializers

from apps.accounting import services
from apps.accounting.models import (
    CompteComptable,
    Ecriture,
    Journal,
    LigneEcriture,
    RegleComptable,
    RegleComptableLigne,
)
from apps.core.models import Agence, Devise
from apps.core.scoping import voit_toutes_agences


class CompteComptableSerializer(serializers.ModelSerializer):
    class Meta:
        model = CompteComptable
        fields = [
            "id",
            "numero",
            "libelle",
            "classe",
            "sens_normal",
            "parent",
            "est_mouvementable",
            "devise",
            "actif",
        ]
        read_only_fields = ["classe"]

    def validate(self, attrs):
        compte = self.instance
        if compte and compte.lignes.exists():
            if "numero" in attrs and attrs["numero"] != compte.numero:
                raise serializers.ValidationError(
                    {"numero": "Compte déjà mouvementé : son numéro ne peut plus changer."}
                )
            if attrs.get("est_mouvementable") is False:
                raise serializers.ValidationError({"est_mouvementable": "Compte déjà mouvementé."})
        return attrs


class JournalSerializer(serializers.ModelSerializer):
    class Meta:
        model = Journal
        fields = ["id", "code", "libelle", "actif"]


class LigneEcritureSerializer(serializers.ModelSerializer):
    compte_numero = serializers.CharField(source="compte.numero", read_only=True)
    compte_libelle = serializers.CharField(source="compte.libelle", read_only=True)

    class Meta:
        model = LigneEcriture
        fields = ["id", "compte", "compte_numero", "compte_libelle", "libelle", "debit", "credit"]
        read_only_fields = fields


class EcritureSerializer(serializers.ModelSerializer):
    lignes = LigneEcritureSerializer(many=True, read_only=True)
    journal_code = serializers.CharField(source="journal.code", read_only=True)
    agence_code = serializers.CharField(source="agence.code", read_only=True)
    cree_par = serializers.StringRelatedField()
    valide_par = serializers.StringRelatedField()
    contre_passee_par = serializers.SerializerMethodField()
    total = serializers.SerializerMethodField()

    class Meta:
        model = Ecriture
        fields = [
            "id",
            "numero",
            "journal",
            "journal_code",
            "agence",
            "agence_code",
            "date_comptable",
            "libelle",
            "devise",
            "taux_reference",
            "type_operation",
            "reference",
            "statut",
            "contre_passation_de",
            "contre_passee_par",
            "cree_par",
            "cree_le",
            "valide_par",
            "valide_le",
            "total",
            "lignes",
        ]
        read_only_fields = fields

    def get_contre_passee_par(self, obj) -> int | None:
        inverse = getattr(obj, "contre_passation", None)
        return inverse.pk if inverse else None

    def get_total(self, obj) -> str:
        return str(sum((ligne.debit for ligne in obj.lignes.all()), start=0))


class LigneSaisieSerializer(serializers.Serializer):
    compte = serializers.PrimaryKeyRelatedField(queryset=CompteComptable.objects.all())
    debit = serializers.DecimalField(max_digits=20, decimal_places=2, default=0)
    credit = serializers.DecimalField(max_digits=20, decimal_places=2, default=0)
    libelle = serializers.CharField(required=False, allow_blank=True, default="")


class EcritureSaisieSerializer(serializers.Serializer):
    """Saisie manuelle (opération diverse) : enregistrée en brouillon, validée par un tiers."""

    journal = serializers.PrimaryKeyRelatedField(queryset=Journal.objects.filter(actif=True))
    agence = serializers.PrimaryKeyRelatedField(
        queryset=Agence.objects.filter(active=True), required=False
    )
    devise = serializers.PrimaryKeyRelatedField(queryset=Devise.objects.filter(active=True))
    libelle = serializers.CharField(max_length=255)
    reference = serializers.CharField(max_length=100, required=False, allow_blank=True, default="")
    lignes = LigneSaisieSerializer(many=True)

    def validate(self, attrs):
        user = self.context["request"].user
        agence = attrs.get("agence")
        if agence is None or not voit_toutes_agences(user):
            if user.agence is None:
                raise serializers.ValidationError("Aucune agence rattachée à votre compte.")
            attrs["agence"] = user.agence
        total_debit = sum(ligne["debit"] for ligne in attrs["lignes"])
        total_credit = sum(ligne["credit"] for ligne in attrs["lignes"])
        if len(attrs["lignes"]) < 2:
            raise serializers.ValidationError({"lignes": "Au moins deux lignes."})
        if total_debit != total_credit:
            raise serializers.ValidationError(
                {"lignes": f"Écriture déséquilibrée : débit {total_debit} ≠ crédit {total_credit}."}
            )
        return attrs

    @staticmethod
    def _lignes(attrs):
        return [services.Ligne(**ligne) for ligne in attrs["lignes"]]

    def create(self, validated_data):
        return services.creer_brouillon(
            journal=validated_data["journal"],
            agence=validated_data["agence"],
            devise=validated_data["devise"],
            libelle=validated_data["libelle"],
            reference=validated_data["reference"],
            lignes=self._lignes(validated_data),
            utilisateur=self.context["request"].user,
        )

    @transaction.atomic
    def update(self, instance, validated_data):
        for champ in ("journal", "agence", "devise", "libelle", "reference"):
            setattr(instance, champ, validated_data[champ])
        instance.save()
        services.remplacer_lignes(instance, self._lignes(validated_data))
        return instance

    def to_representation(self, instance):
        return EcritureSerializer(instance, context=self.context).data


class ContrePasserSerializer(serializers.Serializer):
    motif = serializers.CharField(max_length=200)


class RegleComptableLigneSerializer(serializers.ModelSerializer):
    class Meta:
        model = RegleComptableLigne
        fields = ["id", "ordre", "sens", "element", "compte", "compte_variable", "libelle"]

    def validate(self, attrs):
        if bool(attrs.get("compte")) == bool(attrs.get("compte_variable")):
            raise serializers.ValidationError(
                "Indiquez soit un compte fixe, soit un compte variable."
            )
        return attrs


class RegleComptableSerializer(serializers.ModelSerializer):
    lignes = RegleComptableLigneSerializer(many=True)

    class Meta:
        model = RegleComptable
        fields = [
            "id",
            "type_operation",
            "code_produit",
            "devise",
            "journal",
            "libelle",
            "actif",
            "lignes",
        ]

    @transaction.atomic
    def create(self, validated_data):
        lignes = validated_data.pop("lignes")
        regle = RegleComptable.objects.create(**validated_data)
        RegleComptableLigne.objects.bulk_create(
            RegleComptableLigne(regle=regle, **ligne) for ligne in lignes
        )
        return regle

    @transaction.atomic
    def update(self, instance, validated_data):
        lignes = validated_data.pop("lignes", None)
        instance = super().update(instance, validated_data)
        if lignes is not None:
            instance.lignes.all().delete()
            RegleComptableLigne.objects.bulk_create(
                RegleComptableLigne(regle=instance, **ligne) for ligne in lignes
            )
        return instance


class FiltreEtatSerializer(serializers.Serializer):
    devise = serializers.PrimaryKeyRelatedField(queryset=Devise.objects.all())
    agence = serializers.PrimaryKeyRelatedField(queryset=Agence.objects.all(), required=False)
    du = serializers.DateField(required=False)
    au = serializers.DateField(required=False)


class FiltreGrandLivreSerializer(FiltreEtatSerializer):
    compte = serializers.SlugRelatedField(
        slug_field="numero", queryset=CompteComptable.objects.all()
    )


class TotauxBalanceSerializer(serializers.Serializer):
    solde_ouverture = serializers.DecimalField(max_digits=20, decimal_places=2)
    debit = serializers.DecimalField(max_digits=20, decimal_places=2)
    credit = serializers.DecimalField(max_digits=20, decimal_places=2)
    solde_debiteur = serializers.DecimalField(max_digits=20, decimal_places=2)
    solde_crediteur = serializers.DecimalField(max_digits=20, decimal_places=2)


class LigneBalanceSerializer(TotauxBalanceSerializer):
    compte = serializers.CharField()
    libelle = serializers.CharField()
    classe = serializers.IntegerField()


class ClasseBalanceSerializer(TotauxBalanceSerializer):
    classe = serializers.IntegerField()


class BalanceSerializer(serializers.Serializer):
    lignes = LigneBalanceSerializer(many=True)
    classes = ClasseBalanceSerializer(many=True)
    total = TotauxBalanceSerializer()


class MouvementSerializer(serializers.Serializer):
    date = serializers.DateField()
    numero = serializers.CharField()
    ecriture_id = serializers.IntegerField()
    libelle = serializers.CharField()
    debit = serializers.DecimalField(max_digits=20, decimal_places=2)
    credit = serializers.DecimalField(max_digits=20, decimal_places=2)
    solde = serializers.DecimalField(max_digits=20, decimal_places=2)


class GrandLivreSerializer(serializers.Serializer):
    compte = serializers.CharField()
    libelle = serializers.CharField()
    report = serializers.DecimalField(max_digits=20, decimal_places=2)
    mouvements = MouvementSerializer(many=True)
    solde_final = serializers.DecimalField(max_digits=20, decimal_places=2)
