"use client";

import { QRCodeSVG } from "qrcode.react";
import { useState } from "react";
import { toast } from "sonner";

import { Champ } from "@/components/champ";
import { ErreurApi } from "@/components/erreur-api";
import { PageHeader } from "@/components/page-header";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { ApiError, api } from "@/lib/api/client";
import { useMoi, useRafraichirMoi } from "@/lib/auth";

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
