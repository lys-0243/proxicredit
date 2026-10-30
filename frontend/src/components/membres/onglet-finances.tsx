"use client";

import { useQuery } from "@tanstack/react-query";
import { ArrowDownLeftIcon, HandCoinsIcon, PiggyBankIcon, PlusIcon } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { StatutCreditBadge } from "@/components/credits/communs";
import { DialogueDepotMembre, DialogueOuvertureCompte, useDepotsInitiaux } from "@/components/epargne/dialogues";
import { LigneVide, LignesChargement } from "@/components/etat-vide";
import { Montant } from "@/components/montant";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { api, type Page, type Schemas } from "@/lib/api/client";
import { usePermission } from "@/lib/auth";
import { STATUTS_COMPTE_EPARGNE, VARIANTES_STATUT_COMPTE, type CompteEpargne } from "@/lib/epargne";
import { formatDate, formatMontant } from "@/lib/format";
import type { Membre } from "@/lib/membres";

export function OngletEpargne({ membre }: { membre: Membre }) {
  const router = useRouter();
  // Le premier dépôt se fait dès le dossier créé : c'est une condition de l'activation.
  const ouvert = (membre.statut === "ACTIF" || membre.statut === "PROSPECT") && !membre.en_liste_noire;
  const peutOuvrir = usePermission("savings.add_compteepargne") && ouvert;
  const peutDeposer = usePermission("savings.deposer_epargne") && ouvert;
  const [dialogue, setDialogue] = useState<"ouverture" | "depot" | null>(null);
  const minimums = useDepotsInitiaux();
  const comptes = useQuery({
    queryKey: ["epargne", "comptes", { membre: membre.id }],
    queryFn: () => api<Page<CompteEpargne>>("/api/epargne/comptes", { query: { membre: membre.id } }),
  });
  const choisi = { id: membre.id, numero: membre.numero, nom_complet: membre.nom_complet };
  const fermer = () => setDialogue(null);

  return (
    <div className="grid gap-4">
      {membre.statut === "PROSPECT" && minimums.data && (
        <Alert>
          <AlertDescription>
            Pour activer le membre, un premier dépôt d&apos;au moins{" "}
            {minimums.data.map((m) => formatMontant(m.montant, m.devise)).join(" ou ")} est exigé.
          </AlertDescription>
        </Alert>
      )}
      {(peutDeposer || peutOuvrir) && (
        <div className="flex flex-wrap gap-2">
          {peutDeposer && (
            <Button onClick={() => setDialogue("depot")}><ArrowDownLeftIcon /> Dépôt</Button>
          )}
          {peutOuvrir && (
            <Button variant="outline" onClick={() => setDialogue("ouverture")}><PlusIcon /> Ouvrir un compte</Button>
          )}
        </div>
      )}
      <div className="carte-nue">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Compte</TableHead>
              <TableHead>Produit</TableHead>
              <TableHead>Statut</TableHead>
              <TableHead className="text-right">Solde</TableHead>
              <TableHead>Ouvert le</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {comptes.isPending ? (
              <LignesChargement colonnes={5} lignes={2} />
            ) : comptes.data?.results.length ? (
              comptes.data.results.map((c) => (
                <TableRow key={c.id} className="cursor-pointer" onClick={() => router.push(`/epargne/${c.id}`)}>
                  <TableCell className="font-mono text-xs">
                    <Link href={`/epargne/${c.id}`} className="hover:text-primary hover:underline">{c.numero}</Link>
                  </TableCell>
                  <TableCell className="text-sm">{c.produit_libelle}</TableCell>
                  <TableCell><Badge variant={VARIANTES_STATUT_COMPTE[c.statut]}>{STATUTS_COMPTE_EPARGNE[c.statut]}</Badge></TableCell>
                  <TableCell className="text-right"><Montant valeur={c.solde} devise={c.devise} /></TableCell>
                  <TableCell className="text-sm">{formatDate(c.date_ouverture)}</TableCell>
                </TableRow>
              ))
            ) : (
              <LigneVide colonnes={5} icone={PiggyBankIcon} message="Aucun compte d'épargne." />
            )}
          </TableBody>
        </Table>
      </div>
      <Dialog open={dialogue !== null} onOpenChange={(o) => !o && fermer()}>
        {dialogue === "ouverture" && <DialogueOuvertureCompte membre={choisi} fermer={fermer} />}
        {dialogue === "depot" && (
          <DialogueDepotMembre membre={choisi} prospect={membre.statut === "PROSPECT"} fermer={fermer} />
        )}
      </Dialog>
    </div>
  );
}

export function OngletCredits({ membre }: { membre: Membre }) {
  const router = useRouter();
  const peutSaisir = usePermission("credits.add_credit") && membre.statut === "ACTIF";
  const credits = useQuery({
    queryKey: ["credits", "dossiers", { membre: membre.id }],
    queryFn: () => api<Page<Schemas["CreditListe"]>>("/api/credits/dossiers", { query: { membre: membre.id } }),
  });

  return (
    <div className="grid gap-4">
      {peutSaisir && (
        <Link href={`/credits/nouvelle?membre=${membre.id}`} className={buttonVariants({ className: "w-fit" })}>
          <PlusIcon /> Nouvelle demande de crédit
        </Link>
      )}
      <div className="carte-nue">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Dossier</TableHead>
              <TableHead>Produit</TableHead>
              <TableHead className="text-right">Montant</TableHead>
              <TableHead>Statut</TableHead>
              <TableHead>Décaissé le</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {credits.isPending ? (
              <LignesChargement colonnes={5} lignes={2} />
            ) : credits.data?.results.length ? (
              credits.data.results.map((c) => (
                <TableRow key={c.id} className="cursor-pointer" onClick={() => router.push(`/credits/${c.id}`)}>
                  <TableCell className="font-mono text-xs">
                    <Link href={`/credits/${c.id}`} className="hover:text-primary hover:underline">{c.numero}</Link>
                  </TableCell>
                  <TableCell className="text-sm">{c.produit_libelle}</TableCell>
                  <TableCell className="text-right"><Montant valeur={c.montant} devise={c.devise} /></TableCell>
                  <TableCell><StatutCreditBadge statut={c.statut} /></TableCell>
                  <TableCell className="text-sm">{formatDate(c.date_decaissement)}</TableCell>
                </TableRow>
              ))
            ) : (
              <LigneVide colonnes={5} icone={HandCoinsIcon} message="Aucun crédit." />
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
