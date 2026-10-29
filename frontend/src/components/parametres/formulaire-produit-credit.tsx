"use client";

import { useState } from "react";

import { Champ } from "@/components/champ";
import type { ProduitCredit } from "@/components/credits/communs";
import { ListeDeroulante } from "@/components/liste-deroulante";
import { Alert, AlertDescription } from "@/components/ui/alert";
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
import { Textarea } from "@/components/ui/textarea";
import { ApiError, api, type Schemas } from "@/lib/api/client";
import { METHODES_CREDIT, PERIODICITES, pourcentVersTaux, tauxVersPourcent } from "@/lib/credits";
import { useAction } from "@/lib/mutations";
import { useComptes, useDevises } from "@/lib/referentiels";

type Plafond = { propose: boolean; min: string; max: string };

/** Taux saisis en pourcentage : convertis en proportion à l'envoi. */
type Formulaire = {
  code: string;
  libelle: string;
  description: string;
  methode: Schemas["MethodeCreditEnum"];
  periodicite: Schemas["PeriodiciteCreditEnum"];
  taux: string;
  duree_min: string;
  duree_max: string;
  frais: string;
  epargne: string;
  penalite: string;
  jours_grace: string;
  actif: boolean;
  plafonds: Record<string, Plafond>;
  compte_encours: string;
  compte_interets: string;
};

function depuisProduit(p: ProduitCredit): Formulaire {
  return {
    code: p.code,
    libelle: p.libelle,
    description: p.description ?? "",
    methode: p.methode ?? "DEGRESSIF",
    periodicite: p.periodicite ?? "MENSUELLE",
    taux: tauxVersPourcent(p.taux_interet),
    duree_min: String(p.duree_min),
    duree_max: String(p.duree_max),
    frais: tauxVersPourcent(p.frais_dossier_taux ?? "0"),
    epargne: tauxVersPourcent(p.epargne_garantie_taux ?? "0"),
    penalite: tauxVersPourcent(p.taux_penalite_jour ?? "0"),
    jours_grace: String(p.jours_grace ?? 0),
    actif: p.actif ?? true,
    plafonds: Object.fromEntries(
      p.plafonds.map((l) => [l.devise, { propose: true, min: l.montant_min, max: l.montant_max }]),
    ),
    compte_encours: p.comptes.encours ?? "",
    compte_interets: p.comptes.interets ?? "",
  };
}

const VIDE: Formulaire = {
  code: "",
  libelle: "",
  description: "",
  methode: "DEGRESSIF",
  periodicite: "MENSUELLE",
  taux: "",
  duree_min: "1",
  duree_max: "12",
  frais: "0",
  epargne: "0",
  penalite: "0",
  jours_grace: "0",
  actif: true,
  plafonds: {},
  compte_encours: "",
  compte_interets: "",
};

