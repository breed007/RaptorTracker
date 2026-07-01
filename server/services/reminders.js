// Reminder engine: finds service intervals that are due/overdue and warranties
// that are expired/expiring, builds an email digest, and de-dupes so the same
// event isn't emailed every day.
const { getDb } = require('../db');
const { getSetting, isTrue } = require('./settings');
const { sendMail, isConfigured } = require('./mailer');

const DAY_MS = 86400000;

function daysUntil(dateStr) {
  if (!dateStr) return null;
  const exp = new Date(dateStr + 'T12:00:00');
  return Math.floor((exp - new Date()) / DAY_MS);
}

function fmtDate(dateStr) {
  if (!dateStr) return '—';
  return new Date(dateStr + 'T12:00:00').toLocaleDateString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric',
  });
}

// Service-interval status, mirroring the client calc in Maintenance.jsx
function intervalStatus(interval, currentMileage) {
  const statuses = [];
  if (interval.interval_miles && interval.last_mileage != null && currentMileage != null) {
    const remaining = (interval.last_mileage + interval.interval_miles) - currentMileage;
    if (remaining <= 0) statuses.push('overdue');
    else if (remaining <= Math.max(interval.interval_miles * 0.1, 500)) statuses.push('due_soon');
  }
  if (interval.interval_months && interval.last_date) {
    const due = new Date(interval.last_date + 'T12:00:00');
    due.setMonth(due.getMonth() + interval.interval_months);
    const daysLeft = Math.floor((due - new Date()) / DAY_MS);
    if (daysLeft <= 0) statuses.push('overdue');
    else if (daysLeft <= 30) statuses.push('due_soon');
  }
  if (statuses.includes('overdue')) return 'overdue';
  if (statuses.includes('due_soon')) return 'due_soon';
  return 'ok';
}

