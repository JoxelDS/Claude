// node tools/ds/reels/demo/make-maze.mjs → three more FICTIONAL demo screens for the "link-in-bio maze" Reel
// (does not touch the other demo files and never runs the preview generator; merges its boxes into screens.json):
//   linkinbio-404.jpg      the "BOOK HERE" link from nails-linkinbio.jpg → a generic expired-link / 404 page
//   nails-linkinbio-2.jpg  the "BOOK HERE (NEW LINK!!)" button → ANOTHER link page: every pro (nails + barbers) on a different app
//   nails-booking.jpg      the good counterpart: "Book a set" on nails-mobile.jpg → one booking screen (pick a time, confirm)
// Same look as make.mjs (390 css px @1.5×, "DEMO · FICTIONAL BUSINESS" strip on top). Staff first names are invented.
import { chromium } from '/home/user/Claude/node_modules/playwright-core/index.mjs';
import { readFileSync, writeFileSync, mkdirSync } from 'fs';
const HERE = new URL('.', import.meta.url).pathname;
const PUB = new URL('../../../../public', import.meta.url).pathname;
const TMP = process.env.TMPDIR_REELS || '/tmp/ds-reels-demo/'; mkdirSync(TMP, { recursive: true });
const F = n => `file://${PUB}/p/_fonts/${n}.woff2`;
const IF = w => `file://${HERE}../lib/fonts/Inter-${w}-solid.woff2`;
const fonts = `@font-face{font-family:Cav;src:url(${F('caveat')})}@font-face{font-family:Pac;src:url(${F('pacifico-400')})}@font-face{font-family:Bun;src:url(${F('bungee-400')})}`
  + [500, 600, 700, 800].map(w => `@font-face{font-family:In;font-weight:${w};src:url(${IF(w)})}`).join('');
