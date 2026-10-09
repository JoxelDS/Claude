# posts2.mjs — DS Marketing feed generator (12 looks + carousels)

```
node tools/ds/posts2.mjs posts.json outDir [--offer offer.json]
```

- **Output:**
  - Single posts → `outDir/<id>.jpg`.
  - Carousels → `outDir/<id>-1.jpg … <id>-N.jpg`.
  - Every slide is 1080 × 1350 JPEG, ≤ 1 MB (it re-encodes lower until it fits).
  - `outDir/grid.jpg` is a 3-column profile-grid mock. It holds each post's first slide, in the order of `posts.json`, cropped to the 3:4 tile Instagram shows. Carousels get a stack icon.
  - `outDir/manifest.json` lists `{id, look, kind, lang, format, files[], alt[]}`. `alt` is one line of alt text per slide; paste it in the app after posting, since the Make modules have no alt-text field.
- **Requires** `playwright-core` from the repo's `node_modules` and Chromium at `/opt/pw-browsers/chromium`. Fonts load as data URIs, so nothing is fetched at render time.
- `tools/ds/posts.mjs` (the single torn-paper look) is untouched. The post queue still uses it.

## One brand, 12 layouts

Fixed on every slide, in every look:

- **Logo.** The DS logo (`tools/video/ds-logo.png`) sits top-left at x 80, y 72, 128 px wide. It turns white on dark backgrounds and black on light ones through a CSS filter. On the last slide of a carousel it is 250 px wide, in the same corner.
- **Handle.** `@dsmarketing.agency` sits bottom-right, in the footer row at y 1188–1250.
- **Footer row, left side:** the CTA chip on a single post, "Swipe →" / "Desliza →" on a carousel cover, and "02 / 06" plus a progress bar on inner slides. On the last slide it shows "Free website preview · DM “WEBSITE”" when the CTA is something else.
- **Safe zones:**
  - Nothing goes in the top-right 180 × 110 px, where Instagram puts the carousel counter.
  - Text stays inside x 80–1000, so it survives the 3:4 grid crop.
- **Type:** three families from `public/p/_fonts`:
  - Montserrat 800/900 for display;
  - Instrument Serif and its italic for editorial;
  - Inter for body.
- **Palette:** ink `#0B0B0B`, white, paper `#F4F0E8`, plus **one** accent per post: orange `#F5A524`, blue `#2EA8F5`, green `#3DDC84` or gold `#D4A853`. Text on an accent fill is always black (white on these accents fails 4.5:1).

| look | layout | best for | default accent |
|---|---|---|---|
| `torn` | Black torn paper, white caps headline, "—" lines, two SAMPLE phones | Offers and process posts. The signature look: use it sparingly | orange |
| `block` | One solid accent field, giant stacked poster headline (every line fills the width), rule + one line at the bottom | Statements, Spanish-first one-liners, shareable opinions | green |
| `editorial` | Paper, caps kicker + rule, big serif headline with an italic, highlighted word, magazine rules | Opinions, educational carousels ("ask these questions") | orange (highlighter) |
| `number` | White, one giant number over an accent disc, caps label, headline, source line | Verified facts with a source, "48 hours", numbered listicles | blue |
| `photo` | Full-bleed niche SAMPLE photo, tilted accent stickers, the line on a white card, "SAMPLE PHOTO" tag, black footer bar | Relatable lines by trade (food truck, salon, gym, home services) | orange |
| `split` | Diagonal before → after: a grey DEMO link-in-bio list vs a SAMPLE site phone | Demo transformations, "what changes" carousels | blue |
| `paper` | Notebook page (margin line, punched holes), hand-drawn checkboxes on ruled rows | Save-worthy checklists, what-to-send lists | blue |
| `chat` | A generic chat thread or to-do card (no platform marks, labelled "Example chat") on a dotted accent field | Relatable owner moments: late-night DMs, the to-do list | blue |
| `myth` | Black MYTH half (serif italic, struck through, ✕) over a white FACT half (✓, source), zig-zag seam | Myth vs fact, one myth per slide | orange |
| `ask` | A centred question over a ghost "?", a "VOTE" rule and A / B / C circles | Questions, polls, this-or-that ("comment A, B or C") | gold |
| `dicho` | A Spanish saying on a cream panel inside a cement-tile frame | Spanish-first relatable posts: a known dicho + what it means for the business | gold |
| `tips` | Warm gradient, centred title, 2×2 or 3×2 white icon tiles | Utility people share or save ("4 things customers check") | orange |

