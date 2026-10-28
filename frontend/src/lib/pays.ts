/** Codes ISO 3166-1 alpha-2 des États souverains (ONU), pour la nationalité. */
const CODES_ISO = [
  "AF", "ZA", "AL", "DZ", "DE", "AD", "AO", "AG", "SA", "AR", "AM", "AU", "AT", "AZ",
  "BS", "BH", "BD", "BB", "BE", "BZ", "BJ", "BT", "BY", "MM", "BO", "BA", "BW", "BR",
  "BN", "BG", "BF", "BI", "KH", "CM", "CA", "CV", "CF", "CL", "CN", "CY", "CO", "KM",
  "CG", "CD", "KP", "KR", "CR", "CI", "HR", "CU", "DK", "DJ", "DM", "EG", "AE", "EC",
  "ER", "ES", "EE", "SZ", "US", "ET", "FJ", "FI", "FR", "GA", "GM", "GE", "GH", "GR",
  "GD", "GT", "GN", "GQ", "GW", "GY", "HT", "HN", "HU", "IN", "ID", "IQ", "IR", "IE",
  "IS", "IL", "IT", "JM", "JP", "JO", "KZ", "KE", "KG", "KI", "KW", "LA", "LS", "LV",
  "LB", "LR", "LY", "LI", "LT", "LU", "MK", "MG", "MY", "MW", "MV", "ML", "MT", "MA",
  "MH", "MU", "MR", "MX", "FM", "MD", "MC", "MN", "ME", "MZ", "NA", "NR", "NP", "NI",
  "NE", "NG", "NO", "NZ", "OM", "UG", "UZ", "PK", "PW", "PS", "PA", "PG", "PY", "NL",
  "PE", "PH", "PL", "PT", "QA", "RO", "GB", "RU", "RW", "KN", "SM", "VC", "LC", "SV",
  "WS", "ST", "SN", "RS", "SC", "SL", "SG", "SK", "SI", "SO", "SD", "SS", "LK", "SE",
  "CH", "SR", "SY", "TJ", "TZ", "TD", "CZ", "TH", "TL", "TG", "TO", "TT", "TN", "TM",
  "TR", "TV", "UA", "UY", "VU", "VA", "VE", "VN", "YE", "ZM", "ZW",
] as const;

/** Libellés plus naturels que ceux d'Intl pour les pays les plus utilisés ici. */
const SURCHARGES: Record<string, string> = {
  CD: "République démocratique du Congo",
  CG: "République du Congo",
};

export type Pays = { code: string; nom: string; drapeau: string };

export const NATIONALITE_DEFAUT = "République démocratique du Congo";

export function emojiDrapeau(code: string): string {
  return [...code.toUpperCase()]
    .map((lettre) => String.fromCodePoint(0x1f1e6 - 65 + lettre.charCodeAt(0)))
    .join("");
}

function nomPays(code: string): string {
  if (SURCHARGES[code]) return SURCHARGES[code];
  return new Intl.DisplayNames(["fr"], { type: "region" }).of(code) ?? code;
}

export const PAYS: Pays[] = CODES_ISO.map((code) => ({
  code,
  nom: nomPays(code),
  drapeau: emojiDrapeau(code),
})).sort((a, b) => a.nom.localeCompare(b.nom, "fr"));

const PAR_NOM = new Map(PAYS.map((p) => [p.nom.toLowerCase(), p]));

/** Anciennes valeurs libres (ex. « Congolaise ») → pays reconnu. */
const ALIAS: Record<string, string> = {
  congolaise: NATIONALITE_DEFAUT,
  congolais: NATIONALITE_DEFAUT,
  "rdc": NATIONALITE_DEFAUT,
  "congo-kinshasa": NATIONALITE_DEFAUT,
  "congo kinshasa": NATIONALITE_DEFAUT,
};

export function normaliserNationalite(valeur: string | null | undefined): string {
  const brute = (valeur ?? "").trim();
  if (!brute) return NATIONALITE_DEFAUT;
  const alias = ALIAS[brute.toLowerCase()];
  if (alias) return alias;
  if (PAR_NOM.has(brute.toLowerCase())) return PAR_NOM.get(brute.toLowerCase())!.nom;
  return brute;
}

export function trouverPays(nationalite: string | null | undefined): Pays | undefined {
  const nom = normaliserNationalite(nationalite);
  return PAR_NOM.get(nom.toLowerCase());
}

export function libelleNationalite(nationalite: string | null | undefined): string {
  const brute = (nationalite ?? "").trim();
  if (!brute) return "";
  const pays = trouverPays(brute);
  return pays ? `${pays.drapeau} ${pays.nom}` : brute;
}
