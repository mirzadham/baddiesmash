// BADDIESMASH Service Worker — Shell Cache & PWA Support
// Fulfills DEC-056 / DEC-066 / Phase 33 Performance & PWA Polish
//
// Invariants enforced:
// 1. Static shell assets (HTML, JS, CSS, fonts, icons) are cached for fast courtside mobile loading.
// 2. All Supabase requests (*.supabase.co, auth, rest, RPCs) strictly bypass the cache (network-only).
// 3. Offline match writing is NEVER allowed; only the static UI shell is cached.

const CACHE_NAME = 'baddiesmash-shell-v1';

const PRECACHE_ASSETS = [
  '/',
  '/index.html',
  '/manifest.json',
  '/favicon.png',
  '/apple-touch-icon.png',
  '/icon-192.png',
  '/icon-512.png',
];

// Install: Pre-cache app shell assets and activate immediately
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE_NAME)
      .then((cache) => cache.addAll(PRECACHE_ASSETS))
      .then(() => self.skipWaiting()),
  );
});

// Activate: Clean up older cache versions and claim clients
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((key) => key !== CACHE_NAME)
            .map((key) => caches.delete(key)),
        ),
      )
      .then(() => self.clients.claim()),
  );
});

// Fetch: Strategy dispatch
self.addEventListener('fetch', (event) => {
  const request = event.request;
  const url = new URL(request.url);

  // 1. Only intercept GET requests
  if (request.method !== 'GET') {
    return;
  }

  // 2. Strict Security Boundary: Supabase API, Auth, and Storage calls MUST bypass cache
  if (
    url.hostname.includes('supabase.co') ||
    url.pathname.startsWith('/auth/v1/') ||
    url.pathname.startsWith('/rest/v1/') ||
    url.pathname.startsWith('/storage/v1/') ||
    url.searchParams.has('demo')
  ) {
    // Network-only, fail closed if offline (preserves canonical data invariants)
    return;
  }

  // 3. HTML Navigation requests: Network-first with offline fallback to cached index.html
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request).catch(() =>
        caches.match('/index.html').then((cached) => cached || Response.error()),
      ),
    );
    return;
  }

  // 4. Static assets (JS chunks, CSS, fonts, icons): Stale-While-Revalidate
  if (
    url.pathname.startsWith('/assets/') ||
    url.pathname.endsWith('.js') ||
    url.pathname.endsWith('.css') ||
    url.pathname.endsWith('.woff2') ||
    url.pathname.endsWith('.png') ||
    url.pathname.endsWith('.svg') ||
    url.pathname.endsWith('.json')
  ) {
    event.respondWith(
      caches.open(CACHE_NAME).then((cache) =>
        cache.match(request).then((cachedResponse) => {
          const fetchPromise = fetch(request)
            .then((networkResponse) => {
              if (networkResponse && networkResponse.status === 200) {
                cache.put(request, networkResponse.clone());
              }
              return networkResponse;
            })
            .catch(() => cachedResponse);

          return cachedResponse || fetchPromise;
        }),
      ),
    );
    return;
  }

  // 5. Default fallback: network with cache fallback
  event.respondWith(
    caches.match(request).then((cached) => cached || fetch(request)),
  );
});
