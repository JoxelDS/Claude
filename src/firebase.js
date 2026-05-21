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
import { getFirestore, collection, doc } from "firebase/firestore";
import { getStorage, ref, uploadString, getDownloadURL, deleteObject } from "firebase/storage";

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

export { db, storage, isConfigured };
