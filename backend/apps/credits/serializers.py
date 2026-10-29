from django.db import transaction
from drf_spectacular.utils import extend_schema_field
from rest_framework import serializers

from apps.core.models import Devise
from apps.credits import services
from apps.credits.models import (
    Credit,
    Echeance,
    HistoriqueCredit,
    PlafondCredit,
    ProduitCredit,
    Remboursement,
)
from apps.members.models import Membre
from apps.savings.models import CompteEpargne

MONTANT = {"max_digits": 20, "decimal_places": 2}


class PlafondCreditSerializer(serializers.ModelSerializer):
    class Meta:
        model = PlafondCredit
        fields = ["devise", "montant_min", "montant_max"]


class ComptesProduitSerializer(serializers.Serializer):
    encours = serializers.CharField(allow_null=True)
    interets = serializers.CharField(allow_null=True)


class ProduitCreditSerializer(serializers.ModelSerializer):
    """Le code et les comptes (encours, intérêts) sont fixés à la création : ils relient le
    produit à ses règles de comptabilisation et aux crédits déjà accordés."""

    plafonds = PlafondCreditSerializer(many=True)
    compte_encours = serializers.CharField(
        write_only=True, required=False, help_text="Création : compte d'encours (41x)."
    )
    compte_interets = serializers.CharField(
        write_only=True, required=False, help_text="Création : compte d'intérêts (77x)."
    )
    comptes = serializers.SerializerMethodField()

    class Meta:
        model = ProduitCredit
        fields = [
            "id",
            "code",
            "libelle",
            "description",
            "methode",
            "periodicite",
            "taux_interet",
            "duree_min",
            "duree_max",
            "frais_dossier_taux",
            "epargne_garantie_taux",
            "taux_penalite_jour",
            "jours_grace",
            "actif",
            "plafonds",
            "compte_encours",
            "compte_interets",
            "comptes",
        ]

    @extend_schema_field(ComptesProduitSerializer)
    def get_comptes(self, obj):
        return services.comptes_produit(obj)

    def validate(self, attrs):
        if self.instance is not None:
            if "code" in attrs and attrs["code"] != self.instance.code:
                raise serializers.ValidationError({"code": "Le code d'un produit ne change pas."})
            if "compte_encours" in attrs or "compte_interets" in attrs:
                raise serializers.ValidationError(
                    {"compte_encours": "Les comptes d'un produit ne changent pas après création."}
                )
        else:
            manquants = {
                champ: "Obligatoire à la création."
                for champ in ("compte_encours", "compte_interets")
                if not attrs.get(champ)
            }
            if manquants:
                raise serializers.ValidationError(manquants)
        minimum = attrs.get("duree_min", getattr(self.instance, "duree_min", None))
        maximum = attrs.get("duree_max", getattr(self.instance, "duree_max", None))
        if minimum and maximum and maximum < minimum:
            raise serializers.ValidationError({"duree_max": "Doit être supérieure au minimum."})
        plafonds = attrs.get("plafonds")
        if plafonds is not None:
            if not plafonds:
                raise serializers.ValidationError({"plafonds": "Au moins une devise."})
            devises = [p["devise"] for p in plafonds]
            if len(set(devises)) != len(devises):
                raise serializers.ValidationError({"plafonds": "Une seule ligne par devise."})
            for plafond in plafonds:
                if not 0 < plafond["montant_min"] <= plafond["montant_max"]:
                    raise serializers.ValidationError(
                        {"plafonds": "Minimum et maximum incohérents."}
                    )
        return attrs

    def create(self, validated_data):
        plafonds = validated_data.pop("plafonds")
        compte_encours = validated_data.pop("compte_encours")
        compte_interets = validated_data.pop("compte_interets")
        return services.creer_produit(
            validated_data,
            plafonds,
            compte_encours=compte_encours,
            compte_interets=compte_interets,
        )

    @transaction.atomic
    def update(self, instance, validated_data):
        plafonds = validated_data.pop("plafonds", None)
        instance = super().update(instance, validated_data)
        if plafonds is not None:
            instance.plafonds.all().delete()
            for plafond in plafonds:
                PlafondCredit.objects.create(produit=instance, **plafond)
        return instance


# --- Simulation ---------------------------------------------------------------------------


