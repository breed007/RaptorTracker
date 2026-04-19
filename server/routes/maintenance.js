const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { v4: uuidv4 } = require('uuid');
const { getDb } = require('../db');

const UPLOAD_DIR = process.env.UPLOAD_DIR || './data/uploads';
const router = express.Router();

const attachmentStorage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, UPLOAD_DIR),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    cb(null, `maint-${uuidv4()}${ext}`);
  },
});

const attachmentUpload = multer({
  storage: attachmentStorage,
  fileFilter: (req, file, cb) => {
    const allowed = ['.jpg', '.jpeg', '.png', '.webp', '.tiff', '.tif', '.pdf'];
    const ext = path.extname(file.originalname).toLowerCase();
    if (allowed.includes(ext)) return cb(null, true);
    cb(new Error('Only images (JPEG, PNG, WEBP, TIFF) and PDF files are allowed'), false);
  },
  limits: { fileSize: 20 * 1024 * 1024 },
});

function parseRow(r) {
  return { ...r, attachments: JSON.parse(r.attachments || '[]') };
}

router.get('/', (req, res) => {
  const db = getDb();
  const { vehicle_id } = req.query;
  if (!vehicle_id) return res.status(400).json({ error: 'vehicle_id required' });
  const rows = db.prepare(
    'SELECT * FROM maintenance_log WHERE user_vehicle_id = ? ORDER BY date_performed DESC'
  ).all(vehicle_id);
  res.json(rows.map(parseRow));
});

router.post('/', (req, res) => {
  const db = getDb();
  const { user_vehicle_id, service_type, date_performed, mileage, cost, vendor, notes } = req.body;
  if (!user_vehicle_id || !service_type || !date_performed) {
    return res.status(400).json({ error: 'user_vehicle_id, service_type, and date_performed are required' });
  }
  const result = db.prepare(`
    INSERT INTO maintenance_log (user_vehicle_id, service_type, date_performed, mileage, cost, vendor, notes, attachments)
    VALUES (?,?,?,?,?,?,?,'[]')
  `).run(user_vehicle_id, service_type, date_performed,
         mileage ? parseInt(mileage) : null,
         cost != null ? parseFloat(cost) : null,
         vendor || null, notes || null);
  const created = db.prepare('SELECT * FROM maintenance_log WHERE id = ?').get(result.lastInsertRowid);
  res.status(201).json(parseRow(created));
});

router.put('/:id', (req, res) => {
  const db = getDb();
  const existing = db.prepare('SELECT id FROM maintenance_log WHERE id = ?').get(req.params.id);
  if (!existing) return res.status(404).json({ error: 'Not found' });
  const { service_type, date_performed, mileage, cost, vendor, notes } = req.body;
  db.prepare(`
    UPDATE maintenance_log SET service_type=?, date_performed=?, mileage=?, cost=?, vendor=?, notes=?
    WHERE id=?
  `).run(service_type, date_performed,
         mileage ? parseInt(mileage) : null,
         cost != null ? parseFloat(cost) : null,
         vendor || null, notes || null, req.params.id);
  res.json({ ok: true });
});

router.delete('/:id', (req, res) => {
  const db = getDb();
  const existing = db.prepare('SELECT id, attachments FROM maintenance_log WHERE id = ?').get(req.params.id);
  if (!existing) return res.status(404).json({ error: 'Not found' });
  // Clean up attachment files
  const attachments = JSON.parse(existing.attachments || '[]');
  for (const p of attachments) {
    fs.unlink(path.join(UPLOAD_DIR, path.basename(p)), () => {});
  }
  db.prepare('DELETE FROM maintenance_log WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
});

// ── Attachments ───────────────────────────────────────────────────────────────

router.post('/:id/attachments', attachmentUpload.array('attachments', 10), (req, res) => {
  const db = getDb();
  const existing = db.prepare('SELECT id, attachments FROM maintenance_log WHERE id = ?').get(req.params.id);
  if (!existing) return res.status(404).json({ error: 'Not found' });
  if (!req.files || req.files.length === 0) return res.status(400).json({ error: 'No files uploaded' });

  const current = JSON.parse(existing.attachments || '[]');
  const added = req.files.map(f => `/uploads/${f.filename}`);
  const updated = [...current, ...added];

  db.prepare('UPDATE maintenance_log SET attachments = ? WHERE id = ?')
    .run(JSON.stringify(updated), req.params.id);
  res.json({ attachments: updated });
});

router.delete('/:id/attachments/:filename', (req, res) => {
  const db = getDb();
  const existing = db.prepare('SELECT id, attachments FROM maintenance_log WHERE id = ?').get(req.params.id);
  if (!existing) return res.status(404).json({ error: 'Not found' });

  const filePath = `/uploads/${req.params.filename}`;
  const current = JSON.parse(existing.attachments || '[]');
  const updated = current.filter(p => p !== filePath);

  fs.unlink(path.join(UPLOAD_DIR, req.params.filename), () => {});
  db.prepare('UPDATE maintenance_log SET attachments = ? WHERE id = ?')
    .run(JSON.stringify(updated), req.params.id);
  res.json({ attachments: updated });
});

router.use((err, req, res, next) => {
  if (err instanceof multer.MulterError || err.message) {
    return res.status(400).json({ error: err.message });
  }
  next(err);
});

module.exports = router;
