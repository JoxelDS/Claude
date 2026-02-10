#!/usr/bin/env python3
"""
DS MARKETING — ULTIMATE BLACK & WHITE EDITION
================================================
Pure black & white brand. Editorial luxury. Magazine quality.
3D characters with dramatic studio lighting.

Run: python3 generate_ultimate.py
"""

import urllib.request, urllib.parse, os, math, random, time, sys

try:
    from PIL import Image, ImageDraw, ImageFont, ImageFilter, ImageChops, ImageEnhance
except ImportError:
    os.system(f"{sys.executable} -m pip install Pillow")
    from PIL import Image, ImageDraw, ImageFont, ImageFilter, ImageChops, ImageEnhance

W, H = 1080, 1080
OUT = "ds-marketing-bw"

# ══════════════════════════════════════════════
# BRAND COLORS — Black & White ONLY
# ══════════════════════════════════════════════
BLACK = (0, 0, 0)
WHITE = (255, 255, 255)
DARK_BG = (5, 5, 5)
NEAR_BLACK = (12, 12, 12)
DARK_GRAY = (26, 26, 26)       # #1A1A1A from brand guide
MED_GRAY = (128, 128, 128)     # #808080 from brand guide
LIGHT_GRAY = (200, 200, 200)
OFF_WHITE = (245, 245, 245)    # #F5F5F5 from brand guide


# ══════════════════════════════════════════════
# FONTS — Brand Guide: Bebas Neue + Montserrat
# ══════════════════════════════════════════════
def _f(paths, sz):
    for p in paths:
        if os.path.exists(p):
            try:
                return ImageFont.truetype(p, sz)
            except:
                pass
    return ImageFont.load_default()

def BEBAS(sz):
    """Bebas Neue — Headlines (brand guide primary)."""
    return _f([
        "BebasNeue-Regular.ttf",
        "/System/Library/Fonts/Supplemental/Impact.ttf",
        "/Library/Fonts/Impact.ttf",
        "/usr/share/fonts/truetype/liberation/LiberationSans-Bold.ttf",
    ], sz)

def MONT_BOLD(sz):
    """Montserrat Bold equivalent — Subheadings."""
    return _f([
        "/System/Library/Fonts/Supplemental/Arial Bold.ttf",
        "/Library/Fonts/Arial Bold.ttf",
        "/System/Library/Fonts/Helvetica-Bold.otf",
        "/usr/share/fonts/truetype/liberation/LiberationSans-Bold.ttf",
    ], sz)

def MONT(sz):
    """Montserrat Regular equivalent — Body text."""
    return _f([
        "/System/Library/Fonts/Supplemental/Arial.ttf",
        "/Library/Fonts/Arial.ttf",
        "/System/Library/Fonts/Helvetica.ttc",
        "/usr/share/fonts/truetype/liberation/LiberationSans-Regular.ttf",
    ], sz)


# ══════════════════════════════════════════════
# AI CHARACTER DOWNLOAD
# ══════════════════════════════════════════════
def download_character(prompt, path, w=1080, h=1080):
    """Download AI character from Pollinations.ai."""
    url = (
        f"https://image.pollinations.ai/prompt/{urllib.parse.quote(prompt)}"
        f"?width={w}&height={h}&model=flux&nologo=true&seed={random.randint(1, 99999)}"
    )
    headers = {
        "User-Agent": (
            "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
            "AppleWebKit/537.36 (KHTML, like Gecko) "
            "Chrome/131.0.0.0 Safari/537.36"
        )
    }
    for attempt in range(4):
        try:
            req = urllib.request.Request(url, headers=headers)
            data = urllib.request.urlopen(req, timeout=180).read()
            if len(data) > 8000:
                with open(path, "wb") as f:
                    f.write(data)
                return True
        except Exception as e:
            print(f"    retry {attempt + 1}... ({type(e).__name__})")
            time.sleep(3 * (attempt + 1))
    return False


