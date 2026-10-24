import { Skeleton } from "@/components/ui/skeleton";
import { TableCell, TableRow } from "@/components/ui/table";

export function LignesChargement({ colonnes, lignes = 4 }: { colonnes: number; lignes?: number }) {
  return Array.from({ length: lignes }, (_, i) => (
    <TableRow key={i}>
      {Array.from({ length: colonnes }, (_, j) => (
        <TableCell key={j}>
          <Skeleton className="h-4 w-full" />
        </TableCell>
      ))}
    </TableRow>
  ));
}

export function LigneVide({ colonnes, message }: { colonnes: number; message: string }) {
  return (
    <TableRow>
      <TableCell colSpan={colonnes} className="py-10 text-center text-sm text-muted-foreground">
        {message}
      </TableCell>
    </TableRow>
  );
}
