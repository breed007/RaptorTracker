/**
 * Baseline security headers, written out rather than pulled in from a
 * dependency so every directive here is one we chose and can explain.
 *
 * The Content-Security-Policy matches what the client actually loads: its own
 * bundle, Google Fonts, and images from this origin (plus data:/blob: for
 * photo previews before upload). The browser never calls a third-party API —
 * NHTSA and GitHub are reached from the server.
 */
const CSP = [
  "default-src 'self'",
  "script-src 'self'",
  // React and the chart library set inline style attributes.
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  "font-src 'self' https://fonts.gstatic.com",
  "img-src 'self' data: blob:",
  "connect-src 'self'",
  "worker-src 'self'",
  "manifest-src 'self'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
].join('; ');

function securityHeaders({ https = false } = {}) {
  return (req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    // Vendor links leave the app; don't tell those sites the address of a
    // self-hosted install.
    res.setHeader('Referrer-Policy', 'same-origin');
    res.setHeader('Permissions-Policy', 'camera=(self), microphone=(), payment=(), geolocation=(self)');
    res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
    // Uploaded PDFs open in the browser's viewer, which a page-level CSP can
    // interfere with; those responses get their own nosniff/private headers.
    if (!req.path.startsWith('/uploads/')) res.setHeader('Content-Security-Policy', CSP);
    if (https) res.setHeader('Strict-Transport-Security', 'max-age=31536000');
    next();
  };
}

module.exports = { securityHeaders, CSP };
