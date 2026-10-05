/**
 * The two PDFs: a build sheet (what's on the truck) and a vehicle history for
 * a sale (how it was looked after), both on the shared layout in pdfReport.
 */
const fs = require('fs');
const path = require('path');
const pdf = require('./pdfReport');
const units = require('./units');
const { jsonList } = require('../lib/json');
const { effectiveLayout } = require('./auxLayout');
const { readings } = require('./odometer');
const { economy } = require('./fuelEconomy');
const { localDate } = require('../lib/dates');

const UPLOAD_DIR = process.env.UPLOAD_DIR || './data/uploads';
const IMAGE_EXT = new Set(['.jpg', '.jpeg', '.png']);
const uploadPath = (p) => path.join(UPLOAD_DIR, path.basename(String(p)));
const isImage = (p) => IMAGE_EXT.has(path.extname(String(p)).toLowerCase());

const PROVIDER = { dealership: 'Dealer', independent: 'Independent shop', owner: 'Owner' };

function loadVehicle(db, vehicleId) {
  return db.prepare(`
    SELECT uv.*, v.make, v.model, v.generation, v.variant, v.aux_switch_count, v.aux_switch_layout,
           v.horsepower, v.torque, v.suspension_notes, v.tire_size
    FROM user_vehicles uv JOIN vehicles v ON uv.vehicle_id = v.id WHERE uv.id = ?`).get(vehicleId);
}

const modelLine = (uv) => [uv.model_year, uv.make, uv.model, uv.generation, uv.variant].filter(Boolean).join(' ');
const dist = (n) => (n == null ? '—' : units.formatDistance(n));
const money = (n) => (n == null ? '—' : units.formatMoney(n));
const filenameFor = (uv, kind) => `RaptorTracker-${(uv.nickname || 'Raptor').replace(/[^a-z0-9]/gi, '-')}-${kind}-${localDate()}.pdf`;

// ── Build sheet ──────────────────────────────────────────────────────────────

function buildSheet(db, vehicleId, res, { includeSticker = false } = {}) {
  const uv = loadVehicle(db, vehicleId);
  if (!uv) return false;
  const mods = db.prepare("SELECT * FROM mods WHERE user_vehicle_id = ? AND status = 'Installed' ORDER BY category, part_name").all(vehicleId);
  const maintenance = db.prepare('SELECT * FROM maintenance_log WHERE user_vehicle_id = ? ORDER BY date_performed DESC').all(vehicleId);

  const doc = pdf.createDoc(res, { title: `${uv.nickname} build sheet`, filename: filenameFor(uv, 'build-sheet') });
  pdf.banner(doc, { kicker: 'Build sheet', title: uv.nickname || modelLine(uv), subtitle: modelLine(uv) });

  pdf.facts(doc, [
    ['Color', uv.color], ['VIN', uv.vin], ['Odometer', uv.current_mileage ? dist(uv.current_mileage) : null],
    ['Standard engine', uv.horsepower ? `${uv.horsepower} hp / ${uv.torque || '—'} lb-ft` : null],
    ['Options', uv.package_options], ['Factory tires', uv.tire_size],
  ], { columns: 3 });

  const total = mods.reduce((s, m) => s + (m.cost || 0), 0);
  pdf.section(doc, `Installed modifications (${mods.length})`, mods.length ? `Total invested: ${money(total)}` : null);
  if (!mods.length) pdf.paragraph(doc, 'No installed modifications recorded.', { color: pdf.COLOR.muted });
  const byCategory = {};
  for (const m of mods) (byCategory[m.category || 'Other'] ||= []).push(m);
  for (const [category, list] of Object.entries(byCategory)) {
    pdf.ensureSpace(doc, 50);
    doc.fillColor(pdf.COLOR.text).font('Helvetica-Bold').fontSize(9.5).text(category.replace(/_/g, ' '), pdf.MARGIN, doc.y);
    doc.moveDown(0.2);
    pdf.table(doc, [
      { label: 'Part', width: 0.38 }, { label: 'Brand', width: 0.2 }, { label: 'Installed', width: 0.15 },
      { label: 'Odometer', width: 0.14, align: 'right' }, { label: 'Cost', width: 0.13, align: 'right' },
    ], list.map(m => ({
      cells: [m.part_name, m.brand || '—', pdf.formatDay(m.install_date), dist(m.mileage_at_install), money(m.cost)],
      sub: [m.part_number && `Part # ${m.part_number}`, m.install_notes].filter(Boolean).join(' · ') || null,
    })));
    for (const m of list) {
      const photos = jsonList(m.photos).filter(isImage).map(uploadPath);
      if (photos.length) photoRow(doc, m.part_name, photos);
    }
  }

  const layout = effectiveLayout(uv);
  if (uv.aux_switch_count > 0 && layout.length) {
    pdf.section(doc, 'AUX switch map');
    const assigned = {};
    for (const m of db.prepare("SELECT part_name, status, aux_switches, amp_draw FROM mods WHERE user_vehicle_id = ? AND status != 'Removed'").all(vehicleId)) {
      for (const a of jsonList(m.aux_switches)) (assigned[a.switch_number] ||= []).push(`${m.part_name}${a.label ? ` (${a.label})` : ''}${m.status !== 'Installed' ? ` — ${m.status.toLowerCase()}` : ''}`);
    }
    pdf.table(doc, [
      { label: 'Switch', width: 0.12 }, { label: 'Fuse', width: 0.1, align: 'right' }, { label: 'Powers', width: 0.78 },
    ], layout.map(s => ({
      cells: [`AUX ${s.switch_number}`, `${s.fuse_amps} A`, assigned[s.switch_number]?.join(', ') || (s.factory_used ? s.default_label : 'Available')],
      sub: s.warning_note || null,
    })));
  }

  if (maintenance.length) {
    pdf.section(doc, `Service history (${maintenance.length})`);
    pdf.table(doc, serviceColumns(true), maintenance.map(m => serviceRow(m, true)));
  }

  if (includeSticker && uv.window_sticker) stickerPage(doc, uv);
  pdf.finish(doc, `${uv.nickname} · build sheet from RaptorTracker · ${pdf.formatDay(localDate())}`);
  return true;
}

