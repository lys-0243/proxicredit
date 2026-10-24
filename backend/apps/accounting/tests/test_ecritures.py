from decimal import Decimal

import pytest
from django.db import DatabaseError, transaction
from hypothesis import HealthCheck, given, settings
from hypothesis import strategies as st

from apps.accounting import services
from apps.accounting.models import CompteComptable, Ecriture, LigneEcriture, RegleComptable
from apps.accounting.services import Ligne
from apps.core.exceptions import ErreurMetier
from apps.core.services import fermer_journee

D = Decimal


def depot(agence, user, montant="100.00", devise="CDF", **kwargs):
    """Dépôt d'espèces : caisse au débit, dépôt du membre au crédit."""
    return services.comptabiliser(
        journal="CA",
        agence=agence,
        devise=devise,
        libelle="Dépôt espèces",
        lignes=[Ligne("5712", debit=D(montant)), Ligne("4191", credit=D(montant))],
        utilisateur=user,
        type_operation="EPARGNE_DEPOT",
        **kwargs,
    )


class TestComptabiliser:
    def test_ecriture_equilibree_validee_a_la_date_comptable(self, agence, comptable, journee):
        ecriture = depot(agence, comptable)
        assert ecriture.statut == Ecriture.Statut.VALIDEE
        assert ecriture.numero == "CA-2026-000001"
        assert ecriture.date_comptable == journee.date
        assert ecriture.taux_reference == 1
        assert services.solde("5712", "CDF") == D("100.00")
        assert services.solde("4191", "CDF") == D("-100.00")

    def test_numerotation_sequentielle_par_journal(self, agence, comptable, journee):
        assert depot(agence, comptable).numero == "CA-2026-000001"
        assert depot(agence, comptable).numero == "CA-2026-000002"

    def test_ecriture_en_usd_porte_le_taux_de_reference(self, agence, comptable, journee, taux_usd):
        ecriture = depot(agence, comptable, "50.00", devise="USD")
        assert ecriture.taux_reference == D("2850")
        assert services.solde("5712", "USD") == D("50.00")
        assert services.solde("5712", "CDF") == 0

    def test_usd_sans_taux_de_change_refuse(self, agence, comptable, journee):
        with pytest.raises(ErreurMetier, match="taux de change"):
            depot(agence, comptable, devise="USD")

    @pytest.mark.parametrize(
        "lignes, message",
        [
            ([Ligne("5712", debit=D("100"))], "au moins deux lignes"),
            ([Ligne("5712", debit=D("100")), Ligne("4191", credit=D("99"))], "déséquilibrée"),
            ([Ligne("5712", debit=D("100.005")), Ligne("4191", credit=D("100.005"))], "arrondi"),
            ([Ligne("571", debit=D("100")), Ligne("4191", credit=D("100"))], "mouvementable"),
            (
                [Ligne("5712", debit=D("100"), credit=D("100")), Ligne("4191", credit=D("0"))],
                "soit un débit",
            ),
            ([Ligne("5712", debit=D("-5")), Ligne("4191", credit=D("-5"))], "positifs"),
        ],
    )
    def test_ecritures_invalides_refusees(self, agence, comptable, journee, lignes, message):
        with pytest.raises(ErreurMetier, match=message):
            services.comptabiliser(
                journal="CA",
                agence=agence,
                devise="CDF",
                libelle="x",
                lignes=lignes,
                utilisateur=comptable,
                type_operation="TEST",
            )
        assert not Ecriture.objects.filter(statut=Ecriture.Statut.VALIDEE).exists()

    def test_journee_fermee_refuse_toute_ecriture(self, agence, comptable, directeur, journee):
        fermer_journee(agence, directeur)
        with pytest.raises(ErreurMetier, match="Aucune journée comptable ouverte"):
            depot(agence, comptable)

    def test_compte_reserve_a_une_devise(self, agence, comptable, journee, usd, taux_usd):
        CompteComptable.objects.filter(numero="5712").update(devise="CDF")
        with pytest.raises(ErreurMetier, match="n'accepte que la devise CDF"):
            depot(agence, comptable, devise="USD")

    def test_idempotence(self, agence, comptable, journee):
        premiere = depot(agence, comptable, cle_idempotence="MPESA-TX-123")
        seconde = depot(agence, comptable, cle_idempotence="MPESA-TX-123")
        assert premiere.pk == seconde.pk
        assert Ecriture.objects.count() == 1


