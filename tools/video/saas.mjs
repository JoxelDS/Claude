// node saas.mjs <clip> ["Intro title|sub"]  → out/saas-<clip>.mp4
// SaaS product-video look from an existing pov.mjs recording (out/pov_<clip>/master.mp4 + cues.json):
// light gradient canvas, the app inside a phone frame, one clean headline per step, intro + outro cards.
import { readFileSync, writeFileSync } from 'fs';
import { execFileSync } from 'child_process';
import { chromium } from '/home/user/Claude/node_modules/playwright-core/index.mjs';
const FF = process.env.FFMPEG || '/tmp/ff/node_modules/ffmpeg-static/ffmpeg';
const DIR = new URL('.', import.meta.url).pathname;
const clip = process.argv[2];
const OUT = `${DIR}out/pov_${clip}`;
const INTRO = {
  g_temps: 'Catch the bad temp|before it becomes a problem', g_problem: 'Report a problem|in seconds, with proof',
  crew: 'From "fix it"|to fixed — with proof', portal: 'Stand teams log temps|with one scan',
}[clip] || 'SDX Inspect|the inspection app';
const intro = process.env.INTRO || INTRO;
const { dur, cues } = JSON.parse(readFileSync(`${OUT}/cues.json`, 'utf8'));
const PW = 700, PH = Math.round(PW * 1920 / 1080), PX = (1080 - PW) / 2, PY = 600, R = 64, BZ = 18; // phone screen box
const IN = 2.2, ENDL = 2.8;

const font = `@font-face{font-family:M;font-weight:800;src:url(file://${DIR}fonts/Montserrat-800.woff2)}@font-face{font-family:N;font-weight:700;src:url(file://${DIR}fonts/nunito700.woff2)}
*{margin:0;box-sizing:border-box}body{width:1080px;height:1920px;background:transparent;font-family:M,Arial}`;
const bgCss = `background:radial-gradient(900px 700px at 15% 10%,#DCE6FF 0,transparent 60%),radial-gradient(800px 800px at 95% 55%,#E9DEFF 0,transparent 60%),radial-gradient(700px 600px at 30% 100%,#D9F3EE 0,transparent 60%),#F6F8FE`;
const pill = `<div style="display:inline-flex;align-items:center;gap:14px;background:#fff;border:1px solid #E3E8F5;border-radius:999px;padding:12px 26px 12px 14px;font-family:N;font-size:32px;color:#24315E;box-shadow:0 6px 20px rgba(30,50,120,.08)"><span style="display:inline-flex;align-items:center;justify-content:center;width:44px;height:44px;border-radius:12px;background:linear-gradient(135deg,#3B5BFF,#6D4AFF);color:#fff;font-size:22px">✓</span>SDX Inspect</div>`;
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--no-sandbox'] });
const p = await b.newPage({ viewport: { width: 1080, height: 1920 } });
writeFileSync(`${OUT}/blank.html`, '<html></html>');
const png = async (html, f, transparent = true) => { await p.goto(`file://${OUT}/blank.html`); await p.setContent(`<style>${font}</style>${html}`); await p.evaluate(() => document.fonts.ready); await p.waitForTimeout(80); await p.screenshot({ path: `${OUT}/${f}`, omitBackground: transparent }); };
// background with the brand pill + soft phone shadow
await png(`<div style="position:absolute;inset:0;${bgCss}"></div><div style="position:absolute;top:110px;left:0;right:0;text-align:center">${pill}</div>
<div style="position:absolute;left:${PX - BZ}px;top:${PY - BZ}px;width:${PW + 2 * BZ}px;height:${PH + 2 * BZ}px;border-radius:${R + BZ}px;box-shadow:0 60px 120px rgba(30,40,110,.28),0 18px 40px rgba(30,40,110,.18)"></div>`, 'sbg.png', false);
// bezel ring (transparent screen) + dynamic island
await png(`<div style="position:absolute;left:${PX - BZ}px;top:${PY - BZ}px;width:${PW + 2 * BZ}px;height:${PH + 2 * BZ}px;border-radius:${R + BZ}px;border:${BZ}px solid #0E1220;box-shadow:inset 0 0 0 2px #2A3045, 0 0 0 3px #C9D0E2"></div>
<div style="position:absolute;left:${540 - 90}px;top:${PY + 14}px;width:180px;height:44px;border-radius:22px;background:#0E1220"></div>`, 'bezel.png');
// rounded-corner mask for the screen
await png(`<div style="position:absolute;left:0;top:0;width:${PW}px;height:${PH}px;border-radius:${R}px;background:#fff"></div>`, 'mask.png');
// headlines (one per step); key steps get a violet accent dot
const heads = [];
cues.forEach((c, i) => { const t0 = IN + c.t, t1 = IN + Math.min(i + 1 < cues.length ? cues[i + 1].t : dur, c.t + 3.2); if (t1 - t0 < 0.6) return; heads.push({ t0, t1, f: `h${i}.png` });
  heads[heads.length - 1].html = `<div style="position:absolute;top:240px;left:70px;right:70px;height:300px;display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center">
  ${c.key ? '<div style="font-family:N;font-size:30px;letter-spacing:4px;color:#6D4AFF;margin-bottom:18px">● KEY MOMENT</div>' : ''}
  <div style="font-size:${c.text.length > 26 ? 64 : 76}px;line-height:1.08;letter-spacing:-2px;color:#101735">${c.text}</div></div>`; });
