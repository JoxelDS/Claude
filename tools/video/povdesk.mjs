// node povdesk.mjs desk_fu tab_temps  → out/pov_<clip>/master.mp4 + cues.json
// Like pov.mjs, but landscape screens for povroom.mjs: a computer monitor (Follow-ups) and a tablet
// (the "who logged today" temps tracker). Real app (dist), demo venue, made-up people, local mode.
import { writeFileSync, mkdirSync, rmSync } from 'fs';
import { execFileSync } from 'child_process';
import * as L from './lib.mjs';
import * as S from './seed.mjs';
import { chromium } from '/home/user/Claude/node_modules/playwright-core/index.mjs';
const { W, route, initAll, seedFn } = L;
const FF = process.env.FFMPEG || '/tmp/ff/node_modules/ffmpeg-static/ffmpeg';
const DIR = new URL('.', import.meta.url).pathname;
const APP = 'https://app.local/Claude/?v=demo';
const now = () => Date.now() / 1000;

const SIZES = { desk_fu: { w: 1440, h: 796, out: 1440 }, tab_temps: { w: 1180, h: 780, out: 1180 } };

async function record(name, body) {
  const { w, h, out } = SIZES[name];
  const OUT = `${DIR}out/pov_${name}`; rmSync(OUT, { recursive: true, force: true }); mkdirSync(OUT + '/f', { recursive: true });
  const { PICS } = L._state();
  const hb = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--no-sandbox', '--no-proxy-server', '--force-color-profile=srgb', '--force-device-scale-factor=2', `--window-size=${w},${h}`] });
  const ctx = await hb.newContext({ viewport: null, locale: 'en-US', timezoneId: 'America/New_York', serviceWorkers: 'block' });
  await ctx.route('**/*', route); await ctx.addInitScript(initAll);
  await ctx.addInitScript(seedFn, [S.buildHistory(PICS), S.venueSettings(), S.users, S.regdoc, S.haccpSubs(), { sdx_eod_dismissed: S.dayStr(0) }, S.VENUE, S.kitchenReg]);
  const page = await ctx.newPage(); page.on('dialog', d => d.accept().catch(() => {}));
  const emu = await ctx.newCDPSession(page);
  await emu.send('Emulation.setDeviceMetricsOverride', { width: w, height: h, deviceScaleFactor: 0, mobile: false });
  page.on('pageerror', e => { if (!/ServiceWorker/i.test(e.message)) console.log('PAGEERR', e.message.slice(0, 160)); });
  const cdp = await ctx.newCDPSession(page); const frames = []; let fi = 0, on = false;
  cdp.on('Page.screencastFrame', ev => { cdp.send('Page.screencastFrameAck', { sessionId: ev.sessionId }).catch(() => {}); if (!on) return; const f = `f/${String(++fi).padStart(6, '0')}.jpg`; writeFileSync(`${OUT}/${f}`, Buffer.from(ev.data, 'base64')); frames.push([f, ev.metadata.timestamp]); });
  const cues = []; let T0 = 0;
  const a = {
    page,
    start: async () => { await cdp.send('Page.startScreencast', { format: 'jpeg', quality: 92, maxWidth: w * 2, maxHeight: h * 2, everyNthFrame: 1 }); on = true; T0 = now(); await W(300); },
    cue(text) { cues.push({ t: now() - T0, text }); },
    async find(sel, re, tries = 16) { for (let i = 0; i < tries; i++) { for (const e of await page.$$(sel)) { const t = (await e.textContent().catch(() => '')) || ''; if ((!re || re.test(t)) && await e.isVisible().catch(() => false)) return e; } await W(250); } console.log('  MISSING', sel, re || ''); return null; },
    // a slow, even scroll (the camera in povroom.mjs is still, so the screen content carries the motion)
    async glide(dy, ms) { await page.evaluate(([dy, ms]) => new Promise(res => { const y0 = scrollY, t0 = performance.now(); const e = k => k < .5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2;
      const f = () => { const k = Math.min(1, (performance.now() - t0) / ms); window.scrollTo(0, y0 + dy * e(k)); if (k < 1) requestAnimationFrame(f); else res(); }; requestAnimationFrame(f); }), [dy, ms]); },
  };
  await page.goto(APP); await W(2500);
  const inp = await a.find('input'); if (inp) { await inp.fill('448810'); const b = await a.find('button', /Sign In/); if (b) await b.click(); await W(2200); }
  for (let i = 0; i < 2; i++) { const e = await a.find('button', /All done for today/, 2); if (!e) break; await e.click(); await W(400); }
  try { await body(a); } catch (e) { console.log('FLOW ERROR', e.stack || e); }
  await W(400); on = false; await cdp.send('Page.stopScreencast').catch(() => {}); const T1 = now(); await ctx.close(); await hb.close();
  let list = 'ffconcat version 1.0\n';
  for (let i = 0; i < frames.length; i++) { const next = i + 1 < frames.length ? frames[i + 1][1] : T1; let d = next - frames[i][1]; if (i === 0) d += Math.max(0, frames[0][1] - T0); list += `file '${OUT}/${frames[i][0]}'\nduration ${Math.max(0.001, d).toFixed(4)}\n`; }
  list += `file '${OUT}/${frames[frames.length - 1][0]}'\n`; writeFileSync(OUT + '/list.ffconcat', list);
  execFileSync(FF, ['-loglevel', 'error', '-y', '-f', 'concat', '-safe', '0', '-i', OUT + '/list.ffconcat', '-vf', `fps=30,scale=${out}:-2:flags=lanczos,format=yuv420p`, '-c:v', 'libx264', '-crf', '14', '-preset', 'fast', `${OUT}/master.mp4`]);
  writeFileSync(`${OUT}/cues.json`, JSON.stringify({ dur: T1 - T0, cues }, null, 1));
  console.log(`recorded ${name}: ${frames.length} frames, ${(T1 - T0).toFixed(1)} s, ${cues.length} cues`);
}

