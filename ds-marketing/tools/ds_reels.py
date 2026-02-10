#!/usr/bin/env python3
"""
DS MARKETING REELS ENGINE v2.0
=================================
Premium Instagram Reels with:
- Ultra-human AI voiceover (natural pauses, emphasis, cadence)
- Cinema-grade animated frames with character integration
- Dark cinematic ambient soundtrack
- 9:16 vertical MP4 ready for Instagram

Run: python3 ds_reels.py
"""

import os, sys, subprocess, asyncio, random, math, time

# ── Auto-install ──
def ensure(pkg, pip_name=None):
    try: __import__(pkg)
    except ImportError:
        print(f"  Installing {pip_name or pkg}...")
        subprocess.check_call([sys.executable, "-m", "pip", "install", pip_name or pkg],
                              stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)

ensure("PIL", "Pillow")
ensure("moviepy")
ensure("edge_tts", "edge-tts")
ensure("numpy")

from PIL import Image, ImageDraw, ImageFont, ImageFilter, ImageEnhance
import numpy as np

try:
    from moviepy import (
        ImageClip, AudioFileClip, CompositeVideoClip,
        concatenate_videoclips, ColorClip, CompositeAudioClip
    )
    MV2 = True
except ImportError:
    from moviepy.editor import (
        ImageClip, AudioFileClip, CompositeVideoClip,
        concatenate_videoclips, ColorClip, CompositeAudioClip
    )
    MV2 = False

import edge_tts

# ══════════════════════════════════════════════
# CONFIG
# ══════════════════════════════════════════════
W, H = 1080, 1920
OUT = "ds-marketing-reels"
FPS = 30

# Voice: "en-US-DavisNeural" = deep authoritative male, sounds like a podcast host
# Other great options:
#   "en-US-AndrewMultilingualNeural"  — very natural conversational male
#   "en-US-BrianMultilingualNeural"   — smooth natural male
#   "en-US-JennyMultilingualNeural"   — natural female
#   "en-GB-RyanNeural"                — British male (premium feel)
VOICE = "en-US-DavisNeural"

BLACK = (0, 0, 0)
WHITE = (255, 255, 255)
NEAR_BLACK = (8, 8, 8)
DARK_GRAY = (26, 26, 26)
MED_GRAY = (100, 100, 100)
LIGHT_GRAY = (190, 190, 190)


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

def BOLD(sz):
    return _f([
        "/System/Library/Fonts/Supplemental/Arial Bold.ttf",
        "/Library/Fonts/Arial Bold.ttf",
        "/System/Library/Fonts/Helvetica-Bold.otf",
        "/usr/share/fonts/truetype/liberation/LiberationSans-Bold.ttf",
    ], sz)

def REG(sz):
    return _f([
        "/System/Library/Fonts/Supplemental/Arial.ttf",
        "/Library/Fonts/Arial.ttf",
        "/System/Library/Fonts/Helvetica.ttc",
        "/usr/share/fonts/truetype/liberation/LiberationSans-Regular.ttf",
    ], sz)


# ══════════════════════════════════════════════
# AI VOICE ENGINE v2 — Natural Human Sound
# ══════════════════════════════════════════════

async def _gen_voice(text, path, voice=VOICE, rate="-8%", pitch="-2Hz"):
    """
    Generate voice with natural pacing.
    rate=-8% slows it slightly for authority.
    pitch=-2Hz deepens it slightly for gravitas.
    """
    communicate = edge_tts.Communicate(text, voice, rate=rate, pitch=pitch)
    await communicate.save(path)


def make_voice(text, path, voice=VOICE, rate="-8%", pitch="-2Hz"):
    """Generate AI voiceover — deep, authoritative, human-like."""
    if os.path.exists(path) and os.path.getsize(path) > 1000:
        print(f"    \u2713 voice cached")
        return True
    try:
        asyncio.run(_gen_voice(text, path, voice, rate, pitch))
        if os.path.exists(path) and os.path.getsize(path) > 1000:
            print(f"    \u2713 voice generated")
            return True
    except Exception as e:
        print(f"    ! voice failed: {e}")
    return False


# ══════════════════════════════════════════════
# CINEMATIC MUSIC v2 — Darker, Richer
# ══════════════════════════════════════════════

