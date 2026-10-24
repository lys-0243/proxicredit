"""Règles de gestion des membres : numérotation, dossier KYC, activation, statuts, adhésion et
parts sociales. Les vues ne font qu'appeler ces fonctions."""

import uuid
from dataclasses import dataclass
from datetime import date
from decimal import Decimal

from django.db import transaction
from django.db.models import Sum
from django.utils import timezone

from apps.accounting import services as compta
from apps.accounting.models import CompteComptable
from apps.core import services as core
from apps.core.exceptions import ErreurMetier
from apps.core.models import Agence, Devise
from apps.core.money import arrondir, en_decimal
from apps.members.models import (
    Adhesion,
    DocumentMembre,
    HistoriqueStatut,
    Membre,
    MembreGroupe,
    MouvementPartsSociales,
    SequenceMembre,
)

AGE_MAJORITE = 18
FONCTIONS_BUREAU = (
    MembreGroupe.Fonction.PRESIDENT,
    MembreGroupe.Fonction.SECRETAIRE,
    MembreGroupe.Fonction.TRESORIER,
)

# Valeurs par défaut, à remplacer par les conditions réelles de la microfinance (paramètres datés).
PARAMETRE_ADHESION = "membres.adhesion"
DEFAUT_ADHESION = {"devise": "CDF", "frais": "5000", "valeur_part": "10000", "parts_minimum": 1}
PARAMETRE_GROUPE = "membres.groupe"
DEFAUT_GROUPE = {"membres_minimum": 3, "membres_maximum": 30}


@dataclass(frozen=True)
class ConditionsAdhesion:
    devise: Devise
    frais: Decimal
    valeur_part: Decimal
    parts_minimum: int


def conditions_adhesion(a_date: date | None = None) -> ConditionsAdhesion:
    valeur = core.parametre(PARAMETRE_ADHESION, a_date, defaut=DEFAUT_ADHESION)
    devise = Devise.objects.get(code=valeur["devise"])
    return ConditionsAdhesion(
        devise=devise,
        frais=arrondir(en_decimal(valeur["frais"]), devise.decimales),
        valeur_part=arrondir(en_decimal(valeur["valeur_part"]), devise.decimales),
        parts_minimum=int(valeur["parts_minimum"]),
    )


def conditions_groupe() -> dict:
    return core.parametre(PARAMETRE_GROUPE, defaut=DEFAUT_GROUPE)


# --- Création -----------------------------------------------------------------------


def prochain_numero(agence: Agence) -> str:
    sequence, _ = SequenceMembre.objects.select_for_update().get_or_create(agence=agence)
    sequence.dernier_numero += 1
    sequence.save(update_fields=["dernier_numero"])
    return f"{agence.code}-{sequence.dernier_numero:06d}"


@transaction.atomic
def creer_membre(donnees: dict, utilisateur) -> Membre:
    agence = donnees.pop("agence", None) or utilisateur.agence
    if agence is None:
        raise ErreurMetier("Votre compte n'est rattaché à aucune agence.", "sans_agence")
    membre = Membre(**donnees, agence=agence, cree_par=utilisateur, numero=prochain_numero(agence))
    membre.save()
    HistoriqueStatut.objects.create(
        membre=membre, nouveau=membre.statut, motif="Création du dossier", par=utilisateur
    )
    return membre


def verifier_modifiable(membre: Membre) -> None:
    if membre.statut in (Membre.Statut.DEMISSIONNAIRE, Membre.Statut.DECEDE):
        raise ErreurMetier(
            f"Dossier clôturé ({membre.get_statut_display().lower()}) : il n'est plus modifiable.",
            "dossier_clos",
        )


# --- Parts sociales ---------------------------------------------------------------------


def nombre_parts(membre: Membre) -> int:
    return membre.parts_sociales.aggregate(n=Sum("nombre"))["n"] or 0


# --- Dossier et activation ---------------------------------------------------------------


def _age(naissance: date, a_date: date) -> int:
    return (
        a_date.year
        - naissance.year
        - ((a_date.month, a_date.day) < (naissance.month, naissance.day))
    )


