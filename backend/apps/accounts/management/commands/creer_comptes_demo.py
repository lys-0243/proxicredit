from django.conf import settings
from django.contrib.auth.models import Group
from django.core.management.base import BaseCommand, CommandError
from django.db import transaction

from apps.accounts.models import Utilisateur
from apps.accounts.roles import LIBELLES_ROLES
from apps.core.models import Agence

MOT_DE_PASSE_DEMO = "Demo-ProxiCredit-2026"

# (identifiant, rôle, prénom, nom) : un compte par rôle, plus un second comptable pour tester le
# contrôle à quatre yeux (saisie par l'un, validation par l'autre).
COMPTES = [
    ("admin.demo", "ADMINISTRATEUR", "Arsène", "Admin"),
    ("directeur.demo", "DIRECTEUR", "Dieudonné", "Directeur"),
    ("chef.demo", "CHEF_AGENCE", "Joseph", "Chef"),
    ("accueil.demo", "AGENT_RECEPTION", "Aline", "Accueil"),
    ("credit.demo", "AGENT_CREDIT", "Christian", "Credit"),
    ("comite.demo", "MEMBRE_COMITE", "Clarisse", "Comite"),
    ("caissier.demo", "CAISSIER", "Patrick", "Caissier"),
    ("comptable.demo", "COMPTABLE", "Corneille", "Comptable"),
    ("comptable2.demo", "COMPTABLE", "Esther", "Comptable"),
    ("auditeur.demo", "AUDITEUR", "Augustin", "Auditeur"),
]


class Command(BaseCommand):
    help = "Crée (ou réinitialise) un compte de démonstration par rôle. Développement uniquement."

    def add_arguments(self, parser):
        parser.add_argument("--mot-de-passe", default=MOT_DE_PASSE_DEMO)
        parser.add_argument(
            "--desactiver", action="store_true", help="Désactive les comptes de démonstration."
        )

    @transaction.atomic
    def handle(self, *args, **options):
        if not settings.DEBUG:
            raise CommandError("Comptes de démonstration interdits hors développement.")

        if options["desactiver"]:
            n = Utilisateur.objects.filter(username__in=[c[0] for c in COMPTES]).update(
                is_active=False
            )
            self.stdout.write(self.style.SUCCESS(f"{n} compte(s) de démonstration désactivé(s)."))
            return

        agence = Agence.objects.filter(code="AG001").first()
        if agence is None:
            raise CommandError("Agence AG001 introuvable : lancez d'abord `manage.py initialiser`.")

        for identifiant, role, prenom, nom in COMPTES:
            user, _ = Utilisateur.objects.get_or_create(username=identifiant)
            user.first_name, user.last_name = prenom, nom
            user.agence = agence
            user.is_active = True
            user.doit_changer_mdp = False
            user.set_password(options["mot_de_passe"])
            user.save()
            user.groups.set(Group.objects.filter(name=role))
            obligatoire = " (2FA à configurer)" if role in settings.ROLES_2FA_OBLIGATOIRE else ""
            self.stdout.write(f"  {identifiant:<17} {LIBELLES_ROLES[role]}{obligatoire}")

        self.stdout.write(
            self.style.SUCCESS(f"Mot de passe de tous les comptes : {options['mot_de_passe']}")
        )
