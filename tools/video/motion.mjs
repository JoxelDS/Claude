// node motion.mjs <clip> [--look app|brand] [--from s] [--to s]  → out/motion-<clip>.mp4 (1080x1920, 30 fps, AAC)
// The futuristic cut: every frame is rendered in Chromium from time t (pure functions of t, no live animation), so motion is
// exact and never lags. Layers: aurora + grid background, 3D glass phone with the real app recording (out/pov_<clip>),
// a caption pill that morphs out of the phone's Dynamic Island, spring camera that follows each tap, tap rings, logo
// assembly intro, glass outro. Sound: synthesized bed + UI clicks on taps + whooshes, all on the cue times.
import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync, rmSync } from 'fs';
import { execFileSync } from 'child_process';
import { chromium } from '/home/user/Claude/node_modules/playwright-core/index.mjs';
import { C, TEAL, fontCss } from './sdxmark.mjs';
const FF = process.env.FFMPEG || '/tmp/ff/node_modules/ffmpeg-static/ffmpeg';
const DIR = new URL('.', import.meta.url).pathname;
const args = process.argv.slice(2); const clip = args[0];
const opt = k => { const i = args.indexOf('--' + k); return i >= 0 ? args[i + 1] : null; };
const LOOK = opt('look') || 'app';
const SRC = `${DIR}out/pov_${clip}`; const OUT = `${DIR}out/mo_${clip}_${LOOK}`;
const FPS = 30, IN = 2.6, OUTRO = 3.2;
const INTRO = {
  g_temps: ['Catch the bad temp', 'before it becomes a problem.'], g_problem: ['Report a problem', 'in seconds, with proof.'],
  crew: ['From “fix it”', 'to fixed — with proof.'], portal: ['Stand teams log temps', 'with one scan.'],
}[clip] || ['SDX Inspect', 'the inspection app'];
const { dur: rawDur, cues } = JSON.parse(readFileSync(`${SRC}/cues.json`, 'utf8'));
const S0 = Math.max(0, (cues[0]?.t ?? 0) - 0.8);              // skip the lock screen before the first action
const lastCue = cues.length ? cues[cues.length - 1].t : rawDur;
const D = Math.min(rawDur, lastCue + 2.6) - S0;               // end ~2.6 s after the last action (no dead air)
// speed ramp: real time around each action (0.5 s before → 1.8 s after), 3x in between — no dead air
const act = cues.map(c => [c.t - S0 - 0.5, c.t - S0 + 1.8]);
const rate = st => act.some(([a, b]) => st >= a && st <= b) ? 1 : 3;
const srcAt = [0]; { let st = 0; while (st < D) { st += rate(st) / FPS; srcAt.push(Math.min(st, D)); } }
const outOf = st => { let i = srcAt.findIndex(x => x >= st); return (i < 0 ? srcAt.length - 1 : i) / FPS; };
const DS = D; const DO = (srcAt.length - 1) / FPS;                      // output length of the app part
const T = IN + DO + OUTRO, N = Math.round(T * FPS);
mkdirSync(OUT, { recursive: true });
// 1) app frames at 30 fps (full 1080x2338 phone screen)
const SEQ = `${SRC}/seq`;
if (!existsSync(SEQ) || !existsSync(`${SEQ}/S0_${S0.toFixed(2)}`)) {
  rmSync(SEQ, { recursive: true, force: true }); mkdirSync(SEQ);
  execFileSync(FF, ['-loglevel', 'error', '-y', '-ss', S0.toFixed(2), '-i', `${SRC}/master.mp4`, '-t', D.toFixed(2), '-vf', `fps=${FPS}`, '-q:v', '2', `${SEQ}/%05d.jpg`]);
  writeFileSync(`${SEQ}/S0_${S0.toFixed(2)}`, '');
}
const nSeq = readdirSync(SEQ).filter(f => f.endsWith('.jpg')).length;
// 2) cues → captions (hold until the next cue) + camera targets (tap y in screen fraction)
const caps = cues.map((c, i) => ({ text: c.text, key: !!c.key, t0: IN + outOf(c.t - S0), t1: IN + (i + 1 < cues.length ? outOf(cues[i + 1].t - S0) : DO), y: c.y == null ? null : c.y / 844 })).filter(c => c.t1 > c.t0 + .3);
const look = LOOK === 'brand'
  ? { bg0: '#050505', bg1: '#121212', glowA: 'rgba(255,255,255,.10)', glowB: 'rgba(160,160,160,.08)', accent: '#FFFFFF', ink: '#FFFFFF', sub: '#9A9A9A', pill: 'rgba(20,20,20,.62)', pillEdge: 'rgba(255,255,255,.22)', key: '#FFFFFF', keyInk: '#000', rim: ['#3a3a3a', '#0d0d0d'], handle: '@dsmarketing.agency' }
  : { bg0: '#070A1F', bg1: '#141A44', glowA: 'rgba(51,195,176,.30)', glowB: 'rgba(72,84,214,.34)', accent: TEAL, ink: '#FFFFFF', sub: '#AEB4E6', pill: 'rgba(18,22,58,.58)', pillEdge: 'rgba(160,190,255,.30)', key: TEAL, keyInk: '#06231F', rim: ['#C9CEE3', '#4A4F6B'], handle: '@sdxinspect' };
