// node tools/ds/reels/demo/make.mjs  → tools/ds/reels/demo/*.jpg (demo screens for the Reel engine)
// 1) GOOD: three FICTIONAL businesses (demo-leads.json) rendered with the real preview generator (tools/ds/preview.mjs),
//    shot as tall full-page JPEGs (mobile 390 @1.5x, desktop 1280 @1x) with a "DEMO · FICTIONAL BUSINESS" strip on top,
//    then the generated public/p/<slug>/ folders are DELETED so nothing new is published.
// 2) BAD counterparts drawn in HTML for before/after scenes: a menu that is only a photo of a paper menu, a cluttered
//    link-in-bio page, a 2011 desktop site squeezed onto a phone.
// Google Fonts for the preview themes come from a local cache (env GF, default the DS scratchpad gf/ folder); when a
// font is missing the page falls back to system fonts — fine for a demo screen.
import { chromium } from '/home/user/Claude/node_modules/playwright-core/index.mjs';
import { readFileSync, writeFileSync, existsSync, rmSync, mkdirSync } from 'fs';
import { execFileSync } from 'child_process';
import { createHash } from 'crypto';
const HERE = new URL('.', import.meta.url).pathname;
const ROOT = new URL('../../../../', import.meta.url).pathname;           // repo root
const PUB = ROOT + 'public';
const GF = process.env.GF || '/tmp/claude-0/-home-user-Claude/9bbbb27f-941a-5828-b327-75036c7070e7/scratchpad/ds/gf/';
const TMP = process.env.TMPDIR_REELS || '/tmp/ds-reels-demo/'; mkdirSync(TMP, { recursive: true });
const leads = JSON.parse(readFileSync(HERE + 'demo-leads.json', 'utf8'));
const KEY = { 'demo-calle-cometa': 'taco', 'demo-lacquer-lagoon': 'nails', 'demo-tidewick-pools': 'pool' };
// element boxes [x, y, w, h] in CSS px of each screenshot → demo/screens.json (for page-anchored taps / highlights)
const SCREENS = {};
const BOXES = `(sels)=>{const o={};for(const [k,q] of Object.entries(sels)){const e=document.querySelector(q);if(!e)continue;const r=e.getBoundingClientRect();o[k]=[Math.round(r.left+scrollX),Math.round(r.top+scrollY),Math.round(r.width),Math.round(r.height)];}return o;}`;
const GOOD = { header: '.top', title: 'h1', lead: '.lead', cta: '.cta', ctaGhost: '.ghost', servicesTitle: '#more h2', services: '#more .grid, #more .rows', firstService: '#more .card, #more .row', galleryTitle: 'section:nth-of-type(2) h2', gallery: '.photos', hours: '.hours', contact: '.reach', call: '.reach a[href^="tel"]', footer: 'footer' };

execFileSync('node', [ROOT + 'tools/ds/preview.mjs', HERE + 'demo-leads.json'], { stdio: 'inherit' });

const STRIP = `(()=>{const d=document.createElement('div');d.textContent='DEMO · FICTIONAL BUSINESS';
d.style.cssText='position:relative;z-index:9999;background:#111;color:#fff;font:700 11px/1 system-ui,sans-serif;letter-spacing:.22em;text-align:center;padding:9px 0;margin:0';
document.body.prepend(d);const s=document.createElement('style');s.textContent='*{animation:none!important;transition:none!important}.reveal{opacity:1!important;transform:none!important}.ribbon{display:none!important}footer{padding-bottom:40px!important}';document.head.appendChild(s);})()`;