def make_music(path, duration=40, sr=44100):
    """Dark cinematic ambient — deeper, richer, more layered."""
    if os.path.exists(path) and os.path.getsize(path) > 5000:
        print(f"    \u2713 music cached")
        return True
    try:
        import wave
        t = np.linspace(0, duration, int(sr * duration), endpoint=False)

        # Ultra-deep sub bass
        sub = 0.18 * np.sin(2 * np.pi * 36 * t)
        # Warm bass
        bass = 0.12 * np.sin(2 * np.pi * 55 * t)
        # Power fifth
        fifth = 0.08 * np.sin(2 * np.pi * 82.5 * t)
        # Octave warmth
        oct_w = 0.05 * np.sin(2 * np.pi * 110 * t)

        # Breathing pad (slow swell)
        breath = 0.07 * np.sin(2 * np.pi * 146.8 * t) * (0.4 + 0.6 * np.sin(2 * np.pi * 0.08 * t))
        # High ethereal pad
        ether = 0.04 * np.sin(2 * np.pi * 220 * t) * (0.3 + 0.4 * np.sin(2 * np.pi * 0.05 * t))
        # Sparkle (very subtle high overtone)
        sparkle = 0.015 * np.sin(2 * np.pi * 660 * t) * (0.2 + 0.3 * np.sin(2 * np.pi * 0.12 * t))

        # Slow rhythmic pulse (heartbeat feel)
        pulse_env = np.abs(np.sin(2 * np.pi * 0.5 * t)) ** 4
        pulse = 0.06 * np.sin(2 * np.pi * 73.4 * t) * pulse_env

        audio = sub + bass + fifth + oct_w + breath + ether + sparkle + pulse

        # Smooth fade in/out
        fade = int(sr * 3)
        audio[:fade] *= np.linspace(0, 1, fade)
        audio[-fade:] *= np.linspace(1, 0, fade)
        audio = audio / np.max(np.abs(audio)) * 0.35
        audio_16 = (audio * 32767).astype(np.int16)

        with wave.open(path, 'w') as wf:
            wf.setnchannels(1)
            wf.setsampwidth(2)
            wf.setframerate(sr)
            wf.writeframes(audio_16.tobytes())

        print(f"    \u2713 cinematic music generated ({duration}s)")
        return True
    except Exception as e:
        print(f"    ! music failed: {e}")
        return False


# ══════════════════════════════════════════════
# FRAME ENGINE v2 — Cinema Grade
# ══════════════════════════════════════════════

def _vignette(img, s=0.72):
    """Strong cinematic vignette."""
    w, h = img.size
    mask = Image.new("L", (w, h), 0)
    d = ImageDraw.Draw(mask)
    cx, cy = w // 2, h // 2
    mr = int(max(w, h) * s)
    for r in range(mr, 0, -1):
        d.ellipse([cx - r, cy - r, cx + r, cy + r], fill=int(255 * (r / mr) ** 0.65))
    return Image.composite(img, Image.new("RGB", (w, h), BLACK), mask)


