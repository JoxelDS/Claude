#!/usr/bin/env python3
"""Run in the Higgsfield sandbox (Instagram's CDN is reachable there, not from the build container).
Input u.txt: one line per media — "KEY TYPE LIKES URL" (KEY LOGO for the profile picture; TYPE IMAGE|VIDEO|CAROUSEL_ALBUM).
Picks the 3 best photos automatically: liked most, sharp enough, not too dark / washed out, not near-duplicates, prefers
photos over video frames; writes o/<S>-1..3.jpg (720×900, q72) + o/<S>-logo.jpg (320×320) and prints
"FILE <name> <bytes>" lines so the files can be matched after they come back through image_paths, plus the logo palette."""
import os, subprocess, sys
from PIL import Image, ImageOps, ImageStat, ImageFilter
S = os.environ['S']
os.makedirs('o', exist_ok=True)
items = []
for ln in open('u.txt').read().split('\n'):
    ln = ln.strip()
    if not ln:
        continue
    k, typ, likes, url = ln.split(' ', 3)
    f = f'd_{k}'
    if subprocess.run(['curl', '-sfL', '--max-time', '30', '-o', f, url]).returncode:
        print('dl fail', k)
        continue
    if k == 'LOGO':
        im = Image.open(f).convert('RGB')
        ImageOps.fit(im, (320, 320)).save(f'o/{S}-logo.jpg', quality=85)
        q = im.resize((96, 96)).quantize(6)
        pal = q.getpalette()[:18]
        print('PALETTE', [('#%02x%02x%02x' % tuple(pal[i * 3:i * 3 + 3]), c) for c, i in sorted(q.getcolors(), reverse=True)])
        continue
    srcs = []
    if typ == 'VIDEO':
        for t in ('1.5', '4'):
            g = f'{f}_{t}.jpg'
            if subprocess.run(['ffmpeg', '-v', 'error', '-y', '-ss', t, '-i', f, '-frames:v', '1', '-q:v', '2', g]).returncode == 0 and os.path.exists(g):
                srcs.append((g, True))
    else:
        srcs.append((f, False))
    for g, isvid in srcs:
        try:
            im = Image.open(g).convert('RGB')
        except Exception:
            continue
        w, h = im.size
        small = im.resize((160, 200))
        st = ImageStat.Stat(small.convert('L'))
        mean, sd = st.mean[0], st.stddev[0]
        sharp = ImageStat.Stat(small.convert('L').filter(ImageFilter.FIND_EDGES)).mean[0]
        ok = min(w, h) >= 480 and 35 < mean < 225 and sd > 28
        score = (int(likes) if likes.isdigit() else 0) * (0.6 if isvid else 1.0) * (1.0 if ok else 0.15) * (0.8 if sharp > 38 else 1.0)  # very busy edges ≈ text-heavy flyers
        thumb = small.resize((16, 20)).convert('L')
        items.append({'k': k, 'g': g, 'score': score, 'thumb': list(thumb.getdata())})
items.sort(key=lambda x: -x['score'])
picked = []
for it in items:
    if any(sum(abs(a - b) for a, b in zip(it['thumb'], p['thumb'])) / 320 < 14 for p in picked):
        continue
    picked.append(it)
    if len(picked) == 3:
        break
for n, it in enumerate(picked, 1):
    im = Image.open(it['g']).convert('RGB')
    ImageOps.fit(im, (720, 900), centering=(0.5, 0.42)).save(f'o/{S}-{n}.jpg', quality=72)
for fn in sorted(os.listdir('o')):
    print('FILE', fn, os.path.getsize('o/' + fn))
print('PICKED', [(p['k'], round(p['score'])) for p in picked], 'of', len(items))
