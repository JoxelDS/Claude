// node app.mjs <clip> [INTRO="Title|sub"]  → out/app-<clip>.mp4  (for @sdxinspect)
// The app's own look (navy header, white cards, red accent, Inter) from an existing pov.mjs recording (out/pov_<clip>/master.mp4 + cues.json):
// the app inside a phone frame, one headline per step, navy intro card, light outro with 'by DS Marketing'.
import { readFileSync, writeFileSync } from 'fs';
import { execFileSync } from 'child_process';
import { C, mark, fontCss, status } from './sdxmark.mjs';
import { chromium } from '/home/user/Claude/node_modules/playwright-core/index.mjs';
const FF = process.env.FFMPEG || '/tmp/ff/node_modules/ffmpeg-static/ffmpeg';
const DIR = new URL('.', import.meta.url).pathname;
const clip = process.argv[2];
const OUT = `${DIR}out/pov_${clip}`;
const INTRO = {
  g_temps: 'Catch the bad temp|before it becomes a problem.', g_problem: 'Report a problem|in seconds, with proof',
  crew: 'From "fix it"|to fixed — with proof', portal: 'Stand teams log temps|with one scan',
}[clip] || 'SDX Inspect|the inspection app';
const intro = process.env.INTRO || INTRO;
const { dur, cues } = JSON.parse(readFileSync(`${OUT}/cues.json`, 'utf8'));
const PW = 700, PH = Math.round(PW * 1920 / 1080), PX = (1080 - PW) / 2, PY = 600, R = 64, BZ = 18; // phone screen box
const IN = 2.2, ENDL = 2.8;

const font = `${fontCss(DIR)}*{margin:0;box-sizing:border-box}body{width:1080px;height:1920px;background:transparent;font-family:I,Arial}`;
// the app's own look: light page, navy header bar, white cards, red accent (Save Report), Inter
const header = `<div style="position:absolute;left:0;right:0;top:0;height:190px;background:${C.navy};display:flex;align-items:center;justify-content:space-between;padding:40px 56px 0">
  <div style="display:flex;align-items:center;gap:20px">${mark(84, { onDark: true })}<span style="color:#fff;font-weight:800;font-size:44px;letter-spacing:-1px">SDX Inspect</span></div>
  <span style="color:#C9CCEB;font-weight:600;font-size:30px">@sdxinspect</span></div>`;
const pageBg = `background:radial-gradient(800px 600px at 85% 30%,#E6E9F8 0,transparent 70%),${C.bg}`;
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--no-sandbox'] });
const p = await b.newPage({ viewport: { width: 1080, height: 1920 } });
writeFileSync(`${OUT}/blank.html`, '<html></html>');
const png = async (html, f, transparent = true) => { await p.goto(`file://${OUT}/blank.html`); await p.setContent(`<style>${font}</style>${html}`); await p.evaluate(() => document.fonts.ready); await p.waitForTimeout(80); await p.screenshot({ path: `${OUT}/${f}`, omitBackground: transparent }); };
await png(`<div style="position:absolute;inset:0;${pageBg}"></div>${header}
<div style="position:absolute;left:${PX - BZ}px;top:${PY - BZ}px;width:${PW + 2 * BZ}px;height:${PH + 2 * BZ}px;border-radius:${R + BZ}px;box-shadow:0 50px 110px rgba(42,41,92,.30),0 14px 34px rgba(42,41,92,.18)"></div>`, 'sbg.png', false);
await png(`<div style="position:absolute;left:${PX - BZ}px;top:${PY - BZ}px;width:${PW + 2 * BZ}px;height:${PH + 2 * BZ}px;border-radius:${R + BZ}px;border:${BZ}px solid #fff;box-shadow:0 0 0 3px ${C.navy},inset 0 0 0 1px #DADDEB"></div>
<div style="position:absolute;left:${540 - 90}px;top:${PY + 14}px;width:180px;height:44px;border-radius:22px;background:${C.navyDeep}"></div>`, 'bezel.png');
await png(`<div style="position:absolute;left:0;top:0;width:${PW}px;height:${PH}px;border-radius:${R}px;background:#fff"></div>`, 'mask.png');
const heads = [];
cues.forEach((c, i) => { const t0 = IN + c.t, t1 = IN + Math.min(i + 1 < cues.length ? cues[i + 1].t : dur, c.t + 3.2); if (t1 - t0 < 0.6) return;
  const fs = c.text.length > 28 ? 58 : c.text.length > 18 ? 68 : 80;
  heads.push({ t0, t1, f: `h${i}.png`, html: `<div style="position:absolute;top:205px;left:64px;right:64px;height:360px;display:flex;flex-direction:column;align-items:flex-start;justify-content:center">
  ${c.key ? `<div style="background:${C.red};color:#fff;font-weight:800;font-size:28px;letter-spacing:2px;border-radius:12px;padding:8px 18px;margin-bottom:16px;box-shadow:0 6px 16px rgba(238,0,0,.25)">KEY MOMENT</div>` : ''}
  <div style="font-weight:800;font-size:${fs}px;line-height:1.02;letter-spacing:-2px;color:${C.navy}">${status(c.text)}</div></div>` }); });
