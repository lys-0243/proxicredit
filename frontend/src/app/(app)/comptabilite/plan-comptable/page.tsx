"use client";

import { PencilIcon, PlusIcon } from "lucide-react";
import { useMemo, useState } from "react";

import { Champ } from "@/components/champ";
import { LigneVide, LignesChargement } from "@/components/etat-vide";
import { ListeDeroulante } from "@/components/liste-deroulante";
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
import { useComptes, useDevises } from "@/lib/referentiels";
import { cn } from "@/lib/utils";

type Compte = Schemas["CompteComptable"];

const CLASSES: Record<number, string> = {
  1: "Ressources durables",
  2: "Actif immobilisé",
  3: "Stocks",
  4: "Tiers",
  5: "Trésorerie",
  6: "Charges",
  7: "Produits",
  8: "Autres charges et produits",
  9: "Comptabilité analytique",
};

type Formulaire = {
  numero: string;
  libelle: string;
  sens_normal: "D" | "C";
  parent: number | null;
  est_mouvementable: boolean;
  devise: string | null;
  actif: boolean;
};

function DialogueCompte({ compte, comptes, fermer }: { compte: Compte | null; comptes: Compte[]; fermer: () => void }) {
  const devises = useDevises();
  const [form, setForm] = useState<Formulaire>({
    numero: compte?.numero ?? "",
    libelle: compte?.libelle ?? "",
    sens_normal: compte?.sens_normal ?? "D",
    parent: compte?.parent ?? null,
    est_mouvementable: compte?.est_mouvementable ?? true,
    devise: compte?.devise ?? null,
    actif: compte?.actif ?? true,
  });
  const enregistrer = useAction(
    () =>
      compte
        ? api(`/api/comptabilite/comptes/${compte.id}`, { method: "PUT", body: form })
        : api("/api/comptabilite/comptes", { method: "POST", body: form }),
    { succes: "Compte enregistré.", invalider: [["comptabilite", "comptes"]], apres: fermer },
  );
  const champs = enregistrer.error instanceof ApiError ? enregistrer.error.champs : {};
  // Parent proposé : le plus long compte non mouvementable dont le numéro préfixe le nouveau.
  const parentsPossibles = comptes.filter((c) => !c.est_mouvementable && c.id !== compte?.id);

  return (
    <DialogContent className="sm:max-w-lg">
      <form className="grid gap-4" onSubmit={(e) => { e.preventDefault(); enregistrer.mutate(); }}>
        <DialogHeader>
          <DialogTitle>{compte ? `Compte ${compte.numero}` : "Nouveau compte"}</DialogTitle>
        </DialogHeader>
        <div className="grid grid-cols-3 gap-3">
          <Champ label="Numéro" htmlFor="numero" erreur={champs.numero}>
            <Input
              id="numero"
              required
              inputMode="numeric"
              value={form.numero}
              onChange={(e) => {
                const numero = e.target.value.replace(/\D/g, "");
                const parent = parentsPossibles
                  .filter((c) => numero.startsWith(c.numero) && c.numero !== numero)
                  .sort((a, b) => b.numero.length - a.numero.length)[0];
                setForm({ ...form, numero, parent: parent?.id ?? form.parent });
              }}
            />
          </Champ>
          <Champ label="Libellé" htmlFor="libelle" erreur={champs.libelle} className="col-span-2">
            <Input id="libelle" required value={form.libelle} onChange={(e) => setForm({ ...form, libelle: e.target.value })} />
          </Champ>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Champ label="Compte parent" htmlFor="parent">
            <ListeDeroulante id="parent" value={form.parent ?? ""}
              onChange={(e) => setForm({ ...form, parent: e.target.value ? Number(e.target.value) : null })}>
              <option value="">Aucun</option>
              {parentsPossibles.map((c) => <option key={c.id} value={c.id}>{c.numero} {c.libelle}</option>)}
            </ListeDeroulante>
          </Champ>
          <Champ label="Sens normal" htmlFor="sens">
            <ListeDeroulante id="sens" value={form.sens_normal}
              onChange={(e) => setForm({ ...form, sens_normal: e.target.value as "D" | "C" })}>
              <option value="D">Débiteur</option>
              <option value="C">Créditeur</option>
            </ListeDeroulante>
          </Champ>
          <Champ label="Devise" htmlFor="devise" aide="Vide : toutes les devises.">
            <ListeDeroulante id="devise" value={form.devise ?? ""}
              onChange={(e) => setForm({ ...form, devise: e.target.value || null })}>
              <option value="">Toutes</option>
              {devises.data?.map((d) => <option key={d.code} value={d.code}>{d.code}</option>)}
            </ListeDeroulante>
          </Champ>
        </div>
        <div className="flex gap-6">
          <Label className="flex items-center gap-2 font-normal">
            <Checkbox checked={form.est_mouvementable}
              onCheckedChange={(v) => setForm({ ...form, est_mouvementable: v })} />
            Mouvementable
          </Label>
          <Label className="flex items-center gap-2 font-normal">
            <Checkbox checked={form.actif} onCheckedChange={(v) => setForm({ ...form, actif: v })} />
            Actif
          </Label>
        </div>
        {champs.est_mouvementable && <p className="text-xs text-destructive">{champs.est_mouvementable}</p>}
        <DialogFooter>
          <Button type="button" variant="outline" onClick={fermer}>Annuler</Button>
          <Button type="submit" disabled={enregistrer.isPending}>Enregistrer</Button>
        </DialogFooter>
      </form>
    </DialogContent>
  );
}

