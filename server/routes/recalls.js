const express = require('express');
const router = express.Router();
const { getDb } = require('../db');
const { jsonList } = require('../lib/json');

// NHTSA recalls are cataloged by base model (e.g. "F-150"), not the Raptor
// trim, so map our stored model names down to what NHTSA expects.
function baseModel(model) {
  if (!model) return model;
  return model
    .replace(/\bSVT\b/i, '')
    .replace(/\bRaptor\b/i, '')
    .replace(/\s+/g, ' ')
    .trim();
}

// NHTSA components read like "POWER TRAIN:DRIVELINE:DRIVESHAFT". Turn them
// into a title ("Driveshaft") and an area ("Power Train") a person can scan.
const ACRONYMS = new Set(['ABS', 'LED', 'SRS', 'TPMS', 'HVAC', 'PCM', 'ECM', 'BCM', 'ADAS', 'EV', 'USB', 'AC', 'A/C', 'GPS', 'HID', 'EPB']);
const titleCase = (str) => String(str || '').toLowerCase().split(/\s+/).filter(Boolean)
  .map(w => w.split('/').map(p => (ACRONYMS.has(p.toUpperCase()) ? p.toUpperCase() : p.charAt(0).toUpperCase() + p.slice(1))).join('/'))
  .join(' ');

function humanizeComponent(component) {
  const groups = String(component || '').split(';').map(g => g.split(':').map(p => p.trim()).filter(Boolean)).filter(g => g.length);
  if (!groups.length) return { title: 'Recall', area: null };
  const titles = [...new Set(groups.map(g => titleCase(g[g.length - 1])))];
  const area = groups[0].length > 1 ? titleCase(groups[0][0]) : null;
  return { title: titles.join(', '), area };
}

// Simple in-memory cache: key `make|model|year` -> { at, data }
const cache = new Map();
const TTL_MS = 12 * 60 * 60 * 1000; // 12h

async function fetchRecalls(make, model, year) {
  const key = `${make}|${model}|${year}`.toLowerCase();
  const hit = cache.get(key);
  if (hit && (Date.now() - hit.at) < TTL_MS) return hit.data;

  const url = `https://api.nhtsa.gov/recalls/recallsByVehicle?make=${encodeURIComponent(make)}&model=${encodeURIComponent(model)}&modelYear=${encodeURIComponent(year)}`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 8000);
  try {
    const resp = await fetch(url, { signal: controller.signal, headers: { Accept: 'application/json' } });
    if (!resp.ok) throw new Error(`NHTSA returned ${resp.status}`);
    const json = await resp.json();
    const results = Array.isArray(json.results) ? json.results : [];
    const data = results.map(r => ({
      campaign: r.NHTSACampaignNumber,
      component: r.Component,
      summary: r.Summary,
      consequence: r.Consequence,
      remedy: r.Remedy,
      reportDate: r.ReportReceivedDate || null,
    }));
    cache.set(key, { at: Date.now(), data });
    return data;
  } finally {
    clearTimeout(timer);
  }
}

