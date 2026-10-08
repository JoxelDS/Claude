// node deck.mjs → docs/sales/SDX-Inspect-presentation.pdf (16:9, 9 slides) + SDX-Inspect-one-pager.pdf (US Letter)
// Sales material for prospects: the app's own look, real (demo-data) screens from out/stills (run stills.mjs + pov.mjs first).
// No Sodexo / Hard Rock names, logos or screens. No invented numbers.
import { writeFileSync, mkdirSync } from 'fs';
import { chromium } from '/home/user/Claude/node_modules/playwright-core/index.mjs';
import { C, TEAL, lockup, mark, fontCss } from './sdxmark.mjs';
const DIR = new URL('.', import.meta.url).pathname;
const OUT = new URL('../../docs/sales/', import.meta.url).pathname; mkdirSync(OUT, { recursive: true });
const S = f => `file://${DIR}out/stills/${f}`;
const CONTACT = { name: 'Joxel Da Silva', co: 'SDX Inspect', email: process.env.SDX_EMAIL || 'joxelds.github.io/Claude', ig: '@sdxinspect' };
const css = `${fontCss(DIR)}
*{margin:0;box-sizing:border-box} body{font-family:I,Arial;color:${C.ink};-webkit-print-color-adjust:exact;print-color-adjust:exact}
.slide{width:1920px;height:1080px;position:relative;overflow:hidden;page-break-after:always;background:${C.bg}}
.slide:last-child{page-break-after:auto}
.bar{position:absolute;left:0;right:0;top:0;height:120px;background:${C.navy};display:flex;align-items:center;justify-content:space-between;padding:0 80px}
.bar .pg{color:#B9BCE6;font-weight:600;font-size:24px}
.k{font-weight:800;font-size:26px;letter-spacing:4px;text-transform:uppercase;color:${C.red}}
h1{font-weight:800;font-size:96px;line-height:.98;letter-spacing:-3px;color:${C.navy}}
h2{font-weight:800;font-size:76px;line-height:1.02;letter-spacing:-2.5px;color:${C.navy}}
p.lead{font-weight:500;font-size:36px;line-height:1.35;color:${C.muted}}
ul.pts{list-style:none;display:flex;flex-direction:column;gap:26px}
ul.pts li{display:grid;grid-template-columns:44px 1fr;gap:18px;align-items:start;font-size:32px;line-height:1.3;font-weight:500;color:${C.ink}}
ul.pts li b{font-weight:800;color:${C.navy}}
.tick{width:44px;height:44px;border-radius:12px;background:${C.navy};display:flex;align-items:center;justify-content:center;margin-top:2px}
.phone{border-radius:44px;border:14px solid #fff;box-shadow:0 0 0 3px ${C.navy},0 40px 80px rgba(42,41,92,.28);overflow:hidden;background:#fff}
.phone img{display:block;width:100%;height:100%;object-fit:cover;object-position:top}
.laptop{border-radius:18px;border:12px solid #fff;box-shadow:0 0 0 3px ${C.navy},0 40px 80px rgba(42,41,92,.25);overflow:hidden}
.laptop img{display:block;width:100%}
.cap{font-weight:700;font-size:22px;color:${C.muted};text-align:center;margin-top:18px}
.foot{position:absolute;left:80px;right:80px;bottom:44px;display:flex;justify-content:space-between;font-size:22px;color:${C.muted};font-weight:600}`;
const tick = `<span class="tick"><svg width="26" height="26" viewBox="0 0 24 24"><path d="M5 12.5 10 17.5 19 7" fill="none" stroke="${TEAL}" stroke-width="3.4" stroke-linecap="round" stroke-linejoin="round"/></svg></span>`;
const bar = n => `<div class="bar">${lockup(70, 'light')}<span class="pg">${n} / 9</span></div>`;
const foot = `<div class="foot"><span>${CONTACT.name} · ${CONTACT.co}</span><span>${CONTACT.email} · Instagram ${CONTACT.ig}</span></div>`;
const phone = (src, w, cap) => `<div><div class="phone" style="width:${w}px;height:${Math.round(w * 1.9)}px"><img src="${src}"></div>${cap ? `<div class="cap">${cap}</div>` : ''}</div>`;
const pts = items => `<ul class="pts">${items.map(t => `<li>${tick}<span>${t}</span></li>`).join('')}</ul>`;
const twoCol = (n, kick, title, items, right) => `<section class="slide">${bar(n)}
<div style="position:absolute;top:190px;left:80px;width:860px;display:flex;flex-direction:column;gap:34px"><div class="k">${kick}</div><h2>${title}</h2>${pts(items)}</div>
<div style="position:absolute;top:170px;right:80px;display:flex;gap:40px;align-items:flex-start">${right}</div>${foot}</section>`;

