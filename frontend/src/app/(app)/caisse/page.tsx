"use client";

import { useQuery } from "@tanstack/react-query";
import { ArrowDownLeftIcon, ArrowUpRightIcon, LockIcon, VaultIcon, WalletIcon } from "lucide-react";
import { useState } from "react";

import { Champ } from "@/components/champ";
import { LigneVide, LignesChargement } from "@/components/etat-vide";
import { ListeDeroulante } from "@/components/liste-deroulante";
import { Montant } from "@/components/montant";
import { PageHeader } from "@/components/page-header";
import { StatCard } from "@/components/stat-card";
import { LienEcriture } from "@/components/tresorerie";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
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
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { api, type Schemas } from "@/lib/api/client";
import { useMoi } from "@/lib/auth";
import { TYPES_OPERATION, useMaSession, type SessionCaisse } from "@/lib/caisse";
import { formatDate, formatDateHeure, formatMontant } from "@/lib/format";
import { useAction } from "@/lib/mutations";

function OuvrirSession() {
  const { data: moi } = useMoi();
  const caisses = useQuery({
    queryKey: ["caisse", "caisses", "guichets"],
    queryFn: () => api<Schemas["Caisse"][]>("/api/caisse/caisses", { query: { type: "GUICHET", active: true } }),
  });
  const libres = (caisses.data ?? []).filter((c) => c.session_ouverte === null);
  const [choix, setChoix] = useState("");
  const caisse = choix || String(libres[0]?.id ?? "");
  const ouvrir = useAction(
    () => api("/api/caisse/sessions/ouvrir", { method: "POST", body: { caisse: Number(caisse) } }),
    { succes: "Caisse ouverte.", invalider: [["caisse"]] },
  );

  return (
    <Card className="max-w-lg">
      <CardHeader>
        <CardTitle>Ouvrir ma caisse</CardTitle>
        <CardDescription>
          Les fonds d&apos;ouverture reprennent le comptage de la dernière fermeture du guichet.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {!moi?.date_comptable ? (
          <Alert><AlertDescription>Aucune journée comptable ouverte : la caisse ne peut pas être ouverte.</AlertDescription></Alert>
        ) : caisses.isPending ? (
          <Skeleton className="h-10 w-full" />
        ) : libres.length === 0 ? (
          <Alert><AlertDescription>Tous les guichets de l&apos;agence sont déjà ouverts.</AlertDescription></Alert>
        ) : (
          <form className="grid gap-4" onSubmit={(e) => { e.preventDefault(); ouvrir.mutate(); }}>
            <Champ label="Guichet" htmlFor="guichet">
              <ListeDeroulante id="guichet" value={caisse} onChange={(e) => setChoix(e.target.value)}>
                {libres.map((c) => <option key={c.id} value={c.id}>{c.code} – {c.libelle}</option>)}
              </ListeDeroulante>
            </Champ>
            <Button type="submit" className="w-fit" disabled={ouvrir.isPending}>
              <WalletIcon /> Ouvrir la caisse
            </Button>
          </form>
        )}
      </CardContent>
    </Card>
  );
}

function DialogueFermeture({ session, fermer }: { session: SessionCaisse; fermer: () => void }) {
  const [comptages, setComptages] = useState<Record<string, string>>({});
  const [commentaire, setCommentaire] = useState("");
  const cloturer = useAction(
    () => api(`/api/caisse/sessions/${session.id}/fermer`, { method: "POST", body: { comptages, commentaire } }),
    { succes: "Caisse fermée.", invalider: [["caisse"]], apres: fermer },
  );
  const complet = session.situation.every((s) => comptages[s.devise] !== undefined && comptages[s.devise] !== "");

  return (
    <DialogContent className="sm:max-w-lg">
      <form className="grid gap-4" onSubmit={(e) => { e.preventDefault(); cloturer.mutate(); }}>
        <DialogHeader>
          <DialogTitle>Fermer la caisse {session.caisse_code}</DialogTitle>
          <DialogDescription>
            Comptez les espèces de chaque devise. Un écart est enregistré en compte d&apos;attente pour
            régularisation par l&apos;agence.
          </DialogDescription>
        </DialogHeader>
        {session.situation.map((s) => {
          const saisi = comptages[s.devise];
          // Affichage seulement : l'écart officiel est calculé par le serveur.
          const ecart = saisi ? Number(saisi) - Number(s.theorique) : null;
          return (
            <Champ key={s.devise} label={`Montant compté (${s.devise})`} htmlFor={`comptage-${s.devise}`}
              aide={`Solde théorique : ${formatMontant(s.theorique, s.devise)}`}>
              <div className="flex items-center gap-3">
                <Input id={`comptage-${s.devise}`} type="number" min="0" step="0.01" required value={saisi ?? ""}
                  onChange={(e) => setComptages({ ...comptages, [s.devise]: e.target.value })} />
                {ecart !== null && (
                  <Badge variant={ecart === 0 ? "success" : "destructive"}>
                    {ecart === 0 ? "Équilibré" : `Écart ${formatMontant(ecart, s.devise)}`}
                  </Badge>
                )}
              </div>
            </Champ>
          );
        })}
        <Champ label="Commentaire" htmlFor="commentaire-fermeture">
          <Input id="commentaire-fermeture" maxLength={255} value={commentaire} onChange={(e) => setCommentaire(e.target.value)} />
        </Champ>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={fermer}>Annuler</Button>
          <Button type="submit" disabled={!complet || cloturer.isPending}><LockIcon /> Fermer la caisse</Button>
        </DialogFooter>
      </form>
    </DialogContent>
  );
}

