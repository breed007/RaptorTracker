const express = require('express');
const router = express.Router();
const { getDb } = require('../db');
const { mileageTrend, usageRate, round2 } = require('../services/mileageStats');

const DAY_MS = 86400000;
const iso = (d) => d.toISOString().slice(0, 10);
const addDays = (date, days) => new Date(date.getTime() + days * DAY_MS);
const addMonths = (dateStr, months) => {
  const d = new Date(dateStr + 'T12:00:00');
  d.setMonth(d.getMonth() + months);
  return d;
};

/**
 * GET /api/forecast?vehicle_id=X&months=12
 *
 * Turns reactive reminders into planning: for each service interval, project
 * *when* it will actually come due by combining the mileage interval with how
 * fast this truck accumulates miles, and estimate the cost from history.
 */
router.get('/', (req, res) => {
  const { vehicle_id } = req.query;
  if (!vehicle_id) return res.status(400).json({ error: 'vehicle_id required' });
  const horizonMonths = Math.min(60, Math.max(1, parseInt(req.query.months, 10) || 12));

  const db = getDb();
  const uv = db.prepare('SELECT current_mileage FROM user_vehicles WHERE id = ?').get(vehicle_id);
  if (!uv) return res.status(404).json({ error: 'Not found' });

  const trend = mileageTrend(db, vehicle_id);
  const { milesPerMonth, milesPerDay } = usageRate(trend);
  const currentMileage = uv.current_mileage ?? (trend.length ? trend[trend.length - 1].odometer : null);

  // Intervals with their most recent matching service (same correlated-subquery
  // approach as /api/intervals so date and mileage come from the same record)
  const intervals = db.prepare(`
    SELECT si.*,
      (SELECT ml.date_performed FROM maintenance_log ml
         WHERE ml.user_vehicle_id = si.user_vehicle_id AND ml.service_type = si.service_type
         ORDER BY ml.date_performed DESC, ml.id DESC LIMIT 1) AS last_date,
      (SELECT ml.mileage FROM maintenance_log ml
         WHERE ml.user_vehicle_id = si.user_vehicle_id AND ml.service_type = si.service_type
         ORDER BY ml.date_performed DESC, ml.id DESC LIMIT 1) AS last_mileage
    FROM service_intervals si
    WHERE si.user_vehicle_id = ?
  `).all(vehicle_id);

  // Typical cost per service type, from this truck's own history
  const costRows = db.prepare(`
    SELECT service_type, AVG(cost) AS avg_cost, COUNT(cost) AS n
    FROM maintenance_log WHERE user_vehicle_id = ? AND cost IS NOT NULL
    GROUP BY service_type
  `).all(vehicle_id);
  const avgCost = {};
  for (const r of costRows) avgCost[r.service_type] = { cost: round2(r.avg_cost), samples: r.n };

  const today = new Date();
  const items = [];

  for (const iv of intervals) {
    const candidates = []; // { date, basis }

    // Mileage-based: how long until we cover the remaining miles at current usage
    if (iv.interval_miles && iv.last_mileage != null && currentMileage != null) {
      const dueAt = iv.last_mileage + iv.interval_miles;
      const milesRemaining = dueAt - currentMileage;
      if (milesRemaining <= 0) {
        candidates.push({ date: iso(today), basis: 'mileage', overdueBy: Math.abs(milesRemaining), dueAtMileage: dueAt });
      } else if (milesPerDay && milesPerDay > 0) {
        candidates.push({
          date: iso(addDays(today, milesRemaining / milesPerDay)),
          basis: 'mileage', milesRemaining, dueAtMileage: dueAt,
        });
      }
    }

    // Time-based
    if (iv.interval_months && iv.last_date) {
      candidates.push({ date: iso(addMonths(iv.last_date, iv.interval_months)), basis: 'time' });
    }

    if (candidates.length === 0) {
      items.push({
        id: iv.id, service_type: iv.service_type, is_factory: !!iv.is_factory,
        interval_miles: iv.interval_miles, interval_months: iv.interval_months,
        lastDate: iv.last_date, lastMileage: iv.last_mileage,
        projectedDate: null,
        reason: !iv.last_date && iv.last_mileage == null
          ? 'never logged — log this service once to start projecting'
          : 'not enough mileage history to project',
        estimatedCost: avgCost[iv.service_type]?.cost ?? null,
      });
      continue;
    }

    // Whichever comes first governs
    candidates.sort((a, b) => (a.date < b.date ? -1 : 1));
    const soonest = candidates[0];
    const daysOut = Math.round((new Date(soonest.date + 'T12:00:00') - today) / DAY_MS);

    items.push({
      id: iv.id, service_type: iv.service_type, is_factory: !!iv.is_factory,
      interval_miles: iv.interval_miles, interval_months: iv.interval_months,
      lastDate: iv.last_date, lastMileage: iv.last_mileage,
      projectedDate: soonest.date,
      basis: soonest.basis,
      daysOut,
      overdue: daysOut <= 0,
      milesRemaining: soonest.milesRemaining ?? null,
      dueAtMileage: soonest.dueAtMileage ?? null,
      estimatedCost: avgCost[iv.service_type]?.cost ?? null,
      costSamples: avgCost[iv.service_type]?.samples ?? 0,
    });
  }

  // Soonest first; unprojectable entries last
  items.sort((a, b) => {
    if (!a.projectedDate && !b.projectedDate) return a.service_type.localeCompare(b.service_type);
    if (!a.projectedDate) return 1;
    if (!b.projectedDate) return -1;
    return a.projectedDate < b.projectedDate ? -1 : 1;
  });

  const horizonEnd = iso(addMonths(iso(today), horizonMonths));
  const withinHorizon = items.filter(i => i.projectedDate && i.projectedDate <= horizonEnd);
  const forecastCost = round2(withinHorizon.reduce((s, i) => s + (i.estimatedCost || 0), 0));

  res.json({
    currentMileage,
    milesPerMonth,
    horizonMonths,
    horizonEnd,
    items,
    summary: {
      overdue: items.filter(i => i.overdue).length,
      dueInHorizon: withinHorizon.length,
      forecastCost,
      costKnownFor: withinHorizon.filter(i => i.estimatedCost != null).length,
      unprojectable: items.filter(i => !i.projectedDate).length,
    },
  });
});

module.exports = router;
