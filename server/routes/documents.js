const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { v4: uuidv4 } = require('uuid');
const { getDb } = require('../db');

const router = express.Router();
const UPLOAD_DIR = process.env.UPLOAD_DIR || './data/uploads';

const DOC_TYPES = ['title', 'registration', 'insurance', 'bill_of_sale', 'inspection', 'manual', 'other'];

const docUpload = multer({
  storage: multer.diskStorage({
    destination: (req, file, cb) => cb(null, UPLOAD_DIR),
    filename: (req, file, cb) => cb(null, `doc-${uuidv4()}${path.extname(file.originalname).toLowerCase()}`),
  }),
  fileFilter: (req, file, cb) => {
    const allowed = ['.jpg', '.jpeg', '.png', '.webp', '.tiff', '.tif', '.pdf', '.heic'];
    const ok = allowed.includes(path.extname(file.originalname).toLowerCase());
    cb(ok ? null : new Error('Only images and PDF files are allowed'), ok);
  },
  limits: { fileSize: 50 * 1024 * 1024 },
});

// GET /api/documents?vehicle_id=X
router.get('/', (req, res) => {
  const { vehicle_id } = req.query;
  if (!vehicle_id) return res.status(400).json({ error: 'vehicle_id required' });
  const rows = getDb().prepare(`
    SELECT * FROM documents WHERE user_vehicle_id = ?
    ORDER BY CASE WHEN expires_on IS NULL THEN 1 ELSE 0 END, expires_on ASC, created_at DESC
  `).all(vehicle_id);
  res.json(rows);
});

// POST /api/documents  (multipart: file + metadata)
router.post('/', docUpload.single('file'), (req, res) => {
  const { user_vehicle_id, name, doc_type, expires_on, notes } = req.body;
  if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
  if (!user_vehicle_id) {
    fs.unlink(req.file.path, () => {});
    return res.status(400).json({ error: 'user_vehicle_id required' });
  }

  const db = getDb();
  const type = DOC_TYPES.includes(doc_type) ? doc_type : 'other';
  const label = (name || '').trim() || req.file.originalname;

  const r = db.prepare(`
    INSERT INTO documents (user_vehicle_id, name, doc_type, file_path, original_name, size_bytes, expires_on, notes)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    user_vehicle_id, label, type, `/uploads/${req.file.filename}`,
    req.file.originalname, req.file.size,
    expires_on || null, notes || ''
  );

  res.status(201).json(db.prepare('SELECT * FROM documents WHERE id = ?').get(r.lastInsertRowid));
});

// PUT /api/documents/:id — metadata only (the file itself is immutable)
router.put('/:id', (req, res) => {
  const db = getDb();
  const existing = db.prepare('SELECT id FROM documents WHERE id = ?').get(req.params.id);
  if (!existing) return res.status(404).json({ error: 'Not found' });

  const { name, doc_type, expires_on, notes } = req.body;
  const type = DOC_TYPES.includes(doc_type) ? doc_type : 'other';
  db.prepare('UPDATE documents SET name=?, doc_type=?, expires_on=?, notes=? WHERE id=?')
    .run((name || '').trim() || 'Document', type, expires_on || null, notes || '', req.params.id);
  res.json(db.prepare('SELECT * FROM documents WHERE id = ?').get(req.params.id));
});

// DELETE /api/documents/:id — removes the row and the file
router.delete('/:id', (req, res) => {
  const db = getDb();
  const existing = db.prepare('SELECT id, file_path FROM documents WHERE id = ?').get(req.params.id);
  if (!existing) return res.status(404).json({ error: 'Not found' });
  if (existing.file_path) {
    fs.unlink(path.join(UPLOAD_DIR, path.basename(existing.file_path)), () => {});
  }
  db.prepare('DELETE FROM documents WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
});

router.use((err, req, res, next) => {
  if (err instanceof multer.MulterError || err.message) {
    return res.status(400).json({ error: err.message });
  }
  next(err);
});

module.exports = router;
module.exports.DOC_TYPES = DOC_TYPES;
