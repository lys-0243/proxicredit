"use client";

import { useQuery } from "@tanstack/react-query";
import { ArrowLeftIcon, CheckIcon, PencilIcon, Trash2Icon, Undo2Icon } from "lucide-react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useState } from "react";

import {
  FormulaireEcriture,
  type ValeursEcriture,
} from "@/components/comptabilite/formulaire-ecriture";
import { StatutEcriture, TYPES_OPERATION } from "@/components/comptabilite/statut-ecriture";
import { Champ } from "@/components/champ";
import { ErreurApi } from "@/components/erreur-api";
import { Montant } from "@/components/montant";
import { PageHeader } from "@/components/page-header";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
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
import { useMoi, usePermission } from "@/lib/auth";
import { formatDate, formatDateHeure, formatTaux } from "@/lib/format";
import { useAction } from "@/lib/mutations";
import { useComptes } from "@/lib/referentiels";

type Ecriture = Schemas["Ecriture"];

const CONTRE_PASSABLES = ["SAISIE_MANUELLE", "CONTRE_PASSATION"];

function Info({ libelle, children }: { libelle: string; children: React.ReactNode }) {
  return (
    <div>
      <dt className="text-xs text-muted-foreground">{libelle}</dt>
      <dd className="text-sm font-medium">{children || "—"}</dd>
    </div>
  );
}

function versValeurs(e: Ecriture): ValeursEcriture {
  return {
    journal: String(e.journal),
    devise: e.devise,
    libelle: e.libelle,
    reference: e.reference,
    lignes: e.lignes.map((l) => ({
      compte: String(l.compte),
      libelle: l.libelle,
      debit: Number(l.debit) ? l.debit : "",
      credit: Number(l.credit) ? l.credit : "",
    })),
  };
}

