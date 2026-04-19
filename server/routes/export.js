const express = require('express');
const PDFDocument = require('pdfkit');
const path = require('path');
const fs = require('fs');
const { getDb } = require('../db');
const router = express.Router();

const UPLOAD_DIR = process.env.UPLOAD_DIR || './data/uploads';
const ORANGE = '#FF6B00';
const DARK = '#1a1a1a';
const LIGHT_GRAY = '#cccccc';
const MED_GRAY = '#888888';

function formatDate(d) {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
}

function formatCurrency(n) {
  if (n == null) return '—';
  return `$${parseFloat(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

router.get('/pdf/:vehicle_id', (req, res) => {
  const db = getDb();
  const { vehicle_id } = req.params;
  const includeSticker = req.query.include_sticker === 'true';

  const uv = db.prepare(`
    SELECT uv.*, v.make, v.model, v.generation, v.variant,
           v.aux_switch_count, v.aux_switch_layout, v.horsepower, v.torque,
           v.suspension_notes, v.tire_size
    FROM user_vehicles uv JOIN vehicles v ON uv.vehicle_id = v.id
    WHERE uv.id = ?
  `).get(vehicle_id);
  if (!uv) return res.status(404).json({ error: 'Vehicle not found' });

  const auxLayout = JSON.parse(uv.aux_switch_layout || '[]');

  const mods = db.prepare(
    "SELECT * FROM mods WHERE user_vehicle_id = ? AND status = 'Installed' ORDER BY category, part_name"
  ).all(vehicle_id).map(m => ({ ...m, photos: JSON.parse(m.photos || '[]') }));

  const maintenance = db.prepare(
    'SELECT * FROM maintenance_log WHERE user_vehicle_id = ? ORDER BY date_performed DESC'
  ).all(vehicle_id);

  const totalSpend = mods.reduce((sum, m) => sum + (m.cost || 0), 0);

  // Group mods by category
  const byCategory = {};
  for (const m of mods) {
    if (!byCategory[m.category]) byCategory[m.category] = [];
    byCategory[m.category].push(m);
  }

  const nickname = uv.nickname || 'My Raptor';
  const dateStr = new Date().toISOString().slice(0, 10);
  const filename = `RaptorTracker-${nickname.replace(/[^a-z0-9]/gi, '-')}-${dateStr}.pdf`;

  const doc = new PDFDocument({
    size: 'LETTER',
    margins: { top: 50, bottom: 50, left: 50, right: 50 },
    info: { Title: `${nickname} Build Sheet`, Author: 'RaptorTracker' }
  });

  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  doc.pipe(res);

  // --- Header ---
  doc.rect(0, 0, doc.page.width, 80).fill(DARK);
  doc.fillColor(ORANGE).fontSize(24).font('Helvetica-Bold')
     .text('RAPTORTRACKER', 50, 20);
  doc.fillColor('#ffffff').fontSize(12).font('Helvetica')
     .text('Build Documentation', 50, 48);
  doc.fillColor(MED_GRAY).fontSize(9)
     .text(`Generated ${formatDate(new Date().toISOString())}`, 50, 62);

  doc.moveDown(4);

  // --- Vehicle info ---
  doc.fillColor(ORANGE).fontSize(16).font('Helvetica-Bold')
     .text(nickname, 50, 100);
  const modelStr = [uv.model_year, uv.make, uv.model, uv.generation, uv.variant]
    .filter(Boolean).join(' ');
  doc.fillColor(LIGHT_GRAY).fontSize(11).font('Helvetica')
     .text(modelStr, 50, 120);

  const infoY = 140;
  const col2 = 300;
  doc.fillColor(MED_GRAY).fontSize(9).font('Helvetica');
  if (uv.color) doc.text(`Color: ${uv.color}`, 50, infoY);
  if (uv.vin) doc.text(`VIN: ${uv.vin}`, 50, infoY + 14);
  if (uv.package_options) doc.text(`Options: ${uv.package_options}`, 50, infoY + 28, { width: 240 });
  doc.text(`HP: ${uv.horsepower || '—'}  |  Torque: ${uv.torque ? uv.torque + ' lb-ft' : '—'}`, col2, infoY);
  doc.text(`Suspension: ${uv.suspension_notes || '—'}`, col2, infoY + 14, { width: 240 });
  doc.text(`Tires: ${uv.tire_size || '—'}`, col2, infoY + 28);

  // Divider
  let y = infoY + 55;
  doc.moveTo(50, y).lineTo(doc.page.width - 50, y).strokeColor(ORANGE).lineWidth(1.5).stroke();
  y += 10;

  // --- Cost summary ---
  doc.fillColor(ORANGE).fontSize(13).font('Helvetica-Bold').text('BUILD SUMMARY', 50, y);
  y += 18;
  doc.fillColor(LIGHT_GRAY).fontSize(10).font('Helvetica')
     .text(`Total Installed Mods: ${mods.length}`, 50, y)
     .text(`Total Investment: ${formatCurrency(totalSpend)}`, 200, y);
  y += 24;

  // --- Mods by category ---
  doc.fillColor(ORANGE).fontSize(13).font('Helvetica-Bold').text('INSTALLED MODIFICATIONS', 50, y);
  y += 18;

  for (const [category, catMods] of Object.entries(byCategory)) {
    if (y > doc.page.height - 120) { doc.addPage(); y = 50; }

    doc.fillColor(ORANGE).fontSize(10).font('Helvetica-Bold').text(category.toUpperCase(), 50, y);
    y += 14;

    for (const mod of catMods) {
      if (y > doc.page.height - 100) { doc.addPage(); y = 50; }

      doc.fillColor('#ffffff').fontSize(9).font('Helvetica-Bold')
         .text(mod.part_name, 60, y, { width: 280 });
      doc.fillColor(LIGHT_GRAY).fontSize(8).font('Helvetica')
         .text(formatCurrency(mod.cost), 360, y)
         .text(formatDate(mod.install_date), 430, y);
      y += 14;

      if (mod.brand || mod.vendor) {
        doc.fillColor(MED_GRAY).fontSize(8)
           .text([mod.brand, mod.vendor].filter(Boolean).join(' / '), 70, y);
        y += 12;
      }
      if (mod.install_notes) {
        doc.fillColor(MED_GRAY).fontSize(7.5)
           .text(mod.install_notes, 70, y, { width: 450 });
        y += doc.heightOfString(mod.install_notes, { width: 450, fontSize: 7.5 }) + 4;
      }
      if (mod.aux_switch) {
        doc.fillColor(ORANGE).fontSize(7.5)
           .text(`AUX ${mod.aux_switch}${mod.aux_label ? ' — ' + mod.aux_label : ''}`, 70, y);
        y += 12;
      }

      // Photos: max 3 per row
      const photos = mod.photos.slice(0, 6);
      if (photos.length > 0) {
        const imgW = 100, imgH = 70, gap = 10;
        let imgX = 70;
        for (let i = 0; i < photos.length; i++) {
          if (i > 0 && i % 3 === 0) { imgX = 70; y += imgH + gap; }
          if (y + imgH > doc.page.height - 60) { doc.addPage(); y = 50; imgX = 70; }
          const filePath = path.join(UPLOAD_DIR, path.basename(photos[i]));
          if (fs.existsSync(filePath)) {
            try {
              doc.image(filePath, imgX, y, { width: imgW, height: imgH, fit: [imgW, imgH] });
            } catch (_) { /* skip bad image */ }
          }
          imgX += imgW + gap;
        }
        if (photos.length > 0) y += imgH + gap;
      }
      y += 6;
    }
    y += 8;
  }

  // --- AUX Switch Map ---
  if (uv.aux_switch_count > 0 && auxLayout.length > 0) {
    if (y > doc.page.height - 150) { doc.addPage(); y = 50; }
    doc.moveTo(50, y).lineTo(doc.page.width - 50, y).strokeColor(ORANGE).lineWidth(1).stroke();
    y += 10;
    doc.fillColor(ORANGE).fontSize(13).font('Helvetica-Bold').text('AUX SWITCH MAP', 50, y);
    y += 18;

    for (const slot of auxLayout) {
      if (y > doc.page.height - 50) { doc.addPage(); y = 50; }
      const assignedMod = db.prepare(
        'SELECT part_name, aux_label, status FROM mods WHERE user_vehicle_id = ? AND aux_switch = ?'
      ).get(vehicle_id, slot.switch_number);

      doc.fillColor(LIGHT_GRAY).fontSize(9).font('Helvetica-Bold')
         .text(`AUX ${slot.switch_number} — ${slot.fuse_amps}A`, 60, y, { width: 120, continued: false });
      const label = assignedMod
        ? `${assignedMod.part_name}${assignedMod.aux_label ? ' (' + assignedMod.aux_label + ')' : ''}`
        : slot.factory_used ? slot.default_label : 'Available';
      doc.fillColor(slot.factory_used ? '#f59e0b' : assignedMod ? '#22c55e' : MED_GRAY)
         .fontSize(9).font('Helvetica').text(label, 200, y);
      y += 14;
      if (slot.warning_note) {
        doc.fillColor('#f59e0b').fontSize(7.5).text(`⚠ ${slot.warning_note}`, 70, y, { width: 460 });
        y += doc.heightOfString(slot.warning_note, { width: 460, fontSize: 7.5 }) + 4;
      }
    }
    y += 10;
  }

  // --- Maintenance Log ---
  if (maintenance.length > 0) {
    if (y > doc.page.height - 120) { doc.addPage(); y = 50; }
    doc.moveTo(50, y).lineTo(doc.page.width - 50, y).strokeColor(ORANGE).lineWidth(1).stroke();
    y += 10;
    doc.fillColor(ORANGE).fontSize(13).font('Helvetica-Bold').text('MAINTENANCE HISTORY', 50, y);
    y += 18;

    for (const entry of maintenance) {
      if (y > doc.page.height - 50) { doc.addPage(); y = 50; }
      doc.fillColor('#ffffff').fontSize(9).font('Helvetica-Bold')
         .text(entry.service_type, 60, y, { width: 220 });
      doc.fillColor(MED_GRAY).fontSize(9).font('Helvetica')
         .text(formatDate(entry.date_performed), 290, y)
         .text(entry.mileage ? `${entry.mileage.toLocaleString()} mi` : '—', 370, y)
         .text(formatCurrency(entry.cost), 450, y);
      y += 14;
      if (entry.notes) {
        doc.fillColor(MED_GRAY).fontSize(7.5)
           .text(entry.notes, 70, y, { width: 460 });
        y += 12;
      }
    }
  }

  // --- Window Sticker (optional) ---
  if (includeSticker && uv.window_sticker) {
    const stickerFile = path.join(UPLOAD_DIR, path.basename(uv.window_sticker));
    if (fs.existsSync(stickerFile)) {
      doc.addPage();
      doc.rect(0, 0, doc.page.width, 80).fill(DARK);
      doc.fillColor(ORANGE).fontSize(24).font('Helvetica-Bold').text('RAPTORTRACKER', 50, 20);
      doc.fillColor('#ffffff').fontSize(12).font('Helvetica').text('Window Sticker', 50, 48);

      const ext = path.extname(uv.window_sticker).toLowerCase();
      const imageExts = ['.jpg', '.jpeg', '.png', '.webp', '.tiff', '.tif'];

      if (imageExts.includes(ext)) {
        const margin = 50;
        const availW = doc.page.width - margin * 2;
        const availH = doc.page.height - 80 - margin - 20;
        try {
          doc.image(stickerFile, margin, 100, { fit: [availW, availH], align: 'center', valign: 'top' });
        } catch (_) {
          doc.fillColor(LIGHT_GRAY).fontSize(10).font('Helvetica')
             .text('Window sticker image could not be rendered.', 50, 120);
        }
      } else {
        // PDF sticker — PDFKit cannot embed external PDFs
        doc.fillColor(LIGHT_GRAY).fontSize(11).font('Helvetica')
           .text('Your window sticker is a PDF file and cannot be embedded directly in this export.', 50, 120, { width: 460 });
        doc.fillColor(MED_GRAY).fontSize(9).font('Helvetica')
           .text(`File: ${path.basename(uv.window_sticker)}`, 50, 160)
           .text('You can find it in the My Garage section of RaptorTracker.', 50, 178);
      }
    }
  }

  // Footer on last page
  doc.fillColor(MED_GRAY).fontSize(8).font('Helvetica')
     .text(`${nickname} — Generated by RaptorTracker on ${formatDate(new Date().toISOString())}`,
           50, doc.page.height - 35, { align: 'center', width: doc.page.width - 100 });

  doc.end();
});

module.exports = router;
