const express = require('express');
const router = express.Router();
const { getDb } = require('../db');

// Ford factory service intervals by generation
function getFactoryIntervals(generation) {
  const isGen1 = generation === 'Gen 1';
  return [
    {
      service_type: 'Oil Change',
      interval_miles: isGen1 ? 7500 : 10000,
      interval_months: 12,
      notes: isGen1
        ? 'Ford recommends Motorcraft 5W-20. Change filter every oil change.'
        : 'Ford recommends Motorcraft Full Synthetic 5W-30. Change filter every oil change.',
    },
    {
      service_type: 'Tire Rotation',
      interval_miles: isGen1 ? 7500 : 10000,
      interval_months: 12,
      notes: 'Rotate and inspect tread depth and sidewall condition.',
    },
    {
      service_type: 'Air Filter (Cabin)',
      interval_miles: 20000,
      interval_months: 24,
      notes: 'Inspect more frequently if driving in dusty or off-road conditions.',
    },
    {
      service_type: 'Air Filter (Engine)',
      interval_miles: 30000,
      interval_months: 36,
      notes: 'Inspect more frequently in heavy dust or off-road use.',
    },
    {
      service_type: 'Brake Fluid',
      interval_miles: null,
      interval_months: 36,
      notes: 'Replace every 3 years regardless of mileage. Use Ford-specified DOT 4 LV.',
    },
    {
      service_type: 'Spark Plugs',
      interval_miles: 60000,
      interval_months: null,
      notes: isGen1
        ? 'Replace with Motorcraft platinum plugs.'
        : 'Replace with Motorcraft iridium plugs (SP-546 or equivalent).',
    },
    {
      service_type: 'Coolant Flush',
      interval_miles: 100000,
      interval_months: 72,
      notes: '6 years or 100,000 miles — whichever comes first. Use Motorcraft Orange Antifreeze.',
    },
    {
      service_type: 'Diff Fluid',
      interval_miles: 150000,
      interval_months: null,
      notes: 'Every 150,000 mi normal use. Every 30,000 mi if towing, off-roading, or severe duty. Change front and rear.',
    },
    {
      service_type: 'Transfer Case Fluid',
      interval_miles: 150000,
      interval_months: null,
      notes: 'Every 150,000 mi normal use. Every 60,000 mi severe duty.',
    },
    {
      service_type: 'Transmission Fluid',
      interval_miles: 150000,
      interval_months: null,
      notes: 'Every 150,000 mi normal use. Every 60,000 mi severe duty / towing. 10-speed: use Motorcraft MERCON ULV.',
    },
  ];
}

// GET /api/intervals?vehicle_id=X
// Returns intervals with last-performed data joined from maintenance_log
router.get('/', (req, res) => {
  const { vehicle_id } = req.query;
  if (!vehicle_id) return res.status(400).json({ error: 'vehicle_id required' });
  const db = getDb();

  const intervals = db.prepare(`
    SELECT si.*,
      ml.last_date,
      ml.last_mileage
    FROM service_intervals si
    LEFT JOIN (
      SELECT user_vehicle_id, service_type,
        MAX(date_performed) as last_date,
        MAX(mileage)        as last_mileage
      FROM maintenance_log
      GROUP BY user_vehicle_id, service_type
    ) ml ON ml.user_vehicle_id = si.user_vehicle_id
         AND ml.service_type = si.service_type
    WHERE si.user_vehicle_id = ?
    ORDER BY si.is_factory DESC, si.service_type ASC
  `).all(vehicle_id);

  const uv = db.prepare('SELECT current_mileage FROM user_vehicles WHERE id = ?').get(vehicle_id);
  res.json({ intervals, currentMileage: uv?.current_mileage || null });
});

// POST /api/intervals  — create a custom interval
router.post('/', (req, res) => {
  const { user_vehicle_id, service_type, interval_miles, interval_months, notes } = req.body;
  if (!user_vehicle_id || !service_type)
    return res.status(400).json({ error: 'user_vehicle_id and service_type required' });
  const db = getDb();
  const r = db.prepare(
    'INSERT INTO service_intervals (user_vehicle_id, service_type, interval_miles, interval_months, notes, is_factory) VALUES (?, ?, ?, ?, ?, 0)'
  ).run(user_vehicle_id, service_type, interval_miles || null, interval_months || null, notes || null);
  res.json(db.prepare('SELECT * FROM service_intervals WHERE id = ?').get(r.lastInsertRowid));
});

// PUT /api/intervals/:id
router.put('/:id', (req, res) => {
  const { service_type, interval_miles, interval_months, notes } = req.body;
  const db = getDb();
  db.prepare(
    'UPDATE service_intervals SET service_type=?, interval_miles=?, interval_months=?, notes=? WHERE id=?'
  ).run(service_type, interval_miles || null, interval_months || null, notes || null, req.params.id);
  res.json(db.prepare('SELECT * FROM service_intervals WHERE id = ?').get(req.params.id));
});

// DELETE /api/intervals/:id
router.delete('/:id', (req, res) => {
  getDb().prepare('DELETE FROM service_intervals WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
});

// POST /api/intervals/load-factory  — seeds Ford factory intervals for a vehicle
router.post('/load-factory', (req, res) => {
  const { vehicle_id } = req.body;
  if (!vehicle_id) return res.status(400).json({ error: 'vehicle_id required' });
  const db = getDb();

  const uv = db.prepare(
    'SELECT uv.id, v.generation FROM user_vehicles uv JOIN vehicles v ON v.id = uv.vehicle_id WHERE uv.id = ?'
  ).get(vehicle_id);
  if (!uv) return res.status(404).json({ error: 'Vehicle not found' });

  const factoryList = getFactoryIntervals(uv.generation);

  // Replace existing factory intervals
  db.prepare('DELETE FROM service_intervals WHERE user_vehicle_id = ? AND is_factory = 1').run(vehicle_id);
  const ins = db.prepare(
    'INSERT INTO service_intervals (user_vehicle_id, service_type, interval_miles, interval_months, notes, is_factory) VALUES (?, ?, ?, ?, ?, 1)'
  );
  for (const fi of factoryList) {
    ins.run(vehicle_id, fi.service_type, fi.interval_miles, fi.interval_months, fi.notes);
  }
  res.json({ ok: true, count: factoryList.length });
});

// PATCH /api/intervals/mileage  — update the vehicle's current mileage
router.patch('/mileage', (req, res) => {
  const { vehicle_id, current_mileage } = req.body;
  if (!vehicle_id) return res.status(400).json({ error: 'vehicle_id required' });
  getDb().prepare('UPDATE user_vehicles SET current_mileage = ? WHERE id = ?')
    .run(current_mileage || null, vehicle_id);
  res.json({ ok: true });
});

module.exports = { router, getFactoryIntervals };
