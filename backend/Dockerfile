FROM python:3.14-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    DJANGO_SETTINGS_MODULE=config.settings.prod

WORKDIR /app
COPY requirements/ requirements/
RUN pip install --no-cache-dir -r requirements/base.txt

COPY . .
RUN DJANGO_SECRET_KEY=build DATABASE_URL=sqlite:///tmp/build.db python manage.py collectstatic --noinput

RUN useradd --create-home proxicredit && chown -R proxicredit /app
USER proxicredit

EXPOSE 8000
CMD ["gunicorn", "config.wsgi:application", "--bind", "0.0.0.0:8000", "--workers", "3", "--timeout", "60"]
