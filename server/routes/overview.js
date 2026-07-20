const express = require('express');
const router = express.Router();
const { getDb } = require('../db');
const { gatherReminders } = require('../services/reminders');
const { computeCapacity } = require('../services/auxCapacity');
const { mileageTrend, usageRate } = require('../services/mileageStats');

// Where each reminder category should take you when clicked
const LINKS = {
  service: '/maintenance',
  warranty: '/warranty',
  compliance: '/garage',
};

/**
 * GET /api/overview?vehicle_id=X
 *
 * The vehicle's home screen in one request. The dashboard used to make five
 * round trips and render three competing alert cards; this returns a single
 * severity-ordered "needs attention" list plus the headline numbers.
 */
router.get('/', (req, res) => {
  const { vehicle_id } = req.query;
  if (!vehicle_id) return res.status(400).json({ error: 'vehicle_id required' });

  const db = getDb();
  const v = db.prepare(`
    SELECT uv.*, ve.make, ve.model, ve.generation, ve.variant
    FROM user_vehicles uv JOIN vehicles ve ON uv.vehicle_id = ve.id
    WHERE uv.id = ?
  `).get(vehicle_id);
  if (!v) return res.status(404).json({ error: 'Not found' });

  // ── Needs attention ──
  // Reuse the reminder engine so the dashboard and the email digest can never
  // disagree about what's outstanding.
  const attention = [];
  const reminders = gatherReminders(db, { service: true, warranty: true, compliance: true })
    .filter(r => r.vehicleId === v.id);

  for (const r of reminders) {
    const critical = r.state === 'overdue' || r.state === 'expired';
    attention.push({
      severity: critical ? 'critical' : 'warning',
      category: r.category,
      title: r.title,
      detail: r.detail,
      link: LINKS[r.category] || '/',
    });
  }

  // Over-fused AUX circuits are a real electrical problem, not just a warning
  const capacity = computeCapacity(db, v.id);
  for (const s of capacity?.switches || []) {
    if (s.status === 'over') {
      attention.push({
        severity: 'critical',
        category: 'electrical',
        title: `AUX ${s.switch_number} over fuse rating`,
        detail: `${s.totalAmps}A drawn on a ${s.fuse_amps}A circuit`,
        link: '/aux',
      });
    }
  }

  const order = { critical: 0, warning: 1 };
  attention.sort((a, b) => (order[a.severity] - order[b.severity]) || a.category.localeCompare(b.category));

  // ── Headline numbers ──
  const modStats = db.prepare(`
    SELECT
      COUNT(CASE WHEN status = 'Installed' THEN 1 END) AS installed,
      COUNT(CASE WHEN status = 'In_Transit' THEN 1 END) AS in_transit,
      COUNT(CASE WHEN status = 'Ordered' THEN 1 END) AS ordered,
      COALESCE(SUM(CASE WHEN status = 'Installed' THEN cost ELSE 0 END), 0) AS mod_spend
    FROM mods WHERE user_vehicle_id = ?
  `).get(vehicle_id);

  const maint = db.prepare(`
    SELECT COUNT(*) AS records, COALESCE(SUM(cost), 0) AS spend
    FROM maintenance_log WHERE user_vehicle_id = ?
  `).get(vehicle_id);

  const lastService = db.prepare(`
    SELECT service_type, date_performed, mileage FROM maintenance_log
    WHERE user_vehicle_id = ? ORDER BY date_performed DESC, id DESC LIMIT 1
  `).get(vehicle_id);

  const byCategory = db.prepare(`
    SELECT category, COALESCE(SUM(cost), 0) AS spend, COUNT(*) AS count
    FROM mods WHERE user_vehicle_id = ? AND status = 'Installed' AND cost IS NOT NULL
    GROUP BY category ORDER BY spend DESC
  `).all(vehicle_id);

  const recentMods = db.prepare(`
    SELECT id, part_name, brand, category, status, updated_at
    FROM mods WHERE user_vehicle_id = ? ORDER BY updated_at DESC LIMIT 5
  `).all(vehicle_id);

  const recentMaintenance = db.prepare(`
    SELECT id, service_type, date_performed, mileage, cost, vendor
    FROM maintenance_log WHERE user_vehicle_id = ? ORDER BY date_performed DESC LIMIT 4
  `).all(vehicle_id);

  const { milesPerMonth } = usageRate(mileageTrend(db, vehicle_id));

  res.json({
    vehicle: {
      id: v.id, nickname: v.nickname, model_year: v.model_year,
      make: v.make, model: v.model, generation: v.generation, variant: v.variant,
      color: v.color, profile_photo: v.profile_photo,
      current_mileage: v.current_mileage,
      milesPerMonth,
    },
    attention,
    attentionSummary: {
      critical: attention.filter(a => a.severity === 'critical').length,
      warning: attention.filter(a => a.severity === 'warning').length,
    },
    stats: {
      installed: modStats.installed,
      inTransit: modStats.in_transit,
      onOrder: modStats.ordered,
      modSpend: modStats.mod_spend,
      maintenanceSpend: maint.spend,
      serviceRecords: maint.records,
      lastService: lastService || null,
    },
    spendByCategory: byCategory,
    recentMods,
    recentMaintenance,
    aux: capacity?.summary || null,
  });
});

module.exports = router;
