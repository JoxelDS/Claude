#!/usr/bin/env python3
"""Hide what identifies the venue in a POV clip, keep its audio, and write contact sheets of the RESULT so a person
(or Claude) can check nothing identifying is left.

python3 -I povblur.py IN.mp4 OUT.mp4 --ffmpeg PATH [--boxes boxes.json] [--no-faces] [--app-bar] [--app-bar-style brand|blur]
                      [--brand-logo lockup.png] [--sheet DIR] [--report faces.json]

Faces (YuNet, every frame, held across misses) and manual boxes get a soft frosted blur with feathered edges.

--app-bar  finds the SDX app's navy header bar wherever it is on screen (on the home venue it carries the employer's logo,
           the "Inspecting STAND" line under it and the browser tab title above it). Navy components are cut into
           horizontal bands by row fill (so a header touching the iPad's navy case still yields the header band), bands of
           one header are merged, and only bands with the app's light screen right under them count as the app.
           style brand (default): the bar's tilt is fitted (PCA of its pixels), smoothed over time, and a clean SDX
           Inspect bar (navy, logo from --brand-logo) is painted over the header and the stand line, down to the
           "Scan stand QR" bar; the browser tab text above gets a frosted blur.
           style blur: the old padded frosted blur over the whole area.
           Other navy things (tubs, stickers) and a full navy page (sign-in screen) only get the frosted blur.

boxes.json = [{"t0": 1.2, "t1": 3.4, "x": 0.1, "y": 0.2, "w": 0.3, "h": 0.1}, ...]  (x/y/w/h are 0..1 of the frame)
"""
import argparse, json, math, os, subprocess, sys
import cv2
import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
ap = argparse.ArgumentParser()
ap.add_argument('inp'); ap.add_argument('out')
ap.add_argument('--ffmpeg', required=True)
ap.add_argument('--boxes', default='')
ap.add_argument('--no-faces', action='store_true')
ap.add_argument('--sheet', default='')
ap.add_argument('--report', default='')
ap.add_argument('--score', type=float, default=0.55)
ap.add_argument('--hold', type=int, default=10, help='frames a face box stays after the detector loses it')
ap.add_argument('--fps', type=float, default=0, help='frame rate of the input (povcut normalizes to 30; OpenCV misreads some files)')
ap.add_argument('--app-bar', action='store_true', help='cover / blur the app header bar (navy) wherever it shows')
ap.add_argument('--app-bar-style', default='brand', choices=['brand', 'blur'])
ap.add_argument('--brand-logo', default='', help='white SDX lockup PNG with alpha (povcut renders it)')
ap.add_argument('--debug', default='', help='write a few annotated frames here')
a = ap.parse_args()

cap = cv2.VideoCapture(a.inp)
if not cap.isOpened():
    sys.exit('cannot open ' + a.inp)
fps = a.fps or cap.get(cv2.CAP_PROP_FPS) or 30.0
W = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH)); H = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
manual = json.load(open(a.boxes)) if a.boxes and os.path.exists(a.boxes) else []

det = None
if not a.no_faces:
    DW = 640; DH = int(round(H * DW / W))
    det = cv2.FaceDetectorYN.create(os.path.join(HERE, 'models', 'yunet.onnx'), '', (DW, DH), a.score, 0.3, 5000)
    prof = None   # OpenCV 5 dropped CascadeClassifier from the main module; use it only where it exists
    if hasattr(cv2, 'CascadeClassifier') and hasattr(cv2, 'data'):
        prof = cv2.CascadeClassifier(os.path.join(cv2.data.haarcascades, 'haarcascade_profileface.xml'))

LOGO = None
if a.brand_logo and os.path.exists(a.brand_logo):
    LOGO = cv2.imread(a.brand_logo, cv2.IMREAD_UNCHANGED)
    if LOGO is not None and LOGO.shape[2] == 3:
        LOGO = np.dstack([LOGO, np.full(LOGO.shape[:2], 255, np.uint8)])
NAVY_A, NAVY_B = np.array([0x5C, 0x29, 0x2A], np.float32), np.array([0x97, 0x38, 0x28], np.float32)   # BGR #2A295C → #283897 (app header)
PAPER = np.array([0xFB, 0xF6, 0xF4], np.float32)                                                    # BGR #F4F6FB (app background)

ff = subprocess.Popen([a.ffmpeg, '-y', '-loglevel', 'error', '-f', 'rawvideo', '-pix_fmt', 'bgr24', '-s', f'{W}x{H}', '-r', f'{fps}', '-i', '-',
                       '-i', a.inp, '-map', '0:v', '-map', '1:a?', '-c:v', 'libx264', '-preset', 'medium', '-crf', '17', '-pix_fmt', 'yuv420p',
                       '-c:a', 'copy', '-shortest', a.out], stdin=subprocess.PIPE)


