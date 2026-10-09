#!/usr/bin/env node
// DS Reel engine — data-driven, deterministic renderer for 1080×1920 30 fps Instagram Reels (see README.md).
//   node tools/ds/reels/render.mjs <spec.json> [--out file.mp4] [--sheet sheet.jpg] [--safe] [--from s --to s]
//                                  [--still t still.jpg] [--workers n] [--no-audio] [--force]
// One Chromium page holds every scene; window.at(t) paints frame t (a pure function of t). Each frame is captured
// with CDP Page.captureScreenshot (JPEG q90) and piped into ffmpeg → H.264 yuv420p CRF 18, 30 fps, AAC 192k, +faststart.
// Audio is synthesized with ffmpeg lavfi (lib/audio.mjs) from the spec's music preset + the cue list the page reports.
import { chromium } from '/home/user/Claude/node_modules/playwright-core/index.mjs';
import { spawn } from 'child_process';
import { readFileSync, writeFileSync, existsSync, mkdirSync, rmSync } from 'fs';
import { dirname, resolve, basename } from 'path';
import { buildAudio, PRESETS } from './lib/audio.mjs';
const HERE = dirname(new URL(import.meta.url).pathname);
const FF = process.env.FFMPEG || '/tmp/ff/node_modules/ffmpeg-static/ffmpeg';
const FONTS = '/home/user/Claude/tools/video/fonts/';                 // originals; lib/fonts/ holds overlap-free copies (clean outlined type)
const LOGO = '/home/user/Claude/tools/video/ds-logo.png';
const FPS = 30;
const TYPES = ['hook', 'text', 'list', 'mythfact', 'compare', 'phone', 'browser', 'profile', 'search', 'chat', 'checklist', 'stat', 'timer', 'quote', 'pov', 'end'];
const TR = { cut: 0, whip: .34, zoom: .44, wipe: .56 };
const DEF_TR = ['whip', 'cut', 'wipe', 'whip', 'zoom', 'cut'];

// ---------- args ----------
const argv = process.argv.slice(2);
const NARGS = { out: 1, sheet: 1, scenes: 1, from: 1, to: 1, still: 2, workers: 1, step: 1 };
const flags = {}, pos = [];
for (let i = 0; i < argv.length; i++) { const a = argv[i]; if (a.startsWith('--')) { const k = a.slice(2), n = NARGS[k] || 0; flags[k] = n === 0 ? true : n === 1 ? argv[i + 1] : argv.slice(i + 1, i + 1 + n); i += n; } else pos.push(a); }
const flag = k => flags[k] === true;
const opt = k => flags[k] ?? null;
const specPath = pos[0];
if (!specPath) { console.log('usage: node render.mjs <spec.json> [--out file.mp4] [--sheet sheet.jpg] [--safe] [--from s --to s] [--still t still.jpg] [--workers n] [--no-audio]'); process.exit(1); }
const spec = JSON.parse(readFileSync(specPath, 'utf8'));
const SPEC_DIR = dirname(resolve(specPath));
const still = opt('still');
const sheetOut = opt('sheet');
const scenesOut = opt('scenes');
let out = opt('out'); if (!out && !sheetOut && !still && !scenesOut) out = resolve(process.env.REELS_OUT || 'reels-out', `${spec.id || basename(specPath, '.json')}.mp4`);
const SAFE = flag('safe');
const WORKERS = Math.max(1, +(opt('workers') || process.env.REELS_WORKERS || 2));
const WORK = process.env.REELS_WORK || `/tmp/ds-reels/${spec.id || basename(specPath, '.json')}-${process.pid}`;
mkdirSync(WORK, { recursive: true });
const t00 = Date.now(); const lap = () => ((Date.now() - t00) / 1000).toFixed(1) + ' s';

