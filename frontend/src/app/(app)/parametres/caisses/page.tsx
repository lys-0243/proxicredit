"use client";

import { useQuery } from "@tanstack/react-query";
import { PlusIcon, VaultIcon } from "lucide-react";
import { useState } from "react";

import { Champ } from "@/components/champ";
import { LigneVide, LignesChargement } from "@/components/etat-vide";
import { ListeDeroulante } from "@/components/liste-deroulante";
import { PageHeader } from "@/components/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
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
import { useMoi, usePermission } from "@/lib/auth";
import { useAction } from "@/lib/mutations";
import { useComptes } from "@/lib/referentiels";

function DialogueNouveauGuichet({ fermer }: { fermer: () => void }) {
  const { data: moi } = useMoi();
  const comptes = useComptes();
  const comptesCaisse = (comptes.data ?? []).filter((c) => c.numero.startsWith("57") && c.est_mouvementable);
  const [code, setCode] = useState("");
  const [libelle, setLibelle] = useState("");
  const [choixCompte, setChoixCompte] = useState("");
  const compte = choixCompte || String(comptesCaisse.find((c) => c.numero === "5712")?.id ?? "");
  const creer = useAction(
    () => api("/api/caisse/caisses", {
      method: "POST",
      body: { agence: moi?.agence?.id, code, libelle, type: "GUICHET", compte: Number(compte) },
    }),
    { succes: "Guichet créé.", invalider: [["caisse"]], apres: fermer },
  );
  return (
    <DialogContent className="sm:max-w-md">
      <form className="grid gap-4" onSubmit={(e) => { e.preventDefault(); creer.mutate(); }}>
        <DialogHeader><DialogTitle>Nouveau guichet</DialogTitle></DialogHeader>
        <div className="grid gap-4 sm:grid-cols-[8rem_1fr]">
          <Champ label="Code" htmlFor="code-caisse">
            <Input id="code-caisse" required maxLength={10} placeholder="G02" value={code} onChange={(e) => setCode(e.target.value)} />
          </Champ>
          <Champ label="Libellé" htmlFor="libelle-caisse">
            <Input id="libelle-caisse" required maxLength={100} placeholder="Guichet 2" value={libelle}
              onChange={(e) => setLibelle(e.target.value)} />
          </Champ>
        </div>
        <Champ label="Compte comptable" htmlFor="compte-caisse">
          <ListeDeroulante id="compte-caisse" value={compte} onChange={(e) => setChoixCompte(e.target.value)}>
            {comptesCaisse.map((c) => <option key={c.id} value={c.id}>{c.numero} – {c.libelle}</option>)}
          </ListeDeroulante>
        </Champ>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={fermer}>Annuler</Button>
          <Button type="submit" disabled={!compte || creer.isPending}>Créer</Button>
        </DialogFooter>
      </form>
    </DialogContent>
  );
}

export default function PageCaisses() {
  const peutCreer = usePermission("cash.add_caisse");
  const [creation, setCreation] = useState(false);
  const caisses = useQuery({
    queryKey: ["caisse", "caisses"],
    queryFn: () => api<Schemas["Caisse"][]>("/api/caisse/caisses"),
  });

  return (
    <>
      <PageHeader
        titre="Caisses"
        description="Coffre et guichets de chaque agence, avec le compte comptable qu'ils mouvementent."
        actions={peutCreer && <Button onClick={() => setCreation(true)}><PlusIcon /> Nouveau guichet</Button>}
      />
      <div className="carte-nue">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Agence</TableHead>
              <TableHead>Code</TableHead>
              <TableHead>Libellé</TableHead>
              <TableHead>Type</TableHead>
              <TableHead>Compte</TableHead>
              <TableHead>État</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {caisses.isPending ? (
              <LignesChargement colonnes={6} lignes={2} />
            ) : caisses.data?.length ? (
              caisses.data.map((c) => (
                <TableRow key={c.id}>
                  <TableCell className="text-sm">{c.agence_code}</TableCell>
                  <TableCell className="font-mono text-xs">{c.code}</TableCell>
                  <TableCell className="font-semibold">{c.libelle}</TableCell>
                  <TableCell className="text-sm">{c.type === "COFFRE" ? "Coffre" : "Guichet"}</TableCell>
                  <TableCell className="font-mono text-xs">{c.compte_numero}</TableCell>
                  <TableCell>
                    {!c.active ? (
                      <Badge variant="secondary">Inactive</Badge>
                    ) : c.session_ouverte ? (
                      <Badge variant="success">Ouverte</Badge>
                    ) : (
                      <Badge variant="outline">Fermée</Badge>
                    )}
                  </TableCell>
                </TableRow>
              ))
            ) : (
              <LigneVide colonnes={6} icone={VaultIcon} message="Aucune caisse : lancez « manage.py initialiser »." />
            )}
          </TableBody>
        </Table>
      </div>
      <Dialog open={creation} onOpenChange={setCreation}>
        {creation && <DialogueNouveauGuichet fermer={() => setCreation(false)} />}
      </Dialog>
    </>
  );
}
