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
    SELECT uv.model_year, v.make, v.model
    FROM user_vehicles uv JOIN vehicles v ON uv.vehicle_id = v.id
    WHERE uv.id = ?
  `).get(vehicle_id);
  if (!row) return res.status(404).json({ error: 'Not found' });

  const make = row.make;
  const model = baseModel(row.model);
  const year = row.model_year;
  if (!make || !model || !year) {
    return res.json({ make, model, year, recalls: [], note: 'Insufficient vehicle data for a recall lookup.' });
  }

  try {
    if (typeof fetch !== 'function') {
      return res.json({ make, model, year, recalls: [], note: 'Recall lookup requires Node 18+ (global fetch unavailable).' });
    }
    const recalls = await fetchRecalls(make, model, year);
    res.json({ make, model, year, recalls });
  } catch (err) {
    res.json({ make, model, year, recalls: [], error: `Recall lookup failed: ${err.message}` });
  }
});

module.exports = router;