def _grain(img, amt=5):
    px = img.load()
    w, h = img.size
    rng = random.Random(42)
    for _ in range(w * h // 5):
        x, y = rng.randint(0, w - 1), rng.randint(0, h - 1)
        r, g, b = px[x, y]
        v = rng.randint(-amt, amt)
        px[x, y] = (max(0, min(255, r + v)), max(0, min(255, g + v)), max(0, min(255, b + v)))
    return img


def _particles(img, count=30, seed=42):
    """Floating white light particles."""
    w, h = img.size
    ov = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    rng = random.Random(seed)
    for _ in range(count):
        x, y = rng.randint(0, w), rng.randint(0, h)
        r = rng.randint(3, 20)
        a = rng.randint(8, 35)
        c = Image.new("RGBA", (r * 2, r * 2), (0, 0, 0, 0))
        ImageDraw.Draw(c).ellipse([0, 0, r * 2, r * 2], fill=(255, 255, 255, a))
        c = c.filter(ImageFilter.GaussianBlur(radius=r // 2))
        ov.paste(c, (x - r, y - r), c)
    return Image.alpha_composite(img.convert("RGBA"), ov).convert("RGB")


def _gradient_overlay(img, y_start_pct=0.3, strength=0.95):
    """Gradient black overlay from y_start to bottom."""
    w, h = img.size
    ov = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    d = ImageDraw.Draw(ov)
    y_start = int(h * y_start_pct)
    for y in range(y_start, h):
        t = (y - y_start) / (h - y_start)
        alpha = int(255 * strength * (t ** 1.1))
        d.line([(0, y), (w, y)], fill=(0, 0, 0, min(255, alpha)))
    return Image.alpha_composite(img.convert("RGBA"), ov).convert("RGB")


def _top_gradient(img, strength=0.6):
    """Gradient from top for header area."""
    w, h = img.size
    ov = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    d = ImageDraw.Draw(ov)
    zone = int(h * 0.2)
    for y in range(zone):
        t = 1 - (y / zone)
        alpha = int(255 * strength * (t ** 1.5))
        d.line([(0, y), (w, y)], fill=(0, 0, 0, min(255, alpha)))
    return Image.alpha_composite(img.convert("RGBA"), ov).convert("RGB")


def _outlined(draw, x, y, text, font, fill=WHITE, outline=BLACK, w=3):
    for dx in range(-w, w + 1):
        for dy in range(-w, w + 1):
            if dx * dx + dy * dy <= w * w:
                draw.text((x + dx, y + dy), text, font=font, fill=outline)
    draw.text((x, y), text, font=font, fill=fill)


def _centered(draw, y, text, font, fill=WHITE, img_w=W):
    bb = draw.textbbox((0, 0), text, font=font)
    x = (img_w - (bb[2] - bb[0])) // 2
    draw.text((x, y), text, font=font, fill=fill)
    return x


def _centered_out(draw, y, text, font, fill=WHITE, outline=BLACK, ow=3, img_w=W):
    bb = draw.textbbox((0, 0), text, font=font)
    x = (img_w - (bb[2] - bb[0])) // 2
    _outlined(draw, x, y, text, font, fill, outline, ow)
    return x


def _wrap(text, font, max_w, draw):
    words = text.split()
    lines, cur = [], ""
    for w in words:
        t = f"{cur} {w}".strip()
        if draw.textbbox((0, 0), t, font=font)[2] <= max_w: cur = t
        else:
            if cur: lines.append(cur)
            cur = w
    if cur: lines.append(cur)
    return lines


# ── Frame Types ──

def frame_character_hero(char_path, headline_lines, subtitle=None):
    """
    HERO FRAME: Character fills 65% of frame, text overlaid at bottom.
    The character is the star. Bold, prominent, CashFish-style.
    """
    img = Image.new("RGB", (W, H), BLACK)

    if char_path and os.path.exists(char_path):
        ch = Image.open(char_path).convert("RGB")
        # Scale to fill width, make character BIG
        scale = W / ch.width
        new_h = int(ch.height * scale)
        if new_h < int(H * 0.65):
            # Scale even bigger
            scale = (H * 0.7) / ch.height
            new_w = int(ch.width * scale)
            ch = ch.resize((new_w, int(H * 0.7)), Image.LANCZOS)
            # Center horizontally
            x_off = (W - new_w) // 2
            img.paste(ch, (x_off, 0))
        else:
            ch = ch.resize((W, new_h), Image.LANCZOS)
            img.paste(ch, (0, 0))

        # Brighten character significantly
        img = ImageEnhance.Brightness(img).enhance(1.4)
        img = ImageEnhance.Contrast(img).enhance(1.3)
        img = ImageEnhance.Sharpness(img).enhance(1.4)

        # Desaturate to B&W
        gray = img.convert("L").convert("RGB")
        img = Image.blend(img, gray, 0.88)

    # Heavy gradient from bottom (text zone)
    img = _gradient_overlay(img, 0.35, 0.95)
    img = _top_gradient(img, 0.4)
    img = _vignette(img, 0.75)
    img = _particles(img, 20, seed=hash(str(headline_lines)) % 9999)
    img = _grain(img, 4)

    draw = ImageDraw.Draw(img)

    # Headline — MASSIVE text
    hf = HEADLINE(90)
    y_pos = int(H * 0.62)
    for i, ln in enumerate(headline_lines):
        _centered_out(draw, y_pos + i * 100, ln, hf, WHITE, BLACK, 3)

    # Subtitle
    if subtitle:
        sf = REG(38)
        sub_lines = _wrap(subtitle, sf, W - 120, draw)
        sy = y_pos + len(headline_lines) * 100 + 30
        for sl in sub_lines:
            _centered(draw, sy, sl, sf, LIGHT_GRAY)
            sy += 50

    # Brand bar
    draw.line([(120, H - 200), (W - 120, H - 200)], fill=(40, 40, 40), width=1)
    bf = BOLD(28)
    _centered(draw, H - 165, "@dsmarketing.agency", bf, MED_GRAY)
    wf = REG(20)
    _centered(draw, H - 128, "dsmarketing.lovable.app", wf, (55, 55, 55))

    return img


def frame_number_point(number, title, subtitle=None):
    """
    NUMBERED POINT: Giant number + title + subtitle.
    Clean, bold, editorial.
    """
    img = Image.new("RGB", (W, H), BLACK)

    # Subtle radial gradient for depth
    draw = ImageDraw.Draw(img)
    cx, cy = W // 2, int(H * 0.4)
    for y in range(0, H, 2):
        for x in range(0, W, 2):
            d = math.sqrt((x - cx) ** 2 + (y - cy) ** 2)
            t = min(1.0, d / (max(W, H) * 0.5))
            v = int(14 * (1 - t ** 1.4))
            c = (v, v, v)
            img.putpixel((x, y), c)
            if x + 1 < W: img.putpixel((x + 1, y), c)
            if y + 1 < H: img.putpixel((x, y + 1), c)
            if x + 1 < W and y + 1 < H: img.putpixel((x + 1, y + 1), c)

    img = _particles(img, 15, seed=int(number) * 17)
    img = _vignette(img, 0.68)
    img = _grain(img, 3)

    draw = ImageDraw.Draw(img)

    # Giant number
    nf = HEADLINE(320)
    ns = f"{int(number):02d}"
    bb = draw.textbbox((0, 0), ns, font=nf)
    nx = (W - (bb[2] - bb[0])) // 2
    ny = int(H * 0.22)

    # Glow behind number
    glow = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    gd = ImageDraw.Draw(glow)
    for dx in range(-2, 3):
        for dy in range(-2, 3):
            gd.text((nx + dx, ny + dy), ns, font=nf, fill=(255, 255, 255, 30))
    glow = glow.filter(ImageFilter.GaussianBlur(radius=20))
    img = Image.alpha_composite(img.convert("RGBA"), glow).convert("RGB")
    draw = ImageDraw.Draw(img)

    _outlined(draw, nx, ny, ns, nf, WHITE, BLACK, 4)

    # Thin line under number
    line_y = ny + (bb[3] - bb[1]) + 30
    draw.line([(200, line_y), (W - 200, line_y)], fill=WHITE, width=2)

    # Title
    tf = HEADLINE(64)
    title_lines = _wrap(title.upper(), tf, W - 120, draw)
    ty = line_y + 50
    for ln in title_lines:
        _centered_out(draw, ty, ln, tf, WHITE, BLACK, 2)
        ty += 76

    # Subtitle
    if subtitle:
        sf = REG(34)
        sub_lines = _wrap(subtitle, sf, W - 140, draw)
        sy = ty + 30
        for sl in sub_lines:
            _centered(draw, sy, sl, sf, LIGHT_GRAY)
            sy += 48

    # Brand
    draw.line([(120, H - 200), (W - 120, H - 200)], fill=(35, 35, 35), width=1)
    _centered(draw, H - 165, "@dsmarketing.agency", BOLD(26), MED_GRAY)

    return img


def frame_big_text(lines, subtitle=None):
    """
    BIG TEXT FRAME: Maximum impact text on black.
    For statements that need to hit hard.
    """
    img = Image.new("RGB", (W, H), BLACK)

    # Subtle gradient
    draw = ImageDraw.Draw(img)
    for y in range(H):
        v = int(4 + 10 * (1 - abs(y - H * 0.45) / (H * 0.55)) ** 2)
        draw.line([(0, y), (W, y)], fill=(v, v, v))

    img = _particles(img, 12, seed=hash(str(lines)) % 9999)
    img = _vignette(img, 0.7)
    img = _grain(img, 3)

    draw = ImageDraw.Draw(img)

    # Calculate vertical center
    hf = HEADLINE(82)
    total_lines = len(lines)
    line_h = 96
    total_h = total_lines * line_h
    start_y = (H - total_h) // 2 - 40

    for i, ln in enumerate(lines):
        # Glow
        glow = Image.new("RGBA", (W, H), (0, 0, 0, 0))
        gd = ImageDraw.Draw(glow)
        bb = gd.textbbox((0, 0), ln, font=hf)
        gx = (W - (bb[2] - bb[0])) // 2
        for dx in range(-2, 3):
            for dy in range(-2, 3):
                gd.text((gx + dx, start_y + i * line_h + dy), ln, font=hf, fill=(255, 255, 255, 25))
        glow = glow.filter(ImageFilter.GaussianBlur(radius=12))
        img = Image.alpha_composite(img.convert("RGBA"), glow).convert("RGB")
        draw = ImageDraw.Draw(img)

        _centered_out(draw, start_y + i * line_h, ln, hf, WHITE, BLACK, 3)

    # Subtitle
    if subtitle:
        sf = REG(36)
        sub_lines = _wrap(subtitle, sf, W - 140, draw)
        sy = start_y + total_lines * line_h + 50
        for sl in sub_lines:
            _centered(draw, sy, sl, sf, LIGHT_GRAY)
            sy += 48

    # Brand
    draw.line([(120, H - 200), (W - 120, H - 200)], fill=(35, 35, 35), width=1)
    _centered(draw, H - 165, "@dsmarketing.agency", BOLD(26), MED_GRAY)

    return img


def frame_day(day_name, description):
    """
    DAY FRAME: Large day name with description.
    For the content calendar reel.
    """
    img = Image.new("RGB", (W, H), BLACK)

    # Gradient center glow
    draw = ImageDraw.Draw(img)
    cx, cy = W // 2, int(H * 0.38)
    for y in range(0, H, 2):
        for x in range(0, W, 2):
            d = math.sqrt((x - cx) ** 2 + (y - cy) ** 2)
            t = min(1.0, d / (W * 0.6))
            v = int(18 * (1 - t ** 1.3))
            img.putpixel((x, y), (v, v, v))
            if x + 1 < W: img.putpixel((x + 1, y), (v, v, v))
            if y + 1 < H: img.putpixel((x, y + 1), (v, v, v))
            if x + 1 < W and y + 1 < H: img.putpixel((x + 1, y + 1), (v, v, v))

    img = _particles(img, 10, seed=hash(day_name) % 9999)
    img = _vignette(img, 0.68)
    img = _grain(img, 3)

    draw = ImageDraw.Draw(img)

    # Day name — HUGE
    df = HEADLINE(130)
    bb = draw.textbbox((0, 0), day_name.upper(), font=df)
    dx = (W - (bb[2] - bb[0])) // 2
    dy = int(H * 0.32)

    # Glow
    glow = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    gd = ImageDraw.Draw(glow)
    for ddx in range(-2, 3):
        for ddy in range(-2, 3):
            gd.text((dx + ddx, dy + ddy), day_name.upper(), font=df, fill=(255, 255, 255, 35))
    glow = glow.filter(ImageFilter.GaussianBlur(radius=16))
    img = Image.alpha_composite(img.convert("RGBA"), glow).convert("RGB")
    draw = ImageDraw.Draw(img)

    _outlined(draw, dx, dy, day_name.upper(), df, WHITE, BLACK, 3)

    # Thin line
    line_y = dy + (bb[3] - bb[1]) + 30
    draw.line([(180, line_y), (W - 180, line_y)], fill=WHITE, width=1)

    # Description
    sf = REG(38)
    desc_lines = _wrap(description, sf, W - 140, draw)
    sy = line_y + 40
    for sl in desc_lines:
        _centered(draw, sy, sl, sf, LIGHT_GRAY)
        sy += 52

    # Brand
    draw.line([(120, H - 200), (W - 120, H - 200)], fill=(35, 35, 35), width=1)
    _centered(draw, H - 165, "@dsmarketing.agency", BOLD(26), MED_GRAY)

    return img


def frame_cta():
    """CTA final frame — Follow / Save."""
    img = Image.new("RGB", (W, H), BLACK)

    draw = ImageDraw.Draw(img)
    # Center glow
    cx, cy = W // 2, H // 2
    for y in range(0, H, 2):
        for x in range(0, W, 2):
            d = math.sqrt((x - cx) ** 2 + (y - cy) ** 2)
            t = min(1.0, d / (W * 0.5))
            v = int(20 * (1 - t ** 1.5))
            img.putpixel((x, y), (v, v, v))
            if x + 1 < W: img.putpixel((x + 1, y), (v, v, v))
            if y + 1 < H: img.putpixel((x, y + 1), (v, v, v))
            if x + 1 < W and y + 1 < H: img.putpixel((x + 1, y + 1), (v, v, v))

    img = _particles(img, 25, seed=777)
    img = _vignette(img, 0.65)
    img = _grain(img, 3)

    draw = ImageDraw.Draw(img)

    # DS massive
    dsf = HEADLINE(200)
    bb = draw.textbbox((0, 0), "DS", font=dsf)
    dx = (W - (bb[2] - bb[0])) // 2
    dy = int(H * 0.28)

    glow = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    gd = ImageDraw.Draw(glow)
    for ddx in range(-3, 4):
        for ddy in range(-3, 4):
            gd.text((dx + ddx, dy + ddy), "DS", font=dsf, fill=(255, 255, 255, 40))
    glow = glow.filter(ImageFilter.GaussianBlur(radius=24))
    img = Image.alpha_composite(img.convert("RGBA"), glow).convert("RGB")
    draw = ImageDraw.Draw(img)

    _outlined(draw, dx, dy, "DS", dsf, WHITE, BLACK, 4)

    # MARKETING
    mf = HEADLINE(72)
    _centered(draw, dy + 190, "MARKETING", mf, LIGHT_GRAY)

    # Line
    draw.line([(200, dy + 290), (W - 200, dy + 290)], fill=WHITE, width=2)

    # Handle
    hf = BOLD(36)
    _centered(draw, dy + 330, "@dsmarketing.agency", hf, WHITE)

    # Website
    wf = REG(24)
    _centered(draw, dy + 390, "dsmarketing.lovable.app", wf, MED_GRAY)

    # FOLLOW FOR MORE
    ff = HEADLINE(52)
    _centered(draw, dy + 480, "FOLLOW FOR MORE", ff, WHITE)

    return img


# ══════════════════════════════════════════════
# VIDEO BUILD ENGINE
# ══════════════════════════════════════════════

def zoom_fx(clip, z1=1.0, z2=1.1):
    dur = clip.duration
    w, h = clip.size
    def apply(get_frame, t):
        p = t / dur if dur > 0 else 0
        z = z1 + (z2 - z1) * p
        frame = get_frame(t)
        nw, nh = int(w / z), int(h / z)
        x1, y1 = (w - nw) // 2, (h - nh) // 2
        crop = frame[y1:y1 + nh, x1:x1 + nw]
        from PIL import Image as PI
        return np.array(PI.fromarray(crop).resize((w, h), PI.LANCZOS))
    return clip.transform(apply)


def render_reel(scenes, voice_path, music_path, out_path):
    """Build final MP4 from scenes + voice + music."""
    clips = []
    for i, sc in enumerate(scenes):
        tp = f"{OUT}/_tf_{i}.png"
        sc["image"].save(tp, quality=95)
        cl = ImageClip(tp).with_duration(sc["dur"])
        # Alternate zoom for dynamism
        if i % 3 == 0:
            cl = zoom_fx(cl, 1.0, 1.06)
        elif i % 3 == 1:
            cl = zoom_fx(cl, 1.06, 1.0)
        else:
            cl = zoom_fx(cl, 1.0, 1.04)
        clips.append(cl)

    video = concatenate_videoclips(clips, method="compose")

    audio_tracks = []

    # Voiceover
    if voice_path and os.path.exists(voice_path):
        try:
            va = AudioFileClip(voice_path)
            if va.duration > video.duration:
                try: va = va.subclipped(0, video.duration)
                except: va = va.subclip(0, video.duration)
            audio_tracks.append(va)
        except Exception as e:
            print(f"    ! voice error: {e}")

    # Music
    if music_path and os.path.exists(music_path):
        try:
            mus = AudioFileClip(music_path)
            try:
                if mus.duration > video.duration:
                    mus = mus.subclipped(0, video.duration)
            except AttributeError:
                if mus.duration > video.duration:
                    mus = mus.subclip(0, video.duration)

            # Lower volume
            vol = 0.25 if audio_tracks else 0.5
            try:
                from moviepy.audio.fx import MultiplyVolume
                mus = mus.with_effects([MultiplyVolume(factor=vol)])
            except (ImportError, AttributeError):
                try: mus = mus.volumex(vol)
                except: pass
            audio_tracks.append(mus)
        except Exception as e:
            print(f"    ! music error: {e}")

    if audio_tracks:
        if len(audio_tracks) > 1:
            video = video.with_audio(CompositeAudioClip(audio_tracks))
        else:
            video = video.with_audio(audio_tracks[0])

    video.write_videofile(out_path, fps=FPS, codec="libx264", audio_codec="aac", logger=None)

    # Clean temp
    for i in range(len(scenes)):
        tp = f"{OUT}/_tf_{i}.png"
        if os.path.exists(tp): os.remove(tp)

    print(f"  \u2713 {os.path.basename(out_path)}")


# ══════════════════════════════════════════════
# REEL CONTENT v2 — Natural Voice Scripts
# ══════════════════════════════════════════════

REELS = [
    {
        "name": "reel_01_mistakes",
        "title": "7 Social Media Mistakes",
        # Natural, conversational voice script — sounds like a real person talking
        "voice_text": (
            "Your social media isn't failing... your strategy is. "
            "And here are the seven mistakes... that are killing your growth right now. "
            "One... posting without a content plan. Random posts? Random results. It's that simple. "
            "Two... ignoring your analytics. The data is literally telling you what works. Why aren't you reading it? "
            "Three... buying followers. Ten thousand fake followers will never buy your product. Ever. "
            "Four... no consistent brand voice. If people can't recognize you in two seconds? You don't have a brand. You have noise. "
            "Five... posting the same content everywhere. Instagram and LinkedIn are completely different languages. "
            "Six... zero engagement. Post and ghost? The algorithm notices. And it stops showing your content. "
            "Seven... no distribution strategy. Publishing is only twenty percent of the work. The other eighty percent? That's where growth happens. "
            "Follow D S Marketing... for more."
        ),
        "scenes": [
            {"type": "char", "char": "frustrated", "lines": ["YOUR SOCIAL", "MEDIA ISN'T", "FAILING."], "sub": "Your strategy is.", "dur": 5},
            {"type": "num", "num": 1, "title": "No Content Plan", "sub": "Random posts give random results. It's that simple.", "dur": 4},
            {"type": "num", "num": 2, "title": "Ignoring Analytics", "sub": "The data tells you exactly what works. Read it.", "dur": 3.5},
            {"type": "num", "num": 3, "title": "Buying Followers", "sub": "10K fake followers will never buy your product.", "dur": 3.5},
            {"type": "num", "num": 4, "title": "No Brand Voice", "sub": "Unrecognizable in 2 seconds? That's not a brand.", "dur": 3.5},
            {"type": "num", "num": 5, "title": "Same Content Everywhere", "sub": "Each platform speaks its own language.", "dur": 3.5},
            {"type": "num", "num": 6, "title": "Zero Engagement", "sub": "Post and ghost? The algorithm notices.", "dur": 3.5},
            {"type": "num", "num": 7, "title": "No Distribution", "sub": "Publishing is only 20% of the work.", "dur": 3.5},
            {"type": "cta", "dur": 4},
        ],
    },
    {
        "name": "reel_02_calendar",
        "title": "Your Content Calendar",
        "voice_text": (
            "Stop posting randomly... and start posting strategically. "
            "Here's the content framework... that actually works. "
            "Monday... is for education. Tips, frameworks, how-to's. Show them you know your stuff. "
            "Tuesday... share industry insights. Be the person who sees what's coming before everyone else. "
            "Wednesday... case studies. Real numbers, real results. Nothing builds trust faster. "
            "Thursday... take them behind the scenes. Your process, your team. People buy from people. "
            "Friday... is engagement day. Ask questions. Start conversations. Let your audience talk. "
            "Weekends... share your brand story. Your mission. Your values. Build connection, not just reach. "
            "And the secret weapon? Batch everything... on Monday. Create the full week in one sitting. "
            "Save this framework... D S Marketing."
        ),
        "scenes": [
            {"type": "char", "char": "presenter", "lines": ["STOP POSTING", "RANDOMLY."], "sub": "Start posting strategically.", "dur": 4.5},
            {"type": "day", "day": "Monday", "desc": "Education. Tips, frameworks, how-to's. Show your expertise.", "dur": 3.5},
            {"type": "day", "day": "Tuesday", "desc": "Industry insights. Be the one who sees what's coming.", "dur": 3},
            {"type": "day", "day": "Wednesday", "desc": "Case studies. Real numbers. Real results.", "dur": 3},
            {"type": "day", "day": "Thursday", "desc": "Behind the scenes. Your process, your team.", "dur": 3},
            {"type": "day", "day": "Friday", "desc": "Engagement. Questions, polls, conversations.", "dur": 3},
            {"type": "day", "day": "Weekend", "desc": "Brand story. Mission, values, connection.", "dur": 3},
            {"type": "char", "char": "visionary", "lines": ["THE SECRET:", "BATCH MONDAY."], "sub": "Create the full week in one sitting.", "dur": 4.5},
            {"type": "cta", "dur": 3.5},
        ],
    },
    {
        "name": "reel_03_hook",
        "title": "The 3-Second Rule",
        "voice_text": (
            "You have three seconds... "
            "Three seconds to stop the scroll... three seconds to grab their attention. "
            "Your audience decides... in three seconds... whether to keep watching... or swipe away. "
            "That means your hook... is everything. "
            "Not your logo... not your color palette... not your font choice. "
            "Your first line... that single opening moment... "
            "That's where the battle is won... or lost. "
            "Make every hook count... D S Marketing."
        ),
        "scenes": [
            {"type": "char", "char": "clock", "lines": ["YOU HAVE", "3 SECONDS."], "sub": None, "dur": 4},
            {"type": "text", "lines": ["3 SECONDS", "TO STOP", "THE SCROLL."], "sub": None, "dur": 4},
            {"type": "text", "lines": ["YOUR HOOK", "IS EVERYTHING."], "sub": None, "dur": 4},
            {"type": "text", "lines": ["NOT YOUR LOGO.", "NOT YOUR FONTS.", "NOT YOUR COLORS."], "sub": None, "dur": 4},
            {"type": "text", "lines": ["YOUR", "FIRST LINE."], "sub": "That's where the battle is won or lost.", "dur": 5},
            {"type": "cta", "dur": 4},
        ],
    },
]


# ══════════════════════════════════════════════
# MAIN
# ══════════════════════════════════════════════

def main():
    print()
    print("  \u2554" + "\u2550" * 52 + "\u2557")
    print("  \u2551  DS MARKETING REELS ENGINE v2.0                 \u2551")
    print("  \u2551  Ultra-Human Voice + Cinema Frames + Music       \u2551")
    print("  \u2551  Pure Black & White. Ready for Instagram.        \u2551")
    print("  \u255a" + "\u2550" * 52 + "\u255d")
    print()
    print(f"  Voice: {VOICE} (deep, authoritative)")
    print(f"  Output: {OUT}/")
    print()

    os.makedirs(OUT, exist_ok=True)
    os.makedirs(f"{OUT}/audio", exist_ok=True)

    # Find characters
    char_dir = None
    for d in ["ds-marketing-engine/characters", "ds-marketing-bw/characters", "ds-marketing-final/characters"]:
        if os.path.exists(d):
            char_dir = d
            break

    if char_dir:
        print(f"  Characters: {char_dir}/")
    else:
        print("  No characters found — using text-only frames.")
    print()

    # Music
    print("  STEP 1: Cinematic Soundtrack")
    print("  " + "\u2500" * 52)
    music_path = f"{OUT}/audio/cinematic_bg.wav"
    make_music(music_path, duration=45)

    # Reels
    for idx, reel in enumerate(REELS):
        print(f"\n  STEP {idx + 2}: {reel['title']}")
        print("  " + "\u2500" * 52)

        # Voice
        vp = f"{OUT}/audio/{reel['name']}_voice.mp3"
        print(f"    Generating voice...")
        make_voice(reel["voice_text"], vp)

        # Frames
        print(f"    Building frames...")
        scenes = []
        for sc in reel["scenes"]:
            if sc["type"] == "char":
                cp = None
                if char_dir and sc.get("char"):
                    # Try exact name first, then common variations
                    for name in [sc["char"], sc["char"] + "_desk", sc["char"] + "_launch"]:
                        p = f"{char_dir}/{name}.png"
                        if os.path.exists(p):
                            cp = p
                            break
                frame = frame_character_hero(cp, sc["lines"], sc.get("sub"))
            elif sc["type"] == "num":
                frame = frame_number_point(sc["num"], sc["title"], sc.get("sub"))
            elif sc["type"] == "day":
                frame = frame_day(sc["day"], sc["desc"])
            elif sc["type"] == "cta":
                frame = frame_cta()
            else:
                frame = frame_big_text(sc["lines"], sc.get("sub"))
            scenes.append({"image": frame, "duration": sc["dur"]})

        # Render
        print(f"    Rendering video...")
        op = f"{OUT}/{reel['name']}.mp4"
        try:
            render_reel(scenes, vp, music_path, op)
        except Exception as e:
            print(f"    ! Error: {e}")
            try:
                render_reel(scenes, vp, None, op)
            except Exception as e2:
                print(f"    ! Fallback error: {e2}")
                try:
                    render_reel(scenes, None, None, op)
                except Exception as e3:
                    print(f"    ! Failed: {e3}")

    print()
    print("  \u2554" + "\u2550" * 52 + "\u2557")
    print("  \u2551  ALL DONE \u2014 REELS v2.0 COMPLETE                 \u2551")
    print("  \u255a" + "\u2550" * 52 + "\u255d")
    print(f"""
  Your reels: {OUT}/

     reel_01_mistakes.mp4      7 Social Media Mistakes
     reel_02_calendar.mp4      Content Calendar Framework
     reel_03_hook.mp4          The 3-Second Rule

  Each includes:
     Deep authoritative AI voice (DavisNeural)
     Dark cinematic ambient soundtrack
     Animated zoom transitions
     9:16 vertical (Instagram Reels)

  Upload directly to Instagram.
  Pure Black & White. Your Brand. Maximum Impact.
""")

if __name__ == "__main__":
    main()
