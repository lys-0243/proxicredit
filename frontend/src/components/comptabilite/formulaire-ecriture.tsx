"use client";

import { PlusIcon, Trash2Icon } from "lucide-react";
import { useState } from "react";

import { Champ } from "@/components/champ";
import { ErreurApi } from "@/components/erreur-api";
import { ListeDeroulante } from "@/components/liste-deroulante";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
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
import { ApiError } from "@/lib/api/client";
import { formatMontant } from "@/lib/format";
import { useComptes, useDevises, useJournaux } from "@/lib/referentiels";

export type LigneFormulaire = { compte: string; libelle: string; debit: string; credit: string };
export type ValeursEcriture = {
  journal: string;
  devise: string;
  libelle: string;
  reference: string;
  lignes: LigneFormulaire[];
};

const LIGNE_VIDE: LigneFormulaire = { compte: "", libelle: "", debit: "", credit: "" };

/** Montant saisi → centimes entiers (BigInt). null si la saisie n'est pas un montant valide. */
function enCentimes(saisie: string): bigint | null {
  const texte = saisie.trim().replace(/\s/g, "").replace(",", ".");
  if (!texte) return 0n;
  if (!/^\d+(\.\d{0,2})?$/.test(texte)) return null;
  const [entier, decimales = ""] = texte.split(".");
  return BigInt(entier) * 100n + BigInt(decimales.padEnd(2, "0"));
}

function versDecimal(centimes: bigint): string {
  const signe = centimes < 0n ? "-" : "";
  const absolu = centimes < 0n ? -centimes : centimes;
  return `${signe}${absolu / 100n}.${String(absolu % 100n).padStart(2, "0")}`;
}

export function valeursInitiales(): ValeursEcriture {
  return { journal: "", devise: "CDF", libelle: "", reference: "", lignes: [{ ...LIGNE_VIDE }, { ...LIGNE_VIDE }] };
}

