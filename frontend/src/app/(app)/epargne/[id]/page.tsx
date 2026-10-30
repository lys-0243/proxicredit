"use client";

import { useQuery } from "@tanstack/react-query";
import {
  ArrowDownLeftIcon,
  ArrowLeftIcon,
  ArrowUpRightIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  LockIcon,
  LockOpenIcon,
  PiggyBankIcon,
  WalletIcon,
} from "lucide-react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useState } from "react";

import { Champ } from "@/components/champ";
import { DialogueOperationEpargne } from "@/components/epargne/dialogues";
import { ErreurApi } from "@/components/erreur-api";
import { LigneVide, LignesChargement } from "@/components/etat-vide";
import { Montant } from "@/components/montant";
import { PageHeader } from "@/components/page-header";
import { StatCard } from "@/components/stat-card";
import { LienEcriture } from "@/components/tresorerie";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
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
import { api, type Page, type Schemas } from "@/lib/api/client";
import { usePermission } from "@/lib/auth";
import {
  STATUTS_COMPTE_EPARGNE,
  TYPES_MOUVEMENT_EPARGNE,
  VARIANTES_STATUT_COMPTE,
  type CompteEpargne,
} from "@/lib/epargne";
import { formatDate, formatDateHeure } from "@/lib/format";
import { useAction } from "@/lib/mutations";

type Dialogue = "deposer" | "retirer" | "blocage" | null;

function DialogueBlocage({ compte, fermer }: { compte: CompteEpargne; fermer: () => void }) {
  const bloquer = compte.statut === "ACTIF";
  const [motif, setMotif] = useState("");
  const enregistrer = useAction(
    () => api(`/api/epargne/comptes/${compte.id}/blocage`, { method: "POST", body: { bloquer, motif } }),
    { succes: bloquer ? "Compte bloqué." : "Compte débloqué.", invalider: [["epargne"]], apres: fermer },
  );
  return (
    <DialogContent className="sm:max-w-md">
      <form className="grid gap-4" onSubmit={(e) => { e.preventDefault(); enregistrer.mutate(); }}>
        <DialogHeader>
          <DialogTitle>{bloquer ? "Bloquer" : "Débloquer"} le compte {compte.numero}</DialogTitle>
          <DialogDescription>
            {bloquer ? "Aucun retrait ne sera possible tant que le compte reste bloqué." : `Motif du blocage : ${compte.motif_blocage}`}
          </DialogDescription>
        </DialogHeader>
        <Champ label="Motif" htmlFor="motif-blocage">
          <Input id="motif-blocage" required maxLength={255} value={motif} onChange={(e) => setMotif(e.target.value)} />
        </Champ>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={fermer}>Annuler</Button>
          <Button type="submit" variant={bloquer ? "destructive" : "default"} disabled={enregistrer.isPending}>Confirmer</Button>
        </DialogFooter>
      </form>
    </DialogContent>
  );
}

