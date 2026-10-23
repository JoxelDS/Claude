// node showcase.mjs [--at 1,5,12]  → out/showcase-reel.mp4 (1080×1920, 30 fps, AAC)
// "SDX Inspect, in motion": a full-screen motion-design piece (no monitor, no desk) in the rhythm of an
// app-launch animation, telling ONE job from start to end: grease under a fryer at HARBOR DOGS #101 (the demo
// venue's made-up stand). A glowing dot and the problem, "Find it on the walk", "Just scan it", a phone home screen
// that zooms into the blue SDX icon (the zoom becomes the blue screen), a typed question, a tap on the logo button,
// the scan, a pill that grows into the wordmark and runs the walk (hand sink ✓, cooler ✓, under the fryer ✕), the pill
// morphs into the problem card, the real app on phones (the crew's AFTER photo, the inspector's ✅ Fixed view),
// the BEFORE / AFTER photos pulled out big, taglines, the lockup.
// Everything is ours: the SDX mark, generic drawn icons (no real brands), our own sample photos (stamped SAMPLE
// PHOTO), the real app recorded by pov.mjs. Same method as motion.mjs: every frame is a pure function of t rendered
// in Chromium; the sound is synthesized.
import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync, rmSync } from 'fs';
import { execFileSync } from 'child_process';
import { createRequire } from 'module';
import { chromium } from '/home/user/Claude/node_modules/playwright-core/index.mjs';
import { TEAL, C, fontCss, mark, lockup } from './sdxmark.mjs';
const sharp = createRequire(import.meta.url)('/home/user/Claude/node_modules/sharp');
const FF = process.env.FFMPEG || '/tmp/ff/node_modules/ffmpeg-static/ffmpeg';
const DIR = new URL('.', import.meta.url).pathname;
const args = process.argv.slice(2);
const opt = k => { const i = args.indexOf('--' + k); return i >= 0 ? args[i + 1] : null; };
const FPS = 30, T = 42.0, N = Math.round(T * FPS), W = 1080, H = 1920;
const OUT = `${DIR}out/showcase`; mkdirSync(OUT, { recursive: true });
const b64 = (f, type = 'jpeg') => `data:image/${type};base64,` + readFileSync(f).toString('base64');

// the crew's phone plays the real app (Done → the AFTER photo → "We cleaned it"); the inspector's phone holds the ✅ Fixed card
const CREW = { clip: 'crew', from: 13.3, to: 17.3, a: 25.5, b: 28.1 };
CREW.sp = (CREW.to - CREW.from) / (CREW.b - CREW.a);
{
  const seq = `${OUT}/seq_crew2`, stamp = `${seq}/w_${CREW.from}_${CREW.to}`;
  if (!existsSync(stamp)) {
    rmSync(seq, { recursive: true, force: true }); mkdirSync(seq, { recursive: true });
    execFileSync(FF, ['-loglevel', 'error', '-y', '-ss', String(CREW.from), '-i', `${DIR}out/pov_crew/master.mp4`, '-t', String(CREW.to - CREW.from + 0.2), '-vf', `fps=${FPS},scale=720:-2:flags=lanczos`, '-q:v', '3', `${seq}/%05d.jpg`]);
    writeFileSync(stamp, '');
  }
  CREW.seq = seq; CREW.n = readdirSync(seq).filter(f => f.endsWith('.jpg')).length;
}
// stills: the ✅ Fixed card (fixed clip 3.2 s) and two clean app headers (the headers are translucent: the text
// scrolled under them shows through, so a copy from a moment with nothing under them is laid on top)
const still = (clip, at, name, vf) => { const f = `${OUT}/${name}`; if (!existsSync(f)) execFileSync(FF, ['-loglevel', 'error', '-y', '-ss', String(at), '-i', `${DIR}out/pov_${clip}/master.mp4`, '-frames:v', '1', '-vf', vf, f]); return f; };
const FIXED = b64(still('fixed', 3.2, 'fixed_card.jpg', 'scale=1080:-2'));
const HDR_CREW = b64(still('crew', 19.6, 'hdr_crew.png', 'crop=1080:168:0:0'), 'png');
const HDR_FIX = b64(still('fixed', 1.0, 'hdr_fix.png', 'crop=1080:168:0:0'), 'png');
// our own generated photos, stamped SAMPLE PHOTO wherever they are shown big
async function stamped(key) {
  const f = `${OUT}/${key}_sample.jpg`;
  if (!existsSync(f)) {
    const m = await sharp(`${DIR}pics/${key}.jpg`).metadata();
    const svg = `<svg width="${m.width}" height="${m.height}" xmlns="http://www.w3.org/2000/svg"><rect x="18" y="18" width="196" height="40" rx="8" fill="rgba(0,0,0,.6)"/><text x="116" y="45" text-anchor="middle" font-family="Arial" font-weight="700" font-size="21" letter-spacing="1.5" fill="#fff">SAMPLE PHOTO</text></svg>`;
    await sharp(`${DIR}pics/${key}.jpg`).composite([{ input: Buffer.from(svg), top: 0, left: 0 }]).jpeg({ quality: 90 }).toFile(f);
  }
  return b64(f);
}
const PIC = { grease: await stamped('grease'), after: await stamped('after') };

