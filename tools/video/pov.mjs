// node pov.mjs <clip> ["HOOK line 1|line 2 with *yellow* word"]  → out/pov-<clip>.mp4
// Records the real app at phone size (390×844 @3×, no stage), logs a caption cue per action,
// then cuts a sharp 1080×1920 Reel: hook, timed step captions, zoom punch on key moments, end card, beat.
import { readFileSync, writeFileSync, mkdirSync, rmSync } from 'fs';
import { execFileSync } from 'child_process';
import * as L from './lib.mjs';
import * as S from './seed.mjs';
const { W, jpg, route, initAll, seedFn } = L;
const FF = process.env.FFMPEG || '/tmp/ff/node_modules/ffmpeg-static/ffmpeg';
const DIR = new URL('.', import.meta.url).pathname;
const APP = 'https://app.local/Claude/';
const STAND = APP + '?haccp=1&site=MAGIC+CITY+DOGS&unit=114&loctype=Concession';
const now = () => Date.now() / 1000;
const SCALE = 1080 / 390;               // css px → output px
const CROPY = Math.round((844 * SCALE - 1920) / 2); // centre crop of the 2338 px tall frame

// touch dot + clean screens, injected into the app page
const touch = () => {
  if (!location.pathname.startsWith('/Claude')) return;
  const add = () => { const s = document.createElement('style'); s.textContent = `.foodSafetyRefWrap{display:none!important}
.__td{position:fixed;width:46px;height:46px;margin:-23px 0 0 -23px;border-radius:50%;background:rgba(255,255,255,.55);border:2px solid rgba(0,0,0,.25);box-shadow:0 2px 10px rgba(0,0,0,.35);pointer-events:none;z-index:2147483647;transition:transform .35s ease-out,opacity .35s ease-out}`;
    (document.head || document.documentElement).appendChild(s); };
  if (document.documentElement) add(); else document.addEventListener('DOMContentLoaded', add);
  window.__tap = (x, y) => { const d = document.createElement('div'); d.className = '__td'; d.style.left = x + 'px'; d.style.top = y + 'px'; d.style.transform = 'scale(.6)'; document.body.appendChild(d);
    requestAnimationFrame(() => { d.style.transform = 'scale(1)'; }); setTimeout(() => { d.style.opacity = '0'; d.style.transform = 'scale(1.4)'; }, 380); setTimeout(() => d.remove(), 900); };
};

