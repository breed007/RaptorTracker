/**
 * What may live in, and be served from, the uploads folder.
 *
 * Direct uploads already check extensions, but imports (backup restore,
 * vehicle and mod transfers) take names from an archive someone else may have
 * built. An .svg or .html "photo" served from this origin can run script in
 * the app, so imports skip anything not on this list, and the static handler
 * refuses to serve it even if an older version let one through.
 */
const path = require('path');
const fs = require('fs');
const express = require('express');

const UPLOAD_EXTS = new Set(['.jpg', '.jpeg', '.png', '.webp', '.gif', '.tif', '.tiff', '.heic', '.pdf']);

const isAllowedUpload = (name) => UPLOAD_EXTS.has(path.extname(String(name)).toLowerCase());

/** Static file handler for /uploads. Mount it behind requireAuth. */
function serveUploads(uploadDir) {
  const statics = express.static(uploadDir, {
    index: false,
    dotfiles: 'deny',
    setHeaders(res) {
      res.setHeader('X-Content-Type-Options', 'nosniff');
      // These are private documents (registration, insurance), not shared assets.
      res.setHeader('Cache-Control', 'private, max-age=3600');
    },
  });
  return (req, res, next) => {
    if (!isAllowedUpload(req.path)) return res.status(404).end();
    statics(req, res, next);
  };
}

/**
 * Detach one file from a record's list and delete it — but only if the record
 * actually lists it. The name comes from the URL, so it is reduced to a bare
 * file name first: Express decodes %2F, and '..%2Fraptortracker.db' would
 * otherwise reach out of the uploads folder and delete the database.
 * Returns the remaining list, or null when the record doesn't own the file.
 */
function detachUpload(uploadDir, list, requestedName) {
  const base = path.basename(String(requestedName || ''));
  if (!base || base.startsWith('.')) return null;
  const url = `/uploads/${base}`;
  if (!list.includes(url)) return null;
  fs.unlink(path.join(uploadDir, base), () => {});
  return list.filter(p => p !== url);
}

// Photos, PDFs, and office files are already compressed; deflating them again
// costs a Raspberry Pi minutes of CPU per backup for no size gain.
const PRECOMPRESSED = /\.(jpe?g|png|webp|heic|heif|gif|pdf|zip|docx|xlsx|mp4|mov)$/i;
const storeInZip = (name) => PRECOMPRESSED.test(String(name));

module.exports = {
  storeInZip, UPLOAD_EXTS, isAllowedUpload, serveUploads, detachUpload };