// Returns every currently-due reminder across all vehicles (pre-dedupe).
function gatherReminders(db = getDb(), opts = {}) {
  const thresholdDays = opts.thresholdDays != null
    ? opts.thresholdDays
    : parseInt(getSetting('warranty_threshold_days') || '90', 10);
  const wantService = opts.service != null ? opts.service : isTrue(getSetting('notify_service'));
  const wantWarranty = opts.warranty != null ? opts.warranty : isTrue(getSetting('notify_warranty'));
  const wantCompliance = opts.compliance != null ? opts.compliance : isTrue(getSetting('notify_compliance'));

  const vehicles = db.prepare(`
    SELECT id, nickname, current_mileage,
           registration_expiry, inspection_expiry, insurance_expiry, insurance_provider
    FROM user_vehicles
  `).all();
  const items = [];

  for (const v of vehicles) {
    // ── Service intervals ──
    if (wantService) {
      const intervals = db.prepare(`
        SELECT si.*,
          (SELECT ml.date_performed FROM maintenance_log ml
             WHERE ml.user_vehicle_id = si.user_vehicle_id AND ml.service_type = si.service_type
             ORDER BY ml.date_performed DESC, ml.id DESC LIMIT 1) as last_date,
          (SELECT ml.mileage FROM maintenance_log ml
             WHERE ml.user_vehicle_id = si.user_vehicle_id AND ml.service_type = si.service_type
             ORDER BY ml.date_performed DESC, ml.id DESC LIMIT 1) as last_mileage
        FROM service_intervals si
        WHERE si.user_vehicle_id = ?
      `).all(v.id);

      for (const intv of intervals) {
        const status = intervalStatus(intv, v.current_mileage);
        if (status !== 'overdue' && status !== 'due_soon') continue;
        const basis = `${intv.last_date || ''}|${intv.last_mileage || ''}`;
        items.push({
          vehicleId: v.id,
          vehicleName: v.nickname,
          category: 'service',
          state: status,
          title: intv.service_type,
          detail: status === 'overdue' ? 'Service overdue' : 'Service due soon',
          signature: `svc:${intv.id}:${status}:${basis}`,
        });
      }
    }

    // ── Warranties ──
    if (wantWarranty) {
      const vws = db.prepare(
        'SELECT id, warranty_name, expiration_date FROM vehicle_warranties WHERE user_vehicle_id = ?'
      ).all(v.id);
      for (const w of vws) {
        const d = daysUntil(w.expiration_date);
        if (d == null) continue;
        if (d < 0) {
          items.push({
            vehicleId: v.id, vehicleName: v.nickname, category: 'warranty', state: 'expired',
            title: w.warranty_name, detail: `Expired ${fmtDate(w.expiration_date)}`,
            signature: `vw:${w.id}:expired:${w.expiration_date}`,
          });
        } else if (d <= thresholdDays) {
          items.push({
            vehicleId: v.id, vehicleName: v.nickname, category: 'warranty', state: 'expiring',
            title: w.warranty_name, detail: `Expires ${fmtDate(w.expiration_date)} (${d} days)`,
            signature: `vw:${w.id}:expiring:${w.expiration_date}`,
          });
        }
      }

      // Per-mod warranties (installed mods with a start date + term)
      const mods = db.prepare(`
        SELECT id, part_name, warranty_months, warranty_start_date
        FROM mods WHERE user_vehicle_id = ? AND status = 'Installed'
          AND warranty_months IS NOT NULL AND warranty_start_date IS NOT NULL
      `).all(v.id);
      for (const m of mods) {
        const exp = new Date(m.warranty_start_date + 'T12:00:00');
        exp.setMonth(exp.getMonth() + m.warranty_months);
        const expStr = exp.toISOString().split('T')[0];
        const d = daysUntil(expStr);
        if (d == null) continue;
        if (d < 0) {
          items.push({
            vehicleId: v.id, vehicleName: v.nickname, category: 'warranty', state: 'expired',
            title: `${m.part_name} (mod warranty)`, detail: `Expired ${fmtDate(expStr)}`,
            signature: `mod:${m.id}:expired:${expStr}`,
          });
        } else if (d <= thresholdDays) {
          items.push({
            vehicleId: v.id, vehicleName: v.nickname, category: 'warranty', state: 'expiring',
            title: `${m.part_name} (mod warranty)`, detail: `Expires ${fmtDate(expStr)} (${d} days)`,
            signature: `mod:${m.id}:expiring:${expStr}`,
          });
        }
      }
    }

    // ── Compliance: registration, inspection, insurance ──
    if (wantCompliance) {
      const compliance = [
        { key: 'reg', label: 'Registration', date: v.registration_expiry },
        { key: 'insp', label: 'Inspection / Emissions', date: v.inspection_expiry },
        { key: 'ins', label: v.insurance_provider ? `Insurance (${v.insurance_provider})` : 'Insurance', date: v.insurance_expiry },
      ];
      for (const c of compliance) {
        const d = daysUntil(c.date);
        if (d == null) continue;
        if (d < 0) {
          items.push({
            vehicleId: v.id, vehicleName: v.nickname, category: 'compliance', state: 'expired',
            title: c.label, detail: `Expired ${fmtDate(c.date)}`,
            signature: `cmp:${v.id}:${c.key}:expired:${c.date}`,
          });
        } else if (d <= thresholdDays) {
          items.push({
            vehicleId: v.id, vehicleName: v.nickname, category: 'compliance', state: 'expiring',
            title: c.label, detail: `Expires ${fmtDate(c.date)} (${d} days)`,
            signature: `cmp:${v.id}:${c.key}:expiring:${c.date}`,
          });
        }
      }
    }
  }

  return items;
}

function renderEmail(items) {
  const byVehicle = {};
  for (const it of items) {
    (byVehicle[it.vehicleName] = byVehicle[it.vehicleName] || []).push(it);
  }
  const lines = [];
  const htmlParts = [];
  for (const [vehicle, list] of Object.entries(byVehicle)) {
    lines.push(`\n${vehicle}`);
    htmlParts.push(`<h3 style="margin:16px 0 4px">${vehicle}</h3><ul>`);
    for (const it of list) {
      const tag = it.state === 'overdue' || it.state === 'expired' ? '[!]' : '[~]';
      lines.push(`  ${tag} ${it.title} — ${it.detail}`);
      htmlParts.push(`<li><strong>${it.title}</strong> — ${it.detail}</li>`);
    }
    htmlParts.push('</ul>');
  }
  const text = `RaptorTracker reminders:\n${lines.join('\n')}\n`;
  const html = `<div style="font-family:system-ui,sans-serif"><h2>RaptorTracker reminders</h2>${htmlParts.join('')}</div>`;
  return { text, html };
}

