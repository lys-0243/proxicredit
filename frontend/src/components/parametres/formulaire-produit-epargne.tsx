"use client";

import { useState } from "react";

import { Champ } from "@/components/champ";
import { ListeDeroulante } from "@/components/liste-deroulante";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ApiError, api, type Schemas } from "@/lib/api/client";
import { pourcentVersTaux, tauxVersPourcent } from "@/lib/credits";
import { TYPES_PRODUIT_EPARGNE } from "@/lib/epargne";
import { useAction } from "@/lib/mutations";
import { useComptes, useDevises } from "@/lib/referentiels";

type ProduitEpargne = Schemas["ProduitEpargne"];

/** Compte de dépôts proposé selon le type (plan comptable 419x). */
const COMPTE_PAR_TYPE: Record<Schemas["TypeProduitEpargneEnum"], string> = {
  VUE: "4191",
  OBLIGATOIRE: "4192",
  TERME: "4193",
};

export function FormulaireProduitEpargne({ produit, fermer }: { produit: ProduitEpargne | null; fermer: () => void }) {
  const devises = useDevises();
  const comptes = useComptes();
  const comptesDepots = (comptes.data ?? []).filter((c) => c.numero.startsWith("419") && c.est_mouvementable && c.actif);
  const [form, setForm] = useState({
    code: produit?.code ?? "",
    libelle: produit?.libelle ?? "",
    type: produit?.type ?? ("VUE" as Schemas["TypeProduitEpargneEnum"]),
    devise: produit?.devise ?? "CDF",
    compte: produit ? String(produit.compte) : "",
    solde_minimum: produit?.solde_minimum ?? "0",
    retrait_libre: produit?.retrait_libre ?? true,
    taux: tauxVersPourcent(produit?.taux_interet_annuel ?? "0"),
    actif: produit?.actif ?? true,
  });
  const compteParDefaut = comptesDepots.find((c) => c.numero === COMPTE_PAR_TYPE[form.type]);
  const compte = form.compte || String(compteParDefaut?.id ?? "");

  const enregistrer = useAction(
    () => {
      const corps = {
        libelle: form.libelle,
        solde_minimum: form.solde_minimum,
        retrait_libre: form.retrait_libre,
        taux_interet_annuel: pourcentVersTaux(form.taux),
        actif: form.actif,
      };
      return produit
        ? api(`/api/epargne/produits/${produit.id}`, { method: "PATCH", body: corps })
        : api("/api/epargne/produits", {
            method: "POST",
            body: { ...corps, code: form.code, type: form.type, devise: form.devise, compte: Number(compte) },
          });
    },
    { succes: "Produit d'épargne enregistré.", invalider: [["epargne", "produits"]], apres: fermer },
  );
  const champs = enregistrer.error instanceof ApiError ? enregistrer.error.champs : {};
  const fige = !!produit;

  return (
    <DialogContent className="sm:max-w-lg">
      <form className="grid gap-4" onSubmit={(e) => { e.preventDefault(); enregistrer.mutate(); }}>
        <DialogHeader>
          <DialogTitle>{produit ? `Modifier ${produit.libelle}` : "Nouveau produit d'épargne"}</DialogTitle>
          {fige && (
            <DialogDescription>
              Le code, le type, la devise et le compte sont fixés à la création : les soldes des membres en dépendent.
            </DialogDescription>
          )}
        </DialogHeader>
        <div className="grid gap-4 sm:grid-cols-[8rem_1fr]">
          <Champ label="Code" htmlFor="code-epargne" erreur={champs.code}>
            <Input id="code-epargne" required maxLength={10} disabled={fige} placeholder="EPT-USD" value={form.code}
              onChange={(e) => setForm({ ...form, code: e.target.value.toUpperCase() })} />
          </Champ>
          <Champ label="Libellé" htmlFor="libelle-epargne" erreur={champs.libelle}>
            <Input id="libelle-epargne" required maxLength={100} value={form.libelle}
              onChange={(e) => setForm({ ...form, libelle: e.target.value })} />
          </Champ>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <Champ label="Type" htmlFor="type-epargne">
            <ListeDeroulante id="type-epargne" disabled={fige} value={form.type}
              onChange={(e) => {
                const type = e.target.value as Schemas["TypeProduitEpargneEnum"];
                // Le compte suit le type tant qu'il n'a pas été choisi à la main ; retraits libres sur l'épargne à vue.
                setForm({ ...form, type, compte: "", retrait_libre: type === "VUE" });
              }}>
              {Object.entries(TYPES_PRODUIT_EPARGNE)
                // L'épargne obligatoire est remplacée par l'épargne exigée et bloquée par chaque crédit.
                .filter(([code]) => code !== "OBLIGATOIRE" || form.type === "OBLIGATOIRE")
                .map(([code, libelle]) => <option key={code} value={code}>{libelle}</option>)}
            </ListeDeroulante>
          </Champ>
          <Champ label="Devise" htmlFor="devise-epargne">
            <ListeDeroulante id="devise-epargne" disabled={fige} value={form.devise}
              onChange={(e) => setForm({ ...form, devise: e.target.value })}>
              {(devises.data ?? []).filter((d) => d.active).map((d) => <option key={d.code} value={d.code}>{d.code}</option>)}
            </ListeDeroulante>
          </Champ>
          <Champ label="Compte des dépôts" htmlFor="compte-epargne-produit" erreur={champs.compte} className="sm:col-span-2">
            <ListeDeroulante id="compte-epargne-produit" disabled={fige} value={compte}
              onChange={(e) => setForm({ ...form, compte: e.target.value })}>
              {comptesDepots.map((c) => <option key={c.id} value={c.id}>{c.numero} – {c.libelle}</option>)}
            </ListeDeroulante>
          </Champ>
          <Champ label={`Solde minimum (${form.devise})`} htmlFor="solde-minimum" erreur={champs.solde_minimum}
            aide="Doit rester sur le compte après un retrait.">
            <Input id="solde-minimum" type="number" min="0" step="0.01" required value={form.solde_minimum}
              onChange={(e) => setForm({ ...form, solde_minimum: e.target.value })} />
          </Champ>
          <Champ label="Rémunération annuelle (%)" htmlFor="taux-epargne" aide="Calculée à partir de la phase 6.">
            <Input id="taux-epargne" required inputMode="decimal" value={form.taux}
              onChange={(e) => setForm({ ...form, taux: e.target.value })} />
          </Champ>
        </div>
        <div className="flex flex-wrap gap-6">
          <Label className="flex items-center gap-2 font-normal">
            <Checkbox checked={form.retrait_libre} onCheckedChange={(v) => setForm({ ...form, retrait_libre: v })} />
            Retraits libres au guichet
          </Label>
          <Label className="flex items-center gap-2 font-normal">
            <Checkbox checked={form.actif} onCheckedChange={(v) => setForm({ ...form, actif: v })} />
            Proposé à l&apos;ouverture de compte
          </Label>
        </div>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={fermer}>Annuler</Button>
          <Button type="submit" disabled={!compte || enregistrer.isPending}>Enregistrer</Button>
        </DialogFooter>
      </form>
    </DialogContent>
  );
}
