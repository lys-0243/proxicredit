from drf_spectacular.utils import extend_schema
from rest_framework import mixins, status, viewsets
from rest_framework.decorators import action
from rest_framework.response import Response

from apps.cash import serializers as s
from apps.cash import services
from apps.cash.models import Caisse, OperationCaisse, SessionCaisse
from apps.core.scoping import FiltreAgenceMixin
from apps.core.views import SansSuppressionViewSet


class CaisseViewSet(FiltreAgenceMixin, SansSuppressionViewSet):
    queryset = Caisse.objects.select_related("agence", "compte")
    serializer_class = s.CaisseSerializer
    pagination_class = None
    filterset_fields = ["type", "active"]


class SessionCaisseViewSet(FiltreAgenceMixin, viewsets.ReadOnlyModelViewSet):
    """Sessions des caissiers. Le caissier ouvre et ferme la sienne ; le responsable du coffre
    l'approvisionne ou la déleste."""

    champ_agence = "caisse__agence"
    queryset = SessionCaisse.objects.select_related("caisse__compte", "caissier")
    serializer_class = s.SessionCaisseSerializer
    filterset_fields = ["statut", "caisse", "caissier", "date_comptable"]
    permissions_action = {
        "ma_session": ["cash.ouvrir_session_caisse"],
        "ouvrir": ["cash.ouvrir_session_caisse"],
        "fermer": ["cash.ouvrir_session_caisse"],
        "transfert_coffre": ["cash.gerer_coffre"],
        "operations": ["cash.view_sessioncaisse"],
    }

    @extend_schema(responses={200: s.SessionCaisseSerializer, 204: None})
    @action(detail=False, methods=["get"], url_path="ma-session")
    def ma_session(self, request):
        """Session ouverte de l'utilisateur connecté (204 s'il n'en a pas)."""
        session = services.session_ouverte(request.user)
        if session is None:
            return Response(status=status.HTTP_204_NO_CONTENT)
        return Response(s.SessionCaisseSerializer(session).data)

    @extend_schema(request=s.OuvrirSessionSerializer, responses=s.SessionCaisseSerializer)
    @action(detail=False, methods=["post"])
    def ouvrir(self, request):
        ser = s.OuvrirSessionSerializer(data=request.data)
        ser.is_valid(raise_exception=True)
        session = services.ouvrir_session(ser.validated_data["caisse"], request.user)
        return Response(s.SessionCaisseSerializer(session).data, status=status.HTTP_201_CREATED)

    @extend_schema(request=s.FermerSessionSerializer, responses=s.SessionCaisseSerializer)
    @action(detail=True, methods=["post"])
    def fermer(self, request, pk=None):
        ser = s.FermerSessionSerializer(data=request.data)
        ser.is_valid(raise_exception=True)
        session = services.fermer_session(
            self.get_object(), utilisateur=request.user, **ser.validated_data
        )
        return Response(s.SessionCaisseSerializer(session).data)

    @extend_schema(request=s.TransfertCoffreSerializer, responses=s.OperationCaisseSerializer)
    @action(detail=True, methods=["post"], url_path="transfert-coffre")
    def transfert_coffre(self, request, pk=None):
        ser = s.TransfertCoffreSerializer(data=request.data)
        ser.is_valid(raise_exception=True)
        operation = services.transferer_coffre(
            self.get_object(), utilisateur=request.user, **ser.validated_data
        )
        return Response(s.OperationCaisseSerializer(operation).data, status=status.HTTP_201_CREATED)

    @extend_schema(responses=s.OperationCaisseSerializer(many=True))
    @action(detail=True, methods=["get"])
    def operations(self, request, pk=None):
        operations = self.get_object().operations.select_related("ecriture", "membre", "cree_par")
        return Response(s.OperationCaisseSerializer(operations, many=True).data)


class OperationCaisseViewSet(FiltreAgenceMixin, mixins.ListModelMixin, viewsets.GenericViewSet):
    champ_agence = "session__caisse__agence"
    queryset = OperationCaisse.objects.select_related("ecriture", "membre", "cree_par")
    serializer_class = s.OperationCaisseSerializer
    filterset_fields = ["session", "devise", "sens", "type_operation", "membre"]
