// CSV import engine: parsing, header mapping, and per-row validation.
//
// Import is where users arrive with a decade of spreadsheet history in whatever
// shape they invented, so this is deliberately forgiving: headers are matched
// loosely, "$1,234.56" and "12/4/25" are understood, and every rejected row is
// reported with its line number instead of failing the whole file.

// ── Parsing ───────────────────────────────────────────────────────────────────

// RFC4180-ish parser: handles quoted fields containing commas, newlines, and
// escaped ("") quotes, plus CRLF and a leading BOM.
function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = '';
  let inQuotes = false;
  const src = String(text).replace(/^﻿/, '');

  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    if (inQuotes) {
      if (c === '"') {
        if (src[i + 1] === '"') { field += '"'; i++; }
        else inQuotes = false;
      } else field += c;
    } else if (c === '"') inQuotes = true;
    else if (c === ',') { row.push(field); field = ''; }
    else if (c === '\n') { row.push(field); rows.push(row); row = []; field = ''; }
    else if (c !== '\r') field += c;
  }
  if (field !== '' || row.length) { row.push(field); rows.push(row); }

  // Drop entirely blank lines
  return rows.filter(r => r.some(c => String(c).trim() !== ''));
}

// ── Value coercion ────────────────────────────────────────────────────────────

const normHeader = (h) => String(h).trim().toLowerCase()
  .replace(/[\s\-/]+/g, '_')
  .replace(/[^a-z0-9_]/g, '');

// Undo the leading-quote guard our own CSV export adds for formula safety
function unguard(v) {
  const s = String(v ?? '');
  return /^'[=+\-@]/.test(s) ? s.slice(1) : s;
}

function toNumber(v) {
  if (v == null) return null;
  const s = unguard(v).replace(/[$,\s]/g, '');
  if (s === '') return null;
  const n = Number(s);
  return isNaN(n) ? null : n;
}

function toInt(v) {
  const n = toNumber(v);
  return n == null ? null : Math.round(n);
}

// Accepts YYYY-MM-DD, M/D/YYYY, M-D-YY, and anything Date can parse.
// Ambiguous numeric dates are read as US month-first (surfaced in the UI).
function toDate(v) {
  if (v == null) return null;
  const s = unguard(v).trim();
  if (s === '') return null;
  if (/^\d{4}-\d{1,2}-\d{1,2}$/.test(s)) {
    const [y, m, d] = s.split('-');
    return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
  }
  const m = s.match(/^(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{2,4})$/);
  if (m) {
    let [, mo, da, yr] = m;
    if (yr.length === 2) yr = String(Number(yr) > 70 ? `19${yr}` : `20${yr}`);
    return `${yr}-${String(mo).padStart(2, '0')}-${String(da).padStart(2, '0')}`;
  }
  const d = new Date(s);
  if (!isNaN(d.getTime())) return d.toISOString().slice(0, 10);
  return null;
}

const toText = (v) => {
  const s = unguard(v).trim();
  return s === '' ? null : s;
};

const toBool = (v) => {
  const s = unguard(v).trim().toLowerCase();
  if (s === '') return true; // default: a full tank
  return ['1', 'true', 'yes', 'y', 'full'].includes(s);
};

// ── Type definitions ──────────────────────────────────────────────────────────
// `aliases` are normalized header names that map onto each field.

