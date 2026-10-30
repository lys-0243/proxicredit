import type { Schemas } from "@/lib/api/client";

export type CompteEpargne = Schemas["CompteEpargne"];

export const TYPES_PRODUIT_EPARGNE: Record<Schemas["TypeProduitEpargneEnum"], string> = {
  VUE: "Épargne à vue",
  OBLIGATOIRE: "Épargne obligatoire",
  TERME: "Dépôt à terme",
};

export const STATUTS_COMPTE_EPARGNE: Record<Schemas["StatutCompteEpargneEnum"], string> = {
  ACTIF: "Actif",
  BLOQUE: "Bloqué",
  CLOS: "Clos",
};

export const VARIANTES_STATUT_COMPTE: Record<
  Schemas["StatutCompteEpargneEnum"],
  "success" | "destructive" | "secondary"
> = { ACTIF: "success", BLOQUE: "destructive", CLOS: "secondary" };

export const TYPES_MOUVEMENT_EPARGNE: Record<Schemas["TypeMouvementEpargneEnum"], string> = {
  DEPOT: "Dépôt",
  RETRAIT: "Retrait",
  DECAISSEMENT_CREDIT: "Décaissement de crédit",
  REMBOURSEMENT_CREDIT: "Remboursement de crédit",
};
