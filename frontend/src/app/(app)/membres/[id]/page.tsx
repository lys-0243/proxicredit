"use client";

import { useQuery } from "@tanstack/react-query";
import { ArrowLeftIcon } from "lucide-react";
import Link from "next/link";
import { useParams, usePathname, useRouter, useSearchParams } from "next/navigation";
import { Suspense } from "react";

import { ErreurApi } from "@/components/erreur-api";
import { EnTeteMembre } from "@/components/membres/en-tete-membre";
import { OngletBeneficiaires } from "@/components/membres/onglet-beneficiaires";
import { OngletDocuments } from "@/components/membres/onglet-documents";
import { OngletCredits, OngletEpargne } from "@/components/membres/onglet-finances";
import { OngletGroupe } from "@/components/membres/onglet-groupe";
import { OngletHistorique } from "@/components/membres/onglet-historique";
import { OngletIdentite } from "@/components/membres/onglet-identite";
import { buttonVariants } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { api } from "@/lib/api/client";
import { usePermission } from "@/lib/auth";
import type { Membre } from "@/lib/membres";

function FicheMembre() {
  const { id } = useParams<{ id: string }>();
  const onglet = useSearchParams().get("onglet") ?? "identite";
  const router = useRouter();
  const pathname = usePathname();
  const voitDocuments = usePermission("members.view_documentmembre");
  const voitEpargne = usePermission("savings.view_compteepargne");
  const voitCredits = usePermission("credits.view_credit");
  const membre = useQuery({ queryKey: ["membres", id], queryFn: () => api<Membre>(`/api/membres/${id}`) });

  if (membre.isPending) return <Skeleton className="h-96 w-full" />;
  if (membre.error) return <ErreurApi erreur={membre.error} />;
  const m = membre.data;

  const onglets = [
    { valeur: "identite", libelle: "Identité", contenu: <OngletIdentite membre={m} /> },
    ...(voitDocuments ? [{ valeur: "documents", libelle: "Documents KYC", contenu: <OngletDocuments membre={m} /> }] : []),
    ...(voitEpargne ? [{ valeur: "epargne", libelle: "Épargne", contenu: <OngletEpargne membre={m} /> }] : []),
    ...(voitCredits ? [{ valeur: "credits", libelle: "Crédits", contenu: <OngletCredits membre={m} /> }] : []),
    ...(m.type === "GROUPE" ? [{ valeur: "groupe", libelle: "Composition", contenu: <OngletGroupe groupe={m} /> }] : []),
    ...(m.type !== "GROUPE" ? [{ valeur: "beneficiaires", libelle: "Bénéficiaires", contenu: <OngletBeneficiaires membre={m} /> }] : []),
    { valeur: "historique", libelle: "Historique", contenu: <OngletHistorique membre={m} /> },
  ];
  const actif = onglets.some((o) => o.valeur === onglet) ? onglet : "identite";

  return (
    <>
      <Link href="/membres" className={buttonVariants({ variant: "ghost", size: "sm", className: "mb-2 -ml-2" })}>
        <ArrowLeftIcon /> Membres
      </Link>
      <EnTeteMembre membre={m} />
      <Tabs
        value={actif}
        onValueChange={(valeur) => router.replace(`${pathname}?onglet=${valeur}`, { scroll: false })}
      >
        <TabsList className="flex-wrap">
          {onglets.map((o) => <TabsTrigger key={o.valeur} value={o.valeur}>{o.libelle}</TabsTrigger>)}
        </TabsList>
        {onglets.map((o) => (
          <TabsContent key={o.valeur} value={o.valeur} className="pt-2">{o.contenu}</TabsContent>
        ))}
      </Tabs>
    </>
  );
}

export default function PageFicheMembre() {
  return (
    <Suspense>
      <FicheMembre />
    </Suspense>
  );
}
