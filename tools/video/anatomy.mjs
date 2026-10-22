// node anatomy.mjs reel|plain16|plain9 [--at 1,5,12]  → out/anatomy-<mode>.mp4
// "The anatomy of a 40-second app video", made from our own app: a 40 s explainer in four parts
// (Intro → Problem → Use case → Call to action). `reel` = 1080×1920 with the explainer playing in a 16:9 card,
// chapter tabs that fill as each part plays, a tick scrub bar and one note per part; `plain16` / `plain9` = the
// explainer alone. Same method as motion.mjs: every frame is rendered in Chromium from t (pure functions of t),
// the phone screen is the real app recorded by pov.mjs (out/pov_<clip>, demo venue), sound is synthesized.
import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync, rmSync } from 'fs';
import { execFileSync } from 'child_process';
import { chromium } from '/home/user/Claude/node_modules/playwright-core/index.mjs';
import { C, TEAL, fontCss, mark, lockup } from './sdxmark.mjs';
const FF = process.env.FFMPEG || '/tmp/ff/node_modules/ffmpeg-static/ffmpeg';
const DIR = new URL('.', import.meta.url).pathname;
const args = process.argv.slice(2); const MODE = args[0] || 'reel';
const opt = k => { const i = args.indexOf('--' + k); return i >= 0 ? args[i + 1] : null; };
const FPS = 30, SCENE = 40;
const HOOK = MODE === 'reel' ? 2.8 : 0, END = MODE === 'reel' ? 2.2 : 0.6;
const T = HOOK + SCENE + END, N = Math.round(T * FPS);
const OUT = `${DIR}out/anat_${MODE}`; mkdirSync(OUT, { recursive: true });

// ---- the four parts and the three use-case beats (scene time, s)
const PARTS = [
  { id: 'intro', tab: 'Intro', a: 0, b: 6, note: 'Who you are, in one line.' },
  { id: 'problem', tab: 'Problem', a: 6, b: 15, note: 'Show the pain before the product.' },
  { id: 'use', tab: 'Use case', a: 15, b: 34, note: 'The real app, three moments: find it, flag it, fix it.' },
  { id: 'cta', tab: 'Call to action', a: 34, b: 40, note: 'One clear next step. Nothing else.' },
];
// app segments: real recordings, source window [from, to] played from scene time a at speed sp
const SEGS = [
  { id: 'A', clip: 'g_temps', from: 7.6, to: 13.4, a: 15, b: 21, k: 'FIND IT', h: 'A 50°F cooler?|Caught.', s: 'Flagged on the spot, during the walk.' },
  { id: 'B', clip: 'g_problem', from: 14.6, to: 21.0, a: 21, b: 27.5, k: 'FLAG IT', h: 'Proof, in|the report.', s: 'A BEFORE photo, and where it is.' },
  { id: 'C', clip: 'crew', from: 13.4, to: 22.2, a: 27.5, b: 34, k: 'FIX IT', h: 'Fixed.|With proof.', s: 'The crew sends the AFTER photo.' },
];
for (const s of SEGS) {
  s.sp = (s.to - s.from) / (s.b - s.a);
  const src = `${DIR}out/pov_${s.clip}`;
  const { cues } = JSON.parse(readFileSync(`${src}/cues.json`, 'utf8'));
  s.taps = cues.filter(c => c.t >= s.from && c.t <= s.to && c.y != null).map(c => ({ t: s.a + (c.t - s.from) / s.sp, y: c.y / 844, key: !!c.key, text: c.text }));
  const seq = `${OUT}/../anat_seq/${s.id}`, stamp = `${seq}/w_${s.clip}_${s.from}_${s.to}`;
  if (!existsSync(stamp)) {
    rmSync(seq, { recursive: true, force: true }); mkdirSync(seq, { recursive: true });
    execFileSync(FF, ['-loglevel', 'error', '-y', '-ss', String(s.from), '-i', `${src}/master.mp4`, '-t', String(s.to - s.from + 0.2), '-vf', `fps=${FPS},scale=720:-2:flags=lanczos`, '-q:v', '3', `${seq}/%05d.jpg`]);
    writeFileSync(stamp, '');
  }
  s.seq = seq; s.n = readdirSync(seq).filter(f => f.endsWith('.jpg')).length;
}

// ---- layouts: the scene is drawn in its own box (16:9 = 1920×1080, 9:16 = 1080×1920)
const SC = MODE === 'plain9' ? { w: 1080, h: 1920, v: true } : { w: 1920, h: 1080, v: false };
const LAY = SC.v
  ? { tx: 70, tw: 940, ty: 240, th: 450, align: 'center', pcx: 540, ptop: 720, ph: 820, hsz: 112, ssz: 46 }
  : { tx: 140, tw: 920, ty: 120, th: 840, align: 'left', pcx: 1480, ptop: 70, ph: 940, hsz: 124, ssz: 52 };
