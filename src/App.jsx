import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import "./App.css";
import { db, isConfigured as FIREBASE_ON } from "./firebase.js";
import {
  collection, doc, getDocs, getDoc, setDoc, deleteDoc, updateDoc, query, orderBy
} from "firebase/firestore";

const BASE = import.meta.env.BASE_URL;
const LOGO_WHITE = `${BASE}sodexo-live-logo.svg`;
const LOGO_DARK = `${BASE}sodexo-dark.svg`;

/* ── AES-256-GCM Encryption (localStorage fallback only) ── */
const SALT_KEY = "sdx_salt";
const USERS_KEY = "sdx_users";
const DATA_KEY = "sdx_inspection_vault";
const DEVICE_SECRET_KEY = "sdx_device_secret";
const LOCK_TIMEOUT_MS = 10 * 60 * 1000; // 10 min inactivity lock

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
  const enc = new TextEncoder();
  const salt = await getSalt();
  const data = new Uint8Array([...salt, ...enc.encode(badge)]);
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

/* ── User Registry ────────────────────────────────────────── */
async function getUsers() {
  if (FIREBASE_ON) {
    try {
      const snap = await getDocs(collection(db, "users"));
      return snap.docs.map(d => d.data());
    } catch { return []; }
  }
  try { return JSON.parse(localStorage.getItem(USERS_KEY) || "[]"); }
  catch { return []; }
}

async function saveUsers(users) {
  if (FIREBASE_ON) {
    try {
      // Write each user as a separate document keyed by badgeHash
      for (const u of users) {
        await setDoc(doc(db, "users", u.badgeHash), u);
      }
    } catch (e) { console.error("Firestore saveUsers error:", e); }
    return;
  }
  localStorage.setItem(USERS_KEY, JSON.stringify(users));
}

async function saveOneUser(user) {
  if (FIREBASE_ON) {
    try { await setDoc(doc(db, "users", user.badgeHash), user); } catch {}
    return;
  }
  const users = await getUsers();
  const idx = users.findIndex(u => u.badgeHash === user.badgeHash);
  if (idx >= 0) users[idx] = user; else users.push(user);
  localStorage.setItem(USERS_KEY, JSON.stringify(users));
}

