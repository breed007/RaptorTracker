const express = require('express');
const { getDb } = require('../db');
const units = require('../services/units');
const reports = require('../services/reports');
const router = express.Router();

// GET /api/export/pdf/:vehicle_id — the build sheet
router.get('/pdf/:vehicle_id', (req, res) => {
  const ok = reports.buildSheet(getDb(), req.params.vehicle_id, res, { includeSticker: req.query.include_sticker === 'true' });
  if (!ok) res.status(404).json({ error: 'Vehicle not found' });
});

// GET /api/export/history/:vehicle_id — vehicle history for a buyer.
// Options: costs, mods, trail, receipts, vin (each 'true' or 'false').
router.get('/history/:vehicle_id', (req, res) => {
  const flag = (k, dflt) => (req.query[k] == null ? dflt : req.query[k] === 'true');
  const ok = reports.vehicleHistory(getDb(), req.params.vehicle_id, res, {
    costs: flag('costs', false), mods: flag('mods', true), trail: flag('trail', false),
    receipts: flag('receipts', false), vin: flag('vin', true),
  });
  if (!ok) res.status(404).json({ error: 'Vehicle not found' });
});

// ── CSV export ────────────────────────────────────────────────────────────────

const CSV_TYPES = {
  mods: {
    table: 'mods',
    cols: ['part_name', 'brand', 'part_number', 'vendor', 'vendor_url', 'category', 'status',
      'purchase_date', 'install_date', 'cost', 'mileage_at_install', 'aux_switches',
      'warranty_provider', 'warranty_months', 'warranty_start_date', 'install_notes', 'wiring_notes'],
    order: 'category, part_name',
  },
  maintenance: {
    table: 'maintenance_log',
    cols: ['service_type', 'date_performed', 'mileage', 'cost', 'service_provider_type', 'vendor', 'notes'],
    order: 'date_performed DESC',
  },
  fuel: {
    table: 'fuel_log',
    cols: ['date', 'odometer', 'gallons', 'price_per_gallon', 'total_cost', 'full_tank', 'missed_previous', 'trip_type', 'station', 'notes'],
    order: 'odometer DESC',
  },
  wishlist: {
    table: 'wishlist',
    cols: ['part_name', 'brand', 'part_number', 'category', 'estimated_cost', 'priority', 'vendor_name', 'vendor_url', 'notes'],
    order: 'created_at DESC',
  },
  warranties: {
    table: 'vehicle_warranties',
    cols: ['warranty_name', 'provider', 'provider_url', 'purchase_date', 'start_date', 'term_years',
      'term_miles', 'expiration_date', 'deductible', 'cost', 'contract_number', 'claims_phone', 'notes'],
    order: 'created_at DESC',
  },
  specs: {
    table: 'vehicle_specs',
    cols: ['category', 'name', 'value', 'unit', 'source', 'notes'],
    order: 'category, name',
  },
  tires: {
    table: 'tire_sets',
    cols: ['name', 'tire_brand', 'tire_model', 'tire_size', 'wheel_brand', 'wheel_size', 'quantity',
      'cost', 'purchase_date', 'install_date', 'removed_date', 'odometer_installed', 'odometer_removed', 'is_active', 'notes'],
    order: 'is_active DESC',
  },
};

function csvCell(v) {
  if (v == null) return '';
  let s = String(v);
  // Neutralize spreadsheet formula injection: a cell starting with = + - @ (or
  // a control char) is treated as a formula by Excel/Sheets. Prefix a quote so
  // it's rendered as text — but leave genuine numbers (e.g. -5, +3.2) alone.
  if (/^[=+\-@\t\r]/.test(s) && isNaN(Number(s))) s = `'${s}`;
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

router.get('/csv/:type/:vehicle_id', (req, res) => {
  const db = getDb();
  const { type, vehicle_id } = req.params;
  const cfg = CSV_TYPES[type];
  if (!cfg) return res.status(400).json({ error: `Unknown export type "${type}"` });

  const rows = db.prepare(
    `SELECT ${cfg.cols.join(', ')} FROM ${cfg.table} WHERE user_vehicle_id = ? ORDER BY ${cfg.order}`
  ).all(vehicle_id);

  // Values are in the owner's units; name the volume columns to match so a
  // metric export doesn't say 'gallons' over a column of liters. Import
  // accepts either name.
  const metricVolume = units.getUnits().volume === 'l';
  const RENAME = metricVolume ? { gallons: 'liters', price_per_gallon: 'price_per_liter' } : {};
  const header = cfg.cols.map(c => RENAME[c] || c).join(',');
  const body = rows.map(r => cfg.cols.map(c => csvCell(r[c])).join(',')).join('\r\n');
  const csv = header + '\r\n' + body + (body ? '\r\n' : '');

  const dateStr = new Date().toISOString().slice(0, 10);
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="RaptorTracker-${type}-${dateStr}.csv"`);
  res.send(csv);
});

module.exports = router;