const PB = 14, PSW = Math.round((LAY.ph - 2 * PB) * 1080 / 2338), PW = PSW + 2 * PB; // phone outer width

const page = MODE === 'reel' ? { w: 1080, h: 1920 } : { w: SC.w, h: SC.h };
const CARD = { x: 40, y: 560, w: 1000 }; CARD.h = Math.round(CARD.w * 1080 / 1920); CARD.s = CARD.w / 1920;

const css = `${fontCss(DIR)}
*{margin:0;box-sizing:border-box} html,body{width:${page.w}px;height:${page.h}px;overflow:hidden;background:#070A1F;font-family:I,Arial;-webkit-font-smoothing:antialiased;color:#fff}
#page{position:absolute;inset:0;background:radial-gradient(900px 700px at 20% 18%,rgba(72,84,214,.30),transparent 62%),radial-gradient(900px 900px at 90% 70%,rgba(51,195,176,.18),transparent 60%),linear-gradient(#0E1336,#070A1F)}
#scene{position:absolute;width:${SC.w}px;height:${SC.h}px;overflow:hidden;transform-origin:0 0}
#sbg{position:absolute;inset:0;background:linear-gradient(160deg,#141A44,#070A1F 70%)}
.glow{position:absolute;border-radius:50%;filter:blur(0px)}
#g1{width:1100px;height:1100px;background:radial-gradient(closest-side,rgba(72,84,214,.42),transparent)}
#g2{width:1000px;height:1000px;background:radial-gradient(closest-side,rgba(51,195,176,.26),transparent)}
#grid{position:absolute;inset:0;background-image:linear-gradient(rgba(160,190,255,.07) 1px,transparent 1px),linear-gradient(90deg,rgba(160,190,255,.07) 1px,transparent 1px);background-size:60px 60px}
#txt{position:absolute;left:${LAY.tx}px;top:${LAY.ty}px;width:${LAY.tw}px;height:${LAY.th}px;display:flex;flex-direction:column;justify-content:center;text-align:${LAY.align}}
#sk{font-weight:800;font-size:38px;letter-spacing:8px;color:${TEAL};margin-bottom:22px}
#sh{font-weight:800;font-size:${LAY.hsz}px;line-height:1.0;letter-spacing:-3.5px}
#ss{font-weight:600;font-size:${LAY.ssz}px;line-height:1.3;color:#AEB4E6;margin-top:30px}
#sk span,#sh span,#ss span{display:inline-block}
#intro{position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center}
#ilogo{width:${SC.v ? 230 : 210}px;height:${SC.v ? 230 : 210}px}
#iname{font-weight:800;font-size:${SC.v ? 128 : 150}px;letter-spacing:-4px;margin-top:40px}
#iline{font-weight:600;font-size:${SC.v ? 54 : 64}px;color:#AEB4E6;margin-top:18px}
#iname span,#iline span{display:inline-block}
#paper{position:absolute;width:${Math.round(LAY.ph * 0.62)}px;height:${Math.round(LAY.ph * 0.82)}px;left:${LAY.pcx - Math.round(LAY.ph * 0.31)}px;top:${LAY.ptop + Math.round(LAY.ph * 0.07)}px;background:#FBF7EC;border-radius:14px;box-shadow:0 30px 80px rgba(0,0,0,.5);padding:46px 44px;color:#2b2b36;overflow:hidden}
#paper h4{font-weight:800;font-size:38px;letter-spacing:-1px;border-bottom:3px solid #2b2b36;padding-bottom:14px;margin-bottom:22px}
.prow{display:flex;align-items:center;gap:20px;font-weight:600;font-size:31px;padding:15px 0;border-bottom:2px dashed #c9c2ad}
.pbox{width:40px;height:40px;border:3px solid #2b2b36;border-radius:6px;display:flex;align-items:center;justify-content:center;font-weight:800;font-size:34px;flex:none}
.grease{position:absolute;border-radius:50%;background:radial-gradient(closest-side,rgba(150,105,40,.55),rgba(150,105,40,.25) 60%,transparent)}
#ring2{position:absolute;width:150px;height:150px;border-radius:50%;border:12px solid rgba(120,80,30,.35);right:40px;bottom:60px}
#outline{position:absolute;border:5px dashed rgba(174,180,230,.55);border-radius:14px;left:${LAY.pcx - Math.round(LAY.ph * 0.31)}px;top:${LAY.ptop + Math.round(LAY.ph * 0.07)}px;width:${Math.round(LAY.ph * 0.62)}px;height:${Math.round(LAY.ph * 0.82)}px}
#lost{position:absolute;left:50%;top:42%;transform:translate(-50%,-50%);font-weight:800;font-size:110px;letter-spacing:6px;color:#EE3B3B;border:9px solid #EE3B3B;border-radius:18px;padding:6px 34px}
.bub{position:absolute;background:rgba(255,255,255,.96);color:#1B1A3D;font-weight:700;font-size:40px;border-radius:30px 30px 30px 8px;padding:22px 32px;box-shadow:0 20px 50px rgba(0,0,0,.35);white-space:nowrap}
.bub b{color:#8288B8;font-weight:600;font-size:28px;display:block;margin-bottom:6px;letter-spacing:.5px}
#phoneWrap{position:absolute;left:${LAY.pcx - PW / 2}px;top:${LAY.ptop}px;width:${PW}px;height:${LAY.ph}px;transform-origin:50% 50%}
#phone{position:absolute;inset:0;border-radius:${Math.round(PW * 0.15)}px;padding:${PB}px;background:linear-gradient(145deg,#C9CEE3,#4A4F6B 55%,#C9CEE3);box-shadow:0 0 0 2px rgba(255,255,255,.18) inset,0 50px 120px rgba(0,0,0,.55),0 0 110px rgba(51,195,176,.25)}
#screen{position:relative;width:100%;height:100%;border-radius:${Math.round(PW * 0.15) - PB}px;overflow:hidden;background:#fff}
#app{position:absolute;inset:0;width:100%;height:100%;object-fit:cover;object-position:top}
#ring{position:absolute;width:110px;height:110px;margin:-55px 0 0 -55px;border-radius:50%;border:6px solid ${TEAL};opacity:0;left:50%}
#tag{position:absolute;background:${TEAL};color:#06231F;font-weight:800;font-size:42px;padding:18px 32px;border-radius:999px;white-space:nowrap;box-shadow:0 16px 40px rgba(0,0,0,.35);opacity:0}
#cta{position:absolute;inset:0;display:flex;align-items:center;justify-content:center}
#cc{display:flex;flex-direction:column;align-items:center;text-align:center;padding:${SC.v ? '70px 60px' : '64px 110px'};border-radius:60px;background:rgba(18,22,58,.72);border:1.5px solid rgba(160,190,255,.30);box-shadow:0 40px 120px rgba(0,0,0,.45),inset 0 1px 0 rgba(255,255,255,.25)}
#ctag{font-weight:800;font-size:${SC.v ? 78 : 100}px;letter-spacing:-2.5px;margin-top:34px} #ctag b{color:${TEAL}}
#cpill{margin-top:38px;background:${TEAL};color:#06231F;font-weight:800;font-size:${SC.v ? 46 : 60}px;padding:20px 44px;border-radius:999px}
#chandle{font-weight:700;font-size:${SC.v ? 40 : 50}px;color:#AEB4E6;margin-top:28px}
#sweep{position:absolute;inset:-20%;background:linear-gradient(105deg,transparent 42%,rgba(255,255,255,.10) 50%,transparent 58%);pointer-events:none}
/* reel chrome */
#lock{position:absolute;left:0;right:0;top:250px;display:flex;justify-content:center}
#title{position:absolute;left:0;width:1080px;text-align:center;font-weight:800;line-height:1.02;letter-spacing:-3px;transform-origin:50% 0}
#title span{display:inline-block} #title .tl{color:${TEAL}}
#tsub{position:absolute;left:0;width:1080px;top:1010px;text-align:center;font-weight:600;font-size:46px;color:#AEB4E6}
#tsub span{display:inline-block}
#card{position:absolute;left:${CARD.x}px;top:${CARD.y}px;width:${CARD.w}px;height:${CARD.h}px;border-radius:40px;overflow:hidden;box-shadow:0 0 0 2px rgba(160,190,255,.28),0 40px 120px rgba(0,0,0,.55),0 0 90px rgba(72,84,214,.30);transform-origin:50% 50%}
#tabs{position:absolute;left:${CARD.x}px;top:${CARD.y + CARD.h + 40}px;width:${CARD.w - 100}px;display:flex;gap:10px}
.tab{position:relative;flex:1;height:88px;border-radius:24px;display:flex;align-items:center;justify-content:center;font-weight:800;font-size:28px;letter-spacing:-.5px;white-space:nowrap;overflow:hidden;border:2px solid rgba(160,190,255,.22);background:rgba(255,255,255,.06);color:#8F96CC}
.tab .fill{position:absolute;left:0;bottom:0;height:7px;background:${TEAL}}
.tab .lab{position:relative}
#scrub{position:absolute;left:${CARD.x}px;top:${CARD.y + CARD.h + 162}px;width:${CARD.w - 100}px;height:60px}
.tick{position:absolute;bottom:22px;width:3px;border-radius:2px;background:rgba(174,180,230,.35)}
#head{position:absolute;bottom:10px;width:4px;height:52px;margin-left:-2px;border-radius:3px;background:${TEAL};box-shadow:0 0 18px ${TEAL}}
#time{position:absolute;right:0;top:10px;font-weight:600;font-size:28px;color:#8F96CC;font-variant-numeric:tabular-nums}
#note{position:absolute;left:60px;width:860px;top:${CARD.y + CARD.h + 260}px}
#nk{font-weight:800;font-size:28px;letter-spacing:6px;color:${TEAL}}
#nb{font-weight:800;font-size:50px;line-height:1.14;letter-spacing:-1.2px;margin-top:16px}
#ns{font-weight:600;font-size:34px;line-height:1.25;color:#AEB4E6;margin-top:14px}
#nk span,#nb span,#ns span{display:inline-block}
#rtag{position:absolute;left:26px;bottom:24px;background:${TEAL};color:#06231F;font-weight:800;font-size:34px;padding:14px 26px;border-radius:999px;white-space:nowrap;box-shadow:0 12px 30px rgba(0,0,0,.4);opacity:0}`;

