# DS Reel engine

Data-driven, deterministic renderer for **1080×1920 · 30 fps Instagram Reels** in the DS Marketing look
(near-black `#050505`, torn-paper panels, white type, Montserrat 800 headlines + Inter body, DS logo,
`@dsmarketing.agency`, one accent colour used sparingly).

A Reel is a JSON **spec** (a list of scenes). One Chromium page builds every scene; `window.at(t)` paints the frame for
time `t` — a pure function of `t` (no CSS animations, timers, `Date` or `Math.random`), so any frame can be rendered in
any order and every render is identical. Frames are captured with CDP `Page.captureScreenshot` (JPEG q90) and piped
into ffmpeg → H.264 yuv420p CRF 18 (max 16 Mb/s), AAC 192k, `+faststart`. Music and SFX are synthesized with ffmpeg
lavfi (`lib/audio.mjs`) — no samples, no downloads, no copyrighted music.

```
node tools/ds/reels/render.mjs tools/ds/reels/specs/_demo.json --out /tmp/demo.mp4
node tools/ds/reels/render.mjs spec.json --sheet sheet.jpg --safe          # 1 frame / s, Instagram UI zones drawn on
node tools/ds/reels/render.mjs spec.json --scenes scenes.jpg               # 1 big tile per scene (its settled frame)
node tools/ds/reels/render.mjs spec.json --sheet strip.jpg --from 4 --to 8 --step .25   # dense strip for motion QA
node tools/ds/reels/render.mjs spec.json --still 2.5 still.jpg
```

| flag | what it does |
|---|---|
| `--out file.mp4` | render the video (default when no other output is asked for: `./reels-out/<id>.mp4`, or `$REELS_OUT/<id>.mp4`). Also writes `<file>.timeline.json` (scene times, cues, sections, warnings, loudness, render time) and `<file>.cover.jpg` when the spec has `cover`. |
| `--sheet file.jpg` | contact sheet, 8 tiles across (1600 px wide), one frame per second (or per `--step` s), each labelled `t=… · scene type`. Without `--out` only those frames are rendered (fast QA). |
| `--scenes file.jpg` | one 400 px tile per scene, taken 0.12 s before its cut (everything has landed) — the fastest way to check layout. |
| `--safe` | draws the Instagram UI zones over every frame (QA only): header 0–220, caption + audio 1500–1920, button column x 940–1080, safe box 60–940 × 220–1500 (green). |
| `--from s --to s` | render only that range (video + audio trimmed, sheet frames from that range). |
| `--still t file.jpg` | one frame. |
| `--workers n` | parallel pages capturing interleaved frames (default 2; `--workers 1` = strictly one page). |
| `--no-audio` | silent video. `--force` renders even when the spec has errors. |
| env | `REELS_PRESET` (x264 preset, default `fast`), `REELS_SFX_GAIN` (default .62), `REELS_KEEP=1` keeps the work dir (`/tmp/ds-reels/<id>-<pid>`: page.html, music.wav, sfx, mix.wav). |

**Speed** (this 4-CPU machine, shared): the 16-scene pilot (43.2 s, 1295 frames) renders in **≈ 116 s** total
(frames 107 s at ~12 fps with 2 workers; audio 14 s in parallel; mux < 1 s) → **a 30 s Reel ≈ 80–90 s**. Under heavy
load from other jobs it can double. x264 `medium` was 2.5× slower under load for no visible gain — keep `fast`.
Output ≈ 9–10 Mb/s (≈ 50 MB per 40 s).

## Spec

```jsonc
{
  "id": "menu-jpeg",                 // file names
  "lang": "en",                      // en | es | bi  (bi = English main line + Spanish second line)
  "music": { "preset": "upbeat", "bpm": 128, "intro": true },   // preset: lofi 84 · upbeat 122 · tension 100 · minimal 104 (default bpm)
  "accent": "#D8FF3C",               // the ONE accent (highlights, active numbers, tap rings, timer ring, callouts)
  "cover": 1.6,                      // seconds → <out>.cover.jpg (no QA overlay)
  "counter": { … },                  // optional running count over the scenes (see "Running counter" below)
  "scenes": [ { "type": "hook", "beats": 5, "text": "Your menu is a *JPEG*" }, … ]
}
```

