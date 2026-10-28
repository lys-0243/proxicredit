"use client";

import { useQueryClient } from "@tanstack/react-query";
import { CameraIcon, Trash2Icon } from "lucide-react";
import { QRCodeSVG } from "qrcode.react";
import { useRef, useState } from "react";
import { toast } from "sonner";

import { AvatarUtilisateur } from "@/components/avatar-utilisateur";
import { Champ } from "@/components/champ";
import { ErreurApi } from "@/components/erreur-api";
import { PageHeader } from "@/components/page-header";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { ApiError, api, type Schemas } from "@/lib/api/client";
import { CLE_MOI, useMoi, useRafraichirMoi, type Moi } from "@/lib/auth";

type ProfilForm = {
  first_name: string;
  last_name: string;
  email: string;
  telephone: string;
};

function InformationsPersonnelles({ moi }: { moi: Moi }) {
  const rafraichirMoi = useRafraichirMoi();
  const client = useQueryClient();
  const [form, setForm] = useState<ProfilForm>({
    first_name: moi.first_name,
    last_name: moi.last_name,
    email: moi.email,
    telephone: moi.telephone,
  });
  const [erreur, setErreur] = useState<unknown>(null);
  const [enCours, setEnCours] = useState(false);

  function maj(cle: keyof ProfilForm) {
    return (e: React.ChangeEvent<HTMLInputElement>) =>
      setForm((f) => ({ ...f, [cle]: e.target.value }));
  }

  async function soumettre(e: React.FormEvent) {
    e.preventDefault();
    setErreur(null);
    setEnCours(true);
    try {
      const misAJour = await api<Schemas["Moi"]>("/api/auth/moi", { method: "PATCH", body: form });
      client.setQueryData(CLE_MOI, misAJour);
      toast.success("Profil mis à jour.");
      await rafraichirMoi();
    } catch (err) {
      setErreur(err);
    } finally {
      setEnCours(false);
    }
  }

  const champs = erreur instanceof ApiError ? erreur.champs : {};
  const erreurParChamp = Object.keys(champs).length > 0;

  return (
    <form onSubmit={soumettre} className="grid gap-4 sm:grid-cols-2">
      <Champ label="Identifiant" htmlFor="username" aide="Géré par l'administrateur.">
        <Input id="username" value={moi.username} disabled />
      </Champ>
      <Champ label="Agence" htmlFor="agence">
        <Input
          id="agence"
          value={moi.agence ? `${moi.agence.code} · ${moi.agence.nom}` : "Aucune agence"}
          disabled
        />
      </Champ>
      <Champ label="Prénom" htmlFor="prenom" erreur={champs.first_name}>
        <Input id="prenom" value={form.first_name} onChange={maj("first_name")} autoComplete="given-name" />
      </Champ>
      <Champ label="Nom" htmlFor="nom" erreur={champs.last_name}>
        <Input id="nom" value={form.last_name} onChange={maj("last_name")} autoComplete="family-name" />
      </Champ>
      <Champ label="E-mail" htmlFor="email" erreur={champs.email}>
        <Input
          id="email"
          type="email"
          value={form.email}
          onChange={maj("email")}
          autoComplete="email"
        />
      </Champ>
      <Champ label="Téléphone" htmlFor="telephone" erreur={champs.telephone}>
        <Input
          id="telephone"
          type="tel"
          value={form.telephone}
          onChange={maj("telephone")}
          autoComplete="tel"
        />
      </Champ>
      <div className="sm:col-span-2">
        {!erreurParChamp && <ErreurApi erreur={erreur} />}
      </div>
      <div className="sm:col-span-2">
        <Button type="submit" disabled={enCours}>
          Enregistrer les informations
        </Button>
      </div>
    </form>
  );
}

