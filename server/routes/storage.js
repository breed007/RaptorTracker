const express = require('express');
const fs = require('fs');
const path = require('path');
const router = express.Router();
const { getDb, DB_PATH, DATA_DIR } = require('../db');
const { orphanedFiles, removeUnreferenced } = require('../services/uploadRefs');

const UPLOAD_DIR = process.env.UPLOAD_DIR || './data/uploads';

function dirBytes(dir) {
  if (!fs.existsSync(dir)) return 0;
  let total = 0;
  for (const d of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, d.name);
    total += d.isDirectory() ? dirBytes(p) : fs.statSync(p).size;
  }
  return total;
}

const fileBytes = (p) => { try { return fs.statSync(p).size; } catch (_) { return 0; } };

// GET /api/storage — where the disk space goes, and what can be reclaimed.
// Worth knowing on a Raspberry Pi with a 32 GB card.
router.get('/', (req, res) => {
  const orphans = orphanedFiles(getDb(), UPLOAD_DIR);
  res.json({
    database: fileBytes(DB_PATH) + fileBytes(`${DB_PATH}-wal`),
    uploads: dirBytes(UPLOAD_DIR),
    backups: dirBytes(path.join(DATA_DIR, 'backups')),
    orphans: { count: orphans.length, bytes: orphans.reduce((s, o) => s + o.bytes, 0), files: orphans.slice(0, 200) },
  });
});

// POST /api/storage/clean — delete files in uploads/ that no record uses.
router.post('/clean', (req, res) => {
  const db = getDb();
  const names = orphanedFiles(db, UPLOAD_DIR).map(o => o.name);
  const removed = removeUnreferenced(db, UPLOAD_DIR, names);
  res.json({ ok: true, removed });
});

// ── Shrinking photos that were uploaded full-size ─────────────────────────────
// Photos are resized in the browser on upload from 1.0 on; older ones are
// often 5-12 MB each. The browser does the resizing here too (no image library
// on the server): it lists the large JPEGs, resizes each, and sends the
// smaller version back to replace the original.

const SHRINKABLE = /\.(jpe?g)$/i;
const LARGE = 2 * 1024 * 1024;

// GET /api/storage/large-photos — JPEGs in use that are larger than 2 MB.
router.get('/large-photos', (req, res) => {
  const { referencedFiles } = require('../services/uploadRefs');
  const used = referencedFiles(getDb());
  const files = [];
  for (const name of used) {
    if (!SHRINKABLE.test(name)) continue;
    const bytes = fileBytes(path.join(UPLOAD_DIR, name));
    if (bytes > LARGE) files.push({ name, bytes });
  }
  files.sort((a, b) => b.bytes - a.bytes);
  res.json({ count: files.length, bytes: files.reduce((n, f) => n + f.bytes, 0), files });
});

// PUT /api/storage/photos/:name — replace a photo with a smaller JPEG of it.
router.put('/photos/:name', express.raw({ type: 'image/jpeg', limit: '25mb' }), (req, res) => {
  const name = path.basename(req.params.name);
  if (name !== req.params.name || !SHRINKABLE.test(name)) return res.status(400).json({ error: 'Not a photo this can replace' });
  const target = path.join(UPLOAD_DIR, name);
  const before = fileBytes(target);
  if (!before) return res.status(404).json({ error: 'Not found' });
  const body = req.body;
  if (!Buffer.isBuffer(body) || body.length < 4 || body[0] !== 0xFF || body[1] !== 0xD8) {
    return res.status(400).json({ error: 'The replacement must be a JPEG image' });
  }
  if (body.length >= before) return res.json({ ok: true, replaced: false, before, after: before });
  const tmp = `${target}.shrinking`;
  fs.writeFileSync(tmp, body);
  fs.renameSync(tmp, target);
  res.json({ ok: true, replaced: true, before, after: body.length });
});

module.exports = router;
