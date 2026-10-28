"use client";

import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { useState } from "react";

import { Champ } from "@/components/champ";
import { LigneVide, LignesChargement } from "@/components/etat-vide";
import { ListeDeroulante } from "@/components/liste-deroulante";
import { Montant } from "@/components/montant";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { api, type Schemas } from "@/lib/api/client";
import { useMoi, usePermission } from "@/lib/auth";
import { formatDate, formatMontant } from "@/lib/format";
import { dossierClos, type Membre } from "@/lib/membres";
import { useAction } from "@/lib/mutations";
import { useComptes } from "@/lib/referentiels";
import { cleIdempotence } from "@/lib/identifiant";

/** Montant = valeur × quantité, calculé en centimes entiers (jamais en float). */
function multiplier(valeur: string, quantite: number): string {
  const [entier, decimales = ""] = valeur.split(".");
  const centimes = (BigInt(entier) * 100n + BigInt(decimales.padEnd(2, "0").slice(0, 2))) * BigInt(quantite);
  return `${centimes / 100n}.${String(centimes % 100n).padStart(2, "0")}`;
}

function additionner(a: string, b: string): string {
  const enCentimes = (v: string) => {
    const [e, d = ""] = v.split(".");
    return BigInt(e) * 100n + BigInt(d.padEnd(2, "0").slice(0, 2));
  };
  const total = enCentimes(a) + enCentimes(b);
  return `${total / 100n}.${String(total % 100n).padStart(2, "0")}`;
}

/** Numéro d'écriture, cliquable seulement pour qui peut consulter la comptabilité. */
function LienEcriture({ id, numero }: { id: number; numero: string }) {
  const voitEcritures = usePermission("accounting.view_ecriture");
  if (!voitEcritures) return <>{numero}</>;
  return (
    <Link className="underline-offset-2 hover:underline" href={`/comptabilite/ecritures/${id}`}>
      {numero}
    </Link>
  );
}

function CompteTresorerie({ valeur, onChange }: { valeur: string; onChange: (v: string) => void }) {
  const comptes = useComptes();
  // Banques (52), mobile money (55) et caisses (57) : mêmes comptes que ceux acceptés par l'API.
  const tresorerie = (comptes.data ?? []).filter(
    (c) => /^5[257]/.test(c.numero) && c.est_mouvementable && c.actif,
  );
  return (
    <Champ label="Encaissé sur" htmlFor="compte-tresorerie"
      aide="En attendant le module caisse, choisissez la caisse ou le compte Mobile Money qui reçoit l'argent.">
      <ListeDeroulante id="compte-tresorerie" value={valeur} onChange={(e) => onChange(e.target.value)}>
        {tresorerie.map((c) => <option key={c.id} value={c.numero}>{c.numero} – {c.libelle}</option>)}
      </ListeDeroulante>
    </Champ>
  );
}

