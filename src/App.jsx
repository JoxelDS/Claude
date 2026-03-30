import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import QRCode from "qrcode";
import "./App.css";
import { db, isConfigured as FIREBASE_ON, setVenue, venueCol } from "./firebase.js";
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
  doc, getDocs, getDoc, setDoc, deleteDoc, updateDoc, query, orderBy, where
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
    const THRESHOLD = 160; // px — DevTools panel is larger than this
    let devToolsOpen = false;

    function check() {
      const widthDiff  = window.outerWidth  - window.innerWidth;
      const heightDiff = window.outerHeight - window.innerHeight;
      const opened = widthDiff > THRESHOLD || heightDiff > THRESHOLD;

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
        document.body.innerHTML = "";
        document.body.appendChild(shield);
      } else if (!opened && devToolsOpen) {
        devToolsOpen = false;
        // Reload the page cleanly when DevTools is closed
        window.location.reload();
      }
    }

    // Poll every 800ms — fast enough to catch opening, gentle on CPU
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

/* ── AES-256-GCM Encryption (localStorage fallback only) ── */
const SALT_KEY           = `sdx_salt_${VENUE_ID}`;
const USERS_KEY          = `sdx_users_${VENUE_ID}`;
const DATA_KEY           = `sdx_inspection_vault_${VENUE_ID}`;
const DEVICE_SECRET_KEY  = `sdx_device_secret_${VENUE_ID}`;
const LOCK_TIMEOUT_MS    = 10 * 60 * 1000; // 10 min inactivity lock
const AUTOFILL_KEY       = `sdx_autofill_memory_${VENUE_ID}`;

