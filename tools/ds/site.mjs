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
    menuEye: { food: 'On the menu', truck: 'Straight from the truck', cafe: 'From the counter', barber: 'Price board', nails: 'The menu', salon: 'The menu', gym: 'Train with us', studio: 'Train with us', home: 'Services' },
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
    loc: 'Locations', locs: n => `${n} locations`, theirWords: 'in their words', nav: 'Sections', moreLoc: 'Locations', good: 'Good to know', goodEye: 'About us',
  },
  es: {
    skip: 'Saltar al contenido', ribbonLabel: 'Aviso de vista previa', ribbon: n => `<b>Vista previa gratis para ${esc(n)}</b> <span>por DS Marketing</span>`, mine: 'La quiero',
    foot: n => `Esta es una vista previa gratis hecha por DS Marketing. No es la página oficial de ${esc(n)}.`,
    dsEye: 'DS Marketing', dsH: '¿Te gusta? Esta página puede ser tuya.', dsList: ['Con tu propio dominio', 'En vivo en 48 horas', 'Con tus fotos, tu menú y tus enlaces'], dsSmall: 'Vista previa gratis · sin compromiso',
    menu: { food: 'La carta', cafe: 'La carta', barber: 'Cortes y precios', nails: 'Servicios y precios', salon: 'Servicios y precios', gym: 'Las clases', studio: 'Las clases', home: 'Lo que hacemos' },
    menuNP: { nails: 'Nuestras uñas', salon: 'Servicios', barber: 'Servicios' },
    menuEye: { food: 'En la carta', truck: 'Desde la ventanilla', cafe: 'Desde el mostrador', barber: 'Lista de precios', nails: 'El menú', salon: 'El menú', gym: 'Entrena con nosotros', studio: 'Entrena con nosotros', home: 'Servicios' },
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
    loc: 'Locales', locs: n => `${n} locales`, theirWords: 'en sus palabras', nav: 'Secciones', moreLoc: 'Locales', good: 'Bueno saber', goodEye: 'Sobre nosotros',
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
  bodoni: { fam: 'Bodoni Moda', file: 'bodoni-moda.woff2', axes: 'wght=600,opsz=24', w: 600, cat: 'serif', upper: true, ls: 0.01, lh: 0.94, r: '999px', rc: '2px', restDisp: true },
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
  const CONN = /^(y|e|de|del|la|las|el|los|and|&|the|of|at|en)$/i;
  while (k > 1 && CONN.test(ws[k - 1])) k--;                 // never end the billboard on "y" / "de" / "&"
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
  P.fl = norm(art.field || b.heroBg || (layout === 'arch' ? (b.tagBg && lum(b.tagBg) > 0.45 ? b.tagBg : b.surface2 || P.surf2) : dark ? P.bg : P.a));
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
  P.restC = fixFg(b.accent && b.accent !== '#111111' ? b.accent : P.a, '#161616', 4.5);
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
  const ig = String(p.l.instagram || '').replace(/^@/, ''); if (ig) measure.push('@' + ig);
  const kindD = p.D.cat === 'serif' ? (p.D.w >= 600 ? 'serif-bold' : 'serif') : 'sans-bold';
  job.fonts.push({ key: `${p.l.slug}|D`, src: join(FONT_DIR, p.D.file), out: join(FONT_DIR, subFile(p.D.file, p.D.axes)), axes: p.D.axes, kind: kindD, sample, measure: measure.filter(m => !m.startsWith('@')), upper: p.D.upper, ls: p.D.ls });
  if (ig) job.fonts.push({ key: `${p.l.slug}|DH`, src: join(FONT_DIR, p.D.file), out: join(FONT_DIR, subFile(p.D.file, p.D.axes)), axes: p.D.axes, kind: kindD, sample, measure: ['@' + ig], upper: false, ls: 0 });
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
  const igPrimary = primary && primary.href === igUrl;
  const t1 = igPrimary ? (tel ? tile(`tel:${tel}`, S.call, phoneF, ICON.call) : '') : primary?.tel ? (textOk ? tile(smsHref, niche === 'home' ? S.textPhoto : S.text, phoneF, ICON.text) : igUrl ? tile(igUrl, 'Instagram', '@' + ig, ICON.ig, ext) : '')
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
  const heroFacts = [], heroUsed = new Set();
  if (!stickerOn && topRating) heroFacts.push(rateLine(topRating));
  if (sinceTxt) heroFacts.push(factPill(sinceTxt));
  if (pr.press[0]) { heroFacts.push(factPill(pr.press[0], ICON.award)); heroUsed.add(pr.press[0]); }
  if (!topRating && !pr.press.length) for (const f of pr.facts.slice(0, 2)) { heroFacts.push(factPill(es && factEs(f) ? factEs(f) : f)); heroUsed.add(f); }
  const statusSlot = model.k !== 'none' ? '<p class="status st" hidden></p><script>paintStatus()</script>' : '';

  // beauty price tags (instant "how much?")
  const priceTags = niche === 'beauty' ? (l.services || []).map(s => { const sp = splitPrice(s.price); return sp && sp.lead && sp.lead.length <= 11 && noEmoji(s.t).length <= 18 ? { t: noEmoji(s.t), p: sp.lead } : null; }).filter(Boolean).slice(0, 3) : [];
  const tagList = layout === 'field' ? priceTags.filter(t => t.t.length <= 12 && t.p.length <= 9) : priceTags;
  const priceTagsHtml = tagList.length >= 2 ? `<ul class="ptags">${tagList.map(t => `<li><span>${langSpan(t.t, lang)}</span><b>${esc(t.p)}</b></li>`).join('')}</ul>` : '';
  // food staccato line (their service titles)
  const stacT = (niche === 'food' ? (l.services || []).filter(s => !/catering|party|box|cater|events?/i.test(s.t)).map(s => noEmoji(s.t)) : []).slice(0, 3);
  const stac = stacT.length >= 2 && stacT.every(t => t.length <= 22) && stacT.join('').length <= 52 ? stacT : null;
  const promoPrice = String(l.promo || '').match(/\$\d[\d,.]*(?:\/mo)?/);
  const nowStrip = l.promo && promoPrice ? `<a class="now" href="#offer"><span>${esc(S.now)}</span>${langSpan(noEmoji(l.promo), lang)}${ICON.down}</a>` : '';

  const ringBase = l.name.length <= 30 ? l.name : nm.mark; const ringPlace = streets[0]?.split(',')[0] || String(l.area || '').split('·')[0].trim();
  const ringTxt = art.ringText || (`${ringBase} ✺ ${ringPlace} ✺`.length <= 46 ? `${ringBase} ✺ ${ringPlace} ✺` : `${ringBase} ✺ `);
  const initials = words(nm.mark).slice(0, 2).map(w => w[0]).join('').toUpperCase();
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
  else if (layout === 'badge') media = `<div class="hm">${ring('rgh', ringTxt, logo(320, 'rlogo'), 'big')}</div>`;
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
        : niche === 'beauty' && primary?.ext ? `<a class="ib fl" href="${esc(primary.href)}"${ext} aria-label="${esc(`${S.book} · ${s.t}`)}">${esc(S.book)}${ICON.out}</a>` : '';
      return `<li class="it" id="m-${i + 1}"><div class="ih"><h3>${langSpan(noEmoji(s.t), lang)}</h3>${sp?.lead ? `<span class="dots" aria-hidden="true"></span><span class="pr">${esc(sp.lead)}</span>` : ''}</div>${sp && sp.chips.length ? `<p class="pc">${sp.chips.map(c => `<span>${esc(c)}</span>`).join('')}</p>` : ''}${sp?.note ? `<p class="pn">${langSpan(sp.note, lang)}</p>` : ''}${rowA && !own ? rowA : ''}${s.d ? `<p class="d">${langSpan(s.d, lang)}</p>` : ''}${rowA && own ? rowA : ''}</li>`;
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
    const body = m ? `${m[1].trim() ? `<span class="t">${langSpan(noEmoji(m[1].trim().replace(/[,:·]\s*$/, '')), lang)}</span>` : ''}<span class="big">${esc(m[2])}</span>${m[3].trim() ? `<span class="t">${langSpan(m[3].trim().replace(/^[,;·]\s*/, ''), lang)}</span>` : ''}` : (() => { const k = String(l.promo).search(/[:·]/); return k > 0 ? `<span class="t">${langSpan(noEmoji(l.promo.slice(0, k)), lang)}</span><span class="tb">${langSpan(l.promo.slice(k + 1).trim(), lang)}</span>` : `<span class="t">${langSpan(noEmoji(l.promo), lang)}</span>`; })();
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
  const facts = [...pr.press, ...pr.facts].filter(f => f !== pr.since?.raw && !heroUsed.has(f));
  if (pr.ratings.length || quotes.length || facts.length || persons.length) {
    const onlyFacts = !pr.ratings.length && !quotes.length && !persons.length;
    const flood = !floodUsed;
    const q0 = quotes[0], qRest = quotes.slice(1);
    const rl = topRating ? [topRating, ...pr.ratings.filter(r => r !== topRating)] : pr.ratings;
    const rcards = rl.map((r, i) => { const u = linkForPlat(r.plat); return i === 0 ? `<div class="rc r1"><p class="rv">${esc(r.v)}</p>${stars(r.v, `st${i}`)}<p class="rp"><b>${esc(r.plat)}</b> · ${esc(r.n)} ${esc(unitL(r.unit, lang))}</p>${u ? `<a class="tl" href="${esc(u)}"${ext}>${esc(S.seeOn(r.plat))}${ICON.out}</a>` : ''}</div>`
      : `<div class="rc r2"><p class="rp2">${ICON.star}<b>${esc(r.v)}</b> ${esc(r.plat)} · ${esc(r.n)} ${esc(unitL(r.unit, lang))}</p>${u ? `<a class="tl" href="${esc(u)}"${ext}>${esc(S.seeOn(r.plat))}${ICON.out}</a>` : ''}</div>`; }).join('');
    const pl = persons.map(pp => `<p class="pl">${ICON.star}${langSpan(pp.raw, lang)}</p>`).join('');
    const qs = qRest.map(q => `<figure class="pq"><blockquote><p>“${langSpan(q.q, lang)}”</p></blockquote><figcaption>— ${esc(srcL(q.src, lang))}</figcaption></figure>`).join('');
    const fs = facts.length ? `<ul class="facts">${facts.map(f => `<li>${/award|premio|featured|destacad|diario|press/i.test(f) ? ICON.award : ICON.check}<span>${langSpan(es && factEs(f) ? factEs(f) : f, lang)}</span></li>`).join('')}</ul>` : '';
    H.push(`<section class="sec proof${flood ? ' flood' : ''}" id="reviews" aria-labelledby="h-proof"><div class="wrap"><p class="eye">${esc(onlyFacts ? S.goodEye : S.reviewsEye)}</p><h2 id="h-proof"${q0 ? ' class="vh"' : ''}>${esc(onlyFacts ? S.good : S.reviews)}</h2>
${q0 ? `<figure class="bq"><blockquote><p>“${langSpan(q0.q, lang)}”</p></blockquote><figcaption>— ${esc(srcL(q0.src, lang))}</figcaption></figure>` : ''}<div class="pg">${rcards ? `<div class="rcs">${rcards}${pl}</div>` : pl ? `<div class="rcs">${pl}</div>` : ''}${qs ? `<div class="qs">${qs}</div>` : ''}${fs}</div></div></section>`);
  }

  // gallery: photos not in the hero (no repeats), flyers framed as posts, before/after pairs, an Instagram tile
  const igTile = igUrl ? `<a class="g gi" href="${igUrl}"${ext}>${p.logo ? `<span class="gib">${logo(64, 'glogo')}</span>` : ICON.ig}<b>@${esc(ig)}</b><span><i class="gt">${esc(S.seeIg)}</i>${ICON.out}</span></a>` : '';
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
  else if (genHours.length && (genHours.length > 1 || model.rows[genHours[0].i])) hoursCard = `<div class="vc hc"><h3>${esc(S.hours)}</h3>${streets.length > 1 ? '' : '<p class="status st" hidden></p>'}<ul class="hl">${genHours.map(({ h, i }) => `<li${model.rows[i] ? (model.rows[i].length < 7 ? ` data-days="${model.rows[i].join(',')}"` : '') : ' class="note"'}>${langSpan(h, lang)}</li>`).join('')}</ul></div>`;
  const locCards = streets.length ? streets.map((s, i) => { const lk = locLink(s); const hl = lineOf(s); if (lk) usedUrls.add(lk.url);
      const parts = s.split(','); return `<div class="vc lc">${i === 0 ? `<div class="map" id="mapBox">${mapSvg(slug + i, P)}</div>` : ''}<h3>${esc(parts[0])}</h3>${parts.length > 1 ? `<p class="addr">${esc(parts.slice(1).join(',').trim())}</p>` : ''}${hl ? `<p class="lh">${langSpan(hl.replace(/^.*?·\s*/, ''), lang)}</p>` : ''}${streets.length > 1 && hl ? '<p class="status st" hidden></p>' : ''}
<p class="lb">${i === 0 ? `<button type="button" id="mapLoad" class="btn ghost sm" hidden data-q="${esc(mapsQ(s))}" data-t="${esc(S.mapT(s))}">${esc(S.showMap)}</button>` : ''}<a class="btn ghost sm" href="${dirUrl(s)}"${ext}>${ICON.dir}<span>${esc(S.dir)}</span></a>${lk ? `<a class="btn ghost sm" href="${esc(lk.url)}"${ext}>${langSpan(cleanLabel(lk.label).replace(/\s*·.*$/, ''), lang)}${ICON.out}</a>` : ''}</p></div>`; }).join('')
    : lounges.length ? `<div class="vc lc lounges"><h3>${esc(S.loungesT(loungeM[1]))}</h3><ul class="lng">${lounges.map(n => { const lk = loungeLink(n); if (lk) usedUrls.add(lk.url); return lk ? `<li><a href="${esc(lk.url)}"${ext}>${esc(n)}${ICON.out}</a></li>` : `<li><span>${esc(n)}</span></li>`; }).join('')}</ul></div>`
    : mobile ? `<div class="vc lc area"><h3>${esc(S.area)}</h3><p class="addr">${langSpan(l.address, lang)}</p></div>`
    : l.address ? `<div class="vc lc"><h3>${esc(S.visit)}</h3><p class="addr">${langSpan(l.address, lang)}</p></div>` : '';
  const ltile = (href, k, v, icon, x = '') => `<a class="lt" href="${esc(href)}"${x}><small>${esc(k)}</small><b>${v}</b>${icon}</a>`;
  const moreTiles = [
    ...(l.links || []).filter(x => !usedUrls.has(x.url) && x.url !== primary?.url).map(x => ltile(x.url, platformOf(x.url), langSpan(cleanLabel(x.label).replace(/\s+(?:en|on)\s+(Uber Eats|Grubhub|DoorDash|ezCater|Fresha|Booksy|Mindbody)$/i, '') || x.label, lang), ICON.out, ext)),
    tel ? ltile(`tel:${tel}`, S.call, esc(phoneF), ICON.call) : '',
    textOk ? ltile(smsHref, S.text, esc(phoneF), ICON.text) : '',
    igUrl && !igPrimary ? ltile(igUrl, 'Instagram', '@' + esc(ig), ICON.ig, ext) : '',
  ].filter(Boolean);
  const visitTitle = S.end[sub] || S.visit;
  H.push(`<section class="sec end" id="visit" aria-labelledby="h-end"><div class="wrap"><div class="eg"><div class="ec"><h2 id="h-end">${esc(visitTitle)}</h2>${primary ? priBtn('btn pri xl') : ''}${moreTiles.length ? `<p class="eye">${esc(S.more[niche])}</p><div class="lts">${moreTiles.join('')}</div>` : ''}</div>
${hoursCard || locCards ? `<div class="vg">${hoursCard}${locCards}</div>` : ''}</div></div></section>`);

  // preview only: the DS ask
  if (MODE === 'preview') H.push(`<section class="ds" data-ds aria-labelledby="h-ds"><div class="wrap"><p class="eye">${esc(S.dsEye)}</p><h2 id="h-ds">${esc(S.dsH)}</h2><ul>${S.dsList.map(x => `<li>${ICON.check}<span>${esc(x)}</span></li>`).join('')}</ul><a class="ds-btn" href="{CLAIM_URL}">${esc(S.mine)}${ICON.go}</a><p class="ds-s">${esc(S.dsSmall)}</p></div></section>`);

  const footer = `<footer class="ft"><div class="wrap ftg">${ring('rgf', ringTxt, p.logo ? logo(160, 'flogo') : `<span class="rini">${esc(initials)}</span>`, 'small')}<div><p class="fn">${esc(l.name)}</p><ul class="fs">${[l.address ? `<li>${langSpan(l.address, lang)}</li>` : '', tel ? `<li><a href="tel:${tel}">${esc(phoneF)}</a></li>` : '', igUrl ? `<li><a href="${igUrl}"${ext}>@${esc(ig)}</a></li>` : ''].join('')}</ul></div>${MODE === 'preview' ? `<p class="disc" data-ds>${S.foot(l.name)}</p><p class="dsb" data-ds><a class="rib-btn alt" href="{CLAIM_URL}">${S.mine}</a></p>` : ''}</div></footer>`;
  const barItems = [tel && !primary?.tel ? `<a href="tel:${tel}">${ICON.call}<span>${esc(S.call)}</span></a>` : textOk ? `<a href="${smsHref}">${ICON.text}<span>${esc(S.text)}</span></a>` : '',
    streets.length === 1 ? `<a href="${dirUrl(streets[0])}"${ext}>${ICON.dir}<span>${esc(S.dir)}</span></a>` : (streets.length > 1 || lounges.length || mobile) ? `<a href="#visit">${ICON.dir}<span>${esc(S.loc)}</span></a>` : igUrl && !igPrimary ? `<a href="${igUrl}"${ext}>${ICON.ig}<span>Instagram</span></a>` : '',
    primary ? `<a class="pri" href="${esc(primary.href)}"${primary.ext ? ext : ''}>${primary.tel ? ICON.call : ICON.out}<span>${esc(primary.short)}</span></a>` : ''].filter(Boolean);
  const actbar = barItems.length ? `<nav class="actbar" aria-label="${S.quick}">${barItems.join('')}</nav>` : '';

  return finish({ p, l, lang, es, S, P, D, B, FD, FDI, FB, U, H, ribbon, footer, actbar, layout, hero, lines, emW, fsM, fsD, maxM, restTxt, restW, archStack, motif: mo, motifKey, cm, model, sub, niche, pageUrl, slug, ig, tel, sticker: stickerOn, floodUsed, archSide, promoPrice });
}

