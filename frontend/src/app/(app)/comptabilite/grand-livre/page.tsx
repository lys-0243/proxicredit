"use client";

import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";

import { Champ } from "@/components/champ";
import { ErreurApi } from "@/components/erreur-api";
import { LigneVide, LignesChargement } from "@/components/etat-vide";
import { ListeDeroulante } from "@/components/liste-deroulante";
import { Montant } from "@/components/montant";
import { PageHeader } from "@/components/page-header";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableFooter,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { api, type Schemas } from "@/lib/api/client";
import { formatDate, formatMontant } from "@/lib/format";
import { useComptes, useDevises } from "@/lib/referentiels";

function GrandLivre() {
  const parametres = useSearchParams();
  const devises = useDevises();
  const comptes = useComptes();
  const [filtres, setFiltres] = useState({
    compte: parametres.get("compte") ?? "",
    devise: parametres.get("devise") ?? "CDF",
    du: "",
    au: "",
  });
  const compteValide = comptes.data?.some((c) => c.numero === filtres.compte && c.est_mouvementable);

  const grandLivre = useQuery({
    queryKey: ["comptabilite", "grand-livre", filtres],
    queryFn: () => api<Schemas["GrandLivre"]>("/api/comptabilite/grand-livre", { query: filtres }),
    enabled: Boolean(compteValide),
  });
  const g = grandLivre.data;

  return (
    <>
      <PageHeader titre="Grand livre" description="Détail des mouvements d'un compte, avec le solde cumulé." />
      <div className="mb-4 flex flex-wrap items-end gap-3">
        <Champ label="Compte" htmlFor="compte" className="w-72">
          <Input id="compte" list="comptes" placeholder="N° de compte" value={filtres.compte}
            onChange={(e) => setFiltres({ ...filtres, compte: e.target.value })} />
          <datalist id="comptes">
            {comptes.data?.filter((c) => c.est_mouvementable).map((c) => (
              <option key={c.id} value={c.numero}>{c.libelle}</option>
            ))}
          </datalist>
        </Champ>
        <Champ label="Devise" htmlFor="devise">
          <ListeDeroulante id="devise" className="w-32" value={filtres.devise}
            onChange={(e) => setFiltres({ ...filtres, devise: e.target.value })}>
            {devises.data?.map((d) => <option key={d.code} value={d.code}>{d.code}</option>)}
          </ListeDeroulante>
        </Champ>
        <Champ label="Du" htmlFor="du">
          <Input id="du" type="date" value={filtres.du} onChange={(e) => setFiltres({ ...filtres, du: e.target.value })} />
        </Champ>
        <Champ label="Au" htmlFor="au">
          <Input id="au" type="date" value={filtres.au} onChange={(e) => setFiltres({ ...filtres, au: e.target.value })} />
        </Champ>
      </div>
      <ErreurApi erreur={grandLivre.error} />
      {!compteValide ? (
        <p className="py-10 text-center text-sm text-muted-foreground">
          Choisissez un compte mouvementable pour afficher ses mouvements.
        </p>
      ) : (
        <div className="carte-nue">
          {g && (
            <div className="border-b px-4 py-3 text-sm">
              <span className="font-mono font-medium">{g.compte}</span> {g.libelle}
            </div>
          )}
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Date</TableHead>
                <TableHead>Écriture</TableHead>
                <TableHead>Libellé</TableHead>
                <TableHead className="text-right">Débit</TableHead>
                <TableHead className="text-right">Crédit</TableHead>
                <TableHead className="text-right">Solde</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {grandLivre.isPending ? (
                <LignesChargement colonnes={6} />
              ) : (
                <>
                  {filtres.du && g && (
                    <TableRow className="text-muted-foreground">
                      <TableCell colSpan={5}>Report au {formatDate(filtres.du)}</TableCell>
                      <TableCell className="montant text-right">{formatMontant(g.report)}</TableCell>
                    </TableRow>
                  )}
                  {g?.mouvements.length ? (
                    g.mouvements.map((m, i) => (
                      <TableRow key={`${m.ecriture_id}-${i}`}>
                        <TableCell>{formatDate(m.date)}</TableCell>
                        <TableCell className="font-mono text-xs">
                          <Link className="hover:underline" href={`/comptabilite/ecritures/${m.ecriture_id}`}>
                            {m.numero}
                          </Link>
                        </TableCell>
                        <TableCell>{m.libelle}</TableCell>
                        <TableCell className="text-right"><Montant valeur={m.debit} /></TableCell>
                        <TableCell className="text-right"><Montant valeur={m.credit} /></TableCell>
                        <TableCell className="montant text-right">{formatMontant(m.solde)}</TableCell>
                      </TableRow>
                    ))
                  ) : (
                    <LigneVide colonnes={6} message="Aucun mouvement sur la période." />
                  )}
                </>
              )}
            </TableBody>
            {g && (
              <TableFooter>
                <TableRow className="font-semibold">
                  <TableCell colSpan={5}>
                    Solde final {Number(g.solde_final) >= 0 ? "débiteur" : "créditeur"}
                  </TableCell>
                  <TableCell className="montant text-right">
                    {formatMontant(g.solde_final.replace("-", ""), filtres.devise)}
                  </TableCell>
                </TableRow>
              </TableFooter>
            )}
          </Table>
        </div>
      )}
    </>
  );
}

export default function PageGrandLivre() {
  return (
    <Suspense>
      <GrandLivre />
    </Suspense>
  );
}
