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
  ];
  for (const [col, sql] of uvAdditions) {
    if (!uvCols.includes(col)) db.prepare(sql).run();
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

  // New feature tables
  db.exec(`
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

module.exports = { getDb };
