"use client";

import { useQuery } from "@tanstack/react-query";
import { ArrowRightIcon, CalendarDaysIcon, RefreshCwIcon, ShieldCheckIcon } from "lucide-react";
import Link from "next/link";

import { PageHeader } from "@/components/page-header";
import { StatCard } from "@/components/stat-card";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { api, type Page, type Schemas } from "@/lib/api/client";
import { useMoi, usePermission } from "@/lib/auth";
import { formatDate, formatTaux } from "@/lib/format";

const MODULES_A_VENIR = [
  "Épargne et caisse",
  "Crédits Éducation et Secours (simulateur, demandes, comité, décaissement)",
  "Garanties et groupes solidaires",
  "Clôture journalière, pénalités et provisions",
  "Mobile Money et SMS",
  "Reporting et rapports BCC",
];

export default function TableauDeBord() {
  const { data: moi } = useMoi();
  const voitTaux = usePermission("core.view_tauxchange");
  const taux = useQuery({
    queryKey: ["taux-change", "dernier"],
    queryFn: () =>
      api<Page<Schemas["TauxChange"]>>("/api/taux-change", {
        query: { devise_source: "USD", devise_cible: "CDF", taille: 1 },
      }),
    enabled: voitTaux,
  });
  const dernierTaux = taux.data?.results[0];

  return (
    <>
      <PageHeader
        surtitre="Tableau de bord"
        titre={`Bonjour ${moi?.first_name || moi?.username || ""}`}
        description={moi?.agence ? `${moi.agence.code} – ${moi.agence.nom}` : undefined}
      />
      <div className="grid gap-4 md:grid-cols-3">
        <StatCard
          titre="Journée comptable"
          icone={CalendarDaysIcon}
          ton={moi?.date_comptable ? "success" : "danger"}
          valeur={moi?.date_comptable ? formatDate(moi.date_comptable) : "Fermée"}
          detail={
            moi?.date_comptable
              ? "Les opérations sont datées de ce jour."
              : "Aucune opération financière n'est possible tant qu'une journée n'est pas ouverte."
          }
        >
          <Link
            href="/parametres/journees"
            className={buttonVariants({ variant: "outline", size: "sm", className: "mt-auto w-fit" })}
          >
            Gérer les journées <ArrowRightIcon />
          </Link>
        </StatCard>

        {voitTaux && (
          <StatCard
            titre="Taux USD / CDF"
            icone={RefreshCwIcon}
            ton={dernierTaux ? "brand" : "warning"}
            valeur={
              dernierTaux ? (
                <span className="montant">
                  {formatTaux(dernierTaux.taux_reference)}
                  <span className="ml-1 text-base font-semibold text-muted-foreground">FC</span>
                </span>
              ) : (
                "Non saisi"
              )
            }
            detail={
              dernierTaux
                ? `Taux du ${formatDate(dernierTaux.date)} · achat ${formatTaux(dernierTaux.taux_achat)} · vente ${formatTaux(dernierTaux.taux_vente)}`
                : "Saisissez le taux du jour avant toute opération en USD."
            }
          />
        )}

        <StatCard
          titre="Mon accès"
          icone={ShieldCheckIcon}
          ton={moi?.otp_active ? "success" : "warning"}
          valeur={
            <span className="flex flex-wrap gap-1.5">
              {moi?.roles_libelles.length ? (
                moi.roles_libelles.map((role) => (
                  <Badge key={role} variant="info">
                    {role}
                  </Badge>
                ))
              ) : (
                <span className="text-base text-muted-foreground">Aucun rôle</span>
              )}
            </span>
          }
          detail={
            <span className="flex items-center gap-1.5">
              Double authentification :
              <Badge variant={moi?.otp_active ? "success" : "warning"}>
                {moi?.otp_active ? "activée" : "non activée"}
              </Badge>
            </span>
          }
        />
      </div>

      <section className="carte mt-6">
        <p className="surtitre mb-1">Feuille de route</p>
        <h2 className="text-lg font-bold tracking-tight">Prochains modules</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Les fondations, la sécurité, la comptabilité et les membres sont en place. Les modules métiers
          arrivent dans cet ordre.
        </p>
        <ol className="mt-5 grid gap-2 sm:grid-cols-2">
          {MODULES_A_VENIR.map((m, i) => (
            <li
              key={m}
              className="flex items-start gap-3 rounded-xl border border-border-soft bg-surface/60 px-4 py-3 text-sm"
            >
              <span className="flex size-6 shrink-0 items-center justify-center rounded-lg bg-info-soft text-xs font-bold text-info-strong">
                {i + 1}
              </span>
              <span className="pt-0.5">{m}</span>
            </li>
          ))}
        </ol>
      </section>
    </>
  );
}
