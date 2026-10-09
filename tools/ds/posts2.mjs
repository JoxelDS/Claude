// node tools/ds/posts2.mjs posts.json outDir [--offer offer.json]
//   → outDir/<id>.jpg (single) or outDir/<id>-1.jpg … <id>-N.jpg (carousel), 1080×1350 JPEG ≤ 1 MB each,
//     outDir/grid.jpg (3-column profile-grid mock of every post's first slide, in order, 3:4 crop)
//     outDir/manifest.json ({id, files[], alt[]} per post — alt text to paste in the app after posting)
//
// DS Marketing feed generator v2: 12 looks that read as one brand.
//   Fixed on every slide: the DS logo top-left (x 80, white on dark / black on light — the end slide shows it
//   bigger in the same corner), @dsmarketing.agency bottom-right, the footer row at y 1188–1250 (CTA chip on a
//   single post, "Swipe →" on a cover, "02 / 06" + progress bar on inner slides). Top-right 180×110 stays empty
//   (Instagram's carousel counter). Type: Montserrat (display), Instrument Serif (editorial), Inter (body), from
//   public/p/_fonts as data URIs. Palette: ink #0B0B0B, white, paper #F4F0E8 + ONE accent per post:
//   orange #F5A524 · blue #2EA8F5 · green #3DDC84 · gold #D4A853 (accent fills always carry black text).
//
// posts.json = [{
//   id: "myth-ig-enough",             // file name stem
//   kind: "educational" | "relatable" | "question" | "offer" | "demo" | "process" | "myth" | "checklist" | "tip",
//   look: "torn" | "block" | "editorial" | "number" | "photo" | "split" | "paper" | "chat" | "myth" | "ask" | "dicho" | "tips",
//   lang: "en" | "es",                 // chrome strings (Swipe / Desliza, SAMPLE / MUESTRA …) and the default CTA
//   format: "single" | "carousel",     // carousel = 2–10 slides: slide 1 cover (hook + swipe cue), middle slides
//                                      //   numbered, the LAST slide is the CTA slide (big logo + cta)
//   accent: "orange" | "blue" | "green" | "gold",   // optional, else the look's default
//   cta: "Save this",                  // optional, else by kind (Save this / Send this to an owner / DM “WEBSITE”)
//   slides: [{
//     headline: "Your *Instagram* is a flyer",   // *word* = the look's emphasis; \n = line break
//     lines: ["…", "…"],                          // body lines (≤ 30 words per slide)
//     source: "Pew Research Center, 2025",        // REQUIRED when a slide shows a statistic (any %): the fact must be
//                                                 //   in the verified facts list; printed as "Source: …"
//     visual: {…}                                 // per look, see below (fields may also sit on the slide itself)
//   }]
// }]
// Visual fields by look (all optional unless said):
//   torn       screen: "food|beauty|fitness|home" (+ screen2) → two SAMPLE phones; number: "01" on inner slides
//   block      — (giant headline; \n splits the poster lines)
//   editorial  kicker: "FOR FOOD TRUCKS" (small caps line above the headline)
//   number     number: "91%" (required), label: "of U.S. adults own a smartphone"
//   photo      photo: "food-3" (ONLY the niche SAMPLE photos food|beauty|fitness|home-1..3), stickers: ["ARE YOU OPEN?", …≤3]
//   split      before: ["Menu (photo)", …≤6] (the DEMO link list), screen: "beauty" (the SAMPLE site)
//   paper      lines are the checklist rows; "[x] text" = ticked box, plain text = empty box
//   chat       chat: [["them","are you open?","11:42 PM"], ["me","Sorry! Just saw this"]]  or
//              notes: {title: "To-do", items: [[true,"Order supplies"], [false,"Website"]]}
//   myth       myth: "My Instagram is enough.", fact: "…" (cover slide: headline + lines only)
//   ask        options: ["Instagram", "Google / Maps", "A friend"] (A / B / C)
//   dicho      saying: "Camarón que se duerme se lo lleva la corriente." + lines (what it means for the business)
//   tips       items: [{icon: "clock|pin|phone|menu|calendar|link|search|lock|camera|tag|chat|globe", label, sub}] (2–6)
//
// Prices are NEVER typed into posts: write {price.starter} / {price.pro} / {price.care} / {keyword} / {delivery}
// and they come from OFFER below (or --offer offer.json with the same keys). Change the price = edit OFFER, re-render.
//
// Checks printed per slide: OVERFLOW (text did not fit at the minimum size), OVERLAP a×b (marked boxes collide),
// OUTSIDE / SAFE (text past the frame or outside x 80–1000), COUNTER (something in the top-right counter zone of a
// carousel), CONTRAST (< 4.5:1), SMALL (text < 30 px), FOOTER (the CTA runs into the handle), PRICE (a literal $
// amount), STAT (a % with no source), WORDS (body > 30 or headline > 12 words), SIZE (JPEG over 1 MB after
// re-encoding), ERROR (a non-sample photo/screen: that post is skipped). A clean slide prints "ok".
// Doc + one example per look: tools/ds/posts2.md.
import { chromium } from 'playwright-core';
import { mkdirSync, readFileSync, writeFileSync, statSync, existsSync } from 'fs';

export const OFFER = {
  starter: '$500',          // Quick Start: site live on your own domain in 48 hours
  pro: '$1,000',            // Growth Site (Premium Site is $1,500)
  care: '$49',              // care plan, per month
  careUnit: '/month',
  keyword: 'WEBSITE',
  delivery: '48 hours',
};

const ROOT = new URL('../../', import.meta.url).pathname;
const KIT = `${ROOT}public/p/_fonts/`, IMG = `${ROOT}public/p/_img/`, ASSETS = `${ROOT}tools/ds/assets/`;
const LOGO_FILE = `${ROOT}tools/video/ds-logo.png`;
const W = 1080, H = 1350, M = 80;

const argv = process.argv.slice(2);
const flag = k => { const i = argv.indexOf(k); return i >= 0 ? argv.splice(i, 2)[1] : null; };
const offerFile = flag('--offer');
const [SRC, OUT] = argv;
if (!SRC || !OUT) { console.log('usage: node tools/ds/posts2.mjs posts.json outDir [--offer offer.json]'); process.exit(1); }
if (offerFile) Object.assign(OFFER, JSON.parse(readFileSync(offerFile, 'utf8')));
mkdirSync(OUT, { recursive: true });

const b64 = (p, t) => `data:${t};base64,` + readFileSync(p).toString('base64');
const FONT_CSS = [
  ['Mont', 'montserrat.woff2', 'normal', '100 900'], ['Mont', 'montserrat-italic.woff2', 'italic', '100 900'],
  ['Serif', 'instrument-serif-400.woff2', 'normal', '400'], ['Serif', 'instrument-serif-italic-400.woff2', 'italic', '400'],
  ['Inter', 'inter.woff2', 'normal', '100 900'], ['Inter', 'inter-italic.woff2', 'italic', '100 900'],
].map(([f, file, st, wt]) => `@font-face{font-family:${f};src:url(${b64(KIT + file, 'font/woff2')}) format('woff2');font-style:${st};font-weight:${wt}}`).join('\n');
const LOGO = b64(LOGO_FILE, 'image/png');

const ACC = { orange: '#F5A524', blue: '#2EA8F5', green: '#3DDC84', gold: '#D4A853' };
const INK = '#0B0B0B', PAPER = '#F4F0E8';
const T = {
  en: { swipe: 'Swipe', photo: 'Sample photo', sites: 'Sample sites', site: 'Sample site', demo: 'Demo', chat: 'Example chat', before: 'Before', after: 'After', source: 'Source', quiet: 'Free website preview · DM “WEBSITE”', myth: 'Myth', fact: 'Fact', vs: 'vs.', dicho: 'Dicho', notes: 'To-do' },
  es: { swipe: 'Desliza', photo: 'Foto de muestra', sites: 'Sitios de muestra', site: 'Sitio de muestra', demo: 'Demo', chat: 'Chat de ejemplo', before: 'Antes', after: 'Después', source: 'Fuente', quiet: 'Vista previa gratis ·\nEscríbenos “WEBSITE”', myth: 'Mito', fact: 'Realidad', vs: 'vs.', dicho: 'Dicho', notes: 'Pendientes' },
};
const CTA = {
  en: { save: 'Save this', send: 'Send this to an owner', ask: 'Comment your answer', dm: 'DM “WEBSITE”' },
  es: { save: 'Guárdalo', send: 'Mándaselo a un dueño', ask: 'Comenta tu respuesta', dm: 'Escríbenos “WEBSITE”' },
};
const ctaFor = (kind, lang) => { const c = CTA[lang] || CTA.en; return ({ relatable: c.send, question: c.ask, offer: c.dm, demo: c.dm, process: c.dm })[kind] || c.save; };

// ---------- text helpers ----------
const esc = s => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const fill = s => String(s ?? '').replace(/\{price\.(starter|pro|care)\}/g, (_, k) => OFFER[k] + (k === 'care' ? OFFER.careUnit : ''))
  .replace(/\{keyword\}/g, OFFER.keyword).replace(/\{delivery\}/g, OFFER.delivery);
const md = s => esc(fill(s)).replace(/\*([^*]+)\*/g, '<em class="em">$1</em>').replace(/\n/g, '<br>');
const plain = s => fill(s).replace(/\*/g, '');
// one body line = one block, so text-wrap:pretty can keep a lone word off the end of every line, not only the last
const ln = (l, style = '') => `<div class="ln"${style ? ` style="${style}"` : ''}>${md(l)}</div>`;

// ---------- sample assets ----------
const SAMPLE_PHOTO = /^(food|beauty|fitness|home)-[123]$/;
const SCREENS = ['food', 'beauty', 'fitness', 'home'];
const photoUrl = n => { if (!SAMPLE_PHOTO.test(n)) throw new Error(`photo "${n}" is not a niche SAMPLE photo (food|beauty|fitness|home-1..3)`); return b64(`${IMG}${n}.jpg`, 'image/jpeg'); };
let SCREEN_URL = {};   // filled at start-up (the food screen gets its printed rating painted out)
const screenUrl = n => { if (!SCREENS.includes(n)) throw new Error(`screen "${n}" is not a sample screen (${SCREENS.join('|')})`); return SCREEN_URL[n]; };