// ---------- spec → timeline ----------
const errs = [];
const preset = spec.music?.preset || 'upbeat';
if (!PRESETS[preset]) errs.push(`music.preset "${preset}" unknown (${Object.keys(PRESETS).join(', ')})`);
const bpm = +(spec.music?.bpm || PRESETS[preset]?.bpm || 120), beat = 60 / bpm;
const lang = ['en', 'es', 'bi'].includes(spec.lang) ? spec.lang : 'en';
const IMGRE = /\.(jpe?g|png|webp|gif|svg)$/i;
const imgs = new Set();
const resolveImg = s => { let p = s.startsWith('/') ? s : s.startsWith('demo/') ? `${HERE}/${s}` : s.startsWith('photos/') ? `/home/user/Claude/public/p/_img/${s.slice(7)}` : resolve(SPEC_DIR, s); if (!existsSync(p)) { errs.push(`image not found: ${s}`); return s; } const u = 'file://' + p; imgs.add(u); return u; };
const walk = v => Array.isArray(v) ? v.map(walk) : v && typeof v === 'object' ? Object.fromEntries(Object.entries(v).map(([k, x]) => [k, walk(x)])) : typeof v === 'string' && IMGRE.test(v) && !/\s/.test(v) ? resolveImg(v) : v;
let tAcc = 0;
const scenes = (spec.scenes || []).map((s0, i) => {
  const s = walk(s0);
  if (!TYPES.includes(s.type)) errs.push(`scene ${i}: unknown type "${s.type}"`);
  if (s.type === 'stat' && !s.source) errs.push(`scene ${i}: stat needs "source" (where the number comes from)`);
  if (s.type === 'pov' && s.scene && !TYPES.includes(s.scene.type)) errs.push(`scene ${i}: pov.scene has unknown type "${s.scene.type}"`);
  const beats = s.beats ?? Math.max(2, Math.round((s.dur ?? 3) / beat));
  const dur = beats * beat;
  const tr = i === 0 ? 'cut' : (TR[s.tr] != null ? s.tr : DEF_TR[i % DEF_TR.length]);
  const r = { ...s, start: +tAcc.toFixed(5), dur: +dur.toFixed(5), beats, tr, tin: i === 0 ? 0 : TR[tr] };
  tAcc += dur; return r;
});
const T = +tAcc.toFixed(5), NF = Math.round(T * FPS);
if (!scenes.length) errs.push('spec has no scenes');
if (errs.length && !flag('force')) { console.error('spec errors:\n  ' + errs.join('\n  ')); process.exit(2); }
const accent = spec.accent || '#D8FF3C';
const from = Math.max(0, +(opt('from') ?? 0)), to = Math.min(T, +(opt('to') ?? T));
console.log(`spec ${spec.id || specPath}: ${scenes.length} scenes · ${T.toFixed(2)} s · ${NF} frames · ${preset} @ ${bpm} bpm · lang ${lang}`);

// ---------- page ----------
const b64 = p => readFileSync(p).toString('base64');
const fontCss = [['M', 800, HERE + '/lib/fonts/Montserrat-800-solid.woff2', 'woff2'], ...[400, 500, 600, 700, 800].map(w => ['I', w, `${HERE}/lib/fonts/Inter-${w}-solid.woff2`, 'woff2'])]
  .map(([fam, w, file, fmt]) => `@font-face{font-family:${fam};font-weight:${w};src:url(data:font/${fmt === 'woff2' ? 'woff2' : 'ttf'};base64,${b64(file.startsWith('/') ? file : FONTS + file)}) format('${fmt}')}`).join('\n');
const CFG = { beat, T, lang, accent, scenes, assets: { logo: 'file://' + LOGO }, img: {}, showSafe: SAFE };
imgs.add(CFG.assets.logo);
const html = `<!doctype html><html><head><meta charset="utf-8"><style>${fontCss}\n${readFileSync(HERE + '/lib/style.css', 'utf8')}</style></head>
<body><div id="stage"></div><script>window.__CFG=${JSON.stringify(CFG)};window.__IMGS=${JSON.stringify([...imgs])};
window.__run=function(){${readFileSync(HERE + '/lib/runtime.js', 'utf8')}};
window.__boot=(async()=>{await Promise.all(['800 100px M','400 50px I','500 50px I','600 50px I','700 50px I','800 50px I'].map(f=>document.fonts.load(f)));await document.fonts.ready;
for(const s of window.__IMGS){const im=new Image();im.src=s;try{await im.decode();window.__CFG.img[s]={w:im.naturalWidth,h:im.naturalHeight};}catch(e){window.__CFG.img[s]={w:1,h:1,err:1};}}
window.__run();await Promise.all([...document.images].map(i=>i.decode().catch(()=>0)));return window.__info();})();</script></body></html>`;
const pagePath = `${WORK}/page.html`; writeFileSync(pagePath, html);

