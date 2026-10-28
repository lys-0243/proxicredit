import { InboxIcon } from "lucide-react";

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

export function EtatVide({
  message,
  icone: Icone = InboxIcon,
  children,
}: {
  message: string;
  icone?: React.ElementType;
  children?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col items-center gap-3 px-4 py-14 text-center">
      <div className="pastille-icone ton-neutre size-14">
        <Icone className="size-6!" />
      </div>
      <p className="max-w-sm text-sm font-medium whitespace-normal text-muted-foreground">{message}</p>
      {children}
    </div>
  );
}

export function LigneVide({
  colonnes,
  message,
  icone,
}: {
  colonnes: number;
  message: string;
  icone?: React.ElementType;
}) {
  return (
    <TableRow className="hover:bg-transparent">
      <TableCell colSpan={colonnes} className="p-0">
        <EtatVide message={message} icone={icone} />
      </TableCell>
    </TableRow>
  );
}
