# DS Post Queue — 3 posts a day on @dsmarketing.agency (automatic)

Joxel (2026-10-08): "I want you to post 3 times a day" → chose **post on its own** (no OK needed, honest rules, pausable).

- **Page:** DS Post Queue — https://claude.ai/artifact/8Xa7QSmRvWiF87DgRGUXhD (private to Joxel). It shows what's up next, with the time each post goes up, and has a Pause switch, Post now, Skip and Edit caption.
- **Routine:** `trig_01GbH6Df4ypy5pxBznC97Qcc` "DS Post Queue": cron `CRON_TZ=America/New_York 52 8,12,18 * * *`. It fires into the session that built it, because a Routine can't carry connectors. The page's Post now also fires it, with the text `DS Post Queue: approved <id>`.
- **Poster:** Make scenario **4094568** "DS Marketing - IG Photo Post", called as `mcp__Make__s4094568_ds_marketing_ig_photo_post {photo_url, post_caption}`. It posts to IG account 17841406956116523 (@dsmarketing.agency).
- **Reels:** Make scenario **6561124** "DS Marketing - IG Reel Post" `{video_url, post_caption, thumb_offset}` (thumb_offset = cover time in ms; same IG account and connection 7319439). Instagram needs ~1–2 min to process a Reel, so run it with `scenarios_run {scenarioId: 6561124, responsive: false, data: …}` and read the result with `executions_get-detail` (poll `executions_list` until it finishes). The SDX scenario 6549655 is NOT for DS posts.
- **Reel files:** made by the Reel engine `tools/ds/reels/` (`node tools/ds/reels/render.mjs <spec.json>`), listed in `docs/social/ds/video-series.md`, committed as `docs/reels/ds/<date>-<id>.mp4` → `videoUrl` = `https://raw.githubusercontent.com/JoxelDS/Claude/main/docs/reels/ds/<file>`.
- **Graphics:** `node tools/ds/posts.mjs posts.json outDir` renders 1080×1350 JPEGs in the DS offer-post look. Phone screens in a graphic are the sample sites, labelled "Sample sites".

## Database (the page's artifact db; use ArtifactData with the URL above)
- `settings/main` = `{autoPost: true|false, triggerId, account, slots}`. Only Joxel's switch changes `autoPost`.
- `posts/<id>` = `{order, kind, headline, caption, imageUrl (raw.githubusercontent …/main/public/p/_img/posts/NN-id.jpg), asset (page asset id), claims[], status, createdAt, approvedAt?, postingAt?, postedAt?, postId?, error?}`.
- Reels: `kind: "reel"`, plus `videoUrl` (raw GitHub mp4), `coverMs`, `durationS`, `asset` = the cover JPEG, `videoAsset` = the mp4 uploaded to the page (a 720p copy when the file is over 20 MiB) so the ▶ button plays it on the page.
- Statuses:
  - `draft` = in line.
  - `approved` = Joxel tapped Post now.
  - `posting` = this run is sending it.
  - `posted`.
  - `skipped` = Joxel tapped Skip.
  - `failed`, with `error`.

## Each run — do exactly this
1. `ArtifactData list` `settings` and `posts`. Note the time now.
2. **Approved** (any run): for each `approved` doc with no `postId`, post it (step 4).
3. **Scheduled run**: a scheduled run is one whose firing text is not `approved <id>`. Go on only if `settings.autoPost !== false`.
   - If any doc has `postedAt` within the last 150 minutes, this slot is already used (Post now, or a retry), so skip to step 5.
   - Otherwise take the `draft` with the lowest `order` and post it (step 4).
   - A doc in `posting` whose `postingAt` is under 30 min old belongs to a run that is still working. Leave it alone.
   - A doc in `posting` that is older: check executions first (step 4a) and record what really happened.
