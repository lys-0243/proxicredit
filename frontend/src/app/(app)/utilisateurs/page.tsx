"use client";

import { useQuery } from "@tanstack/react-query";
import { KeyRoundIcon, MoreHorizontalIcon, PencilIcon, PlusIcon, ShieldOffIcon, UnlockIcon } from "lucide-react";
import { useState } from "react";

import { Champ } from "@/components/champ";
import { LigneVide, LignesChargement } from "@/components/etat-vide";
import { ListeDeroulante } from "@/components/liste-deroulante";
import { PageHeader } from "@/components/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
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
import { Label } from "@/components/ui/label";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ApiError, api, type Page, type Schemas } from "@/lib/api/client";
import { usePermission } from "@/lib/auth";
import { formatDateHeure } from "@/lib/format";
import { useAction } from "@/lib/mutations";

type Utilisateur = Schemas["Utilisateur"];
type Role = Schemas["Role"];

type Formulaire = {
  username: string;
  first_name: string;
  last_name: string;
  email: string;
  telephone: string;
  agence: number | null;
  roles: string[];
  is_active: boolean;
  mot_de_passe: string;
};

function versFormulaire(u: Utilisateur | null): Formulaire {
  return {
    username: u?.username ?? "",
    first_name: u?.first_name ?? "",
    last_name: u?.last_name ?? "",
    email: u?.email ?? "",
    telephone: u?.telephone ?? "",
    agence: u?.agence ?? null,
    roles: u?.roles ?? [],
    is_active: u?.is_active ?? true,
    mot_de_passe: "",
  };
}

function DialogueUtilisateur({
  utilisateur,
  roles,
  agences,
  fermer,
}: {
  utilisateur: Utilisateur | null;
  roles: Role[];
  agences: Schemas["Agence"][];
  fermer: () => void;
}) {
  const [form, setForm] = useState<Formulaire>(versFormulaire(utilisateur));
  const enregistrer = useAction(
    () => {
      const { mot_de_passe, ...reste } = form;
      return utilisateur
        ? api(`/api/utilisateurs/${utilisateur.id}`, { method: "PUT", body: reste })
        : api("/api/utilisateurs", { method: "POST", body: { ...reste, mot_de_passe } });
    },
    { succes: "Utilisateur enregistré.", invalider: [["utilisateurs"]], apres: fermer },
  );
  const champs = enregistrer.error instanceof ApiError ? enregistrer.error.champs : {};
  const maj = (cle: keyof Formulaire) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm({ ...form, [cle]: e.target.value });

  function basculerRole(code: string, coche: boolean) {
    setForm({ ...form, roles: coche ? [...form.roles, code] : form.roles.filter((r) => r !== code) });
  }

  return (
    <DialogContent className="sm:max-w-lg">
      <form
        className="grid gap-4"
        onSubmit={(e) => {
          e.preventDefault();
          enregistrer.mutate();
        }}
      >
        <DialogHeader>
          <DialogTitle>{utilisateur ? `Modifier ${utilisateur.username}` : "Nouvel utilisateur"}</DialogTitle>
          {!utilisateur && (
            <DialogDescription>
              L&apos;utilisateur devra changer son mot de passe provisoire à la première connexion.
            </DialogDescription>
          )}
        </DialogHeader>
        <div className="grid gap-3 sm:grid-cols-2">
          <Champ label="Identifiant" htmlFor="username" erreur={champs.username}>
            <Input id="username" required autoComplete="off" value={form.username} onChange={maj("username")} />
          </Champ>
          <Champ label="Agence" htmlFor="agence" erreur={champs.agence}>
            <ListeDeroulante
              id="agence"
              value={form.agence ?? ""}
              onChange={(e) => setForm({ ...form, agence: e.target.value ? Number(e.target.value) : null })}
            >
              <option value="">Aucune (siège)</option>
              {agences.map((a) => <option key={a.id} value={a.id}>{a.code} – {a.nom}</option>)}
            </ListeDeroulante>
          </Champ>
          <Champ label="Prénom" htmlFor="prenom">
            <Input id="prenom" value={form.first_name} onChange={maj("first_name")} />
          </Champ>
          <Champ label="Nom" htmlFor="nom">
            <Input id="nom" value={form.last_name} onChange={maj("last_name")} />
          </Champ>
          <Champ label="E-mail" htmlFor="email" erreur={champs.email}>
            <Input id="email" type="email" value={form.email} onChange={maj("email")} />
          </Champ>
          <Champ label="Téléphone" htmlFor="tel">
            <Input id="tel" type="tel" value={form.telephone} onChange={maj("telephone")} />
          </Champ>
          {!utilisateur && (
            <Champ label="Mot de passe provisoire" htmlFor="mdp" erreur={champs.mot_de_passe}
              className="sm:col-span-2">
              <Input id="mdp" type="password" autoComplete="new-password" required
                value={form.mot_de_passe} onChange={maj("mot_de_passe")} />
            </Champ>
          )}
        </div>
        <fieldset className="grid gap-2">
          <legend className="mb-1 text-sm font-medium">Rôles</legend>
          <div className="grid gap-2 sm:grid-cols-2">
            {roles.map((r) => (
              <Label key={r.code} className="flex items-center gap-2 font-normal">
                <Checkbox
                  checked={form.roles.includes(r.code)}
                  onCheckedChange={(v) => basculerRole(r.code, v)}
                />
                {r.libelle}
              </Label>
            ))}
          </div>
          {champs.roles && <p className="text-xs text-destructive">{champs.roles}</p>}
        </fieldset>
        <Label className="flex items-center gap-2 font-normal">
          <Checkbox checked={form.is_active} onCheckedChange={(v) => setForm({ ...form, is_active: v })} />
          Compte actif
        </Label>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={fermer}>Annuler</Button>
          <Button type="submit" disabled={enregistrer.isPending}>Enregistrer</Button>
        </DialogFooter>
      </form>
    </DialogContent>
  );
}

