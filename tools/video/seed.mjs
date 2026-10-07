// Demo data for the system-tour recording — neutral names, fake 305-555 phones, no company branding.
import { createHash } from 'crypto';
import { readFileSync } from 'fs';
export const sha = s => createHash('sha256').update('sdx_badge_v2_' + s).digest('hex');
const TZ = 'America/New_York';
export const dayStr = (n = 0) => new Date(Date.now() - n * 864e5).toLocaleDateString('en-CA', { timeZone: TZ });
const iso = (n, h = 15) => { const d = new Date(Date.now() - n * 864e5); d.setHours(h, 20, 0, 0); return d.toISOString(); };
const photo = (id, thumb, tag) => ({ id, thumbUrl: thumb, previewUrl: thumb, ...(tag ? { tag } : {}) });
const svgData = f => 'data:image/svg+xml;base64,' + Buffer.from(readFileSync(new URL(f, import.meta.url))).toString('base64');
export const LOGO_WHITE = svgData('./logo-white.svg');
export const LOGO_DARK = svgData('./logo-dark.svg');
export const INSPECTOR = 'Joxel Da Silva';

export function buildHistory(p) {
  const rep = (id, site, unit, floor, lt, n, items, extra = {}) => ({
    id, siteName: site, siteNumber: unit, floor, locationType: lt, inspectionDate: dayStr(n), savedAt: iso(n), inspectorName: INSPECTOR,
    inspectionType: 'Regular Inspection', overallStatus: items.length ? 'Needs Attention' : 'Pass', supervisorName: 'Stand supervisor',
    actionItems: items.map(x => ({ priority: 'Medium', ...x })), photos: items.flatMap(x => x.photos || []), ...extra,
  });
  return [
    rep('r1', 'MAGIC CITY DOGS', '114', 'Floor 1', 'Concession', 2, [
      { issue: 'Facilities – Hand Sink: faucet leaking under the sink, water on the floor', area: 'Back of the house', notes: 'Left hand sink', corrective: 'Put a bucket, called maintenance', photos: [photo('p1', p.faucet)] },
      { issue: 'Cleaning: grease build-up under the fryer', area: 'Back of the house', corrective: 'Told the supervisor', photos: [photo('p2', p.grease)] },
    ], { restaurantLicense: 'NOS2319802' }),
    rep('r2', 'FAN FAVORITES', '327', 'Floor 3', 'Concession', 9, [
      { issue: 'Facilities – Lighting: light out over the prep table', notes: 'Two fixtures', photos: [photo('p3', p.light)] },
    ]),
    rep('r3', 'CRISPPIS CHICKEN', '329', 'Floor 3', 'Subcontractor', 1, [
      { issue: 'Pest Control: droppings behind the ice machine', notes: 'Call pest vendor', photos: [photo('p4', p.pest)] },
      { issue: 'Ecolab / Chemicals: sanitizer dispenser empty', photos: [photo('p5', p.sanitizer)] },
    ]),
    rep('r4', 'SOL CUBANO', '350', 'Floor 3', 'Concession', 3, [
      { issue: 'Facilities – Plumbing: floor drain draining slow, backing up', notes: 'Behind the 3-compartment sink', photos: [photo('p6', p.drain)] },
    ]),
    rep('r5', 'WYNWOOD', '142', 'Floor 1', 'Concession', 5, [
      { issue: 'Facilities – Ice machine: power cable chewed behind the ice machine, not working', photos: [photo('p7', p.cable)] },
    ]),
    rep('r6', 'NOVECENTO', '134', 'Floor 1', 'Concession', 12, [
      { issue: 'Cleaning: hood filters greasy', area: 'Hood', photos: [photo('p8', p.grease)] },
    ]),
    rep('r7', 'LITTLE CAESAR', '345', 'Floor 3', 'Concession', 6, []),
    rep('r8', 'SEED', '332', 'Floor 3', 'Subcontractor', 4, [
      { issue: 'Cleaning: floor under the prep table dirty', area: 'Back of the house', photos: [photo('p9', p.floor)] },
    ]),
  ];
}

export const users = [
  { badgeHash: sha('448800'), name: INSPECTOR, department: 'Inspection', badgeDisplay: '••••8800', role: 'inspector', requestedRole: 'inspector', approved: true, registeredAt: iso(60) },
  { badgeHash: sha('365582'), name: 'Jordan Lee', department: 'Inspection', badgeDisplay: '••••5582', role: 'global_admin', requestedRole: 'global_admin', approved: true, registeredAt: iso(60) },
  { badgeHash: sha('777001'), name: 'LUIS M.', department: 'Maintenance / Facilities', badgeDisplay: '••••7001', role: 'maintenance', requestedRole: 'maintenance', approved: true, registeredAt: iso(30) },
  { badgeHash: sha('777002'), name: 'ANA R.', department: 'Cleaning', badgeDisplay: '••••7002', role: 'cleaning', requestedRole: 'cleaning', approved: true, registeredAt: iso(30) },
  { badgeHash: sha('777003'), name: 'CARLOS E.', department: 'Ecolab', badgeDisplay: '••••7003', role: 'ecolab', requestedRole: 'ecolab', approved: true, registeredAt: iso(30) },
];

