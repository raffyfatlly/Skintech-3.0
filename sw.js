
const CACHE_NAME = 'skinos-cache-v1';
const urlsToCache = [
  '/',
  '/index.html',
  '/manifest.json'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => {
        return cache.addAll(urlsToCache);
      })
  );
  self.skipWaiting();
});

self.addEventListener('fetch', (event) => {
  event.respondWith(
    fetch(event.request).catch(() => {
      return caches.match(event.request);
    })
  );
});

self.addEventListener('activate', (event) => {
  const cacheWhitelist = [CACHE_NAME];
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cacheName) => {
          if (cacheWhitelist.indexOf(cacheName) === -1) {
            return caches.delete(cacheName);
          }
        })
      );
    })
  );
  self.clients.claim();
});

// --- PUSH NOTIFICATION HANDLERS ---

self.addEventListener('push', (event) => {
  let data = {};
  if (event.data) {
    try {
      data = event.data.json();
    } catch (e) {
      data = { title: 'SkinOS Update', body: event.data.text() };
    }
  }

  const options = {
    body: data.body || 'Check your skin health progress.',
    icon: 'https://placehold.co/192x192/0d9488/ffffff.png?text=OS',
    badge: 'https://placehold.co/96x96/0d9488/ffffff.png?text=OS',
    vibrate: [100, 50, 100],
    data: data.data || {}, // Contains deep link url
    actions: data.actions || [],
    image: data.image || null
  };

  event.waitUntil(
    self.registration.showNotification(data.title || 'SkinOS', options)
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();

  let urlToOpen = '/';
  
  // 1. Handle Action Button Clicks
  if (event.action === 'scan_now') {
    urlToOpen = '/?action=scan';
  } else if (event.action === 'add_product') {
    urlToOpen = '/?action=shelf';
  } else if (event.notification.data && event.notification.data.url) {
    // 2. Handle Body Click Deep Link
    urlToOpen = event.notification.data.url;
  }

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((windowClients) => {
      // Check if there is already a window/tab open with the target URL
      for (let i = 0; i < windowClients.length; i++) {
        const client = windowClients[i];
        // Use a loose match for the PWA domain
        if (client.url && 'focus' in client) {
          // If we want to navigate the existing window
          return client.navigate(urlToOpen).then(c => c.focus());
        }
      }
      // If no window is open, open a new one
      if (self.clients.openWindow) {
        return self.clients.openWindow(urlToOpen);
      }
    })
  );
});
