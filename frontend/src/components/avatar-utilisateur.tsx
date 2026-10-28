import type { Moi } from "@/lib/auth";
import { cn } from "@/lib/utils";

function initiales(moi: Pick<Moi, "first_name" | "last_name" | "username">) {
  const nom = [moi.first_name, moi.last_name].filter(Boolean).join(" ") || moi.username;
  return nom
    .split(/\s+/)
    .map((mot) => mot[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);
}

export function AvatarUtilisateur({
  moi,
  className,
  taille = "md",
}: {
  moi: Pick<Moi, "first_name" | "last_name" | "username" | "photo">;
  className?: string;
  taille?: "sm" | "md" | "lg";
}) {
  const dimensions = {
    sm: "size-8 text-xs",
    md: "size-10 text-sm",
    lg: "size-20 text-2xl",
  }[taille];

  if (moi.photo) {
    return (
      // Fichier privé servi par l'API (cookies de session) : pas d'optimisation Next.js.
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={moi.photo}
        alt=""
        className={cn("shrink-0 rounded-full object-cover", dimensions, className)}
      />
    );
  }

  return (
    <span
      className={cn(
        "flex shrink-0 items-center justify-center rounded-full bg-primary/10 font-bold text-primary",
        dimensions,
        className,
      )}
      aria-hidden
    >
      {initiales(moi)}
    </span>
  );
}
