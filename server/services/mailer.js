// Email transport built from environment variables. SMTP credentials are
// infrastructure, so they live in .env (not the database).
//
//   SMTP_HOST, SMTP_PORT, SMTP_SECURE (true/false), SMTP_USER, SMTP_PASS, SMTP_FROM
//
let nodemailer;
try {
  nodemailer = require('nodemailer');
} catch (_) {
  nodemailer = null; // dependency not installed yet — isConfigured() will report false
}

function smtpConfig() {
  const { SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, SMTP_FROM, SMTP_SECURE } = process.env;
  return {
    host: SMTP_HOST,
    port: SMTP_PORT ? parseInt(SMTP_PORT, 10) : 587,
    secure: SMTP_SECURE === 'true',
    user: SMTP_USER,
    pass: SMTP_PASS,
    from: SMTP_FROM || SMTP_USER,
  };
}

function isConfigured() {
  if (!nodemailer) return false;
  const c = smtpConfig();
  return Boolean(c.host && c.from);
}

let _transport;
function transport() {
  if (_transport) return _transport;
  const c = smtpConfig();
  _transport = nodemailer.createTransport({
    host: c.host,
    port: c.port,
    secure: c.secure,
    auth: c.user ? { user: c.user, pass: c.pass } : undefined,
  });
  return _transport;
}

async function sendMail({ to, subject, text, html }) {
  if (!isConfigured()) {
    throw new Error('SMTP is not configured. Set SMTP_HOST and SMTP_FROM (and credentials) in your .env.');
  }
  const c = smtpConfig();
  return transport().sendMail({ from: c.from, to, subject, text, html });
}

module.exports = { isConfigured, sendMail, smtpConfig };
