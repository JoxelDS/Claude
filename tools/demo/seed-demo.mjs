// Seeds the public demo venue: a made-up arena with 12 stands, demo sign-ins, sample reports,
// stand temperature logs and equipment, so anyone can try SDX Inspect with no setup.
//   node tools/demo/seed-demo.mjs            → writes (re-run any time to refresh the dates)
//   node tools/demo/seed-demo.mjs --dry      → prints what it would write
// It only ever writes under venues/<VENUE>/… and venueRegistry/<VENUE>; never the home venue.
// Everything here is invented: stand names, people, phones (305-555-01xx), license numbers.
import { createHash } from 'crypto';

export const VENUE = 'riverside-demo';
export const SITE = 'https://joxelds.github.io/Claude/';
const BASE = 'https://firestore.googleapis.com/v1/projects/sodexoinspection/databases/(default)/documents';
const DRY = process.argv.includes('--dry');
if (VENUE === 'default') throw new Error('never seed the home venue');

const sha = s => createHash('sha256').update('sdx_badge_v2_' + s).digest('hex');
const TZ = 'America/New_York';
const day = (n = 0) => new Date(Date.now() - n * 864e5).toLocaleDateString('en-CA', { timeZone: TZ });
const at = (n, h = 15, m = 20) => { const d = new Date(Date.now() - n * 864e5); d.setUTCHours(h + 4, m, 0, 0); return d.toISOString(); }; // h = ET hour
const pic = (k, tag) => { const u = `${SITE}demo/${k}.jpg`; return { id: 'demo_' + k + (tag ? '_' + tag : ''), url: u, thumbUrl: u, previewUrl: u, exportUrl: u, ...(tag ? { tag } : {}) }; };

// ── Stands (made up) ─────────────────────────────────────────────
export const STANDS = [
  ['101', 'BURGER BASE', 'Floor 1', 'Concession', 'DEMO-10101'],
  ['104', 'TACO TERRACE', 'Floor 1', 'Concession', 'DEMO-10104'],
  ['110', 'PRETZEL CART', 'Floor 1', 'Portable', 'DEMO-10110'],
  ['118', 'SMOKEHOUSE BBQ', 'Floor 1', 'Subcontractor', 'DEMO-10118'],
  ['122', 'CRAFT TAPS BAR', 'Floor 1', 'Bar', ''],
  ['205', 'PIZZA PRESS', 'Floor 2', 'Concession', 'DEMO-10205'],
  ['212', 'NOODLE BOX', 'Floor 2', 'Subcontractor', 'DEMO-10212'],
  ['220', 'CLUB KITCHEN', 'Floor 2', 'Kitchen', 'DEMO-10220'],
  ['231', 'SWEET SPOT', 'Floor 2', 'Concession', ''],
  ['305', 'CHICKEN COOP', 'Floor 3', 'Concession', 'DEMO-10305'],
  ['314', 'HOT DOG HUB', 'Floor 3', 'Portable', 'DEMO-10314'],
  ['330', 'PANTRY 330', 'Floor 3', 'Pantry', ''],
];
const stand = u => { const s = STANDS.find(x => x[0] === u); return { siteName: s[1], siteNumber: s[0], floor: s[2], locationType: s[3], restaurantLicense: s[4] }; };
const kitchenRegistry = {
  items: Object.fromEntries(STANDS.map(([unit, site, floor, locType, license]) => [`u:${unit}`, { site, unit, floor, locType, license, addedAt: at(30), addedBy: 'Demo setup' }])),
  hidden: {},
};

// ── Equipment (coolers / freezers the form and the stand page list) ──
const eq = (tag, label, unit, extra = {}) => { const s = stand(unit); return [tag, { assetTag: tag, label, unit, venueName: s.siteName, floor: s.floor, locType: s.locationType, standId: `u:${unit}`, brandName: '', location: 'BACK OF HOUSE', ...extra }]; };
const equipmentRegistry = {
  items: Object.fromEntries([
    eq('SDX-CL-101-1', '2-DOOR COOLER', '101', { brandName: 'DELFIELD' }),
    eq('SDX-FZ-101-1', 'REACH-IN FREEZER', '101', { brandName: 'TRUE' }),
    eq('SDX-CL-104-1', 'PREP COOLER', '104', { brandName: 'TRUE', location: 'FRONT LINE' }),
    eq('SDX-CL-118-1', 'WALK-IN COOLER', '118'),
    eq('SDX-FZ-118-1', 'WALK-IN FREEZER', '118'),
    eq('SDX-CL-205-1', '2-DOOR COOLER', '205', { brandName: 'TRUE' }),
    eq('SDX-CL-220-1', 'WALK-IN COOLER', '220'),
    eq('SDX-FZ-220-1', 'WALK-IN FREEZER', '220'),
    eq('SDX-CL-305-1', 'DISPLAY COOLER', '305', { location: 'FRONT LINE' }),
    eq('SDX-CL-330-1', 'MILK COOLER', '330'),
  ]),
  labelIndex: {}, hidden: {}, verified: {}, confirmed: {}, setup: {},
};

