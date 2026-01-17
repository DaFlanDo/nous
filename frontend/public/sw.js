/**
 * Nous Service Worker v2.0
 * 
 * Стратегии кэширования:
 * - JS/CSS/HTML: Network First (всегда свежий код)
 * - API: Network Only (никогда не кэшируем личные данные)
 * - Статика (изображения, шрифты): Stale While Revalidate
 * - Офлайн: показываем кэшированную версию
 */

// Версия SW — ОБЯЗАТЕЛЬНО менять при каждом деплое!
const SW_VERSION = '2.0.0';
const CACHE_PREFIX = 'nous-';
const CACHE_NAME = `${CACHE_PREFIX}${SW_VERSION}`;

// Что кэшировать при установке (app shell)
const PRECACHE_URLS = [
  '/'
];

// Паттерны для разных стратегий
const PATTERNS = {
  // Никогда не кэшировать
  networkOnly: [
    /\/api\//,           // Все API запросы
    /\/_next\/webpack/,  // HMR WebSocket
    /\.hot-update\./,    // Hot Module Replacement
    /sockjs-node/,       // Dev server
    /ws:\/\//,           // WebSockets
    /__webpack_hmr/,     // Webpack HMR
  ],
  
  // Network First (код приложения)
  networkFirst: [
    /\.(js|css|html)$/,
    /\/_next\/static\//,
    /\/static\/js\//,
    /\/static\/css\//,
    /^\/$/,              // Главная страница
    /\/checklists/,
    /\/state/,
    /\/chat/,
  ],
  
  // Stale While Revalidate (статика)
  staleWhileRevalidate: [
    /\.(png|jpg|jpeg|gif|svg|webp|ico)$/,
    /\.(woff|woff2|ttf|eot)$/,
    /\/icons\//,
  ]
};

// ============ INSTALL ============
self.addEventListener('install', (event) => {
  console.log(`[SW ${SW_VERSION}] Installing...`);
  
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => {
        console.log(`[SW ${SW_VERSION}] Pre-caching app shell`);
        return cache.addAll(PRECACHE_URLS).catch(err => {
          console.warn('[SW] Pre-cache failed:', err);
        });
      })
      .then(() => {
        // Сразу активируем новый SW без ожидания
        console.log(`[SW ${SW_VERSION}] Skip waiting`);
        return self.skipWaiting();
      })
  );
});

// ============ ACTIVATE ============
self.addEventListener('activate', (event) => {
  console.log(`[SW ${SW_VERSION}] Activating...`);
  
  event.waitUntil(
    // Удаляем старые кэши
    caches.keys()
      .then((cacheNames) => {
        return Promise.all(
          cacheNames
            .filter(name => name.startsWith(CACHE_PREFIX) && name !== CACHE_NAME)
            .map(name => {
              console.log(`[SW ${SW_VERSION}] Deleting old cache:`, name);
              return caches.delete(name);
            })
        );
      })
      .then(() => {
        console.log(`[SW ${SW_VERSION}] Claiming clients`);
        // Берём контроль над всеми клиентами
        return self.clients.claim();
      })
      .then(() => {
        // Уведомляем все окна об обновлении
        return self.clients.matchAll({ type: 'window' });
      })
      .then((clients) => {
        clients.forEach(client => {
          client.postMessage({
            type: 'SW_UPDATED',
            version: SW_VERSION
          });
        });
      })
  );
});

// ============ FETCH ============
self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);
  
  // Игнорируем не-GET запросы
  if (request.method !== 'GET') {
    return;
  }
  
  // Игнорируем запросы к другим доменам
  if (url.origin !== self.location.origin) {
    return;
  }
  
  // Проверяем паттерны
  const matchesPattern = (patterns) => 
    patterns.some(pattern => pattern.test(url.pathname) || pattern.test(url.href));
  
  // 1. Network Only — никогда не кэшируем (API, HMR, WebSockets)
  if (matchesPattern(PATTERNS.networkOnly)) {
    return; // Браузер обработает сам
  }
  
  // 2. Network First — для кода приложения
  if (matchesPattern(PATTERNS.networkFirst)) {
    event.respondWith(networkFirst(request));
    return;
  }
  
  // 3. Stale While Revalidate — для статики
  if (matchesPattern(PATTERNS.staleWhileRevalidate)) {
    event.respondWith(staleWhileRevalidate(request));
    return;
  }
  
  // По умолчанию — Network First
  event.respondWith(networkFirst(request));
});

// ============ STRATEGIES ============

/**
 * Network First: сначала сеть, потом кэш
 * Идеально для HTML/JS/CSS — всегда свежий код
 */
async function networkFirst(request) {
  try {
    const response = await fetchWithTimeout(request, 3000);
    
    if (response.ok) {
      const cache = await caches.open(CACHE_NAME);
      cache.put(request, response.clone());
    }
    
    return response;
  } catch (error) {
    console.log('[SW] Network failed, trying cache:', request.url);
    
    const cached = await caches.match(request);
    if (cached) {
      return cached;
    }
    
    throw error;
  }
}

/**
 * Stale While Revalidate: сразу из кэша, обновляем в фоне
 * Идеально для изображений и шрифтов
 */
async function staleWhileRevalidate(request) {
  const cache = await caches.open(CACHE_NAME);
  const cached = await cache.match(request);
  
  // Фетч в фоне (не ждём)
  const fetchPromise = fetch(request)
    .then((response) => {
      if (response.ok) {
        cache.put(request, response.clone());
      }
      return response;
    })
    .catch(() => null);
  
  // Возвращаем кэшированную версию или ждём сеть
  return cached || fetchPromise;
}

/**
 * Fetch с таймаутом
 */
function fetchWithTimeout(request, timeout = 3000) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error('Request timeout'));
    }, timeout);
    
    fetch(request)
      .then((response) => {
        clearTimeout(timer);
        resolve(response);
      })
      .catch((error) => {
        clearTimeout(timer);
        reject(error);
      });
  });
}

// ============ MESSAGE HANDLING ============
self.addEventListener('message', (event) => {
  const { type } = event.data || {};
  
  switch (type) {
    case 'SKIP_WAITING':
      self.skipWaiting();
      break;
      
    case 'GET_VERSION':
      event.ports[0]?.postMessage({ version: SW_VERSION });
      break;
      
    case 'CLEAR_CACHE':
      caches.keys().then(names => {
        names.forEach(name => caches.delete(name));
      }).then(() => {
        event.ports[0]?.postMessage({ success: true });
      });
      break;
  }
});