// ---------- icons (24-unit line icons, our own drawing) ----------
const ICON = {
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3.5 2"/>',
  pin: '<path d="M12 21s-7-6.2-7-11.2a7 7 0 0 1 14 0C19 14.8 12 21 12 21z"/><circle cx="12" cy="9.8" r="2.6"/>',
  phone: '<path d="M6.5 3.5h3l1.6 4.6-2.2 1.5a11.5 11.5 0 0 0 5.5 5.5l1.5-2.2 4.6 1.6v3a2 2 0 0 1-2.1 2A16.5 16.5 0 0 1 4.5 5.6a2 2 0 0 1 2-2.1z"/>',
  menu: '<rect x="5" y="3" width="14" height="18" rx="2"/><path d="M8.5 8h7M8.5 12h7M8.5 16h4.5"/>',
  calendar: '<rect x="3.5" y="5" width="17" height="15.5" rx="2"/><path d="M3.5 10h17M8 3v4M16 3v4"/>',
  link: '<path d="M10 14a4.5 4.5 0 0 0 6.4 0l3-3a4.5 4.5 0 0 0-6.4-6.4l-1.2 1.2"/><path d="M14 10a4.5 4.5 0 0 0-6.4 0l-3 3a4.5 4.5 0 0 0 6.4 6.4l1.2-1.2"/>',
  search: '<circle cx="11" cy="11" r="7"/><path d="M20.5 20.5 16 16"/>',
  lock: '<rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/>',
  camera: '<rect x="3" y="7" width="18" height="13" rx="2.5"/><circle cx="12" cy="13.5" r="3.6"/><path d="M8.5 7 10 4.5h4L15.5 7"/>',
  tag: '<path d="M3.5 12.5V4h8.5l9 9-8.5 8.5z"/><circle cx="8" cy="8.5" r="1.6"/>',
  chat: '<path d="M4 5h16v11H9l-5 4z"/>',
  globe: '<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c2.8 3 2.8 15 0 18M12 3c-2.8 3-2.8 15 0 18"/>',
};
const icon = (n, px, color = 'currentColor', sw = 1.8) => `<svg width="${px}" height="${px}" viewBox="0 0 24 24" fill="none" stroke="${color}" stroke-width="${sw}" stroke-linecap="round" stroke-linejoin="round">${ICON[n] || ICON.globe}</svg>`;
const tick = (px, color) => `<svg width="${px}" height="${px}" viewBox="0 0 24 24" fill="none" stroke="${color}" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12.5 10 17.5 19.5 7"/></svg>`;
const cross = (px, color) => `<svg width="${px}" height="${px}" viewBox="0 0 24 24" fill="none" stroke="${color}" stroke-width="3" stroke-linecap="round"><path d="M6 6l12 12M18 6 6 18"/></svg>`;

// ---------- shared pieces ----------
let seed = 1; const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
const hash = s => [...s].reduce((h, c) => (h * 31 + c.charCodeAt(0)) % 2147483646, 7) + 1;
const phone = (scr, x, y, w, rot, z = 1, extra = '') => `<div class="ph" data-c="phone" data-group="phones" style="position:absolute;left:${x}px;top:${y}px;width:${w}px;height:${Math.round(w * 844 / 390)}px;transform:${extra}rotate(${rot}deg);z-index:${z};border-radius:${w * .14}px;background:#0d0d0d;padding:${w * .03}px;box-shadow:0 30px 60px rgba(0,0,0,.45),0 0 0 2px #2a2a2a">
<div style="width:100%;height:100%;border-radius:${w * .11}px;overflow:hidden;position:relative;background:url(${screenUrl(scr)}) top/cover"><div style="position:absolute;left:50%;top:${w * .03}px;transform:translateX(-50%);width:${w * .3}px;height:${w * .085}px;border-radius:99px;background:#0d0d0d"></div></div></div>`;
const tagPill = (text, bg, fg, pos, c = 'tag') => `<div class="tagp" data-c="${c}" style="position:absolute;${pos};background:${bg};color:${fg};font:700 30px/1 Inter;letter-spacing:.08em;text-transform:uppercase;padding:14px 20px;border-radius:12px;white-space:nowrap">${esc(text)}</div>`;
// a text column: kids are {html, fs, min, cls, style, w, c, maxh}; fixed kids pass fix:true
const col = (pos, kids, { gap = 36, v = 'start', align = 'left', name = 'col', maxh, bg } = {}) =>
  `<div class="col" data-name="${name}"${maxh ? ` data-maxh="${maxh}"` : ''}${bg ? ` data-bg="${bg}"` : ''} style="position:absolute;${pos};gap:${gap}px;justify-content:${({ start: 'flex-start', center: 'center', end: 'flex-end' })[v]};text-align:${align};align-items:${align === 'center' ? 'center' : 'stretch'}">` +
  kids.filter(Boolean).map(k => k.fix ? k.html : `<div class="fit ${k.cls || ''}" data-c="${k.c || 'text'}" data-fs="${k.fs}" data-min="${k.min || 30}" data-w="${k.w || 1}"${k.max ? ` data-max="${k.max}"` : ''}${k.maxh ? ` data-maxh="${k.maxh}"` : ''} style="${k.style || ''};font-size:${k.fs}px">${k.html}</div>`).join('') + `</div>`;

function chrome(ctx, th) {
  const t = T[ctx.lang] || T.en, foot = th.foot || (th.logo === 'white' ? 'dark' : 'light'), fb = th.footbg || th.pagebg || INK;
  const chip = foot === 'dark' ? `background:#fff;color:${INK}` : `background:${INK};color:#fff`;
  const ink = foot === 'dark' ? '#E2E2E2' : INK;
  const logoF = th.logo === 'white' ? 'brightness(0) invert(1)' : 'brightness(0)';
  const big = ctx.role === 'end';
  let left = '';
  if (ctx.role === 'single') left = `<div class="chip" data-c="cta" style="${chip}">${esc(fill(ctx.cta))}</div>`;
  else if (ctx.role === 'cover') left = `<div class="chip" data-c="swipe" style="${chip}">${esc(t.swipe)} <span style="font-family:Inter">→</span></div>`;
  else if (ctx.role === 'content') {
    const p = `${String(ctx.i + 1).padStart(2, '0')} / ${String(ctx.n).padStart(2, '0')}`;
    left = `<div data-c="page" style="display:flex;align-items:center;gap:22px;color:${ink};font:700 30px/1 Inter;letter-spacing:.04em"><span>${p}</span><span data-decor="1" style="display:block;width:150px;height:6px;border-radius:9px;background:${foot === 'dark' ? 'rgba(255,255,255,.22)' : 'rgba(0,0,0,.16)'}"><span style="display:block;height:100%;width:${Math.round(100 * (ctx.i + 1) / ctx.n)}%;border-radius:9px;background:${ink}"></span></span></div>`;
  } else if (ctx.role === 'end' && !/WEBSITE/.test(ctx.cta)) left = `<div data-c="quiet" style="color:${ink};font:600 30px/1.05 Inter;white-space:nowrap">${esc(t.quiet).replace(/\n/g, '<br>')}</div>`;
  return `<img class="logo" data-c="logo" src="${LOGO}" style="position:absolute;left:${M}px;top:${big ? 86 : 72}px;width:${big ? 250 : 128}px;filter:${logoF};z-index:20">
<div class="footL" data-bg="${fb}" style="position:absolute;left:${M}px;bottom:100px;height:62px;display:flex;align-items:center;z-index:20">${left}</div>
<div class="footR" data-bg="${fb}" style="position:absolute;right:${M}px;bottom:100px;height:62px;display:flex;align-items:center;z-index:20"><span data-c="handle" style="color:${ink};font:600 30px/1 Inter;letter-spacing:.01em">@dsmarketing.agency</span></div>`;
}

// ---------- the 12 looks ----------
// each look: (s, ctx) → {bg, body, logo:'white'|'black', foot:'dark'|'light', pagebg:'#hex', css}
// s.role is one of single | cover | content | end (end slides go through endSlide with the look's skin)
const LOOKS = {};
const D = (id, best, fn, skin) => { LOOKS[id] = { id, best, fn, skin }; };

// 1 TORN — black torn paper, white caps, two sample phones (the signature look; offers)
const tornBg = (id, cx = 0.62) => {
  seed = hash(id); const pts = []; let x = W * cx;
  for (let y = 0; y <= H; y += 6 + rnd() * 10) { x += (rnd() - .5) * 26 + (W * cx - x) * .08; if (rnd() < .06) x += (rnd() - .5) * 90; pts.push(`${x.toFixed(1)},${y.toFixed(1)}`); }
  return `<svg width="${W}" height="${H}" style="position:absolute;inset:0" xmlns="http://www.w3.org/2000/svg"><defs><pattern id="d" width="9" height="9" patternUnits="userSpaceOnUse"><circle cx="2" cy="2" r="1.1" fill="#fff" fill-opacity=".05"/></pattern><filter id="s"><feDropShadow dx="-6" dy="0" stdDeviation="8" flood-opacity=".55"/></filter></defs>
<rect width="${W}" height="${H}" fill="#060606"/><rect width="${W}" height="${H}" fill="url(#d)"/><polygon filter="url(#s)" points="${W},0 ${pts.join(' ')} ${W},${H}" fill="#1c1c1c"/></svg>`;
};
D('torn', 'offers and process posts — the signature, used sparingly',
  (s, ctx) => {
    const v = s.v, acc = ctx.acc, css = `.look-torn .em{font-style:normal;color:${acc}}`;
    const L = (s.lines || []).map(t => `<div style="display:flex;gap:.45em"><b style="font:800 1em Mont;flex:none">—</b><span>${md(t)}</span></div>`).join('');
    const scr = v.screen, scr2 = v.screen2 || (scr ? ({ food: 'beauty', beauty: 'fitness', fitness: 'home', home: 'food' })[scr] : null);
    let body = '';
    if (ctx.role === 'content') {
      body += `<div data-c="num" style="position:absolute;left:${M}px;top:190px;font:900 190px/1 Mont;color:${acc};letter-spacing:-.04em">${esc(v.number || String(ctx.i).padStart(2, '0'))}</div>`;
      body += col(`left:${M}px;top:420px;width:${scr ? 540 : 920}px;height:720px`, [
        { html: md(s.headline), fs: 76, min: 46, cls: 'h', style: 'color:#fff', w: 1.2, c: 'headline' },
        L && { html: L, fs: 42, min: 30, style: 'font-family:Inter;font-weight:500;line-height:1.3;color:#ECECEC;display:flex;flex-direction:column;gap:.55em', c: 'body' },
      ], { gap: 40 });
      if (scr) body += phone(scr, 700, 430, 270, 5) + `<div data-c="samp" style="position:absolute;left:680px;width:320px;top:1080px;text-align:center;font:700 30px Inter;letter-spacing:.08em;text-transform:uppercase;color:#BDBDBD">${esc(T[ctx.lang].site)}</div>`;
    } else {
      body += col(`left:${M}px;top:196px;width:920px;height:340px`, [{ html: md(s.headline), fs: 100, min: 54, cls: 'h', style: 'color:#fff', c: 'headline' }], { v: 'end' });
      body += col(`left:${M}px;top:580px;width:${scr ? 480 : 920}px;height:${scr ? 500 : 560}px`, [
        L && { html: L, fs: 42, min: 30, style: 'font-family:Inter;font-weight:500;line-height:1.3;color:#ECECEC;display:flex;flex-direction:column;gap:.6em', c: 'body' },
      ], { v: scr ? 'center' : 'start' });
      if (scr) body += phone(scr2, 590, 600, 205, -6, 1) + phone(scr, 790, 625, 205, 7, 2)
        + `<div data-c="samp" style="position:absolute;right:${M}px;top:1098px;font:700 30px Inter;letter-spacing:.08em;text-transform:uppercase;color:#BDBDBD">${esc(T[ctx.lang].sites)}</div>`;
    }
    return { bg: tornBg(ctx.post.id + ctx.i), body, logo: 'white', pagebg: '#1c1c1c', css };
  },
  { bg: ctx => tornBg(ctx.post.id + 'end', .7), logo: 'white', text: '#fff', pagebg: '#1c1c1c', head: 'h', css: ctx => `.look-torn .em{font-style:normal;color:${ctx.acc}}` });

