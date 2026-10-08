// node tools/ds/posts.mjs posts.json outDir → outDir/<NN>-<id>.jpg (1080×1350, Instagram feed)
// DS Marketing website posts in the offer-post look (black torn paper, DS logo, Montserrat 800 + Inter).
// posts.json = [{id, kind: tip|myth|process|checklist|compare|offer|spanish|faq, headline, lines[], cta,
//                visual: phones-food|phones-beauty|phones-fitness|phones-home|steps|checklist|vs|none}]
// The phone screens are the SAMPLE preview sites (tools/ds/assets/hero-sample-*.jpg) and are labelled "Sample sites".
import { chromium } from 'playwright';
import { mkdirSync, readFileSync } from 'fs';
const ROOT = new URL('../../', import.meta.url).pathname;
const V = `${ROOT}tools/video/`, A = `${ROOT}tools/ds/assets/`;
const [src, OUT] = process.argv.slice(2);
if (!src || !OUT) { console.log('usage: node tools/ds/posts.mjs posts.json outDir'); process.exit(1); }
mkdirSync(OUT, { recursive: true });
const posts = JSON.parse(readFileSync(src, 'utf8'));
const b64 = (p, t) => `data:${t};base64,` + readFileSync(p).toString('base64');
const font = `@font-face{font-family:M;src:url(${b64(V + 'fonts/Montserrat-800.woff2', 'font/woff2')});font-weight:800}
@font-face{font-family:I;src:url(${b64(V + 'fonts/inter500.woff2', 'font/woff2')});font-weight:500}@font-face{font-family:I;src:url(${b64(V + 'fonts/inter600.woff2', 'font/woff2')});font-weight:600}`;
const LOGO = b64(V + 'ds-logo.png', 'image/png');
const hero = n => b64(`${A}hero-sample-${n}.jpg`, 'image/jpeg');
const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;');
let seed = 11; const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
const torn = (w, h, cx) => { const pts = []; let x = cx; for (let y = 0; y <= h; y += 6 + rnd() * 10) { x += (rnd() - .5) * 26 + (cx - x) * .08; if (rnd() < .06) x += (rnd() - .5) * 90; pts.push(`${x.toFixed(1)},${y}`); }
  return `<svg width="${w}" height="${h}" style="position:absolute;inset:0" xmlns="http://www.w3.org/2000/svg"><defs><pattern id="d" width="9" height="9" patternUnits="userSpaceOnUse"><circle cx="2" cy="2" r="1.1" fill="#ffffff" fill-opacity=".05"/></pattern><filter id="s"><feDropShadow dx="-6" dy="0" stdDeviation="8" flood-opacity=".55"/></filter></defs>
  <rect width="${w}" height="${h}" fill="#050505"/><rect width="${w}" height="${h}" fill="url(#d)"/>
  <polygon filter="url(#s)" points="${w},0 ${pts.join(' ')} ${w},${h}" fill="#1c1c1c"/></svg>`; };
const phone = (n, x, y, w, rot, z = 1) => `<div class="ph" data-dy="${y - 600}" style="position:absolute;left:${x}px;top:${y}px;width:${w}px;height:${w * 844 / 390}px;transform:rotate(${rot}deg);z-index:${z};border-radius:${w * .14}px;background:#0d0d0d;padding:${w * .03}px;box-shadow:0 30px 60px rgba(0,0,0,.6),0 0 0 2px #2a2a2a">
<div style="width:100%;height:100%;border-radius:${w * .11}px;overflow:hidden;position:relative;background:url(${hero(n)}) top/cover"><div style="position:absolute;left:50%;top:${w * .03}px;transform:translateX(-50%);width:${w * .3}px;height:${w * .085}px;border-radius:99px;background:#0d0d0d"></div></div></div>`;
const KIND = { tip: 'TIP', myth: 'MYTH VS. FACT', process: 'HOW IT WORKS', checklist: "WHAT'S INCLUDED", compare: 'COMPARE', offer: 'MIAMI · WEB DESIGN', spanish: 'EN ESPAÑOL', faq: 'FAQ' };
const PAIR = { food: 'beauty', beauty: 'fitness', fitness: 'home', home: 'food' };

