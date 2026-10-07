// node kit.mjs → docs/social/sdxinspect/ profile picture + 5 story-highlight covers (the app's own look)
import { mkdirSync, writeFileSync } from 'fs';
import { chromium } from '/home/user/Claude/node_modules/playwright-core/index.mjs';
import { C, fontCss } from './sdxmark.mjs';
const DIR = new URL('.', import.meta.url).pathname;
const OUT = new URL('../../docs/social/sdxinspect/', import.meta.url).pathname;
mkdirSync(OUT, { recursive: true });
const css = `${fontCss(DIR)}*{margin:0;box-sizing:border-box}body{background:transparent;font-family:I,Arial}`;
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--no-sandbox'] });
const shot = async (w, h, html, f) => { const p = await b.newPage({ viewport: { width: w, height: h } }); writeFileSync(OUT + '.blank.html', '<html></html>'); await p.goto('file://' + OUT + '.blank.html'); await p.setContent(`<style>${css}</style>${html}`); await p.evaluate(() => document.fonts.ready); await p.waitForTimeout(100); await p.screenshot({ path: OUT + f }); await p.close(); };
// profile picture: Instagram crops it to a circle, so the mark sits centred well inside it
await shot(1080, 1080, `<div style="width:1080px;height:1080px;background:radial-gradient(700px 700px at 35% 25%,#3A3984,${C.navy} 60%,${C.navyDeep});display:flex;align-items:center;justify-content:center">
<svg width="760" height="760" viewBox="0 0 100 100"><text x="50" y="54" text-anchor="middle" font-family="I" font-weight="800" font-size="36" letter-spacing="-1.2" fill="#fff">SDX</text>
<path d="M36 68 L46 78 L65 59" stroke="${C.red}" stroke-width="8.5" fill="none" stroke-linecap="round" stroke-linejoin="round"/></svg></div>`, 'profile.png');
// highlight covers: Instagram shows the centre circle, so one big white line icon in the middle
const ic = {
  temps: '<path d="M44 20a6 6 0 0 1 12 0v36a12 12 0 1 1-12 0z"/><circle cx="50" cy="66" r="5" fill="#EE0000" stroke="none"/><path d="M50 40v22" stroke="#EE0000"/>',
  problems: '<path d="M50 18 84 78H16z"/><path d="M50 40v18"/><circle cx="50" cy="67" r="2.5" fill="#fff"/>',
  crews: '<path d="M62 22a14 14 0 0 0-17 17L22 62a6 6 0 0 0 9 9l23-23a14 14 0 0 0 17-17l-9 9-8-2-2-8z"/>',
  stands: '<path d="M18 40h64l-6-16H24z"/><path d="M24 40v36h52V40"/><path d="M42 76V56h16v20"/>',
  howto: '<circle cx="50" cy="50" r="32"/><path d="M43 36v28l22-14z" fill="#fff"/>',
};
const label = { temps: 'Temps', problems: 'Problems', crews: 'Crews', stands: 'Stands', howto: 'How to' };
for (const [k, path] of Object.entries(ic)) {
  await shot(1080, 1920, `<div style="width:1080px;height:1920px;background:${C.navy};display:flex;flex-direction:column;align-items:center;justify-content:center;gap:40px">
  <div style="width:560px;height:560px;border-radius:50%;background:${C.navyDeep};display:flex;align-items:center;justify-content:center;box-shadow:inset 0 0 0 6px rgba(255,255,255,.12)">
  <svg width="340" height="340" viewBox="0 0 100 100" fill="none" stroke="#fff" stroke-width="5" stroke-linecap="round" stroke-linejoin="round">${path}</svg></div>
  <div style="color:#fff;font-weight:800;font-size:72px;letter-spacing:-2px">${label[k]}</div></div>`, `highlight-${k}.png`);
}
await b.close();
console.log('kit →', OUT);
