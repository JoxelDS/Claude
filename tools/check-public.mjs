#!/usr/bin/env node
// v571 — the public-site guard. Runs after `npm run build` (and in .github/workflows/deploy.yml before the upload):
// fails when anything that must never be public is in dist/ —
//   • the employer / venue / a competitor named, real license numbers, the home venue's stand names, real people;
//   • session-recording, heat-map or ad-pixel scripts (we never record sessions);
//   • Google Fonts (fonts are self-hosted);
//   • files we removed on purpose coming back.
// The home venue's own data chunk (built from src/home/seed.js) is the one file allowed to hold the sheet.
// Usage: node tools/check-public.mjs [distDir]
import fs from 'fs';
import path from 'path';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const DIST = path.resolve(process.argv[2] || path.join(ROOT, 'dist'));
if (!fs.existsSync(DIST)) { console.error(`check-public: ${DIST} not found — build first`); process.exit(2); }

// The home stand names come from the sheet itself, so the list never has to be typed into this public repo by hand.
const seedTxt = fs.readFileSync(path.join(ROOT, 'src/home/seed.js'), 'utf8');
const reg = seedTxt.slice(seedTxt.indexOf('registry: ['), seedTxt.indexOf('\n],', seedTxt.indexOf('registry: [')));
// generic food / place words that are not a stand's identity (same idea as tools/learn/check.mjs)
const GENERIC = new Set(['arepa cart', 'shawarma', 'seed', 'cantaloupe', 'nine', 'hot dog', 'kosher hot dog', 'main kitchen', 'suite kitchen',
  'walking tacos', 'sweet cream', 'donuts & ice cream', 'fan favorite', 'fan favorites', 'training facility batist.', 'training facility',
  'cortadito', 'farmstead', 'puffles', 'pantry', 'bar', 'kitchen', 'lemonade cart', 'italian vice', 'stacked', 'tostitos']);
const standNames = [...new Set([...reg.matchAll(/name: "([^"]+)"/g)]
  .map(m => m[1].replace(/\s*\(sub\)/i, '').replace(/\s*\/.*$/, '').replace(/\s*&.*$/, '').trim().toLowerCase()))]
  .filter(n => n.length > 4 && !GENERIC.has(n));

const esc = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const word = list => new RegExp(`(^|[^a-z0-9])(${list.map(esc).join('|')})([^a-z0-9]|$)`, 'i');

// Firebase project id: allowed ONLY as the project config until the move to the LLC project (NOW 7). Strip it first.
const ALLOW = [/sodexoinspection(\.firebaseapp\.com|\.firebasestorage\.app)?/g];
const HARD = [
  { re: word(['sodexo', 'hard rock', 'aramark', 'levy restaurants', 'joxel da silva', 'j. da silva', 'dolphins', 'don shula', 'miami gardens']), why: 'employer / venue / real person' },
  { re: /\bNOS\d{7}\b/, why: 'a real license number' },
  { re: /(hotjar\.com|fullstory\.com|clarity\.ms|logrocket|mouseflow|smartlook|posthog|rrweb|replayIntegration|googletagmanager\.com|google-analytics\.com|\bgtag\(\s*['"]|\bfbq\(|\bttq\.load)/, why: 'session recording / analytics / ad pixel' },
  { re: /fonts\.(googleapis|gstatic)\.com/i, why: 'Google Fonts (self-host instead)' },
];
const STANDS = { re: word(standNames), why: 'a home-venue stand name' };
const BLOCKED_FILES = ['aramark-logo.svg', 'aramark-dark.svg', 'marketing/video/sdx-explainer.mp4', 'marketing/video/sdx-explainer.jpg', 'review/sdx-inspect-review.mp4'];
const WARN = [{ re: /joxelpanita@gmail\.com/i, why: 'personal email on a public page (use the business address when it exists)' }];

const TEXT = /\.(js|mjs|css|html?|json|txt|svg|xml|webmanifest|map)$/i;
const errors = [], warns = new Map();
const walk = d => fs.readdirSync(d, { withFileTypes: true }).flatMap(e => e.isDirectory() ? walk(path.join(d, e.name)) : [path.join(d, e.name)]);
for (const f of walk(DIST)) {
  const rel = path.relative(DIST, f).split(path.sep).join('/');
  if (BLOCKED_FILES.includes(rel)) { errors.push(`${rel}: this file was removed on purpose`); continue; }
  if (!TEXT.test(f)) continue;
  let t = fs.readFileSync(f, 'utf8');
  for (const a of ALLOW) t = t.replace(a, '');
  const isSeedChunk = /^assets\//.test(rel) && /registry:\s*\[/.test(t) && /aliases:\s*\{/.test(t);
  const isDsPreview = rel.startsWith('p/'); // DS Marketing previews show real businesses by design — brand words only
  for (const r of HARD) {
    if (isSeedChunk && r.why !== 'session recording / analytics / ad pixel' && r.why !== 'Google Fonts (self-host instead)') continue;
    const m = t.match(r.re); if (m) errors.push(`${rel}: ${r.why} — "${(m[2] || m[0]).slice(0, 40)}"`);
  }
  if (!isSeedChunk && !isDsPreview) { const m = t.match(STANDS.re); if (m) errors.push(`${rel}: ${STANDS.why} — "${m[2]}"`); }
  for (const w of WARN) if (w.re.test(t)) { const k = w.why; warns.set(k, (warns.get(k) || 0) + 1); }
}
for (const [k, n] of warns) console.warn(`check-public: warning — ${k} (${n} file${n > 1 ? 's' : ''})`);
if (errors.length) {
  console.error(`check-public: ${errors.length} problem(s) in ${path.relative(ROOT, DIST) || DIST}:`);
  for (const e of errors.slice(0, 60)) console.error('  ✗ ' + e);
  process.exit(1);
}
console.log(`check-public: OK — ${path.relative(ROOT, DIST) || DIST} has none of the ${standNames.length} home stand names, no employer / venue words, no license numbers, no recorders, no Google Fonts`);
