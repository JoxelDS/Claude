export const meta = {
  name: 'ds-daily-leads',
  description: 'DS Marketing daily lead engine: harvest Miami businesses tagged by local aggregator / event / collab accounts on Instagram, verify each on Instagram, keep the ones with no real website, find public contacts, rank, and write preview copy + DM / email drafts',
  whenToUse: 'Every day (DS Autopilot routine) or when Joxel asks for more website leads. Needs Make scenarios 6559189 (mention harvest) and 6552164 / 6558876 / 6558880 / 6558883 (profile lookups).',
  phases: [{ title: 'Seeds' }, { title: 'Harvest' }, { title: 'Verify' }, { title: 'Contact' }, { title: 'Domains' }, { title: 'Write' }],
}
// args: { date, known: [handles already in the pipeline], seeds: [{handle, niche, uses}], maxSeeds (25), maxLookups (240), dmPerDay (25),
//         findSeeds: true|false (spend ≤ 8 WebSearch on new aggregator accounts), out: "<dir to save raw harvest>" }
// WebSearch is capped at 200 calls per turn for ALL agents together — this engine is built on Instagram data (Make), not search.
const A = args || {}
const KNOWN = new Set((A.known || []).map(h => String(h).replace(/^@/, '').toLowerCase()))
const MAX_SEEDS = A.maxSeeds || 25, MAX_LOOKUPS = A.maxLookups || 240, DM_PER_DAY = A.dmPerDay || 25
const LOOKUPS = [6552164, 6558876, 6558880, 6558883]
const HANDLE = /^[a-z0-9._]{3,30}$/

phase('Seeds')
let seeds = (A.seeds || []).slice()
if (A.findSeeds || seeds.length < 10) {
  const SEEDS = { type: 'object', properties: { seeds: { type: 'array', items: { type: 'object', properties: { handle: { type: 'string' }, niche: { type: 'string' }, why: { type: 'string' } }, required: ['handle', 'niche', 'why'] } } }, required: ['seeds'] }
  const found = await agent(`Find Instagram accounts in Miami-Dade / Broward that regularly TAG many small local businesses in their captions: food-truck networks and rallies, food bloggers/critics, markets and pop-up organizers, breweries/venues that host trucks, event planners, barber/beauty/nail expos and academies, salon suites, gyms' collab pages, home-improvement / real-estate creators who tag contractors. Use at most 8 WebSearch calls in total (a hard shared budget) and WebFetch freely. Exact usernames only (no @). Already known seeds: ${seeds.map(s => s.handle).join(', ') || 'none'}. Return 15–30 NEW ones with niche food|beauty|fitness|home|mixed.`, { label: 'seeds:find', phase: 'Seeds', schema: SEEDS })
  for (const s of (found && found.seeds) || []) { const h = s.handle.replace(/^@/, '').toLowerCase(); if (HANDLE.test(h) && !seeds.some(x => x.handle === h)) seeds.push({ handle: h, niche: s.niche, uses: 0, why: s.why }) }
}
seeds.sort((a, b) => (a.uses || 0) - (b.uses || 0))
const today = seeds.slice(0, MAX_SEEDS)
log(`${seeds.length} seeds known, harvesting ${today.length}`)

