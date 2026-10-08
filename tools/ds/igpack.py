#!/usr/bin/env python3
"""Sandbox side: pack the picked photos (720×900) and logos (320×320) from o/ into a few big JPEGs, because the sandbox is
shared with other jobs (one of them can reset it at any time) and image_paths returns at most 4 files / 512 KiB per call.
  python3 igpack.py o packs   → packs/p1.jpg … (2×2 photos, q78) + packs/l1.jpg … (4×4 logos) + packs/manifest.txt
Unpack in the build container with tools/ds/igunpack.py (tiles are cut back out at exact pixel positions)."""
import os, sys
from PIL import Image
src, out = sys.argv[1], sys.argv[2]
os.makedirs(out, exist_ok=True)
files = sorted(f for f in os.listdir(src) if f.endswith('.jpg') and 'sheet' not in f)
photos = [f for f in files if not f.endswith('-logo.jpg')]
logos = [f for f in files if f.endswith('-logo.jpg')]
man = []
def pack(names, tw, th, cols, rows, prefix, q):
    per = cols * rows
    for i in range(0, len(names), per):
        chunk = names[i:i + per]
        sheet = Image.new('RGB', (tw * cols, th * rows), 'white')
        for j, n in enumerate(chunk):
            im = Image.open(os.path.join(src, n)).convert('RGB')
            if im.size != (tw, th):
                im = im.resize((tw, th), Image.LANCZOS)
            sheet.paste(im, ((j % cols) * tw, (j // cols) * th))
            man.append(f'{prefix}{i // per + 1}.jpg {j % cols * tw} {j // cols * th} {tw} {th} {n}')
        sheet.save(os.path.join(out, f'{prefix}{i // per + 1}.jpg'), quality=q)
pack(photos, 720, 900, 2, 2, 'p', 80)
pack(logos, 320, 320, 4, 4, 'l', 85)
open(os.path.join(out, 'manifest.txt'), 'w').write('\n'.join(man) + '\n')
for f in sorted(os.listdir(out)):
    print('PACK', f, os.path.getsize(os.path.join(out, f)))
print('MANIFEST'); print('\n'.join(man))
