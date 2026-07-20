const Database = require('better-sqlite3');
const path = require('path');

const DATA_DIR = process.env.DATA_DIR || './data';
const DB_PATH = path.join(DATA_DIR, 'raptortracker.db');

let _db;

function getDb() {
  if (!_db) {
    _db = new Database(DB_PATH);
    _db.pragma('journal_mode = WAL');
    _db.pragma('foreign_keys = ON');
    runMigrations(_db);
  }
  return _db;
}

function runMigrations(db) {
  // user_vehicles columns
  const uvCols = db.prepare('PRAGMA table_info(user_vehicles)').all().map(c => c.name);
  const uvAdditions = [
    ['window_sticker',            'ALTER TABLE user_vehicles ADD COLUMN window_sticker TEXT'],
    ['vehicle_photos',            "ALTER TABLE user_vehicles ADD COLUMN vehicle_photos TEXT NOT NULL DEFAULT '[]'"],
    ['profile_photo',             'ALTER TABLE user_vehicles ADD COLUMN profile_photo TEXT'],
    ['purchase_price',            'ALTER TABLE user_vehicles ADD COLUMN purchase_price REAL'],
    ['seller_name',               'ALTER TABLE user_vehicles ADD COLUMN seller_name TEXT'],
    ['seller_contact',            'ALTER TABLE user_vehicles ADD COLUMN seller_contact TEXT'],
    ['service_dealership',        'ALTER TABLE user_vehicles ADD COLUMN service_dealership TEXT'],
    ['service_dealership_contact','ALTER TABLE user_vehicles ADD COLUMN service_dealership_contact TEXT'],
    ['current_mileage',           'ALTER TABLE user_vehicles ADD COLUMN current_mileage INTEGER'],
    ['dismissed_aux_warnings',    "ALTER TABLE user_vehicles ADD COLUMN dismissed_aux_warnings TEXT NOT NULL DEFAULT '[]'"],
    ['reclaimed_aux_switches',    "ALTER TABLE user_vehicles ADD COLUMN reclaimed_aux_switches TEXT NOT NULL DEFAULT '[]'"],
    ['dismissed_recalls',         "ALTER TABLE user_vehicles ADD COLUMN dismissed_recalls TEXT NOT NULL DEFAULT '[]'"],
    ['mod_budget_monthly',        'ALTER TABLE user_vehicles ADD COLUMN mod_budget_monthly REAL'],
    // Financing / ownership (for Total Cost of Ownership)
    ['ownership_type',            "ALTER TABLE user_vehicles ADD COLUMN ownership_type TEXT NOT NULL DEFAULT 'owned'"], // owned | loan | lease
    ['loan_lender',              'ALTER TABLE user_vehicles ADD COLUMN loan_lender TEXT'],
    ['loan_amount',              'ALTER TABLE user_vehicles ADD COLUMN loan_amount REAL'],
    ['loan_apr',                 'ALTER TABLE user_vehicles ADD COLUMN loan_apr REAL'],
    ['loan_term_months',         'ALTER TABLE user_vehicles ADD COLUMN loan_term_months INTEGER'],
    ['loan_start_date',          'ALTER TABLE user_vehicles ADD COLUMN loan_start_date TEXT'],
    ['loan_monthly_payment',     'ALTER TABLE user_vehicles ADD COLUMN loan_monthly_payment REAL'],
    ['loan_down_payment',        'ALTER TABLE user_vehicles ADD COLUMN loan_down_payment REAL'],
    ['lease_lender',             'ALTER TABLE user_vehicles ADD COLUMN lease_lender TEXT'],
    ['lease_monthly_payment',    'ALTER TABLE user_vehicles ADD COLUMN lease_monthly_payment REAL'],
    ['lease_term_months',        'ALTER TABLE user_vehicles ADD COLUMN lease_term_months INTEGER'],
    ['lease_start_date',         'ALTER TABLE user_vehicles ADD COLUMN lease_start_date TEXT'],
    ['lease_down_payment',       'ALTER TABLE user_vehicles ADD COLUMN lease_down_payment REAL'],
    ['lease_mileage_allowance',  'ALTER TABLE user_vehicles ADD COLUMN lease_mileage_allowance INTEGER'],
    ['lease_buyout',             'ALTER TABLE user_vehicles ADD COLUMN lease_buyout REAL'],
    // Registration / inspection / insurance (compliance reminders)
    ['registration_expiry',      'ALTER TABLE user_vehicles ADD COLUMN registration_expiry TEXT'],
    ['inspection_expiry',        'ALTER TABLE user_vehicles ADD COLUMN inspection_expiry TEXT'],
    ['insurance_provider',       'ALTER TABLE user_vehicles ADD COLUMN insurance_provider TEXT'],
    ['insurance_policy',         'ALTER TABLE user_vehicles ADD COLUMN insurance_policy TEXT'],
    ['insurance_phone',          'ALTER TABLE user_vehicles ADD COLUMN insurance_phone TEXT'],
    ['insurance_expiry',         'ALTER TABLE user_vehicles ADD COLUMN insurance_expiry TEXT'],
  ];
  for (const [col, sql] of uvAdditions) {
    if (!uvCols.includes(col)) db.prepare(sql).run();
  }

  // maintenance_log: service provider type (dealership | independent | owner)
  const mlCols2 = db.prepare('PRAGMA table_info(maintenance_log)').all().map(c => c.name);
  if (!mlCols2.includes('service_provider_type')) {
    db.prepare('ALTER TABLE maintenance_log ADD COLUMN service_provider_type TEXT').run();
  }

  // wishlist: electrical planning — how much current an item draws and which
  // AUX switch you intend to hang it on (feeds the capacity planner)
  const wlCols = db.prepare('PRAGMA table_info(wishlist)').all().map(c => c.name);
  const wlAdditions = [
    ['amp_draw',   'ALTER TABLE wishlist ADD COLUMN amp_draw REAL'],
    ['aux_switch', 'ALTER TABLE wishlist ADD COLUMN aux_switch INTEGER'],
  ];
  for (const [col, sql] of wlAdditions) {
    if (!wlCols.includes(col)) db.prepare(sql).run();
  }

  // maintenance_log columns
  const mlCols = db.prepare('PRAGMA table_info(maintenance_log)').all().map(c => c.name);
  if (!mlCols.includes('attachments')) {
    db.prepare("ALTER TABLE maintenance_log ADD COLUMN attachments TEXT NOT NULL DEFAULT '[]'").run();
  }

  // vehicles: add EPA MPG columns
  const vCols = db.prepare('PRAGMA table_info(vehicles)').all().map(c => c.name);
  if (!vCols.includes('mpg_city')) {
    db.prepare('ALTER TABLE vehicles ADD COLUMN mpg_city INTEGER').run();
    db.prepare('ALTER TABLE vehicles ADD COLUMN mpg_highway INTEGER').run();
    // Seed EPA ratings per generation
    db.prepare("UPDATE vehicles SET mpg_city=11, mpg_highway=16 WHERE generation='Gen 1' AND make='Ford'").run();
    db.prepare("UPDATE vehicles SET mpg_city=15, mpg_highway=18 WHERE generation IN ('Gen 2','Gen 3') AND make='Ford'").run();
    // Gen 3.5 standard (non-R)
    db.prepare("UPDATE vehicles SET mpg_city=15, mpg_highway=18 WHERE generation='Gen 3.5' AND make='Ford' AND (variant IS NULL OR (variant NOT LIKE '%R%' AND variant NOT LIKE '%Raptor R%'))").run();
    // Gen 3.5 Raptor R
    db.prepare("UPDATE vehicles SET mpg_city=10, mpg_highway=16 WHERE generation='Gen 3.5' AND make='Ford' AND variant LIKE '%R%'").run();
    // Ranger Raptor
    db.prepare("UPDATE vehicles SET mpg_city=17, mpg_highway=19 WHERE model='Ranger Raptor' AND make='Ford'").run();
  }

  // mods: warranty columns + multi-aux column
  const modCols = db.prepare('PRAGMA table_info(mods)').all().map(c => c.name);
  const modWarrantyCols = [
    ['warranty_months',     'ALTER TABLE mods ADD COLUMN warranty_months INTEGER'],
    ['warranty_start_date', 'ALTER TABLE mods ADD COLUMN warranty_start_date TEXT'],
    ['warranty_provider',   'ALTER TABLE mods ADD COLUMN warranty_provider TEXT'],
    ['warranty_notes',      'ALTER TABLE mods ADD COLUMN warranty_notes TEXT'],
    ['aux_switches',        "ALTER TABLE mods ADD COLUMN aux_switches TEXT NOT NULL DEFAULT '[]'"],
    ['amp_draw',            'ALTER TABLE mods ADD COLUMN amp_draw REAL'],
    // Receipts / invoices, kept separate from build photos
    ['attachments',         "ALTER TABLE mods ADD COLUMN attachments TEXT NOT NULL DEFAULT '[]'"],
  ];
  for (const [col, sql] of modWarrantyCols) {
    if (!modCols.includes(col)) db.prepare(sql).run();
  }
  // Migrate existing single-switch mods into the aux_switches array
  const needsMigration = db.prepare(
    "SELECT id, aux_switch, aux_label FROM mods WHERE aux_switch IS NOT NULL AND aux_switches = '[]'"
  ).all();
  if (needsMigration.length) {
    const migrateStmt = db.prepare('UPDATE mods SET aux_switches = ? WHERE id = ?');
    for (const m of needsMigration) {
      migrateStmt.run(JSON.stringify([{ switch_number: m.aux_switch, label: m.aux_label || '' }]), m.id);
    }
  }

  // New feature tables
  db.exec(`
    CREATE TABLE IF NOT EXISTS vehicle_warranties (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_vehicle_id INTEGER NOT NULL REFERENCES user_vehicles(id) ON DELETE CASCADE,
      warranty_name TEXT NOT NULL,
      provider TEXT NOT NULL,
      provider_url TEXT,
      purchase_date TEXT,
      start_date TEXT,
      term_years INTEGER,
      term_miles INTEGER,
      expiration_date TEXT,
      deductible REAL,
      cost REAL,
      contract_number TEXT,
      claims_phone TEXT,
      notes TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS service_intervals (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_vehicle_id INTEGER NOT NULL REFERENCES user_vehicles(id) ON DELETE CASCADE,
      service_type TEXT NOT NULL,
      interval_miles INTEGER,
      interval_months INTEGER,
      notes TEXT DEFAULT '',
      is_factory INTEGER NOT NULL DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS wishlist (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_vehicle_id INTEGER NOT NULL REFERENCES user_vehicles(id) ON DELETE CASCADE,
      part_name TEXT NOT NULL,
      brand TEXT DEFAULT '',
      part_number TEXT DEFAULT '',
      category TEXT DEFAULT '',
      estimated_cost REAL,
      priority TEXT DEFAULT 'medium',
      vendor_name TEXT DEFAULT '',
      vendor_url TEXT DEFAULT '',
      notes TEXT DEFAULT '',
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS fuel_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_vehicle_id INTEGER NOT NULL REFERENCES user_vehicles(id) ON DELETE CASCADE,
      date TEXT NOT NULL,
      odometer INTEGER NOT NULL,
      gallons REAL NOT NULL,
      price_per_gallon REAL,
      total_cost REAL,
      station TEXT DEFAULT '',
      notes TEXT DEFAULT '',
      full_tank INTEGER NOT NULL DEFAULT 1,
      trip_type TEXT DEFAULT 'mixed',
      created_at TEXT DEFAULT (datetime('now'))
    );

    -- Key/value store for app-level settings (notification prefs, etc.)
    CREATE TABLE IF NOT EXISTS app_settings (
      key TEXT PRIMARY KEY,
      value TEXT
    );

    -- De-dupe log so reminder emails aren't re-sent every day for the same event
    CREATE TABLE IF NOT EXISTS sent_reminders (
      signature TEXT PRIMARY KEY,
      sent_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    -- Tire / wheel sets (e.g. street vs off-road), with mileage per set
    CREATE TABLE IF NOT EXISTS tire_sets (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_vehicle_id INTEGER NOT NULL REFERENCES user_vehicles(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      tire_brand TEXT DEFAULT '',
      tire_model TEXT DEFAULT '',
      tire_size TEXT DEFAULT '',
      wheel_brand TEXT DEFAULT '',
      wheel_size TEXT DEFAULT '',
      quantity INTEGER DEFAULT 4,
      cost REAL,
      purchase_date TEXT,
      install_date TEXT,
      removed_date TEXT,
      odometer_installed INTEGER,
      odometer_removed INTEGER,
      is_active INTEGER NOT NULL DEFAULT 0,
      notes TEXT DEFAULT '',
      created_at TEXT DEFAULT (datetime('now'))
    );

    -- Trail / outing log: how the truck actually gets used. Everything else in
    -- the app records what was done *to* the vehicle; this records the driving.
    CREATE TABLE IF NOT EXISTS outings (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_vehicle_id INTEGER NOT NULL REFERENCES user_vehicles(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      date TEXT NOT NULL,
      end_date TEXT,
      location TEXT DEFAULT '',
      trail_name TEXT DEFAULT '',
      difficulty TEXT DEFAULT '',
      terrain TEXT DEFAULT '',
      odometer_start INTEGER,
      odometer_end INTEGER,
      tire_psi_front REAL,
      tire_psi_rear REAL,
      tire_set_id INTEGER REFERENCES tire_sets(id) ON DELETE SET NULL,
      companions TEXT DEFAULT '',
      conditions TEXT DEFAULT '',
      damage TEXT DEFAULT '',
      notes TEXT DEFAULT '',
      photos TEXT NOT NULL DEFAULT '[]',
      created_at TEXT DEFAULT (datetime('now'))
    );

    -- Owner-maintained spec sheet (fluid capacities, torque values, bulb sizes…).
    -- Deliberately per-vehicle and user-supplied: RaptorTracker links to Ford's
    -- official documentation rather than reproducing copyrighted service data.
    CREATE TABLE IF NOT EXISTS vehicle_specs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_vehicle_id INTEGER NOT NULL REFERENCES user_vehicles(id) ON DELETE CASCADE,
      category TEXT DEFAULT 'other',
      name TEXT NOT NULL,
      value TEXT DEFAULT '',
      unit TEXT DEFAULT '',
      source TEXT DEFAULT '',
      notes TEXT DEFAULT '',
      created_at TEXT DEFAULT (datetime('now'))
    );

    -- Vehicle document vault: title, registration card, insurance card, bill of
    -- sale, and anything else worth keeping with the truck.
    CREATE TABLE IF NOT EXISTS documents (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_vehicle_id INTEGER NOT NULL REFERENCES user_vehicles(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      doc_type TEXT DEFAULT 'other',
      file_path TEXT NOT NULL,
      original_name TEXT DEFAULT '',
      size_bytes INTEGER,
      expires_on TEXT,
      notes TEXT DEFAULT '',
      created_at TEXT DEFAULT (datetime('now'))
    );

    -- Manual odometer readings (fuel/maintenance mileage is unioned in for analytics)
    CREATE TABLE IF NOT EXISTS mileage_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_vehicle_id INTEGER NOT NULL REFERENCES user_vehicles(id) ON DELETE CASCADE,
      date TEXT NOT NULL,
      odometer INTEGER NOT NULL,
      note TEXT DEFAULT '',
      created_at TEXT DEFAULT (datetime('now'))
    );
  `);

  // Fix Gen 3.5 AUX 2: should be factory_used: false (available), not factory_used: true
  const gen35 = db.prepare("SELECT id, aux_switch_layout FROM vehicles WHERE generation = 'Gen 3.5'").get();
  if (gen35) {
    try {
      const layout = JSON.parse(gen35.aux_switch_layout || '[]');
      const aux2 = layout.find(s => s.switch_number === 2);
      if (aux2 && aux2.factory_used === true && aux2.default_label === 'Factory Fog Lights (Primary)') {
        aux2.factory_used = false;
        aux2.default_label = 'User Available';
        db.prepare('UPDATE vehicles SET aux_switch_layout = ? WHERE id = ?')
          .run(JSON.stringify(layout), gen35.id);
      }
    } catch (_) {}
  }
}

// Close the singleton connection (used by the restore flow before swapping the
// database file). The next getDb() call reopens and re-runs migrations.
function closeDb() {
  if (_db) {
    try { _db.close(); } catch (_) { /* ignore */ }
    _db = null;
  }
}

module.exports = { getDb, closeDb, DB_PATH, DATA_DIR };
