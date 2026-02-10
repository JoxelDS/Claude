#!/usr/bin/env python3
"""
DS MARKETING IMAGE ENGINE v1.0
================================
Self-contained AI image engine. No accounts. No API keys. You control everything.

HOW IT WORKS:
- Generates each character 3 times with different seeds
- Auto-picks the BEST version (brightest, sharpest, highest quality)
- Upscales from 1536x1536 for extra detail, then downscales to 1080
- Advanced B&W post-processing: brightness boost, contrast, sharpening
- Professional editorial compositing with your brand colors

Run: python3 ds_engine.py
"""

import urllib.request, urllib.parse, os, math, random, time, sys, hashlib

try:
    from PIL import Image, ImageDraw, ImageFont, ImageFilter, ImageChops, ImageEnhance, ImageStat
except ImportError:
    os.system(f"{sys.executable} -m pip install Pillow")
    from PIL import Image, ImageDraw, ImageFont, ImageFilter, ImageChops, ImageEnhance, ImageStat

# ══════════════════════════════════════════════
# CONFIG
# ══════════════════════════════════════════════
W, H = 1080, 1080
GEN_SIZE = 1536           # Generate at higher res, downscale for quality
ATTEMPTS_PER_CHAR = 3     # Generate 3 versions, pick best
OUT = "ds-marketing-engine"

# Brand Colors — Black & White ONLY
BLACK = (0, 0, 0)
WHITE = (255, 255, 255)
DARK_BG = (5, 5, 5)
NEAR_BLACK = (12, 12, 12)
DARK_GRAY = (26, 26, 26)
MED_GRAY = (128, 128, 128)
LIGHT_GRAY = (200, 200, 200)
OFF_WHITE = (245, 245, 245)


# ══════════════════════════════════════════════
# FONTS
# ══════════════════════════════════════════════
def _f(paths, sz):
    for p in paths:
        if os.path.exists(p):
            try: return ImageFont.truetype(p, sz)
            except: pass
    return ImageFont.load_default()

def HEADLINE(sz):
    return _f([
        "BebasNeue-Regular.ttf",
        "/System/Library/Fonts/Supplemental/Impact.ttf",
        "/Library/Fonts/Impact.ttf",
        "/usr/share/fonts/truetype/liberation/LiberationSans-Bold.ttf",
    ], sz)

def BODY_BOLD(sz):
    return _f([
        "/System/Library/Fonts/Supplemental/Arial Bold.ttf",
        "/Library/Fonts/Arial Bold.ttf",
        "/System/Library/Fonts/Helvetica-Bold.otf",
        "/usr/share/fonts/truetype/liberation/LiberationSans-Bold.ttf",
    ], sz)

def BODY(sz):
    return _f([
        "/System/Library/Fonts/Supplemental/Arial.ttf",
        "/Library/Fonts/Arial.ttf",
        "/System/Library/Fonts/Helvetica.ttc",
        "/usr/share/fonts/truetype/liberation/LiberationSans-Regular.ttf",
    ], sz)


# ══════════════════════════════════════════════
# AI IMAGE ENGINE — Multi-Seed Smart Generator
# ══════════════════════════════════════════════

def _download_raw(prompt, path, seed, size=1536):
    """Download single image from AI with specific seed."""
    url = (
        f"https://image.pollinations.ai/prompt/{urllib.parse.quote(prompt)}"
        f"?width={size}&height={size}&model=flux&nologo=true&seed={seed}"
    )
    headers = {
        "User-Agent": (
            "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
            "AppleWebKit/537.36 (KHTML, like Gecko) "
            "Chrome/131.0.0.0 Safari/537.36"
        )
    }
    try:
        req = urllib.request.Request(url, headers=headers)
        data = urllib.request.urlopen(req, timeout=240).read()
        if len(data) > 10000:
            with open(path, "wb") as f:
                f.write(data)
            return True
    except Exception as e:
        print(f"      ({type(e).__name__})")
    return False


def score_image(path):
    """
    Score image quality: brightness + contrast + sharpness.
    Higher = better. Used to pick best of 3 generations.
    """
    try:
        img = Image.open(path).convert("RGB")
        stat = ImageStat.Stat(img)

        # Average brightness (0-255, higher = brighter = more visible character)
        brightness = sum(stat.mean) / 3

        # Contrast via standard deviation (higher = more detail)
        contrast = sum(stat.stddev) / 3

        # Edge detection for sharpness
        gray = img.convert("L")
        edges = gray.filter(ImageFilter.FIND_EDGES)
        edge_stat = ImageStat.Stat(edges)
        sharpness = edge_stat.mean[0]

        # Combined score — heavily weight brightness (we want visible characters)
        score = (brightness * 2.0) + (contrast * 1.5) + (sharpness * 1.0)
        return score
    except:
        return 0


