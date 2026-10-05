/**
 * Import from the apps owners are switching from: Fuelly, Drivvo, and
 * Simply Auto. Their exports aren't shaped like a plain spreadsheet, so each
 * gets its own reader, written against real export files:
 *
 *   Fuelly       one CSV for all vehicles (car_name column). Headers carry the
 *                units: gallons/miles or litres/km. `price` is per unit.
 *                Lines can end in a bare CR, and headers have stray spaces.
 *   Drivvo       one file in sections (##Vehicle, ##Refuelling, ##Service,
 *                ##Expense). Header text is translated into the phone's
 *                language, so columns are read by position. No units in the
 *                file; dates are day-first or ISO.
 *   Simply Auto  Fuel_Log.csv with fuel, service, and expense rows told apart
 *                by Record Type (0, 1, 2), the date split over Day / Month /
 *                Year, and Partial Tank / Missed Fill Up flags.
 *
 * Everything comes out as fuel_log and maintenance_log rows in the owner's
 * units, with the problems found listed by line.
 */
const { parseCsv, toNumber, toFlag, toText } = require('./csvImport');
const { getUnits, factor } = require('./units');

const SOURCES = {
  fuelly: 'Fuelly',
  drivvo: 'Drivvo',
  simplyauto: 'Simply Auto',
};

const clean = (h) => String(h || '').trim().toLowerCase();

/** Which app wrote this file, or null. */
function detect(text) {
  const head = String(text).replace(/^﻿/, '').slice(0, 4000);
  if (/^#{1,2}\s*(refuelling|reabastecimiento|abastecimento|service|servicio|vehicle)\b/im.test(head)) return 'drivvo';
  const firstLine = head.split(/\r\n|\r|\n/, 1)[0].split(/[;,]/).map(clean);
  if (firstLine.includes('fuelup_date') && (firstLine.includes('gallons') || firstLine.includes('litres') || firstLine.includes('liters'))) return 'fuelly';
  if (firstLine.includes('record type') && firstLine.includes('qty')) return 'simplyauto';
  return null;
}

// Numbers as phones write them: "1.234,56" and "45,3" as well as "1,234.56".
function looseNumber(v) {
  if (v == null) return null;
  let s = String(v).trim().replace(/[^\d.,-]/g, '');
  if (!s) return null;
  const lastComma = s.lastIndexOf(',');
  const lastDot = s.lastIndexOf('.');
  if (lastComma > lastDot) s = s.replace(/\./g, '').replace(',', '.');
  else s = s.replace(/,/g, '');
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

// ── Dates ────────────────────────────────────────────────────────────────────

const pad = (n) => String(n).padStart(2, '0');

/**
 * Decide whether a/b/yyyy dates in this file are day-first. Any part over 12
 * settles it; otherwise use the app's habit (Fuelly is US month-first, Drivvo
 * day-first), unless the owner chose.
 */
function dayFirstFor(raws, fallbackDayFirst, choice) {
  if (choice === 'dmy') return true;
  if (choice === 'mdy') return false;
  let a = false; let b = false;
  for (const r of raws) {
    const m = String(r || '').trim().match(/^(\d{1,2})[/.-](\d{1,2})[/.-]\d{2,4}/);
    if (!m) continue;
    if (Number(m[1]) > 12) a = true;
    if (Number(m[2]) > 12) b = true;
  }
  if (a && !b) return true;
  if (b && !a) return false;
  return fallbackDayFirst;
}

function readDate(raw, dayFirst) {
  const s = String(raw || '').trim();
  let m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (m) return valid(+m[1], +m[2], +m[3]);
  m = s.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})/);
  if (!m) return null;
  let year = +m[3];
  if (m[3].length === 2) year += year > 70 ? 1900 : 2000;
  return dayFirst ? valid(year, +m[2], +m[1]) : valid(year, +m[1], +m[2]);
}

