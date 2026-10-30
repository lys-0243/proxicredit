"use client";

import { useQuery } from "@tanstack/react-query";
import { PencilIcon, PlusIcon } from "lucide-react";
import { useState } from "react";

import type { ProduitCredit } from "@/components/credits/communs";
import { LignesChargement } from "@/components/etat-vide";
import { Montant } from "@/components/montant";
import { PageHeader } from "@/components/page-header";
import { FormulaireProduitCredit } from "@/components/parametres/formulaire-produit-credit";
import { FormulaireProduitEpargne } from "@/components/parametres/formulaire-produit-epargne";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { api, type Schemas } from "@/lib/api/client";
import { usePermission } from "@/lib/auth";
import { METHODES_CREDIT, PERIODICITES, formatPourcentage } from "@/lib/credits";
import { TYPES_PRODUIT_EPARGNE } from "@/lib/epargne";

type Edition =
  | { nature: "credit"; produit: ProduitCredit | null }
  | { nature: "epargne"; produit: Schemas["ProduitEpargne"] | null }
  | null;

function BoutonModifier({ onClick }: { onClick: () => void }) {
  return (
    <Button variant="ghost" size="icon-sm" aria-label="Modifier" onClick={onClick}>
      <PencilIcon />
    </Button>
  );
}

export default function PageProduits() {
  const peutCreerCredit = usePermission("credits.add_produitcredit");
  const peutModifierCredit = usePermission("credits.change_produitcredit");
  const peutCreerEpargne = usePermission("savings.add_produitepargne");
  const peutModifierEpargne = usePermission("savings.change_produitepargne");
  const [edition, setEdition] = useState<Edition>(null);
  // Tous les produits, y compris ceux qui ne sont plus proposés.
  const credits = useQuery({
    queryKey: ["credits", "produits", "tous"],
    queryFn: () => api<ProduitCredit[]>("/api/credits/produits"),
  });
  const epargne = useQuery({
    queryKey: ["epargne", "produits", "tous"],
    queryFn: () => api<Schemas["ProduitEpargne"][]>("/api/epargne/produits"),
  });
  const fermer = () => setEdition(null);

  return (
    <>
      <PageHeader
        titre="Produits"
        description="Conditions des produits de crédit et d'épargne, fixées par la direction. Les valeurs de départ sont à confirmer."
      />
      <div className="mb-3 flex items-center justify-between gap-3">
        <h2 className="text-base font-bold">Crédit</h2>
        {peutCreerCredit && (
          <Button size="sm" onClick={() => setEdition({ nature: "credit", produit: null })}>
            <PlusIcon /> Nouveau produit de crédit
          </Button>
        )}
      </div>
      <div className="carte-nue mb-8">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Produit</TableHead>
              <TableHead>Calcul</TableHead>
              <TableHead className="text-right">Taux / période</TableHead>
              <TableHead>Durée</TableHead>
              <TableHead>Montants</TableHead>
              <TableHead className="text-right">Frais</TableHead>
              <TableHead className="text-right">Épargne exigée</TableHead>
              <TableHead>Pénalités</TableHead>
              <TableHead>État</TableHead>
              <TableHead />
            </TableRow>
          </TableHeader>
          <TableBody>
            {credits.isPending ? (
              <LignesChargement colonnes={10} lignes={2} />
            ) : (
              (credits.data ?? []).map((p) => (
                <TableRow key={p.id}>
                  <TableCell>
                    <span className="font-semibold">{p.libelle}</span>
                    <span className="block font-mono text-xs text-muted-foreground">{p.code}</span>
                  </TableCell>
                  <TableCell className="text-sm">
                    {METHODES_CREDIT[p.methode ?? "DEGRESSIF"]}
                    <span className="block text-xs text-muted-foreground">{PERIODICITES[p.periodicite ?? "MENSUELLE"]}</span>
                  </TableCell>
                  <TableCell className="text-right">{formatPourcentage(p.taux_interet)}</TableCell>
                  <TableCell className="text-sm">{p.duree_min} à {p.duree_max} échéances</TableCell>
                  <TableCell className="text-sm">
                    {p.plafonds.map((l) => (
                      <span key={l.devise} className="block">
                        <Montant valeur={l.montant_min} /> à <Montant valeur={l.montant_max} devise={l.devise} />
                      </span>
                    ))}
                  </TableCell>
                  <TableCell className="text-right">{formatPourcentage(p.frais_dossier_taux)}</TableCell>
                  <TableCell className="text-right">{formatPourcentage(p.epargne_garantie_taux)}</TableCell>
                  <TableCell className="text-sm">
                    {formatPourcentage(p.taux_penalite_jour)} par jour
                    <span className="block text-xs text-muted-foreground">après {p.jours_grace} jour(s) de grâce</span>
                  </TableCell>
                  <TableCell>{p.actif ? <Badge variant="success">Actif</Badge> : <Badge variant="secondary">Inactif</Badge>}</TableCell>
                  <TableCell className="text-right">
                    {peutModifierCredit && <BoutonModifier onClick={() => setEdition({ nature: "credit", produit: p })} />}
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
      <div className="mb-3 flex items-center justify-between gap-3">
        <h2 className="text-base font-bold">Épargne</h2>
        {peutCreerEpargne && (
          <Button size="sm" onClick={() => setEdition({ nature: "epargne", produit: null })}>
            <PlusIcon /> Nouveau produit d&apos;épargne
          </Button>
        )}
      </div>
      <div className="carte-nue">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Produit</TableHead>
              <TableHead>Type</TableHead>
              <TableHead>Devise</TableHead>
              <TableHead>Compte</TableHead>
              <TableHead className="text-right">Solde minimum</TableHead>
              <TableHead>Retraits</TableHead>
              <TableHead>État</TableHead>
              <TableHead />
            </TableRow>
          </TableHeader>
          <TableBody>
            {epargne.isPending ? (
              <LignesChargement colonnes={8} lignes={2} />
            ) : (
              (epargne.data ?? []).map((p) => (
                <TableRow key={p.id}>
                  <TableCell>
                    <span className="font-semibold">{p.libelle}</span>
                    <span className="block font-mono text-xs text-muted-foreground">{p.code}</span>
                  </TableCell>
                  <TableCell className="text-sm">{TYPES_PRODUIT_EPARGNE[p.type]}</TableCell>
                  <TableCell>{p.devise}</TableCell>
                  <TableCell className="font-mono text-xs">{p.compte_numero}</TableCell>
                  <TableCell className="text-right"><Montant valeur={p.solde_minimum} devise={p.devise} /></TableCell>
                  <TableCell className="text-sm">{p.retrait_libre ? "Libres" : "Interdits au guichet"}</TableCell>
                  <TableCell>{p.actif ? <Badge variant="success">Actif</Badge> : <Badge variant="secondary">Inactif</Badge>}</TableCell>
                  <TableCell className="text-right">
                    {peutModifierEpargne && <BoutonModifier onClick={() => setEdition({ nature: "epargne", produit: p })} />}
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
      <Dialog open={edition !== null} onOpenChange={(o) => !o && fermer()}>
        {edition?.nature === "credit" && <FormulaireProduitCredit produit={edition.produit} fermer={fermer} />}
        {edition?.nature === "epargne" && <FormulaireProduitEpargne produit={edition.produit} fermer={fermer} />}
      </Dialog>
    </>
  );
}
