"use client";

import { useQuery } from "@tanstack/react-query";
import {
  ArrowLeftIcon,
  BanknoteIcon,
  CalendarClockIcon,
  ClipboardCheckIcon,
  GavelIcon,
  HandCoinsIcon,
  MoreHorizontalIcon,
  SendIcon,
  TimerIcon,
  UndoIcon,
  XCircleIcon,
} from "lucide-react";
import Link from "next/link";
import { useParams, usePathname, useRouter, useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";

import { StatutCreditBadge } from "@/components/credits/communs";
import {
  ControleCredit,
  DialogueAnalyse,
  DialogueDecision,
  DialogueMotif,
  DialogueVersement,
} from "@/components/credits/dialogues";
import { ErreurApi } from "@/components/erreur-api";
import { LigneVide, LignesChargement } from "@/components/etat-vide";
import { Montant } from "@/components/montant";
import { PageHeader } from "@/components/page-header";
import { StatCard } from "@/components/stat-card";
import { LienEcriture } from "@/components/tresorerie";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog } from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { api, type Schemas } from "@/lib/api/client";
import { useMoi, usePermission } from "@/lib/auth";
import { AVIS_CREDIT, STATUTS_CREDIT, formatPourcentage, type Credit, type StatutCredit } from "@/lib/credits";
import { formatDate, formatDateHeure } from "@/lib/format";
import { useAction } from "@/lib/mutations";

type Dialogue = "analyser" | "approuver" | "rejeter" | "renvoyer" | "annuler" | "decaisser" | "rembourser" | null;

function Ligne({ libelle, children }: { libelle: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-wrap justify-between gap-x-4 gap-y-0.5 border-b border-border-soft py-2 text-sm last:border-0">
      <span className="text-muted-foreground">{libelle}</span>
      <span className="text-right font-medium">{children}</span>
    </div>
  );
}

function OngletDossier({ credit: c }: { credit: Credit }) {
  const enInstruction = c.statut === "SOUMIS" || c.statut === "ANALYSE" || c.statut === "BROUILLON";
  return (
    <div className="grid gap-4 xl:grid-cols-2">
      <Card>
        <CardHeader><CardTitle>Demande</CardTitle></CardHeader>
        <CardContent>
          <Ligne libelle="Montant demandé"><Montant valeur={c.montant_demande} devise={c.devise} /></Ligne>
          <Ligne libelle="Échéances">{c.duree_demandee}</Ligne>
          <Ligne libelle="Objet">{c.objet}</Ligne>
          <Ligne libelle="Saisie">{c.cree_par}, le {formatDateHeure(c.cree_le)}</Ligne>
          {c.soumis_le && <Ligne libelle="Soumission">{c.soumis_par}, le {formatDateHeure(c.soumis_le)}</Ligne>}
        </CardContent>
      </Card>
      <Card>
        <CardHeader><CardTitle>Analyse</CardTitle></CardHeader>
        <CardContent>
          {c.analyse_le ? (
            <>
              <Ligne libelle="Avis">{AVIS_CREDIT[c.avis_analyse as Schemas["AvisCreditEnum"]]}</Ligne>
              <Ligne libelle="Proposition">
                <Montant valeur={c.montant_propose} devise={c.devise} /> en {c.duree_proposee} échéances
              </Ligne>
              <Ligne libelle="Revenu / charges mensuels">
                <Montant valeur={c.revenu_mensuel} /> / <Montant valeur={c.charges_mensuelles} />
              </Ligne>
              <Ligne libelle="Analyste">{c.analyse_par}, le {formatDateHeure(c.analyse_le)}</Ligne>
              <p className="mt-3 text-sm whitespace-pre-line">{c.commentaire_analyse}</p>
            </>
          ) : (
            <p className="text-sm text-muted-foreground">Pas encore analysé.</p>
          )}
        </CardContent>
      </Card>
      <Card>
        <CardHeader><CardTitle>Décision du comité</CardTitle></CardHeader>
        <CardContent>
          {c.decide_le ? (
            <>
              {c.montant_accorde && (
                <Ligne libelle="Accordé">
                  <Montant valeur={c.montant_accorde} devise={c.devise} /> en {c.duree_accordee} échéances à{" "}
                  {formatPourcentage(c.taux_interet)}
                </Ligne>
              )}
              <Ligne libelle="Décision">{c.decide_par}, le {formatDateHeure(c.decide_le)}</Ligne>
              <p className="mt-3 text-sm whitespace-pre-line">{c.motif_decision}</p>
            </>
          ) : (
            <p className="text-sm text-muted-foreground">En attente.</p>
          )}
        </CardContent>
      </Card>
      {c.date_decaissement ? (
        <Card>
          <CardHeader><CardTitle>Décaissement</CardTitle></CardHeader>
          <CardContent>
            <Ligne libelle="Date">{formatDate(c.date_decaissement)}</Ligne>
            <Ligne libelle="Frais de dossier retenus"><Montant valeur={c.frais_dossier} devise={c.devise} /></Ligne>
            <Ligne libelle="Par">{c.decaisse_par}</Ligne>
            {c.ecriture_decaissement && c.ecriture_decaissement_numero && (
              <Ligne libelle="Écriture">
                <LienEcriture id={c.ecriture_decaissement} numero={c.ecriture_decaissement_numero} />
              </Ligne>
            )}
            {c.solde_le && <Ligne libelle="Soldé le">{formatDate(c.solde_le)}</Ligne>}
          </CardContent>
        </Card>
      ) : (
        enInstruction && (
          <Card>
            <CardHeader><CardTitle>Contrôles</CardTitle></CardHeader>
            <CardContent><ControleCredit credit={c} /></CardContent>
          </Card>
        )
      )}
    </div>
  );
}

