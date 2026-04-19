const express = require('express');
const { getDb } = require('../db');
const router = express.Router();

function parseVehicle(v) {
  return {
    ...v,
    engine_options: JSON.parse(v.engine_options || '[]'),
    aux_switch_layout: JSON.parse(v.aux_switch_layout || '[]')
  };
}

router.get('/', (req, res) => {
  const db = getDb();
  const rows = db.prepare('SELECT * FROM vehicles ORDER BY model_year_start, generation').all();
  res.json(rows.map(parseVehicle));
});

router.get('/:id', (req, res) => {
  const db = getDb();
  const row = db.prepare('SELECT * FROM vehicles WHERE id = ?').get(req.params.id);
  if (!row) return res.status(404).json({ error: 'Vehicle not found' });
  res.json(parseVehicle(row));
});

module.exports = router;
