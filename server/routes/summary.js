const express = require('express');
const { getDb } = require('../db');
const router = express.Router();

router.get('/', (req, res) => {
  const db = getDb();
  const { vehicle_id } = req.query;
  if (!vehicle_id) return res.status(400).json({ error: 'vehicle_id required' });

  const stats = db.prepare(`
    SELECT
      COUNT(*) as total_mods,
      COUNT(CASE WHEN status = 'Installed' THEN 1 END) as installed,
      COUNT(CASE WHEN status = 'In_Transit' THEN 1 END) as in_transit,
      COUNT(CASE WHEN status = 'Ordered' THEN 1 END) as ordered,
      COUNT(CASE WHEN status = 'Researching' THEN 1 END) as researching,
      COALESCE(SUM(CASE WHEN status = 'Installed' THEN cost ELSE 0 END), 0) as total_spend
    FROM mods WHERE user_vehicle_id = ?
  `).get(vehicle_id);

  const byCategory = db.prepare(`
    SELECT category, COALESCE(SUM(cost), 0) as spend, COUNT(*) as count
    FROM mods
    WHERE user_vehicle_id = ? AND status = 'Installed' AND cost IS NOT NULL
    GROUP BY category
    ORDER BY spend DESC
  `).all(vehicle_id);

  const recent = db.prepare(`
    SELECT id, part_name, brand, category, status, updated_at
    FROM mods WHERE user_vehicle_id = ?
    ORDER BY updated_at DESC LIMIT 5
  `).all(vehicle_id);

  res.json({ stats, byCategory, recent });
});

module.exports = router;
