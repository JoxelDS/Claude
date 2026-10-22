// node povroom.mjs [--at 1,5,12]  → out/povroom-reel.mp4 (1080×1920, 30 fps, AAC)
// "POV: your inspections, finally in one place": a dark desk at night (pov/room-desk.jpg — our own generated
// photo, screens blanked, corners in pov/room-desk.json); the monitor plays the real app's Follow-ups
// (out/pov_desk_fu, recorded by povdesk.mjs), the tablet plays the stand temp-log tracker (out/pov_tab_temps).
// Every frame is rendered in Chromium from t: each screen is corner-pinned with a CSS matrix3d homography,
// its light spills on the wall and the desk, the camera pushes in slowly, film grain on top. Sound synthesized.
import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync, rmSync } from 'fs';
import { execFileSync } from 'child_process';
import { chromium } from '/home/user/Claude/node_modules/playwright-core/index.mjs';
import { TEAL, fontCss, mark, lockup } from './sdxmark.mjs';
const FF = process.env.FFMPEG || '/tmp/ff/node_modules/ffmpeg-static/ffmpeg';
const DIR = new URL('.', import.meta.url).pathname;
const args = process.argv.slice(2);
const opt = k => { const i = args.indexOf('--' + k); return i >= 0 ? args[i + 1] : null; };
const FPS = 30, T = 16.0, N = Math.round(T * FPS), W = 1080, H = 1920, ENDT = 13.0;
const OUT = `${DIR}out/povroom`; mkdirSync(OUT, { recursive: true });
const Q = JSON.parse(readFileSync(`${DIR}pov/room-desk.json`, 'utf8'));

// screen sources: [from, to] of the recording, played at 1× from scene time 0 (held on the last frame)
const SCR = [
  { id: 'mon', clip: 'desk_fu', from: 3.2, to: 12.4, w: 1080, q: Q.monitor },
  { id: 'tab', clip: 'tab_temps', from: 2.0, to: 14.2, w: 720, q: Q.tablet },
];
for (const s of SCR) {
  const seq = `${OUT}/seq_${s.id}`, stamp = `${seq}/w_${s.clip}_${s.from}_${s.to}_${s.w}`;
  if (!existsSync(stamp)) {
    rmSync(seq, { recursive: true, force: true }); mkdirSync(seq, { recursive: true });
    execFileSync(FF, ['-loglevel', 'error', '-y', '-ss', String(s.from), '-i', `${DIR}out/pov_${s.clip}/master.mp4`, '-t', String(s.to - s.from), '-vf', `fps=${FPS},scale=${s.w}:-2:flags=lanczos`, '-q:v', '3', `${seq}/%05d.jpg`]);
    writeFileSync(stamp, '');
  }
  s.seq = seq; s.n = readdirSync(seq).filter(f => f.endsWith('.jpg')).length;
  s.h = Math.round(s.w * (s.clip === 'desk_fu' ? 796 / 1440 : 780 / 1180));
}

