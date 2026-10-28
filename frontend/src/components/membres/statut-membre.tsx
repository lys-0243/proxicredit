import { Badge } from "@/components/ui/badge";
import { STATUTS_MEMBRE, type StatutMembre } from "@/lib/membres";

const VARIANTES: Record<StatutMembre, "success" | "info" | "secondary" | "destructive"> = {
  PROSPECT: "info",
  ACTIF: "success",
  SUSPENDU: "destructive",
  DEMISSIONNAIRE: "secondary",
  DECEDE: "secondary",
};

export function StatutMembreBadge({ statut, listeNoire }: { statut: StatutMembre; listeNoire?: boolean }) {
  return (
    <span className="inline-flex flex-wrap gap-1">
      <Badge variant={VARIANTES[statut]}>{STATUTS_MEMBRE[statut]}</Badge>
      {listeNoire && <Badge variant="destructive">Liste noire</Badge>}
    </span>
  );
}
