#!/usr/bin/env python3
"""Blur faces (YuNet, every frame, held across misses) and any manual boxes in a video, keep its audio,
and write contact sheets of the RESULT so a person (or Claude) can check nothing identifying is left.

python3 -I povblur.py IN.mp4 OUT.mp4 --ffmpeg PATH [--boxes boxes.json] [--no-faces] [--app-bar] [--sheet DIR] [--report faces.json]

--app-bar  also blurs the SDX app's navy header bar wherever it is on screen (on the home venue it carries the employer's logo,
           the venue / stand line under it and the browser tab title above it): wide saturated-navy bands are found every frame,
           bands stacked close together (header + "Scan stand QR" bar) are merged, the box is padded up / down / sideways and held
           for a few frames when the iPad moves too fast to detect.

boxes.json = [{"t0": 1.2, "t1": 3.4, "x": 0.1, "y": 0.2, "w": 0.3, "h": 0.1}, ...]  (x/y/w/h are 0..1 of the frame)
"""
import argparse, json, os, subprocess, sys
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
ap.add_argument('--app-bar', action='store_true', help='blur the app header bar (navy) wherever it shows')
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

ff = subprocess.Popen([a.ffmpeg, '-y', '-loglevel', 'error', '-f', 'rawvideo', '-pix_fmt', 'bgr24', '-s', f'{W}x{H}', '-r', f'{fps}', '-i', '-',
                       '-i', a.inp, '-map', '0:v', '-map', '1:a?', '-c:v', 'libx264', '-preset', 'medium', '-crf', '17', '-pix_fmt', 'yuv420p',
                       '-c:a', 'copy', '-shortest', a.out], stdin=subprocess.PIPE)


def mosaic(img, x, y, w, h):
    x0, y0 = max(0, int(x)), max(0, int(y)); x1, y1 = min(W, int(x + w)), min(H, int(y + h))
    if x1 - x0 < 4 or y1 - y0 < 4:
        return
    roi = img[y0:y1, x0:x1]
    k = max(9, (min(x1 - x0, y1 - y0) // 3) | 1)
    roi = cv2.GaussianBlur(roi, (k, k), 0)
    bw, bh = max(1, (x1 - x0) // 14), max(1, (y1 - y0) // 14)
    roi = cv2.resize(cv2.resize(roi, (bw, bh), interpolation=cv2.INTER_AREA), (x1 - x0, y1 - y0), interpolation=cv2.INTER_NEAREST)
    img[y0:y1, x0:x1] = roi


def navy_bands(frame, DW=360):
    """Wide saturated-navy bands (the app header, the Scan-stand-QR bar, a navy login screen) as [x, y, w, h] in frame px.
    Every navy component is cut into horizontal bands by its row fill, so a header touching the iPad's navy case (or a
    sink sticker) still yields the header band; side-by-side pieces of one header (glare, tilt) are merged, then padded:
    up for the browser tab title, down for the venue / stand line, sideways for the logo. Over-blurring other blue things
    (tubs, stickers, the bezel) is harmless; missing the logo is not."""
    H, W = frame.shape[:2]; s = W / DW; DH2 = int(round(H / s))
    small = cv2.resize(frame, (DW, DH2), interpolation=cv2.INTER_AREA)
    hsv = cv2.cvtColor(small, cv2.COLOR_BGR2HSV)
    m = cv2.inRange(hsv, (102, 115, 70), (132, 255, 250))
    m = cv2.morphologyEx(m, cv2.MORPH_CLOSE, cv2.getStructuringElement(cv2.MORPH_RECT, (11, 3)))
    n, lab, st, _ = cv2.connectedComponentsWithStats(m)
    bands = []
    for i in range(1, n):
        x, y, w, h, a = st[i]
        if w < 0.07 * DW or a < 30:
            continue
        if a >= 0.5 * w * h and h > 0.12 * DH2:          # a solid navy page (login screen)
            bands.append([x, y, w, h]); continue
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
                    bands.append([x + bx0, y + r0, bw, bh])
    bands = [[v * s for v in b] for b in bands]
    merged = True
    while merged and len(bands) > 1:
        merged = False
        for i in range(len(bands)):
            for j in range(i + 1, len(bands)):
                a, b = bands[i], bands[j]
                xo = min(a[0] + a[2], b[0] + b[2]) - max(a[0], b[0])
                yo = min(a[1] + a[3], b[1] + b[3]) - max(a[1], b[1])
                gap = max(a[1], b[1]) - min(a[1] + a[3], b[1] + b[3])
                if (xo > 0.3 * min(a[2], b[2]) and gap < 0.06 * H) or (yo > -0.01 * H and -xo < 0.08 * W):
                    x0, y0 = min(a[0], b[0]), min(a[1], b[1])
                    bands[i] = [x0, y0, max(a[0] + a[2], b[0] + b[2]) - x0, max(a[1] + a[3], b[1] + b[3]) - y0]
                    bands.pop(j); merged = True; break
            if merged:
                break
    out = []
    for x, y, w, h in bands:
        hh = max(min(h, 0.05 * H), 0.012 * H)
        px = max(0.14 * w, 0.09 * W)
        out.append([x - px, y - 1.8 * hh, w + 2 * px, h + 2.6 * hh])
    return out


bars = []     # [x, y, w, h, frames_left] for --app-bar
tracks = []   # [x, y, w, h, frames_left]
hits = []     # (t, n) frames with at least one detection
barHits = []  # frames where the app bar was found
sheet_every = max(1, int(round(fps / 2)))
thumbs = []
i = 0
while True:
    ok, frame = cap.read()
    if not ok:
        break
    t = i / fps
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
        nxt = []
        for fb in found:
            nxt.append(fb + [a.hold])
        for tr in tracks:   # keep a lost face for a few frames unless a fresh box overlaps it
            if tr[4] > 1 and not any(abs(tr[0] - n[0]) < tr[2] and abs(tr[1] - n[1]) < tr[3] for n in nxt):
                nxt.append(tr[:4] + [tr[4] - 1])
        tracks = nxt
        for x, y, w, h, _ in tracks:
            px, py = w * 0.45, h * 0.55
            mosaic(frame, x - px, y - py * 0.8, w + 2 * px, h + 2 * py)
    if a.app_bar:
        found = navy_bands(frame)
        nb = [f + [8] for f in found]
        for tr in bars:   # a band the detector lost (motion blur, glare) stays a few frames, a little bigger each frame
            if tr[4] > 1 and not any(abs(tr[0] - n[0]) < tr[2] * 0.5 and abs(tr[1] - n[1]) < tr[3] for n in nb):
                g = 0.03
                nb.append([tr[0] - tr[2] * g, tr[1] - tr[3] * g, tr[2] * (1 + 2 * g), tr[3] * (1 + 2 * g), tr[4] - 1])
        bars = nb
        if found:
            barHits.append(round(t, 2))
        for x, y, w, h, _ in bars:
            mosaic(frame, x, y, w, h)
    for b in manual:
        if b['t0'] <= t <= b['t1']:
            mosaic(frame, b['x'] * W, b['y'] * H, b['w'] * W, b['h'] * H)
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

rep = {'frames': i, 'fps': fps, 'size': [W, H], 'faceFrames': len(hits), 'manualBoxes': len(manual), 'appBarFrames': len(barHits)}
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
