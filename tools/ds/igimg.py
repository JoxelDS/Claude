#!/usr/bin/env python3
"""Sandbox helper for DS website previews: pull a business's Instagram logo + post images (URLs from the Make
"DS - IG brand pull" scenario 6552699, one "KEY TYPE URL" line each in u.txt) and either
  MODE=sheet  → o/<S>-logo.jpg (320×320) + o/sheet.jpg (labelled thumbnails of every image / video frame) + logo palette
  MODE=pick   → o/<S>-1..3.jpg (720×900) for PICKS=M2,M4@3.5,M0 (CYS = vertical crop centres, default 0.42)
Run where Instagram's CDN is reachable (the Higgsfield sandbox); return o/ files with sandbox_exec image_paths."""
import subprocess, os, sys
from PIL import Image, ImageOps, ImageDraw
os.makedirs('o', exist_ok=True); S = os.environ['S']; MODE = os.environ['MODE']; PICKS = [p for p in os.environ.get('PICKS', '').split(',') if p]; CYS = os.environ.get('CYS', '').split(',')
cand = {}
for ln in open('u.txt').read().split('\n'):
    if not ln.strip(): continue
    k, typ, url = ln.split(' ', 2); f = f'd_{k}'
    if subprocess.run(['curl', '-sfL', '--max-time', '40', '-o', f, url]).returncode: print('dl fail', k); continue
    if k == 'LOGO':
        im = Image.open(f).convert('RGB'); ImageOps.fit(im, (320, 320)).save(f'o/{S}-logo.jpg', quality=88)
        q = im.resize((96, 96)).quantize(6); pal = q.getpalette()[:18]
        print('palette', [('#%02x%02x%02x' % tuple(pal[i*3:i*3+3]), c) for c, i in sorted(q.getcolors(), reverse=True)]); continue
    if typ == 'VIDEO':
        for t in ('1.2', '3.5', '6'):
            g = f'{f}_{t}.jpg'
            if subprocess.run(['ffmpeg', '-v', 'error', '-y', '-ss', t, '-i', f, '-frames:v', '1', '-q:v', '2', g]).returncode == 0 and os.path.exists(g): cand[f'{k}@{t}'] = g
    else: cand[k] = f
if MODE == 'sheet':
    tw, th = 180, 225; keys = list(cand); cols = 6; rows = (len(keys) + cols - 1) // cols
    sh = Image.new('RGB', (cols * tw, rows * th), (20, 20, 20)); dr = ImageDraw.Draw(sh)
    for n, k in enumerate(keys):
        try: im = ImageOps.fit(Image.open(cand[k]).convert('RGB'), (tw, th))
        except Exception: continue
        x, y = (n % cols) * tw, (n // cols) * th; sh.paste(im, (x, y)); dr.rectangle([x, y, x + 74, y + 18], fill=(0, 0, 0)); dr.text((x + 3, y + 3), k, fill=(255, 255, 0))
    sh.save('o/sheet.jpg', quality=70); print('sheet', keys, os.path.getsize('o/sheet.jpg'))
else:
    for n, k in enumerate(PICKS, 1):
        cy = float(CYS[n - 1]) if n - 1 < len(CYS) and CYS[n - 1] else 0.42
        im = Image.open(cand[k]).convert('RGB'); ImageOps.fit(im, (720, 900), centering=(0.5, cy)).save(f'o/{S}-{n}.jpg', quality=76)
        print(k, im.size, os.path.getsize(f'o/{S}-{n}.jpg'))
