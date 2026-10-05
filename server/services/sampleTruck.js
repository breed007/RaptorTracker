/**
 * A sample truck for looking around before entering your own.
 *
 * A new install is otherwise a stack of empty pages. The sample is a 2022
 * F-150 Raptor with two and a half years of made-up but plausible history:
 * mods (one of them too big for any AUX switch, so the planner has something
 * to say), service records with one oil change coming due, a year of
 * fill-ups, tires, trail days, a wishlist, and a warranty. Dates are relative
 * to today so it never looks stale, and values are written in the owner's
 * units. It's flagged is_sample so the app can label it and remove it in one
 * click.
 */
const { getUnits, factor } = require('./units');
const { refreshCurrentMileage } = require('./odometer');
const { localDate } = require('../lib/dates');

const NICKNAME = 'Sample Raptor';

function ensureColumn(db) {
  const cols = db.prepare('PRAGMA table_info(user_vehicles)').all().map(c => c.name);
  if (!cols.includes('is_sample')) db.prepare('ALTER TABLE user_vehicles ADD COLUMN is_sample INTEGER NOT NULL DEFAULT 0').run();
}

// Small deterministic generator so every sample looks the same.
function rng(seed) {
  let s = seed >>> 0;
  return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 2 ** 32; };
}

function daysAgo(n, today = new Date()) {
  const d = new Date(today.getFullYear(), today.getMonth(), today.getDate() - n);
  return localDate(d);
}

function insert(db, table, row) {
  const cols = new Set(db.prepare(`PRAGMA table_info(${table})`).all().map(c => c.name));
  const keys = Object.keys(row).filter(k => cols.has(k) && row[k] !== undefined);
  return Number(db.prepare(`INSERT INTO ${table} (${keys.join(', ')}) VALUES (${keys.map(() => '?').join(', ')})`)
    .run(...keys.map(k => row[k])).lastInsertRowid);
}

