/**
 * Persistent sessions in SQLite, so a restart or an upgrade doesn't sign
 * everyone out (express-session's default MemoryStore also leaks memory and
 * warns in production).
 *
 * Deliberately a separate file from raptortracker.db: backups copy the main
 * database, and a backup ZIP should not carry live session tokens that would
 * let whoever holds it sign in. It also means restoring a backup doesn't drop
 * the session of the person doing the restore.
 */
const path = require('path');
const fs = require('fs');
const Database = require('better-sqlite3');
const session = require('express-session');

const PRUNE_EVERY_MS = 60 * 60 * 1000;

class SqliteSessionStore extends session.Store {
  constructor({ dataDir, defaultTtlMs = 7 * 24 * 60 * 60 * 1000 } = {}) {
    super();
    fs.mkdirSync(dataDir, { recursive: true });
    this.db = new Database(path.join(dataDir, 'sessions.db'));
    this.db.pragma('journal_mode = WAL');
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS sessions (
        sid     TEXT PRIMARY KEY,
        sess    TEXT NOT NULL,
        expires INTEGER NOT NULL
      );
      CREATE INDEX IF NOT EXISTS sessions_expires ON sessions(expires);
    `);
    this.defaultTtlMs = defaultTtlMs;
    this.stmt = {
      get: this.db.prepare('SELECT sess FROM sessions WHERE sid = ? AND expires > ?'),
      set: this.db.prepare(`INSERT INTO sessions (sid, sess, expires) VALUES (?, ?, ?)
                            ON CONFLICT(sid) DO UPDATE SET sess = excluded.sess, expires = excluded.expires`),
      touch: this.db.prepare('UPDATE sessions SET expires = ? WHERE sid = ?'),
      destroy: this.db.prepare('DELETE FROM sessions WHERE sid = ?'),
      prune: this.db.prepare('DELETE FROM sessions WHERE expires <= ?'),
      clear: this.db.prepare('DELETE FROM sessions'),
      length: this.db.prepare('SELECT COUNT(*) AS n FROM sessions WHERE expires > ?'),
      others: this.db.prepare('DELETE FROM sessions WHERE sid <> ?'),
    };
    this.prune();
    this.timer = setInterval(() => this.prune(), PRUNE_EVERY_MS);
    this.timer.unref();
  }

  expiryOf(sess) {
    const exp = sess && sess.cookie && sess.cookie.expires;
    return exp ? new Date(exp).getTime() : Date.now() + this.defaultTtlMs;
  }

  get(sid, cb) {
    try {
      const row = this.stmt.get.get(sid, Date.now());
      cb(null, row ? JSON.parse(row.sess) : null);
    } catch (e) { cb(e); }
  }

  set(sid, sess, cb = () => {}) {
    try { this.stmt.set.run(sid, JSON.stringify(sess), this.expiryOf(sess)); cb(null); } catch (e) { cb(e); }
  }

  touch(sid, sess, cb = () => {}) {
    try { this.stmt.touch.run(this.expiryOf(sess), sid); cb(null); } catch (e) { cb(e); }
  }

  destroy(sid, cb = () => {}) {
    try { this.stmt.destroy.run(sid); cb(null); } catch (e) { cb(e); }
  }

  clear(cb = () => {}) {
    try { this.stmt.clear.run(); cb(null); } catch (e) { cb(e); }
  }

  length(cb) {
    try { cb(null, this.stmt.length.get(Date.now()).n); } catch (e) { cb(e); }
  }

  /** Sign out everywhere except the given session (used after a password change). */
  destroyAllExcept(sid) {
    this.stmt.others.run(sid);
  }

  prune() {
    try { this.stmt.prune.run(Date.now()); } catch (_) { /* best effort */ }
  }

  close() {
    clearInterval(this.timer);
    try { this.db.close(); } catch (_) { /* already closed */ }
  }
}

module.exports = { SqliteSessionStore };
