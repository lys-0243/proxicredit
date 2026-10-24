"use client";

import { useRouter } from "next/navigation";

import { FormulaireMembre } from "@/components/membres/formulaire-membre";
import { PageHeader } from "@/components/page-header";
import { api } from "@/lib/api/client";
import type { Membre } from "@/lib/membres";
import { useAction } from "@/lib/mutations";

export default function PageNouveauMembre() {
  const router = useRouter();
  const creer = useAction(
    (corps: Record<string, unknown>) => api<Membre>("/api/membres", { method: "POST", body: corps }),
    {
      succes: "Dossier créé. Ajoutez maintenant les documents KYC.",
      invalider: [["membres"]],
      apres: (membre) => router.push(`/membres/${membre.id}?onglet=documents`),
    },
  );

  return (
    <>
      <PageHeader
        titre="Nouveau membre"
        description="Le dossier est créé en statut prospect. Il sera activé une fois complet et l'adhésion payée, par une autre personne que vous."
      />
      <FormulaireMembre
        membre={null}
        enregistrer={(corps) => creer.mutate(corps)}
        enCours={creer.isPending}
        erreur={creer.error}
      />
    </>
  );
}