/** Create the sample truck. Returns its user_vehicles id. */
function createSample(db, { today = new Date() } = {}) {
  ensureColumn(db);
  const ref = db.prepare("SELECT id, generation FROM vehicles WHERE make = 'Ford' AND model = 'F-150 Raptor' AND generation = 'Gen 3' LIMIT 1").get()
    || db.prepare('SELECT id, generation FROM vehicles ORDER BY id LIMIT 1').get();
  if (!ref) throw new Error('no reference vehicles to base the sample on');

  const u = getUnits();
  const fd = factor('distance', 'mi', u.distance);
  const fv = factor('volume', 'gal', u.volume);
  const fp = factor('pressure', 'psi', u.pressure);
  const dist = (mi) => (mi == null ? null : Math.round(mi * fd));
  const vol = (gal) => Math.round(gal * fv * 1000) / 1000;
  const perVol = (p) => Math.round((p / fv) * 1000) / 1000;
  const psi = (p) => Math.round(p * fp * 10) / 10;
  const day = (n) => daysAgo(n, today);
  const random = rng(2022);

  // About 1,050 miles a month since it was bought 30 months ago.
  const OWNED_DAYS = 912;
  const MI_PER_DAY = 34.5;
  const odoAt = (n) => Math.round(12 + (OWNED_DAYS - n) * MI_PER_DAY);

  let id;
  db.transaction(() => {
    id = insert(db, 'user_vehicles', {
      vehicle_id: ref.id, nickname: NICKNAME, model_year: 2022, color: 'Code Orange',
      purchase_date: day(OWNED_DAYS), mileage_at_purchase: dist(12), purchase_price: 71250,
      ownership_type: 'loan', loan_lender: 'Sample Credit Union', loan_amount: 60000, loan_apr: 5.9,
      loan_term_months: 72, loan_start_date: day(OWNED_DAYS), loan_down_payment: 11250,
      mod_budget_monthly: 400, is_sample: 1,
      notes: 'Made-up records for looking around. Remove it from the dashboard banner when you are done.',
    });

    const aux = (n) => JSON.stringify(n ? [{ switch_number: n, label: '' }] : []);
    const mods = [
      ['Fox 3.0 Live Valve Coilover Upgrade', 'Fox', 'Suspension', 'Installed', 4200, null, null, 820],
      ['Stealth Fighter Front Bumper', 'ADD', 'Bumpers', 'Installed', 2149, null, null, 760],
      ['S8 30" Light Bar', 'Baja Designs', 'Lighting', 'Installed', 899, 12, 2, 758],
      ['Squadron Sport Ditch Lights', 'Baja Designs', 'Lighting', 'Installed', 540, 5.5, 3, 758],
      ['Rock Sliders', 'RPG Offroad', 'Armor', 'Installed', 1395, null, null, 600],
      ['Rock Lights (8 pod)', 'KC HiLiTES', 'Lighting', 'Installed', 310, 3, 4, 540],
      ['Rigid 50" Roof Bar', 'Rigid', 'Lighting', 'Ordered', 1100, 24, null, null],
      ['Dual Battery Kit', 'Genesis', 'Electrical', 'Researching', 780, null, null, null],
    ];
    for (const [part_name, brand, category, status, cost, amp_draw, sw, ago] of mods) {
      insert(db, 'mods', {
        user_vehicle_id: id, part_name, brand, category, status, cost, amp_draw, aux_switches: aux(sw),
        install_date: ago != null ? day(ago) : null, mileage_at_install: ago != null ? dist(odoAt(ago)) : null,
      });
    }

    // Service history: oil roughly every 5,000 miles, plus the odd extra.
    const services = [
      ['Oil Change', 760, 95, 'dealership'], ['Oil Change', 610, 89, 'independent'],
      ['Tire Rotation', 610, 0, 'owner'], ['Oil Change', 455, 97, 'independent'],
      ['Air Filter (Engine)', 455, 42, 'owner'], ['Oil Change', 300, 99, 'owner'],
      ['Differential Service', 300, 240, 'independent'], ['Tire Rotation', 300, 0, 'owner'],
      ['Oil Change', 150, 104, 'owner'],
    ];
    for (const [service_type, ago, cost, service_provider_type] of services) {
      insert(db, 'maintenance_log', {
        user_vehicle_id: id, service_type, date_performed: day(ago), mileage: dist(odoAt(ago)), cost, service_provider_type,
      });
    }
    // Factory schedule, with the oil interval tightened the way many owners run it.
    const { getFactoryIntervals } = require('../routes/intervals');
    const toStored = (mi) => (mi == null ? null : fd === 1 ? mi : Math.round((mi * fd) / 500) * 500);
    for (const fi of getFactoryIntervals(ref.generation)) {
      const custom = fi.service_type === 'Oil Change';
      insert(db, 'service_intervals', {
        user_vehicle_id: id, service_type: fi.service_type, interval_miles: toStored(custom ? 5000 : fi.interval_miles),
        interval_months: custom ? 6 : fi.interval_months, notes: custom ? 'Shortened from the factory 10,000 for off-road use.' : fi.notes,
        is_factory: custom ? 0 : 1,
      });
    }

    // A year of fill-ups. A Raptor gets 13-16 mpg, so at this mileage that's a
    // tank every eleven days or so; the gallons follow from the miles driven.
    let prev = 372;
    for (let ago = 360; ago >= 4; prev = ago, ago -= 10 + Math.floor(random() * 4)) {
      const mpg = 13 + random() * 3.5;
      const gallons = (odoAt(ago) - odoAt(prev)) / mpg;
      const price = 3.35 + random() * 0.6;
      insert(db, 'fuel_log', {
        user_vehicle_id: id, date: day(ago), odometer: dist(odoAt(ago)), gallons: vol(gallons),
        price_per_gallon: perVol(price), total_cost: Math.round(gallons * price * 100) / 100,
        full_tank: 1, station: random() < 0.5 ? 'Shell' : 'Costco',
      });
    }

    insert(db, 'tire_sets', {
      user_vehicle_id: id, name: 'Factory BFG KO2 35s', tire_brand: 'BFGoodrich', tire_model: 'All-Terrain T/A KO2',
      tire_size: 'LT315/70R17', wheel_size: '17x8.5', is_active: 0, install_date: day(OWNED_DAYS),
      removed_date: day(840), odometer_installed: dist(12), odometer_removed: dist(odoAt(840)),
    });
    const tires = insert(db, 'tire_sets', {
      user_vehicle_id: id, name: 'BFG KO2 37s', tire_brand: 'BFGoodrich', tire_model: 'All-Terrain T/A KO2',
      tire_size: '37x12.50R17', wheel_brand: 'Method', wheel_size: '17x8.5', cost: 2400, is_active: 1,
      install_date: day(840), odometer_installed: dist(odoAt(840)),
    });

    const outings = [
      ['Moab spring trip', 'Moab, UT', "Hell's Revenge", 'difficult', 'rock', 540, 2, 18, 20, "Scraped the rear bumper on Mickey's Hot Tub."],
      ['Glamis weekend', 'Glamis, CA', 'Oldsmobile Hill', 'moderate', 'sand', 300, 1, 15, 15, ''],
      ['Forest road loop', 'Uwharrie, NC', 'Daniel Trail', 'moderate', 'mud', 120, 0, 22, 24, ''],
    ];
    for (const [name, location, trail_name, difficulty, terrain, ago, extra, front, rear, damage] of outings) {
      const start = odoAt(ago);
      insert(db, 'outings', {
        user_vehicle_id: id, name, location, trail_name, difficulty, terrain, date: day(ago),
        end_date: extra ? day(ago - extra) : null, odometer_start: dist(start), odometer_end: dist(start + 60 + extra * 80),
        tire_psi_front: psi(front), tire_psi_rear: psi(rear), tire_set_id: tires, damage,
      });
    }

    insert(db, 'wishlist', { user_vehicle_id: id, part_name: 'Winch (Warn Zeon 10-S)', brand: 'Warn', category: 'Recovery', priority: 'high', estimated_cost: 1599 });
    insert(db, 'wishlist', { user_vehicle_id: id, part_name: 'Onboard air compressor', brand: 'ARB', category: 'Recovery', priority: 'medium', estimated_cost: 520, amp_draw: 50 });
    insert(db, 'vehicle_warranties', {
      user_vehicle_id: id, warranty_name: 'Ford ESP PremiumCARE', provider: 'Ford', start_date: day(OWNED_DAYS),
      term_years: 6, term_miles: dist(100000), deductible: 100,
    });
  })();
  refreshCurrentMileage(db, id);
  return id;
}

/** Ids of sample trucks currently in the garage. */
function sampleIds(db) {
  ensureColumn(db);
  return db.prepare('SELECT id FROM user_vehicles WHERE is_sample = 1').all().map(r => r.id);
}

module.exports = { createSample, sampleIds, ensureColumn, NICKNAME };
