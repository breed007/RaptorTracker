#!/usr/bin/env node
/**
 * RaptorTracker security tests.
 *
 * Runs the real server.js as a child process against a throwaway data
 * directory and attacks it the way a hostile archive or an unauthenticated
 * visitor would: decompression bombs, path traversal, symlinks, smuggled
 * script files, unauthenticated access to uploads, and stale sessions after a
 * password change. Also checks that sessions survive a restart and that a
 * full backup restores faithfully.
 *
 * Run:  npm run test:security   (needs python3 to build the hostile archives)
 */
const os = require('os');
const fs = require('fs');
const path = require('path');
const { spawn, execFileSync } = require('child_process');

const ROOT = path.join(__dirname, '..');
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'raptortracker-sec-'));
const DATA = path.join(tmp, 'data');
const UPLOADS = path.join(DATA, 'uploads');
const HOSTILE = path.join(tmp, 'hostile');
fs.mkdirSync(UPLOADS, { recursive: true });

const USER = 'secadmin';
const PASS = 'security-suite-pass';
const NEW_PASS = 'a-different-long-passphrase';

let failures = 0;
const ok = (n) => console.log(`  ✓ ${n}`);
const bad = (n, e) => { failures++; console.error(`  ✗ ${n} — ${e.message}`); };
async function check(name, fn) { try { await fn(); ok(name); } catch (e) { bad(name, e); } }
function eq(a, b, what) { if (a !== b) throw new Error(`${what}: expected ${JSON.stringify(b)}, got ${JSON.stringify(a)}`); }
function truthy(v, what) { if (!v) throw new Error(`${what}: expected a value, got ${JSON.stringify(v)}`); }

let server = null;
let port = 0;

