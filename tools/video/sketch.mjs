// node sketch.mjs [--at 1,5,12]  → out/sketch-reel.mp4 (1080×1920, 30 fps, AAC)
// "Paper checklist → inspection app": a hand-written checklist draws itself on paper (left), an arrow points to a
// dark phone (right), the written rows fly into the phone, the screen lights up and the phone comes to the middle,
// big, playing the real app: a 50°F cooler flagged, a BEFORE photo in the report, the crew's AFTER photo → fixed.
// Same method as anatomy.mjs / motion.mjs: every frame is a pure function of t rendered in Chromium; the phone
// screen is the real app recorded by pov.mjs (out/pov_<clip>, demo venue, made-up people); sound is synthesized.
import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync, rmSync } from 'fs';
import { execFileSync } from 'child_process';
import { chromium } from '/home/user/Claude/node_modules/playwright-core/index.mjs';
import { TEAL, fontCss, mark, lockup } from './sdxmark.mjs';
const FF = process.env.FFMPEG || '/tmp/ff/node_modules/ffmpeg-static/ffmpeg';
const DIR = new URL('.', import.meta.url).pathname;
const args = process.argv.slice(2);
const opt = k => { const i = args.indexOf('--' + k); return i >= 0 ? args[i + 1] : null; };
const FPS = 30, T = 23.0, N = Math.round(T * FPS), W = 1080, H = 1920;
const OUT = `${DIR}out/sketch`; mkdirSync(OUT, { recursive: true });

// ---- the three app moments: source window [from, to] of a pov.mjs recording, played over scene [a, b]
const SEGS = [
  { id: 'A', clip: 'g_temps', from: 7.9, to: 11.7, a: 10.6, b: 13.8, cap: 'A 50°F cooler? <b>Flagged on the spot.</b>' },
  { id: 'B', clip: 'g_problem', from: 14.6, to: 18.3, a: 13.8, b: 17.0, cap: 'A <b>BEFORE photo</b>, right in the report.' },
  { id: 'C', clip: 'crew', from: 13.4, to: 19.9, a: 17.0, b: 21.0, cap: 'The crew sends the AFTER. <b>Fixed.</b>' },
];
for (const s of SEGS) {
  s.sp = (s.to - s.from) / (s.b - s.a);
  const src = `${DIR}out/pov_${s.clip}`;
  const { cues } = JSON.parse(readFileSync(`${src}/cues.json`, 'utf8'));
  s.taps = cues.filter(c => c.t >= s.from && c.t <= s.to && c.y != null).map(c => ({ t: s.a + (c.t - s.from) / s.sp, y: c.y / 844 }));
  const seq = `${OUT}/seq_${s.id}`, stamp = `${seq}/w_${s.clip}_${s.from}_${s.to}`;
  if (!existsSync(stamp)) {
    rmSync(seq, { recursive: true, force: true }); mkdirSync(seq, { recursive: true });
    execFileSync(FF, ['-loglevel', 'error', '-y', '-ss', String(s.from), '-i', `${src}/master.mp4`, '-t', String(s.to - s.from + 0.2), '-vf', `fps=${FPS},scale=900:-2:flags=lanczos`, '-q:v', '3', `${seq}/%05d.jpg`]);
    writeFileSync(stamp, '');
  }
  s.seq = seq; s.n = readdirSync(seq).filter(f => f.endsWith('.jpg')).length;
}

