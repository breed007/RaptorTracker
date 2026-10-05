# RaptorTracker: Docker Deployment

The published image (`ghcr.io/breed007/raptortracker`) is built for amd64 and arm64, so the same
steps work on a server, a VM, or a Raspberry Pi 3 or newer with 64-bit Raspberry Pi OS. See
[Running on a Raspberry Pi](../README.md#running-on-a-raspberry-pi) for Pi specifics.

You need Docker Engine 24 or newer with the Compose plugin (`docker compose version` should work).

---

## 1. Get the Compose file and settings

```bash
mkdir raptortracker && cd raptortracker
curl -fsSLO https://raw.githubusercontent.com/breed007/RaptorTracker/main/docker-compose.yml
curl -fsSL https://raw.githubusercontent.com/breed007/RaptorTracker/main/.env.example -o .env
```

Or clone the repository; `docker-compose.yml` and `.env.example` are at its top level.

## 2. Set the two secrets

Edit `.env` and set:

- `SESSION_SECRET`: 32 or more random characters. Generate one with `openssl rand -hex 48`.
- `ADMIN_PASSWORD`: the password for your first sign-in. You'll set a permanent one in the app.

Compose refuses to start until both are set, and the app refuses placeholder values. Keep `.env`
out of version control. Other settings you might want: `TZ` (for example `America/Denver`) so
reminders and nightly backups run at your local hour, `PORT` to use a host port other than 3000,
and the `SMTP_` settings for email reminders. The README's
[Configuration](../README.md#configuration) table lists them all.

## 3. Start it

```bash
docker compose up -d
```

Docker pulls the image for your machine's architecture and starts it. On the first start the app
creates its database in the `raptortracker_data` volume. Open `http://<server>:3000`, sign in, and
set a real password under **Settings → Account**.

```bash
docker compose logs -f raptortracker     # follow the log
docker compose ps                        # shows "healthy" once it's answering
```

---

## Updating

The app shows when a new version is out (**Settings → General**). Take a backup first
(**Settings → Backups → Back Up Now**), then:

```bash
docker compose pull
docker compose up -d
```

Your data is in the `raptortracker_data` volume and survives the new container. The new version
migrates the database on its first start.

To build the image from source instead of pulling it, clone the repository and run
`docker compose up -d --build`.

---

## Backups

Use the app's own backups: **Settings → Backups** takes full backups (database and uploads), runs
them nightly, and can copy each one to a NAS folder, a WebDAV server, or S3-compatible storage. To
copy to a folder on the host, mount it into the container and give that path as the off-box
folder:

```yaml
    volumes:
      - raptortracker_data:/data
      - /mnt/nas/raptortracker:/offsite      # then use /offsite in Settings → Backups
```

The volume itself lives under Docker's data directory
(`docker volume inspect raptortracker_data` shows where). Copy it only while the container is
stopped; copying a SQLite database that's in use can give you a damaged copy.

---

## Behind a reverse proxy

To serve it on a domain with HTTPS, put a reverse proxy in front and keep the app on a private
port. With nginx on the same host:

```nginx
server {
    listen 80;
    server_name raptortracker.example.com;
    client_max_body_size 50M;

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

Set `TRUST_PROXY=1` (the Compose file's default) so sign-in rate limiting sees each visitor's
address, and `COOKIE_SECURE=true` once the site is served over HTTPS.

---

## Removing it

```bash
docker compose down        # stops it and keeps the data volume
docker compose down -v     # also deletes the data volume: every record and photo
```