**Every scene** takes:

| prop | |
|---|---|
| `type` | one of the 16 types below |
| `beats` **or** `dur` | length. Durations are always whole beats: `dur` (seconds) is rounded to the nearest beat (min 2), `beats` is exact. Every cut therefore lands on a beat. |
| `tr` | transition INTO this scene: `cut` · `whip` (0.34 s, horizontal slide with motion blur) · `zoom` (0.44 s, zoom-through) · `wipe` (0.56 s, torn-paper edge sweeps right → left with a light paper strip). Transitions **start on the cut beat**; the new scene's entrance plays during it. Default cycles `whip, cut, wipe, whip, zoom, cut` by index; the first scene is a cut. |
| `bg` | background: `right` · `left` · `bottom` · `top` · `diag` (torn grey panel on that side, slides in) · `plain`. Each type has a default. |
| `music: "break"` | drums + bass drop out for this scene (a breath before a punch). |
| `punch: false` | no camera punch-zoom on this scene's hits. |
| `pre?` | seconds: the scene's own clock starts that far in, so its entrance is already under way on its first frame (cue times and the pace lint follow). Use ~0.3 on a first scene that is not a `hook` so frame 0 is never empty; highlight / tap times stay scene-local (shift them by `pre`). |
| `pad?` | inset this scene's box: a number (all sides) or `[top, right, bottom, left]` px — e.g. `[28, 0, 0, 0]` keeps a head off the top edge of the safe zone, `[0, 46, 0, 46]` gives an end card room for the camera punch and the pill's pop / pulse on the sides. |
| `source?`, `sourceAt?`, `sourceHlAt?`, `sourcePunch?` | any type but `stat` (which draws its own): a small grey "Fuente: …" / "Source: …" line right under the scene's lowest element (the scene gets a shorter box so nothing sits on it). Fades in at `sourceAt` (s), else when the scene says: `hook` after its sub, `mythfact` after the flip (never on the MYTH side), `list` / `checklist` after the last row, others at .6 s. Up to 3 lines (a verbatim one-sentence quote fits); `==words==` inside it wipe on at `sourceHlAt` (s, default .5 s after it fades in) and stay grey until the bar reaches them; `sourcePunch: true` makes that wipe a beat of its own (camera punch + soft `pop`) — use it to break up a long reading hold. Use it for every number or Google/stat-type claim. An array of sources prints "Fuentes: a · b" / "Sources: a · b". |

**Text** props take a plain string, or `{ "en": "…", "es": "…" }` for bilingual specs (`lang: "es"` shows `es`,
`lang: "bi"` shows `en` with `es` as a smaller grey second line). Markup inside any string: `*word*` = outlined type,
`==words==` = accent highlighter (wipes on; several words on one line get one continuous bar), `\n` = line break. Punctuation right after markup sticks to it (`*yours*,`).
Everything auto-fits its box (binary search on font size, `text-wrap: balance`), never below **44 px**.

**Images**: `demo/<file>` (this folder), `photos/<file>` (`public/p/_img/`: `food-1..3`, `beauty-1..3`, `fitness-1..3`,
`home-1..3`), a path relative to the spec, or absolute. Any string ending in .jpg/.jpeg/.png/.webp/.svg is treated as
an image. Images under `/demo/` get a small **DEMO** tag on the device automatically (`demo: false|true` overrides).

## Scenes

Times are scene-local seconds. "Beats" = practical length at 120–132 bpm (the lint tells you when it is too short).

