// node guide.mjs → docs/sales/SDX-Inspect-setup-guide.pdf (US Letter, 8 pages) — sent to every new customer with the Zoom training.
// Screens from out/stills (run stills.mjs + pov.mjs first). Demo data only, no Sodexo / Hard Rock.
import { writeFileSync, mkdirSync } from 'fs';
import { chromium } from '/home/user/Claude/node_modules/playwright-core/index.mjs';
import { C, TEAL, lockup, fontCss } from './sdxmark.mjs';
const DIR = new URL('.', import.meta.url).pathname;
const OUT = new URL('../../docs/sales/', import.meta.url).pathname; mkdirSync(OUT, { recursive: true });
const S = f => `file://${DIR}out/stills/${f}`;
const CONTACT = { name: 'Joxel Da Silva', co: 'DS Marketing', email: 'DSmarketing@wwwdsmarketing.com', ig: '@sdxinspect' };
const N = 8;
const css = `${fontCss(DIR)}
@page{size:8.5in 11in;margin:0} *{margin:0;box-sizing:border-box}
body{font-family:I,Arial;color:${C.ink};-webkit-print-color-adjust:exact;print-color-adjust:exact}
.pg{width:816px;height:1056px;position:relative;overflow:hidden;background:#fff;page-break-after:always}.pg:last-child{page-break-after:auto}
.hd{height:74px;background:${C.navy};display:flex;align-items:center;justify-content:space-between;padding:0 44px}.hd .n{color:#B9BCE6;font-weight:600;font-size:13px}
.body{padding:34px 44px 0}
.step{font-weight:800;font-size:13px;letter-spacing:3px;color:${C.red};text-transform:uppercase}
h2{font-weight:800;font-size:34px;line-height:1.08;letter-spacing:-1px;color:${C.navy};margin-top:8px}
p.lead{font-size:15.5px;line-height:1.5;color:${C.muted};margin-top:10px;font-weight:500;max-width:62ch}
ol.do{margin-top:22px;display:flex;flex-direction:column;gap:12px;counter-reset:s;list-style:none}
ol.do li{counter-increment:s;display:grid;grid-template-columns:30px 1fr;gap:12px;font-size:15px;line-height:1.45;font-weight:500}
ol.do li::before{content:counter(s);width:30px;height:30px;border-radius:9px;background:${C.navy};color:#fff;font-weight:800;font-size:14px;display:flex;align-items:center;justify-content:center}
ol.do b, ul.tip b{font-weight:800;color:${C.navy}}
.tipbox{margin-top:18px;background:#EEF9F7;border-radius:12px;padding:12px 16px;font-size:14px;line-height:1.45;color:${C.ink}}
.tipbox b{color:#0F766E}
.shots{position:absolute;left:44px;right:44px;bottom:60px;display:flex;gap:20px;justify-content:center;align-items:flex-end}
.ph{border-radius:24px;border:7px solid #fff;box-shadow:0 0 0 2px ${C.navy},0 12px 28px rgba(42,41,92,.22);overflow:hidden;background:#fff}
.ph img{display:block;width:100%;height:100%;object-fit:cover;object-position:top}
.lp{border-radius:12px;border:6px solid #fff;box-shadow:0 0 0 2px ${C.navy},0 12px 28px rgba(42,41,92,.2);overflow:hidden}.lp img{display:block;width:100%}
.cap{font-size:12px;font-weight:700;color:${C.muted};text-align:center;margin-top:8px}
.ft{position:absolute;left:44px;right:44px;bottom:20px;display:flex;justify-content:space-between;font-size:11.5px;color:${C.muted};font-weight:600}`;
const hd = n => `<div class="hd">${lockup(42, 'light')}<span class="n">Setup guide · ${n} / ${N}</span></div>`;
const ft = `<div class="ft"><span>Questions? ${CONTACT.name} · ${CONTACT.email}</span><span>SDX Inspect · ${CONTACT.co}</span></div>`;
const ph = (f, w, cap) => `<div><div class="ph" style="width:${w}px;height:${Math.round(w * 1.9)}px"><img src="${S(f)}"></div>${cap ? `<div class="cap">${cap}</div>` : ''}</div>`;
const lp = (f, w, cap) => `<div><div class="lp" style="width:${w}px"><img src="${S(f)}"></div>${cap ? `<div class="cap">${cap}</div>` : ''}</div>`;
const page = (n, step, title, lead, items, tip, shots) => `<section class="pg">${hd(n)}<div class="body"><div class="step">${step}</div><h2>${title}</h2><p class="lead">${lead}</p>
<ol class="do">${items.map(i => `<li><span>${i}</span></li>`).join('')}</ol>${tip ? `<div class="tipbox"><b>Tip:</b> ${tip}</div>` : ''}</div><div class="shots">${shots}</div>${ft}</section>`;

