/* =========================================================
   Hishab — offline service worker
   ========================================================= */

const CACHE = 'hishab-v1.3.5';

const ASSETS = [
  './',
  './index.html',
  './manifest.webmanifest',
  './assets/css/app.css',
  './assets/js/app.js',
  './assets/js/analytics.js',
  './assets/js/assistant.js',
  './assets/js/categories.js',
  './assets/js/charts.js',
  './assets/js/components.js',
  './assets/js/extract.js',
  './assets/js/i18n.js',
  './assets/js/parsers.js',
  './assets/js/store.js',
  './assets/js/utils.js',
  './assets/js/voice.js',
  './assets/js/views/activity.js',
  './assets/js/views/assistant.js',
  './assets/js/views/home.js',
  './assets/js/views/importView.js',
  './assets/js/views/more.js',
  './assets/js/views/report.js',
  './assets/vendor/pdf.min.mjs',
  './assets/vendor/pdf.worker.min.mjs',
  './assets/vendor/tesseract.min.js',
  './assets/vendor/tesseract-worker.min.js',
  './assets/vendor/tesseract-core/tesseract-core-simd-lstm.wasm.js',
  './assets/vendor/tessdata/eng.traineddata.gz',
  './assets/vendor/tessdata/ben.traineddata.gz',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/maskable-512.png',
  './icons/apple-touch-icon.png',
  './icons/favicon-64.png',
  './icons/favicon.svg',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE)
      .then((cache) => cache.addAll(ASSETS))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== CACHE).map((key) => caches.delete(key))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then((response) => {
          const copy = response.clone();
          caches.open(CACHE).then((cache) => cache.put('./index.html', copy));
          return response;
        })
        .catch(() => caches.match('./index.html')),
    );
    return;
  }

  event.respondWith(
    caches.match(request).then((cached) => {
      if (cached) return cached;
      return fetch(request)
        .then((response) => {
          if (response.ok) {
            const copy = response.clone();
            caches.open(CACHE).then((cache) => cache.put(request, copy));
          }
          return response;
        })
        .catch(() => caches.match('./index.html'));
    }),
  );
});