export function OngletAdhesion({ membre }: { membre: Membre }) {
  const { data: moi } = useMoi();
  const peutEncaisser = usePermission("members.encaisser_adhesion") && !dossierClos(membre.statut);
  const [nombre, setNombre] = useState(1);
  const [compte, setCompte] = useState("5712");
  // Une clé par formulaire affiché : un double clic ou un réseau instable ne fait pas payer deux fois.
  const [cle, setCle] = useState(() => cleIdempotence());

  const conditions = useQuery({
    queryKey: ["membres", "conditions-adhesion"],
    queryFn: () => api<Schemas["ConditionsAdhesion"]>("/api/membres/conditions-adhesion"),
  });
  const mouvements = useQuery({
    queryKey: ["membres", String(membre.id), "parts"],
    queryFn: () => api<Schemas["MouvementParts"][]>(`/api/membres/${membre.id}/parts-sociales`),
  });
  const apres = () => {
    setCle(cleIdempotence());
    setNombre(1);
  };
  const encaisserAdhesion = useAction(
    () => api(`/api/membres/${membre.id}/adhesion`, {
      method: "POST", body: { nombre_parts: nombre, compte_tresorerie: compte, cle_idempotence: cle },
    }),
    { succes: "Adhésion encaissée et comptabilisée.", invalider: [["membres", String(membre.id)], ["membres"]], apres },
  );
  const souscrire = useAction(
    () => api(`/api/membres/${membre.id}/parts-sociales`, {
      method: "POST", body: { nombre, compte_tresorerie: compte, cle_idempotence: cle },
    }),
    { succes: "Parts sociales encaissées.", invalider: [["membres", String(membre.id)]], apres },
  );

  const c = conditions.data;
  const adhesion = membre.adhesion;
  const journeeFermee = !moi?.date_comptable;
  const montantParts = c ? multiplier(c.valeur_part, nombre) : "0.00";
  const aPayer = c ? (adhesion ? montantParts : additionner(c.frais, montantParts)) : "0.00";
  const action = adhesion ? souscrire : encaisserAdhesion;

  return (
    <div className="grid gap-4 xl:grid-cols-2">
      <Card>
        <CardHeader>
          <CardTitle>Adhésion</CardTitle>
          <CardDescription>
            {c && `Frais d'adhésion ${formatMontant(c.frais, c.devise)} · part sociale ${formatMontant(c.valeur_part, c.devise)} · minimum ${c.parts_minimum} part(s)`}
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-2 text-sm">
          {adhesion ? (
            <p>
              Payée le <strong>{formatDate(adhesion.date_comptable)}</strong> ({formatMontant(adhesion.frais, adhesion.devise)}),
              encaissée par {adhesion.encaisse_par} — écriture{" "}
              <LienEcriture id={adhesion.ecriture} numero={adhesion.ecriture_numero} />.
            </p>
          ) : (
            <p className="text-muted-foreground">Adhésion non payée.</p>
          )}
          <p>
            Parts sociales détenues : <strong>{membre.nombre_parts}</strong>
            {c && membre.nombre_parts > 0 && ` (${formatMontant(multiplier(c.valeur_part, membre.nombre_parts), c.devise)})`}
          </p>
        </CardContent>
      </Card>

      {peutEncaisser && c && (
        <Card>
          <CardHeader>
            <CardTitle>{adhesion ? "Souscrire des parts supplémentaires" : "Encaisser l'adhésion"}</CardTitle>
          </CardHeader>
          <CardContent>
            {journeeFermee ? (
              <Alert><AlertDescription>Aucune journée comptable ouverte : encaissement impossible.</AlertDescription></Alert>
            ) : membre.en_liste_noire ? (
              <Alert variant="destructive"><AlertDescription>Membre sur liste noire : encaissement refusé.</AlertDescription></Alert>
            ) : (
              <form className="grid gap-4" onSubmit={(e) => { e.preventDefault(); action.mutate(); }}>
                <div className="grid gap-4 sm:grid-cols-2">
                  <Champ label="Nombre de parts" htmlFor="nombre-parts">
                    <Input id="nombre-parts" type="number" required min={adhesion ? 1 : c.parts_minimum}
                      value={nombre} onChange={(e) => setNombre(Math.max(1, Number(e.target.value) || 1))} />
                  </Champ>
                  <CompteTresorerie valeur={compte} onChange={setCompte} />
                </div>
                <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border-soft bg-muted/40 px-4 py-3 text-sm">
                  <span>
                    {adhesion ? "" : `Frais ${formatMontant(c.frais)} + `}
                    {nombre} part(s) {formatMontant(montantParts)}
                  </span>
                  <strong className="montant">À encaisser : {formatMontant(aPayer, c.devise)}</strong>
                </div>
                <Button type="submit" className="w-fit" disabled={action.isPending}>
                  Encaisser {formatMontant(aPayer, c.devise)}
                </Button>
              </form>
            )}
          </CardContent>
        </Card>
      )}

      <div className="carte-nue xl:col-span-2">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Date</TableHead>
              <TableHead>Mouvement</TableHead>
              <TableHead className="text-right">Parts</TableHead>
              <TableHead className="text-right">Montant</TableHead>
              <TableHead>Écriture</TableHead>
              <TableHead>Par</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {mouvements.isPending ? (
              <LignesChargement colonnes={6} lignes={2} />
            ) : mouvements.data?.length ? (
              mouvements.data.map((m) => (
                <TableRow key={m.id}>
                  <TableCell>{formatDate(m.date_comptable)}</TableCell>
                  <TableCell>{m.type === "SOUSCRIPTION" ? "Souscription" : "Remboursement"}</TableCell>
                  <TableCell className="text-right">{m.nombre}</TableCell>
                  <TableCell className="text-right"><Montant valeur={m.montant} devise={m.devise} /></TableCell>
                  <TableCell className="font-mono text-xs">
                    <LienEcriture id={m.ecriture} numero={m.ecriture_numero} />
                  </TableCell>
                  <TableCell className="text-sm">{m.cree_par}</TableCell>
                </TableRow>
              ))
            ) : (
              <LigneVide colonnes={6} message="Aucune part sociale souscrite." />
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