function DialogueMotDePasse({ utilisateur, fermer }: { utilisateur: Utilisateur; fermer: () => void }) {
  const [motDePasse, setMotDePasse] = useState("");
  const reinitialiser = useAction(
    () =>
      api(`/api/utilisateurs/${utilisateur.id}/reinitialiser-mot-de-passe`, {
        method: "POST",
        body: { mot_de_passe: motDePasse },
      }),
    { succes: "Mot de passe réinitialisé.", invalider: [["utilisateurs"]], apres: fermer },
  );
  return (
    <DialogContent>
      <form className="grid gap-4" onSubmit={(e) => { e.preventDefault(); reinitialiser.mutate(); }}>
        <DialogHeader>
          <DialogTitle>Réinitialiser le mot de passe</DialogTitle>
          <DialogDescription>
            {utilisateur.username} devra le changer à sa prochaine connexion.
          </DialogDescription>
        </DialogHeader>
        <Champ label="Mot de passe provisoire" htmlFor="mdp-reinit">
          <Input id="mdp-reinit" type="password" autoComplete="new-password" required
            value={motDePasse} onChange={(e) => setMotDePasse(e.target.value)} />
        </Champ>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={fermer}>Annuler</Button>
          <Button type="submit" disabled={reinitialiser.isPending}>Réinitialiser</Button>
        </DialogFooter>
      </form>
    </DialogContent>
  );
}

type Dialogue =
  | { type: "edition"; utilisateur: Utilisateur | null }
  | { type: "mot-de-passe"; utilisateur: Utilisateur };

