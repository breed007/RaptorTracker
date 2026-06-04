# Changelog

All notable changes to RaptorTracker are documented here.

---

## [v0.4.0] — 2026-06-04

### New Features

#### Webhook Reminders (Discord / Slack)
- Reminders can now be delivered to a **webhook** in addition to (or instead of) email — no mail server required
- Set a Discord or Slack incoming webhook URL on the Notifications page, with a "Send Test Webhook" button
- The daily digest is sent to every configured channel; the same per-event de-duplication applies across channels

#### Full Backup & Restore
- One-click **Download Backup** on the Export page produces a single ZIP of the entire install — the database plus all uploaded photos, stickers, and attachments
- **Restore from Backup** replaces all data from a backup ZIP, with a confirmation step and server-side validation that the archive is a real RaptorTracker database
- The database is WAL-checkpointed before backup for a consistent snapshot

#### Vehicle Logbook
- New **Logbook** page: a single chronological history of the truck — mods, services, fuel fills, tire changes, warranties, and acquisition — grouped by year
- Filter by event type; every entry links back to its record

#### Mileage History & Analytics
- New **Analytics** page with a mileage-over-time chart that unions manual odometer readings, fuel odometers, and service mileage
- Computes **miles per month** and total miles tracked, and breaks down **maintenance cost by provider** (dealership / independent / owner)
- A built-in odometer log lets you record readings directly (which also keeps the vehicle's current mileage up to date)

### Notes
- No new dependencies. Two of the features reuse existing libraries (`archiver`/`adm-zip` for backups), so a plain `git pull && npm run build && pm2 restart` is enough to update.
- One new database table (`mileage_log`) and a webhook setting are added automatically on first restart.

---

## [v0.3.0] — 2026-06-04

### Improvements

#### Reclaimable Factory AUX Slots
- Factory-wired AUX slots (e.g. AUX 1 bumper fogs on Gen 3.5) now offer two explicit actions: **Assign a mod** or **Mark as available**
- "Mark as available" reclaims the slot per vehicle — it becomes a normal switch you can assign and customize like any other, and can be restored to factory later via a "↺ factory" link
- This replaces the older "clear this notice" behavior, which only hid the warning text but left the slot locked as factory-used
- The choice persists in the database and survives reloads and restarts

#### Recall Management
- Open NHTSA recalls on the dashboard can now be **dismissed** individually (persisted per vehicle) and **restored** later from a "show dismissed" list
- The recalls card **collapses** to keep the dashboard tidy; the collapsed state is remembered
- When every recall is handled, the badge shows "all cleared" instead of the card disappearing

### Upgrade Notes
- Two new database columns are added automatically on first server restart (`reclaimed_aux_switches` and `dismissed_recalls` on vehicles). No manual database changes required.

---

## [v0.2.0] — 2026-06-02

### New Features

#### Warranty Tracking
- New **Warranty** page accessible from the sidebar
- Track extended/vehicle warranties with provider, term (years + miles), start/expiration dates, contract number, claims phone, cost, and deductible
- Expiration dates are auto-calculated from start date + term years if not entered manually
- Per-mod warranty tracking for installed mods — set coverage duration, start date, provider, and notes directly from the Warranty page
- Color-coded status badges on every warranty: green (active), yellow (expiring within 90 days), red (expired)
- Dashboard alert card appears automatically when any warranty is expired or expiring soon

#### Multi-AUX Switch Assignments
- A single mod can now be assigned to **multiple AUX switches** — useful for accessories that use one switch for power and another for a secondary function (e.g., color change, dimmer)
- Each switch assignment gets its own label independent of the others
- The AUX Switch Panel displays the per-switch label on each slot and stays in sync as mods are added, edited, and removed
- Mod list and detail panel show all assigned switch numbers (e.g., `AUX 3, 4`)
- Existing single-switch assignments are automatically migrated to the new format on first run

#### Dismissible AUX Warning Notices
- The factory fog light warning on AUX 1 (Gen 3.5) can now be cleared on a per-vehicle basis
- After relocating factory fog lights, click **"Lights relocated — clear this notice"** inside the warning box
- Dismissal persists in the database and survives page reloads and server restarts
- The AUX slot remains amber/factory-used until a mod is actually assigned to it

#### Total Cost of Ownership
- New **Cost of Ownership** page that unifies every spend stream the app tracks: acquisition/financing, modifications, maintenance, fuel, and tires
- Cost-per-mile and operating-cost-per-mile (running costs divided by miles driven since purchase)
- Cumulative-spend-over-time chart and a "where the money went" breakdown
- **Financing** section supporting three ownership models, each with its own fields and math:
  - **Owned outright** — purchase price
  - **Loan** — lender, amount financed, APR, term, monthly payment, down payment; computes paid-to-date, remaining balance, and total interest
  - **Lease** — leasing company, monthly payment, due-at-signing, term, mileage allowance, buyout/residual; computes paid-to-date and remaining

#### Email Reminders
- New **Notifications** page to enable email reminders, set a recipient, and toggle service, warranty, and compliance alerts independently
- A daily scheduler (08:00 server time) emails a digest of anything newly **overdue/due-soon** (service intervals), **expired/expiring** (vehicle and per-mod warranties), or approaching its deadline (registration, inspection, insurance)
- Per-event de-duplication so the same reminder isn't re-sent every day; a new alert goes out when the situation changes (e.g., due-soon → overdue, or after a service resets the clock)
- Configurable look-ahead window (default 90 days), a "send test email" button, and an on-demand "send digest now"
- SMTP is configured via `.env` (`SMTP_HOST`, `SMTP_FROM`, credentials); the app degrades gracefully and stays fully usable if email isn't set up

#### Registration, Inspection & Insurance
- Track registration renewal, inspection/emissions, and insurance expiration dates per vehicle (plus insurance provider, policy number, and phone), entered in My Garage
- These dates feed the email reminder engine alongside service and warranty alerts
- The Garage card highlights anything expired or expiring within 30 days

#### NHTSA Recall Lookup
- The Dashboard shows open recalls for your truck, pulled from the free NHTSA recalls API and matched by model + year (Raptor trims map to their base platform, e.g. F-150)
- Results are cached server-side; the lookup degrades quietly if the API is unreachable

#### Tire & Wheel Set Tracking
- New **Tire Sets** page to track multiple sets (e.g. street vs. off-road), each with tire/wheel specs, cost, install/removal dates and odometer, and an "on the truck" flag
- Automatically computes miles run on each set (active sets use the vehicle's current mileage)
- Tire-set cost is included in Total Cost of Ownership

#### Service Provider Type
- Maintenance records can be tagged as **Dealership**, **Independent Shop**, or **Owner / DIY**, shown as a badge in the log

#### CSV Export
- Export any record type — modifications, maintenance, fuel, warranties, tire sets, wishlist — as a spreadsheet-ready CSV from the Export page, alongside the existing PDF build sheet

### Bug Fixes

- **Modifications page black screen** — Fixed a crash that made the Modifications page completely blank for any user with at least one mod in the database. The server already deserializes `photos` to a JavaScript array, but the client was calling `JSON.parse()` on it a second time. An empty array is truthy in JavaScript, so the `|| '[]'` fallback never fired — `JSON.parse([])` silently coerced to `JSON.parse('')` and threw a `SyntaxError`. The empty-state render path never hit the crash, so the bug only surfaced once a first mod was saved.
- **Fuel Log: partial fills treated as full tanks** — `full_tank` is stored as integer `0`/`1` but was compared against the boolean `false`. Editing a partial fill silently flipped it to a full tank on save (corrupting MPG calculations), and the "partial" badge never rendered. Both now use a correct truthiness check.
- **Service interval "due soon / overdue" used mismatched data** — The intervals query took `MAX(date_performed)` and `MAX(mileage)` independently, so the last-service date could be paired with a mileage from a different maintenance record, skewing the mileage-based reminder math. Replaced with correlated subqueries that read both values from the single most-recent record.

### Improvements
- **Footer shows version and build date** — The footer displays `vNNN · YYYY-MM-DD` so it's easy to confirm which build is running on a server.
- **Mod category dropdown** is now alphabetical (with "Other" last).

### Upgrade Notes
- This release adds the `nodemailer` and `node-cron` dependencies. **Run `npm install` on the server** after pulling (the usual `git pull && npm run build` does not install new packages).
- New database columns and tables are added automatically on first server restart (financing, registration/insurance, and `service_provider_type` fields, plus `app_settings`, `sent_reminders`, and `tire_sets` tables). No manual database changes required.
- Email reminders are **off by default** and require SMTP settings in `.env` plus enabling them on the Notifications page.

### Known Limitations
- Assigning two *different* mods to the same AUX switch shows only the most-recently-updated mod on that slot. The per-mod multi-switch flow is unaffected; cross-mod sharing of a single switch is uncommon and will be addressed separately if needed.

---

## [v0.1.0] — 2026-04-20

Initial release.

### Features
- **Modification Tracker** — log mods with status, cost, dates, vendor, photos, install/wiring notes, and AUX switch assignment
- **My Garage** — multi-vehicle support with profile photo, window sticker upload, purchase and service info
- **AUX Switch Panel** — factory-accurate Gen 2 / Gen 3 / Gen 3.5 layouts with switch assignment and labeling
- **Maintenance Log** — service records with mileage, vendor, cost, attachments, and configurable intervals
- **Wishlist** — plan future mods with priority, budget, and vendor links; promote to active mod in one click
- **Fuel Log** — fill-up tracking with per-fill MPG calculation, trend chart, and EPA comparison
- **Dashboard** — spend by category chart, recent mods, maintenance summary, and service interval alerts
- **Reference Library** — read-only factory specs for Gen 1 through Gen 3.5 and Ranger Raptor
- **PDF Export** — full build sheet with vehicle info, mod list, and maintenance history
- **Import / Export** — ZIP archive per vehicle including photos and window sticker
- **VIN Decoder** — auto-populate vehicle details from VIN
- **Theme System** — Ford Racing, FRF Forum, and Raptor Assault themes with light/dark toggle
- **Self-hosted** — single SQLite database, no external services, Linux install script included
