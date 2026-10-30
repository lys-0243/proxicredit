"use client";

import { useQuery } from "@tanstack/react-query";
import { useState } from "react";

import { Champ } from "@/components/champ";
import { ListeDeroulante } from "@/components/liste-deroulante";
import { RechercheMembre, type MembreChoisi } from "@/components/recherche-membre";
import { CompteTresorerie, useComptesTresorerie } from "@/components/tresorerie";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { api, type Page, type Schemas } from "@/lib/api/client";
import type { CompteEpargne } from "@/lib/epargne";
import { formatMontant } from "@/lib/format";
import { cleIdempotence } from "@/lib/identifiant";
import { useAction } from "@/lib/mutations";
import { useDevises } from "@/lib/referentiels";

/** Comptes non clos du membre : au plus un par devise. */
export function useComptesMembre(membreId: number | undefined) {
  return useQuery({
    queryKey: ["epargne", "comptes", { membre: membreId }],
    queryFn: () => api<Page<CompteEpargne>>("/api/epargne/comptes", { query: { membre: membreId } }),
    enabled: membreId !== undefined,
    select: (page) => page.results.filter((c) => c.statut !== "CLOS"),
  });
}

/** Premier dépôt minimum par devise, exigé pour activer un membre. */
export function useDepotsInitiaux() {
  return useQuery({
    queryKey: ["epargne", "depots-initiaux"],
    queryFn: () => api<Schemas["DepotsInitiaux"][]>("/api/epargne/comptes/depots-initiaux"),
    staleTime: 5 * 60_000,
  });
}

export function DialogueOuvertureCompte({
  membre: membreImpose,
  fermer,
  apres,
}: {
  membre?: MembreChoisi;
  fermer: () => void;
  apres?: (compte: CompteEpargne) => void;
}) {
  const [membre, setMembre] = useState<MembreChoisi | null>(membreImpose ?? null);
  const devises = useDevises();
  const comptes = useComptesMembre(membre?.id);
  const libres = (devises.data ?? [])
    .filter((d) => d.active && !(comptes.data ?? []).some((c) => c.devise === d.code))
    .map((d) => d.code);
  const [choix, setChoix] = useState("");
  const devise = libres.includes(choix) ? choix : (libres[0] ?? "");
  const ouvrir = useAction(
    () => api<CompteEpargne>("/api/epargne/comptes", { method: "POST", body: { membre: membre?.id, devise } }),
    {
      succes: "Compte d'épargne ouvert.",
      invalider: [["epargne"]],
      apres: (compte) => { fermer(); apres?.(compte); },
    },
  );

  return (
    <DialogContent className="sm:max-w-md">
      <form className="grid gap-4" onSubmit={(e) => { e.preventDefault(); ouvrir.mutate(); }}>
        <DialogHeader>
          <DialogTitle>Ouvrir un compte d&apos;épargne</DialogTitle>
          <DialogDescription>Un compte par devise au plus (CDF et USD), à la demande du membre.</DialogDescription>
        </DialogHeader>
        {!membreImpose && (
          <Champ label="Membre" htmlFor="membre-ouverture">
            <RechercheMembre id="membre-ouverture" valeur={membre} onChange={setMembre} statuts={["ACTIF", "PROSPECT"]} />
          </Champ>
        )}
        {membre && comptes.data && !libres.length ? (
          <Alert><AlertDescription>Ce membre a déjà un compte dans chaque devise.</AlertDescription></Alert>
        ) : (
          <Champ label="Devise" htmlFor="devise-ouverture">
            <ListeDeroulante id="devise-ouverture" value={devise} onChange={(e) => setChoix(e.target.value)}>
              {libres.map((code) => <option key={code} value={code}>{code}</option>)}
            </ListeDeroulante>
          </Champ>
        )}
        <DialogFooter>
          <Button type="button" variant="outline" onClick={fermer}>Annuler</Button>
          <Button type="submit" disabled={!membre || !devise || ouvrir.isPending}>Ouvrir le compte</Button>
        </DialogFooter>
      </form>
    </DialogContent>
  );
}

