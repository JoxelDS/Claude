// node showcase.mjs [--at 1,5,12]  → out/showcase-reel.mp4 (1080×1920, 30 fps, AAC)
// "SDX Inspect, in motion": a full-screen motion-design piece (no monitor, no desk) in the rhythm of an
// app-launch animation — a glowing dot and the problem, "Find it in seconds", "Just scan it", a phone home
// screen that zooms into the SDX icon, a full-blue screen that types the question, a tap, the logo button with
// pulse rings, a pill that grows into the wordmark, a live temperature line, the result card, the real app on
// phones (the crew's AFTER photo, the inspector's ✅ Fixed view), taglines, the lockup.
// Everything is ours: the SDX mark, generic drawn icons (no real brands), the demo venue's made-up stand
// (HARBOR DOGS #101), our own sample photos, the real app recorded by pov.mjs. Same method as motion.mjs:
// every frame is a pure function of t rendered in Chromium; the sound is synthesized.
import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync, rmSync } from 'fs';
import { execFileSync } from 'child_process';
import { chromium } from '/home/user/Claude/node_modules/playwright-core/index.mjs';
import { TEAL, C, fontCss, mark, lockup } from './sdxmark.mjs';
const FF = process.env.FFMPEG || '/tmp/ff/node_modules/ffmpeg-static/ffmpeg';
const DIR = new URL('.', import.meta.url).pathname;
const args = process.argv.slice(2);
const opt = k => { const i = args.indexOf('--' + k); return i >= 0 ? args[i + 1] : null; };
const FPS = 30, T = 44.5, N = Math.round(T * FPS), W = 1080, H = 1920;
const OUT = `${DIR}out/showcase`; mkdirSync(OUT, { recursive: true });
const b64 = f => 'data:image/jpeg;base64,' + readFileSync(f).toString('base64');

// real app frames on the phones (scene 8)
const SEQ = [
  { id: 'fix', clip: 'fixed', from: 2.8, to: 8.6, a: 27.0, b: 32.4 },
  { id: 'crew', clip: 'crew', from: 12.9, to: 16.8, a: 27.0, b: 31.2 },
];
for (const s of SEQ) {
  s.sp = (s.to - s.from) / (s.b - s.a);
  const seq = `${OUT}/seq_${s.id}`, stamp = `${seq}/w_${s.clip}_${s.from}_${s.to}`;
  if (!existsSync(stamp)) {
    rmSync(seq, { recursive: true, force: true }); mkdirSync(seq, { recursive: true });
    execFileSync(FF, ['-loglevel', 'error', '-y', '-ss', String(s.from), '-i', `${DIR}out/pov_${s.clip}/master.mp4`, '-t', String(s.to - s.from + 0.2), '-vf', `fps=${FPS},scale=720:-2:flags=lanczos`, '-q:v', '3', `${seq}/%05d.jpg`]);
    writeFileSync(stamp, '');
  }
  s.seq = seq; s.n = readdirSync(seq).filter(f => f.endsWith('.jpg')).length;
}
const PIC = { grease: b64(`${DIR}pics/grease.jpg`), after: b64(`${DIR}pics/after.jpg`), hood: b64(`${DIR}pics/hood.jpg`) };

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
  ? `<div class="ic" id="sdxIcon">${mark(150)}</div>`
  : `<div class="ic" style="background:linear-gradient(160deg,${bg},${bg}cc)"><svg viewBox="0 0 100 100" width="100%" height="100%">${GLYPH[g]}</svg></div>`;