function inner(p) {
  const head = `<img src="${LOGO}" style="position:absolute;left:56px;top:52px;width:150px">
<div style="position:absolute;right:56px;top:66px" class="chip">${esc(KIND[p.kind] || 'DS MARKETING')}</div>
<div class="h fit" data-max="330" style="position:absolute;left:56px;right:56px;top:200px;font-size:92px">${esc(p.headline)}</div>`;
  const foot = `<div style="position:absolute;left:56px;bottom:60px"><span class="cta">${esc(p.cta || 'DM “WEBSITE”')}</span></div>
<div style="position:absolute;right:56px;bottom:80px;font:600 26px I;color:#9a9a9a">@dsmarketing.agency</div>`;
  const L = p.lines || [];
  let body = '';
  if (p.visual && p.visual.startsWith('phones-')) {
    const n = p.visual.slice(7), m = PAIR[n] || 'home';
    body = `<div class="flow" style="position:absolute;left:56px;width:500px">${L.map(t => `<div class="li"><b>—</b><span>${esc(t)}</span></div>`).join('')}</div>
${phone(m, 600, 600, 210, -6, 1)}${phone(n, 800, 630, 210, 7, 2)}
<div class="samp" style="position:absolute;right:66px;top:1112px;font:600 19px I;letter-spacing:.12em;color:#7a7a7a;text-transform:uppercase">Sample sites</div>`;
  } else if (p.visual === 'steps') {
    body = `<div class="flow" style="position:absolute;left:56px;right:56px">${L.map((t, i) => { const m = /^\s*(\d+)\s*[·.)-]\s*(.*)$/.exec(t); return `<div class="step"><span class="num">${m ? m[1] : i + 1}</span><span>${esc(m ? m[2] : t)}</span></div>`; }).join('')}</div>`;
  } else if (p.visual === 'checklist') {
    body = `<div class="flow" style="position:absolute;left:56px;right:56px">${L.map(t => `<div class="chk"><b>✓</b><span>${esc(t.replace(/^\s*✓\s*/, ''))}</span></div>`).join('')}</div>`;
  } else if (p.visual === 'vs') {
    const left = L.filter(t => /^link in bio/i.test(t)).map(t => t.replace(/^link in bio:\s*/i, ''));
    const right = L.filter(t => /^website/i.test(t)).map(t => t.replace(/^website:\s*/i, ''));
    const note = L.filter(t => !/^(link in bio|website)/i.test(t));
    body = `<div class="flow" style="position:absolute;left:56px;right:56px"><div style="display:flex;gap:22px">
<div class="col"><div class="colh">Link in bio</div>${left.map(t => `<div class="cr">${esc(t)}</div>`).join('')}</div>
<div class="col hi"><div class="colh">Your website</div>${right.map(t => `<div class="cr">✓ ${esc(t)}</div>`).join('')}</div></div>
${note.map(t => `<div class="sub" style="margin-top:26px">${esc(t)}</div>`).join('')}</div>`;
  } else {
    body = `<div class="flow" style="position:absolute;left:56px;right:56px">${L.map((t, i) => `<div class="big${i === 0 ? ' first' : ''}">${esc(t)}</div>`).join('')}</div>`;
  }
  return head + body + foot;
}
const page = p => `<!doctype html><html><head><meta charset="utf-8"><style>${font}
*{margin:0;box-sizing:border-box}body{width:1080px;height:1350px;overflow:hidden;background:#000;color:#fff;font-family:I,sans-serif;position:relative}
.h{font-family:M;font-weight:800;text-transform:uppercase;letter-spacing:-.02em;line-height:.98}
.chip{display:inline-block;border:2px solid rgba(255,255,255,.35);border-radius:999px;padding:11px 20px;font:600 24px I;letter-spacing:.06em;color:#ddd}
.cta{display:inline-flex;align-items:center;background:#fff;color:#000;border-radius:999px;padding:22px 40px;font:800 40px M;letter-spacing:.01em}
.sub{font:500 30px/1.4 I;color:#bdbdbd}
.li{display:flex;gap:16px;align-items:flex-start;font:500 33px/1.3 I;color:#ececec;margin:0 0 26px}.li b{font:800 30px M;color:#fff;flex:none}
.step{display:flex;gap:28px;align-items:center;padding:26px 0;border-top:2px solid rgba(255,255,255,.14);font:500 37px/1.25 I;color:#f0f0f0}.step:last-child{border-bottom:2px solid rgba(255,255,255,.14)}
.num{font:800 76px M;color:#fff;width:70px;flex:none;line-height:1}
.chk{display:flex;gap:22px;align-items:center;background:rgba(255,255,255,.06);border:2px solid rgba(255,255,255,.14);border-radius:22px;padding:22px 26px;margin:0 0 16px;font:500 35px/1.25 I}.chk b{font:800 36px M;color:#000;background:#fff;border-radius:50%;width:54px;height:54px;display:grid;place-items:center;flex:none}
.col{flex:1;border-radius:28px;padding:30px 28px;background:rgba(255,255,255,.05);border:2px solid rgba(255,255,255,.16)}.col.hi{background:#fff;color:#000;border-color:#fff}
.colh{font:800 34px M;text-transform:uppercase;letter-spacing:.02em;margin-bottom:18px}.cr{font:500 29px/1.3 I;margin:0 0 16px}.col:not(.hi) .cr{color:#bdbdbd}
.big{font:500 40px/1.3 I;color:#e8e8e8;padding:20px 0;border-top:2px solid rgba(255,255,255,.12)}.big.first{font:800 54px/1.1 M;color:#fff;text-transform:uppercase;border:0}
</style></head><body>${torn(1080, 1350, 1080 * .55)}${inner(p)}</body></html>`;