phase('Harvest')
const CAND = { type: 'object', properties: { seedsOk: { type: 'array', items: { type: 'string' } }, candidates: { type: 'array', items: { type: 'object', properties: { handle: { type: 'string' }, niche: { type: 'string' }, seed: { type: 'string' }, context: { type: 'string' } }, required: ['handle', 'niche', 'seed', 'context'] } } }, required: ['seedsOk', 'candidates'] }
const chunks = [today.filter((_, i) => i % 2 === 0), today.filter((_, i) => i % 2 === 1)]
// the harvest scenario cannot run twice at once → one agent at a time per scenario; two agents take turns via sequential calls inside each
const harvested = []
for (const [i, ch] of chunks.entries()) {
  if (!ch.length) continue
  const r = await agent(`For each Instagram account below, call Make scenario 6559189 "DS - IG mention harvest" ONE AT A TIME: mcp__Make__scenarios_run {scenarioId: 6559189, responsive: true, data: {username: <handle>, limit: "50"}} (load the tool with ToolSearch "select:mcp__Make__scenarios_run"). outputs.posts = JSON strings {caption, permalink, timestamp, like_count, media_type}; an empty result means the account is personal/private/missing (leave it out of seedsOk). ${A.out ? `Append every raw result to ${A.out}/harvest-${A.date}.jsonl ({seed, posts}) with Bash.` : ''}
Business Discovery strips the "@" from captions, so tagged accounts appear as bare words, e.g. "food from street_twist toastedfoodtruck and jjsgelatoandcoffee", "LINEUP: 🚐 greendragonsushi 🚐 tbkgrill". From the captions, list every token that is almost certainly an Instagram username of a LOCAL SMALL BUSINESS (food truck, restaurant, bakery, café, barber, salon, nail/lash studio, trainer/gym, cleaner, contractor, detailer…): lowercase, no spaces, often joined words / underscores / dots / digits, standing where a tag would be (lineups, "with …", "by …", "from …", "featuring …", "at …"). Skip ordinary words, hashtags (#…), cities, the seed itself, big brands/chains, and personal names. Give each the niche, the seed it came from and a ≤ 12-word context quote.
Accounts: ${ch.map(s => s.handle).join(', ')}`, { label: `harvest:${i + 1}`, phase: 'Harvest', schema: CAND })
  if (r) harvested.push(r)
}
const seedsOk = new Set(harvested.flatMap(h => h.seedsOk.map(s => s.toLowerCase())))
const seen = new Set(KNOWN), cands = []
for (const c of harvested.flatMap(h => h.candidates)) {
  const h = String(c.handle || '').replace(/^@/, '').toLowerCase()
  if (!HANDLE.test(h) || seen.has(h) || seeds.some(s => s.handle === h)) continue
  seen.add(h); cands.push({ ...c, handle: h })
}
const toCheck = cands.slice(0, MAX_LOOKUPS)
log(`${cands.length} new candidate handles from ${seedsOk.size} seeds; checking ${toCheck.length} (cap ${MAX_LOOKUPS})${cands.length > toCheck.length ? `, ${cands.length - toCheck.length} left for tomorrow` : ''}`)

phase('Verify')
const VER = { type: 'object', properties: { results: { type: 'array', items: { type: 'object', properties: {
  handle: { type: 'string' }, found: { type: 'boolean' }, name: { type: 'string' }, followers: { type: 'number' }, media: { type: 'number' },
  website: { type: 'string' }, bio: { type: 'string' }, local: { type: 'string', enum: ['yes', 'likely', 'no', 'unknown'] },
  isBusiness: { type: 'boolean' }, aggregator: { type: 'boolean' },
  verdict: { type: 'string', enum: ['qualified', 'has_website', 'not_found', 'too_small', 'not_local', 'not_small_business'] } },
  required: ['handle', 'found', 'verdict'] } } }, required: ['results'] }
const vchunks = LOOKUPS.map((_, i) => toCheck.filter((_, j) => j % LOOKUPS.length === i))
const verified = await parallel(vchunks.map((ch, i) => () => ch.length ? agent(`Check Instagram accounts ONE AT A TIME with Make scenario ${LOOKUPS[i]} (load mcp__Make__scenarios_run with ToolSearch). Call {scenarioId: ${LOOKUPS[i]}, responsive: true, data: {username: <handle>}}; never two calls at once on this scenario; retry an error once. outputs.tool_output = the public profile (followers_count, media_count, biography, website, name) or nothing (personal / private / missing → found false, verdict not_found).
Verdicts, in order: not_small_business (a chain, franchise, big brand, media outlet, event/aggregator page, or a person who is not a business — set aggregator=true if it is an account that tags many businesses); not_local (bio/area clearly outside Miami-Dade / Broward / Palm Beach); has_website (website is a real domain of their own — NOT linktr.ee, beacons.ai, taplink, linkin.bio, flow.page / flowcode, wa.me, instagram.com, facebook.com, booksy, vagaro, fresha, square.site, squareup appointments, glossgenius, calendly, linkpop, stan.store, msha.ke, lnk.bio, toasttab ordering, ubereats/doordash/grubhub, clover); too_small (followers < 150 or media < 12); else qualified. local: yes when the bio names a South Florida city/area or a 305/786/954/561 number, likely when only the seed is local, else unknown.
Usernames (${ch.length}): ${ch.map(c => `${c.handle} (seed ${c.seed})`).join(', ')}
Return one result per username with bio and website exactly as returned.`, { label: `verify:${i + 1}`, phase: 'Verify', schema: VER }) : Promise.resolve({ results: [] })))
const vmap = new Map(verified.filter(Boolean).flatMap(v => v.results || []).map(r => [String(r.handle).replace(/^@/, '').toLowerCase(), r]))
const qualified = toCheck.map(c => ({ ...c, ig: vmap.get(c.handle) })).filter(c => c.ig && c.ig.verdict === 'qualified' && c.ig.local !== 'no')
const newSeeds = [...vmap.values()].filter(r => r.aggregator && r.found).map(r => ({ handle: String(r.handle).toLowerCase(), niche: 'mixed', uses: 0, why: 'tagged and tags others' }))
const counts = {}; for (const r of vmap.values()) counts[r.verdict] = (counts[r.verdict] || 0) + 1
log(`checked ${vmap.size}: ${Object.entries(counts).map(([k, v]) => `${v} ${k}`).join(' · ')}; ${newSeeds.length} new seed accounts`)

