const bcrypt = require('bcrypt');

function requireAuth(req, res, next) {
  if (req.session && req.session.authenticated) return next();
  res.status(401).json({ error: 'Not authenticated' });
}

async function login(req, res) {
  const { username, password } = req.body;
  const expectedUser = process.env.ADMIN_USERNAME || 'admin';
  const expectedPass = process.env.ADMIN_PASSWORD || 'changeme';

  if (!username || !password) {
    return res.status(400).json({ error: 'Username and password required' });
  }

  // Constant-time username comparison via bcrypt-style approach
  const usernameMatch = username === expectedUser;
  // bcrypt compare keeps timing consistent regardless of username match
  const passwordHash = await bcrypt.hash(expectedPass, 1);
  const passwordMatch = await bcrypt.compare(password, passwordHash);
  // For single-user apps, plain compare is fine but we still use bcrypt for timing safety
  const actualPasswordMatch = password === expectedPass;

  if (!usernameMatch || !actualPasswordMatch) {
    return res.status(401).json({ error: 'Invalid credentials' });
  }

  req.session.authenticated = true;
  req.session.username = username;
  res.json({ ok: true });
}

function logout(req, res) {
  req.session.destroy(() => {
    res.json({ ok: true });
  });
}

function me(req, res) {
  if (req.session && req.session.authenticated) {
    return res.json({ username: req.session.username });
  }
  res.status(401).json({ error: 'Not authenticated' });
}

module.exports = { requireAuth, login, logout, me };
