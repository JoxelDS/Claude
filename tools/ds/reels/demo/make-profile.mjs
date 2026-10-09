// node tools/ds/reels/demo/make-profile.mjs → taco-profile.jpg: a GENERIC social profile screen (no platform branding, no
// follower counts) for the FICTIONAL demo taco truck Calle Cometa Tacos — the "before" of the Instagram → website Reel.
// Its first grid row holds the three posts the preview site is built from: a MENU post (same dishes + prices as
// taco-mobile.jpg), a photo (the site's first gallery photo) and an HOURS post (the site's "Find us" hours). The link row
// reads "no website yet". Same look as make.mjs (390 css px @1.5×, "DEMO · FICTIONAL BUSINESS" strip on top); does not
// touch the other demo files and merges its boxes into screens.json (menuPost, photoPost, hoursPost, link, bio, grid …).
import { chromium } from '/home/user/Claude/node_modules/playwright-core/index.mjs';
import { readFileSync, writeFileSync, mkdirSync } from 'fs';
const HERE = new URL('.', import.meta.url).pathname;
const PUB = new URL('../../../../public', import.meta.url).pathname;
const TMP = process.env.TMPDIR_REELS || '/tmp/ds-reels-demo/'; mkdirSync(TMP, { recursive: true });
const IF = w => `file://${HERE}../lib/fonts/Inter-${w}-solid.woff2`;
const MF = `file://${HERE}../lib/fonts/Montserrat-800-solid.woff2`;
const IMG = n => `file://${PUB}/p/_img/${n}.jpg`;
const fonts = [400, 500, 600, 700, 800].map(w => `@font-face{font-family:In;font-weight:${w};src:url(${IF(w)})}`).join('') + `@font-face{font-family:Mo;font-weight:800;src:url(${MF})}`;
const strip = `<div style="background:#111;color:#fff;font:700 11px/1 system-ui,sans-serif;letter-spacing:.22em;text-align:center;padding:9px 0">DEMO · FICTIONAL BUSINESS</div>`;
const OR = '#ff7a2f';   // the taco site's orange (darkroom theme accent)
const html = `<style>${fonts}
body{margin:0;background:#fff;font-family:In,system-ui,sans-serif;color:#141414;width:390px;height:844px;overflow:hidden}
.top{display:flex;align-items:center;justify-content:space-between;height:46px;padding:0 16px;font:700 16px In}.top i{font:500 26px/1 In;color:#333;font-style:normal;width:22px}
.me{display:flex;align-items:center;gap:16px;padding:10px 16px 0}
.av{flex:none;width:84px;height:84px;border-radius:50%;background:#1a0f0a;display:grid;place-items:center;font:800 27px/1 Mo;color:${OR};letter-spacing:-.02em;box-shadow:0 0 0 3px #fff,0 0 0 5px #d9d9d9}
.nm{font:700 18px/1.2 In}.cat{font:500 14px/1.3 In;color:#6b6b6b;margin-top:3px}
.bio{padding:12px 16px 0;font:500 14.5px/1.45 In}.bio div{white-space:nowrap}
.lnk{margin:12px 16px 0;height:38px;border-radius:12px;border:1.5px dashed #c4c4c4;display:flex;align-items:center;justify-content:center;gap:8px;font:600 14px In;color:#8a8a8a}
.btns{display:flex;gap:8px;padding:12px 16px 0}.btns span{flex:1;height:34px;border-radius:9px;display:grid;place-items:center;font:700 14px In;background:#efefef}.btns span.f{background:#141414;color:#fff}
.hl{display:flex;gap:16px;padding:14px 16px 0}.hl div{width:62px;text-align:center;font:500 11.5px In;color:#333}.hl b{display:block;width:58px;height:58px;margin:0 auto 5px;border-radius:50%;box-shadow:0 0 0 2px #fff,0 0 0 3.5px #d0d0d0;background-size:cover;background-position:center;font:400 24px/58px In}
.tabs{display:flex;justify-content:center;margin-top:14px;border-bottom:1px solid #e6e6e6}.tabs span{padding:9px 18px;font:700 12.5px In;letter-spacing:.12em;border-bottom:2px solid #141414;margin-bottom:-1px}
.grid{display:grid;grid-template-columns:repeat(3,1fr);gap:2px}.t{height:172px;background-size:cover;background-position:center;position:relative;overflow:hidden}
.menu{background:#1a0f0a;color:#f6eadf;padding:12px 10px 0;box-sizing:border-box}.menu h4{margin:0 0 7px;font:800 21px/1 Mo;color:${OR};letter-spacing:-.01em}
.menu p{margin:0 0 6px;display:flex;justify-content:space-between;font:600 10.5px/1.2 In}.menu p b{color:${OR};font-weight:800}.menu .x{position:absolute;left:10px;bottom:9px;font:600 9px In;color:#b9a99b;letter-spacing:.08em}
.hours{background:${OR};color:#1a0f0a;padding:14px 10px 0;box-sizing:border-box;text-align:center}.hours h4{margin:0;font:800 23px/1 Mo;letter-spacing:-.01em}
.hours .d{margin:10px 0 2px;font:800 15px/1.1 In}.hours .h{font:800 15px/1.1 In}.hours .w{margin-top:12px;font:700 10.5px In;letter-spacing:.06em}
.pin{position:absolute;right:6px;top:6px;font:12px/1 In;filter:drop-shadow(0 1px 2px rgba(0,0,0,.5))}
</style>${strip}
<div class="top"><i>‹</i>callecometa.demo<i style="text-align:right">⋯</i></div>
<div class="me"><div class="av">CC</div><div><div class="nm">Calle Cometa Tacos</div><div class="cat">Food truck · Demo</div></div></div>
<div class="bio"><div>🌮 Tacos al pastor, off the trompo</div><div class="hrs">🕒 Tue–Sun · 6 PM – 1 AM</div><div>📍 Wynwood · DM to order</div></div>
<div class="lnk">🔗 no website yet</div>
<div class="btns"><span class="f">Follow</span><span>Message</span></div>
<div class="tabs"><span>POSTS</span></div>
<div class="grid">
 <div class="t menu" id="menuPost"><h4>MENU</h4><p>Al pastor<b>$4</b></p><p>Birria quesataco<b>$5</b></p><p>Elote en vaso<b>$5</b></p><p>Agua fresca<b>$4</b></p><div class="x">📌 PINNED</div></div>
 <div class="t" id="photoPost" style="background-image:url(${IMG('food-1')})"></div>
 <div class="t hours" id="hoursPost"><h4>OPEN</h4><div class="d">TUE–SUN</div><div class="h">6 PM – 1 AM</div><div class="w">📍 WYNWOOD</div></div>
 <div class="t" style="background-image:url(${IMG('food-3')})"></div>
 <div class="t" style="background-image:url(${IMG('food-1')});background-position:8% 4%;background-size:230%"></div>
 <div class="t" style="background-image:url(${IMG('food-3')});background-position:85% 15%;background-size:220%"></div>
 <div class="t" style="background-image:url(${IMG('food-1')});background-position:70% 80%;background-size:200%"></div>
 <div class="t" style="background-image:url(${IMG('food-3')});background-position:20% 70%;background-size:200%"></div>
 <div class="t" style="background-image:url(${IMG('food-1')});background-position:90% 10%;background-size:240%"></div>
</div>`;
const SEL = { header: '.top', avatar: '.av', name: '.nm', bio: '.bio', bioHours: '.hrs', link: '.lnk', buttons: '.btns', grid: '.grid', menuPost: '#menuPost', photoPost: '#photoPost', hoursPost: '#hoursPost' };
const BOXES = `(sels)=>{const o={};for(const [k,q] of Object.entries(sels)){const e=document.querySelector(q);if(!e)continue;const r=e.getBoundingClientRect();o[k]=[Math.round(r.left+scrollX),Math.round(r.top+scrollY),Math.round(r.width),Math.round(r.height)];}return o;}`;
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--no-sandbox'] });
const pg = await b.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1.5 });
const f = `${TMP}taco-profile.html`; writeFileSync(f, `<!doctype html><meta charset=utf-8>${html}`);
await pg.goto('file://' + f); await pg.evaluate(() => document.fonts.ready); await pg.waitForTimeout(300);
const out = { 'demo/taco-profile.jpg': { cssWidth: 390, cssHeight: 844, boxes: await pg.evaluate(`(${BOXES})(${JSON.stringify(SEL)})`) } };
const bottom = await pg.evaluate(() => document.querySelector('.grid').getBoundingClientRect().bottom);
await pg.screenshot({ path: `${HERE}taco-profile.jpg`, type: 'jpeg', quality: 88, clip: { x: 0, y: 0, width: 390, height: 844 } });
console.log('taco-profile', JSON.stringify(out['demo/taco-profile.jpg']), 'content bottom', Math.round(bottom));
await b.close();
const sj = JSON.parse(readFileSync(HERE + 'screens.json', 'utf8'));            // merge (re-read right before writing)
writeFileSync(HERE + 'screens.json', JSON.stringify({ ...sj, ...out }, null, 1));
console.log('screens.json + taco-profile');
