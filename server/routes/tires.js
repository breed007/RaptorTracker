const express = require('express');
const router = express.Router();
const { getDb } = require('../db');

const COLS = [
  'name', 'tire_brand', 'tire_model', 'tire_size', 'wheel_brand', 'wheel_size',
  'quantity', 'cost', 'purchase_date', 'install_date', 'removed_date',
  'odometer_installed', 'odometer_removed', 'is_active', 'notes',
];

function coerce(body) {
  const num = (x) => (x != null && x !== '' ? parseFloat(x) : null);
  const int = (x) => (x != null && x !== '' ? parseInt(x, 10) : null);
  return {
    name: (body.name || '').trim(),
    tire_brand: body.tire_brand || '',
    tire_model: body.tire_model || '',
    tire_size: body.tire_size || '',
    wheel_brand: body.wheel_brand || '',
    wheel_size: body.wheel_size || '',
    quantity: int(body.quantity) ?? 4,
    cost: num(body.cost),
    purchase_date: body.purchase_date || null,
    install_date: body.install_date || null,
    removed_date: body.removed_date || null,
    odometer_installed: int(body.odometer_installed),
    odometer_removed: int(body.odometer_removed),
    is_active: body.is_active ? 1 : 0,
    notes: body.notes || '',
  };
}

// Miles on a set = (removed or current) - installed
function withMiles(row, currentMileage) {
  let miles = null;
  if (row.odometer_installed != null) {
    const end = row.odometer_removed != null ? row.odometer_removed
      : (row.is_active && currentMileage != null ? currentMileage : null);
    if (end != null) miles = Math.max(0, end - row.odometer_installed);
  }
  return { ...row, miles_on_set: miles };
}

router.get('/', (req, res) => {
  const { vehicle_id } = req.query;
  if (!vehicle_id) return res.status(400).json({ error: 'vehicle_id required' });
  const db = getDb();
  const uv = db.prepare('SELECT current_mileage FROM user_vehicles WHERE id = ?').get(vehicle_id);
  const rows = db.prepare(
    'SELECT * FROM tire_sets WHERE user_vehicle_id = ? ORDER BY is_active DESC, COALESCE(install_date, purchase_date, created_at) DESC'
  ).all(vehicle_id);
  res.json(rows.map(r => withMiles(r, uv?.current_mileage)));
});

router.post('/', (req, res) => {
  const { user_vehicle_id } = req.body;
  if (!user_vehicle_id) return res.status(400).json({ error: 'user_vehicle_id required' });
  const data = coerce(req.body);
  if (!data.name) return res.status(400).json({ error: 'name is required' });
  const db = getDb();
  const r = db.prepare(`
    INSERT INTO tire_sets (user_vehicle_id, ${COLS.join(', ')})
    VALUES (@user_vehicle_id, ${COLS.map(c => '@' + c).join(', ')})
  `).run({ user_vehicle_id, ...data });
  res.status(201).json(db.prepare('SELECT * FROM tire_sets WHERE id = ?').get(r.lastInsertRowid));
});

router.put('/:id', (req, res) => {
  const db = getDb();
  const existing = db.prepare('SELECT id FROM tire_sets WHERE id = ?').get(req.params.id);
  if (!existing) return res.status(404).json({ error: 'Not found' });
  const data = coerce(req.body);
  if (!data.name) return res.status(400).json({ error: 'name is required' });
  db.prepare(`
    UPDATE tire_sets SET ${COLS.map(c => c + '=@' + c).join(', ')} WHERE id=@id
  `).run({ ...data, id: req.params.id });
  res.json(db.prepare('SELECT * FROM tire_sets WHERE id = ?').get(req.params.id));
});

router.delete('/:id', (req, res) => {
  const db = getDb();
  const existing = db.prepare('SELECT id FROM tire_sets WHERE id = ?').get(req.params.id);
  if (!existing) return res.status(404).json({ error: 'Not found' });
  db.prepare('DELETE FROM tire_sets WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
});

module.exports = router;