function photoRow(doc, caption, files) {
  pdf.ensureSpace(doc, 120);
  doc.fillColor(pdf.COLOR.muted).font('Helvetica').fontSize(7.5).text(caption, pdf.MARGIN, doc.y);
  doc.moveDown(0.2);
  const tooLarge = pdf.photoRow(doc, files);
  if (tooLarge) {
    doc.fillColor(pdf.COLOR.muted).font('Helvetica').fontSize(7.5)
      .text(`${tooLarge} photo${tooLarge === 1 ? ' is' : 's are'} too large to include. Shrink existing photos under Settings > Backups to add ${tooLarge === 1 ? 'it' : 'them'}.`, pdf.MARGIN, doc.y);
    doc.moveDown(0.4);
  }
}

function stickerPage(doc, uv) {
  const file = uploadPath(uv.window_sticker);
  if (!fs.existsSync(file)) return;
  doc.addPage(); doc.y = pdf.MARGIN;
  pdf.section(doc, 'Window sticker');
  if (isImage(uv.window_sticker)) {
    try { doc.image(file, pdf.MARGIN, doc.y, { fit: [doc.page.width - pdf.MARGIN * 2, doc.page.height - doc.y - 80], align: 'center' }); }
    catch (_) { pdf.paragraph(doc, 'The window sticker image could not be read.'); }
  } else {
    pdf.paragraph(doc, 'The window sticker is stored as a PDF, which can’t be placed inside this one. It is kept with the vehicle in RaptorTracker.', { color: pdf.COLOR.muted });
  }
}

// ── Vehicle history for a sale ───────────────────────────────────────────────

const serviceColumns = (costs) => [
  { label: 'Date', width: 0.14 }, { label: 'Odometer', width: 0.13, align: 'right' },
  { label: 'Service', width: costs ? 0.4 : 0.52 }, { label: 'Done by', width: 0.21 },
  ...(costs ? [{ label: 'Cost', width: 0.12, align: 'right' }] : []),
];
const serviceRow = (m, costs) => ({
  cells: [pdf.formatDay(m.date_performed), dist(m.mileage), m.service_type,
    [PROVIDER[m.service_provider_type], m.vendor].filter(Boolean).join(' · ') || '—',
    ...(costs ? [money(m.cost)] : [])],
  sub: m.notes || null,
});

