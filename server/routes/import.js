const express = require('express');
const multer = require('multer');
const router = express.Router();
const { getDb } = require('../db');
const { analyze, TYPES } = require('../services/csvImport');
const appImport = require('../services/appImport');
const { refreshCurrentMileage } = require('../services/odometer');

// CSVs are small; keep them in memory rather than littering the data dir.
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 25 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const ok = /\.(csv|txt)$/i.test(file.originalname);
    cb(ok ? null : new Error('Please upload a .csv file'), ok);
  },
});

// Column list per table, in insert order
const INSERTS = {
  fuel: {
    table: 'fuel_log',
    cols: ['date', 'odometer', 'gallons', 'price_per_gallon', 'total_cost', 'station', 'trip_type', 'full_tank', 'missed_previous', 'notes'],
    finalize: (r) => ({
      ...r,
      trip_type: r.trip_type || 'mixed',
      full_tank: r.full_tank === false || r.full_tank === 0 ? 0 : 1,
      missed_previous: r.missed_previous ? 1 : 0,
      // Derive total when only unit price was supplied
      total_cost: r.total_cost != null ? r.total_cost
        : (r.gallons != null && r.price_per_gallon != null ? Math.round(r.gallons * r.price_per_gallon * 100) / 100 : null),
    }),
  },
  maintenance: {
    table: 'maintenance_log',
    cols: ['service_type', 'date_performed', 'mileage', 'cost', 'vendor', 'service_provider_type', 'notes'],
    finalize: (r) => r,
  },
  mods: {
    table: 'mods',
    cols: ['part_name', 'brand', 'part_number', 'vendor', 'vendor_url', 'category', 'status', 'purchase_date', 'install_date', 'cost', 'mileage_at_install', 'install_notes'],
    finalize: (r) => r,
  },
  specs: {
    table: 'vehicle_specs',
    cols: ['category', 'name', 'value', 'unit', 'source', 'notes'],
    finalize: (r) => ({ ...r, category: r.category || 'other' }),
  },
  wishlist: {
    table: 'wishlist',
    cols: ['part_name', 'brand', 'part_number', 'category', 'estimated_cost', 'priority', 'vendor_name', 'vendor_url', 'notes'],
    finalize: (r) => ({ ...r, priority: r.priority || 'medium' }),
  },
};

// GET /api/import/types — what can be imported, and which columns are understood
router.get('/types', (req, res) => {
  res.json({
    types: Object.entries(TYPES).map(([id, def]) => ({
      id,
      label: def.label,
      fields: Object.entries(def.fields).map(([name, spec]) => ({
        name, required: !!spec.required, aliases: spec.aliases,
      })),
    })),
  });
});

// POST /api/import/csv — dry run by default; pass commit=true to write
router.post('/csv', upload.single('file'), (req, res) => {
  const { type, vehicle_id } = req.body;
  const commit = req.body.commit === 'true' || req.body.commit === true;

  if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
  if (!vehicle_id) return res.status(400).json({ error: 'vehicle_id required' });

  // A Fuelly, Drivvo, or Simply Auto export is recognized whatever type was
  // picked, since owners won't know these aren't ordinary spreadsheets.
  const text = req.file.buffer.toString('utf8');
  if (type === 'app' || appImport.detect(text)) return importFromApp(req, res, text, commit);

  if (!TYPES[type]) return res.status(400).json({ error: `Unknown import type "${type}"` });

  let analysis;
  try {
    analysis = analyze(type, text);
  } catch (err) {
    return res.status(400).json({ error: `Could not read that CSV: ${err.message}` });
  }

  const preview = {
    type,
    total: analysis.total,
    validCount: analysis.rows.length,
    errorCount: analysis.errors.length,
    matchedColumns: analysis.matched,
    unmatchedColumns: analysis.unmatched,
    errors: analysis.errors.slice(0, 25),
    sample: analysis.rows.slice(0, 5),
  };

  if (!commit) return res.json({ committed: false, ...preview });

  if (analysis.rows.length === 0) {
    return res.status(400).json({ error: 'Nothing to import — no valid rows.', ...preview });
  }

  const db = getDb();
  const spec = INSERTS[type];
  const cols = ['user_vehicle_id', ...spec.cols];
  const stmt = db.prepare(
    `INSERT INTO ${spec.table} (${cols.join(', ')}) VALUES (${cols.map(c => '@' + c).join(', ')})`
  );

  let inserted = 0;
  try {
    const run = db.transaction((rows) => {
      for (const row of rows) {
        const finalized = spec.finalize(row);
        const params = { user_vehicle_id: Number(vehicle_id) };
        for (const c of spec.cols) params[c] = finalized[c] !== undefined ? finalized[c] : null;
        stmt.run(params);
        inserted++;
      }
    });
    run(analysis.rows);
  } catch (err) {
    return res.status(500).json({ error: `Import failed and was rolled back: ${err.message}`, ...preview });
  }

  // Imported history counts toward the vehicle's mileage like anything else.
  try { refreshCurrentMileage(db, Number(vehicle_id)); } catch (_) { /* non-fatal */ }

  res.json({ committed: true, inserted, ...preview });
});

