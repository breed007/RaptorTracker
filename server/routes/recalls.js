const express = require('express');
const router = express.Router();
const { getDb } = require('../db');

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
    SELECT uv.model_year, uv.dismissed_recalls, v.make, v.model
    FROM user_vehicles uv JOIN vehicles v ON uv.vehicle_id = v.id
    WHERE uv.id = ?
  `).get(vehicle_id);
  if (!row) return res.status(404).json({ error: 'Not found' });

  const dismissed = JSON.parse(row.dismissed_recalls || '[]');
  const make = row.make;
  const model = baseModel(row.model);
  const year = row.model_year;
  const annotate = (list) => list.map(r => ({ ...r, dismissed: dismissed.includes(r.campaign) }));

  if (!make || !model || !year) {
    return res.json({ make, model, year, recalls: [], activeCount: 0, dismissedCount: 0, note: 'Insufficient vehicle data for a recall lookup.' });
  }

  try {
    if (typeof fetch !== 'function') {
      return res.json({ make, model, year, recalls: [], activeCount: 0, dismissedCount: 0, note: 'Recall lookup requires Node 18+ (global fetch unavailable).' });
    }
    const raw = await fetchRecalls(make, model, year);
    const recalls = annotate(raw);
    res.json({
      make, model, year, recalls,
      activeCount: recalls.filter(r => !r.dismissed).length,
      dismissedCount: recalls.filter(r => r.dismissed).length,
    });
  } catch (err) {
    res.json({ make, model, year, recalls: [], activeCount: 0, dismissedCount: 0, error: `Recall lookup failed: ${err.message}` });
  }
});

// PUT /api/recalls/dismiss — hide (or restore) a recall by campaign number
router.put('/dismiss', (req, res) => {
  const { vehicle_id, campaign, dismiss = true } = req.body;
  if (!vehicle_id || !campaign) return res.status(400).json({ error: 'vehicle_id and campaign required' });

  const db = getDb();
  const uv = db.prepare('SELECT id, dismissed_recalls FROM user_vehicles WHERE id = ?').get(vehicle_id);
  if (!uv) return res.status(404).json({ error: 'Not found' });

  let dismissed = JSON.parse(uv.dismissed_recalls || '[]');
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