// 2 BLOCK — one solid accent, a giant stacked poster headline (each line fills the width), black ink
D('block', 'statements, Spanish-first one-liners, shareable opinions',
  (s, ctx) => {
    const acc = ctx.acc, lines = plain(s.headline).split('\n');
    const css = `.look-block .em{font-style:normal;color:#fff;-webkit-text-stroke:0}`;
    let body = '';
    if (ctx.role === 'content') {
      body += `<div data-decor="1" style="position:absolute;left:${M - 14}px;top:170px;font:900 400px/1 Mont;color:transparent;-webkit-text-stroke:5px ${INK};letter-spacing:-.05em">${String(ctx.i).padStart(2, '0')}</div>`;
      body += col(`left:${M}px;top:600px;width:920px;height:540px`, [
        { fix: true, html: `<div style="width:160px;height:14px;background:${INK};flex:none"></div>` },
        { html: md(s.headline), fs: 92, min: 52, cls: 'h', style: 'font-weight:900', c: 'headline', w: 1.2 },
        s.lines?.length && { html: s.lines.map(ln).join(''), fs: 46, min: 30, style: 'font:600 1em/1.3 Inter', c: 'body' },
      ], { gap: 34, v: 'end' });
    } else {
      body += `<div class="poster" data-c="headline" data-center=".col[data-name=sub] > :first-child" data-maxh="${s.lines?.length ? 700 : 820}" style="position:absolute;left:${M}px;top:200px;width:920px">${lines.map(l => `<div class="fitw" data-max="250" data-min="60" style="font:900 100px/.9 Mont;text-transform:uppercase;letter-spacing:-.035em;white-space:nowrap;color:${INK};${/[ÁÉÍÓÚÑÜ]/i.test(l) ? 'padding-top:.12em' : ''}">${esc(l)}</div>`).join('')}</div>`;
      body += col(`left:${M}px;top:0;width:920px;height:1150px`, [
        { fix: true, html: `<div style="width:160px;height:14px;background:${INK};flex:none"></div>` },
        s.lines?.length && { html: s.lines.map(ln).join(''), fs: 46, min: 30, style: 'font:600 1em/1.32 Inter;color:#0B0B0B', c: 'body' },
      ], { gap: 34, v: 'end', name: 'sub' });
    }
    return { bg: `<div style="position:absolute;inset:0;background:${acc}"></div>`, body, logo: 'black', pagebg: acc, css };
  },
  { bg: ctx => `<div style="position:absolute;inset:0;background:${ctx.acc}"></div>`, logo: 'black', pagebg: ctx => ctx.acc, head: 'h', headStyle: 'font-weight:900', css: () => '.look-block .em{font-style:normal}' });

// 3 EDITORIAL — paper white, big serif headline with an italic + highlighted word, magazine rules
const edCss = acc => `.look-editorial .em{font-style:italic;background:linear-gradient(transparent 58%, ${acc}B3 58%, ${acc}B3 92%, transparent 92%);padding:0 .06em}`;
D('editorial', 'opinions, educational carousels, "ask these questions" posts',
  (s, ctx) => {
    const v = s.v, rule = `<div style="height:3px;background:${INK};flex:none"></div>`;
    const kick = v.kicker || ({ en: 'Notes for owners', es: 'Notas para dueños' })[ctx.lang];
    let body = '';
    if (ctx.role === 'content') {
      body += col(`left:${M}px;top:196px;width:920px;height:950px`, [
        { html: `<span style="font:italic 400 1em/1 Serif">${esc(v.number || ctx.i + '.')}</span>`, fs: 200, min: 120, c: 'num', style: 'line-height:.8' },
        { fix: true, html: rule },
        { html: md(s.headline), fs: 104, min: 58, style: 'font:400 1em/1.02 Serif;letter-spacing:-.01em', c: 'headline', w: 1.2 },
        s.lines?.length && { html: s.lines.map((l, i) => ln(l, i ? 'margin-top:1lh' : '')).join(''), fs: 44, min: 30, style: 'font:500 1em/1.38 Inter;color:#2B2B2B', c: 'body' },
        s.source && { html: `${T[ctx.lang].source}: ${esc(s.source)}`, fs: 30, min: 30, style: 'font:500 1em/1.3 Inter;color:#555', c: 'source' },
      ], { gap: 34 });
      body += `<div data-decor="1" style="position:absolute;left:${M}px;right:${M}px;top:1160px;height:3px;background:${INK}"></div>`;
    } else {
      body += `<div data-c="kicker" style="position:absolute;left:${M}px;right:${M}px;top:196px;display:flex;justify-content:space-between;font:700 30px/1 Inter;letter-spacing:.14em;text-transform:uppercase;color:#2B2B2B;padding-bottom:20px;border-bottom:3px solid ${INK}"><span>${esc(kick)}</span><span data-decor="1" style="font:italic 400 40px/0.7 Serif;letter-spacing:0;text-transform:none">${esc(v.mark || (ctx.lang === 'es' ? 'Notas DS' : 'DS Notes'))}</span></div>`;
      body += col(`left:${M}px;top:300px;width:920px;height:826px`, [
        { html: md(s.headline), fs: 138, min: 64, style: 'font:400 1em/1 Serif;letter-spacing:-.015em', c: 'headline', w: 1.3 },
        s.lines?.length && { html: s.lines.map(ln).join(''), fs: 44, min: 30, style: 'font:500 1em/1.38 Inter;color:#2B2B2B;max-width:860px', c: 'body' },
        s.source && { html: `${T[ctx.lang].source}: ${esc(s.source)}`, fs: 30, min: 30, style: 'font:500 1em/1.3 Inter;color:#555', c: 'source' },
      ], { gap: 46 });
      body += `<div data-decor="1" style="position:absolute;left:${M}px;right:${M}px;top:1160px;height:3px;background:${INK}"></div>`;
    }
    return { bg: `<div style="position:absolute;inset:0;background:${PAPER}"></div>`, body, logo: 'black', pagebg: PAPER, css: edCss(ctx.acc) };
  },
  { bg: () => `<div style="position:absolute;inset:0;background:${PAPER}"></div>`, logo: 'black', pagebg: PAPER, head: 'serif', css: ctx => edCss(ctx.acc) });

// 4 NUMBER — white, one giant number (or one word) over an accent disc, a label, one line, a source
D('number', 'verified facts with a source, "48 hours", one-number posts, numbered listicles',
  (s, ctx) => {
    const v = s.v, num = v.number || (ctx.role === 'content' ? String(ctx.i) : '1');
    const body = `<div data-decor="1" style="position:absolute;left:560px;top:150px;width:420px;height:420px;border-radius:50%;background:${ctx.acc}"></div>` +
      col(`left:${M}px;top:176px;width:920px;height:974px`, [
        { fix: true, html: `<div class="poster" data-c="number" data-maxh="470" style="width:920px;flex:none"><div class="fitw" data-max="470" data-min="140" style="font:900 100px/.9 Mont;letter-spacing:-.05em;white-space:nowrap;color:${INK}">${esc(num)}</div></div>` },
        v.label && { html: md(v.label), fs: 46, min: 30, style: 'font:800 1em/1.15 Inter;text-transform:uppercase;letter-spacing:.02em;color:#111', c: 'label' },
        { fix: true, html: `<div style="width:120px;height:10px;background:${INK};flex:none"></div>` },
        s.headline && { html: md(s.headline), fs: 64, min: 42, style: 'font:800 1em/1.1 Mont;letter-spacing:-.02em', c: 'headline', w: 1.2 },
        s.lines?.length && { html: s.lines.map(ln).join(''), fs: 42, min: 30, style: 'font:500 1em/1.35 Inter;color:#2B2B2B', c: 'body' },
        s.source && { html: `${T[ctx.lang].source}: ${esc(s.source)}`, fs: 30, min: 30, style: 'font:500 1em/1.3 Inter;color:#555', c: 'source' },
      ], { gap: 30 });
    return { bg: `<div style="position:absolute;inset:0;background:#fff"></div>`, body, logo: 'black', pagebg: '#FFFFFF', css: '.look-number .em{font-style:normal;text-decoration:underline;text-decoration-thickness:.12em;text-underline-offset:.12em}' };
  },
  { bg: ctx => `<div style="position:absolute;inset:0;background:#fff"></div><div style="position:absolute;right:-120px;top:-120px;width:520px;height:520px;border-radius:50%;background:${ctx.acc}"></div>`, logo: 'black', pagebg: '#FFFFFF', head: 'h' });