// ---- geometry. The phone is laid out at its BIG size (middle of the screen) and scaled down for the paper part.
const PB = 14, BIG = { top: 340, h: 1250 }; BIG.w = Math.round((BIG.h - 2 * PB) * 1080 / 2338) + 2 * PB; BIG.left = Math.round(W / 2 - BIG.w / 2);
const SMALL = { cx: 830, top: 690, h: 760 }; SMALL.s = SMALL.h / BIG.h; SMALL.left = SMALL.cx - SMALL.s * BIG.w / 2;
const PAPER = { x: 60, y: 660, w: 440, h: 660, rot: -3 };
// the written rows (paper coordinates); kind: t = title, r = row with a box, f = fill-in row, n = red note
const ROWS = [
  { k: 't', txt: 'Daily checklist', x: 38, y: 34, size: 62 },
  { k: 'f', txt: 'Cooler ____ °F', x: 40, y: 150, size: 52 },
  { k: 'r', txt: 'Hand sink', x: 40, y: 232, size: 52 },
  { k: 'r', txt: 'Gloves on', x: 40, y: 314, size: 52 },
  { k: 'r', txt: 'Floors clean', x: 40, y: 396, size: 52 },
  { k: 'f', txt: 'Photo? ______', x: 40, y: 478, size: 52 },
  { k: 'n', txt: 'fixed??', x: 210, y: 566, size: 54 },
];
ROWS.forEach((r, i) => { r.a = 2.35 + i * 0.6; r.d = r.k === 't' ? 0.7 : 0.48; });