class TestImmuabilite:
    def test_modification_par_le_modele_refusee(self, agence, comptable, journee):
        ecriture = depot(agence, comptable)
        ecriture.libelle = "modifié"
        with pytest.raises(ErreurMetier, match="ne peut pas être modifiée"):
            ecriture.save()
        with pytest.raises(ErreurMetier, match="ne peut pas être supprimée"):
            ecriture.delete()
        ligne = ecriture.lignes.first()
        ligne.debit = D("1")
        with pytest.raises(ErreurMetier):
            ligne.save()

    def test_modification_sql_directe_bloquee_par_la_base(self, agence, comptable, journee):
        ecriture = depot(agence, comptable)
        for operation in (
            lambda: Ecriture.objects.filter(pk=ecriture.pk).update(libelle="fraude"),
            lambda: Ecriture.objects.filter(pk=ecriture.pk).delete(),
            lambda: LigneEcriture.objects.filter(ecriture=ecriture).update(debit=D("999")),
            lambda: LigneEcriture.objects.filter(ecriture=ecriture).delete(),
            lambda: LigneEcriture.objects.bulk_create(
                [
                    LigneEcriture(
                        ecriture=ecriture, compte=ecriture.lignes.first().compte, debit=D("1")
                    )
                ]
            ),
        ):
            with pytest.raises(DatabaseError), transaction.atomic():
                operation()
        assert services.solde("5712", "CDF") == D("100.00")

    def test_brouillon_modifiable_et_supprimable(self, agence, comptable):
        brouillon = services.creer_brouillon(
            journal="OD",
            agence=agence,
            devise="CDF",
            libelle="OD",
            lignes=[Ligne("6055", debit=D("10")), Ligne("5712", credit=D("10"))],
            utilisateur=comptable,
        )
        services.remplacer_lignes(
            brouillon, [Ligne("6055", debit=D("12")), Ligne("5712", credit=D("12"))]
        )
        assert brouillon.lignes.count() == 2
        brouillon.delete()
        assert not Ecriture.objects.exists()


class TestQuatreYeuxEtContrePassation:
    def _od(self, agence, auteur):
        return services.creer_brouillon(
            journal="OD",
            agence=agence,
            devise="CDF",
            libelle="Achat fournitures",
            lignes=[Ligne("6055", debit=D("25000")), Ligne("5712", credit=D("25000"))],
            utilisateur=auteur,
        )

    def test_auteur_ne_peut_pas_valider_sa_saisie(self, agence, comptable, comptable2, journee):
        od = self._od(agence, comptable)
        with pytest.raises(ErreurMetier, match="quatre yeux"):
            services.valider(od, comptable)
        validee = services.valider(od, comptable2)
        assert validee.statut == Ecriture.Statut.VALIDEE
        assert validee.valide_par == comptable2

    def test_contre_passation_annule_les_soldes(self, agence, comptable, comptable2, journee):
        od = services.valider(self._od(agence, comptable), comptable2)
        inverse = services.contre_passer(od, comptable, "Erreur de compte")
        assert inverse.statut == Ecriture.Statut.BROUILLON
        assert inverse.contre_passation_de == od
        with pytest.raises(ErreurMetier, match="quatre yeux"):
            services.valider(inverse, comptable)
        services.valider(inverse, comptable2)
        assert services.solde("6055", "CDF") == 0
        assert services.solde("5712", "CDF") == 0
        # L'original reste intact et validé
        od.refresh_from_db()
        assert od.statut == Ecriture.Statut.VALIDEE

    def test_double_contre_passation_refusee(self, agence, comptable, comptable2, journee):
        od = services.valider(self._od(agence, comptable), comptable2)
        services.contre_passer(od, comptable, "Erreur")
        with pytest.raises(ErreurMetier, match="déjà été contre-passée"):
            services.contre_passer(od, comptable, "Encore")

    def test_ecriture_de_module_non_contre_passable_en_comptabilite(
        self, agence, comptable, journee
    ):
        ecriture = depot(agence, comptable)
        with pytest.raises(ErreurMetier, match="annulez l'opération dans son module"):
            services.contre_passer(ecriture, comptable, "Erreur")
        assert services.contre_passer(ecriture, comptable, "Annulation dépôt", depuis_module=True)


