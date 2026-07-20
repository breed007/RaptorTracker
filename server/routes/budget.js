const express = require('express');
const router = express.Router();
const { getDb } = require('../db');

const round2 = (n) => Math.round((n + Number.EPSILON) * 100) / 100;
const DAY_MS = 86400000;

// Months spanned by a set of dated rows, floored at 1 so a single month of
// history doesn't produce an absurd monthly average.
function spanMonths(rows) {
  const dates = rows.map(r => r.d).filter(Boolean).sort();
  if (dates.length < 2) return 1;
  const a = new Date(dates[0] + 'T12:00:00');
  const b = new Date(dates[dates.length - 1] + 'T12:00:00');
  return Math.max(1, (b - a) / (DAY_MS * 30.4375));
}

function monthlyFinancing(v) {
  if (v.ownership_type === 'loan') return v.loan_monthly_payment || 0;
  if (v.ownership_type === 'lease') return v.lease_monthly_payment || 0;
  return 0; // owned outright — no recurring payment
}

/**
 * GET /api/budget?vehicle_id=X
 *
 * Wishlist × cost of ownership: what the truck already costs every month, what
 * that leaves for mods, and when each wishlist item becomes affordable.
 */
router.get('/', (req, res) => {
  const { vehicle_id } = req.query;
  if (!vehicle_id) return res.status(400).json({ error: 'vehicle_id required' });

  const db = getDb();
  const v = db.prepare('SELECT * FROM user_vehicles WHERE id = ?').get(vehicle_id);
  if (!v) return res.status(404).json({ error: 'Not found' });

  // ── Recurring commitments, from actual history ──
  const fuelRows = db.prepare('SELECT date AS d, total_cost AS c FROM fuel_log WHERE user_vehicle_id = ? AND total_cost IS NOT NULL').all(vehicle_id);
  const maintRows = db.prepare('SELECT date_performed AS d, cost AS c FROM maintenance_log WHERE user_vehicle_id = ? AND cost IS NOT NULL').all(vehicle_id);
  const modRows = db.prepare(`
    SELECT COALESCE(install_date, purchase_date, date(created_at)) AS d, cost AS c
    FROM mods WHERE user_vehicle_id = ? AND cost IS NOT NULL AND status != 'Researching'
  `).all(vehicle_id);

  const avgMonthly = (rows) => rows.length ? round2(rows.reduce((s, r) => s + (r.c || 0), 0) / spanMonths(rows)) : 0;

  const commitments = {
    financing: round2(monthlyFinancing(v)),
    fuel: avgMonthly(fuelRows),
    maintenance: avgMonthly(maintRows),
  };
  commitments.total = round2(commitments.financing + commitments.fuel + commitments.maintenance);

  // What they've historically spent on mods per month — used as a suggestion
  // when no explicit budget has been set.
  const historicalModRate = avgMonthly(modRows);

  const monthlyBudget = v.mod_budget_monthly != null ? round2(v.mod_budget_monthly) : null;
  const available = monthlyBudget != null ? round2(monthlyBudget - commitments.total) : null;

  // ── The plan: wishlist in priority order, accumulating at `available` ──
  const wishlist = db.prepare(`
    SELECT id, part_name, brand, estimated_cost, priority, aux_switch
    FROM wishlist WHERE user_vehicle_id = ?
  `).all(vehicle_id);

  const rank = { high: 0, medium: 1, low: 2 };
  const ordered = [...wishlist].sort((a, b) => {
    const pr = (rank[a.priority] ?? 1) - (rank[b.priority] ?? 1);
    if (pr !== 0) return pr;
    return (a.estimated_cost || 0) - (b.estimated_cost || 0); // cheaper first within a band
  });

  const today = new Date();
  let cumulative = 0;
  const plan = ordered.map(item => {
    const cost = item.estimated_cost != null ? round2(item.estimated_cost) : null;
    if (cost != null) cumulative = round2(cumulative + cost);

    let monthsUntil = null, projectedDate = null;
    if (cost != null && available != null && available > 0) {
      monthsUntil = Math.ceil(cumulative / available);
      const d = new Date(today);
      d.setMonth(d.getMonth() + monthsUntil);
      projectedDate = d.toISOString().slice(0, 10);
    }

    return {
      id: item.id, part_name: item.part_name, brand: item.brand,
      priority: item.priority || 'medium',
      estimatedCost: cost,
      cumulativeCost: cost != null ? cumulative : null,
      monthsUntil, projectedDate,
    };
  });

  const wishlistTotal = round2(wishlist.reduce((s, w) => s + (w.estimated_cost || 0), 0));
  const unpriced = wishlist.filter(w => w.estimated_cost == null).length;

  res.json({
    monthlyBudget,
    commitments,
    available,
    historicalModRate,
    ownershipType: v.ownership_type || 'owned',
    wishlist: {
      count: wishlist.length,
      total: wishlistTotal,
      unpriced,
      monthsToClear: available != null && available > 0 ? Math.ceil(wishlistTotal / available) : null,
    },
    plan,
  });
});

// PUT /api/budget — set the monthly vehicle budget
router.put('/', (req, res) => {
  const { vehicle_id, monthly_budget } = req.body;
  if (!vehicle_id) return res.status(400).json({ error: 'vehicle_id required' });
  const db = getDb();
  const exists = db.prepare('SELECT id FROM user_vehicles WHERE id = ?').get(vehicle_id);
  if (!exists) return res.status(404).json({ error: 'Not found' });

  const val = monthly_budget === '' || monthly_budget == null ? null : parseFloat(monthly_budget);
  if (val != null && (isNaN(val) || val < 0)) return res.status(400).json({ error: 'monthly_budget must be a positive number' });

  db.prepare('UPDATE user_vehicles SET mod_budget_monthly = ? WHERE id = ?').run(val, vehicle_id);
  res.json({ ok: true, monthlyBudget: val });
});

module.exports = router;
