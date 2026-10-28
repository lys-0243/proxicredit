"use client";

import { useQuery } from "@tanstack/react-query";
import { useState } from "react";

import { LigneVide, LignesChargement } from "@/components/etat-vide";
import { ListeDeroulante } from "@/components/liste-deroulante";
import { PageHeader } from "@/components/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
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
import { formatDateHeure } from "@/lib/format";

type Evenement = Schemas["JournalConnexion"]["evenement"];

const EVENEMENTS: Record<Evenement, { libelle: string; alerte: boolean }> = {
  SUCCES: { libelle: "Connexion réussie", alerte: false },
  ECHEC: { libelle: "Échec", alerte: true },
  VERROUILLE: { libelle: "Compte verrouillé", alerte: true },
  OTP_ECHEC: { libelle: "Code 2FA invalide", alerte: true },
  DECONNEXION: { libelle: "Déconnexion", alerte: false },
};

export default function PageJournalConnexions() {
  const [evenement, setEvenement] = useState("");
  const [recherche, setRecherche] = useState("");
  const [page, setPage] = useState(1);
  const journal = useQuery({
    queryKey: ["journal-connexions", evenement, recherche, page],
    queryFn: () =>
      api<Page<Schemas["JournalConnexion"]>>("/api/journal-connexions", {
        query: { evenement, search: recherche, page },
      }),
  });

  return (
    <>
      <PageHeader
        titre="Journal des connexions"
        description="Toutes les tentatives de connexion, réussies ou non, avec l'adresse IP."
        actions={
          <>
            <Input placeholder="Identifiant…" className="w-44" value={recherche}
              onChange={(e) => { setRecherche(e.target.value); setPage(1); }} />
            <ListeDeroulante className="w-48" value={evenement}
              onChange={(e) => { setEvenement(e.target.value); setPage(1); }}>
              <option value="">Tous les événements</option>
              {Object.entries(EVENEMENTS).map(([code, e]) => <option key={code} value={code}>{e.libelle}</option>)}
            </ListeDeroulante>
          </>
        }
      />
      <div className="carte-nue">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Date</TableHead>
              <TableHead>Identifiant</TableHead>
              <TableHead>Événement</TableHead>
              <TableHead>Adresse IP</TableHead>
              <TableHead>Navigateur</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {journal.isPending ? (
              <LignesChargement colonnes={5} />
            ) : journal.data?.results.length ? (
              journal.data.results.map((j) => (
                <TableRow key={j.id}>
                  <TableCell className="whitespace-nowrap">{formatDateHeure(j.date)}</TableCell>
                  <TableCell className="font-medium">{j.identifiant}</TableCell>
                  <TableCell>
                    <Badge variant={EVENEMENTS[j.evenement].alerte ? "destructive" : "secondary"}>
                      {EVENEMENTS[j.evenement].libelle}
                    </Badge>
                  </TableCell>
                  <TableCell className="font-mono text-xs">{j.adresse_ip}</TableCell>
                  <TableCell className="max-w-72 truncate text-xs text-muted-foreground">{j.navigateur}</TableCell>
                </TableRow>
              ))
            ) : (
              <LigneVide colonnes={5} message="Aucun événement." />
            )}
          </TableBody>
        </Table>
      </div>
      <div className="mt-4 flex items-center justify-end gap-2">
        <Button variant="outline" size="sm" disabled={!journal.data?.previous} onClick={() => setPage(page - 1)}>
          Précédent
        </Button>
        <span className="text-sm text-muted-foreground">Page {page}</span>
        <Button variant="outline" size="sm" disabled={!journal.data?.next} onClick={() => setPage(page + 1)}>
          Suivant
        </Button>
      </div>
    </>
  );
}