class SimulationDemandeSerializer(serializers.Serializer):
    produit = serializers.PrimaryKeyRelatedField(queryset=ProduitCredit.objects.filter(actif=True))
    devise = serializers.PrimaryKeyRelatedField(queryset=Devise.objects.filter(active=True))
    montant = serializers.DecimalField(**MONTANT)
    duree = serializers.IntegerField(min_value=1)
    date_depart = serializers.DateField(required=False)


class LigneEcheancierSerializer(serializers.Serializer):
    numero = serializers.IntegerField()
    date = serializers.DateField()
    capital = serializers.DecimalField(**MONTANT)
    interet = serializers.DecimalField(**MONTANT)
    total = serializers.DecimalField(**MONTANT)
    capital_restant = serializers.DecimalField(**MONTANT)


class SimulationSerializer(serializers.Serializer):
    lignes = LigneEcheancierSerializer(many=True)
    total_interets = serializers.DecimalField(**MONTANT)
    frais_dossier = serializers.DecimalField(**MONTANT)
    epargne_garantie = serializers.DecimalField(**MONTANT)
    montant_net = serializers.DecimalField(**MONTANT)


# --- Dossier de crédit --------------------------------------------------------------------


class CreditListeSerializer(serializers.ModelSerializer):
    membre_numero = serializers.CharField(source="membre.numero", read_only=True)
    membre_nom = serializers.CharField(source="membre.nom_complet", read_only=True)
    produit_libelle = serializers.CharField(source="produit.libelle", read_only=True)
    agence_code = serializers.CharField(source="agence.code", read_only=True)
    montant = serializers.SerializerMethodField()

    class Meta:
        model = Credit
        fields = [
            "id",
            "numero",
            "statut",
            "membre",
            "membre_numero",
            "membre_nom",
            "produit",
            "produit_libelle",
            "devise",
            "montant",
            "agence",
            "agence_code",
            "date_decaissement",
            "cree_le",
        ]
        read_only_fields = fields

    def get_montant(self, obj) -> str:
        return str(obj.montant_accorde or obj.montant_demande)


class SituationCreditSerializer(serializers.Serializer):
    capital_restant = serializers.DecimalField(**MONTANT)
    interet_restant = serializers.DecimalField(**MONTANT)
    penalites_dues = serializers.DecimalField(**MONTANT)
    total_du = serializers.DecimalField(**MONTANT)
    impaye = serializers.DecimalField(**MONTANT)
    echeances_en_retard = serializers.IntegerField()
    jours_retard = serializers.IntegerField()
    prochaine_echeance = serializers.DateField(allow_null=True)
    prochain_montant = serializers.DecimalField(**MONTANT)


class CreditSerializer(serializers.ModelSerializer):
    """Lecture complète d'un dossier, et saisie ou modification de la demande (en saisie)."""

    membre = serializers.PrimaryKeyRelatedField(queryset=Membre.objects.all())
    produit = serializers.PrimaryKeyRelatedField(queryset=ProduitCredit.objects.filter(actif=True))
    devise = serializers.PrimaryKeyRelatedField(queryset=Devise.objects.filter(active=True))
    membre_numero = serializers.CharField(source="membre.numero", read_only=True)
    membre_nom = serializers.CharField(source="membre.nom_complet", read_only=True)
    produit_libelle = serializers.CharField(source="produit.libelle", read_only=True)
    agence_code = serializers.CharField(source="agence.code", read_only=True)
    cree_par = serializers.StringRelatedField()
    soumis_par = serializers.StringRelatedField()
    analyse_par = serializers.StringRelatedField()
    decide_par = serializers.StringRelatedField()
    decaisse_par = serializers.StringRelatedField()
    ecriture_decaissement_numero = serializers.CharField(
        source="ecriture_decaissement.numero", read_only=True, default=None
    )
    situation = serializers.SerializerMethodField()

    class Meta:
        model = Credit
        fields = [
            "id",
            "numero",
            "statut",
            "agence",
            "agence_code",
            "membre",
            "membre_numero",
            "membre_nom",
            "produit",
            "produit_libelle",
            "devise",
            "montant_demande",
            "duree_demandee",
            "objet",
            "cree_par",
            "cree_le",
            "soumis_par",
            "soumis_le",
            "revenu_mensuel",
            "charges_mensuelles",
            "avis_analyse",
            "commentaire_analyse",
            "montant_propose",
            "duree_proposee",
            "analyse_par",
            "analyse_le",
            "montant_accorde",
            "duree_accordee",
            "taux_interet",
            "motif_decision",
            "decide_par",
            "decide_le",
            "frais_dossier",
            "epargne_bloquee",
            "date_decaissement",
            "ecriture_decaissement",
            "ecriture_decaissement_numero",
            "decaisse_par",
            "solde_le",
            "situation",
        ]
        read_only_fields = [
            f
            for f in fields
            if f
            not in ("membre", "produit", "devise", "montant_demande", "duree_demandee", "objet")
        ]

    @extend_schema_field(SituationCreditSerializer(allow_null=True))
    def get_situation(self, obj):
        if obj.statut not in (Credit.Statut.EN_COURS, Credit.Statut.SOLDE):
            return None
        return SituationCreditSerializer(services.situation(obj)).data

    def validate(self, attrs):
        if self.instance is not None and attrs.get("membre", self.instance.membre) != (
            self.instance.membre
        ):
            raise serializers.ValidationError({"membre": "Le membre d'un dossier ne change pas."})
        return attrs

    def create(self, validated_data):
        return services.creer_demande(validated_data, self.context["request"].user)

    def update(self, instance, validated_data):
        return services.modifier_demande(instance, validated_data)


