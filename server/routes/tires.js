const express = require('express');
const router = express.Router();
const { getDb } = require('../db');
const { afterWrite, checkReading } = require('../services/odometer');
const trash = require('../services/trash');

const COLS = [
  'name', 'tire_brand', 'tire_model', 'tire_size', 'wheel_brand', 'wheel_size',
  'quantity', 'cost', 'purchase_date', 'install_date', 'removed_date',
  'odometer_installed', 'odometer_removed', 'is_active', 'notes', 'street_psi_front', 'street_psi_rear',
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
    street_psi_front: num(body.street_psi_front),
    street_psi_rear: num(body.street_psi_rear),
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

function tireWarning(db, vehicleId, data, id) {
  const self = { source: 'tire_sets', id };
  return checkReading(db, vehicleId, { date: data.install_date, odometer: data.odometer_installed, self })
    || checkReading(db, vehicleId, { date: data.removed_date, odometer: data.odometer_removed, self });
}

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
  const warning = tireWarning(db, user_vehicle_id, data, r.lastInsertRowid);
  afterWrite(db, user_vehicle_id);
  res.status(201).json({ ...db.prepare('SELECT * FROM tire_sets WHERE id = ?').get(r.lastInsertRowid), odometerWarning: warning });
});

router.put('/:id', (req, res) => {
  const db = getDb();
  const existing = db.prepare('SELECT id, user_vehicle_id FROM tire_sets WHERE id = ?').get(req.params.id);
  if (!existing) return res.status(404).json({ error: 'Not found' });
  const data = coerce(req.body);
  if (!data.name) return res.status(400).json({ error: 'name is required' });
  db.prepare(`
    UPDATE tire_sets SET ${COLS.map(c => c + '=@' + c).join(', ')} WHERE id=@id
  `).run({ ...data, id: req.params.id });
  const warning = tireWarning(db, existing.user_vehicle_id, data, req.params.id);
  afterWrite(db, existing.user_vehicle_id);
  res.json({ ...db.prepare('SELECT * FROM tire_sets WHERE id = ?').get(req.params.id), odometerWarning: warning });
});

const median = (xs) => {
  const v = xs.filter(x => x != null).sort((a, b) => a - b);
  if (!v.length) return null;
  const m = Math.floor(v.length / 2);
  return v.length % 2 ? v[m] : Math.round(((v[m - 1] + v[m]) / 2) * 10) / 10;
};

// GET /api/tires/:id/air-down — the set's street pressure, and what the owner
// has actually run on each terrain with it, from logged outings.
router.get('/:id/air-down', (req, res) => {
  const db = getDb();
  const set = db.prepare('SELECT * FROM tire_sets WHERE id = ?').get(req.params.id);
  if (!set) return res.status(404).json({ error: 'Not found' });
  const trips = db.prepare(`
    SELECT terrain, date, tire_psi_front, tire_psi_rear, name FROM outings
    WHERE tire_set_id = ? AND (tire_psi_front IS NOT NULL OR tire_psi_rear IS NOT NULL)
    ORDER BY date DESC`).all(set.id);
  const groups = {};
  for (const t of trips) (groups[t.terrain || ''] ||= []).push(t);
  const byTerrain = Object.entries(groups).map(([terrain, list]) => ({
    terrain: terrain || null,
    front: median(list.map(t => t.tire_psi_front)),
    rear: median(list.map(t => t.tire_psi_rear)),
    lowestFront: Math.min(...list.map(t => t.tire_psi_front).filter(x => x != null)),
    trips: list.length,
    last: { date: list[0].date, name: list[0].name, front: list[0].tire_psi_front, rear: list[0].tire_psi_rear },
  })).map(g => ({ ...g, lowestFront: Number.isFinite(g.lowestFront) ? g.lowestFront : null }))
    .sort((a, b) => b.trips - a.trips);
  res.json({
    set: { id: set.id, name: set.name, tire_size: set.tire_size, tire_brand: set.tire_brand, tire_model: set.tire_model, wheel_size: set.wheel_size },
    street: { front: set.street_psi_front, rear: set.street_psi_rear },
    byTerrain,
    trips: trips.length,
  });
});

router.delete('/:id', (req, res) => {
  const db = getDb();
  const existing = db.prepare('SELECT id, user_vehicle_id, name FROM tire_sets WHERE id = ?').get(req.params.id);
  if (!existing) return res.status(404).json({ error: 'Not found' });
  const trashed = trash.moveToTrash(db, 'tire_sets', existing.id, { kind: 'Tire set', title: existing.name });
  afterWrite(db, existing.user_vehicle_id);
  res.json({ ok: true, trashed });
});

module.exports = router;
