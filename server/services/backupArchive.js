// Single source of truth for what a backup contains, shared by the on-demand
// download route and the scheduled backup job.
const fs = require('fs');
const path = require('path');
const archiver = require('archiver');
const { storeInZip } = require('./uploads');
const { getDb, DB_PATH, DATA_DIR } = require('../db');

const UPLOAD_DIR = process.env.UPLOAD_DIR || './data/uploads';
const BACKUP_DIR = path.join(DATA_DIR, 'backups');

// Stream a full backup (database + uploads) into any writable stream.
//
// The database goes in as a snapshot taken with SQLite's online backup API,
// so it's consistent even if the app writes while the ZIP is being built;
// zipping the live file could catch a write halfway.
async function pipeBackupTo(outStream) {
  let snapshot = null;
  // A crash mid-backup could leave a snapshot behind; clear any over an hour old.
  for (const n of fs.existsSync(DATA_DIR) ? fs.readdirSync(DATA_DIR) : []) {
    if (!n.startsWith('.backup-snapshot-')) continue;
    const p = path.join(DATA_DIR, n);
    try { if (Date.now() - fs.statSync(p).mtimeMs > 3600 * 1000) fs.rmSync(p, { force: true }); } catch (_) { /* gone */ }
  }
  if (fs.existsSync(DB_PATH)) {
    snapshot = path.join(DATA_DIR, `.backup-snapshot-${process.pid}-${Date.now()}.db`);
    await getDb().backup(snapshot);
  }
  const cleanup = () => { if (snapshot) { try { fs.rmSync(snapshot, { force: true }); } catch (_) { /* gone */ } snapshot = null; } };
  return new Promise((resolve, reject) => {
    const done = (err) => { cleanup(); if (err) reject(err); else resolve(); };
    const archive = archiver('zip', { zlib: { level: 6 } });
    archive.on('error', done);
    outStream.on('error', done);
    outStream.on('close', () => done());
    outStream.on('finish', () => done());

    archive.pipe(outStream);
    if (snapshot) archive.file(snapshot, { name: 'raptortracker.db' });
    if (fs.existsSync(UPLOAD_DIR)) archive.directory(UPLOAD_DIR, 'uploads', entry => ({ ...entry, store: storeInZip(entry.name) }));
    archive.append(
      JSON.stringify({ created: new Date().toISOString(), kind: 'raptortracker-backup', version: 1 }, null, 2),
      { name: 'backup-manifest.json' }
    );
    archive.finalize();
  });
}

function listBackups() {
  if (!fs.existsSync(BACKUP_DIR)) return [];
  return fs.readdirSync(BACKUP_DIR)
    .filter(f => f.endsWith('.zip'))
    .map(f => {
      const st = fs.statSync(path.join(BACKUP_DIR, f));
      return { name: f, size: st.size, mtime: st.mtime.toISOString() };
    })
    .sort((a, b) => (a.mtime < b.mtime ? 1 : -1)); // newest first
}

// Write a backup to disk and prune old ones, keeping the newest `keep`.
async function runScheduledBackup(keep = 7) {
  fs.mkdirSync(BACKUP_DIR, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const name = `raptortracker-backup-${stamp}.zip`;
  await pipeBackupTo(fs.createWriteStream(path.join(BACKUP_DIR, name)));

  let removed = 0;
  for (const old of listBackups().slice(Math.max(1, keep))) {
    try { fs.unlinkSync(path.join(BACKUP_DIR, old.name)); removed++; } catch (_) { /* ignore */ }
  }
  return { name, removed };
}

module.exports = { pipeBackupTo, listBackups, runScheduledBackup, BACKUP_DIR };