function OngletEcheancier({ credit }: { credit: Credit }) {
  const echeances = useQuery({
    queryKey: ["credits", "dossiers", String(credit.id), "echeancier"],
    queryFn: () => api<Schemas["Echeance"][]>(`/api/credits/dossiers/${credit.id}/echeancier`),
  });
  const aujourdhui = new Date().toISOString().slice(0, 10);
  return (
    <div className="carte-nue">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>N°</TableHead>
            <TableHead>Date</TableHead>
            <TableHead className="text-right">Capital</TableHead>
            <TableHead className="text-right">Intérêt</TableHead>
            <TableHead className="text-right">Pénalités</TableHead>
            <TableHead className="text-right">Payé</TableHead>
            <TableHead className="text-right">Reste dû</TableHead>
            <TableHead>État</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {echeances.isPending ? (
            <LignesChargement colonnes={8} />
          ) : echeances.data?.length ? (
            echeances.data.map((e) => {
              const paye = Number(e.capital_paye) + Number(e.interet_paye) + Number(e.penalite_payee);
              const enRetard = !e.soldee_le && e.date < aujourdhui;
              return (
                <TableRow key={e.id}>
                  <TableCell>{e.numero}</TableCell>
                  <TableCell>{formatDate(e.date)}</TableCell>
                  <TableCell className="text-right"><Montant valeur={e.capital} /></TableCell>
                  <TableCell className="text-right"><Montant valeur={e.interet} /></TableCell>
                  <TableCell className="text-right"><Montant valeur={e.penalite} /></TableCell>
                  <TableCell className="text-right"><Montant valeur={paye} /></TableCell>
                  <TableCell className="text-right font-semibold"><Montant valeur={e.reste_du} devise={credit.devise} /></TableCell>
                  <TableCell>
                    {e.soldee_le ? (
                      <Badge variant="success">Payée le {formatDate(e.soldee_le)}</Badge>
                    ) : enRetard ? (
                      <Badge variant="destructive">En retard</Badge>
                    ) : (
                      <Badge variant="secondary">À venir</Badge>
                    )}
                  </TableCell>
                </TableRow>
              );
            })
          ) : (
            <LigneVide colonnes={8} icone={CalendarClockIcon} message="L'échéancier est établi au décaissement." />
          )}
        </TableBody>
      </Table>
    </div>
  );
}

function OngletRemboursements({ credit }: { credit: Credit }) {
  const remboursements = useQuery({
    queryKey: ["credits", "dossiers", String(credit.id), "remboursements"],
    queryFn: () => api<Schemas["Remboursement"][]>(`/api/credits/dossiers/${credit.id}/remboursements`),
  });
  return (
    <div className="carte-nue">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Date</TableHead>
            <TableHead className="text-right">Montant</TableHead>
            <TableHead className="text-right">Capital</TableHead>
            <TableHead className="text-right">Intérêt</TableHead>
            <TableHead className="text-right">Pénalités</TableHead>
            <TableHead>Écriture</TableHead>
            <TableHead>Par</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {remboursements.isPending ? (
            <LignesChargement colonnes={7} lignes={2} />
          ) : remboursements.data?.length ? (
            remboursements.data.map((r) => (
              <TableRow key={r.id}>
                <TableCell>{formatDate(r.date_comptable)}</TableCell>
                <TableCell className="text-right font-semibold"><Montant valeur={r.montant} devise={credit.devise} /></TableCell>
                <TableCell className="text-right"><Montant valeur={r.capital} /></TableCell>
                <TableCell className="text-right"><Montant valeur={r.interet} /></TableCell>
                <TableCell className="text-right"><Montant valeur={r.penalite} /></TableCell>
                <TableCell className="font-mono text-xs"><LienEcriture id={r.ecriture} numero={r.ecriture_numero} /></TableCell>
                <TableCell className="text-sm">{r.cree_par}</TableCell>
              </TableRow>
            ))
          ) : (
            <LigneVide colonnes={7} icone={HandCoinsIcon} message="Aucun remboursement." />
          )}
        </TableBody>
      </Table>
    </div>
  );
}

