import React, { useMemo, useRef, useState } from "react";
import "./App.css";

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

function buildSubject({
  noteType,
  context,
  inspection,
  inspectionType,
  inspectionDate,
  siteName,
  siteNumber,
}) {
  const status = calcOverallStatus(inspection);

  const baseLocation =
    siteName ||
    (noteType === "meeting" ? context?.kitchen : context?.position) ||
    "Kitchen";

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
        owner: "",
        due: "",
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
  if (!Number.isNaN(hand) && hand && hand < 95) {
    items.push({ issue: `Hand sink temperature below minimum: ${hand}°F (min 95°F)`, owner: "", due: "", priority: "High", photos: [] });
  }
  const three = Number(inspection?.temps?.threeCompSinkTempF);
  if (!Number.isNaN(three) && three && three < 110) {
    items.push({ issue: `3-compartment sink wash temperature below minimum: ${three}°F (min 110°F)`, owner: "", due: "", priority: "High", photos: [] });
  }

  for (const a of parseActionLines(rawNotes)) {
    items.push({ issue: a.issue, owner: "", due: "", priority: "Med", photos: [] });
  }

  const seen = new Set();
  return items.filter((it) => {
    const k = it.issue.toLowerCase();
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
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

function emailPreview({
  noteType,
  context,
  inspection,
  rawNotes,
  inspectionType,
  inspectionDate,
  inspectorName,
  siteName,
  siteNumber,
  sitePhone,
  supervisorName,
}) {
  const playbook =
    INSPECTION_PLAYBOOK[inspectionType] || INSPECTION_PLAYBOOK["Regular Inspection"];

  const subject = buildSubject({
    noteType,
    context,
    inspection,
    inspectionType,
    inspectionDate,
    siteName,
    siteNumber,
  });

  const status = calcOverallStatus(inspection);
  const actionItems = buildActionItems({ inspection, rawNotes });
  const { index: photoIndexList } = buildPhotoIndex(inspection);

  const location =
    siteName ||
    (noteType === "meeting" ? context?.kitchen : context?.position) ||
    "Kitchen";

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
  ]
    .filter(Boolean)
    .join("\n");

  const ctxLines = [
    `- siteName: ${siteName || "—"}`,
    `- siteNumber: ${siteNumber || "—"}`,
    `- supervisorName: ${supervisorName || "—"}`,
    sitePhone ? `- sitePhone: ${sitePhone}` : null,
    ...Object.entries(context || {}).map(([k, v]) => `- ${k}: ${v || "—"}`),
  ]
    .filter(Boolean)
    .join("\n");

  const photoIndex = photoIndexList.length
    ? photoIndexList
        .map((p) => `Photo ${p.num} — ${p.label}${p.caption ? ` — ${p.caption}` : ""}`)
        .join("\n")
    : "No photos attached.";

  // Findings by area
  const findings = [];
  const addFinding = (label, node) => {
    if (!node) return;
    if (node.status && node.status !== "OK" && node.status !== "N/A") {
      findings.push(`- ${label}: ${node.status}${node.notes ? ` — ${node.notes}` : ""}`);
    }
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

  const hand = Number(inspection?.temps?.handSinkTempF);
  const three = Number(inspection?.temps?.threeCompSinkTempF);
  if (!Number.isNaN(hand) && hand && hand < 95)
    findings.push(`- Temps > Hand sink: ${hand}°F (below 95°F minimum)`);
  if (!Number.isNaN(three) && three && three < 110)
    findings.push(`- Temps > 3-comp wash: ${three}°F (below 110°F minimum)`);

  const findingsText = findings.length
    ? findings.join("\n")
    : "- No exceptions noted from checklist/temps.";

  const critical = actionItems
    .filter((a) => a.priority === "High")
    .map((a) => `- ${a.issue}${a.photos?.length ? ` (Photo ${a.photos.join(", ")})` : ""}`)
    .join("\n");

  const criticalText =
    critical ||
    (inspectionType === "Event Day"
      ? "- No critical blockers identified for service."
      : "- No critical issues flagged.");

  return [
    subject,
    "",
    `Hi team,`,
    "",
    playbook.opening,
    "",
    `## ${playbook.headline} — Snapshot`,
    snapshotLines,
    "",
    `## Context (from sit-down notes)`,
    ctxLines || "- —",
    "",
    `## Critical Risks`,
    criticalText,
    "",
    `## Findings by Area`,
    findingsText,
    "",
    `## Corrective Actions (please assign Owner + Due)`,
    tableMarkdown(actionItems),
    "",
    `## Photo Index`,
    photoIndex,
    "",
    `## Raw Notes (verbatim)`,
    rawNotes || "—",
  ].join("\n");
}

async function transformNotes({ noteType, useCase, context, inspection, rawNotes, emailAssist, meta }) {
  const res = await fetch("/api/transform", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ noteType, useCase, context, inspection, rawNotes, emailAssist, meta }),
  });
  if (!res.ok) throw new Error((await res.text().catch(() => "")) || `Request failed (${res.status})`);
  const data = await res.json();
  if (!data?.output) throw new Error("Invalid server response: missing output");
  return data.output;
}

