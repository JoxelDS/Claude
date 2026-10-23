// node showcase.mjs [--at 1,5,12]  → out/showcase-reel.mp4 (1080×1920, 30 fps, AAC)
// "SDX Inspect, in motion": a full-screen motion-design piece (no monitor, no desk) in the rhythm of an
// app-launch animation, telling ONE job from start to end: grease under a fryer at HARBOR DOGS #101 (the demo
// venue's made-up stand). The problem → "Find it on the walk" → a phone home screen that zooms into the blue SDX
// icon (the zoom becomes the blue screen) → "Just scan it": the stand's QR poster is scanned (the QR is real and
// opens our product page) → the poster becomes the logo button → a pill that grows into the wordmark and runs the
// walk (hand sink ✓, cooler ✓, under the fryer ✕) → the pill morphs into the problem card, sent to the crew → the
// real app on phones (the crew's AFTER photo, the inspector's ✅ Fixed view) → BEFORE / AFTER pulled out big →
// taglines → the logo lands in the lockup.
// Everything is ours: the SDX mark, generic drawn icons (no real brands), our own sample photos (marked SAMPLE
// PHOTO), the real app recorded by pov.mjs on the demo venue. Same method as motion.mjs: every frame is a pure
// function of t rendered in Chromium; the sound is synthesized.
import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync, rmSync } from 'fs';
import { execFileSync } from 'child_process';
import { createRequire } from 'module';
import { chromium } from '/home/user/Claude/node_modules/playwright-core/index.mjs';
import { TEAL, C, fontCss, mark, lockup } from './sdxmark.mjs';
const req = createRequire(import.meta.url);
const sharp = req('/home/user/Claude/node_modules/sharp');
const QR = req('/home/user/Claude/node_modules/qrcode');
const FF = process.env.FFMPEG || '/tmp/ff/node_modules/ffmpeg-static/ffmpeg';
const DIR = new URL('.', import.meta.url).pathname;
const args = process.argv.slice(2);
const opt = k => { const i = args.indexOf('--' + k); return i >= 0 ? args[i + 1] : null; };
const FPS = 30, T = 37.6, N = Math.round(T * FPS), W = 1080, H = 1920;
const OUT = `${DIR}out/showcase`; mkdirSync(OUT, { recursive: true });
const b64 = (f, type = 'jpeg') => `data:image/${type};base64,` + readFileSync(f).toString('base64');

