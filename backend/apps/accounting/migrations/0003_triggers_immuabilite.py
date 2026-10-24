"""Immuabilité du grand livre garantie par la base de données elle-même : même une requête SQL
directe ne peut ni modifier ni supprimer une écriture validée ou ses lignes."""

from django.db import migrations

POSTGRES = """
CREATE OR REPLACE FUNCTION pc_ecriture_immuable() RETURNS trigger AS $$
BEGIN
    IF OLD.statut = 'VALIDEE' THEN
        RAISE EXCEPTION 'ProxiCredit : ecriture % validee, immuable', OLD.numero;
    END IF;
    IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
    RETURN NEW;
END $$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION pc_ligne_immuable() RETURNS trigger AS $$
DECLARE parent_id bigint;
BEGIN
    IF TG_OP = 'INSERT' THEN parent_id := NEW.ecriture_id; ELSE parent_id := OLD.ecriture_id; END IF;
    IF (SELECT statut FROM accounting_ecriture WHERE id = parent_id) = 'VALIDEE' THEN
        RAISE EXCEPTION 'ProxiCredit : lignes d''une ecriture validee, immuables';
    END IF;
    IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
    RETURN NEW;
END $$ LANGUAGE plpgsql;

CREATE TRIGGER pc_ecriture_immuable BEFORE UPDATE OR DELETE ON accounting_ecriture
    FOR EACH ROW EXECUTE FUNCTION pc_ecriture_immuable();
CREATE TRIGGER pc_ligne_immuable BEFORE INSERT OR UPDATE OR DELETE ON accounting_ligneecriture
    FOR EACH ROW EXECUTE FUNCTION pc_ligne_immuable();
"""

POSTGRES_INVERSE = """
DROP TRIGGER IF EXISTS pc_ligne_immuable ON accounting_ligneecriture;
DROP TRIGGER IF EXISTS pc_ecriture_immuable ON accounting_ecriture;
DROP FUNCTION IF EXISTS pc_ligne_immuable();
DROP FUNCTION IF EXISTS pc_ecriture_immuable();
"""

SQLITE = [
    """CREATE TRIGGER pc_ecriture_maj BEFORE UPDATE ON accounting_ecriture
       WHEN OLD.statut = 'VALIDEE'
       BEGIN SELECT RAISE(ABORT, 'ProxiCredit : ecriture validee, immuable'); END;""",
    """CREATE TRIGGER pc_ecriture_suppr BEFORE DELETE ON accounting_ecriture
       WHEN OLD.statut = 'VALIDEE'
       BEGIN SELECT RAISE(ABORT, 'ProxiCredit : ecriture validee, immuable'); END;""",
    """CREATE TRIGGER pc_ligne_ajout BEFORE INSERT ON accounting_ligneecriture
       WHEN (SELECT statut FROM accounting_ecriture WHERE id = NEW.ecriture_id) = 'VALIDEE'
       BEGIN SELECT RAISE(ABORT, 'ProxiCredit : ecriture validee, immuable'); END;""",
    """CREATE TRIGGER pc_ligne_maj BEFORE UPDATE ON accounting_ligneecriture
       WHEN (SELECT statut FROM accounting_ecriture WHERE id = OLD.ecriture_id) = 'VALIDEE'
       BEGIN SELECT RAISE(ABORT, 'ProxiCredit : ecriture validee, immuable'); END;""",
    """CREATE TRIGGER pc_ligne_suppr BEFORE DELETE ON accounting_ligneecriture
       WHEN (SELECT statut FROM accounting_ecriture WHERE id = OLD.ecriture_id) = 'VALIDEE'
       BEGIN SELECT RAISE(ABORT, 'ProxiCredit : ecriture validee, immuable'); END;""",
]
SQLITE_INVERSE = [
    f"DROP TRIGGER IF EXISTS {nom};"
    for nom in ("pc_ecriture_maj", "pc_ecriture_suppr", "pc_ligne_ajout", "pc_ligne_maj",
                "pc_ligne_suppr")
]


def creer(apps, schema_editor):
    vendor = schema_editor.connection.vendor
    if vendor == "postgresql":
        schema_editor.execute(POSTGRES)
    elif vendor == "sqlite":
        for sql in SQLITE:
            schema_editor.execute(sql)


def supprimer(apps, schema_editor):
    vendor = schema_editor.connection.vendor
    if vendor == "postgresql":
        schema_editor.execute(POSTGRES_INVERSE)
    elif vendor == "sqlite":
        for sql in SQLITE_INVERSE:
            schema_editor.execute(sql)


class Migration(migrations.Migration):
    dependencies = [("accounting", "0002_initial")]
    operations = [migrations.RunPython(creer, supprimer)]
