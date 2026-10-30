"use client";

import { useQuery } from "@tanstack/react-query";
import { ArrowDownToLineIcon, ArrowUpFromLineIcon, WalletIcon } from "lucide-react";
import { useState } from "react";

import { Champ } from "@/components/champ";
import { LigneVide, LignesChargement } from "@/components/etat-vide";
import { ListeDeroulante } from "@/components/liste-deroulante";
import { Montant } from "@/components/montant";
import { PageHeader } from "@/components/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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
import type { SessionCaisse } from "@/lib/caisse";
import { formatDate, formatDateHeure } from "@/lib/format";
import { cleIdempotence } from "@/lib/identifiant";
import { useAction } from "@/lib/mutations";

type Transfert = { session: SessionCaisse; sens: "ENTREE" | "SORTIE" };

function DialogueTransfert({ transfert, fermer }: { transfert: Transfert; fermer: () => void }) {
  const { session, sens } = transfert;
  const [devise, setDevise] = useState(session.situation[0]?.devise ?? "CDF");
  const [montant, setMontant] = useState("");
  const [cle] = useState(() => cleIdempotence());
  const approvisionnement = sens === "ENTREE";
  const executer = useAction(
    () => api(`/api/caisse/sessions/${session.id}/transfert-coffre`, {
      method: "POST", body: { sens, devise, montant, cle_idempotence: cle },
    }),
    { succes: approvisionnement ? "Caisse approvisionnée." : "Caisse délestée.", invalider: [["caisse"]], apres: fermer },
  );
  const disponible = session.situation.find((s) => s.devise === devise)?.theorique;

  return (
    <DialogContent className="sm:max-w-md">
      <form className="grid gap-4" onSubmit={(e) => { e.preventDefault(); executer.mutate(); }}>
        <DialogHeader>
          <DialogTitle>{approvisionnement ? "Approvisionner" : "Délester"} la caisse {session.caisse_code}</DialogTitle>
          <DialogDescription>
            {approvisionnement
              ? `Remise de fonds du coffre à ${session.caissier}.`
              : `Retour au coffre des fonds de ${session.caissier}.`}
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 sm:grid-cols-[8rem_1fr]">
          <Champ label="Devise" htmlFor="devise-transfert">
            <ListeDeroulante id="devise-transfert" value={devise} onChange={(e) => setDevise(e.target.value)}>
              {session.situation.map((s) => <option key={s.devise} value={s.devise}>{s.devise}</option>)}
            </ListeDeroulante>
          </Champ>
          <Champ label="Montant" htmlFor="montant-transfert"
            aide={approvisionnement ? undefined : `Disponible en caisse : ${disponible ?? "–"} ${devise}`}>
            <Input id="montant-transfert" type="number" min="0.01" step="0.01" required value={montant}
              onChange={(e) => setMontant(e.target.value)} />
          </Champ>
        </div>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={fermer}>Annuler</Button>
          <Button type="submit" disabled={executer.isPending}>Confirmer</Button>
        </DialogFooter>
      </form>
    </DialogContent>
  );
}

export default function PageSessionsCaisse() {
  const gereCoffre = usePermission("cash.gerer_coffre");
  const [statut, setStatut] = useState("OUVERTE");
  const [transfert, setTransfert] = useState<Transfert | null>(null);
  const sessions = useQuery({
    queryKey: ["caisse", "sessions", statut],
    queryFn: () => api<Page<SessionCaisse>>("/api/caisse/sessions", { query: { statut } }),
  });

  return (
    <>
      <PageHeader
        titre="Sessions de caisse"
        description="Situation des guichets de l'agence, approvisionnement et délestage depuis le coffre."
        actions={
          <ListeDeroulante aria-label="Statut" className="w-44" value={statut} onChange={(e) => setStatut(e.target.value)}>
            <option value="OUVERTE">Ouvertes</option>
            <option value="FERMEE">Fermées</option>
            <option value="">Toutes</option>
          </ListeDeroulante>
        }
      />
      <div className="carte-nue">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Guichet</TableHead>
              <TableHead>Caissier</TableHead>
              <TableHead>Journée</TableHead>
              <TableHead className="text-right">Solde théorique</TableHead>
              <TableHead className="text-right">Écart</TableHead>
              <TableHead />
            </TableRow>
          </TableHeader>
          <TableBody>
            {sessions.isPending ? (
              <LignesChargement colonnes={6} />
            ) : sessions.data?.results.length ? (
              sessions.data.results.map((s) => (
                <TableRow key={s.id}>
                  <TableCell>
                    <span className="font-semibold">{s.caisse_code}</span>
                    <span className="block text-xs text-muted-foreground">
                      {s.statut === "OUVERTE" ? `Ouverte le ${formatDateHeure(s.ouverte_le)}` : `Fermée le ${formatDateHeure(s.fermee_le)}`}
                    </span>
                  </TableCell>
                  <TableCell className="text-sm">{s.caissier}</TableCell>
                  <TableCell className="text-sm">{formatDate(s.date_comptable)}</TableCell>
                  <TableCell className="text-right">
                    {s.situation.map((l) => <Montant key={l.devise} className="block" valeur={l.theorique} devise={l.devise} />)}
                  </TableCell>
                  <TableCell className="text-right">
                    {s.statut === "FERMEE"
                      ? s.situation.map((l) =>
                          l.ecart && Number(l.ecart) !== 0 ? (
                            <Badge key={l.devise} variant="destructive">
                              <Montant valeur={l.ecart} devise={l.devise} />
                            </Badge>
                          ) : null,
                        )
                      : null}
                  </TableCell>
                  <TableCell className="text-right">
                    {gereCoffre && s.statut === "OUVERTE" && (
                      <span className="inline-flex gap-1.5">
                        <Button size="sm" variant="outline" onClick={() => setTransfert({ session: s, sens: "ENTREE" })}>
                          <ArrowDownToLineIcon /> Approvisionner
                        </Button>
                        <Button size="sm" variant="outline" onClick={() => setTransfert({ session: s, sens: "SORTIE" })}>
                          <ArrowUpFromLineIcon /> Délester
                        </Button>
                      </span>
                    )}
                  </TableCell>
                </TableRow>
              ))
            ) : (
              <LigneVide colonnes={6} icone={WalletIcon} message="Aucune session de caisse." />
            )}
          </TableBody>
        </Table>
      </div>
      <Dialog open={transfert !== null} onOpenChange={(ouvert) => !ouvert && setTransfert(null)}>
        {transfert && <DialogueTransfert transfert={transfert} fermer={() => setTransfert(null)} />}
      </Dialog>
    </>
  );
}
