"use client";

import { useQuery } from "@tanstack/react-query";
import {
  BanIcon,
  BuildingIcon,
  CalendarDaysIcon,
  CheckCircle2Icon,
  CircleIcon,
  HashIcon,
  MoreHorizontalIcon,
  PencilIcon,
  TagIcon,
  UserCheckIcon,
  UsersIcon,
} from "lucide-react";
import Link from "next/link";
import { useState } from "react";

import { Champ } from "@/components/champ";
import { ListeDeroulante } from "@/components/liste-deroulante";
import { StatutMembreBadge } from "@/components/membres/statut-membre";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button, buttonVariants } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { api, type Schemas } from "@/lib/api/client";
import { useMoi, usePermission } from "@/lib/auth";
import { formatDate } from "@/lib/format";
import { ACTIONS_STATUT, TYPES_MEMBRE, dossierClos, urlDocument, type Membre } from "@/lib/membres";
import { useAction } from "@/lib/mutations";

type Dialogue = "activation" | "statut" | "liste-noire" | null;

function Avatar({ membre }: { membre: Membre }) {
  if (membre.photo) {
    return (
      // Fichier privé servi par l'API (cookies de session) : pas d'optimisation d'image Next.js.
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={urlDocument(membre.id, membre.photo)}
        alt={`Photo de ${membre.nom_complet}`}
        className="size-20 rounded-2xl object-cover shadow-lg ring-4 ring-card lg:size-24"
      />
    );
  }
  const initiales = membre.nom_complet
    .split(" ")
    .slice(0, 2)
    .map((m) => m[0])
    .join("");
  return (
    <div className="degrade-marque flex size-20 items-center justify-center rounded-2xl text-2xl font-bold shadow-lg ring-4 ring-card lg:size-24 lg:text-3xl">
      {initiales}
    </div>
  );
}

function DialogueActivation({ membre, fermer }: { membre: Membre; fermer: () => void }) {
  const { data: moi } = useMoi();
  const controle = useQuery({
    queryKey: ["membres", String(membre.id), "controle"],
    queryFn: () => api<Schemas["ControleActivation"]>(`/api/membres/${membre.id}/controle-activation`),
  });
  const activer = useAction(() => api(`/api/membres/${membre.id}/activer`, { method: "POST" }), {
    succes: "Membre activé.",
    invalider: [["membres"]],
    apres: fermer,
  });
  const estCreateur = membre.cree_par === moi?.username;

  return (
    <DialogContent className="sm:max-w-md">
      <DialogHeader>
        <DialogTitle>Activer {membre.nom_complet}</DialogTitle>
        <DialogDescription>Le dossier doit être complet et l&apos;adhésion payée.</DialogDescription>
      </DialogHeader>
      {controle.data && (
        controle.data.pret ? (
          <p className="flex items-center gap-2 text-sm">
            <CheckCircle2Icon className="size-4 text-success-strong" /> Dossier complet.
          </p>
        ) : (
          <ul className="space-y-1.5 text-sm">
            {controle.data.manquants.map((m) => (
              <li key={m} className="flex items-start gap-2">
                <CircleIcon className="mt-0.5 size-4 shrink-0 text-destructive" /> {m}
              </li>
            ))}
          </ul>
        )
      )}
      {estCreateur && (
        <Alert>
          <AlertDescription>
            Vous avez créé ce dossier : une autre personne habilitée doit l&apos;activer (contrôle à
            quatre yeux).
          </AlertDescription>
        </Alert>
      )}
      <DialogFooter>
        <Button variant="outline" onClick={fermer}>Fermer</Button>
        <Button disabled={!controle.data?.pret || estCreateur || activer.isPending} onClick={() => activer.mutate()}>
          Activer le membre
        </Button>
      </DialogFooter>
    </DialogContent>
  );
}

function DialogueStatut({ membre, fermer }: { membre: Membre; fermer: () => void }) {
  const actions = (Object.keys(ACTIONS_STATUT) as Schemas["ActionEnum"][]).filter((a) =>
    ACTIONS_STATUT[a].depuis.includes(membre.statut),
  );
  const [action, setAction] = useState(actions[0]);
  const [motif, setMotif] = useState("");
  const changer = useAction(
    () => api(`/api/membres/${membre.id}/statut`, { method: "POST", body: { action, motif } }),
    { succes: "Statut mis à jour.", invalider: [["membres"]], apres: fermer },
  );
  const definitif = action === "demission" || action === "deces";

  return (
    <DialogContent className="sm:max-w-md">
      <form className="grid gap-4" onSubmit={(e) => { e.preventDefault(); changer.mutate(); }}>
        <DialogHeader>
          <DialogTitle>Changer le statut</DialogTitle>
          <DialogDescription>{membre.nom_complet}</DialogDescription>
        </DialogHeader>
        <Champ label="Action" htmlFor="action-statut">
          <ListeDeroulante id="action-statut" value={action}
            onChange={(e) => setAction(e.target.value as Schemas["ActionEnum"])}>
            {actions.map((a) => <option key={a} value={a}>{ACTIONS_STATUT[a].libelle}</option>)}
          </ListeDeroulante>
        </Champ>
        <Champ label="Motif" htmlFor="motif-statut">
          <Input id="motif-statut" required maxLength={255} value={motif} onChange={(e) => setMotif(e.target.value)} />
        </Champ>
        {definitif && (
          <Alert variant="destructive">
            <AlertDescription>Le dossier sera clôturé et ne pourra plus être modifié.</AlertDescription>
          </Alert>
        )}
        <DialogFooter>
          <Button type="button" variant="outline" onClick={fermer}>Annuler</Button>
          <Button type="submit" variant={definitif ? "destructive" : "default"} disabled={changer.isPending}>
            Confirmer
          </Button>
        </DialogFooter>
      </form>
    </DialogContent>
  );
}

