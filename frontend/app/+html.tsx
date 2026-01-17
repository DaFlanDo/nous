import { ScrollViewStyleReset } from 'expo-router/html';
import { type PropsWithChildren } from 'react';

export default function Root({ children }: PropsWithChildren) {
  return (
    <html lang="ru">
      <head>
        <meta charSet="utf-8" />
        <meta httpEquiv="X-UA-Compatible" content="IE=edge" />
        <meta name="viewport" content="width=device-width, initial-scale=1, shrink-to-fit=no, viewport-fit=cover, maximum-scale=1, user-scalable=no" />
        
        {/* PWA Meta Tags */}
        <meta name="application-name" content="Nous" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="default" />
        <meta name="apple-mobile-web-app-title" content="Nous" />
        <meta name="description" content="Пространство для мыслей — дневник рефлексии с AI" />
        <meta name="mobile-web-app-capable" content="yes" />
        <meta name="theme-color" content="#8B7355" />
        
        {/* PWA Manifest */}
        <link rel="manifest" href="/manifest.json" />
        
        {/* Apple Touch Icons */}
        <link rel="apple-touch-icon" href="/icons/icon-152x152.png" />
        <link rel="apple-touch-icon" sizes="152x152" href="/icons/icon-152x152.png" />
        <link rel="apple-touch-icon" sizes="180x180" href="/icons/icon-192x192.png" />
        <link rel="apple-touch-icon" sizes="167x167" href="/icons/icon-192x192.png" />
        
        {/* Favicon */}
        <link rel="icon" type="image/png" sizes="32x32" href="/icons/icon-96x96.png" />
        <link rel="icon" type="image/png" sizes="16x16" href="/icons/icon-72x72.png" />
        
        {/* Splash Screen for iOS */}
        <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
        
        <ScrollViewStyleReset />
        
        {/* Service Worker Registration with Smart Updates */}
        <script dangerouslySetInnerHTML={{
          __html: `
            (function() {
              // Отключаем SW в dev режиме
              const isDev = window.location.hostname === 'localhost' || 
                            window.location.hostname === '127.0.0.1' ||
                            window.location.port === '8081' ||
                            window.location.port === '19006';
              
              if (isDev) {
                console.log('[SW] Development mode - Service Worker disabled');
                // Удаляем SW если был установлен ранее
                if ('serviceWorker' in navigator) {
                  navigator.serviceWorker.getRegistrations().then(function(registrations) {
                    registrations.forEach(function(registration) {
                      registration.unregister();
                      console.log('[SW] Unregistered SW for dev mode');
                    });
                  });
                  // Очищаем кэши
                  if ('caches' in window) {
                    caches.keys().then(function(names) {
                      names.forEach(function(name) {
                        caches.delete(name);
                      });
                    });
                  }
                }
                return;
              }
              
              // Production mode - регистрируем SW
              if ('serviceWorker' in navigator) {
                window.addEventListener('load', function() {
                  navigator.serviceWorker.register('/sw.js')
                    .then(function(registration) {
                      console.log('[SW] Registered:', registration.scope);
                      
                      // Проверяем обновления каждые 5 минут (не сразу!)
                      setInterval(function() {
                        registration.update();
                      }, 300000);
                      
                      // Обработка обновлений
                      registration.addEventListener('updatefound', function() {
                        var newWorker = registration.installing;
                        console.log('[SW] Update found, installing...');
                        
                        newWorker.addEventListener('statechange', function() {
                          if (newWorker.state === 'installed') {
                            // Только показываем уведомление если уже был контроллер
                            // (не первая установка)
                            if (navigator.serviceWorker.controller) {
                              console.log('[SW] New version ready');
                              showUpdateNotification(function() {
                                newWorker.postMessage({ type: 'SKIP_WAITING' });
                              });
                            } else {
                              console.log('[SW] First install, no reload needed');
                            }
                          }
                        });
                      });
                    })
                    .catch(function(error) {
                      console.error('[SW] Registration failed:', error);
                    });
                  
                  // Перезагрузка при активации нового SW (только по клику пользователя)
                  var refreshing = false;
                  navigator.serviceWorker.addEventListener('controllerchange', function() {
                    // Проверяем флаг что пользователь кликнул "Обновить"
                    if (window.__swUserTriggeredUpdate && !refreshing) {
                      refreshing = true;
                      console.log('[SW] Controller changed by user, reloading...');
                      window.location.reload();
                    }
                  });
                  
                  // Слушаем сообщения от SW
                  navigator.serviceWorker.addEventListener('message', function(event) {
                    if (event.data && event.data.type === 'SW_UPDATED') {
                      console.log('[SW] Updated to version:', event.data.version);
                    }
                  });
                });
              }
              
              // Флаг для отслеживания пользовательского обновления
              window.__swUserTriggeredUpdate = false;
              
              // Уведомление об обновлении
              function showUpdateNotification(onUpdate) {
                // Не показываем если уже есть
                if (document.getElementById('sw-update-toast')) return;
                
                var toast = document.createElement('div');
                toast.id = 'sw-update-toast';
                toast.innerHTML = \`
                  <div style="
                    position: fixed;
                    bottom: 80px;
                    left: 50%;
                    transform: translateX(-50%);
                    background: #333;
                    color: white;
                    padding: 12px 20px;
                    border-radius: 8px;
                    display: flex;
                    align-items: center;
                    gap: 12px;
                    box-shadow: 0 4px 12px rgba(0,0,0,0.3);
                    z-index: 10000;
                    font-family: -apple-system, BlinkMacSystemFont, sans-serif;
                    font-size: 14px;
                  ">
                    <span>Доступна новая версия</span>
                    <button onclick="window.__swUpdate()" style="
                      background: #4CAF50;
                      color: white;
                      border: none;
                      padding: 6px 12px;
                      border-radius: 4px;
                      cursor: pointer;
                      font-size: 14px;
                    ">Обновить</button>
                    <button onclick="this.parentElement.parentElement.remove()" style="
                      background: transparent;
                      color: #999;
                      border: none;
                      padding: 4px;
                      cursor: pointer;
                      font-size: 18px;
                    ">×</button>
                  </div>
                \`;
                
                window.__swUpdate = function() {
                  window.__swUserTriggeredUpdate = true;
                  onUpdate();
                  toast.remove();
                };
                
                document.body.appendChild(toast);
                
                // Убираем уведомление через 30 секунд (без автообновления!)
                setTimeout(function() {
                  var el = document.getElementById('sw-update-toast');
                  if (el) el.remove();
                }, 30000);
              }
            })();
          `
        }} />
        
        <style dangerouslySetInnerHTML={{
          __html: `
            html, body, #root {
              height: 100%;
              margin: 0;
              padding: 0;
              background-color: #FAF8F5;
              -webkit-font-smoothing: antialiased;
              -moz-osx-font-smoothing: grayscale;
            }
            
            /* Prevent pull-to-refresh on mobile */
            body {
              overscroll-behavior-y: contain;
            }
            
            /* Hide scrollbars but allow scrolling */
            ::-webkit-scrollbar {
              display: none;
            }
            
            /* Remove focus outline from all inputs */
            input, textarea, [contenteditable] {
              outline: none !important;
              -webkit-tap-highlight-color: transparent;
            }
            
            input:focus, textarea:focus, [contenteditable]:focus {
              outline: none !important;
            }
            
            /* iOS safe area support */
            @supports (padding-top: env(safe-area-inset-top)) {
              body {
                padding-top: env(safe-area-inset-top);
                padding-bottom: env(safe-area-inset-bottom);
                padding-left: env(safe-area-inset-left);
                padding-right: env(safe-area-inset-right);
              }
            }
          `
        }} />
      </head>
      <body>
        {children}
      </body>
    </html>
  );
}
