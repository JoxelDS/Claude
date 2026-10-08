# DS Autopilot — runbook (for the Claude session that runs DS Marketing)

Goal (Joxel, 2026-10-08): "automate all of the process, I just want to receive payments … make the best websites … an agent that never stops looking for inspiration and gets better." Targets: 200 qualified leads/day, 5 sales/week, 3 posts/day.

## Map
| Piece | Where |
|---|---|
| Lead engine | Workflow `.claude/workflows/ds-daily-leads.js` (named `ds-daily-leads`); seeds `docs/sales/lead-seeds.json`; Make 6559189 "DS - IG mention harvest" (captions of a business/aggregator account, `@` stripped by Instagram) + lookups 6552164 / 6558876 / 6558880 / 6558883 "DS - IG profile lookup 1–4" (Business Discovery; one run at a time each) |
| Brand + photos | Make 6552699 "DS - IG brand pull" (profile + 12 posts with media URLs) → Higgsfield `sandbox_exec` + `tools/ds/igimg.py` (Instagram's CDN is only reachable there; images come back via `image_paths` → `tool-results/`) |
| Website generator | `tools/ds/site.mjs` (v2, built 2026-10-08 by Workflow `ds-site-v2`) — v1 `tools/ds/preview.mjs` kept for reference. Fonts self-hosted in `public/p/_fonts` (`tools/ds/fonts.py`). Previews at `https://joxelds.github.io/Claude/p/<slug>/` |
| Inspiration agent | Workflow `.claude/workflows/ds-inspiration.js` (named `ds-inspiration`) → `tools/ds/inspiration/library.json` + experiments judged A/B, winners merged into `site.mjs` |
| Pipeline page | https://claude.ai/artifact/UPBKzoPBPrA2rgMngANBjp — db `prospects`, `messages` (dm / email drafts, `priority`, status draft → sent / approved → sent / skipped), `settings/main {mailingAddress, emailReady, dmCap}` |
| Posts | DS Post Queue https://claude.ai/artifact/8Xa7QSmRvWiF87DgRGUXhD + `docs/social/ds/post-queue.md`; content insights `docs/social/ds/content-insights.md` |
| Payments | Stripe (Joxel's account, his bank). Payment Links: Website $497, Website Pro $997, Care $49/mo; each lead's link = `<link>?client_reference_id=<slug>`; custom field "Domain you'd like (optional)" |
| Domains + hosting | Porkbun: register `.com` (≤ $15) + Secure Static Hosting `PIXIESECURESTATICY2` ($30/yr) or `…M2` ($3/mo), deploy = base64 files ≤ 10 MB per call |
| Emails | Make Gmail connection (when Joxel adds it) → scenario "DS - send email" (to build) with the mailing-address footer from pipeline `settings/main.mailingAddress` |
| Setup Joxel does | `docs/sales/autopilot-setup.md` |

Hard limits learned: WebSearch is capped at 200 calls per turn for ALL agents together (the first lead run spent it in two agents). The lead engine therefore runs on Instagram data through Make, not search. The container cannot reach api.stripe.com, porkbun.com, cloudflare or netlify (only GitHub), so outside services go through connectors (Stripe, Porkbun, Make) or the Higgsfield sandbox. Make Core = 10,000 ops/month (harvest ≈ 4 ops, lookup ≈ 3 ops); Joxel approved the upgrade to 40k.

## Daily run (routine "DS Autopilot — daily", 7:4x AM ET)
1. `git pull origin main`. Read this file.
2. **Payments**: list Stripe checkout sessions completed since `settings/main.lastPaymentCheck` on the pipeline page. For each new one, run **Delivery** below. Never deliver twice: the prospect's `stage` must not already be `paid`/`live`.
3. **Leads**: `Workflow({name: "ds-daily-leads", args: {date, known: <every handle in pipeline prospects + lead-seeds>, seeds: <lead-seeds.json>, maxLookups: <ops budget ÷ 3>, dmPerDay: 25, findSeeds: <Monday>, out: <scratch>/leads}})`. Save the result to `<scratch>/ds/leads/<date>.json`. Update `docs/sales/lead-seeds.json`: `uses += 1` on the used seeds, append `newSeeds`, drop a seed after 3 dead runs.
4. **Photos** for the day's DM leads: brand pull → sandbox `igimg.py` (MODE=pick, the 3 best IMAGE posts by likes, or video frames) → `public/p/_img/<slug>-1..3.jpg` + logo. A lead with no usable photos gets the niche samples (labelled "Sample photos").
5. **Build** the previews: lead JSON (copy fields + verified bio facts only) → `node tools/ds/site.mjs <leads.json> --mode preview --claim-url "<Stripe $497 link>?client_reference_id={slug}"` (until Stripe exists: the default Instagram DM link). Screenshot each one (`shot.mjs`): 0 sideways scroll, 0 broken images, 0 external requests. Commit `public/p` and push to main. Check that each URL returns 200 (Pages takes ~1 min).
6. **Pipeline**: `ArtifactData batch` → `prospects/<slug>` (`stage: "new"`, `source: "ig-harvest via @seed"`, `addedAt`, followers, area, contact) and `messages/dm1-<slug>` (`channel: "dm"`, `priority` = rank, `status: "draft"`, body = the DM with the preview link), plus `messages/em1-<slug>` for leads with a public email (`channel: "email"`, subject, body). Never write a message whose preview URL is not live yet.
7. **Follow-ups**: a DM marked sent ≥ 3 days ago with no reply → `dm2-<slug>` draft (short, one new detail, same link). At ≥ 7 days → `dm3` (last, friendly close). Emails the same, once Gmail is connected. Approved emails: send up to 40/day through "DS - send email", oldest first.
8. One line to Joxel: "N new leads (M DMs ready) · K emails sent · P payments · Q sites live".

## Delivery (a payment came in)
1. Find the prospect by `client_reference_id`. Mark it `stage: "paid"` with amount, email, phone, Stripe session id.
2. **Domain**: if the client typed one in the custom field, check it; otherwise check `<name>.com`, `<name>miami.com`, `<name>fl.com`, `<shortname>.com` (letters only, ≤ 20 chars). Register the first available one at ≤ $15 (Porkbun `check_domain` → `register_domain`). If none qualifies, ask Joxel with 3 options.
3. **Build live**: `node tools/ds/site.mjs <lead.json> --mode live --only <slug> --out <scratch>/live` → bundle: copy every `/Claude/p/_img/<slug>-*` and `/Claude/p/_fonts/<file>` the page uses next to it and rewrite those paths to `/img/…` and `/fonts/…`; add `robots.txt` and `sitemap.xml`; `<link rel=canonical>` to the domain.
4. **Host**: Porkbun `hosting/create` (static, yearly SKU, `acknowledgedCost`, `agreeToNameserverChange`) → poll `hosting/get` until ACTIVE → `hosting/deploy` the files → check `https://<domain>` serves it (HTTPS can take minutes).
5. **Tell the client**: an email (Gmail via Make) and a DM text for Joxel: "Your site is live: https://<domain> — any change, just reply". Include the Care plan link ($49/mo: hosting, domain renewal, monthly updates) as the next step.
6. Pipeline `stage: "live"`, `domain`, `liveAt`. Add the business to `docs/sales/clients.md` (name, domain, plan, dates).
7. Optional, with the client's OK only: a "new site" post for DS Instagram.

## Session handoff (when Joxel opens a new session after connecting Stripe / Porkbun)
1. Read CLAUDE.md, this file, `docs/social/ds/post-queue.md`, `docs/training/pov-studio.md`.
2. Re-point every routine to the new session: `list_triggers` → for each DS / POV routine, `create_trigger` with the same name, cron and prompt (it binds to the new session by default), then `delete_trigger` the old one. Write the new trigger ids into the pages that fire them: DS Post Queue `settings/main.triggerId`, POV Studio `settings/main.triggerId`.
3. Stripe: create Products + Prices + Payment Links (Website $497 one-time, Website Pro $997 one-time, Care $49/month recurring). On each link: collect phone, a custom text field "Domain you'd like (optional)", and the success message "Thank you! Your site goes live within 48 hours. We'll text you the link." Save the link URLs in the pipeline `settings/main` (`payLinks`) and in this file.
4. Porkbun: `ping` (confirm the account), `account/apiSettings` (the limit), and a `dryRun` registration of a test name. Nothing is bought until a client pays.
5. Run the first daily run.

## Rules
- Honest everything: only facts from the business's own public info, real reviews with the platform named, own photos credited, samples labelled. Previews say "free preview … not the official website".
- Never contact Sodexo, its subsidiaries or clients. No SDX names in DS material.
- Cold DMs are sent by Joxel by hand from the pipeline page: ≤ 25/day, ≤ 15 per sitting, stop on any Instagram warning.
- Cold emails: CAN-SPAM footer (mailing address + "Reply STOP"), honour every STOP at once (`prospects.stage = "stop"`), ≤ 40/day from his Gmail at first.
- Money: never spend above the Porkbun monthly limit, never top up without Joxel's yes, never refund or charge on Stripe without his yes.
