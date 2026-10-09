#!/usr/bin/env node
/* DS website generator v2 — production. One static page per lead: their name as the billboard, their own photos, their
 * menu / prices / hours / links, laid out so the owner says "I want that" on a phone in 5 seconds.
 *
 *   node tools/ds/site.mjs <leads.json> [--out public/p] [--mode preview|live] [--only slug,slug]
 *        [--claim-url "https://…{slug}…"] [--site https://client.com/] [--asset-base /Claude/p] [--no-og] [--debug]
 *
 *   preview (default): writes <out>/<slug>/index.html with the slim DS ribbon, the "Like what you see?" block and the footer
 *     disclaimer, noindex, no JSON-LD. "Make it mine" points at --claim-url (default https://ig.me/m/dsmarketing.agency);
 *     {slug} inside it becomes the lead slug, e.g. --claim-url "https://buy.stripe.com/<QuickStartLink>?client_reference_id={slug}".
 *     Assets are referenced absolutely (/Claude/p/_img/…, /Claude/p/_fonts/…) so a page works from any folder.
 *   live: no DS ribbon / block / disclaimer, index + canonical (--site), LocalBusiness JSON-LD; every image and font the page
 *     uses is COPIED to <out>/<slug>/assets/ and referenced as /assets/… (the client's own domain), unless --asset-base is set.
 *   v1 (tools/ds/preview.mjs) is untouched; this file + tools/ds/site/*.{mjs,js,py} + tools/ds/site-art.json are v2.
 *
 * DATA CONTRACT (one object per lead; only these facts reach the page — the generator re-lays them out, it never writes a claim)
 *   name slug niche(food|beauty|fitness|home) lang(en|es) area instagram(@handle)
 *   heroTitle            their one-line promise in their words (emoji stripped in display type; a superlative is quoted as theirs)
 *   heroSub              long line → meta description only (it repeats facts the page shows elsewhere)
 *   services[{t,d,price?}] 1–N rows; price "$30" | "from $40 · $50 with a haircut" | "$25.00 (online order, …)" → leader + chips + note
 *   promo?               one current offer, verbatim (the first $price is set big); fitness promos mark the matching plan SPECIAL
 *   proof[]              true facts WITH the platform: "4.6 stars on Uber Eats from 700+ ratings", "“Quote” — Uber Eats review",
 *                        "Serving Wynwood since 2018", "Alberto: 5.0 from 363 reviews on Booksy"; follower counts are never shown
 *   links[{label,url}]   order / book pages; "Book <Name>" = a person (team row) only when that person has their OWN link
 *   cta / ctaUrl         the primary action; no ctaUrl → tel: (never sms unless the lead says the number takes texts)
 *   phone address        "261 NW 36th St, Miami, FL 33127" · several streets joined with " · " · "7 lounges: A · B" · "Serving … (mobile service)"
 *   hours[] hoursTitle?  free text EN/ES ("Mon–Fri 9 AM – 9 PM", "Viernes y sábado · 5pm – 12:30am", class start lists) → site/hours.mjs
 *   brand{accent,onAccent,tagBg,tagInk,bg,surface,surface2,ink,sub,line,link,heroBg,mark}  colours sampled from their logo
 *   logo photos[3] ownPhotos  files in public/p/_img (<slug>-1..3.jpg, <slug>-logo.jpg); ownPhotos:false → labelled niche samples
 *   textOk?              true when the number takes texts (also inferred from "call or text" in cta / promo / heroSub)
 *   art?                 art direction (wins over tools/ds/site-art.json — see its _doc): layout, hero, focus, text, skip, posts,
 *                        pairs, wide, field, display, body, mark, mark2, btn, motif, ringText
 *
 * DESIGN SYSTEM
 *   Layouts (hero variants): cinematic = full-bleed own photo, the giant name over its bottom edge spilling into the page colour
 *     (only sharp photos with no baked-in text); field = brand-colour field, tilted framed photo with ONE rating sticker beside a
 *     status / prices column (the default for soft IG photos); arch = nails / salons, arch-cropped photo on cream; badge = no
 *     usable photo (flyers) → their logo in a rotating ring of their own words; pair = home services, before/after slider.
 *   First phone screen (390×844): name, promise, open-now pill, one proof line, a full-width primary CTA and Call / Directions
 *     tiles — all above 844 px; the sticky Call · Directions · Book bar appears only once those scroll away.
 *   Type: two families max (display = name + section heads only; body = everything else incl. prices, phones, platform names),
 *     Latin-subset woff2 with pinned axes (≤3 files, ~12–28 KB each), local fallbacks with size-adjust/ascent/descent from the
 *     page's own text, the name fitted to the width from build-time glyph metrics (no JS).
 *   Colour: the brand palette from the lead, every pair checked at build time (4.5:1 text, 3:1 display) and moved in lightness
 *     at the same hue when it fails; ONE flood band per page (the promo, else the best quote).
 *   Blocks, in decision order: hero → pick your barber → menu board (dotted leaders, full descriptions) → offer / plans →
 *     class day-tabs → proof (quote band + rating cards + facts) → own-photo grid → visit (hours, location / lounges / service
 *     area, tap-to-load map, more ways to order) → [preview: Like what you see?] → footer with the logo ring. ~4–5k px on a phone.
 *   One niche ornament as a divider (awning, papel picado, checker, arches, sparkle, deco rules, hazard tape, wave).
 *   Engineering: static HTML, inline CSS, ~2 KB inline JS hashed in a meta CSP (default-src 'none'), 0 external requests at load
 *     (the map iframe only after a tap), content visible without JS, every tap target ≥ 44 px, width/height on every image,
 *     480/720 WebP + JPEG fallback, hero preloaded with fetchpriority=high, prefers-reduced-motion respected.
 *   Build gate (exit 1): one h1, ≤3 font files, no Google Fonts / external src, img attrs, preview vs live markers, contrast,
 *     every number on the page found in the lead's own text, claim phrases (best, free estimate, licensed…) only when the lead says them.
 *
 * HOW TO TUNE
 *   A page looks wrong → fix the DATA first: art direction in tools/ds/site-art.json (hero photo, focus, layout, text photos,
 *   colours), facts in the lead. Fonts: DISPLAY / BODY tables + SUB_FONT (per niche default). Copy: STR. Motifs: MOTIFS.
 *   Section order: build() → H.push(…). Check a page: node <scratch>/shot.mjs p/_lab/final/<slug>/ <prefix> (phone + desktop).
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync, copyFileSync } from 'fs';
import { execFileSync } from 'child_process';
import { createHash } from 'crypto';
import { gzipSync } from 'zlib';
import { dirname, resolve, basename, relative, join } from 'path';
import { fileURLToPath } from 'url';
import { parseHours, compactModel } from './site/hours.mjs';
import { buildJsonLd, schemaType } from './site/schema.mjs';
import { fixFg, fixButton, ratio, lum, hex2rgb } from './site/contrast.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(HERE, '../..');
const PUB = join(REPO, 'public');
const ORIGIN = 'https://joxelds.github.io';
const WEBROOT = '/Claude';
const IMG_DIR = join(PUB, 'p/_img');
const FONT_DIR = join(PUB, 'p/_fonts');

// ---------------------------------------------------------------- CLI
const argv = process.argv.slice(2), pos = [], opt = {};
for (let i = 0; i < argv.length; i++) {
  const a = argv[i];
  if (['--out', '--mode', '--only', '--claim-url', '--site', '--asset-base'].includes(a)) opt[a.slice(2)] = argv[++i] ?? '';
  else if (a.startsWith('--')) opt[a.slice(2)] = true; else pos.push(a);
}
const leadsFile = pos[0];
if (!leadsFile) { console.error('usage: node tools/ds/site.mjs <leads.json> [--out public/p] [--mode preview|live] [--only a,b] [--claim-url URL] [--site URL] [--asset-base PATH] [--no-og]'); process.exit(2); }
const MODE = opt.mode === 'live' ? 'live' : 'preview';
const OUT = resolve(opt.out || join(PUB, 'p'));
const ONLY = opt.only ? String(opt.only).split(',').map(s => s.trim()).filter(Boolean) : null;
const CLAIM = String(opt['claim-url'] || 'https://ig.me/m/dsmarketing.agency');
const SITE = opt.site ? String(opt.site).replace(/\/?$/, '/') : '';
const NO_OG = !!opt['no-og'];
const DEBUG = !!opt.debug;
const ASSET_BASE = opt['asset-base'] ? String(opt['asset-base']).replace(/\/$/, '') : null;
const COPY_ASSETS = MODE === 'live' && !ASSET_BASE;
const webOf = abs => abs.startsWith(PUB) ? WEBROOT + abs.slice(PUB.length) : null;

// ---------------------------------------------------------------- helpers
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const sha = s => "'sha256-" + createHash('sha256').update(s, 'utf8').digest('base64') + "'";
const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
const toHex = rgb => '#' + rgb.map(v => clamp(Math.round(v), 0, 255).toString(16).padStart(2, '0')).join('');
const mix = (a, b, t) => { const A = hex2rgb(a), B = hex2rgb(b); return toHex(A.map((v, i) => v + (B[i] - v) * t)); };
const isHex = s => /^#[0-9a-f]{3}([0-9a-f]{3})?$/i.test(String(s || ''));
const norm = h => { h = String(h).toLowerCase(); return h.length === 4 ? '#' + [...h.slice(1)].map(c => c + c).join('') : h; };
const words = s => String(s || '').split(/\s+/).filter(Boolean);
const fold = s => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
const noEmoji = s => String(s || '').replace(/[\p{Extended_Pictographic}\u{FE0F}\u{200D}\u{1F3FB}-\u{1F3FF}]/gu, '').replace(/\s+([,.!?])/g, '$1').replace(/\s{2,}/g, ' ').replace(/\s*\+\s*$/, '').trim();
const digits = p => String(p || '').replace(/\D/g, '').replace(/^1(?=\d{10}$)/, '');
const e164 = p => { const d = digits(p); return d.length === 10 ? '+1' + d : ''; };
const fmtPhone = p => { const d = digits(p); return d.length === 10 ? `(${d.slice(0, 3)}) ${d.slice(3, 6)}-${d.slice(6)}` : String(p || ''); };
const hashNum = s => { let h = 2166136261; for (const c of String(s)) { h ^= c.charCodeAt(0); h = Math.imul(h, 16777619); } return h >>> 0; };
const svgUri = svg => `url("data:image/svg+xml,${encodeURIComponent(svg).replace(/'/g, '%27').replace(/"/g, '%22')}")`;
const EN_WORDS = /\b(the|and|is|was|best|in town|for|with|my|i|ever|awesome|amazing|workout|craving|as a|since|serving|stars|ratings|reviews?|town|hair stylist)\b/gi;
const ES_WORDS = /\b(el|la|los|las|y|con|para|desde|nuestro|nuestra|de|en|del|muy|mejor|reseñas?)\b/gi;
const looksEn = s => (String(s).match(EN_WORDS) || []).length >= 1 && !/[áéíóúñ¿¡]/i.test(s) && (String(s).match(ES_WORDS) || []).length < 2;
const looksEs = s => (String(s).match(ES_WORDS) || []).length >= 2 || /[ñ¿¡]/.test(s);
function langSpan(text, pageLang) {                          // foreign-language strings get their own lang so screen readers switch voice
  const t = esc(text);
  if (pageLang === 'es' && looksEn(text)) return `<span lang="en">${t}</span>`;
  if (pageLang === 'en' && looksEs(text) && !looksEn(text)) return `<span lang="es">${t}</span>`;
  return t;
}
const PLATFORMS = [[/ubereats\./, 'Uber Eats'], [/grubhub\./, 'Grubhub'], [/doordash\./, 'DoorDash'], [/ezcater\./, 'ezCater'], [/postmates\./, 'Postmates'],
  [/order\.online/, 'Online order'], [/booksy\./, 'Booksy'], [/fresha\./, 'Fresha'], [/square(up)?\.|square\.site/, 'Square'], [/vagaro\./, 'Vagaro'],
  [/styleseat\./, 'StyleSeat'], [/mindbody/, 'Mindbody'], [/classpass\./, 'ClassPass'], [/as\.me|acuityscheduling/, 'Online booking'], [/toasttab\./, 'Toast'],
  [/clover\./, 'Clover'], [/instagram\./, 'Instagram'], [/yelp\./, 'Yelp'], [/google\./, 'Google'], [/facebook\./, 'Facebook'], [/tiktok\./, 'TikTok'],
  [/whatsapp|wa\.me/, 'WhatsApp'], [/birdeye\./, 'Birdeye']];
const CONSUMER = new Set(['Uber Eats', 'Grubhub', 'DoorDash', 'ezCater', 'Booksy', 'Fresha', 'Square', 'Vagaro', 'StyleSeat', 'Mindbody', 'ClassPass', 'Toast']);
const platformOf = u => { const s = String(u || '').toLowerCase(); for (const [re, n] of PLATFORMS) if (re.test(s)) return n; try { return new URL(u).hostname.replace(/^www\./, ''); } catch { return ''; } };
const isStreet = a => /^\d{2,6}\s+(?:[NSEW]{1,2}\s+)?[\w.' -]*?\b(?:St|Street|Ave|Avenue|Blvd|Boulevard|Rd|Road|Dr|Drive|Ct|Court|Ter|Terrace|Way|Hwy|Highway|Pl|Place|Ln|Lane|Pkwy|Parkway|Cswy|Causeway|Cir|Circle|Trl|Trail|Plaza|Path)\b/i.test(String(a || '').trim());
const mapsQ = a => { const s = String(a).trim(); return /\bFL\b|Florida/i.test(s) ? s : `${s}, FL`; };
const dirUrl = a => `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(mapsQ(a))}`;
const searchUrl = a => `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(mapsQ(a))}`;
const streetKey = s => { const m = fold(s).replace(/(\d+)(st|nd|rd|th)\b/g, '$1').match(/\b(nw|ne|sw|se|n|s|e|w)\s+(\d{1,3})\b/); return m ? m[1] + m[2] : ''; };
const stem = w => fold(w).replace(/[^a-z0-9]/g, '').slice(0, 6);
const SIG_SKIP = new Set(['online', 'order', 'pedir', 'book', 'reservar', 'with', 'from', 'your', 'para', 'cita', 'shop', 'perfil', 'profile', 'class', 'schedule']);
const sigWords = s => words(fold(s).replace(/[^a-z0-9 ]/g, ' ')).filter(w => w.length >= 4 && !SIG_SKIP.has(w)).map(stem);
const ICON = {
  call: '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M6.6 10.8a15.2 15.2 0 0 0 6.6 6.6l2.2-2.2a1 1 0 0 1 1-.25 11.4 11.4 0 0 0 3.6.57 1 1 0 0 1 1 1V20a1 1 0 0 1-1 1A17 17 0 0 1 3 4a1 1 0 0 1 1-1h3.5a1 1 0 0 1 1 1c0 1.25.2 2.45.57 3.57a1 1 0 0 1-.25 1z" fill="currentColor"/></svg>',
  dir: '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M12 2a7 7 0 0 0-7 7c0 5.2 7 13 7 13s7-7.8 7-13a7 7 0 0 0-7-7zm0 9.5A2.5 2.5 0 1 1 12 6.5a2.5 2.5 0 0 1 0 5z" fill="currentColor"/></svg>',
  go: '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M5 12h12m-5-6 6 6-6 6" stroke="currentColor" stroke-width="2.2" fill="none" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  out: '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M8 16 16 8m-6 0h6v6" stroke="currentColor" stroke-width="2.2" fill="none" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  down: '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M12 5v13m-6-6 6 6 6-6" stroke="currentColor" stroke-width="2.2" fill="none" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  text: '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M4 4h16a1 1 0 0 1 1 1v11a1 1 0 0 1-1 1H8l-4 4V5a1 1 0 0 1 1-1z" fill="currentColor"/></svg>',
  ig: '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><rect x="3" y="3" width="18" height="18" rx="5" stroke="currentColor" stroke-width="2" fill="none"/><circle cx="12" cy="12" r="4.2" stroke="currentColor" stroke-width="2" fill="none"/><circle cx="17.4" cy="6.6" r="1.3" fill="currentColor"/></svg>',
  star: '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="m12 2.6 2.9 6 6.6.9-4.8 4.6 1.2 6.5L12 17.5l-5.9 3.1 1.2-6.5L2.5 9.5l6.6-.9z" fill="currentColor"/></svg>',
  award: '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><circle cx="12" cy="9" r="6" stroke="currentColor" stroke-width="2" fill="none"/><path d="m8.5 14-1.5 7 5-2.5 5 2.5-1.5-7" stroke="currentColor" stroke-width="2" fill="none" stroke-linejoin="round"/></svg>',
  check: '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="m5 12.5 4.5 4.5L19 7.5" stroke="currentColor" stroke-width="2.4" fill="none" stroke-linecap="round" stroke-linejoin="round"/></svg>',
};
const stars = (v, id) => {                                  // fractional 5-star row (decorative; the number is the text)
  const pct = clamp(parseFloat(v) / 5, 0, 1) * 100;
  const row = x => `<path transform="translate(${x} 0)" d="m12 2.6 2.9 6 6.6.9-4.8 4.6 1.2 6.5L12 17.5l-5.9 3.1 1.2-6.5L2.5 9.5l6.6-.9z"/>`;
  return `<svg class="stars" viewBox="0 0 120 24" aria-hidden="true" focusable="false"><defs><clipPath id="${id}"><rect width="${(pct * 1.2).toFixed(1)}" height="24"/></clipPath></defs><g fill="currentColor" opacity=".22">${[0, 24, 48, 72, 96].map(row).join('')}</g><g fill="currentColor" clip-path="url(#${id})">${[0, 24, 48, 72, 96].map(row).join('')}</g></svg>`;
};

// ---------------------------------------------------------------- strings
const STR = {
  en: {
    skip: 'Skip to content', ribbonLabel: 'Preview notice', ribbon: n => `<b>Free preview for ${esc(n)}</b> <span>by DS Marketing</span>`, mine: 'Make it mine',
    foot: n => `This is a free preview made by DS Marketing. It is not the official website of ${esc(n)}.`,
    dsEye: 'DS Marketing', dsH: 'Like what you see? This website can be yours.', dsList: ['On your own domain', 'Live in 48 hours', 'Your real photos, menu and links'], dsSmall: 'Free preview · no commitment',
    menu: { food: 'The menu', cafe: 'The menu', barber: 'Cuts & prices', nails: 'Services & prices', salon: 'Services & prices', gym: 'The classes', studio: 'The classes', home: 'What we do' },
    menuNP: { nails: 'Our nails', salon: 'Services', barber: 'Services' },
    menuEye: { food: 'Straight from the window', truck: 'Straight from the truck', cafe: 'Fresh today', barber: 'Price board', nails: 'The menu', salon: 'The menu', gym: 'Train with us', studio: 'Train with us', home: 'Services' },
    plans: 'Memberships', plansEye: 'Join', special: 'Special', was: 'was', join: 'Join', perMo: '/mo',
    classes: 'This week’s classes', classesEye: 'Class times', noClasses: 'No classes', classList: 'The classes', days: ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'], daysL: ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'],
    reviews: 'What people say', reviewsEye: 'Reviews', seeOn: p => `See it on ${p}`, review: p => `${p} review`, on: p => `on ${p}`,
    photosEye: 'On Instagram', photosFrom: h => `Photos from @${h} on Instagram`, sample: 'Sample photos — your own photos go here', sampleTag: 'Sample photo', seeIg: 'See more on Instagram', photoBy: h => `Photo · @${h}`, post: 'Post',
    hours: 'Hours', visit: 'Visit us', area: 'Service area', today: 'today', loungesT: n => `${n} lounges`,
    call: 'Call', callTo: 'Call to book', text: 'Text', textPhoto: 'Text a photo', dir: 'Directions', openMaps: 'Open in Google Maps', showMap: 'Show the map here', mapT: a => `Map: ${a}`,
    quick: 'Quick actions', more: { food: 'More ways to order', beauty: 'More ways to book', fitness: 'More ways to book', home: 'More ways to reach us' },
    verb: { food: 'Order', beauty: 'Book', fitness: 'Book', home: 'Estimate' }, team: 'Pick your barber', teamS: 'Pick your stylist', bookWith: n => `Book with ${n}`, book: 'Book', order: 'Order',
    now: 'Right now', offer: 'Right now', since: y => `Since ${y}`, ba: 'Before / after', before: 'Before', after: 'After', drag: 'Drag to compare before and after',
    estH: 'Free estimate', estP: 'Type your address, then send us a text with a photo of the job.', estPh: 'Your address or area', estBtn: 'Text for a free estimate',
    estBody: 'Hi! I would like a free estimate. My address: ',
    end: { food: 'Hungry?', cafe: 'See you soon', barber: 'Ready for a fresh cut?', nails: 'Ready for your next set?', salon: 'Ready for your next visit?', gym: 'Ready to train?', studio: 'Ready to train?', home: 'Tell us about the job' },
    loc: 'Locations', locs: n => `${n} locations`, theirWords: 'in their words', nav: 'Sections', moreLoc: 'Locations',
  },
  es: {
    skip: 'Saltar al contenido', ribbonLabel: 'Aviso de vista previa', ribbon: n => `<b>Vista previa gratis para ${esc(n)}</b> <span>por DS Marketing</span>`, mine: 'La quiero',
    foot: n => `Esta es una vista previa gratis hecha por DS Marketing. No es la página oficial de ${esc(n)}.`,
    dsEye: 'DS Marketing', dsH: '¿Te gusta? Esta página puede ser tuya.', dsList: ['Con tu propio dominio', 'En vivo en 48 horas', 'Con tus fotos, tu menú y tus enlaces'], dsSmall: 'Vista previa gratis · sin compromiso',
    menu: { food: 'La carta', cafe: 'La carta', barber: 'Cortes y precios', nails: 'Servicios y precios', salon: 'Servicios y precios', gym: 'Las clases', studio: 'Las clases', home: 'Lo que hacemos' },
    menuNP: { nails: 'Nuestras uñas', salon: 'Servicios', barber: 'Servicios' },
    menuEye: { food: 'Desde la ventanilla', truck: 'Desde el truck', cafe: 'Hecho hoy', barber: 'Lista de precios', nails: 'El menú', salon: 'El menú', gym: 'Entrena con nosotros', studio: 'Entrena con nosotros', home: 'Servicios' },
    plans: 'Membresías', plansEye: 'Únete', special: 'Especial', was: 'antes', join: 'Unirme', perMo: '/mes',
    classes: 'Clases de la semana', classesEye: 'Horario de clases', noClasses: 'Sin clases', classList: 'Las clases', days: ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'], daysL: ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'],
    reviews: 'Lo que dicen', reviewsEye: 'Reseñas', seeOn: p => `Ver en ${p}`, review: p => `Reseña en ${p}`, on: p => `en ${p}`,
    photosEye: 'En Instagram', photosFrom: h => `Fotos de @${h} en Instagram`, sample: 'Fotos de muestra — aquí van las tuyas', sampleTag: 'Foto de muestra', seeIg: 'Ver más en Instagram', photoBy: h => `Foto · @${h}`, post: 'Post',
    hours: 'Horario', visit: 'Visítanos', area: 'Zona de servicio', today: 'hoy', loungesT: n => `${n} salones`,
    call: 'Llamar', callTo: 'Llamar para reservar', text: 'Mensaje', textPhoto: 'Manda una foto', dir: 'Cómo llegar', openMaps: 'Abrir en Google Maps', showMap: 'Ver el mapa aquí', mapT: a => `Mapa: ${a}`,
    quick: 'Acciones rápidas', more: { food: 'Más formas de pedir', beauty: 'Más formas de reservar', fitness: 'Más formas de reservar', home: 'Más formas de contactarnos' },
    verb: { food: 'Pedir', beauty: 'Reservar', fitness: 'Reservar', home: 'Cotizar' }, team: 'Elige tu barbero', teamS: 'Elige tu estilista', bookWith: n => `Reservar con ${n}`, book: 'Reservar', order: 'Pedir',
    now: 'Ahora mismo', offer: 'Ahora mismo', since: y => `Desde ${y}`, ba: 'Antes / después', before: 'Antes', after: 'Después', drag: 'Desliza para comparar el antes y el después',
    estH: 'Cotización gratis', estP: 'Escribe tu dirección y mándanos un mensaje con una foto del trabajo.', estPh: 'Tu dirección o zona', estBtn: 'Pedir cotización por mensaje',
    estBody: '¡Hola! Quiero una cotización gratis. Mi dirección: ',
    end: { food: '¿Con hambre?', cafe: 'Te esperamos', barber: '¿Listo para un corte?', nails: 'Reserva tu próximo set', salon: 'Reserva tu próxima cita', gym: '¿Listo para entrenar?', studio: '¿Listo para entrenar?', home: 'Cuéntanos del trabajo' },
    loc: 'Locales', locs: n => `${n} locales`, theirWords: 'en sus palabras', nav: 'Secciones', moreLoc: 'Locales',
  },
};
// fixed patterns in the owner's own facts → Spanish framing on es pages (the facts stay theirs); anything else keeps lang="en"
function factEs(p) {
  let m;
  if ((m = p.match(/^Serving (.+?) since ((?:19|20)\d{2})$/i))) return `Sirviendo en ${m[1]} desde ${m[2]}`;
  if ((m = p.match(/^(?:Open|In business|Opened) since ((?:19|20)\d{2})$/i))) return `Desde ${m[1]}`;
  if (/^Licensed (&|and) insured$/i.test(p)) return 'Con licencia y seguro';
  if (/^Free estimates?$/i.test(p)) return 'Cotizaciones gratis';
  return null;
}
const unitL = (u, lang) => lang === 'es' ? ({ ratings: 'calificaciones', rating: 'calificación', reviews: 'reseñas', review: 'reseña' }[String(u).toLowerCase()] || u) : u;
const srcL = (src, lang) => { const m = String(src).match(/^(.+?)\s+review$/i); if (m) return STR[lang].review(m[1]); const n = String(src).match(/^reseña en (.+)$/i); return n ? STR[lang].review(n[1]) : src; };

// ---------------------------------------------------------------- fonts (self-hosted kit; subset + pinned axes by site/assets.py)
// cat: serif | condensed | grotesque | script ; upper = set in caps ; lh = line-height of the name ; restDisp = the rest of the
// name ("Food Truck", "Nail Lounge") set in the display face too (else tracked body caps) ; r = button radius ; rc = card radius
const DISPLAY = {
  shrikhand: { fam: 'Shrikhand', file: 'shrikhand-400.woff2', axes: '-', w: 400, cat: 'script', upper: false, ls: -0.005, lh: 1.0, restDisp: true, r: '999px', rc: '22px' },
  archivoblack: { fam: 'Archivo Black', file: 'archivo-black-400.woff2', axes: '-', w: 400, cat: 'grotesque', upper: true, ls: -0.01, lh: 0.94, r: '12px', rc: '14px' },
  archivoi: { fam: 'Archivo', file: 'archivo-italic.woff2', axes: 'wght=800,wdth=100', w: 800, style: 'italic', cat: 'grotesque', upper: true, ls: -0.015, lh: 0.92, r: '10px', rc: '12px' },
  anton: { fam: 'Anton', file: 'anton-400.woff2', axes: '-', w: 400, cat: 'condensed', upper: true, ls: 0.004, lh: 0.94, r: '4px', rc: '6px' },
  bigshoulders: { fam: 'Big Shoulders Display', file: 'big-shoulders-display.woff2', axes: 'wght=900', w: 900, cat: 'condensed', upper: true, ls: 0.0, lh: 0.88, r: '4px', rc: '6px' },
  cinzel: { fam: 'Cinzel', file: 'cinzel.woff2', axes: 'wght=700', w: 700, cat: 'serif', upper: true, ls: 0.02, lh: 0.98, r: '2px', rc: '4px', restDisp: true },
  bodoni: { fam: 'Bodoni Moda', file: 'bodoni-moda.woff2', axes: 'wght=500,opsz=96', w: 500, cat: 'serif', upper: true, ls: 0.01, lh: 0.94, r: '999px', rc: '2px', restDisp: true },
  cormorant: { fam: 'Cormorant Garamond', file: 'cormorant-garamond.woff2', axes: 'wght=600', w: 600, ital: { file: 'cormorant-garamond-italic.woff2', axes: 'wght=500', w: 500 }, cat: 'serif', upper: false, ls: -0.01, lh: 0.9, restDisp: true, restItal: true, r: '999px', rc: '28px' },
  playfair: { fam: 'Playfair Display', file: 'playfair-display-italic.woff2', axes: 'wght=700', w: 700, style: 'italic', cat: 'serif', upper: false, ls: -0.02, lh: 0.95, restDisp: true, r: '999px', rc: '24px' },
  dmserif: { fam: 'DM Serif Display', file: 'dm-serif-display-400.woff2', axes: '-', w: 400, cat: 'serif', upper: false, ls: -0.015, lh: 0.9, restDisp: true, r: '999px', rc: '22px' },
  fraunces: { fam: 'Fraunces', file: 'fraunces.woff2', axes: 'wght=700,opsz=144,SOFT=50,WONK=1', w: 700, cat: 'serif', upper: false, ls: -0.02, lh: 0.92, restDisp: true, r: '999px', rc: '18px' },
  young: { fam: 'Young Serif', file: 'young-serif-400.woff2', axes: '-', w: 400, cat: 'serif', upper: false, ls: -0.02, lh: 0.94, restDisp: true, r: '999px', rc: '18px' },
};
const BODY = {
  figtree: { fam: 'Figtree', file: 'figtree.woff2', axes: 'wght=400:800', range: '400 800' },
  manrope: { fam: 'Manrope', file: 'manrope.woff2', axes: 'wght=400:800', range: '400 800' },
  karla: { fam: 'Karla', file: 'karla.woff2', axes: 'wght=400:800', range: '400 800' },
  dmsans: { fam: 'DM Sans', file: 'dm-sans.woff2', axes: 'wght=400:800,opsz=14', range: '400 800' },
};
const SUB_FONT = { food: ['archivoblack', 'figtree'], cafe: ['fraunces', 'figtree'], barber: ['anton', 'manrope'], nails: ['playfair', 'karla'],
  salon: ['bodoni', 'manrope'], gym: ['bigshoulders', 'figtree'], studio: ['playfair', 'karla'], home: ['archivoi', 'figtree'] };
const KIT = JSON.parse(readFileSync(join(FONT_DIR, 'fonts.json'), 'utf8'));
for (const d of [...Object.values(DISPLAY), ...Object.values(BODY)]) for (const f of [d.file, d.ital?.file].filter(Boolean)) if (!KIT.some(k => k.file === f)) throw new Error('font not in kit: ' + f);
const subFile = (file, axes) => `s/${file.replace(/\.woff2$/, '')}.${axes === '-' ? 'static' : axes.replace(/[=:,]/g, m => ({ '=': '', ':': '-', ',': '.' }[m]))}.woff2`;

function subtype(l) {
  const s = fold(`${l.name} ${l.heroSub || ''} ${(l.services || []).map(x => x.t).join(' ')}`);
  if (l.subtype) return l.subtype;
  if (l.niche === 'food') return /bakery|panader|cake|pastel|donut|bagel|coffee|cafe|espresso|bakes/.test(s) ? 'cafe' : 'food';
  if (l.niche === 'beauty') { if (/barber|fade|beard|barba/.test(s)) return 'barber'; return schemaType(l) === 'NailSalon' ? 'nails' : 'salon'; }
  if (l.niche === 'fitness') return /yoga|pilates|barre/.test(s) ? 'studio' : 'gym';
  return 'home';
}

// ---------------------------------------------------------------- name → billboard (full name, in its own order)
const GENERIC = new Set(['food', 'truck', 'trucks', 'barbershop', 'barber', 'barbers', 'barberia', 'shop', 'nail', 'nails', 'lounge', 'salon', 'spa', 'beauty',
  'studio', 'gym', 'fitness', 'kitchen', 'cafe', 'bakery', 'grill', 'restaurant', 'pressure', 'cleaning', 'washing', 'services', 'service', 'llc', 'inc', 'co', 'boxing', 'bar', 'hair', 'stylist']);
function splitName(name, area) {                            // "Elite Barbershop Doral" → mark "Elite" + rest "Barbershop Doral"; never reordered
  const ws = words(name), areaW = new Set(words(area).map(w => fold(w).replace(/[^a-z0-9]/g, '')));
  let k = ws.length;
  for (let i = 1; i < ws.length; i++) { const w = fold(ws[i]).replace(/[^a-z0-9&]/g, ''); if (GENERIC.has(w) || areaW.has(w)) { k = i; break; } }
  return { mark: ws.slice(0, k).join(' '), rest: ws.slice(k).join(' ') };
}

// ---------------------------------------------------------------- proof (re-layout only; never new facts)
function parseProof(list = [], services = []) {
  const out = { ratings: [], persons: [], quotes: [], since: null, press: [], facts: [] };
  const titles = services.map(s => fold(s.t).split(/\s+/).slice(0, 2).join(' '));
  for (const raw of list) {
    const s = String(raw).trim(); let m;
    if (/followers|seguidores/i.test(s)) continue;                                            // follower counts are weak proof: never shown
    if ((m = s.match(/^[“"](.+?)[”"]\s*[—–-]\s*(.+)$/))) { out.quotes.push({ q: m[1], src: m[2], raw: s }); continue; }
    if ((m = s.match(/^([A-ZÁÉÍÓÚÑ][\p{L}.]+(?: [A-ZÁÉÍÓÚÑ][\p{L}.]+)?):\s*(\d(?:\.\d{1,2})?)\s+(?:from|con|de)\s+([\d.,]+\+?)\s+(reviews|ratings|reseñas)\s+(?:on|en)\s+(.+)$/u))) {
      out.persons.push({ who: m[1], v: m[2], n: m[3], unit: m[4], plat: m[5], raw: s }); continue; }
    if ((m = s.match(/^(\d(?:\.\d{1,2})?)\s*(?:stars?\s*|estrellas\s*)?(?:on|en)\s+(.+?)\s+(?:from|con|de)\s+([\d.,]+\+?)\s+(reviews|ratings|reseñas|calificaciones|opiniones)$/i))
      || (m = s.match(/^(\d(?:\.\d{1,2})?)\s*(?:stars?\s*)?(?:on|en)\s+(.+?)\s*\(([\d.,]+\+?)\s+(ratings|reviews|reseñas)\)$/i))) {
      out.ratings.push({ v: m[1], plat: m[2], n: m[3], unit: m[4], raw: s }); continue; }
    if ((m = s.match(/^(\d(?:\.\d{1,2})?)\s*(?:stars?|estrellas)\s+(?:from|con|de)\s+([\d.,]+\+?)\s+(reviews|ratings|reseñas)\s+(?:on|en)\s+(.+)$/i))) {
      out.ratings.push({ v: m[1], plat: m[4], n: m[2], unit: m[3], raw: s }); continue; }
    const pre = fold(s.split(':')[0]);                                                           // "Birria Quesadilla: the most liked…" repeats a menu row
    if (s.includes(':') && titles.some(t => t && pre.startsWith(t))) continue;
    const y = s.match(/\b(?:since|desde|est\.?)\s+((?:19|20)\d\d)\b/i);
    if (y && !out.since) { out.since = { year: y[1], raw: s }; continue; }
    if (/award|premio|featured|destacad|as seen|press|magazine|times|herald|diario|eater/i.test(s)) { out.press.push(s); continue; }
    out.facts.push(s);
  }
  const cnt = r => parseFloat(String(r.n).replace(/[^\d.]/g, '')) * (/k\b/i.test(r.n) ? 1000 : 1) || 0;
  out.ratings.forEach(r => { r.count = cnt(r); });
  out.ratings.sort((a, b) => b.count - a.count);
  return out;
}

// ---------------------------------------------------------------- prices: "from $25 · $50 with a haircut" → leader + chips + note
function splitPrice(p) {
  const s = String(p || '').trim(); if (!s) return null;
  let note = '';
  const parts = s.split(/\s+·\s+/).map(x => { const m = x.match(/^(.*?)\s*\(([^)]+)\)\s*$/); if (m) { note = m[2]; return m[1]; } return x; }).filter(Boolean);
  if (parts.length >= 3 || parts[0].length > 16) return { lead: '', chips: parts, note };
  return { lead: parts[0], chips: parts.slice(1), note };
}

// ---------------------------------------------------------------- colour: the brand palette, every pair checked (4.5 text / 3 display)
function palette(l, art, layout) {
  const b = Object.fromEntries(Object.entries(l.brand || {}).filter(([, v]) => isHex(v)).map(([k, v]) => [k, norm(v)]));
  const accent = b.accent && b.accent !== '#111111' ? b.accent : (b.link || b.tagBg || b.accent || '#111111');
  const darkTheme = /noir|darkroom|runway/.test(String(l.theme || ''));
  let dark;
  if (b.bg) dark = lum(b.bg) < 0.2; else if (b.heroBg && lum(b.heroBg) < 0.12 && darkTheme) dark = true; else dark = darkTheme && !b.surface;
  const P = { dark, b };
  if (dark) {
    P.bg = b.bg || (b.heroBg ? b.heroBg : mix(accent, '#000000', 0.94));
    P.surf = b.surface || mix(P.bg, '#ffffff', 0.06);
    P.surf2 = b.surface2 || mix(P.surf, '#ffffff', 0.07);
    P.ink = b.ink || mix(accent, '#ffffff', 0.92);
    P.sub = b.sub || mix(P.ink, P.bg, 0.3);
    P.line = b.line || mix(P.ink, P.bg, 0.8);
  } else {
    P.bg = b.bg || mix(b.surface || mix(accent, '#ffffff', 0.94), '#ffffff', 0.5);
    P.surf = b.surface || mix(accent, '#ffffff', 0.93);
    P.surf2 = b.surface2 || mix(accent, '#ffffff', 0.86);
    P.ink = b.ink || mix(accent, '#000000', 0.86);
    P.sub = b.sub || mix(P.ink, P.bg, 0.32);
    P.line = b.line || mix(accent, P.bg, 0.78);
  }
  if (ratio(P.line, P.bg) > 4 && !dark) P.line = mix(P.line, P.bg, 0.55);                   // a near-black "line" reads as a border, not a hairline
  const worst = (fg, bgs, min = 4.5) => bgs.reduce((c, bg) => fixFg(c, bg, min), fg);
  P.sub = worst(worst(P.sub, [P.bg, P.surf, P.surf2]), [P.bg, P.surf, P.surf2]);
  P.ink = worst(P.ink, [P.bg, P.surf, P.surf2]);
  const btn = fixButton(accent, b.onAccent || '#ffffff'); P.a = btn.fill; P.onA = btn.ink;
  P.link = worst(worst(dark ? accent : (b.link || accent), [P.bg, P.surf]), [P.bg, P.surf]);
  P.mark = fixFg(art.markPage || b.mark || accent, P.bg, 3);
  // the hero field: art.field → brand heroBg → (dark page) the page → the accent
  P.fl = norm(art.field || b.heroBg || (dark ? P.bg : P.a));
  P.flIsA = P.fl === P.a;
  P.onFl = ratio('#ffffff', P.fl) >= ratio('#111111', P.fl) ? '#ffffff' : '#111111';
  P.flDark = lum(P.fl) < 0.18;
  if (!P.flDark && !P.flIsA && ratio(P.ink, P.fl) >= 4.5) P.onFl = P.ink;
  P.flSub = fixFg(mix(P.onFl, P.fl, 0.24), P.fl, 4.5);
  P.flLine = mix(P.onFl, P.fl, P.flDark ? 0.78 : 0.7);
  P.flSurf = mix(P.fl, P.onFl, P.flDark ? 0.08 : 0.1);
  const markCands = P.flIsA ? [art.mark, P.onFl] : [art.mark, b.mark, b.accent, b.tagBg, b.link, P.onFl];
  P.mk = norm(markCands.filter(isHex).map(norm).find(c => ratio(c, P.fl) >= 3) || P.onFl);
  P.mk2 = isHex(art.mark2) && ratio(norm(art.mark2), P.fl) >= 3 ? norm(art.mark2) : P.mk;
  // the hero button on the field
  const btnCands = P.flIsA ? [art.btn, P.onFl] : [art.btn, P.a, b.surface2, b.tagBg, P.onFl];
  const bf = norm(btnCands.filter(isHex).map(norm).find(c => ratio(c, P.fl) >= 3) || P.onFl);
  const bb = fixButton(bf, bf === P.onFl ? P.fl : (b.tagInk && bf === b.tagBg ? b.tagInk : (bf === P.a ? P.onA : '#111111')));
  P.flBtn = bb.fill; P.onFlBtn = bb.ink;
  P.focus = ratio('#1a5cff', P.bg) >= 3 ? '#1a5cff' : '#ffd23f';
  P.flFocus = ratio('#ffd23f', P.fl) >= 3 ? '#ffd23f' : '#1a5cff';
  P.ft = dark ? mix(P.bg, '#000000', 0.45) : mix(P.ink, '#000000', 0.15);
  P.onFt = dark ? P.ink : fixFg(P.bg, P.ft, 4.5);
  P.ftSub = fixFg(mix(P.onFt, P.ft, 0.3), P.ft, 4.5);
  return P;
}
function contrastReport(P, D) {                            // every pair the CSS relies on
  const r = [['ink/bg', P.ink, P.bg, 4.5], ['ink/surf', P.ink, P.surf, 4.5], ['ink/surf2', P.ink, P.surf2, 4.5], ['sub/bg', P.sub, P.bg, 4.5], ['sub/surf', P.sub, P.surf, 4.5],
    ['link/bg', P.link, P.bg, 4.5], ['link/surf', P.link, P.surf, 4.5], ['onA/a', P.onA, P.a, 4.5], ['onFl/fl', P.onFl, P.fl, 4.5], ['flSub/fl', P.flSub, P.fl, 4.5],
    ['onFlBtn/flBtn', P.onFlBtn, P.flBtn, 4.5], ['mk/fl', P.mk, P.fl, 3], ['mk2/fl', P.mk2, P.fl, 3], ['mark/bg', P.mark, P.bg, 3], ['onFt/ft', P.onFt, P.ft, 4.5],
    ['ftSub/ft', P.ftSub, P.ft, 4.5], ['ribbon', '#f4f4f4', '#141414', 4.5]];
  return r.map(([k, a, b, min]) => ({ k, v: +ratio(a, b).toFixed(2), min }));
}

// ---------------------------------------------------------------- ornaments (one per page, brand colours only)
const MOTIFS = {
  awning: (a, b) => ({ svg: `<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 80 34'><path d='M0 0h40v14a20 20 0 0 1-40 0z' fill='${a}'/><path d='M40 0h40v14a20 20 0 0 1-40 0z' fill='${b}'/></svg>`, h: 34, w: 80 }),
  picado: (a, b, c, d) => { const cols = [a, b, c, d].filter(Boolean); let s = `<path d='M0 3h${cols.length * 46}' stroke='${cols[0]}' stroke-width='2'/>`;
    cols.forEach((col, i) => { const x = i * 46 + 4; s += `<path d='M${x} 3h38v24l-6 6-7-6-6 6-7-6-6 6-6-6z' fill='${col}'/><circle cx='${x + 19}' cy='15' r='4' fill='#fff' opacity='.55'/>`; });
    return { svg: `<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 ${cols.length * 46} 36'>${s}</svg>`, h: 36, w: cols.length * 46 }; },
  checker: (a, b) => ({ svg: `<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 28 28'><rect width='28' height='28' fill='${b}'/><rect width='14' height='14' fill='${a}'/><rect x='14' y='14' width='14' height='14' fill='${a}'/></svg>`, h: 28, w: 28 }),
  arches: (a, b) => ({ svg: `<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 44 30'><path d='M4 30V18a18 18 0 0 1 36 0v12' fill='none' stroke='${a}' stroke-width='2'/><circle cx='22' cy='20' r='2.5' fill='${a}'/></svg>`, h: 30, w: 44 }),
  sparkle: (a) => ({ svg: `<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 60 30'><path d='M15 4c1.2 6 3 8.8 9 11-6 2.2-7.8 5-9 11-1.2-6-3-8.8-9-11 6-2.2 7.8-5 9-11z' fill='${a}'/><circle cx='44' cy='15' r='2.2' fill='${a}'/></svg>`, h: 30, w: 60 }),
  deco: (a) => ({ svg: `<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 120 24'><path d='M0 6h120M0 12h120M0 18h120' stroke='${a}' stroke-width='1'/><path d='M60 2l8 10-8 10-8-10z' fill='${a}'/></svg>`, h: 24, w: 120 }),
  tape: (a, b) => ({ svg: `<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 40 22'><rect width='40' height='22' fill='${b}'/><path d='M0 22 20 0h10L10 22zM20 22 40 0v10L30 22z' fill='${a}'/></svg>`, h: 22, w: 40 }),
  wave: (a) => ({ svg: `<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 80 20'><path d='M0 10c10-8 20-8 30 0s20 8 30 0 20-8 20 0' fill='none' stroke='${a}' stroke-width='2.5'/></svg>`, h: 20, w: 80 }),
  dots: (a) => ({ svg: `<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 16'><circle cx='12' cy='8' r='2.4' fill='${a}'/></svg>`, h: 16, w: 24 }),
};
const SUB_MOTIF = { food: 'awning', cafe: 'dots', barber: 'checker', nails: 'arches', salon: 'deco', gym: 'tape', studio: 'arches', home: 'wave' };

function mapSvg(seed, P) {                                  // brand-tinted street grid (decorative; the address is the text)
  const r = hashNum(seed); const rnd = i => ((r >>> (i % 24)) ^ (r * (i + 7))) % 1000 / 1000;
  const road = P.dark ? mix(P.surf2, '#ffffff', 0.12) : '#ffffff', block = P.surf2, park = mix(P.surf2, P.a, P.dark ? 0.25 : 0.18);
  let g = `<rect width="640" height="360" fill="${block}"/>`;
  for (let i = 0; i < 6; i++) { const y = 30 + i * 62 + Math.round(rnd(i) * 14); g += `<rect x="0" y="${y}" width="640" height="${i === 2 ? 16 : 7}" fill="${road}"/>`; }
  for (let i = 0; i < 9; i++) { const x = 20 + i * 74 + Math.round(rnd(i + 9) * 18); g += `<rect x="${x}" y="0" width="${i === 4 ? 14 : 6}" height="360" fill="${road}"/>`; }
  g += `<path d="M-20 ${300 - Math.round(rnd(3) * 80)} L660 ${40 + Math.round(rnd(5) * 60)}" stroke="${road}" stroke-width="12"/>`;
  g += `<rect x="${430 + Math.round(rnd(6) * 60)}" y="${210 + Math.round(rnd(7) * 30)}" width="120" height="78" rx="6" fill="${park}"/>`;
  g += `<circle cx="320" cy="168" r="44" fill="${P.a}" opacity=".16"/><path d="M320 196c-15-18-27-31-27-45a27 27 0 0 1 54 0c0 14-12 27-27 45z" fill="${P.a}" stroke="${P.onA}" stroke-width="3"/><circle cx="320" cy="151" r="9" fill="${P.onA}"/>`;
  return `<svg viewBox="0 0 640 360" aria-hidden="true" focusable="false" preserveAspectRatio="xMidYMid slice">${g}</svg>`;
}
function burstPath(n = 16, R = 50, r = 42) {
  const pts = []; for (let i = 0; i < n * 2; i++) { const a = (i / (n * 2)) * Math.PI * 2 - Math.PI / 2, rr = i % 2 ? r : R; pts.push(`${(50 + rr * Math.cos(a)).toFixed(1)},${(50 + rr * Math.sin(a)).toFixed(1)}`); }
  return `<svg class="bsh" viewBox="0 0 100 100" aria-hidden="true" focusable="false"><polygon points="${pts.join(' ')}" fill="currentColor"/></svg>`;
}
function ring(id, text, logo, cls) {                       // the logo inside a ring of their own words (decorative; the words are on the page)
  const t = String(text).toUpperCase();
  const len = Math.round(2 * Math.PI * 80 - 6);
  return `<div class="ring ${cls}" aria-hidden="true"><svg viewBox="0 0 200 200" focusable="false"><defs><path id="${id}" d="M100,100 m-80,0 a80,80 0 1,1 160,0 a80,80 0 1,1 -160,0"/></defs><text><textPath href="#${id}" textLength="${len}" lengthAdjust="spacing">${esc(t)}</textPath></text></svg>${logo || ''}</div>`;
}

// ---------------------------------------------------------------- leads + art + the one python asset job
const allLeads = JSON.parse(readFileSync(leadsFile, 'utf8'));
const leadList = (Array.isArray(allLeads) ? allLeads : allLeads.leads || []).filter(l => !ONLY || ONLY.includes(l.slug));
if (!leadList.length) { console.error('no leads matched'); process.exit(2); }
const ART = existsSync(join(HERE, 'site-art.json')) ? JSON.parse(readFileSync(join(HERE, 'site-art.json'), 'utf8')) : {};

function photoPlan(l, art) {
  const own = l.ownPhotos !== false;
  const files = (l.photos || []).map((p, i) => ({ n: i + 1, src: join(IMG_DIR, basename(p)) })).filter(p => existsSync(p.src));
  if (own && files.length) return { own: true, files };
  return { own: false, files: [1, 2, 3].map(i => ({ n: i, src: join(IMG_DIR, `${l.niche}-${i}.jpg`) })).filter(p => existsSync(p.src)) };
}
const plans = leadList.map(l => {
  const art = { ...(ART[l.slug] || {}), ...(l.art || {}) };
  const sub = subtype(l);
  const [dk0, bk0] = SUB_FONT[sub];
  const dk = DISPLAY[art.display] ? art.display : dk0, bk = BODY[art.body] ? art.body : bk0;
  const D = DISPLAY[dk], B = BODY[bk];
  const nm = splitName(l.name, l.area);
  const markText = D.upper ? nm.mark.toUpperCase() : nm.mark;
  const ws = words(markText); const cands = [[markText]];
  for (let i = 1; i < ws.length; i++) cands.push([ws.slice(0, i).join(' '), ws.slice(i).join(' ')]);
  if (ws.length >= 3) for (let i = 1; i < ws.length - 1; i++) for (let j = i + 1; j < ws.length; j++) cands.push([ws.slice(0, i).join(' '), ws.slice(i, j).join(' '), ws.slice(j).join(' ')]);
  const ph = photoPlan(l, art);
  const logo = l.logo && existsSync(join(IMG_DIR, basename(l.logo))) ? join(IMG_DIR, basename(l.logo)) : null;
  return { l, art, sub, dk, bk, D, B, nm, markText, cands, ph, logo };
});
const job = { photos: [], pairs: [], logos: [], fonts: [] };
for (const p of plans) {
  const pairSet = new Set(p.art.pairs || []);
  for (const f of p.ph.files) {
    job.photos.push({ key: `${p.l.slug}|${f.n}`, src: f.src });
    if (p.ph.own && pairSet.has(f.n)) job.pairs.push({ key: `${p.l.slug}|${f.n}`, src: f.src, split: 'stacked', trim: 0.07 });
  }
  if (p.logo) job.logos.push({ slug: p.l.slug, src: p.logo });
  const sample = `${p.l.name} ${p.l.heroTitle || ''} ${(p.l.services || []).map(s => s.t).join(' ')}`;
  const bodySample = `${(p.l.services || []).map(s => `${s.t} ${s.d || ''}`).join(' ')} ${p.l.heroSub || ''}`.slice(0, 1200);
  const measure = [...new Set(p.cands.flat().concat(p.nm.rest ? [p.nm.rest, p.nm.rest.toUpperCase()] : []))];
  const promoPrice = String(p.l.promo || '').match(/\$\d[\d,.]*(?:\/mo)?/); if (promoPrice) measure.push(promoPrice[0]);
  const ig = String(p.l.instagram || '').replace(/^@/, ''); if (ig) measure.push('@' + (p.D.upper ? ig.toUpperCase() : ig));
  const kindD = p.D.cat === 'serif' ? (p.D.w >= 600 ? 'serif-bold' : 'serif') : 'sans-bold';
  job.fonts.push({ key: `${p.l.slug}|D`, src: join(FONT_DIR, p.D.file), out: join(FONT_DIR, subFile(p.D.file, p.D.axes)), axes: p.D.axes, kind: kindD, sample, measure, upper: p.D.upper, ls: p.D.ls });
  if (p.D.ital) job.fonts.push({ key: `${p.l.slug}|DI`, src: join(FONT_DIR, p.D.ital.file), out: join(FONT_DIR, subFile(p.D.ital.file, p.D.ital.axes)), axes: p.D.ital.axes, kind: 'serif', sample, measure: p.nm.rest ? [p.nm.rest] : [], upper: false, ls: 0 });
  job.fonts.push({ key: `${p.l.slug}|B`, src: join(FONT_DIR, p.B.file), out: join(FONT_DIR, subFile(p.B.file, p.B.axes)), axes: p.B.axes, kind: 'sans', sample: bodySample, measure: [], upper: false, ls: 0 });
}
const AN = JSON.parse(execFileSync('python3', [join(HERE, 'site/assets.py')], { input: JSON.stringify(job), encoding: 'utf8', maxBuffer: 1 << 26 }));
if (AN.errors.length) console.error('asset warnings:\n  ' + AN.errors.join('\n  '));

// ---------------------------------------------------------------- asset URLs (preview: /Claude/p/…; live: copied to /assets/…)
function assetUrls() {
  const used = new Set();
  const img = file => { used.add(join(IMG_DIR, file)); return ASSET_BASE ? `${ASSET_BASE}/_img/${file}` : COPY_ASSETS ? `/assets/img/${file}` : `${WEBROOT}/p/_img/${file}`; };
  const font = abs => { used.add(abs); const rel = relative(FONT_DIR, abs); return ASSET_BASE ? `${ASSET_BASE}/_fonts/${rel}` : COPY_ASSETS ? `/assets/fonts/${basename(abs)}` : `${WEBROOT}/p/_fonts/${rel}`; };
  return { img, font, used };
}
const CLIENT_JS = readFileSync(join(HERE, 'site/hours-client.js'), 'utf8').replace(/^\s*\/\/.*$/gm, '').replace(/if \(typeof module[\s\S]*$/, '').replace(/\n\s*\n/g, '\n').trim();

// ================================================================= page
function build(p) {
  const { l, art, sub, D, B, nm, ph } = p;
  const lang = l.lang === 'es' ? 'es' : 'en', es = lang === 'es', S = STR[lang];
  const niche = ['food', 'beauty', 'fitness', 'home'].includes(l.niche) ? l.niche : 'food';
  const slug = l.slug, U = assetUrls();
  const ig = String(l.instagram || '').replace(/^@/, ''), igUrl = ig ? `https://www.instagram.com/${ig}/` : '';
  const tel = e164(l.phone), phoneF = fmtPhone(l.phone);
  const leadText = fold([l.cta, l.promo, l.heroSub, l.heroTitle, ...(l.hours || [])].join(' '));
  const textOk = !!tel && (l.textOk === true || /\b(call or text|text or call|text us|textea|llama o escribe|escribe o llama|mensaje de texto)\b/.test(leadText));
  const waLink = (l.links || []).find(x => platformOf(x.url) === 'WhatsApp');
  const pr = parseProof(l.proof, l.services);
  const model = parseHours(l.hours || [], { title: l.hoursTitle || '' }), cm = compactModel(model);
  const addrParts = String(l.address || '').split(/\s+·\s+/).map(s => s.trim()).filter(Boolean);
  const streets = addrParts.filter(isStreet);
  const loungeM = String(l.address || '').match(/^(\d+)\s+(lounges?|locations?|shops?|spots?|salones|locales|sedes)\s*:\s*(.+)$/i);
  const lounges = loungeM ? loungeM[3].split(/\s+·\s+/).map(s => s.trim()).filter(Boolean) : [];
  const mobile = !streets.length && !lounges.length && /\b(serving|mobile|we come|service area|a domicilio|servimos)\b/i.test(l.address || '');
  const pageUrl = MODE === 'live' ? SITE : `${ORIGIN}${webOf(OUT) || WEBROOT + '/p'}/${slug}/`;
  const ext = ' target="_blank" rel="noopener"';

  // ---------------- photos + layout
  const skip = new Set(art.skip || []), textSet = new Set(art.text || []), posts = new Set(art.posts || []), pairSet = new Set(art.pairs || []), wideSet = new Set(art.wide || []);
  const info = n => AN.photos[`${slug}|${n}`] ? { ...AN.photos[`${slug}|${n}`], n } : null;
  const avail = ph.files.map(f => info(f.n)).filter(Boolean).filter(x => !skip.has(x.n));
  let heroN = Number.isInteger(art.hero) ? art.hero : null;
  if (heroN == null && ph.own) { const c = avail.filter(x => !x.collage && !posts.has(x.n)).sort((a, b) => (textSet.has(a.n) - textSet.has(b.n)) || b.score - a.score)[0]; heroN = c ? c.n : 0; }
  if (!ph.own) heroN = 0;                                                       // a sample photo never goes in the hero
  let hero = heroN ? avail.find(x => x.n === heroN) || null : null;
  let layout = art.layout || (niche === 'home' && pairSet.size ? 'pair' : sub === 'nails' ? 'arch' : hero && hero.sharp >= 10 && !textSet.has(hero.n) && niche !== 'food' ? 'cinematic' : 'field');
  if (layout === 'cinematic' && (!hero || textSet.has(hero.n))) layout = 'field';
  if (layout === 'pair' && !(hero && AN.pairs[`${slug}|${hero.n}`])) layout = 'field';
  if (!hero && layout !== 'badge') layout = p.logo ? 'badge' : 'field';
  if (layout === 'badge') hero = null;
  const gal = avail.filter(x => x !== hero);
  const P = palette(l, art, layout);
  const fp = x => (art.focus && art.focus[x.n]) || `${Math.round(x.focus[0] * 100)}% ${Math.round(x.focus[1] * 100)}%`;
  const altOf = (x, k) => (l.photoAlts && l.photoAlts[x.n - 1]) || (ph.own ? (es ? `Foto ${k} de @${ig} en Instagram` : `Photo ${k} from @${ig} on Instagram`) : S.sampleTag);
  const pic = (x, { sizes, alt, heroImg, cls = '', pos }) => {
    const set = (x.webp || []).map(v => `${U.img(v.file)} ${v.w}w`).join(', ');
    return `<picture${cls ? ` class="${cls}"` : ''}>${set ? `<source type="image/webp" srcset="${set}" sizes="${sizes}">` : ''}<img src="${U.img(x.base + '.jpg')}" width="${x.w}" height="${x.h}" alt="${esc(alt)}" style="object-position:${pos || (x.focus ? fp(x) : '50% 50%')}"${heroImg ? ' fetchpriority="high"' : ' loading="lazy" decoding="async"'}></picture>`;
  };
  const logo = (size, cls = 'logo') => p.logo ? `<img class="${cls}" src="${U.img(`${slug}-logo-${size >= 200 ? 320 : 160}.webp`)}" width="${size >= 200 ? 320 : 160}" height="${size >= 200 ? 320 : 160}" alt="" loading="${cls === 'logo' ? 'eager' : 'lazy'}">` : '';

  // ---------------- type: fit the name to the width from build-time glyph metrics
  const FD = AN.fonts[`${slug}|D`] || { widths: {} }, FDI = AN.fonts[`${slug}|DI`], FB = AN.fonts[`${slug}|B`] || {};
  const Wm = t => FD.widths?.[t] || t.length * 0.62;
  const maxM = { serif: 132, condensed: 156, grotesque: 112, script: 104 }[D.cat], maxD = { serif: 210, condensed: 240, grotesque: 170, script: 150 }[D.cat];
  const archSide = layout === 'arch';
  const availM = archSide ? 0.5 * 350 - 6 : 350;
  let pick = null;
  for (const c of p.cands) {
    const w = Math.max(...c.map(Wm)), fs = Math.min(availM / (w * 1.03), maxM), h = fs * D.lh * c.length;
    const score = fs * (c.length === 1 ? 1.18 : c.length === 2 ? 1 : 0.8) - (h > 250 ? 999 : 0);
    if (!pick || score > pick.score) pick = { c, w, fs, score };
  }
  const lines = pick.c, emW = pick.w;
  const archStack = archSide && pick.fs < 60;
  const restTxt = nm.rest ? (D.restDisp ? nm.rest : nm.rest) : '';
  const restW = restTxt ? ((D.restItal ? FDI?.widths?.[restTxt] : FD.widths?.[D.upper ? restTxt.toUpperCase() : restTxt]) || restTxt.length * 0.5) : 0;
  const mkAvail = archSide && !archStack ? '(50vw - 26px)' : '(100vw - 2 * var(--g))';
  const fsM = `min(calc(${mkAvail} / ${(emW * 1.03).toFixed(3)}), ${maxM}px)`;
  const fsD = `min(calc((100vw - min(46vw, 720px) - 116px) / ${(emW * 1.03).toFixed(3)}), ${maxD}px)`;

  // ---------------- actions
  const verb = S.verb[niche];
  const cleanLabel = s => String(s || '').replace(/\s*\(([^)]*)\)\s*$/, '').trim();
  const primary = l.ctaUrl ? (() => { const plat = platformOf(l.ctaUrl); const lab = cleanLabel(l.cta) || verb;
      return { href: l.ctaUrl, label: lab, plat: CONSUMER.has(plat) && !fold(lab).includes(fold(plat)) ? plat : '', ext: true, short: verb, url: l.ctaUrl }; })()
    : tel ? { href: `tel:${tel}`, label: l.cta && !/\btext|mensaje\b/i.test(l.cta) ? cleanLabel(l.cta) : S.callTo, plat: '', ext: false, short: S.call, tel: true }
    : igUrl ? { href: igUrl, label: 'Instagram', plat: '', ext: true, short: 'Instagram' } : null;
  const priBtn = (cls = 'btn pri') => primary ? `<a class="${cls}" href="${esc(primary.href)}"${primary.ext ? ext : ''}><span>${langSpan(primary.label, lang)}${primary.plat ? ` <small>${esc(S.on(primary.plat))}</small>` : ''}</span>${primary.tel ? ICON.call : primary.ext ? ICON.out : ICON.go}</a>` : '';
  const smsHref = tel ? `sms:${tel}` : '';
  const tile = (href, k, v, icon, extra = '') => `<a class="tile" href="${esc(href)}"${extra}><span class="tk">${icon}${esc(k)}</span><b>${esc(v)}</b></a>`;
  const t1 = primary?.tel ? (textOk ? tile(smsHref, niche === 'home' ? S.textPhoto : S.text, phoneF, ICON.text) : igUrl ? tile(igUrl, 'Instagram', '@' + ig, ICON.ig, ext) : '')
    : tel ? tile(`tel:${tel}`, S.call, phoneF, ICON.call) : igUrl ? tile(igUrl, 'Instagram', '@' + ig, ICON.ig, ext) : '';
  const t2 = streets.length === 1 ? tile(dirUrl(streets[0]), S.dir, streets[0].split(',')[0], ICON.dir, ext)
    : streets.length > 1 ? tile('#visit', S.loc, S.locs(streets.length), ICON.down)
    : lounges.length ? tile('#visit', S.loc, S.loungesT(loungeM[1]), ICON.down)
    : mobile ? tile('#visit', S.area, l.area || '', ICON.dir)
    : (textOk && !primary?.tel) ? tile(smsHref, S.text, phoneF, ICON.text) : '';
  const tilesHtml = [t1, t2].filter(Boolean);

  // ---------------- team: people with their OWN booking link
  const addrF = fold(l.address || '');
  const team = niche === 'beauty' ? (l.links || []).map(x => {
    const m = String(x.label).match(/^(?:book|reservar con|reserva con|reservar)\s+(.+?)(?:\s*\(.*\))?$/i); if (!m) return null;
    const who = m[1].trim();
    if (/\b(on|online|shop|all|todos|lounge|cita|en|the)\b/i.test(who) || addrF.includes(fold(who)) || words(who).length > 3) return null;
    return { who, url: x.url, plat: platformOf(x.url), rating: pr.persons.find(pp => fold(pp.who) === fold(who)) };
  }).filter(Boolean) : [];
  const teamUrls = new Set(team.length >= 2 ? team.map(t => t.url) : []);
  const persons = pr.persons.filter(pp => !team.some(t => t.rating === pp && team.length >= 2));

  // ---------------- link matching (a service / a location gets its own link when the words overlap)
  const usedUrls = new Set([primary?.url, ...teamUrls].filter(Boolean));
  const linkFor = (text, pool = l.links || []) => { const w = new Set(sigWords(text)); return pool.find(x => !usedUrls.has(x.url) && sigWords(cleanLabel(x.label)).some(s => w.has(s))); };
  const locLink = s => (l.links || []).find(x => streetKey(x.label) && streetKey(x.label) === streetKey(s));
  const loungeLink = n => (l.links || []).find(x => fold(x.label).includes(fold(n)));

  // ---------------- hero facts
  const topRating = (() => { const cp = primary?.plat || platformOf(primary?.url || ''); return pr.ratings.find(r => cp && fold(r.plat).includes(fold(cp))) || pr.ratings[0] || null; })();
  const sinceTxt = pr.since ? (es ? (factEs(pr.since.raw) && /^Desde/.test(factEs(pr.since.raw)) ? factEs(pr.since.raw) : S.since(pr.since.year)) : S.since(pr.since.year)) : '';
  const stickerOn = (layout === 'field' || layout === 'arch') && !!hero && !!topRating;
  const rateLine = r => `<span class="rt">${ICON.star}<b>${esc(r.v)}</b> ${esc(r.plat)}<i aria-hidden="true">·</i>${esc(r.n)} ${esc(unitL(r.unit, lang))}</span>`;
  const factPill = (t, icon = ICON.check) => `<span class="hf">${icon}${langSpan(t, lang)}</span>`;
  const heroFacts = [];
  if (!stickerOn && topRating) heroFacts.push(rateLine(topRating));
  if (sinceTxt) heroFacts.push(factPill(sinceTxt));
  if (pr.press[0]) heroFacts.push(factPill(pr.press[0], ICON.award));
  if (!topRating && !pr.press.length) for (const f of pr.facts.slice(0, 2)) heroFacts.push(factPill(es && factEs(f) ? factEs(f) : f));
  const statusSlot = model.k !== 'none' ? '<p class="status st" hidden></p><script>paintStatus()</script>' : '';

  // beauty price tags (instant "how much?")
  const priceTags = niche === 'beauty' ? (l.services || []).map(s => { const sp = splitPrice(s.price); return sp && sp.lead && sp.lead.length <= 11 && noEmoji(s.t).length <= 18 ? { t: noEmoji(s.t), p: sp.lead } : null; }).filter(Boolean).slice(0, 3) : [];
  const priceTagsHtml = priceTags.length >= 2 ? `<ul class="ptags">${priceTags.map(t => `<li><span>${langSpan(t.t, lang)}</span><b>${esc(t.p)}</b></li>`).join('')}</ul>` : '';
  // food staccato line (their service titles)
  const stacT = (niche === 'food' ? (l.services || []).filter(s => !/catering|party|box|cater|events?/i.test(s.t)).map(s => noEmoji(s.t)) : []).slice(0, 3);
  const stac = stacT.length >= 2 && stacT.every(t => t.length <= 22) && stacT.join('').length <= 52 ? stacT : null;
  const promoPrice = String(l.promo || '').match(/\$\d[\d,.]*(?:\/mo)?/);
  const nowStrip = l.promo && promoPrice ? `<a class="now" href="#offer"><span>${esc(S.now)}</span>${langSpan(noEmoji(l.promo), lang)}${ICON.down}</a>` : '';

  // ================================================================ HTML
  const H = [];
  const ribbon = MODE === 'preview' ? `<aside class="rib" data-ds aria-label="${S.ribbonLabel}"><p>${S.ribbon(l.name)}</p><a class="rib-btn" href="{CLAIM_URL}">${S.mine}</a></aside>` : '';
  const top = `<header class="top">${layout !== 'badge' && p.logo ? `<span class="brand">${logo(48)}</span>` : '<span></span>'}${igUrl ? `<a class="igl" href="${igUrl}"${ext}>${ICON.ig}<span>@${esc(ig)}</span></a>` : ''}</header>`;
  const claimy = /\b(best|#1|number one|mejor|el mejor|la mejor)\b/i.test(l.heroTitle || '');
  const promise = l.heroTitle ? `<p class="promise">${claimy ? `“${langSpan(noEmoji(l.heroTitle), lang)}”<small>— @${esc(ig || l.name)}</small>` : langSpan(noEmoji(l.heroTitle), lang)}</p>` : '';
  const markHtml = `<h1 class="mk" id="h1"><span class="vh">${esc(l.name)}</span><span class="mkl" aria-hidden="true">${lines.map((t, i) => `<span class="ln${i ? ' l2' : ''}"><span style="animation-delay:${(0.06 + i * 0.1).toFixed(2)}s">${esc(t)}</span></span>`).join('')}</span>${restTxt ? `<span class="mkr${D.restDisp ? ' rd' : ''}" aria-hidden="true">${esc(restTxt)}</span>` : ''}</h1>`;
  const sticker = stickerOn ? `<div class="stk">${burstPath()}<span><b>${esc(topRating.v)}${ICON.star}</b><small>${esc(topRating.plat)}</small><small>${esc(topRating.n)} ${esc(unitL(topRating.unit, lang))}</small></span></div>` : '';
  let media = '';
  if (layout === 'cinematic') media = `<div class="hm">${pic(hero, { sizes: '(min-width: 900px) 46vw, 100vw', alt: altOf(hero, hero.n), heroImg: true, cls: 'hp' })}${ig ? `<span class="credit" aria-hidden="true">${esc(S.photoBy(ig))}</span>` : ''}</div>`;
  else if (layout === 'field') media = hero ? `<div class="hm"><figure class="frame">${pic(hero, { sizes: '(min-width: 900px) 34vw, 50vw', alt: altOf(hero, hero.n), heroImg: true })}</figure>${sticker}</div>` : '';
  else if (layout === 'arch') media = `<div class="hm"><figure class="archf">${pic(hero, { sizes: '(min-width: 900px) 34vw, 50vw', alt: altOf(hero, hero.n), heroImg: true })}</figure>${sticker}</div>`;
  else if (layout === 'badge') media = `<div class="hm">${ring('rgh', art.ringText || `${l.name} ✺ ${streets[0]?.split(',')[0] || l.area || ''} ✺`, logo(320, 'rlogo'), 'big')}</div>`;
  else if (layout === 'pair') { const pp = AN.pairs[`${slug}|${hero.n}`];
    media = `<div class="hm"><div class="ba" style="--p:50%">${pic(pp.before, { sizes: '(min-width: 900px) 46vw, 100vw', alt: `${S.before} — ${altOf(hero, hero.n)}`, heroImg: true, pos: '50% 50%' })}<div class="baA">${pic(pp.after, { sizes: '(min-width: 900px) 46vw, 100vw', alt: `${S.after} — ${altOf(hero, hero.n)}`, heroImg: true, pos: '50% 50%' })}</div><span class="baL b" aria-hidden="true">${S.before}</span><span class="baL a" aria-hidden="true">${S.after}</span><span class="baH" aria-hidden="true"></span><input class="baR" type="range" min="0" max="100" value="50" aria-label="${esc(S.drag)}"></div></div>`; }
  const sideHtml = `<div class="hs">${statusSlot}${heroFacts.length ? `<p class="hfs">${heroFacts.join('')}</p>` : ''}${layout === 'field' ? priceTagsHtml : ''}</div>`;
  const pHtml = `<div class="hp-p">${stac ? `<p class="stac">${stac.map(t => langSpan(t, lang)).join('<i aria-hidden="true"> · </i>')}</p>` : ''}${promise}</div>`;
  const actsHtml = `<div class="acts" id="heroCtas">${priBtn('btn pri')}${tilesHtml.length ? `<div class="tiles">${tilesHtml.join('')}</div>` : ''}</div>`;
  const xHtml = nowStrip || (layout !== 'field' && priceTagsHtml) ? `<div class="hx">${nowStrip}${layout !== 'field' ? priceTagsHtml : ''}</div>` : '';
  const heroCls = `hero L-${layout === 'cinematic' ? 'cine' : layout}${archStack ? ' arch-stack' : ''}${hero ? '' : ' nophoto'}${P.dark ? ' dark' : ''}`;
  H.push(`<section class="${heroCls}" aria-labelledby="h1">${top}${media}${markHtml}${pHtml}${sideHtml}${actsHtml}${xHtml}</section>`);

  // ornament divider (one per page)
  const motifKey = MOTIFS[art.motif] ? art.motif : SUB_MOTIF[sub];
  const mo = MOTIFS[motifKey](P.flIsA ? P.fl : P.a, motifKey === 'tape' ? P.fl : P.bg, P.b.tagBg || P.link, P.b.surface2 || P.surf2);
  H.push(`<div class="orn-div m-${motifKey}" aria-hidden="true"></div>`);

  // team
  if (team.length >= 2) H.push(`<section class="sec team" id="team" aria-labelledby="h-team"><div class="wrap"><p class="eye">${esc(team[0].plat)}</p><h2 id="h-team">${esc(sub === 'barber' ? S.team : S.teamS)}</h2><ul class="tg">${team.map(t => `<li><a href="${esc(t.url)}"${ext}><span class="ini" aria-hidden="true">${esc(t.who.trim()[0])}</span><span class="tw"><b>${esc(t.who)}</b><small>${t.rating ? `${ICON.star}${esc(t.rating.v)} · ${esc(t.rating.n)} ${esc(unitL(t.rating.unit, lang))} · ` : ''}${esc(S.bookWith(t.who))}</small></span>${ICON.out}</a></li>`).join('')}</ul></div></section>`);

  // menu board (fitness: plans + classes instead)
  const svc = l.services || [];
  const fitPlans = niche === 'fitness' ? svc.filter(s => s.price) : [];
  const fitClasses = niche === 'fitness' ? svc.filter(s => !s.price) : [];
  const menuSvc = niche === 'fitness' ? [] : svc;
  const rowLinks = new Set();
  if (menuSvc.length) {
    const hasPrices = menuSvc.some(s => s.price);
    const title = !hasPrices && S.menuNP[sub] ? S.menuNP[sub] : S.menu[sub];
    const eyeKey = sub === 'food' && /truck|cami[oó]n/i.test(l.name) ? 'truck' : sub;
    const items = menuSvc.map((s, i) => {
      const sp = splitPrice(s.price);
      const own = linkFor(`${s.t}`); if (own) rowLinks.add(own.url);
      const rowA = own ? `<a class="ib" href="${esc(own.url)}"${ext}>${langSpan(cleanLabel(own.label), lang)}${ICON.out}</a>`
        : niche === 'beauty' && primary?.ext ? `<a class="ib" href="${esc(primary.href)}"${ext} aria-label="${esc(`${S.book} · ${s.t}`)}">${esc(S.book)}${ICON.out}</a>` : '';
      return `<li class="it" id="m-${i + 1}"><div class="ih"><h3>${langSpan(noEmoji(s.t), lang)}</h3>${sp?.lead ? `<span class="dots" aria-hidden="true"></span><span class="pr">${esc(sp.lead)}</span>` : ''}</div>${sp && sp.chips.length ? `<p class="pc">${sp.chips.map(c => `<span>${esc(c)}</span>`).join('')}</p>` : ''}${sp?.note ? `<p class="pn">${langSpan(sp.note, lang)}</p>` : ''}${s.d ? `<p class="d">${langSpan(s.d, lang)}</p>` : ''}${rowA}</li>`;
    }).join('');
    H.push(`<section class="sec menu" id="menu" aria-labelledby="h-menu"><div class="wrap"><div class="card">
<div class="ch">${p.logo ? `<span class="cb">${logo(76, 'clogo')}</span>` : ''}<p class="eye">${esc(S.menuEye[eyeKey] || '')}</p><h2 id="h-menu">${esc(title)}</h2><span class="orn" aria-hidden="true"><i></i>✦<i></i></span></div>
<ul class="items${menuSvc.length >= 4 ? ' two' : ''}">${items}</ul>${primary ? `<p class="cf">${priBtn('btn pri')}</p>` : ''}</div></div></section>`);
  }

  // offer: fitness → plan cards (the promo marks the matching plan SPECIAL); else ONE flood band with the price set big
  let floodUsed = false;
  if (fitPlans.length) {
    const promoF = fold(l.promo || '');
    const cards = fitPlans.map(s => {
      const m = String(s.price).match(/^(\$\d[\d,.]*)\s*(\/\s*(?:mo|month|mes))?(.*)$/i);
      const special = !!(promoPrice && m && promoPrice[0].replace(/\/mo$/, '') === m[1]) || (promoF && sigWords(s.t).some(w => sigWords(l.promo).includes(w)) && /\$/.test(l.promo || ''));
      const wasM = special ? (`${l.promo || ''} ${s.d || ''}`).match(/\b(?:was|antes)\s+(\$\d[\d,.]*)/i) : null;
      const join = linkFor(s.t) || null; if (join) rowLinks.add(join.url);
      const href = join ? join.url : primary?.href;
      return `<article class="plan${special ? ' special' : ''}">${special ? `<p class="ptag">${esc(S.special)}</p>` : ''}<h3>${langSpan(noEmoji(s.t), lang)}</h3><p class="pp">${m ? `<b>${esc(m[1])}</b>${m[2] ? `<span>${esc(m[2].replace(/\s/g, ''))}</span>` : ''}${wasM ? ` <s aria-label="${esc(`${S.was} ${wasM[1]}`)}">${esc(wasM[1])}</s>` : ''}` : `<b>${esc(s.price)}</b>`}</p>${s.d ? `<p class="d">${langSpan(s.d, lang)}</p>` : ''}${href ? `<a class="btn ${special ? 'pri' : 'ghost'}" href="${esc(href)}"${ext}>${esc(S.join)}${ICON.out}</a>` : ''}</article>`;
    }).join('');
    H.push(`<section class="sec plans" id="offer" aria-labelledby="h-plans"><div class="wrap"><p class="eye">${esc(S.plansEye)}</p><h2 id="h-plans">${esc(S.plans)}</h2><div class="pgrid">${cards}</div></div></section>`);
  } else if (l.promo) {
    floodUsed = true;
    const m = String(l.promo).match(/^(.*?)(\$\d[\d,.]*(?:\/mo)?)(.*)$/);
    const body = m ? `${m[1].trim() ? `<span class="t">${langSpan(noEmoji(m[1].trim().replace(/[,:·]\s*$/, '')), lang)}</span>` : ''}<span class="big">${esc(m[2])}</span>${m[3].trim() ? `<span class="t">${langSpan(m[3].trim().replace(/^[,;·]\s*/, ''), lang)}</span>` : ''}` : `<span class="t">${langSpan(noEmoji(l.promo), lang)}</span>`;
    const est = niche === 'home' && textOk ? `<div class="est"><label for="estIn">${esc(S.estP)}</label><input id="estIn" type="text" autocomplete="street-address" placeholder="${esc(S.estPh)}"><a class="btn inv" id="estGo" href="${esc(smsHref)}" data-body="${esc(S.estBody)}">${ICON.text}<span>${esc(S.estBtn)}</span></a>${tel ? `<a class="btn ghost inv2" href="tel:${tel}">${ICON.call}<span>${esc(S.call)} · ${esc(phoneF)}</span></a>` : ''}</div>`
      : primary ? priBtn('btn inv') : '';
    H.push(`<section class="band" id="offer" aria-labelledby="h-offer"><div class="wrap">${m ? `<span class="burst" aria-hidden="true">${burstPath(18, 50, 43)}</span>` : ''}<h2 class="eye" id="h-offer">${esc(S.offer)}</h2><p class="bandp">${body}</p>${est}</div></section>`);
  }

  // class day-tabs (fitness timetable from the hours model)
  if (model.k === 'classes') {
    const DAYW = [/\bsun(day)?s?\b|\bdomingos?\b/, /\bmon(day)?s?\b|\blunes\b/, /\btue(s|sday)?s?\b|\bmartes\b/, /\bwed(nesday)?s?\b|\bmi[eé]rcoles\b/, /\bthu(rs?|rsday)?s?\b|\bjueves\b/, /\bfri(day)?s?\b|\bviernes\b/, /\bsat(urday)?s?\b|\bs[aá]bados?\b/];
    const dayClass = {};
    for (const s of fitClasses) { const t = fold(`${s.t} ${s.d || ''}`); DAYW.forEach((re, d) => { if (re.test(t)) (dayClass[d] ||= []).push(noEmoji(s.t)); }); }
    const tm = m => { const h = Math.floor(m / 60) % 24, mm = m % 60; return `${h % 12 || 12}${mm ? ':' + String(mm).padStart(2, '0') : ''} ${h < 12 ? 'AM' : 'PM'}`; };
    const order = [1, 2, 3, 4, 5, 6, 0];
    const tabs = order.map(d => `<button type="button" class="dt" id="dt-${d}" data-d="${d}" data-days="${d}" aria-controls="dp-${d}">${esc(S.days[d])}</button>`).join('');
    const panels = order.map(d => { const st = model.st.filter(x => x[0] === d).sort((a, b) => a[1] - b[1]);
      const lbl = [...new Set([...(dayClass[d] || []), ...st.filter(x => x[2] != null).map(x => model.lb[x[2]])])].filter((v, i, a) => !a.some((o, j) => j !== i && fold(o).includes(fold(v)) && o !== v));
      return `<div class="dp${st.length ? '' : ' off'}" id="dp-${d}" data-days="${d}"><h3 class="dh">${esc(S.daysL[d])}</h3>${lbl.length ? `<p class="dl">${lbl.map(t => langSpan(t, lang)).join(' · ')}</p>` : ''}${st.length ? `<ul class="tt">${st.map(x => `<li>${tm(x[1])}</li>`).join('')}</ul>` : `<p class="tn">${esc(S.noClasses)}</p>`}</div>`; }).join('');
    const list = fitClasses.length ? `<ul class="clist">${fitClasses.map(s => `<li><h3>${langSpan(noEmoji(s.t), lang)}</h3>${s.d ? `<p>${langSpan(s.d, lang)}</p>` : ''}</li>`).join('')}</ul>` : '';
    H.push(`<section class="sec cls" id="classes" aria-labelledby="h-classes"><div class="wrap"><div class="clg"><div><p class="eye">${esc(l.hoursTitle || S.classesEye)}</p><h2 id="h-classes">${esc(S.classes)}</h2><p class="status st sst" hidden></p>
<div class="dtabs" hidden aria-label="${esc(S.classes)}">${tabs}</div><div class="dps">${panels}</div>${primary ? priBtn('btn pri') : ''}</div>${list ? `<div><p class="eye">${esc(S.classList)}</p>${list}</div>` : ''}</div></div></section>`);
  }

  // proof: the best quote (flood band when the promo did not take it) + rating cards + facts
  const linkForPlat = plat => { const c = (l.links || []).filter(x => fold(platformOf(x.url)) === fold(plat)); return (c.find(x => /review|reseñ|profile|perfil/i.test(x.label)) || c.find(x => !/schedule|booking|book|reserv|order|pedir|membership/i.test(x.label)) || null)?.url; };
  const quotes = pr.quotes;
  const facts = [...pr.press, ...pr.facts].filter(f => !(f === pr.since?.raw));
  if (pr.ratings.length || quotes.length || facts.length || persons.length) {
    const flood = !floodUsed;
    const q0 = quotes[0], qRest = quotes.slice(1);
    const rcards = pr.ratings.map((r, i) => { const u = linkForPlat(r.plat); return `<div class="rc${i === 0 ? ' r1' : ''}"><p class="rv">${esc(r.v)}</p>${stars(r.v, `st${i}`)}<p class="rp"><b>${esc(r.plat)}</b> · ${esc(r.n)} ${esc(unitL(r.unit, lang))}</p>${u ? `<a class="tl" href="${esc(u)}"${ext}>${esc(S.seeOn(r.plat))}${ICON.out}</a>` : ''}</div>`; }).join('');
    const pl = persons.map(pp => `<p class="pl">${ICON.star}${langSpan(pp.raw, lang)}</p>`).join('');
    const qs = qRest.map(q => `<figure class="pq"><blockquote><p>“${langSpan(q.q, lang)}”</p></blockquote><figcaption>— ${esc(srcL(q.src, lang))}</figcaption></figure>`).join('');
    const fs = facts.length ? `<ul class="facts">${facts.map(f => `<li>${/award|premio|featured|destacad|diario|press/i.test(f) ? ICON.award : ICON.check}<span>${langSpan(es && factEs(f) ? factEs(f) : f, lang)}</span></li>`).join('')}</ul>` : '';
    H.push(`<section class="sec proof${flood ? ' flood' : ''}" id="reviews" aria-labelledby="h-proof"><div class="wrap"><p class="eye">${esc(S.reviewsEye)}</p><h2 id="h-proof"${q0 ? ' class="vh"' : ''}>${esc(S.reviews)}</h2>
${q0 ? `<figure class="bq"><blockquote><p>“${langSpan(q0.q, lang)}”</p></blockquote><figcaption>— ${esc(srcL(q0.src, lang))}</figcaption></figure>` : ''}<div class="pg">${rcards ? `<div class="rcs">${rcards}${pl}</div>` : pl ? `<div class="rcs">${pl}</div>` : ''}${qs ? `<div class="qs">${qs}</div>` : ''}${fs}</div></div></section>`);
  }

  // gallery: photos not in the hero (no repeats), flyers framed as posts, before/after pairs, an Instagram tile
  const igTile = igUrl ? `<a class="g gi" href="${igUrl}"${ext}>${p.logo ? `<span class="gib">${logo(64, 'glogo')}</span>` : ICON.ig}<b>@${esc(ig)}</b><span>${esc(S.seeIg)}${ICON.out}</span></a>` : '';
  const tilesG = gal.slice(0, 4).map(x => {
    const pp = pairSet.has(x.n) && AN.pairs[`${slug}|${x.n}`];
    if (pp) return `<figure class="g pairc"><div class="pa">${pic(pp.before, { sizes: '(min-width: 900px) 20vw, 50vw', alt: `${S.before} — ${altOf(x, x.n)}`, pos: '50% 50%' })}<span>${S.before}</span></div><div class="pa">${pic(pp.after, { sizes: '(min-width: 900px) 20vw, 50vw', alt: `${S.after} — ${altOf(x, x.n)}`, pos: '50% 50%' })}<span>${S.after}</span></div></figure>`;
    if (posts.has(x.n)) return `<figure class="g post"><figcaption class="pth">${logo(28, 'plogo')}<b>@${esc(ig)}</b></figcaption><div class="ph">${pic(x, { sizes: '(min-width: 900px) 30vw, 50vw', alt: altOf(x, x.n) })}</div></figure>`;
    return `<figure class="g${wideSet.has(x.n) ? ' wide' : ''}"><div class="ph">${pic(x, { sizes: wideSet.has(x.n) ? '(min-width: 900px) 60vw, 100vw' : '(min-width: 900px) 30vw, 50vw', alt: altOf(x, x.n) })}</div>${ph.own ? '' : `<span class="smp">${esc(S.sampleTag)}</span>`}</figure>`;
  });
  if (tilesG.length || igUrl) {
    const nWide = gal.slice(0, 4).filter(x => wideSet.has(x.n) || (pairSet.has(x.n) && AN.pairs[`${slug}|${x.n}`])).length;
    const odd = (tilesG.length - nWide) % 2 === 1;
    H.push(`<section class="sec gal" id="photos" aria-labelledby="h-gal"><div class="wrap"><p class="eye">${esc(S.photosEye)}</p><h2 id="h-gal">${ig ? '@' + esc(ig) : esc(l.name)}</h2><div class="gg${odd ? ' odd' : ''}">${tilesG.join('')}${igTile}</div><p class="cred">${esc(ph.own ? S.photosFrom(ig) : S.sample)}</p></div></section>`);
  }

  // visit / end: one more ask, hours, where, more ways
  const locLabelW = model.w || [];
  const lineOf = s => (l.hours || []).find((h, i) => { const k = streetKey(h); return k && k === streetKey(s); });
  const genHours = (l.hours || []).map((h, i) => ({ h, i })).filter(({ h }) => !streets.some(s => streetKey(h) && streetKey(h) === streetKey(s)));
  let hoursCard = '';
  if (model.k === 'classes') hoursCard = `<div class="vc hc"><h3>${esc(l.hoursTitle || S.classesEye)}</h3><p class="status st" hidden></p><a class="tl" href="#classes">${esc(S.classes)}${ICON.go}</a></div>`;
  else if (genHours.length && (genHours.length > 1 || model.rows[genHours[0].i])) hoursCard = `<div class="vc hc"><h3>${esc(S.hours)}</h3>${streets.length > 1 ? '' : '<p class="status st" hidden></p>'}<ul class="hl">${genHours.map(({ h, i }) => `<li${model.rows[i] ? ` data-days="${model.rows[i].join(',')}"` : ' class="note"'}>${langSpan(h, lang)}</li>`).join('')}</ul></div>`;
  const locCards = streets.length ? streets.map((s, i) => { const lk = locLink(s); const hl = lineOf(s); if (lk) usedUrls.add(lk.url);
      const parts = s.split(','); return `<div class="vc lc">${i === 0 ? `<div class="map" id="mapBox">${mapSvg(slug + i, P)}</div>` : ''}<h3>${esc(parts[0])}</h3>${parts.length > 1 ? `<p class="addr">${esc(parts.slice(1).join(',').trim())}</p>` : ''}${hl ? `<p class="lh">${langSpan(hl.replace(/^.*?·\s*/, ''), lang)}</p>` : ''}${streets.length > 1 && hl ? '<p class="status st" hidden></p>' : ''}
<p class="lb">${i === 0 ? `<button type="button" id="mapLoad" class="btn ghost sm" hidden data-q="${esc(mapsQ(s))}" data-t="${esc(S.mapT(s))}">${esc(S.showMap)}</button>` : ''}<a class="btn ghost sm" href="${dirUrl(s)}"${ext}>${ICON.dir}<span>${esc(S.dir)}</span></a>${lk ? `<a class="btn ghost sm" href="${esc(lk.url)}"${ext}>${langSpan(cleanLabel(lk.label).replace(/\s*·.*$/, ''), lang)}${ICON.out}</a>` : `<a class="tl" href="${searchUrl(s)}"${ext}>${esc(S.openMaps)}${ICON.out}</a>`}</p></div>`; }).join('')
    : lounges.length ? `<div class="vc lc lounges"><h3>${esc(S.loungesT(loungeM[1]))}</h3><ul class="lng">${lounges.map(n => { const lk = loungeLink(n); if (lk) usedUrls.add(lk.url); return lk ? `<li><a href="${esc(lk.url)}"${ext}>${esc(n)}${ICON.out}</a></li>` : `<li><span>${esc(n)}</span></li>`; }).join('')}</ul></div>`
    : mobile ? `<div class="vc lc area"><h3>${esc(S.area)}</h3><p class="addr">${langSpan(l.address, lang)}</p></div>`
    : l.address ? `<div class="vc lc"><h3>${esc(S.visit)}</h3><p class="addr">${langSpan(l.address, lang)}</p></div>` : '';
  const ltile = (href, k, v, icon, x = '') => `<a class="lt" href="${esc(href)}"${x}><small>${esc(k)}</small><b>${v}</b>${icon}</a>`;
  const moreTiles = [
    ...(l.links || []).filter(x => !usedUrls.has(x.url) && x.url !== primary?.url).map(x => ltile(x.url, platformOf(x.url), langSpan(cleanLabel(x.label).replace(/\s+(?:en|on)\s+(Uber Eats|Grubhub|DoorDash|ezCater|Fresha|Booksy|Mindbody)$/i, '') || x.label, lang), ICON.out, ext)),
    tel ? ltile(`tel:${tel}`, S.call, esc(phoneF), ICON.call) : '',
    textOk ? ltile(smsHref, S.text, esc(phoneF), ICON.text) : '',
    igUrl ? ltile(igUrl, 'Instagram', '@' + esc(ig), ICON.ig, ext) : '',
  ].filter(Boolean);
  const visitTitle = S.end[sub] || S.visit;
  H.push(`<section class="sec end" id="visit" aria-labelledby="h-end"><div class="wrap"><div class="eg"><div class="ec"><h2 id="h-end">${esc(visitTitle)}</h2>${primary ? priBtn('btn pri xl') : ''}${moreTiles.length ? `<p class="eye">${esc(S.more[niche])}</p><div class="lts">${moreTiles.join('')}</div>` : ''}</div>
${hoursCard || locCards ? `<div class="vg">${hoursCard}${locCards}</div>` : ''}</div></div></section>`);

  // preview only: the DS ask
  if (MODE === 'preview') H.push(`<section class="ds" data-ds aria-labelledby="h-ds"><div class="wrap"><p class="eye">${esc(S.dsEye)}</p><h2 id="h-ds">${esc(S.dsH)}</h2><ul>${S.dsList.map(x => `<li>${ICON.check}<span>${esc(x)}</span></li>`).join('')}</ul><a class="ds-btn" href="{CLAIM_URL}">${esc(S.mine)}${ICON.go}</a><p class="ds-s">${esc(S.dsSmall)}</p></div></section>`);

  const ringTxt = art.ringText || `${l.name} ✺ ${streets[0]?.split(',')[0] || l.area || ''} ✺`;
  const footer = `<footer class="ft"><div class="wrap ftg">${ring('rgf', ringTxt, p.logo ? logo(160, 'flogo') : '', 'small')}<div><p class="fn">${esc(l.name)}</p><ul class="fs">${[l.address ? `<li>${langSpan(l.address, lang)}</li>` : '', tel ? `<li><a href="tel:${tel}">${esc(phoneF)}</a></li>` : '', igUrl ? `<li><a href="${igUrl}"${ext}>@${esc(ig)}</a></li>` : ''].join('')}</ul>${MODE === 'preview' ? `<p class="disc" data-ds>${S.foot(l.name)}</p><p data-ds><a class="rib-btn alt" href="{CLAIM_URL}">${S.mine}</a></p>` : ''}</div></div></footer>`;
  const barItems = [tel && !primary?.tel ? `<a href="tel:${tel}">${ICON.call}<span>${esc(S.call)}</span></a>` : textOk ? `<a href="${smsHref}">${ICON.text}<span>${esc(S.text)}</span></a>` : '',
    streets.length === 1 ? `<a href="${dirUrl(streets[0])}"${ext}>${ICON.dir}<span>${esc(S.dir)}</span></a>` : (streets.length > 1 || lounges.length || mobile) ? `<a href="#visit">${ICON.dir}<span>${esc(S.loc)}</span></a>` : igUrl ? `<a href="${igUrl}"${ext}>${ICON.ig}<span>Instagram</span></a>` : '',
    primary ? `<a class="pri" href="${esc(primary.href)}"${primary.ext ? ext : ''}>${primary.tel ? ICON.call : ICON.out}<span>${esc(primary.short)}</span></a>` : ''].filter(Boolean);
  const actbar = barItems.length ? `<nav class="actbar" aria-label="${S.quick}">${barItems.join('')}</nav>` : '';

  return finish({ p, l, lang, es, S, P, D, B, FD, FDI, FB, U, H, ribbon, footer, actbar, layout, hero, lines, emW, fsM, fsD, maxM, restTxt, restW, archStack, motif: mo, motifKey, cm, model, sub, niche, pageUrl, slug, ig, tel, sticker: stickerOn, floodUsed, archSide, promoPrice });
}
