import type { Schemas } from "@/lib/api/client";

export type Credit = Schemas["Credit"];
export type StatutCredit = Schemas["StatutCreditEnum"];

export const STATUTS_CREDIT: Record<StatutCredit, string> = {
  BROUILLON: "En saisie",
  SOUMIS: "Soumis à l'analyse",
  ANALYSE: "Attente du comité",
  APPROUVE: "Approuvé, à décaisser",
  REJETE: "Rejeté",
  ANNULE: "Annulé",
  EN_COURS: "En cours",
  SOLDE: "Soldé",
};

export const VARIANTES_STATUT_CREDIT: Record<
  StatutCredit,
  "info" | "warning" | "success" | "destructive" | "secondary"
> = {
  BROUILLON: "secondary",
  SOUMIS: "info",
  ANALYSE: "warning",
  APPROUVE: "success",
  REJETE: "destructive",
  ANNULE: "secondary",
  EN_COURS: "info",
  SOLDE: "success",
};

export const AVIS_CREDIT: Record<Schemas["AvisCreditEnum"], string> = {
  FAVORABLE: "Favorable",
  RESERVE: "Favorable avec réserves",
  DEFAVORABLE: "Défavorable",
};

export const METHODES_CREDIT: Record<Schemas["MethodeCreditEnum"], string> = {
  DEGRESSIF: "Dégressif (échéances constantes)",
  FLAT: "Intérêts fixes sur le capital initial",
};

export const PERIODICITES: Record<Schemas["PeriodiciteCreditEnum"], string> = {
  MENSUELLE: "Mensuelle",
  HEBDOMADAIRE: "Hebdomadaire",
};

/** Les taux arrivent en proportion (« 0.020000 ») : affichés en pourcentage. */
export function formatPourcentage(taux: string | null | undefined): string {
  if (taux === null || taux === undefined || taux === "") return "";
  return `${new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 4 }).format(Number(taux) * 100)} %`;
}

/** Saisie en pourcentage (« 2,5 ») → taux en proportion (« 0.025 »), par décalage de la virgule :
 * jamais de calcul en nombre flottant (0,07 × 100 ≠ 7 en binaire). */
export function pourcentVersTaux(pourcent: string): string {
  const [entier, decimales = ""] = pourcent.trim().replace(",", ".").split(".");
  const rang = decimales.length + 2;
  const chiffres = `${entier || "0"}${decimales}`.padStart(rang + 1, "0");
  return `${chiffres.slice(0, -rang)}.${chiffres.slice(-rang)}`;
}

/** Taux en proportion (« 0.025000 ») → pourcentage à afficher dans un champ (« 2.5 »). */
export function tauxVersPourcent(taux: string): string {
  const [entier, decimales = ""] = taux.split(".");
  const complete = decimales.padEnd(2, "0");
  const partieEntiere = `${entier}${complete.slice(0, 2)}`.replace(/^0+(?=\d)/, "");
  const reste = complete.slice(2).replace(/0+$/, "");
  return reste ? `${partieEntiere}.${reste}` : partieEntiere;
}
