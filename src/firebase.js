/*
 * Firebase Configuration for Sodexo Kitchen Inspection
 *
 * ── API KEY SECURITY ──────────────────────────────────────────────
 * The API key below is a BROWSER key (public identifier). It is safe
 * to bundle in client code because it only routes requests to the
 * correct Firebase project — it does NOT grant write access on its own.
 * Real protection comes from Firestore and Storage security rules.
 *
 * For additional hardening, restrict this key in Google Cloud Console:
 *   1. https://console.cloud.google.com → APIs & Services → Credentials
 *   2. Find the "Browser key (auto created by Firebase)" entry
 *   3. Under "Application restrictions" → select "HTTP referrers (websites)"
 *   4. Add your domain(s):
 *        joxeldasilva.github.io/*
 *        localhost:5173/*        (dev only — remove in production)
 *   5. Under "API restrictions" → select "Restrict key"
 *   6. Enable only:
 *        Cloud Firestore API
 *        Firebase Storage
 *        Identity Toolkit API  (if using Firebase Auth in the future)
 *   7. Save. Requests from any other domain or to any other API will be
 *      rejected by Google before they even hit Firebase.
 *
 * ── ROTATING THE KEY ─────────────────────────────────────────────
 * If you believe the key has been compromised:
 *   1. Go to Google Cloud Console → APIs & Services → Credentials
 *   2. Find the Browser key → click the three-dot menu → "Regenerate key"
 *   3. Update the apiKey value below with the new key
 *   4. Rebuild and deploy: npm run build && npm run deploy
 *
 * ── RULES FILES ──────────────────────────────────────────────────
 * Security rules live in:
 *   firestore.rules  — Firestore read/write validation
 *   storage.rules    — Firebase Storage photo upload validation
 * Deploy them with:
 *   firebase deploy --only firestore:rules,storage
 */

import { initializeApp } from "firebase/app";
import { getFirestore, collection, doc } from "firebase/firestore";
import { getStorage, ref, uploadString, getDownloadURL, getBlob, deleteObject } from "firebase/storage";

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
let storage = null;

if (isConfigured) {
  app = initializeApp(firebaseConfig);
  db = getFirestore(app);
  storage = getStorage(app);
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

/**
 * Top-level venue registry collection — stores venue metadata (name, type, address, status).
 * Path: /venueRegistry/{venueId}  (NOT scoped under /venues/, so global_admin can read all)
 */
export function venueRegistryCol() {
  if (!db) return null;
  return collection(db, "venueRegistry");
}

export function venueRegistryDoc(venueId) {
  if (!db) return null;
  return doc(db, "venueRegistry", venueId);
}

/**
 * Upload a base64 data URL to Firebase Storage.
 * Path: photos/{venueId}/{inspectionId}/{photoId}.jpg
 * Returns the permanent HTTPS download URL.
 */
export async function uploadPhoto(dataUrl, venueId, inspectionId, photoId) {
  if (!storage) { console.error("uploadPhoto: storage is null"); return null; }
  try {
    const path = `photos/${venueId}/${inspectionId}/${photoId}.jpg`;
    const photoRef = ref(storage, path);
    await uploadString(photoRef, dataUrl, "data_url", { contentType: "image/jpeg" });
    const url = await getDownloadURL(photoRef);
    console.log("uploadPhoto success:", path);
    return url;
  } catch (e) {
    console.error("uploadPhoto error code:", e.code, "message:", e.message);
    return null;
  }
}

/**
 * Delete a photo from Firebase Storage by its storage path or full URL.
 */
export async function deletePhoto(venueId, inspectionId, photoId) {
  if (!storage) return;
  try {
    const path = `photos/${venueId}/${inspectionId}/${photoId}.jpg`;
    await deleteObject(ref(storage, path));
  } catch (_) {}
}

export { db, storage, ref as storageRef, getBlob as storageGetBlob, isConfigured };
