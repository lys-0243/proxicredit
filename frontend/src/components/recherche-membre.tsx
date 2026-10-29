"use client";

import { useQuery } from "@tanstack/react-query";
import { SearchIcon, XIcon } from "lucide-react";
import { useState } from "react";

import { StatutMembreBadge } from "@/components/membres/statut-membre";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { api, type Page, type Schemas } from "@/lib/api/client";

export type MembreChoisi = Pick<Schemas["MembreListe"], "id" | "numero" | "nom_complet">;

/** Choix d'un membre par recherche (nom, numéro, téléphone), parmi les statuts acceptés (actifs
 * par défaut). Les autres membres trouvés restent affichés, grisés, avec leur statut. */
export function RechercheMembre({
  id,
  valeur,
  onChange,
  statuts = ["ACTIF"],
}: {
  id?: string;
  valeur: MembreChoisi | null;
  onChange: (membre: MembreChoisi | null) => void;
  statuts?: Schemas["StatutMembreEnum"][];
}) {
  const [texte, setTexte] = useState("");
  const recherche = useQuery({
    queryKey: ["membres", "recherche", texte],
    queryFn: () =>
      api<Page<Schemas["MembreListe"]>>("/api/membres", {
        query: { search: texte, taille: 8 },
      }),
    enabled: texte.trim().length >= 2,
  });

  if (valeur) {
    return (
      <div className="flex h-10 items-center gap-2 rounded-xl border border-input bg-muted/40 px-3 text-sm">
        <span className="font-mono text-xs text-muted-foreground">{valeur.numero}</span>
        <span className="flex-1 truncate font-semibold">{valeur.nom_complet}</span>
        <Button type="button" variant="ghost" size="icon-sm" aria-label="Changer de membre" onClick={() => onChange(null)}>
          <XIcon />
        </Button>
      </div>
    );
  }
  const resultats = recherche.data?.results ?? [];
  return (
    <div className="relative">
      <SearchIcon className="pointer-events-none absolute top-5 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
      <Input
        id={id}
        placeholder="Nom, numéro de membre ou téléphone…"
        className="pl-9"
        autoComplete="off"
        value={texte}
        onChange={(e) => setTexte(e.target.value)}
      />
      {texte.trim().length >= 2 && (
        <ul className="mt-1 max-h-64 overflow-y-auto rounded-xl border border-border-soft bg-card p-1 shadow-sm">
          {resultats.length ? (
            resultats.map((m) => {
              const choisissable = statuts.includes(m.statut) && !m.en_liste_noire;
              return (
                <li key={m.id}>
                  <button
                    type="button"
                    disabled={!choisissable}
                    title={
                      choisissable
                        ? undefined
                        : m.en_liste_noire
                          ? "Membre inscrit sur la liste noire."
                          : "Seul un membre actif peut être choisi : le dossier doit d'abord être activé."
                    }
                    className="flex w-full flex-wrap items-center gap-x-3 gap-y-1 rounded-lg px-3 py-2 text-left text-sm hover:bg-muted disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:bg-transparent"
                    onClick={() => onChange({ id: m.id, numero: m.numero, nom_complet: m.nom_complet })}
                  >
                    <span className="font-mono text-xs text-muted-foreground">{m.numero}</span>
                    <span className="flex-1 font-semibold">{m.nom_complet}</span>
                    {!choisissable && <StatutMembreBadge statut={m.statut} listeNoire={m.en_liste_noire} />}
                  </button>
                </li>
              );
            })
          ) : (
            <li className="px-3 py-2 text-sm text-muted-foreground">
              {recherche.isFetching ? "Recherche…" : "Aucun membre ne correspond."}
            </li>
          )}
          {resultats.length > 0 && resultats.every((m) => !statuts.includes(m.statut)) && (
            <li className="px-3 pt-1 pb-2 text-xs text-muted-foreground">
              Seuls les membres actifs peuvent être choisis. Activez d&apos;abord le dossier depuis la fiche du membre.
            </li>
          )}
        </ul>
      )}
    </div>
  );
}
