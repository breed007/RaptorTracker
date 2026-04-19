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

function safeFilename(str) {
  return (str || 'vehicle').replace(/[^a-z0-9]/gi, '-').replace(/-+/g, '-').replace(/^-|-$/g, '');
}

// ── Export Vehicle ZIP ─────────────────────────────────────────────────────────

router.get('/:id/export', (req, res) => {
  const db = getDb();
  const uv = db.prepare(`
    SELECT uv.*, v.make, v.model, v.generation, v.variant
    FROM user_vehicles uv JOIN vehicles v ON uv.vehicle_id = v.id
    WHERE uv.id = ?
  `).get(req.params.id);
  if (!uv) return res.status(404).json({ error: 'Vehicle not found' });

  const mods = db.prepare(
    'SELECT * FROM mods WHERE user_vehicle_id = ? ORDER BY created_at ASC'
  ).all(uv.id).map(m => ({ ...m, photos: JSON.parse(m.photos || '[]') }));

  const maintenance = db.prepare(
    'SELECT service_type, date_performed, mileage, cost, vendor, notes FROM maintenance_log WHERE user_vehicle_id = ? ORDER BY date_performed DESC'
  ).all(uv.id);

  const vehiclePhotos = JSON.parse(uv.vehicle_photos || '[]');
  const dateStr = new Date().toISOString().slice(0, 10);
  const fname = `${safeFilename(uv.nickname)}-${dateStr}.zip`;

  res.setHeader('Content-Disposition', `attachment; filename="${fname}"`);
  res.setHeader('Content-Type', 'application/zip');

  const archive = archiver('zip', { zlib: { level: 6 } });
  archive.on('error', err => {
    if (!res.headersSent) res.status(500).json({ error: err.message });
  });
  archive.pipe(res);

  const payload = {
    version: 2,
    exported_at: new Date().toISOString(),
    vehicle: {
      nickname: uv.nickname,
      model_year: uv.model_year,
      color: uv.color,
      vin: uv.vin,
      package_options: uv.package_options,
      notes: uv.notes,
      purchase_price: uv.purchase_price,
      purchase_date: uv.purchase_date,
      seller_name: uv.seller_name,
      seller_contact: uv.seller_contact,
      service_dealership: uv.service_dealership,
      service_dealership_contact: uv.service_dealership_contact,
      vehicle_ref: { make: uv.make, model: uv.model, generation: uv.generation, variant: uv.variant },
      vehicle_photos: vehiclePhotos.map(p => `vehicle-photos/${path.basename(p)}`),
      profile_photo: uv.profile_photo ? `vehicle-photos/${path.basename(uv.profile_photo)}` : null,
      window_sticker: uv.window_sticker ? `sticker/${path.basename(uv.window_sticker)}` : null,
    },
    mods: mods.map(m => {
      const { id, user_vehicle_id, created_at, updated_at, ...rest } = m;
      return { ...rest, photos: m.photos.map(p => `mod-images/${path.basename(p)}`) };
    }),
    maintenance,
  };

  archive.append(JSON.stringify(payload, null, 2), { name: 'vehicle.json' });

  for (const p of vehiclePhotos) {
    const filePath = path.join(UPLOAD_DIR, path.basename(p));
    if (fs.existsSync(filePath)) archive.file(filePath, { name: `vehicle-photos/${path.basename(p)}` });
  }

  if (uv.window_sticker) {
    const filePath = path.join(UPLOAD_DIR, path.basename(uv.window_sticker));
    if (fs.existsSync(filePath)) archive.file(filePath, { name: `sticker/${path.basename(uv.window_sticker)}` });
  }

  const modImageFilenames = new Set();
  mods.forEach(m => m.photos.forEach(p => modImageFilenames.add(path.basename(p))));
  for (const imgName of modImageFilenames) {
    const filePath = path.join(UPLOAD_DIR, imgName);
    if (fs.existsSync(filePath)) archive.file(filePath, { name: `mod-images/${imgName}` });
  }

  archive.finalize();
});

// ── Import Vehicle ZIP ─────────────────────────────────────────────────────────

const importUpload = multer({
  storage: multer.diskStorage({
    destination: (req, file, cb) => cb(null, UPLOAD_DIR),
    filename: (req, file, cb) => cb(null, `vimport-${uuidv4()}.zip`),
  }),
  fileFilter: (req, file, cb) => {
    if (path.extname(file.originalname).toLowerCase() === '.zip') return cb(null, true);
    cb(new Error('Only .zip files are accepted'), false);
  },
  limits: { fileSize: 500 * 1024 * 1024 },
});

