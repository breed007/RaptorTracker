# RaptorTracker — notes for working in this repo

Self-hosted build tracker for Ford Raptors (F-150 Raptor Gen 1–3.5, Bronco Raptor, Ranger
Raptor). Node/Express + SQLite (better-sqlite3) server, React 18 + Vite 8 + Tailwind 3 client,
single owner per install. Runs on x86_64 and arm64, including a Raspberry Pi on 64-bit Pi OS.

## Repo facts that override the global defaults

- **This repo is public on purpose** (MIT, linked from forums and the landing page at
  `docs/index.html`). The global "every project is private" rule does not apply. Don't change its
  visibility.
- **The owner's email address must never appear** in source, docs, commits, or the landing page.
  Security reports go through GitHub private vulnerability reporting.
- **Tagging `v*` publishes the Docker image to GHCR** (`.github/workflows/release-image.yml`).
  Confirm with the owner before creating or pushing a tag.
- US English everywhere; commit messages imperative with a "why" body; run the
  detect-ai-writing-tells skill on README, docs, CHANGELOG, and landing-page prose.

## Layout

- `server.js` wires routes; `server/routes/*` are thin, logic lives in `server/services/*`.
- `server/db/index.js` runs migrations on every start; they must be safe to run twice.
  `server/db/init.js` only seeds an empty database.
- `server/reference/` holds code-owned reference data (vehicles, AUX layouts, fluids). It's synced
  into the database on every start, so corrections reach existing installs. Owner edits live on
  `user_vehicles` (e.g. `aux_fuse_overrides`) and are never overwritten. Cite a Ford source for
  any reference value; leave a value out rather than guess.
- `client/src/lib/units.js` formats everything unit-bearing; `server/services/units.js` owns the
  list of unit-bearing columns (`COLUMNS`) and conversions.

## Tests (all use throwaway data; none touch `data/`)

`npm test` (smoke, includes static accessibility checks on the JSX), `npm run test:api`,
`npm run test:upgrade` (needs git tags: every released tag's DB migrated to HEAD),
`npm run test:security`, `npm run test:e2e` (Playwright + axe; `npx playwright install chromium`
once). CI runs Node 22/24 × x64/arm64, the e2e job, and Docker builds for both architectures.

## Gotchas

- `.npmrc` has `ignore-scripts=true`: better-sqlite3 and bcrypt load prebuilt binaries. npm would
  otherwise compile SQLite (minutes on a Pi). There are no 32-bit ARM prebuilds; 32-bit is
  unsupported and `install.sh` refuses it (it checks `dpkg --print-architecture`, not `uname -m`,
  because 32-bit Pi OS often runs a 64-bit kernel).
- better-sqlite3 loads its binary lazily: `require('better-sqlite3')` succeeding proves nothing;
  open a database to test it.
- Adding a column that holds a distance, volume, price per volume, or pressure: add it to
  `COLUMNS` in `server/services/units.js` or unit switches and imports will skip it (the smoke test
  checks).
- Deletes go through `server/services/trash.js` (`moveToTrash`). Rows in `trash` keep their files
  alive (`uploadRefs` counts them); vehicle transfer skips the `trash` table.
- PDFs use `server/services/pdfReport.js`: light pages, dark text. Never `new Date('YYYY-MM-DD')`
  for display (UTC midnight prints the previous day); use `formatDay`. Images over 4 MB are left
  out of PDFs to bound memory.
- Photos are resized in the browser before upload (`client/src/lib/shrinkImage.js`). New upload
  sites should call `shrinkAll`/`shrinkImage`.
- ZIPs store already-compressed files uncompressed (`storeInZip`); deflating JPEGs cost a Pi
  minutes per backup.
- Modals: wrap the panel in `<Dialog>` (focus trap, Escape, focus return). Labels need
  `htmlFor`/`id`; ids inside `.map()` must include the index (the smoke test checks).
- The e2e server builds with `NODE_ENV=production`; with `NODE_ENV=test` Vite produces React's dev
  build.
- `client/package-lock.json` must keep every platform's optional native packages (Rolldown,
  lightningcss); regenerate it with npm on any platform, never prune it to one OS.
- zsh: unquoted `$var` isn't word-split, `path` is tied to `PATH`, and a failed glob aborts the
  whole command line.
