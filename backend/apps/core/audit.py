"""Piste d'audit : chaque enregistrement historique (django-simple-history) porte l'adresse IP
de la requête qui l'a produit, en plus de l'utilisateur."""

from contextvars import ContextVar

from django.db import models
from django.dispatch import receiver
from simple_history.signals import pre_create_historical_record

_requete_courante: ContextVar = ContextVar("requete_courante", default=None)


def adresse_ip(request) -> str | None:
    if request is None:
        return None
    transmis = request.META.get("HTTP_X_FORWARDED_FOR")
    if transmis:
        return transmis.split(",")[0].strip()
    return request.META.get("REMOTE_ADDR")


class RequeteCouranteMiddleware:
    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        jeton = _requete_courante.set(request)
        try:
            return self.get_response(request)
        finally:
            _requete_courante.reset(jeton)


class ModeleHistoriqueAudit(models.Model):
    adresse_ip = models.GenericIPAddressField(null=True, blank=True)

    class Meta:
        abstract = True


@receiver(pre_create_historical_record)
def _ajouter_ip(sender, **kwargs):
    historique = kwargs["history_instance"]
    if hasattr(historique, "adresse_ip"):
        historique.adresse_ip = adresse_ip(_requete_courante.get())
