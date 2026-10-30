from django.core.management.base import BaseCommand
from django.db import transaction

from apps.accounting.initialisation import charger_plan_comptable
from apps.accounts.roles import synchroniser_roles
from apps.cash.initialisation import charger_parametrage_caisse
from apps.core.initialisation import charger_referentiel
from apps.credits.initialisation import charger_parametrage_credit
from apps.members.initialisation import charger_parametrage_membres
from apps.savings.initialisation import charger_parametrage_epargne


class Command(BaseCommand):
    help = "Charge le référentiel de départ (devises, agence, plan comptable, modules, rôles)."

    @transaction.atomic
    def handle(self, *args, **options):
        charger_referentiel()
        self.stdout.write("Devises et agence principale : OK")
        crees = charger_plan_comptable()
        self.stdout.write(f"Plan comptable SYSCOHADA et journaux : OK ({crees} compte(s) créé(s))")
        charger_parametrage_membres()
        self.stdout.write("Membres : paramètres d'adhésion et règles comptables : OK")
        charger_parametrage_caisse()
        self.stdout.write("Caisse : coffre et guichet par agence, règles comptables : OK")
        charger_parametrage_epargne()
        self.stdout.write("Épargne : produits de départ et règles comptables : OK")
        charger_parametrage_credit()
        self.stdout.write("Crédit : produits Éducation et Secours, règles comptables : OK")
        synchroniser_roles()
        self.stdout.write("Rôles et permissions : OK")
        self.stdout.write(self.style.SUCCESS("Initialisation terminée."))
