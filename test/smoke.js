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
    'app_settings', 'sent_reminders', 'tire_sets', 'mileage_log', 'documents', 'vehicle_specs', 'outings',
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
    ['mods', 'amp_draw'],
    ['wishlist', 'amp_draw'],
    ['wishlist', 'aux_switch'],
    ['user_vehicles', 'mod_budget_monthly'],
    ['mods', 'attachments'],
  ];
  for (const [t, c] of expectedCols) check(`column ${t}.${c}`, () => { if (!hasCol(t, c)) throw new Error('missing'); });

  // 4) Reference data seeded
  check('vehicles seeded', () => {
    const n = db.prepare('SELECT COUNT(*) AS c FROM vehicles').get().c;
    if (n < 1) throw new Error('no reference vehicles');
  });

  // 5) A fresh install must start with an EMPTY garage — the first-run flow
  //    depends on it (we deliberately don't seed a sample vehicle any more).
  check('fresh install has no user vehicles', () => {
    const n = db.prepare('SELECT COUNT(*) AS c FROM user_vehicles').get().c;
    if (n !== 0) throw new Error(`expected 0 user_vehicles on a fresh install, found ${n}`);
  });

  // 6) A basic write path works end to end (create a vehicle, log mileage)
  check('insert vehicle + mileage_log round-trip', () => {
    const ref = db.prepare('SELECT id FROM vehicles LIMIT 1').get();
    if (!ref) throw new Error('no reference vehicle to attach to');
    const uv = db.prepare('INSERT INTO user_vehicles (vehicle_id, nickname, model_year) VALUES (?,?,?)')
      .run(ref.id, 'Smoke Test Truck', 2025);
    db.prepare('INSERT INTO mileage_log (user_vehicle_id, date, odometer, note) VALUES (?,?,?,?)')
      .run(uv.lastInsertRowid, '2026-01-01', 12345, 'smoke');
    const row = db.prepare('SELECT odometer FROM mileage_log ORDER BY id DESC LIMIT 1').get();
    if (!row || row.odometer !== 12345) throw new Error('readback mismatch');
  });

  // AUX fuse ratings, checked against Ford's published tables (see
  // server/reference/auxLayouts.js for the source of each). Written out here
  // independently so an edit that drifts from the documents fails the build.
  check('AUX reference ratings match the sources', () => {
    const expected = {
      'F-150 Raptor|Gen 1': [30, 30, 15, 10],
      'F-150 Raptor|Gen 2': [15, 15, 10, 10, 5, 5],
      'F-150 Raptor|Gen 3': [10, 15, 15, 10, 5, 5],
      'F-150 Raptor|Gen 3.5': [10, 15, 15, 10, 5, 5],
      'Bronco Raptor|Gen 1': [10, 15, 30, 10, 10, 10],
      'Ranger Raptor|Gen 1 (NA)': [5, 15, 15, 15, 25, 25],
    };
    for (const [key, amps] of Object.entries(expected)) {
      const [model, generation] = key.split('|');
      const v = db.prepare('SELECT aux_switch_layout, aux_switch_count, aux_source FROM vehicles WHERE model = ? AND generation = ?').get(model, generation);
      if (!v) throw new Error(`${key}: reference vehicle missing`);
      const got = JSON.parse(v.aux_switch_layout).map(s => s.fuse_amps);
      if (JSON.stringify(got) !== JSON.stringify(amps)) throw new Error(`${key}: expected ${amps.join('/')}, got ${got.join('/')}`);
      if (v.aux_switch_count !== amps.length) throw new Error(`${key}: aux_switch_count ${v.aux_switch_count}`);
      if (!v.aux_source) throw new Error(`${key}: no source recorded`);
    }
  });

  check('a 2010 Raptor starts from its own manual (AUX 3/4 swapped), and owner ratings win', () => {
    const { effectiveLayout } = require('../server/services/auxLayout');
    const v = db.prepare("SELECT aux_switch_layout FROM vehicles WHERE model = 'F-150 Raptor' AND generation = 'Gen 1'").get();
    const amps = (row) => effectiveLayout({ aux_switch_layout: v.aux_switch_layout, ...row }).map(s => s.fuse_amps).join('/');
    if (amps({ model_year: 2012 }) !== '30/30/15/10') throw new Error(`2012: ${amps({ model_year: 2012 })}`);
    if (amps({ model_year: 2010 }) !== '30/30/10/15') throw new Error(`2010: ${amps({ model_year: 2010 })}`);
    if (amps({ model_year: 2012, aux_fuse_overrides: '{"4":20}' }) !== '30/30/15/20') throw new Error('override not applied');
  });

  check('NHTSA component names read as titles', () => {
    const { humanizeComponent: h } = require('../server/routes/recalls');
    const cases = [
      ['POWER TRAIN:DRIVELINE:DRIVESHAFT', 'Driveshaft', 'Power Train'],
      ['ELECTRICAL SYSTEM: INTEGRATED TRAILER BRAKE CONTROL', 'Integrated Trailer Brake Control', 'Electrical System'],
      ['WHEELS:LUGS/NUTS/BOLTS/STUDS', 'Lugs/Nuts/Bolts/Studs', 'Wheels'],
      ['SERVICE BRAKES, HYDRAULIC:ANTILOCK/TRACTION CONTROL/ELECTRONIC STABILITY CONTROL:ABS', 'ABS', 'Service Brakes, Hydraulic'],
    ];
    for (const [raw, title, area] of cases) {
      const got = h(raw);
      if (got.title !== title || got.area !== area) throw new Error(`${raw} -> ${JSON.stringify(got)}`);
    }
  });

  // Every stored column that carries a unit must be in the conversion map;
  // one left out would silently keep its old units when an owner switches.
  check('every unit-bearing column is converted when units change', () => {
    const { COLUMNS } = require('../server/services/units');
    const listed = new Set(Object.values(COLUMNS).flat().map(([t, c]) => `${t}.${c}`));
    // Columns that look like units but aren't stored distances/volumes/pressures.
    const NOT_UNITS = new Set(['vehicles.mpg_city', 'vehicles.mpg_highway']);
    const missing = [];
    for (const { name: t } of db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'").all()) {
      for (const { name: c } of db.prepare(`PRAGMA table_info(${t})`).all()) {
        if (/mile|odometer|gallon|liter|litre|psi|kpa|pressure|tread|_km\b|kilomet/i.test(c) && !listed.has(`${t}.${c}`) && !NOT_UNITS.has(`${t}.${c}`)) {
          missing.push(`${t}.${c}`);
        }
      }
    }
    if (missing.length) throw new Error(`not in units.COLUMNS: ${missing.join(', ')}`);
  });

  check('unit conversions are exact both ways', () => {
    const u = require('../server/services/units');
    const near = (a, b, what) => { if (Math.abs(a - b) > 1e-9 * Math.max(1, Math.abs(b))) throw new Error(`${what}: ${a} vs ${b}`); };
    near(u.factor('distance', 'mi', 'km') * u.factor('distance', 'km', 'mi'), 1, 'mi<->km');
    near(u.factor('volume', 'gal', 'l') * u.factor('volume', 'l', 'gal'), 1, 'gal<->l');
    near(u.factor('pressure', 'psi', 'kpa') * u.factor('pressure', 'kpa', 'bar') * u.factor('pressure', 'bar', 'psi'), 1, 'psi->kpa->bar->psi');
    near(u.factor('distance', 'mi', 'km') * 100, 160.9344, '100 mi');
    // Economy: 20 US mpg is 11.76 L/100 km, 8.50 km/L, 24.02 UK mpg.
    const mpg20 = { distance: 'mi', volume: 'gal' };
    near(Math.round(u.economyFrom(20, { ...mpg20, economy: 'l100km' }) * 100) / 100, 11.76, 'L/100km');
    near(Math.round(u.economyFrom(20, { ...mpg20, economy: 'kml' }) * 100) / 100, 8.50, 'km/L');
    near(Math.round(u.economyFrom(20, { ...mpg20, economy: 'mpg_imp' }) * 100) / 100, 24.02, 'UK mpg');
    // Stored in km and liters: 8.5 km/L is still ~20 US mpg.
    near(Math.round(u.economyFrom(8.5032, { distance: 'km', volume: 'l', economy: 'mpg' }) * 10) / 10, 20, 'km/L stored -> mpg');
    if (u.formatMoney(1234.5, { currency: 'CAD' }) !== 'CA$1,234.50') throw new Error(`CAD: ${u.formatMoney(1234.5, { currency: 'CAD' })}`);
    if (u.unitsForLocale('en-AU').distance !== 'km' || u.unitsForLocale('en-GB').economy !== 'mpg_imp') throw new Error('locale defaults');
  });

  closeDb();

  // 7) Every route/service module loads without throwing
  const modules = [
    'routes/vehicles', 'routes/userVehicles', 'routes/mods', 'routes/maintenance',
    'routes/upload', 'routes/summary', 'routes/export', 'routes/vin', 'routes/modTransfer',
    'routes/vehicleTransfer', 'routes/intervals', 'routes/wishlist', 'routes/fuel',
    'routes/warranty', 'routes/tco', 'routes/notifications', 'routes/tires', 'routes/recalls',
    'routes/backup', 'routes/logbook', 'routes/mileage', 'routes/analytics', 'routes/search', 'routes/import', 'routes/auxCapacity', 'routes/forecast', 'routes/budget', 'routes/documents', 'routes/specs', 'routes/overview', 'routes/outings', 'routes/share', 'config',
    'services/settings', 'services/mailer', 'services/reminders', 'services/backupArchive', 'services/csvImport', 'services/mileageStats', 'services/auxCapacity', 'services/buildSheet', 'services/auxLayout', 'services/units', 'routes/settings', 'scheduler',
  ];
  for (const m of modules) check(`require ${m}`, () => { require(`../server/${m}`); });

  // 8) Webhook URL validation guards junk
  // Production start-up guard: placeholders from the example files must not boot.
  check('production guard rejects placeholder and short secrets', () => {
    const { productionProblems } = require('../server/config');
    const strong = 'a'.repeat(16) + 'b'.repeat(16) + 'c'.repeat(16);
    const cases = [
      [{}, true, 'missing secret'],
      [{ SESSION_SECRET: 'changeme-replace-with-a-long-random-string' }, true, '.env.example secret'],
      [{ SESSION_SECRET: 'changeme_in_production' }, true, 'old compose secret'],
      [{ SESSION_SECRET: 'tooshort' }, true, 'short secret'],
      [{ SESSION_SECRET: strong, ADMIN_PASSWORD: 'replace-me-before-first-start' }, true, '.env.example password'],
      [{ SESSION_SECRET: strong, ADMIN_PASSWORD: 'changeme' }, true, 'changeme password'],
      [{ SESSION_SECRET: strong, ADMIN_PASSWORD: 'a-real-long-passphrase' }, false, 'real values'],
    ];
    for (const [env, shouldFail, label] of cases) {
      const fails = productionProblems(env, { usingBootstrapPassword: true }).length > 0;
      if (fails !== shouldFail) throw new Error(`${label}: expected ${shouldFail ? 'rejection' : 'acceptance'}`);
    }
    // Once a password is set in the app, a placeholder in .env no longer matters.
    if (productionProblems({ SESSION_SECRET: strong, ADMIN_PASSWORD: 'changeme' }, { usingBootstrapPassword: false }).length) {
      throw new Error('placeholder ADMIN_PASSWORD rejected even though the app password is set');
    }
  });

  check('assertValidWebhook rejects junk', () => {
    const { assertValidWebhook } = require('../server/services/reminders');
    let threw = false;
    try { assertValidWebhook('not a url'); } catch (_) { threw = true; }
    if (!threw) throw new Error('accepted invalid url');
    assertValidWebhook('https://discord.com/api/webhooks/x'); // should not throw
  });

  // 9) CSV import: loose header matching, messy values, and shifted-column detection
  check('csv import parses messy input', () => {
    const { analyze } = require('../server/services/csvImport');
    const csv = 'Fill Date,Odo,Gal,Total,Where\r\n12/4/25,24500,26.2,"$90.63","Shell, Main St"\r\n';
    const r = analyze('fuel', csv);
    if (r.rows.length !== 1) throw new Error(`expected 1 row, got ${r.rows.length}`);
    const row = r.rows[0];
    if (row.date !== '2025-12-04') throw new Error(`date parsed as ${row.date}`);
    if (row.total_cost !== 90.63) throw new Error(`total parsed as ${row.total_cost}`);
    if (row.station !== 'Shell, Main St') throw new Error(`station parsed as ${row.station}`);
  });

  check('csv import handles spec sheets', () => {
    const { analyze } = require('../server/services/csvImport');
    const r = analyze('specs', 'Spec,Value,Unit,Section\nLug nut torque,150,lb-ft,TORQUE\n');
    if (r.rows.length !== 1) throw new Error(`expected 1 row, got ${r.rows.length}`);
    if (r.rows[0].category !== 'torque') throw new Error(`category snapped to ${r.rows[0].category}`);
  });

  check('csv import rejects shifted columns', () => {
    const { analyze } = require('../server/services/csvImport');
    // Unquoted "$1,299.00" splits into two fields and shifts every later column
    const r = analyze('mods', 'Part,Brand,Cost\nLight Bar,Baja,$1,299.00\n');
    if (r.rows.length !== 0) throw new Error('imported a corrupted row instead of rejecting it');
    if (r.errors.length !== 1) throw new Error('expected exactly one column-count error');
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