const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--no-sandbox', '--disable-gpu', '--font-render-hinting=none', '--hide-scrollbars', '--disable-lcd-text'] });
const pageErrs = [];
async function openPage() {
  const ctx = await browser.newContext({ viewport: { width: 1080, height: 1920 }, deviceScaleFactor: 1 });
  const page = await ctx.newPage();
  page.on('pageerror', e => pageErrs.push(e.message)); page.on('console', m => { if (m.type() === 'error') pageErrs.push(m.text()); });
  await page.goto('file://' + pagePath);
  const info = await page.evaluate(() => window.__boot);
  const cdp = await ctx.newCDPSession(page);
  return { page, cdp, info };
}
const shot = async (w, t, q = 90) => { await w.cdp.send('Runtime.evaluate', { expression: `at(${t})` }); const r = await w.cdp.send('Page.captureScreenshot', { format: 'jpeg', quality: q }); return Buffer.from(r.data, 'base64'); };

const w0 = await openPage();
const info = w0.info;
const broken = Object.entries(await w0.page.evaluate(() => window.__CFG.img)).filter(([, d]) => d.err).map(([s]) => s);
if (broken.length) console.warn('images that failed to load:', broken.join(', '));
if (pageErrs.length) console.warn('page errors:\n  ' + pageErrs.join('\n  '));
const warns = info.warnings || [];
if (warns.length) console.warn(`layout warnings (${warns.length}):\n  ` + warns.map(w => `scene ${w.scene} (${scenes[w.scene]?.type}) ${w.type}: ${w.msg}`).join('\n  '));
else console.log('layout: all readable text ≥ 44 px, key elements inside the safe zone');
console.log(`page ready in ${lap()}`);

// ---------- sheets of big tiles (one per scene, settled = 0.12 s before its cut) ----------
async function bigSheet(file, items, cols = 4, tw = 400) {
  const th = Math.round(tw * 1920 / 1080), rows = Math.ceil(items.length / cols);
  const shtml = `<!doctype html><style>body{margin:0;background:#222;font:600 18px Arial;color:#fff;width:${cols * tw}px}.g{display:grid;grid-template-columns:repeat(${cols},${tw}px)}.c{position:relative;width:${tw}px;height:${th}px;border:1px solid #444}.c img{width:100%;height:100%;display:block}.c b{position:absolute;left:5px;top:5px;background:rgba(0,0,0,.78);padding:3px 7px;border-radius:5px}</style><div class="g">${items.map(([lab, buf]) => `<div class="c"><img src="data:image/jpeg;base64,${buf.toString('base64')}"><b>${lab}</b></div>`).join('')}</div>`;
  const sp = await browser.newPage({ viewport: { width: cols * tw, height: rows * th } });
  await sp.setContent(shtml); await sp.waitForTimeout(100); await sp.screenshot({ path: file, type: 'jpeg', quality: 86, fullPage: true }); await sp.close();
}
if (scenesOut) {
  const items = []; for (const [i, s] of scenes.entries()) { const t = +(s.start + s.dur - .12).toFixed(3); items.push([`${i} ${s.type} · t=${t}`, await shot(w0, t)]); }
  await bigSheet(scenesOut, items); console.log('scenes sheet', scenesOut, items.length, 'scenes');
}
// ---------- still ----------
if (still) { const [ts, file] = still; const buf = await shot(w0, +ts, 92); writeFileSync(file, buf); console.log('still', file, `t=${ts}`); }
if (!out && !sheetOut) { await browser.close(); if (!process.env.REELS_KEEP) rmSync(WORK, { recursive: true, force: true }); process.exit(0); }