// Records already in the vehicle are skipped, so importing the same export
// twice (or one that overlaps what was typed in by hand) doesn't double up.
function withoutDuplicates(db, vehicleId, a) {
  const fuelSeen = db.prepare('SELECT date, odometer FROM fuel_log WHERE user_vehicle_id = ?').all(vehicleId);
  const svcSeen = db.prepare('SELECT date_performed, lower(service_type) AS t FROM maintenance_log WHERE user_vehicle_id = ?').all(vehicleId);
  const fuelKey = new Set(fuelSeen.map(f => `${f.date}|${Math.round(f.odometer)}`));
  const svcKey = new Set(svcSeen.map(s => `${s.date_performed}|${s.t}`));
  const fuel = a.fuel.filter(f => !fuelKey.has(`${f.date}|${Math.round(f.odometer)}`));
  const maintenance = a.maintenance.filter(m => !svcKey.has(`${m.date_performed}|${m.service_type.toLowerCase()}`));
  return { fuel, maintenance, duplicates: { fuel: a.fuel.length - fuel.length, maintenance: a.maintenance.length - maintenance.length } };
}

function importFromApp(req, res, text, commit) {
  const vehicleId = Number(req.body.vehicle_id);
  const a = appImport.analyzeApp(text, {
    source: req.body.source || undefined, vehicle: req.body.source_vehicle || undefined,
    sourceUnits: req.body.source_units || undefined, dateOrder: req.body.date_order || 'auto',
  });
  if (!a) return res.status(400).json({ error: "That doesn't look like a Fuelly, Drivvo, or Simply Auto export." });
  const db = getDb();
  const { fuel, maintenance, duplicates } = withoutDuplicates(db, vehicleId, a);
  const preview = {
    mode: 'app', source: a.source, sourceLabel: a.sourceLabel, vehicles: a.vehicles, vehicle: a.vehicle,
    units: a.units, dayFirst: a.dayFirst, skipped: a.skipped, duplicates,
    fuelCount: fuel.length, maintenanceCount: maintenance.length,
    total: a.fuel.length + a.maintenance.length + a.errors.length,
    validCount: fuel.length + maintenance.length, errorCount: a.errors.length,
    errors: a.errors.slice(0, 25),
    sample: { fuel: fuel.slice(0, 3), maintenance: maintenance.slice(0, 3) },
  };
  if (!commit) return res.json({ committed: false, ...preview });
  if (!preview.validCount) return res.status(400).json({ error: 'Nothing new to import.', ...preview });

  const insert = (spec, row) => {
    const cols = ['user_vehicle_id', ...spec.cols];
    const params = { user_vehicle_id: vehicleId };
    for (const c of spec.cols) params[c] = row[c] !== undefined ? row[c] : null;
    db.prepare(`INSERT INTO ${spec.table} (${cols.join(', ')}) VALUES (${cols.map(c => '@' + c).join(', ')})`).run(params);
  };
  try {
    db.transaction(() => {
      for (const f of fuel) insert(INSERTS.fuel, f);
      for (const m of maintenance) insert(INSERTS.maintenance, m);
    })();
  } catch (err) {
    return res.status(500).json({ error: `Import failed and was rolled back: ${err.message}`, ...preview });
  }
  try { refreshCurrentMileage(db, vehicleId); } catch (_) { /* non-fatal */ }
  res.json({ committed: true, inserted: preview.validCount, ...preview });
}

router.use((err, req, res, next) => {
  if (err instanceof multer.MulterError || err.message) {
    return res.status(400).json({ error: err.message });
  }
  next(err);
});

module.exports = router;
