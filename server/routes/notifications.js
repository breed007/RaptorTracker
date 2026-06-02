const express = require('express');
const router = express.Router();
const { getDb } = require('../db');
const { getAllSettings, setSetting } = require('../services/settings');
const { isConfigured } = require('../services/mailer');
const { gatherReminders, sendDigest, sendTest } = require('../services/reminders');

// GET /api/notifications/settings
router.get('/settings', (req, res) => {
  const s = getAllSettings();
  res.json({
    enabled: s.notify_enabled === 'true',
    email: s.notify_email || '',
    service: s.notify_service === 'true',
    warranty: s.notify_warranty === 'true',
    compliance: s.notify_compliance === 'true',
    warrantyThresholdDays: parseInt(s.warranty_threshold_days || '90', 10),
    smtpConfigured: isConfigured(),
  });
});

// PUT /api/notifications/settings
router.put('/settings', (req, res) => {
  const { enabled, email, service, warranty, compliance, warrantyThresholdDays } = req.body;
  if (enabled != null) setSetting('notify_enabled', enabled ? 'true' : 'false');
  if (email != null) setSetting('notify_email', String(email).trim());
  if (service != null) setSetting('notify_service', service ? 'true' : 'false');
  if (warranty != null) setSetting('notify_warranty', warranty ? 'true' : 'false');
  if (compliance != null) setSetting('notify_compliance', compliance ? 'true' : 'false');
  if (warrantyThresholdDays != null) {
    const n = parseInt(warrantyThresholdDays, 10);
    if (!isNaN(n) && n >= 0) setSetting('warranty_threshold_days', String(n));
  }
  const s = getAllSettings();
  res.json({
    enabled: s.notify_enabled === 'true',
    email: s.notify_email || '',
    service: s.notify_service === 'true',
    warranty: s.notify_warranty === 'true',
    compliance: s.notify_compliance === 'true',
    warrantyThresholdDays: parseInt(s.warranty_threshold_days || '90', 10),
    smtpConfigured: isConfigured(),
  });
});

// GET /api/notifications/preview — what reminders are currently outstanding
router.get('/preview', (req, res) => {
  const items = gatherReminders(getDb());
  res.json({ count: items.length, items });
});

// POST /api/notifications/test — send a test email
router.post('/test', async (req, res) => {
  try {
    const result = await sendTest(req.body?.email);
    res.json(result);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// POST /api/notifications/run — send the digest now (force all current items)
router.post('/run', async (req, res) => {
  try {
    const onlyNew = req.body?.onlyNew !== false; // default true
    const result = await sendDigest(getDb(), { onlyNew });
    res.json(result);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

module.exports = router;
