// POV Reels from Joxel's own phone clips (POV Studio → the "POV Studio" routine).
//   node povcut.mjs prep   job.json  → work/clip_N.mp4 (1080×1920 30 fps), work/joined.mp4, work/blurred.mp4 (faces + manual boxes),
//                                      work/sheets/sheet_N.jpg (every 0.5 s of the BLURRED video, for the identity check), work/faces.json
//   node povcut.mjs blur   job.json  → re-runs only the blur + sheets (after adding manual boxes to job.blur)
//   node povcut.mjs render job.json  → <out> : hook, captions, SDX end card, music bed, −14 LUFS, H.264/AAC, IG-safe text zones
//                                      + work/final_sheet.jpg
// job.json:
// { "dir": "/abs/work/dir",                       clips live here
//   "clips": [{"file": "a.mov", "in": 0, "out": null}],
//   "hook": ["POV: you inspect", "100+ stands in *Miami*"],   *word* = teal accent; shown 0.2 → hookEnd s
//   "hookEnd": 3.2,
//   "cues": [{"t": 3.6, "d": 2.6, "text": "Cooler at 50°F? *Flagged.*", "key": true}],  times on the joined timeline
//   "blur": [{"t0": 0, "t1": 2.5, "x": 0.1, "y": 0.6, "w": 0.4, "h": 0.08}],           extra boxes (signs, names, badges), 0..1
//   "faces": true,
//   "appBar": true,                               blur the app's navy header bar (employer logo, venue / stand line, tab title); default on
//   "audio": "music" | "keep",                    music = bed + 15 % ambience (default) · keep = his voice / sound + soft bed
//   "end": {"tag": "Walk it. Fix it. Prove it.", "handle": "", "cta": "DM “PILOT” — free 30-day pilot"},
//   "out": "final.mp4" }
// Rules (docs/training/daily-reels.md): nothing identifying may survive the blur pass — faces, stand names, signs, logos,
// license / phone / badge numbers. No Sodexo, Hard Rock or stand names in the text. Text stays out of IG's bottom 330 px and right 140 px.
import { readFileSync, writeFileSync, mkdirSync, existsSync, rmSync } from 'fs';
import { execFileSync, spawnSync } from 'child_process';
import { chromium } from '/home/user/Claude/node_modules/playwright-core/index.mjs';
import { C, TEAL, lockup, mark, fontCss } from './sdxmark.mjs';

const DIR = new URL('.', import.meta.url).pathname;
const FF = process.env.FFMPEG || '/tmp/ff/node_modules/ffmpeg-static/ffmpeg';
const [cmd, jobPath] = process.argv.slice(2);
if (!cmd || !jobPath) { console.log('usage: node povcut.mjs prep|blur|render job.json'); process.exit(1); }
const job = JSON.parse(readFileSync(jobPath, 'utf8'));
const W = `${job.dir}/work`; mkdirSync(W, { recursive: true });
const ff = (args, opts = {}) => { const r = spawnSync(FF, ['-y', '-hide_banner', '-loglevel', 'error', ...args], { encoding: 'utf8', maxBuffer: 1 << 26, ...opts }); if (r.status) throw new Error('ffmpeg failed: ' + (r.stderr || '').slice(-1500)); return r; };

