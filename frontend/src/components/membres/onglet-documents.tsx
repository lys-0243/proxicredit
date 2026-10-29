"use client";

import { useQuery } from "@tanstack/react-query";
import {
  CheckCircle2Icon,
  ExternalLinkIcon,
  EyeIcon,
  FileTextIcon,
  IdCardIcon,
  ImageIcon,
  PenLineIcon,
  UploadIcon,
} from "lucide-react";
import { useRef, useState } from "react";

import { Champ } from "@/components/champ";
import { LigneVide, LignesChargement } from "@/components/etat-vide";
import { ListeDeroulante } from "@/components/liste-deroulante";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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
import {
  DOCUMENTS_OBLIGATOIRES,
  DOCUMENTS_OPTIONNELS,
  TYPES_DOCUMENT,
  dossierClos,
  urlDocument,
  type Membre,
  type TypeDocument,
} from "@/lib/membres";
import { useAction } from "@/lib/mutations";
import { cn } from "@/lib/utils";

type DocumentMembre = Schemas["DocumentMembre"];
type Apercu = { url: string; titre: string; nom: string };

const ICONES_OBLIGATOIRES: Partial<Record<TypeDocument, React.ElementType>> = {
  PIECE_IDENTITE: IdCardIcon,
  PHOTO: ImageIcon,
  SIGNATURE: PenLineIcon,
  STATUTS: FileTextIcon,
  PV_GROUPE: FileTextIcon,
};

function taille(octets: number) {
  return octets < 1024 * 1024
    ? `${Math.ceil(octets / 1024)} Ko`
    : `${(octets / 1024 / 1024).toFixed(1)} Mo`;
}

function estImage(typeContenu: string) {
  return typeContenu.startsWith("image/");
}

function dernierParType(documents: DocumentMembre[] | undefined, type: TypeDocument) {
  return documents?.find((d) => d.type === type);
}

function CarteObligatoire({
  membreId,
  type,
  document,
  peutAjouter,
  enCours,
  onDeposer,
  onApercu,
}: {
  membreId: number;
  type: TypeDocument;
  document?: DocumentMembre;
  peutAjouter: boolean;
  enCours: boolean;
  onDeposer: (type: TypeDocument, fichier: File) => void;
  onApercu: (apercu: Apercu) => void;
}) {
  const champ = useRef<HTMLInputElement>(null);
  const Icone = ICONES_OBLIGATOIRES[type] ?? FileTextIcon;
  const imagesUniquement = type === "PHOTO" || type === "SIGNATURE";
  const fourni = Boolean(document);
  const url = document ? urlDocument(membreId, document.id) : "";
  const image = document ? estImage(document.type_contenu) : false;

  function ouvrir() {
    if (!document) return;
    if (image) {
      onApercu({ url, titre: TYPES_DOCUMENT[type], nom: document.nom_origine });
    } else {
      window.open(url, "_blank", "noopener");
    }
  }

  return (
    <div
      className={cn(
        "flex flex-col rounded-2xl border bg-card p-4 transition-colors",
        fourni ? "border-success/30 bg-success-soft/20" : "border-dashed border-border-soft",
      )}
    >
      <div className="mb-3 flex items-start justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2.5">
          <span
            className={cn(
              "flex size-9 shrink-0 items-center justify-center rounded-xl",
              fourni ? "bg-success/15 text-success-strong" : "bg-muted text-muted-foreground",
            )}
          >
            <Icone className="size-4.5" />
          </span>
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold text-foreground">{TYPES_DOCUMENT[type]}</p>
            <p className="text-[11px] text-muted-foreground">
              {imagesUniquement ? "JPEG ou PNG" : "JPEG, PNG ou PDF"} · 5 Mo max.
            </p>
          </div>
        </div>
        <Badge variant={fourni ? "success" : "warning"}>{fourni ? "Fourni" : "Requis"}</Badge>
      </div>

      {document ? (
        <div className="flex flex-1 flex-col gap-3">
          {image ? (
            <button
              type="button"
              onClick={ouvrir}
              className="group relative block overflow-hidden rounded-xl ring-1 ring-border-soft focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-primary/30"
              aria-label={`Agrandir ${TYPES_DOCUMENT[type]}`}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={url}
                alt={TYPES_DOCUMENT[type]}
                className="h-36 w-full object-cover transition-transform duration-200 group-hover:scale-[1.02]"
              />
              <span className="absolute inset-0 flex items-center justify-center bg-foreground/0 transition-colors group-hover:bg-foreground/25">
                <EyeIcon className="size-6 text-white opacity-0 drop-shadow transition-opacity group-hover:opacity-100" />
              </span>
            </button>
          ) : (
            <button
              type="button"
              onClick={ouvrir}
              className="flex h-36 w-full items-center justify-center rounded-xl bg-muted/60 ring-1 ring-border-soft transition-colors hover:bg-muted"
              aria-label={`Ouvrir ${TYPES_DOCUMENT[type]}`}
            >
              <FileTextIcon className="size-10 text-muted-foreground" />
            </button>
          )}
          <div className="min-w-0">
            <p className="truncate text-xs font-medium text-foreground">{document.nom_origine}</p>
            <p className="text-[11px] text-muted-foreground">
              {taille(document.taille)} · {formatDateHeure(document.ajoute_le)}
            </p>
          </div>
          <div className="mt-auto flex flex-wrap gap-2">
            <Button type="button" variant="ghost" size="sm" onClick={ouvrir}>
              {image ? <EyeIcon /> : <ExternalLinkIcon />}
              {image ? "Aperçu" : "Ouvrir"}
            </Button>
            {peutAjouter && (
              <>
                <input
                  ref={champ}
                  type="file"
                  className="sr-only"
                  accept={imagesUniquement ? "image/jpeg,image/png" : "image/jpeg,image/png,application/pdf"}
                  onChange={(e) => {
                    const fichier = e.target.files?.[0];
                    if (fichier) onDeposer(type, fichier);
                    e.target.value = "";
                  }}
                />
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={enCours}
                  onClick={() => champ.current?.click()}
                >
                  Remplacer
                </Button>
              </>
            )}
          </div>
        </div>
      ) : (
        <div className="flex flex-1 flex-col items-center justify-center gap-3 rounded-xl bg-muted/30 px-3 py-8 text-center">
          <CheckCircle2Icon className="size-8 text-muted-foreground/40" aria-hidden />
          <p className="text-xs text-muted-foreground">Aucun fichier pour l&apos;instant</p>
          {peutAjouter && (
            <>
              <input
                ref={champ}
                type="file"
                className="sr-only"
                accept={imagesUniquement ? "image/jpeg,image/png" : "image/jpeg,image/png,application/pdf"}
                onChange={(e) => {
                  const fichier = e.target.files?.[0];
                  if (fichier) onDeposer(type, fichier);
                  e.target.value = "";
                }}
              />
              <Button
                type="button"
                size="sm"
                disabled={enCours}
                onClick={() => champ.current?.click()}
              >
                <UploadIcon /> Déposer
              </Button>
            </>
          )}
        </div>
      )}
    </div>
  );
}