def frost(img, x, y, w, h, strength=1.0, poly=None):
    """Soft frosted blur with feathered edges over a box (or a polygon inside it). Strong enough that text and logos are
    unreadable, smooth enough not to look like a censor block."""
    pad = int(max(w, h) * 0.12) + 6
    x0, y0 = max(0, int(x) - pad), max(0, int(y) - pad); x1, y1 = min(W, int(x + w) + pad), min(H, int(y + h) + pad)
    if x1 - x0 < 6 or y1 - y0 < 6:
        return
    roi = img[y0:y1, x0:x1].astype(np.float32)
    sig = max(7.0, min(w, h) * 0.20 * strength)
    small = cv2.resize(roi, (max(2, (x1 - x0) // 6), max(2, (y1 - y0) // 6)), interpolation=cv2.INTER_AREA)
    small = cv2.GaussianBlur(small, (0, 0), max(1.2, sig / 6))
    bl = cv2.resize(small, (x1 - x0, y1 - y0), interpolation=cv2.INTER_LINEAR)
    bl = cv2.GaussianBlur(bl, (0, 0), max(2.0, sig * 0.35))
    bl = bl * 0.92 + cv2.cvtColor(cv2.cvtColor(bl.astype(np.uint8), cv2.COLOR_BGR2GRAY), cv2.COLOR_GRAY2BGR).astype(np.float32) * 0.08
    m = np.zeros((y1 - y0, x1 - x0), np.float32)
    if poly is not None:
        cv2.fillConvexPoly(m, np.round(np.asarray(poly) - [x0, y0]).astype(np.int32), 1.0, cv2.LINE_AA)
    else:
        r = int(min(w, h) * 0.18)
        bx0, by0, bx1, by1 = int(x) - x0, int(y) - y0, int(x + w) - x0, int(y + h) - y0
        cv2.rectangle(m, (bx0 + r, by0), (bx1 - r, by1), 1.0, -1); cv2.rectangle(m, (bx0, by0 + r), (bx1, by1 - r), 1.0, -1)
        for cx, cy in ((bx0 + r, by0 + r), (bx1 - r, by0 + r), (bx0 + r, by1 - r), (bx1 - r, by1 - r)):
            cv2.circle(m, (cx, cy), r, 1.0, -1)
    fe = max(2.0, min(w, h) * 0.06)
    m = cv2.GaussianBlur(m, (0, 0), fe)[..., None]
    img[y0:y1, x0:x1] = np.clip(roi * (1 - m) + bl * m, 0, 255).astype(np.uint8)


def navy_groups(frame, DW=360):
    """App bars and other navy things in this frame.
    Returns (bars, others): bars = [{c, e1, e2, u0, u1, v0, vh, vb}] in frame px (c = centre, e1 along the bar, e2 down,
    u/v = coordinates along e1/e2: header from v0 to vh, the cover stops at vb = top of the Scan-stand-QR bar or under the
    stand line); others = [[x, y, w, h]] boxes that only get the frosted blur."""
    s = W / DW; DH2 = int(round(H / s))
    small = cv2.resize(frame, (DW, DH2), interpolation=cv2.INTER_AREA)
    hsv = cv2.cvtColor(small, cv2.COLOR_BGR2HSV)
    m = cv2.inRange(hsv, (102, 115, 70), (132, 255, 228))   # V ≤ 228: a white screen under purple light can look 'navy'
    m = cv2.morphologyEx(m, cv2.MORPH_CLOSE, cv2.getStructuringElement(cv2.MORPH_RECT, (11, 3)))
    n, lab, st, _ = cv2.connectedComponentsWithStats(m)
    bands, others = [], []
    for i in range(1, n):
        x, y, w, h, ar = st[i]
        if w < 0.07 * DW or ar < 30:
            continue
        if ar >= 0.5 * w * h and h > 0.12 * DH2:          # a solid navy page (sign-in screen, side menu)
            others.append([x * s, y * s, w * s, h * s]); continue
        sub = (lab[y:y + h, x:x + w] == i)
        full = sub.sum(1) >= max(0.3 * w, 0.05 * DW)
        r = 0
        while r < h:
            if not full[r]:
                r += 1; continue
            r0 = r
            while r < h and (full[r] or (r + 1 < h and full[r + 1]) or (r + 2 < h and full[r + 2])):
                r += 1
            cols = np.where(sub[r0:r].sum(0) >= max(1, 0.4 * (r - r0)))[0]
            if len(cols):
                bx0, bx1 = cols[0], cols[-1] + 1
                bw, bh = bx1 - bx0, r - r0
                if bw >= 0.07 * DW and bh <= 0.6 * bw:
                    pts = np.argwhere(sub[r0:r, bx0:bx1])[:, ::-1].astype(np.float32) + [x + bx0, y + r0]
                    bands.append({'box': [x + bx0, y + r0, bw, bh], 'pts': pts})
    # merge pieces of one band that sit side by side (glare / tilt splits the header)
    merged = True
    while merged and len(bands) > 1:
        merged = False
        for i in range(len(bands)):
            for j in range(i + 1, len(bands)):
                A, B = bands[i]['box'], bands[j]['box']
                xo = min(A[0] + A[2], B[0] + B[2]) - max(A[0], B[0])
                yo = min(A[1] + A[3], B[1] + B[3]) - max(A[1], B[1])
                if yo > 0.4 * min(A[3], B[3]) and -xo < 0.08 * DW:
                    x0, y0 = min(A[0], B[0]), min(A[1], B[1])
                    bands[i] = {'box': [x0, y0, max(A[0] + A[2], B[0] + B[2]) - x0, max(A[1] + A[3], B[1] + B[3]) - y0],
                                'pts': np.vstack([bands[i]['pts'], bands[j]['pts']])}
                    bands.pop(j); merged = True; break
            if merged:
                break
    bands.sort(key=lambda b: b['box'][1])
    used = [False] * len(bands)
    bars = []
    for i, b in enumerate(bands):
        if used[i]:
            continue
        x, y, w, h = b['box']
        pts = b['pts']
        if len(pts) < 20:
            used[i] = True; others.append([x * s, y * s, w * s, h * s]); continue
        c = pts.mean(0)
        cov = np.cov((pts - c).T)
        ev, evec = np.linalg.eigh(cov)
        e1 = evec[:, 1]
        if e1[0] < 0:
            e1 = -e1
        ang = math.degrees(math.atan2(e1[1], e1[0]))
        if abs(ang) > 30:   # not a horizontal bar
            used[i] = True; others.append([x * s, y * s, w * s, h * s]); continue
        e2 = np.array([-e1[1], e1[0]])
        uv = np.stack([(pts - c) @ e1, (pts - c) @ e2], 1)
        u0, u1 = np.percentile(uv[:, 0], [1, 99]); v0, vh = np.percentile(uv[:, 1], [1, 99])
        hh = max(vh - v0, 1.0)
        # the app header (and the scan bar) carry white letters along their middle; the iPad's navy case edge has none
        wt = 0; nt = 0
        for f in np.linspace(0.02, 0.98, 60):
            for fv in (0.35, 0.5, 0.65):
                p = c + e1 * (u0 + (u1 - u0) * f) + e2 * (v0 + (vh - v0) * fv)
                px, py = int(round(p[0])), int(round(p[1]))
                if 0 <= px < DW and 0 <= py < DH2:
                    hv = hsv[py, px]; nt += 1; wt += (hv[2] >= 185 and hv[1] <= 75) or ((hv[0] <= 8 or hv[0] >= 170) and hv[1] >= 120)
        if nt == 0 or wt < 0.02 * nt:
            used[i] = True; continue      # a bare navy edge (case, bezel): not ours to cover
        # is the app's light screen right under it? (the form is near-white / lavender)
        probe = []
        for f in np.linspace(0.08, 0.92, 9):
            for dv in (1.6, 2.4, 3.2):
                p = c + e1 * (u0 + (u1 - u0) * f) + e2 * (vh + dv * hh)
                px, py = int(p[0]), int(p[1])
                if 0 <= px < DW and 0 <= py < DH2:
                    hv = hsv[py, px]; probe.append(hv[2] >= 185 and hv[1] <= 80)
        if not probe or sum(probe) < 0.55 * len(probe):
            used[i] = True; others.append([x * s, y * s, w * s, h * s]); continue
        used[i] = True
        # the app header runs edge to edge across the screen: find the screen's sides from the light form under it
        # (glare or the logo can make the navy detection stop short of the ends)
        def light(px, py):
            if not (0 <= px < DW and 0 <= py < DH2):
                return None
            hv = hsv[py, px]; return hv[2] >= 165 and hv[1] <= 95
        ext = []
        for dv in (1.8, 2.5, 3.2):
            row = []
            for sign in (-1, 1):
                u = (u0 + u1) / 2; miss = 0; last = u; edge = None
                while abs(u - (u0 + u1) / 2) < 1.6 * (u1 - u0) + 10:
                    p = c + e1 * u + e2 * (vh + dv * hh)
                    ok = light(int(p[0]), int(p[1]))
                    if ok is None:
                        edge = u; break      # ran off the frame: the screen goes on past it
                    if ok:
                        last = u; miss = 0
                    else:
                        miss += 1
                        if miss >= max(6, 0.04 * DW):   # letters are short dark runs; the iPad bezel is a long one
                            edge = last; break
                    u += sign
                row.append(edge if edge is not None else last)
            ext.append(row)
        if ext:
            uL = float(np.median([r[0] for r in ext])); uR = float(np.median([r[1] for r in ext]))
            if uR - uL > 0.6 * (u1 - u0):
                u0, u1 = min(u0, uL), max(u1, uR)
        # the next band under it (the Scan-stand-QR bar) marks where the cover stops
        vb = vh + 0.9 * hh; vs = None
        for j in range(i + 1, len(bands)):
            if used[j]:
                continue
            q = bands[j]['pts']
            qv = (q - c) @ e2; qu = (q - c) @ e1
            top = np.percentile(qv, 2)
            ovl = min(u1, np.percentile(qu, 99)) - max(u0, np.percentile(qu, 1))
            if ovl > 0.3 * (u1 - u0) and vh < top < vh + 8.0 * hh:
                vb = top - 0.08 * hh; vs = np.percentile(qv, 98)
                used[j] = True   # the scan bar itself stays as it is (it carries our own words)
                break
        if (vh - v0) > 0.11 * (u1 - u0) or (vb - v0) > 0.3 * (u1 - u0):   # far thicker than the app header (a dimmed page, a dialog): frost
            others.append([(c[0] + e1[0] * u0) * s, (c[1] + v0 - hh) * s, (u1 - u0) * s, (vb - v0 + 2 * hh) * s]); continue
        if (u1 - u0) < 0.2 * DW:   # a small, far-away iPad: our bar would look like a sticker — frost it instead
            others.append([(c[0] + e1[0] * u0) * s - 0.05 * W, (c[1] + v0 - 2 * hh) * s, (u1 - u0) * s + 0.1 * W, (vb - v0 + 2 * hh) * s]); continue
        bars.append({'c': c * s, 'e1': e1, 'e2': e2, 'u0': u0 * s, 'u1': u1 * s, 'v0': v0 * s, 'vh': vh * s, 'vb': vb * s,
                     'vs': None if vs is None else vs * s})
    return bars, others


def quad(b, v0, v1, padu=0.03):
    L = b['u1'] - b['u0']; u0, u1 = b['u0'] - padu * L, b['u1'] + padu * L
    c, e1, e2 = b['c'], b['e1'], b['e2']
    return np.array([c + e1 * u0 + e2 * v0, c + e1 * u1 + e2 * v0, c + e1 * u1 + e2 * v1, c + e1 * u0 + e2 * v1], np.float32)


def paint_bar(img, b):
    """Our own navy bar with the SDX Inspect logo over the app header, a plain app-coloured strip over the stand line.
    The whole header area is frosted first, so anything the bar does not reach is still unreadable."""
    hh = b['vh'] - b['v0']
    qs = quad(b, b['v0'] - 0.35 * hh, max(b['vb'], b['vh'] + 0.12 * hh), padu=0.07)
    sx0, sy0 = qs.min(0); sx1, sy1 = qs.max(0)
    frost(img, sx0, sy0, sx1 - sx0, sy1 - sy0, strength=1.2, poly=qs)
    v0, vh, vb = b['v0'] - 0.16 * hh, b['vh'] + 0.10 * hh, max(b['vb'], b['vh'] + 0.12 * hh)
    q = quad(b, v0, vb)
    L = float(np.linalg.norm(q[1] - q[0])); Hc = float(np.linalg.norm(q[3] - q[0]))
    if L < 30 or Hc < 6:
        return
    sc = 2.0 if L < 500 else 1.4   # draw the canvas a bit larger than its size on screen, then shrink (clean edges)
    cw, ch = int(L * sc), max(4, int(Hc * sc))
    hdr = int(ch * min(0.78, max(0.5, (vh - v0) / (vb - v0))))   # our navy part: the header's share, at least half the cover
    canvas = np.empty((ch, cw, 3), np.float32)
    t = np.linspace(0, 1, cw)[None, :, None]
    canvas[:hdr] = NAVY_A * (1 - t) + NAVY_B * t
    canvas[hdr:] = PAPER
    if ch - hdr > 3:
        canvas[hdr:hdr + max(1, int(sc))] = PAPER * 0.93
    canvas[:hdr] *= (1.0 + 0.05 * np.linspace(1, -1, max(1, hdr)))[:, None, None]   # a hint of light from the top
    if LOGO is not None and hdr > 8:
        lh = int(hdr * 0.58); lw = int(LOGO.shape[1] * lh / LOGO.shape[0])
        if lw < cw * 0.6 and lh > 4:
            lg = cv2.resize(LOGO, (lw, lh), interpolation=cv2.INTER_AREA).astype(np.float32)
            lx, ly = int(cw * 0.035), (hdr - lh) // 2
            al = lg[..., 3:4] / 255.0
            canvas[ly:ly + lh, lx:lx + lw] = canvas[ly:ly + lh, lx:lx + lw] * (1 - al) + lg[..., :3] * al
    elif hdr > 8:
        cv2.putText(canvas, 'SDX Inspect', (int(cw * 0.035), int(hdr * 0.68)), cv2.FONT_HERSHEY_DUPLEX, hdr / 46, (255, 255, 255), max(1, hdr // 20), cv2.LINE_AA)
    src = np.array([[0, 0], [cw, 0], [cw, ch]], np.float32)
    M = cv2.getAffineTransform(src, q[[0, 1, 2]])
    x0, y0 = np.floor(q.min(0)).astype(int) - 2; x1, y1 = np.ceil(q.max(0)).astype(int) + 2
    x0, y0 = max(0, x0), max(0, y0); x1, y1 = min(W, x1), min(H, y1)
    if x1 - x0 < 4 or y1 - y0 < 4:
        return
    M2 = M.copy(); M2[:, 2] -= [x0, y0]
    warped = cv2.warpAffine(canvas, M2, (x1 - x0, y1 - y0), flags=cv2.INTER_AREA, borderMode=cv2.BORDER_REPLICATE)
    mask = cv2.warpAffine(np.ones((ch, cw), np.float32), M2, (x1 - x0, y1 - y0), flags=cv2.INTER_LINEAR, borderValue=0)
    mask = cv2.GaussianBlur(mask, (0, 0), 0.8)[..., None]
    roi = img[y0:y1, x0:x1].astype(np.float32)
    img[y0:y1, x0:x1] = np.clip(roi * (1 - mask) + warped * mask, 0, 255).astype(np.uint8)
    # browser tab title / address bar above the header: frosted
    qa = quad(b, b['v0'] - 2.0 * hh, v0 + 0.02 * hh, padu=0.05)
    bx0, by0 = qa.min(0); bx1, by1 = qa.max(0)
    frost(img, bx0, by0, bx1 - bx0, by1 - by0, strength=0.9, poly=qa)


def dedupe(bs):
    """One header can come back as several bars: split by glare (side by side), or cut by a notification banner into a
    sliver above and the Scan-stand-QR bar below. Merge bars that belong together, in the longest one's axes; when the
    lower one sits well below the upper one, it is the scan bar — the cover runs from the upper one down to it."""
    out = []
    for b in sorted(bs, key=lambda b: -(b['u1'] - b['u0'])):
        hit = None
        for o in out:
            L = o['u1'] - o['u0']
            d = b['c'] - o['c']
            du, dv = d @ o['e1'], d @ o['e2']
            gap = max(o['u0'], b['u0'] + du) - min(o['u1'], b['u1'] + du)   # < 0 when the two overlap along the bar
            if gap < 0.12 * L and abs(dv) < 0.22 * L and abs(o['e1'] @ b['e1']) > 0.97:
                hit = (o, du, dv); break
        if hit is None:
            out.append(dict(b)); continue
        o, du, dv = hit
        o['u0'] = min(o['u0'], b['u0'] + du); o['u1'] = max(o['u1'], b['u1'] + du)
        bb = {'v0': b['v0'] + dv, 'vh': b['vh'] + dv, 'vb': b['vb'] + dv}
        up, lo = (o, bb) if o['v0'] <= bb['v0'] else (bb, o)
        hu = max(up['vh'] - up['v0'], 1)
        if lo['v0'] > up['vh'] + 1.0 * hu:      # lower one is a separate band below: stop the cover just above it
            v0, vh, vb = up['v0'], up['vh'], lo['v0'] - 0.08 * max(lo['vh'] - lo['v0'], 1)
        else:
            v0, vh, vb = min(up['v0'], lo['v0']), max(up['vh'], lo['vh']), max(up['vb'], lo['vb'])
        o['v0'], o['vh'], o['vb'] = v0, vh, max(vb, vh + 0.12 * hu)
    return out


def smooth(prev, cur, k=0.55):
    out = dict(cur)
    for key in ('c', 'u0', 'u1', 'v0', 'vh', 'vb'):
        out[key] = prev[key] * (1 - k) + cur[key] * k
    e1 = prev['e1'] * (1 - k) + cur['e1'] * k; e1 = e1 / np.linalg.norm(e1)
    out['e1'] = e1; out['e2'] = np.array([-e1[1], e1[0]])
    return out


class HeaderTracker:
    """Finds the app's own top area (header + stand line + Scan-stand-QR bar) in every frame by matching SIFT features of
    templates cut from this very clip (its best colour detections, so the lighting matches). Gives a homography
    template → frame, so our bar can be drawn with the iPad's tilt and perspective even when the colours are washed out."""
    SC = 0.6

    def __init__(self, path):
        self.sift = cv2.SIFT_create(nfeatures=1500); self.bf = cv2.BFMatcher(cv2.NORM_L2)
        self.temps = []; self.prev = None; self.miss = 0
        cap2 = cv2.VideoCapture(path); cands = []; fi = 0
        while True:
            ok, fr = cap2.read()
            if not ok:
                break
            if fi % 6 == 0:
                bs, _ = navy_groups(fr)
                for b in bs:
                    if b['vs'] is None:
                        continue
                    L = b['u1'] - b['u0']; hh = b['vh'] - b['v0']
                    ang = abs(math.degrees(math.atan2(b['e1'][1], b['e1'][0])))
                    if 0.035 < hh / L < 0.1 and L > 0.35 * W:
                        cands.append((L * (1 - ang / 30), fi, b))
            fi += 1
        cands.sort(key=lambda x: -x[0]); picked = []
        for sc, f, b in cands:
            if all(abs(f - g) > 60 for _, g, _ in picked):
                picked.append((sc, f, b))
            if len(picked) == 4:
                break
        for sc, f, b in picked:
            cap2.set(cv2.CAP_PROP_POS_FRAMES, f); ok, fr = cap2.read()
            if not ok:
                continue
            L = b['u1'] - b['u0']; hh = b['vh'] - b['v0']
            vt0 = b['v0'] - 1.3 * hh; vt1 = b['vs'] + 0.4 * hh          # only the app's own pixels: no background
            Tw = 600; k = Tw / L; Th = int((vt1 - vt0) * k)
            c, e1, e2 = b['c'], b['e1'], b['e2']
            o = c + e1 * b['u0'] + e2 * vt0
            A = np.float32([[e1[0] / k, e2[0] / k, o[0]], [e1[1] / k, e2[1] / k, o[1]]])   # template → frame
            tm = cv2.warpAffine(fr, A, (Tw, Th), flags=cv2.WARP_INVERSE_MAP | cv2.INTER_AREA)
            valid = cv2.warpAffine(np.full(fr.shape[:2], 255, np.uint8), A, (Tw, Th), flags=cv2.WARP_INVERSE_MAP)
            kp, des = self.sift.detectAndCompute(cv2.cvtColor(tm, cv2.COLOR_BGR2GRAY), cv2.erode(valid, np.ones((9, 9), np.uint8)))
            if des is None or len(kp) < 40:
                continue
            self.temps.append({'id': f, 'kp': np.float32([p.pt for p in kp]), 'des': des, 'Tw': Tw, 'Th': Th,
                               'hy0': (b['v0'] - vt0) * k, 'hy1': (b['vh'] - vt0) * k, 'sy0': (b['vb'] - vt0) * k})
        cap2.release()

    def step(self, frame):
        best = None
        if self.temps:
            sm = cv2.resize(frame, None, fx=self.SC, fy=self.SC, interpolation=cv2.INTER_AREA)
            kp, des = self.sift.detectAndCompute(cv2.cvtColor(sm, cv2.COLOR_BGR2GRAY), None)
            if des is not None and len(kp) > 12:
                fp = np.float32([p.pt for p in kp]) / self.SC
                for T in self.temps:
                    mm = self.bf.knnMatch(T['des'], des, k=2)
                    good = [m for m, n in (x for x in mm if len(x) == 2) if m.distance < 0.75 * n.distance]
                    if len(good) < 12:
                        continue
                    Hm, inl = cv2.findHomography(T['kp'][[m.queryIdx for m in good]], fp[[m.trainIdx for m in good]], cv2.RANSAC, 6.0)
                    if Hm is None:
                        continue
                    ni = int(inl.sum())
                    if ni < 18 or (best is not None and ni <= best[0]):
                        continue
                    q = cv2.perspectiveTransform(np.float32([[[0, T['hy0']], [T['Tw'], T['hy0']], [T['Tw'], T['hy1']], [0, T['hy1']]]]), Hm)[0]
                    top = np.linalg.norm(q[1] - q[0]); bot = np.linalg.norm(q[2] - q[3]); hgt = np.linalg.norm(q[3] - q[0])
                    ang = abs(math.degrees(math.atan2(q[1][1] - q[0][1], q[1][0] - q[0][0])))
                    if not cv2.isContourConvex(q.astype(np.int32)) or not (0.2 * W < top < 1.8 * W) or not (0.6 < top / max(bot, 1) < 1.6) \
                            or not (0.012 < hgt / top < 0.2) or ang > 40:
                        continue
                    best = (ni, Hm, T)
        if best is None:
            if self.prev is not None and self.miss < 2:
                self.miss += 1; return self.prev
            self.prev = None; return None
        ni, Hm, T = best
        rect = np.float32([[0, 0], [T['Tw'], 0], [T['Tw'], T['Th']], [0, T['Th']]])
        pts = cv2.perspectiveTransform(rect[None], Hm)[0]
        if self.prev is not None and self.prev['T'] is T:
            pp = self.prev['pts']; d = np.linalg.norm(pts - pp, axis=1).mean()
            if d < 0.25 * np.linalg.norm(pts[1] - pts[0]):
                pts = pp * 0.4 + pts * 0.6
        self.prev = {'H': cv2.getPerspectiveTransform(rect, pts.astype(np.float32)), 'T': T, 'pts': pts}
        self.miss = 0
        return self.prev


def proj(Hm, pts):
    return cv2.perspectiveTransform(np.float32(pts)[None], Hm)[0]


def paint_persp(img, tr):
    """Our SDX bar drawn in the template's own (flat) coordinates and warped onto the iPad with its perspective."""
    T, Hm = tr['T'], tr['H']
    hy0, hy1, sy0, Tw = T['hy0'], T['hy1'], T['sy0'], T['Tw']
    hh = hy1 - hy0
    top, bot, hend = hy0 - 0.18 * hh, max(sy0, hy1 + 0.12 * hh), hy1 + 0.08 * hh
    xl, xr = -0.012 * Tw, 1.012 * Tw
    # 1) frost the whole top area first (safety under the bar) and the browser tab title / address bar above it
    for y0_, y1_, stg in ((hy0 - 0.4 * hh, bot, 1.2), (hy0 - 2.6 * hh, top + 0.02 * hh, 0.9)):
        q = proj(Hm, [[xl - 0.02 * Tw, y0_], [xr + 0.02 * Tw, y0_], [xr + 0.02 * Tw, y1_], [xl - 0.02 * Tw, y1_]])
        bx0, by0 = q.min(0); bx1, by1 = q.max(0)
        frost(img, bx0, by0, bx1 - bx0, by1 - by0, strength=stg, poly=q)
    # 2) the bar
    cs = 2.0
    cw, ch = int((xr - xl) * cs), max(4, int((bot - top) * cs))
    hdr = int((hend - top) * cs)
    canvas = np.empty((ch, cw, 3), np.float32)
    t = np.linspace(0, 1, cw)[None, :, None]
    canvas[:hdr] = NAVY_A * (1 - t) + NAVY_B * t
    canvas[:hdr] *= (1.0 + 0.05 * np.linspace(1, -1, max(1, hdr)))[:, None, None]
    canvas[hdr:] = PAPER
    if ch - hdr > 3:
        canvas[hdr:hdr + 2] = PAPER * 0.93
    if LOGO is not None and hdr > 8:
        lh = int(hdr * 0.58); lw = int(LOGO.shape[1] * lh / LOGO.shape[0])
        if 4 < lh and lw < cw * 0.6:
            lg = cv2.resize(LOGO, (lw, lh), interpolation=cv2.INTER_AREA).astype(np.float32)
            lx, ly = int(cw * 0.035), (hdr - lh) // 2
            al = lg[..., 3:4] / 255.0
            canvas[ly:ly + lh, lx:lx + lw] = canvas[ly:ly + lh, lx:lx + lw] * (1 - al) + lg[..., :3] * al
    S = np.float64([[1 / cs, 0, xl], [0, 1 / cs, top], [0, 0, 1]])
    Hc = Hm @ S
    q = proj(Hc, [[0, 0], [cw, 0], [cw, ch], [0, ch]])
    x0, y0 = np.floor(q.min(0)).astype(int) - 2; x1, y1 = np.ceil(q.max(0)).astype(int) + 2
    x0, y0 = max(0, x0), max(0, y0); x1, y1 = min(W, x1), min(H, y1)
    if x1 - x0 < 4 or y1 - y0 < 4:
        return
    Tt = np.float64([[1, 0, -x0], [0, 1, -y0], [0, 0, 1]]) @ Hc
    warped = cv2.warpPerspective(canvas, Tt, (x1 - x0, y1 - y0), flags=cv2.INTER_LINEAR, borderMode=cv2.BORDER_REPLICATE)
    mask = cv2.warpPerspective(np.ones((ch, cw), np.float32), Tt, (x1 - x0, y1 - y0), flags=cv2.INTER_LINEAR, borderValue=0)
    mask = cv2.GaussianBlur(mask, (0, 0), 0.8)[..., None]
    roi = img[y0:y1, x0:x1].astype(np.float32)
    img[y0:y1, x0:x1] = np.clip(roi * (1 - mask) + warped * mask, 0, 255).astype(np.uint8)


TRACK = HeaderTracker(a.inp) if (a.app_bar and a.app_bar_style == 'brand') else None
trackHits = []
bars = []     # brand tracks: dict + 'life'
blurs = []    # [x, y, w, h, frames_left] for frosted navy things / blur style
tracks = []   # faces [x, y, w, h, frames_left]
hits = []
barHits = []; brandHits = []
sheet_every = max(1, int(round(fps / 2)))
thumbs = []
i = 0
while True:
    ok, frame = cap.read()
    if not ok:
        break
    t = i / fps
    clean = frame.copy() if a.app_bar else None   # detect on the untouched frame
    if det is not None:
        small = cv2.resize(frame, (DW, DH))
        _, faces = det.detect(small)
        found = []
        if faces is not None:
            s = W / DW
            for f in faces:
                x, y, w, h = [float(v) * s for v in f[:4]]
                found.append([x, y, w, h])
        if prof is not None and not found and i % 3 == 0:   # profile faces the YuNet misses (looking sideways)
            g = cv2.cvtColor(small, cv2.COLOR_BGR2GRAY)
            for (x, y, w, h) in prof.detectMultiScale(g, 1.15, 5, minSize=(28, 28)):
                s = W / DW
                found.append([x * s, y * s, w * s, h * s])
            for (x, y, w, h) in prof.detectMultiScale(cv2.flip(g, 1), 1.15, 5, minSize=(28, 28)):
                s = W / DW
                found.append([(DW - x - w) * s, y * s, w * s, h * s])
        if found:
            hits.append(round(t, 2))
        nxt = [fb + [a.hold] for fb in found]
        for tr in tracks:   # keep a lost face for a few frames unless a fresh box overlaps it
            if tr[4] > 1 and not any(abs(tr[0] - n[0]) < tr[2] and abs(tr[1] - n[1]) < tr[3] for n in nxt):
                nxt.append(tr[:4] + [tr[4] - 1])
        tracks = nxt
        for x, y, w, h, _ in tracks:
            px, py = w * 0.45, h * 0.55
            frost(frame, x - px, y - py * 0.8, w + 2 * px, h + 2 * py, strength=1.3)
    if a.app_bar:
        found_bars, found_other = navy_groups(clean)
        if found_bars or found_other:
            barHits.append(round(t, 2))
        tr = TRACK.step(clean) if TRACK is not None else None
        if tr is not None:   # the template match wins: paint in perspective, frost only navy things away from it
            trackHits.append(round(t, 2))
            qa = proj(tr['H'], [[0, 0], [tr['T']['Tw'], 0], [tr['T']['Tw'], tr['T']['Th']], [0, tr['T']['Th']]])
            ax0, ay0 = qa.min(0); ax1, ay1 = qa.max(0); aw, ah = ax1 - ax0, ay1 - ay0
            for x, y, w, h in found_other + [[b['c'][0] + b['u0'], b['c'][1] + b['v0'], b['u1'] - b['u0'], b['vb'] - b['v0']] for b in found_bars]:
                if x + w < ax0 - 0.5 * aw or x > ax1 + 0.5 * aw or y + h < ay0 - 2 * ah or y > ay1 + 2 * ah:
                    frost(frame, x - 0.04 * w, y - 0.25 * h, w * 1.08, h * 1.5, strength=1.1)
            paint_persp(frame, tr)
            bars = []; blurs = []
            found_bars = []; found_other = []
        if a.app_bar_style == 'blur' or (TRACK is not None and TRACK.temps):
            # blur style, or: with templates, only a confirmed template match paints our bar — colour-only finds get frosted
            for b in found_bars:
                q = quad(b, b['v0'] - 2.0 * (b['vh'] - b['v0']), b['vb'], padu=0.12)
                bx0, by0 = q.min(0); bx1, by1 = q.max(0)
                found_other.append([bx0, by0, bx1 - bx0, by1 - by0])
            found_bars = []
        found_bars = dedupe(found_bars)
        nb = []
        for b in found_bars:
            L = b['u1'] - b['u0']
            best = min(bars, key=lambda p: np.linalg.norm(p['c'] - b['c']), default=None)
            if best is not None and np.linalg.norm(best['c'] - b['c']) < 0.6 * max(L, 1) and abs((best['u1'] - best['u0']) - L) < 0.5 * L:
                s2 = smooth(best, b); bars = [p for p in bars if p is not best]
            else:
                s2 = b
            s2['life'] = 3; nb.append(s2)
        for p in bars:   # a bar the detector lost this frame (motion blur, glare) stays 2 frames where it was, unless a fresh one is near
            Lp = p['u1'] - p['u0']
            if p['life'] > 1 and not any(np.linalg.norm(p['c'] - q['c']) < 1.2 * max(Lp, 1) for q in nb):
                p['life'] -= 1; nb.append(p)
        bars = nb
        for b in bars:
            paint_bar(frame, b)
        if bars:
            brandHits.append(round(t, 2))
        no = [o + [8] for o in found_other]
        for tr in blurs:
            if tr[4] > 1 and not any(abs(tr[0] - n[0]) < tr[2] * 0.5 and abs(tr[1] - n[1]) < tr[3] for n in no):
                no.append(tr[:4] + [tr[4] - 1])
        blurs = no
        for x, y, w, h, _ in blurs:
            frost(frame, x - 0.04 * w, y - 0.25 * h, w * 1.08, h * 1.5, strength=1.1)
        if a.debug and i % 45 == 0:
            os.makedirs(a.debug, exist_ok=True)
            cv2.imwrite(os.path.join(a.debug, f'f{i:05d}.jpg'), cv2.resize(frame, (540, int(540 * H / W))), [cv2.IMWRITE_JPEG_QUALITY, 85])
    for b in manual:
        if b['t0'] <= t <= b['t1']:
            frost(frame, b['x'] * W, b['y'] * H, b['w'] * W, b['h'] * H, strength=1.2)
    if a.sheet and i % sheet_every == 0:
        th = cv2.resize(frame, (240, int(240 * H / W)))
        cv2.rectangle(th, (0, 0), (92, 30), (0, 0, 0), -1)
        cv2.putText(th, f'{t:5.1f}s', (4, 22), cv2.FONT_HERSHEY_SIMPLEX, 0.65, (255, 255, 255), 2)
        thumbs.append(th)
    ff.stdin.write(frame.tobytes())
    i += 1
cap.release(); ff.stdin.close(); ff.wait()

if a.sheet:
    os.makedirs(a.sheet, exist_ok=True)
    cols, per = 6, 24
    for n in range(0, len(thumbs), per):
        chunk = thumbs[n:n + per]
        th, tw = chunk[0].shape[:2]
        rows = (len(chunk) + cols - 1) // cols
        grid = np.full((rows * th, cols * tw, 3), 30, np.uint8)
        for k, im in enumerate(chunk):
            grid[(k // cols) * th:(k // cols + 1) * th, (k % cols) * tw:(k % cols + 1) * tw] = im
        cv2.imwrite(os.path.join(a.sheet, f'sheet_{n // per + 1}.jpg'), grid, [cv2.IMWRITE_JPEG_QUALITY, 78])

rep = {'frames': i, 'fps': fps, 'size': [W, H], 'faceFrames': len(hits), 'manualBoxes': len(manual),
       'appBarFrames': len(barHits), 'brandBarFrames': len(brandHits), 'trackedFrames': len(trackHits),
       'templates': [T['id'] for T in TRACK.temps] if TRACK else [], 'appBarStyle': a.app_bar_style if a.app_bar else None}
spans = []
for t in hits:
    if spans and t - spans[-1][1] <= 0.5:
        spans[-1][1] = t
    else:
        spans.append([t, t])
rep['faceSpans'] = spans
if a.report:
    json.dump(rep, open(a.report, 'w'), indent=1)
print(json.dumps(rep))
