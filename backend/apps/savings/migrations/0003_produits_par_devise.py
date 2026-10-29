from django.db import migrations

# Un seul produit par devise : l'épargne obligatoire disparaît, l'épargne à vue devient « Épargne ».
LIBELLES = {"EPV-CDF": "Épargne CDF", "EPV-USD": "Épargne USD"}


def un_produit_par_devise(apps, schema_editor):
    ProduitEpargne = apps.get_model("savings", "ProduitEpargne")
    ProduitEpargne.objects.filter(type="OBLIGATOIRE").update(actif=False)
    for code, libelle in LIBELLES.items():
        ProduitEpargne.objects.filter(code=code).update(libelle=libelle)


class Migration(migrations.Migration):
    dependencies = [("savings", "0002_un_compte_par_devise")]

    operations = [migrations.RunPython(un_produit_par_devise, migrations.RunPython.noop)]
