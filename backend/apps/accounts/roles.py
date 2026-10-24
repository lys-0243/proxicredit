"""Définition des rôles (groupes Django) et de leurs permissions.

Chaque rôle liste des permissions « app_label.codename ». Le joker `*` est accepté dans l'app ou le
codename (ex. « core.view_* », « *.view_* »). Les modules ajoutés dans les phases suivantes
(membres, crédits, caisse...) complètent simplement ces listes.

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
        ],
    },
    "AGENT_RECEPTION": {
        # Accueil : simulations de crédit et enregistrement des demandes (phase 4),
        # création de membres en statut prospect (phase 2). Aucun accès caisse ni approbation.
        "libelle": "Agent de réception",
        "permissions": [*LECTURE_PARAMETRAGE],
    },
    "AGENT_CREDIT": {
        "libelle": "Agent de crédit",
        "permissions": [*LECTURE_PARAMETRAGE],
    },
    "MEMBRE_COMITE": {
        "libelle": "Membre du comité",
        "permissions": [*LECTURE_PARAMETRAGE],
    },
    "CAISSIER": {
        "libelle": "Caissier",
        "permissions": [*LECTURE_PARAMETRAGE],
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
