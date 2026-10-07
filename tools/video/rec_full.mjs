// node rec_full.mjs <clip...> — v532 full-guide clips for hype v3.1 (phone, 60 fps) → out/<clip>.mp4
import { readFileSync, writeFileSync } from 'fs';
import { execFileSync } from 'child_process';
import * as L from './lib.mjs';
const { W, jpg } = L;
const FF = process.env.FFMPEG || '/tmp/ff/node_modules/ffmpeg-static/ffmpeg';
const LINK = 'https://app.local/Claude/?haccp=1&site=MAGIC+CITY+DOGS&unit=114&loctype=Concession&as=inspector';
// clean screens for the film: no sticky reference bar over the guide
const init = { fn: () => { if (!location.pathname.startsWith('/Claude')) return; const add = () => { const s = document.createElement('style'); s.textContent = '.foodSafetyRefWrap{display:none!important} html{scroll-behavior:smooth}'; (document.head || document.documentElement).appendChild(s); }; if (document.documentElement) add(); else document.addEventListener('DOMContentLoaded', add); }, arg: null };
async function ready(a) {
  await a.dev('phone'); await a.open(LINK, 2600); await a.signIn('448800', { show: false }); await W(1200);
  for (let i = 0; i < 2; i++) { const e = await a.find('button', /All done for today/, 1); if (!e) break; await e.click(); await W(400); }
  const ov = await a.find('div', /Tap here — I'm on site/, 8); if (ov) { await ov.click().catch(() => {}); await W(1000); }
  const still = await a.evalApp(() => /Inspection Locked/.test(document.body.innerText)); if (still) console.log('  STILL LOCKED');
}
async function toGuide(a) { const g = await a.find('.guide'); if (g) await a.show(g, 'start'); await W(900); }
const CH = {};
CH.g_types = () => L.chapter('g_types', { init }, async a => {
  await ready(a); await toGuide(a); await W(1500);
  await a.tap('[data-testid=insp-type-event]', null, { settle: 2800, show: false });
  await a.tap('[data-testid=insp-type-post]', null, { settle: 3000, show: false });
  await a.tap('[data-testid=insp-type-regular]', null, { settle: 2600, show: false });
  await a.unpoint(); await W(800);
});
CH.g_temps = () => L.chapter('g_temps', { init }, async a => {
  await ready(a); await a.evalApp(() => window.__sdxPickType('Event Day')); await W(1200);
  const card = await a.find('[data-testid=gameday-card]'); if (card) await a.show(card, 'start'); await W(700);
  const load = await a.find('[data-testid=gameday-load-units], button', /Load this stand/, 6); if (load) await a.tap(load, null, { settle: 1400 });
  await a.scrollApp(300, 1200); await W(500);
  const cold = await a.evalApp(() => [...document.querySelectorAll('[data-testid=gameday-temp]')].map((r, i) => ({ i, t: r.innerText.slice(0, 40) })));
  console.log('  rows', JSON.stringify(cold));
  const rows = await a.F.$$('[data-testid=gameday-temp]');
  const inp = async (r, v, w) => { const i = r && await r.$('input'); if (i) { await a.type(i, v, { delay: 230, settle: 300 }); await a.evalApp(() => document.activeElement && document.activeElement.blur()); await W(w); } };
  await inp(rows[0], '50', 2200); await inp(rows[1], '38', 1500); await inp(rows[2], '-4', 1800);
  await a.unpoint(); await W(800);
});
CH.g_problem = () => L.chapter('g_problem', { init }, async a => {
  await ready(a); await a.evalApp(() => window.__sdxPickType('Post Event')); await W(1000);
  await toGuide(a);
  await a.tap('[data-testid=guide-chip-2]', null, { settle: 1200 });
  await a.evalApp(() => window.__sdxJumpToGuideItem({ pid: 2, key: 'equipment.fryer', ci: 0 })); await W(1600);
  const ci = await a.evalApp(() => { const r = [...document.querySelectorAll('[data-guide-key="equipment.fryer"] [data-cl-idx]')].find(e => /basket clean/i.test(e.innerText)); return r ? r.dataset.clIdx : '0'; });
  console.log('  basket row', ci);
  const R = `[data-guide-key="equipment.fryer"] [data-cl-idx="${ci}"]`;
  const r0 = await a.find(R); if (r0) await a.show(r0); await W(700);
  await a.tap(R + ' .clBtnFail', null, { settle: 1100 });
  const d = await a.find('[data-guide-key="equipment.fryer"] [placeholder^="What exactly"]'); if (d) await a.type(d, 'Basket greasy, crumbs stuck on it', { delay: 55 });
  const loc = await a.find(R + ' button', /Back of the house/, 4); if (loc) await a.tap(loc, null, { settle: 600 });
  const c = await a.find('[data-guide-key="equipment.fryer"] [placeholder^="What was done"]'); if (c) await a.type(c, 'Cleaned it with the crew', { delay: 50 });
  const bb = await a.find(R + ' .ciBaBefore'); if (bb) { await a.show(bb); await a.point(bb); await W(500); await a.page.evaluate(([x, y]) => window.tap(x, y), [0, 0]).catch(() => {}); }
  const fi = await a.F.$(R + ' .ciBaRow input[type=file]'); if (fi) await fi.setInputFiles({ name: 'fryer.jpg', mimeType: 'image/jpeg', buffer: jpg('grease') });
  await W(2400); await a.unpoint(); await W(800);
});
CH.dbg = () => L.chapter('dbg', { init }, async a => {
  await ready(a); await a.evalApp(() => window.__sdxPickType('Post Event')); await W(1000); await toGuide(a); await a.shot('1');
  const info = await a.evalApp(() => { const c = document.querySelector('[data-testid=guide-chip-2]'); const r = c.getBoundingClientRect(); const top = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2); return { r: [r.x, r.y, r.width, r.height], top: top && (top.className + ' | ' + (top.innerText || '').slice(0, 80)), lock: !!document.body.innerText.match(/Inspection Locked/) }; });
  console.log(JSON.stringify(info));
});
function encode60(name) {
  const D = `${L.TOUR}/out/${name}`; const tl = JSON.parse(readFileSync(D + '/timeline.json', 'utf8'));
  const fr = tl.frames; let list = 'ffconcat version 1.0\n';
  for (let i = 0; i < fr.length; i++) { const next = i + 1 < fr.length ? fr[i + 1][1] : tl.T1; let dd = next - fr[i][1]; if (i === 0) dd += Math.max(0, fr[0][1] - tl.T0); list += `file '${D}/${fr[i][0]}'\nduration ${Math.max(0.001, dd).toFixed(4)}\n`; }
  list += `file '${D}/${fr[fr.length - 1][0]}'\n`; writeFileSync(D + '/list.ffconcat', list);
  execFileSync(FF, ['-loglevel', 'error', '-y', '-f', 'concat', '-safe', '0', '-i', D + '/list.ffconcat', '-vf', 'fps=60,format=yuv420p', '-c:v', 'libx264', '-preset', 'medium', '-crf', '15', `${L.TOUR}/out/${name}.mp4`]);
  console.log('encoded', name, fr.length, 'frames', (tl.T1 - tl.T0).toFixed(1), 's');
}
await L.launch();
for (const w of process.argv.slice(2)) { await CH[w](); if (w !== 'dbg') encode60(w); }
await L.close();