router.post('/import', importUpload.single('file'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file uploaded' });

  const db = getDb();
  let payload;
  const extractedImages = {};

  try {
    const zip = new AdmZip(req.file.path);
    const vehicleEntry = zip.getEntry('vehicle.json');
    if (!vehicleEntry) throw new Error('ZIP does not contain vehicle.json');
    payload = JSON.parse(vehicleEntry.getData().toString('utf8'));

    zip.getEntries().forEach(entry => {
      if (!entry.isDirectory && (
        entry.entryName.startsWith('vehicle-photos/') ||
        entry.entryName.startsWith('sticker/') ||
        entry.entryName.startsWith('mod-images/')
      )) {
        extractedImages[entry.entryName] = entry.getData();
      }
    });
  } catch (err) {
    fs.unlink(req.file.path, () => {});
    return res.status(400).json({ error: `Could not parse ZIP: ${err.message}` });
  } finally {
    fs.unlink(req.file.path, () => {});
  }

  if (!payload?.vehicle) return res.status(400).json({ error: 'Invalid format: missing vehicle data' });

  const v = payload.vehicle;
  const ref = v.vehicle_ref || {};

  const refVehicle = db.prepare(`
    SELECT id FROM vehicles
    WHERE make = ? AND model = ? AND (generation = ? OR generation IS NULL)
    LIMIT 1
  `).get(ref.make || 'Ford', ref.model || 'F-150 Raptor', ref.generation || '');

  if (!refVehicle) {
    return res.status(400).json({
      error: `No matching vehicle reference found for "${ref.make} ${ref.model} ${ref.generation}". Ensure this vehicle model is available in RaptorTracker.`,
    });
  }

  function writeImage(zipPath) {
    const buf = extractedImages[zipPath];
    if (!buf) return null;
    const ext = path.extname(zipPath) || '.jpg';
    const newFname = `${uuidv4()}${ext}`;
    fs.writeFileSync(path.join(UPLOAD_DIR, newFname), buf);
    return `/uploads/${newFname}`;
  }

  let importResult;
  try {
    importResult = db.transaction(() => {
      // Vehicle photos
      const photoMap = {};
      for (const zipPath of (v.vehicle_photos || [])) {
        const newPath = writeImage(zipPath);
        if (newPath) photoMap[zipPath] = newPath;
      }
      const newVehiclePhotos = Object.values(photoMap);
      const newProfilePhoto = (v.profile_photo && photoMap[v.profile_photo])
        ? photoMap[v.profile_photo]
        : (newVehiclePhotos[0] || null);

      // Window sticker
      const newSticker = v.window_sticker ? writeImage(v.window_sticker) : null;

      // Create vehicle
      const uvResult = db.prepare(`
        INSERT INTO user_vehicles
          (vehicle_id, nickname, model_year, color, vin, purchase_date,
           mileage_at_purchase, package_options, notes,
           purchase_price, seller_name, seller_contact,
           service_dealership, service_dealership_contact,
           vehicle_photos, profile_photo, window_sticker)
        VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
      `).run(
        refVehicle.id,
        v.nickname || 'Imported Vehicle',
        v.model_year || 2024,
        v.color || null,
        v.vin || null,
        v.purchase_date || null,
        v.mileage_at_purchase || null,
        v.package_options || null,
        v.notes || null,
        v.purchase_price != null ? parseFloat(v.purchase_price) : null,
        v.seller_name || null,
        v.seller_contact || null,
        v.service_dealership || null,
        v.service_dealership_contact || null,
        JSON.stringify(newVehiclePhotos),
        newProfilePhoto,
        newSticker,
      );
      const newVehicleId = uvResult.lastInsertRowid;

      // Mods
      const insertMod = db.prepare(`
        INSERT INTO mods
          (user_vehicle_id, part_name, part_number, brand, vendor, vendor_url,
           category, status, purchase_date, install_date, cost, mileage_at_install,
           aux_switch, aux_label, install_notes, wiring_notes, photos)
        VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
      `);
      let modsImported = 0, modsSkipped = 0;
      for (const mod of (payload.mods || [])) {
        if (!mod.part_name) { modsSkipped++; continue; }
        const newPhotos = (mod.photos || []).map(writeImage).filter(Boolean);
        insertMod.run(
          newVehicleId, mod.part_name, mod.part_number || null,
          mod.brand || null, mod.vendor || null, mod.vendor_url || null,
          mod.category || 'Other', mod.status || 'Researching',
          mod.purchase_date || null, mod.install_date || null,
          mod.cost != null ? parseFloat(mod.cost) : null,
          mod.mileage_at_install ? parseInt(mod.mileage_at_install) : null,
          mod.aux_switch ? parseInt(mod.aux_switch) : null, mod.aux_label || null,
          mod.install_notes || null, mod.wiring_notes || null,
          JSON.stringify(newPhotos)
        );
        modsImported++;
      }

      // Maintenance
      const insertMaint = db.prepare(`
        INSERT INTO maintenance_log (user_vehicle_id, service_type, date_performed, mileage, cost, vendor, notes)
        VALUES (?,?,?,?,?,?,?)
      `);
      let maintImported = 0;
      for (const m of (payload.maintenance || [])) {
        if (!m.service_type || !m.date_performed) continue;
        insertMaint.run(
          newVehicleId, m.service_type, m.date_performed,
          m.mileage ? parseInt(m.mileage) : null,
          m.cost != null ? parseFloat(m.cost) : null,
          m.vendor || null, m.notes || null
        );
        maintImported++;
      }

      return { vehicleId: newVehicleId, nickname: v.nickname, modsImported, modsSkipped, maintImported };
    })();
  } catch (err) {
    return res.status(500).json({ error: `Import failed: ${err.message}` });
  }

  res.status(201).json(importResult);
});

router.use((err, req, res, next) => {
  if (err instanceof multer.MulterError || err.message) {
    return res.status(400).json({ error: err.message });
  }
  next(err);
});

module.exports = router;
