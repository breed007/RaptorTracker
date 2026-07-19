const express = require('express');
const router = express.Router();
const { getDb } = require('../db');

const PER_TYPE = 6;

// GET /api/search?vehicle_id=X&q=term — cross-record search for the command palette
router.get('/', (req, res) => {
  const { vehicle_id, q } = req.query;
  if (!vehicle_id) return res.status(400).json({ error: 'vehicle_id required' });
  const term = (q || '').trim();
  if (term.length < 2) return res.json({ results: [] });

  const db = getDb();
  const like = `%${term}%`;
  const results = [];
  const push = (type, rows, map) => rows.forEach(r => results.push({ type, ...map(r) }));

  push('Mod', db.prepare(`
    SELECT id, part_name, brand, category, status FROM mods
    WHERE user_vehicle_id = ? AND (
      part_name LIKE ? OR brand LIKE ? OR part_number LIKE ? OR vendor LIKE ? OR install_notes LIKE ?)
    ORDER BY updated_at DESC LIMIT ${PER_TYPE}
  `).all(vehicle_id, like, like, like, like, like),
    r => ({ title: r.part_name, subtitle: [r.brand, r.category?.replace(/_/g, ' '), r.status?.replace(/_/g, ' ')].filter(Boolean).join(' · '), link: `/mods/${r.id}` }));

  push('Service', db.prepare(`
    SELECT service_type, date_performed, vendor, mileage FROM maintenance_log
    WHERE user_vehicle_id = ? AND (service_type LIKE ? OR vendor LIKE ? OR notes LIKE ?)
    ORDER BY date_performed DESC LIMIT ${PER_TYPE}
  `).all(vehicle_id, like, like, like),
    r => ({ title: r.service_type, subtitle: [r.date_performed, r.vendor, r.mileage ? `${r.mileage.toLocaleString()} mi` : null].filter(Boolean).join(' · '), link: '/maintenance' }));

  push('Wishlist', db.prepare(`
    SELECT part_name, brand, priority FROM wishlist
    WHERE user_vehicle_id = ? AND (part_name LIKE ? OR brand LIKE ? OR part_number LIKE ? OR vendor_name LIKE ? OR notes LIKE ?)
    ORDER BY created_at DESC LIMIT ${PER_TYPE}
  `).all(vehicle_id, like, like, like, like, like),
    r => ({ title: r.part_name, subtitle: [r.brand, r.priority].filter(Boolean).join(' · '), link: '/wishlist' }));

  push('Tires', db.prepare(`
    SELECT name, tire_brand, tire_model, tire_size FROM tire_sets
    WHERE user_vehicle_id = ? AND (name LIKE ? OR tire_brand LIKE ? OR tire_model LIKE ? OR tire_size LIKE ? OR wheel_brand LIKE ?)
    ORDER BY is_active DESC LIMIT ${PER_TYPE}
  `).all(vehicle_id, like, like, like, like, like),
    r => ({ title: r.name, subtitle: [r.tire_brand, r.tire_model, r.tire_size].filter(Boolean).join(' ') || 'Tire / wheel set', link: '/tires' }));

  push('Warranty', db.prepare(`
    SELECT warranty_name, provider, expiration_date FROM vehicle_warranties
    WHERE user_vehicle_id = ? AND (warranty_name LIKE ? OR provider LIKE ? OR contract_number LIKE ? OR notes LIKE ?)
    ORDER BY created_at DESC LIMIT ${PER_TYPE}
  `).all(vehicle_id, like, like, like, like),
    r => ({ title: r.warranty_name, subtitle: [r.provider, r.expiration_date ? `expires ${r.expiration_date}` : null].filter(Boolean).join(' · '), link: '/warranty' }));

  push('Fuel', db.prepare(`
    SELECT date, station, odometer, gallons FROM fuel_log
    WHERE user_vehicle_id = ? AND (station LIKE ? OR notes LIKE ?)
    ORDER BY odometer DESC LIMIT ${PER_TYPE}
  `).all(vehicle_id, like, like),
    r => ({ title: r.station || 'Fill-up', subtitle: [r.date, r.odometer ? `${r.odometer.toLocaleString()} mi` : null].filter(Boolean).join(' · '), link: '/fuel' }));

  res.json({ results });
});

module.exports = router;