async function record(name, body) {
  const OUT = `${DIR}out/pov_${name}`; rmSync(OUT, { recursive: true, force: true }); mkdirSync(OUT + '/f', { recursive: true });
  const { browser, PICS } = L._state();
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true, locale: 'en-US', timezoneId: 'America/New_York', serviceWorkers: 'block' });
  await ctx.route('**/*', route); await ctx.addInitScript(initAll); await ctx.addInitScript(touch);
  await ctx.addInitScript(seedFn, [S.buildHistory(PICS), S.venueSettings(), S.users, S.regdoc, S.haccpSubs(), {}]);
  const page = await ctx.newPage(); page.on('dialog', d => d.accept().catch(() => {}));
  page.on('pageerror', e => { if (!/ServiceWorker/i.test(e.message)) console.log('PAGEERR', e.message.slice(0, 160)); });
  const cdp = await ctx.newCDPSession(page); const frames = []; let fi = 0, on = false;
  cdp.on('Page.screencastFrame', ev => { cdp.send('Page.screencastFrameAck', { sessionId: ev.sessionId }).catch(() => {}); if (!on) return; const f = `f/${String(++fi).padStart(6, '0')}.jpg`; writeFileSync(`${OUT}/${f}`, Buffer.from(ev.data, 'base64')); frames.push([f, ev.metadata.timestamp]); });
  const cues = []; let T0 = 0;
  const a = {
    page, W,
    async open(url, settle = 2500) { await page.goto(url); await W(settle); },
    start: async () => { await cdp.send('Page.startScreencast', { format: 'jpeg', quality: 95, maxWidth: 1170, maxHeight: 2532, everyNthFrame: 1 }); on = true; T0 = now(); await W(300); },
    cue(text, { key = false, y = null } = {}) { cues.push({ t: now() - T0, text, key, y }); },
    async find(sel, re, tries = 16) { for (let i = 0; i < tries; i++) { for (const e of await page.$$(sel)) { const t = (await e.textContent().catch(() => '')) || ''; if ((!re || re.test(t)) && await e.isVisible().catch(() => false)) return e; } await W(250); } console.log('  MISSING', sel, re || ''); return null; },
    async show(e, block = 'center') { if (!e) return; await e.evaluate((el, b) => { const r = el.getBoundingClientRect(); if (r.top >= 90 && r.bottom <= innerHeight - 90 && b !== 'start') return; el.scrollIntoView({ behavior: 'smooth', block: b }); }, block); await W(850); },
    async tap(sel, re, { settle = 900, cue, key, show = true } = {}) {
      const e = typeof sel === 'string' ? await a.find(sel, re) : sel; if (!e) return null;
      if (show) await a.show(e); const b = await e.boundingBox(); if (!b) return null;
      const x = b.x + b.width / 2, y = b.y + b.height / 2;
      if (cue) a.cue(cue, { key, y });
      await page.evaluate(([x, y]) => window.__tap && window.__tap(x, y), [x, y]); await W(140);
      await e.click({ timeout: 4000 }).catch(err => console.log('  click failed', String(err).slice(0, 100)));
      await W(settle); return e;
    },
    async type(sel, text, { delay = 75, settle = 400, cue, key } = {}) { const e = typeof sel === 'string' ? await a.find(sel) : sel; if (!e) return null; await a.show(e); const b = await e.boundingBox(); if (cue) a.cue(cue, { key, y: b && b.y + b.height / 2 }); if (b) await page.evaluate(([x, y]) => window.__tap(x, y), [b.x + b.width / 2, b.y + b.height / 2]); await e.click().catch(() => {}); await e.type(text, { delay }); await W(settle); return e; },
    async signIn(badge) {
      const inp = await a.find('input'); if (inp) { await inp.fill(badge); const b = await a.find('button', /Sign In/); if (b) await b.click(); await W(2200); }
      for (let i = 0; i < 2; i++) { const e = await a.find('button', /All done for today/, 2); if (!e) break; await e.click(); await W(400); }
    },
    evalApp: (fn, arg) => page.evaluate(fn, arg),
    jpg,
  };
  try { await body(a); } catch (e) { console.log('FLOW ERROR', e.stack || e); }
  await W(500); on = false; await cdp.send('Page.stopScreencast').catch(() => {}); const T1 = now(); await ctx.close();
  // frames → 30 fps master at 1080 wide
  let list = 'ffconcat version 1.0\n';
  for (let i = 0; i < frames.length; i++) { const next = i + 1 < frames.length ? frames[i + 1][1] : T1; let d = next - frames[i][1]; if (i === 0) d += Math.max(0, frames[0][1] - T0); list += `file '${OUT}/${frames[i][0]}'\nduration ${Math.max(0.001, d).toFixed(4)}\n`; }
  list += `file '${OUT}/${frames[frames.length - 1][0]}'\n`; writeFileSync(OUT + '/list.ffconcat', list);
  execFileSync(FF, ['-loglevel', 'error', '-y', '-f', 'concat', '-safe', '0', '-i', OUT + '/list.ffconcat', '-vf', `fps=30,scale=1080:-2:flags=lanczos,crop=1080:1920:0:${CROPY},format=yuv420p`, '-c:v', 'libx264', '-crf', '12', '-preset', 'fast', `${OUT}/master.mp4`]);
  writeFileSync(`${OUT}/cues.json`, JSON.stringify({ dur: T1 - T0, cues }, null, 1));
  console.log(`recorded ${name}: ${frames.length} frames, ${(T1 - T0).toFixed(1)} s, ${cues.length} cues`);
  return OUT;
}