def elements_manquants(membre: Membre) -> list[str]:
    """Ce qui empêche encore l'activation du membre. Liste vide : le dossier est complet."""
    manquants = []
    aujourdhui = timezone.localdate()
    documents = set(membre.documents.values_list("type", flat=True))
    T = DocumentMembre.Type

    def exiger(condition, message):
        if not condition:
            manquants.append(message)

    if membre.type == Membre.Type.PHYSIQUE:
        exiger(membre.nom and membre.prenom, "Nom et prénom")
        exiger(membre.sexe, "Sexe")
        exiger(membre.date_naissance, "Date de naissance")
        if membre.date_naissance:
            exiger(
                _age(membre.date_naissance, aujourdhui) >= AGE_MAJORITE,
                f"Le membre doit avoir au moins {AGE_MAJORITE} ans",
            )
        exiger(membre.type_piece and membre.numero_piece, "Type et numéro de pièce d'identité")
        if membre.piece_expire_le:
            exiger(membre.piece_expire_le >= aujourdhui, "Pièce d'identité expirée")
        exiger(T.PIECE_IDENTITE in documents, "Copie de la pièce d'identité")
        exiger(T.PHOTO in documents, "Photo")
        exiger(T.SIGNATURE in documents, "Spécimen de signature")
    elif membre.type == Membre.Type.MORALE:
        exiger(membre.raison_sociale, "Raison sociale")
        exiger(membre.forme_juridique, "Forme juridique")
        exiger(membre.rccm, "Numéro RCCM")
        exiger(membre.representant_nom, "Représentant légal")
        exiger(T.STATUTS in documents, "Statuts / RCCM")
    else:
        regles = conditions_groupe()
        composition = list(
            membre.composition.filter(date_sortie__isnull=True).select_related("membre")
        )
        exiger(membre.nom_groupe, "Nom du groupe")
        exiger(
            len(composition) >= regles["membres_minimum"],
            f"Au moins {regles['membres_minimum']} membres dans le groupe",
        )
        fonctions = {c.fonction for c in composition}
        for fonction in FONCTIONS_BUREAU:
            exiger(fonction in fonctions, f"{MembreGroupe.Fonction(fonction).label} du groupe")
        inactifs = [c.membre.numero for c in composition if c.membre.statut != Membre.Statut.ACTIF]
        exiger(not inactifs, f"Membres du groupe non actifs : {', '.join(inactifs)}")
        exiger(T.PV_GROUPE in documents, "PV de constitution du groupe")

    exiger(membre.telephone, "Téléphone")
    exiger(hasattr(membre, "adhesion"), "Frais d'adhésion payés")
    minimum = conditions_adhesion().parts_minimum
    exiger(nombre_parts(membre) >= minimum, f"Au moins {minimum} part(s) sociale(s) libérée(s)")
    exiger(not membre.en_liste_noire, "Membre inscrit sur la liste noire")
    return manquants


def _changer_statut(membre: Membre, nouveau: str, utilisateur, motif: str = "") -> Membre:
    ancien = membre.statut
    membre.statut = nouveau
    membre.save(update_fields=["statut", "modifie_le", "active_par", "active_le", "nom_complet"])
    HistoriqueStatut.objects.create(
        membre=membre, ancien=ancien, nouveau=nouveau, motif=motif, par=utilisateur
    )
    return membre


@transaction.atomic
def activer(membre: Membre, utilisateur) -> Membre:
    membre = Membre.objects.select_for_update().get(pk=membre.pk)
    if membre.statut != Membre.Statut.PROSPECT:
        raise ErreurMetier("Seul un prospect peut être activé.", "statut")
    if membre.cree_par_id == utilisateur.pk:
        raise ErreurMetier(
            "Contrôle à quatre yeux : la personne qui a créé le dossier ne peut pas l'activer.",
            "quatre_yeux",
        )
    manquants = elements_manquants(membre)
    if manquants:
        raise ErreurMetier(
            "Dossier incomplet : " + " ; ".join(manquants) + ".", "dossier_incomplet"
        )
    membre.active_par = utilisateur
    membre.active_le = timezone.now()
    return _changer_statut(membre, Membre.Statut.ACTIF, utilisateur, "Dossier validé")


