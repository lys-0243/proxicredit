"use client";

import {
  BookOpenIcon,
  BuildingIcon,
  CalendarDaysIcon,
  CalendarOffIcon,
  CoinsIcon,
  ContactIcon,
  FileTextIcon,
  LayoutDashboardIcon,
  ListTreeIcon,
  LogOutIcon,
  MenuIcon,
  MoonIcon,
  RefreshCwIcon,
  ScaleIcon,
  ShieldCheckIcon,
  SunIcon,
  UserIcon,
  UsersIcon,
} from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTheme } from "next-themes";
import { useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { api } from "@/lib/api/client";
import { aPermission, type Moi } from "@/lib/auth";
import { formatDate } from "@/lib/format";
import { cn } from "@/lib/utils";

type Entree = { href: string; libelle: string; icone: React.ElementType; permission?: string };

const NAVIGATION: { titre?: string; entrees: Entree[] }[] = [
  { entrees: [{ href: "/", libelle: "Tableau de bord", icone: LayoutDashboardIcon }] },
  {
    titre: "Clientèle",
    entrees: [
      { href: "/membres", libelle: "Membres", icone: ContactIcon, permission: "members.view_membre" },
    ],
  },
  {
    titre: "Comptabilité",
    entrees: [
      { href: "/comptabilite/ecritures", libelle: "Écritures", icone: FileTextIcon,
        permission: "accounting.view_ecriture" },
      { href: "/comptabilite/balance", libelle: "Balance", icone: ScaleIcon,
        permission: "accounting.voir_etats" },
      { href: "/comptabilite/grand-livre", libelle: "Grand livre", icone: BookOpenIcon,
        permission: "accounting.voir_etats" },
      { href: "/comptabilite/plan-comptable", libelle: "Plan comptable", icone: ListTreeIcon,
        permission: "accounting.view_comptecomptable" },
    ],
  },
  {
    titre: "Paramétrage",
    entrees: [
      { href: "/parametres/journees", libelle: "Journées comptables", icone: CalendarDaysIcon,
        permission: "core.view_journeecomptable" },
      { href: "/parametres/taux-change", libelle: "Taux de change", icone: RefreshCwIcon,
        permission: "core.view_tauxchange" },
      { href: "/parametres/agences", libelle: "Agences", icone: BuildingIcon,
        permission: "core.view_agence" },
      { href: "/parametres/devises", libelle: "Devises", icone: CoinsIcon,
        permission: "core.view_devise" },
      { href: "/parametres/jours-feries", libelle: "Jours fériés", icone: CalendarOffIcon,
        permission: "core.view_jourferie" },
    ],
  },
  {
    titre: "Administration",
    entrees: [
      { href: "/utilisateurs", libelle: "Utilisateurs", icone: UsersIcon,
        permission: "accounts.view_utilisateur" },
      { href: "/utilisateurs/connexions", libelle: "Journal des connexions", icone: ShieldCheckIcon,
        permission: "accounts.view_journalconnexion" },
    ],
  },
];

function estActif(pathname: string, href: string) {
  return href === "/" ? pathname === "/" : pathname === href || pathname.startsWith(`${href}/`);
}

export function AppShell({ moi, children }: { moi: Moi; children: React.ReactNode }) {
  const pathname = usePathname();
  const [menuOuvert, setMenuOuvert] = useState(false);
  const { resolvedTheme, setTheme } = useTheme();

  const sections = NAVIGATION.map((section) => ({
    ...section,
    entrees: section.entrees.filter((e) => !e.permission || aPermission(moi, e.permission)),
  })).filter((section) => section.entrees.length > 0);

  async function deconnecter() {
    await api("/api/auth/deconnexion", { method: "POST" }).catch(() => undefined);
    // Rechargement complet volontaire : vide le cache des requêtes de l'utilisateur précédent.
    // eslint-disable-next-line @next/next/no-location-assign-relative-destination
    window.location.assign("/connexion");
  }

  return (
    <div className="flex min-h-screen">
      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-40 w-64 border-r bg-sidebar text-sidebar-foreground transition-transform",
          "lg:static lg:translate-x-0",
          menuOuvert ? "translate-x-0" : "-translate-x-full",
        )}
      >
        <div className="flex h-14 items-center gap-2 border-b px-4">
          <div className="flex size-8 items-center justify-center rounded-lg bg-sidebar-primary text-sm font-bold text-sidebar-primary-foreground">
            PC
          </div>
          <span className="font-semibold">ProxiCrédit</span>
        </div>
        <nav className="space-y-5 overflow-y-auto p-3">
          {sections.map((section, i) => (
            <div key={section.titre ?? i}>
              {section.titre && (
                <p className="mb-1 px-2 text-xs font-medium tracking-wide text-muted-foreground uppercase">
                  {section.titre}
                </p>
              )}
              <ul className="space-y-0.5">
                {section.entrees.map(({ href, libelle, icone: Icone }) => (
                  <li key={href}>
                    <Link
                      href={href}
                      onClick={() => setMenuOuvert(false)}
                      className={cn(
                        "flex items-center gap-2.5 rounded-md px-2 py-1.5 text-sm transition-colors",
                        estActif(pathname, href)
                          ? "bg-sidebar-accent font-medium text-sidebar-accent-foreground"
                          : "text-sidebar-foreground/80 hover:bg-sidebar-accent/60",
                      )}
                    >
                      <Icone className="size-4" />
                      {libelle}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </nav>
      </aside>
      {menuOuvert && (
        <div
          className="fixed inset-0 z-30 bg-black/20 lg:hidden"
          onClick={() => setMenuOuvert(false)}
          aria-hidden
        />
      )}

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-20 flex h-14 items-center gap-3 border-b bg-background/95 px-4 backdrop-blur">
          <Button
            variant="ghost"
            size="icon"
            className="lg:hidden"
            onClick={() => setMenuOuvert(true)}
            aria-label="Ouvrir le menu"
          >
            <MenuIcon />
          </Button>
          <div className="flex min-w-0 flex-1 items-center gap-3 text-sm">
            <span className="truncate font-medium">{moi.agence?.nom ?? "Aucune agence"}</span>
            {moi.date_comptable ? (
              <Badge variant="secondary">Journée du {formatDate(moi.date_comptable)}</Badge>
            ) : (
              <Badge variant="destructive">Journée fermée</Badge>
            )}
          </div>
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setTheme(resolvedTheme === "dark" ? "light" : "dark")}
            aria-label="Changer de thème"
          >
            {resolvedTheme === "dark" ? <SunIcon /> : <MoonIcon />}
          </Button>
          <DropdownMenu>
            <DropdownMenuTrigger render={<Button variant="outline" />}>
              <UserIcon />
              <span className="hidden sm:inline">{moi.first_name || moi.username}</span>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56">
              <DropdownMenuGroup>
                <DropdownMenuLabel>
                  <div className="font-medium">
                    {[moi.first_name, moi.last_name].filter(Boolean).join(" ") || moi.username}
                  </div>
                  <div className="text-xs font-normal text-muted-foreground">
                    {moi.roles_libelles.join(", ") || "Aucun rôle"}
                  </div>
                </DropdownMenuLabel>
              </DropdownMenuGroup>
              <DropdownMenuSeparator />
              <DropdownMenuItem render={<Link href="/profil" />}>
                <ShieldCheckIcon /> Profil et sécurité
              </DropdownMenuItem>
              <DropdownMenuItem onClick={deconnecter}>
                <LogOutIcon /> Se déconnecter
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </header>
        <main className="flex-1 p-4 sm:p-6 lg:p-8">{children}</main>
      </div>
    </div>
  );
}