# ══════════════════════════════════════════════
# CHARACTER PROMPTS — B&W Studio Lighting
# ══════════════════════════════════════════════
CHARACTERS = {
    "ceo_power": (
        "Ultra high quality 3D rendered character, Pixar Disney style, "
        "powerful confident male CEO in perfectly tailored solid black suit, "
        "arms crossed, slight confident smirk, strong jawline, "
        "dramatic black and white photography lighting, "
        "bright white key light from right side, strong white rim light on shoulders, "
        "pure solid black background, studio portrait lighting setup, "
        "sharp focus on face, shallow depth of field, "
        "bright clean well-lit face and upper body, high contrast, "
        "professional headshot quality, award winning 3D character design, "
        "8K render quality, octane render, volumetric white light, "
        "no text no words no letters no watermark no logo"
    ),
    "frustrated_desk": (
        "Ultra high quality 3D rendered character, Pixar Disney style, "
        "stressed exhausted businessman at minimalist desk, head in both hands, "
        "eyes squeezed shut in frustration, laptop open in front of him, "
        "dramatic single bright white spotlight from directly above, "
        "pure solid black background, high contrast black and white aesthetic, "
        "strong white light illuminating face and hands clearly, "
        "moody but BRIGHT enough to see all facial details, "
        "sharp focus, studio quality lighting, emotional powerful scene, "
        "8K render quality, octane render, "
        "no text no words no letters no watermark no logo"
    ),
    "celebrating": (
        "Ultra high quality 3D rendered character, Pixar Disney style, "
        "ecstatic triumphant businessman in black suit jumping with both fists raised high, "
        "huge genuine smile of pure victory and joy, eyes bright with excitement, "
        "dramatic bright white backlight creating beautiful rim light silhouette, "
        "bright white confetti particles floating around, "
        "pure solid black background, high contrast monochrome aesthetic, "
        "face and body brightly lit and clearly visible, "
        "dynamic action pose, wide angle perspective, "
        "8K render quality, octane render, cinematic, "
        "no text no words no letters no watermark no logo"
    ),
    "presenting": (
        "Ultra high quality 3D rendered character, Pixar Disney style, "
        "confident professional businesswoman in sleek black blazer, "
        "standing with one hand extended presenting gesture, warm friendly smile, "
        "dramatic bright white studio lighting from multiple angles, "
        "pure solid black background, high contrast monochrome, "
        "face brightly lit with clear details visible, "
        "clean professional corporate look, power pose, "
        "sharp focus, 8K render quality, octane render, "
        "no text no words no letters no watermark no logo"
    ),
    "thinker": (
        "Ultra high quality 3D rendered character, Pixar Disney style, "
        "thoughtful contemplative businessman in black turtleneck like Steve Jobs, "
        "hand on chin looking upward with spark of inspiration in eyes, "
        "dramatic white Rembrandt lighting pattern on face, "
        "pure solid black background, high contrast monochrome aesthetic, "
        "face brightly illuminated with clear expression visible, "
        "white light creating beautiful catchlights in eyes, "
        "sharp focus, 8K render quality, octane render, "
        "no text no words no letters no watermark no logo"
    ),
    "doom_scroller": (
        "Ultra high quality 3D rendered character, Pixar Disney style, "
        "bored person in hoodie mindlessly scrolling smartphone, "
        "glazed tired eyes illuminated by bright white phone screen glow, "
        "face clearly visible lit by the phone screen in black room, "
        "pure solid black background, dramatic chiaroscuro lighting, "
        "phone screen casting bright white light on face, "
        "lonely isolated mood, high contrast black and white, "
        "sharp focus, 8K render quality, octane render, "
        "no text no words no letters no watermark no logo"
    ),
    "visionary": (
        "Ultra high quality 3D rendered character, Pixar Disney style, "
        "powerful visionary CEO standing in dark office with commanding presence, "
        "hands on desk leaning forward with intensity, confident expression, "
        "dramatic bright white light from large window behind creating silhouette, "
        "pure solid black and white aesthetic, high contrast monochrome, "
        "face lit by reflected white light showing determination, "
        "cinematic wide angle, power and authority, "
        "sharp focus, 8K render quality, octane render, "
        "no text no words no letters no watermark no logo"
    ),
    "rocket_launch": (
        "Ultra high quality 3D rendered scene, "
        "sleek minimalist white rocket ship launching upward with dramatic white flame trail, "
        "bright white exhaust and smoke particles, energy and motion, "
        "pure solid black background like deep space, "
        "high contrast black and white monochrome aesthetic, "
        "bright white stars scattered in background, "
        "dramatic upward camera angle, motion blur on rocket, "
        "epic scale, cinematic, 8K render quality, octane render, "
        "no text no words no letters no watermark no logo"
    ),
    "stopwatch": (
        "Ultra high quality 3D rendered scene, "
        "massive elegant silver chrome stopwatch floating in dark void, "
        "bright white light reflecting off polished metal surface, "
        "glass face showing number 3, dramatic white light beams radiating outward, "
        "floating white particles and light fragments, "
        "pure solid black background, high contrast monochrome, "
        "single bright white spotlight from above, "
        "8K render quality, octane render, luxury product photography, "
        "no text no words no letters no watermark no logo"
    ),
}


# ══════════════════════════════════════════════
# VISUAL ENGINE — Editorial B&W
# ══════════════════════════════════════════════

def vignette(img, strength=0.75):
    """Dark vignette for focus."""
    mask = Image.new("L", (W, H), 0)
    draw = ImageDraw.Draw(mask)
    cx, cy = W // 2, H // 2
    max_r = int(W * strength)
    for r in range(max_r, 0, -1):
        val = int(255 * (r / max_r) ** 0.7)
        draw.ellipse([cx - r, cy - r, cx + r, cy + r], fill=val)
    return Image.composite(img, Image.new("RGB", (W, H), BLACK), mask)


