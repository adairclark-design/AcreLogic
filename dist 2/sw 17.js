/**
 * AcreLogic Service Worker — v2 (Session 14 Enhanced Offline)
 * Stale-while-revalidate for JS chunks, network-first for API,
 * offline HTML shell fallback for navigation.
 */
// Bump version on every deploy so stale caches are invalidated immediately.
const CACHE_NAME = 'acrelogic-v3';
const SHELL_ASSETS = ['/', '/index.html', '/manifest.json', '/icon-192.png', '/icon-512.png'];
const API_HOSTNAMES = ['acrelogic-climate-worker.adair-clark.workers.dev'];

self.addEventListener('install', (event) => {
    event.waitUntil(
        caches.open(CACHE_NAME)
            .then(cache => cache.addAll(SHELL_ASSETS))
            .then(() => self.skipWaiting()) // activate immediately, don't wait for old tabs
    );
});

self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys()
            .then(keys => Promise.all(
                // Delete ALL old caches — this clears any stale/broken bundle responses
                keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k))
            ))
            .then(() => self.clients.claim()) // take control of all tabs immediately
    );
});

self.addEventListener('fetch', (event) => {
    const { request } = event;
    if (request.method !== 'GET') return;
    const url = new URL(request.url);

    // API → network-first, offline JSON fallback
    if (API_HOSTNAMES.some(h => url.hostname.includes(h))) {
        event.respondWith(fetch(request).catch(() =>
            new Response(JSON.stringify({ error: 'offline' }), { status: 503, headers: { 'Content-Type': 'application/json' } })
        ));
        return;
    }

    // JS/CSS chunks → network-first (ensures new deploys always serve fresh bundles)
    // Falls back to cache only if offline
    if (url.pathname.startsWith('/_expo/') || url.pathname.startsWith('/assets/')) {
        event.respondWith(
            fetch(request)
                .then(res => {
                    // Cache the fresh response for offline use
                    caches.open(CACHE_NAME).then(c => c.put(request, res.clone()));
                    return res;
                })
                .catch(() => caches.match(request)) // offline fallback
        );
        return;
    }

    // Navigation → network-first, shell fallback
    if (request.mode === 'navigate') {
        event.respondWith(fetch(request).catch(() => caches.match('/index.html')));
        return;
    }

    // Static shell → cache-first
    event.respondWith(
        caches.match(request).then(cached =>
            cached ?? fetch(request).then(res => {
                caches.open(CACHE_NAME).then(c => c.put(request, res.clone()));
                return res;
            })
        )
    );
});
