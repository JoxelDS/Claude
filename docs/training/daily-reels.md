# Daily Reels — SDX Inspect (Instagram, 3 a day, TWO accounts, Joxel approves each one)

Routine: 8:52 · 11:52 · 17:52 New York time. Each firing makes ONE Reel in TWO cuts, sends Joxel both files + both captions and asks "Post it?". Yes = post to both. Nothing posts without his yes.

## The two accounts
| Account | Job | Cut | Caption voice | Make scenario |
|---|---|---|---|---|
| **@sdxinspect** (new) | the product | `app.mjs` — the app's own look: light page, navy header bar with the SDX mark, Inter, red "KEY MOMENT" pill, navy intro, light outro (SDX Inspect only — never DS Marketing) | product: what it does + how, EN + short ES, end with "Free 30-day pilot — DM us PILOT" (the sales offer, docs/sales/playbook.md), ≤ 15 hashtags | NOT CONNECTED YET — see docs/social/sdxinspect/SETUP.md; when Joxel says it is ready: find its accountId with the instagram-business `Pages` RPC on connection 7319439, copy scenario 6549655 with that accountId, set its interface (video_url, post_caption) with scenarios_set-interface, activate, write the id here |
| **@dsmarketing.agency** (his brand) | the maker | `brand.mjs` — black, his DS Marketing logo, @dsmarketing.agency, torn-paper outro, NO "link in bio" | maker: "We built SDX Inspect for…", tag @sdxinspect, EN + short ES, ≤ 15 hashtags | **6549655** "SDX Inspect - IG Reel Post" |

Until @sdxinspect is connected: post only to @dsmarketing.agency and say "the @sdxinspect copy is saved and waiting for the account".

## How a Reel is made (tools/video/)
1. `npm ci` (repo root) if `node_modules` is missing, `npm run build`, and `npm i --no-save --prefix /tmp/ff ffmpeg-static`.
2. Record: `cd tools/video && node pov.mjs <clip>` (flows in FLOWS: g_temps · g_problem · crew · portal). It records the real app at 390×844 @3× and writes `out/pov_<clip>/master.mp4` + `cues.json` (one caption cue per action; `a.cue(text,{key})`). New topic = add a flow to FLOWS (copy an existing one).
3. Cut both: `node app.mjs <clip>` → `out/app-<clip>.mp4` and `node brand.mjs <clip>` → `out/brand-<clip>.mp4`. Intro text: `INTRO="Title|sub" node app.mjs <clip>` (same for brand.mjs); defaults per clip live in both files.
4. Check a frame sheet of each (`ffmpeg -i … -vf fps=1/1.5,scale=180:-1,tile=10x2 -frames:v 1 sheet.jpg`): the app fills the phone, headlines readable, nothing covers the action, no Sodexo marks.
5. Copy to `docs/reels/<YYYY-MM-DD>-app-<clip>.mp4` and `…-brand-<clip>.mp4`, commit + push to main. Public URL = `https://raw.githubusercontent.com/JoxelDS/Claude/main/docs/reels/<file>`.
6. Send Joxel both files (SendUserFile) + both captions, ask "Post it?". On YES: `scenarios_run` (responsive) on each account's scenario with `video_url` + `post_caption`. Instagram takes ~1.5 min per Reel; if the call times out, check `executions_list` before retrying so nothing posts twice. Report both post ids.
7. Bump `NEXT` below and push.

Rules: real app only, demo data (no badge codes, no real phones), no Sodexo / Hard Rock logos or text, captions EN with a short ES line, ≤ 15 hashtags. Never change either look without asking Joxel.
Old cutters kept for reference only: `saas.mjs` (light gradient), `reel.mjs` (old stage crop).

NEXT: 2

## Ready to post (already rendered — no re-recording)
- #1 temps — DS: POSTED 2026-10-07 (old pov cut). @sdxinspect: `docs/reels/2026-10-07-app-g_temps.mp4` = its FIRST post once connected.
  @sdxinspect caption: A cooler at 50°F should be 40°F or below. SDX Inspect catches it the second you type it. 🌡️ / One rule for every stand: coolers ≤ 40°F, freezers ≤ 20°F, hand sinks ≥ 95°F. Bad reading → flagged → fixed. / 🇪🇸 Una temperatura mala se marca al instante. / Free 30-day pilot — DM us PILOT. / #foodsafety #haccp #foodsafetyinspection #restaurantinspection #temperaturelog #kitchenmanagement #foodservice #concessions #stadiumfood #inspectionapp #restauranttech #qualitycontrol
- #2 problem — `docs/reels/2026-10-07-app-g_problem.mp4` (@sdxinspect) + `docs/reels/2026-10-07-brand-g_problem.mp4` (DS)
  @sdxinspect: Paper notes get greasy, wet and lost. SDX Inspect doesn't. 📱 / Mark it ✗, say what's wrong and where, snap the BEFORE photo — a few taps, saved even with no signal. / 🇪🇸 Problema, lugar y foto en segundos. / Free 30-day pilot — DM us PILOT. / #foodsafety #restaurantinspection #kitchenmanagement #foodservice #facilitiesmanagement #inspectionapp #restauranttech #stadiumfood #concessions #qualitycontrol #paperless #hospitality
  DS: We built @sdxinspect because inspection notes kept getting lost. 📱 / Now every problem is saved with what, where and a BEFORE photo, in a few taps. / 🇪🇸 Lo construimos para que nada se pierda. / #dsmarketing #softwaredevelopment #appdevelopment #restauranttech #foodsafety #kitchenmanagement #foodservice #inspectionapp #startup #madeinmiami #saas #hospitality