4. **Post one doc, never twice.**
   - The scenario is **4094568** for a photo (`imageUrl`) and **6561124** for a Reel (`kind: "reel"`, `videoUrl`). Use the right one in (a), (c), (d).
   - (a) Run `mcp__Make__executions_list {scenarioId: <4094568 | 6561124>, from: <approvedAt or postingAt or createdAt, epoch ms>}`. If a successful execution already carries this doc's `imageUrl` / `videoUrl`, read its post id with `executions_get-detail`, write `posted`, and stop. Don't post it again.
   - (b) `update` the doc to `{status: "posting", postingAt: now}`, using `if_version`.
   - (c0) **Caption guard** (2026-10-08: a Reel went up with a note to Joxel at the end naming Sodexo and Hard Rock, and only he can edit a live caption): the caption must be ONLY the caption. Refuse to post — write `failed` with error "caption has a note in it" — when it contains any of: Sodexo, Hard Rock, SDX client names, "Joxel", "I left out", "tell me", "if you want", "let me know", "I'll add", "TODO", "[", "{".
   - (c) `curl -s -o /dev/null -w "%{http_code}" <imageUrl | videoUrl>` must print 200. If it doesn't, write `failed` with error "image link is not live" / "video link is not live".
   - (d) Photo: call `mcp__Make__s4094568_ds_marketing_ig_photo_post {photo_url: imageUrl, post_caption: caption}`. Reel: `mcp__Make__scenarios_run {scenarioId: 6561124, responsive: false, data: {video_url: videoUrl, post_caption: caption, thumb_offset: coverMs}}`, then poll `executions_list` (every ~30 s, up to 6 min) and read the post id from `executions_get-detail`.
   - (e) If the call errors or times out, go back to (a) before any retry. Retry at most once.
   - (f) On success write `{status: "posted", postedAt, postId}`. On failure write `{status: "failed", error: "<one plain sentence>"}`.
5. **Top up**: when fewer than 6 docs are `draft`, add 9 new posts (3 days of posts). Reels are added in batches from `docs/social/ds/video-series.md` (about one Reel a day, spread between image posts); the top-up adds image posts only, and keeps any queued Reels in their place.
   - Topics and format come from `docs/social/ds/content-insights.md` (the research agent keeps it current). Rotate kinds: tip, myth, process, checklist, compare, spanish, faq, offer, "what a preview looks like". Have at most one hard offer in every 3 posts. Never reuse a headline from the last 30 posts.
   - Write them as `posts.json` (format at the top of `tools/ds/posts.mjs`). Each post carries `claims[]`: every factual statement in the image and the caption.
   - The only offer facts allowed:
     - $497 website live in 48 h on their own domain.
     - A free preview made from their Instagram before they pay.
     - $997 Pro.
     - $49/mo care.
     - DM "WEBSITE".
   - Never invent results, client names, reviews, stats, percentages or "most people" numbers. Advice must be general and true.
   - Captions are in English, then one short Spanish line, then ≤ 10 hashtags.
   - Render with `node tools/ds/posts.mjs posts.json /tmp/dsposts`. Read every image (Read tool): text inside the frame, no overlap (the script prints OVERLAP), nothing cut off.
   - Copy the images to `public/p/_img/posts/NN-<id>.jpg`, numbered after the last one. `git add` only those files, commit "DS posts NN–MM", and `git push -u origin main` (retry 4× with backoff). Check that every raw URL returns 200.
   - Upload each image to the page (`Artifact publish` with `url` = the page, `file_path`, `asset: true`), then `ArtifactData batch` the new docs with `status: "draft"` and `order` after the highest one.
6. End with one line, e.g. "posted #9 tip-… (id …) · 7 in line · topped up 9" or "paused — nothing posted".

Rules:
- Honest content only.
- Never post a `skipped` doc.
- Never post while `autoPost` is false, unless the doc is `approved`.
- Never post two queue docs in the same slot.
- Never mention Sodexo, Hard Rock or SDX clients.
- Never post a lead's preview or name without their OK.