function intervalStatus(db, vehicleId, currentMileage) {
  const intervals = db.prepare('SELECT * FROM service_intervals WHERE user_vehicle_id = ? ORDER BY service_type').all(vehicleId);
  const today = localDate();
  return intervals.map(iv => {
    const last = db.prepare(`SELECT date_performed, mileage FROM maintenance_log
      WHERE user_vehicle_id = ? AND lower(service_type) = lower(?) ORDER BY date_performed DESC LIMIT 1`).get(vehicleId, iv.service_type);
    let due = '—'; let status = last ? 'Up to date' : 'No record';
    if (last) {
      const parts = [];
      if (iv.interval_miles && last.mileage != null) {
        const at = last.mileage + iv.interval_miles;
        parts.push(dist(at));
        if (currentMileage != null && currentMileage >= at) status = 'Overdue';
      }
      if (iv.interval_months) {
        const [y, m, d] = last.date_performed.split('-').map(Number);
        const dueDate = localDate(new Date(y, m - 1 + iv.interval_months, d));
        parts.push(pdf.formatDay(dueDate));
        if (dueDate <= today) status = 'Overdue';
      }
      due = parts.join(' or ') || '—';
    }
    return [iv.service_type, last ? `${pdf.formatDay(last.date_performed)}${last.mileage != null ? ` · ${dist(last.mileage)}` : ''}` : '—', due, status];
  });
}

/** Do the odometer readings across every record only ever go up? */
function odometerCheck(db, vehicleId) {
  const list = readings(db, vehicleId).filter(r => r.date).sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : a.odometer - b.odometer));
  let backwards = 0;
  for (let i = 1; i < list.length; i++) if (list[i].odometer + 1 < list[i - 1].odometer) backwards++;
  return { count: list.length, backwards, first: list[0], last: list[list.length - 1] };
}