// ================================================================= CSS + head + scripts + gate
function finish(c) {
  const { p, l, lang, es, S, P, D, B, FD, FDI, FB, U, H, layout, hero, lines, emW, fsM, fsD, restTxt, restW, archStack, motifKey, cm, model, sub, niche, pageUrl, slug } = c;
  const fam = D.fam, upper = D.upper, dstyle = D.style || 'normal';
  const caseCss = upper ? 'text-transform:uppercase;' : '';
  const isSerif = D.cat === 'serif', realItal = D.style === 'italic' || !!D.ital;
  const h2Size = { serif: 'clamp(42px,11.5vw,92px)', condensed: 'clamp(48px,13.5vw,104px)', grotesque: 'clamp(32px,8.6vw,70px)', script: 'clamp(34px,9.4vw,74px)' }[D.cat];
  const h3Size = { serif: '25px', condensed: '27px', grotesque: '19px', script: '22px' }[D.cat];
  const dispTrack = `${D.ls}em`;
  // motif tile in brand colours
  const MC = { awning: [layout === 'cinematic' ? P.a : P.fl, P.flIsA || P.flDark ? '#ffffff' : P.bg], picado: [P.b.tagBg || P.link, P.a, P.mk2 !== P.mk ? P.mk2 : P.surf2, P.link], checker: [P.a, P.bg],
    arches: [P.link], sparkle: [P.link], deco: [P.a], tape: [P.a, P.dark ? mix(P.bg, '#000000', 0.3) : P.fl], wave: [P.a], dots: [P.link] }[motifKey] || [P.a, P.bg];
  const mo = MOTIFS[motifKey](...MC);
  const restDisp = restTxt && D.restDisp;
  const restH = restTxt ? (restDisp ? 'calc(var(--fs2) * 1.1 + 6px)' : '30px') : '0px';
  const nL = lines.length;
  const spill = P.dark ? 0.3 : 0.0;
  const sa = hero ? clamp(1 - 0.30 / Math.max(0.3, hero.p90Bot ?? 0.5), 0.5, 0.86) : 0.8;
  const rcs = `min(${D.rc}, 16px)`;
  const fsRest = restTxt && restDisp ? `min(calc(${archStack || layout !== 'arch' ? '(100vw - 2 * var(--g))' : '(50vw - 26px)'} / ${(restW * 1.05).toFixed(3)}), calc(var(--fs) * .44))` : '0px';
  const fsRestD = restTxt && restDisp ? `min(calc((100vw - min(46vw, 720px) - 116px) / ${(restW * 1.05).toFixed(3)}), calc(var(--fs) * .4))` : '0px';
  const heroDarkPhoto = layout === 'cinematic';
  const fontCss = [
    `@font-face{font-family:'${fam}';src:url(${U.font(FD.out)}) format('woff2');font-weight:${D.w};font-style:${dstyle};font-display:swap}`,
    D.ital && FDI ? `@font-face{font-family:'${fam}';src:url(${U.font(FDI.out)}) format('woff2');font-weight:${D.ital.w};font-style:italic;font-display:swap}` : '',
    `@font-face{font-family:'${B.fam}';src:url(${U.font(FB.out)}) format('woff2');font-weight:${B.range};font-style:normal;font-display:swap}`,
    FD.local ? `@font-face{font-family:'D Fallback';src:${FD.local};${FD.fallback}}` : '',
    FB.local ? `@font-face{font-family:'B Fallback';src:${FB.local};${FB.fallback}}` : '',
  ].filter(Boolean).join('\n');
  const css = `${fontCss}
:root{--bg:${P.bg};--ink:${P.ink};--sub:${P.sub};--surf:${P.surf};--surf2:${P.surf2};--line:${P.line};--a:${P.a};--onA:${P.onA};--link:${P.link};--mark:${P.mark};--focus:${P.focus};
--fl:${P.fl};--onFl:${P.onFl};--flSub:${P.flSub};--flLine:${P.flLine};--flSurf:${P.flSurf};--flBtn:${P.flBtn};--onFlBtn:${P.onFlBtn};--mk:${P.mk};--mk2:${P.mk2};
--disp:'${fam}','D Fallback',${isSerif ? 'Georgia,serif' : 'Impact,Arial Black,sans-serif'};--body:'${B.fam}','B Fallback',system-ui,-apple-system,'Segoe UI',sans-serif;--ds:${dstyle};
--g:20px;--r:${D.r};--rc:${D.rc};--rcs:${rcs};--bar:calc(70px + env(safe-area-inset-bottom))}
*,*::before,*::after{box-sizing:border-box}
html{-webkit-text-size-adjust:100%;text-size-adjust:100%;scroll-behavior:smooth;scroll-padding-top:12px;scroll-padding-bottom:calc(var(--bar) + 16px)}
body{margin:0;background:var(--bg);color:var(--ink);font:400 17px/1.55 var(--body);overflow-wrap:break-word;-webkit-font-smoothing:antialiased;overflow-x:hidden}
img{display:block;max-width:100%;height:auto}
picture{display:block}
a{color:inherit;text-decoration:none}
button,input{font:inherit;color:inherit}
svg{width:1.15em;height:1.15em;flex:none}
h1,h2,h3,p,ul,figure,blockquote{margin:0}
ul{padding:0;list-style:none}
:focus-visible{outline:3px solid var(--focus);outline-offset:3px;border-radius:4px}
.hero :focus-visible,.band :focus-visible,.flood :focus-visible{outline-color:${P.flFocus}}
[hidden]{display:none!important}
.vh{position:absolute!important;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0);white-space:nowrap}
.skip{position:absolute;left:12px;top:-80px;z-index:60;background:var(--ink);color:var(--bg);padding:12px 16px;border-radius:8px;min-height:44px}
.skip:focus{top:12px}
.wrap{max-width:1200px;margin:0 auto;padding:0 var(--g)}
h1,h2,.bandp .t,.bq p,.pq p,.promise{text-wrap:balance}
.eye{font:800 12px/1.3 var(--body);letter-spacing:.22em;text-transform:uppercase;color:var(--link)}
.sec{padding:48px 0}
.sec h2,.end h2{font:${dstyle} ${D.w} ${h2Size}/${isSerif ? '.98' : '.94'} var(--disp);letter-spacing:${dispTrack};${caseCss}margin:10px 0 28px}
.tl{display:inline-flex;align-items:center;gap:8px;min-height:44px;font-weight:700;color:var(--link);text-decoration:underline;text-underline-offset:4px;text-decoration-thickness:1.5px}
.btn{display:inline-flex;align-items:center;justify-content:center;gap:10px;min-height:56px;padding:0 24px;border-radius:var(--r);font:700 16.5px/1.15 var(--body);text-align:center;transition:transform .2s ease,box-shadow .2s ease;cursor:pointer}
.btn small{font-weight:600;font-size:.86em;opacity:.85}
.btn.pri{background:var(--a);color:var(--onA);box-shadow:0 10px 24px -14px var(--a)}
.btn.ghost{border:1.5px solid currentColor;background:transparent}
.btn.sm{min-height:48px;padding:0 14px;font-size:14.5px;gap:8px}
.btn.xl{min-height:64px;font-size:18px;padding:0 30px}
.btn:active{transform:scale(.98)}
/* ribbon (preview only) — in the flow, never over content */
.rib{display:flex;align-items:center;justify-content:space-between;gap:12px;min-height:52px;padding:4px 6px 4px 14px;background:#141414;color:#f4f4f4;font:400 13px/1.3 var(--body)}
.rib p{min-width:0}.rib b{font-weight:700}.rib span{color:#c8c8c8}
.rib-btn{display:inline-flex;align-items:center;min-height:44px;padding:0 18px;border-radius:999px;background:#fff;color:#141414;font:700 14px/1 var(--body);white-space:nowrap;flex:none}
.rib-btn.alt{background:var(--bg);color:var(--ink)}
.dsb{grid-column:1/-1}
/* ---------------- hero */
.hero{--hbg:var(--fl);--hink:var(--onFl);--hsub:var(--flSub);--hline:var(--flLine);--hsurf:var(--flSurf);--hb:var(--flBtn);--hbi:var(--onFlBtn);
position:relative;display:grid;grid-template-columns:100%;background:var(--hbg);color:var(--hink);overflow:hidden;isolation:isolate;padding-bottom:22px}
.hero>*{min-width:0}
.hero.L-cine{--hbg:var(--bg);--hink:var(--ink);--hsub:var(--sub);--hline:var(--line);--hsurf:var(--surf);--hb:var(--a);--hbi:var(--onA)}
.top{grid-area:t;z-index:3;display:flex;align-items:center;justify-content:space-between;gap:10px;padding:12px var(--g) 6px}
.brand{display:flex;align-items:center;min-height:48px}
.logo{width:48px;height:48px;border-radius:50%;object-fit:cover;box-shadow:0 0 0 2px var(--hline)}
.igl{display:inline-flex;align-items:center;gap:7px;min-height:44px;padding:0 14px;border-radius:999px;border:1.5px solid var(--hline);font:700 13.5px/1 var(--body)}
.hm{grid-area:m;position:relative;min-width:0}
.mk{grid-area:k;z-index:3;position:relative;--fs:${fsM};--fs2:${fsRest};padding:6px var(--g) 0;color:var(--mk);font:${dstyle} ${D.w} var(--fs)/${D.lh} var(--disp);letter-spacing:${dispTrack};${caseCss}}
.mkl{display:block}
.mk .ln{display:block;overflow:hidden;padding:.16em 0 .06em;margin:-.16em 0 -.06em;white-space:nowrap}
.mk .ln>span{display:inline-block}
.mk .l2{color:var(--mk2)}
.mkr{display:block;margin-top:8px;font:800 13.5px/1.2 var(--body);letter-spacing:.26em;text-transform:uppercase;color:var(--hsub);font-style:normal}
.mkr.rd{margin-top:2px;font:${D.restItal ? 'italic' : dstyle} ${D.restItal ? D.ital.w : D.w} var(--fs2)/1.05 var(--disp);letter-spacing:${upper ? '.04em' : '0'};text-transform:${upper ? 'uppercase' : 'none'};color:var(--mk2)}
.hp-p{grid-area:p;padding:14px var(--g) 0;display:grid;gap:8px}
.stac{font:800 12.5px/1.4 var(--body);letter-spacing:.2em;text-transform:uppercase;color:var(--hsub)}
.stac i{font-style:normal;opacity:.7}
.promise{font:${isSerif && realItal ? 'italic ' : ''}${isSerif ? 500 : 700} clamp(20px,5.6vw,30px)/1.18 var(--body);letter-spacing:-.01em;max-width:24ch}
${isSerif ? '.promise{font-family:var(--disp);font-style:' + (realItal ? 'italic' : 'normal') + ';font-weight:' + (D.ital ? D.ital.w : D.w) + ';font-size:clamp(24px,6.6vw,' + (upper ? 34 : 38) + 'px);line-height:1.08}' : ''}
.promise small{display:block;margin-top:6px;font:700 12.5px/1.2 var(--body);letter-spacing:.14em;text-transform:uppercase;font-style:normal;color:var(--hsub)}
.hs{grid-area:s;padding:14px var(--g) 0;display:flex;flex-wrap:wrap;align-items:center;gap:10px 14px}
.hfs{display:flex;flex-wrap:wrap;gap:8px 14px;align-items:center}
.status{display:inline-flex;align-items:center;gap:8px;min-height:34px;padding:5px 12px 5px 10px;border-radius:999px;background:var(--hsurf, var(--surf));border:1px solid var(--hline, var(--line));font:700 14px/1.25 var(--body);color:var(--hink, var(--ink))}
.status::before{content:"";width:9px;height:9px;border-radius:50%;background:#8a8a8a;flex:none}
.status[data-s=open]::before{background:#1f9d55;box-shadow:0 0 0 4px rgba(31,157,85,.22)}
.status[data-s=closing]::before,.status[data-s=opening]::before{background:#e09400}
.status[data-s=closed]::before{background:#d6453a}
.status[data-s=next]::before{background:#1f9d55}
.rt,.hf{display:inline-flex;align-items:center;gap:6px;font:600 15px/1.3 var(--body)}
.rt b{font-weight:800}.rt i{font-style:normal;opacity:.65}
.rt svg,.hf svg{color:var(--mk)}
.L-cine .rt svg,.L-cine .hf svg{color:var(--link)}
.acts{grid-area:c;padding:16px var(--g) 0;display:grid;gap:10px}
.acts .btn.pri,.hx .btn.pri{background:var(--hb);color:var(--hbi);box-shadow:0 12px 28px -16px rgba(0,0,0,.6)}
.acts .btn.pri{width:100%;justify-content:space-between;padding:0 22px}
.tiles{display:grid;grid-template-columns:1fr 1fr;gap:10px}
.tiles .tile:only-child{grid-column:1/-1}
.tile{display:flex;flex-direction:column;justify-content:center;gap:2px;min-height:62px;padding:8px 14px;border-radius:var(--rcs);border:1.5px solid var(--hline);min-width:0}
.tile .tk{display:flex;align-items:center;gap:6px;font:800 11.5px/1.2 var(--body);letter-spacing:.14em;text-transform:uppercase;color:var(--hsub)}
.tile .tk svg{width:14px;height:14px}
.tile b{font:700 15px/1.25 var(--body);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.hx{grid-area:x;padding:12px var(--g) 0;display:grid;gap:10px}
.now{display:flex;align-items:center;gap:10px;min-height:48px;padding:8px 14px;border-radius:var(--rcs);background:var(--hsurf);border:1.5px dashed var(--hline);font:600 14.5px/1.35 var(--body)}
.now span{flex:none;font:800 11px/1.1 var(--body);letter-spacing:.16em;text-transform:uppercase;color:var(--hsub)}
.now svg{margin-left:auto;width:16px;height:16px}
.ptags{display:flex;flex-wrap:wrap;gap:6px}
.ptags li{display:inline-flex;align-items:baseline;gap:6px;padding:7px 12px;border-radius:999px;background:var(--hsurf);border:1px solid var(--hline);font:600 14px/1.2 var(--body)}
.ptags b{font-weight:800;font-variant-numeric:tabular-nums}
/* cinematic: full-bleed own photo, the name over its bottom edge */
.L-cine{grid-template-areas:"m" "k" "p" "s" "c" "x"}
.L-cine .top{grid-area:m;align-self:start;color:#fff}
.L-cine .top .igl{border-color:rgba(255,255,255,.5);background:rgba(0,0,0,.38)}
.L-cine .logo{box-shadow:0 0 0 2px rgba(255,255,255,.8)}
.L-cine .hm{height:430px;overflow:hidden;background:#111}
.L-cine .hm picture,.L-cine .hm img{position:absolute;inset:0;width:100%;height:100%;object-fit:cover}
.L-cine .hm::after{content:"";position:absolute;inset:0;background:linear-gradient(180deg,rgba(0,0,0,.42) 0,rgba(0,0,0,0) 22%,rgba(0,0,0,0) 40%,rgba(0,0,0,${(sa * 0.7).toFixed(2)}) 62%,rgba(0,0,0,${sa.toFixed(2)}) 80%,${P.dark ? P.bg : `rgba(0,0,0,${Math.min(0.92, sa + 0.06).toFixed(2)})`} 100%);pointer-events:none}
.L-cine .mk{--mkh:calc(var(--fs) * ${(D.lh * nL).toFixed(3)} + ${restH});margin-top:calc(var(--mkh) * -${(1 - spill).toFixed(2)} - ${P.dark ? 6 : 18}px);color:#fff;text-shadow:0 2px 26px rgba(0,0,0,.35)}
.L-cine .mk .l2{color:#fff}
.L-cine .mkr{color:#fff;opacity:.95}
${P.dark ? `.L-cine .mkr:not(.rd){color:${P.restC}}` : ''}
.credit{position:absolute;right:8px;top:86px;z-index:2;writing-mode:vertical-rl;padding:9px 5px;border-radius:999px;background:rgba(0,0,0,.55);font:700 10.5px/1 var(--body);letter-spacing:.16em;text-transform:uppercase;color:#fff}
/* field: brand colour, tilted framed photo + one sticker, beside the status / prices column */
.L-field{grid-template-columns:minmax(0,1fr) 52%;grid-template-areas:"t t" "k k" "p p" "s m" "c c" "x x"}
.L-field.nophoto{grid-template-columns:100%;grid-template-areas:"t" "k" "p" "s" "c" "x"}
.L-field .hm{padding:18px var(--g) 8px 4px}
.frame{position:relative;margin:0;aspect-ratio:4/5;border-radius:var(--rcs);overflow:hidden;transform:rotate(2.6deg);background:var(--hsurf);box-shadow:0 0 0 6px ${P.flDark ? P.mk : '#ffffff'},0 22px 40px -18px rgba(0,0,0,.6)}
.frame picture,.frame img,.archf picture,.archf img{width:100%;height:100%;object-fit:cover}
.L-field .hs{flex-direction:column;align-items:flex-start;padding:18px 8px 0 var(--g);gap:12px}
.L-field .hfs{flex-direction:column;align-items:flex-start;gap:8px}
.L-field .ptags{flex-direction:column;align-items:stretch;width:100%}.L-field .ptags li{justify-content:space-between;border-radius:var(--rcs)}
.stk{position:absolute;z-index:2;left:-26px;bottom:-6px;width:104px;height:104px;display:grid;place-items:center;transform:rotate(-9deg);color:var(--hb)}
.stk .bsh{position:absolute;inset:0;width:100%;height:100%;filter:drop-shadow(0 6px 10px rgba(0,0,0,.25))}
.stk span{position:relative;display:grid;justify-items:center;color:var(--hbi);text-align:center;line-height:1.05}
.stk b{display:flex;align-items:center;gap:2px;font:800 26px/1 var(--body)}
.stk b svg{width:15px;height:15px}
.stk small{font:800 9px/1.12 var(--body);letter-spacing:.02em;text-transform:uppercase;max-width:90px}
/* arch: nails & salons */
.L-arch{grid-template-columns:minmax(0,1fr) 46%;grid-template-areas:"t t" "k m" "p p" "s s" "c c" "x x"}
.L-arch.arch-stack{grid-template-columns:100%;grid-template-areas:"t" "m" "k" "p" "s" "c" "x"}
.L-arch .mk{align-self:end;padding-bottom:4px}
.L-arch .hm{padding:8px var(--g) 0 0}
.archf{position:relative;margin:0;aspect-ratio:4/5.2;border-radius:999px 999px var(--rcs) var(--rcs);overflow:hidden;background:var(--hsurf);box-shadow:0 0 0 7px var(--hbg),0 0 0 8px var(--hline)}
.L-arch .stk{left:auto;right:-6px;bottom:-14px;width:96px;height:96px}
/* badge: the logo in a ring of their own words */
.L-badge{grid-template-areas:"t" "m" "k" "p" "s" "c" "x";text-align:center}
.L-badge .top{justify-content:flex-end}
.L-badge .hm{display:grid;place-items:center;padding:2px 0 8px}
.L-badge .hp-p,.L-badge .hs,.L-badge .hfs{justify-items:center;justify-content:center}
.L-badge .promise{margin:0 auto}
.ring{position:relative;flex:none;display:grid;place-items:center;color:var(--hsub)}
.ring svg{position:absolute;inset:0;width:100%;height:100%;overflow:visible}
.ring text{font:800 14.5px var(--body);letter-spacing:.1em;fill:currentColor}
.ring img{width:62%;height:62%;border-radius:50%;object-fit:cover}
.ring.big{width:214px;height:214px;color:var(--mk2)}
.ring.big img{box-shadow:0 0 0 4px var(--hbg),0 0 0 5.5px var(--hline)}
/* pair: before / after slider */
.L-pair{grid-template-areas:"t" "k" "p" "m" "s" "c" "x"}
.L-pair .hm{padding:16px var(--g) 0}
.ba{position:relative;overflow:hidden;border-radius:var(--rcs);aspect-ratio:${hero && layout === 'pair' ? `${AN.pairs[`${slug}|${hero.n}`].before.w}/${AN.pairs[`${slug}|${hero.n}`].before.h}` : '16/9'};background:var(--hsurf);box-shadow:0 18px 36px -20px rgba(0,0,0,.7)}
.ba picture,.ba img{position:absolute;inset:0;width:100%;height:100%;object-fit:cover}
.baA{position:absolute;inset:0;clip-path:inset(0 0 0 var(--p))}
.baL{position:absolute;top:10px;z-index:2;padding:6px 10px;border-radius:999px;background:rgba(0,0,0,.66);color:#fff;font:800 11px/1 var(--body);letter-spacing:.14em;text-transform:uppercase}
.baL.b{left:10px}.baL.a{right:10px}
.baH{position:absolute;top:0;bottom:0;left:var(--p);width:3px;margin-left:-1.5px;background:#fff;z-index:2;box-shadow:0 0 0 1px rgba(0,0,0,.2)}
.baH::after{content:"⟷";position:absolute;top:50%;left:50%;width:42px;height:42px;margin:-21px 0 0 -21px;border-radius:50%;background:#fff;color:#111;display:grid;place-items:center;font:700 18px/1 var(--body);box-shadow:0 4px 14px rgba(0,0,0,.35)}
.baR{position:absolute;inset:0;z-index:3;width:100%;height:100%;margin:0;opacity:0;cursor:ew-resize;display:none}
.js .baR{display:block}
.ba:focus-within{outline:3px solid ${P.flFocus};outline-offset:3px}
/* ---------------- ornament divider */
.orn-div{height:${mo.h}px;background:${svgUri(mo.svg)} ${motifKey === 'awning' ? '0 0' : 'center'}/${mo.w}px ${mo.h}px repeat-x;${motifKey === 'awning' ? '' : 'margin:22px 0 0;'}}
${['arches', 'sparkle', 'deco', 'wave', 'dots'].includes(motifKey) ? `.orn-div{max-width:${mo.w * 5}px;margin:26px auto 0}` : ''}
/* ---------------- team */
.tg{display:grid;gap:10px}
.tg a{display:flex;align-items:center;gap:14px;min-height:76px;padding:12px 16px 12px 12px;border-radius:var(--rcs);background:var(--surf);border:1px solid var(--line)}
.ini{display:grid;place-items:center;width:52px;height:52px;border-radius:50%;background:var(--a);color:var(--onA);font:${dstyle} ${D.w} 26px/1 var(--disp)}
.tw{flex:1;min-width:0}.tw b{display:block;font:${dstyle} ${D.w} ${h3Size}/1.1 var(--disp);${caseCss}}.tw small{display:flex;flex-wrap:wrap;align-items:center;gap:5px;color:var(--sub);font-size:14.5px}
.tg svg{color:var(--link)}
/* ---------------- menu board */
.card{position:relative;background:var(--surf);border-radius:var(--rc);padding:34px 20px 30px;box-shadow:inset 0 0 0 1px var(--line),inset 0 0 0 7px var(--surf),inset 0 0 0 8px var(--line)}
.p-menu-first .card{margin-top:22px}
.ch{text-align:center;margin-bottom:22px}
.cb{display:block}
.clogo{width:76px;height:76px;border-radius:50%;object-fit:cover;margin:-72px auto 12px;box-shadow:0 0 0 5px var(--surf),0 0 0 6px var(--line)}
.ch h2{margin:8px 0 12px}
.orn{display:flex;align-items:center;justify-content:center;gap:14px;color:var(--link);font-size:14px}
.orn i{display:block;width:56px;height:1px;background:var(--line)}
.items{display:grid;gap:20px}
.it{break-inside:avoid}
.ih{display:flex;align-items:baseline;gap:10px}
.ih h3{font:${dstyle} ${D.w} ${h3Size}/1.12 var(--disp);letter-spacing:${isSerif ? '-.005em' : '.005em'};${caseCss}}
.dots{flex:1;min-width:18px;border-bottom:2px dotted var(--sub);opacity:.55;transform:translateY(-5px)}
.pr{font:800 17px/1 var(--body);font-variant-numeric:tabular-nums;color:var(--link);white-space:nowrap}
.pc{display:flex;flex-wrap:wrap;gap:6px;margin-top:8px}
.pc span{padding:5px 10px;border-radius:999px;background:var(--bg);border:1px solid var(--line);font:700 13.5px/1.25 var(--body);color:var(--ink);font-variant-numeric:tabular-nums}
.pn{margin-top:6px;font-size:13.5px;color:var(--sub);font-style:italic}
.it .d{margin-top:6px;color:var(--sub);font-size:15.5px;line-height:1.5}
.ib{display:inline-flex;align-items:center;gap:6px;min-height:44px;margin-top:4px;padding:0 14px;border-radius:999px;border:1.5px solid var(--line);font:700 14px/1 var(--body);color:var(--link)}
.ib.fl{float:right;margin:10px 0 4px 14px}
.it::after{content:"";display:block;clear:both}
.cf{text-align:center;margin-top:28px}
/* ---------------- flood band: the promo */
.band{position:relative;overflow:hidden;background:var(--a);color:var(--onA);padding:70px 0;text-align:center;isolation:isolate}
.band .eye{color:var(--onA);opacity:.92;margin-bottom:14px}
.burst{position:absolute;z-index:-1;right:-70px;top:-60px;width:240px;height:240px;color:${mix(P.a, P.onA, 0.14)};opacity:.9}
.burst svg{width:100%;height:100%}
.bandp{font:${dstyle} ${D.w} clamp(28px,7.4vw,54px)/1.08 var(--disp);letter-spacing:${dispTrack};${caseCss}margin:0 auto 26px}
.bandp .t{display:block;max-width:18ch;margin:0 auto}
.bandp .tb{display:block;margin-top:14px;font:700 18px/1.4 var(--body);letter-spacing:0;text-transform:none;font-style:normal}
.bandp .big{display:block;font-size:clamp(84px,30vw,220px);line-height:.92;margin:6px 0;white-space:nowrap;font-variant-numeric:lining-nums}
.btn.inv{background:var(--onA);color:var(--a)}
.btn.inv2{color:var(--onA)}
.band .btn{margin:6px}
.est{display:grid;gap:10px;max-width:460px;margin:0 auto;text-align:left}
.est label{font:600 15.5px/1.4 var(--body)}
.est input{min-height:52px;padding:0 16px;border-radius:var(--rcs);border:2px solid var(--onA);background:var(--onA);color:var(--a);font-weight:600}
.est input::placeholder{color:${mix(P.a, P.onA, 0.4)}}
.est .btn{margin:0;width:100%}
/* ---------------- plans + classes */
.pgrid{display:grid;gap:14px}
.plan{position:relative;display:flex;flex-direction:column;gap:10px;padding:24px 20px;border-radius:var(--rc);background:var(--surf);border:1px solid var(--line)}
.plan.special{background:var(--a);color:var(--onA);border-color:var(--a)}
.plan h3{font:${dstyle} ${D.w} ${h3Size}/1.05 var(--disp);${caseCss}padding-right:84px}
.ptag{position:absolute;top:18px;right:16px;padding:6px 10px;border-radius:999px;background:var(--onA);color:var(--a);font:800 11px/1 var(--body);letter-spacing:.16em;text-transform:uppercase}
.pp{display:flex;align-items:baseline;flex-wrap:wrap;gap:4px 8px}
.pp b{font:${dstyle} ${D.w} clamp(54px,15vw,84px)/.95 var(--disp);font-variant-numeric:lining-nums}
.pp span{font-weight:700}
.pp s{font-weight:700;opacity:.8;font-size:20px}
.plan .d{opacity:.92;font-size:15.5px}
.plan.special .d{color:var(--onA)}
.plan .btn{margin-top:auto;align-self:flex-start}
.plan.special .btn.pri{background:var(--onA);color:var(--a)}
.cls{background:var(--surf)}
.clg{display:grid;gap:34px}
.sst{margin:-14px 0 18px}
.dtabs{display:grid;grid-template-columns:repeat(7,minmax(44px,1fr));gap:4px;margin-bottom:14px}
.dt{min-height:48px;border:1.5px solid var(--line);border-radius:var(--rcs);background:var(--bg);font:800 13.5px/1 var(--body);letter-spacing:.04em;cursor:pointer;color:var(--ink)}
.dt[aria-selected=true]{background:var(--a);color:var(--onA);border-color:var(--a)}
.dt.today:not([aria-selected=true]){border-color:var(--link);color:var(--link)}
.dps{display:grid;gap:12px;margin-bottom:24px}
.dp{padding:16px;border-radius:var(--rcs);background:var(--bg);border:1px solid var(--line)}
.dh{font:${dstyle} ${D.w} 24px/1 var(--disp);${caseCss}margin-bottom:8px;color:var(--link)}
.tabs-on .dh{display:none}
.dl{font-weight:800;margin-bottom:10px}
.tt{display:flex;flex-wrap:wrap;gap:6px}
.tt li{font:700 14px/1 var(--body);font-variant-numeric:tabular-nums;padding:9px 11px;border-radius:var(--rcs);background:var(--surf);border:1px solid var(--line)}
.tn{color:var(--sub)}
.clist{display:grid;gap:0;border-top:1px solid var(--line);margin-top:12px}
.clist li{padding:14px 0;border-bottom:1px solid var(--line)}
.clist h3{font:${dstyle} ${D.w} ${h3Size}/1.05 var(--disp);${caseCss}margin-bottom:4px}
.clist p{color:var(--sub);font-size:15.5px}
/* ---------------- proof */
.proof .bq{margin:6px 0 30px}
.bq p{font:${isSerif && realItal ? 'italic ' : dstyle + ' '}${D.ital ? D.ital.w : D.w} clamp(38px,10.5vw,92px)/1.02 var(--disp);letter-spacing:${dispTrack};${caseCss}max-width:15ch}
.bq figcaption,.pq figcaption{margin-top:14px;font:800 12.5px/1.3 var(--body);letter-spacing:.18em;text-transform:uppercase;color:var(--sub)}
.proof.flood{background:var(--a);color:var(--onA)}
.proof.flood .eye,.proof.flood figcaption,.proof.flood .rp,.proof.flood .tl,.proof.flood .pl svg,.proof.flood .facts svg{color:var(--onA)}
.proof.flood .rc,.proof.flood .facts li,.proof.flood .pq{border-color:${mix(P.onA, P.a, 0.55)}}
.pg{display:grid;gap:26px}
.rcs{display:grid;gap:18px}
.rc{border-top:2px solid currentColor;padding-top:14px}
.rv{font:${dstyle} ${D.w} 84px/.9 var(--disp);letter-spacing:-.02em;font-variant-numeric:lining-nums}
.rc.r2{border-top-width:1px;padding-top:12px;display:flex;flex-wrap:wrap;align-items:center;justify-content:space-between;gap:4px 14px}
.rp2{display:flex;align-items:center;gap:6px;font-size:16px}.rp2 b{font-weight:800}.rp2 svg{color:var(--link)}
.proof.flood .rp2 svg{color:var(--onA)}
.stars{width:110px;height:22px;margin-top:8px;color:currentColor}
.rp{margin-top:6px;font-size:16px;color:var(--sub)}.rp b{color:inherit}
.proof:not(.flood) .rp b{color:var(--ink)}
.pl{display:flex;gap:8px;align-items:center;font-weight:700}
.pl svg{color:var(--link)}
.qs{display:grid;gap:22px}
.pq{border-top:1px solid var(--line);padding-top:16px}
.pq p{font:${isSerif && realItal ? 'italic ' : dstyle + ' '}${D.ital ? D.ital.w : D.w} clamp(26px,6.6vw,40px)/1.12 var(--disp);${caseCss}}
.facts{display:grid;border-top:1px solid var(--line)}
.facts li{display:flex;gap:10px;align-items:flex-start;padding:13px 0;border-bottom:1px solid var(--line);font-weight:700}
.facts svg{color:var(--link);margin-top:3px}
/* ---------------- gallery */
.gal{background:var(--bg)}
.gal h2{font-size:min(calc((100vw - 40px) / ${(((AN.fonts[`${slug}|DH`]?.widths || {})['@' + c.ig] || 8) * 1.06).toFixed(3)}), ${D.cat === 'condensed' ? 92 : 72}px)!important;text-transform:none;letter-spacing:0;overflow-wrap:anywhere}
${isSerif && c.ig.includes('_') ? '.gal h2{font-family:var(--body)!important;font-weight:800!important;font-style:normal!important;letter-spacing:-.02em!important}' : ''}
.gg{display:grid;grid-template-columns:1fr 1fr;gap:10px;grid-auto-flow:dense}
.g{position:relative;margin:0;overflow:hidden;border-radius:var(--rcs);background:var(--surf2);aspect-ratio:4/5}
.g.wide,.g.pairc{grid-column:1/-1;aspect-ratio:16/9}
.g.pairc{display:grid;grid-template-columns:1fr 1fr;gap:4px;aspect-ratio:auto;background:var(--line)}
.pa{position:relative;aspect-ratio:1/1;overflow:hidden}
.pa picture,.pa img{width:100%;height:100%;object-fit:cover}
.pa span{position:absolute;left:8px;bottom:8px;padding:5px 9px;border-radius:999px;background:rgba(0,0,0,.66);color:#fff;font:800 11px/1 var(--body);letter-spacing:.14em;text-transform:uppercase}
.ph{position:absolute;inset:0;overflow:hidden}
.ph picture,.ph img{width:100%;height:100%;object-fit:cover}
.g.post{display:flex;flex-direction:column;background:var(--surf);border:1px solid var(--line)}
.pth{display:flex;align-items:center;gap:8px;padding:8px 10px;font:700 12.5px/1.2 var(--body);min-width:0}
.pth b{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.plogo{width:28px;height:28px;border-radius:50%;object-fit:cover}
.g.post .ph{position:relative;flex:1}
.smp{position:absolute;left:8px;bottom:8px;padding:5px 9px;border-radius:999px;background:rgba(0,0,0,.7);color:#fff;font:700 11.5px/1 var(--body)}
.gi{display:flex;flex-direction:column;justify-content:flex-end;gap:6px;padding:16px;background:var(--a);color:var(--onA)}
.gg:not(.odd) .gi{grid-column:1/-1;aspect-ratio:auto;flex-direction:row;align-items:center;min-height:76px;padding:12px 16px}
.gg:not(.odd) .gi span{margin-left:auto}
.gi b{font:800 15px/1.25 var(--body);overflow-wrap:anywhere}.gi i{font-style:normal}
.gg:not(.odd) .gi b{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
@media (max-width:479px){.gg:not(.odd) .gi .gt{position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0)}}
.gi span{display:flex;align-items:center;gap:6px;font-weight:700;font-size:14px}
.glogo{width:56px;height:56px;border-radius:50%;object-fit:cover;box-shadow:0 0 0 3px var(--onA)}
.gg.odd .gib{margin-bottom:auto}
.gg:not(.odd) .glogo{width:44px;height:44px}
.cred{margin-top:12px;font-size:14px;color:var(--sub)}
/* ---------------- visit / end */
.end{background:var(--surf)}
.eg{display:grid;gap:30px}
.ec h2{margin-top:0;max-width:14ch}
.ec .btn.xl{width:100%;justify-content:space-between}
.ec .eye{margin:30px 0 12px}
.lts{display:grid;grid-template-columns:repeat(auto-fill,minmax(150px,1fr));gap:10px}
.lt{display:grid;grid-template-columns:minmax(0,1fr) auto;grid-template-rows:auto auto;align-items:center;column-gap:8px;min-height:68px;padding:10px 12px 10px 14px;border-radius:var(--rcs);border:1px solid var(--line);background:var(--bg)}
.lt small{grid-column:1;font:800 11px/1.2 var(--body);letter-spacing:.16em;text-transform:uppercase;color:var(--link)}
.lt b{grid-column:1;font-weight:700;font-size:14.5px;line-height:1.25;overflow-wrap:anywhere}
.lt svg{grid-column:2;grid-row:1/3;color:var(--link)}
.vg{display:grid;gap:14px;align-content:start}
.vc{background:var(--bg);border:1px solid var(--line);border-radius:var(--rc);padding:20px;display:flex;flex-direction:column;gap:10px}
.vc h3{font:${dstyle} ${D.w} ${D.cat === 'grotesque' ? '22px' : '28px'}/1.05 var(--disp);${caseCss}}
.hl li{padding:9px 0;border-bottom:1px solid var(--line)}
.hl li:last-child{border:0}
.hl li.note{color:var(--sub);font-size:15px}
.hl li.today{font-weight:800}
.hl li.today::after{content:" (" attr(data-t) ")";color:var(--link)}
.map{aspect-ratio:2/1;border-radius:calc(var(--rcs) - 2px);overflow:hidden;background:var(--surf2);margin:-6px -6px 4px}
.map svg,.map iframe{display:block;width:100%;height:100%;border:0}
.addr{font-size:16.5px}
.lh{font-weight:700}
.lb{display:flex;flex-wrap:wrap;align-items:center;gap:10px 14px}
.lng{display:flex;flex-wrap:wrap;gap:8px}
.lng li>*{display:inline-flex;align-items:center;gap:6px;min-height:44px;padding:0 14px;border-radius:999px;border:1px solid var(--line);font-weight:700;font-size:15px}
.lng a{background:var(--a);color:var(--onA);border-color:var(--a)}
/* ---------------- DS ask (preview only) */
.ds{background:#141414;color:#f4f4f4;padding:52px 0 56px;font-family:var(--body)}
.ds .eye{color:#bdbdbd}
.ds h2{font:800 clamp(28px,7.4vw,46px)/1.08 var(--body);letter-spacing:-.02em;margin:10px 0 18px;max-width:18ch}
.ds ul{display:grid;gap:8px;margin-bottom:24px}
.ds li{display:flex;gap:10px;align-items:center;font-weight:600}
.ds li svg{color:#7ee2a8}
.ds-btn{display:inline-flex;align-items:center;gap:10px;min-height:56px;padding:0 26px;border-radius:999px;background:#fff;color:#141414;font:800 16.5px/1 var(--body)}
.ds-s{margin-top:12px;font-size:13.5px;color:#bdbdbd}
/* ---------------- footer */
.ft{background:${P.ft};color:${P.onFt};padding:44px 0 calc(var(--bar) + 26px)}
.ftg{display:grid;grid-template-columns:auto minmax(0,1fr);gap:18px;align-items:start}
.ring.small{width:104px;height:104px;color:${P.ftSub}}
.ring.small text{font-size:16px}
.rini{font:${dstyle} ${D.w} 40px/1 var(--disp);color:${P.onFt}}
.flogo{box-shadow:0 0 0 3px ${P.ft},0 0 0 4px ${mix(P.onFt, P.ft, 0.6)}}
.fn{font:${dstyle} ${D.w} 26px/1.08 var(--disp);${caseCss}}
.fs{margin-top:8px;font-size:15.5px;color:${P.ftSub}}
.fs li{padding:2px 0}
.fs a{display:inline-flex;align-items:center;min-height:44px;color:${P.onFt};text-decoration:underline;text-underline-offset:3px}
.disc{grid-column:1/-1;margin-top:6px;font-size:13.5px;line-height:1.5;color:${P.ftSub};max-width:60ch}
/* ---------------- sticky action bar (phones) */
.actbar{position:fixed;left:0;right:0;bottom:0;z-index:40;display:grid;grid-auto-flow:column;grid-auto-columns:1fr;gap:8px;padding:8px 10px calc(8px + env(safe-area-inset-bottom));background:var(--bg);box-shadow:0 -1px 0 var(--line),0 -10px 28px rgba(0,0,0,.14);transition:transform .35s cubic-bezier(.2,.7,.2,1)}
.actbar a{display:flex;flex-direction:column;align-items:center;justify-content:center;gap:3px;min-height:52px;border-radius:14px;font:800 13px/1 var(--body);color:var(--ink);background:var(--surf)}
.actbar a.pri{background:var(--a);color:var(--onA)}
.js .actbar:not(.on){transform:translateY(115%)}
/* ---------------- tablet */
@media (min-width:600px) and (max-width:899px){
:root{--g:32px}
.L-cine .hm{height:540px}
.acts{grid-template-columns:minmax(0,1.1fr) minmax(0,1fr);align-items:stretch}
.acts .btn.pri{height:100%}
.card{padding:46px 34px 40px}
.items.two{grid-template-columns:1fr 1fr;column-gap:40px;row-gap:28px}
.gg{grid-template-columns:repeat(3,1fr)}
.gg .gi,.gg:not(.odd) .gi{grid-column:auto;aspect-ratio:4/5;flex-direction:column;align-items:flex-start;justify-content:flex-end;padding:16px}
.gg:not(.odd) .gi span{margin-left:0}
.gg:not(.odd) .gi b{white-space:normal;overflow:visible}
.gg .g.wide,.gg .g.pairc{grid-column:span 2}
.gib{margin-bottom:auto}
.pgrid,.tg{grid-template-columns:1fr 1fr}
.pg{grid-template-columns:1fr 1fr;column-gap:32px}
.eg{grid-template-columns:1fr 1fr;column-gap:28px;align-items:start}
.lts{grid-template-columns:1fr}
}
/* ---------------- desktop */
@media (min-width:900px){
:root{--g:56px}
body{font-size:18px}
.sec{padding:104px 0}
.hero{grid-template-columns:minmax(0,1fr) min(46vw,720px);grid-template-rows:auto 1fr auto auto auto auto auto 1fr;grid-template-areas:"t m" "y m" "k m" "p m" "s m" "c m" "x m" "z m";min-height:max(640px,min(calc(100vh - 52px),860px));padding-bottom:0}
.hero.L-arch,.hero.L-arch.arch-stack,.hero.L-field,.hero.L-field.nophoto,.hero.L-badge,.hero.L-pair{grid-template-columns:minmax(0,1fr) min(46vw,720px);grid-template-areas:"t t" "y m" "k m" "p m" "s m" "c m" "x m" "z m"}
.hero.L-cine{grid-template-columns:minmax(0,1fr) min(46vw,720px);grid-template-areas:"t m" "y m" "k m" "p m" "s m" "c m" "x m" "z m"}
.top{padding:24px var(--g) 0}
.L-cine .top{padding-right:48px}
.L-cine .top{grid-area:t;color:var(--ink)}
.L-cine .top .igl{border-color:var(--line);background:transparent}
.L-cine .logo{box-shadow:0 0 0 1px var(--line)}
.mk,.hp-p,.hs,.acts,.hx{padding-left:var(--g);padding-right:48px}
.mk{--fs:${fsD};--fs2:${fsRestD}}
.L-cine .mk{margin:0;color:var(--mark);text-shadow:none}
.L-cine .mk .l2,.L-cine .mkr{color:var(--mark)}
.L-cine .mkr:not(.rd){color:var(--link)}
.L-cine .hm{height:auto;min-height:100%}
.L-cine .hm::after{background:${P.dark ? `linear-gradient(90deg,${P.bg} 0,${P.bg}00 26%)` : 'linear-gradient(180deg,rgba(0,0,0,.12),rgba(0,0,0,0) 30%)'}}
.credit{top:auto;bottom:22px;right:14px}
.hm{grid-area:m}
.L-field .hm,.L-arch .hm{display:grid;place-items:center;padding:40px 64px 56px 24px}
.L-pair .hm{display:grid;place-items:center;padding:24px 40px 40px 8px}
.map{aspect-ratio:16/9}
.L-field .frame{width:min(100%,430px)}
.L-field .hs,.L-arch .hs{flex-direction:row;flex-wrap:wrap;align-items:center;padding:20px 48px 0 var(--g)}
.L-field .hfs,.L-field .ptags{flex-direction:row}
.stk{width:132px;height:132px;left:-56px;bottom:30px}
.stk b{font-size:34px}.stk small{font-size:10.5px;max-width:112px}
.L-arch .mk{align-self:auto}
.archf{width:min(100%,430px)}
.L-arch .stk{right:-40px;bottom:40px}
.L-badge{text-align:left}
.L-badge .hp-p,.L-badge .hs,.L-badge .hfs{justify-items:start;justify-content:flex-start}
.L-badge .promise{margin:0}
.L-badge .top{justify-content:flex-end}
.L-badge .hm{padding:40px}
.ring.big{width:min(36vw,440px);height:min(36vw,440px)}
.ring.big text{font-size:13px}
.L-pair .ba{width:100%}
.promise{max-width:22ch}
.acts{grid-template-columns:auto minmax(0,1fr);align-items:stretch;gap:12px;padding-top:24px}
.acts .btn.pri{width:auto;min-width:260px;gap:18px}
.acts .tiles{max-width:440px}
.hx{max-width:720px}
.orn-div{margin-top:0}
.card{padding:62px 66px 52px;max-width:1080px;margin:0 auto}
.items.two{grid-template-columns:1fr 1fr;column-gap:64px;row-gap:34px}
.it .d{font-size:16.5px}
.band{padding:110px 0}
.burst{right:4vw;top:50%;width:300px;height:300px;margin-top:-150px}
.bandp .t{max-width:26ch}
.tg{grid-template-columns:repeat(auto-fit,minmax(280px,1fr))}
.pgrid{grid-template-columns:repeat(auto-fit,minmax(320px,1fr));gap:18px}
.clg{grid-template-columns:1.15fr 1fr;column-gap:64px}
.pg{grid-template-columns:repeat(auto-fit,minmax(300px,1fr));column-gap:56px}
.proof .bq p{max-width:20ch}
.rv{font-size:120px}
.gg{grid-template-columns:repeat(3,1fr);gap:16px}
.gg .g.wide,.gg .g.pairc{grid-column:span 2}
.gg:not(.odd) .gi{grid-column:auto;aspect-ratio:4/5;flex-direction:column;align-items:flex-start;justify-content:flex-end;padding:22px}
.gg:not(.odd) .gi span{margin-left:0}
.gi b{font:800 21px/1.2 var(--body);text-transform:none;overflow-wrap:anywhere}
.gg:not(.odd) .glogo,.glogo{width:84px;height:84px}
.gib{margin-bottom:auto}
.eg{grid-template-columns:1fr 1fr;column-gap:64px;align-items:start}
.lts{grid-template-columns:1fr 1fr}
.ds{padding:80px 0}
.ds ul{grid-auto-flow:column;justify-content:start;gap:28px}
.ftg{grid-template-columns:auto 1fr;align-items:center;column-gap:36px}
.disc,.dsb{grid-column:2}
.ring.small{width:150px;height:150px}
.actbar{display:none}
.ft{padding-bottom:48px}
}
@media (max-width:370px){.rib span{display:none}.tiles{grid-template-columns:1fr}}
/* motion — only when the visitor allows it */
@media (prefers-reduced-motion:no-preference){
.mk .ln>span{animation:rise 1s cubic-bezier(.2,.75,.12,1) both}
.mkr,.hp-p,.hs,.acts,.hx{animation:fade .8s .3s cubic-bezier(.2,.7,.2,1) both}
.L-cine .hm img{animation:settle 2.6s cubic-bezier(.2,.7,.15,1) both}
.frame{animation:tilt 1.1s .15s cubic-bezier(.2,.8,.2,1) both}
.stk{animation:pop .7s .7s cubic-bezier(.2,1.4,.4,1) both}
.ring.big svg,.ring.small svg{animation:spin 40s linear infinite}
.burst svg{animation:spin 60s linear infinite}
.btn:hover{transform:translateY(-2px)}
}
@keyframes rise{from{transform:translateY(105%)}}
@keyframes fade{from{opacity:0;transform:translateY(12px)}}
@keyframes settle{from{transform:scale(1.1)}}
@keyframes tilt{from{transform:rotate(-4deg) translateY(16px);opacity:0}}
@keyframes pop{from{transform:rotate(-30deg) scale(.4);opacity:0}}
@keyframes spin{to{transform:rotate(360deg)}}
@media (prefers-reduced-motion:reduce){*,*::before,*::after{animation:none!important;transition:none!important;scroll-behavior:auto!important}}
`.replace(/\n{2,}/g, '\n');

  // ---------------- scripts (hashed for the CSP)
  const headJs = `${CLIENT_JS}
var M=${JSON.stringify(cm)},LANG=${JSON.stringify(lang)},TD=${JSON.stringify(S.today)};
function paintStatus(){var r=null;try{r=hoursStatus(M,new Date(),LANG)}catch(e){}var els=document.querySelectorAll('.st');for(var i=0;i<els.length;i++){var el=els[i];if(r){el.textContent=r.t;el.setAttribute('data-s',r.s);el.hidden=false}else el.hidden=true}
if(r){var rows=document.querySelectorAll('[data-days]');for(var j=0;j<rows.length;j++){var d=(','+rows[j].getAttribute('data-days')+',').indexOf(','+r.today+',')>=0;rows[j].classList.toggle('today',d);if(d)rows[j].setAttribute('data-t',TD)}}}
document.documentElement.classList.add('js');`;
  const slotJs = 'paintStatus()';
  const tailJs = `paintStatus();setInterval(paintStatus,60000);document.addEventListener('visibilitychange',function(){if(!document.hidden)paintStatus()});
(function(){var b=document.querySelector('.actbar'),h=document.getElementById('heroCtas');if(!b)return;if(!h||!('IntersectionObserver' in window)){b.classList.add('on');return}
new IntersectionObserver(function(e){b.classList.toggle('on',!e[0].isIntersecting&&e[0].boundingClientRect.top<0)}).observe(h)})();
(function(){var mb=document.getElementById('mapLoad');if(!mb)return;mb.hidden=false;mb.addEventListener('click',function(){var box=document.getElementById('mapBox'),f=document.createElement('iframe');
f.src='https://www.google.com/maps?q='+encodeURIComponent(mb.getAttribute('data-q'))+'&output=embed';f.title=mb.getAttribute('data-t');f.loading='lazy';f.referrerPolicy='no-referrer-when-downgrade';f.allowFullscreen=true;box.textContent='';box.appendChild(f);mb.remove();f.focus()})})();
(function(){var t=document.querySelector('.dtabs');if(!t)return;var bs=t.querySelectorAll('.dt'),ps=[];for(var k=0;k<bs.length;k++)ps.push(document.getElementById(bs[k].getAttribute('aria-controls')));
t.setAttribute('role','tablist');for(k=0;k<bs.length;k++){bs[k].setAttribute('role','tab');ps[k].setAttribute('role','tabpanel');ps[k].setAttribute('aria-labelledby',bs[k].id)}
function sel(i,f){for(var k=0;k<bs.length;k++){var on=k===i;bs[k].setAttribute('aria-selected',on?'true':'false');bs[k].tabIndex=on?0:-1;ps[k].hidden=!on}if(f)bs[i].focus()}
var td=-1;try{td=nyNow(new Date()).day}catch(e){}var idx=0;for(k=0;k<bs.length;k++){if(+bs[k].getAttribute('data-d')===td)idx=k;(function(i){bs[i].addEventListener('click',function(){sel(i)})})(k)}
t.addEventListener('keydown',function(e){var i=[].indexOf.call(bs,document.activeElement);if(i<0)return;var n=e.key==='ArrowRight'?(i+1)%bs.length:e.key==='ArrowLeft'?(i+bs.length-1)%bs.length:e.key==='Home'?0:e.key==='End'?bs.length-1:-1;if(n>=0){sel(n,true);e.preventDefault()}});
t.hidden=false;document.documentElement.classList.add('tabs-on');sel(idx)})();
(function(){var rs=document.querySelectorAll('.baR');for(var i=0;i<rs.length;i++)(function(r){var b=r.parentNode;function u(){b.style.setProperty('--p',r.value+'%')}r.addEventListener('input',u);u()})(rs[i])})();
(function(){var i=document.getElementById('estIn'),a=document.getElementById('estGo');if(!i||!a)return;var base=a.getAttribute('href'),body=a.getAttribute('data-body');function u(){a.setAttribute('href',base+'?&body='+encodeURIComponent(body+i.value))}i.addEventListener('input',u);u()})();`;
  const csp = `default-src 'none'; img-src 'self' data:; font-src 'self'; style-src 'unsafe-inline'; script-src ${sha(headJs)} ${sha(slotJs)} ${sha(tailJs)}; frame-src https://www.google.com; base-uri 'none'; form-action 'none'`;

  // ---------------- head
  const what = niche === 'food' ? (es ? 'comida' : 'food') : sub === 'barber' ? (es ? 'barbería' : 'barbershop') : sub === 'nails' ? (es ? 'uñas' : 'nails') : niche === 'beauty' ? (es ? 'salón' : 'salon') : niche === 'fitness' ? (es ? 'clases' : 'classes') : (es ? 'servicios' : 'services');
  const title = (() => { const t = l.area ? `${l.name} — ${what} ${es ? 'en' : 'in'} ${String(l.area).split('·')[0].trim()}` : l.name; return t.length <= 64 ? t : l.name; })();
  const desc0 = String(l.heroSub || l.heroTitle || l.name).replace(/\s+/g, ' ').trim();
  const description = desc0.length <= 155 ? desc0 : desc0.slice(0, 152).replace(/\s+\S*$/, '') + '…';
  const ogFile = `${slug}-og.jpg`;
  const ogUrl = MODE === 'live' ? (SITE ? `${SITE.replace(/\/$/, '')}${U.img(ogFile)}` : '') : `${ORIGIN}${WEBROOT}/p/_img/${ogFile}`;
  if (MODE === 'live') U.img(ogFile);
  const heroPre = hero ? (() => { const x = layout === 'pair' ? AN.pairs[`${slug}|${hero.n}`].before : hero; const set = (x.webp || []).map(v => `${U.img(v.file)} ${v.w}w`).join(', ');
    return set ? `<link rel="preload" as="image" type="image/webp" imagesrcset="${set}" imagesizes="${layout === 'cinematic' || layout === 'pair' ? '(min-width: 900px) 46vw, 100vw' : '(min-width: 900px) 34vw, 50vw'}" fetchpriority="high">` : ''; })() : '';
  const absImg = f => (SITE ? SITE.replace(/\/$/, '') : ORIGIN) + U.img(basename(f));
  const jsonld = MODE === 'live' && SITE ? `<script type="application/ld+json">${JSON.stringify(buildJsonLd({ ...l, photos: p.ph.own ? p.ph.files.map(f => absImg(f.src)) : [], logo: p.logo ? absImg(p.logo) : undefined }, SITE)).replace(/</g, '\\u003c')}</script>` : '';
  const head = `<!doctype html>
<html lang="${lang}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<meta http-equiv="Content-Security-Policy" content="${csp}">
<title>${esc(title)}</title>
<link rel="preload" href="${U.font(FD.out)}" as="font" type="font/woff2" crossorigin>
${heroPre}
<style>${css}</style>
<script>${headJs}</script>
<meta name="description" content="${esc(description)}">
<meta name="robots" content="${MODE === 'live' ? 'index,follow,max-image-preview:large' : 'noindex,nofollow'}">
${MODE === 'live' && SITE ? `<link rel="canonical" href="${esc(SITE)}">` : ''}
<meta name="format-detection" content="telephone=no">
<meta name="theme-color" content="${layout === 'cinematic' ? P.bg : P.fl}">
<meta property="og:type" content="website">${pageUrl ? `<meta property="og:url" content="${esc(pageUrl)}">` : ''}<meta property="og:site_name" content="${esc(l.name)}">
<meta property="og:title" content="${esc(MODE === 'live' ? l.name : `${l.name} · ${es ? 'tu nueva página web' : 'your new website'}`)}">
<meta property="og:description" content="${esc(description)}"><meta property="og:locale" content="${es ? 'es_US' : 'en_US'}">
${ogUrl ? `<meta property="og:image" content="${ogUrl}"><meta property="og:image:width" content="1200"><meta property="og:image:height" content="630"><meta property="og:image:alt" content="${esc(l.name)}">` : ''}
<meta name="twitter:card" content="summary_large_image">
${p.logo ? `<link rel="icon" href="${U.img(`${slug}-icon-32.png`)}" sizes="32x32" type="image/png"><link rel="apple-touch-icon" href="${U.img(`${slug}-icon-180.png`)}">` : ''}
${jsonld}
</head>`.replace(/\n{2,}/g, '\n');
  let html = `${head}
<body>
<a class="skip" href="#main">${esc(S.skip)}</a>
${c.ribbon}
<main id="main" tabindex="-1">
${H.join('\n')}
</main>
${c.footer}
${c.actbar}
<script>${tailJs}</script>
</body>
</html>
`;
  if (MODE === 'preview') html = html.replace(/\{CLAIM_URL\}/g, esc(CLAIM.replace(/\{slug\}/g, encodeURIComponent(slug))));
  const issues = gate(l, html, P, D, c);
  const dir = join(OUT, slug); mkdirSync(dir, { recursive: true }); writeFileSync(join(dir, 'index.html'), html);
  if (COPY_ASSETS) { const ad = join(dir, 'assets'); mkdirSync(join(ad, 'img'), { recursive: true }); mkdirSync(join(ad, 'fonts'), { recursive: true });
    for (const f of U.used) if (existsSync(f)) copyFileSync(f, join(ad, f.startsWith(FONT_DIR) ? 'fonts' : 'img', basename(f))); }
  const gz = gzipSync(html).length;
  const summary = { slug, layout, kb: +(html.length / 1024).toFixed(1), gzKB: +(gz / 1024).toFixed(1), fonts: `${D.fam} + ${B.fam}`, hero: hero ? hero.n : 0, mark: lines, issues };
  if (DEBUG) summary.contrast = contrastReport(P, D);
  return { summary, og: { slug, name: l.name, lang, D, B, P, FD, U, lines, emW, rest: restTxt, layout, hero: hero ? (layout === 'pair' ? join(IMG_DIR, AN.pairs[`${slug}|${hero.n}`].after.base + '.jpg') : join(IMG_DIR, hero.base + '.jpg')) : null,
    before: hero && layout === 'pair' ? join(IMG_DIR, AN.pairs[`${slug}|${hero.n}`].before.base + '.jpg') : null, S,
    focus: hero && layout !== 'pair' ? ((art => (art.focus && art.focus[hero.n]) || `${Math.round(hero.focus[0] * 100)}% ${Math.round(hero.focus[1] * 100)}%`)(p.art)) : '50% 50%', logo: p.logo ? join(IMG_DIR, `${slug}-logo-320.webp`) : null } };
}

