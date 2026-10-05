/**
 * Trash: deletes that can be undone.
 *
 * Deleting a record copies it, and everything that would cascade with it, into
 * the trash table as JSON, then deletes it for real. Every other query in the
 * app keeps working unchanged, because trashed rows are simply gone from their
 * tables. Files stay on disk while the record sits in the trash (uploadRefs
 * counts them as in use) and go when the trash is emptied or the item ages
 * out after RETENTION_DAYS.
 *
 * The cascade is read from the schema (PRAGMA foreign_key_list), so a table
 * added later is covered without touching this file.
 */
const { REFS } = require('./uploadRefs');
const { jsonList, jsonObject } = require('../lib/json');

const RETENTION_DAYS = 30;
const NOT_TRASHABLE = new Set(['trash', 'app_settings', 'sent_reminders', 'vehicles']);

function ensureTable(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS trash (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      kind TEXT NOT NULL,
      title TEXT NOT NULL,
      table_name TEXT NOT NULL,
      record_id INTEGER NOT NULL,
      user_vehicle_id INTEGER,
      vehicle_name TEXT,
      payload TEXT NOT NULL,
      files TEXT NOT NULL DEFAULT '[]',
      deleted_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `);
}

const tables = (db) => db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%'")
  .all().map(r => r.name).filter(n => !NOT_TRASHABLE.has(n));
const columns = (db, table) => db.prepare(`PRAGMA table_info(${table})`).all().map(c => c.name);
const foreignKeys = (db, table) => db.prepare(`PRAGMA foreign_key_list(${table})`).all();

/** For each parent table, the tables that point at it and what happens on delete. */
function childMap(db) {
  const map = {};
  for (const t of tables(db)) {
    for (const fk of foreignKeys(db, t)) {
      (map[fk.table] ||= []).push({ table: t, column: fk.from, parentColumn: fk.to || 'id', onDelete: fk.on_delete });
    }
  }
  return map;
}

/** The rows a delete of table/id would take with it, parent first, plus links it would null out. */
function collect(db, table, id) {
  const children = childMap(db);
  const rows = [];
  const relinks = [];
  const walk = (t, where, params) => {
    const found = db.prepare(`SELECT * FROM ${t} WHERE ${where}`).all(...params);
    for (const row of found) {
      rows.push({ table: t, row });
      for (const c of children[t] || []) {
        const key = row[c.parentColumn];
        if (c.onDelete === 'CASCADE') {
          walk(c.table, `${c.column} = ?`, [key]);
        } else if (c.onDelete === 'SET NULL') {
          for (const r of db.prepare(`SELECT id FROM ${c.table} WHERE ${c.column} = ?`).all(key)) {
            relinks.push({ table: c.table, id: r.id, column: c.column, parentTable: t, value: key });
          }
        }
      }
    }
  };
  walk(table, 'id = ?', [id]);
  return { rows, relinks };
}

function filesIn(rows) {
  const names = new Set();
  for (const { table, row } of rows) {
    for (const [t, col, kind] of REFS) {
      if (t !== table || row[col] == null) continue;
      for (const p of kind === 'list' ? jsonList(row[col]) : [row[col]]) {
        const base = p && String(p).split('/').pop();
        if (base) names.add(base);
      }
    }
  }
  return [...names];
}

/**
 * Move one record (and what cascades from it) to the trash, then delete it.
 * Returns the trash entry, or null if the record doesn't exist.
 */
function moveToTrash(db, table, id, { kind, title }) {
  ensureTable(db);
  const { rows, relinks } = collect(db, table, id);
  if (!rows.length) return null;
  const top = rows[0].row;
  const vehicleId = table === 'user_vehicles' ? top.id : top.user_vehicle_id ?? null;
  const vehicle = vehicleId ? db.prepare('SELECT nickname FROM user_vehicles WHERE id = ?').get(vehicleId) : null;
  let entry;
  db.transaction(() => {
    const info = db.prepare(`
      INSERT INTO trash (kind, title, table_name, record_id, user_vehicle_id, vehicle_name, payload, files)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)`).run(
      kind, String(title || kind).slice(0, 200), table, id, vehicleId, vehicle?.nickname || null,
      JSON.stringify({ rows, relinks }), JSON.stringify(filesIn(rows)));
    db.prepare(`DELETE FROM ${table} WHERE id = ?`).run(id);
    entry = { id: Number(info.lastInsertRowid), kind, title, count: rows.length };
  })();
  return entry;
}

class RestoreError extends Error {}

/**
 * Put a trashed record back. Ids are kept when they're still free; if one has
 * been taken since, the row gets a new id and its children are pointed at it.
 * Returns { table, id, userVehicleId }.
 */
function restore(db, trashId) {
  ensureTable(db);
  const entry = db.prepare('SELECT * FROM trash WHERE id = ?').get(trashId);
  if (!entry) throw new RestoreError('That item is no longer in the trash.');
  const { rows = [], relinks = [] } = jsonObject(entry.payload);
  if (entry.table_name !== 'user_vehicles' && entry.user_vehicle_id &&
      !db.prepare('SELECT 1 FROM user_vehicles WHERE id = ?').get(entry.user_vehicle_id)) {
    throw new RestoreError(`Its vehicle${entry.vehicle_name ? ` (${entry.vehicle_name})` : ''} is gone. Restore the vehicle first.`);
  }

  const idMap = {};   // table -> { oldId: newId }
  let restoredId = null;
  db.transaction(() => {
    for (const { table, row } of rows) {
      const cols = new Set(columns(db, table));
      if (!cols.size) continue; // a table removed by a later version
      const data = {};
      for (const [k, v] of Object.entries(row)) if (cols.has(k)) data[k] = v;
      for (const fk of foreignKeys(db, table)) {
        const moved = idMap[fk.table]?.[data[fk.from]];
        if (moved != null) data[fk.from] = moved;
      }
      const oldId = data.id;
      if (oldId != null && db.prepare(`SELECT 1 FROM ${table} WHERE id = ?`).get(oldId)) delete data.id;
      const keys = Object.keys(data);
      const info = db.prepare(`INSERT INTO ${table} (${keys.join(', ')}) VALUES (${keys.map(() => '?').join(', ')})`)
        .run(...keys.map(k => data[k]));
      const newId = data.id ?? Number(info.lastInsertRowid);
      (idMap[table] ||= {})[oldId] = newId;
      if (restoredId == null) restoredId = newId;
    }
    for (const r of relinks) {
      const value = idMap[r.parentTable]?.[r.value] ?? r.value;
      db.prepare(`UPDATE ${r.table} SET ${r.column} = ? WHERE id = ? AND ${r.column} IS NULL`).run(value, r.id);
    }
    db.prepare('DELETE FROM trash WHERE id = ?').run(trashId);
  })();
  const userVehicleId = entry.table_name === 'user_vehicles' ? restoredId : entry.user_vehicle_id;
  return { table: entry.table_name, id: restoredId, userVehicleId };
}

function list(db) {
  ensureTable(db);
  return db.prepare(`
    SELECT id, kind, title, table_name, record_id, user_vehicle_id, vehicle_name, files, deleted_at,
           json_array_length(json_extract(payload, '$.rows')) AS record_count
    FROM trash ORDER BY deleted_at DESC, id DESC`).all()
    .map(t => ({ ...t, files: jsonList(t.files).length, purgeAfterDays: RETENTION_DAYS }));
}

/** File names held by trashed records — still "in use" until the trash lets go of them. */
function trashedFiles(db) {
  ensureTable(db);
  const names = new Set();
  for (const { files } of db.prepare('SELECT files FROM trash').all()) for (const f of jsonList(files)) names.add(f);
  return names;
}

/**
 * Permanently delete trash entries (all, one id, or those older than
 * olderThanDays) and remove files nothing else uses. Returns counts.
 */
function purge(db, uploadDir, { id = null, olderThanDays = null } = {}) {
  ensureTable(db);
  let where = '1 = 1';
  const params = [];
  if (id != null) { where = 'id = ?'; params.push(id); }
  else if (olderThanDays != null) { where = "deleted_at < datetime('now', ?)"; params.push(`-${olderThanDays} days`); }
  const doomed = db.prepare(`SELECT id, files FROM trash WHERE ${where}`).all(...params);
  if (!doomed.length) return { purged: 0, filesRemoved: 0 };
  const candidates = doomed.flatMap(d => jsonList(d.files));
  db.prepare(`DELETE FROM trash WHERE ${where}`).run(...params);
  const { removeUnreferenced } = require('./uploadRefs');
  return { purged: doomed.length, filesRemoved: removeUnreferenced(db, uploadDir, candidates) };
}

module.exports = { RETENTION_DAYS, ensureTable, collect, moveToTrash, restore, list, purge, trashedFiles, RestoreError };
