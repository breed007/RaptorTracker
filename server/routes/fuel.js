const express = require('express');
const router = express.Router();
const { getDb } = require('../db');

// GET /api/fuel?vehicle_id=X
router.get('/', (req, res) => {
  const { vehicle_id } = req.query;
  if (!vehicle_id) return res.status(400).json({ error: 'vehicle_id required' });
  const db = getDb();

  // Fetch all entries sorted by odometer ascending for MPG calculation
  const entries = db.prepare(
    'SELECT * FROM fuel_log WHERE user_vehicle_id = ? ORDER BY odometer ASC'
  ).all(vehicle_id);

  // Calculate MPG: miles since last FULL tank fill-up / gallons this fill-up
  const withMpg = entries.map((e, i) => {
    let mpg = null;
    if (e.full_tank && e.gallons > 0) {
      // Walk back to find the last full-tank entry
      for (let j = i - 1; j >= 0; j--) {
        if (entries[j].full_tank) {
          const miles = e.odometer - entries[j].odometer;
          if (miles > 0) mpg = Math.round((miles / e.gallons) * 10) / 10;
          break;
        }
      }
    }
    return { ...e, mpg };
  });

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
    avgMpg:      validMpg.length > 0 ? Math.round(validMpg.reduce((s, m) => s + m, 0) / validMpg.length * 10) / 10 : null,
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
          total_cost, station, notes, full_tank, trip_type } = req.body;
  if (!user_vehicle_id || !date || odometer == null || !gallons)
    return res.status(400).json({ error: 'user_vehicle_id, date, odometer, and gallons are required' });

  const db = getDb();
  const computedTotal = total_cost != null ? total_cost
    : (price_per_gallon ? Math.round(price_per_gallon * gallons * 100) / 100 : null);

  const r = db.prepare(`
    INSERT INTO fuel_log
      (user_vehicle_id, date, odometer, gallons, price_per_gallon, total_cost,
       station, notes, full_tank, trip_type)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(user_vehicle_id, date, parseInt(odometer), parseFloat(gallons),
         price_per_gallon || null, computedTotal,
         station || null, notes || null,
         full_tank !== false ? 1 : 0,
         trip_type || 'mixed');

  // Bump current_mileage on the vehicle if this is the highest odometer seen
  const uv = db.prepare('SELECT current_mileage FROM user_vehicles WHERE id = ?').get(user_vehicle_id);
  if (!uv?.current_mileage || parseInt(odometer) > uv.current_mileage) {
    db.prepare('UPDATE user_vehicles SET current_mileage = ? WHERE id = ?')
      .run(parseInt(odometer), user_vehicle_id);
  }

  res.json(db.prepare('SELECT * FROM fuel_log WHERE id = ?').get(r.lastInsertRowid));
});

// PUT /api/fuel/:id
router.put('/:id', (req, res) => {
  const { date, odometer, gallons, price_per_gallon, total_cost,
          station, notes, full_tank, trip_type } = req.body;
  const db = getDb();
  const computedTotal = total_cost != null ? total_cost
    : (price_per_gallon ? Math.round(price_per_gallon * gallons * 100) / 100 : null);
  db.prepare(`
    UPDATE fuel_log SET date=?, odometer=?, gallons=?, price_per_gallon=?, total_cost=?,
      station=?, notes=?, full_tank=?, trip_type=?
    WHERE id=?
  `).run(date, parseInt(odometer), parseFloat(gallons),
         price_per_gallon || null, computedTotal,
         station || null, notes || null,
         full_tank !== false ? 1 : 0,
         trip_type || 'mixed', req.params.id);
  res.json(db.prepare('SELECT * FROM fuel_log WHERE id = ?').get(req.params.id));
});

// DELETE /api/fuel/:id
router.delete('/:id', (req, res) => {
  getDb().prepare('DELETE FROM fuel_log WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
});

module.exports = router;
