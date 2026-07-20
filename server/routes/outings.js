const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { v4: uuidv4 } = require('uuid');
const { getDb } = require('../db');

const router = express.Router();
const UPLOAD_DIR = process.env.UPLOAD_DIR || './data/uploads';

const DIFFICULTIES = ['easy', 'moderate', 'difficult', 'extreme'];
const TERRAIN = ['dirt', 'sand', 'rock', 'mud', 'snow', 'mixed', 'pavement'];

const photoUpload = multer({
  storage: multer.diskStorage({
    destination: (req, file, cb) => cb(null, UPLOAD_DIR),
    filename: (req, file, cb) => cb(null, `outing-${uuidv4()}${path.extname(file.originalname).toLowerCase()}`),
  }),
  fileFilter: (req, file, cb) => {
    const ok = ['.jpg', '.jpeg', '.png', '.webp', '.tiff', '.tif', '.heic'].includes(path.extname(file.originalname).toLowerCase());
    cb(ok ? null : new Error('Only image files are allowed'), ok);
  },
  limits: { fileSize: 20 * 1024 * 1024 },
});

const num = (x) => (x != null && x !== '' ? parseFloat(x) : null);
const int = (x) => (x != null && x !== '' ? parseInt(x, 10) : null);
const pick = (v, allowed) => (allowed.includes(String(v || '').toLowerCase()) ? String(v).toLowerCase() : '');

function parseRow(r) {
  const miles = (r.odometer_start != null && r.odometer_end != null)
    ? Math.max(0, r.odometer_end - r.odometer_start) : null;
  let days = 1;
  if (r.end_date && r.date) {
    days = Math.max(1, Math.round((new Date(r.end_date + 'T12:00:00') - new Date(r.date + 'T12:00:00')) / 86400000) + 1);
  }
  return { ...r, photos: JSON.parse(r.photos || '[]'), miles, days };
}

function body(req) {
  const b = req.body;
  return {
    name: (b.name || '').trim(),
    date: b.date || null,
    end_date: b.end_date || null,
    location: b.location || '',
    trail_name: b.trail_name || '',
    difficulty: pick(b.difficulty, DIFFICULTIES),
    terrain: pick(b.terrain, TERRAIN),
    odometer_start: int(b.odometer_start),
    odometer_end: int(b.odometer_end),
    tire_psi_front: num(b.tire_psi_front),
    tire_psi_rear: num(b.tire_psi_rear),
    tire_set_id: int(b.tire_set_id),
    companions: b.companions || '',
    conditions: b.conditions || '',
    damage: b.damage || '',
    notes: b.notes || '',
  };
}

const COLS = ['name', 'date', 'end_date', 'location', 'trail_name', 'difficulty', 'terrain',
  'odometer_start', 'odometer_end', 'tire_psi_front', 'tire_psi_rear', 'tire_set_id',
  'companions', 'conditions', 'damage', 'notes'];

// GET /api/outings?vehicle_id=X
router.get('/', (req, res) => {
  const { vehicle_id } = req.query;
  if (!vehicle_id) return res.status(400).json({ error: 'vehicle_id required' });
  const db = getDb();
  const rows = db.prepare(`
    SELECT o.*, t.name AS tire_set_name
    FROM outings o LEFT JOIN tire_sets t ON t.id = o.tire_set_id
    WHERE o.user_vehicle_id = ? ORDER BY o.date DESC, o.id DESC
  `).all(vehicle_id).map(parseRow);

  const totalMiles = rows.reduce((s, r) => s + (r.miles || 0), 0);
  const daysOut = rows.reduce((s, r) => s + (r.days || 0), 0);
  const withDamage = rows.filter(r => r.damage && r.damage.trim()).length;

  res.json({
    outings: rows,
    summary: {
      count: rows.length,
      totalMiles,
      daysOut,
      withDamage,
      milesKnownFor: rows.filter(r => r.miles != null).length,
    },
    options: { difficulties: DIFFICULTIES, terrain: TERRAIN },
  });
});

