"use client";

import { useQuery } from "@tanstack/react-query";
import { UserPlusIcon } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { LigneVide, LignesChargement } from "@/components/etat-vide";
import { ListeDeroulante } from "@/components/liste-deroulante";
import { StatutMembreBadge } from "@/components/membres/statut-membre";
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
import { STATUTS_MEMBRE, TYPES_MEMBRE } from "@/lib/membres";

export default function PageMembres() {
  const router = useRouter();
  const peutCreer = usePermission("members.add_membre");
  const [filtres, setFiltres] = useState({ search: "", type: "", statut: "" });
  const [page, setPage] = useState(1);

  const membres = useQuery({
    queryKey: ["membres", filtres, page],
    queryFn: () => api<Page<Schemas["MembreListe"]>>("/api/membres", { query: { ...filtres, page } }),
  });
  const filtrer =
    (cle: keyof typeof filtres) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
      setFiltres({ ...filtres, [cle]: e.target.value });
      setPage(1);
    };

  return (
    <>
      <PageHeader
        titre="Membres"
        description="Dossiers des membres de l'agence : identité, KYC, adhésion et parts sociales."
        actions={
          peutCreer && (
            <Link href="/membres/nouveau" className={buttonVariants()}>
              <UserPlusIcon /> Nouveau membre
            </Link>
          )
        }
      />
      <div className="mb-4 grid gap-3 sm:grid-cols-[1fr_auto_auto]">
        <Input
          placeholder="Nom, numéro de membre, téléphone, n° de pièce, RCCM…"
          value={filtres.search}
          onChange={filtrer("search")}
        />
        <ListeDeroulante aria-label="Type" className="sm:w-48" value={filtres.type} onChange={filtrer("type")}>
          <option value="">Tous les types</option>
          {Object.entries(TYPES_MEMBRE).map(([code, libelle]) => (
            <option key={code} value={code}>{libelle}</option>
          ))}
        </ListeDeroulante>
        <ListeDeroulante aria-label="Statut" className="sm:w-44" value={filtres.statut} onChange={filtrer("statut")}>
          <option value="">Tous les statuts</option>
          {Object.entries(STATUTS_MEMBRE).map(([code, libelle]) => (
            <option key={code} value={code}>{libelle}</option>
          ))}
        </ListeDeroulante>
      </div>
      <div className="rounded-xl border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Numéro</TableHead>
              <TableHead>Nom</TableHead>
              <TableHead>Type</TableHead>
              <TableHead>Téléphone</TableHead>
              <TableHead>Statut</TableHead>
              <TableHead>Créé le</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {membres.isPending ? (
              <LignesChargement colonnes={6} />
            ) : membres.data?.results.length ? (
              membres.data.results.map((m) => (
                <TableRow key={m.id} className="cursor-pointer" onClick={() => router.push(`/membres/${m.id}`)}>
                  <TableCell className="font-mono text-xs">
                    <Link href={`/membres/${m.id}`} onClick={(e) => e.stopPropagation()}>
                      {m.numero}
                    </Link>
                  </TableCell>
                  <TableCell className="font-medium">{m.nom_complet}</TableCell>
                  <TableCell className="text-sm">{TYPES_MEMBRE[m.type]}</TableCell>
                  <TableCell className="text-sm">{m.telephone}</TableCell>
                  <TableCell><StatutMembreBadge statut={m.statut} listeNoire={m.en_liste_noire} /></TableCell>
                  <TableCell className="text-sm">{formatDate(m.cree_le)}</TableCell>
                </TableRow>
              ))
            ) : (
              <LigneVide colonnes={6} message="Aucun membre ne correspond à la recherche." />
            )}
          </TableBody>
        </Table>
      </div>
      <div className="mt-4 flex items-center justify-end gap-2">
        <span className="mr-auto text-sm text-muted-foreground">
          {membres.data ? `${membres.data.count} membre(s)` : ""}
        </span>
        <Button variant="outline" size="sm" disabled={!membres.data?.previous} onClick={() => setPage(page - 1)}>
          Précédent
        </Button>
        <span className="text-sm text-muted-foreground">Page {page}</span>
        <Button variant="outline" size="sm" disabled={!membres.data?.next} onClick={() => setPage(page + 1)}>
          Suivant
        </Button>
      </div>
    </>
  );
}
