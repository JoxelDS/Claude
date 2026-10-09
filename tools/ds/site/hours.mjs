// BUILD-TIME hours parser (Node, no deps). Human hour strings (EN / ES) → a compact model the page ships as JSON,
// plus schema.org openingHoursSpecification. The page shows the ORIGINAL strings; the model only drives the
// "Open now" pill, the today-row highlight and JSON-LD. Anything it cannot read becomes a note — never a guess.
//
// model = {
//   k:  'hours' | 'classes' | 'days' | 'none',
//   iv: [[day, startMin, endMin, whereIdx]]   day 0=Sun..6=Sat, minutes from local midnight, endMin may be > 1440 (past midnight)
//   st: [[day, startMin, labelIdx]]           class start times (k='classes')
//   open: [days], closed: [days],             explicit day sets (k='days' uses open/closed only)
//   w:  ['14700 SW 88 St'], lb: ['BOOTYCAMP'] location / class labels
//   rows: [[days...] | null]                   per input line, the days it covers (for the today highlight)
//   notes: ['Walk-ins welcome']
// }

const DAY_RE = /\b(mon(?:day)?s?|tue(?:s|sday)?s?|wed(?:nesday)?s?|thu(?:r|rs|rsday)?s?|fri(?:day)?s?|sat(?:urday)?s?|sun(?:day)?s?|lun(?:es)?|mar(?:tes)?|mie(?:rcoles)?|jue(?:ves)?|vie(?:rnes)?|sab(?:ados?)?|dom(?:ingos?)?)\b/g;
const DAY_IDX = { mon: 1, tue: 2, wed: 3, thu: 4, fri: 5, sat: 6, sun: 0, lun: 1, mar: 2, mie: 3, jue: 4, vie: 5, sab: 6, dom: 0 };
const EVERY_RE = /\b(every ?day|daily|7 days(?: a week)?|todos los dias|diario|a diario|lunes a domingo|mon(?:day)?\s*-\s*sun(?:day)?)\b/;
const OPEN24_RE = /\b(24 ?hours|24 ?hrs|24\/7|24 horas|abierto 24)\b/;
const CLOSED_RE = /\b(closed|cerrado|cerrada|no classes|sin clases|no hay clases)\b/;
const T = String.raw`(?:(noon|midnight|mediodia|medianoche)|(\d{1,2})(?::([0-5]\d))?\s*(a\.?\s?m\.?|p\.?\s?m\.?)?)`;
const RANGE_RE = new RegExp(String.raw`(?<![\d:])${T}(?!\d)\s*(?:-|to|until|till|a|al|hasta)\s*(?<![\d:])${T}(?!\d)`, 'g');
const LIST_RE = /(?<![\d:])((?:\d{1,2}(?::[0-5]\d)?\s*(?:,|&|and|y)\s*)*\d{1,2}(?::[0-5]\d)?)\s*(a\.?\s?m\.?|p\.?\s?m\.?)(?![a-z])/g;

// length-preserving fold: lower-case + strip accents char by char, so match indexes map back onto the original string
const fold = s => [...s].map(c => { const b = c.normalize('NFD'); return b.length > c.length ? b[0] : c; }).join('').toLowerCase()
  .replace(/[‒-―−]/g, '-');

const mer = m => (m ? (m[0] === 'p' ? 'pm' : 'am') : '');
function toMin(word, h, mm, m) {                     // → {min, mer, colon} or null
  if (word) return { min: /noon|mediodia/.test(word) ? 720 : 0, mer: 'x', colon: true };
  const H = +h, M = mm ? +mm : 0; if (H > 24 || M > 59) return null;
  return { H, M, mer: mer(m), colon: !!mm };
}
const clock = (H, M, m) => (m === 'am' ? (H % 12) : m === 'pm' ? (H % 12) + 12 : H) * 60 + M;

