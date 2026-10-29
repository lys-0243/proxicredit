from drf_spectacular.utils import extend_schema
from rest_framework import exceptions, mixins, status, viewsets
from rest_framework.decorators import action
from rest_framework.response import Response

from apps.core.scoping import FiltreAgenceMixin, voit_toutes_agences
from apps.core.views import SansSuppressionViewSet
from apps.credits import serializers as s
from apps.credits import services
from apps.credits.models import Credit, ProduitCredit

LECTURE = ["credits.view_credit"]


class ProduitCreditViewSet(SansSuppressionViewSet):
    queryset = ProduitCredit.objects.prefetch_related("plafonds")
    serializer_class = s.ProduitCreditSerializer
    pagination_class = None
    filterset_fields = ["actif"]
    permissions_action = {"simuler": ["credits.view_produitcredit"]}

    @extend_schema(request=s.SimulationDemandeSerializer, responses=s.SimulationSerializer)
    @action(detail=False, methods=["post"])
    def simuler(self, request):
        """Échéancier indicatif, sans rien enregistrer (accueil, agent de crédit)."""
        ser = s.SimulationDemandeSerializer(data=request.data)
        ser.is_valid(raise_exception=True)
        d = ser.validated_data
        simulation = services.simuler(
            d["produit"], d["devise"], d["montant"], d["duree"], d.get("date_depart")
        )
        return Response(s.SimulationSerializer(simulation).data)