const css = `${fontCss(DIR)}@font-face{font-family:M;font-weight:800;src:url(file://${DIR}fonts/Montserrat-800.woff2)}
*{margin:0;box-sizing:border-box} html,body{width:${W}px;height:${H}px;overflow:hidden;background:#000;font-family:I,Arial;-webkit-font-smoothing:antialiased;color:#fff}
.layer{position:absolute;inset:0;overflow:hidden}
#dark{background:#02040B}
.blob{position:absolute;border-radius:50%;pointer-events:none}
#d1{width:1300px;height:1300px;background:radial-gradient(closest-side,rgba(40,80,255,.55),rgba(40,80,255,0))}
#d2{width:1200px;height:1200px;background:radial-gradient(closest-side,rgba(20,140,255,.42),rgba(20,140,255,0))}
#d3{width:900px;height:900px;background:radial-gradient(closest-side,rgba(51,195,176,.30),rgba(51,195,176,0))}
#blue{background:linear-gradient(160deg,#3D5BFF 0%,#2340E8 45%,#1A2FC4 100%)}
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
#sdxIcon svg{width:100%!important;height:100%!important}
#dock{position:absolute;left:28px;right:28px;bottom:28px;height:150px;border-radius:52px;background:rgba(255,255,255,.18);display:grid;grid-template-columns:repeat(4,1fr);column-gap:30px;padding:24px 34px}
#tapR{position:absolute;width:130px;height:130px;margin:-65px 0 0 -65px;border-radius:50%;border:8px solid #fff;opacity:0}
#flash{position:absolute;inset:0;background:#fff;opacity:0}
#tw{position:absolute;left:70px;right:70px;top:830px;text-align:center;font-family:M,I;font-weight:800;font-size:84px;letter-spacing:-2px;line-height:1.1;white-space:pre-wrap}
#tw .hb{color:#0B1240} #caret{display:inline-block;width:8px;height:84px;margin-left:6px;vertical-align:-12px;background:#fff}
#cursor{position:absolute;left:0;top:0;width:96px;height:120px;filter:drop-shadow(0 10px 20px rgba(0,0,0,.35))}
.ring{position:absolute;left:540px;top:900px;border-radius:50%;border:3px solid rgba(255,255,255,.55);background:radial-gradient(closest-side,rgba(255,255,255,.08),rgba(255,255,255,0));transform-origin:50% 50%}
#btn{position:absolute;z-index:3;left:0;top:0;width:300px;height:300px;margin:-150px 0 0 -150px;border-radius:50%;background:#fff;display:flex;align-items:center;justify-content:center;box-shadow:0 30px 80px rgba(5,10,60,.45)}
#btn svg{width:170px;height:170px}
#bcap{position:absolute;left:0;right:0;top:1160px;text-align:center;font-weight:700;font-size:44px;color:rgba(255,255,255,.86)}
#bcap b{color:#fff}
#pill{position:absolute;left:0;top:0;height:200px;border-radius:100px;background:#fff;overflow:hidden;box-shadow:0 30px 80px rgba(5,10,60,.45)}
#pWord{position:absolute;left:214px;top:0;height:200px;display:flex;align-items:center;font-family:M;font-weight:800;font-size:70px;letter-spacing:-1px;color:${C.navy};white-space:nowrap}
#pWord i{font-style:normal;color:${TEAL}}
#pGraph{position:absolute;left:200px;top:0;width:520px;height:200px}
#pAlert{position:absolute;top:30px;width:140px;height:140px;border-radius:50%;background:#E5383B;display:flex;align-items:center;justify-content:center;font-family:M;font-weight:800;font-size:40px;color:#fff;box-shadow:0 10px 30px rgba(229,56,59,.45)}
#pLab{position:absolute;left:0;right:0;top:0;text-align:center;font-weight:800;font-size:34px;letter-spacing:6px;color:rgba(255,255,255,.9)}
#card{position:absolute;left:70px;width:940px;border-radius:56px;background:#fff;overflow:hidden;box-shadow:0 40px 100px rgba(5,10,60,.5);color:${C.ink}}
#cThumb{position:absolute;left:44px;top:44px;width:250px;height:250px;border-radius:30px;overflow:hidden}
#cThumb img{width:100%;height:100%;object-fit:cover}
#cThumb b{position:absolute;left:12px;bottom:12px;background:#E5383B;color:#fff;font-size:22px;font-weight:800;letter-spacing:2px;padding:6px 12px;border-radius:10px}
#cT1{position:absolute;left:330px;top:60px;font-family:M;font-weight:800;font-size:50px;letter-spacing:-1px;color:${C.navy};white-space:nowrap}
#cT2{position:absolute;left:330px;top:136px;font-weight:700;font-size:34px;color:#C92A2A;white-space:nowrap}
#cT3{position:absolute;left:330px;top:200px;display:inline-flex;align-items:center;gap:10px;font-weight:700;font-size:28px;color:#5E6283;background:#F1F3F9;border-radius:999px;padding:12px 22px;white-space:nowrap}
#cSteps{position:absolute;left:44px;right:44px;top:340px;display:flex;align-items:center;gap:16px}
.st{display:flex;align-items:center;gap:12px;font-weight:800;font-size:30px;color:#9AA0BF;white-space:nowrap}
.st i{width:40px;height:40px;border-radius:50%;border:4px solid #C9CEE3;display:inline-flex;align-items:center;justify-content:center;font-style:normal;font-size:24px;color:#fff}
.st.on{color:${C.navy}} .st.on i{background:#E5383B;border-color:#E5383B}
.st.ok{color:#15803D} .st.ok i{background:#15803D;border-color:#15803D}
.sl{flex:1;height:5px;border-radius:3px;background:#E3E6F0;position:relative;overflow:hidden} .sl b{position:absolute;left:0;top:0;bottom:0;background:#15803D}
.ph{position:absolute;border-radius:${Math.round(PW * 0.15 * .92)}px;padding:${Math.round(PB * .92)}px;background:linear-gradient(145deg,#D7DBEC,#4A4F6B 55%,#C9CEE3);box-shadow:0 0 0 2px rgba(255,255,255,.2) inset,0 50px 120px rgba(0,0,0,.65);transform-origin:50% 50%}
.ph .s{position:relative;width:100%;height:100%;border-radius:${Math.round((PW * 0.15 - PB) * .92)}px;overflow:hidden;background:#fff}
.ph img{position:absolute;inset:0;width:100%;height:100%;object-fit:cover;object-position:top}
#mini{position:absolute;width:120px;height:120px;border-radius:50%;background:#fff;display:flex;align-items:center;justify-content:center;box-shadow:0 0 60px rgba(60,110,255,.55)}
#mini svg{width:70px;height:70px}
.tile{position:absolute;width:300px;height:380px;border-radius:34px;overflow:hidden;box-shadow:0 30px 80px rgba(0,0,0,.6)}
.tile img{width:100%;height:100%;object-fit:cover}
.tile b{position:absolute;left:16px;bottom:16px;font-weight:800;font-size:28px;letter-spacing:2px;padding:8px 14px;border-radius:12px;color:#fff}
#endc{position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center}
#epill{margin-top:56px;background:${TEAL};color:#06231F;font-weight:800;font-size:46px;padding:22px 46px;border-radius:999px}
#ehandle{font-weight:700;font-size:40px;color:#AEB4E6;margin-top:28px}
#bigLogo{position:absolute;left:540px;top:820px;width:260px;height:260px;margin:-130px 0 0 -130px}
#bigLogo svg{width:100%;height:100%}
#vig{position:absolute;inset:0;background:radial-gradient(1200px 1700px at 50% 45%,transparent 60%,rgba(0,0,0,.45));pointer-events:none}`;

