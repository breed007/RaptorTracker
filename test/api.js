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

    r = await req('GET', '/api/health');
    check('the health check answers without signing in', () => {
      eq(r.status, 200, 'status');
      eq(r.body.status, 'ok', 'health status');
      if (!/^\d+\.\d+\.\d+/.test(r.body.version || '')) throw new Error('no version in health response');
    });

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

    // --- First-run units --------------------------------------------------
    r = await req('GET', '/api/settings/units');
    check('a fresh install has not picked units yet', () => {
      eq(r.status, 200, 'status');
      eq(r.body.chosen, false, 'chosen');
      eq(r.body.units.distance, 'mi', 'default distance');
    });
    r = await req('GET', '/api/settings/units/suggest?locale=en-GB');
    check('a British browser is offered miles, liters, and pounds', () => {
      eq(r.body.units.distance, 'mi', 'distance'); eq(r.body.units.volume, 'l', 'volume'); eq(r.body.units.currency, 'GBP', 'currency');
    });
    r = await req('PUT', '/api/settings/units', { distance: 'mi', volume: 'gal', economy: 'mpg', pressure: 'psi', currency: 'USD' });
    check('picking units on an empty install saves without a snapshot', () => {
      eq(r.status, 200, 'status'); eq(r.body.snapshot, null, 'snapshot');
    });
    r = await req('PUT', '/api/settings/units', { distance: 'km' });
    check('switching with nothing stored skips the snapshot', () => {
      eq(r.status, 200, 'status'); eq(r.body.snapshot, null, 'snapshot'); eq(r.body.converted, 0, 'converted');
    });
    await req('PUT', '/api/settings/units', { distance: 'mi' });
    r = await req('GET', '/api/settings/units');
    check('units count as chosen once saved', () => eq(r.body.chosen, true, 'chosen'));

    r = await req('GET', '/api/vehicles');
    check('reference vehicles are seeded', () => {
      eq(r.status, 200, 'status');
      truthy(Array.isArray(r.body) && r.body.length > 0, 'reference vehicle count');
    });

    // --- Add a truck ----------------------------------------------------
    // Pick a generation that actually has an AUX panel — Gen 1 has none, and
    // the AUX assertions below would pass vacuously against it.
    // Pinned to Gen 3 so the electrical expectations below don't depend on
    // the order of the reference list (Gen 1 has switches too, at 30 A).
    const ref = r.body.find(v => v.model === 'F-150 Raptor' && v.generation === 'Gen 3');
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

    // An owner's own fuse rating replaces Ford's default, and resets cleanly.
    r = await req('PUT', `/api/user-vehicles/${vid}/aux-fuse`, { switch_number: 2, fuse_amps: 20 });
    check('an owner can set their own fuse rating for a switch', () => eq(r.status, 200, 'status'));
    r = await req('GET', `/api/aux-capacity?vehicle_id=${vid}`);
    check('the capacity planner uses it, and still shows Ford\'s figure', () => {
      const s2 = r.body.switches.find(s => s.switch_number === 2);
      eq(s2.fuse_amps, 20, 'effective rating');
      eq(s2.fuse_amps_default, 15, "Ford's default");
      eq(s2.fuse_overridden, true, 'flagged as overridden');
      truthy(r.body.source && r.body.source.text, 'source of the defaults');
    });
    r = await req('PUT', `/api/user-vehicles/${vid}/aux-fuse`, { switch_number: 2, fuse_amps: 500 });
    check('an impossible rating is refused', () => eq(r.status, 400, 'status'));
    r = await req('PUT', `/api/user-vehicles/${vid}/aux-fuse`, { switch_number: 2, fuse_amps: null });
    r = await req('GET', `/api/aux-capacity?vehicle_id=${vid}`);
    check('resetting goes back to Ford\'s rating', () => {
      const s2 = r.body.switches.find(s => s.switch_number === 2);
      eq(s2.fuse_amps, 15, 'effective rating');
      eq(s2.fuse_overridden, false, 'not overridden');
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

    // --- One source of truth for mileage -----------------------------------
    r = await req('POST', '/api/maintenance', {
      user_vehicle_id: vid, service_type: 'Tire Rotation', date_performed: '2024-06-20', mileage: 26000,
    });
    check('a service logged at a higher mileage moves the truck forward', () => eq(r.status, 201, 'status'));
    r = await req('GET', `/api/user-vehicles/${vid}`);
    check('current mileage follows the service', () => eq(r.body.current_mileage, 26000, 'current_mileage'));

    r = await req('POST', '/api/fuel', {
      user_vehicle_id: vid, date: '2024-06-05', odometer: 24000, gallons: 20, full_tank: true,
    });
    check('a reading lower than an earlier one comes back with a warning', () => {
      truthy(r.body.odometerWarning, 'odometerWarning');
      truthy(/lower than/.test(r.body.odometerWarning), `warning text: ${r.body.odometerWarning}`);
    });

    r = await req('POST', '/api/mileage', { user_vehicle_id: vid, date: '2024-06-21', odometer: 260000 });
    const typoId = r.body.id;
    check('an extra-digit jump is flagged', () => {
      truthy(/extra digit/.test(r.body.odometerWarning || ''), `warning text: ${r.body.odometerWarning}`);
      eq(r.body.current_mileage, 260000, 'saved anyway');
    });
    r = await req('DELETE', `/api/mileage/${typoId}`);
    check('deleting the typo brings the truck back down', () => eq(r.body.current_mileage, 26000, 'current_mileage'));

    r = await req('POST', '/api/fuel', {
      user_vehicle_id: vid, date: '2024-06-22', odometer: 26100, gallons: 10, full_tank: 0,
    });
    check('a partial fill sent as 0 is stored as partial', () => eq(r.body.full_tank, 0, 'full_tank'));

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

    // --- Recall triage (state only; the list itself comes from NHTSA) ------
    {
      const stored = () => {
        const Database = require('better-sqlite3');
        const db = new Database(path.join(tmp, 'raptortracker.db'), { readonly: true });
        const row = db.prepare('SELECT confirmed_recalls, dismissed_recalls, fixed_recalls FROM user_vehicles WHERE id = ?').get(vid);
        db.close();
        return { applies: JSON.parse(row.confirmed_recalls), not_applicable: JSON.parse(row.dismissed_recalls), fixed: JSON.parse(row.fixed_recalls) };
      };
      r = await req('PUT', '/api/recalls/state', { vehicle_id: vid, campaign: '22V253000', state: 'applies' });
      check('a recall can be confirmed for this truck', () => {
        eq(r.status, 200, 'status');
        eq(stored().applies.includes('22V253000'), true, 'stored as applies');
      });
      await req('PUT', '/api/recalls/state', { vehicle_id: vid, campaign: '22V253000', state: 'fixed' });
      check('marking it repaired moves it out of "applies"', () => {
        const st = stored();
        eq(st.applies.includes('22V253000'), false, 'still applies');
        eq(st.fixed.includes('22V253000'), true, 'fixed');
      });
      await req('PUT', '/api/recalls/state', { vehicle_id: vid, campaign: '22V253000', state: 'review' });
      check('undo puts it back to "may apply"', () => {
        const st = stored();
        eq(st.fixed.length + st.applies.length + st.not_applicable.length, 0, 'any state left');
      });
      r = await req('PUT', '/api/recalls/state', { vehicle_id: vid, campaign: '22V253000', state: 'ignored' });
      check('an unknown recall state is refused', () => eq(r.status, 400, 'status'));
    }

    // --- Units: switch to metric and back ------------------------------------
    {
      const Database = require('better-sqlite3');
      const snap = () => {
        const db = new Database(path.join(tmp, 'raptortracker.db'), { readonly: true });
        const v = db.prepare('SELECT current_mileage FROM user_vehicles WHERE id = ?').get(vid);
        const f = db.prepare('SELECT gallons, price_per_gallon FROM fuel_log WHERE user_vehicle_id = ? AND price_per_gallon IS NOT NULL ORDER BY id LIMIT 1').get(vid)
          || db.prepare('SELECT gallons, price_per_gallon FROM fuel_log WHERE user_vehicle_id = ? ORDER BY id LIMIT 1').get(vid);
        db.close();
        return { mileage: v.current_mileage, gallons: f.gallons, ppg: f.price_per_gallon };
      };
      await req('POST', '/api/fuel', { user_vehicle_id: vid, date: '2024-06-23', odometer: 26200, gallons: 20, price_per_gallon: 3.8, full_tank: true });
      const before = snap();

      // A fill-up sitting in the trash during the switch must come back converted.
      r = await req('POST', '/api/fuel', { user_vehicle_id: vid, date: '2024-06-24', odometer: 26300, gallons: 10, price_per_gallon: 4, full_tank: true });
      const trashedFuelId = r.body.id;
      r = await req('DELETE', `/api/fuel/${trashedFuelId}`);
      const fuelTrash = r.body.trashed?.id;

      r = await req('PUT', '/api/settings/units', { distance: 'km', volume: 'l', pressure: 'kpa', economy: 'l100km', currency: 'CAD' });
      check('switching to metric converts stored values', () => {
        eq(r.status, 200, `status ${JSON.stringify(r.body)}`);
        truthy(r.body.converted > 0, 'values converted');
        truthy(/^before-units-/.test(r.body.snapshot || ''), 'snapshot taken first');
        truthy(fs.existsSync(path.join(tmp, 'backups', r.body.snapshot)), 'snapshot file on disk');
        const after = snap();
        const near = (a, b, tol, w) => { if (Math.abs(a - b) > tol) throw new Error(`${w}: ${a} vs ${b}`); };
        near(after.mileage, before.mileage * 1.609344, 0.05, 'odometer in km');
        near(after.gallons, before.gallons * 3.785411784, 0.0005, 'volume in liters');
        if (before.ppg != null) near(after.ppg, before.ppg / 3.785411784, 0.00005, 'price per liter');
        eq(after.mileage, Math.round(after.mileage * 10) / 10, 'odometer rounded to 0.1 km');
      });

      await req('POST', `/api/trash/${fuelTrash}/restore`);
      {
        const db = new Database(path.join(tmp, 'raptortracker.db'), { readonly: true });
        const f = db.prepare('SELECT odometer, gallons FROM fuel_log WHERE id = ?').get(trashedFuelId);
        db.close();
        check('a record restored after a unit switch is in the new units', () => {
          truthy(f, 'restored'); eq(f.odometer, Math.round(26300 * 1.609344 * 10) / 10, 'odometer in km'); eq(f.gallons, 37.854, 'liters');
        });
      }
      await req('DELETE', `/api/fuel/${trashedFuelId}`);

      r = await req('GET', `/api/export/csv/fuel/${vid}`);
      check('a metric CSV export names the volume column liters', () => {
        truthy(/^date,odometer,liters,price_per_liter/.test(r.text), `header: ${r.text.split('\n')[0]}`);
      });
      r = await req('GET', `/api/share/build-sheet?vehicle_id=${vid}&format=text&mileage=true`);
      check('the build sheet says kilometers', () => truthy(/kilometers/.test(r.body.content), 'kilometers in build sheet'));

      r = await req('PUT', '/api/settings/units', { currency: 'CDN' });
      check('a made-up currency code is refused', () => eq(r.status, 400, 'status'));

      r = await req('PUT', '/api/settings/units', { distance: 'mi', volume: 'gal', pressure: 'psi', economy: 'mpg', currency: 'USD' });
      check('switching back restores every value to within rounding', () => {
        eq(r.status, 200, 'status');
        const back = snap();
        const near = (a, b, tol, w) => { if (Math.abs(a - b) > tol) throw new Error(`${w}: ${a} vs ${b}`); };
        near(back.mileage, before.mileage, 0.1, 'mileage');
        near(back.gallons, before.gallons, 0.001, 'gallons');
        if (before.ppg != null) near(back.ppg, before.ppg, 0.001, 'price per gallon');
      });
    }

    // --- Importing from Fuelly, Drivvo, and Simply Auto ----------------------
    {
      const Database = require('better-sqlite3');
      const fx = (n) => fs.readFileSync(path.join(__dirname, 'fixtures', 'imports', n));
      const upload = async (vehicleId, name, extra = {}) => {
        const fd = new FormData();
        fd.append('file', new Blob([fx(name)], { type: 'text/csv' }), name);
        fd.append('type', 'fuel'); fd.append('vehicle_id', String(vehicleId));
        for (const [k, v] of Object.entries(extra)) fd.append(k, String(v));
        const res = await fetch(`${base}/api/import/csv`, { method: 'POST', body: fd, headers: { Cookie: cookie } });
        return { status: res.status, body: await res.json() };
      };
      const fresh = async (nickname) => (await req('POST', '/api/user-vehicles', { vehicle_id: refId, nickname, model_year: 2022 })).body.id;
      const rowsOf = (vehicleId, table, order) => {
        const db = new Database(path.join(tmp, 'raptortracker.db'), { readonly: true });
        const rows = db.prepare(`SELECT * FROM ${table} WHERE user_vehicle_id = ? ORDER BY ${order}`).all(vehicleId);
        db.close(); return rows;
      };

      const fuellyVid = await fresh('Fuelly Import');
      r = await upload(fuellyVid, 'fuelly-us.csv');
      check('a Fuelly export is recognized even when "Fuel log" was picked', () => {
        eq(r.status, 200, `status ${JSON.stringify(r.body).slice(0, 200)}`);
        eq(r.body.source, 'fuelly', 'source'); eq(r.body.vehicle, 'Trail Truck', 'busiest vehicle chosen');
        eq(r.body.vehicles.length, 2, 'both vehicles listed'); eq(r.body.units.detected, true, 'units from headers');
        eq(r.body.fuelCount, 5, 'fill-ups for the chosen vehicle'); eq(r.body.committed, false, 'dry run first');
      });
      r = await upload(fuellyVid, 'fuelly-us.csv', { commit: 'true' });
      const fl = rowsOf(fuellyVid, 'fuel_log', 'odometer');
      check('Fuelly fill-ups import with partial and missed flags', () => {
        eq(r.body.inserted, 5, 'inserted');
        eq(fl[0].date, '2024-01-10', 'M/D/YY read month-first');
        const partial = fl.find(f => f.odometer === 12395); eq(partial.full_tank, 0, 'partial fill'); eq(partial.notes, 'top-up before trip', 'notes');
        const missed = fl.find(f => f.odometer === 11895); eq(missed.missed_previous, 1, 'missed fill-up');
        const top = fl.find(f => f.odometer === 12750); eq(top.price_per_gallon, 3.599, 'per-gallon price'); eq(top.total_cost, 89.98, 'total = price x gallons');
      });
      r = await req('GET', `/api/fuel?vehicle_id=${fuellyVid}`);
      check('economy spans partial fills and skips a missed fill-up', () => {
        const byOdo = Object.fromEntries(r.body.entries.map(e => [e.odometer, e.mpg]));
        eq(byOdo[11895], null, 'missed-previous segment has no figure');
        eq(byOdo[12750], Math.round((12750 - 12215) / (12.5 + 25) * 10) / 10, 'distance over all fuel since the last full tank');
        eq(byOdo[12215], Math.round((12215 - 11895) / 23 * 10) / 10, 'plain full-to-full');
      });
      r = await upload(fuellyVid, 'fuelly-us.csv');
      check('importing the same export again finds nothing new', () => { eq(r.body.validCount, 0, 'new rows'); eq(r.body.duplicates.fuel, 5, 'duplicates'); });
      r = await upload(fuellyVid, 'fuelly-us.csv', { source_vehicle: "Wife's Bronco" });
      check('another vehicle in the file can be chosen', () => eq(r.body.fuelCount, 1, 'Bronco fill-ups'));

      const metricVid = await fresh('Fuelly Metric');
      r = await upload(metricVid, 'fuelly-metric.csv', { commit: 'true' });
      const fm = rowsOf(metricVid, 'fuel_log', 'odometer');
      check('a metric Fuelly export is converted to this install\'s miles and gallons', () => {
        eq(r.body.units.from.distance, 'km', 'detected km');
        eq(fm[1].odometer, Math.round(20500 / 1.609344 * 10) / 10, 'odometer in miles');
        eq(fm[1].gallons, Math.round(80 / 3.785411784 * 1000) / 1000, 'volume in gallons');
        eq(fm[1].price_per_gallon, Math.round(1.899 * 3.785411784 * 1000) / 1000, 'price per gallon');
      });

      const drivvoVid = await fresh('Drivvo Import');
      r = await upload(drivvoVid, 'drivvo.csv', { commit: 'true' });
      const df = rowsOf(drivvoVid, 'fuel_log', 'odometer');
      const ds = rowsOf(drivvoVid, 'maintenance_log', 'id');
      check('a Drivvo export imports fill-ups and services, day-first, and skips expenses', () => {
        eq(r.body.source, 'drivvo', 'source'); eq(r.body.dayFirst, true, 'day-first');
        eq(df.length, 3, 'fill-ups'); eq(df[0].date, '2024-03-25', 'date'); eq(df[1].full_tank, 0, '"No" means partial');
        eq(ds.length, 1, 'services'); eq(ds[0].service_type, 'Oil change', 'service'); eq(ds[0].cost, 104.5, 'cost');
        eq(r.body.skipped.expenses, 1, 'expenses skipped');
      });

      const saVid = await fresh('Simply Auto Import');
      r = await upload(saVid, 'simplyauto.csv', { commit: 'true' });
      const sf = rowsOf(saVid, 'fuel_log', 'odometer');
      const ss = rowsOf(saVid, 'maintenance_log', 'id');
      check('a Simply Auto log splits fuel from service by record type', () => {
        eq(r.body.source, 'simplyauto', 'source'); eq(r.body.vehicle, 'Vehicle 1', 'vehicle');
        eq(sf.length, 2, 'fill-ups'); eq(sf[0].date, '2024-06-03', 'date from Day/Month/Year');
        eq(sf[0].price_per_gallon, 3.5, 'price per unit from total / qty');
        eq(ss.length, 1, 'services'); eq(ss[0].service_type, 'Oil Change, Tire Rotation', 'tasks');
        eq(r.body.skipped.expenses, 1, 'expense skipped');
      });
    }

    // --- Air-down card ---------------------------------------------------------
    {
      r = await req('POST', '/api/tires', { user_vehicle_id: vid, name: 'Air Test 37s', tire_size: '37x12.50R17', street_psi_front: 38, street_psi_rear: 40 });
      const setId = r.body.id;
      for (const [terrain, f, rr] of [['rock', 18, 20], ['rock', 16, 18], ['rock', 17, 19], ['sand', 14, 14]]) {
        await req('POST', '/api/outings', { user_vehicle_id: vid, name: `Air ${terrain}`, date: '2024-05-01', terrain, tire_set_id: setId, tire_psi_front: f, tire_psi_rear: rr });
      }
      r = await req('GET', `/api/tires/${setId}/air-down`);
      check('the air-down card groups logged pressures by terrain', () => {
        eq(r.status, 200, 'status');
        eq(r.body.street.front, 38, 'street front'); eq(r.body.street.rear, 40, 'street rear');
        const rock = r.body.byTerrain.find(t => t.terrain === 'rock');
        eq(rock.trips, 3, 'rock trips'); eq(rock.front, 17, 'median front'); eq(rock.rear, 19, 'median rear'); eq(rock.lowestFront, 16, 'lowest');
        eq(r.body.byTerrain[0].terrain, 'rock', 'most-used terrain first');
      });
    }

    // --- Factory fluids reference --------------------------------------------------
    r = await req('GET', `/api/specs/factory?vehicle_id=${vid}`);
    check("the truck's generation has Ford's figures with the manual cited", () => {
      eq(r.status, 200, 'status'); eq(r.body.generation, 'Gen 3', 'generation');
      truthy(/owner_information/.test(r.body.reference.source.url), 'manual link');
      const oil = r.body.reference.groups[0].items.find(i => i.name === 'Engine oil');
      truthy(/6\.0 qt \(5\.7 L\)/.test(oil.value), `oil: ${oil.value}`);
    });

    // --- PDFs -------------------------------------------------------------------
    {
      const pdfOf = async (url) => { const res = await fetch(base + url, { headers: { Cookie: cookie } }); return { status: res.status, type: res.headers.get('content-type'), bytes: Buffer.from(await res.arrayBuffer()) }; };
      let p = await pdfOf(`/api/export/pdf/${vid}`);
      check('the build sheet is a PDF', () => { eq(p.status, 200, 'status'); eq(p.bytes.subarray(0, 5).toString(), '%PDF-', 'magic'); });
      p = await pdfOf(`/api/export/history/${vid}?costs=true&trail=true&receipts=true`);
      check('the vehicle history is a PDF', () => { eq(p.status, 200, 'status'); eq(p.bytes.subarray(0, 5).toString(), '%PDF-', 'magic'); truthy(p.bytes.length > 2000, 'has content'); });
      p = await pdfOf('/api/export/history/999999');
      check('a history for a vehicle that does not exist is a 404', () => eq(p.status, 404, 'status'));
    }

    // --- Sample truck ---------------------------------------------------------
    r = await req('POST', '/api/sample');
    const sampleId = r.body.id;
    check('the sample truck is created with a history', () => {
      eq(r.status, 200, 'status'); truthy(sampleId, 'id');
    });
    r = await req('GET', '/api/user-vehicles');
    check('the sample is flagged and has a believable mileage', () => {
      const v = r.body.find(x => x.id === sampleId);
      eq(v.is_sample, 1, 'is_sample'); eq(v.nickname, 'Sample Raptor', 'nickname');
      truthy(v.current_mileage > 25000 && v.current_mileage < 40000, `mileage ${v.current_mileage}`);
      truthy(v.mod_count >= 6, 'mods');
    });
    r = await req('GET', `/api/fuel?vehicle_id=${sampleId}`);
    check('the sample has a year of fill-ups with an average', () => {
      truthy(r.body.entries.length >= 15, `fill-ups: ${r.body.entries.length}`);
      truthy(r.body.stats.avgMpg > 10 && r.body.stats.avgMpg < 20, `avg ${r.body.stats.avgMpg}`);
    });
    r = await req('GET', `/api/aux-capacity?vehicle_id=${sampleId}`);
    check("the sample's ordered roof bar is flagged as too big for any switch", () => {
      const bar = (r.body.needsHome || []).find(i => /Roof Bar/.test(i.name));
      truthy(bar && bar.tooBig, 'roof bar flagged');
    });
    r = await req('POST', '/api/sample');
    check('asking twice keeps one sample', () => { eq(r.body.id, sampleId, 'same id'); eq(r.body.existing, true, 'existing'); });
    r = await req('DELETE', '/api/sample');
    check('removing the sample sends it to the trash', () => eq(r.body.removed, 1, 'removed'));
    r = await req('GET', '/api/user-vehicles');
    check('the sample is gone from the garage', () => eq(r.body.some(x => x.id === sampleId), false, 'still listed'));

    // --- Update check, against a stand-in for GitHub ----------------------
    {
      const http = require('http');
      let reply = { status: 200, body: { tag_name: 'v99.0.0', html_url: 'https://github.com/breed007/RaptorTracker/releases/tag/v99.0.0', published_at: '2030-01-01T00:00:00Z' } };
      let seenAgent = '';
      const gh = http.createServer((q, s) => {
        seenAgent = q.headers['user-agent'] || '';
        s.writeHead(reply.status, { 'Content-Type': 'application/json' }); s.end(JSON.stringify(reply.body));
      });
      await new Promise(res => gh.listen(0, '127.0.0.1', res));
      process.env.UPDATE_CHECK_URL = `http://127.0.0.1:${gh.address().port}/releases/latest`;

      r = await req('GET', '/api/settings/updates');
      check('before any check, no newer release is claimed', () => {
        eq(r.status, 200, 'status'); eq(r.body.available, false, 'available'); eq(r.body.latest, null, 'latest');
      });
      r = await req('POST', '/api/settings/updates/check');
      check('a newer release on GitHub is reported', () => {
        eq(r.body.latest, '99.0.0', 'latest'); eq(r.body.available, true, 'available');
        truthy(/^RaptorTracker\/\d/.test(seenAgent), `user agent names only the app: ${seenAgent}`);
      });
      reply = { status: 404, body: { message: 'Not Found' } };
      r = await req('POST', '/api/settings/updates/check');
      check('a failed check keeps the last answer and says why', () => {
        eq(r.body.latest, '99.0.0', 'latest kept'); truthy(/no releases/.test(r.body.error || ''), 'error explained');
      });
      r = await req('PUT', '/api/settings/updates', { enabled: false });
      check('the daily check can be turned off', () => eq(r.body.enabled, false, 'enabled'));
      await req('PUT', '/api/settings/updates', { enabled: true });
      gh.close();
      delete process.env.UPDATE_CHECK_URL;
    }

    // --- Off-box backups: folder, WebDAV, and S3 stand-ins -------------------
    {
      const http = require('http');
      r = await req('GET', '/api/backup/offsite');
      check('off-box copies start switched off', () => eq(r.body.target, 'none', 'target'));
      r = await req('PUT', '/api/backup/offsite', { target: 'folder', folder: 'relative/path' });
      check('a relative folder path is refused', () => eq(r.status, 400, 'status'));

      const dest = path.join(tmp, 'offsite-folder');
      r = await req('PUT', '/api/backup/offsite', { target: 'folder', folder: dest, keep: 1 });
      check('a folder destination saves', () => { eq(r.status, 200, 'status'); eq(r.body.folder, dest, 'folder'); });
      r = await req('POST', '/api/backup/offsite/test');
      check('the folder test writes and cleans up', () => {
        eq(r.status, 200, `status ${JSON.stringify(r.body)}`);
        eq(fs.readdirSync(dest).filter(n => n.includes('connection-test')).length, 0, 'test file removed');
      });
      r = await req('POST', '/api/backup/run');
      check('a backup is copied to the folder as soon as it is taken', () => {
        eq(r.body.offsite?.ok, true, `offsite ${JSON.stringify(r.body.offsite)}`);
        truthy(fs.existsSync(path.join(dest, r.body.name)), 'copy present');
      });
      await new Promise(res => setTimeout(res, 1100)); // backup names are stamped to the second
      r = await req('POST', '/api/backup/run');
      check('only the newest copies are kept at the destination', () => {
        eq(fs.readdirSync(dest).filter(n => n.endsWith('.zip')).length, 1, 'copies kept');
      });

      // WebDAV
      const dav = new Map(); let davAuth = '';
      const davServer = http.createServer((q, s2) => {
        davAuth = q.headers.authorization || '';
        const name = decodeURIComponent(q.url.split('/').pop());
        if (q.method === 'PUT') { const chunks = []; q.on('data', c => chunks.push(c)); q.on('end', () => { dav.set(name, Buffer.concat(chunks)); s2.writeHead(201); s2.end(); }); return; }
        if (q.method === 'DELETE') { dav.delete(name); s2.writeHead(204); s2.end(); return; }
        if (q.method === 'PROPFIND') {
          s2.writeHead(207, { 'Content-Type': 'application/xml' });
          s2.end(`<?xml version="1.0"?><d:multistatus xmlns:d="DAV:"><d:response><d:href>/dav/backups/</d:href></d:response>${[...dav.keys()].map(k => `<d:response><d:href>/dav/backups/${encodeURIComponent(k)}</d:href></d:response>`).join('')}</d:multistatus>`);
          return;
        }
        s2.writeHead(405); s2.end();
      });
      await new Promise(res => davServer.listen(0, '127.0.0.1', res));
      r = await req('PUT', '/api/backup/offsite', { target: 'webdav', webdavUrl: `http://127.0.0.1:${davServer.address().port}/dav/backups`, webdavUser: 'owner', webdavPassword: 'dav-secret-value', keep: 2 });
      check('the WebDAV password is never sent back', () => {
        eq(r.body.has_webdavPassword, true, 'has password'); truthy(!JSON.stringify(r.body).includes('dav-secret-value'), 'password hidden');
      });
      r = await req('POST', '/api/backup/offsite/push');
      check('a backup reaches the WebDAV server with credentials', () => {
        eq(r.status, 200, `status ${JSON.stringify(r.body)}`);
        eq(davAuth, 'Basic ' + Buffer.from('owner:dav-secret-value').toString('base64'), 'basic auth');
        const sent = dav.get(r.body.name);
        truthy(sent && sent.length === fs.statSync(path.join(tmp, 'backups', r.body.name)).size, 'whole file arrived');
      });
      r = await req('GET', '/api/backup/settings');
      check('backup settings never include stored secrets', () => truthy(!JSON.stringify(r.body).includes('dav-secret-value'), 'hidden'));
      davServer.close();

      // S3: the stand-in recomputes each signature with the shared secret.
      const { signV4 } = require('../server/services/offsite');
      const bucket = new Map(); const sigProblems = [];
      const s3Server = http.createServer((q, s2) => {
        const u = new URL(q.url, 'http://x');
        const query = Object.fromEntries(u.searchParams);
        const headers = { host: q.headers.host };
        for (const h of ['content-type', 'content-length']) if (q.headers[h] && (q.headers.authorization || '').includes(h)) headers[h] = q.headers[h];
        const amz = q.headers['x-amz-date'];
        const now = new Date(`${amz.slice(0, 4)}-${amz.slice(4, 6)}-${amz.slice(6, 8)}T${amz.slice(9, 11)}:${amz.slice(11, 13)}:${amz.slice(13, 15)}Z`);
        const want = signV4({ method: q.method, pathname: u.pathname, query, headers, region: 'auto', accessKey: 'TESTKEY', secretKey: 's3-secret-value', now }).Authorization;
        if (want !== q.headers.authorization) sigProblems.push(`${q.method} ${q.url}`);
        const key = u.pathname.replace(/^\/rt-backups\/?/, '');
        if (q.method === 'PUT') { const chunks = []; q.on('data', c => chunks.push(c)); q.on('end', () => { bucket.set(key, Buffer.concat(chunks)); s2.writeHead(200); s2.end(); }); return; }
        if (q.method === 'DELETE') { bucket.delete(key); s2.writeHead(204); s2.end(); return; }
        if (q.method === 'GET') {
          const keys = [...bucket.keys()].filter(k => k.startsWith(query.prefix || ''));
          s2.writeHead(200, { 'Content-Type': 'application/xml' });
          s2.end(`<ListBucketResult>${keys.map(k => `<Contents><Key>${k}</Key></Contents>`).join('')}</ListBucketResult>`);
          return;
        }
        s2.writeHead(405); s2.end();
      });
      await new Promise(res => s3Server.listen(0, '127.0.0.1', res));
      r = await req('PUT', '/api/backup/offsite', {
        target: 's3', s3Endpoint: `http://127.0.0.1:${s3Server.address().port}`, s3Region: 'auto', s3Bucket: 'rt-backups',
        s3Prefix: 'nightly', s3AccessKey: 'TESTKEY', s3SecretKey: 's3-secret-value', s3PathStyle: true, keep: 1,
      });
      r = await req('POST', '/api/backup/offsite/test');
      check('the S3 test signs its requests correctly', () => { eq(r.status, 200, `status ${JSON.stringify(r.body)}`); eq(sigProblems.length, 0, `bad signatures: ${sigProblems}`); });
      r = await req('POST', '/api/backup/offsite/push');
      check('a backup lands in the bucket under the prefix', () => {
        eq(r.status, 200, `status ${JSON.stringify(r.body)}`);
        truthy(bucket.has(`nightly/${r.body.name}`), `keys: ${[...bucket.keys()]}`);
        eq(sigProblems.length, 0, `bad signatures: ${sigProblems}`);
      });
      s3Server.close();
      r = await req('POST', '/api/backup/offsite/push');
      check('an unreachable destination is reported, not thrown', () => {
        eq(r.status, 502, 'status'); truthy(r.body.status.last.error, 'error recorded');
      });
      await req('PUT', '/api/backup/offsite', { target: 'none' });
    }

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

    // --- Vehicle transfer carries everything ---------------------------------
    // Fill the tables the old export dropped, then round-trip the vehicle.
    fs.writeFileSync(path.join(process.env.UPLOAD_DIR, 'transfer-photo.jpg'), 'jpeg bytes');
    const tire = (await req('POST', '/api/tires', { user_vehicle_id: vid, name: 'Transfer KO2s', install_date: '2024-02-01', odometer_installed: 24100 })).body;
    await req('POST', '/api/outings', { user_vehicle_id: vid, name: 'Transfer Outing', date: '2024-06-15', tire_set_id: tire.id });
    await req('POST', '/api/warranty', { user_vehicle_id: vid, warranty_name: 'Transfer ESP', provider: 'Ford', start_date: '2024-01-15', term_years: 5 });
    await req('POST', '/api/wishlist', { user_vehicle_id: vid, part_name: 'Transfer Winch', priority: 'High', amp_draw: 30 });
    await req('POST', '/api/mods', {
      user_vehicle_id: vid, part_name: 'Transfer Mod', status: 'Installed', amp_draw: 4.5,
      aux_switches: [{ switch_number: 5, label: 'Rocks' }], photos: ['/uploads/transfer-photo.jpg'],
    });

    const exported = await fetch(`${base}/api/user-vehicles/${vid}/export`, { headers: { Cookie: cookie } });
    check('a vehicle exports', () => eq(exported.status, 200, 'status'));
    const zipBytes = Buffer.from(await exported.arrayBuffer());
    const fd = new FormData();
    fd.append('file', new Blob([zipBytes], { type: 'application/zip' }), 'truck.zip');
    const imported = await fetch(`${base}/api/user-vehicles/import`, { method: 'POST', body: fd, headers: { Cookie: cookie } });
    const imp = await imported.json();
    check('the export imports as a new vehicle', () => {
      eq(imported.status, 201, `status (${JSON.stringify(imp)})`);
      eq(imp.format, 3, 'format');
    });
    const newVid = imp.vehicleId;

    {
      const Database = require('better-sqlite3');
      const db = new Database(path.join(tmp, 'raptortracker.db'), { readonly: true });
      const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all().map(t => t.name)
        .filter(t => !['sent_reminders', 'trash'].includes(t) && db.prepare(`PRAGMA table_info(${t})`).all().some(c => c.name === 'user_vehicle_id'));
      check('every per-vehicle table arrives with the same number of rows', () => {
        const diffs = tables.map(t => {
          const n = (id) => db.prepare(`SELECT COUNT(*) n FROM ${t} WHERE user_vehicle_id = ?`).get(id).n;
          return [t, n(vid), n(newVid)];
        }).filter(([, a, b]) => a !== b);
        if (diffs.length) throw new Error(diffs.map(([t, a, b]) => `${t}: ${a} -> ${b}`).join(', '));
      });
      check("an outing's tire set points at the imported copy, not the original", () => {
        const o = db.prepare("SELECT tire_set_id FROM outings WHERE user_vehicle_id = ? AND name = 'Transfer Outing'").get(newVid);
        const t = db.prepare("SELECT id FROM tire_sets WHERE user_vehicle_id = ? AND name = 'Transfer KO2s'").get(newVid);
        eq(o.tire_set_id, t.id, 'tire_set_id');
      });
      check('AUX assignments, amp draw, and photos survive the trip', () => {
        const m = db.prepare("SELECT * FROM mods WHERE user_vehicle_id = ? AND part_name = 'Transfer Mod'").get(newVid);
        eq(JSON.parse(m.aux_switches)[0].switch_number, 5, 'aux switch');
        eq(m.amp_draw, 4.5, 'amp_draw');
        const photo = JSON.parse(m.photos)[0];
        truthy(photo && photo !== '/uploads/transfer-photo.jpg', 'photo renamed on import');
        eq(fs.readFileSync(path.join(process.env.UPLOAD_DIR, path.basename(photo)), 'utf8'), 'jpeg bytes', 'photo contents');
      });
      check('the imported vehicle has the same mileage', () => {
        const a = db.prepare('SELECT current_mileage FROM user_vehicles WHERE id = ?').get(vid).current_mileage;
        const b = db.prepare('SELECT current_mileage FROM user_vehicles WHERE id = ?').get(newVid).current_mileage;
        eq(b, a, 'current_mileage');
      });
      db.close();
    }

    // --- Trash: delete, undo, and delete for good ---------------------------
    {
      const Database = require('better-sqlite3');
      const ro = () => new Database(path.join(tmp, 'raptortracker.db'), { readonly: true });
      let db = ro();
      const perTable = db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all().map(t => t.name)
        .filter(t => !['sent_reminders', 'trash'].includes(t) && db.prepare(`PRAGMA table_info(${t})`).all().some(c => c.name === 'user_vehicle_id'));
      const counts = (d, id) => perTable.map(t => `${t}=${d.prepare(`SELECT COUNT(*) n FROM ${t} WHERE user_vehicle_id = ?`).get(id).n}`).join(',');
      const before = counts(db, newVid);
      const copyPhoto = path.basename(JSON.parse(db.prepare("SELECT photos FROM mods WHERE user_vehicle_id = ? AND part_name = 'Transfer Mod'").get(newVid).photos)[0]);
      const outing = db.prepare("SELECT id, tire_set_id FROM outings WHERE user_vehicle_id = ? AND name = 'Transfer Outing'").get(newVid);
      db.close();

      r = await req('DELETE', `/api/user-vehicles/${newVid}`);
      const trashId = r.body.trashed?.id;
      check('deleting a vehicle moves it, and everything under it, to the trash', () => {
        eq(r.status, 200, 'status'); truthy(trashId, 'trash id');
        truthy(r.body.trashed.count > 5, `records captured: ${r.body.trashed.count}`);
        truthy(fs.existsSync(path.join(process.env.UPLOAD_DIR, copyPhoto)), 'files kept while in the trash');
      });
      r = await req('GET', '/api/storage');
      check("a trashed vehicle's files aren't offered for cleanup", () => {
        truthy(!r.body.orphans.files.some(f => f.name === copyPhoto), 'trashed photo not an orphan');
      });

      r = await req('POST', `/api/trash/${trashId}/restore`);
      check('restoring brings the vehicle back with every record, under the same id', () => {
        eq(r.status, 200, `status ${JSON.stringify(r.body)}`);
        eq(r.body.restored.id, newVid, 'vehicle id');
        db = ro(); const after = counts(db, newVid); db.close();
        eq(after, before, 'per-table counts');
      });

      // A tire set's outings lose their link on delete (SET NULL) and get it back on restore.
      r = await req('DELETE', `/api/tires/${outing.tire_set_id}`);
      const tireTrash = r.body.trashed?.id;
      db = ro(); const unlinked = db.prepare('SELECT tire_set_id FROM outings WHERE id = ?').get(outing.id).tire_set_id; db.close();
      await req('POST', `/api/trash/${tireTrash}/restore`);
      db = ro(); const relinked = db.prepare('SELECT tire_set_id FROM outings WHERE id = ?').get(outing.id).tire_set_id; db.close();
      check('restoring a tire set re-links the outings that used it', () => {
        eq(unlinked, null, 'unlinked while trashed'); eq(relinked, outing.tire_set_id, 'relinked');
      });

      r = await req('DELETE', `/api/user-vehicles/${newVid}`);
      const again = r.body.trashed?.id;
      r = await req('DELETE', `/api/trash/${again}`);
      check("deleting for good removes the copy's files but leaves the original's", () => {
        eq(r.status, 200, 'status');
        truthy(r.body.filesRemoved >= 1, 'files removed');
        truthy(!fs.existsSync(path.join(process.env.UPLOAD_DIR, copyPhoto)), 'copy photo gone');
        truthy(fs.existsSync(path.join(process.env.UPLOAD_DIR, 'transfer-photo.jpg')), "original vehicle's photo kept");
      });
      r = await req('GET', '/api/trash');
      check('the trash is empty afterwards', () => eq(r.body.items.filter(i => i.id === again).length, 0, 'entry gone'));
      r = await req('POST', `/api/trash/${again}/restore`);
      check('restoring something already gone says so', () => eq(r.status, 409, 'status'));
    }

    r = await req('GET', `/api/aux-capacity?vehicle_id=${vid}`);
    check('a planned part bigger than any switch is flagged, with no switch offered', () => {
      const winch = (r.body.needsHome || []).find(i => i.name === 'Transfer Winch');
      truthy(winch, 'winch listed as needing a switch');
      eq(winch.tooBig, true, 'tooBig');
      eq(winch.fits.length, 0, 'switches offered');
    });
    r = await req('GET', `/api/overview?vehicle_id=${vid}`);
    check('the dashboard calls it out before it arrives', () => {
      truthy((r.body.attention || []).some(a => /Transfer Winch draws more than any AUX switch/.test(a.title)), 'attention item');
    });

    // Mod export/import keeps what the old importer dropped.
    {
      const mz = await fetch(`${base}/api/mods/export/zip?vehicle_id=${vid}`, { headers: { Cookie: cookie } });
      const mfd = new FormData();
      mfd.append('file', new Blob([Buffer.from(await mz.arrayBuffer())], { type: 'application/zip' }), 'mods.zip');
      const mi = await fetch(`${base}/api/mods/import?vehicle_id=${vid}`, { method: 'POST', body: mfd, headers: { Cookie: cookie } });
      check('mods re-import', () => eq(mi.status, 200, 'status'));
      const copies = (await req('GET', `/api/mods?vehicle_id=${vid}`)).body.filter(m => m.part_name === 'Transfer Mod');
      check('a re-imported mod keeps amp draw, AUX switches, and its own copy of the photo', () => {
        eq(copies.length, 2, 'original + copy');
        const copy = copies.find(m => m.photos[0] !== '/uploads/transfer-photo.jpg');
        truthy(copy, 'copy has its own photo file');
        eq(copy.amp_draw, 4.5, 'amp_draw');
        eq(copy.aux_switches[0].switch_number, 5, 'aux switch');
      });
    }

    // Exports made by earlier versions still import.
    {
      const archiver = require('archiver');
      const { PassThrough } = require('stream');
      const legacy = {
        version: 2,
        vehicle: { nickname: 'Legacy Export', model_year: 2019, vehicle_ref: { make: 'Ford', model: 'F-150 Raptor', generation: 'Gen 2' } },
        mods: [{ part_name: 'Legacy Bumper', category: 'Bumpers', status: 'Installed' }],
        maintenance: [{ service_type: 'Oil Change', date_performed: '2023-01-01', mileage: 12000 }],
      };
      const chunks = [];
      const sink = new PassThrough(); sink.on('data', c => chunks.push(c));
      const done = new Promise(resolve => sink.on('end', resolve));
      const zip = archiver('zip'); zip.pipe(sink);
      zip.append(JSON.stringify(legacy), { name: 'vehicle.json' });
      await zip.finalize(); await done;
      const lfd = new FormData();
      lfd.append('file', new Blob([Buffer.concat(chunks)], { type: 'application/zip' }), 'legacy.zip');
      const lr = await fetch(`${base}/api/user-vehicles/import`, { method: 'POST', body: lfd, headers: { Cookie: cookie } });
      const lb = await lr.json();
      check('an export from an earlier version still imports', () => {
        eq(lr.status, 201, `status (${JSON.stringify(lb)})`);
        truthy(lb.vehicleId || lb.vehicle_id || lb.id, 'new vehicle id');
      });
      const legacyId = lb.vehicleId || lb.vehicle_id || lb.id;
      if (legacyId) await req('DELETE', `/api/user-vehicles/${legacyId}`);
    }

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
