/* DS Reel engine — in-page runtime (render.mjs loads it into one Chromium page).
   Every frame is a pure function of time: window.at(t) paints the frame for t. Nothing animates by itself —
   no CSS animations, transitions, timers, Date or Math.random — so any frame can be rendered in any order. */
(() => {
'use strict';
const C = window.__CFG;                         // {beat, T, lang, accent, scenes:[{type,start,dur,tin,tr,...}], assets, img:{src:{w,h}}, showSafe}
const W = 1080, H = 1920, S = { x: 60, y: 220, w: 880, h: 1280 };   // Instagram Reels safe zone
const B = C.beat;
const IMG = C.img;
document.documentElement.style.setProperty('--accent', C.accent);
const stage = document.getElementById('stage');

// ---------- math ----------
const cl = (x, a = 0, b = 1) => x < a ? a : x > b ? b : x;
const lerp = (a, b, p) => a + (b - a) * p;
const pr = (t, t0, d) => d <= 0 ? (t >= t0 ? 1 : 0) : cl((t - t0) / d);
const E = {
  o3: p => 1 - (1 - p) ** 3, i3: p => p ** 3, io3: p => p < .5 ? 4 * p ** 3 : 1 - (-2 * p + 2) ** 3 / 2,
  o5: p => 1 - (1 - p) ** 5, io5: p => p < .5 ? 16 * p ** 5 : 1 - (-2 * p + 2) ** 5 / 2, i2: p => p * p,
  ob: p => { const c = 1.6; return 1 + (c + 1) * (p - 1) ** 3 + c * (p - 1) ** 2; },
};
// damped spring 0 → 1 (overshoots a little); tau in seconds since the move started
const spr = (tau, f = 1.6, z = .55) => { if (tau <= 0) return 0; const w = 2 * Math.PI * f, wd = w * Math.sqrt(1 - z * z); return 1 - Math.exp(-z * w * tau) * (Math.cos(wd * tau) + z * w / wd * Math.sin(wd * tau)); };
const kick = (tau, k = 9) => tau < 0 ? 0 : Math.exp(-k * tau) * (1 - Math.exp(-70 * tau));   // punch envelope, peak ≈ .62 at 40 ms
const rng = s => { s = (Math.abs(Math.floor(s)) % 2147483646) + 1; return () => (s = (s * 16807) % 2147483647) / 2147483647; };
const qb = (x, step = B / 2) => Math.max(step, Math.round(x / step) * step);   // quantize to the beat grid

// ---------- dom ----------
const $ = (tag, cls, par, css, txt) => { const e = document.createElement(tag); if (cls) e.className = cls; if (css) Object.assign(e.style, css); if (txt != null) e.textContent = txt; if (par) par.appendChild(e); return e; };
const px = v => Math.round(v * 10) / 10 + 'px';
const place = (e, x, y) => { e.style.left = px(x); e.style.top = px(y); };
const svgNS = 'http://www.w3.org/2000/svg';
const svg = (par, w, h, inner, css) => { const s = document.createElementNS(svgNS, 'svg'); s.setAttribute('width', w); s.setAttribute('height', h); s.setAttribute('viewBox', `0 0 ${w} ${h}`); s.innerHTML = inner; s.style.position = 'absolute'; s.style.overflow = 'visible'; if (css) Object.assign(s.style, css); par.appendChild(s); return s; };

// ---------- text ----------
const WARN = [];
let CUR = -1;                                                   // scene index being built (for warnings)
const warn = (type, msg) => WARN.push({ scene: CUR, type, msg });
function tx(v) {                                                // bilingual prop → {m: main, s: second line}
  if (v == null || v === '') return { m: '', s: '' };
  if (typeof v !== 'object') return { m: String(v), s: '' };
  if (C.lang === 'es') return { m: v.es ?? v.en ?? '', s: '' };
  if (C.lang === 'bi') return { m: v.en ?? v.es ?? '', s: v.en != null && v.es != null ? v.es : '' };
  return { m: v.en ?? v.es ?? '', s: '' };
}
const LB = (en, es) => C.lang === 'es' ? es : C.lang === 'bi' ? `${en} · ${es}` : en;   // built-in labels
function toks(str) {                                            // *outline*  ==highlight==  \n = line break
  const out = [];
  String(str ?? '').split('\n').forEach((line, li) => {
    if (li) out.push({ br: 1 });
    const re = /(\*[^*]+\*|==[^=]+==)/g; let last = 0, m;
    // words; a segment that starts without a space glues onto the previous word ("*yours*," → no gap before the comma)
    const push = (s, c) => { const glue = out.length && !out[out.length - 1].br && s.length && !/^\s/.test(s) && last > 0; s.split(/\s+/).filter(Boolean).forEach((w, k) => out.push({ w, c, join: glue && k === 0 })); };
    while ((m = re.exec(line))) { push(line.slice(last, m.index), ''); const s = m[0]; s[0] === '*' ? push(s.slice(1, -1), 'o') : push(s.slice(2, -2), 'hl'); last = re.lastIndex; }
    push(line.slice(last), '');
  });
  return out;
}
// A text block that auto-fits its box (binary search on font size, text-wrap: balance), then is split into
// measured lines (.ln mask > .lni) and words (.w) so lines can be mask-revealed and words popped.
function block(par, str, o) {
  const el = $('div', `tb f${o.font || 'M'}${o.rd === false ? '' : ' rd'}${o.sz === false ? '' : ' sz'}${o.cls ? ' ' + o.cls : ''}`, par);
  el.style.width = px(o.w); el.style.textAlign = o.align || 'left';
  if (o.lh) el.style.lineHeight = o.lh;
  if (o.color) { el.style.color = o.color; el.style.setProperty('--ink', o.color); }
  if (o.weight) el.style.fontWeight = o.weight;
  if (o.ls != null) el.style.letterSpacing = o.ls;
  if (o.upper === false) el.style.textTransform = 'none';
  if (o.upper === true) el.style.textTransform = 'uppercase';
  const tk = toks(str);
  let prevW = null;
  tk.forEach((t, i) => {
    if (t.br) { $('br', null, el); prevW = null; return; }
    if (t.join && prevW && !t.c) { $('span', 'j', prevW, null, t.w); }          // "*yours*," → the comma rides inside the word (no line break before it)
    else prevW = $('span', 'w' + (t.c ? ' ' + t.c : ''), el, null, t.w);
    if (i < tk.length - 1 && !tk[i + 1].br && !(tk[i + 1].join && !tk[i + 1].c)) el.appendChild(document.createTextNode(' '));
  });
  const min = o.min ?? 44, max = Math.max(min, o.max ?? 120);
  const nLines = () => { const ws = el.querySelectorAll('.w'); const tops = new Set(); ws.forEach(w => tops.add(Math.round(w.offsetTop / 4))); return tops.size; };
  const ok = fs => { el.style.fontSize = fs + 'px'; return el.scrollHeight <= o.h + 1 && el.scrollWidth <= o.w + 1 && (!o.maxLines || nLines() <= o.maxLines); };
  let fs;
  if (ok(max)) fs = max;
  else if (!ok(min)) { fs = min; ok(min); el.dataset.ovf = 1; warn('overflow', `"${String(str).slice(0, 60)}" does not fit ${Math.round(o.w)}×${Math.round(o.h)} at ${min}px`); }
  else { let lo = min, hi = max; while (hi - lo > 1) { const mid = (lo + hi) >> 1; ok(mid) ? lo = mid : hi = mid; } fs = lo; ok(fs); }
  // balance: the narrowest width that keeps the same number of lines (greedy wrap) → even lines, no orphan words
  const n0 = nLines();
  if (n0 > 1 && o.balance !== false) {
    let lo = o.w * .4, hi = o.w;
    for (let k = 0; k < 11; k++) { const mid = (lo + hi) / 2; el.style.width = px(mid); if (nLines() <= n0 && el.scrollWidth <= mid + 1 && el.scrollHeight <= o.h + 1) hi = mid; else lo = mid; }
    el.style.width = px(hi + .5);
  }
  const ws = [...el.querySelectorAll('.w')]; const rows = []; let top = null;
  ws.forEach(w => { const tp = w.offsetTop; if (top === null || Math.abs(tp - top) > fs * .3) { rows.push([]); top = tp; } rows[rows.length - 1].push(w); });
  el.textContent = ''; el.style.width = px(o.w);
  const lines = rows.map(r => { const ln = $('div', 'ln', el); const inner = $('div', 'lni', ln); r.forEach((w, i) => { inner.appendChild(w); if (i < r.length - 1) inner.appendChild(document.createTextNode(' ')); if (i < r.length - 1 && w.classList.contains('hl') && r[i + 1].classList.contains('hl')) w.classList.add('hlr'); }); return { ln, inner, words: r }; });   // hlr: a ==multi word== highlight bridges the space to the next word (one bar, no seams)
  const b = { el, lines, words: ws, fs, w: o.w, h: el.offsetHeight };
  b.lineW = l => { const a = l.words[0], z = l.words[l.words.length - 1]; return z.offsetLeft + z.offsetWidth - a.offsetLeft; };
  b.textW = () => Math.max(0, ...lines.map(b.lineW));
  b.at = (x, y) => { place(el, x, y); b.x = x; b.y = y; return b; };
  return b;
}
// main text + optional Spanish second line (lang "bi"), stacked; returns a group with h and at(x, y)
function dual(par, v, o, o2 = {}) {
  const t = tx(v); const hasS = !!t.s;
  const mainH = hasS ? o.h * (o.mainShare || .66) : o.h;
  const m = block(par, t.m, { ...o, h: mainH });
  let s = null;
  if (hasS) s = block(par, t.s, { cls: 'es', font: 'I', weight: 500, color: o2.color || '#a9a9a9', w: o.w, h: Math.max(60, o.h - m.h - 14), max: Math.max(44, Math.min(62, Math.round(m.fs * (o.font === 'I' ? .82 : .42)))), min: 44, align: o.align, upper: false, ...o2 });
  const gap = hasS ? Math.round(Math.max(12, m.fs * .16)) : 0;
  const g = { m, s, gap, h: m.h + (s ? gap + s.h : 0), lines: [...m.lines, ...(s ? s.lines : [])] };
  g.at = (x, y) => { m.at(x, y); if (s) s.at(x, y + m.h + gap); g.x = x; g.y = y; return g; };
  return g;
}
// mask-reveal lines; returns nothing (sets transforms)
function revLines(lines, lt, t0, st = .075, d = .6, opts = {}) {
  lines.forEach((l, i) => {
    const p = E.o5(pr(lt, t0 + i * st, d));
    l.inner.style.transform = p >= 1 ? '' : `translateY(${((1 - p) * 108).toFixed(2)}%)${opts.rot ? ` rotate(${((1 - p) * 4).toFixed(2)}deg)` : ''}`;
    l.words.forEach(w => { if (w.classList.contains('hl')) w.style.setProperty('--hp', E.o3(pr(lt, t0 + i * st + d * .55, .32)).toFixed(3)); });
  });
}
const fadeUp = (e, lt, t0, d = .45, dy = 36) => { const p = E.o3(pr(lt, t0, d)); e.style.opacity = p.toFixed(3); e.style.transform = p >= 1 ? '' : `translateY(${((1 - p) * dy).toFixed(1)}px)`; };
function chip(par, text, cls = '') { const c = $('div', 'chip rd sz' + (cls ? ' ' + cls : ''), par, null, text); return c; }
const popIn = (e, tau, from = .6, f = 2, z = .5) => { const p = spr(tau, f, z); e.style.opacity = cl(tau / .06).toFixed(3); e.style.transform = tau <= 0 ? `scale(${from})` : `scale(${lerp(from, 1, p).toFixed(4)})`; };

// ---------- backgrounds (torn-paper panels, the DS feed look) ----------
const PAN = {};
function tornSrc(kind, seed) {
  const k = kind + seed; if (PAN[k]) return PAN[k];
  const r = rng(seed * 7919 + 17), OX = 180, OY = 160, PW = 1440, PH = 2240; const pts = [];
  const walkV = cx => { let x = cx; for (let y = 0; y <= PH; y += 6 + r() * 11) { x += (r() - .5) * 24 + (cx - x) * .09; if (r() < .05) x += (r() - .5) * 80; pts.push(`${x.toFixed(1)},${y.toFixed(1)}`); } };
  const walkH = cy => { let y = cy; for (let x = 0; x <= PW; x += 6 + r() * 11) { y += (r() - .5) * 24 + (cy - y) * .09; if (r() < .05) y += (r() - .5) * 80; pts.push(`${x.toFixed(1)},${y.toFixed(1)}`); } };
  let poly;
  if (kind === 'right') { walkV(OX + W * .58); poly = `${PW},0 ${pts.join(' ')} ${PW},${PH}`; }
  else if (kind === 'left') { walkV(OX + W * .4); poly = `0,0 ${pts.join(' ')} 0,${PH}`; }
  else if (kind === 'bottom') { walkH(OY + H * .64); poly = `0,${PH} ${pts.join(' ')} ${PW},${PH}`; }
  else if (kind === 'top') { walkH(OY + H * .3); poly = `0,0 ${pts.join(' ')} ${PW},0`; }
  else { let x = OX + W * .8; for (let y = 0; y <= PH; y += 6 + r() * 11) { const cx = OX + lerp(W * .82, W * .2, y / PH); x += (r() - .5) * 24 + (cx - x) * .12; pts.push(`${x.toFixed(1)},${y.toFixed(1)}`); } poly = `${PW},0 ${pts.join(' ')} ${PW},${PH}`; }
  const s = `<svg xmlns="${svgNS}" width="${PW}" height="${PH}"><defs><filter id="s" x="-10%" y="-10%" width="120%" height="120%"><feDropShadow dx="0" dy="0" stdDeviation="10" flood-opacity=".6"/></filter>
<filter id="n"><feTurbulence type="fractalNoise" baseFrequency=".9" numOctaves="2" seed="${seed}"/><feColorMatrix values="0 0 0 0 1  0 0 0 0 1  0 0 0 0 1  0 0 0 .07 0"/><feComposite in2="SourceGraphic" operator="in"/></filter></defs>
<polygon filter="url(#s)" points="${poly}" fill="#1b1b1b"/><polygon filter="url(#n)" points="${poly}" fill="#fff"/></svg>`;
  return PAN[k] = 'data:image/svg+xml;base64,' + btoa(s);
}
const NORMAL = { right: [1, 0], left: [-1, 0], bottom: [0, 1], top: [0, -1], diag: [1, 0] };
function background(bg, kind, seed) {
  $('div', 'glow', bg);
  if (!kind || kind === 'plain') return () => {};
  const img = $('img', 'panel', bg); img.src = tornSrc(kind, seed);
  const [nx, ny] = NORMAL[kind] || [1, 0];
  return (lt, dur) => { const p = spr(lt, 1.05, .82); const off = (1 - p) * 170 - 18 * E.io3(cl(lt / dur)); img.style.transform = `translate(${(nx * off).toFixed(1)}px,${(ny * off).toFixed(1)}px)`; };
}

// ---------- devices ----------
function phone(par, o) {                                         // o: {x, y, w, src, demo, bg}
  const pad = Math.round(o.w * .034), sw = o.w - 2 * pad, sh = Math.round(sw * 844 / 390), h = sh + 2 * pad, R = o.w * .15;
  const el = $('div', 'phone sz', par, { left: px(o.x), top: px(o.y), width: px(o.w), height: px(h), borderRadius: px(R) });
  const scr = $('div', 'scr', el, { left: px(pad), top: px(pad), width: px(sw), height: px(sh), borderRadius: px(R - pad), background: o.bg || '#fff' });
  $('div', 'isl', el, { top: px(pad + sw * .028), width: px(sw * .3), height: px(sw * .082) });
  let img = null, ih = 0;
  if (o.src) { img = $('img', 'shot', scr); img.src = o.src; const d = IMG[o.src] || { w: 390, h: 844 }; ih = sw * d.h / d.w; }
  const content = $('div', 'abs', scr, { left: 0, top: 0, width: px(sw), height: px(sh) });
  $('div', 'sheen', scr);
  const ovl = $('div', 'ovl', scr);
  if (o.demo) $('div', 'demo', el, { left: px(pad + 18), top: px(pad + sw * .15) }, 'DEMO');
  return { kind: 'phone', cssW: o.cssW || 390, el, scr, img, content, ovl, x: o.x, y: o.y, w: o.w, h, pad, sx: o.x + pad, sy: o.y + pad, sw, sh, ih, maxScroll: Math.max(0, ih - sh) };
}
const phoneW = availH => availH / 2.085;                          // phone width that fits a given height
function browser(par, o) {                                       // o: {x, y, w, src, url, demo}
  const bar = 96, sw = o.w, sh = Math.round(o.w * (o.aspect || 800 / 1280)), h = sh + bar;   // aspect: screen h / w (default 1280×800)
  const el = $('div', 'browser sz', par, { left: px(o.x), top: px(o.y), width: px(o.w), height: px(h) });
  const b = $('div', 'bar', el); for (let i = 0; i < 3; i++) $('div', 'dot', b);
  const u = $('div', 'url rd', b); u.innerHTML = `<svg width="26" height="30" viewBox="0 0 26 30"><rect x="2" y="13" width="22" height="16" rx="4" fill="#8f8f8f"/><path d="M7 13 V9 a6 6 0 0 1 12 0 V13" fill="none" stroke="#8f8f8f" stroke-width="3.5"/></svg>`;
  const ut = $('span', null, u, null, o.url || '');
  const scr = $('div', 'scr', el, { height: px(sh) });
  let img = null, ih = 0;
  if (o.src) { img = $('img', 'shot', scr); img.src = o.src; const d = IMG[o.src] || { w: 1280, h: 800 }; ih = sw * d.h / d.w; }
  const content = $('div', 'abs', scr, { left: 0, top: 0, width: px(sw), height: px(sh) });
  $('div', 'sheen', scr);
  const ovl = $('div', 'ovl', scr);
  if (o.demo) $('div', 'demo', el, { right: px(18), top: px(bar + 18) }, 'DEMO');
  return { kind: 'browser', cssW: o.cssW || 1280, el, scr, img, content, ovl, ut, x: o.x, y: o.y, w: o.w, h, sx: o.x, sy: o.y + bar, sw, sh, ih, maxScroll: Math.max(0, ih - sh) };
}
const isDemo = src => typeof src === 'string' && /\/demo\//.test(src);
// scroll: 'auto' | number (end fraction 0..1) | [[t, frac], ...] (t in scene seconds; frac of the max scroll)
function scrollFn(dev, spec, dur, t0 = .55) {
  if (!dev.img || dev.maxScroll <= 0 || spec === false || spec === 0) return () => 0;
  let keys;
  if (Array.isArray(spec)) keys = spec.map(([t, f]) => [t, cl(f)]);
  else {
    const t1 = Math.max(t0 + .4, dur - .45);
    const end = typeof spec === 'number' ? cl(spec) : Math.min(1, (420 * (t1 - t0)) / dev.maxScroll);
    keys = [[t0, 0], [t1, end]];
  }
  if (keys[0][0] > 0) keys.unshift([0, keys[0][1]]);
  return lt => {
    if (lt <= keys[0][0]) return keys[0][1] * dev.maxScroll;
    for (let i = 1; i < keys.length; i++) if (lt <= keys[i][0]) { const [a, fa] = keys[i - 1], [b, fb] = keys[i]; return lerp(fa, fb, E.io3(pr(lt, a, b - a))) * dev.maxScroll; }
    return keys[keys.length - 1][1] * dev.maxScroll;
  };
}
// page coordinates: box:[x,y,w,h] / at:[x,y] in CSS px of the screenshot (390 wide phone, 1280 wide desktop),
// converted to screen fractions using the scroll position at the item's start time
const norm = (dev, o, sc) => {
  if (!o.box && !o.at) return o;
  const cw = dev.cssW || dev.sw, k = dev.sw / cw, off = sc ? sc(o.t) : 0;
  if (o.box) { const [x, y, w, h] = o.box; return { ...o, x: x / cw, y: (y * k - off) / dev.sh, w: w / cw, h: h * k / dev.sh }; }
  return { ...o, x: o.at[0] / cw, y: (o.at[1] * k - off) / dev.sh };
};
// taps on a device screen: [{t, x, y}] (x, y = fractions of the visible screen) or [{t, at:[x,y]}] (page px)
function taps(dev, list = [], ctx, sc) {
  const items = list.map(t0 => norm(dev, t0, sc)).map(tp => {
    const R = 64, cx = tp.x * dev.sw, cy = tp.y * dev.sh;
    const ring = $('div', 'ring', dev.ovl, { left: px(cx - R), top: px(cy - R), width: px(2 * R), height: px(2 * R), opacity: 0 });
    const fg = $('div', 'finger', dev.ovl, { left: px(cx - 44), top: px(cy - 44), width: '88px', height: '88px', opacity: 0 });
    ctx.cues.push({ t: tp.t, s: 'tap' });
    return { tp, ring, fg };
  });
  return lt => {
    let press = 0;
    items.forEach(({ tp, ring, fg }) => {
      const tau = lt - tp.t;
      const fo = tau < -.2 || tau > .45 ? 0 : tau < 0 ? pr(tau, -.2, .12) : 1 - pr(tau, .25, .2);
      fg.style.opacity = fo.toFixed(3);
      fg.style.transform = `scale(${(tau < 0 ? lerp(1.5, 1, E.o3(pr(tau, -.2, .2))) : 1 - .2 * Math.sin(Math.PI * cl(tau / .18))).toFixed(3)})`;
      const ro = tau < 0 || tau > .7 ? 0 : 1 - pr(tau, .12, .55);
      ring.style.opacity = ro.toFixed(3);
      ring.style.transform = `scale(${lerp(.3, 1.9, E.o3(pr(tau, 0, .65))).toFixed(3)})`;
      press += kick(tau, 12);
    });
    return 1 - .014 * press;
  };
}
// highlight boxes on a device screen: [{t, x, y, w, h, label?, d?}] + a callout placed in canvas space, kept in the safe zone
function highlights(dev, list = [], ctx, cam, sc) {
  const items = list.map(h0 => norm(dev, h0, sc)).map(h => {
    const bx = h.x * dev.sw, by = h.y * dev.sh, bw = h.w * dev.sw, bh = h.h * dev.sh;
    const box = $('div', 'hlbox', dev.ovl, { left: px(bx), top: px(by), width: px(bw), height: px(bh) });
    const spot = $('div', 'spot', box);
    const s = svg(box, bw, bh, `<rect x="0" y="0" width="${bw}" height="${bh}" rx="18" fill="none" stroke="${C.accent}" stroke-width="7" pathLength="1" stroke-dasharray="1" stroke-dashoffset="1"/>`, { left: 0, top: 0 });
    const rect = s.querySelector('rect');
    let co = null;
    if (h.label) {
      co = $('div', 'callout rd sz', cam, null, tx(h.label).m); if (h.size) { co.style.fontSize = px(Math.max(44, h.size)); co.style.padding = '.36em .58em'; co.style.borderRadius = '.5em'; }   // size: callout font px (44 default)
      const cw = co.offsetWidth, ch = co.offsetHeight;
      let cx = dev.sx + bx + bw / 2 - cw / 2; cx = cl(cx, S.x, S.x + S.w - cw);
      let cy = dev.sy + by + bh + 22; if (cy + ch > Math.min(S.y + S.h, dev.sy + dev.sh + 60)) cy = dev.sy + by - ch - 22;
      cy = cl(cy, S.y, S.y + S.h - ch);
      place(co, cx, cy); co.style.transformOrigin = '50% 0';
      // device `zoom` (see zoomFn): the box scales with the screen → re-place the callout under the zoomed box (clipped to the screen)
      co.follow = zm => {
        const x0 = cl(bx * zm.z + zm.ox, 0, dev.sw), x1 = cl((bx + bw) * zm.z + zm.ox, 0, dev.sw), y0 = cl(by * zm.z + zm.oy, 0, dev.sh), y1 = cl((by + bh) * zm.z + zm.oy, 0, dev.sh);
        let fx = cl(dev.sx + (x0 + x1) / 2 - cw / 2, S.x, S.x + S.w - cw);
        let fy = dev.sy + y1 + 22; if (fy + ch > Math.min(S.y + S.h, dev.sy + dev.sh + 60)) fy = dev.sy + y0 - ch - 22;
        place(co, fx, cl(fy, S.y, S.y + S.h - ch));
      };
    }
    ctx.cues.push({ t: h.t, s: 'pop', g: .7 });
    return { h, box, spot, rect, co };
  });
  return (lt, zm) => items.forEach(({ h, spot, rect, co }) => {
    if (zm && co) co.follow(zm);
    const tau = lt - h.t, on = pr(tau, 0, .3) * (h.d ? 1 - pr(lt, h.t + h.d, .25) : 1);
    rect.setAttribute('stroke-dashoffset', (1 - E.o3(pr(tau, 0, .45))).toFixed(3));
    rect.style.opacity = on.toFixed(3);
    spot.style.boxShadow = `0 0 0 3000px rgba(0,0,0,${(.5 * on).toFixed(3)})`;
    if (co) { popIn(co, tau - .12, .5, 2.2, .5); if (on < 1 && tau > .3) co.style.opacity = on.toFixed(3); }
  });
}
// device entrance: rises with a 3-D tilt that settles; light idle sway
function devMotion(dev, lt, t0 = 0, from = 1, press = 1, side = 0) {
  const p = spr(lt - t0, 1.05, .68);
  const dy = (1 - p) * 300 * from, rx = (1 - p) * 22, ry = side * (1 - p) * 26 + Math.sin(lt * .9) * 2.2, sc = lerp(.9, 1, p) * press;
  dev.el.style.transform = `perspective(2600px) translate3d(${(side * (1 - p) * 120).toFixed(1)}px,${dy.toFixed(1)}px,0) rotateX(${rx.toFixed(2)}deg) rotateY(${ry.toFixed(2)}deg) scale(${sc.toFixed(4)})`;
  dev.el.style.opacity = cl((lt - t0) / .12 + .001).toFixed(3);
}

// GENERIC story viewer drawn inside a phone screen (no platform branding: segment bars, a round avatar + title, frames
// that change on taps, a plain reply pill) — e.g. a blurry "menu" highlight the customer taps through and squints at.
// o = { title, sub?, avatar? (image, else initials), segments? (bars, ≥ frames), segDur? (s a bar takes to fill, 2.4),
//   frames: [{ src, crop?: [x, y, w, h] (css px of the image — e.g. only the photo part of a screenshot), at?: [x, y] (focus,
//   css px; default crop centre), zoom? (1.5 = 1.5× the screen width), rot? (deg), blur? (px), ghost? (px: shaky double
//   image), glare? (0–1 flash hot spot), dark? (0–1), sticker? (text sticker on the frame) }],
//   taps: [s, …] (frame i+1 starts at taps[i]: finger + ring on the right edge, `tap` cue),
//   squint?: { t, d? (to the end), zoom? (1.4 = extra zoom), at?: [x, y] (new focus), amt? (.31 = each eyelid covers 31 %) },
//   reply? ("Reply…" / "Responder…", false = none), cssWidth? (390), demo? (true = DEMO tag) }
// Returns lt → press factor for devMotion.
function storyViewer(dev, o, ctx) {
  const sw = dev.sw, sh = dev.sh, cw = o.cssWidth || 390, k = sw / cw, u = sw / 390;
  const root = $('div', 'abs ui', dev.content, { left: 0, top: 0, width: px(sw), height: px(sh), background: '#000', overflow: 'hidden' });
  const frames = (o.frames || []).map(f => {
    const d = IMG[f.src] || { w: cw, h: cw * 2 }, ih = cw * d.h / d.w, cr = f.crop || [0, 0, cw, ih];
    const fr = $('div', 'abs', root, { left: 0, top: 0, width: px(sw), height: px(sh), overflow: 'hidden', background: '#0b0b0b', visibility: 'hidden' });
    const mk = () => { const e = $('div', 'abs', fr, { left: 0, top: 0, width: px(cr[2] * k), height: px(cr[3] * k), overflow: 'hidden', transformOrigin: '0 0' }); const im = $('img', null, e, { position: 'absolute', left: px(-cr[0] * k), top: px(-cr[1] * k), width: px(cw * k), maxWidth: 'none' }); im.src = f.src; if (f.blur) e.style.filter = `blur(${(f.blur * u).toFixed(2)}px)`; return e; };
    const main = mk(), ghost = f.ghost ? mk() : null; if (ghost) ghost.style.opacity = .45;
    if (f.glare) $('div', 'abs', fr, { inset: 0, background: `radial-gradient(${Math.round(150 * u)}px ${Math.round(120 * u)}px at 64% 34%, rgba(255,255,255,${f.glare}), transparent 72%)` });
    $('div', 'abs', fr, { inset: 0, background: `radial-gradient(120% 90% at 50% 50%, transparent 52%, rgba(0,0,0,.55)), rgba(0,0,0,${f.dark || 0})` });
    if (f.sticker) $('div', 'abs', fr, { left: '50%', top: px(sh * .2), transform: 'translateX(-50%) rotate(-4deg)', background: '#fff', color: '#111', font: `800 ${Math.round(26 * u)}px/1.1 I`, padding: `${Math.round(9 * u)}px ${Math.round(16 * u)}px`, borderRadius: px(10 * u), whiteSpace: 'nowrap', boxShadow: '0 6px 18px rgba(0,0,0,.4)' }, tx(f.sticker).m);
    return { f, fr, main, ghost, cr, fx: f.at ? f.at[0] : cr[0] + cr[2] / 2, fy: f.at ? f.at[1] : cr[1] + cr[3] / 2, z: f.zoom || 1.5, rot: f.rot || 0 };
  });
  const tapT = (o.taps || []).slice(0, Math.max(0, frames.length - 1)), st = [-1e9, ...tapT];
  const sq = o.squint || null, last = frames.length - 1;
  $('div', 'abs', root, { left: 0, right: 0, top: 0, height: px(150 * u), background: 'linear-gradient(rgba(0,0,0,.6), transparent)' });
  const nSeg = Math.max(o.segments || 0, frames.length), segDur = o.segDur || 2.4;
  const bars = $('div', 'abs', root, { left: px(9 * u), right: px(9 * u), top: px(52 * u), height: px(3.4 * u), display: 'flex', gap: px(4 * u) });
  const fills = Array.from({ length: nSeg }, () => { const s = $('div', null, bars, { flex: 1, height: '100%', borderRadius: px(2 * u), background: 'rgba(255,255,255,.34)', overflow: 'hidden' }); return $('div', null, s, { width: '100%', height: '100%', background: '#fff', transformOrigin: '0 50%', transform: 'scaleX(0)' }); });
  const head = $('div', 'abs', root, { left: px(12 * u), right: px(12 * u), top: px(66 * u), height: px(40 * u), display: 'flex', alignItems: 'center', gap: px(10 * u) });
  const title = tx(o.title).m || 'Story';
  const av = $('div', 'av', head, { width: px(38 * u), height: px(38 * u), fontSize: px(15 * u), boxShadow: `0 0 0 ${(2 * u).toFixed(1)}px #000, 0 0 0 ${(3.6 * u).toFixed(1)}px rgba(255,255,255,.85)` });
  if (o.avatar && IMG[o.avatar]) { const im = $('img', null, av); im.src = o.avatar; } else av.textContent = (title.match(/(?<![\p{L}\p{N}])[\p{L}\p{N}]/gu) || ['?']).slice(0, 2).join('').toUpperCase();
  const tw = $('div', null, head, { flex: 1, minWidth: 0 });
  $('div', null, tw, { font: `700 ${(16 * u).toFixed(1)}px/1.15 I`, color: '#fff', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }, title);
  if (o.sub) $('div', null, tw, { font: `500 ${(12.5 * u).toFixed(1)}px/1.2 I`, color: 'rgba(255,255,255,.75)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }, tx(o.sub).m);
  $('div', null, head, { font: `500 ${(26 * u).toFixed(1)}px/1 I`, color: '#fff', flex: 'none' }, '✕');
  if (o.demo !== false) $('div', 'demo', root, { left: px(12 * u), top: px(118 * u) }, 'DEMO');
  if (o.reply !== false) $('div', 'abs', root, { left: px(12 * u), right: px(12 * u), bottom: px(26 * u), height: px(44 * u), borderRadius: px(22 * u), border: `${(1.5 * u).toFixed(1)}px solid rgba(255,255,255,.62)`, display: 'flex', alignItems: 'center', padding: `0 ${Math.round(18 * u)}px`, font: `500 ${(15 * u).toFixed(1)}px/1 I`, color: 'rgba(255,255,255,.85)' }, o.reply ? tx(o.reply).m : LB('Reply…', 'Responder…'));
  const lidCss = top => ({ left: px(-sw * .1), width: px(sw * 1.2), height: px(sh * .5), background: '#000', boxShadow: `0 0 ${Math.round(40 * u)}px ${Math.round(18 * u)}px rgba(0,0,0,.88)`, [top ? 'top' : 'bottom']: 0, borderRadius: top ? '0 0 50% 50% / 0 0 36% 36%' : '50% 50% 0 0 / 36% 36% 0 0', transformOrigin: top ? '50% 0' : '50% 100%', transform: 'scaleY(0)', zIndex: 4 });
  const lids = sq ? [$('div', 'abs', root, lidCss(true)), $('div', 'abs', root, lidCss(false))] : [];
  const tp = taps(dev, tapT.map(t => ({ t, x: .84, y: .5 })), ctx);
  if (sq) ctx.cues.push({ t: sq.t, s: 'whoosh', g: .3 });
  const amt = sq ? (sq.amt ?? .31) : 0;
  return lt => {
    let cur = 0; st.forEach((t, i) => { if (lt >= t) cur = i; });
    fills.forEach((f, j) => { const v = j < cur ? 1 : j > cur ? 0 : cl((lt - Math.max(0, st[cur])) / segDur); f.style.transform = `scaleX(${v.toFixed(4)})`; });
    frames.forEach((F, i) => {
      F.fr.style.visibility = i === cur ? 'visible' : 'hidden'; if (i !== cur) return;
      const age = lt - Math.max(0, st[i]);
      let z = F.z * (1 + .035 * Math.min(3, age) + .05 * (1 - E.o3(cl(age / .22)))), fx = F.fx, fy = F.fy;   // tiny push-in on each new frame, then a slow Ken Burns
      if (sq && i === last) { const p = E.io3(pr(lt, sq.t, .7)); z *= lerp(1, sq.zoom || 1.4, p); if (sq.at) { fx = lerp(fx, sq.at[0], p); fy = lerp(fy, sq.at[1], p); } }
      const tr = (dx, dy) => `translate(${(sw / 2 + dx).toFixed(1)}px,${(sh / 2 + dy).toFixed(1)}px) rotate(${F.rot}deg) scale(${z.toFixed(4)}) translate(${(-(fx - F.cr[0]) * k).toFixed(1)}px,${(-(fy - F.cr[1]) * k).toFixed(1)}px)`;
      F.main.style.transform = tr(0, 0);
      if (F.ghost) { const g = F.f.ghost * u, w = Math.sin(lt * 7.3); F.ghost.style.transform = tr(g * (.7 + .3 * w), g * .35); }
    });
    if (sq) { const close = E.o3(pr(lt, sq.t, .38)) * (sq.d ? 1 - E.io3(pr(lt, sq.t + sq.d, .4)) : 1), tremble = 1 + .03 * Math.sin(lt * 11) * close; lids.forEach(l => l.style.transform = `scaleY(${(close * amt * 2 * tremble).toFixed(4)})`); }
    return tp(lt);
  };
}

// ---------- scenes ----------
const SC = {};
// a full-frame layer whose children are laid out from the top of the box; centre() then slides the whole group so it
// sits a little above the middle of the box when there is room left
function group(cam) { const g = $('div', 'abs', cam, { left: 0, top: 0, width: W + 'px', height: H + 'px' }); g.centre = (bx, k = .42) => { let bot = bx.y; g.querySelectorAll(':scope > *').forEach(e => { bot = Math.max(bot, e.offsetTop + e.offsetHeight); }); const sh = Math.max(0, (bx.y + bx.h - bot) * k); g.style.top = px(sh); return sh; }; return g; }
const boxOf = ctx => ctx.box;
// top heading used by many scenes; returns {g, h}
function headTop(cam, v, bx, o = {}) {
  if (!tx(v).m) return { g: null, h: 0 };
  const g = dual(cam, v, { font: 'M', w: bx.w, h: o.h || 250, max: o.max || 104, min: o.min || 56, align: o.align || 'left', cls: o.cls });
  g.at(bx.x, bx.y);
  return { g, h: g.h };
}

// printed paper sign for the hook's `sign` prop: {text, small?, sticker?, stickerAt? (beats, 3), tilt? (deg, -3), w? (800),
// size? (max px, 150), demo? (true = DEMO tag), pos? (top | bottom)} — cream paper, printed double border, tape on the top
// corners, a DEMO tag, an optional accent sticker that slaps on. Already ~65 % landed on frame 0, so the first frame shows it.
function paperSign(par, o, bx) {
  const w = Math.min(bx.w - 50, o.w || 800), P = 70, iw = w - 2 * P;
  const el = $('div', 'abs sz', par, { width: px(w), background: 'linear-gradient(172deg,#fbf8f1,#ece5d6)', borderRadius: '12px', boxShadow: '0 44px 90px rgba(0,0,0,.62), 0 3px 0 #cfc7b6', transformOrigin: '50% 0' });
  $('div', 'abs', el, { inset: '22px', border: '6px solid #141414', borderRadius: '6px', boxShadow: 'inset 0 0 0 5px #f5f1e6, inset 0 0 0 8px #141414' });
  const big = block(el, tx(o.text).m, { font: 'M', w: iw, h: o.h || 330, max: o.size || 150, min: 60, align: 'center', color: '#141414', cls: 'ui' });   // .ui: a prop, not counted by the read lint
  const small = o.small ? block(el, tx(o.small).m, { font: 'I', weight: 700, w: iw, h: 130, max: 50, min: 44, align: 'center', color: '#2e2e2e', upper: false, cls: 'ui' }) : null;
  const top0 = P + 8; big.at(P, top0); if (small) small.at(P, top0 + big.h + 22);
  const h = top0 + big.h + (small ? 22 + small.h : 0) + P - 4; el.style.height = px(h);
  [[-34, -22, -33], [w - 146, -22, 31]].forEach(([x, y, r]) => $('div', 'abs', el, { left: px(x), top: px(y), width: '180px', height: '56px', background: 'rgba(226,214,186,.82)', transform: `rotate(${r}deg)`, boxShadow: '0 2px 6px rgba(0,0,0,.2)' }));
  if (o.demo !== false) $('div', 'demo', el, { left: '50px', bottom: '-22px', background: '#141414', color: '#fff', boxShadow: '0 6px 18px rgba(0,0,0,.45)' }, 'DEMO');
  const st = o.sticker ? $('div', 'abs rd', el, { right: '-8px', bottom: '-52px', font: '800 62px/1 M', textTransform: 'uppercase', letterSpacing: '-.01em', color: '#050505', background: C.accent, borderRadius: '999px', padding: '24px 36px 22px', whiteSpace: 'nowrap', boxShadow: '0 16px 40px rgba(0,0,0,.5)', opacity: 0 }, tx(o.sticker).m) : null;
  const tilt = o.tilt ?? -3;
  const g = { el, h, w, st, tSt: (o.stickerAt ?? 3) * B };
  g.at = y => { place(el, bx.x + (bx.w - w) / 2, y); return g; };
  g.up = lt => {
    const p = spr(lt + .18, 1.5, .62);
    el.style.transform = `translateY(${((1 - p) * -140).toFixed(1)}px) rotate(${(tilt + (1 - p) * -7 + Math.sin(lt * 1.3) * .35).toFixed(3)}deg) scale(${lerp(1.14, 1, p).toFixed(4)})`;
    if (st) { const tau = lt - g.tSt, q = spr(tau, 2.6, .5); st.style.opacity = cl(tau / .05).toFixed(3); st.style.transform = tau <= 0 ? 'scale(2.2)' : `rotate(${(8 + (1 - q) * 14).toFixed(2)}deg) scale(${lerp(2.2, 1, q).toFixed(4)})`; }
  };
  return g;
}
SC.hook = (cam, sp, ctx) => {
  const bx = ctx.box, T = tx(sp.text), sub = tx(sp.sub); const secTxt = sub.m || T.s;
  const kick0 = sp.kicker ? chip(cam, tx(sp.kicker).m) : null;
  const kh = kick0 ? kick0.offsetHeight + 40 : 0;
  const subB = secTxt ? block(cam, secTxt, { font: 'I', weight: 600, w: bx.w, h: 230, max: 66, min: 44, color: '#b5b5b5', upper: false, align: sp.align || 'left' }) : null;
  const sh = subB ? subB.h + 46 : 0;
  const sg = sp.sign ? paperSign(cam, sp.sign, bx) : null, gh = sg ? sg.h + 130 : 0, sBot = !!sg && sp.sign.pos === 'bottom';   // optional printed sign (see paperSign)
  const hb = block(cam, T.m, { font: 'M', w: bx.w, h: Math.min(bx.h * .7, bx.h - kh - sh - gh), max: sp.size || 250, min: 88, align: sp.align || 'left', cls: 'noclip' });
  const total = kh + gh + hb.h + sh, top = bx.y + (bx.h - total) * .42;
  if (kick0) place(kick0, sp.align === 'center' ? bx.x + (bx.w - kick0.offsetWidth) / 2 : bx.x, top);
  const hy = top + kh + (sg && !sBot ? gh : 0);
  hb.at(bx.x, hy); if (subB) subB.at(bx.x, hy + hb.h + 46);
  if (sg) sg.at(sBot ? hy + hb.h + sh + 80 : top + kh + 46);
  const n = hb.words.length, every = sp.every ? sp.every * B : (n <= 3 ? B : B / 2);
  hb.words.forEach((w, i) => { w.style.transformOrigin = '50% 75%'; const t = i * every; ctx.cues.push({ t, s: 'hit', g: i === n - 1 ? 1 : .7 }); ctx.punch.push(t); });
  const tSub = (n - 1) * every + B;
  if (subB) ctx.cues.push({ t: tSub, s: 'pop', g: .5 });
  if (sg && sg.st) { ctx.cues.push({ t: sg.tSt, s: 'hit', g: .75 }); ctx.punch.push(sg.tSt); }
  ctx.ready = Math.max(subB ? tSub + .4 : (n - 1) * every + .2, sg && sg.st ? sg.tSt + .3 : 0); ctx.srcAt = subB ? tSub + .45 : (n - 1) * every + .4;   // scene-level source line (if any) after the last element it backs
  const signUp = sg ? sg.up : () => {};
  return lt => {
    signUp(lt);
    hb.words.forEach((w, i) => {
      const tau = lt - i * every + (i ? .045 : .16), p = spr(tau, 2.4, .5);
      w.style.opacity = cl(tau / .035).toFixed(3);
      w.style.transform = tau <= 0 ? 'scale(.2)' : `translateY(${((1 - p) * hb.fs * .12).toFixed(1)}px) scale(${(1 + .8 * (1 - p)).toFixed(4)}) rotate(${((1 - p) * -6).toFixed(2)}deg)`;
    });
    if (kick0) fadeUp(kick0, lt, 0, .4, 24);
    if (subB) revLines(subB.lines, lt, tSub, .07, .5);
  };
};

SC.text = (cam, sp, ctx) => {
  const bx = ctx.box, hd = tx(sp.head), sb = tx(sp.sub);
  const k = sp.kicker ? chip(cam, tx(sp.kicker).m, sp.kickerStyle || '') : null; const kh = k ? k.offsetHeight + 36 : 0;
  const subTxt = sb.m;                                                 // head's Spanish goes right under it (dual)
  const hasSub = !!subTxt;
  const head = dual(cam, sp.head, { font: 'M', w: bx.w, h: (bx.h - kh) * (hasSub ? .58 : .8), max: sp.size || 176, min: 60, align: sp.align || 'left' });
  const subG = hasSub ? dual(cam, sp.sub, { font: 'I', weight: 500, color: '#c4c4c4', w: bx.w, h: (bx.h - kh) * .36, max: 64, min: 44, upper: false, align: sp.align || 'left' }) : null;
  const gap = hasSub ? 48 : 0, total = kh + head.h + gap + (subG ? subG.h : 0), top = bx.y + (bx.h - total) * .44;
  if (k) place(k, sp.align === 'center' ? bx.x + (bx.w - k.offsetWidth) / 2 : bx.x, top);
  head.at(bx.x, top + kh); if (subG) subG.at(bx.x, top + kh + head.h + gap);
  const tSub = .1 + head.lines.length * .08 + .3; ctx.ready = hasSub ? tSub + subG.lines.length * .06 + .45 : .1 + head.lines.length * .08 + .5;
  return lt => {
    if (k) { const p = E.o5(pr(lt, 0, .5)); k.style.opacity = p.toFixed(3); k.style.transform = `translateX(${((1 - p) * -60).toFixed(1)}px)`; }
    revLines(head.lines, lt, .08, .08, .62);
    if (subG) revLines(subG.lines, lt, tSub, .06, .55);
  };
};

SC.list = (cam0, sp, ctx) => {
  const cam = group(cam0);
  const bx = ctx.box, items = sp.items || [], n = items.length;
  const hd = headTop(cam, sp.head, bx, { h: bx.h * .26, max: sp.headSize || 112 });   // headSize: head max px (e.g. 88 keeps a short head on one line)
  // peeks: [{image, box: [x, y, w, h] (css px of the image), cssWidth? (the image's css width; default sp.cssWidth, else its
  // pixel width), max? (max zoom, 3), tilt? (deg)} | null, …] aligned with items — a cropped, zoomed "evidence" card of the
  // screenshot (e.g. the price table of a demo page) that pops in right under its row while that row is the active one (it
  // may cover the rows still to come; it drops away as the next row arrives; the last one stays). peekH = the room kept
  // under the last row for its card (default 30 % of the box); earlier cards use everything down to that line.
  const pks = Array.isArray(sp.peeks) && sp.peeks.some(Boolean) ? sp.peeks : null, pkH = pks ? (sp.peekH || Math.round(bx.h * .3)) : 0;
  const avail = bx.h - hd.h - (hd.h ? 84 : 0) - (pks ? pkH + 50 : 0), numW = sp.numbered === false ? 50 : 132, tw = bx.w - numW;
  let fs = sp.size || 76, rows; const w0 = WARN.length;
  const build = f => items.map((it, i) => dual(cam, it, { font: 'I', weight: 600, w: tw, h: f * 1.25 * (tx(it).s ? 3.6 : 2) + 4, max: f, min: Math.min(f, 44), upper: false, maxLines: tx(it).s ? undefined : 2 }, { max: Math.max(44, Math.round(f * .78)) }));
  const clear = rs => rs && rs.forEach(g => { g.m.el.remove(); g.s && g.s.el.remove(); });
  for (; ; fs -= 2) {
    clear(rows); WARN.length = w0; rows = build(fs);
    const tot = rows.reduce((a, g) => a + Math.max(g.h, 112), 0) + (n - 1) * 30;
    if (tot <= avail || fs <= 44) { if (tot > avail) warn('overflow', `list does not fit (${Math.round(tot)} > ${Math.round(avail)} px)`); break; }
  }
  const hs = rows.map(g => Math.max(g.h, 112)); const sum = hs.reduce((a, b) => a + b, 0);
  const gap = n > 1 ? cl((avail - sum) / (n - 1), 30, 70) : 0;
  let y = bx.y + hd.h + (hd.h ? 84 : 0);
  const nums = [], divs = [], rowBot = [];
  rows.forEach((g, i) => {
    rowBot.push(y + hs[i]);
    g.at(bx.x + numW, y + Math.max(0, (hs[i] - g.h) / 2));
    if (sp.numbered !== false) { const nb = block(cam, String(i + (sp.numFrom ?? 1)), { font: 'M', w: numW, h: 130, max: 112, min: 60, rd: true, cls: 'noclip' }); nb.at(bx.x, y + Math.max(0, (hs[i] - nb.h) / 2) - 4); nums.push(nb); }
    else { const d = $('div', 'abs', cam, { left: px(bx.x + 6), top: px(y + hs[i] / 2 - 10), width: '20px', height: '20px', borderRadius: '50%', background: '#fff' }); nums.push({ el: d }); }
    if (i < n - 1) divs.push($('div', 'abs', cam, { left: px(bx.x), top: px(y + hs[i] + gap / 2), width: px(bx.w), height: '2px', background: 'rgba(255,255,255,.13)', transformOrigin: '0 50%' }));
    y += hs[i] + gap;
  });
  const pkBot = (rowBot[n - 1] || y) + 50 + pkH;
  const cards = (pks || []).map((p, i) => {                           // peek cards (see above): right under their row, down to pkBot at most
    if (!p || i >= n || !(p.image || p.src)) return null;
    const src = p.image || p.src, d = IMG[src] || { w: 1000, h: 1000 }, cw = +(p.cssWidth || sp.cssWidth || d.w), k = d.w / cw;
    const top = rowBot[i] + 44, room = pkBot - top;
    const [x, yy, w, h] = p.box || [0, 0, cw, d.h / k], P = 16, s = Math.min((bx.w - 2 * P) / w, (room - 2 * P) / h, p.max || 3);
    const card = $('div', 'abs sz', cam, { width: px(w * s + 2 * P), height: px(h * s + 2 * P), background: '#fff', borderRadius: '22px', boxShadow: '0 34px 80px rgba(0,0,0,.62)', visibility: 'hidden' });
    const crop = $('div', 'abs', card, { left: px(P), top: px(P), width: px(w * s), height: px(h * s), overflow: 'hidden', borderRadius: '8px' });
    const im = $('img', null, crop, { position: 'absolute', left: px(-x * s), top: px(-yy * s), width: px(cw * s), maxWidth: 'none' }); im.src = src;
    if (p.demo ?? isDemo(src)) $('div', 'demo', card, { left: '-14px', top: '-20px' }, 'DEMO');
    place(card, bx.x + (bx.w - (w * s + 2 * P)) / 2, top);
    return { card, tilt: p.tilt ?? (i % 2 ? 1.6 : -1.8) };
  });
  cam.centre(bx);
  const t1 = hd.h ? B / 2 : .2;
  let every = sp.every ? sp.every * B : Math.max(B / 2, Math.floor(Math.min(2 * B, (sp.dur - 1.2 - t1) / Math.max(1, n - 1)) / (B / 2)) * (B / 2));
  const ti = i => t1 + i * every;
  items.forEach((_, i) => { ctx.cues.push({ t: ti(i), s: 'pop', p: 1 + i * .06 }); ctx.punch.push(ti(i)); });
  const allOn = ti(n - 1) + B; ctx.ready = ti(n - 1) + .6; ctx.srcAt = ti(n - 1) + .4;   // a scene-level source line comes once every row is in
  return lt => {
    if (hd.g) revLines(hd.g.lines, lt, .05);
    rows.forEach((g, i) => {
      const tau = lt - ti(i), p = E.o5(pr(tau, 0, .55));
      const act = lt >= ti(i) && (i === n - 1 || lt < ti(i + 1)) && lt < allOn;
      const done = lt >= ti(i) && !act;
      const op = tau < 0 ? 0 : (done && lt < allOn ? .58 : 1);
      [g.m.el, g.s && g.s.el].forEach(e => { if (!e) return; e.style.opacity = (op * cl(tau / .1)).toFixed(3); e.style.transform = `translateX(${((1 - p) * 70).toFixed(1)}px)`; });
      revLines(g.lines, lt, ti(i), .05, .5);
      const nb = nums[i]; const q = spr(tau, 2.2, .5);
      nb.el.style.opacity = (cl(tau / .05) * (done && lt < allOn ? .58 : 1)).toFixed(3);
      nb.el.style.transform = tau <= 0 ? 'scale(.3)' : `scale(${lerp(.3, 1, q).toFixed(4)})`;
      nb.el.style.color = act ? C.accent : '#fff';
      if (divs[i]) divs[i].style.transform = `scaleX(${E.o5(pr(lt, ti(i) + .15, .6)).toFixed(4)})`;
    });
    cards.forEach((c, i) => {                                         // a peek springs in with its row, drops away when the next row comes
      if (!c) return;
      const tau = lt - ti(i) - .08, u = i < n - 1 ? lt - ti(i + 1) : -1;
      if (tau < 0 || u > .14) { c.card.style.visibility = 'hidden'; return; }
      const p = spr(tau, 1.9, .6), q = u >= 0 ? E.o3(pr(u, 0, .14)) : 0;
      c.card.style.visibility = 'visible'; c.card.style.opacity = (cl(tau / .08) * (1 - q)).toFixed(3);
      c.card.style.transform = `translateY(${((1 - p) * 70 - q * 30).toFixed(1)}px) rotate(${(c.tilt + (1 - p) * 5 - q * 3).toFixed(2)}deg) scale(${(lerp(.84, 1, p) * (1 - .12 * q)).toFixed(4)})`;
    });
  };
};

SC.checklist = (cam0, sp, ctx) => {
  const cam = group(cam0);
  const bx = ctx.box, items = sp.items || [], n = items.length;
  const hd = headTop(cam, sp.head, bx, { h: bx.h * .26, max: 112 });
  const avail = bx.h - hd.h - (hd.h ? 84 : 0), cw = 92, tw = bx.w - cw - 36;
  let fs = sp.size || 70, rows; const w0 = WARN.length;
  for (; ; fs -= 2) {
    if (rows) rows.forEach(g => { g.m.el.remove(); g.s && g.s.el.remove(); }); WARN.length = w0;
    rows = items.map(it => dual(cam, it, { font: 'I', weight: 600, w: tw, h: fs * 1.25 * (tx(it).s ? 3.6 : 2) + 4, max: fs, min: Math.min(fs, 44), upper: false, color: '#fff' }, { max: Math.max(44, Math.round(fs * .78)) }));
    const tot = rows.reduce((a, g) => a + Math.max(g.h, cw), 0) + (n - 1) * 34;
    if (tot <= avail || fs <= 44) { if (tot > avail) warn('overflow', `checklist does not fit (${Math.round(tot)} > ${Math.round(avail)} px)`); break; }
  }
  const hs = rows.map(g => Math.max(g.h, cw)), sum = hs.reduce((a, b) => a + b, 0);
  const gap = n > 1 ? cl((avail - sum) / (n - 1), 34, 64) : 0;
  let y = bx.y + hd.h + (hd.h ? 84 : 0);
  const circ = rows.map((g, i) => {
    g.at(bx.x + cw + 34, y + (hs[i] - g.h) / 2);
    const c = $('div', 'abs sz', cam, { left: px(bx.x), top: px(y + (hs[i] - cw) / 2), width: px(cw), height: px(cw), borderRadius: '50%', border: '5px solid #5a5a5a' });
    const f = $('div', 'abs', c, { inset: '-5px', borderRadius: '50%', background: '#fff' });
    const s = svg(c, cw - 10, cw - 10, `<path d="M${(cw - 10) * .26} ${(cw - 10) * .52} L${(cw - 10) * .44} ${(cw - 10) * .7} L${(cw - 10) * .76} ${(cw - 10) * .32}" fill="none" stroke="#050505" stroke-width="9" stroke-linecap="round" stroke-linejoin="round" pathLength="1" stroke-dasharray="1" stroke-dashoffset="1"/>`, { left: 0, top: 0 });
    y += hs[i] + gap;
    return { c, f, path: s.querySelector('path') };
  });
  cam.centre(bx);
  const t0 = hd.h ? B / 2 : .15, tTick0 = t0 + B / 2;
  const every = sp.every ? sp.every * B : Math.max(B / 2, Math.floor(Math.min(2 * B, (sp.dur - 1.05 - tTick0) / Math.max(1, n - 1)) / (B / 2)) * (B / 2));
  const tk = i => tTick0 + i * every;
  const SCALE = [1, 1.122, 1.26, 1.335, 1.498, 1.682, 1.888, 2];
  items.forEach((_, i) => { ctx.cues.push({ t: tk(i), s: 'ding', g: .55, p: SCALE[i % SCALE.length] }); ctx.punch.push(tk(i)); }); ctx.ready = tk(n - 1) + .45; ctx.srcAt = tk(n - 1) + .35;
  return lt => {
    if (hd.g) revLines(hd.g.lines, lt, .05);
    rows.forEach((g, i) => {
      const a = lt - (t0 + i * .07), tau = lt - tk(i), on = tau >= 0;
      const op = cl(a / .25) * (on ? 1 : .38);
      [g.m.el, g.s && g.s.el].forEach(e => { if (e) { e.style.opacity = op.toFixed(3); e.style.transform = `translateX(${((1 - E.o5(cl(a / .5))) * 50).toFixed(1)}px)`; } });
      const { c, f, path } = circ[i];
      c.style.opacity = (cl(a / .25) * (on ? 1 : .6)).toFixed(3);
      c.style.transform = `scale(${(on ? lerp(.6, 1, spr(tau, 2.4, .45)) : 1).toFixed(4)})`;
      f.style.transform = `scale(${(on ? E.o3(pr(tau, 0, .18)) : 0).toFixed(4)})`;
      path.setAttribute('stroke-dashoffset', (1 - E.o3(pr(tau, .08, .3))).toFixed(3));
    });
  };
};

SC.mythfact = (cam, sp, ctx) => {
  const bx = ctx.box; const hd = headTop(cam, sp.head, bx, { h: 230, max: 96 });
  const top = bx.y + hd.h + (hd.h ? 50 : 0), avail = bx.h - (top - bx.y);
  const wrap = $('div', 'abs sz', cam, { left: px(bx.x), width: px(bx.w), transformStyle: 'preserve-3d' });
  const front = $('div', 'abs', wrap, { inset: 0, borderRadius: '44px', background: '#141414', boxShadow: '0 40px 90px rgba(0,0,0,.6), inset 0 0 0 3px #2c2c2c' });
  const back = $('div', 'abs', wrap, { inset: 0, borderRadius: '44px', background: '#fff', boxShadow: '0 40px 90px rgba(0,0,0,.6)' });
  const P = 64, iw = bx.w - 2 * P;
  const c1 = chip(front, '✗ ' + (sp.mythLabel ? tx(sp.mythLabel).m : LB('MYTH', 'MITO')), 'dim'); place(c1, P, P);
  const c2 = chip(back, '✓ ' + (sp.factLabel ? tx(sp.factLabel).m : LB('FACT', 'REALIDAD')), 'solid'); place(c2, P, P); c2.style.background = '#050505'; c2.style.color = '#fff'; c2.style.borderColor = '#050505';
  const ch = c1.offsetHeight + 44, th = Math.min(avail - 2 * P - ch, 640);
  const m = dual(front, sp.myth, { font: 'I', weight: 700, w: iw, h: th, max: 96, min: 44, upper: false, color: '#e8e8e8' });
  // optional fact2: a second, lighter paragraph on the FACT card that reveals later (sp.fact2At s, default ≈ 1.2 s after the flip)
  const f = dual(back, sp.fact, { font: 'I', weight: 700, w: iw, h: sp.fact2 ? th * .5 : th, max: 96, min: 44, upper: false, color: '#050505' }, { color: '#555' });
  const f2 = sp.fact2 ? dual(back, sp.fact2, { font: 'I', weight: 600, w: iw, h: th * .5 - 30, max: 66, min: 44, upper: false, color: '#3a3a3a' }, { color: '#666' }) : null;
  m.at(P, P + ch); f.at(P, P + ch); if (f2) f2.at(P, P + ch + f.h + 30);
  const cardH = Math.max(560, Math.max(m.h, f.h + (f2 ? 30 + f2.h : 0)) + 2 * P + ch);
  wrap.style.height = px(cardH); wrap.style.top = px(top + Math.max(0, (avail - cardH) * .4));
  back.style.transform = 'rotateY(180deg)';
  const strikes = m.m.lines.map(l => { const lw = m.m.lineW(l); return $('div', 'abs', front, { left: px(P - 8), top: px(P + ch + l.ln.offsetTop + m.m.fs * .62), width: px(lw + 16), height: '8px', borderRadius: '4px', background: '#fff', transformOrigin: '0 50%', transform: 'scaleX(0)' }); });
  const tStrike = qb(sp.strike != null ? +sp.strike : Math.max(.8, sp.dur * .3), B / 2), tFlip = tStrike + B * .75, tFact = tFlip + .1;   // sp.strike: when the myth gets struck (s)
  const tF2 = f2 ? qb(sp.fact2At != null ? +sp.fact2At : tFact + 1.2, B / 2) : 0;
  ctx.cues.push({ t: tStrike, s: 'nope', g: .8 }, { t: tFlip - .12, s: 'whoosh', g: .7 }, { t: tFact + .1, s: 'ding', g: .8 });
  if (f2) ctx.cues.push({ t: tF2, s: 'pop', g: .55 });
  ctx.punch.push(tStrike, tFact + .1);
  ctx.ready = f2 ? tF2 + .5 : tFact + .35; ctx.srcAt = f2 ? tF2 + .45 : tFact + .3;   // a scene-level source belongs to the FACT: never before the flip (or before fact2)
  return lt => {
    const pIn = spr(lt, 1.2, .7);
    if (hd.g) revLines(hd.g.lines, lt, .05);
    revLines(m.lines, lt, .18, .07, .55);
    strikes.forEach((s, i) => s.style.transform = `scaleX(${E.o3(pr(lt, tStrike + i * .06, .28)).toFixed(4)})`);
    const fp = spr(lt - tFlip, 1.25, .62), th = 180 * fp;
    const showBack = Math.cos(th * Math.PI / 180) < 0;
    front.style.visibility = showBack ? 'hidden' : 'visible'; back.style.visibility = showBack ? 'visible' : 'hidden';
    const dip = 1 - .07 * Math.sin(Math.PI * cl((lt - tFlip) / .5));
    wrap.style.transform = `perspective(2600px) translateY(${((1 - pIn) * 220).toFixed(1)}px) rotateY(${th.toFixed(2)}deg) scale(${(lerp(.9, 1, pIn) * dip).toFixed(4)})`;
    wrap.style.opacity = cl(lt / .15 + .001).toFixed(3);
    revLines(f.lines, lt, tFact, .05, .45);
    if (f2) revLines(f2.lines, lt, tF2, .06, .5);
  };
};

// split screen: two phones (images), two cards (lines), or one device with a before/after slider
SC.compare = (cam, sp, ctx) => {
  const bx = ctx.box, Lt = sp.left || {}, Rt = sp.right || {};
  const mode = sp.mode || ((Lt.image || Lt.story) && (Rt.image || Rt.story) ? 'phones' : 'cards');
  const hd = headTop(cam, sp.head, bx, { h: 230, max: 96 });
  // phones only — soloHead: a first headline shown while the left phone plays alone (solo), swapped for `head` when the
  // right phone arrives
  const hs = mode === 'phones' && sp.solo && sp.soloHead ? headTop(cam, sp.soloHead, bx, { h: 230, max: 96 }) : { g: null, h: 0 };
  const hH = Math.max(hd.h, hs.h);
  const top = bx.y + hH + (hH ? 44 : 0), avail = bx.h - (top - bx.y);
  const lbl = (o, def, good) => (good ? '✓ ' : '✗ ') + (o.label ? tx(o.label).m : def);
  const tR = sp.rightAt != null ? +sp.rightAt : qb(Math.max(1.1, sp.dur * .4), B / 2);   // rightAt: when the right side arrives (s)
  const ups = [];
  if (mode === 'phones') {
    const ch = 96, gapX = 36, pw = Math.min((bx.w - gapX) / 2, phoneW(avail - ch - 24));
    const x0 = bx.x + (bx.w - (2 * pw + gapX)) / 2, py = top + ch + 24;
    // a side can be a story viewer instead of a screenshot: left.story / right.story (see storyViewer)
    const devs = [Lt, Rt].map((o, i) => phone(cam, { x: x0 + i * (pw + gapX), y: py, w: pw, src: o.story ? null : o.image, bg: o.story ? '#000' : undefined, demo: o.story ? false : o.demo ?? isDemo(o.image) }));
    // stamp: false = the left side is the SOURCE, not the bad version: no ✗ stamp, no ✗ on its chip, it is not dimmed
    const calm = sp.stamp === false;
    const chips = [chip(cam, calm ? (Lt.label ? tx(Lt.label).m : LB('BEFORE', 'ANTES')) : lbl(Lt, LB('BEFORE', 'ANTES'), false), 'dim'), chip(cam, lbl(Rt, LB('AFTER', 'DESPUÉS'), true), 'solid')];
    chips.forEach((c, i) => { const d = devs[i]; let cx = d.x + (d.w - c.offsetWidth) / 2; cx = cl(cx, S.x, S.x + S.w - c.offsetWidth); place(c, cx, top); });
    const scr = devs.map((d, i) => scrollFn(d, [Lt, Rt][i].scroll ?? 'auto', sp.dur, i ? tR + .6 : .5));
    const zfs = devs.map((d, i) => zoomFn(d, [Lt, Rt][i].zoom, [Lt, Rt][i].zoomAt, scr[i]));   // optional left/right zoom (see zoomFn)
    const svs = devs.map((d, i) => [Lt, Rt][i].story ? storyViewer(d, [Lt, Rt][i].story, ctx) : null);
    // solo: true | {w (max px, 560), callouts: [{t, text, d?, y? (fraction of the phone height, .72), size?}]} — the LEFT
    // phone plays alone, big and centred, until the right one arrives (rightAt), then shrinks into its slot
    const so = sp.solo ? (typeof sp.solo === 'object' ? sp.solo : {}) : null;
    let soloT = null; const sCo = [];
    if (so) {
      const sw0 = Math.min(so.w || 560, bx.w, phoneW(avail)), s = sw0 / pw, d0 = devs[0], h1 = d0.h * s;
      const cx0 = d0.x + d0.w / 2, cy0 = d0.y + d0.h / 2, cx1 = bx.x + bx.w / 2, cy1 = top + Math.max(0, (avail - h1) * .5) + h1 / 2;
      soloT = q => `translate(${((1 - q) * (cx1 - cx0)).toFixed(1)}px,${((1 - q) * (cy1 - cy0)).toFixed(1)}px) scale(${lerp(s, 1, q).toFixed(4)}) `;
      (so.callouts || []).forEach(c => {
        const co = $('div', 'callout rd sz', cam, null, tx(c.text).m); if (c.size) { co.style.fontSize = px(Math.max(44, c.size)); co.style.padding = '.36em .58em'; co.style.borderRadius = '.5em'; }
        place(co, cl(cx1 - co.offsetWidth / 2, S.x, S.x + S.w - co.offsetWidth), cl(cy1 - h1 / 2 + h1 * (c.y ?? .72) - co.offsetHeight / 2, S.y, S.y + S.h - co.offsetHeight));
        co.style.transformOrigin = '50% 50%'; ctx.cues.push({ t: c.t, s: 'pop', g: .7 }); ctx.punch.push(c.t); sCo.push({ c, co });
      });
    }
    const side = [Lt, Rt].map((o, i) => ({ tp: o.taps ? taps(devs[i], o.taps, ctx, scr[i]) : () => 1, hl: o.highlights ? highlights(devs[i], o.highlights, ctx, cam, scr[i]) : null }));   // left/right taps + highlights (page coords use that side's scroll)
    const stamp = calm ? null : $('div', 'abs', cam, { left: px(devs[0].x + devs[0].w / 2 - 90), top: px(py + devs[0].h * .42 - 90), width: '180px', height: '180px', borderRadius: '50%', background: '#fff', color: '#050505', display: 'grid', placeItems: 'center', font: '800 110px/1 M', boxShadow: '0 20px 50px rgba(0,0,0,.5)' }, '✗');
    ctx.cues.push({ t: tR - .14, s: 'whoosh', g: .6 }, { t: tR + .55, s: 'ding', g: .7 }); if (!calm) ctx.cues.push({ t: tR + .25, s: 'nope', g: .6 });
    // flows: [{t, from: [x, y, w, h] (left page css px), to: [x, y, w, h] (right page css px), lift? (.22 s), d? (.6 s flight)}]
    // — a crop of the LEFT screenshot lifts off the left phone (accent outline), flies in an arc into the right phone's box,
    // growing to fit it, then fades so the real section shows (a menu post → the site's menu section). Lands at
    // t + lift + d (`whoosh` on lift-off, `pop` + punch on landing): scroll the right page there first and put a right-side
    // highlight at the landing time to label it. The card follows both pages' scroll (keep the left phone out of solo by then).
    const fls = (Lt.image && !Lt.story && Rt.image && !Rt.story ? sp.flows || [] : []).filter(f => f && f.from && f.to).map(f => {
      const dL = devs[0], dR = devs[1], kL = dL.sw / (dL.cssW || dL.sw), kR = dR.sw / (dR.cssW || dR.sw);
      const [fx, fy, fw, fh] = f.from, [gx, gy, gw, gh] = f.to, lift = f.lift ?? .22, d = f.d ?? .6, w0 = fw * kL, h0 = fh * kL;
      const card = $('div', 'abs', cam, { left: 0, top: 0, width: px(w0), height: px(h0), overflow: 'hidden', borderRadius: '12px', transformOrigin: '50% 50%', opacity: 0, background: '#111' });
      const im = $('img', null, card, { position: 'absolute', left: px(-fx * kL), top: px(-fy * kL), width: px(dL.sw), maxWidth: 'none' }); im.src = Lt.image;
      const tl = +f.t + lift + d; ctx.cues.push({ t: +f.t + lift * .4, s: 'whoosh', g: .5 }, { t: tl, s: 'pop', g: .75 }); ctx.punch.push(tl);
      return { t: +f.t, card, kL, kR, fx, fy, w0, h0, gx, gy, gw, gh, lift, d, tl, s1: Math.min(gw * kR / w0, gh * kR / h0) };
    });
    ctx.ready = Math.max(tR + .8, ...[Lt, Rt].flatMap(o => (o.highlights || []).map(h => h.t + .5)), ...fls.map(F => F.tl + .45));
    ctx.punch.push(tR + .25);
    const tHead = hs.g ? tR - .05 : .05;
    ups.push(lt => {
      if (hs.g) { revLines(hs.g.lines, lt, .05); const p = E.i3(pr(lt, tR - .38, .3)); hs.g.m.el.style.opacity = (1 - p).toFixed(3); hs.g.m.el.style.transform = p > 0 ? `translateY(${(-40 * p).toFixed(1)}px)` : ''; }
      if (hd.g) revLines(hd.g.lines, lt, tHead);
      const press = devs.map((d, i) => (svs[i] ? svs[i](lt) : 1) * side[i].tp(lt));
      devMotion(devs[0], lt, 0, 1, press[0], so ? 0 : -1); devMotion(devs[1], lt, tR, 1, press[1], 1);
      if (soloT) devs[0].el.style.transform = soloT(E.io3(pr(lt, tR - .42, .62))) + devs[0].el.style.transform;
      sCo.forEach(({ c, co }) => { popIn(co, lt - c.t, .5, 2.2, .5); const off = Math.min(c.d != null ? c.t + c.d : 1e9, tR - .42); if (lt > off) co.style.opacity = (1 - pr(lt, off, .2)).toFixed(3); });
      // per-side zoom: the overlay (taps, highlight boxes) zooms with the screen, as in phone / browser scenes
      devs.forEach((d, i) => { const hl = side[i].hl; if (!d.img) { if (hl) hl(lt); return; } const s = scr[i](lt); if (zfs[i]) { const zm = zfs[i](lt, s); d.img.style.transform = `translate(${zm.ox.toFixed(1)}px,${(zm.oy - s * zm.z).toFixed(1)}px) scale(${zm.z.toFixed(4)})`; d.ovl.style.transform = `translate(${zm.ox.toFixed(1)}px,${zm.oy.toFixed(1)}px) scale(${zm.z.toFixed(4)})`; if (hl) hl(lt, zm); } else { d.img.style.transform = `translateY(${(-s).toFixed(1)}px)`; if (hl) hl(lt); } });
      if (!calm) devs[0].el.style.filter = lt > tR + .2 ? `brightness(${lerp(1, .55, E.o3(pr(lt, tR + .2, .4))).toFixed(3)})` : '';
      fadeUp(chips[0], lt, so ? tR + .1 : .1, .4, 20); fadeUp(chips[1], lt, tR + .15, .4, 20);
      if (stamp) { popIn(stamp, lt - tR - .25, .3, 2.2, .45); if (lt < tR + .25) stamp.style.opacity = 0; }
      fls.forEach(F => {                                              // flows (see above): lift → arc → land → fade
        const tau = lt - F.t; if (tau < 0 || lt > F.tl + .32) { F.card.style.opacity = 0; return; }
        const dL = devs[0], dR = devs[1], sR = scr[1](Math.max(lt, F.tl));
        const c0x = dL.sx + F.fx * F.kL + F.w0 / 2, c0y = dL.sy + F.fy * F.kL - scr[0](lt) + F.h0 / 2;
        const c1x = dR.sx + (F.gx + F.gw / 2) * F.kR, c1y = dR.sy + (F.gy + F.gh / 2) * F.kR - sR;
        const pl = E.o3(pr(tau, 0, F.lift)), p = E.io3(pr(tau, F.lift, F.d)), arc = Math.sin(Math.PI * p);
        const cx = lerp(c0x, c1x, p), cy = lerp(c0y - 18 * pl, c1y, p) - 110 * arc;
        const sc = lerp(1 + .12 * pl, F.s1, p) + .18 * arc, rot = lerp(-3 * pl, 0, p) + 4 * arc;
        F.card.style.transform = `translate(${(cx - F.w0 / 2).toFixed(1)}px,${(cy - F.h0 / 2).toFixed(1)}px) rotate(${rot.toFixed(2)}deg) scale(${sc.toFixed(4)})`;
        F.card.style.boxShadow = `0 0 0 ${(4 / sc).toFixed(2)}px ${C.accent}, 0 ${(24 / sc).toFixed(1)}px ${(60 / sc).toFixed(1)}px rgba(0,0,0,${(.6 * Math.max(pl, arc)).toFixed(2)})`;
        F.card.style.opacity = (cl(tau / .06) * (1 - pr(lt, F.tl + .04, .28))).toFixed(3);
      });
    });
  } else if (mode === 'slider') {
    const dw = sp.device === 'browser' ? bx.w : Math.min(560, phoneW(avail - 120));
    const mk = src => sp.device === 'browser' ? browser(cam, { x: bx.x, y: top + 110, w: dw, src, url: sp.url, demo: isDemo(src) }) : phone(cam, { x: bx.x + (bx.w - dw) / 2, y: top + 110, w: dw, src, demo: isDemo(src), bg: Lt.bg });   // left.bg: screen colour under a short BEFORE page
    const d = mk(Lt.image);
    const after = $('img', 'shot', d.scr); after.src = Rt.image; const ad = IMG[Rt.image] || { w: 1, h: 1 };
    d.scr.insertBefore(after, d.scr.querySelector('.sheen'));
    const line = $('div', 'abs', d.scr, { top: 0, bottom: 0, width: '6px', background: '#fff', zIndex: 6, boxShadow: '0 0 20px rgba(0,0,0,.5)' });
    const knob = $('div', 'abs', d.scr, { width: '96px', height: '96px', borderRadius: '50%', background: '#fff', color: '#050505', display: 'grid', placeItems: 'center', font: '800 44px/1 I', zIndex: 7, top: px(d.sh / 2 - 48), boxShadow: '0 10px 30px rgba(0,0,0,.45)' }, '⟷');
    const chips = [chip(cam, lbl(Lt, LB('BEFORE', 'ANTES'), false), 'dim'), chip(cam, lbl(Rt, LB('AFTER', 'DESPUÉS'), true), 'solid')];
    place(chips[0], bx.x, top); place(chips[1], bx.x + bx.w - chips[1].offsetWidth, top);
    const s0 = scrollFn(d, Lt.scroll ?? 0, sp.dur); const amax = Math.max(0, d.sw * ad.h / ad.w - d.sh);
    const sweep = [tR - .2, Math.min(sp.dur - .5, tR + 1.4)];
    ctx.cues.push({ t: sweep[0], s: 'whoosh', g: .6 }, { t: sweep[1] - .1, s: 'ding', g: .7 }); ctx.ready = sweep[1];
    ups.push(lt => {
      if (hd.g) revLines(hd.g.lines, lt, .05);
      devMotion(d, lt, 0);
      const f = E.io3(pr(lt, sweep[0], sweep[1] - sweep[0])), xL = d.sw * (1 - f);
      after.style.clipPath = `inset(0 0 0 ${xL.toFixed(1)}px)`;
      if (d.img) d.img.style.transform = `translateY(${(-s0(lt)).toFixed(1)}px)`;
      after.style.transform = `translateY(${(-Math.min(amax, amax * (Rt.scroll ?? 0))).toFixed(1)}px)`;
      line.style.left = px(xL - 3); knob.style.left = px(xL - 48);
      const vis = lt > sweep[0] - .05 && f < .999 ? 1 : 0; line.style.opacity = knob.style.opacity = vis;
      fadeUp(chips[0], lt, .1, .4, 20); fadeUp(chips[1], lt, sweep[0] + .3, .4, 20);
    });
  } else {                                                            // cards
    const P = 52, cw = bx.w, gapY = 34, half = (avail - gapY) / 2;
    const mkCard = (o, good) => {
      const card = $('div', 'abs sz', cam, { left: px(bx.x), width: px(cw), borderRadius: '40px', background: good ? '#fff' : '#141414', boxShadow: good ? '0 40px 90px rgba(0,0,0,.6)' : 'inset 0 0 0 3px #2c2c2c' });
      const c = chip(card, lbl(o, good ? LB('DO', 'SÍ') : LB("DON'T", 'NO'), good), good ? 'solid' : 'dim'); place(c, P, P);
      if (good) { c.style.background = '#050505'; c.style.color = '#fff'; c.style.borderColor = '#050505'; }
      const lines = (o.lines || (o.text ? [o.text] : [])); const lh = (half - 2 * P - c.offsetHeight - 30) / Math.max(1, lines.length);
      let y = P + c.offsetHeight + 30; const gs = lines.map(t => { const g = dual(card, t, { font: 'I', weight: 600, w: cw - 2 * P - 50, h: lh - 12, max: 58, min: 44, upper: false, color: good ? '#050505' : '#d6d6d6' }, { color: good ? '#555' : '#8a8a8a' }); const mk = $('div', 'abs', card, { left: px(P - 4), top: px(y), font: '700 54px/1 I', color: good ? '#050505' : '#8a8a8a' }, good ? '✓' : '✗'); g.at(P + 50, y); y += g.h + 14; return { g, mk }; });
      card.style.height = px(Math.min(half, y + P - 14));
      return { card, c, gs, h: Math.min(half, y + P - 14) };
    };
    const A = mkCard(Lt, false), Bc = mkCard(Rt, true);
    const tot = A.h + gapY + Bc.h, y0 = top + Math.max(0, (avail - tot) * .4);
    A.card.style.top = px(y0); Bc.card.style.top = px(y0 + A.h + gapY);
    ctx.cues.push({ t: .15, s: 'nope', g: .5 }, { t: tR, s: 'whoosh', g: .5 }, { t: tR + .35, s: 'ding', g: .7 }); ctx.punch.push(tR + .35); ctx.ready = tR + .3 + Bc.gs.length * .12 + .5;
    ups.push(lt => {
      if (hd.g) revLines(hd.g.lines, lt, .05);
      [[A, 0], [Bc, tR]].forEach(([k, t0]) => { const p = spr(lt - t0, 1.3, .7); k.card.style.opacity = cl((lt - t0) / .12).toFixed(3); k.card.style.transform = `translateY(${((1 - p) * 160).toFixed(1)}px) scale(${lerp(.94, 1, p).toFixed(4)})`; k.gs.forEach(({ g, mk }, i) => { revLines(g.lines, lt, t0 + .2 + i * .12, .05, .5); mk.style.opacity = cl((lt - t0 - .2 - i * .12) / .1).toFixed(3); }); });
      A.card.style.filter = lt > tR + .3 ? `brightness(${lerp(1, .6, E.o3(pr(lt, tR + .3, .4))).toFixed(3)})` : '';
    });
  }
  return lt => ups.forEach(u => u(lt));
};

// device `zoom` (phone / browser): a number, or keyframes [[t, z, x?, y?], …] (t = scene s, z ≥ 1, eased in-out between
// keys; x, y = the focus point in page CSS px, else `zoomAt` [x, y], else the middle of the screen). The screenshot AND the
// overlay (taps, highlight boxes) scale around the focus — a pinch-zoom on the screen — and callouts follow their box.
function zoomFn(dev, spec, at, sc) {
  if (spec == null || spec === false || (!Array.isArray(spec) && !(+spec > 1))) return null;
  const cw = dev.cssW || dev.sw, k = dev.sw / cw;
  const fx0 = at ? +at[0] : cw / 2, fy0 = at ? +at[1] : (sc(0) + dev.sh / 2) / k;
  const keys = (Array.isArray(spec) ? spec : [[0, +spec]]).map(q => [+q[0] || 0, Math.max(1, +q[1] || 1), q[2] ?? fx0, q[3] ?? fy0]);
  const val = lt => {
    if (lt <= keys[0][0]) return keys[0];
    for (let i = 1; i < keys.length; i++) if (lt <= keys[i][0]) { const a = keys[i - 1], b = keys[i], p = E.io3(pr(lt, a[0], b[0] - a[0])); return [lt, lerp(a[1], b[1], p), lerp(a[2], b[2], p), lerp(a[3], b[3], p)]; }
    return keys[keys.length - 1];
  };
  if (dev.img) dev.img.style.transformOrigin = '0 0';
  dev.ovl.style.transformOrigin = '0 0';
  return (lt, s) => { const [, z, x, y] = val(lt); const fx = cl(x * k, 0, dev.sw), fy = cl(y * k - s, 0, dev.sh); return { z, ox: fx * (1 - z), oy: fy * (1 - z) }; };
}
function deviceScene(kind) {
  return (cam, sp, ctx) => {
    // optional: kicker (chip above the head) · headSize (head max px, 100) · headSlam (head words slam in one by one like a
    // hook, hit + punch on each, `every` beats apart) · open (built to OPEN a reel: kicker, head and device already landing
    // on frame 0) · zoom / zoomAt (see zoomFn)
    const bx0 = ctx.box, o0 = sp.open ? -.3 : 0;
    const kc = sp.kicker ? chip(cam, tx(sp.kicker).m) : null, kh = kc ? kc.offsetHeight + 34 : 0;
    if (kc) place(kc, bx0.x, bx0.y);
    const bx = kh ? { ...bx0, y: bx0.y + kh, h: bx0.h - kh } : bx0;
    const hd = headTop(cam, sp.head, bx, { h: sp.headSize ? Math.round(sp.headSize * 2.5) : 250, max: sp.headSize || 100, cls: sp.headSlam ? 'noclip' : '' });
    const top = bx.y + hd.h + (hd.h ? 44 : 0), avail = bx.h - (top - bx.y);
    let dev, mob = null;
    if (kind === 'phone') { const pw = Math.min(sp.width || 560, phoneW(avail)); dev = phone(cam, { x: bx.x + (bx.w - pw) / 2, y: top + Math.max(0, (avail - pw * 2.085) * .5), w: pw, src: sp.story ? null : sp.image, bg: sp.story ? '#000' : undefined, demo: sp.story ? false : sp.demo ?? isDemo(sp.image), cssW: sp.cssWidth }); }
    else {
      const asp = sp.aspect ? cl(+sp.aspect, .4, 1.4) : 800 / 1280, bw = bx.w, bh = bw * asp + 96;   // aspect: a taller window for a vertical reel (screen h / w, default .625)
      const extra = sp.mobile ? 300 : 0;
      dev = browser(cam, { x: bx.x, y: top + Math.max(0, (avail - bh - extra) * .4), w: bw, aspect: asp, src: sp.image, url: tx(sp.url).m, demo: sp.demo ?? isDemo(sp.image), cssW: sp.cssWidth });
      if (sp.mobile) { const pw = Math.min(250, phoneW(avail - (dev.y - top) - bh * .55)); mob = phone(cam, { x: bx.x + bx.w - pw - 10, y: Math.min(dev.y + bh * .5, S.y + S.h - pw * 2.085), w: pw, src: sp.mobile, demo: false }); }
    }
    // pages: [{t, image, scroll? (0; a number or keyframes in scene s), fx? ('load' = accent loading bar for `load` s, then the
    // page slides in from the right · 'back' = slides in from the left · 'cut'), load? (.3)}] — the screen navigates to another
    // screenshot at t (a tapped link opens a 404, "back", another page …). Page-coordinate taps / highlights / badges use the
    // page on screen at their start time; zoom applies to whichever page is showing. No `pages` = one image, as before.
    // fx 'scan' = the new page is revealed behind an accent scan line that sweeps the screen in `dur` s (.55), top → bottom,
    // or bottom → top with dir: 'up' (e.g. a profile "turning into" a website, and back for a rewind); `whoosh` on t.
    const pgs = [{ t: -1e9, img: dev.img, sc: scrollFn(dev, sp.scroll ?? 'auto', sp.dur, .6), fx: 'cut', ih: dev.ih }];
    (dev.img ? sp.pages || [] : []).forEach(p => {
      const im = $('img', 'shot'); im.src = p.image; dev.scr.insertBefore(im, dev.content); im.style.visibility = 'hidden';
      const d = IMG[p.image] || { w: 1, h: 1 }, ih = dev.sw * d.h / d.w, t = +p.t || 0;
      pgs.push({ t, img: im, sc: scrollFn({ img: im, maxScroll: Math.max(0, ih - dev.sh) }, p.scroll ?? 0, sp.dur, t + .5), fx: p.fx || 'load', load: p.load ?? .3, ih, dur: Math.max(.15, +p.dur || .55), up: p.dir === 'up' });
      ctx.cues.push({ t, s: 'whoosh', g: p.fx === 'scan' ? .5 : .3 });
    });
    pgs.sort((a, b) => a.t - b.t);
    const pgAt = lt => { let k = 0; pgs.forEach((p, i) => { if (lt >= p.t) k = i; }); return k; };
    const sc = pgs.length > 1 ? lt => pgs[pgAt(lt)].sc(lt) : pgs[0].sc;
    const lbar = pgs.some(p => p.fx === 'load') ? $('div', 'abs', dev.scr, { left: 0, top: px(Math.round(dev.sw * .125)), height: px(Math.max(6, dev.sw * .014)), width: '0px', background: C.accent, zIndex: 6, boxShadow: `0 0 12px ${C.accent}`, opacity: 0 }) : null;
    const SLH = Math.round(dev.sh * .16);                             // scan pages: the accent line + a soft glow trailing behind it
    const sline = pgs.some(p => p.fx === 'scan') ? $('div', 'abs', dev.scr, { left: 0, top: 0, width: px(dev.sw), height: px(SLH), zIndex: 6, opacity: 0, pointerEvents: 'none' }) : null;
    const slineCss = up => `linear-gradient(${up ? 0 : 180}deg, transparent, ${C.accent}33 70%, ${C.accent}cc calc(100% - 7px), ${C.accent} calc(100% - 6px))`;
    const zf = zoomFn(dev, sp.zoom, sp.zoomAt, sc);
    if (zf) pgs.forEach(p => { if (p.img) p.img.style.transformOrigin = '0 0'; });
    const ms = mob ? scrollFn(mob, sp.mobileScroll ?? 'auto', sp.dur, 1.1) : null;
    const tp = taps(dev, sp.taps, ctx, sc); const hl = highlights(dev, sp.highlights, ctx, cam, sc);
    const sv = kind === 'phone' && sp.story ? storyViewer(dev, sp.story, ctx) : null;   // story: the screen is a story viewer (see storyViewer)
    const hw = hd.g && sp.headSlam ? hd.g.m.words : [], every = sp.every ? sp.every * B : (hw.length <= 3 ? B : B / 2), tW = i => (sp.open ? 0 : .12) + i * every;
    hw.forEach((w, i) => { w.style.transformOrigin = '50% 75%'; ctx.cues.push({ t: tW(i), s: 'hit', g: i === hw.length - 1 ? 1 : .7 }); ctx.punch.push(tW(i)); });
    // badges: [{t, at: [x, y] (page css px) | x, y (screen fractions), text, d? (s; default: until the next page change),
    // size? (css px, 40), tilt? (deg, -8), pulse? (true = a small kick on every beat)}] — accent number stickers on the screen
    // (e.g. "1" and "2" on two look-alike buttons); they sit on the overlay, so they zoom with the screen like taps do
    const bdg = (sp.badges || []).map(b0 => {
      const b = norm(dev, b0, sc), d = (b.size || 40) * dev.sw / (dev.cssW || dev.sw);
      const e = $('div', 'abs', dev.ovl, { left: px(b.x * dev.sw - d / 2), top: px(b.y * dev.sh - d / 2), width: px(d), height: px(d), borderRadius: '50%', background: C.accent, color: '#050505', display: 'grid', placeItems: 'center', font: `800 ${(d * .58).toFixed(1)}px/1 M`, boxShadow: `0 0 0 ${(d * .07).toFixed(1)}px #fff, 0 ${(d * .12).toFixed(1)}px ${(d * .3).toFixed(1)}px rgba(0,0,0,.4)`, opacity: 0 }, tx(b.text).m);
      const nx = pgs.find(p => p.t > b.t), off = b.d != null ? b.t + b.d : nx ? nx.t : 1e9;
      ctx.cues.push({ t: b.t, s: 'pop', g: .6 });
      return { b, e, off };
    });
    ctx.ready = Math.max(.9, ...(sp.highlights || []).map(h => h.t + .5), ...(sp.taps || []).map(h => h.t + .4), ...bdg.map(x => x.b.t + .3), ...pgs.slice(1).map(p => p.t + (p.fx === 'scan' ? p.dur : 0) + .3), hw.length ? tW(hw.length - 1) + .3 : 0);
    const typeUrl = kind === 'browser' && sp.typeUrl !== false && dev.ut.textContent;
    const url = dev.ut ? dev.ut.textContent : '';
    if (typeUrl) for (let i = 0; i < url.length; i++) ctx.cues.push({ t: .25 + i * .045, s: 'tick', g: .45, p: .9 + ((i * 37) % 10) / 40 });
    ctx.cues.push({ t: 0, s: 'whoosh', g: .35 });
    return lt => {
      if (kc) fadeUp(kc, lt, o0, .4, 24);
      if (hw.length) {
        hw.forEach((w, i) => {
          const tau = lt - tW(i) + (i || !sp.open ? .045 : .16), p = spr(tau, 2.4, .5);
          w.style.opacity = cl(tau / .035).toFixed(3);
          w.style.transform = tau <= 0 ? 'scale(.2)' : `translateY(${((1 - p) * hd.g.m.fs * .12).toFixed(1)}px) scale(${(1 + .8 * (1 - p)).toFixed(4)}) rotate(${((1 - p) * -6).toFixed(2)}deg)`;
        });
        if (hd.g.s) revLines(hd.g.s.lines, lt, tW(hw.length - 1) + .1);
      } else if (hd.g) revLines(hd.g.lines, lt, sp.open ? -.25 : .05);
      const press = tp(lt) * (sv ? sv(lt) : 1);
      devMotion(dev, lt, o0, 1, press);
      if (pgs.length > 1) {                                           // pages: the one on screen (+ the one it covers while it slides in)
        const k = pgAt(lt), cur = pgs[k], tau = lt - cur.t, scan = cur.fx === 'scan', inP = cur.fx === 'cut' ? 1 : scan ? E.io3(pr(tau, 0, cur.dur)) : E.o3(pr(tau, 0, .26));
        pgs.forEach((p, i) => { if (!p.img) return; const vis = i === k || (i === k - 1 && inP < 1); p.img.style.visibility = vis ? 'visible' : 'hidden'; p.slide = !scan && i === k && inP < 1 ? (1 - inP) * (cur.fx === 'back' ? -1 : 1) * dev.sw * .32 : 0; p.img.style.opacity = !scan && i === k && inP < 1 ? Math.min(1, .55 + 1.5 * inP).toFixed(3) : ''; p.scanP = scan && i === k && inP < 1 ? inP : null; });
        if (sline) { const on = scan && inP > 0 && inP < 1; sline.style.opacity = on ? (cl(inP / .08) * cl((1 - inP) / .08)).toFixed(3) : 0; if (on) { sline.style.background = slineCss(cur.up); sline.style.transform = `translateY(${(cur.up ? (1 - inP) * dev.sh - 6 : inP * dev.sh - SLH + 6).toFixed(1)}px)`; } }
        if (lbar) { let w = 0, o = 0; pgs.forEach(p => { if (p.fx !== 'load' || lt < p.t - p.load || lt >= p.t + .3) return; w = lt < p.t ? .88 * E.o3(pr(lt, p.t - p.load, p.load)) : 1; o = lt < p.t ? 1 : 1 - pr(lt, p.t + .06, .22); }); lbar.style.width = px(dev.sw * w); lbar.style.opacity = o.toFixed(3); }
      }
      bdg.forEach(({ b, e, off }) => {
        const tau = lt - b.t; if (tau < 0 || lt >= off) { e.style.opacity = 0; return; }   // gone by the next page change (fades .15 s before)
        const q = spr(tau, 2.4, .45), tl = b.tilt ?? -8, pul = b.pulse ? kick(lt % B, 9) : 0;
        e.style.opacity = (cl(tau / .05) * (1 - pr(lt, off - .15, .15))).toFixed(3);
        e.style.transform = `rotate(${(tl * (3 - 2 * q)).toFixed(2)}deg) scale(${(lerp(.15, 1, q) * (1 + .12 * pul)).toFixed(4)})`;
      });
      const s = sc(lt);
      // scan pages: clip the incoming page to the part of the screen the line has passed (screen y → image y, zoom-aware)
      const clipScan = zm => pgs.forEach(p => {
        if (!p.img) return; if (p.scanP == null) { if (p.img.style.clipPath) p.img.style.clipPath = ''; return; }
        const z = zm ? zm.z : 1, oy = zm ? zm.oy : 0, ps = p.sc(lt), loc = Y => (Y - oy) / z + ps;
        const a = p.up ? (1 - p.scanP) * dev.sh : 0, b = p.up ? dev.sh : p.scanP * dev.sh;
        p.img.style.clipPath = `inset(${Math.max(0, loc(a)).toFixed(1)}px 0 ${Math.max(0, (p.ih || 0) - loc(b)).toFixed(1)}px 0)`;
      });
      if (zf) {
        const zm = zf(lt, s), z = zm.z.toFixed(4);
        pgs.forEach(p => { if (p.img) p.img.style.transform = `translate(${(zm.ox + (p.slide || 0)).toFixed(1)}px,${(zm.oy - p.sc(lt) * zm.z).toFixed(1)}px) scale(${z})`; });
        dev.ovl.style.transform = `translate(${zm.ox.toFixed(1)}px,${zm.oy.toFixed(1)}px) scale(${z})`;
        if (pgs.length > 1) clipScan(zm);
        hl(lt, zm);
      } else {
        pgs.forEach(p => { if (p.img) p.img.style.transform = p.slide ? `translate(${p.slide.toFixed(1)}px,${(-p.sc(lt)).toFixed(1)}px)` : `translateY(${(-p.sc(lt)).toFixed(1)}px)`; });
        if (pgs.length > 1) clipScan(null);
        hl(lt);
      }
      if (typeUrl) dev.ut.textContent = url.slice(0, Math.max(0, Math.floor((lt - .25) / .045) + 1));
      if (mob) { devMotion(mob, lt, .5, 1, 1, 1); if (mob.img) mob.img.style.transform = `translateY(${(-ms(lt)).toFixed(1)}px)`; }
    };
  };
}
SC.phone = deviceScene('phone');
SC.browser = deviceScene('browser');

// GENERIC social profile mock (no platform branding): avatar, name, bio, link-in-bio button, 3×3 grid
SC.profile = (cam, sp, ctx) => {
  const bx = ctx.box; const hd = headTop(cam, sp.head, bx, { h: 220, max: 92 });
  const top = bx.y + hd.h + (hd.h ? 40 : 0), avail = bx.h - (top - bx.y);
  const dark = sp.theme === 'dark';
  const card = $('div', `card ui sz ${dark ? 'ui-dark' : 'ui-light'}`, cam, { left: px(bx.x), top: px(top), width: px(bx.w) });
  const P = 40, ink = dark ? '#f2f2f2' : '#111', sub = dark ? '#9a9a9a' : '#6b6b6b', soft = dark ? '#242424' : '#efefef';
  const row = $('div', 'abs', card, { left: px(P), top: px(P), right: px(P), height: '170px' });
  const av = $('div', 'av', row, { position: 'absolute', left: 0, top: 0, width: '170px', height: '170px', boxShadow: `0 0 0 5px ${dark ? '#121212' : '#fff'}, 0 0 0 9px ${dark ? '#3a3a3a' : '#d9d9d9'}` });
  if (sp.avatar && IMG[sp.avatar]) { const im = $('img', null, av); im.src = sp.avatar; } else av.textContent = (tx(sp.name).m.match(/\b\w/g) || ['?']).slice(0, 2).join('').toUpperCase();
  const nm = $('div', 'abs rd', row, { left: '206px', top: '8px', right: 0, font: `700 52px/1.1 I`, color: ink, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }, tx(sp.name).m);
  const hdl = $('div', 'abs rd', row, { left: '206px', top: '76px', right: 0, font: `500 44px/1.1 I`, color: sub, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }, sp.handle ? '@' + String(sp.handle).replace(/^@/, '') : tx(sp.category).m);
  const st = sp.stats; if (st) { const s = $('div', 'abs', row, { left: '206px', top: '128px', right: 0, font: '500 32px/1 I', color: sub, whiteSpace: 'nowrap' }); s.innerHTML = Object.entries(st).map(([k, v]) => `<b style="color:${ink};font-weight:700">${v}</b> ${k}`).join(' &nbsp; '); }
  let y = P + 170 + 30;
  const bio = (sp.bio || []).map(b => { const e = $('div', 'abs rd', card, { left: px(P), top: px(y), width: px(bx.w - 2 * P), font: `500 44px/1.25 I`, color: ink }, tx(b).m); y += e.offsetHeight + 6; return e; });
  // typeBio: true | {t: start s (.45), cps: letters per second (26), gap: pause between lines s (.16)} — the bio lines type in
  // one after the other (grapheme by grapheme, so emoji land whole) with a caret and a soft tick per letter. Layout is
  // measured on the full text first, so nothing below the bio moves while it types.
  const tb = sp.typeBio ? (typeof sp.typeBio === 'object' ? sp.typeBio : {}) : null; let typing = null;
  if (tb && bio.length) {
    const seg = str => { try { return [...new Intl.Segmenter(undefined, { granularity: 'grapheme' }).segment(str)].map(x => x.segment); } catch (e) { return Array.from(str); } };
    const cps = tb.cps || 26, gapL = tb.gap ?? .16; let tt = tb.t ?? .45, k = 0;
    typing = bio.map(e => { const g = seg(e.textContent), t0 = tt; tt += g.length / cps + gapL;
      e.style.height = px(e.offsetHeight); e.textContent = '';
      const tspan = $('span', null, e); const cur = $('span', null, e, { display: 'inline-block', width: '4px', height: '1.05em', background: ink, verticalAlign: '-.17em', marginLeft: '3px', borderRadius: '2px', opacity: 0 });
      g.forEach((c, i) => { if (c.trim()) ctx.cues.push({ t: t0 + i / cps, s: 'tick', g: .38, p: .9 + (((k++) * 37) % 10) / 40 }); });
      return { e, g, t0, tspan, cur, cps }; });
    typing.tEnd = tt - gapL;
  }
  const noLink = sp.link === false;                                 // link: false → no link-in-bio row (a profile that links nowhere)
  y += noLink ? 12 : 18;
  let link = null;
  if (!noLink) {
    link = $('div', 'abs rd', card, { left: px(P), top: px(y), width: px(bx.w - 2 * P), height: '100px', borderRadius: '26px', background: soft, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '16px', font: `600 44px/1 I`, color: ink, whiteSpace: 'nowrap', overflow: 'hidden' });
    link.innerHTML = `<svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="${ink}" stroke-width="2.4" stroke-linecap="round"><path d="M10 14a5 5 0 0 0 7 0l3-3a5 5 0 0 0-7-7l-1 1"/><path d="M14 10a5 5 0 0 0-7 0l-3 3a5 5 0 0 0 7 7l1-1"/></svg><span></span>`; link.querySelector('span').textContent = tx(sp.link).m || 'link in bio';
    y += 100 + 30;
  }
  const grid = sp.grid || []; const gap = 5, tw = (bx.w - 2 * gap) / 3;
  let rows = Math.min(3, Math.ceil(grid.length / 3)), th = 0;
  for (; rows >= 0; rows--) { th = rows ? Math.min(tw * 1.1, (avail - y - (rows - 1) * gap) / rows) : 0; if (!rows || th >= 150) break; }
  const tiles = [];
  for (let i = 0; i < rows * 3 && i < grid.length; i++) {
    const g = typeof grid[i] === 'string' ? { src: grid[i] } : grid[i];
    const t = $('div', 'tile', card, { left: px((i % 3) * (tw + gap)), top: px(y + Math.floor(i / 3) * (th + gap)), width: px(tw), height: px(th) });
    const im = $('img', null, t); im.src = g.src; if (g.pos) im.style.objectPosition = g.pos; if (g.zoom) im.style.transform = `scale(${g.zoom})`;
    if (g.label) $('div', 'abs', t, { left: '14px', bottom: '12px', font: '700 30px/1 I', color: '#fff', textShadow: '0 2px 10px rgba(0,0,0,.7)' }, g.label);
    tiles.push(t);
  }
  if (grid.length > tiles.length && rows < 3) warn('fit', `profile grid trimmed to ${tiles.length} tiles to fit`);
  const ch = y + (rows ? rows * th + (rows - 1) * gap : 0);
  card.style.height = px(ch);
  if (ch > avail + 1) warn('overflow', `profile card ${Math.round(ch)} px > ${Math.round(avail)} px`);
  if (sp.demo ?? isDemo(sp.avatar) ?? true) { const dt = $('div', 'demo', card, { right: px(P), top: px(P) }, 'DEMO'); nm.style.right = px(dt.offsetWidth + 18); }   // the name never runs under the tag
  // focus targets → canvas rects for highlights/taps
  const tgt = { avatar: av, name: nm, bio: bio[0], link, grid: tiles[0] };
  const rectOf = k => { if (k === 'grid' && tiles.length) { return { x: bx.x, y: top + y, w: bx.w, h: rows * th + (rows - 1) * gap }; } if (k === 'bio' && bio.length) { const a = bio[0], z = bio[bio.length - 1]; return { x: bx.x + P - 14, y: top + a.offsetTop - 10, w: bx.w - 2 * P + 28, h: z.offsetTop + z.offsetHeight - a.offsetTop + 20 }; } const e = tgt[k] || link || bio[0] || nm; let x = 0, yy = 0, n = e; while (n && n !== card) { x += n.offsetLeft; yy += n.offsetTop; n = n.offsetParent; } return { x: bx.x + x - 12, y: top + yy - 12, w: e.offsetWidth + 24, h: e.offsetHeight + 24 }; };
  const fx = $('div', 'abs', cam, { left: 0, top: 0, width: '1080px', height: '1920px', pointerEvents: 'none' });
  const fake = { sx: 0, sy: 0, sw: W, sh: H, ovl: fx };
  const hl = highlights(fake, (sp.highlights || []).map(h => { const r = rectOf(h.target || 'link'); return { ...h, x: r.x / W, y: r.y / H, w: r.w / W, h: r.h / H }; }), ctx, cam);
  fx.querySelectorAll('.spot').forEach(s => s.remove());           // no spotlight dimming outside the card
  const tp = taps(fake, (sp.taps || []).map(t => { const r = rectOf(t.target || 'link'); return { t: t.t, x: (r.x + r.w / 2) / W, y: (r.y + r.h / 2) / H }; }), ctx);
  const tIn = i => .22 + i * .05; ctx.ready = Math.max(1.3, typing ? typing.tEnd + .3 : 0, ...(sp.highlights || []).map(h => h.t + .5));
  tiles.forEach((_, i) => { if (i % 3 === 0) ctx.cues.push({ t: .55 + i * .04, s: 'tick', g: .35, p: 1 + i * .03 }); });
  return lt => {
    if (hd.g) revLines(hd.g.lines, lt, .05);
    const p = spr(lt, 1.1, .72); card.style.transform = `perspective(2600px) translateY(${((1 - p) * 260).toFixed(1)}px) rotateX(${((1 - p) * 14).toFixed(2)}deg) scale(${(lerp(.93, 1, p) * tp(lt)).toFixed(4)})`; card.style.opacity = cl(lt / .12 + .001).toFixed(3);
    popIn(av, lt - .1, .5, 2.2, .55);
    [nm, hdl, ...(typing ? [] : bio)].forEach((e, i) => fadeUp(e, lt, tIn(i), .4, 24));
    if (typing) typing.forEach((L, i) => {
      const n = lt < L.t0 ? 0 : Math.min(L.g.length, Math.floor((lt - L.t0) * L.cps) + 1), txt = L.g.slice(0, n).join('');
      if (L.tspan.textContent !== txt) L.tspan.textContent = txt;
      const nx = typing[i + 1], live = lt >= (i ? L.t0 - .02 : tIn(2)) && (nx ? lt < nx.t0 : true);      // caret: on the line being typed, blinks when idle
      const idle = n === 0 || n >= L.g.length; L.cur.style.opacity = live && (!idle || Math.floor(lt / .42) % 2 === 0) ? 1 : 0;
    });
    if (link) popIn(link, lt - (typing ? Math.min(typing.tEnd, tIn(bio.length + 2)) : tIn(bio.length + 2)), .85, 2, .55);
    tiles.forEach((t, i) => popIn(t, lt - .55 - i * .04, .7, 2.2, .6));
    hl(lt);
  };
};

// GENERIC search page (no engine branding): query typed letter by letter, results, the business found or missing
SC.search = (cam, sp, ctx) => {
  const bx = ctx.box; const hd = headTop(cam, sp.head, bx, { h: 220, max: 92 });
  const top = bx.y + hd.h + (hd.h ? 40 : 0), avail = bx.h - (top - bx.y);
  const card = $('div', 'card ui ui-light sz', cam, { left: px(bx.x), top: px(top), width: px(bx.w), height: px(avail) });
  const P = 40;
  const bar = $('div', 'abs', card, { left: px(P), top: px(P), right: px(P), height: '112px', borderRadius: '56px', border: '3px solid #dcdcdc', display: 'flex', alignItems: 'center', gap: '20px', padding: '0 34px', boxShadow: '0 8px 22px rgba(0,0,0,.06)' });
  bar.innerHTML = `<svg width="46" height="46" viewBox="0 0 24 24" fill="none" stroke="#777" stroke-width="2.6" stroke-linecap="round"><circle cx="10.5" cy="10.5" r="6.5"/><path d="M15.5 15.5 21 21"/></svg>`;
  const q = $('div', 'rd', bar, { font: '500 48px/1 I', color: '#111', whiteSpace: 'nowrap', overflow: 'hidden', flex: 1 }); const qs = $('span', null, q); const caret = $('span', null, q, { display: 'inline-block', width: '4px', height: '54px', background: '#111', marginLeft: '4px', verticalAlign: '-8px' });
  const tabs = $('div', 'abs', card, { left: px(P + 10), top: px(P + 140), font: '600 32px/1 I', color: '#777', display: 'flex', gap: '40px' });
  tabs.innerHTML = '<span style="color:#111;border-bottom:4px solid #111;padding-bottom:12px">All</span><span>Maps</span><span>Images</span><span>Reviews</span>';
  $('div', 'abs', card, { left: 0, right: 0, top: px(P + 192), height: '2px', background: '#ececec' });
  const query = tx(sp.query).m; const results = (sp.results || []).slice(); const biz = sp.business ? { ...sp.business, me: true } : null;
  const found = biz && sp.found !== false;
  if (found) results.splice(cl(sp.position ?? 0, 0, results.length), 0, biz);
  let y = P + 226; const blocks = [];
  for (const r of results) {
    const el = $('div', 'abs', card, { left: px(P), top: px(y), width: px(bx.w - 2 * P) });
    const u = $('div', null, el, { display: 'flex', alignItems: 'center', gap: '14px', font: '400 30px/1.2 I', color: '#4d5156' });
    u.innerHTML = `<i style="width:40px;height:40px;border-radius:50%;background:${r.me ? '#111' : '#e3e3e3'};display:inline-block;flex:none"></i>`; $('span', null, u, { whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }, tx(r.url).m || '');
    const tt = $('div', 'rd', el, { font: '600 46px/1.18 I', color: '#1f4fd1', marginTop: '12px' }, tx(r.title).m);
    const sn = r.text ? $('div', null, el, { font: '400 34px/1.35 I', color: '#4d5156', marginTop: '8px', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }, tx(r.text).m) : null;
    const hgt = el.offsetHeight;
    if (y + hgt > avail - P - (biz && !found ? 170 : 0)) { el.remove(); break; }
    blocks.push({ el, r, y, h: hgt }); y += hgt + 44;
  }
  let miss = null;
  if (biz && !found) {
    miss = $('div', 'abs rd', card, { left: px(P), top: px(Math.min(y, avail - P - 150)), width: px(bx.w - 2 * P), minHeight: '140px', borderRadius: '28px', border: '4px dashed #c7c7c7', display: 'flex', alignItems: 'center', gap: '22px', padding: '22px 30px', font: '700 44px/1.2 I', color: '#111' });
    miss.innerHTML = `<b style="flex:none;width:76px;height:76px;border-radius:50%;background:#111;color:#fff;display:grid;place-items:center;font:800 44px/1 M">✗</b><span></span>`;
    miss.querySelector('span').textContent = sp.missingLabel ? tx(sp.missingLabel).m : `${tx(biz.title).m}: ${LB('not found', 'no aparece')}`;
  }
  const over = .25 + .4 + blocks.length * .12 + .45, room = sp.dur - 1.05 - .35 - over;
  let rate = sp.typeRate || 14; if (query.length / rate > room) rate = query.length / Math.max(.35, room);
  if (rate > 30) warn('pace', `search has to type ${Math.round(rate)} letters/s to fit — shorten the query or add beats`);
  const tType = .35, tEnter = tType + query.length / rate + .25, tRes = tEnter + .4;
  for (let i = 0; i < query.length; i++) ctx.cues.push({ t: tType + i / rate, s: 'tick', g: .5, p: .88 + ((i * 53) % 9) / 30 });
  ctx.cues.push({ t: tEnter, s: 'tap', g: .8 });
  const tFocus = tRes + blocks.length * .12 + .45;
  const meB = blocks.find(b => b.r.me);
  let ring = null, co = null;
  if (meB) {
    ring = svg(card, bx.w - 2 * P + 40, meB.h + 40, `<rect x="0" y="0" width="${bx.w - 2 * P + 40}" height="${meB.h + 40}" rx="28" fill="none" stroke="${C.accent}" stroke-width="8" pathLength="1" stroke-dasharray="1" stroke-dashoffset="1"/>`, { left: px(P - 20), top: px(meB.y - 20) });
    co = $('div', 'callout rd sz', cam, null, sp.foundLabel ? tx(sp.foundLabel).m : LB('✓ That’s you', '✓ Ese eres tú'));
    if (co.textContent.includes('\n')) co.style.whiteSpace = 'pre';   // a "\n" in foundLabel breaks the callout into lines (default: one line)
    const cy = top + meB.y - 20 - co.offsetHeight * .55; place(co, bx.x + bx.w - co.offsetWidth - 10, cl(cy, S.y, S.y + S.h - co.offsetHeight)); co.style.transformOrigin = '100% 50%';   // straddles the ring's top edge
    ctx.cues.push({ t: tFocus, s: 'ding', g: .8 }); ctx.punch.push(tFocus);
  }
  if (miss) { ctx.cues.push({ t: tFocus, s: 'nope', g: .8 }); ctx.punch.push(tFocus); }
  ctx.ready = tFocus + .45;
  return lt => {
    if (hd.g) revLines(hd.g.lines, lt, .05);
    const p = spr(lt, 1.1, .72); card.style.transform = `translateY(${((1 - p) * 240).toFixed(1)}px) scale(${lerp(.94, 1, p).toFixed(4)})`; card.style.opacity = cl(lt / .12 + .001).toFixed(3);
    const nch = cl(Math.floor((lt - tType) * rate) + 1, 0, query.length); qs.textContent = query.slice(0, nch);
    caret.style.opacity = (lt < tEnter ? (Math.floor(lt * 2.4) % 2 === 0 || nch < query.length ? 1 : 0) : 0);
    bar.style.borderColor = lt > tEnter && lt < tEnter + .3 ? '#999' : '#dcdcdc';
    blocks.forEach((b, i) => { const tau = lt - tRes - i * .12, pp = E.o5(pr(tau, 0, .45)); b.el.style.opacity = pp.toFixed(3); b.el.style.transform = `translateY(${((1 - pp) * 40).toFixed(1)}px)`; });
    if (ring) ring.querySelector('rect').setAttribute('stroke-dashoffset', (1 - E.o3(pr(lt, tFocus, .45))).toFixed(3));
    if (co) popIn(co, lt - tFocus - .15, .5, 2.2, .5);
    if (miss) popIn(miss, lt - tFocus, .8, 2, .5);
  };
};

// DM thread: bubbles one by one, typing dots before the other side's messages, auto-scroll
SC.chat = (cam, sp, ctx) => {
  // optional headline above the thread (sp.head): opens a reel ON the chat with the hook line already landing on frame 0
  const bx0 = ctx.box; const hdT = headTop(cam, sp.head, bx0, { h: 330, max: sp.headSize || 120 });
  const bx = hdT.h ? { ...bx0, y: bx0.y + hdT.h + 56, h: bx0.h - hdT.h - 56 } : bx0; const name = tx(sp.name).m || 'Customer';
  const hdT0 = ctx.i === 0 ? -.25 : .05; if (hdT.h) { ctx.cues.push({ t: Math.max(.02, hdT0), s: 'hit', g: .55 }); ctx.punch.push(Math.max(.02, hdT0)); }
  const head = $('div', 'abs sz', cam, { left: px(bx.x), top: px(bx.y), width: px(bx.w), height: '140px', borderBottom: '2px solid #262626' });
  const av = $('div', 'av', head, { position: 'absolute', left: 0, top: '10px', width: '104px', height: '104px', fontSize: '40px' });
  if (sp.avatar && IMG[sp.avatar]) { const im = $('img', null, av); im.src = sp.avatar; } else av.textContent = (name.match(/(?<![\p{L}\p{N}])[\p{L}\p{N}]/gu) || ['?']).slice(0, 2).join('').toUpperCase();
  $('div', 'abs rd', head, { left: '132px', top: '14px', right: 0, font: '700 50px/1.1 I', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }, name);
  $('div', 'abs', head, { left: '132px', top: '76px', font: '500 32px/1.1 I', color: '#8a8a8a' }, tx(sp.status).m || LB('Active now', 'Activo ahora'));
  const areaTop = bx.y + 170, areaH = bx.h - 170;
  const area = $('div', 'abs sz', cam, { left: px(bx.x), top: px(areaTop), width: px(bx.w), height: px(areaH), overflow: 'hidden' });
  const col = $('div', 'abs', area, { left: 0, top: 0, width: px(bx.w) });
  const msgs = sp.messages || []; const n = msgs.length;
  let y = 0, prev = null; const items = [];
  // optional sp.size = bubble font px (default 54): padding, radius, gaps and the typing dots scale with it
  const k = sp.size ? cl(sp.size / 54, .8, 1.6) : 1;
  const typing = $('div', 'typing', col, { opacity: 0 }); [0, 1, 2].forEach(i => $('i', null, typing, { left: px((34 + i * 32) * k) }));
  if (k !== 1) { Object.assign(typing.style, { width: px(170 * k), height: px(110 * k), borderRadius: px(50 * k), borderBottomLeftRadius: px(14 * k) }); [...typing.children].forEach(d => Object.assign(d.style, { top: px(46 * k), width: px(18 * k), height: px(18 * k) })); }
  msgs.forEach((m, i) => {
    const me = m.from === 'me', t = tx(m.text);
    const b = $('div', 'bubble rd ' + (me ? 'me' : 'them'), col);
    if (k !== 1) { Object.assign(b.style, { fontSize: px(54 * k), padding: `${px(30 * k)} ${px(40 * k)} ${px(31 * k)}`, borderRadius: px(50 * k), maxWidth: px(Math.min(bx.w - 40, 800 * k)) }); b.style[me ? 'borderBottomRightRadius' : 'borderBottomLeftRadius'] = px(14 * k); }
    // optional link preview card on top of the bubble: preview {image, top? (css px of a 390-wide page to start the crop at),
    // title, url?, w? (600), h? (315)} — images under /demo/ get a DEMO tag
    if (m.preview && m.preview.image) {
      const pv = m.preview, pw = pv.w || 600, ph = pv.h || 315, sc = pw / (pv.cssWidth || 390);
      const card = $('div', 'ui', b, { width: px(pw), margin: '-12px -22px 24px', borderRadius: '30px', overflow: 'hidden', background: me ? '#ececec' : '#1b1b1b' });
      const fr = $('div', null, card, { position: 'relative', height: px(ph), overflow: 'hidden', background: '#111' });
      const im = $('img', null, fr, { position: 'absolute', left: 0, top: px(-(pv.top || 0) * sc), width: px(pw), maxWidth: 'none' }); im.src = pv.image;
      if (pv.demo ?? isDemo(pv.image)) $('div', 'demo', fr, { left: '16px', bottom: '16px' }, 'DEMO');
      if (pv.title) $('div', null, card, { font: '700 44px/1.18 I', padding: '20px 26px 4px', color: me ? '#111' : '#fff', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }, tx(pv.title).m);
      if (pv.url) $('div', null, card, { font: '500 34px/1.2 I', padding: '2px 26px 22px', color: me ? '#6b6b6b' : '#9a9a9a', whiteSpace: 'nowrap' }, tx(pv.url).m);
      else card.lastChild.style.paddingBottom = '22px';
    }
    $('span', null, b, null, t.m); if (t.s) { const es = $('span', 'es', b, null, t.s); if (k !== 1) es.style.fontSize = px(46 * k); }
    if (prev !== null) y += (prev === me ? 16 : 40) * k;
    b.style.top = px(y); if (me) { b.style.right = '0px'; b.style.left = 'auto'; } else b.style.left = '0px'; b.style.transformOrigin = me ? '100% 100%' : '0 100%';
    items.push({ b, me, y, h: b.offsetHeight }); y += b.offsetHeight; prev = me;
  });
  const shift = Math.max(0, (areaH - y) * .3); if (shift) items.forEach(it => { it.y += shift; it.b.style.top = px(it.y); });
  // timing: given t, or spread over the scene
  const t0 = .3, gapT = n > 1 ? cl((sp.dur - 1.05 - t0 - .35) / (n - 1), .5, 1.6) : 0;
  items.forEach((it, i) => { it.t = msgs[i].t ?? (t0 + i * gapT + (msgs[i].from === 'me' ? 0 : .35)); ctx.cues.push({ t: it.t, s: it.me ? 'send' : 'recv', g: .8 }); });
  ctx.ready = (items.length ? items[items.length - 1].t : 0) + .5;
  const scrollAt = lt => { let target = 0; items.forEach(it => { if (lt >= it.t) target = Math.max(target, it.y + it.h - areaH + 30); }); return Math.max(0, target); };
  return lt => {
    if (hdT.g) revLines(hdT.g.lines, lt, hdT0, .08, .6);
    const hp = E.o5(pr(lt, hdT.h ? hdT0 : 0, .5)); head.style.opacity = hp.toFixed(3); head.style.transform = `translateY(${((1 - hp) * -30).toFixed(1)}px)`;
    // smooth scroll: ease toward the target of each message over .35 s
    let off = 0; let prevT = 0; let prevV = 0;
    items.forEach(it => { if (lt >= it.t) { const v = Math.max(0, it.y + it.h - areaH + 30); off = lerp(prevV, Math.max(prevV, v), E.o3(pr(lt, it.t, .35))); prevV = Math.max(prevV, v); prevT = it.t; } });
    col.style.transform = `translateY(${(-off).toFixed(1)}px)`;
    // optional sp.fadeTop: once the thread scrolls, older bubbles fade out under the header instead of a hard clip
    if (sp.fadeTop) { const f = Math.min(110, off * 1.4); area.style.webkitMaskImage = area.style.maskImage = f > 1 ? `linear-gradient(to bottom, transparent 0, #000 ${f.toFixed(0)}px)` : 'none'; }
    let ty = null;
    items.forEach((it, i) => {
      const tau = lt - it.t; const p = spr(tau, 2, .62);
      it.b.style.opacity = cl(tau / .06).toFixed(3);
      it.b.style.transform = tau <= 0 ? 'scale(.5)' : `translateY(${((1 - p) * 30).toFixed(1)}px) scale(${lerp(.5, 1, p).toFixed(4)})`;
      if (!it.me && tau < 0 && tau > -.75) ty = it;
    });
    if (ty) { typing.style.top = px(ty.y + ty.h - 96 * k); typing.style.opacity = 1; [...typing.children].forEach((d, j) => d.style.transform = `translateY(${(-10 * k * Math.max(0, Math.sin(lt * 9 - j * .9))).toFixed(1)}px)`); }
    else typing.style.opacity = 0;
  };
};

SC.stat = (cam, sp, ctx) => {
  const bx = ctx.box; if (!sp.source) warn('source', 'stat needs a source');
  const hd = headTop(cam, sp.head, bx, { h: 230, max: 92 });
  const val = +sp.value || 0, dec = sp.decimals ?? (String(sp.value).split('.')[1] || '').length;
  const fmt = v => (sp.prefix || '') + v.toLocaleString('en-US', { minimumFractionDigits: dec, maximumFractionDigits: dec }) + (sp.suffix || '');
  const final = fmt(val);
  const top = bx.y + hd.h + (hd.h ? 50 : 0), avail = bx.h - (top - bx.y);
  const num = $('div', 'abs rd sz mono', cam, { font: '800 300px/0.92 M', letterSpacing: '-.03em', whiteSpace: 'nowrap', left: px(bx.x) });
  // fixed-width cells so the number never jitters while it counts
  const cells = [...final].map(ch => $('span', 'dig', num, null, ch));
  let fs = sp.size || 330; const fitN = () => { num.style.fontSize = fs + 'px'; return num.scrollWidth <= bx.w && num.offsetHeight <= avail * .45; }; while (!fitN() && fs > 120) fs -= 6;
  const dw = Math.max(...'0123456789'.split('').map(d => { cells[0].textContent = d; return cells[0].offsetWidth; })); cells[0].textContent = final[0];
  cells.forEach((c, i) => { if (/\d/.test(final[i])) c.style.width = px(dw); });
  const nh = num.offsetHeight;
  const bar = $('div', 'abs', cam, { left: px(bx.x), height: '16px', width: px(Math.min(bx.w, num.offsetWidth)), background: C.accent, borderRadius: '8px', transformOrigin: '0 50%' });
  const lab = dual(cam, sp.label, { font: 'I', weight: 700, w: bx.w, h: avail * .3, max: 70, min: 44, upper: false });
  const src = sp.source ? block(cam, (C.lang === 'es' ? 'Fuente: ' : 'Source: ') + tx(sp.source).m, { font: 'I', weight: 500, w: bx.w, h: 150, max: 44, min: 44, upper: false, color: '#8f8f8f' }) : null;
  const total = nh + 40 + lab.h + (src ? 50 + src.h : 0), y0 = top + Math.max(0, (avail - total) * .38);
  place(num, bx.x, y0); place(bar, bx.x, y0 + nh + 6); lab.at(bx.x, y0 + nh + 44); if (src) src.at(bx.x, y0 + nh + 44 + lab.h + 50);
  const tc = .2, tl = tc + cl(sp.dur * .3, .55, 1.5);
  for (let k = 0; k < 14; k++) { const f = k / 14; ctx.cues.push({ t: tc + (tl - tc) * (1 - Math.pow(1 - f, .5)), s: 'tick', g: .35, p: 1 + f * .4 }); }
  ctx.cues.push({ t: tl, s: 'hit', g: .9 }); ctx.punch.push(tl); ctx.ready = tl + (src ? .75 : .5);
  return lt => {
    if (hd.g) revLines(hd.g.lines, lt, .05);
    const f = E.o5(pr(lt, tc, tl - tc)); const s = fmt(dec ? +(val * f).toFixed(dec) : Math.round(val * f));
    const chars = [...s.padStart(final.length, ' ')]; cells.forEach((c, i) => { c.textContent = chars[i] === ' ' ? '' : chars[i]; });
    num.style.opacity = cl((lt - .1) / .2).toFixed(3);
    const land = kick(lt - tl, 7); num.style.transform = `scale(${(1 + .06 * land).toFixed(4)})`; num.style.transformOrigin = '0 60%';
    bar.style.transform = `scaleX(${E.o5(pr(lt, tl, .5)).toFixed(4)})`;
    revLines(lab.lines, lt, tl + .08, .06, .5);
    if (src) fadeUp(src.el, lt, tl + .3, .45, 16);
  };
};

SC.timer = (cam, sp, ctx) => {
  const bx = ctx.box; const hd = headTop(cam, sp.head, bx, { h: 230, max: 100 });
  const top = bx.y + hd.h + (hd.h ? 40 : 0), avail = bx.h - (top - bx.y);
  const R = Math.min(330, (avail - 240) / 2), D = 2 * R + 40;
  const wrap = $('div', 'abs sz', cam, { left: px(bx.x + (bx.w - D) / 2), top: px(top + 10), width: px(D), height: px(D) });
  const s = svg(wrap, D, D, `<circle cx="${D / 2}" cy="${D / 2}" r="${R}" fill="none" stroke="#232323" stroke-width="26"/><circle class="pg" cx="${D / 2}" cy="${D / 2}" r="${R}" fill="none" stroke="${C.accent}" stroke-width="26" stroke-linecap="round" pathLength="1" stroke-dasharray="1" stroke-dashoffset="1" transform="rotate(-90 ${D / 2} ${D / 2})"/>`, { left: 0, top: 0 });
  const pg = s.querySelector('.pg');
  const from = (sp.from ?? sp.hours ?? 48) * 3600, to = (sp.to ?? 0) * 3600;
  const fmt = v => { v = Math.max(0, Math.round(v)); const h = Math.floor(v / 3600), m = Math.floor(v % 3600 / 60), ss = v % 60; return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(ss).padStart(2, '0')}`; };
  const num = $('div', 'abs rd mono', wrap, { font: '800 120px/1 M', letterSpacing: '-.02em', whiteSpace: 'nowrap' });
  const cells = [...fmt(Math.max(from, to))].map(c => $('span', 'dig', num, null, c));
  let fs = 150; const fitN = () => { num.style.fontSize = fs + 'px'; return num.offsetWidth <= 2 * R * .86; };
  const dw = () => Math.max(...'0123456789'.split('').map(d => { cells[0].textContent = d; return cells[0].offsetWidth; }));
  while (!fitN() && fs > 60) fs -= 4;
  const w0 = dw(); cells.forEach(c => { if (c.textContent !== ':') c.style.width = px(w0); }); cells[0].textContent = fmt(from)[0];
  place(num, (D - num.offsetWidth) / 2, D / 2 - num.offsetHeight / 2 - 10);
  const unit = $('div', 'abs rd', wrap, { font: '600 44px/1 I', color: '#9a9a9a', width: px(D), textAlign: 'center', top: px(D / 2 + num.offsetHeight / 2 + 4), letterSpacing: '.08em', textTransform: 'uppercase' }, sp.unitLabel ? tx(sp.unitLabel).m : LB('hours', 'horas'));
  const lab = dual(cam, sp.label, { font: 'M', w: bx.w, h: Math.max(110, avail - D - 60), max: 96, min: 52, align: 'center' });
  lab.at(bx.x, top + D + 50);
  const done = chip(cam, sp.endLabel ? tx(sp.endLabel).m : LB('✓ LIVE', '✓ EN VIVO'), 'acc'); done.style.font = '800 92px/1 M'; done.style.padding = '26px 46px 22px'; done.style.letterSpacing = '0';
  while (done.offsetWidth > 2 * R * .9 && parseFloat(done.style.fontSize || 92) > 48) done.style.fontSize = (parseFloat(getComputedStyle(done).fontSize) - 4) + 'px';
  place(done, bx.x + (bx.w - done.offsetWidth) / 2, top + 10 + D / 2 - done.offsetHeight / 2);
  const tS = .35, tE = Math.max(tS + .6, Math.min(sp.dur - 1, tS + sp.dur * .6));
  for (let t = tS; t < tE; t += B / 2) ctx.cues.push({ t, s: 'tick', g: .5, p: Math.round((t - tS) / (B / 2)) % 2 ? .82 : 1 });
  ctx.cues.push({ t: tE, s: 'ding', g: .9 }); ctx.punch.push(tE); ctx.ready = tE + .4;
  return lt => {
    if (hd.g) revLines(hd.g.lines, lt, .05);
    const p = spr(lt, 1.2, .7); wrap.style.transform = `scale(${lerp(.8, 1, p).toFixed(4)}) rotate(${((1 - p) * -30).toFixed(2)}deg)`; wrap.style.opacity = cl(lt / .15 + .001).toFixed(3);
    const f = E.io3(pr(lt, tS, tE - tS)); const v = lerp(from, to, f);
    const str = fmt(v); cells.forEach((c, i) => c.textContent = str[i] ?? '');
    pg.setAttribute('stroke-dashoffset', (lt < tS ? 1 - E.o3(pr(lt, 0, tS)) : f).toFixed(4));
    if (lt >= tE) pg.setAttribute('stroke-dashoffset', (1 - E.o5(pr(lt, tE, .4))).toFixed(4));
    const land = kick(lt - tE, 6); num.style.transform = `scale(${(1 + .08 * land).toFixed(4)})`;
    num.style.opacity = unit.style.opacity = (lt >= tE ? 1 - pr(lt, tE, .2) : 1).toFixed(3);
    popIn(done, lt - tE - .05, .4, 2.2, .45);
    revLines(lab.lines, lt, .2, .08);
  };
};

SC.quote = (cam, sp, ctx) => {
  const bx = ctx.box;
  const mark = $('div', 'abs', cam, { font: '800 380px/1 M', color: 'transparent', WebkitTextStroke: '6px #fff', left: px(bx.x - 6), top: px(bx.y + 10), height: '230px', overflow: 'visible' }, '“');
  const by = sp.by ? block(cam, '— ' + tx(sp.by).m, { font: 'I', weight: 500, w: bx.w, h: 130, max: 48, min: 44, upper: false, color: '#9a9a9a' }) : null;
  const q = dual(cam, sp.text, { font: 'I', weight: 800, w: bx.w, h: bx.h - 300 - (by ? by.h + 50 : 0), max: 112, min: 48, upper: false, ls: '-.025em', lh: 1.1 });
  const total = q.h + (by ? 50 + by.h : 0), y0 = bx.y + 260 + Math.max(0, (bx.h - 260 - total) * .3);
  ctx.ready = .2 + q.lines.length * .08 + .6;
  q.at(bx.x, y0); if (by) by.at(bx.x, y0 + q.h + 50);
  ctx.cues.push({ t: .05, s: 'hit', g: .5 }); ctx.punch.push(.05);
  return lt => {
    const p = spr(lt, 1.6, .5); mark.style.opacity = cl(lt / .08 + .001).toFixed(3); mark.style.transform = `translateY(${((1 - p) * -120).toFixed(1)}px) rotate(${((1 - p) * -12).toFixed(2)}deg)`;
    revLines(q.lines, lt, .15, .08, .6);
    if (by) fadeUp(by.el, lt, .2 + q.lines.length * .08 + .25, .45, 20);
  };
};

// "POV: …" caption box on top, any other scene underneath (its props in sp.scene)
SC.pov = (cam, sp, ctx) => {
  const bx = ctx.box; const t = tx(sp.text); let main = t.m; if (!/^pov\b/i.test(main)) main = 'POV: ' + main;
  const boxEl = $('div', 'abs sz', cam, { left: px(bx.x), top: px(bx.y), width: px(bx.w), background: '#fff', borderRadius: '30px', padding: '30px 38px 32px', boxShadow: '0 20px 50px rgba(0,0,0,.5)' });
  const b = block(boxEl, main.replace(/^pov:?\s*/i, '==POV:== '), { font: 'I', weight: 800, w: bx.w - 76, h: 260, max: 64, min: 44, upper: false, color: '#050505', sz: false, ls: '-.015em', lh: 1.16 });
  b.el.style.position = 'relative';
  let s2 = null; if (t.s) { s2 = block(boxEl, t.s, { cls: 'es', font: 'I', weight: 500, w: bx.w - 76, h: 150, max: 46, min: 44, upper: false, color: '#555', sz: false }); s2.el.style.position = 'relative'; s2.el.style.marginTop = '10px'; }
  const bh = boxEl.offsetHeight;
  const inner = sp.scene || { type: 'text', head: '' };
  const sub = { ...ctx, box: { x: bx.x, y: bx.y + bh + 40, w: bx.w, h: bx.h - bh - 40 } };
  const up = (SC[inner.type] || SC.text)(cam, { ...inner, dur: sp.dur }, sub);
  ctx.ready = sub.ready;
  ctx.cues.push({ t: .02, s: 'pop', g: .7 });
  return lt => {
    const p = spr(lt, 2, .6); boxEl.style.opacity = cl(lt / .06 + .001).toFixed(3); boxEl.style.transformOrigin = '0 0'; boxEl.style.transform = `scale(${lerp(.7, 1, p).toFixed(4)}) rotate(${((1 - p) * -3).toFixed(2)}deg)`;
    revLines(b.lines, lt, .06, .05, .45); if (s2) revLines(s2.lines, lt, .25, .05, .45);
    up(lt);
  };
};

SC.end = (cam, sp, ctx) => {
  const bx = ctx.box;
  const logo = $('img', 'abs sz', cam); logo.src = C.assets.logo; const lw = Math.min(600, bx.w * .7), lh = lw * 575 / 896;
  const line = sp.line ? dual(cam, sp.line, { font: 'M', w: bx.w, h: 300, max: 92, min: 52, align: 'center' }) : null;
  const cta = $('div', 'abs rd sz', cam, { background: '#fff', color: '#050505', borderRadius: '999px', padding: '30px 58px 28px', font: '800 62px/1 M', whiteSpace: 'nowrap', letterSpacing: '.005em', boxShadow: '0 24px 60px rgba(0,0,0,.55)' }, sp.cta ? tx(sp.cta).m : LB('DM “WEBSITE”', 'ESCRÍBENOS “WEBSITE”'));
  let cf = 62; while (cta.offsetWidth > bx.w && cf > 44) { cf -= 2; cta.style.fontSize = cf + 'px'; }
  const offer = sp.offer ? block(cam, tx(sp.offer).m, { font: 'I', weight: 600, w: bx.w, h: 140, max: 48, min: 44, upper: false, align: 'center', color: '#d6d6d6' }) : null;
  const hand = $('div', 'abs rd sz', cam, { font: '600 48px/1 I', color: '#9a9a9a', width: px(bx.w), textAlign: 'center' }, sp.handle || '@dsmarketing.agency');
  const parts = [lh, 60, line ? line.h : 0, line ? 56 : 0, cta.offsetHeight, offer ? 40 + offer.h : 0, 56, hand.offsetHeight];
  const total = parts.reduce((a, b) => a + b, 0); let y = bx.y + Math.max(0, (bx.h - total) * .46);
  Object.assign(logo.style, { width: px(lw), height: px(lh), left: px(bx.x + (bx.w - lw) / 2), top: px(y) }); y += lh + 60;
  if (line) { line.at(bx.x, y); y += line.h + 56; }
  place(cta, bx.x + (bx.w - cta.offsetWidth) / 2, y); y += cta.offsetHeight;
  if (offer) { offer.at(bx.x, y + 40); y += 40 + offer.h; }
  place(hand, bx.x, y + 56);
  const tC = .35 + (line ? line.lines.length * .07 + .15 : 0), tTap = Math.max(tC + .7, sp.dur * .62);
  ctx.cues.push({ t: .05, s: 'hit', g: .8 }, { t: tC, s: 'ding', g: .8 }, { t: tTap, s: 'tap', g: .9 }); ctx.punch.push(.05, tC); ctx.ready = tC + .7;
  const ring = $('div', 'ring', cam, { width: '150px', height: '150px', left: px(bx.x + bx.w / 2 - 75 + cta.offsetWidth * .25), top: px(cta.offsetTop + cta.offsetHeight / 2 - 75), opacity: 0 });
  return lt => {
    const p = spr(lt, 1.3, .62); logo.style.opacity = cl(lt / .1 + .001).toFixed(3); logo.style.clipPath = `inset(${((1 - E.o5(pr(lt, 0, .55))) * 100).toFixed(2)}% 0 0 0)`; logo.style.transform = `scale(${lerp(1.18, 1, p).toFixed(4)})`;
    if (line) revLines(line.lines, lt, .22, .07, .5);
    const beatK = lt > tC + .4 ? kick(((lt - tC) % B), 8) : 0;
    popIn(cta, lt - tC, .5, 2.2, .5); if (lt > tC + .5) cta.style.transform = `scale(${(1 + .035 * beatK - .03 * kick(lt - tTap, 10)).toFixed(4)})`;
    const rt = lt - tTap; ring.style.opacity = rt < 0 || rt > .7 ? 0 : (1 - pr(rt, .12, .55)).toFixed(3); ring.style.transform = `scale(${lerp(.3, 1.9, E.o3(pr(rt, 0, .65))).toFixed(3)})`;
    if (offer) fadeUp(offer.el, lt, tC + .15, .45, 18);
    fadeUp(hand, lt, tC + .3, .45, 18);
  };
};

// ---------- build ----------
const DEF_BG = { hook: 'diag', text: 'right', list: 'left', checklist: 'left', mythfact: 'bottom', compare: 'top', phone: 'right', browser: 'bottom', profile: 'left', search: 'right', chat: 'left', stat: 'right', timer: 'bottom', quote: 'left', pov: 'right', end: 'right' };
// spec.counter (a running count across scenes, e.g. "🚩 red flags"): times are reel seconds or [scene, scene-local s];
// scenes it is on screen for (> .5 s, or the indexes in counter.reserve) get a box 172 px shorter on its side (top | bottom)
const CT = C.counter && typeof C.counter === 'object' ? C.counter : null;
const ctT = v => { if (v == null) return null; if (Array.isArray(v)) { const s = C.scenes[v[0]]; return s ? s.start + (+v[1] || 0) - Math.max(0, +s.pre || 0) : null; } return +v; };
const ctWin = CT ? [ctT(CT.from) ?? 0, ctT(CT.to) ?? C.T] : null, CT_H = 172, ctBottom = !!CT && CT.pos === 'bottom';
const ctReserve = i => { if (!CT || CT.reserve === false) return false; if (Array.isArray(CT.reserve)) return CT.reserve.includes(i); const s = C.scenes[i]; return Math.min(s.start + s.dur, ctWin[1]) - Math.max(s.start, ctWin[0]) > .5; };
const SCN = C.scenes.map((sp, i) => {
  CUR = i;
  const root = $('div', 'scene', stage); root.dataset.i = i; root.dataset.type = sp.type;
  const bg = $('div', 'bg', root); const cam = $('div', 'cam', root);
  const ctx = { i, dur: sp.dur, box: { ...S }, cues: [], punch: [] };
  if (ctReserve(i)) { if (!ctBottom) ctx.box.y += CT_H; ctx.box.h -= CT_H; }
  const bgUp = background(bg, sp.bg ?? (sp.type === 'pov' ? DEF_BG[(sp.scene || {}).type] || 'right' : DEF_BG[sp.type]), i + 3);
  let up = () => {};
  // optional scene-level source line (any type but stat, which draws its own): "Fuente: …" / "Source: …", small grey,
  // right under the scene's lowest element; the scene gets a shorter box so nothing can sit on it. Fades in at
  // sp.sourceAt (s) or the time the scene reports (ctx.srcAt: hook = after the sub, mythfact = after the flip), else .6 s
  let srcB = null;
  // (an array of sources → "Fuentes: a · b" / "Sources: a · b")
  if (sp.source && sp.type !== 'stat') { const many = Array.isArray(sp.source) && sp.source.length > 1; srcB = block(cam, (C.lang === 'es' ? (many ? 'Fuentes: ' : 'Fuente: ') : (many ? 'Sources: ' : 'Source: ')) + (Array.isArray(sp.source) ? sp.source.map(v => tx(v).m).join(' · ') : tx(sp.source).m), { font: 'I', weight: 500, w: S.w, h: 170, max: 44, min: 44, upper: false, color: '#8f8f8f', align: sp.align === 'center' ? 'center' : 'left' }); ctx.box.h -= srcB.h + 40; }
  try { up = (SC[sp.type] || SC.text)(cam, sp, ctx); } catch (e) { warn('error', `${sp.type}: ${e.message}`); }
  if (srcB) {
    let bot = ctx.box.y; cam.querySelectorAll('.sz').forEach(e => { if (e === srcB.el || srcB.el.contains(e)) return; const r = e.getBoundingClientRect(); if (r.height) bot = Math.max(bot, r.bottom); });
    srcB.at(S.x, Math.min(S.y + S.h - srcB.h, bot + 36));
    // ==words== inside a source line wipe on at sp.sourceHlAt (s), else .5 s after the line fades in
    const ts = sp.sourceAt ?? ctx.srcAt ?? .6, tHl = sp.sourceHlAt ?? ts + .5, hlW = [...srcB.el.querySelectorAll('.w.hl')], u0 = up;
    // opt-in sp.sourcePunch: the source highlight is a beat of its own (camera punch + a soft pop) — breaks up a long reading hold
    if (sp.sourcePunch && hlW.length) { ctx.cues.push({ t: tHl, s: 'pop', g: .45 }); ctx.punch.push(tHl); }
    up = lt => { u0(lt); fadeUp(srcB.el, lt, ts, .45, 16); hlW.forEach((w, i) => { const q = E.o3(pr(lt, tHl + i * .06, .35)); w.style.setProperty('--hp', q.toFixed(3)); w.style.color = q < .3 ? 'inherit' : ''; }); };   // grey until the bar reaches it
  }
  { const words = [...root.querySelectorAll('.rd')].filter(e => !e.closest('.es') && !e.closest('.ui') && !e.closest('.url') && !e.querySelector('.rd')).reduce((a, e) => a + (e.textContent.match(/[\p{L}\p{N}$'’]+/gu) || []).length, 0);
    const need = words / 4.5 + .5; if (sp.type !== 'end' && words > 4 && sp.dur < need) warn('read', `${words} words on screen for ${sp.dur.toFixed(2)} s — about ${need.toFixed(1)} s needed (≈ 4.5 words/s); add beats or cut words`); }
  // pre: the scene's own clock starts pre s in (its entrance is already under way on its first frame — use it on a
  // first scene so frame 0 is never empty); cue times and the pace lint follow that clock
  const pre = Math.max(0, +sp.pre || 0);
  if (ctx.ready != null && sp.dur + pre - ctx.ready < .5) warn('pace', `the last element lands ${(sp.dur + pre - ctx.ready).toFixed(2)} s before the cut (needs ≥ .5 s to read) — add beats`);
  return { i, sp, root, cam, bgUp, up, ctx, pre, start: sp.start, end: sp.start + sp.dur, tin: sp.tin || 0, tr: sp.tr || 'cut' };
});
// lint: static layout (no transforms yet) — everything readable ≥ 44 px, every key element inside the safe zone
SCN.forEach(s => {
  CUR = s.i;
  s.root.querySelectorAll('.rd').forEach(e => {
    const fs = parseFloat(getComputedStyle(e).fontSize); const sc = e.offsetWidth ? e.getBoundingClientRect().width / e.offsetWidth : 1;
    if (fs * sc < 43.5 && (e.textContent || '').trim()) warn('small', `${Math.round(fs * sc)}px text: "${e.textContent.trim().slice(0, 40)}"`);
  });
  s.root.querySelectorAll('.sz').forEach(e => {
    const r = e.getBoundingClientRect(); if (!r.width || !r.height) return;
    const o = [S.x - r.left, r.right - (S.x + S.w), S.y - r.top, r.bottom - (S.y + S.h)];
    if (Math.max(...o) > 3) warn('safe', `${e.className.split(' ')[0]} "${(e.textContent || '').trim().slice(0, 30)}" outside the safe zone by ${Math.round(Math.max(...o))}px (${Math.round(r.left)},${Math.round(r.top)} ${Math.round(r.width)}×${Math.round(r.height)})`);
  });
});
// wipe edge (light torn-paper strip between the two scenes)
const tear = $('div', 'abs', stage, { inset: 0, background: '#d4d4d4', zIndex: 30, display: 'none' });
const jag = seed => { const r = rng(seed); const a = []; let v = 0; for (let y = -20; y <= H + 40; y += 14 + r() * 18) { v += (r() - .5) * 26 - v * .2; if (r() < .07) v += (r() - .5) * 50; a.push([v, y]); } return a; };
SCN.forEach(s => { s.jagA = jag(s.i * 31 + 7); s.jagB = jag(s.i * 31 + 19); });
const poly = (j, x, off = 0) => `polygon(${W + 400}px -40px, ${j.map(([v, y]) => `${(x + v - off).toFixed(1)}px ${y.toFixed(1)}px`).join(', ')}, ${W + 400}px ${H + 60}px)`;

// grain + vignette + QA overlay
const gc = document.createElement('canvas'); gc.width = gc.height = 256; const gx = gc.getContext('2d'); const gd = gx.createImageData(256, 256); const gr = rng(99);
for (let i = 0; i < gd.data.length; i += 4) { const v = gr() * 255; gd.data[i] = gd.data[i + 1] = gd.data[i + 2] = v; gd.data[i + 3] = 255; }
gx.putImageData(gd, 0, 0);
$('div', null, stage, null).id = 'vig';
const grain = $('div', null, stage, { backgroundImage: `url(${gc.toDataURL()})` }); grain.id = 'grain';
const safe = $('div', null, stage); safe.id = 'safe';
safe.innerHTML = `<div class="z" style="left:0;top:0;width:1080px;height:220px">HEADER</div><div class="z" style="left:0;top:1500px;width:1080px;height:420px">CAPTION · AUDIO</div><div class="z" style="left:940px;top:220px;width:140px;height:1280px;writing-mode:vertical-rl">BUTTONS</div><div class="box"></div>`
  + [1040, 1170, 1300, 1430].map(y => `<div class="ic" style="top:${y}px"></div>`).join('') + [1560, 1610, 1660].map((y, i) => `<div class="cap" style="top:${y}px;width:${[420, 760, 560][i]}px"></div>`).join('');
if (C.showSafe) safe.style.display = 'block';

// running counter overlay (spec.counter): {label ("🚩 Red flags"), sub? ("Comment your number"), start? (0), from, to,
// ticks: [t | [scene, s], …], pos? (top | bottom), reserve?} — a dark pill above every scene (it stays put through the
// transitions): an accent badge with the count that rolls up on each tick (pop, ring, wiggle, a rising `ding`), the label
// and a grey second line. Pops in at `from`, shrinks away at `to`.
const ctCues = []; let ctUp = null;
if (CT) {
  CUR = -1;
  const el = $('div', 'abs', stage, { left: px(S.x), top: px(ctBottom ? S.y + S.h - 128 : S.y + 4), height: '124px', zIndex: 45, display: 'flex', alignItems: 'center', gap: '24px', padding: '10px 38px 10px 10px', borderRadius: '999px', background: 'rgba(14,14,14,.95)', boxShadow: '0 18px 44px rgba(0,0,0,.6), inset 0 0 0 3px rgba(255,255,255,.2)', transformOrigin: '62px 50%', whiteSpace: 'nowrap' });
  const badge = $('div', null, el, { position: 'relative', width: '104px', height: '104px', borderRadius: '50%', background: C.accent, overflow: 'hidden', flex: 'none' });
  const num = () => $('div', 'abs', badge, { left: 0, top: 0, width: '104px', height: '104px', font: '800 64px/104px M', color: '#050505', textAlign: 'center', letterSpacing: '-.03em' });
  const prev = num(), cur = num();
  const ring = $('div', 'abs', stage, { width: '104px', height: '104px', borderRadius: '50%', border: `6px solid ${C.accent}`, zIndex: 46, opacity: 0, pointerEvents: 'none' });
  const col = $('div', null, el, { display: 'flex', flexDirection: 'column', gap: '6px' });
  const lab = $('div', null, col, { font: '800 50px/1.02 M', textTransform: 'uppercase', letterSpacing: '-.01em', color: '#fff' }, tx(CT.label || 'Count').m);
  const sub = CT.sub ? $('div', null, col, { font: '600 44px/1.05 I', color: '#b7b7b7' }, tx(CT.sub).m) : null;
  for (let f = 50; el.offsetWidth > S.w && f > 44; f -= 2) lab.style.fontSize = f + 'px';
  if (el.offsetWidth > S.w) warn('overflow', `counter pill ${el.offsetWidth} px wider than the safe zone`);
  place(ring, S.x + 10, el.offsetTop + 10);
  const ticks = (CT.ticks || []).map(ctT).filter(v => v != null).sort((a, b) => a - b), base = +CT.start || 0, [ta, tz] = ctWin;
  ctCues.push({ t: ta, s: 'pop', g: .6 }); ticks.forEach((t, i) => ctCues.push({ t, s: 'ding', g: .6, p: 1 + i * .06 }));
  ctUp = t => {
    if (t < ta || t > tz + .32) { el.style.display = 'none'; ring.style.opacity = 0; return; }
    el.style.display = 'flex';
    let k = 0; ticks.forEach(x => { if (t >= x) k++; });
    const tau = k ? t - ticks[k - 1] : 1e9, q = k ? E.o5(pr(tau, 0, .3)) : 1, kk = k ? kick(tau, 7) : 0;
    cur.textContent = String(base + k); prev.textContent = String(base + k - 1);
    const fz = String(base + k).length > 1 ? '50px' : '64px'; cur.style.fontSize = fz; prev.style.fontSize = String(base + k - 1).length > 1 ? '50px' : '64px';
    cur.style.transform = q >= 1 ? '' : `translateY(${((1 - q) * 100).toFixed(1)}%)`;
    prev.style.transform = `translateY(${(-q * 100).toFixed(1)}%)`; prev.style.visibility = k && q < 1 ? 'visible' : 'hidden';
    badge.style.transform = `scale(${(1 + .3 * kk).toFixed(4)})`;
    const ro = k && tau < .6 ? 1 - pr(tau, .1, .5) : 0; ring.style.opacity = ro.toFixed(3); ring.style.transform = `scale(${lerp(1, 1.8, E.o3(pr(tau, 0, .6))).toFixed(3)})`;
    const pin = spr(t - ta, 2, .6), out = E.i3(pr(t, tz, .3)), wig = k ? Math.exp(-tau * 6) * Math.sin(tau * 30) * 3.5 : 0;
    el.style.opacity = (cl((t - ta) / .08) * (1 - out)).toFixed(3);
    el.style.transform = `scale(${(lerp(.55, 1, pin) * (1 - .3 * out) * (1 + .04 * kk)).toFixed(4)}) rotate(${wig.toFixed(2)}deg)`;
    if (out > 0) ring.style.opacity = 0;
  };
}

// ---------- frame ----------
const reset = s => { const r = s.root.style; r.transform = ''; r.filter = ''; r.opacity = ''; r.clipPath = ''; r.zIndex = ''; };
window.at = t => {
  tear.style.display = 'none';
  if (ctUp) ctUp(t);
  const n = SCN.length;
  for (let i = 0; i < n; i++) {
    const s = SCN[i], nx = SCN[i + 1];
    const a = s.start, b = nx ? s.end + nx.tin : Infinity;          // a transition starts ON the beat and runs into the next scene
    const on = t >= a && t < b;
    s.root.style.display = on ? 'block' : 'none';
    if (!on) continue;
    reset(s);
    const lt = t - s.start + s.pre;
    s.bgUp(lt, s.sp.dur);
    s.up(lt);
    const pk = s.sp.punch === false ? 0 : s.ctx.punch.reduce((acc, p) => acc + kick(lt - p, 9), 0);
    s.cam.style.transform = `scale(${(1 + .012 * E.io3(cl(lt / s.sp.dur)) + .045 * Math.min(1.4, pk)).toFixed(5)})`;
    s.root.style.zIndex = i + 1;
  }
  // transitions start on each boundary (the beat) and last tin; the incoming scene's own entrance plays during it
  for (let i = 1; i < n; i++) {
    const A = SCN[i - 1], Bs = SCN[i], d = Bs.tin, T0 = Bs.start;
    if (Bs.tr === 'cut' || d <= 0) { const tau = t - T0; if (tau >= 0 && tau < .3) Bs.root.style.transform = `scale(${(1 + .07 * (1 - E.o3(tau / .3))).toFixed(4)})`; continue; }
    if (t < T0 || t >= T0 + d) continue;
    const p = cl((t - T0) / d), v = Math.sin(Math.PI * p);
    if (Bs.tr === 'whip') {
      const x = E.io3(p) * W * 1.08, sk = (-5 * v).toFixed(2), bl = v > .12 ? `blur(${(v * 11).toFixed(1)}px)` : '';
      A.root.style.transform = `translateX(${(-x).toFixed(1)}px) skewX(${sk}deg)`; Bs.root.style.transform = `translateX(${(W * 1.08 - x).toFixed(1)}px) skewX(${sk}deg)`;
      A.root.style.filter = Bs.root.style.filter = bl;
    } else if (Bs.tr === 'zoom') {
      const pa = pr(p, 0, .5), pb = pr(p, .3, .7);                      // zoom-through: A rushes at the camera, B arrives from close up
      A.root.style.transform = `scale(${(1 + 1.6 * E.i3(pa)).toFixed(4)})`; A.root.style.opacity = (1 - E.i2(pa)).toFixed(3); A.root.style.filter = pa > .05 && pa < 1 ? `blur(${(pa * 14).toFixed(1)}px)` : '';
      Bs.root.style.transform = `scale(${(1.45 - .45 * E.o5(pb)).toFixed(4)})`; Bs.root.style.opacity = E.o3(pr(p, .3, .3)).toFixed(3); Bs.root.style.filter = pb < .7 ? `blur(${((1 - pb / .7) * 12).toFixed(1)}px)` : '';
    } else {                                                          // wipe: torn-paper edge sweeps right → left
      const x = lerp(W + 120, -160, E.io3(p));
      Bs.root.style.clipPath = poly(Bs.jagA, x); Bs.root.style.zIndex = 40;
      tear.style.display = 'block'; tear.style.clipPath = poly(Bs.jagB, x, 18); tear.style.zIndex = 35;
      A.root.style.transform = `translateX(${(-90 * E.io3(p)).toFixed(1)}px)`;
    }
  }
};                                                                   // grain stays still: moving noise would cost ~10× the bitrate
window.__info = () => ({
  cues: SCN.flatMap(s => s.ctx.cues.map(c => ({ ...c, t: +(s.start + c.t - s.pre).toFixed(4), scene: s.i }))).concat(ctCues).filter(c => c.t >= 0).sort((a, b) => a.t - b.t),
  warnings: WARN,
});
window.__safe = on => { safe.style.display = on ? 'block' : 'none'; };
})();