Keep two neighbours on the grid in different families:

| family | looks |
|---|---|
| light | editorial, paper, number, tips |
| dark | torn, dicho, myth, split |
| colour | block, chat, ask |
| photo | photo |

## posts.json

```jsonc
[{
  "id": "myth-3",                        // file name stem
  "kind": "myth",                        // educational | tip | checklist | myth | relatable | question | demo | process | offer
  "look": "myth",                        // one of the 12 above
  "lang": "en",                          // en | es: chrome strings + default CTA
  "format": "carousel",                  // single | carousel (2–10 slides)
  "accent": "orange",                    // optional: orange | blue | green | gold
  "cta": "Send this to an owner",        // optional; default by kind (below)
  "slides": [{
    "headline": "3 website myths, *busted*.",   // *word* = the look's emphasis, \n = line break
    "lines": ["…"],                             // body, ≤ 30 words per slide
    "source": "Google Search Central",          // REQUIRED when a slide shows a statistic
    "visual": { }                               // per-look fields (they may also sit on the slide itself)
  }]
}]
```

- **Carousel roles.** Slide 1 is the cover (hook + swipe cue). The middle slides are numbered. The **last slide is always the CTA slide**: big logo, headline, lines, one big CTA pill, in the same look.
- **Default CTA by kind:**

  | kind | EN | ES |
  |---|---|---|
  | relatable | Send this to an owner | Mándaselo a un dueño |
  | question | Comment your answer | Comenta tu respuesta |
  | offer · demo · process | DM “WEBSITE” | Escríbenos “WEBSITE” |
  | everything else | Save this | Guárdalo |

- **Prices are never typed in a post.** Write `{price.starter}`, `{price.pro}`, `{price.care}`, `{keyword}` or `{delivery}`; they come from `OFFER` at the top of `posts2.mjs` (today $500 Quick Start / $1,000 Growth Site / $49/month / WEBSITE / 48 hours; Premium Site $1,500 is not used in posts). To change a price, edit `OFFER` (or pass `--offer offer.json` with the same keys) and re-render. A literal `$` amount prints a PRICE warning.
- **Sample material only:**
  - `photo` takes only the niche SAMPLE photos `food|beauty|fitness|home-1..3` from `public/p/_img/`. Anything else stops that post.
  - `screen` takes only `food|beauty|fitness|home` from `tools/ds/assets/hero-sample-*.jpg`. The printed "★ 4.8 on Google" on the food screen is painted out at load.
  - Every look that shows them adds the SAMPLE PHOTO / SAMPLE SITE(S) / DEMO / EXAMPLE CHAT label by itself.

## Line breaks

- Body lines wrap with `text-wrap: pretty`; a line that wraps exactly once is balanced into two even lines.
- A headline, fact or body line that would end on one lone word is balanced — unless it already has a `\n`.
- Put a `\n` where a phrase must stay together (`"Your page gets read\n*in the Miami sun*."`). Kickers and number labels are always balanced.

## Checks printed per slide

A clean slide prints `ok`. Otherwise you see one or more of:

| check | what it means |
|---|---|
| `OVERFLOW` | Text did not fit even at the minimum size. Fonts shrink to fit (body never under 30 px), and some boxes grow to fill free space. |
| `OVERLAP a×b` | Two marked boxes collide. Phones in one fan may overlap. |
| `OUTSIDE` / `SAFE` | Text is past the frame, or outside x 80–1000. |
| `COUNTER` | Something sits in the carousel counter corner. |
| `CONTRAST` | Text is under 4.5:1 against what is behind it. |
| `SMALL` | Text is under 30 px. |
| `FOOTER` | The CTA runs into the handle. Long chips first switch to a narrower font. |
| `PRICE` | A literal `$` amount. |
| `STAT` | A `%` with no `source`. |
| `WORDS` | Body over 30 words, or headline over 12. |
| `SIZE` | The JPEG is over 1 MB. |
| `ERROR` | A non-sample photo or screen was named. The post is skipped. |

