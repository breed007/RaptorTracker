const express = require('express');
const path = require('path');
const fs = require('fs');
const archiver = require('archiver');
const { openZip } = require('../services/zipReader');
const { isAllowedUpload, storeInZip } = require('../services/uploads');
const { DATA_DIR } = require('../db');
const multer = require('multer');
const { randomUUID: uuidv4 } = require('crypto');
const { getDb } = require('../db');
const { jsonList } = require('../lib/json');
const units = require('../services/units');
const { refreshCurrentMileage } = require('../services/odometer');

const UPLOAD_DIR = process.env.UPLOAD_DIR || './data/uploads';
const router = express.Router();

// ── Helpers ──────────────────────────────────────────────────────────────────

function safeFilename(str) {
  return str.replace(/[^a-z0-9]/gi, '-').replace(/-+/g, '-').replace(/^-|-$/g, '');
}

function fetchVehicleWithMods(db, vehicleId) {
  const vehicle = db.prepare(`
    SELECT uv.*, v.make, v.model, v.generation
    FROM user_vehicles uv JOIN vehicles v ON uv.vehicle_id = v.id
    WHERE uv.id = ?
  `).get(vehicleId);
  if (!vehicle) return null;
  const mods = db.prepare(
    'SELECT * FROM mods WHERE user_vehicle_id = ? ORDER BY created_at ASC'
  ).all(vehicleId);
  return { vehicle, mods };
}

function buildPayload(vehicle, mods, photoPathFn) {
  return {
    version: 1,
    exported_at: new Date().toISOString(),
    units: units.getUnits(),
    vehicle: {
      nickname: vehicle.nickname,
      model_year: vehicle.model_year,
      make: vehicle.make,
      model: vehicle.model,
      generation: vehicle.generation,
    },
    mods: mods.map(m => {
      const { id, user_vehicle_id, created_at, updated_at, ...rest } = m;
      return {
        ...rest,
        photos: jsonList(m.photos).map(photoPathFn),
        attachments: jsonList(m.attachments).map(photoPathFn),
        aux_switches: jsonList(m.aux_switches),
      };
    }),
  };
}

// ── Export JSON ───────────────────────────────────────────────────────────────

router.get('/export/json', (req, res) => {
  const { vehicle_id } = req.query;
  if (!vehicle_id) return res.status(400).json({ error: 'vehicle_id required' });

  const db = getDb();
  const result = fetchVehicleWithMods(db, vehicle_id);
  if (!result) return res.status(404).json({ error: 'Vehicle not found' });

  const payload = buildPayload(result.vehicle, result.mods, p => p);
  const fname = `${safeFilename(result.vehicle.nickname)}-mods-${new Date().toISOString().slice(0, 10)}.json`;

  res.setHeader('Content-Disposition', `attachment; filename="${fname}"`);
  res.setHeader('Content-Type', 'application/json');
  res.json(payload);
});

// ── Export ZIP ────────────────────────────────────────────────────────────────

router.get('/export/zip', (req, res) => {
  const { vehicle_id } = req.query;
  if (!vehicle_id) return res.status(400).json({ error: 'vehicle_id required' });

  const db = getDb();
  const result = fetchVehicleWithMods(db, vehicle_id);
  if (!result) return res.status(404).json({ error: 'Vehicle not found' });

  const { vehicle, mods } = result;
  const fname = `${safeFilename(vehicle.nickname)}-mods-${new Date().toISOString().slice(0, 10)}.zip`;

  res.setHeader('Content-Disposition', `attachment; filename="${fname}"`);
  res.setHeader('Content-Type', 'application/zip');

  const archive = archiver('zip', { zlib: { level: 6 } });
  archive.on('error', err => {
    if (!res.headersSent) res.status(500).json({ error: err.message });
  });
  archive.pipe(res);

  // Collect unique image filenames across all mods
  const imageFilenames = new Set();
  mods.forEach(m => {
    jsonList(m.photos).forEach(p => imageFilenames.add(path.basename(p)));
    jsonList(m.attachments).forEach(p => imageFilenames.add(path.basename(p)));
  });

  // Build payload with paths remapped to images/ directory inside ZIP
  const payload = buildPayload(vehicle, mods, p => `images/${path.basename(p)}`);
  archive.append(JSON.stringify(payload, null, 2), { name: 'mods.json' });

  for (const imgName of imageFilenames) {
    const filePath = path.join(UPLOAD_DIR, imgName);
    if (fs.existsSync(filePath)) {
      archive.file(filePath, { name: `images/${imgName}`, store: storeInZip(imgName) });
    }
  }

  archive.finalize();
});

// ── Import ────────────────────────────────────────────────────────────────────

const importUpload = multer({
  storage: multer.diskStorage({
    // Not UPLOAD_DIR: that folder is served to the browser.
    destination: (req, file, cb) => { const d = path.join(DATA_DIR, 'tmp'); fs.mkdirSync(d, { recursive: true }); cb(null, d); },
    filename: (req, file, cb) => {
      const ext = path.extname(file.originalname).toLowerCase();
      cb(null, `import-${uuidv4()}${ext}`);
    },
  }),
  fileFilter: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    if (['.json', '.zip'].includes(ext)) return cb(null, true);
    cb(new Error('Only .json or .zip files are accepted'), false);
  },
  limits: { fileSize: 200 * 1024 * 1024 },
});

