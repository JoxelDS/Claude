import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import QRCode from "qrcode";
import "./App.css";
import { db, isConfigured as FIREBASE_ON, setVenue, venueCol, venueRegistryCol, venueRegistryDoc, uploadPhoto, activeVenueId } from "./firebase.js";
import { collection } from "firebase/firestore";
import AIEngine from "./AIEngine.js";

/* ── Boot AI Engine once at module load (venue-scoped) ──────────────────── */
// VENUE_ID is defined later in this file but JS hoisting means the IIFE
// runs synchronously before this line executes — so VENUE_ID is available.
// However, to be safe we re-read from URL directly here.
AIEngine.boot((() => {
  try {
    const v = new URLSearchParams(window.location.search).get("v") || "";
    return v.trim().toLowerCase().replace(/[^a-z0-9_-]/g, "") || "default";
  } catch { return "default"; }
})());
import {
  doc, getDocs, getDoc, setDoc, deleteDoc, updateDoc, query, orderBy, where, onSnapshot,
  limit, startAfter, getCountFromServer
} from "firebase/firestore";

/* ── Runtime Security Shield ─────────────────────────────────────────────────
   Runs once at module load (production only). Three layers:
   1. Console lockdown  – replaces all console methods with no-ops so
      attackers can't use the browser console to probe the app.
   2. DevTools size-trap – window resize delta trick: DevTools opening changes
      the window's inner dimensions; we detect this and lock the UI.
   3. Right-click / key block – disables context-menu and F12/Ctrl+Shift+I
      so casual snoopers hit a wall immediately.
   None of these stop a determined expert, but they stop 99% of attempts.
─────────────────────────────────────────────────────────────────────────── */
if (import.meta.env.PROD) {
  // ── 1. Console lockdown ────────────────────────────────────────────────
  (() => {
    const noop = () => {};
    const methods = ["log","warn","error","info","debug","table","dir",
                     "dirxml","group","groupEnd","groupCollapsed","trace",
                     "assert","count","countReset","time","timeEnd",
                     "timeLog","profile","profileEnd","clear"];
    methods.forEach(m => { try { console[m] = noop; } catch {} });
    // Freeze the console object so it can't be restored
    try { Object.freeze(console); } catch {}
  })();

  // ── 2. DevTools open detector ──────────────────────────────────────────
  (() => {
    // Skip DevTools detection entirely on touch/mobile/tablet devices.
    // outerWidth vs innerWidth differences on tablets (especially in landscape)
    // exceed the threshold and cause false "Access Restricted" screens.
    const isMobile = /Mobi|Android|iPhone|iPad|iPod/i.test(navigator.userAgent)
      || (typeof navigator.maxTouchPoints === "number" && navigator.maxTouchPoints > 1);
    if (isMobile) return;

    const THRESHOLD = 300; // px — DevTools panel is larger than this
    let devToolsOpen = false;
    // Only check width diff (side-docked DevTools).
    // Height diff is unreliable — browser toolbars and extensions reduce
    // innerHeight permanently, causing false positives.
    const BASE_HEIGHT_DIFF = window.outerHeight - window.innerHeight;

    function check() {
      const widthDiff  = window.outerWidth  - window.innerWidth;
      // Height check: only flag if it grew MORE than 200px beyond the baseline
      const heightDiff = (window.outerHeight - window.innerHeight) - BASE_HEIGHT_DIFF;
      const opened = widthDiff > THRESHOLD || heightDiff > 200;

      if (opened && !devToolsOpen) {
        devToolsOpen = true;
        // Overlay a full-screen warning and clear the page body
        const shield = document.createElement("div");
        shield.id = "__sdx_shield";
        shield.style.cssText = [
          "position:fixed","inset:0","z-index:2147483647",
          "background:#0f172a","color:#f1f5f9",
          "display:flex","flex-direction:column",
          "align-items:center","justify-content:center",
          "font-family:sans-serif","font-size:1.25rem",
          "text-align:center","padding:2rem","gap:1rem",
        ].join(";");
        shield.innerHTML = `
          <div style="font-size:3rem">🔒</div>
          <div style="font-weight:700;font-size:1.5rem">Access Restricted</div>
          <div style="opacity:.7;max-width:380px">
            Developer tools are not permitted on this application.<br/>
            Please close DevTools and reload the page.
          </div>`;
        document.body.appendChild(shield);
      } else if (!opened && devToolsOpen) {
        devToolsOpen = false;
        // Reload the page cleanly when DevTools is closed
        window.location.reload();
      }
    }

    // Poll every 800ms — fast enough to catch opening, gentle on CPU.
    setInterval(check, 800);
    window.addEventListener("resize", check);
  })();

  // ── 3. Context-menu + keyboard shortcut blocking ───────────────────────
  (() => {
    // Disable right-click context menu
    document.addEventListener("contextmenu", e => e.preventDefault(), true);

    document.addEventListener("keydown", e => {
      const k = e.key?.toUpperCase();
      // F12
      if (k === "F12") { e.preventDefault(); e.stopPropagation(); return false; }
      // Ctrl+Shift+I  /  Ctrl+Shift+J  /  Ctrl+Shift+C  (DevTools shortcuts)
      if (e.ctrlKey && e.shiftKey && ["I","J","C","K","U"].includes(k)) {
        e.preventDefault(); e.stopPropagation(); return false;
      }
      // Cmd+Option+I (Mac DevTools)
      if (e.metaKey && e.altKey && k === "I") {
        e.preventDefault(); e.stopPropagation(); return false;
      }
      // Ctrl+U (View Source)
      if (e.ctrlKey && k === "U") {
        e.preventDefault(); e.stopPropagation(); return false;
      }
    }, true);
  })();
}

const BASE = import.meta.env.BASE_URL;
const LOGO_WHITE = `${BASE}sodexo-live-logo.svg`;
const LOGO_DARK = `${BASE}sodexo-dark.svg`;

/* ── Multi-venue: detect ?v=venueSlug from URL ───────────────────
   Each venue gets completely isolated data (localStorage + Firestore).
   Example: https://yourapp.com/?v=hard-rock-stadium
   Slug is sanitized to lowercase letters, digits, hyphens, underscores.
   Falls back to "default" if param is absent or invalid.
──────────────────────────────────────────────────────────────── */
const VENUE_ID = (() => {
  try {
    const v = new URLSearchParams(window.location.search).get("v") || "";
    return v.trim().toLowerCase().replace(/[^a-z0-9_-]/g, "") || "default";
  } catch { return "default"; }
})();

// Human-readable venue name from ?vname= param (optional display label)
const VENUE_NAME = (() => {
  try {
    const n = new URLSearchParams(window.location.search).get("vname") || "";
    return decodeURIComponent(n).trim().slice(0, 60) || null;
  } catch { return null; }
})();

// Bind the active venue in Firebase module so all venueCol() calls are scoped correctly
setVenue(VENUE_ID);

// Captured once at module load from the original URL — never changes even after replaceState cleans the URL.
// This is the authoritative source for whether this page load is the supervisor HACCP portal.
const IS_HACCP_PORTAL = new URLSearchParams(window.location.search).has("haccp");

/* ── AES-256-GCM Encryption (localStorage fallback only) ── */
const SALT_KEY           = `sdx_salt_${VENUE_ID}`;
const USERS_KEY          = `sdx_users_${VENUE_ID}`;
const DATA_KEY           = `sdx_inspection_vault_${VENUE_ID}`;
const DEVICE_SECRET_KEY  = `sdx_device_secret_${VENUE_ID}`;
const LOCK_TIMEOUT_MS    = 10 * 60 * 1000; // 10 min inactivity lock
const AUTOFILL_KEY       = `sdx_autofill_memory_${VENUE_ID}`;
const DRAFT_KEY          = `sdx_draft_${VENUE_ID}`; // auto-save draft
const LANG_KEY           = `sdx_report_lang_${VENUE_ID}`; // selected report language
const PAR_KEY            = `sdx_par_supplies_${VENUE_ID}`; // standing supply checklist with par levels

/* ── Supported report languages ───────────────────────────────────────── */
const REPORT_LANGUAGES = [
  { code: "en",    label: "English" },
  { code: "es",    label: "Español" },
  { code: "fr",    label: "Français" },
  { code: "pt",    label: "Português" },
  { code: "ht",    label: "Kreyòl ayisyen" },
  { code: "ar",    label: "العربية" },
  { code: "zh",    label: "中文" },
  { code: "hi",    label: "हिन्दी" },
];

function getAutofillMemory() {
  try { return JSON.parse(localStorage.getItem(AUTOFILL_KEY)) || {}; } catch { return {}; }
}

function saveDraft(draft) {
  try { localStorage.setItem(DRAFT_KEY, JSON.stringify({ ...draft, draftSavedAt: new Date().toISOString() })); } catch {}
}

function loadDraft() {
  try { return JSON.parse(localStorage.getItem(DRAFT_KEY)); } catch { return null; }
}

function clearDraft() {
  try { localStorage.removeItem(DRAFT_KEY); } catch {}
}

function loadParSupplies() {
  try { return JSON.parse(localStorage.getItem(PAR_KEY)) || []; } catch { return []; }
}
function saveParSupplies(list) {
  try { localStorage.setItem(PAR_KEY, JSON.stringify(list)); } catch {}
}

function learnFromSave(record) {
  const mem = getAutofillMemory();
  // supervisorName intentionally excluded — stored per-site in siteMap only (no cross-site list)
  const fields = ["siteName", "siteNumber", "sitePhone", "locationType"];
  for (const f of fields) {
    if (!record[f]) continue;
    if (!mem[f]) mem[f] = [];
    if (!mem[f].includes(record[f])) {
      mem[f].unshift(record[f]);
      mem[f] = mem[f].slice(0, 10); // keep last 10 unique values
    }
  }
  // Learn site → number mapping + equipment items (for Portable/Subcontractor)
  if (record.siteName) {
    if (!mem.siteMap) mem.siteMap = {};
    const existing = mem.siteMap[record.siteName] || {};
    const update = {
      ...existing,
      siteNumber: record.siteNumber || existing.siteNumber || "",
      sitePhone: record.sitePhone || existing.sitePhone || "",
      supervisorName: record.supervisorName || existing.supervisorName || "",
      locationType: record.locationType || existing.locationType || "",
      floor: record.floor || existing.floor || "",
    };
    // For Portable/Subcontractor: remember all equipment items (built-in + custom) at this site
    // Event / Temporary locations are skipped — their equipment is one-time and won't be there next time
    if ((record.locationType === "Portable" || record.locationType === "Subcontractor") && record.locationType !== "Event / Temporary") {
      const equip = record.inspection?.equipment || {};
      // Build a list of { key, label, equipSource } for every equipment item saved at this site
      const equipItems = Object.entries(equip)
        .filter(([, v]) => !v?.notApplicable) // skip items marked N/A — they're not here
        .map(([k, v]) => ({
          key: k,
          label: v?.label || null, // custom items have a label, built-in ones don't
          equipSource: v?.equipSource || "Facility",
        })).filter(e => e.key);
      if (equipItems.length > 0) update.equipmentItems = equipItems;
    }
    mem.siteMap[record.siteName] = update;
  }
  localStorage.setItem(AUTOFILL_KEY, JSON.stringify(mem));
}

// Build a blank equipment section from a remembered equipmentItems list
// (used when autofilling a Portable / Subcontractor site)
function buildEquipFromMemory(equipItems) {
  const equip = {};
  for (const { key, label, equipSource } of equipItems) {
    const cold = detectColdType(label || key);
    equip[key] = {
      status: "OK", notes: "", photos: [],
      count: "",
      equipSource: equipSource || "Facility",
      ...(label ? { label } : {}),          // custom items carry their label
      ...(cold ? { tempF: "" } : {}),
    };
  }
  return equip;
}

// First administrator – auto-seeded on first launch
const SEED_ADMIN = { name: "Joxel Da Silva", badge: "365582", department: "Safety Inspector" };

async function getSalt() {
  let stored = localStorage.getItem(SALT_KEY);
  if (stored) return new Uint8Array(JSON.parse(stored));
  const salt = crypto.getRandomValues(new Uint8Array(16));
  localStorage.setItem(SALT_KEY, JSON.stringify(Array.from(salt)));
  return salt;
}

async function deriveKey(secret) {
  const enc = new TextEncoder();
  const salt = await getSalt();
  const keyMaterial = await crypto.subtle.importKey("raw", enc.encode(secret), "PBKDF2", false, ["deriveBits", "deriveKey"]);
  return crypto.subtle.deriveKey(
    { name: "PBKDF2", salt, iterations: 100000, hash: "SHA-256" },
    keyMaterial,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"]
  );
}

async function hashBadge(badge) {
  // NOTE: No device-local salt — uses a fixed app prefix so the hash is
  // identical on every device. This is required for cross-device Firestore login.
  const enc = new TextEncoder();
  const data = enc.encode("sdx_badge_v2_" + badge.trim());
  const hash = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(hash)).map(b => b.toString(16).padStart(2, "0")).join("");
}

async function encryptData(data, key) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const enc = new TextEncoder();
  const ciphertext = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, enc.encode(JSON.stringify(data)));
  return JSON.stringify({ iv: Array.from(iv), ct: Array.from(new Uint8Array(ciphertext)) });
}

async function decryptData(stored, key) {
  if (!stored) return [];
  try {
    const { iv, ct } = JSON.parse(stored);
    const plaintext = await crypto.subtle.decrypt({ name: "AES-GCM", iv: new Uint8Array(iv) }, key, new Uint8Array(ct));
    return JSON.parse(new TextDecoder().decode(plaintext));
  } catch { return []; }
}

async function getMasterKey() {
  let secret = localStorage.getItem(DEVICE_SECRET_KEY);
  if (!secret) {
    const bytes = crypto.getRandomValues(new Uint8Array(32));
    secret = Array.from(bytes).map(b => b.toString(16).padStart(2, "0")).join("");
    localStorage.setItem(DEVICE_SECRET_KEY, secret);
  }
  return deriveKey("sdx_master_" + secret);
}

/* ══════════════════════════════════════════════════════════
   Storage Layer — Firestore (cloud) or localStorage (local)
   ══════════════════════════════════════════════════════════ */

/* ── Venue-scoped localStorage fallback keys ─────────────────
   Used only when FIREBASE_ON is false (local-only mode).
   Each key is namespaced by VENUE_ID so venues never share data.
──────────────────────────────────────────────────────────────── */
const HACCP_SUBS_KEY = `sdx_haccp_subs_${VENUE_ID}`;
const PROBLEMS_KEY   = `sdx_problems_${VENUE_ID}`;
const CHAT_KEY       = `sdx_chat_${VENUE_ID}`;

/* ── Legacy Firestore collection helper ──────────────────────
   Before multi-venue support all data lived in flat top-level
   collections: /users, /inspections, /haccpSubmissions, etc.
   When VENUE_ID === "default" (no ?v= param) we first try the
   new scoped path and, if empty, fall back to the old flat path
   so existing reports are never lost.
──────────────────────────────────────────────────────────────── */
function legacyCol(name) {
  return collection(db, name);
}
// True when the app is running without any ?v= param — the original
// single-venue mode. In this mode we read from old flat collections
// as the authoritative source AND write to both paths so data is
// available whether or not the user adds ?v= later.
// IS_DEFAULT_VENUE is intentionally a function so it reads the *live* activeVenueId
// (updated by setVenue()) rather than the frozen URL param captured at module load.
function IS_DEFAULT_VENUE() { return activeVenueId === "default"; }

/* ── User Registry ────────────────────────────────────────── */
async function getUsers() {
  if (FIREBASE_ON) {
    try {
      // Default venue: read from legacy flat collection (existing data lives there)
      const col = IS_DEFAULT_VENUE() ? legacyCol("users") : venueCol("users");
      const timeout = new Promise((_, reject) =>
        setTimeout(() => reject(new Error("Firestore timeout after 8s")), 8000)
      );
      const snap = await Promise.race([getDocs(col), timeout]);
      return snap.docs.map(d => d.data());
    } catch (e) {
      console.error("Firestore getUsers error:", e);
      throw e; // surface so sign-in shows a real error instead of "badge not recognized"
    }
  }
  try { return JSON.parse(localStorage.getItem(USERS_KEY) || "[]"); }
  catch { return []; }
}

async function saveUsers(users) {
  if (FIREBASE_ON) {
    try {
      const col = IS_DEFAULT_VENUE() ? legacyCol("users") : venueCol("users");
      for (const u of users) {
        await setDoc(doc(col, u.badgeHash), u);
      }
    } catch (e) { console.error("Firestore saveUsers error:", e); }
    return;
  }
  localStorage.setItem(USERS_KEY, JSON.stringify(users));
}

async function saveOneUser(user) {
  if (FIREBASE_ON) {
    try {
      const col = IS_DEFAULT_VENUE() ? legacyCol("users") : venueCol("users");
      await setDoc(doc(col, user.badgeHash), user);
    } catch {}
    return;
  }
  const users = await getUsers();
  const idx = users.findIndex(u => u.badgeHash === user.badgeHash);
  if (idx >= 0) users[idx] = user; else users.push(user);
  localStorage.setItem(USERS_KEY, JSON.stringify(users));
}

async function deleteOneUser(badgeHash) {
  if (FIREBASE_ON) {
    try {
      const col = IS_DEFAULT_VENUE() ? legacyCol("users") : venueCol("users");
      await deleteDoc(doc(col, badgeHash));
    } catch {}
    return;
  }
  const users = await getUsers();
  localStorage.setItem(USERS_KEY, JSON.stringify(users.filter(u => u.badgeHash !== badgeHash)));
}

async function ensureSeedAdmin() {
  const users = await getUsers();
  if (users.length > 0) return;
  const h = await hashBadge(SEED_ADMIN.badge);
  const seedUser = {
    badgeHash: h, name: SEED_ADMIN.name,
    department: SEED_ADMIN.department, role: "admin",
    approved: true, registeredAt: new Date().toISOString()
  };
  if (FIREBASE_ON) {
    const col = IS_DEFAULT_VENUE() ? legacyCol("users") : venueCol("users");
    await setDoc(doc(col, h), seedUser);
  } else {
    localStorage.setItem(USERS_KEY, JSON.stringify([seedUser]));
  }
}

async function ensureHardRockVenue() {
  if (!FIREBASE_ON) return;
  try {
    const ref = venueRegistryDoc("default");
    if (!ref) return;
    const snap = await getDoc(ref);
    if (snap.exists()) return; // already registered
    await setDoc(ref, {
      name: "Hard Rock Stadium",
      type: "stadium",
      address: "347 Don Shula Dr, Miami Gardens, FL 33056",
      status: "active",
      createdAt: new Date().toISOString(),
      createdBy: "system",
      note: "Primary venue — all legacy data lives under venue ID \"default\"",
    });
  } catch (e) { console.error("ensureHardRockVenue error:", e); }
}

async function ensureGlobalAdmin() {
  const TARGET_BADGE = "365582";
  const TARGET_NAME  = "Joxel Da Silva";
  const TARGET_DEPT  = "Administration";
  const h = await hashBadge(TARGET_BADGE);
  const users = await getUsers();
  const existing = users.find(u => u.badgeHash === h);
  if (existing && existing.role === "global_admin") return; // already correct
  const userRecord = {
    badgeHash: h,
    name: TARGET_NAME,
    department: TARGET_DEPT,
    badgeDisplay: "••••5582",
    role: "global_admin",
    approved: true,
    registeredAt: existing?.registeredAt || new Date().toISOString(),
  };
  if (FIREBASE_ON) {
    const col = IS_DEFAULT_VENUE() ? legacyCol("users") : venueCol("users");
    await setDoc(doc(col, h), userRecord);
  } else {
    const updated = users.filter(u => u.badgeHash !== h);
    updated.push(userRecord);
    localStorage.setItem(USERS_KEY, JSON.stringify(updated));
  }
}

/* ── Inspection History ───────────────────────────────────── */
let _cryptoKey = null;
let _currentUser = null;

/**
 * Load inspection history with optional pagination and date-range filtering.
 * @param {string} [forVenueId] - venue to read from; defaults to VENUE_ID
 * @param {{ dateFrom?: string, dateTo?: string, lastDoc?: object, pageSize?: number }} [opts]
 * @returns {{ list: object[], lastDoc: object|null, hasMore: boolean }}
 */
async function loadHistory(forVenueId, opts = {}) {
  if (FIREBASE_ON) {
    try {
      const { dateFrom, dateTo, lastDoc: cursor, pageSize = 50 } = opts;
      const targetVenue = forVenueId || VENUE_ID;
      const col = targetVenue === "default" ? legacyCol("inspections") : collection(db, "venues", targetVenue, "inspections");

      const constraints = [orderBy("savedAt", "desc")];
      if (dateFrom) constraints.push(where("savedAt", ">=", dateFrom));
      if (dateTo)   constraints.push(where("savedAt", "<=", dateTo + "T23:59:59.999Z"));
      if (cursor)   constraints.push(startAfter(cursor));
      constraints.push(limit(pageSize + 1)); // fetch one extra to detect hasMore

      const snap = await getDocs(query(col, ...constraints));
      const hasMore = snap.docs.length > pageSize;
      const docs = hasMore ? snap.docs.slice(0, pageSize) : snap.docs;
      const list = docs.map(d => d.data());
      return { list, lastDoc: docs[docs.length - 1] ?? null, hasMore };
    } catch { return { list: [], lastDoc: null, hasMore: false }; }
  }
  // localStorage fallback (no pagination)
  if (!_cryptoKey) return { list: [], lastDoc: null, hasMore: false };
  const stored = localStorage.getItem(DATA_KEY);
  const list = await decryptData(stored, _cryptoKey);
  return { list, lastDoc: null, hasMore: false };
}

async function saveHistory(records) {
  if (FIREBASE_ON) {
    try {
      const col = IS_DEFAULT_VENUE() ? legacyCol("inspections") : venueCol("inspections");
      for (const rec of records) {
        await setDoc(doc(col, rec.id), rec);
      }
    } catch (e) { console.error("Firestore saveHistory error:", e); }
    return;
  }
  if (!_cryptoKey) return;
  const encrypted = await encryptData(records, _cryptoKey);
  localStorage.setItem(DATA_KEY, encrypted);
}

// Recursively replace undefined values with null so Firestore doesn't reject the document.
// Firestore throws "Unsupported field value: undefined" for any undefined field.
function sanitizeForFirestore(val) {
  if (val === undefined) return null;
  if (val === null || typeof val !== "object") return val;
  if (Array.isArray(val)) return val.map(sanitizeForFirestore);
  const out = {};
  for (const [k, v] of Object.entries(val)) out[k] = sanitizeForFirestore(v);
  return out;
}

async function saveOneInspection(record) {
  if (FIREBASE_ON) {
    const col = IS_DEFAULT_VENUE() ? legacyCol("inspections") : venueCol("inspections");
    await setDoc(doc(col, record.id), sanitizeForFirestore(record));
    return;
  }
  // localStorage: deduplicate by ID, then prepend
  const { list: history } = await loadHistory();
  const deduped = history.filter(r => r.id !== record.id);
  deduped.unshift(record);
  await saveHistory(deduped);
}

async function deleteOneInspection(id) {
  if (FIREBASE_ON) {
    try {
      const col = IS_DEFAULT_VENUE() ? legacyCol("inspections") : venueCol("inspections");
      await deleteDoc(doc(col, id));
    } catch {}
    return;
  }
  const { list: history } = await loadHistory();
  await saveHistory(history.filter(r => r.id !== id));
}

async function clearAllInspections() {
  if (FIREBASE_ON) {
    try {
      const col = IS_DEFAULT_VENUE() ? legacyCol("inspections") : venueCol("inspections");
      const snap = await getDocs(col);
      for (const d of snap.docs) await deleteDoc(d.ref);
    } catch {}
    return;
  }
  await saveHistory([]);
}

/* ── Venue Registry (Global Admin only) ─────────────────── */
async function loadVenueRegistry() {
  if (!FIREBASE_ON) return [];
  try {
    const snap = await getDocs(venueRegistryCol());
    return snap.docs.map(d => ({ id: d.id, ...d.data() }));
  } catch { return []; }
}

async function saveVenueRecord(venueId, data) {
  if (!FIREBASE_ON) return;
  try {
    await setDoc(venueRegistryDoc(venueId), data, { merge: true });
  } catch (e) { console.error("saveVenueRecord error:", e); }
}

async function deleteVenueRecord(venueId) {
  if (!FIREBASE_ON) return;
  try {
    await deleteDoc(venueRegistryDoc(venueId));
  } catch {}
}

async function loadVenueStats(venueId) {
  if (!FIREBASE_ON) return { inspectionCount: 0, userCount: 0, lastActivity: null };
  try {
    const isDefault = venueId === "default";
    const iCol = isDefault ? collection(db, "inspections") : collection(db, "venues", venueId, "inspections");
    const uCol = isDefault ? collection(db, "users") : collection(db, "venues", venueId, "users");
    // Use count() aggregation to avoid reading all documents
    const [iCount, uCount, lastSnap] = await Promise.all([
      getCountFromServer(iCol),
      getCountFromServer(uCol),
      getDocs(query(iCol, orderBy("savedAt", "desc"), limit(1))),
    ]);
    return {
      inspectionCount: iCount.data().count,
      userCount: uCount.data().count,
      lastActivity: lastSnap.docs[0]?.data().savedAt || null,
    };
  } catch { return { inspectionCount: 0, userCount: 0, lastActivity: null }; }
}

/* ── AI Analytics Persistence ────────────────────────────── */
async function persistAnalyticsSnapshot(venueId) {
  if (!FIREBASE_ON) return;
  try {
    const snapshot = AIEngine.getSnapshot();
    if (!snapshot) return;
    const aCol = venueId === "default"
      ? collection(db, "analyticsAggregates")
      : collection(db, "venues", venueId, "analyticsAggregates");
    await setDoc(doc(aCol, "latest"), {
      ...snapshot,
      venueId: venueId || "default",
      savedAt: new Date().toISOString(),
    });
  } catch (e) { console.error("persistAnalyticsSnapshot error:", e); }
}

async function loadAnalyticsSnapshot(venueId) {
  if (!FIREBASE_ON) return null;
  try {
    const aCol = venueId === "default"
      ? collection(db, "analyticsAggregates")
      : collection(db, "venues", venueId, "analyticsAggregates");
    const snap = await getDoc(doc(aCol, "latest"));
    return snap.exists() ? snap.data() : null;
  } catch { return null; }
}

/* ── HACCP Supervisor Submissions ────────────────────────── */
async function saveHaccpSubmission(record) {
  if (FIREBASE_ON) {
    try {
      const col = IS_DEFAULT_VENUE() ? legacyCol("haccpSubmissions") : venueCol("haccpSubmissions");
      await setDoc(doc(col, record.id), record);
    } catch (e) { console.error(e); }
    return;
  }
  const list = JSON.parse(localStorage.getItem(HACCP_SUBS_KEY) || "[]");
  list.unshift(record);
  localStorage.setItem(HACCP_SUBS_KEY, JSON.stringify(list.slice(0, 200)));
}

async function loadHaccpSubmissions() {
  if (FIREBASE_ON) {
    try {
      const col = IS_DEFAULT_VENUE() ? legacyCol("haccpSubmissions") : venueCol("haccpSubmissions");
      const snap = await getDocs(query(col, orderBy("submittedAt", "desc")));
      return snap.docs.map(d => d.data());
    } catch { return []; }
  }
  try { return JSON.parse(localStorage.getItem(HACCP_SUBS_KEY) || "[]"); } catch { return []; }
}

async function loadHaccpForReport(reportId) {
  if (!reportId) return [];
  if (FIREBASE_ON) {
    try {
      // NOTE: Only two where() clauses — adding orderBy here would require a
      // Firestore composite index (reportId + type + submittedAt).  Sort in JS
      // instead so the query works without any index configuration.
      const col = IS_DEFAULT_VENUE() ? legacyCol("haccpSubmissions") : venueCol("haccpSubmissions");
      const snap = await getDocs(
        query(col,
          where("reportId", "==", reportId),
          where("type", "==", "submission"))
      );
      return snap.docs
        .map(d => d.data())
        .sort((a, b) => (a.submittedAt || "").localeCompare(b.submittedAt || ""));
    } catch (e) { console.error("loadHaccpForReport:", e); return []; }
  }
  try {
    const all = JSON.parse(localStorage.getItem(HACCP_SUBS_KEY) || "[]");
    return all
      .filter(r => r.reportId === reportId && r.type === "submission")
      .sort((a, b) => (a.submittedAt || "").localeCompare(b.submittedAt || ""));
  } catch { return []; }
}

// Real-time HACCP subscription for a specific reportId — returns an unsubscribe fn.
function subscribeHaccpForReport(reportId, onUpdate) {
  if (!reportId) return () => {};
  if (FIREBASE_ON) {
    try {
      const col = IS_DEFAULT_VENUE() ? legacyCol("haccpSubmissions") : venueCol("haccpSubmissions");
      const q = query(col, where("reportId", "==", reportId), where("type", "==", "submission"));
      return onSnapshot(q, (snap) => {
        const subs = snap.docs
          .map(d => d.data())
          .sort((a, b) => (a.submittedAt || "").localeCompare(b.submittedAt || ""));
        onUpdate(subs);
      }, () => {
        loadHaccpForReport(reportId).then(onUpdate);
      });
    } catch { /* fall through */ }
  }
  // localStorage fallback — poll every 4s
  loadHaccpForReport(reportId).then(onUpdate);
  const iv = setInterval(() => loadHaccpForReport(reportId).then(onUpdate), 4000);
  return () => clearInterval(iv);
}

/* ── Problem Reports ──────────────────────────────────────── */
async function saveProblemReport(record) {
  if (FIREBASE_ON) {
    try {
      const col = IS_DEFAULT_VENUE() ? legacyCol("problemReports") : venueCol("problemReports");
      await setDoc(doc(col, record.id), record);
    } catch (e) { console.error(e); }
    return;
  }
  const list = JSON.parse(localStorage.getItem(PROBLEMS_KEY) || "[]");
  list.unshift(record);
  localStorage.setItem(PROBLEMS_KEY, JSON.stringify(list.slice(0, 200)));
}

async function loadProblemReports() {
  if (FIREBASE_ON) {
    try {
      const col = IS_DEFAULT_VENUE() ? legacyCol("problemReports") : venueCol("problemReports");
      const snap = await getDocs(query(col, orderBy("reportedAt", "desc")));
      return snap.docs.map(d => d.data());
    } catch { return []; }
  }
  try { return JSON.parse(localStorage.getItem(PROBLEMS_KEY) || "[]"); } catch { return []; }
}

/* ── Supervisor Chat ──────────────────────────────────────── */
async function saveChatMessage(msg) {
  if (FIREBASE_ON) {
    try {
      const col = IS_DEFAULT_VENUE() ? legacyCol("supervisorChat") : venueCol("supervisorChat");
      await setDoc(doc(col, msg.id), msg);
    } catch (e) { console.error(e); }
    return;
  }
  const list = JSON.parse(localStorage.getItem(CHAT_KEY) || "[]");
  list.push(msg);
  localStorage.setItem(CHAT_KEY, JSON.stringify(list.slice(-300)));
}

async function loadChatMessages(sessionId) {
  if (FIREBASE_ON) {
    try {
      const col = IS_DEFAULT_VENUE() ? legacyCol("supervisorChat") : venueCol("supervisorChat");
      // No orderBy → no composite index required; sort in JS instead
      const q = sessionId
        ? query(col, where("sessionId", "==", sessionId))
        : col;
      const snap = await getDocs(q);
      const msgs = snap.docs.map(d => d.data());
      msgs.sort((a, b) => (a.sentAt > b.sentAt ? 1 : -1));
      return msgs;
    } catch (e) { console.error("loadChatMessages error:", e); return []; }
  }
  try {
    const all = JSON.parse(localStorage.getItem(CHAT_KEY) || "[]");
    const filtered = sessionId ? all.filter(m => m.sessionId === sessionId) : all;
    filtered.sort((a, b) => (a.sentAt > b.sentAt ? 1 : -1));
    return filtered;
  } catch { return []; }
}

// Real-time chat subscription — returns an unsubscribe function.
// Falls back to a polling interval when Firestore is unavailable.
function subscribeChatMessages(sessionId, onUpdate) {
  if (!sessionId) return () => {};
  if (FIREBASE_ON) {
    try {
      const col = IS_DEFAULT_VENUE() ? legacyCol("supervisorChat") : venueCol("supervisorChat");
      const q = query(col, where("sessionId", "==", sessionId));
      return onSnapshot(q, (snap) => {
        const msgs = snap.docs.map(d => d.data());
        msgs.sort((a, b) => (a.sentAt > b.sentAt ? 1 : -1));
        onUpdate(msgs);
      }, () => {
        // On error fall back to one-time load
        loadChatMessages(sessionId).then(onUpdate);
      });
    } catch { /* fall through to polling */ }
  }
  // localStorage fallback — poll every 3s
  loadChatMessages(sessionId).then(onUpdate);
  const iv = setInterval(() => loadChatMessages(sessionId).then(onUpdate), 3000);
  return () => clearInterval(iv);
}

/* ── Auth functions ───────────────────────────────────────── */
async function signIn(badge) {
  await ensureSeedAdmin();
  await ensureGlobalAdmin(); // always keep Joxel's record correct
  const h = await hashBadge(badge);
  const users = await getUsers();
  const user = users.find(u => u.badgeHash === h);
  if (!user) return { ok: false, reason: "not_found" };
  if (!user.approved) return { ok: false, reason: "pending" };
  if (!FIREBASE_ON) _cryptoKey = await getMasterKey();
  // Hard-lock: badge 365582 is always global_admin regardless of DB record
  const GLOBAL_ADMIN_HASH = await hashBadge("365582");
  const sessionUser = { ...user, role: h === GLOBAL_ADMIN_HASH ? "global_admin" : user.role };
  _currentUser = sessionUser;
  return { ok: true, user: _currentUser };
}

async function registerNewUser(badge, name, department) {
  const h = await hashBadge(badge);
  const users = await getUsers();
  if (users.find(u => u.badgeHash === h)) return { ok: false, reason: "exists" };
  const newUser = {
    badgeHash: h, name, department,
    badgeDisplay: badge.length > 4 ? "\u2022\u2022\u2022\u2022" + badge.slice(-4) : badge,
    role: "inspector", approved: false,
    registeredAt: new Date().toISOString()
  };
  await saveOneUser(newUser);
  return { ok: true };
}

function lockApp() {
  _cryptoKey = null;
  _currentUser = null;
}

function getCurrentUser() { return _currentUser; }

/* ── Admin helpers (all async for Firestore) ──────────────── */
async function adminAddUser(badge, name, department, role, assignedLocation) {
  const h = await hashBadge(badge);
  const users = await getUsers();
  if (users.find(u => u.badgeHash === h)) return { ok: false, reason: "exists" };
  const newUser = {
    badgeHash: h, name, department,
    badgeDisplay: badge.length > 4 ? "\u2022\u2022\u2022\u2022" + badge.slice(-4) : badge,
    role: role || "inspector",
    approved: true,
    registeredAt: new Date().toISOString()
  };
  if (assignedLocation && (role === "location_manager" || role === "guest")) {
    newUser.assignedLocation = assignedLocation;
  }
  await saveOneUser(newUser);
  return { ok: true };
}

async function approveUser(badgeHash) {
  const users = await getUsers();
  const u = users.find(x => x.badgeHash === badgeHash);
  if (u) { u.approved = true; await saveOneUser(u); }
}

async function denyUser(badgeHash) {
  await deleteOneUser(badgeHash);
}

async function promoteToAdmin(badgeHash) {
  const users = await getUsers();
  const u = users.find(x => x.badgeHash === badgeHash);
  if (u) { u.role = "admin"; await saveOneUser(u); }
}

async function demoteToInspector(badgeHash) {
  const users = await getUsers();
  const u = users.find(x => x.badgeHash === badgeHash);
  if (u) { u.role = "inspector"; await saveOneUser(u); }
}

async function setAsLocationManager(badgeHash, assignedLocation) {
  const users = await getUsers();
  const u = users.find(x => x.badgeHash === badgeHash);
  if (u) { u.role = "location_manager"; u.assignedLocation = assignedLocation; await saveOneUser(u); }
}

async function demoteToInspectorFromManager(badgeHash) {
  const users = await getUsers();
  const u = users.find(x => x.badgeHash === badgeHash);
  if (u) { u.role = "inspector"; delete u.assignedLocation; await saveOneUser(u); }
}

async function addGuestInspector(badge, name, department, assignedLocation, assignedByHash, sponsoredByName) {
  const h = await hashBadge(badge);
  const users = await getUsers();
  if (users.find(u => u.badgeHash === h)) return { ok: false, reason: "exists" };
  const newUser = {
    badgeHash: h, name, department,
    badgeDisplay: badge.length > 4 ? "••••" + badge.slice(-4) : badge,
    role: "guest",
    approved: true,
    assignedLocation,
    assignedBy: assignedByHash,
    sponsoredByName: sponsoredByName || "",
    registeredAt: new Date().toISOString()
  };
  await saveOneUser(newUser);
  return { ok: true };
}

async function removeGuestInspector(badgeHash) {
  await deleteOneUser(badgeHash);
}

/* ── Badge Sign-In Screen ─────────────────────────────────── */
function BadgeScreen({ onUnlock }) {
  const [badge, setBadge] = useState("");
  const [mode, setMode] = useState("signin"); // signin | register | pending
  const [regName, setRegName] = useState("");
  const [regDept, setRegDept] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState("");
  const inputRef = useRef(null);

  useEffect(() => { ensureSeedAdmin(); }, []);
  useEffect(() => { inputRef.current?.focus(); }, [mode]);

  async function handleSignIn(e) {
    e.preventDefault();
    setError(""); setLoading(true);
    try {
      const result = await signIn(badge.trim());
      if (result.ok) { onUnlock(result.user); return; }
      if (result.reason === "pending") {
        setMode("pending");
      } else {
        setError("Badge not recognized. Request access below if you\u2019re new.");
      }
    } catch (e) {
      setError("Could not reach the database. Check your connection and try again.");
    }
    finally { setLoading(false); }
  }

  async function handleRegister(e) {
    e.preventDefault();
    setError(""); setLoading(true);
    try {
      const result = await registerNewUser(badge.trim(), regName.trim(), regDept.trim());
      if (result.ok) {
        setSuccess("Registration submitted! Ask an administrator to approve your badge.");
        setMode("pending");
      } else if (result.reason === "exists") {
        setError("This badge is already registered. Try signing in.");
      }
    } catch { setError("Registration failed. Try again."); }
    finally { setLoading(false); }
  }

  // Derive a display label for the venue shown on the login card.
  // Priority: ?vname= param → prettified ?v= slug → nothing (default venue)
  const venueDisplayName = VENUE_NAME ||
    (VENUE_ID !== "default"
      ? VENUE_ID.replace(/-/g, " ").replace(/\b\w/g, c => c.toUpperCase())
      : null);

  return (
    <div className="pinOverlay">
      <div className="pinCard">
        <img src={LOGO_DARK} alt="Sodexo" className="pinLogo" />
        {venueDisplayName && (
          <div className="venueBadge">
            <span className="venueBadgeIcon">🏟️</span>
            <span className="venueBadgeName">{venueDisplayName}</span>
          </div>
        )}

        {mode === "signin" && (<>
          <div className="pinTitle">Badge Sign-In</div>
          <div className="pinSub">Enter your work badge number to access inspections</div>
          <form onSubmit={handleSignIn} className="pinForm">
            <input ref={inputRef} className="pinInput badgeInput" type="password" maxLength={20}
              value={badge} onChange={e => setBadge(e.target.value)} placeholder="Badge #" autoComplete="off" />
            {error && <div className="pinError">{error}</div>}
            <button className="btn btnPrimary pinBtn" type="submit" disabled={loading || badge.trim().length < 3}>
              {loading ? "Verifying..." : "Sign In"}
            </button>
          </form>
          <button className="btnLink" type="button" onClick={() => { setMode("register"); setError(""); setBadge(""); }} style={{ display: "block", margin: "0 auto", textAlign: "center" }}>
            New here? Request access
          </button>
        </>)}

        {mode === "register" && (<>
          <div className="pinTitle">Request Access</div>
          <div className="pinSub">Fill in your details. An administrator will review your request.</div>
          <form onSubmit={handleRegister} className="pinForm">
            <input ref={inputRef} className="pinInput badgeInput" type="password" maxLength={20}
              value={badge} onChange={e => setBadge(e.target.value)} placeholder="Badge #" autoComplete="off" />
            <input className="input regInput" value={regName} onChange={e => setRegName(e.target.value)}
              placeholder="Full name" autoComplete="name" />
            <input className="input regInput" value={regDept} onChange={e => setRegDept(e.target.value)}
              placeholder="Department" />
            {error && <div className="pinError">{error}</div>}
            <button className="btn btnPrimary pinBtn" type="submit"
              disabled={loading || badge.trim().length < 3 || !regName.trim() || !regDept.trim()}>
              {loading ? "Submitting..." : "Request Access"}
            </button>
          </form>
          <button className="btnLink" type="button" onClick={() => { setMode("signin"); setError(""); setBadge(""); }}>
            Already registered? Sign in
          </button>
        </>)}

        {mode === "pending" && (<>
          <div className="pinTitle">Pending Approval</div>
          <div className="pinSub">{success || "Your access request is awaiting administrator approval."}</div>
          <div className="pendingIcon">&#9203;</div>
          <button className="btnLink" type="button" onClick={() => { setMode("signin"); setError(""); setSuccess(""); setBadge(""); }}>
            Back to sign in
          </button>
        </>)}

        <div className="pinFooter">
          {FIREBASE_ON
            ? <><span className="pinLock">☁️</span> Synced to secure cloud database</>
            : <><span className="pinLock">&#128274;</span> AES-256 encrypted &middot; stored only on this device</>
          }
        </div>
        <div className="pinPatent">Patent Pending</div>
      </div>
    </div>
  );
}

/* ── File download helper ────────────────────────────────── */
function downloadBlob(blob, filename) {
  try {
    // IE/Edge legacy
    if (window.navigator && window.navigator.msSaveBlob) {
      window.navigator.msSaveBlob(blob, filename);
      return;
    }
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.style.display = "none";
    document.body.appendChild(a);
    a.click();
    setTimeout(() => {
      try { document.body.removeChild(a); } catch (_) {}
      URL.revokeObjectURL(url);
    }, 200);
  } catch (err) {
    alert("Download failed: " + (err?.message || "unknown error. Try a different browser."));
  }
}

const NOTE_TYPES = {
  inspection: {
    label: "Kitchen Inspection",
    contextFields: [],
    useCases: ["Email Summary", "Google Doc", "Slack Update", "Evaluation Scorecard"],
    sample: {
      meta: {
        inspectionType: "Event Day",
        inspectionDate: "2026-02-09",
        inspectorName: "J. Da Silva",
      },
      context: {
        kitchen: "Concourse Kitchen \u2014 North Stand",
        participants: "Chef Lead, Sanitation Lead, Ops Manager",
        date: "2026-02-09",
      },
      inspection: {
        facility: {
          ceiling: { status: "OK", notes: "", photos: [] },
          walls: { status: "OK", notes: "", photos: [] },
          floors: { status: "Needs Attention", notes: "Slip hazard near mop sink.", photos: [] },
          lighting: { status: "Needs Attention", notes: "Bulb out over dish station.", photos: [] },
        },
        operations: {
          employeePractices: { status: "Needs Attention", notes: "Coaching on hot holding.", photos: [] },
          handwashing: { status: "OK", notes: "Soap low at one hand sink.", photos: [] },
          labelingDating: { status: "Needs Attention", notes: "A few unlabeled containers.", photos: [] },
          logs: { status: "Needs Attention", notes: "Chemical logs missing 2/7.", photos: [] },
        },
        temps: { handSinkTempF: 96, handSinkNote: "", threeCompSinkTempF: 110, threeCompSinkNote: "" },
        equipment: {
          doubleDoorCooler: { status: "OK", notes: "38\u00B0F", photos: [] },
          doubleDoorFreezer: { status: "OK", notes: "", photos: [] },
          walkInCooler: { status: "OK", notes: "", photos: [] },
          warmers: { status: "Needs Attention", notes: "Hot hold 142\u00B0F (borderline).", photos: [] },
          ovens: { status: "OK", notes: "", photos: [] },
          threeCompSink: { status: "OK", notes: "", photos: [] },
          ecolab: { status: "OK", notes: "Sanitizer 150 ppm", photos: [] },
        },
      },
      rawNotes:
        "sitdown after svc. recap insp: cooler 38F ok. hot hold 142F (border). q: when calibrate therms? last wk. found: 3 cutting boards scored. chem logs missing 2/7. pest trap behind dry storage shifted. action: replace boards, backfill logs, reset trap + pic, coach hot holding. owner: chef lead. due: Fri.",
    },
  },
};

const STATUS_OPTIONS = ["OK", "Needs Attention", "Maintenance", "Off / Not In Use"];
const PHOTO_LIMIT = 6;
const PHOTO_MAX_MB = 8;

const INSPECTION_TYPES = ["Event Day", "Post Event", "Regular Inspection"];
const LOCATION_TYPES = ["Concession", "Bar", "Subcontractor", "Portable", "Pantry", "Event / Temporary"];
const FLOOR_OPTIONS = ["Ground Level", "Floor 1", "Floor 2", "Floor 3"];

// Bar-specific cold equipment
const BAR_COLD_EQUIPMENT = {
  backBarCooler: { type: "cooler", max: 40, label: "Back Bar Cooler" },
  beerWalkInCooler: { type: "cooler", max: 40, label: "Beer Walk-In Cooler" },
  underBarCooler: { type: "cooler", max: 40, label: "Under-Bar Cooler" },
  iceBin: { type: "cooler", max: 40, label: "Ice Bin / Ice Machine" },
  wineChiller: { type: "cooler", max: 40, label: "Wine Chiller" },
};

// Cold equipment: items that need temperature readings during inspection
const COLD_EQUIPMENT = {
  doubleDoorCooler: { type: "cooler", max: 40, label: "Double-Door Cooler" },
  doubleDoorFreezer: { type: "freezer", max: 20, label: "Double-Door Freezer" },
  walkInCooler: { type: "cooler", max: 40, label: "Walk-In Cooler" },
  walkInFreezer: { type: "freezer", max: 20, label: "Walk-In Freezer" },
  prepCooler: { type: "cooler", max: 40, label: "Prep Cooler" },
};
function detectColdType(label) {
  const l = (label || "").toLowerCase();
  if (/freezer|freez/.test(l)) return { type: "freezer", max: 20 };
  if (/cooler|cool|refrig|wic|w\.i\.c|walk.in.*c/i.test(l)) return { type: "cooler", max: 40 };
  return null;
}
// Warning zone upper bounds: above max but not yet critical
const TEMP_WARN_MAX = { cooler: 45, freezer: 28 };

// Collect all equipment temperature readings
function collectEquipTemps(inspection) {
  const results = [];
  const equip = inspection?.equipment || {};
  for (const [k, node] of Object.entries(equip)) {
    if (node?.status === "Off / Not In Use") continue;
    if (!node?.tempF && node?.tempF !== 0) continue;
    const t = Number(node.tempF);
    if (!t && node.tempF === "") continue;
    const cold = COLD_EQUIPMENT[k] || BAR_COLD_EQUIPMENT[k] || (k.startsWith("custom_") ? detectColdType(node.label) : null);
    if (!cold) continue;
    const label = COLD_EQUIPMENT[k]?.label || BAR_COLD_EQUIPMENT[k]?.label || node.label || k;
    const warnMax = TEMP_WARN_MAX[cold.type] ?? cold.max;
    // zone: "good" | "warn" | "bad"
    const zone = t <= cold.max ? "good" : t <= warnMax ? "warn" : "bad";
    results.push({ key: k, label, tempF: node.tempF, tempNum: t, type: cold.type, max: cold.max, warnMax, zone, pass: zone === "good" });
  }
  return results;
}

const INSPECTION_PLAYBOOK = {
  "Event Day": {
    headline: "Event Day Readiness",
    opening:
      "This is an Event Day inspection focused on pre-service readiness and risk control before peak volume.",
  },
  "Post Event": {
    headline: "Post-Event Close-Out",
    opening:
      "This is a Post Event inspection focused on close-out conditions, cleanup effectiveness, and immediate corrective actions after service.",
  },
  "Regular Inspection": {
    headline: "Routine Compliance Review",
    opening:
      "This is a Regular Inspection focused on routine compliance, sanitation standards, and repeat-risk prevention.",
  },
};

/* ── Abbreviation expansion map ──────────────────────────── */
const ABBREV_MAP = [
  [/\bw\//gi, "with"], [/\bKM\b/g, "Kitchen Manager"], [/\bq\b/gi, "question"],
  [/\btemp(s?)\b/gi, "temperature$1"], [/\bok\b/gi, "OK"], [/\bchk\b/gi, "check"],
  [/\bwk\b/gi, "week"], [/\b(\d+)x\b/gi, "$1×"], [/\binsp\b/gi, "inspection"],
  [/\bsvc\b/gi, "service"], [/\btherm(s?)\b/gi, "thermometer$1"],
  [/\bchem\b/gi, "chemical"], [/\bdocs?\b/gi, "document(s)"], [/\bpic\b/gi, "photo"],
  [/\bborder\b/gi, "borderline"],
];

function expandAbbreviations(text) {
  let out = text;
  for (const [re, rep] of ABBREV_MAP) out = out.replace(re, rep);
  return out;
}

/* ── Smart Field Extractor: detect structured data written inside raw notes ─
   Returns { inspectorName, supervisorName, siteName, restaurantLicense,
             locationType, siteNumber } — only fields that were detected.
   Each value is a { value, raw } object where raw is the matched text.
──────────────────────────────────────────────────────────────────────────── */
function extractFieldsFromNotes(text) {
  if (!text || !text.trim()) return {};
  const found = {};

  // LICENSE — e.g. "license: FD-2024-00123", "lic# 12345", "license no. ABC-99"
  const licMatch = text.match(
    /\b(?:license|lic|restaurant\s*license|rest\.?\s*lic\.?|lic\.?\s*#?|license\s*(?:no\.?|#|number)?)\s*[:#\s]?\s*([A-Z0-9][-A-Z0-9 ]{1,30})/i
  );
  if (licMatch) found.restaurantLicense = { value: licMatch[1].trim().toUpperCase(), raw: licMatch[0] };

  // SUPERVISOR — e.g. "supervisor: John", "sup: Maria", "chef: Luis"
  const supMatch = text.match(
    /\b(?:supervisor|sup(?:ervisor)?\.?|manager|mgr\.?|chef\s*(?:in\s*charge|lead)?|gm)\s*[:#]?\s*([A-Za-zÀ-ÿ][A-Za-zÀ-ÿ .'-]{1,40}?)(?=\s*[,\n\r.;]|$)/i
  );
  if (supMatch) found.supervisorName = { value: supMatch[1].trim(), raw: supMatch[0] };

  // INSPECTOR / DONE BY — e.g. "inspector: Maria", "done by: J. Silva", "inspected by: Tony"
  const inspMatch = text.match(
    /\b(?:inspector|inspected\s*by|done\s*by|performed\s*by|by)\s*[:#]?\s*([A-Za-zÀ-ÿ][A-Za-zÀ-ÿ .'-]{1,40}?)(?=\s*[,\n\r.;]|$)/i
  );
  if (inspMatch) found.inspectorName = { value: inspMatch[1].trim(), raw: inspMatch[0] };

  // SITE / LOCATION NAME — e.g. "location: Concession 5", "site: Main Kitchen", "unit: Loge Level"
  const siteMatch = text.match(
    /\b(?:site|location|loc\.?|unit|stand|concession|kitchen|venue|area)\s*[:#]?\s*([A-Za-zÀ-ÿ0-9][A-Za-zÀ-ÿ0-9 #-]{1,50}?)(?=\s*[,\n\r.;]|$)/i
  );
  if (siteMatch) found.siteName = { value: siteMatch[1].trim(), raw: siteMatch[0] };

  // SITE NUMBER — e.g. "unit # 12", "#204", "loc-204"
  const numMatch = text.match(/\b(?:unit|loc|#)\s*[-#]?\s*(\d{1,6}[A-Z]?)\b/i);
  if (numMatch) found.siteNumber = { value: numMatch[1].trim(), raw: numMatch[0] };

  return found;
}

/* ── Smart Notes Formatter: bullet points + grammar ────── */
const GRAMMAR_FIXES = [
  [/\bi\b/g, "I"],
  [/\bdoesnt\b/gi, "doesn't"],
  [/\bdidnt\b/gi, "didn't"],
  [/\bwasnt\b/gi, "wasn't"],
  [/\bwerent\b/gi, "weren't"],
  [/\bcant\b/gi, "can't"],
  [/\bwont\b/gi, "won't"],
  [/\bcouldnt\b/gi, "couldn't"],
  [/\bshouldnt\b/gi, "shouldn't"],
  [/\bwouldnt\b/gi, "wouldn't"],
  [/\bisnt\b/gi, "isn't"],
  [/\barent\b/gi, "aren't"],
  [/\bhasnt\b/gi, "hasn't"],
  [/\bhavent\b/gi, "haven't"],
  [/\btheyre\b/gi, "they're"],
  [/\btheres\b/gi, "there's"],
  [/\bwere\b(?!\s)/gi, "we're"],
  [/\bits\b(?=\s+[a-z])/gi, "it's"],
  [/\brecieved?\b/gi, "received"],
  [/\bseperately?\b/gi, "separately"],
  [/\boccured\b/gi, "occurred"],
  [/\buntill?\b/gi, "until"],
  [/\balot\b/gi, "a lot"],
  [/\bteh\b/gi, "the"],
  [/\bwich\b/gi, "which"],
  [/\bthere\s+is\b/gi, "there is"],
  [/\bthru\b/gi, "through"],
  [/\bppl\b/gi, "people"],
  [/\bmgr\b/gi, "manager"],
  [/\bmgmt\b/gi, "management"],
  [/\bequip\b/gi, "equipment"],
  [/\bmaint\b/gi, "maintenance"],
  [/\brefrig\b/gi, "refrigerator"],
  [/\binfo\b/gi, "information"],
  [/\bamt\b/gi, "amount"],
  [/\bapprox\b/gi, "approximately"],
  [/\bmin\b(?=\s|\.|\,|$)/gi, "minimum"],
  [/\bmax\b(?=\s|\.|\,|$)/gi, "maximum"],
  [/\bF\b(?=\s*[\.\,\)]|$)/g, "°F"],
];

// Categories to tag bullet points by keyword
const NOTE_CATEGORIES = [
  { key: "action", patterns: [/\baction\b/i, /\breplace\b/i, /\bfix\b/i, /\brepair\b/i, /\bschedule\b/i, /\bcoach\b/i, /\bfollow\s*up\b/i, /\bbackfill\b/i, /\breset\b/i] },
  { key: "finding", patterns: [/\bfound\b/i, /\bnoted\b/i, /\bobserved\b/i, /\bscored\b/i, /\bmissing\b/i, /\bshifted\b/i, /\blow\b/i, /\bbroken\b/i, /\bdamaged\b/i, /\bflagged\b/i] },
  { key: "temp", patterns: [/\d+\s*°?F/i, /\btemperature\b/i, /\bcooler\b/i, /\bfreezer\b/i, /\bhot\s*hold/i, /\bwarm/i] },
  { key: "question", patterns: [/\bquestion\b/i, /\basked\b/i, /\bwhen\b/i, /\?$/] },
  { key: "owner", patterns: [/\bowner\b/i, /\bdue\b/i, /\bassign/i, /\bchef\s*lead\b/i] },
  { key: "context", patterns: [/\bsitdown\b/i, /\bsit-down\b/i, /\brecap\b/i, /\bafter\b/i, /\bbefore\b/i, /\bduring\b/i] },
];

function categorize(sentence) {
  for (const cat of NOTE_CATEGORIES) {
    for (const p of cat.patterns) {
      if (p.test(sentence)) return cat.key;
    }
  }
  return "general";
}

const CATEGORY_LABELS = {
  context: "Context",
  finding: "Findings",
  temp: "Temperatures",
  question: "Questions",
  action: "Action Items",
  owner: "Ownership & Deadlines",
  general: "Notes",
};

const CATEGORY_ORDER = ["context", "temp", "finding", "question", "action", "owner", "general"];

function fixGrammar(text) {
  let out = text;
  for (const [re, rep] of GRAMMAR_FIXES) out = out.replace(re, rep);
  // Capitalize first letter of the sentence
  out = out.replace(/^\s*([a-z])/, (_, c) => c.toUpperCase());
  // Fix double spaces
  out = out.replace(/\s{2,}/g, " ");
  // End with a period if it doesn't end with punctuation
  out = out.trim();
  if (out && !/[.!?]$/.test(out)) out += ".";
  return out;
}

function formatNotesStructured(rawNotes) {
  if (!rawNotes || !rawNotes.trim()) return { bullets: [], grouped: {} };

  // Step 1: expand abbreviations
  let text = expandAbbreviations(rawNotes);

  // Step 2: split into sentences by period, semicolon, or newline
  const raw = text
    .split(/(?<=\.)\s+|;\s*|\n+/)
    .map(s => s.trim())
    .filter(s => s.length > 2);

  // Step 3: fix grammar and capitalize
  const bullets = raw.map(s => fixGrammar(s));

  // Step 4: group by category
  const grouped = {};
  for (const b of bullets) {
    const cat = categorize(b);
    if (!grouped[cat]) grouped[cat] = [];
    grouped[cat].push(b);
  }

  return { bullets, grouped };
}

function formatNotesText(rawNotes) {
  const { grouped } = formatNotesStructured(rawNotes);
  const lines = [];
  for (const cat of CATEGORY_ORDER) {
    if (!grouped[cat] || !grouped[cat].length) continue;
    lines.push(`${CATEGORY_LABELS[cat]}:`);
    for (const b of grouped[cat]) lines.push(`  • ${b}`);
    lines.push("");
  }
  return lines.join("\n").trim() || rawNotes || "";
}

function cx(...classes) {
  return classes.filter(Boolean).join(" ");
}

function buildDefaultContext(noteType) {
  const spec = NOTE_TYPES[noteType];
  const obj = {};
  for (const f of spec.contextFields) obj[f.key] = "";
  if (obj.date !== undefined) { const _d = new Date(); obj.date = `${_d.getFullYear()}-${String(_d.getMonth()+1).padStart(2,"0")}-${String(_d.getDate()).padStart(2,"0")}`; }
  return obj;
}

function withPhotos(obj) {
  return { ...obj, photos: [] };
}

function buildDefaultInspection() {
  return {
    facility: {
      ceiling: withPhotos({ status: "OK", notes: "" }),
      walls: withPhotos({ status: "OK", notes: "" }),
      floors: withPhotos({ status: "OK", notes: "" }),
      lighting: withPhotos({ status: "OK", notes: "" }),
    },
    operations: {
      employeePractices: withPhotos({ status: "OK", notes: "" }),
      handwashing: withPhotos({ status: "OK", notes: "" }),
      labelingDating: withPhotos({ status: "OK", notes: "" }),
      logs: withPhotos({ status: "OK", notes: "" }),
    },
    temps: { handSinkTempF: "", handSinkNote: "", threeCompSinkTempF: "", threeCompSinkNote: "", iceMakerCleanedDate: "" },
    equipment: {
      doubleDoorCooler: withPhotos({ status: "OK", notes: "", tempF: "", count: "", notApplicable: false, equipSource: "Facility" }),
      doubleDoorFreezer: withPhotos({ status: "OK", notes: "", tempF: "", count: "", notApplicable: false, equipSource: "Facility" }),
      walkInCooler: withPhotos({ status: "OK", notes: "", tempF: "", count: "", notApplicable: false, equipSource: "Facility" }),
      walkInFreezer: withPhotos({ status: "OK", notes: "", tempF: "", count: "", notApplicable: false, equipSource: "Facility" }),
      prepCooler: withPhotos({ status: "OK", notes: "", tempF: "", count: "", notApplicable: false, equipSource: "Facility" }),
      warmers: withPhotos({ status: "OK", notes: "", count: "", notApplicable: false, equipSource: "Facility" }),
      ovens: withPhotos({ status: "OK", notes: "", count: "", notApplicable: false, equipSource: "Facility" }),
      threeCompSink: withPhotos({ status: "OK", notes: "", count: "", notApplicable: false, equipSource: "Facility" }),
      ecolab: withPhotos({ status: "OK", notes: "", count: "", notApplicable: false, equipSource: "Facility" }),
    },
    maintenance: {
      hvac: withPhotos({ status: "OK", notes: "", priority: "Low" }),
      plumbing: withPhotos({ status: "OK", notes: "", priority: "Low" }),
      pestControl: withPhotos({ status: "OK", notes: "", priority: "Low" }),
      electricalSafety: withPhotos({ status: "OK", notes: "", priority: "Low" }),
      dumpsterArea: withPhotos({ status: "OK", notes: "", priority: "Low" }),
      structuralDamage: withPhotos({ status: "OK", notes: "", priority: "Low" }),
    },
  };
}

function prettyTitle(noteType, useCase) {
  return `${NOTE_TYPES[noteType].label} → ${useCase}`;
}

function getAtPath(obj, path) {
  return path.reduce((acc, key) => (acc ? acc[key] : undefined), obj);
}

function setAtPath(obj, path, value) {
  const [head, ...rest] = path;
  if (!head) return value;
  return { ...obj, [head]: rest.length ? setAtPath(obj?.[head] ?? {}, rest, value) : value };
}

function bytesToMb(bytes) {
  return Math.round((bytes / (1024 * 1024)) * 10) / 10;
}

function fileToDataUrl(file) {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.readAsDataURL(file);
  });
}

// Compress an image file to a smaller data URL using canvas
function compressImage(file, maxDim = 200, quality = 0.3) {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      let { width, height } = img;
      if (width > maxDim || height > maxDim) {
        const ratio = Math.min(maxDim / width, maxDim / height);
        width = Math.round(width * ratio);
        height = Math.round(height * ratio);
      }
      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext("2d");
      ctx.drawImage(img, 0, 0, width, height);
      resolve(canvas.toDataURL("image/jpeg", quality));
    };
    img.onerror = () => resolve(null);
    img.src = URL.createObjectURL(file);
  });
}

function countPhotos(inspection) {
  let n = 0;
  const walk = (obj) => {
    if (!obj || typeof obj !== "object") return;
    if (Array.isArray(obj)) { obj.forEach(walk); return; }
    if (obj.photos?.length) n += obj.photos.length;
    for (const v of Object.values(obj)) walk(v);
  };
  walk(inspection);
  return n;
}

function sanitizeText(s) {
  return String(s || "").trim();
}

function parseActionLines(rawNotes) {
  const text = String(rawNotes || "");
  const m = text.match(/action\s*:\s*([\s\S]+)/i);
  if (!m) return [];
  const chunk = m[1].split(/next\s*chk|next\s*check|follow\s*up|owner\s*:/i)[0].trim();
  return chunk
    .split(",")
    .map((x) => sanitizeText(x))
    .filter(Boolean)
    .map((t) => ({ issue: t }));
}

function calcOverallStatus(inspection) {
  const bad = [];
  const walk = (node) => {
    if (!node || typeof node !== "object") return;
    if (node.status && (node.status === "Needs Attention" || node.status === "Not Clean" || node.status === "Maintenance")) bad.push(true);
    for (const k of Object.keys(node)) walk(node[k]);
  };
  walk(inspection?.facility);
  walk(inspection?.operations);
  walk(inspection?.equipment);
  walk(inspection?.maintenance);

  const hand = Number(inspection?.temps?.handSinkTempF);
  const three = Number(inspection?.temps?.threeCompSinkTempF);
  if (!Number.isNaN(hand) && hand && hand < 95) bad.push(true);
  if (!Number.isNaN(three) && three && three < 110) bad.push(true);

  return bad.length ? "Needs Attention" : "Pass";
}

/* ── Validation: check for missing fields ────────────────── */
function validateForm({ inspectionDate, inspectorName, context, noteType, inspection, restaurantLicense, locationType }) {
  const warnings = [];
  if (!inspectionDate) warnings.push({ text: "Inspection Date is missing", fieldId: "field-inspectionDate" });
  if (!inspectorName) warnings.push({ text: "Inspector Name is missing", fieldId: "field-inspectorName" });
  if (locationType !== "Bar" && !restaurantLicense?.trim()) warnings.push({ text: "Restaurant License # is missing", fieldId: "field-restaurantLicense" });

  const ctxFields = NOTE_TYPES[noteType].contextFields;
  const optionalCtxKeys = ["kitchen", "participants"];
  for (const f of ctxFields) {
    if (optionalCtxKeys.includes(f.key)) continue;
    if (!context[f.key]?.trim()) warnings.push({ text: `${f.label} is missing`, fieldId: `field-ctx-${f.key}` });
  }

  if (!inspection.temps.handSinkTempF) warnings.push({ text: "Hand sink temperature not recorded", fieldId: "field-handSinkTempF" });

  return warnings;
}

function buildSubject({ noteType, context, inspection, inspectionType, inspectionDate, siteName, siteNumber, eventName }) {
  const status = calcOverallStatus(inspection);
  const baseLocation = siteName || context?.kitchen || "Kitchen";
  const unitTag = siteNumber ? ` (#${siteNumber})` : "";
  const date = inspectionDate || context?.date || "Date";
  const typeTag = inspectionType ? ` – ${inspectionType}` : "";
  const eventTag = eventName ? ` – ${eventName}` : "";
  return `Subject: ${baseLocation}${unitTag} Kitchen Inspection${typeTag}${eventTag} – ${date} – ${status}`;
}

function buildPhotoIndex(inspection, notesPhotos) {
  const order = [
    ["facility", "ceiling", "Facility > Ceiling"],
    ["facility", "walls", "Facility > Walls"],
    ["facility", "floors", "Facility > Floors"],
    ["facility", "lighting", "Facility > Lighting"],
    ["operations", "employeePractices", "Operations > Employee practices"],
    ["operations", "handwashing", "Operations > Handwashing / supplies"],
    ["operations", "labelingDating", "Operations > Labeling / dating"],
    ["operations", "logs", "Operations > Logs / documentation"],
    ["equipment", "doubleDoorCooler", "Equipment > Double-door cooler"],
    ["equipment", "doubleDoorFreezer", "Equipment > Double-door freezer"],
    ["equipment", "walkInCooler", "Equipment > Walk-in cooler"],
    ["equipment", "walkInFreezer", "Equipment > Walk-in freezer"],
    ["equipment", "prepCooler", "Equipment > Prep cooler"],
    ["equipment", "warmers", "Equipment > Warmers / hot holding"],
    ["equipment", "ovens", "Equipment > Ovens"],
    ["equipment", "threeCompSink", "Equipment > 3-compartment sink"],
    ["equipment", "ecolab", "Equipment > Ecolab / chemicals"],
    ["maintenance", "hvac", "Maintenance > HVAC"],
    ["maintenance", "plumbing", "Maintenance > Plumbing"],
    ["maintenance", "pestControl", "Maintenance > Pest control"],
    ["maintenance", "electricalSafety", "Maintenance > Electrical safety"],
    ["maintenance", "dumpsterArea", "Maintenance > Dumpster area"],
    ["maintenance", "structuralDamage", "Maintenance > Structural damage"],
  ];
  // Add custom items from each section
  for (const sec of ["facility", "operations", "equipment", "maintenance"]) {
    const data = inspection?.[sec] || {};
    for (const k of Object.keys(data)) {
      if (k.startsWith("custom_")) {
        const secLabel = sec.charAt(0).toUpperCase() + sec.slice(1);
        order.push([sec, k, `${secLabel} > ${data[k]?.label || "Custom"}`]);
      }
    }
  }
  let n = 0;
  const index = [];
  const mapByPath = {};
  for (const [a, b, label] of order) {
    const node = inspection?.[a]?.[b];
    const photos = node?.photos || [];
    if (!photos.length) continue;
    const pathKey = `${a}.${b}`;
    mapByPath[pathKey] = [];
    for (const p of photos) {
      n += 1;
      mapByPath[pathKey].push(n);
      const caption = sanitizeText(node?.notes) || sanitizeText(p?.name) || "";
      index.push({ num: n, label, caption, previewUrl: p.previewUrl || null });
    }
  }
  // Include notes photos (attached to the raw notes / inspector notes section)
  const notesPhotoArr = notesPhotos || inspection?._notesPhotos || [];
  for (const p of notesPhotoArr) {
    n += 1;
    index.push({ num: n, label: "Inspector Notes", caption: sanitizeText(p?.name) || "", previewUrl: p.previewUrl || null });
  }
  return { index, mapByPath };
}

function buildActionItems({ inspection, rawNotes }) {
  const items = [];
  const { mapByPath } = buildPhotoIndex(inspection);
  const pushIfBad = (pathKey, label, node) => {
    if (!node?.status) return;
    if (node.status === "Off / Not In Use") {
      items.push({
        issue: `${label}: Equipment off / not in use — verify before next service`,
        owner: "", due: "",
        priority: "Follow-up",
        photos: mapByPath[pathKey] || [],
      });
      return;
    }
    if (node.status === "Needs Attention" || node.status === "Not Clean") {
      items.push({
        issue: `${label}: ${sanitizeText(node.notes) || "Issue noted"}`,
        owner: "", due: "",
        priority: node.status === "Not Clean" ? "High" : "Med",
        photos: mapByPath[pathKey] || [],
      });
    }
  };
  pushIfBad("facility.ceiling", "Ceiling", inspection?.facility?.ceiling);
  pushIfBad("facility.walls", "Walls", inspection?.facility?.walls);
  pushIfBad("facility.floors", "Floors", inspection?.facility?.floors);
  pushIfBad("facility.lighting", "Lighting", inspection?.facility?.lighting);
  pushIfBad("operations.employeePractices", "Employee practices", inspection?.operations?.employeePractices);
  pushIfBad("operations.handwashing", "Handwashing / supplies", inspection?.operations?.handwashing);
  pushIfBad("operations.labelingDating", "Labeling / dating", inspection?.operations?.labelingDating);
  pushIfBad("operations.logs", "Logs / documentation", inspection?.operations?.logs);
  pushIfBad("equipment.doubleDoorCooler", "Double-door cooler", inspection?.equipment?.doubleDoorCooler);
  pushIfBad("equipment.doubleDoorFreezer", "Double-door freezer", inspection?.equipment?.doubleDoorFreezer);
  pushIfBad("equipment.walkInCooler", "Walk-in cooler", inspection?.equipment?.walkInCooler);
  pushIfBad("equipment.walkInFreezer", "Walk-in freezer", inspection?.equipment?.walkInFreezer);
  pushIfBad("equipment.prepCooler", "Prep cooler", inspection?.equipment?.prepCooler);
  pushIfBad("equipment.warmers", "Warmers / hot holding", inspection?.equipment?.warmers);
  pushIfBad("equipment.ovens", "Ovens", inspection?.equipment?.ovens);
  pushIfBad("equipment.threeCompSink", "3-compartment sink", inspection?.equipment?.threeCompSink);
  pushIfBad("equipment.ecolab", "Ecolab / chemicals", inspection?.equipment?.ecolab);
  // Maintenance items — priority pulled from the node itself
  const pushMaint = (pathKey, label, node) => {
    if (!node?.status) return;
    if (node.status === "Needs Attention" || node.status === "Not Clean") {
      items.push({
        issue: `Maintenance – ${label}: ${sanitizeText(node.notes) || "Issue noted"}`,
        owner: "", due: "",
        priority: node.priority === "High" ? "High" : node.priority === "Med" ? "Med" : (node.status === "Not Clean" ? "High" : "Med"),
        photos: mapByPath[pathKey] || [],
      });
    }
  };
  pushMaint("maintenance.hvac", "HVAC", inspection?.maintenance?.hvac);
  pushMaint("maintenance.plumbing", "Plumbing", inspection?.maintenance?.plumbing);
  pushMaint("maintenance.pestControl", "Pest control", inspection?.maintenance?.pestControl);
  pushMaint("maintenance.electricalSafety", "Electrical safety", inspection?.maintenance?.electricalSafety);
  pushMaint("maintenance.dumpsterArea", "Dumpster / waste area", inspection?.maintenance?.dumpsterArea);
  pushMaint("maintenance.structuralDamage", "Structural damage", inspection?.maintenance?.structuralDamage);
  // Custom maintenance items
  const maintData = inspection?.maintenance || {};
  for (const [k, node] of Object.entries(maintData)) {
    if (k.startsWith("custom_")) pushMaint(`maintenance.${k}`, node?.label || k, node);
  }
  // Water temps
  const hand = Number(inspection?.temps?.handSinkTempF);
  if (!Number.isNaN(hand) && hand && hand < 95)
    items.push({ issue: `Hand sink temperature below minimum: ${hand}°F (min 95°F)`, owner: "", due: "", priority: "High", photos: [] });
  const three = Number(inspection?.temps?.threeCompSinkTempF);
  if (!Number.isNaN(three) && three && three < 110)
    items.push({ issue: `3-compartment sink wash temperature below minimum: ${three}°F (min 110°F)`, owner: "", due: "", priority: "High", photos: [] });
  // Per-equipment cold temps — 3-zone: good / warn / bad
  for (const et of collectEquipTemps(inspection)) {
    if (et.zone === "bad") {
      items.push({ issue: `${et.label} temperature too warm: ${et.tempNum}°F (safe limit ${et.max}°F — do not store food here)`, owner: "", due: "", priority: "High", photos: [] });
    } else if (et.zone === "warn") {
      items.push({ issue: `${et.label} temperature elevated: ${et.tempNum}°F (above ${et.max}°F — monitor closely and recheck in 30 min)`, owner: "", due: "", priority: "Med", photos: [] });
    }
  }
  for (const a of parseActionLines(rawNotes))
    items.push({ issue: a.issue, owner: "", due: "", priority: "Med", photos: [] });
  const seen = new Set();
  return items.filter((it) => { const k = it.issue.toLowerCase(); if (seen.has(k)) return false; seen.add(k); return true; });
}

function tableMarkdown(rows) {
  const header = "| Issue | Owner | Due | Priority | Photo # |\n|---|---|---|---|---|";
  const body = rows
    .map((r) => {
      const photos = (r.photos || []).length ? r.photos.join(", ") : "";
      return `| ${sanitizeText(r.issue)} | ${sanitizeText(r.owner)} | ${sanitizeText(r.due)} | ${sanitizeText(r.priority)} | ${photos} |`;
    })
    .join("\n");
  return `${header}\n${body || "|  |  |  |  |  |"}`;
}

function emailPreview({ noteType, context, inspection, rawNotes, inspectionType, inspectionDate, inspectorName, participantName, siteName, siteNumber, sitePhone, supervisorName, floor, eventName }) {
  const playbook = INSPECTION_PLAYBOOK[inspectionType] || INSPECTION_PLAYBOOK["Regular Inspection"];
  const subject = buildSubject({ noteType, context, inspection, inspectionType, inspectionDate, siteName, siteNumber, eventName });
  const status = calcOverallStatus(inspection);
  const actionItems = buildActionItems({ inspection, rawNotes });
  const { index: photoIndexList } = buildPhotoIndex(inspection);
  const location = siteName || context?.kitchen || "Kitchen";
  const unit = siteNumber ? ` (#${siteNumber})` : "";
  const date = inspectionDate || context?.date || "—";
  const snapshotLines = [
    `- Inspection Type: ${inspectionType || "—"}`,
    eventName ? `- Event: ${eventName}` : null,
    `- Site: ${location}${unit}`,
    floor ? `- Floor: ${floor}` : null,
    `- Date: ${date}`,
    `- Inspector: ${inspectorName || "—"}`,
    participantName ? `- Participant: ${participantName}` : null,
    `- Supervisor: ${supervisorName || "—"}`,
    sitePhone ? `- Site Phone: ${sitePhone}` : null,
    `- Overall Status: ${status}`,
  ].filter(Boolean).join("\n");
  const ctxLines = [
    `- siteName: ${siteName || "—"}`,
    `- siteNumber: ${siteNumber || "—"}`,
    `- supervisorName: ${supervisorName || "—"}`,
    sitePhone ? `- sitePhone: ${sitePhone}` : null,
    ...Object.entries(context || {}).map(([k, v]) => `- ${k}: ${v || "—"}`),
  ].filter(Boolean).join("\n");
  const photoIndex = photoIndexList.length
    ? photoIndexList.map((p) => `Photo ${p.num} — ${p.label}${p.caption ? ` — ${p.caption}` : ""}`).join("\n")
    : "No photos attached.";
  const findings = [];
  const addFinding = (label, node) => {
    if (!node) return;
    if (node.status && node.status !== "OK" && node.status !== "N/A")
      findings.push(`- ${label}: ${node.status}${node.notes ? ` — ${node.notes}` : ""}`);
  };
  addFinding("Facility > Ceiling", inspection?.facility?.ceiling);
  addFinding("Facility > Walls", inspection?.facility?.walls);
  addFinding("Facility > Floors", inspection?.facility?.floors);
  addFinding("Facility > Lighting", inspection?.facility?.lighting);
  addFinding("Operations > Employee practices", inspection?.operations?.employeePractices);
  addFinding("Operations > Handwashing / supplies", inspection?.operations?.handwashing);
  addFinding("Operations > Labeling / dating", inspection?.operations?.labelingDating);
  addFinding("Operations > Logs / documentation", inspection?.operations?.logs);
  addFinding("Equipment > Double-door cooler", inspection?.equipment?.doubleDoorCooler);
  addFinding("Equipment > Double-door freezer", inspection?.equipment?.doubleDoorFreezer);
  addFinding("Equipment > Walk-in cooler", inspection?.equipment?.walkInCooler);
  addFinding("Equipment > Warmers / hot holding", inspection?.equipment?.warmers);
  addFinding("Equipment > Ovens", inspection?.equipment?.ovens);
  addFinding("Equipment > 3-compartment sink", inspection?.equipment?.threeCompSink);
  addFinding("Equipment > Ecolab / chemicals", inspection?.equipment?.ecolab);
  const handT = Number(inspection?.temps?.handSinkTempF);
  const threeT = Number(inspection?.temps?.threeCompSinkTempF);
  if (!Number.isNaN(handT) && handT && handT < 95) findings.push(`- Temps > Hand sink: ${handT}°F (below 95°F minimum)`);
  if (!Number.isNaN(threeT) && threeT && threeT < 110) findings.push(`- Temps > 3-comp wash: ${threeT}°F (below 110°F minimum)`);
  const findingsText = findings.length ? findings.join("\n") : "- No exceptions noted from checklist/temps.";
  const critical = actionItems.filter((a) => a.priority === "High").map((a) => `- ${a.issue}${a.photos?.length ? ` (Photo ${a.photos.join(", ")})` : ""}`).join("\n");
  const criticalText = critical || (inspectionType === "Event Day" ? "- No critical blockers identified for service." : "- No critical issues flagged.");
  return [
    subject, "", `Hi team,`, "", playbook.opening, "",
    `## ${playbook.headline} — Snapshot`, snapshotLines, "",
    `## Context (from sit-down notes)`, ctxLines || "- —", "",
    `## Critical Risks`, criticalText, "",
    `## Findings by Area`, findingsText, "",
    `## Corrective Actions (please assign Owner + Due)`, tableMarkdown(actionItems), "",
    `## Photo Index`, photoIndex, "",
    `## Inspector Notes (organized)`, formatNotesText(rawNotes) || "—",
  ].join("\n");
}

/* ── Report structure label translations (used by transformLocally) ──── */
const REPORT_LABELS = {
  en: {
    summary: "Summary", inspector: "Inspector", participant: "Participant", supervisor: "Supervisor",
    status: "Status", actionItems: "Action Items", notes: "Inspector Notes", none: "None.",
    findings: "Findings", temperatures: "Temperatures", scorecard: "EVALUATION SCORECARD", overall: "Overall",
    // RenderedOutput labels
    unitLocation: "Unit / Location", licenseNum: "License #", type: "Type", floor: "Floor",
    phone: "Phone", event: "Event", handSinkTemp: "Hand Sink Temp", threeCompTemp: "3-Comp Wash Temp",
    iceMakerCleaned: "Ice Maker Last Cleaned", inspectionScorecard: "Inspection Scorecard",
    section: "Section", item: "Item", notes2: "Notes",
    issuesFound: "Issues Found", correctiveActions: "Corrective Actions Required",
    photoEvidence: "Photo Evidence", noPreview: "No preview",
    passed: "PASSED", needsAttention: "NEEDS ATTENTION",
    meetsMin: "Meets minimum", below95: "Below 95°F minimum", below110: "Below 110°F minimum",
    above: "Above", maximum: "maximum",
    priority: "Priority", high: "High", medium: "Medium",
    confidential: "This report is confidential and intended for internal use only.",
    generated: "Generated",
    facility: "Facility", operations: "Operations", equipment: "Equipment", temps: "Temps",
    // Item labels
    ceiling: "Ceiling", walls: "Walls", floors: "Floors", lighting: "Lighting",
    employeePractices: "Employee Practices", handwashing: "Handwashing / Supplies",
    labelingDating: "Labeling / Dating", logs: "Logs / Documentation",
    doubleDoorCooler: "Double-Door Cooler", doubleDoorFreezer: "Double-Door Freezer",
    walkInCooler: "Walk-In Cooler", walkInFreezer: "Walk-In Freezer",
    prepCooler: "Prep Cooler", warmers: "Warmers / Hot Holding", ovens: "Ovens",
    threeCompSink: "3-Compartment Sink", ecolab: "Ecolab / Chemicals",
    // Status values
    statusOk: "OK", statusNotClean: "Not Clean", statusNeedsAttention: "Needs Attention", statusNa: "N/A",
  },
  es: {
    summary: "Resumen", inspector: "Inspector", participant: "Participante", supervisor: "Supervisor",
    status: "Estado", actionItems: "Acciones Correctivas", notes: "Notas del Inspector", none: "Ninguna.",
    findings: "Hallazgos", temperatures: "Temperaturas", scorecard: "FICHA DE EVALUACIÓN", overall: "General",
    unitLocation: "Unidad / Ubicación", licenseNum: "Licencia #", type: "Tipo", floor: "Piso",
    phone: "Teléfono", event: "Evento", handSinkTemp: "Temp. Lavamanos", threeCompTemp: "Temp. Fregadero 3 Compartimentos",
    iceMakerCleaned: "Última Limpieza Máquina de Hielo", inspectionScorecard: "Hoja de Inspección",
    section: "Sección", item: "Elemento", notes2: "Notas",
    issuesFound: "Problemas Encontrados", correctiveActions: "Acciones Correctivas Requeridas",
    photoEvidence: "Evidencia Fotográfica", noPreview: "Sin vista previa",
    passed: "APROBADO", needsAttention: "REQUIERE ATENCIÓN",
    meetsMin: "Cumple el mínimo", below95: "Por debajo del mínimo de 95°F", below110: "Por debajo del mínimo de 110°F",
    above: "Por encima de", maximum: "máximo",
    priority: "Prioridad", high: "Alta", medium: "Media",
    confidential: "Este informe es confidencial y de uso interno únicamente.",
    generated: "Generado",
    facility: "Instalaciones", operations: "Operaciones", equipment: "Equipo", temps: "Temperaturas",
    // Item labels
    ceiling: "Techo", walls: "Paredes", floors: "Pisos", lighting: "Iluminación",
    employeePractices: "Prácticas de Empleados", handwashing: "Lavado de Manos / Suministros",
    labelingDating: "Etiquetado / Fechado", logs: "Registros / Documentación",
    doubleDoorCooler: "Refrigerador Doble Puerta", doubleDoorFreezer: "Congelador Doble Puerta",
    walkInCooler: "Cámara Frigorífica", walkInFreezer: "Cámara Congeladora",
    prepCooler: "Enfriador de Preparación", warmers: "Calentadores / Mantenimiento en Caliente", ovens: "Hornos",
    threeCompSink: "Fregadero de 3 Compartimentos", ecolab: "Ecolab / Químicos",
    // Status values
    statusOk: "OK", statusNotClean: "No Limpio", statusNeedsAttention: "Necesita Atención", statusNa: "N/D",
  },
  fr: {
    summary: "Résumé", inspector: "Inspecteur", participant: "Participant", supervisor: "Superviseur",
    status: "Statut", actionItems: "Actions Correctives", notes: "Notes de l'Inspecteur", none: "Aucune.",
    findings: "Résultats", temperatures: "Températures", scorecard: "FICHE D'ÉVALUATION", overall: "Général",
    unitLocation: "Unité / Emplacement", licenseNum: "Licence #", type: "Type", floor: "Étage",
    phone: "Téléphone", event: "Événement", handSinkTemp: "Temp. Lavabo", threeCompTemp: "Temp. Évier 3 Compartiments",
    iceMakerCleaned: "Dernier nettoyage machine à glace", inspectionScorecard: "Fiche d'Inspection",
    section: "Section", item: "Élément", notes2: "Notes",
    issuesFound: "Problèmes Trouvés", correctiveActions: "Actions Correctives Requises",
    photoEvidence: "Preuves Photographiques", noPreview: "Pas d'aperçu",
    passed: "APPROUVÉ", needsAttention: "NÉCESSITE ATTENTION",
    meetsMin: "Conforme au minimum", below95: "En dessous du minimum de 95°F", below110: "En dessous du minimum de 110°F",
    above: "Au-dessus de", maximum: "maximum",
    priority: "Priorité", high: "Haute", medium: "Moyenne",
    confidential: "Ce rapport est confidentiel et à usage interne uniquement.",
    generated: "Généré",
    facility: "Installation", operations: "Opérations", equipment: "Équipement", temps: "Températures",
    // Item labels
    ceiling: "Plafond", walls: "Murs", floors: "Sols", lighting: "Éclairage",
    employeePractices: "Pratiques des Employés", handwashing: "Lavage des Mains / Fournitures",
    labelingDating: "Étiquetage / Datation", logs: "Registres / Documentation",
    doubleDoorCooler: "Réfrigérateur Double Porte", doubleDoorFreezer: "Congélateur Double Porte",
    walkInCooler: "Chambre Froide", walkInFreezer: "Chambre de Congélation",
    prepCooler: "Réfrigérateur de Préparation", warmers: "Chauffe-plats / Maintien au Chaud", ovens: "Fours",
    threeCompSink: "Évier à 3 Compartiments", ecolab: "Ecolab / Produits Chimiques",
    // Status values
    statusOk: "OK", statusNotClean: "Non Propre", statusNeedsAttention: "Nécessite Attention", statusNa: "N/A",
  },
  pt: {
    summary: "Resumo", inspector: "Inspetor", participant: "Participante", supervisor: "Supervisor",
    status: "Status", actionItems: "Ações Corretivas", notes: "Notas do Inspetor", none: "Nenhuma.",
    findings: "Conclusões", temperatures: "Temperaturas", scorecard: "FICHA DE AVALIAÇÃO", overall: "Geral",
    unitLocation: "Unidade / Local", licenseNum: "Licença #", type: "Tipo", floor: "Andar",
    phone: "Telefone", event: "Evento", handSinkTemp: "Temp. Pia para Mãos", threeCompTemp: "Temp. Pia 3 Compartimentos",
    iceMakerCleaned: "Última Limpeza da Máquina de Gelo", inspectionScorecard: "Ficha de Inspeção",
    section: "Seção", item: "Item", notes2: "Notas",
    issuesFound: "Problemas Encontrados", correctiveActions: "Ações Corretivas Necessárias",
    photoEvidence: "Evidência Fotográfica", noPreview: "Sem pré-visualização",
    passed: "APROVADO", needsAttention: "REQUER ATENÇÃO",
    meetsMin: "Atende ao mínimo", below95: "Abaixo do mínimo de 95°F", below110: "Abaixo do mínimo de 110°F",
    above: "Acima de", maximum: "máximo",
    priority: "Prioridade", high: "Alta", medium: "Média",
    confidential: "Este relatório é confidencial e destinado apenas ao uso interno.",
    generated: "Gerado",
    facility: "Instalação", operations: "Operações", equipment: "Equipamento", temps: "Temperaturas",
    // Item labels
    ceiling: "Teto", walls: "Paredes", floors: "Pisos", lighting: "Iluminação",
    employeePractices: "Práticas dos Funcionários", handwashing: "Lavagem das Mãos / Suprimentos",
    labelingDating: "Rotulagem / Datação", logs: "Registros / Documentação",
    doubleDoorCooler: "Refrigerador Dupla Porta", doubleDoorFreezer: "Freezer Dupla Porta",
    walkInCooler: "Câmara Fria", walkInFreezer: "Câmara de Congelamento",
    prepCooler: "Resfriador de Preparo", warmers: "Aquecedores / Manutenção a Quente", ovens: "Fornos",
    threeCompSink: "Pia de 3 Compartimentos", ecolab: "Ecolab / Químicos",
    // Status values
    statusOk: "OK", statusNotClean: "Não Limpo", statusNeedsAttention: "Precisa de Atenção", statusNa: "N/D",
  },
  ht: {
    summary: "Rezime", inspector: "Enspektè", participant: "Patisipan", supervisor: "Sipèvizè",
    status: "Estati", actionItems: "Aksyon Korektif", notes: "Nòt Enspektè", none: "Okenn.",
    findings: "Rezilta", temperatures: "Tanperati", scorecard: "FÒM EVALYASYON", overall: "Jeneral",
    unitLocation: "Inite / Kote", licenseNum: "Lisans #", type: "Tip", floor: "Etaj",
    phone: "Telefòn", event: "Evènman", handSinkTemp: "Tanp. Basen Pou Men", threeCompTemp: "Tanp. Basen 3 Konpatiman",
    iceMakerCleaned: "Dènye Netwayaj Machin Glas", inspectionScorecard: "Fòm Enspeksyon",
    section: "Seksyon", item: "Atik", notes2: "Nòt",
    issuesFound: "Pwoblèm Jwenn", correctiveActions: "Aksyon Korektif Obligatwa",
    photoEvidence: "Prèv Foto", noPreview: "Pa gen apersi",
    passed: "PASE", needsAttention: "BEZWEN ATANSYON",
    meetsMin: "Satisfè minimòm", below95: "Pi ba pase minimòm 95°F", below110: "Pi ba pase minimòm 110°F",
    above: "Pi wo pase", maximum: "maksimòm",
    priority: "Priyorite", high: "Wo", medium: "Mwayen",
    confidential: "Rapò sa konfidansyèl e se pou itilizasyon entèn sèlman.",
    generated: "Jenere",
    facility: "Enstalasyon", operations: "Operasyon", equipment: "Ekipman", temps: "Tanperati",
    // Item labels
    ceiling: "Plafon", walls: "Mi", floors: "Planche", lighting: "Limyè",
    employeePractices: "Pratik Anplwaye", handwashing: "Lave Men / Founiti",
    labelingDating: "Etiketaj / Dat", logs: "Dosye / Dokimantasyon",
    doubleDoorCooler: "Réfrijératè Doub Pòt", doubleDoorFreezer: "Konglatè Doub Pòt",
    walkInCooler: "Chanm Frèt", walkInFreezer: "Chanm Frèt Kongèlasyon",
    prepCooler: "Réfrijératè Preparasyon", warmers: "Rechòf / Kenbe Cho", ovens: "Fou",
    threeCompSink: "Basen 3 Konpatiman", ecolab: "Ecolab / Pwodui Chimik",
    // Status values
    statusOk: "OK", statusNotClean: "Pa Pwòp", statusNeedsAttention: "Bezwen Atansyon", statusNa: "S/O",
  },
  ar: {
    summary: "ملخص", inspector: "المفتش", participant: "المشارك", supervisor: "المشرف",
    status: "الحالة", actionItems: "الإجراءات التصحيحية", notes: "ملاحظات المفتش", none: "لا شيء.",
    findings: "النتائج", temperatures: "درجات الحرارة", scorecard: "بطاقة التقييم", overall: "الإجمالي",
    unitLocation: "الوحدة / الموقع", licenseNum: "رقم الترخيص", type: "النوع", floor: "الطابق",
    phone: "الهاتف", event: "الحدث", handSinkTemp: "درجة حرارة حوض الأيدي", threeCompTemp: "درجة حرارة حوض 3 أقسام",
    iceMakerCleaned: "آخر تنظيف لآلة الثلج", inspectionScorecard: "نموذج التفتيش",
    section: "القسم", item: "البند", notes2: "ملاحظات",
    issuesFound: "المشكلات الموجودة", correctiveActions: "الإجراءات التصحيحية المطلوبة",
    photoEvidence: "الأدلة الصورية", noPreview: "لا توجد معاينة",
    passed: "ناجح", needsAttention: "يحتاج انتباهاً",
    meetsMin: "يستوفي الحد الأدنى", below95: "أقل من الحد الأدنى 95°F", below110: "أقل من الحد الأدنى 110°F",
    above: "فوق", maximum: "الحد الأقصى",
    priority: "الأولوية", high: "عالية", medium: "متوسطة",
    confidential: "هذا التقرير سري ومخصص للاستخدام الداخلي فقط.",
    generated: "تم الإنشاء",
    facility: "المنشأة", operations: "العمليات", equipment: "المعدات", temps: "درجات الحرارة",
    // Item labels
    ceiling: "السقف", walls: "الجدران", floors: "الأرضيات", lighting: "الإضاءة",
    employeePractices: "ممارسات الموظفين", handwashing: "غسل اليدين / المستلزمات",
    labelingDating: "الوسم / التأريخ", logs: "السجلات / التوثيق",
    doubleDoorCooler: "ثلاجة بابين", doubleDoorFreezer: "فريزر بابين",
    walkInCooler: "غرفة تبريد", walkInFreezer: "غرفة تجميد",
    prepCooler: "ثلاجة التحضير", warmers: "سخانات / حفظ ساخن", ovens: "أفران",
    threeCompSink: "حوض 3 أقسام", ecolab: "إيكولاب / مواد كيميائية",
    // Status values
    statusOk: "مقبول", statusNotClean: "غير نظيف", statusNeedsAttention: "يحتاج انتباهاً", statusNa: "غ/م",
  },
  zh: {
    summary: "摘要", inspector: "检查员", participant: "参与者", supervisor: "主管",
    status: "状态", actionItems: "纠正措施", notes: "检查员备注", none: "无。",
    findings: "检查结果", temperatures: "温度", scorecard: "评估表", overall: "总体",
    unitLocation: "单位 / 位置", licenseNum: "许可证 #", type: "类型", floor: "楼层",
    phone: "电话", event: "活动", handSinkTemp: "洗手池温度", threeCompTemp: "三槽水池温度",
    iceMakerCleaned: "制冰机最近清洁日期", inspectionScorecard: "检查评分表",
    section: "部分", item: "项目", notes2: "备注",
    issuesFound: "发现问题", correctiveActions: "需要纠正措施",
    photoEvidence: "照片证据", noPreview: "无预览",
    passed: "通过", needsAttention: "需要关注",
    meetsMin: "符合最低要求", below95: "低于95°F最低标准", below110: "低于110°F最低标准",
    above: "高于", maximum: "最高限度",
    priority: "优先级", high: "高", medium: "中",
    confidential: "本报告保密，仅供内部使用。",
    generated: "生成于",
    facility: "设施", operations: "操作", equipment: "设备", temps: "温度",
    // Item labels
    ceiling: "天花板", walls: "墙壁", floors: "地板", lighting: "照明",
    employeePractices: "员工操作规范", handwashing: "洗手 / 用品",
    labelingDating: "标签 / 日期", logs: "记录 / 文件",
    doubleDoorCooler: "双门冷藏柜", doubleDoorFreezer: "双门冷冻柜",
    walkInCooler: "步入式冷藏间", walkInFreezer: "步入式冷冻间",
    prepCooler: "备餐冷藏柜", warmers: "保温设备 / 热保持", ovens: "烤箱",
    threeCompSink: "三格水槽", ecolab: "Ecolab / 化学品",
    // Status values
    statusOk: "合格", statusNotClean: "不洁", statusNeedsAttention: "需要关注", statusNa: "不适用",
  },
  hi: {
    summary: "सारांश", inspector: "निरीक्षक", participant: "प्रतिभागी", supervisor: "पर्यवेक्षक",
    status: "स्थिति", actionItems: "सुधारात्मक कार्रवाइयाँ", notes: "निरीक्षक के नोट्स", none: "कोई नहीं।",
    findings: "निष्कर्ष", temperatures: "तापमान", scorecard: "मूल्यांकन पत्रक", overall: "कुल मिलाकर",
    unitLocation: "इकाई / स्थान", licenseNum: "लाइसेंस #", type: "प्रकार", floor: "मंजिल",
    phone: "फ़ोन", event: "कार्यक्रम", handSinkTemp: "हैंड सिंक तापमान", threeCompTemp: "3-कम्पार्टमेंट सिंक तापमान",
    iceMakerCleaned: "आइस मेकर अंतिम सफाई", inspectionScorecard: "निरीक्षण स्कोरकार्ड",
    section: "अनुभाग", item: "मद", notes2: "नोट्स",
    issuesFound: "पाई गई समस्याएं", correctiveActions: "आवश्यक सुधारात्मक कार्रवाइयाँ",
    photoEvidence: "फोटो प्रमाण", noPreview: "कोई पूर्वावलोकन नहीं",
    passed: "उत्तीर्ण", needsAttention: "ध्यान देने की आवश्यकता",
    meetsMin: "न्यूनतम पूरा करता है", below95: "95°F न्यूनतम से नीचे", below110: "110°F न्यूनतम से नीचे",
    above: "से ऊपर", maximum: "अधिकतम",
    priority: "प्राथमिकता", high: "उच्च", medium: "मध्यम",
    confidential: "यह रिपोर्ट गोपनीय है और केवल आंतरिक उपयोग के लिए है।",
    generated: "निर्मित",
    facility: "सुविधा", operations: "संचालन", equipment: "उपकरण", temps: "तापमान",
    // Item labels
    ceiling: "छत", walls: "दीवारें", floors: "फर्श", lighting: "प्रकाश व्यवस्था",
    employeePractices: "कर्मचारी प्रथाएं", handwashing: "हाथ धोना / सामग्री",
    labelingDating: "लेबलिंग / तारीख", logs: "लॉग / दस्तावेज़",
    doubleDoorCooler: "डबल-डोर कूलर", doubleDoorFreezer: "डबल-डोर फ्रीज़र",
    walkInCooler: "वॉक-इन कूलर", walkInFreezer: "वॉक-इन फ्रीज़र",
    prepCooler: "प्रेप कूलर", warmers: "वार्मर / हॉट होल्डिंग", ovens: "ओवन",
    threeCompSink: "3-कम्पार्टमेंट सिंक", ecolab: "Ecolab / रसायन",
    // Status values
    statusOk: "ठीक है", statusNotClean: "साफ नहीं", statusNeedsAttention: "ध्यान चाहिए", statusNa: "लागू नहीं",
  },
};

/* ── Local Transform (no backend needed) ─────────────────── */
function transformLocally({ noteType, useCase, context, inspection, rawNotes, inspectionType, inspectionDate, inspectorName, participantName, siteName, siteNumber, sitePhone, supervisorName, floor, eventName, reportLang }) {
  const lbl = REPORT_LABELS[reportLang] || REPORT_LABELS.en;
  const status = calcOverallStatus(inspection);
  const actionItems = buildActionItems({ inspection, rawNotes });
  const expandedNotes = expandAbbreviations(rawNotes);
  const location = siteName || context?.kitchen || "Kitchen";
  const date = inspectionDate || context?.date || "—";
  const eventTag = eventName ? ` — ${eventName}` : "";

  if (useCase === "Email Summary") {
    return emailPreview({ noteType, context, inspection, rawNotes, inspectionType, inspectionDate, inspectorName, participantName, siteName, siteNumber, sitePhone, supervisorName, floor, eventName });
  }

  if (useCase === "Slack Update") {
    const lines = [
      `*${inspectionType || "Inspection"}${eventTag} — ${location} — ${date}*`,
      `${lbl.inspector}: ${inspectorName || "—"}${participantName ? ` | ${lbl.participant}: ${participantName}` : ""} | ${lbl.status}: *${status}*`,
      "",
      `*${lbl.summary}:*`,
      formatNotesText(rawNotes),
      "",
    ];
    if (actionItems.length) {
      lines.push(`*${lbl.actionItems} (${actionItems.length}):*`);
      for (const a of actionItems) lines.push(`  • [${a.priority}] ${a.issue}`);
    } else {
      lines.push(lbl.none);
    }
    return lines.join("\n");
  }

  if (useCase === "Google Doc") {
    const lines = [
      `# ${inspectionType || "Inspection"}${eventTag} — ${location}`,
      `Date: ${date} | ${lbl.inspector}: ${inspectorName || "—"}${participantName ? ` | ${lbl.participant}: ${participantName}` : ""} | ${lbl.supervisor}: ${supervisorName || "—"}`,
      `${lbl.overall} ${lbl.status}: ${status}`,
      "",
      `## ${lbl.notes}`,
      formatNotesText(rawNotes),
      "",
      `## ${lbl.findings}`,
    ];
    const addFinding = (label, node) => {
      if (node?.status && node.status !== "OK" && node.status !== "N/A")
        lines.push(`- **${label}**: ${node.status}${node.notes ? ` — ${node.notes}` : ""}`);
    };
    addFinding("Ceiling", inspection?.facility?.ceiling);
    addFinding("Walls", inspection?.facility?.walls);
    addFinding("Floors", inspection?.facility?.floors);
    addFinding("Lighting", inspection?.facility?.lighting);
    addFinding("Employee practices", inspection?.operations?.employeePractices);
    addFinding("Handwashing", inspection?.operations?.handwashing);
    addFinding("Labeling / dating", inspection?.operations?.labelingDating);
    addFinding("Logs", inspection?.operations?.logs);
    addFinding("Double-Door Cooler", inspection?.equipment?.doubleDoorCooler);
    addFinding("Double-Door Freezer", inspection?.equipment?.doubleDoorFreezer);
    addFinding("Walk-In Cooler", inspection?.equipment?.walkInCooler);
    addFinding("Warmers / Hot Holding", inspection?.equipment?.warmers);
    addFinding("Ovens", inspection?.equipment?.ovens);
    addFinding("3-Compartment Sink", inspection?.equipment?.threeCompSink);
    addFinding("Ecolab / Chemicals", inspection?.equipment?.ecolab);
    if (lines[lines.length - 1] === `## ${lbl.findings}`) lines.push("- All areas OK.");
    lines.push("", `## ${lbl.actionItems}`);
    if (actionItems.length) {
      lines.push(tableMarkdown(actionItems));
    } else {
      lines.push(lbl.none);
    }
    return lines.join("\n");
  }

  if (useCase === "Evaluation Scorecard") {
    const sections = [
      { title: "Facility", items: [
        ["Ceiling", inspection?.facility?.ceiling],
        ["Walls", inspection?.facility?.walls],
        ["Floors", inspection?.facility?.floors],
        ["Lighting", inspection?.facility?.lighting],
      ]},
      { title: "Operations", items: [
        ["Employee practices", inspection?.operations?.employeePractices],
        ["Handwashing", inspection?.operations?.handwashing],
        ["Labeling / dating", inspection?.operations?.labelingDating],
        ["Logs", inspection?.operations?.logs],
      ]},
      { title: "Equipment", items: [
        ["Double-Door Cooler", inspection?.equipment?.doubleDoorCooler],
        ["Double-Door Freezer", inspection?.equipment?.doubleDoorFreezer],
        ["Walk-In Cooler", inspection?.equipment?.walkInCooler],
        ["Warmers / Hot Holding", inspection?.equipment?.warmers],
        ["Ovens", inspection?.equipment?.ovens],
        ["3-Compartment Sink", inspection?.equipment?.threeCompSink],
        ["Ecolab / Chemicals", inspection?.equipment?.ecolab],
      ]},
    ];
    const lines = [
      lbl.scorecard,
      `${"=".repeat(50)}`,
      `${inspectionType || "Inspection"}${eventTag} — ${location} — ${date}`,
      `${lbl.inspector}: ${inspectorName || "—"}${participantName ? ` | ${lbl.participant}: ${participantName}` : ""}`,
      `${lbl.overall}: ${status}`,
      "",
    ];
    for (const sec of sections) {
      lines.push(`--- ${sec.title.toUpperCase()} ---`);
      for (const [label, node] of sec.items) {
        const s = node?.status || "N/A";
        const icon = s === "OK" ? "[PASS]" : s === "N/A" ? "[ -- ]" : "[FAIL]";
        lines.push(`  ${icon} ${label}${node?.notes ? ` — ${node.notes}` : ""}`);
      }
      lines.push("");
    }
    lines.push(`--- ${lbl.temperatures.toUpperCase()} ---`);
    const hs = inspection?.temps?.handSinkTempF;
    const ts = inspection?.temps?.threeCompSinkTempF;
    const hsNote = inspection?.temps?.handSinkNote?.trim();
    const tsNote = inspection?.temps?.threeCompSinkNote?.trim();
    lines.push(`  Hand sink water temperature: ${hs || "—"}°F ${Number(hs) >= 95 ? "[PASS]" : hs ? "[FAIL]" : ""}${hsNote ? `\n    Note: ${hsNote}` : ""}`);
    lines.push(`  3-compartment sink wash temperature: ${ts || "—"}°F ${Number(ts) >= 110 ? "[PASS]" : ts ? "[FAIL]" : ""}${tsNote ? `\n    Note: ${tsNote}` : ""}`);
    lines.push("", `--- ${lbl.actionItems.toUpperCase()} (${actionItems.length}) ---`);
    for (const a of actionItems) lines.push(`  [${a.priority}] ${a.issue}`);
    if (!actionItems.length) lines.push(`  ${lbl.none}`);
    lines.push("", `--- ${lbl.notes.toUpperCase()} ---`, formatNotesText(rawNotes));
    return lines.join("\n");
  }

  return emailPreview({ noteType, context, inspection, rawNotes, inspectionType, inspectionDate, inspectorName, participantName, siteName, siteNumber, sitePhone, supervisorName, floor, eventName });
}

/* ── AI Assist: smart suggestions from checklist + notes ── */
function aiAssist({ inspection, rawNotes, context, noteType }) {
  const tips = [];
  const notes = (rawNotes || "").toLowerCase();

  // Check for items flagged "Needs Attention" without notes
  const checkNode = (label, node) => {
    if (node?.status === "Needs Attention" && !node?.notes?.trim()) {
      tips.push(`"${label}" is flagged Needs Attention but has no notes — add details so corrective actions are clear.`);
    }
    if (node?.status === "Not Clean" && !node?.notes?.trim()) {
      tips.push(`"${label}" is flagged Not Clean but has no notes — describe the issue for the report.`);
    }
  };
  checkNode("Ceiling", inspection?.facility?.ceiling);
  checkNode("Walls", inspection?.facility?.walls);
  checkNode("Floors", inspection?.facility?.floors);
  checkNode("Lighting", inspection?.facility?.lighting);
  checkNode("Employee practices", inspection?.operations?.employeePractices);
  checkNode("Handwashing", inspection?.operations?.handwashing);
  checkNode("Labeling / dating", inspection?.operations?.labelingDating);
  checkNode("Logs", inspection?.operations?.logs);
  checkNode("Double-Door Cooler", inspection?.equipment?.doubleDoorCooler);
  checkNode("Double-Door Freezer", inspection?.equipment?.doubleDoorFreezer);
  checkNode("Walk-In Cooler", inspection?.equipment?.walkInCooler);
  checkNode("Walk-In Freezer", inspection?.equipment?.walkInFreezer);
  checkNode("Prep Cooler", inspection?.equipment?.prepCooler);
  checkNode("Warmers / Hot Holding", inspection?.equipment?.warmers);
  checkNode("Ovens", inspection?.equipment?.ovens);
  checkNode("3-Compartment Sink", inspection?.equipment?.threeCompSink);
  checkNode("Ecolab / Chemicals", inspection?.equipment?.ecolab);

  // Water temperature checks
  const hs = Number(inspection?.temps?.handSinkTempF);
  const ts = Number(inspection?.temps?.threeCompSinkTempF);
  if (hs && hs < 95) tips.push(`Hand sink temp is ${hs}°F (below 95°F min). Flag for immediate maintenance.`);
  if (ts && ts < 110) tips.push(`3-comp sink wash temp is ${ts}°F (below 110°F min). Check water heater.`);
  if (hs && hs >= 95 && hs < 100) tips.push(`Hand sink temp is ${hs}°F — passes but is close to the 95°F minimum. Monitor.`);
  if (ts && ts >= 110 && ts < 115) tips.push(`3-comp wash temp is ${ts}°F — passes but is close to the 110°F minimum. Monitor.`);
  // Per-equipment cold temps — 3-zone tips
  for (const et of collectEquipTemps(inspection)) {
    if (et.zone === "bad") {
      tips.push(`${et.label} temp is ${et.tempNum}°F — above ${et.max}°F. ${et.type === "freezer" ? "Check compressor and door seals immediately." : "Do not store food here — fix refrigeration immediately."}`);
    } else if (et.zone === "warn") {
      tips.push(`${et.label} temp is ${et.tempNum}°F — above the ${et.max}°F safe limit but not yet critical. Recheck in 30 minutes and monitor door seals.`);
    } else if (et.type === "cooler" && et.tempNum > 35) {
      tips.push(`${et.label} temp is ${et.tempNum}°F — passes but close to the 40°F maximum. Monitor.`);
    } else if (et.type === "freezer" && et.tempNum > 15) {
      tips.push(`${et.label} temp is ${et.tempNum}°F — passes but close to the 20°F maximum. Monitor.`);
    }
  }

  // Raw notes analysis
  if (notes.includes("allergen")) tips.push("Allergen concerns detected in notes — ensure allergen training is scheduled and documented.");
  if (notes.includes("haccp")) tips.push("HACCP mentioned — verify all HACCP logs are complete and signed before next inspection.");
  if (notes.includes("pest") || notes.includes("trap")) tips.push("Pest control mentioned — document trap locations and schedule pest vendor follow-up.");
  if (notes.includes("cutting board") || notes.includes("scored")) tips.push("Scored cutting boards noted — replace immediately per food safety protocol.");
  if (notes.includes("calibrat")) tips.push("Thermometer calibration mentioned — document last calibration date and schedule next.");

  // Action items without specific owners
  const actionLines = parseActionLines(rawNotes);
  if (actionLines.length > 3) tips.push(`${actionLines.length} action items found in notes — consider prioritizing the top 3 for immediate follow-up.`);

  if (!tips.length) tips.push("No issues detected. Inspection looks clean!");

  return tips;
}

/* ── AI Export Summary: executive summary for documents ───── */
function buildExportSummary({ inspection, rawNotes, inspectionType, inspectionDate, siteName }) {
  const status = calcOverallStatus(inspection);
  const actionItems = buildActionItems({ inspection, rawNotes });
  const tips = aiAssist({ inspection, rawNotes, context: {}, noteType: "Kitchen Inspection" });
  const date = inspectionDate || new Date().toLocaleDateString();
  const loc = siteName || "the inspected location";

  // Count statuses
  let okCount = 0, attentionCount = 0, notCleanCount = 0;
  const sections = ["facility", "operations", "equipment"];
  for (const sec of sections) {
    const data = inspection?.[sec] || {};
    for (const k of Object.keys(data)) {
      const s = data[k]?.status;
      if (s === "OK") okCount++;
      else if (s === "Needs Attention") attentionCount++;
      else if (s === "Not Clean") notCleanCount++;
    }
  }
  const total = okCount + attentionCount + notCleanCount;
  const passRate = total > 0 ? Math.round((okCount / total) * 100) : 100;

  // Build summary paragraphs
  const lines = [];
  if (status === "Pass") {
    lines.push(`This ${inspectionType || "inspection"} of ${loc} on ${date} resulted in an overall PASS with a ${passRate}% compliance rate. ${okCount} of ${total} items met standards.`);
  } else {
    lines.push(`This ${inspectionType || "inspection"} of ${loc} on ${date} requires attention. ${notCleanCount + attentionCount} of ${total} items were flagged, resulting in a ${passRate}% compliance rate.`);
  }

  if (actionItems.length > 0) {
    const highCount = actionItems.filter(a => a.priority === "High").length;
    lines.push(`${actionItems.length} corrective action${actionItems.length !== 1 ? "s" : ""} required${highCount > 0 ? ` (${highCount} high priority)` : ""}. Immediate follow-up recommended for all high-priority items.`);
  }

  // Temp summary
  const handT = Number(inspection?.temps?.handSinkTempF);
  const threeT = Number(inspection?.temps?.threeCompSinkTempF);
  const eTemps = collectEquipTemps(inspection);
  const tempIssues = [];
  if (handT && handT < 95) tempIssues.push(`hand sink at ${handT}\u00B0F (below 95\u00B0F)`);
  if (threeT && threeT < 110) tempIssues.push(`3-comp wash at ${threeT}\u00B0F (below 110\u00B0F)`);
  for (const et of eTemps) {
    if (!et.pass) tempIssues.push(`${et.label} at ${et.tempNum}\u00B0F (above ${et.max}\u00B0F)`);
  }
  if (tempIssues.length > 0) {
    lines.push(`Temperature violations: ${tempIssues.join("; ")}. Immediate corrective action required.`);
  } else {
    const tempOk = [];
    if (handT) tempOk.push("hand sink");
    if (threeT) tempOk.push("3-comp wash");
    for (const et of eTemps) tempOk.push(et.label.toLowerCase());
    if (tempOk.length) lines.push(`All recorded temperatures (${tempOk.join(", ")}) are within acceptable ranges.`);
  }

  // Smart recommendations
  const recs = [];
  if (notCleanCount > 0) recs.push("Schedule re-inspection within 48 hours for all Not Clean items.");
  if (attentionCount >= 3) recs.push("Consider additional staff training — multiple areas flagged for attention.");
  if (tempIssues.length > 0) recs.push("Contact maintenance for equipment check on out-of-range temperatures.");
  if (actionItems.length === 0 && status === "Pass") recs.push("No corrective actions needed. Continue current maintenance schedule.");
  if (recs.length) lines.push("Recommendations: " + recs.join(" "));

  return lines.join("\n\n");
}

/* ── Rendered Output Component (visual, not code) ────────── */
function RenderedOutput({ noteType, useCase, context, inspection, rawNotes, inspectionType, inspectionDate, inspectorName, participantName, siteName, siteNumber, restaurantLicense, sitePhone, supervisorName, locationType, floor, eventName, reportLang }) {
  const lbl = REPORT_LABELS[reportLang] || REPORT_LABELS.en;
  const status = calcOverallStatus(inspection);
  const actionItems = buildActionItems({ inspection, rawNotes });
  const expandedNotes = expandAbbreviations(rawNotes);
  const location = siteName || context?.kitchen || "Kitchen";
  const date = inspectionDate || context?.date || new Date().toLocaleDateString();
  const playbook = INSPECTION_PLAYBOOK[inspectionType] || INSPECTION_PLAYBOOK["Regular Inspection"];
  const { index: photoIndexList } = buildPhotoIndex(inspection);
  const [lightboxSrc, setLightboxSrc] = React.useState(null);

  const handT = Number(inspection?.temps?.handSinkTempF);
  const threeT = Number(inspection?.temps?.threeCompSinkTempF);
  const equipTemps = collectEquipTemps(inspection);

  // Collect custom items from each section
  function getCustomItems(sectionKey, sectionLabel) {
    const data = inspection?.[sectionKey] || {};
    return Object.keys(data).filter(k => k.startsWith("custom_")).map(k => ({
      section: sectionLabel, label: data[k]?.label || "Custom", node: data[k],
    }));
  }

  const allItems = [
    { section: "Facility", label: lbl.ceiling, node: inspection?.facility?.ceiling },
    { section: "Facility", label: lbl.walls, node: inspection?.facility?.walls },
    { section: "Facility", label: lbl.floors, node: inspection?.facility?.floors },
    { section: "Facility", label: lbl.lighting, node: inspection?.facility?.lighting },
    ...getCustomItems("facility", "Facility"),
    { section: "Operations", label: lbl.employeePractices, node: inspection?.operations?.employeePractices },
    { section: "Operations", label: lbl.handwashing, node: inspection?.operations?.handwashing },
    { section: "Operations", label: lbl.labelingDating, node: inspection?.operations?.labelingDating },
    { section: "Operations", label: lbl.logs, node: inspection?.operations?.logs },
    ...getCustomItems("operations", "Operations"),
    { section: "Equipment", label: lbl.doubleDoorCooler, node: inspection?.equipment?.doubleDoorCooler },
    { section: "Equipment", label: lbl.doubleDoorFreezer, node: inspection?.equipment?.doubleDoorFreezer },
    { section: "Equipment", label: lbl.walkInCooler, node: inspection?.equipment?.walkInCooler },
    { section: "Equipment", label: lbl.walkInFreezer, node: inspection?.equipment?.walkInFreezer },
    { section: "Equipment", label: lbl.prepCooler, node: inspection?.equipment?.prepCooler },
    { section: "Equipment", label: lbl.warmers, node: inspection?.equipment?.warmers },
    { section: "Equipment", label: lbl.ovens, node: inspection?.equipment?.ovens },
    { section: "Equipment", label: lbl.threeCompSink, node: inspection?.equipment?.threeCompSink },
    { section: "Equipment", label: lbl.ecolab, node: inspection?.equipment?.ecolab },
    ...getCustomItems("equipment", "Equipment"),
  ];

  const findings = allItems.filter(it => it.node?.status && it.node.status !== "OK" && it.node.status !== "N/A");
  if (handT && handT < 95) findings.push({ section: "Temperature", label: "Hand Sink", node: { status: "Not Clean", notes: `${handT}\u00B0F (below 95\u00B0F minimum)` } });
  if (threeT && threeT < 110) findings.push({ section: "Temperature", label: "3-Comp Wash", node: { status: "Not Clean", notes: `${threeT}\u00B0F (below 110\u00B0F minimum)` } });
  for (const et of equipTemps) {
    if (!et.pass) findings.push({ section: "Temperature", label: et.label, node: { status: "Not Clean", notes: `${et.tempNum}\u00B0F (above ${et.max}\u00B0F maximum)` } });
  }

  const sections = ["Facility", "Operations", "Equipment"];

  return (
    <div className="rpt">
      {/* Report Header Bar */}
      <div className="rptHeader">
        <img src={LOGO_DARK} alt="Sodexo" className="rptLogo" />
        <div className="rptHeaderRight">
          <div className="rptDocType">{inspectionType || lbl.inspectionScorecard}</div>
          <div className="rptDocId">Report #{Date.now().toString(36).toUpperCase()}</div>
        </div>
      </div>

      {/* Title + Status */}
      <div className="rptTitleBar">
        <div>
          <div className="rptTitle">{location || "Inspection Report"}</div>
          <div className="rptDate">{date}</div>
        </div>
        <div className={cx("rptStatus", status === "Pass" ? "rptStatusPass" : "rptStatusFail")}>
          {status === "Pass" ? lbl.passed : lbl.needsAttention}
        </div>
      </div>

      {/* Info Grid */}
      <div className="rptInfoGrid">
        <div className="rptInfoItem">
          <div className="rptInfoLabel">{lbl.inspector}</div>
          <div className="rptInfoValue">{inspectorName || "\u2014"}</div>
        </div>
        {participantName && (
          <div className="rptInfoItem">
            <div className="rptInfoLabel">{lbl.participant}</div>
            <div className="rptInfoValue">{participantName}</div>
          </div>
        )}
        <div className="rptInfoItem">
          <div className="rptInfoLabel">{lbl.supervisor}</div>
          <div className="rptInfoValue">{supervisorName || "\u2014"}</div>
        </div>
        <div className="rptInfoItem">
          <div className="rptInfoLabel">{lbl.unitLocation}</div>
          <div className="rptInfoValue">{siteNumber || "\u2014"}</div>
        </div>
        {restaurantLicense && (
          <div className="rptInfoItem">
            <div className="rptInfoLabel">{lbl.licenseNum}</div>
            <div className="rptInfoValue">{restaurantLicense}</div>
          </div>
        )}
        {locationType && (
          <div className="rptInfoItem">
            <div className="rptInfoLabel">{lbl.type}</div>
            <div className="rptInfoValue">{locationType}</div>
          </div>
        )}
        {floor && (
          <div className="rptInfoItem">
            <div className="rptInfoLabel">{lbl.floor}</div>
            <div className="rptInfoValue">{floor}</div>
          </div>
        )}
        {sitePhone && (
          <div className="rptInfoItem">
            <div className="rptInfoLabel">{lbl.phone}</div>
            <div className="rptInfoValue">{sitePhone}</div>
          </div>
        )}
        {eventName && (
          <div className="rptInfoItem">
            <div className="rptInfoLabel">{lbl.event}</div>
            <div className="rptInfoValue">{eventName}</div>
          </div>
        )}
        <div className="rptInfoItem">
          <div className="rptInfoLabel">{lbl.handSinkTemp}</div>
          <div className="rptInfoValue">
            {inspection?.temps?.handSinkTempF ? `${inspection.temps.handSinkTempF}\u00B0F` : "\u2014"}
            {handT >= 95 && <span className="rptCheck">{" \u2705"}</span>}
            {handT > 0 && handT < 95 && <span className="rptWarn">{` \u26A0\uFE0F ${lbl.below95}`}</span>}
          </div>
        </div>
        <div className="rptInfoItem">
          <div className="rptInfoLabel">{lbl.threeCompTemp}</div>
          <div className="rptInfoValue">
            {inspection?.temps?.threeCompSinkTempF ? `${inspection.temps.threeCompSinkTempF}\u00B0F` : "\u2014"}
            {threeT >= 110 && <span className="rptCheck">{" \u2705"}</span>}
            {threeT > 0 && threeT < 110 && <span className="rptWarn">{` \u26A0\uFE0F ${lbl.below110}`}</span>}
          </div>
        </div>
        {inspection?.temps?.iceMakerCleanedDate && (
          <div className="rptInfoItem">
            <div className="rptInfoLabel">{lbl.iceMakerCleaned}</div>
            <div className="rptInfoValue">{inspection.temps.iceMakerCleanedDate}</div>
          </div>
        )}
        {equipTemps.map(et => (
          <div className="rptInfoItem" key={et.key}>
            <div className="rptInfoLabel">{et.label}</div>
            <div className="rptInfoValue">
              {et.tempF}{"\u00B0F"}
              {et.pass && <span className="rptCheck">{" \u2705"}</span>}
              {!et.pass && <span className="rptWarn">{` \u26A0\uFE0F ${lbl.above} ${et.max}\u00B0F ${lbl.maximum}`}</span>}
            </div>
          </div>
        ))}
      </div>

      {/* Opening message for Email/Doc */}
      {(useCase === "Email Summary" || useCase === "Google Doc") && playbook.opening && (
        <div className="rptBlock">
          <p className="rptParagraph">{playbook.opening}</p>
        </div>
      )}

      {/* Full Scorecard Table */}
      <div className="rptBlock">
        <div className="rptBlockTitle">{lbl.inspectionScorecard}</div>
        <div className="rptTableWrap">
          <table className="rptTable">
            <thead>
              <tr>
                <th>{lbl.section}</th>
                <th>{lbl.item}</th>
                <th>{lbl.status}</th>
                <th>{lbl.notes2}</th>
              </tr>
            </thead>
            <tbody>
              {sections.map(sec => {
                const secLabel = sec === "Facility" ? lbl.facility : sec === "Operations" ? lbl.operations : sec === "Equipment" ? lbl.equipment : sec;
                const items = allItems.filter(it => it.section === sec);
                return items.map((it, i) => (
                  <tr key={it.label} className={it.node?.status === "Not Clean" ? "rptRowFail" : it.node?.status === "Needs Attention" ? "rptRowWarn" : ""}>
                    {i === 0 && <td rowSpan={items.length} className="rptSectionCell">{secLabel}</td>}
                    <td>{it.label}</td>
                    <td>
                      <span className={cx("rptStatusPill",
                        it.node?.status === "OK" ? "rptPillPass" :
                        it.node?.status === "Not Clean" ? "rptPillFail" :
                        it.node?.status === "Needs Attention" ? "rptPillWarn" : "rptPillNa"
                      )}>
                        {it.node?.status === "OK" ? lbl.statusOk :
                         it.node?.status === "Not Clean" ? lbl.statusNotClean :
                         it.node?.status === "Needs Attention" ? lbl.statusNeedsAttention :
                         it.node?.status ? it.node.status : lbl.statusNa}
                      </span>
                    </td>
                    <td className="rptNoteCell">{it.node?.notes || "\u2014"}</td>
                  </tr>
                ));
              })}
              {/* Temperature rows */}
              <tr className={handT > 0 && handT < 95 ? "rptRowFail" : ""}>
                <td rowSpan={2} className="rptSectionCell">{lbl.temps}</td>
                <td>{lbl.handSinkTemp}</td>
                <td><span className={cx("rptStatusPill", handT >= 95 ? "rptPillPass" : handT ? "rptPillFail" : "rptPillNa")}>{inspection?.temps?.handSinkTempF ? `${inspection.temps.handSinkTempF}\u00B0F` : lbl.statusNa}</span></td>
                <td className="rptNoteCell">{handT >= 95 ? lbl.meetsMin : handT ? lbl.below95 : "\u2014"}</td>
              </tr>
              <tr className={threeT > 0 && threeT < 110 ? "rptRowFail" : ""}>
                <td>{lbl.threeCompTemp}</td>
                <td><span className={cx("rptStatusPill", threeT >= 110 ? "rptPillPass" : threeT ? "rptPillFail" : "rptPillNa")}>{inspection?.temps?.threeCompSinkTempF ? `${inspection.temps.threeCompSinkTempF}\u00B0F` : lbl.statusNa}</span></td>
                <td className="rptNoteCell">{threeT >= 110 ? lbl.meetsMin : threeT ? lbl.below110 : "\u2014"}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      {/* Findings Summary (only if issues) */}
      {findings.length > 0 && (
        <div className="rptBlock rptBlockAlert">
          <div className="rptBlockTitle rptBlockTitleAlert">{lbl.issuesFound} ({findings.length})</div>
          {findings.map((f, i) => (
            <div className="rptIssueRow" key={i}>
              <span className="rptIssueNum">{i + 1}</span>
              <div className="rptIssueContent">
                <div className="rptIssueName">{f.label} <span className="rptIssueSection">({f.section})</span></div>
                {f.node?.notes && <div className="rptIssueDetail">{f.node.notes}</div>}
              </div>
              <span className={cx("rptStatusPill", f.node?.status === "Not Clean" ? "rptPillFail" : "rptPillWarn")}>{f.node?.status}</span>
            </div>
          ))}
        </div>
      )}

      {/* Action Items */}
      {actionItems.length > 0 && (
        <div className="rptBlock">
          <div className="rptBlockTitle">{lbl.correctiveActions}</div>
          {actionItems.map((a, i) => (
            <div className="rptActionRow" key={i}>
              <span className={cx("rptPriorityDot", a.priority === "High" ? "rptDotHigh" : a.priority === "Follow-up" ? "rptDotFollowup" : "rptDotMed")} />
              <div className="rptActionContent">
                <span className="rptActionText">{a.issue}</span>
                <span className={cx("rptPriorityLabel", a.priority === "High" ? "rptLabelHigh" : a.priority === "Follow-up" ? "rptLabelFollowup" : "rptLabelMed")}>{a.priority === "High" ? lbl.high : a.priority === "Follow-up" ? "Follow-up" : lbl.medium} {a.priority !== "Follow-up" ? lbl.priority : ""}</span>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Photo Evidence */}
      {photoIndexList.length > 0 && (
        <div className="rptBlock">
          <div className="rptBlockTitle">{lbl.photoEvidence} ({photoIndexList.length})</div>
          <div className="rptPhotoGallery">
            {photoIndexList.map(p => (
              <div className="rptPhotoCard" key={p.num}>
                {p.previewUrl ? (
                  <img src={p.previewUrl} alt={`Photo #${p.num}`} className="rptPhotoImg" style={{cursor:"zoom-in"}} onClick={() => setLightboxSrc(p.previewUrl)} />
                ) : (
                  <div className="rptPhotoPlaceholder">{lbl.noPreview}</div>
                )}
                <div className="rptPhotoCaption">
                  <span className="rptPhotoNum">#{p.num}</span>
                  <span>{p.label}{p.caption ? ` \u2014 ${p.caption}` : ""}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Notes – organized by category with bullet points */}
      {rawNotes && (() => {
        const { grouped } = formatNotesStructured(rawNotes);
        const hasBullets = Object.values(grouped).some(arr => arr.length > 0);
        if (!hasBullets) return null;
        return (
          <div className="rptBlock">
            <div className="rptBlockTitle">{lbl.notes}</div>
            <div className="rptNotesOrganized">
              {CATEGORY_ORDER.map(cat => {
                if (!grouped[cat] || !grouped[cat].length) return null;
                return (
                  <div className="rptNoteCategory" key={cat}>
                    <div className={cx("rptNoteCatLabel", `rptNoteCat--${cat}`)}>{CATEGORY_LABELS[cat]}</div>
                    <ul className="rptNoteBullets">
                      {grouped[cat].map((b, i) => <li key={i}>{b}</li>)}
                    </ul>
                  </div>
                );
              })}
            </div>
          </div>
        );
      })()}

      {/* Footer */}
      <div className="rptFooter">
        <div>{lbl.generated} {new Date().toLocaleDateString()} {new Date().toLocaleTimeString()} &middot; Sodexo Kitchen Inspection System</div>
        <div>{lbl.confidential}</div>
      </div>

      {/* Photo Lightbox */}
      {lightboxSrc && (
        <div onClick={() => setLightboxSrc(null)} style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.9)",zIndex:9999,display:"flex",alignItems:"center",justifyContent:"center",cursor:"zoom-out"}}>
          <img src={lightboxSrc} alt="Full size photo" style={{maxWidth:"95vw",maxHeight:"95vh",objectFit:"contain",borderRadius:8,boxShadow:"0 4px 32px rgba(0,0,0,0.5)"}} />
          <button onClick={() => setLightboxSrc(null)} style={{position:"absolute",top:16,right:16,background:"rgba(255,255,255,0.15)",border:"none",color:"#fff",fontSize:28,width:44,height:44,borderRadius:"50%",cursor:"pointer",lineHeight:1}}>×</button>
        </div>
      )}
    </div>
  );
}

/* ── CSV export from inspection data ─────────────────────── */
function buildCsvRows({ inspection, rawNotes, inspectionType, inspectionDate, inspectorName, siteName, siteNumber, supervisorName }) {
  const rows = [["Section", "Item", "Status", "Notes", "Priority"]];
  const add = (section, label, node) => {
    if (!node) return;
    const priority = (node.status === "Not Clean") ? "High" : (node.status === "Needs Attention") ? "Med" : "";
    rows.push([section, label, node.status || "", (node.notes || "").replace(/"/g, '""'), priority]);
  };
  add("Facility", "Ceiling", inspection?.facility?.ceiling);
  add("Facility", "Walls", inspection?.facility?.walls);
  add("Facility", "Floors", inspection?.facility?.floors);
  add("Facility", "Lighting", inspection?.facility?.lighting);
  add("Operations", "Employee practices", inspection?.operations?.employeePractices);
  add("Operations", "Handwashing / supplies", inspection?.operations?.handwashing);
  add("Operations", "Labeling / dating", inspection?.operations?.labelingDating);
  add("Operations", "Logs / documentation", inspection?.operations?.logs);
  add("Equipment", "Double-door cooler", inspection?.equipment?.doubleDoorCooler);
  add("Equipment", "Double-door freezer", inspection?.equipment?.doubleDoorFreezer);
  add("Equipment", "Walk-in cooler", inspection?.equipment?.walkInCooler);
  add("Equipment", "Walk-in freezer", inspection?.equipment?.walkInFreezer);
  add("Equipment", "Prep cooler", inspection?.equipment?.prepCooler);
  add("Equipment", "Warmers / hot holding", inspection?.equipment?.warmers);
  add("Equipment", "Ovens", inspection?.equipment?.ovens);
  add("Equipment", "3-compartment sink", inspection?.equipment?.threeCompSink);
  add("Equipment", "Ecolab / chemicals", inspection?.equipment?.ecolab);
  rows.push(["Temps", "Hand sink (F)", inspection?.temps?.handSinkTempF || "", Number(inspection?.temps?.handSinkTempF) >= 95 ? "Pass" : "Below min", ""]);
  rows.push(["Temps", "3-comp wash (F)", inspection?.temps?.threeCompSinkTempF || "", Number(inspection?.temps?.threeCompSinkTempF) >= 110 ? "Pass" : "Below min", ""]);
  for (const et of collectEquipTemps(inspection)) {
    rows.push(["Temps", `${et.label} (F)`, et.tempF, et.pass ? "Pass" : "Above max", ""]);
  }
  return rows;
}

function exportAsCsv({ inspection, notesPhotos, rawNotes, inspectionType, inspectionDate, inspectorName, participantName, siteName, siteNumber, supervisorName, floor, eventName }) {
  const dataRows = buildCsvRows({ inspection, rawNotes, inspectionType, inspectionDate, inspectorName, siteName, siteNumber, supervisorName });
  const status = calcOverallStatus(inspection);
  const actionItems = buildActionItems({ inspection, rawNotes });
  const { index: photoList } = buildPhotoIndex(inspection, notesPhotos || inspection?._notesPhotos);
  const execSummary = buildExportSummary({ inspection, rawNotes, inspectionType, inspectionDate, siteName });

  // Build an HTML table that Excel understands natively
  const html = `<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:x="urn:schemas-microsoft-com:office:excel" xmlns="http://www.w3.org/TR/REC-html40">
<head><meta charset="utf-8">
<!--[if gte mso 9]><xml><x:ExcelWorkbook><x:ExcelWorksheets><x:ExcelWorksheet>
<x:Name>Inspection</x:Name><x:WorksheetOptions><x:DisplayGridlines/></x:WorksheetOptions>
</x:ExcelWorksheet></x:ExcelWorksheets></x:ExcelWorkbook></xml><![endif]-->
<style>
  td, th { mso-number-format:"\\@"; padding: 6px 10px; border: 1px solid #ccc; font-family: Calibri, Arial; font-size: 11pt; }
  th { background: #2A295C; color: white; font-weight: bold; }
  .section-header { background: #F0F1F5; font-weight: bold; color: #2A295C; font-size: 12pt; }
  .pass { background: #ECFDF5; color: #15803D; font-weight: bold; }
  .fail { background: #FEF2F2; color: #DC2626; font-weight: bold; }
  .warn { background: #FFFBEB; color: #D97706; }
  .meta-label { font-weight: bold; color: #2A295C; background: #F7F8FA; }
  .title { font-size: 16pt; font-weight: bold; color: #2A295C; }
</style></head><body>
<table>
  <tr><td class="title" colspan="5">SODEXO KITCHEN INSPECTION REPORT</td></tr>
  <tr><td colspan="5" style="border-bottom: 3px solid #EE0000; padding: 0;"></td></tr>
  <tr><td class="meta-label">Inspection Type</td><td colspan="4">${inspectionType || ""}</td></tr>
  ${eventName ? `<tr><td class="meta-label">Event</td><td colspan="4">${eventName}</td></tr>` : ""}
  <tr><td class="meta-label">Date</td><td colspan="4">${inspectionDate || ""}</td></tr>
  <tr><td class="meta-label">Inspector</td><td colspan="4">${inspectorName || ""}</td></tr>
  ${participantName ? `<tr><td class="meta-label">Participant</td><td colspan="4">${participantName}</td></tr>` : ""}
  <tr><td class="meta-label">Site / Location</td><td colspan="4">${siteName || ""}</td></tr>
  <tr><td class="meta-label">Unit #</td><td colspan="4">${siteNumber || ""}</td></tr>
  <tr><td class="meta-label">Floor</td><td colspan="4">${floor || ""}</td></tr>
  <tr><td class="meta-label">Supervisor</td><td colspan="4">${supervisorName || ""}</td></tr>
  <tr><td class="meta-label">Overall Status</td><td colspan="4" class="${status === "Pass" ? "pass" : "fail"}">${status}</td></tr>
  <tr><td colspan="5"></td></tr>
  <tr><td class="section-header" colspan="5">EXECUTIVE SUMMARY</td></tr>
  <tr><td colspan="5" style="white-space:pre-wrap;font-size:10pt;background:#F0F4FF;line-height:1.7;padding:12px;">${execSummary.replace(/</g, "&lt;")}</td></tr>
  <tr><td colspan="5"></td></tr>
  <tr><td class="section-header" colspan="5">INSPECTION SCORECARD</td></tr>
  <tr><th>Section</th><th>Item</th><th>Status</th><th>Notes</th><th>Priority</th></tr>
  ${dataRows.slice(1).map(r => {
    const statusClass = r[2] === "OK" ? "pass" : r[2] === "Not Clean" ? "fail" : r[2] === "Needs Attention" ? "warn" : "";
    return `<tr><td>${r[0]}</td><td>${r[1]}</td><td class="${statusClass}">${r[2]}</td><td>${r[3]}</td><td>${r[4]}</td></tr>`;
  }).join("\n  ")}
  <tr><td colspan="5"></td></tr>
  ${actionItems.length > 0 ? `
  <tr><td class="section-header" colspan="5">CORRECTIVE ACTIONS</td></tr>
  <tr><th>#</th><th colspan="3">Issue</th><th>Priority</th></tr>
  ${actionItems.map((a, i) => `<tr><td>${i + 1}</td><td colspan="3">${a.issue}</td><td class="${a.priority === "High" ? "fail" : "warn"}">${a.priority}</td></tr>`).join("\n  ")}
  <tr><td colspan="5"></td></tr>` : ""}
  <tr><td class="section-header" colspan="5">INSPECTOR NOTES</td></tr>
  <tr><td colspan="5" style="white-space:pre-wrap;font-size:10pt;">${formatNotesText(rawNotes).replace(/</g, "&lt;")}</td></tr>
  ${photoList.length > 0 ? (() => {
    // Group photos by section label
    const groups = {};
    const groupOrder = [];
    for (const p of photoList) {
      const sec = p.label || "Other";
      if (!groups[sec]) { groups[sec] = []; groupOrder.push(sec); }
      groups[sec].push(p);
    }
    return `
  <tr><td colspan="5"></td></tr>
  <tr><td class="section-header" colspan="5">PHOTO EVIDENCE (${photoList.length} photos)</td></tr>
  ${groupOrder.map(sec => {
    const photos = groups[sec];
    return `<tr><td class="section-header" colspan="5" style="font-size:10pt;padding-left:12px;">${sec.replace(/</g, "&lt;")} (${photos.length})</td></tr>
  ${photos.map(p => `<tr><td style="text-align:center;font-weight:bold;color:#2A295C;width:40px;">#${p.num}</td><td colspan="2" style="padding:4px;">${p.previewUrl ? `<img src="${p.previewUrl}" width="200" height="150" style="object-fit:cover;border-radius:4px;" />` : `<div style="width:200px;height:150px;background:#F3F4F6;display:inline-block;line-height:150px;text-align:center;color:#9CA3AF;font-size:9pt;">No preview</div>`}</td><td colspan="2" style="font-size:9pt;vertical-align:top;padding-top:8px;">${p.caption ? p.caption.replace(/</g, "&lt;") : ""}</td></tr>`).join("\n  ")}`;
  }).join("\n  ")}`;
  })() : ""}
</table></body></html>`;

  const blob = new Blob([html], { type: "application/vnd.ms-excel" });
  const filename = `inspection_${inspectionDate || "undated"}_${(siteName || "site").replace(/\s+/g, "_")}.xls`;
  downloadBlob(blob, filename);
}

function exportAsHtml({ output, inspection, notesPhotos, rawNotes, inspectionType, inspectionDate, siteName, siteNumber, sitePhone, inspectorName, participantName, supervisorName, eventName }) {
  const status = calcOverallStatus(inspection);
  const actionItems = buildActionItems({ inspection, rawNotes });
  const expandedNotes = expandAbbreviations(rawNotes);
  const { index: photoList } = buildPhotoIndex(inspection, notesPhotos || inspection?._notesPhotos);
  const execSummary = buildExportSummary({ inspection, rawNotes, inspectionType, inspectionDate, siteName });

  const allItems = [
    ["Facility", "Ceiling", inspection?.facility?.ceiling],
    ["Facility", "Walls", inspection?.facility?.walls],
    ["Facility", "Floors", inspection?.facility?.floors],
    ["Facility", "Lighting", inspection?.facility?.lighting],
    ["Operations", "Employee Practices", inspection?.operations?.employeePractices],
    ["Operations", "Handwashing / Supplies", inspection?.operations?.handwashing],
    ["Operations", "Labeling / Dating", inspection?.operations?.labelingDating],
    ["Operations", "Logs / Documentation", inspection?.operations?.logs],
    ["Equipment", "Double-Door Cooler", inspection?.equipment?.doubleDoorCooler],
    ["Equipment", "Double-Door Freezer", inspection?.equipment?.doubleDoorFreezer],
    ["Equipment", "Walk-In Cooler", inspection?.equipment?.walkInCooler],
    ["Equipment", "Walk-In Freezer", inspection?.equipment?.walkInFreezer],
    ["Equipment", "Prep Cooler", inspection?.equipment?.prepCooler],
    ["Equipment", "Warmers / Hot Holding", inspection?.equipment?.warmers],
    ["Equipment", "Ovens", inspection?.equipment?.ovens],
    ["Equipment", "3-Compartment Sink", inspection?.equipment?.threeCompSink],
    ["Equipment", "Ecolab / Chemicals", inspection?.equipment?.ecolab],
  ];
  const findings = allItems.filter(([,,node]) => node?.status && node.status !== "OK" && node.status !== "N/A");
  const handT = Number(inspection?.temps?.handSinkTempF);
  const threeT = Number(inspection?.temps?.threeCompSinkTempF);
  const eTemps = collectEquipTemps(inspection);

  // Generate Word-compatible HTML document
  const html = `<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:w="urn:schemas-microsoft-com:office:word" xmlns="http://www.w3.org/TR/REC-html40">
<head><meta charset="utf-8">
<!--[if gte mso 9]><xml><w:WordDocument><w:View>Print</w:View><w:Zoom>100</w:Zoom></w:WordDocument></xml><![endif]-->
<style>
  @page { size: letter; margin: 1in; }
  body { font-family: Calibri, Arial, sans-serif; font-size: 11pt; color: #1F2937; line-height: 1.5; }
  h1 { color: #2A295C; font-size: 22pt; margin-bottom: 4px; }
  h2 { color: #2A295C; font-size: 14pt; border-bottom: 2px solid #2A295C; padding-bottom: 4px; margin-top: 24px; }
  .red-line { border-bottom: 3px solid #EE0000; margin-bottom: 20px; }
  .info-table { width: 100%; border-collapse: collapse; margin: 16px 0; }
  .info-table td { padding: 8px 12px; border: 1px solid #E5E7EB; font-size: 10pt; }
  .info-label { background: #F7F8FA; font-weight: bold; color: #2A295C; width: 30%; }
  .status-pass { background: #ECFDF5; color: #15803D; font-weight: bold; font-size: 12pt; text-align: center; padding: 10px; }
  .status-fail { background: #FEF2F2; color: #DC2626; font-weight: bold; font-size: 12pt; text-align: center; padding: 10px; }
  table.scorecard { width: 100%; border-collapse: collapse; margin: 12px 0; }
  table.scorecard th { background: #2A295C; color: white; padding: 8px 12px; text-align: left; font-size: 10pt; }
  table.scorecard td { padding: 7px 12px; border: 1px solid #E5E7EB; font-size: 10pt; }
  .sc-section { background: #F0F1F5; font-weight: bold; color: #2A295C; }
  .pill-pass { background: #ECFDF5; color: #15803D; font-weight: bold; padding: 2px 8px; }
  .pill-fail { background: #FEF2F2; color: #DC2626; font-weight: bold; padding: 2px 8px; }
  .pill-warn { background: #FFFBEB; color: #D97706; font-weight: bold; padding: 2px 8px; }
  .pill-na { background: #F3F4F6; color: #9CA3AF; padding: 2px 8px; }
  .issue-num { background: #DC2626; color: white; font-weight: bold; padding: 2px 8px; text-align: center; width: 30px; }
  .notes-box { background: #F7F8FA; padding: 16px; border-left: 3px solid #2A295C; white-space: pre-wrap; font-size: 10pt; line-height: 1.7; }
  .exec-summary { background: #F0F4FF; border: 1px solid #C7D2FE; border-radius: 6px; padding: 16px 20px; margin: 16px 0; font-size: 10pt; line-height: 1.7; color: #1E293B; }
  .exec-summary p { margin: 0 0 8px 0; }
  .photo-grid { display: flex; flex-wrap: wrap; gap: 12px; margin: 12px 0; }
  .photo-card { width: 200px; border: 1px solid #E5E7EB; border-radius: 6px; overflow: hidden; break-inside: avoid; page-break-inside: avoid; }
  .photo-card img { width: 100%; height: 150px; object-fit: cover; display: block; }
  .photo-caption { padding: 6px 8px; font-size: 8pt; color: #4B5563; background: #F9FAFB; }
  .photo-num { font-weight: bold; color: #2A295C; }
  .footer { margin-top: 32px; padding-top: 12px; border-top: 1px solid #E5E7EB; font-size: 8pt; color: #9CA3AF; text-align: center; }
</style></head><body>

<h1>Sodexo Kitchen Inspection Report</h1>
<div class="red-line"></div>

<table class="info-table">
  <tr><td class="info-label">Inspection Type</td><td>${inspectionType || "\u2014"}</td><td class="info-label">Date</td><td>${inspectionDate || "\u2014"}</td></tr>
  ${eventName ? `<tr><td class="info-label">Event</td><td colspan="3"><strong>${eventName}</strong></td></tr>` : ""}
  <tr><td class="info-label">Inspector</td><td>${inspectorName || "\u2014"}</td><td class="info-label">Supervisor</td><td>${supervisorName || "\u2014"}</td></tr>
  ${participantName ? `<tr><td class="info-label">Participant</td><td colspan="3"><strong>${participantName}</strong></td></tr>` : ""}
  <tr><td class="info-label">Site / Location</td><td>${siteName || "\u2014"}</td><td class="info-label">Unit #</td><td>${siteNumber || "\u2014"}</td></tr>
  ${sitePhone ? `<tr><td class="info-label">Phone</td><td>${sitePhone}</td><td></td><td></td></tr>` : ""}
  <tr><td class="info-label">Hand Sink Water Temp</td><td>${inspection?.temps?.handSinkTempF ? inspection.temps.handSinkTempF + "\u00B0F" : "\u2014"} ${handT >= 95 ? "\u2705" : handT ? "\u26A0\uFE0F Below 95\u00B0F" : ""}${inspection?.temps?.handSinkNote?.trim() ? `<br/><span style="font-size:9pt;color:#475569;">${inspection.temps.handSinkNote.trim()}</span>` : ""}</td>
      <td class="info-label">3-Comp Sink Wash Temp</td><td>${inspection?.temps?.threeCompSinkTempF ? inspection.temps.threeCompSinkTempF + "\u00B0F" : "\u2014"} ${threeT >= 110 ? "\u2705" : threeT ? "\u26A0\uFE0F Below 110\u00B0F" : ""}${inspection?.temps?.threeCompSinkNote?.trim() ? `<br/><span style="font-size:9pt;color:#475569;">${inspection.temps.threeCompSinkNote.trim()}</span>` : ""}</td></tr>
  ${eTemps.length > 0 ? eTemps.map((et, i, arr) => {
    if (i % 2 === 0) {
      const next = arr[i + 1];
      const etNote = inspection?.equipment?.[et.key]?.notes?.trim() || "";
      const nextNote = next ? (inspection?.equipment?.[next.key]?.notes?.trim() || "") : "";
      return `<tr><td class="info-label">${et.label}</td><td>${et.tempF}\u00B0F ${et.pass ? "\u2705" : "\u26A0\uFE0F Above " + et.max + "\u00B0F"}${etNote ? `<br/><span style="font-size:9pt;color:#475569;">${etNote}</span>` : ""}</td>${next ? `<td class="info-label">${next.label}</td><td>${next.tempF}\u00B0F ${next.pass ? "\u2705" : "\u26A0\uFE0F Above " + next.max + "\u00B0F"}${nextNote ? `<br/><span style="font-size:9pt;color:#475569;">${nextNote}</span>` : ""}</td>` : `<td></td><td></td>`}</tr>`;
    }
    return "";
  }).filter(Boolean).join("\n  ") : ""}
  <tr><td class="info-label">Overall Status</td><td colspan="3" class="${status === "Pass" ? "status-pass" : "status-fail"}">${status === "Pass" ? "PASSED" : "NEEDS ATTENTION"}</td></tr>
</table>

<h2>Executive Summary</h2>
<div class="exec-summary">
${execSummary.split("\n\n").map(p => `<p>${p.replace(/</g, "&lt;")}</p>`).join("\n")}
</div>

<h2>Inspection Scorecard</h2>
<table class="scorecard">
  <tr><th>Section</th><th>Item</th><th>Status</th><th>Notes</th></tr>
  ${allItems.map(([sec, label, node]) => {
    const st = node?.status || "N/A";
    const cls = st === "OK" ? "pill-pass" : st === "Not Clean" ? "pill-fail" : st === "Needs Attention" ? "pill-warn" : "pill-na";
    return `<tr><td>${sec}</td><td>${label}</td><td><span class="${cls}">${st}</span></td><td>${node?.notes || "\u2014"}</td></tr>`;
  }).join("\n  ")}
  <tr><td>Temps</td><td>Hand Sink</td><td><span class="${handT >= 95 ? "pill-pass" : handT ? "pill-fail" : "pill-na"}">${inspection?.temps?.handSinkTempF ? inspection.temps.handSinkTempF + "\u00B0F" : "N/A"}</span></td><td>${handT >= 95 ? "Meets minimum" : handT ? "Below 95\u00B0F minimum" : "\u2014"}</td></tr>
  <tr><td>Temps</td><td>3-Comp Wash</td><td><span class="${threeT >= 110 ? "pill-pass" : threeT ? "pill-fail" : "pill-na"}">${inspection?.temps?.threeCompSinkTempF ? inspection.temps.threeCompSinkTempF + "\u00B0F" : "N/A"}</span></td><td>${threeT >= 110 ? "Meets minimum" : threeT ? "Below 110\u00B0F minimum" : "\u2014"}</td></tr>
  ${eTemps.map(et => `<tr><td>Temps</td><td>${et.label}</td><td><span class="${et.pass ? "pill-pass" : "pill-fail"}">${et.tempF}\u00B0F</span></td><td>${et.pass ? `Meets \u2264${et.max}\u00B0F` : `Above ${et.max}\u00B0F maximum`}</td></tr>`).join("\n  ")}
</table>

${findings.length > 0 ? `
<h2>Issues Found (${findings.length})</h2>
<table class="scorecard">
  <tr><th>#</th><th>Area</th><th>Item</th><th>Status</th><th>Notes</th></tr>
  ${findings.map(([sec, label, node], i) => `<tr><td class="issue-num">${i + 1}</td><td>${sec}</td><td>${label}</td><td><span class="pill-fail">${node.status}</span></td><td>${node.notes || ""}</td></tr>`).join("\n  ")}
</table>` : `<h2>Issues</h2><p style="background:#ECFDF5;padding:12px;color:#15803D;font-weight:bold;text-align:center;">All areas passed inspection</p>`}

${actionItems.length > 0 ? `
<h2>Corrective Actions Required</h2>
<table class="scorecard">
  <tr><th>#</th><th>Issue</th><th>Priority</th></tr>
  ${actionItems.map((a, i) => `<tr><td style="text-align:center">${i + 1}</td><td>${a.issue}</td><td><span class="${a.priority === "High" ? "pill-fail" : "pill-warn"}">${a.priority}</span></td></tr>`).join("\n  ")}
</table>` : ""}

<h2>Inspector Notes</h2>
${(() => {
  const { grouped } = formatNotesStructured(rawNotes);
  const cats = CATEGORY_ORDER.filter(c => grouped[c]?.length);
  if (!cats.length) return `<div class="notes-box">\u2014</div>`;
  return cats.map(cat => `<div style="margin-bottom:12px;"><p style="font-weight:bold;color:#2A295C;font-size:10pt;margin:0 0 4px 0;">${CATEGORY_LABELS[cat]}</p><ul style="margin:0;padding-left:20px;">${grouped[cat].map(b => `<li style="margin-bottom:4px;font-size:10pt;line-height:1.5;">${b.replace(/</g, "&lt;")}</li>`).join("")}</ul></div>`).join("");
})()}

${photoList.length > 0 ? (() => {
  // Group photos by section label
  const groups = {};
  const groupOrder = [];
  for (const p of photoList) {
    const sec = p.label || "Other";
    if (!groups[sec]) { groups[sec] = []; groupOrder.push(sec); }
    groups[sec].push(p);
  }
  return `<h2>Photo Evidence (${photoList.length} photos)</h2>
${groupOrder.map(sec => {
  const photos = groups[sec];
  return `<div style="margin-bottom:20px;">
<p style="font-weight:bold;color:#2A295C;font-size:11pt;margin:0 0 8px 0;border-bottom:1px solid #E5E7EB;padding-bottom:4px;">${sec.replace(/</g, "&lt;")} <span style="font-weight:normal;color:#64748b;font-size:9pt;">(${photos.length} photo${photos.length !== 1 ? "s" : ""})</span></p>
<div class="photo-grid">
${photos.map(p => `<div class="photo-card">${p.previewUrl ? `<img src="${p.previewUrl}" alt="Photo #${p.num}" />` : `<div style="width:200px;height:150px;background:#F3F4F6;display:flex;align-items:center;justify-content:center;color:#9CA3AF;font-size:9pt;">No preview</div>`}<div class="photo-caption"><span class="photo-num">#${p.num}</span>${p.caption ? ` \u2014 ${p.caption.replace(/</g, "&lt;")}` : ""}</div></div>`).join("\n")}
</div>
</div>`;
}).join("\n")}`;
})() : ""}

<div class="footer">
  <p>Generated ${new Date().toLocaleDateString()} ${new Date().toLocaleTimeString()} \u2022 Sodexo Kitchen Inspection System</p>
  <p>This report is confidential and intended for internal use only.</p>
</div>
</body></html>`;

  const blob = new Blob([html], { type: "application/msword" });
  const filename = `inspection_${inspectionDate || "undated"}_${(siteName || "site").replace(/\s+/g, "_")}.doc`;
  downloadBlob(blob, filename);
}

function exportAsTxt({ output, inspectionDate, siteName }) {
  const blob = new Blob([output || ""], { type: "text/plain;charset=utf-8;" });
  const filename = `inspection_${inspectionDate || "undated"}_${(siteName || "site").replace(/\s+/g, "_")}.txt`;
  downloadBlob(blob, filename);
}

// Issues-only Excel export (from a saved history record)
function exportIssuesOnlyExcel({ rec }) {
  const actionItems = rec.actionItems || [];
  const siteName = rec.siteName || "—";
  const inspectionDate = rec.inspectionDate || "—";
  const inspectorName = rec.inspectorName || "—";
  const supervisorName = rec.supervisorName || "—";
  const { index: photoList } = buildPhotoIndex(rec.inspection);

  // Group photos by section
  const photoGroups = {};
  const photoGroupOrder = [];
  for (const p of photoList) {
    const sec = p.label || "Other";
    if (!photoGroups[sec]) { photoGroups[sec] = []; photoGroupOrder.push(sec); }
    photoGroups[sec].push(p);
  }

  const html = `<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:x="urn:schemas-microsoft-com:office:excel" xmlns="http://www.w3.org/TR/REC-html40">
<head><meta charset="utf-8">
<!--[if gte mso 9]><xml><x:ExcelWorkbook><x:ExcelWorksheets><x:ExcelWorksheet>
<x:Name>Issues</x:Name><x:WorksheetOptions><x:DisplayGridlines/></x:WorksheetOptions>
</x:ExcelWorksheet></x:ExcelWorksheets></x:ExcelWorkbook></xml><![endif]-->
<style>
  td, th { mso-number-format:"\\@"; padding: 6px 10px; border: 1px solid #ccc; font-family: Calibri, Arial; font-size: 11pt; }
  th { background: #2A295C; color: white; font-weight: bold; }
  .title { font-size: 16pt; font-weight: bold; color: #2A295C; }
  .meta-label { font-weight: bold; color: #2A295C; background: #F7F8FA; }
  .section-header { background: #F0F1F5; font-weight: bold; color: #2A295C; font-size: 11pt; }
  .high { background: #FEF2F2; color: #DC2626; font-weight: bold; }
  .med { background: #FFFBEB; color: #D97706; font-weight: bold; }
  .ok { background: #ECFDF5; color: #15803D; font-weight: bold; text-align: center; }
</style></head><body>
<table>
  <tr><td class="title" colspan="3">INSPECTION ISSUES — ${siteName.replace(/</g, "&lt;")}</td></tr>
  <tr><td colspan="3" style="border-bottom: 3px solid #EE0000; padding: 0;"></td></tr>
  <tr><td class="meta-label">Date</td><td colspan="2">${inspectionDate}</td></tr>
  <tr><td class="meta-label">Inspector</td><td colspan="2">${inspectorName.replace(/</g, "&lt;")}</td></tr>
  <tr><td class="meta-label">Supervisor</td><td colspan="2">${supervisorName.replace(/</g, "&lt;")}</td></tr>
  <tr><td class="meta-label">Overall Status</td><td colspan="2" class="${rec.overallStatus === "Pass" ? "ok" : "high"}">${rec.overallStatus || "—"}</td></tr>
  <tr><td colspan="3"></td></tr>
  ${actionItems.length > 0 ? `
  <tr><th>#</th><th>Issue</th><th>Priority</th></tr>
  ${actionItems.map((a, i) => `<tr><td style="text-align:center">${i + 1}</td><td>${(a.issue || "").replace(/</g, "&lt;")}</td><td class="${a.priority === "High" ? "high" : "med"}">${a.priority}</td></tr>`).join("\n  ")}
  ` : `<tr><td colspan="3" class="ok">No issues — all areas passed inspection ✓</td></tr>`}
  ${photoList.length > 0 ? `
  <tr><td colspan="3"></td></tr>
  <tr><td class="section-header" colspan="3">PHOTO EVIDENCE (${photoList.length} photos)</td></tr>
  ${photoGroupOrder.map(sec => {
    const photos = photoGroups[sec];
    return `<tr><td class="section-header" colspan="3" style="font-size:10pt;padding-left:12px;">${sec.replace(/</g, "&lt;")} (${photos.length})</td></tr>
  ${photos.map(p => `<tr><td style="text-align:center;font-weight:bold;color:#2A295C;width:40px;">#${p.num}</td><td style="padding:4px;">${p.previewUrl ? `<img src="${p.previewUrl}" width="200" height="150" style="object-fit:cover;border-radius:4px;" />` : `<div style="width:200px;height:150px;background:#F3F4F6;display:inline-block;line-height:150px;text-align:center;color:#9CA3AF;font-size:9pt;">No preview</div>`}</td><td style="font-size:9pt;vertical-align:top;padding-top:8px;">${p.caption ? p.caption.replace(/</g, "&lt;") : ""}</td></tr>`).join("\n  ")}`;
  }).join("\n  ")}` : ""}
</table></body></html>`;

  const blob = new Blob([html], { type: "application/vnd.ms-excel" });
  const filename = `issues_${inspectionDate || "undated"}_${(rec.siteName || "site").replace(/\s+/g, "_")}.xls`;
  downloadBlob(blob, filename);
}

// Issues-only Word export (from a saved history record)
function exportIssuesOnlyWord({ rec }) {
  const actionItems = rec.actionItems || [];
  const siteName = rec.siteName || "—";
  const inspectionDate = rec.inspectionDate || "—";
  const inspectorName = rec.inspectorName || "—";
  const supervisorName = rec.supervisorName || "—";
  const { index: photoList } = buildPhotoIndex(rec.inspection);

  // Group photos by section
  const photoGroups = {};
  const photoGroupOrder = [];
  for (const p of photoList) {
    const sec = p.label || "Other";
    if (!photoGroups[sec]) { photoGroups[sec] = []; photoGroupOrder.push(sec); }
    photoGroups[sec].push(p);
  }

  const html = `<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:w="urn:schemas-microsoft-com:office:word" xmlns="http://www.w3.org/TR/REC-html40">
<head><meta charset="utf-8">
<!--[if gte mso 9]><xml><w:WordDocument><w:View>Print</w:View><w:Zoom>100</w:Zoom></w:WordDocument></xml><![endif]-->
<style>
  @page { size: letter; margin: 1in; }
  body { font-family: Calibri, Arial, sans-serif; font-size: 11pt; color: #1F2937; line-height: 1.5; }
  h1 { color: #2A295C; font-size: 20pt; margin-bottom: 4px; }
  h2 { color: #2A295C; font-size: 13pt; border-bottom: 2px solid #2A295C; padding-bottom: 4px; margin-top: 20px; }
  .red-line { border-bottom: 3px solid #EE0000; margin-bottom: 16px; }
  .info-table { width: 100%; border-collapse: collapse; margin: 12px 0; }
  .info-table td { padding: 7px 12px; border: 1px solid #E5E7EB; font-size: 10pt; }
  .info-label { background: #F7F8FA; font-weight: bold; color: #2A295C; width: 30%; }
  table.issues { width: 100%; border-collapse: collapse; margin: 12px 0; }
  table.issues th { background: #2A295C; color: white; padding: 8px 12px; text-align: left; font-size: 10pt; }
  table.issues td { padding: 7px 12px; border: 1px solid #E5E7EB; font-size: 10pt; }
  .pill-high { background: #FEF2F2; color: #DC2626; font-weight: bold; padding: 2px 8px; }
  .pill-med { background: #FFFBEB; color: #D97706; font-weight: bold; padding: 2px 8px; }
  .status-pass { background: #ECFDF5; color: #15803D; font-weight: bold; font-size: 12pt; text-align: center; padding: 10px; }
  .status-fail { background: #FEF2F2; color: #DC2626; font-weight: bold; font-size: 12pt; text-align: center; padding: 10px; }
  .photo-grid { display: flex; flex-wrap: wrap; gap: 12px; margin: 8px 0 16px 0; }
  .photo-card { width: 200px; border: 1px solid #E5E7EB; border-radius: 6px; overflow: hidden; break-inside: avoid; page-break-inside: avoid; }
  .photo-card img { width: 100%; height: 150px; object-fit: cover; display: block; }
  .photo-caption { padding: 6px 8px; font-size: 8pt; color: #4B5563; background: #F9FAFB; }
  .photo-num { font-weight: bold; color: #2A295C; }
  .footer { margin-top: 32px; padding-top: 12px; border-top: 1px solid #E5E7EB; font-size: 8pt; color: #9CA3AF; text-align: center; }
</style></head><body>
<h1>Inspection Issues Report</h1>
<div class="red-line"></div>
<table class="info-table">
  <tr><td class="info-label">Site / Location</td><td>${siteName.replace(/</g, "&lt;")}</td><td class="info-label">Date</td><td>${inspectionDate}</td></tr>
  <tr><td class="info-label">Inspector</td><td>${inspectorName.replace(/</g, "&lt;")}</td><td class="info-label">Supervisor</td><td>${supervisorName.replace(/</g, "&lt;")}</td></tr>
  <tr><td class="info-label">Overall Status</td><td colspan="3" class="${rec.overallStatus === "Pass" ? "status-pass" : "status-fail"}">${rec.overallStatus === "Pass" ? "PASSED" : "NEEDS ATTENTION"}</td></tr>
</table>

${actionItems.length > 0 ? `
<h2>Issues &amp; Corrective Actions (${actionItems.length})</h2>
<table class="issues">
  <tr><th>#</th><th>Issue</th><th>Priority</th></tr>
  ${actionItems.map((a, i) => `<tr><td style="text-align:center;width:40px">${i + 1}</td><td>${(a.issue || "").replace(/</g, "&lt;")}</td><td><span class="${a.priority === "High" ? "pill-high" : "pill-med"}">${a.priority}</span></td></tr>`).join("\n  ")}
</table>` : `<h2>Issues</h2><p style="background:#ECFDF5;padding:12px;color:#15803D;font-weight:bold;text-align:center;">All areas passed — no issues found ✓</p>`}

${photoList.length > 0 ? `<h2>Photo Evidence (${photoList.length} photos)</h2>
${photoGroupOrder.map(sec => {
  const photos = photoGroups[sec];
  return `<div style="margin-bottom:20px;">
<p style="font-weight:bold;color:#2A295C;font-size:11pt;margin:0 0 8px 0;border-bottom:1px solid #E5E7EB;padding-bottom:4px;">${sec.replace(/</g, "&lt;")} <span style="font-weight:normal;color:#64748b;font-size:9pt;">(${photos.length} photo${photos.length !== 1 ? "s" : ""})</span></p>
<div class="photo-grid">
${photos.map(p => `<div class="photo-card">${p.previewUrl ? `<img src="${p.previewUrl}" alt="Photo #${p.num}" />` : `<div style="width:200px;height:150px;background:#F3F4F6;display:flex;align-items:center;justify-content:center;color:#9CA3AF;font-size:9pt;">No preview</div>`}<div class="photo-caption"><span class="photo-num">#${p.num}</span>${p.caption ? ` \u2014 ${p.caption.replace(/</g, "&lt;")}` : ""}</div></div>`).join("\n")}
</div>
</div>`;
}).join("\n")}` : ""}

<div class="footer">
  <p>Generated ${new Date().toLocaleDateString()} ${new Date().toLocaleTimeString()} &bull; Sodexo Kitchen Inspection System</p>
</div>
</body></html>`;

  const blob = new Blob([html], { type: "application/msword" });
  const filename = `issues_${inspectionDate || "undated"}_${(rec.siteName || "site").replace(/\s+/g, "_")}.doc`;
  downloadBlob(blob, filename);
}

/* ── Temperature Trend Chart (pure SVG) ─────────────────── */
function TempTrendChart({ history }) {
  const [hoveredPoint, setHoveredPoint] = useState(null);
  const [focusedLine, setFocusedLine] = useState(null); // null | "hand" | "three" | "cooler" | "freezer"
  const [selectedLoc, setSelectedLoc] = useState(null); // active location (null = use first)
  const [locSearch, setLocSearch] = useState(""); // text filter for location search
  const [showLocDropdown, setShowLocDropdown] = useState(false); // show filtered list

  // Group by location+unit+floor, sorted by date
  const locationData = useMemo(() => {
    const map = {};
    for (const rec of history) {
      const unitNum = rec.siteNumber || "";
      const key = `${rec.siteName || rec.location || "Unknown"}${unitNum ? ` #${unitNum}` : ""}${rec.floor ? ` - ${rec.floor}` : ""}`;
      if (!map[key]) map[key] = { points: [], unitNum };
      const hand = Number(rec.temps?.handSinkTempF);
      const three = Number(rec.temps?.threeCompSinkTempF);
      // Collect cooler/freezer temps from equipment items (per-equipment)
      let coolTemps = [], frzTemps = [];
      // Support new per-equipment temps
      const equip = rec.inspection?.equipment || {};
      for (const [ek, node] of Object.entries(equip)) {
        if (!node?.tempF) continue;
        const t = Number(node.tempF);
        if (!t) continue;
        const cold = COLD_EQUIPMENT[ek] || (ek.startsWith("custom_") ? detectColdType(node.label) : null);
        if (cold?.type === "cooler") coolTemps.push(t);
        else if (cold?.type === "freezer") frzTemps.push(t);
      }
      // Fallback: old records may have temps.coolerTempF / freezerTempF
      if (!coolTemps.length && rec.temps?.coolerTempF) { const v = Number(rec.temps.coolerTempF); if (v) coolTemps.push(v); }
      if (!frzTemps.length && rec.temps?.freezerTempF) { const v = Number(rec.temps.freezerTempF); if (v) frzTemps.push(v); }
      const coolAvg = coolTemps.length ? Math.round(coolTemps.reduce((a, b) => a + b, 0) / coolTemps.length) : null;
      const frzAvg = frzTemps.length ? Math.round(frzTemps.reduce((a, b) => a + b, 0) / frzTemps.length) : null;
      if (hand || three || coolAvg || frzAvg) {
        map[key].points.push({
          date: rec.inspectionDate || rec.savedAt?.slice(0, 10) || "—",
          handSink: hand || null,
          threeComp: three || null,
          cooler: coolAvg,
          freezer: frzAvg,
          floor: rec.floor || "",
          status: rec.overallStatus || "—",
        });
      }
    }
    for (const k of Object.keys(map)) {
      map[k].points.sort((a, b) => a.date.localeCompare(b.date));
    }
    return map;
  }, [history]);

  const locations = Object.keys(locationData);
  if (locations.length === 0) return null;

  // Determine which location is active
  const activeLoc = (selectedLoc && locations.includes(selectedLoc)) ? selectedLoc : locations[0];

  const W = 500, H = 220, PAD = 45, PADR = 20, PADT = 20, PADB = 50;

  // Build a quick "at a glance" summary across all locations (latest reading per location)
  const glanceSummary = useMemo(() => {
    let handTemps = [], threeTemps = [], coolerTemps = [], freezerTemps = [];
    for (const loc of locations) {
      const pts = locationData[loc].points;
      const latest = pts[pts.length - 1];
      if (!latest) continue;
      if (latest.handSink) handTemps.push(latest.handSink);
      if (latest.threeComp) threeTemps.push(latest.threeComp);
      if (latest.cooler) coolerTemps.push(latest.cooler);
      if (latest.freezer) freezerTemps.push(latest.freezer);
    }
    const avg = arr => arr.length ? Math.round(arr.reduce((a,b)=>a+b,0)/arr.length) : null;
    return {
      hand: avg(handTemps), handPass: handTemps.length ? handTemps.every(t=>t>=95) : null,
      three: avg(threeTemps), threePass: threeTemps.length ? threeTemps.every(t=>t>=110) : null,
      cooler: avg(coolerTemps), coolerPass: coolerTemps.length ? coolerTemps.every(t=>t<=40) : null,
      freezer: avg(freezerTemps), freezerPass: freezerTemps.length ? freezerTemps.every(t=>t<=20) : null,
    };
  }, [locations, locationData]);

  const anyAlert = (glanceSummary.handPass === false || glanceSummary.threePass === false || glanceSummary.coolerPass === false || glanceSummary.freezerPass === false);

  // Compute per-location data for the active location only
  const { points: activePoints, unitNum: activeUnitNum } = locationData[activeLoc] || { points: [], unitNum: "" };
  const activeAllTemps = activePoints.flatMap(p => [p.handSink, p.threeComp, p.cooler, p.freezer]).filter(Boolean);
  const activeMinT = activeAllTemps.length ? Math.min(...activeAllTemps, 0) - 5 : -5;
  const activeMaxT = activeAllTemps.length ? Math.max(...activeAllTemps, 115) + 5 : 120;
  const activeRangeT = activeMaxT - activeMinT || 1;
  const activeXStep = activePoints.length > 1 ? (W - PAD - PADR) / (activePoints.length - 1) : (W - PAD - PADR) / 2;
  const activeXOff = activePoints.length === 1 ? (W - PAD - PADR) / 2 : 0;
  const toX = (i) => PAD + activeXOff + i * activeXStep;
  const toY = (t) => PADT + (H - PADT - PADB) * (1 - (t - activeMinT) / activeRangeT);
  const handCoords = activePoints.map((p, i) => p.handSink ? [toX(i), toY(p.handSink)] : null).filter(Boolean);
  const threeCoords = activePoints.map((p, i) => p.threeComp ? [toX(i), toY(p.threeComp)] : null).filter(Boolean);
  const coolerCoords = activePoints.map((p, i) => p.cooler ? [toX(i), toY(p.cooler)] : null).filter(Boolean);
  const freezerCoords = activePoints.map((p, i) => p.freezer ? [toX(i), toY(p.freezer)] : null).filter(Boolean);
  const toPath = (coords) => coords.map((c, i) => `${i === 0 ? "M" : "L"}${c[0]},${c[1]}`).join(" ");
  const toAreaPath = (coords) => {
    if (coords.length < 2) return "";
    const bottom = H - PADB;
    return `${toPath(coords)} L${coords[coords.length - 1][0]},${bottom} L${coords[0][0]},${bottom} Z`;
  };
  const activeGridSteps = [];
  for (let t = Math.ceil(activeMinT / 10) * 10; t <= activeMaxT; t += 10) activeGridSteps.push(t);
  const handAvg = handCoords.length > 0 ? Math.round(activePoints.reduce((s, p) => s + (p.handSink || 0), 0) / activePoints.filter(p => p.handSink).length) : null;
  const threeAvg = threeCoords.length > 0 ? Math.round(activePoints.reduce((s, p) => s + (p.threeComp || 0), 0) / activePoints.filter(p => p.threeComp).length) : null;
  const coolerAvg = coolerCoords.length > 0 ? Math.round(activePoints.reduce((s, p) => s + (p.cooler || 0), 0) / activePoints.filter(p => p.cooler).length) : null;
  const freezerAvg = freezerCoords.length > 0 ? Math.round(activePoints.reduce((s, p) => s + (p.freezer || 0), 0) / activePoints.filter(p => p.freezer).length) : null;
  const locKey = activeLoc.replace(/\W/g, "");

  return (
    <div className="card" style={{ marginBottom: 24, border: anyAlert ? "2px solid #fca5a5" : undefined }}>
      {/* Card header — title + optional dropdown */}
      <div className="cardHeader" style={{ borderBottom: "1px solid #f3f4f6", paddingBottom: "0.75rem" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", flex: 1, minWidth: 0 }}>
          <span style={{ fontSize: "1.3rem" }}>🌡️</span>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div className="cardTitle" style={{ fontSize: "1.05rem" }}>Temperature Monitoring</div>
            <div style={{ fontSize: "0.72rem", color: "#6b7280", marginTop: 2 }}>
              {locations.length} location{locations.length !== 1 ? "s" : ""} — tap a pill to highlight a line
            </div>
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
          {locations.length > 1 && (
            <div style={{ position: "relative" }}>
              <input
                type="text"
                placeholder="Search location…"
                value={locSearch || (showLocDropdown ? "" : activeLoc)}
                onFocus={() => { setLocSearch(""); setShowLocDropdown(true); }}
                onChange={e => { setLocSearch(e.target.value); setShowLocDropdown(true); }}
                onBlur={() => { setTimeout(() => setShowLocDropdown(false), 150); }}
                style={{
                  fontSize: "0.78rem",
                  fontWeight: 600,
                  color: "#2A295C",
                  background: "#f0f1f8",
                  border: "1.5px solid #c7c9e3",
                  borderRadius: 8,
                  padding: "0.3rem 0.55rem",
                  width: 190,
                  outline: "none",
                }}
              />
              {showLocDropdown && (
                <div style={{
                  position: "absolute",
                  top: "110%",
                  right: 0,
                  background: "#fff",
                  border: "1.5px solid #c7c9e3",
                  borderRadius: 8,
                  zIndex: 99,
                  minWidth: 220,
                  maxHeight: 220,
                  overflowY: "auto",
                  boxShadow: "0 4px 16px rgba(0,0,0,0.13)",
                }}>
                  {locations
                    .filter(loc => loc.toLowerCase().includes((locSearch || "").toLowerCase()))
                    .map(loc => {
                      const uNum = locationData[loc]?.unitNum;
                      // Split display: unit badge + name
                      const dispName = uNum ? loc.replace(` #${uNum}`, "") : loc;
                      return (
                        <div
                          key={loc}
                          onMouseDown={() => { setSelectedLoc(loc); setLocSearch(""); setShowLocDropdown(false); }}
                          style={{
                            padding: "0.45rem 0.75rem",
                            display: "flex",
                            alignItems: "center",
                            gap: 6,
                            fontWeight: loc === activeLoc ? 700 : 500,
                            color: loc === activeLoc ? "#2A295C" : "#374151",
                            background: loc === activeLoc ? "#f0f1f8" : "transparent",
                            cursor: "pointer",
                            borderBottom: "1px solid #f3f4f6",
                          }}
                        >
                          {uNum && (
                            <span style={{ background: "#2A295C", color: "#fff", borderRadius: 5, padding: "1px 6px", fontSize: "0.72rem", fontWeight: 800, flexShrink: 0 }}>
                              #{uNum}
                            </span>
                          )}
                          <span style={{ fontSize: "0.78rem" }}>{dispName}</span>
                        </div>
                      );
                    })}
                  {locations.filter(loc => loc.toLowerCase().includes((locSearch || "").toLowerCase())).length === 0 && (
                    <div style={{ padding: "0.5rem 0.75rem", fontSize: "0.75rem", color: "#9ca3af" }}>No matches</div>
                  )}
                </div>
              )}
            </div>
          )}
          {anyAlert && (
            <span style={{ background: "#fee2e2", color: "#dc2626", borderRadius: 6, padding: "0.25rem 0.65rem", fontSize: "0.75rem", fontWeight: 700, whiteSpace: "nowrap" }}>⚠️ Temp Alert</span>
          )}
        </div>
      </div>

      {/* At-a-glance summary row — averages across ALL locations */}
      <div style={{ display: "flex", alignItems: "stretch", gap: "0.5rem", padding: "0.85rem 1rem", borderBottom: "1px solid #f3f4f6" }}>
        <div style={{ fontSize: "0.7rem", color: "#9ca3af", display: "flex", alignItems: "center", marginRight: 2, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.04em", flexShrink: 0 }}>All Avgs:</div>
        {glanceSummary.hand !== null && (
          <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", background: glanceSummary.handPass ? "#dbeafe" : "#fee2e2", borderRadius: 10, padding: "0.35rem 0.4rem", minWidth: 0, border: glanceSummary.handPass ? "1px solid #93c5fd" : "1px solid #fca5a5" }}>
            <span style={{ fontSize: "0.6rem", color: glanceSummary.handPass ? "#1d4ed8" : "#dc2626", fontWeight: 600, textTransform: "uppercase", textAlign: "center" }}>Hand Sink</span>
            <span style={{ fontSize: "1.1rem", fontWeight: 800, color: glanceSummary.handPass ? "#1d4ed8" : "#dc2626", lineHeight: 1.2 }}>{glanceSummary.hand}°F</span>
            <span style={{ fontSize: "0.55rem", color: glanceSummary.handPass ? "#1d4ed8" : "#dc2626", textAlign: "center" }}>{glanceSummary.handPass ? "✓ min 95°F" : "✗ min 95°F"}</span>
          </div>
        )}
        {glanceSummary.three !== null && (
          <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", background: glanceSummary.threePass ? "#ede9fe" : "#fee2e2", borderRadius: 10, padding: "0.35rem 0.4rem", minWidth: 0, border: glanceSummary.threePass ? "1px solid #c4b5fd" : "1px solid #fca5a5" }}>
            <span style={{ fontSize: "0.6rem", color: glanceSummary.threePass ? "#7c3aed" : "#dc2626", fontWeight: 600, textTransform: "uppercase", textAlign: "center" }}>3-Comp</span>
            <span style={{ fontSize: "1.1rem", fontWeight: 800, color: glanceSummary.threePass ? "#7c3aed" : "#dc2626", lineHeight: 1.2 }}>{glanceSummary.three}°F</span>
            <span style={{ fontSize: "0.55rem", color: glanceSummary.threePass ? "#7c3aed" : "#dc2626", textAlign: "center" }}>{glanceSummary.threePass ? "✓ min 110°F" : "✗ min 110°F"}</span>
          </div>
        )}
        {glanceSummary.cooler !== null && (
          <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", background: glanceSummary.coolerPass ? "#d1fae5" : "#fee2e2", borderRadius: 10, padding: "0.35rem 0.4rem", minWidth: 0, border: glanceSummary.coolerPass ? "1px solid #6ee7b7" : "1px solid #fca5a5" }}>
            <span style={{ fontSize: "0.6rem", color: glanceSummary.coolerPass ? "#059669" : "#dc2626", fontWeight: 600, textTransform: "uppercase", textAlign: "center" }}>Cooler</span>
            <span style={{ fontSize: "1.1rem", fontWeight: 800, color: glanceSummary.coolerPass ? "#059669" : "#dc2626", lineHeight: 1.2 }}>{glanceSummary.cooler}°F</span>
            <span style={{ fontSize: "0.55rem", color: glanceSummary.coolerPass ? "#059669" : "#dc2626", textAlign: "center" }}>{glanceSummary.coolerPass ? "✓ max 40°F" : "✗ max 40°F"}</span>
          </div>
        )}
        {glanceSummary.freezer !== null && (
          <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", background: glanceSummary.freezerPass ? "#cffafe" : "#fee2e2", borderRadius: 10, padding: "0.35rem 0.4rem", minWidth: 0, border: glanceSummary.freezerPass ? "1px solid #67e8f9" : "1px solid #fca5a5" }}>
            <span style={{ fontSize: "0.6rem", color: glanceSummary.freezerPass ? "#0891b2" : "#dc2626", fontWeight: 600, textTransform: "uppercase", textAlign: "center" }}>Freezer</span>
            <span style={{ fontSize: "1.1rem", fontWeight: 800, color: glanceSummary.freezerPass ? "#0891b2" : "#dc2626", lineHeight: 1.2 }}>{glanceSummary.freezer}°F</span>
            <span style={{ fontSize: "0.55rem", color: glanceSummary.freezerPass ? "#0891b2" : "#dc2626", textAlign: "center" }}>{glanceSummary.freezerPass ? "✓ max 20°F" : "✗ max 20°F"}</span>
          </div>
        )}
        {glanceSummary.hand === null && glanceSummary.three === null && glanceSummary.cooler === null && glanceSummary.freezer === null && (
          <span style={{ fontSize: "0.8rem", color: "#9ca3af" }}>No temperature data in the current filter</span>
        )}
      </div>

      <div className="cardBody">
        {/* Single chart for the active location */}
        <div className="tempChartItem" style={{ background: "transparent", border: "none", boxShadow: "none", padding: 0 }}>
          {/* Location + unit header */}
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
            {activeUnitNum && (
              <span style={{ background: "#2A295C", color: "#fff", borderRadius: 6, padding: "2px 10px", fontSize: "0.82rem", fontWeight: 800, letterSpacing: "0.03em" }}>
                Unit #{activeUnitNum}
              </span>
            )}
            <span style={{ fontWeight: 700, fontSize: "0.85rem", color: "#1e293b" }}>
              {activeUnitNum ? activeLoc.replace(` #${activeUnitNum}`, "") : activeLoc}
            </span>
          </div>
          {/* Per-location avg pills + reading count */}
          <div className="tempChartAvgs" style={{ marginBottom: 8 }}>
            {handAvg !== null && <span className={cx("tempAvgPill", "tempAvgPillClickable", focusedLine === "hand" && "tempAvgPillActive")} style={{ background: focusedLine === "hand" ? "#3b82f6" : handAvg >= 95 ? "#dbeafe" : "#fee2e2", color: focusedLine === "hand" ? "#fff" : handAvg >= 95 ? "#1d4ed8" : "#dc2626" }} onClick={() => setFocusedLine(focusedLine === "hand" ? null : "hand")}>Avg Hand: {handAvg}°F</span>}
            {threeAvg !== null && <span className={cx("tempAvgPill", "tempAvgPillClickable", focusedLine === "three" && "tempAvgPillActive")} style={{ background: focusedLine === "three" ? "#8b5cf6" : threeAvg >= 110 ? "#ede9fe" : "#fee2e2", color: focusedLine === "three" ? "#fff" : threeAvg >= 110 ? "#7c3aed" : "#dc2626" }} onClick={() => setFocusedLine(focusedLine === "three" ? null : "three")}>Avg 3-Comp: {threeAvg}°F</span>}
            {coolerAvg !== null && <span className={cx("tempAvgPill", "tempAvgPillClickable", focusedLine === "cooler" && "tempAvgPillActive")} style={{ background: focusedLine === "cooler" ? "#059669" : coolerAvg <= 40 ? "#d1fae5" : "#fee2e2", color: focusedLine === "cooler" ? "#fff" : coolerAvg <= 40 ? "#059669" : "#dc2626" }} onClick={() => setFocusedLine(focusedLine === "cooler" ? null : "cooler")}>Avg Cooler: {coolerAvg}°F</span>}
            {freezerAvg !== null && <span className={cx("tempAvgPill", "tempAvgPillClickable", focusedLine === "freezer" && "tempAvgPillActive")} style={{ background: focusedLine === "freezer" ? "#0891b2" : freezerAvg <= 20 ? "#cffafe" : "#fee2e2", color: focusedLine === "freezer" ? "#fff" : freezerAvg <= 20 ? "#0891b2" : "#dc2626" }} onClick={() => setFocusedLine(focusedLine === "freezer" ? null : "freezer")}>Avg Freezer: {freezerAvg}°F</span>}
            <span className="tempAvgPill" style={{ background: "#f0fdf4", color: "#15803d" }}>{activePoints.length} reading{activePoints.length !== 1 ? "s" : ""}</span>
          </div>
          <svg viewBox={`0 0 ${W} ${H}`} className="tempChartSvg" onMouseLeave={() => setHoveredPoint(null)}>
            <defs>
              <linearGradient id={`handGrad-${locKey}`} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#3b82f6" stopOpacity="0.25" />
                <stop offset="100%" stopColor="#3b82f6" stopOpacity="0.02" />
              </linearGradient>
              <linearGradient id={`threeGrad-${locKey}`} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#8b5cf6" stopOpacity="0.25" />
                <stop offset="100%" stopColor="#8b5cf6" stopOpacity="0.02" />
              </linearGradient>
              <linearGradient id={`coolerGrad-${locKey}`} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#059669" stopOpacity="0.25" />
                <stop offset="100%" stopColor="#059669" stopOpacity="0.02" />
              </linearGradient>
              <linearGradient id={`freezerGrad-${locKey}`} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#0891b2" stopOpacity="0.25" />
                <stop offset="100%" stopColor="#0891b2" stopOpacity="0.02" />
              </linearGradient>
            </defs>

            {/* Grid lines */}
            {activeGridSteps.map(t => (
              <g key={t}>
                <line x1={PAD} y1={toY(t)} x2={W - PADR} y2={toY(t)} stroke="#e5e7eb" strokeWidth="1" />
                <text x={PAD - 6} y={toY(t) + 4} textAnchor="end" fontSize="9" fill="#9ca3af">{t}°</text>
              </g>
            ))}

            {/* Threshold lines */}
            {[{v:95,line:"hand",c:"#3b82f6"},{v:110,line:"three",c:"#8b5cf6"},{v:40,line:"cooler",c:"#059669"},{v:20,line:"freezer",c:"#0891b2"}].map(({v:threshold,line:lineKey,c:color}) => {
              if (threshold < activeMinT || threshold > activeMaxT) return null;
              const y = toY(threshold);
              const dimmed = focusedLine && focusedLine !== lineKey;
              return (
                <g key={threshold} opacity={dimmed ? 0.15 : 1} style={{ transition: "opacity 0.3s" }}>
                  <line x1={PAD} y1={y} x2={W - PADR} y2={y} stroke={color} strokeDasharray="6,4" strokeWidth="1.5" opacity="0.6" />
                  <rect x={W - PADR + 2} y={y - 8} width="36" height="16" rx="3" fill={color} opacity="0.9" />
                  <text x={W - PADR + 20} y={y + 4} textAnchor="middle" fontSize="8" fill="white" fontWeight="bold">{threshold}°F</text>
                </g>
              );
            })}

            {/* Area fills */}
            {handCoords.length >= 2 && <path d={toAreaPath(handCoords)} fill={`url(#handGrad-${locKey})`} opacity={focusedLine && focusedLine !== "hand" ? 0.1 : 1} style={{ transition: "opacity 0.3s" }} />}
            {threeCoords.length >= 2 && <path d={toAreaPath(threeCoords)} fill={`url(#threeGrad-${locKey})`} opacity={focusedLine && focusedLine !== "three" ? 0.1 : 1} style={{ transition: "opacity 0.3s" }} />}
            {coolerCoords.length >= 2 && <path d={toAreaPath(coolerCoords)} fill={`url(#coolerGrad-${locKey})`} opacity={focusedLine && focusedLine !== "cooler" ? 0.1 : 1} style={{ transition: "opacity 0.3s" }} />}
            {freezerCoords.length >= 2 && <path d={toAreaPath(freezerCoords)} fill={`url(#freezerGrad-${locKey})`} opacity={focusedLine && focusedLine !== "freezer" ? 0.1 : 1} style={{ transition: "opacity 0.3s" }} />}

            {/* Lines */}
            {handCoords.length > 1 && <path d={toPath(handCoords)} fill="none" stroke="#3b82f6" strokeWidth={focusedLine === "hand" ? "3.5" : "2.5"} strokeLinecap="round" strokeLinejoin="round" opacity={focusedLine && focusedLine !== "hand" ? 0.15 : 1} style={{ transition: "opacity 0.3s, stroke-width 0.3s" }} />}
            {threeCoords.length > 1 && <path d={toPath(threeCoords)} fill="none" stroke="#8b5cf6" strokeWidth={focusedLine === "three" ? "3.5" : "2.5"} strokeLinecap="round" strokeLinejoin="round" opacity={focusedLine && focusedLine !== "three" ? 0.15 : 1} style={{ transition: "opacity 0.3s, stroke-width 0.3s" }} />}
            {coolerCoords.length > 1 && <path d={toPath(coolerCoords)} fill="none" stroke="#059669" strokeWidth={focusedLine === "cooler" ? "3.5" : "2.5"} strokeLinecap="round" strokeLinejoin="round" opacity={focusedLine && focusedLine !== "cooler" ? 0.15 : 1} style={{ transition: "opacity 0.3s, stroke-width 0.3s" }} />}
            {freezerCoords.length > 1 && <path d={toPath(freezerCoords)} fill="none" stroke="#0891b2" strokeWidth={focusedLine === "freezer" ? "3.5" : "2.5"} strokeLinecap="round" strokeLinejoin="round" opacity={focusedLine && focusedLine !== "freezer" ? 0.15 : 1} style={{ transition: "opacity 0.3s, stroke-width 0.3s" }} />}

            {/* Data points with hover */}
            {activePoints.map((p, i) => {
              const hk = `${locKey}-${i}`;
              return (
                <g key={i} onMouseEnter={() => setHoveredPoint(hk)} onTouchStart={() => setHoveredPoint(hk)}>
                  {p.handSink && (
                    <g opacity={focusedLine && focusedLine !== "hand" ? 0.15 : 1} style={{ transition: "opacity 0.3s" }}>
                      <circle cx={toX(i)} cy={toY(p.handSink)} r={focusedLine === "hand" ? 6 : 5} fill="white" stroke={p.handSink >= 95 ? "#3b82f6" : "#ef4444"} strokeWidth="2.5" style={{ transition: "r 0.3s" }} />
                      {(hoveredPoint === hk || focusedLine === "hand") && (
                        <g>
                          <rect x={toX(i) - 30} y={toY(p.handSink) - 26} width="60" height="20" rx="4" fill="#1e293b" opacity="0.9" />
                          <text x={toX(i)} y={toY(p.handSink) - 12} textAnchor="middle" fontSize="10" fill="white" fontWeight="bold">{p.handSink}°F</text>
                        </g>
                      )}
                    </g>
                  )}
                  {p.threeComp && (
                    <g opacity={focusedLine && focusedLine !== "three" ? 0.15 : 1} style={{ transition: "opacity 0.3s" }}>
                      <circle cx={toX(i)} cy={toY(p.threeComp)} r={focusedLine === "three" ? 6 : 5} fill="white" stroke={p.threeComp >= 110 ? "#8b5cf6" : "#ef4444"} strokeWidth="2.5" style={{ transition: "r 0.3s" }} />
                      {(hoveredPoint === hk || focusedLine === "three") && (
                        <g>
                          <rect x={toX(i) - 30} y={toY(p.threeComp) - 26} width="60" height="20" rx="4" fill="#1e293b" opacity="0.9" />
                          <text x={toX(i)} y={toY(p.threeComp) - 12} textAnchor="middle" fontSize="10" fill="white" fontWeight="bold">{p.threeComp}°F</text>
                        </g>
                      )}
                    </g>
                  )}
                  {p.cooler && (
                    <g opacity={focusedLine && focusedLine !== "cooler" ? 0.15 : 1} style={{ transition: "opacity 0.3s" }}>
                      <circle cx={toX(i)} cy={toY(p.cooler)} r={focusedLine === "cooler" ? 6 : 5} fill="white" stroke={p.cooler <= 40 ? "#059669" : "#ef4444"} strokeWidth="2.5" style={{ transition: "r 0.3s" }} />
                      {(hoveredPoint === hk || focusedLine === "cooler") && (
                        <g>
                          <rect x={toX(i) - 30} y={toY(p.cooler) - 26} width="60" height="20" rx="4" fill="#1e293b" opacity="0.9" />
                          <text x={toX(i)} y={toY(p.cooler) - 12} textAnchor="middle" fontSize="10" fill="white" fontWeight="bold">{p.cooler}°F</text>
                        </g>
                      )}
                    </g>
                  )}
                  {p.freezer && (
                    <g opacity={focusedLine && focusedLine !== "freezer" ? 0.15 : 1} style={{ transition: "opacity 0.3s" }}>
                      <circle cx={toX(i)} cy={toY(p.freezer)} r={focusedLine === "freezer" ? 6 : 5} fill="white" stroke={p.freezer <= 20 ? "#0891b2" : "#ef4444"} strokeWidth="2.5" style={{ transition: "r 0.3s" }} />
                      {(hoveredPoint === hk || focusedLine === "freezer") && (
                        <g>
                          <rect x={toX(i) - 30} y={toY(p.freezer) - 26} width="60" height="20" rx="4" fill="#1e293b" opacity="0.9" />
                          <text x={toX(i)} y={toY(p.freezer) - 12} textAnchor="middle" fontSize="10" fill="white" fontWeight="bold">{p.freezer}°F</text>
                        </g>
                      )}
                    </g>
                  )}
                  {/* Invisible larger hit area */}
                  <rect x={toX(i) - 15} y={PADT} width="30" height={H - PADT - PADB} fill="transparent" />
                </g>
              );
            })}

            {/* X-axis labels */}
            {activePoints.map((p, i) => (
              <text key={i} x={toX(i)} y={H - 10} textAnchor="middle" fontSize="9" fill="#6b7280" fontWeight="500">
                {p.date.slice(5)}
              </text>
            ))}
          </svg>
          <div className="tempChartLegend">
            <span className="tempLegendItem"><span className="tempLegendDot" style={{ background: "#3b82f6" }} /> Hand Sink (min 95°F)</span>
            <span className="tempLegendItem"><span className="tempLegendDot" style={{ background: "#8b5cf6" }} /> 3-Comp (min 110°F)</span>
            <span className="tempLegendItem"><span className="tempLegendDot" style={{ background: "#059669" }} /> Cooler (max 40°F)</span>
            <span className="tempLegendItem"><span className="tempLegendDot" style={{ background: "#0891b2" }} /> Freezer (max 20°F)</span>
            <span className="tempLegendItem"><span className="tempLegendDot" style={{ background: "#ef4444" }} /> Out of range</span>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ── Predictive AI Engine ────────────────────────────────── */
function buildPredictions(history) {
  if (!history || history.length < 2) return [];
  const predictions = [];

  // Sort history oldest → newest
  const sorted = [...history].sort((a, b) => {
    const da = new Date(a.inspectionDate || 0);
    const db = new Date(b.inspectionDate || 0);
    return da - db;
  });

  // ── 1. Per-location issue recurrence prediction ──────────
  // For each location, look at the last N inspections. If a category
  // appeared in ≥60% of them, it's predicted to appear again.
  //
  // Key normalization: lowercase + trim so "North Kitchen" and "north kitchen"
  // group together. siteNumber and floor are intentionally excluded from the key
  // so the same physical site always groups even if floor/unit varies.
  const byLocation = {};
  for (const rec of sorted) {
    const loc = (rec.siteName || rec.location || "Unknown").trim().toLowerCase();
    if (!byLocation[loc]) byLocation[loc] = [];
    byLocation[loc].push(rec);
  }
  // Build a display-name map (use the first record's original casing for labels)
  const locDisplayName = {};
  for (const rec of sorted) {
    const key = (rec.siteName || rec.location || "Unknown").trim().toLowerCase();
    if (!locDisplayName[key]) locDisplayName[key] = rec.siteName || rec.location || "Unknown";
  }

  for (const [loc, recs] of Object.entries(byLocation)) {
    if (recs.length < 2) continue;
    const recent = recs.slice(-6); // last 6 inspections at this location
    const catCounts = {};
    for (const rec of recent) {
      const seen = new Set();
      for (const item of (rec.actionItems || [])) {
        const cat = item.issue?.split(":")[0]?.trim() || "Other";
        if (!seen.has(cat)) {
          seen.add(cat);
          catCounts[cat] = (catCounts[cat] || 0) + 1;
        }
      }
    }
    for (const [cat, count] of Object.entries(catCounts)) {
      const rate = count / recent.length;
      if (rate >= 0.6) {
        const risk = rate >= 0.85 ? "high" : "medium";
        const displayLoc = locDisplayName[loc] || loc;
        predictions.push({
          type: "recurrence",
          risk,
          location: displayLoc,
          category: cat,
          rate: Math.round(rate * 100),
          occurrences: count,
          total: recent.length,
          message: `"${cat}" issues have appeared in ${count} of the last ${recent.length} inspections at ${displayLoc} (${Math.round(rate * 100)}%) — likely to recur.`,
          detail: `This category has been flagged consistently. Address root cause to break the pattern.`,
        });
      }
    }
  }

  // ── 2. Temperature drift prediction (equipment) ──────────
  // If a cooler/freezer temp has been creeping upward over the last 3+
  // readings at a location, predict it will breach threshold.
  const EQUIP_KEYS = [
    { key: "doubleDoorCooler", label: "Double-Door Cooler", max: 40, type: "cooler" },
    { key: "doubleDoorFreezer", label: "Double-Door Freezer", max: 20, type: "freezer" },
    { key: "walkInCooler", label: "Walk-In Cooler", max: 40, type: "cooler" },
    { key: "walkInFreezer", label: "Walk-In Freezer", max: 20, type: "freezer" },
    { key: "prepCooler", label: "Prep Cooler", max: 40, type: "cooler" },
  ];

  for (const [loc, recs] of Object.entries(byLocation)) {
    const displayLoc = locDisplayName[loc] || loc;
    for (const equip of EQUIP_KEYS) {
      const readings = recs
        .map(r => ({ date: r.inspectionDate, val: Number(r.inspection?.equipment?.[equip.key]?.tempF || r[equip.key + "TempF"] || NaN) }))
        .filter(r => !isNaN(r.val) && r.val > 0);
      if (readings.length < 3) continue;
      const last3 = readings.slice(-3);
      // Check monotonic upward trend in last 3 readings
      const rising = last3[1].val > last3[0].val && last3[2].val > last3[1].val;
      if (!rising) continue;
      const drift = last3[2].val - last3[0].val;
      const currentTemp = last3[2].val;
      const gap = equip.max - currentTemp;
      if (drift <= 0 || gap >= 15) continue; // not significant
      const stepsToBreech = Math.ceil(gap / (drift / 2));
      const risk = gap < 5 ? "high" : "medium";
      predictions.push({
        type: "tempDrift",
        risk,
        location: displayLoc,
        category: equip.label,
        message: `${equip.label} at ${displayLoc} has risen from ${last3[0].val}°F → ${last3[2].val}°F over the last ${last3.length} inspections (${gap > 0 ? `${gap.toFixed(1)}°F below max` : "AT OR ABOVE MAX"}).`,
        detail: risk === "high"
          ? `Temperature is dangerously close to the ${equip.max}°F limit. Inspect compressor and door seals before the next visit.`
          : `Upward trend detected. Schedule preventive maintenance within ${stepsToBreech} inspection cycle(s) to avoid failure.`,
        currentTemp,
        maxTemp: equip.max,
        drift: drift.toFixed(1),
      });
    }
  }

  // ── 3. Issue escalation prediction ──────────────────────
  // If a specific category was "Needs Attention" in 2+ consecutive
  // inspections at a location, predict it will escalate to "Not Clean".
  const SECTION_MAP = {
    facility: ["ceiling", "walls", "floors", "lighting"],
    operations: ["employeePractices", "handwashing", "labelingDating", "logs"],
    equipment: ["doubleDoorCooler", "doubleDoorFreezer", "walkInCooler", "walkInFreezer", "prepCooler", "warmers", "ovens", "threeCompSink", "ecolab"],
    maintenance: ["hvac", "plumbing", "pestControl", "electricalSafety", "dumpsterArea", "structuralDamage"],
  };
  const ITEM_LABEL = {
    ceiling: "Ceiling", walls: "Walls", floors: "Floors", lighting: "Lighting",
    employeePractices: "Employee Practices", handwashing: "Handwashing",
    labelingDating: "Labeling / Dating", logs: "Logs",
    doubleDoorCooler: "Double-Door Cooler", doubleDoorFreezer: "Double-Door Freezer",
    walkInCooler: "Walk-In Cooler", walkInFreezer: "Walk-In Freezer",
    prepCooler: "Prep Cooler", warmers: "Warmers / Hot Holding", ovens: "Ovens",
    threeCompSink: "3-Compartment Sink", ecolab: "Ecolab / Chemicals",
    hvac: "HVAC", plumbing: "Plumbing", pestControl: "Pest Control",
    electricalSafety: "Electrical Safety", dumpsterArea: "Dumpster Area",
    structuralDamage: "Structural Damage",
  };

  for (const [loc, recs] of Object.entries(byLocation)) {
    if (recs.length < 2) continue;
    const displayLoc = locDisplayName[loc] || loc;
    const last3 = recs.slice(-3);
    for (const [section, keys] of Object.entries(SECTION_MAP)) {
      for (const itemKey of keys) {
        const statuses = last3
          .map(r => r.inspection?.[section]?.[itemKey]?.status || null)
          .filter(Boolean);
        if (statuses.length < 2) continue;
        // All recent readings are "Needs Attention" → escalation risk
        const allAttention = statuses.every(s => s === "Needs Attention");
        if (allAttention && statuses.length >= 2) {
          predictions.push({
            type: "escalation",
            risk: statuses.length >= 3 ? "high" : "medium",
            location: displayLoc,
            category: ITEM_LABEL[itemKey] || itemKey,
            message: `"${ITEM_LABEL[itemKey] || itemKey}" at ${displayLoc} has been "Needs Attention" for ${statuses.length} consecutive inspections.`,
            detail: `Unresolved items tend to escalate to "Not Clean". Assign ownership and set a corrective action deadline before the next visit.`,
          });
        }
      }
    }
  }

  // ── 4. Overdue inspection + prior issues risk flag ───────
  // Applies to ALL locations (even single-inspection locations) so the
  // inspector is alerted about any site that has gone 30+ days unvisited
  // and had open issues at the last visit.
  const now = new Date();
  for (const [loc, recs] of Object.entries(byLocation)) {
    const displayLoc = locDisplayName[loc] || loc;
    const lastRec = recs[recs.length - 1];
    const lastDate = new Date(lastRec.inspectionDate || 0);
    const daysSince = Math.floor((now - lastDate) / (1000 * 60 * 60 * 24));
    const hadIssues = (lastRec.actionItems || []).length > 0;
    if (daysSince >= 30 && hadIssues) {
      const risk = daysSince >= 60 ? "high" : "medium";
      predictions.push({
        type: "overdue",
        risk,
        location: displayLoc,
        category: "Inspection Gap",
        message: `${displayLoc} hasn't been inspected in ${daysSince} days and had ${lastRec.actionItems.length} unresolved issue(s) at last visit.`,
        detail: `Schedule an inspection soon — unresolved issues left unchecked increase the risk of a health code violation.`,
        daysSince,
      });
    }
  }

  // ── 5. Hand sink / 3-comp sink temperature trend ─────────
  for (const [loc, recs] of Object.entries(byLocation)) {
    const displayLoc = locDisplayName[loc] || loc;
    const handTemps = recs.map(r => Number(r.temps?.handSinkTempF || r.handSinkTempF || NaN)).filter(v => !isNaN(v) && v > 0);
    const threeTemps = recs.map(r => Number(r.temps?.threeCompSinkTempF || r.threeCompSinkTempF || NaN)).filter(v => !isNaN(v) && v > 0);

    if (handTemps.length >= 3) {
      const last3 = handTemps.slice(-3);
      const declining = last3[0] > last3[1] && last3[1] > last3[2];
      if (declining && last3[2] < 100) {
        predictions.push({
          type: "tempDrift",
          risk: last3[2] < 97 ? "high" : "medium",
          location: displayLoc,
          category: "Hand Sink Water Temp",
          message: `Hand sink temperature at ${displayLoc} has been declining: ${last3[0]}°F → ${last3[1]}°F → ${last3[2]}°F (min: 95°F).`,
          detail: `Downward trend approaching the 95°F minimum. Inspect water heater output and check for mixing valve issues.`,
        });
      }
    }
    if (threeTemps.length >= 3) {
      const last3 = threeTemps.slice(-3);
      const declining = last3[0] > last3[1] && last3[1] > last3[2];
      if (declining && last3[2] < 115) {
        predictions.push({
          type: "tempDrift",
          risk: last3[2] < 112 ? "high" : "medium",
          location: displayLoc,
          category: "3-Comp Sink Wash Temp",
          message: `3-comp sink wash temperature at ${displayLoc} declining: ${last3[0]}°F → ${last3[1]}°F → ${last3[2]}°F (min: 110°F).`,
          detail: `Trend approaching the 110°F minimum. Check water heater capacity and booster heater for the sink.`,
        });
      }
    }
  }

  // De-duplicate and sort: high risk first, then medium
  const seen = new Set();
  const deduped = predictions.filter(p => {
    const k = `${p.type}|${p.location}|${p.category}`;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });

  return deduped.sort((a, b) => {
    const order = { high: 0, medium: 1, watch: 2 };
    return (order[a.risk] ?? 3) - (order[b.risk] ?? 3);
  });
}

/* ── LocationsPanel — inner sub-panel for the Locations tab ────── */
function LocationsPanel({ loc, passColor, trendArrow, MiniBar, EmptyState }) {
  const [locSub, setLocSub] = React.useState("floor");
  if (!loc) return <EmptyState icon="🗺️" msg="Location profiles will appear after saving inspections with site/floor/type data." />;

  const { byFloor = [], byType = [], bySite = [] } = loc;

  return (
    <div>
      <div style={{ display: "flex", gap: 6, marginBottom: 14 }}>
        {[
          { key: "floor", label: `🏗 By Floor (${byFloor.length})` },
          { key: "type",  label: `🏪 By Type (${byType.length})` },
          { key: "site",  label: `📍 By Site (${bySite.length})` },
        ].map(t => (
          <button key={t.key} type="button" onClick={() => setLocSub(t.key)}
            style={{
              background: locSub === t.key ? "#eff6ff" : "#f9fafb",
              border: locSub === t.key ? "1.5px solid #93c5fd" : "1px solid #e5e7eb",
              borderRadius: 7, padding: "5px 10px", cursor: "pointer",
              fontSize: "0.73rem", fontWeight: locSub === t.key ? 700 : 400,
              color: locSub === t.key ? "#1d4ed8" : "#6b7280",
            }}
          >{t.label}</button>
        ))}
      </div>

      {locSub === "floor" && (
        byFloor.length === 0
          ? <EmptyState icon="🏗" msg="No floor data yet. Add floor info when saving inspections." />
          : <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {byFloor.map(f => (
                <div key={f.floor} style={{ background: "#fff", border: "1px solid #e5e7eb", borderRadius: 9, padding: "10px 13px" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
                    <span style={{ fontWeight: 700, fontSize: "0.82rem", color: "#1e293b", flex: 1 }}>{f.floor}</span>
                    <span style={{ fontWeight: 700, fontSize: "0.82rem", color: passColor(f.passRate) }}>{f.passRate}%</span>
                    <span style={{ fontSize: "0.7rem", color: "#6b7280" }}>{f.total} inspections</span>
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <div style={{ fontSize: "0.7rem", color: "#6b7280", minWidth: 60 }}>Pass rate</div>
                    <MiniBar pct={f.passRate} color={passColor(f.passRate)} />
                  </div>
                  {f.topIssue && (
                    <div style={{ fontSize: "0.7rem", color: "#6b7280", marginTop: 5 }}>
                      Top issue: <span style={{ color: "#374151", fontWeight: 600 }}>{f.topIssue}</span>
                    </div>
                  )}
                </div>
              ))}
            </div>
      )}

      {locSub === "type" && (
        byType.length === 0
          ? <EmptyState icon="🏪" msg="No location type data yet. Add location type when saving inspections." />
          : <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {byType.map(t => (
                <div key={t.type} style={{ background: "#fff", border: "1px solid #e5e7eb", borderRadius: 9, padding: "10px 13px" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
                    <span style={{ fontWeight: 700, fontSize: "0.82rem", color: "#1e293b", flex: 1 }}>{t.type}</span>
                    <span style={{ fontWeight: 700, fontSize: "0.82rem", color: passColor(t.passRate) }}>{t.passRate}%</span>
                    <span style={{ fontSize: "0.7rem", color: "#6b7280" }}>{t.total} inspections</span>
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
                    <div style={{ fontSize: "0.7rem", color: "#6b7280", minWidth: 60 }}>Pass rate</div>
                    <MiniBar pct={t.passRate} color={passColor(t.passRate)} />
                  </div>
                  {t.topIssues?.length > 0 && (
                    <div style={{ fontSize: "0.7rem", color: "#6b7280" }}>
                      Top: {t.topIssues.slice(0, 3).map(i => i.cat || i).join(" · ")}
                    </div>
                  )}
                </div>
              ))}
            </div>
      )}

      {locSub === "site" && (
        bySite.length === 0
          ? <EmptyState icon="📍" msg="No site data yet." />
          : <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {bySite.map(s => {
                const arrow = trendArrow(s.trendLabel);
                return (
                  <div key={s.site} style={{
                    background: "#fff",
                    border: s.trendLabel === "worsening" ? "1.5px solid #fecaca" : "1px solid #e5e7eb",
                    borderRadius: 9, padding: "10px 13px",
                  }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 5 }}>
                      <span style={{ fontWeight: 700, fontSize: "0.8rem", color: "#1e293b", flex: 1 }}>{s.site}</span>
                      <span style={{ fontWeight: 700, fontSize: "0.75rem", color: arrow.color }}>{arrow.icon} {s.trendLabel}</span>
                      <span style={{ fontWeight: 700, fontSize: "0.82rem", color: passColor(s.passRate) }}>{s.passRate}%</span>
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <div style={{ fontSize: "0.7rem", color: "#6b7280", minWidth: 60 }}>Pass rate</div>
                      <MiniBar pct={s.passRate} color={passColor(s.passRate)} />
                      <div style={{ fontSize: "0.68rem", color: "#9ca3af", minWidth: 50, textAlign: "right" }}>{s.total} visits</div>
                    </div>
                    {s.lastInspected && (
                      <div style={{ fontSize: "0.68rem", color: "#9ca3af", marginTop: 4 }}>
                        Last: {new Date(s.lastInspected).toLocaleDateString()}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
      )}
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════════
   AIHealthMonitor  — live self-improving analytics dashboard panel
   Shows: AI Suggestions · Inspectors · Supervisors · Locations ·
          Behavior · Usage Stats · Performance Vitals
══════════════════════════════════════════════════════════════════ */
function AIHealthMonitor({ history, currentUser }) {
  const [snapshot, setSnapshot]   = React.useState(() => AIEngine.getSnapshot());
  const [activeTab, setActiveTab] = React.useState("insights");
  const [dismissed, setDismissed] = React.useState(() => {
    try { return JSON.parse(localStorage.getItem("sdx_ai_dismissed") || "[]"); } catch { return []; }
  });
  // fulfilledSupplies: Set of "recId::itemIndex" strings for items marked done
  const [fulfilledSupplies, setFulfilledSupplies] = React.useState(() => {
    try { return new Set(JSON.parse(localStorage.getItem("sdx_fulfilled_supplies") || "[]")); } catch { return new Set(); }
  });
  const toggleFulfilled = (recId, idx) => {
    setFulfilledSupplies(prev => {
      const key = `${recId}::${idx}`;
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      try { localStorage.setItem("sdx_fulfilled_supplies", JSON.stringify([...next])); } catch {}
      return next;
    });
  };
  const [filterLoc,   setFilterLoc]   = React.useState("");
  const [filterEquip, setFilterEquip] = React.useState("");

  React.useEffect(() => {
    if (history && history.length > 0) {
      AIEngine.learnFromHistory(history);
      setSnapshot(AIEngine.getSnapshot());
    }
  }, [history]);

  React.useEffect(() => {
    const unsub = AIEngine.subscribe(() => setSnapshot(AIEngine.getSnapshot()));
    return unsub;
  }, []);

  function dismiss(id) {
    const next = [...dismissed, id];
    setDismissed(next);
    try { localStorage.setItem("sdx_ai_dismissed", JSON.stringify(next)); } catch {}
  }

  const { suggestions = [], usageReport, perfReport = [], generatedAt, patterns } = snapshot;
  const visibleSugs = suggestions.filter(s => !dismissed.includes(s.id));
  const criticalCount = visibleSugs.filter(s => s.priority === "critical").length;

  /* ── helpers ───────────────────────────────────────────── */
  function passColor(r) {
    if (r >= 80) return "#16a34a";
    if (r >= 60) return "#d97706";
    return "#dc2626";
  }
  function trendArrow(label) {
    if (label === "improving") return { icon: "↑", color: "#16a34a" };
    if (label === "declining" || label === "worsening") return { icon: "↓", color: "#dc2626" };
    return { icon: "→", color: "#94a3b8" };
  }
  function MiniBar({ pct, color = "#2563EB" }) {
    return (
      <div style={{ flex: 1, background: "#f1f5f9", borderRadius: 99, overflow: "hidden", height: 8 }}>
        <div style={{ height: "100%", background: color, borderRadius: 99, width: `${Math.min(100, pct || 0)}%`, transition: "width .4s ease" }} />
      </div>
    );
  }
  function EmptyState({ icon = "📭", msg }) {
    return (
      <div style={{ textAlign: "center", padding: "40px 20px", color: "#94a3b8" }}>
        <div style={{ fontSize: "2.8rem", marginBottom: 12 }}>{icon}</div>
        <div style={{ fontSize: "1rem", lineHeight: 1.6, maxWidth: 280, margin: "0 auto", color: "#64748b" }}>{msg}</div>
      </div>
    );
  }
  function SectionLabel({ children, style: extraStyle }) {
    return <div style={{ fontSize: "0.75rem", fontWeight: 800, letterSpacing: "0.06em", textTransform: "uppercase", color: "#64748b", marginBottom: 12, marginTop: 4, ...extraStyle }}>{children}</div>;
  }
  function StatPill({ label, val, color, emoji }) {
    return (
      <div style={{ background: "#fff", border: "1.5px solid #e2e8f0", borderRadius: 14, padding: "12px 10px", textAlign: "center", flex: "1 1 70px", boxShadow: "0 1px 3px rgba(0,0,0,0.05)" }}>
        {emoji && <div style={{ fontSize: "1.2rem", marginBottom: 4 }}>{emoji}</div>}
        <div style={{ fontWeight: 800, fontSize: "1.25rem", color: color || "#1e293b", lineHeight: 1.1 }}>{val}</div>
        <div style={{ fontSize: "0.72rem", color: "#94a3b8", marginTop: 4, lineHeight: 1.3 }}>{label}</div>
      </div>
    );
  }

  /* ── priority config ─────────────────────────────────────── */
  const pColor = {
    critical: { bg: "#fff1f2", border: "#fecdd3", accent: "#e11d48", text: "#9f1239", emoji: "🚨", label: "Urgent!" },
    high:     { bg: "#fff7ed", border: "#fed7aa", accent: "#ea580c", text: "#9a3412", emoji: "⚠️", label: "Important" },
    medium:   { bg: "#fefce8", border: "#fef08a", accent: "#ca8a04", text: "#713f12", emoji: "💛", label: "Watch this" },
    low:      { bg: "#f0f9ff", border: "#bae6fd", accent: "#0284c7", text: "#0c4a6e", emoji: "💡", label: "Tip" },
    info:     { bg: "#f0fdf4", border: "#bbf7d0", accent: "#16a34a", text: "#14532d", emoji: "✅", label: "Good news" },
  };

  /* ── nav tabs ───────────────────────────────────────────── */
  const tabs = [
    { key: "insights",  icon: "💡", label: "Tips",     badge: visibleSugs.length || null },
    { key: "locations", icon: "📍", label: "Sites"   },
    { key: "supplies",  icon: "🧴", label: "Supplies" },
  ];

  return (
    <div className="aiMonitorCard">
      {/* ── Header ──────────────────────────────────────── */}
      <div className="aiMonitorHeader">
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div className="aiMonitorBrain">🧠</div>
          <div>
            <div className="aiMonitorTitle">Smart Insights</div>
            <div className="aiMonitorSub">
              {generatedAt
                ? `Updated at ${new Date(generatedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`
                : "Looking at your data…"}
            </div>
          </div>
        </div>
        {criticalCount > 0 && (
          <div className="aiMonitorCritical">🚨 {criticalCount} urgent</div>
        )}
      </div>

      {/* ── Tab Nav ─────────────────────────────────────── */}
      <div className="aiMonitorNav">
        {tabs.map(t => (
          <button key={t.key} type="button"
            className={`aiMonitorNavBtn${activeTab === t.key ? " active" : ""}`}
            onClick={() => setActiveTab(t.key)}
          >
            <span className="aiMonitorNavIcon">{t.icon}</span>
            <span className="aiMonitorNavLabel">{t.label}</span>
            {t.badge ? <span className="aiMonitorNavBadge">{t.badge}</span> : null}
          </button>
        ))}
      </div>

      {/* ── Content ─────────────────────────────────────── */}
      <div className="aiMonitorBody">

        {/* ══ TIPS / INSIGHTS ══════════════════════════════ */}
        {activeTab === "insights" && (
          <div>
            {/* Big score cards */}
            {patterns && (
              <div style={{ display: "flex", gap: 10, marginBottom: 20, flexWrap: "wrap" }}>
                <StatPill emoji="✅" label="Pass Rate" val={`${patterns.passRate}%`} color={passColor(patterns.passRate)} />
                <StatPill emoji="📋" label="Reports Done" val={patterns.totalRecords} />
                <StatPill emoji="⚠️" label="Issues per Report" val={patterns.avgIssuesPerReport} color={patterns.avgIssuesPerReport > 3 ? "#dc2626" : patterns.avgIssuesPerReport > 1 ? "#d97706" : "#16a34a"} />
                <StatPill emoji="📍" label="Problem Spots" val={patterns.weakLocations?.length || 0} color={patterns.weakLocations?.length > 0 ? "#dc2626" : "#16a34a"} />
              </div>
            )}

            {/* What the numbers mean */}
            {patterns && (
              <div style={{ background: patterns.passRate >= 80 ? "#f0fdf4" : patterns.passRate >= 60 ? "#fefce8" : "#fff1f2", border: `1.5px solid ${passColor(patterns.passRate)}44`, borderLeft: `4px solid ${passColor(patterns.passRate)}`, borderRadius: 12, padding: "12px 14px", marginBottom: 16 }}>
                <div style={{ fontWeight: 700, fontSize: "0.95rem", color: passColor(patterns.passRate) }}>
                  {patterns.passRate >= 80 ? "🎉 Your team is doing great!" : patterns.passRate >= 60 ? "👀 There's room to improve" : "🔴 Needs attention right away"}
                </div>
                <div style={{ fontSize: "0.84rem", color: "#475569", marginTop: 4, lineHeight: 1.5 }}>
                  {patterns.passRate >= 80
                    ? `${patterns.passRate}% of inspections passed. Keep it up!`
                    : patterns.passRate >= 60
                    ? `${patterns.passRate}% pass rate — work on fixing recurring problems.`
                    : `Only ${patterns.passRate}% passed. Review the tips below and take action.`}
                </div>
              </div>
            )}

            {/* Tip cards */}
            {visibleSugs.length === 0 ? (
              <EmptyState icon="🎉" msg="All good! No tips right now. The AI checked everything and you're on track." />
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                {visibleSugs.map(s => {
                  const c = pColor[s.priority] || pColor.low;
                  return (
                    <div key={s.id} className="aiSugCard" style={{ background: c.bg, borderColor: c.border, borderRadius: 14, padding: "14px 14px 12px" }}>
                      <div style={{ display: "flex", gap: 12, alignItems: "flex-start" }}>
                        <div style={{ fontSize: "1.6rem", flexShrink: 0, lineHeight: 1.1 }}>{s.icon || c.emoji}</div>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 5, flexWrap: "wrap" }}>
                            <span style={{ background: c.accent, color: "#fff", borderRadius: 20, padding: "2px 10px", fontSize: "0.72rem", fontWeight: 700 }}>
                              {c.label}
                            </span>
                            <span style={{ fontWeight: 700, fontSize: "0.92rem", color: "#1e293b" }}>{s.title}</span>
                          </div>
                          <div style={{ fontSize: "0.88rem", color: "#374151", lineHeight: 1.6 }}>{s.body}</div>
                          <div style={{ fontSize: "0.82rem", color: c.accent, marginTop: 8, fontWeight: 600, display: "flex", alignItems: "center", gap: 5 }}>
                            <span>👉</span> {s.action}
                          </div>
                        </div>
                        <button type="button" onClick={() => dismiss(s.id)} className="aiSugDismiss"
                          style={{ flexShrink: 0, fontSize: "1rem", width: 32, height: 32, borderRadius: "50%", border: "none", background: "#00000011", color: "#64748b", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>
                          ✕
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
            {dismissed.length > 0 && (
              <button type="button" className="aiRestoreBtn"
                style={{ marginTop: 14, width: "100%", padding: "10px", fontSize: "0.84rem" }}
                onClick={() => { setDismissed([]); try { localStorage.removeItem("sdx_ai_dismissed"); } catch {} }}>
                ↩ Show {dismissed.length} hidden tip{dismissed.length !== 1 ? "s" : ""} again
              </button>
            )}
          </div>
        )}

        {/* ══ SUPPLIES / INVENTORY ═════════════════════════ */}
        {activeTab === "supplies" && (() => {
          const supRecs = (history || []).filter(r => r.suppliesNeeded?.length > 0);
          if (supRecs.length === 0) return (
            <EmptyState icon="🧴" msg="No supply requests found yet. Inspectors can add needed supplies when filling out a report." />
          );

          // Group by inspectionDate (YYYY-MM-DD), then by site within each day
          const byDate = {};
          for (const rec of supRecs) {
            const dateKey = rec.inspectionDate || rec.savedAt?.slice(0, 10) || "Unknown date";
            if (!byDate[dateKey]) byDate[dateKey] = [];
            byDate[dateKey].push(rec);
          }
          const sortedDates = Object.keys(byDate).sort((a, b) => b.localeCompare(a));

          // Aggregate item totals across ALL history for the "Most requested" summary
          const allItemFreq = {};
          for (const rec of supRecs) {
            for (const s of rec.suppliesNeeded) {
              const key = (s.item || "").trim().toLowerCase();
              if (!key) continue;
              allItemFreq[key] = (allItemFreq[key] || 0) + 1;
            }
          }
          const topItems = Object.entries(allItemFreq)
            .sort((a, b) => b[1] - a[1])
            .slice(0, 5);

          return (
            <div>
              {/* Summary strip */}
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 16 }}>
                <StatPill emoji="📅" label="Days with requests" val={sortedDates.length} />
                <StatPill emoji="🏪" label="Sites affected" val={new Set(supRecs.map(r => r.siteName || r.siteNumber || "?")).size} />
                <StatPill emoji="📦" label="Total items requested" val={supRecs.reduce((s, r) => s + (r.suppliesNeeded?.length || 0), 0)} />
              </div>

              {/* Most frequently requested items */}
              {topItems.length > 0 && (
                <div style={{ background: "#fef3c7", border: "1px solid #f59e0b", borderRadius: 12, padding: "12px 14px", marginBottom: 16 }}>
                  <div style={{ fontWeight: 700, fontSize: "0.85rem", color: "#92400e", marginBottom: 8 }}>🔁 Most frequently requested supplies</div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                    {topItems.map(([item, count]) => (
                      <div key={item} style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        <div style={{ flex: 1, fontSize: "0.83rem", color: "#451a03", textTransform: "capitalize", fontWeight: 500 }}>{item}</div>
                        <MiniBar pct={Math.min(100, Math.round((count / supRecs.length) * 100))} color="#f59e0b" />
                        <div style={{ fontSize: "0.78rem", fontWeight: 700, color: "#92400e", minWidth: 48, textAlign: "right" }}>{count}× reports</div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Day-by-day breakdown */}
              {sortedDates.map(dateKey => {
                const recs = byDate[dateKey];
                // Check if every item in every record for this day is fulfilled — if so, skip the whole day group
                const dayAllDone = recs.every(r =>
                  (r.suppliesNeeded || []).filter(s => s.item?.trim()).every((_, i) => fulfilledSupplies.has(`${r.id}::${i}`))
                );
                if (dayAllDone) return null;

                const totalItems = recs.reduce((s, r) => s + (r.suppliesNeeded?.filter(x => x.item?.trim() && !fulfilledSupplies.has(`${r.id}::${(r.suppliesNeeded||[]).filter(s=>s.item?.trim()).indexOf(x)}`)).length || 0), 0);
                const urgentCount = recs.reduce((s, r) => s + (r.suppliesNeeded?.filter((x, i) => x.urgent && x.item?.trim() && !fulfilledSupplies.has(`${r.id}::${i}`)).length || 0), 0);
                const label = (() => {
                  if (dateKey === "Unknown date") return "Unknown date";
                  try {
                    const [y, m, d] = dateKey.split("-");
                    return new Date(Number(y), Number(m) - 1, Number(d)).toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric", year: "numeric" });
                  } catch { return dateKey; }
                })();

                return (
                  <div key={dateKey} style={{ marginBottom: 14 }}>
                    {/* Date header */}
                    <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
                      <div style={{ fontWeight: 800, fontSize: "0.87rem", color: "#1e293b" }}>📅 {label}</div>
                      <div style={{ fontSize: "0.75rem", color: "#64748b" }}>{recs.length} site{recs.length !== 1 ? "s" : ""} · {totalItems} item{totalItems !== 1 ? "s" : ""}</div>
                      {urgentCount > 0 && (
                        <div style={{ background: "#fee2e2", color: "#dc2626", borderRadius: 10, padding: "1px 8px", fontSize: "0.72rem", fontWeight: 700 }}>🔴 {urgentCount} urgent</div>
                      )}
                    </div>

                    {/* Site cards for this day */}
                    {recs.map(rec => {
                      const siteLbl = [rec.siteName, rec.siteNumber ? `#${rec.siteNumber}` : null].filter(Boolean).join(" ") || "Unknown site";
                      const allItems = (rec.suppliesNeeded || []).filter(s => s.item?.trim());
                      // Only show items that are NOT yet marked done
                      const visibleItems = allItems.filter((_, i) => !fulfilledSupplies.has(`${rec.id}::${i}`));
                      // Hide the entire card once every item is done
                      if (visibleItems.length === 0) return null;
                      const urgents = visibleItems.filter(s => s.urgent);
                      return (
                        <div key={rec.id} style={{
                          background: urgents.length > 0 ? "#fff5f5" : "#fafafa",
                          border: `1.5px solid ${urgents.length > 0 ? "#fca5a5" : "#e2e8f0"}`,
                          borderRadius: 10, padding: "10px 12px", marginBottom: 6, marginLeft: 12,
                        }}>
                          <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 6 }}>
                            <div style={{ fontWeight: 700, fontSize: "0.83rem", color: "#1e293b", flex: 1 }}>🏪 {siteLbl}</div>
                            {rec.supervisorName && <div style={{ fontSize: "0.72rem", color: "#64748b" }}>Sup: {rec.supervisorName}</div>}
                            {rec.inspectorName && <div style={{ fontSize: "0.72rem", color: "#94a3b8" }}>· {rec.inspectorName}</div>}
                          </div>
                          <div style={{ display: "flex", flexWrap: "wrap" }}>
                            {visibleItems.map((s, visIdx) => {
                              // Find the original index so the fulfilled key stays stable
                              const origIdx = allItems.indexOf(s);
                              const isUrgent = s.urgent;
                              return (
                                <span key={origIdx} style={{
                                  display: "inline-flex", alignItems: "center", gap: 4,
                                  background: isUrgent ? "#fee2e2" : "#f1f5f9",
                                  color: isUrgent ? "#b91c1c" : "#374151",
                                  borderRadius: 6, padding: "2px 4px 2px 8px",
                                  fontSize: "0.78rem", fontWeight: isUrgent ? 700 : 500,
                                  marginRight: 4, marginBottom: 4,
                                  border: `1px solid ${isUrgent ? "#fca5a5" : "#e2e8f0"}`,
                                }}>
                                  {isUrgent && "🔴 "}{s.item}{s.qty ? ` ×${s.qty}` : ""}
                                  <button
                                    type="button"
                                    title="Mark as done"
                                    onClick={() => toggleFulfilled(rec.id, origIdx)}
                                    style={{
                                      border: "none", background: "#dcfce7",
                                      color: "#15803d",
                                      borderRadius: 4, padding: "1px 6px", fontSize: "0.68rem",
                                      fontWeight: 700, cursor: "pointer", lineHeight: 1.4, flexShrink: 0,
                                    }}
                                  >
                                    ✓ Done
                                  </button>
                                </span>
                              );
                            })}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                );
              })}
            </div>
          );
        })()}

        {/* ══ SITES / LOCATIONS ════════════════════════════ */}
        {activeTab === "locations" && (() => {
          const inv = patterns?.equipmentInventory || [];
          const equipOptions = Array.from(new Set(inv.map(e => e.label))).sort();
          const locQuery   = filterLoc.trim().toLowerCase();
          const equipQuery = filterEquip;

          const filteredInv = inv
            .filter(eq => !equipQuery || eq.label === equipQuery)
            .map(eq => {
              const filteredSites = locQuery
                ? eq.siteBreakdown.filter(s => s.site.toLowerCase().includes(locQuery))
                : eq.siteBreakdown;
              const filteredTotal = filteredSites.reduce((sum, s) => sum + s.count, 0);
              return { ...eq, siteBreakdown: filteredSites, filteredTotal };
            })
            .filter(eq => !locQuery || eq.siteBreakdown.length > 0);

          const isFiltering = locQuery || equipQuery;
          const fleetMax = Math.max(...(filteredInv.length ? filteredInv : inv).map(e => e.fleetTotal), 1);

          const today = new Date();
          const daysSince = (ds) => {
            if (!ds) return null;
            const d = new Date(ds);
            return isNaN(d) ? null : Math.floor((today - d) / 86400000);
          };
          const sourceIcon = { Facility: "🏢", Subcontractor: "🤝", Stadium: "🏟️", Event: "🎪" };
          const sourceClr  = { Facility: "#166534", Subcontractor: "#92400e", Stadium: "#1d4ed8", Event: "#7c3aed" };
          const sourceBg   = { Facility: "#f0fdf4", Subcontractor: "#fef9c3", Stadium: "#eff6ff", Event: "#faf5ff" };

          return (
            <div>
              {/* Search bar */}
              <div className="aiFilterBar" style={{ marginBottom: 12 }}>
                <input
                  type="text"
                  placeholder="🔍 Search a location…"
                  value={filterLoc}
                  onChange={e => setFilterLoc(e.target.value)}
                  style={{ fontSize: "0.95rem", padding: "10px 14px" }}
                />
                {equipOptions.length > 0 && (
                  <select value={filterEquip} onChange={e => setFilterEquip(e.target.value)} style={{ fontSize: "0.88rem", padding: "10px 8px" }}>
                    <option value="">All equipment</option>
                    {equipOptions.map(opt => <option key={opt} value={opt}>{opt}</option>)}
                  </select>
                )}
                {isFiltering && (
                  <button type="button"
                    onClick={() => { setFilterLoc(""); setFilterEquip(""); }}
                    style={{ padding: "10px 14px", border: "1px solid #e2e8f0", borderRadius: 10, background: "#fff", fontSize: "0.85rem", color: "#64748b", cursor: "pointer", flexShrink: 0, whiteSpace: "nowrap" }}>
                    ✕ Clear
                  </button>
                )}
              </div>

              {isFiltering && filteredInv.length > 0 && (
                <div className="aiFilterResult" style={{ marginBottom: 12 }}>
                  {filteredInv.map(eq => (
                    <div key={eq.key}>
                      Found <span>{eq.filteredTotal}</span> {eq.label}{eq.filteredTotal !== 1 ? "s" : ""}
                      {locQuery && eq.siteBreakdown.length > 0 ? ` at ${eq.siteBreakdown.map(s => s.site).join(", ")}` : ""}
                    </div>
                  ))}
                </div>
              )}
              {isFiltering && filteredInv.length === 0 && (
                <EmptyState icon="🔍" msg="Nothing found. Try a different word or clear the search." />
              )}

              {/* Fix rate banner */}
              {!isFiltering && (() => {
                const res = patterns?.issueResolution;
                if (!res || res.totalFollowUps === 0) return null;
                const rate = res.globalRecurrenceRate;
                const color = rate >= 50 ? "#dc2626" : rate >= 30 ? "#d97706" : "#16a34a";
                const fixRate = 100 - rate;
                return (
                  <div style={{ background: color + "0f", border: `2px solid ${color}44`, borderRadius: 14, padding: "14px 16px", marginBottom: 16, display: "flex", gap: 14, alignItems: "center" }}>
                    <div style={{ fontWeight: 900, fontSize: "2rem", color, lineHeight: 1 }}>{fixRate}%</div>
                    <div>
                      <div style={{ fontWeight: 700, fontSize: "0.92rem", color: "#1e293b" }}>
                        {fixRate >= 70 ? "🎉 Problems are getting fixed!" : fixRate >= 50 ? "👀 Some problems keep coming back" : "🔴 Too many problems are not getting fixed"}
                      </div>
                      <div style={{ fontSize: "0.8rem", color: "#64748b", marginTop: 3 }}>Out of {res.totalFollowUps} follow-up visit{res.totalFollowUps !== 1 ? "s" : ""}</div>
                    </div>
                  </div>
                );
              })()}

              {/* Location breakdown */}
              {!isFiltering && (
                <LocationsPanel
                  loc={patterns?.locationProfile}
                  passColor={passColor}
                  trendArrow={trendArrow}
                  MiniBar={MiniBar}
                  EmptyState={EmptyState}
                />
              )}

              {/* Equipment list */}
              {inv.length > 0 && (
                <>
                  <SectionLabel style={{ marginTop: isFiltering ? 0 : 20 }}>
                    🔧 Equipment count by type
                    {isFiltering && filteredInv.length > 0 ? ` — ${filteredInv.reduce((s, e) => s + e.filteredTotal, 0)} found` : ""}
                  </SectionLabel>
                  {filteredInv.map(eq => {
                    const hasTmp = eq.temporaryUnits > 0;
                    return (
                      <div key={eq.key} style={{ background: "#fff", border: `2px solid ${hasTmp ? "#fde68a" : "#e2e8f0"}`, borderRadius: 14, padding: "14px", marginBottom: 10 }}>
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                          <span style={{ fontWeight: 700, fontSize: "0.95rem", color: "#1e293b" }}>{eq.label}</span>
                          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                            {hasTmp && <span style={{ background: "#fef9c3", color: "#92400e", borderRadius: 20, padding: "3px 10px", fontSize: "0.78rem", fontWeight: 600 }}>⚠️ {eq.temporaryUnits} temp</span>}
                            <span style={{ fontWeight: 900, fontSize: "1.2rem", color: "#2563EB" }}>{isFiltering ? eq.filteredTotal : eq.fleetTotal}</span>
                          </div>
                        </div>
                        <div style={{ display: "flex", gap: 6, alignItems: "center", marginBottom: 8 }}>
                          <MiniBar pct={Math.round(((isFiltering ? eq.filteredTotal : eq.fleetTotal) / fleetMax) * 100)} color="#2563EB" />
                          <span style={{ fontSize: "0.75rem", color: "#94a3b8", whiteSpace: "nowrap" }}>{eq.siteBreakdown.length} site{eq.siteBreakdown.length !== 1 ? "s" : ""}</span>
                        </div>
                        <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                          {eq.siteBreakdown.slice(0, 6).map(s => {
                            const days = daysSince(s.lastSeen);
                            const isTmp = s.source && s.source !== "Facility";
                            return (
                              <span key={s.site} style={{ background: isTmp ? sourceBg[s.source] : "#f8fafc", color: isTmp ? sourceClr[s.source] : "#475569", borderRadius: 8, padding: "4px 10px", fontSize: "0.8rem", fontWeight: 500 }}>
                                {isTmp ? sourceIcon[s.source] + " " : ""}{s.site}: {s.count}
                                {days !== null ? <span style={{ color: days > 60 ? "#dc2626" : days > 30 ? "#d97706" : "#94a3b8", marginLeft: 4, fontSize: "0.73rem" }}>{days === 0 ? "today" : `${days}d ago`}</span> : ""}
                              </span>
                            );
                          })}
                        </div>
                      </div>
                    );
                  })}
                </>
              )}
            </div>
          );
        })()}

        {/* ══ CHARTS / ACTIVITY ════════════════════════════ */}
        {activeTab === "activity" && (() => {
          const actLocQuery = filterLoc.trim().toLowerCase();
          const actHistory  = actLocQuery
            ? (history || []).filter(r => (r.siteName || "").toLowerCase().includes(actLocQuery))
            : (history || []);

          const b = actLocQuery
            ? AIEngine.BehaviorTracker.mine(actHistory)
            : patterns?.behavior;

          if (!b || Object.keys(b).length === 0)
            return (
              <div>
                <div className="aiFilterBar" style={{ marginBottom: 12 }}>
                  <input type="text" placeholder="🔍 Search a location…" value={filterLoc} onChange={e => setFilterLoc(e.target.value)} style={{ fontSize: "0.95rem", padding: "10px 14px" }} />
                  {filterLoc && (
                    <button type="button" onClick={() => setFilterLoc("")}
                      style={{ padding: "10px 14px", border: "1px solid #e2e8f0", borderRadius: 10, background: "#fff", fontSize: "0.85rem", color: "#64748b", cursor: "pointer", flexShrink: 0 }}>
                      ✕ Clear
                    </button>
                  )}
                </div>
                <EmptyState icon="📊" msg="Do a few inspections and charts will show up here — like which days are busiest!" />
              </div>
            );

          const dayNames    = ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"];
          const hourBuckets = b.hourBuckets || new Array(24).fill(0);
          const dayBuckets  = b.dayBuckets  || new Array(7).fill(0);
          const maxH = Math.max(...hourBuckets, 1);
          const maxD = Math.max(...dayBuckets, 1);
          const completeness = b.completeness || {};

          return (
            <div style={{ display: "flex", flexDirection: "column", gap: 22 }}>

              {/* Filter bar */}
              <div className="aiFilterBar" style={{ marginBottom: 0 }}>
                <input type="text" placeholder="🔍 Search a location…" value={filterLoc} onChange={e => setFilterLoc(e.target.value)} style={{ fontSize: "0.95rem", padding: "10px 14px" }} />
                {filterLoc && (
                  <button type="button" onClick={() => setFilterLoc("")}
                    style={{ padding: "10px 14px", border: "1px solid #e2e8f0", borderRadius: 10, background: "#fff", fontSize: "0.85rem", color: "#64748b", cursor: "pointer", flexShrink: 0 }}>
                    ✕ Clear
                  </button>
                )}
              </div>

              {actLocQuery && (
                <div className="aiFilterResult">
                  Showing <span>{actHistory.length}</span> report{actHistory.length !== 1 ? "s" : ""} for "{filterLoc}"
                </div>
              )}

              {/* Score cards */}
              <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                <StatPill emoji="📋" label="Total Reports" val={b.total || 0} />
                <StatPill emoji="⚠️" label="Avg Issues" val={b.avgIssues ?? 0} color={b.avgIssues > 3 ? "#dc2626" : b.avgIssues > 1 ? "#d97706" : "#16a34a"} />
                <StatPill emoji="✅" label="Zero Issues" val={b.zeroIssuePasses || 0} color="#16a34a" />
                <StatPill emoji="🔴" label="5+ Issues" val={b.highIssueRecords || 0} color={b.highIssueRecords > 0 ? "#dc2626" : "#94a3b8"} />
              </div>

              {/* Hour of day chart */}
              <div style={{ background: "#f8fafc", borderRadius: 14, padding: "14px" }}>
                <div style={{ fontWeight: 700, fontSize: "0.9rem", color: "#1e293b", marginBottom: 4 }}>🕐 What time do inspections happen?</div>
                {b.peakHourLabel && <div style={{ fontSize: "0.8rem", color: "#64748b", marginBottom: 10 }}>Most happen around <strong>{b.peakHourLabel}</strong></div>}
                <div style={{ display: "flex", gap: 2, alignItems: "flex-end", height: 56 }}>
                  {hourBuckets.map((count, h) => {
                    const hgt = Math.max(2, Math.round((count / maxH) * 50));
                    const isActive = h === b.peakHour && count > 0;
                    return (
                      <div key={h} title={`${h}:00 — ${count} inspection${count !== 1 ? "s" : ""}`}
                        style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center" }}>
                        <div style={{ width: "100%", height: hgt, borderRadius: "3px 3px 0 0", background: count > 0 ? (isActive ? "#2A295C" : "#93c5fd") : "#f1f5f9" }} />
                        {h % 6 === 0 && <div style={{ fontSize: "0.52rem", color: "#cbd5e1", marginTop: 2 }}>{h}h</div>}
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Day of week chart */}
              <div style={{ background: "#f8fafc", borderRadius: 14, padding: "14px" }}>
                <div style={{ fontWeight: 700, fontSize: "0.9rem", color: "#1e293b", marginBottom: 4 }}>📅 Which day is busiest?</div>
                {b.peakDayLabel && <div style={{ fontSize: "0.8rem", color: "#64748b", marginBottom: 10 }}>Busiest day: <strong>{b.peakDayLabel}</strong></div>}
                <div style={{ display: "flex", gap: 6, alignItems: "flex-end", height: 64 }}>
                  {dayBuckets.map((count, d) => {
                    const hgt = Math.max(3, Math.round((count / maxD) * 58));
                    const isActive = d === b.peakDay && count > 0;
                    return (
                      <div key={d} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 5 }}>
                        <div title={`${dayNames[d]}: ${count}`} style={{ width: "100%", height: hgt, borderRadius: "4px 4px 0 0", background: isActive ? "#2A295C" : "#bfdbfe" }} />
                        <div style={{ fontSize: "0.7rem", color: isActive ? "#2A295C" : "#94a3b8", fontWeight: isActive ? 700 : 400 }}>{dayNames[d].slice(0, 2)}</div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Top types */}
              {b.topTypes?.length > 0 && (
                <div>
                  <div style={{ fontWeight: 700, fontSize: "0.9rem", color: "#1e293b", marginBottom: 10 }}>📊 Most common inspection types</div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                    {b.topTypes.slice(0, 5).map((t, idx) => (
                      <div key={t.type} style={{ display: "flex", alignItems: "center", gap: 10, background: "#f8fafc", borderRadius: 10, padding: "10px 12px" }}>
                        <div style={{ fontWeight: 700, fontSize: "0.8rem", color: "#64748b", width: 20, flexShrink: 0 }}>#{idx + 1}</div>
                        <div style={{ fontSize: "0.85rem", color: "#374151", flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{t.type}</div>
                        <MiniBar pct={Math.round((t.count / b.topTypes[0].count) * 100)} color="#2A295C" />
                        <div style={{ fontSize: "0.8rem", color: "#64748b", fontWeight: 600, minWidth: 28, textAlign: "right" }}>{t.count}</div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Completeness */}
              <div style={{ background: "#f8fafc", borderRadius: 14, padding: "14px" }}>
                <div style={{ fontWeight: 700, fontSize: "0.9rem", color: "#1e293b", marginBottom: 4 }}>📝 How complete are the reports?</div>
                <div style={{ fontSize: "0.8rem", color: "#64748b", marginBottom: 12 }}>Shows how often each part of the form gets filled in</div>
                <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                  {[
                    { key: "inspectorName", label: "Inspector name", emoji: "👷" },
                    { key: "supervisorName", label: "Supervisor name", emoji: "🧑‍💼" },
                    { key: "temps",          label: "Temperatures",   emoji: "🌡️" },
                    { key: "floor",          label: "Floor / area",   emoji: "🏗️" },
                  ].map(f => {
                    const pct = completeness[f.key] ?? 0;
                    const color = pct >= 90 ? "#16a34a" : pct >= 60 ? "#d97706" : "#dc2626";
                    return (
                      <div key={f.key} style={{ display: "flex", alignItems: "center", gap: 10 }}>
                        <div style={{ fontSize: "1rem", flexShrink: 0 }}>{f.emoji}</div>
                        <div style={{ fontSize: "0.83rem", color: "#374151", width: 110, flexShrink: 0 }}>{f.label}</div>
                        <MiniBar pct={pct} color={color} />
                        <div style={{ fontSize: "0.8rem", color, fontWeight: 800, minWidth: 36, textAlign: "right" }}>{pct}%</div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          );
        })()}


      </div>
    </div>
  );
}

/* ── Predictive Insights Panel ───────────────────────────── */
function PredictiveInsightsPanel({ history }) {
  const [expanded, setExpanded] = React.useState({});
  const predictions = useMemo(() => buildPredictions(history), [history]);

  if (!predictions || predictions.length === 0) return (
    <div className="card" style={{ marginBottom: 24 }}>
      <div className="cardHeader">
        <div className="cardTitle">🤖 Predictive Insights</div>
      </div>
      <div className="cardBody">
        <div style={{ textAlign: "center", padding: "2rem 1rem", color: "#64748b" }}>
          <div style={{ fontSize: "2rem", marginBottom: "0.75rem" }}>📊</div>
          <div style={{ fontWeight: 600, fontSize: "1rem", marginBottom: "0.5rem", color: "#334155" }}>No predictions yet</div>
          <div style={{ fontSize: "0.875rem", lineHeight: 1.6 }}>
            Predictions appear once the same location has <strong>2+ inspections</strong>,
            or any site has open issues after <strong>30+ days</strong> without a follow-up.
          </div>
          <div style={{ fontSize: "0.8rem", marginTop: "0.75rem", color: "#94a3b8" }}>
            {history.length === 0
              ? "No inspection history found. Complete and save an inspection to get started."
              : `${history.length} inspection record${history.length === 1 ? "" : "s"} found — keep inspecting the same locations to unlock pattern analysis.`}
          </div>
        </div>
      </div>
    </div>
  );

  const high   = predictions.filter(p => p.risk === "high");
  const medium = predictions.filter(p => p.risk === "medium");

  const riskIcon  = { high: "🔴", medium: "🟡", watch: "🔵" };
  const riskLabel = { high: "High Risk", medium: "Medium Risk", watch: "Watch" };
  const riskColor = { high: "#EE0000", medium: "#b45309", watch: "#1d4ed8" };
  const typeBadge = {
    recurrence: { label: "Recurrence", bg: "#fef2f2", color: "#991b1b", border: "#fecaca" },
    tempDrift:  { label: "Temp Trend",  bg: "#fff7ed", color: "#9a3412", border: "#fed7aa" },
    escalation: { label: "Escalation", bg: "#fdf4ff", color: "#7e22ce", border: "#e9d5ff" },
    overdue:    { label: "Overdue",     bg: "#f0f9ff", color: "#0c4a6e", border: "#bae6fd" },
  };

  const toggle = (i) => setExpanded(prev => ({ ...prev, [i]: !prev[i] }));

  return (
    <div className="card" style={{ marginBottom: 24 }}>
      <div className="cardHeader">
        <div className="cardTitle">🤖 Predictive Insights</div>
      </div>
      <div className="cardBody">
        <div className="predictiveIntro">
          AI analysis of {history.length} inspection records — identifying patterns and forecasting future risk.
        </div>

        {/* Risk summary bar */}
        <div className="analysisStatsRow" style={{ marginTop: 12 }}>
          <div className="analysisStat">
            <div className="analysisStatNum">{predictions.length}</div>
            <div className="analysisStatLabel">Predictions</div>
          </div>
          <div className="analysisStat">
            <div className="analysisStatNum" style={{ color: high.length > 0 ? "#EE0000" : "#15803D" }}>{high.length}</div>
            <div className="analysisStatLabel">High Risk</div>
          </div>
          <div className="analysisStat">
            <div className="analysisStatNum" style={{ color: medium.length > 0 ? "#b45309" : "#15803D" }}>{medium.length}</div>
            <div className="analysisStatLabel">Medium Risk</div>
          </div>
        </div>

        {/* Prediction cards */}
        <div className="predictiveList">
          {predictions.map((p, i) => {
            const bt = typeBadge[p.type] || { label: p.type, bg: "#f9fafb", color: "#374151", border: "#e5e7eb" };
            const isOpen = !!expanded[i];
            return (
              <div
                key={i}
                className="predictiveItem"
                style={{ borderColor: riskColor[p.risk] + "55" }}
                onClick={() => toggle(i)}
              >
                <div className="predictiveItemTop">
                  <span className="predictiveRiskIcon">{riskIcon[p.risk]}</span>
                  <div className="predictiveItemMain">
                    <div className="predictiveItemMsg">{p.message}</div>
                    <div className="predictiveItemMeta">
                      <span className="predictiveTypeBadge" style={{ background: bt.bg, color: bt.color, border: `1px solid ${bt.border}` }}>
                        {bt.label}
                      </span>
                      <span className="predictiveRiskLabel" style={{ color: riskColor[p.risk] }}>
                        {riskLabel[p.risk]}
                      </span>
                    </div>
                  </div>
                  <span className="predictiveChevron">{isOpen ? "▲" : "▼"}</span>
                </div>
                {isOpen && (
                  <div className="predictiveDetail">
                    <span className="predictiveDetailIcon">💡</span>
                    {p.detail}
                  </div>
                )}
              </div>
            );
          })}
        </div>

        <div className="predictiveFooter">
          Predictions are based on historical patterns in your inspection data. Always verify findings on-site.
        </div>
      </div>
    </div>
  );
}

/* ── Recurring Issues Analysis ──────────────────────────── */
function RecurringIssuesPanel({ history, onLocationClick }) {
  const analysis = useMemo(() => {
    if (history.length < 2) return null;

    // 1. Count issues per category and track which kitchens have them
    const issueCounts = {};      // { "Ceiling": 5 }
    const issueKitchens = {};    // { "Ceiling": [ { name, unit, floor }, ... ] }
    const issueByLocation = {};
    const locationInspectionCount = {};

    for (const rec of history) {
      const locLabel = `${rec.siteName || rec.location || "Unknown"}${rec.floor ? ` (${rec.floor})` : ""}`;
      const locUnit = rec.siteNumber || "";
      locationInspectionCount[locLabel] = (locationInspectionCount[locLabel] || 0) + 1;

      const seenInThisRec = new Set();
      for (const item of (rec.actionItems || [])) {
        const cat = item.issue?.split(":")[0]?.trim() || "Other";
        if (seenInThisRec.has(cat)) continue;
        seenInThisRec.add(cat);

        issueCounts[cat] = (issueCounts[cat] || 0) + 1;

        // Track which kitchens have this issue
        if (!issueKitchens[cat]) issueKitchens[cat] = [];
        issueKitchens[cat].push({
          name: rec.siteName || rec.location || "Unknown",
          unit: locUnit,
          floor: rec.floor || "",
          date: rec.inspectionDate || "",
        });

        if (!issueByLocation[locLabel]) issueByLocation[locLabel] = {};
        issueByLocation[locLabel][cat] = (issueByLocation[locLabel][cat] || 0) + 1;
      }
    }

    // 2. Find recurring issues (appeared in 2+ inspections) with their kitchens
    const recurring = Object.entries(issueCounts)
      .filter(([, count]) => count >= 2)
      .sort((a, b) => b[1] - a[1])
      .map(([cat, count]) => {
        // Group kitchens by name+unit, show unique locations
        const kitchenMap = {};
        for (const k of issueKitchens[cat]) {
          const key = `${k.name}${k.unit ? ` #${k.unit}` : ""}${k.floor ? ` (${k.floor})` : ""}`;
          if (!kitchenMap[key]) kitchenMap[key] = { label: key, count: 0, dates: [] };
          kitchenMap[key].count++;
          if (k.date) kitchenMap[key].dates.push(k.date);
        }
        const kitchens = Object.values(kitchenMap).sort((a, b) => b.count - a.count);
        return { category: cat, count, kitchens };
      });

    // 3. Per-location recurring
    const locationRecurring = {};
    for (const [loc, cats] of Object.entries(issueByLocation)) {
      const total = locationInspectionCount[loc] || 1;
      const recs = Object.entries(cats)
        .filter(([, c]) => c >= 2)
        .map(([cat, c]) => ({ category: cat, count: c, rate: Math.round((c / total) * 100) }))
        .sort((a, b) => b.rate - a.rate);
      if (recs.length > 0) locationRecurring[loc] = recs;
    }

    // 4. Temperature compliance rate
    let tempChecks = 0, tempFails = 0;
    for (const rec of history) {
      const hand = Number(rec.temps?.handSinkTempF);
      const three = Number(rec.temps?.threeCompSinkTempF);
      if (hand) { tempChecks++; if (hand < 95) tempFails++; }
      if (three) { tempChecks++; if (three < 110) tempFails++; }
    }
    const tempComplianceRate = tempChecks > 0 ? Math.round(((tempChecks - tempFails) / tempChecks) * 100) : null;

    // 5. Worst locations — most total issues
    const locIssueCount = {};
    for (const rec of history) {
      const locLabel = `${rec.siteName || rec.location || "Unknown"}${rec.siteNumber ? ` #${rec.siteNumber}` : ""}${rec.floor ? ` (${rec.floor})` : ""}`;
      locIssueCount[locLabel] = (locIssueCount[locLabel] || 0) + (rec.actionItems || []).length;
    }
    const worstLocations = Object.entries(locIssueCount)
      .filter(([, c]) => c >= 2)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5);

    return { recurring, locationRecurring, tempComplianceRate, tempChecks, tempFails, totalInspections: history.length, worstLocations };
  }, [history]);

  if (!analysis) return null;
  if (analysis.recurring.length === 0 && Object.keys(analysis.locationRecurring).length === 0 && analysis.worstLocations.length === 0) return null;

  return (
    <div className="card" style={{ marginBottom: 24 }}>
      <div className="cardHeader"><div className="cardTitle">Recurring Issues Tracker</div></div>
      <div className="cardBody">
        {/* Overall stats */}
        <div className="analysisStatsRow">
          <div className="analysisStat">
            <div className="analysisStatNum">{analysis.totalInspections}</div>
            <div className="analysisStatLabel">Total Inspections</div>
          </div>
          {analysis.tempComplianceRate !== null && (
            <div className="analysisStat">
              <div className="analysisStatNum" style={{ color: analysis.tempComplianceRate >= 90 ? "#15803D" : "#EE0000" }}>
                {analysis.tempComplianceRate}%
              </div>
              <div className="analysisStatLabel">Temp Compliance</div>
            </div>
          )}
          <div className="analysisStat">
            <div className="analysisStatNum" style={{ color: analysis.recurring.length > 0 ? "#EE0000" : "#15803D" }}>
              {analysis.recurring.length}
            </div>
            <div className="analysisStatLabel">Repeat Issues</div>
          </div>
        </div>

        {/* Global recurring issues — now shows which kitchens */}
        {analysis.recurring.length > 0 && (
          <div style={{ marginTop: 16 }}>
            <div className="guideSectionTitle">Issues That Keep Coming Back</div>
            <div className="recurringList">
              {analysis.recurring.map(({ category, count, kitchens }) => (
                <div key={category} className="recurringItem recurringItemExpanded">
                  <span className="recurringBar" style={{ width: `${Math.min(100, (count / analysis.totalInspections) * 100)}%` }} />
                  <div className="recurringTop">
                    <span className="recurringLabel">{category}</span>
                    <span className="recurringBadge">{count}/{analysis.totalInspections} ({Math.round((count / analysis.totalInspections) * 100)}%)</span>
                  </div>
                  <div className="recurringKitchens">
                    {kitchens.map((k, i) => (
                      <span key={i} className="recurringKitchenTag recurringKitchenClickable" onClick={() => onLocationClick?.(k.label.split(" #")[0].split(" (")[0])}>
                        {k.label} <span className="recurringKitchenCount">&times;{k.count}</span>
                      </span>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Worst locations ranking */}
        {analysis.worstLocations.length > 0 && (
          <div style={{ marginTop: 20 }}>
            <div className="guideSectionTitle">Locations With Most Issues</div>
            <div className="worstLocationsList">
              {analysis.worstLocations.map(([loc, count], i) => (
                <div key={loc} className="worstLocation worstLocationClickable" onClick={() => onLocationClick?.(loc.split(" #")[0].split(" (")[0])}>
                  <span className="worstRank" style={{ background: i === 0 ? "#EE0000" : i === 1 ? "#f97316" : "#eab308" }}>#{i + 1}</span>
                  <span className="worstName">{loc}</span>
                  <span className="worstCount">{count} issue{count !== 1 ? "s" : ""}</span>
                  <span className="worstArrow">&#8594;</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Per-location recurring */}
        {Object.keys(analysis.locationRecurring).length > 0 && (
          <div style={{ marginTop: 20 }}>
            <div className="guideSectionTitle">Flagged Locations — Repeat Problems</div>
            {Object.entries(analysis.locationRecurring).map(([loc, issues]) => (
              <div key={loc} className="flaggedLocation">
                <div className="flaggedLocationName">{loc}</div>
                <div className="flaggedIssuesList">
                  {issues.map((iss, i) => (
                    <div key={i} className="flaggedIssue">
                      <span className="flaggedIssueCat">{iss.category}</span>
                      <span className="flaggedIssueRate" style={{ color: iss.rate >= 50 ? "#EE0000" : "#b45309" }}>
                        {iss.count}x ({iss.rate}% of inspections)
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

/* ── HACCP temp items + pass/fail helper (used by HaccpPortal AND HistoryPage) ── */
const HACCP_TEMP_ITEMS = [
  { key: "hotHolding",     label: "Hot Holding",        unit: "°F", min: 135, type: "hot" },
  { key: "coldHolding",    label: "Cold Holding",        unit: "°F", max: 41,  type: "cold" },
  { key: "cookingTemp",    label: "Cooking Temp",        unit: "°F", min: 165, type: "hot" },
  { key: "reheating",      label: "Reheating Temp",      unit: "°F", min: 165, type: "hot" },
  { key: "walkInCooler",   label: "Walk-in Cooler",      unit: "°F", max: 41,  type: "cold" },
  { key: "walkInFreezer",  label: "Walk-in Freezer",     unit: "°F", max: 10,  type: "cold" },
];

function tempPass(item, val) {
  const n = Number(val);
  if (!val || isNaN(n)) return null;
  if (item.type === "hot")  return n >= item.min;
  if (item.type === "cold") return n <= item.max;
  return null;
}

/* ── Import Review Modal (paper report OCR review) ──────── */
function ImportReviewModal({ fields: initialFields, imagePreview, saving, onSave, onCancel }) {
  const [fields, setFields] = useState({ ...initialFields });
  const [actionItems, setActionItems] = useState(
    Array.isArray(initialFields.actionItems) ? initialFields.actionItems : []
  );

  function setField(key, val) { setFields(f => ({ ...f, [key]: val })); }
  function setActionItem(idx, key, val) {
    setActionItems(prev => prev.map((item, i) => i === idx ? { ...item, [key]: val } : item));
  }
  function addActionItem() {
    setActionItems(prev => [...prev, { area: "", issue: "", priority: "Medium", corrective: "" }]);
  }
  function removeActionItem(idx) {
    setActionItems(prev => prev.filter((_, i) => i !== idx));
  }

  function handleSave() {
    onSave({ ...fields, actionItems });
  }

  const labelStyle = { display: "block", fontSize: "0.75rem", fontWeight: 700, color: "#64748b", marginBottom: 3, textTransform: "uppercase", letterSpacing: "0.04em" };
  const inputStyle = { width: "100%", padding: "0.45rem 0.6rem", borderRadius: 7, border: "1px solid #cbd5e1", fontSize: "0.9rem", background: "#fff", boxSizing: "border-box" };
  const textareaStyle = { ...inputStyle, minHeight: 80, resize: "vertical", fontFamily: "inherit" };

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.55)", zIndex: 9999, overflowY: "auto", display: "flex", alignItems: "flex-start", justifyContent: "center", padding: "1.5rem 1rem" }}>
      <div style={{ background: "#fff", borderRadius: 14, width: "100%", maxWidth: 820, boxShadow: "0 8px 40px rgba(0,0,0,0.22)" }}>

        {/* Header */}
        <div style={{ background: "#2A295C", color: "#fff", borderRadius: "14px 14px 0 0", padding: "1rem 1.5rem", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div>
            <div style={{ fontWeight: 700, fontSize: "1.05rem" }}>📋 Review Imported Report</div>
            <div style={{ fontSize: "0.8rem", opacity: 0.75, marginTop: 2 }}>AI read this paper report. Verify each field before saving — you can edit anything below.</div>
          </div>
          <button type="button" onClick={onCancel} style={{ background: "rgba(255,255,255,0.15)", border: "none", color: "#fff", borderRadius: 8, padding: "0.35rem 0.7rem", cursor: "pointer", fontWeight: 700, fontSize: "1rem" }}>✕</button>
        </div>

        <div style={{ display: "flex", gap: 0, flexDirection: "column" }}>

          {/* Image preview strip */}
          {imagePreview && (
            <div style={{ background: "#f1f5f9", padding: "0.75rem 1.5rem", display: "flex", alignItems: "center", gap: 12, borderBottom: "1px solid #e2e8f0" }}>
              <img src={imagePreview} alt="Paper report" style={{ height: 90, width: "auto", borderRadius: 6, border: "1px solid #cbd5e1", objectFit: "contain", background: "#fff" }} />
              <div style={{ fontSize: "0.8rem", color: "#475569" }}>Original paper report — AI extracted the fields below. Scroll down to review all sections.</div>
            </div>
          )}

          {/* Fields */}
          <div style={{ padding: "1.25rem 1.5rem" }}>

            {/* Info grid */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.75rem 1rem", marginBottom: "1rem" }}>
              {[
                ["siteName", "Site / Location Name"],
                ["siteNumber", "Site Number"],
                ["sitePhone", "Site Phone"],
                ["floor", "Floor / Area"],
                ["inspectionDate", "Inspection Date (YYYY-MM-DD)"],
                ["inspectionType", "Inspection Type"],
                ["supervisorName", "Supervisor Name"],
                ["inspectorName", "Inspector Name"],
                ["participantName", "Participant Name"],
                ["eventName", "Event Name"],
              ].map(([key, label]) => (
                <div key={key}>
                  <label style={labelStyle}>{label}</label>
                  <input style={inputStyle} value={fields[key] || ""} onChange={e => setField(key, e.target.value)} />
                </div>
              ))}
              <div>
                <label style={labelStyle}>Overall Status</label>
                <select style={inputStyle} value={fields.overallStatus || "Pass"} onChange={e => setField("overallStatus", e.target.value)}>
                  <option value="Pass">Pass</option>
                  <option value="Needs Improvement">Needs Improvement</option>
                  <option value="Fail">Fail</option>
                </select>
              </div>
            </div>

            {/* Notes */}
            <div style={{ marginBottom: "1rem" }}>
              <label style={labelStyle}>Raw Notes / Observations</label>
              <textarea style={textareaStyle} value={fields.rawNotes || ""} onChange={e => setField("rawNotes", e.target.value)} />
            </div>

            {/* Narrative summary */}
            <div style={{ marginBottom: "1rem" }}>
              <label style={labelStyle}>Report Summary (narrative)</label>
              <textarea style={{ ...textareaStyle, minHeight: 100 }} value={fields.output || ""} onChange={e => setField("output", e.target.value)} />
            </div>

            {/* Action items */}
            <div style={{ marginBottom: "1rem" }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
                <label style={{ ...labelStyle, margin: 0 }}>Action Items / Issues ({actionItems.length})</label>
                <button type="button" onClick={addActionItem} style={{ fontSize: "0.8rem", background: "#eff6ff", border: "1px solid #bfdbfe", color: "#1d4ed8", borderRadius: 6, padding: "0.25rem 0.6rem", cursor: "pointer", fontWeight: 600 }}>+ Add Item</button>
              </div>
              {actionItems.length === 0 && (
                <div style={{ color: "#94a3b8", fontSize: "0.85rem", fontStyle: "italic", padding: "0.5rem 0" }}>No issues found — or add them manually using the button above.</div>
              )}
              {actionItems.map((item, idx) => (
                <div key={idx} style={{ background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: 9, padding: "0.75rem", marginBottom: 8 }}>
                  <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr", gap: "0.5rem 0.75rem", marginBottom: 6 }}>
                    <div>
                      <label style={labelStyle}>Area</label>
                      <input style={inputStyle} value={item.area || ""} onChange={e => setActionItem(idx, "area", e.target.value)} placeholder="e.g. Grill station" />
                    </div>
                    <div>
                      <label style={labelStyle}>Priority</label>
                      <select style={inputStyle} value={item.priority || "Medium"} onChange={e => setActionItem(idx, "priority", e.target.value)}>
                        <option value="High">High</option>
                        <option value="Medium">Medium</option>
                        <option value="Low">Low</option>
                      </select>
                    </div>
                  </div>
                  <div style={{ marginBottom: 6 }}>
                    <label style={labelStyle}>Issue Description</label>
                    <input style={inputStyle} value={item.issue || ""} onChange={e => setActionItem(idx, "issue", e.target.value)} placeholder="Describe the issue" />
                  </div>
                  <div style={{ display: "flex", alignItems: "flex-end", gap: 8 }}>
                    <div style={{ flex: 1 }}>
                      <label style={labelStyle}>Corrective Action</label>
                      <input style={inputStyle} value={item.corrective || ""} onChange={e => setActionItem(idx, "corrective", e.target.value)} placeholder="What was / should be done" />
                    </div>
                    <button type="button" onClick={() => removeActionItem(idx)} style={{ background: "#fef2f2", border: "1px solid #fca5a5", color: "#dc2626", borderRadius: 6, padding: "0.42rem 0.6rem", cursor: "pointer", fontWeight: 700, fontSize: "0.85rem", flexShrink: 0 }}>Remove</button>
                  </div>
                </div>
              ))}
            </div>

            {/* Save / Cancel */}
            <div style={{ display: "flex", gap: 10, justifyContent: "flex-end", borderTop: "1px solid #e2e8f0", paddingTop: "1rem" }}>
              <button type="button" onClick={onCancel} style={{ background: "#fff", border: "1px solid #cbd5e1", color: "#374151", borderRadius: 8, padding: "0.55rem 1.2rem", cursor: "pointer", fontWeight: 600, fontSize: "0.9rem" }}>Cancel</button>
              <button type="button" onClick={handleSave} disabled={saving} style={{ background: "#2A295C", color: "#fff", border: "none", borderRadius: 8, padding: "0.55rem 1.4rem", cursor: saving ? "not-allowed" : "pointer", fontWeight: 700, fontSize: "0.9rem", opacity: saving ? 0.7 : 1 }}>
                {saving ? "Saving…" : "✓ Save Report"}
              </button>
            </div>

          </div>
        </div>
      </div>
    </div>
  );
}

/* ── History Page Component ──────────────────────────────── */
function HistoryPage({ onBack, onEdit, managedVenueId, managedVenueName, currentUser }) {
  // Returns true if the current user is allowed to edit the given record.
  // Allowed: the original author (matched by badgeHash), any admin, or global_admin.
  function canEditRec(rec) {
    if (!currentUser) return false;
    if (currentUser.role === "admin" || currentUser.role === "global_admin") return true;
    if (rec.savedByHash && currentUser.badgeHash && rec.savedByHash === currentUser.badgeHash) return true;
    return false;
  }
  const [history, setHistory] = useState([]);
  const [filterDate, setFilterDate] = useState("");
  const [filterType, setFilterType] = useState("");
  const [filterFloor, setFilterFloor] = useState("");
  const [filterIssue, setFilterIssue] = useState("");
  const [filterSite, setFilterSite] = useState("");
  const [filterLocType, setFilterLocType] = useState("");
  const [expandedId, setExpandedId] = useState(null);
  const [dlPickerId, setDlPickerId] = useState(null);   // which report card has the download picker open
  const [dlScope, setDlScope] = useState(null);          // "full" | "issues"
  const [lightboxPhoto, setLightboxPhoto] = useState(null); // { url, label, caption, num }
  const [importReview, setImportReview] = useState(null); // { fields, imagePreview } — paper import review modal
  const [importSaving, setImportSaving] = useState(false);
  const [importOcrLoading, setImportOcrLoading] = useState(false);
  const [importOcrError, setImportOcrError] = useState("");
  const [historyLoaded, setHistoryLoaded] = useState(false);
  const [historyTab, setHistoryTab] = useState("reports"); // "reports" | "analytics"
  const [haccpByReport, setHaccpByReport] = useState({}); // { [reportId]: [...submissions] }
  const [chatByReport, setChatByReport] = useState({});  // { [reportId]: [...messages] }
  const [showHistoryMenu, setShowHistoryMenu] = useState(false);
  const [analyticsTab, setAnalyticsTab] = useState("temp"); // "temp" | "insights" | "predictive" | "recurring"
  const [selectMode, setSelectMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState(new Set());
  const [showIssueFilter, setShowIssueFilter] = useState(null); // null | "excel" | "word"
  const [selectedIssueKeys, setSelectedIssueKeys] = useState(null); // null = all issues
  const [modalIssueSearch, setModalIssueSearch] = useState(""); // search filter inside issue modal
  // Pagination + date-range state
  const [filterDateFrom, setFilterDateFrom] = useState("");
  const [filterDateTo, setFilterDateTo] = useState("");
  const [historyLastDoc, setHistoryLastDoc] = useState(null);
  const [historyHasMore, setHistoryHasMore] = useState(false);
  const [historyLoadingMore, setHistoryLoadingMore] = useState(false);

  useEffect(() => {
    setHistory([]);
    setHistoryLastDoc(null);
    setHistoryHasMore(false);
    setHistoryLoaded(false);
    loadHistory(managedVenueId || undefined, {
      dateFrom: filterDateFrom || undefined,
      dateTo: filterDateTo || undefined,
    }).then(({ list, lastDoc, hasMore }) => {
      setHistory(list);
      setHistoryLastDoc(lastDoc);
      setHistoryHasMore(hasMore);
      setHistoryLoaded(true);
      if (list.length > 0) {
        AIEngine.learnFromHistory(list);
        persistAnalyticsSnapshot(managedVenueId || VENUE_ID);
      }
    });
  }, [managedVenueId, filterDateFrom, filterDateTo]);

  function loadMoreHistory() {
    if (!historyHasMore || historyLoadingMore) return;
    setHistoryLoadingMore(true);
    loadHistory(managedVenueId || undefined, {
      dateFrom: filterDateFrom || undefined,
      dateTo: filterDateTo || undefined,
      lastDoc: historyLastDoc,
    }).then(({ list, lastDoc, hasMore }) => {
      setHistory(prev => [...prev, ...list]);
      setHistoryLastDoc(lastDoc);
      setHistoryHasMore(hasMore);
      setHistoryLoadingMore(false);
    });
  }

  // When a card is expanded, load + auto-refresh HACCP submissions and chat every 8s
  useEffect(() => {
    if (!expandedId) return;
    // Initial load
    loadHaccpForReport(expandedId).then(subs => {
      setHaccpByReport(prev => ({ ...prev, [expandedId]: subs }));
    });
    loadChatMessages(expandedId).then(msgs => {
      setChatByReport(prev => ({ ...prev, [expandedId]: msgs }));
    });
    // Live refresh while card is open
    const iv = setInterval(() => {
      loadHaccpForReport(expandedId).then(subs => {
        setHaccpByReport(prev => ({ ...prev, [expandedId]: subs }));
      });
      loadChatMessages(expandedId).then(msgs => {
        setChatByReport(prev => ({ ...prev, [expandedId]: msgs }));
      });
    }, 8000);
    return () => clearInterval(iv);
  }, [expandedId]);

  const issueTypes = useMemo(() => {
    const set = new Set();
    for (const rec of history) {
      for (const item of (rec.actionItems || [])) {
        set.add(item.issue?.split(":")[0]?.trim() || "Other");
      }
    }
    return Array.from(set).sort();
  }, [history]);

  const filtered = useMemo(() => {
    return history.filter(rec => {
      if (filterDate && rec.inspectionDate !== filterDate) return false;
      if (filterType && rec.inspectionType !== filterType) return false;
      if (filterFloor && rec.floor !== filterFloor) return false;
      if (filterLocType && rec.locationType !== filterLocType) return false;
      if (filterSite) {
        const recSite = `${rec.siteName || rec.location || ""}${rec.siteNumber ? ` #${rec.siteNumber}` : ""}`;
        if (!recSite.toLowerCase().includes(filterSite.toLowerCase())) return false;
      }
      if (filterIssue) {
        const hasIssue = (rec.actionItems || []).some(a =>
          a.issue?.toLowerCase().includes(filterIssue.toLowerCase())
        );
        if (!hasIssue) return false;
      }
      return true;
    });
  }, [history, filterDate, filterType, filterFloor, filterLocType, filterSite, filterIssue]);

  // Function to jump to a specific location's reports
  function filterByLocation(locLabel) {
    setFilterSite(locLabel);
    setFilterDate("");
    setFilterType("");
    setFilterFloor("");
    setFilterIssue("");
    setHistoryTab("reports");
    setTimeout(() => {
      const el = document.getElementById("history-results");
      if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 100);
  }

  function deleteRecord(id) {
    const next = history.filter(r => r.id !== id);
    setHistory(next);
    deleteOneInspection(id).catch(() => {});
  }

  function clearAll() {
    if (!confirm("Delete all inspection history? This cannot be undone.")) return;
    setHistory([]);
    clearAllInspections().catch(() => {});
  }

  function exportBackup() {
    const blob = new Blob([JSON.stringify(history, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `inspection-backup-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  function exportBulkSummary(records) {
    if (!records || records.length === 0) return;
    const dateStr = new Date().toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });
    const passCount = records.filter(r => r.overallStatus === "Pass").length;
    const failCount = records.filter(r => r.overallStatus === "Fail" || r.overallStatus === "Needs Improvement").length;
    const allIssues = records.flatMap(r => (r.actionItems || []).map(a => ({ ...a, _site: r.siteName || r.location || "—", _date: r.inspectionDate || "—" })));
    const highCount = allIssues.filter(i => i.priority === "High").length;

    const reportBlocks = records.map(rec => {
      const issues = rec.actionItems || [];
      const issueRows = issues.length > 0
        ? issues.map(a => `<tr><td style="padding:6px 10px;border:1px solid #e5e7eb;">${a.area || "—"}</td><td style="padding:6px 10px;border:1px solid #e5e7eb;">${a.issue || "—"}</td><td style="padding:6px 10px;border:1px solid #e5e7eb;font-weight:700;color:${a.priority === "High" ? "#dc2626" : "#d97706"};">${a.priority || "—"}</td><td style="padding:6px 10px;border:1px solid #e5e7eb;">${a.corrective || "—"}</td></tr>`).join("")
        : `<tr><td colspan="4" style="padding:8px 10px;border:1px solid #e5e7eb;color:#6b7280;font-style:italic;">No action items recorded</td></tr>`;
      const statusColor = rec.overallStatus === "Pass" ? "#15803d" : "#dc2626";
      return `
      <div style="border:1px solid #e5e7eb;border-radius:10px;margin-bottom:24px;overflow:hidden;page-break-inside:avoid;">
        <div style="background:#f9fafb;padding:14px 18px;border-bottom:1px solid #e5e7eb;display:flex;align-items:center;gap:12px;flex-wrap:wrap;">
          <span style="background:${statusColor};color:#fff;border-radius:6px;padding:3px 10px;font-weight:700;font-size:0.85rem;">${rec.overallStatus || "—"}</span>
          <strong style="font-size:1rem;">${rec.siteName || rec.location || "Inspection"}</strong>
          ${rec.siteNumber ? `<span style="background:#1d4ed8;color:#fff;border-radius:5px;padding:2px 8px;font-size:0.8rem;font-weight:700;">#${rec.siteNumber}</span>` : ""}
          ${rec.restaurantLicense ? `<span style="background:#7c3aed;color:#fff;border-radius:5px;padding:2px 8px;font-size:0.8rem;font-weight:700;">🪪 ${rec.restaurantLicense}</span>` : ""}
        </div>
        <div style="padding:14px 18px;">
          <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:8px 20px;margin-bottom:12px;font-size:0.88rem;">
            <div><strong>Date:</strong> ${rec.inspectionDate || "—"}</div>
            <div><strong>Type:</strong> ${rec.inspectionType || "—"}</div>
            <div><strong>Inspector:</strong> ${rec.inspectorName || "—"}</div>
            <div><strong>Supervisor:</strong> ${rec.supervisorName || "—"}</div>
            ${rec.floor ? `<div><strong>Floor:</strong> ${rec.floor}</div>` : ""}
            ${rec.eventName ? `<div><strong>Event:</strong> ${rec.eventName}</div>` : ""}
          </div>
          ${rec.output ? `<p style="font-size:0.9rem;color:#374151;line-height:1.6;margin-bottom:12px;">${rec.output}</p>` : ""}
          <table style="width:100%;border-collapse:collapse;font-size:0.85rem;">
            <thead>
              <tr style="background:#f3f4f6;">
                <th style="padding:7px 10px;border:1px solid #e5e7eb;text-align:left;">Area</th>
                <th style="padding:7px 10px;border:1px solid #e5e7eb;text-align:left;">Issue</th>
                <th style="padding:7px 10px;border:1px solid #e5e7eb;text-align:left;">Priority</th>
                <th style="padding:7px 10px;border:1px solid #e5e7eb;text-align:left;">Corrective Action</th>
              </tr>
            </thead>
            <tbody>${issueRows}</tbody>
          </table>
        </div>
      </div>`;
    }).join("");

    const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width,initial-scale=1" />
<title>Bulk Inspection Summary — ${dateStr}</title>
<style>
  body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; color: #111827; margin: 0; padding: 32px 24px; max-width: 900px; margin: 0 auto; }
  @media print { body { padding: 0; } }
</style>
</head>
<body>
  <div style="border-bottom:3px solid #1d4ed8;padding-bottom:18px;margin-bottom:28px;">
    <h1 style="margin:0 0 6px;font-size:1.5rem;color:#1d4ed8;">Bulk Inspection Summary</h1>
    <div style="color:#6b7280;font-size:0.9rem;">Generated: ${dateStr} &nbsp;|&nbsp; ${records.length} report${records.length !== 1 ? "s" : ""} selected</div>
  </div>

  <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:12px;margin-bottom:28px;">
    <div style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:8px;padding:14px;text-align:center;">
      <div style="font-size:1.8rem;font-weight:800;color:#15803d;">${passCount}</div>
      <div style="font-size:0.8rem;color:#166534;font-weight:600;">Passed</div>
    </div>
    <div style="background:#fef2f2;border:1px solid #fca5a5;border-radius:8px;padding:14px;text-align:center;">
      <div style="font-size:1.8rem;font-weight:800;color:#dc2626;">${failCount}</div>
      <div style="font-size:0.8rem;color:#991b1b;font-weight:600;">Failed / Needs Improvement</div>
    </div>
    <div style="background:#fff7ed;border:1px solid #fed7aa;border-radius:8px;padding:14px;text-align:center;">
      <div style="font-size:1.8rem;font-weight:800;color:#c2410c;">${allIssues.length}</div>
      <div style="font-size:0.8rem;color:#9a3412;font-weight:600;">Total Action Items</div>
    </div>
    <div style="background:#fefce8;border:1px solid #fde68a;border-radius:8px;padding:14px;text-align:center;">
      <div style="font-size:1.8rem;font-weight:800;color:#b45309;">${highCount}</div>
      <div style="font-size:0.8rem;color:#92400e;font-weight:600;">High Priority</div>
    </div>
  </div>

  <h2 style="font-size:1.05rem;margin-bottom:14px;color:#374151;">Individual Reports</h2>
  ${reportBlocks}

  <div style="margin-top:32px;padding-top:16px;border-top:1px solid #e5e7eb;font-size:0.78rem;color:#9ca3af;text-align:center;">
    Generated by Sodexo Inspection App &nbsp;|&nbsp; ${dateStr}
  </div>
</body>
</html>`;

    const blob = new Blob([html], { type: "text/html" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `inspection-summary-${new Date().toISOString().slice(0, 10)}.html`;
    a.click();
    URL.revokeObjectURL(url);
  }

  function exportBulkExcel(records) {
    if (!records || records.length === 0) return;
    const dateStr = new Date().toISOString().slice(0, 10);
    const passCount = records.filter(r => r.overallStatus === "Pass").length;
    const failCount = records.length - passCount;
    const allIssues = records.flatMap(r => r.actionItems || []);
    const highCount = allIssues.filter(i => i.priority === "High").length;

    const esc = s => (s || "").toString().replace(/</g, "&lt;").replace(/>/g, "&gt;");

    // Helper: if area is missing, parse it from the issue text (e.g. "Ceiling: notes" → area "Ceiling", issue "notes")
    function splitIssue(a) {
      if (a.area && a.area.trim()) return { area: a.area.trim(), issue: (a.issue || "").trim() };
      const raw = (a.issue || "").trim();
      const colonIdx = raw.indexOf(":");
      if (colonIdx > 0 && colonIdx < 40) {
        return { area: raw.slice(0, colonIdx).trim(), issue: raw.slice(colonIdx + 1).trim() };
      }
      return { area: "General", issue: raw };
    }

    // Summary sheet rows
    const summaryRows = records.map((rec, i) => {
      const issues = rec.actionItems || [];
      const hi = issues.filter(a => a.priority === "High").length;
      return `<tr>
        <td style="text-align:center">${i + 1}</td>
        <td>${esc(rec.siteName || rec.location || "—")}</td>
        <td>${esc(rec.inspectionDate || "—")}</td>
        <td>${esc(rec.inspectionType || "—")}</td>
        <td>${esc(rec.inspectorName || "—")}</td>
        <td class="${rec.overallStatus === "Pass" ? "ok" : "bad"}">${esc(rec.overallStatus || "—")}</td>
        <td style="text-align:center">${issues.length}</td>
        <td style="text-align:center;${hi > 0 ? "color:#DC2626;font-weight:bold;" : ""}">${hi}</td>
      </tr>`;
    }).join("\n");

    // All issues flat list — corrective action is ALWAYS its own separate column
    let issueRowNum = 0;
    const issueRows = records.flatMap(rec =>
      (rec.actionItems || []).map(a => {
        issueRowNum++;
        const { area, issue } = splitIssue(a);
        const corrective = (a.corrective || "").trim();
        return `<tr>
          <td style="text-align:center;color:#6B7280">${issueRowNum}</td>
          <td>${esc(rec.siteName || rec.location || "—")}</td>
          <td>${esc(rec.inspectionDate || "—")}</td>
          <td>${esc(rec.inspectorName || "—")}</td>
          <td style="font-weight:600;color:#2A295C">${esc(area)}</td>
          <td>${esc(issue)}</td>
          <td class="${a.priority === "High" ? "bad" : "warn"}">${esc(a.priority || "—")}</td>
          <td style="color:#0369a1">${esc(corrective || "—")}</td>
        </tr>`;
      })
    ).join("\n");

    const html = `<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:x="urn:schemas-microsoft-com:office:excel" xmlns="http://www.w3.org/TR/REC-html40">
<head><meta charset="utf-8">
<!--[if gte mso 9]><xml><x:ExcelWorkbook><x:ExcelWorksheets>
  <x:ExcelWorksheet><x:Name>Summary</x:Name><x:WorksheetOptions><x:DisplayGridlines/></x:WorksheetOptions></x:ExcelWorksheet>
</x:ExcelWorksheets></x:ExcelWorkbook></xml><![endif]-->
<style>
  td, th { mso-number-format:"\\@"; padding: 6px 10px; border: 1px solid #ccc; font-family: Calibri, Arial; font-size: 10pt; vertical-align: top; }
  th { background: #2A295C; color: white; font-weight: bold; }
  .title { font-size: 15pt; font-weight: bold; color: #2A295C; border: none; }
  .meta { font-weight: bold; color: #2A295C; background: #F7F8FA; }
  .ok { background: #ECFDF5; color: #15803D; font-weight: bold; }
  .bad { background: #FEF2F2; color: #DC2626; font-weight: bold; }
  .warn { background: #FFFBEB; color: #D97706; font-weight: bold; }
  .section { font-size: 12pt; font-weight: bold; color: #2A295C; background: #EEF2FF; border-top: 2px solid #2A295C; }
  .corrective-th { background: #0369a1; color: white; font-weight: bold; }
</style></head><body>

<!-- ── SUMMARY TABLE ── -->
<table>
  <tr><td class="title" colspan="8">Bulk Inspection Summary — ${dateStr}</td></tr>
  <tr><td colspan="8" style="border-bottom:3px solid #EE0000;padding:0;border-top:none;"></td></tr>
  <tr><td class="meta">Total Reports</td><td>${records.length}</td><td class="meta">Passed</td><td class="ok">${passCount}</td><td class="meta">Failed / NI</td><td class="bad">${failCount}</td><td class="meta">High Priority Issues</td><td class="bad">${highCount}</td></tr>
  <tr><td colspan="8"></td></tr>
  <tr><td class="section" colspan="8">Report Overview</td></tr>
  <tr>
    <th>#</th><th>Site / Location</th><th>Date</th><th>Type</th><th>Inspector</th><th>Status</th><th>Issues</th><th>High Priority</th>
  </tr>
  ${summaryRows}
</table>

<br/><br/>

<!-- ── ACTION ITEMS TABLE (separate, 8 columns) ── -->
<table>
  <tr><td class="section" colspan="8">All Action Items — Issues &amp; Corrective Actions</td></tr>
  ${issueRows.length > 0
    ? `<tr><th>#</th><th>Site / Location</th><th>Date</th><th>Inspector</th><th>Area</th><th>Issue</th><th>Priority</th><th class="corrective-th">Corrective Action</th></tr>\n${issueRows}`
    : `<tr><td colspan="8" class="ok">No action items recorded across selected reports</td></tr>`}
</table>
</body></html>`;

    const blob = new Blob([html], { type: "application/vnd.ms-excel" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `inspection-summary-${dateStr}.xls`;
    a.click();
    URL.revokeObjectURL(url);
  }

  function exportBulkWord(records) {
    if (!records || records.length === 0) return;
    const dateStr = new Date().toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });
    const passCount = records.filter(r => r.overallStatus === "Pass").length;
    const failCount = records.length - passCount;
    const allIssues = records.flatMap(r => r.actionItems || []);
    const highCount = allIssues.filter(i => i.priority === "High").length;

    const esc = s => (s || "").toString().replace(/</g, "&lt;").replace(/>/g, "&gt;");

    const reportBlocks = records.map((rec, idx) => {
      const issues = rec.actionItems || [];
      const statusClass = rec.overallStatus === "Pass" ? "status-pass" : "status-fail";
      const issueRows = issues.length > 0
        ? issues.map((a, i) => `<tr><td style="text-align:center;width:36px">${i + 1}</td><td>${esc(a.area || "—")}</td><td>${esc(a.issue || "—")}</td><td class="${a.priority === "High" ? "pill-high" : "pill-med"}">${esc(a.priority || "—")}</td><td>${esc(a.corrective || "—")}</td></tr>`).join("\n")
        : `<tr><td colspan="5" class="status-pass">No issues recorded — all areas passed ✓</td></tr>`;
      return `
<div style="page-break-inside:avoid;margin-bottom:28px;">
  <h2>${idx + 1}. ${esc(rec.siteName || rec.location || "Inspection")}</h2>
  <table class="info-table">
    <tr><td class="info-label">Date</td><td>${esc(rec.inspectionDate || "—")}</td><td class="info-label">Type</td><td>${esc(rec.inspectionType || "—")}</td></tr>
    <tr><td class="info-label">Inspector</td><td>${esc(rec.inspectorName || "—")}</td><td class="info-label">Supervisor</td><td>${esc(rec.supervisorName || "—")}</td></tr>
    ${rec.floor ? `<tr><td class="info-label">Floor</td><td>${esc(rec.floor)}</td><td class="info-label">Event</td><td>${esc(rec.eventName || "—")}</td></tr>` : ""}
    <tr><td class="info-label">Overall Status</td><td colspan="3" class="${statusClass}">${esc(rec.overallStatus || "—")}</td></tr>
  </table>
  ${rec.output ? `<p style="font-size:10pt;color:#374151;line-height:1.6;margin:10px 0;">${esc(rec.output)}</p>` : ""}
  ${issues.length > 0 ? `<p style="font-weight:bold;color:#2A295C;margin:12px 0 4px;">Action Items (${issues.length})</p>` : ""}
  <table class="issues">
    <tr><th>#</th><th>Area</th><th>Issue</th><th>Priority</th><th>Corrective Action</th></tr>
    ${issueRows}
  </table>
</div>`;
    }).join("\n");

    const html = `<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:w="urn:schemas-microsoft-com:office:word" xmlns="http://www.w3.org/TR/REC-html40">
<head><meta charset="utf-8">
<!--[if gte mso 9]><xml><w:WordDocument><w:View>Print</w:View><w:Zoom>100</w:Zoom></w:WordDocument></xml><![endif]-->
<style>
  @page { size: letter; margin: 1in; }
  body { font-family: Calibri, Arial, sans-serif; font-size: 11pt; color: #1F2937; line-height: 1.5; }
  h1 { color: #2A295C; font-size: 20pt; margin-bottom: 4px; }
  h2 { color: #2A295C; font-size: 13pt; border-bottom: 2px solid #2A295C; padding-bottom: 4px; margin-top: 24px; margin-bottom: 8px; }
  .red-line { border-bottom: 3px solid #EE0000; margin-bottom: 16px; }
  .stats-table { width: 100%; border-collapse: collapse; margin: 12px 0 20px; }
  .stats-table td { padding: 10px 16px; border: 1px solid #E5E7EB; text-align: center; font-size: 11pt; }
  .stats-label { font-size: 8pt; color: #6B7280; display: block; }
  .stat-pass { background: #ECFDF5; color: #15803D; font-weight: bold; font-size: 18pt; }
  .stat-fail { background: #FEF2F2; color: #DC2626; font-weight: bold; font-size: 18pt; }
  .stat-warn { background: #FFFBEB; color: #D97706; font-weight: bold; font-size: 18pt; }
  .stat-neutral { background: #F9FAFB; color: #1d4ed8; font-weight: bold; font-size: 18pt; }
  .info-table { width: 100%; border-collapse: collapse; margin: 8px 0; }
  .info-table td { padding: 6px 10px; border: 1px solid #E5E7EB; font-size: 10pt; }
  .info-label { background: #F7F8FA; font-weight: bold; color: #2A295C; width: 22%; }
  table.issues { width: 100%; border-collapse: collapse; margin: 8px 0; }
  table.issues th { background: #2A295C; color: white; padding: 7px 10px; text-align: left; font-size: 9pt; }
  table.issues td { padding: 6px 10px; border: 1px solid #E5E7EB; font-size: 9pt; vertical-align: top; }
  .pill-high { background: #FEF2F2; color: #DC2626; font-weight: bold; padding: 2px 6px; }
  .pill-med { background: #FFFBEB; color: #D97706; font-weight: bold; padding: 2px 6px; }
  .status-pass { background: #ECFDF5; color: #15803D; font-weight: bold; text-align: center; padding: 8px; }
  .status-fail { background: #FEF2F2; color: #DC2626; font-weight: bold; text-align: center; padding: 8px; }
  .footer { margin-top: 32px; padding-top: 12px; border-top: 1px solid #E5E7EB; font-size: 8pt; color: #9CA3AF; text-align: center; }
</style></head><body>
<h1>Bulk Inspection Summary</h1>
<div class="red-line"></div>
<p style="color:#6B7280;font-size:10pt;margin-bottom:12px;">Generated: ${dateStr} &nbsp;&bull;&nbsp; ${records.length} report${records.length !== 1 ? "s" : ""} selected</p>

<table class="stats-table">
  <tr>
    <td><span class="stat-neutral">${records.length}</span><span class="stats-label">Total Reports</span></td>
    <td><span class="stat-pass">${passCount}</span><span class="stats-label">Passed</span></td>
    <td><span class="stat-fail">${failCount}</span><span class="stats-label">Failed / Needs Improvement</span></td>
    <td><span class="stat-warn">${highCount}</span><span class="stats-label">High Priority Issues</span></td>
  </tr>
</table>

${reportBlocks}

<div class="footer">
  <p>Generated ${dateStr} &bull; Sodexo Inspection System</p>
</div>
</body></html>`;

    const blob = new Blob([html], { type: "application/msword" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `inspection-summary-${new Date().toISOString().slice(0, 10)}.doc`;
    a.click();
    URL.revokeObjectURL(url);
  }

  async function callVisionOCR(base64Data, mimeType) {
    let apiKey = localStorage.getItem("sdx_openai_key") || "";
    if (!apiKey) {
      apiKey = window.prompt(
        "To read paper reports, enter your OpenAI API key.\nIt is stored only in this browser (never sent to our servers).\n\nGet one at platform.openai.com"
      ) || "";
      if (!apiKey) return null;
      localStorage.setItem("sdx_openai_key", apiKey.trim());
    }
    const prompt = `You are reading a paper food-safety inspection report. Extract every field you can find and return ONLY a JSON object with these keys (use null for fields not found):
{
  "siteName": string,
  "siteNumber": string,
  "sitePhone": string,
  "floor": string,
  "inspectionDate": string (YYYY-MM-DD),
  "inspectionType": string (e.g. "Weekly", "Monthly", "Opening", "Closing", "HACCP"),
  "supervisorName": string,
  "inspectorName": string,
  "participantName": string,
  "eventName": string,
  "overallStatus": string ("Pass" | "Fail" | "Needs Improvement"),
  "rawNotes": string (any freeform notes or observations from the report),
  "actionItems": array of objects [{ "area": string, "issue": string, "priority": "High"|"Medium"|"Low", "corrective": string }],
  "output": string (a clean 2-4 paragraph narrative summarizing the inspection findings)
}
Be thorough. If you see checkboxes, scores, temperatures, or item lists, capture them as action items or in rawNotes.`;

    const body = {
      model: "gpt-4o",
      max_tokens: 2000,
      messages: [
        {
          role: "user",
          content: [
            { type: "text", text: prompt },
            { type: "image_url", image_url: { url: `data:${mimeType};base64,${base64Data}`, detail: "high" } }
          ]
        }
      ]
    };
    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": `Bearer ${apiKey.trim()}` },
      body: JSON.stringify(body)
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      if (res.status === 401) { localStorage.removeItem("sdx_openai_key"); }
      throw new Error(err?.error?.message || `API error ${res.status}`);
    }
    const data = await res.json();
    const content = data.choices?.[0]?.message?.content || "";
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error("Could not parse AI response as JSON.");
    return JSON.parse(jsonMatch[0]);
  }

  function importBackup(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = ""; // reset so same file can be re-selected

    const isPaperReport = file.type.startsWith("image/") || file.type === "application/pdf";

    if (isPaperReport) {
      // Read as base64 for vision OCR
      const reader = new FileReader();
      reader.onload = async (ev) => {
        const dataUrl = ev.target.result; // e.g. "data:image/jpeg;base64,/9j/..."
        const base64 = dataUrl.split(",")[1];
        const mimeType = file.type === "application/pdf" ? "image/jpeg" : file.type; // GPT-4o doesn't read raw PDF bytes; user must provide image/photo of the page
        setImportOcrLoading(true);
        setImportOcrError("");
        try {
          const extracted = await callVisionOCR(base64, mimeType);
          if (!extracted) { setImportOcrLoading(false); return; }
          setImportReview({ fields: extracted, imagePreview: dataUrl });
        } catch (err) {
          setImportOcrError(err.message || "Could not read the report image.");
        }
        setImportOcrLoading(false);
      };
      reader.readAsDataURL(file);
      return;
    }

    // Original JSON backup path
    const reader = new FileReader();
    reader.onload = async (ev) => {
      try {
        const records = JSON.parse(ev.target.result);
        if (!Array.isArray(records)) { alert("Invalid backup file."); return; }
        const existingIds = new Set(history.map(r => r.id));
        const toAdd = records.filter(r => r.id && !existingIds.has(r.id));
        if (toAdd.length === 0) { alert("No new records found in backup."); return; }
        const merged = [...toAdd, ...history].sort((a, b) => (b.savedAt || "").localeCompare(a.savedAt || ""));
        setHistory(merged);
        await saveHistory(merged);
        alert(`✓ Restored ${toAdd.length} inspection${toAdd.length !== 1 ? "s" : ""} from backup.`);
      } catch { alert("Could not read backup file. Make sure it's a valid JSON backup."); }
    };
    reader.readAsText(file);
  }

  async function saveImportedReport(fields) {
    setImportSaving(true);
    const record = {
      id: `imported_${Date.now()}_${Math.random().toString(16).slice(2)}`,
      savedAt: new Date().toISOString(),
      inspectionDate: fields.inspectionDate || new Date().toISOString().slice(0, 10),
      inspectionType: fields.inspectionType || "Imported",
      siteName: fields.siteName || "",
      siteNumber: fields.siteNumber || "",
      sitePhone: fields.sitePhone || "",
      floor: fields.floor || "",
      supervisorName: fields.supervisorName || "",
      inspectorName: fields.inspectorName || "",
      participantName: fields.participantName || "",
      eventName: fields.eventName || "",
      overallStatus: fields.overallStatus || "Pass",
      rawNotes: fields.rawNotes || "",
      output: fields.output || "",
      actionItems: Array.isArray(fields.actionItems) ? fields.actionItems : [],
      importedFromPaper: true,
    };
    const merged = [record, ...history].sort((a, b) => (b.savedAt || "").localeCompare(a.savedAt || ""));
    setHistory(merged);
    await saveHistory(merged);
    setImportReview(null);
    setImportSaving(false);
  }

  const importRef = useRef(null);

  const uniqueDates = [...new Set(history.map(r => r.inspectionDate).filter(Boolean))].sort().reverse();
  const uniqueTypes = [...new Set(history.map(r => r.inspectionType).filter(Boolean))].sort();
  const uniqueFloors = [...new Set(history.map(r => r.floor).filter(Boolean))].sort();
  const uniqueLocTypes = [...new Set(history.map(r => r.locationType).filter(Boolean))].sort();

  return (
    <div className="appShell">
      <header className="topBar">
        <div className="brandLeft brandClickable" onClick={onBack} title="Back to Inspector">
          <img src={LOGO_WHITE} alt="Sodexo" className="brandLogo" />
        </div>
        <div className="topActions">
          {/* Desktop: show all buttons inline */}
          <button className="btn btnGhost historyDesktopBtn" onClick={onBack} type="button">Back to Inspector</button>
          <input ref={importRef} type="file" accept=".json,image/*" style={{ display: "none" }} onChange={importBackup} />
          <button className="btn btnGhost historyDesktopBtn" onClick={() => importRef.current?.click()} type="button" title="Import JSON backup or a photo/scan of a paper report">
            {importOcrLoading ? "⏳ Reading…" : "↑ Import"}
          </button>
          {history.length > 0 && (
            <>
              <button
                className="btn btnGhost historyDesktopBtn"
                onClick={() => { setSelectMode(m => !m); setSelectedIds(new Set()); }}
                type="button"
                style={selectMode ? { background: "#1d4ed8", color: "#fff", borderColor: "#1d4ed8" } : {}}
              >{selectMode ? "✕ Cancel" : "☑ Select"}</button>
              <button className="btn btnGhost historyDesktopBtn" onClick={exportBackup} type="button">↓ Backup</button>
              <button className="btn btnGhost historyDesktopBtn" onClick={clearAll} type="button" style={{color: "#EE0000", borderColor: "#EE0000"}}>Clear All</button>
            </>
          )}
          {/* Mobile: single ⋯ menu button */}
          <div className="historyMobileMenu" style={{ position: "relative" }}>
            <button className="btn btnGhost" onClick={() => setShowHistoryMenu(m => !m)} type="button" style={{ fontSize: "1.2rem", padding: "6px 12px", letterSpacing: "0.05em" }}>⋯</button>
            {showHistoryMenu && (
              <div className="dropdownMenu" style={{ right: 0, left: "auto", minWidth: 230, padding: "14px 10px 18px", gap: 4 }} onClick={() => setShowHistoryMenu(false)}>
                <button className="dropdownMenuItem" onClick={onBack} type="button" style={{ padding: "15px 20px", fontSize: "0.97rem" }}>← Back to Inspector</button>
                <button className="dropdownMenuItem" onClick={() => importRef.current?.click()} type="button" style={{ padding: "15px 20px", fontSize: "0.97rem" }}>
                  {importOcrLoading ? "⏳ Reading…" : "↑ Import Report"}
                </button>
                {history.length > 0 && (
                  <>
                    <div style={{ height: 1, background: "rgba(255,255,255,0.12)", margin: "8px 10px" }} />
                    <button className="dropdownMenuItem" onClick={() => { setSelectMode(m => !m); setSelectedIds(new Set()); setShowHistoryMenu(false); }} type="button" style={{ padding: "15px 20px", fontSize: "0.97rem" }}>
                      {selectMode ? "✕ Cancel Selection" : "☑ Select Reports"}
                    </button>
                    <button className="dropdownMenuItem" onClick={exportBackup} type="button" style={{ padding: "15px 20px", fontSize: "0.97rem" }}>↓ Download Backup</button>
                    <button className="dropdownMenuItem dropdownMenuDanger" onClick={clearAll} type="button" style={{ padding: "15px 20px", fontSize: "0.97rem" }}>✕ Clear All Reports</button>
                  </>
                )}
              </div>
            )}
          </div>
        </div>
      </header>
      <div className="topBarSpacer" />

      {/* OCR error banner */}
      {importOcrError && (
        <div style={{ background: "#fef2f2", border: "1px solid #fca5a5", padding: "0.65rem 1.25rem", color: "#b91c1c", fontWeight: 600, fontSize: "0.88rem", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
          <span>⚠️ Could not read paper report: {importOcrError}</span>
          <button type="button" onClick={() => setImportOcrError("")} style={{ background: "none", border: "none", color: "#b91c1c", cursor: "pointer", fontWeight: 700, fontSize: "1rem" }}>✕</button>
        </div>
      )}

      {/* Paper report review modal */}
      {importReview && (
        <ImportReviewModal
          fields={importReview.fields}
          imagePreview={importReview.imagePreview}
          saving={importSaving}
          onSave={saveImportedReport}
          onCancel={() => setImportReview(null)}
        />
      )}

      {/* Photo lightbox */}
      {lightboxPhoto && (
        <div
          style={{ position: "fixed", inset: 0, zIndex: 9999, background: "rgba(0,0,0,0.88)", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: 20 }}
          onClick={() => setLightboxPhoto(null)}
        >
          <div
            style={{ position: "relative", maxWidth: "min(92vw, 900px)", width: "100%", background: "#0f172a", borderRadius: 14, overflow: "hidden", boxShadow: "0 24px 80px rgba(0,0,0,0.7)" }}
            onClick={e => e.stopPropagation()}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "12px 16px", background: "#1e293b", borderBottom: "1px solid #334155" }}>
              <span style={{ color: "#94a3b8", fontSize: "0.8rem", fontWeight: 700 }}>📷 Photo #{lightboxPhoto.num}</span>
              <span style={{ color: "#64748b", fontSize: "0.8rem", flex: 1 }}>{lightboxPhoto.label}</span>
              {lightboxPhoto.caption && <span style={{ color: "#94a3b8", fontSize: "0.75rem", fontStyle: "italic" }}>{lightboxPhoto.caption}</span>}
              <a
                href={lightboxPhoto.url}
                download={`photo-${lightboxPhoto.num}.jpg`}
                target="_blank"
                rel="noreferrer"
                style={{ background: "#2563eb", color: "#fff", border: "none", borderRadius: 7, padding: "6px 14px", fontSize: "0.8rem", fontWeight: 700, cursor: "pointer", textDecoration: "none", flexShrink: 0 }}
                onClick={e => e.stopPropagation()}
              >⬇️ Download</a>
              <button
                type="button"
                onClick={() => setLightboxPhoto(null)}
                style={{ background: "none", border: "none", color: "#94a3b8", fontSize: "1.4rem", cursor: "pointer", lineHeight: 1, padding: "0 4px", flexShrink: 0 }}
              >✕</button>
            </div>
            <img
              src={lightboxPhoto.url}
              alt={lightboxPhoto.label}
              style={{ width: "100%", maxHeight: "75vh", objectFit: "contain", display: "block", background: "#0f172a" }}
            />
          </div>
        </div>
      )}

      {managedVenueId && (
        <div style={{ background: "#fef3c7", border: "1px solid #f59e0b", padding: "0.65rem 1.25rem", color: "#92400e", fontWeight: 600, fontSize: "0.88rem", display: "flex", alignItems: "center", gap: 8 }}>
          ⚠️ Viewing reports for: <strong>{managedVenueName || managedVenueId}</strong>
        </div>
      )}

      <main className="pageMain pageMainWide">
        {/* Filters */}
        <div className="card" style={{ marginBottom: 24 }}>
          <div className="cardHeader">
            <div className="cardTitle">Filters</div>
            {(filterDate || filterDateFrom || filterDateTo || filterType || filterFloor || filterLocType || filterSite || filterIssue) && (
              <button className="btn btnGhost btnSmall" type="button" onClick={() => { setFilterDate(""); setFilterDateFrom(""); setFilterDateTo(""); setFilterType(""); setFilterFloor(""); setFilterLocType(""); setFilterSite(""); setFilterIssue(""); }}>
                Clear filters
              </button>
            )}
          </div>
          <div className="cardBody">
            <div className="fieldGrid filterGrid">
              <label className="field">
                <span className="fieldLabel">Date (exact)</span>
                <select className="select" value={filterDate} onChange={e => setFilterDate(e.target.value)}>
                  <option value="">All dates</option>
                  {uniqueDates.map(d => <option key={d} value={d}>{d}</option>)}
                </select>
              </label>
              <label className="field">
                <span className="fieldLabel">Date from</span>
                <input className="input" type="date" value={filterDateFrom} onChange={e => setFilterDateFrom(e.target.value)} />
              </label>
              <label className="field">
                <span className="fieldLabel">Date to</span>
                <input className="input" type="date" value={filterDateTo} onChange={e => setFilterDateTo(e.target.value)} />
              </label>
              <label className="field">
                <span className="fieldLabel">Inspection Type</span>
                <select className="select" value={filterType} onChange={e => setFilterType(e.target.value)}>
                  <option value="">All types</option>
                  {uniqueTypes.map(t => <option key={t} value={t}>{t}</option>)}
                </select>
              </label>
              <label className="field">
                <span className="fieldLabel">Floor</span>
                <select className="select" value={filterFloor} onChange={e => setFilterFloor(e.target.value)}>
                  <option value="">All floors</option>
                  {uniqueFloors.map(f => <option key={f} value={f}>{f}</option>)}
                </select>
              </label>
              <label className="field">
                <span className="fieldLabel">Location Type</span>
                <select className="select" value={filterLocType} onChange={e => setFilterLocType(e.target.value)}>
                  <option value="">All types</option>
                  {LOCATION_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                </select>
              </label>
              <label className="field">
                <span className="fieldLabel">Location</span>
                <input className="input" value={filterSite} onChange={e => setFilterSite(e.target.value)} placeholder="e.g., North Kitchen #204" />
              </label>
              <label className="field">
                <span className="fieldLabel">Search Issues</span>
                <input className="input" value={filterIssue} onChange={e => setFilterIssue(e.target.value)} placeholder="e.g., ceiling, temp, allergen..." />
              </label>
            </div>
          </div>
        </div>

        {/* Tabs */}
        {history.length >= 2 && (
          <div className="historyTabs">
            <button className={cx("historyTab", historyTab === "reports" && "historyTabActive")} onClick={() => setHistoryTab("reports")} type="button">
              Reports ({filtered.length})
            </button>
            <button className={cx("historyTab", historyTab === "analytics" && "historyTabActive")} onClick={() => { setHistoryTab("analytics"); AIEngine.trackPage("analytics"); AIEngine.trackAction("openAnalyticsTab"); }} type="button">
              Analytics
            </button>
          </div>
        )}

        {/* Analytics Tab */}
        {historyTab === "analytics" && history.length >= 2 && (
          <>
            {/* Analytics sub-tab nav */}
            <div className="analyticsSubNav">
              <button className={cx("analyticsSubTab", analyticsTab === "temp" && "analyticsSubTabActive")} onClick={() => setAnalyticsTab("temp")} type="button">
                🌡️ Temps
              </button>
              <button className={cx("analyticsSubTab", analyticsTab === "insights" && "analyticsSubTabActive")} onClick={() => setAnalyticsTab("insights")} type="button">
                🧠 Insights
              </button>
              <button className={cx("analyticsSubTab", analyticsTab === "predictive" && "analyticsSubTabActive")} onClick={() => setAnalyticsTab("predictive")} type="button">
                🤖 Predictive
              </button>
              <button className={cx("analyticsSubTab", analyticsTab === "recurring" && "analyticsSubTabActive")} onClick={() => setAnalyticsTab("recurring")} type="button">
                🔁 Recurring
              </button>
            </div>
            {analyticsTab === "temp" && <TempTrendChart history={filtered.length > 0 ? filtered : history} />}
            {analyticsTab === "insights" && <AIHealthMonitor history={filtered.length > 0 ? filtered : history} currentUser={currentUser} />}
            {analyticsTab === "predictive" && <PredictiveInsightsPanel history={filtered.length > 0 ? filtered : history} />}
            {analyticsTab === "recurring" && <RecurringIssuesPanel history={filtered.length > 0 ? filtered : history} onLocationClick={filterByLocation} />}
          </>
        )}

        {/* Reports Tab */}
        {historyTab === "reports" && (
          filtered.length === 0 ? (
          <div className="card">
            <div className="cardBody">
              <div className="emptyState">
                <div className="emptyTitle">{history.length === 0 ? "No inspections saved yet" : "No matches"}</div>
                <div className="emptySub">{history.length === 0 ? "Complete an inspection and click Save to build your history." : "Try adjusting your filters."}</div>
              </div>
            </div>
          </div>
        ) : (
          <div className="historyList" id="history-results">
            {filtered.map(rec => {
              const isExpanded = expandedId === rec.id;
              const issues = rec.actionItems || [];
              const statusColor = rec.overallStatus === "Pass" ? "#15803D" : "#EE0000";
              return (
                <div
                  className="card historyCard"
                  key={rec.id}
                  style={{ marginBottom: 16, outline: selectMode && selectedIds.has(rec.id) ? "2px solid #1d4ed8" : "none", outlineOffset: 2 }}
                >
                  <div
                    className="cardHeader"
                    style={{ cursor: "pointer" }}
                    onClick={() => {
                      if (selectMode) {
                        setSelectedIds(prev => {
                          const next = new Set(prev);
                          next.has(rec.id) ? next.delete(rec.id) : next.add(rec.id);
                          return next;
                        });
                      } else {
                        setExpandedId(isExpanded ? null : rec.id);
                      }
                    }}
                  >
                    <div style={{ display: "flex", alignItems: "center", gap: 16, flex: 1 }}>
                      {selectMode && (
                        <input
                          type="checkbox"
                          checked={selectedIds.has(rec.id)}
                          onChange={() => {}}
                          onClick={e => e.stopPropagation()}
                          style={{ width: 18, height: 18, accentColor: "#1d4ed8", cursor: "pointer", flexShrink: 0 }}
                        />
                      )}
                      <span className="historyStatus" style={{ background: statusColor }}>{rec.overallStatus}</span>
                      <div>
                        <div className="cardTitle" style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                          {rec.siteName || rec.location || "Inspection"}
                          {rec.siteNumber && <span style={{ fontWeight: 600 }}>#{rec.siteNumber}</span>}
                          {rec.restaurantLicense && <span style={{ fontWeight: 600 }}>🪪 {rec.restaurantLicense}</span>}
                        </div>
                        <div className="cardSub">
                          {rec.inspectionDate} &middot;{" "}
                          <span className={cx("typeBadge",
                            rec.inspectionType === "Event Day" ? "typeBadgeEvent" :
                            rec.inspectionType === "Post Event" ? "typeBadgePost" : "typeBadgeRegular"
                          )}>{rec.inspectionType}</span>
                          {rec.eventName && <>{" "}&middot; <span className="typeBadge typeBadgeEvent" style={{ fontStyle: "italic" }}>🎟 {rec.eventName}</span></>}
                          {rec.locationType && <>{" "}&middot; <span className={cx("typeBadge", rec.locationType === "Event / Temporary" ? "typeBadgeEventTemp" : "typeBadgeLocType")}>{rec.locationType === "Event / Temporary" ? "🎪 " : ""}{rec.locationType}</span></>}
                          {rec.floor && <>{" "}&middot; <span className="typeBadge typeBadgeFloor">{rec.floor}</span></>}
                          {" "}&middot; {rec.inspectorName || "—"}
                          {rec.participantName && <>{" "}&middot; <span className="typeBadge" style={{ background: "#f0fdf4", color: "#15803d", border: "1px solid #bbf7d0" }}>👤 {rec.participantName}</span></>}
                        </div>
                      </div>
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                      {issues.length > 0 && <span className="pill">{issues.length} issue{issues.length !== 1 ? "s" : ""}</span>}
                      {onEdit && canEditRec(rec) && (
                        <button
                          className="btn btnGhost btnSmall"
                          type="button"
                          title="Edit this report"
                          style={{ color: "#2563EB", borderColor: "rgba(37,99,235,.3)", fontWeight: 600 }}
                          onClick={e => { e.stopPropagation(); onEdit(rec); }}
                        >✏️ Edit</button>
                      )}
                      <span style={{ fontSize: "1.2rem", color: "var(--sdx-gray-400)" }}>{isExpanded ? "\u25B2" : "\u25BC"}</span>
                    </div>
                  </div>

                  {isExpanded && (
                    <div className="cardBody rptFullReport">

                      {/* ── REPORT HEADER ── */}
                      <div className="rptReportHeader">
                        <div className="rptReportHeaderLeft">
                          <div className="rptBrandLogo">
                            <span className="rptBrandText">SODEXO</span>
                            <span className="rptBrandSub">Kitchen Inspection Report</span>
                          </div>
                          <div className="rptSiteName">{rec.siteName || "—"}</div>
                          {rec.eventName && <div className="rptEventName">📅 {rec.eventName}</div>}
                        </div>
                        <div className="rptReportHeaderRight">
                          {(() => {
                            const st = calcOverallStatus(rec.inspection);
                            return (
                              <div className={cx("rptStatusBadge", st === "Pass" ? "rptStatusPass" : "rptStatusFail")}>
                                {st === "Pass" ? "✓ PASSED" : "✗ NEEDS ATTENTION"}
                              </div>
                            );
                          })()}
                          <div className="rptInspType">{rec.inspectionType || "Kitchen Inspection"}</div>
                          <div className="rptInspDate">{rec.inspectionDate || "—"}</div>
                        </div>
                      </div>
                      <div className="rptRedLine" />

                      {/* ── INFO GRID ── */}
                      <div className="rptInfoGrid">
                        <div className="rptInfoCell"><span className="rptInfoLabel">Inspector</span><span className="rptInfoVal">{rec.inspectorName || "—"}</span></div>
                        <div className="rptInfoCell"><span className="rptInfoLabel">Supervisor</span><span className="rptInfoVal">{rec.supervisorName || "—"}</span></div>
                        <div className="rptInfoCell"><span className="rptInfoLabel">Unit #</span><span className="rptInfoVal">{rec.siteNumber || "—"}</span></div>
                        {rec.participantName && <div className="rptInfoCell"><span className="rptInfoLabel">Participant</span><span className="rptInfoVal">{rec.participantName}</span></div>}
                        {rec.floor && <div className="rptInfoCell"><span className="rptInfoLabel">Floor / Area</span><span className="rptInfoVal">{rec.floor}</span></div>}
                        {rec.sitePhone && <div className="rptInfoCell"><span className="rptInfoLabel">Phone</span><span className="rptInfoVal">{rec.sitePhone}</span></div>}
                        <div className="rptInfoCell">
                          <span className="rptInfoLabel">Hand Sink Temp</span>
                          <span className="rptInfoVal">
                            {rec.temps?.handSinkTempF ? `${rec.temps.handSinkTempF}°F` : "—"}
                            {rec.temps?.handSinkTempF && (Number(rec.temps.handSinkTempF) >= 95 ? " ✅" : " ⚠️")}
                          </span>
                        </div>
                        <div className="rptInfoCell">
                          <span className="rptInfoLabel">3-Comp Wash Temp</span>
                          <span className="rptInfoVal">
                            {rec.temps?.threeCompSinkTempF ? `${rec.temps.threeCompSinkTempF}°F` : "—"}
                            {rec.temps?.threeCompSinkTempF && (Number(rec.temps.threeCompSinkTempF) >= 110 ? " ✅" : " ⚠️")}
                          </span>
                        </div>
                        {(() => {
                          const eTemps = collectEquipTemps(rec.inspection);
                          return eTemps.map(et => (
                            <div className="rptInfoCell" key={et.key}>
                              <span className="rptInfoLabel">{et.label}</span>
                              <span className="rptInfoVal">{et.tempF}°F {et.pass ? "✅" : "⚠️"}</span>
                            </div>
                          ));
                        })()}
                        {rec.temps?.iceMakerCleanedDate && <div className="rptInfoCell"><span className="rptInfoLabel">Ice Maker Cleaned</span><span className="rptInfoVal">{rec.temps.iceMakerCleanedDate}</span></div>}
                      </div>

                      {/* ── ACTION ITEMS (Maintenance first, then High, then Med, then Follow-up) ── */}
                      {issues.length > 0 && (
                        <div className="issuesBlock" style={{ marginTop: 20 }}>
                          <div className="issuesBlockTitle">
                            <span className="issuesBlockIcon">⚠️</span>
                            Action Items
                            <span className="issuesBlockCount">{issues.length}</span>
                          </div>
                          <div className="issuesList">
                            {[...issues]
                              .sort((a, b) => {
                                const rank = p => p === "Maintenance" ? 0 : p === "High" ? 1 : p === "Med" ? 2 : 3;
                                return rank(a.priority) - rank(b.priority);
                              })
                              .map((a, i) => (
                              <div key={i} className={cx("issueRow", a.priority === "Maintenance" ? "issueRowMaint" : a.priority === "High" ? "issueRowHigh" : a.priority === "Follow-up" ? "issueRowFollowup" : "issueRowMed")}>
                                <span className={cx("priorityBadge", a.priority === "Maintenance" ? "priorityMaint" : a.priority === "High" ? "priorityHigh" : a.priority === "Follow-up" ? "priorityFollowup" : "priorityMed")}>{a.priority}</span>
                                <span className="issueRowText">{a.issue}</span>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* ── INSPECTION SCORECARD ── */}
                      {(() => {
                        const allItems = [
                          ["Facility", "Ceiling", rec.inspection?.facility?.ceiling],
                          ["Facility", "Walls", rec.inspection?.facility?.walls],
                          ["Facility", "Floors", rec.inspection?.facility?.floors],
                          ["Facility", "Lighting", rec.inspection?.facility?.lighting],
                          ["Operations", "Employee Practices", rec.inspection?.operations?.employeePractices],
                          ["Operations", "Handwashing / Supplies", rec.inspection?.operations?.handwashing],
                          ["Operations", "Labeling / Dating", rec.inspection?.operations?.labelingDating],
                          ["Operations", "Logs / Documentation", rec.inspection?.operations?.logs],
                          ["Equipment", "Double-Door Cooler", rec.inspection?.equipment?.doubleDoorCooler],
                          ["Equipment", "Double-Door Freezer", rec.inspection?.equipment?.doubleDoorFreezer],
                          ["Equipment", "Walk-In Cooler", rec.inspection?.equipment?.walkInCooler],
                          ["Equipment", "Walk-In Freezer", rec.inspection?.equipment?.walkInFreezer],
                          ["Equipment", "Prep Cooler", rec.inspection?.equipment?.prepCooler],
                          ["Equipment", "Warmers / Hot Holding", rec.inspection?.equipment?.warmers],
                          ["Equipment", "Ovens", rec.inspection?.equipment?.ovens],
                          ["Equipment", "3-Compartment Sink", rec.inspection?.equipment?.threeCompSink],
                          ["Equipment", "Ecolab / Chemicals", rec.inspection?.equipment?.ecolab],
                        ];
                        const hasAny = allItems.some(([,,n]) => n?.status);
                        if (!hasAny) return null;
                        let lastSec = null;
                        return (
                          <div style={{ marginTop: 20, padding: "0 20px" }}>
                            <div className="rptSectionTitle">Inspection Scorecard</div>
                            <table className="rptScorecard">
                              <thead>
                                <tr><th>Section</th><th>Item</th><th>Status</th><th>Notes</th></tr>
                              </thead>
                              <tbody>
                                {allItems.map(([sec, label, node], idx) => {
                                  const st = node?.status || "N/A";
                                  const showSec = sec !== lastSec;
                                  lastSec = sec;
                                  return (
                                    <tr key={idx} className={st === "OK" ? "rptRowOk" : st === "N/A" ? "rptRowNa" : "rptRowFail"}>
                                      <td className="rptCellSec">{showSec ? sec : ""}</td>
                                      <td className="rptCellItem">{label}</td>
                                      <td className="rptCellStatus">
                                        <span className={cx("rptPill", st === "OK" ? "rptPillPass" : st === "N/A" ? "rptPillNa" : st === "Needs Attention" ? "rptPillWarn" : "rptPillFail")}>{st}</span>
                                      </td>
                                      <td className="rptCellNotes">{node?.notes || ""}</td>
                                    </tr>
                                  );
                                })}
                              </tbody>
                            </table>
                          </div>
                        );
                      })()}

                      {rec.rawNotes && (
                        <div style={{ marginTop: 20, padding: "0 20px" }}>
                          <div className="rptSectionTitle">Inspector Notes</div>
                          <div className="historyNotesFormatted" style={{ maxHeight: 300, overflowY: "auto" }}>
                            {(() => {
                              const { grouped } = formatNotesStructured(rec.rawNotes);
                              return CATEGORY_ORDER.map(cat => {
                                if (!grouped[cat]?.length) return null;
                                return (
                                  <div key={cat} style={{ marginBottom: 10 }}>
                                    <div className={cx("rptNoteCatLabel", `rptNoteCat--${cat}`)}>{CATEGORY_LABELS[cat]}</div>
                                    <ul className="rptNoteBullets">{grouped[cat].map((b, i) => <li key={i}>{b}</li>)}</ul>
                                  </div>
                                );
                              });
                            })()}
                          </div>
                        </div>
                      )}

                      {/* HACCP Temperature Logs linked to this report */}
                      {(() => {
                        const haccpSubs = haccpByReport[rec.id];
                        if (haccpSubs === undefined) return (
                          <div style={{ marginTop: 16, fontSize: "0.8rem", color: "#6b7280" }}>Loading HACCP logs…</div>
                        );
                        if (haccpSubs.length === 0) return (
                          <div className="haccpReportSection haccpReportEmpty">
                            <span>🌡️ No HACCP temperature logs submitted for this report yet.</span>
                          </div>
                        );
                        return (
                          <div className="haccpReportSection" style={{ marginTop: 16, padding: "0 20px" }}>
                            <div className="rptSectionTitle">🌡️ HACCP Temperature Logs ({haccpSubs.length})</div>
                            {haccpSubs.map((sub, si) => {
                              const allItemsForSub = [
                                ...HACCP_TEMP_ITEMS,
                                ...(sub.customItems || []).filter(ci => !HACCP_TEMP_ITEMS.find(d => d.key === ci.key)),
                              ];
                              const flagged = Object.entries(sub.temps || {}).filter(([k, vals]) => {
                                const item = allItemsForSub.find(i => i.key === k);
                                if (!item) return false;
                                return (vals || []).some(v => v !== "" && !tempPass(item, v));
                              });
                              return (
                                <div className="haccpReportCard" key={sub.id || si}>
                                  <div className="haccpReportCardTop">
                                    <span className="haccpReportCardName">👤 {sub.supervisorName}</span>
                                    <span className="haccpReportCardTime">{sub.submittedAt ? new Date(sub.submittedAt).toLocaleString() : "—"}</span>
                                    {flagged.length > 0
                                      ? <span className="haccpReportBadge haccpReportBadgeFail">⚠️ {flagged.length} flag{flagged.length !== 1 ? "s" : ""}</span>
                                      : <span className="haccpReportBadge haccpReportBadgePass">✓ All OK</span>
                                    }
                                  </div>
                                  <div className="haccpReportTemps">
                                    {(() => {
                                      // Merge default items + any custom items saved with this submission
                                      const customSaved = sub.customItems || [];
                                      const allItems = [
                                        ...HACCP_TEMP_ITEMS,
                                        ...customSaved.filter(ci => !HACCP_TEMP_ITEMS.find(d => d.key === ci.key)),
                                      ];
                                      return allItems.map(item => {
                                        const vals = (sub.temps || {})[item.key] || [];
                                        if (vals.length === 0 || vals.every(v => v === "")) return null;
                                        const displayLabel = (sub.itemLabels || {})[item.key] || item.label;
                                        return (
                                          <div className="haccpReportTempRow" key={item.key}>
                                            <span className="haccpReportTempLabel">{displayLabel}</span>
                                            <span className="haccpReportTempVals">
                                              {vals.filter(v => v !== "").map((v, vi) => {
                                                const ok = tempPass(item, v);
                                                const foodName = ((sub.foodNames || {})[item.key] || [])[vi] || "";
                                                return (
                                                  <span key={vi} className={`haccpReportTempVal ${ok ? "pass" : "fail"}`}>
                                                    {foodName ? <span className="haccpReportFoodName">{foodName} — </span> : null}
                                                    {v}{item.unit}
                                                  </span>
                                                );
                                              })}
                                            </span>
                                          </div>
                                        );
                                      });
                                    })()}
                                  </div>
                                  {sub.problemReport?.text && (
                                    <div className="haccpReportProblem">
                                      <span className={`haccpReportSeverity sev-${sub.problemReport.severity}`}>
                                        {sub.problemReport.severity === "urgent" ? "🔴" : sub.problemReport.severity === "issue" ? "🟡" : "🔵"}
                                      </span>
                                      {sub.problemReport.text}
                                    </div>
                                  )}
                                </div>
                              );
                            })}
                          </div>
                        );
                      })()}

                      {/* ── Chat History for this report ── */}
                      {(() => {
                        const msgs = chatByReport[rec.id];
                        if (!msgs || msgs.length === 0) return null;
                        return (
                          <div style={{ marginTop: 16, padding: "0 20px" }}>
                            <div className="rptSectionTitle">💬 Chat Log ({msgs.length} message{msgs.length !== 1 ? "s" : ""})</div>
                            <div className="historyChatLog">
                              {msgs.map(m => (
                                <div key={m.id} className={`historyChatMsg ${m.fromSupervisor ? "historyChatSup" : "historyChatIns"}`}>
                                  <div className="historyChatBubble">{m.text}</div>
                                  <div className="historyChatMeta">
                                    {m.sender || (m.fromSupervisor ? "Supervisor" : "Inspector")} · {new Date(m.sentAt).toLocaleString([], { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}
                                  </div>
                                </div>
                              ))}
                            </div>
                          </div>
                        );
                      })()}

                      {/* ── Photo Review ── */}
                      {(() => {
                        const { index: photoList } = buildPhotoIndex(rec.inspection);
                        if (photoList.length === 0) return null;
                        return (
                          <div style={{ marginTop: 16, padding: "0 20px" }}>
                            <div className="rptSectionTitle">📷 Photo Evidence ({photoList.length})</div>
                            <div style={{ display: "flex", flexWrap: "wrap", gap: 10, marginTop: 8 }}>
                              {photoList.map(p => (
                                <div
                                  key={p.num}
                                  style={{ width: 130, borderRadius: 8, overflow: "hidden", border: "1px solid #e2e8f0", background: "#f8fafc", flexShrink: 0, cursor: p.previewUrl ? "zoom-in" : "default" }}
                                  onClick={p.previewUrl ? (e => { e.stopPropagation(); setLightboxPhoto({ url: p.previewUrl, label: p.label, caption: p.caption, num: p.num }); }) : undefined}
                                >
                                  {p.previewUrl ? (
                                    <div className="photoThumbImgWrap">
                                      <img
                                        src={p.previewUrl}
                                        alt={`Photo #${p.num}`}
                                        style={{ width: "100%", height: 100, objectFit: "cover", display: "block" }}
                                      />
                                      <div className="photoThumbOverlay">🔍</div>
                                    </div>
                                  ) : (
                                    <div style={{ width: "100%", height: 100, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", color: "#94a3b8", fontSize: "0.68rem", background: "#f1f5f9", padding: "0 4px", textAlign: "center", gap: 4 }}>
                                      <span style={{ fontSize: "1.2rem" }}>🖼️</span>
                                      <span>Photo saved</span>
                                      <span style={{ color: "#cbd5e1" }}>Click Edit to re-upload</span>
                                    </div>
                                  )}
                                  <div style={{ padding: "4px 6px" }}>
                                    <div style={{ fontSize: "0.68rem", fontWeight: 700, color: "#64748b" }}>#{p.num}</div>
                                    <div style={{ fontSize: "0.68rem", color: "#475569", lineHeight: 1.3, marginTop: 1 }}>{p.label}</div>
                                    {p.caption && <div style={{ fontSize: "0.65rem", color: "#94a3b8", marginTop: 1 }}>{p.caption}</div>}
                                  </div>
                                </div>
                              ))}
                            </div>
                          </div>
                        );
                      })()}

                      <div style={{ marginTop: 20 }}>
                        {/* Download picker */}
                        {dlPickerId !== rec.id ? (
                          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                            <button className="btn" type="button"
                              style={{ background: "#2A295C", color: "#fff", borderColor: "#2A295C", fontWeight: 600, padding: "0.6rem 1rem" }}
                              onClick={() => { setDlPickerId(rec.id); setDlScope(null); }}>
                              ⬇️ Download Report
                            </button>
                            {onEdit && canEditRec(rec) && (
                              <button className="btn btnGhost" type="button"
                                style={{ color: "#2563EB", borderColor: "rgba(37,99,235,.3)", padding: "0.6rem 1rem" }}
                                onClick={() => onEdit(rec)}>✏️ Edit</button>
                            )}
                            <button className="btn btnGhost" type="button" onClick={() => deleteRecord(rec.id)}
                              style={{ color: "#EE0000", borderColor: "rgba(238,0,0,.3)", marginLeft: "auto", padding: "0.6rem 1rem" }}>Delete</button>
                          </div>
                        ) : (
                          <div style={{ background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: 10, padding: "1.25rem", marginBottom: 4 }}>
                            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1rem" }}>
                              <span style={{ fontWeight: 700, color: "#1e293b", fontSize: "0.9rem" }}>⬇️ Download Report</span>
                              <button type="button" onClick={() => { setDlPickerId(null); setDlScope(null); }}
                                style={{ background: "none", border: "none", fontSize: "1.1rem", cursor: "pointer", color: "#94a3b8", lineHeight: 1 }}>✕</button>
                            </div>

                            {/* Step 1: What to include */}
                            <div style={{ marginBottom: "1rem" }}>
                              <div style={{ fontSize: "0.75rem", fontWeight: 600, color: "#64748b", textTransform: "uppercase", letterSpacing: "0.04em", marginBottom: "0.6rem" }}>What do you want to include?</div>
                              <div style={{ display: "flex", gap: 12 }}>
                                <button type="button"
                                  onClick={() => setDlScope("full")}
                                  style={{ flex: 1, padding: "0.85rem 0.75rem", borderRadius: 8, border: dlScope === "full" ? "2px solid #2A295C" : "1.5px solid #cbd5e1", background: dlScope === "full" ? "#2A295C" : "#fff", color: dlScope === "full" ? "#fff" : "#1e293b", fontWeight: 600, fontSize: "0.82rem", cursor: "pointer", transition: "all 0.15s" }}>
                                  📋 Full Report<br />
                                  <span style={{ fontSize: "0.7rem", fontWeight: 400, opacity: 0.8 }}>All details, temps, notes</span>
                                </button>
                                <button type="button"
                                  onClick={() => setDlScope("issues")}
                                  style={{ flex: 1, padding: "0.85rem 0.75rem", borderRadius: 8, border: dlScope === "issues" ? "2px solid #DC2626" : "1.5px solid #cbd5e1", background: dlScope === "issues" ? "#DC2626" : "#fff", color: dlScope === "issues" ? "#fff" : "#1e293b", fontWeight: 600, fontSize: "0.82rem", cursor: "pointer", transition: "all 0.15s" }}>
                                  ⚠️ Issues Only<br />
                                  <span style={{ fontSize: "0.7rem", fontWeight: 400, opacity: 0.8 }}>Just the action items</span>
                                </button>
                              </div>
                            </div>

                            {/* Step 2: Format (shown once scope chosen) */}
                            {dlScope && (
                              <div>
                                <div style={{ fontSize: "0.75rem", fontWeight: 600, color: "#64748b", textTransform: "uppercase", letterSpacing: "0.04em", marginBottom: "0.6rem" }}>Choose format:</div>
                                <div style={{ display: "flex", gap: 12 }}>
                                  <button type="button" className="btn"
                                    style={{ flex: 1, background: "#217346", color: "#fff", borderColor: "#217346", fontWeight: 600, padding: "0.7rem 0.5rem", fontSize: "0.88rem" }}
                                    onClick={() => {
                                      if (dlScope === "full") {
                                        exportAsCsv({ inspection: rec.inspection, rawNotes: rec.rawNotes, inspectionType: rec.inspectionType, inspectionDate: rec.inspectionDate, inspectorName: rec.inspectorName, participantName: rec.participantName, siteName: rec.siteName, siteNumber: rec.siteNumber, supervisorName: rec.supervisorName, floor: rec.floor, eventName: rec.eventName });
                                      } else {
                                        exportIssuesOnlyExcel({ rec });
                                      }
                                      setDlPickerId(null); setDlScope(null);
                                    }}>
                                    📊 Excel (.xls)
                                  </button>
                                  <button type="button" className="btn"
                                    style={{ flex: 1, background: "#2B5797", color: "#fff", borderColor: "#2B5797", fontWeight: 600, padding: "0.7rem 0.5rem", fontSize: "0.88rem" }}
                                    onClick={() => {
                                      if (dlScope === "full") {
                                        exportAsHtml({ output: rec.output || rec.rawNotes || "", inspection: rec.inspection, rawNotes: rec.rawNotes, inspectionType: rec.inspectionType, inspectionDate: rec.inspectionDate, siteName: rec.siteName, siteNumber: rec.siteNumber, sitePhone: rec.sitePhone, inspectorName: rec.inspectorName, participantName: rec.participantName, supervisorName: rec.supervisorName, eventName: rec.eventName });
                                      } else {
                                        exportIssuesOnlyWord({ rec });
                                      }
                                      setDlPickerId(null); setDlScope(null);
                                    }}>
                                    📝 Word (.doc)
                                  </button>
                                </div>
                              </div>
                            )}
                          </div>
                        )}
                        {dlPickerId !== rec.id && onEdit && null /* edit button already shown above */}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
            {historyHasMore && (
              <div style={{ textAlign: "center", padding: "16px 0" }}>
                <button
                  className="btn btnGhost"
                  type="button"
                  onClick={loadMoreHistory}
                  disabled={historyLoadingMore}
                >
                  {historyLoadingMore ? "Loading…" : `Load more (${history.length} loaded)`}
                </button>
              </div>
            )}
          </div>
        ))}
      </main>

      {/* Sticky bulk-select action bar */}
      {selectMode && (
        <div style={{
          position: "fixed", bottom: 0, left: 0, right: 0, zIndex: 200,
          background: "#1d4ed8", color: "#fff",
          display: "flex", alignItems: "center", justifyContent: "space-between",
          padding: "14px 20px", gap: 12, boxShadow: "0 -4px 16px rgba(0,0,0,0.18)"
        }}>
          <div style={{ fontWeight: 600, fontSize: "0.95rem" }}>
            {selectedIds.size === 0
              ? "Tap reports to select"
              : `${selectedIds.size} report${selectedIds.size !== 1 ? "s" : ""} selected`}
          </div>
          <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
            {filtered.length > 0 && (
              <button
                type="button"
                style={{ background: "rgba(255,255,255,0.15)", border: "1px solid rgba(255,255,255,0.4)", color: "#fff", borderRadius: 7, padding: "7px 14px", fontSize: "0.85rem", cursor: "pointer", fontWeight: 600 }}
                onClick={() => {
                  const allIds = new Set(filtered.map(r => r.id));
                  if (selectedIds.size === filtered.length) {
                    setSelectedIds(new Set());
                  } else {
                    setSelectedIds(allIds);
                  }
                }}
              >{selectedIds.size === filtered.length ? "Deselect All" : "Select All"}</button>
            )}
            {[
              { label: "📊 Excel", fmt: "excel" },
              { label: "📝 Word",  fmt: "word"  },
            ].map(({ label, fmt }) => (
              <button
                key={label}
                type="button"
                disabled={selectedIds.size === 0}
                style={{
                  background: selectedIds.size === 0 ? "rgba(255,255,255,0.15)" : "#fff",
                  color: selectedIds.size === 0 ? "rgba(255,255,255,0.4)" : "#1d4ed8",
                  border: "none", borderRadius: 7, padding: "8px 14px", fontSize: "0.85rem",
                  fontWeight: 700, cursor: selectedIds.size === 0 ? "not-allowed" : "pointer", whiteSpace: "nowrap"
                }}
                onClick={() => {
                  setSelectedIssueKeys(null); // reset to all
                  setModalIssueSearch(""); // reset search
                  setShowIssueFilter(fmt);
                }}
              >{label}</button>
            ))}
          </div>
        </div>
      )}

      {/* Issue Filter Modal — shown when user clicks Excel/Word in select mode */}
      {showIssueFilter && (() => {
        const selectedRecords = filtered.filter(r => selectedIds.has(r.id));
        // Helper: parse area from issue text when area field is missing
        function splitIssueModal(a) {
          if (a.area && a.area.trim()) return { area: a.area.trim(), issue: (a.issue || "").trim() };
          const raw = (a.issue || "").trim();
          const colonIdx = raw.indexOf(":");
          if (colonIdx > 0 && colonIdx < 40) {
            return { area: raw.slice(0, colonIdx).trim(), issue: raw.slice(colonIdx + 1).trim() };
          }
          return { area: "General", issue: raw };
        }
        // Build a de-duped list of all issues across selected reports
        const allIssues = [];
        const seen = new Set();
        for (const rec of selectedRecords) {
          for (const a of (rec.actionItems || [])) {
            const { area, issue } = splitIssueModal(a);
            // key: area + issue text (normalized)
            const key = `${area.trim()}|||${(a.issue || "").trim()}`;
            if (!seen.has(key)) {
              seen.add(key);
              allIssues.push({ key, area, issue, priority: a.priority || "Medium", corrective: a.corrective || "" });
            }
          }
        }
        const effectiveKeys = selectedIssueKeys || new Set(allIssues.map(i => i.key));
        const issueSearchQ = modalIssueSearch.trim().toLowerCase();
        const visibleIssues = issueSearchQ
          ? allIssues.filter(i => (i.issue + " " + i.area).toLowerCase().includes(issueSearchQ))
          : allIssues;
        const groupedByArea = visibleIssues.reduce((acc, item) => {
          (acc[item.area] = acc[item.area] || []).push(item);
          return acc;
        }, {});
        const areas = Object.keys(groupedByArea).sort();
        const allSelected = effectiveKeys.size === allIssues.length;

        function toggleKey(key) {
          setSelectedIssueKeys(prev => {
            const next = new Set(prev || allIssues.map(i => i.key));
            next.has(key) ? next.delete(key) : next.add(key);
            return next;
          });
        }
        function toggleArea(area) {
          const areaKeys = (groupedByArea[area] || []).map(i => i.key);
          const allAreaSelected = areaKeys.every(k => effectiveKeys.has(k));
          setSelectedIssueKeys(prev => {
            const next = new Set(prev || allIssues.map(i => i.key));
            if (allAreaSelected) areaKeys.forEach(k => next.delete(k));
            else areaKeys.forEach(k => next.add(k));
            return next;
          });
        }
        function doExport() {
          const issueKeys = selectedIssueKeys || new Set(allIssues.map(i => i.key));
          // Filter each record's actionItems to only selected keys
          const filteredRecords = selectedRecords.map(rec => ({
            ...rec,
            actionItems: (rec.actionItems || []).filter(a => {
              const key = `${(a.area || "").trim()}|||${(a.issue || "").trim()}`;
              return issueKeys.has(key);
            }),
          }));
          if (showIssueFilter === "excel") exportBulkExcel(filteredRecords);
          else exportBulkWord(filteredRecords);
          setShowIssueFilter(null);
        }

        return (
          <div style={{ position: "fixed", inset: 0, zIndex: 500, background: "rgba(0,0,0,0.5)", display: "flex", alignItems: "flex-end", justifyContent: "center" }}
            onClick={e => { if (e.target === e.currentTarget) { setShowIssueFilter(null); setModalIssueSearch(""); } }}>
            <div style={{ background: "#fff", borderRadius: "20px 20px 0 0", width: "100%", maxWidth: 640, maxHeight: "88vh", display: "flex", flexDirection: "column", boxShadow: "0 -4px 32px rgba(0,0,0,0.18)" }}>

              {/* Header */}
              <div style={{ padding: "20px 20px 16px", flexShrink: 0 }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
                  <div>
                    <div style={{ fontWeight: 700, fontSize: "1.1rem", color: "#111827" }}>
                      {showIssueFilter === "excel" ? "📊" : "📝"} Export to {showIssueFilter === "excel" ? "Excel" : "Word"}
                    </div>
                    <div style={{ fontSize: "0.8rem", color: "#6b7280", marginTop: 3 }}>
                      Choose which issues to include &mdash; {selectedRecords.length} report{selectedRecords.length !== 1 ? "s" : ""} selected
                    </div>
                  </div>
                  <button type="button" onClick={() => { setShowIssueFilter(null); setModalIssueSearch(""); }}
                    style={{ background: "#f3f4f6", border: "none", borderRadius: "50%", width: 32, height: 32, cursor: "pointer", fontWeight: 700, color: "#6b7280", fontSize: "1rem", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>✕</button>
                </div>

                {/* Search + quick actions row */}
                <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                  <div style={{ flex: 1, position: "relative" }}>
                    <span style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)", color: "#9ca3af", fontSize: "0.95rem", pointerEvents: "none" }}>🔍</span>
                    <input
                      type="text"
                      placeholder="Search issues..."
                      value={modalIssueSearch}
                      onChange={e => setModalIssueSearch(e.target.value)}
                      style={{ width: "100%", boxSizing: "border-box", padding: "8px 12px 8px 32px", borderRadius: 10, border: "1px solid #e5e7eb", fontSize: "0.875rem", outline: "none", background: "#f9fafb" }}
                    />
                  </div>
                  <button type="button"
                    style={{ fontSize: "0.8rem", padding: "8px 12px", borderRadius: 10, border: "1px solid #e5e7eb", background: "#f9fafb", cursor: "pointer", fontWeight: 600, color: "#374151", whiteSpace: "nowrap", flexShrink: 0 }}
                    onClick={() => setSelectedIssueKeys(new Set(allIssues.map(i => i.key)))}>All</button>
                  <button type="button"
                    style={{ fontSize: "0.8rem", padding: "8px 12px", borderRadius: 10, border: "1px solid #e5e7eb", background: "#f9fafb", cursor: "pointer", fontWeight: 600, color: "#374151", whiteSpace: "nowrap", flexShrink: 0 }}
                    onClick={() => setSelectedIssueKeys(new Set())}>None</button>
                </div>

                {/* "Select matching" pill — only shows when searching */}
                {modalIssueSearch.trim() && (() => {
                  const q = modalIssueSearch.trim().toLowerCase();
                  const matchingKeys = new Set(allIssues.filter(i => (i.issue + " " + i.area).toLowerCase().includes(q)).map(i => i.key));
                  return (
                    <button type="button"
                      style={{ marginTop: 8, fontSize: "0.8rem", padding: "5px 12px", borderRadius: 20, border: "1px solid #2563eb", background: "#eff6ff", cursor: "pointer", fontWeight: 600, color: "#2563eb" }}
                      onClick={() => setSelectedIssueKeys(matchingKeys)}>
                      Select only matching results ({matchingKeys.size})
                    </button>
                  );
                })()}
              </div>

              {/* Divider */}
              <div style={{ height: 1, background: "#f3f4f6", flexShrink: 0 }} />

              {/* Selection summary bar */}
              <div style={{ padding: "8px 20px", background: effectiveKeys.size > 0 ? "#f0fdf4" : "#fafafa", borderBottom: "1px solid #f3f4f6", flexShrink: 0, display: "flex", alignItems: "center", gap: 6 }}>
                <span style={{ fontSize: "0.82rem", fontWeight: 600, color: effectiveKeys.size > 0 ? "#16a34a" : "#9ca3af" }}>
                  {effectiveKeys.size > 0 ? `✓ ${effectiveKeys.size} of ${allIssues.length} issues selected` : `No issues selected yet`}
                </span>
              </div>

              {/* Issue list */}
              <div style={{ overflowY: "auto", flex: 1 }}>
                {allIssues.length === 0 ? (
                  <div style={{ textAlign: "center", padding: "3rem 2rem", color: "#9ca3af", fontSize: "0.9rem" }}>
                    No action items found in the selected reports.
                  </div>
                ) : visibleIssues.length === 0 ? (
                  <div style={{ textAlign: "center", padding: "3rem 2rem", color: "#9ca3af", fontSize: "0.9rem" }}>
                    No issues match &ldquo;{modalIssueSearch}&rdquo;
                  </div>
                ) : areas.map(area => {
                  const items = groupedByArea[area];
                  if (!items) return null;
                  const allAreaSelected = items.every(i => effectiveKeys.has(i.key));
                  const someAreaSelected = items.some(i => effectiveKeys.has(i.key));
                  return (
                    <div key={area}>
                      {/* Area header */}
                      <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 20px 8px", cursor: "pointer", background: "#f9fafb", borderBottom: "1px solid #f3f4f6" }}
                        onClick={() => toggleArea(area)}>
                        <input type="checkbox" readOnly checked={allAreaSelected}
                          ref={el => { if (el) el.indeterminate = !allAreaSelected && someAreaSelected; }}
                          style={{ width: 16, height: 16, accentColor: "#2563eb", flexShrink: 0, cursor: "pointer" }} />
                        <span style={{ fontWeight: 600, fontSize: "0.82rem", color: "#374151", letterSpacing: "0.02em" }}>{area}</span>
                        <span style={{ fontSize: "0.75rem", color: "#9ca3af", marginLeft: "auto", background: "#e5e7eb", borderRadius: 10, padding: "1px 8px" }}>
                          {items.filter(i => effectiveKeys.has(i.key)).length}/{items.length}
                        </span>
                      </div>
                      {/* Issue rows */}
                      {items.map(item => (
                        <div key={item.key}
                          style={{ display: "flex", alignItems: "center", gap: 12, padding: "11px 20px 11px 36px", cursor: "pointer", borderBottom: "1px solid #f9fafb", background: effectiveKeys.has(item.key) ? "#fafeff" : "#fff", transition: "background 0.1s" }}
                          onClick={() => toggleKey(item.key)}>
                          <input type="checkbox" readOnly checked={effectiveKeys.has(item.key)}
                            style={{ width: 16, height: 16, accentColor: "#2563eb", flexShrink: 0, cursor: "pointer" }} />
                          <span style={{ flex: 1, fontSize: "0.875rem", color: "#111827", lineHeight: 1.45 }}>{item.issue || "—"}</span>
                          <span style={{
                            fontSize: "0.72rem", fontWeight: 700, padding: "2px 8px", borderRadius: 20, flexShrink: 0,
                            background: item.priority === "High" ? "#fee2e2" : "#fef3c7",
                            color: item.priority === "High" ? "#dc2626" : "#b45309",
                          }}>{item.priority}</span>
                        </div>
                      ))}
                    </div>
                  );
                })}
              </div>

              {/* Footer */}
              <div style={{ padding: "14px 20px", borderTop: "1px solid #e5e7eb", display: "flex", gap: 10, flexShrink: 0 }}>
                <button type="button" onClick={() => { setShowIssueFilter(null); setModalIssueSearch(""); }}
                  style={{ flex: 1, padding: "11px", borderRadius: 10, border: "1px solid #e5e7eb", background: "#f9fafb", cursor: "pointer", fontWeight: 600, color: "#374151", fontSize: "0.9rem" }}>
                  Cancel
                </button>
                <button type="button" onClick={doExport} disabled={effectiveKeys.size === 0}
                  style={{
                    flex: 2, padding: "11px", borderRadius: 10, border: "none", cursor: effectiveKeys.size === 0 ? "not-allowed" : "pointer",
                    fontWeight: 700, fontSize: "0.9rem",
                    background: effectiveKeys.size === 0 ? "#e5e7eb" : "#2563eb",
                    color: effectiveKeys.size === 0 ? "#9ca3af" : "#fff",
                    transition: "background 0.15s",
                  }}>
                  {showIssueFilter === "excel" ? "📊" : "📝"} Export {effectiveKeys.size > 0 ? `${effectiveKeys.size} Issue${effectiveKeys.size !== 1 ? "s" : ""}` : ""}
                </button>
              </div>
            </div>
          </div>
        );
      })()}

      <footer className="footer" style={selectMode ? { marginBottom: 66 } : {}}>
        <img src={LOGO_WHITE} alt="Sodexo" className="footerLogo" />
        <span>{FIREBASE_ON ? "\u2601\uFE0F Inspection history synced to cloud database." : "Inspection history is stored locally in your browser."}</span>
      </footer>
    </div>
  );
}

/* ── My Temps Page — Location Manager HACCP temperature overview ── */
function MyTempsPage({ currentUser, onBack }) {
  const myLocation = currentUser?.assignedLocation || "";
  const [subs, setSubs] = useState([]);
  const [inspRecords, setInspRecords] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      loadHaccpSubmissions(),
      loadHistory(undefined, { pageSize: 500 }),
    ]).then(([allSubs, { list: allRecs }]) => {
      // Filter HACCP supervisor submissions for this location
      const mine = allSubs.filter(s =>
        s.type === "submission" &&
        s.site && s.site.toLowerCase().includes(myLocation.toLowerCase())
      );
      setSubs(mine);

      // Filter inspection records that have foodTemps data for this location
      const withTemps = allRecs.filter(rec => {
        if (!rec.foodTemps) return false;
        const hasAnyTemp = HACCP_TEMP_ITEMS.some(item => {
          const vals = (rec.foodTemps[item.key] || []).filter(v => v !== "");
          return vals.length > 0;
        });
        if (!hasAnyTemp) return false;
        // Match location
        const recLoc = (rec.siteName || rec.facility?.name || rec.facility?.location || "").toLowerCase();
        return recLoc.includes(myLocation.toLowerCase()) || myLocation === "";
      });
      // Sort most recent first
      withTemps.sort((a, b) => (b.savedAt || "").localeCompare(a.savedAt || ""));
      setInspRecords(withTemps);

      setLoading(false);
    });
  }, [myLocation]);

  function fmtTime(iso) {
    if (!iso) return "—";
    try { return new Date(iso).toLocaleString([], { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" }); }
    catch { return iso; }
  }

  return (
    <div className="appShell">
      <header className="topBar">
        <div className="brandLeft brandClickable" onClick={onBack} title="Back">
          <img src={LOGO_WHITE} alt="Sodexo" className="brandLogo" />
          <div>
            <div className="brandTitle">🌡️ Temperature Logs</div>
            <div className="brandSub">{myLocation || "My Location"}</div>
          </div>
        </div>
        <div className="topActions">
          <button className="btn btnGhost" onClick={onBack} type="button">Back</button>
        </div>
      </header>
      <div className="topBarSpacer" />
      <main className="pageMain pageMainNarrow">
        {loading ? (
          <div style={{ textAlign: "center", padding: "3rem", color: "#94a3b8" }}>Loading…</div>
        ) : subs.length === 0 && inspRecords.length === 0 ? (
          <div style={{ textAlign: "center", padding: "3rem", color: "#64748b" }}>
            <div style={{ fontSize: "2rem", marginBottom: "0.5rem" }}>🌡️</div>
            <div style={{ fontWeight: 600, marginBottom: "0.25rem" }}>No temperature logs yet</div>
            <div style={{ fontSize: "0.85rem" }}>
              Logs will appear here once supervisors scan the HACCP QR code or inspectors record food temperatures at {myLocation || "your location"}.
            </div>
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: "1.25rem" }}>

            {/* ── Supervisor HACCP Submissions ── */}
            {subs.length > 0 && (
              <div>
                <div style={{ fontSize: "0.72rem", fontWeight: 700, color: "#64748b", letterSpacing: "0.05em", textTransform: "uppercase", marginBottom: "0.5rem" }}>
                  Supervisor HACCP — {subs.length} submission{subs.length !== 1 ? "s" : ""}
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
                  {subs.map((sub, i) => {
                    const flagged = HACCP_TEMP_ITEMS.filter(item => {
                      const vals = (sub.temps || {})[item.key] || [];
                      return vals.some(v => tempPass(item, v) === false);
                    });
                    const hasProblem = sub.problem || sub.problemReport?.description;
                    return (
                      <div key={sub.id || i} style={{
                        background: "#1e293b", borderRadius: "10px", padding: "1rem 1.25rem",
                        border: flagged.length > 0 ? "1px solid #ef444455" : "1px solid #334155",
                      }}>
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "0.5rem" }}>
                          <div>
                            <div style={{ fontWeight: 600, color: "#f1f5f9" }}>{sub.supervisorName || "Supervisor"}</div>
                            <div style={{ fontSize: "0.78rem", color: "#94a3b8", marginTop: "0.1rem" }}>{fmtTime(sub.submittedAt)}</div>
                          </div>
                          <div>
                            {flagged.length > 0
                              ? <span style={{ background: "#ef4444", color: "#fff", borderRadius: "999px", padding: "0.2rem 0.6rem", fontSize: "0.72rem", fontWeight: 700 }}>⚠️ {flagged.length} flag{flagged.length !== 1 ? "s" : ""}</span>
                              : <span style={{ background: "#22c55e", color: "#fff", borderRadius: "999px", padding: "0.2rem 0.6rem", fontSize: "0.72rem", fontWeight: 700 }}>✓ All OK</span>
                            }
                          </div>
                        </div>
                        <div style={{ display: "flex", flexWrap: "wrap", gap: "0.4rem" }}>
                          {(() => {
                            const customSaved = sub.customItems || [];
                            const allItems = [
                              ...HACCP_TEMP_ITEMS,
                              ...customSaved.filter(ci => !HACCP_TEMP_ITEMS.find(d => d.key === ci.key)),
                            ];
                            return allItems.map(item => {
                              const vals = ((sub.temps || {})[item.key] || []).filter(v => v !== "");
                              if (!vals.length) return null;
                              const allPass = vals.every(v => tempPass(item, v) !== false);
                              const displayLabel = (sub.itemLabels || {})[item.key] || item.label;
                              return (
                                <span key={item.key} style={{
                                  background: "#0f172a", border: `1px solid ${allPass ? "#334155" : "#ef4444"}`,
                                  borderRadius: "6px", padding: "0.2rem 0.55rem", fontSize: "0.72rem",
                                  color: allPass ? "#94a3b8" : "#ef4444",
                                }}>
                                  {displayLabel}: {vals.join(", ")}°F
                                </span>
                              );
                            });
                          })()}
                        </div>
                        {hasProblem && (
                          <div style={{ marginTop: "0.5rem", background: "#1e0a0a", border: "1px solid #7f1d1d", borderRadius: "6px", padding: "0.4rem 0.7rem", fontSize: "0.78rem", color: "#fca5a5" }}>
                            ⚠️ {sub.problemReport?.description || sub.problem}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* ── Inspector Food Temperatures (from inspection records) ── */}
            {inspRecords.length > 0 && (
              <div>
                <div style={{ fontSize: "0.72rem", fontWeight: 700, color: "#64748b", letterSpacing: "0.05em", textTransform: "uppercase", marginBottom: "0.5rem" }}>
                  Inspector Food Temps — {inspRecords.length} report{inspRecords.length !== 1 ? "s" : ""}
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
                  {inspRecords.map((rec, i) => {
                    const flaggedItems = HACCP_TEMP_ITEMS.filter(item => {
                      const vals = (rec.foodTemps[item.key] || []).filter(v => v !== "");
                      return vals.some(v => tempPass(item, v) === false);
                    });
                    return (
                      <div key={rec.id || rec.savedAt || i} style={{
                        background: "#1e293b", borderRadius: "10px", padding: "1rem 1.25rem",
                        border: flaggedItems.length > 0 ? "1px solid #ef444455" : "1px solid #334155",
                      }}>
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "0.5rem" }}>
                          <div>
                            <div style={{ fontWeight: 600, color: "#f1f5f9" }}>{rec.inspectorName || rec.inspector || "Inspector"}</div>
                            <div style={{ fontSize: "0.78rem", color: "#94a3b8", marginTop: "0.1rem" }}>{fmtTime(rec.savedAt)}</div>
                          </div>
                          <div>
                            {flaggedItems.length > 0
                              ? <span style={{ background: "#ef4444", color: "#fff", borderRadius: "999px", padding: "0.2rem 0.6rem", fontSize: "0.72rem", fontWeight: 700 }}>⚠️ {flaggedItems.length} flag{flaggedItems.length !== 1 ? "s" : ""}</span>
                              : <span style={{ background: "#22c55e", color: "#fff", borderRadius: "999px", padding: "0.2rem 0.6rem", fontSize: "0.72rem", fontWeight: 700 }}>✓ All OK</span>
                            }
                          </div>
                        </div>
                        <div style={{ display: "flex", flexDirection: "column", gap: "0.35rem" }}>
                          {HACCP_TEMP_ITEMS.map(item => {
                            const vals = (rec.foodTemps[item.key] || []).filter(v => v !== "");
                            const names = rec.foodTempNames ? (rec.foodTempNames[item.key] || []) : [];
                            if (!vals.length) return null;
                            return (
                              <div key={item.key} style={{ display: "flex", flexWrap: "wrap", gap: "0.3rem", alignItems: "center" }}>
                                <span style={{ fontSize: "0.72rem", color: "#64748b", minWidth: 90 }}>{item.label}:</span>
                                {vals.map((v, vi) => {
                                  const pass = tempPass(item, v);
                                  const name = names[vi];
                                  return (
                                    <span key={vi} style={{
                                      background: "#0f172a",
                                      border: `1px solid ${pass === false ? "#ef4444" : pass === true ? "#334155" : "#334155"}`,
                                      borderRadius: "6px", padding: "0.15rem 0.5rem",
                                      fontSize: "0.72rem",
                                      color: pass === false ? "#ef4444" : pass === true ? "#94a3b8" : "#64748b",
                                    }}>
                                      {name ? `${name} · ` : ""}{v}°F {pass === false ? "⚠" : pass === true ? "✓" : ""}
                                    </span>
                                  );
                                })}
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

          </div>
        )}
      </main>
    </div>
  );
}

/* ── Admin Panel ──────────────────────────────────────────── */
/* ── My Team Page (for Location Managers) ──────────────────── */
function MyTeamPage({ currentUser, onBack }) {
  const [guests, setGuests] = useState([]);
  const [showAddForm, setShowAddForm] = useState(false);
  const [addBadge, setAddBadge] = useState("");
  const [addName, setAddName] = useState("");
  const [addDept, setAddDept] = useState("Guest Inspector");
  const [addError, setAddError] = useState("");
  const [addSuccess, setAddSuccess] = useState("");
  const [addLoading, setAddLoading] = useState(false);

  const isLocationManager = currentUser?.role === "location_manager";
  const myLocation = currentUser?.assignedLocation || "";

  async function refresh() {
    const all = await getUsers();
    if (isLocationManager) {
      setGuests(all.filter(u => u.role === "guest" && u.assignedLocation === myLocation));
    } else {
      // inspector: show guests they personally sponsored
      setGuests(all.filter(u => u.role === "guest" && u.assignedBy === currentUser?.badgeHash));
    }
  }

  useEffect(() => { refresh(); }, []);

  async function handleAddGuest(e) {
    e.preventDefault();
    setAddError(""); setAddSuccess(""); setAddLoading(true);
    try {
      if (addBadge.trim().length < 3) { setAddError("Badge number must be at least 3 characters."); return; }
      const guestLocation = isLocationManager ? myLocation : (currentUser?.assignedLocation || "");
      const result = await addGuestInspector(addBadge.trim(), addName.trim(), addDept.trim(), guestLocation, currentUser?.badgeHash, currentUser?.name);
      if (result.ok) {
        setAddSuccess(`${addName.trim()} added as Guest Inspector.`);
        setAddBadge(""); setAddName(""); setAddDept("Guest Inspector");
        await refresh();
        setTimeout(() => setAddSuccess(""), 3000);
      } else if (result.reason === "exists") {
        setAddError("This badge number is already registered.");
      }
    } catch { setAddError("Failed to add guest. Try again."); }
    finally { setAddLoading(false); }
  }

  async function handleRemoveGuest(badgeHash, name) {
    if (!confirm(`Remove ${name} from your team?`)) return;
    await removeGuestInspector(badgeHash);
    await refresh();
  }

  return (
    <div className="appShell">
      <header className="topBar">
        <div className="brandLeft brandClickable" onClick={onBack} title="Back to Inspector">
          <img src={LOGO_WHITE} alt="Sodexo" className="brandLogo" />
          <div>
            <div className="brandTitle">My Team</div>
            <div className="brandSub">{isLocationManager ? `📍 ${myLocation || "Your Location"}` : `👤 ${currentUser?.name || "Your Guests"}`}</div>
          </div>
        </div>
        <div className="topActions">
          <button className="btn btnGhost" onClick={onBack} type="button">Back</button>
        </div>
      </header>
      <div className="topBarSpacer" />

      <main className="pageMain pageMainNarrow">
        <div className="card adminCard" style={{ marginBottom: 24 }}>
          <div className="cardHeader">
            <div className="cardTitle">Add Guest Inspector</div>
            <button className="btn btnGhost btnSmall" type="button" onClick={() => { setShowAddForm(!showAddForm); setAddError(""); setAddSuccess(""); }}>
              {showAddForm ? "Cancel" : "+ Add Guest"}
            </button>
          </div>
          {showAddForm && (
            <div className="cardBody">
              <div style={{ background: "#eff6ff", border: "1px solid #bfdbfe", borderRadius: 10, padding: "10px 14px", marginBottom: 14, fontSize: "0.82rem", color: "#1e40af" }}>
                {isLocationManager
                  ? <>Guest inspectors will be assigned to <strong>{myLocation}</strong> and can only inspect that location.</>
                  : <>Guest inspectors will be invited under your name. Their reports will list you as the Inspector and them as the Participant.</>
                }
              </div>
              <form onSubmit={handleAddGuest} className="addUserForm">
                <div className="fieldGrid">
                  <label className="field">
                    <span className="fieldLabel">Badge Number</span>
                    <input className="input" type="password" value={addBadge} onChange={e => setAddBadge(e.target.value)} placeholder="Enter badge #" autoComplete="off" />
                  </label>
                  <label className="field">
                    <span className="fieldLabel">Full Name</span>
                    <input className="input" value={addName} onChange={e => setAddName(e.target.value)} placeholder="e.g., Jane Smith" />
                  </label>
                  <label className="field">
                    <span className="fieldLabel">Department</span>
                    <input className="input" value={addDept} onChange={e => setAddDept(e.target.value)} placeholder="e.g., Guest Inspector" />
                  </label>
                </div>
                {addError && <div className="pinError" style={{ marginTop: 8 }}>{addError}</div>}
                {addSuccess && <div className="addUserSuccess">{addSuccess}</div>}
                <button className="btn btnPrimary" type="submit" style={{ marginTop: 12 }}
                  disabled={addLoading || addBadge.trim().length < 3 || !addName.trim()}>
                  {addLoading ? "Adding..." : "Add Guest Inspector"}
                </button>
              </form>
            </div>
          )}
        </div>

        <div className="card adminCard">
          <div className="cardHeader">
            <div className="cardTitle">
              My Guest Inspectors
              <span className="adminCount">{guests.length}</span>
            </div>
          </div>
          <div className="cardBody">
            {guests.length === 0 ? (
              <div className="emptyState">
                <div className="emptyTitle">No guest inspectors yet</div>
                <div className="emptySub">
                  {isLocationManager
                    ? `Add guest inspectors for events at ${myLocation || "your location"}.`
                    : "Invite guest inspectors for your event. Their reports will credit you as the Inspector."}
                </div>
              </div>
            ) : guests.map(u => (
              <div className="adminUserRow" key={u.badgeHash}>
                <div className="adminUserInfo">
                  <div className="adminUserName">
                    {u.name}
                    <span className="roleBadge guestRoleBadge">Guest</span>
                    {u.badgeDisplay && <span className="badgeNumDisplay">Badge: {u.badgeDisplay}</span>}
                  </div>
                  <div className="adminUserMeta">{u.department} &middot; Added {new Date(u.registeredAt).toLocaleDateString()}</div>
                </div>
                <div className="adminUserActions">
                  <button className="btn btnGhost btnSmall adminDenyBtn" onClick={() => handleRemoveGuest(u.badgeHash, u.name)}>Remove</button>
                </div>
              </div>
            ))}
          </div>
        </div>
      </main>

      <footer className="footer">
        <img src={LOGO_WHITE} alt="Sodexo" className="footerLogo" />
        <span>{isLocationManager ? "Guest inspectors are scoped to your location." : "Guest reports will list you as Inspector and the guest as Participant."}</span>
      </footer>
    </div>
  );
}

/* ── Food Safety Quick Reference ─────────────────────────── */
function FoodSafetyRef() {
  const [open, setOpen] = React.useState(false);

  const zones = [
    { label: "🥵 Hot Holding",   temp: "≥ 135°F  (≥ 57°C)",  color: "#ef4444", note: "Cook & hold above this" },
    { label: "⚠️ Danger Zone",   temp: "41°F – 135°F",        color: "#f59e0b", note: "Bacteria grow rapidly" },
    { label: "❄️ Cold Holding",  temp: "≤ 41°F  (≤ 5°C)",    color: "#3b82f6", note: "Refrigerate at or below" },
    { label: "🧊 Walk-in Cooler (WIC)", temp: "34°F – 38°F  (1°C – 3°C)", color: "#6366f1", note: "Ideal range; max 41°F" },
    { label: "🔵 Freezer",       temp: "0°F  (-18°C) or below", color: "#0ea5e9", note: "For long-term storage" },
  ];

  const sanitizers = [
    { type: "Chlorine (bleach)", ppm: "50 – 100 ppm", strip: "White/yellow → light tan = OK", caution: "Don't exceed 200 ppm" },
    { type: "Quat Ammonium",     ppm: "200 – 400 ppm", strip: "Color block match on chart",    caution: "Change solution every 2–4 hrs" },
    { type: "Iodine",            ppm: "12.5 – 25 ppm", strip: "Amber/orange color",             caution: "Discard if colorless" },
  ];

  return (
    <section className="foodSafetyRef" style={{ gridColumn: "1 / -1" }}>
      <button
        className="foodSafetyRefToggle"
        type="button"
        onClick={() => setOpen(o => !o)}
        aria-expanded={open}
      >
        <div className="foodSafetyRefToggleMeta">
          <span>🌡️ Food Safety Quick Reference</span>
          <span className="foodSafetyRefBadge">SerSafe</span>
        </div>
        <span className="foodSafetyRefChevron" style={{ transform: open ? "rotate(180deg)" : "rotate(0deg)" }}>▼</span>
      </button>

      {open && (
        <div className="foodSafetyRefBody">

          {/* ── Column 1: Temperatures ── */}
          <div className="foodSafetySection">
            <div className="foodSafetySectionTitle">Temperature Guide</div>
            <div className="foodSafetyTempGrid">
              {zones.map(z => (
                <div key={z.label} className="foodSafetyTempCard" style={{ borderLeftColor: z.color }}>
                  <div className="foodSafetyTempLabel">{z.label}</div>
                  <div className="foodSafetyTempValue" style={{ color: z.color }}>{z.temp}</div>
                  <div className="foodSafetyTempNote">{z.note}</div>
                </div>
              ))}
            </div>

            {/* Danger zone visual bar */}
            <div className="dangerZoneBar">
              <div className="dangerZoneBarTrack">
                <div className="dangerZoneBarCold" title="Safe Cold Zone (≤41°F)" />
                <div className="dangerZoneBarDanger" title="Danger Zone (41–135°F)">
                  <span className="dangerZoneBarLabel">⚠ DANGER ZONE  41°F – 135°F</span>
                </div>
                <div className="dangerZoneBarHot" title="Safe Hot Zone (≥135°F)" />
              </div>
              <div className="dangerZoneBarLegend">
                <span style={{ color: "#2563eb" }}>❄ Cold ≤41°F</span>
                <span style={{ color: "#92400e" }}>Bacteria multiply rapidly</span>
                <span style={{ color: "#dc2626" }}>🔥 Hot ≥135°F</span>
              </div>
            </div>

            {/* Thermometer Calibration */}
            <div style={{ background: "linear-gradient(135deg,#f0fdf4,#ecfdf5)", border: "1.5px solid #86efac", borderRadius: 12, padding: "12px 14px" }}>
              <div style={{ fontWeight: 800, fontSize: "0.72rem", color: "#14532d", marginBottom: 8, textTransform: "uppercase", letterSpacing: "0.06em" }}>🔧 Thermometer Calibration</div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 8 }}>
                <div style={{ background: "#fff", borderRadius: 10, padding: "10px 12px", border: "1.5px solid #bfdbfe", boxShadow: "0 1px 4px rgba(0,0,0,.05)" }}>
                  <div style={{ fontWeight: 700, fontSize: "0.75rem", color: "#1d4ed8", marginBottom: 4 }}>🧊 Ice-Point</div>
                  <div style={{ fontSize: "0.88rem", color: "#1e293b", fontWeight: 800, letterSpacing: "-0.01em" }}>32°F / 0°C</div>
                  <div style={{ fontSize: "0.68rem", color: "#64748b", marginTop: 4, lineHeight: 1.45 }}>Crushed ice + cold water. Probe 2 in. deep. Wait 30 sec. ±2°F acceptable.</div>
                </div>
                <div style={{ background: "#fff", borderRadius: 10, padding: "10px 12px", border: "1.5px solid #fca5a5", boxShadow: "0 1px 4px rgba(0,0,0,.05)" }}>
                  <div style={{ fontWeight: 700, fontSize: "0.75rem", color: "#dc2626", marginBottom: 4 }}>♨️ Boiling-Point</div>
                  <div style={{ fontSize: "0.88rem", color: "#1e293b", fontWeight: 800, letterSpacing: "-0.01em" }}>212°F / 100°C*</div>
                  <div style={{ fontSize: "0.68rem", color: "#64748b", marginTop: 4, lineHeight: 1.45 }}>Boiling water, 2 in. deep. *–2°F per 1,000 ft elevation.</div>
                </div>
              </div>
              <div style={{ fontSize: "0.68rem", color: "#374151", background: "#fff", borderRadius: 8, padding: "7px 10px", border: "1px solid #d1fae5", lineHeight: 1.5 }}>
                Calibrate at shift start, after drops, and between food types. If out of range (±2°F / ±1°C), adjust nut or replace.
              </div>
            </div>
          </div>

          {/* ── Column 2: Sanitizers ── */}
          <div className="foodSafetySection">
            <div className="foodSafetySectionTitle">Sanitizer Test Strips</div>
            <div className="sanitizerGrid">
              {sanitizers.map(s => (
                <div key={s.type} className="sanitizerCard">
                  <div className="sanitizerType">{s.type}</div>
                  <div className="sanitizerPpm">{s.ppm}</div>
                  <div className="sanitizerStrip">Strip: {s.strip}</div>
                  <div className="sanitizerCaution">⚠ {s.caution}</div>
                </div>
              ))}
            </div>
            <div className="sanitizerTip">
              <strong>How to test:</strong> Dip strip 10 sec, hold level 15 sec, compare to chart. Test every 2–4 hrs or when solution looks cloudy or diluted.
            </div>
          </div>

          {/* ── Column 3: Cutting Boards ── */}
          <div className="foodSafetySection">
            <div className="foodSafetySectionTitle">Cutting Board Color Code</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {[
                { color: "#ef4444", bg: "#fef2f2", border: "#fca5a5", label: "Red",    uses: "Raw beef, pork & lamb" },
                { color: "#f97316", bg: "#fff7ed", border: "#fdba74", label: "Orange", uses: "Raw pork (alt. system)" },
                { color: "#eab308", bg: "#fefce8", border: "#fde047", label: "Yellow", uses: "Raw poultry (chicken, turkey)" },
                { color: "#22c55e", bg: "#f0fdf4", border: "#86efac", label: "Green",  uses: "Fresh fruits & vegetables" },
                { color: "#3b82f6", bg: "#eff6ff", border: "#93c5fd", label: "Blue",   uses: "Raw fish & seafood" },
                { color: "#94a3b8", bg: "#f9fafb", border: "#d1d5db", label: "White",  uses: "Dairy, deli, bread & bakery" },
                { color: "#8b5cf6", bg: "#f5f3ff", border: "#c4b5fd", label: "Purple", uses: "Allergen-free prep" },
              ].map(b => (
                <div key={b.label} style={{ borderRadius: 9, border: `1.5px solid ${b.border}`, background: b.bg, padding: "8px 11px", display: "flex", alignItems: "center", gap: 10 }}>
                  <span style={{ display: "inline-block", width: 22, height: 22, borderRadius: 5, background: b.color, border: `2px solid ${b.border}`, flexShrink: 0, boxShadow: "0 1px 3px rgba(0,0,0,.12)" }} />
                  <div style={{ display: "flex", flexDirection: "column", gap: 1, minWidth: 0 }}>
                    <span style={{ fontWeight: 700, fontSize: "0.78rem", color: "#1e293b" }}>{b.label}</span>
                    <span style={{ fontSize: "0.69rem", color: "#475569", lineHeight: 1.35 }}>{b.uses}</span>
                  </div>
                </div>
              ))}
            </div>
            <div className="sanitizerTip">
              <strong>Key rules:</strong> Never share boards between raw proteins and ready-to-eat foods. Replace scored or deeply grooved boards immediately — grooves harbor bacteria. Wash, rinse, sanitize between each use.
            </div>
          </div>

        </div>
      )}
    </section>
  );
}

/* ══════════════════════════════════════════════════════════════
   PerformanceDashboard — Admin-only inspector performance view
   Shows: rankings, time-per-report, time-per-location, best inspector
══════════════════════════════════════════════════════════════ */
function PerformanceDashboard({ onBack, managedVenueId, managedVenueName }) {
  const [history, setHistory] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState("rankings");
  const [sitesSortBy, setSitesSortBy] = useState("total");

  useEffect(() => {
    loadHistory(managedVenueId || undefined, { pageSize: 2000 }).then(({ list }) => { setHistory(list || []); setLoading(false); });
  }, [managedVenueId]);

  const ranking = useMemo(() => AIEngine.getInspectorRanking(history), [history]);

  function fmtDur(sec) {
    if (!sec || sec <= 0) return "—";
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    return m > 0 ? `${m}m ${s}s` : `${s}s`;
  }

  // Format gap between inspections — can be hours or days
  function fmtGap(sec) {
    if (!sec || sec <= 0) return "—";
    if (sec < 3600) { const m = Math.floor(sec / 60); return `${m}m`; }
    if (sec < 86400) { const h = Math.floor(sec / 3600); const m = Math.floor((sec % 3600) / 60); return m > 0 ? `${h}h ${m}m` : `${h}h`; }
    const d = Math.floor(sec / 86400);
    const h = Math.floor((sec % 86400) / 3600);
    return h > 0 ? `${d}d ${h}h` : `${d}d`;
  }

  const medals = ["🥇", "🥈", "🥉"];

  const scoreColor = (score) => {
    if (score >= 80) return "#22c55e";
    if (score >= 60) return "#f59e0b";
    return "#ef4444";
  };

  const trendLabel = (t) => {
    if (t === "improving") return { label: "↑ Improving", color: "#22c55e" };
    if (t === "declining") return { label: "↓ Declining", color: "#ef4444" };
    return { label: "→ Stable", color: "#94a3b8" };
  };

  // By-location aggregation (enriched with unit number, floor, locationType, issue categories, inspector list)
  // Grouping key includes siteName + siteNumber + floor so each distinct unit gets its own card.
  const byLocation = useMemo(() => {
    if (!history.length) return [];
    const map = {};
    for (const r of history) {
      const siteName  = (r.siteName || r.location || "Unknown").trim();
      const unitNum   = (r.siteNumber || "").trim();
      const floor     = (r.floor || "").trim();
      const key       = `${siteName}||${unitNum}||${floor}`;
      if (!map[key]) map[key] = {
        siteName, unitNum, floor,
        locationType: r.locationType || "",
        eventName: r.eventName || "",
        sitePhone: r.sitePhone || "",
        restaurantLicense: r.restaurantLicense || "",
        total: 0, passes: 0, durations: [], inspectors: new Set(), cats: {}, lastDate: null
      };
      const e = map[key];
      e.total++;
      if (r.overallStatus === "pass") e.passes++;
      if (typeof r.reportDurationSeconds === "number" && r.reportDurationSeconds > 0)
        e.durations.push(r.reportDurationSeconds);
      if (r.inspectorName) e.inspectors.add(r.inspectorName);
      // pick up enriched fields from later records too
      if (!e.locationType && r.locationType) e.locationType = r.locationType;
      if (!e.eventName   && r.eventName)    e.eventName   = r.eventName;
      if (!e.sitePhone   && r.sitePhone)    e.sitePhone   = r.sitePhone;
      if (!e.restaurantLicense && r.restaurantLicense) e.restaurantLicense = r.restaurantLicense;
      // tally issue categories
      if (Array.isArray(r.issues)) {
        for (const iss of r.issues) {
          const cat = iss.category || iss.label || "Other";
          e.cats[cat] = (e.cats[cat] || 0) + 1;
        }
      }
      if (r.savedAt && (!e.lastDate || r.savedAt > e.lastDate)) e.lastDate = r.savedAt;
    }
    return Object.values(map).map(v => ({
      key: `${v.siteName}||${v.unitNum}||${v.floor}`,
      siteName: v.siteName,
      unitNum: v.unitNum,
      floor: v.floor,
      locationType: v.locationType,
      eventName: v.eventName,
      sitePhone: v.sitePhone,
      restaurantLicense: v.restaurantLicense,
      total: v.total,
      passRate: v.total ? Math.round((v.passes / v.total) * 100) : 0,
      avgSec: v.durations.length ? Math.round(v.durations.reduce((a, b) => a + b, 0) / v.durations.length) : null,
      inspectorCount: v.inspectors.size,
      inspectors: [...v.inspectors],
      topIssues: Object.entries(v.cats).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([cat, count]) => ({ cat, count })),
      lastDate: v.lastDate,
    })).sort((a, b) => b.total - a.total);
  }, [history]);

  const best = ranking[0];
  const fastest = ranking.length
    ? [...ranking].filter(r => r.avgDurationSec).sort((a, b) => a.avgDurationSec - b.avgDurationSec)[0]
    : null;

  // Sodexo brand tokens
  const NAVY  = "#2A295C";
  const RED   = "#EE0000";
  const BG    = "#f0f2f7";

  // Aggregate summary stats
  const totalInspections = history.length;
  const overallPassRate  = totalInspections
    ? Math.round((history.filter(r => r.overallStatus === "pass").length / totalInspections) * 100)
    : 0;
  const avgScore = ranking.length
    ? Math.round(ranking.reduce((s, p) => s + p.performanceScore, 0) / ranking.length)
    : 0;

  // Avatar initials helper
  const initials = (name) => name ? name.split(" ").map(w => w[0]).join("").toUpperCase().slice(0, 2) : "?";
  // Avatar background from name hash
  const avatarBg = (name) => {
    const colors = ["#6366f1","#0ea5e9","#10b981","#f59e0b","#8b5cf6","#ec4899","#14b8a6","#f97316"];
    let h = 0; for (let c of (name || "")) h = (h * 31 + c.charCodeAt(0)) & 0xffff;
    return colors[h % colors.length];
  };
  // Pass rate color with more granularity
  const passColor = (r) => r >= 90 ? "#16a34a" : r >= 75 ? "#22c55e" : r >= 60 ? "#f59e0b" : "#ef4444";

  // ── Retention Verdict Engine ─────────────────────────────────────────
  // Returns { verdict, color, bgColor, borderColor, emoji, summary, signals, recommendations }
  function buildVerdict(p) {
    const signals = [];
    const recommendations = [];
    let score = 0; // internal tally, higher = better
    const MIN_INSPECTIONS = 5;

    // ── Pass rate signal ──────────────────────────────────────────────
    if (p.passRate >= 85) {
      score += 3;
      signals.push({ label: "High pass rate", detail: `${p.passRate}% — consistently approves kitchens that meet standards`, type: "positive" });
    } else if (p.passRate >= 70) {
      score += 1;
      signals.push({ label: "Acceptable pass rate", detail: `${p.passRate}% — room to improve consistency`, type: "neutral" });
    } else if (p.passRate >= 55) {
      score -= 1;
      signals.push({ label: "Below-average pass rate", detail: `${p.passRate}% — too many inspections are failing or being marked incorrectly`, type: "warning" });
      recommendations.push("Review whether failing sites have genuine issues or if standards are being applied inconsistently.");
    } else {
      score -= 3;
      signals.push({ label: "Low pass rate", detail: `${p.passRate}% — significantly below expectations`, type: "danger" });
      recommendations.push("Urgent: conduct a calibration session and shadow this inspector on their next visit.");
    }

    // ── Trend signal ─────────────────────────────────────────────────
    if (p.trendLabel === "improving" && p.trend >= 15) {
      score += 2;
      signals.push({ label: "Strong upward trend", detail: `Pass rate rose +${p.trend}pts from first to second half of their records`, type: "positive" });
    } else if (p.trendLabel === "improving") {
      score += 1;
      signals.push({ label: "Improving trajectory", detail: `Pass rate trending upward (+${p.trend}pts) — on the right track`, type: "positive" });
    } else if (p.trendLabel === "stable") {
      signals.push({ label: "Consistent performance", detail: "Results are steady — neither improving nor declining", type: "neutral" });
    } else if (p.trendLabel === "declining" && Math.abs(p.trend) >= 20) {
      score -= 3;
      signals.push({ label: "Sharp decline", detail: `Pass rate dropped ${Math.abs(p.trend)}pts — significant regression`, type: "danger" });
      recommendations.push("Performance is dropping sharply. Schedule a 1:1 review to understand root cause.");
    } else if (p.trendLabel === "declining") {
      score -= 1;
      signals.push({ label: "Declining trend", detail: `Pass rate dropped ${Math.abs(p.trend)}pts over time`, type: "warning" });
      recommendations.push("Monitor closely over the next 3–4 inspections for signs of recovery.");
    }

    // ── Issue-finding thoroughness ────────────────────────────────────
    if (p.avgIssues >= 3) {
      score += 2;
      signals.push({ label: "Thorough issue finder", detail: `Avg ${p.avgIssues} issues flagged per inspection — catching real problems`, type: "positive" });
    } else if (p.avgIssues >= 1.5) {
      score += 1;
      signals.push({ label: "Adequate flagging", detail: `Avg ${p.avgIssues} issues per inspection`, type: "neutral" });
    } else if (p.avgIssues < 0.5 && p.total >= MIN_INSPECTIONS) {
      score -= 2;
      signals.push({ label: "Very few issues flagged", detail: `Avg ${p.avgIssues} issues per inspection — may be missing problems or rubber-stamping`, type: "danger" });
      recommendations.push("An inspector who never finds issues is either in perfect sites or not looking hard enough. Compare their sites to those inspected by other staff.");
    } else {
      signals.push({ label: "Low issue rate", detail: `Avg ${p.avgIssues} issues per inspection — could indicate missed findings`, type: "warning" });
    }

    // ── Speed / thoroughness balance ──────────────────────────────────
    if (p.avgDurationSec !== null) {
      const minutes = Math.round(p.avgDurationSec / 60);
      if (p.avgDurationSec < 240) {
        score -= 2;
        signals.push({ label: "Unusually fast reports", detail: `Avg ${minutes} min per inspection — may be rushing without adequate review`, type: "danger" });
        recommendations.push("Reports completed under 4 minutes raise concerns about thoroughness. Cross-check their marked passes with follow-up visits.");
      } else if (p.avgDurationSec < 600) {
        score += 1;
        signals.push({ label: "Efficient reporting", detail: `Avg ${minutes} min per inspection — good speed`, type: "positive" });
      } else if (p.avgDurationSec < 1500) {
        signals.push({ label: "Standard reporting pace", detail: `Avg ${minutes} min per inspection`, type: "neutral" });
      } else {
        signals.push({ label: "Slow reporting", detail: `Avg ${minutes} min per inspection — taking considerably longer than peers`, type: "warning" });
        recommendations.push("Consider whether slow pace is due to site complexity or inefficiency in using the app.");
      }
    }

    // ── Site coverage breadth ─────────────────────────────────────────
    if (p.siteCount >= 5) {
      score += 1;
      signals.push({ label: "Wide site coverage", detail: `Inspected ${p.siteCount} different locations — versatile`, type: "positive" });
    } else if (p.siteCount <= 1 && p.total >= MIN_INSPECTIONS) {
      signals.push({ label: "Single-site pattern", detail: `All inspections at the same location — limited cross-site comparison possible`, type: "neutral" });
    }

    // ── Recent inspection trajectory (last 3) ─────────────────────────
    if (p.recent && p.recent.length >= 3) {
      const recentFails = p.recent.filter(r => (r.status || "").toLowerCase() !== "pass").length;
      if (recentFails === 0) {
        score += 1;
        signals.push({ label: "All recent inspections passed", detail: "Last 3 inspections were all passes — currently performing well", type: "positive" });
      } else if (recentFails === 3) {
        score -= 2;
        signals.push({ label: "3 consecutive non-passes", detail: "Every recent inspection failed — immediate attention needed", type: "danger" });
        recommendations.push("Three consecutive non-passes is a red flag. Investigate whether issues are site-specific or inspector-related.");
      } else if (recentFails >= 2) {
        score -= 1;
        signals.push({ label: "Recent struggles", detail: `${recentFails} of last 3 inspections did not pass`, type: "warning" });
      }
    }

    // ── Repeated issue blindspots ─────────────────────────────────────
    if (p.topIssues && p.topIssues.length > 0) {
      const persistentIssue = p.topIssues[0];
      if (persistentIssue.rate >= 50) {
        score -= 1;
        signals.push({ label: "Recurring issue type", detail: `"${persistentIssue.cat}" appears in ${persistentIssue.rate}% of their inspections — may indicate a site problem or inspector blindspot`, type: "warning" });
        recommendations.push(`Investigate whether "${persistentIssue.cat}" issues are being resolved between visits or if this inspector is the only one flagging them.`);
      }
    }

    // ── Sample size caveat ────────────────────────────────────────────
    if (p.total < MIN_INSPECTIONS) {
      signals.push({ label: "Limited data", detail: `Only ${p.total} inspection${p.total !== 1 ? "s" : ""} on record — verdict may not reflect full picture`, type: "neutral" });
      recommendations.push("Collect more inspections before drawing conclusions about this person's performance.");
    }

    // ── Final verdict ─────────────────────────────────────────────────
    let verdict, color, bgColor, borderColor, emoji, summary;
    if (score >= 5) {
      verdict = "KEEP — Top Performer";
      emoji = "🟢";
      color = "#15803d";
      bgColor = "#f0fdf4";
      borderColor = "#86efac";
      summary = "This inspector is consistently delivering strong results. High pass rates, finding real issues, and showing positive growth. A reliable asset to the team.";
    } else if (score >= 2) {
      verdict = "KEEP — Solid";
      emoji = "✅";
      color = "#16a34a";
      bgColor = "#f0fdf4";
      borderColor = "#bbf7d0";
      summary = "Performing at or above expectations. Some areas to watch but no major red flags. Continue standard oversight.";
    } else if (score >= -1) {
      verdict = "WATCH — Monitor Closely";
      emoji = "🟡";
      color = "#b45309";
      bgColor = "#fffbeb";
      borderColor = "#fde68a";
      summary = "Performance is acceptable but showing concerning patterns. Requires active monitoring over the next several inspections before drawing conclusions.";
    } else if (score >= -3) {
      verdict = "CONCERN — Action Required";
      emoji = "🔴";
      color = "#dc2626";
      bgColor = "#fff1f2";
      borderColor = "#fca5a5";
      summary = "Multiple negative signals detected. This inspector needs a formal review, coaching session, and closer supervision before concerns become serious problems.";
    } else {
      verdict = "CONCERN — Urgent Review";
      emoji = "🚨";
      color = "#9f1239";
      bgColor = "#fff1f2";
      borderColor = "#fda4af";
      summary = "Significant performance issues across multiple dimensions. An urgent review is warranted. Continued unsupervised work at this level is not recommended without intervention.";
    }

    return { verdict, color, bgColor, borderColor, emoji, summary, signals, recommendations, score };
  }

  return (
    <div style={{ background: BG, minHeight: "100vh", paddingBottom: "2.5rem" }}>

      {/* ── HEADER ── */}
      <div style={{ background: `linear-gradient(160deg, ${NAVY} 0%, #1d1c50 60%, #283897 100%)`, position: "relative" }}>
        {/* decorative red bottom line */}
        <div style={{ position: "absolute", bottom: 0, left: 0, right: 0, height: 3, background: `linear-gradient(90deg, ${RED}, #ff5555, ${RED})` }} />

        {/* top bar — safe area aware */}
        <div style={{ display: "flex", alignItems: "center", gap: "0.65rem", padding: "0.9rem 1rem 0.75rem" }}>
          <button onClick={onBack} style={{
            background: "rgba(255,255,255,0.12)", border: "1px solid rgba(255,255,255,0.18)",
            borderRadius: 9, color: "#fff", fontWeight: 700, fontSize: "0.82rem",
            padding: "0.45rem 0.85rem", cursor: "pointer", flexShrink: 0,
            whiteSpace: "nowrap"
          }}>← Back</button>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{
              fontSize: "0.95rem", fontWeight: 900, color: "#fff",
              whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis"
            }}>Performance Dashboard</div>
            <div style={{ fontSize: "0.65rem", color: "rgba(255,255,255,0.4)", fontWeight: 500, marginTop: "0.05rem" }}>Sodexo Live! · Kitchen Inspections</div>
          </div>
        </div>

        {/* KPI strip — 5 equal tiles */}
        {!loading && (
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr 1fr", gap: "0.35rem", padding: "0.05rem 1rem 1.25rem" }}>
            {[
              { icon: "📋", val: totalInspections, lbl: "Insp." },
              { icon: "✅", val: `${overallPassRate}%`, lbl: "Pass" },
              { icon: "⭐", val: avgScore || "—", lbl: "Score" },
              { icon: "🏪", val: byLocation.length || "—", lbl: "Sites" },
              { icon: "👤", val: ranking.length || "—", lbl: "People" },
            ].map(({ icon, val, lbl }) => (
              <div key={lbl} style={{
                background: "rgba(255,255,255,0.11)", borderRadius: 11,
                padding: "0.6rem 0.15rem 0.55rem", textAlign: "center",
                border: "1px solid rgba(255,255,255,0.09)"
              }}>
                <div style={{ fontSize: "0.9rem", lineHeight: 1 }}>{icon}</div>
                <div style={{ fontSize: "1rem", fontWeight: 900, color: "#fff", lineHeight: 1.2, marginTop: "0.2rem" }}>{val}</div>
                <div style={{ fontSize: "0.55rem", color: "rgba(255,255,255,0.45)", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.04em", marginTop: "0.12rem" }}>{lbl}</div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Venue banner */}
      {managedVenueId && (
        <div style={{ margin: "1rem 1rem 0", background: "#fef3c7", border: "1px solid #f59e0b", borderRadius: 10, padding: "0.65rem 0.9rem", color: "#92400e", fontWeight: 600, fontSize: "0.83rem" }}>
          ⚠️ Viewing: <strong>{managedVenueName || managedVenueId}</strong>
        </div>
      )}

      {/* ── STATES ── */}
      {loading ? (
        <div style={{ textAlign: "center", padding: "4rem 1rem", color: "#94a3b8" }}>
          <div style={{ fontSize: "2rem", marginBottom: "0.65rem" }}>⏳</div>
          <div style={{ fontWeight: 600, fontSize: "0.9rem" }}>Loading performance data…</div>
        </div>
      ) : ranking.length === 0 ? (
        <div style={{ margin: "1rem", textAlign: "center", padding: "2.5rem 1.25rem", color: "#94a3b8", background: "#fff", borderRadius: 18, border: "1.5px dashed #e2e8f0" }}>
          <div style={{ fontSize: "2.5rem", marginBottom: "0.65rem" }}>📊</div>
          <div style={{ fontWeight: 700, color: "#64748b", fontSize: "0.95rem" }}>No data yet</div>
          <div style={{ fontSize: "0.82rem", marginTop: "0.3rem" }}>Complete inspections to see performance stats.</div>
        </div>
      ) : (
        <div style={{ padding: "0 1rem" }}>

          {/* ── HERO CARD — Top Inspector ── */}
          {best && (
            <div style={{
              background: `linear-gradient(135deg, ${NAVY} 0%, #1a1940 100%)`,
              borderRadius: 18, margin: "1.1rem 0 1rem",
              boxShadow: "0 8px 28px rgba(42,41,92,0.25)",
              overflow: "hidden"
            }}>
              <div style={{ height: 4, background: `linear-gradient(90deg, ${RED}, #ff5555)` }} />
              <div style={{ display: "flex", alignItems: "center", gap: "0.85rem", padding: "1.1rem 1rem 1.15rem" }}>

                {/* Avatar with medal badge */}
                <div style={{ position: "relative", flexShrink: 0 }}>
                  <div style={{
                    width: 52, height: 52, borderRadius: 14,
                    background: avatarBg(best.name),
                    display: "flex", alignItems: "center", justifyContent: "center",
                    fontSize: "1.15rem", fontWeight: 900, color: "#fff",
                    boxShadow: "0 4px 12px rgba(0,0,0,0.28)"
                  }}>{initials(best.name)}</div>
                  <div style={{
                    position: "absolute", bottom: -4, right: -4,
                    width: 20, height: 20, borderRadius: 6, background: RED,
                    display: "flex", alignItems: "center", justifyContent: "center",
                    fontSize: "0.7rem", border: "2px solid #1a1940"
                  }}>🥇</div>
                </div>

                {/* Name + stats — flex:1 with minWidth:0 prevents overflow */}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: "0.58rem", color: "rgba(255,255,255,0.38)", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.09em" }}>🏆 Top Inspector</div>
                  <div style={{ fontSize: "1.05rem", fontWeight: 900, color: "#fff", marginTop: "0.1rem", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{best.name}</div>
                  {/* stat pills — on one row, overflow truncated, never push score bubble */}
                  <div style={{ display: "flex", gap: "0.35rem", marginTop: "0.4rem", overflow: "hidden" }}>
                    <span style={{ background: "rgba(255,255,255,0.11)", borderRadius: 5, padding: "0.12rem 0.45rem", fontSize: "0.67rem", color: "rgba(255,255,255,0.7)", fontWeight: 600, whiteSpace: "nowrap" }}>
                      {best.total} insp
                    </span>
                    <span style={{ background: "rgba(34,197,94,0.18)", borderRadius: 5, padding: "0.12rem 0.45rem", fontSize: "0.67rem", color: "#86efac", fontWeight: 700, whiteSpace: "nowrap" }}>
                      {best.passRate}% pass
                    </span>
                    {best.avgDurationSec && (
                      <span style={{ background: "rgba(255,255,255,0.07)", borderRadius: 5, padding: "0.12rem 0.45rem", fontSize: "0.67rem", color: "rgba(255,255,255,0.55)", fontWeight: 600, whiteSpace: "nowrap" }}>
                        ⏱ {fmtDur(best.avgDurationSec)}
                      </span>
                    )}
                  </div>
                </div>

                {/* Score circle — fixed size, never shrinks */}
                <div style={{ flexShrink: 0 }}>
                  <div style={{
                    width: 54, height: 54, borderRadius: "50%",
                    background: scoreColor(best.performanceScore),
                    display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
                    boxShadow: `0 4px 14px ${scoreColor(best.performanceScore)}55`
                  }}>
                    <div style={{ fontSize: "1.25rem", fontWeight: 900, color: "#fff", lineHeight: 1 }}>{best.performanceScore}</div>
                    <div style={{ fontSize: "0.48rem", color: "rgba(255,255,255,0.65)", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.04em" }}>pts</div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* ── TAB NAV ── */}
          <div style={{
            display: "flex", marginBottom: "1rem",
            background: "#fff", borderRadius: 13,
            boxShadow: "0 2px 8px rgba(0,0,0,0.07)",
            overflow: "hidden", border: "1.5px solid #e2e8f0", padding: "0.25rem"
          }}>
            {[["rankings","🏆","Rankings"],["sites","🏪","Sites"],["time","⏱️","Timing"],["verdict","⚖️","Verdict"]].map(([id, icon, label]) => (
              <button key={id} onClick={() => setActiveTab(id)} style={{
                flex: 1, padding: "0.55rem 0.2rem", border: "none", cursor: "pointer",
                borderRadius: 9,
                fontWeight: activeTab === id ? 800 : 500,
                fontSize: "0.78rem",
                background: activeTab === id ? NAVY : "transparent",
                color: activeTab === id ? "#fff" : "#94a3b8",
                display: "flex", flexDirection: "column", alignItems: "center", gap: "0.12rem",
                transition: "background 0.15s, color 0.15s",
                /* prevent text wrapping on narrow screens */
                whiteSpace: "nowrap",
              }}>
                <span style={{ fontSize: "0.95rem" }}>{icon}</span>
                <span style={{ fontWeight: "inherit" }}>{label}</span>
              </button>
            ))}
          </div>

          {/* ── RANKINGS TAB ── */}
          {activeTab === "rankings" && (
            <div style={{ display: "flex", flexDirection: "column", gap: "0.65rem" }}>
              {ranking.map((p, i) => {
                const trend = trendLabel(p.trendLabel);
                const isTop = i === 0;
                const rankColors = [RED, "#64748b", "#d97706"];
                const rankBg = rankColors[i] ?? "#94a3b8";
                const pct = p.performanceScore;
                // compact stat string — single line, no wrapping
                const statLine = [
                  `${p.total} insp`,
                  `${p.siteCount} site${p.siteCount !== 1 ? "s" : ""}`,
                  p.avgDurationSec ? fmtDur(p.avgDurationSec) : null,
                ].filter(Boolean).join(" · ");
                return (
                  <div key={p.name} style={{
                    background: "#fff", borderRadius: 15, overflow: "hidden",
                    border: isTop ? `1.5px solid ${RED}30` : "1.5px solid #f1f5f9",
                    boxShadow: isTop ? "0 5px 20px rgba(238,0,0,0.09), 0 1px 3px rgba(0,0,0,0.05)" : "0 1px 5px rgba(0,0,0,0.04)"
                  }}>
                    {/* top accent strip for top 3 */}
                    {i < 3 && <div style={{ height: 3, background: rankBg }} />}

                    <div style={{ display: "flex", alignItems: "center", gap: "0.7rem", padding: "0.85rem 0.9rem" }}>
                      {/* Rank badge */}
                      <div style={{
                        width: 36, height: 36, borderRadius: 11, flexShrink: 0,
                        background: i < 3 ? rankBg : "#f1f5f9",
                        display: "flex", alignItems: "center", justifyContent: "center",
                        fontSize: i < 3 ? "1.15rem" : "0.75rem", fontWeight: 900,
                        color: i < 3 ? "#fff" : "#94a3b8"
                      }}>{medals[i] || `#${i+1}`}</div>

                      {/* Avatar */}
                      <div style={{
                        width: 34, height: 34, borderRadius: 10, flexShrink: 0,
                        background: avatarBg(p.name),
                        display: "flex", alignItems: "center", justifyContent: "center",
                        fontSize: "0.73rem", fontWeight: 900, color: "#fff"
                      }}>{initials(p.name)}</div>

                      {/* Info — flex:1 minWidth:0 is critical for text truncation */}
                      <div style={{ flex: 1, minWidth: 0 }}>
                        {/* Row 1: name + trend badge */}
                        <div style={{ display: "flex", alignItems: "center", gap: "0.35rem", marginBottom: "0.08rem" }}>
                          <span style={{ fontWeight: 800, color: "#0f172a", fontSize: "0.9rem", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", flex: 1, minWidth: 0 }}>{p.name}</span>
                          <span style={{
                            fontSize: "0.6rem", color: trend.color, fontWeight: 700, flexShrink: 0,
                            background: trend.color + "14", padding: "0.08rem 0.35rem", borderRadius: 20,
                            border: `1px solid ${trend.color}28`, whiteSpace: "nowrap"
                          }}>{trend.label}</span>
                        </div>
                        {/* Row 2: stats on one line */}
                        <div style={{ fontSize: "0.7rem", color: "#94a3b8", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                          <span style={{ color: passColor(p.passRate), fontWeight: 700 }}>{p.passRate}%</span>
                          <span style={{ margin: "0 0.25rem" }}>·</span>
                          {statLine}
                        </div>
                        {/* Progress bar */}
                        <div style={{ marginTop: "0.45rem", height: 4, background: "#f1f5f9", borderRadius: 99 }}>
                          <div style={{ height: "100%", width: `${pct}%`, borderRadius: 99, background: i < 3 ? rankBg : scoreColor(pct), transition: "width 0.6s ease" }} />
                        </div>
                        {/* Top issue tags */}
                        {p.topIssues && p.topIssues.length > 0 && (
                          <div style={{ marginTop: "0.38rem", display: "flex", flexWrap: "wrap", gap: "0.22rem" }}>
                            {p.topIssues.slice(0, 2).map(iss => (
                              <span key={iss.cat} style={{
                                background: "#fef3f2", border: "1px solid #fecaca", borderRadius: 5,
                                padding: "0.08rem 0.38rem", fontSize: "0.63rem", color: "#991b1b", fontWeight: 600,
                                whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", maxWidth: "48%"
                              }}>⚠ {iss.cat}</span>
                            ))}
                          </div>
                        )}
                      </div>

                      {/* Score chip */}
                      <div style={{
                        flexShrink: 0, width: 46, textAlign: "center",
                        background: isTop ? RED : "#f8fafc",
                        borderRadius: 11, padding: "0.38rem 0.3rem",
                        border: isTop ? "none" : "1.5px solid #e8ecf0"
                      }}>
                        <div style={{ fontSize: "1.05rem", fontWeight: 900, color: isTop ? "#fff" : scoreColor(pct), lineHeight: 1 }}>{pct}</div>
                        <div style={{ fontSize: "0.5rem", color: isTop ? "rgba(255,255,255,0.55)" : "#b0bec5", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.04em" }}>score</div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* ── SITES TAB ── */}
          {activeTab === "sites" && (() => {
            const sorted = [...byLocation].sort((a, b) => {
              if (sitesSortBy === "fail") return a.passRate - b.passRate;
              if (sitesSortBy === "team") return b.inspectorCount - a.inspectorCount;
              return b.total - a.total;
            });
            return (
              <div style={{ display: "flex", flexDirection: "column", gap: "0.65rem" }}>
                {/* sort pills */}
                <div style={{ display: "flex", gap: "0.4rem", flexWrap: "wrap" }}>
                  {[["total","Most Inspected"],["fail","Lowest Pass Rate"],["team","Most Inspectors"]].map(([key, lbl]) => (
                    <button key={key} type="button" onClick={() => setSitesSortBy(key)} style={{
                      border: "none", cursor: "pointer", borderRadius: 20, fontWeight: 700,
                      fontSize: "0.7rem", padding: "0.3rem 0.75rem",
                      background: sitesSortBy === key ? NAVY : "#f1f5f9",
                      color: sitesSortBy === key ? "#fff" : "#64748b",
                      transition: "background 0.15s, color 0.15s"
                    }}>{lbl}</button>
                  ))}
                </div>

                {sorted.length === 0 ? (
                  <div style={{ color: "#94a3b8", padding: "2.5rem 1rem", textAlign: "center", background: "#fff", borderRadius: 14, border: "1.5px dashed #e2e8f0", fontSize: "0.85rem" }}>
                    No site data yet.
                  </div>
                ) : sorted.map((site, idx) => {
                  const pr = site.passRate;
                  const prColor = passColor(pr);
                  // locationType color coding
                  const ltColors = {
                    "Concession":       { bg: "#eff6ff", border: "#bfdbfe", text: "#1d4ed8" },
                    "Portable":         { bg: "#fffbeb", border: "#fde68a", text: "#92400e" },
                    "Subcontractor":    { bg: "#f5f3ff", border: "#ddd6fe", text: "#6d28d9" },
                    "Event / Temporary":{ bg: "#f0fdf4", border: "#bbf7d0", text: "#166534" },
                  };
                  const ltStyle = ltColors[site.locationType] || { bg: "#f8fafc", border: "#e2e8f0", text: "#475569" };
                  return (
                    <div key={site.key} style={{
                      background: "#fff", borderRadius: 15, overflow: "hidden",
                      border: "1.5px solid #f1f5f9",
                      boxShadow: idx === 0 ? "0 5px 18px rgba(42,41,92,0.09)" : "0 1px 5px rgba(0,0,0,0.04)"
                    }}>
                      {idx === 0 && <div style={{ height: 3, background: NAVY }} />}

                      <div style={{ padding: "0.85rem 0.95rem" }}>
                        {/* Row 1: rank + name + pass rate badge */}
                        <div style={{ display: "flex", alignItems: "flex-start", gap: "0.5rem", marginBottom: "0.45rem" }}>
                          <div style={{
                            width: 32, height: 32, borderRadius: 9, flexShrink: 0,
                            background: idx === 0 ? NAVY : "#f1f5f9",
                            display: "flex", alignItems: "center", justifyContent: "center",
                            fontSize: "0.8rem", fontWeight: 900, color: idx === 0 ? "#fff" : "#94a3b8"
                          }}>#{idx + 1}</div>

                          <div style={{ flex: 1, minWidth: 0 }}>
                            {/* Site name + unit number badge */}
                            <div style={{ display: "flex", alignItems: "center", gap: "0.35rem", flexWrap: "wrap" }}>
                              <span style={{ fontWeight: 800, fontSize: "0.88rem", color: "#0f172a" }}>
                                {site.siteName}
                              </span>
                              {site.unitNum && (
                                <span style={{
                                  background: NAVY, color: "#fff", borderRadius: 5,
                                  padding: "0.05rem 0.4rem", fontSize: "0.65rem", fontWeight: 800,
                                  letterSpacing: "0.01em", flexShrink: 0
                                }}>#{site.unitNum}</span>
                              )}
                              {site.floor && (
                                <span style={{
                                  background: "#f1f5f9", color: "#475569", borderRadius: 5,
                                  padding: "0.05rem 0.38rem", fontSize: "0.62rem", fontWeight: 700, flexShrink: 0
                                }}>Floor {site.floor}</span>
                              )}
                            </div>
                            {/* Subtitle: stats + last date */}
                            <div style={{ fontSize: "0.68rem", color: "#94a3b8", marginTop: "0.06rem" }}>
                              {site.total} inspection{site.total !== 1 ? "s" : ""}
                              {site.avgSec ? ` · avg ${fmtDur(site.avgSec)}` : ""}
                              {site.lastDate ? ` · last ${site.lastDate.slice(0, 10)}` : ""}
                            </div>
                          </div>

                          <div style={{
                            flexShrink: 0, minWidth: 44, textAlign: "center",
                            background: prColor + "18", borderRadius: 10,
                            padding: "0.3rem 0.45rem",
                            border: `1.5px solid ${prColor}30`
                          }}>
                            <div style={{ fontSize: "0.95rem", fontWeight: 900, color: prColor, lineHeight: 1 }}>{pr}%</div>
                            <div style={{ fontSize: "0.48rem", color: prColor, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.04em", opacity: 0.75 }}>pass</div>
                          </div>
                        </div>

                        {/* locationType + eventName meta row */}
                        {(site.locationType || site.eventName || site.restaurantLicense || site.sitePhone) && (
                          <div style={{ display: "flex", flexWrap: "wrap", gap: "0.28rem", marginBottom: "0.45rem" }}>
                            {site.locationType && (
                              <span style={{
                                background: ltStyle.bg, border: `1px solid ${ltStyle.border}`,
                                borderRadius: 5, padding: "0.07rem 0.42rem",
                                fontSize: "0.62rem", color: ltStyle.text, fontWeight: 700
                              }}>{site.locationType}</span>
                            )}
                            {site.eventName && (
                              <span style={{
                                background: "#f0fdf4", border: "1px solid #bbf7d0",
                                borderRadius: 5, padding: "0.07rem 0.42rem",
                                fontSize: "0.62rem", color: "#166534", fontWeight: 600
                              }}>🎪 {site.eventName}</span>
                            )}
                            {site.restaurantLicense && (
                              <span style={{
                                background: "#f8fafc", border: "1px solid #e2e8f0",
                                borderRadius: 5, padding: "0.07rem 0.42rem",
                                fontSize: "0.62rem", color: "#64748b", fontWeight: 600
                              }}>Lic: {site.restaurantLicense}</span>
                            )}
                            {site.sitePhone && (
                              <span style={{
                                background: "#f8fafc", border: "1px solid #e2e8f0",
                                borderRadius: 5, padding: "0.07rem 0.42rem",
                                fontSize: "0.62rem", color: "#64748b", fontWeight: 600
                              }}>📞 {site.sitePhone}</span>
                            )}
                          </div>
                        )}

                        {/* Pass rate bar */}
                        <div style={{ height: 5, background: "#f1f5f9", borderRadius: 99, marginBottom: "0.5rem" }}>
                          <div style={{ height: "100%", width: `${pr}%`, borderRadius: 99, background: prColor, transition: "width 0.6s ease" }} />
                        </div>

                        {/* Inspector tags + top issue tags */}
                        <div style={{ display: "flex", flexWrap: "wrap", gap: "0.25rem" }}>
                          {site.inspectors.slice(0, 3).map(name => (
                            <span key={name} style={{
                              display: "inline-flex", alignItems: "center", gap: "0.2rem",
                              background: avatarBg(name) + "18", borderRadius: 5,
                              padding: "0.1rem 0.4rem", fontSize: "0.63rem",
                              color: "#374151", fontWeight: 600, border: `1px solid ${avatarBg(name)}30`
                            }}>
                              <span style={{ width: 12, height: 12, borderRadius: 3, background: avatarBg(name), display: "inline-flex", alignItems: "center", justifyContent: "center", fontSize: "0.47rem", color: "#fff", fontWeight: 900 }}>{initials(name)}</span>
                              {name.split(" ")[0]}
                            </span>
                          ))}
                          {site.inspectors.length > 3 && (
                            <span style={{ background: "#f1f5f9", borderRadius: 5, padding: "0.1rem 0.4rem", fontSize: "0.63rem", color: "#94a3b8", fontWeight: 600 }}>+{site.inspectors.length - 3}</span>
                          )}
                          {site.topIssues.slice(0, 2).map(iss => (
                            <span key={iss.cat} style={{
                              background: "#fef3f2", border: "1px solid #fecaca", borderRadius: 5,
                              padding: "0.1rem 0.4rem", fontSize: "0.63rem", color: "#991b1b", fontWeight: 600,
                              whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", maxWidth: "45%"
                            }}>⚠ {iss.cat}</span>
                          ))}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            );
          })()}

          {/* ── TIME TAB ── */}
          {activeTab === "time" && (
            <div style={{ display: "flex", flexDirection: "column", gap: "0.65rem" }}>
              {/* info banner */}
              <div style={{
                background: "#fff", borderRadius: 11, padding: "0.6rem 0.9rem",
                border: "1.5px solid #e2e8f0", fontSize: "0.75rem", color: "#64748b",
                display: "flex", alignItems: "flex-start", gap: "0.4rem"
              }}>
                <span style={{ flexShrink: 0 }}>⏱️</span>
                <span>On-site duration — time from inspection start to report generation</span>
              </div>

              {ranking.filter(p => p.avgDurationSec).length === 0 ? (
                <div style={{ color: "#94a3b8", padding: "2.5rem 1rem", textAlign: "center", background: "#fff", borderRadius: 14, border: "1.5px dashed #e2e8f0", fontSize: "0.85rem" }}>
                  No timing data yet.
                </div>
              ) : (
                [...ranking].filter(p => p.avgDurationSec).sort((a, b) => a.avgDurationSec - b.avgDurationSec).map((p, i) => {
                  const isFastest = fastest && p.name === fastest.name;
                  const maxDur = Math.max(...ranking.filter(r => r.avgDurationSec).map(r => r.avgDurationSec));
                  const barPct = maxDur ? Math.round((p.avgDurationSec / maxDur) * 100) : 100;
                  return (
                    <div key={p.name} style={{
                      background: "#fff", borderRadius: 15, overflow: "hidden",
                      border: isFastest ? `1.5px solid ${NAVY}30` : "1.5px solid #f1f5f9",
                      boxShadow: isFastest ? "0 5px 18px rgba(42,41,92,0.1)" : "0 1px 5px rgba(0,0,0,0.04)"
                    }}>
                      {isFastest && <div style={{ height: 3, background: NAVY }} />}
                      <div style={{ display: "flex", alignItems: "center", gap: "0.7rem", padding: "0.85rem 0.9rem" }}>

                        {/* Rank */}
                        <div style={{
                          width: 34, height: 34, borderRadius: 10, flexShrink: 0,
                          background: isFastest ? NAVY : "#f1f5f9",
                          display: "flex", alignItems: "center", justifyContent: "center",
                          fontSize: "0.75rem", fontWeight: 900,
                          color: isFastest ? "#fff" : "#94a3b8"
                        }}>#{i+1}</div>

                        {/* Avatar */}
                        <div style={{
                          width: 34, height: 34, borderRadius: 10, flexShrink: 0,
                          background: avatarBg(p.name),
                          display: "flex", alignItems: "center", justifyContent: "center",
                          fontSize: "0.73rem", fontWeight: 900, color: "#fff"
                        }}>{initials(p.name)}</div>

                        {/* Info */}
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ display: "flex", alignItems: "center", gap: "0.35rem", marginBottom: "0.08rem" }}>
                            <span style={{ fontWeight: 800, color: "#0f172a", fontSize: "0.9rem", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", flex: 1, minWidth: 0 }}>{p.name}</span>
                            {isFastest && (
                              <span style={{ background: RED, color: "#fff", fontSize: "0.58rem", padding: "0.1rem 0.4rem", borderRadius: 20, fontWeight: 800, flexShrink: 0, whiteSpace: "nowrap" }}>⚡ FASTEST</span>
                            )}
                          </div>
                          <div style={{ fontSize: "0.7rem", color: "#94a3b8", marginBottom: "0.4rem" }}>
                            {p.durationCount} timed inspection{p.durationCount !== 1 ? "s" : ""}
                          </div>
                          {/* bar: wider = slower */}
                          <div style={{ height: 4, background: "#f1f5f9", borderRadius: 99 }}>
                            <div style={{ height: "100%", width: `${barPct}%`, borderRadius: 99, background: isFastest ? NAVY : "#cbd5e1", transition: "width 0.6s ease" }} />
                          </div>
                          {/* site time tags — max 2 to avoid overflow */}
                          {p.timePerSite && p.timePerSite.length > 0 && (
                            <div style={{ marginTop: "0.4rem", display: "flex", flexWrap: "wrap", gap: "0.25rem" }}>
                              {p.timePerSite.slice(0, 2).map(s => (
                                <span key={s.site} style={{ background: "#f1f5f9", border: "1px solid #e2e8f0", borderRadius: 5, padding: "0.1rem 0.4rem", fontSize: "0.67rem", color: "#475569", fontWeight: 500, maxWidth: "100%", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                                  {s.site}: {fmtDur(s.avgSec)}
                                </span>
                              ))}
                            </div>
                          )}
                        </div>

                        {/* Time chip */}
                        <div style={{
                          flexShrink: 0, minWidth: 52, textAlign: "center",
                          background: isFastest ? NAVY : "#f8fafc",
                          borderRadius: 11, padding: "0.38rem 0.45rem",
                          border: isFastest ? "none" : "1.5px solid #e8ecf0"
                        }}>
                          <div style={{ fontSize: "0.92rem", fontWeight: 900, color: isFastest ? "#fff" : "#1e293b", lineHeight: 1, whiteSpace: "nowrap" }}>{fmtDur(p.avgDurationSec)}</div>
                          <div style={{ fontSize: "0.5rem", color: isFastest ? "rgba(255,255,255,0.5)" : "#b0bec5", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.04em" }}>avg</div>
                        </div>
                      </div>
                    </div>
                  );
                })
              )}

              {/* ── Submission turnaround time ── */}
              {(() => {
                const withTA = ranking.filter(p => p.avgTurnaroundDays !== null);
                if (withTA.length === 0) return null;
                return (
                  <div style={{ marginTop: 8 }}>
                    <div style={{
                      background: "#fff", borderRadius: 11, padding: "0.6rem 0.9rem",
                      border: "1.5px solid #e2e8f0", fontSize: "0.75rem", color: "#64748b",
                      display: "flex", alignItems: "flex-start", gap: "0.4rem", marginBottom: "0.65rem"
                    }}>
                      <span style={{ flexShrink: 0 }}>📤</span>
                      <span>Report submission lag — days from inspection date to when the report was submitted</span>
                    </div>
                    {withTA.sort((a, b) => a.avgTurnaroundDays - b.avgTurnaroundDays).map(p => {
                      const days = p.avgTurnaroundDays;
                      const taColor = days === 0 ? "#22c55e" : days <= 1 ? "#3b82f6" : days <= 3 ? "#f59e0b" : "#ef4444";
                      const taLabel = days === 0 ? "Same day" : days <= 1 ? "Next day" : days <= 3 ? "2–3 days" : `${days}d avg`;
                      return (
                        <div key={p.name + "-ta"} style={{
                          background: "#fff", borderRadius: 15, overflow: "hidden",
                          border: "1.5px solid #f1f5f9", boxShadow: "0 1px 5px rgba(0,0,0,0.04)",
                          marginBottom: "0.55rem"
                        }}>
                          <div style={{ display: "flex", alignItems: "center", gap: "0.7rem", padding: "0.8rem 0.9rem" }}>
                            <div style={{
                              width: 36, height: 36, borderRadius: 10, flexShrink: 0,
                              background: avatarBg(p.name),
                              display: "flex", alignItems: "center", justifyContent: "center",
                              fontSize: "0.73rem", fontWeight: 900, color: "#fff"
                            }}>{initials(p.name)}</div>
                            <div style={{ flex: 1, minWidth: 0 }}>
                              <div style={{ fontWeight: 800, color: "#0f172a", fontSize: "0.88rem" }}>{p.name}</div>
                              <div style={{ fontSize: "0.68rem", color: "#94a3b8", marginTop: "0.1rem" }}>
                                {p.sameDayRate}% same-day · {p.turnaroundCount} report{p.turnaroundCount !== 1 ? "s" : ""}
                              </div>
                            </div>
                            <div style={{
                              flexShrink: 0, minWidth: 60, textAlign: "center",
                              background: taColor + "18", borderRadius: 11, padding: "0.38rem 0.45rem",
                              border: `1.5px solid ${taColor}30`
                            }}>
                              <div style={{ fontSize: "0.88rem", fontWeight: 900, color: taColor, lineHeight: 1 }}>{taLabel}</div>
                              <div style={{ fontSize: "0.5rem", color: taColor, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.04em", opacity: 0.7 }}>submit</div>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                );
              })()}

              {/* ── Inspector throughput ── */}
              {(() => {
                const withTP = ranking.filter(p => p.inspPerDay !== null && p.activeDayCount > 0);
                if (withTP.length === 0) return null;
                const maxTP = Math.max(...withTP.map(p => p.inspPerDay));
                return (
                  <div style={{ marginTop: 8 }}>
                    <div style={{
                      background: "#fff", borderRadius: 11, padding: "0.6rem 0.9rem",
                      border: "1.5px solid #e2e8f0", fontSize: "0.75rem", color: "#64748b",
                      display: "flex", alignItems: "flex-start", gap: "0.4rem", marginBottom: "0.65rem"
                    }}>
                      <span style={{ flexShrink: 0 }}>📊</span>
                      <span>Inspection throughput — reports completed per active day</span>
                    </div>
                    {withTP.sort((a, b) => b.inspPerDay - a.inspPerDay).map((p, i) => {
                      const barPct = maxTP ? Math.round((p.inspPerDay / maxTP) * 100) : 100;
                      const isTop = i === 0;
                      return (
                        <div key={p.name + "-tp"} style={{
                          background: "#fff", borderRadius: 15, overflow: "hidden",
                          border: isTop ? `1.5px solid ${NAVY}30` : "1.5px solid #f1f5f9",
                          boxShadow: isTop ? "0 5px 18px rgba(42,41,92,0.09)" : "0 1px 5px rgba(0,0,0,0.04)",
                          marginBottom: "0.55rem"
                        }}>
                          {isTop && <div style={{ height: 3, background: NAVY }} />}
                          <div style={{ display: "flex", alignItems: "center", gap: "0.7rem", padding: "0.8rem 0.9rem" }}>
                            <div style={{
                              width: 36, height: 36, borderRadius: 10, flexShrink: 0,
                              background: avatarBg(p.name),
                              display: "flex", alignItems: "center", justifyContent: "center",
                              fontSize: "0.73rem", fontWeight: 900, color: "#fff"
                            }}>{initials(p.name)}</div>
                            <div style={{ flex: 1, minWidth: 0 }}>
                              <div style={{ fontWeight: 800, color: "#0f172a", fontSize: "0.88rem" }}>{p.name}</div>
                              <div style={{ fontSize: "0.68rem", color: "#94a3b8", marginBottom: "0.35rem" }}>
                                {p.total} inspections over {p.activeDayCount} active day{p.activeDayCount !== 1 ? "s" : ""}
                              </div>
                              <div style={{ height: 4, background: "#f1f5f9", borderRadius: 99 }}>
                                <div style={{ height: "100%", width: `${barPct}%`, borderRadius: 99, background: isTop ? NAVY : "#cbd5e1", transition: "width 0.6s ease" }} />
                              </div>
                            </div>
                            <div style={{
                              flexShrink: 0, minWidth: 52, textAlign: "center",
                              background: isTop ? NAVY : "#f8fafc",
                              borderRadius: 11, padding: "0.38rem 0.45rem",
                              border: isTop ? "none" : "1.5px solid #e8ecf0"
                            }}>
                              <div style={{ fontSize: "0.92rem", fontWeight: 900, color: isTop ? "#fff" : "#1e293b", lineHeight: 1 }}>{p.inspPerDay}</div>
                              <div style={{ fontSize: "0.5rem", color: isTop ? "rgba(255,255,255,0.5)" : "#b0bec5", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.04em" }}>per day</div>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                );
              })()}

              {/* ── Site re-inspection cycle ── */}
              {(() => {
                const withRI = ranking.filter(p => p.avgReinspDays !== null);
                if (withRI.length === 0) return null;
                return (
                  <div style={{ marginTop: 8 }}>
                    <div style={{
                      background: "#fff", borderRadius: 11, padding: "0.6rem 0.9rem",
                      border: "1.5px solid #e2e8f0", fontSize: "0.75rem", color: "#64748b",
                      display: "flex", alignItems: "flex-start", gap: "0.4rem", marginBottom: "0.65rem"
                    }}>
                      <span style={{ flexShrink: 0 }}>🔄</span>
                      <span>Site re-inspection cycle — avg days between revisits to the same site</span>
                    </div>
                    {withRI.sort((a, b) => a.avgReinspDays - b.avgReinspDays).map(p => {
                      const days = p.avgReinspDays;
                      const riColor = days <= 7 ? "#22c55e" : days <= 30 ? "#3b82f6" : days <= 90 ? "#f59e0b" : "#ef4444";
                      const riLabel = days <= 7 ? "Weekly" : days <= 30 ? "Monthly" : days <= 90 ? "Quarterly" : `${days}d`;
                      return (
                        <div key={p.name + "-ri"} style={{
                          background: "#fff", borderRadius: 15, overflow: "hidden",
                          border: "1.5px solid #f1f5f9", boxShadow: "0 1px 5px rgba(0,0,0,0.04)",
                          marginBottom: "0.55rem"
                        }}>
                          <div style={{ display: "flex", alignItems: "center", gap: "0.7rem", padding: "0.8rem 0.9rem" }}>
                            <div style={{
                              width: 36, height: 36, borderRadius: 10, flexShrink: 0,
                              background: avatarBg(p.name),
                              display: "flex", alignItems: "center", justifyContent: "center",
                              fontSize: "0.73rem", fontWeight: 900, color: "#fff"
                            }}>{initials(p.name)}</div>
                            <div style={{ flex: 1, minWidth: 0 }}>
                              <div style={{ fontWeight: 800, color: "#0f172a", fontSize: "0.88rem" }}>{p.name}</div>
                              <div style={{ fontSize: "0.68rem", color: "#94a3b8", marginTop: "0.1rem" }}>
                                {p.siteReinspDetail.length} site{p.siteReinspDetail.length !== 1 ? "s" : ""} revisited
                              </div>
                              {p.siteReinspDetail.length > 0 && (
                                <div style={{ marginTop: "0.35rem", display: "flex", flexWrap: "wrap", gap: "0.25rem" }}>
                                  {p.siteReinspDetail.slice(0, 3).map(s => (
                                    <span key={s.site} style={{ background: "#f1f5f9", border: "1px solid #e2e8f0", borderRadius: 5, padding: "0.1rem 0.4rem", fontSize: "0.63rem", color: "#475569", fontWeight: 500, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", maxWidth: "100%" }}>
                                      {s.site}: every {s.avgDays}d
                                    </span>
                                  ))}
                                </div>
                              )}
                            </div>
                            <div style={{
                              flexShrink: 0, minWidth: 60, textAlign: "center",
                              background: riColor + "18", borderRadius: 11, padding: "0.38rem 0.45rem",
                              border: `1.5px solid ${riColor}30`
                            }}>
                              <div style={{ fontSize: "0.88rem", fontWeight: 900, color: riColor, lineHeight: 1 }}>{riLabel}</div>
                              <div style={{ fontSize: "0.5rem", color: riColor, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.04em", opacity: 0.7 }}>cycle</div>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                );
              })()}
            </div>
          )}

          {/* ── VERDICT TAB ── */}
          {activeTab === "verdict" && (
            <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>

              {/* Explainer banner */}
              <div style={{
                background: "#fff", borderRadius: 12, padding: "0.7rem 0.95rem",
                border: "1.5px solid #e2e8f0", display: "flex", alignItems: "flex-start", gap: "0.5rem"
              }}>
                <span style={{ flexShrink: 0, fontSize: "1.1rem", marginTop: "0.05rem" }}>⚖️</span>
                <div style={{ fontSize: "0.76rem", color: "#475569", lineHeight: 1.55 }}>
                  <span style={{ fontWeight: 700, color: "#0f172a" }}>Retention Analysis</span> — each inspector is rated across pass rate, trend, issue-finding, speed, site coverage, and recent trajectory. Use this as a starting point for reviews, not as a final decision.
                </div>
              </div>

              {ranking.map((p) => {
                const v = buildVerdict(p);
                return (
                  <div key={p.name} style={{
                    background: v.bgColor, borderRadius: 16, overflow: "hidden",
                    border: `1.5px solid ${v.borderColor}`,
                    boxShadow: "0 2px 10px rgba(0,0,0,0.05)"
                  }}>
                    {/* ── Card header: avatar + name + verdict badge ── */}
                    <div style={{
                      display: "flex", alignItems: "center", gap: "0.75rem",
                      padding: "0.9rem 0.95rem 0.7rem", borderBottom: `1px solid ${v.borderColor}`
                    }}>
                      {/* Avatar */}
                      <div style={{
                        width: 42, height: 42, borderRadius: 12, flexShrink: 0,
                        background: avatarBg(p.name),
                        display: "flex", alignItems: "center", justifyContent: "center",
                        fontSize: "0.85rem", fontWeight: 900, color: "#fff"
                      }}>{initials(p.name)}</div>

                      {/* Name + stats */}
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontWeight: 800, color: "#0f172a", fontSize: "0.92rem", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{p.name}</div>
                        <div style={{ fontSize: "0.69rem", color: "#64748b", marginTop: "0.08rem" }}>
                          {p.total} insp · {p.passRate}% pass · {p.siteCount} site{p.siteCount !== 1 ? "s" : ""}
                        </div>
                      </div>

                      {/* Verdict badge */}
                      <div style={{
                        flexShrink: 0, background: v.color, color: "#fff",
                        borderRadius: 10, padding: "0.3rem 0.5rem",
                        fontSize: "0.62rem", fontWeight: 800, textAlign: "center",
                        maxWidth: 80, lineHeight: 1.3
                      }}>
                        <div style={{ fontSize: "0.9rem", lineHeight: 1 }}>{v.emoji}</div>
                        <div style={{ marginTop: "0.15rem", letterSpacing: "0.01em" }}>
                          {v.verdict.split("—")[0].trim()}
                        </div>
                        {v.verdict.includes("—") && (
                          <div style={{ fontWeight: 600, opacity: 0.85, fontSize: "0.58rem" }}>
                            {v.verdict.split("—")[1].trim()}
                          </div>
                        )}
                      </div>
                    </div>

                    {/* ── Summary line ── */}
                    <div style={{ padding: "0.65rem 0.95rem 0.5rem", fontSize: "0.76rem", color: v.color, fontWeight: 600, lineHeight: 1.5, borderBottom: `1px solid ${v.borderColor}` }}>
                      {v.summary}
                    </div>

                    {/* ── Signals list ── */}
                    <div style={{ padding: "0.6rem 0.95rem 0.5rem" }}>
                      <div style={{ fontSize: "0.6rem", fontWeight: 800, color: "#94a3b8", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: "0.45rem" }}>Performance signals</div>
                      <div style={{ display: "flex", flexDirection: "column", gap: "0.35rem" }}>
                        {v.signals.map((s, si) => {
                          const dotColor = s.type === "positive" ? "#16a34a" : s.type === "danger" ? "#dc2626" : s.type === "warning" ? "#d97706" : "#94a3b8";
                          return (
                            <div key={si} style={{ display: "flex", gap: "0.55rem", alignItems: "flex-start" }}>
                              <div style={{ width: 7, height: 7, borderRadius: "50%", background: dotColor, flexShrink: 0, marginTop: "0.32rem" }} />
                              <div style={{ flex: 1, minWidth: 0 }}>
                                <span style={{ fontWeight: 700, fontSize: "0.76rem", color: "#1e293b" }}>{s.label}</span>
                                <span style={{ fontSize: "0.73rem", color: "#64748b", marginLeft: "0.35rem" }}>{s.detail}</span>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>

                    {/* ── Recommendations ── */}
                    {v.recommendations.length > 0 && (
                      <div style={{
                        margin: "0 0.95rem 0.75rem",
                        background: "rgba(0,0,0,0.04)", borderRadius: 10,
                        padding: "0.55rem 0.7rem",
                        borderLeft: `3px solid ${v.color}`
                      }}>
                        <div style={{ fontSize: "0.6rem", fontWeight: 800, color: v.color, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: "0.3rem" }}>Recommended actions</div>
                        {v.recommendations.map((r, ri) => (
                          <div key={ri} style={{ fontSize: "0.74rem", color: "#374151", lineHeight: 1.5, marginBottom: ri < v.recommendations.length - 1 ? "0.3rem" : 0 }}>
                            → {r}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}

              {/* Footer disclaimer */}
              <div style={{ fontSize: "0.68rem", color: "#94a3b8", textAlign: "center", padding: "0.25rem 1rem 0.5rem", lineHeight: 1.5 }}>
                Verdicts are based on inspection data only. Always consider context, site conditions, and direct observation before making employment decisions.
              </div>
            </div>
          )}

        </div>
      )}
    </div>
  );
}

/* ── Global Admin Panel ───────────────────────────────────── */
function GlobalAdminPanel({ currentUser, onBack, onManageVenue, onEnterVenue, onCreateReport }) {
  const [venues, setVenues] = useState([]);
  const [venueStats, setVenueStats] = useState({});
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState("");
  const [statsTab, setStatsTab] = useState("list"); // "overview" | "list"
  const [showAddForm, setShowAddForm] = useState(false);
  const [addId, setAddId] = useState("");
  const [addName, setAddName] = useState("");
  const [addType, setAddType] = useState("stadium");
  const [addAddress, setAddAddress] = useState("");
  const [addError, setAddError] = useState("");
  const [addLoading, setAddLoading] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [editName, setEditName] = useState("");
  const [editType, setEditType] = useState("stadium");
  const [editAddress, setEditAddress] = useState("");

  useEffect(() => {
    async function load() {
      setLoading(true);
      const list = await loadVenueRegistry();
      list.sort((a, b) => (a.name || a.id).localeCompare(b.name || b.id));
      setVenues(list);
      setLoading(false);
      // Load stats in parallel (batched to avoid Firestore limits)
      const BATCH = 20;
      for (let i = 0; i < list.length; i += BATCH) {
        const batch = list.slice(i, i + BATCH);
        const results = await Promise.all(batch.map(v => loadVenueStats(v.id).then(s => [v.id, s])));
        setVenueStats(prev => {
          const next = { ...prev };
          results.forEach(([id, s]) => { next[id] = s; });
          return next;
        });
      }
    }
    load();
  }, []);

  async function handleAddVenue(e) {
    e.preventDefault();
    setAddError("");
    const slug = addId.trim().toLowerCase().replace(/[^a-z0-9_-]/g, "");
    if (!slug) { setAddError("Enter a valid venue ID (letters, numbers, hyphens)."); return; }
    if (!addName.trim()) { setAddError("Enter a display name."); return; }
    if (venues.find(v => v.id === slug)) { setAddError("A venue with that ID already exists."); return; }
    setAddLoading(true);
    await saveVenueRecord(slug, {
      name: addName.trim(),
      type: addType,
      address: addAddress.trim() || "",
      status: "active",
      createdAt: new Date().toISOString(),
      createdBy: currentUser?.name || "admin",
    });
    const updated = await loadVenueRegistry();
    updated.sort((a, b) => (a.name || a.id).localeCompare(b.name || b.id));
    setVenues(updated);
    setAddId(""); setAddName(""); setAddType("stadium"); setAddAddress(""); setShowAddForm(false);
    setAddLoading(false);
    // Load stats for the new venue
    const stats = await loadVenueStats(slug);
    setVenueStats(prev => ({ ...prev, [slug]: stats }));
  }

  async function handleDeleteVenue(venueId, venueName) {
    if (!confirm(`Remove "${venueName}" from the registry?\n\nThis only removes the listing — all inspection data under this venue remains in Firestore.`)) return;
    await deleteVenueRecord(venueId);
    setVenues(prev => prev.filter(v => v.id !== venueId));
    setVenueStats(prev => { const n = { ...prev }; delete n[venueId]; return n; });
  }

  async function handleSaveEdit(venueId) {
    await saveVenueRecord(venueId, { name: editName.trim(), type: editType, address: editAddress.trim() });
    setVenues(prev => prev.map(v => v.id === venueId ? { ...v, name: editName.trim(), type: editType, address: editAddress.trim() } : v));
    setEditingId(null);
  }

  const filtered = filter.trim()
    ? venues.filter(v => (v.name || v.id).toLowerCase().includes(filter.trim().toLowerCase()) || v.id.includes(filter.trim().toLowerCase()))
    : venues;

  const totalInspections = Object.values(venueStats).reduce((s, v) => s + (v.inspectionCount || 0), 0);
  const totalUsers = Object.values(venueStats).reduce((s, v) => s + (v.userCount || 0), 0);
  const today = new Date().toISOString().slice(0, 10);
  const activeToday = Object.values(venueStats).filter(v => v.lastActivity && v.lastActivity.startsWith(today)).length;

  const typeIcon = { stadium: "🏟️", convention: "🏛️", arena: "🎤", building: "🏢", other: "📍" };
  const typeLabel = { stadium: "Stadium", convention: "Convention", arena: "Arena", building: "Building", other: "Other" };

  return (
    <div className="appShell">
      <header className="topBar">
        <div className="brandLeft brandClickable" onClick={onBack} title="Back">
          <img src={LOGO_WHITE} alt="Sodexo" className="brandLogo" />
          <div>
            <div className="brandTitle">Global Admin</div>
            <div className="brandSub">Manage all venues &amp; locations</div>
          </div>
        </div>
        <div className="topActions">
          <button className="btn btnGhost" onClick={onBack} type="button">Back</button>
        </div>
      </header>
      <div className="topBarSpacer" />

      <main className="pageMain pageMainNarrow">
        {/* Tabs */}
        <div style={{ display: "flex", gap: "0.5rem", marginBottom: "1rem" }}>
          {["overview", "list"].map(t => (
            <button key={t} type="button" onClick={() => setStatsTab(t)}
              style={{
                flex: 1, padding: "0.6rem 0", borderRadius: 8, border: "none",
                background: statsTab === t ? "#2A295C" : "#e2e8f0",
                color: statsTab === t ? "#fff" : "#475569",
                fontWeight: 600, fontSize: "0.88rem", cursor: "pointer",
              }}>
              {t === "overview" ? "📊 Overview" : "🗺️ Venue List"}
            </button>
          ))}
        </div>

        {statsTab === "overview" && (
          <div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.75rem", marginBottom: "1.25rem" }}>
              {[
                { label: "Total Venues", value: venues.length, icon: "🏟️" },
                { label: "Total Inspections", value: loading ? "—" : totalInspections.toLocaleString(), icon: "📋" },
                { label: "Total Users", value: loading ? "—" : totalUsers, icon: "👤" },
                { label: "Active Today", value: loading ? "—" : activeToday, icon: "✅" },
              ].map(({ label, value, icon }) => (
                <div key={label} style={{
                  background: "#fff", borderRadius: 10, padding: "1rem", textAlign: "center",
                  boxShadow: "0 1px 4px rgba(0,0,0,0.08)"
                }}>
                  <div style={{ fontSize: "1.5rem", marginBottom: "0.25rem" }}>{icon}</div>
                  <div style={{ fontSize: "1.4rem", fontWeight: 700, color: "#1e1b4b" }}>{value}</div>
                  <div style={{ fontSize: "0.75rem", color: "#64748b" }}>{label}</div>
                </div>
              ))}
            </div>
            {loading && <div style={{ textAlign: "center", color: "#94a3b8", padding: "1rem" }}>Loading venue stats…</div>}
            {!loading && venues.length === 0 && (
              <div style={{ textAlign: "center", color: "#94a3b8", padding: "2rem" }}>
                No venues registered yet.<br />
                <button type="button" onClick={() => { setStatsTab("list"); setShowAddForm(true); }}
                  style={{ marginTop: "0.75rem", background: "#2A295C", color: "#fff", border: "none", borderRadius: 8, padding: "0.6rem 1.25rem", fontWeight: 600, cursor: "pointer" }}>
                  + Add First Venue
                </button>
              </div>
            )}
            {/* Top venues by activity */}
            {!loading && venues.length > 0 && (
              <div>
                <div style={{ fontWeight: 700, fontSize: "0.9rem", color: "#1e1b4b", marginBottom: "0.5rem" }}>Top Venues by Inspections</div>
                {[...venues]
                  .sort((a, b) => ((venueStats[b.id]?.inspectionCount || 0) - (venueStats[a.id]?.inspectionCount || 0)))
                  .slice(0, 5)
                  .map(v => {
                    const s = venueStats[v.id] || {};
                    return (
                      <div key={v.id} style={{ display: "flex", alignItems: "center", gap: "0.75rem", padding: "0.6rem 0", borderBottom: "1px solid #f1f5f9" }}>
                        <span style={{ fontSize: "1.1rem" }}>{typeIcon[v.type] || "📍"}</span>
                        <span style={{ flex: 1, fontWeight: 600, fontSize: "0.9rem", color: "#1e1b4b" }}>{v.name || v.id}</span>
                        <span style={{ fontSize: "0.82rem", color: "#64748b" }}>📋 {s.inspectionCount || 0}</span>
                        <span style={{ fontSize: "0.82rem", color: "#64748b" }}>👤 {s.userCount || 0}</span>
                      </div>
                    );
                  })}
              </div>
            )}
          </div>
        )}

        {statsTab === "list" && (
          <div>
            {/* Search + Add */}
            <div style={{ display: "flex", gap: "0.5rem", marginBottom: "1rem" }}>
              <input
                value={filter} onChange={e => setFilter(e.target.value)}
                placeholder="🔍 Search venues…"
                style={{ flex: 1, padding: "0.6rem 0.75rem", borderRadius: 8, border: "1.5px solid #e2e8f0", fontSize: "0.9rem" }}
              />
              <button type="button" onClick={() => setShowAddForm(v => !v)}
                style={{ padding: "0.6rem 1rem", borderRadius: 8, border: "none", background: "#2A295C", color: "#fff", fontWeight: 700, cursor: "pointer", whiteSpace: "nowrap" }}>
                {showAddForm ? "✕ Cancel" : "+ Add Venue"}
              </button>
            </div>

            {/* Add Venue Form */}
            {showAddForm && (
              <form onSubmit={handleAddVenue} style={{ background: "#f8fafc", border: "1.5px solid #e2e8f0", borderRadius: 10, padding: "1rem", marginBottom: "1rem" }}>
                <div style={{ fontWeight: 700, marginBottom: "0.75rem", color: "#1e1b4b" }}>Add New Venue</div>
                {addError && <div style={{ background: "#fee2e2", color: "#991b1b", borderRadius: 6, padding: "0.5rem 0.75rem", marginBottom: "0.5rem", fontSize: "0.85rem" }}>{addError}</div>}
                <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
                  <input value={addId} onChange={e => setAddId(e.target.value.toLowerCase().replace(/[^a-z0-9_-]/g, ""))}
                    placeholder="Venue ID (slug, e.g. hard-rock-stadium)" required
                    style={{ padding: "0.55rem 0.75rem", borderRadius: 7, border: "1.5px solid #e2e8f0", fontSize: "0.9rem" }} />
                  <input value={addName} onChange={e => setAddName(e.target.value)}
                    placeholder="Display Name (e.g. Hard Rock Stadium)" required
                    style={{ padding: "0.55rem 0.75rem", borderRadius: 7, border: "1.5px solid #e2e8f0", fontSize: "0.9rem" }} />
                  <select value={addType} onChange={e => setAddType(e.target.value)}
                    style={{ padding: "0.55rem 0.75rem", borderRadius: 7, border: "1.5px solid #e2e8f0", fontSize: "0.9rem", background: "#fff" }}>
                    <option value="stadium">🏟️ Stadium</option>
                    <option value="convention">🏛️ Convention Center</option>
                    <option value="arena">🎤 Arena</option>
                    <option value="building">🏢 Building</option>
                    <option value="other">📍 Other</option>
                  </select>
                  <input value={addAddress} onChange={e => setAddAddress(e.target.value)}
                    placeholder="Address (optional)"
                    style={{ padding: "0.55rem 0.75rem", borderRadius: 7, border: "1.5px solid #e2e8f0", fontSize: "0.9rem" }} />
                  <button type="submit" disabled={addLoading}
                    style={{ padding: "0.6rem", borderRadius: 7, border: "none", background: "#2A295C", color: "#fff", fontWeight: 700, cursor: "pointer" }}>
                    {addLoading ? "Adding…" : "Add Venue"}
                  </button>
                </div>
              </form>
            )}

            {loading && <div style={{ textAlign: "center", color: "#94a3b8", padding: "2rem" }}>Loading venues…</div>}
            {!loading && venues.length === 0 && (
              <div style={{ textAlign: "center", color: "#94a3b8", padding: "2rem" }}>
                No venues yet. Click "+ Add Venue" to create the first one.
              </div>
            )}

            {filtered.map(v => {
              const s = venueStats[v.id] || {};
              const isEditing = editingId === v.id;
              return (
                <div key={v.id} style={{
                  background: "#fff", borderRadius: 10, border: "1.5px solid #e2e8f0",
                  marginBottom: "0.75rem", overflow: "hidden"
                }}>
                  {/* Header */}
                  <div style={{ padding: "0.75rem 1rem 0.5rem", borderBottom: "1px solid #f1f5f9" }}>
                    {isEditing ? (
                      <div style={{ display: "flex", flexDirection: "column", gap: "0.4rem" }}>
                        <input value={editName} onChange={e => setEditName(e.target.value)}
                          placeholder="Display Name" style={{ padding: "0.45rem 0.65rem", borderRadius: 6, border: "1.5px solid #e2e8f0", fontSize: "0.9rem" }} />
                        <select value={editType} onChange={e => setEditType(e.target.value)}
                          style={{ padding: "0.45rem 0.65rem", borderRadius: 6, border: "1.5px solid #e2e8f0", fontSize: "0.9rem", background: "#fff" }}>
                          <option value="stadium">🏟️ Stadium</option>
                          <option value="convention">🏛️ Convention Center</option>
                          <option value="arena">🎤 Arena</option>
                          <option value="building">🏢 Building</option>
                          <option value="other">📍 Other</option>
                        </select>
                        <input value={editAddress} onChange={e => setEditAddress(e.target.value)}
                          placeholder="Address (optional)" style={{ padding: "0.45rem 0.65rem", borderRadius: 6, border: "1.5px solid #e2e8f0", fontSize: "0.9rem" }} />
                        <div style={{ display: "flex", gap: "0.4rem" }}>
                          <button type="button" onClick={() => handleSaveEdit(v.id)}
                            style={{ flex: 1, padding: "0.4rem", borderRadius: 6, border: "none", background: "#2A295C", color: "#fff", fontWeight: 600, cursor: "pointer", fontSize: "0.85rem" }}>Save</button>
                          <button type="button" onClick={() => setEditingId(null)}
                            style={{ flex: 1, padding: "0.4rem", borderRadius: 6, border: "1.5px solid #e2e8f0", background: "#fff", color: "#64748b", fontWeight: 600, cursor: "pointer", fontSize: "0.85rem" }}>Cancel</button>
                        </div>
                      </div>
                    ) : (
                      <div style={{ display: "flex", alignItems: "center", gap: "0.6rem" }}>
                        <span style={{ fontSize: "1.2rem" }}>{typeIcon[v.type] || "📍"}</span>
                        <div style={{ flex: 1 }}>
                          <div style={{ fontWeight: 700, fontSize: "0.95rem", color: "#1e1b4b" }}>{v.name || v.id}</div>
                          <div style={{ fontSize: "0.75rem", color: "#94a3b8", marginTop: 1 }}>
                            {typeLabel[v.type] || v.type} · <code style={{ fontSize: "0.72rem" }}>{v.id}</code>
                            {v.address && ` · ${v.address}`}
                          </div>
                        </div>
                        <span style={{
                          padding: "0.2rem 0.5rem", borderRadius: 6, fontSize: "0.7rem", fontWeight: 700,
                          background: v.status === "active" ? "#dcfce7" : "#f1f5f9",
                          color: v.status === "active" ? "#15803d" : "#64748b",
                        }}>{v.status || "active"}</span>
                      </div>
                    )}
                  </div>

                  {/* Stats */}
                  {!isEditing && (
                    <div style={{ display: "flex", gap: "1rem", padding: "0.5rem 1rem", background: "#f8fafc", borderBottom: "1px solid #f1f5f9" }}>
                      <span style={{ fontSize: "0.82rem", color: "#475569" }}>📋 {s.inspectionCount ?? "—"} inspections</span>
                      <span style={{ fontSize: "0.82rem", color: "#475569" }}>👤 {s.userCount ?? "—"} users</span>
                      {s.lastActivity && (
                        <span style={{ fontSize: "0.78rem", color: "#94a3b8" }}>Last: {s.lastActivity.slice(0, 10)}</span>
                      )}
                    </div>
                  )}

                  {/* Actions */}
                  {!isEditing && (
                    <div style={{ display: "flex", flexDirection: "column", gap: "0.4rem", padding: "0.6rem 1rem" }}>
                      {/* Primary actions */}
                      <div style={{ display: "flex", gap: "0.4rem" }}>
                        <button type="button"
                          onClick={() => onEnterVenue && onEnterVenue(v.id, v.name || v.id)}
                          style={{ flex: 1, padding: "0.5rem 0.75rem", borderRadius: 6, border: "none", background: "#2A295C", color: "#fff", fontWeight: 700, cursor: "pointer", fontSize: "0.85rem" }}>
                          🏠 Enter Venue
                        </button>
                      </div>
                      {/* Secondary actions */}
                      <div style={{ display: "flex", flexWrap: "wrap", gap: "0.4rem" }}>
                        <button type="button"
                          onClick={() => onManageVenue && onManageVenue(v.id, v.name || v.id)}
                          style={{ padding: "0.35rem 0.65rem", borderRadius: 6, border: "1.5px solid #2A295C", background: "#fff", color: "#2A295C", fontWeight: 600, cursor: "pointer", fontSize: "0.78rem" }}>
                          👥 Manage Users
                        </button>
                        <button type="button"
                          onClick={() => window.open(window.location.origin + "/Claude/?v=" + v.id + "&vname=" + encodeURIComponent(v.name || v.id), "_blank")}
                          style={{ padding: "0.35rem 0.65rem", borderRadius: 6, border: "1.5px solid #e2e8f0", background: "#fff", color: "#475569", fontWeight: 600, cursor: "pointer", fontSize: "0.78rem" }}>
                          Open ↗
                        </button>
                        <button type="button"
                          onClick={() => { setEditingId(v.id); setEditName(v.name || ""); setEditType(v.type || "stadium"); setEditAddress(v.address || ""); }}
                          style={{ padding: "0.35rem 0.65rem", borderRadius: 6, border: "1.5px solid #e2e8f0", background: "#fff", color: "#64748b", fontWeight: 600, cursor: "pointer", fontSize: "0.78rem" }}>
                          Edit
                        </button>
                        <button type="button"
                          onClick={() => handleDeleteVenue(v.id, v.name || v.id)}
                          style={{ padding: "0.35rem 0.65rem", borderRadius: 6, border: "1.5px solid #fca5a5", background: "#fff", color: "#dc2626", fontWeight: 600, cursor: "pointer", fontSize: "0.78rem" }}>
                          Remove
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
            {!loading && filtered.length === 0 && venues.length > 0 && (
              <div style={{ textAlign: "center", color: "#94a3b8", padding: "1.5rem" }}>No venues match your search.</div>
            )}
          </div>
        )}
      </main>
    </div>
  );
}

/* ── Admin Panel ──────────────────────────────────────────── */
function AdminPanel({ currentUser, onBack, onNavigate, managedVenueId, managedVenueName }) {
  const [users, setUsers] = useState([]);
  const [showAddForm, setShowAddForm] = useState(false);
  const [addBadge, setAddBadge] = useState("");
  const [addName, setAddName] = useState("");
  const [addDept, setAddDept] = useState("");
  const [addRole, setAddRole] = useState("inspector");
  const [addLocation, setAddLocation] = useState("");
  const [addError, setAddError] = useState("");
  const [addSuccess, setAddSuccess] = useState("");
  const [addLoading, setAddLoading] = useState(false);
  const [editingManagerLoc, setEditingManagerLoc] = useState(null); // { badgeHash, value }

  // Load users on mount + auto-refresh every 10s
  useEffect(() => {
    getUsers().then(setUsers);
    const iv = setInterval(() => { getUsers().then(setUsers); }, 10000);
    return () => clearInterval(iv);
  }, []);

  async function refresh() { setUsers(await getUsers()); }

  async function handleApprove(badgeHash) { await approveUser(badgeHash); await refresh(); }

  async function handleDeny(badgeHash) {
    if (!confirm("Remove this access request?")) return;
    await denyUser(badgeHash); await refresh();
  }

  async function handlePromote(badgeHash) { await promoteToAdmin(badgeHash); await refresh(); }

  async function handleDemote(badgeHash) { await demoteToInspector(badgeHash); await refresh(); }

  async function handleSetManager(badgeHash, location) {
    await setAsLocationManager(badgeHash, location);
    setEditingManagerLoc(null);
    await refresh();
  }

  async function handleDemoteManager(badgeHash) {
    await demoteToInspectorFromManager(badgeHash);
    await refresh();
  }

  async function handleRemove(badgeHash) {
    if (!confirm("Remove this user? They will need to request access again.")) return;
    await denyUser(badgeHash); await refresh();
  }

  async function handleAddUser(e) {
    e.preventDefault();
    setAddError(""); setAddSuccess(""); setAddLoading(true);
    try {
      if (addBadge.trim().length < 3) { setAddError("Badge number must be at least 3 characters."); return; }
      if ((addRole === "location_manager" || addRole === "guest") && !addLocation.trim()) {
        setAddError("Please enter the assigned location for this role.");
        return;
      }
      const result = await adminAddUser(addBadge.trim(), addName.trim(), addDept.trim(), addRole, addLocation.trim() || undefined);
      if (result.ok) {
        const roleLabel = addRole === "admin" ? "Admin" : addRole === "location_manager" ? "Location Manager" : addRole === "guest" ? "Guest Inspector" : "Inspector";
        setAddSuccess(`${addName.trim()} added as ${roleLabel}${addLocation.trim() ? ` — ${addLocation.trim()}` : ""}.`);
        setAddBadge(""); setAddName(""); setAddDept(""); setAddRole("inspector"); setAddLocation("");
        await refresh();
        setTimeout(() => setAddSuccess(""), 3000);
      } else if (result.reason === "exists") {
        setAddError("This badge number is already registered.");
      }
    } catch { setAddError("Failed to add user. Try again."); }
    finally { setAddLoading(false); }
  }

  const pending = users.filter(u => !u.approved);
  const approved = users.filter(u => u.approved);
  const adminCount = users.filter(u => u.role === "admin" && u.approved).length;
  const managers = approved.filter(u => u.role === "location_manager");
  const guests = approved.filter(u => u.role === "guest");

  return (
    <div className="appShell">
      <header className="topBar">
        <div className="brandLeft brandClickable" onClick={onBack} title="Back to Inspector">
          <img src={LOGO_WHITE} alt="Sodexo" className="brandLogo" />
          <div>
            <div className="brandTitle">Admin Panel</div>
            <div className="brandSub">Manage user access &amp; permissions</div>
          </div>
        </div>
        <div className="topActions">
          <button className="btn btnGhost" onClick={onBack} type="button">Back to Inspector</button>
        </div>
      </header>
      <div className="topBarSpacer" />

      <main className="pageMain pageMainNarrow">
        {managedVenueId && (
          <div style={{ background: "#fef3c7", border: "1px solid #f59e0b", borderRadius: 8, padding: "0.75rem 1rem", marginBottom: "1rem", color: "#92400e", fontWeight: 600, fontSize: "0.9rem" }}>
            ⚠️ Managing venue: <strong>{managedVenueName || managedVenueId}</strong>
            <br /><span style={{ fontWeight: 400, fontSize: "0.8rem" }}>You are viewing data for this venue, not your home venue.</span>
          </div>
        )}
        {/* Performance Dashboard shortcut */}
        <button
          type="button"
          onClick={() => onNavigate && onNavigate("performance")}
          style={{
            width: "100%", marginBottom: "1rem", padding: "1rem 1.25rem",
            background: "linear-gradient(135deg, #1e3a5f 0%, #0f2744 100%)",
            border: "1px solid #2563eb55", borderRadius: "10px",
            color: "#fff", cursor: "pointer", display: "flex", alignItems: "center", gap: "0.75rem",
            textAlign: "left",
          }}
        >
          <span style={{ fontSize: "1.5rem" }}>📊</span>
          <div>
            <div style={{ fontWeight: 700, fontSize: "0.95rem" }}>Performance Dashboard</div>
            <div style={{ fontSize: "0.78rem", color: "#93c5fd", marginTop: "0.1rem" }}>
              Inspector rankings · Time tracking · Best inspector
            </div>
          </div>
          <span style={{ marginLeft: "auto", color: "#93c5fd", fontSize: "1.1rem" }}>→</span>
        </button>

        {/* Add User */}
        <div className="card adminCard" style={{ marginBottom: 24 }}>
          <div className="cardHeader">
            <div className="cardTitle">Add New User</div>
            <button className="btn btnGhost btnSmall" type="button" onClick={() => { setShowAddForm(!showAddForm); setAddError(""); setAddSuccess(""); }}>
              {showAddForm ? "Cancel" : "+ Add User"}
            </button>
          </div>
          {showAddForm && (
            <div className="cardBody">
              <form onSubmit={handleAddUser} className="addUserForm">
                <div className="fieldGrid">
                  <label className="field">
                    <span className="fieldLabel">Badge Number</span>
                    <input className="input" type="password" value={addBadge} onChange={e => setAddBadge(e.target.value)} placeholder="Enter badge #" autoComplete="off" />
                  </label>
                  <label className="field">
                    <span className="fieldLabel">Full Name</span>
                    <input className="input" value={addName} onChange={e => setAddName(e.target.value)} placeholder="e.g., Jane Smith" />
                  </label>
                  <label className="field">
                    <span className="fieldLabel">Department</span>
                    <input className="input" value={addDept} onChange={e => setAddDept(e.target.value)} placeholder="e.g., Safety Inspector" />
                  </label>
                  <label className="field">
                    <span className="fieldLabel">Role</span>
                    <select className="select" value={addRole} onChange={e => { setAddRole(e.target.value); setAddLocation(""); }}>
                      <option value="inspector">Inspector</option>
                      <option value="admin">Admin</option>
                      <option value="location_manager">Location Manager</option>
                      <option value="guest">Guest Inspector</option>
                    </select>
                  </label>
                  {(addRole === "location_manager" || addRole === "guest") && (
                    <label className="field">
                      <span className="fieldLabel">Assigned Location</span>
                      <input className="input" value={addLocation} onChange={e => setAddLocation(e.target.value)} placeholder="e.g., Hard Rock Stadium Kitchen" />
                    </label>
                  )}
                </div>
                {addError && <div className="pinError" style={{ marginTop: 8 }}>{addError}</div>}
                {addSuccess && <div className="addUserSuccess">{addSuccess}</div>}
                <button className="btn btnPrimary" type="submit" style={{ marginTop: 12 }}
                  disabled={addLoading || addBadge.trim().length < 3 || !addName.trim() || !addDept.trim()}>
                  {addLoading ? "Adding..." : `Add as ${addRole === "admin" ? "Admin" : addRole === "location_manager" ? "Location Manager" : addRole === "guest" ? "Guest Inspector" : "Inspector"}`}
                </button>
              </form>
            </div>
          )}
        </div>

        {/* Pending approvals */}
        {pending.length > 0 && (
          <div className="card adminCard" style={{ marginBottom: 24 }}>
            <div className="cardHeader">
              <div className="cardTitle">
                Pending Approvals
                <span className="adminCount">{pending.length}</span>
              </div>
            </div>
            <div className="cardBody">
              {pending.map(u => (
                <div className="adminUserRow" key={u.badgeHash}>
                  <div className="adminUserInfo">
                    <div className="adminUserName">{u.name} {u.badgeDisplay && <span className="badgeNumDisplay">Badge: {u.badgeDisplay}</span>}</div>
                    <div className="adminUserMeta">{u.department} &middot; Requested {new Date(u.registeredAt).toLocaleDateString()}</div>
                  </div>
                  <div className="adminUserActions">
                    <button className="btn btnPrimary btnSmall" onClick={() => handleApprove(u.badgeHash)}>Approve</button>
                    <button className="btn btnGhost btnSmall adminDenyBtn" onClick={() => handleDeny(u.badgeHash)}>Deny</button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Location Managers */}
        {managers.length > 0 && (
          <div className="card adminCard" style={{ marginBottom: 24 }}>
            <div className="cardHeader">
              <div className="cardTitle">
                📍 Location Managers
                <span className="adminCount">{managers.length}</span>
              </div>
            </div>
            <div className="cardBody">
              {managers.map(u => {
                const isSelf = u.badgeHash === currentUser?.badgeHash;
                const myGuests = guests.filter(g => g.assignedBy === u.badgeHash || g.assignedLocation === u.assignedLocation);
                return (
                  <div className="adminUserRow" key={u.badgeHash} style={{ flexWrap: "wrap", gap: 8 }}>
                    <div className="adminUserInfo" style={{ flexBasis: "100%" }}>
                      <div className="adminUserName">
                        {u.name}
                        <span className="roleBadge managerRoleBadge">Manager</span>
                        {isSelf && <span className="roleBadge youRoleBadge">You</span>}
                        {u.badgeDisplay && <span className="badgeNumDisplay">Badge: {u.badgeDisplay}</span>}
                      </div>
                      <div className="adminUserMeta">
                        📍 {u.assignedLocation || "No location set"} &middot; {u.department}
                        {myGuests.length > 0 && <span style={{ marginLeft: 8, color: "#2563eb", fontWeight: 600 }}>{myGuests.length} guest{myGuests.length !== 1 ? "s" : ""}</span>}
                      </div>
                    </div>
                    <div className="adminUserActions">
                      <button className="btn btnGhost btnSmall" onClick={() => handleDemoteManager(u.badgeHash)}>Remove Manager</button>
                      {!isSelf && <button className="btn btnGhost btnSmall adminDenyBtn" onClick={() => handleRemove(u.badgeHash)}>Remove</button>}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Guest Inspectors */}
        {guests.length > 0 && (
          <div className="card adminCard" style={{ marginBottom: 24 }}>
            <div className="cardHeader">
              <div className="cardTitle">
                👤 Guest Inspectors
                <span className="adminCount">{guests.length}</span>
              </div>
            </div>
            <div className="cardBody">
              {guests.map(u => {
                const manager = users.find(m => m.badgeHash === u.assignedBy);
                return (
                  <div className="adminUserRow" key={u.badgeHash}>
                    <div className="adminUserInfo">
                      <div className="adminUserName">
                        {u.name}
                        <span className="roleBadge guestRoleBadge">Guest</span>
                        {u.badgeDisplay && <span className="badgeNumDisplay">Badge: {u.badgeDisplay}</span>}
                      </div>
                      <div className="adminUserMeta">
                        📍 {u.assignedLocation || "—"} &middot; {u.department}
                        {manager && <span style={{ marginLeft: 6 }}>· via {manager.name}</span>}
                      </div>
                    </div>
                    <div className="adminUserActions">
                      <button className="btn btnGhost btnSmall adminDenyBtn" onClick={() => handleRemove(u.badgeHash)}>Remove</button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Approved users */}
        <div className="card adminCard">
          <div className="cardHeader">
            <div className="cardTitle">
              Team Members
              <span className="adminCount">{approved.filter(u => u.role === "inspector" || u.role === "admin").length}</span>
            </div>
          </div>
          <div className="cardBody">
            {approved.filter(u => u.role === "inspector" || u.role === "admin").length === 0 ? (
              <div className="emptyState">
                <div className="emptyTitle">No approved users</div>
              </div>
            ) : approved.filter(u => u.role === "inspector" || u.role === "admin").map(u => {
              const isSelf = u.badgeHash === currentUser?.badgeHash;
              const isOnlyAdmin = u.role === "admin" && adminCount <= 1;
              const isEditingLoc = editingManagerLoc?.badgeHash === u.badgeHash;
              return (
                <div className="adminUserRow" key={u.badgeHash} style={{ flexWrap: "wrap", gap: 8 }}>
                  <div className="adminUserInfo">
                    <div className="adminUserName">
                      {u.name}
                      {u.role === "admin" && <span className="roleBadge adminRoleBadge">Admin</span>}
                      {u.role === "inspector" && <span className="roleBadge inspectorRoleBadge">Inspector</span>}
                      {isSelf && <span className="roleBadge youRoleBadge">You</span>}
                      {u.badgeDisplay && <span className="badgeNumDisplay">Badge: {u.badgeDisplay}</span>}
                    </div>
                    <div className="adminUserMeta">{u.department} &middot; Since {new Date(u.registeredAt).toLocaleDateString()}</div>
                  </div>
                  {isEditingLoc && (
                    <div style={{ flexBasis: "100%", display: "flex", gap: 8, alignItems: "center" }}>
                      <input className="input" style={{ flex: 1, fontSize: "0.85rem" }}
                        value={editingManagerLoc.value}
                        onChange={e => setEditingManagerLoc({ ...editingManagerLoc, value: e.target.value })}
                        placeholder="Location name, e.g., Hard Rock Stadium" autoFocus />
                      <button className="btn btnPrimary btnSmall" onClick={() => handleSetManager(u.badgeHash, editingManagerLoc.value)} disabled={!editingManagerLoc.value.trim()}>Assign</button>
                      <button className="btn btnGhost btnSmall" onClick={() => setEditingManagerLoc(null)}>Cancel</button>
                    </div>
                  )}
                  <div className="adminUserActions">
                    {u.role === "inspector" && !isEditingLoc && (
                      <>
                        <button className="btn btnGhost btnSmall" onClick={() => handlePromote(u.badgeHash)}>Make Admin</button>
                        <button className="btn btnGhost btnSmall" onClick={() => setEditingManagerLoc({ badgeHash: u.badgeHash, value: "" })} title="Make them a location manager">📍 Manager</button>
                      </>
                    )}
                    {u.role === "admin" && !isOnlyAdmin && !isSelf && (
                      <button className="btn btnGhost btnSmall" onClick={() => handleDemote(u.badgeHash)}>Remove Admin</button>
                    )}
                    {!isSelf && (
                      <button className="btn btnGhost btnSmall adminDenyBtn" onClick={() => handleRemove(u.badgeHash)}>Remove</button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </main>

      <footer className="footer">
        <img src={LOGO_WHITE} alt="Sodexo" className="footerLogo" />
        <span>{FIREBASE_ON ? "\u2601\uFE0F User accounts synced to cloud database." : "User accounts are stored locally on this device."}</span>
      </footer>
    </div>
  );
}

function PhotoStrip({ photos, onRemove, onTag }) {
  const [lightboxSrc, setLightboxSrc] = React.useState(null);
  if (!photos?.length) return null;
  return (
    <>
    {lightboxSrc && (
      <div onClick={() => setLightboxSrc(null)} style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.9)",zIndex:9999,display:"flex",alignItems:"center",justifyContent:"center",cursor:"zoom-out"}}>
        <img src={lightboxSrc} alt="Full size photo" style={{maxWidth:"95vw",maxHeight:"95vh",objectFit:"contain",borderRadius:8,boxShadow:"0 4px 32px rgba(0,0,0,0.5)"}} />
        <button onClick={() => setLightboxSrc(null)} style={{position:"absolute",top:16,right:16,background:"rgba(255,255,255,0.15)",border:"none",color:"#fff",fontSize:28,width:44,height:44,borderRadius:"50%",cursor:"pointer",lineHeight:1}}>×</button>
      </div>
    )}
    <div className="photoStrip">
      {photos.map((p) => (
        <div className="photoThumbWrap" key={p.id}>
          <div className="photoThumb">
            <img src={p.previewUrl} alt={p.name} style={{cursor:"zoom-in"}} onClick={() => setLightboxSrc(p.previewUrl)} />
            <button className="thumbX" type="button" onClick={() => onRemove(p.id)} aria-label="Remove photo">×</button>
          </div>
          {onTag && (
            <div className="photoTagRow">
              <button type="button"
                className={`photoTagBtn${p.tag === "before" ? " tagBefore" : ""}`}
                onClick={() => onTag(p.id, p.tag === "before" ? "" : "before")}>B</button>
              <button type="button"
                className={`photoTagBtn${p.tag === "after" ? " tagAfter" : ""}`}
                onClick={() => onTag(p.id, p.tag === "after" ? "" : "after")}>A</button>
            </div>
          )}
        </div>
      ))}
    </div>
    </>
  );
}

function GuideSection({ title, items, inspection, setInspection, allowCustom, sectionKey, coldEquipmentMap, maintenanceItems, emptyHint, inspectionId, onError }) {
  const fileRefs = useRef({});
  const [newItemName, setNewItemName] = useState("");
  const [newMaintName, setNewMaintName] = useState("");
  const [open, setOpen] = useState(false);
  const [expandedDetails, setExpandedDetails] = useState({});
  const toggleDetails = (key) => setExpandedDetails(p => ({ ...p, [key]: !p[key] }));

  async function addPhotos(pathKey, files, existingCount = 0) {
    const remaining = PHOTO_LIMIT - existingCount;
    if (remaining <= 0) return;
    const accepted = Array.from(files || []).slice(0, remaining);
    const enriched = [];
    let uploadFailCount = 0;
    const inspId = inspectionId || `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    for (const f of accepted) {
      if (!f.type.startsWith("image/")) continue;
      if (bytesToMb(f.size) > PHOTO_MAX_MB) continue;
      const thumbUrl = await compressImage(f);
      if (!thumbUrl) continue;
      const photoId = `${Date.now()}_${Math.random().toString(16).slice(2)}`;
      // Try Firebase Storage first (full-quality upload); fall back to small thumbnail base64
      let previewUrl = thumbUrl;
      if (FIREBASE_ON) {
        const storageData = await compressImage(f, 1200, 0.82);
        const storageUrl = await uploadPhoto(storageData || thumbUrl, activeVenueId, inspId, photoId);
        if (storageUrl) {
          previewUrl = storageUrl;
        } else {
          uploadFailCount++;
          // previewUrl stays as thumbnail base64 — saved in Firestore as fallback
        }
      }
      enriched.push({ id: photoId, name: f.name, sizeMb: bytesToMb(f.size), type: "image/jpeg", previewUrl, tag: "" });
    }
    if (enriched.length === 0) return;
    if (uploadFailCount > 0 && onError) {
      onError(`⚠️ ${uploadFailCount} photo${uploadFailCount > 1 ? "s" : ""} saved as low-res thumbnail (cloud upload failed). Check your internet connection. The photo${uploadFailCount > 1 ? "s" : ""} will still appear in reports.`);
    }
    setInspection((prev) => {
      const path = pathKey.split(".");
      const current = getAtPath(prev, path) || withPhotos({ status: "OK", notes: "" });
      const next = { ...current, photos: [...(current.photos || []), ...enriched].slice(0, PHOTO_LIMIT) };
      return setAtPath(prev, path, next);
    });
  }

  function removePhoto(pathKey, id) {
    setInspection((prev) => {
      const path = pathKey.split(".");
      const current = getAtPath(prev, path) || withPhotos({ status: "OK", notes: "" });
      const next = { ...current, photos: (current.photos || []).filter((p) => p.id !== id) };
      return setAtPath(prev, path, next);
    });
  }

  function tagPhoto(pathKey, id, tag) {
    setInspection((prev) => {
      const path = pathKey.split(".");
      const current = getAtPath(prev, path) || withPhotos({ status: "OK", notes: "" });
      const next = { ...current, photos: (current.photos || []).map((p) => p.id === id ? { ...p, tag } : p) };
      return setAtPath(prev, path, next);
    });
  }

  // Collect custom items for this section
  const customItems = useMemo(() => {
    if (!allowCustom || !sectionKey) return [];
    const sectionData = inspection?.[sectionKey] || {};
    return Object.keys(sectionData)
      .filter(k => k.startsWith("custom_"))
      .map(k => ({ path: [sectionKey, k], label: sectionData[k]?.label || "Custom item", isCustom: true, customKey: k }));
  }, [allowCustom, sectionKey, inspection]);

  const allItems = [...items, ...customItems];

  return (
    <div className="guideSection">
      <button
        type="button"
        className="guideSectionToggle"
        onClick={() => setOpen(o => !o)}
        aria-expanded={open}
      >
        <span className="guideSectionTitle">{title}</span>
        <span className="guideSectionChevron">▼</span>
      </button>
      {open && (
        <>
          {allItems.length === 0 && emptyHint && (
            <div className="guideSectionEmptyHint">{emptyHint}</div>
          )}
          <div className="guideItems">
            {allItems.map((it) => {
              const key = it.path.join(".");
              const itemKey = it.path[it.path.length - 1];
              const current = getAtPath(inspection, it.path) || withPhotos({ status: "OK", notes: "" });
              // Determine if this is cold equipment needing a temp reading
              const coldInfo = coldEquipmentMap?.[itemKey] || (it.isCustom ? detectColdType(it.label) : null);
              const tempVal = current.tempF || "";
              const tempNum = Number(tempVal);
              const isNA = !!current.notApplicable;
              const toggleNA = () => setInspection((prev) =>
                setAtPath(prev, it.path, { ...current, notApplicable: !isNA })
              );
              return (
                <div className={`guideItem${isNA ? " guideItemNA" : ""}`} key={key}>
                  <div className="guideItemHead">
                    <div className="guideLabel">
                      {(() => {
                        const parts = it.label.split(" — ");
                        const name = parts[0];
                        const question = parts.slice(1).join(" — ");
                        return (
                          <>
                            <span className="guideLabelName">
                              {name}
                              {coldInfo && !isNA && <span className="coldTypeBadge">{coldInfo.type === "cooler" ? "\u2744 Cooler" : "\u2744 Freezer"}</span>}
                            </span>
                            {question && <span className="guideLabelQuestion">{question}</span>}
                          </>
                        );
                      })()}
                      {isNA && <span className="naBadge">Not at this location</span>}
                    </div>
                    {!isNA && (
                      <select className="select selectSmall" value={current.status}
                        onChange={(e) => setInspection((prev) => setAtPath(prev, it.path, { ...current, status: e.target.value }))}>
                        {STATUS_OPTIONS.map((s) => (<option key={s} value={s}>{s}</option>))}
                      </select>
                    )}
                    <button type="button" className={`naToggleBtn${isNA ? " naToggleBtnActive" : ""}`}
                      title={isNA ? "Mark as present at this location" : "Mark as N/A — not at this location"}
                      onClick={toggleNA}>
                      {isNA ? "↩ Undo N/A" : "N/A"}
                    </button>
                    {it.isCustom && (
                      <button type="button" className="guideItemDeleteBtn" title="Remove item"
                        onClick={() => setInspection(prev => {
                          const section = { ...(prev[it.path[0]] || {}) };
                          delete section[it.path[1]];
                          return { ...prev, [it.path[0]]: section };
                        })}>🗑️</button>
                    )}
                  </div>
                  {!isNA && (
                    <>
                      {coldInfo && (
                        <div className="equipTempRow">
                          <div className="tempInputWrap" style={{ flex: "0 0 130px" }}>
                            <input className="input inputSmall tempInput" inputMode="numeric" value={tempVal}
                              onChange={(e) => setInspection((prev) => setAtPath(prev, it.path, { ...current, tempF: e.target.value }))}
                              placeholder={coldInfo.type === "cooler" ? "38" : "10"} />
                            <span className="tempUnit">{"\u00B0F"}</span>
                          </div>
                          {(() => {
                            const warnMax = coldInfo.type === "cooler" ? 45 : 28;
                            if (!tempVal) return <span className="hint" style={{ whiteSpace: "nowrap" }}>Max {coldInfo.max}°F</span>;
                            if (tempNum <= coldInfo.max) return <span className="tempStatusBadge tempStatusGood" style={{ fontSize: "0.74rem", padding: "3px 8px" }}>✅ {tempNum}°F — Good</span>;
                            if (tempNum <= warnMax) return <span className="tempStatusBadge tempStatusWarn" style={{ fontSize: "0.74rem", padding: "3px 8px" }}>⚠️ {tempNum}°F — Watch it</span>;
                            return <span className="tempStatusBadge tempStatusBad" style={{ fontSize: "0.74rem", padding: "3px 8px" }}>🚨 {tempNum}°F — Too warm!</span>;
                          })()}
                        </div>
                      )}
                      <input className="input inputSmall" value={current.notes}
                        onChange={(e) => setInspection((prev) => setAtPath(prev, it.path, { ...current, notes: e.target.value }))}
                        placeholder="Inspector notes (optional)" />
                      <div className="photoRow">
                        <input ref={(el) => (fileRefs.current[key] = el)} className="fileInput" type="file" accept="image/*" multiple
                          onChange={(e) => { addPhotos(key, e.target.files, (current.photos || []).length); e.target.value = ""; }} />
                        <button className="btn btnGhost btnSmall photoBtn" type="button" onClick={() => fileRefs.current[key]?.click()}
                          disabled={(current.photos || []).length >= PHOTO_LIMIT}>
                          📷 {(current.photos || []).length >= PHOTO_LIMIT ? `Max ${PHOTO_LIMIT} photos` : "Add photos"}
                        </button>
                        <span className="hint">{(current.photos || []).length}/{PHOTO_LIMIT} ({PHOTO_MAX_MB}MB each)</span>
                      </div>
                      <PhotoStrip photos={current.photos} onRemove={(id) => removePhoto(key, id)} onTag={(id, tag) => tagPhoto(key, id, tag)} />
                    </>
                  )}
                </div>
              );
            })}
          </div>
          {allowCustom && (
            <div className="guideAddItem">
              <input className="input inputSmall" value={newItemName} onChange={(e) => setNewItemName(e.target.value)}
                placeholder="Add new item (e.g., Walk-in freezer)" onKeyDown={(e) => {
                  if (e.key === "Enter" && newItemName.trim()) {
                    const key = `custom_${Date.now()}`;
                    const cold = detectColdType(newItemName.trim());
                    setInspection((prev) => setAtPath(prev, [sectionKey, key], { status: "OK", notes: "", photos: [], label: newItemName.trim(), count: "", equipSource: "Facility", ...(cold ? { tempF: "" } : {}) }));
                    setNewItemName("");
                  }
                }} />
              <button className="btn btnGhost btnSmall" type="button" onClick={() => {
                if (!newItemName.trim()) return;
                const key = `custom_${Date.now()}`;
                const cold = detectColdType(newItemName.trim());
                setInspection((prev) => setAtPath(prev, [sectionKey, key], { status: "OK", notes: "", photos: [], label: newItemName.trim(), count: "", equipSource: "Facility", ...(cold ? { tempF: "" } : {}) }));
                setNewItemName("");
              }}>+ Add</button>
            </div>
          )}
          {/* ── Maintenance sub-items (with priority) ── */}
          {maintenanceItems && (() => {
            const customMaintItems = (() => {
              const sec = inspection?.maintenance || {};
              return Object.keys(sec)
                .filter(k => k.startsWith("custom_"))
                .map(k => ({ path: ["maintenance", k], label: sec[k]?.label || "Custom item", isCustom: true, hasPriority: true }));
            })();
            const allMaintItems = [...maintenanceItems, ...customMaintItems];
            return (
              <>
                <div className="maintSubHeader">🔧 Maintenance items</div>
                <div className="guideItems">
                  {allMaintItems.map(it => {
                    const pathKey = it.path.join(".");
                    const cur = getAtPath(inspection, it.path) || withPhotos({ status: "OK", notes: "", priority: "Low" });
                    const priority = cur.priority || "Low";
                    return (
                      <div className="guideItem" key={pathKey}>
                        <div className="guideItemHead" style={{ marginBottom: 8 }}>
                          <div className="guideLabel">
                            {(() => {
                              const parts = it.label.split(" — ");
                              const name = parts[0];
                              const question = parts.slice(1).join(" — ");
                              return (<><span className="guideLabelName">{name}</span>{question && <span className="guideLabelQuestion">{question}</span>}</>);
                            })()}
                          </div>
                          {it.isCustom && (
                            <button type="button" className="guideItemDeleteBtn" title="Remove item"
                              onClick={() => setInspection(prev => {
                                const section = { ...(prev[it.path[0]] || {}) };
                                delete section[it.path[1]];
                                return { ...prev, [it.path[0]]: section };
                              })}>🗑️</button>
                          )}
                        </div>
                        <div className="maintControlBar">
                          <select className="select selectSmall" value={cur.status}
                            onChange={e => setInspection(prev => setAtPath(prev, it.path, { ...cur, status: e.target.value }))}>
                            {STATUS_OPTIONS.map(s => <option key={s} value={s}>{s}</option>)}
                          </select>
                          <div className="maintPriorityInline">
                            {["High", "Med", "Low"].map(p => (
                              <button key={p} type="button"
                                className={`maintPriorityBtn ${priority === p ? `active-${p}` : ""}`}
                                onClick={() => setInspection(prev => setAtPath(prev, it.path, { ...cur, priority: p }))}>
                                {p === "High" ? "🔴" : p === "Med" ? "🟡" : "🟢"} {p}
                              </button>
                            ))}
                          </div>
                        </div>
                        <input className="input inputSmall" value={cur.notes}
                          onChange={e => setInspection(prev => setAtPath(prev, it.path, { ...cur, notes: e.target.value }))}
                          placeholder="Notes / description (optional)" />
                        <div className="photoRow">
                          <input ref={el => (fileRefs.current[pathKey] = el)} className="fileInput" type="file" accept="image/*" multiple
                            onChange={e => { addPhotos(pathKey, e.target.files, (cur.photos || []).length); e.target.value = ""; }} />
                          <button className="btn btnGhost btnSmall photoBtn" type="button" onClick={() => fileRefs.current[pathKey]?.click()}
                            disabled={(cur.photos || []).length >= PHOTO_LIMIT}>
                            📷 {(cur.photos || []).length >= PHOTO_LIMIT ? `Max ${PHOTO_LIMIT} photos` : "Add photos"}
                          </button>
                          <span className="hint">{(cur.photos || []).length}/{PHOTO_LIMIT} ({PHOTO_MAX_MB}MB each)</span>
                        </div>
                        <PhotoStrip photos={cur.photos}
                          onRemove={id => {
                            setInspection(prev => {
                              const cur2 = getAtPath(prev, it.path) || withPhotos({ status: "OK", notes: "", priority: "Low" });
                              return setAtPath(prev, it.path, { ...cur2, photos: (cur2.photos || []).filter(p => p.id !== id) });
                            });
                          }}
                          onTag={(id, tag) => {
                            setInspection(prev => {
                              const cur2 = getAtPath(prev, it.path) || withPhotos({ status: "OK", notes: "", priority: "Low" });
                              return setAtPath(prev, it.path, { ...cur2, photos: (cur2.photos || []).map(p => p.id === id ? { ...p, tag } : p) });
                            });
                          }} />
                      </div>
                    );
                  })}
                </div>
                <div className="guideAddItem">
                  <input className="input inputSmall" value={newMaintName} onChange={e => setNewMaintName(e.target.value)}
                    placeholder="Add maintenance item (e.g., Generator)" onKeyDown={e => {
                      if (e.key === "Enter" && newMaintName.trim()) {
                        const k = `custom_${Date.now()}`;
                        setInspection(prev => setAtPath(prev, ["maintenance", k], { status: "OK", notes: "", priority: "Low", photos: [], label: newMaintName.trim() }));
                        setNewMaintName("");
                      }
                    }} />
                  <button className="btn btnGhost btnSmall" type="button" onClick={() => {
                    if (!newMaintName.trim()) return;
                    const k = `custom_${Date.now()}`;
                    setInspection(prev => setAtPath(prev, ["maintenance", k], { status: "OK", notes: "", priority: "Low", photos: [], label: newMaintName.trim() }));
                    setNewMaintName("");
                  }}>+ Add</button>
                </div>
              </>
            );
          })()}
        </>
      )}
    </div>
  );
}

/* ── Live HACCP Panel (real-time supervisor temp submissions) ── */
function LiveHaccpPanel({ reportId }) {
  const [subs, setSubs] = useState([]);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    if (!reportId) return;
    const unsub = subscribeHaccpForReport(reportId, (data) => {
      setSubs(data);
      setLoaded(true);
    });
    setLoaded(false);
    return unsub;
  }, [reportId]);

  if (!loaded) return null;
  if (subs.length === 0) return (
    <div style={{ margin: "16px 0 4px", padding: "12px 14px", borderRadius: 10, background: "#f8fafc", border: "1px solid #e2e8f0", fontSize: "0.82rem", color: "#94a3b8" }}>
      🌡️ No HACCP temperature logs yet — supervisor submissions appear here in real time.
    </div>
  );

  return (
    <div style={{ margin: "16px 0 4px" }}>
      <div style={{ fontWeight: 700, fontSize: "0.88rem", color: "var(--sdx-navy)", marginBottom: 8, display: "flex", alignItems: "center", gap: 6 }}>
        🌡️ HACCP Temperature Logs
        <span style={{ fontSize: "0.75rem", fontWeight: 400, color: "#6b7280" }}>— {subs.length} submission{subs.length !== 1 ? "s" : ""}</span>
      </div>
      {subs.map((sub, si) => {
        const allItems = [
          ...HACCP_TEMP_ITEMS,
          ...(sub.customItems || []).filter(ci => !HACCP_TEMP_ITEMS.find(d => d.key === ci.key)),
        ];
        return (
          <div key={sub.id || si} style={{ border: "1px solid #e2e8f0", borderRadius: 10, padding: "12px 14px", marginBottom: 10, background: "#fff" }}>
            <div style={{ fontWeight: 600, fontSize: "0.82rem", color: "var(--sdx-navy)", marginBottom: 6 }}>
              👤 {sub.supervisorName || "Supervisor"}
              <span style={{ fontWeight: 400, color: "#94a3b8", marginLeft: 8, fontSize: "0.75rem" }}>
                {sub.submittedAt ? new Date(sub.submittedAt).toLocaleString() : ""}
              </span>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              {allItems.map(item => {
                const readings = (sub.temps?.[item.key] || []).filter(v => v !== "");
                if (readings.length === 0) return null;
                const names = sub.foodNames?.[item.key] || [];
                const label = sub.itemLabels?.[item.key] || item.label;
                return (
                  <div key={item.key} style={{ fontSize: "0.8rem", display: "flex", gap: 6, alignItems: "flex-start" }}>
                    <span style={{ color: "#6b7280", minWidth: 100 }}>{label}:</span>
                    <span style={{ color: "var(--sdx-navy)", fontWeight: 500 }}>
                      {readings.map((v, ri) => {
                        const num = parseFloat(v);
                        const pass = tempPass(item, num);
                        const badge = !isNaN(num) ? (pass ? "✅" : "🚨") : "";
                        const name = names[ri] ? ` (${names[ri]})` : "";
                        return `${badge} ${v}°F${name}`;
                      }).join(" · ")}
                    </span>
                  </div>
                );
              })}
            </div>
            {sub.problemReport?.text && (
              <div style={{ marginTop: 8, padding: "8px 10px", borderRadius: 7, background: sub.problemReport.severity === "urgent" ? "#fef2f2" : sub.problemReport.severity === "issue" ? "#fffbeb" : "#eff6ff", fontSize: "0.8rem", color: "#374151" }}>
                {sub.problemReport.severity === "urgent" ? "🔴" : sub.problemReport.severity === "issue" ? "🟡" : "🔵"} {sub.problemReport.text}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

/* ── Inline Chat (embedded in the report output section) ───── */
function InlineChat({ currentUser, sessionId }) {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [open, setOpen] = useState(true);
  const listRef = useRef(null);
  const prevCountRef = useRef(0);

  useEffect(() => {
    return subscribeChatMessages(sessionId, setMessages);
  }, [sessionId]);

  // Only scroll the chat list itself when new messages arrive — never the whole page
  useEffect(() => {
    if (!open) return;
    if (messages.length > prevCountRef.current && listRef.current) {
      listRef.current.scrollTop = listRef.current.scrollHeight;
    }
    prevCountRef.current = messages.length;
  }, [messages, open]);

  async function send() {
    if (!input.trim() || sending) return;
    setSending(true);
    const msg = {
      id: `chat_${Date.now()}_${Math.random().toString(16).slice(2)}`,
      sessionId: sessionId || "",
      sender: currentUser?.name || "Inspector",
      text: input.trim(),
      sentAt: new Date().toISOString(),
      fromSupervisor: false,
    };
    await saveChatMessage(msg);
    setInput("");
    const updated = await loadChatMessages(sessionId);
    setMessages(updated);
    setSending(false);
  }

  const unread = messages.filter(m => m.fromSupervisor).length;

  return (
    <div className="inlineChatCard">
      <button className="inlineChatToggle" type="button" onClick={() => setOpen(o => !o)}>
        <span>💬 Supervisor Chat</span>
        {unread > 0 && !open && <span className="inlineChatBadge">{unread}</span>}
        <span className="inlineChatChevron">{open ? "▲" : "▼"}</span>
      </button>
      {open && (
        <div className="inlineChatBody">
          <div className="inlineChatList" ref={listRef}>
            {messages.length === 0
              ? <div className="haccpEmptyChat">No messages yet — supervisor messages appear here in real time.</div>
              : messages.map(m => (
                <div key={m.id} className={`haccpChatMsg ${m.fromSupervisor ? "theirs" : "mine"}`}>
                  <div className="haccpChatBubble">{m.text}</div>
                  <div className="haccpChatMeta">
                    {m.fromSupervisor ? (m.sender || "Supervisor") : "You"} · {new Date(m.sentAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                  </div>
                </div>
              ))
            }
          </div>
          <div className="inlineChatInputRow">
            <textarea
              className="haccpChatInput"
              rows={1}
              value={input}
              onChange={e => setInput(e.target.value)}
              placeholder="Reply to supervisor…"
              onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); } }}
            />
            <button className="haccpChatSendBtn" onClick={send} disabled={!input.trim() || sending}>
              {sending ? "…" : "Send"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

/* ── Share / QR helpers ─────────────────────────────────── */
function buildShareUrl({ inspectorName, siteName, siteNumber, supervisorName, sitePhone, inspectionType, inspectionDate }) {
  // Always use the canonical app root so QR links work from any page/path
  const base = window.location.origin + "/Claude/";
  const params = new URLSearchParams();
  if (inspectorName)  params.set("inspector", inspectorName);
  if (siteName)       params.set("site", siteName);
  if (siteNumber)     params.set("unit", siteNumber);
  if (supervisorName) params.set("supervisor", supervisorName);
  if (sitePhone)      params.set("phone", sitePhone);
  if (inspectionType) params.set("type", inspectionType);
  if (inspectionDate) params.set("date", inspectionDate);
  return `${base}?${params.toString()}`;
}
function ShareModal({ shareUrl, onClose }) {
  const canvasRef = useRef(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (canvasRef.current) {
      QRCode.toCanvas(canvasRef.current, shareUrl, {
        width: 220,
        margin: 2,
        color: { dark: "#2A295C", light: "#ffffff" },
      });
    }
  }, [shareUrl]);

  function copyLink() {
    navigator.clipboard.writeText(shareUrl).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }).catch(() => {
      // Fallback for browsers that block clipboard
      const el = document.createElement("textarea");
      el.value = shareUrl;
      document.body.appendChild(el);
      el.select();
      document.execCommand("copy");
      document.body.removeChild(el);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }
  return (
    <div className="modalOverlay" onClick={onClose}>
      <div className="modalBox" onClick={(e) => e.stopPropagation()}>
        <div className="modalHeader">
          <span>Share Inspection Link</span>
          <button className="modalClose" onClick={onClose} type="button">✕</button>
        </div>
        <div className="modalBody">
          {/* QR wrapped in an anchor so scanning/tapping opens the URL */}
          <a href={shareUrl} target="_blank" rel="noopener noreferrer" className="qrWrap" title="Open link">
            <canvas ref={canvasRef} className="qrImg" />
          </a>
          <p style={{ textAlign: "center", margin: "10px 0 4px", fontSize: "0.82rem", color: "#6b7280" }}>
            Staff scan this QR to open the pre-filled form
          </p>
          <p style={{ textAlign: "center", margin: "0 0 14px", fontSize: "0.75rem", color: "#9ca3af" }}>
            Or tap the QR / use the link below
          </p>
          <div className="shareUrlRow">
            <input className="input shareUrlInput" readOnly value={shareUrl} onFocus={(e) => e.target.select()} />
            <button className="btn btnPrimary" type="button" onClick={copyLink}>
              {copied ? "✓ Copied!" : "Copy link"}
            </button>
          </div>
          <a href={shareUrl} target="_blank" rel="noopener noreferrer"
            style={{ display: "block", textAlign: "center", marginTop: 10, fontSize: "0.8rem", color: "var(--sdx-blue)", textDecoration: "underline" }}>
            Open link in browser →
          </a>
        </div>
      </div>
    </div>
  );
}

/* ── HACCP QR Modal (inspector side) ─────────────────────── */
function HaccpQrModal({ onClose, siteName, siteNumber, floor, locationType, reportId }) {
  const canvasRef = useRef(null);
  const [copied, setCopied] = useState(false);
  const haccpUrl = (() => {
    const base = window.location.origin + "/Claude/";
    const p = new URLSearchParams({ haccp: "1" });
    if (siteName?.trim())     p.set("site", siteName.trim());
    if (siteNumber?.trim())   p.set("unit", siteNumber.trim());
    if (floor?.trim())        p.set("floor", floor.trim());
    if (locationType?.trim()) p.set("loctype", locationType.trim());
    if (reportId?.trim())     p.set("rid", reportId.trim());
    // Preserve the active venue so supervisor submissions go to the same data silo
    if (VENUE_ID && VENUE_ID !== "default") p.set("v", VENUE_ID);
    return base + "?" + p.toString();
  })();

  useEffect(() => {
    if (canvasRef.current) {
      QRCode.toCanvas(canvasRef.current, haccpUrl, {
        width: 220, margin: 2,
        color: { dark: "#2A295C", light: "#ffffff" },
      });
    }
  }, [haccpUrl]);

  function copyLink() {
    navigator.clipboard.writeText(haccpUrl).then(() => {
      setCopied(true); setTimeout(() => setCopied(false), 2000);
    }).catch(() => {
      const el = document.createElement("textarea");
      el.value = haccpUrl;
      document.body.appendChild(el); el.select();
      document.execCommand("copy"); document.body.removeChild(el);
      setCopied(true); setTimeout(() => setCopied(false), 2000);
    });
  }

  return (
    <div className="modalOverlay" onClick={onClose}>
      <div className="modalBox" onClick={(e) => e.stopPropagation()}>
        <div className="modalHeader">
          <span>🌡️ HACCP Supervisor Portal QR</span>
          <button className="modalClose" onClick={onClose} type="button">✕</button>
        </div>
        <div className="modalBody">
          <a href={haccpUrl} target="_blank" rel="noopener noreferrer" className="qrWrap" title="Open HACCP portal">
            <canvas ref={canvasRef} className="qrImg" />
          </a>
          <p style={{ textAlign:"center", margin:"10px 0 4px", fontSize:"0.82rem", color:"#6b7280" }}>
            Supervisor scans this QR to open the HACCP form
          </p>
          <p style={{ textAlign:"center", margin:"0 0 14px", fontSize:"0.75rem", color:"#9ca3af" }}>
            They will only see temperatures, problem report &amp; chat — not the full app
          </p>
          <div className="shareUrlRow">
            <input className="input shareUrlInput" readOnly value={haccpUrl} onFocus={(e) => e.target.select()} />
            <button className="btn btnPrimary" type="button" onClick={copyLink}>
              {copied ? "✓ Copied!" : "Copy link"}
            </button>
          </div>
          <a href={haccpUrl} target="_blank" rel="noopener noreferrer"
            style={{ display:"block", textAlign:"center", marginTop:10, fontSize:"0.8rem", color:"var(--sdx-blue)", textDecoration:"underline" }}>
            Open HACCP portal in browser →
          </a>
        </div>
      </div>
    </div>
  );
}

/* ── Inspector Chat Panel (to reply to supervisors) ────────── */
function InspectorChatPanel({ currentUser, onClose, sessionId }) {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const listRef = useRef(null);
  const prevCountRef = useRef(0);

  useEffect(() => {
    return subscribeChatMessages(sessionId, setMessages);
  }, [sessionId]);

  // Only scroll the chat list container — never the whole page
  useEffect(() => {
    if (messages.length > prevCountRef.current && listRef.current) {
      listRef.current.scrollTop = listRef.current.scrollHeight;
    }
    prevCountRef.current = messages.length;
  }, [messages]);

  async function send() {
    if (!input.trim() || sending) return;
    setSending(true);
    const msg = {
      id: `chat_${Date.now()}_${Math.random().toString(16).slice(2)}`,
      sessionId: sessionId || "",
      sender: currentUser?.name || "Inspector",
      text: input.trim(),
      sentAt: new Date().toISOString(),
      fromSupervisor: false,
    };
    await saveChatMessage(msg);
    setInput("");
    const updated = await loadChatMessages(sessionId);
    setMessages(updated);
    setSending(false);
  }

  return (
    <div className="modalOverlay" onClick={onClose}>
      <div className="modalBox" style={{ maxWidth: 480, height: "70vh", display:"flex", flexDirection:"column" }} onClick={(e) => e.stopPropagation()}>
        <div className="modalHeader">
          <span>💬 Chat with Supervisor</span>
          <button className="modalClose" onClick={onClose} type="button">✕</button>
        </div>
        <div className="haccpChatList" ref={listRef} style={{ flex:1, overflowY:"auto", padding:"12px 16px" }}>
          {messages.length === 0 && <div className="haccpEmptyChat">No messages yet.</div>}
          {messages.map(m => (
            <div key={m.id} className={`haccpChatMsg ${m.fromSupervisor ? "theirs" : "mine"}`}>
              <div className="haccpChatBubble">{m.text}</div>
              <div className="haccpChatMeta">
                {m.fromSupervisor ? (m.sender || "Supervisor") : "You"} · {new Date(m.sentAt).toLocaleTimeString([], { hour:"2-digit", minute:"2-digit" })}
              </div>
            </div>
          ))}
        </div>
        <div className="haccpChatInputRow" style={{ padding:"10px 16px", borderTop:"1px solid var(--border)" }}>
          <textarea className="haccpChatInput" rows={1} value={input} onChange={e => setInput(e.target.value)}
            placeholder="Type reply to supervisor..."
            onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); } }} />
          <button className="haccpChatSendBtn" onClick={send} disabled={!input.trim() || sending}>
            {sending ? "…" : "Send"}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ── HACCP Chat Block — standalone so it never remounts on parent re-render ── */
// Must live outside HaccpPortal. An inner function component is recreated on every
// render, causing React to unmount+remount it — which dismisses the mobile keyboard.
function HaccpChatBlock({ chatMessages, chatInput, setChatInput, chatSending, sendChat, chatListRef }) {
  return (
    <div className="haccpSection">
      <div className="haccpSectionHead">💬 Chat with Inspector</div>
      <div className="haccpSectionBody">
        <div className="haccpChatList" ref={chatListRef}>
          {chatMessages.length === 0 && (
            <div className="haccpEmptyChat">No messages yet. Start the conversation!</div>
          )}
          {chatMessages.map(m => (
            <div key={m.id} className={`haccpChatMsg ${m.fromSupervisor ? "mine" : "theirs"}`}>
              <div className="haccpChatBubble">{m.text}</div>
              <div className="haccpChatMeta">
                {m.fromSupervisor ? "You" : (m.sender || "Inspector")} · {new Date(m.sentAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
              </div>
            </div>
          ))}
        </div>
        <div className="haccpChatInputRow">
          <textarea className="haccpChatInput" rows={1}
            value={chatInput} onChange={e => setChatInput(e.target.value)}
            placeholder="Type a message..."
            onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendChat(); } }} />
          <button className="haccpChatSendBtn" onClick={sendChat} disabled={!chatInput.trim() || chatSending}>
            {chatSending ? "…" : "Send"}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ── HACCP Supervisor Portal ─────────────────────────────── */
// Default HACCP temperature items supervisors can fill out
function HaccpPortal() {
  // Read location info embedded in the QR URL
  const urlParams = new URLSearchParams(window.location.search);
  const urlSite     = urlParams.get("site")    || "";
  const urlUnit     = urlParams.get("unit")    || "";
  const urlFloor    = urlParams.get("floor")   || "";
  const urlLocType  = urlParams.get("loctype") || "";
  const urlReportId = urlParams.get("rid")     || ""; // inspector report this HACCP log belongs to

  // If QR has site info pre-filled, the step order is: "ident" → "location" → "form" → "done"
  // If no site info in URL, we add a manual "location" step after ident so the form is still linked.
  // "ident" → supervisor enters name + phone
  // "location" → confirm (QR) or enter (manual) the restaurant name, unit, floor
  // "form" → temperatures + problem report
  // "done" → confirmation

  const [step, setStep] = useState("ident"); // "ident" | "location" | "form" | "done"
  const [supName, setSupName] = useState("");
  const [supPhone, setSupPhone] = useState("");
  const [sessionId, setSessionId] = useState(null);

  // Location state — seeded from URL params (QR-encoded)
  const [locSite, setLocSite]       = useState(urlSite);
  const [locUnit, setLocUnit]       = useState(urlUnit);
  const [locFloor, setLocFloor]     = useState(urlFloor);
  const [locType, setLocType]       = useState(urlLocType);
  // temps: { [itemKey]: string[] }  — array of readings per item
  const [temps, setTemps] = useState(() =>
    Object.fromEntries(HACCP_TEMP_ITEMS.map(it => [it.key, [""]]))
  );
  // foodNames: { [itemKey]: string[] } — food item name for each reading (parallel to temps)
  const [foodNames, setFoodNames] = useState(() =>
    Object.fromEntries(HACCP_TEMP_ITEMS.map(it => [it.key, [""]]))
  );
  // Custom temperature items added by the supervisor (beyond the 6 defaults)
  const [customItems, setCustomItems] = useState([]);
  // { key: string, label: string, unit: "°F", type: "hot"|"cold", min?: number, max?: number }
  // Inline label editing: which item key is currently being edited
  const [editingLabel, setEditingLabel] = useState(null); // null | itemKey
  const [editingLabelVal, setEditingLabelVal] = useState("");
  // Custom item labels overrides for default items
  const [labelOverrides, setLabelOverrides] = useState({});
  const [problem, setProblem] = useState("");
  const [severity, setSeverity] = useState("issue");
  const [problemPhotos, setProblemPhotos] = useState([]);
  const problemPhotoRef = useRef(null);
  const [submitting, setSubmitting] = useState(false);
  const [photoError, setPhotoError] = useState("");
  const [chatMessages, setChatMessages] = useState([]);
  const [chatInput, setChatInput] = useState("");
  const [chatSending, setChatSending] = useState(false);
  const chatListRef = useRef(null);
  const chatPrevCountRef = useRef(0);

  // Load chat scoped to this report (urlReportId), so supervisor and inspector share the same thread
  useEffect(() => {
    const chatKey = urlReportId || sessionId;
    return subscribeChatMessages(chatKey, setChatMessages);
  }, [urlReportId, sessionId]);

  // Only scroll the chat list container when new messages arrive — never the whole page
  useEffect(() => {
    if (chatMessages.length > chatPrevCountRef.current && chatListRef.current) {
      chatListRef.current.scrollTop = chatListRef.current.scrollHeight;
    }
    chatPrevCountRef.current = chatMessages.length;
  }, [chatMessages]);

  // Step 1: supervisor enters name + phone → go to location confirmation step
  async function handleIdentSubmit() {
    if (!supName.trim() || !supPhone.trim()) return;
    // Generate the session ID now so we can link ident record to the whole session
    const newSessionId = `session_${Date.now()}_${Math.random().toString(16).slice(2)}`;
    setSessionId(newSessionId);
    const identId = `supident_${Date.now()}_${Math.random().toString(16).slice(2)}`;
    await saveHaccpSubmission({
      id: identId,
      type: "ident",
      sessionId: newSessionId,
      reportId: urlReportId,
      supervisorName: supName.trim(),
      supervisorPhone: supPhone.trim(),
      site: locSite,
      unit: locUnit,
      floor: locFloor,
      locationType: locType,
      submittedAt: new Date().toISOString(),
    });
    setStep("location");
  }

  // Step 2: supervisor confirms or fills in the location → go to HACCP form
  function handleLocationSubmit() {
    if (!locSite.trim()) return; // restaurant name is required
    setStep("form");
  }

  // Add photos to the problem report
  async function addProblemPhotos(files) {
    const accepted = Array.from(files || []).slice(0, PHOTO_LIMIT - problemPhotos.length);
    const enriched = [];
    let uploadFailCount = 0;
    const inspId = urlReportId || sessionId || `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    for (const f of accepted) {
      if (!f.type.startsWith("image/")) continue;
      if (bytesToMb(f.size) > PHOTO_MAX_MB) continue;
      const thumbUrl = await compressImage(f);
      if (!thumbUrl) continue;
      const photoId = `${Date.now()}_${Math.random().toString(16).slice(2)}`;
      let previewUrl = thumbUrl;
      if (FIREBASE_ON) {
        const storageData = await compressImage(f, 1200, 0.82);
        const storageUrl = await uploadPhoto(storageData || thumbUrl, activeVenueId, inspId, photoId);
        if (storageUrl) {
          previewUrl = storageUrl;
        } else {
          uploadFailCount++;
        }
      }
      enriched.push({ id: photoId, name: f.name, previewUrl, tag: "" });
    }
    if (enriched.length === 0) return;
    if (uploadFailCount > 0) {
      setPhotoError(`⚠️ ${uploadFailCount} photo${uploadFailCount > 1 ? "s" : ""} saved as low-res thumbnail (cloud upload failed). Check your internet connection. The photo${uploadFailCount > 1 ? "s" : ""} will still appear in reports.`);
      setTimeout(() => setPhotoError(""), 8000);
    }
    setProblemPhotos(prev => [...prev, ...enriched].slice(0, PHOTO_LIMIT));
  }

  async function handleSubmit() {
    setSubmitting(true);
    // Build flat temps map for storage (collect all readings per item)
    const tempsFlat = {};
    for (const [k, arr] of Object.entries(temps)) {
      tempsFlat[k] = arr.filter(v => v.trim() !== "");
    }
    // Build flat food names map — keep names aligned with temps readings
    const foodNamesFlat = {};
    for (const [k, arr] of Object.entries(foodNames)) {
      foodNamesFlat[k] = arr.map(v => v.trim());
    }
    // Build a label map for all items (default + custom overrides) so history can display them
    const itemLabels = {};
    [...HACCP_TEMP_ITEMS, ...customItems].forEach(item => {
      itemLabels[item.key] = labelOverrides[item.key] ?? item.label;
    });
    const id = `haccp_${Date.now()}_${Math.random().toString(16).slice(2)}`;
    const record = {
      id,
      type: "submission",
      sessionId: sessionId || "",
      reportId: urlReportId,
      supervisorName: supName.trim(),
      supervisorPhone: supPhone.trim(),
      site: locSite.trim(),
      unit: locUnit.trim(),
      floor: locFloor.trim(),
      locationType: locType.trim(),
      temps: tempsFlat,
      foodNames: foodNamesFlat,
      itemLabels,
      customItems,
      problemReport: problem.trim() ? { text: problem.trim(), severity, photos: problemPhotos.map(p => ({ id: p.id, name: p.name, sizeMb: p.sizeMb, type: p.type, tag: p.tag || "", previewUrl: (p.previewUrl && !p.previewUrl.startsWith("data:")) ? p.previewUrl : "" })) } : null,
      submittedAt: new Date().toISOString(),
    };
    await saveHaccpSubmission(record);
    if (problem.trim()) {
      const prId = `prob_${Date.now()}_${Math.random().toString(16).slice(2)}`;
      await saveProblemReport({
        id: prId,
        reportId: urlReportId,
        supervisorName: supName.trim(),
        supervisorPhone: supPhone.trim(),
        site: locSite.trim(),
        unit: locUnit.trim(),
        floor: locFloor.trim(),
        locationType: locType.trim(),
        text: problem.trim(),
        severity,
        photos: problemPhotos.map(p => ({ id: p.id, name: p.name, sizeMb: p.sizeMb, type: p.type, tag: p.tag || "", previewUrl: (p.previewUrl && !p.previewUrl.startsWith("data:")) ? p.previewUrl : "" })),
        reportedAt: new Date().toISOString(),
        status: "open",
      });
    }
    setSubmitting(false);
    setStep("done");
  }

  async function sendChat() {
    if (!chatInput.trim() || chatSending) return;
    setChatSending(true);
    const chatKey = urlReportId || sessionId || "";
    const msg = {
      id: `chat_${Date.now()}_${Math.random().toString(16).slice(2)}`,
      sessionId: chatKey,
      sender: supName.trim() || "Supervisor",
      senderPhone: supPhone.trim() || "",
      text: chatInput.trim(),
      sentAt: new Date().toISOString(),
      fromSupervisor: true,
    };
    await saveChatMessage(msg);
    setChatInput("");
    const updated = await loadChatMessages(chatKey);
    setChatMessages(updated);
    setChatSending(false);
  }

  // ChatBlock is defined outside HaccpPortal (see HaccpChatBlock below) to prevent
  // keyboard dismissal on mobile — an inner function component remounts on every render.

  // Location banner shown on every step when confirmed location is set
  const LocationBanner = locSite ? (
    <div className="haccpLocationBanner">
      🏢 <strong>{locSite}</strong>
      {locUnit  ? <span className="haccpLocationUnit"> · Unit #{locUnit}</span>  : null}
      {locFloor ? <span className="haccpLocationUnit"> · {locFloor}</span>       : null}
      {locType  ? <span className="haccpLocationUnit"> · {locType}</span>        : null}
    </div>
  ) : null;

  return (
    <div className="haccpOverlay">
      <img src={`${BASE}sodexo-live-logo.svg`} alt="Sodexo" className="haccpLogo" />

      {step === "ident" && (
        <div className="haccpCard">
          <div className="haccpCardHeader">
            <div className="haccpCardTitle">🌡️ HACCP Temperature Log</div>
            <div className="haccpCardSub">Please identify yourself before submitting temperatures</div>
          </div>
          <div className="haccpCardBody">
            {LocationBanner}
            <label className="field" style={{ margin: 0 }}>
              <span className="fieldLabel">Your Name <span style={{ color: "#ef4444" }}>*</span></span>
              <input className="input" value={supName} onChange={e => setSupName(e.target.value)}
                placeholder="Full name" autoFocus />
            </label>
            <label className="field" style={{ margin: 0, marginTop: 10 }}>
              <span className="fieldLabel">Phone Number <span style={{ color: "#ef4444" }}>*</span></span>
              <input className="input" type="tel" value={supPhone} onChange={e => setSupPhone(e.target.value)}
                placeholder="e.g. 787-555-1234" inputMode="tel" />
              <span className="hint">So the inspector can reach you if needed</span>
            </label>
            <button className="haccpSubmitBtn" onClick={handleIdentSubmit}
              disabled={!supName.trim() || !supPhone.trim()}>
              Continue →
            </button>
          </div>
        </div>
      )}

      {step === "location" && (
        <div className="haccpCard">
          <div className="haccpCardHeader">
            <div className="haccpCardTitle">📍 Confirm Location</div>
            <div className="haccpCardSub">Verify this log is for the correct restaurant</div>
          </div>
          <div className="haccpCardBody">
            {urlSite && locSite ? (
              /* QR had location embedded — show confirmation card */
              <div className="haccpLocConfirm">
                <div className="haccpLocConfirmLabel">Location from QR code:</div>
                <div className="haccpLocConfirmBox">
                  <div className="haccpLocConfirmName">{locSite}</div>
                  {locUnit  && <div className="haccpLocConfirmMeta">Unit #{locUnit}</div>}
                  {locFloor && <div className="haccpLocConfirmMeta">{locFloor}</div>}
                  {locType  && <div className="haccpLocConfirmMeta">{locType}</div>}
                </div>
                <button className="haccpSubmitBtn" onClick={handleLocationSubmit}>
                  ✓ This is my location
                </button>
                <button className="haccpTextBtn" onClick={() => {
                  setLocSite(""); setLocUnit(""); setLocFloor(""); setLocType("");
                }}>
                  Edit location manually
                </button>
              </div>
            ) : (
              /* No QR location — manual entry form */
              <div className="haccpLocEntry">
                <label className="field" style={{ margin: 0 }}>
                  <span className="fieldLabel">Restaurant Name <span style={{ color: "#ef4444" }}>*</span></span>
                  <input className="input" value={locSite} onChange={e => setLocSite(e.target.value)}
                    placeholder="e.g. Sodexo Live – Yankee Stadium" autoFocus />
                </label>
                <label className="field" style={{ margin: 0, marginTop: 10 }}>
                  <span className="fieldLabel">Unit / Store Number <span className="hint" style={{ fontWeight: 400 }}>(optional)</span></span>
                  <input className="input" value={locUnit} onChange={e => setLocUnit(e.target.value)}
                    placeholder="e.g. Unit 4" />
                </label>
                <label className="field" style={{ margin: 0, marginTop: 10 }}>
                  <span className="fieldLabel">Floor / Area <span className="hint" style={{ fontWeight: 400 }}>(optional)</span></span>
                  <input className="input" value={locFloor} onChange={e => setLocFloor(e.target.value)}
                    placeholder="e.g. Floor 2, Concourse A" />
                </label>
                <button className="haccpSubmitBtn" onClick={handleLocationSubmit}
                  disabled={!locSite.trim()}>
                  Continue →
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {step === "form" && (
        <div className="haccpCard">
          <div className="haccpCardHeader">
            <div className="haccpCardTitle">🌡️ HACCP Temperature Log</div>
            <div className="haccpCardSub">Hi {supName} · {supPhone}</div>
          </div>
          <div className="haccpCardBody">
            {LocationBanner}

            {/* Temperature section — multiple readings per item */}
            <div className="haccpSection">
              <div className="haccpSectionHead">Temperature Readings</div>
              <div className="haccpSectionBody">
                {[...HACCP_TEMP_ITEMS, ...customItems].map((item, _itemIdx) => {
                  const isCustom = !HACCP_TEMP_ITEMS.find(d => d.key === item.key);
                  const displayLabel = labelOverrides[item.key] ?? item.label;
                  const readings = temps[item.key] || [""];
                  return (
                    <div className="haccpTempBlock" key={item.key}>
                      <div className="haccpTempBlockHead">
                        {editingLabel === item.key ? (
                          <span style={{ display: "flex", alignItems: "center", gap: 4, flex: 1 }}>
                            <input
                              autoFocus
                              className="haccpLabelEditInput"
                              value={editingLabelVal}
                              onChange={e => setEditingLabelVal(e.target.value)}
                              onKeyDown={e => {
                                if (e.key === "Enter") {
                                  const trimmed = editingLabelVal.trim();
                                  if (trimmed) {
                                    setLabelOverrides(p => ({ ...p, [item.key]: trimmed }));
                                    if (isCustom) {
                                      setCustomItems(p => p.map(ci => ci.key === item.key ? { ...ci, label: trimmed } : ci));
                                    }
                                  }
                                  setEditingLabel(null);
                                } else if (e.key === "Escape") {
                                  setEditingLabel(null);
                                }
                              }}
                              onBlur={() => {
                                const trimmed = editingLabelVal.trim();
                                if (trimmed) {
                                  setLabelOverrides(p => ({ ...p, [item.key]: trimmed }));
                                  if (isCustom) {
                                    setCustomItems(p => p.map(ci => ci.key === item.key ? { ...ci, label: trimmed } : ci));
                                  }
                                }
                                setEditingLabel(null);
                              }}
                              style={{ flex: 1 }}
                            />
                            <span style={{ fontSize: "0.68rem", color: "#9ca3af" }}>↵ to save</span>
                          </span>
                        ) : (
                          <span className="haccpTempLabel"
                            title="Click to rename"
                            onClick={() => { setEditingLabel(item.key); setEditingLabelVal(displayLabel); }}
                            style={{ cursor: "pointer" }}>
                            {displayLabel}
                            <span style={{ fontSize: "0.68rem", color: "#9ca3af", fontWeight: 400, marginLeft: 6 }}>
                              {item.type === "hot" ? `Min ${item.min}${item.unit}` : `Max ${item.max}${item.unit}`}
                            </span>
                            <span style={{ fontSize: "0.65rem", color: "#6b7280", marginLeft: 5 }}>✏️</span>
                          </span>
                        )}
                        <div style={{ display: "flex", gap: 4 }}>
                          {isCustom && (
                            <button type="button" className="haccpRemoveReadingBtn"
                              title="Remove this item"
                              onClick={() => {
                                setCustomItems(p => p.filter(ci => ci.key !== item.key));
                                setTemps(p => { const n = { ...p }; delete n[item.key]; return n; });
                                setFoodNames(p => { const n = { ...p }; delete n[item.key]; return n; });
                                setLabelOverrides(p => { const n = { ...p }; delete n[item.key]; return n; });
                              }}>✕</button>
                          )}
                          <button type="button" className="haccpAddReadingBtn"
                            onClick={() => {
                              setTemps(p => ({ ...p, [item.key]: [...(p[item.key] || [""]), ""] }));
                              setFoodNames(p => ({ ...p, [item.key]: [...(p[item.key] || [""]), ""] }));
                            }}>
                            + Reading
                          </button>
                        </div>
                      </div>
                      {readings.map((val, idx) => {
                        const pass = tempPass(item, val);
                        const foodName = (foodNames[item.key] || [""])[idx] ?? "";
                        return (
                          <div className="haccpTempRow" key={idx}>
                            <input className="haccpFoodNameInput" type="text"
                              value={foodName}
                              onChange={e => setFoodNames(p => {
                                const arr = [...(p[item.key] || [""])];
                                arr[idx] = e.target.value;
                                return { ...p, [item.key]: arr };
                              })}
                              placeholder="Food item (e.g. Chicken)" />
                            <div className="haccpTempInputWrap">
                              <input className="haccpTempInput" type="number" inputMode="decimal"
                                value={val}
                                onChange={e => setTemps(p => {
                                  const arr = [...(p[item.key] || [""])];
                                  arr[idx] = e.target.value;
                                  return { ...p, [item.key]: arr };
                                })}
                                placeholder="—" />
                              <span className="haccpTempUnit">{item.unit}</span>
                            </div>
                            <span className={`haccpTempStatus ${pass === null ? "empty" : pass ? "pass" : "fail"}`}>
                              {pass === null ? "—" : pass ? "✓ OK" : "⚠️ Flag"}
                            </span>
                            {readings.length > 1 && (
                              <button type="button" className="haccpRemoveReadingBtn"
                                onClick={() => {
                                  setTemps(p => {
                                    const arr = (p[item.key] || [""]).filter((_, i) => i !== idx);
                                    return { ...p, [item.key]: arr.length ? arr : [""] };
                                  });
                                  setFoodNames(p => {
                                    const arr = (p[item.key] || [""]).filter((_, i) => i !== idx);
                                    return { ...p, [item.key]: arr.length ? arr : [""] };
                                  });
                                }}>✕</button>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  );
                })}
                {/* Add custom temperature item */}
                <button type="button" className="haccpAddItemBtn"
                  onClick={() => {
                    const key = `custom_${Date.now()}`;
                    const newItem = { key, label: "New Item", unit: "°F", type: "hot", min: 135 };
                    setCustomItems(p => [...p, newItem]);
                    setTemps(p => ({ ...p, [key]: [""] }));
                    setFoodNames(p => ({ ...p, [key]: [""] }));
                    // Open inline edit immediately for the new item
                    setEditingLabel(key);
                    setEditingLabelVal("New Item");
                  }}>
                  + Add Temperature Item
                </button>
              </div>
            </div>

            {/* Problem report section with photo upload */}
            <div className="haccpSection">
              <div className="haccpSectionHead">Report a Problem (optional)</div>
              <div className="haccpSectionBody">
                <textarea className="haccpProblemTextarea"
                  value={problem} onChange={e => setProblem(e.target.value)}
                  placeholder="Describe any issue, equipment problem, or safety concern..." />
                <div className="haccpProblemSeverity">
                  <span style={{ fontSize: "0.75rem", color: "#6b7280", alignSelf: "center" }}>Severity:</span>
                  {[["urgent","🔴 Urgent"],["issue","🟡 Issue"],["info","🔵 Info"]].map(([val, label]) => (
                    <button key={val} className={`haccpSeverityBtn ${severity === val ? `sel-${val}` : ""}`}
                      type="button" onClick={() => setSeverity(val)}>{label}</button>
                  ))}
                </div>
                <input ref={problemPhotoRef} type="file" accept="image/*" multiple className="fileInput"
                  onChange={e => { addProblemPhotos(e.target.files); e.target.value = ""; }} />
                <button type="button" className="btn btnGhost btnSmall photoBtn"
                  style={{ marginTop: 8 }}
                  onClick={() => problemPhotoRef.current?.click()}>
                  📷 Add photos to report
                </button>
                {photoError && (
                  <div style={{ marginTop: 8, padding: "0.5rem 0.75rem", background: "#fef3c7", border: "1px solid #f59e0b", borderRadius: 6, color: "#92400e", fontSize: "0.82rem" }}>
                    {photoError}
                  </div>
                )}
                {problemPhotos.length > 0 && (
                  <div className="photoStrip" style={{ marginTop: 8 }}>
                    {problemPhotos.map(p => (
                      <div className="photoThumbWrap" key={p.id}>
                        <div className="photoThumb">
                          <img src={p.previewUrl} alt={p.name} />
                          <button className="thumbX" type="button"
                            onClick={() => setProblemPhotos(prev => prev.filter(x => x.id !== p.id))}>×</button>
                        </div>
                        <div className="photoTagRow">
                          <button type="button"
                            className={`photoTagBtn${p.tag === "before" ? " tagBefore" : ""}`}
                            onClick={() => setProblemPhotos(prev => prev.map(x => x.id === p.id ? { ...x, tag: x.tag === "before" ? "" : "before" } : x))}>B</button>
                          <button type="button"
                            className={`photoTagBtn${p.tag === "after" ? " tagAfter" : ""}`}
                            onClick={() => setProblemPhotos(prev => prev.map(x => x.id === p.id ? { ...x, tag: x.tag === "after" ? "" : "after" } : x))}>A</button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            <HaccpChatBlock
              chatMessages={chatMessages}
              chatInput={chatInput}
              setChatInput={setChatInput}
              chatSending={chatSending}
              sendChat={sendChat}
              chatListRef={chatListRef}
            />

            <button className="haccpSubmitBtn" onClick={handleSubmit} disabled={submitting}>
              {submitting ? "Submitting…" : "Submit Temperature Log"}
            </button>
          </div>
        </div>
      )}

      {step === "done" && (
        <div className="haccpCard">
          <div className="haccpCardHeader">
            <div className="haccpCardTitle">✅ Submitted!</div>
            <div className="haccpCardSub">Thank you, {supName}</div>
          </div>
          <div className="haccpCardBody">
            {LocationBanner}
            <div className="haccpSuccessBox">
              Your temperature log has been submitted and will appear in the inspection report.
              {problem.trim() && " Your problem report has also been received."}
            </div>
            <HaccpChatBlock
              chatMessages={chatMessages}
              chatInput={chatInput}
              setChatInput={setChatInput}
              chatSending={chatSending}
              sendChat={sendChat}
              chatListRef={chatListRef}
            />
            <button className="haccpSubmitBtn" onClick={() => {
              // Go back to ident screen so a new sessionId is generated for the next submission
              setStep("ident");
              setSupName("");
              setSupPhone("");
              setSessionId(null);
              setProblem("");
              setProblemPhotos([]);
              setTemps(Object.fromEntries(HACCP_TEMP_ITEMS.map(it => [it.key, [""]])));
              setFoodNames(Object.fromEntries(HACCP_TEMP_ITEMS.map(it => [it.key, [""]])));
              setCustomItems([]);
              setEditingLabel(null);
              setEditingLabelVal("");
              setLabelOverrides({});
            }}>
              Submit Another Log
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// End-of-day corrective action prompt modal
function EodCorrectivePrompt({ inspection, rawNotes, onDismiss, onAddNotes }) {
  // Analyze raw notes for action items already documented
  const { grouped } = formatNotesStructured(rawNotes);
  const documentedActions = grouped.action || [];

  // Collect flagged issues that may still need corrective action
  const actionItems = buildActionItems({ inspection, rawNotes });
  // Separate issues that already appear in documented actions vs those that don't
  const flaggedIssues = actionItems.filter(item => {
    // Check if this issue is already referenced in documented actions
    const issueText = item.issue.toLowerCase();
    return !documentedActions.some(a => {
      const aText = a.toLowerCase();
      // Cross-reference by key words
      const words = issueText.split(/\s+/).filter(w => w.length > 4);
      return words.some(w => aText.includes(w));
    });
  });

  const hasDocumented = documentedActions.length > 0;
  const hasPending = flaggedIssues.length > 0;
  const allClear = !hasPending && hasDocumented;
  const noIssues = !hasPending && !hasDocumented;

  return (
    <div className="eodOverlay" onClick={(e) => { if (e.target === e.currentTarget) onDismiss(); }}>
      <div className="eodModal">
        <div className="eodHeader">
          <span className="eodIcon">🌆</span>
          <div>
            <div className="eodTitle">End-of-Day Check</div>
            <div className="eodSub">Did you document all corrective actions taken today?</div>
          </div>
          <button className="eodClose" onClick={onDismiss} title="Dismiss">✕</button>
        </div>

        {noIssues && (
          <div className="eodSection eodAllClear">
            <span className="eodCheck">✅</span>
            <span>No flagged issues found and no notes recorded yet. You&apos;re good to go — or add notes if needed.</span>
          </div>
        )}

        {allClear && (
          <div className="eodSection eodAllClear">
            <span className="eodCheck">✅</span>
            <span>All flagged issues appear to have corrective actions documented. Great job!</span>
          </div>
        )}

        {hasDocumented && (
          <div className="eodSection">
            <div className="eodSectionTitle">✅ Documented corrective actions</div>
            <ul className="eodList">
              {documentedActions.map((a, i) => (
                <li key={i} className="eodItemGood">{a}</li>
              ))}
            </ul>
          </div>
        )}

        {hasPending && (
          <div className="eodSection">
            <div className="eodSectionTitle">⚠️ Issues that may still need corrective action</div>
            <ul className="eodList">
              {flaggedIssues.map((item, i) => (
                <li key={i} className="eodItemWarn">
                  <span className={`eodPriority eodPriority-${item.priority.toLowerCase()}`}>{item.priority}</span>
                  {item.issue}
                </li>
              ))}
            </ul>
          </div>
        )}

        <div className="eodActions">
          <button className="btn btnSecondary eodBtnNotes" onClick={onAddNotes}>
            ✏️ Add notes
          </button>
          <button className="btn btnPrimary eodBtnDone" onClick={onDismiss}>
            ✓ All done for today
          </button>
        </div>
      </div>
    </div>
  );
}

export default function App() {
  const [locked, setLocked] = useState(true);
  const [lockConfirm, setLockConfirm] = useState(false); // two-step logout confirmation
  const [currentUser, setCurrentUser] = useState(null);
  const [page, setPage] = useState("inspector"); // "inspector" | "history" | "admin" | "global_admin"
  const [pendingCount, setPendingCount] = useState(0);
  const [managedVenueId, setManagedVenueId] = useState(null);
  const [managedVenueName, setManagedVenueName] = useState(null);
  const [headerH, setHeaderH] = useState(64);
  const headerRef = useRef(null);
  const translatePopoverRef = useRef(null);
  const translateBtnRef = useRef(null);
  const [translatePos, setTranslatePos] = useState(null); // { top, right } for fixed positioning
  const lastActivity = useRef(Date.now());
  const [showTranslate, setShowTranslate] = useState(false);
  const [translateSearch, setTranslateSearch] = useState("");
  const [activeLang, setActiveLang] = useState("en");
  const logoTapCount = useRef(0);
  const logoTapTimer = useRef(null);

  // Dismiss splash screen once React mounts
  useEffect(() => {
    const splash = document.getElementById("splash");
    if (splash) {
      splash.classList.add("hide");
      setTimeout(() => splash.remove(), 350);
    }
  }, []);

  // Close translate popover when clicking outside it
  useEffect(() => {
    if (!showTranslate) return;
    function handleOutside(e) {
      if (
        translatePopoverRef.current && !translatePopoverRef.current.contains(e.target) &&
        translateBtnRef.current && !translateBtnRef.current.contains(e.target)
      ) {
        setShowTranslate(false);
        setTranslateSearch("");
      }
    }
    document.addEventListener("pointerdown", handleOutside, true);
    return () => document.removeEventListener("pointerdown", handleOutside, true);
  }, [showTranslate]);

  // Keep the Google Translate hidden widget off-screen at all times;
  // translation is triggered programmatically via doGTranslate (see custom picker below).

  // Measure header height for spacer
  useEffect(() => {
    if (!headerRef.current) return;
    const ro = new ResizeObserver(([e]) => setHeaderH(e.contentRect.height));
    ro.observe(headerRef.current);
    setHeaderH(headerRef.current.offsetHeight);
    return () => ro.disconnect();
  }, [locked, page]);

  // Check for pending users (admin notification)
  useEffect(() => {
    if (!currentUser || (currentUser.role !== "admin" && currentUser.role !== "global_admin") || locked) { setPendingCount(0); return; }
    async function checkPending() {
      try {
        const all = await getUsers();
        setPendingCount(all.filter(u => !u.approved).length);
      } catch { /* ignore */ }
    }
    checkPending();
    const iv = setInterval(checkPending, 30000); // re-check every 30s
    return () => clearInterval(iv);
  }, [currentUser, locked, page]);

  // Automated daily cache cleanup — checks once per hour, cleans if new day
  useEffect(() => {
    const LAST_CLEAN_KEY = "sdx_last_cache_clean";
    function cleanIfNewDay() {
      const today = new Date().toISOString().slice(0, 10);
      const last = localStorage.getItem(LAST_CLEAN_KEY);
      if (last === today) return;
      localStorage.setItem(LAST_CLEAN_KEY, today);
      if (navigator.serviceWorker?.controller) {
        navigator.serviceWorker.controller.postMessage("CLEAN_CACHE");
      }
    }
    cleanIfNewDay();
    const timer = setInterval(cleanIfNewDay, 60 * 60 * 1000); // check every hour
    return () => clearInterval(timer);
  }, []);

  // Track how long inspector spends from form-start to Generate Report
  const reportStartedAt = useRef(null);

  // Ref to detect mid-inspection state (used by inactivity timer to skip auto-lock)
  const reportInProgressRef = useRef(false);

  const [noteType, setNoteType] = useState("inspection");
  const [context, setContext] = useState(() => buildDefaultContext("inspection"));
  const [inspection, setInspection] = useState(() => buildDefaultInspection());
  const [foodTemps, setFoodTemps] = useState(() =>
    Object.fromEntries(HACCP_TEMP_ITEMS.map(it => [it.key, [""]]))
  );
  const [foodTempNames, setFoodTempNames] = useState(() =>
    Object.fromEntries(HACCP_TEMP_ITEMS.map(it => [it.key, [""]]))
  );
  const [rawNotes, setRawNotes] = useState("");
  const [notesPhotos, setNotesPhotos] = useState([]);  // photos attached to raw notes section
  const notesPhotoRef = useRef(null);
  const [notesSuggestions, setNotesSuggestions] = useState(null); // detected fields from rawNotes
  const [suggestionsDismissed, setSuggestionsDismissed] = useState(false);
  const [suppliesNeeded, setSuppliesNeeded] = useState([]);  // [{id, item, qty, urgent}]
  const [supplyHistory, setSupplyHistory] = useState(null); // null = not loaded yet, [] = loaded empty
  const supplyHistoryLoadedRef = useRef(false);
  const [standingSupplies, setStandingSupplies] = useState(() => loadParSupplies()); // [{id, item, par}]
  const [showParManager, setShowParManager] = useState(false);
  const [parEditId, setParEditId] = useState(null);   // id of row being edited inline
  const [parDraft, setParDraft] = useState({ item: "", par: "" }); // draft for new/edit row

  // Load past supply records lazily (once) when the user opens the supplies section
  async function ensureSupplyHistory() {
    if (supplyHistoryLoadedRef.current) return;
    supplyHistoryLoadedRef.current = true;
    try {
      const { list } = await loadHistory(undefined, { pageSize: 500 });
      // Build a frequency map: normalised item name → count of past inspections it appeared in
      const freq = {};
      for (const rec of list || []) {
        const seen = new Set();
        for (const s of rec.suppliesNeeded || []) {
          const key = (s.item || "").trim().toLowerCase();
          if (key && !seen.has(key)) { freq[key] = (freq[key] || 0) + 1; seen.add(key); }
        }
      }
      setSupplyHistory(freq);
    } catch { setSupplyHistory({}); }
  }

  // Derive an insight message for a single supply row
  function getSupplyInsight(item, qty) {
    if (!item.trim()) return null;
    const key = item.trim().toLowerCase();
    const qtyNum = parseInt(qty, 10);

    // Par level check (standing supplies)
    const parEntry = standingSupplies.find(s => s.item.trim().toLowerCase() === key);
    if (parEntry) {
      const parNum = parseInt(parEntry.par, 10);
      if (!isNaN(parNum) && !isNaN(qtyNum) && qtyNum < parNum) {
        return { level: "warn", msg: `⚠️ Below par — par level is ${parNum}, you requested ${qtyNum}.` };
      }
      if (!isNaN(parNum)) {
        return { level: "info", msg: `Par level: ${parNum}. You're at or above par.` };
      }
    }

    if (!supplyHistory) return null;
    const count = supplyHistory[key] || 0;

    if (count >= 5) return { level: "warn", msg: `Requested in ${count} past inspections — consider keeping this stocked permanently.` };
    if (count >= 3) return { level: "info", msg: `Needed in ${count} previous inspections — recurring gap.` };
    if (count >= 2) return { level: "info", msg: `Came up ${count} times before — may need regular restocking.` };
    if (count === 1) return { level: "tip", msg: `First restock after 1 previous request — good catch.` };
    if (!isNaN(qtyNum) && qtyNum >= 10) return { level: "tip", msg: `Large quantity — consider adding to the standing order list.` };
    return null;
  }
  const [useCase, setUseCase] = useState(NOTE_TYPES.inspection.useCases[0]);

  const [inspectionType, setInspectionType] = useState("Regular Inspection");
  const [inspectionDate, setInspectionDate] = useState(() => { const _d = new Date(); return `${_d.getFullYear()}-${String(_d.getMonth()+1).padStart(2,"0")}-${String(_d.getDate()).padStart(2,"0")}`; });
  const [inspectorName, setInspectorName] = useState("");
  const [participantName, setParticipantName] = useState("");

  const [siteName, setSiteName] = useState("");
  const [siteNumber, setSiteNumber] = useState("");
  const [restaurantLicense, setRestaurantLicense] = useState("");
  const [supervisorName, setSupervisorName] = useState("");
  const [sitePhone, setSitePhone] = useState("");
  const [locationType, setLocationType] = useState("Concession");
  const [floor, setFloor] = useState("Floor 1");
  const [eventName, setEventName] = useState("");

  const [menuOpen, setMenuOpen] = useState(false);
  const [showShareModal, setShowShareModal] = useState(false);
  const [showHaccpModal, setShowHaccpModal] = useState(false);
  const [showChatPanel, setShowChatPanel] = useState(false);
  const [appLightboxSrc, setAppLightboxSrc] = useState(null);

  const [output, setOutput] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [warnings, setWarnings] = useState([]);
  const [aiTips, setAiTips] = useState([]);
  const [saved, setSaved] = useState(false);
  // Assign a stable reportId immediately on mount so the HACCP QR is always linkable —
  // even before the inspector clicks "Generate". saveToHistory() reuses this same ID.
  const [savedReportId, setSavedReportId] = useState(
    () => `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
  );
  // Ref mirror so saveToHistory always reads the latest ID even inside stale closures
  const savedReportIdRef = useRef(savedReportId);
  const [reportLang, setReportLangState] = useState(() => localStorage.getItem(LANG_KEY) || "en");
  const [showEodPrompt, setShowEodPrompt] = useState(false);
  const rawNotesRef = useRef(null);

  // Keep reportInProgressRef in sync — true when the inspector has started entering data
  // Also detects photos so a photo-only session won't trigger auto-lock
  useEffect(() => {
    const hasText = rawNotes.trim().length > 0 || siteName.trim().length > 0 || output.trim().length > 0;
    // Recursively scan inspection object for any section that has photos
    function hasPhotos(obj) {
      if (!obj || typeof obj !== "object") return false;
      if (Array.isArray(obj.photos) && obj.photos.length > 0) return true;
      return Object.values(obj).some(v => typeof v === "object" && hasPhotos(v));
    }
    const hasInspectionPhotos = hasPhotos(inspection);
    reportInProgressRef.current = hasText || hasInspectionPhotos;
  }, [rawNotes, siteName, output, inspection]);

  // Track activity for auto-lock
  const resetActivity = useCallback(() => { lastActivity.current = Date.now(); }, []);

  useEffect(() => {
    if (locked) return;
    const events = ["mousedown", "keydown", "touchstart", "scroll"];
    events.forEach(e => window.addEventListener(e, resetActivity, { passive: true }));
    const timer = setInterval(() => {
      if (Date.now() - lastActivity.current > LOCK_TIMEOUT_MS) {
        // Don't lock if inspector is mid-report — they would lose unsaved data
        if (reportInProgressRef.current) {
          lastActivity.current = Date.now(); // reset timer silently
          return;
        }
        lockApp();
        setLocked(true);
      }
    }, 30000);
    return () => {
      events.forEach(e => window.removeEventListener(e, resetActivity));
      clearInterval(timer);
    };
  }, [locked, resetActivity]);

  // Pre-fill form from share URL params (runs once on mount)
  useEffect(() => {
    const p = new URLSearchParams(window.location.search);
    if (p.has("inspector")) setInspectorName(p.get("inspector"));
    if (p.has("site"))      setSiteName(p.get("site"));
    if (p.has("unit"))      setSiteNumber(p.get("unit"));
    if (p.has("supervisor")) setSupervisorName(p.get("supervisor"));
    if (p.has("phone"))     setSitePhone(p.get("phone"));
    if (p.has("type"))      setInspectionType(p.get("type"));
    if (p.has("date"))      setInspectionDate(p.get("date"));
    // Clean URL without reloading — skip if this is the HACCP portal (params needed for HaccpPortal)
    if (p.toString() && !IS_HACCP_PORTAL) window.history.replaceState({}, "", window.location.pathname);
  }, []);

  // Warn before leaving with unsaved work
  useEffect(() => {
    function handleBeforeUnload(e) {
      if (rawNotes.trim() && !saved) {
        e.preventDefault();
        e.returnValue = "";
      }
    }
    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, [rawNotes, saved]);

  // ── Auto-save draft every 30 s while inspector has started filling data ──
  // Saves to localStorage so nothing is lost on accidental tab close / refresh.
  // Draft is cleared when the report is saved or the form is explicitly reset.
  useEffect(() => {
    const id = setInterval(() => {
      if (!reportInProgressRef.current) return; // nothing started yet
      saveDraft({
        noteType, useCase, context, inspection,
        rawNotes, inspectionType, inspectionDate,
        inspectorName, participantName,
        siteName, siteNumber, restaurantLicense,
        supervisorName, sitePhone, locationType, floor, eventName,
        foodTemps, foodTempNames,
        savedReportId,
      });
    }, 30000); // every 30 seconds
    return () => clearInterval(id);
  }, [noteType, useCase, context, inspection, rawNotes, inspectionType,
      inspectionDate, inspectorName, participantName, siteName, siteNumber,
      restaurantLicense, supervisorName, sitePhone, locationType, floor,
      eventName, foodTemps, foodTempNames]);

  // On unlock: check for a saved draft and offer to restore it
  const [draftBanner, setDraftBanner] = useState(null); // null | draft object
  useEffect(() => {
    if (locked) return; // only run after login
    const draft = loadDraft();
    if (draft && draft.draftSavedAt) {
      setDraftBanner(draft);
    }
  }, [locked]); // runs once right after the user unlocks

  // Scan rawNotes for structured fields the inspector may have typed in the notes box
  useEffect(() => {
    setSuggestionsDismissed(false); // reset dismissal whenever notes change significantly
    if (!rawNotes || rawNotes.trim().length < 10) { setNotesSuggestions(null); return; }
    const detected = extractFieldsFromNotes(rawNotes);
    // Only surface suggestions for fields that are currently empty or would differ
    const actionable = {};
    if (detected.restaurantLicense && !restaurantLicense.trim())
      actionable.restaurantLicense = detected.restaurantLicense;
    if (detected.supervisorName && !supervisorName.trim())
      actionable.supervisorName = detected.supervisorName;
    if (detected.inspectorName && !inspectorName.trim())
      actionable.inspectorName = detected.inspectorName;
    if (detected.siteName && !siteName.trim())
      actionable.siteName = detected.siteName;
    if (detected.siteNumber && !siteNumber.trim())
      actionable.siteNumber = detected.siteNumber;
    setNotesSuggestions(Object.keys(actionable).length > 0 ? actionable : null);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rawNotes]);


  // Block browser swipe-to-navigate (back/forward) so filling out a report
  // near the screen edge can't accidentally reset the page.
  useEffect(() => {
    let startX = 0;
    let startY = 0;
    function onTouchStart(e) {
      startX = e.touches[0].clientX;
      startY = e.touches[0].clientY;
    }
    function onTouchMove(e) {
      const dx = Math.abs(e.touches[0].clientX - startX);
      const dy = Math.abs(e.touches[0].clientY - startY);
      // Only block clearly horizontal swipes (not vertical scrolling)
      if (dx > dy && dx > 10) {
        e.preventDefault();
      }
    }
    document.addEventListener("touchstart", onTouchStart, { passive: true });
    document.addEventListener("touchmove", onTouchMove, { passive: false });
    return () => {
      document.removeEventListener("touchstart", onTouchStart);
      document.removeEventListener("touchmove", onTouchMove);
    };
  }, []);

  // End-of-day corrective action prompt — checks every 5 minutes
  // Triggers when hour >= 17 (5 PM) and inspection has flagged issues or raw notes present
  useEffect(() => {
    const EOD_DISMISS_KEY = "sdx_eod_dismissed";
    function checkEod() {
      const now = new Date();
      const hour = now.getHours();
      if (hour < 17) return; // before 5 PM — don't show
      const today = now.toISOString().slice(0, 10);
      const dismissed = localStorage.getItem(EOD_DISMISS_KEY);
      if (dismissed === today) return; // already dismissed today
      // Only show if there's actual inspection work (has site name or raw notes)
      if (!siteName.trim() && !rawNotes.trim()) return;
      setShowEodPrompt(true);
    }
    checkEod();
    const timer = setInterval(checkEod, 5 * 60 * 1000); // re-check every 5 min
    return () => clearInterval(timer);
  }, [siteName, rawNotes]);

  // NOTE: useMemo hooks must be declared before any conditional early returns (Rules of Hooks)
  const canShare = inspectorName.trim().length > 0 && siteName.trim().length > 0;
  // QR appears as soon as name + location are filled (unit number optional)
  const canShowQr = siteName.trim().length > 0 && inspectorName.trim().length > 0;
  const shareUrl = useMemo(
    () => buildShareUrl({ inspectorName, siteName, siteNumber, supervisorName, sitePhone, inspectionType, inspectionDate }),
    [inspectorName, siteName, siteNumber, supervisorName, sitePhone, inspectionType, inspectionDate]
  );

  // Supervisor HACCP portal — IS_HACCP_PORTAL is captured at module load from the original URL,
  // so replaceState() cleaning the URL after mount never causes this check to flip to false.
  if (IS_HACCP_PORTAL) return <HaccpPortal />;

  if (locked) return <BadgeScreen onUnlock={(user) => {
    setCurrentUser(user);
    setLocked(false);
    resetActivity();
    // Global admin lands on the global panel, not the inspector
    if (user?.role === "global_admin") {
      setPage("global_admin");
      return;
    }
    if (user?.role === "guest" && user?.sponsoredByName) {
      // Guest reports: inspector = sponsor, participant = guest
      setInspectorName(user.sponsoredByName);
      setParticipantName(user.name || "");
      reportStartedAt.current = Date.now(); // name is known — start timer now
    } else if (user?.name) {
      // Always fill inspector name from the logged-in user — they know who they are
      setInspectorName(user.name);
      setParticipantName("");
      reportStartedAt.current = Date.now(); // name is known — start timer now
    } else {
      // No name yet — timer will start when they type their name
      reportStartedAt.current = null;
    }
    if (user?.assignedLocation && (user.role === "guest" || user.role === "location_manager")) {
      setSiteName(user.assignedLocation);
    }
  }} />;
  if (page === "history") { AIEngine.trackPage("history"); return <HistoryPage onBack={() => {
    if (managedVenueId) { setVenue(VENUE_ID); setManagedVenueId(null); setManagedVenueName(null); setPage("global_admin"); }
    else { setPage("inspector"); }
  }} onEdit={loadRecordForEdit} managedVenueId={managedVenueId} managedVenueName={managedVenueName} currentUser={currentUser} />; }
  if (page === "global_admin") {
    return <GlobalAdminPanel
      currentUser={currentUser}
      onBack={() => { setVenue(VENUE_ID); setManagedVenueId(null); setManagedVenueName(null); setPage("inspector"); }}
      onManageVenue={(id, name) => {
        setVenue(id);
        setManagedVenueId(id);
        setManagedVenueName(name);
        setPage("admin");
      }}
      onEnterVenue={(id, name) => {
        setVenue(id);
        setManagedVenueId(id);
        setManagedVenueName(name);
        setPage("inspector");
      }}
      onCreateReport={(id, name) => {
        setVenue(id);
        setManagedVenueId(id);
        setManagedVenueName(name);
        startNewInspection();
        setPage("inspector");
      }}
    />;
  }
  if (page === "admin") {
    AIEngine.trackPage("admin");
    return <AdminPanel
      currentUser={currentUser}
      onBack={() => {
        if (managedVenueId) {
          setVenue(VENUE_ID);
          setManagedVenueId(null);
          setManagedVenueName(null);
          setPage("global_admin");
        } else {
          setPage("inspector");
        }
      }}
      onNavigate={setPage}
      managedVenueId={managedVenueId}
      managedVenueName={managedVenueName}
    />;
  }
  if (page === "performance") { AIEngine.trackPage("performance"); return <PerformanceDashboard onBack={() => setPage("admin")} managedVenueId={managedVenueId} managedVenueName={managedVenueName} />; }
  if (page === "myteam")      { return <MyTeamPage currentUser={currentUser} onBack={() => setPage("inspector")} />; }
  if (page === "mytemps")     { return <MyTempsPage currentUser={currentUser} onBack={() => setPage("inspector")} />; }

  const spec = NOTE_TYPES[noteType];

  function switchNoteType(next) {
    setNoteType(next);
    setContext(buildDefaultContext(next));
    setInspection(buildDefaultInspection());
    setUseCase(NOTE_TYPES[next].useCases[0]);
    setRawNotes("");
    setOutput("");
    setError("");
    setWarnings([]);
    setAiTips([]);
  }

  function startNewInspection() {
    reportStartedAt.current = null; // reset — timer restarts when name is typed/confirmed
    setContext(buildDefaultContext(noteType));
    setInspection(buildDefaultInspection());
    setNotesPhotos([]);
    setProblemPhotos([]);
    // Pre-fill supplies from standing par list (items with a par > 0 become default rows)
    const standing = loadParSupplies();
    const prefilled = standing
      .filter(s => s.item.trim())
      .map(s => ({ id: `par_${Date.now()}_${Math.random().toString(36).slice(2,6)}`, item: s.item.trim(), qty: String(s.par || ""), urgent: false }));
    setSuppliesNeeded(prefilled);
    setRawNotes("");
    setOutput("");
    setError("");
    setWarnings([]);
    setAiTips([]);
    setSaved(false);
    savedReportIdRef.current = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    setSavedReportId(savedReportIdRef.current);
    setInspectionType("Regular Inspection");
    setInspectionDate(() => { const _d = new Date(); return `${_d.getFullYear()}-${String(_d.getMonth()+1).padStart(2,"0")}-${String(_d.getDate()).padStart(2,"0")}`; });
    if (currentUser?.role === "guest" && currentUser?.sponsoredByName) {
      setInspectorName(currentUser.sponsoredByName);
      setParticipantName(currentUser.name || "");
      reportStartedAt.current = Date.now(); // name auto-filled — start timer
    } else if (currentUser?.name) {
      setInspectorName(currentUser.name);
      setParticipantName("");
      reportStartedAt.current = Date.now(); // name auto-filled — start timer
    } else {
      setInspectorName("");
      setParticipantName("");
      // reportStartedAt stays null until they type their name
    }
    setSiteName("");
    setSiteNumber("");
    setRestaurantLicense("");
    setSupervisorName("");
    setSitePhone("");
    setLocationType("Concession");
    setFloor("Floor 1");
    setEventName("");
    clearDraft(); // explicitly reset — discard any saved draft
    setDraftBanner(null);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function loadRecordForEdit(rec) {
    // Permission check: only the original author, admins, or global_admin may edit.
    const isAdmin = currentUser?.role === "admin" || currentUser?.role === "global_admin";
    const isAuthor = rec.savedByHash && currentUser?.badgeHash && rec.savedByHash === currentUser.badgeHash;
    if (!isAdmin && !isAuthor) return;
    try {
      // Restore every field from the saved record back into the form
      const nt = NOTE_TYPES[rec.noteType] ? rec.noteType : "inspection";
      setNoteType(nt);
      setInspectionType(rec.inspectionType || "Regular Inspection");
      setInspectionDate(rec.inspectionDate || "");
      setInspectorName(rec.inspectorName || "");
      setParticipantName(rec.participantName || "");
      setSiteName(rec.siteName || "");
      setSiteNumber(rec.siteNumber || "");
      setRestaurantLicense(rec.restaurantLicense || "");
      setSupervisorName(rec.supervisorName || "");
      setSitePhone(rec.sitePhone || "");
      setLocationType(rec.locationType || "Concession");
      setFloor(rec.floor || "Floor 1");
      setEventName(rec.eventName || "");
      setContext(rec.context && typeof rec.context === "object" ? { ...rec.context } : buildDefaultContext(nt));
      setInspection(rec.inspection && typeof rec.inspection === "object" ? { ...rec.inspection } : buildDefaultInspection());
      // Restore HACCP food temps
      if (rec.foodTemps && typeof rec.foodTemps === "object") setFoodTemps({ ...rec.foodTemps });
      if (rec.foodTempNames && typeof rec.foodTempNames === "object") setFoodTempNames({ ...rec.foodTempNames });
      // Restore notes photos from the saved record
      setNotesPhotos(Array.isArray(rec.inspection?._notesPhotos) ? rec.inspection._notesPhotos : []);
      setProblemPhotos([]);
      setSuppliesNeeded(Array.isArray(rec.suppliesNeeded) ? rec.suppliesNeeded : []);
      setRawNotes(rec.rawNotes || "");
      setOutput(rec.output || "");
      // Keep the same report ID so re-saving overwrites the existing record
      savedReportIdRef.current = rec.id;
      setSavedReportId(rec.id);
      setSaved(false);
      setError("");
      setWarnings([]);
      setAiTips([]);
      clearDraft();
      setDraftBanner(null);
    } catch (e) {
      console.error("loadRecordForEdit error:", e);
    }
    // Always navigate to inspector even if some fields failed to restore
    setPage("inspector");
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function loadSample() {
    const s = NOTE_TYPES[noteType].sample;
    setContext({ ...s.context });
    setInspection(s.inspection ? { ...s.inspection } : buildDefaultInspection());
    setRawNotes(s.rawNotes || "");
    setInspectionType(s.meta?.inspectionType || "Regular Inspection");
    setInspectionDate(s.meta?.inspectionDate || s.context?.date || "");
    setInspectorName(s.meta?.inspectorName || "");
    setSiteName("");
    setSiteNumber("");
    setSupervisorName("");
    setSitePhone("");
    setOutput("");
    setError("");
    setWarnings([]);
    setAiTips([]);
  }

  async function addNotesPhotos(files) {
    const accepted = Array.from(files || []).slice(0, PHOTO_LIMIT - notesPhotos.length);
    const enriched = [];
    let uploadFailCount = 0;
    const inspId = savedReportId || `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    for (const f of accepted) {
      if (!f.type.startsWith("image/")) continue;
      if (bytesToMb(f.size) > PHOTO_MAX_MB) continue;
      const thumbUrl = await compressImage(f);
      if (!thumbUrl) continue;
      const photoId = `${Date.now()}_${Math.random().toString(16).slice(2)}`;
      let previewUrl = thumbUrl;
      if (FIREBASE_ON) {
        const storageData = await compressImage(f, 1200, 0.82);
        const storageUrl = await uploadPhoto(storageData || thumbUrl, activeVenueId, inspId, photoId);
        if (storageUrl) {
          previewUrl = storageUrl;
        } else {
          uploadFailCount++;
        }
      }
      enriched.push({ id: photoId, name: f.name, previewUrl, tag: "" });
    }
    if (enriched.length === 0) return;
    if (uploadFailCount > 0) {
      setError(`⚠️ ${uploadFailCount} photo${uploadFailCount > 1 ? "s" : ""} saved as low-res thumbnail (cloud upload failed). Check your internet connection. The photo${uploadFailCount > 1 ? "s" : ""} will still appear in reports.`);
      setTimeout(() => setError(""), 8000);
    }
    setNotesPhotos(prev => [...prev, ...enriched].slice(0, PHOTO_LIMIT));
  }

  function setReportLang(code) {
    setReportLangState(code);
    localStorage.setItem(LANG_KEY, code);
  }

  async function onTransform() {
    setError("");
    setWarnings([]);
    setAiTips([]);

    // Validate
    const w = validateForm({ inspectionDate, inspectorName, context, noteType, inspection, restaurantLicense, locationType });
    if (w.length) setWarnings(w);

    setLoading(true);
    try {
      const out = transformLocally({
        noteType, useCase, context, inspection, rawNotes,
        inspectionType, inspectionDate, inspectorName, participantName,
        siteName, siteNumber, sitePhone, supervisorName, floor, eventName,
        reportLang,
      });
      setOutput(out);

      // Run AI assist
      const tips = aiAssist({ inspection, rawNotes, context, noteType });
      setAiTips(tips);
    } catch (e) {
      setError(e?.message || "Something went wrong");
      setLoading(false);
      return;
    }
    setLoading(false);

    // Auto-save immediately after generating so the inspector doesn't have to click Save separately
    try {
      await saveToHistory();
    } catch {
      // saveToHistory handles its own error state via setError
    }
  }

  async function copyOutput() {
    if (!output) return;
    await navigator.clipboard.writeText(output);
  }

  function showEmailPreviewNow() {
    const preview = emailPreview({
      noteType, context, inspection, rawNotes, inspectionType,
      inspectionDate: inspectionDate || context?.date || "",
      inspectorName, siteName, siteNumber, sitePhone, supervisorName, floor,
    });
    setOutput(preview);
    setError("");
  }
  function runAiAssist() {
    const tips = aiAssist({ inspection, rawNotes, context, noteType });
    setAiTips(tips);
  }

  async function saveToHistory() {
    // Keep photo data (previewUrl) so saved reports display their pictures.
    // Only strip previewUrl from photos whose data URL is missing or empty.
    function stripPhotos(obj) {
      if (!obj || typeof obj !== "object") return obj;
      if (Array.isArray(obj)) return obj.map(stripPhotos);
      const out = {};
      for (const [k, v] of Object.entries(obj)) {
        if (k === "photos" && Array.isArray(v)) {
          out.photos = v.map(p => ({
            id: p.id,
            name: p.name,
            sizeMb: p.sizeMb,
            type: p.type,
            tag: p.tag || "",
            // Prefer HTTPS Storage URLs (no size concern).
            // If Storage upload failed, previewUrl is a compressed thumbnail base64 (~5-15 KB)
            // from compressImage(f, 200, 0.3) — small enough to keep in Firestore as a fallback.
            // Only drop it if it's empty/undefined.
            previewUrl: p.previewUrl || "",
          }));
        } else {
          out[k] = stripPhotos(v);
        }
      }
      return out;
    }

    const record = {
      // Reuse the provisional ID assigned at onTransform() time so that any
      // chat messages written before saving remain associated with this record.
      id: savedReportIdRef.current || savedReportId || `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      savedAt: new Date().toISOString(),
      savedByHash: currentUser?.badgeHash || "",
      noteType, inspectionType, inspectionDate, inspectorName, participantName,
      siteName, siteNumber, restaurantLicense, supervisorName, sitePhone, locationType, floor, eventName,
      suppliesNeeded: suppliesNeeded.filter(s => s.item.trim()),
      location: siteName || context?.kitchen || "Kitchen",
      context: { ...context },
      temps: { ...inspection.temps },
      foodTemps: { ...foodTemps },
      foodTempNames: { ...foodTempNames },
      overallStatus: calcOverallStatus(inspection),
      actionItems: buildActionItems({ inspection, rawNotes }),
      rawNotes,
      // output is NOT stored — it's regenerated on demand from transformLocally.
      // Storing the full report text was pushing documents over Firestore's 1MB limit.
      inspection: {
        ...stripPhotos(inspection),
        // Notes photos travel with the inspection so buildPhotoIndex can find them
        _notesPhotos: notesPhotos.map(p => ({ id: p.id, name: p.name, sizeMb: p.sizeMb, type: p.type, tag: p.tag || "", previewUrl: p.previewUrl || "" })),
      },
      photoCount: countPhotos(inspection) + notesPhotos.length,
      // Time-to-complete tracking: seconds from first inspector name keystroke to Save
      reportDurationSeconds: reportStartedAt.current
        ? Math.round((Date.now() - reportStartedAt.current) / 1000)
        : null,
    };
    // Log approximate document size to help diagnose size issues
    const docSizeKb = Math.round(JSON.stringify(record).length / 1024);
    console.log(`saveToHistory: doc ~${docSizeKb} KB (limit 1024 KB)`);
    if (docSizeKb > 900) {
      console.warn("saveToHistory: document approaching 1MB limit!", docSizeKb, "KB");
    }
    try {
      await saveOneInspection(record);
      learnFromSave(record);
      clearDraft(); // draft committed — remove auto-save
      setSaved(true);
      savedReportIdRef.current = record.id;
      setSavedReportId(record.id);
      setTimeout(() => setSaved(false), 2500);
      // Tell AI engine about the new save — triggers self-improvement cycle
      AIEngine.trackAction("saveInspection", {
        overallStatus: record.overallStatus,
        inspectionType: record.inspectionType,
        locationType: record.locationType || "unknown",
        issueCount: (record.actionItems || []).length,
        inspectorName: record.inspectorName || "",
        siteName: record.siteName || record.location || "",
        reportDurationSeconds: record.reportDurationSeconds,
      });
      const { list: allHistory } = await loadHistory(undefined, { pageSize: 2000 });
      AIEngine.learnFromInspection(record, allHistory);
      persistAnalyticsSnapshot(VENUE_ID);
    } catch (e) {
      console.error("Save failed:", e, "doc size:", docSizeKb, "KB");
      const errMsg = (e?.message || "").toLowerCase();
      const msg = e?.code === "permission-denied"
        ? "Save failed — permission denied. Check Firestore rules."
        : (errMsg.includes("size") || errMsg.includes("too large") || errMsg.includes("exceed") || docSizeKb > 900)
          ? "Save failed — document too large. Try removing some photos."
          : `Save failed: ${e?.message || "Check your connection and try again."}`;
      setError(msg);
    }
  }

  function onDownloadCsv() {
    exportAsCsv({ inspection, notesPhotos, rawNotes, inspectionType, inspectionDate, inspectorName, participantName, siteName, siteNumber, supervisorName, floor, eventName });
  }

  function onDownloadHtml() {
    exportAsHtml({ output, inspection, notesPhotos, rawNotes, inspectionType, inspectionDate, siteName, siteNumber, sitePhone, inspectorName, participantName, supervisorName, floor, eventName });
  }

  function onDownloadTxt() {
    exportAsTxt({ output, inspectionDate, siteName });
  }

  return (
    <div className="appShell inspectorPage">
      <header className="topBar" ref={headerRef}>
        <div className="brandLeft brandClickable" onClick={() => {
          setPage("inspector"); window.scrollTo({ top: 0, behavior: "smooth" });
          // Secret 5-tap: only navigates to global_admin if user has that role
          logoTapCount.current += 1;
          clearTimeout(logoTapTimer.current);
          if (logoTapCount.current >= 5) {
            logoTapCount.current = 0;
            if (currentUser?.role === "global_admin") setPage("global_admin");
          } else {
            logoTapTimer.current = setTimeout(() => { logoTapCount.current = 0; }, 1500);
          }
        }} title="Home">
          <img src={LOGO_WHITE} alt="Sodexo" className="brandLogo" />
          <div>
            <div className="brandTitle">Kitchen Inspection</div>
            <div className="brandSub">Turn sit-down inspection notes into organized documents</div>
          </div>
        </div>

        {/* Header actions: Share + Translate + Generate + Hamburger */}
        <div className="topActionsHamburger">
          {canShare && (
            <button className="btn btnShare" type="button" onClick={() => setShowShareModal(true)} title="Share pre-filled form link">
              📤 Share
            </button>
          )}
          {/* Page translate button */}
          <div style={{ position: "relative" }}>
            <button
              ref={translateBtnRef}
              className={`translateTriggerBtn${showTranslate ? " translateTriggerActive" : ""}`}
              type="button"
              title="Translate this page"
              onClick={() => {
                if (!showTranslate && translateBtnRef.current) {
                  const r = translateBtnRef.current.getBoundingClientRect();
                  setTranslatePos({
                    top: r.bottom + 10,
                    right: window.innerWidth - r.right,
                  });
                }
                setShowTranslate(v => !v);
              }}
            >
              <span className="translateGlobe">🌐</span>
              <span className="translateBtnLabel">Translate</span>
            </button>
            {showTranslate && (() => {
              const LANGS = [
                { code: "en",    flag: "🇺🇸", name: "English"    },
                { code: "es",    flag: "🇪🇸", name: "Spanish"    },
                { code: "fr",    flag: "🇫🇷", name: "French"     },
                { code: "pt",    flag: "🇧🇷", name: "Portuguese" },
                { code: "ht",    flag: "🇭🇹", name: "Haitian Creole" },
                { code: "zh-CN", flag: "🇨🇳", name: "Chinese"    },
                { code: "ar",    flag: "🇸🇦", name: "Arabic"     },
                { code: "hi",    flag: "🇮🇳", name: "Hindi"      },
                { code: "de",    flag: "🇩🇪", name: "German"     },
                { code: "it",    flag: "🇮🇹", name: "Italian"    },
                { code: "ja",    flag: "🇯🇵", name: "Japanese"   },
                { code: "ko",    flag: "🇰🇷", name: "Korean"     },
                { code: "ru",    flag: "🇷🇺", name: "Russian"    },
                { code: "pl",    flag: "🇵🇱", name: "Polish"     },
                { code: "vi",    flag: "🇻🇳", name: "Vietnamese" },
                { code: "tl",    flag: "🇵🇭", name: "Filipino"   },
                { code: "uk",    flag: "🇺🇦", name: "Ukrainian"  },
                { code: "nl",    flag: "🇳🇱", name: "Dutch"      },
                { code: "tr",    flag: "🇹🇷", name: "Turkish"    },
                { code: "th",    flag: "🇹🇭", name: "Thai"       },
              ];
              const q = translateSearch.trim().toLowerCase();
              const filtered = q
                ? LANGS.filter(l => l.name.toLowerCase().includes(q) || l.code.includes(q))
                : LANGS;
              const isMobile = window.innerWidth <= 500;
              return (
                <div
                  ref={translatePopoverRef}
                  className="translatePopover"
                  onClick={e => e.stopPropagation()}
                  style={translatePos ? (isMobile ? {
                    // On mobile: stretch edge-to-edge with 8px margins,
                    // anchored just below the header button
                    position: "fixed",
                    top: translatePos.top,
                    left: 8,
                    right: 8,
                    width: "auto",
                  } : {
                    position: "fixed",
                    top: translatePos.top,
                    right: translatePos.right,
                    left: "auto",
                    width: 300,
                  }) : undefined}
                >
                  <div className="translatePopoverHeader">
                    <span className="translatePopoverIcon">🌐</span>
                    <div>
                      <div className="translatePopoverTitle">Page Translation</div>
                      <div className="translatePopoverSub">
                        {activeLang === "en" ? "Select a language" : `Active: ${LANGS.find(l => l.code === activeLang)?.name ?? activeLang}`}
                      </div>
                    </div>
                  </div>
                  <div className="translatePopoverDivider" />
                  <div className="translateSearchWrap">
                    <input
                      className="translateSearchInput"
                      type="text"
                      placeholder="Search language…"
                      value={translateSearch}
                      onChange={e => setTranslateSearch(e.target.value)}
                      autoFocus
                    />
                  </div>
                  <div className="translateLangGrid">
                    {filtered.map(lang => (
                      <button
                        key={lang.code}
                        className={`translateLangBtn${activeLang === lang.code ? " translateLangActive" : ""}`}
                        type="button"
                        onClick={() => {
                          setActiveLang(lang.code);
                          setShowTranslate(false);
                          setTranslateSearch("");
                          const targetCode = lang.code;
                          // Try doGTranslate (Google's internal API) first — instant.
                          // Fall back to select manipulation with retry loop.
                          function applyViaSelect(remaining) {
                            const sel = document.querySelector("#google_translate_element select");
                            if (sel) {
                              const nativeSetter = Object.getOwnPropertyDescriptor(
                                window.HTMLSelectElement.prototype, "value"
                              )?.set;
                              if (nativeSetter) nativeSetter.call(sel, targetCode);
                              else sel.value = targetCode;
                              sel.dispatchEvent(new Event("change", { bubbles: true }));
                              setTimeout(() => {
                                if (sel.value !== targetCode && remaining > 0) {
                                  applyViaSelect(remaining - 1);
                                }
                              }, 200);
                            } else if (remaining > 0) {
                              setTimeout(() => applyViaSelect(remaining - 1), 200);
                            }
                          }
                          function applyTranslation() {
                            // Method 1: doGTranslate internal API (fastest, no flash)
                            if (typeof window.doGTranslate === "function") {
                              window.doGTranslate(`en|${targetCode}`);
                              return;
                            }
                            // Method 2: select element manipulation with retry
                            applyViaSelect(10);
                          }
                          applyTranslation();
                        }}
                      >
                        <span className="translateLangFlag">{lang.flag}</span>
                        <span className="translateLangName">{lang.name}</span>
                      </button>
                    ))}
                    {filtered.length === 0 && (
                      <div className="translateNoResults">No languages found</div>
                    )}
                  </div>
                  <div className="translatePopoverFooter">
                    <span className="translatePoweredLogo">G</span>
                    Powered by Google Translate
                  </div>
                </div>
              );
            })()}
          </div>
          {/* HACCP QR button moved to sticky action bar after save */}
          <button className={cx("btn", "btnPrimary", "btnGenHeader")} onClick={onTransform} type="button" disabled={loading}>
            {loading ? "Generating..." : "Generate Report"}
          </button>
          <button className="hamburgerBtn" onClick={() => { setMenuOpen(v => !v); setShowTranslate(false); }} type="button" aria-label="Menu">
            <span className={cx("hamburgerIcon", menuOpen && "hamburgerOpen")}>
              <span /><span /><span />
            </span>
            {pendingCount > 0 && <span className="hamburgerBadge">{pendingCount}</span>}
          </button>
        </div>

        {/* Dropdown menu */}
        {menuOpen && (
          <div className="dropdownMenu" onClick={() => { setMenuOpen(false); setLockConfirm(false); }}>
            {currentUser && (
              <div className="dropdownMenuUser">
                {currentUser.name}
                {currentUser.role === "global_admin" ? " (Global Admin)" : currentUser.role === "admin" ? " (Admin)" : currentUser.role === "location_manager" ? " (Manager)" : currentUser.role === "guest" ? " (Guest)" : ""}
                {currentUser.role === "location_manager" && currentUser.assignedLocation && (
                  <div style={{ fontSize: "0.72rem", color: "#94a3b8", marginTop: 2 }}>📍 {currentUser.assignedLocation}</div>
                )}
                {currentUser.role === "guest" && currentUser.assignedLocation && (
                  <div style={{ fontSize: "0.72rem", color: "#94a3b8", marginTop: 2 }}>📍 {currentUser.assignedLocation}</div>
                )}
              </div>
            )}
            <button className="dropdownMenuItem" onClick={startNewInspection} type="button">+ New Inspection</button>
            <button className="dropdownMenuItem" onClick={() => setPage("history")} type="button">Past Reports</button>
            {currentUser?.role === "global_admin" && (
              <button className="dropdownMenuItem" onClick={() => setPage("global_admin")} type="button">
                🌐 Global Admin
              </button>
            )}
            {(currentUser?.role === "admin" || currentUser?.role === "global_admin") && (
              <button className="dropdownMenuItem" onClick={() => setPage("admin")} type="button">
                Admin Panel
                {pendingCount > 0 && <span className="menuBadge">{pendingCount} pending</span>}
              </button>
            )}
            {(currentUser?.role === "location_manager" || currentUser?.role === "inspector") && (
              <button className="dropdownMenuItem" onClick={() => setPage("myteam")} type="button">
                👥 My Team
              </button>
            )}
            {currentUser?.role === "location_manager" && (
              <button className="dropdownMenuItem" onClick={() => setPage("mytemps")} type="button">
                🌡️ Temperature Logs
              </button>
            )}
            {lockConfirm ? (
              <div style={{ padding: "0.5rem 1rem", display: "flex", flexDirection: "column", gap: 6, borderTop: "1px solid #fee2e2", background: "#fff5f5" }} onClick={e => e.stopPropagation()}>
                <span style={{ fontSize: "0.82rem", color: "#b91c1c", fontWeight: 600 }}>Lock the app?</span>
                <div style={{ display: "flex", gap: 6 }}>
                  <button className="btn" style={{ flex: 1, background: "#dc2626", color: "#fff", border: "none", fontSize: "0.8rem", padding: "0.3rem 0" }}
                    type="button"
                    onClick={() => { setLockConfirm(false); lockApp(); setCurrentUser(null); setLocked(true); }}>
                    Yes, Lock
                  </button>
                  <button className="btn btnGhost" style={{ flex: 1, fontSize: "0.8rem", padding: "0.3rem 0" }}
                    type="button"
                    onClick={() => setLockConfirm(false)}>
                    Cancel
                  </button>
                </div>
              </div>
            ) : (
              <button className="dropdownMenuItem dropdownMenuDanger" onClick={e => { e.stopPropagation(); setLockConfirm(true); }} type="button">Lock App</button>
            )}
          </div>
        )}
      </header>
      <div style={{ height: headerH, flexShrink: 0 }} />

      {/* Draft restore banner — shown after login when an unsaved draft exists */}
      {draftBanner && (
        <div style={{ background: "#fefce8", border: "1px solid #fde047", padding: "0.75rem 1.25rem", display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
          <span style={{ fontSize: "1.1rem" }}>📋</span>
          <span style={{ flex: 1, color: "#854d0e", fontWeight: 600, fontSize: "0.9rem" }}>
            Unsaved draft found from {(() => { try { return new Date(draftBanner.draftSavedAt).toLocaleString([], { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" }); } catch { return draftBanner.draftSavedAt; } })()} — restore it?
          </span>
          <button type="button" className="btn" style={{ background: "#2A295C", color: "#fff", borderColor: "#2A295C", fontSize: "0.85rem", padding: "0.4rem 1rem" }}
            onClick={() => {
              const d = draftBanner;
              if (d.noteType) setNoteType(d.noteType);
              if (d.useCase) setUseCase(d.useCase);
              if (d.context) setContext(d.context);
              if (d.inspection) setInspection(d.inspection);
              if (d.rawNotes !== undefined) setRawNotes(d.rawNotes);
              if (d.inspectionType) setInspectionType(d.inspectionType);
              if (d.inspectionDate) setInspectionDate(d.inspectionDate);
              if (d.inspectorName !== undefined) setInspectorName(d.inspectorName);
              if (d.participantName !== undefined) setParticipantName(d.participantName);
              if (d.siteName !== undefined) setSiteName(d.siteName);
              if (d.siteNumber !== undefined) setSiteNumber(d.siteNumber);
              if (d.restaurantLicense !== undefined) setRestaurantLicense(d.restaurantLicense);
              if (d.supervisorName !== undefined) setSupervisorName(d.supervisorName);
              if (d.sitePhone !== undefined) setSitePhone(d.sitePhone);
              if (d.locationType) setLocationType(d.locationType);
              if (d.floor) setFloor(d.floor);
              if (d.eventName !== undefined) setEventName(d.eventName);
              if (d.foodTemps) setFoodTemps(d.foodTemps);
              if (d.foodTempNames) setFoodTempNames(d.foodTempNames);
              if (d.savedReportId) { savedReportIdRef.current = d.savedReportId; setSavedReportId(d.savedReportId); }
              setDraftBanner(null);
            }}>
            Restore Draft
          </button>
          <button type="button" className="btn btnGhost" style={{ fontSize: "0.85rem", padding: "0.4rem 1rem" }}
            onClick={() => { clearDraft(); setDraftBanner(null); }}>
            Discard
          </button>
        </div>
      )}

      {/* Venue context banner — shown when global admin is working inside a specific venue */}
      {managedVenueId && (
        <div style={{
          background: "linear-gradient(135deg, #2A295C 0%, #283897 100%)",
          color: "#fff",
          padding: "0.65rem 1.25rem",
          display: "flex",
          alignItems: "center",
          gap: 12,
          flexWrap: "wrap",
        }}>
          <span style={{ fontSize: "1.1rem" }}>🏟️</span>
          <span style={{ flex: 1, fontWeight: 700, fontSize: "0.92rem" }}>
            {managedVenueName || managedVenueId}
            <span style={{ fontWeight: 400, fontSize: "0.8rem", opacity: 0.8, marginLeft: 8 }}>— working in this venue</span>
          </span>
          <button type="button"
            onClick={() => { setVenue(VENUE_ID); setManagedVenueId(null); setManagedVenueName(null); setPage("global_admin"); }}
            style={{ background: "rgba(255,255,255,0.15)", border: "1.5px solid rgba(255,255,255,0.4)", color: "#fff", borderRadius: 6, padding: "0.3rem 0.85rem", fontWeight: 600, fontSize: "0.82rem", cursor: "pointer", whiteSpace: "nowrap" }}>
            ← All Venues
          </button>
        </div>
      )}

      <main className="grid">
        {/* LEFT */}
        <section className="card">
          <div className="cardHeader">
            <div className="cardTitle">Inspection Details</div>
            <button
              type="button"
              onClick={() => document.getElementById("supplies-section")?.scrollIntoView({ behavior: "smooth", block: "center" })}
              style={{ marginLeft: "auto", padding: "5px 12px", borderRadius: 8, border: "1px solid #c4b5fd", background: "#f5f3ff", cursor: "pointer", fontSize: "0.78rem", fontWeight: 700, color: "#5b21b6", whiteSpace: "nowrap" }}
              title="Jump to Supplies section"
            >🧴 Supplies ↓</button>
          </div>

          <div className="cardBody">
            <div className="fieldGrid">
              <label className="field">
                <span className="fieldLabel">Type</span>
                <select className="select" value={inspectionType} onChange={(e) => setInspectionType(e.target.value)}>
                  {INSPECTION_TYPES.map((t) => (<option key={t} value={t}>{t}</option>))}
                </select>
              </label>
              <label className="field" id="field-inspectionDate">
                <span className="fieldLabel">Date</span>
                <input className="input" type="date" value={inspectionDate} onChange={(e) => setInspectionDate(e.target.value)} />
              </label>
              <label className="field" id="field-inspectorName">
                <span className="fieldLabel">Inspector</span>
                <input className="input" value={inspectorName} onChange={(e) => {
                  // Start the report timer the first time the inspector types their name
                  if (!reportStartedAt.current && e.target.value.trim().length > 0) {
                    reportStartedAt.current = Date.now();
                  }
                  setInspectorName(e.target.value);
                }} placeholder="e.g., J. Da Silva" />
              </label>
              <label className="field" id="field-participantName">
                <span className="fieldLabel">Participants <span style={{ fontWeight: 400, color: "#9ca3af", fontSize: "0.8rem" }}>(optional)</span></span>
                <input className="input" value={participantName} onChange={(e) => setParticipantName(e.target.value)} placeholder="e.g., Chef Rodriguez, GM Martinez" />
              </label>
              <label className="field" id="field-supervisorName">
                <span className="fieldLabel">Supervisor</span>
                <input className="input" list="supervisorSuggestions" value={supervisorName} onChange={(e) => setSupervisorName(e.target.value)} placeholder="e.g., GM / Chef Lead" />
                <datalist id="supervisorSuggestions">
                  {/* Only suggest supervisors remembered for the current site — prevents cross-site contamination */}
                  {(() => {
                    const mem = getAutofillMemory();
                    const siteSuper = siteName ? mem.siteMap?.[siteName]?.supervisorName : null;
                    // If we have a site-specific supervisor, offer only that; otherwise offer nothing
                    // (do NOT offer all supervisors from all sites)
                    return siteSuper ? [<option key="site" value={siteSuper} />] : null;
                  })()}
                </datalist>
              </label>
              <label className="field" id="field-siteName">
                <span className="fieldLabel">
                  Restaurant Name
                  {currentUser?.role === "guest" && <span style={{ marginLeft: 6, fontSize: "0.7rem", background: "#fef9c3", color: "#854d0e", padding: "1px 7px", borderRadius: 20, fontWeight: 700 }}>Assigned</span>}
                </span>
                {currentUser?.role === "guest" ? (
                  <input className="input" value={siteName} readOnly style={{ background: "#f8fafc", color: "#475569", cursor: "not-allowed" }} title="Location is set by your manager" />
                ) : (
                  <>
                    <input className="input" list="siteNameSuggestions" value={siteName} onChange={(e) => {
                      const val = e.target.value;
                      setSiteName(val);
                      const mem = getAutofillMemory();
                      const mapped = mem.siteMap?.[val];
                      if (mapped) {
                        if (mapped.siteNumber && !siteNumber) setSiteNumber(mapped.siteNumber);
                        if (mapped.sitePhone && !sitePhone) setSitePhone(mapped.sitePhone);
                        if (mapped.supervisorName && !supervisorName) setSupervisorName(mapped.supervisorName);
                        if (mapped.locationType) setLocationType(mapped.locationType);
                        if (mapped.floor) setFloor(mapped.floor);
                        // Restore remembered equipment for Portable / Subcontractor sites
                        const lt = mapped.locationType || locationType;
                        if ((lt === "Portable" || lt === "Subcontractor") && mapped.equipmentItems?.length) {
                          const restoredEquip = buildEquipFromMemory(mapped.equipmentItems);
                          setInspection(prev => ({ ...prev, equipment: restoredEquip }));
                        }
                      }
                    }} placeholder="e.g., North Stand Kitchen" />
                    <datalist id="siteNameSuggestions">
                      {(getAutofillMemory().siteName || []).map((s, i) => <option key={i} value={s} />)}
                    </datalist>
                  </>
                )}
              </label>
              <label className="field" id="field-siteNumber">
                <span className="fieldLabel">Unit Number</span>
                <input className="input" list="siteNumberSuggestions" value={siteNumber} onChange={(e) => setSiteNumber(e.target.value)} placeholder="e.g., Unit 12 / Loc-204" />
                <datalist id="siteNumberSuggestions">
                  {(getAutofillMemory().siteNumber || []).map((s, i) => <option key={i} value={s} />)}
                </datalist>
              </label>
              <label className="field" id="field-restaurantLicense">
                <span className="fieldLabel">Restaurant License #</span>
                <input className="input" value={restaurantLicense} onChange={(e) => setRestaurantLicense(e.target.value)} placeholder="e.g., FD-2024-00123" />
              </label>
              <label className="field">
                <span className="fieldLabel">Location Type</span>
                <select className="select" value={locationType} onChange={(e) => setLocationType(e.target.value)}>
                  {LOCATION_TYPES.map((t) => (<option key={t} value={t}>{t}</option>))}
                </select>
              </label>
              <label className="field">
                <span className="fieldLabel">Phone (optional)</span>
                <input className="input" value={sitePhone} onChange={(e) => setSitePhone(e.target.value)} placeholder="e.g., (305) 555-0123" />
              </label>
              <label className="field">
                <span className="fieldLabel">Floor</span>
                <select className="select" value={floor} onChange={(e) => setFloor(e.target.value)}>
                  {FLOOR_OPTIONS.map((f) => (<option key={f} value={f}>{f}</option>))}
                </select>
              </label>
              <label className="field">
                <span className="fieldLabel">Event Name (optional)</span>
                <input className="input" value={eventName} onChange={(e) => setEventName(e.target.value)} placeholder="e.g., Super Bowl LVIII, UFC 305" />
              </label>
            </div>

            <div className="guide">
              <div className="guideHeader">
                <div>
                  <div className="guideTitle">Inspector guide</div>
                  <div className="guideSub">Checklist for {locationType || "kitchen"} inspections</div>
                </div>
                <div className="pillRow">
                  <span className="pill">Hand sink {"\u2265"} 95 F</span>
                  <span className="pill">3-comp wash {"\u2265"} 110 F</span>
                  <span className="pill">Cooler {"\u2264"} 40 F</span>
                  <span className="pill">Freezer {"\u2264"} 20 F</span>
                </div>
              </div>

              <GuideSection title="🏢 Building & Maintenance"
                items={[
                  { path: ["facility", "ceiling"], label: "Ceiling — any leaks, stains, or damage?" },
                  { path: ["facility", "walls"], label: "Walls — clean, no holes or damage?" },
                  { path: ["facility", "floors"], label: "Floors — clean, no standing water or cracks?" },
                  { path: ["facility", "lighting"], label: "Lighting — all lights working and bright enough?" },
                ]} inspection={inspection} setInspection={setInspection}
                allowCustom sectionKey="facility"
                inspectionId={savedReportId} venueId={activeVenueId} onError={msg => { setError(msg); setTimeout(() => setError(""), 8000); }}
                maintenanceItems={[
                  { path: ["maintenance", "pestControl"],       label: "Pest Control — any signs of bugs, insects, or rodents?", hasPriority: true },
                  { path: ["maintenance", "hvac"],              label: "AC / Ventilation — working properly, no bad smells?", hasPriority: true },
                  { path: ["maintenance", "plumbing"],          label: "Plumbing / Drains — no leaks, clogs, or slow drains?", hasPriority: true },
                  { path: ["maintenance", "electricalSafety"],  label: "Electrical — no exposed wires, outlets work safely?", hasPriority: true },
                  { path: ["maintenance", "dumpsterArea"],      label: "Trash / Dumpster — clean, lids closed, no odor?", hasPriority: true },
                  { path: ["maintenance", "structuralDamage"],  label: "Building — any cracks, broken fixtures, or hazards?", hasPriority: true },
                ]} />

              <GuideSection title="👷 Employee Practices & Operations"
                items={[
                  { path: ["operations", "employeePractices"], label: "Employee Practices — gloves on, hair nets worn, no eating near food?" },
                  { path: ["operations", "handwashing"], label: "Hand Washing — soap and paper towels stocked, staff washing properly?" },
                  { path: ["operations", "labelingDating"], label: "Food Labeling — all containers labeled with item name and prep date?" },
                  { path: ["operations", "logs"], label: "Records / Logs — temperature logs and checklists completed and up to date?" },
                ]} inspection={inspection} setInspection={setInspection}
                allowCustom sectionKey="operations" inspectionId={savedReportId} venueId={activeVenueId} onError={msg => { setError(msg); setTimeout(() => setError(""), 8000); }} />

              {/* ── Supplies Needed ─────────────────────────────────────── */}
              {(() => {
                const urgentCount = suppliesNeeded.filter(s => s.urgent && s.item.trim()).length;
                const insightColors = {
                  warn: { bg: "#fff7ed", border: "#fdba74", text: "#c2410c", icon: "⚠️" },
                  info: { bg: "#eff6ff", border: "#93c5fd", text: "#1d4ed8", icon: "📋" },
                  tip:  { bg: "#f0fdf4", border: "#86efac", text: "#15803d", icon: "💡" },
                };
                return (
                  <div id="supplies-section" style={{ border: "2px solid #c4b5fd", borderRadius: 12, padding: "14px 16px", background: "#f5f3ff", marginTop: 10 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
                      <span style={{ fontWeight: 700, fontSize: "1rem", color: "#5b21b6" }}>🧴 Supplies Needed</span>
                      {urgentCount > 0 && (
                        <span style={{ background: "#fee2e2", color: "#dc2626", borderRadius: 10, padding: "1px 8px", fontSize: "0.75rem", fontWeight: 700 }}>
                          {urgentCount} urgent
                        </span>
                      )}
                      <span style={{ marginLeft: "auto", fontSize: "0.75rem", color: "#9ca3af" }}>Items to restock or replace</span>
                    </div>

                    {suppliesNeeded.length === 0 && (
                      <div style={{ fontSize: "0.82rem", color: "#9ca3af", marginBottom: 8, fontStyle: "italic" }}>
                        No supplies added yet.
                      </div>
                    )}

                    {suppliesNeeded.map((s, idx) => {
                      const insight = getSupplyInsight(s.item, s.qty);
                      const ic = insight ? insightColors[insight.level] : null;
                      return (
                        <div key={s.id} style={{ marginBottom: insight ? 10 : 6 }}>
                          <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                            <input
                              type="text"
                              placeholder="Supply item (e.g. Gloves, Sanitizer, Cutting boards)"
                              value={s.item}
                              onChange={e => setSuppliesNeeded(prev => prev.map((x, i) => i === idx ? { ...x, item: e.target.value } : x))}
                              style={{ flex: 1, padding: "7px 10px", borderRadius: 8, border: `1px solid ${insight ? ic.border : "#d1d5db"}`, fontSize: "0.875rem", outline: "none", background: insight ? ic.bg : "#fff" }}
                            />
                            <input
                              type="text"
                              placeholder="Qty"
                              value={s.qty}
                              onChange={e => setSuppliesNeeded(prev => prev.map((x, i) => i === idx ? { ...x, qty: e.target.value } : x))}
                              style={{ width: 60, padding: "7px 8px", borderRadius: 8, border: "1px solid #d1d5db", fontSize: "0.875rem", outline: "none", textAlign: "center" }}
                            />
                            <button
                              type="button"
                              title={s.urgent ? "Mark as normal" : "Mark as urgent"}
                              onClick={() => setSuppliesNeeded(prev => prev.map((x, i) => i === idx ? { ...x, urgent: !x.urgent } : x))}
                              style={{ padding: "6px 10px", borderRadius: 8, border: `1px solid ${s.urgent ? "#fca5a5" : "#e5e7eb"}`, background: s.urgent ? "#fee2e2" : "#f9fafb", cursor: "pointer", fontSize: "0.78rem", fontWeight: 700, color: s.urgent ? "#dc2626" : "#9ca3af", flexShrink: 0 }}
                            >
                              {s.urgent ? "🔴 Urgent" : "Urgent?"}
                            </button>
                            <button
                              type="button"
                              onClick={() => setSuppliesNeeded(prev => prev.filter((_, i) => i !== idx))}
                              style={{ padding: "6px 9px", borderRadius: 8, border: "1px solid #e5e7eb", background: "#f9fafb", cursor: "pointer", color: "#9ca3af", fontSize: "1rem", lineHeight: 1, flexShrink: 0 }}
                              title="Remove"
                            >×</button>
                          </div>
                          {insight && (
                            <div style={{ marginTop: 4, marginLeft: 2, padding: "5px 10px", borderRadius: 7, background: ic.bg, border: `1px solid ${ic.border}`, color: ic.text, fontSize: "0.77rem", fontWeight: 600, display: "flex", alignItems: "center", gap: 5 }}>
                              <span>{ic.icon}</span>
                              <span>{insight.msg}</span>
                            </div>
                          )}
                        </div>
                      );
                    })}

                    <button
                      type="button"
                      onClick={() => {
                        ensureSupplyHistory();
                        setSuppliesNeeded(prev => [...prev, { id: `${Date.now()}_${Math.random().toString(36).slice(2, 6)}`, item: "", qty: "", urgent: false }]);
                      }}
                      style={{ marginTop: 2, padding: "6px 14px", borderRadius: 8, border: "1px dashed #d1d5db", background: "#fafafa", cursor: "pointer", fontSize: "0.82rem", color: "#6b7280", fontWeight: 600 }}
                    >
                      + Add Supply Item
                    </button>

                  </div>
                );
              })()}

              <div className="equipCheckWrapper">
                <div className="equipCheckBanner">
                  🌡️ Temperatures &amp; Equipment Check
                  <span className="equipCheckBannerSub">Record all temperatures and check the status of every piece of equipment</span>
                </div>

                {/* ── Key Temperatures: Sinks ── */}
                <div style={{ padding: "14px 16px 16px", borderBottom: "1px solid #e2e8f0" }}>
                  <div style={{ fontWeight: 700, fontSize: "0.88rem", color: "var(--sdx-navy)", marginBottom: 10 }}>Key Temperatures</div>
                  <div className="tempsGrid">
                    <div className="field" id="field-handSinkTempF" style={{ marginTop: 0 }}>
                      <span className="fieldLabel">Hand Washing Sink</span>
                      <div style={{ fontSize: "0.75rem", color: "#64748b", marginBottom: 4 }}>Must be at least 95°F</div>
                      <div className="tempInputWrap">
                        <input className="input tempInput" inputMode="numeric" value={inspection.temps.handSinkTempF}
                          onChange={(e) => setInspection((prev) => ({ ...prev, temps: { ...prev.temps, handSinkTempF: e.target.value } }))}
                          placeholder="97" />
                        <span className="tempUnit">{"\u00B0F"}</span>
                      </div>
                      {(() => {
                        const v = Number(inspection.temps.handSinkTempF);
                        if (!inspection.temps.handSinkTempF) return null;
                        if (v >= 95) return <span className="tempStatusBadge tempStatusGood">✅ {v}°F — Good</span>;
                        if (v >= 85) return <span className="tempStatusBadge tempStatusWarn">⚠️ {v}°F — Low, needs 95°F</span>;
                        return <span className="tempStatusBadge tempStatusBad">🚨 {v}°F — Too cold</span>;
                      })()}
                      {inspection.temps.handSinkTempF !== "" && (
                        <textarea className="input" rows={2} placeholder="Notes (optional)"
                          value={inspection.temps.handSinkNote || ""}
                          onChange={(e) => setInspection((prev) => ({ ...prev, temps: { ...prev.temps, handSinkNote: e.target.value } }))}
                          style={{ marginTop: 6, resize: "vertical", fontSize: "0.82rem" }} />
                      )}
                    </div>
                    <div className="field" id="field-threeCompSinkTempF" style={{ marginTop: 0 }}>
                      <span className="fieldLabel">3-Compartment Wash Sink</span>
                      <div style={{ fontSize: "0.75rem", color: "#64748b", marginBottom: 4 }}>Must be at least 110°F</div>
                      <div className="tempInputWrap">
                        <input className="input tempInput" inputMode="numeric" value={inspection.temps.threeCompSinkTempF}
                          onChange={(e) => setInspection((prev) => ({ ...prev, temps: { ...prev.temps, threeCompSinkTempF: e.target.value } }))}
                          placeholder="112" />
                        <span className="tempUnit">{"\u00B0F"}</span>
                      </div>
                      {(() => {
                        const v = Number(inspection.temps.threeCompSinkTempF);
                        if (!inspection.temps.threeCompSinkTempF) return null;
                        if (v >= 110) return <span className="tempStatusBadge tempStatusGood">✅ {v}°F — Good</span>;
                        if (v >= 100) return <span className="tempStatusBadge tempStatusWarn">⚠️ {v}°F — Low, needs 110°F</span>;
                        return <span className="tempStatusBadge tempStatusBad">🚨 {v}°F — Too cold</span>;
                      })()}
                      {inspection.temps.threeCompSinkTempF !== "" && (
                        <textarea className="input" rows={2} placeholder="Notes (optional)"
                          value={inspection.temps.threeCompSinkNote || ""}
                          onChange={(e) => setInspection((prev) => ({ ...prev, temps: { ...prev.temps, threeCompSinkNote: e.target.value } }))}
                          style={{ marginTop: 6, resize: "vertical", fontSize: "0.82rem" }} />
                      )}
                    </div>
                  </div>
                </div>

                {/* ── Equipment checklist + cooler/freezer temps ── */}
                {locationType === "Concession" ? (
                  <GuideSection title="🔧 Coolers, Freezers &amp; Equipment"
                    items={[
                      { path: ["equipment", "doubleDoorCooler"], label: "Double-Door Cooler — door seals tight, no warm spots inside?" },
                      { path: ["equipment", "doubleDoorFreezer"], label: "Double-Door Freezer — food frozen solid, no frost buildup on walls?" },
                      { path: ["equipment", "walkInCooler"], label: "Walk-In Cooler — floor clean, door gasket sealing, light working?" },
                      { path: ["equipment", "walkInFreezer"], label: "Walk-In Freezer — door seals tight, no ice on floor, food off ground?" },
                      { path: ["equipment", "prepCooler"], label: "Prep Cooler — keeping ingredients cold during prep, lid closing properly?" },
                      { path: ["equipment", "warmers"], label: "Food Warmers / Hot Holding — keeping food hot above 135°F?" },
                      { path: ["equipment", "ovens"], label: "Ovens — heating evenly, clean inside, no damage?" },
                      { path: ["equipment", "threeCompSink"], label: "Dish Washing Sink — 3 sections set up: wash, rinse, sanitize?" },
                      { path: ["equipment", "ecolab"], label: "Chemicals / Sanitizer (Ecolab) — correct concentration, properly labeled?" },
                    ]} inspection={inspection} setInspection={setInspection}
                    allowCustom sectionKey="equipment" coldEquipmentMap={COLD_EQUIPMENT} inspectionId={savedReportId} venueId={activeVenueId} onError={msg => { setError(msg); setTimeout(() => setError(""), 8000); }} />
                ) : locationType === "Bar" ? (
                  <GuideSection title="🔧 Coolers, Freezers &amp; Equipment — Bar"
                    items={[
                      { path: ["equipment", "backBarCooler"], label: "Back Bar Cooler — clean inside, bottles organized?" },
                      { path: ["equipment", "beerWalkInCooler"], label: "Beer Walk-In Cooler — door seals tight, kegs stored safely?" },
                      { path: ["equipment", "underBarCooler"], label: "Under-Bar Cooler — clean, door closing properly?" },
                      { path: ["equipment", "iceBin"], label: "Ice Bin / Ice Machine — clean, no mold or pink slime, scoop stored handle-up?" },
                      { path: ["equipment", "wineChiller"], label: "Wine Chiller — temp correct, bottles stored properly?" },
                      { path: ["equipment", "glasswasher"], label: "Glass Washer — working, sanitizer level OK, no cloudy glasses?" },
                      { path: ["equipment", "threeCompSink"], label: "Dish Washing Sink — 3 sections set up: wash, rinse, sanitize?" },
                      { path: ["equipment", "beerLines"], label: "Beer Lines / Taps — cleaned recently, no buildup or off smell?" },
                      { path: ["equipment", "ecolab"], label: "Chemicals / Sanitizer (Ecolab) — correct concentration, properly labeled?" },
                    ]} inspection={inspection} setInspection={setInspection}
                    allowCustom sectionKey="equipment" coldEquipmentMap={BAR_COLD_EQUIPMENT} inspectionId={savedReportId} venueId={activeVenueId} onError={msg => { setError(msg); setTimeout(() => setError(""), 8000); }} />
                ) : locationType === "Event / Temporary" ? (
                  <GuideSection
                    title="🔧 Coolers, Freezers &amp; Equipment — Event / Temporary"
                    items={[]}
                    inspection={inspection} setInspection={setInspection}
                    allowCustom sectionKey="equipment" coldEquipmentMap={COLD_EQUIPMENT}
                    inspectionId={savedReportId} venueId={activeVenueId} onError={msg => { setError(msg); setTimeout(() => setError(""), 8000); }}
                    emptyHint="Event-only location. Tap + Add Item to add each piece of equipment here. This list will NOT be saved for future inspections because the equipment is temporary."
                  />
                ) : (
                  <GuideSection
                    title={`🔧 Coolers, Freezers & Equipment — ${locationType}`}
                    items={[]}
                    inspection={inspection} setInspection={setInspection}
                    allowCustom sectionKey="equipment" coldEquipmentMap={COLD_EQUIPMENT}
                    inspectionId={savedReportId} venueId={activeVenueId} onError={msg => { setError(msg); setTimeout(() => setError(""), 8000); }}
                    emptyHint={`Tap + Add Item to add each piece of equipment at this ${locationType} location. Your list will be remembered for next time.`}
                  />
                )}
              </div>

            {/* ── HACCP Food Temperatures ─────────────────────────────── */}
            <div style={{
              border: "1px solid #e2e8f0",
              borderRadius: 14,
              overflow: "hidden",
              marginBottom: "1.5rem",
            }}>
              <div style={{
                background: "#f8fafc",
                color: "var(--sdx-navy)",
                fontSize: "1.05rem",
                fontWeight: 700,
                padding: "14px 18px 12px",
                display: "flex",
                flexDirection: "column",
                gap: 4,
                letterSpacing: "0.01em",
                borderBottom: "1px solid #e2e8f0",
              }}>
                🌡️ HACCP Food Temperatures
                <span style={{ fontSize: "0.8rem", fontWeight: 400, color: "var(--sdx-gray-500)" }}>
                  Record food temps for hot holding, cold holding, cooking, and walk-in units
                </span>
              </div>
              <div style={{ padding: "12px 14px", display: "flex", flexDirection: "column", gap: 10 }}>
                {HACCP_TEMP_ITEMS.map(item => {
                  const readings = foodTemps[item.key] || [""];
                  const names = foodTempNames[item.key] || [""];
                  return (
                    <div key={item.key} style={{ borderBottom: "1px solid #e2e8f0", paddingBottom: 10 }}>
                      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 6 }}>
                        <span style={{ fontWeight: 700, fontSize: "0.88rem", color: "var(--sdx-navy)" }}>
                          {item.label}
                          <span style={{ fontWeight: 400, fontSize: "0.75rem", color: "var(--sdx-gray-500)", marginLeft: 6 }}>
                            {item.type === "hot" ? `Min ${item.min}°F` : `Max ${item.max}°F`}
                          </span>
                        </span>
                        <button type="button"
                          className="btn btnGhost btnSmall"
                          style={{ fontSize: "0.75rem" }}
                          onClick={() => {
                            setFoodTemps(p => ({ ...p, [item.key]: [...(p[item.key] || [""]), ""] }));
                            setFoodTempNames(p => ({ ...p, [item.key]: [...(p[item.key] || [""]), ""] }));
                          }}>
                          + Reading
                        </button>
                      </div>
                      {readings.map((val, idx) => {
                        const pass = tempPass(item, val);
                        const name = names[idx] ?? "";
                        return (
                          <div key={idx} style={{ display: "flex", gap: 6, alignItems: "center", marginBottom: 4 }}>
                            <input
                              className="input"
                              type="text"
                              placeholder="Food item"
                              value={name}
                              onChange={e => setFoodTempNames(p => {
                                const arr = [...(p[item.key] || [""])];
                                arr[idx] = e.target.value;
                                return { ...p, [item.key]: arr };
                              })}
                              style={{ flex: 1, minWidth: 0, fontSize: "0.82rem" }}
                            />
                            <div className="tempInputWrap" style={{ width: 90 }}>
                              <input
                                className="input tempInput"
                                type="number"
                                inputMode="decimal"
                                placeholder="—"
                                value={val}
                                onChange={e => setFoodTemps(p => {
                                  const arr = [...(p[item.key] || [""])];
                                  arr[idx] = e.target.value;
                                  return { ...p, [item.key]: arr };
                                })}
                              />
                              <span className="tempUnit">°F</span>
                            </div>
                            <span style={{
                              fontSize: "0.75rem", fontWeight: 600, minWidth: 56, textAlign: "center",
                              color: pass === null ? "#9ca3af" : pass ? "#16a34a" : "#dc2626",
                            }}>
                              {pass === null ? "—" : pass ? "✓ OK" : "⚠️ Flag"}
                            </span>
                            {readings.length > 1 && (
                              <button type="button"
                                className="btn btnGhost btnSmall"
                                style={{ color: "#9ca3af", padding: "2px 6px", fontSize: "0.8rem" }}
                                onClick={() => {
                                  setFoodTemps(p => {
                                    const arr = (p[item.key] || [""]).filter((_, i) => i !== idx);
                                    return { ...p, [item.key]: arr.length ? arr : [""] };
                                  });
                                  setFoodTempNames(p => {
                                    const arr = (p[item.key] || [""]).filter((_, i) => i !== idx);
                                    return { ...p, [item.key]: arr.length ? arr : [""] };
                                  });
                                }}>✕</button>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  );
                })}
              </div>
            </div>

            </div>

            {/* Ice maker / ice machine last cleaning date */}
            <div className="field" style={{ marginTop: 4 }}>
              <div className="fieldLabelRow">
                <span className="fieldLabel">Ice maker last cleaned</span>
                <span className="hint">Tracks cleaning compliance</span>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <input
                  type="date"
                  className="input"
                  style={{ maxWidth: 200 }}
                  value={inspection.temps.iceMakerCleanedDate || ""}
                  onChange={e => setInspection(prev => ({ ...prev, temps: { ...prev.temps, iceMakerCleanedDate: e.target.value } }))}
                />
                {inspection.temps.iceMakerCleanedDate && (
                  <button
                    type="button"
                    className="btn btnGhost btnSmall"
                    style={{ color: "#6b7280" }}
                    onClick={() => setInspection(prev => ({ ...prev, temps: { ...prev.temps, iceMakerCleanedDate: "" } }))}
                  >Clear</button>
                )}
              </div>
            </div>

            <div className="field">
              <div className="fieldLabelRow">
                <span className="fieldLabel">Raw notes <span style={{ fontWeight: 400, color: "#9ca3af", fontSize: "0.8rem" }}>(optional)</span></span>
                <span className="hint">Abbreviations are expanded while preserving meaning</span>
              </div>
              <textarea ref={rawNotesRef} className="textarea" value={rawNotes} onChange={(e) => setRawNotes(e.target.value)} placeholder="Paste quick inspection notes here..." rows={10} />

              {/* ── Smart Field Detection Banner ─────────────────────────── */}
              {notesSuggestions && !suggestionsDismissed && (
                <div style={{ marginTop: 8, background: "#fffbeb", border: "1px solid #f59e0b", borderRadius: 10, padding: "10px 14px" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 8 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 6, fontWeight: 700, fontSize: "0.82rem", color: "#92400e" }}>
                      <span>🔍</span>
                      <span>Fields detected in your notes — apply them to the form?</span>
                    </div>
                    <button
                      type="button"
                      onClick={() => setSuggestionsDismissed(true)}
                      style={{ background: "none", border: "none", cursor: "pointer", color: "#9ca3af", fontSize: "1rem", lineHeight: 1, padding: 0, flexShrink: 0 }}
                      title="Dismiss"
                    >✕</button>
                  </div>
                  <div style={{ marginTop: 8, display: "flex", flexDirection: "column", gap: 6 }}>
                    {notesSuggestions.restaurantLicense && (
                      <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: "0.8rem" }}>
                        <span style={{ color: "#78350f", minWidth: 90, fontWeight: 600 }}>LICENSE:</span>
                        <span style={{ flex: 1, color: "#451a03", fontFamily: "monospace", background: "#fef3c7", padding: "2px 6px", borderRadius: 4 }}>
                          {notesSuggestions.restaurantLicense.value}
                        </span>
                        <button
                          type="button"
                          onClick={() => {
                            setRestaurantLicense(notesSuggestions.restaurantLicense.value);
                            setNotesSuggestions(prev => { const n = { ...prev }; delete n.restaurantLicense; return Object.keys(n).length ? n : null; });
                          }}
                          style={{ padding: "3px 10px", borderRadius: 6, border: "1px solid #f59e0b", background: "#fef3c7", cursor: "pointer", fontWeight: 700, fontSize: "0.78rem", color: "#92400e", whiteSpace: "nowrap" }}
                        >Apply</button>
                      </div>
                    )}
                    {notesSuggestions.supervisorName && (
                      <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: "0.8rem" }}>
                        <span style={{ color: "#78350f", minWidth: 90, fontWeight: 600 }}>Supervisor:</span>
                        <span style={{ flex: 1, color: "#451a03", background: "#fef3c7", padding: "2px 6px", borderRadius: 4 }}>
                          {notesSuggestions.supervisorName.value}
                        </span>
                        <button
                          type="button"
                          onClick={() => {
                            setSupervisorName(notesSuggestions.supervisorName.value);
                            setNotesSuggestions(prev => { const n = { ...prev }; delete n.supervisorName; return Object.keys(n).length ? n : null; });
                          }}
                          style={{ padding: "3px 10px", borderRadius: 6, border: "1px solid #f59e0b", background: "#fef3c7", cursor: "pointer", fontWeight: 700, fontSize: "0.78rem", color: "#92400e", whiteSpace: "nowrap" }}
                        >Apply</button>
                      </div>
                    )}
                    {notesSuggestions.inspectorName && (
                      <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: "0.8rem" }}>
                        <span style={{ color: "#78350f", minWidth: 90, fontWeight: 600 }}>Inspector:</span>
                        <span style={{ flex: 1, color: "#451a03", background: "#fef3c7", padding: "2px 6px", borderRadius: 4 }}>
                          {notesSuggestions.inspectorName.value}
                        </span>
                        <button
                          type="button"
                          onClick={() => {
                            setInspectorName(notesSuggestions.inspectorName.value);
                            setNotesSuggestions(prev => { const n = { ...prev }; delete n.inspectorName; return Object.keys(n).length ? n : null; });
                          }}
                          style={{ padding: "3px 10px", borderRadius: 6, border: "1px solid #f59e0b", background: "#fef3c7", cursor: "pointer", fontWeight: 700, fontSize: "0.78rem", color: "#92400e", whiteSpace: "nowrap" }}
                        >Apply</button>
                      </div>
                    )}
                    {notesSuggestions.siteName && (
                      <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: "0.8rem" }}>
                        <span style={{ color: "#78350f", minWidth: 90, fontWeight: 600 }}>Site Name:</span>
                        <span style={{ flex: 1, color: "#451a03", background: "#fef3c7", padding: "2px 6px", borderRadius: 4 }}>
                          {notesSuggestions.siteName.value}
                        </span>
                        <button
                          type="button"
                          onClick={() => {
                            setSiteName(notesSuggestions.siteName.value);
                            setNotesSuggestions(prev => { const n = { ...prev }; delete n.siteName; return Object.keys(n).length ? n : null; });
                          }}
                          style={{ padding: "3px 10px", borderRadius: 6, border: "1px solid #f59e0b", background: "#fef3c7", cursor: "pointer", fontWeight: 700, fontSize: "0.78rem", color: "#92400e", whiteSpace: "nowrap" }}
                        >Apply</button>
                      </div>
                    )}
                    {notesSuggestions.siteNumber && (
                      <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: "0.8rem" }}>
                        <span style={{ color: "#78350f", minWidth: 90, fontWeight: 600 }}>Site #:</span>
                        <span style={{ flex: 1, color: "#451a03", fontFamily: "monospace", background: "#fef3c7", padding: "2px 6px", borderRadius: 4 }}>
                          {notesSuggestions.siteNumber.value}
                        </span>
                        <button
                          type="button"
                          onClick={() => {
                            setSiteNumber(notesSuggestions.siteNumber.value);
                            setNotesSuggestions(prev => { const n = { ...prev }; delete n.siteNumber; return Object.keys(n).length ? n : null; });
                          }}
                          style={{ padding: "3px 10px", borderRadius: 6, border: "1px solid #f59e0b", background: "#fef3c7", cursor: "pointer", fontWeight: 700, fontSize: "0.78rem", color: "#92400e", whiteSpace: "nowrap" }}
                        >Apply</button>
                      </div>
                    )}
                    {Object.keys(notesSuggestions).length > 1 && (
                      <button
                        type="button"
                        onClick={() => {
                          if (notesSuggestions.restaurantLicense) setRestaurantLicense(notesSuggestions.restaurantLicense.value);
                          if (notesSuggestions.supervisorName) setSupervisorName(notesSuggestions.supervisorName.value);
                          if (notesSuggestions.inspectorName) setInspectorName(notesSuggestions.inspectorName.value);
                          if (notesSuggestions.siteName) setSiteName(notesSuggestions.siteName.value);
                          if (notesSuggestions.siteNumber) setSiteNumber(notesSuggestions.siteNumber.value);
                          setNotesSuggestions(null);
                          setSuggestionsDismissed(true);
                        }}
                        style={{ alignSelf: "flex-end", marginTop: 2, padding: "5px 14px", borderRadius: 7, border: "1px solid #d97706", background: "#f59e0b", cursor: "pointer", fontWeight: 700, fontSize: "0.8rem", color: "#fff" }}
                      >Apply All</button>
                    )}
                  </div>
                </div>
              )}

              <input ref={notesPhotoRef} type="file" accept="image/*" multiple className="fileInput"
                onChange={e => { addNotesPhotos(e.target.files); e.target.value = ""; }} />
              <button type="button" className="btn btnGhost btnSmall photoBtn"
                style={{ marginTop: 8 }}
                onClick={() => notesPhotoRef.current?.click()}>
                📷 Add photos to notes
              </button>
              {notesPhotos.length > 0 && (
                <div className="photoStrip" style={{ marginTop: 8 }}>
                  {notesPhotos.map(p => (
                    <div className="photoThumbWrap" key={p.id}>
                      <div className="photoThumb">
                        <img src={p.previewUrl} alt={p.name} style={{ cursor: "zoom-in" }} onClick={() => setAppLightboxSrc(p.previewUrl)} />
                        <button type="button" className="thumbX"
                          onClick={() => setNotesPhotos(prev => prev.filter(x => x.id !== p.id))}>×</button>
                      </div>
                      <div className="photoTagRow">
                        <button type="button"
                          className={`photoTagBtn${p.tag === "before" ? " tagBefore" : ""}`}
                          onClick={() => setNotesPhotos(prev => prev.map(x => x.id === p.id ? { ...x, tag: x.tag === "before" ? "" : "before" } : x))}>B</button>
                        <button type="button"
                          className={`photoTagBtn${p.tag === "after" ? " tagAfter" : ""}`}
                          onClick={() => setNotesPhotos(prev => prev.map(x => x.id === p.id ? { ...x, tag: x.tag === "after" ? "" : "after" } : x))}>A</button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {warnings.length > 0 && (
              <div className="warningBox">
                <strong>Missing information:</strong>
                <ul>{warnings.map((w, i) => (
                  <li key={i} className="warningLink" onClick={() => {
                    const el = document.getElementById(w.fieldId);
                    if (el) {
                      el.scrollIntoView({ behavior: "smooth", block: "center" });
                      const input = el.querySelector("input, select, textarea");
                      if (input) setTimeout(() => input.focus(), 400);
                      el.classList.add("fieldHighlight");
                      setTimeout(() => el.classList.remove("fieldHighlight"), 2000);
                    }
                  }}>{w.text}</li>
                ))}</ul>
              </div>
            )}
            {error ? <div className="errorBox">{error}</div> : null}
          </div>
        </section>

        {/* RIGHT */}
        <section className="card" id="report-output">
          <div className="cardHeader">
            <div>
              <div className="cardTitle">Output</div>
              <div className="cardSub">{prettyTitle(noteType, useCase)}</div>
            </div>
            <div className="outputActions" style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
              {/* Report language selector */}
              <label style={{ display: "flex", alignItems: "center", gap: 4, fontSize: "0.82rem", color: "#6b7280", cursor: "pointer", userSelect: "none" }}>
                <span title="Report language">🌐</span>
                <select
                  value={reportLang}
                  onChange={e => setReportLang(e.target.value)}
                  title="Report language"
                  style={{ fontSize: "0.82rem", padding: "4px 6px", borderRadius: 6, border: "1px solid #d1d5db", background: "#f9fafb", color: "#374151", cursor: "pointer", maxWidth: 140 }}
                >
                  {REPORT_LANGUAGES.map(l => (
                    <option key={l.code} value={l.code}>{l.label}</option>
                  ))}
                </select>
              </label>
              <button className="btn btnGhost" type="button" onClick={copyOutput} disabled={!output}>Copy</button>
              <button className={cx("btn", saved ? "btnSaved" : "btnSave")} type="button" onClick={saveToHistory} disabled={!output}>
                {saved ? "Saved!" : "Save"}
              </button>
            </div>
          </div>

          <div className="cardBody">
            {aiTips.length > 0 && (
              <div className="aiBox">
                <div className="aiBoxTitle">AI Assistant</div>
                <ul>{aiTips.map((tip, i) => <li key={i}>{tip}</li>)}</ul>
              </div>
            )}

            {!output ? (
              <div className="emptyState">
                <div className="emptyIcon">&#9998;</div>
                <div className="emptyTitle">Ready to generate your report</div>
                <div className="emptySub">Fill in the inspection details on the left, then click <strong>Generate Report</strong>.</div>
              </div>
            ) : (
              <>
                <RenderedOutput
                  noteType={noteType} useCase={useCase} context={context}
                  inspection={inspection} rawNotes={rawNotes}
                  inspectionType={inspectionType} inspectionDate={inspectionDate}
                  inspectorName={inspectorName} participantName={participantName} siteName={siteName}
                  siteNumber={siteNumber} restaurantLicense={restaurantLicense} sitePhone={sitePhone}
                  supervisorName={supervisorName} locationType={locationType} floor={floor}
                  eventName={eventName} reportLang={reportLang}
                />

                <div className="downloadBar">
                  <span className="downloadLabel">Download:</span>
                  <button className="btn btnDownload" type="button" onClick={onDownloadCsv}>Excel (.xls)</button>
                  <button className="btn btnDownload" type="button" onClick={onDownloadHtml}>Word (.doc)</button>
                  <button className="btn btnDownload" type="button" onClick={onDownloadTxt}>Text (.txt)</button>
                </div>
                {/* ── Live HACCP Temperature Logs — real-time from supervisor ── */}
                <LiveHaccpPanel reportId={savedReportId} />
                {/* ── Inline Supervisor Chat — scoped to this report's ID ── */}
                <InlineChat currentUser={currentUser} sessionId={savedReportId} />
              </>
            )}
          </div>
        </section>

      </main>

      {/* ── Food Safety Quick Reference ─────────────────────── */}
      <div className="foodSafetyRefWrap">
        <FoodSafetyRef />
      </div>

      {/* Floating corner buttons */}
      <button className="fab fabLeft" onClick={loadSample} type="button" title="Try Example">&#128221; Try Example</button>
      <button className="fab fabRight" onClick={runAiAssist} type="button" title="AI Tips">&#9889; AI Tips</button>

      {/* Sticky action bar — appears when report is generated */}
      {output && (
        <div className="stickyActionBar">
          <button className="btn stickyBtn stickyBtnView" type="button" onClick={() => {
            const el = document.getElementById("report-output");
            if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
          }}>&#128196; View</button>
          <button className={cx("btn stickyBtn", saved ? "stickyBtnSaved" : "stickyBtnSave")} type="button" onClick={saveToHistory}>
            {saved ? "✅ Saved" : "💾 Save"}
          </button>
          <span className="stickyDivider" />
          <button className="btn stickyBtn stickyBtnHaccp" type="button" onClick={() => setShowHaccpModal(true)} title="Share HACCP temperature log QR with supervisor">
            🌡️ HACCP QR
          </button>
          <button className="btn stickyBtn stickyBtnNew" type="button" onClick={startNewInspection}>+ New</button>
        </div>
      )}

      <footer className="footer">
        <img src={LOGO_WHITE} alt="Sodexo" className="footerLogo" />
        <span>{FIREBASE_ON ? "☁️ Cloud database connected — data syncs across all devices." : "🔒 Data stored locally on this device."}</span>
      </footer>

      {appLightboxSrc && (
        <div onClick={() => setAppLightboxSrc(null)} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.92)", zIndex: 9999, display: "flex", alignItems: "center", justifyContent: "center", cursor: "zoom-out" }}>
          <img src={appLightboxSrc} alt="Full size" style={{ maxWidth: "95vw", maxHeight: "95vh", objectFit: "contain", borderRadius: 8, boxShadow: "0 4px 32px rgba(0,0,0,0.6)" }} />
          <button onClick={() => setAppLightboxSrc(null)} style={{ position: "absolute", top: 16, right: 16, background: "rgba(255,255,255,0.15)", border: "none", color: "#fff", fontSize: 28, width: 44, height: 44, borderRadius: "50%", cursor: "pointer", lineHeight: 1 }}>×</button>
        </div>
      )}
      {showShareModal && (
        <ShareModal shareUrl={shareUrl} onClose={() => setShowShareModal(false)} />
      )}
      {showHaccpModal && (
        <HaccpQrModal onClose={() => setShowHaccpModal(false)} siteName={siteName} siteNumber={siteNumber} floor={floor} locationType={locationType} reportId={savedReportId} />
      )}
      {/* Chat is now embedded inline in the report output section */}

      {showEodPrompt && (
        <EodCorrectivePrompt
          inspection={inspection}
          rawNotes={rawNotes}
          onDismiss={() => {
            const today = new Date().toISOString().slice(0, 10);
            localStorage.setItem("sdx_eod_dismissed", today);
            setShowEodPrompt(false);
          }}
          onAddNotes={() => {
            setShowEodPrompt(false);
            setTimeout(() => {
              if (rawNotesRef.current) {
                rawNotesRef.current.scrollIntoView({ behavior: "smooth", block: "center" });
                rawNotesRef.current.focus();
              }
            }, 150);
          }}
        />
      )}
    </div>
  );
}