// ---- the phone (one size, laid out once; scenes move it with transforms)
const PB = 16, PH = 1300; const PSW = Math.round((PH - 2 * PB) * 1080 / 2338); const PW = PSW + 2 * PB;
const PX = (W - PW) / 2, PY = 300;
// home-screen icons: generic glyphs, no real brands; the SDX icon sits in row 3, col 2
const ICONS = [
  ['#FF9F43', 'sun'], ['#5B8CFF', 'cal'], ['#2ED47A', 'chat'], ['#FF5A7A', 'heart'],
  ['#8E7CFF', 'note'], ['#00B8D9', 'drop'], ['#FFC93C', 'star'], ['#4C5BD4', 'mail'],
  ['#20C997', 'map'], ['SDX', 'sdx'], ['#F76707', 'cam'], ['#7048E8', 'music'],
  ['#12B886', 'chart'], ['#E64980', 'gift'], ['#339AF0', 'cloud'], ['#868E96', 'gear'],
  ['#FA5252', 'clock'], ['#40C057', 'leaf'], ['#15AABF', 'wave'], ['#FAB005', 'bolt'],
];
const DOCK = [['#2ED47A', 'phone'], ['#339AF0', 'chat'], ['#FF5A7A', 'music'], ['#5C7CFA', 'globe']];
const GLYPH = {
  sun: '<circle cx="50" cy="50" r="17" fill="#fff"/><g stroke="#fff" stroke-width="7" stroke-linecap="round"><path d="M50 14v10M50 76v10M14 50h10M76 50h10M25 25l7 7M68 68l7 7M75 25l-7 7M32 68l-7 7"/></g>',
  cal: '<rect x="22" y="26" width="56" height="52" rx="10" fill="#fff"/><rect x="22" y="26" width="56" height="16" rx="8" fill="#ffd7d7"/><text x="50" y="70" text-anchor="middle" font-size="26" font-weight="800" fill="#333" font-family="I">22</text>',
  chat: '<path d="M22 30h56v34H44l-14 12V64h-8z" fill="#fff"/>', heart: '<path d="M50 78 22 50c-8-10-2-26 12-26 8 0 13 6 16 10 3-4 8-10 16-10 14 0 20 16 12 26z" fill="#fff"/>',
  note: '<rect x="28" y="20" width="44" height="60" rx="8" fill="#fff"/><path d="M36 38h28M36 50h28M36 62h18" stroke="#8E7CFF" stroke-width="6" stroke-linecap="round"/>',
  drop: '<path d="M50 18c12 18 22 30 22 42a22 22 0 0 1-44 0c0-12 10-24 22-42z" fill="#fff"/>', star: '<path d="m50 18 9 20 22 2-17 15 5 22-19-11-19 11 5-22-17-15 22-2z" fill="#fff"/>',
  mail: '<rect x="20" y="30" width="60" height="42" rx="8" fill="#fff"/><path d="m22 34 28 22 28-22" fill="none" stroke="#4C5BD4" stroke-width="6"/>',
  map: '<path d="M50 80s-22-24-22-40a22 22 0 0 1 44 0c0 16-22 40-22 40z" fill="#fff"/><circle cx="50" cy="40" r="8" fill="#20C997"/>',
  cam: '<rect x="20" y="32" width="60" height="42" rx="10" fill="#fff"/><circle cx="50" cy="53" r="12" fill="#F76707"/><rect x="38" y="24" width="24" height="12" rx="4" fill="#fff"/>',
  music: '<path d="M40 70V30l30-8v38" fill="none" stroke="#fff" stroke-width="7"/><circle cx="34" cy="70" r="9" fill="#fff"/><circle cx="64" cy="62" r="9" fill="#fff"/>',
  chart: '<path d="M26 74V50M42 74V34M58 74V44M74 74V26" stroke="#fff" stroke-width="9" stroke-linecap="round"/>',
  gift: '<rect x="24" y="40" width="52" height="36" rx="6" fill="#fff"/><rect x="20" y="30" width="60" height="14" rx="5" fill="#fff"/><path d="M50 30v46" stroke="#E64980" stroke-width="6"/>',
  cloud: '<path d="M32 70h38a14 14 0 0 0 0-28 20 20 0 0 0-38-4 16 16 0 0 0 0 32z" fill="#fff"/>',
  gear: '<circle cx="50" cy="50" r="20" fill="none" stroke="#fff" stroke-width="10" stroke-dasharray="8 6"/><circle cx="50" cy="50" r="8" fill="#fff"/>',
  clock: '<circle cx="50" cy="50" r="28" fill="#fff"/><path d="M50 32v20l12 8" stroke="#FA5252" stroke-width="6" stroke-linecap="round" fill="none"/>',
  leaf: '<path d="M26 74c0-30 20-48 50-50-2 30-20 50-50 50z" fill="#fff"/>', wave: '<path d="M18 56c10-12 18-12 26 0s16 12 26 0 12-8 14-6" fill="none" stroke="#fff" stroke-width="8" stroke-linecap="round"/>',
  bolt: '<path d="M56 16 28 56h20l-6 28 30-42H52z" fill="#fff"/>', phone: '<path d="M34 22c4 0 10 12 10 16s-6 6-6 8c2 8 8 14 16 16 2 0 4-6 8-6s16 6 16 10c0 6-6 12-12 12-26 0-44-18-44-44 0-6 6-12 12-12z" fill="#fff"/>',
  globe: '<circle cx="50" cy="50" r="27" fill="none" stroke="#fff" stroke-width="6"/><path d="M23 50h54M50 23c-14 16-14 38 0 54M50 23c14 16 14 38 0 54" fill="none" stroke="#fff" stroke-width="5"/>',
};
const icon = ([bg, g], i) => g === 'sdx'
  ? `<div class="ic" id="sdxIcon"><div id="sdxMark">${mark(150, { onDark: true })}</div></div>`
  : `<div class="ic" style="background:linear-gradient(160deg,${bg},${bg}cc)"><svg viewBox="0 0 100 100" width="100%" height="100%">${GLYPH[g]}</svg></div>`;


