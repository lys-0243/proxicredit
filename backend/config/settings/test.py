from .base import *  # noqa: F403

DEBUG = False
AUTH_COOKIE_SECURE = False
PASSWORD_HASHERS = ["django.contrib.auth.hashers.MD5PasswordHasher"]
CELERY_TASK_ALWAYS_EAGER = True
AXES_ENABLED = True
