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
const { exportVehicle, importVehicle, isFormat3 } = require('../services/vehicleTransfer');
const { localDate } = require('../lib/dates');
const APP_VERSION = require('../../package.json').version;

const UPLOAD_DIR = process.env.UPLOAD_DIR || './data/uploads';
const router = express.Router();

function safeFilename(str) {
  return (str || 'vehicle').replace(/[^a-z0-9]/gi, '-').replace(/-+/g, '-').replace(/^-|-$/g, '');
}

// ── Export Vehicle ZIP ─────────────────────────────────────────────────────────
// Format 3: every per-vehicle table plus every file they reference. Meant for
// moving a truck between your own installs — it includes purchase, financing,
// and insurance details, so it isn't something to hand to a buyer.

router.get('/:id/export', (req, res) => {
  const db = getDb();
  const result = exportVehicle(db, req.params.id, { appVersion: APP_VERSION });
  if (!result) return res.status(404).json({ error: 'Vehicle not found' });

  const fname = `${safeFilename(result.manifest.vehicle.nickname)}-${localDate()}.zip`;
  res.setHeader('Content-Disposition', `attachment; filename="${fname}"`);
  res.setHeader('Content-Type', 'application/zip');

  const archive = archiver('zip', { zlib: { level: 6 } });
  archive.on('error', err => {
    if (!res.headersSent) res.status(500).json({ error: err.message });
  });
  archive.pipe(res);
  archive.append(JSON.stringify(result.manifest, null, 2), { name: 'vehicle.json' });
  for (const name of result.files) {
    const filePath = path.join(UPLOAD_DIR, name);
    if (isAllowedUpload(name) && fs.existsSync(filePath)) archive.file(filePath, { name: `files/${name}`, store: storeInZip(name) });
  }
  archive.finalize();
});

// ── Import Vehicle ZIP ─────────────────────────────────────────────────────────

const importUpload = multer({
  storage: multer.diskStorage({
    // Not UPLOAD_DIR: that folder is served to the browser.
    destination: (req, file, cb) => { const d = path.join(DATA_DIR, 'tmp'); fs.mkdirSync(d, { recursive: true }); cb(null, d); },
    filename: (req, file, cb) => cb(null, `vimport-${uuidv4()}.zip`),
  }),
  fileFilter: (req, file, cb) => {
    if (path.extname(file.originalname).toLowerCase() === '.zip') return cb(null, true);
    cb(new Error('Only .zip files are accepted'), false);
  },
  limits: { fileSize: 500 * 1024 * 1024 },
});

router.post('/import', importUpload.single('file'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file uploaded' });

  const db = getDb();
  let payload;
  // zip path -> /uploads/<new name>. Images stream straight to disk rather than
  // being held in memory; anything written is removed again if the import fails.
  const imageMap = {};
  const written = [];
  const discard = () => written.forEach(f => fs.rm(f, { force: true }, () => {}));
  // vehicle-photos/, sticker/, mod-images/ are the older layout; files/ is format 3.
  const IMAGE_DIRS = ['vehicle-photos/', 'sticker/', 'mod-images/', 'files/'];

  let zip = null;
  try {
    zip = await openZip(req.file.path);
    const vehicleEntry = zip.find('vehicle.json');
    if (!vehicleEntry) throw new Error('ZIP does not contain vehicle.json');
    payload = JSON.parse((await zip.read(vehicleEntry, 50 * 1024 * 1024)).toString('utf8'));

    for (const entry of zip.filter(n => IMAGE_DIRS.some(d => n.startsWith(d)) && isAllowedUpload(n))) {
      const newFname = `${uuidv4()}${path.extname(entry.fileName) || '.jpg'}`;
      const dest = path.join(UPLOAD_DIR, newFname);
      await zip.extractTo(entry, dest, 100 * 1024 * 1024);
      written.push(dest);
      imageMap[entry.fileName] = `/uploads/${newFname}`;
    }
  } catch (err) {
    discard();
    return res.status(400).json({ error: `Could not parse ZIP: ${err.message}` });
  } finally {
    if (zip) zip.close();
    fs.unlink(req.file.path, () => {});
  }

  if (isFormat3(payload)) {
    const fileMap = {};
    for (const [zipPath, newPath] of Object.entries(imageMap)) {
      if (zipPath.startsWith('files/')) fileMap[path.basename(zipPath)] = newPath;
    }
    try {
      const summary = importVehicle(db, payload, fileMap);
      return res.status(201).json({
        ok: true, format: 3, vehicleId: summary.vehicleId, nickname: summary.nickname,
        counts: summary.counts, skippedTables: summary.skippedTables,
        // kept for the existing import dialog
        modsImported: summary.counts.mods || 0, maintImported: summary.counts.maintenance_log || 0,
      });
    } catch (err) {
      discard();
      return res.status(err.status || 500).json({ error: `Import failed: ${err.message}` });
    }
  }

  if (!payload?.vehicle) { discard(); return res.status(400).json({ error: 'Invalid format: missing vehicle data' }); }

  const v = payload.vehicle;
  const ref = v.vehicle_ref || {};

  const refVehicle = db.prepare(`
    SELECT id FROM vehicles
    WHERE make = ? AND model = ? AND (generation = ? OR generation IS NULL)
    LIMIT 1
  `).get(ref.make || 'Ford', ref.model || 'F-150 Raptor', ref.generation || '');

  if (!refVehicle) {
    discard();
    return res.status(400).json({
      error: `No matching vehicle reference found for "${ref.make} ${ref.model} ${ref.generation}". Ensure this vehicle model is available in RaptorTracker.`,
    });
  }

  const writeImage = (zipPath) => imageMap[zipPath] || null;

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
    discard();
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