TRANSITIONS = {
    "suspendre": ({Membre.Statut.ACTIF}, Membre.Statut.SUSPENDU),
    "reactiver": ({Membre.Statut.SUSPENDU}, Membre.Statut.ACTIF),
    "demission": ({Membre.Statut.ACTIF, Membre.Statut.SUSPENDU}, Membre.Statut.DEMISSIONNAIRE),
    "deces": (
        {Membre.Statut.PROSPECT, Membre.Statut.ACTIF, Membre.Statut.SUSPENDU},
        Membre.Statut.DECEDE,
    ),
}


@transaction.atomic
def changer_statut(membre: Membre, action: str, motif: str, utilisateur) -> Membre:
    """Suspension, réactivation, démission, décès. Le motif est obligatoire.

    Les contrôles financiers (crédit en cours, épargne, remboursement des parts) s'ajouteront avec
    les modules épargne et crédit.
    """
    if action not in TRANSITIONS:
        raise ErreurMetier(f"Action inconnue : {action}.", "action")
    if not motif.strip():
        raise ErreurMetier("Le motif est obligatoire.", "motif")
    membre = Membre.objects.select_for_update().get(pk=membre.pk)
    depuis, vers = TRANSITIONS[action]
    if membre.statut not in depuis:
        raise ErreurMetier(
            f"Impossible depuis le statut « {membre.get_statut_display()} ».", "statut"
        )
    if vers in (Membre.Statut.DEMISSIONNAIRE, Membre.Statut.DECEDE):
        MembreGroupe.objects.filter(membre=membre, date_sortie__isnull=True).update(
            date_sortie=timezone.localdate()
        )
    return _changer_statut(membre, vers, utilisateur, motif.strip())


@transaction.atomic
def liste_noire(membre: Membre, inscrire: bool, motif: str, utilisateur) -> Membre:
    if not motif.strip():
        raise ErreurMetier("Le motif est obligatoire.", "motif")
    membre = Membre.objects.select_for_update().get(pk=membre.pk)
    membre.en_liste_noire = inscrire
    membre.motif_liste_noire = motif.strip() if inscrire else ""
    membre.save(update_fields=["en_liste_noire", "motif_liste_noire", "modifie_le", "nom_complet"])
    HistoriqueStatut.objects.create(
        membre=membre,
        ancien=membre.statut,
        nouveau=membre.statut,
        motif=("Inscription sur la liste noire : " if inscrire else "Retrait de la liste noire : ")
        + motif.strip(),
        par=utilisateur,
    )
    return membre


# --- Encaissements (adhésion, parts) ------------------------------------------------------


# Comptes qui reçoivent réellement l'argent d'un membre : banques, monnaie électronique, caisses.
# (Les virements internes 58x ne sont jamais la contrepartie d'un encaissement.)
PREFIXES_TRESORERIE = ("52", "55", "57")


def _compte_tresorerie(numero: str) -> CompteComptable:
    compte = CompteComptable.objects.filter(numero=numero).first()
    if (
        compte is None
        or not compte.numero.startswith(PREFIXES_TRESORERIE)
        or not compte.est_mouvementable
        or not compte.actif
    ):
        raise ErreurMetier(
            "Encaissement possible uniquement sur une caisse, une banque ou un compte Mobile Money "
            "(comptes 52, 55 ou 57 mouvementables).",
            "compte_tresorerie",
        )
    return compte


