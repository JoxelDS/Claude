// Renders the demo venue's sample photos (labelled tiles, clearly "sample") → public/demo/*.jpg
// Run: node tools/demo/photos.mjs   (needs the app's Playwright + Chromium)
import { chromium } from 'playwright';
import { mkdirSync } from 'fs';
const OUT = new URL('../../public/demo/', import.meta.url).pathname;
mkdirSync(OUT, { recursive: true });
export const PHOTOS = {
  faucet: ['🚰', 'Leaking faucet', '#41566b'], grease: ['🍳', 'Grease under the fryer', '#6b4a2a'],
  light: ['💡', 'Light out over prep', '#3a3a5c'], pest: ['🪳', 'Droppings behind ice machine', '#5c3434'],
  sanitizer: ['🧴', 'Sanitizer dispenser empty', '#2a6656'], drain: ['🕳️', 'Slow floor drain', '#355a6b'],
  cooler: ['🌡️', 'Cooler reading 46°F', '#2c4a7a'], floor: ['🧹', 'Dirty floor under prep table', '#6b5934'],
  tile: ['🧱', 'Missing ceiling tile', '#5a4a6b'], fixed: ['✅', 'Fixed — after photo', '#2f7d4f'],
};
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--no-sandbox'] });
const p = await b.newPage({ viewport: { width: 800, height: 600 } });
for (const [k, [emo, label, c]] of Object.entries(PHOTOS)) {
  await p.setContent(`<body style="margin:0;width:800px;height:600px;display:grid;place-items:center;font-family:system-ui,sans-serif;color:#fff;background:radial-gradient(circle at 30% 25%,${c}ee,${c} 45%,#111a 140%),${c}">
  <div style="text-align:center"><div style="font-size:150px;line-height:1">${emo}</div>
  <div style="font-size:44px;font-weight:800;margin-top:24px">${label}</div>
  <div style="font-size:24px;opacity:.75;margin-top:14px;letter-spacing:.08em;text-transform:uppercase">Sample photo · demo venue</div></div></body>`);
  await p.screenshot({ path: OUT + k + '.jpg', type: 'jpeg', quality: 72 });
}
await b.close();
console.log('photos', Object.keys(PHOTOS).length, '→', OUT);