const TYPES = {
  fuel: {
    label: 'Fuel log',
    table: 'fuel_log',
    fields: {
      date:             { aliases: ['date', 'fill_date', 'fillup_date', 'day'], parse: toDate, required: true },
      odometer:         { aliases: ['odometer', 'odo', 'miles', 'mileage'], parse: toInt, required: true },
      gallons:          { aliases: ['gallons', 'gal', 'volume', 'qty', 'quantity'], parse: toNumber, required: true },
      price_per_gallon: { aliases: ['price_per_gallon', 'ppg', 'price_gal', 'price', 'unit_price'], parse: toNumber },
      total_cost:       { aliases: ['total_cost', 'total', 'cost', 'amount', 'spend'], parse: toNumber },
      station:          { aliases: ['station', 'vendor', 'location', 'where'], parse: toText },
      trip_type:        { aliases: ['trip_type', 'trip', 'driving'], parse: toText },
      full_tank:        { aliases: ['full_tank', 'full', 'partial'], parse: toBool },
      notes:            { aliases: ['notes', 'note', 'comment', 'comments'], parse: toText },
    },
  },
  maintenance: {
    label: 'Maintenance',
    table: 'maintenance_log',
    fields: {
      service_type:          { aliases: ['service_type', 'service', 'type', 'work', 'description'], parse: toText, required: true },
      date_performed:        { aliases: ['date_performed', 'date', 'service_date', 'day'], parse: toDate, required: true },
      mileage:               { aliases: ['mileage', 'miles', 'odometer', 'odo'], parse: toInt },
      cost:                  { aliases: ['cost', 'price', 'amount', 'total', 'total_cost'], parse: toNumber },
      vendor:                { aliases: ['vendor', 'shop', 'dealer', 'performed_by'], parse: toText },
      service_provider_type: { aliases: ['service_provider_type', 'provider', 'serviced_by', 'provider_type'], parse: toText },
      notes:                 { aliases: ['notes', 'note', 'comment', 'comments'], parse: toText },
    },
  },
  mods: {
    label: 'Modifications',
    table: 'mods',
    fields: {
      part_name:          { aliases: ['part_name', 'part', 'name', 'item', 'description'], parse: toText, required: true },
      brand:              { aliases: ['brand', 'manufacturer', 'make'], parse: toText },
      part_number:        { aliases: ['part_number', 'part_no', 'pn', 'sku'], parse: toText },
      vendor:             { aliases: ['vendor', 'seller', 'store', 'retailer'], parse: toText },
      vendor_url:         { aliases: ['vendor_url', 'url', 'link'], parse: toText },
      category:           { aliases: ['category', 'cat', 'group'], parse: toText },
      status:             { aliases: ['status', 'state'], parse: toText },
      purchase_date:      { aliases: ['purchase_date', 'ordered', 'bought', 'order_date'], parse: toDate },
      install_date:       { aliases: ['install_date', 'installed', 'fitted'], parse: toDate },
      cost:               { aliases: ['cost', 'price', 'amount', 'paid'], parse: toNumber },
      mileage_at_install: { aliases: ['mileage_at_install', 'install_mileage', 'mileage', 'miles'], parse: toInt },
      install_notes:      { aliases: ['install_notes', 'notes', 'note', 'comment'], parse: toText },
    },
  },
  wishlist: {
    label: 'Wishlist',
    table: 'wishlist',
    fields: {
      part_name:      { aliases: ['part_name', 'part', 'name', 'item', 'description'], parse: toText, required: true },
      brand:          { aliases: ['brand', 'manufacturer', 'make'], parse: toText },
      part_number:    { aliases: ['part_number', 'part_no', 'pn', 'sku'], parse: toText },
      category:       { aliases: ['category', 'cat', 'group'], parse: toText },
      estimated_cost: { aliases: ['estimated_cost', 'cost', 'price', 'estimate', 'budget'], parse: toNumber },
      priority:       { aliases: ['priority', 'rank'], parse: toText },
      vendor_name:    { aliases: ['vendor_name', 'vendor', 'seller', 'store'], parse: toText },
      vendor_url:     { aliases: ['vendor_url', 'url', 'link'], parse: toText },
      notes:          { aliases: ['notes', 'note', 'comment'], parse: toText },
    },
  },
};

// Constrained columns get snapped to a legal value rather than rejected.
const MOD_CATEGORIES = ['Armor', 'Audio', 'Bed_Accessories', 'Bumpers', 'Electrical', 'Engine', 'Interior', 'Lighting', 'Performance', 'Recovery', 'Suspension', 'Tires_Wheels', 'Other'];
const MOD_STATUSES = ['Researching', 'Ordered', 'In_Transit', 'Installed', 'Removed'];

