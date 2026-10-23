// Seeds the public demo venue: a made-up arena with 12 stands, demo sign-ins, sample reports,
// stand temperature logs and equipment, so anyone can try SDX Inspect with no setup.
//   node tools/demo/seed-demo.mjs            → writes (re-run any time to refresh the dates)
//   node tools/demo/seed-demo.mjs --dry      → prints what it would write
// It only ever writes under venues/<VENUE>/… and venueRegistry/<VENUE>; never the home venue.
// The data itself lives in demo-data.mjs (no side effects), so other tools can read it.
import { VENUE, SITE, STANDS, USERS, TOKENS, venueSettings, kitchenRegistry, equipmentRegistry, INSPECTIONS, HACCP, at } from './demo-data.mjs';
export { VENUE, SITE, STANDS, USERS, TOKENS };

const BASE = 'https://firestore.googleapis.com/v1/projects/sodexoinspection/databases/(default)/documents';
const DRY = process.argv.includes('--dry');
if (VENUE === 'default') throw new Error('never seed the home venue');

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
await put(`${V}/sharedMemory/contentReports`, { items: {}, removed: {} }); // v570: every re-seed starts the report / block demo clean
for (const r of INSPECTIONS) await put(`${V}/inspections/${r.id}`, r);
for (const h of HACCP) await put(`${V}/haccpSubmissions/${h.id}`, h);
console.log(`${DRY ? 'would write' : 'wrote'}: ${USERS.length} users, ${STANDS.length} stands, ${Object.keys(equipmentRegistry.items).length} units, ${INSPECTIONS.length} reports, ${HACCP.length} stand logs → ${V}`);
console.log(`demo: ${SITE}?v=${VENUE}`);
for (const [role, t] of Object.entries(TOKENS)) console.log(`  ${role}: ${SITE}?v=${VENUE}&invite=${t}`);
