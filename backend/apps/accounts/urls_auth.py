from django.urls import path

from apps.accounts import views

urlpatterns = [
    path("csrf", views.CsrfView.as_view()),
    path("connexion", views.ConnexionView.as_view()),
    path("rafraichir", views.RafraichirView.as_view()),
    path("deconnexion", views.DeconnexionView.as_view()),
    path("moi", views.MoiView.as_view()),
    path("moi/photo", views.PhotoProfilView.as_view()),
    path("mot-de-passe", views.ChangerMotDePasseView.as_view()),
    path("2fa/configurer", views.Configurer2FAView.as_view()),
    path("2fa/activer", views.Activer2FAView.as_view()),
    path("2fa/desactiver", views.Desactiver2FAView.as_view()),
]
