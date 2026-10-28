"use client";

import { useQuery } from "@tanstack/react-query";

import { LigneVide, LignesChargement } from "@/components/etat-vide";
import { PageHeader } from "@/components/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { api, type Schemas } from "@/lib/api/client";
import { usePermission } from "@/lib/auth";
import { useAction } from "@/lib/mutations";

type Devise = Schemas["Devise"];

export default function PageDevises() {
  const peutModifier = usePermission("core.change_devise");
  const devises = useQuery({ queryKey: ["devises"], queryFn: () => api<Devise[]>("/api/devises") });
  const basculer = useAction(
    (d: Devise) => api(`/api/devises/${d.code}`, { method: "PATCH", body: { active: !d.active } }),
    { succes: "Devise mise à jour.", invalider: [["devises"]] },
  );

  return (
    <>
      <PageHeader
        titre="Devises"
        description="La devise de référence sert aux contre-valeurs comptables. Une devise utilisée ne se supprime pas : elle se désactive."
      />
      <div className="carte-nue">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Code</TableHead>
              <TableHead>Nom</TableHead>
              <TableHead>Symbole</TableHead>
              <TableHead className="text-right">Décimales</TableHead>
              <TableHead>Statut</TableHead>
              <TableHead />
            </TableRow>
          </TableHeader>
          <TableBody>
            {devises.isPending ? (
              <LignesChargement colonnes={6} />
            ) : devises.data?.length ? (
              devises.data.map((d) => (
                <TableRow key={d.code}>
                  <TableCell className="font-medium">{d.code}</TableCell>
                  <TableCell>
                    {d.nom}
                    {d.est_reference && <Badge variant="secondary" className="ml-2">Référence</Badge>}
                  </TableCell>
                  <TableCell>{d.symbole}</TableCell>
                  <TableCell className="text-right">{d.decimales}</TableCell>
                  <TableCell>
                    <Badge variant={d.active ? "outline" : "destructive"}>{d.active ? "Active" : "Inactive"}</Badge>
                  </TableCell>
                  <TableCell className="text-right">
                    {peutModifier && !d.est_reference && (
                      <Button variant="outline" size="sm" onClick={() => basculer.mutate(d)}
                        disabled={basculer.isPending}>
                        {d.active ? "Désactiver" : "Activer"}
                      </Button>
                    )}
                  </TableCell>
                </TableRow>
              ))
            ) : (
              <LigneVide colonnes={6} message="Aucune devise." />
            )}
          </TableBody>
        </Table>
      </div>
    </>
  );
}