const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--no-sandbox'] });
const route = async ctx => {
  await ctx.route('https://joxelds.github.io/Claude/**', r => { const p = PUB + decodeURIComponent(new URL(r.request().url()).pathname).replace('/Claude', '').replace(/\/$/, '/index.html'); if (!existsSync(p)) return r.fulfill({ status: 404 }); r.fulfill({ body: readFileSync(p), contentType: p.endsWith('.jpg') ? 'image/jpeg' : p.endsWith('.woff2') ? 'font/woff2' : 'text/html' }); });
  await ctx.route('https://fonts.googleapis.com/**', r => { const q = new URL(r.request().url()).search.slice(1); const h = createHash('md5').update(decodeURIComponent(q)).digest('hex').slice(0, 10); const f = GF + 'css_' + h + '.css'; if (!existsSync(f)) return r.fulfill({ status: 404 }); r.fulfill({ body: readFileSync(f), contentType: 'text/css', headers: { 'access-control-allow-origin': '*' } }); });
  await ctx.route('https://fonts.gstatic.com/**', r => { const f = GF + new URL(r.request().url()).pathname.slice(1).replace(/\//g, '_'); if (!existsSync(f)) return r.fulfill({ status: 404 }); r.fulfill({ body: readFileSync(f), contentType: 'font/woff2', headers: { 'access-control-allow-origin': '*' } }); });
  await ctx.route(/^https:\/\/(?!joxelds\.github\.io|fonts\.)/, r => r.fulfill({ status: 404 }));
};
try {
  for (const [w, h, tag, dsf] of [[390, 844, 'mobile', 1.5], [1280, 800, 'desktop', 1]]) {
    const ctx = await b.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: dsf, isMobile: tag === 'mobile', hasTouch: tag === 'mobile' });
    await route(ctx);
    const page = await ctx.newPage();
    for (const l of leads) {
      await page.goto(`https://joxelds.github.io/Claude/p/${l.slug}/`, { waitUntil: 'networkidle' });
      await page.evaluate(STRIP);
      await page.evaluate(async () => { document.querySelectorAll('img').forEach(i => i.loading = 'eager'); await Promise.all([...document.images].map(i => i.decode().catch(() => 0))); await document.fonts.ready; });
      await page.waitForTimeout(300);
      const f = `${HERE}${KEY[l.slug]}-${tag}.jpg`;
      SCREENS[`demo/${KEY[l.slug]}-${tag}.jpg`] = { cssWidth: w, cssHeight: await page.evaluate(() => document.documentElement.scrollHeight), boxes: await page.evaluate(`(${BOXES})(${JSON.stringify(GOOD)})`) };
      await page.screenshot({ path: f, fullPage: true, type: 'jpeg', quality: 86 });
      console.log('good', f, await page.evaluate(() => document.documentElement.scrollHeight));
    }
    await ctx.close();
  }
} finally {
  for (const l of leads) rmSync(`${PUB}/p/${l.slug}`, { recursive: true, force: true });   // never publish demo pages
  console.log('removed', leads.map(l => `public/p/${l.slug}`).join(', '));
}

// ---------- BAD counterparts ----------
const F = n => `file://${PUB}/p/_fonts/${n}.woff2`;
const fonts = `@font-face{font-family:Cav;src:url(${F('caveat')})}@font-face{font-family:Pac;src:url(${F('pacifico-400')})}@font-face{font-family:Bun;src:url(${F('bungee-400')})}`;
const strip = `<div style="background:#111;color:#fff;font:700 11px/1 system-ui,sans-serif;letter-spacing:.22em;text-align:center;padding:9px 0">DEMO · FICTIONAL BUSINESS</div>`;
const BAD = {
  // a "menu" that is only a phone photo of a paper menu taped to the truck window
  'taco-menu-photo': { w: 390, dsf: 1.5, boxes: { photo: '.photo', paper: '.paper', prices: '.it:nth-of-type(1)', caption: '.cap', comments: '.cm' }, html: `<style>${fonts}body{margin:0;background:#000;font-family:system-ui,sans-serif;color:#fff}
.bar{display:flex;justify-content:space-between;align-items:center;padding:14px 16px;font:600 15px system-ui}.bar span{opacity:.6;font-weight:500}
.photo{position:relative;height:640px;overflow:hidden;background:radial-gradient(120% 80% at 70% 10%,#5b5f63,#2b2d30 55%,#16171a)}
.photo:before{content:"";position:absolute;inset:0;background:repeating-linear-gradient(90deg,rgba(255,255,255,.03) 0 3px,transparent 3px 9px)}
.paper{position:absolute;left:34px;top:46px;width:330px;height:520px;background:radial-gradient(90% 70% at 80% 12%,#fffef6 0,#f1ead6 45%,#d9cfb3 100%);transform:perspective(700px) rotateX(9deg) rotateZ(-5deg) skewX(-2deg);box-shadow:0 18px 30px rgba(0,0,0,.55);filter:blur(.7px) contrast(.92);padding:22px 22px;font-family:Cav;color:#2a2622}
.paper h1{font:700 44px Cav;margin:0 0 2px;transform:rotate(-2deg)}.paper .s{font:600 19px Cav;opacity:.7;margin-bottom:10px}
.it{display:flex;justify-content:space-between;font:600 25px/1.18 Cav;border-bottom:1px dashed rgba(0,0,0,.15);padding:3px 0}.x{text-decoration:line-through;opacity:.55}.new{color:#b3261e;transform:rotate(-6deg);display:inline-block}
.tape{position:absolute;width:86px;height:28px;background:rgba(240,235,200,.55);top:-8px}.grease{position:absolute;width:150px;height:110px;left:150px;top:270px;border-radius:50%;background:radial-gradient(closest-side,rgba(150,105,40,.42),rgba(150,105,40,.15) 60%,transparent);filter:blur(4px)}
.ring{position:absolute;width:96px;height:96px;left:30px;top:380px;border-radius:50%;border:7px solid rgba(120,70,30,.28);filter:blur(1.5px)}
.glare{position:absolute;inset:0;background:radial-gradient(40% 26% at 72% 24%,rgba(255,255,255,.75),transparent 70%);mix-blend-mode:screen}
.cap{padding:14px 16px;font:400 15px/1.45 system-ui}.cap b{font-weight:700}.cap i{opacity:.55;font-style:normal}
.cm{padding:4px 16px 12px;font:400 14px/1.4 system-ui;opacity:.85}.cm b{font-weight:700}
</style>${strip}<div class="bar"><b>calle.cometa.tacos</b><span>Photo 1 of 1</span></div>
<div class="photo"><div class="paper"><div class="tape" style="left:20px;transform:rotate(-12deg)"></div><div class="tape" style="right:20px;transform:rotate(9deg)"></div>
<h1>Calle Cometa</h1><div class="s">tacos · open late · cash or zelle</div>
<div class="it"><span>Al pastor</span><span><span class="x">$3</span> <span class="new">$4</span></span></div>
<div class="it"><span>Birria quesa</span><span>$5</span></div><div class="it"><span>Asada</span><span class="x">$4</span></div>
<div class="it"><span>Elote vaso</span><span>$5??</span></div><div class="it"><span>Agua fresca</span><span>$4</span></div>
<div class="it"><span>Combo #2 (ask)</span><span>—</span></div><div class="it"><span class="x">Tortas</span><span>sold out</span></div>
<div class="grease"></div><div class="ring"></div><div class="glare"></div></div></div>
<div class="cap"><b>calle.cometa.tacos</b> menu 👆 prices may change, DM for today's specials 🌮🔥 <i>#tacos #miami</i></div>
<div class="cm"><b>user_1</b> is the birria still $5?</div><div class="cm"><b>user_2</b> can't read the price on the elote 😅</div><div class="cm"><b>user_3</b> do you have a menu link?</div>
<div style="height:120px"></div>` },
  // a cluttered link-in-bio page (generic, no platform branding)
  'nails-linkinbio': { w: 390, dsf: 1.5, boxes: { avatar: '.av', name: 'h1', bio: '.bio', firstButton: '.l', policy: '.l.p.s', brokenImage: '.brk', footer: '.ft' }, html: `<style>${fonts}body{margin:0;min-height:100vh;background:linear-gradient(160deg,#ff9bd2,#b28dff 40%,#ffe27a 80%,#7ef0d0);font-family:system-ui,sans-serif;color:#222}
.av{width:86px;height:86px;border-radius:50%;margin:26px auto 8px;background:radial-gradient(circle at 35% 35%,#fff,#f4a6c8 60%,#c76a9a);display:grid;place-items:center;font:700 30px Pac;color:#fff;box-shadow:0 0 0 4px #fff}
h1{font:400 28px Pac;text-align:center;margin:0;color:#fff;text-shadow:2px 2px 0 #d1408d}.bio{text-align:center;font:600 13px/1.4 system-ui;margin:6px 26px 14px}
.l{display:block;margin:9px 18px;padding:13px 10px;text-align:center;font:700 14px system-ui;border-radius:30px;background:#fff;box-shadow:0 3px 0 rgba(0,0,0,.18)}
.l.o{background:transparent;border:2px dashed #fff;color:#fff}.l.k{background:#111;color:#ff0;font-family:Bun,system-ui;font-size:13px;border-radius:4px}.l.p{background:#ff4fa3;color:#fff;border-radius:6px}.l.y{background:#fff59a;font-family:Cav;font-size:21px}.l.s{font-size:11px;padding:9px}
.brk{margin:10px auto;width:120px;height:80px;border:2px solid #999;background:#eee;display:grid;place-items:center;font:12px system-ui;color:#777}
.ft{text-align:center;font:11px system-ui;opacity:.6;padding:16px 0 120px}
</style>${strip}<div class="av">LL</div><h1>Lacquer Lagoon 💅✨</h1>
<div class="bio">DM to book!!! ‼️ NO walk ins ‼️ read policy first 🙏 prices on highlights (or link) 💖💖</div>
<a class="l">📅 BOOK HERE</a><a class="l p">📅 BOOK HERE (NEW LINK!!)</a><a class="l o">💰 PRICES 2023</a><a class="l k">💰 PRICES UPDATED</a>
<a class="l y">🎉 June promo (ended)</a><a class="l">📲 WhatsApp me</a><a class="l p s">⚠️ POLICY — READ BEFORE BOOKING OR YOU WILL BE CHARGED</a>
<div class="brk">image not found</div><a class="l o">🖼 Gallery (old)</a><a class="l">🎁 Gift cards (coming soon)</a><a class="l k">📍 Location — DM for address</a>
<a class="l y">⭐ Leave us a review!!</a><a class="l s">🛍 Shop</a><a class="l p">💌 Waitlist</a><a class="l o">🔗 My other page</a><a class="l s">📞 Call (no texts)</a>
<div class="ft">made with a free link page</div>` },
  // a 2011 desktop site on a phone: everything tiny, nothing tappable
  'pool-oldsite': { w: 1000, dsf: 1, boxes: { header: '.hd', marquee: '.mq', nav: '.nav', sidebar: '.side', underConstruction: '.uc', footer: '.ft' }, html: `<style>body{margin:0;background:#b8d6ee;font-family:'Times New Roman',serif;color:#000}
.wrap{width:960px;margin:0 auto;background:#fff;border:3px ridge #6a8fb0}.hd{background:linear-gradient(#2b5d8c,#173a5c);color:#ff0;text-align:center;padding:18px;font:bold 40px 'Comic Sans MS','Times New Roman',serif;text-shadow:3px 3px #000}
.mq{background:#000;color:#0f0;font:bold 18px monospace;padding:6px;white-space:nowrap;overflow:hidden}.nav{background:#ddd;padding:8px;text-align:center;font-size:18px}.nav a{color:#00e;text-decoration:underline;margin:0 8px}
table{width:100%;border-collapse:collapse}td{vertical-align:top;padding:12px;font-size:17px;line-height:1.35}.side{width:230px;background:#ffffa8;border-right:2px solid #cc0}
.uc{height:46px;background:repeating-linear-gradient(45deg,#ffd400 0 22px,#111 22px 44px);color:#fff;font:bold 22px Arial;display:grid;place-items:center;text-shadow:2px 2px #000;margin:14px 0}
.img{width:300px;height:190px;border:2px inset #888;background:#e7e7e7;display:grid;place-items:center;color:#888;font-size:14px;float:right;margin:0 0 10px 14px}
.cnt{display:inline-block;background:#000;color:#f00;font:bold 20px monospace;padding:2px 6px;letter-spacing:3px}.ft{text-align:center;font-size:14px;padding:12px;background:#eee}
</style><div class="wrap"><div style="background:#111;color:#fff;font:700 13px system-ui;letter-spacing:.22em;text-align:center;padding:8px">DEMO · FICTIONAL BUSINESS</div>
<div class="hd">~*~ TIDEWICK POOL CARE ~*~<br><span style="font-size:22px;color:#fff">WELCOME TO OUR WEB SITE!!!</span></div>
<div class="mq">*** NOW SERVING KENDALL *** CALL FOR SPECIALS *** NOW SERVING KENDALL *** CALL FOR SPECIALS ***</div>
<div class="nav"><a>Home</a>|<a>About Us</a>|<a>Services</a>|<a>Prices</a>|<a>Photo Gallery</a>|<a>Links</a>|<a>Contact Us</a></div>
<table><tr><td class="side"><b><u>SPECIALS!!</u></b><br><br>Pool opening special call for price<br><br>Ask about our maintenance plans!!<br><br><b>HOURS:</b><br>Mon-Fri 8-5<br>Sat by appt<br><br><img alt="" style="width:120px;height:60px;border:1px solid #999;background:#fff"><br><br>You are visitor #<br><span class="cnt">000127</span></td>
<td><div class="img">[ pool picture ]</div><h2 style="margin-top:0;color:#173a5c">About Tidewick Pool Care</h2>Tidewick Pool Care has been proudly cleaning pools. We offer pool cleaning, pool repair, chemical balancing, filter cleaning, tile cleaning and more. Please call us or email us for more information. We look forward to hearing from you! Click on the links above to learn more about our services and prices. For a quote please print the form on the Contact Us page and fax it to our office.<div class="uc">UNDER CONSTRUCTION</div>
<h3 style="color:#173a5c">Our Services</h3><ul><li>Weekly pool cleaning</li><li>Pool repair (call)</li><li>Chemicals</li><li>Green pool clean up</li><li>Filter cleaning</li></ul>
<p style="font-size:13px">Prices subject to change without notice. Please call to confirm.</p>
<h3 style="color:#173a5c">Prices</h3><table border="1" style="width:auto;font-size:16px"><tr><th>Service</th><th>Price</th></tr><tr><td>Weekly cleaning</td><td>Call</td></tr><tr><td>Green pool</td><td>Call for quote</td></tr><tr><td>Repairs</td><td>Depends</td></tr></table>
<h3 style="color:#173a5c">Contact Us</h3>To request service please <a style="color:#00e">print this form</a> and fax it to our office or leave a message on our answering machine. We will return your call within 3-5 business days.<br><br>
<div style="border:2px inset #888;background:#e7e7e7;height:260px;display:grid;place-items:center;color:#888;font-size:14px">[ map could not be loaded ]</div>
<h3 style="color:#173a5c">Links</h3><ul><li><a style="color:#00e">Pool Safety Tips (PDF)</a></li><li><a style="color:#00e">Our Facebook Page</a></li><li><a style="color:#00e">Weather</a></li></ul>
<div class="uc">PHOTO GALLERY COMING SOON</div></td></tr></table>
<div class="ft">Copyright © 2011 Tidewick Pool Care. All rights reserved. | Best viewed in 1024x768 with Internet Explorer | <a style="color:#00e">Webmaster</a></div></div><div style="height:60px"></div>` },
};
const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1.5 });
for (const [name, d] of Object.entries(BAD)) {
  const pg = await b.newPage({ viewport: { width: d.w, height: 600 }, deviceScaleFactor: d.dsf });
  const f = `${TMP}${name}.html`; writeFileSync(f, `<!doctype html><meta charset=utf-8>${d.html}`);
  await pg.goto('file://' + f); await pg.evaluate(() => document.fonts.ready); await pg.waitForTimeout(200);
  SCREENS[`demo/${name}.jpg`] = { cssWidth: d.w, cssHeight: await pg.evaluate(() => document.documentElement.scrollHeight), boxes: await pg.evaluate(`(${BOXES})(${JSON.stringify(d.boxes || {})})`) };
  await pg.screenshot({ path: `${HERE}${name}.jpg`, fullPage: true, type: 'jpeg', quality: 86 });
  console.log('bad', name);
  await pg.close();
}
await ctx.close();
await b.close();
writeFileSync(HERE + 'screens.json', JSON.stringify(SCREENS, null, 1));
console.log('screens.json', Object.keys(SCREENS).length, 'screens');
