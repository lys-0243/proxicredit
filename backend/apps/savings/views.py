from drf_spectacular.utils import extend_schema
from rest_framework import exceptions, mixins, status, viewsets
from rest_framework.decorators import action
from rest_framework.response import Response

from apps.core.scoping import FiltreAgenceMixin, voit_toutes_agences
from apps.core.views import SansSuppressionViewSet
from apps.savings import serializers as s
from apps.savings import services
from apps.savings.models import CompteEpargne, ProduitEpargne


class ProduitEpargneViewSet(SansSuppressionViewSet):
    queryset = ProduitEpargne.objects.select_related("compte")
    serializer_class = s.ProduitEpargneSerializer
    pagination_class = None
    filterset_fields = ["type", "devise", "actif"]


class CompteEpargneViewSet(
    FiltreAgenceMixin,
    mixins.ListModelMixin,
    mixins.RetrieveModelMixin,
    viewsets.GenericViewSet,
):
    """Comptes d'épargne des membres. Ils ne se suppriment pas : on les bloque ou on les clôt."""

    queryset = CompteEpargne.objects.select_related(
        "membre", "produit", "agence", "devise", "ouvert_par"
    )
    filterset_fields = ["membre", "produit", "statut", "devise"]
    search_fields = ["numero", "membre__numero", "membre__nom_complet"]
    ordering_fields = ["cree_le", "numero", "solde"]
    permissions_action = {
        "create": ["savings.add_compteepargne"],
        "mouvements": ["savings.view_compteepargne"],
        "depot": ["savings.deposer_epargne", "savings.add_compteepargne"],
        "depots_initiaux": ["savings.view_compteepargne"],
        "deposer": ["savings.deposer_epargne"],
        "retirer": ["savings.retirer_epargne"],
        "blocage": ["savings.bloquer_compte_epargne"],
    }

    def get_serializer_class(self):
        return s.OuvertureCompteSerializer if self.action == "create" else s.CompteEpargneSerializer

    def _verifier_agence(self, membre):
        user = self.request.user
        if not voit_toutes_agences(user) and membre.agence_id != user.agence_id:
            raise exceptions.PermissionDenied("Ce membre appartient à une autre agence.")

    @extend_schema(request=s.OuvertureCompteSerializer, responses=s.CompteEpargneSerializer)
    def create(self, request):
        ser = s.OuvertureCompteSerializer(data=request.data)
        ser.is_valid(raise_exception=True)
        self._verifier_agence(ser.validated_data["membre"])
        compte = services.ouvrir_compte(
            ser.validated_data["membre"], ser.validated_data["devise"], request.user
        )
        return Response(s.CompteEpargneSerializer(compte).data, status=status.HTTP_201_CREATED)

    @extend_schema(request=s.DepotMembreSerializer, responses=s.MouvementEpargneSerializer)
    @action(detail=False, methods=["post"])
    def depot(self, request):
        """Dépôt au guichet pour un membre ; le premier dépôt dans une devise ouvre le compte."""
        ser = s.DepotMembreSerializer(data=request.data)
        ser.is_valid(raise_exception=True)
        donnees = dict(ser.validated_data)
        membre = donnees.pop("membre")
        self._verifier_agence(membre)
        mouvement = services.deposer_pour_membre(membre, utilisateur=request.user, **donnees)
        return Response(
            s.MouvementEpargneSerializer(mouvement).data, status=status.HTTP_201_CREATED
        )

    @extend_schema(responses=s.DepotsInitiauxSerializer(many=True))
    @action(detail=False, methods=["get"], url_path="depots-initiaux")
    def depots_initiaux(self, request):
        """Premier dépôt minimum par devise, exigé pour activer un membre."""
        minimums = services.depots_initiaux()
        return Response(
            s.DepotsInitiauxSerializer(
                [{"devise": code, "montant": montant} for code, montant in minimums.items()],
                many=True,
            ).data
        )

    @extend_schema(responses=s.MouvementEpargneSerializer(many=True))
    @action(detail=True, methods=["get"])
    def mouvements(self, request, pk=None):
        mouvements = self.get_object().mouvements.select_related("ecriture", "cree_par")
        page = self.paginate_queryset(mouvements)
        return self.get_paginated_response(s.MouvementEpargneSerializer(page, many=True).data)

    def _operation(self, request, service):
        ser = s.OperationGuichetSerializer(data=request.data)
        ser.is_valid(raise_exception=True)
        mouvement = service(self.get_object(), utilisateur=request.user, **ser.validated_data)
        return Response(
            s.MouvementEpargneSerializer(mouvement).data, status=status.HTTP_201_CREATED
        )

    @extend_schema(request=s.OperationGuichetSerializer, responses=s.MouvementEpargneSerializer)
    @action(detail=True, methods=["post"])
    def deposer(self, request, pk=None):
        return self._operation(request, services.deposer)

    @extend_schema(request=s.OperationGuichetSerializer, responses=s.MouvementEpargneSerializer)
    @action(detail=True, methods=["post"])
    def retirer(self, request, pk=None):
        return self._operation(request, services.retirer)

    @extend_schema(request=s.BlocageSerializer, responses=s.CompteEpargneSerializer)
    @action(detail=True, methods=["post"])
    def blocage(self, request, pk=None):
        ser = s.BlocageSerializer(data=request.data)
        ser.is_valid(raise_exception=True)
        compte = services.changer_blocage(
            self.get_object(), ser.validated_data["bloquer"], ser.validated_data["motif"]
        )
        return Response(s.CompteEpargneSerializer(compte).data)