phase('Contact')
const CON = { type: 'object', properties: { contacts: { type: 'array', items: { type: 'object', properties: { handle: { type: 'string' }, email: { type: 'string' }, phone: { type: 'string' }, area: { type: 'string' }, source: { type: 'string' } }, required: ['handle'] } } }, required: ['contacts'] }
const batches = []; for (let i = 0; i < qualified.length; i += 20) batches.push(qualified.slice(i, i + 20))
const contacts = await parallel(batches.map((b, i) => () => agent(`For each business, find a PUBLIC business email and phone, and the area (neighbourhood / city). Look ONLY at: the Instagram bio text below, their link-in-bio page (WebFetch it: linktree / beacons / booking pages usually list email and phone), and their Booksy / Vagaro / Fresha / Square / Google Business page if the link-in-bio points there. Do NOT use WebSearch (shared budget is spent elsewhere). Report an email only if you saw it on a page, with that page as source; never guess one.
${b.map(q => `- @${q.handle} · ${q.ig.name || ''} · bio: ${(q.ig.bio || '').replace(/\s+/g, ' ').slice(0, 220)} · link: ${q.ig.website || 'none'}`).join('\n')}`, { label: `contact:${i + 1}`, phase: 'Contact', schema: CON })))
const cmap = new Map(contacts.filter(Boolean).flatMap(c => c.contacts || []).map(c => [String(c.handle).replace(/^@/, '').toLowerCase(), c]))
for (const q of qualified) { const c = cmap.get(q.handle) || {}; q.email = c.email || ''; q.phone = c.phone || ''; q.area = c.area || ''; q.emailSource = c.source || '' }

// Domains: the Instagram 'website' field misses real sites (2026-10-08: Cakes By Cary, Hollywood Baked Goods and Los Perritos del Barrio
// all had their own site while their bio linked elsewhere). The build container cannot reach the web, so the check runs in the Higgsfield sandbox.
phase('Domains')
const DOM = { type: 'object', properties: { sites: { type: 'array', items: { type: 'object', properties: { handle: { type: 'string' }, hasSite: { type: 'boolean' }, url: { type: 'string' }, note: { type: 'string' } }, required: ['handle', 'hasSite', 'url', 'note'] } } }, required: ['sites'] }
const dbatches = []; for (let i = 0; i < qualified.length; i += 25) dbatches.push(qualified.slice(i, i + 25))
const domains = await parallel(dbatches.map((b, i) => () => agent(`Check whether each business below ALREADY HAS ITS OWN WEBSITE. Use the Higgsfield sandbox (load mcp__higgfield__sandbox_exec with ToolSearch "select:mcp__higgfield__sandbox_exec"; it has internet; keep each command under 15,000 characters; timeout_seconds 120). For each business try, with curl -sL --max-time 8: (1) the link in their bio when it is a real domain, (2) <name>.com and <handle>.com with every non-letter/digit removed, plus the same without words like foodtruck / truck / miami / fl / llc / official. Print the HTTP code, the final URL, the <title> and the first ~300 characters of visible text.
hasSite = true only when a page is clearly THIS business's own site (their name, food/services, Miami-area city or phone, or their Instagram linked). NOT a site: parked / for sale / "launching soon" / empty / registrar pages, an unrelated business with a similar name (other state, other area code), aggregators and ordering pages (Clover, Toast, Square ordering, DoorDash, Uber Eats, Linktree…). Put what you saw in note (e.g. "artcakemiami.com = Launching Soon placeholder" — useful as a DM detail).
${b.map(q => `- @${q.handle} · ${q.ig.name || ''} · link: ${q.ig.website || 'none'} · bio: ${(q.ig.bio || '').replace(/\s+/g, ' ').slice(0, 160)}`).join('\n')}`, { label: `domains:${i + 1}`, phase: 'Domains', schema: DOM })))
const dmap = new Map(domains.filter(Boolean).flatMap(d => d.sites || []).map(d => [String(d.handle).replace(/^@/, '').toLowerCase(), d]))
const hadSite = qualified.filter(q => (dmap.get(q.handle) || {}).hasSite)
for (const q of qualified) q.domainNote = (dmap.get(q.handle) || {}).note || ''
if (hadSite.length) { log(`${hadSite.length} already have a site: ${hadSite.map(q => q.handle + ' ' + dmap.get(q.handle).url).join(' · ')}`); for (const q of hadSite) { counts.qualified = (counts.qualified || 0) - 1; counts.has_website = (counts.has_website || 0) + 1 } }
qualified.splice(0, qualified.length, ...qualified.filter(q => !hadSite.includes(q)))

