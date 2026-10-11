// node carousel.mjs → out/carousel/sdx-NN.jpg  @sdxinspection carousel (1080×1350, 4:5) built from the demo-venue screens in out/stills
// (run stills.mjs first; the phone screens temps/problem/crew/portal/guide.jpg are frames of out/pov_<clip>/master.mp4)
import { mkdirSync } from 'fs';
import { chromium } from 'playwright';
import { C, TEAL, lockup, fontCss } from './sdxmark.mjs';
const DIR = new URL('.', import.meta.url).pathname;
const ST = `file://${DIR}out/stills/`;
const OUT = DIR + 'out/carousel/';
mkdirSync(OUT, { recursive: true });

const phone = (src, { h = 760, x = 0, y = 0, rot = 0, z = 1, tag = '' } = {}) => `<div class="ph" style="height:${h}px;left:${x}px;top:${y}px;transform:rotate(${rot}deg);z-index:${z}"><img src="${ST}${src}">${tag}</div>`;
const laptop = (src, { w = 900, x = 0, y = 0, rot = 0, z = 1 } = {}) => `<div class="lp" style="width:${w}px;left:${x}px;top:${y}px;transform:rotate(${rot}deg);z-index:${z}"><div class="scr"><img src="${ST}${src}"></div></div>`;
const pill = (t, c) => `<span class="tag" style="background:${c}">${t}</span>`;

const SLIDES = [
  { k: 'One app · every stand', h: 'Paper gets lost.<br><em>Phones don’t.</em>', s: 'The inspection app for food stands and kitchens — from the walk to the fix.',
    m: phone('portal.jpg', { h: 640, x: 110, y: 50, rot: -9 }) + phone('problem.jpg', { h: 640, x: 676, y: 50, rot: 9 }) + phone('temps.jpg', { h: 700, x: 378, y: 10, z: 3 }) },
  { k: 'The full inspection guide', h: 'Every check.<br><em>Every stand.</em>', s: 'Pick the type — event day, regular or post-event — and the guide puts the right sections first.',
    m: phone('guide.jpg', { h: 690, x: 180, y: 20, rot: -5 }) + phone('temps.jpg', { h: 690, x: 580, y: 20, rot: 5, z: 2 }) },
  { k: 'Temperatures', h: 'Too warm?<br><em>Flagged.</em>', s: 'Coolers 40°F or below, freezers 20°F or below. A bad reading turns red on the spot.',
    m: phone('temps.jpg', { h: 710, x: 376, y: 10 }) },
  { k: 'One QR poster per stand', h: 'Scan. Log.<br><em>Sent.</em>', s: 'The stand team scans their poster, types a name and phone — no app to install — and logs their temps.',
    m: laptop('posters.png', { w: 860, x: 40, y: 80 }) + phone('portal.jpg', { h: 640, x: 730, y: 60, z: 3 }) },
  { k: 'Before & after', h: 'Fixed —<br><em>with proof.</em>', s: 'The problem gets a BEFORE photo. The crew closes it with an AFTER photo — both stay on the report.',
    m: phone('problem.jpg', { h: 680, x: 170, y: 40, rot: -4, tag: pill('BEFORE', C.red) }) + phone('crew-after.jpg', { h: 680, x: 596, y: 40, rot: 4, z: 2, tag: pill('AFTER', C.green) }) },
  { k: 'Crews', h: 'Invite<br><em>your crew.</em>', s: 'Maintenance, cleaning and Ecolab open their own board from a link — no badge, no password.',
    m: laptop('invites.png', { w: 820, x: 40, y: 110 }) + phone('crewjoin.png', { h: 640, x: 730, y: 60, z: 3 }) },
  { k: 'Who didn’t log', h: 'Know who<br><em>isn’t scanning.</em>', s: 'Every stand that skipped its temperature log on event days, worst first — text them in one tap.',
    m: laptop('notscanning.png', { w: 960, x: 60, y: 120 }) },
  { k: 'Announcements', h: 'Tell every stand<br><em>at once.</em>', s: 'A recall, a reminder, a rule — it shows to whoever scans the stand QR.',
    m: phone('announce.png', { h: 710, x: 376, y: 10 }) },
  { k: 'Follow-ups', h: 'Nothing<br><em>slips.</em>', s: 'Every open problem in one list — by floor, by crew, by stand. Fixed, remind or add a photo in one tap.',
    m: phone('followups.png', { h: 710, x: 376, y: 10 }) },
];
const N = SLIDES.length + 1;

