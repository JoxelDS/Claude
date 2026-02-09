import React, { useEffect, useMemo, useRef, useState } from "react";
import "./App.css";

/* ── localStorage helpers for History ────────────────────── */
const STORAGE_KEY = "sdx_inspection_history";

function loadHistory() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]");
  } catch { return []; }
}

function saveHistory(records) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(records));
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
  const date = inspectionDate || context?.date || "—";
  const playbook = INSPECTION_PLAYBOOK[inspectionType] || INSPECTION_PLAYBOOK["Regular Inspection"];
  const { index: photoIndexList } = buildPhotoIndex(inspection);

  const statusBadge = (s) => {
    if (s === "OK") return <span className="roBadge roBadgePass">Pass</span>;
    if (s === "N/A") return <span className="roBadge roBadgeNa">N/A</span>;
    if (s === "Not Clean") return <span className="roBadge roBadgeFail">Not Clean</span>;
    return <span className="roBadge roBadgeWarn">Needs Attention</span>;
  };

  const findings = [];
  const addFinding = (label, node) => {
    if (node?.status && node.status !== "OK" && node.status !== "N/A")
      findings.push({ label, status: node.status, notes: node.notes });
  };
  addFinding("Ceiling", inspection?.facility?.ceiling);
  addFinding("Walls", inspection?.facility?.walls);
  addFinding("Floors", inspection?.facility?.floors);
  addFinding("Lighting", inspection?.facility?.lighting);
  addFinding("Employee practices", inspection?.operations?.employeePractices);
  addFinding("Handwashing / supplies", inspection?.operations?.handwashing);
  addFinding("Labeling / dating", inspection?.operations?.labelingDating);
  addFinding("Logs / documentation", inspection?.operations?.logs);
  addFinding("Double-door cooler", inspection?.equipment?.doubleDoorCooler);
  addFinding("Double-door freezer", inspection?.equipment?.doubleDoorFreezer);
  addFinding("Walk-in cooler", inspection?.equipment?.walkInCooler);
  addFinding("Warmers / hot holding", inspection?.equipment?.warmers);
  addFinding("Ovens", inspection?.equipment?.ovens);
  addFinding("3-compartment sink", inspection?.equipment?.threeCompSink);
  addFinding("Ecolab / chemicals", inspection?.equipment?.ecolab);
  const handT = Number(inspection?.temps?.handSinkTempF);
  const threeT = Number(inspection?.temps?.threeCompSinkTempF);
  if (handT && handT < 95) findings.push({ label: "Hand sink temp", status: "Fail", notes: `${handT}°F (below 95°F minimum)` });
  if (threeT && threeT < 110) findings.push({ label: "3-comp wash temp", status: "Fail", notes: `${threeT}°F (below 110°F minimum)` });

  const scorecardSections = [
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

  return (
    <div className="renderedOutput">
      {/* Header */}
      <div className="roHeader">
        <div className="roHeaderTop">
          <div>
            <div className="roTitle">{location}</div>
            <div className="roSubtitle">{inspectionType || "Inspection"} &middot; {date}</div>
          </div>
          <div className={cx("roStatusBig", status === "Pass" ? "roStatusPass" : "roStatusFail")}>
            {status}
          </div>
        </div>
        <div className="roMetaGrid">
          <div className="roMetaItem"><span className="roMetaLabel">Inspector</span><span>{inspectorName || "—"}</span></div>
          <div className="roMetaItem"><span className="roMetaLabel">Supervisor</span><span>{supervisorName || "—"}</span></div>
          {siteNumber && <div className="roMetaItem"><span className="roMetaLabel">Unit #</span><span>{siteNumber}</span></div>}
          {sitePhone && <div className="roMetaItem"><span className="roMetaLabel">Phone</span><span>{sitePhone}</span></div>}
          <div className="roMetaItem"><span className="roMetaLabel">Hand Sink</span><span>{inspection?.temps?.handSinkTempF || "—"}°F {handT >= 95 ? "✓" : handT ? "✗" : ""}</span></div>
          <div className="roMetaItem"><span className="roMetaLabel">3-Comp Wash</span><span>{inspection?.temps?.threeCompSinkTempF || "—"}°F {threeT >= 110 ? "✓" : threeT ? "✗" : ""}</span></div>
        </div>
      </div>

      {/* Opening message for Email/Doc */}
      {(useCase === "Email Summary" || useCase === "Google Doc") && (
        <div className="roSection">
          <p className="roText">{playbook.opening}</p>
        </div>
      )}

      {/* Findings */}
      {findings.length > 0 ? (
        <div className="roSection">
          <div className="roSectionTitle">Findings</div>
          <div className="roFindings">
            {findings.map((f, i) => (
              <div className="roFindingRow" key={i}>
                <span className="roFindingLabel">{f.label}</span>
                <span className={cx("roBadge", f.status === "Not Clean" || f.status === "Fail" ? "roBadgeFail" : "roBadgeWarn")}>{f.status}</span>
                {f.notes && <span className="roFindingNote">{f.notes}</span>}
              </div>
            ))}
          </div>
        </div>
      ) : (
        <div className="roSection">
          <div className="roSectionTitle">Findings</div>
          <div className="roAllClear">All areas passed inspection</div>
        </div>
      )}

      {/* Scorecard view */}
      {useCase === "Evaluation Scorecard" && (
        <div className="roSection">
          <div className="roSectionTitle">Full Scorecard</div>
          {scorecardSections.map(sec => (
            <div key={sec.title} className="roScoreSection">
              <div className="roScoreSectionTitle">{sec.title}</div>
              {sec.items.map(([label, node]) => (
                <div className="roScoreRow" key={label}>
                  <span className="roScoreLabel">{label}</span>
                  {statusBadge(node?.status || "N/A")}
                  {node?.notes && <span className="roScoreNote">{node.notes}</span>}
                </div>
              ))}
            </div>
          ))}
          <div className="roScoreSection">
            <div className="roScoreSectionTitle">Temperatures</div>
            <div className="roScoreRow">
              <span className="roScoreLabel">Hand sink</span>
              <span className={cx("roBadge", handT >= 95 ? "roBadgePass" : handT ? "roBadgeFail" : "roBadgeNa")}>{inspection?.temps?.handSinkTempF || "—"}°F</span>
            </div>
            <div className="roScoreRow">
              <span className="roScoreLabel">3-comp wash</span>
              <span className={cx("roBadge", threeT >= 110 ? "roBadgePass" : threeT ? "roBadgeFail" : "roBadgeNa")}>{inspection?.temps?.threeCompSinkTempF || "—"}°F</span>
            </div>
          </div>
        </div>
      )}

      {/* Action Items */}
      {actionItems.length > 0 && (
        <div className="roSection">
          <div className="roSectionTitle">Action Items <span className="roCount">{actionItems.length}</span></div>
          <div className="roActions">
            {actionItems.map((a, i) => (
              <div className="roActionRow" key={i}>
                <span className={cx("roPriority", a.priority === "High" ? "roPriorityHigh" : "roPriorityMed")}>{a.priority}</span>
                <span className="roActionText">{a.issue}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Photo index */}
      {photoIndexList.length > 0 && (
        <div className="roSection">
          <div className="roSectionTitle">Photos</div>
          <div className="roPhotos">
            {photoIndexList.map(p => (
              <div className="roPhotoRow" key={p.num}>
                <span className="roPhotoNum">#{p.num}</span>
                <span>{p.label}{p.caption ? ` — ${p.caption}` : ""}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Expanded notes */}
      <div className="roSection">
        <div className="roSectionTitle">Notes</div>
        <div className="roNotes">{expandedNotes || rawNotes || "—"}</div>
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
  const meta = [
    ["Inspection Type", inspectionType],
    ["Date", inspectionDate],
    ["Inspector", inspectorName],
    ["Site", siteName],
    ["Unit #", siteNumber],
    ["Supervisor", supervisorName],
    [""],
  ];
  const dataRows = buildCsvRows({ inspection, rawNotes, inspectionType, inspectionDate, inspectorName, siteName, siteNumber, supervisorName });
  const allRows = [...meta, ...dataRows, [""], ["Raw Notes", (rawNotes || "").replace(/"/g, '""')]];
  const csv = allRows.map(r => r.map(c => `"${c}"`).join(",")).join("\n");
  const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
  const filename = `inspection_${inspectionDate || "undated"}_${(siteName || "site").replace(/\s+/g, "_")}.csv`;
  downloadBlob(blob, filename);
}

function exportAsHtml({ output, inspectionType, inspectionDate, siteName, inspectorName }) {
  const html = `<!DOCTYPE html>
<html><head><meta charset="utf-8"><title>Inspection Report - ${inspectionDate || "Report"}</title>
<style>body{font-family:Calibri,Arial,sans-serif;max-width:800px;margin:40px auto;padding:20px;color:#1F2937;line-height:1.6}
h1{color:#2A295C;border-bottom:3px solid #EE0000;padding-bottom:8px}
h2{color:#283897;margin-top:24px}
table{border-collapse:collapse;width:100%;margin:12px 0}
th,td{border:1px solid #DDE1E8;padding:8px 12px;text-align:left}
th{background:#2A295C;color:white;font-weight:600}
.meta{background:#F7F8FA;padding:16px;border-radius:8px;margin-bottom:24px}
.meta strong{color:#2A295C}
pre{background:#F7F8FA;padding:16px;border-radius:8px;white-space:pre-wrap;font-size:13px}
</style></head><body>
<h1>Kitchen Inspection Report</h1>
<div class="meta">
<strong>Type:</strong> ${inspectionType || "—"} | <strong>Date:</strong> ${inspectionDate || "—"} | <strong>Site:</strong> ${siteName || "—"} | <strong>Inspector:</strong> ${inspectorName || "—"}
</div>
<pre>${(output || "").replace(/</g, "&lt;").replace(/>/g, "&gt;")}</pre>
</body></html>`;
  const blob = new Blob([html], { type: "text/html;charset=utf-8;" });
  const filename = `inspection_${inspectionDate || "undated"}_${(siteName || "site").replace(/\s+/g, "_")}.html`;
  downloadBlob(blob, filename);
}

function exportAsTxt({ output, inspectionDate, siteName }) {
  const blob = new Blob([output || ""], { type: "text/plain;charset=utf-8;" });
  const filename = `inspection_${inspectionDate || "undated"}_${(siteName || "site").replace(/\s+/g, "_")}.txt`;
  downloadBlob(blob, filename);
}

/* ── History Page Component ──────────────────────────────── */
function HistoryPage({ onBack }) {
  const [history, setHistory] = useState(() => loadHistory());
  const [filterDate, setFilterDate] = useState("");
  const [filterType, setFilterType] = useState("");
  const [filterIssue, setFilterIssue] = useState("");
  const [expandedId, setExpandedId] = useState(null);

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
    saveHistory(next);
  }

  function clearAll() {
    if (!confirm("Delete all inspection history? This cannot be undone.")) return;
    setHistory([]);
    saveHistory([]);
  }

  const uniqueDates = [...new Set(history.map(r => r.inspectionDate).filter(Boolean))].sort().reverse();
  const uniqueTypes = [...new Set(history.map(r => r.inspectionType).filter(Boolean))].sort();

  return (
    <div className="appShell">
      <header className="topBar">
        <div className="brandLeft">
          <img src="/sodexo-live-logo.svg" alt="Sodexo Live!" className="brandLogo" />
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
        <img src="/sodexo-live-logo.svg" alt="Sodexo Live!" className="footerLogo" />
        <span>Inspection history is stored locally in your browser.</span>
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
  const [page, setPage] = useState("inspector"); // "inspector" | "history"

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

  if (page === "history") return <HistoryPage onBack={() => setPage("inspector")} />;

  const spec = NOTE_TYPES[noteType];
  const canTransform = useMemo(() => rawNotes.trim().length > 0, [rawNotes]);

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

  function saveToHistory() {
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
    const history = loadHistory();
    history.unshift(record);
    saveHistory(history);
    setSaved(true);
    setTimeout(() => setSaved(false), 2500);
  }

  function onDownloadCsv() {
    exportAsCsv({ inspection, rawNotes, inspectionType, inspectionDate, inspectorName, siteName, siteNumber, supervisorName });
  }

  function onDownloadHtml() {
    exportAsHtml({ output, inspectionType, inspectionDate, siteName, inspectorName });
  }

  function onDownloadTxt() {
    exportAsTxt({ output, inspectionDate, siteName });
  }

  return (
    <div className="appShell">
      <header className="topBar">
        <div className="brandLeft">
          <img src="/sodexo-live-logo.svg" alt="Sodexo Live!" className="brandLogo" />
          <div>
            <div className="brandTitle">Kitchen Inspection</div>
            <div className="brandSub">Turn sit-down inspection notes into organized documents</div>
          </div>
        </div>

        <div className="topActions">
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
                  <span className="pill">Hand sink >= 95 F</span>
                  <span className="pill">3-comp wash >= 110 F</span>
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
                  <button className="btn btnDownload" type="button" onClick={onDownloadCsv}>Excel (CSV)</button>
                  <button className="btn btnDownload" type="button" onClick={onDownloadHtml}>Word (HTML)</button>
                  <button className="btn btnDownload" type="button" onClick={onDownloadTxt}>Text File</button>
                </div>
              </>
            )}
          </div>
        </section>
      </main>

      <footer className="footer">
        <img src="/sodexo-live-logo.svg" alt="Sodexo Live!" className="footerLogo" />
        <span>Tip: Attach the same photos listed in the Photo Index so the email references match.</span>
      </footer>
    </div>
  );
}