function rangeMinutes(a, b) {                        // infers missing am/pm; returns [start, end] with end > start (may pass 1440)
  if (!a || !b) return null;
  if (!a.mer && !b.mer && !a.colon && !b.colon) return null;   // "5 - 9" alone is ambiguous → note, not a guess
  let s, e;
  const A = a.mer === 'x' ? a.min : null, B = b.mer === 'x' ? b.min : null;
  if (A != null) s = A; if (B != null) e = B === 0 ? 1440 : B;
  if (s == null) {
    if (a.mer) s = clock(a.H, a.M, a.mer);
    else if (b.mer && b.mer !== 'x') { s = clock(a.H, a.M, b.mer); const eb = clock(b.H, b.M, b.mer); if (s > eb && a.H <= 12) s = clock(a.H, a.M, b.mer === 'pm' ? 'am' : 'pm'); }
    else s = a.H * 60 + a.M;                                     // 24-h "18:00"
  }
  if (e == null) {
    if (b.mer) e = clock(b.H, b.M, b.mer);
    else if (a.mer && a.mer !== 'x') { e = clock(b.H, b.M, a.mer); if (e <= s) e = clock(b.H, b.M, a.mer === 'am' ? 'pm' : 'am'); }
    else { e = b.H * 60 + b.M; if (e <= s && b.H < 12) e += 720; }  // "9:00 - 5:00" → 9–17
  }
  if (e <= s) e += 1440;                                         // past midnight: "5pm – 12:30am" → 17:00–24:30
  return [s, e];
}

function daysIn(f) {                                  // day set from a folded string with ranges ("mon-fri", "lunes a viernes") and lists
  if (EVERY_RE.test(f)) return [0, 1, 2, 3, 4, 5, 6];
  const toks = [...f.matchAll(DAY_RE)].map(m => ({ d: DAY_IDX[m[1].slice(0, 3)], i: m.index, j: m.index + m[0].length }));
  if (!toks.length) return null;
  const out = new Set([toks[0].d]);
  for (let k = 1; k < toks.length; k++) {
    const gap = f.slice(toks[k - 1].j, toks[k].i).trim();
    if (/^(-|to|through|thru|a|al|hasta)$/.test(gap)) { for (let d = toks[k - 1].d; d !== toks[k].d; d = (d + 1) % 7) out.add(d); }
    out.add(toks[k].d);
  }
  return [...out].sort((x, y) => x - y);
}

function blank(f, re, cb) { return f.replace(re, (...m) => { cb && cb(m); return ' '.repeat(m[0].length); }); }

