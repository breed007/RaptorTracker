/**
 * Moving a vehicle between installs — everything about it, not a subset.
 *
 * Before 1.0 the export carried the vehicle, its mods, and its service log;
 * fuel, warranties, tire sets, outings, documents, intervals, odometer
 * readings, specs, and wishlist were silently left behind, along with mods'
 * AUX assignments, amp draws, and receipts.
 *
 * Format 3 is table-driven: every table with a user_vehicle_id column is
 * exported whole, so a table added in a later release travels automatically
 * instead of being forgotten the same way. Foreign keys between those tables
 * (an outing's tire set) are read from the schema and remapped on import.
 * Columns the receiving install doesn't have are skipped, so an export from a
 * newer version still imports into an older-schema install and vice versa.
 */
const path = require('path');
const { jsonList } = require('../lib/json');
const { REFS } = require('./uploadRefs');
const { refreshCurrentMileage } = require('./odometer');
const units = require('./units');

const FORMAT = 'raptortracker-vehicle';
const VERSION = 3;

// Per-vehicle state that shouldn't travel: reminder de-duplication belongs to
// the install that sent the reminders.
const SKIP_TABLES = new Set(['sent_reminders', 'trash']);

// Columns re-derived on import rather than copied.
const USER_VEHICLE_SKIP = new Set(['id', 'vehicle_id', 'current_mileage', 'is_sample']);

const columnsOf = (db, table) => db.prepare(`PRAGMA table_info(${table})`).all().map(c => c.name);

function vehicleTables(db) {
  return db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'").all()
    .map(r => r.name)
    .filter(t => !SKIP_TABLES.has(t) && columnsOf(db, t).includes('user_vehicle_id'));
}

/** Parents before children, using the foreign keys between vehicle tables. */
function insertOrder(db, tables) {
  const set = new Set(tables);
  const deps = Object.fromEntries(tables.map(t => [t,
    db.prepare(`PRAGMA foreign_key_list(${t})`).all().map(f => f.table).filter(p => set.has(p) && p !== t)]));
  const out = [];
  const visit = (t, seen = new Set()) => {
    if (out.includes(t) || seen.has(t)) return;
    seen.add(t);
    deps[t].forEach(p => visit(p, seen));
    out.push(t);
  };
  tables.forEach(t => visit(t));
  return out;
}

const refsFor = (table) => REFS.filter(([t]) => t === table);

/** Every upload file name a set of rows points at. */
function filesIn(table, rows) {
  const names = new Set();
  for (const [, col, kind] of refsFor(table)) {
    for (const row of rows) {
      const list = kind === 'list' ? jsonList(row[col]) : [row[col]];
      for (const p of list) if (p) names.add(path.basename(String(p)));
    }
  }
  return names;
}

/** Build the manifest for one vehicle, plus the upload files it needs. */
function exportVehicle(db, vehicleId, { appVersion } = {}) {
  const uv = db.prepare('SELECT * FROM user_vehicles WHERE id = ?').get(vehicleId);
  if (!uv) return null;
  const ref = db.prepare('SELECT make, model, generation, variant FROM vehicles WHERE id = ?').get(uv.vehicle_id) || {};

  const files = filesIn('user_vehicles', [uv]);
  const tables = {};
  for (const t of vehicleTables(db)) {
    const rows = db.prepare(`SELECT * FROM ${t} WHERE user_vehicle_id = ? ORDER BY id`).all(vehicleId);
    if (!rows.length) continue;
    tables[t] = rows.map(({ user_vehicle_id, ...rest }) => rest);
    filesIn(t, rows).forEach(f => files.add(f));
  }

  const { id, vehicle_id, current_mileage, ...vehicle } = uv;
  return {
    manifest: {
      format: FORMAT,
      version: VERSION,
      app_version: appVersion || null,
      exported_at: new Date().toISOString(),
      // Values are stored in the sending install's units; the receiver converts.
      units: units.getUnits(),
      vehicle_ref: ref,
      vehicle,
      current_mileage,
      tables,
      files: [...files].sort(),
    },
    files: [...files],
  };
}

/**
 * Create a vehicle from a format-3 manifest. `fileMap` maps an original file
 * name to its new /uploads/ path (files are extracted before this runs, so
 * the database work can stay in one transaction). Returns a summary.
 */
