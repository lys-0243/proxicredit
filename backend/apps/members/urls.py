from rest_framework.routers import DefaultRouter

from apps.members import views

router = DefaultRouter(trailing_slash=False)
router.register("membres", views.MembreViewSet)

urlpatterns = router.urls
