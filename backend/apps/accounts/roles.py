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

# Accueil et suivi des dossiers : créer un prospect, compléter le KYC, ajouter des documents.
GESTION_DOSSIERS_MEMBRES = [
    "members.view_membre",
    "members.add_membre",
    "members.change_membre",
    "members.view_documentmembre",
    "members.add_documentmembre",
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
            "members.encaisser_adhesion",
        ],
    },
    "AGENT_RECEPTION": {
        # Accueil : création des dossiers membres (prospects) ; simulations et demandes de crédit
        # en phase 4. Aucun accès caisse, aucune activation ni approbation.
        "libelle": "Agent de réception",
        "permissions": [*LECTURE_PARAMETRAGE, *GESTION_DOSSIERS_MEMBRES],
    },
    "AGENT_CREDIT": {
        "libelle": "Agent de crédit",
        "permissions": [*LECTURE_PARAMETRAGE, *GESTION_DOSSIERS_MEMBRES],
    },
    "MEMBRE_COMITE": {
        "libelle": "Membre du comité",
        "permissions": [*LECTURE_PARAMETRAGE, "members.view_membre", "members.view_documentmembre"],
    },
    "CAISSIER": {
        "libelle": "Caissier",
        # Consulte photo et signature pour vérifier l'identité au guichet.
        "permissions": [
            *LECTURE_PARAMETRAGE,
            "members.view_membre",
            "members.view_documentmembre",
            "members.encaisser_adhesion",
            # Choix du compte de caisse ou de mobile money qui reçoit l'argent.
            "accounting.view_comptecomptable",
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