const css = `${fontCss(DIR)}@font-face{font-family:M;font-weight:800;src:url(file://${DIR}fonts/Montserrat-800.woff2)}
*{margin:0;box-sizing:border-box} html,body{width:${W}px;height:${H}px;overflow:hidden;background:#000;font-family:I,Arial;-webkit-font-smoothing:antialiased;color:#fff}
.layer{position:absolute;inset:0;overflow:hidden}
#dark{background:#02040B}
.blob{position:absolute;border-radius:50%;pointer-events:none}
#d1{width:1300px;height:1300px;background:radial-gradient(closest-side,rgba(40,80,255,.55),rgba(40,80,255,0))}
#d2{width:1200px;height:1200px;background:radial-gradient(closest-side,rgba(20,140,255,.42),rgba(20,140,255,0))}
#d3{width:900px;height:900px;background:radial-gradient(closest-side,rgba(51,195,176,.30),rgba(51,195,176,0))}
#blue,#sdxIcon{background:linear-gradient(160deg,#3D5BFF 0%,#2340E8 45%,#1A2FC4 100%)}
#u1{width:1400px;height:1400px;background:radial-gradient(closest-side,rgba(120,170,255,.55),rgba(120,170,255,0))}
#u2{width:1100px;height:1100px;background:radial-gradient(closest-side,rgba(51,195,176,.35),rgba(51,195,176,0))}
.kin{position:absolute;left:60px;right:60px;text-align:center;font-family:M,I;font-weight:800;letter-spacing:-2.5px;line-height:1.08}
.kin span{display:inline-block;white-space:pre}
.kin .hl{color:${TEAL}} .kin .hb{color:#0B1240} .kin .hr{color:#FF5A5F}
#dot{position:absolute;width:28px;height:28px;margin:-14px 0 0 -14px;border-radius:50%;background:#BFF5EC;box-shadow:0 0 40px 14px rgba(51,195,176,.75),0 0 120px 40px rgba(60,110,255,.45)}
#phoneCam{position:absolute;left:0;top:0;width:${W}px;height:${H}px;transform-origin:0 0}
#phone{position:absolute;left:${PX}px;top:${PY}px;width:${PW}px;height:${PH}px;border-radius:${Math.round(PW * 0.15)}px;padding:${PB}px;background:linear-gradient(145deg,#D7DBEC,#4A4F6B 55%,#C9CEE3);box-shadow:0 0 0 2px rgba(255,255,255,.2) inset,0 60px 140px rgba(0,0,0,.65),0 0 120px rgba(60,110,255,.35)}
#scr{position:relative;width:100%;height:100%;border-radius:${Math.round(PW * 0.15) - PB}px;overflow:hidden;background:linear-gradient(170deg,#24326E,#0B1240 60%,#132C5E)}
#isl{position:absolute;left:50%;top:18px;width:150px;height:44px;margin-left:-75px;border-radius:22px;background:#05060B;z-index:3}
#sbar{position:absolute;left:0;right:0;top:20px;height:44px;display:flex;justify-content:space-between;padding:0 46px;font-weight:700;font-size:30px;z-index:2}
#grid{position:absolute;left:40px;right:40px;top:120px;display:grid;grid-template-columns:repeat(4,1fr);row-gap:46px;column-gap:30px}
.ic{width:100%;aspect-ratio:1;border-radius:26%;overflow:hidden;box-shadow:0 8px 20px rgba(0,0,0,.25)}
#sdxIcon{position:relative;overflow:visible;display:flex;align-items:center;justify-content:center}
#sdxMark{width:78%;height:78%} #sdxMark svg{width:100%!important;height:100%!important}
#dock{position:absolute;left:28px;right:28px;bottom:28px;height:150px;border-radius:52px;background:rgba(255,255,255,.18);display:grid;grid-template-columns:repeat(4,1fr);column-gap:30px;padding:24px 34px}
#tapR,#tapR2{position:absolute;width:130px;height:130px;margin:-65px 0 0 -65px;border-radius:50%;border:8px solid #fff;opacity:0}
#tw{position:absolute;left:70px;right:70px;top:830px;text-align:center;font-family:M,I;font-weight:800;font-size:84px;letter-spacing:-2px;line-height:1.1}
#tw .hb{color:#0B1240} #tw .c{visibility:hidden}
#caret{position:absolute;width:8px;height:84px;background:#fff}
#cursor{position:absolute;left:0;top:0;width:96px;height:120px;z-index:6;filter:drop-shadow(0 10px 20px rgba(0,0,0,.35));transform-origin:8px 4px}
#tapR2{z-index:5}
.ring{position:absolute;left:540px;top:900px;border-radius:50%;border:3px solid rgba(255,255,255,.55);background:radial-gradient(closest-side,rgba(255,255,255,.08),rgba(255,255,255,0));transform-origin:50% 50%}
#btn{position:absolute;z-index:4;left:0;top:0;width:300px;height:300px;margin:-150px 0 0 -150px;border-radius:50%;background:#fff;display:flex;align-items:center;justify-content:center;box-shadow:0 30px 80px rgba(5,10,60,.45)}
#btn svg{width:170px;height:170px}
#bcap{position:absolute;left:0;right:0;top:1160px;text-align:center;font-weight:700;font-size:44px;color:rgba(255,255,255,.86)}
#bcap b{color:#fff}
#pill{position:absolute;left:90px;top:860px;height:200px;border-radius:100px;background:#fff;overflow:hidden;box-shadow:0 30px 80px rgba(5,10,60,.45)}
#pWord{position:absolute;left:214px;top:0;height:200px;display:flex;align-items:center;font-family:M;font-weight:800;font-size:70px;letter-spacing:-1px;color:${C.navy};white-space:nowrap}
#pWord i{font-style:normal;color:${TEAL}}
.prow{position:absolute;left:214px;right:40px;top:0;height:200px;display:flex;align-items:center;gap:22px;white-space:nowrap;font-weight:800;font-size:48px;letter-spacing:-.5px;color:${C.navy}}
.prow i{flex:none;width:68px;height:68px;border-radius:50%;display:inline-flex;align-items:center;justify-content:center;font-style:normal;font-size:38px;color:#fff;background:#15803D}
.prow small{font-weight:700;font-size:40px;color:#4B5070}
.prow.bad{color:#B91C1C} .prow.bad i{background:#E5383B}
#pLab{position:absolute;left:0;right:0;top:0;text-align:center;font-weight:800;font-size:34px;letter-spacing:6px;color:rgba(255,255,255,.92)}
#card{position:absolute;background:#fff;overflow:hidden;box-shadow:0 40px 100px rgba(5,10,60,.5);color:${C.ink}}
#cThumb{position:absolute;left:44px;top:44px;width:250px;height:250px;border-radius:30px;overflow:hidden}
#cThumb img{width:100%;height:100%;object-fit:cover;object-position:left center}
#cThumb b{position:absolute;left:12px;bottom:12px;background:#E5383B;color:#fff;font-size:22px;font-weight:800;letter-spacing:2px;padding:6px 12px;border-radius:10px}
#cT1{position:absolute;left:330px;top:60px;font-family:M;font-weight:800;font-size:50px;letter-spacing:-1px;color:${C.navy};white-space:nowrap}
#cT2{position:absolute;left:330px;top:136px;font-weight:800;font-size:38px;color:#B91C1C;white-space:nowrap}
#cT3{position:absolute;left:330px;top:200px;display:inline-flex;align-items:center;gap:10px;font-weight:700;font-size:28px;color:#4B5070;background:#F1F3F9;border-radius:999px;padding:12px 22px;white-space:nowrap}
#cSteps{position:absolute;left:44px;right:44px;top:340px;display:flex;align-items:center;gap:16px}
.st{display:flex;align-items:center;gap:12px;font-weight:800;font-size:30px;color:#8A90AE;white-space:nowrap}
.st i{width:40px;height:40px;border-radius:50%;border:4px solid #C9CEE3;display:inline-flex;align-items:center;justify-content:center;font-style:normal;font-size:24px;color:#fff}
.st.on{color:${C.navy}} .st.on i{background:#E5383B;border-color:#E5383B}
.st.go{color:#B45309} .st.go i{background:#D97706;border-color:#D97706}
.sl{flex:1;height:5px;border-radius:3px;background:#E3E6F0;position:relative;overflow:hidden} .sl b{position:absolute;left:0;top:0;bottom:0;background:#D97706}
.ph{position:absolute;width:${Math.round(PW * .88)}px;height:${Math.round(PH * .88)}px;border-radius:${Math.round(PW * 0.15 * .92)}px;padding:${Math.round(PB * .92)}px;background:linear-gradient(145deg,#D7DBEC,#4A4F6B 55%,#C9CEE3);box-shadow:0 0 0 2px rgba(255,255,255,.2) inset,0 50px 120px rgba(0,0,0,.65);transform-origin:50% 50%}
.ph .s{position:relative;width:100%;height:100%;border-radius:${Math.round((PW * 0.15 - PB) * .92)}px;overflow:hidden;background:#fff}
.ph img.app{position:absolute;inset:0;width:100%;height:100%;object-fit:cover;object-position:top}
.ph img.hdr{position:absolute;left:0;top:0;width:100%;height:auto}
.mk{position:absolute;width:2px;height:2px}
.big{position:absolute;width:600px;height:452px;border-radius:34px;overflow:hidden;border:8px solid #fff;box-shadow:0 40px 100px rgba(0,0,0,.6);transform-origin:50% 50%}
.big img{width:100%;height:100%;object-fit:cover;display:block}
.big b{position:absolute;left:18px;bottom:18px;font-weight:800;font-size:32px;letter-spacing:2px;padding:10px 18px;border-radius:14px;color:#fff}
#bigA small{position:absolute;right:18px;bottom:22px;font-weight:700;font-size:26px;color:#fff;background:rgba(0,0,0,.55);padding:8px 14px;border-radius:10px}
#stampF{position:absolute;width:250px;height:250px;margin:-125px 0 0 -125px;border-radius:50%;background:#15803D;border:8px solid #fff;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:2px;box-shadow:0 20px 60px rgba(0,0,0,.45);font-family:M;font-weight:800;color:#fff;letter-spacing:1px}
#stampF span{font-size:88px;line-height:1} #stampF em{font-style:normal;font-size:40px}
#endc{position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center}
#epill{margin-top:56px;background:${TEAL};color:#06231F;font-weight:800;font-size:46px;padding:22px 46px;border-radius:999px}
#ehandle{font-weight:700;font-size:40px;color:#AEB4E6;margin-top:28px}
#bigLogo{position:absolute;left:540px;top:820px;width:260px;height:260px;margin:-130px 0 0 -130px}
#bigLogo svg{width:100%;height:100%}
#vig{position:absolute;inset:0;background:radial-gradient(1200px 1700px at 50% 45%,transparent 60%,rgba(0,0,0,.45));pointer-events:none}`;

