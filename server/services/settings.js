// Small typed wrapper over the app_settings key/value table.
const { getDb } = require('../db');

const DEFAULTS = {
  notify_enabled: 'false',
  notify_email: '',
  notify_service: 'true',
  notify_warranty: 'true',
  notify_compliance: 'true',
  notify_webhook_url: '',
  warranty_threshold_days: '90',
};

function getSetting(key) {
  const row = getDb().prepare('SELECT value FROM app_settings WHERE key = ?').get(key);
  if (row && row.value != null) return row.value;
  return DEFAULTS[key] != null ? DEFAULTS[key] : null;
}

function setSetting(key, value) {
  getDb().prepare(`
    INSERT INTO app_settings (key, value) VALUES (?, ?)
    ON CONFLICT(key) DO UPDATE SET value = excluded.value
  `).run(key, value == null ? null : String(value));
}

function getAllSettings() {
  const out = { ...DEFAULTS };
  const rows = getDb().prepare('SELECT key, value FROM app_settings').all();
  for (const r of rows) out[r.key] = r.value;
  return out;
}

const isTrue = (v) => v === 'true' || v === true || v === 1;

module.exports = { getSetting, setSetting, getAllSettings, isTrue, DEFAULTS };
