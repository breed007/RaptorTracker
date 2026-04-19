# RaptorTracker

**Ford Raptor Build Tracker** — a self-hosted web application for tracking modifications, maintenance, AUX switch assignments, and build costs across your Ford Raptor.

> Version `2026.04.19` · [GitHub](https://github.com/breed007/RaptorTracker)

---

## Features

### Modification Tracker
- Log every mod with part name, brand, part number, vendor, cost, purchase/install date, and install mileage
- Track status: **Ordered → In Transit → Installed → Removed**
- Attach photos per mod with a full-screen lightbox viewer
- Rich install notes and wiring notes (monospace display)
- Slide-out detail panel on the mod list — click any row for a quick view without leaving the page
- AUX switch assignment per mod (Gen 2, Gen 3, Gen 3.5 layouts)

### Maintenance Log
- Record service events with service type, date, mileage, vendor, cost, and notes
- Attach invoices and receipts (JPEG, PNG, PDF) per maintenance record
- 20+ service type presets (Oil Change, Spark Plugs, Differential Service, Transmission, Tires, Battery, and more)

### Dashboard
- At-a-glance stats: installed mods, mod spend, in-transit, on-order
- Maintenance spend total and last service summary
- Spend-by-category chart
- Recent mods and recent maintenance entries

### AUX Switch Panel
- Factory-accurate AUX switch layouts for **Gen 2, Gen 3, and Gen 3.5**
- Tracks which switches are factory-consumed vs. user-available
- Assign mods to switches with custom labels
- Gen 3.5 correctly reflects AUX 1 as factory-consumed by bumper fogs

### My Garage
- Support for multiple vehicles per account
- Vehicle profile photo and window sticker upload
- Per-vehicle data isolation

### Vehicle Import / Export
- Export any vehicle to a ZIP archive (metadata, photos, window sticker, mods, maintenance)
- Import a ZIP onto the same or a different install
- Useful for backups or moving between servers

### Reference Library
- Read-only factory specs for the complete Ford Raptor lineup:
  - **Gen 1** — 2010–2014 (6.2L V8 / 5.4L V8 SVT)
  - **Gen 2** — 2017–2020 (3.5L EcoBoost)
  - **Gen 3** — 2021–2023 (3.5L EcoBoost High Output)
  - **Gen 3.5** — 2024–present (3.5L EcoBoost HO / Raptor R 5.2L Supercharged V8)
- Engine, transmission, suspension, towing, payload, and AUX panel specs per generation

### PDF Build Sheet Export
- Generate a full PDF build sheet with vehicle info, installed mods, maintenance history, and spend breakdown
- Option to append the window sticker as a final page

### Theme System
Three built-in themes, persisted per browser:

| Theme | Style |
|---|---|
| **Ford Racing** (default) | Ford navy / orange, Inter + Barlow Condensed |
| **FordRaptorForum** | Dark XenForo style, crimson accent, Verdana |
| **Raptor Assault** | Light/dark, red accent, Roboto |

Light/dark mode toggle per theme (FordRaptorForum is always dark).

---

## Tech Stack

| Layer | Technology |
|---|---|
| Backend | Node.js + Express |
| Database | SQLite (better-sqlite3) |
| Frontend | React 18 + Vite |
| Styling | Tailwind CSS + CSS custom properties |
| Auth | express-session + bcrypt |
| File uploads | Multer 2.x |
| PDF generation | PDFKit |
| Import/Export | archiver + adm-zip |

---

## Requirements

- **Node.js** v20 or later
- **npm** v8 or later
- Linux (Ubuntu 20.04/22.04/24.04, Debian 11/12, AlmaLinux/Rocky/RHEL 8/9) for the install script
- macOS or Windows for local development

---

## Installation (Linux Server)

The included `install.sh` handles everything: Node.js, PM2, nginx or Apache reverse proxy, systemd startup, firewall, and database seeding.

```bash
# Clone the repo
git clone https://github.com/breed007/RaptorTracker.git
cd RaptorTracker

# Run the installer as root
sudo bash install.sh
```

The script will prompt for:
- Install directory (default `/opt/raptortracker`)
- Application port (default `3000`)
- Service account name (default `raptortracker`)
- Domain or IP
- Admin username and password
- Web server (nginx recommended, apache supported, or standalone)
- Firewall configuration

At the end it prints the URL, admin credentials, and PM2 management commands.

### PM2 Operations

```bash
sudo -u raptortracker pm2 list
sudo -u raptortracker pm2 logs raptortracker
sudo -u raptortracker pm2 restart raptortracker
sudo -u raptortracker pm2 stop raptortracker
```

---

## Local Development

```bash
# Clone
git clone https://github.com/breed007/RaptorTracker.git
cd RaptorTracker

# Install server dependencies
npm install

# Install client dependencies
cd client && npm install && cd ..

# Create .env
cp .env.example .env   # then edit with your values

# Seed the database
npm run db:init

# Start both servers with hot reload
npm run dev
```

The API runs on `http://localhost:3000` and the Vite dev server on `http://localhost:5173`.

### Environment Variables (`.env`)

```
PORT=3000
SESSION_SECRET=your-random-secret-here
ADMIN_USERNAME=admin
ADMIN_PASSWORD=yourpassword
DATA_DIR=./data
UPLOAD_DIR=./data/uploads
NODE_ENV=development
```

---

## Project Structure

```
RaptorTracker/
├── server.js                  # Express entry point
├── server/
│   ├── db/
│   │   ├── index.js           # DB connection + migrations
│   │   └── init.js            # Schema creation + vehicle seed data
│   └── routes/
│       ├── mods.js
│       ├── maintenance.js
│       ├── userVehicles.js
│       ├── vehicles.js
│       ├── export.js          # PDF build sheet
│       ├── vehicleTransfer.js # ZIP import/export
│       ├── upload.js
│       ├── summary.js
│       └── vin.js
├── client/
│   ├── src/
│   │   ├── pages/             # Dashboard, Mods, Maintenance, AUX, Garage, …
│   │   ├── components/        # Nav, Layout, StatsCard, SpendChart, Lightbox, …
│   │   └── context/
│   │       └── AppContext.jsx # Auth, vehicle selection, theme
│   ├── vite.config.js
│   └── tailwind.config.js
├── install.sh                 # Linux server installer
├── uninstall.sh
└── package.json
```

---

## Versioning

RaptorTracker uses **Calendar Versioning** (`YYYY.MM.DD`). The current version is displayed in the footer of every page, linked to this repository.

To release a new version, update `"version"` in `package.json` and rebuild:

```bash
npm run build
```

---

## Uninstall

```bash
sudo bash /opt/raptortracker/uninstall.sh
```

---

## License

Personal / private use. All rights reserved.

© Copyright breed breed007@gmail.com 2026