/** Dépôt au guichet pour un membre, dans la devise de son choix : le premier dépôt ouvre le compte. */
export function DialogueDepotMembre({
  membre,
  prospect,
  fermer,
}: {
  membre: MembreChoisi;
  prospect: boolean;
  fermer: () => void;
}) {
  const devises = useDevises();
  const comptes = useComptesMembre(membre.id);
  const minimums = useDepotsInitiaux();
  const tresorerie = useComptesTresorerie();
  const actives = (devises.data ?? []).filter((d) => d.active).map((d) => d.code);
  const [choix, setChoix] = useState("");
  const devise = actives.includes(choix) ? choix : (actives[0] ?? "");
  const compte = (comptes.data ?? []).find((c) => c.devise === devise);
  const minimum = minimums.data?.find((m) => m.devise === devise)?.montant;
  const [montant, setMontant] = useState("");
  const [cle] = useState(() => cleIdempotence());
  const caisse = tresorerie.options[0]?.numero ?? "";
  const deposer = useAction(
    () => api("/api/epargne/comptes/depot", {
      method: "POST",
      body: { membre: membre.id, devise, montant, compte_tresorerie: caisse, cle_idempotence: cle },
    }),
    { succes: "Dépôt enregistré.", invalider: [["epargne"], ["caisse"], ["membres"]], apres: fermer },
  );

  return (
    <DialogContent className="sm:max-w-md">
      <form className="grid gap-4" onSubmit={(e) => { e.preventDefault(); deposer.mutate(); }}>
        <DialogHeader>
          <DialogTitle>Dépôt – {membre.nom_complet}</DialogTitle>
          <DialogDescription>
            {compte
              ? `Compte ${compte.numero} · solde ${formatMontant(compte.solde, compte.devise)}`
              : `Premier dépôt en ${devise} : le compte sera ouvert à cette occasion.`}
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 sm:grid-cols-[8rem_1fr]">
          <Champ label="Devise" htmlFor="devise-depot">
            <ListeDeroulante id="devise-depot" value={devise} onChange={(e) => setChoix(e.target.value)}>
              {actives.map((code) => <option key={code} value={code}>{code}</option>)}
            </ListeDeroulante>
          </Champ>
          <Champ label="Montant" htmlFor="montant-depot"
            aide={prospect && minimum ? `Dépôt initial minimum pour l'activation : ${formatMontant(minimum, devise)}` : undefined}>
            <Input id="montant-depot" type="number" min="0.01" step="0.01" required autoFocus value={montant}
              onChange={(e) => setMontant(e.target.value)} />
          </Champ>
        </div>
        <CompteTresorerie valeur={caisse} onChange={() => undefined} options={tresorerie.options}
          sessionOuverte={!!tresorerie.session} />
        <DialogFooter>
          <Button type="button" variant="outline" onClick={fermer}>Annuler</Button>
          <Button type="submit" disabled={!caisse || !devise || deposer.isPending}>Enregistrer le dépôt</Button>
        </DialogFooter>
      </form>
    </DialogContent>
  );
}

export function DialogueOperationEpargne({
  compte,
  operation,
  fermer,
}: {
  compte: CompteEpargne;
  operation: "deposer" | "retirer";
  fermer: () => void;
}) {
  const depot = operation === "deposer";
  const tresorerie = useComptesTresorerie();
  const [choixCompte, setChoixCompte] = useState("");
  const compteTresorerie = choixCompte || tresorerie.options[0]?.numero || "";
  const [montant, setMontant] = useState("");
  // Une clé par formulaire affiché : un double clic ou un réseau instable ne fait pas payer deux fois.
  const [cle] = useState(() => cleIdempotence());
  const executer = useAction(
    () => api(`/api/epargne/comptes/${compte.id}/${operation}`, {
      method: "POST", body: { montant, compte_tresorerie: compteTresorerie, cle_idempotence: cle },
    }),
    { succes: depot ? "Dépôt enregistré." : "Retrait payé.", invalider: [["epargne"], ["caisse"]], apres: fermer },
  );

  return (
    <DialogContent className="sm:max-w-md">
      <form className="grid gap-4" onSubmit={(e) => { e.preventDefault(); executer.mutate(); }}>
        <DialogHeader>
          <DialogTitle>{depot ? "Dépôt" : "Retrait"} – {compte.numero}</DialogTitle>
          <DialogDescription>
            {compte.membre_nom} · {depot
              ? `solde ${formatMontant(compte.solde, compte.devise)}`
              : `disponible ${formatMontant(compte.disponible, compte.devise)}`}
            {!depot && Number(compte.bloque) > 0 && ` (${formatMontant(compte.bloque, compte.devise)} bloqués en garantie de crédit)`}
          </DialogDescription>
        </DialogHeader>
        <Champ label={`Montant (${compte.devise})`} htmlFor="montant-epargne">
          <Input id="montant-epargne" type="number" min="0.01" step="0.01" required autoFocus
            value={montant} onChange={(e) => setMontant(e.target.value)} />
        </Champ>
        <CompteTresorerie label={depot ? "Encaissé sur" : "Payé depuis"} valeur={compteTresorerie}
          onChange={setChoixCompte} options={tresorerie.options} sessionOuverte={!!tresorerie.session} />
        <DialogFooter>
          <Button type="button" variant="outline" onClick={fermer}>Annuler</Button>
          <Button type="submit" disabled={!compteTresorerie || executer.isPending}>
            {depot ? "Enregistrer le dépôt" : "Payer le retrait"}
          </Button>
        </DialogFooter>
      </form>
    </DialogContent>
  );
}
