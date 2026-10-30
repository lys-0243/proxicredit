"use client";

import { useQuery } from "@tanstack/react-query";
import { ArrowLeftIcon, SendIcon } from "lucide-react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";

import { Champ } from "@/components/champ";
import { ApercuSimulation, ConditionsProduit, useProduitsCredit } from "@/components/credits/communs";
import { ListeDeroulante } from "@/components/liste-deroulante";
import { PageHeader } from "@/components/page-header";
import { RechercheMembre, type MembreChoisi } from "@/components/recherche-membre";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { api, type ApiError } from "@/lib/api/client";
import type { Credit } from "@/lib/credits";
import type { Membre } from "@/lib/membres";
import { useAction } from "@/lib/mutations";

function FormulaireDemande() {
  const router = useRouter();
  const membreInitial = useSearchParams().get("membre");
  const preselection = useQuery({
    queryKey: ["membres", membreInitial],
    queryFn: () => api<Membre>(`/api/membres/${membreInitial}`),
    enabled: !!membreInitial,
  });
  const [choixMembre, setChoixMembre] = useState<MembreChoisi | null | undefined>(undefined);
  // Tant que l'utilisateur n'a rien choisi, le membre passé dans l'adresse est proposé.
  const membre = choixMembre === undefined ? (preselection.data ?? null) : choixMembre;

  const produits = useProduitsCredit();
  const [choixProduit, setChoixProduit] = useState("");
  const produit = produits.data?.find((p) => String(p.id) === choixProduit) ?? produits.data?.[0];
  const [choixDevise, setChoixDevise] = useState("");
  const devise = produit?.plafonds.some((p) => p.devise === choixDevise) ? choixDevise : produit?.plafonds[0]?.devise ?? "";
  const [montant, setMontant] = useState("");
  const [duree, setDuree] = useState(6);
  const [objet, setObjet] = useState("");

  const enregistrer = useAction(
    () => api<Credit>("/api/credits/dossiers", {
      method: "POST",
      body: { membre: membre?.id, produit: produit?.id, devise, montant_demande: montant, duree_demandee: duree, objet },
    }),
    { succes: "Demande enregistrée. Vérifiez-la puis soumettez-la à l'analyse.", invalider: [["credits"]],
      apres: (credit) => router.push(`/credits/${credit.id}`) },
  );
  const erreurs = (enregistrer.error as ApiError | null)?.champs ?? {};

  return (
    <>
      <Link href="/credits" className={buttonVariants({ variant: "ghost", size: "sm", className: "mb-2 -ml-2" })}>
        <ArrowLeftIcon /> Crédits
      </Link>
      <PageHeader titre="Nouvelle demande de crédit"
        description="La demande est enregistrée en saisie ; elle part à l'analyse quand vous la soumettez." />
      <form className="carte mb-6 grid gap-4" onSubmit={(e) => { e.preventDefault(); enregistrer.mutate(); }}>
        <Champ label="Membre" htmlFor="membre" erreur={erreurs.membre}>
          <RechercheMembre id="membre" valeur={membre} onChange={setChoixMembre} />
        </Champ>
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <Champ label="Produit" htmlFor="produit" erreur={erreurs.produit}>
            <ListeDeroulante id="produit" value={produit?.id ?? ""} onChange={(e) => setChoixProduit(e.target.value)}>
              {(produits.data ?? []).map((p) => <option key={p.id} value={p.id}>{p.libelle}</option>)}
            </ListeDeroulante>
          </Champ>
          <Champ label="Devise" htmlFor="devise" erreur={erreurs.devise}>
            <ListeDeroulante id="devise" value={devise} onChange={(e) => setChoixDevise(e.target.value)}>
              {(produit?.plafonds ?? []).map((p) => <option key={p.devise} value={p.devise}>{p.devise}</option>)}
            </ListeDeroulante>
          </Champ>
          <Champ label="Montant demandé" htmlFor="montant" erreur={erreurs.montant_demande}>
            <Input id="montant" type="number" min="0" step="0.01" required value={montant}
              onChange={(e) => setMontant(e.target.value)} />
          </Champ>
          <Champ label="Nombre d'échéances" htmlFor="duree" erreur={erreurs.duree_demandee}>
            <Input id="duree" type="number" required min={produit?.duree_min ?? 1} max={produit?.duree_max} value={duree}
              onChange={(e) => setDuree(Math.max(1, Number(e.target.value) || 1))} />
          </Champ>
        </div>
        {produit && <ConditionsProduit produit={produit} devise={devise} />}
        <Champ label="Objet du crédit" htmlFor="objet" erreur={erreurs.objet}>
          <Input id="objet" required maxLength={255} placeholder="Frais scolaires, soins, …" value={objet}
            onChange={(e) => setObjet(e.target.value)} />
        </Champ>
        <Button type="submit" className="w-fit" disabled={!membre || !produit || enregistrer.isPending}>
          <SendIcon /> Enregistrer la demande
        </Button>
      </form>
      <h2 className="mb-3 text-base font-bold">Échéancier indicatif</h2>
      <ApercuSimulation key={`${produit?.id}-${devise}-${montant}-${duree}`}
        produit={produit?.id ?? null} devise={devise} montant={montant} duree={duree} />
    </>
  );
}

export default function PageNouvelleDemande() {
  return (
    <Suspense>
      <FormulaireDemande />
    </Suspense>
  );
}