class TestReglesComptables:
    @pytest.fixture
    def regles(self, db):
        def regle(code_produit="", devise=None, compte_interets="7711"):
            r = RegleComptable.objects.create(
                type_operation="CREDIT_REMBOURSEMENT",
                code_produit=code_produit,
                devise=devise,
                journal_id=services._journal("CR").pk,
                libelle="Remboursement crédit {reference}",
            )
            r.lignes.create(ordre=1, sens="D", element="total", compte_variable="CAISSE")
            r.lignes.create(
                ordre=2,
                sens="C",
                element="capital",
                compte=CompteComptable.objects.get(numero="4111"),
            )
            r.lignes.create(
                ordre=3,
                sens="C",
                element="interets",
                compte=CompteComptable.objects.get(numero=compte_interets),
            )
            r.lignes.create(
                ordre=4,
                sens="C",
                element="penalites",
                compte=CompteComptable.objects.get(numero="7713"),
            )
            return r

        return regle

    def test_la_regle_la_plus_precise_l_emporte(self, regles, usd):
        generique = regles()
        par_produit = regles(code_produit="SECOURS", compte_interets="7712")
        par_produit_devise = regles(code_produit="SECOURS", devise=usd, compte_interets="7712")
        assert services.trouver_regle("CREDIT_REMBOURSEMENT", "EDUCATION", "CDF") == generique
        assert services.trouver_regle("CREDIT_REMBOURSEMENT", "SECOURS", "CDF") == par_produit
        assert (
            services.trouver_regle("CREDIT_REMBOURSEMENT", "SECOURS", "USD") == par_produit_devise
        )
        with pytest.raises(ErreurMetier, match="Aucune règle"):
            services.trouver_regle("INCONNU", "", "CDF")

    def test_comptabiliser_operation(self, regles, agence, comptable, journee):
        regles()
        ecriture = services.comptabiliser_operation(
            "CREDIT_REMBOURSEMENT",
            montants={
                "total": D("178.53"),
                "capital": D("158.53"),
                "interets": D("20.00"),
                "penalites": D("0"),
            },
            comptes={"CAISSE": "5712"},
            agence=agence,
            devise="CDF",
            utilisateur=comptable,
            reference="CR-0001",
        )
        assert ecriture.libelle == "Remboursement crédit CR-0001"
        assert ecriture.lignes.count() == 3  # la ligne de pénalités (0) est ignorée
        assert services.solde("4111", "CDF") == D("-158.53")
        assert services.solde("7711", "CDF") == D("-20.00")

    def test_compte_variable_manquant(self, regles, agence, comptable, journee):
        regles()
        with pytest.raises(ErreurMetier, match="CAISSE"):
            services.comptabiliser_operation(
                "CREDIT_REMBOURSEMENT",
                montants={"total": D("10"), "capital": D("10")},
                agence=agence,
                devise="CDF",
                utilisateur=comptable,
            )


class TestEtats:
    def test_balance_equilibree(self, agence, comptable, journee):
        depot(agence, comptable, "100.00")
        depot(agence, comptable, "50.00")
        lignes = services.balance("CDF")
        assert sum(ligne["debit"] for ligne in lignes) == sum(ligne["credit"] for ligne in lignes)
        par_compte = {ligne["compte"]: ligne for ligne in lignes}
        assert par_compte["5712"]["solde_debiteur"] == D("150.00")
        assert par_compte["4191"]["solde_crediteur"] == D("150.00")

    def test_grand_livre_cumule(self, agence, comptable, journee):
        depot(agence, comptable, "100.00")
        depot(agence, comptable, "50.00")
        gl = services.grand_livre("5712", "CDF")
        assert [m["solde"] for m in gl["mouvements"]] == [D("100.00"), D("150.00")]
        assert gl["solde_final"] == D("150.00")


montants = st.decimals(min_value=D("0.01"), max_value=D("1000000"), places=2)


@settings(max_examples=40, suppress_health_check=[HealthCheck.function_scoped_fixture])
@given(st.lists(montants, min_size=1, max_size=6))
def test_propriete_grand_livre_toujours_equilibre(agence, comptable, journee, valeurs):
    """Quelles que soient les écritures passées, la somme des débits égale celle des crédits."""
    total = sum(valeurs)
    services.comptabiliser(
        journal="OD",
        agence=agence,
        devise="CDF",
        libelle="Ventilation",
        lignes=[Ligne("5712", debit=total)] + [Ligne("4191", credit=v) for v in valeurs],
        utilisateur=comptable,
        type_operation="TEST",
    )
    lignes = services.balance("CDF")
    assert sum(ligne["debit"] for ligne in lignes) == sum(ligne["credit"] for ligne in lignes)
