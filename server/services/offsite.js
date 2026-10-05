/**
 * Off-box backup copies.
 *
 * Nightly backups land in data/backups/, on the same disk as the database, so
 * one dead SD card or drive loses both. After each backup is written, this
 * sends a copy somewhere else and keeps the newest N there:
 *
 *   folder  a mounted NAS share or USB drive (any absolute path)
 *   webdav  Nextcloud, ownCloud, Synology, or any WebDAV server
 *   s3      AWS S3 or a compatible store: Backblaze B2, Cloudflare R2,
 *           Wasabi, MinIO. Requests are signed with AWS Signature V4.
 *
 * No SDKs: each target is a handful of HTTP calls. Passwords and secret keys
 * are stored under secret_ settings, which never leave the server.
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { Readable } = require('stream');
const { getSetting, setSetting } = require('./settings');

const TARGETS = ['none', 'folder', 'webdav', 's3'];
const PREFIX = 'raptortracker-backup-';
const UPLOAD_TIMEOUT_MS = 60 * 60 * 1000;
const CALL_TIMEOUT_MS = 30 * 1000;

const FIELDS = {
  target: 'offsite_target',
  keep: 'offsite_keep',
  folder: 'offsite_folder',
  webdavUrl: 'offsite_webdav_url',
  webdavUser: 'offsite_webdav_user',
  webdavPassword: 'secret_offsite_webdav_password',
  s3Endpoint: 'offsite_s3_endpoint',
  s3Region: 'offsite_s3_region',
  s3Bucket: 'offsite_s3_bucket',
  s3Prefix: 'offsite_s3_prefix',
  s3AccessKey: 'offsite_s3_access_key',
  s3SecretKey: 'secret_offsite_s3_secret_key',
  s3PathStyle: 'offsite_s3_path_style',
};
const SECRET_FIELDS = ['webdavPassword', 's3SecretKey'];

function config() {
  const c = {};
  for (const [k, key] of Object.entries(FIELDS)) c[k] = getSetting(key) || '';
  c.target = TARGETS.includes(c.target) ? c.target : 'none';
  c.keep = Math.min(365, Math.max(1, parseInt(c.keep, 10) || 14));
  c.s3PathStyle = c.s3PathStyle !== 'false';
  return c;
}

/** Settings as the browser may see them: secrets reduced to "is one set?". */
function publicConfig() {
  const c = config();
  const out = { ...c };
  for (const k of SECRET_FIELDS) { out[`has_${k}`] = Boolean(c[k]); delete out[k]; }
  out.last = {
    at: getSetting('offsite_last_at') || null,
    name: getSetting('offsite_last_name') || null,
    error: getSetting('offsite_last_error') || null,
  };
  return out;
}

class OffsiteError extends Error {}

