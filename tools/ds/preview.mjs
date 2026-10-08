// node tools/ds/preview.mjs leads.json → public/p/<slug>/index.html (free preview homepages for DS Marketing website outreach)
// One self-contained page per lead. Each lead picks a THEME (lead.theme) inspired by a style on styles.refero.design that fits
// the business (palette, type pairing, radii, hero layout, section style) — Google Fonts stand in for the original typefaces.
// No invented facts: only the name, area, services, rating and what their own Instagram bio says (hours, address, business phone).
// No fake reviews, no stock "customers". Photos are SAMPLES and the page says so.
// Lead fields: name slug niche theme area instagram heroTitle heroSub services[{t,d,price?}] cta short? rating? photos[3]?
// Brand (from their own Instagram / web): logo? (their profile picture, shown in the bar + hero) brand?{accent,onAccent,tagBg,tagInk,mark,heroBg,heroInk,bg,surface,surface2,ink,sub,line,link}
// ownPhotos? (photos are theirs, from Instagram → credited, not 'sample') promo? (one current offer) proof?[] (short true facts) links?[{label,url}] (order / book)
// lang ('en'|'es')? phone? address? hours[]? hoursTitle? ctaUrl? (their booking / ordering link)
import { readFileSync, writeFileSync, mkdirSync } from 'fs';
const ROOT = new URL('../../', import.meta.url).pathname;
const leads = JSON.parse(readFileSync(process.argv[2], 'utf8'));
const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

