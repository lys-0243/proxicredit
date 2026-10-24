"use client";

import { useQueryClient } from "@tanstack/react-query";
import { LockIcon } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";

import { Champ } from "@/components/champ";
import { ErreurApi } from "@/components/erreur-api";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { api } from "@/lib/api/client";
import { CLE_MOI, type Moi } from "@/lib/auth";

type ReponseConnexion = Moi | { otp_requis: true };

function FormulaireConnexion() {
  const router = useRouter();
  const suite = useSearchParams().get("suite");
  const client = useQueryClient();
  const [identifiant, setIdentifiant] = useState("");
  const [motDePasse, setMotDePasse] = useState("");
  const [code, setCode] = useState("");
  const [etapeOtp, setEtapeOtp] = useState(false);
  const [erreur, setErreur] = useState<unknown>(null);
  const [envoi, setEnvoi] = useState(false);

  async function soumettre(e: React.FormEvent) {
    e.preventDefault();
    setErreur(null);
    setEnvoi(true);
    try {
      const reponse = await api<ReponseConnexion>("/api/auth/connexion", {
        method: "POST",
        body: { username: identifiant, password: motDePasse, code_otp: etapeOtp ? code : undefined },
      });
      if ("otp_requis" in reponse) {
        setEtapeOtp(true);
        return;
      }
      client.setQueryData(CLE_MOI, reponse);
      // Une URL de retour n'est acceptée que si elle reste sur l'application.
      router.replace(suite?.startsWith("/") && !suite.startsWith("//") ? suite : "/");
    } catch (err) {
      setErreur(err);
      if (etapeOtp) setCode("");
    } finally {
      setEnvoi(false);
    }
  }

  return (
    <form onSubmit={soumettre} className="grid gap-4">
      {!etapeOtp ? (
        <>
          <Champ label="Identifiant" htmlFor="identifiant">
            <Input
              id="identifiant"
              autoComplete="username"
              autoFocus
              required
              value={identifiant}
              onChange={(e) => setIdentifiant(e.target.value)}
            />
          </Champ>
          <Champ label="Mot de passe" htmlFor="mot-de-passe">
            <Input
              id="mot-de-passe"
              type="password"
              autoComplete="current-password"
              required
              value={motDePasse}
              onChange={(e) => setMotDePasse(e.target.value)}
            />
          </Champ>
        </>
      ) : (
        <Champ
          label="Code de vérification"
          htmlFor="code"
          aide="Saisissez le code à 6 chiffres affiché par votre application d'authentification."
        >
          <Input
            id="code"
            inputMode="numeric"
            autoComplete="one-time-code"
            pattern="[0-9]{6}"
            maxLength={6}
            autoFocus
            required
            value={code}
            onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
          />
        </Champ>
      )}
      <ErreurApi erreur={erreur} />
      <Button type="submit" size="lg" disabled={envoi}>
        {envoi ? "Connexion…" : etapeOtp ? "Vérifier" : "Se connecter"}
      </Button>
      {etapeOtp && (
        <Button type="button" variant="ghost" onClick={() => setEtapeOtp(false)}>
          Retour
        </Button>
      )}
    </form>
  );
}

export default function PageConnexion() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-muted/40 p-4">
      <Card className="w-full max-w-sm">
        <CardHeader className="text-center">
          <div className="mx-auto mb-2 flex size-11 items-center justify-center rounded-xl bg-primary text-primary-foreground">
            <LockIcon className="size-5" />
          </div>
          <CardTitle className="text-xl">ProxiCrédit</CardTitle>
          <CardDescription>Connectez-vous pour accéder au core banking.</CardDescription>
        </CardHeader>
        <CardContent>
          <Suspense>
            <FormulaireConnexion />
          </Suspense>
        </CardContent>
      </Card>
    </div>
  );
}