// 5 PHOTO — full-bleed sample photo, tilted accent stickers, the line on a white card, SAMPLE PHOTO tag
D('photo', 'relatable lines by trade (food truck, salon, gym, home services)',
  (s, ctx) => {
    const v = s.v, ph = v.photo || ctx.post._photo || 'food-3';
    const st = (v.stickers || []).slice(0, 3);
    const rot = [-4, 3, -2.5];
    let body = `<div style="position:absolute;inset:0;background:url(${photoUrl(ph)}) center/cover"></div>
<div style="position:absolute;inset:0 0 auto 0;height:300px;background:linear-gradient(rgba(0,0,0,.6),rgba(0,0,0,0))"></div>
<div style="position:absolute;left:0;right:0;bottom:0;height:200px;background:${INK}"></div>`;
    if (st.length) body += `<div class="stk" style="position:absolute;left:${M}px;right:${M}px;top:${ctx.role === 'content' ? 230 : 250}px;display:flex;flex-direction:column;gap:44px">${st.map((t, i) => `<div data-c="sticker" data-bg="${ctx.acc}" style="align-self:${i % 2 ? 'flex-end' : 'flex-start'};transform:rotate(${rot[i]}deg);background:${ctx.acc};color:${INK};font:800 40px/1.1 Inter;text-transform:uppercase;letter-spacing:.01em;padding:18px 26px;border-radius:14px;box-shadow:0 14px 30px rgba(0,0,0,.35);white-space:nowrap">${esc(fill(t))}</div>`).join('')}</div>`;
    body += col(`left:${M}px;bottom:236px;width:920px;padding:44px 46px;background:#fff;border-radius:30px`, [
      { html: md(s.headline), fs: 66, min: 44, style: 'font:800 1em/1.08 Mont;letter-spacing:-.02em;color:#0B0B0B', c: 'headline', w: 1.2 },
      s.lines?.length && { html: s.lines.map(ln).join(''), fs: 42, min: 30, style: 'font:500 1em/1.35 Inter;color:#222', c: 'body' },
    ], { gap: 24, maxh: 520, name: 'panel' });
    body += `<div class="above" data-gap="20" data-c="samp" style="position:absolute;right:${M}px;background:${INK};color:#fff;font:700 30px/1 Inter;letter-spacing:.08em;text-transform:uppercase;padding:14px 20px;border-radius:12px">${esc(T[ctx.lang].photo)}</div>`;
    return { bg: '', body, logo: 'white', foot: 'dark', footbg: INK, pagebg: INK, css: `.look-photo .em{font-style:normal;background:${ctx.acc};padding:0 .12em;border-radius:.12em;-webkit-box-decoration-break:clone;box-decoration-break:clone}` };
  },
  { bg: ctx => `<div style="position:absolute;inset:-40px;background:url(${photoUrl(ctx.post._photo || 'food-3')}) center/cover;filter:blur(18px)"></div><div style="position:absolute;inset:0;background:rgba(8,8,8,.78)"></div>`, logo: 'white', text: '#fff', pagebg: '#2A2A2A', head: 'h', css: ctx => `.look-photo .em{font-style:normal;color:${ctx.acc}}` });

