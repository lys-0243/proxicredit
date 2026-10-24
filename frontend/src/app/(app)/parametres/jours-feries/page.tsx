"use client";

import { useQuery } from "@tanstack/react-query";
import { Trash2Icon } from "lucide-react";
import { useState } from "react";

import { Champ } from "@/components/champ";
import { LigneVide, LignesChargement } from "@/components/etat-vide";
import { PageHeader } from "@/components/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
import { formatDate } from "@/lib/format";
import { useAction } from "@/lib/mutations";

type JourFerie = Schemas["JourFerie"];

export default function PageJoursFeries() {
  const peutAjouter = usePermission("core.add_jourferie");
  const peutSupprimer = usePermission("core.delete_jourferie");
  const [form, setForm] = useState({ date: "", libelle: "", recurrent: true });
  const jours = useQuery({ queryKey: ["jours-feries"], queryFn: () => api<JourFerie[]>("/api/jours-feries") });

  const ajouter = useAction(() => api("/api/jours-feries", { method: "POST", body: form }), {
    succes: "Jour férié ajouté.",
    invalider: [["jours-feries"]],
    apres: () => setForm({ date: "", libelle: "", recurrent: true }),
  });
  const supprimer = useAction((id: number) => api(`/api/jours-feries/${id}`, { method: "DELETE" }), {
    succes: "Jour férié supprimé.",
    invalider: [["jours-feries"]],
  });

  return (
    <>
      <PageHeader
        titre="Jours fériés"
        description="Une échéance qui tombe un jour férié ou un dimanche est reportée au jour ouvré suivant."
      />
      {peutAjouter && (
        <Card className="mb-6">
          <CardContent>
            <form
              className="flex flex-wrap items-end gap-4"
              onSubmit={(e) => {
                e.preventDefault();
                ajouter.mutate();
              }}
            >
              <Champ label="Date" htmlFor="date">
                <Input id="date" type="date" required value={form.date}
                  onChange={(e) => setForm({ ...form, date: e.target.value })} />
              </Champ>
              <Champ label="Libellé" htmlFor="libelle" className="min-w-64 flex-1">
                <Input id="libelle" required value={form.libelle}
                  onChange={(e) => setForm({ ...form, libelle: e.target.value })} />
              </Champ>
              <Label className="flex h-8 items-center gap-2 font-normal">
                <Checkbox checked={form.recurrent} onCheckedChange={(v) => setForm({ ...form, recurrent: v })} />
                Chaque année
              </Label>
              <Button type="submit" disabled={ajouter.isPending}>Ajouter</Button>
            </form>
          </CardContent>
        </Card>
      )}
      <div className="rounded-xl border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Date</TableHead>
              <TableHead>Libellé</TableHead>
              <TableHead>Récurrence</TableHead>
              <TableHead className="w-10" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {jours.isPending ? (
              <LignesChargement colonnes={4} />
            ) : jours.data?.length ? (
              jours.data.map((j) => (
                <TableRow key={j.id}>
                  <TableCell className="font-medium">
                    {j.recurrent ? formatDate(j.date).slice(0, 5) : formatDate(j.date)}
                  </TableCell>
                  <TableCell>{j.libelle}</TableCell>
                  <TableCell>
                    <Badge variant="outline">{j.recurrent ? "Chaque année" : "Une fois"}</Badge>
                  </TableCell>
                  <TableCell>
                    {peutSupprimer && (
                      <Button variant="ghost" size="icon-sm" aria-label={`Supprimer ${j.libelle}`}
                        onClick={() => confirm(`Supprimer « ${j.libelle} » ?`) && supprimer.mutate(j.id)}>
                        <Trash2Icon />
                      </Button>
                    )}
                  </TableCell>
                </TableRow>
              ))
            ) : (
              <LigneVide colonnes={4} message="Aucun jour férié enregistré." />
            )}
          </TableBody>
        </Table>
      </div>
    </>
  );
}
