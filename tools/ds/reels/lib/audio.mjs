// DS Reel engine — audio. Everything is synthesized locally with ffmpeg lavfi (aevalsrc + filters): no samples, no
// downloads, no copyrighted music. Music = beat-locked stems (kick / snare / hats / bass / chords / extras) with
// sample-accurate section gates (intro without drums, breaks, outro); SFX = short lavfi one-shots placed on the cue
// times from the page (Node only adds samples at offsets); music is side-chain ducked under the SFX; loudnorm two-pass
// to −14 LUFS integrated, true peak −1.5 dBTP.
import { spawn } from 'child_process';
import { writeFileSync, mkdirSync } from 'fs';
const FF = process.env.FFMPEG || '/tmp/ff/node_modules/ffmpeg-static/ffmpeg';
const SR = 48000;
export const PRESETS = {
  lofi: { bpm: 84, about: 'warm, laid-back: half-time drums, Rhodes chords, vinyl crackle, soft bass (Fmaj7–Em7–Dm7–Cmaj7)' },
  upbeat: { bpm: 122, about: 'bright four-on-the-floor: clap, open hats, offbeat plucks, pumping pad (C–G–Am–F)' },
  tension: { bpm: 100, about: 'suspense: low drone, 16th pulse, clock ticks, booms, risers into each phrase (Am–F–Dm–E)' },
  minimal: { bpm: 104, about: 'clean tech: soft kick, rim, marimba arpeggio, airy pad (Cmaj9–Am9–Fmaj9–G6)' },
};
const f = (x, d = 5) => (+x).toFixed(d);
const run = args => new Promise((res, rej) => { const p = spawn(FF, args); const out = [], err = []; p.stdout.on('data', d => out.push(d)); p.stderr.on('data', d => err.push(d)); p.on('close', c => { const r = { stdout: Buffer.concat(out), stderr: Buffer.concat(err) }; c === 0 ? res(r) : rej(new Error('ffmpeg failed: ' + String(r.stderr).slice(-1500))); }); });

