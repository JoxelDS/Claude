// node tools/learn/test/learn.harness.mjs   — checks the built Learn pages in public/marketing/learn (no network)
// widths 390 / 820 / 1280: no sideways scroll, every internal link resolves, EN/ES pairs, quiz scoring, progress kept
// across a reload, the certificate gate, the progress code round trip, pages still work when storage throws, no
// external requests, contrast of the main text tokens.
import { chromium } from '../../../node_modules/playwright-core/index.mjs';
import fs from 'fs';
import path from 'path';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '../../..');
const PUB = path.join(ROOT, 'public');
const LEARN = path.join(PUB, 'marketing/learn');
const BASE = 'https://app.local/Claude/marketing/learn/';
const course = JSON.parse(fs.readFileSync(path.join(ROOT, 'docs/training/food-handler/course.json'), 'utf8'));
const guideFile = path.join(ROOT, 'docs/training/app-guide/guide.json');
const guide = fs.existsSync(guideFile) ? JSON.parse(fs.readFileSync(guideFile, 'utf8')) : null;
const types = { '.html': 'text/html; charset=utf-8', '.css': 'text/css', '.js': 'text/javascript', '.png': 'image/png', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml', '.woff2': 'font/woff2', '.mp4': 'video/mp4', '.webm': 'video/webm', '.vtt': 'text/vtt', '.xml': 'application/xml', '.json': 'application/json' };
let fails = 0, passes = 0;
const ok = (c, m) => { if (c) { passes++; } else { fails++; console.log('  ✗', m); } };

const pagesOnDisk = [];
(function walk(d) { for (const f of fs.readdirSync(d)) { const p = path.join(d, f); if (fs.statSync(p).isDirectory()) walk(p); else if (f === 'index.html') pagesOnDisk.push(path.relative(LEARN, p).replace(/index\.html$/, '')); } })(LEARN);
console.log(`pages: ${pagesOnDisk.length}`);

const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--no-sandbox', '--no-proxy-server'] });
const external = [];
async function ctxFor(width, opts = {}) {
  const ctx = await b.newContext({ viewport: { width, height: 900 }, colorScheme: opts.dark ? 'dark' : 'light' });
  await ctx.route('**/*', async (r) => {
    const u = new URL(r.request().url());
    if (u.hostname !== 'app.local') { external.push(u.href); return r.abort(); }
    let p = decodeURIComponent(u.pathname.replace(/^\/Claude\//, ''));
    if (!p || p.endsWith('/')) p += 'index.html';
    const f = path.join(PUB, p);
    if (!fs.existsSync(f) || fs.statSync(f).isDirectory()) return r.fulfill({ status: 404, body: 'not found ' + p });
    r.fulfill({ status: 200, body: fs.readFileSync(f), headers: { 'content-type': types[path.extname(f)] || 'application/octet-stream' } });
  });
  if (opts.noStorage) await ctx.addInitScript(() => { const t = () => { throw new Error('blocked'); }; Object.defineProperty(window, 'localStorage', { get: t }); });
  return ctx;
}

// 1. every page at three widths: renders, no sideways scroll, no errors, links resolve, lang + hreflang
{
  for (const w of [390, 820, 1280]) {
    const ctx = await ctxFor(w); const page = await ctx.newPage(); const errs = [];
    page.on('pageerror', (e) => errs.push(e.message));
    for (const rel of pagesOnDisk) {
      await page.goto(BASE + rel);
      const info = await page.evaluate(() => ({
        sw: document.documentElement.scrollWidth, iw: innerWidth, lang: document.documentElement.lang,
        h1: document.querySelectorAll('h1').length, title: document.title,
        alt: [...document.querySelectorAll('link[rel=alternate]')].map((l) => l.hreflang),
        links: [...document.querySelectorAll('a[href]')].map((a) => a.getAttribute('href')),
        imgs: [...document.querySelectorAll('img')].map((i) => ({ alt: i.getAttribute('alt'), ok: i.complete && i.naturalWidth > 0 })),
      }));
      ok(info.sw <= info.iw, `${w}px ${rel}: sideways scroll ${info.sw} > ${info.iw}`);
      ok(info.h1 === 1, `${rel}: ${info.h1} h1`);
      ok(/^(en|es)$/.test(info.lang) && (rel.startsWith('es/') ? info.lang === 'es' : info.lang === 'en'), `${rel}: lang ${info.lang}`);
      ok(['en', 'es', 'x-default'].every((x) => info.alt.includes(x)), `${rel}: hreflang ${info.alt}`);
      ok(info.imgs.every((i) => i.alt !== null && i.ok), `${rel}: image missing alt or not loading`);
      if (w === 390) for (const href of info.links) {
        if (/^(https?:|mailto:|sms:|tel:|#)/.test(href)) continue;
        const target = new URL(href, BASE + rel);
        let p = decodeURIComponent(target.pathname.replace(/^\/Claude\//, '')); if (!p || p.endsWith('/')) p += 'index.html';
        if (target.search && /\?v=riverside-demo/.test(target.search)) { ok(p === 'index.html', `${rel}: demo link ${href}`); continue; }
        ok(fs.existsSync(path.join(PUB, p)), `${rel}: broken link ${href}`);
      }
    }
    ok(errs.length === 0, `${w}px page errors: ${errs.join(' | ')}`);
    await ctx.close();
  }
}

// 2. quiz scoring, progress kept across a reload, certificate gate, code round trip
{
  const ctx = await ctxFor(390); const page = await ctx.newPage();
  const answer = async (rel, right) => {
    await page.goto(BASE + rel);
    const n = await page.locator('form.quiz .q').count();
    for (let i = 0; i < n; i++) {
      const q = page.locator('form.quiz .q').nth(i);
      const a = +(await q.getAttribute('data-answer'));
      const pick = i < right ? a : (a + 1) % 4;
      await q.locator('label').nth(pick).click();
    }
    return n;
  };
  const l1 = course.lessons[0].id;
  const n = await answer(`food-safety/${l1}/`, 3);
  ok(n === 5, `lesson 1 has ${n} questions`);
  let res = await page.locator('form.quiz .result').innerText();
  ok(/3 of 5/.test(res) && /need 4/.test(res), `3/5 result says fail: ${res}`);
  ok(await page.locator('form.quiz .q .why:not([hidden])').count() === 5, 'every answer shows its why');
  ok(await page.locator('form.quiz label.right').count() === 5 && await page.locator('form.quiz label.wrong').count() === 2, 'right / wrong marks');
  await page.locator('form.quiz .result button').click();
  ok(await page.locator('form.quiz label.right').count() === 0, 'Try again resets the quiz');
  await answer(`food-safety/${l1}/`, 5);
  res = await page.locator('form.quiz .result').innerText();
  ok(/5 of 5/.test(res) && /complete/i.test(res), `5/5 result says complete: ${res}`);
  await page.goto(BASE + 'food-safety/');
  await page.waitForTimeout(150);
  ok(await page.locator(`[data-lesson="${l1}"]`).getAttribute('data-state') === 'done', 'lesson 1 shows done after a reload');
  ok(/1 of 8/.test(await page.locator('[data-count="fs"]').first().innerText()), 'count says 1 of 8');
  const cont = await page.locator('[data-continue]').first();
  ok(/lesson 2/i.test(await cont.innerText()) && (await cont.getAttribute('href')).includes(course.lessons[1].id), 'continue button points at lesson 2');
  await page.goto(BASE + 'food-safety/certificate/');
  ok(await page.locator('.cert-form').isHidden() && await page.locator('.cert-locked').isVisible(), 'certificate locked with 1 of 8');
  ok(await page.locator('.cert-print').isHidden(), 'print button hidden while locked');
  for (const l of course.lessons.slice(1)) await answer(`food-safety/${l.id}/`, 4);
  await page.goto(BASE + 'food-safety/certificate/');
  ok(await page.locator('.cert-form').isVisible(), 'certificate form shows after 8 passes');
  await page.fill('#cert-name', '  Maria   Perez ');
  await page.locator('.cert-form button[type=submit]').click();
  ok(await page.locator('.certificate.on .name').innerText() === 'Maria Perez', 'certificate name trimmed');
  ok(/^SDX-[A-Z2-9]{6}$/.test(await page.locator('[data-cert-id]').innerText()), 'certificate id');
  ok(/not a state food handler card/i.test(await page.locator('.certificate').innerText()), 'certificate disclaimer');
  const code = await page.locator('.code-box .code').innerText();
  ok(/^SDX1-[A-Z2-9]+$/.test(code), `progress code ${code}`);
  // a new browser gets the progress back from the code
  const ctx2 = await ctxFor(390); const p2 = await ctx2.newPage();
  await p2.goto(BASE + 'about/');
  await p2.fill('.code-box input', code.toLowerCase());
  await p2.locator('.code-box form button').click();
  ok(/added/i.test(await p2.locator('.code-msg').innerText()), 'code accepted');
  await p2.goto(BASE + 'food-safety/');
  ok(/8 of 8/.test(await p2.locator('[data-count="fs"]').first().innerText()), 'code brings back 8 of 8');
  await p2.goto(BASE + 'about/');
  await p2.fill('.code-box input', code.slice(0, -1) + (code.endsWith('A') ? 'B' : 'A'));
  await p2.locator('.code-box form button').click();
  ok(/not look right/i.test(await p2.locator('.code-msg').innerText()), 'a changed code is refused');
  await ctx2.close();
  // Spanish quiz text
  await answer(`es/food-safety/${course.lessons[2].id}/`, 2);
  ok(/Acertó 2 de 5/.test(await page.locator('form.quiz .result').innerText()), 'Spanish result text');
  await ctx.close();
}

// 3. storage blocked: pages still render and the quiz still scores
{
  const ctx = await ctxFor(390, { noStorage: true }); const page = await ctx.newPage(); const errs = [];
  page.on('pageerror', (e) => errs.push(e.message));
  await page.goto(BASE + `food-safety/${course.lessons[0].id}/`);
  const q = page.locator('form.quiz .q');
  for (let i = 0; i < 5; i++) await q.nth(i).locator('label').nth(+(await q.nth(i).getAttribute('data-answer'))).click();
  ok(/5 of 5/.test(await page.locator('form.quiz .result').innerText()), 'quiz works with storage blocked');
  ok(errs.length === 0, 'no errors with storage blocked: ' + errs.join(' | '));
  await ctx.close();
}

// 4. role guides (when guide.json exists): steps + check
if (guide) {
  const ctx = await ctxFor(390); const page = await ctx.newPage();
  for (const r of guide.roles) {
    await page.goto(BASE + `app-guide/${r.id}/`);
    ok(await page.locator('.step').count() === r.steps.length, `${r.id}: ${r.steps.length} steps`);
    const q = page.locator('form.quiz .q'); const n = await q.count();
    for (let i = 0; i < n; i++) await q.nth(i).locator('label').nth(+(await q.nth(i).getAttribute('data-answer'))).click();
    ok(new RegExp(`${n} of ${n}`).test(await page.locator('form.quiz .result').innerText()), `${r.id}: check scores ${n}/${n}`);
  }
  await page.goto(BASE + 'app-guide/');
  ok(new RegExp(`${guide.roles.length} of ${guide.roles.length}`).test(await page.locator('[data-count="ag"]').first().innerText()), 'all guides done');
  await ctx.close();
}

// 5. dark mode: text tokens keep contrast on their surfaces
{
  const lum = (hex) => { const c = hex.match(/\d+/g).slice(0, 3).map((v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }); return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]; };
  const ratio = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((m, n) => n - m); return (x + 0.05) / (y + 0.05); };
  for (const dark of [false, true]) {
    const ctx = await ctxFor(1280, { dark }); const page = await ctx.newPage();
    await page.goto(BASE + `food-safety/${course.lessons[0].id}/`);
    const c = await page.evaluate(() => { const g = (sel, prop) => getComputedStyle(document.querySelector(sel))[prop]; return { body: g('body', 'color'), bg: g('body', 'backgroundColor'), panelInk: g('.panel h2', 'color'), panel: g('.panel', 'backgroundColor'), muted: g('.muted', 'color'), eyebrow: g('.eyebrow', 'color') }; });
    ok(ratio(c.body, c.bg) >= 7, `${dark ? 'dark' : 'light'} body text contrast ${ratio(c.body, c.bg).toFixed(1)}`);
    ok(ratio(c.panelInk, c.panel) >= 4.5, `${dark ? 'dark' : 'light'} heading on panel ${ratio(c.panelInk, c.panel).toFixed(1)}`);
    ok(ratio(c.muted, c.bg) >= 4.5, `${dark ? 'dark' : 'light'} muted text ${ratio(c.muted, c.bg).toFixed(1)}`);
    ok(ratio(c.eyebrow, c.bg) >= 4.5, `${dark ? 'dark' : 'light'} eyebrow ${ratio(c.eyebrow, c.bg).toFixed(1)}`);
    await ctx.close();
  }
}

// 6. banned words in the built pages
{
  const banned = /sodexo|hard ?rock|ds marketing|dsmarketing|joxel/i;
  for (const rel of pagesOnDisk) { const t = fs.readFileSync(path.join(LEARN, rel, 'index.html'), 'utf8').replace(/joxelds\.github\.io/g, ''); ok(!banned.test(t), `${rel}: banned word ${(t.match(banned) || [])[0]}`); }
}
ok(external.length === 0, 'external requests: ' + [...new Set(external)].slice(0, 5).join(' '));
await b.close();
console.log(fails ? `FAIL ${fails} (pass ${passes})` : `ALL PASS ${passes}`);
process.exit(fails ? 1 : 0);
