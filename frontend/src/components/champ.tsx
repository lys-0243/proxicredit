import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

/** Libellé + contrôle + message d'erreur. */
export function Champ({
  label,
  htmlFor,
  erreur,
  aide,
  className,
  children,
}: {
  label: string;
  htmlFor?: string;
  erreur?: string;
  aide?: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div className={cn("grid content-start gap-1.5", className)}>
      <Label htmlFor={htmlFor} className="font-semibold">
        {label}
      </Label>
      {children}
      {aide && !erreur && <p className="text-xs text-muted-foreground">{aide}</p>}
      {erreur && <p className="text-xs text-destructive">{erreur}</p>}
    </div>
  );
}
