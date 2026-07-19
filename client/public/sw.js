/* RaptorTracker service worker.
 *
 * Deliberately conservative: the classic PWA failure mode is a stale shell that
 * pins users to an old build. So:
 *   - /api/**            → network only, never cached (data must be live)
 *   - navigations        → network first, cached shell only as an offline fallback
 *   - /assets/** (hashed) → cache first (filenames change every build, so safe)
 * Old caches are dropped on activate, and the worker takes control immediately.
 */
const CACHE = 'raptortracker-v1';
const SHELL = '/index.html';

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE).then(c => c.add(SHELL)).catch(() => {}).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  // Never cache API or uploads — always hit the network.
  if (url.pathname.startsWith('/api/') || url.pathname.startsWith('/uploads/')) return;

  // Navigations: network first so a new deploy is picked up right away.
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then(resp => {
          const copy = resp.clone();
          caches.open(CACHE).then(c => c.put(SHELL, copy)).catch(() => {});
          return resp;
        })
        .catch(() => caches.match(SHELL).then(r => r || Response.error()))
    );
    return;
  }

  // Hashed build assets: cache first, they're immutable per build.
  if (url.pathname.startsWith('/assets/')) {
    event.respondWith(
      caches.match(request).then(hit => hit || fetch(request).then(resp => {
        const copy = resp.clone();
        caches.open(CACHE).then(c => c.put(request, copy)).catch(() => {});
        return resp;
      }))
    );
  }
});
