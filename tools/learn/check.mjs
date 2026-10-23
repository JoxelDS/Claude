// node tools/learn/check.mjs  → checks the Learn content before it is built or voiced.
// course.json (food safety) and guide.json (how to use the app):
//  - English and Spanish both present and the same length everywhere (lists, quizzes, beats)
//  - quiz answers point at a real option, and the right answer is not always in the same place
//  - every Food Code reference looks like one (e.g. 3-501.16) and every fact has a source
//  - every button / screen label in guide.json is written word for word in src/App.jsx
//  - no banned names anywhere: the employer, the venue, real stands, DS Marketing, Joxel, certification bodies
// Exit code 1 when anything fails. Warnings do not fail.
import fs from 'fs';
import path from 'path';

const ROOT = path.resolve(new URL('../..', import.meta.url).pathname);
const rd = (p) => JSON.parse(fs.readFileSync(path.join(ROOT, p), 'utf8'));
const course = rd('docs/training/food-handler/course.json');
const guidePath = path.join(ROOT, 'docs/training/app-guide/guide.json');
const guide = fs.existsSync(guidePath) ? JSON.parse(fs.readFileSync(guidePath, 'utf8')) : null;
const app = fs.readFileSync(path.join(ROOT, 'src/App.jsx'), 'utf8');

const errors = [], warns = [];
const err = (where, msg) => errors.push(`${where}: ${msg}`);
const warn = (where, msg) => warns.push(`${where}: ${msg}`);

// ---- banned names: fixed words + the real stand names from the home license sheet (generic food words left out)
const GENERIC = new Set(['arepa cart', 'shawarma', 'seed', 'cantaloupe', 'nine', 'hot dog', 'kosher hot dog', 'main kitchen', 'suite kitchen',
  'walking tacos', 'sweet cream', 'donuts & ice cream', 'fan favorite', 'fan favorites', 'training facility batist.', 'cortadito', 'farmstead', 'puffles']);
