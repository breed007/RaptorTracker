const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const archiver = require('archiver');
const AdmZip = require('adm-zip');
const Database = require('better-sqlite3');
const { getDb, closeDb, DB_PATH, DATA_DIR } = require('../db');

const router = express.Router();
const UPLOAD_DIR = process.env.UPLOAD_DIR || './data/uploads';

// Store the uploaded restore archive to disk (can be large), then read it.
const restoreUpload = multer({
  storage: multer.diskStorage({
    destination: (req, file, cb) => cb(null, DATA_DIR),
    filename: (req, file, cb) => cb(null, `restore-upload-${Date.now()}.zip`),
  }),
  fileFilter: (req, file, cb) => {
    const ok = file.originalname.toLowerCase().endsWith('.zip');
    cb(ok ? null : new Error('Backup must be a .zip file'), ok);
  },
  limits: { fileSize: 2 * 1024 * 1024 * 1024 }, // 2 GB
});

// GET /api/backup — download a full snapshot (database + uploads) as a ZIP
router.get('/', (req, res) => {
  // Flush the WAL into the main db file so the snapshot is consistent
  try { getDb().pragma('wal_checkpoint(TRUNCATE)'); } catch (_) { /* ignore */ }

  const dateStr = new Date().toISOString().slice(0, 10);
  res.setHeader('Content-Type', 'application/zip');
  res.setHeader('Content-Disposition', `attachment; filename="raptortracker-backup-${dateStr}.zip"`);

  const archive = archiver('zip', { zlib: { level: 9 } });
  archive.on('error', (err) => {
    if (!res.headersSent) res.status(500).json({ error: err.message });
    else res.destroy(err);
  });
  archive.pipe(res);

  if (fs.existsSync(DB_PATH)) archive.file(DB_PATH, { name: 'raptortracker.db' });
  if (fs.existsSync(UPLOAD_DIR)) archive.directory(UPLOAD_DIR, 'uploads');
  archive.append(JSON.stringify({ created: new Date().toISOString(), kind: 'raptortracker-backup', version: 1 }, null, 2), { name: 'backup-manifest.json' });

  archive.finalize();
});

// POST /api/restore — replace the database and uploads from a backup ZIP
router.post('/restore', restoreUpload.single('backup'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No backup file uploaded' });

  const uploadedZipPath = req.file.path;
  const tmpDbPath = path.join(DATA_DIR, `restore-tmp-${Date.now()}.db`);
  const cleanup = () => { try { fs.unlinkSync(uploadedZipPath); } catch (_) {} };

  try {
    const zip = new AdmZip(uploadedZipPath);
    const entries = zip.getEntries();
    const dbEntry = entries.find(e => e.entryName === 'raptortracker.db' || e.entryName.endsWith('/raptortracker.db'));
    if (!dbEntry) {
      cleanup();
      return res.status(400).json({ error: 'Not a valid RaptorTracker backup (raptortracker.db not found in archive).' });
    }

    // Write the candidate DB to a temp file and validate it before swapping
    fs.writeFileSync(tmpDbPath, dbEntry.getData());
    try {
      const test = new Database(tmpDbPath, { readonly: true });
      // Will throw if this isn't a RaptorTracker database
      test.prepare('SELECT COUNT(*) AS c FROM user_vehicles').get();
      test.close();
    } catch (e) {
      try { fs.unlinkSync(tmpDbPath); } catch (_) {}
      cleanup();
      return res.status(400).json({ error: 'The archive does not contain a valid RaptorTracker database.' });
    }

    // Swap the database: close the live handle, remove db + WAL/SHM, move temp in
    closeDb();
    for (const suffix of ['', '-wal', '-shm']) {
      try { fs.unlinkSync(DB_PATH + suffix); } catch (_) {}
    }
    fs.renameSync(tmpDbPath, DB_PATH);

    // Restore uploads (overwrite by basename; leaves any extra existing files alone)
    fs.mkdirSync(UPLOAD_DIR, { recursive: true });
    let restoredFiles = 0;
    for (const entry of entries) {
      if (entry.isDirectory) continue;
      if (entry.entryName.startsWith('uploads/')) {
        const base = path.basename(entry.entryName);
        if (!base) continue;
        fs.writeFileSync(path.join(UPLOAD_DIR, base), entry.getData());
        restoredFiles++;
      }
    }

    cleanup();
    // Re-open immediately so migrations run against the restored DB
    getDb();
    res.json({ ok: true, restoredFiles });
  } catch (err) {
    try { fs.unlinkSync(tmpDbPath); } catch (_) {}
    cleanup();
    res.status(500).json({ error: `Restore failed: ${err.message}` });
  }
});

router.use((err, req, res, next) => {
  if (err instanceof multer.MulterError || err.message) {
    return res.status(400).json({ error: err.message });
  }
  next(err);
});

module.exports = router;