const css = `${fontCss(DIR)}
*{margin:0;box-sizing:border-box} html,body{width:${W}px;height:${H}px;overflow:hidden;background:#05060B;font-family:I,Arial;-webkit-font-smoothing:antialiased;color:#fff}
#cam{position:absolute;inset:0;transform-origin:0 0}
#room{position:absolute;left:0;top:0;width:${W}px;height:${H}px}
.scr{position:absolute;left:0;top:0;transform-origin:0 0;backface-visibility:hidden}
.glow{position:absolute;left:0;top:0;transform-origin:0 0;filter:blur(46px) saturate(1.2);mix-blend-mode:screen;opacity:.34}
#spill{position:absolute;left:0;top:0;width:${W}px;height:${H}px;mix-blend-mode:screen;pointer-events:none;
  background:radial-gradient(620px 300px at 530px 1150px,rgba(190,205,255,.30),transparent 72%),radial-gradient(320px 160px at 815px 1265px,rgba(200,215,255,.30),transparent 72%),radial-gradient(760px 420px at 530px 720px,rgba(170,190,255,.10),transparent 70%)}
#sheen{position:absolute;left:0;top:0;width:${W}px;height:${H}px;pointer-events:none;mix-blend-mode:screen}
#vig{position:absolute;inset:0;background:radial-gradient(1100px 1500px at 50% 42%,transparent 55%,rgba(0,0,0,.55));pointer-events:none}
#grain{position:absolute;inset:-40px;opacity:.10;mix-blend-mode:overlay;pointer-events:none}
#cap{position:absolute;left:60px;right:60px;top:262px;text-align:center;font-weight:800;font-size:58px;line-height:1.1;letter-spacing:-1.5px;text-shadow:0 4px 24px rgba(0,0,0,.65)}
#cap span{display:inline-block} #cap b{color:${TEAL}}
.lab{position:absolute;left:0;right:0;display:flex;justify-content:center;top:1410px}
.lab div{background:rgba(8,10,24,.78);border:1.5px solid rgba(160,190,255,.32);border-radius:999px;padding:16px 30px;font-weight:700;font-size:38px;letter-spacing:-.5px;box-shadow:0 14px 40px rgba(0,0,0,.45)}
.lab div b{color:${TEAL}}
#fade{position:absolute;inset:0;background:#05060B;opacity:0}
#end{position:absolute;inset:0;display:flex;align-items:center;justify-content:center}
#ec{display:flex;flex-direction:column;align-items:center;text-align:center;padding:70px 64px;border-radius:60px;background:rgba(18,22,58,.78);border:1.5px solid rgba(160,190,255,.30);box-shadow:0 40px 120px rgba(0,0,0,.45),inset 0 1px 0 rgba(255,255,255,.25)}
#etag{font-weight:800;font-size:82px;letter-spacing:-2.5px;margin-top:34px} #etag b{color:${TEAL}}
#esub{font-weight:600;font-size:42px;color:#AEB4E6;margin-top:22px}
#epill{margin-top:40px;background:${TEAL};color:#06231F;font-weight:800;font-size:46px;padding:20px 44px;border-radius:999px}
#ehandle{font-weight:700;font-size:40px;color:#AEB4E6;margin-top:26px}`;

