"use client";

import { useQuery } from "@tanstack/react-query";

import { LigneVide, LignesChargement } from "@/components/etat-vide";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { api, type Schemas } from "@/lib/api/client";
import { formatDateHeure } from "@/lib/format";
import { STATUTS_MEMBRE, type Membre, type StatutMembre } from "@/lib/membres";

const libelle = (statut: string) => STATUTS_MEMBRE[statut as StatutMembre] ?? statut;

export function OngletHistorique({ membre }: { membre: Membre }) {
  const historique = useQuery({
    queryKey: ["membres", String(membre.id), "historique"],
    queryFn: () => api<Schemas["HistoriqueStatut"][]>(`/api/membres/${membre.id}/historique`),
  });
  return (
    <div className="carte-nue">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Date</TableHead>
            <TableHead>Changement</TableHead>
            <TableHead>Motif</TableHead>
            <TableHead>Par</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {historique.isPending ? (
            <LignesChargement colonnes={4} lignes={3} />
          ) : historique.data?.length ? (
            historique.data.map((h) => (
              <TableRow key={h.id}>
                <TableCell className="whitespace-nowrap">{formatDateHeure(h.le)}</TableCell>
                <TableCell>
                  {h.ancien && h.ancien !== h.nouveau ? `${libelle(h.ancien)} → ${libelle(h.nouveau)}` : libelle(h.nouveau)}
                </TableCell>
                <TableCell>{h.motif}</TableCell>
                <TableCell>{h.par}</TableCell>
              </TableRow>
            ))
          ) : (
            <LigneVide colonnes={4} message="Aucun historique." />
          )}
        </TableBody>
      </Table>
    </div>
  );
}
