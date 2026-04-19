# RaptorTracker

**Ford Raptor Build Tracker** — a self-hosted web application for documenting vehicle modifications, tracking AUX switch assignments, logging maintenance records, and exporting PDF build sheets.

Built for the full Ford Raptor lineup: F-150 Raptor Gen 1–3.5, Bronco Raptor, and Ranger Raptor (North America).

---

## Table of Contents

1. [Features](#features)
2. [System Requirements](#system-requirements)
3. [Quick Start — Docker](#quick-start--docker)
4. [Linux Native Install](#linux-native-install)
   - [Automated Install Script](#automated-install-script)
   - [Manual Step-by-Step](#manual-step-by-step)
5. [Configuration Reference](#configuration-reference)
6. [First Login](#first-login)
7. [Application Overview](#application-overview)
8. [Updating RaptorTracker](#updating-raptortracker)
9. [Backup & Restore](#backup--restore)
10. [Uninstalling](#uninstalling)
11. [Troubleshooting](#troubleshooting)

---

## Features

- **Mod tracker** — part name, brand, vendor, part number, category, status, cost, install date, wiring notes, up to 10 photos per mod
- **AUX switch panel** — visual 6-slot grid wired to live mod data; Gen 3.5 AUX 1 amber warning badge for factory fog light conflict; Gen 1 no-panel notice
- **Vehicle reference** — read-only spec cards for all six Raptor generations with engine options, suspension notes, and factory AUX layouts
- **Garage** — register multiple vehicles; per-vehicle mod counts and spend totals
- **Maintenance log** — oil changes, tire rotations, fluid services with mileage and cost tracking
- **Dashboard** — stats cards, Chart.js spend-by-category bar chart, recent activity feed
- **PDF export** — full build sheet with photos, AUX map, maintenance history, and cost summary
- **Mobile-first** — dark UI designed for use on a phone in the garage
- **Single-user auth** — session-based login; credentials stored in `.env`

---

## System Requirements

### Docker (recommended)

| Requirement | Minimum |
|---|---|
| Docker Engine | 24.0+ |
| Docker Compose | v2.0+ (included with Docker Desktop) |
| Disk space | 1 GB (image + data volume) |
| RAM | 256 MB |
| Architecture | `amd64` or `arm64` |

### Linux Native

| Requirement | Minimum |
|---|---|
| OS | Ubuntu 20.04+, Debian 11+, CentOS 7/8, AlmaLinux/Rocky 8/9, RHEL 8/9 |
| Node.js | **20.x or later** (installed automatically by `install.sh` if missing) |
| npm | 10+ (bundled with Node.js 20) |
| RAM | 256 MB |
| Disk | 500 MB for app + space for photo uploads |
| Web server | nginx or Apache httpd (optional; can run standalone) |
| Network | Outbound HTTPS during install for NodeSource and npm packages |

> **Note:** The `better-sqlite3` package compiles a native C++ module during `npm install`. The install script automatically installs `build-essential` (Debian/Ubuntu) or `gcc`/`make` (RHEL family) to satisfy this requirement.

---

## Quick Start — Docker

Docker is the fastest and most portable install method. All dependencies are bundled; no Node.js required on the host.

### 1. Clone the repository

```bash
git clone https://github.com/youruser/raptortracker.git
cd raptortracker
```

### 2. Set credentials

Edit `docker-compose.yml` and change the three security-sensitive values:

```yaml
environment:
  - SESSION_SECRET=replace_with_a_long_random_string
  - ADMIN_USERNAME=admin
  - ADMIN_PASSWORD=replace_with_a_strong_password
```

Generate a strong session secret:

```bash
openssl rand -hex 48
```

### 3. Start the container

```bash
docker compose up -d
```

On first start the container:
- Builds the React frontend
- Creates the SQLite database
- Seeds all six Raptor vehicle records
- Seeds a default "Carbonized Raptor" 2025 Gen 3.5 user vehicle
- Starts the Express server

RaptorTracker is available at **http://localhost:3000**.

### 4. Verify it is running

```bash
docker compose ps
docker compose logs raptortracker
```

### Common Docker commands

```bash
# View live logs
docker compose logs -f raptortracker

# Restart
docker compose restart raptortracker

# Stop
docker compose down

# Update to a new version
git pull
docker compose down
docker compose build --no-cache
docker compose up -d
```

### Docker data volume

All persistent data lives in the `raptortracker_data` named volume.

```bash
# Find the volume location on disk
docker volume inspect raptortracker_data

# Backup the volume
MOUNTPOINT=$(docker volume inspect raptortracker_data --format '{{ .Mountpoint }}')
tar -czf raptortracker-backup-$(date +%Y%m%d).tar.gz -C "$MOUNTPOINT" .

# Full reset — WARNING: destroys all data
docker compose down -v
```

---

## Linux Native Install

### Automated Install Script

`install.sh` is a fully interactive, idempotent installer that handles everything from package installation through web server configuration and PM2 process management.

**Supported distributions:**

| Distribution | Versions |
|---|---|
| Ubuntu | 20.04, 22.04, 24.04 |
| Debian | 11 (Bullseye), 12 (Bookworm) |
| CentOS | 7, 8 |
| AlmaLinux | 8, 9 |
| Rocky Linux | 8, 9 |
| RHEL | 8, 9 |

**What the script installs and configures:**

- `curl`, `rsync`, `git` (if missing)
- Build tools: `build-essential` / `gcc`+`make` (required for SQLite native module)
- Node.js 20.x via NodeSource repository (if missing or outdated)
- PM2 process manager (global npm install)
- A `raptortracker` system service account
- The application files (from local source or a git URL)
- A `.env` file with generated session secret and your chosen credentials
- npm dependencies and the Vite frontend build
- SQLite database with seeded Raptor vehicle data
- nginx or Apache reverse proxy configuration
- PM2 systemd startup unit (survives reboots)
- Firewall rules (ufw or firewalld, if active)

#### Running the installer

```bash
# From the project directory (most common)
sudo bash install.sh

# Or from anywhere, pointing at a git repo
sudo bash install.sh
# → enter your git URL when prompted
```

The script will prompt for:

| Prompt | Default | Notes |
|---|---|---|
| Source directory | detected automatically | The project directory, or a git URL |
| Install directory | `/opt/raptortracker` | Where app files are placed |
| Application port | `3000` | Internal Node.js port; not exposed if using a web server |
| Service account | `raptortracker` | Created as a system user if it does not exist |
| Domain / IP | `localhost` | Used in the web server `ServerName`/`server_name` |
| Admin username | `admin` | RaptorTracker login username |
| Admin password | auto-generated | Shown at end of install; save it |
| Web server | detected | nginx, apache, or standalone |
| Firewall | yes | Opens port 80 in ufw or firewalld |

#### What gets created

```
/opt/raptortracker/          ← application files (owner: raptortracker)
/opt/raptortracker/.env      ← credentials (chmod 600)
/opt/raptortracker/data/     ← SQLite database + uploads
/var/log/raptortracker/      ← PM2 stdout/stderr logs
/etc/raptortracker-install.conf  ← state file for uninstall.sh
/etc/nginx/sites-available/raptortracker.conf   ← nginx (Debian/Ubuntu)
/etc/nginx/conf.d/raptortracker.conf            ← nginx (RHEL family)
/etc/apache2/sites-available/raptortracker.conf ← apache (Debian/Ubuntu)
/etc/httpd/conf.d/raptortracker.conf            ← apache (RHEL family)
/etc/systemd/system/pm2-raptortracker.service   ← PM2 systemd unit
```

---

### Manual Step-by-Step

Use these steps if you need more control or are running on an unsupported distribution.

#### 1. Install Node.js 20+

```bash
# Via NodeSource (Debian/Ubuntu)
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo bash -
sudo apt-get install -y nodejs

# Via NodeSource (CentOS/RHEL)
curl -fsSL https://rpm.nodesource.com/setup_20.x | sudo bash -
sudo dnf install -y nodejs
```

Verify: `node --version` must show `v20.x.x` or later.

#### 2. Install build tools

```bash
# Debian/Ubuntu
sudo apt-get install -y build-essential python3-minimal git curl rsync

# CentOS/RHEL
sudo dnf install -y gcc gcc-c++ make python3 git curl rsync
```

#### 3. Clone the repository

```bash
git clone https://github.com/youruser/raptortracker.git /opt/raptortracker
cd /opt/raptortracker
```

#### 4. Configure environment

```bash
cp .env.example .env
nano .env
```

Set at minimum:

```env
PORT=3000
SESSION_SECRET=<64-character random string>
ADMIN_USERNAME=admin
ADMIN_PASSWORD=<strong password>
DATA_DIR=/opt/raptortracker/data
UPLOAD_DIR=/opt/raptortracker/data/uploads
NODE_ENV=production
```

Generate a session secret:
```bash
node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
```

#### 5. Install dependencies and build frontend

```bash
npm ci --omit=dev
npm ci --prefix client
npm run build
```

#### 6. Initialize the database

```bash
mkdir -p data/uploads
npm run db:init
```

This creates `data/raptortracker.db` and seeds all six Raptor vehicles and a default user vehicle.

#### 7. Create a service account

```bash
sudo useradd --system --shell /bin/bash --create-home \
     --comment "RaptorTracker service" raptortracker
sudo chown -R raptortracker:raptortracker /opt/raptortracker
sudo chmod 600 /opt/raptortracker/.env
```

#### 8. Install and configure PM2

```bash
sudo npm install -g pm2

# Start as the service user
sudo -u raptortracker pm2 start /opt/raptortracker/server.js --name raptortracker

# Register systemd startup
sudo pm2 startup systemd -u raptortracker --hp /home/raptortracker

# Save the process list
sudo -u raptortracker pm2 save
```

#### 9. Configure nginx (recommended)

**Debian/Ubuntu** — write to `/etc/nginx/sites-available/raptortracker`:

```nginx
server {
    listen 80;
    server_name your-domain-or-ip;
    client_max_body_size 50M;

    location / {
        proxy_pass         http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header   Host               $host;
        proxy_set_header   X-Real-IP          $remote_addr;
        proxy_set_header   X-Forwarded-For    $proxy_add_x_forwarded_for;
        proxy_set_header   X-Forwarded-Proto  $scheme;
        proxy_read_timeout 300s;
    }
}
```

```bash
sudo ln -s /etc/nginx/sites-available/raptortracker /etc/nginx/sites-enabled/
sudo nginx -t && sudo systemctl reload nginx
```

**CentOS/RHEL** — write directly to `/etc/nginx/conf.d/raptortracker.conf` (same content), then:

```bash
sudo nginx -t && sudo systemctl reload nginx
```

#### 9b. Configure Apache (alternative)

```apache
<VirtualHost *:80>
    ServerName your-domain-or-ip
    LimitRequestBody 52428800

    ProxyPreserveHost On
    ProxyPass        / http://127.0.0.1:3000/
    ProxyPassReverse / http://127.0.0.1:3000/
</VirtualHost>
```

**Debian/Ubuntu:**
```bash
sudo a2enmod proxy proxy_http headers
sudo a2ensite raptortracker
sudo systemctl reload apache2
```

**CentOS/RHEL** — write to `/etc/httpd/conf.d/raptortracker.conf` and:
```bash
sudo systemctl reload httpd
```

---

## Configuration Reference

All runtime configuration is in the `.env` file at the install root.

| Variable | Default | Description |
|---|---|---|
| `PORT` | `3000` | TCP port the Node.js server listens on |
| `SESSION_SECRET` | *(required)* | Secret key for session cookies — use a 48+ character random string |
| `ADMIN_USERNAME` | `admin` | Login username |
| `ADMIN_PASSWORD` | *(required)* | Login password — stored in plaintext in `.env`; protect with `chmod 600` |
| `DATA_DIR` | `./data` | Directory for the SQLite database file |
| `UPLOAD_DIR` | `./data/uploads` | Directory for uploaded photo files |
| `NODE_ENV` | `production` | Set to `production` for all non-development installs |

**After changing `.env`**, restart the application:

```bash
# PM2
sudo -u raptortracker pm2 restart raptortracker

# Docker
docker compose restart raptortracker
```

---

## First Login

1. Open a browser and navigate to your server's URL (e.g. `http://raptor.local` or `http://192.168.1.100`)
2. Log in with the admin username and password you configured
3. A default vehicle — **Carbonized Raptor** (2025 F-150 Raptor Gen 3.5) — is pre-seeded
4. Navigate to **My Garage** to update or replace it with your own vehicle
5. Navigate to **Mods** → **Add Mod** to start logging modifications

---

## Application Overview

| Page | URL | Description |
|---|---|---|
| Dashboard | `/` | Stats, spend chart, recent activity |
| My Garage | `/garage` | Register and manage vehicles |
| Mods | `/mods` | Sortable/filterable modification list |
| Mod Detail | `/mods/:id` | Edit a mod, manage photos, assign AUX switch |
| AUX Panel | `/aux` | Visual 6-slot AUX switch map |
| Maintenance | `/maintenance` | Service history log |
| Reference | `/vehicles` | Read-only Raptor spec database |
| Export | `/export` | Download PDF build sheet |

---

## Updating RaptorTracker

### Docker

```bash
cd /path/to/raptortracker
git pull
docker compose down
docker compose build --no-cache
docker compose up -d
```

The database is in a named volume and is not affected by image rebuilds.

### Linux Native (PM2)

```bash
cd /opt/raptortracker

# Pull latest code
sudo git pull

# Reinstall dependencies and rebuild frontend
sudo -u raptortracker npm ci --omit=dev
sudo -u raptortracker npm ci --prefix client
sudo -u raptortracker npm run build

# Restart the app
sudo -u raptortracker pm2 restart raptortracker
```

---

## Backup & Restore

RaptorTracker stores all persistent data in two locations:

| What | Path (default) | Contains |
|---|---|---|
| Database | `/opt/raptortracker/data/raptortracker.db` | All mods, maintenance records, vehicles |
| Photos | `/opt/raptortracker/data/uploads/` | All uploaded mod photos |

**Both must be backed up together** — the database stores file paths that reference the uploads directory.

### Create a backup

```bash
# Single tar archive
tar -czf raptortracker-backup-$(date +%Y%m%d).tar.gz /opt/raptortracker/data/

# rsync to remote host
rsync -az /opt/raptortracker/data/ user@backup-server:/backups/raptortracker/
```

### Cron backup example

```bash
# /etc/cron.d/raptortracker
0 2 * * * root tar -czf /backups/raptortracker-$(date +\%Y\%m\%d).tar.gz \
           /opt/raptortracker/data/ 2>/dev/null
```

### Restore from backup

```bash
# Stop the app first
sudo -u raptortracker pm2 stop raptortracker

# Restore data
tar -xzf raptortracker-backup-YYYYMMDD.tar.gz -C /

# Restart
sudo -u raptortracker pm2 start raptortracker
```

### Docker backup

```bash
MOUNTPOINT=$(docker volume inspect raptortracker_data --format '{{ .Mountpoint }}')
tar -czf raptortracker-backup-$(date +%Y%m%d).tar.gz -C "$MOUNTPOINT" .
```

### Docker restore

```bash
docker compose down
MOUNTPOINT=$(docker volume inspect raptortracker_data --format '{{ .Mountpoint }}')
tar -xzf raptortracker-backup-YYYYMMDD.tar.gz -C "$MOUNTPOINT"
docker compose up -d
```

---

## Uninstalling

### Linux Native

```bash
sudo bash /opt/raptortracker/uninstall.sh
```

The uninstaller reads `/etc/raptortracker-install.conf` (written by `install.sh`) to know what to clean up. If that file is missing it will prompt for the details interactively.

**What it removes:**

- PM2 process (`raptortracker`) stopped and deleted
- PM2 systemd unit (`pm2-raptortracker.service`) disabled and removed
- Web server config file (nginx or Apache) and service reloaded
- Application directory (`/opt/raptortracker` by default)
- PM2 log directory (`/var/log/raptortracker`)
- Install state file (`/etc/raptortracker-install.conf`)

**Optionally removes** (you are asked separately for each):

- Data directory containing the SQLite database and all photos — requires typing `YES` to confirm
- Service account (`raptortracker` system user)

### Docker

```bash
# Stop and remove containers, keep data volume
docker compose down

# Full removal including all data
docker compose down -v
docker rmi raptortracker-raptortracker  # remove the built image
```

---

## Troubleshooting

### Application won't start

```bash
# Check PM2 process status
sudo -u raptortracker pm2 list

# View live logs
sudo -u raptortracker pm2 logs raptortracker --lines 50

# Verify the .env file exists and has correct values
sudo cat /opt/raptortracker/.env
```

### Database error on startup

The most common cause is wrong `DATA_DIR` in `.env`. Check:

```bash
# Verify the database exists
ls -lh /opt/raptortracker/data/raptortracker.db

# Re-run the init script if it's missing
cd /opt/raptortracker && node server/db/init.js
```

### Port already in use

```bash
# Find what is using port 3000
sudo ss -tlnp | grep :3000
# or
sudo lsof -i :3000

# Change the port in .env and restart
```

### nginx 502 Bad Gateway

The app process is not running or is listening on a different port.

```bash
sudo -u raptortracker pm2 list          # check app is online
sudo -u raptortracker pm2 restart raptortracker
grep proxy_pass /etc/nginx/sites-enabled/raptortracker.conf  # verify port matches .env
```

### Apache mod_proxy not loaded (RHEL)

```bash
grep -r "proxy" /etc/httpd/conf.modules.d/
# If absent:
sudo dnf install -y mod_proxy
sudo systemctl restart httpd
```

### Photos not uploading

1. Check `UPLOAD_DIR` in `.env` exists and is writable by the service user:
   ```bash
   ls -ld /opt/raptortracker/data/uploads
   sudo chown raptortracker:raptortracker /opt/raptortracker/data/uploads
   ```
2. Check the web server `client_max_body_size` (nginx) or `LimitRequestBody` (Apache) is set to at least `50M`.

### App doesn't start after reboot

```bash
# Verify systemd unit is enabled
systemctl status pm2-raptortracker.service

# Re-register if needed (run as root)
pm2 startup systemd -u raptortracker --hp /home/raptortracker
sudo -u raptortracker pm2 save
```

### Docker: container exits immediately

```bash
docker compose logs raptortracker
```

Common causes: missing or invalid environment variables in `docker-compose.yml`, or volume permissions issue.

### Reset admin password

Edit `/opt/raptortracker/.env` (or `docker-compose.yml`), change `ADMIN_PASSWORD`, then restart:

```bash
# PM2
sudo -u raptortracker pm2 restart raptortracker

# Docker
docker compose restart raptortracker
```

---

## File Layout

```
raptortracker/
├── server.js               # Express entry point
├── server/
│   ├── db/
│   │   ├── index.js        # SQLite connection singleton
│   │   └── init.js         # Schema creation + vehicle seed
│   ├── middleware/
│   │   └── auth.js         # Session auth + bcrypt login
│   └── routes/
│       ├── vehicles.js     # GET /api/vehicles
│       ├── userVehicles.js # CRUD /api/user-vehicles
│       ├── mods.js         # CRUD /api/mods
│       ├── maintenance.js  # CRUD /api/maintenance
│       ├── upload.js       # POST /api/upload (multer)
│       ├── summary.js      # GET /api/summary (dashboard stats)
│       └── export.js       # GET /api/export/pdf/:id (PDFKit)
├── client/                 # React + Vite frontend
│   └── src/
│       ├── pages/          # Dashboard, Garage, ModList, AuxPanel, …
│       ├── components/     # Layout, Nav, SpendChart, StatusBadge, …
│       └── context/        # AppContext (vehicle selection + auth)
├── data/                   # Created at runtime
│   ├── raptortracker.db        # SQLite database
│   └── uploads/            # Uploaded photos
├── docs/
│   ├── deployment-linux.md
│   └── deployment-docker.md
├── install.sh              # Automated Linux installer
├── uninstall.sh            # Automated Linux uninstaller
├── Dockerfile
├── docker-compose.yml
└── .env.example
```

---

## License

MIT


