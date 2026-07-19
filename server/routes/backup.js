const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const AdmZip = require('adm-zip');
const Database = require('better-sqlite3');
const { getDb, closeDb, DB_PATH, DATA_DIR } = require('../db');
const { pipeBackupTo, listBackups, runScheduledBackup, BACKUP_DIR } = require('../services/backupArchive');
const { getAllSettings, setSetting } = require('../services/settings');

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
  const dateStr = new Date().toISOString().slice(0, 10);
  res.setHeader('Content-Type', 'application/zip');
  res.setHeader('Content-Disposition', `attachment; filename="raptortracker-backup-${dateStr}.zip"`);
  pipeBackupTo(res).catch((err) => {
    if (!res.headersSent) res.status(500).json({ error: err.message });
    else res.destroy(err);
  });
});

// ── Scheduled backups ─────────────────────────────────────────────────────────

// GET /api/backup/settings
router.get('/settings', (req, res) => {
  const s = getAllSettings();
  res.json({
    enabled: s.backup_enabled === 'true',
    hour: parseInt(s.backup_hour || '3', 10),
    keep: parseInt(s.backup_keep || '7', 10),
    backups: listBackups(),
  });
});

// PUT /api/backup/settings
router.put('/settings', (req, res) => {
  const { enabled, hour, keep } = req.body;
  if (enabled != null) setSetting('backup_enabled', enabled ? 'true' : 'false');
  if (hour != null) {
    const h = parseInt(hour, 10);
    if (!isNaN(h) && h >= 0 && h <= 23) setSetting('backup_hour', String(h));
  }
  if (keep != null) {
    const k = parseInt(keep, 10);
    if (!isNaN(k) && k >= 1 && k <= 90) setSetting('backup_keep', String(k));
  }
  const s = getAllSettings();
  res.json({
    enabled: s.backup_enabled === 'true',
    hour: parseInt(s.backup_hour || '3', 10),
    keep: parseInt(s.backup_keep || '7', 10),
    backups: listBackups(),
  });
});

// POST /api/backup/run — take a scheduled-style backup right now
router.post('/run', async (req, res) => {
  try {
    const keep = parseInt(getAllSettings().backup_keep || '7', 10);
    const result = await runScheduledBackup(keep);
    res.json({ ok: true, ...result, backups: listBackups() });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/backup/file/:name — download a stored backup
router.get('/file/:name', (req, res) => {
  const name = path.basename(req.params.name); // never allow traversal
  if (!name.endsWith('.zip')) return res.status(400).json({ error: 'Invalid backup file' });
  const full = path.join(BACKUP_DIR, name);
  if (!fs.existsSync(full)) return res.status(404).json({ error: 'Not found' });
  res.download(full, name);
});

// DELETE /api/backup/file/:name
router.delete('/file/:name', (req, res) => {
  const name = path.basename(req.params.name);
  const full = path.join(BACKUP_DIR, name);
  if (!name.endsWith('.zip') || !fs.existsSync(full)) return res.status(404).json({ error: 'Not found' });
  fs.unlinkSync(full);
  res.json({ ok: true, backups: listBackups() });
});

// POST /api/restore — replace the database and uploads from a backup ZIP
router.post('/restore', restoreUpload.single('backup'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No backup file uploaded' });

  const uploadedZipPath = req.file.path;
  const tmpDbPath = path.join(DATA_DIR, `restore-tmp-${Date.now()}.db`);
  const dbSnapshot = `${DB_PATH}.pre-restore`;
  const uploadsSnapshot = `${UPLOAD_DIR}.pre-restore`;
  const cleanup = () => { try { fs.unlinkSync(uploadedZipPath); } catch (_) {} };

  try {
    const zip = new AdmZip(uploadedZipPath);
    const entries = zip.getEntries();
    const dbEntry = entries.find(e => e.entryName === 'raptortracker.db' || e.entryName.endsWith('/raptortracker.db'));
    if (!dbEntry) {
      cleanup();
      return res.status(400).json({ error: 'Not a valid RaptorTracker backup (raptortracker.db not found in archive).' });
    }

    // 1) Write the candidate DB to a temp file and validate it BEFORE touching anything live
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

    // 2) Snapshot the CURRENT database first, so a mid-restore crash is always recoverable.
    //    Flush the WAL into the main file, close the handle, then copy it aside.
    try { getDb().pragma('wal_checkpoint(TRUNCATE)'); } catch (_) {}
    closeDb();
    try { fs.rmSync(dbSnapshot, { force: true }); } catch (_) {}
    if (fs.existsSync(DB_PATH)) fs.copyFileSync(DB_PATH, dbSnapshot);

    // 3) Remove the stale (checkpointed) WAL/SHM, then ATOMICALLY replace the db file.
    //    A rename over an existing file is atomic on the same filesystem, so at every
    //    instant DB_PATH holds either the old or the new database — never nothing.
    for (const suffix of ['-wal', '-shm']) {
      try { fs.unlinkSync(DB_PATH + suffix); } catch (_) {}
    }
    fs.renameSync(tmpDbPath, DB_PATH);

    // 4) Reconcile uploads: move the current set aside (recoverable) and extract a clean
    //    set from the backup, so the restore is a faithful snapshot with no orphans.
    try { fs.rmSync(uploadsSnapshot, { recursive: true, force: true }); } catch (_) {}
    if (fs.existsSync(UPLOAD_DIR)) { try { fs.renameSync(UPLOAD_DIR, uploadsSnapshot); } catch (_) {} }
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
    res.json({ ok: true, restoredFiles, snapshot: path.basename(dbSnapshot) });
  } catch (err) {
    try { fs.unlinkSync(tmpDbPath); } catch (_) {}
    cleanup();
    res.status(500).json({ error: `Restore failed: ${err.message}. Your previous data was snapshotted to ${path.basename(dbSnapshot)}.` });
  }
});

router.use((err, req, res, next) => {
  if (err instanceof multer.MulterError || err.message) {
    return res.status(400).json({ error: err.message });
  }
  next(err);
});

module.exports = router;
