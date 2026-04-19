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

// AUX layouts shared across Gen 2 and Gen 3
const auxLayoutGen2Gen3 = JSON.stringify([
  { switch_number: 1, fuse_amps: 15, default_label: 'Factory Fog Lights (Primary)', factory_used: true, warning_note: null },
  { switch_number: 2, fuse_amps: 15, default_label: 'Factory Fog Lights (Secondary)', factory_used: true, warning_note: null },
  { switch_number: 3, fuse_amps: 10, default_label: 'User Available', factory_used: false, warning_note: null },
  { switch_number: 4, fuse_amps: 10, default_label: 'User Available', factory_used: false, warning_note: null },
  { switch_number: 5, fuse_amps: 5,  default_label: 'User Available', factory_used: false, warning_note: null },
  { switch_number: 6, fuse_amps: 5,  default_label: 'User Available', factory_used: false, warning_note: null }
]);

const auxLayoutGen35 = JSON.stringify([
  {
    switch_number: 1, fuse_amps: 15, default_label: 'Bumper Fogs (Pair 2, Blacked-Out)',
    factory_used: true,
    warning_note: 'Factory wired to bumper fogs (pair 2, blacked-out covers). This wire is CONSUMED by Ford. Reclaiming AUX 1 requires a fog light splitter + relocation harness (e.g. SPV Parts relocation kit).'
  },
  { switch_number: 2, fuse_amps: 15, default_label: 'User Available', factory_used: false, warning_note: null },
  { switch_number: 3, fuse_amps: 15, default_label: 'User Available', factory_used: false, warning_note: null },
  { switch_number: 4, fuse_amps: 10, default_label: 'User Available', factory_used: false, warning_note: null },
  { switch_number: 5, fuse_amps: 5,  default_label: 'User Available', factory_used: false, warning_note: null },
  { switch_number: 6, fuse_amps: 5,  default_label: 'User Available', factory_used: false, warning_note: null }
]);

const auxLayoutBronco = JSON.stringify([
  { switch_number: 1, fuse_amps: 15, default_label: 'Switch 1', factory_used: false, warning_note: null },
  { switch_number: 2, fuse_amps: 15, default_label: 'Switch 2', factory_used: false, warning_note: null },
  { switch_number: 3, fuse_amps: 10, default_label: 'Switch 3', factory_used: false, warning_note: null },
  { switch_number: 4, fuse_amps: 10, default_label: 'Switch 4', factory_used: false, warning_note: null },
  { switch_number: 5, fuse_amps: 5,  default_label: 'Switch 5', factory_used: false, warning_note: null },
  { switch_number: 6, fuse_amps: 5,  default_label: 'Switch 6', factory_used: false, warning_note: null }
]);

const auxLayoutRanger = JSON.stringify([
  { switch_number: 1, fuse_amps: 15, default_label: 'Factory Fog Lights', factory_used: true, warning_note: null },
  { switch_number: 2, fuse_amps: 15, default_label: 'Factory Fog Lights', factory_used: true, warning_note: null },
  { switch_number: 3, fuse_amps: 10, default_label: 'User Available', factory_used: false, warning_note: null },
  { switch_number: 4, fuse_amps: 10, default_label: 'User Available', factory_used: false, warning_note: null },
  { switch_number: 5, fuse_amps: 5,  default_label: 'User Available', factory_used: false, warning_note: null },
  { switch_number: 6, fuse_amps: 5,  default_label: 'User Available', factory_used: false, warning_note: null }
]);

