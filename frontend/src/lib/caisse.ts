"use client";

import { useQuery } from "@tanstack/react-query";

import { api, type Schemas } from "@/lib/api/client";
import { usePermission } from "@/lib/auth";

export type SessionCaisse = Schemas["SessionCaisse"];

export const CLE_MA_SESSION = ["caisse", "ma-session"];

/** Session de caisse ouverte de l'utilisateur connecté (null s'il n'en a pas). */
export function useMaSession() {
  const estCaissier = usePermission("cash.ouvrir_session_caisse");
  return useQuery({
    queryKey: CLE_MA_SESSION,
    queryFn: async () => (await api<SessionCaisse | undefined>("/api/caisse/sessions/ma-session")) ?? null,
    enabled: estCaissier,
  });
}

/** Libellé des opérations de caisse, d'après le type de l'écriture d'origine. */
export const TYPES_OPERATION: Record<string, string> = {
  MEMBRE_ADHESION: "Adhésion",
  MEMBRE_PARTS_SOCIALES: "Parts sociales",
  EPARGNE_DEPOT: "Dépôt d'épargne",
  EPARGNE_RETRAIT: "Retrait d'épargne",
  CREDIT_DECAISSEMENT: "Décaissement de crédit",
  CREDIT_REMBOURSEMENT: "Remboursement de crédit",
  CAISSE_APPROVISIONNEMENT: "Approvisionnement",
  CAISSE_DELESTAGE: "Délestage",
  CAISSE_MANQUANT: "Manquant de caisse",
  CAISSE_EXCEDENT: "Excédent de caisse",
};