const strip = `<div style="background:#111;color:#fff;font:700 11px/1 system-ui,sans-serif;letter-spacing:.22em;text-align:center;padding:9px 0">DEMO · FICTIONAL BUSINESS</div>`;
// the link-page look of nails-linkinbio.jpg (make.mjs), unchanged
const linkCss = `body{margin:0;min-height:100vh;background:linear-gradient(160deg,#ff9bd2,#b28dff 40%,#ffe27a 80%,#7ef0d0);font-family:system-ui,sans-serif;color:#222}
.av{width:86px;height:86px;border-radius:50%;margin:26px auto 8px;background:radial-gradient(circle at 35% 35%,#fff,#f4a6c8 60%,#c76a9a);display:grid;place-items:center;font:700 30px Pac;color:#fff;box-shadow:0 0 0 4px #fff}
h1{font:400 28px Pac;text-align:center;margin:0;color:#fff;text-shadow:2px 2px 0 #d1408d}.bio{text-align:center;font:600 13px/1.4 system-ui;margin:6px 26px 14px}
.l{display:block;margin:9px 18px;padding:13px 10px;text-align:center;font:700 14px system-ui;border-radius:30px;background:#fff;box-shadow:0 3px 0 rgba(0,0,0,.18)}
.l.o{background:transparent;border:2px dashed #fff;color:#fff}.l.k{background:#111;color:#ff0;font-family:Bun,system-ui;font-size:13px;border-radius:4px}.l.p{background:#ff4fa3;color:#fff;border-radius:6px}.l.y{background:#fff59a;font-family:Cav;font-size:21px}.l.s{font-size:11px;padding:9px}
.ft{text-align:center;font:11px system-ui;opacity:.6;padding:16px 0 40px}`;
const PAGES = {
  'linkinbio-404': { boxes: { big: '.big', msg: '.msg', back: '.bk' }, html: `<style>${fonts}body{margin:0;background:#f4f4f5;font-family:In,system-ui,sans-serif;color:#18181b;min-height:844px}
.wrap{padding:150px 34px 0;text-align:center}.ic{font-size:54px;line-height:1}.big{font:800 108px/1 In;letter-spacing:-.04em;margin:18px auto 6px;color:#27272a}
.msg{font:700 22px/1.3 In;margin:0 auto 10px;max-width:300px}.sub{font:500 15px/1.45 In;color:#71717a;margin:0 auto 30px;max-width:290px}
.bk{display:inline-block;padding:13px 26px;border-radius:12px;background:#e4e4e7;font:700 15px In;color:#3f3f46}.lk{margin-top:44px;font:500 12px In;color:#a1a1aa;word-break:break-all}</style>${strip}
<div class="wrap"><div class="ic">🔗</div><div class="big">404</div><div class="msg">This booking link doesn’t exist anymore</div>
<div class="sub">It may have expired or been moved. Ask the business for a new link.</div><span class="bk">← Go back</span>
<div class="lk">book-online.example/lacquer-lagoon-old</div></div><div style="height:160px"></div>` },
  'nails-linkinbio-2': { boxes: { avatar: '.av', name: 'h1', bio: '.bio', list: '.list', firstButton: '.l', barbers: '.bb', back: '.bk' }, html: `<style>${fonts}${linkCss}
.av{width:64px;height:64px;font-size:22px;margin-top:22px}h1{font-size:25px}</style>${strip}<div class="av">LL</div><h1>Book here 👇👇</h1>
<div class="bio">NEW booking page!! pick ur pro ‼️ everyone has their own app 🙏 if it doesn’t work DM us 💖</div>
<div class="list"><a class="l p">💅 KIM — nails (new app!!)</a><a class="l">💅 VERO — nails · DM to book</a>
<div class="bb"><a class="l k">💈 DRE — barber (other app)</a><a class="l y">💈 Tony — cuts (old link?)</a><a class="l o">💈 LUIS — barber · call only</a></div>
<a class="l s">⏳ Waitlist (closed)</a><a class="l bk">🔙 Back to my main page</a></div><div class="ft">made with a free link page</div><div style="height:120px"></div>` },
  'nails-booking': { boxes: { header: '.top', title: 'h1', services: '.svc', days: '.days', times: '.times', summary: '.sum', confirm: '.go' }, html: `<style>${fonts}body{margin:0;background:#fff;font-family:In,system-ui,sans-serif;color:#111;min-height:844px}
.top{display:flex;justify-content:space-between;align-items:center;padding:18px 22px;font:700 17px In}.top span{font:500 22px In;color:#555}
.k{display:inline-block;margin:26px 22px 0;padding:7px 12px;border-radius:8px;background:#f9dcf1;font:700 11px In;letter-spacing:.16em}
h1{font:800 40px/1.05 In;letter-spacing:-.035em;margin:14px 22px 22px}.lab{font:700 12px In;letter-spacing:.14em;color:#777;margin:0 22px 12px;text-transform:uppercase}
.row{display:flex;flex-wrap:wrap;gap:9px;margin:0 22px 30px}.c{padding:11px 15px;border-radius:999px;border:1.5px solid #d4d4d4;font:600 14px In;color:#333}
.c.on{background:#ff85dc;border-color:#ff85dc;color:#111;font-weight:800}.sum{margin:6px 22px 18px;padding:16px 18px;border-radius:18px;background:#fbeef8;font:600 14px/1.5 In;color:#444}.sum b{display:block;font:800 18px/1.3 In;color:#111}
.go{display:block;margin:10px 22px 0;padding:17px;border-radius:999px;background:#111;color:#fff;text-align:center;font:800 17px In}</style>${strip}
<div class="top">Lacquer Lagoon<span>✕</span></div><div class="k">BOOK A SET</div><h1>Pick a time</h1>
<div class="lab">Service</div><div class="row svc"><span class="c on">✓ Gel-X</span><span class="c">Structured gel</span><span class="c">Nail art</span></div>
<div class="lab">Day</div><div class="row days"><span class="c">Wed</span><span class="c on">✓ Thu</span><span class="c">Fri</span><span class="c">Sat</span></div>
<div class="lab">Time</div><div class="row times"><span class="c">10:30 AM</span><span class="c on">✓ 1:00 PM</span><span class="c">3:30 PM</span><span class="c">5:00 PM</span></div>
<div class="sum"><b>Gel-X · Thu · 1:00 PM</b>Lacquer Lagoon · Brickell</div><a class="go">Confirm booking →</a><div style="height:100px"></div>` },
};
const BOXES = `(sels)=>{const o={};for(const [k,q] of Object.entries(sels)){const e=document.querySelector(q);if(!e)continue;const r=e.getBoundingClientRect();o[k]=[Math.round(r.left+scrollX),Math.round(r.top+scrollY),Math.round(r.width),Math.round(r.height)];}return o;}`;
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--no-sandbox'] });
const out = {};
for (const [name, d] of Object.entries(PAGES)) {
  const pg = await b.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1.5 });
  const f = `${TMP}${name}.html`; writeFileSync(f, `<!doctype html><meta charset=utf-8>${d.html}`);
  await pg.goto('file://' + f); await pg.evaluate(() => document.fonts.ready); await pg.waitForTimeout(200);
  out[`demo/${name}.jpg`] = { cssWidth: 390, cssHeight: await pg.evaluate(() => document.documentElement.scrollHeight), boxes: await pg.evaluate(`(${BOXES})(${JSON.stringify(d.boxes)})`) };
  await pg.screenshot({ path: `${HERE}${name}.jpg`, fullPage: true, type: 'jpeg', quality: 86 });
  console.log(name, JSON.stringify(out[`demo/${name}.jpg`]));
  await pg.close();
}
await b.close();
const sj = JSON.parse(readFileSync(HERE + 'screens.json', 'utf8'));            // merge (re-read right before writing)
writeFileSync(HERE + 'screens.json', JSON.stringify({ ...sj, ...out }, null, 1));
console.log('screens.json +', Object.keys(out).length);
