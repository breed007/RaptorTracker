#!/usr/bin/env node
/**
 * RaptorTracker upgrade tests.
 *
 * The smoke and API suites both start from an empty database, which means the
 * path almost every real owner takes — "I have four years of data and I just
 * ran git pull" — was completely uncovered. Migrations here are additive and
 * applied lazily on first getDb(), exactly the design where an ordering
 * mistake quietly eats someone's history.
 *
 * For each previously released tag this:
 *   1. builds a database using THAT VERSION's schema and migrations,
 *   2. fills it with representative data,
 *   3. runs the CURRENT migrations over it,
 *   4. asserts every row survived byte-for-byte and the schema is now complete.
 *
 * Run:  npm run test:upgrade   (needs better-sqlite3 built for your Node version)
 */
const os = require('os');
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const ROOT = path.join(__dirname, '..');
// Old copies live inside the repo so their `require('better-sqlite3')` still
// resolves against the project's node_modules.
const STAGE = path.join(ROOT, '.upgrade-stage');

let failures = 0;
const ok = (n) => console.log(`    ✓ ${n}`);
const bad = (n, e) => { failures++; console.error(`    ✗ ${n} — ${e.message}`); };
function check(name, fn) { try { fn(); ok(name); } catch (e) { bad(name, e); } }
function eq(a, b, what) {
  if (a !== b) throw new Error(`${what}: expected ${JSON.stringify(b)}, got ${JSON.stringify(a)}`);
}

function tags() {
  const out = execFileSync('git', ['tag', '-l'], { cwd: ROOT, encoding: 'utf8' });
  const all = out.split('\n').map(s => s.trim()).filter(Boolean);
  // Only tags whose schema files exist and that predate HEAD.
  return all
    .filter(t => /^v\d+\.\d+\.\d+$/.test(t))
    .filter(t => {
      try {
        execFileSync('git', ['cat-file', '-e', `${t}:server/db/index.js`], { cwd: ROOT, stdio: 'ignore' });
        return true;
      } catch { return false; }
    })
    .sort((a, b) => {
      const pa = a.slice(1).split('.').map(Number), pb = b.slice(1).split('.').map(Number);
      return pa[0] - pb[0] || pa[1] - pb[1] || pa[2] - pb[2];
    });
}

function stageTag(tag) {
  const dir = path.join(STAGE, tag.replace(/\./g, '_'));
  fs.mkdirSync(dir, { recursive: true });
  for (const f of ['index.js', 'init.js']) {
    const content = execFileSync('git', ['show', `${tag}:server/db/${f}`], { cwd: ROOT, encoding: 'utf8' });
    fs.writeFileSync(path.join(dir, f), content);
  }
  return dir;
}

/**
 * Insert a row using only the columns that exist in this version of the table,
 * so one fixture works across every tag. Returns the column set actually used.
 */
function insertPortable(db, table, values) {
  const cols = new Set(db.prepare(`PRAGMA table_info(${table})`).all().map(c => c.name));
  const use = Object.keys(values).filter(k => cols.has(k));
  if (!use.length) return null;
  db.prepare(
    `INSERT INTO ${table} (${use.join(', ')}) VALUES (${use.map(() => '?').join(', ')})`
  ).run(...use.map(k => values[k]));
  return use;
}

function tableExists(db, t) {
  return !!db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name=?").get(t);
}

// The fixture. Values are deliberately distinctive so a silent column shift
// during migration shows up as a mismatch rather than a plausible number.
const FIXTURE = {
  user_vehicles: { nickname: 'Upgrade Test Truck', model_year: 2021, color: 'Code Orange', vin: '1FTFW1RG5MFA00001', current_mileage: 41234, purchase_price: 68500.55, mileage_at_purchase: 12 },
  mods: { part_name: 'Upgrade Fixture Bumper', brand: 'ADD', category: 'Armor', status: 'Installed', cost: 2149.99, install_date: '2023-04-11', mileage_at_install: 20001 },
  maintenance_log: { service_type: 'Oil Change', date_performed: '2023-05-02', mileage: 21000, cost: 91.47, vendor: 'Upgrade Fixture Shop' },
  fuel_log: { date: '2023-05-03', odometer: 21050, gallons: 26.315, total_cost: 103.71 },
  wishlist: { part_name: 'Upgrade Fixture Winch', priority: 'High', estimated_cost: 1599.5 },
};

