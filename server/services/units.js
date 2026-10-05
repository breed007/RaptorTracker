/**
 * Units of measure.
 *
 * Values are stored in whatever units the owner uses — an odometer typed in
 * kilometers is stored in kilometers — so nothing rounds or drifts on the way
 * in or out. Every calculation in the app (economy, cost per distance, usage
 * rate, forecasts) is a ratio that works in any consistent units; only the
 * labels change. Switching units converts every stored value once, in a
 * single transaction, after a snapshot of the database is taken.
 *
 * Economy and currency are display-only: economy is derived from the stored
 * distance and volume, and currency is a symbol — nothing is exchanged.
 */
const { getSetting, setSetting } = require('./settings');

const MI_TO_KM = 1.609344;
const GAL_TO_L = 3.785411784;          // US gallon
const PSI_TO_KPA = 6.894757293;
const PSI_TO_BAR = 0.06894757293;

const OPTIONS = {
  distance: ['mi', 'km'],
  volume: ['gal', 'l'],
  economy: ['mpg', 'mpg_imp', 'l100km', 'kml'],
  pressure: ['psi', 'kpa', 'bar'],
};
const DEFAULTS = { distance: 'mi', volume: 'gal', economy: 'mpg', pressure: 'psi', currency: 'USD' };

// Every stored column that carries a unit. Keep this complete: a column
// missing here would keep its old units when the owner switches.
const COLUMNS = {
  distance: [
    ['fuel_log', 'odometer'], ['maintenance_log', 'mileage'], ['mileage_log', 'odometer'],
    ['mods', 'mileage_at_install'], ['outings', 'odometer_start'], ['outings', 'odometer_end'],
    ['service_intervals', 'interval_miles'], ['tire_sets', 'odometer_installed'], ['tire_sets', 'odometer_removed'],
    ['user_vehicles', 'mileage_at_purchase'], ['user_vehicles', 'current_mileage'],
    ['user_vehicles', 'lease_mileage_allowance'], ['vehicle_warranties', 'term_miles'],
  ],
  volume: [['fuel_log', 'gallons']],
  perVolume: [['fuel_log', 'price_per_gallon']], // a price per volume converts the other way
  pressure: [['outings', 'tire_psi_front'], ['outings', 'tire_psi_rear']],
};

function getUnits() {
  const pick = (key, dim) => {
    const v = getSetting(`unit_${key}`);
    return dim.includes(v) ? v : DEFAULTS[key];
  };
  const currency = getSetting('currency');
  return {
    distance: pick('distance', OPTIONS.distance),
    volume: pick('volume', OPTIONS.volume),
    economy: pick('economy', OPTIONS.economy),
    pressure: pick('pressure', OPTIONS.pressure),
    currency: /^[A-Z]{3}$/.test(currency || '') ? currency : DEFAULTS.currency,
  };
}

// Multiply a value in `from` units by this to get `to` units.
function factor(dimension, from, to) {
  if (from === to) return 1;
  if (dimension === 'distance') return from === 'mi' ? MI_TO_KM : 1 / MI_TO_KM;
  if (dimension === 'volume') return from === 'gal' ? GAL_TO_L : 1 / GAL_TO_L;
  if (dimension === 'pressure') {
    const toPsi = { psi: 1, kpa: 1 / PSI_TO_KPA, bar: 1 / PSI_TO_BAR };
    const fromPsi = { psi: 1, kpa: PSI_TO_KPA, bar: PSI_TO_BAR };
    return toPsi[from] * fromPsi[to];
  }
  throw new Error(`unknown dimension ${dimension}`);
}

const hasColumn = (db, table, col) => db.prepare(`PRAGMA table_info(${table})`).all().some(c => c.name === col);

// Converted values are rounded to what the unit is ever read to, so an edit
// form shows 124.1 kPa rather than 124.10563127399999. Switching back lands
// within that rounding; the snapshot taken before a switch keeps the originals.
const DECIMALS = { distance: 1, volume: 3, perVolume: 4, pressure: { psi: 1, kpa: 1, bar: 2 } };

/**
 * Rewrite every stored value from `from` units into `to` units. Runs inside
 * the caller's transaction. Returns the number of values changed.
 */
function convertStored(db, from, to) {
  let changed = 0;
  const scale = (pairs, f, decimals) => {
    if (f === 1) return;
    for (const [table, col] of pairs) {
      if (!hasColumn(db, table, col)) continue;
      changed += db.prepare(`UPDATE ${table} SET ${col} = ROUND(${col} * ?, ?) WHERE ${col} IS NOT NULL`).run(f, decimals).changes;
    }
  };
  scale(COLUMNS.distance, factor('distance', from.distance, to.distance), DECIMALS.distance);
  const vf = factor('volume', from.volume, to.volume);
  scale(COLUMNS.volume, vf, DECIMALS.volume);
  scale(COLUMNS.perVolume, vf === 1 ? 1 : 1 / vf, DECIMALS.perVolume);
  scale(COLUMNS.pressure, factor('pressure', from.pressure, to.pressure), DECIMALS.pressure[to.pressure]);
  changed += convertTrash(db, from, to);
  return changed;
}

