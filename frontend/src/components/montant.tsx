import { formatMontant } from "@/lib/format";
import { cn } from "@/lib/utils";

export function Montant({
  valeur,
  devise,
  className,
}: {
  valeur: string | number | null | undefined;
  devise?: string;
  className?: string;
}) {
  const nul = valeur === null || valeur === undefined || Number(valeur) === 0;
  return (
    <span className={cn("montant", nul && "text-muted-foreground", className)}>
      {nul ? "–" : formatMontant(valeur, devise)}
    </span>
  );
}
