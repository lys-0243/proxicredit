"use client";

import { useQuery } from "@tanstack/react-query";
import { useState } from "react";

import { Champ } from "@/components/champ";
import { LigneVide, LignesChargement } from "@/components/etat-vide";
import { PageHeader } from "@/components/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
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
import { CLE_MOI, useMoi, usePermission } from "@/lib/auth";
import { aujourdhui, formatDate, formatDateHeure } from "@/lib/format";
import { useAction } from "@/lib/mutations";

type Journee = Schemas["JourneeComptable"];

export default function PageJournees() {
  const { data: moi } = useMoi();
  const peutOuvrir = usePermission("core.ouvrir_journee");
  const peutFermer = usePermission("core.fermer_journee");
  const [date, setDate] = useState(aujourdhui());

  const journees = useQuery({
    queryKey: ["journees"],
    queryFn: () => api<Page<Journee>>("/api/journees"),
  });
  const ouverte = journees.data?.results.find(
    (j) => j.statut === "OUVERTE" && j.agence.id === moi?.agence?.id,
  );

  const invalider = [["journees"], CLE_MOI];
  const ouvrir = useAction(
    () => api("/api/journees/ouvrir", { method: "POST", body: { agence: moi?.agence?.id, date } }),
    { succes: "Journée ouverte.", invalider },
  );
  const fermer = useAction(
    () => api("/api/journees/fermer", { method: "POST", body: { agence: moi?.agence?.id } }),
    { succes: "Journée fermée.", invalider },
  );

  return (
    <>
      <PageHeader
        titre="Journées comptables"
        description="Toutes les opérations sont datées de la journée ouverte de l'agence, jamais de la date du serveur."
      />

      {moi?.agence && (peutOuvrir || peutFermer) && (
        <Card className="mb-6">
          <CardHeader>
            <CardTitle>{moi.agence.nom}</CardTitle>
            <CardDescription>
              {ouverte
                ? `Journée du ${formatDate(ouverte.date)} ouverte par ${ouverte.ouverte_par}.`
                : "Aucune journée ouverte : aucune opération financière n'est possible."}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {ouverte ? (
              peutFermer && (
                <Button
                  variant="destructive"
                  onClick={() => {
                    if (confirm(`Fermer la journée du ${formatDate(ouverte.date)} ?`)) fermer.mutate();
                  }}
                  disabled={fermer.isPending}
                >
                  Fermer la journée
                </Button>
              )
            ) : (
              peutOuvrir && (
                <form
                  className="flex flex-wrap items-end gap-3"
                  onSubmit={(e) => {
                    e.preventDefault();
                    ouvrir.mutate();
                  }}
                >
                  <Champ label="Date de la journée" htmlFor="date-journee">
                    <Input
                      id="date-journee"
                      type="date"
                      required
                      value={date}
                      onChange={(e) => setDate(e.target.value)}
                    />
                  </Champ>
                  <Button type="submit" disabled={ouvrir.isPending}>
                    Ouvrir la journée
                  </Button>
                </form>
              )
            )}
          </CardContent>
        </Card>
      )}

      <div className="carte-nue">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Date</TableHead>
              <TableHead>Agence</TableHead>
              <TableHead>Statut</TableHead>
              <TableHead>Ouverte par</TableHead>
              <TableHead>Fermée par</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {journees.isPending ? (
              <LignesChargement colonnes={5} />
            ) : journees.data?.results.length ? (
              journees.data.results.map((j) => (
                <TableRow key={j.id}>
                  <TableCell className="font-medium">{formatDate(j.date)}</TableCell>
                  <TableCell>{j.agence.code}</TableCell>
                  <TableCell>
                    <Badge variant={j.statut === "OUVERTE" ? "default" : "secondary"}>
                      {j.statut === "OUVERTE" ? "Ouverte" : "Fermée"}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    {j.ouverte_par}
                    <div className="text-xs text-muted-foreground">
                      {formatDateHeure(j.ouverte_le)}
                    </div>
                  </TableCell>
                  <TableCell>
                    {j.fermee_par}
                    <div className="text-xs text-muted-foreground">
                      {formatDateHeure(j.fermee_le)}
                    </div>
                  </TableCell>
                </TableRow>
              ))
            ) : (
              <LigneVide colonnes={5} message="Aucune journée comptable pour l'instant." />
            )}
          </TableBody>
        </Table>
      </div>
    </>
  );
}