Look at the slides and `grid.jpg` before anything goes to the queue.

## One example per look

```json
[
 {"id": "torn-offer", "kind": "offer", "look": "torn", "lang": "en", "format": "single",
  "slides": [{"headline": "Free preview first. *Then* you decide.",
              "lines": ["{price.starter}: live on your own domain in {delivery}", "Growth Site: {price.pro}", "Care plan: {price.care}"],
              "visual": {"screen": "food", "screen2": "beauty"}}]},

 {"id": "block-vitrina", "kind": "relatable", "look": "block", "lang": "es", "format": "single", "accent": "green", "cta": "Mándaselo a un dueño",
  "slides": [{"headline": "Tu Instagram\nes tu vitrina.\nTu página,\ntu dirección.",
              "lines": ["Instagram enseña tu trabajo. Tu página dice dónde estás, a qué hora abres y cuánto cuesta."]}]},

 {"id": "ed-4-questions", "kind": "educational", "look": "editorial", "lang": "en", "format": "carousel", "cta": "Save this",
  "slides": [
   {"headline": "Ask these *4 questions* before you pay for a website.", "lines": ["Save this for the day someone sends you a quote."], "visual": {"kicker": "Before you hire anyone"}},
   {"headline": "Who owns the domain?", "lines": ["It should be registered in your name.", "Ask who renews it. A domain that expires takes the website and email with it."], "source": "ICANN"},
   {"headline": "Keep these *4 questions* handy.", "lines": ["Or send them to an owner who is shopping for a website."]}]},

 {"id": "number-91", "kind": "educational", "look": "number", "lang": "en", "format": "single", "accent": "blue",
  "slides": [{"number": "91%", "label": "of U.S. adults own a smartphone", "headline": "Your next customer is checking you on a phone.",
              "lines": ["Make your hours, menu and call button one tap away."], "source": "Pew Research Center, 2025"}]},

 {"id": "photo-truck-dms", "kind": "relatable", "look": "photo", "lang": "en", "format": "single", "cta": "Send this to a food truck owner",
  "slides": [{"headline": "Every food truck owner knows *these DMs*.", "lines": ["Put this week's stops, hours and menu on one page, and send the link instead."],
              "visual": {"photo": "food-3", "stickers": ["Where are you parked today?", "Are you open?", "Do you cater?"]}}]},

 {"id": "split-linkinbio", "kind": "demo", "look": "split", "lang": "en", "format": "carousel", "accent": "blue",
  "slides": [
   {"headline": "From link in bio to a page that *books*.", "visual": {"before": ["Menu (photo)", "Prices? DM me", "Old flyer.pdf", "Hours in highlights", "Booking link (old)"], "screen": "beauty"}},
   {"headline": "One page answers the DMs.", "lines": ["Services and prices up front", "A book button on every screen", "Hours and a map at the bottom"], "visual": {"screen": "beauty"}},
   {"headline": "Want to see yours?", "lines": ["We build a free preview of your page first."]}]},

 {"id": "paper-stranger-test", "kind": "checklist", "look": "paper", "lang": "en", "format": "single", "accent": "blue",
  "slides": [{"headline": "Does your page pass the *stranger test*?",
              "lines": ["Hours written as text, not a photo", "Phone number is a tap-to-call button", "Address opens in maps", "[x] Prices or menu readable on a phone"]}]},

 {"id": "chat-hours", "kind": "relatable", "look": "chat", "lang": "en", "format": "single", "accent": "blue",
  "slides": [{"headline": "When your hours only live in your *DMs*.", "lines": ["Put your hours where people look first."],
              "visual": {"chat": [["them", "hi are you open today?", "11:42 PM"], ["them", "hello??"], ["me", "Sorry! Just saw this. We open at 11", "8:05 AM"], ["them", "all good, went somewhere else"]]}}]},

 {"id": "chat-todo-es", "kind": "relatable", "look": "chat", "lang": "es", "format": "single", "accent": "orange",
  "slides": [{"headline": "La lista de pendientes de un dueño.",
              "visual": {"notes": {"title": "Pendientes", "items": [[true, "Comprar todo para el sábado"], [true, "Contestar \"¿están abiertos?\" (otra vez)"], [false, "La página web (la semana que viene)"]]}}}]},

 {"id": "myth-3", "kind": "myth", "look": "myth", "lang": "en", "format": "carousel", "cta": "Send this to an owner",
  "slides": [
   {"headline": "3 website myths, *busted*.", "lines": ["Short answers, straight from Google's own help pages."]},
   {"myth": "Someone can guarantee me #1 on Google.", "fact": "No one can guarantee a #1 ranking on Google. Be careful with anyone who promises it.", "source": "Google Search Central"},
   {"headline": "Know an owner who believes one of these?", "lines": ["Send this to them before they pay for a promise."]}]},

 {"id": "ask-found-you", "kind": "question", "look": "ask", "lang": "en", "format": "single", "accent": "gold", "cta": "Comment A, B or C",
  "slides": [{"headline": "How did your last new customer *find you*?", "visual": {"options": ["Instagram", "Google or Maps", "A friend told them"]}}]},

 {"id": "dicho-camaron", "kind": "relatable", "look": "dicho", "lang": "es", "format": "single", "accent": "gold",
  "slides": [{"saying": "Camarón que se duerme se lo lleva la corriente.",
              "lines": ["El cliente que no encuentra tu horario a las 11 de la noche se va con el de al lado."]}]},

 {"id": "tips-4-checks", "kind": "tip", "look": "tips", "lang": "en", "format": "single", "cta": "Share this with an owner",
  "slides": [{"headline": "4 things customers check *before they come*", "visual": {"items": [
   {"icon": "clock", "label": "Open now?", "sub": "Hours as text"},
   {"icon": "pin", "label": "Where are you?", "sub": "An address that opens maps"},
   {"icon": "phone", "label": "Can I call?", "sub": "A tap-to-call button"},
   {"icon": "menu", "label": "What does it cost?", "sub": "Menu or prices you can read"}]}}]}
]
```