@transaction.atomic
def encaisser_adhesion(
    membre: Membre, *, nombre_parts: int, compte_tresorerie: str, utilisateur, cle_idempotence: str
) -> Adhesion:
    """Encaisse en une seule écriture les frais d'adhésion et les parts sociales initiales.

    `compte_tresorerie` : en attendant le module caisse (phase 3), le compte de caisse ou de
    mobile money qui reçoit l'argent ; la phase 3 le fournira depuis la session du caissier.
    """
    membre = Membre.objects.select_for_update().get(pk=membre.pk)
    existante = Adhesion.objects.filter(membre=membre).first()
    if existante:
        if existante.ecriture.cle_idempotence == cle_idempotence:
            return existante  # même demande rejouée (double clic, réseau)
        raise ErreurMetier("L'adhésion de ce membre est déjà payée.", "adhesion_payee")
    verifier_modifiable(membre)
    if membre.en_liste_noire:
        raise ErreurMetier("Membre inscrit sur la liste noire.", "liste_noire")

    conditions = conditions_adhesion(core.date_comptable(membre.agence))
    if nombre_parts < conditions.parts_minimum:
        raise ErreurMetier(
            f"Au moins {conditions.parts_minimum} part(s) sociale(s) à la souscription.",
            "parts_minimum",
        )
    montant_parts = conditions.valeur_part * nombre_parts
    ecriture = compta.comptabiliser_operation(
        "MEMBRE_ADHESION",
        montants={
            "total": conditions.frais + montant_parts,
            "frais": conditions.frais,
            "parts": montant_parts,
        },
        comptes={"TRESORERIE": _compte_tresorerie(compte_tresorerie)},
        agence=membre.agence,
        devise=conditions.devise,
        utilisateur=utilisateur,
        reference=membre.numero,
        piece=membre,
        cle_idempotence=cle_idempotence,
    )
    MouvementPartsSociales.objects.create(
        membre=membre,
        type=MouvementPartsSociales.Type.SOUSCRIPTION,
        nombre=nombre_parts,
        valeur_unitaire=conditions.valeur_part,
        montant=montant_parts,
        devise=conditions.devise,
        ecriture=ecriture,
        date_comptable=ecriture.date_comptable,
        cree_par=utilisateur,
    )
    return Adhesion.objects.create(
        membre=membre,
        frais=conditions.frais,
        devise=conditions.devise,
        ecriture=ecriture,
        date_comptable=ecriture.date_comptable,
        encaisse_par=utilisateur,
    )


@transaction.atomic
def souscrire_parts(
    membre: Membre, *, nombre: int, compte_tresorerie: str, utilisateur, cle_idempotence: str
) -> MouvementPartsSociales:
    """Parts sociales supplémentaires, après l'adhésion."""
    membre = Membre.objects.select_for_update().get(pk=membre.pk)
    deja = MouvementPartsSociales.objects.filter(ecriture__cle_idempotence=cle_idempotence).first()
    if deja:
        return deja
    verifier_modifiable(membre)
    if not hasattr(membre, "adhesion"):
        raise ErreurMetier("Encaissez d'abord l'adhésion du membre.", "adhesion_non_payee")
    if nombre < 1:
        raise ErreurMetier("Le nombre de parts doit être positif.", "nombre")
    conditions = conditions_adhesion(core.date_comptable(membre.agence))
    montant = conditions.valeur_part * nombre
    ecriture = compta.comptabiliser_operation(
        "MEMBRE_PARTS_SOCIALES",
        montants={"montant": montant},
        comptes={"TRESORERIE": _compte_tresorerie(compte_tresorerie)},
        agence=membre.agence,
        devise=conditions.devise,
        utilisateur=utilisateur,
        reference=membre.numero,
        piece=membre,
        cle_idempotence=cle_idempotence,
    )
    return MouvementPartsSociales.objects.create(
        membre=membre,
        type=MouvementPartsSociales.Type.SOUSCRIPTION,
        nombre=nombre,
        valeur_unitaire=conditions.valeur_part,
        montant=montant,
        devise=conditions.devise,
        ecriture=ecriture,
        date_comptable=ecriture.date_comptable,
        cree_par=utilisateur,
    )


# --- Groupes solidaires -------------------------------------------------------------------