const vehicles = [
  {
    make: 'Ford',
    model: 'F-150 Raptor',
    generation: 'Gen 1',
    variant: 'SVT Raptor',
    model_year_start: 2010,
    model_year_end: 2014,
    engine_options: JSON.stringify([
      { name: '5.4L V8', displacement: '5.4L', cylinders: 'V8', years: '2010–2011', hp: 310, torque: null },
      { name: '6.2L V8', displacement: '6.2L', cylinders: 'V8', years: '2010–2014', hp: 411, torque: null }
    ]),
    horsepower: 411,
    torque: null,
    suspension_notes: 'Fox Racing internal-bypass shocks',
    tire_size: '315/70R17 BFG All-Terrain',
    aux_switch_count: 0,
    aux_switch_layout: '[]',
    notes: 'First generation. SuperCab 2010 only, SuperCrew added 2011. SVT (Special Vehicle Team) prefix used on all Gen 1 models. No overhead AUX switch panel.'
  },
  {
    make: 'Ford',
    model: 'F-150 Raptor',
    generation: 'Gen 2',
    variant: null,
    model_year_start: 2017,
    model_year_end: 2020,
    engine_options: JSON.stringify([
      { name: '3.5L EcoBoost V6 Twin-Turbo', displacement: '3.5L', cylinders: 'V6', years: '2017–2020', hp: 450, torque: 510, induction: 'Twin-Turbo' }
    ]),
    horsepower: 450,
    torque: 510,
    suspension_notes: 'Fox Racing 3.0 internal-bypass shocks with external reservoirs. Live Valve shocks added for 2019 model year.',
    tire_size: '315/70R17 BFG KO2',
    aux_switch_count: 6,
    aux_switch_layout: auxLayoutGen2Gen3,
    notes: 'Dropped V8 vs Gen 1. Aluminum body. First gen with AUX switch overhead panel. 10-speed SelectShift automatic transmission.'
  },
  {
    make: 'Ford',
    model: 'F-150 Raptor',
    generation: 'Gen 3',
    variant: null,
    model_year_start: 2021,
    model_year_end: 2023,
    engine_options: JSON.stringify([
      { name: '3.5L High-Output EcoBoost V6', displacement: '3.5L', cylinders: 'V6', years: '2021–2023', hp: 450, torque: 510, induction: 'Twin-Turbo', notes: 'Base engine' },
      { name: '5.2L Carnivore Supercharged V8', displacement: '5.2L', cylinders: 'V8', years: '2022–2023', hp: 700, torque: 640, induction: 'Supercharged', notes: 'Raptor R variant' }
    ]),
    horsepower: 700,
    torque: 645,
    suspension_notes: 'Fox Live Valve. Rear suspension switched from leaf springs to coil-spring 5-link with Panhard bar — major change vs Gen 2.',
    tire_size: '35" standard; 37" available (Raptor 37 package)',
    aux_switch_count: 6,
    aux_switch_layout: auxLayoutGen2Gen3,
    notes: 'Raptor R variant introduced for 2022 MY with 5.2L Carnivore supercharged V8. First gen with coil rear suspension. 10-speed SelectShift automatic.'
  },
  {
    make: 'Ford',
    model: 'F-150 Raptor',
    generation: 'Gen 3.5',
    variant: null,
    model_year_start: 2024,
    model_year_end: null,
    engine_options: JSON.stringify([
      { name: '3.5L High-Output EcoBoost V6', displacement: '3.5L', cylinders: 'V6', years: '2024–present', hp: 450, torque: 510, induction: 'Twin-Turbo', notes: 'Base engine' },
      { name: '5.2L Carnivore Supercharged V8', displacement: '5.2L', cylinders: 'V8', years: '2024–present', hp: 720, torque: 640, induction: 'Supercharged', notes: 'Raptor R variant' }
    ]),
    horsepower: 720,
    torque: 640,
    suspension_notes: 'FOX Dual Live Valve — position-sensitive compression control and continuously variable rebound, front and rear tuned separately. Significant upgrade over Gen 3 Live Valve.',
    tire_size: '35" standard; 37" available',
    aux_switch_count: 6,
    aux_switch_layout: auxLayoutGen35,
    notes: 'Mid-cycle refresh of Gen 3. HUD added. Raptor R bumped to 720hp for 2024. Wire color codes changed in 2024 vs Gen 3. AUX 1 factory-consumed by bumper fogs — see AUX panel for details. AUX 3 bumped to 15A (was 10A on Gen 2/3).'
  },
  {
    make: 'Ford',
    model: 'Bronco Raptor',
    generation: 'Gen 1',
    variant: null,
    model_year_start: 2022,
    model_year_end: null,
    engine_options: JSON.stringify([
      { name: '3.0L EcoBoost V6 Twin-Turbo', displacement: '3.0L', cylinders: 'V6', years: '2022–present', hp: 418, torque: 440, induction: 'Twin-Turbo' }
    ]),
    horsepower: 418,
    torque: 440,
    suspension_notes: 'HOSS 4.0 system — FOX Live Valve 3.1 internal bypass semi-active dampers. 13" front / 14" rear wheel travel. Front and rear tuned independently.',
    tire_size: '37" all-terrain (17" wheels)',
    aux_switch_count: 6,
    aux_switch_layout: auxLayoutBronco,
    notes: '4-door SUV body. Removable doors and roof panels. True dual exhaust with 4 selectable modes (Normal, Sport, Quiet, Baja). Integrated Rigid LED fog lamps standard. Extended wheelbase vs standard Bronco (+8.6 inches). Semi-float Dana 50 rear, Dana 44 AdvanTEK front. 3.06:1 4LO ratio, up to 67.7:1 crawl ratio. G.O.A.T. modes including Baja mode. AUX switch architecture differs from F-150 Raptor.'
  },
  {
    make: 'Ford',
    model: 'Ranger Raptor',
    generation: 'Gen 1 (NA)',
    variant: null,
    model_year_start: 2024,
    model_year_end: null,
    engine_options: JSON.stringify([
      { name: '3.0L EcoBoost V6 Twin-Turbo', displacement: '3.0L', cylinders: 'V6', years: '2024–present', hp: 405, torque: 430, induction: 'Twin-Turbo' }
    ]),
    horsepower: 405,
    torque: 430,
    suspension_notes: 'Fox 2.5 Live Valve internal bypass shocks',
    tire_size: '33" BFG KO2 (17" wheels)',
    aux_switch_count: 6,
    aux_switch_layout: auxLayoutRanger,
    notes: 'Mid-size sibling to F-150 Raptor. North America debut 2024 (global market since 2019). Trail Control and Trail 1-Pedal Drive standard. HUD added for 2024 refresh. 10-speed SelectShift automatic.'
  }
];

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

// Seed default user_vehicle if none exist
const existingUV = db.prepare('SELECT COUNT(*) as cnt FROM user_vehicles').get();
if (existingUV.cnt === 0) {
  const gen35 = db.prepare("SELECT id FROM vehicles WHERE generation = 'Gen 3.5' LIMIT 1").get();
  if (gen35) {
    db.prepare(`
      INSERT INTO user_vehicles
        (vehicle_id, nickname, model_year, color, package_options, notes)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(
      gen35.id,
      'Carbonized Raptor',
      2025,
      'Carbonized Gray',
      '802A package, 37-inch tires, Recaro seats, FOX Live Valve shocks',
      null
    );
    console.log('Seeded default user vehicle: Carbonized Raptor (2025 Gen 3.5).');
  }
}

console.log('Database initialization complete.');
db.close();