function PhotoStrip({ photos, onRemove }) {
  if (!photos?.length) return null;
  return (
    <div className="photoStrip">
      {photos.map((p) => (
        <div className="photoThumb" key={p.id}>
          <img src={p.previewUrl} alt={p.name} />
          <button className="thumbX" type="button" onClick={() => onRemove(p.id)} aria-label="Remove photo">
            ×
          </button>
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
      enriched.push({
        id: `${Date.now()}_${Math.random().toString(16).slice(2)}`,
        name: f.name,
        sizeMb: bytesToMb(f.size),
        type: f.type,
        previewUrl,
      });
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
                <select
                  className="select selectSmall"
                  value={current.status}
                  onChange={(e) =>
                    setInspection((prev) => setAtPath(prev, it.path, { ...current, status: e.target.value }))
                  }
                >
                  {STATUS_OPTIONS.map((s) => (
                    <option key={s} value={s}>{s}</option>
                  ))}
                </select>
              </div>

              <input
                className="input inputSmall"
                value={current.notes}
                onChange={(e) => setInspection((prev) => setAtPath(prev, it.path, { ...current, notes: e.target.value }))}
                placeholder="Issue / observation (optional)"
              />

              <div className="photoRow">
                <input
                  ref={(el) => (fileRefs.current[key] = el)}
                  className="fileInput"
                  type="file"
                  accept="image/*"
                  multiple
                  onChange={(e) => { addPhotos(key, e.target.files); e.target.value = ""; }}
                />
                <button className="btn btnGhost btnSmall" type="button" onClick={() => fileRefs.current[key]?.click()}>
                  Add photos
                </button>
                <span className="hint">Up to {PHOTO_LIMIT} (≤ {PHOTO_MAX_MB}MB each)</span>
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
  const [noteType, setNoteType] = useState("meeting");
  const [context, setContext] = useState(() => buildDefaultContext("meeting"));
  const [inspection, setInspection] = useState(() => buildDefaultInspection());
  const [rawNotes, setRawNotes] = useState("");
  const [useCase, setUseCase] = useState(NOTE_TYPES.meeting.useCases[0]);

  // Global inspection metadata
  const [inspectionType, setInspectionType] = useState("Regular Inspection");
  const [inspectionDate, setInspectionDate] = useState("");
  const [inspectorName, setInspectorName] = useState("");

  // Site / location metadata
  const [siteName, setSiteName] = useState("");
  const [siteNumber, setSiteNumber] = useState("");
  const [supervisorName, setSupervisorName] = useState("");
  const [sitePhone, setSitePhone] = useState("");

  const [output, setOutput] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

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
  }

  function loadSample() {
    const s = NOTE_TYPES[noteType].sample;
    setContext({ ...s.context });
    setInspection(s.inspection ? { ...s.inspection } : buildDefaultInspection());
    setRawNotes(s.rawNotes || "");

    // load meta if present
    setInspectionType(s.meta?.inspectionType || "Regular Inspection");
    setInspectionDate(s.meta?.inspectionDate || s.context?.date || "");
    setInspectorName(s.meta?.inspectorName || "");

    // reset site fields (not in sample data)
    setSiteName("");
    setSiteNumber("");
    setSupervisorName("");
    setSitePhone("");

    setOutput("");
    setError("");
  }

  async function onTransform() {
    setError("");
    setLoading(true);
    try {
      const meta = {
        inspectionType,
        inspectionDate: inspectionDate || context?.date || "",
        inspectorName,
        site: {
          name: siteName,
          number: siteNumber,
          supervisorName,
          phone: sitePhone,
        },
      };

      const emailAssist =
        useCase === "Email Summary"
          ? {
              subject: buildSubject({
                noteType,
                context,
                inspection,
                inspectionType,
                inspectionDate,
                siteName,
                siteNumber,
              }),
              actionItems: buildActionItems({ inspection, rawNotes }),
              photoIndex: buildPhotoIndex(inspection).index,
              meta,
            }
          : null;

      const out = await transformNotes({ noteType, useCase, context, inspection, rawNotes, emailAssist, meta });
      setOutput(out);
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
      noteType,
      context,
      inspection,
      rawNotes,
      inspectionType,
      inspectionDate: inspectionDate || context?.date || "",
      inspectorName,
      siteName,
      siteNumber,
      sitePhone,
      supervisorName,
    });
    setOutput(preview);
    setError("");
  }

  return (
    <div className="appShell">
      <header className="topBar">
        <div className="brandLeft">
          <svg className="logoSvg" width="40" height="40" viewBox="0 0 40 40" fill="none" aria-label="Sodexo Live">
            <rect width="40" height="40" rx="8" fill="#EE0000"/>
            <text x="20" y="27" textAnchor="middle" fill="white" fontWeight="800" fontSize="20" fontFamily="Inter, sans-serif">S</text>
          </svg>
          <div>
            <div className="brandTitle">Sodexo Live! <span style={{fontWeight:400, opacity:0.8, fontSize:'0.85em'}}>Kitchen Inspection</span></div>
            <div className="brandSub">Turn sit-down inspection notes into organized documents</div>
          </div>
        </div>

        <div className="topActions">
          <button className="btn btnGhost" onClick={loadSample} type="button">Load sample</button>
          {useCase === "Email Summary" ? (
            <button className="btn btnGhost" onClick={showEmailPreviewNow} type="button">Email preview</button>
          ) : null}
          <button className={cx("btn", "btnPrimary")} onClick={onTransform} type="button" disabled={!canTransform || loading}>
            {loading ? "Formatting…" : "Transform"}
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
            {/* Inspection meta + site fields */}
            <div className="fieldGrid">
              <label className="field">
                <span className="fieldLabel">Inspection Type</span>
                <select className="select" value={inspectionType} onChange={(e) => setInspectionType(e.target.value)}>
                  {INSPECTION_TYPES.map((t) => (
                    <option key={t} value={t}>{t}</option>
                  ))}
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

            {/* Original context fields */}
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
                {spec.useCases.map((u) => (
                  <option key={u} value={u}>{u}</option>
                ))}
              </select>
            </div>

            <div className="guide">
              <div className="guideHeader">
                <div>
                  <div className="guideTitle">Inspector guide</div>
                  <div className="guideSub">Fast checklist for sit-down kitchen inspections</div>
                </div>
                <div className="pillRow">
                  <span className="pill">Hand sink ≥ 95°F</span>
                  <span className="pill">3-comp wash ≥ 110°F</span>
                </div>
              </div>

              <GuideSection
                title="Facility: ceiling → walls → floors → lighting"
                items={[
                  { path: ["facility", "ceiling"], label: "Ceiling" },
                  { path: ["facility", "walls"], label: "Walls" },
                  { path: ["facility", "floors"], label: "Floors" },
                  { path: ["facility", "lighting"], label: "Lighting" },
                ]}
                inspection={inspection}
                setInspection={setInspection}
              />

              <GuideSection
                title="Operations: employees + process controls"
                items={[
                  { path: ["operations", "employeePractices"], label: "Employee practices" },
                  { path: ["operations", "handwashing"], label: "Handwashing / supplies" },
                  { path: ["operations", "labelingDating"], label: "Labeling / dating" },
                  { path: ["operations", "logs"], label: "Logs / documentation" },
                ]}
                inspection={inspection}
                setInspection={setInspection}
              />

              <div className="tempsRow">
                <div className="tempsTitle">Key temperatures</div>
                <div className="tempsGrid">
                  <label className="field" style={{ marginTop: 0 }}>
                    <span className="fieldLabel">Hand sink temp (°F)</span>
                    <input className="input" inputMode="numeric" value={inspection.temps.handSinkTempF}
                      onChange={(e) => setInspection((prev) => ({ ...prev, temps: { ...prev.temps, handSinkTempF: e.target.value } }))}
                      placeholder="e.g., 97"
                    />
                    <span className="hint">
                      {Number(inspection.temps.handSinkTempF) >= 95 ? "Meets ≥95°F" : inspection.temps.handSinkTempF ? "Below 95°F — flag" : ""}
                    </span>
                  </label>

                  <label className="field" style={{ marginTop: 0 }}>
                    <span className="fieldLabel">3-comp wash temp (°F)</span>
                    <input className="input" inputMode="numeric" value={inspection.temps.threeCompSinkTempF}
                      onChange={(e) => setInspection((prev) => ({ ...prev, temps: { ...prev.temps, threeCompSinkTempF: e.target.value } }))}
                      placeholder="e.g., 112"
                    />
                    <span className="hint">
                      {Number(inspection.temps.threeCompSinkTempF) >= 110 ? "Meets ≥110°F" : inspection.temps.threeCompSinkTempF ? "Below 110°F — flag" : ""}
                    </span>
                  </label>
                </div>
              </div>

              <GuideSection
                title="Equipment check"
                items={[
                  { path: ["equipment", "doubleDoorCooler"], label: "Double-door cooler" },
                  { path: ["equipment", "doubleDoorFreezer"], label: "Double-door freezer" },
                  { path: ["equipment", "walkInCooler"], label: "Walk-in cooler" },
                  { path: ["equipment", "warmers"], label: "Warmers / hot holding" },
                  { path: ["equipment", "ovens"], label: "Ovens" },
                  { path: ["equipment", "threeCompSink"], label: "3-compartment sink" },
                  { path: ["equipment", "ecolab"], label: "Ecolab / chemicals" },
                ]}
                inspection={inspection}
                setInspection={setInspection}
              />
            </div>

            <div className="field">
              <div className="fieldLabelRow">
                <span className="fieldLabel">Raw notes</span>
                <span className="hint">Abbreviations are expanded while preserving meaning</span>
              </div>
              <textarea className="textarea" value={rawNotes} onChange={(e) => setRawNotes(e.target.value)} placeholder="Paste quick inspection notes here…" rows={10} />
            </div>

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
            </div>
          </div>

          <div className="cardBody">
            {!output ? (
              <div className="emptyState">
                <div className="emptyTitle">No output yet</div>
                <div className="emptySub">Load a sample or paste raw notes, then Transform (or Email preview).</div>
              </div>
            ) : (
              <pre className="outputPre">{output}</pre>
            )}
          </div>
        </section>
      </main>

      <footer className="footer">
        <span>Tip: Attach the same photos listed in the Photo Index so the email references match.</span>
      </footer>
    </div>
  );
}