export function parseHours(lines = [], { title = '', niche = '' } = {}) {
  const model = { k: 'none', iv: [], st: [], op: [], open: [], closed: [], w: [], lb: [], rows: [], notes: [] };
  const classHint = /class|clase/i.test(title) || niche === 'fitness';   // a lone start time elsewhere = "opens at" ("desde las 7pm", "2:30PM – until")
  const placeHint = /location|ubicaci|sede|local/i.test(title);
  let inherit = null;                                 // days from a days-only line ("Open every day") for following time-only lines
  for (const raw of lines || []) {
    const line = String(raw).trim(); let f = fold(line);
    const mask = [...f].map(() => false);             // which chars were understood (the rest may be a label)
    const keep = (i, n) => { for (let x = i; x < i + n; x++) mask[x] = true; };
    const ranges = [], lists = [];
    f = blank(f, RANGE_RE, m => { const idx = m[m.length - 2]; keep(idx, m[0].length);
      ranges.push(rangeMinutes(toMin(m[1], m[2], m[3], m[4]), toMin(m[5], m[6], m[7], m[8]))); });
    f = blank(f, LIST_RE, m => { const idx = m[m.length - 2]; keep(idx, m[0].length);
      const ap = mer(m[2]); lists.push(...m[1].split(/\s*(?:,|&|and|y)\s*/).map(x => { const [H, M] = x.split(':'); return clock(+H, +(M || 0), ap); })); });
    const open24 = OPEN24_RE.test(f) && !ranges.some(Boolean);
    if (open24) keep(0, f.length);
    const closed = CLOSED_RE.test(f);
    let days = daysIn(f);
    for (const re of [DAY_RE, EVERY_RE, CLOSED_RE, /\b(open|abierto|abiertos|from|de|desde|through|thru|to|al|and|y)\b/g])
      for (const m of f.matchAll(new RegExp(re.source, 'g'))) keep(m.index, m[0].length);
    const label = [...line].filter((c, i) => !mask[i]).join('').replace(/[·|:,&\-–—\s]+/g, ' ').trim()
      .replace(/^(a|y|e)\s+|\s+(a|y|e)$/gi, '').trim();
    const good = ranges.filter(Boolean); if (open24) good.push([0, 1440]);
    const unread = ranges.some(r => !r);                // digits we could not read ("10 a 2") → keep the line as a note, never guess
    if (closed && days) { model.closed.push(...days); model.rows.push(days); continue; }
    if (unread) model.notes.push(line);
    if (!good.length && !lists.length) {
      if (unread) { model.rows.push(days); continue; }
      if (days) { inherit = days; model.open.push(...days); model.rows.push(days); if (label && label.length > 2 && !/^(every ?day)$/i.test(label)) model.notes.push(line); }
      else { model.rows.push(null); model.notes.push(line); }
      continue;
    }
    const d = days || inherit || [0, 1, 2, 3, 4, 5, 6];
    model.rows.push(d);
    if (good.length) {
      let wi = -1; if (label && label.length > 2 && (placeHint || /\d/.test(label))) { wi = model.w.indexOf(label); if (wi < 0) wi = model.w.push(label) - 1; }
      for (const day of d) for (const [s, e] of good) model.iv.push(wi < 0 ? [day, s, e] : [day, s, e, wi]);
    }
    if (lists.length === 1 && !good.length && !classHint) { for (const day of d) model.op.push([day, lists[0]]); }
    else if (lists.length && (classHint || lists.length > 1 || !good.length)) {
      let li = -1; if (label && label.length > 2) { li = model.lb.indexOf(label); if (li < 0) li = model.lb.push(label) - 1; }
      for (const day of d) for (const s of lists) model.st.push(li < 0 ? [day, s] : [day, s, li]);
    }
  }
  model.open = [...new Set(model.open)].sort(); model.closed = [...new Set(model.closed)].sort();
  model.k = model.st.length ? 'classes' : model.iv.length ? 'hours' : model.op.length ? 'opens' : (model.open.length || model.closed.length) ? 'days' : 'none';
  return model;
}

// schema.org openingHoursSpecification. Groups days that share the same intervals. Past midnight = one spec whose closes
// is earlier than opens (Google's own example: Saturday 18:00 → 03:00). Closed days are OMITTED (schema.org: no opens = closed).
// Class start times are NOT opening hours → nothing is emitted for k='classes' or k='days' (no times known).
const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const hhmm = m => { m = ((m % 1440) + 1440) % 1440; return String(Math.floor(m / 60)).padStart(2, '0') + ':' + String(m % 60).padStart(2, '0'); };
export function openingHoursSpec(model, whereIdx) {
  if (model.k !== 'hours') return [];
  const byDay = {};
  for (const [d, s, e, w] of model.iv) if ((w ?? -1) === (whereIdx ?? -1)) (byDay[d] ||= []).push(s === 0 && e >= 1439 ? [0, 1439] : [s, e]);
  const groups = new Map();
  for (const d of [1, 2, 3, 4, 5, 6, 0]) if (byDay[d]) for (const [s, e] of byDay[d]) {
    const key = s + '-' + e; if (!groups.has(key)) groups.set(key, { s, e, days: [] }); groups.get(key).days.push(DAYS[d]);
  }
  return [...groups.values()].map(g => ({ '@type': 'OpeningHoursSpecification', dayOfWeek: g.days.length === 1 ? g.days[0] : g.days,
    opens: hhmm(g.s), closes: g.e === 1439 || g.e === 1440 ? '23:59' : hhmm(g.e) }));
}

// minified copy of the model for the page (drop empties)
export function compactModel(m) {
  const o = { k: m.k, rows: m.rows };
  for (const key of ['iv', 'st', 'op', 'open', 'closed', 'w', 'lb']) if (m[key].length) o[key] = m[key];
  return o;
}