// 6 SPLIT — diagonal before → after: a grey DEMO link-in-bio list vs a SAMPLE site phone
const splitBg = (acc, yl = 1110, yr = 690) => `<svg width="${W}" height="${H}" style="position:absolute;inset:0"><rect width="${W}" height="${H}" fill="#E9E7E2"/><polygon points="0,${yl} ${W},${yr} ${W},${H} 0,${H}" fill="${INK}"/><polygon points="0,${yl} ${W},${yr} ${W},${yr + 12} 0,${yl + 12}" fill="${acc}"/></svg>`;
const linkList = (items, lang) => `<div data-c="before" style="position:absolute;left:${M}px;top:516px;width:430px;background:#fff;border-radius:30px;padding:28px 26px;box-shadow:0 20px 40px rgba(0,0,0,.12);display:flex;flex-direction:column;gap:14px;filter:grayscale(1)">
<div style="display:flex;align-items:center;gap:18px"><div style="width:72px;height:72px;border-radius:50%;background:#CFCFCF;flex:none"></div><div style="flex:1;display:flex;flex-direction:column;gap:10px"><div style="height:16px;width:70%;border-radius:9px;background:#D6D6D6"></div><div style="height:14px;width:90%;border-radius:9px;background:#E3E3E3"></div></div></div>
<div style="font:600 30px/1.2 Inter;color:#4A4A4A">${lang === 'es' ? 'link en la bio ↓' : 'link in bio ↓'}</div>
${items.slice(0, 5).map(t => `<div class="clip" style="background:#EFEFEF;border:2px solid #DADADA;border-radius:14px;padding:13px 14px;font:600 30px/1.15 Inter;color:#262626;text-align:center;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${esc(fill(t))}</div>`).join('')}</div>`;
D('split', 'demo transformations (one niche per post), "what changes" carousels',
  (s, ctx) => {
    const v = s.v, t = T[ctx.lang], scr = v.screen || 'beauty';
    let body = col(`left:${M}px;top:196px;width:920px;height:${ctx.role === 'content' ? 240 : 226}px`, [{ html: md(s.headline), fs: 80, min: 46, style: 'font:800 1em/1.04 Mont;letter-spacing:-.02em;color:#0B0B0B', c: 'headline' }], { v: 'center' });
    let bg;
    if (ctx.role === 'content') {
      bg = splitBg(ctx.acc, 1170, 980);
      body += phone(scr, 620, 470, 270, 3);
      body += col(`left:${M}px;top:480px;width:480px;height:600px`, (s.lines || []).map((l, i) => ({ html: `<div style="display:flex;gap:.45em;align-items:flex-start"><span style="flex:none;display:grid;place-items:center;width:1.45em;height:1.45em;margin-top:-.08em;border-radius:50%;background:${INK};color:#fff;font:800 .8em Mont">${i + 1}</span><span>${md(l)}</span></div>`, fs: 42, min: 30, max: 48, style: 'font:600 1em/1.25 Inter;color:#0B0B0B', c: 'body' })), { gap: 30, v: 'center' });
      body += tagPill(`${t.after} · ${t.site}`, ctx.acc, INK, `right:${M}px;top:1098px`, 'tagA');
    } else {
      bg = splitBg(ctx.acc);
      body += tagPill(`${t.before} · ${t.demo}`, INK, '#fff', `left:${M}px;top:446px`, 'tagB');
      body += linkList(v.before || [], ctx.lang);
      body += phone(scr, 650, 440, 280, 4, 2);
      body += `<svg data-decor="1" width="140" height="120" viewBox="0 0 150 120" style="position:absolute;left:508px;top:610px;z-index:3"><path d="M8 92 C 40 20, 100 14, 132 44" fill="none" stroke="${ctx.acc}" stroke-width="10" stroke-linecap="round"/><path d="M104 30 L136 46 L118 78" fill="none" stroke="${ctx.acc}" stroke-width="10" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
      body += tagPill(`${t.after} · ${t.site}`, ctx.acc, INK, `right:${M}px;top:1084px`, 'tagA');
    }
    return { bg, body, logo: 'black', foot: 'dark', footbg: INK, pagebg: '#E9E7E2', css: `.look-split .em{font-style:normal;box-shadow:inset 0 -.3em 0 ${ctx.acc}}` };
  },
  { bg: ctx => `<svg width="${W}" height="${H}" style="position:absolute;inset:0"><rect width="${W}" height="${H}" fill="${INK}"/><polygon points="0,0 ${W},0 ${W},330 0,610" fill="#E9E7E2"/><polygon points="0,610 ${W},330 ${W},342 0,622" fill="${ctx.acc}"/></svg>`, logo: 'black', text: '#fff', pagebg: INK, footbg: INK, head: 'h', endPos: `left:${M}px;top:660px;width:920px;height:490px`, css: ctx => `.look-split .em{font-style:normal;color:${ctx.acc}}` });

// 7 PAPER — notebook page: margin line, punched holes, hand-drawn boxes, ruled rows
const paperBg = () => `<div style="position:absolute;inset:0;background:#FBF8F1"></div><div style="position:absolute;left:58px;top:0;bottom:0;width:3px;background:#E7A3A3"></div>${[330, 675, 1020].map(y => `<div style="position:absolute;left:14px;top:${y}px;width:30px;height:30px;border-radius:50%;background:#E4DFD3;box-shadow:inset 0 3px 5px rgba(0,0,0,.18)"></div>`).join('')}`;
const box = (size, on, accent) => `<svg viewBox="0 0 40 40" style="flex:none;width:${size};height:${size}"><path d="M5 6.5 C 14 5, 26 5.5, 34.5 5 C 35.5 14, 35 26, 35.5 34.5 C 26 35.5, 14 35, 5.5 35.5 C 4.5 26, 5 14, 5 6.5 Z" fill="${on ? accent : 'none'}" fill-opacity="${on ? .55 : 0}" stroke="#1A1A1A" stroke-width="2.6" stroke-linejoin="round"/>${on ? '<path d="M10 21 L17.5 28.5 L33 9" fill="none" stroke="#14213D" stroke-width="4.2" stroke-linecap="round" stroke-linejoin="round"/>' : ''}</svg>`;
D('paper', 'save-worthy checklists ("does your page pass…"), what-to-send lists',
  (s, ctx) => {
    const css = `.look-paper .em{font-style:normal;background:linear-gradient(transparent 55%, ${ctx.acc}A6 55%, ${ctx.acc}A6 95%, transparent 95%)}`;
    let body = '';
    if (ctx.role === 'content') {
      body += col(`left:110px;top:200px;width:890px;height:950px`, [
        { fix: true, html: `<div data-c="box" style="width:150px;height:150px">${box('150px', /^\[x\]/i.test(s.headline || ''), ctx.acc)}</div>` },
        { html: md((s.headline || '').replace(/^\[[x ]\]\s*/i, '')), fs: 84, min: 50, style: 'font:800 1em/1.06 Mont;letter-spacing:-.02em', c: 'headline', w: 1.2 },
        s.lines?.length && { html: s.lines.map(ln).join(''), fs: 44, min: 30, style: 'font:500 1em/1.4 Inter;color:#262626', c: 'body' },
        s.source && { html: `${T[ctx.lang].source}: ${esc(s.source)}`, fs: 30, min: 30, style: 'font:500 1em/1.3 Inter;color:#555', c: 'source' },
      ], { gap: 40, v: 'center' });
    } else {
      const rows = (s.lines || []).map(l => { const on = /^\[x\]/i.test(l); return `<div style="display:flex;gap:.6em;align-items:center;padding:.42em 0;border-bottom:3px solid #C9D8EC">${box('1.35em', on, ctx.acc)}<span>${md(l.replace(/^\[[x ]\]\s*/i, ''))}</span></div>`; }).join('');
      body += col(`left:110px;top:196px;width:890px;height:960px`, [
        { html: md(s.headline), fs: 80, min: 48, max: 86, style: 'font:800 1em/1.06 Mont;letter-spacing:-.02em', c: 'headline', w: 1.2 },
        rows && { html: rows, fs: 42, min: 30, max: 54, style: 'font:500 1em/1.25 Inter;color:#1A1A1A;border-top:3px solid #C9D8EC', c: 'list' },
      ], { gap: 44 });
    }
    return { bg: paperBg(), body, logo: 'black', pagebg: '#FBF8F1', css };
  },
  { bg: paperBg, logo: 'black', pagebg: '#FBF8F1', head: 'h', css: ctx => `.look-paper .em{font-style:normal;background:linear-gradient(transparent 55%, ${ctx.acc}A6 55%, ${ctx.acc}A6 95%, transparent 95%)}` });

// 8 CHAT — a generic chat or to-do screenshot card (no platform marks) on an accent field
const chatCard = (v, lang, acc) => {
  if (v.notes) {
    const n = v.notes;
    return `<div class="card" data-c="card" style="background:#fff;border-radius:40px;overflow:hidden;box-shadow:0 30px 60px rgba(0,0,0,.25);text-align:left">
<div style="background:#FFD84D;padding:.7em 1.1em;font:800 1em/1 Inter;color:#111;display:flex;justify-content:space-between"><span>${esc(n.title || T[lang].notes)}</span><span style="font-weight:600">${esc(n.time || '')}</span></div>
<div style="padding:.5em 1.1em .8em">${(n.items || []).map(([d, t]) => `<div style="display:flex;gap:.6em;align-items:center;padding:.5em 0;border-bottom:2px solid #EEE;font:500 1em/1.25 Inter;color:${d ? '#5E5E5E' : '#111'}"><span style="flex:none;width:1.1em;height:1.1em;border-radius:50%;border:3px solid ${d ? '#5E5E5E' : '#111'};display:grid;place-items:center;background:${d ? '#5E5E5E' : 'transparent'}">${d ? tick(16, '#fff') : ''}</span><span style="${d ? 'text-decoration:line-through;text-decoration-thickness:2px' : ''}">${md(t)}</span></div>`).join('')}</div></div>`;
  }
  const msgs = v.chat || [];
  return `<div class="card" data-c="card" style="background:#fff;border-radius:40px;padding:.9em 1em 1em;box-shadow:0 30px 60px rgba(0,0,0,.25);text-align:left">
<div style="display:flex;align-items:center;gap:.5em;padding-bottom:.6em;border-bottom:2px solid #EEE;margin-bottom:.6em"><span style="width:1.9em;height:1.9em;border-radius:50%;background:${acc};display:grid;place-items:center;font:800 .9em Mont;color:#0B0B0B;flex:none">${lang === 'es' ? 'C' : 'C'}</span><span style="font:700 1em/1.1 Inter;color:#111;flex:1">${lang === 'es' ? 'Cliente' : 'Customer'}</span><span style="font:700 1em/1 Inter;font-size:max(30px,.72em);letter-spacing:.08em;text-transform:uppercase;color:#555">${esc(T[lang].chat)}</span></div>
<div style="display:flex;flex-direction:column;gap:.38em">${msgs.map(([who, text, time]) => {
    const me = who === 'me';
    return (time ? `<div style="align-self:center;font:600 1em/1 Inter;font-size:max(30px,.72em);color:#595959;margin:.35em 0 .1em">${esc(time)}</div>` : '') +
      `<div style="align-self:${me ? 'flex-end' : 'flex-start'};max-width:80%;background:${me ? INK : '#ECECEC'};color:${me ? '#fff' : '#111'};font:500 1em/1.28 Inter;padding:.5em .8em;border-radius:${me ? '1.1em 1.1em .3em 1.1em' : '1.1em 1.1em 1.1em .3em'}">${md(text)}</div>`;
  }).join('')}</div></div>`;
};
D('chat', 'relatable owner moments (late-night DMs, the to-do list), Reel-style stills',
  (s, ctx) => {
    const v = s.v;
    const body = col(`left:${M}px;top:196px;width:920px;height:954px`, [
      s.headline && { html: md(s.headline), fs: 74, min: 44, style: 'font:800 1em/1.06 Mont;letter-spacing:-.02em;color:#0B0B0B', c: 'headline', w: 1.3 },
      { html: chatCard(v, ctx.lang, ctx.acc === ACC.blue ? '#FFD84D' : ACC.blue), fs: 40, min: 30, c: 'cardwrap', style: 'padding:0 22px' },
      s.lines?.length && { html: s.lines.map(ln).join(''), fs: 42, min: 30, style: 'font:600 1em/1.3 Inter;color:#0B0B0B', c: 'body' },
    ], { gap: 38, v: 'center' });
    return { bg: `<div style="position:absolute;inset:0;background:${ctx.acc}"></div><svg data-decor="1" width="${W}" height="${H}" style="position:absolute;inset:0;opacity:.12"><defs><pattern id="g" width="54" height="54" patternUnits="userSpaceOnUse"><circle cx="4" cy="4" r="3" fill="#000"/></pattern></defs><rect width="${W}" height="${H}" fill="url(#g)"/></svg>`, body, logo: 'black', pagebg: ctx.acc, css: '.look-chat .em{font-style:italic}' };
  },
  { bg: ctx => `<div style="position:absolute;inset:0;background:${ctx.acc}"></div>`, logo: 'black', pagebg: ctx => ctx.acc, head: 'h' });

// 9 MYTH — black MYTH half (serif italic, struck through) over a white FACT half (zig-zag seam)
const mythBg = (split) => { let p = `0,${split}`; for (let x = 0; x <= W; x += 45) p += ` ${x},${split + ((x / 45) % 2 ? 18 : -18)}`; return `<svg width="${W}" height="${H}" style="position:absolute;inset:0"><rect width="${W}" height="${H}" fill="#fff"/><polygon points="0,0 ${W},0 ${W},${split} ${p.split(' ').reverse().join(' ')}" fill="${INK}"/></svg>`; };
D('myth', 'myth vs fact — one myth per slide, facts from the verified list with a source',
  (s, ctx) => {
    const v = s.v, t = T[ctx.lang], acc = ctx.acc;
    let body = '';
    if (ctx.role === 'cover' || (ctx.role === 'single' && !v.myth)) {
      body += `<div class="poster" data-c="mythword" data-bg="${INK}" style="position:absolute;left:${M}px;top:190px;width:920px"><div class="fitw" data-max="230" data-min="80" style="font:900 100px/1 Mont;text-transform:uppercase;letter-spacing:-.04em;white-space:nowrap;color:${acc}">${esc(t.myth)}</div></div>`;
      body += col(`left:${M}px;top:450px;width:920px;height:230px`, [{ html: md(s.headline), fs: 78, min: 46, style: 'font:800 1em/1.05 Mont;letter-spacing:-.02em;color:#fff', c: 'headline' }], { v: 'start', bg: INK });
      body += `<div class="poster" data-c="factword" style="position:absolute;left:${M}px;top:780px;width:920px"><div class="fitw" data-max="150" data-min="60" style="font:900 100px/1 Mont;text-transform:uppercase;letter-spacing:-.04em;white-space:nowrap;color:${INK}"><span style="font:italic 400 .8em Serif;letter-spacing:0">${esc(t.vs)}</span> ${esc(t.fact)}</div></div>`;
      body += col(`left:${M}px;top:960px;width:920px;height:190px`, [s.lines?.length && { html: s.lines.map(ln).join(''), fs: 44, min: 30, style: 'font:600 1em/1.3 Inter;color:#111', c: 'body' }], { v: 'start' });
    } else {
      body += `<div class="poster" data-c="mythword" data-bg="${INK}" style="position:absolute;left:${M}px;top:196px;width:760px"><div class="fitw" data-max="110" data-min="60" style="font:900 100px/1 Mont;text-transform:uppercase;letter-spacing:-.03em;white-space:nowrap;color:${acc}">${esc(t.myth)}</div></div>`;
      body += `<div data-c="x" style="position:absolute;right:${M}px;top:190px;width:120px;height:120px;border-radius:50%;border:6px solid ${acc};display:grid;place-items:center">${cross(64, acc)}</div>`;
      body += col(`left:${M}px;top:350px;width:920px;height:300px`, [{ html: `<span style="text-decoration:line-through;text-decoration-color:${acc};text-decoration-thickness:.06em">${md(v.myth || s.headline)}</span>`, fs: 96, min: 50, style: 'font:italic 400 1em/1.05 Serif;color:#fff', c: 'myth' }], { v: 'center', bg: INK });
      body += `<div class="poster" data-c="factword" style="position:absolute;left:${M}px;top:752px;width:760px"><div class="fitw" data-max="110" data-min="60" style="font:900 100px/1 Mont;text-transform:uppercase;letter-spacing:-.03em;white-space:nowrap;color:${INK}">${esc(t.fact)}</div></div>`;
      body += `<div data-c="ok" style="position:absolute;right:${M}px;top:746px;width:120px;height:120px;border-radius:50%;background:${ACC.green};display:grid;place-items:center">${tick(70, INK)}</div>`;
      body += col(`left:${M}px;top:900px;width:920px;height:250px`, [
        { html: md(v.fact || (s.lines || []).join(' ')), fs: 46, min: 30, style: 'font:600 1em/1.3 Inter;color:#111', c: 'fact', w: 1.2 },
        s.source && { html: `${t.source}: ${esc(s.source)}`, fs: 30, min: 30, style: 'font:500 1em/1.3 Inter;color:#555', c: 'source' },
      ], { gap: 22 });
    }
    return { bg: mythBg(700), body, logo: 'white', foot: 'light', footbg: '#FFFFFF', pagebg: '#FFFFFF', css: `.look-myth .em{font-style:normal;color:${acc}}` };
  },
  { bg: () => mythBg(560), logo: 'white', foot: 'light', footbg: '#FFFFFF', pagebg: '#FFFFFF', text: INK, head: 'h', endPos: `left:${M}px;top:620px;width:920px;height:530px` });

// 10 ASK — a question card: big question, A / B / C answer bars, a ghost "?" (comments)
D('ask', 'questions and polls ("comment A, B or C"), this-or-that',
  (s, ctx) => {
    const v = s.v, L = 'ABCDEF';
    let body = `<div data-decor="1" style="position:absolute;left:50%;top:40px;transform:translateX(-50%);font:italic 400 1250px/1 Serif;color:rgba(0,0,0,.08)">?</div>`;
    if (ctx.role === 'content') {
      const k = L[(ctx.i - 1) % 6];
      body += `<div data-c="letter" style="position:absolute;left:${M}px;top:190px;width:280px;height:280px;border-radius:50%;background:${INK};color:#fff;display:grid;place-items:center;font:900 190px/1 Mont">${esc(v.letter || k)}</div>`;
      body += col(`left:${M}px;top:520px;width:920px;height:630px`, [
        { html: md(s.headline), fs: 84, min: 48, style: 'font:800 1em/1.06 Mont;letter-spacing:-.02em', c: 'headline', w: 1.2 },
        s.lines?.length && { html: s.lines.map(ln).join(''), fs: 44, min: 30, style: 'font:500 1em/1.35 Inter;color:#111', c: 'body' },
      ], { gap: 34 });
    } else {
      const o = (v.options || []).slice(0, 3);
      const opts = `<div style="display:flex;justify-content:center;gap:.9em">${o.map((t, i) => `<div style="flex:1;max-width:${o.length === 2 ? 7 : 5.6}em;display:flex;flex-direction:column;align-items:center;gap:.45em;text-align:center"><span style="flex:none;width:3.6em;height:3.6em;border-radius:50%;background:${INK};color:#fff;display:grid;place-items:center;box-shadow:0 .22em 0 rgba(0,0,0,.2)"><span style="font:900 1.8em/1 Mont">${L[i]}</span></span><span>${md(t)}</span></div>`).join('')}</div>`;
      body += col(`left:${M}px;top:196px;width:920px;height:954px`, [
        { html: md(s.headline), fs: 96, min: 52, max: 108, style: 'font:800 1em/1.04 Mont;letter-spacing:-.02em;text-align:center', c: 'headline', w: 1.2 },
        { fix: true, html: `<div style="display:flex;align-items:center;gap:18px;justify-content:center;flex:none"><span style="height:4px;width:120px;background:${INK}"></span><span style="font:800 30px/1 Inter;letter-spacing:.16em;text-transform:uppercase">${ctx.lang === 'es' ? 'Vota' : 'Vote'}</span><span style="height:4px;width:120px;background:${INK}"></span></div>` },
        o.length && { html: opts, fs: 40, min: 30, max: 54, style: 'font:700 1em/1.15 Inter;color:#0B0B0B', c: 'options' },
        s.lines?.length && { html: s.lines.map(ln).join(''), fs: 40, min: 30, style: 'font:600 1em/1.3 Inter;text-align:center', c: 'body' },
      ], { gap: 56, v: 'center' });
    }
    return { bg: `<div style="position:absolute;inset:0;background:${ctx.acc}"></div>`, body, logo: 'black', pagebg: ctx.acc, css: '.look-ask .em{font-style:normal;text-decoration:underline;text-decoration-thickness:.1em;text-underline-offset:.1em}' };
  },
  { bg: ctx => `<div style="position:absolute;inset:0;background:${ctx.acc}"></div><div data-decor="1" style="position:absolute;right:20px;top:-60px;font:italic 400 900px/1 Serif;color:rgba(0,0,0,.08)">?</div>`, logo: 'black', pagebg: ctx => ctx.acc, head: 'h' });

// 11 DICHO — Spanish saying on a cream panel inside a cement-tile (losa) frame
const tileBg = (acc, top = 176) => {
  const T0 = 64, x0 = 28, rows = Math.floor((1140 - top) / T0), h = rows * T0;
  return `<svg width="${W}" height="${H}" style="position:absolute;inset:0"><defs><pattern id="tl" width="${T0}" height="${T0}" patternUnits="userSpaceOnUse" x="${x0}" y="${top}">
<rect width="${T0}" height="${T0}" fill="${INK}"/><path d="M32 7 L57 32 L32 57 L7 32Z" fill="none" stroke="${acc}" stroke-width="4"/><path d="M32 19 L45 32 L32 45 L19 32Z" fill="${PAPER}"/><circle cx="32" cy="32" r="5" fill="${acc}"/>
<circle cx="0" cy="0" r="11" fill="${acc}"/><circle cx="${T0}" cy="0" r="11" fill="${acc}"/><circle cx="0" cy="${T0}" r="11" fill="${acc}"/><circle cx="${T0}" cy="${T0}" r="11" fill="${acc}"/></pattern></defs>
<rect width="${W}" height="${H}" fill="${INK}"/><rect x="${x0}" y="${top}" width="${16 * T0}" height="${h}" fill="url(#tl)"/><rect x="${x0 + T0}" y="${top + T0}" width="${14 * T0}" height="${h - 2 * T0}" rx="6" fill="${PAPER}"/></svg>`;
};
D('dicho', 'Spanish-first relatable posts: a known dicho + what it means for the business',
  (s, ctx) => {
    const v = s.v;
    const body = col(`left:150px;top:290px;width:780px;height:770px`, [
      { html: esc(v.kicker || (ctx.role === 'single' ? T[ctx.lang].dicho : `${T[ctx.lang].dicho} ${ctx.i + 1}`)), fs: 30, min: 30, style: 'font:700 1em/1 Inter;letter-spacing:.24em;text-transform:uppercase;color:#4A3F2A', c: 'kicker' },
      { html: `“${md(v.saying || s.headline)}”`, fs: 96, min: 52, style: 'font:italic 400 1em/1.06 Serif;color:#0B0B0B', c: 'saying', w: 1.3 },
      { fix: true, html: `<div style="width:130px;height:8px;border-radius:4px;background:${INK};flex:none"></div>` },
      s.lines?.length && { html: s.lines.map(ln).join(''), fs: 42, min: 30, style: 'font:500 1em/1.38 Inter;color:#2B2B2B', c: 'body' },
    ], { gap: 40, v: 'center', align: 'center', bg: PAPER });
    return { bg: tileBg(ctx.acc), body, logo: 'white', foot: 'dark', footbg: INK, pagebg: INK, css: '.look-dicho .em{font-style:normal}' };
  },
  { bg: ctx => tileBg(ctx.acc, 300), logo: 'white', foot: 'dark', footbg: INK, pagebg: PAPER, text: INK, head: 'serif', align: 'center', endPos: 'left:150px;top:420px;width:780px;height:620px', css: () => '.look-dicho .em{font-style:normal}' });

// 12 TIPS — a grid of icon tiles on a warm gradient (share-to-Story utility)
const tipsBg = acc => `<div style="position:absolute;inset:0;background:linear-gradient(165deg, #FFF8EC 0%, #FFF8EC 30%, ${acc} 100%)"></div>`;
D('tips', 'utility people share or save: "4 things customers check", icon grids',
  (s, ctx) => {
    const v = s.v;
    const items = (v.items || (s.lines || []).map(l => { const [i, a, b] = l.split('|'); return { icon: i, label: a, sub: b }; })).slice(0, 6);
    let body = '';
    if (ctx.role === 'content') {
      const it = items[0] || { icon: v.icon || 'globe' };
      body += col(`left:${M}px;top:200px;width:920px;height:950px`, [
        { fix: true, html: `<div data-c="icon" style="width:250px;height:250px;border-radius:50%;background:${INK};display:grid;place-items:center;flex:none;margin-bottom:26px">${icon(it.icon, 140, '#fff', 1.7)}</div>` },
        { html: md(s.headline || it.label), fs: 86, min: 48, style: 'font:800 1em/1.06 Mont;letter-spacing:-.02em', c: 'headline', w: 1.2 },
        s.lines?.length && { html: s.lines.map(ln).join(''), fs: 44, min: 30, style: 'font:500 1em/1.38 Inter;color:#1A1A1A', c: 'body' },
        s.source && { html: `${T[ctx.lang].source}: ${esc(s.source)}`, fs: 30, min: 30, style: 'font:500 1em/1.3 Inter;color:#444', c: 'source' },
      ], { gap: 34, v: 'center' });
    } else {
      const cols = items.length > 4 ? 3 : 2;
      const grid = `<div style="display:grid;grid-template-columns:repeat(${cols},1fr);gap:24px;height:${items.length > 4 ? 600 : 640}px;grid-auto-rows:1fr">${items.map(it => `<div class="clip" style="background:#fff;border-radius:36px;padding:.7em .5em;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:.4em;text-align:center;box-shadow:0 14px 30px rgba(0,0,0,.10);overflow:hidden">
<span style="width:2.6em;height:2.6em;border-radius:50%;background:${INK};display:grid;place-items:center;flex:none">${icon(it.icon, 64, '#fff', 1.8).replace('width="64" height="64"', 'width="64" height="64" style="width:1.5em;height:1.5em"')}</span>
<span style="font:800 1em/1.12 Inter;color:#0B0B0B">${md(it.label)}</span>${it.sub ? `<span style="font:500 1em/1.25 Inter;font-size:max(30px,.78em);color:#333">${md(it.sub)}</span>` : ''}</div>`).join('')}</div>`;
      body += col(`left:${M}px;top:196px;width:920px;height:954px`, [
        { html: md(s.headline), fs: 78, min: 46, style: 'font:800 1em/1.06 Mont;letter-spacing:-.02em;text-align:center', c: 'headline', w: 1.2 },
        { html: grid, fs: cols === 3 ? 36 : 42, min: 30, c: 'grid' },
      ], { gap: 44, v: 'center' });
    }
    return { bg: tipsBg(ctx.acc), body, logo: 'black', pagebg: '#FFF8EC', css: `.look-tips .em{font-style:normal;background:${ctx.acc};padding:0 .1em;-webkit-box-decoration-break:clone;box-decoration-break:clone}` };
  },
  { bg: ctx => tipsBg(ctx.acc), logo: 'black', pagebg: '#FFF8EC', head: 'h' });

const DEFAULT_ACC = { torn: 'orange', block: 'green', editorial: 'orange', number: 'blue', photo: 'orange', split: 'blue', paper: 'blue', chat: 'blue', myth: 'orange', ask: 'gold', dicho: 'gold', tips: 'orange' };

// the last slide of a carousel: big logo in the usual corner, headline + lines + one big CTA, in the look's skin
function endSlide(look, s, ctx) {
  const k = look.skin, val = x => typeof x === 'function' ? x(ctx) : x;
  const tone = k.text || INK, sub = tone === '#fff' ? '#E6E6E6' : '#222';
  const chipS = tone === '#fff' ? `background:#fff;color:${INK}` : `background:${INK};color:#fff`;
  const headStyle = k.head === 'serif' ? 'font:400 1em/1.02 Serif;letter-spacing:-.01em' : `font:800 1em/1.02 Mont;text-transform:uppercase;letter-spacing:-.025em;${k.headStyle || ''}`;
  const body = col(k.endPos || `left:${M}px;top:380px;width:920px;height:770px`, [
    { html: md(s.headline || ''), fs: 104, min: 54, style: `${headStyle};color:${tone}`, c: 'headline', w: 1.3 },
    s.lines?.length && { html: s.lines.map(ln).join(''), fs: 44, min: 30, style: `font:500 1em/1.36 Inter;color:${sub}`, c: 'body' },
    { html: `<span class="bigcta" style="display:inline-block;${chipS};border-radius:999px;padding:.5em 1em;font:800 1em/1 Mont;letter-spacing:.01em;white-space:nowrap">${esc(fill(ctx.cta))}</span>`, fs: 52, min: 32, c: 'bigcta' },
  ], { gap: 44, v: 'center', align: k.align || 'left' });
  return { bg: val(k.bg) || '', body, logo: k.logo, foot: k.foot || (tone === '#fff' ? 'dark' : 'light'), footbg: val(k.footbg) || val(k.pagebg), pagebg: val(k.pagebg), css: val(k.css) || '' };
}

// ---------- page + in-page checks ----------
const BASE_CSS = `*{margin:0;padding:0;box-sizing:border-box}html,body{width:${W}px;height:${H}px}body{overflow:hidden;position:relative;font-family:Inter,'Noto Color Emoji',sans-serif;-webkit-font-smoothing:antialiased}
.col{display:flex;flex-direction:column}.col>*{flex:none;width:100%}.col[style*="align-items:center"]>*{width:auto;max-width:100%}
.h{font-family:Mont;font-weight:800;text-transform:uppercase;letter-spacing:-.02em;line-height:1}
.chip{display:inline-flex;align-items:center;gap:.4em;border-radius:999px;padding:16px 28px;font:800 30px/1 Mont;letter-spacing:.02em;white-space:nowrap}
.em{font-style:italic}
.fit{text-wrap:pretty}.fit[data-c=label],.fit[data-c=kicker]{text-wrap:balance}`;
const html = (r, ctx) => `<!doctype html><html><head><meta charset="utf-8"><style>${FONT_CSS}\n${BASE_CSS}\n${r.css || ''}</style></head>
<body class="look-${ctx.look}" data-bg="${r.pagebg || '#000'}" style="background:${r.pagebg || '#000'}">${r.bg || ''}${r.body}${chrome(ctx, r)}</body></html>`;

function inPage({ carousel }) {
  const warn = [];
  const px = v => parseFloat(v) || 0;
  // 1) poster lines: each line fills the width, then the stack fits its max height
  for (const p of document.querySelectorAll('.poster')) {
    const lines = [...p.querySelectorAll('.fitw')], Wd = p.clientWidth;
    for (const el of lines) { el.style.display = 'inline-block'; el.style.fontSize = '100px'; const w = el.getBoundingClientRect().width; let fs = Math.min(+el.dataset.max, Math.floor(100 * Wd / w)); el.style.fontSize = fs + 'px'; while (el.getBoundingClientRect().width > Wd && fs > 10) el.style.fontSize = (--fs) + 'px'; el.style.display = 'block'; }
    const maxh = +p.dataset.maxh || 9999; let k = 0;
    while (p.getBoundingClientRect().height > maxh && k++ < 200) for (const el of lines) el.style.fontSize = (px(el.style.fontSize) * 0.97) + 'px';
    for (const el of lines) if (px(el.style.fontSize) < +el.dataset.min) warn.push(`OVERFLOW poster line "${el.textContent.slice(0, 24)}" at ${Math.round(px(el.style.fontSize))}px`);
  }
  // 2) columns: shrink the kid that has used least of its range until the column fits
  for (const col of document.querySelectorAll('.col')) {
    const kids = [...col.querySelectorAll(':scope > .fit')];
    const all = [...col.children];
    const gap = px(getComputedStyle(col).rowGap);
    const maxH = col.dataset.maxh ? +col.dataset.maxh : col.clientHeight - px(getComputedStyle(col).paddingTop) - px(getComputedStyle(col).paddingBottom);
    const contentH = () => all.reduce((h, e) => { const cs = getComputedStyle(e); return h + e.getBoundingClientRect().height + px(cs.marginTop) + px(cs.marginBottom); }, 0) + gap * Math.max(0, all.length - 1);
    const kidBad = k => k.scrollWidth > k.clientWidth + 1 || (k.dataset.maxh && k.getBoundingClientRect().height > +k.dataset.maxh) || [...k.querySelectorAll('.clip')].some(c => c.scrollHeight > c.clientHeight + 1 || c.scrollWidth > c.clientWidth + 1);
    for (const k of kids) { let fs = +k.dataset.fs; const min = +k.dataset.min; k.style.fontSize = fs + 'px'; while (kidBad(k) && fs > min) { fs -= 1; k.style.fontSize = fs + 'px'; } }
    let g = 0;
    while (contentH() > maxH + 1 && g++ < 600) {
      let best = null, br = -1;
      for (const k of kids) { const fs = px(k.style.fontSize), min = +k.dataset.min, f0 = +k.dataset.fs; if (fs <= min) continue; const r = ((fs - min) / (f0 - min + 1)) * (+k.dataset.w || 1); if (r > br) { br = r; best = k; } }
      if (!best) break;
      best.style.fontSize = (px(best.style.fontSize) - 1) + 'px';
      for (const k of kids) { let fs = px(k.style.fontSize); while (kidBad(k) && fs > +k.dataset.min) { fs -= 1; k.style.fontSize = fs + 'px'; } }
    }
    // grow kids that allow it (data-max) while everything still fits
    const growable = kids.filter(k => k.dataset.max);
    let g2 = 0;
    while (growable.length && contentH() < maxH - 2 && g2++ < 400) {
      let best = null, br = 9;
      for (const k of growable) { const fs = px(k.style.fontSize), mx = +k.dataset.max, f0 = +k.dataset.fs; if (fs >= mx) continue; const r = (fs - f0) / (mx - f0 + 1); if (r < br) { br = r; best = k; } }
      if (!best) break;
      const fs = px(best.style.fontSize); best.style.fontSize = (fs + 1) + 'px';
      if (contentH() > maxH || kidBad(best)) { best.style.fontSize = fs + 'px'; growable.splice(growable.indexOf(best), 1); }
    }
    if (contentH() > maxH + 1) warn.push(`OVERFLOW ${col.dataset.name}: ${Math.round(contentH())} > ${Math.round(maxH)} px`);
    for (const k of kids) if (kidBad(k)) warn.push(`OVERFLOW ${k.dataset.c}: too wide at ${px(k.style.fontSize)}px`);
  }
  // body lines: a line that wraps once is balanced (two even lines); longer ones stay "pretty" (no lone last word)
  for (const el of document.querySelectorAll('.ln')) { const lh = px(getComputedStyle(el).lineHeight); if (lh && Math.round(el.getBoundingClientRect().height / lh) === 2) el.style.textWrap = 'balance'; }
  // a lone word on the last line of a headline / fact / line (Chromium's "pretty" skips text with styled inline boxes): balance that block
  //   — unless the author placed the line breaks (\n → <br>)
  const lastLineWords = el => { const rs = [], r = document.createRange(), tw = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
    while (tw.nextNode()) { const n = tw.currentNode, t = n.textContent; const re = /\S+/g; let m; while ((m = re.exec(t))) { r.setStart(n, m.index); r.setEnd(n, m.index + m[0].length); const q = [...r.getClientRects()].pop(); if (q && q.width) rs.push({ top: q.top, w: m[0] }); } }
    if (!rs.length) return { lines: 0, last: 0 }; const tops = [...new Set(rs.map(x => Math.round(x.top / 8)))]; const lastTop = Math.max(...rs.map(x => x.top));
    return { lines: tops.length, last: rs.filter(x => Math.abs(x.top - lastTop) < 8).filter(x => /[\p{L}\p{N}]/u.test(x.w)).length }; };
  for (const el of document.querySelectorAll('.fit[data-c=headline], .fit[data-c=fact], .fit[data-c=myth], .fit[data-c=saying], .fit[data-c=body], .ln')) {
    if (el.querySelector('br') || el.style.textWrap === 'balance') continue;
    const targets = el.classList.contains('ln') ? [el] : (el.querySelector('.ln') ? [] : [el]);
    for (const t of targets) { const { lines, last } = lastLineWords(t); if (lines >= 2 && last === 1) t.style.textWrap = 'balance'; }
  }
  // 3) elements that sit above another (the SAMPLE PHOTO tag above the photo panel)
  for (const a of document.querySelectorAll('.above')) { const ref = document.querySelector('.col[data-name=panel]'); if (ref) a.style.top = (ref.getBoundingClientRect().top - a.getBoundingClientRect().height - (+a.dataset.gap || 18)) + 'px'; }
  // footer: the left item must leave room for the handle
  { const L = document.querySelector('.footL > *'), R = document.querySelector('.footR > *');
    if (L && R) { const gap = () => R.getBoundingClientRect().left - L.getBoundingClientRect().right;
      if (gap() < 32 && L.classList.contains('chip')) { L.style.fontFamily = 'Inter'; L.style.letterSpacing = '0'; L.style.padding = '16px 22px'; }
      if (gap() < 32) warn.push(`FOOTER the left item runs into the handle (${Math.round(gap())} px) — shorten the CTA`); } }
  // block posters sit centred in the space above their sub-line
  for (const p of document.querySelectorAll('.poster[data-center]')) { const ref = document.querySelector(p.dataset.center); if (!ref) continue; const top0 = 196, bot = ref.getBoundingClientRect().top - 56, h = p.getBoundingClientRect().height; p.style.top = (top0 + Math.max(0, (bot - top0 - h) / 2)) + 'px'; }
  // 4) checks
  const union = (u, r) => !u ? { left: r.left, top: r.top, right: r.right, bottom: r.bottom } : { left: Math.min(u.left, r.left), top: Math.min(u.top, r.top), right: Math.max(u.right, r.right), bottom: Math.max(u.bottom, r.bottom) };
  const tight = el => {
    if (el.tagName === 'IMG' || el.dataset.c === 'phone' || el.dataset.c === 'card' || el.dataset.c === 'before' || el.dataset.c === 'sticker' || el.dataset.c === 'x' || el.dataset.c === 'ok' || el.dataset.c === 'letter' || el.dataset.c === 'icon' || el.dataset.c === 'samp' || el.dataset.c === 'tag' || el.dataset.c === 'tagA' || el.dataset.c === 'tagB' || el.classList.contains('chip') || el.classList.contains('poster')) return el.getBoundingClientRect();
    let u = null; const r = document.createRange(), tw = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
    while (tw.nextNode()) { const n = tw.currentNode; if (!n.textContent.trim() || n.parentElement.closest('[data-decor]')) continue; r.selectNodeContents(n); for (const q of r.getClientRects()) if (q.width && q.height) u = union(u, q); }
    for (const m of el.querySelectorAll('svg,img,.bigcta')) { const q = m.getBoundingClientRect(); if (q.width && !m.closest('[data-decor]')) u = union(u, q); }
    return u || el.getBoundingClientRect();
  };
  const marked = [...document.querySelectorAll('[data-c]')].filter(e => !e.closest('[data-decor]'));
  const rects = marked.map(e => ({ e, r: tight(e) }));
  for (let i = 0; i < rects.length; i++) for (let j = i + 1; j < rects.length; j++) {
    const A = rects[i], B = rects[j];
    if (A.e.contains(B.e) || B.e.contains(A.e) || (A.e.dataset.group && A.e.dataset.group === B.e.dataset.group)) continue;
    const ix = Math.min(A.r.right, B.r.right) - Math.max(A.r.left, B.r.left), iy = Math.min(A.r.bottom, B.r.bottom) - Math.max(A.r.top, B.r.top);
    if (ix > 3 && iy > 3) warn.push(`OVERLAP ${A.e.dataset.c}×${B.e.dataset.c} (${Math.round(ix)}×${Math.round(iy)})`);
  }
  for (const { e, r } of rects) {
    if (r.left < -0.5 || r.top < -0.5 || r.right > 1080.5 || r.bottom > 1350.5) warn.push(`OUTSIDE ${e.dataset.c}`);
    else if (!['phone', 'before', 'sticker'].includes(e.dataset.c) && (r.left < 79 || r.right > 1001)) warn.push(`SAFE ${e.dataset.c} x ${Math.round(r.left)}–${Math.round(r.right)}`);
    if (carousel && r.right > 900 && r.top < 110) warn.push(`COUNTER ${e.dataset.c}`);
  }
  // contrast + size for every visible text leaf
  const rgb = s => { const m = s.match(/rgba?\(([^)]+)\)/); if (!m) { const h = s.replace('#', ''); if (h.length >= 6) return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16), 1]; return [0, 0, 0, 0]; } const p = m[1].split(',').map(Number); return [p[0], p[1], p[2], p[3] ?? 1]; };
  const lum = ([r, g, b]) => { const f = c => { c /= 255; return c <= .03928 ? c / 12.92 : ((c + .055) / 1.055) ** 2.4; }; return .2126 * f(r) + .7152 * f(g) + .0722 * f(b); };
  const blend = (fg, bg) => [0, 1, 2].map(i => fg[i] * fg[3] + bg[i] * (1 - fg[3])).concat(1);
  const bgOf = el => { const stack = []; for (let e = el; e; e = e.parentElement) { if (e.dataset && e.dataset.bg) { let c = rgb(e.dataset.bg); for (const s of stack.reverse()) c = blend(s, c); return c; } const c = rgb(getComputedStyle(e).backgroundColor); if (c[3] >= .99) { let out = c; for (const s of stack.reverse()) out = blend(s, out); return out; } if (c[3] > 0) stack.push(c); } return [0, 0, 0, 1]; };
  const seen = new Set();
  for (const el of document.body.querySelectorAll('*')) {
    if (el.closest('[data-decor]') || el.closest('svg')) continue;
    const own = [...el.childNodes].some(n => n.nodeType === 3 && n.textContent.trim());
    if (!own) continue;
    const cs = getComputedStyle(el); if (cs.visibility === 'hidden' || +cs.opacity === 0) continue;
    const fg = rgb(cs.color), bg = bgOf(el), f = blend(fg, bg);
    const L1 = lum(f), L2 = lum(bg), ratio = (Math.max(L1, L2) + .05) / (Math.min(L1, L2) + .05);
    const txt = el.textContent.trim().slice(0, 26);
    if (ratio < 4.5 && !seen.has('c' + txt)) { seen.add('c' + txt); warn.push(`CONTRAST ${ratio.toFixed(2)} "${txt}"`); }
    if (px(cs.fontSize) < 29.5 && !seen.has('s' + txt)) { seen.add('s' + txt); warn.push(`SMALL ${px(cs.fontSize).toFixed(0)}px "${txt}"`); }
  }
  return warn;
}

