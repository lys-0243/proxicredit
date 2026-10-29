from rest_framework.routers import DefaultRouter

from apps.cash import views

router = DefaultRouter(trailing_slash=False)
router.register("caisses", views.CaisseViewSet)
router.register("sessions", views.SessionCaisseViewSet)
router.register("operations", views.OperationCaisseViewSet)

urlpatterns = router.urls
