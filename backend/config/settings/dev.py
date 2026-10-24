from .base import *  # noqa: F403

DEBUG = True
AUTH_COOKIE_SECURE = False
CELERY_TASK_ALWAYS_EAGER = env.bool("CELERY_TASK_ALWAYS_EAGER", default=True)  # noqa: F405
