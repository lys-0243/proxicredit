"use client";

import { useQuery } from "@tanstack/react-query";
import { ChevronLeftIcon, ChevronRightIcon, PiggyBankIcon, PlusIcon, SearchIcon } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { DialogueOuvertureCompte } from "@/components/epargne/dialogues";
import { LigneVide, LignesChargement } from "@/components/etat-vide";
import { ListeDeroulante } from "@/components/liste-deroulante";
import { Montant } from "@/components/montant";
import { PageHeader } from "@/components/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { api, type Page } from "@/lib/api/client";
import { usePermission } from "@/lib/auth";
import { STATUTS_COMPTE_EPARGNE, VARIANTES_STATUT_COMPTE, type CompteEpargne } from "@/lib/epargne";
import { formatDate } from "@/lib/format";

export default function PageEpargne() {
  const router = useRouter();
  const peutOuvrir = usePermission("savings.add_compteepargne");
  const [ouverture, setOuverture] = useState(false);
  const [filtres, setFiltres] = useState({ search: "", statut: "" });
  const [page, setPage] = useState(1);
  const comptes = useQuery({
    queryKey: ["epargne", "comptes", filtres, page],
    queryFn: () => api<Page<CompteEpargne>>("/api/epargne/comptes", { query: { ...filtres, page } }),
  });
  const filtrer =
    (cle: keyof typeof filtres) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
      setFiltres({ ...filtres, [cle]: e.target.value });
      setPage(1);
    };

  return (
    <>
      <PageHeader
        titre="Épargne"
        description="Comptes d'épargne des membres : soldes, dépôts et retraits."
        actions={peutOuvrir && <Button onClick={() => setOuverture(true)}><PlusIcon /> Ouvrir un compte</Button>}
      />
      <div className="mb-4 grid gap-3 sm:grid-cols-[1fr_auto]">
        <div className="relative">
          <SearchIcon className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input placeholder="Numéro de compte, nom ou numéro du membre…" aria-label="Rechercher un compte"
            className="pl-9" value={filtres.search} onChange={filtrer("search")} />
        </div>
        <ListeDeroulante aria-label="Statut" className="sm:w-44" value={filtres.statut} onChange={filtrer("statut")}>
          <option value="">Tous les statuts</option>
          {Object.entries(STATUTS_COMPTE_EPARGNE).map(([code, libelle]) => (
            <option key={code} value={code}>{libelle}</option>
          ))}
        </ListeDeroulante>
      </div>
      <div className="carte-nue">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Compte</TableHead>
              <TableHead>Membre</TableHead>
              <TableHead>Produit</TableHead>
              <TableHead>Statut</TableHead>
              <TableHead className="text-right">Solde</TableHead>
              <TableHead>Ouvert le</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {comptes.isPending ? (
              <LignesChargement colonnes={6} />
            ) : comptes.data?.results.length ? (
              comptes.data.results.map((c) => (
                <TableRow key={c.id} className="cursor-pointer" onClick={() => router.push(`/epargne/${c.id}`)}>
                  <TableCell className="font-mono text-xs text-muted-foreground">
                    <Link href={`/epargne/${c.id}`} className="hover:text-primary hover:underline" onClick={(e) => e.stopPropagation()}>
                      {c.numero}
                    </Link>
                  </TableCell>
                  <TableCell>
                    <span className="font-semibold">{c.membre_nom}</span>
                    <span className="block font-mono text-xs text-muted-foreground">{c.membre_numero}</span>
                  </TableCell>
                  <TableCell className="text-sm">{c.produit_libelle}</TableCell>
                  <TableCell><Badge variant={VARIANTES_STATUT_COMPTE[c.statut]}>{STATUTS_COMPTE_EPARGNE[c.statut]}</Badge></TableCell>
                  <TableCell className="text-right"><Montant valeur={c.solde} devise={c.devise} /></TableCell>
                  <TableCell className="text-sm">{formatDate(c.date_ouverture)}</TableCell>
                </TableRow>
              ))
            ) : (
              <LigneVide colonnes={6} icone={PiggyBankIcon} message="Aucun compte d'épargne." />
            )}
          </TableBody>
        </Table>
      </div>
      <div className="mt-4 flex items-center justify-end gap-1.5 text-sm">
        <span className="mr-auto text-muted-foreground">{comptes.data ? `${comptes.data.count} compte(s)` : ""}</span>
        <span className="mr-2 text-muted-foreground">Page {page}</span>
        <Button variant="outline" size="icon-sm" aria-label="Page précédente" disabled={!comptes.data?.previous}
          onClick={() => setPage(page - 1)}>
          <ChevronLeftIcon />
        </Button>
        <Button variant="outline" size="icon-sm" aria-label="Page suivante" disabled={!comptes.data?.next}
          onClick={() => setPage(page + 1)}>
          <ChevronRightIcon />
        </Button>
      </div>
      <Dialog open={ouverture} onOpenChange={setOuverture}>
        {ouverture && (
          <DialogueOuvertureCompte fermer={() => setOuverture(false)} apres={(c) => router.push(`/epargne/${c.id}`)} />
        )}
      </Dialog>
    </>
  );
}
