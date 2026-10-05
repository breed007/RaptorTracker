/**
 * Shared layout for the PDFs the app hands out: the build sheet and the
 * vehicle history report for a sale.
 *
 * Printed pages are white, so everything here is dark text on white with the
 * orange used for headings only. Tables wrap their cells, break across pages,
 * and repeat their header row. Dates are read as calendar days, never through
 * new Date('YYYY-MM-DD'), which parses as UTC midnight and prints the day
 * before anywhere west of Greenwich.
 */
const PDFDocument = require('pdfkit');

const COLOR = { text: '#1a1a1a', muted: '#5f6368', faint: '#9aa0a6', rule: '#dadce0', zebra: '#f6f7f8', accent: '#e85d04', band: '#1a1a1a' };
const MARGIN = 50;

function formatDay(value) {
  if (!value) return '—';
  const m = String(value).match(/^(\d{4})-(\d{2})-(\d{2})/);
  const d = m ? new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])) : new Date(value);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
}

function formatMonth(value) {
  const m = String(value || '').match(/^(\d{4})-(\d{2})/);
  if (!m) return '—';
  return new Date(Number(m[1]), Number(m[2]) - 1, 1).toLocaleDateString('en-US', { year: 'numeric', month: 'long' });
}

function createDoc(res, { title, filename }) {
  const doc = new PDFDocument({
    size: 'LETTER', bufferPages: true,
    margins: { top: MARGIN, bottom: MARGIN + 10, left: MARGIN, right: MARGIN },
    info: { Title: title, Author: 'RaptorTracker' },
  });
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="${filename.replace(/[^A-Za-z0-9._-]/g, '-')}"`);
  doc.pipe(res);
  doc.y = MARGIN;
  return doc;
}

const contentWidth = (doc) => doc.page.width - MARGIN * 2;
const bottom = (doc) => doc.page.height - MARGIN - 20;

function ensureSpace(doc, height) {
  if (doc.y + height > bottom(doc)) { doc.addPage(); doc.y = MARGIN; }
}

/** The dark band across the top of the first page. */
function banner(doc, { kicker, title, subtitle }) {
  doc.rect(0, 0, doc.page.width, 92).fill(COLOR.band);
  doc.fillColor(COLOR.accent).font('Helvetica-Bold').fontSize(10).text(kicker.toUpperCase(), MARGIN, 22, { characterSpacing: 1.5 });
  doc.fillColor('#ffffff').font('Helvetica-Bold').fontSize(20).text(title, MARGIN, 38, { width: contentWidth(doc) });
  if (subtitle) doc.fillColor('#c7c9cc').font('Helvetica').fontSize(10).text(subtitle, MARGIN, 64, { width: contentWidth(doc) });
  doc.y = 112;
}

function section(doc, title, note) {
  ensureSpace(doc, 60);
  doc.moveDown(0.6);
  doc.fillColor(COLOR.accent).font('Helvetica-Bold').fontSize(12).text(title.toUpperCase(), MARGIN, doc.y, { characterSpacing: 0.8 });
  const y = doc.y + 3;
  doc.moveTo(MARGIN, y).lineTo(doc.page.width - MARGIN, y).strokeColor(COLOR.rule).lineWidth(1).stroke();
  doc.y = y + 6;
  if (note) {
    doc.fillColor(COLOR.muted).font('Helvetica').fontSize(8.5).text(note, MARGIN, doc.y, { width: contentWidth(doc) });
    doc.moveDown(0.4);
  }
}

function paragraph(doc, text, { size = 9.5, color = COLOR.text } = {}) {
  ensureSpace(doc, 24);
  doc.fillColor(color).font('Helvetica').fontSize(size).text(text, MARGIN, doc.y, { width: contentWidth(doc) });
  doc.moveDown(0.4);
}

/** Label / value pairs laid out in `columns` columns. */
function facts(doc, pairs, { columns = 2 } = {}) {
  const shown = pairs.filter(([, v]) => v != null && v !== '' && v !== '—');
  const colW = contentWidth(doc) / columns;
  for (let i = 0; i < shown.length; i += columns) {
    const row = shown.slice(i, i + columns);
    const heights = row.map(([, v]) => doc.font('Helvetica').fontSize(10).heightOfString(String(v), { width: colW - 12 }));
    const h = 12 + Math.max(...heights);
    ensureSpace(doc, h + 6);
    const top = doc.y;
    row.forEach(([label, value], j) => {
      const x = MARGIN + j * colW;
      doc.fillColor(COLOR.muted).font('Helvetica').fontSize(7.5).text(label.toUpperCase(), x, top, { width: colW - 12, characterSpacing: 0.5 });
      doc.fillColor(COLOR.text).font('Helvetica').fontSize(10).text(String(value), x, top + 10, { width: colW - 12 });
    });
    doc.y = top + h + 6;
  }
}

/**
 * A table. columns: [{ label, width (fraction), align }]; rows: arrays of
 * strings, or { cells, sub } where sub is a muted line under the row.
 */
function table(doc, columns, rows, { size = 8.5 } = {}) {
  const total = contentWidth(doc);
  const widths = columns.map(c => c.width * total);
  const pad = 4;
  const drawHeader = () => {
    const top = doc.y;
    doc.font('Helvetica-Bold').fontSize(7.5).fillColor(COLOR.muted);
    let x = MARGIN;
    columns.forEach((c, i) => {
      doc.text(c.label.toUpperCase(), x + pad, top, { width: widths[i] - pad * 2, align: c.align || 'left', characterSpacing: 0.4 });
      x += widths[i];
    });
    doc.y = top + 13;
    doc.moveTo(MARGIN, doc.y - 2).lineTo(MARGIN + total, doc.y - 2).strokeColor(COLOR.rule).lineWidth(0.75).stroke();
  };
  ensureSpace(doc, 40);
  drawHeader();
  rows.forEach((raw, idx) => {
    const r = Array.isArray(raw) ? { cells: raw } : raw;
    doc.font('Helvetica').fontSize(size);
    const heights = r.cells.map((cell, i) => doc.heightOfString(String(cell ?? '—'), { width: widths[i] - pad * 2 }));
    const subH = r.sub ? doc.fontSize(size - 1).heightOfString(r.sub, { width: total - pad * 2 - 12 }) + 2 : 0;
    const h = Math.max(...heights) + subH + 6;
    if (doc.y + h > bottom(doc)) { doc.addPage(); doc.y = MARGIN; drawHeader(); }
    const top = doc.y;
    if (idx % 2 === 1) doc.rect(MARGIN, top - 2, total, h).fill(COLOR.zebra);
    let x = MARGIN;
    r.cells.forEach((cell, i) => {
      doc.fillColor(i === 0 ? COLOR.text : COLOR.text).font(i === 0 ? 'Helvetica-Bold' : 'Helvetica').fontSize(size)
        .text(String(cell ?? '—'), x + pad, top + 1, { width: widths[i] - pad * 2, align: columns[i].align || 'left' });
      x += widths[i];
    });
    if (r.sub) {
      doc.fillColor(COLOR.muted).font('Helvetica').fontSize(size - 1)
        .text(r.sub, MARGIN + pad + 12, top + Math.max(...heights) + 3, { width: total - pad * 2 - 12 });
    }
    doc.y = top + h;
  });
  doc.moveDown(0.5);
}

// pdfkit embeds an image file whole. A full-size phone photo is 5-12 MB; a
// build sheet of them can need several hundred MB of memory, which is more
// than a 512 MB Raspberry Pi has to spare. Photos uploaded through the app are
// resized first; anything still this large (older uploads) is left out.
const MAX_PDF_IMAGE_BYTES = 4 * 1024 * 1024;

/**
 * Photos in a row of up to three, scaled to fit. Missing or unreadable files
 * are skipped. Returns how many were left out for being too large.
 */
function photoRow(doc, files) {
  const fs = require('fs');
  let tooLarge = 0;
  const usable = files.filter(f => {
    try {
      const st = fs.statSync(f);
      if (!st.isFile()) return false;
      if (st.size > MAX_PDF_IMAGE_BYTES) { tooLarge++; return false; }
      return true;
    } catch (_) { return false; }
  }).slice(0, 3);
  if (!usable.length) return tooLarge;
  const w = (contentWidth(doc) - 20) / 3;
  const h = w * 0.66;
  ensureSpace(doc, h + 10);
  const top = doc.y;
  usable.forEach((f, i) => {
    try { doc.image(f, MARGIN + i * (w + 10), top, { fit: [w, h], align: 'center', valign: 'center' }); } catch (_) { /* not an image pdfkit reads */ }
  });
  doc.y = top + h + 8;
  return tooLarge;
}

/** Footer on every page: who made it, and page x of y. Call last. */
function finish(doc, footer) {
  const range = doc.bufferedPageRange();
  for (let i = range.start; i < range.start + range.count; i++) {
    doc.switchToPage(i);
    doc.page.margins.bottom = 0; // writing inside the margin must not start a new page
    const y = doc.page.height - MARGIN + 6;
    doc.fillColor(COLOR.faint).font('Helvetica').fontSize(7.5);
    doc.text(footer, MARGIN, y, { width: contentWidth(doc) - 80, lineBreak: false });
    doc.text(`Page ${i - range.start + 1} of ${range.count}`, doc.page.width - MARGIN - 80, y, { width: 80, align: 'right', lineBreak: false });
  }
  doc.end();
}

module.exports = { MAX_PDF_IMAGE_BYTES, COLOR, MARGIN, createDoc, banner, section, paragraph, facts, table, photoRow, finish, ensureSpace, formatDay, formatMonth };