router.post('/import', importUpload.single('file'), async (req, res) => {
  const { vehicle_id } = req.query;
  if (!vehicle_id) return res.status(400).json({ error: 'vehicle_id required' });
  if (!req.file) return res.status(400).json({ error: 'No file uploaded' });

  const db = getDb();
  const vehicle = db.prepare('SELECT id FROM user_vehicles WHERE id = ?').get(vehicle_id);
  if (!vehicle) {
    fs.unlink(req.file.path, () => {});
    return res.status(404).json({ error: 'Vehicle not found' });
  }

  const ext = path.extname(req.file.originalname).toLowerCase();
  let payload;
  const extractedImages = {}; // original file name -> /uploads/<new name>, already on disk
  const written = [];
  const discard = () => written.forEach(f => fs.rm(f, { force: true }, () => {}));

  let zip = null;
  try {
    if (ext === '.json') {
      const raw = fs.readFileSync(req.file.path, 'utf8');
      payload = JSON.parse(raw);
    } else {
      zip = await openZip(req.file.path);
      const modsEntry = zip.find('mods.json');
      if (!modsEntry) throw new Error('ZIP does not contain mods.json');
      payload = JSON.parse((await zip.read(modsEntry, 50 * 1024 * 1024)).toString('utf8'));
      for (const entry of zip.filter(n => n.startsWith('images/') && isAllowedUpload(n))) {
        const orig = path.basename(entry.fileName);
        const newFname = `${uuidv4()}${path.extname(orig)}`;
        const dest = path.join(UPLOAD_DIR, newFname);
        await zip.extractTo(entry, dest, 100 * 1024 * 1024);
        written.push(dest);
        extractedImages[orig] = `/uploads/${newFname}`;
      }
    }
  } catch (err) {
    discard();
    return res.status(400).json({ error: `Could not parse file: ${err.message}` });
  } finally {
    if (zip) zip.close();
    fs.unlink(req.file.path, () => {});
  }

  if (!payload?.mods || !Array.isArray(payload.mods)) {
    discard();
    return res.status(400).json({ error: 'Invalid format: missing mods array' });
  }

  // Insert every column both the export and this install know about, so
  // amp draw, multi-switch AUX assignments, receipts, and warranty details
  // travel instead of being dropped. A newer export's unknown columns are
  // ignored; an older export's missing ones stay empty.
  const modCols = new Set(db.prepare('PRAGMA table_info(mods)').all().map(c => c.name));
  const NEVER = new Set(['id', 'user_vehicle_id', 'created_at', 'updated_at']);

  // Files named in the payload: use the copy extracted from the ZIP, or copy an
  // existing upload — never share one file between two mods, or deleting
  // either breaks the other.
  const remapFiles = (list) => {
    const out = [];
    for (const p of jsonList(list)) {
      const origFname = path.basename(String(p));
      if (extractedImages[origFname]) {
        out.push(extractedImages[origFname]);
      } else if (String(p).startsWith('/uploads/') && isAllowedUpload(origFname) && fs.existsSync(path.join(UPLOAD_DIR, origFname))) {
        const newFname = `${uuidv4()}${path.extname(origFname)}`;
        const dest = path.join(UPLOAD_DIR, newFname);
        fs.copyFileSync(path.join(UPLOAD_DIR, origFname), dest);
        written.push(dest);
        out.push(`/uploads/${newFname}`);
      }
    }
    return out;
  };

  let imported = 0;
  let skipped = 0;
  let duplicates = 0;
  // Mileage at install is in the sending install's units.
  const fromUnits = units.unitsOf(payload.units);
  const toUnits = units.getUnits();
  // Importing the same file twice shouldn't double the build.
  const seen = new Set(db.prepare('SELECT lower(part_name) AS n, install_date AS d FROM mods WHERE user_vehicle_id = ?')
    .all(vehicle_id).map(m => `${m.n}|${m.d || ''}`));

  const doImport = db.transaction(() => {
    for (const raw of payload.mods) {
      if (!raw.part_name) { skipped++; continue; }
      const key = `${String(raw.part_name).toLowerCase()}|${raw.install_date || ''}`;
      if (seen.has(key)) { duplicates++; continue; }
      seen.add(key);
      const mod = units.convertRow('mods', raw, fromUnits, toUnits);
      const data = {};
      for (const [k, v] of Object.entries(mod)) {
        if (modCols.has(k) && !NEVER.has(k)) data[k] = (v !== null && typeof v === 'object') ? JSON.stringify(v) : v;
      }
      data.user_vehicle_id = vehicle_id;
      data.category = data.category || 'Other';
      data.status = data.status || 'Researching';
      if (modCols.has('photos')) data.photos = JSON.stringify(remapFiles(mod.photos));
      if (modCols.has('attachments')) data.attachments = JSON.stringify(remapFiles(mod.attachments));
      // Older exports carry only the single legacy switch; newer ones the list.
      const switches = jsonList(mod.aux_switches);
      if (modCols.has('aux_switches')) {
        data.aux_switches = JSON.stringify(switches.length ? switches
          : (mod.aux_switch ? [{ switch_number: Number(mod.aux_switch), label: mod.aux_label || '' }] : []));
      }
      const cols = Object.keys(data);
      db.prepare(`INSERT INTO mods (${cols.join(', ')}) VALUES (${cols.map(c => '@' + c).join(', ')})`).run(data);
      imported++;
    }
  });

  try {
    doImport();
  } catch (err) {
    discard();
    return res.status(500).json({ error: `Import failed: ${err.message}` });
  }

  try { refreshCurrentMileage(db, Number(vehicle_id)); } catch (_) { /* non-fatal */ }
  res.json({ imported, skipped, duplicates, total: payload.mods.length });
});

router.use((err, req, res, next) => {
  if (err instanceof multer.MulterError || err.message) {
    return res.status(400).json({ error: err.message });
  }
  next(err);
});

module.exports = router;
