from rest_framework.routers import DefaultRouter

from apps.core import views

router = DefaultRouter(trailing_slash=False)
router.register("devises", views.DeviseViewSet)
router.register("agences", views.AgenceViewSet)
router.register("taux-change", views.TauxChangeViewSet)
router.register("jours-feries", views.JourFerieViewSet)
router.register("parametres", views.ParametreViewSet)
router.register("journees", views.JourneeComptableViewSet)

urlpatterns = router.urls
