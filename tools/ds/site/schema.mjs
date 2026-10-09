// BUILD-TIME JSON-LD (live mode only — a preview on our domain must not claim to be the business).
// One @graph: WebSite + the business node(s). Only lead facts. NEVER aggregateRating / review from proof[] —
// Google treats ratings copied from Uber Eats / Mindbody / Yelp on the business's own site as self-serving / third-party
// and can issue a structured-data manual action; the proof stays as visible text with the platform named.
import { parseHours, openingHoursSpec } from './hours.mjs';

// niche → schema.org type. Verified against schema.org 29.x: BarberShop and FoodTruck do NOT exist (→ HairSalon / Restaurant).
export function schemaType(l) {
  const s = `${l.name} ${l.heroSub || ''} ${(l.services || []).map(x => x.t).join(' ')} ${l.schemaType || ''}`.toLowerCase();
  if (l.schemaType) return l.schemaType;                                   // explicit override from lead prep wins
  if (l.niche === 'food') return /bakery|panader|cake|pastel|donut/.test(s) ? 'Bakery' : /coffee|caf[eé]|espresso/.test(s) ? 'CafeOrCoffeeShop'
    : /ice cream|helad|gelato/.test(s) ? 'IceCreamShop' : /\bbar\b|pub|cocktail/.test(s) ? 'BarOrPub' : 'Restaurant';
  if (l.niche === 'beauty') {                                             // score the name (×3) and each service title; most signals wins
    const HAIR = /barber|stylist|estilista|hair|cabello|pelo|peluquer|balayage|color|mechas|corte|haircut|cut\b|fade|extension|alisad|keratin|blowout|braid|trenza/,
      NAIL = /nail|uñas|manicur|pedicur|acr[ií]lic|gel\b|dip\b/, LASH = /lash|pestañ|brow|ceja|makeup|maquillaje|facial|wax|depila/;
    const sc = re => (re.test(String(l.name).toLowerCase()) ? 3 : 0) + (l.services || []).filter(x => re.test(String(x.t).toLowerCase())).length;
    const r = [['HairSalon', sc(HAIR)], ['NailSalon', sc(NAIL)], ['BeautySalon', sc(LASH)]].sort((x, y) => y[1] - x[1]);
    if (r[0][1] > 0) return r[0][0];
  }
  if (l.niche === 'beauty') return /nail|uñas|manicure|pedicure/.test(s) ? 'NailSalon' : /barber|barbería|fade|hair|cabello|stylist|estilista|salon de pelo/.test(s) ? 'HairSalon'
    : /spa\b|massage|masaje/.test(s) ? 'DaySpa' : /tattoo|tatuaje/.test(s) ? 'TattooParlor' : 'BeautySalon';
  if (l.niche === 'fitness') return /spa|club/.test(s) && !/boxing|hiit|bootcamp|crossfit/.test(s) ? 'HealthClub' : 'ExerciseGym';
  if (l.niche === 'home') return /paint|pintur/.test(s) ? 'HousePainter' : /plumb|plomer/.test(s) ? 'Plumber' : /electric/.test(s) ? 'Electrician'
    : /roof|techo/.test(s) ? 'RoofingContractor' : /hvac|\ba\/?c\b|air condition/.test(s) ? 'HVACBusiness' : /locksmith|cerrajer/.test(s) ? 'Locksmith'
    : /moving|mudanza/.test(s) ? 'MovingCompany' : /contractor|remodel/.test(s) ? 'GeneralContractor' : 'HomeAndConstructionBusiness';
  return 'LocalBusiness';
}

