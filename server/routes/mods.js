const express = require('express');
const { getDb } = require('../db');
const router = express.Router();

function parseMod(m) {
  return { ...m, photos: JSON.parse(m.photos || '[]') };
}

router.get('/', (req, res) => {
  const db = getDb();
  const { vehicle_id, category, status, search } = req.query;
  if (!vehicle_id) return res.status(400).json({ error: 'vehicle_id required' });

  let sql = 'SELECT * FROM mods WHERE user_vehicle_id = ?';
  const params = [vehicle_id];

  if (category) { sql += ' AND category = ?'; params.push(category); }
  if (status)   { sql += ' AND status = ?';   params.push(status); }
  if (search) {
    sql += ' AND (part_name LIKE ? OR brand LIKE ? OR vendor LIKE ?)';
    const like = `%${search}%`;
    params.push(like, like, like);
  }
  sql += ' ORDER BY updated_at DESC';

  const rows = db.prepare(sql).all(...params);
  res.json(rows.map(parseMod));
});

router.post('/', (req, res) => {
  const db = getDb();
  const {
    user_vehicle_id, part_name, part_number, brand, vendor, vendor_url,
    category, status, purchase_date, install_date, cost, mileage_at_install,
    aux_switch, aux_label, install_notes, wiring_notes, photos
  } = req.body;

  if (!user_vehicle_id || !part_name) {
    return res.status(400).json({ error: 'user_vehicle_id and part_name are required' });
  }

  const result = db.prepare(`
    INSERT INTO mods
      (user_vehicle_id, part_name, part_number, brand, vendor, vendor_url,
       category, status, purchase_date, install_date, cost, mileage_at_install,
       aux_switch, aux_label, install_notes, wiring_notes, photos)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
  `).run(
    user_vehicle_id, part_name, part_number || null, brand || null,
    vendor || null, vendor_url || null,
    category || 'Other', status || 'Researching',
    purchase_date || null, install_date || null,
    cost != null ? parseFloat(cost) : null,
    mileage_at_install ? parseInt(mileage_at_install) : null,
    aux_switch ? parseInt(aux_switch) : null,
    aux_label || null, install_notes || null, wiring_notes || null,
    JSON.stringify(photos || [])
  );

  const created = db.prepare('SELECT * FROM mods WHERE id = ?').get(result.lastInsertRowid);
  res.status(201).json(parseMod(created));
});

router.get('/:id', (req, res) => {
  const db = getDb();
  const row = db.prepare('SELECT * FROM mods WHERE id = ?').get(req.params.id);
  if (!row) return res.status(404).json({ error: 'Not found' });
  res.json(parseMod(row));
});

router.put('/:id', (req, res) => {
  const db = getDb();
  const existing = db.prepare('SELECT id FROM mods WHERE id = ?').get(req.params.id);
  if (!existing) return res.status(404).json({ error: 'Not found' });

  const {
    part_name, part_number, brand, vendor, vendor_url, category, status,
    purchase_date, install_date, cost, mileage_at_install, aux_switch, aux_label,
    install_notes, wiring_notes, photos
  } = req.body;

  db.prepare(`
    UPDATE mods SET
      part_name=?, part_number=?, brand=?, vendor=?, vendor_url=?,
      category=?, status=?, purchase_date=?, install_date=?, cost=?,
      mileage_at_install=?, aux_switch=?, aux_label=?, install_notes=?, wiring_notes=?,
      photos=?, updated_at=datetime('now')
    WHERE id=?
  `).run(
    part_name, part_number || null, brand || null, vendor || null, vendor_url || null,
    category || 'Other', status || 'Researching',
    purchase_date || null, install_date || null,
    cost != null ? parseFloat(cost) : null,
    mileage_at_install ? parseInt(mileage_at_install) : null,
    aux_switch ? parseInt(aux_switch) : null,
    aux_label || null, install_notes || null, wiring_notes || null,
    JSON.stringify(photos || []),
    req.params.id
  );
  res.json({ ok: true });
});

router.delete('/:id', (req, res) => {
  const db = getDb();
  const existing = db.prepare('SELECT id FROM mods WHERE id = ?').get(req.params.id);
  if (!existing) return res.status(404).json({ error: 'Not found' });
  db.prepare('DELETE FROM mods WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
});

module.exports = router;
