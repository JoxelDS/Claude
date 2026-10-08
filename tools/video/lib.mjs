// System-tour recording engine: 1920×1080 stage page + the live app in an iframe,
// captured with CDP screencast (JPEG q92 per changed frame, wall-clock timestamps).
import { readFileSync, writeFileSync, existsSync, mkdirSync, rmSync } from 'fs';
import { chromium } from '/home/user/Claude/node_modules/playwright-core/index.mjs';
import * as S from './seed.mjs';

export const TR = new URL('.', import.meta.url).pathname.replace(/\/$/, '');
export const TOUR = TR;
const DIST = '/home/user/Claude/dist';
export const SCRIPT = JSON.parse(readFileSync(TOUR + '/script.json', 'utf8'));
export const BY = Object.fromEntries(SCRIPT.map((s, i) => [s.id, { ...s, n: i + 1 }]));
const CH_ORDER = [...new Set(SCRIPT.map(s => s.ch))];
const DURF = TOUR + '/durs.json';
export const DUR = existsSync(DURF) ? JSON.parse(readFileSync(DURF, 'utf8')) : Object.fromEntries(SCRIPT.map(s => [s.id, s.say.split(/\s+/).length / 2.55]));
export const LEAD = 0.5;   // narration starts this long after the scene starts
export const TAIL = 0.9;   // breathing room after the narration ends
export const W = ms => new Promise(r => setTimeout(r, ms));
const now = () => Date.now() / 1000;

const mime = p => p.endsWith('.html') ? 'text/html' : p.endsWith('.js') ? 'text/javascript' : p.endsWith('.css') ? 'text/css' : p.endsWith('.svg') ? 'image/svg+xml' : p.endsWith('.png') ? 'image/png' : p.endsWith('.json') ? 'application/json' : p.endsWith('.woff2') ? 'font/woff2' : p.endsWith('.webmanifest') ? 'application/manifest+json' : 'application/octet-stream';
export const route = r => {
  const u = new URL(r.request().url());
  // the app's Inter webfont, served from tools/video/fonts (Google is not reachable from the recorder)
  if (u.hostname === 'fonts.googleapis.com') return r.fulfill({ contentType: 'text/css', body: [400, 500, 600, 700, 800].map(w => `@font-face{font-family:'Inter';font-style:normal;font-weight:${w};font-display:swap;src:url(https://app.local/__tour/fonts/inter${w}.${w === 500 || w === 600 ? 'woff2' : 'ttf'})}`).join('') });
  if (u.hostname !== 'app.local') return r.abort();
  let f;
  if (u.pathname.startsWith('/__tour/fonts/')) { f = TR + '/fonts/' + u.pathname.slice(14); if (!existsSync(f)) f = TR + '/../../tools/video/fonts/' + u.pathname.slice(14); }
  else if (u.pathname.startsWith('/__tour/')) f = TOUR + '/' + u.pathname.slice(8);
  else { let p = u.pathname.replace(/^\/Claude/, '') || '/'; if (p === '/') p = '/index.html'; f = DIST + p; }
  if (existsSync(f)) r.fulfill({ body: readFileSync(f), contentType: mime(f) }); else r.fulfill({ status: 404, body: 'nf' });
};

