const express = require('express');
const router = express.Router();
const { getDb } = require('../db');

function monthsElapsed(startStr) {
  if (!startStr) return 0;
  const start = new Date(startStr + 'T12:00:00');
  const now = new Date();
  let m = (now.getFullYear() - start.getFullYear()) * 12 + (now.getMonth() - start.getMonth());
  if (now.getDate() < start.getDate()) m -= 1;
  return Math.max(0, m);
}

function round2(n) {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

// Compute the financing contribution to cost-of-ownership.
function computeFinancing(v) {
  const type = v.ownership_type || 'owned';

  if (type === 'loan') {
    const upfront = v.loan_down_payment || 0;
    const monthly = v.loan_monthly_payment || 0;
    const term = v.loan_term_months || 0;
    const elapsed = Math.min(monthsElapsed(v.loan_start_date), term || Infinity);
    const paidToDate = round2(monthly * (isFinite(elapsed) ? elapsed : 0));
    const remaining = term ? round2(monthly * Math.max(0, term - elapsed)) : null;
    const totalContract = term ? round2(upfront + monthly * term) : null;
    const totalInterest = (totalContract != null && v.loan_amount)
      ? round2(totalContract - v.loan_amount) : null;
    return {
      type, monthly, upfront,
      paidToDate, remaining,
      spentToDate: round2(upfront + paidToDate),
      totalContract, totalInterest,
      monthsElapsed: isFinite(elapsed) ? elapsed : 0, termMonths: term,
    };
  }

  if (type === 'lease') {
    const upfront = v.lease_down_payment || 0;
    const monthly = v.lease_monthly_payment || 0;
    const term = v.lease_term_months || 0;
    const elapsed = Math.min(monthsElapsed(v.lease_start_date), term || Infinity);
    const paidToDate = round2(monthly * (isFinite(elapsed) ? elapsed : 0));
    const remaining = term ? round2(monthly * Math.max(0, term - elapsed)) : null;
    const totalContract = term ? round2(upfront + monthly * term) : null;
    return {
      type, monthly, upfront,
      paidToDate, remaining,
      spentToDate: round2(upfront + paidToDate),
      totalContract, buyout: v.lease_buyout || null,
      mileageAllowance: v.lease_mileage_allowance || null,
      monthsElapsed: isFinite(elapsed) ? elapsed : 0, termMonths: term,
    };
  }

  // owned outright — the purchase price is the acquisition cost
  const upfront = v.purchase_price || 0;
  return {
    type: 'owned', monthly: 0, upfront,
    paidToDate: 0, remaining: 0,
    spentToDate: round2(upfront),
    totalContract: round2(upfront), totalInterest: 0,
    monthsElapsed: 0, termMonths: 0,
  };
}

router.get('/', (req, res) => {
  const db = getDb();
  const { vehicle_id } = req.query;
  if (!vehicle_id) return res.status(400).json({ error: 'vehicle_id required' });

  const v = db.prepare('SELECT * FROM user_vehicles WHERE id = ?').get(vehicle_id);
  if (!v) return res.status(404).json({ error: 'Not found' });

  // ── Spend categories ──
  const modSpend = db.prepare(`
    SELECT COALESCE(SUM(cost), 0) as total
    FROM mods WHERE user_vehicle_id = ? AND status != 'Researching' AND cost IS NOT NULL
  `).get(vehicle_id).total;

  const maintSpend = db.prepare(`
    SELECT COALESCE(SUM(cost), 0) as total
    FROM maintenance_log WHERE user_vehicle_id = ? AND cost IS NOT NULL
  `).get(vehicle_id).total;

  const fuelSpend = db.prepare(`
    SELECT COALESCE(SUM(total_cost), 0) as total
    FROM fuel_log WHERE user_vehicle_id = ? AND total_cost IS NOT NULL
  `).get(vehicle_id).total;

  const tireSpend = db.prepare(`
    SELECT COALESCE(SUM(cost), 0) as total
    FROM tire_sets WHERE user_vehicle_id = ? AND cost IS NOT NULL
  `).get(vehicle_id).total;

  const financing = computeFinancing(v);

  const spend = {
    financing: financing.spentToDate,
    mods: round2(modSpend),
    maintenance: round2(maintSpend),
    fuel: round2(fuelSpend),
    tires: round2(tireSpend),
  };
  spend.total = round2(spend.financing + spend.mods + spend.maintenance + spend.fuel + spend.tires);
  // Running costs exclude the acquisition price (useful for "per mile to operate")
  spend.operating = round2(spend.mods + spend.maintenance + spend.fuel + spend.tires);

  // ── Miles driven & cost per mile ──
  const milesDriven = (v.current_mileage != null && v.mileage_at_purchase != null)
    ? Math.max(0, v.current_mileage - v.mileage_at_purchase)
    : null;
  const costPerMile = (milesDriven && milesDriven > 0)
    ? round2(spend.total / milesDriven) : null;
  const operatingCostPerMile = (milesDriven && milesDriven > 0)
    ? round2(spend.operating / milesDriven) : null;

  // ── Monthly spend timeline (mods + maintenance + fuel) ──
  const buckets = {}; // 'YYYY-MM' -> { mods, maintenance, fuel, tires }
  const add = (month, key, amt) => {
    if (!month) return;
    buckets[month] = buckets[month] || { mods: 0, maintenance: 0, fuel: 0, tires: 0 };
    buckets[month][key] += amt || 0;
  };
  db.prepare(`
    SELECT substr(COALESCE(install_date, purchase_date, date(created_at)),1,7) as m, COALESCE(SUM(cost),0) as t
    FROM mods WHERE user_vehicle_id = ? AND status != 'Researching' AND cost IS NOT NULL GROUP BY m
  `).all(vehicle_id).forEach(r => add(r.m, 'mods', r.t));
  db.prepare(`
    SELECT substr(date_performed,1,7) as m, COALESCE(SUM(cost),0) as t
    FROM maintenance_log WHERE user_vehicle_id = ? AND cost IS NOT NULL GROUP BY m
  `).all(vehicle_id).forEach(r => add(r.m, 'maintenance', r.t));
  db.prepare(`
    SELECT substr(date,1,7) as m, COALESCE(SUM(total_cost),0) as t
    FROM fuel_log WHERE user_vehicle_id = ? AND total_cost IS NOT NULL GROUP BY m
  `).all(vehicle_id).forEach(r => add(r.m, 'fuel', r.t));
  db.prepare(`
    SELECT substr(COALESCE(install_date, purchase_date, date(created_at)),1,7) as m, COALESCE(SUM(cost),0) as t
    FROM tire_sets WHERE user_vehicle_id = ? AND cost IS NOT NULL GROUP BY m
  `).all(vehicle_id).forEach(r => add(r.m, 'tires', r.t));

  let cumulative = 0;
  const timeline = Object.keys(buckets).sort().map(month => {
    const b = buckets[month];
    const monthTotal = round2(b.mods + b.maintenance + b.fuel + b.tires);
    cumulative = round2(cumulative + monthTotal);
    return { month, mods: round2(b.mods), maintenance: round2(b.maintenance), fuel: round2(b.fuel), tires: round2(b.tires), total: monthTotal, cumulative };
  });

  res.json({
    vehicle: {
      id: v.id, nickname: v.nickname,
      ownership_type: v.ownership_type || 'owned',
      purchase_price: v.purchase_price,
      mileage_at_purchase: v.mileage_at_purchase,
      current_mileage: v.current_mileage,
    },
    financing,
    spend,
    milesDriven,
    costPerMile,
    operatingCostPerMile,
    timeline,
  });
});

module.exports = router;
