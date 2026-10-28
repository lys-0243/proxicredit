import { cn } from "@/lib/utils";

export type Ton = "brand" | "success" | "warning" | "danger" | "neutre";

const TONS: Record<Ton, string> = {
  brand: "ton-brand",
  success: "ton-success",
  warning: "ton-warning",
  danger: "ton-danger",
  neutre: "ton-neutre",
};

/** Indicateur clé : sur-titre, valeur forte, détail et pastille d'icône teintée. */
export function StatCard({
  titre,
  valeur,
  detail,
  icone: Icone,
  ton = "brand",
  className,
  children,
}: {
  titre: string;
  valeur: React.ReactNode;
  detail?: React.ReactNode;
  icone?: React.ElementType;
  ton?: Ton;
  className?: string;
  children?: React.ReactNode;
}) {
  return (
    <div className={cn("carte flex flex-col gap-3", className)}>
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0 space-y-1">
          <p className="surtitre">{titre}</p>
          <div className="text-2xl font-bold tracking-tight text-foreground">{valeur}</div>
        </div>
        {Icone && (
          <div className={cn("pastille-icone", TONS[ton])}>
            <Icone />
          </div>
        )}
      </div>
      {detail && <div className="text-sm text-muted-foreground">{detail}</div>}
      {children}
    </div>
  );
}
