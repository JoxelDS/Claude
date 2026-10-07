// node reel.mjs <clip> "<HOOK>" "<line 2>" [start=2] [len=18] → out/reel-<clip>.mp4 (1080×1920, H.264/AAC, faststart)
// <clip> = out/<clip>.mp4 recorded by rec_full.mjs / record.mjs (phone stage, 1920×1080).
// Phone screen is cropped from the stage, scaled full-height, hook text on top, end card, synthesized beat.
import { writeFileSync } from 'fs';
import { execFileSync } from 'child_process';
import { chromium } from '/home/user/Claude/node_modules/playwright-core/index.mjs';
const FF = process.env.FFMPEG || '/tmp/ff/node_modules/ffmpeg-static/ffmpeg';
const DIR = new URL('.', import.meta.url).pathname;
const [clip, hook, line2 = '', st = '2', len = '18'] = process.argv.slice(2);
const T = +len + 2.5; // + end card
const font = n => `@font-face{font-family:M;font-weight:800;src:url(file://${DIR}fonts/Montserrat-800.woff2)}`;
const css = `${font()} *{margin:0} body{width:1080px;height:1920px;background:transparent;font-family:M,Arial;font-weight:800;color:#fff;text-align:center}
.t{position:absolute;left:60px;right:60px;text-shadow:0 0 8px #000,0 4px 0 #000,0 0 2px #000;-webkit-text-stroke:3px #000;paint-order:stroke fill}`;
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--no-sandbox'] });
const p = await b.newPage({ viewport: { width: 1080, height: 1920 } });
const shot = async (html, f) => { await p.setContent(`<style>${css}</style>${html}`); await p.evaluate(() => document.fonts.ready); await p.screenshot({ path: DIR + 'out/' + f, omitBackground: true }); };
await shot(`<div class=t style="top:150px;font-size:78px;line-height:1.1">${hook}</div><div class=t style="top:1620px;font-size:52px;color:#FFD24A">${line2}</div>`, 'ov_hook.png');
await shot(`<div style="position:absolute;inset:0;background:#0B1240"></div><div class=t style="top:720px;font-size:96px;line-height:1.15">WALK IT.<br>FIX IT.<br><span style="color:#FFD24A">PROVE IT.</span></div><div class=t style="top:1240px;font-size:44px;color:#C9D4FF">SDX INSPECT · inspection system</div>`, 'ov_end.png');
await b.close();
const out = `${DIR}out/reel-${clip}.mp4`;
// phone screen crop inside the 1920×1080 stage (w:h:x:y), slight speed-up, blurred fill behind
const fc = `[0:v]trim=start=${st}:duration=${len},setpts=(PTS-STARTPTS)/1.15,crop=448:975:1098:34,scale=-2:1920,setsar=1[ph];` +
  `[0:v]trim=start=${st}:duration=${len},setpts=(PTS-STARTPTS)/1.15,scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920,boxblur=30:3,eq=brightness=-0.25[bg];` +
  `[bg][ph]overlay=(W-w)/2:0[v0];[v0][1:v]overlay=0:0:enable='lt(t,4.2)'[v1];` +
  `[2:v]loop=-1:1,trim=duration=2.5,setpts=PTS-STARTPTS,fps=30[end];[v1]fps=30,tpad=stop_mode=clone:stop_duration=1[v2];` +
  `[v2]trim=duration=${(+len / 1.15).toFixed(2)},setpts=PTS-STARTPTS[v3];[v3]setsar=1[v3s];[end]setsar=1[ends];[v3s][ends]concat=n=2:v=1,format=yuv420p[v]`;
const beat = `aevalsrc='0.5*sin(2*PI*(45+90*exp(-25*mod(t,0.5)))*mod(t,0.5))*exp(-7*mod(t,0.5))+0.06*sin(2*PI*110*t)*(0.6+0.4*sin(2*PI*0.5*t))':s=48000:d=${T}`;
execFileSync(FF, ['-loglevel', 'error', '-y', '-i', `${DIR}out/${clip}.mp4`, '-i', `${DIR}out/ov_hook.png`, '-i', `${DIR}out/ov_end.png`, '-f', 'lavfi', '-i', beat,
  '-filter_complex', fc + `;[3:a]afade=t=out:st=${(+len / 1.15 + 1.5).toFixed(2)}:d=1,aformat=channel_layouts=stereo[a]`, '-map', '[v]', '-map', '[a]',
  '-c:v', 'libx264', '-profile:v', 'high', '-crf', '21', '-maxrate', '4.5M', '-bufsize', '9M', '-g', '60', '-c:a', 'aac', '-b:a', '128k', '-ar', '48000', '-movflags', '+faststart', '-shortest', out]);
console.log('reel', out);