// kinetic lines: [id, html with <h>…</h> highlights, cls, top, size]
const KIN = [
  ['k1', 'Grease under\n<h>the fryer.</h>', 'hr', 690, 104], ['k2', 'The fix? <h>No proof.</h>', 'hr', 960, 100],
  ['k3', 'Find it\n<h>on the walk.</h>', 'hl', 780, 116],
  ['k4', 'Just <h>scan</h> it.', 'hl', 850, 150],
  ['k5', 'Tap to start', '', 560, 96],
  ['k6', 'Crew sends the <h>AFTER.</h>', 'hl', 250, 72], ['k7', 'Fixed — <h>with proof.</h>', 'hl', 250, 72],
  ['k8', 'Find problems\n<h>on the walk</h>', 'hl', 860, 92], ['k9', 'Fix them <h>with proof</h>', 'hl', 860, 92], ['k10', 'At every <h>stand</h>', 'hl', 860, 92],
  ['k11', 'Walk it.\nFix it.\n<h>Prove it.</h>', 'hl', 900, 118],
];
const kinHtml = ([id, h, cls, top, size]) => `<div class="kin" id="${id}" style="top:${top}px;font-size:${size}px">${h.split(/(<h>.*?<\/h>)/).filter(Boolean).map(seg => {
  const hi = seg.startsWith('<h>'); const txt = seg.replace(/<\/?h>/g, '');
  return txt.split(/(\s+)/).filter(x => x.length).map(w => /\n/.test(w) ? '<br>' : /^\s+$/.test(w) ? '<span> </span>' : `<span${hi ? ` class="${cls || 'hl'}"` : ''}>${w}</span>`).join('');
}).join('')}</div>`;
// the typed question, laid out in full once (each letter is revealed in place, so the line never re-centres)
const TWP = [['What needs', ''], ['\n', ''], ['checking', 'hb'], [' today?', '']];
let twi = 0; const twHtml = TWP.map(([s, cl]) => s === '\n' ? '<br>' : `<span${cl ? ` class="${cl}"` : ''}>${[...s].map(ch => `<span class="c" data-i="${twi++}">${ch === ' ' ? '&nbsp;' : ch}</span>`).join('')}</span>`).join('');
const TWN = twi;
const ROWS = [['✓', 'Hand sink', '104°F', ''], ['✓', 'Cooler', '38°F', ''], ['✕', 'Under the fryer', '', 'bad']];