const html = `<!doctype html><meta charset=utf-8><style>${css}</style>
<div id="cam"><img id="room" src="file://${DIR}pov/room-desk.jpg">
${SCR.map(s => `<img class="glow" id="g_${s.id}" width="${s.w}" height="${s.h}"><img class="scr" id="s_${s.id}" width="${s.w}" height="${s.h}">`).join('')}
<div id="spill"></div><svg id="sheen" width="${W}" height="${H}"></svg></div>
<div id="vig"></div>
<svg id="grain" width="${W + 80}" height="${H + 80}"><filter id="nz"><feTurbulence id="tb" type="fractalNoise" baseFrequency=".9" numOctaves="2" seed="1"/><feColorMatrix type="saturate" values="0"/></filter><rect width="100%" height="100%" filter="url(#nz)"/></svg>
<div id="cap"></div>
<div class="lab" id="l1"><div>Every open problem, <b>with its photo</b></div></div>
<div class="lab" id="l2"><div>Which stands <b>haven't logged temps</b></div></div>
<div id="fade"></div>
<div id="end"><div id="ec">${mark(150, { onDark: true })}<div id="etag">Walk it. Fix it. <b>Prove it.</b></div><div id="esub">Inspections, follow-ups and temp logs.</div><div id="epill">Free 30-day pilot · DM PILOT</div><div id="ehandle">@sdxinspection</div></div></div>
<script>
const D=${JSON.stringify({ FPS, ENDT, SCR: SCR.map(s => ({ id: s.id, n: s.n, seq: s.seq, w: s.w, h: s.h, q: s.q })) })};
const $=id=>document.getElementById(id);
const cl=(x,a=0,b=1)=>Math.min(b,Math.max(a,x));
function spring(t,r=0.5,z=0.82){ if(t<=0) return 0; const w=2*Math.PI/r, wd=w*Math.sqrt(1-z*z); return 1-Math.exp(-z*w*t)*(Math.cos(wd*t)+(z*w/wd)*Math.sin(wd*t)); }
const ease=t=>t<=0?0:t>=1?1:1-Math.pow(1-t,3);
const eio=t=>t<=0?0:t>=1?1:(t<.5?2*t*t:1-Math.pow(-2*t+2,2)/2);
const vis=(el,o,tf)=>{ el.style.opacity=o; el.style.visibility=o>0.002?'visible':'hidden'; if(tf!=null) el.style.transform=tf; };
function words(el,t0,t,stag=.06,dy=30){ [...el.querySelectorAll('span')].forEach((s,i)=>{ const u=t-t0-i*stag; const k=spring(u,.55,.8); s.style.opacity=cl(u/.18); s.style.transform='translateY('+(dy*(1-k)).toFixed(1)+'px)'; s.style.filter='blur('+(10*(1-cl(u/.3))).toFixed(2)+'px)'; }); }
// homography: the rectangle (0,0)-(w,h) onto the quad tl,tr,br,bl (expanded 1.5 px so no bezel shows through)
function solve(A,b){ const n=b.length; for(let i=0;i<n;i++){ let m=i; for(let r=i+1;r<n;r++) if(Math.abs(A[r][i])>Math.abs(A[m][i])) m=r; [A[i],A[m]]=[A[m],A[i]]; [b[i],b[m]]=[b[m],b[i]];
  for(let r=i+1;r<n;r++){ const f=A[r][i]/A[i][i]; for(let c=i;c<n;c++) A[r][c]-=f*A[i][c]; b[r]-=f*b[i]; } }
  const x=Array(n).fill(0); for(let i=n-1;i>=0;i--){ let s=b[i]; for(let c=i+1;c<n;c++) s-=A[i][c]*x[c]; x[i]=s/A[i][i]; } return x; }
function pin(el,w,h,q,grow=1.5){ const cx=(q.tl[0]+q.tr[0]+q.br[0]+q.bl[0])/4, cy=(q.tl[1]+q.tr[1]+q.br[1]+q.bl[1])/4;
  const P=['tl','tr','br','bl'].map(k=>{ const [x,y]=q[k]; const d=Math.hypot(x-cx,y-cy); return [x+(x-cx)/d*grow, y+(y-cy)/d*grow]; });
  const S=[[0,0],[w,0],[w,h],[0,h]], A=[], b=[];
  for(let i=0;i<4;i++){ const [x,y]=S[i], [u,v]=P[i]; A.push([x,y,1,0,0,0,-u*x,-u*y]); b.push(u); A.push([0,0,0,x,y,1,-v*x,-v*y]); b.push(v); }
  const [a,bb,c,d,e,f,g,hh]=solve(A,b);
  el.style.transform='matrix3d('+[a,d,0,g, bb,e,0,hh, 0,0,1,0, c,f,0,1].map(x=>x.toFixed(9)).join(',')+')'; }
D.SCR.forEach(s=>{ pin($('s_'+s.id),s.w,s.h,s.q); pin($('g_'+s.id),s.w,s.h,s.q,30); });
// a soft reflection band across each screen (a real screen photographed in a dark room is never flat)
$('sheen').innerHTML=D.SCR.map(s=>{ const q=s.q; return '<defs><linearGradient id="gr_'+s.id+'" x1="0" y1="0" x2="1" y2="1"><stop offset=".25" stop-color="#fff" stop-opacity="0"/><stop offset=".42" stop-color="#fff" stop-opacity=".07"/><stop offset=".55" stop-color="#fff" stop-opacity="0"/></linearGradient></defs><polygon points="'+[q.tl,q.tr,q.br,q.bl].map(p=>p.join(',')).join(' ')+'" fill="url(#gr_'+s.id+')"/>'; }).join('');
const cap=$('cap'); cap.innerHTML='<div>'+'POV: your inspections,'.split(' ').map(w=>'<span>'+w+'&nbsp;</span>').join('')+'</div><div><b>'+'finally in one place.'.split(' ').map(w=>'<span>'+w+'&nbsp;</span>').join('')+'</b></div>';
window.render=async f=>{
  const t=f/D.FPS;
  // camera: a slow push-in toward the monitor with a little handheld drift, then a settle before the end card
  const K=[[0,1,540,960],[2.6,1.04,540,940],[3.7,1.42,532,770],[8.0,1.47,532,760],[9.1,2.3,812,1062],[12.5,2.36,812,1062],[13.5,1.12,540,920]];
  let z=K[K.length-1][1], px=K[K.length-1][2], py=K[K.length-1][3];
  for(let i=0;i<K.length-1;i++){ const [t0,z0,x0,y0]=K[i], [t1,z1,x1,y1]=K[i+1]; if(t>=t0&&t<t1){ const u=eio((t-t0)/(t1-t0)); z=z0+(z1-z0)*u; px=x0+(x1-x0)*u; py=y0+(y1-y0)*u; break; } }
  const dx=5*Math.sin(t*.7)+2.5*Math.sin(t*1.9), dy=4*Math.cos(t*.55)+2*Math.sin(t*2.3), r=.2*Math.sin(t*.45);
  $('cam').style.transform='translate('+(540-z*px+dx).toFixed(2)+'px,'+(960-z*py+dy).toFixed(2)+'px) rotate('+r.toFixed(3)+'deg) scale('+z.toFixed(4)+')';
  // the screens wake up at 0.5 s (dark → on), then play
  const on=cl((t-.5)/.35);
  const imgs=[];
  for(const s of D.SCR){ const fi=Math.max(1,Math.min(s.n,Math.floor(Math.max(0,t-.5)*D.FPS)+1)); const src='file://'+s.seq+'/'+String(fi).padStart(5,'0')+'.jpg';
    for(const id of ['s_'+s.id,'g_'+s.id]){ const im=$(id); if(im.dataset.s!==src){ im.dataset.s=src; im.src=src; } imgs.push(im); }
    $('s_'+s.id).style.opacity=on; $('s_'+s.id).style.filter='brightness('+(.82+.03*Math.sin(t*3.1)).toFixed(3)+') contrast(1.05) saturate(1.05)'; $('g_'+s.id).style.opacity=(.34*on).toFixed(3); }
  $('spill').style.opacity=(on*(.85+.15*Math.sin(t*2.2))).toFixed(3); $('sheen').style.opacity=on; $('room').style.filter='brightness('+(1+.16*on).toFixed(3)+')';
  $('tb').setAttribute('seed',String(f%97+1)); $('grain').style.transform='translate('+((f*37)%40-20)+'px,'+((f*53)%40-20)+'px)';
  // caption + the two labels
  vis(cap,cl((t-.8)/.3)*(1-ease((t-8.4)/.4))); words(cap,.8,t); // it goes before the camera moves to the tablet (the bright monitor would be behind it)
  const lab=(id,a,b)=>{ const kk=spring(t-a,.6,.8); vis($(id),t<a?0:cl((t-a)/.25)*(1-ease((t-(b-.3))/.3)),'translateY('+(30*(1-kk)).toFixed(1)+'px)'); };
  lab('l1',3.4,8.3); lab('l2',9.3,12.9);
  // end card
  $('fade').style.opacity=(.82*ease((t-D.ENDT)/.5)).toFixed(3);
  const ek=spring(t-(D.ENDT+.25),.7,.78); vis($('end'),t>=D.ENDT+.2?cl((t-(D.ENDT+.2))/.25):0); $('ec').style.transform='translateY('+(140*(1-ek)).toFixed(1)+'px) scale('+(.9+.1*ek).toFixed(3)+')';
  await Promise.all(imgs.map(im=>im.complete&&im.naturalWidth?0:new Promise(r=>{ im.onload=()=>r(); im.onerror=()=>r(); setTimeout(r,3000); })));
};
</script>`;
writeFileSync(`${OUT}/stage.html`, html);

