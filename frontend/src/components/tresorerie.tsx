"use client";

import Link from "next/link";

import { Champ } from "@/components/champ";
import { ListeDeroulante } from "@/components/liste-deroulante";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { usePermission } from "@/lib/auth";
import { useMaSession } from "@/lib/caisse";

type OptionTresorerie = { numero: string; libelle: string };

/** Comptes qui peuvent recevoir ou verser l'argent. Pour le démarrage, uniquement la caisse de la
 * session ouverte (espèces) ; Mobile Money et banque viendront avec la phase 7. */
export function useComptesTresorerie() {
  const session = useMaSession();
  const options: OptionTresorerie[] = session.data
    ? [{ numero: session.data.compte_numero, libelle: `Espèces – caisse ${session.data.caisse_code}` }]
    : [];
  return { options, session: session.data ?? null, chargement: session.isPending };
}

export function CompteTresorerie({
  valeur,
  onChange,
  options,
  sessionOuverte,
  label = "Encaissé sur",
}: {
  valeur: string;
  onChange: (numero: string) => void;
  options: OptionTresorerie[];
  sessionOuverte: boolean;
  label?: string;
}) {
  if (!sessionOuverte) {
    return (
      <Alert>
        <AlertDescription>
          Les opérations se font en espèces : ouvrez d&apos;abord votre session dans{" "}
          <Link href="/caisse" className="font-semibold underline-offset-2 hover:underline">Ma caisse</Link>.
        </AlertDescription>
      </Alert>
    );
  }
  return (
    <Champ label={label} htmlFor="compte-tresorerie">
      <ListeDeroulante id="compte-tresorerie" value={valeur} onChange={(e) => onChange(e.target.value)}>
        {options.map((o) => <option key={o.numero} value={o.numero}>{o.libelle}</option>)}
      </ListeDeroulante>
    </Champ>
  );
}

/** Numéro d'écriture, cliquable seulement pour qui peut consulter la comptabilité. */
export function LienEcriture({ id, numero }: { id: number; numero: string }) {
  const voitEcritures = usePermission("accounting.view_ecriture");
  if (!voitEcritures) return <>{numero}</>;
  return (
    <Link className="underline-offset-2 hover:underline" href={`/comptabilite/ecritures/${id}`}>
      {numero}
    </Link>
  );
}
