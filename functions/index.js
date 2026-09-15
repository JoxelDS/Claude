/**
 * SDX Inspect — push notifications (v435)
 *
 * Crews mark a problem fixed on their board. That writes
 *   venues/<venue>/sharedMemory/venueSettings  →  followupStatus[key] = { status:"resolved", by, ts, how }
 *
 * This function watches that document, spots entries that just became
 * "resolved", and pushes one notification per fix to every device token
 * registered in
 *   venues/<venue>/sharedMemory/pushTokens  →  tokens[token] = { name, role, ts }
 *
 * Tokens that Firebase reports as dead are removed so the list stays clean.
 */
const { onDocumentWritten } = require("firebase-functions/v2/firestore");
const { setGlobalOptions } = require("firebase-functions/v2");
const admin = require("firebase-admin");

admin.initializeApp();
setGlobalOptions({ region: "us-central1", maxInstances: 5 });

const db = admin.firestore();

// Only these roles get the fix alerts — crews already know what they fixed.
const WATCHER_ROLES = ["inspector", "admin", "global_admin", "location_manager"];

exports.notifyOnFix = onDocumentWritten(
  "venues/{venueId}/sharedMemory/venueSettings",
  async (event) => {
    const before = event.data?.before?.data()?.followupStatus || {};
    const after = event.data?.after?.data()?.followupStatus || {};
    const venueId = event.params.venueId;

    // Which keys just became resolved (or were resolved again, later)?
    const fresh = [];
    for (const [key, val] of Object.entries(after)) {
      if (!val || val.status !== "resolved" || !val.ts) continue;
      const old = before[key];
      if (old && old.status === "resolved" && Number(old.ts) === Number(val.ts)) continue;
      fresh.push({ key, ...val });
    }
    if (!fresh.length) return;

    // Anything older than 10 minutes is a replay, not news.
    const cutoff = Date.now() - 10 * 60 * 1000;
    const news = fresh.filter((f) => Number(f.ts) >= cutoff);
    if (!news.length) return;

    const tokenSnap = await db.doc(`venues/${venueId}/sharedMemory/pushTokens`).get();
    const tokens = (tokenSnap.exists && tokenSnap.data().tokens) || {};
    const targets = Object.entries(tokens)
      .filter(([, v]) => v && WATCHER_ROLES.includes(v.role))
      .map(([token]) => token);
    if (!targets.length) return;

    for (const fix of news) {
      const [loc, cat] = String(fix.key).split("::");
      const how = fix.how === "already" ? " · was already clean"
        : fix.how === "crew" ? " · cleaned by the crew" : "";
      const title = `✅ Fixed — ${loc || "a stand"}`;
      const body = `${cat || "Problem"}${how}${fix.by ? ` · by ${fix.by}` : ""}`;

      const res = await admin.messaging().sendEachForMulticast({
        tokens: targets,
        notification: { title, body },
        data: { kind: "fixed", key: String(fix.key), ts: String(fix.ts) },
        webpush: {
          fcmOptions: { link: "https://joxelds.github.io/Claude/" },
          notification: { icon: "https://joxelds.github.io/Claude/favicon.svg", tag: `fixed_${fix.key}` },
        },
        apns: { payload: { aps: { sound: "default" } } },
      });

      // Drop tokens Firebase says are gone (app deleted, permission revoked).
      const dead = [];
      res.responses.forEach((r, i) => {
        const code = r.error?.code || "";
        if (code.includes("registration-token-not-registered") || code.includes("invalid-argument")) dead.push(targets[i]);
      });
      if (dead.length) {
        const patch = {};
        for (const t of dead) patch[`tokens.${t}`] = admin.firestore.FieldValue.delete();
        await db.doc(`venues/${venueId}/sharedMemory/pushTokens`).update(patch).catch(() => {});
      }
    }
  }
);
