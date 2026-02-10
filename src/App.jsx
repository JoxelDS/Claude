import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import "./App.css";

/* ── AES-256-GCM Encryption (Web Crypto API) ────────────── */
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

/* ── Device-level master encryption key ───────────────────── */
async function getMasterKey() {
  let secret = localStorage.getItem(DEVICE_SECRET_KEY);
  if (!secret) {
    const bytes = crypto.getRandomValues(new Uint8Array(32));
    secret = Array.from(bytes).map(b => b.toString(16).padStart(2, "0")).join("");
    localStorage.setItem(DEVICE_SECRET_KEY, secret);
  }
  return deriveKey("sdx_master_" + secret);
}

/* ── User Registry ────────────────────────────────────────── */
function getUsers() {
  try { return JSON.parse(localStorage.getItem(USERS_KEY) || "[]"); }
  catch { return []; }
}

function saveUsers(users) {
  localStorage.setItem(USERS_KEY, JSON.stringify(users));
}

async function ensureSeedAdmin() {
  const users = getUsers();
  if (users.length > 0) return;
  const h = await hashBadge(SEED_ADMIN.badge);
  saveUsers([{
    badgeHash: h, name: SEED_ADMIN.name,
    department: SEED_ADMIN.department, role: "admin",
    approved: true, registeredAt: new Date().toISOString()
  }]);
}

/* ── Secure Storage helpers ──────────────────────────────── */
let _cryptoKey = null;
let _currentUser = null;

async function loadHistory() {
  if (!_cryptoKey) return [];
  const stored = localStorage.getItem(DATA_KEY);
  return decryptData(stored, _cryptoKey);
}

async function saveHistory(records) {
  if (!_cryptoKey) return;
  const encrypted = await encryptData(records, _cryptoKey);
  localStorage.setItem(DATA_KEY, encrypted);
}

/* ── Auth functions ───────────────────────────────────────── */
async function signIn(badge) {
  await ensureSeedAdmin();
  const h = await hashBadge(badge);
  const users = getUsers();
  const user = users.find(u => u.badgeHash === h);
  if (!user) return { ok: false, reason: "not_found" };
  if (!user.approved) return { ok: false, reason: "pending" };
  _cryptoKey = await getMasterKey();
  _currentUser = { ...user };
  return { ok: true, user: _currentUser };
}

async function registerNewUser(badge, name, department) {
  const h = await hashBadge(badge);
  const users = getUsers();
  if (users.find(u => u.badgeHash === h)) return { ok: false, reason: "exists" };
  users.push({
    badgeHash: h, name, department,
    role: "inspector", approved: false,
    registeredAt: new Date().toISOString()
  });
  saveUsers(users);
  return { ok: true };
}

function lockApp() {
  _cryptoKey = null;
  _currentUser = null;
}

function getCurrentUser() { return _currentUser; }

/* ── Admin helpers ────────────────────────────────────────── */
function approveUser(badgeHash) {
  const users = getUsers();
  const u = users.find(x => x.badgeHash === badgeHash);
  if (u) { u.approved = true; saveUsers(users); }
}

function denyUser(badgeHash) {
  saveUsers(getUsers().filter(u => u.badgeHash !== badgeHash));
}

function promoteToAdmin(badgeHash) {
  const users = getUsers();
  const u = users.find(x => x.badgeHash === badgeHash);
  if (u) { u.role = "admin"; saveUsers(users); }
}