function SessionEnCours({ session }: { session: SessionCaisse }) {
  const [fermeture, setFermeture] = useState(false);
  const operations = useQuery({
    queryKey: ["caisse", "sessions", session.id, "operations"],
    queryFn: () => api<Schemas["OperationCaisse"][]>(`/api/caisse/sessions/${session.id}/operations`),
  });

  return (
    <>
      <PageHeader
        titre={`Caisse ${session.caisse_code} – ${session.caisse_libelle}`}
        description={`Session du ${formatDate(session.date_comptable)}, ouverte le ${formatDateHeure(session.ouverte_le)}.`}
        actions={<Button variant="outline" onClick={() => setFermeture(true)}><LockIcon /> Fermer la caisse</Button>}
      />
      <div className="mb-6 grid gap-4 md:grid-cols-2">
        {session.situation.map((s) => (
          <StatCard key={s.devise} titre={`Solde théorique ${s.devise}`} icone={VaultIcon}
            valeur={<Montant valeur={s.theorique} devise={s.devise} />}
            detail={
              <span className="flex flex-wrap gap-x-4 gap-y-1">
                <span>Ouverture {formatMontant(s.ouverture)}</span>
                <span className="inline-flex items-center gap-1"><ArrowDownLeftIcon className="size-3.5 text-success-strong" /> {formatMontant(s.entrees)}</span>
                <span className="inline-flex items-center gap-1"><ArrowUpRightIcon className="size-3.5 text-destructive" /> {formatMontant(s.sorties)}</span>
              </span>
            } />
        ))}
      </div>
      <div className="carte-nue">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Heure</TableHead>
              <TableHead>Opération</TableHead>
              <TableHead>Membre</TableHead>
              <TableHead className="text-right">Entrée</TableHead>
              <TableHead className="text-right">Sortie</TableHead>
              <TableHead>Écriture</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {operations.isPending ? (
              <LignesChargement colonnes={6} />
            ) : operations.data?.length ? (
              operations.data.map((o) => (
                <TableRow key={o.id}>
                  <TableCell className="text-sm">{formatDateHeure(o.cree_le)}</TableCell>
                  <TableCell>
                    <span className="font-semibold">{TYPES_OPERATION[o.type_operation] ?? o.type_operation}</span>
                    <span className="block text-xs text-muted-foreground">{o.libelle}</span>
                  </TableCell>
                  <TableCell className="text-sm">{o.membre_nom ?? ""}</TableCell>
                  <TableCell className="text-right">{o.sens === "ENTREE" && <Montant valeur={o.montant} devise={o.devise} />}</TableCell>
                  <TableCell className="text-right">{o.sens === "SORTIE" && <Montant valeur={o.montant} devise={o.devise} />}</TableCell>
                  <TableCell className="font-mono text-xs"><LienEcriture id={o.ecriture} numero={o.ecriture_numero} /></TableCell>
                </TableRow>
              ))
            ) : (
              <LigneVide colonnes={6} icone={WalletIcon} message="Aucune opération pour l'instant." />
            )}
          </TableBody>
        </Table>
      </div>
      <Dialog open={fermeture} onOpenChange={setFermeture}>
        {fermeture && <DialogueFermeture session={session} fermer={() => setFermeture(false)} />}
      </Dialog>
    </>
  );
}

export default function PageMaCaisse() {
  const session = useMaSession();
  if (session.isPending) return <Skeleton className="h-96 w-full" />;
  if (session.data) return <SessionEnCours session={session.data} />;
  return (
    <>
      <PageHeader titre="Ma caisse"
        description="Tous les encaissements et paiements en espèces passent par votre session de caisse." />
      <OuvrirSession />
    </>
  );
}
