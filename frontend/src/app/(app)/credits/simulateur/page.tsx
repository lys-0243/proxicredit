"use client";

import { useState } from "react";

import { Champ } from "@/components/champ";
import { ApercuSimulation, ConditionsProduit, useProduitsCredit } from "@/components/credits/communs";
import { ListeDeroulante } from "@/components/liste-deroulante";
import { PageHeader } from "@/components/page-header";
import { Input } from "@/components/ui/input";

export default function PageSimulateur() {
  const produits = useProduitsCredit();
  const [choixProduit, setChoixProduit] = useState("");
  const produit = produits.data?.find((p) => String(p.id) === choixProduit) ?? produits.data?.[0];
  const [choixDevise, setChoixDevise] = useState("");
  const devise = produit?.plafonds.some((p) => p.devise === choixDevise) ? choixDevise : produit?.plafonds[0]?.devise ?? "";
  const [montant, setMontant] = useState("");
  const [duree, setDuree] = useState(6);

  return (
    <>
      <PageHeader
        titre="Simulateur de crédit"
        description="Échéancier indicatif à présenter au membre, avant toute demande. Rien n'est enregistré."
      />
      <div className="carte mb-6 grid gap-4">
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <Champ label="Produit" htmlFor="produit">
            <ListeDeroulante id="produit" value={produit?.id ?? ""} onChange={(e) => setChoixProduit(e.target.value)}>
              {(produits.data ?? []).map((p) => <option key={p.id} value={p.id}>{p.libelle}</option>)}
            </ListeDeroulante>
          </Champ>
          <Champ label="Devise" htmlFor="devise">
            <ListeDeroulante id="devise" value={devise} onChange={(e) => setChoixDevise(e.target.value)}>
              {(produit?.plafonds ?? []).map((p) => <option key={p.devise} value={p.devise}>{p.devise}</option>)}
            </ListeDeroulante>
          </Champ>
          <Champ label="Montant" htmlFor="montant">
            <Input id="montant" type="number" min="0" step="0.01" value={montant} onChange={(e) => setMontant(e.target.value)} />
          </Champ>
          <Champ label="Nombre d'échéances" htmlFor="duree">
            <Input id="duree" type="number" min={produit?.duree_min ?? 1} max={produit?.duree_max} value={duree}
              onChange={(e) => setDuree(Math.max(1, Number(e.target.value) || 1))} />
          </Champ>
        </div>
        {produit && <ConditionsProduit produit={produit} devise={devise} />}
      </div>
      <ApercuSimulation key={`${produit?.id}-${devise}-${montant}-${duree}`}
        produit={produit?.id ?? null} devise={devise} montant={montant} duree={duree} />
    </>
  );
}
