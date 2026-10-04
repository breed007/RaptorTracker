/**
 * Reading uploaded ZIP archives (backups, vehicle and mod transfers).
 *
 * Replaces adm-zip, which loads the entire archive into memory — a 1 GB
 * backup needs well over 1 GB of RAM to restore, which a Raspberry Pi does
 * not have — and has open advisories for decompression bombs. yauzl streams
 * one entry at a time, rejects absolute paths and `..` segments, and checks
 * every entry's real decompressed size against the size it declares.
 *
 * On top of that this enforces our own ceilings, counted from the bytes that
 * actually come out of the decompressor rather than what the archive claims:
 * a per-entry limit and a total limit across the archive.
 */
const fs = require('fs');
const { pipeline, Transform } = require('stream');
const yauzl = require('yauzl');

const MB = 1024 * 1024;
const DEFAULTS = {
  maxEntries: 20000,
  maxEntryBytes: 512 * MB,     // largest single file we will inflate
  maxTotalBytes: 4096 * MB,    // everything in the archive combined
};

class ZipLimitError extends Error {}

function openZip(filePath, options = {}) {
  const limits = { ...DEFAULTS, ...options };
  return new Promise((resolve, reject) => {
    yauzl.open(filePath, { lazyEntries: true, autoClose: false, strictFileNames: true }, (err, zip) => {
      if (err) return reject(err);
      const entries = [];
      zip.on('error', reject);
      zip.on('entry', (entry) => {
        if (entries.length >= limits.maxEntries) {
          zip.close();
          return reject(new ZipLimitError(`Archive has more than ${limits.maxEntries} entries`));
        }
        entries.push(entry);
        zip.readEntry();
      });
      zip.on('end', () => resolve(new ZipArchive(zip, entries, limits)));
      zip.readEntry();
    });
  });
}

class ZipArchive {
  constructor(zip, entries, limits) {
    this.zip = zip;
    this.limits = limits;
    this.inflated = 0;
    // Directories carry no content, and symlink entries are never followed —
    // we only ever copy bytes into files whose names we choose.
    this.entries = entries.filter(e => !/\/$/.test(e.fileName) && !isSymlink(e));
  }

  names() { return this.entries.map(e => e.fileName); }

  find(predicate) {
    return this.entries.find(e => (typeof predicate === 'function' ? predicate(e.fileName) : e.fileName === predicate));
  }

  filter(predicate) { return this.entries.filter(e => predicate(e.fileName)); }

  /** A guard stream that counts real bytes and stops at the configured ceilings. */
  _meter(entry, maxBytes) {
    let seen = 0;
    const self = this;
    return new Transform({
      transform(chunk, _enc, cb) {
        seen += chunk.length;
        self.inflated += chunk.length;
        if (seen > maxBytes) return cb(new ZipLimitError(`${entry.fileName} is larger than ${Math.round(maxBytes / MB)} MB`));
        if (self.inflated > self.limits.maxTotalBytes) {
          return cb(new ZipLimitError(`Archive expands past ${Math.round(self.limits.maxTotalBytes / MB)} MB`));
        }
        cb(null, chunk);
      },
    });
  }

  _open(entry) {
    return new Promise((resolve, reject) => {
      this.zip.openReadStream(entry, (err, stream) => (err ? reject(err) : resolve(stream)));
    });
  }

  /** Read a small entry (JSON, an image) into memory. */
  async read(entry, maxBytes = this.limits.maxEntryBytes) {
    const source = await this._open(entry);
    const chunks = [];
    await new Promise((resolve, reject) => {
      const meter = this._meter(entry, maxBytes);
      meter.on('data', c => chunks.push(c));
      pipeline(source, meter, err => (err ? reject(err) : resolve()));
    });
    return Buffer.concat(chunks);
  }

  /** Stream a (possibly large) entry to disk without buffering it. */
  async extractTo(entry, destPath, maxBytes = this.limits.maxEntryBytes) {
    const source = await this._open(entry);
    await new Promise((resolve, reject) => {
      pipeline(source, this._meter(entry, maxBytes), fs.createWriteStream(destPath), err => {
        if (err) { fs.rm(destPath, { force: true }, () => reject(err)); } else resolve();
      });
    });
  }

  close() { try { this.zip.close(); } catch (_) { /* already closed */ } }
}

// Unix mode lives in the high 16 bits of externalFileAttributes; 0o120000 is a symlink.
function isSymlink(entry) {
  const mode = (entry.externalFileAttributes >>> 16) & 0o170000;
  return mode === 0o120000;
}

module.exports = { openZip, ZipLimitError };
