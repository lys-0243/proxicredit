from django.contrib import admin
from django.urls import include, path
from drf_spectacular.views import SpectacularAPIView, SpectacularSwaggerView

urlpatterns = [
    path("admin/", admin.site.urls),
    path("api/auth/", include("apps.accounts.urls_auth")),
    path("api/", include("apps.accounts.urls")),
    path("api/", include("apps.core.urls")),
    path("api/comptabilite/", include("apps.accounting.urls")),
    path("api/", include("apps.members.urls")),
    path("api/caisse/", include("apps.cash.urls")),
    path("api/epargne/", include("apps.savings.urls")),
    path("api/credits/", include("apps.credits.urls")),
    path("api/schema", SpectacularAPIView.as_view(), name="schema"),
    path("api/docs", SpectacularSwaggerView.as_view(url_name="schema"), name="docs"),
]
