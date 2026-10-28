"use client";

import { useQuery } from "@tanstack/react-query";
import { useState } from "react";

import { Champ } from "@/components/champ";
import { LigneVide, LignesChargement } from "@/components/etat-vide";
import { ListeDeroulante } from "@/components/liste-deroulante";
import { PageHeader } from "@/components/page-header";
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
import { ApiError, api, type Page, type Schemas } from "@/lib/api/client";
import { usePermission } from "@/lib/auth";
import { aujourdhui, formatDate, formatDateHeure, formatTaux } from "@/lib/format";
import { useAction } from "@/lib/mutations";

type Taux = Schemas["TauxChange"];

const VIDE = { date: aujourdhui(), devise_source: "USD", devise_cible: "CDF", taux_achat: "",
  taux_vente: "", taux_reference: "" };

export default function PageTauxChange() {
  const peutSaisir = usePermission("core.add_tauxchange");
  const [form, setForm] = useState(VIDE);
  const taux = useQuery({ queryKey: ["taux-change"], queryFn: () => api<Page<Taux>>("/api/taux-change") });
  const devises = useQuery({
    queryKey: ["devises"],
    queryFn: () => api<Schemas["Devise"][]>("/api/devises"),
  });

  const saisir = useAction(() => api("/api/taux-change", { method: "POST", body: form }), {
    succes: "Taux enregistré.",
    invalider: [["taux-change"]],
    apres: () => setForm({ ...VIDE, date: form.date }),
  });
  const champs = saisir.error instanceof ApiError ? saisir.error.champs : {};
  const maj = (cle: keyof typeof VIDE) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setForm({ ...form, [cle]: e.target.value });

  return (
    <>
      <PageHeader
        titre="Taux de change"
        description="1 unité de la devise source = taux × devise cible. Le taux en vigueur est le dernier saisi à la date de l'opération."
      />
      {peutSaisir && (
        <Card className="mb-6">
          <CardHeader>
            <CardTitle>Saisir un taux</CardTitle>
          </CardHeader>
          <CardContent>
            <form
              className="grid gap-4 sm:grid-cols-3 lg:grid-cols-6 lg:items-end"
              onSubmit={(e) => {
                e.preventDefault();
                saisir.mutate();
              }}
            >
              <Champ label="Date" htmlFor="date" erreur={champs.date}>
                <Input id="date" type="date" required value={form.date} onChange={maj("date")} />
              </Champ>
              <Champ label="Devise source" htmlFor="source">
                <ListeDeroulante id="source" value={form.devise_source} onChange={maj("devise_source")}>
                  {devises.data?.map((d) => <option key={d.code} value={d.code}>{d.code}</option>)}
                </ListeDeroulante>
              </Champ>
              <Champ label="Devise cible" htmlFor="cible">
                <ListeDeroulante id="cible" value={form.devise_cible} onChange={maj("devise_cible")}>
                  {devises.data?.map((d) => <option key={d.code} value={d.code}>{d.code}</option>)}
                </ListeDeroulante>
              </Champ>
              <Champ label="Achat" htmlFor="achat" erreur={champs.taux_achat}>
                <Input id="achat" inputMode="decimal" required value={form.taux_achat} onChange={maj("taux_achat")} />
              </Champ>
              <Champ label="Vente" htmlFor="vente" erreur={champs.taux_vente}>
                <Input id="vente" inputMode="decimal" required value={form.taux_vente} onChange={maj("taux_vente")} />
              </Champ>
              <Champ label="Référence" htmlFor="reference" erreur={champs.taux_reference}>
                <Input id="reference" inputMode="decimal" required value={form.taux_reference}
                  onChange={maj("taux_reference")} />
              </Champ>
              <Button type="submit" className="w-fit" disabled={saisir.isPending}>
                Enregistrer
              </Button>
            </form>
          </CardContent>
        </Card>
      )}

      <div className="carte-nue">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Date</TableHead>
              <TableHead>Paire</TableHead>
              <TableHead className="text-right">Achat</TableHead>
              <TableHead className="text-right">Vente</TableHead>
              <TableHead className="text-right">Référence</TableHead>
              <TableHead>Saisi par</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {taux.isPending ? (
              <LignesChargement colonnes={6} />
            ) : taux.data?.results.length ? (
              taux.data.results.map((t) => (
                <TableRow key={t.id}>
                  <TableCell className="font-medium">{formatDate(t.date)}</TableCell>
                  <TableCell>{t.devise_source} → {t.devise_cible}</TableCell>
                  <TableCell className="montant text-right">{formatTaux(t.taux_achat)}</TableCell>
                  <TableCell className="montant text-right">{formatTaux(t.taux_vente)}</TableCell>
                  <TableCell className="montant text-right font-medium">{formatTaux(t.taux_reference)}</TableCell>
                  <TableCell>
                    {t.saisi_par}
                    <div className="text-xs text-muted-foreground">{formatDateHeure(t.cree_le)}</div>
                  </TableCell>
                </TableRow>
              ))
            ) : (
              <LigneVide colonnes={6} message="Aucun taux saisi." />
            )}
          </TableBody>
        </Table>
      </div>
    </>
  );
}
