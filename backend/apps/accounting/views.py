import django_filters
from drf_spectacular.utils import extend_schema
from rest_framework import exceptions, status, viewsets
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.accounting import serializers as s
from apps.accounting import services
from apps.accounting.models import CompteComptable, Ecriture, Journal, RegleComptable
from apps.core.scoping import FiltreAgenceMixin, voit_toutes_agences
from apps.core.views import SansSuppressionViewSet


class CompteComptableViewSet(SansSuppressionViewSet):
    queryset = CompteComptable.objects.all()
    serializer_class = s.CompteComptableSerializer
    pagination_class = None
    filterset_fields = ["classe", "est_mouvementable", "actif"]
    search_fields = ["numero", "libelle"]


class JournalViewSet(SansSuppressionViewSet):
    queryset = Journal.objects.all()
    serializer_class = s.JournalSerializer
    pagination_class = None


class FiltreEcriture(django_filters.FilterSet):
    du = django_filters.DateFilter(field_name="date_comptable", lookup_expr="gte")
    au = django_filters.DateFilter(field_name="date_comptable", lookup_expr="lte")
    compte = django_filters.CharFilter(field_name="lignes__compte__numero", distinct=True)

    class Meta:
        model = Ecriture
        fields = ["statut", "journal", "devise", "type_operation", "du", "au", "compte"]


class EcritureViewSet(FiltreAgenceMixin, viewsets.ModelViewSet):
    queryset = Ecriture.objects.select_related(
        "journal", "agence", "cree_par", "valide_par", "contre_passation"
    ).prefetch_related("lignes__compte")
    filterset_class = FiltreEcriture
    search_fields = ["numero", "libelle", "reference"]
    ordering_fields = ["date_comptable", "numero", "cree_le"]
    permissions_action = {
        "valider": ["accounting.valider_ecriture"],
        "contre_passer": ["accounting.contre_passer_ecriture"],
    }

    def get_serializer_class(self):
        if self.action in ("create", "update", "partial_update"):
            return s.EcritureSaisieSerializer
        return s.EcritureSerializer

    def _brouillon_manuel(self, ecriture):
        if ecriture.statut != Ecriture.Statut.BROUILLON:
            raise exceptions.ValidationError({"detail": "Seul un brouillon peut être modifié."})
        if ecriture.type_operation != Ecriture.SAISIE_MANUELLE:
            raise exceptions.ValidationError(
                {"detail": "Seule une saisie manuelle est modifiable."}
            )

    def perform_update(self, serializer):
        self._brouillon_manuel(serializer.instance)
        serializer.save()

    def perform_destroy(self, instance):
        if instance.statut != Ecriture.Statut.BROUILLON:
            raise exceptions.ValidationError({"detail": "Une écriture validée ne se supprime pas."})
        instance.delete()

    @extend_schema(request=None, responses=s.EcritureSerializer)
    @action(detail=True, methods=["post"])
    def valider(self, request, pk=None):
        ecriture = services.valider(self.get_object(), request.user)
        return Response(s.EcritureSerializer(ecriture).data)

    @extend_schema(request=s.ContrePasserSerializer, responses=s.EcritureSerializer)
    @action(detail=True, methods=["post"], url_path="contre-passer")
    def contre_passer(self, request, pk=None):
        ser = s.ContrePasserSerializer(data=request.data)
        ser.is_valid(raise_exception=True)
        inverse = services.contre_passer(
            self.get_object(), request.user, ser.validated_data["motif"]
        )
        return Response(s.EcritureSerializer(inverse).data, status=status.HTTP_201_CREATED)


class RegleComptableViewSet(viewsets.ModelViewSet):
    queryset = RegleComptable.objects.select_related("journal").prefetch_related("lignes")
    serializer_class = s.RegleComptableSerializer
    filterset_fields = ["type_operation", "code_produit", "devise", "actif"]


def _filtres(request, serializer_class):
    ser = serializer_class(data=request.query_params)
    ser.is_valid(raise_exception=True)
    filtres = dict(ser.validated_data)
    if not voit_toutes_agences(request.user):
        filtres["agence"] = request.user.agence
    return filtres


class BalanceView(APIView):
    permissions_requises = ["accounting.voir_etats"]

    @extend_schema(parameters=[s.FiltreEtatSerializer], responses=s.BalanceSerializer)
    def get(self, request):
        f = _filtres(request, s.FiltreEtatSerializer)
        lignes = services.balance(
            f["devise"], agence=f.get("agence"), du=f.get("du"), au=f.get("au")
        )
        classes = sorted({ligne["classe"] for ligne in lignes})
        donnees = {
            "lignes": lignes,
            "classes": [
                {"classe": c, **services.totaliser([lg for lg in lignes if lg["classe"] == c])}
                for c in classes
            ],
            "total": services.totaliser(lignes),
        }
        return Response(s.BalanceSerializer(donnees).data)


class GrandLivreView(APIView):
    permissions_requises = ["accounting.voir_etats"]

    @extend_schema(parameters=[s.FiltreGrandLivreSerializer], responses=s.GrandLivreSerializer)
    def get(self, request):
        f = _filtres(request, s.FiltreGrandLivreSerializer)
        donnees = services.grand_livre(
            f["compte"], f["devise"], agence=f.get("agence"), du=f.get("du"), au=f.get("au")
        )
        return Response(s.GrandLivreSerializer(donnees).data)