for (const h of heads) await png(h.html, h.f);
const [i1, i2] = intro.split('|');
await png(`<div style="position:absolute;inset:0;background:linear-gradient(165deg,${C.navy},${C.navyDeep})"></div>
<div style="position:absolute;top:180px;left:0;right:0;text-align:center">${mark(150, { shadow: true, onDark: true })}</div>
<div style="position:absolute;top:650px;left:70px;right:60px">
<div style="display:inline-block;background:${C.red};color:#fff;font-weight:800;font-size:34px;border-radius:14px;padding:10px 22px;margin-bottom:28px">SDX Inspect</div>
<div style="font-weight:800;font-size:${i1.length > 20 ? 104 : 120}px;line-height:.98;letter-spacing:-4px;color:#fff">${i1}</div>
<div style="font-weight:600;font-size:52px;line-height:1.15;letter-spacing:-1px;color:#C9CCEB;margin-top:30px">${i2}</div></div>
<div style="position:absolute;bottom:70px;left:0;right:0;text-align:center;color:#9EA2D6;font-weight:600;font-size:30px">@sdxinspect</div>`, 'intro.png', false);
await png(`<div style="position:absolute;inset:0;${pageBg}"></div>
<div style="position:absolute;top:520px;left:0;right:0;text-align:center">${mark(260, { shadow: true })}</div>
<div style="position:absolute;top:830px;left:0;right:0;text-align:center;color:${C.navy};font-weight:800;font-size:110px;letter-spacing:-4px">SDX Inspect</div>
<div style="position:absolute;top:980px;left:0;right:0;text-align:center;color:${C.navy};font-weight:800;font-size:56px;letter-spacing:-1px">Walk it. Fix it. <span style="color:${C.red}">Prove it.</span></div>
<div style="position:absolute;top:1080px;left:0;right:0;text-align:center;color:${C.muted};font-weight:600;font-size:38px">The inspection app for food stands & kitchens</div>
<div style="position:absolute;top:1230px;left:0;right:0;text-align:center"><span style="display:inline-block;background:${C.navy};color:#fff;font-weight:800;font-size:40px;border-radius:999px;padding:22px 52px">@sdxinspect</span></div>
<div style="position:absolute;bottom:80px;left:0;right:0;display:flex;align-items:center;justify-content:center;gap:18px;color:${C.muted};font-weight:600;font-size:30px">by <img src="file://${DIR}ds-logo.png" style="height:80px;filter:invert(1) brightness(.35)"></div>`, 'outro.png', false);
await b.close();