function valid(y, mo, d) {
  const dt = new Date(y, mo - 1, d);
  if (dt.getFullYear() !== y || dt.getMonth() !== mo - 1 || dt.getDate() !== d) return null;
  return `${y}-${pad(mo)}-${pad(d)}`;
}

// ── Readers ──────────────────────────────────────────────────────────────────
// Each returns { vehicles: [{ key, name }], units: {distance, volume} | null,
// fuel: [...], service: [...], skipped: { expenses }, errors: [...], dayFirst }
// with values still in the file's units.

function readFuelly(text, opts) {
  const table = parseCsv(text);
  if (table.length < 2) return empty();
  const head = table[0].map(clean);
  const col = (name) => head.indexOf(name);
  const has = (name) => col(name) !== -1;
  const units = { distance: has('miles') ? 'mi' : 'km', volume: has('gallons') ? 'gal' : 'l' };
  const qtyCol = col(units.volume === 'gal' ? 'gallons' : has('litres') ? 'litres' : 'liters');
  const tripCol = col(units.distance === 'mi' ? 'miles' : 'km');
  const dayFirst = dayFirstFor(table.slice(1).map(r => r[col('fuelup_date')]), false, opts.dateOrder);

  const fuel = []; const errors = []; const names = new Map();
  for (let i = 1; i < table.length; i++) {
    const r = table[i];
    const vehicle = toText(r[col('car_name')]) || 'Vehicle';
    names.set(vehicle, (names.get(vehicle) || 0) + 1);
    const date = readDate(r[col('fuelup_date')], dayFirst);
    const qty = looseNumber(r[qtyCol]);
    const odo = looseNumber(r[col('odometer')]);
    if (!date || !(qty > 0)) { errors.push({ line: i + 1, vehicle, message: `Unreadable date or fuel amount ("${r[col('fuelup_date')] ?? ''}", "${r[qtyCol] ?? ''}")` }); continue; }
    const price = looseNumber(r[col('price')]);
    fuel.push({
      vehicle, line: i + 1, date, odometer: odo > 0 ? odo : null, trip: looseNumber(r[tripCol]),
      volume: qty, pricePerUnit: price > 0 ? price : null, total: price > 0 ? Math.round(price * qty * 100) / 100 : null,
      full: !toFlag(r[col('partial_fuelup')]), missed: toFlag(r[col('missed_fuelup')]),
      notes: [toText(r[col('notes')]), toText(r[col('tags')])].filter(Boolean).join(' · ') || null,
    });
  }
  fillOdometerFromTrips(fuel, errors);
  return { vehicles: [...names].map(([name, count]) => ({ key: name, name, count })), units, fuel, service: [], skipped: {}, errors, dayFirst };
}

// Fuelly owners who log trip distance instead of the odometer: rebuild the
// odometer from the last known reading plus each trip, in date order.
function fillOdometerFromTrips(fuel, errors) {
  const byVehicle = {};
  for (const f of fuel) (byVehicle[f.vehicle] ||= []).push(f);
  for (const list of Object.values(byVehicle)) {
    list.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
    let last = null;
    for (const f of list) {
      if (f.odometer == null && last != null && f.trip > 0) f.odometer = last + f.trip;
      if (f.odometer != null) last = f.odometer;
    }
  }
  for (let i = fuel.length - 1; i >= 0; i--) {
    if (fuel[i].odometer == null) {
      errors.push({ line: fuel[i].line, vehicle: fuel[i].vehicle, message: 'No odometer reading, and none earlier to count trip distance from' });
      fuel.splice(i, 1);
    }
  }
}

