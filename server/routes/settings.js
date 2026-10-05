const express = require('express');
const path = require('path');
const fs = require('fs');
const router = express.Router();
const { getDb, DATA_DIR } = require('../db');
const { localDate } = require('../lib/dates');
const { setSetting } = require('../services/settings');
const units = require('../services/units');
const updates = require('../services/updates');

const BACKUP_DIR = path.join(DATA_DIR, 'backups');
const KNOWN_CURRENCIES = new Set(Intl.supportedValuesOf('currency'));

// GET /api/settings/units — the owner's units, with labels for display.
router.get('/units', (req, res) => {
  res.json({ units: units.getUnits(), chosen: units.unitsChosen(), labels: units.LABELS, options: units.OPTIONS });
});

// GET /api/settings/units/suggest?locale=en-CA — a starting point for a new
// install, from the browser's locale. Nothing is saved.
router.get('/units/suggest', (req, res) => {
  res.json({ units: units.unitsForLocale(req.query.locale || 'en-US') });
});

// PUT /api/settings/units — switch units. Changing distance, volume, or
// pressure rewrites every stored value, so the database is snapshotted to
// data/backups/ first and the conversion runs in one transaction.
router.put('/units', async (req, res) => {
  const current = units.getUnits();
  const next = { ...current };
  for (const k of ['distance', 'volume', 'economy', 'pressure']) {
    if (req.body[k] === undefined) continue;
    if (!units.OPTIONS[k].includes(req.body[k])) {
      return res.status(400).json({ error: `${k} must be one of ${units.OPTIONS[k].join(', ')}` });
    }
    next[k] = req.body[k];
  }
  if (req.body.currency !== undefined) {
    const c = String(req.body.currency).toUpperCase();
    // Intl will format any three letters ('CDN 1.00'), so check against the
    // list of currencies it actually knows — that catches typos like CDN.
    if (!KNOWN_CURRENCIES.has(c)) return res.status(400).json({ error: `${c} isn't a currency code. Use ISO codes such as USD, CAD, AUD, GBP.` });
    next.currency = c;
  }

  const db = getDb();
  const converting = ['distance', 'volume', 'pressure'].some(k => next[k] !== current[k]);
  let snapshot = null;
  // A fresh install picking units on day one has nothing to convert or protect.
  if (converting && units.storedValueCount(db) > 0) {
    fs.mkdirSync(BACKUP_DIR, { recursive: true });
    snapshot = path.join(BACKUP_DIR, `before-units-${localDate()}-${Date.now()}.db`);
    await db.backup(snapshot);
  }
  let changed = 0;
  db.transaction(() => {
    if (converting) changed = units.convertStored(db, current, next);
    units.saveUnits(next);
  })();
  res.json({ ok: true, units: next, converted: changed, snapshot: snapshot && path.basename(snapshot) });
});

// GET /api/settings/updates — this version, the newest release seen, and
// whether the daily check is on.
router.get('/updates', (req, res) => res.json(updates.status()));

// POST /api/settings/updates/check — ask GitHub now.
router.post('/updates/check', async (req, res) => res.json(await updates.checkForUpdate({ force: true })));

// PUT /api/settings/updates { enabled } — turn the daily check on or off.
router.put('/updates', (req, res) => {
  if (typeof req.body.enabled !== 'boolean') return res.status(400).json({ error: 'enabled must be true or false' });
  setSetting('update_check', req.body.enabled ? 'true' : 'false');
  res.json(updates.status());
});

module.exports = router;