async function deleteOneUser(badgeHash) {
  if (FIREBASE_ON) {
    try { await deleteDoc(doc(db, "users", badgeHash)); } catch {}
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
    await setDoc(doc(db, "users", h), seedUser);
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
      const snap = await getDocs(collection(db, "inspections"));
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
      for (const rec of records) {
        await setDoc(doc(db, "inspections", rec.id), rec);
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
    try { await setDoc(doc(db, "inspections", record.id), record); } catch {}
    return;
  }
  // localStorage: load all, prepend, save all
  const history = await loadHistory();
  history.unshift(record);
  await saveHistory(history);
}

async function deleteOneInspection(id) {
  if (FIREBASE_ON) {
    try { await deleteDoc(doc(db, "inspections", id)); } catch {}
    return;
  }
  const history = await loadHistory();
  await saveHistory(history.filter(r => r.id !== id));
}

async function clearAllInspections() {
  if (FIREBASE_ON) {
    try {
      const snap = await getDocs(collection(db, "inspections"));
      for (const d of snap.docs) await deleteDoc(d.ref);
    } catch {}
    return;
  }
  await saveHistory([]);
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
    } catch { setError("Something went wrong. Try again."); }
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

  return (
    <div className="pinOverlay">
      <div className="pinCard">
        <img src={LOGO_DARK} alt="Sodexo" className="pinLogo" />

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
          <span className="pinLock">&#128274;</span> AES-256 encrypted &middot; stored only on this device
        </div>
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
      { key: "duration", label: "Duration" },
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
        duration: "25 min",
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

const STATUS_OPTIONS = ["OK", "Not Clean", "Needs Attention", "N/A"];
const PHOTO_LIMIT = 6;
const PHOTO_MAX_MB = 8;

const INSPECTION_TYPES = ["Event Day", "Post Event", "Regular Inspection"];
const FLOOR_OPTIONS = ["Floor 1", "Floor 2", "Floor 3"];

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
      doubleDoorCooler: withPhotos({ status: "OK", notes: "" }),
      doubleDoorFreezer: withPhotos({ status: "OK", notes: "" }),
      walkInCooler: withPhotos({ status: "OK", notes: "" }),
      warmers: withPhotos({ status: "OK", notes: "" }),
      ovens: withPhotos({ status: "OK", notes: "" }),
      threeCompSink: withPhotos({ status: "OK", notes: "" }),
      ecolab: withPhotos({ status: "OK", notes: "" }),
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
    ["equipment", "warmers", "Equipment > Warmers / hot holding"],
    ["equipment", "ovens", "Equipment > Ovens"],
    ["equipment", "threeCompSink", "Equipment > 3-compartment sink"],
    ["equipment", "ecolab", "Equipment > Ecolab / chemicals"],
  ];
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
      index.push({ num: n, label, caption });
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
  pushIfBad("equipment.warmers", "Warmers / hot holding", inspection?.equipment?.warmers);
  pushIfBad("equipment.ovens", "Ovens", inspection?.equipment?.ovens);
  pushIfBad("equipment.threeCompSink", "3-compartment sink", inspection?.equipment?.threeCompSink);
  pushIfBad("equipment.ecolab", "Ecolab / chemicals", inspection?.equipment?.ecolab);
  const hand = Number(inspection?.temps?.handSinkTempF);
  if (!Number.isNaN(hand) && hand && hand < 95)
    items.push({ issue: `Hand sink temperature below minimum: ${hand}°F (min 95°F)`, owner: "", due: "", priority: "High", photos: [] });
  const three = Number(inspection?.temps?.threeCompSinkTempF);
  if (!Number.isNaN(three) && three && three < 110)
    items.push({ issue: `3-compartment sink wash temperature below minimum: ${three}°F (min 110°F)`, owner: "", due: "", priority: "High", photos: [] });
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
  checkNode("Warmers", inspection?.equipment?.warmers);
  checkNode("Ovens", inspection?.equipment?.ovens);
  checkNode("3-compartment sink", inspection?.equipment?.threeCompSink);
  checkNode("Ecolab / chemicals", inspection?.equipment?.ecolab);

  // Temperature checks
  const hs = Number(inspection?.temps?.handSinkTempF);
  const ts = Number(inspection?.temps?.threeCompSinkTempF);
  if (hs && hs < 95) tips.push(`Hand sink temp is ${hs}°F (below 95°F min). Flag for immediate maintenance.`);
  if (ts && ts < 110) tips.push(`3-comp sink wash temp is ${ts}°F (below 110°F min). Check water heater.`);
  if (hs && hs >= 95 && hs < 100) tips.push(`Hand sink temp is ${hs}°F — passes but is close to the 95°F minimum. Monitor.`);
  if (ts && ts >= 110 && ts < 115) tips.push(`3-comp wash temp is ${ts}°F — passes but is close to the 110°F minimum. Monitor.`);

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

/* ── Rendered Output Component (visual, not code) ────────── */
function RenderedOutput({ noteType, useCase, context, inspection, rawNotes, inspectionType, inspectionDate, inspectorName, siteName, siteNumber, sitePhone, supervisorName, floor }) {
  const status = calcOverallStatus(inspection);
  const actionItems = buildActionItems({ inspection, rawNotes });
  const expandedNotes = expandAbbreviations(rawNotes);
  const location = siteName || context?.kitchen || "Kitchen";
  const date = inspectionDate || context?.date || new Date().toLocaleDateString();
  const playbook = INSPECTION_PLAYBOOK[inspectionType] || INSPECTION_PLAYBOOK["Regular Inspection"];
  const { index: photoIndexList } = buildPhotoIndex(inspection);

  const handT = Number(inspection?.temps?.handSinkTempF);
  const threeT = Number(inspection?.temps?.threeCompSinkTempF);

  const allItems = [
    { section: "Facility", label: "Ceiling", node: inspection?.facility?.ceiling },
    { section: "Facility", label: "Walls", node: inspection?.facility?.walls },
    { section: "Facility", label: "Floors", node: inspection?.facility?.floors },
    { section: "Facility", label: "Lighting", node: inspection?.facility?.lighting },
    { section: "Operations", label: "Employee Practices", node: inspection?.operations?.employeePractices },
    { section: "Operations", label: "Handwashing / Supplies", node: inspection?.operations?.handwashing },
    { section: "Operations", label: "Labeling / Dating", node: inspection?.operations?.labelingDating },
    { section: "Operations", label: "Logs / Documentation", node: inspection?.operations?.logs },
    { section: "Equipment", label: "Double-Door Cooler", node: inspection?.equipment?.doubleDoorCooler },
    { section: "Equipment", label: "Double-Door Freezer", node: inspection?.equipment?.doubleDoorFreezer },
    { section: "Equipment", label: "Walk-In Cooler", node: inspection?.equipment?.walkInCooler },
    { section: "Equipment", label: "Warmers / Hot Holding", node: inspection?.equipment?.warmers },
    { section: "Equipment", label: "Ovens", node: inspection?.equipment?.ovens },
    { section: "Equipment", label: "3-Compartment Sink", node: inspection?.equipment?.threeCompSink },
    { section: "Equipment", label: "Ecolab / Chemicals", node: inspection?.equipment?.ecolab },
  ];

  const findings = allItems.filter(it => it.node?.status && it.node.status !== "OK" && it.node.status !== "N/A");
  if (handT && handT < 95) findings.push({ section: "Temperature", label: "Hand Sink", node: { status: "Not Clean", notes: `${handT}\u00B0F (below 95\u00B0F minimum)` } });
  if (threeT && threeT < 110) findings.push({ section: "Temperature", label: "3-Comp Wash", node: { status: "Not Clean", notes: `${threeT}\u00B0F (below 110\u00B0F minimum)` } });

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

      {/* Photo Index */}
      {photoIndexList.length > 0 && (
        <div className="rptBlock">
          <div className="rptBlockTitle">Photo Index</div>
          <div className="rptPhotoList">
            {photoIndexList.map(p => (
              <div className="rptPhotoItem" key={p.num}>
                <span className="rptPhotoNum">Photo #{p.num}</span>
                <span>{p.label}{p.caption ? ` \u2014 ${p.caption}` : ""}</span>
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
  add("Equipment", "Warmers / hot holding", inspection?.equipment?.warmers);
  add("Equipment", "Ovens", inspection?.equipment?.ovens);
  add("Equipment", "3-compartment sink", inspection?.equipment?.threeCompSink);
  add("Equipment", "Ecolab / chemicals", inspection?.equipment?.ecolab);
  rows.push(["Temps", "Hand sink (F)", inspection?.temps?.handSinkTempF || "", Number(inspection?.temps?.handSinkTempF) >= 95 ? "Pass" : "Below min", ""]);
  rows.push(["Temps", "3-comp wash (F)", inspection?.temps?.threeCompSinkTempF || "", Number(inspection?.temps?.threeCompSinkTempF) >= 110 ? "Pass" : "Below min", ""]);
  return rows;
}

function exportAsCsv({ inspection, rawNotes, inspectionType, inspectionDate, inspectorName, siteName, siteNumber, supervisorName, floor }) {
  const dataRows = buildCsvRows({ inspection, rawNotes, inspectionType, inspectionDate, inspectorName, siteName, siteNumber, supervisorName });
  const status = calcOverallStatus(inspection);
  const actionItems = buildActionItems({ inspection, rawNotes });

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
</table></body></html>`;

  const blob = new Blob([html], { type: "application/vnd.ms-excel" });
  const filename = `inspection_${inspectionDate || "undated"}_${(siteName || "site").replace(/\s+/g, "_")}.xls`;
  downloadBlob(blob, filename);
}

function exportAsHtml({ output, inspection, rawNotes, inspectionType, inspectionDate, siteName, siteNumber, sitePhone, inspectorName, supervisorName }) {
  const status = calcOverallStatus(inspection);
  const actionItems = buildActionItems({ inspection, rawNotes });
  const expandedNotes = expandAbbreviations(rawNotes);

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
    ["Equipment", "Warmers / Hot Holding", inspection?.equipment?.warmers],
    ["Equipment", "Ovens", inspection?.equipment?.ovens],
    ["Equipment", "3-Compartment Sink", inspection?.equipment?.threeCompSink],
    ["Equipment", "Ecolab / Chemicals", inspection?.equipment?.ecolab],
  ];
  const findings = allItems.filter(([,,node]) => node?.status && node.status !== "OK" && node.status !== "N/A");
  const handT = Number(inspection?.temps?.handSinkTempF);
  const threeT = Number(inspection?.temps?.threeCompSinkTempF);

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
  <tr><td class="info-label">Overall Status</td><td colspan="3" class="${status === "Pass" ? "status-pass" : "status-fail"}">${status === "Pass" ? "PASSED" : "NEEDS ATTENTION"}</td></tr>
</table>

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

  // Group by location+floor, sorted by date
  const locationData = useMemo(() => {
    const map = {};
    for (const rec of history) {
      const key = `${rec.siteName || rec.location || "Unknown"}${rec.floor ? ` - ${rec.floor}` : ""}`;
      const unitNum = rec.siteNumber || "";
      if (!map[key]) map[key] = { points: [], unitNum };
      const hand = Number(rec.temps?.handSinkTempF);
      const three = Number(rec.temps?.threeCompSinkTempF);
      if (hand || three) {
        map[key].points.push({
          date: rec.inspectionDate || rec.savedAt?.slice(0, 10) || "—",
          handSink: hand || null,
          threeComp: three || null,
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
            const allTemps = points.flatMap(p => [p.handSink, p.threeComp]).filter(Boolean);
            if (allTemps.length === 0) return null;
            const minT = Math.min(...allTemps, 90) - 5;
            const maxT = Math.max(...allTemps, 115) + 5;
            const rangeT = maxT - minT || 1;
            const xStep = points.length > 1 ? (W - PAD - PADR) / (points.length - 1) : (W - PAD - PADR) / 2;
            const xOff = points.length === 1 ? (W - PAD - PADR) / 2 : 0;

            const toX = (i) => PAD + xOff + i * xStep;
            const toY = (t) => PADT + (H - PADT - PADB) * (1 - (t - minT) / rangeT);

            // Build smooth path points
            const handCoords = points.map((p, i) => p.handSink ? [toX(i), toY(p.handSink)] : null).filter(Boolean);
            const threeCoords = points.map((p, i) => p.threeComp ? [toX(i), toY(p.threeComp)] : null).filter(Boolean);
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

            return (
              <div key={loc} className="tempChartItem">
                <div className="tempChartHeader">
                  <div className="tempChartLabel">{loc}</div>
                  {unitNum && <span className="tempChartUnit">#{unitNum}</span>}
                </div>
                <div className="tempChartAvgs">
                  {handAvg !== null && <span className="tempAvgPill" style={{ background: handAvg >= 95 ? "#dbeafe" : "#fee2e2", color: handAvg >= 95 ? "#1d4ed8" : "#dc2626" }}>Avg Hand: {handAvg}°F</span>}
                  {threeAvg !== null && <span className="tempAvgPill" style={{ background: threeAvg >= 110 ? "#ede9fe" : "#fee2e2", color: threeAvg >= 110 ? "#7c3aed" : "#dc2626" }}>Avg 3-Comp: {threeAvg}°F</span>}
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
                  </defs>

                  {/* Grid lines */}
                  {gridSteps.map(t => (
                    <g key={t}>
                      <line x1={PAD} y1={toY(t)} x2={W - PADR} y2={toY(t)} stroke="#e5e7eb" strokeWidth="1" />
                      <text x={PAD - 6} y={toY(t) + 4} textAnchor="end" fontSize="9" fill="#9ca3af">{t}°</text>
                    </g>
                  ))}

                  {/* Threshold lines */}
                  {[95, 110].map(threshold => {
                    if (threshold < minT || threshold > maxT) return null;
                    const y = toY(threshold);
                    return (
                      <g key={threshold}>
                        <line x1={PAD} y1={y} x2={W - PADR} y2={y} stroke={threshold === 95 ? "#3b82f6" : "#8b5cf6"} strokeDasharray="6,4" strokeWidth="1.5" opacity="0.6" />
                        <rect x={W - PADR + 2} y={y - 8} width="36" height="16" rx="3" fill={threshold === 95 ? "#3b82f6" : "#8b5cf6"} opacity="0.9" />
                        <text x={W - PADR + 20} y={y + 4} textAnchor="middle" fontSize="8" fill="white" fontWeight="bold">{threshold}°F</text>
                      </g>
                    );
                  })}

                  {/* Area fills */}
                  {handCoords.length >= 2 && <path d={toAreaPath(handCoords)} fill={`url(#handGrad-${loc.replace(/\W/g, "")})`} />}
                  {threeCoords.length >= 2 && <path d={toAreaPath(threeCoords)} fill={`url(#threeGrad-${loc.replace(/\W/g, "")})`} />}

                  {/* Lines */}
                  {handCoords.length > 1 && <path d={toPath(handCoords)} fill="none" stroke="#3b82f6" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />}
                  {threeCoords.length > 1 && <path d={toPath(threeCoords)} fill="none" stroke="#8b5cf6" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />}

                  {/* Data points with hover */}
                  {points.map((p, i) => {
                    const hk = `${loc}-${i}`;
                    return (
                      <g key={i} onMouseEnter={() => setHoveredPoint(hk)} onTouchStart={() => setHoveredPoint(hk)}>
                        {p.handSink && (
                          <>
                            <circle cx={toX(i)} cy={toY(p.handSink)} r="5" fill="white" stroke={p.handSink >= 95 ? "#3b82f6" : "#ef4444"} strokeWidth="2.5" />
                            {hoveredPoint === hk && (
                              <g>
                                <rect x={toX(i) - 30} y={toY(p.handSink) - 26} width="60" height="20" rx="4" fill="#1e293b" opacity="0.9" />
                                <text x={toX(i)} y={toY(p.handSink) - 12} textAnchor="middle" fontSize="10" fill="white" fontWeight="bold">{p.handSink}°F</text>
                              </g>
                            )}
                          </>
                        )}
                        {p.threeComp && (
                          <>
                            <circle cx={toX(i)} cy={toY(p.threeComp)} r="5" fill="white" stroke={p.threeComp >= 110 ? "#8b5cf6" : "#ef4444"} strokeWidth="2.5" />
                            {hoveredPoint === hk && (
                              <g>
                                <rect x={toX(i) - 30} y={toY(p.threeComp) - 26} width="60" height="20" rx="4" fill="#1e293b" opacity="0.9" />
                                <text x={toX(i)} y={toY(p.threeComp) - 12} textAnchor="middle" fontSize="10" fill="white" fontWeight="bold">{p.threeComp}°F</text>
                              </g>
                            )}
                          </>
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
                  <span className="tempLegendItem"><span className="tempLegendDot" style={{ background: "#ef4444" }} /> Below min</span>
                </div>
              </div>
            );
          })}
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

/* ── History Page Component ──────────────────────────────── */
function HistoryPage({ onBack }) {
  const [history, setHistory] = useState([]);
  const [filterDate, setFilterDate] = useState("");
  const [filterType, setFilterType] = useState("");
  const [filterFloor, setFilterFloor] = useState("");
  const [filterIssue, setFilterIssue] = useState("");
  const [filterSite, setFilterSite] = useState("");
  const [expandedId, setExpandedId] = useState(null);
  const [historyLoaded, setHistoryLoaded] = useState(false);
  const [historyTab, setHistoryTab] = useState("reports"); // "reports" | "analytics"

  useEffect(() => {
    loadHistory().then(h => { setHistory(h); setHistoryLoaded(true); });
  }, []);

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
  }, [history, filterDate, filterType, filterFloor, filterSite, filterIssue]);

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

  const uniqueDates = [...new Set(history.map(r => r.inspectionDate).filter(Boolean))].sort().reverse();
  const uniqueTypes = [...new Set(history.map(r => r.inspectionType).filter(Boolean))].sort();
  const uniqueFloors = [...new Set(history.map(r => r.floor).filter(Boolean))].sort();

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
          {history.length > 0 && (
            <button className="btn btnGhost" onClick={clearAll} type="button" style={{color: "#EE0000", borderColor: "#EE0000"}}>Clear All</button>
          )}
        </div>
      </header>
      <div className="topBarSpacer" />

      <main className="pageMain pageMainWide">
        {/* Filters */}
        <div className="card" style={{ marginBottom: 24 }}>
          <div className="cardHeader">
            <div className="cardTitle">Filters</div>
            {(filterDate || filterType || filterFloor || filterSite || filterIssue) && (
              <button className="btn btnGhost btnSmall" type="button" onClick={() => { setFilterDate(""); setFilterType(""); setFilterFloor(""); setFilterSite(""); setFilterIssue(""); }}>
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
            <button className={cx("historyTab", historyTab === "analytics" && "historyTabActive")} onClick={() => setHistoryTab("analytics")} type="button">
              Analytics
            </button>
          </div>
        )}

        {/* Analytics Tab */}
        {historyTab === "analytics" && history.length >= 2 && (
          <>
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
                          {rec.floor && <>{" "}&middot; <span className="typeBadge typeBadgeFloor">{rec.floor}</span></>}
                          {" "}&middot; {rec.inspectorName || "—"}
                        </div>
                      </div>
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                      {issues.length > 0 && <span className="pill">{issues.length} issue{issues.length !== 1 ? "s" : ""}</span>}
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

                      <div style={{ marginTop: 16, display: "flex", gap: 8 }}>
                        <button className="btn btnGhost btnSmall" type="button" onClick={() => {
                          exportAsTxt({ output: rec.output || rec.rawNotes || "", inspectionDate: rec.inspectionDate, siteName: rec.siteName });
                        }}>Download TXT</button>
                        <button className="btn btnGhost btnSmall" type="button" onClick={() => {
                          exportAsHtml({ output: rec.output || rec.rawNotes || "", inspectionType: rec.inspectionType, inspectionDate: rec.inspectionDate, siteName: rec.siteName, inspectorName: rec.inspectorName });
                        }}>Download HTML</button>
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

  // Load users on mount
  useEffect(() => { getUsers().then(setUsers); }, []);

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
                    <div className="adminUserName">{u.name}</div>
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

function GuideSection({ title, items, inspection, setInspection }) {
  const fileRefs = useRef({});

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

  return (
    <div className="guideSection">
      <div className="guideSectionTitle">{title}</div>
      <div className="guideItems">
        {items.map((it) => {
          const key = it.path.join(".");
          const current = getAtPath(inspection, it.path) || withPhotos({ status: "OK", notes: "" });
          return (
            <div className="guideItem" key={key}>
              <div className="guideItemHead">
                <div className="guideLabel">{it.label}</div>
                <select className="select selectSmall" value={current.status}
                  onChange={(e) => setInspection((prev) => setAtPath(prev, it.path, { ...current, status: e.target.value }))}>
                  {STATUS_OPTIONS.map((s) => (<option key={s} value={s}>{s}</option>))}
                </select>
              </div>
              <input className="input inputSmall" value={current.notes}
                onChange={(e) => setInspection((prev) => setAtPath(prev, it.path, { ...current, notes: e.target.value }))}
                placeholder="Issue / observation (optional)" />
              <div className="photoRow">
                <input ref={(el) => (fileRefs.current[key] = el)} className="fileInput" type="file" accept="image/*" capture="environment" multiple
                  onChange={(e) => { addPhotos(key, e.target.files); e.target.value = ""; }} />
                <button className="btn btnGhost btnSmall photoBtn" type="button" onClick={() => fileRefs.current[key]?.click()}>
                  &#128247; Add photos
                </button>
                <span className="hint">Up to {PHOTO_LIMIT} ({PHOTO_MAX_MB}MB each)</span>
              </div>
              <PhotoStrip photos={current.photos} onRemove={(id) => removePhoto(key, id)} />
            </div>
          );
        })}
      </div>
      <div className="guideNote">Photos are stored locally for preview. For production: upload images and store URLs.</div>
    </div>
  );
}

export default function App() {
  const [locked, setLocked] = useState(true);
  const [currentUser, setCurrentUser] = useState(null);
  const [page, setPage] = useState("inspector"); // "inspector" | "history" | "admin"
  const lastActivity = useRef(Date.now());

  // Dismiss splash screen once React mounts
  useEffect(() => {
    const splash = document.getElementById("splash");
    if (splash) {
      splash.classList.add("hide");
      setTimeout(() => splash.remove(), 350);
    }
  }, []);

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
  const [floor, setFloor] = useState("Floor 1");

  const [menuOpen, setMenuOpen] = useState(false);

  const [output, setOutput] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [warnings, setWarnings] = useState([]);
  const [aiTips, setAiTips] = useState([]);
  const [saved, setSaved] = useState(false);

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

  if (locked) return <BadgeScreen onUnlock={(user) => { setCurrentUser(user); setLocked(false); resetActivity(); if (user?.name && !inspectorName) setInspectorName(user.name); }} />;
  if (page === "history") return <HistoryPage onBack={() => setPage("inspector")} />;
  if (page === "admin") return <AdminPanel currentUser={currentUser} onBack={() => setPage("inspector")} />;

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
    setInspectionType("Regular Inspection");
    setInspectionDate(new Date().toISOString().slice(0, 10));
    setInspectorName(currentUser?.name || "");
    setSiteName("");
    setSiteNumber("");
    setSupervisorName("");
    setSitePhone("");
    setFloor("Floor 1");
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
      id: `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      savedAt: new Date().toISOString(),
      noteType, inspectionType, inspectionDate, inspectorName,
      siteName, siteNumber, supervisorName, sitePhone, floor,
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
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
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
      <header className="topBar">
        <div className="brandLeft brandClickable" onClick={() => { setPage("inspector"); window.scrollTo({ top: 0, behavior: "smooth" }); }} title="Home">
          <img src={LOGO_WHITE} alt="Sodexo" className="brandLogo" />
          <div>
            <div className="brandTitle">Kitchen Inspection</div>
            <div className="brandSub">Turn sit-down inspection notes into organized documents</div>
          </div>
        </div>

        {/* Header actions: Generate + Hamburger */}
        <div className="topActionsHamburger">
          <button className={cx("btn", "btnPrimary", "btnGenHeader")} onClick={onTransform} type="button" disabled={loading}>
            {loading ? "Generating..." : "Generate Report"}
          </button>
          <button className="hamburgerBtn" onClick={() => setMenuOpen(!menuOpen)} type="button" aria-label="Menu">
            <span className={cx("hamburgerIcon", menuOpen && "hamburgerOpen")}>
              <span /><span /><span />
            </span>
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
              <button className="dropdownMenuItem" onClick={() => setPage("admin")} type="button">Admin Panel</button>
            )}
            <button className="dropdownMenuItem dropdownMenuDanger" onClick={() => { lockApp(); setCurrentUser(null); setLocked(true); }} type="button">Lock App</button>
          </div>
        )}
      </header>
      <div className="topBarSpacer" />

      <main className="grid">
        {/* LEFT */}
        <section className="card">
          <div className="cardHeader">
            <div className="cardTitle">Inspection Details</div>
          </div>

          <div className="cardBody">
            <div className="fieldGrid">
              <label className="field">
                <span className="fieldLabel">Inspection Type</span>
                <select className="select" value={inspectionType} onChange={(e) => setInspectionType(e.target.value)}>
                  {INSPECTION_TYPES.map((t) => (<option key={t} value={t}>{t}</option>))}
                </select>
              </label>
              <label className="field" id="field-inspectionDate">
                <span className="fieldLabel">Inspection Date</span>
                <input className="input" type="date" value={inspectionDate} onChange={(e) => setInspectionDate(e.target.value)} />
              </label>
              <label className="field" id="field-inspectorName">
                <span className="fieldLabel">Inspector Name</span>
                <input className="input" value={inspectorName} onChange={(e) => setInspectorName(e.target.value)} placeholder="e.g., J. Da Silva" />
              </label>
              <label className="field" id="field-supervisorName">
                <span className="fieldLabel">Supervisor Name</span>
                <input className="input" value={supervisorName} onChange={(e) => setSupervisorName(e.target.value)} placeholder="e.g., GM / Chef Lead" />
              </label>
              <label className="field" id="field-siteName">
                <span className="fieldLabel">Restaurant / Local Name</span>
                <input className="input" value={siteName} onChange={(e) => setSiteName(e.target.value)} placeholder="e.g., North Stand Kitchen" />
              </label>
              <label className="field" id="field-siteNumber">
                <span className="fieldLabel">Location / Unit Number</span>
                <input className="input" value={siteNumber} onChange={(e) => setSiteNumber(e.target.value)} placeholder="e.g., Unit 12 / Loc-204" />
              </label>
              <label className="field">
                <span className="fieldLabel">Location Phone (optional)</span>
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
                  <input className="input" value={context[f.key] ?? ""} onChange={(e) => setContext((c) => ({ ...c, [f.key]: e.target.value }))} placeholder={f.label} />
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
                </div>
              </div>

              <GuideSection title="Facility: ceiling, walls, floors, lighting"
                items={[
                  { path: ["facility", "ceiling"], label: "Ceiling" },
                  { path: ["facility", "walls"], label: "Walls" },
                  { path: ["facility", "floors"], label: "Floors" },
                  { path: ["facility", "lighting"], label: "Lighting" },
                ]} inspection={inspection} setInspection={setInspection} />

              <GuideSection title="Operations: employees + process controls"
                items={[
                  { path: ["operations", "employeePractices"], label: "Employee practices" },
                  { path: ["operations", "handwashing"], label: "Handwashing / supplies" },
                  { path: ["operations", "labelingDating"], label: "Labeling / dating" },
                  { path: ["operations", "logs"], label: "Logs / documentation" },
                ]} inspection={inspection} setInspection={setInspection} />

              <div className="tempsRow">
                <div className="tempsTitle">Key temperatures</div>
                <div className="tempsGrid">
                  <label className="field" id="field-handSinkTempF" style={{ marginTop: 0 }}>
                    <span className="fieldLabel">Hand sink temp (F)</span>
                    <input className="input" inputMode="numeric" value={inspection.temps.handSinkTempF}
                      onChange={(e) => setInspection((prev) => ({ ...prev, temps: { ...prev.temps, handSinkTempF: e.target.value } }))}
                      placeholder="e.g., 97" />
                    <span className="hint">
                      {Number(inspection.temps.handSinkTempF) >= 95 ? "Meets >=95 F" : inspection.temps.handSinkTempF ? "Below 95 F - flag" : ""}
                    </span>
                  </label>
                  <label className="field" id="field-threeCompSinkTempF" style={{ marginTop: 0 }}>
                    <span className="fieldLabel">3-comp wash temp (F)</span>
                    <input className="input" inputMode="numeric" value={inspection.temps.threeCompSinkTempF}
                      onChange={(e) => setInspection((prev) => ({ ...prev, temps: { ...prev.temps, threeCompSinkTempF: e.target.value } }))}
                      placeholder="e.g., 112" />
                    <span className="hint">
                      {Number(inspection.temps.threeCompSinkTempF) >= 110 ? "Meets >=110 F" : inspection.temps.threeCompSinkTempF ? "Below 110 F - flag" : ""}
                    </span>
                  </label>
                </div>
              </div>

              <GuideSection title="Equipment check"
                items={[
                  { path: ["equipment", "doubleDoorCooler"], label: "Double-door cooler" },
                  { path: ["equipment", "doubleDoorFreezer"], label: "Double-door freezer" },
                  { path: ["equipment", "walkInCooler"], label: "Walk-in cooler" },
                  { path: ["equipment", "warmers"], label: "Warmers / hot holding" },
                  { path: ["equipment", "ovens"], label: "Ovens" },
                  { path: ["equipment", "threeCompSink"], label: "3-compartment sink" },
                  { path: ["equipment", "ecolab"], label: "Ecolab / chemicals" },
                ]} inspection={inspection} setInspection={setInspection} />
            </div>

            <div className="field">
              <div className="fieldLabelRow">
                <span className="fieldLabel">Raw notes</span>
                <span className="hint">Abbreviations are expanded while preserving meaning</span>
              </div>
              <textarea className="textarea" value={rawNotes} onChange={(e) => setRawNotes(e.target.value)} placeholder="Paste quick inspection notes here..." rows={10} />
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
                  supervisorName={supervisorName} floor={floor}
                />
                <div className="downloadBar">
                  <span className="downloadLabel">Download:</span>
                  <button className="btn btnDownload" type="button" onClick={onDownloadCsv}>Excel (.xls)</button>
                  <button className="btn btnDownload" type="button" onClick={onDownloadHtml}>Word (.doc)</button>
                  <button className="btn btnDownload" type="button" onClick={onDownloadTxt}>Text (.txt)</button>
                </div>
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
          <button className={cx("btn stickyBtn", saved ? "stickyBtnSaved" : "stickyBtnSave")} type="button" onClick={saveToHistory}>
            {saved ? "\u2705 Saved!" : "&#128190; Save Report"}
          </button>
          <button className="btn stickyBtn stickyBtnNew" type="button" onClick={startNewInspection}>+ New</button>
        </div>
      )}

      <footer className="footer">
        <img src={LOGO_WHITE} alt="Sodexo" className="footerLogo" />
        <span>{FIREBASE_ON ? "\u2601\uFE0F Cloud database connected \u2014 data syncs across all devices." : "\U0001F512 Data stored locally on this device."}</span>
      </footer>
    </div>
  );
}