const LOGO = LOOK === 'brand'
  ? `<img src="file://${DIR}ds-logo.png" style="width:100%;height:auto;display:block">`
  : `<svg viewBox="0 0 100 100" width="100%" height="100%"><rect id="lbox" x="10" y="10" width="80" height="80" rx="22" fill="none" stroke="#fff" stroke-width="8" pathLength="1" stroke-dasharray="1" stroke-dashoffset="1"/><path id="lchk" d="M30 51 L44 65 L70 37" fill="none" stroke="${TEAL}" stroke-width="10" stroke-linecap="round" stroke-linejoin="round" pathLength="1" stroke-dasharray="1" stroke-dashoffset="1"/></svg>`;

const html = `<!doctype html><meta charset=utf-8><style>${fontCss(DIR)}
*{margin:0;box-sizing:border-box} html,body{width:1080px;height:1920px;overflow:hidden;background:${look.bg0};font-family:I,Arial;-webkit-font-smoothing:antialiased}
#bg{position:absolute;inset:0} #stage{position:absolute;inset:0;perspective:2200px;perspective-origin:50% 42%}
#phoneWrap{position:absolute;left:50%;top:0;width:0;height:0;transform-style:preserve-3d}
#phone{position:absolute;width:600px;height:1298px;left:-300px;top:0;border-radius:92px;padding:16px;
  background:linear-gradient(145deg,${look.rim[0]},${look.rim[1]} 55%,${look.rim[0]});box-shadow:0 0 0 2px rgba(255,255,255,.18) inset,0 60px 140px rgba(0,0,0,.55),0 0 120px ${look.glowA}}
#screen{position:relative;width:100%;height:100%;border-radius:78px;overflow:hidden;background:#fff}
#screen img{position:absolute;left:0;right:0;top:56px;bottom:0;width:100%;height:calc(100% - 56px);object-fit:cover;object-position:top}
#sbar{position:absolute;left:0;right:0;top:0;height:56px;background:#1e1d4a;color:#fff;font-weight:700;font-size:21px;display:flex;align-items:center;justify-content:space-between;padding:6px 44px 0 52px;z-index:2}
#sbar i{font-style:normal;letter-spacing:2px;font-size:18px}
#glare{position:absolute;inset:0;background:linear-gradient(115deg,transparent 30%,rgba(255,255,255,.22) 45%,transparent 58%);mix-blend-mode:screen;pointer-events:none}
#island{position:absolute;left:50%;top:24px;width:150px;height:42px;margin-left:-75px;border-radius:30px;background:#000;z-index:3}
#ring{position:absolute;width:120px;height:120px;margin:-60px 0 0 -60px;border-radius:50%;border:5px solid ${look.accent};opacity:0;z-index:4}
#pill{position:absolute;left:50%;transform-origin:50% 50%;background:${look.pill};border:1.5px solid ${look.pillEdge};
  backdrop-filter:blur(26px) saturate(160%);-webkit-backdrop-filter:blur(26px) saturate(160%);box-shadow:0 20px 60px rgba(0,0,0,.35),inset 0 1px 0 rgba(255,255,255,.22);overflow:hidden;z-index:6}
#pillIn{position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;padding:0 46px;text-align:center}
#kick{font-weight:800;font-size:22px;letter-spacing:5px;color:${look.key};margin-bottom:10px;text-transform:uppercase}
#head{font-weight:800;font-size:58px;line-height:1.05;letter-spacing:-1.6px;color:${look.ink}}
#head span{display:inline-block;will-change:transform,filter}
#intro,#outro{position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center;z-index:8}
#logo{width:230px;height:230px} #logoBrand{width:520px}
#ih{font-weight:800;font-size:104px;line-height:.98;letter-spacing:-4px;color:${look.ink};margin-top:60px;padding:0 70px}
#is{font-weight:600;font-size:46px;letter-spacing:-.5px;color:${look.sub};margin-top:26px}
#ih span,#is span{display:inline-block}
#oc{padding:70px 70px 60px;border-radius:64px;background:${look.pill};border:1.5px solid ${look.pillEdge};backdrop-filter:blur(30px);-webkit-backdrop-filter:blur(30px);box-shadow:0 40px 120px rgba(0,0,0,.45),inset 0 1px 0 rgba(255,255,255,.25);display:flex;flex-direction:column;align-items:center;width:860px}
#oname{font-weight:800;font-size:96px;letter-spacing:-3.5px;color:${look.ink};margin-top:34px}
#otag{font-weight:800;font-size:50px;letter-spacing:-1px;color:${look.ink};margin-top:18px} #otag b{color:${look.accent}}
#ohandle{font-weight:700;font-size:34px;color:${look.sub};margin-top:30px}
#ocredit{font-weight:600;font-size:28px;color:${look.sub};margin-top:22px;display:flex;align-items:center;gap:14px}
#sweep{position:absolute;inset:-20%;background:linear-gradient(105deg,transparent 42%,rgba(255,255,255,.10) 50%,transparent 58%);z-index:9;pointer-events:none}
</style>
<canvas id="bg" width="1080" height="1920"></canvas>
<div id="stage"><div id="phoneWrap"><div id="phone"><div id="screen"><div id="sbar"><span>9:41</span><i>●●● ▲ ▮</i></div><img id="app"><div id="ring"></div><div id="glare"></div></div><div id="island"></div></div></div></div>
<div id="pill"><div id="pillIn"><div id="kick">Key moment</div><div id="head"></div></div></div>
<div id="intro"><div id="logo">${LOOK === 'brand' ? `<div id="logoBrand">${LOGO}</div>` : LOGO}</div><div id="ih">${INTRO[0].split(' ').map(w => `<span>${w}&nbsp;</span>`).join('')}</div><div id="is">${INTRO[1].split(' ').map(w => `<span>${w}&nbsp;</span>`).join('')}</div></div>
<div id="outro"><div id="oc"><div style="width:${LOOK === 'brand' ? 420 : 170}px">${LOOK === 'brand' ? LOGO : LOGO.replace('id="lbox"', 'id="lbox2"').replace('id="lchk"', 'id="lchk2"').replace(/stroke-dashoffset="1"/g, 'stroke-dashoffset="0"')}</div>
<div id="oname">${LOOK === 'brand' ? 'SDX Inspect' : 'SDX Inspect'}</div><div id="otag">Walk it. Fix it. <b>Prove it.</b></div><div id="ohandle">${look.handle}</div>
${LOOK === 'brand' ? `<div id="ocredit">by DSmarketing Agency</div>` : `<div id="ocredit">by <img src="file://${DIR}ds-logo.png" style="height:44px;filter:brightness(1.2)"> DS Marketing</div>`}</div></div>
<div id="sweep"></div>
<script>
const T=${T}, IN=${IN}, D=${DO}, OUTRO=${OUTRO}, FPS=${FPS}, NSEQ=${nSeq}; const SRC_AT=${JSON.stringify(srcAt.map(x => +x.toFixed(3)))};
const CAPS=${JSON.stringify(caps)};
const L=${JSON.stringify(look)};
const $=id=>document.getElementById(id);
const cl=(x,a=0,b=1)=>Math.min(b,Math.max(a,x));
// damped spring 0→1 (iOS-like: response r seconds, damping fraction z)
function spring(t,r=0.5,z=0.82){ if(t<=0) return 0; const w=2*Math.PI/r, wd=w*Math.sqrt(1-z*z); return 1-Math.exp(-z*w*t)*(Math.cos(wd*t)+(z*w/wd)*Math.sin(wd*t)); }
const ease=t=>t<=0?0:t>=1?1:1-Math.pow(1-t,3);
const mix=(a,b,k)=>a+(b-a)*k;
// background: aurora blobs + perspective grid + drifting particles
const bg=$('bg').getContext('2d');
const P=[...Array(70)].map((_,i)=>({x:(i*397)%1080,y:(i*911)%1920,s:0.6+((i*37)%10)/8,v:6+((i*53)%10)}));
function drawBg(t){
  const g=bg.createLinearGradient(0,0,0,1920); g.addColorStop(0,L.bg1); g.addColorStop(1,L.bg0); bg.fillStyle=g; bg.fillRect(0,0,1080,1920);
  const blob=(x,y,r,c)=>{const rg=bg.createRadialGradient(x,y,0,x,y,r); rg.addColorStop(0,c); rg.addColorStop(1,'rgba(0,0,0,0)'); bg.fillStyle=rg; bg.fillRect(0,0,1080,1920);};
  blob(260+120*Math.sin(t*.35),520+140*Math.cos(t*.27),760,L.glowA); blob(860+110*Math.cos(t*.31),1380+120*Math.sin(t*.23),820,L.glowB);
  // grid floor
  bg.save(); bg.globalAlpha=.16; bg.strokeStyle=L.accent; bg.lineWidth=1.2; const hz=1180, off=(t*60)%90;
  for(let i=-12;i<=12;i++){ bg.beginPath(); bg.moveTo(540+i*16,hz); bg.lineTo(540+i*240,1920); bg.stroke(); }
  for(let k=0;k<14;k++){ const y=hz+Math.pow((k*90+off)/1260,2.2)*740; bg.globalAlpha=.16*cl((y-hz)/200); bg.beginPath(); bg.moveTo(0,y); bg.lineTo(1080,y); bg.stroke(); }
  bg.restore();
  // particles
  bg.fillStyle='rgba(255,255,255,.55)'; for(const p of P){ const y=(p.y-t*p.v*4+1920*10)%1920; bg.globalAlpha=.25+.25*Math.sin(t*1.3+p.x); bg.beginPath(); bg.arc(p.x+8*Math.sin(t*.6+p.y),y,p.s*1.6,0,7); bg.fill(); } bg.globalAlpha=1;
}
function words(el,t0,t,stag=.055){ [...el.children].forEach((s,i)=>{ const k=spring(t-t0-i*stag,.55,.8), b=(1-cl((t-t0-i*stag)/.32)); s.style.opacity=cl((t-t0-i*stag)/.18); s.style.transform='translateY('+(28*(1-k))+'px)'; s.style.filter='blur('+(14*b).toFixed(2)+'px)'; }); }
let lastHead='';
window.render=(f)=>{
  const t=f/FPS; drawBg(t);
  // ---- intro (0..IN): logo strokes draw, then the title words spring in; then it lifts away
  const io=1-ease((t-(IN-.45))/.45); $('intro').style.opacity=t<IN?io:0; $('intro').style.transform='translateY('+(-80*(1-io))+'px) scale('+(1+.04*(1-io))+')';
  const lb=$('lbox'), lc=$('lchk'); if(lb){ lb.style.strokeDashoffset=1-ease(t/.75); lc.style.strokeDashoffset=1-ease((t-.55)/.45); }
  const lbB=$('logoBrand'); if(lbB){ const k=spring(t,.7,.75); lbB.style.transform='scale('+(.7+.3*k)+')'; lbB.style.opacity=cl(t/.4); }
  $('logo').style.transform='scale('+(.86+.14*spring(t,.6,.7))+')';
  words($('ih'),.75,t); words($('is'),1.2,t,.04);
  // ---- phone: springs up with a 3D tilt, floats, camera follows taps
  const enter=spring(t-(IN-.5),.75,.78); const exitK=ease((t-(IN+D))/.6);
  const at=t-IN; const si=SRC_AT[Math.max(0,Math.min(SRC_AT.length-1,Math.round(cl(at,0,D)*FPS)))]; const fi=Math.max(1,Math.min(NSEQ,Math.floor(si*FPS)+1));
  const src='file://${SEQ}/'+String(fi).padStart(5,'0')+'.jpg'; const img=$('app'); if(img.dataset.s!==src){ img.dataset.s=src; img.src=src; }
  // camera: zoom toward the tap on key moments
  let zoom=0, fy=.5;
  for(const c of CAPS){ if(!c.key||c.y==null) continue; const k=spring(t-c.t0,.6,.85)*(1-spring(t-(c.t1-.35),.55,.9)); if(k>zoom){ zoom=k; fy=c.y; } }
  const z=1+.30*zoom; const phoneTop=500; const fyp=(56+fy*1210)/1266; const ty=-(fyp*1266-633)*(z-1)*1.0;
  const rx=mix(28,5,enter)+2*Math.sin(t*.8), ry=4*Math.sin(t*.5)-2*zoom, float=6*Math.sin(t*1.1);
  const y=mix(2050,phoneTop,enter)+float+ty - 900*exitK;
  $('phoneWrap').style.transform='translate3d(0,'+y.toFixed(1)+'px,0) rotateX('+rx.toFixed(2)+'deg) rotateY('+ry.toFixed(2)+'deg) scale('+(z*(1-.25*exitK)).toFixed(4)+')';
  $('phoneWrap').style.transformOrigin='0 '+(fyp*1298)+'px'; $('phone').style.opacity=1-exitK;
  $('glare').style.transform='translateX('+(((t*.18)%1.6-.8)*900).toFixed(0)+'px)';
  // tap ring on each cue with a tap point
  let ring=null; for(const c of CAPS){ if(c.y!=null&&t>=c.t0&&t<c.t0+.6) ring=c; }
  const R=$('ring'); if(ring){ const k=(t-ring.t0)/.6; R.style.top=((56+ring.y*1210)/1266*100)+'%'; R.style.left='50%'; R.style.opacity=(1-k)*.9; R.style.transform='scale('+(.4+1.4*ease(k))+')'; } else R.style.opacity=0;
  // ---- caption: morphs out of the Dynamic Island into a glass pill above the phone
  let cur=null; for(const c of CAPS){ if(t>=c.t0&&t<c.t1) cur=c; }
  const pill=$('pill'); const head=$('head');
  if(cur&&t<IN+D){
    if(lastHead!==cur.text){ lastHead=cur.text; head.innerHTML=cur.text.split(' ').map(w=>'<span>'+w+'&nbsp;</span>').join(''); $('kick').style.display=cur.key?'block':'none'; }
    const m=spring(t-cur.t0,.5,.78);
    const W=mix(160,cur.key?900:860,m), H=mix(46,cur.key?250:200,m), top=mix(y+22,cur.key?190:215,m);
    pill.style.width=W+'px'; pill.style.height=H+'px'; pill.style.marginLeft=(-W/2)+'px'; pill.style.top=top+'px'; pill.style.borderRadius=mix(30,cur.key?54:48,m)+'px';
    pill.style.opacity=cl((t-cur.t0)/.08)*(1-ease((t-(cur.t1-.12))/.12));
    pill.style.borderColor=cur.key?L.key:L.pillEdge; pill.style.boxShadow=cur.key?('0 0 0 1px '+L.key+',0 0 60px '+L.glowA+',0 20px 60px rgba(0,0,0,.35)'):'0 20px 60px rgba(0,0,0,.35),inset 0 1px 0 rgba(255,255,255,.22)';
    words(head,cur.t0+.14,t,.05); $('kick').style.opacity=cl((t-cur.t0-.1)/.2);
  } else pill.style.opacity=0;
  // ---- outro: glass card springs in, loops back visually to the intro logo
  const ok=spring(t-(IN+D+.15),.7,.8); $('outro').style.opacity=cl((t-(IN+D+.1))/.3); $('oc').style.transform='translateY('+(160*(1-ok))+'px) scale('+(.9+.1*ok)+')';
  // light sweep at the big moments (intro end, outro)
  const sw=[IN-.2,IN+D+.4].map(s=>cl((t-s)/.9)).find(k=>k>0&&k<1); $('sweep').style.transform='translateX('+(sw!=null?(-1400+2800*ease(sw)):-3000)+'px)';
  return img.complete && img.naturalWidth ? true : new Promise(r=>{ img.onload=()=>r(true); img.onerror=()=>r(false); });
};
</script>`;
writeFileSync(`${OUT}/stage.html`, html);
const from = +(opt('from') || 0), to = opt('to') == null ? T : +opt('to');
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--no-sandbox', '--allow-file-access-from-files'] });
const p = await b.newPage({ viewport: { width: 1080, height: 1920 } });
await p.goto(`file://${OUT}/stage.html`); await p.evaluate(() => document.fonts.ready);
const F0 = Math.round(from * FPS), F1 = Math.min(N, Math.round(to * FPS));
const preview = opt('from') != null || opt('to') != null;
const step = preview ? Math.max(1, Math.round(+(opt('step') || 1) * FPS)) : 1;
mkdirSync(`${OUT}/f`, { recursive: true });
const t0 = Date.now();
for (let f = F0; f < F1 && !process.env.ENCODE_ONLY; f += step) {
  await p.evaluate(n => window.render(n), f);
  await p.screenshot({ path: `${OUT}/f/${String(f).padStart(5, '0')}.jpg`, type: 'jpeg', quality: 92 });
  if (f % 150 === 0) console.log(`  frame ${f}/${N} · ${((Date.now() - t0) / 1000).toFixed(0)} s`);
}
await b.close();
if (preview) { console.log('preview frames in', OUT + '/f'); process.exit(0); }
// 3) sound: bed + UI clicks on taps + whoosh into each key moment + logo shimmer, side-chained, −14 LUFS
const taps = caps.filter(c => c.y != null).map(c => c.t0), keys = caps.filter(c => c.key).map(c => c.t0);
const click = taps.map(s => `0.55*sin(2*PI*2600*(t-${s.toFixed(2)}))*exp(-90*max(t-${s.toFixed(2)},0))*gte(t,${s.toFixed(2)})`).join('+') || '0';
const bed = `0.05*(sin(2*PI*110*t)+sin(2*PI*164.8*t)+sin(2*PI*220*t)+0.6*sin(2*PI*329.6*t))*(0.65+0.35*sin(2*PI*0.125*t))+0.30*sin(2*PI*(46+70*exp(-30*mod(t,0.5)))*mod(t,0.5))*exp(-9*mod(t,0.5))*gte(t,${IN.toFixed(2)})*lt(t,${(IN + DO).toFixed(2)})`;
const shimmer = `0.18*sin(2*PI*(1760+400*t)*t)*exp(-3*t)*lt(t,1.2)+0.16*sin(2*PI*1318*(t-${(IN + DO + .2).toFixed(2)}))*exp(-2.5*max(t-${(IN + DO + .2).toFixed(2)},0))*gte(t,${(IN + DO + .2).toFixed(2)})`;
const wh = [IN - .4, ...keys.map(k => k - .35), IN + DO].map(s => `between(t,${s.toFixed(2)},${(s + .45).toFixed(2)})*sin(PI*(t-${s.toFixed(2)})/0.45)`).join('+');
const out = `${DIR}out/motion-${clip}${LOOK === 'brand' ? '-brand' : ''}.mp4`;
execFileSync(FF, ['-loglevel', 'error', '-y', '-framerate', String(FPS), '-i', `${OUT}/f/%05d.jpg`,
  '-f', 'lavfi', '-i', `aevalsrc='${bed}+${shimmer}':s=48000:d=${T.toFixed(2)}`,
  '-f', 'lavfi', '-i', `aevalsrc='${click}':s=48000:d=${T.toFixed(2)}`,
  '-f', 'lavfi', '-i', `anoisesrc=d=${T.toFixed(2)}:c=pink:a=0.5:r=48000`,
  '-filter_complex', `[3:a]volume='0.35*(${wh})':eval=frame,highpass=f=500,lowpass=f=6000[w];[2:a]highpass=f=900[c];[1:a][c][w]amix=inputs=3:normalize=0,afade=t=in:d=0.2,afade=t=out:st=${(T - 1).toFixed(2)}:d=1,loudnorm=I=-14:TP=-1.5:LRA=9,aformat=sample_rates=48000:channel_layouts=stereo[a]`,
  '-map', '0:v', '-map', '[a]', '-c:v', 'libx264', '-preset', 'slow', '-crf', '17', '-maxrate', '5M', '-bufsize', '10M', '-pix_fmt', 'yuv420p', '-profile:v', 'high', '-g', '60', '-r', String(FPS),
  '-c:a', 'aac', '-b:a', '160k', '-movflags', '+faststart', '-shortest', out]);
console.log('motion reel', out, T.toFixed(1) + ' s', N + ' frames', ((Date.now() - t0) / 1000).toFixed(0) + ' s render');