// GET /api/recalls?vehicle_id=X
router.get('/', async (req, res) => {
  const { vehicle_id } = req.query;
  if (!vehicle_id) return res.status(400).json({ error: 'vehicle_id required' });

  const db = getDb();
  const row = db.prepare(`
    SELECT uv.model_year, uv.vin, uv.dismissed_recalls, uv.confirmed_recalls, uv.fixed_recalls, v.make, v.model
    FROM user_vehicles uv JOIN vehicles v ON uv.vehicle_id = v.id
    WHERE uv.id = ?
  `).get(vehicle_id);
  if (!row) return res.status(404).json({ error: 'Not found' });

  const dismissed = jsonList(row.dismissed_recalls);
  const confirmed = jsonList(row.confirmed_recalls);
  const fixed = jsonList(row.fixed_recalls);
  const make = row.make;
  const model = baseModel(row.model);
  const year = row.model_year;
  // NHTSA lists recalls by make, model, and year — not by truck. Each one
  // starts as "may apply" until the owner checks their VIN; there is no public
  // VIN lookup to do it for them. 'applies' stays urgent until it's fixed.
  const stateOf = (c) => (fixed.includes(c) ? 'fixed' : confirmed.includes(c) ? 'applies'
    : dismissed.includes(c) ? 'not_applicable' : 'review');
  const annotate = (list) => list.map(r => {
    const state = stateOf(r.campaign);
    return { ...r, ...humanizeComponent(r.component), state, dismissed: state === 'not_applicable' || state === 'fixed' };
  });
  const base = { make, model, year, vin: row.vin || null, matchedBy: 'model_year' };

  if (!make || !model || !year) {
    return res.json({ ...base, recalls: [], counts: { review: 0, applies: 0, fixed: 0, not_applicable: 0 }, activeCount: 0, dismissedCount: 0, note: 'Insufficient vehicle data for a recall lookup.' });
  }

  try {
    if (typeof fetch !== 'function') {
      return res.json({ ...base, recalls: [], counts: { review: 0, applies: 0, fixed: 0, not_applicable: 0 }, activeCount: 0, dismissedCount: 0, note: 'Recall lookup requires Node 18+ (global fetch unavailable).' });
    }
    const raw = await fetchRecalls(make, model, year);
    const recalls = annotate(raw);
    const counts = { review: 0, applies: 0, fixed: 0, not_applicable: 0 };
    recalls.forEach(r => { counts[r.state]++; });
    res.json({
      ...base, recalls, counts,
      activeCount: counts.review + counts.applies,
      dismissedCount: counts.not_applicable + counts.fixed,
    });
  } catch (err) {
    res.json({ ...base, recalls: [], counts: { review: 0, applies: 0, fixed: 0, not_applicable: 0 }, activeCount: 0, dismissedCount: 0, error: `Recall lookup failed: ${err.message}` });
  }
});

// PUT /api/recalls/state — triage one recall for this truck:
//   'applies'        confirmed by VIN check; urgent until it's logged as fixed
//   'not_applicable' doesn't cover this truck; hidden
//   'fixed'          the repair is done (usually after logging it as a service)
//   'review'         back to "may apply"
router.put('/state', (req, res) => {
  const { vehicle_id, campaign, state } = req.body;
  if (!vehicle_id || !campaign) return res.status(400).json({ error: 'vehicle_id and campaign required' });
  if (!['applies', 'not_applicable', 'fixed', 'review'].includes(state)) {
    return res.status(400).json({ error: "state must be 'applies', 'not_applicable', 'fixed', or 'review'" });
  }
  const db = getDb();
  const uv = db.prepare('SELECT id, dismissed_recalls, confirmed_recalls, fixed_recalls FROM user_vehicles WHERE id = ?').get(vehicle_id);
  if (!uv) return res.status(404).json({ error: 'Not found' });

  const confirmed = jsonList(uv.confirmed_recalls).filter(c => c !== campaign);
  const dismissed = jsonList(uv.dismissed_recalls).filter(c => c !== campaign);
  const fixed = jsonList(uv.fixed_recalls).filter(c => c !== campaign);
  if (state === 'applies') confirmed.push(campaign);
  if (state === 'not_applicable') dismissed.push(campaign);
  if (state === 'fixed') fixed.push(campaign);
  db.prepare('UPDATE user_vehicles SET confirmed_recalls = ?, dismissed_recalls = ?, fixed_recalls = ? WHERE id = ?')
    .run(JSON.stringify(confirmed), JSON.stringify(dismissed), JSON.stringify(fixed), vehicle_id);
  res.json({ ok: true, state });
});

// PUT /api/recalls/dismiss — hide (or restore) a recall by campaign number.
// Kept for older clients; /state is the full triage.
router.put('/dismiss', (req, res) => {
  const { vehicle_id, campaign, dismiss = true } = req.body;
  if (!vehicle_id || !campaign) return res.status(400).json({ error: 'vehicle_id and campaign required' });

  const db = getDb();
  const uv = db.prepare('SELECT id, dismissed_recalls FROM user_vehicles WHERE id = ?').get(vehicle_id);
  if (!uv) return res.status(404).json({ error: 'Not found' });

  let dismissed = jsonList(uv.dismissed_recalls);
  if (dismiss) {
    if (!dismissed.includes(campaign)) dismissed.push(campaign);
  } else {
    dismissed = dismissed.filter(c => c !== campaign);
  }
  db.prepare('UPDATE user_vehicles SET dismissed_recalls = ? WHERE id = ?')
    .run(JSON.stringify(dismissed), vehicle_id);

  res.json({ ok: true, dismissed_recalls: dismissed });
});

module.exports = router;
module.exports.humanizeComponent = humanizeComponent;