// ---------- cues + audio ----------
const cues = [...info.cues];
scenes.forEach((s, i) => { if (!i) return; const m = s.start + s.tin / 2; if (s.tr === 'whip') cues.push({ t: m, s: 'whip', g: .9 }); if (s.tr === 'zoom') cues.push({ t: m, s: 'whoosh', g: .8 }); if (s.tr === 'wipe') cues.push({ t: s.start + .06, s: 'rip', g: .9 }, { t: m, s: 'whoosh', g: .45 }); });
const sec = { intro: null, breaks: scenes.filter(s => s.music === 'break').map(s => [s.start, s.start + s.dur]), outro: null };
if (scenes[0]?.type === 'hook' && spec.music?.intro !== false && scenes.length > 1) { sec.intro = [0, scenes[0].dur]; cues.push({ t: scenes[0].dur, s: 'riser', g: .7 }, { t: scenes[0].dur, s: 'boom', g: .8 }); }
const last = scenes[scenes.length - 1]; if (last?.type === 'end' && scenes.length > 1) sec.outro = [last.start + beat * .02, T + 1];
cues.sort((a, b) => a.t - b.t);

let audio = null;
const wantAudio = out && !flag('no-audio');
const ta = Date.now();
const audioP = wantAudio ? buildAudio({ T, bpm, preset, cues, sec, dir: WORK }).then(a => { audio = a; audio.ms = Date.now() - ta; console.log(`audio ${preset} @ ${bpm} bpm · ${cues.length} sfx cues (${a.sfxTypes.join(', ')}) · ${a.lufs} LUFS · TP ${a.tp} dBTP · ${(audio.ms / 1000).toFixed(1)} s (in parallel with the frames)`); }) : Promise.resolve();