const html = `<!doctype html><meta charset=utf-8><style>${css}</style>
<div class="layer" id="dark"><div class="blob" id="d1"></div><div class="blob" id="d2"></div><div class="blob" id="d3"></div></div>
<div class="layer" id="blue"><div class="blob" id="u1"></div><div class="blob" id="u2"></div>
  ${[0, 1, 2, 3].map(i => `<div class="ring" id="r${i}"></div>`).join('')}
  <div id="btn">${mark(170)}</div><div id="bcap"></div>
  <div id="pLab"></div>
  <div id="pill"><div id="pWord">SDX <i>&nbsp;INSPECT</i></div>
    ${ROWS.map(([ic, a, b, cls], i) => `<div class="prow ${cls}" id="pr${i}"><i>${ic}</i>${a}${b ? ` <small>· ${b}</small>` : ''}</div>`).join('')}</div>
  <div id="card"><div id="cThumb"><img src="${PIC.grease}"><b>BEFORE</b></div><div id="cT1">HARBOR DOGS #101</div><div id="cT2">Grease under the fryer</div><div id="cT3">⚠ Flagged on the walk · photo added</div>
    <div id="cSteps"><div class="st" id="s1"><i>!</i>Flagged</div><div class="sl"><b id="l1"></b></div><div class="st" id="s2"><i>→</i>Crew</div><div class="sl"><b id="l2"></b></div><div class="st" id="s3"><i>✓</i>Fixed</div></div></div>
  <div id="tw">${twHtml}<div id="caret"></div></div>
  <div id="tapR2"></div>
  <svg id="cursor" viewBox="0 0 48 60"><path d="M4 2 L4 46 L15 35 L23 54 L31 50 L23 32 L40 32 Z" fill="#fff" stroke="#0B1240" stroke-width="3" stroke-linejoin="round"/></svg>
</div>
<div class="layer" id="phLayer"><div id="phoneCam"><div id="phone"><div id="scr"><div id="isl"></div><div id="sbar"><span>9:41</span><span>●●● ▴ ▮</span></div>
  <div id="grid">${ICONS.map(icon).join('')}</div><div id="dock">${DOCK.map(icon).join('')}</div><div id="tapR"></div></div></div></div></div>
<div class="layer" id="apps">
  <div class="ph" id="phC"><div class="s"><img class="app" id="imC"><img class="hdr" src="${HDR_CREW}"></div></div>
  <div class="ph" id="phX"><div class="s"><img class="app" src="${FIXED}"><img class="hdr" src="${HDR_FIX}"><div class="mk" id="mkB" style="left:29%;top:45.7%"></div><div class="mk" id="mkA" style="left:29%;top:56.5%"></div></div></div>
  <div class="big" id="bigB"><img src="${PIC.grease}"><b style="background:#E5383B">BEFORE</b></div>
  <div class="big" id="bigA"><img src="${PIC.after}"><b style="background:#15803D">AFTER</b><small>by the crew · just now</small></div>
  <div id="stampF"><span>✓</span><em>FIXED</em></div>
</div>
<div class="layer" id="txt">
  <div id="dot"></div>
  ${KIN.map(kinHtml).join('')}
  <div id="bigLogo">${mark(260)}</div>
  <div id="endc"><div id="elock">${lockup(170)}</div><div id="epill">Free 30-day pilot · DM PILOT</div><div id="ehandle">@sdxinspection</div></div>
</div>
<div id="vig"></div>
<script>
const W=${W};const D=${JSON.stringify({ FPS, CREW: { a: CREW.a, b: CREW.b, sp: CREW.sp, n: CREW.n, seq: CREW.seq }, PX, PY, PW, PH, PB, TWN })};
const $=id=>document.getElementById(id);
const cl=(x,a=0,b=1)=>Math.min(b,Math.max(a,x));
function spring(t,r=0.5,z=0.82){ if(t<=0) return 0; const w=2*Math.PI/r, wd=w*Math.sqrt(1-z*z); return 1-Math.exp(-z*w*t)*(Math.cos(wd*t)+(z*w/wd)*Math.sin(wd*t)); }
const ease=t=>t<=0?0:t>=1?1:1-Math.pow(1-t,3);
const ein=t=>t<=0?0:t>=1?1:t*t*t;
const eio=t=>t<=0?0:t>=1?1:(t<.5?4*t*t*t:1-Math.pow(-2*t+2,3)/2);
const mix=(a,b,k)=>a+(b-a)*k;
const bump=(t,t0,d)=>Math.sin(Math.PI*cl((t-t0)/d));
const vis=(el,o,tf)=>{ el.style.opacity=o; el.style.visibility=o>0.002?'visible':'hidden'; if(tf!=null) el.style.transform=tf; };
// a kinetic line: words rise in with a blur, one after the other; out with a blur, all together
function kin(id,t0,t1,t,{stag=.07,dy=46,out=.28}={}){ const el=$(id); if(t<t0-.05||t>t1+out){ vis(el,0); return; } vis(el,1);
  [...el.querySelectorAll('span')].forEach((s,i)=>{ const u=t-t0-i*stag, k=spring(u,.55,.78), o=ease((t-t1)/out);
    s.style.opacity=(cl(u/.16)*(1-o)).toFixed(3); s.style.transform='translateY('+(dy*(1-k)-30*o).toFixed(1)+'px) scale('+(s.className?(1+.25*(1-k)):1).toFixed(3)+')'; s.style.filter='blur('+(12*(1-cl(u/.28))+14*o).toFixed(2)+'px)'; }); }
// the typewriter: letters revealed in place; the caret sits after the last one shown
const TWC=[...document.querySelectorAll('#tw .c')];
function tw(t){ const el=$('tw'); const t0=10.15, t1=12.2;
  if(t<10.0||t>t1+.3){ vis(el,0); return; } vis(el,1-ease((t-t1)/.3));
  const n=Math.max(0,Math.min(D.TWN,Math.floor((t-t0)*17)));
  TWC.forEach((c,i)=>{ c.style.visibility=i<n?'visible':'hidden'; });
  const er=el.getBoundingClientRect(); const ref=n>0?TWC[n-1].getBoundingClientRect():TWC[0].getBoundingClientRect();
  const car=$('caret'); car.style.left=((n>0?ref.right:ref.left)-er.left+4)+'px'; car.style.top=(ref.top-er.top+8)+'px';
  car.style.opacity=((Math.floor(t*2.2)%2===0)||n<D.TWN)?1:0; }
// the SDX icon's centre on the untransformed home screen (for the zoom into it)
const IC=(()=>{ const r=$('sdxIcon').getBoundingClientRect(); return { x:r.left+r.width/2, y:r.top+r.height/2, w:r.width }; })();
const crewSrc=t=>'file://'+D.CREW.seq+'/'+String(Math.max(1,Math.min(D.CREW.n,Math.floor(cl(t-D.CREW.a,0,D.CREW.b-D.CREW.a)*D.CREW.sp*D.FPS)+1))).padStart(5,'0')+'.jpg';
const ctr=el=>{ const r=el.getBoundingClientRect(); return [r.left+r.width/2,r.top+r.height/2]; };
window.render=async f=>{
  const t=f/D.FPS; const imgs=[];
  // ---------------- backgrounds: dark (0–10, 25–end), blue (9.75–26, slides out left at 25.0)
  const drift=(id,ax,ay,px,py,s)=>{ $(id).style.transform='translate('+(ax+px*Math.sin(t*s)).toFixed(0)+'px,'+(ay+py*Math.cos(t*s*.83)).toFixed(0)+'px)'; };
  drift('d1',-520,-380,160,120,.23); drift('d2',380,980,140,160,.19); drift('d3',-200,1250,120,90,.27);
  const darkGlow=t<10.2?cl(t/.6):cl((t-25.0)/.8);
  $('d1').style.opacity=darkGlow; $('d2').style.opacity=darkGlow; $('d3').style.opacity=darkGlow*.9;
  const blueOn=t>=9.75&&t<26.0; const bOut=eio((t-25.0)/.8);
  vis($('blue'),blueOn?1:0,'translateX('+(-W*bOut).toFixed(1)+'px)');
  drift('u1',-450,-300,120,90,.21); drift('u2',300,1100,140,120,.25);
  // ---------------- S1 0–3.0: the dot rises and goes out, then the problem
  const dotY=mix(960,560,ease((t-.12)/.38)); const dotO=t<.04?0:1-ease((t-.38)/.2);
  $('dot').style.left='540px'; $('dot').style.top=dotY+'px'; vis($('dot'),dotO,'scale('+(spring(t-.04,.45,.6)*(1-.5*ease((t-.35)/.2))).toFixed(3)+')');
  kin('k1',.4,2.9,t); kin('k2',1.15,2.9,t);
  // ---------------- S2 / S3
  kin('k3',3.3,4.9,t,{stag:.09}); kin('k4',5.2,6.75,t,{stag:.12,dy:60});
  // ---------------- S4 6.8–10.05: the phone rises, the blue SDX icon glows, a tap, the zoom into the icon
  const pin=spring(t-6.85,.75,.78);
  const lay=$('phLayer'); const phOn=t>=6.8&&t<10.05; vis(lay,phOn?1-ease((t-9.8)/.25):0);
  if(phOn){
    const pz=eio((t-8.7)/.4), zz=ein((t-9.1)/.75);
    const s=t<9.1?mix(1,1.3,pz):1.3*Math.pow(30/1.3,zz);
    const cx=mix(540,IC.x,pz), cy=mix(960,IC.y,pz);
    const tilt=mix(26,0,pin), lift=mix(1500,0,pin)+10*Math.sin(t*1.3)*(1-pz);
    $('phoneCam').style.transform='translate('+(540-cx*s).toFixed(1)+'px,'+(960-cy*s+lift).toFixed(1)+'px) scale('+s.toFixed(4)+') perspective(1800px) rotateX('+tilt.toFixed(2)+'deg)';
    const glow=t>=7.5&&t<8.8?.5+.5*Math.sin((t-7.5)*Math.PI*2.4-Math.PI/2):0;
    $('sdxIcon').style.boxShadow='0 8px 20px rgba(0,0,0,.25),0 0 0 '+(4+8*glow).toFixed(1)+'px rgba(51,195,176,'+(.85*glow).toFixed(3)+'),0 0 '+(30+40*glow).toFixed(0)+'px rgba(51,195,176,'+(.7*glow).toFixed(3)+')';
    $('sdxIcon').style.transform='scale('+(1-.12*bump(t,8.25,.35)).toFixed(3)+')';
    $('sdxMark').style.opacity=(1-cl((s-2.2)/3)).toFixed(3);
    const tr=$('tapR'); const tk=(t-8.3)/.55; if(tk>=0&&tk<1){ tr.style.left=(IC.x-D.PX-D.PB)+'px'; tr.style.top=(IC.y-D.PY-D.PB)+'px'; tr.style.opacity=((1-tk)*.95).toFixed(3); tr.style.transform='scale('+(.5+1.1*ease(tk))+')'; } else tr.style.opacity=0;
  }
  // ---------------- S5 10–13.9: the typed question, "Tap to start", the button, the cursor presses it
  tw(t); kin('k5',12.45,13.9,t,{stag:.08});
  const bk=spring(t-12.7,.6,.62);
  const cu=$('cursor'); if(t>=12.85&&t<14.1){ const ck=ease((t-12.85)/.5); const x=mix(1100,567,ck), y=mix(1500,931,ck); const press=bump(t,13.42,.18);
    cu.style.left=x+'px'; cu.style.top=y+'px'; vis(cu,1-ease((t-13.8)/.25),'scale('+(1-.18*press).toFixed(3)+')'); } else vis(cu,0);
  const r2=$('tapR2'); const rk=(t-13.48)/.5; if(rk>=0&&rk<1){ r2.style.left='575px'; r2.style.top='935px'; r2.style.opacity=((1-rk)*.9).toFixed(3); r2.style.transform='scale('+(.4+1.2*ease(rk))+')'; } else r2.style.opacity=0;
  // ---------------- S6 13.6–16.5: scanning rings; found ✓ with a pop; the rings stop
  const pk=eio((t-16.5)/.5); let bx=mix(540,190,pk), by=mix(900,960,pk);
  let bs=mix(bk,200/300,pk)*(1-.08*bump(t,13.42,.2))*(1+.12*bump(t,15.25,.32));
  const btnO=t<12.7?0:(t<20.9?1:1-ease((t-20.9)/.2)); if(t>=20.9) bs*=mix(1,.8,ease((t-20.9)/.2));
  vis($('btn'),btnO,'translate('+bx+'px,'+by+'px) scale('+bs.toFixed(4)+')');
  for(let i=0;i<4;i++){ const r=$('r'+i); const ph=((t-13.6)/1.6-i*.25); const u=ph-Math.floor(ph); const on=t>=13.6&&t<15.6;
    const sz=mix(300,980,u); r.style.width=sz+'px'; r.style.height=sz+'px'; r.style.marginLeft=(-sz/2)+'px'; r.style.marginTop=(-sz/2)+'px'; vis(r,on?(1-u)*.85*cl((t-13.6)/.4)*(1-ease((t-15.25)/.3)):0); }
  const bc=$('bcap'); const found=t>=15.25; const cap=found?'<b>HARBOR DOGS #101</b> — found ✓':'Scanning the stand poster…'; if(bc.dataset.c!==cap){ bc.dataset.c=cap; bc.innerHTML=cap; }
  const c0=found?15.25:13.75; vis(bc,t>=13.75&&t<16.7?cl((t-c0)/.25)*(found?1:1-ease((t-15.05)/.2))*(1-ease((t-16.3)/.3)):0,'translateY('+(20*(1-ease((t-c0)/.4))).toFixed(1)+'px)');
  // ---------------- S7 16.5–20.9: the pill grows from the button: the wordmark, then the walk (two ✓, one ✕)
  const pill=$('pill'); const pw=mix(200,880,eio((t-16.98)/.7)); const pOn=t>=16.98&&t<20.9;
  pill.style.width=pw+'px'; vis(pill,pOn?1:0);
  const bad=cl((t-20.1)/.25); pill.style.boxShadow='0 30px 80px rgba(5,10,60,.45),0 0 0 '+(10*bad*(.7+.3*Math.sin((t-20.1)*9))).toFixed(1)+'px rgba(229,56,59,.85)';
  vis($('pWord'),t<18.55?cl((t-17.35)/.3):1-ease((t-18.55)/.25),'translateX('+(40*(1-ease((t-17.35)/.45))-60*ease((t-18.55)/.3)).toFixed(1)+'px)');
  for(let i=0;i<3;i++){ const r0=18.8+i*.65, r1=i<2?r0+.65:99; const ki=ease((t-r0)/.3), ko=ease((t-r1)/.25);
    vis($('pr'+i),t>=r0&&t<r1+.25?ki*(1-ko):0,'translateY('+(70*(1-ki)-70*ko).toFixed(1)+'px)'); }
  const lab=$('pLab'); const lt=t>=20.1?'1 PROBLEM FOUND':'THE WALK'; if(lab.dataset.c!==lt){ lab.dataset.c=lt; lab.textContent=lt; } lab.style.color=t>=20.1?'#FFC2C4':'rgba(255,255,255,.92)';
  vis(lab,t>=18.6&&t<21.1?cl((t-18.6)/.3)*(1-ease((t-20.9)/.2)):0,'translateY('+(780+20*(1-ease((t-18.6)/.4))).toFixed(1)+'px)');
  // ---------------- the pill becomes the card (one white shape grows); the card holds ~3 s
  const mk=eio((t-20.9)/.6); const card=$('card'); const cOn=t>=20.9&&t<26.0;
  card.style.left=mix(90,70,mk)+'px'; card.style.top=mix(860,700,mk)+'px'; card.style.width=mix(880,940,mk)+'px'; card.style.height=mix(200,470,mk)+'px'; card.style.borderRadius=mix(100,56,mk)+'px';
  vis(card,cOn?1:0);
  vis($('cThumb'),cl((t-21.05)/.2),'scale('+(.85+.15*spring(t-21.05,.5,.7)).toFixed(3)+')');
  ['cT1','cT2','cT3'].forEach((id,i)=>vis($(id),cl((t-21.15-i*.12)/.22),'translateX('+(30*(1-ease((t-21.15-i*.12)/.4))).toFixed(1)+'px)'));
  vis($('cSteps'),cl((t-21.7)/.3));
  $('s1').className=t>=21.8?'st on':'st'; $('s1').style.transform='scale('+(1+.1*bump(t,21.8,.3))+')';
  $('l1').style.width=(100*ease((t-22.2)/.6))+'%';
  $('s2').className=t>=22.8?'st go':'st'; $('s2').style.transform='scale('+(1+.1*bump(t,22.8,.3))+')';
  $('l2').style.width=t>=22.8?((12+6*Math.sin((t-22.8)*3))+'%'):'0%';
  // ---------------- S8 25.0–32.4: the real app. The crew's phone (the AFTER photo), then the inspector's ✅ Fixed card
  const ap=$('apps'); const aIn=eio((t-25.0)/.8), sk=eio((t-28.0)/.6), aOut=ease((t-32.0)/.4);
  vis(ap,t>=25.0&&t<32.45?1:0);
  if(t>=25.0&&t<32.45){
    const pc=$('phC'), px=$('phX'); const pwS=PWs(), phS=PHs();
    // crew phone: centre (k6), then back-left and dimmed
    const cL=mix((W-pwS)/2+30,D.PX-150,sk), cT=mix(D.PY+130,D.PY+250,sk);
    pc.style.left=cL+'px'; pc.style.top=cT+'px';
    pc.style.transform='translateX('+(W*(1-aIn)*1.1).toFixed(1)+'px) rotate('+mix(3-1.5*Math.sin(t*.7),-9,sk).toFixed(2)+'deg) translateY('+(8*Math.sin(t*1.1)*(1-sk)).toFixed(1)+'px) scale('+(mix(1,.84,sk)*(1-.1*aOut)).toFixed(4)+')';
    pc.style.filter='brightness('+mix(1,.6,sk).toFixed(3)+')'; pc.style.opacity=(1-aOut).toFixed(3);
    const im=$('imC'), src=crewSrc(t); if(im.dataset.s!==src){ im.dataset.s=src; im.src=src; } imgs.push(im);
    // the inspector's phone slides in from the right to the front
    const dim=mix(1,.6,cl((t-29.2)/.3))*mix(1,1/.6,cl((t-31.7)/.3));
    px.style.left=(D.PX+150)+'px'; px.style.top=(D.PY+100)+'px';
    px.style.transform='translateX('+(W*(1-sk)).toFixed(1)+'px) rotate('+(4-2*Math.sin(t*.6)).toFixed(2)+'deg) translateY('+(8*Math.sin(t*1.1)).toFixed(1)+'px) scale('+(1-.1*aOut).toFixed(4)+')';
    px.style.filter='brightness('+dim.toFixed(3)+')'; px.style.opacity=(1-aOut).toFixed(3); vis(px,t>=28.0?1-aOut:0);
    // BEFORE / AFTER pulled out of the card's thumbnails, big; a FIXED stamp on the AFTER
    for(const [id,mkId,t0,L,Tp,rot] of [['bigB','mkB',29.2,80,560,-3],['bigA','mkA',29.45,310,1040,2.5]]){
      const el=$(id); el.style.left=L+'px'; el.style.top=Tp+'px'; const k=spring(t-t0,.6,.75), o=ease((t-31.7)/.3);
      const [mx,my]=ctr($(mkId)); const dx=mx-(L+300), dy=my-(Tp+226);
      vis(el,t>=t0&&t<32.0?cl((t-t0)/.12)*(1-o):0,'translate('+(dx*(1-k)).toFixed(1)+'px,'+(dy*(1-k)).toFixed(1)+'px) rotate('+(rot*k).toFixed(2)+'deg) scale('+(mix(.12,1,k)*(1-.08*o)).toFixed(4)+')'); }
    const st=$('stampF'); st.style.left='800px'; st.style.top='1060px'; const sk2=spring(t-30.0,.45,.5);
    vis(st,t>=30.0&&t<32.0?1-ease((t-31.7)/.3):0,'rotate('+mix(-30,-8,cl((t-30)/.3)).toFixed(1)+'deg) scale('+(mix(2.2,1,cl((t-30)/.18))*(.9+.1*sk2)).toFixed(3)+')');
  }
  kin('k6',25.55,27.95,t,{dy:30}); kin('k7',28.5,31.95,t,{dy:30});
  // ---------------- S9 32.6–36.3: taglines
  kin('k8',32.6,33.75,t); kin('k9',33.9,35.05,t); kin('k10',35.2,36.3,t);
  // ---------------- S10 36.45–42: the big logo, the line, the lockup
  const lk=spring(t-36.45,.65,.6); vis($('bigLogo'),t>=36.4&&t<39.6?(1-ease((t-39.25)/.3)):0,'translateY('+(-120*ease((t-36.95)/.5)).toFixed(1)+'px) scale('+lk.toFixed(3)+')');
  kin('k11',37.15,39.25,t,{stag:.1});
  const ek=spring(t-39.5,.7,.78); vis($('endc'),t>=39.45?cl((t-39.45)/.25):0,'translateY('+(100*(1-ek)).toFixed(1)+'px) scale('+(.92+.08*ek).toFixed(3)+')');
  await Promise.all(imgs.map(im=>im.complete&&im.naturalWidth?0:new Promise(r=>{ im.onload=()=>r(); im.onerror=()=>r(); setTimeout(r,3000); })));
};
function PWs(){ return $('phC').offsetWidth; } function PHs(){ return $('phC').offsetHeight; }
</script>`;
writeFileSync(`${OUT}/stage.html`, html);