def generate_character(name, prompt, output_path):
    """
    Smart AI generation: generates 3 versions with different seeds,
    scores each for quality, keeps the BEST one.
    """
    if os.path.exists(output_path) and os.path.getsize(output_path) > 15000:
        print(f"    \u2713 {name} (cached)")
        return True

    temp_dir = f"{OUT}/_temp"
    os.makedirs(temp_dir, exist_ok=True)

    best_path = None
    best_score = -1
    seeds = [random.randint(1000, 99999) for _ in range(ATTEMPTS_PER_CHAR)]

    print(f"    Generating {name} ({ATTEMPTS_PER_CHAR} versions at {GEN_SIZE}px)...")

    for i, seed in enumerate(seeds):
        temp_path = f"{temp_dir}/{name}_v{i}.png"
        print(f"      version {i+1}/{ATTEMPTS_PER_CHAR} (seed {seed})...", end=" ", flush=True)

        success = False
        for retry in range(3):
            if _download_raw(prompt, temp_path, seed, GEN_SIZE):
                success = True
                break
            time.sleep(2 * (retry + 1))

        if success:
            sc = score_image(temp_path)
            print(f"score: {sc:.0f}")
            if sc > best_score:
                best_score = sc
                best_path = temp_path
        else:
            print("failed")

        # Wait between API calls
        if i < len(seeds) - 1:
            time.sleep(4)

    if best_path:
        # Post-process the best version
        img = Image.open(best_path).convert("RGB")

        # Downscale from 1536 to 1080 (adds sharpness through supersampling)
        img = img.resize((W, H), Image.LANCZOS)

        # Brightness boost — make character more visible
        img = ImageEnhance.Brightness(img).enhance(1.35)
        img = ImageEnhance.Contrast(img).enhance(1.25)
        img = ImageEnhance.Sharpness(img).enhance(1.6)

        # Desaturate toward B&W
        gray = img.convert("L").convert("RGB")
        img = Image.blend(img, gray, 0.85)

        # Final contrast pass
        img = ImageEnhance.Contrast(img).enhance(1.15)

        img.save(output_path, quality=95)
        print(f"    \u2713 {name} — BEST version saved (score: {best_score:.0f})")

        # Clean up temp files
        for i in range(ATTEMPTS_PER_CHAR):
            tp = f"{temp_dir}/{name}_v{i}.png"
            if os.path.exists(tp):
                os.remove(tp)
        return True
    else:
        # Fallback
        fb = Image.new("RGB", (W, H), DARK_BG)
        fb.save(output_path, quality=95)
        print(f"    ! {name} — all attempts failed, using fallback")
        return False


# ══════════════════════════════════════════════
# CHARACTER PROMPTS — Optimized for B&W Studio
# ══════════════════════════════════════════════

CHARACTERS = {
    "ceo": (
        "professional 3D render of a confident powerful male CEO character, "
        "Pixar animation style, wearing perfectly tailored solid black suit, "
        "arms crossed with a knowing confident smirk, strong jawline, "
        "BRIGHT white studio lighting setup, strong white key light from right, "
        "bright white rim light on left shoulder creating separation from background, "
        "face is BRIGHTLY lit and clearly visible with all details, "
        "solid pure black background, dramatic high contrast black and white, "
        "portrait photography lighting, sharp focus on face, "
        "3D character render, Pixar movie quality, octane render, 8K, "
        "no text no words no watermark"
    ),
    "frustrated": (
        "professional 3D render of a stressed exhausted businessman character at desk, "
        "Pixar animation style, head in both hands with eyes shut in frustration, "
        "laptop open on clean modern desk, expression of exhaustion and defeat, "
        "BRIGHT white overhead spotlight illuminating the scene clearly, "
        "face and hands are BRIGHTLY lit and visible with clear details, "
        "white light creating dramatic shadows but character is clearly visible, "
        "solid pure black background, high contrast monochrome scene, "
        "3D character render, Pixar movie quality, octane render, 8K, "
        "no text no words no watermark"
    ),
    "winner": (
        "professional 3D render of ecstatic triumphant businessman character, "
        "Pixar animation style, jumping with both fists raised in victory, "
        "huge genuine smile of pure joy and success, eyes wide with excitement, "
        "wearing black suit, white confetti particles floating everywhere, "
        "BRIGHT white backlight and rim light creating dramatic glow, "
        "face and body BRIGHTLY lit and clearly visible, "
        "solid pure black background, high contrast monochrome, "
        "dynamic action pose, wide angle camera, celebration energy, "
        "3D character render, Pixar movie quality, octane render, 8K, "
        "no text no words no watermark"
    ),
    "presenter": (
        "professional 3D render of confident female businesswoman character, "
        "Pixar animation style, standing with one hand extended in presenting gesture, "
        "warm professional smile, wearing sleek black blazer and white shirt, "
        "BRIGHT white studio lighting from multiple angles, three-point lighting setup, "
        "face is BRIGHTLY lit and clearly visible with all details, "
        "solid pure black background, high contrast monochrome, "
        "corporate professional look, power pose, authority, "
        "3D character render, Pixar movie quality, octane render, 8K, "
        "no text no words no watermark"
    ),
    "thinker": (
        "professional 3D render of thoughtful businessman character in black turtleneck, "
        "Pixar animation style like Steve Jobs, hand on chin deep in thought, "
        "eyes looking up with a spark of inspiration, moment of genius idea, "
        "BRIGHT white Rembrandt lighting on face, beautiful catchlights in eyes, "
        "face BRIGHTLY lit and clearly visible against dark background, "
        "solid pure black background, high contrast monochrome, "
        "contemplative mood but face clearly visible and bright, "
        "3D character render, Pixar movie quality, octane render, 8K, "
        "no text no words no watermark"
    ),
    "scroller": (
        "professional 3D render of bored person in hoodie scrolling smartphone, "
        "Pixar animation style, glazed tired eyes looking at phone screen, "
        "face illuminated by BRIGHT white phone screen glow in dark room, "
        "strong white light from phone casting on face making features clearly visible, "
        "social media addiction concept, mindless doom scrolling, "
        "solid pure black background, dramatic white light from phone, "
        "lonely isolated mood, face clearly visible and well-lit, "
        "3D character render, Pixar movie quality, octane render, 8K, "
        "no text no words no watermark"
    ),
    "visionary": (
        "professional 3D render of powerful CEO standing with commanding presence, "
        "Pixar animation style, hands on modern glass desk leaning forward, "
        "intense determined expression showing leadership and vision, "
        "wearing premium black suit, large bright window behind him, "
        "BRIGHT white light from window creating dramatic rim light, "
        "reflected light BRIGHTLY illuminating face and showing clear details, "
        "solid pure black and white scene, high contrast monochrome, "
        "authority and power composition, cinematic wide angle, "
        "3D character render, Pixar movie quality, octane render, 8K, "
        "no text no words no watermark"
    ),
    "rocket": (
        "professional 3D render of sleek minimalist WHITE rocket ship launching upward, "
        "bright white rocket against solid pure black background like deep space, "
        "dramatic bright white flame and exhaust trail, white smoke particles, "
        "bright white stars scattered in background, epic launch scene, "
        "high contrast black and white monochrome only, no colors, "
        "motion blur on rocket body, upward camera angle, epic scale, "
        "tiny white star particles floating, cinematic composition, "
        "3D render, octane render, 8K quality, "
        "no text no words no watermark"
    ),
    "clock": (
        "professional 3D render of elegant silver chrome luxury stopwatch, "
        "floating centered against solid pure black background, "
        "BRIGHT white light reflecting off polished metal surface, "
        "dramatic single white spotlight from directly above, "
        "glass watch face clearly visible, beautiful reflections and caustics, "
        "high contrast black and white monochrome only, no colors, "
        "luxury product photography style, floating white light particles, "
        "3D render, octane render, 8K quality, "
        "no text no words no watermark"
    ),
}


