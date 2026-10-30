"use client";

import { useQuery } from "@tanstack/react-query";
import { AlertTriangleIcon, CheckCircle2Icon, CircleIcon } from "lucide-react";
import { useState } from "react";

import { Champ } from "@/components/champ";
import { ListeDeroulante } from "@/components/liste-deroulante";
import { CompteTresorerie, useComptesTresorerie } from "@/components/tresorerie";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { api, type Page, type Schemas } from "@/lib/api/client";
import { AVIS_CREDIT, formatPourcentage, type Credit } from "@/lib/credits";
import type { CompteEpargne } from "@/lib/epargne";
import { formatMontant } from "@/lib/format";
import { cleIdempotence } from "@/lib/identifiant";
import { useAction } from "@/lib/mutations";

const INVALIDER = [["credits"], ["caisse"], ["epargne"]];

/** Éligibilité et capacité de remboursement, pour l'analyste et le comité. */
export function ControleCredit({ credit }: { credit: Credit }) {
  const controle = useQuery({
    queryKey: ["credits", "dossiers", String(credit.id), "controle"],
    queryFn: () => api<Schemas["ControleCredit"]>(`/api/credits/dossiers/${credit.id}/controle`),
  });
  const c = controle.data;
  if (!c) return null;
  const { capacite } = c;
  return (
    <div className="grid gap-2 text-sm">
      {c.bloquants.length ? (
        c.bloquants.map((b) => (
          <p key={b} className="flex items-start gap-2 text-destructive">
            <CircleIcon className="mt-0.5 size-4 shrink-0" /> {b}
          </p>
        ))
      ) : (
        <p className="flex items-center gap-2"><CheckCircle2Icon className="size-4 text-success-strong" /> Membre éligible.</p>
      )}
      <p className={capacite.depasse ? "flex items-start gap-2 text-warning-strong" : "text-muted-foreground"}>
        {capacite.depasse && <AlertTriangleIcon className="mt-0.5 size-4 shrink-0" />}
        Échéance {formatMontant(capacite.echeance_max, credit.devise)}
        {capacite.taux_endettement !== null
          ? ` · ${formatPourcentage(capacite.taux_endettement)} du revenu disponible (${formatMontant(capacite.revenu_disponible, credit.devise)}), seuil ${formatPourcentage(capacite.taux_endettement_max)}`
          : " · revenu disponible non renseigné"}
      </p>
    </div>
  );
}

export function DialogueAnalyse({ credit, fermer }: { credit: Credit; fermer: () => void }) {
  const [avis, setAvis] = useState<Schemas["AvisCreditEnum"]>((credit.avis_analyse || "FAVORABLE") as Schemas["AvisCreditEnum"]);
  const [commentaire, setCommentaire] = useState(credit.commentaire_analyse);
  const [montant, setMontant] = useState(credit.montant_propose ?? credit.montant_demande);
  const [duree, setDuree] = useState(credit.duree_proposee ?? credit.duree_demandee);
  const [revenu, setRevenu] = useState(credit.revenu_mensuel ?? "");
  const [charges, setCharges] = useState(credit.charges_mensuelles ?? "");
  const analyser = useAction(
    () => api(`/api/credits/dossiers/${credit.id}/analyser`, {
      method: "POST",
      body: {
        avis, commentaire, montant_propose: montant, duree_proposee: duree,
        revenu_mensuel: revenu || null, charges_mensuelles: charges || null,
      },
    }),
    { succes: "Analyse enregistrée : le dossier attend le comité.", invalider: INVALIDER, apres: fermer },
  );

  return (
    <DialogContent className="sm:max-w-lg">
      <form className="grid gap-4" onSubmit={(e) => { e.preventDefault(); analyser.mutate(); }}>
        <DialogHeader>
          <DialogTitle>Analyse du dossier {credit.numero}</DialogTitle>
          <DialogDescription>
            Demandé : {formatMontant(credit.montant_demande, credit.devise)} en {credit.duree_demandee} échéances.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 sm:grid-cols-2">
          <Champ label={`Revenu mensuel (${credit.devise})`} htmlFor="revenu">
            <Input id="revenu" type="number" min="0" step="0.01" value={revenu} onChange={(e) => setRevenu(e.target.value)} />
          </Champ>
          <Champ label={`Charges mensuelles (${credit.devise})`} htmlFor="charges">
            <Input id="charges" type="number" min="0" step="0.01" value={charges} onChange={(e) => setCharges(e.target.value)} />
          </Champ>
          <Champ label="Montant proposé" htmlFor="montant-propose">
            <Input id="montant-propose" type="number" min="0" step="0.01" required value={montant}
              onChange={(e) => setMontant(e.target.value)} />
          </Champ>
          <Champ label="Échéances proposées" htmlFor="duree-proposee">
            <Input id="duree-proposee" type="number" min="1" required value={duree}
              onChange={(e) => setDuree(Math.max(1, Number(e.target.value) || 1))} />
          </Champ>
        </div>
        <Champ label="Avis" htmlFor="avis">
          <ListeDeroulante id="avis" value={avis} onChange={(e) => setAvis(e.target.value as Schemas["AvisCreditEnum"])}>
            {Object.entries(AVIS_CREDIT).map(([code, libelle]) => <option key={code} value={code}>{libelle}</option>)}
          </ListeDeroulante>
        </Champ>
        <Champ label="Commentaire d'analyse" htmlFor="commentaire-analyse">
          <Textarea id="commentaire-analyse" required rows={4} value={commentaire} onChange={(e) => setCommentaire(e.target.value)} />
        </Champ>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={fermer}>Annuler</Button>
          <Button type="submit" disabled={analyser.isPending}>Enregistrer l&apos;analyse</Button>
        </DialogFooter>
      </form>
    </DialogContent>
  );
}