export const venueSettings = () => ({
  recheckDays: 7,
  companyName: 'SDX Inspect', logoUrl: LOGO_WHITE, logoDarkUrl: LOGO_DARK,
  inviteTokens: { maintenance: 'tokm', cleaning: 'tokc', ecolab: 'toke', inspector: 'toki' },
  eventDays: { [dayStr(0)]: 'GAME DAY', [dayStr(2)]: 'GAME DAY', [dayStr(5)]: 'GAME DAY' },
});

const R = (t, n, u, s, extra = {}) => [t, { assetTag: t, label: n, unit: u, venueName: s, locType: 'Concession', brandName: extra.brand || '', location: extra.location || '', standId: extra.standId || '', ...extra }];
export const regdoc = {
  items: Object.fromEntries([
    R('SDX-CL-114-1', '2-DOOR COOLER', '114', 'MAGIC CITY DOGS', { standId: 'u:114', brand: 'DELFIELD', location: 'BACK OF HOUSE' }),
    R('SDX-FZ-114-1', 'REACH-IN FREEZER', '114', 'MAGIC CITY DOGS', { standId: 'u:114', brand: 'TRUE', location: 'BACK OF HOUSE' }),
    R('SDX-CL-114-2', 'DISPLAY COOLER', '114', 'MAGIC CITY DOGS', { standId: 'u:114', brand: 'TRUE', location: 'FRONT LINE' }),
    R('SDX-CL-150A-1', 'WALK-IN COOLER', '150A', 'WYNWOOD WALKTHROUGH', {}),
    R('SDX-CL-150A-2', '2-DOOR COOLER', '150A', 'WYNWOOD WALKTHROUGH', {}),
    R('SDX-CL-327-1', 'PREP COOLER', '327', 'FAN FAVORITES', { brand: 'DELFIELD' }),
  ]), labelIndex: {}, hidden: {},
};

export const haccpSubs = () => {
  const base = { type: 'submission', reportId: '', temps: { hotHolding: ['150'] }, foodNames: {}, tempCorrections: {}, tempTimes: {}, itemLabels: {}, customItems: [] };
  const at = n => { const d = new Date(Date.now() - n * 864e5); d.setHours(14, 30, 0, 0); return d.toISOString(); };
  return [
    ...[0, 2, 5].map(n => ({ ...base, id: 'm' + n, supervisorName: 'Maria P.', supervisorPhone: '305-555-0101', site: 'MAGIC CITY DOGS', unit: '114', submittedAt: at(n) })),
    ...[0, 2].map(n => ({ ...base, id: 's' + n, supervisorName: 'Kim T.', supervisorPhone: '305-555-0144', site: 'SOL CUBANO', unit: '350', submittedAt: at(n) })),
    { ...base, id: 'f5', supervisorName: 'Dee W.', supervisorPhone: '305-555-0177', site: 'FAN FAVORITES', unit: '327', submittedAt: at(5) },
  ];
};

export const msgThreads = [];

// Records that arrive from the stand QR pages today (for "From the stands")
export const feedRecords = () => {
  const t = m => new Date(Date.now() - m * 60000).toISOString();
  const rec = (id, extra) => ({ id, source: 'haccp_portal', supervisorLog: true, inspectionType: 'Supervisor Log', locationType: 'Concession', haccpTempCount: 0, actionItems: [], suppliesNeeded: [], ...extra });
  return [
    rec('fd1', { siteName: 'MAGIC CITY DOGS', siteNumber: '114', supervisorName: 'Maria P.', sitePhone: '305-555-0101', savedAt: t(12), haccpTempCount: 3, haccpOutOfRange: 1, haccpReadings: [{ label: 'Hot holding', value: '150', ok: true, min: 135 }, { label: '2-door cooler', value: '44', ok: false, max: 40, corrective: 'Moved the food to the walk-in, called maintenance' }, { label: 'Poultry', value: '170', ok: true }] }),
    rec('fd2', { siteName: 'SOL CUBANO', siteNumber: '350', supervisorName: 'Kim T.', sitePhone: '305-555-0144', savedAt: t(25), haccpTempCount: 4, suppliesNeeded: [{ item: 'Test strips', qty: '2', urgent: true, fromPortal: true }, { item: 'Paper towels', qty: '3', fromPortal: true }] }),
    rec('fd3', { siteName: 'FAN FAVORITES', siteNumber: '327', supervisorName: 'Dee W.', sitePhone: '305-555-0177', savedAt: t(48), haccpTempCount: 5 }),
    rec('fd4', { siteName: 'NOVECENTO', siteNumber: '134', supervisorName: 'Rosa G.', sitePhone: '305-555-0188', savedAt: t(70), haccpTempCount: 2, suppliesNeeded: [{ item: 'Ecolab Detergent', qty: '1', fromPortal: true }] }),
  ];
};
