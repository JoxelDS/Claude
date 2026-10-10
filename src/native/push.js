/* ── Native-shell push listeners (Capacitor) ───────────────────────────
   Loaded ONLY inside the installed iOS/Android app: src/main.jsx
   dynamic-imports this module when window.Capacitor reports a native
   platform. On the open web the import never happens, this file is never
   fetched, and nothing here can affect the PWA.

   Token registration itself lives in src/firebase.js
   (registerNativePushToken, reached through the registerPushToken call
   the app already makes at sign-in). This module owns what happens when
   a notification ARRIVES:
     · app in foreground → re-dispatched as a window event so the app's
       in-app notification UI can show it (the OS does not banner
       foreground pushes by itself);
     · notification tapped → the action is kept on
       window.__sdxLastPushAction and re-dispatched as an event, so the
       app can deep-link the moment it is ready to listen.              */

import { Capacitor } from "@capacitor/core";

let started = false;

export async function initNativePush() {
  if (started) return;
  started = true;
  try {
    if (!Capacitor.isNativePlatform()) return;
    const { PushNotifications } = await import("@capacitor/push-notifications");

    await PushNotifications.addListener("pushNotificationReceived", notification => {
      try {
        window.dispatchEvent(new CustomEvent("sdx-push-received", { detail: notification }));
      } catch (_) {}
    });

    await PushNotifications.addListener("pushNotificationActionPerformed", action => {
      try {
        window.__sdxLastPushAction = action;
        window.dispatchEvent(new CustomEvent("sdx-push-action", { detail: action }));
      } catch (_) {}
    });
  } catch (e) {
    console.warn("initNativePush:", e?.message || e);
  }
}
