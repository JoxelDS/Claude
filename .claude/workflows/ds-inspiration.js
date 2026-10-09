export const meta = {
  name: 'ds-inspiration',
  description: 'DS Marketing inspiration agent: sweep the best new websites, grow the inspiration library, try the 3 most promising ideas on the website generator, keep only what judges score better',
  whenToUse: 'Weekly (DS Inspiration routine) or when Joxel asks for better websites. Never stops: every run adds to tools/ds/inspiration/library.json and may improve tools/ds/site.mjs.',
  phases: [{ title: 'Sweep' }, { title: 'Propose' }, { title: 'Try' }, { title: 'Judge' }, { title: 'Merge' }],
}
// args: { date, scratch: "<scratchpad>/ds", samples: ["el-bori","elite-barbershop-doral","knockout-kendall"], leads: "<path to leads json>" }
const A = args || {}
const REPO = '/home/user/Claude', LIB = REPO + '/tools/ds/inspiration/library.json', V2 = A.scratch + '/v2'
const SAMPLES = A.samples || ['el-bori', 'elite-barbershop-doral', 'knockout-kendall']
const LEADS = A.leads || A.scratch + '/leads2.json'
const RULES = `Generator: ${REPO}/tools/ds/site.mjs (node tools/ds/site.mjs <leads.json> --out <dir> --mode preview|live --only a,b). Leads: ${LEADS}. Fonts: ${REPO}/public/p/_fonts (+ fonts.json; add families only with python3 tools/ds/fonts.py <dir>). Screenshots: node ${V2}/shot.mjs <path under /Claude/> <prefix>; sheets: python3 ${V2}/sheet.py <png> <jpg>.
Never break: honesty (only facts in the lead data, real reviews with platform, own photos credited, samples labelled, preview ribbon + disclaimer in preview mode), no external requests at load, no sideways scroll at 390 px, tap targets ≥ 44 px, contrast ≥ 4.5:1, reduced motion, HTML+CSS+JS ≤ 60 KB gzip, ≤ 3 font files. Adapt ideas — never copy another site's code, images, logos or wording.`

phase('Sweep')
const ENTRY = { type: 'object', properties: { entries: { type: 'array', items: { type: 'object', properties: { url: { type: 'string' }, niche: { type: 'string' }, idea: { type: 'string' }, why: { type: 'string' }, kind: { type: 'string', enum: ['layout', 'type', 'colour', 'motion', 'photo', 'conversion', 'copy', 'seo', 'tech'] } }, required: ['url', 'niche', 'idea', 'why', 'kind'] } } }, required: ['entries'] }
const SWEEPS = [
  ['galleries', 'the newest entries on curated galleries — siteinspire.com, land-book.com, godly.website, onepagelove.com, awwwards.com (Sites of the Day / honourable mentions), lapa.ninja, httpster.net, styles.refero.design — WebFetch their listing pages directly'],
  ['niche', 'standout real websites of restaurants, food trucks, cafés, bakeries, barbershops, nail/lash studios, salons, boutique gyms, boxing clubs and home-service brands launched or redesigned recently, anywhere in the world'],
  ['type-colour', 'typography and colour: new or rising open-licence typefaces (Google Fonts new arrivals, Fontshare, Velvetyne, collletttivo), pairings used by top studios, palettes that feel 2026 rather than 2020'],
  ['interaction', 'interaction and motion that stays fast and accessible: CSS scroll-driven animations, view transitions, @starting-style, container queries, text-wrap: balance/pretty, scroll-snap galleries, hover/press micro-interactions, sticky mobile action bars from great booking/ordering products'],
]
let lib = []
const sweep = await parallel(SWEEPS.map(([k, what]) => () => agent(`You are the DS Marketing inspiration scout (${k}). Find 8–12 genuinely excellent, specific ideas from ${what}. WebSearch at most 6 times (a hard budget shared by all agents); WebFetch freely. Read ${LIB} first (if it exists) and skip anything already there. For each idea: the page URL where you saw it, niche, the idea in one concrete sentence a developer can build, why it would make a small-business site better (beauty, trust or conversion), and its kind.`, { label: `sweep:${k}`, phase: 'Sweep', schema: ENTRY })))
const fresh = sweep.filter(Boolean).flatMap(s => s.entries).map(e => ({ ...e, date: A.date }))
log(`${fresh.length} new inspiration entries`)