// ---------- run ----------
const posts = JSON.parse(readFileSync(SRC, 'utf8'));
const br = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--no-sandbox', '--no-proxy-server'] });
const pg = await br.newPage({ viewport: { width: W, height: H } });

// the food sample screen prints a star rating: paint that band out before it is used anywhere
SCREEN_URL = await pg.evaluate(async (srcs) => {
  const out = {};
  for (const [n, src] of Object.entries(srcs)) {
    const im = new Image(); im.src = src; await im.decode();
    const c = document.createElement('canvas'); c.width = im.width; c.height = im.height; const g = c.getContext('2d'); g.drawImage(im, 0, 0);
    if (n === 'food') {   // "★ 4.8 on Google" sits at y ≈ 1085–1115 of 1298: blend the rows above into the rows below over that band
      const y0 = Math.round(im.height * 1060 / 1298), y1 = Math.round(im.height * 1135 / 1298);
      const top = g.getImageData(0, y0 - 2, im.width, 1).data, bot = g.getImageData(0, y1 + 2, im.width, 1).data, band = g.createImageData(im.width, y1 - y0);
      for (let y = 0; y < y1 - y0; y++) { const f = y / (y1 - y0); for (let x = 0; x < im.width; x++) for (let c = 0; c < 4; c++) band.data[(y * im.width + x) * 4 + c] = c === 3 ? 255 : top[x * 4 + c] * (1 - f) + bot[x * 4 + c] * f; }
      g.putImageData(band, 0, y0);
    }
    out[n] = c.toDataURL('image/jpeg', .9);
  }
  return out;
}, Object.fromEntries(SCREENS.map(n => [n, b64(`${ASSETS}hero-sample-${n}.jpg`, 'image/jpeg')])));

