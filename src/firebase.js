/*
 * Firebase Configuration for Sodexo Kitchen Inspection
 *
 * SETUP INSTRUCTIONS:
 * 1. Go to https://console.firebase.google.com
 * 2. Click "Create a project" → name it "sodexo-inspection"
 * 3. Once created, click the gear icon → "Project settings"
 * 4. Scroll down to "Your apps" → click the </> (Web) icon
 * 5. Register the app (name: "Kitchen Inspection")
 * 6. Copy the firebaseConfig object and paste it below
 * 7. Go to "Build" → "Firestore Database" → "Create database"
 *    - Choose "Start in production mode"
 *    - Pick the closest region
 * 8. In Firestore, go to "Rules" tab and paste:
 *
 *    rules_version = '2';
 *    service cloud.firestore {
 *      match /databases/{database}/documents {
 *        match /{document=**} {
 *          allow read, write: if true;
 *        }
 *      }
 *    }
 *
 *    (For production, tighten these rules later)
 */

import { initializeApp } from "firebase/app";
import { getFirestore, collection } from "firebase/firestore";

const firebaseConfig = {
  apiKey: "AIzaSyDgXvyvFuKUc59IDB8Fr52ydZ0hiJfJeZU",
  authDomain: "sodexoinspection.firebaseapp.com",
  projectId: "sodexoinspection",
  storageBucket: "sodexoinspection.firebasestorage.app",
  messagingSenderId: "511560917271",
  appId: "1:511560917271:web:ef71e55659f0088278d752",
  measurementId: "G-Q8TJ05QSBP",
};

// Check if Firebase is configured
const isConfigured = Boolean(firebaseConfig.apiKey && firebaseConfig.projectId);

let app = null;
let db = null;

if (isConfigured) {
  app = initializeApp(firebaseConfig);
  db = getFirestore(app);
}

/* ── Multi-venue support ─────────────────────────────────────────
   activeVenueId is set once at boot from the ?v= URL param.
   venueCol(name) returns the Firestore collection reference
   scoped to the current venue:  /venues/{venueId}/{name}
──────────────────────────────────────────────────────────────── */
export let activeVenueId = "default";

export function setVenue(id) {
  activeVenueId = id || "default";
}

/**
 * Returns a Firestore CollectionReference scoped to the active venue.
 * Usage:  venueCol("inspections")  →  /venues/hard-rock-stadium/inspections
 */
export function venueCol(name) {
  if (!db) return null;
  return collection(db, "venues", activeVenueId, name);
}

export { db, isConfigured };
