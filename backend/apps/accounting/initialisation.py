from apps.accounting.models import CompteComptable, Journal, RegleComptable
from apps.accounting.plan_syscohada import COMPTES, JOURNAUX


def charger_plan_comptable() -> int:
    """Crée ou met à jour le plan de départ (idempotent). Ne supprime jamais un compte."""
    numeros = [numero for numero, _, _ in COMPTES]
    crees = 0
    for numero, libelle, sens in sorted(COMPTES, key=lambda c: len(c[0])):
        parents = [n for n in numeros if numero.startswith(n) and n != numero]
        parent = CompteComptable.objects.get(numero=max(parents, key=len)) if parents else None
        a_enfants = any(n.startswith(numero) and n != numero for n in numeros)
        _, cree = CompteComptable.objects.update_or_create(
            numero=numero,
            defaults={
                "libelle": libelle,
                "sens_normal": sens,
                "parent": parent,
                "est_mouvementable": not a_enfants,
            },
        )
        crees += cree
    for code, libelle in JOURNAUX:
        Journal.objects.get_or_create(code=code, defaults={"libelle": libelle})
    return crees


def charger_regles(regles: list, code_produit: str = "") -> None:
    """Crée les règles de comptabilisation absentes (idempotent : ne remplace jamais une règle).

    `regles` : [(type d'opération, journal, libellé, [(sens, élément, compte fixe, variable)])].
    """
    for type_operation, journal, libelle, lignes in regles:
        regle, cree = RegleComptable.objects.get_or_create(
            type_operation=type_operation,
            code_produit=code_produit,
            devise=None,
            defaults={"journal": Journal.objects.get(code=journal), "libelle": libelle},
        )
        if cree:
            for ordre, (sens, element, compte, variable) in enumerate(lignes, start=1):
                regle.lignes.create(
                    ordre=ordre,
                    sens=sens,
                    element=element,
                    compte=CompteComptable.objects.get(numero=compte) if compte else None,
                    compte_variable=variable,
                )