const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--no-sandbox', '--allow-file-access-from-files'] });
const p = await b.newPage({ viewport: { width: W, height: H } });
await p.goto(`file://${OUT}/stage.html`); await p.evaluate(() => document.fonts.ready); await p.waitForTimeout(300);
const at = opt('at');
rmSync(`${OUT}/f`, { recursive: true, force: true }); mkdirSync(`${OUT}/f`, { recursive: true });
const frames = at ? at.split(',').map(s => Math.round(+s * FPS)) : [...Array(N).keys()];
const t0 = Date.now();
for (const f of frames) {
  await p.evaluate(n => window.render(n), f);
  await p.screenshot({ path: `${OUT}/f/${String(f).padStart(5, '0')}.jpg`, type: 'jpeg', quality: at ? 82 : 92 });
  if (!at && f % 150 === 0) console.log(`  frame ${f}/${N} · ${((Date.now() - t0) / 1000).toFixed(0)} s`);
}
await b.close();
if (at) { console.log('stills in', OUT + '/f'); process.exit(0); }

// sound: low room tone + a soft lo-fi pad and a slow pulse, a soft "screen on" tick, a chime on the end card. −14 LUFS
const pad = `0.06*(sin(2*PI*98*t)+sin(2*PI*146.8*t)+0.7*sin(2*PI*196*t)+0.4*sin(2*PI*293.7*t))*(0.6+0.4*sin(2*PI*0.1*t))`;
const pulse = `0.16*sin(2*PI*(44+50*exp(-25*mod(t,0.8)))*mod(t,0.8))*exp(-7*mod(t,0.8))*gte(t,0.9)*lt(t,${ENDT})`;
const tick = s => `0.35*sin(2*PI*1800*(t-${s}))*exp(-60*max(t-${s},0))*gte(t,${s})`;
const chime = s => `0.2*(sin(2*PI*1318*(t-${s}))+0.6*sin(2*PI*1976*(t-${s})))*exp(-3*max(t-${s},0))*gte(t,${s})`;
const out = `${DIR}out/povroom-reel.mp4`;
execFileSync(FF, ['-loglevel', 'error', '-y', '-framerate', String(FPS), '-i', `${OUT}/f/%05d.jpg`,
  '-f', 'lavfi', '-i', `aevalsrc='${pad}+${pulse}+${tick(0.5)}+${chime(ENDT + 0.25)}':s=48000:d=${T.toFixed(2)}`,
  '-f', 'lavfi', '-i', `anoisesrc=d=${T.toFixed(2)}:c=brown:a=0.5:r=48000`,
  '-filter_complex', `[2:a]volume=0.05,lowpass=f=400[rt];[1:a][rt]amix=inputs=2:normalize=0,afade=t=in:d=0.4,afade=t=out:st=${(T - 1.2).toFixed(2)}:d=1.2,loudnorm=I=-14:TP=-1.5:LRA=9,aformat=sample_rates=48000:channel_layouts=stereo[a]`,
  '-map', '0:v', '-map', '[a]', '-c:v', 'libx264', '-preset', 'slow', '-crf', '17', '-maxrate', '7M', '-bufsize', '14M', '-pix_fmt', 'yuv420p', '-profile:v', 'high', '-g', '60', '-r', String(FPS),
  '-c:a', 'aac', '-b:a', '160k', '-movflags', '+faststart', '-shortest', out]);
console.log('povroom', out, T.toFixed(1) + ' s', N + ' frames', ((Date.now() - t0) / 1000).toFixed(0) + ' s');
