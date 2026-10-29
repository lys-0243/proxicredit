# Lancer ProxiCrédit

Ce guide couvre trois situations :

1. [Développement local](#1-développement-local) : travailler sur le code (Windows, Linux ou macOS).
2. [Première utilisation](#2-première-utilisation) : préparer une base neuve pour pouvoir travailler.
3. [Production sur un VPS](#3-production-sur-un-vps-docker-compose) : déployer avec Docker Compose.

Un [dépannage](#4-dépannage) des erreurs courantes se trouve à la fin.

---

## Vue d'ensemble

```
Navigateur ──► http://localhost:3000  (Next.js)
                    │  pages de l'application
                    └─ /api/* relayé vers ──► http://localhost:8000  (Django)
                                                   │
                                                   ├─ PostgreSQL (ou SQLite en dev)
                                                   └─ Redis + Celery (tâches de fond)
```

**On utilise toujours l'application via le port 3000.** Next.js relaie les appels `/api` vers
Django : le navigateur et l'API partagent ainsi la même origine. C'est ce qui permet aux cookies
de session et à la protection CSRF de fonctionner. Le port 8000 sert uniquement à l'administration
Django (`/admin`) et à la documentation de l'API (`/api/docs`).

---

## 1. Développement local

### Prérequis

| Outil | Version | Vérifier avec |
|---|---|---|
| Python | 3.12 ou plus (3.14 recommandé) | `python --version` |
| Node.js | 24 | `node --version` |
| Git | récent | `git --version` |
| Docker Desktop | facultatif (pour PostgreSQL) | `docker --version` |

### 1.1 Récupérer le code

```bash
git clone https://github.com/lys-0243/proxicredit.git
cd proxicredit
```

### 1.2 Base de données : SQLite ou PostgreSQL

Le backend choisit la base selon la variable `DATABASE_URL` :

- **Sans `DATABASE_URL`** : SQLite (fichier `backend/db.sqlite3`). Rien à installer, idéal pour
  démarrer.
- **Avec `DATABASE_URL`** : PostgreSQL. C'est recommandé, car c'est le moteur de la production.
  Pour le lancer avec Docker :

  ```bash
  docker compose -f docker-compose.dev.yml up -d     # PostgreSQL (5432) et Redis (6379)
  ```

  Avec un PostgreSQL déjà installé sur la machine, créez une base vide (par exemple
  `proxicredit`) et indiquez-la dans `backend/.env` :

  ```
  DATABASE_URL=postgres://UTILISATEUR:MOT_DE_PASSE@localhost:5432/proxicredit
  ```

  Pour les tests, l'utilisateur doit pouvoir créer une base (`pytest` crée puis supprime
  `test_proxicredit`).

### 1.3 Backend (Django)

**Windows (PowerShell)**

```powershell
cd backend
python -m venv .venv
.venv\Scripts\Activate.ps1
pip install -r requirements/dev.txt
Copy-Item .env.example .env
```

**Linux / macOS**

```bash
cd backend
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements/dev.txt
cp .env.example .env
```

Ouvrez ensuite `backend/.env` :

- avec **SQLite**, commentez la ligne `DATABASE_URL` (ajoutez un `#` devant) ;
- avec **PostgreSQL** (via `docker-compose.dev.yml`), laissez-la telle quelle.

Puis, toujours dans `backend/` avec l'environnement virtuel activé :

```bash
python manage.py migrate          # crée les tables
python manage.py initialiser      # devises, agence principale, plan comptable, rôles
python manage.py createsuperuser  # votre compte administrateur
python manage.py runserver        # API sur http://localhost:8000
```

`initialiser` peut être relancé sans risque : il ne crée que ce qui manque. Relancez-le après
chaque mise à jour du code qui modifie les rôles ou le plan comptable.

### 1.4 Frontend (Next.js)

Dans un **second terminal** :

```bash
cd frontend
npm install
npm run dev                       # application sur http://localhost:3000
```

Si Django ne tourne pas sur `http://localhost:8000`, indiquez son adresse avec la variable
`BACKEND_URL` avant `npm run dev`.

### 1.5 Adresses utiles

| Adresse | Contenu |
|---|---|
| http://localhost:3000 | L'application |
| http://localhost:8000/admin | Administration Django (dépannage, données de référence) |
| http://localhost:8000/api/docs | Documentation interactive de l'API (Swagger) |

### 1.6 Tests et contrôles

```bash
# Backend (dans backend/, environnement virtuel activé)
pytest                            # tests
ruff check . && ruff format --check .

# Frontend (dans frontend/)
npm run lint
npm run typecheck
npm run build
```

Les mêmes contrôles tournent automatiquement sur GitHub à chaque push (`.github/workflows/ci.yml`).
Sur la CI, les tests backend utilisent PostgreSQL.

### 1.7 Après une modification de l'API

Le frontend utilise des types TypeScript générés depuis le schéma de l'API. Après avoir modifié un
serializer ou une vue :

```bash
cd backend && python manage.py spectacular --file schema.yml
cd ../frontend && npm run api:types
```

---

## 2. Première utilisation

Sur une base neuve, quelques étapes sont nécessaires avant de pouvoir saisir des opérations.

### 2.1 Rattacher l'administrateur à une agence

Un compte créé avec `createsuperuser` n'est rattaché à **aucune agence**. Or on ne peut ouvrir une
journée comptable que pour une agence.

1. Ouvrez http://localhost:8000/admin et connectez-vous.
2. **Utilisateurs et sécurité → Utilisateurs →** votre compte.
3. Section **ProxiCrédit** : choisissez l'agence `AG001 - Agence principale` et enregistrez.

### 2.2 Se connecter à l'application

Ouvrez http://localhost:3000 et connectez-vous avec le même identifiant.

### 2.3 Ouvrir la journée comptable

**Paramétrage → Journées comptables → Ouvrir la journée.**

Sans journée ouverte, aucune écriture n'est possible. C'est voulu : toutes les opérations sont
datées de la journée comptable, jamais de la date du serveur.

### 2.4 Saisir le taux de change du jour

**Paramétrage → Taux de change.** Exemple : `USD → CDF`, achat 2 840, vente 2 860, référence 2 850.

Sans taux, toute opération en USD est refusée.

### 2.5 Créer les comptes du personnel

**Administration → Utilisateurs → Nouvel utilisateur.** Indiquez l'agence, les rôles et un mot de
passe provisoire. À la première connexion, l'utilisateur doit :

- changer son mot de passe provisoire ;
- configurer la double authentification (2FA), s'il a l'un des rôles **Administrateur**,
  **Directeur** ou **Comptable**. Il lui faut une application comme Google Authenticator,
  Microsoft Authenticator ou FreeOTP.

Tant que ces étapes ne sont pas faites, l'application le renvoie sur la page **Profil et
sécurité**.

> **Contrôle à quatre yeux** : une écriture saisie manuellement doit être validée par un **autre**
> utilisateur. Pour tester la saisie puis la validation, créez donc au moins deux comptes.

### 2.6 Alimenter le coffre et ouvrir les caisses

`manage.py initialiser` crée, pour chaque agence, un **coffre** (compte 5711) et un **guichet G01**
(compte 5712). Ensuite :

1. Le comptable passe une écriture d'alimentation du coffre (par exemple débit 5711, crédit 5211
   pour un retrait en banque).
2. Le caissier ouvre sa session : **Caisse → Ma caisse → Ouvrir la caisse**.
3. Le chef d'agence approvisionne la caisse depuis le coffre : **Caisse → Sessions de caisse →
   Approvisionner**.
4. En fin de journée, le caissier ferme sa session en déclarant le comptage de chaque devise. Un
   écart est enregistré en compte d'attente 4712. La journée comptable ne peut pas être fermée tant
   qu'une caisse reste ouverte.

Pour le démarrage, **tout se fait en espèces, à la caisse** : dépôts, remboursements, retraits et
décaissements passent par la session du caissier (Mobile Money et banque viendront avec la phase 7).

### 2.7 Premier dépôt et activation d'un membre

Il n'y a ni frais d'adhésion ni parts sociales : le premier passage en caisse est un **premier
dépôt** sur le compte d'épargne du membre (fiche du membre → onglet **Épargne** → **Dépôt**). Le
compte de la devise choisie s'ouvre à cette occasion ; un membre a au plus un compte en CDF et un en
USD. Le dossier peut être activé quand les documents KYC sont fournis et que le dépôt atteint le
minimum (paramètre `epargne.depot_initial` : 10 000 CDF ou 5 USD au départ).

### 2.8 Épargne exigée pour un crédit

Un crédit n'est soumis, approuvé et décaissé que si le membre a déjà **18 % du montant** sur son
compte d'épargne, dans la devise du crédit. Au décaissement, ces 18 % sont **bloqués** : ils ne
peuvent plus être retirés ni servir à rembourser, jusqu'à ce que le crédit soit soldé.

> **Paramètres à confirmer** : les produits d'épargne et de crédit (taux, durées, plafonds, frais,
> épargne exigée, pénalités), le dépôt initial et les règles de crédit (`credits.regles` : un
> crédit à la fois, taux d'endettement de 40 %) sont des valeurs de départ. Le **Directeur** (ou l'Administrateur) les
> crée et les modifie dans **Paramétrage → Produits**. Un produit de crédit reçoit à sa création ses
> règles comptables (comptes d'encours et d'intérêts) ; son code et ses comptes ne changent plus
> ensuite.

---

## 3. Production sur un VPS (Docker Compose)

### 3.1 Prérequis

- Un serveur Linux avec Docker et le plugin Compose (`docker compose version`).
- Un nom de domaine pointant vers le serveur.
- **Un certificat HTTPS : obligatoire.** En production, les cookies de session sont réservés au
  HTTPS et Django redirige tout le trafic HTTP vers HTTPS. Sans HTTPS, la connexion est impossible.

### 3.2 Services lancés

| Service | Rôle |
|---|---|
| `nginx` | Point d'entrée (port 80) : `/api`, `/admin` et `/static` vers Django, le reste vers Next.js |
| `backend` | Django + gunicorn. Applique les migrations et `initialiser` à chaque démarrage |
| `frontend` | Next.js |
| `db` | PostgreSQL 16 (volume `pgdata`) |
| `redis` | File de messages pour Celery |
| `worker`, `beat` | Celery : tâches de fond et tâches planifiées |
| `backup` | Sauvegarde quotidienne de la base dans `./backups/` (30 jours conservés) |

### 3.3 Configuration

```bash
git clone https://github.com/lys-0243/proxicredit.git
cd proxicredit
cp .env.example .env
```

Renseignez `.env` :

| Variable | Exemple | Remarque |
|---|---|---|
| `DJANGO_SECRET_KEY` | longue chaîne aléatoire | `python -c "import secrets; print(secrets.token_urlsafe(50))"` |
| `DJANGO_ALLOWED_HOSTS` | `proxicredit.exemple.cd` | Nom de domaine, sans `https://` |
| `DJANGO_CSRF_TRUSTED_ORIGINS` | `https://proxicredit.exemple.cd` | Avec `https://` |
| `CORS_ALLOWED_ORIGINS` | `https://proxicredit.exemple.cd` | Avec `https://` |
| `POSTGRES_PASSWORD` | mot de passe solide | Obligatoire |
| `TIME_ZONE` | `Africa/Kinshasa` | Ou `Africa/Lubumbashi` |

Ne versionnez jamais ce fichier : il est exclu par `.gitignore`.

### 3.4 Démarrage

```bash
docker compose up -d --build
docker compose exec backend python manage.py createsuperuser
docker compose ps                 # tous les services doivent être « running »
```

Faites ensuite la [première utilisation](#2-première-utilisation) (l'administration est sur
`https://votre-domaine/admin`).

### 3.5 HTTPS

La configuration nginx fournie (`deploy/nginx/proxicredit.conf`) écoute **uniquement en HTTP**. Il
faut donc terminer le HTTPS, au choix :

- en amont, avec un proxy qui gère le certificat (Caddy, Traefik, Cloudflare…) et transmet
  l'en-tête `X-Forwarded-Proto: https` ;
- ou dans ce nginx, en ajoutant un bloc `listen 443 ssl` avec un certificat Let's Encrypt
  (certbot), puis en exposant le port 443 dans `docker-compose.yml`.

### 3.6 Mise à jour

```bash
git pull
docker compose up -d --build      # les migrations s'appliquent au redémarrage du backend
```

### 3.7 Sauvegardes et restauration

Les sauvegardes quotidiennes sont dans `./backups/proxicredit-AAAA-MM-JJ.dump`. **Copiez-les hors
du serveur, chiffrées** : une sauvegarde restée sur le serveur ne protège pas contre la perte de
celui-ci.

Pour restaurer une sauvegarde :

```bash
docker compose stop backend worker beat
docker compose exec -T db pg_restore -U proxicredit -d proxicredit --clean --if-exists \
  < backups/proxicredit-2026-10-24.dump
docker compose start backend worker beat
```

### 3.8 Journaux

```bash
docker compose logs -f backend    # ou frontend, nginx, worker…
```

---

## 4. Dépannage

| Symptôme | Cause | Solution |
|---|---|---|
| « Aucune journée comptable ouverte » | Pas de journée ouverte pour l'agence | Paramétrage → Journées comptables → Ouvrir |
| « Aucun taux de change USD/CDF » | Opération en USD sans taux saisi | Paramétrage → Taux de change |
| Impossible d'ouvrir une journée en étant administrateur | Compte sans agence | Voir [2.1](#21-rattacher-ladministrateur-à-une-agence) |
| « Compte verrouillé » | 5 échecs de connexion | Attendre 30 minutes, utiliser Utilisateurs → Déverrouiller, ou lancer `python manage.py axes_reset` |
| « Échec de la vérification CSRF » | Application ouverte sur le port 8000 au lieu du 3000, ou origine absente de `DJANGO_CSRF_TRUSTED_ORIGINS` | Passer par http://localhost:3000 ; en production, vérifier `.env` |
| Retour permanent à la page de connexion | Ancienne session dans le navigateur | Se déconnecter ou effacer les cookies de `localhost` |
| `Activate.ps1 cannot be loaded` (Windows) | Politique d'exécution PowerShell | `Set-ExecutionPolicy -Scope CurrentUser RemoteSigned` |
| `connection refused … 5432` | `DATABASE_URL` pointe vers PostgreSQL, qui ne tourne pas | Lancer `docker compose -f docker-compose.dev.yml up -d`, ou commenter `DATABASE_URL` pour SQLite |
| Port 3000 ou 8000 déjà utilisé | Un autre programme l'occupe | `npm run dev -- -p 3001` ou `python manage.py runserver 8001` (puis `BACKEND_URL=http://localhost:8001`) |
| Erreurs de type après un `git pull` | Types d'API périmés | Voir [1.7](#17-après-une-modification-de-lapi) |
