"use client";

import { usePathname, useRouter } from "next/navigation";
import { useEffect } from "react";

import { AppShell } from "@/components/app-shell";
import { Skeleton } from "@/components/ui/skeleton";
import { useMoi } from "@/lib/auth";

export default function LayoutApplication({ children }: LayoutProps<"/">) {
  const { data: moi, isPending } = useMoi();
  const pathname = usePathname();
  const router = useRouter();

  // Mot de passe provisoire ou 2FA obligatoire : l'API refuse tout le reste, on guide vers le profil.
  const obligation = moi && (moi.doit_changer_mdp || moi.doit_configurer_2fa);
  useEffect(() => {
    if (obligation && pathname !== "/profil") router.replace("/profil");
  }, [obligation, pathname, router]);

  if (isPending || !moi) {
    return (
      <div className="space-y-4 p-8">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-40 w-full" />
      </div>
    );
  }
  return <AppShell moi={moi}>{children}</AppShell>;
}