const css = `${fontCss(DIR)}@font-face{font-family:Hand;font-weight:700;src:url(file://${DIR}fonts/caveat700.woff2)}
*{margin:0;box-sizing:border-box} html,body{width:${W}px;height:${H}px;overflow:hidden;background:#070A1F;font-family:I,Arial;-webkit-font-smoothing:antialiased;color:#fff}
#bg{position:absolute;inset:0;background:radial-gradient(900px 700px at 20% 18%,rgba(72,84,214,.30),transparent 62%),radial-gradient(900px 900px at 90% 70%,rgba(51,195,176,.16),transparent 60%),linear-gradient(#0E1336,#070A1F)}
#grid{position:absolute;inset:0;background-image:linear-gradient(rgba(160,190,255,.06) 1px,transparent 1px),linear-gradient(90deg,rgba(160,190,255,.06) 1px,transparent 1px);background-size:60px 60px}
#lock{position:absolute;left:0;right:0;top:236px;display:flex;justify-content:center}
#title{position:absolute;left:0;width:${W}px;top:330px;text-align:center;font-weight:800;font-size:104px;line-height:1.02;letter-spacing:-3.5px}
#title span{display:inline-block} #title .tl{color:${TEAL}}
.lab{position:absolute;font-weight:800;font-size:30px;letter-spacing:7px;color:#AEB4E6}
#paper{position:absolute;left:${PAPER.x}px;top:${PAPER.y}px;width:${PAPER.w}px;height:${PAPER.h}px;border-radius:12px;background:#FDFBF4;box-shadow:0 30px 80px rgba(0,0,0,.5);overflow:hidden;
  background-image:linear-gradient(90deg,transparent 26px,rgba(238,59,59,.35) 26px,rgba(238,59,59,.35) 28px,transparent 28px),repeating-linear-gradient(transparent 0 81px,rgba(70,110,200,.20) 81px 83px);background-position:0 0,0 30px}
.row{position:absolute;font-family:Hand,cursive;font-weight:700;color:#23233A;white-space:nowrap;line-height:1}
.row .bx{display:inline-block;width:.62em;height:.62em;border:4px solid #23233A;border-radius:5px;margin-right:.28em;transform:rotate(-4deg) translateY(.04em)}
.row.n{color:#D92D2D}
#pen{position:absolute;width:16px;height:16px;margin:-8px 0 0 -8px;border-radius:50%;background:#2A295C;box-shadow:0 0 0 4px rgba(42,41,92,.18);opacity:0}
#psvg{position:absolute;left:0;top:0;overflow:visible}
#arrow{position:absolute;left:0;top:0;width:${W}px;height:${H}px;overflow:visible;pointer-events:none}
.fly{position:absolute;font-family:Hand,cursive;font-weight:700;color:#23233A;white-space:nowrap;line-height:1;transform-origin:0 50%;opacity:0;padding:8px 16px;margin:-8px 0 0 -16px;border-radius:14px;background:#FDFBF4;box-shadow:0 14px 34px rgba(0,0,0,.45)}
.fly .bx{display:inline-block;width:.62em;height:.62em;border:4px solid currentColor;border-radius:5px;margin-right:.28em;transform:rotate(-4deg) translateY(.04em)}
#phoneWrap{position:absolute;left:${BIG.left}px;top:${BIG.top}px;width:${BIG.w}px;height:${BIG.h}px;transform-origin:0 0}
#glow{position:absolute;inset:-120px;border-radius:50%;background:radial-gradient(closest-side,rgba(51,195,176,.40),transparent 70%);opacity:0}
#phone{position:absolute;inset:0;border-radius:${Math.round(BIG.w * 0.15)}px;padding:${PB}px;background:linear-gradient(145deg,#C9CEE3,#4A4F6B 55%,#C9CEE3);box-shadow:0 0 0 2px rgba(255,255,255,.18) inset,0 50px 120px rgba(0,0,0,.55)}
#screen{position:relative;width:100%;height:100%;border-radius:${Math.round(BIG.w * 0.15) - PB}px;overflow:hidden;background:#0A0E2A}
#off{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;background:radial-gradient(closest-side,#141A44,#0A0E2A)}
#app{position:absolute;inset:0;width:100%;height:100%;object-fit:cover;object-position:top;opacity:0}
#flash{position:absolute;inset:0;background:#fff;opacity:0}
#ring{position:absolute;width:120px;height:120px;margin:-60px 0 0 -60px;border-radius:50%;border:7px solid ${TEAL};opacity:0;left:50%}
#cap{position:absolute;left:30px;width:${W - 60}px;top:236px;text-align:center;font-weight:800;font-size:52px;letter-spacing:-1.2px;line-height:1.1}
#cap b{color:${TEAL};font-weight:800} #cap span{display:inline-block}
#pain{position:absolute;left:0;width:${W}px;top:1492px;text-align:center;font-weight:600;font-size:44px;color:#AEB4E6}
#pain span{display:inline-block}
#end{position:absolute;inset:0;display:flex;align-items:center;justify-content:center}
#ec{display:flex;flex-direction:column;align-items:center;text-align:center;padding:70px 64px;border-radius:60px;background:rgba(18,22,58,.78);border:1.5px solid rgba(160,190,255,.30);box-shadow:0 40px 120px rgba(0,0,0,.45),inset 0 1px 0 rgba(255,255,255,.25)}
#etag{font-weight:800;font-size:82px;letter-spacing:-2.5px;margin-top:34px} #etag b{color:${TEAL}}
#esub{font-weight:600;font-size:42px;color:#AEB4E6;margin-top:22px}
#epill{margin-top:40px;background:${TEAL};color:#06231F;font-weight:800;font-size:46px;padding:20px 44px;border-radius:999px}
#ehandle{font-weight:700;font-size:40px;color:#AEB4E6;margin-top:26px}
#sweep{position:absolute;inset:-20%;background:linear-gradient(105deg,transparent 42%,rgba(255,255,255,.10) 50%,transparent 58%);pointer-events:none}`;