function drivvoSections(text) {
  const sections = {};
  let current = null;
  for (const line of String(text).replace(/^﻿/, '').split(/\r\n|\r|\n/)) {
    const m = line.match(/^#{1,2}\s*([^,;]+)/);
    if (m) {
      const name = m[1].trim().toLowerCase();
      current = /refuel|reabast|abastec|tank/.test(name) ? 'fuel'
        : /servi/.test(name) ? 'service'
        : /expens|despes|gasto/.test(name) ? 'expense'
        : /vehic|veic/.test(name) ? 'vehicle' : 'other';
      sections[current] = [];
      continue;
    }
    if (current) sections[current].push(line);
  }
  return Object.fromEntries(Object.entries(sections).map(([k, lines]) => [k, parseCsv(lines.join('\n'))]));
}

const DRIVVO_YES = ['yes', 'sim', 'si', 'sí', 'ja', 'tak', 'oui', 'da', 'evet', '1', 'true'];

function readDrivvo(text, opts) {
  const s = drivvoSections(text);
  const vehicleName = s.vehicle?.[1]?.filter(Boolean).slice(0, 3).join(' ').trim() || 'Drivvo vehicle';
  const fuelRows = (s.fuel || []).slice(1);
  const serviceRows = (s.service || []).slice(1);
  const dayFirst = dayFirstFor([...fuelRows, ...serviceRows].map(r => r[1]), true, opts.dateOrder);
  const fuel = []; const service = []; const errors = [];

  fuelRows.forEach((r, i) => {
    const date = readDate(r[1], dayFirst);
    const odo = looseNumber(r[0]);
    const qty = looseNumber(r[5]);
    if (!date || !(odo > 0) || !(qty > 0)) { errors.push({ line: i + 2, section: 'Refuelling', message: 'Unreadable odometer, date, or volume' }); return; }
    const price = looseNumber(r[3]);
    const total = looseNumber(r[4]);
    fuel.push({
      vehicle: vehicleName, date, odometer: odo, volume: qty,
      pricePerUnit: price > 0 ? price : (total > 0 ? Math.round((total / qty) * 1000) / 1000 : null),
      total: total > 0 ? total : (price > 0 ? Math.round(price * qty * 100) / 100 : null),
      full: r[6] == null || r[6] === '' ? true : DRIVVO_YES.includes(String(r[6]).trim().toLowerCase()),
      missed: false, notes: toText(r[18]) || null, station: null,
    });
  });
  serviceRows.forEach((r, i) => {
    const date = readDate(r[1], dayFirst);
    const title = toText(r[3]);
    if (!date || !title) { errors.push({ line: i + 2, section: 'Service', message: 'Unreadable date or service name' }); return; }
    const odo = looseNumber(r[0]);
    service.push({ vehicle: vehicleName, date, odometer: odo > 0 ? odo : null, title, cost: looseNumber(r[2]), notes: toText(r[5]) || null });
  });
  const total = fuel.length + service.length;
  return {
    vehicles: [{ key: vehicleName, name: vehicleName, count: total }], units: null, fuel, service,
    skipped: { expenses: Math.max(0, (s.expense || []).length - 1) }, errors, dayFirst,
  };
}

function readSimplyAuto(text) {
  const table = parseCsv(text);
  if (table.length < 2) return empty();
  const head = table[0].map(clean);
  const c = (name) => head.indexOf(name);
  const get = (r, name) => (c(name) === -1 ? undefined : r[c(name)]);
  const fuel = []; const service = []; const errors = []; const names = new Map(); let expenses = 0;

  for (let i = 1; i < table.length; i++) {
    const r = table[i];
    const vehicle = `Vehicle ${toText(get(r, 'vehicle id')) || '1'}`;
    const kind = String(get(r, 'record type') ?? '0').trim();
    const date = valid(Number(get(r, 'year')), Number(get(r, 'month')), Number(get(r, 'day')));
    const odo = looseNumber(get(r, 'odometer'));
    const cost = looseNumber(get(r, 'total cost'));
    if (kind === '2') { expenses++; continue; }
    names.set(vehicle, (names.get(vehicle) || 0) + 1);
    if (!date) { errors.push({ line: i + 1, vehicle, message: 'Unreadable Day / Month / Year' }); continue; }
    if (kind === '1') {
      const tasks = toText(get(r, 'record desc')) || 'Service';
      service.push({ vehicle, date, odometer: odo > 0 ? odo : null, title: tasks.split(',').map(t => t.trim()).filter(Boolean).join(', '), cost, notes: toText(get(r, 'notes')) || null });
      continue;
    }
    const qty = looseNumber(get(r, 'qty'));
    if (!(odo > 0) || !(qty > 0)) { errors.push({ line: i + 1, vehicle, message: 'Unreadable odometer or quantity' }); continue; }
    fuel.push({
      vehicle, date, odometer: odo, volume: qty,
      pricePerUnit: cost > 0 ? Math.round((cost / qty) * 1000) / 1000 : null, total: cost > 0 ? cost : null,
      full: !toFlag(get(r, 'partial tank')), missed: toFlag(get(r, 'missed fill up')),
      station: [toText(get(r, 'filling station')), toText(get(r, 'fuel brand'))].filter(Boolean).join(' · ') || null,
      notes: toText(get(r, 'notes')) || null,
    });
  }
  return { vehicles: [...names].map(([name, count]) => ({ key: name, name, count })), units: null, fuel, service, skipped: { expenses }, errors, dayFirst: null };
}

const empty = () => ({ vehicles: [], units: null, fuel: [], service: [], skipped: {}, errors: [], dayFirst: null });
const READERS = { fuelly: readFuelly, drivvo: readDrivvo, simplyauto: readSimplyAuto };

/**
 * Read an export and shape it for one vehicle in this install.
 * opts: { source?, vehicle?, sourceUnits?: 'mi-gal' | 'km-l', dateOrder?: 'auto' | 'mdy' | 'dmy' }
 */
function analyzeApp(text, opts = {}) {
  const source = opts.source || detect(text);
  if (!READERS[source]) return null;
  const read = READERS[source](text, opts);

  // The file's units: Fuelly says; the others don't, so the owner tells us
  // (default: the same units this install uses).
  const owner = getUnits();
  const fromFile = read.units;
  const chosen = opts.sourceUnits === 'mi-gal' ? { distance: 'mi', volume: 'gal' }
    : opts.sourceUnits === 'km-l' ? { distance: 'km', volume: 'l' } : null;
  const from = fromFile || chosen || { distance: owner.distance, volume: owner.volume };
  const fd = factor('distance', from.distance, owner.distance);
  const fv = factor('volume', from.volume, owner.volume);
  const dist = (v) => (v == null ? null : Math.round(v * fd * 10) / 10);

  const vehicles = read.vehicles.sort((a, b) => b.count - a.count);
  const vehicle = vehicles.find(v => v.key === opts.vehicle)?.key ?? vehicles[0]?.key ?? null;
  const mine = (row) => row.vehicle === vehicle;

  const fuel = read.fuel.filter(mine).map(f => ({
    date: f.date, odometer: dist(f.odometer), gallons: Math.round(f.volume * fv * 1000) / 1000,
    price_per_gallon: f.pricePerUnit != null ? Math.round((f.pricePerUnit / fv) * 1000) / 1000 : null,
    total_cost: f.total, station: f.station || null, trip_type: 'mixed',
    full_tank: f.full ? 1 : 0, missed_previous: f.missed ? 1 : 0, notes: f.notes,
  }));
  const maintenance = read.service.filter(mine).map(s => ({
    service_type: s.title.slice(0, 200), date_performed: s.date, mileage: dist(s.odometer), cost: s.cost,
    vendor: null, service_provider_type: null, notes: s.notes,
  }));

  return {
    source, sourceLabel: SOURCES[source], vehicles, vehicle,
    units: { from, detected: Boolean(fromFile), to: { distance: owner.distance, volume: owner.volume } },
    dayFirst: read.dayFirst,
    fuel, maintenance,
    skipped: read.skipped,
    errors: read.errors.filter(e => !e.vehicle || e.vehicle === vehicle),
  };
}

module.exports = { SOURCES, detect, analyzeApp, readDate, looseNumber, dayFirstFor };
