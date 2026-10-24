"use client";

import { useQuery } from "@tanstack/react-query";
import { CalendarDaysIcon, RefreshCwIcon, ShieldCheckIcon } from "lucide-react";
import Link from "next/link";

import { PageHeader } from "@/components/page-header";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { api, type Page, type Schemas } from "@/lib/api/client";
import { useMoi, usePermission } from "@/lib/auth";
import { formatDate, formatTaux } from "@/lib/format";

const MODULES_A_VENIR = [
  "Membres et KYC",
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
        titre={`Bonjour ${moi?.first_name || moi?.username || ""}`}
        description={moi?.agence ? `${moi.agence.code} – ${moi.agence.nom}` : undefined}
      />
      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader>
            <CardDescription className="flex items-center gap-2">
              <CalendarDaysIcon className="size-4" /> Journée comptable
            </CardDescription>
            <CardTitle className="text-2xl">
              {moi?.date_comptable ? formatDate(moi.date_comptable) : "Fermée"}
            </CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground">
            {moi?.date_comptable
              ? "Les opérations sont datées de ce jour."
              : "Aucune opération financière n'est possible tant qu'une journée n'est pas ouverte."}
            <div className="mt-3">
              <Link
                href="/parametres/journees"
                className={buttonVariants({ variant: "outline", size: "sm" })}
              >
                Gérer les journées
              </Link>
            </div>
          </CardContent>
        </Card>

        {voitTaux && (
          <Card>
            <CardHeader>
              <CardDescription className="flex items-center gap-2">
                <RefreshCwIcon className="size-4" /> Taux de change USD / CDF
              </CardDescription>
              <CardTitle className="montant text-2xl">
                {dernierTaux ? `${formatTaux(dernierTaux.taux_reference)} FC` : "Non saisi"}
              </CardTitle>
            </CardHeader>
            <CardContent className="text-sm text-muted-foreground">
              {dernierTaux
                ? `Taux du ${formatDate(dernierTaux.date)} · achat ${formatTaux(dernierTaux.taux_achat)} · vente ${formatTaux(dernierTaux.taux_vente)}`
                : "Saisissez le taux du jour avant toute opération en USD."}
            </CardContent>
          </Card>
        )}

        <Card>
          <CardHeader>
            <CardDescription className="flex items-center gap-2">
              <ShieldCheckIcon className="size-4" /> Mon accès
            </CardDescription>
            <CardTitle className="flex flex-wrap gap-1.5">
              {moi?.roles_libelles.map((role) => (
                <Badge key={role} variant="secondary">
                  {role}
                </Badge>
              ))}
            </CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground">
            Double authentification : {moi?.otp_active ? "activée" : "non activée"}.
          </CardContent>
        </Card>
      </div>

      <Card className="mt-6">
        <CardHeader>
          <CardTitle>Prochains modules</CardTitle>
          <CardDescription>
            Les fondations, la sécurité et la comptabilité sont en place. Les modules métiers
            arrivent dans cet ordre.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ol className="list-decimal space-y-1 pl-5 text-sm">
            {MODULES_A_VENIR.map((m) => (
              <li key={m}>{m}</li>
            ))}
          </ol>
        </CardContent>
      </Card>
    </>
  );
}