export function FormulaireEcriture({
  initial,
  enregistrer,
  enCours,
  erreur,
  libelleBouton,
}: {
  initial: ValeursEcriture;
  enregistrer: (corps: unknown) => void;
  enCours: boolean;
  erreur: unknown;
  libelleBouton: string;
}) {
  const journaux = useJournaux();
  const devises = useDevises();
  const comptes = useComptes();
  const [valeurs, setValeurs] = useState<ValeursEcriture>(initial);
  const mouvementables = (comptes.data ?? []).filter((c) => c.est_mouvementable && c.actif);

  const montants = valeurs.lignes.map((l) => ({ debit: enCentimes(l.debit), credit: enCentimes(l.credit) }));
  const saisieInvalide = montants.some((m) => m.debit === null || m.credit === null);
  const totalDebit = montants.reduce((s, m) => s + (m.debit ?? 0n), 0n);
  const totalCredit = montants.reduce((s, m) => s + (m.credit ?? 0n), 0n);
  const ecart = totalDebit - totalCredit;
  const equilibree = !saisieInvalide && totalDebit > 0n && ecart === 0n;

  function majLigne(index: number, champ: keyof LigneFormulaire, valeur: string) {
    const lignes = valeurs.lignes.map((l, i) => {
      if (i !== index) return l;
      const ligne = { ...l, [champ]: valeur };
      // Une ligne est soit au débit, soit au crédit.
      if (champ === "debit" && valeur) ligne.credit = "";
      if (champ === "credit" && valeur) ligne.debit = "";
      return ligne;
    });
    setValeurs({ ...valeurs, lignes });
  }

  function equilibrerDerniereLigne() {
    const index = valeurs.lignes.length - 1;
    const sansDerniere = montants.slice(0, -1);
    const solde =
      sansDerniere.reduce((s, m) => s + (m.debit ?? 0n), 0n) -
      sansDerniere.reduce((s, m) => s + (m.credit ?? 0n), 0n);
    if (solde === 0n) return;
    const lignes = [...valeurs.lignes];
    lignes[index] =
      solde > 0n
        ? { ...lignes[index], debit: "", credit: versDecimal(solde) }
        : { ...lignes[index], debit: versDecimal(-solde), credit: "" };
    setValeurs({ ...valeurs, lignes });
  }

  function soumettre(e: React.FormEvent) {
    e.preventDefault();
    enregistrer({
      journal: Number(valeurs.journal),
      devise: valeurs.devise,
      libelle: valeurs.libelle,
      reference: valeurs.reference,
      lignes: valeurs.lignes
        .filter((l) => l.compte)
        .map((l, i) => ({
          compte: Number(l.compte),
          libelle: l.libelle,
          debit: versDecimal(montants[i].debit ?? 0n),
          credit: versDecimal(montants[i].credit ?? 0n),
        })),
    });
  }

  const champs = erreur instanceof ApiError ? erreur.champs : {};

  return (
    <form onSubmit={soumettre} className="grid gap-6">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Champ label="Journal" htmlFor="journal" erreur={champs.journal}>
          <ListeDeroulante id="journal" required value={valeurs.journal}
            onChange={(e) => setValeurs({ ...valeurs, journal: e.target.value })}>
            <option value="">Choisir…</option>
            {journaux.data?.filter((j) => j.actif).map((j) => (
              <option key={j.id} value={j.id}>{j.code} – {j.libelle}</option>
            ))}
          </ListeDeroulante>
        </Champ>
        <Champ label="Devise" htmlFor="devise" erreur={champs.devise}>
          <ListeDeroulante id="devise" value={valeurs.devise}
            onChange={(e) => setValeurs({ ...valeurs, devise: e.target.value })}>
            {devises.data?.filter((d) => d.active).map((d) => (
              <option key={d.code} value={d.code}>{d.code} – {d.nom}</option>
            ))}
          </ListeDeroulante>
        </Champ>
        <Champ label="Libellé" htmlFor="libelle" erreur={champs.libelle}>
          <Input id="libelle" required value={valeurs.libelle}
            onChange={(e) => setValeurs({ ...valeurs, libelle: e.target.value })} />
        </Champ>
        <Champ label="Pièce justificative" htmlFor="reference" aide="N° de facture, de reçu…">
          <Input id="reference" value={valeurs.reference}
            onChange={(e) => setValeurs({ ...valeurs, reference: e.target.value })} />
        </Champ>
      </div>

      <datalist id="comptes-mouvementables">
        {mouvementables.map((c) => <option key={c.id} value={c.numero}>{c.libelle}</option>)}
      </datalist>

      <div className="rounded-xl border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-64">Compte</TableHead>
              <TableHead>Libellé de la ligne</TableHead>
              <TableHead className="w-40 text-right">Débit</TableHead>
              <TableHead className="w-40 text-right">Crédit</TableHead>
              <TableHead className="w-10" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {valeurs.lignes.map((ligne, i) => {
              const compte = mouvementables.find((c) => String(c.id) === ligne.compte);
              return (
                <TableRow key={i}>
                  <TableCell>
                    <Input
                      list="comptes-mouvementables"
                      aria-label={`Compte de la ligne ${i + 1}`}
                      placeholder="N° de compte"
                      defaultValue={compte?.numero ?? ""}
                      onChange={(e) => {
                        const trouve = mouvementables.find((c) => c.numero === e.target.value);
                        majLigne(i, "compte", trouve ? String(trouve.id) : "");
                      }}
                    />
                    <div className="mt-1 truncate text-xs text-muted-foreground">
                      {compte?.libelle ?? "Compte mouvementable requis"}
                    </div>
                  </TableCell>
                  <TableCell>
                    <Input aria-label={`Libellé de la ligne ${i + 1}`} placeholder={valeurs.libelle}
                      value={ligne.libelle} onChange={(e) => majLigne(i, "libelle", e.target.value)} />
                  </TableCell>
                  {(["debit", "credit"] as const).map((sens) => (
                    <TableCell key={sens}>
                      <Input
                        inputMode="decimal"
                        aria-label={`${sens === "debit" ? "Débit" : "Crédit"} de la ligne ${i + 1}`}
                        aria-invalid={montants[i][sens] === null}
                        className="montant text-right"
                        value={ligne[sens]}
                        onChange={(e) => majLigne(i, sens, e.target.value)}
                      />
                    </TableCell>
                  ))}
                  <TableCell>
                    <Button type="button" variant="ghost" size="icon-sm" aria-label={`Supprimer la ligne ${i + 1}`}
                      disabled={valeurs.lignes.length <= 2}
                      onClick={() => setValeurs({ ...valeurs, lignes: valeurs.lignes.filter((_, j) => j !== i) })}>
                      <Trash2Icon />
                    </Button>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
          <TableFooter>
            <TableRow>
              <TableCell colSpan={2}>
                <div className="flex flex-wrap items-center gap-2">
                  <Button type="button" variant="outline" size="sm"
                    onClick={() => setValeurs({ ...valeurs, lignes: [...valeurs.lignes, { ...LIGNE_VIDE }] })}>
                    <PlusIcon /> Ajouter une ligne
                  </Button>
                  <Button type="button" variant="ghost" size="sm" onClick={equilibrerDerniereLigne}>
                    Équilibrer la dernière ligne
                  </Button>
                </div>
              </TableCell>
              <TableCell className="montant text-right font-semibold">{formatMontant(versDecimal(totalDebit))}</TableCell>
              <TableCell className="montant text-right font-semibold">{formatMontant(versDecimal(totalCredit))}</TableCell>
              <TableCell />
            </TableRow>
          </TableFooter>
        </Table>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          {saisieInvalide ? (
            <Badge variant="destructive">Montant invalide (2 décimales maximum)</Badge>
          ) : equilibree ? (
            <Badge>Écriture équilibrée</Badge>
          ) : (
            <Badge variant="destructive">
              Écart : {formatMontant(versDecimal(ecart < 0n ? -ecart : ecart), valeurs.devise)}
            </Badge>
          )}
        </div>
        <Button type="submit" disabled={!equilibree || enCours}>
          {libelleBouton}
        </Button>
      </div>
      {champs.lignes ? <p className="text-sm text-destructive">{champs.lignes}</p> : <ErreurApi erreur={erreur} />}
    </form>
  );
}
