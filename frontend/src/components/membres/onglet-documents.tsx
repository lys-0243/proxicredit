"use client";

import { useQuery } from "@tanstack/react-query";
import { ExternalLinkIcon, FileTextIcon, UploadIcon } from "lucide-react";
import { useRef, useState } from "react";

import { Champ } from "@/components/champ";
import { LigneVide, LignesChargement } from "@/components/etat-vide";
import { ListeDeroulante } from "@/components/liste-deroulante";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { api, type Schemas } from "@/lib/api/client";
import { usePermission } from "@/lib/auth";
import { formatDateHeure } from "@/lib/format";
import { DOCUMENTS_ATTENDUS, TYPES_DOCUMENT, dossierClos, urlDocument, type Membre } from "@/lib/membres";
import { useAction } from "@/lib/mutations";

type TypeDocument = Schemas["TypeDocumentEnum"];

function taille(octets: number) {
  return octets < 1024 * 1024 ? `${Math.ceil(octets / 1024)} Ko` : `${(octets / 1024 / 1024).toFixed(1)} Mo`;
}

export function OngletDocuments({ membre }: { membre: Membre }) {
  const peutAjouter = usePermission("members.add_documentmembre") && !dossierClos(membre.statut);
  const champFichier = useRef<HTMLInputElement>(null);
  const attendus = DOCUMENTS_ATTENDUS[membre.type];
  const [type, setType] = useState<TypeDocument>(attendus[0]);
  const [description, setDescription] = useState("");

  const documents = useQuery({
    queryKey: ["membres", String(membre.id), "documents"],
    queryFn: () => api<Schemas["DocumentMembre"][]>(`/api/membres/${membre.id}/documents`),
  });
  const deposer = useAction(
    (fichier: File) => {
      const corps = new FormData();
      corps.append("type", type);
      corps.append("fichier", fichier);
      corps.append("description", description);
      return api(`/api/membres/${membre.id}/documents`, { method: "POST", body: corps });
    },
    {
      succes: "Document ajouté.",
      invalider: [["membres", String(membre.id)]],
      apres: () => {
        setDescription("");
        if (champFichier.current) champFichier.current.value = "";
      },
    },
  );
  const presents = new Set(documents.data?.map((d) => d.type));

  return (
    <div className="grid gap-4">
      {peutAjouter && (
        <Card>
          <CardHeader>
            <CardTitle>Ajouter un document</CardTitle>
          </CardHeader>
          <CardContent>
            <form
              className="grid gap-4 sm:grid-cols-[14rem_1fr_auto] sm:items-end"
              onSubmit={(e) => {
                e.preventDefault();
                const fichier = champFichier.current?.files?.[0];
                if (fichier) deposer.mutate(fichier);
              }}
            >
              <Champ label="Type de document" htmlFor="type-document">
                <ListeDeroulante id="type-document" value={type} onChange={(e) => setType(e.target.value as TypeDocument)}>
                  {(Object.keys(TYPES_DOCUMENT) as TypeDocument[]).map((t) => (
                    <option key={t} value={t}>{TYPES_DOCUMENT[t]}{presents.has(t) ? " ✓" : ""}</option>
                  ))}
                </ListeDeroulante>
              </Champ>
              <Champ label="Fichier" htmlFor="fichier" aide="JPEG, PNG ou PDF, 5 Mo maximum. Photo et signature : image uniquement.">
                <Input id="fichier" ref={champFichier} type="file" required
                  accept={type === "PHOTO" || type === "SIGNATURE" ? "image/jpeg,image/png" : "image/jpeg,image/png,application/pdf"} />
              </Champ>
              <Button type="submit" disabled={deposer.isPending}>
                <UploadIcon /> {deposer.isPending ? "Envoi…" : "Ajouter"}
              </Button>
              <Champ label="Description (facultative)" htmlFor="description-doc" className="sm:col-span-3">
                <Input id="description-doc" maxLength={255} value={description} onChange={(e) => setDescription(e.target.value)} />
              </Champ>
            </form>
            <p className="mt-3 text-xs text-muted-foreground">
              Attendus pour ce type de membre :{" "}
              {attendus.filter((t) => t !== "AUTRE").map((t) => `${TYPES_DOCUMENT[t]}${presents.has(t) ? " ✓" : ""}`).join(" · ")}
            </p>
          </CardContent>
        </Card>
      )}
      <div className="rounded-xl border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Document</TableHead>
              <TableHead>Fichier d&apos;origine</TableHead>
              <TableHead>Ajouté par</TableHead>
              <TableHead className="w-10" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {documents.isPending ? (
              <LignesChargement colonnes={4} lignes={2} />
            ) : documents.data?.length ? (
              documents.data.map((d) => (
                <TableRow key={d.id}>
                  <TableCell>
                    <div className="flex items-center gap-2 font-medium">
                      <FileTextIcon className="size-4 text-muted-foreground" /> {TYPES_DOCUMENT[d.type]}
                    </div>
                    {d.description && <div className="text-xs text-muted-foreground">{d.description}</div>}
                  </TableCell>
                  <TableCell className="text-sm">
                    {d.nom_origine} <span className="text-muted-foreground">· {taille(d.taille)}</span>
                  </TableCell>
                  <TableCell className="text-sm">
                    {d.ajoute_par}
                    <div className="text-xs text-muted-foreground">{formatDateHeure(d.ajoute_le)}</div>
                  </TableCell>
                  <TableCell>
                    <a href={urlDocument(membre.id, d.id)} target="_blank" rel="noopener"
                      aria-label={`Ouvrir ${TYPES_DOCUMENT[d.type]}`}
                      className="inline-flex size-7 items-center justify-center rounded-md hover:bg-muted">
                      <ExternalLinkIcon className="size-4" />
                    </a>
                  </TableCell>
                </TableRow>
              ))
            ) : (
              <LigneVide colonnes={4} message="Aucun document pour l'instant." />
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
