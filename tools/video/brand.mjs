// node brand.mjs <clip> ["Intro title|sub"]  → out/brand-<clip>.mp4
// DS Marketing brand look (black, DS logo, @dsmarketing_1) from an existing pov.mjs recording (out/pov_<clip>/master.mp4 + cues.json):
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
const LOGO = `file://${DIR}ds-logo.png`;
// DS Marketing look: black, soft grey glow, faint contour lines, heavy white uppercase type
const topo = `<svg width="1080" height="1920" style="position:absolute;inset:0;opacity:.13" xmlns="http://www.w3.org/2000/svg">${Array.from({ length: 22 }, (_, i) => `<ellipse cx="${880 + i * 6}" cy="${380 + i * 14}" rx="${80 + i * 46}" ry="${60 + i * 34}" fill="none" stroke="#fff" stroke-width="1.4" transform="rotate(${-18 + i * 1.5} 900 420)"/>`).join('')}</svg>`;
const bgCss = `background:radial-gradient(900px 900px at 50% 40%,#232323 0,#0A0A0A 60%,#000 100%)`;
const handle = `<div style="font-family:N;font-size:30px;color:#8C8C8C;letter-spacing:1px">@dsmarketing_1</div>`;
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--no-sandbox'] });
const p = await b.newPage({ viewport: { width: 1080, height: 1920 } });
writeFileSync(`${OUT}/blank.html`, '<html></html>');
const png = async (html, f, transparent = true) => { await p.goto(`file://${OUT}/blank.html`); await p.setContent(`<style>${font}</style>${html}`); await p.evaluate(() => document.fonts.ready); await p.waitForTimeout(80); await p.screenshot({ path: `${OUT}/${f}`, omitBackground: transparent }); };
await png(`<div style="position:absolute;inset:0;${bgCss}"></div>${topo}<div style="position:absolute;top:90px;left:0;right:0;text-align:center"><img src="${LOGO}" style="height:74px"></div>
<div style="position:absolute;bottom:40px;left:0;right:0;text-align:center">${handle}</div>
<div style="position:absolute;left:${PX - BZ}px;top:${PY - BZ}px;width:${PW + 2 * BZ}px;height:${PH + 2 * BZ}px;border-radius:${R + BZ}px;box-shadow:0 0 0 1px #2c2c2c,0 50px 140px rgba(255,255,255,.07),0 30px 80px rgba(0,0,0,.9)"></div>`, 'sbg.png', false);
await png(`<div style="position:absolute;left:${PX - BZ}px;top:${PY - BZ}px;width:${PW + 2 * BZ}px;height:${PH + 2 * BZ}px;border-radius:${R + BZ}px;border:${BZ}px solid #050505;box-shadow:inset 0 0 0 2px #3a3a3a,0 0 0 2px #5a5a5a"></div>
<div style="position:absolute;left:${540 - 90}px;top:${PY + 14}px;width:180px;height:44px;border-radius:22px;background:#050505"></div>`, 'bezel.png');
await png(`<div style="position:absolute;left:0;top:0;width:${PW}px;height:${PH}px;border-radius:${R}px;background:#fff"></div>`, 'mask.png');
const heads = [];
cues.forEach((c, i) => { const t0 = IN + c.t, t1 = IN + Math.min(i + 1 < cues.length ? cues[i + 1].t : dur, c.t + 3.2); if (t1 - t0 < 0.6) return;
  const txt = c.text.toUpperCase(); const fs = txt.length > 28 ? 58 : txt.length > 18 ? 70 : 84;
  heads.push({ t0, t1, f: `h${i}.png`, html: `<div style="position:absolute;top:220px;left:70px;right:70px;height:330px;display:flex;flex-direction:column;align-items:flex-start;justify-content:center">
  ${c.key ? '<div style="background:#fff;color:#000;font-family:N;font-size:32px;border-radius:12px;padding:6px 18px;margin-bottom:14px">Key moment</div>' : ''}
  <div style="font-size:${fs}px;line-height:.98;letter-spacing:-2px;color:#fff;text-align:left">${txt}</div></div>` }); });
for (const h of heads) await png(h.html, h.f);
const [i1, i2] = intro.split('|');
await png(`<div style="position:absolute;inset:0;${bgCss}"></div>${topo}<div style="position:absolute;top:150px;left:0;right:0;text-align:center"><img src="${LOGO}" style="height:90px"></div>
<div style="position:absolute;top:700px;left:70px;right:40px"><div style="display:inline-block;background:#fff;color:#000;font-family:N;font-size:40px;border-radius:14px;padding:6px 20px;margin-bottom:22px">SDX Inspect</div>
<div style="font-size:${i1.length > 20 ? 104 : 124}px;line-height:.95;letter-spacing:-3px;color:#fff">${i1.toUpperCase()}</div>
<div style="font-size:52px;line-height:1.1;letter-spacing:-1px;color:#9a9a9a;margin-top:28px">${i2.toUpperCase()}</div></div>
<div style="position:absolute;bottom:60px;left:0;right:0;text-align:center">${handle}</div>`, 'intro.png', false);
await png(`<div style="position:absolute;inset:0;background:url(file://${DIR}ds-torn.png) center/auto 1920px no-repeat #000"></div>
<div style="position:absolute;top:1260px;left:0;right:0;text-align:center;color:#fff;font-size:62px;letter-spacing:-1px;text-shadow:0 4px 20px #000">WALK IT. FIX IT. PROVE IT.</div>
<div style="position:absolute;top:1360px;left:0;right:0;text-align:center;color:#bdbdbd;font-family:N;font-size:40px">SDX Inspect · by DSmarketing Agency</div>
<div style="position:absolute;top:1490px;left:0;right:0;text-align:center"><span style="display:inline-block;background:#fff;color:#000;border-radius:999px;padding:24px 56px;font-size:40px">LINK IN BIO →</span></div>
<div style="position:absolute;bottom:60px;left:0;right:0;text-align:center">${handle}</div>`, 'outro.png', false);
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
const out = `${DIR}out/brand-${clip}.mp4`;
execFileSync(FF, ['-loglevel', 'error', '-y', ...ins, '-f', 'lavfi', '-i', music, '-filter_complex',
  g + `;[${6 + heads.length}:a]lowpass=f=9000,afade=t=in:d=0.6,afade=t=out:st=${(T - 1.4).toFixed(2)}:d=1.4,loudnorm=I=-14:TP=-1.5:LRA=9,aformat=sample_rates=48000:channel_layouts=stereo[a]`,
  '-map', '[v]', '-map', '[a]', '-c:v', 'libx264', '-preset', 'slow', '-crf', '17', '-maxrate', '5M', '-bufsize', '10M', '-profile:v', 'high', '-g', '60', '-r', '30',
  '-c:a', 'aac', '-b:a', '128k', '-movflags', '+faststart', out]);
console.log('brand', out, T.toFixed(1) + ' s', heads.length + ' headlines');