const css = `${fontCss(DIR)}@font-face{font-family:B;src:url(file://${DIR}fonts/BarlowCondensed-ExtraBoldItalic.ttf)}
*{margin:0;padding:0;box-sizing:border-box}
html,body{width:1080px;height:1350px;overflow:hidden}
body{background:radial-gradient(900px 700px at 85% 8%,rgba(51,195,176,.22),transparent 60%),radial-gradient(1100px 800px at 0% 100%,rgba(40,56,151,.55),transparent 60%),linear-gradient(160deg,${C.navy} 0%,${C.navyDeep} 55%,#14133a 100%);color:#fff;font-family:I,Arial;position:relative}
.k{position:absolute;left:72px;top:70px;font:600 24px I;letter-spacing:.16em;text-transform:uppercase;color:${TEAL}}
h1{position:absolute;left:72px;right:72px;top:112px;font:400 112px/0.95 B;text-transform:uppercase;letter-spacing:-.5px}
h1 em{font-style:normal;color:${TEAL}}
.s{position:absolute;left:72px;right:110px;top:350px;font:500 31px/1.38 I;color:rgba(255,255,255,.82)}
.m{position:absolute;left:0;right:0;top:470px;height:730px}
.ph{position:absolute;aspect-ratio:600/1298;border-radius:44px;background:#0b0b18;padding:11px;box-shadow:0 30px 70px rgba(0,0,0,.5),0 0 0 2px rgba(255,255,255,.14) inset}
.ph img{width:100%;height:100%;object-fit:cover;object-position:top;border-radius:34px;display:block}
.lp{position:absolute}
.lp .scr{background:#0b0b18;border-radius:22px 22px 10px 10px;padding:14px;box-shadow:0 30px 70px rgba(0,0,0,.5),0 0 0 2px rgba(255,255,255,.14) inset}
.lp img{width:100%;aspect-ratio:16/10;object-fit:cover;object-position:top;border-radius:10px;display:block}
.tag{position:absolute;left:50%;top:-22px;transform:translateX(-50%);font:800 24px I;letter-spacing:.12em;padding:10px 22px;border-radius:999px;color:#fff;box-shadow:0 8px 20px rgba(0,0,0,.35)}
.f{position:absolute;left:72px;right:72px;bottom:56px;display:flex;align-items:center;justify-content:space-between}
.n{font:600 24px I;color:rgba(255,255,255,.6);font-variant-numeric:tabular-nums}
.sw{font:800 24px I;color:${C.navyDeep};background:${TEAL};padding:10px 22px;border-radius:999px}
.end{position:absolute;left:72px;right:72px;top:300px}
.end h1{position:static;font-size:170px;line-height:.92}
.end p{font:500 34px/1.4 I;color:rgba(255,255,255,.85);margin-top:44px}
.end .cta{display:inline-block;margin-top:46px;font:800 38px I;background:#fff;color:${C.navy};padding:22px 34px;border-radius:20px}
.end .demo{font:600 30px I;color:${TEAL};margin-top:28px}`;
const footer = (i) => `<div class="f">${lockup(52)}<span class="n">${i}/${N}</span>${i < N ? '<span class="sw">swipe →</span>' : '<span></span>'}</div>`;
const page = (sl, i) => `<!doctype html><html><head><meta charset="utf-8"><style>${css}</style></head><body><div class="k">${sl.k}</div><h1>${sl.h}</h1><p class="s">${sl.s}</p><div class="m">${sl.m}</div>${footer(i)}</body></html>`;
const endPage = () => `<!doctype html><html><head><meta charset="utf-8"><style>${css}</style></head><body><div class="k">Walk it · fix it · prove it</div><div class="end"><h1>Walk it.<br>Fix it.<br><em>Prove it.</em></h1><p>Temps · problems · before &amp; after · crews · reports — in one app.</p><div class="cta">Free 30-day pilot — DM “PILOT”</div><div class="demo">Try the live demo — link in bio</div></div>${footer(N)}</body></html>`;

const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--no-sandbox', '--no-proxy-server', '--allow-file-access-from-files'] });
const p = await b.newPage({ viewport: { width: 1080, height: 1350 } });
const htmls = [...SLIDES.map((s, i) => page(s, i + 1)), endPage()];
for (let i = 0; i < htmls.length; i++) {
  const f = `${OUT}sdx-${String(i + 1).padStart(2, '0')}.html`;
  (await import('fs')).writeFileSync(f, htmls[i]);
  await p.goto('file://' + f); await p.evaluate(() => document.fonts.ready); await p.waitForTimeout(300);
  const bad = await p.evaluate(() => [...document.images].filter(im => !im.naturalWidth).map(im => im.src));
  const over = await p.evaluate(() => { const s = document.querySelector('.s'), m = document.querySelector('.m'), h = document.querySelector('h1'); return s && m ? { sBottom: Math.round(s.getBoundingClientRect().bottom), mTop: Math.round(m.getBoundingClientRect().top), hBottom: Math.round(h.getBoundingClientRect().bottom), sTop: Math.round(s.getBoundingClientRect().top) } : null; });
  await p.screenshot({ path: `${OUT}sdx-${String(i + 1).padStart(2, '0')}.jpg`, type: 'jpeg', quality: 90 });
  console.log(i + 1, bad.length ? 'BROKEN ' + bad.join(',') : 'ok', JSON.stringify(over));
}
await b.close();