function run() {
  const list = tags();
  console.log('RaptorTracker upgrade tests');
  console.log(`  tags under test: ${list.join(', ') || '(none)'}`);
  if (!list.length) {
    console.log('  No released tags found — nothing to verify.');
    return;
  }

  for (const tag of list) {
    console.log(`\n  ${tag} → HEAD`);
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), `raptortracker-upg-${tag}-`));
    const staged = stageTag(tag);
    const inserted = {};

    // --- 1) Build a database as that release would have --------------------
    try {
      const r = execFileSync(process.execPath, ['-e', `
        process.env.DATA_DIR = ${JSON.stringify(tmp)};
        process.env.UPLOAD_DIR = ${JSON.stringify(path.join(tmp, 'uploads'))};
        process.env.NODE_ENV = 'test';
        require(${JSON.stringify(path.join(staged, 'init.js'))});
        const { getDb } = require(${JSON.stringify(path.join(staged, 'index.js'))});
        const db = getDb();
        const FIXTURE = ${JSON.stringify(FIXTURE)};
        ${insertPortable.toString()}
        ${tableExists.toString()}
        const used = {};
        const v = db.prepare('SELECT id FROM vehicles LIMIT 1').get();
        if (!v) throw new Error('reference vehicles were not seeded');
        used.user_vehicles = insertPortable(db, 'user_vehicles', { vehicle_id: v.id, ...FIXTURE.user_vehicles });
        const uv = db.prepare('SELECT id FROM user_vehicles ORDER BY id DESC LIMIT 1').get();
        for (const t of ['mods','maintenance_log','fuel_log','wishlist']) {
          if (tableExists(db, t)) used[t] = insertPortable(db, t, { user_vehicle_id: uv.id, ...FIXTURE[t] });
        }
        const counts = {};
        for (const t of ['user_vehicles','mods','maintenance_log','fuel_log','wishlist']) {
          if (tableExists(db, t)) counts[t] = db.prepare('SELECT COUNT(*) n FROM ' + t).get().n;
        }
        console.log(JSON.stringify({ uvId: uv.id, used, counts }));
      `], { cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
      const line = r.trim().split('\n').filter(Boolean).pop();
      Object.assign(inserted, JSON.parse(line));
      ok(`built a ${tag} database and seeded it`);
    } catch (e) {
      bad(`built a ${tag} database and seeded it`, new Error((e.stderr || e.message).toString().trim().split('\n').slice(-3).join(' | ')));
      fs.rmSync(tmp, { recursive: true, force: true });
      continue;
    }

    // --- 2) Migrate it forward with the CURRENT code -----------------------
    let db;
    try {
      const r = execFileSync(process.execPath, ['-e', `
        process.env.DATA_DIR = ${JSON.stringify(tmp)};
        process.env.NODE_ENV = 'test';
        const { getDb, closeDb } = require(${JSON.stringify(path.join(ROOT, 'server/db/index.js'))});
        getDb();
        closeDb();
        console.log('migrated');
      `], { cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
      eq(r.trim().endsWith('migrated'), true, 'migration output');
      ok('current migrations applied without throwing');
    } catch (e) {
      bad('current migrations applied without throwing', new Error((e.stderr || e.message).toString().trim().split('\n').slice(-3).join(' | ')));
      fs.rmSync(tmp, { recursive: true, force: true });
      continue;
    }

    // --- 3) The data must have survived exactly ----------------------------
    const Database = require('better-sqlite3');
    db = new Database(path.join(tmp, 'raptortracker.db'));

    for (const [table, cols] of Object.entries(inserted.used || {})) {
      if (!cols) continue;
      check(`${table}: every field survived the upgrade`, () => {
        const row = db.prepare(`SELECT * FROM ${table} ORDER BY id DESC LIMIT 1`).get();
        if (!row) throw new Error('the row is gone entirely');
        for (const c of cols) {
          if (c === 'user_vehicle_id' || c === 'vehicle_id') continue;
          const want = FIXTURE[table][c];
          if (want === undefined) continue;
          if (typeof want === 'number') {
            if (Math.abs(Number(row[c]) - want) > 1e-6) throw new Error(`${c}: expected ${want}, got ${row[c]}`);
          } else {
            eq(String(row[c]), String(want), c);
          }
        }
      });
    }

    check('the migration neither dropped nor duplicated rows', () => {
      for (const [t, n] of Object.entries(inserted.counts || {})) {
        eq(db.prepare(`SELECT COUNT(*) n FROM ${t}`).get().n, n, `${t} row count`);
      }
    });

    // --- 4) The schema must now be current ---------------------------------
    const required = [
      'vehicles', 'user_vehicles', 'mods', 'maintenance_log', 'vehicle_warranties',
      'service_intervals', 'wishlist', 'fuel_log', 'app_settings', 'sent_reminders',
      'tire_sets', 'mileage_log', 'documents', 'vehicle_specs', 'outings',
    ];
    check('every current table exists after upgrading', () => {
      const have = new Set(db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all().map(r => r.name));
      const missing = required.filter(t => !have.has(t));
      if (missing.length) throw new Error(`missing: ${missing.join(', ')}`);
    });

    check('every current column exists after upgrading', () => {
      const need = [
        ['user_vehicles', 'reclaimed_aux_switches'], ['user_vehicles', 'dismissed_recalls'],
        ['user_vehicles', 'ownership_type'], ['user_vehicles', 'mod_budget_monthly'],
        ['mods', 'aux_switches'], ['mods', 'amp_draw'], ['mods', 'attachments'],
        ['wishlist', 'amp_draw'], ['wishlist', 'aux_switch'],
        ['maintenance_log', 'service_provider_type'], ['maintenance_log', 'attachments'],
      ];
      const missing = need.filter(([t, c]) =>
        !db.prepare(`PRAGMA table_info(${t})`).all().some(x => x.name === c));
      if (missing.length) throw new Error(`missing: ${missing.map(m => m.join('.')).join(', ')}`);
    });

    check('re-running migrations on an up-to-date database is a no-op', () => {
      const before = db.prepare("SELECT COUNT(*) n FROM sqlite_master WHERE type='table'").get().n;
      db.close();
      execFileSync(process.execPath, ['-e', `
        process.env.DATA_DIR = ${JSON.stringify(tmp)};
        process.env.NODE_ENV = 'test';
        const { getDb, closeDb } = require(${JSON.stringify(path.join(ROOT, 'server/db/index.js'))});
        getDb(); closeDb();
      `], { cwd: ROOT, stdio: 'ignore' });
      const db2 = new Database(path.join(tmp, 'raptortracker.db'));
      const after = db2.prepare("SELECT COUNT(*) n FROM sqlite_master WHERE type='table'").get().n;
      const rows = db2.prepare('SELECT COUNT(*) n FROM user_vehicles').get().n;
      db2.close();
      eq(after, before, 'table count');
      eq(rows, inserted.counts.user_vehicles, 'user_vehicles count');
    });

    fs.rmSync(tmp, { recursive: true, force: true });
  }
}

try {
  run();
} finally {
  fs.rmSync(STAGE, { recursive: true, force: true });
}

if (failures) {
  console.error(`\nUPGRADE TEST FAILED — ${failures} check(s) failed.`);
  process.exit(1);
}
console.log('\nUpgrade tests passed — data survives every released version → HEAD.');
