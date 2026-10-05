const express = require('express');
const router = express.Router();
const { getDb } = require('../db');
const trash = require('../services/trash');
const { refreshCurrentMileage } = require('../services/odometer');

const UPLOAD_DIR = process.env.UPLOAD_DIR || './data/uploads';

// GET /api/trash — deleted records, newest first.
router.get('/', (req, res) => {
  res.json({ items: trash.list(getDb()), retentionDays: trash.RETENTION_DAYS });
});

// POST /api/trash/:id/restore — put a record back where it was.
router.post('/:id/restore', (req, res) => {
  const db = getDb();
  try {
    const restored = trash.restore(db, Number(req.params.id));
    if (restored.userVehicleId) refreshCurrentMileage(db, restored.userVehicleId);
    res.json({ ok: true, restored });
  } catch (err) {
    if (err instanceof trash.RestoreError) return res.status(409).json({ error: err.message });
    throw err;
  }
});

// DELETE /api/trash/:id — delete one item for good, with its files.
router.delete('/:id', (req, res) => {
  const result = trash.purge(getDb(), UPLOAD_DIR, { id: Number(req.params.id) });
  if (!result.purged) return res.status(404).json({ error: 'Not found' });
  res.json({ ok: true, ...result });
});

// DELETE /api/trash — empty the trash.
router.delete('/', (req, res) => {
  res.json({ ok: true, ...trash.purge(getDb(), UPLOAD_DIR) });
});

module.exports = router;
