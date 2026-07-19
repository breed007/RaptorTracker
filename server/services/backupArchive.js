// Single source of truth for what a backup contains, shared by the on-demand
// download route and the scheduled backup job.
const fs = require('fs');
const path = require('path');
const archiver = require('archiver');
const { getDb, DB_PATH, DATA_DIR } = require('../db');

const UPLOAD_DIR = process.env.UPLOAD_DIR || './data/uploads';
const BACKUP_DIR = path.join(DATA_DIR, 'backups');

// Stream a full backup (database + uploads) into any writable stream.
function pipeBackupTo(outStream) {
  return new Promise((resolve, reject) => {
    // Flush the WAL into the main db file so the snapshot is consistent
    try { getDb().pragma('wal_checkpoint(TRUNCATE)'); } catch (_) { /* ignore */ }

    const archive = archiver('zip', { zlib: { level: 9 } });
    archive.on('error', reject);
    outStream.on('error', reject);
    outStream.on('close', resolve);
    outStream.on('finish', resolve);

    archive.pipe(outStream);
    if (fs.existsSync(DB_PATH)) archive.file(DB_PATH, { name: 'raptortracker.db' });
    if (fs.existsSync(UPLOAD_DIR)) archive.directory(UPLOAD_DIR, 'uploads');
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
