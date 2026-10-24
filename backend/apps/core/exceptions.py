from django.core.exceptions import ValidationError as DjangoValidationError
from rest_framework import serializers
from rest_framework.views import exception_handler


class ErreurMetier(Exception):
    """Règle de gestion violée. Renvoyée au client en HTTP 400 avec un message lisible."""

    def __init__(self, message: str, code: str = "erreur_metier"):
        super().__init__(message)
        self.message = message
        self.code = code


def gestionnaire_exceptions(exc, context):
    if isinstance(exc, ErreurMetier):
        exc = serializers.ValidationError({"detail": exc.message, "code": exc.code})
    elif isinstance(exc, DjangoValidationError):
        exc = serializers.ValidationError(
            exc.message_dict if hasattr(exc, "error_dict") else {"detail": exc.messages}
        )
    return exception_handler(exc, context)
