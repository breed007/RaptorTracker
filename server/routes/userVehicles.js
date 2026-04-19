const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { v4: uuidv4 } = require('uuid');
const { getDb } = require('../db');
const router = express.Router();

const UPLOAD_DIR = process.env.UPLOAD_DIR || './data/uploads';

const vehiclePhotoStorage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, UPLOAD_DIR),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    cb(null, `vehicle-${uuidv4()}${ext}`);
  }
});

const vehiclePhotoUpload = multer({
  storage: vehiclePhotoStorage,
  fileFilter: (req, file, cb) => {
    const allowed = ['.jpg', '.jpeg', '.png', '.webp', '.tiff', '.tif', '.heic'];
    const ext = path.extname(file.originalname).toLowerCase();
    if (allowed.includes(ext)) return cb(null, true);
    cb(new Error('Only image files are allowed (JPEG, PNG, WEBP, TIFF, HEIC)'), false);
  },
  limits: { fileSize: 20 * 1024 * 1024 }
});

const stickerStorage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, UPLOAD_DIR),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    cb(null, `sticker-${uuidv4()}${ext}`);
  }
});

const stickerUpload = multer({
  storage: stickerStorage,
  fileFilter: (req, file, cb) => {
    const allowed = ['.jpg', '.jpeg', '.png', '.webp', '.tiff', '.tif', '.pdf'];
    const ext = path.extname(file.originalname).toLowerCase();
    if (allowed.includes(ext)) return cb(null, true);
    cb(new Error('Only images (JPEG, PNG, WEBP, TIFF) and PDF files are allowed'), false);
  },
  limits: { fileSize: 50 * 1024 * 1024 }
});

router.get('/', (req, res) => {
  const db = getDb();
  const rows = db.prepare(`
    SELECT uv.*, v.make, v.model, v.generation, v.variant,
           v.aux_switch_count, v.aux_switch_layout,
           (SELECT COUNT(*) FROM mods m WHERE m.user_vehicle_id = uv.id) as mod_count,
           (SELECT COALESCE(SUM(cost),0) FROM mods m WHERE m.user_vehicle_id = uv.id AND m.status = 'Installed') as total_spend
    FROM user_vehicles uv
    JOIN vehicles v ON uv.vehicle_id = v.id
    ORDER BY uv.created_at DESC
  `).all();
  res.json(rows.map(uv => ({
    ...uv,
    aux_switch_layout: JSON.parse(uv.aux_switch_layout || '[]'),
    vehicle_photos: JSON.parse(uv.vehicle_photos || '[]')
  })));
});

