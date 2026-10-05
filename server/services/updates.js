/**
 * "Is there a newer release?" — a once-a-day question to GitHub's public API.
 *
 * Self-hosted installs otherwise sit on whatever version they were installed
 * with. The request carries only a User-Agent naming the RaptorTracker
 * version (GitHub's API requires a User-Agent); nothing about the owner or
 * their trucks is sent. GitHub sees the server's IP address, as with any
 * request. Owners can turn it off in Settings, or for the whole install with
 * UPDATE_CHECK=false.
 */
const { getSetting, setSetting } = require('./settings');

const APP_VERSION = require('../../package.json').version;
const REPO = 'breed007/RaptorTracker';
const DEFAULT_URL = `https://api.github.com/repos/${REPO}/releases/latest`;
const DAY_MS = 24 * 60 * 60 * 1000;

const envDisabled = () => String(process.env.UPDATE_CHECK || '').toLowerCase() === 'false';
const enabled = () => !envDisabled() && getSetting('update_check') !== 'false';

/** How this copy was installed, so the UI can show the right upgrade steps. */
const installKind = () => (process.env.RT_INSTALL === 'docker' ? 'docker' : 'source');

/**
 * Compare two versions like "1.2.3" or "v1.2.3-beta.1". A prerelease sorts
 * before the release it leads up to. Returns -1, 0, or 1.
 */
function compareVersions(a, b) {
  const parse = (v) => {
    const [core, pre] = String(v || '').trim().replace(/^v/i, '').split('-', 2);
    const nums = core.split('.').map(n => parseInt(n, 10) || 0);
    while (nums.length < 3) nums.push(0);
    return { nums, pre: pre || null };
  };
  const x = parse(a); const y = parse(b);
  for (let i = 0; i < 3; i++) {
    if (x.nums[i] !== y.nums[i]) return x.nums[i] < y.nums[i] ? -1 : 1;
  }
  if (x.pre === y.pre) return 0;
  if (!x.pre) return 1;
  if (!y.pre) return -1;
  return x.pre < y.pre ? -1 : 1;
}

function status() {
  const latest = getSetting('update_latest');
  return {
    current: APP_VERSION,
    latest: latest || null,
    available: Boolean(latest) && compareVersions(latest, APP_VERSION) > 0,
    url: getSetting('update_url') || `https://github.com/${REPO}/releases`,
    publishedAt: getSetting('update_published_at') || null,
    checkedAt: getSetting('update_checked_at') || null,
    error: getSetting('update_error') || null,
    enabled: enabled(),
    envDisabled: envDisabled(),
    install: installKind(),
  };
}

/** Ask GitHub for the latest release. `force` runs even when checks are off (a "Check now" click). */
async function checkForUpdate({ force = false, fetchImpl = fetch } = {}) {
  if (envDisabled() || (!force && !enabled())) return status();
  const url = process.env.UPDATE_CHECK_URL || DEFAULT_URL;
  try {
    const res = await fetchImpl(url, {
      headers: { 'User-Agent': `RaptorTracker/${APP_VERSION}`, Accept: 'application/vnd.github+json' },
      signal: AbortSignal.timeout(10000),
    });
    if (res.status === 404) throw new Error('no releases published yet');
    if (!res.ok) throw new Error(`GitHub answered ${res.status}`);
    const body = await res.json();
    if (!body || typeof body.tag_name !== 'string') throw new Error('unexpected response');
    setSetting('update_latest', body.tag_name.replace(/^v/i, ''));
    setSetting('update_url', typeof body.html_url === 'string' && body.html_url.startsWith('https://github.com/') ? body.html_url : '');
    setSetting('update_published_at', typeof body.published_at === 'string' ? body.published_at : '');
    setSetting('update_error', '');
  } catch (err) {
    setSetting('update_error', err.name === 'TimeoutError' ? 'GitHub did not answer in time' : err.message);
  }
  setSetting('update_checked_at', new Date().toISOString());
  return status();
}

/** The scheduler's daily call: skip if a check ran in the last day. */
async function checkIfDue() {
  if (!enabled()) return null;
  const last = Date.parse(getSetting('update_checked_at') || '');
  if (Number.isFinite(last) && Date.now() - last < DAY_MS) return null;
  return checkForUpdate();
}

module.exports = { APP_VERSION, REPO, compareVersions, status, checkForUpdate, checkIfDue, enabled };
