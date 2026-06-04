const express = require('express');
const router = express.Router();
const { getDb } = require('../db');
const { getAllSettings, setSetting } = require('../services/settings');
const { isConfigured } = require('../services/mailer');
const { gatherReminders, sendDigest, sendTest, sendTestWebhook } = require('../services/reminders');

function settingsPayload() {
  const s = getAllSettings();
  return {
    enabled: s.notify_enabled === 'true',
    email: s.notify_email || '',
    webhookUrl: s.notify_webhook_url || '',
    service: s.notify_service === 'true',
    warranty: s.notify_warranty === 'true',
    compliance: s.notify_compliance === 'true',
    warrantyThresholdDays: parseInt(s.warranty_threshold_days || '90', 10),
    smtpConfigured: isConfigured(),
  };
}

// GET /api/notifications/settings
router.get('/settings', (req, res) => {
  res.json(settingsPayload());
});

// PUT /api/notifications/settings
router.put('/settings', (req, res) => {
  const { enabled, email, webhookUrl, service, warranty, compliance, warrantyThresholdDays } = req.body;
  if (enabled != null) setSetting('notify_enabled', enabled ? 'true' : 'false');
  if (email != null) setSetting('notify_email', String(email).trim());
  if (webhookUrl != null) setSetting('notify_webhook_url', String(webhookUrl).trim());
  if (service != null) setSetting('notify_service', service ? 'true' : 'false');
  if (warranty != null) setSetting('notify_warranty', warranty ? 'true' : 'false');
  if (compliance != null) setSetting('notify_compliance', compliance ? 'true' : 'false');
  if (warrantyThresholdDays != null) {
    const n = parseInt(warrantyThresholdDays, 10);
    if (!isNaN(n) && n >= 0) setSetting('warranty_threshold_days', String(n));
  }
  res.json(settingsPayload());
});

// GET /api/notifications/preview — what reminders are currently outstanding
router.get('/preview', (req, res) => {
  const items = gatherReminders(getDb());
  res.json({ count: items.length, items });
});

// POST /api/notifications/test — send a test email
router.post('/test', async (req, res) => {
  try {
    res.json(await sendTest(req.body?.email));
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// POST /api/notifications/test-webhook — post a test message to the webhook
router.post('/test-webhook', async (req, res) => {
  try {
    res.json(await sendTestWebhook(req.body?.webhookUrl));
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// POST /api/notifications/run — send the digest now to all configured channels
router.post('/run', async (req, res) => {
  try {
    const onlyNew = req.body?.onlyNew !== false; // default true
    res.json(await sendDigest(getDb(), { onlyNew }));
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

module.exports = router;
