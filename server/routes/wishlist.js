const express = require('express');
const router = express.Router();
const { getDb } = require('../db');

// GET /api/wishlist?vehicle_id=X
router.get('/', (req, res) => {
  const { vehicle_id } = req.query;
  if (!vehicle_id) return res.status(400).json({ error: 'vehicle_id required' });
  const items = getDb().prepare(
    "SELECT * FROM wishlist WHERE user_vehicle_id = ? ORDER BY CASE priority WHEN 'high' THEN 1 WHEN 'medium' THEN 2 ELSE 3 END, created_at DESC"
  ).all(vehicle_id);
  res.json(items);
});

// POST /api/wishlist
router.post('/', (req, res) => {
  const { user_vehicle_id, part_name, brand, part_number, category,
          estimated_cost, priority, vendor_name, vendor_url, notes } = req.body;
  if (!user_vehicle_id || !part_name)
    return res.status(400).json({ error: 'user_vehicle_id and part_name required' });
  const db = getDb();
  const r = db.prepare(`
    INSERT INTO wishlist
      (user_vehicle_id, part_name, brand, part_number, category,
       estimated_cost, priority, vendor_name, vendor_url, notes)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(user_vehicle_id, part_name, brand || null, part_number || null,
         category || null, estimated_cost || null, priority || 'medium',
         vendor_name || null, vendor_url || null, notes || null);
  res.json(db.prepare('SELECT * FROM wishlist WHERE id = ?').get(r.lastInsertRowid));
});

// PUT /api/wishlist/:id
router.put('/:id', (req, res) => {
  const { part_name, brand, part_number, category,
          estimated_cost, priority, vendor_name, vendor_url, notes } = req.body;
  const db = getDb();
  db.prepare(`
    UPDATE wishlist SET part_name=?, brand=?, part_number=?, category=?,
      estimated_cost=?, priority=?, vendor_name=?, vendor_url=?, notes=?
    WHERE id=?
  `).run(part_name, brand || null, part_number || null, category || null,
         estimated_cost || null, priority || 'medium',
         vendor_name || null, vendor_url || null, notes || null, req.params.id);
  res.json(db.prepare('SELECT * FROM wishlist WHERE id = ?').get(req.params.id));
});

// DELETE /api/wishlist/:id
router.delete('/:id', (req, res) => {
  getDb().prepare('DELETE FROM wishlist WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
});

// POST /api/wishlist/:id/promote — move to mods as status "Ordered"
router.post('/:id/promote', (req, res) => {
  const db = getDb();
  const item = db.prepare('SELECT * FROM wishlist WHERE id = ?').get(req.params.id);
  if (!item) return res.status(404).json({ error: 'Item not found' });

  const r = db.prepare(`
    INSERT INTO mods
      (user_vehicle_id, part_name, brand, part_number, category,
       vendor, vendor_url, cost, status, install_notes)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'Ordered', ?)
  `).run(item.user_vehicle_id, item.part_name, item.brand, item.part_number,
         item.category || 'Other', item.vendor_name, item.vendor_url,
         item.estimated_cost, item.notes);

  db.prepare('DELETE FROM wishlist WHERE id = ?').run(req.params.id);
  res.json({ ok: true, mod_id: r.lastInsertRowid });
});

module.exports = router;
