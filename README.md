# ProxiCrédit — Core banking microfinance

Core banking pour une microfinance : membres, crédits (Éducation, Secours), épargne, caisse,
comptabilité SYSCOHADA, Mobile Money et SMS. Multi-devises (CDF / USD) et multi-agences.

| Couche | Technologie |
|---|---|
| Backend | Django 6 + Django REST Framework, PostgreSQL 16, Celery + Redis |
| Frontend | Next.js 16 (App Router), TypeScript, Tailwind CSS |
| Déploiement | Docker Compose (nginx, gunicorn, PostgreSQL, Redis, Celery) |

## Avancement

| Phase | Contenu | État |
|---|---|---|
| 0. Fondations | Auth JWT (cookies httpOnly + CSRF), 2FA TOTP, verrouillage, rôles, agences, devises, taux de change, journée comptable, jours fériés, paramètres versionnés, piste d'audit | ✅ |
| 1. Comptabilité de base | Plan SYSCOHADA, journaux, écritures immuables (triggers en base), quatre yeux, contre-passation, règles de comptabilisation, balance, grand livre | ✅ |
| 2. Membres et KYC | Personnes physiques, morales et groupes solidaires, documents KYC protégés, adhésion et parts sociales comptabilisées, activation à quatre yeux, statuts, liste noire, bénéficiaires | ✅ |
| 3. Épargne et caisse | | à venir |
| 4. Moteur et workflow de crédit | | à venir |
| 5 à 9 | Garanties, clôture et risque, Mobile Money et SMS, reporting, mise en production | à venir |

## Démarrage rapide

Le guide complet est dans **[docs/LANCEMENT.md](docs/LANCEMENT.md)** : développement local
(Windows, Linux, macOS), première utilisation, production avec Docker Compose et dépannage.

En résumé, pour le développement (SQLite par défaut, aucun service à installer) :

```bash
# Terminal 1 : backend
cd backend
python -m venv .venv && .venv/Scripts/activate   # Linux/macOS : source .venv/bin/activate
pip install -r requirements/dev.txt
python manage.py migrate && python manage.py initialiser
python manage.py createsuperuser
python manage.py runserver

# Terminal 2 : frontend
cd frontend
npm install && npm run dev
```

Ouvrez ensuite http://localhost:3000. Sur une base neuve, rattachez votre compte à une agence
puis ouvrez la journée comptable : voir
[Première utilisation](docs/LANCEMENT.md#2-première-utilisation).

## Principes non négociables

1. **Argent en `Decimal`**, jamais en `float` (`apps/core/money.py`).
2. **Grand livre immuable** : toute opération financière passe par `apps/accounting/services.py`
   (`comptabiliser_operation()` ou `comptabiliser()`). Une écriture validée ne se modifie ni ne se
   supprime : c'est garanti par le code **et** par des triggers en base. Les corrections se font
   par contre-passation.
3. **Quatre yeux** : une saisie manuelle ou une contre-passation est validée par un autre utilisateur.
4. **Agence partout** : les données sont filtrées par agence (`apps/core/scoping.py`).
5. **Date comptable ≠ date système** : on ne peut rien comptabiliser sans journée ouverte.
6. **Idempotence** : `cle_idempotence` sur les écritures (webhooks Mobile Money, opérations de caisse).

## Rôles

Administrateur, Directeur, Chef d'agence, Agent de réception, Agent de crédit, Membre du comité,
Caissier, Comptable, Auditeur (lecture seule). Les permissions sont définies dans
`backend/apps/accounts/roles.py` et synchronisées par `python manage.py initialiser`.
La 2FA est obligatoire pour les rôles Administrateur, Directeur et Comptable.

## Production

Déploiement sur VPS avec Docker Compose (HTTPS obligatoire, sauvegardes quotidiennes) :
voir [docs/LANCEMENT.md](docs/LANCEMENT.md#3-production-sur-un-vps-docker-compose).