// ---------- frames ----------
const sheetFrames = new Map();                                     // second → jpeg
const F0 = Math.round(from * FPS), F1 = Math.min(NF, Math.round(to * FPS));
const STEP = Math.max(1, Math.round(+(opt('step') || 1) * FPS));      // sheet: one frame every --step seconds (default 1)
const wantSheet = f => sheetOut && (f - F0) % STEP === 0;
if (out) {
  mkdirSync(dirname(resolve(out)), { recursive: true });
  const vtmp = wantAudio ? `${WORK}/video.mp4` : resolve(out);
  const ffArgs = ['-y', '-loglevel', 'error', '-f', 'image2pipe', '-framerate', String(FPS), '-c:v', 'mjpeg', '-i', 'pipe:0'];
  ffArgs.push('-vf', 'scale=in_range=full:out_range=tv:in_color_matrix=bt601:out_color_matrix=bt709,format=yuv420p',
    '-c:v', 'libx264', '-preset', process.env.REELS_PRESET || 'fast', '-crf', '18', '-maxrate', '16M', '-bufsize', '32M', '-profile:v', 'high', '-g', '60', '-r', String(FPS),
    '-colorspace', 'bt709', '-color_primaries', 'bt709', '-color_trc', 'bt709', '-color_range', 'tv');
  ffArgs.push('-movflags', '+faststart', vtmp);
  const ff = spawn(FF, ffArgs, { stdio: ['pipe', 'inherit', 'inherit'] });
  const ffDone = new Promise((res, rej) => ff.on('close', c => c === 0 ? res() : rej(new Error('ffmpeg exit ' + c))));
  const workers = [w0]; for (let k = 1; k < WORKERS; k++) workers.push(await openPage());
  const ready = new Map(); let next = F0; let wake = null;
  const tc = Date.now();
  const write = async () => { while (ready.has(next)) { const buf = ready.get(next); ready.delete(next); if (!ff.stdin.write(buf)) await new Promise(r => ff.stdin.once('drain', r)); next++; if ((next - F0) % 150 === 0) process.stdout.write(`  frame ${next - F0}/${F1 - F0} · ${((Date.now() - tc) / 1000).toFixed(1)} s\n`); } };
  let writing = Promise.resolve();
  await Promise.all(workers.map(async (w, k) => {
    for (let f = F0 + k; f < F1; f += workers.length) {
      while (f - next > 90) await new Promise(r => setTimeout(r, 5));          // keep the reorder buffer small
      const buf = await shot(w, f / FPS);
      if (wantSheet(f)) sheetFrames.set(f / FPS, buf);
      ready.set(f, buf); writing = writing.then(write);
    }
  }));
  await writing; ff.stdin.end(); await ffDone;
  const capS = (Date.now() - tc) / 1000;
  await audioP;
  if (wantAudio) await new Promise((res, rej) => { const m = spawn(FF, ['-y', '-loglevel', 'error', '-i', vtmp, '-ss', from.toFixed(3), '-t', ((F1 - F0) / FPS).toFixed(3), '-i', audio.wav, '-map', '0:v', '-map', '1:a', '-c:v', 'copy', '-c:a', 'aac', '-b:a', '192k', '-ar', '48000', '-movflags', '+faststart', resolve(out)], { stdio: 'inherit' }); m.on('close', c => c === 0 ? res() : rej(new Error('mux failed'))); });
  console.log(`video ${out} · ${F1 - F0} frames in ${capS.toFixed(1)} s (${((F1 - F0) / capS).toFixed(1)} fps, ${workers.length} workers) · total ${lap()}`);
  // cover frame (no QA overlay) + timeline json
  if (spec.cover != null) { await w0.page.evaluate(() => window.__safe(false)); const cb = await shot(w0, +spec.cover, 92); writeFileSync(out.replace(/\.mp4$/i, '') + '.cover.jpg', cb); if (SAFE) await w0.page.evaluate(() => window.__safe(true)); }
  writeFileSync(out.replace(/\.mp4$/i, '') + '.timeline.json', JSON.stringify({ id: spec.id, T, bpm, preset, lang, scenes: scenes.map(s => ({ type: s.type, start: s.start, dur: s.dur, beats: s.beats, tr: s.tr })), sections: sec, cues, warnings: warns, audio: audio && { lufs: audio.lufs, tp: audio.tp }, render: { seconds: +((Date.now() - t00) / 1000).toFixed(1), frames: F1 - F0 } }, null, 1));
} else if (sheetOut) {
  for (let f = F0; f < F1; f += STEP) sheetFrames.set(+(f / FPS).toFixed(3), await shot(w0, f / FPS));
}

// ---------- contact sheet: one frame per second, labelled with t ----------
if (sheetOut) {
  const keys = [...sheetFrames.keys()].sort((a, b) => a - b); const COLS = 8, TW = 200, TH = Math.round(TW * 1920 / 1080);
  const sceneAt = t => { let k = 0; scenes.forEach((s, i) => { if (t >= s.start - 1e-6) k = i; }); return k; };
  const rows = Math.ceil(keys.length / COLS);
  const shtml = `<!doctype html><style>body{margin:0;background:#222;font:600 16px Arial;color:#fff;width:${COLS * TW}px}.g{display:grid;grid-template-columns:repeat(${COLS},${TW}px)}.c{position:relative;width:${TW}px;height:${TH}px;border:1px solid #444}.c img{width:100%;height:100%;display:block}.c b{position:absolute;left:4px;top:4px;background:rgba(0,0,0,.75);padding:2px 6px;border-radius:4px}</style><div class="g">${keys.map(t => `<div class="c"><img src="data:image/jpeg;base64,${sheetFrames.get(t).toString('base64')}"><b>t=${+t.toFixed(2)}s · ${sceneAt(t)} ${scenes[sceneAt(t)].type}</b></div>`).join('')}</div>`;
  const sp = await browser.newPage({ viewport: { width: COLS * TW, height: rows * TH } });
  await sp.setContent(shtml); await sp.waitForTimeout(100);
  await sp.screenshot({ path: sheetOut, type: 'jpeg', quality: 85, fullPage: true });
  console.log('sheet', sheetOut, `${keys.length} frames`);
}
await browser.close();
if (!process.env.REELS_KEEP) rmSync(WORK, { recursive: true, force: true });
