const CACHE = 'virtual-study-room-v13';
const APP_SHELL = [
  './', './index.html', './css/style.css?v=20260816-3', './manifest.webmanifest',
  './icons/icon-192.png', './icons/icon-512.png',
  './vendor/chart.umd.min.js', './vendor/xlsx.full.min.js',
  './shared/archive-core.js', './js/storage.js', './js/background.js',
  './js/timer.js', './js/templates.js', './js/courses.js',
  './js/tasks.js?v=20260816-3', './js/plans.js',
  './js/import-hub.js', './js/sync.js', './js/reviews.js?v=20260816-3', './js/stats.js',
  './js/goals.js', './js/app.js'
];

self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(APP_SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', event => {
  event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(key => key !== CACHE).map(key => caches.delete(key)))).then(() => self.clients.claim()));
});

self.addEventListener('fetch', event => {
  const request = event.request;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  // HTML navigation: network first, fall back to cache for offline use.
  if (request.mode === 'navigate') {
    event.respondWith(fetch(request).then(response => {
      const copy = response.clone();
      caches.open(CACHE).then(cache => cache.put('./index.html', copy));
      return response;
    }).catch(() => caches.match('./index.html')));
    return;
  }

  // Static assets: stale-while-revalidate so updates apply on next load.
  event.respondWith(caches.match(request).then(cached => {
    const network = fetch(request).then(response => {
      const copy = response.clone();
      caches.open(CACHE).then(cache => cache.put(request, copy));
      return response;
    }).catch(() => cached);
    return cached || network;
  }));
});
