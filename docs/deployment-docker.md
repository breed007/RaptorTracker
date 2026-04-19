# RaptorTracker — Docker Deployment

Containerized deployment using Docker Compose.

---

## Prerequisites

- Docker Engine 24+
- Docker Compose v2 (included with Docker Desktop and modern Docker Engine)

```bash
docker --version
docker compose version
```

---

## 1. Clone the Repository

```bash
git clone <your-repo-url> raptortracker
cd raptortracker
```

---

## 2. Configure Environment

Edit the environment variables in `docker-compose.yml`:

```yaml
environment:
  - PORT=3000
  - SESSION_SECRET=<generate a long random string here>
  - ADMIN_USERNAME=admin
  - ADMIN_PASSWORD=<your strong password>
  - DATA_DIR=/data
  - UPLOAD_DIR=/data/uploads
```

**Generate a strong session secret:**
```bash
openssl rand -hex 48
# or
node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
```

> **Security note:** Never commit `docker-compose.yml` with real credentials. Consider using a `.env` file and Docker secrets for production.

---

## 3. First Run

```bash
docker compose up -d
```

On first start, the container:
1. Builds the React frontend
2. Runs `npm run db:init` to create the SQLite database
3. Seeds all 6 Raptor vehicle records
4. Seeds the default "Carbonized Raptor" user vehicle
5. Starts the Express server on port 3000

Access RaptorTracker at: **http://localhost:3000**

---

## 4. View Logs

```bash
# Follow live logs
docker compose logs -f raptortracker

# Last 100 lines
docker compose logs --tail=100 raptortracker
```

---

## 5. Update to New Version

```bash
git pull
docker compose down
docker compose build --no-cache
docker compose up -d
```

> Your data is preserved in the `raptortracker_data` Docker volume — it survives container rebuilds.

---

## 6. Backup

Find where Docker stores the volume data:

```bash
docker volume inspect raptortracker_data
# Look for "Mountpoint" — typically /var/lib/docker/volumes/raptortracker_data/_data
```

The mountpoint directory contains:
- `raptortracker.db` — the SQLite database (all mods, maintenance, vehicle data)
- `uploads/` — all uploaded photos

### Backup the volume
```bash
# Get the mountpoint path
MOUNTPOINT=$(docker volume inspect raptortracker_data --format '{{ .Mountpoint }}')

# Backup to a tar archive
tar -czf raptortracker-backup-$(date +%Y%m%d).tar.gz -C "$MOUNTPOINT" .

# Or rsync to a remote server
rsync -az "$MOUNTPOINT/" user@backup-server:/backups/raptortracker/
```

### Restore from backup
```bash
MOUNTPOINT=$(docker volume inspect raptortracker_data --format '{{ .Mountpoint }}')
tar -xzf raptortracker-backup-YYYYMMDD.tar.gz -C "$MOUNTPOINT"
docker compose restart raptortracker
```

---

## 7. Full Reset

> **WARNING: This permanently destroys all your data — mods, photos, maintenance records.**

```bash
docker compose down -v
```

The `-v` flag removes the named volume. After this, running `docker compose up -d` starts completely fresh.

---

## 8. Nginx Reverse Proxy (optional)

If you want to put RaptorTracker behind Nginx on the same Docker host:

```nginx
server {
    listen 80;
    server_name raptortracker.local;

    client_max_body_size 50M;

    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    }
}
```

Or using a Docker Compose network with an Nginx container, change the port mapping and use the container name as the upstream.

---

## 9. Port Customization

To run on a different host port (e.g. 8080):

```yaml
ports:
  - "8080:3000"
```

The container always listens on 3000 internally; only the host-side port changes.
