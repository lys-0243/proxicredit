"use client";

import { useQuery } from "@tanstack/react-query";
import { PlusIcon } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { StatutEcriture, TYPES_OPERATION } from "@/components/comptabilite/statut-ecriture";
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
import { formatDate } from "@/lib/format";
import { useJournaux } from "@/lib/referentiels";

const FILTRES_VIDES = { statut: "", journal: "", devise: "", du: "", au: "", search: "" };

export default function PageEcritures() {
  const router = useRouter();
  const peutSaisir = usePermission("accounting.add_ecriture");
  const journaux = useJournaux();
  const [filtres, setFiltres] = useState(FILTRES_VIDES);
  const [page, setPage] = useState(1);

  const ecritures = useQuery({
    queryKey: ["comptabilite", "ecritures", filtres, page],
    queryFn: () =>
      api<Page<Schemas["Ecriture"]>>("/api/comptabilite/ecritures", { query: { ...filtres, page } }),
  });
  const filtrer = (cle: keyof typeof FILTRES_VIDES) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    setFiltres({ ...filtres, [cle]: e.target.value });
    setPage(1);
  };

  return (
    <>
      <PageHeader
        titre="Écritures comptables"
        description="Une écriture validée est immuable : une erreur se corrige par contre-passation."
        actions={
          peutSaisir && (
            <Link href="/comptabilite/ecritures/nouvelle" className={buttonVariants()}>
              <PlusIcon /> Nouvelle saisie
            </Link>
          )
        }
      />
      <div className="mb-4 grid gap-3 sm:grid-cols-3 lg:grid-cols-6">
        <Input placeholder="N°, libellé, pièce…" value={filtres.search} onChange={filtrer("search")} />
        <ListeDeroulante aria-label="Statut" value={filtres.statut} onChange={filtrer("statut")}>
          <option value="">Tous les statuts</option>
          <option value="BROUILLON">Brouillons</option>
          <option value="VALIDEE">Validées</option>
        </ListeDeroulante>
        <ListeDeroulante aria-label="Journal" value={filtres.journal} onChange={filtrer("journal")}>
          <option value="">Tous les journaux</option>
          {journaux.data?.map((j) => <option key={j.id} value={j.id}>{j.code} – {j.libelle}</option>)}
        </ListeDeroulante>
        <ListeDeroulante aria-label="Devise" value={filtres.devise} onChange={filtrer("devise")}>
          <option value="">Toutes devises</option>
          <option value="CDF">CDF</option>
          <option value="USD">USD</option>
        </ListeDeroulante>
        <Input type="date" aria-label="Du" value={filtres.du} onChange={filtrer("du")} />
        <Input type="date" aria-label="Au" value={filtres.au} onChange={filtrer("au")} />
      </div>
      <div className="rounded-xl border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Date</TableHead>
              <TableHead>Numéro</TableHead>
              <TableHead>Libellé</TableHead>
              <TableHead>Type</TableHead>
              <TableHead className="text-right">Montant</TableHead>
              <TableHead>Statut</TableHead>
              <TableHead>Saisie par</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {ecritures.isPending ? (
              <LignesChargement colonnes={7} />
            ) : ecritures.data?.results.length ? (
              ecritures.data.results.map((e) => (
                <TableRow
                  key={e.id}
                  className="cursor-pointer"
                  onClick={() => router.push(`/comptabilite/ecritures/${e.id}`)}
                >
                  <TableCell>{formatDate(e.date_comptable) || "—"}</TableCell>
                  <TableCell className="font-mono text-xs">
                    <Link href={`/comptabilite/ecritures/${e.id}`} onClick={(ev) => ev.stopPropagation()}>
                      {e.numero ?? `Brouillon #${e.id}`}
                    </Link>
                  </TableCell>
                  <TableCell className="max-w-80 truncate">{e.libelle}</TableCell>
                  <TableCell className="text-xs">{TYPES_OPERATION[e.type_operation] ?? e.type_operation}</TableCell>
                  <TableCell className="text-right"><Montant valeur={e.total} devise={e.devise} /></TableCell>
                  <TableCell><StatutEcriture statut={e.statut} contrePassee={e.contre_passee_par !== null} /></TableCell>
                  <TableCell className="text-sm">{e.cree_par}</TableCell>
                </TableRow>
              ))
            ) : (
              <LigneVide colonnes={7} message="Aucune écriture." />
            )}
          </TableBody>
        </Table>
      </div>
      <div className="mt-4 flex items-center justify-end gap-2">
        <span className="mr-auto text-sm text-muted-foreground">
          {ecritures.data ? `${ecritures.data.count} écriture(s)` : ""}
        </span>
        <Button variant="outline" size="sm" disabled={!ecritures.data?.previous} onClick={() => setPage(page - 1)}>
          Précédent
        </Button>
        <span className="text-sm text-muted-foreground">Page {page}</span>
        <Button variant="outline" size="sm" disabled={!ecritures.data?.next} onClick={() => setPage(page + 1)}>
          Suivant
        </Button>
      </div>
    </>
  );
}
