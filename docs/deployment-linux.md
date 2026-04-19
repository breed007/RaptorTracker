# RaptorTracker — Linux Deployment

Self-hosted deployment guide for Linux servers behind Nginx or Apache.

---

## Prerequisites

- Node.js 20+ and npm
- git
- PM2 (installed globally)
- Nginx or Apache (for reverse proxy)

```bash
# Verify Node version
node --version   # must be 20+
npm --version
```

---

## 1. Clone and Install

```bash
git clone <your-repo-url> /opt/raptortracker
cd /opt/raptortracker

# Install server dependencies
npm install

# Install and build frontend
cd client && npm install && npm run build && cd ..
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
```

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

# Start the app
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

RaptorTracker stores all data in two locations:

| What | Path |
|------|------|
| Database | `DATA_DIR/raptortracker.db` |
| Uploaded photos | `UPLOAD_DIR/` (all files) |

### rsync example
```bash
# Add to cron or Hyper Backup
rsync -az /opt/raptortracker/data/ user@backup-server:/backups/raptortracker/
```

### Simple cron backup
```bash
# /etc/cron.d/raptortracker-backup
0 2 * * * root tar -czf /backups/raptortracker-$(date +\%Y\%m\%d).tar.gz /opt/raptortracker/data/
```

---

## 9. Update

```bash
cd /opt/raptortracker
git pull
npm install
cd client && npm install && npm run build && cd ..
pm2 restart raptortracker
```