function DialogueListeNoire({ membre, fermer }: { membre: Membre; fermer: () => void }) {
  const inscrire = !membre.en_liste_noire;
  const [motif, setMotif] = useState("");
  const enregistrer = useAction(
    () => api(`/api/membres/${membre.id}/liste-noire`, { method: "POST", body: { inscrire, motif } }),
    { succes: inscrire ? "Membre inscrit sur la liste noire." : "Membre retiré de la liste noire.",
      invalider: [["membres"]], apres: fermer },
  );
  return (
    <DialogContent className="sm:max-w-md">
      <form className="grid gap-4" onSubmit={(e) => { e.preventDefault(); enregistrer.mutate(); }}>
        <DialogHeader>
          <DialogTitle>{inscrire ? "Inscrire sur la liste noire" : "Retirer de la liste noire"}</DialogTitle>
          <DialogDescription>
            {inscrire
              ? "Un membre sur liste noire ne peut ni être activé, ni payer d'adhésion, ni obtenir de crédit."
              : `Motif de l'inscription : ${membre.motif_liste_noire}`}
          </DialogDescription>
        </DialogHeader>
        <Champ label="Motif" htmlFor="motif-ln">
          <Input id="motif-ln" required maxLength={255} value={motif} onChange={(e) => setMotif(e.target.value)} />
        </Champ>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={fermer}>Annuler</Button>
          <Button type="submit" variant={inscrire ? "destructive" : "default"} disabled={enregistrer.isPending}>
            Confirmer
          </Button>
        </DialogFooter>
      </form>
    </DialogContent>
  );
}

export function EnTeteMembre({ membre }: { membre: Membre }) {
  const peutModifier = usePermission("members.change_membre");
  const peutActiver = usePermission("members.activer_membre");
  const peutChangerStatut = usePermission("members.changer_statut_membre");
  const peutListeNoire = usePermission("members.gerer_liste_noire");
  const [dialogue, setDialogue] = useState<Dialogue>(null);
  const clos = dossierClos(membre.statut);
  const actionsStatut = Object.values(ACTIONS_STATUT).some((a) => a.depuis.includes(membre.statut));
  const fermer = () => setDialogue(null);

  return (
    <div className="carte-nue mb-6">
      {/* Bandeau décoratif */}
      <div className="relative h-20 bg-linear-to-br from-brand-200 via-brand-50 to-surface lg:h-24">
        <div aria-hidden className="grille-fond absolute inset-0 text-brand-700 opacity-60" />
      </div>

      <div className="flex flex-wrap items-end gap-4 px-5 pb-5 lg:px-6">
        <div className="-mt-10 shrink-0 lg:-mt-12">
          <Avatar membre={membre} />
        </div>
        <div className="min-w-0 flex-1 pt-3">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-xl font-bold tracking-tight lg:text-2xl">{membre.nom_complet}</h1>
            <StatutMembreBadge statut={membre.statut} listeNoire={membre.en_liste_noire} />
          </div>
          <div className="mt-1.5 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted-foreground">
            <span className="inline-flex items-center gap-1.5 font-mono text-xs">
              <HashIcon className="size-3.5" />
              {membre.numero}
            </span>
            <span className="inline-flex items-center gap-1.5">
              <TagIcon className="size-3.5" />
              {TYPES_MEMBRE[membre.type]}
            </span>
            <span className="inline-flex items-center gap-1.5">
              <BuildingIcon className="size-3.5" />
              Agence {membre.agence_code}
            </span>
            {membre.active_le && (
              <span className="inline-flex items-center gap-1.5">
                <CalendarDaysIcon className="size-3.5" />
                Membre depuis le {formatDate(membre.active_le)}
              </span>
            )}
            {membre.groupe_actuel && (
              <span className="inline-flex items-center gap-1.5">
                <UsersIcon className="size-3.5" />
                {membre.groupe_actuel.fonction} du groupe
                <Link
                  className="font-semibold text-primary hover:underline"
                  href={`/membres/${membre.groupe_actuel.id}`}
                >
                  {membre.groupe_actuel.nom}
                </Link>
              </span>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2">
          {membre.statut === "PROSPECT" && peutActiver && (
            <Button onClick={() => setDialogue("activation")}>
              <UserCheckIcon /> Activer
            </Button>
          )}
          {peutModifier && !clos && (
            <Link href={`/membres/${membre.id}/modifier`} className={buttonVariants({ variant: "outline" })}>
              <PencilIcon /> Modifier
            </Link>
          )}
          {((peutChangerStatut && actionsStatut) || (peutListeNoire && !clos)) && (
            <DropdownMenu>
              <DropdownMenuTrigger render={<Button variant="outline" size="icon" aria-label="Autres actions" />}>
                <MoreHorizontalIcon />
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                {peutChangerStatut && actionsStatut && (
                  <DropdownMenuItem onClick={() => setDialogue("statut")}>Changer le statut…</DropdownMenuItem>
                )}
                {peutListeNoire && !clos && (
                  <DropdownMenuItem onClick={() => setDialogue("liste-noire")}>
                    <BanIcon /> {membre.en_liste_noire ? "Retirer de la liste noire…" : "Inscrire sur la liste noire…"}
                  </DropdownMenuItem>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </div>
      </div>
      <Dialog open={dialogue !== null} onOpenChange={(ouvert) => !ouvert && fermer()}>
        {dialogue === "activation" && <DialogueActivation membre={membre} fermer={fermer} />}
        {dialogue === "statut" && <DialogueStatut membre={membre} fermer={fermer} />}
        {dialogue === "liste-noire" && <DialogueListeNoire membre={membre} fermer={fermer} />}
      </Dialog>
    </div>
  );
}