const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--no-sandbox', '--allow-file-access-from-files'] });
const p = await b.newPage({ viewport: { width: W, height: H } });
p.on('pageerror', e => console.log('PAGEERR', e.message));
await p.goto(`file://${OUT}/stage.html`); await p.evaluate(() => document.fonts.ready); await p.waitForTimeout(200);
const at = opt('at');
rmSync(`${OUT}/f`, { recursive: true, force: true }); mkdirSync(`${OUT}/f`, { recursive: true });
const frames = at ? at.split(',').map(s => Math.round(+s * FPS)) : [...Array(N).keys()];
const t0 = Date.now();
for (const f of frames) {
  await p.evaluate(n => window.render(n), f);
  await p.screenshot({ path: `${OUT}/f/${String(f).padStart(5, '0')}.jpg`, type: 'jpeg', quality: at ? 80 : 92 });
  if (!at && f % 150 === 0) console.log(`  frame ${f}/${N} · ${((Date.now() - t0) / 1000).toFixed(0)} s`);
}
await b.close();
if (at) { console.log('stills in', OUT + '/f'); process.exit(0); }

// ---- sound: 112 bpm. A pad on the whole piece, hats from "Find it on the walk" (3.3), a soft kick from the hit on
// "scan" (5.35) to the lockup, a plucked arpeggio while the blue screen runs, a riser into the zoom, an impact as the
// zoom turns into the blue screen, key clicks while it types, the tap, a ping when the button appears, ring pulses,
// a chime when the stand is found, ticks for the walk, a low note for the problem, pops for the photos, a chime at the end.
const BPM = 112, BEAT = 60 / BPM;
const pad = `0.05*(sin(2*PI*110*t)+sin(2*PI*138.6*t)+sin(2*PI*164.8*t)+0.6*sin(2*PI*220*t))*(0.6+0.4*sin(2*PI*0.09*t))`;
const kick = `0.34*sin(2*PI*(45+80*exp(-28*mod(t,${BEAT.toFixed(5)})))*mod(t,${BEAT.toFixed(5)}))*exp(-8*mod(t,${BEAT.toFixed(5)}))*gte(t,5.35)*lt(t,39.4)`;
const arp = `0.07*sin(2*PI*(440*pow(2,floor(mod(t*${(BPM / 30).toFixed(4)},4))*3/12))*t)*exp(-9*mod(t,${(BEAT / 2).toFixed(5)}))*gte(t,9.85)*lt(t,25.0)`;
const at1 = (s, f, a = 0.4, k = 70) => `${a}*sin(2*PI*${f}*(t-${s.toFixed(3)}))*exp(-${k}*max(t-${s.toFixed(3)},0))*gte(t,${s.toFixed(3)})`;
const keys = [...Array(TWN).keys()].map(i => at1(10.15 + i / 17, 3200 + (i % 3) * 300, 0.12, 120)).join('+');
const events = [at1(5.35, 55, 0.6, 6), at1(8.3, 2400, 0.35), at1(9.85, 60, 0.6, 5), at1(12.7, 1568, 0.2, 6), at1(13.48, 2400, 0.5),
  at1(15.25, 1318.5, 0.24, 4), at1(15.25, 1975.5, 0.14, 4), at1(18.8, 1046.5, 0.16, 12), at1(19.45, 1046.5, 0.16, 12), at1(20.1, 311, 0.3, 5), at1(20.1, 233, 0.22, 5),
  at1(21.8, 880, 0.25, 6), at1(22.8, 1318.5, 0.18, 5), at1(29.2, 1568, 0.15, 8), at1(29.45, 1976, 0.15, 8), at1(30.0, 1318.5, 0.22, 4), at1(30.0, 1760, 0.16, 4),
  at1(39.5, 1318.5, 0.2, 2.5), at1(39.5, 1975.5, 0.12, 2.5)].join('+');