// Records in the trash are JSON copies of their rows; convert them too, or a
// restore after a switch would bring back values in the old units.
function convertTrash(db, from, to) {
  if (!db.prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'trash'").get()) return 0;
  const vf = factor('volume', from.volume, to.volume);
  const rules = [
    [COLUMNS.distance, factor('distance', from.distance, to.distance), DECIMALS.distance],
    [COLUMNS.volume, vf, DECIMALS.volume],
    [COLUMNS.perVolume, vf === 1 ? 1 : 1 / vf, DECIMALS.perVolume],
    [COLUMNS.pressure, factor('pressure', from.pressure, to.pressure), DECIMALS.pressure[to.pressure]],
  ].filter(([, f]) => f !== 1);
  if (!rules.length) return 0;
  const round = (v, d) => Math.round(v * 10 ** d) / 10 ** d;
  let changed = 0;
  const update = db.prepare('UPDATE trash SET payload = ? WHERE id = ?');
  for (const t of db.prepare('SELECT id, payload FROM trash').all()) {
    let payload;
    try { payload = JSON.parse(t.payload); } catch (_) { continue; }
    for (const { table, row } of payload.rows || []) {
      for (const [pairs, f, d] of rules) {
        for (const [tbl, col] of pairs) {
          if (tbl === table && typeof row[col] === 'number') { row[col] = round(row[col] * f, d); changed++; }
        }
      }
    }
    update.run(JSON.stringify(payload), t.id);
  }
  return changed;
}

/** How many stored values carry a unit — zero on a fresh install. */
function storedValueCount(db) {
  let n = 0;
  for (const pairs of Object.values(COLUMNS)) {
    for (const [table, col] of pairs) {
      if (!hasColumn(db, table, col)) continue;
      n += db.prepare(`SELECT COUNT(*) AS n FROM ${table} WHERE ${col} IS NOT NULL`).get().n;
    }
  }
  return n;
}

/** True once the owner has picked units (or switched them) at least once. */
const unitsChosen = () => getSetting('unit_distance') != null;

function saveUnits(units) {
  for (const k of ['distance', 'volume', 'economy', 'pressure']) setSetting(`unit_${k}`, units[k]);
  setSetting('currency', units.currency);
}

const LABELS = {
  distance: { mi: { short: 'mi', long: 'miles', one: 'mile' }, km: { short: 'km', long: 'kilometers', one: 'kilometer' } },
  volume: { gal: { short: 'gal', long: 'gallons' }, l: { short: 'L', long: 'liters' } },
  economy: { mpg: 'mpg', mpg_imp: 'mpg (UK)', l100km: 'L/100 km', kml: 'km/L' },
  pressure: { psi: 'psi', kpa: 'kPa', bar: 'bar' },
};

/** The smallest "due soon" window for distance intervals: 500 mi, or 800 km. */
const dueSoonFloor = (units) => (units.distance === 'km' ? 800 : 500);

function formatDistance(n, units = getUnits(), { long = false } = {}) {
  if (n == null || !Number.isFinite(Number(n))) return null;
  const l = LABELS.distance[units.distance];
  return `${Math.round(Number(n)).toLocaleString('en-US')} ${long ? l.long : l.short}`;
}

function formatMoney(n, units = getUnits(), { decimals = 2 } = {}) {
  if (n == null || !Number.isFinite(Number(n))) return null;
  try {
    return new Intl.NumberFormat('en-US', {
      style: 'currency', currency: units.currency, minimumFractionDigits: decimals, maximumFractionDigits: decimals,
    }).format(Number(n));
  } catch (_) {
    return `${units.currency} ${Number(n).toFixed(decimals)}`;
  }
}

/** Convert stored distance-per-volume (in the stored units) into the chosen economy unit. */
function economyFrom(distPerVol, units = getUnits()) {
  if (distPerVol == null || !(distPerVol > 0)) return null;
  const mpgUs = distPerVol * factor('distance', units.distance, 'mi') / factor('volume', units.volume, 'gal');
  switch (units.economy) {
    case 'mpg_imp': return mpgUs * 1.200949925;
    case 'l100km': return 235.214583 / mpgUs;
    case 'kml': return mpgUs * 0.425143707;
    default: return mpgUs;
  }
}

/** EPA ratings are published in US mpg; express one in the chosen unit. */
function economyFromMpg(mpgUs, units = getUnits()) {
  if (mpgUs == null || !(mpgUs > 0)) return null;
  return economyFrom(mpgUs * factor('distance', 'mi', units.distance) / factor('volume', 'gal', units.volume), units);
}

/** A sensible starting set for a locale, used when a new install picks units. */
function unitsForLocale(locale = 'en-US') {
  const tag = String(locale).toLowerCase();
  const region = (tag.split(/[-_]/)[1] || '').toUpperCase();
  if (region === 'US' || !region) return { ...DEFAULTS };
  if (region === 'GB') return { distance: 'mi', volume: 'l', economy: 'mpg_imp', pressure: 'psi', currency: 'GBP' };
  const currency = { CA: 'CAD', AU: 'AUD', NZ: 'NZD', MX: 'MXN', ZA: 'ZAR', AE: 'AED', SA: 'SAR' }[region] || 'EUR';
  return { distance: 'km', volume: 'l', economy: 'l100km', pressure: region === 'CA' || region === 'AU' ? 'psi' : 'kpa', currency };
}

module.exports = {
  OPTIONS, DEFAULTS, COLUMNS, LABELS,
  getUnits, saveUnits, factor, convertStored, storedValueCount, unitsChosen, dueSoonFloor,
  formatDistance, formatMoney, economyFrom, economyFromMpg, unitsForLocale,
};
