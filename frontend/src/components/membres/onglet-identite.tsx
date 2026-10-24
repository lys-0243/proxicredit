import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatDate, formatDateHeure, formatMontant } from "@/lib/format";
import { ETATS_CIVILS, SEXES, TYPES_PIECE, type Membre } from "@/lib/membres";

type Ligne = [string, React.ReactNode];

function Bloc({ titre, lignes }: { titre: string; lignes: Ligne[] }) {
  const remplies = lignes.filter(([, v]) => v !== "" && v !== null && v !== undefined);
  if (!remplies.length) return null;
  return (
    <Card>
      <CardHeader>
        <CardTitle>{titre}</CardTitle>
      </CardHeader>
      <CardContent>
        <dl className="grid gap-x-6 gap-y-3 sm:grid-cols-2">
          {remplies.map(([libelle, valeur]) => (
            <div key={libelle}>
              <dt className="text-xs text-muted-foreground">{libelle}</dt>
              <dd className="text-sm font-medium">{valeur}</dd>
            </div>
          ))}
        </dl>
      </CardContent>
    </Card>
  );
}

export function OngletIdentite({ membre: m }: { membre: Membre }) {
  const adresse = [m.numero_adresse && `N° ${m.numero_adresse}`, m.avenue && `av. ${m.avenue}`, m.quartier,
    m.commune && `commune de ${m.commune}`, m.ville, m.province].filter(Boolean).join(", ");
  const revenu = m.revenu_mensuel ? formatMontant(m.revenu_mensuel, m.devise_revenu ?? undefined) : "";
  const charges = m.charges_mensuelles ? formatMontant(m.charges_mensuelles, m.devise_revenu ?? undefined) : "";

  return (
    <div className="grid gap-4 xl:grid-cols-2">
      {m.type === "PHYSIQUE" && (
        <>
          <Bloc titre="Identité" lignes={[
            ["Nom", m.nom], ["Postnom", m.postnom], ["Prénom", m.prenom],
            ["Sexe", m.sexe ? SEXES[m.sexe] : ""],
            ["Date de naissance", formatDate(m.date_naissance)], ["Lieu de naissance", m.lieu_naissance],
            ["Nationalité", m.nationalite], ["État civil", m.etat_civil ? ETATS_CIVILS[m.etat_civil] : ""],
            ["Personnes à charge", m.personnes_a_charge ?? ""],
          ]} />
          <Bloc titre="Pièce d'identité" lignes={[
            ["Type", m.type_piece ? TYPES_PIECE[m.type_piece] : ""], ["Numéro", m.numero_piece],
            ["Délivrée le", formatDate(m.piece_delivree_le)], ["Expire le", formatDate(m.piece_expire_le)],
          ]} />
        </>
      )}
      {m.type === "MORALE" && (
        <>
          <Bloc titre="Entreprise ou association" lignes={[
            ["Raison sociale", m.raison_sociale], ["Forme juridique", m.forme_juridique], ["RCCM", m.rccm],
            ["Identification nationale", m.id_nat], ["Numéro d'impôt", m.numero_impot],
            ["Date de création", formatDate(m.date_creation)],
          ]} />
          <Bloc titre="Représentant légal" lignes={[
            ["Nom", m.representant_nom], ["Fonction", m.representant_fonction],
            ["Téléphone", m.representant_telephone],
          ]} />
        </>
      )}
      <Bloc titre="Coordonnées" lignes={[
        ["Téléphone", m.telephone], ["Autre téléphone", m.telephone_secondaire], ["E-mail", m.email],
        ["Adresse", adresse],
      ]} />
      <Bloc titre="Activité et revenus" lignes={[
        ["Profession", m.type === "PHYSIQUE" ? m.profession : ""],
        ["Employeur", m.type === "PHYSIQUE" ? m.employeur : ""],
        ["Activité principale", m.activite], ["Revenu mensuel", revenu], ["Charges mensuelles", charges],
      ]} />
      <Bloc titre="Suivi du dossier" lignes={[
        ["Créé par", `${m.cree_par} le ${formatDateHeure(m.cree_le)}`],
        ["Activé par", m.active_par ? `${m.active_par} le ${formatDateHeure(m.active_le)}` : ""],
        ["Liste noire", m.en_liste_noire ? m.motif_liste_noire : ""],
      ]} />
    </div>
  );
}