// kinetic lines: [id, html with <h>…</h> highlights, cls, top, size]
const KIN = [
  ['k1', 'A cooler at <h>50°F.</h>', 'hr', 790, 100], ['k2', 'The fix? <h>No proof.</h>', 'hr', 920, 100],
  ['k3', 'Find it in <h>seconds.</h>', 'hl', 860, 116],
  ['k4', 'Just <h>scan</h> it.', 'hl', 850, 150],
  ['k5', 'Tap to start', '', 860, 96],
  ['k6', 'Crew sends the <h>AFTER.</h>', 'hl', 250, 72], ['k7', 'Fixed — <h>with proof.</h>', 'hl', 250, 72],
  ['k8', 'Find problems\n<h>on the walk</h>', 'hl', 860, 92], ['k9', 'Fix them <h>with proof</h>', 'hl', 860, 92], ['k10', 'At every <h>stand</h>', 'hl', 860, 92],
  ['k11', 'Walk it.\nFix it.\n<h>Prove it.</h>', 'hl', 900, 118],
];
const kinHtml = ([id, h, cls, top, size]) => `<div class="kin" id="${id}" style="top:${top}px;font-size:${size}px">${h.split(/(<h>.*?<\/h>)/).filter(Boolean).map(seg => {
  const hi = seg.startsWith('<h>'); const txt = seg.replace(/<\/?h>/g, '');
  return txt.split(/(\s+)/).filter(x => x.length).map(w => /\n/.test(w) ? '<br>' : /^\s+$/.test(w) ? '<span> </span>' : `<span${hi ? ` class="${cls || 'hl'}"` : ''}>${w}</span>`).join('');
}).join('')}</div>`;
const CHECK = mark(170);

