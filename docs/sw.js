const CACHE = 'marcy-browser-v6';
const ASSETS = [
  'index.html', 'privacy.html', 'support.html', 'manifest.json', 'icon.svg',
  'fonts/jbm-300.ttf', 'fonts/jbm-400.ttf', 'fonts/jbm-500.ttf',
  'fonts/jbm-600.ttf', 'fonts/jbm-700.ttf',
];
const ROOT = new URL('./', self.location.href);
const INDEX = new URL('index.html', ROOT).href;
const ASSET_URLS = new Set(ASSETS.map(path => new URL(path, ROOT).href));

self.addEventListener('install', event => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    await cache.addAll([...ASSET_URLS].map(url => new Request(url, { cache: 'reload' })));
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    // Cache storage is shared across this origin; leave unrelated sites' caches alone.
    const keys = await caches.keys();
    await Promise.all(keys.filter(key => key === 'marcy-v5').map(key => caches.delete(key)));
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET') return;
  const url = new URL(event.request.url);
  if (url.origin !== ROOT.origin) return;
  url.search = '';
  url.hash = '';
  // Root, index.html, and query-string variants share the same offline copy.
  const key = url.href === ROOT.href ? INDEX : url.href;
  if (!ASSET_URLS.has(key)) return;

  event.respondWith((async () => {
    let response;
    try {
      response = await fetch(event.request);
      if (response.ok) {
        try {
          const cache = await caches.open(CACHE);
          await cache.put(key, response.clone());
        } catch {
          // A full or unavailable cache must not prevent online use.
        }
        return response;
      }
    } catch {
      // Offline: try the last successful response for this asset.
    }
    try {
      const cache = await caches.open(CACHE);
      const saved = await cache.match(key);
      if (saved) return saved;
    } catch {}
    return response || new Response('Marcy is offline. Reconnect and try again.', {
      status: 503, headers: { 'Content-Type': 'text/plain; charset=utf-8' },
    });
  })());
});
