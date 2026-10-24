from decimal import Decimal

import pytest

from apps.accounting.models import CompteComptable, Ecriture, Journal

pytestmark = pytest.mark.django_db


def payload_od(montant="25000.00"):
    return {
        "journal": Journal.objects.get(code="OD").pk,
        "devise": "CDF",
        "libelle": "Achat de fournitures",
        "lignes": [
            {"compte": CompteComptable.objects.get(numero="6055").pk, "debit": montant},
            {"compte": CompteComptable.objects.get(numero="5712").pk, "credit": montant},
        ],
    }


def test_saisie_puis_validation_par_un_autre_comptable(client_api, comptable, comptable2, journee):
    reponse = client_api(comptable).post("/api/comptabilite/ecritures", payload_od(), format="json")
    assert reponse.status_code == 201, reponse.data
    assert reponse.data["statut"] == "BROUILLON"
    pk = reponse.data["id"]

    refus = client_api(comptable).post(f"/api/comptabilite/ecritures/{pk}/valider")
    assert refus.status_code == 400
    assert refus.data["code"] == "quatre_yeux"

    ok = client_api(comptable2).post(f"/api/comptabilite/ecritures/{pk}/valider")
    assert ok.status_code == 200
    assert ok.data["numero"] == "OD-2026-000001"

    modif = client_api(comptable).put(
        f"/api/comptabilite/ecritures/{pk}", payload_od("1.00"), format="json"
    )
    assert modif.status_code == 400
    assert client_api(comptable).delete(f"/api/comptabilite/ecritures/{pk}").status_code == 400


def test_saisie_desequilibree_refusee(client_api, comptable):
    data = payload_od()
    data["lignes"][1]["credit"] = "1.00"
    reponse = client_api(comptable).post("/api/comptabilite/ecritures", data, format="json")
    assert reponse.status_code == 400
    assert "déséquilibrée" in str(reponse.data)


def test_contre_passation_via_api(client_api, comptable, comptable2, journee):
    pk = (
        client_api(comptable)
        .post("/api/comptabilite/ecritures", payload_od(), format="json")
        .data["id"]
    )
    client_api(comptable2).post(f"/api/comptabilite/ecritures/{pk}/valider")
    inverse = client_api(comptable).post(
        f"/api/comptabilite/ecritures/{pk}/contre-passer",
        {"motif": "Mauvais compte"},
        format="json",
    )
    assert inverse.status_code == 201
    client_api(comptable2).post(f"/api/comptabilite/ecritures/{inverse.data['id']}/valider")
    balance = client_api(comptable).get("/api/comptabilite/balance", {"devise": "CDF"}).data
    soldes = {
        b["compte"]: (Decimal(b["solde_debiteur"]), Decimal(b["solde_crediteur"]))
        for b in balance["lignes"]
    }
    assert soldes["6055"] == (0, 0)
    # Totaux calculés côté serveur, en Decimal : la balance générale est équilibrée.
    assert balance["total"]["debit"] == balance["total"]["credit"] == "50000.00"
    assert {c["classe"] for c in balance["classes"]} == {5, 6}


@pytest.mark.parametrize("role", ["AGENT_RECEPTION", "CAISSIER", "AGENT_CREDIT"])
def test_roles_operationnels_sans_acces_comptable(client_api, creer_utilisateur, role):
    user = creer_utilisateur(role)
    client = client_api(user)
    assert (
        client.post("/api/comptabilite/ecritures", payload_od(), format="json").status_code == 403
    )
    assert client.get("/api/comptabilite/balance", {"devise": "CDF"}).status_code == 403


def test_auditeur_lecture_seule(client_api, creer_utilisateur, comptable, comptable2, journee):
    auditeur = creer_utilisateur("AUDITEUR")
    client = client_api(auditeur)
    assert client.get("/api/comptabilite/ecritures").status_code == 200
    assert client.get("/api/comptabilite/balance", {"devise": "CDF"}).status_code == 200
    assert (
        client.post("/api/comptabilite/ecritures", payload_od(), format="json").status_code == 403
    )


def test_ecritures_filtrees_par_agence(
    client_api, creer_utilisateur, autre_agence, comptable, comptable2, journee
):
    pk = (
        client_api(comptable)
        .post("/api/comptabilite/ecritures", payload_od(), format="json")
        .data["id"]
    )
    comptable_ailleurs = creer_utilisateur("COMPTABLE", agence_=autre_agence, otp_active=True)
    client = client_api(comptable_ailleurs)
    assert client.get("/api/comptabilite/ecritures").data["count"] == 0
    assert client.post(f"/api/comptabilite/ecritures/{pk}/valider").status_code == 404
    assert Ecriture.objects.get(pk=pk).statut == Ecriture.Statut.BROUILLON