function probe(file) {
  const r = spawnSync(FF, ['-hide_banner', '-i', file], { encoding: 'utf8' });
  const s = r.stderr || '';
  const d = /Duration: (\d+):(\d+):([\d.]+)/.exec(s);
  const v = /Stream #\d+:\d+[^\n]*Video:[^\n]*?(\d{2,5})x(\d{2,5})/.exec(s);
  const rot = /rotation of (-?[\d.]+) degrees|rotate\s*:\s*(-?\d+)/.exec(s);
  let w = v ? +v[1] : 0, h = v ? +v[2] : 0; const deg = rot ? Math.abs(+(rot[1] ?? rot[2])) % 180 : 0;
  if (deg === 90) [w, h] = [h, w];
  return { dur: d ? +d[1] * 3600 + +d[2] * 60 + +d[3] : 0, w, h, audio: /Stream #\d+:\d+[^\n]*Audio:/.test(s) };
}
const durOf = f => probe(f).dur;

function prep() {
  const parts = [];
  job.clips.forEach((c, i) => {
    const src = c.file.startsWith('/') ? c.file : `${job.dir}/${c.file}`;
    const p = probe(src); if (!p.dur || !p.w) throw new Error('cannot read ' + src);
    const a = Math.max(0, c.in || 0), b = Math.min(p.dur, c.out || p.dur);
    const vert = p.h >= p.w * 1.2;
    const vf = vert
      ? 'scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920,setsar=1,fps=30,format=yuv420p'
      : 'split[a][b];[a]scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920,gblur=sigma=38,eq=brightness=-0.10[bg];[b]scale=1080:-2[fg];[bg][fg]overlay=(W-w)/2:(H-h)/2,setsar=1,fps=30,format=yuv420p';
    const out = `${W}/clip_${i + 1}.mp4`;
    const inArgs = ['-ss', String(a), '-to', String(b), '-i', src];
    const audio = p.audio ? ['-map', '0:a:0'] : ['-f', 'lavfi', '-t', String(b - a), '-i', 'anullsrc=r=48000:cl=stereo', '-map', '1:a:0'];
    ff([...inArgs, ...(p.audio ? [] : audio.slice(0, 6)), '-filter_complex', `[0:v]${vf}[v]`, '-map', '[v]', ...(p.audio ? audio : audio.slice(6)), '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '16',
      '-c:a', 'aac', '-b:a', '192k', '-ar', '48000', '-ac', '2', '-shortest', '-movflags', '+faststart', out]);
    parts.push({ file: out, dur: durOf(out), src: c.file, vertical: vert, srcSize: [p.w, p.h], hadAudio: p.audio });
  });
  // concat FILTER (not the demuxer): a constant 30 fps timeline with exact frame counts for the blur pass
  const ins = parts.flatMap(p => ['-i', p.file]);
  const fc = parts.map((p, k) => `[${k}:v][${k}:a]`).join('') + `concat=n=${parts.length}:v=1:a=1[v0][a];[v0]fps=30,format=yuv420p[v]`;
  ff([...ins, '-filter_complex', fc, '-map', '[v]', '-map', '[a]', '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '15', '-c:a', 'aac', '-b:a', '192k', '-ar', '48000', `${W}/joined.mp4`]);
  writeFileSync(`${W}/probe.json`, JSON.stringify({ parts, total: durOf(`${W}/joined.mp4`) }, null, 1));
  console.log('joined', durOf(`${W}/joined.mp4`).toFixed(2), 's from', parts.length, 'clips');
  blur();
}

function blur() {
  writeFileSync(`${W}/boxes.json`, JSON.stringify(job.blur || []));
  rmSync(`${W}/sheets`, { recursive: true, force: true });
  const args = ['-I', `${DIR}povblur.py`, `${W}/joined.mp4`, `${W}/blurred.mp4`, '--ffmpeg', FF, '--boxes', `${W}/boxes.json`, '--sheet', `${W}/sheets`, '--report', `${W}/faces.json`, '--fps', '30'];
  if (job.faces === false) args.push('--no-faces');
  if (job.appBar !== false) args.push('--app-bar');
  const r = spawnSync('python3', args, { encoding: 'utf8', maxBuffer: 1 << 24 });
  if (r.status) throw new Error('povblur failed: ' + (r.stderr || '').slice(-1500));
  console.log('blur', (r.stdout || '').trim().slice(0, 400));
}

// ---------- overlays (transparent PNGs, Playwright) ----------
const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;');
const accent = s => esc(s).replace(/\*([^*]+)\*/g, `<b style="color:${TEAL}">$1</b>`);
const css = `${fontCss(DIR)}*{margin:0;box-sizing:border-box}html,body{width:1080px;height:1920px;background:transparent;font-family:I,Arial}`;
async function png(page, html, file, transparent = true) {
  const f = `${W}/_ov.html`; writeFileSync(f, `<!doctype html><meta charset=utf-8><style>${css}</style>${html}`);
  await page.goto('file://' + f); await page.evaluate(() => document.fonts.ready); await page.waitForTimeout(60);
  await page.screenshot({ path: file, omitBackground: transparent });
}

async function render() {
  const base = `${W}/blurred.mp4`; if (!existsSync(base)) throw new Error('run prep first');
  const D = durOf(base); const END = 2.6, XF = 0.4, TOTAL = D + END - XF;
  const hookEnd = Math.min(job.hookEnd || 3.2, D - 0.5);
  const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--no-sandbox', '--no-proxy-server', '--allow-file-access-from-files'] });
  const page = await b.newPage({ viewport: { width: 1080, height: 1920 } });
  const ov = [];   // {file, t0, t1}
  if (job.hook && job.hook.length) {
    await png(page, `<div style="position:absolute;left:60px;right:150px;top:230px;background:rgba(30,29,74,.9);border-radius:36px;padding:30px 40px 36px;box-shadow:0 18px 50px rgba(0,0,0,.35)">
      <div style="display:inline-block;background:${C.red};color:#fff;font-weight:800;font-size:28px;letter-spacing:4px;padding:8px 18px;border-radius:12px;margin-bottom:18px">POV</div>
      <div style="color:#fff;font-weight:800;font-size:74px;line-height:1.06;letter-spacing:-1px">${job.hook.map(accent).join('<br>')}</div></div>`, `${W}/ov_hook.png`);
    ov.push({ file: `${W}/ov_hook.png`, t0: 0.15, t1: hookEnd });
  }
  for (const [k, c] of (job.cues || []).entries()) {
    const t0 = Math.max(0, c.t), t1 = Math.min(D - 0.2, c.t + (c.d || 2.6)); if (t1 - t0 < 0.6) continue;
    await png(page, `<div style="position:absolute;left:60px;right:150px;bottom:${1920 - 1460}px;display:flex"><div style="background:#fff;border-radius:30px;padding:24px 34px 28px;box-shadow:0 16px 44px rgba(0,0,0,.32);max-width:870px">
      ${c.key ? `<div style="color:${C.red};font-weight:800;font-size:24px;letter-spacing:3px;margin-bottom:8px">KEY MOMENT</div>` : ''}
      <div style="color:${C.ink};font-weight:800;font-size:54px;line-height:1.1;letter-spacing:-.5px">${accent(c.text).replace(new RegExp(TEAL, 'g'), C.blue)}</div></div></div>`, `${W}/ov_cue${k}.png`);
    ov.push({ file: `${W}/ov_cue${k}.png`, t0, t1 });
  }
  await png(page, `<div style="position:absolute;left:56px;top:122px;opacity:.92">${lockup(54, 'light')}</div>`, `${W}/ov_mark.png`);
  const e = job.end || {};
  await png(page, `<div style="position:absolute;inset:0;background:radial-gradient(1200px 900px at 50% 38%,#3a3a86 0%,${C.navy} 45%,${C.navyDeep} 100%);display:flex;flex-direction:column;align-items:center;justify-content:center;gap:34px;color:#fff;text-align:center;padding:0 90px 160px">
    ${lockup(150, 'light')}
    <div style="font-weight:800;font-size:66px;line-height:1.1">${accent(e.tag || 'Walk it. Fix it. *Prove it.*')}</div>
    <div style="font-weight:500;font-size:36px;color:#C9CCEB;line-height:1.3">The inspection app for food stands &amp; kitchens</div>
    ${e.cta === '' ? '' : `<div style="background:#fff;color:${C.navy};font-weight:800;font-size:40px;padding:22px 40px;border-radius:999px">${esc(e.cta || 'DM “PILOT” — free 30-day pilot')}</div>`}
    ${e.handle ? `<div style="font-weight:600;font-size:34px;color:#C9CCEB">${esc(e.handle)}</div>` : ''}</div>`, `${W}/ov_end.png`, false);
  await b.close();

  // ---------- compose ----------
  const inputs = ['-i', base, '-loop', '1', '-t', String(D), '-framerate', '30', '-i', `${W}/ov_mark.png`];
  ov.forEach(o => inputs.push('-loop', '1', '-t', String(D), '-framerate', '30', '-i', o.file));
  inputs.push('-loop', '1', '-t', String(END), '-framerate', '30', '-i', `${W}/ov_end.png`);
  const nOv = ov.length, endIdx = 2 + nOv;
  let fc = `[0:v]fps=30,format=yuv420p[b0];[1:v]format=rgba,fade=t=in:st=0.1:d=0.4:alpha=1[mk];[b0][mk]overlay=0:0[b1]`;
  ov.forEach((o, k) => {
    const fi = Math.max(0, o.t0), fo = Math.max(fi + 0.3, o.t1 - 0.25);
    fc += `;[${2 + k}:v]format=rgba,fade=t=in:st=${fi.toFixed(2)}:d=0.25:alpha=1,fade=t=out:st=${fo.toFixed(2)}:d=0.25:alpha=1[o${k}];[b${k + 1}][o${k}]overlay=0:0:enable='between(t,${fi.toFixed(2)},${(o.t1 + 0.05).toFixed(2)})'[b${k + 2}]`;
  });
  fc += `;[b${nOv + 1}]settb=AVTB,format=yuv420p[m];[${endIdx}:v]fps=30,format=yuv420p,settb=AVTB[e];[m][e]xfade=transition=fade:duration=${XF}:offset=${(D - XF).toFixed(3)}[v]`;
  // music bed: soft pad + 100 bpm pulse, side-chained under the original sound when it is kept
  const bed = `aevalsrc='0.055*sin(2*PI*110*t)*(0.65+0.35*sin(2*PI*0.2*t))+0.045*sin(2*PI*164.81*t)+0.04*sin(2*PI*220*t)*(0.6+0.4*sin(2*PI*0.33*t))+0.03*sin(2*PI*277.18*t)+0.22*sin(2*PI*52*t)*exp(-14*mod(t,0.6))+0.012*sin(2*PI*1760*t)*exp(-40*mod(t+0.3,0.6))':s=48000:d=${TOTAL.toFixed(2)}`;
  const keep = job.audio === 'keep';
  fc += `;${bed},aformat=channel_layouts=stereo,afade=t=in:d=0.6,afade=t=out:st=${(TOTAL - 1.2).toFixed(2)}:d=1.2[bed]`;
  fc += `;[0:a]volume=${keep ? 1.0 : 0.15},afade=t=out:st=${(D - 0.6).toFixed(2)}:d=0.6,apad=whole_dur=${TOTAL.toFixed(2)},asplit=2[orig][sc]`;
  fc += keep ? `;[bed][sc]sidechaincompress=threshold=0.03:ratio=8:attack=20:release=400[bd];[bd]volume=0.45[bd2];[orig][bd2]amix=inputs=2:normalize=0[mix]`
             : `;[sc]anullsink;[orig][bed]amix=inputs=2:normalize=0[mix]`;
  fc += `;[mix]loudnorm=I=-14:TP=-1.5:LRA=11,aresample=48000[a]`;
  const out = job.out?.startsWith('/') ? job.out : `${job.dir}/${job.out || 'final.mp4'}`;
  ff([...inputs, '-filter_complex', fc, '-map', '[v]', '-map', '[a]', '-t', TOTAL.toFixed(2), '-c:v', 'libx264', '-preset', 'medium', '-crf', '18', '-profile:v', 'high',
    '-pix_fmt', 'yuv420p', '-r', '30', '-c:a', 'aac', '-b:a', '192k', '-ar', '48000', '-movflags', '+faststart', out]);
  ff(['-i', out, '-vf', `fps=${(16 / TOTAL).toFixed(4)},scale=216:-1,tile=8x2`, '-frames:v', '1', `${W}/final_sheet.jpg`]);
  console.log('render', out, TOTAL.toFixed(2), 's', (readFileSync(out).length / 1048576).toFixed(1), 'MB');
}

if (cmd === 'prep') prep(); else if (cmd === 'blur') blur(); else if (cmd === 'render') await render(); else { console.log('unknown command', cmd); process.exit(1); }
