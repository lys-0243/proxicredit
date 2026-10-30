from rest_framework.routers import DefaultRouter

from apps.savings import views

router = DefaultRouter(trailing_slash=False)
router.register("produits", views.ProduitEpargneViewSet)
router.register("comptes", views.CompteEpargneViewSet)

urlpatterns = router.urls
