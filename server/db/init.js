require('dotenv').config();
const path = require('path');
const fs = require('fs');
const Database = require('better-sqlite3');

const DATA_DIR = process.env.DATA_DIR || './data';
const UPLOAD_DIR = process.env.UPLOAD_DIR || './data/uploads';
const DB_PATH = path.join(DATA_DIR, 'raptortracker.db');

fs.mkdirSync(DATA_DIR, { recursive: true });
fs.mkdirSync(UPLOAD_DIR, { recursive: true });

const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

db.exec(`
  CREATE TABLE IF NOT EXISTS vehicles (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    make TEXT NOT NULL,
    model TEXT NOT NULL,
    generation TEXT NOT NULL,
    variant TEXT,
    model_year_start INTEGER NOT NULL,
    model_year_end INTEGER,
    engine_options TEXT NOT NULL DEFAULT '[]',
    horsepower INTEGER,
    torque INTEGER,
    suspension_notes TEXT,
    tire_size TEXT,
    aux_switch_count INTEGER DEFAULT 0,
    aux_switch_layout TEXT DEFAULT '[]',
    notes TEXT
  );

  CREATE TABLE IF NOT EXISTS user_vehicles (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    vehicle_id INTEGER NOT NULL REFERENCES vehicles(id),
    nickname TEXT NOT NULL,
    model_year INTEGER NOT NULL,
    color TEXT,
    vin TEXT,
    purchase_date TEXT,
    mileage_at_purchase INTEGER,
    package_options TEXT,
    notes TEXT,
    created_at TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS mods (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_vehicle_id INTEGER NOT NULL REFERENCES user_vehicles(id) ON DELETE CASCADE,
    part_name TEXT NOT NULL,
    part_number TEXT,
    brand TEXT,
    vendor TEXT,
    vendor_url TEXT,
    category TEXT NOT NULL DEFAULT 'Other',
    status TEXT NOT NULL DEFAULT 'Researching',
    purchase_date TEXT,
    install_date TEXT,
    cost REAL,
    aux_switch INTEGER,
    aux_label TEXT,
    install_notes TEXT,
    wiring_notes TEXT,
    photos TEXT DEFAULT '[]',
    mileage_at_install INTEGER,
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS maintenance_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_vehicle_id INTEGER NOT NULL REFERENCES user_vehicles(id) ON DELETE CASCADE,
    service_type TEXT NOT NULL,
    date_performed TEXT NOT NULL,
    mileage INTEGER,
    cost REAL,
    vendor TEXT,
    notes TEXT,
    created_at TEXT DEFAULT (datetime('now'))
  );
`);

// Migrate: add columns that may be missing from older DBs
const modsColumns = db.prepare('PRAGMA table_info(mods)').all().map(c => c.name);
if (!modsColumns.includes('mileage_at_install')) {
  db.prepare('ALTER TABLE mods ADD COLUMN mileage_at_install INTEGER').run();
  console.log('Migration: added mileage_at_install to mods');
}

const uvColumns = db.prepare('PRAGMA table_info(user_vehicles)').all().map(c => c.name);
if (!uvColumns.includes('window_sticker')) {
  db.prepare('ALTER TABLE user_vehicles ADD COLUMN window_sticker TEXT').run();
  console.log('Migration: added window_sticker to user_vehicles');
}

// Factory AUX layouts live in one reference module, with a source cited for
// each generation. Gen 2 and Gen 3 used to share a single copied constant,
// which is how Gen 3's (different) ratings were wrong for so long.
const { layoutFor } = require('../reference/auxLayouts');
const aux = (model, generation) => {
  const l = layoutFor(model, generation);
  return { aux_switch_count: l ? l.switches.length : 0, aux_switch_layout: JSON.stringify(l ? l.switches : []) };
};

const { REFERENCE_VEHICLES } = require('../reference/vehicles');
const vehicles = REFERENCE_VEHICLES.map(v => ({ ...v, engine_options: JSON.stringify(v.engine_options), ...aux(v.model, v.generation) }));

// Only seed if table is empty
const existing = db.prepare('SELECT COUNT(*) as cnt FROM vehicles').get();
if (existing.cnt === 0) {
  console.log('Seeding vehicles...');
  const insertVehicle = db.prepare(`
    INSERT INTO vehicles
      (make, model, generation, variant, model_year_start, model_year_end,
       engine_options, horsepower, torque, suspension_notes, tire_size,
       aux_switch_count, aux_switch_layout, notes)
    VALUES
      (@make, @model, @generation, @variant, @model_year_start, @model_year_end,
       @engine_options, @horsepower, @torque, @suspension_notes, @tire_size,
       @aux_switch_count, @aux_switch_layout, @notes)
  `);

  const seedAll = db.transaction((rows) => {
    for (const row of rows) insertVehicle.run(row);
  });
  seedAll(vehicles);
  console.log(`  Inserted ${vehicles.length} vehicles.`);
} else {
  console.log(`Vehicles table already has ${existing.cnt} records — skipping vehicle seed.`);
}

// NOTE: no default user_vehicle is seeded. A fresh install starts with an empty
// garage so the owner is walked through adding their own truck on first run.
// (Seeding a sample vehicle meant every new install booted into someone else's Raptor.)

console.log('Database initialization complete.');
db.close();