const pages = [
  `<section class="pg" style="background:linear-gradient(160deg,${C.navy},${C.navyDeep})">
  <div style="position:absolute;top:70px;left:60px">${lockup(80, 'light')}</div>
  <div style="position:absolute;top:240px;left:60px;right:60px"><div class="step" style="color:${TEAL}">Setup guide</div>
  <h1 style="font-weight:800;font-size:54px;line-height:1.02;letter-spacing:-2px;color:#fff;margin-top:12px">Get your venue running in one afternoon.</h1>
  <p style="color:#C9CCEB;font-size:18px;line-height:1.5;margin-top:18px;font-weight:500">Follow these six steps with us on the Zoom training call, or on your own. Each step takes 5 to 20 minutes.</p></div>
  <div style="position:absolute;top:560px;left:60px;right:60px;display:grid;grid-template-columns:1fr 1fr;gap:14px">
  ${[['1', 'Your team signs in', 'p. 2'], ['2', 'Your stands and QR posters', 'p. 3'], ['3', 'Stand teams log their temps', 'p. 4'], ['4', 'Crews get their board', 'p. 5'], ['5', 'The inspection walk', 'p. 6'], ['6', 'Follow up and prove it', 'p. 7']]
    .map(([n, t, p]) => `<div style="background:rgba(255,255,255,.08);border:1.5px solid rgba(255,255,255,.16);border-radius:14px;padding:16px 18px;display:flex;gap:14px;align-items:center"><span style="width:34px;height:34px;border-radius:10px;background:${TEAL};color:${C.navyDeep};font-weight:800;font-size:17px;display:flex;align-items:center;justify-content:center">${n}</span><span style="color:#fff;font-weight:700;font-size:16px;flex:1">${t}</span><span style="color:#9EA2D6;font-size:13px;font-weight:600">${p}</span></div>`).join('')}
  <div style="grid-column:1/-1;background:rgba(255,255,255,.08);border:1.5px solid rgba(255,255,255,.16);border-radius:14px;padding:16px 18px;color:#fff;font-weight:700;font-size:16px">✓ First event-day checklist and who to call <span style="color:#9EA2D6;font-size:13px;font-weight:600;float:right">p. 8</span></div></div>
  <div style="position:absolute;left:60px;right:60px;bottom:40px;display:flex;justify-content:space-between;color:#B9BCE6;font-size:13px;font-weight:600"><span>${CONTACT.name} · ${CONTACT.co}</span><span>${CONTACT.email}</span></div></section>`,
  page(2, 'Step 1', 'Your team signs in', 'Inspectors and managers sign in with a badge number. We create one for each person during setup. The app works on any phone, tablet or laptop.', [
    'Open the SDX Inspect link we send you.',
    'Type your <b>badge number</b> and tap <b>Sign In</b>.',
    '<b>Install it like an app:</b> on iPhone tap Share → <b>Add to Home Screen</b>; on Android tap ⋮ → <b>Install app</b>.',
    'At a stand, tap <b>"Tap here — I\'m on site"</b>. That starts the inspection and its timer.'],
    'need a new person added? Send us their name and role and we add a badge the same day.',
    ph('signin.png', 220, 'Badge sign-in')),
  page(3, 'Step 2', 'Your stands and QR posters', 'Every stand gets one QR poster. The poster is how stand teams, supervisors and crews reach that stand in the app.', [
    'Open <b>Stands & equipment → Posters & licenses</b>.',
    'Check your list of stands. Missing one? Use <b>Add a stand</b>: unit #, name, floor, type and license.',
    'Print: tap a floor (for example <b>Floor 1</b>) to print that floor, or <b>Print</b> for all. Each floor prints with a cover sheet, so the stack is easy to hand out.',
    'Tape each poster where the team sees it every shift, at eye level. A plastic sheet protector keeps it readable.'],
    'we can send you the posters as a PDF to print, if you prefer.',
    lp('posters.png', 620, 'Posters & licenses — print by floor')),
  page(4, 'Step 3', 'Stand teams log their temps', 'Nothing to install and no password. The team scans the poster with the phone camera.', [
    'Scan the poster → type <b>name and phone</b> → tap <b>This is my location</b>.',
    'Tap a food type (hot holding, cooking, cold holding…) or a cooler / freezer, type the temperature, tap <b>Log it</b>.',
    'A reading outside the rule asks <b>what they did about it</b>. Readings go to the inspector right away.',
    'The same page lets them <b>ask for supplies</b> and <b>report a problem</b> with a photo. English, Spanish and Haitian Creole.'],
    'the rule everyone uses: coolers 40°F or below, freezers 20°F or below, hot holding 135°F or above, cold food 41°F or below.',
    ph('portal_start.jpg', 200, 'Scan → name + phone') + ph('portal.jpg', 200, 'Logged and sent')),
  page(5, 'Step 4', 'Crews get their board', 'Maintenance, cleaning and chemical-supply crews get a link. No badge and no password: they type their name once and the phone stays signed in.', [
    'Open <b>Admin → Invite links</b> and tap <b>Share</b> or <b>Text</b> next to the crew (we can do this for you).',
    'The crew member opens the link, types their name and taps <b>Open my board</b>.',
    'On each card: <b>I\'m working on it</b>, then <b>Done — add photo</b> with the AFTER photo.',
    'Not their job? <b>more… → Not mine → move</b> sends it to the right crew.'],
    'tap ↻ New on an invite link to replace it. Phones that used the old link are signed out.',
    lp('invites.png', 330, 'Invite links') + ph('crewjoin.png', 160, 'Crew joins') + ph('after.jpg', 160, 'Done + AFTER photo')),
  page(6, 'Step 5', 'The inspection walk', 'One full guide for every stand. The type of inspection sets what comes first.', [
    'Pick the type: <b>Event day</b> (temps, uniforms and operations first), <b>Regular</b> (every section in order) or <b>Post-event</b> (inventory, cleaning and facilities first).',
    'Go section by section. Type temperatures; a bad one turns red right away.',
    'Something wrong? Tap <b>✗</b>, say what is wrong and where, and take the <b>BEFORE</b> photo. Add what you did about it.',
    'Tap <b>Save Report</b>. Nothing is mandatory, and everything is saved on the phone as you go, even with no signal.'],
    'every problem you save becomes a card for the right crew, with your photo.',
    ph('temps.jpg', 200, 'Temps flagged') + ph('problem.jpg', 200, 'BEFORE photo + where')),
  page(7, 'Step 6', 'Follow up and prove it', 'Everything open, everything fixed, and who skipped their temp log, in one place.', [
    '<b>History → Analytics → Follow-ups:</b> every open problem. Filter by floor, crew or stand number. <b>Remind</b> sends one message to the team; <b>✓ Fixed</b> closes it.',
    '<b>Temps → Not scanning:</b> stands that did not log temps on event days, with <b>Text the flagged</b>.',
    '<b>📣 Announce</b> (Stands & equipment) sends a message to every stand, a floor or a type of stand: recalls, health inspector visits, new rules.',
    '<b>Excel</b> exports with BEFORE and AFTER photos, for audits and billing.'],
    '',
    ph('followups.png', 170, 'Follow-ups') + lp('notscanning.png', 300, 'Who is not scanning') + ph('announce.png', 170, 'Announce')),
  `<section class="pg">${hd(8)}<div class="body"><div class="step">Before your first event day</div><h2>Checklist</h2>
  <div style="margin-top:22px;display:flex;flex-direction:column;gap:10px">
  ${['Every inspector and manager signed in once and installed the app.', 'Every stand is in the list, with the right floor and type.', 'Posters printed and taped at every stand.', 'Each stand supervisor scanned their poster once and logged a test temperature.', 'Each crew opened its invite link and sees its board.', 'One practice walk done on a non-event day.', 'Someone owns Follow-ups after each event (15 minutes).']
    .map(t => `<div style="display:grid;grid-template-columns:28px 1fr;gap:12px;align-items:center;font-size:16px;font-weight:500"><span style="width:28px;height:28px;border-radius:8px;border:2.5px solid ${C.navy}"></span><span>${t}</span></div>`).join('')}</div>
  <div style="margin-top:34px;display:grid;grid-template-columns:1fr 1fr;gap:16px">
  <div style="background:${C.bg};border-radius:14px;padding:18px 20px"><div style="font-weight:800;font-size:18px;color:${C.navy}">Zoom training (45 min)</div><div style="font-size:14px;line-height:1.5;color:${C.muted};margin-top:8px;font-weight:500">Steps 1–6 live with your team. Bring one inspector, one stand supervisor and one crew lead, each with their phone.</div></div>
  <div style="background:${C.bg};border-radius:14px;padding:18px 20px"><div style="font-weight:800;font-size:18px;color:${C.navy}">On-site visit (optional)</div><div style="font-size:14px;line-height:1.5;color:${C.muted};margin-top:8px;font-weight:500">We come to your venue, hang the posters with you and walk the first event day. Travel is billed at cost.</div></div></div>
  <div style="margin-top:22px;background:${C.navy};border-radius:14px;padding:20px 24px;color:#fff"><div style="font-weight:800;font-size:20px">Help, any day</div><div style="font-size:15px;color:#C9CCEB;margin-top:6px;font-weight:500">${CONTACT.name} · ${CONTACT.email} · Instagram ${CONTACT.ig}</div></div></div>${ft}</section>`,
];
const html = `<!doctype html><meta charset=utf-8><style>${css}</style>${pages.join('\n')}`;
writeFileSync(DIR + 'out/guide.html', html);
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--no-sandbox'] });
const p = await b.newPage({ viewport: { width: 816, height: 1056 } });
await p.goto(`file://${DIR}out/guide.html`); await p.evaluate(() => document.fonts.ready); await p.waitForTimeout(400);
await p.pdf({ path: OUT + 'SDX-Inspect-setup-guide.pdf', width: '8.5in', height: '11in', printBackground: true, preferCSSPageSize: true });
for (let i = 0; i < pages.length; i++) { await p.evaluate(n => document.querySelectorAll('.pg').forEach((s, j) => { s.style.display = j === n ? 'block' : 'none'; }), i); await p.screenshot({ path: `${DIR}out/guide${i + 1}.png` }); }
await b.close();
console.log('guide →', OUT + 'SDX-Inspect-setup-guide.pdf');
