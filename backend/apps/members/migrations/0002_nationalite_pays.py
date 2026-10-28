from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("members", "0001_initial"),
    ]

    operations = [
        migrations.AlterField(
            model_name="historicalmembre",
            name="nationalite",
            field=models.CharField(
                blank=True,
                default="République démocratique du Congo",
                max_length=80,
            ),
        ),
        migrations.AlterField(
            model_name="membre",
            name="nationalite",
            field=models.CharField(
                blank=True,
                default="République démocratique du Congo",
                max_length=80,
            ),
        ),
    ]