export function OngletDocuments({ membre }: { membre: Membre }) {
  const peutAjouter = usePermission("members.add_documentmembre") && !dossierClos(membre.statut);
  const champFichier = useRef<HTMLInputElement>(null);
  const obligatoires = DOCUMENTS_OBLIGATOIRES[membre.type];
  const optionnels = DOCUMENTS_OPTIONNELS[membre.type];
  const [typeOptionnel, setTypeOptionnel] = useState<TypeDocument>(optionnels[0] ?? "AUTRE");
  const [description, setDescription] = useState("");
  const [typeEnCours, setTypeEnCours] = useState<TypeDocument | null>(null);
  const [apercu, setApercu] = useState<Apercu | null>(null);

  const documents = useQuery({
    queryKey: ["membres", String(membre.id), "documents"],
    queryFn: () => api<DocumentMembre[]>(`/api/membres/${membre.id}/documents`),
  });

  const deposer = useAction(
    ({ type, fichier, description: desc }: { type: TypeDocument; fichier: File; description?: string }) => {
      const corps = new FormData();
      corps.append("type", type);
      corps.append("fichier", fichier);
      if (desc) corps.append("description", desc);
      return api(`/api/membres/${membre.id}/documents`, { method: "POST", body: corps });
    },
    {
      succes: "Document ajouté.",
      invalider: [["membres", String(membre.id)]],
      apres: () => {
        setDescription("");
        setTypeEnCours(null);
        if (champFichier.current) champFichier.current.value = "";
      },
    },
  );

  function deposerObligatoire(type: TypeDocument, fichier: File) {
    setTypeEnCours(type);
    deposer.mutate({ type, fichier });
  }

  const listeOptionnels =
    documents.data?.filter((d) => !obligatoires.includes(d.type as TypeDocument)) ?? [];
  const nbObligatoiresFournis = obligatoires.filter((t) =>
    documents.data?.some((d) => d.type === t),
  ).length;

  function ouvrirDocument(d: DocumentMembre) {
    const url = urlDocument(membre.id, d.id);
    if (estImage(d.type_contenu)) {
      setApercu({ url, titre: TYPES_DOCUMENT[d.type], nom: d.nom_origine });
    } else {
      window.open(url, "_blank", "noopener");
    }
  }

  return (
    <div className="grid gap-6">
      <Card>
        <CardHeader>
          <CardTitle>Documents obligatoires</CardTitle>
          <CardDescription>
            {documents.isPending
              ? "Chargement…"
              : `${nbObligatoiresFournis} / ${obligatoires.length} fourni${nbObligatoiresFournis > 1 ? "s" : ""} — requis pour activer le membre.`}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div
            className={cn(
              "grid gap-4",
              obligatoires.length >= 3
                ? "sm:grid-cols-2 lg:grid-cols-3"
                : obligatoires.length === 2
                  ? "sm:grid-cols-2"
                  : "max-w-sm",
            )}
          >
            {obligatoires.map((type) => (
              <CarteObligatoire
                key={type}
                membreId={membre.id}
                type={type}
                document={dernierParType(documents.data, type)}
                peutAjouter={peutAjouter}
                enCours={deposer.isPending && typeEnCours === type}
                onDeposer={deposerObligatoire}
                onApercu={setApercu}
              />
            ))}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Documents optionnels</CardTitle>
          <CardDescription>
            Justificatifs, statuts, RCCM et autres pièces complémentaires.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4">
          {peutAjouter && optionnels.length > 0 && (
            <form
              className="grid gap-4 rounded-2xl border border-border-soft bg-muted/20 p-4 sm:grid-cols-[14rem_1fr_auto] sm:items-end"
              onSubmit={(e) => {
                e.preventDefault();
                const fichier = champFichier.current?.files?.[0];
                if (!fichier) return;
                setTypeEnCours(typeOptionnel);
                deposer.mutate({ type: typeOptionnel, fichier, description });
              }}
            >
              <Champ label="Type de document" htmlFor="type-optionnel">
                <ListeDeroulante
                  id="type-optionnel"
                  value={typeOptionnel}
                  onChange={(e) => setTypeOptionnel(e.target.value as TypeDocument)}
                >
                  {optionnels.map((t) => (
                    <option key={t} value={t}>
                      {TYPES_DOCUMENT[t]}
                    </option>
                  ))}
                </ListeDeroulante>
              </Champ>
              <Champ
                label="Fichier"
                htmlFor="fichier-optionnel"
                aide="JPEG, PNG ou PDF, 5 Mo maximum."
              >
                <Input
                  id="fichier-optionnel"
                  ref={champFichier}
                  type="file"
                  required
                  accept="image/jpeg,image/png,application/pdf"
                />
              </Champ>
              <Button type="submit" disabled={deposer.isPending && typeEnCours === typeOptionnel}>
                <UploadIcon /> {deposer.isPending && typeEnCours === typeOptionnel ? "Envoi…" : "Ajouter"}
              </Button>
              <Champ label="Description (facultative)" htmlFor="description-doc" className="sm:col-span-3">
                <Input
                  id="description-doc"
                  maxLength={255}
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Ex. quittance SNEL, attestation de résidence…"
                />
              </Champ>
            </form>
          )}

          <div className="carte-nue overflow-hidden">
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
                ) : listeOptionnels.length ? (
                  listeOptionnels.map((d) => (
                    <TableRow key={d.id}>
                      <TableCell>
                        <div className="flex items-center gap-2 font-medium">
                          <FileTextIcon className="size-4 text-muted-foreground" />
                          {TYPES_DOCUMENT[d.type]}
                        </div>
                        {d.description && (
                          <div className="text-xs text-muted-foreground">{d.description}</div>
                        )}
                      </TableCell>
                      <TableCell className="text-sm">
                        {d.nom_origine}{" "}
                        <span className="text-muted-foreground">· {taille(d.taille)}</span>
                      </TableCell>
                      <TableCell className="text-sm">
                        {d.ajoute_par}
                        <div className="text-xs text-muted-foreground">
                          {formatDateHeure(d.ajoute_le)}
                        </div>
                      </TableCell>
                      <TableCell>
                        <button
                          type="button"
                          onClick={() => ouvrirDocument(d)}
                          aria-label={
                            estImage(d.type_contenu)
                              ? `Aperçu de ${TYPES_DOCUMENT[d.type]}`
                              : `Ouvrir ${TYPES_DOCUMENT[d.type]}`
                          }
                          className="inline-flex size-8 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-info-soft hover:text-info-strong"
                        >
                          {estImage(d.type_contenu) ? (
                            <EyeIcon className="size-4" />
                          ) : (
                            <ExternalLinkIcon className="size-4" />
                          )}
                        </button>
                      </TableCell>
                    </TableRow>
                  ))
                ) : (
                  <LigneVide colonnes={4} message="Aucun document optionnel pour l'instant." />
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      <Dialog open={apercu !== null} onOpenChange={(ouvert) => !ouvert && setApercu(null)}>
        {apercu && (
          <DialogContent className="gap-3 overflow-hidden p-4 sm:max-w-3xl">
            <DialogHeader className="pr-8">
              <DialogTitle>{apercu.titre}</DialogTitle>
              <DialogDescription>{apercu.nom}</DialogDescription>
            </DialogHeader>
            <div className="overflow-auto rounded-2xl bg-muted/40 p-2">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={apercu.url}
                alt={apercu.titre}
                className="mx-auto max-h-[min(75vh,720px)] w-auto max-w-full rounded-xl object-contain"
              />
            </div>
          </DialogContent>
        )}
      </Dialog>
    </div>
  );
}
