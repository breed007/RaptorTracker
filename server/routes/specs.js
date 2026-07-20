const express = require('express');
const router = express.Router();
const { getDb } = require('../db');

const CATEGORIES = ['fluids', 'capacities', 'torque', 'electrical', 'tires', 'dimensions', 'other'];

// Curated links to primary sources. We point at official documentation rather
// than copying it — Ford's workshop/service data is licensed content, and
// reproducing it in a distributed app isn't ours to do.
const RESOURCES = [
  {
    id: 'ford-owner-manuals',
    label: 'Ford Owner Manuals',
    url: 'https://www.ford.com/support/owner-manuals/',
    note: 'Free PDFs by model year — fluid capacities, tire pressures, bulb and fuse charts.',
  },
  {
    id: 'ford-support',
    label: 'Ford Owner Support',
    url: 'https://www.ford.com/support/',
    note: 'Maintenance schedules, how-to guides, and warranty information.',
  },
  {
    id: 'nhtsa-recalls',
    label: 'NHTSA Recalls & Complaints',
    url: 'https://www.nhtsa.gov/recalls',
    note: 'Official recall lookup by VIN. RaptorTracker already surfaces open recalls on your dashboard.',
  },
  {
    id: 'frf',
    label: 'FordRaptorForum',
    url: 'https://www.fordraptorforum.com/',
    note: 'Community write-ups and build threads.',
  },
];

// GET /api/specs/resources — public reference links
router.get('/resources', (req, res) => {
  res.json({ resources: RESOURCES, categories: CATEGORIES });
});

// GET /api/specs?vehicle_id=X
router.get('/', (req, res) => {
  const { vehicle_id } = req.query;
  if (!vehicle_id) return res.status(400).json({ error: 'vehicle_id required' });
  const rows = getDb().prepare(
    'SELECT * FROM vehicle_specs WHERE user_vehicle_id = ? ORDER BY category ASC, name ASC'
  ).all(vehicle_id);
  res.json(rows);
});

// POST /api/specs
router.post('/', (req, res) => {
  const { user_vehicle_id, category, name, value, unit, source, notes } = req.body;
  if (!user_vehicle_id || !name || !String(name).trim()) {
    return res.status(400).json({ error: 'user_vehicle_id and name are required' });
  }
  const db = getDb();
  const cat = CATEGORIES.includes(category) ? category : 'other';
  const r = db.prepare(`
    INSERT INTO vehicle_specs (user_vehicle_id, category, name, value, unit, source, notes)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(user_vehicle_id, cat, String(name).trim(), value || '', unit || '', source || '', notes || '');
  res.status(201).json(db.prepare('SELECT * FROM vehicle_specs WHERE id = ?').get(r.lastInsertRowid));
});

// PUT /api/specs/:id
router.put('/:id', (req, res) => {
  const db = getDb();
  const existing = db.prepare('SELECT id FROM vehicle_specs WHERE id = ?').get(req.params.id);
  if (!existing) return res.status(404).json({ error: 'Not found' });
  const { category, name, value, unit, source, notes } = req.body;
  if (!name || !String(name).trim()) return res.status(400).json({ error: 'name is required' });
  const cat = CATEGORIES.includes(category) ? category : 'other';
  db.prepare('UPDATE vehicle_specs SET category=?, name=?, value=?, unit=?, source=?, notes=? WHERE id=?')
    .run(cat, String(name).trim(), value || '', unit || '', source || '', notes || '', req.params.id);
  res.json(db.prepare('SELECT * FROM vehicle_specs WHERE id = ?').get(req.params.id));
});

// DELETE /api/specs/:id
router.delete('/:id', (req, res) => {
  const db = getDb();
  const existing = db.prepare('SELECT id FROM vehicle_specs WHERE id = ?').get(req.params.id);
  if (!existing) return res.status(404).json({ error: 'Not found' });
  db.prepare('DELETE FROM vehicle_specs WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
});

module.exports = router;
module.exports.CATEGORIES = CATEGORIES;