// Validate a webhook URL: must parse and be http(s). Returns the URL or throws.
function assertValidWebhook(url) {
  let u;
  try { u = new URL(url); } catch (_) { throw new Error('Invalid webhook URL.'); }
  if (u.protocol !== 'http:' && u.protocol !== 'https:') {
    throw new Error('Webhook URL must start with http:// or https://');
  }
  return url;
}

// POST the digest text to a webhook (Discord/Slack-compatible payload).
async function sendWebhook(url, text) {
  if (typeof fetch !== 'function') throw new Error('Webhooks require Node 18+ (global fetch unavailable).');
  assertValidWebhook(url);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 8000);
  try {
    const resp = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      // `content` → Discord, `text` → Slack/Mattermost; harmless extras for others
      body: JSON.stringify({ content: text, text, username: 'RaptorTracker' }),
      signal: controller.signal,
    });
    if (!resp.ok) throw new Error(`Webhook returned ${resp.status}`);
  } finally {
    clearTimeout(timer);
  }
}

// Send a digest of NEW reminders to every configured channel (email + webhook).
async function sendDigest(db = getDb(), { onlyNew = true } = {}) {
  if (!isTrue(getSetting('notify_enabled'))) return { sent: false, reason: 'notifications disabled' };

  const emailTo = getSetting('notify_email');
  const webhookUrl = getSetting('notify_webhook_url');
  const emailReady = Boolean(emailTo && isConfigured());
  const webhookReady = Boolean(webhookUrl);
  if (!emailReady && !webhookReady) return { sent: false, reason: 'no delivery channel configured (set up email or a webhook)' };

  let items = gatherReminders(db);
  if (onlyNew) {
    items = items.filter(it => !db.prepare('SELECT 1 FROM sent_reminders WHERE signature = ?').get(it.signature));
  }
  if (items.length === 0) return { sent: false, reason: 'nothing new to report', count: 0 };

  const { text, html } = renderEmail(items);
  const overdue = items.filter(i => i.state === 'overdue' || i.state === 'expired').length;
  const subject = `RaptorTracker: ${items.length} reminder${items.length === 1 ? '' : 's'}${overdue ? ` (${overdue} need attention)` : ''}`;

  const channels = {};
  if (emailReady) {
    try { await sendMail({ to: emailTo, subject, text, html }); channels.email = true; }
    catch (e) { channels.emailError = e.message; }
  }
  if (webhookReady) {
    try { await sendWebhook(webhookUrl, text); channels.webhook = true; }
    catch (e) { channels.webhookError = e.message; }
  }

  // Only mark items as sent if at least one channel delivered
  if (channels.email || channels.webhook) {
    const stamp = db.prepare('INSERT OR REPLACE INTO sent_reminders (signature) VALUES (?)');
    const record = db.transaction((list) => { for (const it of list) stamp.run(it.signature); });
    record(items);
    return { sent: true, count: items.length, channels };
  }
  return { sent: false, reason: 'all channels failed', count: items.length, channels };
}

// Send a sample to a webhook so the user can verify it works.
async function sendTestWebhook(url) {
  const target = url || getSetting('notify_webhook_url');
  if (!target) throw new Error('No webhook URL set.');
  await sendWebhook(target, 'RaptorTracker: test message. If you see this, webhook reminders are configured correctly.');
  return { sent: true };
}

// A fixed sample email so the user can verify SMTP works.
async function sendTest(to) {
  const recipient = to || getSetting('notify_email');
  if (!recipient) throw new Error('No recipient email set.');
  await sendMail({
    to: recipient,
    subject: 'RaptorTracker: test email',
    text: 'This is a test email from RaptorTracker. If you received it, reminder notifications are configured correctly.',
    html: '<div style="font-family:system-ui,sans-serif"><h2>RaptorTracker</h2><p>This is a test email. If you received it, reminder notifications are configured correctly.</p></div>',
  });
  return { sent: true, to: recipient };
}

// Sweep de-dup signatures older than `days` so sent_reminders can't grow forever.
function pruneSentReminders(db = getDb(), days = 180) {
  try {
    const r = db.prepare(`DELETE FROM sent_reminders WHERE sent_at < datetime('now', ?)`).run(`-${days} days`);
    return r.changes || 0;
  } catch (_) {
    return 0;
  }
}

module.exports = { gatherReminders, sendDigest, sendTest, sendTestWebhook, pruneSentReminders, assertValidWebhook, renderEmail };