// ---------------- flows ----------------
const inspector = async (a, type) => {
  await a.open(STAND + '&as=inspector'); await a.signIn('448800'); await W(800);
  if (type) await a.evalApp(t => window.__sdxPickType(t), type); await W(600);
  await a.start();
  const ov = await a.find('div', /Tap here — I'm on site/, 8); if (ov) await a.tap(ov, null, { cue: "I'm on site — MAGIC CITY DOGS", settle: 1300 });
};
const FLOWS = {
  g_temps: { hook: 'POV: you check|100+ *coolers* alone', async run(a) {
    await inspector(a, 'Event Day');
    const card = await a.find('[data-testid=gameday-card]'); if (card) await a.show(card, 'start');
    const load = await a.find('[data-testid=gameday-load-units]', null, 6); if (load) await a.tap(load, null, { cue: "Load this stand's coolers", settle: 1500 });
    const rows = await a.page.$$('[data-testid=gameday-temp]');
    const inp = async (r, v, cue, key) => { const i = r && await r.$('input'); if (i) { await a.type(i, v, { delay: 260, cue, key }); await a.evalApp(() => document.activeElement && document.activeElement.blur()); await W(1600); } };
    await inp(rows[0], '50', 'Cooler reads 50°F', false);
    a.cue('TOO WARM — flagged', { key: true, y: (await rows[0]?.boundingBox())?.y }); await W(1800);
    await inp(rows[1], '38', '38°F — good ✓');
    await inp(rows[2], '-4', 'Freezer −4°F ✓'); await W(800);
  } },
  g_problem: { hook: 'Paper notes get lost.|Phones *don\'t*.', async run(a) {
    await inspector(a, 'Post Event');
    await a.tap('[data-testid=guide-chip-2]', null, { cue: 'Open Equipment', settle: 1200 });
    await a.evalApp(() => window.__sdxJumpToGuideItem({ pid: 2, key: 'equipment.fryer', ci: 0 })); await W(1500);
    const ci = await a.evalApp(() => { const r = [...document.querySelectorAll('[data-guide-key="equipment.fryer"] [data-cl-idx]')].find(e => /basket clean/i.test(e.innerText)); return r ? r.dataset.clIdx : '0'; });
    const R = `[data-guide-key="equipment.fryer"] [data-cl-idx="${ci}"]`;
    await a.tap(R + ' .clBtnFail', null, { cue: 'Fryer basket? ✗ NO', key: true, settle: 1100 });
    const d = await a.find('[data-guide-key="equipment.fryer"] [placeholder^="What exactly"]'); if (d) await a.type(d, 'Basket greasy, crumbs stuck on it', { delay: 45, cue: 'Say what is wrong' });
    const loc = await a.find(R + ' button', /Back of the house/, 4); if (loc) await a.tap(loc, null, { cue: 'Where: back of the house', settle: 700 });
    const bb = await a.find(R + ' .ciBaBefore'); if (bb) { await a.show(bb); const b = await bb.boundingBox(); a.cue('BEFORE photo 📷', { key: true, y: b.y }); await a.evalApp(([x, y]) => window.__tap(x, y), [b.x + b.width / 2, b.y + b.height / 2]); }
    const fi = await a.page.$(R + ' .ciBaRow input[type=file]'); if (fi) await fi.setInputFiles({ name: 'fryer.jpg', mimeType: 'image/jpeg', buffer: jpg('grease') });
    await W(2200);
    const c = await a.find('[data-guide-key="equipment.fryer"] [placeholder^="What was done"]'); if (c) await a.type(c, 'Told the crew to clean it', { delay: 45, cue: 'What you did about it' });
    await W(1200); a.cue('Saved on the phone ✓', { y: 200 }); await W(1800);
  } },
  crew: { hook: 'The crew fixed it.|Here\'s the *proof*.', async run(a) {
    await a.open(APP + '?invite=tokc'); await a.start();
    await a.type('[data-testid=crew-join-name]', 'ANA R.', { delay: 110, cue: 'Crew opens the link — no password' });
    await a.tap('[data-testid=crew-join-go]', null, { settle: 2200 });
    a.cue('Their jobs, one card each', { y: 200 }); await W(1600);
    await a.tap('[data-testid=crew-work]', null, { cue: "I'm working on it", settle: 1300 });
    await a.tap('[data-testid=crew-done]', null, { cue: 'Done → add the AFTER photo', key: true, settle: 1000 });
    for (const f of await a.page.$$('input[type=file]')) { try { await f.setInputFiles({ name: 'a.jpg', mimeType: 'image/jpeg', buffer: jpg('after') }); break; } catch {} } await W(1500);
    const how = await a.find('.crewHowBtn', null, 2); if (how) await a.tap(how, null, { settle: 600 });
    await a.tap('[data-testid=crew-send]', null, { cue: 'Sent — the inspector sees it FIXED', key: true, settle: 2000 });
  } },
  portal: { hook: 'Stand teams log temps|with *one scan*', async run(a) {
    await a.open(STAND); await a.start();
    a.cue('Scan the stand poster', { y: 200 }); await W(1200);
    const en = await a.find('button', /English/, 4); if (en) await a.tap(en, null, { settle: 600 });
    await a.type('input[placeholder="Full name"]', 'MARIA P.', { delay: 80, cue: 'Name + phone. No app.' });
    await a.type('input[placeholder*="787"]', '3055550101', { delay: 60 });
    await a.tap('.haccpSubmitBtn', /Continue/, { settle: 1300 }); await a.tap('.haccpSubmitBtn', /location/i, { settle: 1500 });
    await a.tap('button', /Hot Holding/, { cue: 'Hot holding', settle: 800 });
    const inp = await a.find('.haccpTempInput'); if (inp) await a.type(inp, '150', { delay: 160, cue: '150°F' });
    await a.evalApp(() => { const r = document.querySelector('.htReading'); if (!r) return; const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set; [...r.querySelectorAll('input')].forEach(i => { if (!i.value) { set.call(i, i.type === 'time' ? '12:30' : 'CHICKEN'); i.dispatchEvent(new Event('input', { bubbles: true })); } }); });
    await a.evalApp(() => document.activeElement && document.activeElement.blur()); await W(400);
    const lg = await a.find('.htSubmit, button', /Log it/, 6); if (lg) await a.tap(lg, null, { cue: 'Log it', settle: 1200 });
    const done = await a.find('.htCollapse, button', /Done/, 6); if (done) await a.tap(done, null, { settle: 1200 });
    const sent = await a.find('[data-testid=auto-sent]', null, 8); const sb = sent && await sent.boundingBox();
    a.cue('Sent to the inspector ✓', { key: true, y: sb ? sb.y : 700 }); await W(2200);
  } },
};

// ---------------- edit ----------------
async function edit(name, OUT, hook) {
  const { dur, cues } = JSON.parse(readFileSync(OUT + '/cues.json', 'utf8'));
  const { browser } = L._state(); const p = await browser.newPage({ viewport: { width: 1080, height: 1920 } });
  const fontCss = `@font-face{font-family:M;font-weight:800;src:url(file://${DIR}fonts/Montserrat-800.woff2)}*{margin:0}body{width:1080px;height:1920px;background:transparent;font-family:M,Arial;font-weight:800}`;
  const png = async (html, f) => { await p.goto(`file://${OUT}/blank.html`).catch(() => {}); await p.setContent(`<style>${fontCss}</style>${html}`); await p.evaluate(() => document.fonts.ready); await p.screenshot({ path: `${OUT}/${f}`, omitBackground: true }); };
  writeFileSync(`${OUT}/blank.html`, '<html></html>');
  const [h1, h2] = hook.split('|'); const hl = s => s.replace(/\*(.+?)\*/g, '<span style="color:#FFD43B">$1</span>');
  await png(`<div style="position:absolute;top:210px;left:50px;right:50px;text-align:center"><div style="display:inline-block;background:rgba(0,0,0,.82);color:#fff;border-radius:34px;padding:30px 42px;font-size:76px;line-height:1.12;letter-spacing:-1px">${hl(h1)}<br>${hl(h2)}</div></div>`, 'hook.png');
  // caption: shown from its cue until the next cue (max 2.6 s); top or bottom so it never sits on the tap
  const T = dur, START = 0.4; const caps = [];
  cues.forEach((c, i) => { const t0 = Math.max(START, c.t); const t1 = Math.min(i + 1 < cues.length ? cues[i + 1].t : T, t0 + 2.6); if (t1 - t0 < 0.5) return;
    const ty = c.y == null ? 400 : c.y * SCALE - CROPY; const top = ty > 1150 && t0 > 2.8; caps.push({ ...c, t0, t1, top, ty, f: `cap${i}.png` }); });
  for (const c of caps) await png(`<div style="position:absolute;${c.top ? 'top:300px' : 'top:1380px'};left:60px;right:60px;text-align:center"><span style="display:inline-block;background:${c.key ? '#FFD43B' : 'rgba(0,0,0,.85)'};color:${c.key ? '#111' : '#fff'};border-radius:26px;padding:22px 36px;font-size:62px;line-height:1.15;box-shadow:0 8px 30px rgba(0,0,0,.4)">${c.text}</span></div>`, c.f);
  await png(`<div style="position:absolute;inset:0;background:radial-gradient(circle at 50% 40%,#1D3A9E,#0A1033 70%)"></div><div style="position:absolute;top:640px;left:0;right:0;text-align:center;color:#fff;font-size:118px;line-height:1.12;letter-spacing:-2px">Walk it.<br>Fix it.<br><span style="color:#FFD43B">Prove it.</span></div><div style="position:absolute;top:1240px;left:0;right:0;text-align:center;color:#AFC2FF;font-size:46px">SDX Inspect — the inspection app</div>`, 'end.png');
  await p.close();
  // video graph
  const keyT = caps.filter(c => c.key).map(c => c.t0);
  const z = keyT.length ? keyT.map(k => `0.13*exp(-pow((t-${(k + 0.35).toFixed(2)})/0.55,2))`).join('+') : '0';
  const inputs = ['-i', `${OUT}/master.mp4`, '-loop', '1', '-t', '3', '-i', `${OUT}/hook.png`];
  caps.forEach(c => inputs.push('-loop', '1', '-t', String(T), '-i', `${OUT}/${c.f}`));
  inputs.push('-loop', '1', '-t', '2.6', '-i', `${OUT}/end.png`);
  const endIdx = 2 + caps.length;
  // zoom punch: scale up per frame (eval=frame), crop back to 1080×1920 around the centre
  let g = `[0:v]trim=duration=${T.toFixed(2)},setpts=PTS-STARTPTS,scale=w='trunc(1080*(1+(${z}))/2)*2':h='trunc(1920*(1+(${z}))/2)*2':eval=frame:flags=bicubic,crop=1080:1920,unsharp=5:5:0.5,setsar=1[b0];`;
  g += `[b0][1:v]overlay=0:'-60*max(0,1-t/0.25)':enable='lt(t,2.8)'[b1];`;
  caps.forEach((c, i) => { g += `[b${i + 1}][${i + 2}:v]overlay=0:'50*max(0,1-(t-${c.t0.toFixed(2)})/0.18)':enable='between(t,${c.t0.toFixed(2)},${c.t1.toFixed(2)})'[b${i + 2}];`; });
  g += `[b${caps.length + 1}]fps=30,format=yuv420p[main];[${endIdx}:v]fps=30,scale=1080:1920,setsar=1,format=yuv420p,fade=in:st=0:d=0.25[end];[main][end]concat=n=2:v=1[v]`;
  const TT = T + 2.6, bpm = 0.5; // 120 bpm
  const music = `aevalsrc='0.55*sin(2*PI*(42+110*exp(-28*mod(t,${bpm})))*mod(t,${bpm}))*exp(-8*mod(t,${bpm}))+0.10*sin(2*PI*55*t)*exp(-3*mod(t,${bpm * 2}))+0.05*sin(2*PI*220*t)*sin(2*PI*277*t)*(0.5+0.5*sin(2*PI*0.25*t))':s=48000:d=${TT.toFixed(2)}`;
  const hat = `anoisesrc=d=${TT.toFixed(2)}:c=white:a=0.4:r=48000`;
  const out = `${DIR}out/pov-${name}.mp4`;
  execFileSync(FF, ['-loglevel', 'error', '-y', ...inputs, '-f', 'lavfi', '-i', music, '-f', 'lavfi', '-i', hat, '-filter_complex',
    g + `;[${endIdx + 2}:a]highpass=f=7000,volume='0.35*exp(-30*mod(t+${bpm / 2},${bpm}))':eval=frame[h];[${endIdx + 1}:a][h]amix=inputs=2:normalize=0,afade=t=in:d=0.3,afade=t=out:st=${(TT - 1.2).toFixed(2)}:d=1.2,loudnorm=I=-14:TP=-1.5:LRA=9,aformat=sample_rates=48000:channel_layouts=stereo[a]`,
    '-map', '[v]', '-map', '[a]', '-c:v', 'libx264', '-preset', 'slow', '-tune', 'animation', '-crf', '17', '-maxrate', '5M', '-bufsize', '10M', '-profile:v', 'high', '-g', '60',
    '-c:a', 'aac', '-b:a', '128k', '-movflags', '+faststart', out]);
  console.log('reel', out, TT.toFixed(1) + ' s', caps.length + ' captions');
  return out;
}

await L.launch();
for (const name of process.argv.slice(2).filter(x => FLOWS[x])) {
  const OUT = await record(name, FLOWS[name].run);
  await edit(name, OUT, process.env.HOOK || FLOWS[name].hook);
}
await L.close();
