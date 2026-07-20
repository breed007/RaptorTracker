#!/usr/bin/env node
/**
 * RaptorTracker route-level integration tests.
 *
 * The smoke test proves the schema is right and every module loads. This one
 * proves the routes actually behave: it boots the real Express app against a
 * throwaway database, logs in over HTTP, and drives the endpoints an owner
 * touches most — vehicles, mods, AUX assignment, maintenance, fuel, outings —
 * asserting the responses, not just the absence of a crash.
 *
 * Run:  npm run test:api      (needs better-sqlite3 built for your Node version)
 */
const os = require('os');
const fs = require('fs');
const path = require('path');

// Throwaway data dir + known credentials BEFORE requiring app modules.
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'raptortracker-api-'));
process.env.DATA_DIR = tmp;
process.env.UPLOAD_DIR = path.join(tmp, 'uploads');
process.env.NODE_ENV = 'test';
process.env.ADMIN_USERNAME = 'testadmin';
process.env.ADMIN_PASSWORD = 'testpassword';
process.env.SESSION_SECRET = 'test-only-secret';
fs.mkdirSync(process.env.UPLOAD_DIR, { recursive: true });

require('../server/db/init.js');
const app = require('../server.js');

let failures = 0;
const results = [];
function check(name, fn) {
  try { fn(); results.push(`  ✓ ${name}`); }
  catch (e) { failures++; results.push(`  ✗ ${name} — ${e.message}`); }
}
function eq(actual, expected, what) {
  if (actual !== expected) throw new Error(`${what}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
}
function truthy(v, what) { if (!v) throw new Error(`${what}: expected a value, got ${JSON.stringify(v)}`); }

(async () => {
  const server = app.listen(0);
  await new Promise(r => server.once('listening', r));
  const base = `http://127.0.0.1:${server.address().port}`;
  let cookie = '';

  // Every request carries the session cookie once login hands one back.
  async function req(method, url, body) {
    const res = await fetch(base + url, {
      method,
      headers: { ...(body ? { 'Content-Type': 'application/json' } : {}), ...(cookie ? { Cookie: cookie } : {}) },
      body: body ? JSON.stringify(body) : undefined,
      redirect: 'manual',
    });
    const setCookie = res.headers.get('set-cookie');
    if (setCookie) cookie = setCookie.split(';')[0];
    const text = await res.text();
    let json = null;
    try { json = text ? JSON.parse(text) : null; } catch { /* non-JSON body */ }
    return { status: res.status, body: json, text };
  }

  console.log('RaptorTracker API tests');
  console.log(`  data dir: ${tmp}`);

  try {
    // --- Auth gate -----------------------------------------------------
    let r = await req('GET', '/api/user-vehicles');
    check('unauthenticated API request is rejected', () => eq(r.status, 401, 'status'));

    r = await req('POST', '/api/auth/login', { username: 'testadmin', password: 'wrong' });
    check('login rejects a bad password', () => eq(r.status, 401, 'status'));

    r = await req('POST', '/api/auth/login', { username: 'testadmin', password: 'testpassword' });
    check('login succeeds with correct credentials', () => {
      eq(r.status, 200, 'status');
      truthy(cookie, 'session cookie');
    });

    // --- Fresh install has an empty garage ------------------------------
    r = await req('GET', '/api/user-vehicles');
    check('a fresh install has no vehicles', () => {
      eq(r.status, 200, 'status');
      eq(Array.isArray(r.body) ? r.body.length : -1, 0, 'vehicle count');
    });

    r = await req('GET', '/api/vehicles');
    check('reference vehicles are seeded', () => {
      eq(r.status, 200, 'status');
      truthy(Array.isArray(r.body) && r.body.length > 0, 'reference vehicle count');
    });

    // --- Add a truck ----------------------------------------------------
    // Pick a generation that actually has an AUX panel — Gen 1 has none, and
    // the AUX assertions below would pass vacuously against it.
    const ref = r.body.find(v => v.aux_switch_count > 0);
    check('a reference generation with an AUX panel exists', () => truthy(ref, 'AUX-equipped reference vehicle'));
    const refId = ref?.id;
    r = await req('POST', '/api/user-vehicles', {
      vehicle_id: refId, nickname: 'Test Raptor', model_year: 2023,
      purchase_date: '2024-01-15', mileage_at_purchase: 12,
    });
    check('a vehicle can be added', () => {
      eq(r.status, 201, 'status');
      truthy(r.body?.id, 'new vehicle id');
    });
    const vid = r.body?.id;
    if (!vid) throw new Error('cannot continue without a vehicle');

    // --- Mods and AUX assignment ----------------------------------------
    r = await req('POST', '/api/mods', {
      user_vehicle_id: vid, part_name: 'Light Bar', brand: 'Baja Designs',
      category: 'Lighting', status: 'Installed', cost: 899, amp_draw: 12,
      aux_switches: [{ switch_number: 2, label: 'Bar' }, { switch_number: 3, label: 'Flood' }],
      install_date: '2024-03-01',
    });
    check('a mod with two AUX switches saves', () => eq(r.status, 201, 'status'));
    const modId = r.body?.id;

    r = await req('GET', `/api/mods?vehicle_id=${vid}`);
    check('the mod round-trips both AUX switches', () => {
      const mod = (r.body || []).find(m => m.id === modId);
      truthy(mod, 'saved mod');
      eq(mod.aux_switches.map(a => Number(a.switch_number)).join(','), '2,3', 'aux_switches');
      eq(mod.aux_switch, 2, 'legacy aux_switch mirror');
    });

    r = await req('GET', `/api/aux-capacity?vehicle_id=${vid}`);
    check('the AUX panel reflects both assignments', () => {
      eq(r.status, 200, 'status');
      const assigned = (r.body.switches || []).filter(s => s.mods.some(m => m.id === modId));
      eq(assigned.length, 2, 'switches showing the mod');
      eq(assigned[0].currentAmps, 12, 'amp draw on the switch');
    });

    // Reassigning down to one switch must free the other, not orphan it.
    r = await req('PUT', `/api/mods/${modId}`, {
      user_vehicle_id: vid, part_name: 'Light Bar', brand: 'Baja Designs',
      category: 'Lighting', status: 'Installed', cost: 899, amp_draw: 12, install_date: '2024-03-01',
      aux_switches: [{ switch_number: 2, label: 'Bar' }],
    });
    check('a mod can be narrowed to one AUX switch', () => eq(r.status, 200, 'status'));

    r = await req('GET', `/api/aux-capacity?vehicle_id=${vid}`);
    check('the freed AUX switch is released on the panel', () => {
      const switches = r.body.switches || [];
      eq(switches.filter(s => s.mods.some(m => m.id === modId)).length, 1, 'switches showing the mod');
      const freed = switches.find(s => s.switch_number === 3);
      eq(freed.mods.length, 0, 'mods left on the freed switch');
      eq(freed.available, true, 'freed switch availability');
    });

    // --- Maintenance ------------------------------------------------------
    r = await req('POST', '/api/maintenance', {
      user_vehicle_id: vid, service_type: 'Oil Change', date_performed: '2024-06-01',
      mileage: 25000, cost: 89.99, service_provider_type: 'independent',
    });
    check('a service record saves', () => eq(r.status, 201, 'status'));

    // --- Fuel: a partial fill must not be stored as a full tank ----------
    r = await req('POST', '/api/fuel', {
      user_vehicle_id: vid, date: '2024-06-02', odometer: 25100,
      gallons: 12.5, total_cost: 48.75, full_tank: false,
    });
    check('a fuel entry saves', () => eq(r.status, 200, 'status'));

    r = await req('GET', `/api/fuel?vehicle_id=${vid}`);
    check('a partial fill stays partial', () => {
      const entries = r.body.entries || [];
      truthy(entries.length > 0, 'fuel entries');
      eq(Boolean(entries[0].full_tank), false, 'full_tank');
    });

    // --- Outings ----------------------------------------------------------
    r = await req('POST', '/api/outings', {
      user_vehicle_id: vid, name: 'Moab Weekend', date: '2024-06-10',
      end_date: '2024-06-12', location: 'Moab, UT', trail_name: "Hell's Revenge",
      difficulty: 'difficult', terrain: 'rock',
      odometer_start: 25200, odometer_end: 25380,
      tire_psi_front: 18, tire_psi_rear: 20, damage: 'Scraped rock slider',
    });
    check('an outing saves', () => eq(r.status, 201, 'status'));

    r = await req('GET', `/api/outings?vehicle_id=${vid}`);
    check('outing miles and summary are computed', () => {
      eq(r.status, 200, 'status');
      const o = r.body.outings[0];
      eq(o.miles, 180, 'miles');
      eq(o.days, 3, 'days');
      eq(r.body.summary.totalMiles, 180, 'summary totalMiles');
      eq(r.body.summary.withDamage, 1, 'summary withDamage');
    });

    r = await req('GET', `/api/user-vehicles/${vid}`);
    check('an outing that ends past the odometer bumps the vehicle', () => {
      eq(r.body?.current_mileage, 25380, 'current_mileage');
    });

    // --- Build sheet -------------------------------------------------------
    r = await req('GET', `/api/share/build-sheet?vehicle_id=${vid}&format=bbcode`);
    check('a build sheet renders installed mods', () => {
      eq(r.status, 200, 'status');
      eq(r.body.format, 'bbcode', 'format');
      if (!r.body.content.includes('Light Bar')) throw new Error('the installed mod is missing');
      if (!/\[list\]/.test(r.body.content)) throw new Error('no BBCode list markup');
    });

    check('the AUX assignment appears on the build sheet', () => {
      if (!/AUX 2/.test(r.body.content)) throw new Error('AUX assignment missing');
    });

    // The whole feature is public output, so this is the assertion that matters.
    check('private fields never reach the build sheet', () => {
      const c = r.body.content;
      for (const secret of ['1FTFW1RG5MFA00001', '68500', 'insurance']) {
        if (c.toLowerCase().includes(String(secret).toLowerCase())) {
          throw new Error(`"${secret}" leaked into a shareable build sheet`);
        }
      }
    });

    check('prices are withheld unless explicitly asked for', () => {
      if (/899/.test(r.body.content)) throw new Error('a price appeared with costs off');
    });

    r = await req('GET', `/api/share/build-sheet?vehicle_id=${vid}&format=bbcode&costs=true`);
    check('prices appear when opted in', () => {
      if (!/899/.test(r.body.content)) throw new Error('price missing with costs=true');
    });

    r = await req('GET', `/api/share/build-sheet?vehicle_id=${vid}&format=markdown`);
    check('markdown format renders', () => {
      if (!/^## /m.test(r.body.content)) throw new Error('no markdown heading');
      if (/\[list\]/.test(r.body.content)) throw new Error('BBCode leaked into markdown');
    });

    r = await req('GET', `/api/share/build-sheet?vehicle_id=${vid}&format=text&attribution=false`);
    check('attribution can be turned off', () => {
      if (/RaptorTracker/.test(r.body.content)) throw new Error('attribution still present');
    });

    r = await req('GET', '/api/share/build-sheet');
    check('the build sheet requires a vehicle_id', () => eq(r.status, 400, 'status'));

    r = await req('GET', '/api/share/build-sheet?vehicle_id=999999');
    check('a build sheet for a missing vehicle 404s', () => eq(r.status, 404, 'status'));

    // --- Cross-cutting reads ----------------------------------------------
    r = await req('GET', `/api/logbook?vehicle_id=${vid}`);
    check('the logbook merges every record type', () => {
      eq(r.status, 200, 'status');
      const types = new Set((r.body.events || []).map(e => e.type));
      for (const t of ['vehicle', 'mod', 'service', 'fuel', 'outing']) {
        if (!types.has(t)) throw new Error(`missing ${t} events`);
      }
    });

    r = await req('GET', `/api/overview?vehicle_id=${vid}`);
    check('the dashboard overview loads', () => eq(r.status, 200, 'status'));

    r = await req('GET', `/api/export/csv/mods/${vid}`);
    check('CSV export returns data', () => {
      eq(r.status, 200, 'status');
      truthy(r.text.includes('Light Bar'), 'exported mod');
    });

    // --- Validation and 404s ----------------------------------------------
    r = await req('POST', '/api/outings', { user_vehicle_id: vid, date: '2024-06-10' });
    check('an outing without a name is rejected', () => eq(r.status, 400, 'status'));

    r = await req('GET', '/api/outings');
    check('outings require a vehicle_id', () => eq(r.status, 400, 'status'));

    r = await req('DELETE', '/api/outings/999999');
    check('deleting a missing outing 404s', () => eq(r.status, 404, 'status'));

    // --- Cascade: removing the truck removes its records -------------------
    r = await req('DELETE', `/api/user-vehicles/${vid}`);
    check('a vehicle can be deleted', () => truthy(r.status < 300, `status ${r.status}`));

    r = await req('GET', `/api/outings?vehicle_id=${vid}`);
    check('its outings go with it', () => eq((r.body?.outings || []).length, 0, 'remaining outings'));

    // --- Password change ---------------------------------------------------
    r = await req('GET', '/api/auth/me');
    check('a bootstrap-password install says so', () => {
      eq(r.status, 200, 'status');
      eq(r.body.mustChangePassword, true, 'mustChangePassword');
    });

    r = await req('POST', '/api/auth/password', { current_password: 'wrong', new_password: 'a-much-longer-passphrase' });
    check('changing the password needs the current one', () => eq(r.status, 401, 'status'));

    r = await req('POST', '/api/auth/password', { current_password: 'testpassword', new_password: 'short' });
    check('a too-short new password is rejected', () => eq(r.status, 400, 'status'));

    r = await req('POST', '/api/auth/password', { current_password: 'testpassword', new_password: 'changeme-please-now' });
    check('the placeholder password is rejected', () => eq(r.status, 400, 'status'));

    r = await req('POST', '/api/auth/password', { current_password: 'testpassword', new_password: 'correct-horse-battery-staple' });
    check('the password can be changed', () => eq(r.status, 200, 'status'));

    r = await req('GET', '/api/auth/me');
    check('the bootstrap warning clears once a password is set', () =>
      eq(r.body.mustChangePassword, false, 'mustChangePassword'));

    // The database hash must now win over the .env value entirely.
    const saved = cookie; cookie = '';
    r = await req('POST', '/api/auth/login', { username: 'testadmin', password: 'testpassword' });
    check('the old .env password no longer works', () => eq(r.status, 401, 'status'));

    r = await req('POST', '/api/auth/login', { username: 'testadmin', password: 'correct-horse-battery-staple' });
    check('the new password works', () => eq(r.status, 200, 'status'));

    // A hash in app_settings must never reach the client.
    r = await req('GET', '/api/notifications');
    check('the password hash is not exposed through settings', () => {
      const body = JSON.stringify(r.body || {});
      if (/secret_|\$2[aby]\$/.test(body)) throw new Error('a secret leaked into the settings response');
    });
    if (!cookie) cookie = saved;

    r = await req('POST', '/api/auth/logout');
    check('logout succeeds', () => eq(r.status, 200, 'status'));

    // --- Rate limiting -----------------------------------------------------
    // Off by default under test so the suite above can drive login freely;
    // switched on here so the protection itself is actually exercised.
    process.env.RATE_LIMIT_IN_TEST = 'true';
    cookie = '';
    let limited = 0, attempts = 0;
    for (let i = 0; i < 14; i++) {
      const res = await req('POST', '/api/auth/login', { username: 'testadmin', password: `bad-${i}` });
      attempts++;
      if (res.status === 429) { limited++; }
    }
    check('repeated failed sign-ins get rate limited', () => {
      if (!limited) throw new Error(`14 bad attempts produced no 429 (all ${attempts} allowed)`);
    });

    r = await req('POST', '/api/auth/login', { username: 'testadmin', password: 'correct-horse-battery-staple' });
    check('the lockout applies even to the correct password', () => eq(r.status, 429, 'status'));
    process.env.RATE_LIMIT_IN_TEST = '';
  } catch (e) {
    failures++;
    results.push(`  ✗ test run aborted — ${e.message}`);
  }

  console.log(results.join('\n'));
  server.close();
  try { require('../server/db').closeDb(); } catch { /* already closed */ }
  fs.rmSync(tmp, { recursive: true, force: true });

  if (failures) {
    console.error(`\n${failures} API check(s) failed.`);
    process.exit(1);
  }
  console.log('\nAll API checks passed.');
  process.exit(0);
})();
