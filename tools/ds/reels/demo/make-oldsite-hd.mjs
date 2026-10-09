// node tools/ds/reels/demo/make-oldsite-hd.mjs → pool-oldsite-hd.jpg: the same FICTIONAL 2011 Tidewick Pool Care page as
// pool-oldsite.jpg (its HTML is read from make.mjs, so the two never drift), shot at 3× (3000 px wide, still 1000 css px:
// use cssWidth 1000) so zoomed views, list `peeks` and sliders stay sharp. Does not touch the other demo files and never runs
// the preview generator. Merges the page's boxes into screens.json for BOTH images (re-read right before writing), adding
// named boxes for the text the old screens.json had none for: the "CALL FOR SPECIALS" marquee text, the visitor counter,
// the price table ("Call" / "Call for quote" / "Depends"), the fax sentences (Contact + About), the "Best viewed in …
// Internet Explorer" footer text, the map and picture placeholders, the second under-construction banner.
import { chromium } from '/home/user/Claude/node_modules/playwright-core/index.mjs';
import { readFileSync, writeFileSync, mkdirSync } from 'fs';
const HERE = new URL('.', import.meta.url).pathname;
const TMP = process.env.TMPDIR_REELS || '/tmp/ds-reels-demo/'; mkdirSync(TMP, { recursive: true });
const src = readFileSync(HERE + 'make.mjs', 'utf8');
const i0 = src.indexOf("'pool-oldsite':"), h0 = src.indexOf('html: `', i0) + 7, h1 = src.indexOf('` },', h0);
const html = src.slice(h0, h1);
if (i0 < 0 || h1 < 0 || html.includes('${')) throw new Error('could not read the pool-oldsite HTML from make.mjs');
const f = TMP + 'pool-oldsite-hd.html'; writeFileSync(f, `<!doctype html><meta charset=utf-8>${html}`);
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--no-sandbox'] });
const pg = await b.newPage({ viewport: { width: 1000, height: 600 }, deviceScaleFactor: 3 });
await pg.goto('file://' + f); await pg.evaluate(() => document.fonts.ready); await pg.waitForTimeout(200);
const boxes = await pg.evaluate(() => {
  const R = e => { const r = e.getBoundingClientRect(); return [Math.round(r.left), Math.round(r.top + scrollY), Math.round(r.width), Math.round(r.height)]; };
  const span = rg => { const rs = [...rg.getClientRects()]; const x0 = Math.min(...rs.map(q => q.left)), y0 = Math.min(...rs.map(q => q.top)), x1 = Math.max(...rs.map(q => q.right)), y1 = Math.max(...rs.map(q => q.bottom)); return [Math.round(x0), Math.round(y0 + scrollY), Math.round(x1 - x0), Math.round(y1 - y0)]; };
  const text = (needle, nth = 0) => { const w = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT); let n, k = 0; while ((n = w.nextNode())) { const i = n.data.indexOf(needle); if (i >= 0 && k++ === nth) { const rg = document.createRange(); rg.setStart(n, i); rg.setEnd(n, i + needle.length); return span(rg); } } return null; };
  const q = s => document.querySelector(s), all = s => [...document.querySelectorAll(s)];
  const link = all('a').find(a => a.textContent === 'print this form');
  const faxRg = document.createRange(); faxRg.setStart(link.previousSibling, 0); faxRg.setEnd(link.nextSibling, link.nextSibling.data.length);
  const phrase = document.createRange(); phrase.setStart(link.firstChild, 0); const tail = link.nextSibling, j = tail.data.indexOf('our office') + 'our office'.length; phrase.setEnd(tail, j);
  const u = (a, b2) => { const x0 = Math.min(a[0], b2[0]), y0 = Math.min(a[1], b2[1]); return [x0, y0, Math.max(a[0] + a[2], b2[0] + b2[2]) - x0, Math.max(a[1] + a[3], b2[1] + b2[3]) - y0]; };
  const priceHead = all('h3').find(h => h.textContent === 'Prices');
  return {
    header: R(q('.hd')), marquee: R(q('.mq')), nav: R(q('.nav')), sidebar: R(q('.side')), underConstruction: R(all('.uc')[0]), footer: R(q('.ft')),
    marqueeCall: text('CALL FOR SPECIALS'), welcome: text('WELCOME TO OUR WEB SITE!!!'),
    visitorCounter: u(text('You are visitor #'), R(q('.cnt'))), counterDigits: R(q('.cnt')),
    priceTable: R(q('table[border]')), prices: u(R(priceHead), R(q('table[border]'))),
    faxLine: span(faxRg), faxPhrase: span(phrase), aboutFax: text('For a quote please print the form on the Contact Us page and fax it to our office.'),
    ieText: text('Best viewed in 1024x768 with Internet Explorer'), map: R(all('div').find(d => d.textContent.trim() === '[ map could not be loaded ]')),
    picture: R(q('.img')), gallerySoon: R(all('.uc')[1]), specials: text('Pool opening special call for price'),
  };
});
const H = await pg.evaluate(() => document.documentElement.scrollHeight);
await pg.screenshot({ path: HERE + 'pool-oldsite-hd.jpg', fullPage: true, type: 'jpeg', quality: 88 });
await b.close();
const sj = JSON.parse(readFileSync(HERE + 'screens.json', 'utf8'));            // merge (re-read right before writing)
const lo = sj['demo/pool-oldsite.jpg'] || { cssWidth: 1000, cssHeight: H, boxes: {} };
sj['demo/pool-oldsite.jpg'] = { ...lo, boxes: { ...boxes, ...lo.boxes } };
sj['demo/pool-oldsite-hd.jpg'] = { cssWidth: 1000, cssHeight: H, boxes };
writeFileSync(HERE + 'screens.json', JSON.stringify(sj, null, 1));
console.log('pool-oldsite-hd.jpg', `3000×${H * 3}`, Object.keys(boxes).length, 'boxes → screens.json');