// Runs in every frame before the app's own code.
export const initAll = () => {
  try { Object.defineProperty(Navigator.prototype, 'maxTouchPoints', { get: () => 5 }); } catch {}
  const N = function () {}; N.permission = 'granted'; N.requestPermission = () => Promise.resolve('granted');
  try { Object.defineProperty(window, 'Notification', { value: N, writable: true, configurable: true }); } catch {}
  if (!location.pathname.startsWith('/Claude')) return;
  const css = 'img[src*="sodexo"],#splash,#__sdx_shield,.swUpdateBanner,.swUpdatingStrip,.pinFooter,.foodSafetyRefBadge,.draftRestoredStrip,.draftListBar,.outboxChip{display:none!important} html:not(.tourLang) .langFabWrap{display:none!important}';
  const add = () => { const s = document.createElement('style'); s.textContent = css; (document.head || document.documentElement).appendChild(s); };
  if (document.documentElement) add(); else document.addEventListener('DOMContentLoaded', add);
  const fix = n => { if (n && n.nodeType === 3 && /sodexo/i.test(n.nodeValue)) n.nodeValue = n.nodeValue.replace(/Sodexo Live!?/gi, 'SDX Inspect').replace(/Sodexo/gi, 'SDX'); };
  const walk = root => { const w = document.createTreeWalker(root, 4); let t; while ((t = w.nextNode())) fix(t); };
  new MutationObserver(ms => { for (const m of ms) { if (m.type === 'characterData') fix(m.target); else m.addedNodes.forEach(n => n.nodeType === 3 ? fix(n) : n.nodeType === 1 && walk(n)); } })
    .observe(document, { subtree: true, childList: true, characterData: true });
};
export const seedFn = ([h, vs, us, rd, subs, extra, V = 'default', kreg = null]) => {
  if (!location.pathname.startsWith('/Claude') || localStorage.getItem('sdx_tour_seeded_' + V)) return;
  const set = (k, v) => localStorage.setItem(k, typeof v === 'string' ? v : JSON.stringify(v));
  set('sdx_force_local', '1'); set('sdx_history_cache_' + V, h); set('sdx_venue_settings_' + V, vs); set('sdx_users_' + V, us);
  if (kreg) set('sdx_kitchen_reg_doc_' + V, kreg);
  set('sdx_equip_reg_doc_' + V, rd); set('sdx_equip_registry_' + V, rd.items); set('sdx_haccp_subs_' + V, subs);
  set('sdx_msg_threads', []); set('sdx_walk_coach_seen', '1'); set('sdx_portal_lang', 'en');
  for (const [k, v] of Object.entries(extra || {})) set(k, v);
  set('sdx_tour_seeded_' + V, '1');
};

let browser, PICS;
export async function launch() {
  browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--no-sandbox', '--no-proxy-server', '--force-color-profile=srgb', '--font-render-hinting=none'] });
  const c = await browser.newContext(); const p = await c.newPage();
  const pic = (label, color) => p.evaluate(([l, col]) => { const cv = document.createElement('canvas'); cv.width = 640; cv.height = 480; const g = cv.getContext('2d'); g.fillStyle = col; g.fillRect(0, 0, 640, 480); let seed = l.length * 97; const rnd = () => (seed = (seed * 9301 + 49297) % 233280) / 233280; g.fillStyle = 'rgba(255,255,255,.14)'; for (let i = 0; i < 12; i++) { g.beginPath(); g.arc(rnd() * 640, rnd() * 480, 30 + rnd() * 80, 0, 7); g.fill(); } g.fillStyle = '#fff'; g.font = 'bold 38px Arial'; g.textAlign = 'center'; g.fillText(l, 320, 250); return cv.toDataURL('image/jpeg', 0.7); }, [label, color]);
  PICS = { faucet: await pic('📷 leaking faucet', '#5b6b7a'), grease: await pic('📷 grease build-up', '#6b4e2e'), sanitizer: await pic('📷 empty dispenser', '#2e6b5a'), pest: await pic('📷 droppings', '#5a3a3a'), light: await pic('📷 light out', '#3a3a5a'), drain: await pic('📷 slow drain', '#3a5a6b'), cable: await pic('📷 chewed cable', '#4b4b4b'), floor: await pic('📷 dirty floor', '#6b5a3a'), after: await pic('✅ fixed', '#2f7d4f'), sink: await pic('📷 hand sink', '#4a6b8a') };
  await c.close();
  return { browser, PICS };
}
export const jpg = k => Buffer.from(PICS[k].split(',')[1], 'base64');
export const _state = () => ({ browser, PICS });
export async function close() { await browser.close(); }