// POST /api/outings
router.post('/', (req, res) => {
  const { user_vehicle_id } = req.body;
  if (!user_vehicle_id) return res.status(400).json({ error: 'user_vehicle_id required' });
  const data = body(req);
  if (!data.name) return res.status(400).json({ error: 'name is required' });
  if (!data.date) return res.status(400).json({ error: 'date is required' });

  const db = getDb();
  const r = db.prepare(`
    INSERT INTO outings (user_vehicle_id, ${COLS.join(', ')}, photos)
    VALUES (@user_vehicle_id, ${COLS.map(c => '@' + c).join(', ')}, '[]')
  `).run({ user_vehicle_id, ...data });

  // Keep the vehicle's odometer honest if this outing ended higher
  if (data.odometer_end) {
    db.prepare('UPDATE user_vehicles SET current_mileage = ? WHERE id = ? AND (current_mileage IS NULL OR current_mileage < ?)')
      .run(data.odometer_end, user_vehicle_id, data.odometer_end);
  }

  res.status(201).json(parseRow(db.prepare('SELECT * FROM outings WHERE id = ?').get(r.lastInsertRowid)));
});

// PUT /api/outings/:id
router.put('/:id', (req, res) => {
  const db = getDb();
  const existing = db.prepare('SELECT id FROM outings WHERE id = ?').get(req.params.id);
  if (!existing) return res.status(404).json({ error: 'Not found' });
  const data = body(req);
  if (!data.name) return res.status(400).json({ error: 'name is required' });
  if (!data.date) return res.status(400).json({ error: 'date is required' });

  db.prepare(`UPDATE outings SET ${COLS.map(c => `${c}=@${c}`).join(', ')} WHERE id=@id`)
    .run({ ...data, id: req.params.id });
  res.json(parseRow(db.prepare('SELECT * FROM outings WHERE id = ?').get(req.params.id)));
});

// DELETE /api/outings/:id
router.delete('/:id', (req, res) => {
  const db = getDb();
  const existing = db.prepare('SELECT id, photos FROM outings WHERE id = ?').get(req.params.id);
  if (!existing) return res.status(404).json({ error: 'Not found' });
  let list = [];
  try { list = JSON.parse(existing.photos || '[]'); } catch (_) { list = []; }
  for (const p of list) fs.unlink(path.join(UPLOAD_DIR, path.basename(p)), () => {});
  db.prepare('DELETE FROM outings WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
});

// ── Photos ────────────────────────────────────────────────────────────────────

router.post('/:id/photos', photoUpload.array('photos', 20), (req, res) => {
  const db = getDb();
  const existing = db.prepare('SELECT id, photos FROM outings WHERE id = ?').get(req.params.id);
  if (!existing) return res.status(404).json({ error: 'Not found' });
  if (!req.files || req.files.length === 0) return res.status(400).json({ error: 'No files uploaded' });
  const updated = [...JSON.parse(existing.photos || '[]'), ...req.files.map(f => `/uploads/${f.filename}`)];
  db.prepare('UPDATE outings SET photos = ? WHERE id = ?').run(JSON.stringify(updated), req.params.id);
  res.json({ photos: updated });
});

router.delete('/:id/photos/:filename', (req, res) => {
  const db = getDb();
  const existing = db.prepare('SELECT id, photos FROM outings WHERE id = ?').get(req.params.id);
  if (!existing) return res.status(404).json({ error: 'Not found' });
  const p = `/uploads/${path.basename(req.params.filename)}`;
  const updated = JSON.parse(existing.photos || '[]').filter(x => x !== p);
  fs.unlink(path.join(UPLOAD_DIR, path.basename(req.params.filename)), () => {});
  db.prepare('UPDATE outings SET photos = ? WHERE id = ?').run(JSON.stringify(updated), req.params.id);
  res.json({ photos: updated });
});

router.use((err, req, res, next) => {
  if (err instanceof multer.MulterError || err.message) {
    return res.status(400).json({ error: err.message });
  }
  next(err);
});

module.exports = router;