function OngletHistorique({ credit }: { credit: Credit }) {
  const historique = useQuery({
    queryKey: ["credits", "dossiers", String(credit.id), "historique"],
    queryFn: () => api<Schemas["HistoriqueCredit"][]>(`/api/credits/dossiers/${credit.id}/historique`),
  });
  return (
    <ol className="carte grid gap-4">
      {(historique.data ?? []).map((h) => (
        <li key={h.id} className="grid gap-0.5 border-l-2 border-primary/30 pl-4">
          <span className="text-sm font-semibold">
            {STATUTS_CREDIT[h.nouveau as StatutCredit] ?? h.nouveau}
          </span>
          <span className="text-xs text-muted-foreground">{h.par} · {formatDateHeure(h.le)}</span>
          {h.commentaire && <span className="text-sm whitespace-pre-line">{h.commentaire}</span>}
        </li>
      ))}
    </ol>
  );
}

function Actions({ credit: c, ouvrir }: { credit: Credit; ouvrir: (d: Dialogue) => void }) {
  const { data: moi } = useMoi();
  const peutSaisir = usePermission("credits.add_credit");
  const peutModifier = usePermission("credits.change_credit");
  const peutAnalyser = usePermission("credits.analyser_credit");
  const peutStatuer = usePermission("credits.approuver_credit");
  const peutDecaisser = usePermission("credits.decaisser_credit");
  const peutRembourser = usePermission("credits.rembourser_credit");
  const soumettre = useAction(() => api(`/api/credits/dossiers/${c.id}/soumettre`, { method: "POST" }), {
    succes: "Dossier soumis à l'analyse.",
    invalider: [["credits"]],
  });
  // Contrôle à quatre yeux : ni l'auteur de la demande ni l'analyste ne statuent.
  const implique = moi?.username === c.cree_par || moi?.username === c.analyse_par;
  const annulable =
    ((c.statut === "BROUILLON" || c.statut === "SOUMIS") && (peutModifier || peutStatuer)) ||
    ((c.statut === "ANALYSE" || c.statut === "APPROUVE") && peutStatuer);
  const renvoyable = (c.statut === "SOUMIS" || c.statut === "ANALYSE") && peutAnalyser;

  return (
    <>
      {c.statut === "BROUILLON" && peutSaisir && (
        <Button disabled={soumettre.isPending} onClick={() => soumettre.mutate()}><SendIcon /> Soumettre</Button>
      )}
      {(c.statut === "SOUMIS" || c.statut === "ANALYSE") && peutAnalyser && (
        <Button variant={c.statut === "ANALYSE" ? "outline" : "default"} onClick={() => ouvrir("analyser")}>
          <ClipboardCheckIcon /> {c.statut === "ANALYSE" ? "Reprendre l'analyse" : "Analyser"}
        </Button>
      )}
      {c.statut === "ANALYSE" && peutStatuer && !implique && (
        <>
          <Button onClick={() => ouvrir("approuver")}><GavelIcon /> Approuver</Button>
          <Button variant="outline" onClick={() => ouvrir("rejeter")}><XCircleIcon /> Rejeter</Button>
        </>
      )}
      {c.statut === "APPROUVE" && peutDecaisser && (
        <Button onClick={() => ouvrir("decaisser")}><BanknoteIcon /> Décaisser</Button>
      )}
      {c.statut === "EN_COURS" && peutRembourser && (
        <Button onClick={() => ouvrir("rembourser")}><HandCoinsIcon /> Rembourser</Button>
      )}
      {(annulable || renvoyable) && (
        <DropdownMenu>
          <DropdownMenuTrigger render={<Button variant="outline" size="icon" aria-label="Autres actions" />}>
            <MoreHorizontalIcon />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            {renvoyable && (
              <DropdownMenuItem onClick={() => ouvrir("renvoyer")}><UndoIcon /> Renvoyer pour complément…</DropdownMenuItem>
            )}
            {annulable && (
              <DropdownMenuItem onClick={() => ouvrir("annuler")}><XCircleIcon /> Annuler le dossier…</DropdownMenuItem>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      )}
    </>
  );
}

function FicheCredit() {
  const { id } = useParams<{ id: string }>();
  const onglet = useSearchParams().get("onglet") ?? "dossier";
  const router = useRouter();
  const pathname = usePathname();
  const [dialogue, setDialogue] = useState<Dialogue>(null);
  const credit = useQuery({
    queryKey: ["credits", "dossiers", id],
    queryFn: () => api<Credit>(`/api/credits/dossiers/${id}`),
  });

  if (credit.isPending) return <Skeleton className="h-96 w-full" />;
  if (credit.error) return <ErreurApi erreur={credit.error} />;
  const c = credit.data;
  const s = c.situation;
  const fermer = () => setDialogue(null);
  const actif = ["dossier", "echeancier", "remboursements", "historique"].includes(onglet) ? onglet : "dossier";

  return (
    <>
      <Link href="/credits" className={buttonVariants({ variant: "ghost", size: "sm", className: "mb-2 -ml-2" })}>
        <ArrowLeftIcon /> Crédits
      </Link>
      <PageHeader
        surtitre={`${c.produit_libelle} · ${c.numero}`}
        titre={c.membre_nom}
        description={`Membre ${c.membre_numero} · agence ${c.agence_code}`}
        actions={
          <>
            <StatutCreditBadge statut={c.statut} />
            <Link href={`/membres/${c.membre}`} className={buttonVariants({ variant: "outline" })}>Fiche du membre</Link>
            <Actions credit={c} ouvrir={setDialogue} />
          </>
        }
      />
      {s && (
        <div className="mb-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <StatCard titre="Capital restant dû" icone={BanknoteIcon} valeur={<Montant valeur={s.capital_restant} devise={c.devise} />}
            detail={<>Total restant dû, intérêts compris : <Montant valeur={s.total_du} devise={c.devise} /></>} />
          <StatCard titre="Impayés" icone={TimerIcon} ton={Number(s.impaye) > 0 ? "danger" : "success"}
            valeur={<Montant valeur={s.impaye} devise={c.devise} />}
            detail={s.echeances_en_retard ? `${s.echeances_en_retard} échéance(s), ${s.jours_retard} jour(s) de retard` : "Aucun retard"} />
          <StatCard titre="Prochaine échéance" icone={CalendarClockIcon} ton="neutre"
            valeur={s.prochaine_echeance ? formatDate(s.prochaine_echeance) : "–"}
            detail={s.prochaine_echeance ? <Montant valeur={s.prochain_montant} devise={c.devise} /> : "Crédit soldé"} />
          <StatCard titre="Pénalités dues" icone={HandCoinsIcon} ton={Number(s.penalites_dues) > 0 ? "warning" : "neutre"}
            valeur={<Montant valeur={s.penalites_dues} devise={c.devise} />} />
        </div>
      )}
      <Tabs value={actif} onValueChange={(v) => router.replace(`${pathname}?onglet=${v}`, { scroll: false })}>
        <TabsList className="flex-wrap">
          <TabsTrigger value="dossier">Dossier</TabsTrigger>
          <TabsTrigger value="echeancier">Échéancier</TabsTrigger>
          <TabsTrigger value="remboursements">Remboursements</TabsTrigger>
          <TabsTrigger value="historique">Historique</TabsTrigger>
        </TabsList>
        <TabsContent value="dossier" className="pt-2"><OngletDossier credit={c} /></TabsContent>
        <TabsContent value="echeancier" className="pt-2"><OngletEcheancier credit={c} /></TabsContent>
        <TabsContent value="remboursements" className="pt-2"><OngletRemboursements credit={c} /></TabsContent>
        <TabsContent value="historique" className="pt-2"><OngletHistorique credit={c} /></TabsContent>
      </Tabs>
      <Dialog open={dialogue !== null} onOpenChange={(o) => !o && fermer()}>
        {dialogue === "analyser" && <DialogueAnalyse credit={c} fermer={fermer} />}
        {(dialogue === "approuver" || dialogue === "rejeter") && (
          <DialogueDecision credit={c} approuver={dialogue === "approuver"} fermer={fermer} />
        )}
        {(dialogue === "renvoyer" || dialogue === "annuler") && <DialogueMotif credit={c} action={dialogue} fermer={fermer} />}
        {(dialogue === "decaisser" || dialogue === "rembourser") && (
          <DialogueVersement credit={c} operation={dialogue} fermer={fermer} />
        )}
      </Dialog>
    </>
  );
}

export default function PageFicheCredit() {
  return (
    <Suspense>
      <FicheCredit />
    </Suspense>
  );
}
