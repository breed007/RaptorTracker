#!/usr/bin/env node
/**
 * RaptorTracker smoke test.
 *
 * Not full coverage — a fast tripwire that boots the data layer against a
 * throwaway database, runs migrations, asserts the schema is what the code
 * expects, and confirms every route/service module loads without throwing.
 * Catches the classes of regressions that have actually bitten: migration SQL
 * errors, missing tables/columns, and modules that fail to require.
 *
 * Run:  npm test      (needs better-sqlite3 built for your Node version)
 */
const os = require('os');
const fs = require('fs');
const path = require('path');

// Point everything at a throwaway data dir BEFORE requiring app modules.
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'raptortracker-smoke-'));
process.env.DATA_DIR = tmp;
process.env.UPLOAD_DIR = path.join(tmp, 'uploads');
process.env.NODE_ENV = 'test';
fs.mkdirSync(process.env.UPLOAD_DIR, { recursive: true });

let failures = 0;
const ok = (name) => console.log(`  ✓ ${name}`);
const fail = (name, err) => { failures++; console.error(`  ✗ ${name}${err ? ' — ' + err.message : ''}`); };
function check(name, fn) { try { fn(); ok(name); } catch (e) { fail(name, e); } }

try {
  console.log('RaptorTracker smoke test');
  console.log(`  data dir: ${tmp}`);

  // 1) Seed (creates base schema + reference vehicles) then open + migrate
  require('../server/db/init.js');
  const { getDb, closeDb } = require('../server/db');
  const db = getDb();

  // 2) Every table the app relies on must exist
  const expectedTables = [
    'vehicles', 'user_vehicles', 'mods', 'maintenance_log',
    'vehicle_warranties', 'service_intervals', 'wishlist', 'fuel_log',
    'app_settings', 'sent_reminders', 'tire_sets', 'mileage_log',
  ];
  const tables = new Set(db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all().map(r => r.name));
  for (const t of expectedTables) check(`table ${t}`, () => { if (!tables.has(t)) throw new Error('missing'); });

  // 3) Key migration-added columns must exist
  const hasCol = (table, col) => db.prepare(`PRAGMA table_info(${table})`).all().some(c => c.name === col);
  const expectedCols = [
    ['user_vehicles', 'reclaimed_aux_switches'],
    ['user_vehicles', 'dismissed_recalls'],
    ['user_vehicles', 'ownership_type'],
    ['user_vehicles', 'registration_expiry'],
    ['user_vehicles', 'current_mileage'],
    ['maintenance_log', 'service_provider_type'],
    ['mods', 'aux_switches'],
    ['mods', 'warranty_months'],
  ];
  for (const [t, c] of expectedCols) check(`column ${t}.${c}`, () => { if (!hasCol(t, c)) throw new Error('missing'); });

  // 4) Reference data seeded
  check('vehicles seeded', () => {
    const n = db.prepare('SELECT COUNT(*) AS c FROM vehicles').get().c;
    if (n < 1) throw new Error('no reference vehicles');
  });

  // 5) A basic write path works (insert a mileage reading against the seed vehicle)
  check('insert + read mileage_log', () => {
    const uv = db.prepare('SELECT id FROM user_vehicles LIMIT 1').get();
    if (!uv) throw new Error('no seed user_vehicle');
    db.prepare('INSERT INTO mileage_log (user_vehicle_id, date, odometer, note) VALUES (?,?,?,?)')
      .run(uv.id, '2026-01-01', 12345, 'smoke');
    const row = db.prepare('SELECT odometer FROM mileage_log ORDER BY id DESC LIMIT 1').get();
    if (!row || row.odometer !== 12345) throw new Error('readback mismatch');
  });

  closeDb();

  // 6) Every route/service module loads without throwing
  const modules = [
    'routes/vehicles', 'routes/userVehicles', 'routes/mods', 'routes/maintenance',
    'routes/upload', 'routes/summary', 'routes/export', 'routes/vin', 'routes/modTransfer',
    'routes/vehicleTransfer', 'routes/intervals', 'routes/wishlist', 'routes/fuel',
    'routes/warranty', 'routes/tco', 'routes/notifications', 'routes/tires', 'routes/recalls',
    'routes/backup', 'routes/logbook', 'routes/mileage', 'routes/analytics',
    'services/settings', 'services/mailer', 'services/reminders', 'scheduler',
  ];
  for (const m of modules) check(`require ${m}`, () => { require(`../server/${m}`); });

  // 7) Webhook URL validation guards junk
  check('assertValidWebhook rejects junk', () => {
    const { assertValidWebhook } = require('../server/services/reminders');
    let threw = false;
    try { assertValidWebhook('not a url'); } catch (_) { threw = true; }
    if (!threw) throw new Error('accepted invalid url');
    assertValidWebhook('https://discord.com/api/webhooks/x'); // should not throw
  });
} catch (e) {
  failures++;
  console.error('  ✗ fatal:', e.stack || e.message);
} finally {
  try { fs.rmSync(tmp, { recursive: true, force: true }); } catch (_) {}
}

if (failures > 0) {
  console.error(`\nSMOKE TEST FAILED — ${failures} check(s) failed.`);
  process.exit(1);
}
console.log('\nSmoke test passed.');
process.exit(0);
