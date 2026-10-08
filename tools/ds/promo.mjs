// node tools/ds/promo.mjs <heroDir> → docs/social/ds/website-offer-{story1,story2,post}.png
// DS Marketing offer graphics (black, torn paper, DS logo): $497 website in 48 h, $997 Pro, free preview first.
// <heroDir> holds 390×844 @3× phone screenshots hero-sample-{food,beauty,fitness,home}.png of the preview pages.
import { chromium } from 'playwright';
import { mkdirSync, readFileSync } from 'fs';
const ROOT = new URL('../../', import.meta.url).pathname;
const V = `${ROOT}tools/video/`;
const HERO = process.argv[2];
const OUT = `${ROOT}docs/social/ds/`; mkdirSync(OUT, { recursive: true });
const b64 = p => 'data:' + (p.endsWith('.png') ? 'image/png' : 'font/woff2') + ';base64,' + readFileSync(p).toString('base64');
const font = `@font-face{font-family:M;src:url(${b64(V + 'fonts/Montserrat-800.woff2')});font-weight:800}
@font-face{font-family:I;src:url(${b64(V + 'fonts/inter500.woff2')});font-weight:500}@font-face{font-family:I;src:url(${b64(V + 'fonts/inter600.woff2')});font-weight:600}`;
const LOGO = b64(V + 'ds-logo.png');
let seed = 7; const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
const torn = (w, h, cx) => { const pts = []; let x = cx; for (let y = 0; y <= h; y += 6 + rnd() * 10) { x += (rnd() - .5) * 26 + (cx - x) * .08; if (rnd() < .06) x += (rnd() - .5) * 90; pts.push(`${x.toFixed(1)},${y.toFixed(1)}`); }
  return `<svg width="${w}" height="${h}" style="position:absolute;inset:0" xmlns="http://www.w3.org/2000/svg"><defs><pattern id="d" width="9" height="9" patternUnits="userSpaceOnUse"><circle cx="2" cy="2" r="1.1" fill="#1a1a1a"/></pattern><filter id="s" x="-10%" y="0" width="120%" height="100%"><feDropShadow dx="-6" dy="0" stdDeviation="9" flood-color="#000" flood-opacity=".9"/></filter></defs>
  <rect width="${w}" height="${h}" fill="#050505"/><rect width="${w}" height="${h}" fill="url(#d)"/>
  <polygon filter="url(#s)" points="${w},0 ${pts.join(' ')} ${w},${h}" fill="#1c1c1c"/></svg>`; };
const hero = n => b64(`${HERO}/hero-sample-${n}.png`);
const phone = (n, x, y, w, rot, z = 1) => `<div style="position:absolute;left:${x}px;top:${y}px;width:${w}px;height:${w * 844 / 390}px;transform:rotate(${rot}deg);z-index:${z};border-radius:${w * .14}px;padding:${w * .035}px;background:#0b0b0b;box-shadow:0 0 0 2px #3a3a3a,0 40px 90px rgba(0,0,0,.85),0 0 120px rgba(255,255,255,.06)">
<div style="width:100%;height:100%;border-radius:${w * .11}px;overflow:hidden;position:relative;background:url(${hero(n)}) top/cover"><div style="position:absolute;left:50%;top:${w * .03}px;transform:translateX(-50%);width:${w * .3}px;height:${w * .085}px;border-radius:99px;background:#000"></div></div></div>`;
const base = (w, h, inner) => `<!doctype html><html><head><meta charset="utf-8"><style>${font}
*{margin:0;box-sizing:border-box}body{width:${w}px;height:${h}px;overflow:hidden;background:#000;color:#fff;font-family:I,sans-serif;position:relative}
.h{font-family:M;font-weight:800;text-transform:uppercase;letter-spacing:-.02em;line-height:.95}
.o{color:transparent;-webkit-text-stroke:3px #fff}
.chip{display:inline-block;border:2px solid rgba(255,255,255,.35);border-radius:999px;padding:12px 22px;font:600 26px I;letter-spacing:.04em;color:#ddd}
.cta{display:inline-flex;align-items:center;gap:16px;background:#fff;color:#000;border-radius:999px;padding:26px 46px;font:800 46px M;letter-spacing:.01em}
.sub{font:500 30px/1.4 I;color:#bdbdbd}
.li{display:flex;gap:18px;align-items:flex-start;font:500 31px/1.3 I;color:#e8e8e8;margin:0 0 20px}.li b{font:800 30px M;color:#fff;flex:none;width:36px}
</style></head><body>${torn(w, h, w * .5)}${inner}</body></html>`;

