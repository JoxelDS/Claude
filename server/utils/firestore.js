import { readFileSync, existsSync } from "node:fs";
import config from "../config/index.js";

let db = null;

export async function getDb() {
  if (db) return db;

  const saPath = config.firebase.serviceAccountPath;

  if (saPath && existsSync(saPath)) {
    // Use Firebase Admin SDK when a service account is available
    const admin = await import("firebase-admin");
    const serviceAccount = JSON.parse(readFileSync(saPath, "utf-8"));

    admin.default.initializeApp({
      credential: admin.default.credential.cert(serviceAccount),
    });

    db = admin.default.firestore();
    console.log("✓ Connected to Firestore via Admin SDK");
  } else {
    // Fallback: in-memory store for development without Firebase
    console.warn("⚠  No Firebase service account found — using in-memory store");
    db = createInMemoryStore();
  }

  return db;
}

// ── In-memory Firestore-like store for development ───────────────
function createInMemoryStore() {
  const collections = {};

  return {
    collection(name) {
      if (!collections[name]) collections[name] = {};
      const col = collections[name];

      return {
        doc(id) {
          return {
            async get() {
              const data = col[id];
              return {
                exists: Boolean(data),
                id,
                data: () => (data ? { ...data } : undefined),
              };
            },
            async set(data, opts) {
              col[id] = opts?.merge ? { ...col[id], ...data } : { ...data };
            },
            async update(data) {
              if (!col[id]) throw new Error("Document not found");
              col[id] = { ...col[id], ...data };
            },
            async delete() {
              delete col[id];
            },
          };
        },
        async get() {
          const docs = Object.entries(col).map(([id, data]) => ({
            id,
            exists: true,
            data: () => ({ ...data }),
          }));
          return { docs, empty: docs.length === 0 };
        },
        where(field, op, value) {
          return {
            async get() {
              const docs = Object.entries(col)
                .filter(([, data]) => {
                  switch (op) {
                    case "==": return data[field] === value;
                    case "!=": return data[field] !== value;
                    case ">": return data[field] > value;
                    case "<": return data[field] < value;
                    default: return false;
                  }
                })
                .map(([id, data]) => ({
                  id,
                  exists: true,
                  data: () => ({ ...data }),
                }));
              return { docs, empty: docs.length === 0 };
            },
          };
        },
      };
    },
  };
}
