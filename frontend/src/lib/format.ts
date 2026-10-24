/** Les montants arrivent de l'API sous forme de chaînes décimales : on ne les convertit en nombre
 * que pour l'affichage, jamais pour un calcul. */
export function formatMontant(valeur: string | number | null | undefined, devise?: string): string {
  if (valeur === null || valeur === undefined || valeur === "") return "";
  const nombre = typeof valeur === "number" ? valeur : Number(valeur);
  const texte = new Intl.NumberFormat("fr-FR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(nombre);
  return devise ? `${texte} ${devise}` : texte;
}

export function formatTaux(valeur: string | null | undefined): string {
  if (!valeur) return "";
  return new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 6 }).format(Number(valeur));
}

export function formatDate(valeur: string | null | undefined): string {
  if (!valeur) return "";
  const [annee, mois, jour] = valeur.slice(0, 10).split("-");
  return `${jour}/${mois}/${annee}`;
}

export function formatDateHeure(valeur: string | null | undefined): string {
  if (!valeur) return "";
  return new Intl.DateTimeFormat("fr-FR", { dateStyle: "short", timeStyle: "short" }).format(
    new Date(valeur),
  );
}

export function aujourdhui(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