// hero: overlay (photo full-bleed, text on it) | split (text + photo card) | center (centered text, wide photo card)
//       stack (full-bleed photo, text below) | poster (giant name, photo, text)
// services: cards | list (hairline rows)
const THEMES = {
  diner: { refero: '7shifts — warm diner counter with neon chalk accents', hero: 'split', services: 'cards', squiggle: true,
    fonts: [['DM Sans', '400;500;700;800']], disp: "'DM Sans'", dispW: 800, dispCase: 'none', dispTrack: '-0.035em', body: "'DM Sans'",
    bg: '#ffffff', surface: '#f3eeff', surface2: '#ebdcff', ink: '#0b0b0f', sub: '#4a4a57', line: '#e4dcf5', accent: '#4570ff', onAccent: '#ffffff',
    tagBg: '#c6ff94', tagInk: '#0b0b0f', mark: '#ff6808', btnR: '999px', cardR: '24px', imgR: '28px' },
  lookbook: { refero: 'VISIONNAIRE — editorial streetwear lookbook on bone-white', hero: 'split', services: 'list', upperLabels: true,
    fonts: [['Inter', '400;500;700']], disp: "'Inter'", dispW: 700, dispCase: 'uppercase', dispTrack: '0.01em', body: "'Inter'",
    bg: '#ffffff', surface: '#f7f5e8', surface2: '#f7f5e8', ink: '#231f20', sub: '#5f5a55', line: '#231f20', accent: '#000000', onAccent: '#ffffff',
    tagBg: '#b94e3a', tagInk: '#ffffff', btnR: '0', cardR: '0', imgR: '0' },
  pastelserif: { refero: 'Sketch — serif poetry on pastel paper', hero: 'split', services: 'cards',
    fonts: [['Fraunces', 'opsz,wght@9..144,500;9..144,600'], ['Inter', '400;500;600']], disp: "'Fraunces'", dispW: 500, dispCase: 'none', dispTrack: '-0.025em', body: "'Inter'",
    bg: '#fdf7f5', surface: '#ffffff', surface2: '#fbe8ee', ink: '#212123', sub: '#4a4a4a', line: '#efe0e3', accent: '#d9668a', onAccent: '#ffffff',
    tagBg: '#fbe8ee', tagInk: '#a8435f', btnR: '999px', cardR: '22px', imgR: '26px' },
  deli: { refero: 'GRAZA — Mediterranean deli counter, sunlit and hand-set', hero: 'split', services: 'cards', band: '#fbd535',
    fonts: [['Cormorant Garamond', '500;600;700'], ['Courier Prime', '400;700']], disp: "'Cormorant Garamond'", dispW: 600, dispCase: 'none', dispTrack: '-0.01em', body: "'Courier Prime'", serif: true,
    bg: '#fff4ec', surface: '#f6e6d9', surface2: '#f6e6d9', ink: '#3c422e', sub: '#5c604c', line: '#3c422e', accent: '#3c422e', onAccent: '#fff4ec',
    tagBg: '#9eef80', tagInk: '#3c422e', btnR: '999px', cardR: '6px', imgR: '6px' },
  pinkdawn: { refero: 'Mews — hospitality at pink dawn', hero: 'split', services: 'cards',
    fonts: [['Inter', '400;500;700;800']], disp: "'Inter'", dispW: 800, dispCase: 'none', dispTrack: '-0.045em', body: "'Inter'",
    bg: '#ffffff', surface: '#fbf6ef', surface2: '#f7e1f7', ink: '#000000', sub: '#333333', line: '#efe7ef', accent: '#ff83da', onAccent: '#000000',
    tagBg: '#f7e1f7', tagInk: '#000000', btnR: '999px', cardR: '24px', imgR: '24px' },
  atelier: { refero: 'Adam Lippes — monochrome editorial atelier on cream paper', hero: 'stack', services: 'list', upperLabels: true,
    fonts: [['Tenor Sans', '400']], disp: "'Tenor Sans'", dispW: 400, dispCase: 'uppercase', dispTrack: '0.04em', body: "'Tenor Sans'",
    bg: '#fefcf8', surface: '#ffffff', surface2: '#f5f1ea', ink: '#000000', sub: '#4c4c4a', line: '#000000', accent: '#000000', onAccent: '#ffffff',
    tagBg: 'transparent', tagInk: '#000000', btnR: '0', cardR: '0', imgR: '0' },
  darkroom: { refero: 'ORYZO — darkroom editorial, a lone object in warm darkness', hero: 'overlay', services: 'list', dark: true, upperLabels: true,
    fonts: [['Manrope', '400;500;700']], disp: "'Manrope'", dispW: 500, dispCase: 'uppercase', dispTrack: '0', body: "'Manrope'",
    bg: '#100904', surface: '#1a110a', surface2: '#382416', ink: '#ffedd7', sub: '#bba893', line: '#40372e', accent: '#ffedd7', onAccent: '#100904',
    tagBg: 'transparent', tagInk: '#ff7a33', btnR: '999px', cardR: '14px', imgR: '14px' },
  noir: { refero: 'OFFFICE — noir gallery swallowed by monolithic type', hero: 'poster', services: 'list', dark: true, upperLabels: true,
    fonts: [['Archivo', '400;600;800;900']], disp: "'Archivo'", dispW: 900, dispCase: 'uppercase', dispTrack: '-0.03em', body: "'Archivo'",
    bg: '#0e0e00', surface: '#151510', surface2: '#1c1c16', ink: '#fefefe', sub: '#a3a39a', line: '#3a3a33', accent: '#fefefe', onAccent: '#0e0e00',
    tagBg: 'transparent', tagInk: '#c9a35b', btnR: '0', cardR: '0', imgR: '0' },
  runway: { refero: 'Peloton — red beacon on charcoal runway', hero: 'overlay', services: 'cards', heroDark: true,
    fonts: [['Inter', '300;400;600;700']], disp: "'Inter'", dispW: 300, dispCase: 'none', dispTrack: '-0.02em', body: "'Inter'",
    bg: '#f7f7f7', surface: '#ffffff', surface2: '#ffffff', ink: '#181a1d', sub: '#65666a', line: '#e4e6e7', accent: '#df1c2f', onAccent: '#ffffff',
    heroBg: '#181a1d', heroInk: '#ffffff', tagBg: '#df1c2f', tagInk: '#ffffff', btnR: '28px', cardR: '16px', imgR: '12px' },
  gallery: { refero: 'Apple — white room with a single blue switch', hero: 'center', services: 'cards',
    fonts: [['Inter', '400;500;600;700']], disp: "'Inter'", dispW: 700, dispCase: 'none', dispTrack: '-0.04em', body: "'Inter'",
    bg: '#ffffff', surface: '#f5f5f7', surface2: '#f5f5f7', ink: '#1d1d1f', sub: '#6e6e73', line: '#d6d6d6', accent: '#0071e3', onAccent: '#ffffff',
    tagBg: 'transparent', tagInk: '#b64400', btnR: '999px', cardR: '28px', imgR: '28px' },
  coastal: { refero: 'Bose — coastal soundstage, campaign image + precision controls', hero: 'overlay', services: 'list', upperLabels: true, heroDark: true,
    fonts: [['Archivo', '400;500;700;900'], ['Inter', '400;500']], disp: "'Archivo'", dispW: 900, dispCase: 'uppercase', dispTrack: '0.015em', body: "'Inter'",
    bg: '#ffffff', surface: '#f8f8f8', surface2: '#f1efee', ink: '#131317', sub: '#40464b', line: '#131317', accent: '#ffffff', onAccent: '#131317',
    heroBg: '#131317', heroInk: '#ffffff', tagBg: '#005bff', tagInk: '#ffffff', btnR: '2px', cardR: '2px', imgR: '0', link: '#005bff', bodyAccent: '#131317', bodyOnAccent: '#ffffff' },
};
const NICHE_THEME = { food: 'diner', beauty: 'pinkdawn', fitness: 'runway', home: 'gallery' };
const STR = {
  en: { tag: { food: 'Eat & drink', beauty: 'Beauty', fitness: 'Training', home: 'Home services' }, label: { food: 'Menu highlights', beauty: 'Services', fitness: 'Programs', home: 'What we do' },
    gallery: 'Gallery', see: 'See it for yourself', sample: 'Sample photos: your own photos go here.', own: h => `Photos from @${h} on Instagram. You pick the final ones.`, ownSome: (n, h) => `The first ${n === 1 ? 'photo is' : n + ' photos are'} from @${h} on Instagram; the rest are samples.`, now: 'Right now', price: 'from', visit: 'Visit', find: 'Find us', call: 'Call', directions: 'Directions', hours: 'Hours',
    foot: n => `This is a free preview made by DS Marketing. It is not the official website of ${n}.`, rib: n => `<b>Free preview for ${n}</b> by DS Marketing · live on your own domain in 48 h`, mine: 'Make it mine', touch: 'Get in touch' },
  es: { tag: { food: 'Comida', beauty: 'Belleza', fitness: 'Entrenamiento', home: 'Servicios para el hogar' }, label: { food: 'Lo más pedido', beauty: 'Servicios', fitness: 'Programas', home: 'Lo que hacemos' },
    gallery: 'Galería', see: 'Míralo tú mismo', sample: 'Fotos de muestra: aquí van tus propias fotos.', own: h => `Fotos de @${h} en Instagram. Tú escoges las finales.`, ownSome: (n, h) => `${n === 1 ? 'La primera foto es' : 'Las primeras ' + n + ' fotos son'} de @${h} en Instagram; las demás son de muestra.`, now: 'Ahora mismo', price: 'desde', visit: 'Visítanos', find: 'Encuéntranos', call: 'Llamar', directions: 'Cómo llegar', hours: 'Horario',
    foot: n => `Esta es una vista previa gratis hecha por DS Marketing. No es la página oficial de ${n}.`, rib: n => `<b>Vista previa gratis para ${n}</b> por DS Marketing · en vivo con tu dominio en 48 h`, mine: 'La quiero', touch: 'Escríbenos' },
};
const squiggle = c => `url("data:image/svg+xml,${encodeURIComponent(`<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 200 14' preserveAspectRatio='none'><path d='M2 9 C 30 2, 55 13, 85 7 S 140 2, 170 8 S 192 10, 198 6' fill='none' stroke='${c}' stroke-width='4' stroke-linecap='round'/></svg>`)}")`;
const SANS = "system-ui,-apple-system,'Segoe UI',Roboto,Helvetica,Arial,sans-serif";