const rings = `0.05*sin(2*PI*220*t)*(0.5+0.5*sin(2*PI*t/1.6))*gte(t,13.6)*lt(t,15.3)`;
const wh = [3.1, 5.0, 6.75, 12.3, 16.45, 20.85, 24.95, 27.95, 32.4, 36.35].map(s => `between(t,${s.toFixed(2)},${(s + .45).toFixed(2)})*sin(PI*(t-${s.toFixed(2)})/0.45)`).join('+');
const riser = `between(t,8.9,9.85)*pow((t-8.9)/0.95,2)`;
const out = `${DIR}out/showcase-reel.mp4`;
execFileSync(FF, ['-loglevel', 'error', '-y', '-framerate', String(FPS), '-i', `${OUT}/f/%05d.jpg`,
  '-f', 'lavfi', '-i', `aevalsrc='${pad}+${kick}+${arp}+${rings}':s=48000:d=${T.toFixed(2)}`,
  '-f', 'lavfi', '-i', `aevalsrc='${keys}+${events}':s=48000:d=${T.toFixed(2)}`,
  '-f', 'lavfi', '-i', `anoisesrc=d=${T.toFixed(2)}:c=pink:a=0.5:r=48000`,
  '-f', 'lavfi', '-i', `anoisesrc=d=${T.toFixed(2)}:c=white:a=0.5:r=48000:seed=3`,
  '-filter_complex', `[3:a]volume='0.32*(${wh})':eval=frame,highpass=f=500,lowpass=f=6500[w];[4:a]volume='0.10*(${riser})+0.025*gte(t,3.3)*lt(t,39.4)*exp(-30*mod(t,${(BEAT / 2).toFixed(5)}))':eval=frame,highpass=f=5000[h];[1:a][2:a][w][h]amix=inputs=4:normalize=0,afade=t=in:d=0.2,afade=t=out:st=${(T - 1.4).toFixed(2)}:d=1.4,loudnorm=I=-14:TP=-1.5:LRA=9,aformat=sample_rates=48000:channel_layouts=stereo[a]`,
  '-map', '0:v', '-map', '[a]', '-c:v', 'libx264', '-preset', 'slow', '-crf', '17', '-maxrate', '7M', '-bufsize', '14M', '-pix_fmt', 'yuv420p', '-profile:v', 'high', '-g', '60', '-r', String(FPS),
  '-c:a', 'aac', '-b:a', '160k', '-movflags', '+faststart', '-shortest', out]);
console.log('showcase', out, T.toFixed(1) + ' s', N + ' frames', ((Date.now() - t0) / 1000).toFixed(0) + ' s');