export default function PageEcriture() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { data: moi } = useMoi();
  const comptes = useComptes();
  const peutValider = usePermission("accounting.valider_ecriture");
  const peutModifier = usePermission("accounting.change_ecriture");
  const peutSupprimer = usePermission("accounting.delete_ecriture");
  const peutContrePasser = usePermission("accounting.contre_passer_ecriture");
  const [edition, setEdition] = useState(false);
  const [contrePassation, setContrePassation] = useState(false);
  const [motif, setMotif] = useState("");

  const cle = ["comptabilite", "ecritures", id];
  const requete = useQuery({ queryKey: cle, queryFn: () => api<Ecriture>(`/api/comptabilite/ecritures/${id}`) });
  const invalider = [["comptabilite", "ecritures"], ["comptabilite", "balance"]];

  const valider = useAction(() => api(`/api/comptabilite/ecritures/${id}/valider`, { method: "POST" }), {
    succes: "Écriture validée et passée au grand livre.",
    invalider,
  });
  const modifier = useAction(
    (corps: unknown) => api(`/api/comptabilite/ecritures/${id}`, { method: "PUT", body: corps }),
    { succes: "Brouillon modifié.", invalider, apres: () => setEdition(false) },
  );
  const supprimer = useAction(() => api(`/api/comptabilite/ecritures/${id}`, { method: "DELETE" }), {
    succes: "Brouillon supprimé.",
    invalider,
    apres: () => router.push("/comptabilite/ecritures"),
  });
  const contrePasser = useAction(
    () =>
      api<Ecriture>(`/api/comptabilite/ecritures/${id}/contre-passer`, { method: "POST", body: { motif } }),
    {
      succes: "Contre-passation préparée : elle doit être validée par un autre utilisateur.",
      invalider,
      apres: (inverse) => {
        setContrePassation(false);
        router.push(`/comptabilite/ecritures/${inverse.id}`);
      },
    },
  );

  if (requete.isPending) return <Skeleton className="h-64 w-full" />;
  if (requete.error) return <ErreurApi erreur={requete.error} />;
  const e = requete.data;
  const brouillon = e.statut === "BROUILLON";
  const estAuteur = e.cree_par === moi?.username;

  return (
    <>
      <Link href="/comptabilite/ecritures" className={buttonVariants({ variant: "ghost", size: "sm", className: "mb-2 -ml-2" })}>
        <ArrowLeftIcon /> Écritures
      </Link>
      <PageHeader
        titre={e.numero ?? `Brouillon #${e.id}`}
        description={e.libelle}
        actions={
          <>
            <StatutEcriture statut={e.statut} contrePassee={e.contre_passee_par !== null} />
            {brouillon && peutModifier && e.type_operation === "SAISIE_MANUELLE" && !edition && (
              <Button variant="outline" onClick={() => setEdition(true)}>
                <PencilIcon /> Modifier
              </Button>
            )}
            {brouillon && peutSupprimer && (
              <Button variant="destructive" disabled={supprimer.isPending}
                onClick={() => confirm("Supprimer ce brouillon ?") && supprimer.mutate()}>
                <Trash2Icon /> Supprimer
              </Button>
            )}
            {brouillon && peutValider && !estAuteur && (
              <Button onClick={() => valider.mutate()} disabled={valider.isPending}>
                <CheckIcon /> Valider
              </Button>
            )}
            {!brouillon && peutContrePasser && e.contre_passee_par === null &&
              CONTRE_PASSABLES.includes(e.type_operation) && (
                <Button variant="outline" onClick={() => setContrePassation(true)}>
                  <Undo2Icon /> Contre-passer
                </Button>
              )}
          </>
        }
      />

      {brouillon && estAuteur && (
        <Alert className="mb-4">
          <AlertDescription>
            Vous êtes l&apos;auteur de cette saisie : un autre utilisateur habilité doit la valider
            (contrôle à quatre yeux).
          </AlertDescription>
        </Alert>
      )}
      {(e.contre_passation_de || e.contre_passee_par) && (
        <Alert className="mb-4">
          <AlertDescription>
            {e.contre_passation_de && (
              <>Contre-passation de l&apos;écriture{" "}
                <Link className="underline" href={`/comptabilite/ecritures/${e.contre_passation_de}`}>{e.reference}</Link>.
              </>
            )}
            {e.contre_passee_par && (
              <>Cette écriture a été contre-passée :{" "}
                <Link className="underline" href={`/comptabilite/ecritures/${e.contre_passee_par}`}>voir l&apos;écriture inverse</Link>.
              </>
            )}
          </AlertDescription>
        </Alert>
      )}

      {edition ? (
        <Card>
          <CardContent>
            {comptes.data ? (
              <FormulaireEcriture
                initial={versValeurs(e)}
                enregistrer={(corps) => modifier.mutate(corps)}
                enCours={modifier.isPending}
                erreur={modifier.error}
                libelleBouton="Enregistrer les modifications"
              />
            ) : (
              <Skeleton className="h-40" />
            )}
            <Button variant="ghost" className="mt-2" onClick={() => setEdition(false)}>Annuler</Button>
          </CardContent>
        </Card>
      ) : (
        <>
          <Card className="mb-6">
            <CardContent>
              <dl className="grid gap-4 sm:grid-cols-3 lg:grid-cols-6">
                <Info libelle="Date comptable">{formatDate(e.date_comptable)}</Info>
                <Info libelle="Journal">{e.journal_code}</Info>
                <Info libelle="Agence">{e.agence_code}</Info>
                <Info libelle="Devise">
                  {e.devise}
                  {e.taux_reference && e.devise !== "CDF" && (
                    <span className="font-normal text-muted-foreground"> · 1 = {formatTaux(e.taux_reference)} CDF</span>
                  )}
                </Info>
                <Info libelle="Type">{TYPES_OPERATION[e.type_operation] ?? e.type_operation}</Info>
                <Info libelle="Pièce">{e.reference}</Info>
                <Info libelle="Saisie par">{e.cree_par} · {formatDateHeure(e.cree_le)}</Info>
                <Info libelle="Validée par">{e.valide_par && `${e.valide_par} · ${formatDateHeure(e.valide_le)}`}</Info>
              </dl>
            </CardContent>
          </Card>
          <div className="carte-nue">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Compte</TableHead>
                  <TableHead>Libellé</TableHead>
                  <TableHead className="text-right">Débit</TableHead>
                  <TableHead className="text-right">Crédit</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {e.lignes.map((l) => (
                  <TableRow key={l.id}>
                    <TableCell>
                      <span className="font-mono">{l.compte_numero}</span>{" "}
                      <span className="text-muted-foreground">{l.compte_libelle}</span>
                    </TableCell>
                    <TableCell>{l.libelle}</TableCell>
                    <TableCell className="text-right"><Montant valeur={l.debit} /></TableCell>
                    <TableCell className="text-right"><Montant valeur={l.credit} /></TableCell>
                  </TableRow>
                ))}
              </TableBody>
              <TableFooter>
                <TableRow>
                  <TableCell colSpan={2} className="font-semibold">Total</TableCell>
                  <TableCell className="text-right font-semibold"><Montant valeur={e.total} devise={e.devise} /></TableCell>
                  {/* Une écriture est toujours équilibrée : total des crédits = total des débits. */}
                  <TableCell className="text-right font-semibold"><Montant valeur={e.total} devise={e.devise} /></TableCell>
                </TableRow>
              </TableFooter>
            </Table>
          </div>
        </>
      )}

      <Dialog open={contrePassation} onOpenChange={setContrePassation}>
        <DialogContent>
          <form className="grid gap-4" onSubmit={(ev) => { ev.preventDefault(); contrePasser.mutate(); }}>
            <DialogHeader>
              <DialogTitle>Contre-passer {e.numero}</DialogTitle>
              <DialogDescription>
                Une écriture inverse est préparée en brouillon. Elle annulera celle-ci une fois validée
                par un autre utilisateur. L&apos;écriture d&apos;origine reste intacte.
              </DialogDescription>
            </DialogHeader>
            <Champ label="Motif" htmlFor="motif">
              <Input id="motif" required maxLength={200} value={motif} onChange={(ev) => setMotif(ev.target.value)} />
            </Champ>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setContrePassation(false)}>Annuler</Button>
              <Button type="submit" disabled={contrePasser.isPending}>Préparer la contre-passation</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