function getAutofillMemory() {
  try { return JSON.parse(localStorage.getItem(AUTOFILL_KEY)) || {}; } catch { return {}; }
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
    if (record.locationType === "Portable" || record.locationType === "Subcontractor") {
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
const IS_DEFAULT_VENUE = VENUE_ID === "default";

/* ── User Registry ────────────────────────────────────────── */
async function getUsers() {
  if (FIREBASE_ON) {
    try {
      // Default venue: read from legacy flat collection (existing data lives there)
      const col = IS_DEFAULT_VENUE ? legacyCol("users") : venueCol("users");
      const snap = await getDocs(col);
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
      const col = IS_DEFAULT_VENUE ? legacyCol("users") : venueCol("users");
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
      const col = IS_DEFAULT_VENUE ? legacyCol("users") : venueCol("users");
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
      const col = IS_DEFAULT_VENUE ? legacyCol("users") : venueCol("users");
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
    const col = IS_DEFAULT_VENUE ? legacyCol("users") : venueCol("users");
    await setDoc(doc(col, h), seedUser);
  } else {
    localStorage.setItem(USERS_KEY, JSON.stringify([seedUser]));
  }
}

/* ── Inspection History ───────────────────────────────────── */
let _cryptoKey = null;
let _currentUser = null;

async function loadHistory() {
  if (FIREBASE_ON) {
    try {
      // Default venue → read legacy flat collection where all existing data lives
      const col = IS_DEFAULT_VENUE ? legacyCol("inspections") : venueCol("inspections");
      const snap = await getDocs(col);
      const list = snap.docs.map(d => d.data());
      list.sort((a, b) => (b.savedAt || "").localeCompare(a.savedAt || ""));
      return list;
    } catch { return []; }
  }
  if (!_cryptoKey) return [];
  const stored = localStorage.getItem(DATA_KEY);
  return decryptData(stored, _cryptoKey);
}

async function saveHistory(records) {
  if (FIREBASE_ON) {
    try {
      const col = IS_DEFAULT_VENUE ? legacyCol("inspections") : venueCol("inspections");
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

async function saveOneInspection(record) {
  if (FIREBASE_ON) {
    try {
      const col = IS_DEFAULT_VENUE ? legacyCol("inspections") : venueCol("inspections");
      await setDoc(doc(col, record.id), record);
    } catch {}
    return;
  }
  // localStorage: load all, prepend, save all
  const history = await loadHistory();
  history.unshift(record);
  await saveHistory(history);
}

async function deleteOneInspection(id) {
  if (FIREBASE_ON) {
    try {
      const col = IS_DEFAULT_VENUE ? legacyCol("inspections") : venueCol("inspections");
      await deleteDoc(doc(col, id));
    } catch {}
    return;
  }
  const history = await loadHistory();
  await saveHistory(history.filter(r => r.id !== id));
}

async function clearAllInspections() {
  if (FIREBASE_ON) {
    try {
      const col = IS_DEFAULT_VENUE ? legacyCol("inspections") : venueCol("inspections");
      const snap = await getDocs(col);
      for (const d of snap.docs) await deleteDoc(d.ref);
    } catch {}
    return;
  }
  await saveHistory([]);
}

/* ── HACCP Supervisor Submissions ────────────────────────── */
async function saveHaccpSubmission(record) {
  if (FIREBASE_ON) {
    try {
      const col = IS_DEFAULT_VENUE ? legacyCol("haccpSubmissions") : venueCol("haccpSubmissions");
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
      const col = IS_DEFAULT_VENUE ? legacyCol("haccpSubmissions") : venueCol("haccpSubmissions");
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
      const col = IS_DEFAULT_VENUE ? legacyCol("haccpSubmissions") : venueCol("haccpSubmissions");
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

/* ── Problem Reports ──────────────────────────────────────── */
async function saveProblemReport(record) {
  if (FIREBASE_ON) {
    try {
      const col = IS_DEFAULT_VENUE ? legacyCol("problemReports") : venueCol("problemReports");
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
      const col = IS_DEFAULT_VENUE ? legacyCol("problemReports") : venueCol("problemReports");
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
      const col = IS_DEFAULT_VENUE ? legacyCol("supervisorChat") : venueCol("supervisorChat");
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
      const col = IS_DEFAULT_VENUE ? legacyCol("supervisorChat") : venueCol("supervisorChat");
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

/* ── Auth functions ───────────────────────────────────────── */
async function signIn(badge) {
  await ensureSeedAdmin();
  const h = await hashBadge(badge);
  const users = await getUsers();
  const user = users.find(u => u.badgeHash === h);
  if (!user) return { ok: false, reason: "not_found" };
  if (!user.approved) return { ok: false, reason: "pending" };
  if (!FIREBASE_ON) _cryptoKey = await getMasterKey();
  _currentUser = { ...user };
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
async function adminAddUser(badge, name, department, role) {
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
      console.error("Sign-in error:", e);
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
          <button className="btnLink" type="button" onClick={() => { setMode("register"); setError(""); setBadge(""); }}>
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
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => { document.body.removeChild(a); URL.revokeObjectURL(url); }, 100);
}

const NOTE_TYPES = {
  inspection: {
    label: "Kitchen Inspection",
    contextFields: [
      { key: "kitchen", label: "Kitchen / Location" },
      { key: "participants", label: "Participants" },
      { key: "date", label: "Date" },
    ],
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
        temps: { handSinkTempF: 96, threeCompSinkTempF: 110 },
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

const STATUS_OPTIONS = ["OK", "Needs Attention", "Maintenance"];
const PHOTO_LIMIT = 6;
const PHOTO_MAX_MB = 8;

const INSPECTION_TYPES = ["Event Day", "Post Event", "Regular Inspection"];
const LOCATION_TYPES = ["Concession", "Subcontractor", "Portable"];
const FLOOR_OPTIONS = ["Floor 1", "Floor 2", "Floor 3"];

// Cold equipment: items that need temperature readings during inspection
const COLD_EQUIPMENT = {
  doubleDoorCooler: { type: "cooler", max: 40, label: "Double-door cooler" },
  doubleDoorFreezer: { type: "freezer", max: 20, label: "Double-door freezer" },
  walkInCooler: { type: "cooler", max: 40, label: "Walk-in cooler" },
  walkInFreezer: { type: "freezer", max: 20, label: "Walk-in freezer" },
  prepCooler: { type: "cooler", max: 40, label: "Prep cooler" },
};
function detectColdType(label) {
  const l = (label || "").toLowerCase();
  if (/freezer|freez/.test(l)) return { type: "freezer", max: 20 };
  if (/cooler|cool|refrig|wic|w\.i\.c|walk.in.*c/i.test(l)) return { type: "cooler", max: 40 };
  return null;
}
// Collect all equipment temperature readings
function collectEquipTemps(inspection) {
  const results = [];
  const equip = inspection?.equipment || {};
  for (const [k, node] of Object.entries(equip)) {
    if (!node?.tempF && node?.tempF !== 0) continue;
    const t = Number(node.tempF);
    if (!t && node.tempF === "") continue;
    const cold = COLD_EQUIPMENT[k] || (k.startsWith("custom_") ? detectColdType(node.label) : null);
    if (!cold) continue;
    const label = COLD_EQUIPMENT[k]?.label || node.label || k;
    results.push({ key: k, label, tempF: node.tempF, tempNum: t, type: cold.type, max: cold.max, pass: t <= cold.max });
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
  if (obj.date !== undefined) obj.date = new Date().toISOString().slice(0, 10);
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
    temps: { handSinkTempF: "", threeCompSinkTempF: "" },
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
function compressImage(file, maxDim = 800, quality = 0.6) {
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
    if (node.status && (node.status === "Needs Attention" || node.status === "Not Clean")) bad.push(true);
    for (const k of Object.keys(node)) walk(node[k]);
  };
  walk(inspection?.facility);
  walk(inspection?.operations);
  walk(inspection?.equipment);

  const hand = Number(inspection?.temps?.handSinkTempF);
  const three = Number(inspection?.temps?.threeCompSinkTempF);
  if (!Number.isNaN(hand) && hand && hand < 95) bad.push(true);
  if (!Number.isNaN(three) && three && three < 110) bad.push(true);

  return bad.length ? "Needs Attention" : "Pass";
}

/* ── Validation: check for missing fields ────────────────── */
function validateForm({ inspectionDate, inspectorName, context, noteType, inspection }) {
  const warnings = [];
  if (!inspectionDate) warnings.push({ text: "Inspection Date is missing", fieldId: "field-inspectionDate" });
  if (!inspectorName) warnings.push({ text: "Inspector Name is missing", fieldId: "field-inspectorName" });

  const ctxFields = NOTE_TYPES[noteType].contextFields;
  for (const f of ctxFields) {
    if (!context[f.key]?.trim()) warnings.push({ text: `${f.label} is missing`, fieldId: `field-ctx-${f.key}` });
  }

  if (!inspection.temps.handSinkTempF) warnings.push({ text: "Hand sink temperature not recorded", fieldId: "field-handSinkTempF" });
  if (!inspection.temps.threeCompSinkTempF) warnings.push({ text: "3-comp sink temperature not recorded", fieldId: "field-threeCompSinkTempF" });

  return warnings;
}

function buildSubject({ noteType, context, inspection, inspectionType, inspectionDate, siteName, siteNumber }) {
  const status = calcOverallStatus(inspection);
  const baseLocation = siteName || context?.kitchen || "Kitchen";
  const unitTag = siteNumber ? ` (#${siteNumber})` : "";
  const date = inspectionDate || context?.date || "Date";
  const typeTag = inspectionType ? ` – ${inspectionType}` : "";
  return `Subject: ${baseLocation}${unitTag} Kitchen Inspection${typeTag} – ${date} – ${status}`;
}

function buildPhotoIndex(inspection) {
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
  ];
  // Add custom items from each section
  for (const sec of ["facility", "operations", "equipment"]) {
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
  return { index, mapByPath };
}

function buildActionItems({ inspection, rawNotes }) {
  const items = [];
  const { mapByPath } = buildPhotoIndex(inspection);
  const pushIfBad = (pathKey, label, node) => {
    if (!node?.status) return;
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
  // Per-equipment cold temps
  for (const et of collectEquipTemps(inspection)) {
    if (!et.pass)
      items.push({ issue: `${et.label} temperature above maximum: ${et.tempNum}°F (max ${et.max}°F)`, owner: "", due: "", priority: "High", photos: [] });
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

function emailPreview({ noteType, context, inspection, rawNotes, inspectionType, inspectionDate, inspectorName, siteName, siteNumber, sitePhone, supervisorName, floor }) {
  const playbook = INSPECTION_PLAYBOOK[inspectionType] || INSPECTION_PLAYBOOK["Regular Inspection"];
  const subject = buildSubject({ noteType, context, inspection, inspectionType, inspectionDate, siteName, siteNumber });
  const status = calcOverallStatus(inspection);
  const actionItems = buildActionItems({ inspection, rawNotes });
  const { index: photoIndexList } = buildPhotoIndex(inspection);
  const location = siteName || context?.kitchen || "Kitchen";
  const unit = siteNumber ? ` (#${siteNumber})` : "";
  const date = inspectionDate || context?.date || "—";
  const snapshotLines = [
    `- Inspection Type: ${inspectionType || "—"}`,
    `- Site: ${location}${unit}`,
    floor ? `- Floor: ${floor}` : null,
    `- Date: ${date}`,
    `- Inspector: ${inspectorName || "—"}`,
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

/* ── Local Transform (no backend needed) ─────────────────── */
function transformLocally({ noteType, useCase, context, inspection, rawNotes, inspectionType, inspectionDate, inspectorName, siteName, siteNumber, sitePhone, supervisorName, floor }) {
  const status = calcOverallStatus(inspection);
  const actionItems = buildActionItems({ inspection, rawNotes });
  const expandedNotes = expandAbbreviations(rawNotes);
  const location = siteName || context?.kitchen || "Kitchen";
  const date = inspectionDate || context?.date || "—";

  if (useCase === "Email Summary") {
    return emailPreview({ noteType, context, inspection, rawNotes, inspectionType, inspectionDate, inspectorName, siteName, siteNumber, sitePhone, supervisorName, floor });
  }

  if (useCase === "Slack Update") {
    const lines = [
      `*${inspectionType || "Inspection"} — ${location} — ${date}*`,
      `Inspector: ${inspectorName || "—"} | Status: *${status}*`,
      "",
      `*Summary:*`,
      formatNotesText(rawNotes),
      "",
    ];
    if (actionItems.length) {
      lines.push(`*Action Items (${actionItems.length}):*`);
      for (const a of actionItems) lines.push(`  • [${a.priority}] ${a.issue}`);
    } else {
      lines.push("No corrective actions needed.");
    }
    return lines.join("\n");
  }

  if (useCase === "Google Doc") {
    const lines = [
      `# ${inspectionType || "Inspection"} — ${location}`,
      `Date: ${date} | Inspector: ${inspectorName || "—"} | Supervisor: ${supervisorName || "—"}`,
      `Overall Status: ${status}`,
      "",
      "## Inspector Notes",
      formatNotesText(rawNotes),
      "",
      "## Findings",
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
    addFinding("Double-door cooler", inspection?.equipment?.doubleDoorCooler);
    addFinding("Double-door freezer", inspection?.equipment?.doubleDoorFreezer);
    addFinding("Walk-in cooler", inspection?.equipment?.walkInCooler);
    addFinding("Warmers", inspection?.equipment?.warmers);
    addFinding("Ovens", inspection?.equipment?.ovens);
    addFinding("3-compartment sink", inspection?.equipment?.threeCompSink);
    addFinding("Ecolab / chemicals", inspection?.equipment?.ecolab);
    if (lines[lines.length - 1] === "## Findings") lines.push("- All areas OK.");
    lines.push("", "## Action Items");
    if (actionItems.length) {
      lines.push(tableMarkdown(actionItems));
    } else {
      lines.push("No corrective actions needed.");
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
        ["Double-door cooler", inspection?.equipment?.doubleDoorCooler],
        ["Double-door freezer", inspection?.equipment?.doubleDoorFreezer],
        ["Walk-in cooler", inspection?.equipment?.walkInCooler],
        ["Warmers", inspection?.equipment?.warmers],
        ["Ovens", inspection?.equipment?.ovens],
        ["3-comp sink", inspection?.equipment?.threeCompSink],
        ["Ecolab", inspection?.equipment?.ecolab],
      ]},
    ];
    const lines = [
      `EVALUATION SCORECARD`,
      `${"=".repeat(50)}`,
      `${inspectionType || "Inspection"} — ${location} — ${date}`,
      `Inspector: ${inspectorName || "—"}`,
      `Overall: ${status}`,
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
    lines.push(`--- TEMPERATURES ---`);
    const hs = inspection?.temps?.handSinkTempF;
    const ts = inspection?.temps?.threeCompSinkTempF;
    lines.push(`  Hand sink: ${hs || "—"}°F ${Number(hs) >= 95 ? "[PASS]" : hs ? "[FAIL]" : ""}`);
    lines.push(`  3-comp wash: ${ts || "—"}°F ${Number(ts) >= 110 ? "[PASS]" : ts ? "[FAIL]" : ""}`);
    lines.push("", `--- ACTION ITEMS (${actionItems.length}) ---`);
    for (const a of actionItems) lines.push(`  [${a.priority}] ${a.issue}`);
    if (!actionItems.length) lines.push("  None.");
    lines.push("", `--- INSPECTOR NOTES ---`, formatNotesText(rawNotes));
    return lines.join("\n");
  }

  return emailPreview({ noteType, context, inspection, rawNotes, inspectionType, inspectionDate, inspectorName, siteName, siteNumber, sitePhone, supervisorName, floor });
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
  checkNode("Double-door cooler", inspection?.equipment?.doubleDoorCooler);
  checkNode("Double-door freezer", inspection?.equipment?.doubleDoorFreezer);
  checkNode("Walk-in cooler", inspection?.equipment?.walkInCooler);
  checkNode("Walk-in freezer", inspection?.equipment?.walkInFreezer);
  checkNode("Prep cooler", inspection?.equipment?.prepCooler);
  checkNode("Warmers", inspection?.equipment?.warmers);
  checkNode("Ovens", inspection?.equipment?.ovens);
  checkNode("3-compartment sink", inspection?.equipment?.threeCompSink);
  checkNode("Ecolab / chemicals", inspection?.equipment?.ecolab);

  // Water temperature checks
  const hs = Number(inspection?.temps?.handSinkTempF);
  const ts = Number(inspection?.temps?.threeCompSinkTempF);
  if (hs && hs < 95) tips.push(`Hand sink temp is ${hs}°F (below 95°F min). Flag for immediate maintenance.`);
  if (ts && ts < 110) tips.push(`3-comp sink wash temp is ${ts}°F (below 110°F min). Check water heater.`);
  if (hs && hs >= 95 && hs < 100) tips.push(`Hand sink temp is ${hs}°F — passes but is close to the 95°F minimum. Monitor.`);
  if (ts && ts >= 110 && ts < 115) tips.push(`3-comp wash temp is ${ts}°F — passes but is close to the 110°F minimum. Monitor.`);
  // Per-equipment cold temps
  for (const et of collectEquipTemps(inspection)) {
    if (!et.pass) tips.push(`${et.label} temp is ${et.tempNum}°F (above ${et.max}°F max). ${et.type === "freezer" ? "Check freezer compressor and door seals." : "Potential food safety hazard — check refrigeration immediately."}`);
    else if (et.type === "cooler" && et.tempNum > 35) tips.push(`${et.label} temp is ${et.tempNum}°F — passes but close to the 40°F maximum. Monitor.`);
    else if (et.type === "freezer" && et.tempNum > 15) tips.push(`${et.label} temp is ${et.tempNum}°F — passes but close to the 20°F maximum. Monitor.`);
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
function RenderedOutput({ noteType, useCase, context, inspection, rawNotes, inspectionType, inspectionDate, inspectorName, siteName, siteNumber, sitePhone, supervisorName, locationType, floor }) {
  const status = calcOverallStatus(inspection);
  const actionItems = buildActionItems({ inspection, rawNotes });
  const expandedNotes = expandAbbreviations(rawNotes);
  const location = siteName || context?.kitchen || "Kitchen";
  const date = inspectionDate || context?.date || new Date().toLocaleDateString();
  const playbook = INSPECTION_PLAYBOOK[inspectionType] || INSPECTION_PLAYBOOK["Regular Inspection"];
  const { index: photoIndexList } = buildPhotoIndex(inspection);

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
    { section: "Facility", label: "Ceiling", node: inspection?.facility?.ceiling },
    { section: "Facility", label: "Walls", node: inspection?.facility?.walls },
    { section: "Facility", label: "Floors", node: inspection?.facility?.floors },
    { section: "Facility", label: "Lighting", node: inspection?.facility?.lighting },
    ...getCustomItems("facility", "Facility"),
    { section: "Operations", label: "Employee Practices", node: inspection?.operations?.employeePractices },
    { section: "Operations", label: "Handwashing / Supplies", node: inspection?.operations?.handwashing },
    { section: "Operations", label: "Labeling / Dating", node: inspection?.operations?.labelingDating },
    { section: "Operations", label: "Logs / Documentation", node: inspection?.operations?.logs },
    ...getCustomItems("operations", "Operations"),
    { section: "Equipment", label: "Double-Door Cooler", node: inspection?.equipment?.doubleDoorCooler },
    { section: "Equipment", label: "Double-Door Freezer", node: inspection?.equipment?.doubleDoorFreezer },
    { section: "Equipment", label: "Walk-In Cooler", node: inspection?.equipment?.walkInCooler },
    { section: "Equipment", label: "Walk-In Freezer", node: inspection?.equipment?.walkInFreezer },
    { section: "Equipment", label: "Prep Cooler", node: inspection?.equipment?.prepCooler },
    { section: "Equipment", label: "Warmers / Hot Holding", node: inspection?.equipment?.warmers },
    { section: "Equipment", label: "Ovens", node: inspection?.equipment?.ovens },
    { section: "Equipment", label: "3-Compartment Sink", node: inspection?.equipment?.threeCompSink },
    { section: "Equipment", label: "Ecolab / Chemicals", node: inspection?.equipment?.ecolab },
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
          <div className="rptDocType">{inspectionType || "Kitchen Inspection"}</div>
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
          {status === "Pass" ? "PASSED" : "NEEDS ATTENTION"}
        </div>
      </div>

      {/* Info Grid */}
      <div className="rptInfoGrid">
        <div className="rptInfoItem">
          <div className="rptInfoLabel">Inspector</div>
          <div className="rptInfoValue">{inspectorName || "\u2014"}</div>
        </div>
        <div className="rptInfoItem">
          <div className="rptInfoLabel">Supervisor</div>
          <div className="rptInfoValue">{supervisorName || "\u2014"}</div>
        </div>
        <div className="rptInfoItem">
          <div className="rptInfoLabel">Unit / Location</div>
          <div className="rptInfoValue">{siteNumber || "\u2014"}</div>
        </div>
        {locationType && (
          <div className="rptInfoItem">
            <div className="rptInfoLabel">Type</div>
            <div className="rptInfoValue">{locationType}</div>
          </div>
        )}
        {floor && (
          <div className="rptInfoItem">
            <div className="rptInfoLabel">Floor</div>
            <div className="rptInfoValue">{floor}</div>
          </div>
        )}
        {sitePhone && (
          <div className="rptInfoItem">
            <div className="rptInfoLabel">Phone</div>
            <div className="rptInfoValue">{sitePhone}</div>
          </div>
        )}
        <div className="rptInfoItem">
          <div className="rptInfoLabel">Hand Sink Temp</div>
          <div className="rptInfoValue">
            {inspection?.temps?.handSinkTempF ? `${inspection.temps.handSinkTempF}\u00B0F` : "\u2014"}
            {handT >= 95 && <span className="rptCheck">{" \u2705"}</span>}
            {handT > 0 && handT < 95 && <span className="rptWarn">{" \u26A0\uFE0F Below 95\u00B0F"}</span>}
          </div>
        </div>
        <div className="rptInfoItem">
          <div className="rptInfoLabel">3-Comp Wash Temp</div>
          <div className="rptInfoValue">
            {inspection?.temps?.threeCompSinkTempF ? `${inspection.temps.threeCompSinkTempF}\u00B0F` : "\u2014"}
            {threeT >= 110 && <span className="rptCheck">{" \u2705"}</span>}
            {threeT > 0 && threeT < 110 && <span className="rptWarn">{" \u26A0\uFE0F Below 110\u00B0F"}</span>}
          </div>
        </div>
        {equipTemps.map(et => (
          <div className="rptInfoItem" key={et.key}>
            <div className="rptInfoLabel">{et.label}</div>
            <div className="rptInfoValue">
              {et.tempF}{"\u00B0F"}
              {et.pass && <span className="rptCheck">{" \u2705"}</span>}
              {!et.pass && <span className="rptWarn">{` \u26A0\uFE0F Above ${et.max}\u00B0F`}</span>}
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
        <div className="rptBlockTitle">Inspection Scorecard</div>
        <div className="rptTableWrap">
          <table className="rptTable">
            <thead>
              <tr>
                <th>Section</th>
                <th>Item</th>
                <th>Status</th>
                <th>Notes</th>
              </tr>
            </thead>
            <tbody>
              {sections.map(sec => {
                const items = allItems.filter(it => it.section === sec);
                return items.map((it, i) => (
                  <tr key={it.label} className={it.node?.status === "Not Clean" ? "rptRowFail" : it.node?.status === "Needs Attention" ? "rptRowWarn" : ""}>
                    {i === 0 && <td rowSpan={items.length} className="rptSectionCell">{sec}</td>}
                    <td>{it.label}</td>
                    <td>
                      <span className={cx("rptStatusPill",
                        it.node?.status === "OK" ? "rptPillPass" :
                        it.node?.status === "Not Clean" ? "rptPillFail" :
                        it.node?.status === "Needs Attention" ? "rptPillWarn" : "rptPillNa"
                      )}>
                        {it.node?.status || "N/A"}
                      </span>
                    </td>
                    <td className="rptNoteCell">{it.node?.notes || "\u2014"}</td>
                  </tr>
                ));
              })}
              {/* Temperature rows */}
              <tr className={handT > 0 && handT < 95 ? "rptRowFail" : ""}>
                <td rowSpan={2} className="rptSectionCell">Temps</td>
                <td>Hand Sink</td>
                <td><span className={cx("rptStatusPill", handT >= 95 ? "rptPillPass" : handT ? "rptPillFail" : "rptPillNa")}>{inspection?.temps?.handSinkTempF ? `${inspection.temps.handSinkTempF}\u00B0F` : "N/A"}</span></td>
                <td className="rptNoteCell">{handT >= 95 ? "Meets minimum" : handT ? "Below 95\u00B0F minimum" : "\u2014"}</td>
              </tr>
              <tr className={threeT > 0 && threeT < 110 ? "rptRowFail" : ""}>
                <td>3-Comp Wash</td>
                <td><span className={cx("rptStatusPill", threeT >= 110 ? "rptPillPass" : threeT ? "rptPillFail" : "rptPillNa")}>{inspection?.temps?.threeCompSinkTempF ? `${inspection.temps.threeCompSinkTempF}\u00B0F` : "N/A"}</span></td>
                <td className="rptNoteCell">{threeT >= 110 ? "Meets minimum" : threeT ? "Below 110\u00B0F minimum" : "\u2014"}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      {/* Findings Summary (only if issues) */}
      {findings.length > 0 && (
        <div className="rptBlock rptBlockAlert">
          <div className="rptBlockTitle rptBlockTitleAlert">Issues Found ({findings.length})</div>
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
          <div className="rptBlockTitle">Corrective Actions Required</div>
          {actionItems.map((a, i) => (
            <div className="rptActionRow" key={i}>
              <span className={cx("rptPriorityDot", a.priority === "High" ? "rptDotHigh" : "rptDotMed")} />
              <div className="rptActionContent">
                <span className="rptActionText">{a.issue}</span>
                <span className={cx("rptPriorityLabel", a.priority === "High" ? "rptLabelHigh" : "rptLabelMed")}>{a.priority} Priority</span>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Photo Evidence */}
      {photoIndexList.length > 0 && (
        <div className="rptBlock">
          <div className="rptBlockTitle">Photo Evidence ({photoIndexList.length})</div>
          <div className="rptPhotoGallery">
            {photoIndexList.map(p => (
              <div className="rptPhotoCard" key={p.num}>
                {p.previewUrl ? (
                  <img src={p.previewUrl} alt={`Photo #${p.num}`} className="rptPhotoImg" />
                ) : (
                  <div className="rptPhotoPlaceholder">No preview</div>
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
            <div className="rptBlockTitle">Inspector Notes</div>
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
        <div>Generated {new Date().toLocaleDateString()} {new Date().toLocaleTimeString()} &middot; Sodexo Kitchen Inspection System</div>
        <div>This report is confidential and intended for internal use only.</div>
      </div>
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

function exportAsCsv({ inspection, rawNotes, inspectionType, inspectionDate, inspectorName, siteName, siteNumber, supervisorName, floor }) {
  const dataRows = buildCsvRows({ inspection, rawNotes, inspectionType, inspectionDate, inspectorName, siteName, siteNumber, supervisorName });
  const status = calcOverallStatus(inspection);
  const actionItems = buildActionItems({ inspection, rawNotes });
  const { index: photoList } = buildPhotoIndex(inspection);
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
  <tr><td class="meta-label">Date</td><td colspan="4">${inspectionDate || ""}</td></tr>
  <tr><td class="meta-label">Inspector</td><td colspan="4">${inspectorName || ""}</td></tr>
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
  ${photoList.length > 0 ? `
  <tr><td colspan="5"></td></tr>
  <tr><td class="section-header" colspan="5">PHOTO EVIDENCE (${photoList.length})</td></tr>
  ${photoList.map(p => `<tr><td style="text-align:center;font-weight:bold;color:#2A295C;">#${p.num}</td><td colspan="2">${p.previewUrl ? `<img src="${p.previewUrl}" width="200" height="150" style="object-fit:cover;" />` : "No preview"}</td><td colspan="2" style="font-size:9pt;vertical-align:top;">${(p.label || "").replace(/</g, "&lt;")}${p.caption ? `<br/>${p.caption.replace(/</g, "&lt;")}` : ""}</td></tr>`).join("\n  ")}` : ""}
</table></body></html>`;

  const blob = new Blob([html], { type: "application/vnd.ms-excel" });
  const filename = `inspection_${inspectionDate || "undated"}_${(siteName || "site").replace(/\s+/g, "_")}.xls`;
  downloadBlob(blob, filename);
}

function exportAsHtml({ output, inspection, rawNotes, inspectionType, inspectionDate, siteName, siteNumber, sitePhone, inspectorName, supervisorName }) {
  const status = calcOverallStatus(inspection);
  const actionItems = buildActionItems({ inspection, rawNotes });
  const expandedNotes = expandAbbreviations(rawNotes);
  const { index: photoList } = buildPhotoIndex(inspection);
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
  <tr><td class="info-label">Inspector</td><td>${inspectorName || "\u2014"}</td><td class="info-label">Supervisor</td><td>${supervisorName || "\u2014"}</td></tr>
  <tr><td class="info-label">Site / Location</td><td>${siteName || "\u2014"}</td><td class="info-label">Unit #</td><td>${siteNumber || "\u2014"}</td></tr>
  ${sitePhone ? `<tr><td class="info-label">Phone</td><td>${sitePhone}</td><td></td><td></td></tr>` : ""}
  <tr><td class="info-label">Hand Sink Temp</td><td>${inspection?.temps?.handSinkTempF ? inspection.temps.handSinkTempF + "\u00B0F" : "\u2014"} ${handT >= 95 ? "\u2705" : handT ? "\u26A0\uFE0F Below 95\u00B0F" : ""}</td>
      <td class="info-label">3-Comp Wash Temp</td><td>${inspection?.temps?.threeCompSinkTempF ? inspection.temps.threeCompSinkTempF + "\u00B0F" : "\u2014"} ${threeT >= 110 ? "\u2705" : threeT ? "\u26A0\uFE0F Below 110\u00B0F" : ""}</td></tr>
  ${eTemps.length > 0 ? eTemps.map((et, i, arr) => {
    if (i % 2 === 0) {
      const next = arr[i + 1];
      return `<tr><td class="info-label">${et.label}</td><td>${et.tempF}\u00B0F ${et.pass ? "\u2705" : "\u26A0\uFE0F Above " + et.max + "\u00B0F"}</td>${next ? `<td class="info-label">${next.label}</td><td>${next.tempF}\u00B0F ${next.pass ? "\u2705" : "\u26A0\uFE0F Above " + next.max + "\u00B0F"}</td>` : `<td></td><td></td>`}</tr>`;
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

${photoList.length > 0 ? `
<h2>Photo Evidence (${photoList.length})</h2>
<div class="photo-grid">
${photoList.map(p => `<div class="photo-card">${p.previewUrl ? `<img src="${p.previewUrl}" alt="Photo #${p.num}" />` : `<div style="width:200px;height:150px;background:#F3F4F6;display:flex;align-items:center;justify-content:center;color:#9CA3AF;font-size:9pt;">No preview</div>`}<div class="photo-caption"><span class="photo-num">#${p.num}</span> ${(p.label || "").replace(/</g, "&lt;")}${p.caption ? ` \u2014 ${p.caption.replace(/</g, "&lt;")}` : ""}</div></div>`).join("\n")}
</div>` : ""}

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

/* ── Temperature Trend Chart (pure SVG) ─────────────────── */
function TempTrendChart({ history }) {
  const [hoveredPoint, setHoveredPoint] = useState(null);
  const [focusedLine, setFocusedLine] = useState(null); // null | "hand" | "three" | "cooler" | "freezer"

  // Group by location+floor, sorted by date
  const locationData = useMemo(() => {
    const map = {};
    for (const rec of history) {
      const key = `${rec.siteName || rec.location || "Unknown"}${rec.floor ? ` - ${rec.floor}` : ""}`;
      const unitNum = rec.siteNumber || "";
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

  const W = 500, H = 220, PAD = 45, PADR = 20, PADT = 20, PADB = 50;

  return (
    <div className="card" style={{ marginBottom: 24 }}>
      <div className="cardHeader">
        <div className="cardTitle">Temperature Trends by Location</div>
        <div className="cardSub" style={{ fontSize: "0.72rem", color: "#6b7280" }}>{locations.length} location{locations.length !== 1 ? "s" : ""} tracked</div>
      </div>
      <div className="cardBody">
        <div className="tempChartsGrid">
          {locations.map(loc => {
            const { points, unitNum } = locationData[loc];
            const allTemps = points.flatMap(p => [p.handSink, p.threeComp, p.cooler, p.freezer]).filter(Boolean);
            if (allTemps.length === 0) return null;
            const minT = Math.min(...allTemps, 0) - 5;
            const maxT = Math.max(...allTemps, 115) + 5;
            const rangeT = maxT - minT || 1;
            const xStep = points.length > 1 ? (W - PAD - PADR) / (points.length - 1) : (W - PAD - PADR) / 2;
            const xOff = points.length === 1 ? (W - PAD - PADR) / 2 : 0;

            const toX = (i) => PAD + xOff + i * xStep;
            const toY = (t) => PADT + (H - PADT - PADB) * (1 - (t - minT) / rangeT);

            // Build smooth path points
            const handCoords = points.map((p, i) => p.handSink ? [toX(i), toY(p.handSink)] : null).filter(Boolean);
            const threeCoords = points.map((p, i) => p.threeComp ? [toX(i), toY(p.threeComp)] : null).filter(Boolean);
            const coolerCoords = points.map((p, i) => p.cooler ? [toX(i), toY(p.cooler)] : null).filter(Boolean);
            const freezerCoords = points.map((p, i) => p.freezer ? [toX(i), toY(p.freezer)] : null).filter(Boolean);
            const toPath = (coords) => coords.map((c, i) => `${i === 0 ? "M" : "L"}${c[0]},${c[1]}`).join(" ");
            const toAreaPath = (coords) => {
              if (coords.length < 2) return "";
              const bottom = H - PADB;
              return `${toPath(coords)} L${coords[coords.length - 1][0]},${bottom} L${coords[0][0]},${bottom} Z`;
            };

            // Horizontal grid lines
            const gridSteps = [];
            for (let t = Math.ceil(minT / 10) * 10; t <= maxT; t += 10) gridSteps.push(t);

            // Avg temps
            const handAvg = handCoords.length > 0 ? Math.round(points.reduce((s, p) => s + (p.handSink || 0), 0) / points.filter(p => p.handSink).length) : null;
            const threeAvg = threeCoords.length > 0 ? Math.round(points.reduce((s, p) => s + (p.threeComp || 0), 0) / points.filter(p => p.threeComp).length) : null;
            const coolerAvg = coolerCoords.length > 0 ? Math.round(points.reduce((s, p) => s + (p.cooler || 0), 0) / points.filter(p => p.cooler).length) : null;
            const freezerAvg = freezerCoords.length > 0 ? Math.round(points.reduce((s, p) => s + (p.freezer || 0), 0) / points.filter(p => p.freezer).length) : null;

            return (
              <div key={loc} className="tempChartItem">
                <div className="tempChartHeader">
                  <div className="tempChartLabel">{loc}</div>
                  {unitNum && <span className="tempChartUnit">#{unitNum}</span>}
                </div>
                <div className="tempChartAvgs">
                  {handAvg !== null && <span className={cx("tempAvgPill", "tempAvgPillClickable", focusedLine === "hand" && "tempAvgPillActive")} style={{ background: focusedLine === "hand" ? "#3b82f6" : handAvg >= 95 ? "#dbeafe" : "#fee2e2", color: focusedLine === "hand" ? "#fff" : handAvg >= 95 ? "#1d4ed8" : "#dc2626" }} onClick={() => setFocusedLine(focusedLine === "hand" ? null : "hand")}>Avg Hand: {handAvg}°F</span>}
                  {threeAvg !== null && <span className={cx("tempAvgPill", "tempAvgPillClickable", focusedLine === "three" && "tempAvgPillActive")} style={{ background: focusedLine === "three" ? "#8b5cf6" : threeAvg >= 110 ? "#ede9fe" : "#fee2e2", color: focusedLine === "three" ? "#fff" : threeAvg >= 110 ? "#7c3aed" : "#dc2626" }} onClick={() => setFocusedLine(focusedLine === "three" ? null : "three")}>Avg 3-Comp: {threeAvg}°F</span>}
                  {coolerAvg !== null && <span className={cx("tempAvgPill", "tempAvgPillClickable", focusedLine === "cooler" && "tempAvgPillActive")} style={{ background: focusedLine === "cooler" ? "#059669" : coolerAvg <= 40 ? "#d1fae5" : "#fee2e2", color: focusedLine === "cooler" ? "#fff" : coolerAvg <= 40 ? "#059669" : "#dc2626" }} onClick={() => setFocusedLine(focusedLine === "cooler" ? null : "cooler")}>Avg Cooler: {coolerAvg}°F</span>}
                  {freezerAvg !== null && <span className={cx("tempAvgPill", "tempAvgPillClickable", focusedLine === "freezer" && "tempAvgPillActive")} style={{ background: focusedLine === "freezer" ? "#0891b2" : freezerAvg <= 20 ? "#cffafe" : "#fee2e2", color: focusedLine === "freezer" ? "#fff" : freezerAvg <= 20 ? "#0891b2" : "#dc2626" }} onClick={() => setFocusedLine(focusedLine === "freezer" ? null : "freezer")}>Avg Freezer: {freezerAvg}°F</span>}
                  <span className="tempAvgPill" style={{ background: "#f0fdf4", color: "#15803d" }}>{points.length} reading{points.length !== 1 ? "s" : ""}</span>
                </div>
                <svg viewBox={`0 0 ${W} ${H}`} className="tempChartSvg" onMouseLeave={() => setHoveredPoint(null)}>
                  <defs>
                    <linearGradient id={`handGrad-${loc.replace(/\W/g, "")}`} x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#3b82f6" stopOpacity="0.25" />
                      <stop offset="100%" stopColor="#3b82f6" stopOpacity="0.02" />
                    </linearGradient>
                    <linearGradient id={`threeGrad-${loc.replace(/\W/g, "")}`} x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#8b5cf6" stopOpacity="0.25" />
                      <stop offset="100%" stopColor="#8b5cf6" stopOpacity="0.02" />
                    </linearGradient>
                    <linearGradient id={`coolerGrad-${loc.replace(/\W/g, "")}`} x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#059669" stopOpacity="0.25" />
                      <stop offset="100%" stopColor="#059669" stopOpacity="0.02" />
                    </linearGradient>
                    <linearGradient id={`freezerGrad-${loc.replace(/\W/g, "")}`} x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#0891b2" stopOpacity="0.25" />
                      <stop offset="100%" stopColor="#0891b2" stopOpacity="0.02" />
                    </linearGradient>
                  </defs>

                  {/* Grid lines */}
                  {gridSteps.map(t => (
                    <g key={t}>
                      <line x1={PAD} y1={toY(t)} x2={W - PADR} y2={toY(t)} stroke="#e5e7eb" strokeWidth="1" />
                      <text x={PAD - 6} y={toY(t) + 4} textAnchor="end" fontSize="9" fill="#9ca3af">{t}°</text>
                    </g>
                  ))}

                  {/* Threshold lines */}
                  {[{v:95,line:"hand",c:"#3b82f6"},{v:110,line:"three",c:"#8b5cf6"},{v:40,line:"cooler",c:"#059669"},{v:20,line:"freezer",c:"#0891b2"}].map(({v:threshold,line:lineKey,c:color}) => {
                    if (threshold < minT || threshold > maxT) return null;
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
                  {handCoords.length >= 2 && <path d={toAreaPath(handCoords)} fill={`url(#handGrad-${loc.replace(/\W/g, "")})`} opacity={focusedLine && focusedLine !== "hand" ? 0.1 : 1} style={{ transition: "opacity 0.3s" }} />}
                  {threeCoords.length >= 2 && <path d={toAreaPath(threeCoords)} fill={`url(#threeGrad-${loc.replace(/\W/g, "")})`} opacity={focusedLine && focusedLine !== "three" ? 0.1 : 1} style={{ transition: "opacity 0.3s" }} />}
                  {coolerCoords.length >= 2 && <path d={toAreaPath(coolerCoords)} fill={`url(#coolerGrad-${loc.replace(/\W/g, "")})`} opacity={focusedLine && focusedLine !== "cooler" ? 0.1 : 1} style={{ transition: "opacity 0.3s" }} />}
                  {freezerCoords.length >= 2 && <path d={toAreaPath(freezerCoords)} fill={`url(#freezerGrad-${loc.replace(/\W/g, "")})`} opacity={focusedLine && focusedLine !== "freezer" ? 0.1 : 1} style={{ transition: "opacity 0.3s" }} />}

                  {/* Lines */}
                  {handCoords.length > 1 && <path d={toPath(handCoords)} fill="none" stroke="#3b82f6" strokeWidth={focusedLine === "hand" ? "3.5" : "2.5"} strokeLinecap="round" strokeLinejoin="round" opacity={focusedLine && focusedLine !== "hand" ? 0.15 : 1} style={{ transition: "opacity 0.3s, stroke-width 0.3s" }} />}
                  {threeCoords.length > 1 && <path d={toPath(threeCoords)} fill="none" stroke="#8b5cf6" strokeWidth={focusedLine === "three" ? "3.5" : "2.5"} strokeLinecap="round" strokeLinejoin="round" opacity={focusedLine && focusedLine !== "three" ? 0.15 : 1} style={{ transition: "opacity 0.3s, stroke-width 0.3s" }} />}
                  {coolerCoords.length > 1 && <path d={toPath(coolerCoords)} fill="none" stroke="#059669" strokeWidth={focusedLine === "cooler" ? "3.5" : "2.5"} strokeLinecap="round" strokeLinejoin="round" opacity={focusedLine && focusedLine !== "cooler" ? 0.15 : 1} style={{ transition: "opacity 0.3s, stroke-width 0.3s" }} />}
                  {freezerCoords.length > 1 && <path d={toPath(freezerCoords)} fill="none" stroke="#0891b2" strokeWidth={focusedLine === "freezer" ? "3.5" : "2.5"} strokeLinecap="round" strokeLinejoin="round" opacity={focusedLine && focusedLine !== "freezer" ? 0.15 : 1} style={{ transition: "opacity 0.3s, stroke-width 0.3s" }} />}

                  {/* Data points with hover */}
                  {points.map((p, i) => {
                    const hk = `${loc}-${i}`;
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
                  {points.map((p, i) => (
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
            );
          })}
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
  const byLocation = {};
  for (const rec of sorted) {
    const loc = `${rec.siteName || rec.location || "Unknown"}${rec.siteNumber ? ` #${rec.siteNumber}` : ""}${rec.floor ? ` (${rec.floor})` : ""}`;
    if (!byLocation[loc]) byLocation[loc] = [];
    byLocation[loc].push(rec);
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
        predictions.push({
          type: "recurrence",
          risk,
          location: loc,
          category: cat,
          rate: Math.round(rate * 100),
          occurrences: count,
          total: recent.length,
          message: `"${cat}" issues have appeared in ${count} of the last ${recent.length} inspections at ${loc} (${Math.round(rate * 100)}%) — likely to recur.`,
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
        location: loc,
        category: equip.label,
        message: `${equip.label} at ${loc} has risen from ${last3[0].val}°F → ${last3[2].val}°F over the last ${last3.length} inspections (${gap > 0 ? `${gap.toFixed(1)}°F below max` : "AT OR ABOVE MAX"}).`,
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
    prepCooler: "Prep Cooler", warmers: "Warmers", ovens: "Ovens",
    threeCompSink: "3-Comp Sink", ecolab: "Ecolab / Chemicals",
    hvac: "HVAC", plumbing: "Plumbing", pestControl: "Pest Control",
    electricalSafety: "Electrical Safety", dumpsterArea: "Dumpster Area",
    structuralDamage: "Structural Damage",
  };

  for (const [loc, recs] of Object.entries(byLocation)) {
    if (recs.length < 2) continue;
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
            location: loc,
            category: ITEM_LABEL[itemKey] || itemKey,
            message: `"${ITEM_LABEL[itemKey] || itemKey}" at ${loc} has been "Needs Attention" for ${statuses.length} consecutive inspections.`,
            detail: `Unresolved items tend to escalate to "Not Clean". Assign ownership and set a corrective action deadline before the next visit.`,
          });
        }
      }
    }
  }

  // ── 4. Overdue inspection + prior issues risk flag ───────
  const now = new Date();
  for (const [loc, recs] of Object.entries(byLocation)) {
    const lastRec = recs[recs.length - 1];
    const lastDate = new Date(lastRec.inspectionDate || 0);
    const daysSince = Math.floor((now - lastDate) / (1000 * 60 * 60 * 24));
    const hadIssues = (lastRec.actionItems || []).length > 0;
    if (daysSince >= 30 && hadIssues) {
      const risk = daysSince >= 60 ? "high" : "medium";
      predictions.push({
        type: "overdue",
        risk,
        location: loc,
        category: "Inspection Gap",
        message: `${loc} hasn't been inspected in ${daysSince} days and had ${lastRec.actionItems.length} unresolved issue(s) at last visit.`,
        detail: `Schedule an inspection soon — unresolved issues left unchecked increase the risk of a health code violation.`,
        daysSince,
      });
    }
  }

  // ── 5. Hand sink / 3-comp sink temperature trend ─────────
  for (const [loc, recs] of Object.entries(byLocation)) {
    const handTemps = recs.map(r => Number(r.temps?.handSinkTempF || r.handSinkTempF || NaN)).filter(v => !isNaN(v) && v > 0);
    const threeTemps = recs.map(r => Number(r.temps?.threeCompSinkTempF || r.threeCompSinkTempF || NaN)).filter(v => !isNaN(v) && v > 0);

    if (handTemps.length >= 3) {
      const last3 = handTemps.slice(-3);
      const declining = last3[0] > last3[1] && last3[1] > last3[2];
      if (declining && last3[2] < 100) {
        predictions.push({
          type: "tempDrift",
          risk: last3[2] < 97 ? "high" : "medium",
          location: loc,
          category: "Hand Sink Water Temp",
          message: `Hand sink temperature at ${loc} has been declining: ${last3[0]}°F → ${last3[1]}°F → ${last3[2]}°F (min: 95°F).`,
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
          location: loc,
          category: "3-Comp Sink Wash Temp",
          message: `3-comp sink wash temperature at ${loc} declining: ${last3[0]}°F → ${last3[1]}°F → ${last3[2]}°F (min: 110°F).`,
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
                      Top: {t.topIssues.slice(0, 3).join(" · ")}
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
function AIHealthMonitor({ history }) {
  const [snapshot, setSnapshot]   = React.useState(() => AIEngine.getSnapshot());
  const [activeTab, setActiveTab] = React.useState("suggestions");
  const [dismissed, setDismissed] = React.useState(() => {
    try { return JSON.parse(localStorage.getItem("sdx_ai_dismissed") || "[]"); } catch { return []; }
  });

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

  const priorityColor = {
    critical: { bg: "#fef2f2", border: "#fecaca", dot: "#dc2626", label: "#991b1b" },
    high:     { bg: "#fff7ed", border: "#fed7aa", dot: "#ea580c", label: "#9a3412" },
    medium:   { bg: "#fefce8", border: "#fef08a", dot: "#ca8a04", label: "#854d0e" },
    low:      { bg: "#f0f9ff", border: "#bae6fd", dot: "#0284c7", label: "#0c4a6e" },
    info:     { bg: "#f0fdf4", border: "#bbf7d0", dot: "#16a34a", label: "#15803d" },
  };

  const perfStatusColor = { good: "#15803D", "needs improvement": "#b45309", poor: "#dc2626" };

  /* helpers */
  function passColor(r) {
    if (r >= 80) return "#15803D";
    if (r >= 60) return "#b45309";
    return "#dc2626";
  }
  function trendArrow(label) {
    if (label === "improving") return { icon: "↑", color: "#15803D" };
    if (label === "declining" || label === "worsening") return { icon: "↓", color: "#dc2626" };
    return { icon: "→", color: "#6b7280" };
  }
  function MiniBar({ pct, color = "#2563EB" }) {
    return (
      <div style={{ flex: 1, background: "#e5e7eb", borderRadius: 99, overflow: "hidden", height: 7 }}>
        <div style={{ height: "100%", background: color, borderRadius: 99, width: `${Math.min(100, pct)}%` }} />
      </div>
    );
  }
  function EmptyState({ icon = "📭", msg }) {
    return (
      <div style={{ textAlign: "center", padding: "28px 0", color: "#9ca3af" }}>
        <div style={{ fontSize: "2rem", marginBottom: 8 }}>{icon}</div>
        <div style={{ fontSize: "0.83rem" }}>{msg}</div>
      </div>
    );
  }

  const tabs = [
    { key: "suggestions", label: `💡 Tips${visibleSugs.length > 0 ? ` (${visibleSugs.length})` : ""}` },
    { key: "inspectors",  label: "👤 Inspectors" },
    { key: "supervisors", label: "🏢 Supervisors" },
    { key: "locations",   label: "🗺️ Locations" },
    { key: "behavior",    label: "📋 Behavior" },
    { key: "crossInsp",   label: "⚖️ Calibration" },
    { key: "resolution",  label: "🔓 Resolution" },
    { key: "inventory",   label: "🔧 Inventory" },
    { key: "usage",       label: "📊 Usage" },
    { key: "perf",        label: "⚡ Perf" },
  ];

  return (
    <div className="card" style={{ marginBottom: 24, border: "1.5px solid rgba(37,99,235,.2)", background: "linear-gradient(135deg, #f8faff 0%, #f0f4ff 100%)" }}>
      <div className="cardHeader" style={{ borderBottom: "1px solid rgba(37,99,235,.12)", paddingBottom: 12 }}>
        <div>
          <div className="cardTitle" style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ fontSize: "1.3rem" }}>🧠</span>
            <span>AI System Monitor</span>
            {visibleSugs.filter(s => s.priority === "critical").length > 0 && (
              <span style={{ background: "#dc2626", color: "#fff", borderRadius: 99, fontSize: "0.68rem", fontWeight: 700, padding: "2px 8px" }}>
                {visibleSugs.filter(s => s.priority === "critical").length} CRITICAL
              </span>
            )}
          </div>
          <div className="cardSub" style={{ fontSize: "0.71rem", marginTop: 2, color: "#6b7280" }}>
            Self-improving · continuously learns from every angle of usage
            {generatedAt && <span> · Last updated {new Date(generatedAt).toLocaleTimeString()}</span>}
          </div>
        </div>
      </div>

      {/* Sub-tabs — horizontally scrollable on small screens */}
      <div style={{ display: "flex", gap: 0, borderBottom: "1px solid rgba(37,99,235,.1)", padding: "0 8px", overflowX: "auto" }}>
        {tabs.map(t => (
          <button
            key={t.key}
            type="button"
            onClick={() => setActiveTab(t.key)}
            style={{
              background: "none", border: "none", padding: "9px 11px", cursor: "pointer", whiteSpace: "nowrap",
              fontSize: "0.75rem", fontWeight: activeTab === t.key ? 700 : 400,
              color: activeTab === t.key ? "#2563EB" : "#6b7280",
              borderBottom: activeTab === t.key ? "2px solid #2563EB" : "2px solid transparent",
              marginBottom: -1, transition: "all .15s",
            }}
          >{t.label}</button>
        ))}
      </div>

      <div className="cardBody" style={{ paddingTop: 16 }}>

        {/* ── SUGGESTIONS TAB ─────────────────────────────── */}
        {activeTab === "suggestions" && (
          <>
            {visibleSugs.length === 0 ? (
              <div style={{ textAlign: "center", padding: "24px 0", color: "#6b7280" }}>
                <div style={{ fontSize: "2rem", marginBottom: 8 }}>✅</div>
                <div style={{ fontWeight: 600, marginBottom: 4 }}>No suggestions right now</div>
                <div style={{ fontSize: "0.82rem" }}>The AI found no improvement opportunities. Keep up the great work!</div>
              </div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                {visibleSugs.map(s => {
                  const c = priorityColor[s.priority] || priorityColor.low;
                  return (
                    <div key={s.id} style={{ background: c.bg, border: `1px solid ${c.border}`, borderRadius: 10, padding: "12px 14px", position: "relative" }}>
                      <div style={{ display: "flex", alignItems: "flex-start", gap: 10 }}>
                        <span style={{ fontSize: "1.3rem", flexShrink: 0 }}>{s.icon}</span>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontWeight: 700, fontSize: "0.88rem", color: c.label, marginBottom: 3 }}>
                            <span style={{ display: "inline-block", width: 8, height: 8, borderRadius: "50%", background: c.dot, marginRight: 6, verticalAlign: "middle" }} />
                            {s.priority.toUpperCase()} · {s.title}
                          </div>
                          <div style={{ fontSize: "0.82rem", color: "#374151", marginBottom: 6, lineHeight: 1.5 }}>{s.body}</div>
                          <div style={{ fontSize: "0.76rem", color: "#6b7280", display: "flex", alignItems: "center", gap: 4 }}>
                            <span>▶</span> <em>{s.action}</em>
                          </div>
                        </div>
                        <button type="button" title="Dismiss" onClick={() => dismiss(s.id)}
                          style={{ background: "none", border: "none", cursor: "pointer", color: "#9ca3af", fontSize: "1rem", padding: "0 4px", flexShrink: 0 }}>✕</button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
            {dismissed.length > 0 && (
              <button type="button"
                style={{ background: "none", border: "none", cursor: "pointer", color: "#6b7280", fontSize: "0.75rem", marginTop: 10 }}
                onClick={() => { setDismissed([]); try { localStorage.removeItem("sdx_ai_dismissed"); } catch {} }}
              >↩ Restore {dismissed.length} dismissed suggestion{dismissed.length !== 1 ? "s" : ""}</button>
            )}
            {patterns && (
              <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 16, padding: "12px 0", borderTop: "1px solid rgba(37,99,235,.1)" }}>
                {[
                  { label: "Records analysed", val: patterns.totalRecords },
                  { label: "Overall pass rate", val: `${patterns.passRate}%`, color: passColor(patterns.passRate) },
                  { label: "Avg issues/report", val: patterns.avgIssuesPerReport },
                  { label: "Weak locations", val: patterns.weakLocations?.length || 0 },
                  { label: "Schedule gaps", val: patterns.scheduleGaps?.length || 0 },
                ].map(stat => (
                  <div key={stat.label} style={{ background: "#fff", border: "1px solid #e5e7eb", borderRadius: 8, padding: "8px 14px", textAlign: "center", flex: "1 1 90px" }}>
                    <div style={{ fontWeight: 700, fontSize: "1.1rem", color: stat.color || "#1e293b" }}>{stat.val}</div>
                    <div style={{ fontSize: "0.7rem", color: "#6b7280" }}>{stat.label}</div>
                  </div>
                ))}
              </div>
            )}
          </>
        )}

        {/* ── INSPECTORS TAB ──────────────────────────────── */}
        {activeTab === "inspectors" && (() => {
          const profiles = patterns?.inspectorProfiles || [];
          if (!profiles.length) return <EmptyState icon="👤" msg="Inspector profiles will appear after saving inspections with inspector names." />;
          return (
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              <div style={{ fontSize: "0.74rem", color: "#6b7280", marginBottom: 4 }}>
                Ranked by total inspections. Trend compares first-half vs second-half pass rate.
              </div>
              {profiles.map((p, i) => {
                const arrow = trendArrow(p.trendLabel);
                return (
                  <div key={p.name} style={{ background: "#fff", border: "1px solid #e5e7eb", borderRadius: 10, padding: "12px 14px" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
                      <span style={{ fontWeight: 700, fontSize: "0.82rem", color: "#1e293b", flex: 1 }}>
                        #{i + 1} {p.name}
                      </span>
                      <span style={{ fontSize: "0.78rem", fontWeight: 700, color: arrow.color }}>{arrow.icon} {p.trendLabel}</span>
                    </div>
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 8 }}>
                      {[
                        { label: "Inspections", val: p.total },
                        { label: "Pass rate", val: `${p.passRate}%`, color: passColor(p.passRate) },
                        { label: "Avg issues", val: p.avgIssues },
                        { label: "Sites", val: p.siteCount },
                      ].map(s => (
                        <div key={s.label} style={{ background: "#f8faff", border: "1px solid #e0e7ff", borderRadius: 7, padding: "5px 10px", textAlign: "center" }}>
                          <div style={{ fontWeight: 700, fontSize: "0.95rem", color: s.color || "#2563EB" }}>{s.val}</div>
                          <div style={{ fontSize: "0.65rem", color: "#6b7280" }}>{s.label}</div>
                        </div>
                      ))}
                    </div>
                    {/* Pass rate bar */}
                    <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
                      <div style={{ fontSize: "0.7rem", color: "#6b7280", minWidth: 64 }}>Pass rate</div>
                      <MiniBar pct={p.passRate} color={passColor(p.passRate)} />
                      <div style={{ fontSize: "0.7rem", color: passColor(p.passRate), fontWeight: 700, minWidth: 34, textAlign: "right" }}>{p.passRate}%</div>
                    </div>
                    {p.topIssues?.length > 0 && (
                      <div style={{ fontSize: "0.72rem", color: "#6b7280" }}>
                        <span style={{ fontWeight: 600, color: "#374151" }}>Top issues: </span>
                        {p.topIssues.slice(0, 3).join(" · ")}
                      </div>
                    )}
                    {p.recentSites?.length > 0 && (
                      <div style={{ fontSize: "0.7rem", color: "#9ca3af", marginTop: 4 }}>
                        Recent: {p.recentSites.slice(0, 3).join(", ")}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          );
        })()}

        {/* ── SUPERVISORS TAB ─────────────────────────────── */}
        {activeTab === "supervisors" && (() => {
          const profiles = patterns?.supervisorProfiles || [];
          if (!profiles.length) return <EmptyState icon="🏢" msg="Supervisor profiles will appear after saving inspections with supervisor names." />;
          return (
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              <div style={{ fontSize: "0.74rem", color: "#6b7280", marginBottom: 4 }}>
                Ranked by total inspections. Recurring issues = same issue found at the same site on multiple visits.
              </div>
              {profiles.map((p, i) => (
                <div key={p.name} style={{
                  background: "#fff", border: p.hasRecurringIssues ? "1.5px solid #fecaca" : "1px solid #e5e7eb",
                  borderRadius: 10, padding: "12px 14px",
                }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
                    <span style={{ fontWeight: 700, fontSize: "0.82rem", color: "#1e293b", flex: 1 }}>
                      #{i + 1} {p.name}
                    </span>
                    {p.hasRecurringIssues && (
                      <span style={{ background: "#fef2f2", color: "#991b1b", border: "1px solid #fecaca", borderRadius: 99, fontSize: "0.65rem", fontWeight: 700, padding: "2px 7px" }}>
                        ⚠ Recurring issues
                      </span>
                    )}
                  </div>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 8 }}>
                    {[
                      { label: "Inspections", val: p.total },
                      { label: "Pass rate", val: `${p.passRate}%`, color: passColor(p.passRate) },
                      { label: "Sites", val: p.siteCount },
                    ].map(s => (
                      <div key={s.label} style={{ background: "#f8faff", border: "1px solid #e0e7ff", borderRadius: 7, padding: "5px 10px", textAlign: "center" }}>
                        <div style={{ fontWeight: 700, fontSize: "0.95rem", color: s.color || "#2563EB" }}>{s.val}</div>
                        <div style={{ fontSize: "0.65rem", color: "#6b7280" }}>{s.label}</div>
                      </div>
                    ))}
                  </div>
                  {p.problemSites?.length > 0 && (
                    <div style={{ marginTop: 6 }}>
                      <div style={{ fontSize: "0.72rem", fontWeight: 600, color: "#374151", marginBottom: 4 }}>Problem sites:</div>
                      <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                        {p.problemSites.slice(0, 3).map(s => (
                          <div key={s.site} style={{ display: "flex", alignItems: "center", gap: 6 }}>
                            <div style={{ fontSize: "0.72rem", color: "#374151", flex: 1 }}>{s.site}</div>
                            <MiniBar pct={100 - (s.total > 0 ? Math.round((s.fails / s.total) * 100) : 0)} color="#dc2626" />
                            <div style={{ fontSize: "0.68rem", color: "#dc2626", minWidth: 42, textAlign: "right" }}>
                              {s.fails}/{s.total} fail
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                  {p.topIssues?.length > 0 && (
                    <div style={{ fontSize: "0.72rem", color: "#6b7280", marginTop: 6 }}>
                      <span style={{ fontWeight: 600, color: "#374151" }}>Top issues: </span>
                      {p.topIssues.slice(0, 3).join(" · ")}
                    </div>
                  )}
                </div>
              ))}
            </div>
          );
        })()}

        {/* ── LOCATIONS TAB ───────────────────────────────── */}
        {activeTab === "locations" && (
          <LocationsPanel loc={patterns?.locationProfile} passColor={passColor} trendArrow={trendArrow} MiniBar={MiniBar} EmptyState={EmptyState} />
        )}

        {/* ── BEHAVIOR TAB ────────────────────────────────── */}
        {activeTab === "behavior" && (() => {
          const b = patterns?.behavior;
          if (!b) return <EmptyState icon="📋" msg="Behavior analytics will appear after saving inspections." />;

          const dayNames  = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
          const hourBuckets = b.hourBuckets || new Array(24).fill(0);
          const dayBuckets  = b.dayBuckets  || new Array(7).fill(0);
          const maxH = Math.max(...hourBuckets, 1);
          const maxD = Math.max(...dayBuckets, 1);

          const completeness = b.completeness || {};
          const compFields = [
            { key: "inspectorName", label: "Inspector name" },
            { key: "supervisorName", label: "Supervisor name" },
            { key: "temps", label: "Temperatures" },
            { key: "floor", label: "Floor / area" },
          ];

          return (
            <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>

              {/* Hour-of-day heatmap */}
              <div>
                <div style={{ fontWeight: 600, fontSize: "0.8rem", color: "#374151", marginBottom: 8 }}>
                  Inspections by Hour of Day
                  {b.peakHourLabel && <span style={{ fontWeight: 400, color: "#6b7280", marginLeft: 6 }}>Peak: {b.peakHourLabel}</span>}
                </div>
                <div style={{ display: "flex", gap: 2, alignItems: "flex-end", height: 50 }}>
                  {hourBuckets.map((count, h) => {
                    const hgt = Math.max(3, Math.round((count / maxH) * 44));
                    const isActive = count > 0;
                    return (
                      <div key={h} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center" }} title={`${h}:00 — ${count} inspection${count !== 1 ? "s" : ""}`}>
                        <div style={{
                          width: "100%", height: hgt, borderRadius: "2px 2px 0 0",
                          background: isActive ? (h === b.peakHour ? "#2563EB" : "rgba(37,99,235,.4)") : "#e5e7eb",
                        }} />
                        {(h % 6 === 0) && <div style={{ fontSize: "0.55rem", color: "#9ca3af", marginTop: 2 }}>{h}h</div>}
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Day-of-week bars */}
              <div>
                <div style={{ fontWeight: 600, fontSize: "0.8rem", color: "#374151", marginBottom: 8 }}>
                  Inspections by Day of Week
                  {b.peakDayLabel && <span style={{ fontWeight: 400, color: "#6b7280", marginLeft: 6 }}>Busiest: {b.peakDayLabel}</span>}
                </div>
                <div style={{ display: "flex", gap: 6, alignItems: "flex-end", height: 60 }}>
                  {dayBuckets.map((count, d) => {
                    const hgt = Math.max(4, Math.round((count / maxD) * 52));
                    return (
                      <div key={d} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 3 }}>
                        <div title={`${dayNames[d]}: ${count}`} style={{
                          width: "100%", height: hgt, borderRadius: "3px 3px 0 0",
                          background: d === b.peakDay ? "#2563EB" : "rgba(37,99,235,.35)",
                        }} />
                        <div style={{ fontSize: "0.65rem", color: "#9ca3af" }}>{dayNames[d]}</div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Inspection type frequency */}
              {b.topTypes?.length > 0 && (
                <div>
                  <div style={{ fontWeight: 600, fontSize: "0.8rem", color: "#374151", marginBottom: 8 }}>Top Inspection Types</div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
                    {b.topTypes.slice(0, 5).map(t => (
                      <div key={t.type} style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        <div style={{ fontSize: "0.78rem", color: "#374151", minWidth: 130, flexShrink: 0 }}>{t.type}</div>
                        <MiniBar pct={Math.round((t.count / b.topTypes[0].count) * 100)} />
                        <div style={{ fontSize: "0.72rem", color: "#6b7280", minWidth: 28, textAlign: "right" }}>{t.count}×</div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Data completeness */}
              <div>
                <div style={{ fontWeight: 600, fontSize: "0.8rem", color: "#374151", marginBottom: 8 }}>Form Field Completeness</div>
                <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
                  {compFields.map(f => {
                    const pct = completeness[f.key] ?? 0;
                    const color = pct >= 90 ? "#15803D" : pct >= 60 ? "#b45309" : "#dc2626";
                    return (
                      <div key={f.key} style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        <div style={{ fontSize: "0.78rem", color: "#374151", minWidth: 128, flexShrink: 0 }}>{f.label}</div>
                        <MiniBar pct={pct} color={color} />
                        <div style={{ fontSize: "0.72rem", color, fontWeight: 700, minWidth: 36, textAlign: "right" }}>{pct}%</div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Quick stats */}
              <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                {[
                  { label: "Total records", val: b.total || 0 },
                  { label: "Avg issues", val: b.avgIssues ?? 0 },
                  { label: "Zero-issue passes", val: b.zeroIssuePasses || 0 },
                  { label: "High-issue records", val: b.highIssueRecords || 0 },
                ].map(s => (
                  <div key={s.label} style={{ background: "#fff", border: "1px solid #e5e7eb", borderRadius: 8, padding: "8px 12px", textAlign: "center", flex: "1 1 90px" }}>
                    <div style={{ fontWeight: 700, fontSize: "1rem", color: "#2563EB" }}>{s.val}</div>
                    <div style={{ fontSize: "0.68rem", color: "#6b7280" }}>{s.label}</div>
                  </div>
                ))}
              </div>

            </div>
          );
        })()}

        {/* ── CALIBRATION TAB (Cross-Inspector) ─────────── */}
        {activeTab === "crossInsp" && (() => {
          const ci = patterns?.crossInspector;
          if (!ci) return <EmptyState icon="⚖️" msg="Inspector calibration analysis requires at least 4 inspections with inspector names filled in." />;
          const { profiles = [], siteCorrelations = [], rubberStampers = [], thorough = [], globalAvgIssues = 0 } = ci;
          if (profiles.length < 2) return <EmptyState icon="⚖️" msg="Calibration analysis requires at least 2 inspectors with 2+ inspections each." />;
          return (
            <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>

              {/* Inspector comparison table */}
              <div>
                <div style={{ fontWeight: 600, fontSize: "0.8rem", color: "#374151", marginBottom: 8 }}>Inspector Comparison</div>
                <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                  {profiles.map(p => {
                    const isRubber = rubberStampers.some(r => r.name === p.name);
                    const isThorough = thorough.some(t => t.name === p.name);
                    return (
                      <div key={p.name} style={{ background: "#fff", border: `1.5px solid ${isRubber ? "#f59e0b" : isThorough ? "#2563EB" : "#e5e7eb"}`, borderRadius: 8, padding: "8px 12px" }}>
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
                          <span style={{ fontWeight: 600, fontSize: "0.82rem", color: "#111827" }}>{p.name}</span>
                          <span style={{ display: "flex", gap: 6 }}>
                            {isRubber && <span style={{ background: "#fef3c7", color: "#92400e", borderRadius: 99, fontSize: "0.65rem", fontWeight: 700, padding: "2px 7px" }}>Under-reporting?</span>}
                            {isThorough && <span style={{ background: "#dbeafe", color: "#1e40af", borderRadius: 99, fontSize: "0.65rem", fontWeight: 700, padding: "2px 7px" }}>Most Thorough</span>}
                          </span>
                        </div>
                        <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
                          <span style={{ fontSize: "0.73rem", color: "#6b7280" }}>{p.total} visits</span>
                          <span style={{ fontSize: "0.73rem", color: passColor(p.passRate), fontWeight: 600 }}>{p.passRate}% pass</span>
                          <span style={{ fontSize: "0.73rem", color: "#374151" }}>Avg {p.avgIssues} issues/visit</span>
                          <span style={{ fontSize: "0.73rem", color: "#6b7280" }}>{p.zeroIssuePct}% zero-issue</span>
                        </div>
                      </div>
                    );
                  })}
                </div>
                <div style={{ fontSize: "0.7rem", color: "#9ca3af", marginTop: 6 }}>Team avg: {globalAvgIssues} issues/visit</div>
              </div>

              {/* Site/Inspector discrepancies */}
              {siteCorrelations.length > 0 && (
                <div>
                  <div style={{ fontWeight: 600, fontSize: "0.8rem", color: "#374151", marginBottom: 8 }}>
                    Sites with Inspector Pass-Rate Gaps
                    <span style={{ fontWeight: 400, color: "#6b7280", marginLeft: 6, fontSize: "0.71rem" }}>same site, different results</span>
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                    {siteCorrelations.map(sc => (
                      <div key={sc.site} style={{ background: "#fff", border: "1.5px solid #fca5a5", borderRadius: 8, padding: "8px 12px" }}>
                        <div style={{ fontWeight: 600, fontSize: "0.82rem", color: "#111827", marginBottom: 4 }}>{sc.site}</div>
                        <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
                          {sc.all.map(a => (
                            <div key={a.insp} style={{ display: "flex", alignItems: "center", gap: 8 }}>
                              <div style={{ fontSize: "0.75rem", color: "#374151", minWidth: 110, flexShrink: 0 }}>{a.insp}</div>
                              <MiniBar pct={a.passRate} color={passColor(a.passRate)} />
                              <div style={{ fontSize: "0.72rem", color: passColor(a.passRate), fontWeight: 700, minWidth: 38, textAlign: "right" }}>{a.passRate}%</div>
                            </div>
                          ))}
                        </div>
                        <div style={{ fontSize: "0.68rem", color: "#dc2626", marginTop: 4 }}>⚠ {sc.spread}-point gap — calibration recommended</div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

            </div>
          );
        })()}

        {/* ── RESOLUTION TAB ──────────────────────────────── */}
        {activeTab === "resolution" && (() => {
          const res = patterns?.issueResolution;
          if (!res) return <EmptyState icon="🔓" msg="Issue resolution tracking requires at least 4 inspections with action items filled in." />;
          const { siteResults = [], globalRecurrenceRate = 0, totalFollowUps = 0 } = res;
          if (totalFollowUps === 0) return <EmptyState icon="🔓" msg="No follow-up visits found yet. Resolution tracking activates once the same site has been inspected more than once." />;
          return (
            <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>

              {/* Global rate */}
              <div style={{ background: globalRecurrenceRate >= 50 ? "#fef2f2" : globalRecurrenceRate >= 30 ? "#fffbeb" : "#f0fdf4", border: `1.5px solid ${globalRecurrenceRate >= 50 ? "#fca5a5" : globalRecurrenceRate >= 30 ? "#fcd34d" : "#86efac"}`, borderRadius: 10, padding: "10px 14px" }}>
                <div style={{ fontWeight: 700, fontSize: "1.05rem", color: globalRecurrenceRate >= 50 ? "#dc2626" : globalRecurrenceRate >= 30 ? "#92400e" : "#15803D" }}>
                  {globalRecurrenceRate}% issue recurrence rate
                </div>
                <div style={{ fontSize: "0.75rem", color: "#6b7280", marginTop: 2 }}>
                  Across {totalFollowUps} follow-up visit{totalFollowUps !== 1 ? "s" : ""}, issues reappeared {globalRecurrenceRate}% of the time. {globalRecurrenceRate >= 50 ? "Corrective actions are not being completed." : globalRecurrenceRate >= 30 ? "Some issues are not being resolved between visits." : "Most issues are being resolved. Good work."}
                </div>
              </div>

              {/* Per-site resolution rates */}
              <div>
                <div style={{ fontWeight: 600, fontSize: "0.8rem", color: "#374151", marginBottom: 8 }}>Resolution Rate by Site</div>
                <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                  {siteResults.map(s => {
                    const resolvedPct = 100 - s.recurrenceRate;
                    return (
                      <div key={s.site} style={{ background: "#fff", border: `1.5px solid ${s.recurrenceRate >= 50 ? "#fca5a5" : "#e5e7eb"}`, borderRadius: 8, padding: "8px 12px" }}>
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
                          <span style={{ fontWeight: 600, fontSize: "0.82rem", color: "#111827" }}>{s.site}</span>
                          <span style={{ fontSize: "0.72rem", color: "#6b7280" }}>{s.followUps} follow-up{s.followUps !== 1 ? "s" : ""}</span>
                        </div>
                        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
                          <div style={{ fontSize: "0.73rem", color: "#374151", minWidth: 90, flexShrink: 0 }}>Resolved</div>
                          <MiniBar pct={resolvedPct} color={resolvedPct >= 70 ? "#15803D" : resolvedPct >= 50 ? "#b45309" : "#dc2626"} />
                          <div style={{ fontSize: "0.72rem", fontWeight: 700, color: resolvedPct >= 70 ? "#15803D" : resolvedPct >= 50 ? "#b45309" : "#dc2626", minWidth: 36, textAlign: "right" }}>{resolvedPct}%</div>
                        </div>
                        {s.topPersistent.length > 0 && (
                          <div style={{ fontSize: "0.68rem", color: "#6b7280" }}>
                            Persistent: {s.topPersistent.map(p => `"${p.issue}" (${p.times}×)`).join(", ")}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>

            </div>
          );
        })()}

        {/* ── INVENTORY TAB ───────────────────────────────── */}
        {activeTab === "inventory" && (() => {
          const inv = patterns?.equipmentInventory;
          if (!inv || inv.length === 0) return (
            <EmptyState icon="🔧" msg="No equipment counts recorded yet. Open an inspection, expand the Equipment section, and fill in the '# Units at this location' field for each piece of equipment." />
          );
          const fleetMax = Math.max(...inv.map(e => e.fleetTotal), 1);
          const today = new Date();
          const daysSince = (dateStr) => {
            if (!dateStr) return null;
            const d = new Date(dateStr);
            if (isNaN(d)) return null;
            return Math.floor((today - d) / 86400000);
          };
          const sourceIcon = { Facility: "🏢", Subcontractor: "🤝", Stadium: "🏟️", Event: "🎪" };
          const sourceBg   = { Facility: "#f0fdf4", Subcontractor: "#fef3c7", Stadium: "#eff6ff", Event: "#fdf4ff" };
          const sourceClr  = { Facility: "#166534", Subcontractor: "#92400e", Stadium: "#1d4ed8", Event: "#7c3aed" };
          return (
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              <div style={{ fontWeight: 600, fontSize: "0.85rem", color: "#374151", marginBottom: 4 }}>Fleet Equipment Inventory</div>
              <div style={{ fontSize: "0.75rem", color: "#6b7280", marginBottom: 8 }}>
                Based on the <strong>latest inspection per site</strong>. Equipment removed since the last visit is automatically dropped. Use "Equipment owned by" to flag subcontractor or event-temporary units.
              </div>
              {inv.map(eq => {
                const hasTmp = eq.temporaryUnits > 0;
                return (
                  <div key={eq.key} style={{ background: "#fff", border: `1.5px solid ${hasTmp ? "#fde68a" : "#e5e7eb"}`, borderRadius: 10, padding: "10px 14px" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
                      <span style={{ fontWeight: 700, fontSize: "0.85rem", color: "#111827" }}>{eq.label}</span>
                      <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                        {hasTmp && (
                          <span title={`${eq.temporaryUnits} temporary unit${eq.temporaryUnits !== 1 ? "s" : ""} (Subcontractor / Stadium / Event)`}
                            style={{ fontSize: "0.68rem", background: "#fef3c7", color: "#92400e", border: "1px solid #fde68a", borderRadius: 6, padding: "1px 6px" }}>
                            ⚠️ {eq.temporaryUnits} temp
                          </span>
                        )}
                        <span style={{ fontWeight: 800, fontSize: "1rem", color: "#2563EB" }}>{eq.fleetTotal} total</span>
                      </div>
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
                      <MiniBar pct={Math.round((eq.fleetTotal / fleetMax) * 100)} color="#2563EB" />
                      <span style={{ fontSize: "0.7rem", color: "#6b7280", whiteSpace: "nowrap" }}>
                        {eq.siteCount} site{eq.siteCount !== 1 ? "s" : ""} · avg {eq.avgPerSite} per site
                      </span>
                    </div>
                    {/* Source breakdown row */}
                    {(eq.sources?.Subcontractor > 0 || eq.sources?.Stadium > 0 || eq.sources?.Event > 0) && (
                      <div style={{ display: "flex", flexWrap: "wrap", gap: 4, marginBottom: 6 }}>
                        {["Facility","Subcontractor","Stadium","Event"].filter(s => eq.sources?.[s] > 0).map(s => (
                          <span key={s} style={{ fontSize: "0.67rem", background: sourceBg[s], color: sourceClr[s], border: `1px solid ${sourceClr[s]}33`, borderRadius: 6, padding: "2px 7px" }}>
                            {sourceIcon[s]} {s}: {eq.sources[s]}
                          </span>
                        ))}
                      </div>
                    )}
                    {/* Per-site breakdown with source badge + last-seen */}
                    {eq.siteBreakdown.length > 0 && (
                      <div style={{ display: "flex", flexDirection: "column", gap: 3, marginTop: 4 }}>
                        {eq.siteBreakdown.slice(0, 6).map(s => {
                          const days = daysSince(s.lastSeen);
                          const isTmp = s.source && s.source !== "Facility";
                          return (
                            <div key={s.site} style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
                              <span style={{ fontSize: "0.67rem", background: isTmp ? "#fef9c3" : "#eff6ff", color: isTmp ? "#78350f" : "#1d4ed8", border: `1px solid ${isTmp ? "#fde68a" : "#bfdbfe"}`, borderRadius: 6, padding: "2px 7px" }}>
                                {s.site}: {s.count}
                              </span>
                              {isTmp && (
                                <span style={{ fontSize: "0.63rem", color: "#92400e" }}>{sourceIcon[s.source]} {s.source}</span>
                              )}
                              {days !== null && (
                                <span style={{ fontSize: "0.63rem", color: days > 60 ? "#dc2626" : days > 30 ? "#d97706" : "#6b7280" }}
                                  title={`Last inspected: ${s.lastSeen}`}>
                                  {days === 0 ? "today" : `${days}d ago`}{days > 60 ? " ⚠️" : ""}
                                </span>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          );
        })()}

        {/* ── USAGE TAB ───────────────────────────────────── */}
        {activeTab === "usage" && usageReport && (
          <div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 16 }}>
              {[
                { label: "Total sessions", val: usageReport.sessions },
                { label: "Total interactions", val: usageReport.totalInteractions },
                { label: "Avg per day", val: usageReport.avgDailyInteractions },
                { label: "Active days", val: usageReport.activeDays },
              ].map(stat => (
                <div key={stat.label} style={{ background: "#fff", border: "1px solid #e5e7eb", borderRadius: 8, padding: "10px 16px", textAlign: "center", flex: "1 1 100px" }}>
                  <div style={{ fontWeight: 700, fontSize: "1.2rem", color: "#2563EB" }}>{stat.val}</div>
                  <div style={{ fontSize: "0.7rem", color: "#6b7280" }}>{stat.label}</div>
                </div>
              ))}
            </div>

            {usageReport.recentDays.length > 0 && (
              <>
                <div style={{ fontWeight: 600, fontSize: "0.8rem", color: "#374151", marginBottom: 8 }}>Activity — Last 7 days</div>
                <div style={{ display: "flex", gap: 4, alignItems: "flex-end", height: 60, marginBottom: 14 }}>
                  {usageReport.recentDays.map(d => {
                    const max = Math.max(...usageReport.recentDays.map(x => x.interactions), 1);
                    const h = Math.max(4, Math.round((d.interactions / max) * 52));
                    return (
                      <div key={d.date} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 3 }}>
                        <div title={`${d.interactions} interactions`} style={{ width: "100%", height: h, background: "#2563EB", borderRadius: "3px 3px 0 0", opacity: 0.8 }} />
                        <div style={{ fontSize: "0.6rem", color: "#9ca3af" }}>{d.date.slice(5)}</div>
                      </div>
                    );
                  })}
                </div>
              </>
            )}

            {usageReport.topActions.length > 0 && (
              <>
                <div style={{ fontWeight: 600, fontSize: "0.8rem", color: "#374151", marginBottom: 6 }}>Top actions</div>
                <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
                  {usageReport.topActions.slice(0, 6).map(a => (
                    <div key={a.name} style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <div style={{ fontSize: "0.78rem", color: "#374151", minWidth: 140, flexShrink: 0 }}>{a.name}</div>
                      <div style={{ flex: 1, background: "#e5e7eb", borderRadius: 99, overflow: "hidden", height: 8 }}>
                        <div style={{ height: "100%", background: "#2563EB", borderRadius: 99, width: `${Math.round((a.count / usageReport.topActions[0].count) * 100)}%` }} />
                      </div>
                      <div style={{ fontSize: "0.72rem", color: "#6b7280", minWidth: 28, textAlign: "right" }}>{a.count}×</div>
                    </div>
                  ))}
                </div>
              </>
            )}

            {usageReport.firstSeen && (
              <div style={{ fontSize: "0.72rem", color: "#9ca3af", marginTop: 14 }}>
                First seen: {new Date(usageReport.firstSeen).toLocaleDateString()} · Last seen: {new Date(usageReport.lastSeen).toLocaleDateString()}
              </div>
            )}
          </div>
        )}
        {activeTab === "usage" && !usageReport && (
          <EmptyState icon="📊" msg="Usage data will appear after interacting with the app for a session." />
        )}

        {/* ── PERFORMANCE TAB ─────────────────────────────── */}
        {activeTab === "perf" && (
          <div>
            {perfReport.length === 0 ? (
              <div style={{ textAlign: "center", padding: "20px 0", color: "#9ca3af", fontSize: "0.85rem" }}>
                Performance metrics will appear after using the app for a moment.
              </div>
            ) : (
              <>
                <div style={{ fontSize: "0.75rem", color: "#6b7280", marginBottom: 12 }}>
                  Real browser vitals measured during this session. Green = good, yellow = needs improvement, red = poor.
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                  {perfReport.map(m => (
                    <div key={m.key} style={{ background: "#fff", border: "1px solid #e5e7eb", borderRadius: 10, padding: "10px 14px" }}>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                        <div>
                          <div style={{ fontWeight: 600, fontSize: "0.83rem", color: "#1e293b" }}>{m.label}</div>
                          {m.baseline && m.regression && (
                            <div style={{ fontSize: "0.72rem", color: "#dc2626" }}>⚠ {m.regression}% slower than baseline ({m.baseline}{m.unit})</div>
                          )}
                          {m.baseline && !m.regression && (
                            <div style={{ fontSize: "0.72rem", color: "#15803D" }}>✓ Within baseline ({m.baseline}{m.unit})</div>
                          )}
                        </div>
                        <div style={{ textAlign: "right" }}>
                          <div style={{ fontWeight: 700, fontSize: "1.1rem", color: perfStatusColor[m.status] || "#374151" }}>{m.value}{m.unit}</div>
                          <div style={{ fontSize: "0.68rem", color: perfStatusColor[m.status] || "#6b7280", textTransform: "capitalize" }}>{m.status}</div>
                        </div>
                      </div>
                      {m.thresholds && (
                        <div style={{ marginTop: 6, background: "#f3f4f6", borderRadius: 99, height: 5, overflow: "hidden" }}>
                          <div style={{
                            height: "100%", borderRadius: 99,
                            background: perfStatusColor[m.status] || "#374151",
                            width: `${Math.min(100, Math.round((m.value / m.thresholds.poor) * 100))}%`,
                          }} />
                        </div>
                      )}
                    </div>
                  ))}
                </div>
                <div style={{ fontSize: "0.7rem", color: "#9ca3af", marginTop: 12 }}>
                  Baselines are computed from the first 3 sessions. Regressions ≥30% are flagged automatically.
                </div>
              </>
            )}
          </div>
        )}

      </div>
    </div>
  );
}

/* ── Predictive Insights Panel ───────────────────────────── */
function PredictiveInsightsPanel({ history }) {
  const [expanded, setExpanded] = React.useState({});
  const predictions = useMemo(() => buildPredictions(history), [history]);

  if (!predictions || predictions.length === 0) return null;

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

/* ── History Page Component ──────────────────────────────── */
function HistoryPage({ onBack, onEdit }) {
  const [history, setHistory] = useState([]);
  const [filterDate, setFilterDate] = useState("");
  const [filterType, setFilterType] = useState("");
  const [filterFloor, setFilterFloor] = useState("");
  const [filterIssue, setFilterIssue] = useState("");
  const [filterSite, setFilterSite] = useState("");
  const [filterLocType, setFilterLocType] = useState("");
  const [expandedId, setExpandedId] = useState(null);
  const [historyLoaded, setHistoryLoaded] = useState(false);
  const [historyTab, setHistoryTab] = useState("reports"); // "reports" | "analytics"
  const [haccpByReport, setHaccpByReport] = useState({}); // { [reportId]: [...submissions] }
  const [chatByReport, setChatByReport] = useState({});  // { [reportId]: [...messages] }

  useEffect(() => {
    loadHistory().then(h => {
      setHistory(h);
      setHistoryLoaded(true);
      // Feed history into AI engine on first load
      if (h.length > 0) AIEngine.learnFromHistory(h);
    });
  }, []);

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

  function importBackup(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async (ev) => {
      try {
        const records = JSON.parse(ev.target.result);
        if (!Array.isArray(records)) { alert("Invalid backup file."); return; }
        // Merge: keep existing records, add any new ones by id
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
    e.target.value = ""; // reset so same file can be imported again
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
          <div>
            <div className="brandTitle">Inspection History</div>
            <div className="brandSub">{history.length} saved inspection{history.length !== 1 ? "s" : ""}</div>
          </div>
        </div>
        <div className="topActions">
          <button className="btn btnGhost" onClick={onBack} type="button">Back to Inspector</button>
          <input ref={importRef} type="file" accept=".json" style={{ display: "none" }} onChange={importBackup} />
          <button className="btn btnGhost" onClick={() => importRef.current?.click()} type="button" title="Restore reports from a backup file">↑ Import</button>
          {history.length > 0 && (
            <>
              <button className="btn btnGhost" onClick={exportBackup} type="button" title="Download all reports as a backup file">↓ Backup</button>
              <button className="btn btnGhost" onClick={clearAll} type="button" style={{color: "#EE0000", borderColor: "#EE0000"}}>Clear All</button>
            </>
          )}
        </div>
      </header>
      <div className="topBarSpacer" />

      <main className="pageMain pageMainWide">
        {/* Filters */}
        <div className="card" style={{ marginBottom: 24 }}>
          <div className="cardHeader">
            <div className="cardTitle">Filters</div>
            {(filterDate || filterType || filterFloor || filterLocType || filterSite || filterIssue) && (
              <button className="btn btnGhost btnSmall" type="button" onClick={() => { setFilterDate(""); setFilterType(""); setFilterFloor(""); setFilterLocType(""); setFilterSite(""); setFilterIssue(""); }}>
                Clear filters
              </button>
            )}
          </div>
          <div className="cardBody">
            <div className="fieldGrid filterGrid">
              <label className="field">
                <span className="fieldLabel">Date</span>
                <select className="select" value={filterDate} onChange={e => setFilterDate(e.target.value)}>
                  <option value="">All dates</option>
                  {uniqueDates.map(d => <option key={d} value={d}>{d}</option>)}
                </select>
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
                  {uniqueLocTypes.map(t => <option key={t} value={t}>{t}</option>)}
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
            <AIHealthMonitor history={filtered.length > 0 ? filtered : history} />
            <PredictiveInsightsPanel history={filtered.length > 0 ? filtered : history} />
            <TempTrendChart history={filtered.length > 0 ? filtered : history} />
            <RecurringIssuesPanel history={filtered.length > 0 ? filtered : history} onLocationClick={filterByLocation} />
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
                <div className="card historyCard" key={rec.id} style={{ marginBottom: 16 }}>
                  <div className="cardHeader" style={{ cursor: "pointer" }} onClick={() => setExpandedId(isExpanded ? null : rec.id)}>
                    <div style={{ display: "flex", alignItems: "center", gap: 16, flex: 1 }}>
                      <span className="historyStatus" style={{ background: statusColor }}>{rec.overallStatus}</span>
                      <div>
                        <div className="cardTitle">{rec.siteName || rec.location || "Inspection"}</div>
                        <div className="cardSub">
                          {rec.inspectionDate} &middot;{" "}
                          <span className={cx("typeBadge",
                            rec.inspectionType === "Event Day" ? "typeBadgeEvent" :
                            rec.inspectionType === "Post Event" ? "typeBadgePost" : "typeBadgeRegular"
                          )}>{rec.inspectionType}</span>
                          {rec.locationType && <>{" "}&middot; <span className="typeBadge typeBadgeLocType">{rec.locationType}</span></>}
                          {rec.floor && <>{" "}&middot; <span className="typeBadge typeBadgeFloor">{rec.floor}</span></>}
                          {" "}&middot; {rec.inspectorName || "—"}
                        </div>
                      </div>
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                      {issues.length > 0 && <span className="pill">{issues.length} issue{issues.length !== 1 ? "s" : ""}</span>}
                      {onEdit && (
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
                    <div className="cardBody">
                      <div className="historyMeta">
                        <div><strong>Inspector:</strong> {rec.inspectorName || "—"}</div>
                        <div><strong>Supervisor:</strong> {rec.supervisorName || "—"}</div>
                        <div><strong>Unit #:</strong> {rec.siteNumber || "—"}</div>
                        <div><strong>Floor:</strong> {rec.floor || "—"}</div>
                        <div><strong>Hand sink:</strong> {rec.temps?.handSinkTempF || "—"}°F</div>
                        <div><strong>3-comp wash:</strong> {rec.temps?.threeCompSinkTempF || "—"}°F</div>
                      </div>

                      {issues.length > 0 && (
                        <div style={{ marginTop: 16 }}>
                          <div className="guideSectionTitle">Action Items</div>
                          <table className="historyTable">
                            <thead>
                              <tr><th>Issue</th><th>Priority</th></tr>
                            </thead>
                            <tbody>
                              {issues.map((a, i) => (
                                <tr key={i}>
                                  <td>{a.issue}</td>
                                  <td><span className={cx("priorityBadge", a.priority === "High" ? "priorityHigh" : "priorityMed")}>{a.priority}</span></td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      )}

                      {rec.rawNotes && (
                        <div style={{ marginTop: 16 }}>
                          <div className="guideSectionTitle">Inspector Notes</div>
                          <div className="historyNotesFormatted" style={{ maxHeight: 250, overflowY: "auto" }}>
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
                          <div className="haccpReportSection" style={{ marginTop: 16 }}>
                            <div className="guideSectionTitle">🌡️ HACCP Temperature Logs ({haccpSubs.length})</div>
                            {haccpSubs.map((sub, si) => {
                              const flagged = Object.entries(sub.temps || {}).filter(([k, vals]) => {
                                const item = HACCP_TEMP_ITEMS.find(i => i.key === k);
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
                                    {HACCP_TEMP_ITEMS.map(item => {
                                      const vals = (sub.temps || {})[item.key] || [];
                                      if (vals.length === 0 || vals.every(v => v === "")) return null;
                                      return (
                                        <div className="haccpReportTempRow" key={item.key}>
                                          <span className="haccpReportTempLabel">{item.label}</span>
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
                                    })}
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
                          <div style={{ marginTop: 16 }}>
                            <div className="guideSectionTitle">💬 Chat Log ({msgs.length} message{msgs.length !== 1 ? "s" : ""})</div>
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

                      <div style={{ marginTop: 16, display: "flex", gap: 8, flexWrap: "wrap" }}>
                        <button className="btn btnGhost btnSmall" type="button" onClick={() => {
                          exportAsTxt({ output: rec.output || rec.rawNotes || "", inspectionDate: rec.inspectionDate, siteName: rec.siteName });
                        }}>Download TXT</button>
                        <button className="btn btnGhost btnSmall" type="button" onClick={() => {
                          exportAsHtml({ output: rec.output || rec.rawNotes || "", inspectionType: rec.inspectionType, inspectionDate: rec.inspectionDate, siteName: rec.siteName, inspectorName: rec.inspectorName });
                        }}>Download HTML</button>
                        {onEdit && (
                          <button className="btn btnGhost btnSmall" type="button"
                            style={{ color: "#2563EB", borderColor: "rgba(37,99,235,.3)" }}
                            onClick={() => onEdit(rec)}>✏️ Edit</button>
                        )}
                        <button className="btn btnGhost btnSmall" type="button" onClick={() => deleteRecord(rec.id)}
                          style={{ color: "#EE0000", borderColor: "rgba(238,0,0,.3)", marginLeft: "auto" }}>Delete</button>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        ))}
      </main>

      <footer className="footer">
        <img src={LOGO_WHITE} alt="Sodexo" className="footerLogo" />
        <span>{FIREBASE_ON ? "\u2601\uFE0F Inspection history synced to cloud database." : "Inspection history is stored locally in your browser."}</span>
      </footer>
    </div>
  );
}

/* ── Admin Panel ──────────────────────────────────────────── */
function AdminPanel({ currentUser, onBack }) {
  const [users, setUsers] = useState([]);
  const [showAddForm, setShowAddForm] = useState(false);
  const [addBadge, setAddBadge] = useState("");
  const [addName, setAddName] = useState("");
  const [addDept, setAddDept] = useState("");
  const [addRole, setAddRole] = useState("inspector");
  const [addError, setAddError] = useState("");
  const [addSuccess, setAddSuccess] = useState("");
  const [addLoading, setAddLoading] = useState(false);

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

  async function handleRemove(badgeHash) {
    if (!confirm("Remove this user? They will need to request access again.")) return;
    await denyUser(badgeHash); await refresh();
  }

  async function handleAddUser(e) {
    e.preventDefault();
    setAddError(""); setAddSuccess(""); setAddLoading(true);
    try {
      if (addBadge.trim().length < 3) { setAddError("Badge number must be at least 3 characters."); return; }
      const result = await adminAddUser(addBadge.trim(), addName.trim(), addDept.trim(), addRole);
      if (result.ok) {
        setAddSuccess(`${addName.trim()} added as ${addRole === "admin" ? "Admin" : "Inspector"}.`);
        setAddBadge(""); setAddName(""); setAddDept(""); setAddRole("inspector");
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
                    <select className="select" value={addRole} onChange={e => setAddRole(e.target.value)}>
                      <option value="inspector">Inspector</option>
                      <option value="admin">Admin</option>
                    </select>
                  </label>
                </div>
                {addError && <div className="pinError" style={{ marginTop: 8 }}>{addError}</div>}
                {addSuccess && <div className="addUserSuccess">{addSuccess}</div>}
                <button className="btn btnPrimary" type="submit" style={{ marginTop: 12 }}
                  disabled={addLoading || addBadge.trim().length < 3 || !addName.trim() || !addDept.trim()}>
                  {addLoading ? "Adding..." : `Add as ${addRole === "admin" ? "Admin" : "Inspector"}`}
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

        {/* Approved users */}
        <div className="card adminCard">
          <div className="cardHeader">
            <div className="cardTitle">
              Team Members
              <span className="adminCount">{approved.length}</span>
            </div>
          </div>
          <div className="cardBody">
            {approved.length === 0 ? (
              <div className="emptyState">
                <div className="emptyTitle">No approved users</div>
              </div>
            ) : approved.map(u => {
              const isSelf = u.badgeHash === currentUser?.badgeHash;
              const isOnlyAdmin = u.role === "admin" && adminCount <= 1;
              return (
                <div className="adminUserRow" key={u.badgeHash}>
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
                  <div className="adminUserActions">
                    {u.role === "inspector" && (
                      <button className="btn btnGhost btnSmall" onClick={() => handlePromote(u.badgeHash)}>Make Admin</button>
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

function PhotoStrip({ photos, onRemove }) {
  if (!photos?.length) return null;
  return (
    <div className="photoStrip">
      {photos.map((p) => (
        <div className="photoThumb" key={p.id}>
          <img src={p.previewUrl} alt={p.name} />
          <button className="thumbX" type="button" onClick={() => onRemove(p.id)} aria-label="Remove photo">×</button>
        </div>
      ))}
    </div>
  );
}

function GuideSection({ title, items, inspection, setInspection, allowCustom, sectionKey, coldEquipmentMap, maintenanceItems, emptyHint }) {
  const fileRefs = useRef({});
  const [newItemName, setNewItemName] = useState("");
  const [newMaintName, setNewMaintName] = useState("");
  const [open, setOpen] = useState(false);

  async function addPhotos(pathKey, files) {
    const accepted = Array.from(files || []).slice(0, PHOTO_LIMIT);
    const enriched = [];
    for (const f of accepted) {
      if (!f.type.startsWith("image/")) continue;
      if (bytesToMb(f.size) > PHOTO_MAX_MB) continue;
      // Compress to save storage space (resizes to max 800px, JPEG 60% quality)
      const previewUrl = await compressImage(f);
      if (!previewUrl) continue;
      enriched.push({ id: `${Date.now()}_${Math.random().toString(16).slice(2)}`, name: f.name, sizeMb: bytesToMb(f.size), type: "image/jpeg", previewUrl });
    }
    if (enriched.length === 0) return;
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
                      {it.label}
                      {coldInfo && !isNA && <span className="coldTypeBadge">{coldInfo.type === "cooler" ? "\u2744 Cooler" : "\u2744 Freezer"}</span>}
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
                          <div className="tempInputWrap" style={{ flex: 1 }}>
                            <input className="input inputSmall tempInput" inputMode="numeric" value={tempVal}
                              onChange={(e) => setInspection((prev) => setAtPath(prev, it.path, { ...current, tempF: e.target.value }))}
                              placeholder={coldInfo.type === "cooler" ? "40" : "10"} />
                            <span className="tempUnit">{"\u00B0F"}</span>
                          </div>
                          <span className="hint" style={{ whiteSpace: "nowrap" }}>
                            {tempVal ? (tempNum <= coldInfo.max ? `\u2705 \u2264${coldInfo.max}\u00B0F` : `\u26A0\uFE0F Above ${coldInfo.max}\u00B0F`) : `Max ${coldInfo.max}\u00B0F`}
                          </span>
                        </div>
                      )}
                      <div className="equipCountRow">
                        <label className="equipCountLabel"># Units at this location:</label>
                        <input className="input inputSmall equipCountInput" type="number" min="0" inputMode="numeric"
                          value={current.count ?? ""}
                          onChange={(e) => setInspection((prev) => setAtPath(prev, it.path, { ...current, count: e.target.value }))}
                          placeholder="1" />
                      </div>
                      <div className="equipCountRow">
                        <label className="equipCountLabel">Equipment owned by:</label>
                        <select className="select selectSmall"
                          value={current.equipSource || "Facility"}
                          onChange={(e) => setInspection((prev) => setAtPath(prev, it.path, { ...current, equipSource: e.target.value }))}>
                          <option value="Facility">🏢 Facility (permanent)</option>
                          <option value="Subcontractor">🤝 Subcontractor</option>
                          <option value="Stadium">🏟️ Stadium / Venue</option>
                          <option value="Event">🎪 Event (temporary)</option>
                        </select>
                      </div>
                      <input className="input inputSmall" value={current.notes}
                        onChange={(e) => setInspection((prev) => setAtPath(prev, it.path, { ...current, notes: e.target.value }))}
                        placeholder="Issue / observation (optional)" />
                      <div className="photoRow">
                        <input ref={(el) => (fileRefs.current[key] = el)} className="fileInput" type="file" accept="image/*" multiple
                          onChange={(e) => { addPhotos(key, e.target.files); e.target.value = ""; }} />
                        <button className="btn btnGhost btnSmall photoBtn" type="button" onClick={() => fileRefs.current[key]?.click()}>
                          📷 Add photos
                        </button>
                        <span className="hint">Up to {PHOTO_LIMIT} ({PHOTO_MAX_MB}MB each)</span>
                      </div>
                      <PhotoStrip photos={current.photos} onRemove={(id) => removePhoto(key, id)} />
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
                          <div className="guideLabel">{it.label}</div>
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
                            onChange={e => { addPhotos(pathKey, e.target.files); e.target.value = ""; }} />
                          <button className="btn btnGhost btnSmall photoBtn" type="button" onClick={() => fileRefs.current[pathKey]?.click()}>
                            📷 Add photos
                          </button>
                          <span className="hint">Up to {PHOTO_LIMIT} ({PHOTO_MAX_MB}MB each)</span>
                        </div>
                        <PhotoStrip photos={cur.photos} onRemove={id => {
                          setInspection(prev => {
                            const cur2 = getAtPath(prev, it.path) || withPhotos({ status: "OK", notes: "", priority: "Low" });
                            return setAtPath(prev, it.path, { ...cur2, photos: (cur2.photos || []).filter(p => p.id !== id) });
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

/* ── Inline Chat (embedded in the report output section) ───── */
function InlineChat({ currentUser, sessionId }) {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [open, setOpen] = useState(true);
  const listRef = useRef(null);
  const prevCountRef = useRef(0);

  useEffect(() => {
    loadChatMessages(sessionId).then(setMessages);
    const iv = setInterval(() => loadChatMessages(sessionId).then(setMessages), 6000);
    return () => clearInterval(iv);
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
    loadChatMessages(sessionId).then(setMessages);
    const iv = setInterval(() => loadChatMessages(sessionId).then(setMessages), 6000);
    return () => clearInterval(iv);
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
  const [problem, setProblem] = useState("");
  const [severity, setSeverity] = useState("issue");
  const [problemPhotos, setProblemPhotos] = useState([]);
  const problemPhotoRef = useRef(null);
  const [submitting, setSubmitting] = useState(false);
  const [chatMessages, setChatMessages] = useState([]);
  const [chatInput, setChatInput] = useState("");
  const [chatSending, setChatSending] = useState(false);
  const chatListRef = useRef(null);
  const chatPrevCountRef = useRef(0);

  // Load chat scoped to this report (urlReportId), so supervisor and inspector share the same thread
  useEffect(() => {
    const chatKey = urlReportId || sessionId;
    if (!chatKey) return;
    loadChatMessages(chatKey).then(setChatMessages);
    const iv = setInterval(() => loadChatMessages(chatKey).then(setChatMessages), 8000);
    return () => clearInterval(iv);
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
    for (const f of accepted) {
      if (!f.type.startsWith("image/")) continue;
      if (bytesToMb(f.size) > PHOTO_MAX_MB) continue;
      const previewUrl = await compressImage(f);
      if (!previewUrl) continue;
      enriched.push({ id: `${Date.now()}_${Math.random().toString(16).slice(2)}`, name: f.name, previewUrl });
    }
    if (enriched.length) setProblemPhotos(prev => [...prev, ...enriched].slice(0, PHOTO_LIMIT));
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
      problemReport: problem.trim() ? { text: problem.trim(), severity, photos: problemPhotos } : null,
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
        photos: problemPhotos,
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
                {HACCP_TEMP_ITEMS.map(item => {
                  const readings = temps[item.key] || [""];
                  return (
                    <div className="haccpTempBlock" key={item.key}>
                      <div className="haccpTempBlockHead">
                        <span className="haccpTempLabel">
                          {item.label}
                          <span style={{ fontSize: "0.68rem", color: "#9ca3af", fontWeight: 400, marginLeft: 6 }}>
                            {item.type === "hot" ? `Min ${item.min}${item.unit}` : `Max ${item.max}${item.unit}`}
                          </span>
                        </span>
                        <button type="button" className="haccpAddReadingBtn"
                          onClick={() => {
                            setTemps(p => ({ ...p, [item.key]: [...(p[item.key] || [""]), ""] }));
                            setFoodNames(p => ({ ...p, [item.key]: [...(p[item.key] || [""]), ""] }));
                          }}>
                          + Reading
                        </button>
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
                {problemPhotos.length > 0 && (
                  <div className="photoStrip" style={{ marginTop: 8 }}>
                    {problemPhotos.map(p => (
                      <div className="photoThumb" key={p.id}>
                        <img src={p.previewUrl} alt={p.name} />
                        <button className="thumbX" type="button"
                          onClick={() => setProblemPhotos(prev => prev.filter(x => x.id !== p.id))}>×</button>
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
  const [currentUser, setCurrentUser] = useState(null);
  const [page, setPage] = useState("inspector"); // "inspector" | "history" | "admin"
  const [pendingCount, setPendingCount] = useState(0);
  const [headerH, setHeaderH] = useState(64);
  const headerRef = useRef(null);
  const lastActivity = useRef(Date.now());

  // Dismiss splash screen once React mounts
  useEffect(() => {
    const splash = document.getElementById("splash");
    if (splash) {
      splash.classList.add("hide");
      setTimeout(() => splash.remove(), 350);
    }
  }, []);

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
    if (!currentUser || currentUser.role !== "admin" || locked) { setPendingCount(0); return; }
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

  const [noteType, setNoteType] = useState("inspection");
  const [context, setContext] = useState(() => buildDefaultContext("inspection"));
  const [inspection, setInspection] = useState(() => buildDefaultInspection());
  const [rawNotes, setRawNotes] = useState("");
  const [useCase, setUseCase] = useState(NOTE_TYPES.inspection.useCases[0]);

  const [inspectionType, setInspectionType] = useState("Regular Inspection");
  const [inspectionDate, setInspectionDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [inspectorName, setInspectorName] = useState("");

  const [siteName, setSiteName] = useState("");
  const [siteNumber, setSiteNumber] = useState("");
  const [supervisorName, setSupervisorName] = useState("");
  const [sitePhone, setSitePhone] = useState("");
  const [locationType, setLocationType] = useState("Concession");
  const [floor, setFloor] = useState("Floor 1");

  const [menuOpen, setMenuOpen] = useState(false);
  const [showShareModal, setShowShareModal] = useState(false);
  const [showHaccpModal, setShowHaccpModal] = useState(false);
  const [showChatPanel, setShowChatPanel] = useState(false);

  const [output, setOutput] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [warnings, setWarnings] = useState([]);
  const [aiTips, setAiTips] = useState([]);
  const [saved, setSaved] = useState(false);
  const [savedReportId, setSavedReportId] = useState(null); // ID of the most recently saved report
  const [showEodPrompt, setShowEodPrompt] = useState(false);
  const rawNotesRef = useRef(null);

  // Track activity for auto-lock
  const resetActivity = useCallback(() => { lastActivity.current = Date.now(); }, []);

  useEffect(() => {
    if (locked) return;
    const events = ["mousedown", "keydown", "touchstart", "scroll"];
    events.forEach(e => window.addEventListener(e, resetActivity, { passive: true }));
    const timer = setInterval(() => {
      if (Date.now() - lastActivity.current > LOCK_TIMEOUT_MS) {
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
    // Clean URL without reloading
    if (p.toString()) window.history.replaceState({}, "", window.location.pathname);
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

  // Supervisor HACCP portal — served via ?haccp=1 URL param (no auth required)
  const isHaccpPortal = new URLSearchParams(window.location.search).has("haccp");
  if (isHaccpPortal) return <HaccpPortal />;

  if (locked) return <BadgeScreen onUnlock={(user) => { setCurrentUser(user); setLocked(false); resetActivity(); if (user?.name && !inspectorName) setInspectorName(user.name); }} />;
  if (page === "history") { AIEngine.trackPage("history"); return <HistoryPage onBack={() => setPage("inspector")} onEdit={loadRecordForEdit} />; }
  if (page === "admin")   { AIEngine.trackPage("admin");   return <AdminPanel currentUser={currentUser} onBack={() => setPage("inspector")} />; }

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
    setContext(buildDefaultContext(noteType));
    setInspection(buildDefaultInspection());
    setRawNotes("");
    setOutput("");
    setError("");
    setWarnings([]);
    setAiTips([]);
    setSaved(false);
    setSavedReportId(null);
    setInspectionType("Regular Inspection");
    setInspectionDate(new Date().toISOString().slice(0, 10));
    setInspectorName(currentUser?.name || "");
    setSiteName("");
    setSiteNumber("");
    setSupervisorName("");
    setSitePhone("");
    setLocationType("Concession");
    setFloor("Floor 1");
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function loadRecordForEdit(rec) {
    // Restore every field from the saved record back into the form
    const nt = rec.noteType || "inspection";
    setNoteType(nt);
    setInspectionType(rec.inspectionType || "Regular Inspection");
    setInspectionDate(rec.inspectionDate || "");
    setInspectorName(rec.inspectorName || "");
    setSiteName(rec.siteName || "");
    setSiteNumber(rec.siteNumber || "");
    setSupervisorName(rec.supervisorName || "");
    setSitePhone(rec.sitePhone || "");
    setLocationType(rec.locationType || "Concession");
    setFloor(rec.floor || "Floor 1");
    setContext(rec.context ? { ...rec.context } : buildDefaultContext(nt));
    setInspection(rec.inspection ? { ...rec.inspection } : buildDefaultInspection());
    setRawNotes(rec.rawNotes || "");
    setOutput(rec.output || "");
    // Keep the same report ID so re-saving overwrites the existing record
    setSavedReportId(rec.id);
    setSaved(false);
    setError("");
    setWarnings([]);
    setAiTips([]);
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

  function onTransform() {
    setError("");
    setWarnings([]);
    setAiTips([]);

    // Validate
    const w = validateForm({ inspectionDate, inspectorName, context, noteType, inspection });
    if (w.length) setWarnings(w);

    if (!rawNotes.trim()) {
      setError("Please enter raw notes before transforming.");
      return;
    }

    setLoading(true);
    try {
      const out = transformLocally({
        noteType, useCase, context, inspection, rawNotes,
        inspectionType, inspectionDate, inspectorName,
        siteName, siteNumber, sitePhone, supervisorName, floor,
      });
      setOutput(out);

      // Assign a provisional report ID immediately so InlineChat is scoped
      // to this specific report from the moment it is generated — not null.
      // saveToHistory() will reuse this same ID when the user saves.
      setSavedReportId(prev =>
        prev ? prev : `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
      );

      // Run AI assist
      const tips = aiAssist({ inspection, rawNotes, context, noteType });
      setAiTips(tips);
    } catch (e) {
      setError(e?.message || "Something went wrong");
    } finally {
      setLoading(false);
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
    // Strip large photo data URLs from inspection copy to keep record size manageable
    function stripPhotos(obj) {
      if (!obj || typeof obj !== "object") return obj;
      if (Array.isArray(obj)) return obj.map(stripPhotos);
      const out = {};
      for (const [k, v] of Object.entries(obj)) {
        if (k === "photos" && Array.isArray(v)) {
          out.photos = v.map(p => ({ id: p.id, name: p.name, sizeMb: p.sizeMb, type: p.type }));
        } else {
          out[k] = stripPhotos(v);
        }
      }
      return out;
    }

    const record = {
      // Reuse the provisional ID assigned at onTransform() time so that any
      // chat messages written before saving remain associated with this record.
      id: savedReportId || `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      savedAt: new Date().toISOString(),
      noteType, inspectionType, inspectionDate, inspectorName,
      siteName, siteNumber, supervisorName, sitePhone, locationType, floor,
      location: siteName || context?.kitchen || "Kitchen",
      context: { ...context },
      temps: { ...inspection.temps },
      overallStatus: calcOverallStatus(inspection),
      actionItems: buildActionItems({ inspection, rawNotes }),
      rawNotes,
      output,
      inspection: stripPhotos(inspection),
      photoCount: countPhotos(inspection),
    };
    try {
      await saveOneInspection(record);
      learnFromSave(record);
      setSaved(true);
      setSavedReportId(record.id);
      setTimeout(() => setSaved(false), 2500);
      // Tell AI engine about the new save — triggers self-improvement cycle
      AIEngine.trackAction("saveInspection", {
        overallStatus: record.overallStatus,
        inspectionType: record.inspectionType,
        locationType: record.locationType || "unknown",
        issueCount: (record.actionItems || []).length,
      });
      const allHistory = await loadHistory();
      AIEngine.learnFromInspection(record, allHistory);
    } catch (e) {
      console.error("Save failed:", e);
      setError("Save failed — record may be too large. Try removing some photos.");
    }
  }

  function onDownloadCsv() {
    exportAsCsv({ inspection, rawNotes, inspectionType, inspectionDate, inspectorName, siteName, siteNumber, supervisorName, floor });
  }

  function onDownloadHtml() {
    exportAsHtml({ output, inspection, rawNotes, inspectionType, inspectionDate, siteName, siteNumber, sitePhone, inspectorName, supervisorName, floor });
  }

  function onDownloadTxt() {
    exportAsTxt({ output, inspectionDate, siteName });
  }

  return (
    <div className="appShell">
      <header className="topBar" ref={headerRef}>
        <div className="brandLeft brandClickable" onClick={() => { setPage("inspector"); window.scrollTo({ top: 0, behavior: "smooth" }); }} title="Home">
          <img src={LOGO_WHITE} alt="Sodexo" className="brandLogo" />
          <div>
            <div className="brandTitle">Kitchen Inspection</div>
            <div className="brandSub">Turn sit-down inspection notes into organized documents</div>
          </div>
        </div>

        {/* Header actions: Share + HACCP QR + Generate + Hamburger */}
        <div className="topActionsHamburger">
          {canShare && (
            <button className="btn btnShare" type="button" onClick={() => setShowShareModal(true)} title="Share pre-filled form link">
              📤 Share
            </button>
          )}
          {/* HACCP QR button moved to sticky action bar after save */}
          <button className={cx("btn", "btnPrimary", "btnGenHeader")} onClick={onTransform} type="button" disabled={loading}>
            {loading ? "Generating..." : "Generate Report"}
          </button>
          <button className="hamburgerBtn" onClick={() => setMenuOpen(!menuOpen)} type="button" aria-label="Menu">
            <span className={cx("hamburgerIcon", menuOpen && "hamburgerOpen")}>
              <span /><span /><span />
            </span>
            {pendingCount > 0 && <span className="hamburgerBadge">{pendingCount}</span>}
          </button>
        </div>

        {/* Dropdown menu */}
        {menuOpen && (
          <div className="dropdownMenu" onClick={() => setMenuOpen(false)}>
            {currentUser && (
              <div className="dropdownMenuUser">{currentUser.name}{currentUser.role === "admin" ? " (Admin)" : ""}</div>
            )}
            <button className="dropdownMenuItem" onClick={startNewInspection} type="button">+ New Inspection</button>
            <button className="dropdownMenuItem" onClick={() => setPage("history")} type="button">Past Reports</button>
            {currentUser?.role === "admin" && (
              <button className="dropdownMenuItem" onClick={() => setPage("admin")} type="button">
                Admin Panel
                {pendingCount > 0 && <span className="menuBadge">{pendingCount} pending</span>}
              </button>
            )}
            <button className="dropdownMenuItem dropdownMenuDanger" onClick={() => { lockApp(); setCurrentUser(null); setLocked(true); }} type="button">Lock App</button>
          </div>
        )}
      </header>
      <div style={{ height: headerH, flexShrink: 0 }} />

      <main className="grid">
        {/* LEFT */}
        <section className="card">
          <div className="cardHeader">
            <div className="cardTitle">Inspection Details</div>
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
                <input className="input" value={inspectorName} onChange={(e) => setInspectorName(e.target.value)} placeholder="e.g., J. Da Silva" />
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
                <span className="fieldLabel">Restaurant / Location</span>
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
              </label>
              <label className="field" id="field-siteNumber">
                <span className="fieldLabel">Unit Number</span>
                <input className="input" list="siteNumberSuggestions" value={siteNumber} onChange={(e) => setSiteNumber(e.target.value)} placeholder="e.g., Unit 12 / Loc-204" />
                <datalist id="siteNumberSuggestions">
                  {(getAutofillMemory().siteNumber || []).map((s, i) => <option key={i} value={s} />)}
                </datalist>
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
            </div>

            <div className="fieldGrid">
              {spec.contextFields.map((f) => (
                <label className="field" key={f.key} id={`field-ctx-${f.key}`}>
                  <span className="fieldLabel">{f.label}</span>
                  {f.key === "date" ? (
                    <input className="input" type="date" value={context[f.key] ?? ""} onChange={(e) => setContext((c) => ({ ...c, [f.key]: e.target.value }))} />
                  ) : (
                    <input className="input" value={context[f.key] ?? ""} onChange={(e) => setContext((c) => ({ ...c, [f.key]: e.target.value }))} placeholder={f.label} />
                  )}
                </label>
              ))}
            </div>

            <div className="field">
              <div className="fieldLabelRow">
                <span className="fieldLabel">Final output format</span>
                <span className="hint">Adapts to the selected note type</span>
              </div>
              <select className="select" value={useCase} onChange={(e) => setUseCase(e.target.value)}>
                {spec.useCases.map((u) => (<option key={u} value={u}>{u}</option>))}
              </select>
            </div>

            <div className="guide">
              <div className="guideHeader">
                <div>
                  <div className="guideTitle">Inspector guide</div>
                  <div className="guideSub">Fast checklist for sit-down kitchen inspections</div>
                </div>
                <div className="pillRow">
                  <span className="pill">Hand sink {"\u2265"} 95 F</span>
                  <span className="pill">3-comp wash {"\u2265"} 110 F</span>
                  <span className="pill">Cooler {"\u2264"} 40 F</span>
                  <span className="pill">Freezer {"\u2264"} 20 F</span>
                </div>
              </div>

              <GuideSection title="🏢 Facility & Maintenance"
                items={[
                  { path: ["facility", "ceiling"], label: "Ceiling" },
                  { path: ["facility", "walls"], label: "Walls" },
                  { path: ["facility", "floors"], label: "Floors" },
                  { path: ["facility", "lighting"], label: "Lighting" },
                ]} inspection={inspection} setInspection={setInspection}
                allowCustom sectionKey="facility"
                maintenanceItems={[
                  { path: ["maintenance", "pestControl"],       label: "Pest control",        hasPriority: true },
                  { path: ["maintenance", "hvac"],              label: "HVAC / Air conditioning", hasPriority: true },
                  { path: ["maintenance", "plumbing"],          label: "Plumbing / Drains",   hasPriority: true },
                  { path: ["maintenance", "electricalSafety"],  label: "Electrical safety",   hasPriority: true },
                  { path: ["maintenance", "dumpsterArea"],      label: "Dumpster / trash area", hasPriority: true },
                  { path: ["maintenance", "structuralDamage"],  label: "Structural damage",   hasPriority: true },
                ]} />

              <GuideSection title="Operations: employees + process controls"
                items={[
                  { path: ["operations", "employeePractices"], label: "Employee practices" },
                  { path: ["operations", "handwashing"], label: "Handwashing / supplies" },
                  { path: ["operations", "labelingDating"], label: "Labeling / dating" },
                  { path: ["operations", "logs"], label: "Logs / documentation" },
                ]} inspection={inspection} setInspection={setInspection}
                allowCustom sectionKey="operations" />

              <div className="tempsRow">
                <div className="tempsTitle">Key temperatures</div>
                <div className="tempsGrid">
                  <label className="field" id="field-handSinkTempF" style={{ marginTop: 0 }}>
                    <span className="fieldLabel">Hand sink temp</span>
                    <div className="tempInputWrap">
                      <input className="input tempInput" inputMode="numeric" value={inspection.temps.handSinkTempF}
                        onChange={(e) => setInspection((prev) => ({ ...prev, temps: { ...prev.temps, handSinkTempF: e.target.value } }))}
                        placeholder="97" />
                      <span className="tempUnit">{"\u00B0F"}</span>
                    </div>
                    <span className="hint">
                      {Number(inspection.temps.handSinkTempF) >= 95 ? "Meets >=95 F" : inspection.temps.handSinkTempF ? "Below 95 F - flag" : ""}
                    </span>
                  </label>
                  <label className="field" id="field-threeCompSinkTempF" style={{ marginTop: 0 }}>
                    <span className="fieldLabel">3-comp wash temp</span>
                    <div className="tempInputWrap">
                      <input className="input tempInput" inputMode="numeric" value={inspection.temps.threeCompSinkTempF}
                        onChange={(e) => setInspection((prev) => ({ ...prev, temps: { ...prev.temps, threeCompSinkTempF: e.target.value } }))}
                        placeholder="112" />
                      <span className="tempUnit">{"\u00B0F"}</span>
                    </div>
                    <span className="hint">
                      {Number(inspection.temps.threeCompSinkTempF) >= 110 ? "Meets >=110 F" : inspection.temps.threeCompSinkTempF ? "Below 110 F - flag" : ""}
                    </span>
                  </label>
                  {/* Cold equipment temps — synced with equipment items below.
                      For Portable/Subcontractor, show temps for any equipment item
                      that has a cold type (detected from label or key). */}
                  {(locationType === "Concession"
                    ? Object.entries(COLD_EQUIPMENT)
                    : Object.entries(inspection.equipment || {})
                        .filter(([k, v]) => detectColdType(v?.label || k))
                        .map(([k, v]) => {
                          const cold = detectColdType(v?.label || k);
                          return [k, { ...cold, label: v?.label || k }];
                        })
                  ).map(([eqKey, cold]) => {
                    const node = inspection.equipment?.[eqKey];
                    const val = node?.tempF || "";
                    const num = Number(val);
                    return (
                      <label className="field" key={eqKey} style={{ marginTop: 0 }}>
                        <span className="fieldLabel">{cold.label} temp</span>
                        <div className="tempInputWrap">
                          <input className="input tempInput" inputMode="numeric" value={val}
                            onChange={(e) => setInspection((prev) => {
                              const cur = prev.equipment?.[eqKey] || { status: "OK", notes: "", photos: [] };
                              return { ...prev, equipment: { ...prev.equipment, [eqKey]: { ...cur, tempF: e.target.value } } };
                            })}
                            placeholder={cold.type === "cooler" ? "38" : "10"} />
                          <span className="tempUnit">{"\u00B0F"}</span>
                        </div>
                        <span className="hint">
                          {val ? (num <= cold.max ? `Meets \u2264${cold.max} F` : `Above ${cold.max} F - flag`) : ""}
                        </span>
                      </label>
                    );
                  })}
                </div>
              </div>

              {locationType === "Concession" ? (
                <GuideSection title="Equipment check"
                  items={[
                    { path: ["equipment", "doubleDoorCooler"], label: "Double-door cooler" },
                    { path: ["equipment", "doubleDoorFreezer"], label: "Double-door freezer" },
                    { path: ["equipment", "walkInCooler"], label: "Walk-in cooler" },
                    { path: ["equipment", "walkInFreezer"], label: "Walk-in freezer" },
                    { path: ["equipment", "prepCooler"], label: "Prep cooler" },
                    { path: ["equipment", "warmers"], label: "Warmers / hot holding" },
                    { path: ["equipment", "ovens"], label: "Ovens" },
                    { path: ["equipment", "threeCompSink"], label: "3-compartment sink" },
                    { path: ["equipment", "ecolab"], label: "Ecolab / chemicals" },
                  ]} inspection={inspection} setInspection={setInspection}
                  allowCustom sectionKey="equipment" coldEquipmentMap={COLD_EQUIPMENT} />
              ) : (
                /* Portable / Subcontractor — no preset equipment, inspector builds the list */
                <GuideSection
                  title={`Equipment check — ${locationType}`}
                  items={[]}
                  inspection={inspection} setInspection={setInspection}
                  allowCustom sectionKey="equipment" coldEquipmentMap={COLD_EQUIPMENT}
                  emptyHint={`This is a ${locationType} location. Add only the equipment that is actually present here — your list will be remembered for next time.`}
                />
              )}

            </div>

            <div className="field">
              <div className="fieldLabelRow">
                <span className="fieldLabel">Raw notes</span>
                <span className="hint">Abbreviations are expanded while preserving meaning</span>
              </div>
              <textarea ref={rawNotesRef} className="textarea" value={rawNotes} onChange={(e) => setRawNotes(e.target.value)} placeholder="Paste quick inspection notes here..." rows={10} />
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
            <div className="outputActions">
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
                  inspectorName={inspectorName} siteName={siteName}
                  siteNumber={siteNumber} sitePhone={sitePhone}
                  supervisorName={supervisorName} locationType={locationType} floor={floor}
                />
                <div className="downloadBar">
                  <span className="downloadLabel">Download:</span>
                  <button className="btn btnDownload" type="button" onClick={onDownloadCsv}>Excel (.xls)</button>
                  <button className="btn btnDownload" type="button" onClick={onDownloadHtml}>Word (.doc)</button>
                  <button className="btn btnDownload" type="button" onClick={onDownloadTxt}>Text (.txt)</button>
                </div>
                {/* ── Inline Supervisor Chat — scoped to this report's ID ── */}
                <InlineChat currentUser={currentUser} sessionId={savedReportId} />
              </>
            )}
          </div>
        </section>
      </main>

      {/* Floating corner buttons */}
      <button className="fab fabLeft" onClick={loadSample} type="button" title="Try Example">&#128221; Try Example</button>
      <button className="fab fabRight" onClick={runAiAssist} type="button" title="AI Tips">&#9889; AI Tips</button>

      {/* Sticky action bar — appears when report is generated */}
      {output && (
        <div className="stickyActionBar">
          <button className="btn stickyBtn stickyBtnView" type="button" onClick={() => {
            const el = document.getElementById("report-output");
            if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
          }}>&#128196; View Report</button>
          <button className="btn stickyBtn stickyBtnEdit" type="button" onClick={() => {
            window.scrollTo({ top: 0, behavior: "smooth" });
          }}>✏️ Edit</button>
          <button className={cx("btn stickyBtn", saved ? "stickyBtnSaved" : "stickyBtnSave")} type="button" onClick={saveToHistory}>
            {saved ? "✅ Saved!" : "💾 Save Report"}
          </button>
          {savedReportId ? (
            <button className="btn stickyBtn stickyBtnHaccp" type="button" onClick={() => setShowHaccpModal(true)} title="Share HACCP temperature log QR with supervisor">
              🌡️ HACCP QR
            </button>
          ) : (
            <button className="btn stickyBtn stickyBtnHaccpOff" type="button" disabled title="Save the report first to generate a location-linked HACCP QR">
              🌡️ HACCP QR
            </button>
          )}
          <button className="btn stickyBtn stickyBtnNew" type="button" onClick={startNewInspection}>+ New</button>
        </div>
      )}

      <footer className="footer">
        <img src={LOGO_WHITE} alt="Sodexo" className="footerLogo" />
        <span>{FIREBASE_ON ? "☁️ Cloud database connected — data syncs across all devices." : "🔒 Data stored locally on this device."}</span>
      </footer>

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
