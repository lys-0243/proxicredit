"use client";

import { useQueryClient } from "@tanstack/react-query";
import { LandmarkIcon, LockIcon, ShieldCheckIcon, UsersIcon } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";

import { Champ } from "@/components/champ";
import { ErreurApi } from "@/components/erreur-api";
import { Button } from "@/components/ui/button";
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
    <form onSubmit={soumettre} className="grid gap-5">
      {!etapeOtp ? (
        <>
          <Champ label="Identifiant" htmlFor="identifiant">
            <Input
              id="identifiant"
              className="h-11"
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
              className="h-11"
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
            className="h-12 text-center font-mono text-lg tracking-[0.5em]"
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
      <Button type="submit" size="lg" className="mt-1 w-full" disabled={envoi}>
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

const ATOUTS = [
  { icone: ShieldCheckIcon, texte: "Double authentification et journal des connexions" },
  { icone: LandmarkIcon, texte: "Comptabilité en partie double, multi-devises USD / CDF" },
  { icone: UsersIcon, texte: "Dossiers membres, KYC et groupes solidaires" },
];

export default function PageConnexion() {
  return (
    <div className="flex min-h-screen bg-card">
      {/* Panneau de marque (desktop) */}
      <div className="relative hidden w-1/2 flex-col justify-between overflow-hidden bg-brand-900 p-12 text-white lg:flex dark:bg-brand-50">
        <div
          aria-hidden
          className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,var(--brand-400),transparent_60%)] opacity-40"
        />
        <div aria-hidden className="grille-fond absolute inset-0 text-white" />

        <div className="relative flex items-center gap-3">
          <span className="flex size-11 items-center justify-center rounded-2xl bg-white/15 text-base font-bold ring-1 ring-white/25 backdrop-blur-md">
            PC
          </span>
          <span className="text-xl font-bold tracking-tight">ProxiCrédit</span>
        </div>

        <div className="relative max-w-lg space-y-8">
          <div>
            <p className="mb-3 text-[0.7rem] font-bold tracking-widest text-white/60 uppercase">
              Core banking microfinance
            </p>
            <h1 className="text-4xl leading-tight font-bold tracking-tight">
              La gestion de votre institution, simple et sûre.
            </h1>
          </div>
          <ul className="space-y-3 rounded-2xl border border-white/15 bg-white/10 p-5 backdrop-blur-md">
            {ATOUTS.map(({ icone: Icone, texte }) => (
              <li key={texte} className="flex items-center gap-3 text-sm text-white/85">
                <span className="flex size-8 shrink-0 items-center justify-center rounded-xl bg-white/15">
                  <Icone className="size-4" />
                </span>
                {texte}
              </li>
            ))}
          </ul>
        </div>

        <p className="relative text-xs text-white/50">© {new Date().getFullYear()} ProxiCrédit</p>
      </div>

      {/* Formulaire */}
      <div className="relative flex w-full items-center justify-center overflow-hidden bg-surface p-4 sm:p-8 lg:w-1/2 lg:bg-card">
        <div
          aria-hidden
          className="absolute inset-0 bg-linear-to-b from-brand-50 via-surface to-brand-100 lg:hidden"
        />
        <div className="relative w-full max-w-md rounded-[1.8rem] border border-card/60 bg-card/65 p-3 shadow-[0_18px_60px_color-mix(in_oklab,var(--brand-600)_18%,transparent)] backdrop-blur-sm sm:p-4 lg:border-0 lg:bg-transparent lg:p-0 lg:shadow-none lg:backdrop-blur-none">
          <div className="rounded-3xl border border-border-soft bg-card p-6 sm:p-8 lg:border-0 lg:p-0">
            <div className="mb-8 text-center lg:text-left">
              <span className="degrade-marque mx-auto mb-4 flex size-12 items-center justify-center rounded-2xl shadow-md shadow-brand-500/25 lg:mx-0">
                <LockIcon className="size-5" />
              </span>
              <h2 className="text-2xl font-bold tracking-tight text-foreground sm:text-3xl">Connexion</h2>
              <p className="mt-1.5 text-sm text-muted-foreground">
                Entrez vos identifiants pour accéder au core banking.
              </p>
            </div>
            <Suspense>
              <FormulaireConnexion />
            </Suspense>
            <p className="mt-8 text-center text-xs text-muted-foreground">
              Contactez votre administrateur pour obtenir vos identifiants.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
