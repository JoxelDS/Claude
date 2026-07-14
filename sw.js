// Sodexo Kitchen Inspection — Service Worker
// v115: Skip accidental-tap flags — section needs failed checklist item or notes to appear in action items
const CACHE_NAME = "sdx-inspect-v115";
const PRECACHE = [
  "./favicon.svg",
  "./sodexo-live-logo.svg",
  "./sodexo-dark.svg",
];

// Install: precache static assets (NOT the HTML or JS bundles — those use network-first)
self.addEventListener("install", (e) => {
  e.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(PRECACHE))
  );
  // Take over immediately — don't wait for old SW to be idle
  self.skipWaiting();
});

// Activate: delete ALL old caches, then claim all clients
self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

// Message handler: manual cache bust from app + update notification
self.addEventListener("message", (e) => {
  if (e.data === "CLEAN_CACHE") {
    caches.delete(CACHE_NAME).then(() => {
      caches.open(CACHE_NAME).then((cache) => cache.addAll(PRECACHE));
    });
  }
  if (e.data === "SKIP_WAITING") {
    self.skipWaiting();
  }
});

// Push notification handler — receives payloads from the page via postMessage-based relay
// (true VAPID server-sent push would also hit this handler)
self.addEventListener("push", (e) => {
  let data = {};
  try { data = e.data?.json() || {}; } catch { data = { title: e.data?.text() || "Sodexo Inspection" }; }
  e.waitUntil(
    self.registration.showNotification(data.title || "Sodexo Inspection", {
      body: data.body || "",
      icon: "/Claude/favicon.svg",
      badge: "/Claude/favicon.svg",
      tag: data.tag || "sdx-notif",
      requireInteraction: false,
      data: { url: data.url || "/Claude/" },
    })
  );
});

// Open/focus the app when a notification is clicked
self.addEventListener("notificationclick", (e) => {
  e.notification.close();
  const target = e.notification.data?.url || "/Claude/";
  e.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if (client.url.includes("/Claude/") && "focus" in client) {
          return client.focus();
        }
      }
      return self.clients.openWindow(target);
    })
  );
});

// Fetch strategy:
// - HTML (index.html / navigation): network-first so new deploys are always picked up
// - Google Fonts: network-first with cache fallback
// - JS/CSS assets (hashed filenames): cache-first (immutable once deployed)
// - Everything else same-origin: stale-while-revalidate
self.addEventListener("fetch", (e) => {
  const url = new URL(e.request.url);

  // Skip non-GET
  if (e.request.method !== "GET") return;

  // Network-first for navigation (index.html) — ensures fresh app shell
  if (e.request.mode === "navigate") {
    e.respondWith(
      fetch(e.request)
        .then((res) => {
          if (res.ok) {
            const clone = res.clone();
            caches.open(CACHE_NAME).then((c) => c.put(e.request, clone));
          }
          return res;
        })
        .catch(() => caches.match(e.request))
    );
    return;
  }

  // Network-first for Google Fonts
  if (url.hostname.includes("fonts.googleapis.com") || url.hostname.includes("fonts.gstatic.com")) {
    e.respondWith(
      fetch(e.request)
        .then((res) => {
          const clone = res.clone();
          caches.open(CACHE_NAME).then((c) => c.put(e.request, clone));
          return res;
        })
        .catch(() => caches.match(e.request))
    );
    return;
  }

  // Cache-first for hashed JS/CSS assets — safe because filenames change on every deploy
  if (url.origin === location.origin && /\/assets\/[^/]+\.(js|css)$/.test(url.pathname)) {
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

  // Stale-while-revalidate for other same-origin resources (SVGs, etc.)
  if (url.origin === location.origin) {
    e.respondWith(
      caches.match(e.request).then((cached) => {
        const fetchPromise = fetch(e.request).then((res) => {
          if (res.ok) {
            const clone = res.clone();
            caches.open(CACHE_NAME).then((c) => c.put(e.request, clone));
          }
          return res;
        }).catch(() => cached);
        return cached || fetchPromise;
      })
    );
  }
});