@transaction.atomic
def ajouter_au_groupe(groupe: Membre, membre: Membre, fonction: str, utilisateur) -> MembreGroupe:
    groupe = Membre.objects.select_for_update().get(pk=groupe.pk)
    if groupe.type != Membre.Type.GROUPE:
        raise ErreurMetier("Ce membre n'est pas un groupe solidaire.", "pas_un_groupe")
    verifier_modifiable(groupe)
    if membre.type != Membre.Type.PHYSIQUE:
        raise ErreurMetier("Seule une personne physique peut rejoindre un groupe.", "type")
    if membre.agence_id != groupe.agence_id:
        raise ErreurMetier("Le membre et le groupe doivent appartenir à la même agence.", "agence")
    if membre.statut in (Membre.Statut.DEMISSIONNAIRE, Membre.Statut.DECEDE):
        raise ErreurMetier("Ce membre n'est plus actif.", "statut")
    actuel = MembreGroupe.objects.filter(membre=membre, date_sortie__isnull=True).first()
    if actuel:
        raise ErreurMetier(
            f"{membre.nom_complet} appartient déjà au groupe {actuel.groupe.nom_complet}.",
            "deja_dans_un_groupe",
        )
    composition = groupe.composition.filter(date_sortie__isnull=True)
    if composition.count() >= conditions_groupe()["membres_maximum"]:
        raise ErreurMetier("Nombre maximum de membres atteint pour ce groupe.", "groupe_complet")
    if fonction != MembreGroupe.Fonction.MEMBRE and composition.filter(fonction=fonction).exists():
        raise ErreurMetier(
            f"Le groupe a déjà un(e) {MembreGroupe.Fonction(fonction).label.lower()}.", "fonction"
        )
    return MembreGroupe.objects.create(
        groupe=groupe, membre=membre, fonction=fonction, date_entree=timezone.localdate()
    )


@transaction.atomic
def retirer_du_groupe(lien: MembreGroupe) -> MembreGroupe:
    verifier_modifiable(lien.groupe)
    if lien.date_sortie:
        raise ErreurMetier("Ce membre a déjà quitté le groupe.", "deja_sorti")
    lien.date_sortie = timezone.localdate()
    lien.save(update_fields=["date_sortie"])
    return lien


# --- Documents ------------------------------------------------------------------------------

TAILLE_MAX_DOCUMENT = 5 * 1024 * 1024
SIGNATURES_FICHIERS = {
    "image/jpeg": (b"\xff\xd8\xff",),
    "image/png": (b"\x89PNG\r\n\x1a\n",),
    "application/pdf": (b"%PDF",),
}
IMAGES_UNIQUEMENT = {DocumentMembre.Type.PHOTO, DocumentMembre.Type.SIGNATURE}


def type_contenu_reel(fichier) -> str | None:
    """Type du fichier d'après son contenu (et non son extension, falsifiable)."""
    debut = fichier.read(8)
    fichier.seek(0)
    for type_contenu, signatures in SIGNATURES_FICHIERS.items():
        if any(debut.startswith(s) for s in signatures):
            return type_contenu
    return None


@transaction.atomic
def ajouter_document(
    membre: Membre, type_document: str, fichier, utilisateur, description: str = ""
) -> DocumentMembre:
    verifier_modifiable(membre)
    if fichier.size > TAILLE_MAX_DOCUMENT:
        raise ErreurMetier("Fichier trop volumineux (5 Mo maximum).", "taille")
    type_contenu = type_contenu_reel(fichier)
    if type_contenu is None:
        raise ErreurMetier("Format non accepté : JPEG, PNG ou PDF uniquement.", "format")
    if type_document in IMAGES_UNIQUEMENT and not type_contenu.startswith("image/"):
        raise ErreurMetier(
            "La photo et la signature doivent être des images (JPEG ou PNG).", "format"
        )
    extension = {"image/jpeg": "jpg", "image/png": "png", "application/pdf": "pdf"}[type_contenu]
    document = DocumentMembre(
        uuid=uuid.uuid4(),
        membre=membre,
        type=type_document,
        nom_origine=fichier.name[:255],
        type_contenu=type_contenu,
        taille=fichier.size,
        description=description,
        ajoute_par=utilisateur,
    )
    document.fichier.save(f"document.{extension}", fichier, save=False)
    document.save()
    return document
