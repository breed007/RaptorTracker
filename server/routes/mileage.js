const express = require('express');
const router = express.Router();
const { getDb } = require('../db');
const { afterWrite } = require('../services/odometer');
const { toInt } = require('../lib/parse');

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
  const odo = toInt(odometer);
  if (odo === null || odo <= 0) return res.status(400).json({ error: 'odometer must be a positive number' });

  const db = getDb();
  const r = db.prepare(
    'INSERT INTO mileage_log (user_vehicle_id, date, odometer, note) VALUES (?, ?, ?, ?)'
  ).run(user_vehicle_id, date, odo, note || '');

  const { warning, current_mileage } = afterWrite(db, user_vehicle_id,
    { date, odometer: odo, self: { source: 'mileage_log', id: r.lastInsertRowid } });
  res.status(201).json({ ...db.prepare('SELECT * FROM mileage_log WHERE id = ?').get(r.lastInsertRowid),
    odometerWarning: warning, current_mileage });
});

// DELETE /api/mileage/:id
router.delete('/:id', (req, res) => {
  const db = getDb();
  const existing = db.prepare('SELECT id, user_vehicle_id FROM mileage_log WHERE id = ?').get(req.params.id);
  if (!existing) return res.status(404).json({ error: 'Not found' });
  db.prepare('DELETE FROM mileage_log WHERE id = ?').run(req.params.id);
  const current_mileage = afterWrite(db, existing.user_vehicle_id).current_mileage;
  res.json({ ok: true, current_mileage });
});

module.exports = router;