class EcheanceSerializer(serializers.ModelSerializer):
    total = serializers.DecimalField(**MONTANT, read_only=True)
    reste_du = serializers.DecimalField(**MONTANT, read_only=True)

    class Meta:
        model = Echeance
        fields = [
            "id",
            "numero",
            "date",
            "capital",
            "interet",
            "total",
            "capital_paye",
            "interet_paye",
            "penalite",
            "penalite_payee",
            "reste_du",
            "soldee_le",
        ]
        read_only_fields = fields


class RemboursementSerializer(serializers.ModelSerializer):
    ecriture_numero = serializers.CharField(source="ecriture.numero", read_only=True)
    cree_par = serializers.StringRelatedField()

    class Meta:
        model = Remboursement
        fields = [
            "id",
            "montant",
            "capital",
            "interet",
            "penalite",
            "date_comptable",
            "ecriture",
            "ecriture_numero",
            "cree_par",
            "cree_le",
        ]
        read_only_fields = fields


class HistoriqueCreditSerializer(serializers.ModelSerializer):
    par = serializers.StringRelatedField()

    class Meta:
        model = HistoriqueCredit
        fields = ["id", "ancien", "nouveau", "commentaire", "par", "le"]
        read_only_fields = fields


class CapaciteSerializer(serializers.Serializer):
    echeance_max = serializers.DecimalField(**MONTANT)
    revenu_disponible = serializers.DecimalField(**MONTANT, allow_null=True)
    taux_endettement = serializers.DecimalField(max_digits=10, decimal_places=4, allow_null=True)
    taux_endettement_max = serializers.DecimalField(max_digits=10, decimal_places=4)
    depasse = serializers.BooleanField()


class ControleCreditSerializer(serializers.Serializer):
    bloquants = serializers.ListField(child=serializers.CharField())
    capacite = CapaciteSerializer()


# --- Actions du circuit -------------------------------------------------------------------


class MotifSerializer(serializers.Serializer):
    motif = serializers.CharField()


class AnalyseSerializer(serializers.Serializer):
    avis = serializers.ChoiceField(choices=Credit.Avis.choices)
    commentaire = serializers.CharField()
    montant_propose = serializers.DecimalField(**MONTANT)
    duree_proposee = serializers.IntegerField(min_value=1)
    revenu_mensuel = serializers.DecimalField(**MONTANT, required=False, allow_null=True)
    charges_mensuelles = serializers.DecimalField(**MONTANT, required=False, allow_null=True)


class DecisionSerializer(serializers.Serializer):
    approuver = serializers.BooleanField()
    motif = serializers.CharField()
    montant_accorde = serializers.DecimalField(**MONTANT, required=False, allow_null=True)
    duree_accordee = serializers.IntegerField(min_value=1, required=False, allow_null=True)


class VersementSerializer(serializers.Serializer):
    """Mode de paiement : un compte de trésorerie (caisse, Mobile Money) ou le compte d'épargne à
    vue du membre."""

    compte_tresorerie = serializers.CharField(required=False, allow_blank=True, default="")
    compte_epargne = serializers.PrimaryKeyRelatedField(
        queryset=CompteEpargne.objects.all(), required=False, allow_null=True, default=None
    )
    cle_idempotence = serializers.CharField(max_length=100)


class RemboursementDemandeSerializer(VersementSerializer):
    montant = serializers.DecimalField(**MONTANT)
