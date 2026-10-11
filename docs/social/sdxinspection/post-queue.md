# SDX Post Queue — one post a day on @sdxinspection (automatic once connected)

Joxel (2026-10-10, screenshot of the new @sdxinspection profile): "I want you to connect to this account and let's start posting".

- **Page:** SDX Post Queue — https://claude.ai/artifact/Bd3w9RC1T2wwfujnCqY4CR (private to Joxel). It shows the posts in line, the time each one goes up, a Pause switch, Post now, Skip and Edit caption, and a yellow banner while the account is not connected.
- **Routine:** "SDX Post Queue" (id in `settings/main.triggerId`), cron `CRON_TZ=America/New_York 52 11 * * *`, fires into the session that built it (Routines can't carry connectors). Post now on the page fires it with the text `SDX Post Queue: approved <id>`.
- **Account:** @sdxinspection (name "SDX Inspection system"). It must be a Professional account linked to a Facebook Page, and Make's Facebook connection (7319439, "My Facebook connection") must be reauthorized with that Page and account ticked. Until then nothing can post (`settings.connected` is false).
- **Posters (made at wiring time, ids saved in `settings/main`):**
  - `photoScenario`: clone of DS 4094568 `{photo_url, post_caption}`.
  - `carouselScenario`: clone of DS 6561219 `{files[{media_type, image_url}], post_caption}`.
  - `reelScenario`: clone of DS 6561124 `{video_url, post_caption, thumb_offset}`.
  - Every clone posts to `settings.igAccountId` (the @sdxinspection Instagram business id), never to the DS account 17841406956116523. The old SDX Reel scenario 6549655 posts to the DS account — never use it for this queue.
- **Reel files:** `docs/reels/<date>-sdx-<topic>.mp4` (made by `tools/video/motion.mjs <clip> --look app` from the demo-venue recordings in `tools/video/out/pov_<clip>`), `videoUrl` = `https://raw.githubusercontent.com/JoxelDS/Claude/main/docs/reels/<file>`.

## Database (the page's artifact db; use ArtifactData with the URL above)
- `settings/main` = `{autoPost, connected, connNote, triggerId, igAccountId?, photoScenario?, carouselScenario?, reelScenario?}`. Only Joxel's switch changes `autoPost`.
- `posts/<id>` = `{order, kind: "reel"|"photo"|"carousel", headline, caption, status, createdAt, claims[], …}`:
  - Reel: `videoUrl`, `coverMs`, `durationS`, `asset` (cover JPEG on the page), `videoAsset` (a 540 px copy so ▶ plays on the page).
  - Photo: `imageUrl` (raw GitHub JPEG), `asset`.
  - Carousel: `imageUrls[]`, `slideAssets[]`, `alt[]`.
- Statuses: `draft` (in line) → `approved` (Post now) → `posting` → `posted` (`postedAt`, `postId`) · `skipped` · `failed` (`error`).

## Each run — do exactly this
1. `ArtifactData list` `settings` and `posts`. Note the time now.
2. **Connection.** If `settings.connected !== true`:
   - Run `mcp__Make__rpc_execute {appName: "instagram-business", appVersion: 1, rpcName: "Pages", data: {__IMTCONN__: 7319439}}`.
   - An error (OAuth 190, session invalidated) → the connection is still dead. Update `settings/main.connNote` only if the reason changed, then end with one line: "SDX queue: waiting for the Instagram connection — nothing posted". Stop.
   - It answers but no entry is @sdxinspection → the account is not Professional / not linked to a Page / not ticked in Make. One line saying which, stop.
   - It lists @sdxinspection → **wire it**: save its id as `igAccountId`; for each of 4094568, 6561219, 6561124 read the blueprint (`scenarios_get`), replace the Instagram account id in every module's parameters with `igAccountId`, rename "SDX Inspection - IG Photo / Carousel / Reel Post", create it (`scenarios_create`, team 1857003, on demand), copy the interface (`scenarios_interface` → `scenarios_set-interface`), activate it. Write the three ids + `connected: true` + `connNote: ""` to `settings/main`. Then go on.
3. **Approved** (any run): for each `approved` doc with no `postId`, post it (step 5).
4. **Scheduled run** (firing text is not `approved <id>`) and `settings.autoPost !== false`:
   - If a doc has `postedAt` in the last 20 hours, today's post is already up → step 6.
   - Otherwise post the `draft` with the lowest `order` (step 5).
   - A doc in `posting` under 30 min old belongs to a run still working; an older one → check executions first (5a).
5. **Post one doc, never twice.** Scenario = `photoScenario` / `carouselScenario` / `reelScenario` by `kind`.
   - (a) `executions_list {scenarioId, from: <approvedAt | postingAt | createdAt>}`; a successful execution already carrying this doc's URL → read the post id (`executions_get-detail`), write `posted`, stop.
   - (b) `update` → `{status: "posting", postingAt: now}` with `if_version`.
   - (c0) **Caption guard:** refuse (write `failed`, "caption has a note in it") when the caption contains Sodexo, Hard Rock, a real stand or client name, "DS Marketing", "dsmarketing", "Joxel", "I left out", "tell me", "if you want", "let me know", "I'll add", "TODO", "[" or "{".
   - (c) `curl -s -o /dev/null -w "%{http_code}"` on every media URL must print 200, else `failed` ("video link is not live").
   - (d) `scenarios_run {scenarioId, responsive: false, data}` — Reel `{video_url, post_caption, thumb_offset: coverMs}`, photo `{photo_url, post_caption}`, carousel `{files, post_caption}`. Poll `executions_list` every ~30 s up to 6 min, read the post id with `executions_get-detail`.
   - (e) An error or a timeout → back to (a) before any retry; retry at most once.
   - (f) Success → `{status: "posted", postedAt, postId}`; failure → `{status: "failed", error: "<one plain sentence>"}`.
6. **Top up** when fewer than 3 docs are `draft`: make new Reels (`tools/video/motion.mjs`) or posts from the demo venue only (`tools/video/seed.mjs`: HARBOR DOGS, TRATTORIA NOVA, LEMON CART …). Read every frame sheet before queueing: no Sodexo logo, no real stand names, no real people's phone numbers.
7. End with one line, e.g. "SDX queue: posted #1 temps (id …) · 3 in line" or "SDX queue: waiting for the Instagram connection — nothing posted".

## Content rules
- The product only: what the app does, shown on the demo venue. Never name the employer, the venue or its clients, never their logos, never a screenshot with real stand names.
- No numbers we have not measured (no "saves 3 hours", no "used by N venues").
- Captions: English, one short Spanish line, "Try the live demo — link in bio.", "Free 30-day pilot — DM us PILOT", ≤ 15 hashtags.
- The bio link is `https://joxelds.github.io/Claude/marketing/` (product page → live demo `?v=riverside-demo`, badge 448800).
