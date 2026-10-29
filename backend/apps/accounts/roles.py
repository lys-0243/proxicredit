"""Définition des rôles (groupes Django) et de leurs permissions.

Chaque rôle liste des permissions « app_label.codename ». Le joker `*` est accepté dans l'app ou le
codename (ex. « core.view_* », « *.view_* »). Les modules ajoutés dans les phases suivantes
complètent simplement ces listes.

Synchronisation : `python manage.py initialiser` (idempotent).
"""

from fnmatch import fnmatch

from django.contrib.auth.models import Group, Permission

LECTURE_PARAMETRAGE = [
    "core.view_agence",
    "core.view_devise",
    "core.view_tauxchange",
    "core.view_jourferie",
    "core.view_journeecomptable",
]

# Accueil et suivi des dossiers : créer un prospect, compléter le KYC, ajouter des documents.
GESTION_DOSSIERS_MEMBRES = [
    "members.view_membre",
    "members.add_membre",
    "members.change_membre",
    "members.view_documentmembre",
    "members.add_documentmembre",
]

# Saisie et suivi des demandes de crédit (simulation, saisie, soumission), ouverture de comptes.
SAISIE_CREDITS = [
    "credits.view_produitcredit",
    "credits.view_credit",
    "credits.add_credit",
    "credits.change_credit",
    "savings.view_produitepargne",
    "savings.view_compteepargne",
    "savings.add_compteepargne",
]

# Opérations au guichet : session de caisse, épargne (dont le premier dépôt, qui ouvre le compte),
# décaissements et remboursements.
GUICHET = [
    "cash.view_caisse",
    "cash.view_sessioncaisse",
    "cash.view_operationcaisse",
    "cash.ouvrir_session_caisse",
    "savings.view_produitepargne",
    "savings.view_compteepargne",
    "savings.add_compteepargne",
    "savings.deposer_epargne",
    "savings.retirer_epargne",
    "credits.view_produitcredit",
    "credits.view_credit",
    "credits.decaisser_credit",
    "credits.rembourser_credit",
]

ROLES: dict[str, dict] = {
    "ADMINISTRATEUR": {
        "libelle": "Administrateur",
        "permissions": ["*.*"],
    },
    "DIRECTEUR": {
        "libelle": "Directeur",
        "permissions": [
            "*.view_*",
            "core.voir_toutes_agences",
            "core.ouvrir_journee",
            "core.fermer_journee",
            "core.add_tauxchange",
            "core.change_tauxchange",
            "core.*_parametre",
            "core.*_jourferie",
            "accounting.valider_ecriture",
            "accounting.contre_passer_ecriture",
            "accounting.voir_etats",
            "members.activer_membre",
            "members.changer_statut_membre",
            "members.gerer_liste_noire",
            "cash.add_caisse",
            "cash.change_caisse",
            "savings.*_produitepargne",
            "savings.bloquer_compte_epargne",
            "credits.*_produitcredit",
            "credits.approuver_credit",
        ],
    },
    "CHEF_AGENCE": {
        "libelle": "Chef d'agence",
        "permissions": [
            *LECTURE_PARAMETRAGE,
            "core.ouvrir_journee",
            "core.fermer_journee",
            "core.add_tauxchange",
            "accounts.view_utilisateur",
            "accounting.view_*",
            "accounting.valider_ecriture",
            "accounting.voir_etats",
            *GESTION_DOSSIERS_MEMBRES,
            "members.activer_membre",
            "members.changer_statut_membre",
            "members.gerer_liste_noire",
            "cash.view_caisse",
            "cash.view_sessioncaisse",
            "cash.view_operationcaisse",
            "cash.gerer_coffre",
            *SAISIE_CREDITS,
            "savings.bloquer_compte_epargne",
            # Préside le comité de crédit de l'agence.
            "credits.approuver_credit",
        ],
    },
    "AGENT_RECEPTION": {
        # Accueil : création des dossiers membres (prospects), ouverture de comptes d'épargne,
        # simulations et saisie des demandes de crédit. Aucun accès caisse, aucune activation,
        # analyse ni approbation.
        "libelle": "Agent de réception",
        "permissions": [*LECTURE_PARAMETRAGE, *GESTION_DOSSIERS_MEMBRES, *SAISIE_CREDITS],
    },
    "AGENT_CREDIT": {
        # Saisit lui aussi des demandes, et les analyse (avis, capacité de remboursement).
        "libelle": "Agent de crédit",
        "permissions": [
            *LECTURE_PARAMETRAGE,
            *GESTION_DOSSIERS_MEMBRES,
            *SAISIE_CREDITS,
            "credits.analyser_credit",
        ],
    },
    "MEMBRE_COMITE": {
        "libelle": "Membre du comité",
        "permissions": [
            *LECTURE_PARAMETRAGE,
            "members.view_membre",
            "members.view_documentmembre",
            "savings.view_compteepargne",
            "credits.view_produitcredit",
            "credits.view_credit",
            "credits.approuver_credit",
        ],
    },
    "CAISSIER": {
        "libelle": "Caissier",
        # Consulte photo et signature pour vérifier l'identité au guichet.
        "permissions": [
            *LECTURE_PARAMETRAGE,
            "members.view_membre",
            "members.view_documentmembre",
            *GUICHET,
        ],
    },
    "COMPTABLE": {
        "libelle": "Comptable",
        "permissions": [
            *LECTURE_PARAMETRAGE,
            "core.add_tauxchange",
            "accounting.*_comptecomptable",
            "accounting.*_journal",
            "accounting.*_reglecomptable",
            "accounting.*_reglecomptableligne",
            "accounting.view_ecriture",
            "accounting.add_ecriture",
            "accounting.change_ecriture",
            "accounting.delete_ecriture",
            "accounting.valider_ecriture",
            "accounting.contre_passer_ecriture",
            "accounting.voir_etats",
            "members.view_membre",
            "cash.view_*",
            "savings.view_*",
            "credits.view_*",
        ],
    },
    "AUDITEUR": {
        "libelle": "Auditeur (lecture seule)",
        "permissions": ["*.view_*", "core.voir_toutes_agences", "accounting.voir_etats"],
    },
}

LIBELLES_ROLES = {code: r["libelle"] for code, r in ROLES.items()}


def _resoudre(motifs: list[str], toutes: list[Permission]) -> list[Permission]:
    resultat = []
    for perm in toutes:
        nom = f"{perm.content_type.app_label}.{perm.codename}"
        if any(fnmatch(nom, motif) for motif in motifs):
            resultat.append(perm)
    return resultat


def synchroniser_roles() -> None:
    toutes = list(Permission.objects.select_related("content_type"))
    for code, definition in ROLES.items():
        groupe, _ = Group.objects.get_or_create(name=code)
        groupe.permissions.set(_resoudre(definition["permissions"], toutes))