# ══════════════════════════════════════════════
# VISUAL EFFECTS — B&W Premium
# ══════════════════════════════════════════════

def vignette(img, strength=0.75):
    mask = Image.new("L", (W, H), 0)
    d = ImageDraw.Draw(mask)
    cx, cy = W // 2, H // 2
    mr = int(W * strength)
    for r in range(mr, 0, -1):
        d.ellipse([cx - r, cy - r, cx + r, cy + r], fill=int(255 * (r / mr) ** 0.7))
    return Image.composite(img, Image.new("RGB", (W, H), BLACK), mask)


def film_grain(img, amount=4):
    px = img.load()
    rng = random.Random(42)
    for _ in range(W * H // 4):
        x, y = rng.randint(0, W - 1), rng.randint(0, H - 1)
        r, g, b = px[x, y]
        v = rng.randint(-amount, amount)
        px[x, y] = (max(0, min(255, r + v)), max(0, min(255, g + v)), max(0, min(255, b + v)))
    return img


def white_bokeh(img, count=18, seed=42):
    ov = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    rng = random.Random(seed)
    for _ in range(count):
        x, y = rng.randint(0, W), rng.randint(0, H)
        r = rng.randint(5, 30)
        a = rng.randint(6, 25)
        c = Image.new("RGBA", (r * 2, r * 2), (0, 0, 0, 0))
        cd = ImageDraw.Draw(c)
        cd.ellipse([0, 0, r * 2, r * 2], fill=(255, 255, 255, a))
        c = c.filter(ImageFilter.GaussianBlur(radius=r // 2))
        ov.paste(c, (x - r, y - r), c)
    return Image.alpha_composite(img.convert("RGBA"), ov).convert("RGB")


def light_beam(img, x_pos=540, alpha=12):
    ov = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    d = ImageDraw.Draw(ov)
    for y in range(H):
        t = y / H
        w = int(5 + 160 * t * t)
        a = int(alpha * (1 - t * 0.7))
        d.line([(x_pos - w // 2, y), (x_pos + w // 2, y)], fill=(255, 255, 255, a))
    return Image.alpha_composite(img.convert("RGBA"), ov).convert("RGB")


def gradient_darken(img, y1, y2, strength=0.88, fade=80):
    ov = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    d = ImageDraw.Draw(ov)
    for y in range(max(0, y1 - fade), min(H, y2 + fade)):
        if y < y1:
            a = strength * (1 - (y1 - y) / fade)
        elif y > y2:
            a = strength * (1 - (y - y2) / fade)
        else:
            a = strength
        d.line([(0, y), (W, y)], fill=(0, 0, 0, max(0, min(255, int(255 * a)))))
    return Image.alpha_composite(img.convert("RGBA"), ov).convert("RGB")


# ── TEXT ──

def white_glow(img, text, font, x, y, blur=14, alpha=60):
    g = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    gd = ImageDraw.Draw(g)
    for dx in range(-2, 3):
        for dy in range(-2, 3):
            gd.text((x + dx, y + dy), text, font=font, fill=(255, 255, 255, alpha))
    g = g.filter(ImageFilter.GaussianBlur(radius=blur))
    return Image.alpha_composite(img.convert("RGBA"), g).convert("RGB")


def outlined(draw, x, y, text, font, fill=WHITE, outline=BLACK, w=2):
    for dx in range(-w, w + 1):
        for dy in range(-w, w + 1):
            if dx * dx + dy * dy <= w * w:
                draw.text((x + dx, y + dy), text, font=font, fill=outline)
    draw.text((x, y), text, font=font, fill=fill)


def centered(draw, y, text, font, fill=WHITE):
    bb = draw.textbbox((0, 0), text, font=font)
    x = (W - (bb[2] - bb[0])) // 2
    draw.text((x, y), text, font=font, fill=fill)
    return x, bb[3] - bb[1]


def centered_out(draw, y, text, font, fill=WHITE, outline=BLACK, ow=2):
    bb = draw.textbbox((0, 0), text, font=font)
    x = (W - (bb[2] - bb[0])) // 2
    outlined(draw, x, y, text, font, fill, outline, ow)
    return x, bb[3] - bb[1]


def wrap_text(text, font, max_w, draw):
    words = text.split()
    lines, cur = [], ""
    for w in words:
        t = f"{cur} {w}".strip()
        if draw.textbbox((0, 0), t, font=font)[2] <= max_w:
            cur = t
        else:
            if cur: lines.append(cur)
            cur = w
    if cur: lines.append(cur)
    return lines


# ── BRAND ──

def header(draw, dark=True):
    if dark:
        draw.rectangle([(0, 0), (W, 38)], fill=NEAR_BLACK)
        draw.line([(0, 38), (W, 38)], fill=DARK_GRAY, width=1)
        f = BODY_BOLD(11)
        draw.text((40, 12), "DS MARKETING", font=f, fill=MED_GRAY)
        draw.text((W - 200, 12), "@dsmarketing.agency", font=f, fill=(80, 80, 80))
    else:
        draw.rectangle([(0, 0), (W, 38)], fill=OFF_WHITE)
        draw.line([(0, 38), (W, 38)], fill=(210, 210, 210), width=1)
        f = BODY_BOLD(11)
        draw.text((40, 12), "DS MARKETING", font=f, fill=(60, 60, 60))
        draw.text((W - 200, 12), "@dsmarketing.agency", font=f, fill=(140, 140, 140))


def footer(draw, sn=None, tot=None, dark=True):
    bg = NEAR_BLACK if dark else OFF_WHITE
    ln = DARK_GRAY if dark else (210, 210, 210)
    txt = (90, 90, 90) if dark else (130, 130, 130)
    dot_on = WHITE if dark else BLACK
    dot_off = (50, 50, 50) if dark else (185, 185, 185)
    web = (55, 55, 55) if dark else (160, 160, 160)

    draw.rectangle([(0, H - 44), (W, H)], fill=bg)
    draw.line([(0, H - 44), (W, H - 44)], fill=ln, width=1)
    f = BODY(11)
    draw.text((40, H - 30), "@dsmarketing.agency", font=f, fill=txt)
    if sn and tot:
        for i in range(min(tot, 10)):
            dx = W // 2 - (tot * 12) // 2 + i * 24
            if i == sn - 1:
                draw.ellipse([dx - 4, H - 28, dx + 4, H - 20], fill=dot_on)
            else:
                draw.ellipse([dx - 2, H - 26, dx + 2, H - 22], fill=dot_off)
    draw.text((W - 195, H - 30), "dsmarketing.lovable.app", font=f, fill=web)


def corners(draw, c=(50, 50, 50), m=48, l=38, w=1):
    pts = [
        [(m, m), (m + l, m)], [(m, m), (m, m + l)],
        [(W - m - l, m), (W - m, m)], [(W - m, m), (W - m, m + l)],
        [(m, H - m), (m + l, H - m)], [(m, H - m - l), (m, H - m)],
        [(W - m - l, H - m), (W - m, H - m)], [(W - m, H - m - l), (W - m, H - m)],
    ]
    for p in pts:
        draw.line(p, fill=c, width=w)


def thin_line(draw, y, x1=108, x2=972, color=WHITE, width=1):
    draw.line([(x1, y), (x2, y)], fill=color, width=width)


# ══════════════════════════════════════════════
# SLIDE TEMPLATES
# ══════════════════════════════════════════════

def HOOK(char_path, line1, line2, tag, out):
    ch = Image.open(char_path).resize((W, H), Image.LANCZOS)
    img = ch.copy()
    img = gradient_darken(img, H - 480, H, 0.92, 100)
    img = gradient_darken(img, 0, 110, 0.7, 40)
    img = vignette(img, 0.8)
    img = white_bokeh(img, 12, seed=hash(out) % 9999)
    img = film_grain(img, 3)

    draw = ImageDraw.Draw(img)
    header(draw, True)

    # Tag pill
    if tag:
        tf = BODY_BOLD(16)
        bb = draw.textbbox((0, 0), tag, font=tf)
        tw = bb[2] - bb[0]
        tx = (W - tw) // 2
        draw.rounded_rectangle([(tx - 14, 54), (tx + tw + 14, 80)], radius=4, outline=WHITE, width=1)
        draw.text((tx, 57), tag, font=tf, fill=WHITE)

    # Headline
    hf = HEADLINE(100)
    lines = wrap_text(line1, hf, W - 140, draw)
    lh = 108
    total_h = len(lines) * lh
    sy = H - 390 - total_h // 2

    for i, ln in enumerate(lines):
        bb = draw.textbbox((0, 0), ln, font=hf)
        x = (W - (bb[2] - bb[0])) // 2
        img = white_glow(img, ln, hf, x, sy + i * lh, 18, 50)
        draw = ImageDraw.Draw(img)
        outlined(draw, x, sy + i * lh, ln, hf, WHITE, BLACK, 3)

    if line2:
        sf = HEADLINE(78)
        bb = draw.textbbox((0, 0), line2, font=sf)
        x = (W - (bb[2] - bb[0])) // 2
        outlined(draw, x, sy + len(lines) * lh + 10, line2, sf, LIGHT_GRAY, BLACK, 2)

    thin_line(draw, H - 96, 300, W - 300, WHITE, 1)
    sf = BODY(13)
    centered(draw, H - 76, "SWIPE  TO  LEARN  MORE  \u2192", sf, MED_GRAY)
    footer(draw, dark=True)
    img.save(out, quality=95)
    print(f"  \u2713 {os.path.basename(out)}")


def NUM_CHAR(char_path, num, title, sub, sn, tot, out):
    ch = Image.open(char_path).resize((W, H), Image.LANCZOS)
    ch = ImageEnhance.Brightness(ch).enhance(0.35)
    img = ch.copy()
    img = gradient_darken(img, H - 480, H, 0.9, 70)
    img = vignette(img, 0.7)
    img = white_bokeh(img, 7, seed=sn * 13)
    img = film_grain(img, 3)

    draw = ImageDraw.Draw(img)
    header(draw, True)
    corners(draw, (45, 45, 45))

    # Number
    nf = HEADLINE(180)
    ns = f"{num:02d}"
    nb = draw.textbbox((70, 440), ns, font=nf)
    img = white_glow(img, ns, nf, 70, 440, 16, 45)
    draw = ImageDraw.Draw(img)
    outlined(draw, 70, 440, ns, nf, WHITE, BLACK, 3)

    lx = nb[2] + 18
    draw.line([(lx, 468), (lx, 620)], fill=WHITE, width=2)

    tf = HEADLINE(48)
    tl = wrap_text(title.upper(), tf, W - lx - 80, draw)
    ty = 485
    for ln in tl:
        outlined(draw, lx + 22, ty, ln, tf, WHITE, BLACK, 2)
        ty += 56

    thin_line(draw, 695, 70, W - 70, WHITE, 1)

    sf = BODY(24)
    sl = wrap_text(sub, sf, W - 180, draw)
    sy = 725
    for ln in sl:
        draw.text((90, sy), ln, font=sf, fill=LIGHT_GRAY)
        sy += 35

    footer(draw, sn, tot, True)
    img.save(out, quality=95)
    print(f"  \u2713 {os.path.basename(out)}")


def NUM_DARK(num, title, sub, sn, tot, out):
    img = Image.new("RGB", (W, H), DARK_BG)
    px = img.load()
    cx, cy = int(W * 0.35), int(H * 0.35)
    for y in range(0, H, 2):
        for x in range(0, W, 2):
            d = math.sqrt((x - cx) ** 2 + (y - cy) ** 2)
            t = min(1.0, d / (W * 0.7))
            v = int(16 * (1 - t ** 1.5))
            c = (5 + v, 5 + v, 5 + v)
            px[x, y] = c
            if x + 1 < W: px[x + 1, y] = c
            if y + 1 < H: px[x, y + 1] = c
            if x + 1 < W and y + 1 < H: px[x + 1, y + 1] = c

    img = light_beam(img, int(W * 0.3), 8)
    img = white_bokeh(img, 8, seed=sn * 19)
    img = film_grain(img, 3)
    img = vignette(img, 0.7)

    draw = ImageDraw.Draw(img)
    header(draw, True)
    corners(draw, (38, 38, 38))

    nf = HEADLINE(180)
    ns = f"{num:02d}"
    nb = draw.textbbox((70, 130), ns, font=nf)
    img = white_glow(img, ns, nf, 70, 130, 14, 35)
    draw = ImageDraw.Draw(img)
    draw.text((70, 130), ns, font=nf, fill=WHITE)

    lx = nb[2] + 18
    draw.line([(lx, 163), (lx, 318)], fill=WHITE, width=2)

    tf = HEADLINE(52)
    tl = wrap_text(title.upper(), tf, W - lx - 80, draw)
    ty = 178
    for ln in tl:
        draw.text((lx + 22, ty), ln, font=tf, fill=WHITE)
        ty += 62

    thin_line(draw, 405, 70, W - 70, MED_GRAY, 1)

    sf = BODY(27)
    sl = wrap_text(sub, sf, W - 180, draw)
    sy = 448
    for ln in sl:
        draw.text((90, sy), ln, font=sf, fill=LIGHT_GRAY)
        sy += 40

    footer(draw, sn, tot, True)
    img.save(out, quality=95)
    print(f"  \u2713 {os.path.basename(out)}")


def NUM_WHITE(num, title, sub, sn, tot, out):
    img = Image.new("RGB", (W, H), OFF_WHITE)
    px = img.load()
    for y in range(H):
        for x in range(0, W, 2):
            v = int(245 - 4 * (y / H))
            px[x, y] = (v, v, v)
            if x + 1 < W: px[x + 1, y] = (v, v, v)

    draw = ImageDraw.Draw(img)
    header(draw, False)
    corners(draw, (195, 195, 195))

    nf = HEADLINE(180)
    ns = f"{num:02d}"
    nb = draw.textbbox((70, 130), ns, font=nf)
    draw.text((70, 130), ns, font=nf, fill=BLACK)

    lx = nb[2] + 18
    draw.line([(lx, 163), (lx, 318)], fill=BLACK, width=2)

    tf = HEADLINE(52)
    tl = wrap_text(title.upper(), tf, W - lx - 80, draw)
    ty = 178
    for ln in tl:
        draw.text((lx + 22, ty), ln, font=tf, fill=BLACK)
        ty += 62

    thin_line(draw, 405, 70, W - 70, BLACK, 1)

    sf = BODY(27)
    sl = wrap_text(sub, sf, W - 180, draw)
    sy = 448
    for ln in sl:
        draw.text((90, sy), ln, font=sf, fill=DARK_GRAY)
        sy += 40

    footer(draw, sn, tot, False)
    img.save(out, quality=95)
    print(f"  \u2713 {os.path.basename(out)}")


def RECAP(char_path, title, points, sn, tot, out):
    ch = Image.open(char_path).resize((W, H), Image.LANCZOS)
    ch = ImageEnhance.Brightness(ch).enhance(0.15)
    ov = Image.new("RGBA", (W, H), (0, 0, 0, 200))
    img = Image.alpha_composite(ch.convert("RGBA"), ov).convert("RGB")
    img = vignette(img, 0.75)
    img = white_bokeh(img, 6, seed=99)
    img = film_grain(img, 3)

    draw = ImageDraw.Draw(img)
    header(draw, True)
    corners(draw, (42, 42, 42))

    tf = HEADLINE(58)
    bb = draw.textbbox((0, 0), title, font=tf)
    tx = (W - (bb[2] - bb[0])) // 2
    img = white_glow(img, title, tf, tx, 85, 12, 40)
    draw = ImageDraw.Draw(img)
    centered(draw, 85, title, tf, WHITE)

    thin_line(draw, 152, 240, W - 240, WHITE, 1)

    nf = HEADLINE(28)
    pf = BODY(23)
    y = 190
    for i, pt in enumerate(points):
        ns = f"{i + 1:02d}"
        draw.text((100, y), ns, font=nf, fill=WHITE)
        draw.line([(142, y + 6), (142, y + 25)], fill=MED_GRAY, width=1)
        draw.text((158, y + 3), pt, font=pf, fill=LIGHT_GRAY)
        y += 52

    footer(draw, sn, tot, True)
    img.save(out, quality=95)
    print(f"  \u2713 {os.path.basename(out)}")


def CTA(char_path, cta, out):
    ch = Image.open(char_path).resize((W, H), Image.LANCZOS)
    ch = ImageEnhance.Brightness(ch).enhance(0.25)
    img = ch.copy()
    img = gradient_darken(img, 250, H - 80, 0.88, 80)
    img = vignette(img, 0.7)
    img = light_beam(img, W // 2, 10)
    img = white_bokeh(img, 10, seed=77)
    img = film_grain(img, 3)

    draw = ImageDraw.Draw(img)
    header(draw, True)
    corners(draw, (42, 42, 42))

    df = HEADLINE(150)
    bb = draw.textbbox((0, 0), "DS", font=df)
    x = (W - (bb[2] - bb[0])) // 2
    img = white_glow(img, "DS", df, x, 290, 22, 60)
    draw = ImageDraw.Draw(img)
    outlined(draw, x, 290, "DS", df, WHITE, BLACK, 3)

    mf = HEADLINE(60)
    centered(draw, 438, "MARKETING", mf, LIGHT_GRAY)

    thin_line(draw, 516, 280, W - 280, WHITE, 2)

    cf = HEADLINE(44)
    centered(draw, 550, cta, cf, WHITE)

    hf = BODY_BOLD(24)
    centered(draw, 615, "@dsmarketing.agency", hf, MED_GRAY)

    wf = BODY(15)
    centered(draw, 658, "dsmarketing.lovable.app", wf, (65, 65, 65))

    footer(draw, dark=True)
    img.save(out, quality=95)
    print(f"  \u2713 {os.path.basename(out)}")


def TEXT_SLIDE(title, lines, sn, tot, out):
    img = Image.new("RGB", (W, H), DARK_BG)
    px = img.load()
    cx, cy = W // 2, H // 3
    for y in range(0, H, 2):
        for x in range(0, W, 2):
            d = math.sqrt((x - cx) ** 2 + (y - cy) ** 2)
            t = min(1.0, d / (W * 0.65))
            v = int(12 * (1 - t ** 1.6))
            c = (5 + v, 5 + v, 5 + v)
            px[x, y] = c
            if x + 1 < W: px[x + 1, y] = c
            if y + 1 < H: px[x, y + 1] = c
            if x + 1 < W and y + 1 < H: px[x + 1, y + 1] = c

    img = light_beam(img, W // 2, 6)
    img = white_bokeh(img, 6, seed=33)
    img = film_grain(img, 3)
    img = vignette(img, 0.7)

    draw = ImageDraw.Draw(img)
    header(draw, True)
    corners(draw, (38, 38, 38))

    tf = HEADLINE(54)
    bb = draw.textbbox((0, 0), title, font=tf)
    tx = (W - (bb[2] - bb[0])) // 2
    img = white_glow(img, title, tf, tx, 100, 11, 35)
    draw = ImageDraw.Draw(img)
    centered(draw, 100, title, tf, WHITE)

    thin_line(draw, 165, 260, W - 260, MED_GRAY, 1)

    bf = BODY(27)
    y = 205
    for ln in lines:
        if ln == "":
            y += 22
            continue
        centered(draw, y, ln, bf, LIGHT_GRAY)
        y += 44

    footer(draw, sn, tot, True)
    img.save(out, quality=95)
    print(f"  \u2713 {os.path.basename(out)}")


# ══════════════════════════════════════════════
# CONTENT
# ══════════════════════════════════════════════

MON = [
    (1, "Posting without a content plan",
     "Random posts = random results. A plan turns chaos into consistency and consistency builds trust.", "scroller"),
    (2, "Ignoring your analytics",
     "The data tells you exactly what works. Stop guessing. Start reading the numbers.", None),
    (3, "Buying followers for vanity",
     "10K fake followers won't buy your product. Real engagement beats inflated numbers every time.", "scroller"),
    (4, "No consistent brand voice",
     "If your audience can't recognize you in 2 seconds, you don't have a brand. You have noise.", None),
    (5, "Same content everywhere",
     "What works on Instagram doesn't work on LinkedIn. Each platform speaks its own language.", "frustrated"),
    (6, "Zero audience engagement",
     "Posting and disappearing tells the algorithm you don't care. It stops showing your content.", None),
    (7, "No post-publish strategy",
     "Publishing is 20% of the work. Distribution, engagement, and repurposing is the other 80%.", "thinker"),
]

WED = [
    (1, "Monday \u2014 Educational",
     "Tips, how-tos, frameworks. Prove your expertise from day one.", "thinker"),
    (2, "Tuesday \u2014 Industry insights",
     "Share trends your audience hasn't seen. Be the one who sees what's coming.", None),
    (3, "Wednesday \u2014 Case study",
     "Real numbers, real results. Nothing builds trust faster than evidence.", "winner"),
    (4, "Thursday \u2014 Behind the scenes",
     "Show your process, your team. People buy from people they trust.", None),
    (5, "Friday \u2014 Engagement",
     "Ask questions. Run polls. Start debates. Let your audience talk.", "presenter"),
    (6, "Weekend \u2014 Brand story",
     "Your mission. Your values. Build connection, not just reach.", None),
    (7, "Secret \u2014 Batch Monday",
     "Create the full week in one sitting. Then spend the rest engaging.", "visionary"),
]


# ══════════════════════════════════════════════
# MAIN
# ══════════════════════════════════════════════

def main():
    print()
    print("  \u2554" + "\u2550" * 50 + "\u2557")
    print("  \u2551  DS MARKETING IMAGE ENGINE v1.0               \u2551")
    print("  \u2551  Smart Multi-Seed AI + Auto Quality Select     \u2551")
    print("  \u2551  Pure Black & White. Your Brand. Your Rules.   \u2551")
    print("  \u255a" + "\u2550" * 50 + "\u255d")
    print()
    print(f"  Settings:")
    print(f"    Generation size:  {GEN_SIZE}x{GEN_SIZE}px (downscaled to {W}x{H})")
    print(f"    Attempts/char:    {ATTEMPTS_PER_CHAR} (picks best quality)")
    print(f"    Output folder:    {OUT}/")
    print()

    dirs = {k: f"{OUT}/{k}" for k in ["characters", "monday", "wednesday", "friday"]}
    for d in dirs.values():
        os.makedirs(d, exist_ok=True)

    # ─── Characters ───
    print("  STEP 1: AI Character Generation")
    print("  " + "\u2500" * 50)
    cp = {}
    total_chars = len(CHARACTERS)
    for idx, (name, prompt) in enumerate(CHARACTERS.items()):
        p = f"{dirs['characters']}/{name}.png"
        cp[name] = p
        generate_character(name, prompt, p)
        if idx < total_chars - 1:
            time.sleep(2)

    # Clean temp dir
    temp_dir = f"{OUT}/_temp"
    if os.path.exists(temp_dir):
        try: os.rmdir(temp_dir)
        except: pass

    # ─── MONDAY ───
    print(f"\n  STEP 2: MONDAY \u2014 7 Social Media Mistakes")
    print("  " + "\u2500" * 50)
    M = dirs["monday"]

    HOOK(cp["frustrated"], "YOUR SOCIAL MEDIA ISN'T FAILING.",
         "YOUR STRATEGY IS.", "7 MISTAKES KILLING YOUR GROWTH",
         f"{M}/slide_01_hook.png")

    for num, t, s, ch in MON:
        sn = num + 1
        if ch:
            NUM_CHAR(cp[ch], num, t, s, sn, 10, f"{M}/slide_{sn:02d}.png")
        elif num % 2 == 0:
            NUM_WHITE(num, t, s, sn, 10, f"{M}/slide_{sn:02d}.png")
        else:
            NUM_DARK(num, t, s, sn, 10, f"{M}/slide_{sn:02d}.png")

    RECAP(cp["ceo"], "QUICK RECAP",
          ["No content plan", "Ignoring analytics", "Buying fake followers",
           "Inconsistent brand voice", "Same content everywhere",
           "Not engaging", "No post-publish strategy"],
          9, 10, f"{M}/slide_09_recap.png")
    CTA(cp["visionary"], "FOLLOW FOR MORE", f"{M}/slide_10_cta.png")

    # ─── WEDNESDAY ───
    print(f"\n  STEP 3: WEDNESDAY \u2014 Perfect Content Calendar")
    print("  " + "\u2500" * 50)
    WD = dirs["wednesday"]

    HOOK(cp["presenter"], "STOP POSTING RANDOMLY.",
         "START POSTING STRATEGICALLY.", "YOUR WEEKLY CONTENT FRAMEWORK",
         f"{WD}/slide_01_hook.png")

    for num, t, s, ch in WED:
        sn = num + 1
        if ch:
            NUM_CHAR(cp[ch], num, t, s, sn, 10, f"{WD}/slide_{sn:02d}.png")
        elif num % 2 == 1:
            NUM_WHITE(num, t, s, sn, 10, f"{WD}/slide_{sn:02d}.png")
        else:
            NUM_DARK(num, t, s, sn, 10, f"{WD}/slide_{sn:02d}.png")

    RECAP(cp["presenter"], "YOUR WEEKLY FRAMEWORK",
          ["MON \u2014 Educate", "TUE \u2014 Industry insights", "WED \u2014 Case studies",
           "THU \u2014 Behind the scenes", "FRI \u2014 Engage",
           "SAT/SUN \u2014 Brand story", "SECRET \u2014 Batch Monday"],
          9, 10, f"{WD}/slide_09_recap.png")
    CTA(cp["visionary"], "SAVE THIS FRAMEWORK", f"{WD}/slide_10_cta.png")

    # ─── FRIDAY ───
    print(f"\n  STEP 4: FRIDAY \u2014 The 3-Second Rule")
    print("  " + "\u2500" * 50)
    FR = dirs["friday"]

    HOOK(cp["clock"], "YOU HAVE 3 SECONDS.", "",
         "THE RULE THAT CHANGES EVERYTHING", f"{FR}/slide_01_hook.png")

    TEXT_SLIDE("THE 3-SECOND RULE",
              ["Your audience decides in 3 seconds", "whether to stop scrolling", "or keep going.",
               "", "That means your hook is everything.", "", "Not your logo.",
               "Not your color palette.", "Not your font choice.", "",
               "Your first line.", "", "That's where the battle", "is won or lost."],
              2, 3, f"{FR}/slide_02.png")

    CTA(cp["rocket"], "MAKE EVERY HOOK COUNT", f"{FR}/slide_03_cta.png")

    # ─── DONE ───
    print()
    print("  \u2554" + "\u2550" * 50 + "\u2557")
    print("  \u2551  ALL DONE \u2014 IMAGE ENGINE COMPLETE              \u2551")
    print("  \u255a" + "\u2550" * 50 + "\u255d")
    print(f"""
  Your slides: {OUT}/

     monday/      10 slides
     wednesday/   10 slides
     friday/       3 slides
     characters/   9 AI characters (best of {ATTEMPTS_PER_CHAR} each)

  HOW TO POST:
  1. Open {OUT}/ folder
  2. Upload carousels to Instagram
  3. Copy captions from GitHub repo

  Pure Black & White. Your Brand. Maximum Impact.
""")


if __name__ == "__main__":
    main()
