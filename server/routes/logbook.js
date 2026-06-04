const express = require('express');
const router = express.Router();
const { getDb } = require('../db');

const miles = (n) => (n != null ? `${Number(n).toLocaleString('en-US')} mi` : null);
const money = (n) => (n != null ? `$${Number(n).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}` : null);
const join = (...parts) => parts.filter(Boolean).join(' · ');

// GET /api/logbook?vehicle_id=X — a unified, date-sorted history of the vehicle
router.get('/', (req, res) => {
  const { vehicle_id } = req.query;
  if (!vehicle_id) return res.status(400).json({ error: 'vehicle_id required' });

  const db = getDb();
  const uv = db.prepare('SELECT nickname, purchase_date, mileage_at_purchase FROM user_vehicles WHERE id = ?').get(vehicle_id);
  if (!uv) return res.status(404).json({ error: 'Not found' });

  const events = [];

  if (uv.purchase_date) {
    events.push({ date: uv.purchase_date, type: 'vehicle', title: 'Vehicle acquired', detail: join(uv.nickname, miles(uv.mileage_at_purchase)), link: '/garage' });
  }

  db.prepare(`SELECT id, part_name, brand, install_date, purchase_date, mileage_at_install, cost
              FROM mods WHERE user_vehicle_id = ?`).all(vehicle_id).forEach(m => {
    const date = m.install_date || m.purchase_date;
    if (!date) return;
    events.push({
      date, type: 'mod',
      title: `${m.install_date ? 'Installed' : 'Added'} ${m.part_name}`,
      detail: join(m.brand, miles(m.mileage_at_install), money(m.cost)),
      link: `/mods/${m.id}`,
    });
  });

  db.prepare(`SELECT service_type, date_performed, mileage, cost, service_provider_type
              FROM maintenance_log WHERE user_vehicle_id = ?`).all(vehicle_id).forEach(s => {
    const provider = { dealership: 'Dealership', independent: 'Independent', owner: 'Owner/DIY' }[s.service_provider_type];
    events.push({
      date: s.date_performed, type: 'service',
      title: s.service_type,
      detail: join(provider, miles(s.mileage), money(s.cost)),
      link: '/maintenance',
    });
  });

  db.prepare(`SELECT date, odometer, gallons, total_cost FROM fuel_log WHERE user_vehicle_id = ?`).all(vehicle_id).forEach(f => {
    events.push({
      date: f.date, type: 'fuel',
      title: `Fuel — ${Number(f.gallons).toFixed(1)} gal`,
      detail: join(miles(f.odometer), money(f.total_cost)),
      link: '/fuel',
    });
  });

  db.prepare(`SELECT name, install_date, removed_date FROM tire_sets WHERE user_vehicle_id = ?`).all(vehicle_id).forEach(t => {
    if (t.install_date) events.push({ date: t.install_date, type: 'tire', title: `Fitted ${t.name}`, detail: 'Tire / wheel set', link: '/tires' });
    if (t.removed_date) events.push({ date: t.removed_date, type: 'tire', title: `Removed ${t.name}`, detail: 'Tire / wheel set', link: '/tires' });
  });

  db.prepare(`SELECT warranty_name, provider, start_date, purchase_date FROM vehicle_warranties WHERE user_vehicle_id = ?`).all(vehicle_id).forEach(w => {
    const date = w.start_date || w.purchase_date;
    if (!date) return;
    events.push({ date, type: 'warranty', title: `Warranty: ${w.warranty_name}`, detail: w.provider || '', link: '/warranty' });
  });

  // Newest first; ties broken by type for stable grouping
  events.sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : a.type.localeCompare(b.type)));

  res.json({ events });
});

module.exports = router;