class CreditViewSet(
    FiltreAgenceMixin,
    mixins.ListModelMixin,
    mixins.RetrieveModelMixin,
    mixins.CreateModelMixin,
    mixins.UpdateModelMixin,
    viewsets.GenericViewSet,
):
    """Dossiers de crédit. Un dossier ne se supprime pas : il est annulé ou rejeté."""

    queryset = Credit.objects.select_related(
        "membre",
        "produit",
        "devise",
        "agence",
        "cree_par",
        "soumis_par",
        "analyse_par",
        "decide_par",
        "decaisse_par",
        "ecriture_decaissement",
    )
    filterset_fields = ["statut", "membre", "produit", "devise"]
    search_fields = ["numero", "membre__numero", "membre__nom_complet"]
    ordering_fields = ["cree_le", "numero", "date_decaissement"]
    permissions_action = {
        "controle": LECTURE,
        "echeancier": LECTURE,
        "remboursements": LECTURE,
        "historique": LECTURE,
        "soumettre": ["credits.add_credit"],
        "analyser": ["credits.analyser_credit"],
        "renvoyer": ["credits.analyser_credit"],
        "statuer": ["credits.approuver_credit"],
        "annuler": LECTURE,  # contrôle détaillé dans l'action
        "decaisser": ["credits.decaisser_credit"],
        "rembourser": ["credits.rembourser_credit"],
    }

    def get_serializer_class(self):
        return s.CreditListeSerializer if self.action == "list" else s.CreditSerializer

    def perform_create(self, serializer):
        membre = serializer.validated_data["membre"]
        user = self.request.user
        if not voit_toutes_agences(user) and membre.agence_id != user.agence_id:
            raise exceptions.PermissionDenied("Ce membre appartient à une autre agence.")
        serializer.save()

    def _reponse(self, credit, code=status.HTTP_200_OK):
        return Response(s.CreditSerializer(credit).data, status=code)

    # --- Consultation ---------------------------------------------------------------------

    @extend_schema(responses=s.ControleCreditSerializer)
    @action(detail=True, methods=["get"])
    def controle(self, request, pk=None):
        """Éligibilité du membre et capacité de remboursement (aide à l'analyse et au comité)."""
        credit = self.get_object()
        return Response(
            s.ControleCreditSerializer(
                {
                    "bloquants": services.elements_bloquants(credit),
                    "capacite": services.capacite_remboursement(credit),
                }
            ).data
        )

    @extend_schema(responses=s.EcheanceSerializer(many=True))
    @action(detail=True, methods=["get"])
    def echeancier(self, request, pk=None):
        return Response(s.EcheanceSerializer(self.get_object().echeances.all(), many=True).data)

    @extend_schema(responses=s.RemboursementSerializer(many=True))
    @action(detail=True, methods=["get"])
    def remboursements(self, request, pk=None):
        remboursements = self.get_object().remboursements.select_related("ecriture", "cree_par")
        return Response(s.RemboursementSerializer(remboursements, many=True).data)

    @extend_schema(responses=s.HistoriqueCreditSerializer(many=True))
    @action(detail=True, methods=["get"])
    def historique(self, request, pk=None):
        historique = self.get_object().historique.select_related("par")
        return Response(s.HistoriqueCreditSerializer(historique, many=True).data)

    # --- Circuit ----------------------------------------------------------------------------

    @extend_schema(request=None, responses=s.CreditSerializer)
    @action(detail=True, methods=["post"])
    def soumettre(self, request, pk=None):
        return self._reponse(services.soumettre(self.get_object(), request.user))

    @extend_schema(request=s.AnalyseSerializer, responses=s.CreditSerializer)
    @action(detail=True, methods=["post"])
    def analyser(self, request, pk=None):
        ser = s.AnalyseSerializer(data=request.data)
        ser.is_valid(raise_exception=True)
        return self._reponse(
            services.analyser(self.get_object(), request.user, **ser.validated_data)
        )

    @extend_schema(request=s.MotifSerializer, responses=s.CreditSerializer)
    @action(detail=True, methods=["post"])
    def renvoyer(self, request, pk=None):
        ser = s.MotifSerializer(data=request.data)
        ser.is_valid(raise_exception=True)
        return self._reponse(
            services.renvoyer(self.get_object(), request.user, ser.validated_data["motif"])
        )

    @extend_schema(request=s.DecisionSerializer, responses=s.CreditSerializer)
    @action(detail=True, methods=["post"])
    def statuer(self, request, pk=None):
        ser = s.DecisionSerializer(data=request.data)
        ser.is_valid(raise_exception=True)
        return self._reponse(
            services.statuer(self.get_object(), request.user, **ser.validated_data)
        )

    @extend_schema(request=s.MotifSerializer, responses=s.CreditSerializer)
    @action(detail=True, methods=["post"])
    def annuler(self, request, pk=None):
        ser = s.MotifSerializer(data=request.data)
        ser.is_valid(raise_exception=True)
        credit = self.get_object()
        # La saisie annule un dossier en cours d'instruction ; après l'analyse, seul le comité.
        comite = request.user.has_perm("credits.approuver_credit")
        if not (comite or request.user.has_perm("credits.change_credit")):
            raise exceptions.PermissionDenied()
        if credit.statut in (Credit.Statut.ANALYSE, Credit.Statut.APPROUVE) and not comite:
            raise exceptions.PermissionDenied(
                "Un dossier analysé ou approuvé ne peut être annulé que par le comité."
            )
        return self._reponse(services.annuler(credit, request.user, ser.validated_data["motif"]))

    @extend_schema(request=s.VersementSerializer, responses=s.CreditSerializer)
    @action(detail=True, methods=["post"])
    def decaisser(self, request, pk=None):
        ser = s.VersementSerializer(data=request.data)
        ser.is_valid(raise_exception=True)
        return self._reponse(
            services.decaisser(self.get_object(), request.user, **ser.validated_data)
        )

    @extend_schema(request=s.RemboursementDemandeSerializer, responses=s.RemboursementSerializer)
    @action(detail=True, methods=["post"])
    def rembourser(self, request, pk=None):
        ser = s.RemboursementDemandeSerializer(data=request.data)
        ser.is_valid(raise_exception=True)
        remboursement = services.rembourser(self.get_object(), request.user, **ser.validated_data)
        return Response(
            s.RemboursementSerializer(remboursement).data, status=status.HTTP_201_CREATED
        )
