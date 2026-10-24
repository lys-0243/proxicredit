from rest_framework.routers import DefaultRouter

from apps.accounts import views

router = DefaultRouter(trailing_slash=False)
router.register("utilisateurs", views.UtilisateurViewSet)
router.register("roles", views.RoleViewSet)
router.register("journal-connexions", views.JournalConnexionViewSet)

urlpatterns = router.urls