// ---------- music ----------
function musicGraph(preset, bpm, T, sec) {
  const b = 60 / bpm, bar = 4 * b;
  const gate = ranges => ranges.length ? ranges.map(([a, z]) => `(1-between(t,${f(a)},${f(z)}))`).join('*') : '1';
  const drumOff = [...(sec.intro ? [sec.intro] : []), ...sec.breaks, ...(sec.outro ? [sec.outro] : [])];
  const GD = '1', GB = '1', GO = '1';   // gates are applied after looping (see renderMusic)
  // tau since the last hit at beat offset `off` repeating every `per` beats
  const tau = (off, per) => `mod(t+${f((per - off) * b)},${f(per * b)})`;
  const hits = (offs, per, fn) => offs.map(o => fn(tau(o, per))).join('+');
  const barIdx = `mod(floor(t/${f(bar)}),4)`;
  const sel = (arr, idx = barIdx) => arr.slice(0, -1).reduceRight((acc, v, i) => `if(eq(${idx},${i}),${v},${acc})`, String(arr[arr.length - 1]));
  const edge = `min(1,(${f(bar)}-mod(t,${f(bar)}))*14)`;                    // fade to 0 at every bar line (no clicks on chord changes)
  const kickF = u => `sin(2*PI*(44*${u}+150*(1-exp(-${u}*36))/36))*exp(-${u}*6.5)`;
  const snareF = (u, r) => `(0.62*(random(${r})*2-1)*exp(-${u}*17)+0.5*sin(2*PI*185*${u})*exp(-${u}*30))`;
  const hatF = (u, r, k = 90) => `(random(${r})*2-1)*exp(-${u}*${k})`;
  const stems = [];   // [expr (mono or L|R), filters, gain]
  const chordVoices = (chords, gain, tone, envFn, r = 1.0035) => chords[0].map((_, v) => {
    const fr = sel(chords.map(c => c[v]));
    return [`${tone(fr)}*${envFn}*${edge}|${tone(`(${fr})*${r}`)}*${envFn}*${edge}`, '', gain];
  });
  if (preset === 'lofi') {
    const CH = [[174.61, 220, 261.63, 329.63], [164.81, 196, 246.94, 293.66], [146.83, 174.61, 220, 261.63], [130.81, 164.81, 196, 246.94]];
    const BS = [87.31, 82.41, 73.42, 65.41];
    stems.push([`(${hits([0, 2.5], 4, kickF)})*${GD}`, 'lowpass=f=3200', .95]);
    stems.push([`(${hits([1, 3], 4, u => snareF(u, 0))})*${GD}`, 'highpass=f=200,lowpass=f=5200,aecho=0.8:0.55:45:0.3', .42]);
    stems.push([`(${hits([0, .5], 1, u => hatF(u, 1, 80))})*(0.55+0.45*eq(mod(floor(t/${f(b / 2)}),2),1))*${GO}`, 'highpass=f=6500,lowpass=f=11000', .2]);
    stems.push([`(sin(2*PI*(${sel(BS)})*t)+0.3*sin(4*PI*(${sel(BS)})*t))*min(1,mod(t,${f(2 * b)})*60)*min(1,(${f(2 * b)}-mod(t,${f(2 * b)}))*20)*exp(-mod(t,${f(2 * b)})*1.1)*${GB}`, 'lowpass=f=420', .55]);
    // Rhodes-ish chords struck on 1 and the "and" of 2
    chordVoices(CH, .17, fr => `(sin(2*PI*${fr}*t)+0.22*sin(4*PI*${fr}*t)*exp(-mod(t,${f(bar)})*4))`, `(exp(-mod(t,${f(bar)})*1.3)+0.8*min(1,max(0,(mod(t,${f(bar)})-${f(1.5 * b)})*200))*exp(-max(0,mod(t,${f(bar)})-${f(1.5 * b)})*1.6))*min(1,mod(t,${f(bar)})*200)*(0.85+0.15*sin(2*PI*4.5*t))`).forEach(s => stems.push(s));
    stems.push([`(0.5*gt(random(7),0.99935)*(random(8)*2-1)+0.012*(random(9)*2-1))`, 'highpass=f=900,lowpass=f=7000', .5]);   // vinyl crackle + hiss
    return { stems, bus: 'lowpass=f=6000,vibrato=f=0.5:d=0.04', pump: false };
  }
  if (preset === 'upbeat') {
    const CH = [[261.63, 329.63, 392], [196, 246.94, 293.66], [220, 261.63, 329.63], [174.61, 220, 261.63]];
    const BS = [65.41, 98, 110, 87.31];
    stems.push([`(${hits([0], 1, kickF)})*${GD}`, 'lowpass=f=4500', 1]);
    stems.push([`(${hits([1, 3], 4, u => `(random(0)*2-1)*(exp(-${u}*30)+0.7*gte(${u},0.011)*exp(-(${u}-0.011)*28)+0.5*gte(${u},0.022)*exp(-(${u}-0.022)*14))`)})*${GD}`, 'bandpass=f=1600:width_type=o:w=1.6,aecho=0.8:0.5:30:0.25', .5]);
    stems.push([`(${hits([.5], 1, u => hatF(u, 1, 13))})*${GD}`, 'highpass=f=7000', .16]);
    stems.push([`(${hits([0, .25, .5, .75], 1, u => hatF(u, 2, 110))})*${GO}`, 'highpass=f=8000', .1]);
    stems.push([`(sin(2*PI*(${sel(BS)})*t)+0.45*sin(4*PI*(${sel(BS)})*t)+0.2*sin(6*PI*(${sel(BS)})*t))*min(1,mod(t,${f(b / 2)})*150)*min(1,(${f(b / 2)}-mod(t,${f(b / 2)}))*70)*exp(-mod(t,${f(b / 2)})*3)*${GB}`, 'lowpass=f=650', .5]);
    const saw = fr => `(sin(2*PI*${fr}*t)+0.5*sin(4*PI*${fr}*t)+0.33*sin(6*PI*${fr}*t)+0.25*sin(8*PI*${fr}*t)+0.2*sin(10*PI*${fr}*t))`;
    chordVoices(CH, .085, saw, `exp(-mod(t+${f(b / 2)},${f(b)})*11)*min(1,mod(t+${f(b / 2)},${f(b)})*300)*gte(mod(t,${f(b)}),${f(b / 2)})*min(1,(${f(b)}-mod(t,${f(b)}))*60)`).forEach(([e, , g]) => stems.push([e, 'lowpass=f=3200', g]));  // offbeat plucks
    chordVoices(CH, .07, fr => `sin(2*PI*${fr}*t*0.5)`, `min(1,mod(t,${f(bar)})*3)`).forEach(([e, , g]) => stems.push([e, 'lowpass=f=1800', g, 'pump']));   // pad an octave down, pumped
    return { stems, bus: 'aecho=0.8:0.4:90:0.18', pump: true };
  }
  if (preset === 'tension') {
    const BS = [110, 87.31, 73.42, 82.41];
    stems.push([`(0.5*sin(2*PI*55*t)+0.3*sin(2*PI*110.3*t)+0.18*sin(2*PI*164.8*t))*(0.75+0.25*sin(2*PI*t/${f(2 * bar)}))`, 'lowpass=f=420', .45]);
    stems.push([`(sin(2*PI*(${sel(BS)})*t)+0.3*sin(4*PI*(${sel(BS)})*t))*min(1,mod(t,${f(b / 4)})*400)*min(1,(${f(b / 4)}-mod(t,${f(b / 4)}))*120)*exp(-mod(t,${f(b / 4)})*24)*${edge}*${GB}`, 'lowpass=f=900', .42]);
    stems.push([`(${hits([0], 1, u => `(0.7*sin(2*PI*2400*${u})*exp(-${u}*160)+0.4*(random(1)*2-1)*exp(-${u}*400))*(1-0.35*eq(mod(floor(t/${f(b)}),2),1))`)})*${GO}`, 'highpass=f=1200', .32]);
    stems.push([`(${hits([0], 8, u => `sin(2*PI*(36+40*exp(-${u}*7))*${u})*exp(-${u}*1.4)`)})*${GD}`, 'lowpass=f=300', .9]);
    stems.push([`(${hits([1, 3], 4, u => snareF(u, 2))})*${GD}`, 'highpass=f=300,lowpass=f=6000,aecho=0.8:0.6:70:0.35', .3]);
    stems.push([`(random(3)*2-1)*pow(mod(t,${f(4 * bar)})/${f(4 * bar)},4)*${GO}`, 'highpass=f=1500,lowpass=f=9000', .22]);   // riser into each 4-bar phrase
    const CH = [[220, 261.63, 329.63], [174.61, 220, 261.63], [146.83, 174.61, 220], [164.81, 207.65, 246.94]];
    chordVoices(CH, .06, fr => `(sin(2*PI*${fr}*t)+0.2*sin(4*PI*${fr}*t))`, `min(1,mod(t,${f(bar)})*1.5)`).forEach(([e, , g]) => stems.push([e, 'lowpass=f=1500', g]));
    return { stems, bus: 'aecho=0.8:0.5:140:0.25', pump: false };
  }
  // minimal
  const AR = [[523.25, 659.25, 783.99, 987.77], [440, 523.25, 659.25, 783.99], [349.23, 440, 523.25, 659.25], [392, 493.88, 587.33, 659.25]];
  const BS = [65.41, 55, 87.31, 98];
  stems.push([`(${hits([0, 2], 4, u => `0.8*${kickF(u)}`)})*${GD}`, 'lowpass=f=2500', .9]);
  stems.push([`(${hits([1, 3], 4, u => `(0.8*sin(2*PI*1750*${u})*exp(-${u}*90)+0.5*(random(1)*2-1)*exp(-${u}*130))`)})*${GD}`, 'highpass=f=700', .35]);
  stems.push([`(${hits([0, .25, .5, .75], 1, u => hatF(u, 2, 60))})*(0.4+0.6*eq(mod(floor(t/${f(b / 4)}),2),1))*${GO}`, 'highpass=f=6000', .1]);
  const u8 = `mod(t,${f(b / 2)})`, k8 = `mod(floor(t/${f(b / 2)}),4)`;
  const note = sel(AR.map(c => sel(c, k8)));
  stems.push([`(sin(2*PI*(${note})*${u8})*exp(-${u8}*7)+0.3*sin(8*PI*(${note})*${u8})*exp(-${u8}*22))*min(1,${u8}*500)*min(1,(${f(b / 2)}-${u8})*90)|(sin(2*PI*(${note})*1.003*${u8})*exp(-${u8}*7)+0.3*sin(8*PI*(${note})*${u8})*exp(-${u8}*22))*min(1,${u8}*500)*min(1,(${f(b / 2)}-${u8})*90)`, 'aecho=0.8:0.5:' + Math.round(b * 750) + ':0.3', .2]);
  stems.push([`(sin(2*PI*(${sel(BS)})*t)+0.25*sin(4*PI*(${sel(BS)})*t))*min(1,mod(t,${f(bar)})*30)*${edge}*exp(-mod(t,${f(bar)})*0.5)*${GB}`, 'lowpass=f=350', .5]);
  chordVoices(AR.map(c => c.map(x => x / 2)), .05, fr => `sin(2*PI*${fr}*t)`, `min(1,mod(t,${f(bar)})*2)`).forEach(([e, , g]) => stems.push([e, 'lowpass=f=2400', g]));
  return { stems, bus: 'aecho=0.8:0.6:120|180:0.25|0.18', pump: false };
}
// which gate each stem gets: drums (kick, snare/clap, booms) off in intro / breaks / outro; bass off in breaks / outro;
// hats / risers off in the outro; chords and pads always on
const GATES = { lofi: ['D', 'D', 'O', 'B'], upbeat: ['D', 'D', 'D', 'O', 'B'], tension: ['', 'B', 'O', 'D', 'D', 'O'], minimal: ['D', 'D', 'O', '', 'B'] };
async function renderMusic(preset, bpm, T, sec, out) {
  const { stems, bus, pump } = musicGraph(preset, bpm, T, sec);
  const b = 60 / bpm, L = Math.round(16 * b * SR);                        // one 4-bar loop, sample exact
  const gate = ranges => ranges.length ? ranges.map(([a, z]) => `(1-clip((t-${f(a - .012)})/0.012,0,1)*clip((${f(z + .012)}-t)/0.012,0,1))`).join('*') : '';
  const G = { D: gate([...(sec.intro ? [sec.intro] : []), ...sec.breaks, ...(sec.outro ? [sec.outro] : [])]), B: gate(sec.breaks), O: gate(sec.outro ? [sec.outro] : []) };
  const d = f(L / SR, 6);
  let g = '', mixIn = [], pumpIn = [];
  stems.forEach(([expr, flt, gain, tag], i) => {
    const ge = G[(GATES[preset] || [])[i] || ''] || '';
    g += `aevalsrc=exprs='${expr}':s=${SR}:d=${d},aformat=channel_layouts=stereo,aloop=loop=-1:size=${L},atrim=0:${f(T + .05, 4)}${ge ? `,aeval=exprs='val(0)*${ge}|val(1)*${ge}'` : ''}${flt ? ',' + flt : ''},volume=${gain}[s${i}];`;
    (tag === 'pump' ? pumpIn : mixIn).push(`[s${i}]`);
  });
  if (pump && pumpIn.length) {
    g += `[s0]asplit=2[k0][kk];`; mixIn[0] = '[k0]';
    g += `${pumpIn.join('')}amix=inputs=${pumpIn.length}:normalize=0[pd];[pd][kk]sidechaincompress=threshold=0.05:ratio=8:attack=4:release=160[pdk];`;
    mixIn.push('[pdk]');
  }
  g += `${mixIn.join('')}amix=inputs=${mixIn.length}:normalize=0${bus ? ',' + bus : ''},afade=t=in:d=0.03,afade=t=out:st=${f(Math.max(0, T - 1.4), 3)}:d=1.4,atrim=0:${f(T, 4)}[m]`;
  const gf = out + '.graph.txt'; writeFileSync(gf, g);
  await run(['-y', '-loglevel', 'error', '-filter_complex_script', gf, '-map', '[m]', '-c:a', 'pcm_f32le', '-ar', String(SR), out]);
}

