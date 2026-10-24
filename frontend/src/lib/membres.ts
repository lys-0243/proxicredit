import type { Schemas } from "@/lib/api/client";

export type Membre = Schemas["Membre"];
export type TypeMembre = Schemas["TypeMembreEnum"];
export type StatutMembre = Schemas["StatutMembreEnum"];

export const TYPES_MEMBRE: Record<TypeMembre, string> = {
  PHYSIQUE: "Personne physique",
  MORALE: "Personne morale",
  GROUPE: "Groupe solidaire",
};

export const STATUTS_MEMBRE: Record<StatutMembre, string> = {
  PROSPECT: "Prospect",
  ACTIF: "Actif",
  SUSPENDU: "Suspendu",
  DEMISSIONNAIRE: "Démissionnaire",
  DECEDE: "Décédé",
};

export const TYPES_PIECE: Record<Schemas["TypePieceEnum"], string> = {
  CARTE_ELECTEUR: "Carte d'électeur",
  PASSEPORT: "Passeport",
  PERMIS: "Permis de conduire",
  CARTE_SERVICE: "Carte de service",
  CARTE_ETUDIANT: "Carte d'étudiant",
  AUTRE: "Autre",
};

export const SEXES: Record<Schemas["SexeEnum"], string> = { F: "Féminin", M: "Masculin" };

export const ETATS_CIVILS: Record<Schemas["EtatCivilEnum"], string> = {
  CELIBATAIRE: "Célibataire",
  MARIE: "Marié(e)",
  DIVORCE: "Divorcé(e)",
  VEUF: "Veuf / veuve",
  UNION_LIBRE: "Union libre",
};

export const TYPES_DOCUMENT: Record<Schemas["TypeDocumentEnum"], string> = {
  PIECE_IDENTITE: "Pièce d'identité",
  PHOTO: "Photo",
  SIGNATURE: "Spécimen de signature",
  JUSTIFICATIF_DOMICILE: "Justificatif de domicile",
  STATUTS: "Statuts / RCCM",
  PV_GROUPE: "PV de constitution du groupe",
  AUTRE: "Autre",
};

/** Documents proposés en premier selon le type de membre. */
export const DOCUMENTS_ATTENDUS: Record<TypeMembre, Schemas["TypeDocumentEnum"][]> = {
  PHYSIQUE: ["PIECE_IDENTITE", "PHOTO", "SIGNATURE", "JUSTIFICATIF_DOMICILE", "AUTRE"],
  MORALE: ["STATUTS", "PIECE_IDENTITE", "JUSTIFICATIF_DOMICILE", "AUTRE"],
  GROUPE: ["PV_GROUPE", "AUTRE"],
};

export const FONCTIONS_GROUPE: Record<Schemas["FonctionEnum"], string> = {
  PRESIDENT: "Président(e)",
  SECRETAIRE: "Secrétaire",
  TRESORIER: "Trésorier(ère)",
  MEMBRE: "Membre",
};

export const ACTIONS_STATUT: Record<Schemas["ActionEnum"], { libelle: string; depuis: StatutMembre[] }> = {
  suspendre: { libelle: "Suspendre", depuis: ["ACTIF"] },
  reactiver: { libelle: "Réactiver", depuis: ["SUSPENDU"] },
  demission: { libelle: "Enregistrer la démission", depuis: ["ACTIF", "SUSPENDU"] },
  deces: { libelle: "Enregistrer le décès", depuis: ["PROSPECT", "ACTIF", "SUSPENDU"] },
};

export function urlDocument(membreId: number, documentId: number): string {
  return `/api/membres/${membreId}/documents/${documentId}/fichier`;
}

export function dossierClos(statut: StatutMembre): boolean {
  return statut === "DEMISSIONNAIRE" || statut === "DECEDE";
}
