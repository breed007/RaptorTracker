const express = require('express');
const router = express.Router();
const { getDb } = require('../db');

function round2(n) { return Math.round((n + Number.EPSILON) * 100) / 100; }

function monthsBetween(aStr, bStr) {
  const a = new Date(aStr + 'T12:00:00');
  const b = new Date(bStr + 'T12:00:00');
  return Math.max(0, (b - a) / (1000 * 60 * 60 * 24 * 30.4375));
}

// GET /api/analytics?vehicle_id=X
router.get('/', (req, res) => {
  const { vehicle_id } = req.query;
  if (!vehicle_id) return res.status(400).json({ error: 'vehicle_id required' });

  const db = getDb();
  const uv = db.prepare('SELECT id FROM user_vehicles WHERE id = ?').get(vehicle_id);
  if (!uv) return res.status(404).json({ error: 'Not found' });

  // ── Mileage trend: union of manual readings, fuel odometers, and service mileage ──
  const points = [];
  db.prepare('SELECT date, odometer FROM mileage_log WHERE user_vehicle_id = ? AND odometer IS NOT NULL').all(vehicle_id)
    .forEach(r => points.push({ date: r.date, odometer: r.odometer }));
  db.prepare('SELECT date, odometer FROM fuel_log WHERE user_vehicle_id = ? AND odometer IS NOT NULL').all(vehicle_id)
    .forEach(r => points.push({ date: r.date, odometer: r.odometer }));
  db.prepare('SELECT date_performed AS date, mileage AS odometer FROM maintenance_log WHERE user_vehicle_id = ? AND mileage IS NOT NULL').all(vehicle_id)
    .forEach(r => points.push({ date: r.date, odometer: r.odometer }));

  // Keep the highest odometer seen per day, then sort ascending
  const byDay = {};
  for (const p of points) {
    if (!byDay[p.date] || p.odometer > byDay[p.date]) byDay[p.date] = p.odometer;
  }
  const mileageTrend = Object.keys(byDay).sort().map(date => ({ date, odometer: byDay[date] }));

  // ── Miles per month (from first→last reading) ──
  let milesPerMonth = null, totalMilesTracked = null;
  if (mileageTrend.length >= 2) {
    const first = mileageTrend[0];
    const last = mileageTrend[mileageTrend.length - 1];
    const span = monthsBetween(first.date, last.date);
    totalMilesTracked = Math.max(0, last.odometer - first.odometer);
    if (span > 0) milesPerMonth = round2(totalMilesTracked / span);
  }

  // ── Maintenance cost by provider type ──
  const byProviderRaw = db.prepare(`
    SELECT COALESCE(service_provider_type, 'unspecified') AS provider,
           COUNT(*) AS count, COALESCE(SUM(cost), 0) AS total
    FROM maintenance_log WHERE user_vehicle_id = ?
    GROUP BY COALESCE(service_provider_type, 'unspecified')
  `).all(vehicle_id);
  const providerLabels = { dealership: 'Dealership', independent: 'Independent', owner: 'Owner / DIY', unspecified: 'Unspecified' };
  const maintenanceByProvider = byProviderRaw.map(r => ({
    provider: r.provider, label: providerLabels[r.provider] || r.provider,
    count: r.count, total: round2(r.total),
  })).sort((a, b) => b.total - a.total);

  // ── Fuel summary ──
  const fuel = db.prepare(`
    SELECT COUNT(*) AS fills, COALESCE(SUM(gallons), 0) AS gallons, COALESCE(SUM(total_cost), 0) AS cost
    FROM fuel_log WHERE user_vehicle_id = ?
  `).get(vehicle_id);

  res.json({
    mileageTrend,
    milesPerMonth,
    totalMilesTracked,
    maintenanceByProvider,
    fuel: { fills: fuel.fills, gallons: round2(fuel.gallons), cost: round2(fuel.cost) },
  });
});

module.exports = router;