const manifest = [], firsts = [];
for (const post of posts) {
  const look = LOOKS[post.look];
  if (!look) { console.log(`${post.id}: unknown look "${post.look}" (${Object.keys(LOOKS).join(', ')})`); continue; }
  const lang = post.lang === 'es' ? 'es' : 'en', slides = post.slides || [];
  const carousel = post.format === 'carousel';
  if (carousel && (slides.length < 2 || slides.length > 10)) console.log(`${post.id}: a carousel needs 2–10 slides (has ${slides.length})`);
  const acc = ACC[post.accent || DEFAULT_ACC[post.look]] || ACC.orange;
  const cta = post.cta || ctaFor(post.kind, lang);
  post._photo = slides.map(s => (s.visual || {}).photo || s.photo).find(Boolean);
  const files = [], alt = [];
  for (let i = 0; i < (carousel ? slides.length : 1); i++) {
    const s0 = slides[i] || {}, s = { ...s0, v: { ...s0, ...(s0.visual || {}) } };
    const role = !carousel ? 'single' : i === 0 ? 'cover' : i === slides.length - 1 ? 'end' : 'content';
    const ctx = { post, look: post.look, lang, acc, cta, role, i, n: slides.length };
    const pre = [];
    const allText = JSON.stringify(s0);
    if (/\$\s?\d/.test(allText)) pre.push('PRICE literal $ amount — use {price.starter} / {price.pro} / {price.care}');
    if (/\d\s?%|percent|por ciento/i.test(allText) && !s0.source) pre.push('STAT a percentage with no source');
    const words = t => plain(t || '').split(/\s+/).filter(Boolean).length;
    const bodyWords = (s0.lines || []).concat([(s0.visual || {}).fact || s0.fact || '']).reduce((n, t) => n + words(t), 0);
    if (bodyWords > 30) pre.push(`WORDS body has ${bodyWords} words (keep ≤ 30)`);
    if (words(s0.headline) > 12) pre.push(`WORDS headline has ${words(s0.headline)} words (keep ≤ 12)`);
    let r;
    try { r = role === 'end' ? endSlide(look, s, ctx) : look.fn(s, ctx); }
    catch (e) { console.log(`${post.id}: ERROR ${e.message} — post skipped`); files.length = 0; break; }
    await pg.setContent(html(r, ctx), { waitUntil: 'load' });
    await pg.evaluate(() => document.fonts.ready);
    await pg.evaluate(() => Promise.all([...document.images].map(i => i.decode().catch(() => {}))));
    const warn = pre.concat(await pg.evaluate(inPage, { carousel }));
    const file = `${OUT}/${post.id}${carousel ? '-' + (i + 1) : ''}.jpg`;
    let q = 90; await pg.screenshot({ path: file, type: 'jpeg', quality: q });
    while (statSync(file).size > 1024 * 1024 && q > 40) { q -= 8; await pg.screenshot({ path: file, type: 'jpeg', quality: q }); }
    if (statSync(file).size > 1024 * 1024) warn.push('SIZE over 1 MB');
    const kb = Math.round(statSync(file).size / 1024);
    console.log(`${file.split('/').pop()}  ${post.look}/${role}  ${kb} KB q${q}  ${warn.length ? warn.join(' | ') : 'ok'}`);
    files.push(file.split('/').pop());
    const v = s.v;
    alt.push(plain([s0.headline, v.myth, v.fact, v.saying, v.number && `${v.number} ${v.label || ''}`, ...(s0.lines || []), ...(v.options || []), ...((v.items || []).map(x => x.label)), ...((v.stickers || []))].filter(Boolean).join(' · ')).replace(/\[[x ]\]\s*/gi, '').replace(/\s*\n\s*/g, ' ').slice(0, 300));
    if (i === 0) firsts.push({ file, carousel });
  }
  if (files.length) manifest.push({ id: post.id, look: post.look, kind: post.kind, lang, format: carousel ? 'carousel' : 'single', files, alt });
}
writeFileSync(`${OUT}/manifest.json`, JSON.stringify(manifest, null, 1));

