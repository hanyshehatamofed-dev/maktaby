/* MAKTABY shell-only service worker.
 * Never cache Supabase/API/auth responses or financial writes.
 */
'use strict';
const CACHE_PREFIX = 'maktaby-shell-';
const CACHE_NAME = CACHE_PREFIX + '10.9.1-refactor-stage3-store-session-tools12';
const CORE_ASSETS = [
  '/',
  '/index.html',
  '/manifest.json',
  '/css/app.10_9_1_case_tools04.css',
  '/js/maktaby-store.js',
  '/js/renderer.10_9_1_case_tools04.js',
  '/js/maktaby-compute-worker.10443361e180.js',
  '/js/maktaby-offline-sync.js.72e9d5f62dc9.js',
  '/assets/maktaby-approved-logo.e64ef0e452.webp',
  '/assets/hany-profile-photo.8da698e249.webp',
  '/assets/dashboard-hero-reference.447436388f.webp',
  '/assets/pwa-icon-192.png',
  '/assets/pwa-icon-512.png',
  ];
self.addEventListener('install', event => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE_NAME);
    await cache.addAll(CORE_ASSETS);
    await self.skipWaiting();
  })());
});
self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter(k => k.startsWith(CACHE_PREFIX) && k !== CACHE_NAME).map(k => caches.delete(k)));
    await self.clients.claim();
  })());
});
self.addEventListener('fetch', event => {
  const request = event.request;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  if (url.pathname.startsWith('/rest/') || url.pathname.startsWith('/auth/') || url.pathname.startsWith('/storage/') || url.pathname.startsWith('/functions/')) return;

  if (request.mode === 'navigate' || url.pathname === '/' || url.pathname === '/index.html') {
    event.respondWith((async () => {
      try {
        const fresh = await fetch(request, { cache: 'no-store' });
        if (fresh && fresh.ok) {
          const cache = await caches.open(CACHE_NAME);
          cache.put('/index.html', fresh.clone());
        }
        return fresh;
      } catch (_) {
        return (await caches.match('/index.html')) || Response.error();
      }
    })());
    return;
  }

  if (/\/(assets|css|js)\//.test(url.pathname) || url.pathname === '/manifest.json') {
    event.respondWith((async () => {
      const cached = await caches.match(request);
      if (cached) return cached;
      const response = await fetch(request);
      if (response && response.ok) {
        const cache = await caches.open(CACHE_NAME);
        cache.put(request, response.clone());
      }
      return response;
    })());
  }
});

// Background Sync is only a wake-up signal. Authenticated writes are always
// performed by the open page, never by the service worker.
self.addEventListener('sync', event => {
  if (!['maktaby-expense-outbox-10.9.0', 'maktaby-state-outbox-10.9.0'].includes(event.tag)) return;
  event.waitUntil((async () => {
    const clientsList = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    for (const client of clientsList) {
      client.postMessage({ type: 'MAKTABY_DRAIN_EXPENSE_OUTBOX' });
      client.postMessage({ type: 'MAKTABY_DRAIN_STATE_OUTBOX' });
    }
  })());
});