function PhotoProfil({ moi }: { moi: Moi }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const client = useQueryClient();
  const rafraichirMoi = useRafraichirMoi();
  const [erreur, setErreur] = useState<unknown>(null);
  const [enCours, setEnCours] = useState(false);

  async function appliquer(misAJour: Schemas["Moi"]) {
    client.setQueryData(CLE_MOI, misAJour);
    await rafraichirMoi();
  }

  async function deposer(fichier: File) {
    setErreur(null);
    setEnCours(true);
    try {
      const corps = new FormData();
      corps.append("photo", fichier);
      const misAJour = await api<Schemas["Moi"]>("/api/auth/moi/photo", {
        method: "POST",
        body: corps,
      });
      await appliquer(misAJour);
      toast.success("Photo de profil mise à jour.");
    } catch (err) {
      setErreur(err);
    } finally {
      setEnCours(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  async function supprimer() {
    setErreur(null);
    setEnCours(true);
    try {
      const misAJour = await api<Schemas["Moi"]>("/api/auth/moi/photo", { method: "DELETE" });
      await appliquer(misAJour);
      toast.success("Photo de profil supprimée.");
    } catch (err) {
      setErreur(err);
    } finally {
      setEnCours(false);
    }
  }

  return (
    <div className="flex flex-col items-start gap-4 sm:flex-row sm:items-center">
      <AvatarUtilisateur moi={moi} taille="lg" className="ring-4 ring-card shadow-lg" />
      <div className="grid gap-3">
        <p className="text-sm text-muted-foreground">
          JPEG ou PNG, 2 Mo maximum. La photo apparaît dans la barre supérieure sur tout le système.
        </p>
        <div className="flex flex-wrap gap-2">
          <input
            ref={inputRef}
            type="file"
            accept="image/jpeg,image/png,.jpg,.jpeg,.png"
            className="sr-only"
            onChange={(e) => {
              const fichier = e.target.files?.[0];
              if (fichier) void deposer(fichier);
            }}
          />
          <Button
            type="button"
            variant="outline"
            disabled={enCours}
            onClick={() => inputRef.current?.click()}
          >
            <CameraIcon /> {moi.photo ? "Changer la photo" : "Ajouter une photo"}
          </Button>
          {moi.photo && (
            <Button type="button" variant="ghost" disabled={enCours} onClick={supprimer}>
              <Trash2Icon /> Supprimer
            </Button>
          )}
        </div>
        <ErreurApi erreur={erreur} />
      </div>
    </div>
  );
}

function ChangerMotDePasse() {
  const rafraichirMoi = useRafraichirMoi();
  const [ancien, setAncien] = useState("");
  const [nouveau, setNouveau] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [erreur, setErreur] = useState<unknown>(null);

  async function soumettre(e: React.FormEvent) {
    e.preventDefault();
    setErreur(null);
    if (nouveau !== confirmation) {
      setErreur(new Error("La confirmation ne correspond pas au nouveau mot de passe."));
      return;
    }
    try {
      await api("/api/auth/mot-de-passe", { method: "POST", body: { ancien, nouveau } });
      toast.success("Mot de passe modifié.");
      setAncien("");
      setNouveau("");
      setConfirmation("");
      await rafraichirMoi();
    } catch (err) {
      setErreur(err);
    }
  }

  const champs = erreur instanceof ApiError ? erreur.champs : {};
  const erreurParChamp = Object.keys(champs).length > 0;
  return (
    <form onSubmit={soumettre} className="grid max-w-sm gap-4">
      <Champ label="Mot de passe actuel" htmlFor="ancien" erreur={champs.ancien}>
        <Input
          id="ancien"
          type="password"
          autoComplete="current-password"
          required
          value={ancien}
          onChange={(e) => setAncien(e.target.value)}
        />
      </Champ>
      <Champ
        label="Nouveau mot de passe"
        htmlFor="nouveau"
        erreur={champs.nouveau}
        aide="10 caractères minimum, pas uniquement des chiffres."
      >
        <Input
          id="nouveau"
          type="password"
          autoComplete="new-password"
          required
          value={nouveau}
          onChange={(e) => setNouveau(e.target.value)}
        />
      </Champ>
      <Champ label="Confirmation" htmlFor="confirmation">
        <Input
          id="confirmation"
          type="password"
          autoComplete="new-password"
          required
          value={confirmation}
          onChange={(e) => setConfirmation(e.target.value)}
        />
      </Champ>
      {!erreurParChamp && <ErreurApi erreur={erreur} />}
      <Button type="submit" className="w-fit">
        Changer le mot de passe
      </Button>
    </form>
  );
}

type ConfigurationOtp = { secret: string; uri: string };

function DoubleAuthentification({ active }: { active: boolean }) {
  const rafraichirMoi = useRafraichirMoi();
  const [config, setConfig] = useState<ConfigurationOtp | null>(null);
  const [code, setCode] = useState("");
  const [erreur, setErreur] = useState<unknown>(null);

  async function demarrer() {
    setErreur(null);
    try {
      setConfig(await api<ConfigurationOtp>("/api/auth/2fa/configurer", { method: "POST" }));
    } catch (err) {
      setErreur(err);
    }
  }

  async function activer(e: React.FormEvent) {
    e.preventDefault();
    setErreur(null);
    try {
      await api("/api/auth/2fa/activer", { method: "POST", body: { code } });
      toast.success("Double authentification activée.");
      setConfig(null);
      await rafraichirMoi();
    } catch (err) {
      setErreur(err);
    }
  }

  if (active) {
    return (
      <p className="text-sm">
        La double authentification est <strong>activée</strong>. Un code vous est demandé à chaque
        connexion.
      </p>
    );
  }
  if (!config) {
    return (
      <div className="grid gap-3">
        <p className="text-sm text-muted-foreground">
          Protégez votre compte avec une application comme Google Authenticator, Microsoft
          Authenticator ou FreeOTP.
        </p>
        <ErreurApi erreur={erreur} />
        <Button onClick={demarrer} className="w-fit">
          Configurer la 2FA
        </Button>
      </div>
    );
  }
  return (
    <form onSubmit={activer} className="grid gap-4 sm:grid-cols-[auto_1fr] sm:items-start">
      <div className="w-fit rounded-lg bg-white p-3">
        <QRCodeSVG value={config.uri} size={168} />
      </div>
      <div className="grid max-w-sm gap-3">
        <p className="text-sm">
          1. Scannez ce QR code avec votre application. Sans caméra, saisissez cette clé :
          <code className="mt-1 block rounded-lg bg-muted px-2.5 py-1.5 font-mono text-xs break-all">
            {config.secret}
          </code>
        </p>
        <Champ label="2. Code affiché par l'application" htmlFor="code-2fa">
          <Input
            id="code-2fa"
            inputMode="numeric"
            maxLength={6}
            required
            autoFocus
            value={code}
            onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
          />
        </Champ>
        <ErreurApi erreur={erreur} />
        <Button type="submit" className="w-fit">
          Activer
        </Button>
      </div>
    </form>
  );
}

export default function PageProfil() {
  const { data: moi } = useMoi();
  if (!moi) return null;
  return (
    <>
      <PageHeader titre="Profil et sécurité" description={`Connecté en tant que ${moi.username}`} />
      {(moi.doit_changer_mdp || moi.doit_configurer_2fa) && (
        <Alert className="mb-6">
          <AlertTitle>Action requise avant de continuer</AlertTitle>
          <AlertDescription>
            {moi.doit_changer_mdp
              ? "Votre mot de passe est provisoire : choisissez un mot de passe personnel."
              : "La double authentification est obligatoire pour votre rôle."}
          </AlertDescription>
        </Alert>
      )}
      <div className="mb-6 grid gap-6">
        <Card>
          <CardHeader>
            <CardTitle>Photo de profil</CardTitle>
            <CardDescription>Visible dans la barre supérieure sur toutes les pages.</CardDescription>
          </CardHeader>
          <CardContent>
            <PhotoProfil moi={moi} />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Informations personnelles</CardTitle>
            <CardDescription>
              Identifiant et agence sont gérés par l&apos;administrateur.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <InformationsPersonnelles moi={moi} />
          </CardContent>
        </Card>
      </div>
      <div className="grid gap-6 xl:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Mot de passe</CardTitle>
            <CardDescription>Changez régulièrement votre mot de passe.</CardDescription>
          </CardHeader>
          <CardContent>
            <ChangerMotDePasse />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Double authentification (2FA)</CardTitle>
            <CardDescription>Un code temporaire, en plus du mot de passe.</CardDescription>
          </CardHeader>
          <CardContent>
            <DoubleAuthentification active={moi.otp_active} />
          </CardContent>
        </Card>
      </div>
    </>
  );
}