// rank: real audience + activity + a phone/email to close with + trades that buy fast
const fast = { food: 1.12, beauty: 1.1, home: 1.1, fitness: 1 }
for (const q of qualified) q.score = Math.log10(Math.max(150, q.ig.followers || 150)) * ((q.ig.media || 0) >= 40 ? 1.1 : 1) * (fast[q.niche] || 1) * (q.phone || q.email ? 1.08 : 1) * (q.ig.local === 'yes' ? 1.1 : 1)
qualified.sort((a, b) => b.score - a.score)
const noDM = q => /no\s*(dm|dms|mensajes)\b|❌\s*dm|dm\s*❌/i.test(q.ig.bio || '')   // e.g. "No DM❌" — respect it: email or nothing
const dm = qualified.filter(q => !noDM(q)).slice(0, DM_PER_DAY)
const mail = qualified.filter(q => !dm.includes(q)).filter(q => /@/.test(q.email))
const hold = qualified.filter(q => !dm.includes(q)).filter(q => !/@/.test(q.email))

phase('Write')
const slugOf = h => h.replace(/[._]+/g, '-').replace(/^-|-$/g, '')
const WR = { type: 'object', properties: { out: { type: 'array', items: { type: 'object', properties: {
  handle: { type: 'string' }, lang: { type: 'string', enum: ['en', 'es'] }, exactName: { type: 'string' }, heroTitle: { type: 'string' }, heroSub: { type: 'string' },
  services: { type: 'array', items: { type: 'object', properties: { t: { type: 'string' }, d: { type: 'string' } }, required: ['t', 'd'] } },
  dmHook: { type: 'string' }, dm: { type: 'string' }, emailSubject: { type: 'string' }, emailBody: { type: 'string' } },
  required: ['handle', 'lang', 'exactName', 'heroTitle', 'heroSub', 'services', 'dmHook', 'dm', 'emailSubject', 'emailBody'] } } }, required: ['out'] }
const toWrite = [...dm, ...mail]
const wb = []; for (let i = 0; i < toWrite.length; i += 10) wb.push(toWrite.slice(i, i + 10))
const written = await parallel(wb.map((b, i) => () => agent(`Write website-preview copy and outreach for each business, for DS Marketing (Miami): a $500 website live in 48 hours on their own domain; a free preview is built first; they pay only if they love it. Use ONLY facts in the name and bio below — no invented dishes, prices, years, awards, reviews. Spanish when the bio is mostly Spanish, else English. Copy speaks AS the business (we / our / you).
Per business: exactName (as they write it), heroTitle (3–7 words, their voice), heroSub (one sentence, real facts only), services (3–5 from the bio / trade, true but may be generic), dmHook (one real detail from their bio to open with), dm (≤ 65 words: hook, "I made you a free website preview", the link, "live on your own domain in 48 h for $500 — want it?"), emailSubject (≤ 7 words), emailBody (≤ 110 words, same idea + link, signed "Joxel · DS Marketing", last line "Reply STOP and we won't email you again." — the sender adds the mailing address).
Preview link = https://joxelds.github.io/Claude/p/<slug>/ with <slug> given below.
${b.map(q => `- @${q.handle} (slug ${slugOf(q.handle)}) · ${q.ig.name || ''} · ${q.niche} · ${q.area || ''} · ${q.ig.followers} followers · bio: ${(q.ig.bio || '').replace(/\s+/g, ' ').slice(0, 300)} · tagged by @${q.seed}: "${q.context}"`).join('\n')}`, { label: `write:${i + 1}`, phase: 'Write', schema: WR })))
const wmap = new Map(written.filter(Boolean).flatMap(w => w.out || []).map(w => [String(w.handle).replace(/^@/, '').toLowerCase(), w]))
const pack = q => ({ handle: q.handle, slug: slugOf(q.handle), name: q.ig.name || q.handle, niche: q.niche, area: q.area, seed: q.seed, context: q.context,
  followers: q.ig.followers, media: q.ig.media, bio: q.ig.bio, website: q.ig.website || '', domainNote: q.domainNote || '', local: q.ig.local, email: q.email, emailSource: q.emailSource, phone: q.phone, score: +q.score.toFixed(3), copy: wmap.get(q.handle) || null })
return { date: A.date, counts: { seeds: today.length, seedsOk: seedsOk.size, candidates: cands.length, checked: vmap.size, verdicts: counts, qualified: qualified.length, dm: dm.length, email: mail.length, hold: hold.length, leftover: cands.length - toCheck.length },
  seedsUsed: today.map(s => s.handle), seedsDead: today.map(s => s.handle).filter(h => !seedsOk.has(h)), newSeeds, leftover: cands.slice(MAX_LOOKUPS),
  dm: dm.map(pack), email: mail.map(pack), hold: hold.map(pack) }
