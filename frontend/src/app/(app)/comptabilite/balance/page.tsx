"use client";

import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { Fragment, useState } from "react";

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
import { useDevises } from "@/lib/referentiels";

type Totaux = Schemas["TotauxBalance"];

function CellulesTotaux({ t, devise }: { t: Totaux; devise?: string }) {
  return (
    <>
      <TableCell className="text-right"><Montant valeur={t.debit} devise={devise} /></TableCell>
      <TableCell className="text-right"><Montant valeur={t.credit} devise={devise} /></TableCell>
      <TableCell className="text-right"><Montant valeur={t.solde_debiteur} devise={devise} /></TableCell>
      <TableCell className="text-right"><Montant valeur={t.solde_crediteur} devise={devise} /></TableCell>
    </>
  );
}

export default function PageBalance() {
  const devises = useDevises();
  const [filtres, setFiltres] = useState({ devise: "CDF", du: "", au: "" });
  const balance = useQuery({
    queryKey: ["comptabilite", "balance", filtres],
    queryFn: () => api<Schemas["Balance"]>("/api/comptabilite/balance", { query: filtres }),
  });
  const donnees = balance.data;
  const equilibree = donnees && donnees.total.debit === donnees.total.credit;

  return (
    <>
      <PageHeader
        titre="Balance générale"
        description="Mouvements et soldes par compte, dans une devise. Les totaux sont calculés par le serveur."
      />
      <div className="mb-4 flex flex-wrap items-end gap-3">
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
        {donnees && donnees.lignes.length > 0 && (
          <p className={equilibree ? "text-sm text-muted-foreground" : "text-sm font-medium text-destructive"}>
            {equilibree ? "Balance équilibrée." : "Attention : balance déséquilibrée."}
          </p>
        )}
      </div>
      <ErreurApi erreur={balance.error} />
      <div className="carte-nue">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Compte</TableHead>
              <TableHead className="text-right">Débit</TableHead>
              <TableHead className="text-right">Crédit</TableHead>
              <TableHead className="text-right">Solde débiteur</TableHead>
              <TableHead className="text-right">Solde créditeur</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {balance.isPending ? (
              <LignesChargement colonnes={5} />
            ) : donnees?.lignes.length ? (
              donnees.classes.map((classe) => (
                <Fragment key={classe.classe}>
                  {donnees.lignes
                    .filter((l) => l.classe === classe.classe)
                    .map((l) => (
                      <TableRow key={l.compte}>
                        <TableCell>
                          <Link
                            className="font-mono hover:underline"
                            href={`/comptabilite/grand-livre?compte=${l.compte}&devise=${filtres.devise}`}
                          >
                            {l.compte}
                          </Link>{" "}
                          <span className="text-muted-foreground">{l.libelle}</span>
                        </TableCell>
                        <CellulesTotaux t={l} />
                      </TableRow>
                    ))}
                  <TableRow className="bg-muted/40 font-bold hover:bg-muted/40">
                    <TableCell>Total classe {classe.classe}</TableCell>
                    <CellulesTotaux t={classe} />
                  </TableRow>
                </Fragment>
              ))
            ) : (
              <LigneVide colonnes={5} message="Aucun mouvement sur la période." />
            )}
          </TableBody>
          {donnees && donnees.lignes.length > 0 && (
            <TableFooter>
              <TableRow className="font-semibold">
                <TableCell>Total général</TableCell>
                <CellulesTotaux t={donnees.total} devise={filtres.devise} />
              </TableRow>
            </TableFooter>
          )}
        </Table>
      </div>
    </>
  );
}