/** Record one chapter: body(api) drives the stage + app; frames + timeline land in out/<name>/. */
export async function chapter(name, opts, body) {
  const OUT = `${TOUR}/out/${name}`; rmSync(OUT, { recursive: true, force: true }); mkdirSync(OUT + '/f', { recursive: true });
  const ctx = await browser.newContext({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1, hasTouch: true, locale: 'en-US', timezoneId: 'America/New_York', serviceWorkers: 'block' });
  await ctx.route('**/*', route);
  await ctx.addInitScript(initAll);
  const history = opts.history || S.buildHistory(PICS);
  await ctx.addInitScript(seedFn, [history, { ...S.venueSettings(), ...(opts.vs || {}) }, S.users, S.regdoc, S.haccpSubs(), opts.extra || {}, S.VENUE, S.kitchenReg]);
  if (opts.init) await ctx.addInitScript(opts.init.fn, opts.init.arg);
  const page = await ctx.newPage();
  const errs = []; page.on('pageerror', e => { if (!/ServiceWorker|serviceWorker/.test(e.message)) { errs.push(e.message); console.log('PAGEERR', e.message.slice(0, 200)); } });
  page.on('dialog', d => d.accept().catch(() => {}));
  await page.goto('https://app.local/__tour/stage.html'); await page.evaluate(() => document.fonts.ready); await W(300);
  await page.evaluate(() => { addEventListener('scroll', () => { if (scrollX || scrollY) scrollTo(0, 0); }); window.subsRun = list => { (window.__subT || []).forEach(clearTimeout); window.__subT = list.map(x => setTimeout(() => window.sub(x.text), x.ms)); }; });
  if (opts.card) await page.evaluate(([n, nm, ln]) => window.chapter(n, nm, ln), opts.card);
  // screencast
  const cdp = await ctx.newCDPSession(page); const frames = []; let fi = 0; let capturing = true;
  cdp.on('Page.screencastFrame', ev => { cdp.send('Page.screencastFrameAck', { sessionId: ev.sessionId }).catch(() => {}); if (!capturing) return; const f = `f/${String(++fi).padStart(6, '0')}.jpg`; writeFileSync(`${OUT}/${f}`, Buffer.from(ev.data, 'base64')); frames.push([f, ev.metadata.timestamp]); });
  await cdp.send('Page.startScreencast', { format: 'jpeg', quality: 92, maxWidth: 1920, maxHeight: 1080, everyNthFrame: 1 });
  const T0 = now(); const timeline = [];
  const appFrame = () => page.frames().find(f => /\/Claude\//.test(f.url()));
  const api = {
    page, ctx, errs,
    get F() { return appFrame(); },
    async open(url, settle = 2600) { await page.evaluate(u => window.app(u), url); await W(settle); },
    dev: kind => page.evaluate(k => window.dev(k), kind),
    tick: i => page.evaluate(n => window.tick(n), i),
    hidePanel: () => page.evaluate(() => window.hidePanel()),
    unchapter: () => page.evaluate(() => window.unchapter()),
    async chapterCard(no, nm, ln, ms = 2600) { await page.evaluate(([a, b, c]) => window.chapter(a, b, c), [no, nm, ln]); await W(ms); await page.evaluate(() => window.unchapter()); await W(500); },
    /** wait until fraction f of this scene's narration has been spoken */
    at: null,
    async scene(id, fn, { minLen = 0 } = {}) {
      const sc = BY[id]; const dur = DUR[id]; const t0 = now();
      timeline.push({ id, t: t0 - T0, dur });
      await page.evaluate(x => window.setScene(x), { n: sc.n, chNo: CH_ORDER.indexOf(sc.ch) + 1, ch: sc.ch, title: sc.title, how: sc.how });
      if (sc.dev === 'none') await page.evaluate(() => { setTimeout(() => window.hidePanel(), 300); });
      // subtitles: sentences (long ones split at a comma/colon), timed by length across the narration
      const parts = []; const cut = t => { if (t.length <= 118) { parts.push(t); return; } const mid = t.length / 2; let best = -1; for (let i = 0; i < t.length; i++) if ((t[i] === ',' || t[i] === ':') && t[i + 1] === ' ' && (best < 0 || Math.abs(i - mid) < Math.abs(best - mid))) best = i; if (best < 30 || best > t.length - 20) { best = t.lastIndexOf(' ', Math.round(mid) + 10); } cut(t.slice(0, best + 1).trim()); cut(t.slice(best + 1).trim()); };
      for (const s of sc.say.split(/(?<=[.!?])\s+/)) cut(s);
      const total = parts.reduce((a, p) => a + p.length, 0); let acc = 0;
      await page.evaluate(l => window.subsRun(l), parts.map(p => { const ms = (LEAD + dur * acc / total) * 1000; acc += p.length; return { ms, text: p }; }).concat([{ ms: (LEAD + dur + 0.35) * 1000, text: '' }]));
      api.at = async f => { const until = t0 + LEAD + dur * f; const d = until - now(); if (d > 0) await W(d * 1000); };
      if (fn) await fn(api);
      const end = t0 + Math.max(minLen, LEAD + dur + TAIL); const left = end - now();
      const over = -left; if (over > 0.3) console.log(`  ${id}: actions ran ${over.toFixed(1)} s past the narration`);
      if (left > 0) await W(left * 1000);
      timeline[timeline.length - 1].len = now() - t0;
    },
    // ---- app helpers (all coordinates are main-page coordinates; Playwright maps the scaled iframe) ----
    async find(sel, re, tries = 16) { for (let i = 0; i < tries; i++) { const F = appFrame(); if (F) for (const e of await F.$$(sel)) { const t = (await e.textContent().catch(() => '')) || ''; if ((!re || re.test(t)) && await e.isVisible().catch(() => false)) return e; } await W(250); } console.log('  MISSING', sel, re || ''); return null; },
    // scroll INSIDE the app only (scrollIntoView would also scroll the stage page around the iframe)
    async show(e, block = 'center') { if (!e) return; await e.evaluate((el, b) => { const r = el.getBoundingClientRect(); if (r.top >= 70 && r.bottom <= innerHeight - 20 && b !== 'start') return; el.scrollIntoView({ behavior: 'smooth', block: b === 'start' ? 'start' : 'center' }); }, block); await W(900); },
    async box(e) { return e ? await e.boundingBox() : null; },
    async point(e) { const b = await api.box(e); if (!b) return null; const x = b.x + b.width / 2, y = b.y + b.height / 2; await page.evaluate(([a, c]) => window.point(a, c), [x, y]); await W(520); return { x, y }; },
    async tap(sel, re, { settle = 900, label, show = true } = {}) {
      const e = typeof sel === 'string' ? await api.find(sel, re) : sel; if (!e) return null;
      if (show) await api.show(e);
      if (label) await api.hl(e, label);
      const p = await api.point(e); if (!p) return null;
      await page.evaluate(([a, c]) => window.tap(a, c), [p.x, p.y]); await W(120);
      await e.click({ timeout: 4000 }).catch(err => console.log('  click failed', String(err).slice(0, 120)));
      if (label) { await W(250); await api.unhl(); }
      await W(settle); return e;
    },
    async type(sel, text, { delay = 55, settle = 400 } = {}) { const e = typeof sel === 'string' ? await api.find(sel) : sel; if (!e) return null; await api.show(e); await api.point(e); await e.click().catch(() => {}); await e.type(text, { delay }); await W(settle); return e; },
    async hl(e, label, below) { const b = await api.box(e); if (b) await page.evaluate(([bb, l, bl]) => window.hl(bb, l, bl), [b, label || '', !!below]); },
    unhl: () => page.evaluate(() => window.unhl()),
    unpoint: () => page.evaluate(() => window.unpoint()),
    async scrollApp(dy, ms = 900) { const F = appFrame(); await F.evaluate(d => window.scrollBy({ top: d, behavior: 'smooth' }), dy); await W(ms); },
    async scrollTop() { const F = appFrame(); await F.evaluate(() => window.scrollTo({ top: 0, behavior: 'smooth' })); await W(700); },
    evalApp: (fn, arg) => appFrame().evaluate(fn, arg),
    async nav(pg, settle = 2200) { await appFrame().evaluate(p => window.dispatchEvent(new CustomEvent('sdx-nav', { detail: { page: p, clearFocus: true } })), pg); await W(settle); },
    async signIn(badge, { show = true } = {}) {
      const inp = await api.find('input'); if (!inp) return;
      if (show) { await api.type(inp, badge, { delay: 120 }); await api.tap('button', /Sign In/, { settle: 2200 }); }
      else { await inp.fill(badge); const b = await api.find('button', /Sign In/); await b.click(); await W(2200); }
      const ov = await api.find('div', /Tap here/, 4); if (ov) { await ov.click().catch(() => {}); await W(900); }
      for (let i = 0; i < 2; i++) { const e = await api.find('button', /All done for today/, 1); if (!e) break; await e.click(); await W(400); }
    },
    async shot(n) { await page.screenshot({ path: `${OUT}/${n}.png` }); },
  };
  try { await body(api); } catch (e) { console.log('CHAPTER ERROR', name, e.stack || e); errs.push(String(e)); }
  await W(400);
  capturing = false; await cdp.send('Page.stopScreencast').catch(() => {});
  const T1 = now();
  writeFileSync(`${OUT}/timeline.json`, JSON.stringify({ name, T0, T1, timeline, frames, errs }, null, 1));
  await ctx.close();
  console.log(`chapter ${name}: ${frames.length} frames, ${(T1 - T0).toFixed(1)} s, ${errs.length} errors`);
  return { OUT, T0, T1, timeline, frames };
}