function snap(value, allowed, fallback) {
  if (!value) return fallback;
  const norm = String(value).trim().toLowerCase().replace(/[\s\-]+/g, '_');
  const hit = allowed.find(a => a.toLowerCase() === norm);
  return hit || fallback;
}

// ── Mapping + validation ──────────────────────────────────────────────────────

function buildMapping(type, headerRow) {
  const def = TYPES[type];
  const headers = headerRow.map(normHeader);
  const mapping = {};   // field -> column index
  const matched = {};   // field -> original header text
  for (const [field, spec] of Object.entries(def.fields)) {
    const idx = headers.findIndex(h => h === field || spec.aliases.includes(h));
    if (idx !== -1) { mapping[field] = idx; matched[field] = headerRow[idx]; }
  }
  return { mapping, matched };
}

/**
 * Parse + validate a CSV for a given type.
 * Returns { type, headers, matched, unmatched, rows, errors, total }
 * where `rows` are ready-to-insert objects and `errors` cite the file's line number.
 */
function analyze(type, text) {
  const def = TYPES[type];
  if (!def) throw new Error(`Unknown import type "${type}"`);

  const table = parseCsv(text);
  if (table.length === 0) return { type, headers: [], matched: {}, unmatched: [], rows: [], errors: [], total: 0 };

  const headerRow = table[0];
  const { mapping, matched } = buildMapping(type, headerRow);
  const unmatched = headerRow.filter((h, i) => !Object.values(mapping).includes(i));

  const missingRequired = Object.entries(def.fields)
    .filter(([f, s]) => s.required && mapping[f] === undefined)
    .map(([f]) => f);
  if (missingRequired.length) {
    return {
      type, headers: headerRow, matched, unmatched, rows: [], total: table.length - 1,
      errors: [{ line: 1, message: `Missing required column(s): ${missingRequired.join(', ')}. Found: ${headerRow.join(', ')}` }],
    };
  }

  const rows = [];
  const errors = [];
  for (let r = 1; r < table.length; r++) {
    const raw = table[r];
    const out = {};
    let bad = null;

    // A different column count almost always means an unquoted value containing
    // a comma (e.g. a hand-typed "$1,299.00"), which silently shifts every later
    // column. Refuse the row loudly rather than importing corrupted data.
    if (raw.length !== headerRow.length) {
      errors.push({
        line: r + 1,
        message: `Expected ${headerRow.length} columns but found ${raw.length}. A value containing a comma probably needs quotes (e.g. "$1,299.00").`,
      });
      continue;
    }

    for (const [field, spec] of Object.entries(def.fields)) {
      const idx = mapping[field];
      if (idx === undefined) continue;
      const value = spec.parse(raw[idx]);
      if (spec.required && (value === null || value === '')) {
        bad = `"${field}" is required but empty or unreadable (got "${raw[idx] ?? ''}")`;
        break;
      }
      out[field] = value;
    }
    if (bad) { errors.push({ line: r + 1, message: bad }); continue; }

    // Type-specific tidy-up
    if (type === 'mods') {
      out.category = snap(out.category, MOD_CATEGORIES, 'Other');
      out.status = snap(out.status, MOD_STATUSES, 'Installed');
    }
    if (type === 'maintenance' && out.service_provider_type) {
      const p = String(out.service_provider_type).toLowerCase();
      out.service_provider_type =
        p.startsWith('deal') ? 'dealership' :
        p.startsWith('ind') || p.startsWith('shop') ? 'independent' :
        p.startsWith('own') || p.startsWith('self') || p.startsWith('diy') ? 'owner' : null;
    }
    if (type === 'wishlist' && out.priority) {
      const p = String(out.priority).toLowerCase();
      out.priority = ['high', 'medium', 'low'].includes(p) ? p : 'medium';
    }

    rows.push(out);
  }

  return { type, headers: headerRow, matched, unmatched, rows, errors, total: table.length - 1 };
}

module.exports = { parseCsv, analyze, TYPES, toDate, toNumber, toInt };