export default function PageCompteEpargne() {
  const { id } = useParams<{ id: string }>();
  const peutDeposer = usePermission("savings.deposer_epargne");
  const peutRetirer = usePermission("savings.retirer_epargne");
  const peutBloquer = usePermission("savings.bloquer_compte_epargne");
  const [dialogue, setDialogue] = useState<Dialogue>(null);
  const [page, setPage] = useState(1);
  const compte = useQuery({
    queryKey: ["epargne", "comptes", id],
    queryFn: () => api<CompteEpargne>(`/api/epargne/comptes/${id}`),
  });
  const mouvements = useQuery({
    queryKey: ["epargne", "comptes", id, "mouvements", page],
    queryFn: () => api<Page<Schemas["MouvementEpargne"]>>(`/api/epargne/comptes/${id}/mouvements`, { query: { page } }),
  });

  if (compte.isPending) return <Skeleton className="h-96 w-full" />;
  if (compte.error) return <ErreurApi erreur={compte.error} />;
  const c = compte.data;
  const fermer = () => setDialogue(null);
  const ouvert = c.statut !== "CLOS";

  return (
    <>
      <Link href="/epargne" className={buttonVariants({ variant: "ghost", size: "sm", className: "mb-2 -ml-2" })}>
        <ArrowLeftIcon /> Épargne
      </Link>
      <PageHeader
        surtitre={c.produit_libelle}
        titre={c.numero}
        description={`${c.membre_nom} (${c.membre_numero}) · ouvert le ${formatDate(c.date_ouverture)} par ${c.ouvert_par}`}
        actions={
          <>
            <Badge variant={VARIANTES_STATUT_COMPTE[c.statut]}>{STATUTS_COMPTE_EPARGNE[c.statut]}</Badge>
            <Link href={`/membres/${c.membre}`} className={buttonVariants({ variant: "outline" })}>Fiche du membre</Link>
            {peutDeposer && ouvert && <Button onClick={() => setDialogue("deposer")}><ArrowDownLeftIcon /> Dépôt</Button>}
            {peutRetirer && c.statut === "ACTIF" && (
              <Button variant="outline" onClick={() => setDialogue("retirer")}><ArrowUpRightIcon /> Retrait</Button>
            )}
            {peutBloquer && ouvert && (
              <Button variant="outline" size="icon" aria-label={c.statut === "ACTIF" ? "Bloquer" : "Débloquer"}
                onClick={() => setDialogue("blocage")}>
                {c.statut === "ACTIF" ? <LockIcon /> : <LockOpenIcon />}
              </Button>
            )}
          </>
        }
      />
      {c.statut === "BLOQUE" && (
        <Alert variant="destructive" className="mb-4"><AlertDescription>Compte bloqué : {c.motif_blocage}</AlertDescription></Alert>
      )}
      <div className="mb-6 grid gap-4 md:grid-cols-3">
        <StatCard titre="Solde" icone={PiggyBankIcon} valeur={<Montant valeur={c.solde} devise={c.devise} />} />
        <StatCard titre="Disponible au retrait" icone={WalletIcon} ton="neutre"
          valeur={<Montant valeur={c.disponible} devise={c.devise} />}
          detail={c.produit_type === "VUE" ? undefined : "Ce produit n'autorise pas les retraits au guichet."} />
        <StatCard titre="Bloqué en garantie de crédit" icone={LockIcon} ton={Number(c.bloque) > 0 ? "warning" : "neutre"}
          valeur={<Montant valeur={c.bloque} devise={c.devise} />}
          detail="Épargne exigée pour un crédit en cours, libérée à son remboursement complet." />
      </div>
      <div className="carte-nue">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Date</TableHead>
              <TableHead>Mouvement</TableHead>
              <TableHead className="text-right">Débit</TableHead>
              <TableHead className="text-right">Crédit</TableHead>
              <TableHead className="text-right">Solde</TableHead>
              <TableHead>Écriture</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {mouvements.isPending ? (
              <LignesChargement colonnes={6} />
            ) : mouvements.data?.results.length ? (
              mouvements.data.results.map((m) => (
                <TableRow key={m.id}>
                  <TableCell className="text-sm">
                    {formatDate(m.date_comptable)}
                    <span className="block text-xs text-muted-foreground">{formatDateHeure(m.cree_le)} · {m.cree_par}</span>
                  </TableCell>
                  <TableCell className="text-sm">{TYPES_MOUVEMENT_EPARGNE[m.type]}</TableCell>
                  <TableCell className="text-right">{m.sens === "D" && <Montant valeur={m.montant} />}</TableCell>
                  <TableCell className="text-right">{m.sens === "C" && <Montant valeur={m.montant} />}</TableCell>
                  <TableCell className="text-right font-semibold"><Montant valeur={m.solde_apres} /></TableCell>
                  <TableCell className="font-mono text-xs"><LienEcriture id={m.ecriture} numero={m.ecriture_numero} /></TableCell>
                </TableRow>
              ))
            ) : (
              <LigneVide colonnes={6} icone={PiggyBankIcon} message="Aucun mouvement sur ce compte." />
            )}
          </TableBody>
        </Table>
      </div>
      <div className="mt-4 flex items-center justify-end gap-1.5 text-sm">
        <span className="mr-2 text-muted-foreground">Page {page}</span>
        <Button variant="outline" size="icon-sm" aria-label="Page précédente" disabled={!mouvements.data?.previous}
          onClick={() => setPage(page - 1)}>
          <ChevronLeftIcon />
        </Button>
        <Button variant="outline" size="icon-sm" aria-label="Page suivante" disabled={!mouvements.data?.next}
          onClick={() => setPage(page + 1)}>
          <ChevronRightIcon />
        </Button>
      </div>
      <Dialog open={dialogue !== null} onOpenChange={(o) => !o && fermer()}>
        {(dialogue === "deposer" || dialogue === "retirer") && (
          <DialogueOperationEpargne compte={c} operation={dialogue} fermer={fermer} />
        )}
        {dialogue === "blocage" && <DialogueBlocage compte={c} fermer={fermer} />}
      </Dialog>
    </>
  );
}
