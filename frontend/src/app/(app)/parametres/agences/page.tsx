"use client";

import { useQuery } from "@tanstack/react-query";
import { PencilIcon, PlusIcon } from "lucide-react";
import { useState } from "react";

import { Champ } from "@/components/champ";
import { LigneVide, LignesChargement } from "@/components/etat-vide";
import { PageHeader } from "@/components/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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
import { ApiError, api, type Schemas } from "@/lib/api/client";
import { usePermission } from "@/lib/auth";
import { useAction } from "@/lib/mutations";

type Agence = Schemas["Agence"];
type Formulaire = Omit<Agence, "id">;

const VIDE: Formulaire = { code: "", nom: "", adresse: "", telephone: "", est_siege: false, active: true };

function DialogueAgence({ agence, fermer }: { agence: Agence | null; fermer: () => void }) {
  const [form, setForm] = useState<Formulaire>(agence ?? VIDE);
  const enregistrer = useAction(
    () =>
      agence
        ? api(`/api/agences/${agence.id}`, { method: "PUT", body: form })
        : api("/api/agences", { method: "POST", body: form }),
    { succes: "Agence enregistrée.", invalider: [["agences"]], apres: fermer },
  );
  const champs = enregistrer.error instanceof ApiError ? enregistrer.error.champs : {};

  return (
    <DialogContent className="sm:max-w-md">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          enregistrer.mutate();
        }}
        className="grid gap-4"
      >
        <DialogHeader>
          <DialogTitle>{agence ? `Modifier ${agence.code}` : "Nouvelle agence"}</DialogTitle>
        </DialogHeader>
        <div className="grid grid-cols-3 gap-3">
          <Champ label="Code" htmlFor="code" erreur={champs.code}>
            <Input id="code" required value={form.code}
              onChange={(e) => setForm({ ...form, code: e.target.value.toUpperCase() })} />
          </Champ>
          <Champ label="Nom" htmlFor="nom" erreur={champs.nom} className="col-span-2">
            <Input id="nom" required value={form.nom} onChange={(e) => setForm({ ...form, nom: e.target.value })} />
          </Champ>
        </div>
        <Champ label="Adresse" htmlFor="adresse">
          <Input id="adresse" value={form.adresse ?? ""} onChange={(e) => setForm({ ...form, adresse: e.target.value })} />
        </Champ>
        <Champ label="Téléphone" htmlFor="telephone">
          <Input id="telephone" type="tel" value={form.telephone ?? ""}
            onChange={(e) => setForm({ ...form, telephone: e.target.value })} />
        </Champ>
        <div className="flex gap-6">
          <Label className="flex items-center gap-2 font-normal">
            <Checkbox checked={form.est_siege} onCheckedChange={(v) => setForm({ ...form, est_siege: v })} />
            Siège
          </Label>
          <Label className="flex items-center gap-2 font-normal">
            <Checkbox checked={form.active} onCheckedChange={(v) => setForm({ ...form, active: v })} />
            Active
          </Label>
        </div>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={fermer}>Annuler</Button>
          <Button type="submit" disabled={enregistrer.isPending}>Enregistrer</Button>
        </DialogFooter>
      </form>
    </DialogContent>
  );
}

export default function PageAgences() {
  const peutCreer = usePermission("core.add_agence");
  const peutModifier = usePermission("core.change_agence");
  const [edition, setEdition] = useState<{ agence: Agence | null } | null>(null);
  const agences = useQuery({ queryKey: ["agences"], queryFn: () => api<Agence[]>("/api/agences") });

  return (
    <>
      <PageHeader
        titre="Agences"
        description="Chaque membre, caisse, utilisateur et écriture est rattaché à une agence."
        actions={
          peutCreer && (
            <Button onClick={() => setEdition({ agence: null })}>
              <PlusIcon /> Nouvelle agence
            </Button>
          )
        }
      />
      <div className="carte-nue">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Code</TableHead>
              <TableHead>Nom</TableHead>
              <TableHead>Adresse</TableHead>
              <TableHead>Téléphone</TableHead>
              <TableHead>Statut</TableHead>
              <TableHead className="w-10" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {agences.isPending ? (
              <LignesChargement colonnes={6} />
            ) : agences.data?.length ? (
              agences.data.map((a) => (
                <TableRow key={a.id}>
                  <TableCell className="font-medium">{a.code}</TableCell>
                  <TableCell>
                    {a.nom} {a.est_siege && <Badge variant="secondary" className="ml-1">Siège</Badge>}
                  </TableCell>
                  <TableCell>{a.adresse}</TableCell>
                  <TableCell>{a.telephone}</TableCell>
                  <TableCell>
                    <Badge variant={a.active ? "outline" : "destructive"}>{a.active ? "Active" : "Inactive"}</Badge>
                  </TableCell>
                  <TableCell>
                    {peutModifier && (
                      <Button variant="ghost" size="icon-sm" aria-label={`Modifier ${a.code}`}
                        onClick={() => setEdition({ agence: a })}>
                        <PencilIcon />
                      </Button>
                    )}
                  </TableCell>
                </TableRow>
              ))
            ) : (
              <LigneVide colonnes={6} message="Aucune agence." />
            )}
          </TableBody>
        </Table>
      </div>
      <Dialog open={edition !== null} onOpenChange={(ouvert) => !ouvert && setEdition(null)}>
        {edition && <DialogueAgence agence={edition.agence} fermer={() => setEdition(null)} />}
      </Dialog>
    </>
  );
}
