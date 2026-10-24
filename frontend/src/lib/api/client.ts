import type { components } from "@/lib/api/schema";

/** Types des objets de l'API, générés depuis le schéma OpenAPI (`npm run api:types`). */
export type Schemas = components["schemas"];

export type Page<T> = { count: number; next: string | null; previous: string | null; results: T[] };

export class ApiError extends Error {
  constructor(
    public status: number,
    public data: unknown,
  ) {
    super(messageErreur(data) ?? `Erreur ${status}`);
  }

  get code(): string | undefined {
    return typeof this.data === "object" && this.data && "code" in this.data
      ? String((this.data as { code: unknown }).code)
      : undefined;
  }

  /** Erreurs de validation par champ, renvoyées par DRF. */
  get champs(): Record<string, string> {
    if (typeof this.data !== "object" || !this.data) return {};
    return Object.fromEntries(
      Object.entries(this.data as Record<string, unknown>)
        .filter(([cle]) => cle !== "detail" && cle !== "code")
        .map(([cle, valeur]) => [cle, Array.isArray(valeur) ? valeur.join(" ") : String(valeur)]),
    );
  }
}

function messageErreur(data: unknown): string | undefined {
  if (typeof data === "string") return data;
  if (Array.isArray(data)) return data.map(String).join(" ");
  if (typeof data === "object" && data) {
    const d = data as Record<string, unknown>;
    if (d.detail) return Array.isArray(d.detail) ? d.detail.join(" ") : String(d.detail);
    if (Array.isArray(d.non_field_errors)) return d.non_field_errors.join(" ");
    const premier = Object.values(d)[0];
    if (premier) return Array.isArray(premier) ? premier.join(" ") : String(premier);
  }
  return undefined;
}

function lireCookie(nom: string): string | undefined {
  return document.cookie
    .split("; ")
    .find((c) => c.startsWith(`${nom}=`))
    ?.split("=")[1];
}

async function jetonCsrf(): Promise<string> {
  let jeton = lireCookie("csrftoken");
  if (!jeton) {
    await fetch("/api/auth/csrf", { credentials: "same-origin" });
    jeton = lireCookie("csrftoken");
  }
  return jeton ?? "";
}

let rafraichissement: Promise<boolean> | null = null;

/** Un seul rafraîchissement à la fois, partagé par toutes les requêtes en attente. */
function rafraichirSession(): Promise<boolean> {
  rafraichissement ??= (async () => {
    try {
      const reponse = await fetch("/api/auth/rafraichir", {
        method: "POST",
        credentials: "same-origin",
        headers: { "X-CSRFToken": await jetonCsrf() },
      });
      return reponse.ok;
    } finally {
      setTimeout(() => (rafraichissement = null), 0);
    }
  })();
  return rafraichissement;
}

type Requete = {
  method?: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  body?: unknown;
  query?: Record<string, string | number | boolean | null | undefined>;
};

const SANS_RAFRAICHISSEMENT = ["/api/auth/connexion", "/api/auth/rafraichir"];

export async function api<T = unknown>(chemin: string, requete: Requete = {}): Promise<T> {
  const { method = "GET", body, query } = requete;
  const url = new URL(chemin, window.location.origin);
  for (const [cle, valeur] of Object.entries(query ?? {})) {
    if (valeur !== undefined && valeur !== null && valeur !== "") {
      url.searchParams.set(cle, String(valeur));
    }
  }

  const envoyer = async () => {
    const headers: Record<string, string> = { Accept: "application/json" };
    if (body !== undefined) headers["Content-Type"] = "application/json";
    if (method !== "GET") headers["X-CSRFToken"] = await jetonCsrf();
    return fetch(url, {
      method,
      headers,
      credentials: "same-origin",
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
  };

  let reponse = await envoyer();
  if (reponse.status === 401 && !SANS_RAFRAICHISSEMENT.includes(chemin)) {
    if (await rafraichirSession()) {
      reponse = await envoyer();
    } else {
      // Hors composant React (pas de routeur) ; le rechargement vide aussi le cache des requêtes.
      // eslint-disable-next-line @next/next/no-location-assign-relative-destination
      window.location.assign(`/connexion?suite=${encodeURIComponent(window.location.pathname)}`);
    }
  }

  if (reponse.status === 204) return undefined as T;
  const donnees = reponse.headers.get("content-type")?.includes("json")
    ? await reponse.json()
    : await reponse.text();
  if (!reponse.ok) throw new ApiError(reponse.status, donnees);
  return donnees as T;
}