const story1 = base(1080, 1920, `
<img src="${LOGO}" style="position:absolute;left:60px;top:270px;width:170px">
<div style="position:absolute;right:60px;top:290px" class="chip">MIAMI · WEB DESIGN</div>
<div class="h" style="position:absolute;left:60px;top:420px;font-size:100px">Your website.<br><span class="o">Live in</span><br>48 hours.</div>
<div class="sub" style="position:absolute;left:60px;top:740px">Free preview first. <b style="color:#fff;font-weight:600">Pay only if you love it.</b></div>
${phone('beauty', 190, 830, 240, -7, 1)}${phone('food', 600, 805, 255, 6, 2)}
<div style="position:absolute;left:60px;top:1395px"><div class="h" style="font-size:170px;letter-spacing:-.04em">$497</div><div class="sub" style="margin-top:6px">Design · build · your own domain</div></div>
<div style="position:absolute;right:60px;top:1470px"><span class="cta" style="font-size:40px;padding:24px 38px">DM “WEBSITE”</span></div>
`);

const col = (name, price, time, items, hi) => `<div style="flex:1;border-radius:36px;padding:44px 38px;background:${hi ? '#fff' : 'rgba(255,255,255,.06)'};color:${hi ? '#000' : '#fff'};border:2px solid ${hi ? '#fff' : 'rgba(255,255,255,.18)'}">
<div class="h" style="font-size:36px;letter-spacing:.06em">${name}</div>
<div class="h" style="font-size:120px;margin:14px 0 4px;letter-spacing:-.04em">${price}</div>
<div style="font:600 26px I;opacity:.65;margin-bottom:30px">${time}</div>
${items.map(t => `<div class="li" style="color:${hi ? '#111' : '#e8e8e8'};font-size:28px"><b style="color:${hi ? '#000' : '#fff'}">✓</b><span>${t}</span></div>`).join('')}</div>`;
const story2 = base(1080, 1920, `
<img src="${LOGO}" style="position:absolute;left:60px;top:270px;width:170px">
<div class="h" style="position:absolute;left:60px;top:410px;font-size:90px">What you get</div>
<div style="position:absolute;left:60px;right:60px;top:540px;display:flex;gap:24px">
${col('Starter', '$497', 'Live in 48 hours', ['Mobile-first one-page site', 'Your own domain connected', 'Call, Instagram &amp; directions buttons', 'Google-ready: titles, map, fast load', '1 round of changes'], false)}
${col('Pro', '$997', 'Live in 5 days', ['Up to 5 pages', 'Online booking or ordering', 'Menu / services / prices', 'Gallery from your photos', 'Google Business Profile setup', '2 rounds of changes'], true)}
</div>
<div style="position:absolute;left:60px;right:60px;top:1310px;border-top:2px solid rgba(255,255,255,.15);padding-top:34px" class="sub">Care plan <b style="color:#fff;font-weight:600">$49/mo</b>: hosting, updates and small edits.<br>Domain about $15/yr, registered in your name.</div>
<div style="position:absolute;left:0;right:0;top:1480px;text-align:center"><span class="cta" style="font-size:40px;padding:24px 38px">DM “WEBSITE”</span></div>
`);

const post = base(1080, 1350, `
<img src="${LOGO}" style="position:absolute;left:56px;top:52px;width:170px">
<div style="position:absolute;right:56px;top:72px" class="chip">MIAMI · WEB DESIGN</div>
<div class="h" style="position:absolute;left:56px;top:230px;font-size:94px">No website?<br><span class="o">We build it</span><br>in 48 hours.</div>
${phone('fitness', 590, 600, 220, -6, 1)}${phone('home', 800, 640, 220, 7, 2)}
<div style="position:absolute;left:56px;top:590px;width:480px" class="sub">A real site on your own domain. Mobile-first, fast, with your call, Instagram and directions buttons.</div>
<div style="position:absolute;left:56px;top:830px;width:500px"><div class="h" style="font-size:170px;letter-spacing:-.04em">$497</div><div class="sub" style="margin-top:4px">Free preview first.<br>Pay only if you love it.</div></div>
<div style="position:absolute;left:56px;bottom:64px"><span class="cta" style="font-size:40px;padding:22px 40px">DM “WEBSITE”</span></div>
<div style="position:absolute;right:56px;bottom:84px;font:600 28px I;color:#9a9a9a">@dsmarketing.agency</div>
`);

const br = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--no-sandbox'] });
for (const [name, html, w, h] of [['story1', story1, 1080, 1920], ['story2', story2, 1080, 1920], ['post', post, 1080, 1350]]) {
  const p = await br.newPage({ viewport: { width: w, height: h } });
  await p.setContent(html); await p.evaluate(() => document.fonts.ready); await p.waitForTimeout(300);
  await p.screenshot({ path: `${OUT}website-offer-${name}.png` }); await p.close(); console.log('wrote', name);
}
await br.close();