export function DialogueDecision({
  credit,
  approuver,
  fermer,
}: {
  credit: Credit;
  approuver: boolean;
  fermer: () => void;
}) {
  const [montant, setMontant] = useState(credit.montant_propose ?? credit.montant_demande);
  const [duree, setDuree] = useState(credit.duree_proposee ?? credit.duree_demandee);
  const [motif, setMotif] = useState("");
  const statuer = useAction(
    () => api(`/api/credits/dossiers/${credit.id}/statuer`, {
      method: "POST",
      body: approuver ? { approuver, motif, montant_accorde: montant, duree_accordee: duree } : { approuver, motif },
    }),
    { succes: approuver ? "Crédit approuvé." : "Demande rejetée.", invalider: INVALIDER, apres: fermer },
  );

  return (
    <DialogContent className="sm:max-w-lg">
      <form className="grid gap-4" onSubmit={(e) => { e.preventDefault(); statuer.mutate(); }}>
        <DialogHeader>
          <DialogTitle>{approuver ? "Approuver" : "Rejeter"} le dossier {credit.numero}</DialogTitle>
          <DialogDescription>
            Avis de l&apos;analyste : {credit.avis_analyse ? AVIS_CREDIT[credit.avis_analyse as Schemas["AvisCreditEnum"]] : "–"}
          </DialogDescription>
        </DialogHeader>
        <ControleCredit credit={credit} />
        {approuver && (
          <div className="grid gap-4 sm:grid-cols-2">
            <Champ label={`Montant accordé (${credit.devise})`} htmlFor="montant-accorde"
              aide={`Demandé : ${formatMontant(credit.montant_demande)}`}>
              <Input id="montant-accorde" type="number" min="0" step="0.01" required value={montant}
                onChange={(e) => setMontant(e.target.value)} />
            </Champ>
            <Champ label="Échéances accordées" htmlFor="duree-accordee">
              <Input id="duree-accordee" type="number" min="1" required value={duree}
                onChange={(e) => setDuree(Math.max(1, Number(e.target.value) || 1))} />
            </Champ>
          </div>
        )}
        <Champ label="Motif de la décision" htmlFor="motif-decision">
          <Textarea id="motif-decision" required rows={3} value={motif} onChange={(e) => setMotif(e.target.value)} />
        </Champ>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={fermer}>Annuler</Button>
          <Button type="submit" variant={approuver ? "default" : "destructive"} disabled={statuer.isPending}>
            {approuver ? "Approuver" : "Rejeter"}
          </Button>
        </DialogFooter>
      </form>
    </DialogContent>
  );
}

export function DialogueMotif({
  credit,
  action,
  fermer,
}: {
  credit: Credit;
  action: "renvoyer" | "annuler";
  fermer: () => void;
}) {
  const [motif, setMotif] = useState("");
  const renvoi = action === "renvoyer";
  const executer = useAction(
    () => api(`/api/credits/dossiers/${credit.id}/${action}`, { method: "POST", body: { motif } }),
    { succes: renvoi ? "Dossier renvoyé à la saisie." : "Dossier annulé.", invalider: INVALIDER, apres: fermer },
  );
  return (
    <DialogContent className="sm:max-w-md">
      <form className="grid gap-4" onSubmit={(e) => { e.preventDefault(); executer.mutate(); }}>
        <DialogHeader>
          <DialogTitle>{renvoi ? "Renvoyer pour complément" : "Annuler le dossier"} {credit.numero}</DialogTitle>
          <DialogDescription>
            {renvoi ? "Le dossier revient en saisie pour être complété puis soumis à nouveau." : "L'annulation est définitive."}
          </DialogDescription>
        </DialogHeader>
        <Champ label="Motif" htmlFor="motif-dossier">
          <Textarea id="motif-dossier" required rows={3} value={motif} onChange={(e) => setMotif(e.target.value)} />
        </Champ>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={fermer}>Fermer</Button>
          <Button type="submit" variant={renvoi ? "default" : "destructive"} disabled={executer.isPending}>Confirmer</Button>
        </DialogFooter>
      </form>
    </DialogContent>
  );
}

