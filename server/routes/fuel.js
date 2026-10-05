const express = require('express');
const router = express.Router();
const { getDb } = require('../db');
const { afterWrite } = require('../services/odometer');
const trash = require('../services/trash');
const { economy } = require('../services/fuelEconomy');

// Forms send booleans, numbers, or strings. Only an explicit 'no' is a partial
// fill; anything else (including the field being absent) is a full tank.
const isFull = (v) => !(v === false || v === 0 || v === '0' || v === 'false');

// GET /api/fuel?vehicle_id=X
router.get('/', (req, res) => {
  const { vehicle_id } = req.query;
  if (!vehicle_id) return res.status(400).json({ error: 'vehicle_id required' });
  const db = getDb();

  // Fetch all entries sorted by odometer ascending for MPG calculation
  const entries = db.prepare(
    'SELECT * FROM fuel_log WHERE user_vehicle_id = ? ORDER BY odometer ASC'
  ).all(vehicle_id);

  const { withMpg, average } = economy(entries);

  // Reverse for display (newest first)
  const display = [...withMpg].reverse();

  // Aggregate stats
  const validMpg = withMpg.filter(e => e.mpg !== null).map(e => e.mpg);
  const totalCost = entries.reduce((s, e) => s + (e.total_cost || 0), 0);
  const totalGallons = entries.reduce((s, e) => s + e.gallons, 0);

  // Cost per mile (if we have at least 2 odometer readings)
  let costPerMile = null;
  if (entries.length >= 2) {
    const totalMiles = entries[entries.length - 1].odometer - entries[0].odometer;
    if (totalMiles > 0) costPerMile = Math.round((totalCost / totalMiles) * 1000) / 1000;
  }

  const stats = {
    avgMpg:      average,
    bestMpg:     validMpg.length > 0 ? Math.max(...validMpg) : null,
    worstMpg:    validMpg.length > 0 ? Math.min(...validMpg) : null,
    totalCost:   Math.round(totalCost * 100) / 100,
    totalGallons: Math.round(totalGallons * 10) / 10,
    costPerMile,
    entryCount:  entries.length,
  };

  // Chart series: chronological mpg points (only full-tank entries with calculated MPG)
  const chartData = withMpg
    .filter(e => e.mpg !== null)
    .map(e => ({ odometer: e.odometer, mpg: e.mpg, date: e.date }));

  res.json({ entries: display, stats, chartData });
});

// POST /api/fuel
router.post('/', (req, res) => {
  const { user_vehicle_id, date, odometer, gallons, price_per_gallon,
          total_cost, station, notes, full_tank, trip_type, missed_previous } = req.body;
  if (!user_vehicle_id || !date || odometer == null || !gallons)
    return res.status(400).json({ error: 'user_vehicle_id, date, odometer, and gallons are required' });

  const db = getDb();
  const computedTotal = total_cost != null ? total_cost
    : (price_per_gallon ? Math.round(price_per_gallon * gallons * 100) / 100 : null);

  const r = db.prepare(`
    INSERT INTO fuel_log
      (user_vehicle_id, date, odometer, gallons, price_per_gallon, total_cost,
       station, notes, full_tank, trip_type, missed_previous)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(user_vehicle_id, date, parseInt(odometer), parseFloat(gallons),
         price_per_gallon || null, computedTotal,
         station || null, notes || null,
         isFull(full_tank) ? 1 : 0,
         trip_type || 'mixed', missed_previous ? 1 : 0);

  const { warning } = afterWrite(db, user_vehicle_id,
    { date, odometer, self: { source: 'fuel_log', id: r.lastInsertRowid } });
  res.json({ ...db.prepare('SELECT * FROM fuel_log WHERE id = ?').get(r.lastInsertRowid), odometerWarning: warning });
});

// PUT /api/fuel/:id
router.put('/:id', (req, res) => {
  const { date, odometer, gallons, price_per_gallon, total_cost,
          station, notes, full_tank, trip_type, missed_previous } = req.body;
  const db = getDb();
  const existing = db.prepare('SELECT user_vehicle_id FROM fuel_log WHERE id = ?').get(req.params.id);
  if (!existing) return res.status(404).json({ error: 'Not found' });
  const computedTotal = total_cost != null ? total_cost
    : (price_per_gallon ? Math.round(price_per_gallon * gallons * 100) / 100 : null);
  db.prepare(`
    UPDATE fuel_log SET date=?, odometer=?, gallons=?, price_per_gallon=?, total_cost=?,
      station=?, notes=?, full_tank=?, trip_type=?, missed_previous=?
    WHERE id=?
  `).run(date, parseInt(odometer), parseFloat(gallons),
         price_per_gallon || null, computedTotal,
         station || null, notes || null,
         isFull(full_tank) ? 1 : 0,
         trip_type || 'mixed', missed_previous ? 1 : 0, req.params.id);
  const { warning } = afterWrite(db, existing.user_vehicle_id,
    { date, odometer, self: { source: 'fuel_log', id: req.params.id } });
  res.json({ ...db.prepare('SELECT * FROM fuel_log WHERE id = ?').get(req.params.id), odometerWarning: warning });
});

// DELETE /api/fuel/:id
router.delete('/:id', (req, res) => {
  const db = getDb();
  const existing = db.prepare('SELECT id, user_vehicle_id, date FROM fuel_log WHERE id = ?').get(req.params.id);
  if (!existing) return res.status(404).json({ error: 'Not found' });
  const trashed = trash.moveToTrash(db, 'fuel_log', existing.id, { kind: 'Fill-up', title: `Fill-up on ${existing.date}` });
  afterWrite(db, existing.user_vehicle_id);
  res.json({ ok: true, trashed });
});

module.exports = router;