def film_grain(img, amount=5):
    """Subtle film grain for premium texture."""
    px = img.load()
    random.seed(42)
    for _ in range(W * H // 4):
        x = random.randint(0, W - 1)
        y = random.randint(0, H - 1)
        r, g, b = px[x, y]
        v = random.randint(-amount, amount)
        px[x, y] = (
            max(0, min(255, r + v)),
            max(0, min(255, g + v)),
            max(0, min(255, b + v)),
        )
    return img


def white_bokeh(img, count=20, seed=42):
    """Floating white light particles."""
    overlay = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    random.seed(seed)
    for _ in range(count):
        x = random.randint(0, W)
        y = random.randint(0, H)
        r = random.randint(6, 35)
        a = random.randint(8, 30)
        circle = Image.new("RGBA", (r * 2, r * 2), (0, 0, 0, 0))
        cd = ImageDraw.Draw(circle)
        cd.ellipse([0, 0, r * 2, r * 2], fill=(255, 255, 255, a))
        circle = circle.filter(ImageFilter.GaussianBlur(radius=r // 2))
        overlay.paste(circle, (x - r, y - r), circle)
    return Image.alpha_composite(img.convert("RGBA"), overlay).convert("RGB")


def white_light_beam(img, x_center=540, top_width=6, bottom_width=200, alpha=14):
    """Subtle white volumetric light beam from top."""
    overlay = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    draw = ImageDraw.Draw(overlay)
    for y in range(H):
        t = y / H
        w = int(top_width + (bottom_width - top_width) * t * t)
        a = int(alpha * (1 - t * 0.7))
        draw.line([(x_center - w // 2, y), (x_center + w // 2, y)], fill=(255, 255, 255, a))
    return Image.alpha_composite(img.convert("RGBA"), overlay).convert("RGB")


def gradient_darken(img, y_start, y_end, strength=0.85, fade=80):
    """Smooth gradient darkening zone for text readability."""
    overlay = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    draw = ImageDraw.Draw(overlay)
    for y in range(max(0, y_start - fade), min(H, y_end + fade)):
        if y < y_start:
            a = strength * (1 - (y_start - y) / fade)
        elif y > y_end:
            a = strength * (1 - (y - y_end) / fade)
        else:
            a = strength
        draw.line([(0, y), (W, y)], fill=(0, 0, 0, max(0, min(255, int(255 * a)))))
    return Image.alpha_composite(img.convert("RGBA"), overlay).convert("RGB")


def brighten_character(img, factor=1.5, contrast=1.3):
    """Make AI character brighter and more visible."""
    img = ImageEnhance.Brightness(img).enhance(factor)
    img = ImageEnhance.Contrast(img).enhance(contrast)
    img = ImageEnhance.Sharpness(img).enhance(1.5)
    return img


def desaturate(img, amount=0.85):
    """Desaturate toward B&W while keeping subtle depth."""
    gray = img.convert("L").convert("RGB")
    return Image.blend(img, gray, amount)


# ── TEXT RENDERING ──

def white_glow(img, text, font, x, y, blur=16, alpha=80):
    """Subtle white text glow for premium feel."""
    glow_layer = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    gd = ImageDraw.Draw(glow_layer)
    for dx in range(-2, 3):
        for dy in range(-2, 3):
            gd.text((x + dx, y + dy), text, font=font, fill=(255, 255, 255, alpha))
    glow_layer = glow_layer.filter(ImageFilter.GaussianBlur(radius=blur))
    return Image.alpha_composite(img.convert("RGBA"), glow_layer).convert("RGB")


def text_with_shadow(draw, x, y, text, font, fill=WHITE, shadow_offset=3):
    """Text with subtle shadow for depth."""
    # Shadow
    draw.text((x + shadow_offset, y + shadow_offset), text, font=font, fill=(0, 0, 0))
    draw.text((x + 1, y + 1), text, font=font, fill=(15, 15, 15))
    # Main
    draw.text((x, y), text, font=font, fill=fill)


def outlined_text(draw, x, y, text, font, fill=WHITE, outline=BLACK, width=2):
    """Text with outline for max readability over images."""
    for dx in range(-width, width + 1):
        for dy in range(-width, width + 1):
            if dx * dx + dy * dy <= width * width:
                draw.text((x + dx, y + dy), text, font=font, fill=outline)
    draw.text((x, y), text, font=font, fill=fill)


def centered_text(draw, y, text, font, fill=WHITE):
    """Center-aligned text. Returns (x, height)."""
    bb = draw.textbbox((0, 0), text, font=font)
    x = (W - (bb[2] - bb[0])) // 2
    draw.text((x, y), text, font=font, fill=fill)
    return x, bb[3] - bb[1]


def centered_outlined(draw, y, text, font, fill=WHITE, outline=BLACK, ow=2):
    """Center-aligned outlined text."""
    bb = draw.textbbox((0, 0), text, font=font)
    x = (W - (bb[2] - bb[0])) // 2
    outlined_text(draw, x, y, text, font, fill, outline, ow)
    return x, bb[3] - bb[1]


def word_wrap(text, font, max_width, draw):
    """Word wrap text to fit max_width."""
    words = text.split()
    lines = []
    current = ""
    for word in words:
        test = f"{current} {word}".strip()
        if draw.textbbox((0, 0), test, font=font)[2] <= max_width:
            current = test
        else:
            if current:
                lines.append(current)
            current = word
    if current:
        lines.append(current)
    return lines


# ── BRAND ELEMENTS ──

def thin_line(draw, y, x1=108, x2=972, color=WHITE, width=2):
    """Clean thin divider line per brand guide."""
    draw.line([(x1, y), (x2, y)], fill=color, width=width)


def brand_header(draw, style="dark"):
    """Minimal branded header bar."""
    if style == "dark":
        draw.rectangle([(0, 0), (W, 38)], fill=NEAR_BLACK)
        draw.line([(0, 38), (W, 38)], fill=DARK_GRAY, width=1)
        f = MONT_BOLD(11)
        draw.text((40, 12), "DS MARKETING", font=f, fill=MED_GRAY)
        draw.text((W - 200, 12), "@dsmarketing.agency", font=f, fill=(80, 80, 80))
    else:
        draw.rectangle([(0, 0), (W, 38)], fill=OFF_WHITE)
        draw.line([(0, 38), (W, 38)], fill=(210, 210, 210), width=1)
        f = MONT_BOLD(11)
        draw.text((40, 12), "DS MARKETING", font=f, fill=(60, 60, 60))
        draw.text((W - 200, 12), "@dsmarketing.agency", font=f, fill=(140, 140, 140))


def brand_footer(draw, slide_num=None, total=None, style="dark"):
    """Minimal branded footer with dot pagination."""
    if style == "dark":
        draw.rectangle([(0, H - 44), (W, H)], fill=NEAR_BLACK)
        draw.line([(0, H - 44), (W, H - 44)], fill=DARK_GRAY, width=1)
        f = MONT(11)
        draw.text((40, H - 30), "@dsmarketing.agency", font=f, fill=(90, 90, 90))
        if slide_num and total:
            for i in range(min(total, 10)):
                dx = W // 2 - (total * 12) // 2 + i * 24
                if i == slide_num - 1:
                    draw.ellipse([dx - 4, H - 28, dx + 4, H - 20], fill=WHITE)
                else:
                    draw.ellipse([dx - 2, H - 26, dx + 2, H - 22], fill=(50, 50, 50))
        draw.text((W - 195, H - 30), "dsmarketing.lovable.app", font=f, fill=(55, 55, 55))
    else:
        draw.rectangle([(0, H - 44), (W, H)], fill=OFF_WHITE)
        draw.line([(0, H - 44), (W, H - 44)], fill=(210, 210, 210), width=1)
        f = MONT(11)
        draw.text((40, H - 30), "@dsmarketing.agency", font=f, fill=(130, 130, 130))
        if slide_num and total:
            for i in range(min(total, 10)):
                dx = W // 2 - (total * 12) // 2 + i * 24
                if i == slide_num - 1:
                    draw.ellipse([dx - 4, H - 28, dx + 4, H - 20], fill=BLACK)
                else:
                    draw.ellipse([dx - 2, H - 26, dx + 2, H - 22], fill=(185, 185, 185))
        draw.text((W - 195, H - 30), "dsmarketing.lovable.app", font=f, fill=(160, 160, 160))


def corner_marks(draw, color=(60, 60, 60), margin=50, length=40, width=1):
    """Subtle corner marks for editorial feel."""
    points = [
        [(margin, margin), (margin + length, margin)],
        [(margin, margin), (margin, margin + length)],
        [(W - margin - length, margin), (W - margin, margin)],
        [(W - margin, margin), (W - margin, margin + length)],
        [(margin, H - margin), (margin + length, H - margin)],
        [(margin, H - margin - length), (margin, H - margin)],
        [(W - margin - length, H - margin), (W - margin, H - margin)],
        [(W - margin, H - margin - length), (W - margin, H - margin)],
    ]
    for pts in points:
        draw.line(pts, fill=color, width=width)


# ══════════════════════════════════════════════
# SLIDE TEMPLATES — Editorial B&W
# ══════════════════════════════════════════════

def slide_HOOK_character(char_path, line1, line2, tag_text, output_path):
    """
    HOOK SLIDE — Full character background with dramatic B&W text.
    The attention-grabber. Large bold text over brightened character.
    """
    # Load and process character
    char_img = Image.open(char_path).resize((W, H), Image.LANCZOS)
    char_img = brighten_character(char_img, 1.4, 1.3)
    char_img = desaturate(char_img, 0.9)

    img = char_img.copy()
    # Darken bottom half for text readability
    img = gradient_darken(img, H - 500, H, 0.92, fade=100)
    # Darken top for tag
    img = gradient_darken(img, 0, 120, 0.7, fade=40)
    img = vignette(img, 0.8)
    img = white_bokeh(img, 14, seed=hash(output_path) % 9999)
    img = film_grain(img, 4)

    draw = ImageDraw.Draw(img)
    brand_header(draw, "dark")

    # Tag pill
    if tag_text:
        tf = MONT_BOLD(16)
        bb = draw.textbbox((0, 0), tag_text, font=tf)
        tw = bb[2] - bb[0]
        tx = (W - tw) // 2
        # White outlined pill
        pill_pad = 14
        draw.rounded_rectangle(
            [(tx - pill_pad, 56), (tx + tw + pill_pad, 82)],
            radius=4,
            outline=WHITE,
            width=1,
        )
        draw.text((tx, 59), tag_text, font=tf, fill=WHITE)

    # Main headline — large Bebas Neue
    headline_font = BEBAS(100)
    lines = word_wrap(line1, headline_font, W - 140, draw)
    line_height = 108
    total_h = len(lines) * line_height
    start_y = H - 400 - total_h // 2

    for i, ln in enumerate(lines):
        bb = draw.textbbox((0, 0), ln, font=headline_font)
        x = (W - (bb[2] - bb[0])) // 2
        # White glow behind text
        img = white_glow(img, ln, headline_font, x, start_y + i * line_height, blur=20, alpha=60)
        draw = ImageDraw.Draw(img)
        # Outlined white text
        outlined_text(draw, x, start_y + i * line_height, ln, headline_font, WHITE, BLACK, 3)

    # Subline
    if line2:
        sub_font = BEBAS(78)
        bb = draw.textbbox((0, 0), line2, font=sub_font)
        x = (W - (bb[2] - bb[0])) // 2
        y_sub = start_y + len(lines) * line_height + 12
        outlined_text(draw, x, y_sub, line2, sub_font, LIGHT_GRAY, BLACK, 2)

    # Thin white line
    thin_line(draw, H - 100, 300, W - 300, WHITE, 1)

    # Swipe CTA
    swipe_font = MONT(13)
    centered_text(draw, H - 78, "SWIPE  TO  LEARN  MORE  \u2192", swipe_font, MED_GRAY)

    brand_footer(draw, style="dark")
    img.save(output_path, quality=95)
    print(f"  \u2713 {os.path.basename(output_path)}")


def slide_NUMBERED_character(char_path, num, title, subtitle, slide_num, total, output_path):
    """
    NUMBERED CONTENT SLIDE — Character as subtle background.
    Big number + title + explanation.
    """
    # Character as dim background
    char_img = Image.open(char_path).resize((W, H), Image.LANCZOS)
    char_img = brighten_character(char_img, 1.2, 1.2)
    char_img = desaturate(char_img, 0.9)
    char_img = ImageEnhance.Brightness(char_img).enhance(0.35)

    img = char_img.copy()
    img = gradient_darken(img, H - 500, H, 0.9, 70)
    img = vignette(img, 0.7)
    img = white_bokeh(img, 8, seed=slide_num * 11)
    img = film_grain(img, 4)

    draw = ImageDraw.Draw(img)
    brand_header(draw, "dark")
    corner_marks(draw, (50, 50, 50))

    # Large number
    num_font = BEBAS(180)
    num_str = f"{num:02d}"
    nb = draw.textbbox((70, 440), num_str, font=num_font)
    img = white_glow(img, num_str, num_font, 70, 440, blur=18, alpha=50)
    draw = ImageDraw.Draw(img)
    outlined_text(draw, 70, 440, num_str, num_font, WHITE, BLACK, 3)

    # Vertical divider line
    line_x = nb[2] + 20
    draw.line([(line_x, 470), (line_x, 630)], fill=WHITE, width=2)

    # Title
    title_font = BEBAS(48)
    title_lines = word_wrap(title.upper(), title_font, W - line_x - 80, draw)
    ty = 490
    for ln in title_lines:
        outlined_text(draw, line_x + 24, ty, ln, title_font, WHITE, BLACK, 2)
        ty += 56

    # Horizontal divider
    thin_line(draw, 700, 70, W - 70, WHITE, 1)

    # Subtitle
    sub_font = MONT(24)
    sub_lines = word_wrap(subtitle, sub_font, W - 180, draw)
    sy = 730
    for ln in sub_lines:
        draw.text((90, sy), ln, font=sub_font, fill=LIGHT_GRAY)
        sy += 36

    brand_footer(draw, slide_num, total, "dark")
    img.save(output_path, quality=95)
    print(f"  \u2713 {os.path.basename(output_path)}")


def slide_NUMBERED_dark(num, title, subtitle, slide_num, total, output_path):
    """
    DARK NUMBERED SLIDE — Pure black background, no character.
    Clean editorial layout.
    """
    img = Image.new("RGB", (W, H), DARK_BG)
    # Subtle radial gradient for depth
    px = img.load()
    cx, cy = int(W * 0.35), int(H * 0.35)
    for y in range(0, H, 2):
        for x in range(0, W, 2):
            d = math.sqrt((x - cx) ** 2 + (y - cy) ** 2)
            t = min(1.0, d / (W * 0.7))
            v = int(18 * (1 - t ** 1.5))
            c = (5 + v, 5 + v, 5 + v)
            px[x, y] = c
            if x + 1 < W:
                px[x + 1, y] = c
            if y + 1 < H:
                px[x, y + 1] = c
            if x + 1 < W and y + 1 < H:
                px[x + 1, y + 1] = c

    img = white_light_beam(img, int(W * 0.3), 4, 80, 8)
    img = white_bokeh(img, 10, seed=slide_num * 17)
    img = film_grain(img, 4)
    img = vignette(img, 0.7)

    draw = ImageDraw.Draw(img)
    brand_header(draw, "dark")
    corner_marks(draw, (40, 40, 40))

    # Large number
    num_font = BEBAS(180)
    num_str = f"{num:02d}"
    nb = draw.textbbox((70, 130), num_str, font=num_font)
    img = white_glow(img, num_str, num_font, 70, 130, blur=16, alpha=40)
    draw = ImageDraw.Draw(img)
    draw.text((70, 130), num_str, font=num_font, fill=WHITE)

    # Vertical line
    line_x = nb[2] + 20
    draw.line([(line_x, 165), (line_x, 320)], fill=WHITE, width=2)

    # Title
    title_font = BEBAS(52)
    title_lines = word_wrap(title.upper(), title_font, W - line_x - 80, draw)
    ty = 180
    for ln in title_lines:
        draw.text((line_x + 24, ty), ln, font=title_font, fill=WHITE)
        ty += 62

    # Horizontal divider
    thin_line(draw, 410, 70, W - 70, MED_GRAY, 1)

    # Subtitle
    sub_font = MONT(27)
    sub_lines = word_wrap(subtitle, sub_font, W - 180, draw)
    sy = 455
    for ln in sub_lines:
        draw.text((90, sy), ln, font=sub_font, fill=LIGHT_GRAY)
        sy += 40

    brand_footer(draw, slide_num, total, "dark")
    img.save(output_path, quality=95)
    print(f"  \u2713 {os.path.basename(output_path)}")


def slide_NUMBERED_white(num, title, subtitle, slide_num, total, output_path):
    """
    WHITE NUMBERED SLIDE — Clean white background.
    Brand guide style: black text on white.
    """
    img = Image.new("RGB", (W, H), OFF_WHITE)
    # Subtle texture gradient
    px = img.load()
    for y in range(H):
        for x in range(0, W, 2):
            v = int(245 - 4 * (y / H) + 2 * math.sin(x / 300))
            px[x, y] = (v, v, v)
            if x + 1 < W:
                px[x + 1, y] = (v, v, v)

    draw = ImageDraw.Draw(img)
    brand_header(draw, "light")
    corner_marks(draw, (200, 200, 200))

    # Large number
    num_font = BEBAS(180)
    num_str = f"{num:02d}"
    nb = draw.textbbox((70, 130), num_str, font=num_font)
    draw.text((70, 130), num_str, font=num_font, fill=BLACK)

    # Vertical line
    line_x = nb[2] + 20
    draw.line([(line_x, 165), (line_x, 320)], fill=BLACK, width=2)

    # Title
    title_font = BEBAS(52)
    title_lines = word_wrap(title.upper(), title_font, W - line_x - 80, draw)
    ty = 180
    for ln in title_lines:
        draw.text((line_x + 24, ty), ln, font=title_font, fill=BLACK)
        ty += 62

    # Horizontal divider
    thin_line(draw, 410, 70, W - 70, BLACK, 1)

    # Subtitle
    sub_font = MONT(27)
    sub_lines = word_wrap(subtitle, sub_font, W - 180, draw)
    sy = 455
    for ln in sub_lines:
        draw.text((90, sy), ln, font=sub_font, fill=DARK_GRAY)
        sy += 40

    brand_footer(draw, slide_num, total, "light")
    img.save(output_path, quality=95)
    print(f"  \u2713 {os.path.basename(output_path)}")


def slide_RECAP(char_path, title, points, slide_num, total, output_path):
    """
    RECAP SLIDE — Summary of key points over dim character.
    """
    char_img = Image.open(char_path).resize((W, H), Image.LANCZOS)
    char_img = desaturate(char_img, 0.95)
    char_img = ImageEnhance.Brightness(char_img).enhance(0.15)

    # Heavy dark overlay
    overlay = Image.new("RGBA", (W, H), (0, 0, 0, 200))
    img = Image.alpha_composite(char_img.convert("RGBA"), overlay).convert("RGB")
    img = vignette(img, 0.75)
    img = white_bokeh(img, 8, seed=99)
    img = film_grain(img, 3)

    draw = ImageDraw.Draw(img)
    brand_header(draw, "dark")
    corner_marks(draw, (45, 45, 45))

    # Title
    title_font = BEBAS(58)
    bb = draw.textbbox((0, 0), title, font=title_font)
    tx = (W - (bb[2] - bb[0])) // 2
    img = white_glow(img, title, title_font, tx, 85, blur=14, alpha=50)
    draw = ImageDraw.Draw(img)
    centered_text(draw, 85, title, title_font, WHITE)

    # Thin divider
    thin_line(draw, 155, 240, W - 240, WHITE, 1)

    # Points
    num_font = BEBAS(28)
    point_font = MONT(23)
    y = 195
    for i, pt in enumerate(points):
        num_str = f"{i + 1:02d}"
        draw.text((100, y), num_str, font=num_font, fill=WHITE)
        # Small vertical line
        draw.line([(145, y + 6), (145, y + 26)], fill=MED_GRAY, width=1)
        draw.text((160, y + 3), pt, font=point_font, fill=LIGHT_GRAY)
        y += 52

    brand_footer(draw, slide_num, total, "dark")
    img.save(output_path, quality=95)
    print(f"  \u2713 {os.path.basename(output_path)}")


def slide_CTA(char_path, cta_text, output_path):
    """
    CTA SLIDE — Bold call to action. DS Marketing branding.
    """
    char_img = Image.open(char_path).resize((W, H), Image.LANCZOS)
    char_img = desaturate(char_img, 0.95)
    char_img = ImageEnhance.Brightness(char_img).enhance(0.25)

    img = char_img.copy()
    img = gradient_darken(img, 250, H - 80, 0.88, 80)
    img = vignette(img, 0.7)
    img = white_light_beam(img, W // 2, 8, 160, 12)
    img = white_bokeh(img, 12, seed=77)
    img = film_grain(img, 3)

    draw = ImageDraw.Draw(img)
    brand_header(draw, "dark")
    corner_marks(draw, (45, 45, 45))

    # DS massive
    ds_font = BEBAS(150)
    bb = draw.textbbox((0, 0), "DS", font=ds_font)
    x = (W - (bb[2] - bb[0])) // 2
    img = white_glow(img, "DS", ds_font, x, 290, blur=24, alpha=70)
    draw = ImageDraw.Draw(img)
    outlined_text(draw, x, 290, "DS", ds_font, WHITE, BLACK, 3)

    # MARKETING
    mkt_font = BEBAS(60)
    centered_text(draw, 440, "MARKETING", mkt_font, LIGHT_GRAY)

    # Thin divider
    thin_line(draw, 520, 280, W - 280, WHITE, 2)

    # CTA text
    cta_font = BEBAS(44)
    centered_text(draw, 555, cta_text, cta_font, WHITE)

    # Handle
    handle_font = MONT_BOLD(24)
    centered_text(draw, 620, "@dsmarketing.agency", handle_font, MED_GRAY)

    # Website
    web_font = MONT(15)
    centered_text(draw, 665, "dsmarketing.lovable.app", web_font, (65, 65, 65))

    brand_footer(draw, style="dark")
    img.save(output_path, quality=95)
    print(f"  \u2713 {os.path.basename(output_path)}")


def slide_BODY_text(title, body_lines, slide_num, total, output_path):
    """
    TEXT-ONLY BODY SLIDE — Clean black background with white text.
    For content that doesn't need a character.
    """
    img = Image.new("RGB", (W, H), DARK_BG)
    # Subtle depth
    px = img.load()
    cx, cy = W // 2, H // 3
    for y in range(0, H, 2):
        for x in range(0, W, 2):
            d = math.sqrt((x - cx) ** 2 + (y - cy) ** 2)
            t = min(1.0, d / (W * 0.65))
            v = int(14 * (1 - t ** 1.6))
            c = (5 + v, 5 + v, 5 + v)
            px[x, y] = c
            if x + 1 < W:
                px[x + 1, y] = c
            if y + 1 < H:
                px[x, y + 1] = c
            if x + 1 < W and y + 1 < H:
                px[x + 1, y + 1] = c

    img = white_light_beam(img, W // 2, 4, 70, 7)
    img = white_bokeh(img, 8, seed=33)
    img = film_grain(img, 4)
    img = vignette(img, 0.7)

    draw = ImageDraw.Draw(img)
    brand_header(draw, "dark")
    corner_marks(draw, (40, 40, 40))

    # Title
    title_font = BEBAS(54)
    bb = draw.textbbox((0, 0), title, font=title_font)
    tx = (W - (bb[2] - bb[0])) // 2
    img = white_glow(img, title, title_font, tx, 100, blur=12, alpha=40)
    draw = ImageDraw.Draw(img)
    centered_text(draw, 100, title, title_font, WHITE)

    # Thin divider
    thin_line(draw, 168, 260, W - 260, MED_GRAY, 1)

    # Body text
    body_font = MONT(27)
    y = 210
    for ln in body_lines:
        if ln == "":
            y += 24
            continue
        centered_text(draw, y, ln, body_font, LIGHT_GRAY)
        y += 46

    brand_footer(draw, slide_num, total, "dark")
    img.save(output_path, quality=95)
    print(f"  \u2713 {os.path.basename(output_path)}")


# ══════════════════════════════════════════════
# CONTENT DATA
# ══════════════════════════════════════════════

MONDAY_SLIDES = [
    # (num, title, subtitle, character_key or None)
    (1, "Posting without a content plan",
     "Random posts = random results. A plan turns chaos into consistency and consistency builds trust.",
     "doom_scroller"),
    (2, "Ignoring your analytics",
     "The data tells you exactly what works. Stop guessing. Start reading the numbers.",
     None),
    (3, "Buying followers for vanity",
     "10K fake followers won't buy your product. Real engagement beats inflated numbers every time.",
     "doom_scroller"),
    (4, "No consistent brand voice",
     "If your audience can't recognize you in 2 seconds, you don't have a brand. You have noise.",
     None),
    (5, "Same content everywhere",
     "What works on Instagram doesn't work on LinkedIn. Each platform speaks its own language.",
     "frustrated_desk"),
    (6, "Zero audience engagement",
     "Posting and disappearing tells the algorithm you don't care. It stops showing your content.",
     None),
    (7, "No post-publish strategy",
     "Publishing is 20% of the work. Distribution, engagement, and repurposing is the other 80%.",
     "thinker"),
]

WEDNESDAY_SLIDES = [
    (1, "Monday \u2014 Educational",
     "Tips, how-tos, frameworks. Prove your expertise from day one.",
     "thinker"),
    (2, "Tuesday \u2014 Industry insights",
     "Share trends your audience hasn't seen. Be the one who sees what's coming.",
     None),
    (3, "Wednesday \u2014 Case study",
     "Real numbers, real results. Nothing builds trust faster than evidence.",
     "celebrating"),
    (4, "Thursday \u2014 Behind the scenes",
     "Show your process, your team. People buy from people they trust.",
     None),
    (5, "Friday \u2014 Engagement",
     "Ask questions. Run polls. Start debates. Let your audience talk.",
     "presenting"),
    (6, "Weekend \u2014 Brand story",
     "Your mission. Your values. Build connection, not just reach.",
     None),
    (7, "Secret \u2014 Batch Monday",
     "Create the full week in one sitting. Then spend the rest engaging.",
     "visionary"),
]


# ══════════════════════════════════════════════
# MAIN
# ══════════════════════════════════════════════

def main():
    print()
    print("  \u250c\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2510")
    print("  \u2502  DS MARKETING \u2014 ULTIMATE B&W EDITION        \u2502")
    print("  \u2502  Pure Black & White. Editorial Luxury.       \u2502")
    print("  \u2502  Your Brand. Your Colors. Maximum Impact.    \u2502")
    print("  \u2514\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2518")
    print()

    # Create output directories
    dirs = {
        "characters": f"{OUT}/characters",
        "monday": f"{OUT}/monday",
        "wednesday": f"{OUT}/wednesday",
        "friday": f"{OUT}/friday",
    }
    for d in dirs.values():
        os.makedirs(d, exist_ok=True)

    # ─── Download Characters ───
    print("  STEP 1: Downloading 3D Characters (5-10 min)")
    print("  " + "\u2500" * 46)
    char_paths = {}
    for name, prompt in CHARACTERS.items():
        path = f"{dirs['characters']}/{name}.png"
        char_paths[name] = path
        if os.path.exists(path) and os.path.getsize(path) > 10000:
            print(f"    \u2713 {name} (cached)")
            continue
        print(f"    Downloading {name}...")
        if not download_character(prompt, path):
            # Fallback: create simple dark image
            fb = Image.new("RGB", (W, H), DARK_BG)
            fb.save(path, quality=95)
            print(f"    ! {name} failed, using fallback")
        time.sleep(3)

    # ─── MONDAY: 7 Social Media Mistakes ───
    print(f"\n  STEP 2: MONDAY \u2014 7 Social Media Mistakes")
    print("  " + "\u2500" * 46)
    M = dirs["monday"]

    # Slide 1: Hook
    slide_HOOK_character(
        char_paths["frustrated_desk"],
        "YOUR SOCIAL MEDIA ISN'T FAILING.",
        "YOUR STRATEGY IS.",
        "7 MISTAKES KILLING YOUR GROWTH",
        f"{M}/slide_01_hook.png",
    )

    # Slides 2-8: Content
    for num, title, subtitle, char_key in MONDAY_SLIDES:
        sn = num + 1
        if char_key:
            slide_NUMBERED_character(
                char_paths[char_key], num, title, subtitle, sn, 10,
                f"{M}/slide_{sn:02d}.png",
            )
        elif num % 2 == 0:
            slide_NUMBERED_white(
                num, title, subtitle, sn, 10,
                f"{M}/slide_{sn:02d}.png",
            )
        else:
            slide_NUMBERED_dark(
                num, title, subtitle, sn, 10,
                f"{M}/slide_{sn:02d}.png",
            )

    # Slide 9: Recap
    slide_RECAP(
        char_paths["ceo_power"],
        "QUICK RECAP",
        [
            "No content plan",
            "Ignoring analytics",
            "Buying fake followers",
            "Inconsistent brand voice",
            "Same content everywhere",
            "Not engaging",
            "No post-publish strategy",
        ],
        9, 10,
        f"{M}/slide_09_recap.png",
    )

    # Slide 10: CTA
    slide_CTA(
        char_paths["visionary"],
        "FOLLOW FOR MORE",
        f"{M}/slide_10_cta.png",
    )

    # ─── WEDNESDAY: Perfect Content Calendar ───
    print(f"\n  STEP 3: WEDNESDAY \u2014 Perfect Content Calendar")
    print("  " + "\u2500" * 46)
    WD = dirs["wednesday"]

    # Slide 1: Hook
    slide_HOOK_character(
        char_paths["presenting"],
        "STOP POSTING RANDOMLY.",
        "START POSTING STRATEGICALLY.",
        "YOUR WEEKLY CONTENT FRAMEWORK",
        f"{WD}/slide_01_hook.png",
    )

    # Slides 2-8: Content
    for num, title, subtitle, char_key in WEDNESDAY_SLIDES:
        sn = num + 1
        if char_key:
            slide_NUMBERED_character(
                char_paths[char_key], num, title, subtitle, sn, 10,
                f"{WD}/slide_{sn:02d}.png",
            )
        elif num % 2 == 1:
            slide_NUMBERED_white(
                num, title, subtitle, sn, 10,
                f"{WD}/slide_{sn:02d}.png",
            )
        else:
            slide_NUMBERED_dark(
                num, title, subtitle, sn, 10,
                f"{WD}/slide_{sn:02d}.png",
            )

    # Slide 9: Recap
    slide_RECAP(
        char_paths["presenting"],
        "YOUR WEEKLY FRAMEWORK",
        [
            "MON \u2014 Educate",
            "TUE \u2014 Industry insights",
            "WED \u2014 Case studies",
            "THU \u2014 Behind the scenes",
            "FRI \u2014 Engage",
            "SAT/SUN \u2014 Brand story",
            "SECRET \u2014 Batch Monday",
        ],
        9, 10,
        f"{WD}/slide_09_recap.png",
    )

    # Slide 10: CTA
    slide_CTA(
        char_paths["visionary"],
        "SAVE THIS FRAMEWORK",
        f"{WD}/slide_10_cta.png",
    )

    # ─── FRIDAY: The 3-Second Rule ───
    print(f"\n  STEP 4: FRIDAY \u2014 The 3-Second Rule")
    print("  " + "\u2500" * 46)
    FR = dirs["friday"]

    # Slide 1: Hook
    slide_HOOK_character(
        char_paths["stopwatch"],
        "YOU HAVE 3 SECONDS.",
        "",
        "THE RULE THAT CHANGES EVERYTHING",
        f"{FR}/slide_01_hook.png",
    )

    # Slide 2: Body text
    slide_BODY_text(
        "THE 3-SECOND RULE",
        [
            "Your audience decides in 3 seconds",
            "whether to stop scrolling",
            "or keep going.",
            "",
            "That means your hook is everything.",
            "",
            "Not your logo.",
            "Not your color palette.",
            "Not your font choice.",
            "",
            "Your first line.",
            "",
            "That's where the battle",
            "is won or lost.",
        ],
        2, 3,
        f"{FR}/slide_02.png",
    )

    # Slide 3: CTA
    slide_CTA(
        char_paths["rocket_launch"],
        "MAKE EVERY HOOK COUNT",
        f"{FR}/slide_03_cta.png",
    )

    # ─── DONE ───
    print()
    print("  \u250c\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2510")
    print("  \u2502  ALL DONE \u2014 ULTIMATE B&W EDITION COMPLETE    \u2502")
    print("  \u2514\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2518")
    print(f"""
  Your slides are in: {OUT}/

     monday/      10 slides ready to post
     wednesday/   10 slides ready to post
     friday/       3 slides ready to post
     characters/   9 AI 3D characters

  HOW TO POST:
  1. Open the {OUT}/ folder
  2. Upload carousels to Instagram via business.facebook.com
  3. Copy captions from GitHub repo (ds-marketing/week1/captions/)

  BRAND: Pure Black & White. No colors. Maximum impact.
""")


if __name__ == "__main__":
    main()
