"use client";

import { useRouter } from "next/navigation";

import { FormulaireEcriture, valeursInitiales } from "@/components/comptabilite/formulaire-ecriture";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { api, type Schemas } from "@/lib/api/client";
import { useAction } from "@/lib/mutations";

export default function PageNouvelleEcriture() {
  const router = useRouter();
  const creer = useAction(
    (corps: unknown) => api<Schemas["Ecriture"]>("/api/comptabilite/ecritures", { method: "POST", body: corps }),
    {
      succes: "Brouillon enregistré. Un autre utilisateur doit maintenant le valider.",
      invalider: [["comptabilite", "ecritures"]],
      apres: (ecriture) => router.push(`/comptabilite/ecritures/${ecriture.id}`),
    },
  );

  return (
    <>
      <PageHeader
        titre="Nouvelle saisie"
        description="Opération diverse enregistrée en brouillon, puis validée par un autre utilisateur (contrôle à quatre yeux)."
      />
      <Card>
        <CardContent>
          <FormulaireEcriture
            initial={valeursInitiales()}
            enregistrer={(corps) => creer.mutate(corps)}
            enCours={creer.isPending}
            erreur={creer.error}
            libelleBouton="Enregistrer le brouillon"
          />
        </CardContent>
      </Card>
    </>
  );
}