export function FormulaireProduitCredit({ produit, fermer }: { produit: ProduitCredit | null; fermer: () => void }) {
  const devises = useDevises();
  const comptes = useComptes();
  const [form, setForm] = useState<Formulaire>(produit ? depuisProduit(produit) : VIDE);
  const maj = (cle: keyof Formulaire) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) =>
    setForm({ ...form, [cle]: e.target.value });
  const plafond = (devise: string): Plafond => form.plafonds[devise] ?? { propose: false, min: "", max: "" };
  const majPlafond = (devise: string, valeur: Partial<Plafond>) =>
    setForm({ ...form, plafonds: { ...form.plafonds, [devise]: { ...plafond(devise), ...valeur } } });

  // Encours sains (411x) et intérêts (77x) : un nouveau compte se crée dans le plan comptable.
  const mouvementables = (comptes.data ?? []).filter((c) => c.est_mouvementable && c.actif);
  const comptesEncours = mouvementables.filter((c) => c.numero.startsWith("411"));
  const comptesInterets = mouvementables.filter((c) => c.numero.startsWith("77"));
  const encours = form.compte_encours || comptesEncours[0]?.numero || "";
  const interets = form.compte_interets || comptesInterets[0]?.numero || "";

  const enregistrer = useAction(
    () => {
      const corps = {
        libelle: form.libelle,
        description: form.description,
        methode: form.methode,
        periodicite: form.periodicite,
        taux_interet: pourcentVersTaux(form.taux),
        duree_min: Number(form.duree_min),
        duree_max: Number(form.duree_max),
        frais_dossier_taux: pourcentVersTaux(form.frais),
        epargne_garantie_taux: pourcentVersTaux(form.epargne),
        taux_penalite_jour: pourcentVersTaux(form.penalite),
        jours_grace: Number(form.jours_grace),
        actif: form.actif,
        plafonds: Object.entries(form.plafonds)
          .filter(([, p]) => p.propose)
          .map(([devise, p]) => ({ devise, montant_min: p.min, montant_max: p.max })),
      };
      return produit
        ? api(`/api/credits/produits/${produit.id}`, { method: "PATCH", body: corps })
        : api("/api/credits/produits", {
            method: "POST",
            body: { ...corps, code: form.code, compte_encours: encours, compte_interets: interets },
          });
    },
    { succes: "Produit de crédit enregistré.", invalider: [["credits", "produits"]], apres: fermer },
  );
  const champs = enregistrer.error instanceof ApiError ? enregistrer.error.champs : {};
  const aucunPlafond = !Object.values(form.plafonds).some((p) => p.propose);

  return (
    <DialogContent className="sm:max-w-2xl">
      <form className="grid max-h-[80vh] gap-4 overflow-y-auto pr-1" onSubmit={(e) => { e.preventDefault(); enregistrer.mutate(); }}>
        <DialogHeader>
          <DialogTitle>{produit ? `Modifier ${produit.libelle}` : "Nouveau produit de crédit"}</DialogTitle>
          <DialogDescription>
            Les nouvelles conditions s&apos;appliquent aux demandes futures ; un crédit déjà approuvé garde son taux.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 sm:grid-cols-[8rem_1fr]">
          <Champ label="Code" htmlFor="code-produit" erreur={champs.code}
            aide={produit ? "Ne change pas." : undefined}>
            <Input id="code-produit" required maxLength={10} disabled={!!produit} value={form.code}
              onChange={(e) => setForm({ ...form, code: e.target.value.toUpperCase() })} />
          </Champ>
          <Champ label="Libellé" htmlFor="libelle-produit" erreur={champs.libelle}>
            <Input id="libelle-produit" required maxLength={100} value={form.libelle} onChange={maj("libelle")} />
          </Champ>
        </div>
        <Champ label="Description" htmlFor="description-produit">
          <Textarea id="description-produit" rows={2} value={form.description} onChange={maj("description")} />
        </Champ>

        <div className="grid gap-4 sm:grid-cols-3">
          <Champ label="Calcul des intérêts" htmlFor="methode">
            <ListeDeroulante id="methode" value={form.methode} onChange={maj("methode")}>
              {Object.entries(METHODES_CREDIT).map(([code, libelle]) => <option key={code} value={code}>{libelle}</option>)}
            </ListeDeroulante>
          </Champ>
          <Champ label="Périodicité" htmlFor="periodicite">
            <ListeDeroulante id="periodicite" value={form.periodicite} onChange={maj("periodicite")}>
              {Object.entries(PERIODICITES).map(([code, libelle]) => <option key={code} value={code}>{libelle}</option>)}
            </ListeDeroulante>
          </Champ>
          <Champ label="Taux par période (%)" htmlFor="taux" erreur={champs.taux_interet}>
            <Input id="taux" required inputMode="decimal" placeholder="2" value={form.taux} onChange={maj("taux")} />
          </Champ>
          <Champ label="Échéances minimum" htmlFor="duree-min" erreur={champs.duree_min}>
            <Input id="duree-min" type="number" min={1} required value={form.duree_min} onChange={maj("duree_min")} />
          </Champ>
          <Champ label="Échéances maximum" htmlFor="duree-max" erreur={champs.duree_max}>
            <Input id="duree-max" type="number" min={1} required value={form.duree_max} onChange={maj("duree_max")} />
          </Champ>
          <Champ label="Frais de dossier (%)" htmlFor="frais" aide="Retenus au décaissement.">
            <Input id="frais" required inputMode="decimal" value={form.frais} onChange={maj("frais")} />
          </Champ>
          <Champ label="Épargne exigée (%)" htmlFor="epargne" aide="Déjà déposée, bloquée pendant le crédit.">
            <Input id="epargne" required inputMode="decimal" value={form.epargne} onChange={maj("epargne")} />
          </Champ>
          <Champ label="Pénalité par jour (%)" htmlFor="penalite" aide="Du montant impayé.">
            <Input id="penalite" required inputMode="decimal" value={form.penalite} onChange={maj("penalite")} />
          </Champ>
          <Champ label="Jours de grâce" htmlFor="grace" aide="Avant de compter des pénalités.">
            <Input id="grace" type="number" min={0} required value={form.jours_grace} onChange={maj("jours_grace")} />
          </Champ>
        </div>

        <fieldset className="grid gap-3">
          <legend className="mb-1 text-sm font-semibold">Montants autorisés par devise</legend>
          {(devises.data ?? []).filter((d) => d.active).map((d) => {
            const p = plafond(d.code);
            return (
              <div key={d.code} className="grid items-center gap-3 sm:grid-cols-[9rem_1fr_1fr]">
                <Label className="flex items-center gap-2 font-normal">
                  <Checkbox checked={p.propose} onCheckedChange={(v) => majPlafond(d.code, { propose: v })} />
                  Proposé en {d.code}
                </Label>
                <Input aria-label={`Minimum ${d.code}`} placeholder="Minimum" type="number" min="0" step="0.01"
                  required={p.propose} disabled={!p.propose} value={p.min} onChange={(e) => majPlafond(d.code, { min: e.target.value })} />
                <Input aria-label={`Maximum ${d.code}`} placeholder="Maximum" type="number" min="0" step="0.01"
                  required={p.propose} disabled={!p.propose} value={p.max} onChange={(e) => majPlafond(d.code, { max: e.target.value })} />
              </div>
            );
          })}
          {champs.plafonds && <p className="text-xs text-destructive">{champs.plafonds}</p>}
        </fieldset>

        {produit ? (
          <p className="text-sm text-muted-foreground">
            Comptes : encours <span className="font-mono">{form.compte_encours || "–"}</span>, intérêts{" "}
            <span className="font-mono">{form.compte_interets || "–"}</span> (fixés à la création).
          </p>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2">
            <Champ label="Compte d'encours" htmlFor="compte-encours" erreur={champs.compte_encours}>
              <ListeDeroulante id="compte-encours" value={encours} onChange={maj("compte_encours")}>
                {comptesEncours.map((c) => <option key={c.id} value={c.numero}>{c.numero} – {c.libelle}</option>)}
              </ListeDeroulante>
            </Champ>
            <Champ label="Compte d'intérêts" htmlFor="compte-interets" erreur={champs.compte_interets}>
              <ListeDeroulante id="compte-interets" value={interets} onChange={maj("compte_interets")}>
                {comptesInterets.map((c) => <option key={c.id} value={c.numero}>{c.numero} – {c.libelle}</option>)}
              </ListeDeroulante>
            </Champ>
            <Alert className="sm:col-span-2">
              <AlertDescription>
                Les règles comptables du produit sont créées avec ces comptes ; ils ne pourront plus changer. Pour
                un suivi séparé, créez d&apos;abord des comptes dédiés dans le plan comptable.
              </AlertDescription>
            </Alert>
          </div>
        )}

        <Label className="flex items-center gap-2 font-normal">
          <Checkbox checked={form.actif} onCheckedChange={(v) => setForm({ ...form, actif: v })} />
          Proposé aux nouvelles demandes
        </Label>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={fermer}>Annuler</Button>
          <Button type="submit" disabled={aucunPlafond || enregistrer.isPending}>Enregistrer</Button>
        </DialogFooter>
      </form>
    </DialogContent>
  );
}
