/* MAKTABY shell-only service worker. Generated build ID + hashed assets.
 * Never cache Supabase/API/auth responses or financial writes.
 */
'use strict';
const CACHE_PREFIX = 'maktaby-shell-';
const BUILD_ID = '__MAKTABY_BUILD_ID__';
const CACHE_NAME = CACHE_PREFIX + BUILD_ID;
const CORE_ASSETS = __MAKTABY_PRECACHE__;
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
          await cache.put('/index.html', fresh.clone());
        }
        return fresh;
      } catch (_) {
        return (await caches.match('/index.html')) || Response.error();
      }
    })());
    return;
  }
  if (/\/assets\//.test(url.pathname) || url.pathname === '/manifest.json') {
    event.respondWith((async () => {
      const cached = await caches.match(request);
      if (cached) return cached;
      const response = await fetch(request);
      if (response && response.ok) {
        const cache = await caches.open(CACHE_NAME);
        await cache.put(request, response.clone());
      }
      return response;
    })());
  }
});
// Background Sync is only a wake-up signal. Authenticated writes remain in the page.
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