export default function PagePlanComptable() {
  const peutCreer = usePermission("accounting.add_comptecomptable");
  const peutModifier = usePermission("accounting.change_comptecomptable");
  const comptes = useComptes();
  const [recherche, setRecherche] = useState("");
  const [classe, setClasse] = useState("");
  const [edition, setEdition] = useState<{ compte: Compte | null } | null>(null);

  const filtres = useMemo(() => {
    const terme = recherche.trim().toLowerCase();
    return (comptes.data ?? []).filter(
      (c) =>
        (!classe || String(c.classe) === classe) &&
        (!terme || c.numero.startsWith(terme) || c.libelle.toLowerCase().includes(terme)),
    );
  }, [comptes.data, recherche, classe]);

  return (
    <>
      <PageHeader
        titre="Plan comptable"
        description="SYSCOHADA révisé, adapté à la microfinance. Seuls les comptes mouvementables reçoivent des écritures."
        actions={
          <>
            <Input placeholder="Numéro ou libellé…" className="w-52" value={recherche}
              onChange={(e) => setRecherche(e.target.value)} />
            <ListeDeroulante className="w-52" value={classe} onChange={(e) => setClasse(e.target.value)}>
              <option value="">Toutes les classes</option>
              {Object.entries(CLASSES).map(([n, l]) => <option key={n} value={n}>Classe {n} – {l}</option>)}
            </ListeDeroulante>
            {peutCreer && (
              <Button onClick={() => setEdition({ compte: null })}>
                <PlusIcon /> Nouveau compte
              </Button>
            )}
          </>
        }
      />
      <div className="rounded-xl border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-32">Numéro</TableHead>
              <TableHead>Libellé</TableHead>
              <TableHead>Sens</TableHead>
              <TableHead>Devise</TableHead>
              <TableHead>Type</TableHead>
              <TableHead className="w-10" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {comptes.isPending ? (
              <LignesChargement colonnes={6} lignes={8} />
            ) : filtres.length ? (
              filtres.map((c) => (
                <TableRow key={c.id} className={cn(!c.actif && "opacity-50")}>
                  <TableCell className={cn("font-mono", !c.est_mouvementable && "font-semibold")}
                    style={{ paddingLeft: `${0.5 + (c.numero.length - 1) * 0.75}rem` }}>
                    {c.numero}
                  </TableCell>
                  <TableCell className={cn(!c.est_mouvementable && "font-semibold")}>{c.libelle}</TableCell>
                  <TableCell>{c.sens_normal === "D" ? "Débiteur" : "Créditeur"}</TableCell>
                  <TableCell>{c.devise ?? "Toutes"}</TableCell>
                  <TableCell>
                    {c.est_mouvementable ? (
                      <Badge variant="outline">Mouvementable</Badge>
                    ) : (
                      <Badge variant="secondary">Regroupement</Badge>
                    )}
                  </TableCell>
                  <TableCell>
                    {peutModifier && (
                      <Button variant="ghost" size="icon-sm" aria-label={`Modifier ${c.numero}`}
                        onClick={() => setEdition({ compte: c })}>
                        <PencilIcon />
                      </Button>
                    )}
                  </TableCell>
                </TableRow>
              ))
            ) : (
              <LigneVide colonnes={6} message="Aucun compte ne correspond." />
            )}
          </TableBody>
        </Table>
      </div>
      <Dialog open={edition !== null} onOpenChange={(ouvert) => !ouvert && setEdition(null)}>
        {edition && (
          <DialogueCompte compte={edition.compte} comptes={comptes.data ?? []} fermer={() => setEdition(null)} />
        )}
      </Dialog>
    </>
  );
}
