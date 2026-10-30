# Déployer ProxiCrédit sur DigitalOcean (serveur de test)

Ce guide met toute l'application en ligne sur **un seul serveur (Droplet)** pour la faire tester
par des partenaires : API Django, application Next.js, PostgreSQL, Redis/Celery et fichiers
(photos de profil, documents KYC), avec un **HTTPS automatique** (Let's Encrypt via Caddy).

Aucun nom de domaine n'est nécessaire : on utilise une adresse gratuite `sslip.io` construite à
partir de l'adresse IP du serveur.

```
Internet ──► Caddy (80/443, certificat HTTPS)
                └─► nginx ──┬─ /api, /admin, /static ──► Django (gunicorn) ──┬─ PostgreSQL (volume pgdata)
                            └─ le reste ──────────────► Next.js              ├─ Redis + Celery
                                                                             └─ fichiers (volume media)
```

Les fichiers envoyés (photos, KYC) restent sur le disque du serveur, dans le volume Docker
`media`. Ils ne sont jamais publics : l'API vérifie les droits de l'utilisateur avant de les
renvoyer.

---

## 1. Coût indicatif

| Élément | Prix |
|---|---|
| Droplet Basic 4 Go RAM / 2 vCPU | ~24 $/mois |
| Droplet Backups (facultatif, recommandé) | +20 %, soit ~4,80 $/mois |
| Nom de domaine | 0 $ (sslip.io) |

DigitalOcean facture à l'heure : un Droplet détruit après la période de test ne coûte plus rien.

---

## 2. Créer le serveur

### 2.1 Droplet

Dans le panneau DigitalOcean : **Create → Droplets**.

| Réglage | Valeur |
|---|---|
| Région | Frankfurt (FRA1), Amsterdam (AMS3) ou London (LON1) : les plus proches de la RDC |
| Image | **Marketplace → Docker** (Ubuntu 24.04 avec Docker et Compose déjà installés) |
| Taille | **Basic, Regular, 4 Go / 2 vCPU**. Avec 2 Go, la compilation de Next.js peut échouer |
| Authentification | **Clé SSH** (plus sûr qu'un mot de passe) |
| Backups | Cochez **Enable automated backups** si vous voulez une copie hors serveur |
| Nom | `proxicredit-test` |

Notez l'**adresse IP** du Droplet, par exemple `164.90.1.2`.

### 2.2 Pare-feu

**Networking → Firewalls → Create Firewall**, règles entrantes :

| Type | Protocole | Port |
|---|---|---|
| SSH | TCP | 22 |
| HTTP | TCP | 80 |
| HTTPS | TCP | 443 |
| Custom (HTTP/3, facultatif) | UDP | 443 |

Appliquez-le au Droplet `proxicredit-test`. Utilisez ce pare-feu DigitalOcean plutôt que `ufw` :
Docker contourne `ufw` pour les ports qu'il publie.

### 2.3 Connexion et mémoire d'appoint (swap)

Depuis votre PC :

```bash
ssh root@164.90.1.2
```

Sur le serveur, ajoutez 2 Go de swap (marge de sécurité pendant les compilations) :

```bash
fallocate -l 2G /swapfile && chmod 600 /swapfile && mkswap /swapfile && swapon /swapfile
echo '/swapfile none swap sw 0 0' >> /etc/fstab
docker compose version            # doit afficher la version du plugin Compose
```

---

## 3. Installer l'application

### 3.1 Récupérer le code

Si le dépôt GitHub est **privé**, créez une clé de déploiement en lecture seule :

```bash
ssh-keygen -t ed25519 -f ~/.ssh/github_proxicredit -N ""
cat ~/.ssh/github_proxicredit.pub
```

Copiez la clé affichée dans GitHub : **dépôt → Settings → Deploy keys → Add deploy key**, sans
cocher « Allow write access ». Puis :

```bash
cat >> ~/.ssh/config <<'EOF'
Host github.com
  IdentityFile ~/.ssh/github_proxicredit
EOF
git clone git@github.com:lys-0243/proxicredit.git
cd proxicredit
git checkout main                 # ou la branche à faire tester
```

### 3.2 Fichier `.env`

```bash
cp .env.example .env
openssl rand -hex 32              # à copier dans DJANGO_SECRET_KEY
openssl rand -hex 24              # à copier dans POSTGRES_PASSWORD
nano .env
```

Utilisez des valeurs **hexadécimales** comme ci-dessus : des caractères comme `$`, `@` ou `/`
casseraient l'adresse de connexion à PostgreSQL.

Avec l'IP `164.90.1.2`, le nom de domaine est `proxicredit.164-90-1-2.sslip.io` (points remplacés
par des tirets). Exemple complet :

```
DJANGO_SECRET_KEY=<résultat de openssl rand -hex 32>
DJANGO_ALLOWED_HOSTS=proxicredit.164-90-1-2.sslip.io
DJANGO_CSRF_TRUSTED_ORIGINS=https://proxicredit.164-90-1-2.sslip.io
CORS_ALLOWED_ORIGINS=https://proxicredit.164-90-1-2.sslip.io
POSTGRES_PASSWORD=<résultat de openssl rand -hex 24>
TIME_ZONE=Africa/Kinshasa
DOMAIN=proxicredit.164-90-1-2.sslip.io
DEMO_AUTORISE=True

# Toutes les commandes `docker compose` utiliseront automatiquement la configuration HTTPS
COMPOSE_FILE=docker-compose.yml:docker-compose.staging.yml
```

Grâce à `COMPOSE_FILE`, une simple commande `docker compose ...` suffit dans la suite : plus
besoin d'écrire `-f docker-compose.yml -f docker-compose.staging.yml`.

### 3.3 Démarrer

```bash
docker compose up -d --build      # 5 à 10 minutes la première fois
docker compose ps                 # tous les services doivent être « running »
docker compose logs caddy | grep -i certificate
```

Caddy obtient le certificat HTTPS tout seul en moins d'une minute. Au démarrage, le backend
applique les migrations puis `manage.py initialiser` (devises, agence AG001, plan comptable,
rôles).

Vérifiez depuis votre PC :

```bash
curl -I https://proxicredit.164-90-1-2.sslip.io            # 200 (ou 307 vers /connexion)
curl -I http://proxicredit.164-90-1-2.sslip.io             # redirection vers https
```

---

## 4. Préparer l'environnement de test

### 4.1 Administrateur et première utilisation

```bash
docker compose exec backend python manage.py createsuperuser
```

Suivez ensuite la [première utilisation](LANCEMENT.md#2-première-utilisation), en remplaçant
`localhost` par votre domaine :

1. `https://<DOMAIN>/admin` : rattacher l'administrateur à l'agence `AG001`.
2. `https://<DOMAIN>` : ouvrir la journée comptable.
3. Saisir le taux de change USD → CDF du jour.

### 4.2 Comptes de démonstration pour les partenaires

Un compte par rôle (plus un second comptable pour le contrôle à quatre yeux). Sur le serveur, un
**mot de passe propre est obligatoire** : le mot de passe par défaut figure dans le code et est
donc refusé.

```bash
docker compose exec backend python manage.py creer_comptes_demo --mot-de-passe 'Choisir-Un-Mot-De-Passe-Solide'
```

| Identifiant | Rôle |
|---|---|
| `admin.demo` | Administrateur (2FA obligatoire) |
| `directeur.demo` | Directeur (2FA obligatoire) |
| `chef.demo` | Chef d'agence |
| `accueil.demo` | Agent de réception |
| `credit.demo` | Agent de crédit |
| `comite.demo` | Membre du comité |
| `caissier.demo` | Caissier |
| `comptable.demo`, `comptable2.demo` | Comptable (2FA obligatoire) |
| `auditeur.demo` | Auditeur (lecture seule) |

À transmettre aux partenaires :

- l'adresse `https://<DOMAIN>`, les identifiants et le mot de passe, **par un canal privé** ;
- pour les rôles Administrateur, Directeur et Comptable : la première personne qui se connecte
  configure la 2FA avec une application (Google Authenticator, Microsoft Authenticator, FreeOTP).
  Le compte reste ensuite lié à **son** téléphone. Si plusieurs partenaires doivent tester ces
  rôles, créez-leur plutôt des comptes nominatifs (**Administration → Utilisateurs**).

Relancer la commande réinitialise les mots de passe des comptes de démonstration.

### 4.3 Fin de la période de test

```bash
docker compose exec backend python manage.py creer_comptes_demo --desactiver
```

Puis passez `DEMO_AUTORISE=False` dans `.env` et relancez `docker compose up -d`.

---

## 5. Exploitation

### 5.1 Mettre à jour

```bash
cd ~/proxicredit
git pull
docker compose up -d --build      # migrations et initialiser s'appliquent au redémarrage
```

### 5.2 Journaux

```bash
docker compose logs -f backend    # ou frontend, nginx, caddy, worker…
```

### 5.3 Sauvegardes

Le service `backup` produit chaque jour (au démarrage puis toutes les 24 h), dans
`~/proxicredit/backups/`, avec 30 jours de conservation :

- `proxicredit-AAAA-MM-JJ.dump` : la base PostgreSQL ;
- `media-AAAA-MM-JJ.tar.gz` : les fichiers (photos, KYC).

**Une sauvegarde restée sur le serveur ne protège pas contre sa perte.** En complément :

- activez les **Droplet Backups** (image complète hebdomadaire, voir 2.1) ;
- et/ou récupérez régulièrement les fichiers sur votre PC :

  ```bash
  scp root@164.90.1.2:proxicredit/backups/*-2026-10-30.* .
  ```

Ces fichiers contiennent des données personnelles (KYC) : conservez-les sur un support chiffré.

### 5.4 Restaurer

```bash
cd ~/proxicredit
docker compose stop backend worker beat

# Base
docker compose exec -T db pg_restore -U proxicredit -d proxicredit --clean --if-exists \
  < backups/proxicredit-2026-10-30.dump

# Fichiers (le volume s'appelle <dossier>_media : vérifiez avec `docker volume ls`)
docker run --rm -v proxicredit_media:/media -v "$PWD/backups:/backups" alpine \
  tar xzf /backups/media-2026-10-30.tar.gz -C /media

docker compose start backend worker beat
```

---

## 6. Dépannage

| Symptôme | Cause probable | Solution |
|---|---|---|
| Pas de certificat, `caddy` en erreur | Ports 80/443 fermés ou `DOMAIN` incorrect | Vérifier le pare-feu (2.2) et que l'IP dans `DOMAIN` est celle du Droplet |
| « Bad Request (400) » | Domaine absent de `DJANGO_ALLOWED_HOSTS` | Corriger `.env`, puis `docker compose up -d` |
| « Échec de la vérification CSRF » | `DJANGO_CSRF_TRUSTED_ORIGINS` sans `https://` ou autre domaine | Corriger `.env`, puis `docker compose up -d` |
| Trop de redirections | nginx d'une ancienne version qui écrase `X-Forwarded-Proto` | `git pull`, puis `docker compose up -d` |
| Compilation interrompue (`Killed`) | Mémoire insuffisante | Ajouter le swap (2.3) ou passer à 4 Go |
| `password authentication failed` | `POSTGRES_PASSWORD` modifié après la création de la base | Remettre l'ancien mot de passe (la base garde celui du premier démarrage) |

Les autres erreurs courantes sont dans [LANCEMENT.md](LANCEMENT.md#4-dépannage).

---

## 7. Si le projet passe en production

Cette installation peut évoluer étape par étape, sans réécrire l'application :

1. **Vrai nom de domaine** : faire pointer un enregistrement DNS `A` vers le Droplet, puis changer
   `DOMAIN`, `DJANGO_ALLOWED_HOSTS`, `DJANGO_CSRF_TRUSTED_ORIGINS` et `CORS_ALLOWED_ORIGINS`.
2. **Fichiers sur Spaces** (stockage objet S3) : ajouter `django-storages[s3]`, configurer
   `STORAGES["default"]` en `S3Boto3Storage` avec un bucket **privé** dans
   `backend/config/settings/prod.py`, puis copier le volume `media` vers le bucket
   (`rclone sync`). Les chemins enregistrés en base restent valables, et les vues qui servent les
   fichiers passent déjà par l'API de stockage de Django.
3. **Base managée** (Managed PostgreSQL) : `pg_dump` puis `pg_restore` vers la nouvelle base,
   `DATABASE_URL` avec `?sslmode=require`, puis retirer les services `db` et `backup`.
4. **Plusieurs serveurs ou App Platform** : possible une fois les étapes 2 et 3 faites.