const LOGO = (id, size) => `<svg id="${id}" viewBox="0 0 100 100" width="${size}" height="${size}"><rect class="lb" x="10" y="10" width="80" height="80" rx="22" fill="none" stroke="#fff" stroke-width="8" pathLength="1" stroke-dasharray="1" stroke-dashoffset="1"/><path class="lc" d="M30 51 L44 65 L70 37" fill="none" stroke="${TEAL}" stroke-width="10" stroke-linecap="round" stroke-linejoin="round" pathLength="1" stroke-dasharray="1" stroke-dashoffset="1"/></svg>`;
const sceneHtml = `<div id="scene"><div id="sbg"></div><div id="g1" class="glow"></div><div id="g2" class="glow"></div><div id="grid"></div>
<div id="intro"><div id="ilogo">${LOGO('il', '100%')}</div><div id="iname"></div><div id="iline"></div></div>
<div id="txt"><div id="sk"></div><div id="sh"></div><div id="ss"></div></div>
<div id="outline"><div id="lost">LOST</div></div>
<div id="paper"><h4>Daily checklist</h4>${['Cooler temps', 'Hand sink', 'Fryer clean', 'Floors', 'Labels & dates', 'Supplies'].map((r, i) => `<div class="prow"><div class="pbox" id="pb${i}"></div>${r}</div>`).join('')}
<div class="grease" id="gr0" style="width:300px;height:260px;left:-40px;top:250px"></div><div class="grease" id="gr1" style="width:220px;height:200px;right:-20px;top:120px"></div><div class="grease" id="gr2" style="width:260px;height:240px;left:120px;bottom:-60px"></div><div id="ring2"></div></div>
<div class="bub" id="bu0"><b>Text · 4:12 PM</b>Was the cooler fixed?</div><div class="bub" id="bu1"><b>Text · 4:31 PM</b>Who has the photo?</div><div class="bub" id="bu2"><b>Text · 5:02 PM</b>Which stand was it?</div>
<div id="phoneWrap"><div id="phone"><div id="screen"><img id="app"><div id="ring"></div></div></div></div><div id="tag"></div>
<div id="cta"><div id="cc">${mark(SC.v ? 150 : 160, { onDark: true })}<div id="ctag">Walk it. Fix it. <b>Prove it.</b></div><div id="cpill">Free 30-day pilot · DM PILOT</div><div id="chandle">@sdxinspection</div></div></div>
<div id="sweep"></div></div>`;
const reelHtml = `<div id="page"></div><div id="lock">${lockup(64)}</div>
<div id="title"><div><span>The</span> <span>anatomy</span> <span>of</span> <span>a</span></div><div><span class="tl">40-second</span> <span>app</span> <span>video</span></div></div>
<div id="tsub"><span>We</span> <span>broke</span> <span>ours</span> <span>down.</span></div>
<div id="card">${sceneHtml}<div id="rtag"></div></div>
<div id="tabs">${PARTS.map((p, i) => `<div class="tab" id="tb${i}" style="flex:${[0.8, 1, 1, 1.4][i]}"><div class="fill" id="tf${i}"></div><div class="lab" id="tl${i}">${p.tab}</div></div>`).join('')}</div>
<div id="scrub">${[...Array(81)].map((_, i) => { const x = i / 80 * (CARD.w - 270); const big = i % 10 === 0 || PARTS.some(p => Math.abs(p.a / SCENE * 80 - i) < .5); return `<div class="tick" style="left:${x - 1.5}px;height:${big ? 26 : 14}px${big ? ';background:rgba(174,180,230,.6)' : ''}"></div>`; }).join('')}<div id="head"></div><div id="time"></div></div>
<div id="note"><div id="nk"></div><div id="nb"></div><div id="ns"></div></div>`;