const T = IN + dur + ENDL;
const ins = ['-loop', '1', '-t', T.toFixed(2), '-i', `${OUT}/sbg.png`, '-i', `${OUT}/master.mp4`, '-loop', '1', '-i', `${OUT}/mask.png`, '-loop', '1', '-t', T.toFixed(2), '-i', `${OUT}/bezel.png`,
  '-loop', '1', '-t', String(IN + 0.4), '-i', `${OUT}/intro.png`, '-loop', '1', '-t', String(ENDL + 0.4), '-i', `${OUT}/outro.png`];
heads.forEach(h => ins.push('-loop', '1', '-t', T.toFixed(2), '-i', `${OUT}/${h.f}`));
let g = `[1:v]fps=30,scale=${PW}:${PH}:flags=lanczos,setpts=PTS-STARTPTS+${IN}/TB,format=rgba[scr];[2:v]crop=${PW}:${PH}:0:0,format=gray[m];[scr][m]alphamerge[scrm];`;
// the phone slides up into place as the intro leaves
g += `[0:v]fps=30,format=rgba[bg];[bg][scrm]overlay=${PX}:'${PY}+90*max(0,1-(t-${IN})/0.5)':eof_action=pass[s1];[s1][3:v]overlay=0:'90*max(0,1-(t-${IN})/0.5)'[s2];`;
let last = 's2';
heads.forEach((h, i) => { const k = 6 + i; g += `[${k}:v]format=rgba,fade=in:st=${h.t0.toFixed(2)}:d=0.25:alpha=1,fade=out:st=${(h.t1 - 0.25).toFixed(2)}:d=0.25:alpha=1[hh${i}];[${last}][hh${i}]overlay=0:'20*max(0,1-(t-${h.t0.toFixed(2)})/0.25)'[s${i + 3}];`; last = `s${i + 3}`; });
// intro fades out over the scene, outro fades in at the end
g += `[4:v]format=rgba,fade=out:st=${(IN - 0.35).toFixed(2)}:d=0.35:alpha=1[ii];[${last}][ii]overlay=0:0:eof_action=pass[s90];`;
g += `[5:v]format=rgba,fade=in:st=0:d=0.35:alpha=1,setpts=PTS-STARTPTS+${(IN + dur).toFixed(2)}/TB[oo];[s90][oo]overlay=0:0:eof_action=pass,trim=duration=${T.toFixed(2)},format=yuv420p[v]`;
// calm SaaS bed: soft pad chord + light pulse, 100 bpm
const bp = 0.6;
const music = `aevalsrc='0.06*(sin(2*PI*220*t)+sin(2*PI*277.2*t)+sin(2*PI*329.6*t))*(0.7+0.3*sin(2*PI*0.2*t))+0.32*sin(2*PI*(48+70*exp(-30*mod(t,${bp})))*mod(t,${bp}))*exp(-9*mod(t,${bp}))*gte(t,${IN})+0.05*sin(2*PI*880*t)*exp(-20*mod(t+${bp / 2},${bp}))*gte(t,${IN})':s=48000:d=${T.toFixed(2)}`;
const out = `${DIR}out/app-${clip}.mp4`;
execFileSync(FF, ['-loglevel', 'error', '-y', ...ins, '-f', 'lavfi', '-i', music, '-filter_complex',
  g + `;[${6 + heads.length}:a]lowpass=f=9000,afade=t=in:d=0.6,afade=t=out:st=${(T - 1.4).toFixed(2)}:d=1.4,loudnorm=I=-14:TP=-1.5:LRA=9,aformat=sample_rates=48000:channel_layouts=stereo[a]`,
  '-map', '[v]', '-map', '[a]', '-c:v', 'libx264', '-preset', 'slow', '-crf', '17', '-maxrate', '5M', '-bufsize', '10M', '-profile:v', 'high', '-g', '60', '-r', '30',
  '-c:a', 'aac', '-b:a', '128k', '-movflags', '+faststart', out]);
console.log('app', out, T.toFixed(1) + ' s', heads.length + ' headlines');
