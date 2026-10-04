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

module.exports = { UPLOAD_EXTS, isAllowedUpload, serveUploads };