function importVehicle(db, manifest, fileMap = {}) {
  const ref = manifest.vehicle_ref || {};
  const refVehicle = db.prepare(`
    SELECT id FROM vehicles
    WHERE make = ? AND model = ? AND (generation = ? OR (? IS NULL AND generation IS NULL))
    ORDER BY id LIMIT 1
  `).get(ref.make || 'Ford', ref.model || 'F-150 Raptor', ref.generation ?? null, ref.generation ?? null);
  if (!refVehicle) {
    const name = [ref.make, ref.model, ref.generation].filter(Boolean).join(' ');
    throw Object.assign(new Error(`This install has no reference vehicle for "${name}".`), { status: 400 });
  }

  const remapFiles = (table, data) => {
    for (const [, col, kind] of refsFor(table)) {
      if (!(col in data)) continue;
      if (kind === 'list') {
        data[col] = JSON.stringify(jsonList(data[col])
          .map(p => fileMap[path.basename(String(p))]).filter(Boolean));
      } else {
        data[col] = data[col] ? (fileMap[path.basename(String(data[col]))] || null) : null;
      }
    }
    return data;
  };

  const insertRow = (table, data) => {
    const cols = Object.keys(data);
    return db.prepare(`INSERT INTO ${table} (${cols.join(', ')}) VALUES (${cols.map(c => '@' + c).join(', ')})`)
      .run(data).lastInsertRowid;
  };

  const summary = { counts: {}, skippedTables: [], files: Object.keys(fileMap).length };
  const fromUnits = units.unitsOf(manifest.units);
  const toUnits = units.getUnits();
  const inUnits = (table, row) => units.convertRow(table, row, fromUnits, toUnits);

  const run = db.transaction(() => {
    // The vehicle itself
    const uvCols = new Set(columnsOf(db, 'user_vehicles'));
    const vehicle = {};
    for (const [k, v] of Object.entries(inUnits('user_vehicles', manifest.vehicle || {}))) {
      if (uvCols.has(k) && !USER_VEHICLE_SKIP.has(k)) vehicle[k] = v;
    }
    vehicle.vehicle_id = refVehicle.id;
    if (!vehicle.nickname) vehicle.nickname = 'Imported Vehicle';
    if (!vehicle.model_year) vehicle.model_year = new Date().getFullYear();
    const newVehicleId = insertRow('user_vehicles', remapFiles('user_vehicles', vehicle));

    // Everything that hangs off it, parents first
    const here = new Set(vehicleTables(db));
    const incoming = Object.keys(manifest.tables || {});
    summary.skippedTables = incoming.filter(t => !here.has(t));
    const idMap = {};

    for (const table of insertOrder(db, incoming.filter(t => here.has(t)))) {
      const cols = new Set(columnsOf(db, table));
      const fks = db.prepare(`PRAGMA foreign_key_list(${table})`).all().filter(f => f.table !== 'user_vehicles');
      idMap[table] = {};
      let n = 0;
      for (const row of manifest.tables[table]) {
        const data = {};
        for (const [k, v] of Object.entries(inUnits(table, row))) if (cols.has(k) && k !== 'id') data[k] = v;
        data.user_vehicle_id = newVehicleId;
        for (const fk of fks) {
          if (data[fk.from] == null) continue;
          const mapped = idMap[fk.table] && idMap[fk.table][data[fk.from]];
          data[fk.from] = mapped ?? null; // a reference we can't resolve becomes "none", never a wrong row
        }
        idMap[table][row.id] = insertRow(table, remapFiles(table, data));
        n++;
      }
      summary.counts[table] = n;
    }

    refreshCurrentMileage(db, newVehicleId);
    // A typed current mileage above every record travels as a reading.
    const now = db.prepare('SELECT current_mileage FROM user_vehicles WHERE id = ?').get(newVehicleId).current_mileage;
    const carried = inUnits('user_vehicles', { current_mileage: manifest.current_mileage }).current_mileage;
    if (carried > (now || 0)) {
      db.prepare("INSERT INTO mileage_log (user_vehicle_id, date, odometer, note) VALUES (?, date('now'), ?, 'Carried over in vehicle import')")
        .run(newVehicleId, carried);
      refreshCurrentMileage(db, newVehicleId);
    }
    summary.vehicleId = newVehicleId;
    summary.nickname = vehicle.nickname;
  });
  run();
  return summary;
}

const isFormat3 = (m) => m && m.format === FORMAT && Number(m.version) >= 3 && m.tables;

module.exports = { exportVehicle, importVehicle, vehicleTables, isFormat3, FORMAT, VERSION };