// ---------- SFX (one-shots) ----------
// lead = seconds from the start of the sound to the moment it should land on the cue
export const SFX = {
  whoosh: { d: .7, lead: .36, e: `(random(0)*2-1)*pow(sin(PI*min(t/0.7,1)),3)*(0.7+0.3*sin(2*PI*9*t))`, af: 'bandpass=f=900:width_type=o:w=2.4,aphaser=in_gain=0.6:out_gain=0.95:delay=2.5:decay=0.55:speed=1.6,volume=2.6' },
  whip: { d: .36, lead: .19, e: `((random(0)*2-1)*0.8+0.4*sin(2*PI*(1900*t-1700*t*t)))*pow(sin(PI*min(t/0.36,1)),2.5)`, af: 'highpass=f=500,lowpass=f=8000,volume=2' },
  rip: { d: .45, lead: .12, e: `(random(0)*2-1)*gt(random(1),0.5)*pow(sin(PI*min(t/0.45,1)),0.7)*(0.6+0.4*sin(2*PI*31*t))`, af: 'bandpass=f=2600:width_type=o:w=2.2,volume=1.6' },
  hit: { d: .9, lead: 0, e: `(sin(2*PI*(40*t+130*(1-exp(-t*30))/30))*exp(-t*4.8)+0.35*(random(0)*2-1)*exp(-t*30))*min(1,t*900)`, af: 'lowpass=f=2800,aecho=0.8:0.35:55:0.2' },
  boom: { d: 1.9, lead: 0, e: `(sin(2*PI*(32*t+90*(1-exp(-t*14))/14))*exp(-t*2)+0.3*(random(0)*2-1)*exp(-t*9))*min(1,t*900)`, af: 'lowpass=f=1500,aecho=0.8:0.5:90:0.3' },
  pop: { d: .15, lead: 0, e: `sin(2*PI*(330*t+760*(1-exp(-t*45))/45))*exp(-t*26)*min(1,t*900)`, af: 'volume=0.9' },
  tap: { d: .06, lead: 0, e: `(0.7*(random(0)*2-1)*exp(-t*420)+0.6*sin(2*PI*2400*t)*exp(-t*170))`, af: 'highpass=f=300' },
  tick: { d: .035, lead: 0, e: `(0.55*(random(0)*2-1)*exp(-t*800)+0.5*sin(2*PI*3300*t)*exp(-t*280))`, af: 'highpass=f=1500' },
  ding: { d: 1.6, lead: 0, e: `(0.55*sin(2*PI*1318.5*t)*exp(-t*3)+0.3*sin(2*PI*2637*t)*exp(-t*5)+0.16*sin(2*PI*3951*t)*exp(-t*8)+0.1*sin(2*PI*5274*t)*exp(-t*12))*min(1,t*900)`, af: 'aecho=0.8:0.4:70:0.2' },
  nope: { d: .45, lead: 0, e: ['311.13', '233.08'].map((fr, i) => { const a = i * .2, z = a + .17; return `(sin(2*PI*${fr}*t)+0.4*sin(6*PI*${fr}*t)+0.2*sin(10*PI*${fr}*t))*min(1,max(0,(t-${a})*400))*min(1,max(0,(${z}-t)*150))*exp(-max(0,t-${a})*5)`; }).join('+'), af: 'lowpass=f=2400,volume=0.55' },
  send: { d: .24, lead: 0, e: `(sin(2*PI*(520*t+2400*t*t))*0.8+0.25*(random(0)*2-1))*pow(sin(PI*min(t/0.24,1)),1.4)`, af: 'lowpass=f=6000,volume=0.8' },
  recv: { d: .34, lead: 0, e: `(sin(2*PI*880*t)*min(1,t*600)*min(1,max(0,(0.11-t)*300))+sin(2*PI*1318.5*t)*min(1,max(0,(t-0.12)*600))*exp(-max(0,t-0.12)*12))*0.7`, af: 'volume=0.8' },
  riser: { d: 1.6, lead: 1.6, e: `((random(0)*2-1)*0.7+0.3*sin(2*PI*(160*t+540*t*t)))*pow(t/1.6,3)*min(1,(1.6-t)*80)`, af: 'highpass=f=450,volume=1.3' },
};
async function renderSfx(name) {
  const s = SFX[name]; if (!s) throw new Error('unknown sfx ' + name);
  const r = await run(['-loglevel', 'error', '-f', 'lavfi', '-i', `aevalsrc=exprs='${s.e}':s=${SR}:d=${s.d}`, '-af', s.af || 'anull', '-f', 'f32le', '-ac', '1', '-ar', String(SR), 'pipe:1']);
  return new Float32Array(r.stdout.buffer.slice(r.stdout.byteOffset, r.stdout.byteOffset + r.stdout.length));
}
const SFX_GAIN = +(process.env.REELS_SFX_GAIN || .62);   // overall SFX level under the music
const BAL = { whoosh: .55, whip: .5, rip: .35, hit: .9, boom: .9, pop: .45, tap: .5, tick: .28, ding: .32, nope: .5, send: .4, recv: .4, riser: .4 };