function startServer() {
  port = 30000 + Math.floor(Math.random() * 20000);
  server = spawn(process.execPath, ['server.js'], {
    cwd: ROOT,
    env: {
      ...process.env, NODE_ENV: 'test', PORT: String(port), DATA_DIR: DATA, UPLOAD_DIR: UPLOADS,
      ADMIN_USERNAME: USER, ADMIN_PASSWORD: PASS, SESSION_SECRET: 'security-suite-secret-'.padEnd(48, 'x'),
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  server.log = '';
  server.stdout.on('data', d => { server.log += d; });
  server.stderr.on('data', d => { server.log += d; });
  return waitForHealth();
}

async function waitForHealth() {
  for (let i = 0; i < 80; i++) {
    try { const r = await fetch(`http://127.0.0.1:${port}/api/health`); if (r.ok) return; } catch (_) { /* not up yet */ }
    await new Promise(r => setTimeout(r, 150));
  }
  throw new Error(`server did not start:\n${server.log}`);
}

function stopServer() {
  return new Promise(resolve => {
    if (!server || server.exitCode !== null) return resolve();
    server.once('exit', resolve);
    server.kill('SIGTERM');
  });
}

function peakRss(pid) {
  try { return Number(execFileSync('ps', ['-o', 'rss=', '-p', String(pid)], { encoding: 'utf8' }).trim()) * 1024; } catch (_) { return 0; }
}

/** A tiny cookie-carrying client; each instance is a separate browser. */
function client() {
  let cookie = '';
  async function req(method, url, { json, form, raw } = {}) {
    const headers = {};
    if (cookie) headers.Cookie = cookie;
    let body;
    if (json) { headers['Content-Type'] = 'application/json'; body = JSON.stringify(json); }
    if (form) body = form;
    const res = await fetch(`http://127.0.0.1:${port}${url}`, { method, headers, body, redirect: 'manual' });
    const set = res.headers.get('set-cookie');
    if (set) cookie = set.split(';')[0];
    if (raw) return res;
    const text = await res.text();
    let data = null;
    try { data = text ? JSON.parse(text) : null; } catch (_) { /* not JSON */ }
    return { status: res.status, body: data, text, headers: res.headers };
  }
  return {
    req,
    get cookie() { return cookie; },
    set cookie(c) { cookie = c; },
    login: (password = PASS) => req('POST', '/api/auth/login', { json: { username: USER, password } }),
  };
}

function zipForm(field, filePath, name) {
  const fd = new FormData();
  fd.append(field, new Blob([fs.readFileSync(filePath)], { type: 'application/zip' }), name || path.basename(filePath));
  return fd;
}

(async () => {
  console.log('RaptorTracker security tests');
  execFileSync('python3', [path.join(__dirname, 'fixtures', 'make-hostile-zips.py'), HOSTILE]);
  await startServer();

  const a = client();
  await check('sign in', async () => eq((await a.login()).status, 200, 'status'));

  // A vehicle to hang records on.
  const ref = (await a.req('GET', '/api/vehicles')).body.find(v => v.aux_switch_count > 0);
  const vid = (await a.req('POST', '/api/user-vehicles', { json: { vehicle_id: ref.id, nickname: 'Security Truck', model_year: 2022 } })).body.id;

  // ── Uploads are private ────────────────────────────────────────────────────
  fs.writeFileSync(path.join(UPLOADS, 'private-doc.pdf'), '%PDF-1.4 registration scan');
  fs.writeFileSync(path.join(UPLOADS, 'smuggled.html'), '<script>alert(1)</script>');

  await check('uploads require sign-in', async () => {
    const r = await client().req('GET', '/uploads/private-doc.pdf');
    eq(r.status, 401, 'anonymous status');
  });
  await check('uploads are served once signed in, with nosniff', async () => {
    const r = await a.req('GET', '/uploads/private-doc.pdf');
    eq(r.status, 200, 'status');
    eq(r.headers.get('x-content-type-options'), 'nosniff', 'nosniff');
  });
  await check('a file type the app never accepts is not served, even signed in', async () => {
    eq((await a.req('GET', '/uploads/smuggled.html')).status, 404, 'status');
  });

  // ── Headers and routing ────────────────────────────────────────────────────
  await check('pages carry a Content-Security-Policy and frame protection', async () => {
    const r = await a.req('GET', '/api/health');
    truthy(/script-src 'self'/.test(r.headers.get('content-security-policy') || ''), 'CSP');
    eq(r.headers.get('x-frame-options'), 'DENY', 'x-frame-options');
    eq(r.headers.get('x-powered-by'), null, 'x-powered-by');
  });
  await check('an unknown API path is a JSON 404, not the app page', async () => {
    const r = await a.req('GET', '/api/no-such-endpoint');
    eq(r.status, 404, 'status');
    truthy(r.body && r.body.error, 'JSON error body');
  });

  // ── Hostile archives ───────────────────────────────────────────────────────
  await check('a decompression bomb is rejected without exhausting memory', async () => {
    let peak = 0;
    const sampler = setInterval(() => { peak = Math.max(peak, peakRss(server.pid)); }, 50);
    const r = await a.req('POST', '/api/backup/restore', { form: zipForm('backup', path.join(HOSTILE, 'bomb.zip')) });
    clearInterval(sampler);
    if (r.status < 400) throw new Error(`accepted with ${r.status}`);
    // The archive inflates to 600 MB. Streaming keeps the server far below that.
    if (peak > 300 * 1024 * 1024) throw new Error(`server RSS peaked at ${Math.round(peak / 1048576)} MB`);
    const leftovers = fs.readdirSync(DATA).filter(f => f.startsWith('restore-'));
    eq(leftovers.length, 0, 'temporary restore files left behind');
  });

  await check('the live database survived the rejected bomb', async () => {
    const r = await a.req('GET', '/api/user-vehicles');
    eq(r.status, 200, 'status');
    truthy(r.body.some(v => v.id === vid), 'vehicle still present');
  });

  await check('an archive with a path-traversal entry is refused', async () => {
    const r = await a.req('POST', `/api/mods/import?vehicle_id=${vid}`, { form: zipForm('file', path.join(HOSTILE, 'traversal.zip')) });
    if (r.status < 400) throw new Error(`accepted with ${r.status}`);
    eq(fs.existsSync(path.join(DATA, '..', 'evil.jpg')) || fs.existsSync(path.join(tmp, 'evil.jpg')), false, 'escaped file written');
  });

  await check('a symlink entry is never followed or written', async () => {
    await a.req('POST', `/api/mods/import?vehicle_id=${vid}`, { form: zipForm('file', path.join(HOSTILE, 'symlink.zip')) });
    const links = fs.readdirSync(UPLOADS).filter(f => fs.lstatSync(path.join(UPLOADS, f)).isSymbolicLink());
    eq(links.length, 0, 'symlinks in uploads');
    const leaked = fs.readdirSync(UPLOADS).some(f => /root:.*:0:0:/.test(fs.readFileSync(path.join(UPLOADS, f), 'utf8')));
    eq(leaked, false, 'contents of /etc/passwd copied into uploads');
  });

  await check('an imported .svg "photo" is dropped; the real photo is kept', async () => {
    const before = new Set(fs.readdirSync(UPLOADS));
    const r = await a.req('POST', `/api/mods/import?vehicle_id=${vid}`, { form: zipForm('file', path.join(HOSTILE, 'svg.zip')) });
    eq(r.status, 200, 'import status');
    const added = fs.readdirSync(UPLOADS).filter(f => !before.has(f));
    eq(added.some(f => f.endsWith('.svg')), false, 'svg written to uploads');
    eq(added.filter(f => f.endsWith('.jpg')).length, 1, 'jpg written');
  });

  // ── File deletion stays inside uploads/ and inside the record ───────────────
  await check('attachment and photo deletes cannot reach outside uploads/ (all four routes)', async () => {
    const svc = (await a.req('POST', '/api/maintenance', { json: { user_vehicle_id: vid, service_type: 'Oil Change', date_performed: '2024-01-01' } })).body.id;
    const mod = (await a.req('POST', '/api/mods', { json: { user_vehicle_id: vid, part_name: 'Delete Target' } })).body.id;
    const out = (await a.req('POST', '/api/outings', { json: { user_vehicle_id: vid, name: 'Delete Target', date: '2024-01-02' } })).body.id;
    const routes = [
      `/api/maintenance/${svc}/attachments/`, `/api/mods/${mod}/attachments/`,
      `/api/outings/${out}/photos/`, `/api/user-vehicles/${vid}/photos/`,
    ];
    for (const route of routes) {
      const canary = path.join(DATA, 'CANARY.txt');
      fs.writeFileSync(canary, 'must survive');
      const r = await a.req('DELETE', `${route}..%2FCANARY.txt`);
      eq(fs.existsSync(canary), true, `${route}: file outside uploads/ was deleted`);
      if (r.status !== 404) throw new Error(`${route}: expected 404, got ${r.status}`);
    }
  });

  await check("a record cannot delete another record's file", async () => {
    fs.writeFileSync(path.join(UPLOADS, 'someone-elses.pdf'), 'registration scan');
    const svc = (await a.req('POST', '/api/maintenance', { json: { user_vehicle_id: vid, service_type: 'Tire Rotation', date_performed: '2024-01-03' } })).body.id;
    const r = await a.req('DELETE', `/api/maintenance/${svc}/attachments/someone-elses.pdf`);
    eq(r.status, 404, 'status');
    eq(fs.existsSync(path.join(UPLOADS, 'someone-elses.pdf')), true, 'unlisted file deleted');
  });

  // ── Corrupt data does not take a page down ─────────────────────────────────
  await check('a corrupt photo list in one row does not break the mods list', async () => {
    await a.req('POST', '/api/mods', { json: { user_vehicle_id: vid, part_name: 'Healthy Mod' } });
    const Database = require('better-sqlite3');
    const db = new Database(path.join(DATA, 'raptortracker.db'));
    db.prepare("UPDATE mods SET photos = '{not valid json' WHERE part_name = 'Healthy Mod'").run();
    db.close();
    const r = await a.req('GET', `/api/mods?vehicle_id=${vid}`);
    eq(r.status, 200, 'status');
    const mod = r.body.find(m => m.part_name === 'Healthy Mod');
    truthy(mod, 'the mod is still listed');
    eq(JSON.stringify(mod.photos), '[]', 'corrupt photos read as empty');
  });

  // ── Backup and restore round trip ──────────────────────────────────────────
  await check('a full backup restores faithfully', async () => {
    fs.writeFileSync(path.join(UPLOADS, 'roundtrip.jpg'), 'jpeg bytes for the round trip');
    await a.req('POST', '/api/mods', { json: { user_vehicle_id: vid, part_name: 'Before Backup' } });
    const res = await a.req('GET', '/api/backup', { raw: true });
    eq(res.status, 200, 'backup status');
    const zipPath = path.join(tmp, 'roundtrip.zip');
    fs.writeFileSync(zipPath, Buffer.from(await res.arrayBuffer()));

    // Change things after the backup, then restore over them.
    await a.req('POST', '/api/mods', { json: { user_vehicle_id: vid, part_name: 'After Backup' } });
    fs.rmSync(path.join(UPLOADS, 'roundtrip.jpg'));

    const r = await a.req('POST', '/api/backup/restore', { form: zipForm('backup', zipPath) });
    eq(r.status, 200, `restore status (${JSON.stringify(r.body)})`);
    const mods = (await a.req('GET', `/api/mods?vehicle_id=${vid}`)).body.map(m => m.part_name);
    truthy(mods.includes('Before Backup'), 'pre-backup mod restored');
    eq(mods.includes('After Backup'), false, 'post-backup mod removed');
    eq(fs.readFileSync(path.join(UPLOADS, 'roundtrip.jpg'), 'utf8'), 'jpeg bytes for the round trip', 'upload restored');
  });

  await check('restoring does not sign out the person restoring', async () => {
    eq((await a.req('GET', '/api/auth/me')).status, 200, 'status');
  });

  // ── Sessions ───────────────────────────────────────────────────────────────
  await check('a session survives a server restart', async () => {
    await stopServer();
    await startServer();
    eq((await a.req('GET', '/api/auth/me')).status, 200, 'status after restart');
  });

  await check('changing the password signs out every other session', async () => {
    const b = client();
    eq((await b.login()).status, 200, 'second browser signs in');
    const r = await a.req('POST', '/api/auth/password', { json: { current_password: PASS, new_password: NEW_PASS } });
    eq(r.status, 200, 'password change');
    eq((await b.req('GET', '/api/auth/me')).status, 401, 'other browser after change');
    eq((await a.req('GET', '/api/auth/me')).status, 200, 'browser that changed it');
  });

  await check('session tokens are not stored in the main database (and so not in backups)', async () => {
    const Database = require('better-sqlite3');
    const db = new Database(path.join(DATA, 'raptortracker.db'), { readonly: true });
    const has = db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='sessions'").get();
    db.close();
    eq(!!has, false, 'sessions table in raptortracker.db');
    truthy(fs.existsSync(path.join(DATA, 'sessions.db')), 'sessions.db exists');
  });

  await stopServer();
  fs.rmSync(tmp, { recursive: true, force: true });
  if (failures) { console.error(`\n${failures} security check(s) failed.`); process.exit(1); }
  console.log('\nAll security checks passed.');
})().catch(async (e) => {
  console.error('security suite crashed:', e);
  if (server) console.error(server.log);
  await stopServer();
  process.exit(1);
});
