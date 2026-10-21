/* Service worker: models, sounds, music and card art are cached after the first visit, so the game starts without
 * downloading them again and keeps working offline for solo play. Pages and scripts always try the network first so a
 * new release is picked up at once. The cache name carries the game version (see main.ts), old caches are removed. */
const VERSION = new URL(self.location.href).searchParams.get('v') || 'dev';
const CACHE = 'wrh-' + VERSION;
const BIG = /\/(models|sfx|music|cards|icons)\//;

self.addEventListener('install', (e) => {
  self.skipWaiting();
  e.waitUntil(caches.open(CACHE));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    (async () => {
      for (const k of await caches.keys()) if (k.startsWith('wrh-') && k !== CACHE) await caches.delete(k);
      await self.clients.claim();
    })(),
  );
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return; // relay, raw.githubusercontent.com and friends go straight through
  if (url.pathname.endsWith('/version.json') || url.pathname.endsWith('/asset-manifest.json')) return;
  if (BIG.test(url.pathname)) {
    // cache first: these files never change within a version
    e.respondWith(
      caches.open(CACHE).then(async (c) => {
        const hit = await c.match(req);
        if (hit) return hit;
        const res = await fetch(req);
        if (res.ok) c.put(req, res.clone());
        return res;
      }),
    );
    return;
  }
  // everything else (the page, the scripts): network first, the cache is the offline fallback
  e.respondWith(
    fetch(req)
      .then((res) => {
        if (res.ok && (url.pathname.endsWith('.js') || url.pathname.endsWith('.css') || url.pathname.endsWith('.html') || url.pathname.endsWith('/'))) {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(req, copy));
        }
        return res;
      })
      .catch(() => caches.match(req).then((r) => r || Response.error())),
  );
});