function demoteToInspector(badgeHash) {
  const users = getUsers();
  const u = users.find(x => x.badgeHash === badgeHash);
  if (u) { u.role = "inspector"; saveUsers(users); }
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
        <img src="/sodexo-dark.svg" alt="Sodexo" className="pinLogo" />

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
  interview: {
    label: "Interview Notes",
    contextFields: [
      { key: "position", label: "Position" },
      { key: "interviewer", label: "Interviewer" },
      { key: "date", label: "Date" },
      { key: "duration", label: "Duration" },
    ],
    useCases: ["Evaluation Scorecard", "Slack Update", "Email Summary"],
    sample: {
      meta: {
        inspectionType: "Regular Inspection",
        inspectionDate: "2026-02-09",
        inspectorName: "J. Da Silva",
      },
      context: {
        position: "Kitchen Manager (Venue A)",
        interviewer: "J. Da Silva",
        date: "2026-02-09",
        duration: "35 min",
      },
      inspection: {
        facility: {
          ceiling: { status: "Needs Attention", notes: "Dust near vents over prep.", photos: [] },
          walls: { status: "OK", notes: "", photos: [] },
          floors: { status: "Needs Attention", notes: "Wet by walk-in; add wet-floor sign.", photos: [] },
          lighting: { status: "Needs Attention", notes: "Bulb out over dish station.", photos: [] },
        },
        operations: {
          employeePractices: { status: "Needs Attention", notes: "New staff needs allergen + glove-change coaching.", photos: [] },
          handwashing: { status: "OK", notes: "Soap low at one hand sink.", photos: [] },
          labelingDating: { status: "OK", notes: "", photos: [] },
          logs: { status: "Needs Attention", notes: "HACCP docs questions; verify log completeness.", photos: [] },
        },
        temps: { handSinkTempF: 98, threeCompSinkTempF: 112 },
        equipment: {
          doubleDoorCooler: { status: "OK", notes: "38°F", photos: [] },
          doubleDoorFreezer: { status: "OK", notes: "-2°F", photos: [] },
          walkInCooler: { status: "OK", notes: "", photos: [] },
          warmers: { status: "OK", notes: "Hot hold 150°F", photos: [] },
          ovens: { status: "OK", notes: "", photos: [] },
          threeCompSink: { status: "Needs Attention", notes: "Verify wash temp ≥110°F consistently.", photos: [] },
          ecolab: { status: "OK", notes: "Sanitizer 150 ppm", photos: [] },
        },
      },
      rawNotes:
        "met w/ KM. walked line. temps ok. q on HACCP docs. 2x hand sink low soap. dish area: sanitizer 150ppm (good). floor by walk-in wet. staff: 1 new, needs allergen training. action: order soap, replace bulb, add wet floor sign, retrain on glove change. next chk 1wk.",
    },
  },
  meeting: {
    label: "Meeting Notes",
    contextFields: [
      { key: "kitchen", label: "Kitchen / Location" },
      { key: "participants", label: "Participants" },
      { key: "date", label: "Date" },
      { key: "duration", label: "Duration" },
    ],
    useCases: ["Google Doc", "Slack Update", "Email Summary"],
    sample: {
      meta: {
        inspectionType: "Event Day",
        inspectionDate: "2026-02-09",
        inspectorName: "J. Da Silva",
      },
      context: {
        kitchen: "Concourse Kitchen — North Stand",
        participants: "Chef Lead, Sanitation Lead, Ops Manager",
        date: "2026-02-09",
        duration: "25 min",
      },
      inspection: {
        facility: {
          ceiling: { status: "OK", notes: "", photos: [] },
          walls: { status: "OK", notes: "", photos: [] },
          floors: { status: "Needs Attention", notes: "Slip hazard near mop sink.", photos: [] },
          lighting: { status: "OK", notes: "", photos: [] },
        },
        operations: {
          employeePractices: { status: "Needs Attention", notes: "Coaching on hot holding.", photos: [] },
          handwashing: { status: "OK", notes: "", photos: [] },
          labelingDating: { status: "Needs Attention", notes: "A few unlabeled containers.", photos: [] },
          logs: { status: "Needs Attention", notes: "Chemical logs missing 2/7.", photos: [] },
        },
        temps: { handSinkTempF: 96, threeCompSinkTempF: 110 },
        equipment: {
          doubleDoorCooler: { status: "OK", notes: "38°F", photos: [] },
          doubleDoorFreezer: { status: "OK", notes: "", photos: [] },
          walkInCooler: { status: "OK", notes: "", photos: [] },
          warmers: { status: "Needs Attention", notes: "Hot hold 142°F (borderline).", photos: [] },
          ovens: { status: "OK", notes: "", photos: [] },
          threeCompSink: { status: "OK", notes: "", photos: [] },
          ecolab: { status: "OK", notes: "", photos: [] },
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
  if (!inspectionDate) warnings.push("Inspection Date is missing");
  if (!inspectorName) warnings.push("Inspector Name is missing");

  const ctxFields = NOTE_TYPES[noteType].contextFields;
  for (const f of ctxFields) {
    if (!context[f.key]?.trim()) warnings.push(`${f.label} is missing`);
  }

  if (!inspection.temps.handSinkTempF) warnings.push("Hand sink temperature not recorded");
  if (!inspection.temps.threeCompSinkTempF) warnings.push("3-comp sink temperature not recorded");

  return warnings;
}

function buildSubject({ noteType, context, inspection, inspectionType, inspectionDate, siteName, siteNumber }) {
  const status = calcOverallStatus(inspection);
  const baseLocation = siteName || (noteType === "meeting" ? context?.kitchen : context?.position) || "Kitchen";
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

function emailPreview({ noteType, context, inspection, rawNotes, inspectionType, inspectionDate, inspectorName, siteName, siteNumber, sitePhone, supervisorName }) {
  const playbook = INSPECTION_PLAYBOOK[inspectionType] || INSPECTION_PLAYBOOK["Regular Inspection"];
  const subject = buildSubject({ noteType, context, inspection, inspectionType, inspectionDate, siteName, siteNumber });
  const status = calcOverallStatus(inspection);
  const actionItems = buildActionItems({ inspection, rawNotes });
  const { index: photoIndexList } = buildPhotoIndex(inspection);
  const location = siteName || (noteType === "meeting" ? context?.kitchen : context?.position) || "Kitchen";
  const unit = siteNumber ? ` (#${siteNumber})` : "";
  const date = inspectionDate || context?.date || "—";
  const snapshotLines = [
    `- Inspection Type: ${inspectionType || "—"}`,
    `- Site: ${location}${unit}`,
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
    `## Raw Notes (verbatim)`, rawNotes || "—",
  ].join("\n");
}

/* ── Local Transform (no backend needed) ─────────────────── */
function transformLocally({ noteType, useCase, context, inspection, rawNotes, inspectionType, inspectionDate, inspectorName, siteName, siteNumber, sitePhone, supervisorName }) {
  const status = calcOverallStatus(inspection);
  const actionItems = buildActionItems({ inspection, rawNotes });
  const expandedNotes = expandAbbreviations(rawNotes);
  const location = siteName || (noteType === "meeting" ? context?.kitchen : context?.position) || "Kitchen";
  const date = inspectionDate || context?.date || "—";

  if (useCase === "Email Summary") {
    return emailPreview({ noteType, context, inspection, rawNotes, inspectionType, inspectionDate, inspectorName, siteName, siteNumber, sitePhone, supervisorName });
  }

  if (useCase === "Slack Update") {
    const lines = [
      `*${inspectionType || "Inspection"} — ${location} — ${date}*`,
      `Inspector: ${inspectorName || "—"} | Status: *${status}*`,
      "",
      `*Summary:*`,
      expandedNotes,
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
      "## Expanded Notes",
      expandedNotes,
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
    lines.push("", `--- RAW NOTES ---`, expandedNotes);
    return lines.join("\n");
  }

  return emailPreview({ noteType, context, inspection, rawNotes, inspectionType, inspectionDate, inspectorName, siteName, siteNumber, sitePhone, supervisorName });
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
function RenderedOutput({ noteType, useCase, context, inspection, rawNotes, inspectionType, inspectionDate, inspectorName, siteName, siteNumber, sitePhone, supervisorName }) {
  const status = calcOverallStatus(inspection);
  const actionItems = buildActionItems({ inspection, rawNotes });
  const expandedNotes = expandAbbreviations(rawNotes);
  const location = siteName || (noteType === "meeting" ? context?.kitchen : context?.position) || "Kitchen";
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
        <img src="/sodexo-dark.svg" alt="Sodexo" className="rptLogo" />
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

      {/* Notes */}
      {(expandedNotes || rawNotes) && (
        <div className="rptBlock">
          <div className="rptBlockTitle">Inspector Notes</div>
          <div className="rptNotesContent">{expandedNotes || rawNotes}</div>
        </div>
      )}

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

function exportAsCsv({ inspection, rawNotes, inspectionType, inspectionDate, inspectorName, siteName, siteNumber, supervisorName }) {
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
  <tr><td class="section-header" colspan="5">RAW NOTES</td></tr>
  <tr><td colspan="5" style="white-space:pre-wrap;font-size:10pt;">${(rawNotes || "").replace(/</g, "&lt;")}</td></tr>
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
<div class="notes-box">${(expandedNotes || rawNotes || "\u2014").replace(/</g, "&lt;")}</div>

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

/* ── History Page Component ──────────────────────────────── */
function HistoryPage({ onBack }) {
  const [history, setHistory] = useState([]);
  const [filterDate, setFilterDate] = useState("");
  const [filterType, setFilterType] = useState("");
  const [filterIssue, setFilterIssue] = useState("");
  const [expandedId, setExpandedId] = useState(null);
  const [historyLoaded, setHistoryLoaded] = useState(false);

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
      if (filterIssue) {
        const hasIssue = (rec.actionItems || []).some(a =>
          a.issue?.toLowerCase().includes(filterIssue.toLowerCase())
        );
        if (!hasIssue) return false;
      }
      return true;
    });
  }, [history, filterDate, filterType, filterIssue]);

  function deleteRecord(id) {
    const next = history.filter(r => r.id !== id);
    setHistory(next);
    saveHistory(next).catch(() => {});
  }

  function clearAll() {
    if (!confirm("Delete all inspection history? This cannot be undone.")) return;
    setHistory([]);
    saveHistory([]).catch(() => {});
  }

  const uniqueDates = [...new Set(history.map(r => r.inspectionDate).filter(Boolean))].sort().reverse();
  const uniqueTypes = [...new Set(history.map(r => r.inspectionType).filter(Boolean))].sort();

  return (
    <div className="appShell">
      <header className="topBar">
        <div className="brandLeft">
          <img src="/sodexo-live-logo.svg" alt="Sodexo" className="brandLogo" />
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

      <main style={{ padding: "24px 28px", maxWidth: 1200, margin: "0 auto", width: "100%" }}>
        {/* Filters */}
        <div className="card" style={{ marginBottom: 24 }}>
          <div className="cardHeader">
            <div className="cardTitle">Filters</div>
            {(filterDate || filterType || filterIssue) && (
              <button className="btn btnGhost btnSmall" type="button" onClick={() => { setFilterDate(""); setFilterType(""); setFilterIssue(""); }}>
                Clear filters
              </button>
            )}
          </div>
          <div className="cardBody">
            <div className="fieldGrid" style={{ gridTemplateColumns: "1fr 1fr 1fr" }}>
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
                <span className="fieldLabel">Search Issues</span>
                <input className="input" value={filterIssue} onChange={e => setFilterIssue(e.target.value)} placeholder="e.g., floor, temp, allergen..." />
              </label>
            </div>
          </div>
        </div>

        {/* Results */}
        {filtered.length === 0 ? (
          <div className="card">
            <div className="cardBody">
              <div className="emptyState">
                <div className="emptyTitle">{history.length === 0 ? "No inspections saved yet" : "No matches"}</div>
                <div className="emptySub">{history.length === 0 ? "Complete an inspection and click Save to build your history." : "Try adjusting your filters."}</div>
              </div>
            </div>
          </div>
        ) : (
          <div className="historyList">
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
                        <div className="cardSub">{rec.inspectionDate} &middot; {rec.inspectionType} &middot; {rec.inspectorName || "—"}</div>
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
                          <div className="guideSectionTitle">Raw Notes</div>
                          <pre className="outputPre" style={{ maxHeight: 200 }}>{rec.rawNotes}</pre>
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
        )}
      </main>

      <footer className="footer">
        <img src="/sodexo-live-logo.svg" alt="Sodexo" className="footerLogo" />
        <span>Inspection history is stored locally in your browser.</span>
      </footer>
    </div>
  );
}

/* ── Admin Panel ──────────────────────────────────────────── */
function AdminPanel({ currentUser, onBack }) {
  const [users, setUsers] = useState(() => getUsers());

  function refresh() { setUsers(getUsers()); }

  function handleApprove(badgeHash) { approveUser(badgeHash); refresh(); }

  function handleDeny(badgeHash) {
    if (!confirm("Remove this access request?")) return;
    denyUser(badgeHash); refresh();
  }

  function handlePromote(badgeHash) { promoteToAdmin(badgeHash); refresh(); }

  function handleDemote(badgeHash) { demoteToInspector(badgeHash); refresh(); }

  function handleRemove(badgeHash) {
    if (!confirm("Remove this user? They will need to request access again.")) return;
    denyUser(badgeHash); refresh();
  }

  const pending = users.filter(u => !u.approved);
  const approved = users.filter(u => u.approved);
  const adminCount = users.filter(u => u.role === "admin" && u.approved).length;

  return (
    <div className="appShell">
      <header className="topBar">
        <div className="brandLeft">
          <img src="/sodexo-live-logo.svg" alt="Sodexo" className="brandLogo" />
          <div>
            <div className="brandTitle">Admin Panel</div>
            <div className="brandSub">Manage user access &amp; permissions</div>
          </div>
        </div>
        <div className="topActions">
          <button className="btn btnGhost" onClick={onBack} type="button">Back to Inspector</button>
        </div>
      </header>

      <main style={{ padding: "24px 28px", maxWidth: 900, margin: "0 auto", width: "100%" }}>
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
        <img src="/sodexo-live-logo.svg" alt="Sodexo" className="footerLogo" />
        <span>User accounts are stored locally on this device.</span>
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
      const previewUrl = await fileToDataUrl(f);
      enriched.push({ id: `${Date.now()}_${Math.random().toString(16).slice(2)}`, name: f.name, sizeMb: bytesToMb(f.size), type: f.type, previewUrl });
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
                <input ref={(el) => (fileRefs.current[key] = el)} className="fileInput" type="file" accept="image/*" multiple
                  onChange={(e) => { addPhotos(key, e.target.files); e.target.value = ""; }} />
                <button className="btn btnGhost btnSmall" type="button" onClick={() => fileRefs.current[key]?.click()}>Add photos</button>
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

  const [noteType, setNoteType] = useState("meeting");
  const [context, setContext] = useState(() => buildDefaultContext("meeting"));
  const [inspection, setInspection] = useState(() => buildDefaultInspection());
  const [rawNotes, setRawNotes] = useState("");
  const [useCase, setUseCase] = useState(NOTE_TYPES.meeting.useCases[0]);

  const [inspectionType, setInspectionType] = useState("Regular Inspection");
  const [inspectionDate, setInspectionDate] = useState("");
  const [inspectorName, setInspectorName] = useState("");

  const [siteName, setSiteName] = useState("");
  const [siteNumber, setSiteNumber] = useState("");
  const [supervisorName, setSupervisorName] = useState("");
  const [sitePhone, setSitePhone] = useState("");

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

  if (locked) return <BadgeScreen onUnlock={(user) => { setCurrentUser(user); setLocked(false); resetActivity(); }} />;
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
        siteName, siteNumber, sitePhone, supervisorName,
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
      inspectorName, siteName, siteNumber, sitePhone, supervisorName,
    });
    setOutput(preview);
    setError("");
  }

  function runAiAssist() {
    const tips = aiAssist({ inspection, rawNotes, context, noteType });
    setAiTips(tips);
  }

  async function saveToHistory() {
    const record = {
      id: `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      savedAt: new Date().toISOString(),
      noteType, inspectionType, inspectionDate, inspectorName,
      siteName, siteNumber, supervisorName, sitePhone,
      location: siteName || (noteType === "meeting" ? context?.kitchen : context?.position) || "Kitchen",
      context: { ...context },
      temps: { ...inspection.temps },
      overallStatus: calcOverallStatus(inspection),
      actionItems: buildActionItems({ inspection, rawNotes }),
      rawNotes,
      output,
      inspection,
    };
    const history = await loadHistory();
    history.unshift(record);
    await saveHistory(history);
    setSaved(true);
    setTimeout(() => setSaved(false), 2500);
  }

  function onDownloadCsv() {
    exportAsCsv({ inspection, rawNotes, inspectionType, inspectionDate, inspectorName, siteName, siteNumber, supervisorName });
  }

  function onDownloadHtml() {
    exportAsHtml({ output, inspection, rawNotes, inspectionType, inspectionDate, siteName, siteNumber, sitePhone, inspectorName, supervisorName });
  }

  function onDownloadTxt() {
    exportAsTxt({ output, inspectionDate, siteName });
  }

  return (
    <div className="appShell">
      <header className="topBar">
        <div className="brandLeft">
          <img src="/sodexo-live-logo.svg" alt="Sodexo" className="brandLogo" />
          <div>
            <div className="brandTitle">Kitchen Inspection</div>
            <div className="brandSub">Turn sit-down inspection notes into organized documents</div>
          </div>
        </div>

        <div className="topActions">
          {currentUser && (
            <span className="userBadgeLabel">
              {currentUser.name}{currentUser.role === "admin" ? " (Admin)" : ""}
            </span>
          )}
          <button className="btn btnLock" onClick={() => { lockApp(); setCurrentUser(null); setLocked(true); }} type="button" title="Lock app">&#128274;</button>
          {currentUser?.role === "admin" && (
            <button className="btn btnAdmin" onClick={() => setPage("admin")} type="button">Admin</button>
          )}
          <button className="btn btnGhost" onClick={() => setPage("history")} type="button">Past Reports</button>
          <button className="btn btnGhost" onClick={loadSample} type="button">Try Example</button>
          <button className="btn btnAi" onClick={runAiAssist} type="button">AI Tips</button>
          <button className={cx("btn", "btnPrimary")} onClick={onTransform} type="button" disabled={loading}>
            {loading ? "Generating..." : "Generate Report"}
          </button>
        </div>
      </header>

      <main className="grid">
        {/* LEFT */}
        <section className="card">
          <div className="cardHeader">
            <div className="cardTitle">Input</div>
            <div className="noteTypeRow" role="tablist" aria-label="Note type">
              <button className={cx("seg", noteType === "interview" && "segActive")} onClick={() => switchNoteType("interview")} type="button">
                {NOTE_TYPES.interview.label}
              </button>
              <button className={cx("seg", noteType === "meeting" && "segActive")} onClick={() => switchNoteType("meeting")} type="button">
                {NOTE_TYPES.meeting.label}
              </button>
            </div>
          </div>

          <div className="cardBody">
            <div className="fieldGrid">
              <label className="field">
                <span className="fieldLabel">Inspection Type</span>
                <select className="select" value={inspectionType} onChange={(e) => setInspectionType(e.target.value)}>
                  {INSPECTION_TYPES.map((t) => (<option key={t} value={t}>{t}</option>))}
                </select>
              </label>
              <label className="field">
                <span className="fieldLabel">Inspection Date</span>
                <input className="input" value={inspectionDate} onChange={(e) => setInspectionDate(e.target.value)} placeholder="YYYY-MM-DD" />
              </label>
              <label className="field">
                <span className="fieldLabel">Inspector Name</span>
                <input className="input" value={inspectorName} onChange={(e) => setInspectorName(e.target.value)} placeholder="e.g., J. Da Silva" />
              </label>
              <label className="field">
                <span className="fieldLabel">Supervisor Name</span>
                <input className="input" value={supervisorName} onChange={(e) => setSupervisorName(e.target.value)} placeholder="e.g., GM / Chef Lead" />
              </label>
              <label className="field">
                <span className="fieldLabel">Restaurant / Local Name</span>
                <input className="input" value={siteName} onChange={(e) => setSiteName(e.target.value)} placeholder="e.g., North Stand Kitchen" />
              </label>
              <label className="field">
                <span className="fieldLabel">Location / Unit Number</span>
                <input className="input" value={siteNumber} onChange={(e) => setSiteNumber(e.target.value)} placeholder="e.g., Unit 12 / Loc-204" />
              </label>
              <label className="field">
                <span className="fieldLabel">Location Phone (optional)</span>
                <input className="input" value={sitePhone} onChange={(e) => setSitePhone(e.target.value)} placeholder="e.g., (305) 555-0123" />
              </label>
              <div className="field" />
            </div>

            <div className="fieldGrid">
              {spec.contextFields.map((f) => (
                <label className="field" key={f.key}>
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
                  <label className="field" style={{ marginTop: 0 }}>
                    <span className="fieldLabel">Hand sink temp (F)</span>
                    <input className="input" inputMode="numeric" value={inspection.temps.handSinkTempF}
                      onChange={(e) => setInspection((prev) => ({ ...prev, temps: { ...prev.temps, handSinkTempF: e.target.value } }))}
                      placeholder="e.g., 97" />
                    <span className="hint">
                      {Number(inspection.temps.handSinkTempF) >= 95 ? "Meets >=95 F" : inspection.temps.handSinkTempF ? "Below 95 F - flag" : ""}
                    </span>
                  </label>
                  <label className="field" style={{ marginTop: 0 }}>
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
                <ul>{warnings.map((w, i) => <li key={i}>{w}</li>)}</ul>
              </div>
            )}
            {error ? <div className="errorBox">{error}</div> : null}
          </div>
        </section>

        {/* RIGHT */}
        <section className="card">
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
                  supervisorName={supervisorName}
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

      <footer className="footer">
        <img src="/sodexo-live-logo.svg" alt="Sodexo" className="footerLogo" />
        <span>Tip: Attach the same photos listed in the Photo Index so the email references match.</span>
      </footer>
    </div>
  );
}
