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
  ];
  for (const [col, sql] of uvAdditions) {
    if (!uvCols.includes(col)) db.prepare(sql).run();
  }

  // maintenance_log columns
  const mlCols = db.prepare('PRAGMA table_info(maintenance_log)').all().map(c => c.name);
  if (!mlCols.includes('attachments')) {
    db.prepare("ALTER TABLE maintenance_log ADD COLUMN attachments TEXT NOT NULL DEFAULT '[]'").run();
  }

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
