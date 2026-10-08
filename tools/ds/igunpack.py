#!/usr/bin/env python3
"""Build-container side of igpack.py: python3 tools/ds/igunpack.py <manifest.txt> <dir with the returned packs> <out dir>.
The returned packs are matched by file size (the PACK lines) — pass them as name=path pairs in the manifest dir, i.e. copy each
returned mcp-higgfield-blob file to <dir>/<pack name> first. Writes <out>/<original name> at q82."""
import os, sys
from PIL import Image
man, d, out = sys.argv[1:4]
os.makedirs(out, exist_ok=True)
for ln in open(man):
    p = ln.split()
    if len(p) != 6:
        continue
    pk, x, y, w, h, name = p[0], *map(int, p[1:5]), p[5]
    f = os.path.join(d, pk)
    if not os.path.exists(f):
        print('MISSING pack', pk, name); continue
    Image.open(f).convert('RGB').crop((x, y, x + w, y + h)).save(os.path.join(out, name), quality=82)
    print('ok', name)
