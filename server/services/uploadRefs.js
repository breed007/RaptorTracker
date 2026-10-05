/**
 * Every place a record can point at a file in uploads/, in one list.
 *
 * Used when a vehicle is deleted (its files go with it — including the
 * registration and insurance scans the owner expects to be gone) and by the
 * storage cleanup that finds files nothing references any more. Older
 * versions left those behind on every delete, and on a Raspberry Pi's SD card
 * that adds up.
 */
const fs = require('fs');
const path = require('path');
const { jsonList } = require('../lib/json');

// [table, column, kind] — kind 'list' is a JSON array of /uploads/... paths.
const REFS = [
  ['user_vehicles', 'vehicle_photos', 'list'],
  ['user_vehicles', 'profile_photo', 'single'],
  ['user_vehicles', 'window_sticker', 'single'],
  ['mods', 'photos', 'list'],
  ['mods', 'attachments', 'list'],
  ['maintenance_log', 'attachments', 'list'],
  ['outings', 'photos', 'list'],
  ['documents', 'file_path', 'single'],
];

const baseName = (p) => (p ? path.basename(String(p)) : null);

function tableHas(db, table, column) {
  return db.prepare(`PRAGMA table_info(${table})`).all().some(c => c.name === column);
}

/** File names referenced by one vehicle's records (or by every record when vehicleId is null). */
function referencedFiles(db, vehicleId = null) {
  const names = new Set();
  for (const [table, column, kind] of REFS) {
    if (!tableHas(db, table, column)) continue;
    const owner = table === 'user_vehicles' ? 'id' : 'user_vehicle_id';
    const rows = vehicleId == null
      ? db.prepare(`SELECT ${column} AS v FROM ${table}`).all()
      : db.prepare(`SELECT ${column} AS v FROM ${table} WHERE ${owner} = ?`).all(vehicleId);
    for (const { v } of rows) {
      const list = kind === 'list' ? jsonList(v) : [v];
      for (const p of list) { const b = baseName(p); if (b) names.add(b); }
    }
  }
  // Records in the trash still own their files until the trash is emptied.
  if (vehicleId == null) for (const f of require('./trash').trashedFiles(db)) names.add(f);
  return names;
}

/**
 * Delete files that were referenced by records just removed, skipping any
 * another record still points at (older mod imports could share a file).
 * Returns the number removed.
 */
function removeUnreferenced(db, uploadDir, candidates) {
  const stillUsed = referencedFiles(db);
  let removed = 0;
  for (const name of candidates) {
    if (stillUsed.has(name)) continue;
    try { fs.unlinkSync(path.join(uploadDir, name)); removed++; } catch (_) { /* already gone */ }
  }
  return removed;
}

/** Files sitting in uploads/ that no record references. */
function orphanedFiles(db, uploadDir) {
  if (!fs.existsSync(uploadDir)) return [];
  const used = referencedFiles(db);
  return fs.readdirSync(uploadDir, { withFileTypes: true })
    .filter(d => d.isFile() && !d.name.startsWith('.') && !used.has(d.name))
    .map(d => {
      const st = fs.statSync(path.join(uploadDir, d.name));
      return { name: d.name, bytes: st.size, modified: st.mtime.toISOString() };
    });
}

module.exports = { REFS, referencedFiles, removeUnreferenced, orphanedFiles };
