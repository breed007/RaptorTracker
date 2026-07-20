// Shared mileage math. Both Analytics and the service Forecast need "how many
// miles does this truck actually cover per month", so it lives in one place.

const round2 = (n) => Math.round((n + Number.EPSILON) * 100) / 100;
const DAY_MS = 86400000;

function monthsBetween(aStr, bStr) {
  const a = new Date(aStr + 'T12:00:00');
  const b = new Date(bStr + 'T12:00:00');
  return Math.max(0, (b - a) / (DAY_MS * 30.4375));
}

/**
 * Every odometer reading we know about, from any source, highest-per-day,
 * ascending by date. Manual readings, fuel fills, and service records all count.
 */
function mileageTrend(db, vehicleId) {
  const points = [];
  db.prepare('SELECT date, odometer FROM mileage_log WHERE user_vehicle_id = ? AND odometer IS NOT NULL').all(vehicleId)
    .forEach(r => points.push(r));
  db.prepare('SELECT date, odometer FROM fuel_log WHERE user_vehicle_id = ? AND odometer IS NOT NULL').all(vehicleId)
    .forEach(r => points.push(r));
  db.prepare('SELECT date_performed AS date, mileage AS odometer FROM maintenance_log WHERE user_vehicle_id = ? AND mileage IS NOT NULL').all(vehicleId)
    .forEach(r => points.push(r));

  const byDay = {};
  for (const p of points) {
    if (!p.date) continue;
    if (!byDay[p.date] || p.odometer > byDay[p.date]) byDay[p.date] = p.odometer;
  }
  return Object.keys(byDay).sort().map(date => ({ date, odometer: byDay[date] }));
}

/**
 * Average miles per month across the tracked span, or null when there isn't
 * enough data to say. Returning null matters: a forecast built on a guessed
 * usage rate is worse than admitting we can't project yet.
 */
function usageRate(trend) {
  if (!trend || trend.length < 2) return { milesPerMonth: null, milesPerDay: null, totalMilesTracked: null };
  const first = trend[0];
  const last = trend[trend.length - 1];
  const totalMilesTracked = Math.max(0, last.odometer - first.odometer);
  const months = monthsBetween(first.date, last.date);
  if (months <= 0 || totalMilesTracked <= 0) {
    return { milesPerMonth: null, milesPerDay: null, totalMilesTracked };
  }
  const milesPerMonth = round2(totalMilesTracked / months);
  return { milesPerMonth, milesPerDay: round2(milesPerMonth / 30.4375), totalMilesTracked };
}

module.exports = { mileageTrend, usageRate, monthsBetween, round2 };
