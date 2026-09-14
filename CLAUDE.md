# SDX Inspect — project memory

Read this first. It is the memory between sessions.

## What this is
- SDX Inspect: kitchen / stand inspection PWA for Sodexo Live! at Hard Rock Stadium. User: Joxel Da Silva (inspector). Requests arrive short, often in caps, usually with a screenshot; ship small versions fast, verify in the harness, report in plain words.
- React + Vite. Almost everything lives in `src/App.jsx` (~30k lines, single file) and `src/App.css`. `src/main.jsx` mounts `<App/>` and `<LanguageFab/>`. Service worker `public/sw.js` with cache name `sdx-inspect-vNNN` (bump every deploy). Firestore project `sodexoinspection`, venue id `default`.
- Deployed from `main` to https://joxelds.github.io/Claude . Users must close and reopen the app twice to get a new version.

## Deploy loop (every change)
1. Edit `src/App.jsx` / `src/App.css`.
2. `sed -i 's/sdx-inspect-vNNN/sdx-inspect-vNNN+1/' public/sw.js`
3. `npm run build` (from repo root; if `vite: not found`, run `npm ci`).
4. Run a harness script (below), then commit and `git push -u origin main`. Never push to any other branch. Never put model ids in commits, PR text or code. Commit trailer lines come from the session reminder.
5. If the container restarted, `node_modules` and the scratchpad are gone: `npm ci`, rebuild, recreate harness files. Check `git log origin/main` before pushing; cherry-pick onto latest main if the branch drifted.

## Harness (Playwright, local mode, no Firestore)
- Chromium `/opt/pw-browsers/chromium`, args `--no-sandbox --no-proxy-server`; route `https://app.local/Claude/*` to files in `dist/`.
- `localStorage.sdx_force_local = "1"` makes Firestore calls no-op. Seeds: `sdx_history_cache_default` (reports), `sdx_equip_registry_default` (registry mirror: items with `assetTag` + labelIndex entries with `name/brand/location`), `sdx_users_default`, `sdx_venue_settings_default`, `sdx_equip_setup/verified/confirmed_default`.
- Login badges: `448800` (inspector "App Reviewer"), `365582` (Joxel, global admin, use `window.dispatchEvent(new CustomEvent('sdx-nav',{detail:{page:'admin'}}))` to navigate). Crew user badge hash = sha256("sdx_badge_v2_"+badge).
- After sign-in click "on site". Navigate with `sdx-nav` (pages: `print_labels` = Stands & equipment, `kitchen_qr` = posters & licenses, `history`, `admin`, `crew`, `equipment_scanner`). `window.__sdxStands` exposes the loaded stand list.
- Portal (what teams see when scanning a stand QR): `?haccp=1&site=NAME&unit=114&loctype=Concession`. Ident → "This is my location" → form.
- In local mode `loadHistory` returns nothing; `loadStandList()` falls back to `sdx_history_cache_default`.
- `sdx_equip_reg_doc_default` = `{items, labelIndex, hidden}` seeds the registry in the online shape (used by v422-test.mjs).

## Data model (Firestore `venues/default/sharedMemory/*`, all writes `setDoc merge`)
- `equipmentRegistry`: `items{TAG}` (manual/walk units: assetTag,label,venueName,unit,floor,locType,location,brandName,standId), `labelIndex{TAG}` (units indexed from reports: name,brand,location,venueName,unit,standId), `hidden{uid}` (soft deletes; a unit is hidden if `hidden[uid] || hidden[TAG] || hidden["reg_"+TAG]`), `verified{standId}`, `confirmed{TAG}`, `setup{TAG}`, `cutoffMs/cutoffMode`. Doc was ~798 KB on 2026-09-14 (limit 1 MB) — needs compaction (drop index entries for hidden tags).
- `kitchenRegistry`: `items{id}` (stands added/edited by Joxel: site,unit,floor,license,locType), `hidden{id}`.
- `licenseRegistry`: `items{rowKey}` overlay on the static `LICENSE_REGISTRY` (INDEX 2026, 106 rows) — Joxel marks rows requested/active/added.
- `standNotices`: announcements shown in the portal for targeted stands.
- Rules: sharedMemory read public, write allowed (`notTooLarge` = ≤80 top-level keys); users delete forbidden (soft delete `removed:true`).
- All shared writes go through `writeSharedDoc` → local outbox `sdx_reg_outbox_default`, replayed by `flushOutbox()` on load; failures flash "Not saved yet".