- #3 crew — `…-app-crew.mp4` + `…-brand-crew.mp4`
  @sdxinspect: "Is it fixed yet?" You don't have to ask anymore. ✅ / The crew opens a link (no password), taps Done and adds the AFTER photo. The inspector sees it fixed — with proof. / 🇪🇸 Arreglado y con foto de prueba. / Free 30-day pilot — DM us PILOT. / #facilitiesmanagement #maintenance #cleaningcrew #foodsafety #kitchenmanagement #foodservice #beforeandafter #inspectionapp #stadiumfood #operations #restauranttech #hospitality
  DS: Crews used to text "done" with no proof. With @sdxinspect they tap Done and add the AFTER photo. ✅ / We design tools people actually use. / 🇪🇸 Herramientas que la gente sí usa. / #dsmarketing #appdevelopment #softwaredevelopment #facilitiesmanagement #operations #restauranttech #saas #beforeandafter #madeinmiami #startup #foodservice #hospitality
- #4 portal — `…-app-portal.mp4` + `…-brand-portal.mp4`
  @sdxinspect: Stand teams log their own temps with one scan. 📲 / Scan the stand's QR poster, type name + phone, log the reading. No app, no password — straight to the inspector. / 🇪🇸 Escanea, registra y listo. / Free 30-day pilot — DM us PILOT. / #haccp #foodsafety #temperaturelog #foodservice #concessions #stadiumfood #kitchenmanagement #qrcode #inspectionapp #restauranttech #qualitycontrol #hospitality
  DS: One QR poster per stand, and the team logs temps without downloading anything. That's @sdxinspect. 📲 / Simple wins. / 🇪🇸 Lo simple gana. / #dsmarketing #appdevelopment #qrcode #restauranttech #saas #foodsafety #concessions #ux #madeinmiami #startup #foodservice #hospitality
(" / " = line break in the caption.) From #5 on, make new Reels with pov.mjs + app.mjs + brand.mjs.

## Joxel's own POV clips (2026-10-08)
Joxel films POV clips while using the app and sends them (attached in the chat → saved under /root/.claude/uploads/<session>/, or uploaded to Higgsfield with the media id). Each batch becomes ONE Reel for **@sdxinspect only**:
- Hook: "POV: you inspect 100+ stands at a stadium in Miami" (never name the stadium, Sodexo or any stand).
- Blur EVERYTHING identifying, frame by frame: faces (OpenCV face detection + a manual check of a frame sheet), stand names / signs / logos, license numbers, phone numbers, badge numbers, the app's stand names on screen. When unsure, blur.
- Real problems on camera (warm cooler, dirty fryer) only when nothing identifies the stand.
- Cut: fast, 15–30 s, captions timed to the action (and to his words if he talks — faster-whisper in sandbox_exec), app-look intro/outro from app.mjs styles, music bed −14 LUFS.
- Same approval rule: send the file + caption, post only after "yes".

## Selling Reels (Joxel: "videos … but selling to people")
Every 3rd Reel is a SELLING Reel for the buyer, not a feature tour: hook = their pain in their words ("Event day. 100 stands. 1 inspector."), middle = the app solving it (pov.mjs flow), end = the offer ("Free 30-day pilot — DM PILOT"). Write captions to the buyer (F&B directors, ops managers, concession operators), not to inspectors. Keep learning what sells: note in Market notes which hooks get views / DMs.

## Topics (rotate; when the list ends start over with a new hook)
| # | Clip | start / len | Hook | Line 2 | Caption idea |
|---|---|---|---|---|---|
| 1 | g_temps | 3 / 18 | POV: you check 100+<br>coolers by yourself | 50°F? The app flags it. | One rule: coolers ≤ 40°F, freezers ≤ 20°F. The app catches the bad one. |
| 2 | g_problem | 3 / 18 | Paper notes get lost.<br>Phones don't. | Problem + BEFORE photo in seconds | Every issue saved with where, what and a photo. |
| 3 | crew | 2 / 18 | The crew fixed it.<br>Here's the proof. | AFTER photo → Fixed | Crews get a board, tap Done, add the AFTER photo. |
| 4 | portal | 2 / 18 | Stand teams log temps<br>with one scan | No app. No password. | QR poster → temps, supplies, problems. |
| 5 | g_types | 3 / 16 | Event day? Post event?<br>The guide changes focus | Temps first · Cleaning first | One full guide, the type sets the priorities. |
| 6 | followups | 2 / 16 | 361 problems?<br>Find yours in 2 taps | Search · floor · crew | Follow-ups list, filter, remind the team. |
| 7 | reports | 2 / 16 | Every inspection,<br>saved and searchable | No more binders | Past reports with photos and scores. |
| 8 | stands | 2 / 16 | 100+ stands.<br>One QR each. | Posters printed by floor | Stands, licenses and equipment in one place. |
| 9 | g_temps | 10 / 14 | Hand sink 90°F?<br>Not on my watch | ≥ 95°F hand sinks · ≥ 110°F wash | Sinks and food temps checked in the same walk. |
| 10 | g_problem | 8 / 14 | Inspectors: stop<br>writing on napkins | Snap it. Tag it. Done. | The fastest way to report a problem. |
| 11 | crew | 8 / 12 | "Is it fixed yet?"<br>Now you know | Live status from the crew | In process → Done, with a timestamp. |
| 12 | portal | 10 / 14 | Bad temp?<br>They must say what they did | Corrective action sent | The stand sends the fix with the reading. |