/** Décaissement ou remboursement : en espèces / Mobile Money, ou par le compte d'épargne à vue. */
export function DialogueVersement({
  credit,
  operation,
  fermer,
}: {
  credit: Credit;
  operation: "decaisser" | "rembourser";
  fermer: () => void;
}) {
  const decaissement = operation === "decaisser";
  const tresorerie = useComptesTresorerie();
  const comptesMembre = useQuery({
    queryKey: ["epargne", "comptes", { membre: credit.membre, devise: credit.devise }],
    queryFn: () => api<Page<CompteEpargne>>("/api/epargne/comptes", {
      query: { membre: credit.membre, devise: credit.devise, statut: "ACTIF" },
    }),
  });
  const comptesVue = (comptesMembre.data?.results ?? []).filter((c) => c.produit_type === "VUE");
  const [mode, setMode] = useState<"tresorerie" | "epargne">("tresorerie");
  const [choixCompte, setChoixCompte] = useState("");
  const compteTresorerie = choixCompte || tresorerie.options[0]?.numero || "";
  const [choixEpargne, setChoixEpargne] = useState("");
  const compteEpargne = choixEpargne || String(comptesVue[0]?.id ?? "");
  const [montant, setMontant] = useState(credit.situation?.prochain_montant ?? "");
  const [cle] = useState(() => cleIdempotence());

  const executer = useAction(
    () => api(`/api/credits/dossiers/${credit.id}/${operation}`, {
      method: "POST",
      body: {
        ...(decaissement ? {} : { montant }),
        ...(mode === "tresorerie" ? { compte_tresorerie: compteTresorerie } : { compte_epargne: Number(compteEpargne) }),
        cle_idempotence: cle,
      },
    }),
    { succes: decaissement ? "Crédit décaissé : l'échéancier est établi." : "Remboursement enregistré.",
      invalider: INVALIDER, apres: fermer },
  );
  const pret = mode === "tresorerie" ? !!compteTresorerie : !!compteEpargne;

  return (
    <DialogContent className="sm:max-w-md">
      <form className="grid gap-4" onSubmit={(e) => { e.preventDefault(); executer.mutate(); }}>
        <DialogHeader>
          <DialogTitle>{decaissement ? "Décaisser" : "Rembourser"} – {credit.numero}</DialogTitle>
          <DialogDescription>
            {decaissement
              ? `Montant accordé ${formatMontant(credit.montant_accorde, credit.devise)} ; les frais de dossier sont retenus sur le versement.`
              : `Restant dû ${formatMontant(credit.situation?.total_du, credit.devise)} · impayé ${formatMontant(credit.situation?.impaye, credit.devise)}`}
          </DialogDescription>
        </DialogHeader>
        {!decaissement && (
          <Champ label={`Montant (${credit.devise})`} htmlFor="montant-remboursement"
            aide="Imputé dans l'ordre : pénalités, intérêts, puis capital, de l'échéance la plus ancienne à la plus récente.">
            <Input id="montant-remboursement" type="number" min="0.01" step="0.01" required value={montant}
              onChange={(e) => setMontant(e.target.value)} />
          </Champ>
        )}
        <Champ label={decaissement ? "Versé" : "Payé"} htmlFor="mode-versement">
          <ListeDeroulante id="mode-versement" value={mode} onChange={(e) => setMode(e.target.value as typeof mode)}>
            <option value="tresorerie">En espèces ou par Mobile Money</option>
            <option value="epargne" disabled={!comptesVue.length}>
              {decaissement ? "Sur le compte d'épargne du membre" : "Par débit du compte d'épargne du membre"}
            </option>
          </ListeDeroulante>
        </Champ>
        {mode === "tresorerie" ? (
          <CompteTresorerie label={decaissement ? "Payé depuis" : "Encaissé sur"} valeur={compteTresorerie}
            onChange={setChoixCompte} options={tresorerie.options} sessionOuverte={!!tresorerie.session} />
        ) : (
          <Champ label="Compte d'épargne" htmlFor="compte-epargne">
            <ListeDeroulante id="compte-epargne" value={compteEpargne} onChange={(e) => setChoixEpargne(e.target.value)}>
              {comptesVue.map((c) => (
                <option key={c.id} value={c.id}>{c.numero} – disponible {formatMontant(c.disponible, c.devise)}</option>
              ))}
            </ListeDeroulante>
          </Champ>
        )}
        {decaissement && (
          <Alert><AlertDescription>L&apos;échéancier part de la date comptable du jour.</AlertDescription></Alert>
        )}
        <DialogFooter>
          <Button type="button" variant="outline" onClick={fermer}>Annuler</Button>
          <Button type="submit" disabled={!pret || executer.isPending}>
            {decaissement ? "Décaisser" : "Enregistrer le remboursement"}
          </Button>
        </DialogFooter>
      </form>
    </DialogContent>
  );
}