## Stand identity (do not change casually)
- The license registry IS the stand list: `standSeeds()` = one stand per `licenseRows()` row; type from letter (C Concession, S Subcontractor, P Portable · "/ Sub" → Portable - Subcontractor, K Kitchen). Concession rows get the plain id.
- Stand id: `u:<normUnit>`; a second stand with a different name at the same unit gets `u:<unit>~<slug>` (`standIdIn`). Old report names never create stands. `sameStandName` (slug prefix) is identity; `looseStandName` (token overlap) is only for matching equipment → stand.
- `equipBelongsTo(item, stand)`: standId wins, then unit, then name (exact, then loose), then type, else the base stand. Unit-less items resolve by name (`standForUnitless`). Units that fit nothing show in "Unassigned equipment" with bulk assign.
- Registry record beats a report snapshot for label, brand, location, unit, venueName, locType, standId.
- Every `items[TAG]` write MUST carry `assetTag` (v422). Bare placement patches (move/retag) created tag-less records → ghost "Cooler" rows sharing a uid with the real unit → deleting the ghost deleted the real one. Load now fills tag/name from the index and dedupes by uid; `removeUnitVerify` matches uid+tag and offers ↩ Undo.

## Product decisions already made (don't relitigate)
- One QR per stand (poster). Equipment stickers were dropped in v400; posters stopped listing equipment in v419 (scan shows the live list). App version shown in menu footer + poster footer (v421); update banner at top. Per-unit QR was recommended against.
- Stands & equipment are one menu entry with two tabs (posters & licenses / equipment & verify walk).
- Verify walk (v392+): confirm / fix / remove / add per unit, mark stand verified; keep it working.
- Problem reports must be specific (v415/416): guided chips (which unit, what's wrong, which part, where) in portal, quick report and inspection form; out-of-range temps need a reason + action.
- Names, units, brands, locations, licenses stored and shown in UPPER CASE. Stand type badges everywhere; "NO LICENSE" / "REQUESTED" flags.
- Language switch (Google Translate) on every screen via `LanguageFab`; portal has native EN/ES strings.
- Crew boards (maintenance / Ecolab / cleaning) with per-stand picker and By Problem grouping; announcements to stands; invite links for roles.

## Training assets
- `docs/training/`: crew training deck (pptx) + EN/ES script. Video (3:44, silent, captions) built by scratchpad `train/record.mjs` (stage.html + phone iframe, Playwright recordVideo, ffmpeg-static → mp4); not in the repo. Crew roles are maintenance / cleaning / ecolab only — Pest Control is an issue type moved with "Not mine → move". The app's DevTools guard fires in small iframes: spoof `hasTouch` + `maxTouchPoints` in harnesses. Portal quick reports don't reach the crew board in local mode (Firestore only).
- Narrated build (v3): Higgsfield MCP (`higgfield`) — 16 narration clips `seed_audio` voice Holden `3c9d6053-6334-592c-8997-4e325286af3f`, 5 `seedance_2_5` clips (intro/outro/3 ambient). Egress here blocks `*.cloudfront.net` (result downloads) but allows PUT to the S3 presigned `media_upload` URLs; so the recording (`train/record.mjs`, chroma-green cards, `out/timeline.json`) is uploaded and the mix (colorkey + overlays + adelay/amix) runs in `sandbox_exec` (`train/gen_mix.py` builds the command), result confirmed as media `4bbef9a3-9ca2-4022-99ac-2e4884772901`, delivered as a Higgsfield link. Sandbox stdout truncates ~20 KB: check frames as tiny base64 JPEGs.

## Open items
- Compact `equipmentRegistry` (size risk). Audit workbook was delivered 2026-09-14 (29 orphan units, 28 duplicate copies, 41 units missing brand/location, 43 stands without equipment, 22 stands without license, verify walk 0/116).
- Domain change: waiting for the domain name (needs CNAME, vite `base`, SW scope, Firebase authorized domains).
- App Store 3.2.0 resubmission on hold; Refero token exposed earlier — rotate; Higgsfield connector never got a callback URL.