const e164 = p => { const d = String(p || '').replace(/\D/g, '').replace(/^1(?=\d{10}$)/, ''); return d.length === 10 ? '+1' + d : undefined; };
// "261 NW 36th St, Miami, FL 33127" / "9160 NW 122nd St, Suite 6, Hialeah Gardens, FL 33018" → PostalAddress; anything else → null
export function postal(a) {
  const m = String(a || '').trim().match(/^(\d+[^,]*(?:,\s*(?:suite|ste|unit|#)[^,]*)?),\s*([^,]+?),\s*([A-Z]{2})\s+(\d{5})(?:-\d{4})?$/i);
  return m ? { '@type': 'PostalAddress', streetAddress: m[1].trim(), addressLocality: m[2].trim(), addressRegion: m[3].toUpperCase(), postalCode: m[4], addressCountry: 'US' } : null;
}
// a real street line: 2–6 digit number + street name + suffix ("261 NW 36th St", "2885 SW 3rd Ave"); "7 lounges: East Doral" is NOT one
const isStreet = a => /^\d{2,6}\s+(?:[NSEW]{1,2}\s+)?[\w.' -]*?\b(?:St|Street|Ave|Avenue|Blvd|Boulevard|Rd|Road|Dr|Drive|Ct|Court|Ter|Terrace|Way|Hwy|Highway|Pl|Place|Ln|Lane|Pkwy|Parkway|Cswy|Causeway|Cir|Circle|Trl|Trail|Plaza|Path)\b/i.test(String(a || '').trim());
const PROFILE = /instagram\.com|facebook\.com|yelp\.com|tiktok\.com|g\.page|google\.com\/maps|maps\.app\.goo\.gl|x\.com|twitter\.com|linkedin\.com/;
const price = p => { const m = String(p || '').match(/^\$(\d+(?:\.\d{2})?)(?:\s*\/\s*(mo|month|mes))?$/i); return m ? { price: m[1], unit: m[2] ? 'MON' : null } : null; };

export function buildJsonLd(l, site, { abs = u => u } = {}) {
  const url = site.replace(/\/?$/, '/'); const id = url + '#business';
  const model = parseHours(l.hours || [], { title: l.hoursTitle || '' });
  const ig = String(l.instagram || '').replace(/^@/, '');
  const sameAs = [ig && `https://www.instagram.com/${ig}/`, ...(l.links || []).map(x => x.url).filter(u => PROFILE.test(u))].filter(Boolean);
  const type = schemaType(l);
  const base = {
    '@type': type, '@id': id, name: l.name, url, description: l.heroSub,
    image: (l.photos || []).slice(0, 3).map(p => abs(p)), ...(l.logo ? { logo: abs(l.logo) } : {}),
    ...(e164(l.phone) ? { telephone: e164(l.phone) } : {}), ...(sameAs.length ? { sameAs } : {}),
  };
  if (l.cuisine) base.servesCuisine = l.cuisine;                           // only when lead prep wrote it (never inferred)
  if (l.niche === 'food') base.hasMenu = url + '#menu';
  else if ((l.services || []).length) base.hasOfferCatalog = { '@type': 'OfferCatalog', name: l.lang === 'es' ? 'Servicios' : 'Services',
    itemListElement: l.services.slice(0, 12).map(s => { const p = price(s.price); return { '@type': 'Offer', itemOffered: { '@type': 'Service', name: s.t, description: s.d },
      ...(p ? { priceSpecification: { '@type': 'UnitPriceSpecification', price: p.price, priceCurrency: 'USD', ...(p.unit ? { unitCode: p.unit } : {}) } } : {}) }; }) };
  if (l.ctaUrl) base.potentialAction = { '@type': l.niche === 'food' ? 'OrderAction' : 'ReserveAction', target: { '@type': 'EntryPoint', urlTemplate: l.ctaUrl } };

  const parts = String(l.address || '').split(/\s+·\s+/).map(s => s.trim()).filter(Boolean);
  const streets = parts.filter(isStreet);
  const graph = [{ '@type': 'WebSite', '@id': url + '#website', url, name: l.name, inLanguage: l.lang === 'es' ? 'es-US' : 'en-US', publisher: { '@id': id } }];
  if (streets.length <= 1) {                                              // one place (or a service-area business)
    const pa = postal(streets[0]);
    if (pa) base.address = pa; else if (streets[0]) base.address = streets[0];
    else base.areaServed = l.area || 'Miami';                              // mobile / service-area: no street address, never invented
    const ohs = openingHoursSpec(model); if (ohs.length) base.openingHoursSpecification = ohs;
    graph.push(base);
  } else {                                                                 // several locations: brand node + one node per street address
    const brand = { ...base, '@type': 'Organization' }; delete brand.potentialAction; delete brand.hasMenu;
    graph.push(brand);
    streets.forEach((s, i) => {
      const loc = { '@type': type, '@id': url + '#location-' + (i + 1), name: `${l.name} — ${s.replace(/,.*$/, '')}`, parentOrganization: { '@id': id },
        address: postal(s) || { '@type': 'PostalAddress', streetAddress: s.split(',')[0].trim(), addressLocality: (s.split(',')[1] || l.area || 'Miami').trim(), addressRegion: 'FL', addressCountry: 'US' },
        ...(base.telephone ? { telephone: base.telephone } : {}), ...(l.niche === 'food' ? { hasMenu: url + '#menu' } : {}) };
      const wi = model.w.findIndex(w => s.toLowerCase().startsWith(w.toLowerCase()));
      const ohs = wi >= 0 ? openingHoursSpec(model, wi) : []; if (ohs.length) loc.openingHoursSpecification = ohs;
      graph.push(loc);
    });
  }
  return { '@context': 'https://schema.org', '@graph': graph };
}

export { isStreet };
