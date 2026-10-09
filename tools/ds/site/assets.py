#!/usr/bin/env python3
"""Build-time asset step for tools/ds/site.mjs. Reads ONE JSON job on stdin, prints ONE JSON result on stdout.

job = {
  "photos": [{"key": "el-bori|0", "src": "/abs/public/p/_img/el-bori-1.jpg"}],
  "pairs":  [{"key": "miamis-finest|0", "src": "/abs/...-1.jpg", "split": "stacked"|"side", "trim": 0.07}],
  "logos":  [{"slug": "el-bori", "src": "/abs/.../el-bori-logo.jpg"}],
  "fonts":  [{"key": "el-bori|D", "src": "/abs/_fonts/shrikhand-400.woff2", "out": "/abs/_fonts/s/shrikhand-400.w400.woff2",
              "axes": "-" | "wght=800" | "wght=400:800", "kind": "sans"|"sans-bold"|"serif"|"serif-bold",
              "sample": "page text for the fallback metrics", "measure": ["El Bori", "Food Truck"], "upper": false, "ls": 0.0}]
}
result = {"photos": {key: info}, "pairs": {key: {"before": {...}, "after": {...}}}, "logos": {slug: {...}}, "fonts": {key: {...}}, "errors": [..]}

Photos: <base>-480.webp / <base>-720.webp written NEXT TO the source jpg (never upscaled), plus an analysis used for art
direction (sharpness, flatness, a seam score for stitched collages, a focal point from edge energy, the brightness of the
lower half for the scrim). Pairs (stacked before/after composites): the seam row is found in the middle band, a trim band
around it is dropped (that is where the watermark sits), and <base>-before.jpg / -after.jpg (+webp) are written.
Logos: <slug>-logo-160.webp, <slug>-logo-320.webp, <slug>-icon-32.png, <slug>-icon-180.png + the logo's corner colour.
Fonts: subset to Latin FIRST, then pin the variable axes (the other order crashed fontTools on some faces), then the
size-adjust / ascent / descent overrides for a local fallback measured on the page's own text, and the em width of each
`measure` string (advance sum / upm + letter-spacing per char) so the generator can fit the name to the width without JS.
Everything is cached by mtime: a rebuild of 8 leads with warm caches takes ~1 s."""
import sys, os, json, io
import numpy as np
from PIL import Image, ImageOps

job = json.load(sys.stdin)
res = {"photos": {}, "pairs": {}, "logos": {}, "fonts": {}, "errors": []}

LATIN = ("U+0000-00FF,U+0131,U+0152-0153,U+02BB-02BC,U+02C6,U+02DA,U+02DC,U+0304,U+0308,U+0329,U+2000-206F,U+20AC,"
         "U+2122,U+2190-2193,U+2212,U+2215,U+2605,U+2726,U+FEFF,U+FFFD")
LOCAL = {
    'sans': ("local('Arial'),local('ArialMT'),local('Liberation Sans'),local('Roboto'),local('Helvetica Neue'),local('Helvetica')",
             '/usr/share/fonts/truetype/liberation/LiberationSans-Regular.ttf'),
    'sans-bold': ("local('Arial Bold'),local('Arial-BoldMT'),local('Liberation Sans Bold'),local('Roboto Bold'),local('Helvetica Neue Bold'),local('Helvetica Bold')",
                  '/usr/share/fonts/truetype/liberation/LiberationSans-Bold.ttf'),
    'serif': ("local('Times New Roman'),local('TimesNewRomanPSMT'),local('Liberation Serif'),local('Noto Serif'),local('Times')",
              '/usr/share/fonts/truetype/liberation/LiberationSerif-Regular.ttf'),
    'serif-bold': ("local('Times New Roman Bold'),local('TimesNewRomanPS-BoldMT'),local('Liberation Serif Bold'),local('Noto Serif Bold'),local('Times Bold')",
                   '/usr/share/fonts/truetype/liberation/LiberationSerif-Bold.ttf'),
}


def fresh(dst, src):
    return os.path.exists(dst) and os.path.getmtime(dst) >= os.path.getmtime(src)


def load_rgb(src):
    return ImageOps.exif_transpose(Image.open(src)).convert("RGB")


def webp_set(im_or_src, base_path, src_mtime_ref, widths=(480, 720), q=74):
    """write <base_path>-<w>.webp for each width (never upscaled); returns [{w, h, file}]"""
    out, im = [], None
    for w in widths:
        dst = f"{base_path}-{w}.webp"
        if not fresh(dst, src_mtime_ref):
            if im is None:
                im = im_or_src if isinstance(im_or_src, Image.Image) else load_rgb(im_or_src)
            ww = min(w, im.width)
            hh = round(im.height * ww / im.width)
            (im if im.width == ww else im.resize((ww, hh), Image.LANCZOS)).save(dst, "WEBP", quality=q, method=6)
        with Image.open(dst) as d:
            out.append({"w": d.width, "h": d.height, "file": os.path.basename(dst), "bytes": os.path.getsize(dst)})
    return out