// the crew's phone plays the real app from the AFTER photo to "We cleaned it" (pov_crew 14.5–17.4 s; earlier frames
// still carry the toast of the previous step and another stand's card); then it holds its last frame
const CREW = { clip: 'crew', from: 14.5, to: 17.4, a: 21.8, b: 24.1 };
CREW.sp = (CREW.to - CREW.from) / (CREW.b - CREW.a);
{
  const seq = `${OUT}/seq_crew3`, stamp = `${seq}/w_${CREW.from}_${CREW.to}`;
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
// the Fixed view: everything under the HARBOR DOGS ✅ Fixed panel (another stand's open card) is covered with the
// page's own background, stretched from a strip just under the panel
async function fixedOnly() {
  const f = `${OUT}/fixed_only.jpg`;
  if (!existsSync(f)) {
    const src = still('fixed', 3.2, 'fixed_card.jpg', 'scale=1080:-2');
    const strip = await sharp(src).extract({ left: 0, top: 1622, width: 1080, height: 6 }).resize(1080, 2338 - 1628, { fit: 'fill', kernel: 'nearest' }).toBuffer();
    await sharp(src).composite([{ input: strip, top: 1628, left: 0 }]).jpeg({ quality: 92 }).toFile(f);
  }
  return b64(f);
}
const FIXED = await fixedOnly();
const HDR_CREW = b64(still('crew', 19.6, 'hdr_crew.png', 'crop=1080:168:0:0'), 'png');
const HDR_FIX = b64(still('fixed', 1.0, 'hdr_fix.png', 'crop=1080:168:0:0'), 'png');
// our own generated photos; the page marks them SAMPLE PHOTO wherever they are shown
const PIC = { grease: b64(`${DIR}pics/grease.jpg`), after: b64(`${DIR}pics/after.jpg`) };
// the stand poster's QR: a real code that opens our product page
const QR_SVG = await QR.toString('https://joxelds.github.io/Claude/marketing/', { type: 'svg', margin: 0, errorCorrectionLevel: 'M', color: { dark: '#0B1240', light: '#FFFFFF' } });

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
/* kinetic lines sit left of Instagram's button column (x > 940) */
.kin{position:absolute;left:50px;right:150px;text-align:center;font-family:M,I;font-weight:800;letter-spacing:-2.5px;line-height:1.08}
.kin span{display:inline-block;white-space:pre}
.kin .hl{color:${TEAL}} .kin .hb{color:#0B1240} .kin .hr{color:#FF5A5F}
#k6s{position:absolute;left:50px;right:150px;top:342px;text-align:center;font-weight:700;font-size:34px;color:rgba(255,255,255,.82)}
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
#tapR{position:absolute;width:130px;height:130px;margin:-65px 0 0 -65px;border-radius:50%;border:8px solid #fff;opacity:0}
/* the stand's QR poster */
#poster{position:absolute;left:540px;top:900px;border-radius:40px;background:#fff;overflow:hidden;box-shadow:0 40px 100px rgba(5,10,60,.5);color:${C.navy}}
#pIn{position:absolute;left:0;top:0;width:560px;height:760px}
#pHead{position:absolute;left:0;right:0;top:0;height:130px;background:${C.navy};display:flex;align-items:center;justify-content:center}
#pName{position:absolute;left:0;right:0;top:152px;text-align:center;font-family:M;font-weight:800;font-size:50px;letter-spacing:-1px;white-space:nowrap}
#pName b{display:inline-block;margin-left:12px;font-family:I;font-size:34px;font-weight:800;color:#fff;background:${TEAL};border-radius:999px;padding:6px 16px;vertical-align:8px}
#pQR{position:absolute;left:100px;top:250px;width:360px;height:360px} #pQR svg{width:100%;height:100%;display:block}
#pFoot{position:absolute;left:0;right:0;top:648px;text-align:center;font-weight:700;font-size:28px;color:#4B5070}
.brk{position:absolute;width:74px;height:74px;border:0 solid ${TEAL};filter:drop-shadow(0 0 10px rgba(51,195,176,.7))}
#bk0{border-top-width:11px;border-left-width:11px;border-top-left-radius:18px}
#bk1{border-top-width:11px;border-right-width:11px;border-top-right-radius:18px}
#bk2{border-bottom-width:11px;border-left-width:11px;border-bottom-left-radius:18px}
#bk3{border-bottom-width:11px;border-right-width:11px;border-bottom-right-radius:18px}
#scanL{position:absolute;left:340px;width:400px;height:8px;border-radius:4px;background:${TEAL};box-shadow:0 0 24px 8px rgba(51,195,176,.75)}
#okQR{position:absolute;left:540px;top:950px;width:170px;height:170px;margin:-85px 0 0 -85px;border-radius:50%;background:#15803D;border:8px solid #fff;display:flex;align-items:center;justify-content:center;font-family:M;font-weight:800;font-size:96px;color:#fff;box-shadow:0 20px 60px rgba(0,0,0,.35)}
#btn{position:absolute;z-index:4;left:0;top:0;width:300px;height:300px;margin:-150px 0 0 -150px;border-radius:50%;background:#fff;display:flex;align-items:center;justify-content:center;box-shadow:0 30px 80px rgba(5,10,60,.45)}
#btn svg{width:170px;height:170px}
#bcap{position:absolute;left:0;right:0;top:1310px;text-align:center;font-weight:700;font-size:44px;color:rgba(255,255,255,.9)}
#bcap b{color:#fff}
#pill{position:absolute;left:90px;top:860px;height:200px;border-radius:100px;background:#fff;overflow:hidden;box-shadow:0 30px 80px rgba(5,10,60,.45)}
#pWord{position:absolute;left:214px;top:0;height:200px;display:flex;align-items:center;font-family:M;font-weight:800;font-size:70px;letter-spacing:-1px;color:${C.navy};white-space:nowrap}
#pWord i{font-style:normal;color:${TEAL}}
.prow{position:absolute;left:214px;right:30px;top:0;height:200px;display:flex;align-items:center;gap:22px;white-space:nowrap;font-weight:800;font-size:48px;letter-spacing:-.5px;color:${C.navy}}
.prow i{flex:none;width:68px;height:68px;border-radius:50%;display:inline-flex;align-items:center;justify-content:center;font-style:normal;font-size:38px;color:#fff;background:#15803D}
.prow small{font-weight:700;font-size:40px;color:#4B5070}
.prow.bad{color:#B91C1C} .prow.bad i{background:#E5383B}
#pLab{position:absolute;left:0;right:0;top:0;text-align:center;font-weight:800;font-size:34px;letter-spacing:6px;color:rgba(255,255,255,.92)}
#card{position:absolute;background:#fff;overflow:hidden;box-shadow:0 40px 100px rgba(5,10,60,.5);color:${C.ink}}
#cThumb{position:absolute;left:44px;top:44px;width:250px;height:250px;border-radius:30px;overflow:hidden}
#cThumb img{width:100%;height:100%;object-fit:cover}
#cThumb b{position:absolute;left:12px;bottom:12px;background:#E5383B;color:#fff;font-size:22px;font-weight:800;letter-spacing:2px;padding:6px 12px;border-radius:10px}
.smp{position:absolute;left:12px;top:12px;background:rgba(0,0,0,.68);color:#fff;font-style:normal;font-weight:800;font-size:18px;letter-spacing:1.5px;padding:6px 10px;border-radius:8px}
#cT1{position:absolute;left:330px;top:58px;font-family:M;font-weight:800;font-size:50px;letter-spacing:-1px;color:${C.navy};white-space:nowrap}
#cT2{position:absolute;left:330px;top:132px;font-weight:800;font-size:38px;color:#B91C1C;white-space:nowrap}
#cT3{position:absolute;left:330px;top:196px;display:inline-flex;align-items:center;gap:10px;font-weight:700;font-size:28px;color:#4B5070;background:#F1F3F9;border-radius:999px;padding:12px 22px;white-space:nowrap}
#cSteps{position:absolute;left:44px;right:44px;top:326px;display:flex;align-items:center;gap:10px}
.st{display:flex;align-items:center;gap:10px;font-weight:800;font-size:28px;color:#8A90AE;white-space:nowrap}
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
.big .smp{left:18px;top:18px;font-size:26px;padding:8px 14px;border-radius:10px}
#bigA small{position:absolute;right:18px;bottom:22px;font-weight:700;font-size:26px;color:#fff;background:rgba(0,0,0,.55);padding:8px 14px;border-radius:10px}
#stampF{position:absolute;width:250px;height:250px;margin:-125px 0 0 -125px;border-radius:50%;background:#15803D;border:8px solid #fff;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:2px;box-shadow:0 20px 60px rgba(0,0,0,.45);font-family:M;font-weight:800;color:#fff;letter-spacing:1px}
#stampF span{font-size:88px;line-height:1} #stampF em{font-style:normal;font-size:40px}
#endc{position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center}
#epill{margin-top:56px;background:${TEAL};color:#06231F;font-weight:800;font-size:46px;padding:22px 46px;border-radius:999px}
#ehandle{font-weight:700;font-size:40px;color:#AEB4E6;margin-top:28px}
#bigLogo{position:absolute;left:0;top:0;width:260px;height:260px;margin:-130px 0 0 -130px}
#bigLogo svg{width:100%;height:100%}
#vig{position:absolute;inset:0;background:radial-gradient(1200px 1700px at 50% 45%,transparent 60%,rgba(0,0,0,.45));pointer-events:none}`;

// kinetic lines: [id, html with <h>…</h> highlights, cls, top, size]
const KIN = [
  ['k1', 'Grease under\n<h>the fryer.</h>', 'hr', 690, 104], ['k2', 'The fix? <h>No proof.</h>', 'hr', 960, 92],
  ['k3', 'Find it\n<h>on the walk.</h>', 'hl', 780, 116],
  ['kOpen', 'Open <h>the app.</h>', 'hl', 222, 62],
  ['k4', 'Just <h>scan</h> it.', 'hb', 300, 110],
  ['k12', 'Flagged.\n<h>Sent to the crew.</h>', 'hb', 300, 76],
  ['k6', 'Crew sends the <h>AFTER.</h>', 'hl', 250, 66], ['k7', 'Fixed — <h>with proof.</h>', 'hl', 250, 66],
  ['k9', 'Fix them <h>with proof</h>', 'hl', 860, 84], ['k10', 'At every <h>stand</h>', 'hl', 860, 84],
  ['k11', 'Walk it.\nFix it.\n<h>Prove it.</h>', 'hl', 900, 118],
];
const kinHtml = ([id, h, cls, top, size]) => `<div class="kin" id="${id}" style="top:${top}px;font-size:${size}px">${h.split(/(<h>.*?<\/h>)/).filter(Boolean).map(seg => {
  const hi = seg.startsWith('<h>'); const txt = seg.replace(/<\/?h>/g, '');
  return txt.split(/(\s+)/).filter(x => x.length).map(w => /\n/.test(w) ? '<br>' : /^\s+$/.test(w) ? '<span> </span>' : `<span${hi ? ` class="${cls || 'hl'}"` : ''}>${w}</span>`).join('');
}).join('')}</div>`;
const ROWS = [['✓', 'Hand sink', '104°F', ''], ['✓', 'Cooler', '38°F', ''], ['✕', 'Under the fryer', '', 'bad']];

const html = `<!doctype html><meta charset=utf-8><style>${css}</style>
<div class="layer" id="dark"><div class="blob" id="d1"></div><div class="blob" id="d2"></div><div class="blob" id="d3"></div></div>
<div class="layer" id="blue"><div class="blob" id="u1"></div><div class="blob" id="u2"></div>
  <div id="poster"><div id="pIn"><div id="pHead">${lockup(70)}</div><div id="pName">HARBOR DOGS<b>#101</b></div><div id="pQR">${QR_SVG}</div><div id="pFoot">Scan with your phone camera</div></div></div>
  ${[0, 1, 2, 3].map(i => `<div class="brk" id="bk${i}"></div>`).join('')}<div id="scanL"></div><div id="okQR">✓</div>
  <div id="btn">${mark(170)}</div><div id="bcap"></div>
  <div id="pLab"></div>
  <div id="pill"><div id="pWord">SDX <i>&nbsp;INSPECT</i></div>
    ${ROWS.map(([ic, a, b, cls], i) => `<div class="prow ${cls}" id="pr${i}"><i>${ic}</i>${a}${b ? ` <small>· ${b}</small>` : ''}</div>`).join('')}</div>
  <div id="card"><div id="cThumb"><img src="${PIC.grease}"><em class="smp">SAMPLE</em><b>BEFORE</b></div><div id="cT1">HARBOR DOGS #101</div><div id="cT2">Grease under the fryer</div><div id="cT3">⚠ Flagged on the walk · photo added</div>
    <div id="cSteps"><div class="st" id="s1"><i>!</i>Flagged</div><div class="sl"><b id="l1"></b></div><div class="st" id="s2"><i>→</i>Crew</div><div class="sl"><b id="l2"></b></div><div class="st" id="s3"><i>✓</i>Fixed</div></div></div>
</div>
<div class="layer" id="phLayer"><div id="phoneCam"><div id="phone"><div id="scr"><div id="isl"></div><div id="sbar"><span>9:41</span><span>●●● ▴ ▮</span></div>
  <div id="grid">${ICONS.map(icon).join('')}</div><div id="dock">${DOCK.map(icon).join('')}</div><div id="tapR"></div></div></div></div></div>
<div class="layer" id="apps">
  <div class="ph" id="phC"><div class="s"><img class="app" id="imC"><img class="hdr" src="${HDR_CREW}"></div></div>
  <div class="ph" id="phX"><div class="s"><img class="app" src="${FIXED}"><img class="hdr" src="${HDR_FIX}"><div class="mk" id="mkB" style="left:29%;top:45.7%"></div><div class="mk" id="mkA" style="left:29%;top:56.5%"></div></div></div>
  <div class="big" id="bigB"><img src="${PIC.grease}"><em class="smp">SAMPLE PHOTO</em><b style="background:#E5383B">BEFORE</b></div>
  <div class="big" id="bigA"><img src="${PIC.after}"><em class="smp">SAMPLE PHOTO</em><b style="background:#15803D">AFTER</b><small>by the crew · just now</small></div>
  <div id="stampF"><span>✓</span><em>FIXED</em></div>
</div>
<div class="layer" id="txt">
  <div id="dot"></div>
  ${KIN.map(kinHtml).join('')}<div id="k6s">HARBOR DOGS #101 · grease under the fryer</div>
  <div id="endc"><div id="elock">${lockup(170)}</div><div id="epill">Free 30-day pilot · DM PILOT</div><div id="ehandle">@sdxinspection</div></div>
  <div id="bigLogo">${mark(260, { onDark: true })}</div>
</div>
<div id="vig"></div>
<script>
const W=${W};const D=${JSON.stringify({ FPS, CREW: { a: CREW.a, b: CREW.b, sp: CREW.sp, n: CREW.n, seq: CREW.seq }, PX, PY, PW, PH, PB })};
const $=id=>document.getElementById(id);
const cl=(x,a=0,b=1)=>Math.min(b,Math.max(a,x));
function spring(t,r=0.5,z=0.82){ if(t<=0) return 0; const w=2*Math.PI/r, wd=w*Math.sqrt(1-z*z); return 1-Math.exp(-z*w*t)*(Math.cos(wd*t)+(z*w/wd)*Math.sin(wd*t)); }
const ease=t=>t<=0?0:t>=1?1:1-Math.pow(1-t,3);
const eio=t=>t<=0?0:t>=1?1:(t<.5?4*t*t*t:1-Math.pow(-2*t+2,3)/2);
const mix=(a,b,k)=>a+(b-a)*k;
const bump=(t,t0,d)=>Math.sin(Math.PI*cl((t-t0)/d));
const vis=(el,o,tf)=>{ el.style.opacity=o; el.style.visibility=o>0.002?'visible':'hidden'; if(tf!=null) el.style.transform=tf; };
// a kinetic line: words rise in with a blur, one after the other; out with a blur, all together
function kin(id,t0,t1,t,{stag=.07,dy=46,out=.28}={}){ const el=$(id); if(t<t0-.05||t>t1+out){ vis(el,0); return 0; } vis(el,1); let first=0;
  [...el.querySelectorAll('span')].forEach((s,i)=>{ const u=t-t0-i*stag, k=spring(u,.55,.78), o=ease((t-t1)/out); if(i===0) first=cl(u/.16)*(1-o);
    s.style.opacity=(cl(u/.16)*(1-o)).toFixed(3); s.style.transform='translateY('+(dy*(1-k)-30*o).toFixed(1)+'px) scale('+(s.className?(1+.25*(1-k)):1).toFixed(3)+')'; s.style.filter='blur('+(12*(1-cl(u/.28))+14*o).toFixed(2)+'px)'; }); return first; }
// the SDX icon's centre on the untransformed home screen (for the zoom into it); the lockup's mark at rest (the logo lands there)
const IC=(()=>{ const r=$('sdxIcon').getBoundingClientRect(); return { x:r.left+r.width/2, y:r.top+r.height/2, w:r.width }; })();
const LM=(()=>{ const r=$('elock').querySelector('svg').getBoundingClientRect(); return { x:r.left+r.width/2, y:r.top+r.height/2, w:r.width }; })();
const crewSrc=t=>'file://'+D.CREW.seq+'/'+String(Math.max(1,Math.min(D.CREW.n,Math.floor(cl(t-D.CREW.a,0,D.CREW.b-D.CREW.a)*D.CREW.sp*D.FPS)+1))).padStart(5,'0')+'.jpg';
const ctr=el=>{ const r=el.getBoundingClientRect(); return [r.left+r.width/2,r.top+r.height/2]; };
window.render=async f=>{
  const t=f/D.FPS; const imgs=[];
  // ---------------- backgrounds: dark (0–8, 21.3–end), blue (7.7–22.3, slides out left at 21.3)
  const drift=(id,ax,ay,px,py,s)=>{ $(id).style.transform='translate('+(ax+px*Math.sin(t*s)).toFixed(0)+'px,'+(ay+py*Math.cos(t*s*.83)).toFixed(0)+'px)'; };
  drift('d1',-520,-380,160,120,.23); drift('d2',380,980,140,160,.19); drift('d3',-200,1250,120,90,.27);
  const darkGlow=t<8.1?cl(t/.6):cl((t-21.3)/.8);
  $('d1').style.opacity=darkGlow; $('d2').style.opacity=darkGlow; $('d3').style.opacity=darkGlow*.9;
  const blueOn=t>=7.7&&t<22.3; const bOut=eio((t-21.3)/.8);
  vis($('blue'),blueOn?1:0,'translateX('+(-W*bOut).toFixed(1)+'px)');
  drift('u1',-450,-300,120,90,.21); drift('u2',300,1100,140,120,.25);
  // ---------------- 0–3.0: the dot rises and goes out, then the problem
  const dotY=mix(960,560,ease((t-.12)/.38)); const dotO=t<.04?0:1-ease((t-.38)/.2);
  $('dot').style.left='490px'; $('dot').style.top=dotY+'px'; vis($('dot'),dotO,'scale('+(spring(t-.04,.45,.6)*(1-.5*ease((t-.35)/.2))).toFixed(3)+')');
  kin('k1',.4,2.9,t); kin('k2',1.15,2.9,t);
  kin('k3',3.3,4.9,t,{stag:.09}); kin('kOpen',5.45,6.55,t,{dy:30});
  // ---------------- 4.95–8.0: the phone rises, the blue SDX icon glows, a tap, the zoom into the icon
  const pin=spring(t-4.95,.75,.78);
  const lay=$('phLayer'); const phOn=t>=4.9&&t<8.0; vis(lay,phOn?1-ease((t-7.75)/.25):0);
  if(phOn){
    const pz=eio((t-6.6)/.4), zz=cl((t-7.0)/.85), zq=zz*zz;
    const s=t<7.0?mix(1,1.3,pz):1.3*Math.pow(30/1.3,zq);
    const cx=mix(540,IC.x,pz), cy=mix(960,IC.y,pz);
    const tilt=mix(26,0,pin), lift=mix(1500,0,pin)+10*Math.sin(t*1.3)*(1-pz);
    $('phoneCam').style.transform='translate('+(540-cx*s).toFixed(1)+'px,'+(960-cy*s+lift).toFixed(1)+'px) scale('+s.toFixed(4)+') perspective(1800px) rotateX('+tilt.toFixed(2)+'deg)';
    const glow=t>=5.6&&t<6.5?.5+.5*Math.sin((t-5.6)*Math.PI*2.4-Math.PI/2):0;
    $('sdxIcon').style.boxShadow='0 8px 20px rgba(0,0,0,.25),0 0 0 '+(4+8*glow).toFixed(1)+'px rgba(51,195,176,'+(.85*glow).toFixed(3)+'),0 0 '+(30+40*glow).toFixed(0)+'px rgba(51,195,176,'+(.7*glow).toFixed(3)+')';
    $('sdxIcon').style.transform='scale('+(1-.12*bump(t,6.25,.35)).toFixed(3)+')';
    $('sdxMark').style.opacity=(1-cl((s-2.2)/3)).toFixed(3);
    const tr=$('tapR'); const tk=(t-6.3)/.55; if(tk>=0&&tk<1){ tr.style.left=(IC.x-D.PX-D.PB)+'px'; tr.style.top=(IC.y-D.PY-D.PB)+'px'; tr.style.opacity=((1-tk)*.95).toFixed(3); tr.style.transform='scale('+(.5+1.1*ease(tk))+')'; } else tr.style.opacity=0;
  }
  // ---------------- 8.0–11.85: "Just scan it." The stand's QR poster: the brackets close in, the scan line runs, found ✓
  kin('k4',8.0,10.2,t,{stag:.12,dy:50});
  const po=$('poster'), pin2=spring(t-8.25,.6,.75), pm=eio((t-11.4)/.45);
  const pw2=mix(560,300,pm), ph2=mix(760,300,pm);
  po.style.width=pw2+'px'; po.style.height=ph2+'px'; po.style.marginLeft=(-pw2/2)+'px'; po.style.marginTop=(-ph2/2)+'px'; po.style.borderRadius=mix(40,150,pm)+'px';
  $('pIn').style.opacity=(1-cl((t-11.4)/.2)).toFixed(3); $('pIn').style.transform='translate('+((pw2-560)/2).toFixed(1)+'px,'+((ph2-760)/2).toFixed(1)+'px)';
  vis(po,t>=8.25&&t<11.9?cl((t-8.25)/.15):0,'translateY('+(220*(1-pin2)).toFixed(1)+'px) scale('+mix(.9,1,pin2).toFixed(4)+')');
  const bkIn=ease((t-8.85)/.4), found=t>=10.3, bkOut=ease((t-11.2)/.2);
  const d=mix(330,212,bkIn)+8*bump(t,10.3,.3); const bc0=found?'#2ED47A':'${TEAL}';
  [[-1,-1],[1,-1],[-1,1],[1,1]].forEach(([sx,sy],i)=>{ const b=$('bk'+i); b.style.left=(540+sx*d-(sx<0?0:74))+'px'; b.style.top=(950+sy*d-(sy<0?0:74))+'px'; b.style.borderColor=bc0; vis(b,t>=8.85&&t<11.4?bkIn*(1-bkOut):0); });
  const su=(t-9.3)/.9, sy2=su<.5?su*2:2-su*2; const sl=$('scanL'); sl.style.top=(770+360*cl(sy2)-4)+'px'; vis(sl,t>=9.3&&t<10.25?cl((t-9.3)/.1)*(1-cl((t-10.15)/.1)):0);
  const ok=spring(t-10.3,.45,.55); vis($('okQR'),t>=10.3&&t<11.4?1-ease((t-11.2)/.2):0,'scale('+ok.toFixed(3)+')');
  const bc=$('bcap'); const cap=found?'<b>HARBOR DOGS #101</b> — found ✓':'Scanning the stand poster…'; if(bc.dataset.c!==cap){ bc.dataset.c=cap; bc.innerHTML=cap; }
  const c0=found?10.3:9.0; vis(bc,t>=9.0&&t<11.5?cl((t-c0)/.25)*(found?1:1-ease((t-10.05)/.2))*(1-ease((t-11.2)/.25)):0,'translateY('+(20*(1-ease((t-c0)/.4))).toFixed(1)+'px)');
  // ---------------- 11.8–17.2: the poster has become the logo button; it slides left and the pill grows from it
  const pk=eio((t-12.2)/.5); const bx=mix(540,190,pk), by=mix(900,960,pk);
  let bs=mix(1,200/300,pk)*(1+.1*bump(t,11.85,.3)); const btnO=t<11.8?0:(t<17.2?1:1-ease((t-17.2)/.2)); if(t>=17.2) bs*=mix(1,.8,ease((t-17.2)/.2));
  vis($('btn'),btnO,'translate('+bx+'px,'+by+'px) scale('+bs.toFixed(4)+')'); $('btn').querySelector('svg').style.opacity=cl((t-11.75)/.2);
  const pill=$('pill'); const pwd=mix(200,840,eio((t-12.68)/.7)); const pOn=t>=12.68&&t<17.2;
  pill.style.width=pwd+'px'; vis(pill,pOn?1:0);
  const bad=cl((t-16.3)/.25)*(1-ease((t-17.0)/.15)); pill.style.boxShadow='0 30px 80px rgba(5,10,60,.45),0 0 0 '+(10*bad*(.7+.3*Math.sin((t-16.3)*9))).toFixed(1)+'px rgba(229,56,59,.85)';
  vis($('pWord'),t<14.25?cl((t-13.05)/.3):1-ease((t-14.25)/.25),'translateX('+(40*(1-ease((t-13.05)/.45))-60*ease((t-14.25)/.3)).toFixed(1)+'px)');
  for(let i=0;i<3;i++){ const r0=14.5+i*.9, r1=i<2?r0+.9:17.0; const ki=ease((t-r0)/.3), ko=ease((t-r1)/(i<2?.25:.15));
    vis($('pr'+i),t>=r0&&t<r1+.25?ki*(1-ko):0,'translateY('+(70*(1-ki)-(i<2?70:0)*ko).toFixed(1)+'px)'); }
  const lab=$('pLab'); const lt=t>=16.35?'1 PROBLEM FOUND':'THE WALK'; if(lab.dataset.c!==lt){ lab.dataset.c=lt; lab.textContent=lt; } lab.style.color=t>=16.35?'#FFC2C4':'rgba(255,255,255,.92)';
  vis(lab,t>=14.3&&t<17.25?cl((t-14.3)/.3)*(1-ease((t-17.05)/.15)):0,'translateY('+(780+20*(1-ease((t-14.3)/.4))).toFixed(1)+'px)');
  // ---------------- 17.2–21.3: the pill becomes the card (one white shape grows); "Flagged. Sent to the crew."
  const mk=eio((t-17.2)/.6); const card=$('card'); const cOn=t>=17.2&&t<22.3;
  card.style.left=mix(90,70,mk)+'px'; card.style.top=mix(860,700,mk)+'px'; card.style.width=mix(840,860,mk)+'px'; card.style.height=mix(200,400,mk)+'px'; card.style.borderRadius=mix(100,56,mk)+'px';
  vis(card,cOn?1:0);
  vis($('cThumb'),cl((t-17.35)/.2),'scale('+(.85+.15*spring(t-17.35,.5,.7)).toFixed(3)+')');
  ['cT1','cT2','cT3'].forEach((id,i)=>vis($(id),cl((t-17.45-i*.12)/.22),'translateX('+(30*(1-ease((t-17.45-i*.12)/.4))).toFixed(1)+'px)'));
  vis($('cSteps'),cl((t-17.95)/.3));
  $('s1').className=t>=18.1?'st on':'st'; $('s1').style.transform='scale('+(1+.1*bump(t,18.1,.3))+')';
  $('l1').style.width=(100*ease((t-18.5)/.6))+'%';
  $('s2').className=t>=19.1?'st go':'st'; $('s2').style.transform='scale('+(1+.1*bump(t,19.1,.3))+')';
  $('l2').style.width=t>=19.1?((12+6*Math.sin((t-19.1)*3))+'%'):'0%';
  kin('k12',17.75,21.1,t,{dy:34});
  // ---------------- 21.3–28.7: the real app. The crew's phone (the AFTER photo), then the inspector's ✅ Fixed card
  const ap=$('apps'); const aIn=eio((t-21.3)/.8), sk=eio((t-24.3)/.6), aOut=ease((t-28.3)/.4);
  vis(ap,t>=21.3&&t<28.75?1:0);
  if(t>=21.3&&t<28.75){
    const pc=$('phC'), px=$('phX'); const pwS=pc.offsetWidth;
    const cL=mix((W-pwS)/2,D.PX-150,sk), cT=mix(D.PY+130,D.PY+250,sk);
    pc.style.left=cL+'px'; pc.style.top=cT+'px';
    pc.style.transform='translateX('+(W*(1-aIn)*1.1).toFixed(1)+'px) rotate('+mix(3-1.5*Math.sin(t*.7),-9,sk).toFixed(2)+'deg) translateY('+(8*Math.sin(t*1.1)*(1-sk)).toFixed(1)+'px) scale('+(mix(1,.84,sk)*(1-.1*aOut)).toFixed(4)+')';
    pc.style.filter='brightness('+mix(1,.6,sk).toFixed(3)+')'; pc.style.opacity=(1-aOut).toFixed(3);
    const im=$('imC'), src=crewSrc(t); if(im.dataset.s!==src){ im.dataset.s=src; im.src=src; } imgs.push(im);
    const dim=mix(1,.6,cl((t-25.5)/.3));
    px.style.left=(D.PX+120)+'px'; px.style.top=(D.PY+100)+'px';
    px.style.transform='translateX('+(W*(1-sk)).toFixed(1)+'px) rotate('+(4-2*Math.sin(t*.6)).toFixed(2)+'deg) translateY('+(8*Math.sin(t*1.1)).toFixed(1)+'px) scale('+(1-.1*aOut).toFixed(4)+')';
    px.style.filter='brightness('+dim.toFixed(3)+')'; vis(px,t>=24.3?1-aOut:0);
    // BEFORE / AFTER pulled out of the card's thumbnails, big; they shrink back into them at the end
    for(const [id,mkId,t0,L,Tp,rot] of [['bigB','mkB',25.5,80,560,-3],['bigA','mkA',25.75,310,1040,2.5]]){
      const el=$(id); el.style.left=L+'px'; el.style.top=Tp+'px'; const k=spring(t-t0,.6,.75)*(1-ease((t-28.0)/.35));
      const [mx,my]=ctr($(mkId)); const dx=mx-(L+300), dy=my-(Tp+226);
      vis(el,t>=t0&&t<28.4?cl((t-t0)/.12)*(1-cl((t-28.25)/.1)):0,'translate('+(dx*(1-k)).toFixed(1)+'px,'+(dy*(1-k)).toFixed(1)+'px) rotate('+(rot*k).toFixed(2)+'deg) scale('+mix(.12,1,k).toFixed(4)+')'); }
    const st=$('stampF'); st.style.left='800px'; st.style.top='1060px'; const sk2=spring(t-26.3,.45,.5);
    vis(st,t>=26.3&&t<28.25?1-ease((t-28.0)/.2):0,'rotate('+mix(-30,-8,cl((t-26.3)/.3)).toFixed(1)+'deg) scale('+(mix(2.2,1,cl((t-26.3)/.18))*(.9+.1*sk2)*(1-.6*ease((t-28.0)/.2))).toFixed(3)+')');
  }
  const k6o=kin('k6',21.85,24.25,t,{dy:30}); const k6s=$('k6s'); vis(k6s,t>=22.0&&t<24.55?cl((t-22.0)/.3)*(1-ease((t-24.25)/.28)):0,'translateY('+(16*(1-ease((t-22.0)/.4))).toFixed(1)+'px)');
  kin('k7',24.8,28.25,t,{dy:30});
  // ---------------- 28.75–31.6: taglines
  kin('k9',28.75,30.15,t); kin('k10',30.3,31.6,t);
  // ---------------- 31.75–37.6: the logo, the line, and the logo lands in the lockup
  const lk=spring(t-31.75,.65,.6), up=ease((t-32.25)/.5), land=eio((t-34.55)/.4);
  const lx=mix(540,LM.x,land), ly=mix(820-120*up,LM.y,land), ls=lk*mix(1,LM.w/260,land);
  const bl=$('bigLogo'); bl.style.left=lx+'px'; bl.style.top=ly+'px'; vis(bl,t>=31.7&&t<34.97?1:0,'scale('+ls.toFixed(4)+')');
  kin('k11',32.45,34.55,t,{stag:.1});
  vis($('endc'),t>=34.75?cl((t-34.75)/.25):0); $('elock').querySelector('svg').style.opacity=t>=34.95?1:0;
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

// ---- sound: 112 bpm. A pad on the whole piece; hats from "Find it on the walk" (3.3); a soft kick (with a 180 Hz
// body a phone speaker can play) from the hit on "scan" (8.25) to the lockup; a plucked arpeggio from the blue screen
// to the end of the proof (7.75–28.3); a riser into the zoom that lands in a bright hit; the tap; the poster pop; a
// scan beep; the found chime; walk ticks; a low note for the problem; the card steps; pops for the photos; the FIXED
// chime; a soft end chime. Big hits get a bright layer (a short band-passed noise burst + a 200–400 Hz body) so they
// still read on a phone speaker. Loudness: measured, then one gain to -14 LUFS with a -1.5 dBTP limiter.
const BPM = 112, BEAT = 60 / BPM, BT = BEAT.toFixed(5);
const pad = `0.05*(sin(2*PI*110*t)+sin(2*PI*138.6*t)+sin(2*PI*164.8*t)+0.6*sin(2*PI*220*t))*(0.6+0.4*sin(2*PI*0.09*t))`;
const kick = `(0.34*sin(2*PI*(45+80*exp(-28*mod(t,${BT})))*mod(t,${BT}))*exp(-8*mod(t,${BT}))+0.08*sin(2*PI*180*mod(t,${BT}))*exp(-16*mod(t,${BT})))*gte(t,8.25)*lt(t,35.0)`;
const arp = `0.07*sin(2*PI*(440*pow(2,floor(mod(t*${(BPM / 30).toFixed(4)},4))*3/12))*t)*exp(-9*mod(t,${(BEAT / 2).toFixed(5)}))*gte(t,7.75)*lt(t,28.3)`;
const at1 = (s, f, a = 0.4, k = 70) => `${a}*sin(2*PI*${f}*(t-${s.toFixed(3)}))*exp(-${k}*max(t-${s.toFixed(3)},0))*gte(t,${s.toFixed(3)})`;
const HITS = [7.75, 8.25, 10.3, 25.5, 26.3];
const events = [at1(6.3, 2400, 0.35), at1(7.75, 60, 0.55, 5), at1(7.75, 220, 0.3, 14), at1(8.25, 55, 0.5, 6), at1(8.25, 200, 0.28, 14), at1(8.3, 1568, 0.14, 8),
  at1(9.3, 1200, 0.1, 10), at1(10.3, 1318.5, 0.24, 4), at1(10.3, 1975.5, 0.14, 4), at1(10.3, 330, 0.18, 12), at1(11.85, 1568, 0.18, 7),
  at1(14.5, 1046.5, 0.16, 12), at1(15.4, 1046.5, 0.16, 12), at1(16.3, 311, 0.3, 5), at1(16.3, 233, 0.22, 5),
  at1(18.1, 880, 0.25, 6), at1(19.1, 1318.5, 0.18, 5), at1(25.5, 1568, 0.15, 8), at1(25.5, 260, 0.2, 14), at1(25.75, 1976, 0.15, 8),
  at1(26.3, 1318.5, 0.22, 4), at1(26.3, 1760, 0.16, 4), at1(26.3, 392, 0.2, 12), at1(34.95, 1318.5, 0.12, 2.5), at1(34.95, 1975.5, 0.07, 2.5)].join('+');
const rings = `0.05*sin(2*PI*220*t)*(0.5+0.5*sin(2*PI*t/0.45))*gte(t,9.3)*lt(t,10.25)`;
const wh = [3.1, 4.9, 7.6, 11.35, 12.15, 17.15, 21.25, 24.25, 28.6, 31.7, 34.5].map(s => `between(t,${s.toFixed(2)},${(s + .45).toFixed(2)})*sin(PI*(t-${s.toFixed(2)})/0.45)`).join('+');
const riser = `between(t,6.8,7.75)*pow((t-6.8)/0.95,2)*(1-0.6*between(t,7.71,7.75)*(t-7.71)/0.04)`;
const burst = HITS.map(s => `between(t,${s.toFixed(3)},${(s + .08).toFixed(3)})*exp(-45*(t-${s.toFixed(3)}))`).join('+');
const out = `${DIR}out/showcase-reel.mp4`, wav = `${OUT}/mix.wav`;
const D_ = T.toFixed(2);
execFileSync(FF, ['-loglevel', 'error', '-y',
  '-f', 'lavfi', '-i', `aevalsrc='${pad}+${kick}+${arp}+${rings}':s=48000:d=${D_}`,
  '-f', 'lavfi', '-i', `aevalsrc='${events}':s=48000:d=${D_}`,
  '-f', 'lavfi', '-i', `anoisesrc=d=${D_}:c=pink:a=0.5:r=48000`,
  '-f', 'lavfi', '-i', `anoisesrc=d=${D_}:c=white:a=0.5:r=48000:seed=3`,
  '-f', 'lavfi', '-i', `anoisesrc=d=${D_}:c=pink:a=0.5:r=48000:seed=7`,
  '-filter_complex', `[2:a]volume='0.32*(${wh})':eval=frame,highpass=f=500,lowpass=f=6500[w];[3:a]volume='0.10*(${riser})+0.025*gte(t,3.3)*lt(t,35.0)*exp(-30*mod(t,${(BEAT / 2).toFixed(5)}))':eval=frame,highpass=f=5000[h];[4:a]volume='0.9*(${burst})':eval=frame,highpass=f=1000,lowpass=f=6000[x];[0:a][1:a][w][h][x]amix=inputs=5:normalize=0,afade=t=in:d=0.2,afade=t=out:st=${(T - 1.4).toFixed(2)}:d=1.4,aformat=sample_rates=48000:channel_layouts=stereo[a]`,
  '-map', '[a]', '-t', D_, wav]);
let ln = {}; try { const e = execFileSync('bash', ['-c', `${FF} -hide_banner -i ${wav} -af loudnorm=I=-14:TP=-1.5:LRA=9:print_format=json -f null - 2>&1 | sed -n '/^{/,/^}/p'`]).toString(); ln = JSON.parse(e); } catch {}
const gain = (-14 - parseFloat(ln.input_i || -14)).toFixed(2);
execFileSync(FF, ['-loglevel', 'error', '-y', '-framerate', String(FPS), '-i', `${OUT}/f/%05d.jpg`, '-i', wav,
  '-filter_complex', `[1:a]volume=${gain}dB,alimiter=limit=0.74:level=false,aformat=sample_rates=48000:channel_layouts=stereo[a]`,
  '-map', '0:v', '-map', '[a]', '-c:v', 'libx264', '-preset', 'slow', '-crf', '17', '-maxrate', '7M', '-bufsize', '14M', '-pix_fmt', 'yuv420p', '-profile:v', 'high', '-g', '60', '-r', String(FPS),
  '-c:a', 'aac', '-b:a', '160k', '-movflags', '+faststart', '-t', D_, out]);
console.log('showcase', out, T.toFixed(1) + ' s', N + ' frames', 'gain ' + gain + ' dB (measured ' + ln.input_i + ' LUFS)', ((Date.now() - t0) / 1000).toFixed(0) + ' s');