router.post('/', (req, res) => {
  const db = getDb();
  const {
    vehicle_id, nickname, model_year, color, vin, purchase_date,
    mileage_at_purchase, package_options, notes,
    purchase_price, seller_name, seller_contact,
    service_dealership, service_dealership_contact
  } = req.body;
  if (!vehicle_id || !nickname || !model_year) {
    return res.status(400).json({ error: 'vehicle_id, nickname, and model_year are required' });
  }
  const vehicle = db.prepare('SELECT id FROM vehicles WHERE id = ?').get(vehicle_id);
  if (!vehicle) return res.status(400).json({ error: 'Invalid vehicle_id' });

  const result = db.prepare(`
    INSERT INTO user_vehicles
      (vehicle_id, nickname, model_year, color, vin, purchase_date,
       mileage_at_purchase, package_options, notes,
       purchase_price, seller_name, seller_contact,
       service_dealership, service_dealership_contact)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    vehicle_id, nickname, model_year,
    color || null, vin || null, purchase_date || null,
    mileage_at_purchase || null, package_options || null, notes || null,
    purchase_price != null ? parseFloat(purchase_price) : null,
    seller_name || null, seller_contact || null,
    service_dealership || null, service_dealership_contact || null
  );

  const created = db.prepare('SELECT * FROM user_vehicles WHERE id = ?').get(result.lastInsertRowid);
  res.status(201).json(created);
});

router.get('/:id', (req, res) => {
  const db = getDb();
  const uv = db.prepare(`
    SELECT uv.*, v.make, v.model, v.generation, v.variant,
           v.aux_switch_count, v.aux_switch_layout, v.engine_options,
           v.horsepower, v.torque, v.suspension_notes, v.tire_size, v.notes as vehicle_notes,
           (SELECT COUNT(*) FROM mods m WHERE m.user_vehicle_id = uv.id) as mod_count,
           (SELECT COUNT(*) FROM mods m WHERE m.user_vehicle_id = uv.id AND m.status = 'Installed') as installed_count,
           (SELECT COALESCE(SUM(cost),0) FROM mods m WHERE m.user_vehicle_id = uv.id AND m.status = 'Installed') as total_spend
    FROM user_vehicles uv
    JOIN vehicles v ON uv.vehicle_id = v.id
    WHERE uv.id = ?
  `).get(req.params.id);
  if (!uv) return res.status(404).json({ error: 'Not found' });
  res.json({
    ...uv,
    aux_switch_layout: JSON.parse(uv.aux_switch_layout || '[]'),
    engine_options: JSON.parse(uv.engine_options || '[]'),
    vehicle_photos: JSON.parse(uv.vehicle_photos || '[]')
  });
});

router.put('/:id', (req, res) => {
  const db = getDb();
  const {
    nickname, color, vin, purchase_date, mileage_at_purchase,
    package_options, notes,
    purchase_price, seller_name, seller_contact,
    service_dealership, service_dealership_contact
  } = req.body;
  const existing = db.prepare('SELECT id FROM user_vehicles WHERE id = ?').get(req.params.id);
  if (!existing) return res.status(404).json({ error: 'Not found' });
  db.prepare(`
    UPDATE user_vehicles SET
      nickname=?, color=?, vin=?, purchase_date=?,
      mileage_at_purchase=?, package_options=?, notes=?,
      purchase_price=?, seller_name=?, seller_contact=?,
      service_dealership=?, service_dealership_contact=?
    WHERE id=?
  `).run(
    nickname, color, vin, purchase_date, mileage_at_purchase, package_options, notes,
    purchase_price != null ? parseFloat(purchase_price) : null,
    seller_name || null, seller_contact || null,
    service_dealership || null, service_dealership_contact || null,
    req.params.id
  );
  res.json({ ok: true });
});

router.delete('/:id', (req, res) => {
  const db = getDb();
  const existing = db.prepare('SELECT id FROM user_vehicles WHERE id = ?').get(req.params.id);
  if (!existing) return res.status(404).json({ error: 'Not found' });
  db.prepare('DELETE FROM user_vehicles WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
});

router.post('/:id/window-sticker', stickerUpload.single('sticker'), (req, res) => {
  const db = getDb();
  const existing = db.prepare('SELECT id, window_sticker FROM user_vehicles WHERE id = ?').get(req.params.id);
  if (!existing) return res.status(404).json({ error: 'Not found' });
  if (!req.file) return res.status(400).json({ error: 'No file uploaded' });

  // Delete old sticker file if one existed
  if (existing.window_sticker) {
    const oldPath = path.join(UPLOAD_DIR, path.basename(existing.window_sticker));
    fs.unlink(oldPath, () => {});
  }

  const stickerPath = `/uploads/${req.file.filename}`;
  db.prepare('UPDATE user_vehicles SET window_sticker = ? WHERE id = ?').run(stickerPath, req.params.id);
  res.json({ window_sticker: stickerPath });
});

router.delete('/:id/window-sticker', (req, res) => {
  const db = getDb();
  const existing = db.prepare('SELECT id, window_sticker FROM user_vehicles WHERE id = ?').get(req.params.id);
  if (!existing) return res.status(404).json({ error: 'Not found' });
  if (existing.window_sticker) {
    const oldPath = path.join(UPLOAD_DIR, path.basename(existing.window_sticker));
    fs.unlink(oldPath, () => {});
  }
  db.prepare('UPDATE user_vehicles SET window_sticker = NULL WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
});

// ── Vehicle photos ────────────────────────────────────────────────────────────

router.post('/:id/photos', vehiclePhotoUpload.array('photos', 20), (req, res) => {
  const db = getDb();
  const existing = db.prepare('SELECT id, vehicle_photos, profile_photo FROM user_vehicles WHERE id = ?').get(req.params.id);
  if (!existing) return res.status(404).json({ error: 'Not found' });
  if (!req.files || req.files.length === 0) return res.status(400).json({ error: 'No files uploaded' });

  const current = JSON.parse(existing.vehicle_photos || '[]');
  const added = req.files.map(f => `/uploads/${f.filename}`);
  const updated = [...current, ...added];
  const profile = existing.profile_photo || added[0];

  db.prepare('UPDATE user_vehicles SET vehicle_photos = ?, profile_photo = ? WHERE id = ?')
    .run(JSON.stringify(updated), profile, req.params.id);

  res.json({ vehicle_photos: updated, profile_photo: profile });
});

router.delete('/:id/photos/:filename', (req, res) => {
  const db = getDb();
  const existing = db.prepare('SELECT id, vehicle_photos, profile_photo FROM user_vehicles WHERE id = ?').get(req.params.id);
  if (!existing) return res.status(404).json({ error: 'Not found' });

  const photoPath = `/uploads/${req.params.filename}`;
  const current = JSON.parse(existing.vehicle_photos || '[]');
  const updated = current.filter(p => p !== photoPath);

  fs.unlink(path.join(UPLOAD_DIR, req.params.filename), () => {});

  let profile = existing.profile_photo;
  if (profile === photoPath) profile = updated.length > 0 ? updated[0] : null;

  db.prepare('UPDATE user_vehicles SET vehicle_photos = ?, profile_photo = ? WHERE id = ?')
    .run(JSON.stringify(updated), profile, req.params.id);

  res.json({ vehicle_photos: updated, profile_photo: profile });
});

router.put('/:id/profile-photo', (req, res) => {
  const db = getDb();
  const { path: photoPath } = req.body;
  const existing = db.prepare('SELECT id, vehicle_photos FROM user_vehicles WHERE id = ?').get(req.params.id);
  if (!existing) return res.status(404).json({ error: 'Not found' });

  const photos = JSON.parse(existing.vehicle_photos || '[]');
  if (!photos.includes(photoPath)) return res.status(400).json({ error: 'Photo not in gallery' });

  db.prepare('UPDATE user_vehicles SET profile_photo = ? WHERE id = ?').run(photoPath, req.params.id);
  res.json({ ok: true, profile_photo: photoPath });
});

router.use((err, req, res, next) => {
  if (err instanceof multer.MulterError || err.message) {
    return res.status(400).json({ error: err.message });
  }
  next(err);
});

module.exports = router;
