// Daily reminder scheduler. Degrades gracefully if node-cron isn't installed
// or SMTP/notifications aren't configured — it simply does nothing.
const { sendDigest } = require('./services/reminders');
const { isTrue, getSetting } = require('./services/settings');

let cron;
try {
  cron = require('node-cron');
} catch (_) {
  cron = null;
}

function start() {
  if (!cron) {
    console.log('[scheduler] node-cron not installed — reminder emails disabled. Run `npm install` to enable.');
    return;
  }

  // Every day at 08:00 server time
  cron.schedule('0 8 * * *', async () => {
    try {
      if (!isTrue(getSetting('notify_enabled'))) return;
      const result = await sendDigest();
      if (result.sent) {
        console.log(`[scheduler] sent reminder digest: ${result.count} item(s) to ${result.to}`);
      }
    } catch (err) {
      console.error('[scheduler] reminder run failed:', err.message);
    }
  });

  console.log('[scheduler] daily reminder check scheduled for 08:00 server time.');
}

module.exports = { start };
