from django.urls import path
from rest_framework.routers import DefaultRouter

from apps.accounting import views

router = DefaultRouter(trailing_slash=False)
router.register("comptes", views.CompteComptableViewSet)
router.register("journaux", views.JournalViewSet)
router.register("ecritures", views.EcritureViewSet)
router.register("regles", views.RegleComptableViewSet)

urlpatterns = [
    path("balance", views.BalanceView.as_view()),
    path("grand-livre", views.GrandLivreView.as_view()),
    *router.urls,
]
