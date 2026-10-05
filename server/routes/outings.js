const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { randomUUID: uuidv4 } = require('crypto');
const { getDb } = require('../db');
const trash = require('../services/trash');
const { jsonList } = require('../lib/json');
const { checkReading, refreshCurrentMileage } = require('../services/odometer');
const { detachUpload } = require('../services/uploads');

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
  return { ...r, photos: jsonList(r.photos), miles, days };
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

// An outing carries two readings. An end below the start is its own mistake;
// otherwise each reading is checked against the rest of the vehicle's history.
function outingWarning(db, vehicleId, data, id) {
  if (data.odometer_start && data.odometer_end && data.odometer_end < data.odometer_start) {
    return `The ending odometer (${data.odometer_end.toLocaleString('en-US')}) is lower than the starting one ` +
      `(${data.odometer_start.toLocaleString('en-US')}). Saved anyway.`;
  }
  const self = { source: 'outings', id };
  return checkReading(db, vehicleId, { date: data.date, odometer: data.odometer_start, self })
    || checkReading(db, vehicleId, { date: data.end_date || data.date, odometer: data.odometer_end, self });
}

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

  const warning = outingWarning(db, user_vehicle_id, data, r.lastInsertRowid);
  refreshCurrentMileage(db, user_vehicle_id);
  res.status(201).json({ ...parseRow(db.prepare('SELECT * FROM outings WHERE id = ?').get(r.lastInsertRowid)), odometerWarning: warning });
});

// PUT /api/outings/:id
router.put('/:id', (req, res) => {
  const db = getDb();
  const existing = db.prepare('SELECT id, user_vehicle_id FROM outings WHERE id = ?').get(req.params.id);
  if (!existing) return res.status(404).json({ error: 'Not found' });
  const data = body(req);
  if (!data.name) return res.status(400).json({ error: 'name is required' });
  if (!data.date) return res.status(400).json({ error: 'date is required' });

  db.prepare(`UPDATE outings SET ${COLS.map(c => `${c}=@${c}`).join(', ')} WHERE id=@id`)
    .run({ ...data, id: req.params.id });
  const warning = outingWarning(db, existing.user_vehicle_id, data, req.params.id);
  refreshCurrentMileage(db, existing.user_vehicle_id);
  res.json({ ...parseRow(db.prepare('SELECT * FROM outings WHERE id = ?').get(req.params.id)), odometerWarning: warning });
});

// DELETE /api/outings/:id
router.delete('/:id', (req, res) => {
  const db = getDb();
  const existing = db.prepare('SELECT id, user_vehicle_id, name FROM outings WHERE id = ?').get(req.params.id);
  if (!existing) return res.status(404).json({ error: 'Not found' });
  const trashed = trash.moveToTrash(db, 'outings', existing.id, { kind: 'Outing', title: existing.name });
  refreshCurrentMileage(db, existing.user_vehicle_id);
  res.json({ ok: true, trashed });
});

// ── Photos ────────────────────────────────────────────────────────────────────

router.post('/:id/photos', photoUpload.array('photos', 20), (req, res) => {
  const db = getDb();
  const existing = db.prepare('SELECT id, photos FROM outings WHERE id = ?').get(req.params.id);
  if (!existing) return res.status(404).json({ error: 'Not found' });
  if (!req.files || req.files.length === 0) return res.status(400).json({ error: 'No files uploaded' });
  const updated = [...jsonList(existing.photos), ...req.files.map(f => `/uploads/${f.filename}`)];
  db.prepare('UPDATE outings SET photos = ? WHERE id = ?').run(JSON.stringify(updated), req.params.id);
  res.json({ photos: updated });
});

router.delete('/:id/photos/:filename', (req, res) => {
  const db = getDb();
  const existing = db.prepare('SELECT id, photos FROM outings WHERE id = ?').get(req.params.id);
  if (!existing) return res.status(404).json({ error: 'Not found' });
  const updated = detachUpload(UPLOAD_DIR, jsonList(existing.photos), req.params.filename);
  if (!updated) return res.status(404).json({ error: 'That photo is not on this outing' });
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