const ZS = 860 / PSW, ZC = { x: 450, y: Math.round(CARD.h * 0.42) };
const DATA = { MODE, T, HOOK, SCENE, FPS, PARTS, ZS, ZC, PB, SEGS: SEGS.map(s => ({ id: s.id, a: s.a, b: s.b, sp: s.sp, n: s.n, seq: s.seq, k: s.k, h: s.h, s: s.s, taps: s.taps })), SC, LAY, CARD, page };
const html = `<!doctype html><meta charset=utf-8><style>${css}</style>${MODE === 'reel' ? reelHtml : sceneHtml}
<script>
const D=${JSON.stringify(DATA)};
const $=id=>document.getElementById(id);
const cl=(x,a=0,b=1)=>Math.min(b,Math.max(a,x));
function spring(t,r=0.5,z=0.82){ if(t<=0) return 0; const w=2*Math.PI/r, wd=w*Math.sqrt(1-z*z); return 1-Math.exp(-z*w*t)*(Math.cos(wd*t)+(z*w/wd)*Math.sin(wd*t)); }
const ease=t=>t<=0?0:t>=1?1:1-Math.pow(1-t,3);
const mix=(a,b,k)=>a+(b-a)*k;
const setWords=(el,txt)=>{ if(el.dataset.t===txt) return false; el.dataset.t=txt; el.innerHTML=txt.split('|').map(l=>l.split(' ').map(w=>'<span>'+w+'&nbsp;</span>').join('')).join('<br>'); return true; };
function words(el,t0,t,stag=.05,dy=30){ [...el.querySelectorAll('span')].forEach((s,i)=>{ const u=t-t0-i*stag; const k=spring(u,.55,.8); s.style.opacity=cl(u/.18); s.style.transform='translateY('+(dy*(1-k)).toFixed(1)+'px)'; s.style.filter='blur('+(12*(1-cl(u/.3))).toFixed(2)+'px)'; }); }
const vis=(el,o,tf)=>{ el.style.opacity=o; el.style.visibility=o>0.002?'visible':'hidden'; if(tf!=null) el.style.transform=tf; };
const L=D.LAY;
function scene(ts,z=0){
  // background drift
  $('g1').style.transform='translate('+(mix(-200,D.SC.w*0.15,0.5+0.5*Math.sin(ts*.21))).toFixed(0)+'px,'+(-200+120*Math.cos(ts*.17)).toFixed(0)+'px)';
  $('g2').style.transform='translate('+(D.SC.w*0.55+120*Math.cos(ts*.19)).toFixed(0)+'px,'+(D.SC.h*0.4+100*Math.sin(ts*.23)).toFixed(0)+'px)';
  $('grid').style.backgroundPosition='0 '+(ts*18).toFixed(1)+'px';
  // ---- intro 0..6: logo draws, name + line spring in, block lifts away at 5.2
  const io=1-ease((ts-5.2)/.6); vis($('intro'),ts<6?io:0,'translateY('+(-60*(1-io))+'px) scale('+(1-.06*(1-io))+')');
  const il=$('il'); il.querySelector('.lb').style.strokeDashoffset=1-ease(ts/.8); il.querySelector('.lc').style.strokeDashoffset=1-ease((ts-.6)/.45);
  $('ilogo').style.transform='scale('+(.85+.15*spring(ts,.6,.7))+')';
  setWords($('iname'),'SDX Inspect'); setWords($('iline'),'Inspections, done on the phone.');
  words($('iname'),.9,ts,.08,40); words($('iline'),1.6,ts,.05);
  // ---- text column: problem + the three beats
  let tk=null, t0=0;
  if(ts>=6.2&&ts<15) { tk={k:'THE PROBLEM',h:'Problems found.|Then lost.',s:'Paper gets greasy. Texts get buried.'}; t0=6.2; }
  for(const s of D.SEGS) if(ts>=s.a&&ts<s.b) { tk=s; t0=s.a+(s.id==='A'?.2:0); }
  const tx=$('txt');
  if(tk){ setWords($('sk'),tk.k); setWords($('sh'),tk.h); setWords($('ss'),tk.s); words($('sk'),t0,ts,.03,16); words($('sh'),t0+.12,ts,.06,40); words($('ss'),t0+.45,ts,.03,20);
    const end=(tk.b||15); vis(tx,(D.MODE==='reel'&&ts>=14.9)?0:1-ease((ts-(end-.22))/.22)); } else vis(tx,0); // the reel's note narrates the beats
  // ---- problem visuals 6..15: paper checklist → grease → flies off → LOST + texts
  const pin=spring(ts-6.0,.7,.75), fly=ease((ts-9.9)/.9);
  vis($('paper'),ts>5.9&&ts<11.2?cl((ts-5.9)/.2)*(1-fly):0,'translate('+(mix(0,D.SC.v?700:900,fly)).toFixed(0)+'px,'+(mix(220*(1-pin),D.SC.v?520:-480,fly)).toFixed(0)+'px) rotate('+(mix(-4+6*(1-pin),28,fly)).toFixed(2)+'deg) scale('+(.9+.1*pin)+')');
  ['✓','✓','✗','','',''].forEach((m,i)=>{ const b=$('pb'+i); const on=ts>=6.9+i*.32; b.textContent=on?m:''; b.style.color=m==='✗'?'#D92D2D':'#15803D'; });
  [0,1,2].forEach(i=>{ const k=ease((ts-(8.1+i*.42))/.5); const g=$('gr'+i); g.style.opacity=k; g.style.transform='scale('+(.4+.6*k)+')'; });
  $('ring2').style.opacity=ease((ts-8.9)/.4);
  const lo=ts>10.4&&ts<15?cl((ts-10.4)/.3)*(1-ease((ts-14.5)/.4)):0; vis($('outline'),lo);
  const lk=spring(ts-10.6,.45,.55); $('lost').style.transform='translate(-50%,-50%) rotate(-12deg) scale('+(ts<10.6?2.4:mix(2.4,1,lk)).toFixed(3)+')'; $('lost').style.opacity=cl((ts-10.6)/.12);
  const bx=D.SC.v?[70,330,120]:[L.pcx-410,L.pcx-150,L.pcx-370], by=D.SC.v?[L.ptop+40,L.ptop+470,L.ptop+630]:[L.ptop+90,L.ptop+520,L.ptop+700];
  [0,1,2].forEach(i=>{ const s0=11.5+i*.75, k=spring(ts-s0,.5,.7); const o=ts>s0&&ts<15?cl((ts-s0)/.12)*(1-ease((ts-14.5)/.4)):0; const b=$('bu'+i); b.style.left=bx[i]+'px'; b.style.top=by[i]+'px'; vis(b,o,'translateY('+(40*(1-k)).toFixed(1)+'px) scale('+(.85+.15*k).toFixed(3)+')'); });
  // ---- phone 14.6..34.3: the real app, one segment per beat
  const pe=spring(ts-14.6,.75,.78), px=ease((ts-34.0)/.5);
  const ph=$('phoneWrap'); vis(ph,ts>14.5&&ts<34.6?cl((ts-14.5)/.15)*(1-px):0,'translateY('+(mix(D.SC.h*0.9,0,pe)+8*(1-z)*Math.sin(ts*1.1)).toFixed(1)+'px) rotateX('+mix(24,0,pe).toFixed(2)+'deg) scale('+(1-.2*px).toFixed(3)+')');
  ph.parentElement.style.perspective='2000px';
  let seg=D.SEGS[0]; for(const s of D.SEGS) if(ts>=s.a) seg=s;
  const fi=Math.max(1,Math.min(seg.n,Math.floor(cl(ts-seg.a,0,seg.b-seg.a)*seg.sp*D.FPS)+1));
  const src='file://'+seg.seq+'/'+String(fi).padStart(5,'0')+'.jpg'; const img=$('app'); if(img.dataset.s!==src){ img.dataset.s=src; img.src=src; }
  let ring=null, tag=null; for(const s of D.SEGS) for(const c of s.taps){ if(ts>=c.t&&ts<c.t+.6) ring=c; if(c.key&&ts>=c.t&&ts<Math.min(c.t+2.2,s.b-.1)) tag=c; }
  const R=$('ring'); if(ring){ const k=(ts-ring.t)/.6; R.style.top=(ring.y*100)+'%'; R.style.opacity=((1-k)*.9).toFixed(3); R.style.transform='scale('+((.4+1.4*ease(k))/(1+1.6*z)).toFixed(3)+')'; } else R.style.opacity=0;
  const tg=$('tag'); if(tag){ if(tg.dataset.t!==tag.text){ tg.dataset.t=tag.text; tg.textContent=tag.text.replace(/\\s*[📷]/u,''); }
    const k=spring(ts-tag.t,.5,.7); const w=tg.offsetWidth;
    const left=D.SC.v?(L.pcx-w/2):L.tx, top=D.SC.v?(L.ptop+L.ph+30):(L.ty+700); tg.style.left=left+'px'; tg.style.top=top+'px';
    vis(tg,D.MODE==='reel'?0:cl((ts-tag.t)/.1),'translateY('+(-20*(1-k)).toFixed(1)+'px) scale('+(.8+.2*k).toFixed(3)+')'); } else vis(tg,0);
  if(D.MODE==='reel'){ const rt=$('rtag'); if(tag){ if(rt.dataset.t!==tag.text){ rt.dataset.t=tag.text; rt.textContent=tag.text.replace(/\s*[📷]/u,''); }
      const k=spring(ts-tag.t,.5,.7); vis(rt,cl((ts-tag.t)/.1)*z,'translateY('+(24*(1-k)).toFixed(1)+'px) scale('+(.85+.15*k).toFixed(3)+')'); } else vis(rt,0); }
  // ---- call to action 34..40
  const ck=spring(ts-34.25,.7,.78); vis($('cta'),ts>=34.2?cl((ts-34.2)/.25):0); $('cc').style.transform='translateY('+(140*(1-ck)).toFixed(1)+'px) scale('+(.9+.1*ck).toFixed(3)+')';
  // light sweep on each part change
  const sw=[5.9,14.8,34.3].map(s=>cl((ts-s)/.9)).find(k=>k>0&&k<1); $('sweep').style.transform='translateX('+(sw!=null?(-1400+2800*ease(sw)):-3000)+'px)';
  return img;
}
// the close-up follows the taps: it starts moving 0.55 s before each one and settles on it; clamped inside the screen
const KEYS=D.SEGS.flatMap(s=>s.taps.map(c=>({t:c.t,y:c.y}))).sort((a,b)=>a.t-b.t);
function focusY(ts){ let y=KEYS.length?KEYS[0].y:0.4; for(const k of KEYS){ const u=ease((ts-(k.t-.55))/.5); if(u<=0) break; y=mix(y,k.y,u); }
  const top=L.ptop+D.PB, h=L.ph-2*D.PB, above=D.ZC.y/D.ZS, below=(D.CARD.h-D.ZC.y)/D.ZS; return Math.min(top+h-below, Math.max(top+above, top+y*h)); }
function chrome(g){
  const ts=g-D.HOOK;
  // title: big in the middle during the hook, then up to its place over the card
  const up=spring(g-2.15,.7,.82); const sz=mix(100,64,up), top=mix(640,350,up);
  const ti=$('title'); ti.style.fontSize=sz+'px'; ti.style.top=top+'px'; words(ti,.15,g,.09,40);
  vis($('tsub'),cl((g-0.55)/.25)*(1-ease((g-2.0)/.18))); words($('tsub'),0.55,g,.05,20);
  const lk=ease((g-2.3)/.4); vis($('lock'),lk,'translateY('+(-20*(1-lk))+'px)');
  const ce=spring(g-(D.HOOK-.45),.7,.8); vis($('card'),cl((g-(D.HOOK-.45))/.2),'scale('+(.86+.14*ce).toFixed(4)+') translateY('+(60*(1-ce)).toFixed(1)+'px)');
  const te=spring(g-(D.HOOK-.25),.7,.8); $('tabs').style.opacity=cl((g-(D.HOOK-.25))/.25); $('tabs').style.transform='translateY('+(40*(1-te)).toFixed(1)+'px)';
  $('scrub').style.opacity=cl((g-(D.HOOK-.1))/.25);
  const tsc=cl(ts,0,D.SCENE);
  D.PARTS.forEach((p,i)=>{ const tb=$('tb'+i), f=$('tf'+i), lab=$('tl'+i); const done=tsc>=p.b-0.001||ts>D.SCENE, act=tsc>=p.a&&tsc<p.b&&ts<=D.SCENE;
    const prog=act?cl((tsc-p.a)/(p.b-p.a)):(done?1:0); f.style.width=(prog*100).toFixed(2)+'%';
    tb.style.background=act?'#FFFFFF':(done?'rgba(51,195,176,.14)':'rgba(255,255,255,.06)'); tb.style.borderColor=act?'#FFFFFF':(done?'rgba(51,195,176,.55)':'rgba(160,190,255,.22)');
    tb.style.color=act?'${C.navyDeep}':(done?'#BDF3EA':'#8F96CC'); lab.textContent=(done&&!act?'✓ ':'')+p.tab;
    const pk=act?spring(tsc-p.a,.45,.6):1; tb.style.transform='scale('+(act?(1+.04*Math.sin(Math.PI*cl((tsc-p.a)/.35))):1).toFixed(4)+')'; });
  $('head').style.left=(tsc/D.SCENE*(D.CARD.w-270)).toFixed(1)+'px';
  const s=Math.floor(tsc); $('time').textContent='0:'+String(s).padStart(2,'0')+' / 0:40';
  // the note under the bar
  let nk, nb, n0, ns='';
  const beat=D.SEGS.find(s=>tsc>=s.a&&tsc<s.b&&ts<=D.SCENE);
  if(ts<0){ nk=''; nb=''; n0=0; }
  else if(beat){ nk='03 · USE CASE · '+beat.k; nb=beat.h.replace('|',' '); ns=beat.s; n0=D.HOOK+beat.a+(beat.id==='A'?.45:.12); }
  else if(ts<=D.SCENE){ const i=D.PARTS.findIndex(p=>tsc>=p.a&&tsc<p.b); const p=D.PARTS[i<0?3:i]; nk=String((i<0?3:i)+1).padStart(2,'0')+' · '+p.tab.toUpperCase()+' · '+p.a+'–'+p.b+' s'; nb=p.note; n0=D.HOOK+p.a+(p.a===0?.1:.15); }
  else { nk='SAVE THIS STRUCTURE'; nb='Intro → Problem → Use case → Call to action.'; n0=D.HOOK+D.SCENE+.15; }
  setWords($('nk'),nk); setWords($('nb'),nb); setWords($('ns'),ns); words($('nk'),n0,g,.02,14); words($('nb'),n0+.12,g,.035,24); words($('ns'),n0+.4,g,.025,16);
  const s0=D.CARD.w/1920, z=ts<15.35||ts>33.95?0:ease((ts-15.35)/.6)*(1-ease((ts-33.5)/.45));
  const F={x:L.pcx, y:focusY(tsc)}, zs=mix(s0,D.ZS,z), Q={x:mix(s0*F.x,D.ZC.x,z), y:mix(s0*F.y,D.ZC.y,z)};
  const sc=$('scene'); sc.style.transform='translate('+(Q.x-zs*F.x).toFixed(2)+'px,'+(Q.y-zs*F.y).toFixed(2)+'px) scale('+zs.toFixed(5)+')';
  return scene(D.MODE==='reel'?cl(ts,0,D.SCENE):ts, z);
}
window.render=async f=>{ const g=f/D.FPS; const img=D.MODE==='reel'?chrome(g):scene(Math.min(g,D.SCENE)); if(!(img.complete&&img.naturalWidth)) await new Promise(r=>{ img.onload=()=>r(); img.onerror=()=>r(); setTimeout(r,3000); }); };
</script>`;
writeFileSync(`${OUT}/stage.html`, html);