// ---------------------------------------------------------------- build gate (fails the run; the page is still written for inspection)
const CLAIMS = [[/\bfree estimates?\b|cotizaci[oó]n(es)? gratis/i], [/\bbest\b|\bmejor(es)?\b/i], [/\blicensed\b|con licencia/i], [/we come to you|vamos a donde/i],
  [/\bowner\b|\bdue[ñn][oa]\b/i], [/guarantee|garant[ií]/i], [/#1|number one|n[uú]mero uno/i], [/\baward\b|\bpremio\b/i], [/as listed on|publicados en/i], [/\binsured\b|asegurad|seguro\b/i]];
function gate(l, html, P, D, c) {
  const out = [];
  if (/fonts\.googleapis|fonts\.gstatic/.test(html)) out.push('google fonts link');
  const files = new Set([...html.matchAll(/url\(([^)]+\.woff2)\)/g)].map(m => m[1])); if (files.size > 3) out.push(`${files.size} font files`);
  for (const m of html.matchAll(/<img\b[^>]*>/g)) if (!/\swidth=/.test(m[0]) || !/\sheight=/.test(m[0]) || !/\salt=/.test(m[0])) out.push('img attrs: ' + m[0].slice(0, 70));
  if ((html.match(/<h1\b/g) || []).length !== 1) out.push('h1 count');
  for (const m of html.matchAll(/\b(?:src|srcset|imagesrcset)="(https?:[^"]+)"/g)) out.push('external src ' + m[1].slice(0, 60));
  for (const m of html.matchAll(/url\((https?:[^)]+)\)/g)) out.push('external url() ' + m[1].slice(0, 60));
  if (MODE === 'preview') { if (!html.includes('DS Marketing') || !html.includes('noindex') || !html.includes(esc(CLAIM.replace(/\{slug\}/g, encodeURIComponent(l.slug)))) || html.includes('{CLAIM_URL}')) out.push('preview markers');
    if (/application\/ld\+json/.test(html)) out.push('JSON-LD in preview'); }
  if (MODE === 'live' && /\{CLAIM_URL\}|DS Marketing|data-ds/.test(html)) out.push('live page carries preview markers');
  for (const x of contrastReport(P, D)) if (x.v < x.min) out.push(`contrast ${x.k} ${x.v} < ${x.min}`);
  // facts: every number visible on the page (outside DS-owned blocks) must be in the lead's own text
  const facts = JSON.stringify(l, (k, v) => (k.startsWith('_') || /^(url|ctaUrl|photos|logo|brand|slug|theme|art)$/.test(k) ? undefined : v));
  const factsF = fold(facts);
  const vis = html.replace(/<head>[\s\S]*?<\/head>/, ' ').replace(/<script[\s\S]*?<\/script>/g, ' ').replace(/<style[\s\S]*?<\/style>/g, ' ').replace(/<svg[\s\S]*?<\/svg>/g, ' ')
    .replace(/<(aside|section|p)\b[^>]*data-ds[^>]*>[\s\S]*?<\/\1>/g, ' ').replace(/<[^>]+>/g, ' ').replace(/&[a-z#0-9]+;/g, ' ');
  const nums = [...new Set(vis.match(/\d[\d.,:]*\d|\d/g) || [])].map(n => n.replace(/[.,:]$/, ''));
  const fd = facts.replace(/\D+/g, ' ');
  const tmOk = n => /^\d{1,2}(:\d\d)?$/.test(n) && (c.model.st || []).length > 0;  // class times re-printed from the hours model
  const miss = nums.filter(n => !facts.includes(n) && !fd.includes(' ' + n.replace(/\D/g, '') + ' ') && !fd.includes(n.replace(/\D/g, '')) && !tmOk(n));
  if (miss.length) out.push('numbers not in lead data: ' + miss.join(', '));
  const visF = fold(vis);
  for (const [re] of CLAIMS) { const m = visF.match(re); if (m && !re.test(factsF)) out.push(`claim "${m[0]}" not in lead data`); }
  if (gzipSync(html).length > 25 * 1024) out.push('page over 25 KB gzip');
  return out;
}

// ================================================================= OG card (1200×630) rendered with the page's own fonts
async function renderOg(list) {
  if (!list.length) return;
  let chromium; try { ({ chromium } = await import('playwright')); } catch { console.error('playwright not available: OG cards skipped'); return; }
  const b = await chromium.launch({ executablePath: existsSync('/opt/pw-browsers/chromium') ? '/opt/pw-browsers/chromium' : undefined, args: ['--no-sandbox', '--no-proxy-server'] });
  const ctx = await b.newContext({ viewport: { width: 1200, height: 630 }, deviceScaleFactor: 1 });
  await ctx.route('**/*', r => { const u = r.request().url(); if (u.startsWith(`${ORIGIN}${WEBROOT}/`)) { const f = PUB + decodeURIComponent(new URL(u).pathname).slice(WEBROOT.length); return existsSync(f) ? r.fulfill({ body: readFileSync(f) }) : r.fulfill({ status: 404, body: '' }); } return r.fulfill({ status: 404, body: '' }); });
  const page = await ctx.newPage();
  for (const o of list) {
    const P = o.P, w = abs => `${ORIGIN}${webOf(abs)}`;
    const fs = Math.round(Math.min(o.D.cat === 'serif' ? 168 : 196, (o.hero || o.logo ? 600 : 1060) / (o.emW * 1.05)));
    const dark = o.layout === 'cinematic' ? P.dark : P.flDark;
    const bg = o.layout === 'cinematic' ? P.bg : P.fl, ink = o.layout === 'cinematic' ? P.ink : P.onFl, mk = o.layout === 'cinematic' ? P.mark : P.mk, sub = o.layout === 'cinematic' ? P.sub : P.flSub;
    const btn = o.layout === 'cinematic' ? [P.a, P.onA] : [P.flBtn, P.onFlBtn];
    const right = o.before ? `<div class="p ba"><div style="background-image:url(${w(o.before)})"><b>${esc(o.S.before)}</b></div><div style="background-image:url(${w(o.hero)})"><b>${esc(o.S.after)}</b></div></div>`
      : o.hero ? `<div class="p" style="background-image:url(${w(o.hero)});background-position:${o.focus}"></div>` : o.logo ? `<div class="p lg"><img src="${w(o.logo)}"></div>` : '';
    const html = `<!doctype html><html><head><style>
@font-face{font-family:D;src:url(${ORIGIN}${webOf(o.FD.out)});font-weight:${o.D.w};font-style:${o.D.style || 'normal'}}
body{margin:0;width:1200px;height:630px;display:grid;grid-template-columns:${right ? '1fr 500px' : '1fr'};background:${bg};color:${ink};font-family:Arial,sans-serif;overflow:hidden}
.l{padding:54px 58px;display:flex;flex-direction:column;justify-content:space-between}
.k{font:700 21px Arial;letter-spacing:.2em;text-transform:uppercase;color:${sub}}
.m{font:${o.D.style || 'normal'} ${o.D.w} ${fs}px/${o.D.lh} D;${o.D.upper ? 'text-transform:uppercase;' : ''}color:${mk};letter-spacing:${o.D.ls}em}
.r{font:700 22px Arial;letter-spacing:.22em;text-transform:uppercase;color:${sub};margin-top:16px}
.pill{display:inline-flex;align-items:center;gap:14px;align-self:flex-start;background:${btn[0]};color:${btn[1]};font:700 26px Arial;padding:16px 28px;border-radius:999px}
.p{background-size:cover}.p.ba{display:grid;grid-template-rows:1fr 1fr;gap:6px;background:${bg}}.p.ba>div{position:relative;background-size:cover;background-position:center}.p.ba b{position:absolute;left:14px;top:14px;padding:7px 12px;border-radius:999px;background:rgba(0,0,0,.66);color:#fff;font:700 16px Arial;letter-spacing:.14em;text-transform:uppercase}
.m span+br+span,.m .l2{color:${o.layout === 'cinematic' ? mk : P.mk2}}.p.lg{display:grid;place-items:center;background:${mix(bg, ink, 0.08)}}.p.lg img{width:340px;height:340px;border-radius:50%}
.h{display:flex;align-items:center;gap:18px}.h img{width:76px;height:76px;border-radius:50%;object-fit:cover}</style></head><body><div class="l"><div class="h">${o.logo && o.hero ? `<img src="${w(o.logo)}">` : ''}<span class="k">${o.lang === 'es' ? 'Tu nueva página web' : 'Your new website'}</span></div>
<div><div class="m">${o.lines.map((t, i) => `<span${i ? ' class="l2"' : ''}>${esc(t)}</span>`).join('<br>')}</div>${o.rest ? `<div class="r">${esc(o.rest)}</div>` : ''}</div><span class="pill">${MODE === 'preview' ? (o.lang === 'es' ? 'Vista previa gratis' : 'Free preview') : esc(o.name)} →</span></div>${right}</body></html>`;
    await page.setContent(html, { waitUntil: 'networkidle' });
    await page.evaluate(() => document.fonts.ready);
    const out = join(IMG_DIR, `${o.slug}-og.jpg`);
    await page.screenshot({ path: out, type: 'jpeg', quality: 84 });
    if (COPY_ASSETS) copyFileSync(out, join(OUT, o.slug, 'assets', 'img', `${o.slug}-og.jpg`));
  }
  await b.close();
}

// ================================================================= main
const results = plans.map(build);
if (!NO_OG) await renderOg(results.map(r => r.og));
let bad = 0;
for (const r of results) {
  const s = r.summary; bad += s.issues.length;
  console.log(`${s.slug.padEnd(26)} ${s.layout.padEnd(9)} ${String(s.gzKB).padStart(5)} KB gz · ${s.fonts} · hero ${s.hero} · ${s.mark.join(' / ')}${s.issues.length ? '\n   ✗ ' + s.issues.join('\n   ✗ ') : '  ✓'}`);
  if (DEBUG) console.log('   ' + JSON.stringify(s.contrast));
}
process.exitCode = bad ? 1 : 0;