/** Validate and save. Secrets left blank keep their stored value. */
function saveConfig(input) {
  const c = { ...config(), ...input };
  if (!TARGETS.includes(c.target)) throw new OffsiteError(`target must be one of ${TARGETS.join(', ')}`);
  if (c.target === 'folder') {
    if (!path.isAbsolute(c.folder || '')) throw new OffsiteError('Use an absolute folder path, such as /mnt/nas/raptortracker.');
  }
  if (c.target === 'webdav' && !/^https?:\/\//i.test(c.webdavUrl || '')) throw new OffsiteError('The WebDAV URL must start with https:// or http://.');
  if (c.target === 's3') {
    if (!/^https?:\/\//i.test(c.s3Endpoint || '')) throw new OffsiteError('The S3 endpoint must be a URL, such as https://s3.us-east-1.amazonaws.com.');
    if (!/^[a-z0-9][a-z0-9.-]{1,61}[a-z0-9]$/.test(c.s3Bucket || '')) throw new OffsiteError('That bucket name is not valid.');
    if (!c.s3AccessKey) throw new OffsiteError('An access key ID is required.');
  }
  for (const [k, key] of Object.entries(FIELDS)) {
    if (input[k] === undefined) continue;
    if (SECRET_FIELDS.includes(k) && input[k] === '') continue; // blank = keep
    const v = k === 's3PathStyle' ? (input[k] ? 'true' : 'false') : k === 'keep' ? String(c.keep) : String(input[k]).trim();
    setSetting(key, v);
  }
  return publicConfig();
}

// ── folder ───────────────────────────────────────────────────────────────────

const folder = {
  async put(c, localPath, name) {
    fs.mkdirSync(c.folder, { recursive: true });
    const tmp = path.join(c.folder, `.${name}.partial`);
    await fs.promises.copyFile(localPath, tmp);
    await fs.promises.rename(tmp, path.join(c.folder, name));
  },
  async list(c) {
    if (!fs.existsSync(c.folder)) return [];
    return fs.readdirSync(c.folder).filter(n => n.startsWith(PREFIX) && n.endsWith('.zip'));
  },
  async remove(c, name) { await fs.promises.unlink(path.join(c.folder, name)); },
  async putSmall(c, name, text) { fs.mkdirSync(c.folder, { recursive: true }); fs.writeFileSync(path.join(c.folder, name), text); },
};

// ── WebDAV ───────────────────────────────────────────────────────────────────

const davUrl = (c, name = '') => c.webdavUrl.replace(/\/+$/, '') + '/' + encodeURIComponent(name);
const davAuth = (c) => (c.webdavUser ? { Authorization: 'Basic ' + Buffer.from(`${c.webdavUser}:${c.webdavPassword}`).toString('base64') } : {});

async function check(res, what) {
  if (res.ok) return res;
  const body = await res.text().catch(() => '');
  const hint = res.status === 401 || res.status === 403 ? ' (check the credentials and permissions)' : '';
  throw new OffsiteError(`${what} failed: HTTP ${res.status}${hint}${body ? ` — ${body.replace(/\s+/g, ' ').slice(0, 160)}` : ''}`);
}

const fileBody = (localPath) => Readable.toWeb(fs.createReadStream(localPath));

const webdav = {
  async put(c, localPath, name) {
    const size = fs.statSync(localPath).size;
    await check(await fetch(davUrl(c, name), {
      method: 'PUT', headers: { ...davAuth(c), 'Content-Type': 'application/zip', 'Content-Length': String(size) },
      body: fileBody(localPath), duplex: 'half', signal: AbortSignal.timeout(UPLOAD_TIMEOUT_MS),
    }), 'Upload');
  },
  async list(c) {
    const res = await check(await fetch(davUrl(c), {
      method: 'PROPFIND', headers: { ...davAuth(c), Depth: '1' }, signal: AbortSignal.timeout(CALL_TIMEOUT_MS),
    }), 'Listing the folder');
    const xml = await res.text();
    return [...xml.matchAll(/<(?:[a-z0-9]+:)?href>([^<]+)<\/(?:[a-z0-9]+:)?href>/gi)]
      .map(m => decodeURIComponent(m[1].replace(/\/+$/, '').split('/').pop()))
      .filter(n => n.startsWith(PREFIX) && n.endsWith('.zip'));
  },
  async remove(c, name) {
    await check(await fetch(davUrl(c, name), { method: 'DELETE', headers: davAuth(c), signal: AbortSignal.timeout(CALL_TIMEOUT_MS) }), 'Delete');
  },
  async putSmall(c, name, text) {
    await check(await fetch(davUrl(c, name), { method: 'PUT', headers: { ...davAuth(c), 'Content-Type': 'text/plain' }, body: text, signal: AbortSignal.timeout(CALL_TIMEOUT_MS) }), 'Upload');
  },
};

// ── S3 (Signature V4) ────────────────────────────────────────────────────────

const sha256 = (data) => crypto.createHash('sha256').update(data).digest('hex');
const hmac = (key, data) => crypto.createHmac('sha256', key).update(data).digest();
// RFC 3986 encoding, as SigV4 requires (encodeURIComponent leaves !'()* alone).
const rfc3986 = (s) => encodeURIComponent(s).replace(/[!'()*]/g, ch => '%' + ch.charCodeAt(0).toString(16).toUpperCase());

/**
 * Sign a request with AWS Signature Version 4. `headers` must include host;
 * returns them with x-amz-date, x-amz-content-sha256, and Authorization added.
 */
function signV4({ method, pathname, query = {}, headers, region, accessKey, secretKey, payloadHash = 'UNSIGNED-PAYLOAD', now = new Date(), service = 's3' }) {
  const amzDate = now.toISOString().replace(/[:-]|\.\d{3}/g, '');
  const day = amzDate.slice(0, 8);
  const all = { ...headers, 'x-amz-date': amzDate, 'x-amz-content-sha256': payloadHash };
  const lower = Object.fromEntries(Object.entries(all).map(([k, v]) => [k.toLowerCase(), String(v).trim().replace(/\s+/g, ' ')]));
  const names = Object.keys(lower).sort();
  const canonicalHeaders = names.map(n => `${n}:${lower[n]}\n`).join('');
  const signedHeaders = names.join(';');
  const canonicalQuery = Object.keys(query).sort().map(k => `${rfc3986(k)}=${rfc3986(query[k])}`).join('&');
  const canonicalUri = pathname.split('/').map(seg => rfc3986(decodeURIComponent(seg))).join('/');
  const canonicalRequest = [method, canonicalUri, canonicalQuery, canonicalHeaders, signedHeaders, payloadHash].join('\n');
  const scope = `${day}/${region}/${service}/aws4_request`;
  const stringToSign = ['AWS4-HMAC-SHA256', amzDate, scope, sha256(canonicalRequest)].join('\n');
  const kSigning = hmac(hmac(hmac(hmac(`AWS4${secretKey}`, day), region), service), 'aws4_request');
  const signature = crypto.createHmac('sha256', kSigning).update(stringToSign).digest('hex');
  return {
    ...all,
    Authorization: `AWS4-HMAC-SHA256 Credential=${accessKey}/${scope}, SignedHeaders=${signedHeaders}, Signature=${signature}`,
  };
}

function s3Location(c, key = '') {
  const endpoint = new URL(c.s3Endpoint);
  const objectPath = key ? '/' + key.split('/').map(rfc3986).join('/') : '/';
  if (c.s3PathStyle) {
    return { origin: endpoint.origin, host: endpoint.host, pathname: `/${c.s3Bucket}${objectPath === '/' ? '' : objectPath}` || '/' };
  }
  const host = `${c.s3Bucket}.${endpoint.host}`;
  return { origin: `${endpoint.protocol}//${host}`, host, pathname: objectPath };
}

async function s3Call(c, method, key, { query = {}, body, headers = {}, timeout = CALL_TIMEOUT_MS } = {}) {
  const loc = s3Location(c, key);
  const signed = signV4({
    method, pathname: loc.pathname || '/', query, headers: { host: loc.host, ...headers },
    region: c.s3Region || 'us-east-1', accessKey: c.s3AccessKey, secretKey: c.s3SecretKey,
  });
  delete signed.host; // fetch sets Host itself
  const qs = Object.keys(query).length ? '?' + Object.keys(query).sort().map(k => `${rfc3986(k)}=${rfc3986(query[k])}`).join('&') : '';
  return fetch(loc.origin + (loc.pathname || '/') + qs, {
    method, headers: signed, body, duplex: body ? 'half' : undefined, signal: AbortSignal.timeout(timeout),
  });
}

const s3Key = (c, name) => `${(c.s3Prefix || '').replace(/^\/+|\/+$/g, '')}${c.s3Prefix ? '/' : ''}${name}`;

const s3 = {
  async put(c, localPath, name) {
    const size = fs.statSync(localPath).size;
    await check(await s3Call(c, 'PUT', s3Key(c, name), {
      body: fileBody(localPath), headers: { 'content-type': 'application/zip', 'content-length': String(size) }, timeout: UPLOAD_TIMEOUT_MS,
    }), 'Upload');
  },
  async list(c) {
    const prefix = s3Key(c, PREFIX);
    const res = await check(await s3Call(c, 'GET', '', { query: { 'list-type': '2', prefix } }), 'Listing the bucket');
    const xml = await res.text();
    return [...xml.matchAll(/<Key>([^<]+)<\/Key>/g)].map(m => m[1].split('/').pop()).filter(n => n.endsWith('.zip'));
  },
  async remove(c, name) { await check(await s3Call(c, 'DELETE', s3Key(c, name)), 'Delete'); },
  async putSmall(c, name, text) {
    await check(await s3Call(c, 'PUT', s3Key(c, name), { body: text, headers: { 'content-type': 'text/plain', 'content-length': String(Buffer.byteLength(text)) } }), 'Upload');
  },
};

const DRIVERS = { folder, webdav, s3 };

function driver(c) {
  const d = DRIVERS[c.target];
  if (!d) throw new OffsiteError('No off-box destination is set up.');
  return d;
}

/** Send one local backup file, then keep only the newest `keep` copies there. */
async function pushBackup(localPath) {
  const c = config();
  if (c.target === 'none') return { skipped: true };
  const name = path.basename(localPath);
  try {
    const d = driver(c);
    await d.put(c, localPath, name);
    let pruned = 0;
    const names = (await d.list(c)).sort().reverse(); // names carry an ISO timestamp
    for (const old of names.slice(c.keep)) {
      try { await d.remove(c, old); pruned++; } catch (_) { /* try again next night */ }
    }
    setSetting('offsite_last_at', new Date().toISOString());
    setSetting('offsite_last_name', name);
    setSetting('offsite_last_error', '');
    return { ok: true, name, pruned };
  } catch (err) {
    const message = err.name === 'TimeoutError' ? 'the destination did not answer in time' : err.message;
    setSetting('offsite_last_at', new Date().toISOString());
    setSetting('offsite_last_error', message);
    return { ok: false, error: message };
  }
}

/** Write and delete a small file to prove the settings work. */
async function testConnection() {
  const c = config();
  const d = driver(c);
  const name = `raptortracker-connection-test-${Date.now()}.txt`;
  await d.putSmall(c, name, 'RaptorTracker can write here. This file is deleted right after the test.\n');
  await d.remove(c, name);
  const existing = await d.list(c);
  return { ok: true, existing: existing.length };
}

module.exports = { TARGETS, config, publicConfig, saveConfig, pushBackup, testConnection, signV4, OffsiteError };
