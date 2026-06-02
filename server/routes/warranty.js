const express = require('express');
const router = express.Router();
const { getDb } = require('../db');

// ── Vehicle Extended Warranties ───────────────────────────────────────────────

// GET /api/warranty/vehicle?vehicle_id=X
router.get('/vehicle', (req, res) => {
  const { vehicle_id } = req.query;
  if (!vehicle_id) return res.status(400).json({ error: 'vehicle_id required' });
  const rows = getDb().prepare(
    'SELECT * FROM vehicle_warranties WHERE user_vehicle_id = ? ORDER BY created_at DESC'
  ).all(vehicle_id);
  res.json(rows);
});

// POST /api/warranty/vehicle
router.post('/vehicle', (req, res) => {
  const {
    user_vehicle_id, warranty_name, provider, provider_url,
    purchase_date, start_date, term_years, term_miles, expiration_date,
    deductible, cost, contract_number, claims_phone, notes
  } = req.body;
  if (!user_vehicle_id || !warranty_name || !provider)
    return res.status(400).json({ error: 'user_vehicle_id, warranty_name, and provider required' });

  // Auto-calculate expiration_date from start_date + term_years if not provided
  let expiry = expiration_date || null;
  if (!expiry && start_date && term_years) {
    const d = new Date(start_date + 'T12:00:00');
    d.setFullYear(d.getFullYear() + parseInt(term_years));
    expiry = d.toISOString().split('T')[0];
  }

  const db = getDb();
  const r = db.prepare(`
    INSERT INTO vehicle_warranties
      (user_vehicle_id, warranty_name, provider, provider_url,
       purchase_date, start_date, term_years, term_miles, expiration_date,
       deductible, cost, contract_number, claims_phone, notes)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    user_vehicle_id, warranty_name, provider, provider_url || null,
    purchase_date || null, start_date || null,
    term_years ? parseInt(term_years) : null,
    term_miles ? parseInt(term_miles) : null,
    expiry,
    deductible != null ? parseFloat(deductible) : null,
    cost != null ? parseFloat(cost) : null,
    contract_number || null, claims_phone || null, notes || null
  );
  res.json(db.prepare('SELECT * FROM vehicle_warranties WHERE id = ?').get(r.lastInsertRowid));
});

// PUT /api/warranty/vehicle/:id
router.put('/vehicle/:id', (req, res) => {
  const {
    warranty_name, provider, provider_url,
    purchase_date, start_date, term_years, term_miles, expiration_date,
    deductible, cost, contract_number, claims_phone, notes
  } = req.body;

  let expiry = expiration_date || null;
  if (!expiry && start_date && term_years) {
    const d = new Date(start_date + 'T12:00:00');
    d.setFullYear(d.getFullYear() + parseInt(term_years));
    expiry = d.toISOString().split('T')[0];
  }

  const db = getDb();
  db.prepare(`
    UPDATE vehicle_warranties SET
      warranty_name=?, provider=?, provider_url=?,
      purchase_date=?, start_date=?, term_years=?, term_miles=?, expiration_date=?,
      deductible=?, cost=?, contract_number=?, claims_phone=?, notes=?
    WHERE id=?
  `).run(
    warranty_name, provider, provider_url || null,
    purchase_date || null, start_date || null,
    term_years ? parseInt(term_years) : null,
    term_miles ? parseInt(term_miles) : null,
    expiry,
    deductible != null ? parseFloat(deductible) : null,
    cost != null ? parseFloat(cost) : null,
    contract_number || null, claims_phone || null, notes || null,
    req.params.id
  );
  res.json(db.prepare('SELECT * FROM vehicle_warranties WHERE id = ?').get(req.params.id));
});

// DELETE /api/warranty/vehicle/:id
router.delete('/vehicle/:id', (req, res) => {
  getDb().prepare('DELETE FROM vehicle_warranties WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
});

// ── Mod Warranties ────────────────────────────────────────────────────────────

// GET /api/warranty/mods?vehicle_id=X
// Returns all INSTALLED mods with their warranty fields
router.get('/mods', (req, res) => {
  const { vehicle_id } = req.query;
  if (!vehicle_id) return res.status(400).json({ error: 'vehicle_id required' });
  const mods = getDb().prepare(`
    SELECT id, part_name, brand, category, purchase_date, install_date,
           warranty_months, warranty_start_date, warranty_provider, warranty_notes
    FROM mods
    WHERE user_vehicle_id = ? AND status = 'Installed'
    ORDER BY install_date DESC, part_name ASC
  `).all(vehicle_id);
  res.json(mods);
});

// PUT /api/warranty/mods/:id  — update warranty fields on a mod
router.put('/mods/:id', (req, res) => {
  const { warranty_months, warranty_start_date, warranty_provider, warranty_notes } = req.body;
  const db = getDb();
  db.prepare(`
    UPDATE mods SET
      warranty_months=?, warranty_start_date=?, warranty_provider=?, warranty_notes=?
    WHERE id=?
  `).run(
    warranty_months ? parseInt(warranty_months) : null,
    warranty_start_date || null,
    warranty_provider || null,
    warranty_notes || null,
    req.params.id
  );
  res.json(db.prepare(
    'SELECT id, part_name, brand, category, purchase_date, install_date, warranty_months, warranty_start_date, warranty_provider, warranty_notes FROM mods WHERE id = ?'
  ).get(req.params.id));
});

// GET /api/warranty/summary?vehicle_id=X
// Returns counts for Dashboard badge
router.get('/summary', (req, res) => {
  const { vehicle_id } = req.query;
  if (!vehicle_id) return res.status(400).json({ error: 'vehicle_id required' });
  const db = getDb();

  const vw = db.prepare(
    'SELECT expiration_date FROM vehicle_warranties WHERE user_vehicle_id = ?'
  ).all(vehicle_id);

  const mods = db.prepare(`
    SELECT warranty_months, warranty_start_date
    FROM mods WHERE user_vehicle_id = ? AND status = 'Installed'
      AND warranty_months IS NOT NULL AND warranty_start_date IS NOT NULL
  `).all(vehicle_id);

  const today = new Date();
  const soon = 90; // days

  let expiringSoon = 0, expired = 0;

  const check = (expiryDateStr) => {
    if (!expiryDateStr) return;
    const exp = new Date(expiryDateStr + 'T12:00:00');
    const days = Math.floor((exp - today) / 86400000);
    if (days < 0) expired++;
    else if (days <= soon) expiringSoon++;
  };

  for (const vw_ of vw) check(vw_.expiration_date);
  for (const m of mods) {
    if (m.warranty_start_date && m.warranty_months) {
      const exp = new Date(m.warranty_start_date + 'T12:00:00');
      exp.setMonth(exp.getMonth() + m.warranty_months);
      check(exp.toISOString().split('T')[0]);
    }
  }

  res.json({ expiringSoon, expired });
});

module.exports = router;