const slides = [
  // 1 cover
  `<section class="slide" style="background:linear-gradient(160deg,${C.navy},${C.navyDeep})">
  <div style="position:absolute;top:110px;left:110px">${lockup(130, 'light')}</div>
  <div style="position:absolute;top:360px;left:110px;width:1050px">
    <h1 style="color:#fff;font-size:110px">Every stand checked. Every problem fixed. <span style="color:${TEAL}">With proof.</span></h1>
    <p class="lead" style="color:#C9CCEB;margin-top:40px">The inspection app for stadiums, concession operators, restaurant groups and events.</p></div>
  <div style="position:absolute;right:130px;top:150px;transform:rotate(4deg)">${phone(S('temps.jpg'), 420)}</div>
  <div class="foot" style="color:#B9BCE6"><span>${CONTACT.name} · ${CONTACT.co}</span><span>${CONTACT.email}</span></div></section>`,
  // 2 problem
  `<section class="slide">${bar(2)}
  <div style="position:absolute;top:200px;left:80px;right:80px"><div class="k">The problem</div>
  <h2 style="margin-top:24px;font-size:92px">Event day. 100+ stands.<br>One inspector and a clipboard.</h2></div>
  <div style="position:absolute;top:600px;left:80px;right:80px;display:grid;grid-template-columns:repeat(3,1fr);gap:36px">
  ${[['Notes get lost', 'Paper gets wet, greasy and left in a truck. The problem you saw at 6 PM is gone by Monday.'],
     ['Nobody knows if it was fixed', '"Done" by text, no photo. The same cooler is warm again next event.'],
     ['Stands skip the temp log', 'HACCP sheets filled in at the end of the night, or not at all. You find out at the audit.']]
    .map(([t, d]) => `<div style="background:#fff;border-radius:24px;padding:40px;box-shadow:0 10px 30px rgba(42,41,92,.08)"><div style="font-weight:800;font-size:40px;color:${C.red};letter-spacing:-1px">${t}</div><div style="font-size:28px;line-height:1.4;color:${C.muted};margin-top:16px;font-weight:500">${d}</div></div>`).join('')}</div>${foot}</section>`,
  // 3 walk it
  twoCol(3, 'Walk it', 'A full inspection on one phone', [
    '<b>One temperature rule</b> for everyone: coolers ≤ 40°F, freezers ≤ 20°F, hand sinks ≥ 95°F. A bad reading is flagged the second it is typed.',
    '<b>Problems with proof:</b> what is wrong, where, and a BEFORE photo, in a few taps.',
    '<b>The inspection type sets the focus:</b> event day puts temps and uniforms first, post-event puts cleaning and inventory first.',
    '<b>Saves every tap</b> on the phone, even with no signal.'],
    phone(S('temps.jpg'), 400, 'Temps flagged on the spot') + phone(S('problem.jpg'), 400, 'BEFORE photo + where')),
  // 4 stands
  twoCol(4, 'Stand teams', 'Stands log their own temps with one scan', [
    '<b>One QR poster per stand.</b> No app to download, no password.',
    'Supervisors log hot and cold holding, coolers and freezers. A bad reading asks <b>what they did about it</b>, and it reaches the inspector right away.',
    'They can also <b>ask for supplies</b> and <b>report a problem</b> with a photo.',
    'English, Spanish and Haitian Creole.'],
    phone(S('portal_start.jpg'), 400, 'Scan the poster') + phone(S('portal.jpg'), 400, 'Logged and sent')),
  // 5 fix it
  twoCol(5, 'Fix it', 'Crews close problems with an AFTER photo', [
    '<b>Maintenance, cleaning and chemical crews</b> each get their own board from a link. No badge, no password.',
    'One card per problem, with the BEFORE photo and the place.',
    '<b>I\'m working on it → Done + AFTER photo.</b> The inspector sees it fixed, with the time.',
    'Wrong crew? <b>Not mine → move</b> sends it to the right one.'],
    phone(S('board.jpg'), 400, 'The crew\'s board') + phone(S('after.jpg'), 400, 'Done + AFTER photo')),
  // 6 prove it
  `<section class="slide">${bar(6)}
  <div style="position:absolute;top:190px;left:80px;width:640px;display:flex;flex-direction:column;gap:34px"><div class="k">Prove it</div><h2>Know what is open, and who didn't log</h2>
  ${pts(['<b>Follow-ups:</b> every open problem by stand, floor and crew. Remind the team in one message.', '<b>Who is not scanning:</b> stands that skipped their temp log, flagged, with one tap to text them.', '<b>Excel with BEFORE and AFTER photos</b> for audits, owners and billing.'])}</div>
  <div style="position:absolute;top:180px;right:80px;display:flex;gap:36px;align-items:flex-start">${phone(S('followups.png'), 330, 'Follow-ups')}<div style="width:760px"><div class="laptop"><img src="${S('notscanning.png')}"></div><div class="cap">Who did not log temps</div></div></div>${foot}</section>`,
  // 7 recall
  twoCol(7, 'When a recall hits', 'Reach every stand in one message', [
    'A recall drops at 7 PM on event day. <b>One announcement</b> goes to every stand, a floor or a type of stand.',
    'Teams see it <b>the moment they scan their poster.</b>',
    'Follow up stand by stand from the same app, with photos.'],
    phone(S('announce.png'), 380, 'Announce to every stand')),
  // 8 built in the field
  `<section class="slide">${bar(8)}
  <div style="position:absolute;top:220px;left:80px;width:1100px;display:flex;flex-direction:column;gap:40px"><div class="k">Built in the field</div>
  <h2 style="font-size:88px">Made by an inspector who walks 100+ stands every event day.</h2>
  <p class="lead">SDX Inspect is used every day at a large stadium in Miami. Every screen was shaped by real event days: rain, no signal, crowded stands, crews in three languages.</p>
  ${pts(['Works on any phone, tablet or laptop. Installs like an app.', 'Each venue has its own data. Export to Excel any time.'])}</div>
  <div style="position:absolute;right:120px;top:260px">${mark(420)}</div>${foot}</section>`,
  // 9 pilot
  `<section class="slide" style="background:linear-gradient(160deg,${C.navy},${C.navyDeep})">
  <div style="position:absolute;top:100px;left:110px">${lockup(90, 'light')}</div>
  <div style="position:absolute;top:280px;left:110px;right:110px"><div class="k" style="color:${TEAL}">The offer</div>
  <h1 style="color:#fff;margin-top:24px">Try it free for 30 days.</h1></div>
  <div style="position:absolute;top:560px;left:110px;right:110px;display:grid;grid-template-columns:repeat(3,1fr);gap:36px">
  ${[['Week 1', 'We set up your stands and QR posters and train your team in 20 minutes.'], ['Weeks 2–4', 'Run it on your event days or shifts. We are on call.'], ['Day 30', 'We sit down with your own numbers: temps logged, problems found, fixed, and the proof.']]
    .map(([t, d]) => `<div style="background:rgba(255,255,255,.08);border:2px solid rgba(255,255,255,.16);border-radius:24px;padding:40px"><div style="font-weight:800;font-size:40px;color:#fff">${t}</div><div style="font-size:28px;line-height:1.4;color:#C9CCEB;margin-top:14px;font-weight:500">${d}</div></div>`).join('')}</div>
  <div style="position:absolute;left:110px;right:110px;bottom:90px;display:flex;justify-content:space-between;align-items:flex-end;color:#fff">
  <div style="font-size:34px;font-weight:800">${CONTACT.name} · ${CONTACT.co}</div><div style="text-align:right;font-size:30px;font-weight:600;color:#C9CCEB">${CONTACT.email}<br>Instagram ${CONTACT.ig}</div></div></section>`,
];

