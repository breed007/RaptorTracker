# RaptorTracker User Guide

This guide covers using RaptorTracker once it's running. To install it, see the
[README](../README.md#installing): Docker, the Linux installer, or a Raspberry Pi.

- [Getting started](#getting-started)
- [Everyday use](#everyday-use)
- [Settings](#settings)
- [Moving, selling, and sharing](#moving-selling-and-sharing)
- [FAQ](#faq)
- [Troubleshooting](#troubleshooting)

---

## Getting started

### First sign-in

Sign in with the username and password from your `.env` file (or `docker-compose`'s `.env`).
Then go to **Settings → Account** and set a new password. Until you do, the server prints a
warning on every start, because the `.env` password sits in a plain text file. Once you've set
one, it's stored as a bcrypt hash and the `.env` value is ignored.

### Your first truck

The first screen asks for your truck. If you have the VIN, enter it and press **Decode**; that
fills in the model and year from NHTSA. Give the truck a name and you're in. Below the form you can
also check the units (miles or kilometers, gallons or liters, the currency), which are suggested
from your browser's language.

Not ready to type anything in? **Look around with a sample truck** loads a 2022 Raptor with two
and a half years of made-up history, so every page has something on it. A banner on the dashboard
removes it in one click when you're done.

---

## Everyday use

### The dashboard

**Needs Attention** lists what to act on: overdue service, an AUX circuit that's over its fuse,
recalls you've confirmed affect your truck, expiring registration or warranties. **Coming Up** shows
what's due next, with dates projected from how much you actually drive.

### Quick Add (on your phone)

RaptorTracker installs on a phone's home screen like an app (in Safari, **Share → Add to Home
Screen**; in Chrome, **Install app**). The **+** button opens Quick Add, which logs a fill-up, an
odometer reading, a service, or a photo of a receipt in a few taps.

### Fuel and economy

Log fill-ups on the **Fuel Log** page or with Quick Add. Turn off **Full tank** for a partial
fill. Economy is measured from one full tank to the next, counting any partial fills in between. If
you forgot to log a fill-up, tick **Missed logging the last fill-up** on the next one, so that tank
isn't counted with fuel that was never recorded.

### Service and intervals

On **Maintenance**, log each service with the odometer reading, who did it, the cost, and any
receipts. **Service intervals** (oil every 5,000 miles or 6 months, and so on) drive the reminders
and the forecast. **Load Ford Factory Defaults** adds Ford's intervals for your generation as a starting
point.

### Mods and the AUX panel

Each mod has a status (Researching, Ordered, In Transit, Installed, Removed), cost, photos, and
receipts. If it's wired to an upfitter switch, assign it to an AUX switch and enter its amp draw.
The **AUX Panel** then shows each switch's fuse, what's on it, and how much headroom is left, and
flags anything that would overload a circuit, including items still on your wishlist. Fuse ratings
come from Ford's documentation for your generation; if your truck differs, edit the rating on the
AUX panel.

### Recalls

The **Recalls** page lists NHTSA campaigns for your model and year. NHTSA lists recalls by model
year, not by truck, so not every one applies to yours. Check your VIN on NHTSA's site (the page has
a link and a copy button), then mark each campaign as affecting your truck, not applying, or
repaired. Only the ones you confirm show up on the dashboard.

### Trail log and air-down card

Log outings with the terrain, the tire set, and the pressures you ran. Each tire set's **Air-down
card** (on **Tire Sets**) shows the street pressure and what you've run on each terrain with those
tires. It prints for the glovebox, and the outing form suggests last time's pressures.

### Deleting and Undo

Deleting anything, a fill-up or a whole truck, moves it to the trash. An **Undo** button appears
right after, and **Settings → Trash** keeps it for 30 days with its photos and files. After that
it's removed for good.

---

## Settings

**General** has units and currency, photo size, and the release check.

- **Units:** switching between miles and kilometers (or gallons and liters, or psi, kPa, and bar)
  converts every stored value, after saving a copy of the database to `data/backups/`. Currency
  changes the symbol only; amounts aren't exchanged.
- **Photos:** photos are resized to 2560 pixels on the long side before upload (receipts and
  documents to 3000), and their location data is removed. You can keep full-size uploads on a
  device if you want them.
- **Updates:** once a day the server asks GitHub whether a newer version is out and shows it here
  and in the sidebar, with the command to upgrade.

**Backups** has three parts:

- **Full backup and restore:** a ZIP of the database and every upload. Restoring replaces
  everything with the backup's contents.
- **Nightly backups:** written to `data/backups/` on the server, keeping the newest few.
- **Off-box copies:** each backup can also go to a folder (a NAS share or USB drive), a WebDAV
  server, or S3-compatible storage. Set this up. A backup on the same disk as the database doesn't
  survive that disk failing.

The **Storage** card shows where the space goes, removes files no record uses, and can shrink
photos that were uploaded full-size before 1.0.

**Import & Export** exports any record type as CSV and imports CSVs. Exports from Fuelly, Drivvo,
and Simply Auto are recognized automatically; the preview shows what will be added before anything
is saved, and records you already have are skipped.

**Notifications** sends a daily digest of what's due by email (needs SMTP settings in `.env`), a
Discord or Slack webhook, or both.

**Account** changes your password. **Trash** restores or permanently deletes deleted records.

---

## Moving, selling, and sharing

- **Moving to a new server:** take a full backup on the old one, install on the new one, and
  restore it under **Settings → Backups**. To move one truck instead, use **Import / Export → Export** in
  **My Garage**, and **Import / Export → Import Vehicle** on the other install.
- **Selling the truck:** **Reports → Vehicle History for a Sale** makes a PDF for buyers with every
  service and its odometer reading, what's due, repaired recalls, warranties, and tires. Costs, the
  VIN, trail days, and receipt photos are each your choice.
- **Sharing the build:** **Share Build** turns your installed mods into BBCode for forums, Markdown,
  or plain text. Prices are off unless you turn them on. **Reports → Build Sheet** makes a PDF with
  photos and the AUX map.

---

## FAQ

**Can more than one person sign in?**
Not yet. Each install has one owner account. Everyone in a household who signs in uses it.

**Which trucks does it support?**
The F-150 Raptor (Gen 1 through Gen 3.5, including the Raptor R), the Bronco Raptor, and the Ranger
Raptor. The reference data, AUX layouts, and fluid figures are specific to those trucks.

**Does it work in kilometers and liters?**
Yes. Pick metric on the first screen, or switch any time under **Settings → General**.

**Can it check recalls against my VIN?**
NHTSA doesn't offer a public VIN lookup that RaptorTracker could call, so it lists recalls by model
and year and links you to NHTSA's VIN page.

**What does it send over the internet?**
The README lists every outside request in
[What leaves your server](../README.md#what-leaves-your-server). Your records stay on your server.

**Where is my data?**
In one SQLite file, `raptortracker.db`, plus an `uploads` folder, both in the data directory
(`/opt/raptortracker/data` with the installer, the `raptortracker_data` volume with Docker).

---

## Troubleshooting

**The server won't start and says it's refusing to.**
In production it won't start with a missing or placeholder `SESSION_SECRET` (it needs 32 or more
random characters) or a placeholder `ADMIN_PASSWORD`. The message says which one and how to
generate a secret.

**I'm signed out as soon as I sign in.**
`COOKIE_SECURE=true` tells the browser to send the session cookie only over HTTPS. If you open the
app over plain HTTP, set it to `false`, or put the app behind HTTPS.

**Sign-in says there have been too many attempts.**
After 10 failed attempts in 15 minutes, sign-in is paused for that address. Wait 15 minutes. If it
happens to you behind a reverse proxy without anyone else trying, set `TRUST_PROXY` to the number of
proxies in front of the app (usually `1`), so the limit applies to each visitor, not to the proxy.

**I forgot the password.**
Stop the app and remove the stored hash; the password from `.env` then works again:

```bash
sqlite3 /opt/raptortracker/data/raptortracker.db "DELETE FROM app_settings WHERE key = 'secret_admin_password_hash';"
```

With Docker, run the same command against the database in the `raptortracker_data` volume, or use
`docker run --rm -it -v raptortracker_data:/data alpine sh` and install `sqlite` there.

**The installer says this is a 32-bit OS.**
RaptorTracker needs a 64-bit OS. On a Raspberry Pi 3, 4, 5, or Zero 2 W, install Raspberry Pi OS
(64-bit). See [Running on a Raspberry Pi](../README.md#running-on-a-raspberry-pi).

**Building runs out of memory on a small Pi.**
Building the web app needs about 450 MB. `install.sh` adds temporary swap when memory is short; if
you're updating by hand, add swap first or use the Docker image, which comes already built.

**Reminders don't arrive, or arrive at the wrong hour.**
Use **Send Test Email** or **Send Test Webhook** under **Settings → Notifications**; the error
message names the problem. The daily check runs at 08:00 server time by default; set
`REMINDER_HOUR` and `REMINDER_TZ` (or `TZ` with Docker) to change it.

**Photos are missing from a PDF.**
Photos over 4 MB are left out of PDFs so a small server doesn't run out of memory. Shrink them
under **Settings → Backups → Storage**.

**An off-box copy fails.**
**Test connection** reports the server's answer. A 401 or 403 means the credentials or bucket
permissions are wrong. For S3-compatible storage other than AWS, keep **Path-style URLs** on and
use the region your provider gives you (Cloudflare R2 uses `auto`).

**The update check says GitHub didn't answer.**
The server couldn't reach `api.github.com`. Nothing else is affected. Turn the check off under
**Settings → General** if the server has no internet access.
