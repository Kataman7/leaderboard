const CACHE_NAME = 'boardscores-v30';
const STATIC_ASSETS = [
  '/',
  '/manifest.json',
  '/static/css/style.css',
  '/static/js/app.js',
  '/static/icons/icon.svg',
  '/static/icons/icon-192.png',
  '/static/icons/icon-512.png',
  '/static/icons/default-game.svg'
];

// Install: pre-cache assets and immediately skip waiting to activate
self.addEventListener('install', (event) => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(STATIC_ASSETS))
  );
});

// Activate: clean up ALL old caches and take control of all clients immediately
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.map((key) => {
          if (key !== CACHE_NAME) {
            console.log('[SW] Suppression ancien cache:', key);
            return caches.delete(key);
          }
        })
      );
    }).then(() => self.clients.claim())
  );
});

// Allow client pages to trigger immediate skipWaiting
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});

// Fetch: NETWORK FIRST for everything, fallback to cache
// This ensures that updates are always delivered immediately without hard refresh!
self.addEventListener('fetch', (event) => {
  // Only handle GET requests
  if (event.request.method !== 'GET') return;

  const url = new URL(event.request.url);

  // Network First with Cache Fallback strategy
  event.respondWith(
    fetch(event.request)
      .then((networkResponse) => {
        // If successful, update the cache in the background
        if (networkResponse && networkResponse.status === 200) {
          const responseClone = networkResponse.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, responseClone));
        }
        return networkResponse;
      })
      .catch(() => {
        // Network failed (offline) -> serve from cache
        return caches.match(event.request).then((cachedResponse) => {
          if (cachedResponse) {
            return cachedResponse;
          }
          // If page navigation failed and not in cache, fallback to root
          if (event.request.mode === 'navigate') {
            return caches.match('/');
          }
          return new Response('Mode hors-ligne', { status: 503, statusText: 'Offline' });
        });
      })
  );
});
