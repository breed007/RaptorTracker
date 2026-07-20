const crypto = require('crypto');
const bcrypt = require('bcrypt');
const { getSetting, setSetting } = require('../services/settings');

// Where the hashed password lives once the owner sets one. The `secret_`
// prefix keeps it out of getAllSettings(), which routes hand to the client.
const PASSWORD_KEY = 'secret_admin_password_hash';
const BCRYPT_ROUNDS = 12;

function requireAuth(req, res, next) {
  if (req.session && req.session.authenticated) return next();
  res.status(401).json({ error: 'Not authenticated' });
}

// Compare without leaking length or content through timing. Hashing both
// sides first keeps timingSafeEqual happy on unequal-length input.
function safeEqual(a, b) {
  const ha = crypto.createHash('sha256').update(String(a)).digest();
  const hb = crypto.createHash('sha256').update(String(b)).digest();
  return crypto.timingSafeEqual(ha, hb);
}

function storedHash() {
  try { return getSetting(PASSWORD_KEY) || null; } catch (_) { return null; }
}

/**
 * True while the install is still running on the password baked into .env.
 * That value bootstraps the first login; once a password is set in the app,
 * the hash in the database is authoritative and .env is ignored.
 */
function usingBootstrapPassword() {
  return !storedHash();
}

async function verifyPassword(password) {
  const hash = storedHash();
  if (hash) return bcrypt.compare(password, hash);
  return safeEqual(password, process.env.ADMIN_PASSWORD || 'changeme');
}

async function setPassword(password) {
  setSetting(PASSWORD_KEY, await bcrypt.hash(password, BCRYPT_ROUNDS));
}

function passwordProblem(password) {
  if (!password || password.length < 12) return 'Use at least 12 characters.';
  if (/^changeme/i.test(password)) return 'Pick something other than the placeholder password.';
  return null;
}

async function login(req, res) {
  const { username, password } = req.body || {};
  if (!username || !password) {
    return res.status(400).json({ error: 'Username and password required' });
  }

  // Evaluate both halves before answering, and answer identically either way,
  // so the response never reveals which one was wrong.
  const userOk = safeEqual(username, process.env.ADMIN_USERNAME || 'admin');
  const passOk = await verifyPassword(password);
  if (!userOk || !passOk) {
    return res.status(401).json({ error: 'Invalid credentials' });
  }

  req.session.authenticated = true;
  req.session.username = username;

  // Still on the .env password. Say so, rather than let an internet-facing
  // install sit quietly on a value that lives in a text file on disk.
  res.json({ ok: true, mustChangePassword: usingBootstrapPassword() });
}

function logout(req, res) {
  req.session.destroy(() => {
    res.json({ ok: true });
  });
}

function me(req, res) {
  if (req.session && req.session.authenticated) {
    return res.json({
      username: req.session.username,
      mustChangePassword: usingBootstrapPassword(),
    });
  }
  res.status(401).json({ error: 'Not authenticated' });
}

// POST /api/auth/password — change the password from inside the app, so it no
// longer takes an SSH session, a file edit, and a restart.
async function changePassword(req, res) {
  const { current_password, new_password } = req.body || {};
  if (!current_password || !new_password) {
    return res.status(400).json({ error: 'Current and new password are required' });
  }
  if (!(await verifyPassword(current_password))) {
    return res.status(401).json({ error: 'Current password is incorrect' });
  }
  const problem = passwordProblem(new_password);
  if (problem) return res.status(400).json({ error: problem });
  if (await verifyPassword(new_password)) {
    return res.status(400).json({ error: 'That is already your password.' });
  }

  await setPassword(new_password);
  res.json({ ok: true });
}

module.exports = {
  requireAuth, login, logout, me, changePassword,
  usingBootstrapPassword, passwordProblem, PASSWORD_KEY,
};
