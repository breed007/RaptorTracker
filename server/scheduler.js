// Daily reminder scheduler. Degrades gracefully if node-cron isn't installed
// or SMTP/notifications aren't configured — it simply does nothing.
//
// Configurable via env:
//   REMINDER_HOUR  — hour of day 0-23 (default 8)
//   REMINDER_TZ    — IANA timezone, e.g. "America/New_York" (default: server time)
const { sendDigest, pruneSentReminders } = require('./services/reminders');
const { runScheduledBackup } = require('./services/backupArchive');
const { getDb } = require('./db');
const { isTrue, getSetting } = require('./services/settings');

let cron;
try {
  cron = require('node-cron');
} catch (_) {
  cron = null;
}

function start() {
  if (!cron) {
    console.log('[scheduler] node-cron not installed — reminders disabled. Run `npm install` to enable.');
    return;
  }

  let hour = parseInt(process.env.REMINDER_HOUR, 10);
  if (isNaN(hour) || hour < 0 || hour > 23) hour = 8;
  const tz = process.env.REMINDER_TZ || undefined;
  const options = tz ? { timezone: tz } : undefined;

  cron.schedule(`0 ${hour} * * *`, async () => {
    try {
      // Housekeeping: keep the de-dup log from growing without bound
      pruneSentReminders(getDb(), 180);
      if (!isTrue(getSetting('notify_enabled'))) return;
      const result = await sendDigest();
      if (result.sent) {
        console.log(`[scheduler] sent reminder digest: ${result.count} item(s) via ${Object.keys(result.channels || {}).filter(k => result.channels[k] === true).join(', ')}`);
      }
    } catch (err) {
      console.error('[scheduler] reminder run failed:', err.message);
    }
  }, options);

  console.log(`[scheduler] daily reminder check scheduled for ${String(hour).padStart(2, '0')}:00${tz ? ` (${tz})` : ' server time'}.`);

  // Nightly automatic backup — reads its schedule from app settings each run so
  // changing it in the UI takes effect without a restart.
  cron.schedule('0 * * * *', async () => {
    try {
      if (!isTrue(getSetting('backup_enabled'))) return;
      const wantHour = parseInt(getSetting('backup_hour') || '3', 10);
      const nowHour = tz
        ? parseInt(new Intl.DateTimeFormat('en-US', { hour: 'numeric', hour12: false, timeZone: tz }).format(new Date()), 10)
        : new Date().getHours();
      if (nowHour !== wantHour) return;
      const keep = parseInt(getSetting('backup_keep') || '7', 10);
      const result = await runScheduledBackup(keep);
      console.log(`[scheduler] wrote backup ${result.name}${result.removed ? ` (pruned ${result.removed})` : ''}`);
    } catch (err) {
      console.error('[scheduler] backup run failed:', err.message);
    }
  }, options);

  console.log('[scheduler] automatic backups will run when enabled in Export & Backup.');
}

module.exports = { start };