// ── People ───────────────────────────────────────────────────────
const user = (badge, name, role, department, days = 30) => ({ badgeHash: sha(badge), name, department, badgeDisplay: '••••' + badge.slice(-4), role, requestedRole: role, approved: true, registeredAt: at(days) });
export const USERS = [
  user('365582', 'Joxel Da Silva', 'admin', 'Safety Inspector', 60),
  user('448800', 'Demo Inspector', 'inspector', 'Food Safety / QA', 45),
  user('777001', 'Demo Maintenance', 'maintenance', 'Maintenance / Facilities'),
  user('777002', 'Demo Cleaning', 'cleaning', 'Cleaning / Sanitation'),
  user('777003', 'Demo Ecolab', 'ecolab', 'Ecolab'),
];
export const TOKENS = { inspector: 'tryinspector', maintenance: 'trymaintenance', cleaning: 'trycleaning', ecolab: 'tryecolab' };
const venueSettings = {
  recheckDays: 7,
  inviteTokens: TOKENS,
  eventDays: { [day(0)]: 'DEMO GAME DAY', [day(3)]: 'DEMO GAME DAY', [day(7)]: 'DEMO GAME DAY' },
  demoVenue: true, demoSeededAt: new Date().toISOString(),
};

// ── Sample inspection reports ────────────────────────────────────
const rep = (id, unit, n, items, extra = {}) => ({
  id, ...stand(unit), inspectionDate: day(n), savedAt: at(n, 14, 10 + id.length), inspectorName: 'Demo Inspector',
  inspectionType: 'Regular Inspection', overallStatus: items.length ? 'Needs Attention' : 'Pass', supervisorName: 'Stand supervisor',
  actionItems: items.map(x => ({ priority: 'Medium', ...x })), photos: items.flatMap(x => x.photos || []),
  photoCount: items.reduce((a, x) => a + (x.photos || []).length, 0), guideMode: 'full', source: 'demo_seed', ...extra,
});
const INSPECTIONS = [
  rep('demo_r01', '101', 1, [
    { issue: 'Facilities – Hand Sink: faucet leaking under the sink, water on the floor', area: 'Back of the house', notes: 'Left hand sink', corrective: 'Put a bucket under it, called maintenance', photos: [pic('faucet')] },
    { issue: 'Cleaning: grease build-up under the fryer', area: 'Back of the house', corrective: 'Told the supervisor', photos: [pic('grease')] },
  ]),
  rep('demo_r02', '104', 2, [
    { issue: 'Temperature out of range — PREP COOLER (TRUE · FRONT LINE · SDX-CL-104-1): 46°F (max 40°F)', area: 'PREP COOLER', corrective: 'Moved the food to the walk-in, called maintenance', priority: 'High', photos: [pic('cooler')] },
  ]),
  rep('demo_r03', '118', 1, [
    { issue: 'Pest Control: droppings behind the ice machine', notes: 'Call the pest vendor', priority: 'High', photos: [pic('pest')] },
    { issue: 'Ecolab / Chemicals: sanitizer dispenser empty', corrective: 'Asked for a refill', photos: [pic('sanitizer')] },
  ]),
  rep('demo_r04', '205', 3, [
    { issue: 'Facilities – Plumbing: floor drain draining slow, backing up', notes: 'Behind the 3-compartment sink', photos: [pic('drain')] },
  ]),
  rep('demo_r05', '212', 4, [
    { issue: 'Facilities – Lighting: light out over the prep table', notes: 'Two fixtures', photos: [pic('light')] },
    { issue: 'Building: missing ceiling tile over the dish area', area: 'Back of the house', photos: [pic('tile')] },
  ]),
  rep('demo_r06', '305', 5, [
    { issue: 'Cleaning: floor under the prep table dirty', area: 'Back of the house', corrective: 'Crew cleaned it during the visit', photos: [pic('floor')] },
  ]),
  rep('demo_r07', '220', 6, [], { inspectionType: 'Post Event' }),
  rep('demo_r08', '231', 8, []),
  rep('demo_r09', '330', 9, [], { inspectionType: 'Event Day', eventDay: true, eventDayName: 'DEMO GAME DAY' }),
];