// ---------- full mix ----------
// cues: [{t, s, g?, p?}] in reel time; sec: {intro:[a,b]|null, breaks:[[a,b]], outro:[a,b]|null}
export async function buildAudio({ T, bpm, preset, cues, sec, dir, music = true, sfx = true }) {
  mkdirSync(dir, { recursive: true });
  const mw = `${dir}/music.wav`;
  const used = [...new Set(cues.map(c => c.s).filter(s => SFX[s]))];
  const [, ...srcs] = await Promise.all([music ? renderMusic(preset, bpm, T, sec, mw) : run(['-y', '-loglevel', 'error', '-f', 'lavfi', '-i', `anullsrc=r=${SR}:cl=stereo`, '-t', f(T, 4), '-c:a', 'pcm_f32le', mw]), ...used.map(renderSfx)]);
  const cache = Object.fromEntries(used.map((s, i) => [s, srcs[i]]));
  const N = Math.ceil(T * SR) + 1, buf = new Float32Array(N);
  if (sfx) for (const c of cues) {
    const def = SFX[c.s]; if (!def) continue;
    const src = cache[c.s];
    const p = c.p || 1, g = (c.g ?? 1) * (BAL[c.s] ?? .5) * SFX_GAIN;
    const start = Math.round((c.t - def.lead / p) * SR), len = Math.floor(src.length / p);
    for (let i = 0; i < len; i++) { const j = start + i; if (j < 0 || j >= N) continue; const x = i * p, k = Math.floor(x), fr = x - k; buf[j] += g * (src[k] * (1 - fr) + (src[k + 1] || 0) * fr); }
  }
  const sw = `${dir}/sfx.f32`; writeFileSync(sw, Buffer.from(buf.buffer));
  const chain = `[1:a]aformat=channel_layouts=stereo,asplit=2[s][k];[0:a][k]sidechaincompress=threshold=0.04:ratio=4:attack=6:release=260:makeup=1[md];[md][s]amix=inputs=2:normalize=0,highpass=f=28`;
  const ins = ['-i', mw, '-f', 'f32le', '-ar', String(SR), '-ac', '1', '-i', sw];
  const p1 = await run(['-hide_banner', '-nostats', ...ins, '-filter_complex', chain + ',loudnorm=I=-14:TP=-1.5:LRA=11:print_format=json[o]', '-map', '[o]', '-f', 'null', '-']);
  const m = JSON.parse(String(p1.stderr).match(/\{[\s\S]*?\}/g).pop());
  const out = `${dir}/mix.wav`;
  await run(['-y', '-loglevel', 'error', ...ins, '-filter_complex', chain + `,loudnorm=I=-14:TP=-1.5:LRA=11:measured_I=${m.input_i}:measured_TP=${m.input_tp}:measured_LRA=${m.input_lra}:measured_thresh=${m.input_thresh}:offset=${m.target_offset}:linear=true,aresample=${SR},alimiter=limit=0.83:attack=1.5:release=60:level=false,atrim=0:${f(T, 4)}[o]`, '-map', '[o]', '-c:a', 'pcm_s16le', '-ar', String(SR), out]);
  const p3 = await run(['-hide_banner', '-nostats', '-i', out, '-af', 'loudnorm=I=-14:TP=-1.5:LRA=11:print_format=json', '-f', 'null', '-']);
  const m3 = JSON.parse(String(p3.stderr).match(/\{[\s\S]*?\}/g).pop());
  return { wav: out, lufs: +m3.input_i, tp: +m3.input_tp, sfxTypes: Object.keys(cache) };
}