const rowHtml = (r, cls, id) => `<div class="${cls} ${r.k}" id="${id}" style="font-size:${r.size}px">${r.k === 'r' ? '<span class="bx"></span>' : ''}${r.txt}</div>`;
const html = `<!doctype html><meta charset=utf-8><style>${css}</style>
<div id="bg"></div><div id="grid"></div>
<div id="lock">${lockup(56)}</div>
<div id="title"><div><span>Paper</span> <span>checklist</span></div><div class="tl"><span>→</span> <span>inspection</span> <span>app</span></div></div>
<div class="lab" id="labP" style="left:${PAPER.x + 6}px;top:${PAPER.y - 62}px">PAPER</div>
<div class="lab" id="labA" style="left:${Math.round(SMALL.cx - 40)}px;top:${SMALL.top - 62}px">APP</div>
<div id="paper">${ROWS.map((r, i) => rowHtml(r, 'row', 'r' + i)).join('')}
<svg id="psvg" width="${PAPER.w}" height="${PAPER.h}"><path id="uline" d="M36 112 C 140 104, 260 118, 400 106" fill="none" stroke="#23233A" stroke-width="5" stroke-linecap="round" pathLength="1" stroke-dasharray="1" stroke-dashoffset="1"/>
<ellipse id="circ" cx="${210 + 82}" cy="${566 + 30}" rx="118" ry="52" fill="none" stroke="#D92D2D" stroke-width="5" pathLength="1" stroke-dasharray="1" stroke-dashoffset="1" transform="rotate(-6 292 596)"/></svg>
<div id="pen"></div></div>
<svg id="arrow"><path id="arr" d="M 470 ${PAPER.y + 300} C 545 ${PAPER.y + 170}, 640 ${PAPER.y + 175}, 676 ${PAPER.y + 318}" fill="none" stroke="#fff" stroke-width="7" stroke-linecap="round" pathLength="1" stroke-dasharray="1" stroke-dashoffset="1"/>
<path id="arrh" d="M 648 ${PAPER.y + 296} L 678 ${PAPER.y + 324} L 700 ${PAPER.y + 288}" fill="none" stroke="#fff" stroke-width="7" stroke-linecap="round" stroke-linejoin="round" pathLength="1" stroke-dasharray="1" stroke-dashoffset="1"/></svg>
<div id="phoneWrap"><div id="glow"></div><div id="phone"><div id="screen"><div id="off">${mark(150, { onDark: true })}</div><img id="app"><div id="flash"></div><div id="ring"></div></div></div></div>
${ROWS.slice(1, 6).map((r, i) => rowHtml(r, 'fly', 'f' + i)).join('')}
<div id="cap"></div>
<div id="pain"><span>Paper</span> <span>gets</span> <span>greasy,</span> <span>lost</span> <span>—</span> <span>never</span> <span>answered.</span></div>
<div id="end"><div id="ec">${mark(150, { onDark: true })}<div id="etag">Walk it. Fix it. <b>Prove it.</b></div><div id="esub">Your checklist, on the phone.</div><div id="epill">Free 30-day pilot · DM PILOT</div><div id="ehandle">@sdxinspection</div></div></div>
<div id="sweep"></div>
<script>
const D=${JSON.stringify({ T, FPS, SEGS: SEGS.map(s => ({ id: s.id, a: s.a, b: s.b, sp: s.sp, n: s.n, seq: s.seq, cap: s.cap, taps: s.taps })), ROWS, PAPER, BIG, SMALL })};
const $=id=>document.getElementById(id);
const cl=(x,a=0,b=1)=>Math.min(b,Math.max(a,x));
function spring(t,r=0.5,z=0.82){ if(t<=0) return 0; const w=2*Math.PI/r, wd=w*Math.sqrt(1-z*z); return 1-Math.exp(-z*w*t)*(Math.cos(wd*t)+(z*w/wd)*Math.sin(wd*t)); }
const ease=t=>t<=0?0:t>=1?1:1-Math.pow(1-t,3);
const eio=t=>t<=0?0:t>=1?1:(t<.5?4*t*t*t:1-Math.pow(-2*t+2,3)/2);
const mix=(a,b,k)=>a+(b-a)*k;
const vis=(el,o,tf)=>{ el.style.opacity=o; el.style.visibility=o>0.002?'visible':'hidden'; if(tf!=null) el.style.transform=tf; };
function words(el,t0,t,stag=.05,dy=30){ [...el.querySelectorAll('span')].forEach((s,i)=>{ const u=t-t0-i*stag; const k=spring(u,.55,.8); s.style.opacity=cl(u/.18); s.style.transform='translateY('+(dy*(1-k)).toFixed(1)+'px)'; s.style.filter='blur('+(10*(1-cl(u/.3))).toFixed(2)+'px)'; }); }
const setWords=(el,html)=>{ if(el.dataset.t===html) return; el.dataset.t=html; const tmp=document.createElement('div'); tmp.innerHTML=html;
  el.innerHTML=[...tmp.childNodes].map(n=>n.nodeType===3?n.textContent.split(' ').filter(Boolean).map(w=>'<span>'+w+'&nbsp;</span>').join(''):'<b>'+n.textContent.split(' ').filter(Boolean).map(w=>'<span>'+w+'&nbsp;</span>').join('')+'</b>').join(''); };
// paper coordinates → page coordinates (the paper is rotated about its centre)
const P=D.PAPER, th=P.rot*Math.PI/180;
const toPage=(x,y)=>{ const cx=P.w/2, cy=P.h/2, dx=x-cx, dy=y-cy; return { x:P.x+cx+dx*Math.cos(th)-dy*Math.sin(th), y:P.y+cy+dx*Math.sin(th)+dy*Math.cos(th) }; };
const widths=D.ROWS.map((r,i)=>$('r'+i).offsetWidth);
let seenCap='';
window.render=async f=>{
  const t=f/D.FPS;
  $('grid').style.backgroundPosition='0 '+(t*16).toFixed(1)+'px';
  // ---- hook: lockup + title; the title gives its place to the step captions once the app plays
  const lk=ease((t-.1)/.4); vis($('lock'),lk*(1-ease((t-9.9)/.4)),'translateY('+(-16*(1-lk))+'px)');
  const tOut=ease((t-9.9)/.45); vis($('title'),1-tOut,'translateY('+(-50*tOut).toFixed(1)+'px) scale('+(1-.1*tOut).toFixed(3)+')'); words($('title'),.25,t,.09,44);
  // ---- paper slides in from the left, the phone (dark) from the right
  const pin=spring(t-1.5,.7,.8), pout=ease((t-9.55)/.8);
  vis($('paper'),t<10.4?cl((t-1.5)/.2):0,'translate('+(mix(-560,0,pin)-700*pout).toFixed(1)+'px,'+(40*(1-pin)+120*pout).toFixed(1)+'px) rotate('+(P.rot-8*(1-pin)-14*pout).toFixed(2)+'deg)');
  vis($('labP'),cl((t-1.9)/.3)*(1-ease((t-8.3)/.3)));
  vis($('labA'),cl((t-2.1)/.3)*(1-ease((t-8.3)/.3)));
  // ---- the writing: each row is revealed left → right with the pen at its tip
  let pen=null;
  D.ROWS.forEach((r,i)=>{ const el=$('r'+i); const k=cl((t-r.a)/r.d); el.style.left=r.x+'px'; el.style.top=r.y+'px';
    el.style.clipPath='inset(-20% '+((1-k)*100).toFixed(2)+'% -20% 0)'; el.style.visibility=(k>0&&!(i>=1&&i<=5&&t>=8.2))?'visible':'hidden';
    if(k>0&&k<1) pen={x:r.x+widths[i]*k, y:r.y+r.size*.62}; });
  $('uline').style.strokeDashoffset=1-ease((t-3.08)/.3);
  $('circ').style.strokeDashoffset=1-ease((t-6.55)/.45);
  const pe=$('pen'); if(pen){ pe.style.left=pen.x+'px'; pe.style.top=pen.y+'px'; pe.style.opacity=1; } else pe.style.opacity=0;
  $('arr').style.strokeDashoffset=1-ease((t-7.05)/.45); $('arrh').style.strokeDashoffset=1-ease((t-7.45)/.18);
  $('arrow').style.opacity=1-ease((t-8.25)/.25);
  vis($('pain'),cl((t-4.2)/.3)*(1-ease((t-8.0)/.3))); words($('pain'),4.2,t,.06,22);
  // ---- the rows fly into the phone (8.2 → 9.3)
  for(let i=0;i<5;i++){ const r=D.ROWS[i+1], el=$('f'+i), a=8.2+i*.1, k=eio(cl((t-a)/.75));
    const s=toPage(r.x,r.y+r.size*.5), e={x:D.SMALL.cx-70, y:D.SMALL.top+D.SMALL.h*(.24+.12*i)}, c={x:(s.x+e.x)/2+40, y:Math.min(s.y,e.y)-180};
    const x=(1-k)*(1-k)*s.x+2*(1-k)*k*c.x+k*k*e.x, y=(1-k)*(1-k)*s.y+2*(1-k)*k*c.y+k*k*e.y;
    el.style.fontSize=r.size+'px'; el.style.left=x+'px'; el.style.top=(y-r.size*.5)+'px'; el.style.color=k>.5?'#06231F':'#23233A'; el.style.background=k>.5?'${TEAL}':'#FDFBF4';
    vis(el,t<a?0:(1-ease((k-.86)/.14)),'rotate('+mix(P.rot,0,k).toFixed(2)+'deg) scale('+mix(1,.5,k).toFixed(3)+')'); }
  // ---- the phone: in at 1.8 (small, dark), lights up at 9.15, moves to the middle at 9.8, out at 20.9
  const phin=spring(t-1.8,.7,.8), grow=spring(t-9.8,.8,.82), pex=ease((t-20.9)/.45);
  const s=mix(D.SMALL.s,1,grow), dx=mix(D.SMALL.left-D.BIG.left,0,grow), dy=mix(D.SMALL.top-D.BIG.top,0,grow)+mix(900,0,phin)+260*pex;
  vis($('phoneWrap'),t<21.4?cl((t-1.8)/.2)*(1-pex):0,'translate('+dx.toFixed(1)+'px,'+dy.toFixed(1)+'px) scale('+(s*(1-.12*pex)).toFixed(4)+')');
  const lit=t>=9.3; $('off').style.opacity=lit?0:1; $('glow').style.opacity=(lit?.75:0)*cl((t-9.3)/.4)*(1-ease((t-20.9)/.3));
  $('flash').style.opacity=t>=9.3&&t<9.75?(t<9.4?(t-9.3)/.1:1-(t-9.4)/.35)*.9:0;
  let seg=D.SEGS[0]; for(const g of D.SEGS) if(t>=g.a) seg=g;
  const fi=Math.max(1,Math.min(seg.n,Math.floor(cl(t-seg.a,0,seg.b-seg.a)*seg.sp*D.FPS)+1));
  const img=$('app'); const src='file://'+seg.seq+'/'+String(fi).padStart(5,'0')+'.jpg'; if(img.dataset.s!==src){ img.dataset.s=src; img.src=src; } img.style.opacity=lit?1:0;
  let ring=null; for(const g of D.SEGS) for(const c of g.taps) if(t>=c.t&&t<c.t+.6) ring=c;
  const R=$('ring'); if(ring){ const k=(t-ring.t)/.6; R.style.top=(ring.y*100)+'%'; R.style.opacity=((1-k)*.9).toFixed(3); R.style.transform='scale('+(.4+1.3*ease(k)).toFixed(3)+')'; } else R.style.opacity=0;
  // ---- step captions over the phone
  const cs=D.SEGS.find(g=>t>=g.a-.05&&t<g.b-.15); const cap=$('cap');
  if(cs){ setWords(cap,cs.cap); words(cap,cs.a,t,.045,26); vis(cap,1-ease((t-(cs.b-.4))/.25)); } else vis(cap,0);
  // ---- end card
  const ek=spring(t-21.15,.7,.78); vis($('end'),t>=21.1?cl((t-21.1)/.25):0); $('ec').style.transform='translateY('+(140*(1-ek)).toFixed(1)+'px) scale('+(.9+.1*ek).toFixed(3)+')';
  const sw=[9.3,10.6,13.8,17.0,21.1].map(x=>cl((t-x)/.9)).find(k=>k>0&&k<1); $('sweep').style.transform='translateX('+(sw!=null?(-1400+2800*ease(sw)):-3000)+'px)';
  if(lit&&!(img.complete&&img.naturalWidth)) await new Promise(r=>{ img.onload=()=>r(); img.onerror=()=>r(); setTimeout(r,3000); });
};
</script>`;
writeFileSync(`${OUT}/stage.html`, html);