const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--no-sandbox', '--allow-file-access-from-files'] });
const p = await b.newPage({ viewport: { width: page.w, height: page.h } });
await p.goto(`file://${OUT}/stage.html`); await p.evaluate(() => document.fonts.ready);
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

// sound: bed + whoosh into each part + UI clicks on taps + shimmer on the logo and the CTA, −14 LUFS
const H = HOOK;
const taps = SEGS.flatMap(s => s.taps.map(c => H + c.t));
const click = taps.map(s => `0.5*sin(2*PI*2600*(t-${s.toFixed(2)}))*exp(-90*max(t-${s.toFixed(2)},0))*gte(t,${s.toFixed(2)})`).join('+') || '0';
const bed = `0.05*(sin(2*PI*110*t)+sin(2*PI*164.8*t)+sin(2*PI*220*t)+0.6*sin(2*PI*329.6*t))*(0.65+0.35*sin(2*PI*0.125*t))+0.30*sin(2*PI*(46+70*exp(-30*mod(t,0.5)))*mod(t,0.5))*exp(-9*mod(t,0.5))*gte(t,${(H + 6).toFixed(2)})*lt(t,${(H + 34).toFixed(2)})`;
const sh = s => `0.16*sin(2*PI*1318*(t-${s.toFixed(2)}))*exp(-2.5*max(t-${s.toFixed(2)},0))*gte(t,${s.toFixed(2)})`;
const shimmer = [H + 0.2, H + 34.3].map(sh).join('+');
const wh = [H - .45, H + 5.6, H + 14.4, H + 33.9].filter(s => s > 0).map(s => `between(t,${s.toFixed(2)},${(s + .45).toFixed(2)})*sin(PI*(t-${s.toFixed(2)})/0.45)`).join('+');
const out = `${DIR}out/anatomy-${MODE}.mp4`;
execFileSync(FF, ['-loglevel', 'error', '-y', '-framerate', String(FPS), '-i', `${OUT}/f/%05d.jpg`,
  '-f', 'lavfi', '-i', `aevalsrc='${bed}+${shimmer}':s=48000:d=${T.toFixed(2)}`,
  '-f', 'lavfi', '-i', `aevalsrc='${click}':s=48000:d=${T.toFixed(2)}`,
  '-f', 'lavfi', '-i', `anoisesrc=d=${T.toFixed(2)}:c=pink:a=0.5:r=48000`,
  '-filter_complex', `[3:a]volume='0.35*(${wh})':eval=frame,highpass=f=500,lowpass=f=6000[w];[2:a]highpass=f=900[c];[1:a][c][w]amix=inputs=3:normalize=0,afade=t=in:d=0.2,afade=t=out:st=${(T - 1).toFixed(2)}:d=1,loudnorm=I=-14:TP=-1.5:LRA=9,aformat=sample_rates=48000:channel_layouts=stereo[a]`,
  '-map', '0:v', '-map', '[a]', '-c:v', 'libx264', '-preset', 'slow', '-crf', '17', '-maxrate', '6M', '-bufsize', '12M', '-pix_fmt', 'yuv420p', '-profile:v', 'high', '-g', '60', '-r', String(FPS),
  '-c:a', 'aac', '-b:a', '160k', '-movflags', '+faststart', '-shortest', out]);
console.log('anatomy', MODE, out, T.toFixed(1) + ' s', N + ' frames', ((Date.now() - t0) / 1000).toFixed(0) + ' s');