export default function PageUtilisateurs() {
  const peutCreer = usePermission("accounts.add_utilisateur");
  const peutModifier = usePermission("accounts.change_utilisateur");
  const [recherche, setRecherche] = useState("");
  const [dialogue, setDialogue] = useState<Dialogue | null>(null);

  const utilisateurs = useQuery({
    queryKey: ["utilisateurs", recherche],
    queryFn: () => api<Page<Utilisateur>>("/api/utilisateurs", { query: { search: recherche } }),
  });
  const roles = useQuery({ queryKey: ["roles"], queryFn: () => api<Role[]>("/api/roles") });
  const agences = useQuery({ queryKey: ["agences"], queryFn: () => api<Schemas["Agence"][]>("/api/agences") });
  const libelleRole = (code: string) => roles.data?.find((r) => r.code === code)?.libelle ?? code;

  const deverrouiller = useAction(
    (u: Utilisateur) => api(`/api/utilisateurs/${u.id}/deverrouiller`, { method: "POST" }),
    { succes: "Compte déverrouillé." },
  );
  const reinitialiser2fa = useAction(
    (u: Utilisateur) => api(`/api/utilisateurs/${u.id}/reinitialiser-2fa`, { method: "POST" }),
    { succes: "2FA réinitialisée : l'utilisateur devra la reconfigurer.", invalider: [["utilisateurs"]] },
  );

  return (
    <>
      <PageHeader
        titre="Utilisateurs"
        description="Comptes du personnel, rattachement à une agence et rôles."
        actions={
          <>
            <Input
              placeholder="Rechercher…"
              className="w-56"
              value={recherche}
              onChange={(e) => setRecherche(e.target.value)}
            />
            {peutCreer && (
              <Button onClick={() => setDialogue({ type: "edition", utilisateur: null })}>
                <PlusIcon /> Nouvel utilisateur
              </Button>
            )}
          </>
        }
      />
      <div className="rounded-xl border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Utilisateur</TableHead>
              <TableHead>Agence</TableHead>
              <TableHead>Rôles</TableHead>
              <TableHead>Sécurité</TableHead>
              <TableHead>Dernière connexion</TableHead>
              <TableHead className="w-10" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {utilisateurs.isPending ? (
              <LignesChargement colonnes={6} />
            ) : utilisateurs.data?.results.length ? (
              utilisateurs.data.results.map((u) => (
                <TableRow key={u.id} className={u.is_active ? undefined : "opacity-60"}>
                  <TableCell>
                    <div className="font-medium">{[u.first_name, u.last_name].filter(Boolean).join(" ") || u.username}</div>
                    <div className="text-xs text-muted-foreground">{u.username}</div>
                  </TableCell>
                  <TableCell>{u.agence_detail?.code ?? "Siège"}</TableCell>
                  <TableCell>
                    <div className="flex flex-wrap gap-1">
                      {u.roles.map((r) => <Badge key={r} variant="secondary">{libelleRole(r)}</Badge>)}
                    </div>
                  </TableCell>
                  <TableCell className="space-x-1">
                    {!u.is_active && <Badge variant="destructive">Désactivé</Badge>}
                    {u.otp_active ? <Badge variant="outline">2FA</Badge> : <Badge variant="ghost">Sans 2FA</Badge>}
                    {u.doit_changer_mdp && <Badge variant="outline">Mot de passe provisoire</Badge>}
                  </TableCell>
                  <TableCell className="text-sm">{formatDateHeure(u.last_login) || "Jamais"}</TableCell>
                  <TableCell>
                    {peutModifier && (
                      <DropdownMenu>
                        <DropdownMenuTrigger
                          render={<Button variant="ghost" size="icon-sm" aria-label={`Actions pour ${u.username}`} />}
                        >
                          <MoreHorizontalIcon />
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onClick={() => setDialogue({ type: "edition", utilisateur: u })}>
                            <PencilIcon /> Modifier
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => setDialogue({ type: "mot-de-passe", utilisateur: u })}>
                            <KeyRoundIcon /> Réinitialiser le mot de passe
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => deverrouiller.mutate(u)}>
                            <UnlockIcon /> Déverrouiller
                          </DropdownMenuItem>
                          {u.otp_active && (
                            <DropdownMenuItem onClick={() => reinitialiser2fa.mutate(u)}>
                              <ShieldOffIcon /> Réinitialiser la 2FA
                            </DropdownMenuItem>
                          )}
                        </DropdownMenuContent>
                      </DropdownMenu>
                    )}
                  </TableCell>
                </TableRow>
              ))
            ) : (
              <LigneVide colonnes={6} message="Aucun utilisateur trouvé." />
            )}
          </TableBody>
        </Table>
      </div>

      <Dialog open={dialogue !== null} onOpenChange={(ouvert) => !ouvert && setDialogue(null)}>
        {dialogue?.type === "edition" && (
          <DialogueUtilisateur
            utilisateur={dialogue.utilisateur}
            roles={roles.data ?? []}
            agences={agences.data ?? []}
            fermer={() => setDialogue(null)}
          />
        )}
        {dialogue?.type === "mot-de-passe" && (
          <DialogueMotDePasse utilisateur={dialogue.utilisateur} fermer={() => setDialogue(null)} />
        )}
      </Dialog>
    </>
  );
}
