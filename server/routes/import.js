const express = require('express');
const multer = require('multer');
const router = express.Router();
const { getDb } = require('../db');
const { analyze, TYPES } = require('../services/csvImport');

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
    cols: ['date', 'odometer', 'gallons', 'price_per_gallon', 'total_cost', 'station', 'trip_type', 'full_tank', 'notes'],
    finalize: (r) => ({
      ...r,
      trip_type: r.trip_type || 'mixed',
      full_tank: r.full_tank === false ? 0 : 1,
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
  if (!TYPES[type]) return res.status(400).json({ error: `Unknown import type "${type}"` });

  let analysis;
  try {
    analysis = analyze(type, req.file.buffer.toString('utf8'));
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

  // Keep the vehicle's current mileage honest after a bulk import
  try {
    const maxOdo = db.prepare(`
      SELECT MAX(m) AS m FROM (
        SELECT MAX(odometer) AS m FROM fuel_log WHERE user_vehicle_id = @v
        UNION ALL SELECT MAX(mileage) FROM maintenance_log WHERE user_vehicle_id = @v
        UNION ALL SELECT MAX(odometer) FROM mileage_log WHERE user_vehicle_id = @v
      )`).get({ v: Number(vehicle_id) });
    if (maxOdo?.m) {
      db.prepare('UPDATE user_vehicles SET current_mileage = ? WHERE id = ? AND (current_mileage IS NULL OR current_mileage < ?)')
        .run(maxOdo.m, Number(vehicle_id), maxOdo.m);
    }
  } catch (_) { /* non-fatal */ }

  res.json({ committed: true, inserted, ...preview });
});

router.use((err, req, res, next) => {
  if (err instanceof multer.MulterError || err.message) {
    return res.status(400).json({ error: err.message });
  }
  next(err);
});

module.exports = router;
