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

module.exports = router;