phase('Propose')
const PROP = { type: 'object', properties: { proposals: { type: 'array', items: { type: 'object', properties: { id: { type: 'string' }, title: { type: 'string' }, change: { type: 'string' }, expected: { type: 'string' }, sources: { type: 'array', items: { type: 'string' } } }, required: ['id', 'title', 'change', 'expected', 'sources'] } } }, required: ['proposals'] }
const props = await agent(`${RULES}\n\nYou are the design lead. Here are this week's new inspiration entries:\n${JSON.stringify(fresh, null, 1)}\nAppend them to ${LIB} (create the file / folder if missing; keep it a JSON array; dedupe by url+idea). Then read tools/ds/site.mjs, render the sample leads ${SAMPLES.join(', ')} to public/p/_lab/base/ and screenshot them (prefix ${V2}/insp/base-<slug>), look at them, and propose the 3 changes most likely to make these sites clearly better (each small enough to build in one sitting, each inspired by entries in the library — cite them). Ids: exp1, exp2, exp3.`, { label: 'propose', phase: 'Propose', schema: PROP })
const proposals = (props && props.proposals || []).slice(0, 3)

phase('Try')
const tries = await parallel(proposals.map(p => () => agent(`${RULES}\n\nBuild experiment ${p.id}: "${p.title}" — ${p.change}\nCopy tools/ds/site.mjs to ${V2}/insp/${p.id}.mjs and change ONLY the copy (never the real generator). Render ${SAMPLES.join(', ')} with it to ${REPO}/public/p/_lab/${p.id}/ and screenshot them (prefix ${V2}/insp/${p.id}-<slug>). Look at the results and refine once. Report what you changed and any metric problems (from the shot.mjs JSON).`, { label: `try:${p.id}`, phase: 'Try' })))

phase('Judge')
const VERD = { type: 'object', properties: { verdicts: { type: 'array', items: { type: 'object', properties: { id: { type: 'string' }, better: { type: 'boolean' }, score: { type: 'number' }, why: { type: 'string' } }, required: ['id', 'better', 'score', 'why'] } } }, required: ['verdicts'] }
const JUDGES = [['designer', 'a world-class visual designer'], ['owner', 'the three business owners (food truck, barbershop, boxing gym) deciding whether to pay $500'], ['engineer', 'a strict front-end / accessibility / honesty auditor who reads the generated HTML']]
const votes = await parallel(JUDGES.map(([k, who]) => () => agent(`${RULES}\n\nYou are judge "${k}" (${who}). Compare the BASE pages (${V2}/insp/base-<slug>-m.png, -d1.png; HTML in public/p/_lab/base/) with each experiment (${proposals.map(p => p.id).join(', ')}: ${V2}/insp/<id>-<slug>-m.png / -d1.png; HTML public/p/_lab/<id>/). Make sheets with sheet.py and LOOK. For each experiment: is it clearly better than base (not just different)? Score −5 (worse) … +5 (much better). Any honesty or rule break = better:false.`, { label: `judge:${k}`, phase: 'Judge', schema: VERD })))
const winners = proposals.filter(p => { const vs = votes.filter(Boolean).map(v => v.verdicts.find(x => x.id === p.id)).filter(Boolean); return vs.filter(v => v.better).length >= 2 && vs.reduce((s, v) => s + v.score, 0) > 3 })
log(`winners: ${winners.map(w => w.id + ' ' + w.title).join(' · ') || 'none this week'}`)

phase('Merge')
let merged = 'no winners — the generator is unchanged'
if (winners.length) {
  merged = await agent(`${RULES}\n\nMerge these winning experiments into the real generator tools/ds/site.mjs (their copies: ${winners.map(w => `${V2}/insp/${w.id}.mjs — ${w.title}`).join('; ')}). Then render ALL leads (node tools/ds/site.mjs ${LEADS} --out public/p/_lab/final --mode preview), screenshot every page (prefix ${V2}/final/<slug>), and check: no sideways scroll, 0 broken images, 0 external requests, 0 errors, honesty intact. If anything regressed, fix it or revert that part. Add a dated line per change to the "Changelog" comment at the top of site.mjs. Return the changelog lines.`, { label: 'merge', phase: 'Merge' })
}
return { date: A.date, newEntries: fresh.length, proposals, winners: winners.map(w => w.id + ': ' + w.title), merged, tries }
