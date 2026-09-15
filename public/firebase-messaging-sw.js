/* SDX Inspect — background push (v435).
   Firebase serves messages here when the app is closed or in the background.
   Kept tiny and dependency-pinned so it loads fast on stadium wifi. */
importScripts("https://www.gstatic.com/firebasejs/10.14.1/firebase-app-compat.js");
importScripts("https://www.gstatic.com/firebasejs/10.14.1/firebase-messaging-compat.js");

firebase.initializeApp({
  apiKey: "AIzaSyDgXvyvFuKUc59IDB8Fr52ydZ0hiJfJeZU",
  authDomain: "sodexoinspection.firebaseapp.com",
  projectId: "sodexoinspection",
  storageBucket: "sodexoinspection.firebasestorage.app",
  messagingSenderId: "511560917271",
  appId: "1:511560917271:web:ef71e55659f0088278d752",
});

firebase.messaging().onBackgroundMessage((payload) => {
  const n = payload.notification || {};
  self.registration.showNotification(n.title || "SDX Inspect", {
    body: n.body || "",
    icon: "/Claude/favicon.svg",
    badge: "/Claude/favicon.svg",
    tag: (payload.data && payload.data.key) || "sdx",
    data: { url: "/Claude/" },
  });
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = (event.notification.data && event.notification.data.url) || "/Claude/";
  event.waitUntil(clients.matchAll({ type: "window", includeUncontrolled: true }).then((list) => {
    for (const c of list) { if (c.url.includes("/Claude") && "focus" in c) return c.focus(); }
    return clients.openWindow(url);
  }));
});
