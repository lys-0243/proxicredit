"use client";

import { useQuery } from "@tanstack/react-query";
import { useParams, useRouter } from "next/navigation";

import { ErreurApi } from "@/components/erreur-api";
import { FormulaireMembre } from "@/components/membres/formulaire-membre";
import { PageHeader } from "@/components/page-header";
import { Skeleton } from "@/components/ui/skeleton";
import { api } from "@/lib/api/client";
import type { Membre } from "@/lib/membres";
import { useAction } from "@/lib/mutations";

export default function PageModifierMembre() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const membre = useQuery({ queryKey: ["membres", id], queryFn: () => api<Membre>(`/api/membres/${id}`) });
  const modifier = useAction(
    (corps: Record<string, unknown>) => api<Membre>(`/api/membres/${id}`, { method: "PATCH", body: corps }),
    {
      succes: "Dossier mis à jour.",
      invalider: [["membres"]],
      apres: () => router.push(`/membres/${id}`),
    },
  );

  if (membre.isPending) return <Skeleton className="h-96 w-full" />;
  if (membre.error) return <ErreurApi erreur={membre.error} />;
  return (
    <>
      <PageHeader titre={`Modifier ${membre.data.numero}`} description={membre.data.nom_complet} />
      <FormulaireMembre
        membre={membre.data}
        enregistrer={(corps) => modifier.mutate(corps)}
        enCours={modifier.isPending}
        erreur={modifier.error}
      />
    </>
  );
}
