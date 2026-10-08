#!/usr/bin/env python3
"""Run in the Higgsfield sandbox (Instagram's CDN is reachable there, not from the build container).
Input u.txt: one line per media — "KEY TYPE LIKES URL" (KEY LOGO for the profile picture; TYPE IMAGE|VIDEO|CAROUSEL_ALBUM).
Picks the 3 best photos automatically and writes o/<S>-1..3.jpg (720×900, q72) + o/<S>-logo.jpg (320×320), printing
"FILE <name> <bytes>" lines so the files can be matched after they come back through image_paths, plus the logo palette.

v2 (2026-10-08): Reels carry burned-in subtitles ("No se puede dar un buen servicio en Miami 😱"), which look sloppy on a
website. Every candidate is read with OCR (rapidocr, installed on first run); a video gives 8 frames spread over its length,
the 4:5 crop slides up/down to dodge the text, and a video frame that still shows text is dropped (photos with a little text —
a sign, a logo — are only penalised). Candidates are scored by likes, size, exposure and how little text they show;
one photo per post first, near-duplicates skipped."""
import os, subprocess, sys
from PIL import Image, ImageOps, ImageStat, ImageFilter
S = os.environ['S']
os.makedirs('o', exist_ok=True)
try:
    from rapidocr_onnxruntime import RapidOCR
except ImportError:
    subprocess.run([sys.executable, '-m', 'pip', 'install', '-q', 'rapidocr_onnxruntime'], check=False)
    try:
        from rapidocr_onnxruntime import RapidOCR
    except ImportError:
        RapidOCR = None
ocr = RapidOCR() if RapidOCR else None


def text_boxes(path):
    """[(x0, y0, x1, y1)] of text found in the image (in its own pixels); [] when OCR is not available."""
    if not ocr:
        return []
    try:
        res, _ = ocr(path)
    except Exception:
        return []
    out = []
    for box, txt, conf in res or []:
        if float(conf) < 0.5 or len(str(txt).strip()) < 2:
            continue
        xs, ys = [p[0] for p in box], [p[1] for p in box]
        out.append((min(xs), min(ys), max(xs), max(ys)))
    return out


def best_crop(im, boxes):
    """4:5 crop (as a box) that overlaps the least text; returns (box, fraction of the crop covered by text)."""
    w, h = im.size
    cw, ch = (w, int(w * 5 / 4)) if h * 4 >= w * 5 else (int(h * 4 / 5), h)
    best = None
    steps = 12
    for i in range(steps + 1):
        x0 = int((w - cw) * (0.5 if cw == w else i / steps))
        y0 = int((h - ch) * (i / steps if cw == w else 0.5))
        x1, y1 = x0 + cw, y0 + ch
        cover = 0
        for bx0, by0, bx1, by1 in boxes:
            ix = max(0, min(x1, bx1) - max(x0, bx0))
            iy = max(0, min(y1, by1) - max(y0, by0))
            cover += ix * iy
        key = cover / (cw * ch) + abs(i / steps - 0.42) * 0.002   # tie-break: a little above the middle (faces, food)
        if best is None or key < best[0]:
            best = (key, (x0, y0, x1, y1), cover / (cw * ch))
    return best[1], best[2]


def duration(f):
    r = subprocess.run(['ffprobe', '-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', f], capture_output=True, text=True)
    try:
        return float(r.stdout.strip())
    except ValueError:
        return 6.0


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
        d = duration(f)
        for j in range(8):
            t = max(0.3, min(d - 0.3, 0.4 + (d - 0.8) * j / 7))
            g = f'{f}_{j}.jpg'
            if subprocess.run(['ffmpeg', '-v', 'error', '-y', '-ss', f'{t:.2f}', '-i', f, '-frames:v', '1', '-q:v', '2', g]).returncode == 0 and os.path.exists(g):
                srcs.append((g, True))
    else:
        srcs.append((f, False))
    for g, isvid in srcs:
        try:
            im = Image.open(g).convert('RGB')
        except Exception:
            continue
        crop, textfrac = best_crop(im, text_boxes(g))
        if isvid and textfrac > 0.004:          # subtitles / stickers left in the crop → not usable on a website
            continue
        cim = im.crop(crop)
        small = cim.resize((160, 200))
        st = ImageStat.Stat(small.convert('L'))
        mean, sd = st.mean[0], st.stddev[0]
        sharp = ImageStat.Stat(small.convert('L').filter(ImageFilter.FIND_EDGES)).mean[0]
        ok = min(cim.size) >= 480 and 35 < mean < 225 and sd > 28
        lk = int(likes) if likes.isdigit() else 0
        score = (lk + 5) * (0.6 if isvid else 1.0) * (1.0 if ok else 0.15) * (0.8 if sharp > 38 else 1.0) * max(0.1, 1 - textfrac * 8)
        thumb = small.resize((16, 20)).convert('L')
        items.append({'k': k, 'g': g, 'crop': crop, 'score': score, 'text': round(textfrac, 4), 'thumb': list(thumb.tobytes())})
items.sort(key=lambda x: -x['score'])
picked = []
near = lambda it: any(sum(abs(a - b) for a, b in zip(it['thumb'], p['thumb'])) / 320 < 14 for p in picked)
for distinct in (True, False):  # first one photo per post (two frames of one video look alike), then fill up
    for it in items:
        if len(picked) == 3:
            break
        if it in picked or near(it) or (distinct and any(p['k'] == it['k'] for p in picked)):
            continue
        picked.append(it)
for n, it in enumerate(picked, 1):
    Image.open(it['g']).convert('RGB').crop(it['crop']).resize((720, 900), Image.LANCZOS).save(f'o/{S}-{n}.jpg', quality=72)
for fn in sorted(os.listdir('o')):
    print('FILE', fn, os.path.getsize('o/' + fn))
print('PICKED', [(p['k'], round(p['score']), p['text']) for p in picked], 'of', len(items), 'ocr' if ocr else 'NO-OCR')
