const express = require('express');
const router = express.Router();
const { getDb } = require('../db');

// GET /api/mileage?vehicle_id=X — manual odometer readings, newest first
router.get('/', (req, res) => {
  const { vehicle_id } = req.query;
  if (!vehicle_id) return res.status(400).json({ error: 'vehicle_id required' });
  const rows = getDb().prepare(
    'SELECT * FROM mileage_log WHERE user_vehicle_id = ? ORDER BY date DESC, id DESC'
  ).all(vehicle_id);
  res.json(rows);
});

// POST /api/mileage — add a reading (bumps the vehicle's current mileage if higher)
router.post('/', (req, res) => {
  const { user_vehicle_id, date, odometer, note } = req.body;
  if (!user_vehicle_id || !date || odometer == null || odometer === '') {
    return res.status(400).json({ error: 'user_vehicle_id, date, and odometer are required' });
  }
  const odo = parseInt(odometer, 10);
  if (isNaN(odo)) return res.status(400).json({ error: 'odometer must be a number' });

  const db = getDb();
  const r = db.prepare(
    'INSERT INTO mileage_log (user_vehicle_id, date, odometer, note) VALUES (?, ?, ?, ?)'
  ).run(user_vehicle_id, date, odo, note || '');

  const uv = db.prepare('SELECT current_mileage FROM user_vehicles WHERE id = ?').get(user_vehicle_id);
  if (!uv?.current_mileage || odo > uv.current_mileage) {
    db.prepare('UPDATE user_vehicles SET current_mileage = ? WHERE id = ?').run(odo, user_vehicle_id);
  }

  res.status(201).json(db.prepare('SELECT * FROM mileage_log WHERE id = ?').get(r.lastInsertRowid));
});

// DELETE /api/mileage/:id
router.delete('/:id', (req, res) => {
  const db = getDb();
  const existing = db.prepare('SELECT id FROM mileage_log WHERE id = ?').get(req.params.id);
  if (!existing) return res.status(404).json({ error: 'Not found' });
  db.prepare('DELETE FROM mileage_log WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
});

module.exports = router;
