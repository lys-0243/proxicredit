"use client";

import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { useState } from "react";

import { Champ } from "@/components/champ";
import { LigneVide, LignesChargement } from "@/components/etat-vide";
import { ListeDeroulante } from "@/components/liste-deroulante";
import { StatutMembreBadge } from "@/components/membres/statut-membre";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { api, type Page, type Schemas } from "@/lib/api/client";
import { usePermission } from "@/lib/auth";
import { formatDate } from "@/lib/format";
import { FONCTIONS_GROUPE, dossierClos, type Membre } from "@/lib/membres";
import { useAction } from "@/lib/mutations";

type Fonction = Schemas["FonctionEnum"];

function AjoutMembre({ groupe }: { groupe: Membre }) {
  const [recherche, setRecherche] = useState("");
  const [choisi, setChoisi] = useState<Schemas["MembreListe"] | null>(null);
  const [fonction, setFonction] = useState<Fonction>("MEMBRE");
  const candidats = useQuery({
    queryKey: ["membres", "candidats-groupe", recherche],
    queryFn: () =>
      api<Page<Schemas["MembreListe"]>>("/api/membres", { query: { search: recherche, type: "PHYSIQUE", taille: 8 } }),
    enabled: recherche.trim().length >= 2 && !choisi,
  });
  const ajouter = useAction(
    () => api(`/api/membres/${groupe.id}/composition`, { method: "POST", body: { membre: choisi?.id, fonction } }),
    {
      succes: "Membre ajouté au groupe.",
      invalider: [["membres"]],
      apres: () => { setChoisi(null); setRecherche(""); setFonction("MEMBRE"); },
    },
  );

  return (
    <Card>
      <CardHeader>
        <CardTitle>Ajouter un membre au groupe</CardTitle>
      </CardHeader>
      <CardContent>
        <form className="grid gap-4 sm:grid-cols-[1fr_12rem_auto] sm:items-end"
          onSubmit={(e) => { e.preventDefault(); if (choisi) ajouter.mutate(); }}>
          <Champ label="Personne physique de l'agence" htmlFor="recherche-membre"
            aide="Nom, numéro de membre ou téléphone.">
            {choisi ? (
              <div className="flex h-10 items-center justify-between rounded-xl border border-input bg-card px-3 text-sm shadow-xs">
                <span>{choisi.numero} – {choisi.nom_complet}</span>
                <Button type="button" variant="ghost" size="xs" onClick={() => setChoisi(null)}>Changer</Button>
              </div>
            ) : (
              <div className="relative">
                <Input id="recherche-membre" autoComplete="off" value={recherche}
                  onChange={(e) => setRecherche(e.target.value)} />
                {candidats.data && recherche.trim().length >= 2 && (
                  <ul className="absolute z-10 mt-1 max-h-60 w-full overflow-auto rounded-xl border border-border-soft bg-popover p-1.5 shadow-lg">
                    {candidats.data.results.length ? candidats.data.results.map((m) => (
                      <li key={m.id}>
                        <button type="button" className="w-full rounded-lg px-2 py-1.5 text-left text-sm hover:bg-accent hover:text-accent-foreground"
                          onClick={() => setChoisi(m)}>
                          {m.numero} – {m.nom_complet} <span className="text-muted-foreground">({m.statut.toLowerCase()})</span>
                        </button>
                      </li>
                    )) : <li className="px-2 py-1.5 text-sm text-muted-foreground">Aucun résultat.</li>}
                  </ul>
                )}
              </div>
            )}
          </Champ>
          <Champ label="Fonction" htmlFor="fonction-groupe">
            <ListeDeroulante id="fonction-groupe" value={fonction} onChange={(e) => setFonction(e.target.value as Fonction)}>
              {(Object.keys(FONCTIONS_GROUPE) as Fonction[]).map((f) => <option key={f} value={f}>{FONCTIONS_GROUPE[f]}</option>)}
            </ListeDeroulante>
          </Champ>
          <Button type="submit" disabled={!choisi || ajouter.isPending}>Ajouter</Button>
        </form>
      </CardContent>
    </Card>
  );
}

export function OngletGroupe({ groupe }: { groupe: Membre }) {
  const peutModifier = usePermission("members.change_membre") && !dossierClos(groupe.statut);
  const [anciens, setAnciens] = useState(false);
  const composition = useQuery({
    queryKey: ["membres", String(groupe.id), "composition"],
    queryFn: () => api<Schemas["MembreGroupe"][]>(`/api/membres/${groupe.id}/composition`),
  });
  const retirer = useAction(
    (lien: number) => api(`/api/membres/${groupe.id}/composition/${lien}/retirer`, { method: "POST" }),
    { succes: "Membre retiré du groupe.", invalider: [["membres"]] },
  );
  const liens = (composition.data ?? []).filter((l) => anciens || !l.date_sortie);

  return (
    <div className="grid gap-4">
      {peutModifier && <AjoutMembre groupe={groupe} />}
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          {composition.data?.filter((l) => !l.date_sortie).length ?? 0} membre(s) actuel(s). Le bureau
          (président, secrétaire, trésorier) est requis pour l&apos;activation.
        </p>
        <Button variant="ghost" size="sm" onClick={() => setAnciens(!anciens)}>
          {anciens ? "Masquer les anciens membres" : "Afficher les anciens membres"}
        </Button>
      </div>
      <div className="carte-nue">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Membre</TableHead>
              <TableHead>Fonction</TableHead>
              <TableHead>Statut</TableHead>
              <TableHead>Entrée</TableHead>
              <TableHead>Sortie</TableHead>
              <TableHead />
            </TableRow>
          </TableHeader>
          <TableBody>
            {composition.isPending ? (
              <LignesChargement colonnes={6} lignes={3} />
            ) : liens.length ? (
              liens.map((l) => (
                <TableRow key={l.id} className={l.date_sortie ? "opacity-60" : undefined}>
                  <TableCell>
                    <Link className="font-medium hover:underline" href={`/membres/${l.membre}`}>{l.membre_nom}</Link>
                    <div className="font-mono text-xs text-muted-foreground">{l.membre_numero}</div>
                  </TableCell>
                  <TableCell>{FONCTIONS_GROUPE[l.fonction]}</TableCell>
                  <TableCell><StatutMembreBadge statut={l.membre_statut as Membre["statut"]} /></TableCell>
                  <TableCell>{formatDate(l.date_entree)}</TableCell>
                  <TableCell>{formatDate(l.date_sortie)}</TableCell>
                  <TableCell className="text-right">
                    {peutModifier && !l.date_sortie && (
                      <Button variant="outline" size="sm"
                        onClick={() => confirm(`Retirer ${l.membre_nom} du groupe ?`) && retirer.mutate(l.id)}>
                        Retirer
                      </Button>
                    )}
                  </TableCell>
                </TableRow>
              ))
            ) : (
              <LigneVide colonnes={6} message="Aucun membre dans ce groupe." />
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
