from drf_spectacular.utils import extend_schema
from rest_framework import exceptions, mixins, status, viewsets
from rest_framework.decorators import action
from rest_framework.response import Response

from apps.core import serializers as s
from apps.core import services
from apps.core.models import Agence, Devise, JourFerie, JourneeComptable, Parametre, TauxChange
from apps.core.scoping import FiltreAgenceMixin, voit_toutes_agences


class SansSuppressionViewSet(
    mixins.ListModelMixin,
    mixins.RetrieveModelMixin,
    mixins.CreateModelMixin,
    mixins.UpdateModelMixin,
    viewsets.GenericViewSet,
):
    """Les données de référence ne se suppriment pas : on les désactive."""


class DeviseViewSet(SansSuppressionViewSet):
    queryset = Devise.objects.all()
    serializer_class = s.DeviseSerializer
    pagination_class = None


class AgenceViewSet(SansSuppressionViewSet):
    queryset = Agence.objects.all()
    serializer_class = s.AgenceSerializer
    pagination_class = None
    search_fields = ["code", "nom"]


class TauxChangeViewSet(SansSuppressionViewSet):
    queryset = TauxChange.objects.select_related("saisi_par")
    serializer_class = s.TauxChangeSerializer
    filterset_fields = ["date", "devise_source", "devise_cible"]

    def perform_create(self, serializer):
        serializer.save(saisi_par=self.request.user)


class JourFerieViewSet(viewsets.ModelViewSet):
    queryset = JourFerie.objects.all()
    serializer_class = s.JourFerieSerializer
    pagination_class = None


class ParametreViewSet(SansSuppressionViewSet):
    queryset = Parametre.objects.all()
    serializer_class = s.ParametreSerializer
    filterset_fields = ["cle"]


def _verifier_agence(user, agence):
    if not voit_toutes_agences(user) and user.agence_id != agence.pk:
        raise exceptions.PermissionDenied("Vous ne pouvez agir que sur votre agence.")


class JourneeComptableViewSet(FiltreAgenceMixin, viewsets.ReadOnlyModelViewSet):
    queryset = JourneeComptable.objects.select_related("agence", "ouverte_par", "fermee_par")
    serializer_class = s.JourneeComptableSerializer
    filterset_fields = ["statut", "agence"]
    permissions_action = {
        "ouvrir": ["core.ouvrir_journee"],
        "fermer": ["core.fermer_journee"],
    }

    @extend_schema(request=s.OuvrirJourneeSerializer, responses=s.JourneeComptableSerializer)
    @action(detail=False, methods=["post"])
    def ouvrir(self, request):
        ser = s.OuvrirJourneeSerializer(data=request.data)
        ser.is_valid(raise_exception=True)
        agence = ser.validated_data["agence"]
        _verifier_agence(request.user, agence)
        journee = services.ouvrir_journee(agence, ser.validated_data["date"], request.user)
        return Response(s.JourneeComptableSerializer(journee).data, status=status.HTTP_201_CREATED)

    @extend_schema(request=s.FermerJourneeSerializer, responses=s.JourneeComptableSerializer)
    @action(detail=False, methods=["post"])
    def fermer(self, request):
        ser = s.FermerJourneeSerializer(data=request.data)
        ser.is_valid(raise_exception=True)
        agence = ser.validated_data["agence"]
        _verifier_agence(request.user, agence)
        journee = services.fermer_journee(agence, request.user)
        return Response(s.JourneeComptableSerializer(journee).data)
