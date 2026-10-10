# Follow-ups "problems to check" view — redesign

Redesign of the Follow-ups simple view (`fuSimple`, History → Analytics →
Follow-ups): structure + visuals only. Every filter, count, handler and
`data-testid` is unchanged — no data or behavior changes.

## What changed

1. **One sticky toolbar card** — full-width search first, then three
   *labeled* segmented pill groups (FLOOR / TYPE / STATUS), one "All" per
   group (the old layout repeated "All N" three times with no labels).
   "Remind all shown (N)" is now a compact button in the bar instead of a
   full-width row; Cards|List toggle and Select-all sit in the same bar.
2. **Summary strip** under the title: open · late (alert red `#EE0000`,
   red is alerts-only) · in-process — derived from data already on the page.
3. **Uniform cards, equal heights** — header row (stand name + status chip),
   meta chips (category + age; "Late · Nd" in red when late), description
   clamped to 3 lines, equal-height Before/After pair, fixed footer:
   ✓ Fixed (primary, SDX navy `#2A295C` gradient), Remind, Comment, Edit.
4. **Mobile** — labeled groups stack into horizontally scrollable chip
   rows; cards go single-column with the same anatomy.

Files: `src/App.jsx` (view structure) and `src/App.css` (one appended
"v549" style block). Production build verified (`vite build` passes) and
the view was exercised live against the public demo venue.

## Screenshots (demo venue data only — Riverside Arena, no real venue data)

Taken from the locally run app, before = `main`, after = this redesign.
Image links are temporary (expire 2026-10-12); permanent PNG copies are
committed with the code files when they land (see note below).

- Desktop before: https://muse.ai/files/713233805216437/1510316780855602/twuoe7d74pdynzxqo9rc0t84/before-desktop.png
- Desktop after: https://muse.ai/files/713233805216437/1418219310456117/b6z0lcz0sp7qn6b16w8euyjy/after-desktop.png
- Desktop full page before: https://muse.ai/files/713233805216437/4286236884845539/o2jm4cc1tipcl57buwte4bvw/before-desktop-full.png
- Desktop full page after: https://muse.ai/files/713233805216437/1672538684449498/yiyxxrfwbsjldb0sds4cvdcs/after-desktop-full.png
- Mobile before: https://muse.ai/files/713233805216437/1157127333417229/rlon1ln99ameit688bd2zi2y/before-mobile.png
- Mobile after: https://muse.ai/files/713233805216437/1120708690298217/54ds4fa8awy6erzqss6t1vo8/after-mobile.png
- Mobile full page before: https://muse.ai/files/713233805216437/1442697771293300/e1l98ty9cux2tlnv79qwp3tn/before-mobile-full.png
- Mobile full page after: https://muse.ai/files/713233805216437/2275058970005246/s3j6b0stmz55h7vfich24gb1/after-mobile-full.png

## Landing note (why the two code files are not on this branch yet)

`src/App.jsx` (~2.4 MB) and `src/App.css` (~385 KB) exceed the ~128 KB
per-file limit of the GitHub connector channel available in the build
environment (the same known limit that left the rebrand App patch
pending), so they could not be pushed from there. The finished,
build-verified files + a ready-to-apply patch are staged in the project
workspace (`sdx-problems-view-redesign/`). From any normal checkout:

```bash
git fetch origin ui/problems-view-redesign
git checkout ui/problems-view-redesign
# copy the staged src/App.jsx and src/App.css over, or:
git apply problems-view-redesign.patch
git add src/App.jsx src/App.css docs/pr-screenshots
git commit -m "Redesign Follow-ups problems-to-check view"
git push
```

Do not merge until Joxel gives the launch word.
