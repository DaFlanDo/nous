const CACHE_NAME = 'nous-v4';
const urlsToCache = [
  '/',
  '/checklists',
  '/state',
  '/chat'
];

// Install event
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => {
        console.log('Opened cache');
        return cache.addAll(urlsToCache);
      })
      .catch((err) => {
        console.log('Cache install error:', err);
      })
  );
  self.skipWaiting();
});

// Activate event - clean old caches
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cacheName) => {
          if (cacheName !== CACHE_NAME) {
            console.log('Deleting old cache:', cacheName);
            return caches.delete(cacheName);
          }
        })
      );
    })
  );
  self.clients.claim();
});

// Fetch event - Cache First with Network Fallback для API
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);
  
  // Skip non-GET requests
  if (event.request.method !== 'GET') {
    return;
  }
  
  // API requests - Network First, then Cache
  if (url.pathname.startsWith('/api')) {
    event.respondWith(
      fetch(event.request)
        .then((response) => {
          // НЕ кэшируем API запросы с авторизацией (персональные данные)
          // Кэшируем только публичные эндпоинты (например, /api/auth/*)
          if (response.ok && url.pathname.startsWith('/api/auth/')) {
            const responseClone = response.clone();
            caches.open(CACHE_NAME).then((cache) => {
              cache.put(event.request, responseClone);
            });
          }
          return response;
        })
        .catch(() => {
          // Fallback to cache when offline ТОЛЬКО для публичных эндпоинтов
          if (url.pathname.startsWith('/api/auth/')) {
            return caches.match(event.request).then((cached) => {
              if (cached) {
                return cached;
              }
              return new Response(
                JSON.stringify({ offline: true, error: 'No network connection' }),
                {
                  status: 503,
                  headers: { 'Content-Type': 'application/json' }
                }
              );
            });
          }
          // Для защищённых эндпоинтов возвращаем offline error
          return new Response(
            JSON.stringify({ offline: true, error: 'No network connection' }),
            {
              status: 503,
              headers: { 'Content-Type': 'application/json' }
            }
          );
        })
    );
    return;
  }
  
  // Static assets - Cache First
  if (url.origin === self.location.origin) {
    event.respondWith(
      caches.match(event.request)
        .then((cached) => {
          if (cached) {
            return cached;
          }
          
          return fetch(event.request)
            .then((response) => {
              const responseClone = response.clone();
              caches.open(CACHE_NAME).then((cache) => {
                cache.put(event.request, responseClone);
              });
              return response;
            });
        })
    );
  }
});
