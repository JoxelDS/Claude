# Daily Reels — SDX Inspect (Instagram, 3 a day, Joxel approves each one)

Routine: 8:52 · 11:52 · 17:52 New York time. Each firing makes ONE Reel from the next topic, sends Joxel the link + caption and asks "Post it?". Nothing posts without his yes.

## How a Reel is made (tools/video/)
1. `npm ci` (repo root) if `node_modules` is missing, `npm run build`, and `npm i --no-save --prefix /tmp/ff ffmpeg-static`.
2. PREFERRED (v2, sharp + step captions): `cd tools/video && node pov.mjs <clip>` for g_temps · g_problem · crew · portal → `out/pov-<clip>.mp4` (records the app at 390×844 @3×, one caption per action, yellow key moments with a zoom punch, hook, end card, beat, −14 LUFS). Set a new hook with `HOOK="line 1|line 2 with *yellow*" node pov.mjs <clip>`. New topics = add a flow to FLOWS in pov.mjs (copy an existing one; `a.cue(text,{key})` before each action). Use the old steps below only for clips pov.mjs does not have yet.
   Old: Record the clip: `cd tools/video && node rec_full.mjs <clip>` (g_types · g_temps · g_problem) or `node record.mjs <clip>` (portal · crew · followups · reports · stands). Output `out/<clip>.mp4` (1920×1080 stage, phone in it). The phone crop in reel.mjs (448×975 at 1098,34) only fits PHONE scenes — skip laptop parts with start/len.
3. Cut the Reel: `node reel.mjs <clip> "<HOOK (use <br>)>" "<line 2>" <start s> <len s>` → `out/reel-<clip>.mp4` (1080×1920, H.264/AAC, faststart, ~20 s). Check a frame sheet (`ffmpeg -i … -vf fps=1/3,scale=180:-1,tile=6x1`) — the hook must not cover the key moment.
4. Copy to `docs/reels/<YYYY-MM-DD>-<slot>.mp4`, commit + push to main. Public URL = `https://raw.githubusercontent.com/JoxelDS/Claude/main/docs/reels/<file>`.
5. Send Joxel the file (SendUserFile) + the caption, ask "Post it?". On YES: Make scenario **6549655 "SDX Inspect - IG Reel Post"** (`scenarios_run` with `video_url`, `post_caption`) → posts to the connected Instagram (same account as the IG Photo Post scenario). Report the post id.
6. Bump `NEXT` below and push.

Rules: real app only, demo data (no badge codes, no real phones), no Sodexo / Hard Rock logos, captions EN with a short ES line, ≤ 15 hashtags.

NEXT: 2

## Ready to post (already rendered — use these files and captions for #2–#4, no re-recording)
- #1 temps — `docs/reels/2026-10-07-pov-g_temps.mp4` — POSTED 2026-10-07.
- #2 `docs/reels/2026-10-07-pov-g_problem.mp4`
  Caption: Paper notes get greasy, wet and lost. Your phone doesn't. 📱 / Mark it ✗, say what's wrong, where it is, and snap the BEFORE photo, all in a few taps. Saved even if you lose signal. / 🇪🇸 Problema, lugar y foto en segundos. / #foodsafety #restaurantinspection #kitchenmanagement #foodservice #facilitiesmanagement #inspectionapp #restauranttech #stadiumfood #concessions #qualitycontrol #paperless #hospitality
- #3 `docs/reels/2026-10-07-pov-crew.mp4`
  Caption: "Is it fixed yet?" Now you don't have to ask. ✅ / The crew opens a link (no password), taps Done and adds the AFTER photo. The inspector sees it fixed, with proof. / 🇪🇸 Arreglado y con foto de prueba. / #facilitiesmanagement #maintenance #cleaningcrew #foodsafety #kitchenmanagement #foodservice #beforeandafter #inspectionapp #stadiumfood #operations #restauranttech #hospitality
- #4 `docs/reels/2026-10-07-pov-portal.mp4`
  Caption: Stand teams log their own temps with one scan. 📲 / Scan the stand's QR poster, type name + phone, log the reading. No app, no password, and it's sent straight to the inspector. / 🇪🇸 Escanea, registra y listo. / #haccp #foodsafety #temperaturelog #foodservice #concessions #stadiumfood #kitchenmanagement #qrcode #inspectionapp #restauranttech #qualitycontrol #hospitality
(" / " = line break in the caption.) From #5 on, make new Reels with pov.mjs.

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