def analyze(im):
    W, H = im.size
    g = np.asarray(im.resize((240, max(1, round(240 * H / W))), Image.BILINEAR)).astype(np.float32) @ np.array([0.299, 0.587, 0.114], dtype=np.float32)
    full = np.asarray(im).astype(np.float32) @ np.array([0.299, 0.587, 0.114], dtype=np.float32)
    rd = np.abs(np.diff(full, axis=0)).mean(1)
    cd = np.abs(np.diff(full, axis=1)).mean(0)
    seam = float(max(rd.max() / (np.median(rd) + 1e-3), cd.max() / (np.median(cd) + 1e-3)))
    bs = 12
    h, w = full.shape
    blk = full[: h // bs * bs, : w // bs * bs].reshape(h // bs, bs, w // bs, bs).std((1, 3))
    flat = float((blk < 3.0).mean())
    gm = np.abs(np.diff(full, axis=0))[:, :-1] + np.abs(np.diff(full, axis=1))[:-1, :]
    sharp = float(gm.mean())
    e = np.abs(np.diff(g, axis=0))[:, :-1] + np.abs(np.diff(g, axis=1))[:-1, :]
    gh, gw = e.shape
    ys, xs = np.mgrid[0:gh, 0:gw]
    prior = np.exp(-(((xs / gw - 0.5) / 0.32) ** 2 + ((ys / gh - 0.45) / 0.36) ** 2))
    wgt = (e ** 1.5) * prior
    s = wgt.sum() + 1e-6
    fx = min(0.72, max(0.28, float((wgt * xs).sum() / s / gw)))
    fy = min(0.70, max(0.25, float((wgt * ys).sum() / s / gh)))
    collage = seam > 12
    a = np.asarray(im.resize((60, max(1, round(60 * H / W))))).astype(np.float32)
    mx, mn = a.max(2), a.min(2)
    colorful = float(((mx - mn) / (mx + 1e-3)).mean())
    lower = g[int(g.shape[0] * 0.55):]
    return {"w": W, "h": H, "seam": round(seam, 1), "flat": round(flat, 3), "sharp": round(sharp, 1),
            "focus": [round(fx, 3), round(fy, 3)], "lum": round(float(g.mean())), "botLum": round(float(lower.mean())),
            "topLum": round(float(g[: int(g.shape[0] * 0.18)].mean())), "collage": bool(collage),
            "colorful": round(colorful, 3),
            "score": round(sharp * (1 - flat) * (0.15 if collage else 1.0) * (0.6 + colorful), 2),
            # relative luminance of the bright 10% of the lower half (for the white-text scrim)
            "p90Bot": round(float(((np.percentile(lower, 90) / 255.0) ** 2.2)), 4)}


for p in job.get("photos", []):
    try:
        src = p["src"]
        base = os.path.splitext(src)[0]
        im = load_rgb(src)
        info = analyze(im)
        info["webp"] = webp_set(im, base, src)
        info["base"] = os.path.basename(base)
        res["photos"][p["key"]] = info
    except Exception as ex:
        res["errors"].append(f"photo {p.get('src')}: {ex}")

for p in job.get("pairs", []):
    try:
        src = p["src"]
        base = os.path.splitext(src)[0]
        im = load_rgb(src)
        W, H = im.size
        full = np.asarray(im).astype(np.float32) @ np.array([0.299, 0.587, 0.114], dtype=np.float32)
        side = p.get("split") == "side"
        prof = np.abs(np.diff(full, axis=1 if side else 0)).mean(0 if side else 1)
        n = len(prof)
        lo, hi = int(n * 0.38), int(n * 0.62)
        cut = p.get("cut")
        cut = int(cut * n) if cut else lo + int(np.argmax(prof[lo:hi]))
        t = int((p.get("trim", 0.07)) * n)
        boxes = ((0, 0, max(1, cut - t), H), (min(W - 1, cut + t), 0, W, H)) if side else ((0, 0, W, max(1, cut - t)), (0, min(H - 1, cut + t), W, H))
        names = ("before", "after") if not p.get("reverse") else ("after", "before")
        out = {"cut": round(cut / n, 3)}
        for nm, box in zip(names, boxes):
            dst = f"{base}-{nm}.jpg"
            part = im.crop(box)
            if not fresh(dst, src):
                part.save(dst, "JPEG", quality=84, optimize=True, progressive=True)
            out[nm] = {"base": os.path.basename(f"{base}-{nm}"), "w": part.width, "h": part.height,
                       "webp": webp_set(part, f"{base}-{nm}", src), "info": analyze(part)}
        res["pairs"][p["key"]] = out
    except Exception as ex:
        res["errors"].append(f"pair {p.get('src')}: {ex}")

for L in job.get("logos", []):
    try:
        src, slug = L["src"], L["slug"]
        d = os.path.dirname(src)
        im = None
        for name, size, fmt in ((f"{slug}-logo-160.webp", 160, "WEBP"), (f"{slug}-logo-320.webp", 320, "WEBP"),
                                (f"{slug}-icon-32.png", 32, "PNG"), (f"{slug}-icon-180.png", 180, "PNG")):
            dst = os.path.join(d, name)
            if fresh(dst, src):
                continue
            if im is None:
                im = load_rgb(src)
            t = ImageOps.fit(im, (size, size), Image.LANCZOS)
            if fmt == "WEBP":
                t.save(dst, "WEBP", quality=84, method=6)
            else:
                t.quantize(colors=128).save(dst, optimize=True)
        im = load_rgb(src)
        a = np.asarray(im.resize((64, 64))).astype(np.float32)
        corner = np.concatenate([a[:5, :5].reshape(-1, 3), a[:5, -5:].reshape(-1, 3), a[-5:, :5].reshape(-1, 3), a[-5:, -5:].reshape(-1, 3)])
        cm = corner.mean(0)
        spread = float(corner.std(0).mean())
        res["logos"][slug] = {"corner": "#%02x%02x%02x" % tuple(int(c) for c in cm), "cornerFlat": spread < 12, "w": im.width, "h": im.height}
    except Exception as ex:
        res["errors"].append(f"logo {L.get('src')}: {ex}")

# ---------------------------------------------------------------- fonts
_tt = {}


def vmetrics(font):
    upm = font['head'].unitsPerEm
    os2, hhea = font['OS/2'], font['hhea']
    if os2.fsSelection & (1 << 7):
        return upm, os2.sTypoAscender, os2.sTypoDescender, os2.sTypoLineGap
    return upm, hhea.ascent, hhea.descent, hhea.lineGap


def adv(font, s):
    upm = font['head'].unitsPerEm
    cmap, hmtx = font.getBestCmap(), font['hmtx']
    w = 0
    for ch in s:
        g = cmap.get(ord(ch)) or cmap.get(ord(ch.upper())) or cmap.get(0x20)
        if g:
            w += hmtx[g][0]
    return w / upm


def avg_adv(font, sample):
    cmap = font.getBestCmap()
    chars = [c for c in sample if cmap.get(ord(c))]
    return adv(font, ''.join(chars)) / max(1, len(chars))


def build_font(spec):
    from fontTools.ttLib import TTFont
    from fontTools import subset
    from fontTools.varLib import instancer
    src, out, axes = spec['src'], spec['out'], spec.get('axes', '-')
    os.makedirs(os.path.dirname(out), exist_ok=True)
    if not fresh(out, src):
        f = TTFont(src)
        o = subset.Options()
        o.flavor = 'woff2'
        o.layout_features = ['kern', 'liga', 'calt', 'ccmp', 'locl', 'mark', 'mkmk', 'case', 'tnum', 'lnum', 'pnum']
        o.name_IDs = ['*']
        o.notdef_outline = True
        s = subset.Subsetter(o)
        s.populate(unicodes=subset.parse_unicodes(LATIN))
        s.subset(f)
        if 'fvar' in f and axes != '-':
            lim = {}
            for part in axes.split(','):
                k, v = part.split('=')
                lim[k] = tuple(float(x) for x in v.split(':')) if ':' in v else float(v)
            f = instancer.instantiateVariableFont(f, lim)
        f.flavor = 'woff2'
        f.save(out)
    if out not in _tt:
        _tt[out] = TTFont(out)
    f = _tt[out]
    upm, asc, desc, gap = vmetrics(f)
    fbname, fbfile = LOCAL[spec.get('kind', 'sans')]
    fb = TTFont(fbfile)
    sample = spec.get('sample') or 'The quick brown fox jumps over the lazy dog'
    adj = avg_adv(f, sample) / max(1e-6, avg_adv(fb, sample))
    adj = max(0.6, min(1.6, adj))
    pct = lambda v: f"{v * 100:.2f}%"
    ls = float(spec.get('ls', 0) or 0)
    widths = {}
    for m in spec.get('measure', []):
        t = m.upper() if spec.get('upper') else m
        widths[m] = round(adv(f, t) + ls * len(t), 4)
    return {'out': out, 'bytes': os.path.getsize(out), 'local': fbname,
            'fallback': f"size-adjust:{pct(adj)};ascent-override:{pct(asc / upm / adj)};descent-override:{pct(abs(desc) / upm / adj)};line-gap-override:{pct(gap / upm / adj)}",
            'widths': widths, 'asc': round(asc / upm, 3), 'desc': round(abs(desc) / upm, 3)}


for spec in job.get("fonts", []):
    try:
        res["fonts"][spec["key"]] = build_font(spec)
    except Exception as ex:
        res["errors"].append(f"font {spec.get('src')}: {str(ex)[:200]}")

print(json.dumps(res))
