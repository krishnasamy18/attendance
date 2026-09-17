/* ============================================================
   RPSIT Attendance — Service Worker
   ------------------------------------------------------------
   Strategy
   - HTML pages  : network-first, falls back to the cache (offline).
   - Static files: stale-while-revalidate (instant + auto-updates).
   Only same-origin GET requests are handled. Registered by
   js/mobile.js on every page.
   ============================================================ */

const CACHE_NAME = 'rpsit-ams-v1';

const PRECACHE_URLS = [
  './',
  './index.html',
  './account-create.html',
  './css/style.css',
  './css/dashboard.css',
  './css/login.css',
  './css/branding.css',
  './css/responsive.css',
  './css/mobile.css',
  './js/mock-data.js',
  './js/auth.js',
  './js/app.js',
  './js/photo.js',
  './js/mobile.js',
  './assets/icons/icon-192.png',
  './assets/icons/icon-512.png'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE_NAME)
      .then((cache) =>
        // Add individually so a single missing asset cannot abort install.
        Promise.all(PRECACHE_URLS.map((url) => cache.add(url).catch(() => {})))
      )
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key)))
      )
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  // HTML navigations: network-first with cached fallback.
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then((response) => {
          const copy = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(request, copy));
          return response;
        })
        .catch(() =>
          caches
            .match(request)
            .then((cached) => cached || caches.match('./index.html'))
        )
    );
    return;
  }

  // Static assets: stale-while-revalidate.
  event.respondWith(
    caches.match(request).then((cached) => {
      const refresh = fetch(request)
        .then((response) => {
          if (response && response.status === 200 && response.type === 'basic') {
            const copy = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(request, copy));
          }
          return response;
        })
        .catch(() => cached);
      return cached || refresh;
    })
  );
});