const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--no-sandbox'] });
const page = await b.newPage({ viewport: { width: 1920, height: 1080 } });
writeFileSync(DIR + 'out/deck.html', `<!doctype html><meta charset=utf-8><style>@page{size:1920px 1080px;margin:0}${css}</style>${slides.join('\n')}`);
await page.goto(`file://${DIR}out/deck.html`); await page.evaluate(() => document.fonts.ready); await page.waitForTimeout(400);
await page.pdf({ path: OUT + 'SDX-Inspect-presentation.pdf', width: '1920px', height: '1080px', printBackground: true, preferCSSPageSize: true });
// preview PNGs of every slide for review
for (let i = 0; i < slides.length; i++) { await page.evaluate(n => { document.querySelectorAll('.slide').forEach((s, j) => { s.style.display = j === n ? 'block' : 'none'; }); }, i); await page.screenshot({ path: `${DIR}out/slide${i + 1}.png` }); }

// one-pager, US Letter portrait
const one = `<!doctype html><meta charset=utf-8><style>@page{size:8.5in 11in;margin:0}${fontCss(DIR)}*{margin:0;box-sizing:border-box}body{font-family:I,Arial;color:${C.ink};-webkit-print-color-adjust:exact;print-color-adjust:exact}
.pg{width:816px;height:1056px;position:relative;background:${C.bg};overflow:hidden}
.hd{background:${C.navy};padding:34px 44px 30px;color:#fff}.hd h1{font-weight:800;font-size:38px;line-height:1.05;letter-spacing:-1px;margin-top:22px}.hd h1 span{color:${TEAL}}
.hd p{color:#C9CCEB;font-size:16px;margin-top:10px;font-weight:500}
.g{display:grid;grid-template-columns:1fr 1fr;gap:18px;padding:26px 44px 0}
.c{background:#fff;border-radius:16px;padding:18px 20px;box-shadow:0 6px 18px rgba(42,41,92,.07)}.c h3{font-weight:800;font-size:19px;color:${C.navy};letter-spacing:-.3px}.c p{font-size:14px;line-height:1.45;color:${C.muted};margin-top:6px;font-weight:500}
.shots{display:flex;gap:14px;justify-content:center;padding:22px 44px 0}.shots img{width:150px;height:286px;object-fit:cover;object-position:top;border-radius:20px;border:6px solid #fff;box-shadow:0 0 0 2px ${C.navy},0 10px 24px rgba(42,41,92,.2)}
.of{margin:22px 44px 0;background:${C.navy};border-radius:16px;padding:20px 24px;color:#fff;display:flex;justify-content:space-between;align-items:center;gap:20px}.of b{font-size:24px;font-weight:800}.of span{font-size:14px;color:#C9CCEB;font-weight:500}
.ft{position:absolute;left:44px;right:44px;bottom:26px;display:flex;justify-content:space-between;font-size:13px;color:${C.muted};font-weight:600}</style>
<div class="pg"><div class="hd">${lockup(54, 'light')}<h1>Every stand checked. Every problem fixed. <span>With proof.</span></h1><p>The inspection app for stadiums, concession operators, restaurant groups and events.</p></div>
<div class="g">${[['Walk it', 'Full inspection on one phone. Bad temps flagged the second they are typed. Problems saved with what, where and a BEFORE photo.'], ['Stands log their own temps', 'One QR poster per stand. No app, no password. A bad reading asks what they did about it and reaches the inspector right away.'], ['Fix it', 'Crews get their own board from a link and close each problem with an AFTER photo.'], ['Prove it', 'Every open problem by stand and crew, who did not log temps, and Excel with BEFORE and AFTER photos.']].map(([t, d]) => `<div class="c"><h3>${t}</h3><p>${d}</p></div>`).join('')}</div>
<div class="shots">${['temps.jpg', 'problem.jpg', 'portal.jpg', 'after.jpg'].map(f => `<img src="${S(f)}">`).join('')}</div>
<div class="of"><div><b>Free 30-day pilot</b><br><span>We set up your stands, train your team in 20 minutes, and review your own numbers on day 30.</span></div></div>
<div class="ft"><span>${CONTACT.name} · ${CONTACT.co} · Built by an inspector who walks 100+ stands every event day</span><span>${CONTACT.email}</span></div></div>`;
writeFileSync(DIR + 'out/one.html', one);
const p2 = await b.newPage({ viewport: { width: 816, height: 1056 }, deviceScaleFactor: 2 });
await p2.goto(`file://${DIR}out/one.html`); await p2.evaluate(() => document.fonts.ready); await p2.waitForTimeout(300);
await p2.pdf({ path: OUT + 'SDX-Inspect-one-pager.pdf', width: '8.5in', height: '11in', printBackground: true, preferCSSPageSize: true });
await p2.screenshot({ path: DIR + 'out/onepager.png' });
await b.close();
console.log('deck + one-pager →', OUT);