for (const h of heads) await png(h.html, h.f);
const [i1, i2] = intro.split('|');
await png(`<div style="position:absolute;inset:0;${bgCss}"></div><div style="position:absolute;top:600px;left:0;right:0;text-align:center">${pill}</div>
<div style="position:absolute;top:760px;left:80px;right:80px;text-align:center;font-size:96px;line-height:1.05;letter-spacing:-3px;color:#101735">${i1}</div>
<div style="position:absolute;top:1010px;left:80px;right:80px;text-align:center;font-family:N;font-size:46px;color:#56608A">${i2}</div>`, 'intro.png', false);
await png(`<div style="position:absolute;inset:0;background:linear-gradient(160deg,#141B4D,#3B2C8F 60%,#5B3FD6)"></div>
<div style="position:absolute;top:620px;left:0;right:0;text-align:center"><span style="display:inline-flex;align-items:center;justify-content:center;width:150px;height:150px;border-radius:38px;background:linear-gradient(135deg,#3B5BFF,#6D4AFF);color:#fff;font-size:75px">✓</span></div>
<div style="position:absolute;top:820px;left:0;right:0;text-align:center;color:#fff;font-size:100px;letter-spacing:-3px">SDX Inspect</div>
<div style="position:absolute;top:960px;left:0;right:0;text-align:center;color:#C9C2FF;font-family:N;font-size:46px">Walk it. Fix it. Prove it.</div>
<div style="position:absolute;top:1120px;left:0;right:0;text-align:center"><span style="display:inline-block;background:#fff;color:#2A1F7A;border-radius:999px;padding:24px 54px;font-size:40px">Link in bio →</span></div>`, 'outro.png', false);
await b.close();

const T = IN + dur + ENDL;
const ins = ['-loop', '1', '-t', T.toFixed(2), '-i', `${OUT}/sbg.png`, '-i', `${OUT}/master.mp4`, '-loop', '1', '-i', `${OUT}/mask.png`, '-loop', '1', '-t', T.toFixed(2), '-i', `${OUT}/bezel.png`,
  '-loop', '1', '-t', String(IN + 0.4), '-i', `${OUT}/intro.png`, '-loop', '1', '-t', String(ENDL + 0.4), '-i', `${OUT}/outro.png`];
heads.forEach(h => ins.push('-loop', '1', '-t', T.toFixed(2), '-i', `${OUT}/${h.f}`));
let g = `[1:v]fps=30,scale=${PW}:${PH}:flags=lanczos,setpts=PTS-STARTPTS+${IN}/TB,format=rgba[scr];[2:v]scale=${PW}:${PH},format=gray[m];[scr][m]alphamerge[scrm];`;
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
const out = `${DIR}out/saas-${clip}.mp4`;
execFileSync(FF, ['-loglevel', 'error', '-y', ...ins, '-f', 'lavfi', '-i', music, '-filter_complex',
  g + `;[${6 + heads.length}:a]lowpass=f=9000,afade=t=in:d=0.6,afade=t=out:st=${(T - 1.4).toFixed(2)}:d=1.4,loudnorm=I=-14:TP=-1.5:LRA=9,aformat=sample_rates=48000:channel_layouts=stereo[a]`,
  '-map', '[v]', '-map', '[a]', '-c:v', 'libx264', '-preset', 'slow', '-crf', '17', '-maxrate', '5M', '-bufsize', '10M', '-profile:v', 'high', '-g', '60', '-r', '30',
  '-c:a', 'aac', '-b:a', '128k', '-movflags', '+faststart', out]);
console.log('saas', out, T.toFixed(1) + ' s', heads.length + ' headlines');
