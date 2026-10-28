import { Badge } from "@/components/ui/badge";

export function StatutEcriture({ statut, contrePassee }: { statut?: string; contrePassee?: boolean }) {
  if (statut === "BROUILLON") return <Badge variant="warning">Brouillon</Badge>;
  if (contrePassee) return <Badge variant="secondary">Contre-passée</Badge>;
  return <Badge variant="success">Validée</Badge>;
}

export const TYPES_OPERATION: Record<string, string> = {
  SAISIE_MANUELLE: "Saisie manuelle",
  CONTRE_PASSATION: "Contre-passation",
};
