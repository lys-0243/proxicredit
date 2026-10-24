from django.core.management.base import BaseCommand
from django.db import transaction

from apps.accounting.initialisation import charger_plan_comptable
from apps.accounts.roles import synchroniser_roles
from apps.core.initialisation import charger_referentiel


class Command(BaseCommand):
    help = "Charge le référentiel de départ (devises, agence, plan comptable, rôles). Idempotent."

    @transaction.atomic
    def handle(self, *args, **options):
        charger_referentiel()
        self.stdout.write("Devises et agence principale : OK")
        crees = charger_plan_comptable()
        self.stdout.write(f"Plan comptable SYSCOHADA et journaux : OK ({crees} compte(s) créé(s))")
        synchroniser_roles()
        self.stdout.write("Rôles et permissions : OK")
        self.stdout.write(self.style.SUCCESS("Initialisation terminée."))