// profile-grid mock: first slides, in order, 3 across, 3:4 tiles (the centre 1012×1350 of each post)
if (firsts.length) {
  const tile = 360, th = 480, rows = Math.ceil(firsts.length / 3);
  const cells = firsts.map(f => `<div style="position:relative;width:${tile}px;height:${th}px;overflow:hidden;background:#ddd"><img src="${b64(f.file, 'image/jpeg')}" style="width:100%;height:100%;object-fit:cover;object-position:center">${f.carousel ? `<svg width="34" height="34" viewBox="0 0 24 24" style="position:absolute;right:12px;top:12px;filter:drop-shadow(0 1px 2px rgba(0,0,0,.6))"><rect x="7" y="3" width="14" height="14" rx="2.5" fill="none" stroke="#fff" stroke-width="2"/><rect x="3" y="7" width="14" height="14" rx="2.5" fill="#fff"/></svg>` : ''}</div>`).join('');
  await pg.setViewportSize({ width: tile * 3 + 8, height: rows * th + (rows - 1) * 4 });
  await pg.setContent(`<!doctype html><html><body style="margin:0;background:#fff"><div style="display:grid;grid-template-columns:repeat(3,${tile}px);gap:4px">${cells}</div></body></html>`);
  await pg.evaluate(() => Promise.all([...document.images].map(i => i.decode())));
  await pg.screenshot({ path: `${OUT}/grid.jpg`, type: 'jpeg', quality: 82, fullPage: true });
  console.log(`${OUT}/grid.jpg  ${firsts.length} tiles`);
}
await br.close();
