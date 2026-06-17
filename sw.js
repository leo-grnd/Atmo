// ATMO service worker — network-first pour le shell (déploiements visibles
// sans unregister manuel), stale-while-revalidate pour les CDN (fonts),
// bypass total pour les API de données. Bump VERSION à chaque release.
const VERSION = 'atmo-v2';
const SHELL = [
  './',
  './index.html',
  './style.css',
  './app.js',
  './config.js',
  './comment-ca-marche.html',
  './comment-ca-marche.css',
  './favicon.svg',
  './og-image.svg',
  './manifest.webmanifest'
];

self.addEventListener('install', (e) => {
  self.skipWaiting();
  e.waitUntil(caches.open(VERSION).then(c => c.addAll(SHELL).catch(() => null)));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then(keys => Promise.all(
      keys.filter(k => k !== VERSION).map(k => caches.delete(k))
    )).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);

  // Ne jamais cacher les appels data — l'app gère son propre cache localStorage.
  const bypass = ['open-meteo.com', 'bigdatacloud.net', 'corsproxy.io'];
  if (bypass.some(h => url.hostname.includes(h))) return;

  // Même origine (shell) → network-first, fallback cache pour l'offline.
  if (url.origin === self.location.origin) {
    e.respondWith(
      fetch(req).then(res => {
        if (res.ok) {
          const copy = res.clone();
          caches.open(VERSION).then(c => c.put(req, copy)).catch(() => {});
        }
        return res;
      }).catch(() => caches.match(req))
    );
    return;
  }

  // CDN externes (Google Fonts) : stale-while-revalidate.
  e.respondWith(
    caches.open(VERSION).then(cache =>
      cache.match(req).then(cached => {
        const fetchPromise = fetch(req).then(res => {
          if (res.ok) cache.put(req, res.clone()).catch(() => {});
          return res;
        }).catch(() => cached);
        return cached || fetchPromise;
      })
    )
  );
});
