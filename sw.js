// Sodexo Kitchen Inspection — Service Worker (network-first for HTML)
const CACHE_NAME = "sdx-inspect-v5";
const PRECACHE = [
  "./favicon.svg",
  "./sodexo-live-logo.svg",
  "./sodexo-dark.svg",
];

// Install: precache static assets only, skip waiting immediately
self.addEventListener("install", (e) => {
  e.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(PRECACHE))
  );
  self.skipWaiting();
});

// Activate: delete ALL old caches and take control immediately
self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

// Cache cleanup via message
self.addEventListener("message", (e) => {
  if (e.data === "CLEAN_CACHE") {
    caches.keys().then((keys) =>
      Promise.all(keys.map((k) => caches.delete(k)))
    );
  }
});

// Fetch strategy:
// - HTML (navigation): network-first (always get latest index.html)
// - Hashed assets (JS/CSS): cache-first (hash guarantees correctness)
// - Fonts: network-first
// - Everything else: network-first
self.addEventListener("fetch", (e) => {
  const url = new URL(e.request.url);

  if (e.request.method !== "GET") return;

  // Network-first for navigation requests (HTML pages)
  if (e.request.mode === "navigate" || url.pathname.endsWith(".html") || url.pathname.endsWith("/")) {
    e.respondWith(
      fetch(e.request).then((res) => {
        const clone = res.clone();
        caches.open(CACHE_NAME).then((c) => c.put(e.request, clone));
        return res;
      }).catch(() => caches.match(e.request))
    );
    return;
  }

  // Network-first for Google Fonts
  if (url.hostname.includes("fonts.googleapis.com") || url.hostname.includes("fonts.gstatic.com")) {
    e.respondWith(
      fetch(e.request).then((res) => {
        const clone = res.clone();
        caches.open(CACHE_NAME).then((c) => c.put(e.request, clone));
        return res;
      }).catch(() => caches.match(e.request))
    );
    return;
  }

  // Cache-first for hashed assets (e.g. index-B9Gh1LjJ.js) — hash ensures freshness
  if (url.origin === location.origin && /assets\/.*-\w+\.\w+$/.test(url.pathname)) {
    e.respondWith(
      caches.match(e.request).then((cached) => {
        if (cached) return cached;
        return fetch(e.request).then((res) => {
          if (res.ok) {
            const clone = res.clone();
            caches.open(CACHE_NAME).then((c) => c.put(e.request, clone));
          }
          return res;
        });
      })
    );
    return;
  }

  // Network-first for everything else
  if (url.origin === location.origin) {
    e.respondWith(
      fetch(e.request).then((res) => {
        if (res.ok) {
          const clone = res.clone();
          caches.open(CACHE_NAME).then((c) => c.put(e.request, clone));
        }
        return res;
      }).catch(() => caches.match(e.request))
    );
  }
});