const html = `<!doctype html><meta charset=utf-8><style>${css}</style>
<div class="layer" id="dark"><div class="blob" id="d1"></div><div class="blob" id="d2"></div><div class="blob" id="d3"></div></div>
<div class="layer" id="blue"><div class="blob" id="u1"></div><div class="blob" id="u2"></div>
  ${[0, 1, 2, 3].map(i => `<div class="ring" id="r${i}"></div>`).join('')}
  <div id="btn">${CHECK}</div><div id="bcap"></div>
  <div id="pLab">2-DOOR COOLER</div>
  <div id="pill"><div id="pWord">SDX <i>&nbsp;INSPECT</i></div>
    <svg id="pGraph" viewBox="0 0 520 200"><line x1="10" y1="118" x2="510" y2="118" stroke="#9AA0BF" stroke-width="3" stroke-dasharray="10 10"/><text x="12" y="108" font-size="22" font-weight="700" fill="#9AA0BF" font-family="I">40°F</text><polyline id="gLine" fill="none" stroke-width="9" stroke-linecap="round" stroke-linejoin="round"/></svg>
    <div id="pAlert">50°</div></div>
  <div id="card"><div id="cThumb"><img src="${PIC.grease}"><b>BEFORE</b></div><div id="cT1">HARBOR DOGS #101</div><div id="cT2">2-door cooler · 50°F, too warm</div><div id="cT3">⚠ Flagged on the walk · photo added</div>
    <div id="cSteps"><div class="st" id="s1"><i>!</i>Flagged</div><div class="sl"><b id="l1"></b></div><div class="st" id="s2"><i>✓</i>Crew</div><div class="sl"><b id="l2"></b></div><div class="st" id="s3"><i>✓</i>Fixed</div></div></div>
  <div id="tw"></div>
  <svg id="cursor" viewBox="0 0 48 60"><path d="M4 2 L4 46 L15 35 L23 54 L31 50 L23 32 L40 32 Z" fill="#fff" stroke="#0B1240" stroke-width="3" stroke-linejoin="round"/></svg>
</div>
<div class="layer" id="phLayer"><div id="phoneCam"><div id="phone"><div id="scr"><div id="isl"></div><div id="sbar"><span>9:41</span><span>●●● ▴ ▮</span></div>
  <div id="grid">${ICONS.map(icon).join('')}</div><div id="dock">${DOCK.map(icon).join('')}</div><div id="tapR"></div></div></div></div><div id="flash"></div></div>
<div class="layer" id="apps">
  <div class="ph" id="phB" style="width:${Math.round(PW * .74)}px;height:${Math.round(PH * .74)}px"><div class="s"><img id="imB"></div></div>
  <div class="ph" id="phF" style="width:${Math.round(PW * .88)}px;height:${Math.round(PH * .88)}px"><div class="s"><img id="imF"></div></div>
</div>
<div class="layer" id="txt">
  <div id="dot"></div>
  ${KIN.map(kinHtml).join('')}
  <div id="mini">${mark(70)}</div>
  <div class="tile" id="t1"><img src="${PIC.grease}"><b style="background:#E5383B">BEFORE</b></div>
  <div class="tile" id="t2"><img src="${PIC.after}"><b style="background:#15803D">AFTER</b></div>
  <div class="tile" id="t3" style="background:linear-gradient(160deg,#2A295C,#1A2FC4);display:flex;flex-direction:column;align-items:center;justify-content:center;gap:26px">${mark(150)}<b style="position:static;background:#15803D">✓ FIXED</b></div>
  <div id="bigLogo">${mark(260)}</div>
  <div id="endc"><div id="elock">${lockup(170)}</div><div id="epill">Free 30-day pilot · DM PILOT</div><div id="ehandle">@sdxinspection</div></div>
</div>
<div id="vig"></div>
<script>
const W=${W},PW=${PW},PH=${PH};const D=${JSON.stringify({ FPS, SEQ: SEQ.map(s => ({ id: s.id, a: s.a, b: s.b, sp: s.sp, n: s.n, seq: s.seq })), PX, PY, PW, PH })};
const $=id=>document.getElementById(id);
const cl=(x,a=0,b=1)=>Math.min(b,Math.max(a,x));
function spring(t,r=0.5,z=0.82){ if(t<=0) return 0; const w=2*Math.PI/r, wd=w*Math.sqrt(1-z*z); return 1-Math.exp(-z*w*t)*(Math.cos(wd*t)+(z*w/wd)*Math.sin(wd*t)); }
const ease=t=>t<=0?0:t>=1?1:1-Math.pow(1-t,3);
const ein=t=>t<=0?0:t>=1?1:t*t*t;
const eio=t=>t<=0?0:t>=1?1:(t<.5?4*t*t*t:1-Math.pow(-2*t+2,3)/2);
const mix=(a,b,k)=>a+(b-a)*k;
const vis=(el,o,tf)=>{ el.style.opacity=o; el.style.visibility=o>0.002?'visible':'hidden'; if(tf!=null) el.style.transform=tf; };
// a kinetic line: words rise in with a blur, one after the other; out with a blur, all together
function kin(id,t0,t1,t,{stag=.07,dy=46,out=.28}={}){ const el=$(id); if(t<t0-.05||t>t1+out){ vis(el,0); return; } vis(el,1);
  [...el.querySelectorAll('span')].forEach((s,i)=>{ const u=t-t0-i*stag, k=spring(u,.55,.78), o=ease((t-t1)/out);
    s.style.opacity=(cl(u/.16)*(1-o)).toFixed(3); s.style.transform='translateY('+(dy*(1-k)-30*o).toFixed(1)+'px) scale('+(s.className?(1+.25*(1-k)):1).toFixed(3)+')'; s.style.filter='blur('+(12*(1-cl(u/.28))+14*o).toFixed(2)+'px)'; }); }
// typewriter with a caret
const TW1='What needs\\n<b class="hb">checking</b> today?';
function tw(t){ const el=$('tw'); const t0=11.55, t1=13.65;
  if(t<11.3||t>t1+.3){ vis(el,0); return; } vis(el,1-ease((t-t1)/.3));
  const plain=TW1.replace(/<[^>]+>/g,''); const n=Math.max(0,Math.min(plain.length,Math.floor((t-t0)*17)));
  let out='', c=0; for(const part of TW1.split(/(<b class="hb">|<\\/b>)/)){ if(part==='<b class="hb">'){ out+=part; continue; } if(part==='</b>'){ out+='</b>'; continue; }
    const take=Math.max(0,Math.min(part.length,n-c)); out+=part.slice(0,take); c+=part.length; }
  const blink=(Math.floor(t*2.2)%2===0)||n<plain.length; el.innerHTML=out+'<span id="caret" style="opacity:'+(blink?1:0)+'"></span>'; }
// the SDX icon's centre on the untransformed home screen (for the zoom into it)
const IC=(()=>{ const r=$('sdxIcon').getBoundingClientRect(); return { x:r.left+r.width/2, y:r.top+r.height/2, w:r.width }; })();
const frameSrc=(s,t)=>'file://'+s.seq+'/'+String(Math.max(1,Math.min(s.n,Math.floor(cl(t-s.a,0,s.b-s.a)*s.sp*D.FPS)+1))).padStart(5,'0')+'.jpg';
window.render=async f=>{
  const t=f/D.FPS; const imgs=[];
  // ---------------- backgrounds: dark (0–11, 26.6–end), blue (11–26.9, slides out left at 26.6)
  const drift=(id,ax,ay,px,py,s)=>{ $(id).style.transform='translate('+(ax+px*Math.sin(t*s)).toFixed(0)+'px,'+(ay+py*Math.cos(t*s*.83)).toFixed(0)+'px)'; };
  drift('d1',-520,-380,160,120,.23); drift('d2',380,980,140,160,.19); drift('d3',-200,1250,120,90,.27);
  const darkGlow=t<11?cl((t-.2)/1.2):cl((t-26.6)/.8);
  $('d1').style.opacity=darkGlow*(t<3.6?.55+.45*cl((t-1)/2):1); $('d2').style.opacity=darkGlow; $('d3').style.opacity=darkGlow*.9;
  const blueOn=t>=10.98&&t<27.6; const bOut=eio((t-26.6)/.8);
  vis($('blue'),blueOn?1:0,'translateX('+(-W*bOut).toFixed(1)+'px)');
  drift('u1',-450,-300,120,90,.21); drift('u2',300,1100,140,120,.25);
  // ---------------- S1 0–3.6: the dot, then the problem
  const dk=spring(t-.15,.6,.6); const dotX=540, dotY=mix(960,812,ease((t-.95)/.35));
  const dotO=t<.15?0:(t<1.3?1:1-ease((t-1.3)/.25));
  $('dot').style.left=dotX+'px'; $('dot').style.top=dotY+'px'; vis($('dot'),dotO,'scale('+(dk*(1+.15*Math.sin(t*7))).toFixed(3)+')');
  kin('k1',1.05,3.2,t); kin('k2',1.75,3.2,t);
  // ---------------- S2 / S3
  kin('k3',3.65,5.35,t,{stag:.09}); kin('k4',5.65,7.3,t,{stag:.12,dy:60});
  // ---------------- S4 7.6–11.1: the phone rises, a tap on the SDX icon, the zoom into it, a flash
  const pin=spring(t-7.55,.75,.78); const zk=ein((t-10.05)/.95);
  const lay=$('phLayer'); vis(lay,t>=7.5&&t<11.15?1:0);
  if(t>=7.5&&t<11.15){
    const s=mix(1,26,zk); const cx=mix(540,IC.x,ease(zk*1.4)), cy=mix(960,IC.y,ease(zk*1.4));
    const tilt=mix(26,0,pin), lift=mix(1500,0,pin)+10*Math.sin(t*1.3)*(1-zk);
    $('phoneCam').style.transform='translate('+(540-cx*s).toFixed(1)+'px,'+(960-cy*s+lift).toFixed(1)+'px) scale('+s.toFixed(4)+') perspective(1800px) rotateX('+tilt.toFixed(2)+'deg)';
    $('phoneCam').style.transformOrigin='0 0';
    const tr=$('tapR'); const tk=(t-9.55)/.55; if(tk>=0&&tk<1){ const sr=$('sdxIcon').getBoundingClientRect(); const pr=$('scr').getBoundingClientRect(); const sc=pr.width/${PSW};
      tr.style.left=(IC.x-D.PX-${PB})+'px'; tr.style.top=(IC.y-D.PY-${PB})+'px'; tr.style.opacity=((1-tk)*.95).toFixed(3); tr.style.transform='scale('+(.5+1.1*ease(tk))+')'; } else tr.style.opacity=0;
    $('sdxIcon').style.transform='scale('+(1-.12*Math.sin(Math.PI*cl((t-9.5)/.35))).toFixed(3)+')';
  }
  $('flash').style.opacity=t>=10.7&&t<11.25?(t<10.98?ease((t-10.7)/.28):1-ease((t-10.98)/.27)):0;
  // ---------------- S5 11–16.2: typewriter, "Tap to start", the cursor and its tap, the button appears
  tw(t); kin('k5',13.9,15.05,t,{stag:.08});
  const cu=$('cursor'); if(t>=14.05&&t<15.4){ const ck=ease((t-14.05)/.55); const x=mix(1100,600,ck), y=mix(1500,1010,ck); const press=Math.sin(Math.PI*cl((t-14.7)/.18));
    cu.style.left=x+'px'; cu.style.top=y+'px'; vis(cu,1-ease((t-15.1)/.25),'scale('+(1-.18*press).toFixed(3)+')'); } else vis(cu,0);
  const bk=spring(t-15.25,.6,.62); const bOn=t>=15.2&&t<21.6;
  // ---------------- S6 15.2–20.2: the button with pulse rings; the caption under it
  let bx=540, by=900, bs=bk;
  // S7 20.2–: the button slides left and becomes the head of the pill
  const pk=eio((t-20.2)/.5); bx=mix(540,190,pk); by=mix(900,960,pk); bs=mix(bk,200/300,pk);
  vis($('btn'),bOn?1:0,'translate('+bx+'px,'+by+'px) scale('+bs.toFixed(4)+')');
  for(let i=0;i<4;i++){ const r=$('r'+i); const ph=((t-15.6)/1.6-i*.25); const u=ph-Math.floor(ph); const on=t>=15.6&&t<20.4;
    const sz=mix(300,980,u); r.style.width=sz+'px'; r.style.height=sz+'px'; r.style.marginLeft=(-sz/2)+'px'; r.style.marginTop=(-sz/2)+'px'; vis(r,on?(1-u)*.85*cl((t-15.6)/.4)*(1-ease((t-20.0)/.4)):0); }
  const bc=$('bcap'); const cap=t<18.1?'Scanning the stand poster…':'<b>HARBOR DOGS #101</b> — found ✓'; if(bc.dataset.c!==cap){ bc.dataset.c=cap; bc.innerHTML=cap; }
  vis(bc,t>=16.0&&t<20.3?cl((t-(t<18.1?16.0:18.1))/.3)*(1-ease((t-17.85)/.2)*(t<18.1?1:0))*(1-ease((t-20.0)/.3)):0,'translateY('+(20*(1-ease((t-(t<18.1?16:18.1))/.4))).toFixed(1)+'px)');
  // the pill: grows to the right from the button, shows the wordmark, then the live temperature line
  const pill=$('pill'); const pw=mix(200,880,eio((t-20.68)/.7)); const pOn=t>=20.68&&t<24.2;
  pill.style.width=pw+'px'; pill.style.left='90px'; pill.style.top='860px'; vis(pill,pOn?1:0);
  vis($('pWord'),t<22.0?cl((t-21.05)/.3):1-ease((t-22.0)/.25),'translateX('+(40*(1-ease((t-21.05)/.45))-60*ease((t-22.0)/.3)).toFixed(1)+'px)');
  const gk=cl((t-22.15)/1.25); const pts=[[12,170],[70,160],[130,150],[190,138],[250,124],[310,108],[370,86],[430,62],[490,44]];
  const nseg=gk*(pts.length-1); let pl=[]; for(let i=0;i<pts.length;i++){ if(i<=nseg) pl.push(pts[i]); else { const a=pts[i-1], b=pts[i], k=nseg-(i-1); if(k>0) pl.push([mix(a[0],b[0],k),mix(a[1],b[1],k)]); break; } }
  const gl=$('gLine'); gl.setAttribute('points',pl.map(p=>p.join(',')).join(' ')); gl.setAttribute('stroke',(pl.length&&pl[pl.length-1][1]<118)?'#E5383B':'${TEAL}');
  vis($('pGraph'),t>=22.1?cl((t-22.1)/.2):0);
  const ak=spring(t-23.3,.5,.55); $('pAlert').style.left=(pw-170)+'px'; vis($('pAlert'),t>=23.3?1:0,'scale('+ak.toFixed(3)+')');
  vis($('pLab'),t>=22.1&&t<24.2?cl((t-22.1)/.3)*(1-ease((t-23.9)/.3)):0,'translateY('+(780+20*(1-ease((t-22.1)/.4))).toFixed(1)+'px)');
  // the result card: rises out of the pill
  const ck2=spring(t-24.0,.7,.8); const cOn=t>=24.0&&t<27.6;
  const card=$('card'); card.style.top=mix(860,700,ck2)+'px'; card.style.height=mix(200,470,ck2)+'px'; vis(card,cOn?cl((t-24.0)/.15):0,'scale('+mix(.94,1,ck2).toFixed(4)+')');
  vis($('cThumb'),cl((t-24.35)/.25),'scale('+(.85+.15*spring(t-24.35,.5,.7)).toFixed(3)+')');
  ['cT1','cT2','cT3'].forEach((id,i)=>vis($(id),cl((t-24.45-i*.15)/.25),'translateX('+(30*(1-ease((t-24.45-i*.15)/.4))).toFixed(1)+'px)'));
  vis($('cSteps'),cl((t-24.9)/.3)); $('s1').className='st on'; $('l1').style.width=(100*ease((t-25.3)/.6))+'%';
  $('s2').className=t>=25.9?'st ok':'st'; $('l2').style.width=(100*ease((t-25.95)/.5))+'%'; $('s3').className=t>=26.4?'st ok':'st';
  // ---------------- S8 26.6–32.6: the real app on two phones (the crew's AFTER, the ✅ Fixed view)
  const ap=$('apps'); const aIn=eio((t-26.6)/.8), aOut=ease((t-32.25)/.4);
  vis(ap,t>=26.6&&t<32.7?1:0);
  if(t>=26.6&&t<32.7){
    const fx=mix(W,0,aIn), bW=PW*.86, bH=PH*.86;
    $('phB').style.left=(D.PX-150)+'px'; $('phB').style.top=(D.PY+250)+'px';
    $('phB').style.transform='translateX('+(fx*1.25).toFixed(1)+'px) rotate(-9deg) scale('+(1-.1*aOut)+')'; $('phB').style.opacity=(.88*(1-aOut)).toFixed(3); $('phB').style.filter='brightness(.62)';
    $('phF').style.left=(D.PX+150)+'px'; $('phF').style.top=(D.PY+100)+'px';
    $('phF').style.transform='translateX('+fx.toFixed(1)+'px) rotate('+(4-2*Math.sin(t*.6)).toFixed(2)+'deg) translateY('+(8*Math.sin(t*1.1)).toFixed(1)+'px) scale('+(1-.12*aOut)+')'; $('phF').style.opacity=(1-aOut).toFixed(3);
    const sF=t<29.6?D.SEQ[1]:D.SEQ[0], sB=t<29.6?D.SEQ[0]:D.SEQ[1];
    for(const [id,s,tt] of [['imF',sF,t<29.6?t:t-2.6],['imB',sB,t<29.6?t+1.2:t-2.6]]){ const im=$(id), src=frameSrc(s,s.id==='fix'?Math.max(s.a,tt):tt); if(im.dataset.s!==src){ im.dataset.s=src; im.src=src; } imgs.push(im); }
  }
  kin('k6',27.15,29.45,t,{dy:30}); kin('k7',29.65,32.2,t,{dy:30});
  // ---------------- S9 32.6–38.4: the small logo floats right; taglines; the photo tiles
  const mk=spring(t-32.7,.7,.75); const mi=$('mini');
  mi.style.left=mix(480,830,ease((t-32.7)/1.4))+'px'; mi.style.top=(mix(700,640,ease((t-32.7)/1.4))+10*Math.sin(t*1.4))+'px';
  vis(mi,t>=32.7&&t<38.6?cl((t-32.7)/.25)*(1-ease((t-38.2)/.3)):0,'scale('+mk.toFixed(3)+')');
  kin('k8',32.95,34.25,t); kin('k9',34.45,35.65,t); kin('k10',35.85,36.95,t);
  const TL=[['t1',90,1000,-8],['t2',390,880,3],['t3',690,1020,9]];
  TL.forEach(([id,x,y,r],i)=>{ const tk=spring(t-(37.0+i*.12),.6,.72), conv=eio((t-38.15)/.45);
    const el=$(id); el.style.left=mix(x,390,conv)+'px'; el.style.top=mix(y+260*(1-tk),720,conv)+'px';
    vis(el,t>=37.0+i*.12&&t<38.62?cl((t-(37+i*.12))/.15)*(1-ease((t-38.3)/.3)):0,'rotate('+mix(r,0,conv)+'deg) scale('+mix(tk,.35,conv).toFixed(3)+')'); });
  // ---------------- S10 38.4–43: the big logo, the line, the lockup
  const lk=spring(t-38.45,.65,.6); vis($('bigLogo'),t>=38.4&&t<41.6?(1-ease((t-41.25)/.3)):0,'translateY('+(-120*ease((t-38.95)/.5)).toFixed(1)+'px) scale('+lk.toFixed(3)+')');
  kin('k11',39.15,41.25,t,{stag:.1});
  const ek=spring(t-41.5,.7,.78); vis($('endc'),t>=41.45?cl((t-41.45)/.25):0,'translateY('+(100*(1-ek)).toFixed(1)+'px) scale('+(.92+.08*ek).toFixed(3)+')');
  await Promise.all(imgs.map(im=>im.complete&&im.naturalWidth?0:new Promise(r=>{ im.onload=()=>r(); im.onerror=()=>r(); setTimeout(r,3000); })));
};
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

// ---- sound: 112 bpm. A pad on the whole piece, a soft kick + hats from the phone on (7.6) to the lockup,
// a plucked arpeggio while the blue screen runs, a riser into the zoom, an impact on the blue cut, key clicks
// while it types, a tap, a ping when the button appears, ring pulses, whooshes on scene changes, a chime at the end.
const BPM = 112, BEAT = 60 / BPM;
const pad = `0.05*(sin(2*PI*110*t)+sin(2*PI*138.6*t)+sin(2*PI*164.8*t)+0.6*sin(2*PI*220*t))*(0.6+0.4*sin(2*PI*0.09*t))`;
const kick = `0.34*sin(2*PI*(45+80*exp(-28*mod(t,${BEAT.toFixed(5)})))*mod(t,${BEAT.toFixed(5)}))*exp(-8*mod(t,${BEAT.toFixed(5)}))*gte(t,7.6)*lt(t,41.4)`;
const arp = `0.07*sin(2*PI*(440*pow(2,floor(mod(t*${(BPM / 30).toFixed(4)},4))*3/12))*t)*exp(-9*mod(t,${(BEAT / 2).toFixed(5)}))*gte(t,11.0)*lt(t,26.6)`;
const at1 = (s, f, a = 0.4, k = 70) => `${a}*sin(2*PI*${f}*(t-${s.toFixed(3)}))*exp(-${k}*max(t-${s.toFixed(3)},0))*gte(t,${s.toFixed(3)})`;
const keys = [...Array(26).keys()].map(i => at1(11.55 + i / 17, 3200 + (i % 3) * 300, 0.12, 120)).join('+');
const events = [at1(14.75, 2400, 0.5), at1(15.25, 1568, 0.28, 4), at1(15.25, 2349, 0.16, 4), at1(23.3, 880, 0.3, 6), at1(25.9, 1318, 0.18, 5), at1(26.4, 1760, 0.18, 5),
  at1(41.5, 1318, 0.2, 2.5), at1(41.5, 1976, 0.12, 2.5), at1(10.98, 60, 0.6, 5)].join('+');
const rings = `0.05*sin(2*PI*220*t)*(0.5+0.5*sin(2*PI*t/1.6))*gte(t,15.6)*lt(t,20.3)`;
const wh = [3.55, 5.55, 7.5, 13.75, 20.15, 23.95, 26.55, 32.55, 38.3].map(s => `between(t,${s.toFixed(2)},${(s + .45).toFixed(2)})*sin(PI*(t-${s.toFixed(2)})/0.45)`).join('+');
const riser = `between(t,10.0,10.98)*pow((t-10.0)/0.98,2)`;
const out = `${DIR}out/showcase-reel.mp4`;
execFileSync(FF, ['-loglevel', 'error', '-y', '-framerate', String(FPS), '-i', `${OUT}/f/%05d.jpg`,
  '-f', 'lavfi', '-i', `aevalsrc='${pad}+${kick}+${arp}+${rings}':s=48000:d=${T.toFixed(2)}`,
  '-f', 'lavfi', '-i', `aevalsrc='${keys}+${events}':s=48000:d=${T.toFixed(2)}`,
  '-f', 'lavfi', '-i', `anoisesrc=d=${T.toFixed(2)}:c=pink:a=0.5:r=48000`,
  '-f', 'lavfi', '-i', `anoisesrc=d=${T.toFixed(2)}:c=white:a=0.5:r=48000:seed=3`,
  '-filter_complex', `[3:a]volume='0.32*(${wh})':eval=frame,highpass=f=500,lowpass=f=6500[w];[4:a]volume='0.10*(${riser})+0.025*gte(t,7.6)*lt(t,41.4)*exp(-30*mod(t,${(BEAT / 2).toFixed(5)}))':eval=frame,highpass=f=5000[h];[1:a][2:a][w][h]amix=inputs=4:normalize=0,afade=t=in:d=0.3,afade=t=out:st=${(T - 1.4).toFixed(2)}:d=1.4,loudnorm=I=-14:TP=-1.5:LRA=9,aformat=sample_rates=48000:channel_layouts=stereo[a]`,
  '-map', '0:v', '-map', '[a]', '-c:v', 'libx264', '-preset', 'slow', '-crf', '17', '-maxrate', '7M', '-bufsize', '14M', '-pix_fmt', 'yuv420p', '-profile:v', 'high', '-g', '60', '-r', String(FPS),
  '-c:a', 'aac', '-b:a', '160k', '-movflags', '+faststart', '-shortest', out]);
console.log('showcase', out, T.toFixed(1) + ' s', N + ' frames', ((Date.now() - t0) / 1000).toFixed(0) + ' s');
