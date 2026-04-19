const express = require('express');
const path = require('path');
const fs = require('fs');
const archiver = require('archiver');
const AdmZip = require('adm-zip');
const multer = require('multer');
const { v4: uuidv4 } = require('uuid');
const { getDb } = require('../db');

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
    vehicle: {
      nickname: vehicle.nickname,
      model_year: vehicle.model_year,
      make: vehicle.make,
      model: vehicle.model,
      generation: vehicle.generation,
    },
    mods: mods.map(m => {
      const photos = JSON.parse(m.photos || '[]');
      const { id, user_vehicle_id, created_at, updated_at, ...rest } = m;
      return { ...rest, photos: photos.map(photoPathFn) };
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
    JSON.parse(m.photos || '[]').forEach(p => imageFilenames.add(path.basename(p)));
  });

  // Build payload with paths remapped to images/ directory inside ZIP
  const payload = buildPayload(vehicle, mods, p => `images/${path.basename(p)}`);
  archive.append(JSON.stringify(payload, null, 2), { name: 'mods.json' });

  for (const imgName of imageFilenames) {
    const filePath = path.join(UPLOAD_DIR, imgName);
    if (fs.existsSync(filePath)) {
      archive.file(filePath, { name: `images/${imgName}` });
    }
  }

  archive.finalize();
});

// ── Import ────────────────────────────────────────────────────────────────────

const importUpload = multer({
  storage: multer.diskStorage({
    destination: (req, file, cb) => cb(null, UPLOAD_DIR),
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

router.post('/import', importUpload.single('file'), (req, res) => {
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
  const extractedImages = {}; // origFname -> Buffer

  try {
    if (ext === '.json') {
      const raw = fs.readFileSync(req.file.path, 'utf8');
      payload = JSON.parse(raw);
    } else {
      const zip = new AdmZip(req.file.path);
      const modsEntry = zip.getEntry('mods.json');
      if (!modsEntry) throw new Error('ZIP does not contain mods.json');
      payload = JSON.parse(modsEntry.getData().toString('utf8'));
      zip.getEntries().forEach(entry => {
        if (entry.entryName.startsWith('images/') && !entry.isDirectory) {
          extractedImages[path.basename(entry.entryName)] = entry.getData();
        }
      });
    }
  } catch (err) {
    fs.unlink(req.file.path, () => {});
    return res.status(400).json({ error: `Could not parse file: ${err.message}` });
  } finally {
    fs.unlink(req.file.path, () => {});
  }

  if (!payload?.mods || !Array.isArray(payload.mods)) {
    return res.status(400).json({ error: 'Invalid format: missing mods array' });
  }

  const insertMod = db.prepare(`
    INSERT INTO mods
      (user_vehicle_id, part_name, part_number, brand, vendor, vendor_url,
       category, status, purchase_date, install_date, cost, mileage_at_install,
       aux_switch, aux_label, install_notes, wiring_notes, photos)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
  `);

  let imported = 0;
  let skipped = 0;

  const doImport = db.transaction(() => {
    for (const mod of payload.mods) {
      if (!mod.part_name) { skipped++; continue; }

      // Remap photos: extracted ZIP images get new UUIDs; bare /uploads/ paths kept if file exists
      const newPhotos = [];
      for (const photoPath of (mod.photos || [])) {
        const origFname = path.basename(photoPath);
        if (extractedImages[origFname]) {
          const newFname = `${uuidv4()}${path.extname(origFname)}`;
          fs.writeFileSync(path.join(UPLOAD_DIR, newFname), extractedImages[origFname]);
          newPhotos.push(`/uploads/${newFname}`);
        } else if (photoPath.startsWith('/uploads/') && fs.existsSync(path.join(UPLOAD_DIR, origFname))) {
          newPhotos.push(photoPath);
        }
      }

      insertMod.run(
        vehicle_id,
        mod.part_name,
        mod.part_number || null,
        mod.brand || null,
        mod.vendor || null,
        mod.vendor_url || null,
        mod.category || 'Other',
        mod.status || 'Researching',
        mod.purchase_date || null,
        mod.install_date || null,
        mod.cost != null ? parseFloat(mod.cost) : null,
        mod.mileage_at_install ? parseInt(mod.mileage_at_install) : null,
        mod.aux_switch ? parseInt(mod.aux_switch) : null,
        mod.aux_label || null,
        mod.install_notes || null,
        mod.wiring_notes || null,
        JSON.stringify(newPhotos)
      );
      imported++;
    }
  });

  try {
    doImport();
  } catch (err) {
    return res.status(500).json({ error: `Import failed: ${err.message}` });
  }

  res.json({ imported, skipped, total: payload.mods.length });
});

router.use((err, req, res, next) => {
  if (err instanceof multer.MulterError || err.message) {
    return res.status(400).json({ error: err.message });
  }
  next(err);
});

module.exports = router;
