"use client";

import { useQuery } from "@tanstack/react-query";
import { Trash2Icon } from "lucide-react";
import { useState } from "react";

import { Champ } from "@/components/champ";
import { LigneVide, LignesChargement } from "@/components/etat-vide";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ApiError, api, type Schemas } from "@/lib/api/client";
import { usePermission } from "@/lib/auth";
import { dossierClos, type Membre } from "@/lib/membres";
import { useAction } from "@/lib/mutations";

const VIDE = { nom_complet: "", lien: "", telephone: "", pourcentage: "100" };

export function OngletBeneficiaires({ membre }: { membre: Membre }) {
  const peutModifier = usePermission("members.change_membre") && !dossierClos(membre.statut);
  const [form, setForm] = useState(VIDE);
  const cle = ["membres", String(membre.id), "beneficiaires"];
  const beneficiaires = useQuery({
    queryKey: cle,
    queryFn: () => api<Schemas["Beneficiaire"][]>(`/api/membres/${membre.id}/beneficiaires`),
  });
  const ajouter = useAction(
    () => api(`/api/membres/${membre.id}/beneficiaires`, { method: "POST", body: form }),
    { succes: "Bénéficiaire ajouté.", invalider: [cle], apres: () => setForm(VIDE) },
  );
  const supprimer = useAction(
    (id: number) => api(`/api/membres/${membre.id}/beneficiaires/${id}`, { method: "DELETE" }),
    { succes: "Bénéficiaire retiré.", invalider: [cle] },
  );
  const champs = ajouter.error instanceof ApiError ? ajouter.error.champs : {};
  const maj = (k: keyof typeof VIDE) => (e: React.ChangeEvent<HTMLInputElement>) => setForm({ ...form, [k]: e.target.value });

  return (
    <div className="grid gap-4">
      <p className="text-sm text-muted-foreground">
        Personnes désignées par le membre en cas de décès. Le total des parts ne peut pas dépasser 100 %.
      </p>
      {peutModifier && (
        <Card>
          <CardContent>
            <form className="grid gap-4 sm:grid-cols-2 lg:grid-cols-[2fr_1fr_1fr_8rem_auto] lg:items-end"
              onSubmit={(e) => { e.preventDefault(); ajouter.mutate(); }}>
              <Champ label="Nom complet" htmlFor="b-nom" erreur={champs.nom_complet}>
                <Input id="b-nom" required value={form.nom_complet} onChange={maj("nom_complet")} />
              </Champ>
              <Champ label="Lien de parenté" htmlFor="b-lien" erreur={champs.lien}>
                <Input id="b-lien" required placeholder="Époux, fille…" value={form.lien} onChange={maj("lien")} />
              </Champ>
              <Champ label="Téléphone" htmlFor="b-tel">
                <Input id="b-tel" type="tel" value={form.telephone} onChange={maj("telephone")} />
              </Champ>
              <Champ label="Part (%)" htmlFor="b-part" erreur={champs.pourcentage}>
                <Input id="b-part" inputMode="decimal" required value={form.pourcentage} onChange={maj("pourcentage")} />
              </Champ>
              <Button type="submit" disabled={ajouter.isPending}>Ajouter</Button>
            </form>
          </CardContent>
        </Card>
      )}
      <div className="rounded-xl border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Nom</TableHead>
              <TableHead>Lien</TableHead>
              <TableHead>Téléphone</TableHead>
              <TableHead className="text-right">Part</TableHead>
              <TableHead className="w-10" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {beneficiaires.isPending ? (
              <LignesChargement colonnes={5} lignes={2} />
            ) : beneficiaires.data?.length ? (
              beneficiaires.data.map((b) => (
                <TableRow key={b.id}>
                  <TableCell className="font-medium">{b.nom_complet}</TableCell>
                  <TableCell>{b.lien}</TableCell>
                  <TableCell>{b.telephone}</TableCell>
                  <TableCell className="text-right">{Number(b.pourcentage)} %</TableCell>
                  <TableCell>
                    {peutModifier && (
                      <Button variant="ghost" size="icon-sm" aria-label={`Retirer ${b.nom_complet}`}
                        onClick={() => confirm(`Retirer ${b.nom_complet} ?`) && supprimer.mutate(b.id)}>
                        <Trash2Icon />
                      </Button>
                    )}
                  </TableCell>
                </TableRow>
              ))
            ) : (
              <LigneVide colonnes={5} message="Aucun bénéficiaire désigné." />
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