// ── Stand temperature logs (the stand QR page) ───────────────────
const sub = (id, unit, n, name, phone, temps, h = 13) => { const s = stand(unit); return { id, type: 'submission', venueId: VENUE, sessionId: id, reportId: '', supervisorName: name, supervisorPhone: phone, site: s.siteName, unit, floor: s.floor, locationType: s.locationType, temps, foodNames: {}, tempCorrections: {}, tempTimes: {}, itemLabels: {}, customItems: [], submittedAt: at(n, h) }; };
const HACCP = [
  sub('demo_h01', '101', 0, 'Maria P.', '305-555-0101', { hotHolding: ['150'], coldHolding: ['38'] }),
  sub('demo_h02', '101', 3, 'Maria P.', '305-555-0101', { hotHolding: ['148'] }),
  sub('demo_h03', '104', 0, 'Luis T.', '305-555-0144', { hotHolding: ['142'], coldHolding: ['39'] }, 12),
  sub('demo_h04', '205', 3, 'Dee W.', '305-555-0177', { hotHolding: ['155'] }),
  sub('demo_h05', '305', 0, 'Kim R.', '305-555-0188', { hotHolding: ['165'], coldHolding: ['36'] }, 11),
  sub('demo_h06', '305', 7, 'Kim R.', '305-555-0188', { hotHolding: ['160'] }),
];
// Today's records from the stands (shows in "From the stands today")
const stLog = (id, unit, minsAgo, name, phone, extra) => { const s = stand(unit); return { id, ...s, inspectorName: name, supervisorName: name, sitePhone: phone, reportedBy: name, inspectionDate: day(0), savedAt: new Date(Date.now() - minsAgo * 60000).toISOString(), inspectionType: 'Supervisor Log', supervisorLog: true, quickProblem: false, source: 'haccp_portal', overallStatus: 'Pass', haccpTempCount: 0, actionItems: [], suppliesNeeded: [], ...extra }; };
INSPECTIONS.push(
  stLog('demo_s01', '101', 45, 'Maria P.', '305-555-0101', { haccpSubmissionId: 'demo_h01', haccpTempCount: 2, haccpReadings: [{ label: 'Hot holding', value: '150', ok: true, min: 135 }, { label: 'Cold holding', value: '38', ok: true, max: 41 }] }),
  stLog('demo_s02', '104', 70, 'Luis T.', '305-555-0144', { haccpSubmissionId: 'demo_h03', haccpTempCount: 2, suppliesNeeded: [{ item: 'Test strips', qty: '2', urgent: true, fromPortal: true }, { item: 'Paper towels', qty: '3', fromPortal: true }] }),
);

// ── Firestore REST ───────────────────────────────────────────────
const val = v => {
  if (v === null || v === undefined) return { nullValue: null };
  if (typeof v === 'boolean') return { booleanValue: v };
  if (typeof v === 'number') return Number.isInteger(v) ? { integerValue: String(v) } : { doubleValue: v };
  if (typeof v === 'string') return { stringValue: v };
  if (Array.isArray(v)) return { arrayValue: v.length ? { values: v.map(val) } : {} };
  return { mapValue: { fields: Object.fromEntries(Object.entries(v).map(([k, x]) => [k, val(x)])) } };
};
async function put(path, data) {
  if (DRY) { console.log('DRY', path, Object.keys(data).length, 'fields'); return; }
  const r = await fetch(`${BASE}/${path}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ fields: val(data).mapValue.fields }) });
  if (!r.ok) throw new Error(`${path}: ${r.status} ${(await r.text()).slice(0, 300)}`);
}
const V = `venues/${VENUE}`;
await put(`venueRegistry/${VENUE}`, { name: 'Riverside Arena (demo)', status: 'active', demo: true, createdAt: at(60) });
for (const u of USERS) await put(`${V}/users/${u.badgeHash}`, u);
await put(`${V}/sharedMemory/venueSettings`, venueSettings);
await put(`${V}/sharedMemory/kitchenRegistry`, kitchenRegistry);
await put(`${V}/sharedMemory/equipmentRegistry`, equipmentRegistry);
for (const r of INSPECTIONS) await put(`${V}/inspections/${r.id}`, r);
for (const h of HACCP) await put(`${V}/haccpSubmissions/${h.id}`, h);
console.log(`${DRY ? 'would write' : 'wrote'}: ${USERS.length} users, ${STANDS.length} stands, ${Object.keys(equipmentRegistry.items).length} units, ${INSPECTIONS.length} reports, ${HACCP.length} stand logs → ${V}`);
console.log(`demo: ${SITE}?v=${VENUE}`);
for (const [role, t] of Object.entries(TOKENS)) console.log(`  ${role}: ${SITE}?v=${VENUE}&invite=${t}`);
