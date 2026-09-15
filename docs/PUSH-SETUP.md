# Turning on push notifications ("✅ Fixed" alerts with the app closed)

Everything in the app is already built. These steps run once, on your Mac,
and take about ten minutes. Nothing here touches the app's look or data.

## 1. Get the Web Push key (2 min)

1. Open the [Firebase console](https://console.firebase.google.com/project/sodexoinspection/settings/cloudmessaging).
2. Project settings → **Cloud Messaging** → **Web Push certificates**.
3. Press **Generate key pair**. Copy the long key that appears.
4. In this repo open `src/firebase.js`, find `VAPID_PUBLIC_KEY = ""` and paste
   the key between the quotes. It is a public key — safe to commit.

## 2. Switch the project to the Blaze plan (3 min)

Cloud Functions require Blaze. At this volume (a few hundred notifications a
month) the bill stays at $0 — Blaze includes a free tier that this never
exceeds. Set a budget alert of $5 if you want a safety net.

[Upgrade here](https://console.firebase.google.com/project/sodexoinspection/usage/details)

## 3. Deploy (5 min)

From the repo folder:

```bash
npm install                       # once, if you have not built here before
cd functions && npm install && cd ..
npx firebase login                # opens a browser, use the Sodexo Google account
npx firebase deploy --only functions,firestore:rules
```

The deploy prints `notifyOnFix` when it succeeds. The rules deploy in the same
command also switches the older assignment notifications back on.

## 4. Rebuild and publish the app

```bash
npm run build
git add -A && git commit -m "push: add web push key" && git push
```

## 5. On your iPhone (1 min)

iOS only delivers notifications to an app on the Home Screen:

1. Open https://joxelds.github.io/Claude in Safari.
2. Share → **Add to Home Screen**.
3. Open it from the Home Screen icon, sign in, and tap **Allow** when it asks
   about notifications.

That is it. From then on, every time a crew taps ✅ Fixed you get a
notification, even with the app closed and the phone locked.

## How to check it works

Have a crew member mark anything fixed, or do it yourself from a crew login on
another phone. Your phone should buzz within a few seconds. If nothing comes:

- Firebase console → Functions → `notifyOnFix` → **Logs** shows every run.
- `venues/default/sharedMemory/pushTokens` should list one entry per device.
- On iPhone, notifications only work from the Home Screen icon, not a Safari tab.