## Per-look visual fields

| look | field | what it does |
|---|---|---|
| `torn` | `screen`, `screen2` | The SAMPLE phones. Inner slides show one phone and a big accent index. `number` overrides the index. |
| `block` | `headline` | Split it with `\n` into poster lines. Each line is scaled to the full width. |
| `editorial` | `kicker` | The caps line above the headline. Inner slides show a serif `1.`, `2.` … (`number` overrides it). |
| `editorial` | `mark` | The small italic mark at the right of the kicker rule (default "DS Notes" / "Notas DS"). Never a made-up issue number. |
| `number` | `number` (required), `label` | The giant number and its caps label. Inner slides fall back to the slide index. |
| `photo` | `photo` | The niche SAMPLE photo, `food\|beauty\|fitness\|home-1..3`. |
| `photo` | `stickers` | Up to 3 sticker labels. |
| `split` | `before` | Up to 5 DEMO link-list rows. |
| `split` | `screen` | The SAMPLE site. Inner slides list `lines` as numbered rows next to one phone. |
| `paper` | `lines` | The checklist rows. `"[x] "` = ticked. Inner slides show one box + headline + lines; start the headline with `[x] ` for a ticked box. |
| `chat` | `chat` | `[[who, text, time?]]`, where `who` = `them` or `me`. |
| `chat` | `notes` | `{title, items: [[done, text]]}`. Use it instead of `chat`. |
| `myth` | `myth`, `fact`, `source` | One myth per slide. The cover uses `headline` + `lines`. |
| `ask` | `options` | 2–3 options. Inner slides show a big letter (`letter` overrides it) + headline + lines. |
| `dicho` | `saying` | The dicho. `lines` = what it means for the business. `kicker` overrides "DICHO". |
| `tips` | `items` | `[{icon, label, sub}]`, 2–6 items. Icons: clock, pin, phone, menu, calendar, link, search, lock, camera, tag, chat, globe. Inner slides show the first item's icon big. | Inner slides centre icon + headline + lines (+ `source`) between the logo and the footer.
