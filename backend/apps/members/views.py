from django.db.models import Q
from django.http import FileResponse
from django.shortcuts import get_object_or_404
from drf_spectacular.types import OpenApiTypes
from drf_spectacular.utils import OpenApiParameter, extend_schema
from rest_framework import mixins, status, viewsets
from rest_framework.decorators import action
from rest_framework.parsers import FormParser, JSONParser, MultiPartParser
from rest_framework.response import Response

from apps.core.scoping import FiltreAgenceMixin
from apps.members import serializers as s
from apps.members import services
from apps.members.models import Beneficiaire, Membre, MembreGroupe

LECTURE = ["members.view_membre"]
MODIFICATION = ["members.change_membre"]
LECTURE_DOCUMENTS = ["members.view_documentmembre"]


class MembreViewSet(
    FiltreAgenceMixin,
    mixins.ListModelMixin,
    mixins.RetrieveModelMixin,
    mixins.CreateModelMixin,
    mixins.UpdateModelMixin,
    viewsets.GenericViewSet,
):
    """Dossiers des membres. On ne supprime jamais un membre : on clôture son dossier."""

    queryset = Membre.objects.select_related("agence", "cree_par", "active_par")
    filterset_fields = ["type", "statut", "en_liste_noire"]
    search_fields = ["numero", "nom_complet", "telephone", "numero_piece", "rccm"]
    ordering_fields = ["cree_le", "nom_complet", "numero"]
    parser_classes = [JSONParser, MultiPartParser, FormParser]
    permissions_action = {
        "controle_activation": LECTURE,
        "activer": ["members.activer_membre"],
        "changer_statut": ["members.changer_statut_membre"],
        "liste_noire": ["members.gerer_liste_noire"],
        "documents": LECTURE_DOCUMENTS,
        "ajouter_document": ["members.add_documentmembre"],
        "fichier_document": LECTURE_DOCUMENTS,
        "beneficiaires": LECTURE,
        "ajouter_beneficiaire": MODIFICATION,
        "supprimer_beneficiaire": MODIFICATION,
        "composition": LECTURE,
        "ajouter_au_groupe": MODIFICATION,
        "retirer_du_groupe": MODIFICATION,
        "historique": LECTURE,
        "doublons": LECTURE,
    }

    def get_serializer_class(self):
        return s.MembreListeSerializer if self.action == "list" else s.MembreSerializer

    # --- Dossier et statuts -------------------------------------------------------------

    @extend_schema(responses=s.ControleActivationSerializer)
    @action(detail=True, methods=["get"], url_path="controle-activation")
    def controle_activation(self, request, pk=None):
        manquants = services.elements_manquants(self.get_object())
        return Response({"pret": not manquants, "manquants": manquants})

    @extend_schema(request=None, responses=s.MembreSerializer)
    @action(detail=True, methods=["post"])
    def activer(self, request, pk=None):
        membre = services.activer(self.get_object(), request.user)
        return Response(s.MembreSerializer(membre).data)

    @extend_schema(request=s.ChangerStatutSerializer, responses=s.MembreSerializer)
    @action(detail=True, methods=["post"], url_path="statut")
    def changer_statut(self, request, pk=None):
        ser = s.ChangerStatutSerializer(data=request.data)
        ser.is_valid(raise_exception=True)
        membre = services.changer_statut(
            self.get_object(),
            ser.validated_data["action"],
            ser.validated_data["motif"],
            request.user,
        )
        return Response(s.MembreSerializer(membre).data)

    @extend_schema(request=s.ListeNoireSerializer, responses=s.MembreSerializer)
    @action(detail=True, methods=["post"], url_path="liste-noire")
    def liste_noire(self, request, pk=None):
        ser = s.ListeNoireSerializer(data=request.data)
        ser.is_valid(raise_exception=True)
        membre = services.liste_noire(
            self.get_object(),
            ser.validated_data["inscrire"],
            ser.validated_data["motif"],
            request.user,
        )
        return Response(s.MembreSerializer(membre).data)

    @extend_schema(responses=s.HistoriqueStatutSerializer(many=True))
    @action(detail=True, methods=["get"])
    def historique(self, request, pk=None):
        historique = self.get_object().historique_statuts.select_related("par")
        return Response(s.HistoriqueStatutSerializer(historique, many=True).data)

    @extend_schema(
        parameters=[
            OpenApiParameter("nom", str),
            OpenApiParameter("telephone", str),
            OpenApiParameter("numero_piece", str),
        ],
        responses=s.MembreListeSerializer(many=True),
    )
    @action(detail=False, methods=["get"])
    def doublons(self, request):
        """Membres existants (toutes agences) qui ressemblent à celui qu'on va créer."""
        p = request.query_params
        critere = Q()
        if len(p.get("nom", "").strip()) >= 3:
            critere |= Q(nom_complet__icontains=p["nom"].strip())
        if len(p.get("telephone", "").strip()) >= 6:
            critere |= Q(telephone__icontains=p["telephone"].strip()[-9:])
        if p.get("numero_piece", "").strip():
            critere |= Q(numero_piece=p["numero_piece"].strip())
        if not critere:
            return Response([])
        resultats = Membre.objects.filter(critere).select_related("agence")[:10]
        return Response(s.MembreListeSerializer(resultats, many=True).data)

    # --- Documents KYC ----------------------------------------------------------------------

    @extend_schema(responses=s.DocumentMembreSerializer(many=True))
    @action(detail=True, methods=["get"])
    def documents(self, request, pk=None):
        documents = self.get_object().documents.select_related("ajoute_par")
        return Response(s.DocumentMembreSerializer(documents, many=True).data)

    @extend_schema(
        request={"multipart/form-data": s.AjoutDocumentSerializer},
        responses=s.DocumentMembreSerializer,
    )
    @documents.mapping.post
    def ajouter_document(self, request, pk=None):
        ser = s.AjoutDocumentSerializer(data=request.data)
        ser.is_valid(raise_exception=True)
        document = services.ajouter_document(
            self.get_object(),
            ser.validated_data["type"],
            ser.validated_data["fichier"],
            request.user,
            ser.validated_data["description"],
        )
        return Response(s.DocumentMembreSerializer(document).data, status=status.HTTP_201_CREATED)

    @extend_schema(responses={(200, "application/octet-stream"): OpenApiTypes.BINARY})
    @action(detail=True, methods=["get"], url_path=r"documents/(?P<document_id>\d+)/fichier")
    def fichier_document(self, request, pk=None, document_id=None):
        document = get_object_or_404(self.get_object().documents, pk=document_id)
        reponse = FileResponse(document.fichier.open("rb"), content_type=document.type_contenu)
        reponse["Content-Disposition"] = f'inline; filename="{document.get_type_display()}"'
        reponse["Cache-Control"] = "private, no-store"
        reponse["X-Content-Type-Options"] = "nosniff"
        return reponse

    # --- Bénéficiaires --------------------------------------------------------------------

    @extend_schema(responses=s.BeneficiaireSerializer(many=True))
    @action(detail=True, methods=["get"])
    def beneficiaires(self, request, pk=None):
        return Response(s.BeneficiaireSerializer(self.get_object().beneficiaires, many=True).data)

    @extend_schema(request=s.BeneficiaireSerializer, responses=s.BeneficiaireSerializer)
    @beneficiaires.mapping.post
    def ajouter_beneficiaire(self, request, pk=None):
        membre = self.get_object()
        services.verifier_modifiable(membre)
        ser = s.BeneficiaireSerializer(data=request.data)
        ser.is_valid(raise_exception=True)
        total = sum(b.pourcentage for b in membre.beneficiaires.all())
        if total + ser.validated_data["pourcentage"] > 100:
            return Response(
                {"pourcentage": [f"Le total dépasserait 100 % (déjà attribué : {total} %)."]},
                status=status.HTTP_400_BAD_REQUEST,
            )
        ser.save(membre=membre)
        return Response(ser.data, status=status.HTTP_201_CREATED)

    @extend_schema(request=None, responses={204: None})
    @action(detail=True, methods=["delete"], url_path=r"beneficiaires/(?P<beneficiaire_id>\d+)")
    def supprimer_beneficiaire(self, request, pk=None, beneficiaire_id=None):
        membre = self.get_object()
        services.verifier_modifiable(membre)
        get_object_or_404(Beneficiaire, pk=beneficiaire_id, membre=membre).delete()
        return Response(status=status.HTTP_204_NO_CONTENT)

    # --- Groupes solidaires -----------------------------------------------------------------

    @extend_schema(responses=s.MembreGroupeSerializer(many=True))
    @action(detail=True, methods=["get"])
    def composition(self, request, pk=None):
        liens = self.get_object().composition.select_related("membre")
        return Response(s.MembreGroupeSerializer(liens, many=True).data)

    @extend_schema(request=s.AjoutGroupeSerializer, responses=s.MembreGroupeSerializer)
    @composition.mapping.post
    def ajouter_au_groupe(self, request, pk=None):
        ser = s.AjoutGroupeSerializer(data=request.data)
        ser.is_valid(raise_exception=True)
        lien = services.ajouter_au_groupe(
            self.get_object(),
            ser.validated_data["membre"],
            ser.validated_data["fonction"],
            request.user,
        )
        return Response(s.MembreGroupeSerializer(lien).data, status=status.HTTP_201_CREATED)

    @extend_schema(request=None, responses=s.MembreGroupeSerializer)
    @action(detail=True, methods=["post"], url_path=r"composition/(?P<lien_id>\d+)/retirer")
    def retirer_du_groupe(self, request, pk=None, lien_id=None):
        lien = get_object_or_404(MembreGroupe, pk=lien_id, groupe=self.get_object())
        return Response(s.MembreGroupeSerializer(services.retirer_du_groupe(lien)).data)