const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--no-sandbox', '--allow-file-access-from-files'] });
const p = await b.newPage({ viewport: { width: W, height: H } });
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

// ---- sound: a soft bed, pen scratches while each row is written, a whoosh as the rows fly, a chime when the screen
// lights, clicks on the taps, whooshes on the step changes, a shimmer on the end card. −14 LUFS.
const pen = ROWS.map(r => `between(t,${r.a.toFixed(2)},${(r.a + r.d).toFixed(2)})*(0.55+0.45*sin(2*PI*13*t))`).concat([`between(t,7.05,7.5)*(0.55+0.45*sin(2*PI*11*t))`]).join('+');
const taps = SEGS.flatMap(s => s.taps.map(c => c.t));
const click = taps.map(s => `0.5*sin(2*PI*2600*(t-${s.toFixed(2)}))*exp(-90*max(t-${s.toFixed(2)},0))*gte(t,${s.toFixed(2)})`).join('+') || '0';
const bed = `0.05*(sin(2*PI*110*t)+sin(2*PI*164.8*t)+sin(2*PI*220*t)+0.6*sin(2*PI*329.6*t))*(0.65+0.35*sin(2*PI*0.125*t))+0.28*sin(2*PI*(46+70*exp(-30*mod(t,0.5)))*mod(t,0.5))*exp(-9*mod(t,0.5))*gte(t,9.3)*lt(t,21.0)`;
const chime = s => `0.2*(sin(2*PI*1318*(t-${s}))+0.6*sin(2*PI*1976*(t-${s})))*exp(-3*max(t-${s},0))*gte(t,${s})`;
const wh = [8.15, 10.45, 13.65, 16.85, 20.95].map(s => `between(t,${s.toFixed(2)},${(s + .45).toFixed(2)})*sin(PI*(t-${s.toFixed(2)})/0.45)`).join('+');
const out = `${DIR}out/sketch-reel.mp4`;
execFileSync(FF, ['-loglevel', 'error', '-y', '-framerate', String(FPS), '-i', `${OUT}/f/%05d.jpg`,
  '-f', 'lavfi', '-i', `aevalsrc='${bed}+${chime(9.3)}+${chime(21.3)}':s=48000:d=${T.toFixed(2)}`,
  '-f', 'lavfi', '-i', `aevalsrc='${click}':s=48000:d=${T.toFixed(2)}`,
  '-f', 'lavfi', '-i', `anoisesrc=d=${T.toFixed(2)}:c=pink:a=0.5:r=48000`,
  '-f', 'lavfi', '-i', `anoisesrc=d=${T.toFixed(2)}:c=white:a=0.5:r=48000:seed=7`,
  '-filter_complex', `[3:a]volume='0.35*(${wh})':eval=frame,highpass=f=500,lowpass=f=6000[w];[4:a]volume='0.16*(${pen})':eval=frame,bandpass=f=3200:width_type=o:w=1.2[pn];[2:a]highpass=f=900[c];[1:a][c][w][pn]amix=inputs=4:normalize=0,afade=t=in:d=0.2,afade=t=out:st=${(T - 1).toFixed(2)}:d=1,loudnorm=I=-14:TP=-1.5:LRA=9,aformat=sample_rates=48000:channel_layouts=stereo[a]`,
  '-map', '0:v', '-map', '[a]', '-c:v', 'libx264', '-preset', 'slow', '-crf', '17', '-maxrate', '6M', '-bufsize', '12M', '-pix_fmt', 'yuv420p', '-profile:v', 'high', '-g', '60', '-r', String(FPS),
  '-c:a', 'aac', '-b:a', '160k', '-movflags', '+faststart', '-shortest', out]);
console.log('sketch', out, T.toFixed(1) + ' s', N + ' frames', ((Date.now() - t0) / 1000).toFixed(0) + ' s');