function vehicleHistory(db, vehicleId, res, opts = {}) {
  const { costs = false, mods: showMods = true, trail = false, receipts = false, vin = true } = opts;
  const uv = loadVehicle(db, vehicleId);
  if (!uv) return false;

  const maintenance = db.prepare('SELECT * FROM maintenance_log WHERE user_vehicle_id = ? ORDER BY date_performed DESC, id DESC').all(vehicleId);
  const mods = db.prepare("SELECT * FROM mods WHERE user_vehicle_id = ? AND status = 'Installed' ORDER BY install_date, part_name").all(vehicleId);
  const warranties = db.prepare('SELECT * FROM vehicle_warranties WHERE user_vehicle_id = ? ORDER BY start_date').all(vehicleId);
  const tires = db.prepare('SELECT * FROM tire_sets WHERE user_vehicle_id = ? AND is_active = 1').all(vehicleId);
  const outings = trail ? db.prepare('SELECT * FROM outings WHERE user_vehicle_id = ? ORDER BY date DESC').all(vehicleId) : [];
  const fuel = economy(db.prepare('SELECT * FROM fuel_log WHERE user_vehicle_id = ? ORDER BY odometer ASC').all(vehicleId));
  const odo = odometerCheck(db, vehicleId);
  const fixed = jsonList(uv.fixed_recalls);
  const u = units.getUnits();

  const doc = pdf.createDoc(res, { title: `${modelLine(uv)} vehicle history`, filename: filenameFor(uv, 'history') });
  pdf.banner(doc, { kicker: 'Vehicle history', title: modelLine(uv), subtitle: [uv.color, vin && uv.vin ? `VIN ${uv.vin}` : null].filter(Boolean).join(' · ') });

  // Ownership at a glance
  const yearsOwned = uv.purchase_date ? (Date.now() - new Date(`${uv.purchase_date}T12:00:00`).getTime()) / (365.25 * 86400000) : null;
  const driven = uv.current_mileage != null && uv.mileage_at_purchase != null ? uv.current_mileage - uv.mileage_at_purchase : null;
  pdf.facts(doc, [
    ['Owned since', uv.purchase_date ? pdf.formatMonth(uv.purchase_date) : null],
    ['Odometer at purchase', uv.mileage_at_purchase != null ? dist(uv.mileage_at_purchase) : null],
    ['Odometer now', uv.current_mileage != null ? dist(uv.current_mileage) : null],
    ['Driven per year', driven != null && yearsOwned > 0.25 ? dist(driven / yearsOwned) : null],
    ['Service records', String(maintenance.length)],
    ['Last service', maintenance[0] ? `${pdf.formatDay(maintenance[0].date_performed)} · ${maintenance[0].service_type}` : null],
    ['Average fuel economy', fuel.average != null ? `${(units.economyFrom(fuel.average, u)).toFixed(1)} ${units.LABELS.economy[u.economy]}` : null],
    ['Odometer readings', odo.count ? `${odo.count} across all records${odo.backwards ? `, ${odo.backwards} out of order` : ', all in sequence'}` : null],
  ], { columns: 2 });

  pdf.section(doc, 'Service history', maintenance.length
    ? 'Every service the owner recorded, newest first.'
    : 'No services recorded.');
  if (maintenance.length) pdf.table(doc, serviceColumns(costs), maintenance.map(m => serviceRow(m, costs)));

  const schedule = intervalStatus(db, vehicleId, uv.current_mileage);
  if (schedule.length) {
    pdf.section(doc, 'Maintenance schedule', 'Each scheduled item, when it was last done, and when it is next due (whichever comes first).');
    pdf.table(doc, [
      { label: 'Item', width: 0.3 }, { label: 'Last done', width: 0.28 }, { label: 'Next due', width: 0.28 }, { label: 'Status', width: 0.14 },
    ], schedule);
  }

  if (fixed.length) {
    pdf.section(doc, 'Recalls', 'NHTSA recall campaigns the owner recorded as repaired.');
    pdf.paragraph(doc, fixed.join(', '));
  }

  if (warranties.length) {
    pdf.section(doc, 'Warranties');
    pdf.table(doc, [
      { label: 'Coverage', width: 0.34 }, { label: 'Provider', width: 0.22 }, { label: 'Term', width: 0.22 }, { label: 'Expires', width: 0.22 },
    ], warranties.map(w => {
      let expires = w.expiration_date;
      if (!expires && w.start_date && w.term_years) {
        const [y, m, d] = w.start_date.split('-').map(Number);
        expires = localDate(new Date(y + w.term_years, m - 1, d));
      }
      return { cells: [w.warranty_name, w.provider, [w.term_years && `${w.term_years} yr`, w.term_miles && dist(w.term_miles)].filter(Boolean).join(' / ') || '—', pdf.formatDay(expires)], sub: w.contract_number ? `Contract ${w.contract_number}` : null };
    }));
  }

  if (tires.length) {
    pdf.section(doc, 'Tires');
    pdf.table(doc, [{ label: 'Set', width: 0.34 }, { label: 'Size', width: 0.22 }, { label: 'Installed', width: 0.22 }, { label: 'At', width: 0.22, align: 'right' }],
      tires.map(t => [t.name, t.tire_size || '—', pdf.formatDay(t.install_date), dist(t.odometer_installed)]));
  }

  if (showMods && mods.length) {
    pdf.section(doc, `Modifications (${mods.length})`, 'Aftermarket parts installed on the vehicle.');
    pdf.table(doc, [
      { label: 'Part', width: costs ? 0.36 : 0.44 }, { label: 'Brand', width: 0.2 }, { label: 'Installed', width: 0.18 },
      { label: 'Odometer', width: 0.14, align: 'right' }, ...(costs ? [{ label: 'Cost', width: 0.12, align: 'right' }] : []),
    ], mods.map(m => [m.part_name, m.brand || '—', pdf.formatDay(m.install_date), dist(m.mileage_at_install), ...(costs ? [money(m.cost)] : [])]));
  }

  if (trail && outings.length) {
    pdf.section(doc, `Off-road use (${outings.length} trips)`, 'Trail days the owner logged, with any damage noted at the time.');
    pdf.table(doc, [{ label: 'Date', width: 0.16 }, { label: 'Where', width: 0.38 }, { label: 'Terrain', width: 0.16 }, { label: 'Damage noted', width: 0.3 }],
      outings.map(o => [pdf.formatDay(o.date), [o.trail_name, o.location].filter(Boolean).join(', ') || o.name, o.terrain || '—', o.damage || 'None']));
  }

  if (receipts) {
    const withPhotos = maintenance.map(m => ({ m, files: jsonList(m.attachments).filter(isImage).map(uploadPath).filter(f => fs.existsSync(f)) })).filter(x => x.files.length);
    if (withPhotos.length) {
      doc.addPage(); doc.y = pdf.MARGIN;
      pdf.section(doc, 'Receipts', 'Photos the owner attached to service records.');
      for (const { m, files } of withPhotos) {
        for (let i = 0; i < files.length; i += 3) photoRow(doc, `${pdf.formatDay(m.date_performed)} · ${m.service_type}`, files.slice(i, i + 3));
      }
    }
  }

  pdf.section(doc, 'About this report');
  pdf.paragraph(doc, `Prepared by the owner on ${pdf.formatDay(localDate())} from the records they kept in RaptorTracker, a self-hosted vehicle log. `
    + 'Entries are as the owner recorded them; they are not verified by a dealer or a third party. A vehicle history service and a pre-purchase inspection are still worth doing.',
  { size: 8.5, color: pdf.COLOR.muted });

  pdf.finish(doc, `${modelLine(uv)} · vehicle history prepared by the owner · ${pdf.formatDay(localDate())}`);
  return true;
}

module.exports = { buildSheet, vehicleHistory };