// v571: the sheet lives in src/home/seed.js (loaded by the app on the home venue only)
const seedTxt = fs.readFileSync(path.join(ROOT, 'src/home/seed.js'), 'utf8');
const reg = seedTxt.slice(seedTxt.indexOf('registry: ['), seedTxt.indexOf('\n],', seedTxt.indexOf('registry: [')));
const standNames = [...new Set([...reg.matchAll(/name: "([^"]+)"/g)].map((m) => m[1].replace(/\s*\(sub\)/i, '').replace(/\s*\/.*$/, '').trim().toLowerCase()))]
  .filter((n) => n.length > 3 && !GENERIC.has(n));
const BANNED = ['sodexo', 'hard rock', 'ds marketing', 'dsmarketing', 'joxel', 'servsafe', 'prometric', 'national registry of food safety', 'nrfsp', 'magic city', ...standNames];
const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const bannedRe = new RegExp(`(^|[^a-z0-9])(${BANNED.map(esc).join('|')})([^a-z0-9]|$)`, 'i');
function walkStrings(o, where, fn) {
  if (typeof o === 'string') fn(o, where);
  else if (Array.isArray(o)) o.forEach((x, i) => walkStrings(x, `${where}[${i}]`, fn));
  else if (o && typeof o === 'object') for (const [k, v] of Object.entries(o)) { if (k === 'evidence' || k === 'factcheck') continue; walkStrings(v, `${where}.${k}`, fn); }
}
const scanBanned = (o, where) => walkStrings(o, where, (s, w) => {
  const t = s.replace(/https?:\/\/joxelds\.github\.io\/[^\s"]*/gi, '');
  const m = t.match(bannedRe); if (m) err(w, `banned name "${m[2]}"`);
});

// ---- EN / ES parity
function pair(obj, base, where) {
  const en = obj[`${base}_en`], es = obj[`${base}_es`];
  if (en == null && es == null) return;
  if (en == null || es == null) return err(where, `${base}: ${en == null ? 'English' : 'Spanish'} missing`);
  if (Array.isArray(en) !== Array.isArray(es)) return err(where, `${base}: one side is a list, the other is not`);
  if (Array.isArray(en) && en.length !== es.length) err(where, `${base}: ${en.length} English vs ${es.length} Spanish`);
  if (!Array.isArray(en) && (!String(en).trim() || !String(es).trim())) err(where, `${base}: empty text`);
}
function lang2(o, where) { // {en, es} objects
  if (o == null) return;
  if (typeof o !== 'object' || Array.isArray(o)) return err(where, 'expected {en, es}');
  if (o.en == null || o.es == null) return err(where, `${o.en == null ? 'English' : 'Spanish'} missing`);
  if (Array.isArray(o.en) !== Array.isArray(o.es)) return err(where, 'one side is a list, the other is not');
  if (Array.isArray(o.en) && o.en.length !== o.es.length) err(where, `${o.en.length} English vs ${o.es.length} Spanish`);
  if (!Array.isArray(o.en) && (!String(o.en).trim() || !String(o.es).trim())) err(where, 'empty text');
}

// ---- quizzes
const answerSpread = [];
function quizItem(q, where, nOpts) {
  const n = nOpts(q);
  if (!Number.isInteger(q.answer) || q.answer < 0 || q.answer >= n) err(where, `answer ${q.answer} is not one of the ${n} options`);
  answerSpread.push(q.answer);
}

// ---- course.json
const CODE_RE = /\b[1-8]-\d{3}\.\d{2,3}\b/;
pair(course, 'title', 'course');
course.lessons.forEach((l, li) => {
  const w = `course.${l.id}`;
  pair(l, 'title', w); pair(l, 'objectives', w); pair(l, 'keypoints', w);
  if (!Array.isArray(l.beats) || l.beats.length < 6) err(w, 'fewer than 6 beats');
  (l.beats || []).forEach((b, bi) => { pair(b, 'onscreen', `${w}.beat${b.beat ?? bi + 1}`); pair(b, 'say', `${w}.beat${b.beat ?? bi + 1}`); });
  if (!Array.isArray(l.quiz) || l.quiz.length !== 5) err(w, `quiz has ${l.quiz?.length ?? 0} questions (5 expected)`);
  (l.quiz || []).forEach((q, qi) => { const qw = `${w}.quiz${qi + 1}`; pair(q, 'q', qw); pair(q, 'options', qw); pair(q, 'why', qw); quizItem(q, qw, (x) => (x.options_en || []).length); });
  if (!Array.isArray(l.facts) || !l.facts.length) err(w, 'no facts');
  (l.facts || []).forEach((f, fi) => {
    if (!f.claim || !f.source) err(`${w}.fact${fi + 1}`, 'claim or source missing');
    if (/food code/i.test(f.source || '') && !CODE_RE.test(f.source) && !/annex|chapter|preface|not a food code|not specified/i.test(f.source)) warn(`${w}.fact${fi + 1}`, `Food Code source without a section number: ${f.source.slice(0, 80)}`);
  });
  // every quiz "why" that cites the Food Code uses a real-looking section number
  (l.quiz || []).forEach((q, qi) => { for (const k of ['why_en', 'why_es']) if (/food code|código de alimentos/i.test(q[k] || '') && !CODE_RE.test(q[k])) warn(`${w}.quiz${qi + 1}`, `${k} names the Food Code without a section`); });
});
scanBanned({ ...course, factcheck: undefined }, 'course');

// ---- guide.json
let uiChecked = 0;
if (guide) {
  const visible = app; // labels must appear in the app's source text
  for (const r of guide.roles || []) {
    const w = `guide.${r.id}`;
    lang2(r.title, `${w}.title`); lang2(r.who, `${w}.who`); lang2(r.intro, `${w}.intro`);
    if (!r.icon) warn(w, 'no icon'); if (!r.demo) err(w, 'no demo link');
    if (r.demo && !/^https:\/\/joxelds\.github\.io\/Claude\/\?v=riverside-demo(&|$)/.test(r.demo)) err(w, `demo link is not the riverside demo: ${r.demo}`);
    (r.steps || []).forEach((s, si) => {
      const sw = `${w}.${s.id || si}`;
      lang2(s.title, `${sw}.title`); lang2(s.do, `${sw}.do`); if (s.tip) lang2(s.tip, `${sw}.tip`); if (s.say) lang2(s.say, `${sw}.say`);
      if (s.try?.note) lang2(s.try.note, `${sw}.try.note`);
      if (s.try?.href && !/^https:\/\/joxelds\.github\.io\/Claude\/\?v=riverside-demo(&|$)/.test(s.try.href)) err(sw, `try link is not the riverside demo: ${s.try.href}`);
      if ((s.do?.en || []).length > 6) warn(sw, `${s.do.en.length} things to do (keep it ≤ 5)`);
      for (const k of ['en', 'es']) { const n = (s.say?.[k] || '').split(/\s+/).filter(Boolean).length; if (n > 40) warn(sw, `say.${k} is ${n} words (≤ 35 for the video)`); }
      for (const label of s.ui || []) {
        uiChecked++;
        const plain = label.trim();
        if (!visible.includes(plain)) err(sw, `UI label not found in src/App.jsx: "${plain}"`);
      }
    });
    if (!Array.isArray(r.check) || r.check.length !== 3) err(w, `check has ${r.check?.length ?? 0} questions (3 expected)`);
    (r.check || []).forEach((q, qi) => { const qw = `${w}.check${qi + 1}`; lang2(q.q, `${qw}.q`); lang2(q.options, `${qw}.options`); lang2(q.why, `${qw}.why`); quizItem(q, qw, (x) => (x.options?.en || []).length); });
    // Spanish uses "usted": flag the common tú forms
    walkStrings({ t: r.title, w: r.who, i: r.intro, s: r.steps, c: r.check }, w, (s, sw) => {
      if (!/\.es\b|\.es\[/.test(sw)) return;
      const m = s.match(/(^|[\s¡¿«(])(tú|tienes|puedes|quieres|haces|abre tu|toca tu|tu nombre|tus\b)/i);
      if (m && !/«[^»]*\b(tu|tus)\b[^»]*»/i.test(s)) warn(sw, `Spanish "${m[2]}" (tú form?) — the guide uses usted, except words quoted from the app`);
    });
  }
  scanBanned(guide.roles, 'guide');
}

// ---- answer spread
const counts = answerSpread.reduce((a, x) => (a[x] = (a[x] || 0) + 1, a), {});
const top = Math.max(...Object.values(counts));
if (answerSpread.length && top / answerSpread.length > 0.45) warn('quizzes', `the right answer is option ${Object.keys(counts).find((k) => counts[k] === top)} in ${top} of ${answerSpread.length} questions`);

for (const w of warns) console.log('⚠ ' + w);
for (const e of errors) console.log('✗ ' + e);
console.log(`check: ${course.lessons.length} lessons, ${guide ? guide.roles.length + ' role guides, ' + uiChecked + ' UI labels' : 'no guide.json'}, ${answerSpread.length} quiz questions (answers by position ${JSON.stringify(counts)}) — ${errors.length} errors, ${warns.length} warnings`);
process.exit(errors.length ? 1 : 0);
