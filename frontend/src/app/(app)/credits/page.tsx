"use client";

import { useQuery } from "@tanstack/react-query";
import { CalculatorIcon, ChevronLeftIcon, ChevronRightIcon, HandCoinsIcon, PlusIcon, SearchIcon } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { StatutCreditBadge } from "@/components/credits/communs";
import { LigneVide, LignesChargement } from "@/components/etat-vide";
import { ListeDeroulante } from "@/components/liste-deroulante";
import { Montant } from "@/components/montant";
import { PageHeader } from "@/components/page-header";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
import { STATUTS_CREDIT } from "@/lib/credits";
import { formatDate } from "@/lib/format";

export default function PageCredits() {
  const router = useRouter();
  const peutSaisir = usePermission("credits.add_credit");
  const [filtres, setFiltres] = useState({ search: "", statut: "" });
  const [page, setPage] = useState(1);
  const credits = useQuery({
    queryKey: ["credits", "dossiers", filtres, page],
    queryFn: () => api<Page<Schemas["CreditListe"]>>("/api/credits/dossiers", { query: { ...filtres, page } }),
  });
  const filtrer =
    (cle: keyof typeof filtres) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
      setFiltres({ ...filtres, [cle]: e.target.value });
      setPage(1);
    };

  return (
    <>
      <PageHeader
        titre="Crédits"
        description="Demandes et crédits des membres : saisie, analyse, comité, décaissement et remboursements."
        actions={
          <>
            <Link href="/credits/simulateur" className={buttonVariants({ variant: "outline" })}>
              <CalculatorIcon /> Simulateur
            </Link>
            {peutSaisir && (
              <Link href="/credits/nouvelle" className={buttonVariants()}>
                <PlusIcon /> Nouvelle demande
              </Link>
            )}
          </>
        }
      />
      <div className="mb-4 grid gap-3 sm:grid-cols-[1fr_auto]">
        <div className="relative">
          <SearchIcon className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input placeholder="Numéro de dossier, nom ou numéro du membre…" aria-label="Rechercher un crédit"
            className="pl-9" value={filtres.search} onChange={filtrer("search")} />
        </div>
        <ListeDeroulante aria-label="Statut" className="sm:w-56" value={filtres.statut} onChange={filtrer("statut")}>
          <option value="">Tous les statuts</option>
          {Object.entries(STATUTS_CREDIT).map(([code, libelle]) => <option key={code} value={code}>{libelle}</option>)}
        </ListeDeroulante>
      </div>
      <div className="carte-nue">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Dossier</TableHead>
              <TableHead>Membre</TableHead>
              <TableHead>Produit</TableHead>
              <TableHead className="text-right">Montant</TableHead>
              <TableHead>Statut</TableHead>
              <TableHead>Créé le</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {credits.isPending ? (
              <LignesChargement colonnes={6} />
            ) : credits.data?.results.length ? (
              credits.data.results.map((c) => (
                <TableRow key={c.id} className="cursor-pointer" onClick={() => router.push(`/credits/${c.id}`)}>
                  <TableCell className="font-mono text-xs text-muted-foreground">
                    <Link href={`/credits/${c.id}`} className="hover:text-primary hover:underline" onClick={(e) => e.stopPropagation()}>
                      {c.numero}
                    </Link>
                  </TableCell>
                  <TableCell>
                    <span className="font-semibold">{c.membre_nom}</span>
                    <span className="block font-mono text-xs text-muted-foreground">{c.membre_numero}</span>
                  </TableCell>
                  <TableCell className="text-sm">{c.produit_libelle}</TableCell>
                  <TableCell className="text-right"><Montant valeur={c.montant} devise={c.devise} /></TableCell>
                  <TableCell><StatutCreditBadge statut={c.statut} /></TableCell>
                  <TableCell className="text-sm">{formatDate(c.cree_le)}</TableCell>
                </TableRow>
              ))
            ) : (
              <LigneVide colonnes={6} icone={HandCoinsIcon} message="Aucun dossier de crédit." />
            )}
          </TableBody>
        </Table>
      </div>
      <div className="mt-4 flex items-center justify-end gap-1.5 text-sm">
        <span className="mr-auto text-muted-foreground">{credits.data ? `${credits.data.count} dossier(s)` : ""}</span>
        <span className="mr-2 text-muted-foreground">Page {page}</span>
        <Button variant="outline" size="icon-sm" aria-label="Page précédente" disabled={!credits.data?.previous}
          onClick={() => setPage(page - 1)}>
          <ChevronLeftIcon />
        </Button>
        <Button variant="outline" size="icon-sm" aria-label="Page suivante" disabled={!credits.data?.next}
          onClick={() => setPage(page + 1)}>
          <ChevronRightIcon />
        </Button>
      </div>
    </>
  );
}
