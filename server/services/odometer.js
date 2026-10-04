/**
 * One source of truth for a vehicle's mileage.
 *
 * Every record that carries an odometer value is a reading. The vehicle's
 * current mileage is the highest of them, recomputed whenever a record is
 * added, edited, or deleted — so deleting a typo'd 300,000-mile fill-up
 * brings the truck back down instead of leaving it inflated forever, and a
 * service logged at a higher mileage moves the truck forward like a fill-up
 * does.
 *
 * Readings are checked against their neighbors in time. An inconsistent one
 * is still saved (people do enter history out of order) but the caller gets a
 * warning to show, naming the record it conflicts with.
 */

// [table, odometer column, date expression, label]
const SOURCES = [
  ['fuel_log', 'odometer', 'date', 'Fill-up'],
  ['maintenance_log', 'mileage', 'date_performed', 'Service'],
  ['mileage_log', 'odometer', 'date', 'Odometer reading'],
  ['mods', 'mileage_at_install', 'install_date', 'Mod install'],
  ['outings', 'odometer_start', 'date', 'Outing start'],
  ['outings', 'odometer_end', 'COALESCE(end_date, date)', 'Outing end'],
  ['tire_sets', 'odometer_installed', 'install_date', 'Tires installed'],
  ['tire_sets', 'odometer_removed', 'removed_date', 'Tires removed'],
];

// Above this many miles (or km) per day between two readings, the newer one
// is almost certainly a typo — an extra digit, or a transposed number.
const MAX_PER_DAY = 1500;

function readings(db, vehicleId) {
  const parts = SOURCES.map(([t, col, date, label]) =>
    `SELECT '${t}' AS source, id, ${col} AS odometer, ${date} AS date, '${label}' AS label
     FROM ${t} WHERE user_vehicle_id = @vid AND ${col} IS NOT NULL AND ${col} > 0`);
  parts.push(`SELECT 'user_vehicles' AS source, id, mileage_at_purchase AS odometer, purchase_date AS date,
                     'Purchase' AS label
              FROM user_vehicles WHERE id = @vid AND mileage_at_purchase IS NOT NULL AND mileage_at_purchase > 0`);
  return db.prepare(parts.join(' UNION ALL ')).all({ vid: vehicleId });
}

/** Highest reading, or null when the vehicle has no odometer data at all. */
function highestReading(db, vehicleId) {
  let best = null;
  for (const r of readings(db, vehicleId)) if (!best || r.odometer > best.odometer) best = r;
  return best;
}

/**
 * Recompute and store the vehicle's current mileage. Returns the new value.
 * A vehicle with no readings keeps whatever it had rather than dropping to
 * nothing.
 */
function refreshCurrentMileage(db, vehicleId) {
  const best = highestReading(db, vehicleId);
  if (!best) return db.prepare('SELECT current_mileage FROM user_vehicles WHERE id = ?').get(vehicleId)?.current_mileage ?? null;
  db.prepare('UPDATE user_vehicles SET current_mileage = ? WHERE id = ?').run(best.odometer, vehicleId);
  return best.odometer;
}

const fmt = (n) => Number(n).toLocaleString('en-US');
const day = (d) => String(d || '').slice(0, 10);

/**
 * Check one reading against the rest. `self` identifies the record being
 * saved ({ source, id }) so it isn't compared with itself on edit.
 * Returns a sentence to show the user, or null when the reading is consistent.
 */
function checkReading(db, vehicleId, { date, odometer, self } = {}) {
  const odo = Number(odometer);
  if (!date || !Number.isFinite(odo) || odo <= 0) return null;
  const d = day(date);
  const others = readings(db, vehicleId)
    .filter(r => r.date && !(self && r.source === self.source && r.id === Number(self.id)));

  // An earlier reading that is higher, or a later one that is lower.
  const earlierHigher = others.filter(r => day(r.date) < d && r.odometer > odo)
    .sort((a, b) => b.odometer - a.odometer)[0];
  if (earlierHigher) {
    return `${fmt(odo)} is lower than the ${earlierHigher.label.toLowerCase()} on ${day(earlierHigher.date)} ` +
      `(${fmt(earlierHigher.odometer)}). Saved anyway — check whichever one is wrong.`;
  }
  const laterLower = others.filter(r => day(r.date) > d && r.odometer < odo)
    .sort((a, b) => a.odometer - b.odometer)[0];
  if (laterLower) {
    return `${fmt(odo)} is higher than the ${laterLower.label.toLowerCase()} on ${day(laterLower.date)} ` +
      `(${fmt(laterLower.odometer)}), which comes later. Saved anyway — check whichever one is wrong.`;
  }

  // A jump that no one drives: almost always an extra digit.
  const prev = others.filter(r => day(r.date) < d).sort((a, b) => (day(b.date) > day(a.date) ? 1 : -1))[0];
  if (prev) {
    const days = Math.max(1, Math.round((new Date(d) - new Date(day(prev.date))) / 86400000));
    const perDay = (odo - prev.odometer) / days;
    if (perDay > MAX_PER_DAY) {
      return `That's ${fmt(odo - prev.odometer)} since the ${prev.label.toLowerCase()} on ${day(prev.date)} ` +
        `— about ${fmt(Math.round(perDay))} a day. Check for an extra digit.`;
    }
  }
  return null;
}

/**
 * The usual pair for a route that just wrote a record: check the reading,
 * then recompute the vehicle. Returns { warning, current_mileage }.
 */
function afterWrite(db, vehicleId, reading) {
  const warning = reading ? checkReading(db, vehicleId, reading) : null;
  const current_mileage = refreshCurrentMileage(db, vehicleId);
  return { warning, current_mileage };
}

module.exports = { SOURCES, readings, highestReading, refreshCurrentMileage, checkReading, afterWrite, MAX_PER_DAY };
