"use client";

import { useQuery } from "@tanstack/react-query";
import { TriangleAlertIcon } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";

import { Champ } from "@/components/champ";
import { ErreurApi } from "@/components/erreur-api";
import { ListeDeroulante } from "@/components/liste-deroulante";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { ApiError, api, type Schemas } from "@/lib/api/client";
import { ETATS_CIVILS, SEXES, TYPES_MEMBRE, TYPES_PIECE, type Membre, type TypeMembre } from "@/lib/membres";

type Definition = {
  nom: string;
  libelle: string;
  type?: "text" | "date" | "tel" | "email" | "number" | "montant";
  options?: Record<string, string>;
  requis?: boolean;
  aide?: string;
};
type Section = { titre: string; champs: Definition[] };

const DEVISES = { CDF: "CDF", USD: "USD" };

const ACTIVITE: Definition[] = [
  { nom: "activite", libelle: "Activité principale", aide: "Commerce, enseignement, transport…" },
  { nom: "revenu_mensuel", libelle: "Revenu mensuel", type: "montant" },
  { nom: "devise_revenu", libelle: "Devise du revenu", options: DEVISES },
  { nom: "charges_mensuelles", libelle: "Charges mensuelles", type: "montant" },
];

const SECTIONS: Record<TypeMembre, Section[]> = {
  PHYSIQUE: [
    {
      titre: "Identité",
      champs: [
        { nom: "nom", libelle: "Nom", requis: true },
        { nom: "postnom", libelle: "Postnom" },
        { nom: "prenom", libelle: "Prénom", requis: true },
        { nom: "sexe", libelle: "Sexe", options: SEXES },
        { nom: "date_naissance", libelle: "Date de naissance", type: "date" },
        { nom: "lieu_naissance", libelle: "Lieu de naissance" },
        { nom: "nationalite", libelle: "Nationalité" },
        { nom: "etat_civil", libelle: "État civil", options: ETATS_CIVILS },
        { nom: "personnes_a_charge", libelle: "Personnes à charge", type: "number" },
      ],
    },
    {
      titre: "Pièce d'identité",
      champs: [
        { nom: "type_piece", libelle: "Type de pièce", options: TYPES_PIECE },
        { nom: "numero_piece", libelle: "Numéro" },
        { nom: "piece_delivree_le", libelle: "Délivrée le", type: "date" },
        { nom: "piece_expire_le", libelle: "Expire le", type: "date" },
      ],
    },
    {
      titre: "Activité et revenus",
      champs: [
        { nom: "profession", libelle: "Profession" },
        { nom: "employeur", libelle: "Employeur" },
        ...ACTIVITE,
      ],
    },
  ],
  MORALE: [
    {
      titre: "Entreprise ou association",
      champs: [
        { nom: "raison_sociale", libelle: "Raison sociale", requis: true },
        { nom: "forme_juridique", libelle: "Forme juridique", aide: "SARL, SA, ASBL, coopérative…" },
        { nom: "rccm", libelle: "RCCM" },
        { nom: "id_nat", libelle: "Identification nationale" },
        { nom: "numero_impot", libelle: "Numéro d'impôt" },
        { nom: "date_creation", libelle: "Date de création", type: "date" },
      ],
    },
    {
      titre: "Représentant légal",
      champs: [
        { nom: "representant_nom", libelle: "Nom complet" },
        { nom: "representant_fonction", libelle: "Fonction" },
        { nom: "representant_telephone", libelle: "Téléphone", type: "tel" },
      ],
    },
    { titre: "Activité", champs: ACTIVITE },
  ],
  GROUPE: [
    {
      titre: "Groupe solidaire",
      champs: [
        { nom: "nom_groupe", libelle: "Nom du groupe", requis: true },
        { nom: "activite", libelle: "Activité commune", aide: "Facultatif" },
      ],
    },
  ],
};

const COORDONNEES: Section = {
  titre: "Coordonnées",
  champs: [
    { nom: "telephone", libelle: "Téléphone principal", type: "tel", aide: "Utilisé pour le Mobile Money et les SMS." },
    { nom: "telephone_secondaire", libelle: "Autre téléphone", type: "tel" },
    { nom: "email", libelle: "E-mail", type: "email" },
    { nom: "province", libelle: "Province" },
    { nom: "ville", libelle: "Ville" },
    { nom: "commune", libelle: "Commune" },
    { nom: "quartier", libelle: "Quartier" },
    { nom: "avenue", libelle: "Avenue" },
    { nom: "numero_adresse", libelle: "Numéro" },
  ],
};

/** Champs envoyés à null quand ils sont vides (dates, nombres, clés étrangères). */
const NULLABLES = new Set([
  "date_naissance", "piece_delivree_le", "piece_expire_le", "date_creation", "personnes_a_charge",
  "revenu_mensuel", "charges_mensuelles", "devise_revenu",
]);

type Valeurs = Record<string, string>;

function valeursDepuis(membre: Membre | null, type: TypeMembre): Valeurs {
  const valeurs: Valeurs = { province: "Kinshasa", ville: "Kinshasa", nationalite: "Congolaise" };
  const source = (membre ?? {}) as Record<string, unknown>;
  for (const section of [...SECTIONS[type], COORDONNEES]) {
    for (const { nom } of section.champs) {
      const v = source[nom];
      if (v !== null && v !== undefined) valeurs[nom] = String(v);
    }
  }
  return valeurs;
}