| type | props | motion / sound | beats |
|---|---|---|---|
| `hook` | `text` (1–5 words), `sub?`, `kicker?` (chip), `align` left\|center, `size?` (max px, 250), `every?` (beats between words), `sign?` `{text, small?, sticker?, stickerAt? (beats, 3), tilt? (−3°), w? (800), size? (150), demo? (true), pos? top\|bottom}` | words slam in one by one (spring scale 1.8 → 1, tilt) on half beats (whole beats when ≤ 3 words), a `hit` + camera punch on each; first word already landing on frame 0. If the reel starts with a hook the drums stay out until it ends (riser + boom into scene 2). `sign` = a printed paper counter sign (cream paper, double border, tape, DEMO tag) above (or below) the words, already landed on frame 0 — a real-world prop to open on instead of plain text; `sticker` slaps an accent pill on its corner at `stickerAt` (`hit`). Sign text is a prop (`.ui`, not counted by the read lint). | 4–5 (+2 with `sub`) |
| `text` | `head`, `sub?`, `kicker?`, `kickerStyle?` (`solid`\|`acc`\|`dim`), `align`, `size?` (176) | kicker slides in, headline lines mask-reveal, highlights wipe on, sub follows | 4–6 |
| `list` | `head?`, `headSize?` (head max px, 112 — e.g. 88 keeps a short head on one line), `items[]` (≤ 5, each ≤ 6 words), `numbered` (true), `numFrom?` (first number, 1 — e.g. 4 when the rows continue a count), `every?`, `size?` (76), `peeks?` `[{image, box: [x, y, w, h] (css px), cssWidth?, max? (zoom, 3), tilt?} \| null, …]` aligned with `items` + `cssWidth?` + `peekH?` (room under the last row, 30 % of the box): a white "evidence" card with that crop of a screenshot (DEMO tag for `/demo/`) pops in right under its row while the row is active (it may cover the rows still to come, shrinks away when the next row arrives, the last stays) | numbered rows reveal one by one (`pop`, rising pitch, punch); the active number turns accent, finished rows dim, all bright at the end | 2 per item + 2 |
| `checklist` | `head?`, `items[]` (≤ 5), `every?`, `size?` (70) | rows appear dim, then tick one by one (circle fills, check draws, `ding` up a major scale) | 2 per item + 1 |
| `mythfact` | `myth`, `fact`, `head?`, `mythLabel?`, `factLabel?`, `strike?` (s), `fact2?`, `fact2At?` (s) | dark MYTH ✗ card, white strike-through + `nope` (at `strike`, default 30 % of the scene), 3-D flip (`whoosh`) to a white FACT ✓ card, `ding`; `fact2` = a second, lighter paragraph on the FACT card that reveals later (`pop`, default 1.2 s after the flip) — e.g. two rules in one card; a scene `source` then waits for it | 7–8 |
| `compare` | `left{label, image \| lines[], scroll?, zoom?, zoomAt?}` (zoom: phones mode), `right{…}`, `head?`, `mode` `phones` \| `cards` \| `slider`, `device` (`phone`\|`browser`, slider only), `url?`, `rightAt?` (s the right side arrives, default ~40 %). Phones mode also takes per side `story{…}` (that phone is a story viewer, see below), `taps[]`, `highlights[]` (page coords use that side's scroll); `solo` (`true` or `{w? (560), callouts?: [{t, text, d?, y? (fraction of the phone height, .72), size?}]}`: the LEFT phone plays alone, big and centred, until `rightAt`, then shrinks into its slot) and `soloHead?` (headline shown during the solo, swapped for `head` when the right phone arrives); `stamp: false` (the left side is the SOURCE, not the bad version: no ✗ stamp, no ✗ on its chip, no dimming, no `nope`); `flows[]` (crops of the left screen fly into the right one — see "Flows" below) | phones: two phones, the right one arrives at ~40 % (whoosh), the left gets a ✗ stamp and dims. cards: dark DON'T card then white DO card. slider: one device, the AFTER image wipes over BEFORE with a handle. Default labels BEFORE/AFTER (cards: DON'T/DO). Slider + phone: `left.bg` colours the screen under a BEFORE page shorter than the screen. | 6–8 |
| `phone` | `image` (tall screenshot), `head?`, `scroll`, `taps[]`, `highlights[]`, `width?` (max 560), `cssWidth?` (390), `zoom?` / `zoomAt?` (pinch-zoom, see below; also on `browser`), `kicker?` (chip above the head), `headSize?` (head max px, 100), `headSlam?` (head words slam in one by one like a hook, `hit` + punch each, `every?` beats), `open?` (built to OPEN a reel: kicker, head and phone already landing on frame 0), `story?` (instead of `image`: the screen is a story viewer, see below), `pages?` / `badges?` (the screen navigates to other screenshots; accent number stickers — see "Pages and badges" below; also on `browser`) | phone rises with a 3-D tilt and idle sway, screenshot auto-scrolls, taps = finger + accent ring (`tap`), highlights = box drawn on + spotlight + accent callout (`pop`) | 5–6 |
| `browser` | `image` (desktop screenshot), `url` (typed letter by letter), `head?`, `scroll`, `taps[]`, `highlights[]`, `mobile?` (phone screenshot overlapping bottom-right), `typeUrl` (true), `cssWidth?` (1280), `aspect?` (screen h / w, .625 = 1280×800; e.g. 1 for a taller window on a vertical reel) | window rises, URL types with ticks, page scrolls, the phone slides in | 4–6 |
| `profile` | `name`, `handle?`, `category?`, `stats?` `{posts:"214", followers:"3,120"}`, `bio[]` (≤ 3 lines), `link` (link-in-bio text; `false` = no link row — a profile that links nowhere), `typeBio?` (`true` or `{t: start s (.45), cps: letters/s (26), gap: s between lines (.16)}` — the bio lines type in one by one with a caret and a soft `tick` per letter, emoji land whole; the layout is measured on the full text, so nothing moves while it types), `grid[]` (≤ 9; string or `{src, pos, zoom, label}`), `avatar?` (image, else initials), `theme` light\|dark, `head?`, `highlights[]` / `taps[]` with `target`: `link`·`bio`·`grid`·`avatar`·`name` | GENERIC profile mock (no platform branding; set `demo: true` for the DEMO tag — the name never runs under it): card rises, avatar pops, lines fade up, grid pops in a cascade. Rows are dropped (3 → 2 → 1) when the card would not fit. | 5–6 |
| `search` | `query`, `results[]` `{title, url, text}` (2–4), `business` `{title, url, text}`, `found` (true = it appears at `position`, ringed + "✓ That's you"; false = a dashed "✗ NAME: not found" box), `foundLabel?` (`\n` = a line break in the callout, e.g. a long sourced hedge on two lines), `missingLabel?`, `typeRate?`, `head?` | GENERIC search page (no engine branding): query types (`tick` per letter, speeds up to fit), enter (`tap`), results drop in, then the ring + `ding` or the missing box + `nope` | 7–8 (query ≤ ~22 chars) |
| `chat` | `head?` (headline above the thread, `headSize?` 120 — lets a reel OPEN on the chat: the line is already revealing on frame 0, `hit` + punch), `name`, `status?`, `avatar?` (`demo/avatar-unknown.svg` = grey silhouette for an unknown number; initials are Unicode-aware), `messages[]` `{from: "them"\|"me", text, t?, preview?, shake?}` (`t: 0` on the first = no typing dots, pings in on frame 1; `shake: s` = a short buzz on that bubble at scene time s (wiggle + tilt, soft `tap`, camera punch) — e.g. an attention beat on a spammy message before the reply; `preview: {image, top? (css px of a 390-wide page where the crop starts), title, url?, w? (600), h? (315)}` = a link-preview card on top of the bubble, DEMO tag for `/demo/` images), `size?` (bubble font px, 54; padding, radius, gaps and typing dots scale with it — e.g. 62 for a short punchy thread; bigger bubbles make a 5-message thread under a 3-line `head` scroll), `fadeTop?` (once the thread scrolls, older bubbles fade out under the header instead of being cut in half) | DM thread: typing dots before every "them" message, bubbles spring in (`send` / `recv`), the column scrolls when it fills; short threads sit centred | 2 per message + 1 |
| `stat` | `value`, `prefix?`, `suffix?`, `decimals?`, `label`, **`source` (required — the render refuses a stat without it)**, `head?`, `size?`, `count?` (s: a short count-up that lands ON the hit — eased, rounded down, so the final value first shows on the hit frame and no paused frame reads a wrong number; even ticks up to it) + `countAt?` (s it starts, .3; the number fades in just before) | number counts up (ticks), lands with a `hit` + punch, accent underline wipes, label + "Source: …" line | 6–7 |
| `timer` | `hours` (48) or `from`/`to` (hours), `label`, `head?`, `unitLabel?`, `endLabel?` (✓ LIVE) | accent ring drains while HH:MM:SS rolls down (clock ticks on half beats), then a big ✓ LIVE badge + `ding` | 5–6 |
| `quote` | `text`, `by?` | outlined “ drops in, lines reveal, attribution fades up. **Never a made-up customer review** — use it for a principle, a rule, or what owners commonly say ("— every food truck owner"), never a fake person. | 5–6 |
| `pov` | `text` ("POV: " is added), `scene` `{type, …}` (any other scene's props), `size?` (caption max px, 64) | white caption box pops at the top, the inner scene plays in the space below it | inner + 1 |
| `end` | `line?`, `cta?` (default DM “WEBSITE”), `offer?` (one short line), `handle?` (@dsmarketing.agency), `tapX?` (where the tap ring lands on the pill: fraction of its width from the centre, .25 — e.g. −.3 taps the left word so “WEBSITE” stays readable) | DS logo mask-reveals, line, CTA pill pops (`ding`), pulses on the beat, gets tapped; the music's drums drop out (outro) | 5 |

### Story viewer (`phone.story`, `compare.left/right.story`)

A GENERIC story viewer drawn inside the phone screen (segment bars, a round avatar + title, a plain “Reply…” / “Responder…” pill — no
platform branding): `{ title, sub?, avatar?, segments? (bars, ≥ frames), segDur? (2.4 s per bar), frames: [{ src, crop?: [x, y, w, h]
(css px of the image, e.g. only the photo part of a screenshot), at?: [x, y] (focus), zoom? (1.5), rot? (deg), blur? (px), ghost? (px —
shaky double image), glare? (0–1), dark? (0–1), sticker? (text sticker) }], taps: [s, …] (frame i+1 starts at taps[i]; finger + ring on
the right edge, `tap`), squint?: { t, d?, zoom? (1.4), at?, amt? (.31) } (eyelids close + the frame zooms in — someone squinting at a
blurry price), reply?, demo? (true = DEMO tag) }`. Bars fill while a frame shows; each new frame pushes in, then drifts (Ken Burns).
Example: `specs/v-pov-highlight-borroso.json` (a blurry “menu” highlight, then the menu page next to it).

### Pages and badges (`phone`, `browser`)

`pages: [{ "t": 3.2, "image": "demo/linkinbio-404.jpg", "fx": "load" }, { "t": 4.75, "image": "demo/nails-linkinbio.jpg", "fx": "back" }]`
— at `t` the screen navigates to another screenshot: `fx` `load` (default: a thin accent loading bar runs for `load` s (.3)
before `t`, then the page slides in from the right), `back` (slides in from the left, no bar), `scan` (the new page is revealed
behind an accent scan line with a soft glow that sweeps the screen in `dur` s (.55), top → bottom, or bottom → top with
`dir: "up"` — a profile "turning into" its website, and back for a rewind) or `cut`; `scroll?` per page
(default 0; a number or keyframes in scene seconds); a `whoosh` on each. Put the tap that "opens" it at ≈ `t − load`.
Page-coordinate taps / highlights / badges use the page on screen at their start time, `zoom` follows whichever page shows.
`badges: [{ "t": 0.97, "at": [36, 275], "text": "1", "pulse": true }]` — round accent stickers with a number / letter on the
screen (`size?` css px (40), `tilt?` (−8°), `d?` (default: until the next page change), `pulse` = a small kick on every beat;
`pop` cue); they live on the overlay, so they zoom with the screen. Example: `specs/v-link-in-bio-maze.json` (a "1 or 2?"
game on two look-alike BOOK buttons → #1 opens a 404, back, #2 opens another link page). Not set = one image, as before.

### Flows (`compare`, phones mode)

`flows: [{ "t": 3.55, "from": [0, 391, 129, 172], "to": [22, 1035, 346, 488] }]` — a crop of the LEFT screenshot (`from`, css px of
the left page) lifts off the left phone with an accent outline, flies in an arc into the right phone (`to`, css px of the right
page), growing / shrinking to fit that box, then fades so the real section underneath shows — e.g. a menu post becoming the
site's menu section. `lift?` (.22 s) + `d?` (.6 s flight): it lands at `t + lift + d` (`whoosh` on lift-off, `pop` + punch on
landing). The card follows both pages' scroll: scroll the right page to the section first (hold it there), keep the left phone
out of `solo` by then (t ≥ `rightAt` + .6), and add a right-side `highlights` entry at the landing time to label the section.
Pair with `stamp: false` when the left side is the source rather than the bad version. Example:
`specs/s-instagram-to-website-demo.json` (a demo profile's menu post, photo and hours post fly into its preview site).

### Running counter (`counter`, spec level)

`"counter": { "label": "🚩 Red flags", "sub": "Comment your number", "from": [0, 2.2], "to": [3, 0], "ticks": [[1, 1.5], [1, 3.1], [2, .34]] }`
— a dark pill that sits ABOVE the scenes (it stays put through the transitions) at the top of the safe zone (`pos: "bottom"`
for the bottom): an accent badge with the count that rolls up on every tick (badge pop, ring, wiggle, a `ding` that rises a
little each time), the label (Montserrat) and a grey second line. Times are reel seconds or `[scene, scene-local s]` (so they
survive bpm / beat changes); `start?` (0) is the first value; it pops in at `from` (`pop`) and shrinks away at `to`. Scenes it
covers for more than .5 s get a box 172 px shorter on its side (`reserve: [i, …]` picks them, `false` = none). Use it for a
counting game ("count the red flags — comment your number"): tick it on each callout / list row, then reveal the total.
Example: `specs/v-fax-us-for-a-quote.json`.

### Taps and highlights on devices

`taps: [{ "t": 0.9, "x": 0.5, "y": 0.62 }]`, `highlights: [{ "t": 1.0, "x": .04, "y": .35, "w": .4, "h": .09, "label": "Book a set", "d": 0.9 }]`
— `x, y, w, h` are fractions of the **visible screen**. Or use **page coordinates** (CSS px of the screenshot:
390-wide phone pages, 1280-wide desktop pages, `cssWidth` for anything else, e.g. 1000 for `demo/pool-oldsite.jpg`):
`{ "t": .9, "at": [108, 728] }`, `{ "t": 1, "box": [14, 696, 190, 66], "label": "Get a quote" }` — converted using
the scroll position at `t`, so put them where the scroll holds still. `demo/screens.json` lists the boxes of the main
elements of every demo screen (`cta`, `title`, `services`, `gallery`, `contact`, `call`, … and for the bad pages
`paper`, `firstButton`, `policy`, `nav` …) plus each page's CSS height. `d` = how long it stays (default: to the end); `size` = callout font px (default 44 — e.g. 60 for a roast line that IS the hook).
Callouts are kept inside the safe zone automatically. The `pop` of a labelled highlight lands when its callout arrives (`t` + .15 s: the box draws from `t`, the callout springs in from `t` + .12); an unlabelled one pops at `t`.

`scroll`: `"auto"` (default: hold 0.55 s, then scroll ≈ 420 px/s), a number (end position 0–1 of the page), `0`/`false`
(no scroll), or keyframes `[[t, fraction], …]` (ease in-out between them).

`zoom` (phone / browser / compare phones): a number, or keyframes `[[t, z, x?, y?], …]` (t = scene s, z ≥ 1, eased in-out; `x, y` = the focus point in page CSS px, else `zoomAt: [x, y]`, else the middle of the screen). The screenshot AND the overlay (taps, highlight boxes) scale around the focus — a pinch-zoom on the screen — and callouts follow their box. Combine with `scroll: 0` (or a held scroll) so boxes stay on their content. Highlights with a negative `t` are already drawn on frame 0. Example (`specs/e-menu-photo-real-text.json`): `"zoom": [[0, 1.15, 388, 305], [1.5, 1.6, 388, 305], [2.3, 2.2, 388, 300]]` + two taps at 1.55 / 1.78 s = a double-tap zoom onto the prices.

## Sound

Music presets (all beat-locked to the spec bpm; stems = one 4-bar loop rendered with `aevalsrc`, looped, then gated
per sample): **lofi** (half-time drums, Rhodes chords, vinyl crackle) · **upbeat** (four-on-the-floor, clap, offbeat
plucks, pumping pad) · **tension** (drone, 16th pulse, clock ticks, booms, 4-bar risers) · **minimal** (soft kick, rim,
marimba arpeggio, airy pad). Sections: intro without drums while a first `hook` plays (`music.intro: false` to keep
them), `music: "break"` scenes, an outro without drums on the `end` scene, 1.4 s fade at the end.
SFX (lavfi one-shots, placed on the cue times each scene reports): `whip` / `whoosh` / `rip` on transitions, `hit`,
`boom`, `riser`, `pop`, `tap`, `tick`, `ding`, `nope`, `send`, `recv`. The music is side-chain ducked under the SFX, the
mix is loudness-normalised in two passes to **−14 LUFS integrated, ≤ −1.5 dBTP**.

## QA warnings (printed before rendering, and stored in the timeline json)

| type | meaning |
|---|---|
| `overflow` | text does not fit its box even at 44 px — cut words |
| `small` | something readable renders under 44 px |
| `safe` | a key element sits outside x 60–940 / y 220–1500 |
| `read` | more words on screen than the scene allows at ≈ 4.5 words/s (+ 0.5 s) — add beats or cut words (UI mock text and Spanish second lines are not counted) |
| `pace` | the scene's last element lands < 0.5 s before the cut — add beats |
| `fit` | the profile grid lost rows to fit |
| spec errors (exit 2) | unknown type, missing image, `stat` without `source`, unknown preset |

## Limits for scriptwriters

- Offer facts you may use: free website preview first · $497 = live on your own domain in 48 hours · $997 = Website Pro ·
  $49/month care plan · "DM us WEBSITE". No other numbers, prices, claims or guarantees. A `stat` needs a real `source`.
- No fake reviews, testimonials, ratings or customers; `quote` is never an invented person. Demo screens are the three
  FICTIONAL businesses below and must keep their DEMO tag; never present them as clients.
- One idea per scene; hooks ≤ 5 words; headlines ≤ ~8 words; list / checklist items ≤ 6 words, ≤ 5 items; chat ≤ 5
  short messages; search query ≤ ~22 characters; profile bio ≤ 3 lines. Respect the `read` / `pace` lint: 16 scenes
  need ≈ 43 s; a 30 s Reel is ~9–11 scenes.
- Everything is inside the safe zone by construction (60–940 × 220–1500) — keep important words out of `cta`-like
  pills longer than ~22 characters (they shrink to 44 px, then overflow).
- Emoji render (Noto Color Emoji). ffmpeg here has no drawtext; all text is drawn in the page.
- Bilingual (`bi`) roughly doubles the words on screen — give those scenes ~1.5× the beats. The CTA pill, offer line and
  chips show the English text in `bi` mode (chips show `EN · ES` for built-in labels).
- Scene timing is beat-based: changing `bpm` changes every duration; set `beats` per scene.

## Demo material (`demo/`)

Three **fictional** businesses (names checked against the lead lists and the web; `.demo` handles, 305-555-01xx phones,
no ratings, no addresses): **Calle Cometa Tacos** (taco truck, Wynwood, theme darkroom), **Lacquer Lagoon Nail Studio**
(Brickell, pinkdawn), **Tidewick Pool Care** (Kendall, coastal). `node tools/ds/reels/demo/make.mjs` regenerates
everything: it runs the real generator (`tools/ds/preview.mjs demo-leads.json`), shoots each page full-length
(`*-mobile.jpg` 390 css px @1.5×, `*-desktop.jpg` 1280 @1×, with a "DEMO · FICTIONAL BUSINESS" strip on top),
**deletes the generated `public/p/demo-*` folders** so nothing is published, draws the bad counterparts and writes
`screens.json` (it rewrites the whole file — run `node tools/ds/reels/demo/make-maze.mjs` after it: that one only draws the three
maze screens below and merges their boxes in):

| file | what |
|---|---|
| `taco-mobile.jpg` / `taco-desktop.jpg` | Calle Cometa preview site |
| `nails-mobile.jpg` / `nails-desktop.jpg` | Lacquer Lagoon preview site |
| `pool-mobile.jpg` / `pool-desktop.jpg` | Tidewick preview site |
| `taco-menu-photo.jpg` | BAD: the "menu" is a phone photo of a greasy paper menu, prices crossed out, comments asking for prices |
| `nails-linkinbio.jpg` | BAD: cluttered link-in-bio page, 15 mismatched buttons, broken image |
| `linkinbio-404.jpg` | BAD: where the old "BOOK HERE" link goes — a generic 404 / expired booking-link page (`demo/make-maze.mjs`) |
| `nails-linkinbio-2.jpg` | BAD: where "BOOK HERE (NEW LINK!!)" goes — ANOTHER link page: each pro (2 nail techs, 3 barbers, invented first names) on a different app (`make-maze.mjs`) |
| `nails-booking.jpg` | GOOD: what "Book a set" on `nails-mobile.jpg` opens — one booking screen (service / day / time / Confirm) (`make-maze.mjs`) |
| `avatar-unknown.svg` | grey person silhouette for a chat `avatar` (unknown number / no profile photo) |
| `pool-oldsite.jpg` | BAD: a 2011 desktop site (1000 css px wide) — tiny on a phone (`cssWidth: 1000`) |
| `taco-profile.jpg` | SOURCE: Calle Cometa's GENERIC profile screen (390 × 844 css, no counts, link row "no website yet"); grid row 1 = a MENU post (same dishes + prices as `taco-mobile.jpg`), a photo (the site's first gallery photo) and an HOURS post — boxes `menuPost` / `photoPost` / `hoursPost` / `link` in `screens.json` (`node tools/ds/reels/demo/make-profile.mjs`; run it after `make.mjs` too) |
| `pool-oldsite-hd.jpg` | the same page shot at 3× (still `cssWidth: 1000`) — sharp under `zoom`, list `peeks` and sliders (`demo/make-oldsite-hd.mjs`, reads the HTML from make.mjs; screens.json gets named boxes for both: `marqueeCall`, `visitorCounter`, `priceTable`, `prices`, `faxLine`, `faxPhrase`, `aboutFax`, `ieText`, `map`, `picture`, `gallerySoon`, `specials`, `welcome`) |

Fonts: Montserrat ExtraBold and Inter 400–800 (from `tools/video/fonts/`, OFL) with their overlapping contours merged
(`lib/fonts/*-solid.woff2`, fontTools `removeOverlaps`) so `*outlined*` words have clean strokes.

## Full example

`specs/_demo.json` uses every scene type (43 s). A typical short educational Reel (7 scenes, 24 s at 128 bpm, no lint warnings):

```json
{
  "id": "menu-is-a-jpeg",
  "lang": "en",
  "music": { "preset": "upbeat", "bpm": 128 },
  "cover": 1.4,
  "scenes": [
    { "type": "hook", "beats": 5, "text": "Your menu is a *JPEG*" },
    { "type": "pov", "beats": 7, "text": "your customer squints at your prices",
      "scene": { "type": "phone", "image": "demo/taco-menu-photo.jpg", "scroll": 0,
        "taps": [{ "t": 0.8, "x": 0.7, "y": 0.44 }],
        "highlights": [{ "t": 1.3, "box": [40, 150, 310, 330], "label": "$4 or $5?" }] } },
    { "type": "mythfact", "beats": 9, "tr": "whip",
      "myth": "A photo of the menu is fine.",
      "fact": "Text menus can be *searched*, zoomed and read on any phone." },
    { "type": "compare", "beats": 8, "tr": "wipe", "head": "Same tacos. Better menu.",
      "left": { "label": "Menu photo", "image": "demo/taco-menu-photo.jpg", "scroll": 0 },
      "right": { "label": "Menu page", "image": "demo/taco-mobile.jpg", "scroll": [[2.4, 0], [3.6, 0.22]] } },
    { "type": "list", "beats": 10, "head": "Your menu page needs",
      "items": ["Dishes as text", "A price on each", "A pickup button"] },
    { "type": "text", "beats": 7, "kicker": "The offer", "head": "Free preview *first*",
      "sub": "$497 · live on your own domain in 48 hours" },
    { "type": "end", "beats": 6, "tr": "wipe", "line": "Want a free preview?", "cta": "DM us “WEBSITE”" }
  ]
}
```
