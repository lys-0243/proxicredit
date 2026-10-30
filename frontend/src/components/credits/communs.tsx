"use client";

import { useMutation, useQuery } from "@tanstack/react-query";
import { CalculatorIcon } from "lucide-react";

import { Montant } from "@/components/montant";
import { StatCard } from "@/components/stat-card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { api, type Schemas } from "@/lib/api/client";
import {
  PERIODICITES,
  STATUTS_CREDIT,
  VARIANTES_STATUT_CREDIT,
  formatPourcentage,
  type StatutCredit,
} from "@/lib/credits";
import { formatDate, formatMontant } from "@/lib/format";

export type ProduitCredit = Schemas["ProduitCredit"];

export function StatutCreditBadge({ statut }: { statut: StatutCredit }) {
  return <Badge variant={VARIANTES_STATUT_CREDIT[statut]}>{STATUTS_CREDIT[statut]}</Badge>;
}

export function useProduitsCredit() {
  return useQuery({
    queryKey: ["credits", "produits"],
    queryFn: () => api<ProduitCredit[]>("/api/credits/produits", { query: { actif: true } }),
    staleTime: 5 * 60_000,
  });
}

/** Conditions du produit dans la devise choisie (aide à la saisie). */
export function ConditionsProduit({ produit, devise }: { produit: ProduitCredit; devise: string }) {
  const plafond = produit.plafonds.find((p) => p.devise === devise);
  return (
    <p className="text-xs text-muted-foreground">
      {formatPourcentage(produit.taux_interet)} par période ({PERIODICITES[produit.periodicite ?? "MENSUELLE"].toLowerCase()}) ·{" "}
      {produit.duree_min} à {produit.duree_max} échéances
      {plafond && ` · de ${formatMontant(plafond.montant_min)} à ${formatMontant(plafond.montant_max, devise)}`} ·
      frais de dossier {formatPourcentage(produit.frais_dossier_taux)} · épargne déjà déposée exigée{" "}
      {formatPourcentage(produit.epargne_garantie_taux)}
    </p>
  );
}

export function TableauEcheancier({
  lignes,
  devise,
}: {
  lignes: Schemas["LigneEcheancier"][];
  devise: string;
}) {
  return (
    <div className="carte-nue">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>N°</TableHead>
            <TableHead>Date</TableHead>
            <TableHead className="text-right">Capital</TableHead>
            <TableHead className="text-right">Intérêt</TableHead>
            <TableHead className="text-right">Échéance</TableHead>
            <TableHead className="text-right">Capital restant</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {lignes.map((l) => (
            <TableRow key={l.numero}>
              <TableCell>{l.numero}</TableCell>
              <TableCell>{formatDate(l.date)}</TableCell>
              <TableCell className="text-right"><Montant valeur={l.capital} /></TableCell>
              <TableCell className="text-right"><Montant valeur={l.interet} /></TableCell>
              <TableCell className="text-right font-semibold"><Montant valeur={l.total} devise={devise} /></TableCell>
              <TableCell className="text-right"><Montant valeur={l.capital_restant} /></TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

/** Échéancier indicatif calculé par le serveur, sans rien enregistrer. */
export function ApercuSimulation({
  produit,
  devise,
  montant,
  duree,
}: {
  produit: number | null;
  devise: string;
  montant: string;
  duree: number;
}) {
  const simulation = useMutation({
    mutationFn: () =>
      api<Schemas["Simulation"]>("/api/credits/produits/simuler", {
        method: "POST",
        body: { produit, devise, montant, duree },
      }),
  });
  const s = simulation.data;
  return (
    <div className="grid gap-4">
      <Button type="button" variant="outline" className="w-fit" disabled={!produit || !montant || simulation.isPending}
        onClick={() => simulation.mutate()}>
        <CalculatorIcon /> Calculer l&apos;échéancier
      </Button>
      {simulation.error && (
        <Alert variant="destructive"><AlertDescription>{simulation.error.message}</AlertDescription></Alert>
      )}
      {s && (
        <>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <StatCard titre="Échéance" valeur={<Montant valeur={s.lignes[0]?.total} devise={devise} />}
              detail={`${s.lignes.length} échéance(s), première le ${formatDate(s.lignes[0]?.date)}`} />
            <StatCard titre="Coût des intérêts" ton="neutre" valeur={<Montant valeur={s.total_interets} devise={devise} />} />
            <StatCard titre="Montant versé" ton="success" valeur={<Montant valeur={s.montant_net} devise={devise} />}
              detail={`Après ${formatMontant(s.frais_dossier, devise)} de frais de dossier`} />
            <StatCard titre="Épargne exigée" ton="warning" valeur={<Montant valeur={s.epargne_garantie} devise={devise} />}
              detail="Déjà déposée avant la demande, bloquée pendant le crédit" />
          </div>
          <TableauEcheancier lignes={s.lignes} devise={devise} />
        </>
      )}
    </div>
  );
}
