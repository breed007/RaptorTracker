const express = require('express');
const { getDb } = require('../db');
const router = express.Router();

function parseMod(m) {
  return {
    ...m,
    photos: JSON.parse(m.photos || '[]'),
    aux_switches: JSON.parse(m.aux_switches || '[]'),
  };
}

// Derive the legacy aux_switch/aux_label from the first entry of aux_switches
// so that any old code paths still work
function legacyAux(auxSwitches) {
  const first = Array.isArray(auxSwitches) && auxSwitches.length > 0 ? auxSwitches[0] : null;
  return {
    aux_switch: first ? parseInt(first.switch_number) : null,
    aux_label:  first ? (first.label || null) : null,
  };
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
    aux_switches, install_notes, wiring_notes, photos, amp_draw,
    // legacy single-switch fields (still accepted for backward compat)
    aux_switch, aux_label,
  } = req.body;

  if (!user_vehicle_id || !part_name) {
    return res.status(400).json({ error: 'user_vehicle_id and part_name are required' });
  }

  // Prefer aux_switches array; fall back to legacy single-switch fields
  const switches = Array.isArray(aux_switches) && aux_switches.length > 0
    ? aux_switches
    : (aux_switch ? [{ switch_number: parseInt(aux_switch), label: aux_label || '' }] : []);

  const legacy = legacyAux(switches);

  const result = db.prepare(`
    INSERT INTO mods
      (user_vehicle_id, part_name, part_number, brand, vendor, vendor_url,
       category, status, purchase_date, install_date, cost, mileage_at_install,
       aux_switch, aux_label, aux_switches, install_notes, wiring_notes, photos, amp_draw)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
  `).run(
    user_vehicle_id, part_name, part_number || null, brand || null,
    vendor || null, vendor_url || null,
    category || 'Other', status || 'Researching',
    purchase_date || null, install_date || null,
    cost != null ? parseFloat(cost) : null,
    mileage_at_install ? parseInt(mileage_at_install) : null,
    legacy.aux_switch, legacy.aux_label,
    JSON.stringify(switches),
    install_notes || null, wiring_notes || null,
    JSON.stringify(photos || []),
    amp_draw != null && amp_draw !== '' ? parseFloat(amp_draw) : null
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
    purchase_date, install_date, cost, mileage_at_install,
    aux_switches, install_notes, wiring_notes, photos, amp_draw,
    // legacy
    aux_switch, aux_label,
  } = req.body;

  const switches = Array.isArray(aux_switches) && aux_switches.length > 0
    ? aux_switches
    : (aux_switch ? [{ switch_number: parseInt(aux_switch), label: aux_label || '' }] : []);

  const legacy = legacyAux(switches);

  db.prepare(`
    UPDATE mods SET
      part_name=?, part_number=?, brand=?, vendor=?, vendor_url=?,
      category=?, status=?, purchase_date=?, install_date=?, cost=?,
      mileage_at_install=?, aux_switch=?, aux_label=?, aux_switches=?,
      install_notes=?, wiring_notes=?, photos=?, amp_draw=?, updated_at=datetime('now')
    WHERE id=?
  `).run(
    part_name, part_number || null, brand || null, vendor || null, vendor_url || null,
    category || 'Other', status || 'Researching',
    purchase_date || null, install_date || null,
    cost != null ? parseFloat(cost) : null,
    mileage_at_install ? parseInt(mileage_at_install) : null,
    legacy.aux_switch, legacy.aux_label,
    JSON.stringify(switches),
    install_notes || null, wiring_notes || null,
    JSON.stringify(photos || []),
    amp_draw != null && amp_draw !== '' ? parseFloat(amp_draw) : null,
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
