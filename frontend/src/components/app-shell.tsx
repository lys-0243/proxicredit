"use client";

import {
  BookOpenIcon,
  BuildingIcon,
  CalendarDaysIcon,
  CalendarOffIcon,
  ChevronsLeftIcon,
  ChevronsRightIcon,
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
  UsersIcon,
  XIcon,
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
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
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

const TOUTES_LES_ENTREES = NAVIGATION.flatMap((s) => s.entrees);
const CLE_REPLIE = "proxicredit.sidebar-repliee";

/** Entrée de menu la plus spécifique couvrant le chemin (« /utilisateurs/connexions » l'emporte sur « /utilisateurs »). */
function entreeActive(pathname: string): Entree | undefined {
  return TOUTES_LES_ENTREES.filter((e) =>
    e.href === "/" ? pathname === "/" : pathname === e.href || pathname.startsWith(`${e.href}/`),
  ).sort((a, b) => b.href.length - a.href.length)[0];
}

function titrePage(pathname: string) {
  if (pathname === "/profil") return "Profil et sécurité";
  return entreeActive(pathname)?.libelle ?? "ProxiCrédit";
}

function initiales(moi: Moi) {
  const nom = [moi.first_name, moi.last_name].filter(Boolean).join(" ") || moi.username;
  return nom
    .split(/\s+/)
    .map((mot) => mot[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);
}

function lireReplie() {
  try {
    return localStorage.getItem(CLE_REPLIE) === "1";
  } catch {
    return false;
  }
}

export function AppShell({ moi, children }: { moi: Moi; children: React.ReactNode }) {
  const pathname = usePathname();
  const [menuOuvert, setMenuOuvert] = useState(false);
  const [replie, setReplie] = useState(lireReplie);
  const { resolvedTheme, setTheme } = useTheme();

  const actif = entreeActive(pathname)?.href;
  const nomComplet = [moi.first_name, moi.last_name].filter(Boolean).join(" ") || moi.username;
  const sections = NAVIGATION.map((section) => ({
    ...section,
    entrees: section.entrees.filter((e) => !e.permission || aPermission(moi, e.permission)),
  })).filter((section) => section.entrees.length > 0);

  function basculerReplie() {
    setReplie(!replie);
    try {
      localStorage.setItem(CLE_REPLIE, replie ? "0" : "1");
    } catch {
      // Préférence purement locale : on ignore un stockage indisponible.
    }
  }

  async function deconnecter() {
    await api("/api/auth/deconnexion", { method: "POST" }).catch(() => undefined);
    // Rechargement complet volontaire : vide le cache des requêtes de l'utilisateur précédent.
    // eslint-disable-next-line @next/next/no-location-assign-relative-destination
    window.location.assign("/connexion");
  }

  return (
    <div className="flex min-h-screen bg-surface">
      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-40 flex w-64 flex-col border-r border-sidebar-border bg-sidebar text-sidebar-foreground transition-[width,translate] duration-200",
          "lg:sticky lg:top-0 lg:h-screen lg:translate-x-0",
          replie && "lg:w-17",
          menuOuvert ? "translate-x-0 shadow-2xl" : "-translate-x-full",
        )}
      >
        {/* En-tête : monogramme + nom */}
        <div className={cn("flex h-16 shrink-0 items-center gap-3 px-4", replie && "lg:justify-center lg:px-0")}>
          <Link href="/" className="flex min-w-0 items-center gap-3" onClick={() => setMenuOuvert(false)}>
            <span className="degrade-marque flex size-9 shrink-0 items-center justify-center rounded-xl text-sm font-bold shadow-md shadow-brand-500/25">
              PC
            </span>
            <span className={cn("min-w-0 leading-tight", replie && "lg:sr-only")}>
              <span className="block truncate text-base font-bold tracking-tight text-foreground">ProxiCrédit</span>
              <span className="surtitre block">Core banking</span>
            </span>
          </Link>
          <Button
            variant="ghost"
            size="icon-sm"
            className="ml-auto text-muted-foreground lg:hidden"
            onClick={() => setMenuOuvert(false)}
            aria-label="Fermer le menu"
          >
            <XIcon />
          </Button>
        </div>

        {/* Navigation */}
        <nav className="flex-1 space-y-6 overflow-y-auto px-3 py-4">
          {sections.map((section, i) => (
            <div key={section.titre ?? i}>
              {section.titre && (
                <>
                  <p className={cn("surtitre mb-2 px-3", replie && "lg:hidden")}>{section.titre}</p>
                  {replie && <div className="mx-auto mb-2 hidden h-px w-6 bg-sidebar-border lg:block" />}
                </>
              )}
              <ul className="space-y-1">
                {section.entrees.map(({ href, libelle, icone: Icone }) => {
                  const estActif = href === actif;
                  const lien = (
                    <Link
                      href={href}
                      onClick={() => setMenuOuvert(false)}
                      aria-current={estActif ? "page" : undefined}
                      className={cn(
                        "group flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-semibold transition-all duration-150",
                        replie && "lg:justify-center lg:px-0",
                        estActif
                          ? "degrade-marque shadow-md shadow-brand-500/25"
                          : "text-sidebar-foreground/85 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
                      )}
                    >
                      <Icone
                        className={cn(
                          "size-4.5 shrink-0 transition-colors",
                          estActif ? "text-white" : "text-muted-foreground group-hover:text-sidebar-accent-foreground",
                        )}
                      />
                      <span className={cn("truncate", replie && "lg:sr-only")}>{libelle}</span>
                    </Link>
                  );
                  return (
                    <li key={href}>
                      {replie ? (
                        <Tooltip>
                          <TooltipTrigger render={lien} />
                          <TooltipContent side="right" sideOffset={10}>
                            {libelle}
                          </TooltipContent>
                        </Tooltip>
                      ) : (
                        lien
                      )}
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </nav>

        {/* Pied : utilisateur, repli, déconnexion */}
        <div className="shrink-0 space-y-1 border-t border-sidebar-border p-3">
          <Link
            href="/profil"
            onClick={() => setMenuOuvert(false)}
            className={cn(
              "group flex items-center gap-3 rounded-xl px-2 py-2 transition-colors hover:bg-sidebar-accent",
              replie && "lg:justify-center lg:px-0",
            )}
            title="Profil et sécurité"
          >
            <span className="degrade-marque flex size-9 shrink-0 items-center justify-center rounded-full text-xs font-bold ring-2 ring-brand-500/20 ring-offset-2 ring-offset-sidebar">
              {initiales(moi)}
            </span>
            <span className={cn("min-w-0 leading-tight", replie && "lg:sr-only")}>
              <span className="block truncate text-sm font-semibold text-foreground group-hover:text-primary">
                {nomComplet}
              </span>
              <span className="block truncate text-[11px] text-muted-foreground">
                {moi.roles_libelles[0] ?? moi.email}
              </span>
            </span>
          </Link>
          <button
            type="button"
            onClick={deconnecter}
            className={cn(
              "flex w-full items-center gap-3 rounded-xl px-3 py-2 text-sm font-semibold text-destructive transition-colors hover:bg-destructive-soft",
              replie && "lg:justify-center lg:px-0",
            )}
          >
            <LogOutIcon className="size-4.5 shrink-0" />
            <span className={cn(replie && "lg:sr-only")}>Déconnexion</span>
          </button>
          <button
            type="button"
            onClick={basculerReplie}
            className={cn(
              "hidden w-full items-center gap-3 rounded-xl px-3 py-2 text-xs font-semibold text-muted-foreground transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground lg:flex",
              replie && "lg:justify-center lg:px-0",
            )}
            aria-label={replie ? "Déplier le menu" : "Replier le menu"}
          >
            {replie ? <ChevronsRightIcon className="size-4" /> : <ChevronsLeftIcon className="size-4" />}
            <span className={cn(replie && "lg:sr-only")}>Replier le menu</span>
          </button>
        </div>
      </aside>
      {menuOuvert && (
        <div
          className="fixed inset-0 z-30 bg-foreground/20 backdrop-blur-xs lg:hidden"
          onClick={() => setMenuOuvert(false)}
          aria-hidden
        />
      )}

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-20 flex h-16 shrink-0 items-center gap-3 border-b border-border-soft bg-card/90 px-4 backdrop-blur sm:px-6 lg:px-8">
          <Button
            variant="ghost"
            size="icon"
            className="-ml-1 lg:hidden"
            onClick={() => setMenuOuvert(true)}
            aria-label="Ouvrir le menu"
          >
            <MenuIcon />
          </Button>
          <div className="min-w-0 flex-1 leading-tight">
            <p className="truncate text-lg font-bold tracking-tight text-foreground">{titrePage(pathname)}</p>
            <p className="truncate text-xs text-muted-foreground">
              {moi.agence ? `${moi.agence.code} · ${moi.agence.nom}` : "Aucune agence"}
            </p>
          </div>
          {moi.date_comptable ? (
            <Badge variant="success" className="hidden sm:inline-flex">
              <CalendarDaysIcon /> Journée du {formatDate(moi.date_comptable)}
            </Badge>
          ) : (
            <Badge variant="destructive" className="hidden sm:inline-flex">
              <CalendarOffIcon /> Journée fermée
            </Badge>
          )}
          <Button
            variant="ghost"
            size="icon"
            className="text-muted-foreground hover:text-foreground"
            onClick={() => setTheme(resolvedTheme === "dark" ? "light" : "dark")}
            aria-label="Changer de thème"
          >
            {resolvedTheme === "dark" ? <SunIcon /> : <MoonIcon />}
          </Button>
          <DropdownMenu>
            <DropdownMenuTrigger
              render={
                <button
                  type="button"
                  className="flex items-center gap-2.5 rounded-xl p-1 pr-1 transition-colors hover:bg-muted md:pr-3"
                />
              }
            >
              <span className="flex size-8 items-center justify-center rounded-full bg-primary/10 text-xs font-bold text-primary">
                {initiales(moi)}
              </span>
              <span className="hidden text-left leading-tight md:block">
                <span className="block max-w-36 truncate text-sm font-semibold text-foreground">
                  {moi.first_name || moi.username}
                </span>
                <span className="block max-w-36 truncate text-[11px] text-muted-foreground">
                  {moi.roles_libelles[0] ?? "Aucun rôle"}
                </span>
              </span>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-60">
              <DropdownMenuGroup>
                <DropdownMenuLabel>
                  <div className="font-semibold text-foreground">{nomComplet}</div>
                  <div className="text-xs font-normal text-muted-foreground">
                    {moi.roles_libelles.join(", ") || "Aucun rôle"}
                  </div>
                </DropdownMenuLabel>
              </DropdownMenuGroup>
              <DropdownMenuSeparator />
              <DropdownMenuItem render={<Link href="/profil" />}>
                <ShieldCheckIcon /> Profil et sécurité
              </DropdownMenuItem>
              <DropdownMenuItem variant="destructive" onClick={deconnecter}>
                <LogOutIcon /> Se déconnecter
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </header>
        <main className="flex-1 px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
          <div className="mx-auto w-full max-w-7xl">{children}</div>
        </main>
      </div>
    </div>
  );
}