const FLOWS = {
  // Follow-ups on a computer: every open problem by stand, with its BEFORE photo; then by floor
  async desk_fu(a) {
    await a.page.evaluate(() => window.__sdxOpenFollowups && window.__sdxOpenFollowups()); await W(3200);
    await a.page.evaluate(() => { const h = [...document.querySelectorAll('h3, .cardTitle, div')].find(e => /Follow-ups & Rechecks/.test(e.textContent || '') && e.children.length < 4); if (h) window.scrollTo(0, h.getBoundingClientRect().top + scrollY - 70); }); await W(900);
    await a.start(); a.cue('Follow-ups'); await W(1200);
    await a.glide(1500, 9000); await W(1500);
  },
  // the stand temp logs on a tablet: who logged today, who missed it
  async tab_temps(a) {
    await a.page.evaluate(() => window.dispatchEvent(new CustomEvent('sdx-nav', { detail: { page: 'history', entry: { tab: 'analytics', sub: 'temp', n: Date.now() } } }))); await W(3500);
    const t = await a.find('.haccpStandRow, [data-testid=hc-view]', null, 10); if (t) await t.evaluate(e => e.scrollIntoView({ block: 'start' })); await a.page.evaluate(() => window.scrollBy(0, -90)); await W(800);
    await a.start(); a.cue('Temps today'); await W(1800);
    await a.glide(420, 6000); await W(1000);
    await a.glide(-420, 1500); await W(400);
    const fl = await a.find('[data-testid=hc-view-flags]', null, 4); if (fl) { a.cue('Not scanning'); await fl.click(); await W(2500); }
  },
};

await L.launch();
for (const name of process.argv.slice(2).filter(x => FLOWS[x])) await record(name, FLOWS[name]);
await L.close();
