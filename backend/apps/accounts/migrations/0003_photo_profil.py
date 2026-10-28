import apps.accounts.models
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("accounts", "0002_initial"),
    ]

    operations = [
        migrations.AddField(
            model_name="utilisateur",
            name="photo",
            field=models.FileField(
                blank=True,
                upload_to=apps.accounts.models.chemin_photo_profil,
                verbose_name="photo de profil",
            ),
        ),
    ]
