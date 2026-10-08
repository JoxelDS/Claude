// node tools/ds/preview.mjs leads.json → public/p/<slug>/index.html (free preview homepages for DS Marketing website outreach)
// One self-contained page per lead: photo hero, services, sample gallery, how to reach them, a "free preview by DS Marketing" ribbon.
// No invented facts: only the name, area, services and rating the research found. No fake reviews, no stock "customers".
// Photos are SAMPLES (public/p/_img/<niche>-1..3.jpg) and say so on the page — their own photos replace them on the real site.
import { readFileSync, writeFileSync, mkdirSync } from 'fs';
const ROOT = new URL('../../', import.meta.url).pathname;
const leads = JSON.parse(readFileSync(process.argv[2], 'utf8'));
const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const NICHE = {
  food: { font: 'Fraunces', w: '600;9..144,800', bg: '#120C08', ink: '#FFF4E8', sub: '#D9C3AE', label: 'Menu highlights', tag: 'Eat & drink', icon: '✦' },
  beauty: { font: 'Playfair Display', w: '600;700', bg: '#0F0B0E', ink: '#FFF2F6', sub: '#D8BFCB', label: 'Services', tag: 'Beauty', icon: '✦' },
  fitness: { font: 'Anton', w: '400', bg: '#07090C', ink: '#F2F6FF', sub: '#AAB6CC', label: 'Programs', tag: 'Training', icon: '◆' },
  home: { font: 'Archivo', w: '700;800', bg: '#0A0E12', ink: '#F4F7FA', sub: '#B3C0CC', label: 'What we do', tag: 'Home services', icon: '■' },
};
const opsz = f => f === 'Fraunces' ? 'ital,opsz,wght@0,9..144,600;0,9..144,800' : null;
for (const l of leads) {
  const key = NICHE[l.niche] ? l.niche : 'home'; const n = NICHE[key]; const a = l.accent || '#E8B04B';
  const ig = String(l.instagram || '').replace(/^@/, '');
  const fam = n.font.replace(/ /g, '+');
  const fontQ = opsz(n.font) ? `family=${fam}:${opsz(n.font)}` : `family=${fam}:wght@${n.w}`;
  const text = [l.name, l.heroTitle, l.heroSub, l.trade, ...(l.services || []).map(x => x.t + ' ' + x.d)].join(' ').toLowerCase();
  const PICK = { food: [[/truck|trailer|cart/, 3], [/caf[eé]|coffee|bakery|pastr|brunch|juice|smoothie|bowl/, 2]], beauty: [[/barber|fade|shave/, 1], [/nail|mani|pedi/, 2], [/spa|massage|facial|lash|brow|wax|skin|esthet/, 3]],
    fitness: [[/pilates|yoga|barre|stretch/, 2], [/box|mma|muay|jiu|martial|kickbox/, 3]], home: [[/pool/, 3], [/roof|exterior|paint|landscap|lawn|paver|window|pressure/, 2]] };
  const first = (l.heroImg && +l.heroImg) || ((PICK[key] || []).find(([re]) => re.test(text)) || [, 1])[1];
  const order = [first, ...[1, 2, 3].filter(i => i !== first)];
  const img = i => l.photos?.[i - 1] || `../_img/${key}-${order[i - 1]}.jpg`;
  const igUrl = `https://instagram.com/${esc(ig)}`;
  const maps = `https://www.google.com/maps/search/${encodeURIComponent(l.name + ' ' + (l.area || 'Miami'))}`;
  const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<title>${esc(l.name)} · ${esc(l.area || 'Miami')}</title><meta name="robots" content="noindex,nofollow">
<meta name="theme-color" content="${n.bg}">
<meta property="og:title" content="${esc(l.name)} · website preview"><meta property="og:description" content="${esc(l.heroSub)}"><meta property="og:image" content="${l.photos?.[0] ? l.photos[0].replace(/^\.\.\//, 'https://joxelds.github.io/Claude/p/') : `https://joxelds.github.io/Claude/p/_img/${key}-${first}.jpg`}">
<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?${fontQ}&family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet">
<link rel="preload" as="image" href="${img(1)}">
<style>
:root{--sans:Inter,system-ui,-apple-system,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;--bg:${n.bg};--ink:${n.ink};--sub:${n.sub};--a:${a};--line:color-mix(in srgb,var(--ink) 12%,transparent);--card:color-mix(in srgb,var(--ink) 5%,transparent)}
*{margin:0;box-sizing:border-box}html{scroll-behavior:smooth}body{background:var(--bg);color:var(--ink);font-family:var(--sans);-webkit-font-smoothing:antialiased;overflow-x:hidden}
img{display:block;max-width:100%}
a:focus-visible{outline:2px solid var(--a);outline-offset:3px}
.ribbon{position:fixed;left:0;right:0;bottom:0;z-index:30;display:flex;gap:10px;align-items:center;justify-content:center;flex-wrap:wrap;background:color-mix(in srgb,var(--bg) 82%,transparent);backdrop-filter:blur(14px);-webkit-backdrop-filter:blur(14px);border-top:1px solid var(--line);color:var(--sub);font:500 13px/1.35 var(--sans);padding:11px 16px calc(11px + env(safe-area-inset-bottom));text-align:center}
.ribbon b{color:var(--ink);font-weight:700}.ribbon a{color:#111;background:var(--a);font-weight:700;text-decoration:none;padding:7px 12px;border-radius:999px;white-space:nowrap}
.hero{min-height:100svh;display:flex;flex-direction:column;justify-content:flex-end;padding:110px 22px 120px;position:relative;isolation:isolate;overflow:hidden}
.hero .bgimg{position:absolute;inset:0;z-index:-2;width:100%;height:100%;object-fit:cover;transform:scale(1.08);animation:kb 18s ease-out forwards}
@keyframes kb{to{transform:scale(1)}}
.hero:after{content:"";position:absolute;inset:0;z-index:-1;background:linear-gradient(180deg,color-mix(in srgb,var(--bg) 45%,transparent) 0%,color-mix(in srgb,var(--bg) 15%,transparent) 22%,color-mix(in srgb,var(--bg) 70%,transparent) 48%,color-mix(in srgb,var(--bg) 92%,transparent) 75%,var(--bg) 100%)}
.top{position:absolute;top:0;left:0;right:0;display:flex;justify-content:space-between;align-items:center;padding:18px 22px;font:700 15px var(--sans);letter-spacing:.02em}
.top a{color:var(--ink);text-decoration:none;font:600 14px var(--sans);border:1px solid color-mix(in srgb,var(--ink) 30%,transparent);padding:8px 14px;border-radius:999px;background:color-mix(in srgb,var(--bg) 30%,transparent);backdrop-filter:blur(8px);-webkit-backdrop-filter:blur(8px)}
.tag{display:inline-block;align-self:flex-start;font:700 11px var(--sans);letter-spacing:.2em;text-transform:uppercase;color:#111;background:var(--a);padding:6px 10px;border-radius:6px;margin-bottom:18px}
.hero h1,.hero .lead{text-shadow:0 2px 24px color-mix(in srgb,var(--bg) 70%,transparent)}
h1{font-family:'${n.font}',${key === 'fitness' ? "Impact,'Arial Narrow',sans-serif" : key === 'home' ? 'var(--sans)' : "Georgia,'Times New Roman',serif"};font-weight:800;font-size:clamp(48px,12.5vw,112px);line-height:.94;letter-spacing:-.02em;max-width:12ch;text-wrap:balance}
${key === 'fitness' ? 'h1,h2{font-weight:400;text-transform:uppercase;letter-spacing:.01em}' : ''}
.lead{font-size:clamp(17px,4.4vw,21px);line-height:1.5;color:var(--ink);opacity:.86;margin-top:18px;max-width:36ch}
.ctas{display:flex;flex-wrap:wrap;gap:12px;margin-top:28px;align-items:center}
.cta{display:inline-flex;align-items:center;gap:10px;background:var(--a);color:#111;font:700 17px var(--sans);padding:16px 26px;border-radius:999px;text-decoration:none;box-shadow:0 14px 40px color-mix(in srgb,var(--a) 35%,transparent);transition:transform .2s}
.cta:hover{transform:translateY(-2px)}
.ghost{color:var(--ink);font:600 16px var(--sans);text-decoration:none;padding:15px 20px;border-radius:999px;border:1px solid color-mix(in srgb,var(--ink) 28%,transparent)}
.rating{display:inline-flex;gap:8px;align-items:center;margin-top:22px;font:600 14px var(--sans);color:var(--sub)}.rating b{color:var(--a)}
section{padding:72px 22px;max-width:1080px;margin:0 auto}
.eyebrow{font:600 12px var(--sans);letter-spacing:.2em;text-transform:uppercase;color:var(--a);margin-bottom:10px}
h2{font-family:'${n.font}',${key === 'fitness' ? "Impact,'Arial Narrow',sans-serif" : key === 'home' ? 'var(--sans)' : "Georgia,'Times New Roman',serif"};font-weight:800;font-size:clamp(34px,8.5vw,60px);line-height:1;letter-spacing:-.01em;margin-bottom:28px;text-wrap:balance}
.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(240px,1fr));gap:12px}
.card{background:var(--card);border:1px solid var(--line);border-radius:22px;padding:24px 22px;transition:border-color .3s,transform .3s}
.card:hover{border-color:color-mix(in srgb,var(--a) 50%,transparent);transform:translateY(-2px)}
.card b{display:block;font:700 19px/1.25 var(--sans);margin-bottom:8px}.card span{color:var(--sub);font-size:15px;line-height:1.55}
.card i{font-style:normal;color:var(--a);font-size:18px;display:block;margin-bottom:14px}
.photos{display:grid;grid-template-columns:1.25fr 1fr;grid-template-rows:1fr 1fr;gap:10px;height:min(118vw,640px)}
.ph{position:relative;border-radius:20px;overflow:hidden;background:var(--card)}
.ph:first-child{grid-row:span 2}
.ph img{width:100%;height:100%;object-fit:cover;transition:transform 1.2s cubic-bezier(.2,.7,.2,1)}
.ph:hover img{transform:scale(1.04)}
.note{margin-top:12px;color:var(--sub);font-size:13px}
.reach{display:flex;flex-direction:column;gap:10px}.reach a{display:flex;justify-content:space-between;align-items:center;gap:12px;padding:20px 22px;border-radius:18px;background:var(--card);border:1px solid var(--line);color:var(--ink);text-decoration:none;font:600 17px var(--sans)}
.reach a span{color:var(--sub);font-weight:500;font-size:15px;text-align:right}
footer{padding:36px 22px 130px;text-align:center;color:var(--sub);font-size:13px;line-height:1.7;border-top:1px solid var(--line)}
footer a{color:var(--ink)}
.reveal{opacity:0;transform:translateY(26px);transition:opacity .9s cubic-bezier(.2,.7,.2,1),transform .9s cubic-bezier(.2,.7,.2,1)}.reveal.in{opacity:1;transform:none}
.hero .tag,.hero h1,.hero .lead,.hero .ctas,.hero .rating{animation:up .9s cubic-bezier(.2,.7,.2,1) both}
.hero h1{animation-delay:.08s}.hero .lead{animation-delay:.18s}.hero .ctas{animation-delay:.28s}.hero .rating{animation-delay:.36s}
@keyframes up{from{opacity:0;transform:translateY(22px)}}
@media (min-width:900px){.hero{padding:140px 6vw 140px}section{padding:96px 6vw}}
@media (prefers-reduced-motion:reduce){.hero .bgimg,.hero *{animation:none!important}.reveal{opacity:1;transform:none;transition:none}}
</style></head><body>
<header class="hero">
<img class="bgimg" src="${img(1)}" alt="" fetchpriority="high">
<div class="top"><span>${esc(l.name)}</span><a href="${igUrl}" target="_blank" rel="noopener">@${esc(ig)}</a></div>
<div class="tag">${esc(l.area || 'Miami')} · ${n.tag}</div>
<h1>${esc(l.heroTitle || l.name)}</h1><p class="lead">${esc(l.heroSub || '')}</p>
<div class="ctas"><a class="cta" href="${igUrl}" target="_blank" rel="noopener">${esc(l.cta || 'Get in touch')} →</a><a class="ghost" href="#more">${n.label}</a></div>
${l.rating ? `<div class="rating"><b>★ ${esc(l.rating)}</b></div>` : ''}</header>
<section id="more" class="reveal"><div class="eyebrow">${esc(l.name)}</div><h2>${n.label}</h2><div class="grid">${(l.services || []).slice(0, 6).map(s => `<div class="card"><i>${n.icon}</i><b>${esc(s.t)}</b><span>${esc(s.d)}</span></div>`).join('')}</div></section>
<section class="reveal"><div class="eyebrow">Gallery</div><h2>See it for yourself</h2><div class="photos"><div class="ph"><img src="${img(1)}" alt="Sample photo" loading="lazy"></div><div class="ph"><img src="${img(2)}" alt="Sample photo" loading="lazy"></div><div class="ph"><img src="${img(3)}" alt="Sample photo" loading="lazy"></div></div><p class="note">Sample photos: your own photos go here.</p></section>
<section class="reveal"><div class="eyebrow">Visit</div><h2>Find us</h2><div class="reach"><a href="${igUrl}" target="_blank" rel="noopener">Instagram <span>@${esc(ig)}</span></a><a href="${maps}" target="_blank" rel="noopener">Directions <span>${esc(l.area || 'Miami')}</span></a></div></section>
<footer>This is a free preview made by DS Marketing. It is not ${esc(l.name)}'s official website.<br><a href="https://instagram.com/dsmarketing.agency" target="_blank" rel="noopener">@dsmarketing.agency</a> · <a href="https://dsmarketing.company/portfolio" target="_blank" rel="noopener">dsmarketing.company</a></footer>
<div class="ribbon"><span><b>Free preview for ${esc(l.name)}</b> by DS Marketing · live on your own domain in 48 h</span><a href="https://instagram.com/dsmarketing.agency" target="_blank" rel="noopener">Make it mine</a></div>
<script>const io=new IntersectionObserver(es=>es.forEach(e=>{if(e.isIntersecting){e.target.classList.add('in');io.unobserve(e.target)}}),{threshold:.12});document.querySelectorAll('.reveal').forEach(el=>io.observe(el));</script>
</body></html>`;
  const dir = `${ROOT}public/p/${l.slug}`; mkdirSync(dir, { recursive: true }); writeFileSync(`${dir}/index.html`, html);
  console.log('preview', l.slug);
}