const br = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--no-sandbox'] });
for (const [i, p] of posts.entries()) {
  const pg = await br.newPage({ viewport: { width: 1080, height: 1350 } });
  await pg.setContent(page(p)); await pg.evaluate(() => document.fonts.ready);
  // fit the headline into its box, then put the body right under it
  const info = await pg.evaluate(() => {
    const h = document.querySelector('.fit'); const max = +h.dataset.max; let fs = 92;
    while (h.getBoundingClientRect().height > max && fs > 44) { fs -= 2; h.style.fontSize = fs + 'px'; }
    const f = document.querySelector('.flow'); let top = h.getBoundingClientRect().bottom + 50;
    const cta0 = document.querySelector('.cta').getBoundingClientRect().top;
    const phs = [...document.querySelectorAll('.ph')];
    const fh = f ? f.getBoundingClientRect().height : 0;
    const ph = phs.length ? Math.max(...phs.map(e => e.getBoundingClientRect().height)) + 40 : 0;
    const block = Math.max(fh, ph), room = cta0 - 50 - top;
    if (room > block) top += (room - block) * 0.4;        // sit the body a little above the middle of the free space
    if (f) f.style.top = top + 'px';
    phs.forEach(e => { e.style.top = (top + Math.max(0, +e.dataset.dy) - 10) + 'px'; });
    const s = document.querySelector('.samp'); if (s && phs.length) s.style.top = (Math.max(...phs.map(e => e.getBoundingClientRect().bottom)) + 14) + 'px';
    const fb = f ? f.getBoundingClientRect().bottom : top; const cta = document.querySelector('.cta').getBoundingClientRect().top;
    return { fs, bodyBottom: Math.round(fb), ctaTop: Math.round(cta) };
  });
  await pg.waitForTimeout(150);
  const file = `${OUT}/${String(i + 1).padStart(2, '0')}-${p.id}.jpg`;
  await pg.screenshot({ path: file, type: 'jpeg', quality: 90 });
  console.log(file, JSON.stringify(info), info.bodyBottom > info.ctaTop - 30 ? 'OVERLAP' : 'ok');
  await pg.close();
}
await br.close();
