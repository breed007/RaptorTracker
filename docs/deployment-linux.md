# RaptorTracker: Linux Deployment

Setting RaptorTracker up by hand on a Linux server behind nginx or Apache. Most people should use
`install.sh` instead, which does all of this (see the README's
[Linux server installer](../README.md#linux-server-installer)); this guide is for when you want to
control each step.

---

## Prerequisites

- A 64-bit Linux system (x86_64 or arm64)
- Node.js 22.12 or newer (24 recommended) and npm
- git
- PM2 (installed globally)
- Nginx or Apache (for reverse proxy)

```bash
# Verify Node version
node --version   # must be 22.12 or newer
npm --version
```

---

## 1. Clone and Install

```bash
git clone https://github.com/breed007/RaptorTracker.git /opt/raptortracker
cd /opt/raptortracker

# Server dependencies (prebuilt SQLite and bcrypt; nothing compiles)
npm ci --omit=dev

# Build the web app (needs about 450 MB of memory)
npm ci --prefix client
npm run build
```

---

## 2. Configure Environment

```bash
cp .env.example .env
nano .env
```

Edit `.env` with your values:

```env
PORT=3000
SESSION_SECRET=<generate a long random string>
ADMIN_USERNAME=admin
ADMIN_PASSWORD=<your strong password>
DATA_DIR=/opt/raptortracker/data
UPLOAD_DIR=/opt/raptortracker/data/uploads
NODE_ENV=production
TRUST_PROXY=1            # one reverse proxy (nginx or Apache) in front
COOKIE_SECURE=false      # true once the site is served over HTTPS
```

In production the server refuses to start with a missing or placeholder `SESSION_SECRET` or
`ADMIN_PASSWORD`.

Generate a strong session secret:
```bash
node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
```

---

## 3. Initialize Database

```bash
npm run db:init
```

This creates the SQLite database at `DATA_DIR/raptortracker.db` and seeds all vehicle data.

---

## 4. File Permissions

```bash
# Create data directories
mkdir -p /opt/raptortracker/data/uploads

# Set ownership (replace 'nodeuser' with your service user)
chown -R nodeuser:nodeuser /opt/raptortracker/data
chmod 755 /opt/raptortracker/data
chmod 755 /opt/raptortracker/data/uploads
```

---

## 5. Start with PM2

```bash
npm install -g pm2

# Start the app (server.js reads NODE_ENV and the rest from .env)
pm2 start server.js --name raptortracker --cwd /opt/raptortracker

# Configure PM2 to start on system boot
pm2 startup
pm2 save

# Useful PM2 commands
pm2 status          # check status
pm2 logs raptortracker  # view logs
pm2 restart raptortracker
pm2 stop raptortracker
```

---

## 6. Nginx Reverse Proxy

Create `/etc/nginx/sites-available/raptortracker`:

```nginx
server {
    listen 80;
    server_name your-domain.com;  # or your server IP

    # Increase upload size for photos
    client_max_body_size 50M;

    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_cache_bypass $http_upgrade;
    }
}
```

Enable and reload:
```bash
ln -s /etc/nginx/sites-available/raptortracker /etc/nginx/sites-enabled/
nginx -t && systemctl reload nginx
```

---

## 7. Apache Reverse Proxy

Enable required modules:
```bash
a2enmod proxy proxy_http headers
```

Create `/etc/apache2/sites-available/raptortracker.conf`:

```apache
<VirtualHost *:80>
    ServerName your-domain.com

    # Increase upload size for photos (50MB)
    LimitRequestBody 52428800

    ProxyPreserveHost On
    ProxyPass / http://localhost:3000/
    ProxyPassReverse / http://localhost:3000/

    RequestHeader set X-Forwarded-Proto "http"
</VirtualHost>
```

Enable and reload:
```bash
a2ensite raptortracker
systemctl reload apache2
```

---

## 8. Backup

Use the app's own backups under **Settings → Backups**: full backups of the database and uploads,
nightly on a schedule, with each one copied to a NAS folder, WebDAV, or S3-compatible storage.
They're taken with SQLite's online backup, so they're consistent while the app runs.

If you copy the data directory yourself, stop the app first (`pm2 stop raptortracker`). Copying
`raptortracker.db` while it's being written can give you a damaged copy.

---

## 9. Update

If you installed with `install.sh`, update from the clone you ran it in:

```bash
cd ~/RaptorTracker        # wherever you cloned it
git pull
sudo bash install.sh --update
```

That copies the database to `data/backups/` first, installs the new dependencies, rebuilds the web
app, and restarts it, using the settings from the original install.

For a manual install like the one above:

```bash
cd /opt/raptortracker
git pull
npm ci --omit=dev
npm ci --prefix client
npm run build
pm2 restart raptortracker
```
