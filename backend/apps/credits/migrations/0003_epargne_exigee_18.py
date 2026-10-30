from decimal import Decimal

from django.db import migrations


def epargne_exigee_18(apps, schema_editor):
    """Règle de départ : 18 % du montant déjà déposés en épargne (produits livrés EDU et SEC)."""
    ProduitCredit = apps.get_model("credits", "ProduitCredit")
    ProduitCredit.objects.filter(code__in=["EDU", "SEC"]).update(
        epargne_garantie_taux=Decimal("0.18")
    )


class Migration(migrations.Migration):
    dependencies = [("credits", "0002_epargne_bloquee")]

    operations = [migrations.RunPython(epargne_exigee_18, migrations.RunPython.noop)]