function useDiffere<T>(valeur: T, delai = 400): T {
  const [differee, setDifferee] = useState(valeur);
  useEffect(() => {
    const minuteur = setTimeout(() => setDifferee(valeur), delai);
    return () => clearTimeout(minuteur);
  }, [valeur, delai]);
  return differee;
}

function DoublonsPossibles({ valeurs }: { valeurs: Valeurs }) {
  const criteres = useDiffere({
    nom: valeurs.nom || valeurs.raison_sociale || valeurs.nom_groupe || "",
    telephone: valeurs.telephone ?? "",
    numero_piece: valeurs.numero_piece ?? "",
  });
  const actif = criteres.nom.length >= 3 || criteres.telephone.length >= 6 || criteres.numero_piece !== "";
  const doublons = useQuery({
    queryKey: ["membres", "doublons", criteres],
    queryFn: () => api<Schemas["MembreListe"][]>("/api/membres/doublons", { query: criteres }),
    enabled: actif,
  });
  if (!actif || !doublons.data?.length) return null;
  return (
    <Alert>
      <TriangleAlertIcon />
      <AlertTitle>Ce membre existe peut-être déjà</AlertTitle>
      <AlertDescription>
        <ul className="mt-1 space-y-0.5">
          {doublons.data.map((m) => (
            <li key={m.id}>
              <Link className="underline" href={`/membres/${m.id}`} target="_blank">
                {m.numero} – {m.nom_complet}
              </Link>{" "}
              ({m.agence_code}{m.telephone ? `, ${m.telephone}` : ""})
            </li>
          ))}
        </ul>
      </AlertDescription>
    </Alert>
  );
}

export function FormulaireMembre({
  membre,
  enregistrer,
  enCours,
  erreur,
}: {
  membre: Membre | null;
  enregistrer: (corps: Record<string, unknown>) => void;
  enCours: boolean;
  erreur: unknown;
}) {
  const [type, setType] = useState<TypeMembre>(membre?.type ?? "PHYSIQUE");
  const [valeurs, setValeurs] = useState<Valeurs>(() => valeursDepuis(membre, membre?.type ?? "PHYSIQUE"));
  const champsErreur = erreur instanceof ApiError ? erreur.champs : {};

  function soumettre(e: React.FormEvent) {
    e.preventDefault();
    const corps: Record<string, unknown> = { type };
    for (const section of [...SECTIONS[type], COORDONNEES]) {
      for (const { nom } of section.champs) {
        const v = (valeurs[nom] ?? "").trim();
        corps[nom] = v === "" && NULLABLES.has(nom) ? null : v;
      }
    }
    enregistrer(corps);
  }

  function rendreChamp(d: Definition) {
    const id = `champ-${d.nom}`;
    const valeur = valeurs[d.nom] ?? "";
    const maj = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
      setValeurs({ ...valeurs, [d.nom]: e.target.value });
    return (
      <Champ key={d.nom} label={d.requis ? `${d.libelle} *` : d.libelle} htmlFor={id} aide={d.aide}
        erreur={champsErreur[d.nom]}>
        {d.options ? (
          <ListeDeroulante id={id} value={valeur} onChange={maj}>
            <option value="">—</option>
            {Object.entries(d.options).map(([code, libelle]) => (
              <option key={code} value={code}>{libelle}</option>
            ))}
          </ListeDeroulante>
        ) : (
          <Input
            id={id}
            required={d.requis}
            type={d.type === "montant" ? "text" : (d.type ?? "text")}
            inputMode={d.type === "montant" ? "decimal" : undefined}
            min={d.type === "number" ? 0 : undefined}
            value={valeur}
            onChange={maj}
            aria-invalid={Boolean(champsErreur[d.nom])}
          />
        )}
      </Champ>
    );
  }

  return (
    <form onSubmit={soumettre} className="grid gap-6">
      {!membre && (
        <fieldset className="grid gap-2">
          <legend className="mb-1 text-sm font-medium">Type de membre</legend>
          <div className="flex flex-wrap gap-2">
            {(Object.keys(TYPES_MEMBRE) as TypeMembre[]).map((t) => (
              <Button key={t} type="button" variant={type === t ? "default" : "outline"}
                aria-pressed={type === t} onClick={() => setType(t)}>
                {TYPES_MEMBRE[t]}
              </Button>
            ))}
          </div>
        </fieldset>
      )}
      {!membre && <DoublonsPossibles valeurs={valeurs} />}
      {[...SECTIONS[type], COORDONNEES].map((section) => (
        <Card key={section.titre}>
          <CardHeader>
            <CardTitle>{section.titre}</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {section.champs.map(rendreChamp)}
          </CardContent>
        </Card>
      ))}
      {!Object.keys(champsErreur).length && <ErreurApi erreur={erreur} />}
      {Object.keys(champsErreur).length > 0 && (
        <p className="text-sm text-destructive">Corrigez les champs signalés en rouge.</p>
      )}
      <div className="flex justify-end">
        <Button type="submit" size="lg" disabled={enCours}>
          {membre ? "Enregistrer les modifications" : "Créer le dossier"}
        </Button>
      </div>
    </form>
  );
}
