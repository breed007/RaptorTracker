#!/usr/bin/env node
// Retake the README and landing-page screenshots from the sample truck, so
// they never show anyone's real records. Run: npm run screenshots
// (needs `npx playwright install chromium` once).
const { spawn } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { chromium } = require('@playwright/test');

const ROOT = path.join(__dirname, '..');
const OUT = path.join(ROOT, 'docs', 'screenshots');
const PORT = 3620;
const BASE = `http://127.0.0.1:${PORT}`;
const data = fs.mkdtempSync(path.join(os.tmpdir(), 'raptortracker-shots-'));

const SHOTS = [
  { file: 'dashboard.png', path: '/' },
  { file: 'aux-panel.png', path: '/aux' },
  { file: 'fuel-log.png', path: '/fuel' },
  { file: 'maintenance.png', path: '/maintenance' },
  { file: 'reports.png', path: '/reports' },
];

(async () => {
  const server = spawn(process.execPath, ['server.js'], {
    cwd: ROOT, stdio: 'ignore',
    env: { ...process.env, PORT: String(PORT), DATA_DIR: data, UPLOAD_DIR: path.join(data, 'uploads'), NODE_ENV: 'test',
      ADMIN_USERNAME: 'owner', ADMIN_PASSWORD: 'screenshots-password', SESSION_SECRET: 'screenshots-'.padEnd(48, 'x'), UPDATE_CHECK: 'false' },
  });
  try {
    let up = false;
    for (let i = 0; i < 120 && !up; i++) {
      try { up = (await fetch(`${BASE}/api/health`)).ok; } catch (_) { /* not listening yet */ }
      if (!up) await new Promise(r => setTimeout(r, 250));
    }
    if (!up) throw new Error(`the server did not answer on ${BASE} within 30 seconds`);
    const browser = await chromium.launch();
    const page = await browser.newPage({ viewport: { width: 1280, height: 820 }, deviceScaleFactor: 1.5, colorScheme: 'light' });
    await page.goto(BASE);
    await page.getByLabel('Username').fill('owner');
    await page.getByLabel('Password').fill('screenshots-password');
    await page.getByRole('button', { name: 'Sign In' }).click();
    await page.getByRole('button', { name: 'Look around with a sample truck' }).click();
    await page.getByRole('heading', { name: 'Sample Raptor' }).waitFor();
    // The sample banner explains itself in the app; in a screenshot it's noise.
    await page.addStyleTag({ content: '*,*::before,*::after{transition:none!important;animation:none!important}' });
    for (const s of SHOTS) {
      await page.goto(BASE + s.path);
      await page.waitForLoadState('networkidle');
      await page.evaluate(() => document.querySelectorAll('main .border-l-raptor-accent').forEach(el => { if (/sample truck/i.test(el.textContent)) el.remove() }));
      await page.waitForTimeout(600); // charts finish drawing
      await page.screenshot({ path: path.join(OUT, s.file) });
      console.log('saved', s.file);
    }
    await browser.close();
  } finally {
    server.kill();
    fs.rmSync(data, { recursive: true, force: true });
  }
})().catch(e => { console.error(e); process.exit(1); });
