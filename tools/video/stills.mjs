// node stills.mjs → out/stills/*.png  clean app screenshots (demo data, no Sodexo branding) for the sales deck
import { mkdirSync } from 'fs';
import * as L from './lib.mjs';
import * as S from './seed.mjs';
const { W, route, initAll, seedFn } = L;
const DIR = new URL('.', import.meta.url).pathname;
const APP = 'https://app.local/Claude/?v=demo';
mkdirSync(DIR + 'out/stills', { recursive: true });
await L.launch();
const { browser, PICS } = L._state();
const clean = () => { if (!location.pathname.startsWith('/Claude')) return; const add = () => { const s = document.createElement('style'); s.textContent = '.foodSafetyRefWrap{display:none!important}'; (document.head || document.documentElement).appendChild(s); }; if (document.documentElement) add(); else document.addEventListener('DOMContentLoaded', add); };
async function ctxFor(vp, dpr) {
  const ctx = await browser.newContext({ viewport: vp, deviceScaleFactor: dpr, isMobile: vp.width < 500, hasTouch: true, locale: 'en-US', timezoneId: 'America/New_York', serviceWorkers: 'block' });
  await ctx.route('**/*', route); await ctx.addInitScript(initAll); await ctx.addInitScript(clean);
  await ctx.addInitScript(seedFn, [S.buildHistory(PICS), S.venueSettings(), S.users, S.regdoc, S.haccpSubs(), {}, S.VENUE, S.kitchenReg]);
  const page = await ctx.newPage(); page.on('dialog', d => d.accept().catch(() => {}));
  return { ctx, page };
}
const find = async (page, sel, re, tries = 16) => { for (let i = 0; i < tries; i++) { for (const e of await page.$$(sel)) { const t = (await e.textContent().catch(() => '')) || ''; if ((!re || re.test(t)) && await e.isVisible().catch(() => false)) return e; } await W(250); } console.log('MISSING', sel, re || ''); return null; };
async function signIn(page, badge) {
  await page.goto(APP); await W(2500);
  const inp = await find(page, 'input'); await inp.fill(badge); await (await find(page, 'button', /Sign In/)).click(); await W(2400);
  for (let i = 0; i < 2; i++) { const e = await find(page, 'button', /All done for today/, 2); if (!e) break; await e.click(); await W(400); }
}
const nav = (page, p) => page.evaluate(pg => window.dispatchEvent(new CustomEvent('sdx-nav', { detail: { page: pg, clearFocus: true } })), p);

// 1. Follow-ups list (phone)
if (!process.env.ONLY || process.env.ONLY === 'phone') { const { ctx, page } = await ctxFor({ width: 390, height: 844 }, 3);
  await signIn(page, '448800'); await nav(page, 'history'); await W(2400);
  const an = await find(page, 'button', /ANALYTICS/i); if (an) { await an.click(); await W(1800); }
  const fu = await find(page, 'button', /Follow-ups/); if (fu) { await fu.click(); await W(2200); }
  await page.screenshot({ path: DIR + 'out/stills/followups.png' });
  // 2. Announce a recall to every stand (phone)
  await nav(page, 'print_labels'); await W(2600);
  const ann = await find(page, 'button', /Announce/, 8); if (ann) { await ann.click(); await W(900); }
  const ta = await find(page, 'textarea', null, 6);
  if (ta) { await ta.fill('RECALL: check your freezers for the recalled frozen pizza. Pull it, set it aside, and reply here when done. Every stand.'); await W(700); }
  await page.screenshot({ path: DIR + 'out/stills/announce.png' });
  await ctx.close(); }
// 3. Who is not scanning (laptop)
if (!process.env.ONLY || process.env.ONLY === 'laptop') { const { ctx, page } = await ctxFor({ width: 1280, height: 800 }, 2);
  await signIn(page, '448800'); await nav(page, 'history'); await W(2400);
  const an = await find(page, 'button', /ANALYTICS/i); if (an) { await an.click(); await W(1800); }
  const tp = await find(page, 'button', /Temp/); if (tp) { await tp.click(); await W(1800); }
  const fl = await find(page, '[data-testid=hc-view-flags]', null, 6); if (fl) { await fl.click(); await W(1400); }
  await page.evaluate(() => { const e = document.querySelector('[data-testid=hc-view]'); if (e) { const y = e.getBoundingClientRect().top + scrollY - 70; scrollTo(0, y); } }); await W(800);
  await page.screenshot({ path: DIR + 'out/stills/notscanning.png' });
  await ctx.close(); }

// 4. Guide screens: sign-in (phone), crew join (phone), posters page + invite links (laptop)
if (!process.env.ONLY || process.env.ONLY === 'guide') {
  { const { ctx, page } = await ctxFor({ width: 390, height: 844 }, 3);
    await page.goto(APP); await W(2600); await page.screenshot({ path: DIR + 'out/stills/signin.png' });
    await page.goto(APP + '&invite=tokc'); await W(2600);
    const n = await find(page, '[data-testid=crew-join-name]', null, 8); if (n) { await n.fill('ANA R.'); await W(400); }
    await page.screenshot({ path: DIR + 'out/stills/crewjoin.png' });
    await ctx.close(); }
  { const { ctx, page } = await ctxFor({ width: 1280, height: 800 }, 2);
    await signIn(page, '448800');
    const ov = await find(page, 'div', /Tap here — I'm on site/, 6); if (ov) { await ov.click().catch(() => {}); await W(900); }
    await nav(page, 'kitchen_qr'); await W(3200);
    await page.screenshot({ path: DIR + 'out/stills/posters.png' });
    await ctx.close(); }
  { const { ctx, page } = await ctxFor({ width: 1280, height: 800 }, 2);
    await signIn(page, '365582'); await nav(page, 'admin'); await W(3000);
    await page.evaluate(() => { const t = [...document.querySelectorAll('.cardTitle')].find(e => /Invite links/.test(e.textContent)); if (t) { const c = t.closest('.card') || t; scrollTo(0, c.getBoundingClientRect().top + scrollY - 90); } }); await W(900);
    await page.screenshot({ path: DIR + 'out/stills/invites.png' });
    await ctx.close(); }
}
await L.close();
console.log('stills done');