for (const l of leads) {
  const key = ['food', 'beauty', 'fitness', 'home'].includes(l.niche) ? l.niche : 'home';
  const themeKey = THEMES[l.theme] ? l.theme : NICHE_THEME[key]; const T = { ...THEMES[themeKey], ...(l.brand || {}) };
  const t = STR[l.lang === 'es' ? 'es' : 'en'];
  const ig = String(l.instagram || '').replace(/^@/, '');
  const igUrl = `https://instagram.com/${esc(ig)}`;
  const where = l.address || `${l.name} ${l.area || 'Miami'}`;
  const maps = `https://www.google.com/maps/search/${encodeURIComponent(where)}`;
  const tel = l.phone ? 'tel:+1' + String(l.phone).replace(/\D/g, '').replace(/^1(?=\d{10}$)/, '') : '';
  const label = t.label[key];
  const ctaHref = l.ctaUrl || tel || igUrl; const ctaExt = !(tel && !l.ctaUrl);
  const img = i => l.photos?.[i - 1] || `../_img/${key}-${i}.jpg`;
  const own = l.ownPhotos === true ? 3 : Math.max(0, Math.min(3, +l.ownPhotos || 0));
  const ogImg = img(1).replace(/^\.\.\//, 'https://joxelds.github.io/Claude/p/');
  const fontQ = T.fonts.map(([f, w]) => `family=${f.replace(/ /g, '+')}:${w.includes('@') ? w : 'wght@' + w}`).join('&amp;');
  const title = esc(l.heroTitle || l.name);
  const words = title.split(' ');
  const h1 = T.squiggle && words.length > 1 ? `${words.slice(0, -1).join(' ')} <span class="mark">${words.at(-1)}</span>` : title;
  const short = esc(l.short || l.name);
  const posterEm = (Math.max(...String(l.short || l.name).split(/\s+/).map(w => w.length)) * 0.84).toFixed(2);
  const tagHtml = (l.logo ? `<img class="heroLogo" src="${esc(l.logo)}" alt="">` : '') + `<div class="tag">${esc(l.area || 'Miami')} · ${t.tag[key]}</div>`;
  const ctas = `<div class="ctas"><a class="cta" href="${esc(ctaHref)}"${ctaExt ? ' target="_blank" rel="noopener"' : ''}>${esc(l.cta || t.touch)} <span aria-hidden="true">→</span></a><a class="ghost" href="#more">${label}</a></div>`;
  const rating = l.rating ? `<div class="rating"><b>★ ${esc(l.rating)}</b></div>` : '';
  const logo = l.logo ? `<img class="logo" src="${esc(l.logo)}" alt="${esc(l.name)} logo">` : '';
  const top = `<div class="top"><span class="brandName">${logo}<span>${short}</span></span><a href="${igUrl}" target="_blank" rel="noopener">${ig.length > 17 ? 'Instagram' : '@' + esc(ig)}</a></div>`;
  let hero;
  if (T.hero === 'overlay') hero = `<header class="hero h-overlay"><img class="bgimg" src="${img(1)}" alt="" fetchpriority="high">${top}<div class="heroText">${tagHtml}<h1>${h1}</h1><p class="lead">${esc(l.heroSub)}</p>${ctas}${rating}</div></header>`;
  else if (T.hero === 'stack') hero = `<header class="hero h-stack">${top}<figure class="heroImg"><img src="${img(1)}" alt="" fetchpriority="high"></figure><div class="heroText">${tagHtml}<h1>${h1}</h1><p class="lead">${esc(l.heroSub)}</p>${ctas}${rating}</div></header>`;
  else if (T.hero === 'poster') hero = `<header class="hero h-poster">${top}<h1 class="poster">${short}</h1><figure class="heroImg"><img src="${img(1)}" alt="" fetchpriority="high"></figure><div class="heroText">${tagHtml}<p class="kicker">${title}</p><p class="lead">${esc(l.heroSub)}</p>${ctas}${rating}</div></header>`;
  else hero = `<header class="hero h-${T.hero === 'center' ? 'center' : 'split'}">${top}<div class="heroText">${tagHtml}<h1>${h1}</h1><p class="lead">${esc(l.heroSub)}</p>${ctas}${rating}</div><figure class="heroImg"><img src="${img(1)}" alt="" fetchpriority="high"></figure></header>`;
  const svc = (l.services || []).slice(0, 6);
  const services = T.services === 'list'
    ? `<div class="rows">${svc.map(s => `<div class="row"><b>${esc(s.t)}${s.price ? ` <em class="pr">${esc(s.price)}</em>` : ''}</b><span>${esc(s.d)}</span></div>`).join('')}</div>`
    : `<div class="grid">${svc.map(s => `<div class="card"><b>${esc(s.t)}${s.price ? ` <em class="pr">${esc(s.price)}</em>` : ''}</b><span>${esc(s.d)}</span></div>`).join('')}</div>`;
  const proof = (l.proof || []).length ? `<ul class="proof">${l.proof.slice(0, 4).map(p => `<li>${esc(p)}</li>`).join('')}</ul>` : '';
  const promo = l.promo ? `<div class="promo"><b>${t.now}</b><span>${esc(l.promo)}</span></div>` : '';
  const svcSection = `<section id="more" class="reveal">${promo}<div class="eyebrow">${short}</div><h2>${label}</h2>${services}${proof}</section>`;
  const bordered = T.surface === T.bg ? 'border:1px solid var(--line);' : '';
  const upper = 'text-transform:uppercase;letter-spacing:.08em;font-size:13px;';
  const ribDark = !!(T.heroDark || T.dark);
  const html = `<!doctype html><html lang="${l.lang === 'es' ? 'es' : 'en'}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<title>${esc(l.name)} · ${esc(l.area || 'Miami')}</title><meta name="robots" content="noindex,nofollow">
<!-- DS Marketing preview · theme ${themeKey} · inspired by ${esc(T.refero)} (styles.refero.design) -->
<meta name="theme-color" content="${T.heroBg || T.bg}">
<meta property="og:title" content="${esc(l.name)} · website preview"><meta property="og:description" content="${esc(l.heroSub)}"><meta property="og:image" content="${ogImg}">
<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?${fontQ}&amp;display=swap" rel="stylesheet">
<link rel="preload" as="image" href="${img(1)}">
<style>
:root{--bg:${T.bg};--surface:${T.surface};--surface2:${T.surface2};--ink:${T.ink};--sub:${T.sub};--line:${T.line};--a:${T.accent};--onA:${T.onAccent};--tagBg:${T.tagBg};--tagInk:${T.tagInk};
--heroBg:${T.heroBg || T.bg};--heroInk:${T.heroInk || T.ink};--btnR:${T.btnR};--cardR:${T.cardR};--imgR:${T.imgR};--link:${T.link || T.ink};
--disp:${T.disp},${T.serif ? "Georgia,'Times New Roman',serif" : SANS};--body:${T.body},${T.serif ? "'Courier New',monospace" : SANS}}
*{margin:0;box-sizing:border-box}html{scroll-behavior:smooth}body{background:var(--bg);color:var(--ink);font-family:var(--body);-webkit-font-smoothing:antialiased;overflow-x:hidden;font-size:16px}
img{display:block;max-width:100%}figure{margin:0}
a:focus-visible{outline:2px solid currentColor;outline-offset:3px}
h1,h2,.poster,.kicker{font-family:var(--disp);font-weight:${T.dispW};text-transform:${T.dispCase};letter-spacing:${T.dispTrack};text-wrap:balance}
h1{font-size:clamp(44px,11.5vw,96px);line-height:${T.dispCase === 'uppercase' ? '.98' : '.96'};max-width:13ch}
h2{font-size:clamp(32px,8vw,56px);line-height:1.02;margin-bottom:28px}
.top{display:flex;justify-content:space-between;align-items:center;gap:12px;padding:18px 22px;font:700 15px var(--body);letter-spacing:.01em${T.upperLabels ? ';text-transform:uppercase;font-size:13px;letter-spacing:.12em' : ''}}
.top a{white-space:nowrap;color:inherit;text-decoration:none;font:600 13px var(--body);letter-spacing:.02em;border:1px solid color-mix(in srgb,currentColor 35%,transparent);padding:8px 14px;border-radius:var(--btnR)}
.tag{display:inline-block;align-self:flex-start;font:700 11px var(--body);letter-spacing:.18em;text-transform:uppercase;color:var(--tagInk);background:var(--tagBg);padding:${T.tagBg === 'transparent' ? '0' : '6px 10px'};border-radius:${T.btnR === '0' ? '0' : '6px'};margin-bottom:18px}
.lead{font-size:clamp(17px,4.4vw,20px);line-height:1.55;margin-top:18px;max-width:38ch;opacity:.86}
.kicker{font-size:clamp(26px,6.4vw,40px);line-height:1.05;margin-bottom:4px}
.ctas{display:flex;flex-wrap:wrap;gap:12px;margin-top:28px;align-items:center}
.cta{display:inline-flex;align-items:center;gap:10px;background:var(--a);color:var(--onA);font:700 16px var(--body);padding:16px 26px;border-radius:var(--btnR);text-decoration:none;transition:transform .2s;${T.upperLabels ? upper : ''}}
.cta:hover{transform:translateY(-2px)}
.ghost{color:inherit;font:600 15px var(--body);text-decoration:none;padding:15px 22px;border-radius:var(--btnR);border:1px solid color-mix(in srgb,currentColor 35%,transparent);${T.upperLabels ? upper : ''}}
.rating{margin-top:20px;font:600 14px var(--body);opacity:.85}
.brandName{display:flex;align-items:center;gap:10px;min-width:0;max-width:62%}.brandName>span{line-height:1.25;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}
.logo{width:36px;height:36px;border-radius:50%;object-fit:cover;flex:none;box-shadow:0 0 0 2px color-mix(in srgb,currentColor 18%,transparent)}
.heroLogo{width:84px;height:84px;border-radius:50%;object-fit:cover;margin-bottom:20px;box-shadow:0 10px 30px rgba(0,0,0,.18),0 0 0 3px color-mix(in srgb,currentColor 14%,transparent)}
.h-center .heroLogo{align-self:center}
.pr{display:block;margin:6px 0 0;font-style:normal;font-weight:700;font-size:.92em;color:var(--link);overflow-wrap:anywhere}
.promo{display:flex;flex-wrap:wrap;gap:6px 12px;align-items:baseline;background:var(--a);color:var(--onA);border-radius:var(--cardR);padding:16px 20px;margin-bottom:40px;font-size:16px;line-height:1.45}.promo b{font:700 12px var(--body);letter-spacing:.16em;text-transform:uppercase}
.proof{list-style:none;padding:0;margin:26px 0 0;display:flex;flex-wrap:wrap;gap:8px}.proof li{border:1px solid var(--line);border-radius:999px;padding:8px 14px;font-size:14px;color:var(--sub)}.proof li:before{content:'✓ ';color:var(--link);font-weight:700}
.h-overlay{min-height:100svh;display:flex;flex-direction:column;position:relative;isolation:isolate;overflow:hidden;color:var(--heroInk);background:var(--heroBg)}
.h-overlay .bgimg{position:absolute;inset:0;z-index:-2;width:100%;height:100%;object-fit:cover;transform:scale(1.08);animation:kb 18s ease-out forwards}
.h-overlay:after{content:"";position:absolute;inset:0;z-index:-1;background:linear-gradient(180deg,color-mix(in srgb,var(--heroBg) 50%,transparent) 0%,color-mix(in srgb,var(--heroBg) 12%,transparent) 24%,color-mix(in srgb,var(--heroBg) 72%,transparent) 52%,color-mix(in srgb,var(--heroBg) 94%,transparent) 78%,var(--heroBg) 100%)}
.h-overlay .heroText{margin-top:auto;padding:0 22px 120px;display:flex;flex-direction:column}
.h-overlay h1,.h-overlay .lead{text-shadow:0 2px 24px color-mix(in srgb,var(--heroBg) 70%,transparent)}
@keyframes kb{to{transform:scale(1)}}
.h-split,.h-center{display:flex;flex-direction:column;padding-bottom:20px}
.h-split .heroText,.h-center .heroText{padding:34px 22px 28px;display:flex;flex-direction:column}
.heroImg{padding:0 14px}.heroImg img{width:100%;aspect-ratio:4/5;object-fit:cover;border-radius:var(--imgR)}
.h-center .heroText{align-items:center;text-align:center}.h-center h1{margin:0 auto}.h-center .lead{margin-left:auto;margin-right:auto}.h-center .tag{align-self:center}.h-center .ctas{justify-content:center}
.h-stack .heroImg,.h-poster .heroImg{padding:0}.h-stack .heroImg img,.h-poster .heroImg img{aspect-ratio:4/5;border-radius:0}.h-stack .heroImg img{aspect-ratio:1/1}
.h-stack .heroText,.h-poster .heroText{padding:34px 22px 32px;display:flex;flex-direction:column;border-bottom:1px solid var(--line)}
.h-poster .poster{font-size:min(calc((100vw - 40px) / ${posterEm}),200px);line-height:.86;padding:10px 16px 22px;max-width:none}
.h-poster .heroImg img{filter:grayscale(.2) contrast(1.05)}
.mark{background:${squiggle(T.mark || T.accent)} bottom/100% .26em no-repeat;padding-bottom:.06em}
section{padding:72px 22px;max-width:1120px;margin:0 auto}
.eyebrow{font:700 12px var(--body);letter-spacing:.2em;text-transform:uppercase;color:${T.dark ? 'var(--tagInk)' : 'var(--sub)'};margin-bottom:12px}
.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(240px,1fr));gap:12px}
.card{background:var(--surface);border-radius:var(--cardR);padding:24px 22px;${bordered}}
.card b,.row b{display:block;font:700 19px/1.25 var(--body);margin-bottom:8px}.card span,.row span{color:var(--sub);font-size:15px;line-height:1.55}
.rows{border-top:1px solid var(--line)}.row{padding:22px 0;border-bottom:1px solid var(--line);display:grid;gap:6px}
${T.upperLabels ? '.row b{font-size:14px;letter-spacing:.12em;text-transform:uppercase;font-weight:600}' : ''}
.band{background:${T.band || 'transparent'}}
.photos{display:grid;grid-template-columns:1.25fr 1fr;grid-template-rows:1fr 1fr;gap:10px;height:min(118vw,660px)}
.ph{position:relative;border-radius:var(--imgR);overflow:hidden;background:var(--surface)}.ph:first-child{grid-row:span 2}
.ph img{width:100%;height:100%;object-fit:cover;transition:transform 1.2s cubic-bezier(.2,.7,.2,1)}.ph:hover img{transform:scale(1.04)}
.note{margin-top:12px;color:var(--sub);font-size:13px}
.hours{display:flex;flex-direction:column;gap:6px;padding:20px 22px;border-radius:var(--cardR);background:var(--surface);margin-bottom:10px;font-size:15px;color:var(--sub);line-height:1.5;${bordered}}
.hours b{font:700 17px var(--body);color:var(--ink);margin-bottom:4px}
.reach{display:flex;flex-direction:column;gap:10px}
.reach a{display:flex;justify-content:space-between;align-items:center;gap:12px;padding:20px 22px;border-radius:var(--cardR);background:var(--surface);color:var(--ink);text-decoration:none;font:700 17px var(--body);${bordered}}
.reach a span{color:var(--link);font-weight:500;font-size:15px;text-align:right;min-width:0;overflow-wrap:anywhere}
footer{padding:36px 22px 140px;text-align:center;color:var(--sub);font-size:13px;line-height:1.7;border-top:1px solid color-mix(in srgb,var(--ink) 14%,transparent)}footer a{color:var(--ink)}
.ribbon{position:fixed;left:0;right:0;bottom:0;z-index:30;display:flex;gap:10px;align-items:center;justify-content:center;flex-wrap:wrap;background:color-mix(in srgb,${ribDark ? 'var(--heroBg)' : 'var(--bg)'} 88%,transparent);backdrop-filter:blur(14px);-webkit-backdrop-filter:blur(14px);border-top:1px solid color-mix(in srgb,${ribDark ? 'var(--heroInk)' : 'var(--ink)'} 14%,transparent);color:${ribDark ? 'color-mix(in srgb,var(--heroInk) 75%,transparent)' : 'var(--sub)'};font:500 13px/1.35 var(--body);padding:11px 16px calc(11px + env(safe-area-inset-bottom));text-align:center}
.ribbon b{color:${ribDark ? 'var(--heroInk)' : 'var(--ink)'};font-weight:700}.ribbon a{color:var(--onA);background:var(--a);font-weight:700;text-decoration:none;padding:7px 14px;border-radius:var(--btnR);white-space:nowrap}
${T.bodyAccent ? `section .cta{background:${T.bodyAccent};color:${T.bodyOnAccent}}` : ''}
.reveal{opacity:0;transform:translateY(26px);transition:opacity .9s cubic-bezier(.2,.7,.2,1),transform .9s cubic-bezier(.2,.7,.2,1)}.reveal.in{opacity:1;transform:none}
.heroText>*{animation:up .9s cubic-bezier(.2,.7,.2,1) both}.heroText>*:nth-child(2){animation-delay:.08s}.heroText>*:nth-child(3){animation-delay:.16s}.heroText>*:nth-child(4){animation-delay:.24s}
@keyframes up{from{opacity:0;transform:translateY(20px)}}
@media (min-width:900px){
  section{padding:104px 6vw}
  .h-split{display:grid;grid-template-columns:1.05fr 1fr;grid-template-rows:auto 1fr;align-items:center;min-height:94vh;padding-bottom:40px}
  .h-split .top{grid-column:1/-1}.h-split .heroText{padding:0 5vw 0 6vw}.h-split .heroImg{padding:0 6vw 0 0}.h-split .heroImg img{max-height:80vh}
  .h-center .heroImg{padding:0 6vw}.h-center .heroImg img{aspect-ratio:16/8}.h-center .heroText{padding:72px 6vw 44px}
  .h-overlay .heroText{padding:0 6vw 150px}
  .h-poster .heroImg img{aspect-ratio:16/7}.h-poster .heroText{padding:56px 6vw}
  .h-stack{display:grid;grid-template-columns:1.15fr 1fr;grid-template-rows:auto 1fr;min-height:100vh}.h-stack .top{grid-column:1/-1}
  .h-stack .heroImg img{aspect-ratio:auto;height:100%;min-height:78vh;max-height:88vh}.h-stack .heroText{padding:0 6vw;justify-content:center;border-bottom:0;border-left:1px solid var(--line)}
  .h-poster .poster{font-size:min(calc((100vw - 8vw) / ${posterEm}),200px)}
  .h-poster .poster{padding:20px 4vw 30px}
  .rows .row{grid-template-columns:1fr 1.6fr;gap:40px;align-items:baseline}
}
@media (prefers-reduced-motion:reduce){.h-overlay .bgimg,.heroText>*{animation:none!important}.reveal{opacity:1;transform:none;transition:none}}
</style></head><body class="theme-${themeKey}">
${hero}
${T.band ? `<div class="band">${svcSection}</div>` : svcSection}
<section class="reveal"><div class="eyebrow">${t.gallery}</div><h2>${t.see}</h2><div class="photos">${[1, 2, 3].map(i => `<div class="ph"><img src="${img(i)}" alt="${i <= own ? 'Photo from @' + esc(ig) : 'Sample photo'}" loading="lazy"></div>`).join('')}</div><p class="note">${own >= 3 ? t.own(esc(ig)) : own > 0 ? t.ownSome(own, esc(ig)) : t.sample}</p></section>
<section class="reveal"><div class="eyebrow">${t.visit}</div><h2>${t.find}</h2>${(l.hours || []).length ? `<div class="hours"><b>${esc(l.hoursTitle || t.hours)}</b>${l.hours.map(h => `<span>${esc(h)}</span>`).join('')}</div>` : ''}<div class="reach">${(l.links || []).map(k => `<a href="${esc(k.url)}" target="_blank" rel="noopener">${esc(k.label)} <span>${esc(k.url.replace(/^https?:\/\/(www\.)?/, '').replace(/\/$/, '').slice(0, 34))}</span></a>`).join('')}${tel ? `<a href="${tel}">${t.call} <span>${esc(l.phone)}</span></a>` : ''}<a href="${maps}" target="_blank" rel="noopener">${t.directions} <span>${esc(l.address || l.area || 'Miami')}</span></a><a href="${igUrl}" target="_blank" rel="noopener">Instagram <span>@${esc(ig)}</span></a></div></section>
<footer>${t.foot(esc(l.name))}<br><a href="https://instagram.com/dsmarketing.agency" target="_blank" rel="noopener">@dsmarketing.agency</a> · <a href="https://dsmarketing.company/portfolio" target="_blank" rel="noopener">dsmarketing.company</a></footer>
<div class="ribbon"><span>${t.rib(esc(l.name))}</span><a href="https://instagram.com/dsmarketing.agency" target="_blank" rel="noopener">${t.mine}</a></div>
<script>const io=new IntersectionObserver(es=>es.forEach(e=>{if(e.isIntersecting){e.target.classList.add('in');io.unobserve(e.target)}}),{threshold:.12});document.querySelectorAll('.reveal').forEach(el=>io.observe(el));</script>
</body></html>`;
  const dir = `${ROOT}public/p/${l.slug}`; mkdirSync(dir, { recursive: true }); writeFileSync(`${dir}/index.html`, html);
  console.log('preview', l.slug, themeKey);
}
