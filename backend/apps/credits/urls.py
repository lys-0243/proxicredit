from rest_framework.routers import DefaultRouter

from apps.credits import views

router = DefaultRouter(trailing_slash=False)
router.register("produits", views.ProduitCreditViewSet)
router.register("dossiers", views.CreditViewSet)

urlpatterns = router.urls
