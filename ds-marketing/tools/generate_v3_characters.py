#!/usr/bin/env python3
"""
DS Marketing - V3 Character + Premium Slide Generator
======================================================
RUN THIS ON YOUR MAC (not in GitHub):

    python3 generate_v3_characters.py

Generates:
- 3D AI characters from Pollinations.ai (no text, just the character)
- Overlays premium text + brand elements with Pillow
- Saves final 1080x1080 ready-to-post images

Requirements: Python 3 + Pillow (pip3 install Pillow)
"""

import urllib.request
import urllib.parse
import os
import math
import random
import time
import sys

try:
    from PIL import Image, ImageDraw, ImageFont, ImageFilter, ImageChops, ImageEnhance
except ImportError:
    print("Installing Pillow...")
    os.system(f"{sys.executable} -m pip install Pillow")
    from PIL import Image, ImageDraw, ImageFont, ImageFilter, ImageChops, ImageEnhance

# ─── CONFIG ───
W, H = 1080, 1080
OUT = "ds-marketing-v3"

# Try to use nice fonts, fallback to system defaults
def find_font(names, size):
    """Try multiple font paths."""
    paths = [
        # Mac paths
        "/System/Library/Fonts/Supplemental/Arial Bold.ttf",
        "/System/Library/Fonts/Helvetica.ttc",
        "/Library/Fonts/Arial Bold.ttf",
        # Linux paths
        "/usr/share/fonts/truetype/liberation/LiberationSans-Bold.ttf",
        "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf",
    ]
    for p in paths:
        if os.path.exists(p):
            try:
                return ImageFont.truetype(p, size)
            except:
                continue
    return ImageFont.load_default()

def find_font_regular(size):
    paths = [
        "/System/Library/Fonts/Supplemental/Arial.ttf",
        "/System/Library/Fonts/Helvetica.ttc",
        "/Library/Fonts/Arial.ttf",
        "/usr/share/fonts/truetype/liberation/LiberationSans-Regular.ttf",
        "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf",
    ]
    for p in paths:
        if os.path.exists(p):
            try:
                return ImageFont.truetype(p, size)
            except:
                continue
    return ImageFont.load_default()

def find_font_bold(size):
    paths = [
        "BebasNeue-Regular.ttf",
        "/System/Library/Fonts/Supplemental/Impact.ttf",
        "/System/Library/Fonts/Supplemental/Arial Bold.ttf",
        "/Library/Fonts/Impact.ttf",
        "/usr/share/fonts/truetype/liberation/LiberationSans-Bold.ttf",
    ]
    for p in paths:
        if os.path.exists(p):
            try:
                return ImageFont.truetype(p, size)
            except:
                continue
    return find_font([], size)


# ─── AI IMAGE DOWNLOAD ───

def download_ai_image(prompt, filepath, width=1080, height=1080, model="flux", retries=3):
    """Download AI-generated image from Pollinations.ai."""
    encoded = urllib.parse.quote(prompt)
    url = f"https://image.pollinations.ai/prompt/{encoded}?width={width}&height={height}&model={model}&nologo=true"

    headers = {
        "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
    }

    for attempt in range(retries):
        try:
            req = urllib.request.Request(url, headers=headers)
            data = urllib.request.urlopen(req, timeout=120).read()
            with open(filepath, "wb") as f:
                f.write(data)
            return True
        except Exception as e:
            if attempt < retries - 1:
                wait = 2 ** (attempt + 1)
                print(f"    Retry in {wait}s... ({e})")
                time.sleep(wait)
            else:
                print(f"    FAILED: {e}")
                return False
    return False


# ─── VISUAL EFFECTS ENGINE ───

def radial_gradient(w, h, cx, cy, radius, inner, outer=(0,0,0)):
    img = Image.new("RGB", (w, h), outer)
    px = img.load()
    for y in range(0, h, 2):
        for x in range(0, w, 2):
            d = math.sqrt((x-cx)**2 + (y-cy)**2)
            t = min(1.0, d/radius)
            t = t*t
            c = tuple(int(inner[i]*(1-t) + outer[i]*t) for i in range(3))
            px[x,y] = c
            if x+1 < w: px[x+1,y] = c
            if y+1 < h: px[x,y+1] = c
            if x+1 < w and y+1 < h: px[x+1,y+1] = c
    return img


def neon_glow_line(draw, y, x1, x2, color=(0, 255, 150), glow=20, thickness=2):
    """Draw a neon-glowing horizontal line."""
    for offset in range(glow, 0, -1):
        a = max(3, int(40 * (1 - offset/glow)))
        gc = tuple(max(0, min(255, int(c * a/80))) for c in color)
        draw.line([(x1, y-offset), (x2, y-offset)], fill=gc, width=1)
        draw.line([(x1, y+offset), (x2, y+offset)], fill=gc, width=1)
    draw.line([(x1, y), (x2, y)], fill=color, width=thickness)


def gradient_text(img, text, font, y, color_top, color_bottom):
    """Draw text with vertical gradient color."""
    draw = ImageDraw.Draw(img)
    bbox = draw.textbbox((0, 0), text, font=font)
    tw, th = bbox[2]-bbox[0], bbox[3]-bbox[1]
    x = (W - tw) // 2

    # Create text mask
    txt_img = Image.new("RGBA", (W, H), (0,0,0,0))
    txt_draw = ImageDraw.Draw(txt_img)
    txt_draw.text((x, y), text, font=font, fill=(255,255,255,255))

    # Create gradient
    grad = Image.new("RGBA", (W, H), (0,0,0,0))
    grad_px = grad.load()
    for py in range(H):
        t = max(0, min(1, (py - y) / max(1, th)))
        c = tuple(int(color_top[i]*(1-t) + color_bottom[i]*t) for i in range(3))
        for px in range(W):
            if txt_img.load()[px, py][3] > 0:
                grad_px[px, py] = (*c, txt_img.load()[px, py][3])

    img.paste(grad, (0, 0), grad)
    return x, th


def add_neon_text_shadow(img, text, font, x, y, color=(0, 200, 130), blur=8):
    """Add neon glow behind text."""
    glow = Image.new("RGBA", (W, H), (0,0,0,0))
    glow_draw = ImageDraw.Draw(glow)
    glow_draw.text((x, y), text, font=font, fill=(*color, 100))
    glow = glow.filter(ImageFilter.GaussianBlur(radius=blur))
    img_rgba = img.convert("RGBA")
    composite = Image.alpha_composite(img_rgba, glow)
    return composite.convert("RGB")


def darken_bottom(img, height=400, strength=0.85):
    """Darken bottom portion for text overlay."""
    overlay = Image.new("RGBA", (W, H), (0,0,0,0))
    draw = ImageDraw.Draw(overlay)
    start_y = H - height
    for y in range(start_y, H):
        t = (y - start_y) / height
        a = int(255 * t * strength)
        draw.line([(0, y), (W, y)], fill=(0, 0, 0, a))
    img_rgba = img.convert("RGBA")
    return Image.alpha_composite(img_rgba, overlay).convert("RGB")


def darken_top(img, height=300, strength=0.7):
    """Darken top portion for text overlay."""
    overlay = Image.new("RGBA", (W, H), (0,0,0,0))
    draw = ImageDraw.Draw(overlay)
    for y in range(height):
        t = 1 - (y / height)
        a = int(255 * t * strength)
        draw.line([(0, y), (W, y)], fill=(0, 0, 0, a))
    img_rgba = img.convert("RGBA")
    return Image.alpha_composite(img_rgba, overlay).convert("RGB")


def add_color_tint(img, color=(0, 30, 60), strength=0.3):
    """Add color tint overlay."""
    tint = Image.new("RGB", (W, H), color)
    return ImageChops.add(img, tint, scale=int(1/strength))


def centered_text(draw, y, text, font, fill=(255,255,255)):
    bbox = draw.textbbox((0,0), text, font=font)
    tw = bbox[2]-bbox[0]
    x = (W-tw)//2
    draw.text((x, y), text, font=font, fill=fill)
    return x, bbox[3]-bbox[1]


def wrap_text(text, font, max_w, draw):
    words = text.split()
    lines, cur = [], ""
    for w in words:
        test = f"{cur} {w}".strip()
        bb = draw.textbbox((0,0), test, font=font)
        if bb[2]-bb[0] <= max_w:
            cur = test
        else:
            if cur: lines.append(cur)
            cur = w
    if cur: lines.append(cur)
    return lines


# ─── CHARACTER PROMPTS ───

CHARACTER_PROMPTS = {
    "strategist": (
        "3D Pixar style cartoon character, confident professional business man in sleek black suit, "
        "arms crossed, slight smirk, standing power pose, dark moody cinematic studio background "
        "with dramatic spotlight and volumetric fog, ultra detailed, 4K render, octane, "
        "clean composition, character centered, full body visible, no text no words no letters"
    ),
    "frustrated": (
        "3D Pixar style cartoon character, stressed overwhelmed business person sitting at desk "
        "with head in hands, laptop open showing red charts going down, papers scattered, "
        "dramatic moody dark blue lighting, cinematic, ultra detailed 4K render, "
        "expressive face, no text no words no letters"
    ),
    "celebrating": (
        "3D Pixar style cartoon character, excited happy business professional jumping with joy, "
        "fist pump celebration, holding phone showing green growth charts going up, "
        "confetti particles in air, dark cinematic background with golden spotlight, "
        "ultra detailed 4K, vibrant, no text no words no letters"
    ),
    "presenting": (
        "3D Pixar style cartoon character, confident professional woman in black blazer "
        "pointing at floating holographic dashboard with charts and metrics, "
        "dark futuristic office background with blue neon accents, dramatic lighting, "
        "ultra detailed 4K cinematic render, no text no words no letters"
    ),
    "thinking": (
        "3D Pixar style cartoon character, thoughtful business man in black turtleneck "
        "chin on hand thinking pose, looking at floating calendar and clock icons, "
        "dark moody background with purple atmospheric lighting, "
        "ultra detailed 4K cinematic, expressive eyes, no text no words no letters"
    ),
    "phone_scrolling": (
        "3D Pixar style cartoon character, person mindlessly scrolling phone with bored expression, "
        "slouching on couch, social media icons floating out of phone screen, "
        "dark room with blue screen light on face, moody cinematic, "
        "ultra detailed 4K render, no text no words no letters"
    ),
    "architect": (
        "3D Pixar style cartoon character, powerful confident business strategist in premium black suit, "
        "standing behind desk with holographic blueprint of revenue systems floating in front, "
        "dark executive office with city skyline through window, dramatic golden rim lighting, "
        "ultra detailed 4K cinematic render, no text no words no letters"
    ),
    "team_meeting": (
        "3D Pixar style cartoon scene, small team of 3 diverse professionals at sleek dark conference table, "
        "holographic chart floating above table showing upward growth, "
        "dark modern office with ambient blue neon lighting, cinematic, "
        "ultra detailed 4K render, no text no words no letters"
    ),
    "rocket_growth": (
        "3D Pixar style cartoon scene, small rocket ship launching upward with flame trail, "
        "surrounded by floating social media engagement icons likes hearts comments, "
        "dark space background with stars and nebula glow, cinematic, "
        "ultra detailed 4K render, vibrant colors, no text no words no letters"
    ),
    "clock_urgency": (
        "3D Pixar style cartoon, dramatic closeup of golden stopwatch showing 3 seconds, "
        "with motion blur speed lines and particles flying, dark background with warm spotlight, "
        "cinematic dramatic lighting, ultra detailed 4K render, "
        "no text no words no letters"
    ),
}


# ─── SLIDE BUILDERS ───

def build_character_hook(char_img_path, line1, line2, subtitle, output_path, accent_color=(0, 200, 150)):
    """Hook slide: AI character + bold text overlay."""
    # Load and enhance character image
    char = Image.open(char_img_path).resize((W, H), Image.LANCZOS)
    char = ImageEnhance.Contrast(char).enhance(1.2)

    # Darken top and bottom for text
    img = darken_top(char, height=280, strength=0.8)
    img = darken_bottom(img, height=380, strength=0.9)

    draw = ImageDraw.Draw(img)

    # Brand at top
    brand_f = find_font_regular(14)
    centered_text(draw, 40, "D S   M A R K E T I N G", brand_f, fill=(180, 180, 180))

    # Subtitle at top
    if subtitle:
        sub_f = find_font_regular(22)
        centered_text(draw, 72, subtitle, sub_f, fill=accent_color)

    # Main text at bottom
    main_f = find_font_bold(76)
    lines = wrap_text(line1, main_f, W-100, draw)
    y = H - 320
    for line in lines:
        # Neon glow behind text
        img = add_neon_text_shadow(img, line, main_f,
                                    (W - draw.textbbox((0,0), line, font=main_f)[2])//2,
                                    y, color=accent_color, blur=12)
        draw = ImageDraw.Draw(img)
        centered_text(draw, y, line, main_f, fill=(255, 255, 255))
        y += 82

    if line2:
        line2_f = find_font_bold(68)
        centered_text(draw, y + 5, line2, line2_f, fill=(200, 200, 200))

    # Swipe indicator
    sw_f = find_font_regular(14)
    centered_text(draw, H - 70, "S W I P E   →", sw_f, fill=(120, 120, 120))

    # Handle
    h_f = find_font_regular(16)
    centered_text(draw, H - 42, "@dsmarketing.agency", h_f, fill=(100, 100, 100))

    img.save(output_path, quality=95)
    print(f"  ✓ {os.path.basename(output_path)}")


def build_character_numbered(char_img_path, number, title, subtitle, slide_num, total,
                              output_path, accent_color=(0, 200, 150)):
    """Numbered slide: AI character background + number + text."""
    char = Image.open(char_img_path).resize((W, H), Image.LANCZOS)
    char = ImageEnhance.Contrast(char).enhance(1.15)
    char = ImageEnhance.Brightness(char).enhance(0.6)  # Darken for readability

    # Heavy darken for text area
    img = darken_bottom(char, height=550, strength=0.92)
    img = darken_top(img, height=200, strength=0.6)

    draw = ImageDraw.Draw(img)

    # Number with neon accent
    num_f = find_font_bold(140)
    num_str = f"{number:02d}"
    num_bbox = draw.textbbox((80, 500), num_str, font=num_f)

    # Neon glow behind number
    img = add_neon_text_shadow(img, num_str, num_f, 80, 500, color=accent_color, blur=15)
    draw = ImageDraw.Draw(img)
    draw.text((80, 500), num_str, font=num_f, fill=(255, 255, 255))

    # Vertical neon line
    line_x = num_bbox[2] + 20
    neon_glow_line_v(draw, line_x, 520, 660, color=accent_color, glow=8)

    # Title
    title_f = find_font_bold(42)
    title_lines = wrap_text(title.upper(), title_f, W - line_x - 100, draw)
    ty = 530
    for line in title_lines:
        draw.text((line_x + 25, ty), line, font=title_f, fill=(255, 255, 255))
        ty += 50

    # Subtitle
    sub_f = find_font_regular(24)
    sub_lines = wrap_text(subtitle, sub_f, W - 180, draw)
    sy = 700
    for line in sub_lines:
        draw.text((90, sy), line, font=sub_f, fill=(170, 170, 175))
        sy += 36

    # Slide counter dots
    dot_y = H - 80
    for i in range(min(total, 10)):
        dx = W//2 - (total*10)//2 + i*20
        r = 4 if i == slide_num-1 else 3
        dc = accent_color if i == slide_num-1 else (60, 60, 60)
        draw.ellipse([dx-r, dot_y-r, dx+r, dot_y+r], fill=dc)

    # Handle
    h_f = find_font_regular(16)
    centered_text(draw, H - 42, "@dsmarketing.agency", h_f, fill=(90, 90, 90))

    img.save(output_path, quality=95)
    print(f"  ✓ {os.path.basename(output_path)}")


def neon_glow_line_v(draw, x, y1, y2, color=(0,200,150), glow=8):
    """Vertical neon glow line."""
    for offset in range(glow, 0, -1):
        a = max(3, int(40*(1-offset/glow)))
        gc = tuple(max(0,min(255,int(c*a/80))) for c in color)
        draw.line([(x-offset, y1), (x-offset, y2)], fill=gc, width=1)
        draw.line([(x+offset, y1), (x+offset, y2)], fill=gc, width=1)
    draw.line([(x, y1), (x, y2)], fill=color, width=2)


def build_dark_gradient_slide(title, subtitle, points, slide_num, total, output_path,
                               accent=(0, 200, 150), bg_accent=(15, 25, 50)):
    """Dark premium slide with neon accents (no character)."""
    img = radial_gradient(W, H, W//2, int(H*0.3), int(W*0.7), bg_accent, (0,0,0))

    # Add some noise
    px = img.load()
    random.seed(slide_num)
    for _ in range(W*H//4):
        x, y = random.randint(0,W-1), random.randint(0,H-1)
        r,g,b = px[x,y]
        n = random.randint(-6,6)
        px[x,y] = (max(0,min(255,r+n)), max(0,min(255,g+n)), max(0,min(255,b+n)))

    draw = ImageDraw.Draw(img)

    # Corner brackets
    m, l = 45, 50
    cc = (40, 40, 45)
    for coords in [
        [(m,m),(m+l,m)], [(m,m),(m,m+l)],
        [(W-m-l,m),(W-m,m)], [(W-m,m),(W-m,m+l)],
        [(m,H-m),(m+l,H-m)], [(m,H-m-l),(m,H-m)],
        [(W-m-l,H-m),(W-m,H-m)], [(W-m,H-m-l),(W-m,H-m)],
    ]:
        draw.line(coords, fill=cc, width=2)

    # Title with gradient
    title_f = find_font_bold(56)
    gradient_text(img, title, title_f, 120, accent, (255, 255, 255))
    draw = ImageDraw.Draw(img)

    # Neon divider
    neon_glow_line(draw, 195, 250, W-250, color=accent, glow=10)

    # Points
    pt_f = find_font_bold(26)
    desc_f = find_font_regular(22)
    y = 240
    for i, point in enumerate(points):
        # Numbered bullet with accent
        bullet = f"{i+1:02d}"
        draw.text((100, y), bullet, font=pt_f, fill=accent)
        neon_glow_line_v(draw, 152, y+4, y+28, color=accent, glow=4)
        draw.text((168, y+2), point, font=desc_f, fill=(210, 210, 215))
        y += 56

    # Subtitle at bottom
    if subtitle:
        sub_f = find_font_regular(20)
        centered_text(draw, H - 120, subtitle, sub_f, fill=(130, 130, 135))

    # Dots
    dot_y = H - 80
    for i in range(min(total, 10)):
        dx = W//2 - (total*10)//2 + i*20
        r = 4 if i == slide_num-1 else 3
        dc = accent if i == slide_num-1 else (50, 50, 50)
        draw.ellipse([dx-r, dot_y-r, dx+r, dot_y+r], fill=dc)

    h_f = find_font_regular(16)
    centered_text(draw, H - 42, "@dsmarketing.agency", h_f, fill=(80, 80, 80))

    img.save(output_path, quality=95)
    print(f"  ✓ {os.path.basename(output_path)}")


def build_cta_slide(char_img_path, cta_text, output_path, accent=(0, 200, 150)):
    """CTA slide with character + brand."""
    char = Image.open(char_img_path).resize((W, H), Image.LANCZOS)
    char = ImageEnhance.Brightness(char).enhance(0.5)

    img = darken_bottom(char, height=450, strength=0.95)
    img = darken_top(img, height=300, strength=0.85)
    draw = ImageDraw.Draw(img)

    # DS MARKETING
    ds_f = find_font_bold(100)
    img = add_neon_text_shadow(img, "DS", ds_f,
                               (W - draw.textbbox((0,0),"DS",font=ds_f)[2])//2,
                               350, color=accent, blur=15)
    draw = ImageDraw.Draw(img)
    centered_text(draw, 350, "DS", ds_f, fill=(255, 255, 255))

    mkt_f = find_font_bold(48)
    centered_text(draw, 455, "MARKETING", mkt_f, fill=(180, 180, 185))

    # Neon line
    neon_glow_line(draw, 520, 330, W-330, color=accent, glow=12)

    # CTA
    cta_f = find_font_bold(38)
    centered_text(draw, 555, cta_text, cta_f, fill=(255, 255, 255))

    # Handle
    h_f = find_font_regular(22)
    centered_text(draw, 615, "@dsmarketing.agency", h_f, fill=accent)

    # Website
    w_f = find_font_regular(16)
    centered_text(draw, 660, "dsmarketing.lovable.app", w_f, fill=(80, 80, 80))

    img.save(output_path, quality=95)
    print(f"  ✓ {os.path.basename(output_path)}")


def build_recap_with_bg(char_img_path, title, points, slide_num, total, output_path, accent=(0,200,150)):
    """Recap slide with darkened character background."""
    char = Image.open(char_img_path).resize((W, H), Image.LANCZOS)
    char = ImageEnhance.Brightness(char).enhance(0.25)
    char = ImageEnhance.Contrast(char).enhance(1.1)

    img = char
    draw = ImageDraw.Draw(img)

    # Semi-transparent overlay
    overlay = Image.new("RGBA", (W, H), (0, 0, 0, 180))
    img = img.convert("RGBA")
    img = Image.alpha_composite(img, overlay).convert("RGB")
    draw = ImageDraw.Draw(img)

    # Corner brackets
    m, l = 45, 50
    cc = (50, 50, 55)
    for coords in [
        [(m,m),(m+l,m)], [(m,m),(m,m+l)],
        [(W-m-l,m),(W-m,m)], [(W-m,m),(W-m,m+l)],
        [(m,H-m),(m+l,H-m)], [(m,H-m-l),(m,H-m)],
        [(W-m-l,H-m),(W-m,H-m)], [(W-m,H-m-l),(W-m,H-m)],
    ]:
        draw.line(coords, fill=cc, width=2)

    # Title with accent
    title_f = find_font_bold(52)
    gradient_text(img, title, title_f, 110, accent, (255, 255, 255))
    draw = ImageDraw.Draw(img)
    neon_glow_line(draw, 178, 260, W-260, color=accent, glow=8)

    # Points
    pt_f = find_font_bold(24)
    desc_f = find_font_regular(24)
    y = 220
    for i, point in enumerate(points):
        bullet = f"{i+1:02d}"
        draw.text((110, y), bullet, font=pt_f, fill=accent)
        neon_glow_line_v(draw, 155, y+4, y+26, color=accent, glow=4)
        draw.text((170, y+2), point, font=desc_f, fill=(215, 215, 220))
        y += 52

    # Dots + handle
    dot_y = H - 80
    for i in range(min(total, 10)):
        dx = W//2 - (total*10)//2 + i*20
        r = 4 if i == slide_num-1 else 3
        dc = accent if i == slide_num-1 else (50, 50, 50)
        draw.ellipse([dx-r, dot_y-r, dx+r, dot_y+r], fill=dc)

    h_f = find_font_regular(16)
    centered_text(draw, H - 42, "@dsmarketing.agency", h_f, fill=(80, 80, 80))

    img.save(output_path, quality=95)
    print(f"  ✓ {os.path.basename(output_path)}")


# ═══════════════════════════════════════════
# MAIN GENERATION
# ═══════════════════════════════════════════

def main():
    print("=" * 55)
    print("  DS MARKETING — V3 CHARACTER SLIDE GENERATOR")
    print("  3D Characters + Neon Accents + Premium Layout")
    print("=" * 55)

    # Create output directories
    dirs = {
        "chars": f"{OUT}/characters",
        "mon": f"{OUT}/monday",
        "wed": f"{OUT}/wednesday",
        "fri": f"{OUT}/friday",
    }
    for d in dirs.values():
        os.makedirs(d, exist_ok=True)

    ACCENT = (0, 210, 150)  # Neon green like CashFish

    # ─── Step 1: Generate AI Characters ───
    print("\n▸ STEP 1: Generating 3D Characters (this takes 2-5 min)...")
    print("─" * 50)

    chars_needed = {
        "strategist": CHARACTER_PROMPTS["strategist"],
        "frustrated": CHARACTER_PROMPTS["frustrated"],
        "celebrating": CHARACTER_PROMPTS["celebrating"],
        "presenting": CHARACTER_PROMPTS["presenting"],
        "thinking": CHARACTER_PROMPTS["thinking"],
        "phone_scrolling": CHARACTER_PROMPTS["phone_scrolling"],
        "architect": CHARACTER_PROMPTS["architect"],
        "rocket_growth": CHARACTER_PROMPTS["rocket_growth"],
        "clock_urgency": CHARACTER_PROMPTS["clock_urgency"],
    }

    char_paths = {}
    for name, prompt in chars_needed.items():
        path = f"{dirs['chars']}/{name}.png"
        char_paths[name] = path
        if os.path.exists(path):
            print(f"  ✓ {name}.png (cached)")
            continue
        print(f"  ⏳ Generating {name}...")
        success = download_ai_image(prompt, path)
        if not success:
            # Create fallback dark image
            print(f"  ⚠ Using dark fallback for {name}")
            fb = radial_gradient(W, H, W//2, H//2, int(W*0.6), (30, 40, 70), (0,0,0))
            fb.save(path, quality=95)
        time.sleep(2)

    # ─── Step 2: Monday Carousel ───
    print(f"\n▸ STEP 2: MONDAY — 7 Social Media Mistakes")
    print("─" * 50)

    build_character_hook(
        char_paths["frustrated"],
        "YOUR SOCIAL MEDIA", "ISN'T FAILING. YOUR STRATEGY IS.",
        "7 mistakes killing your growth",
        f"{dirs['mon']}/slide_01_hook.png", accent_color=ACCENT,
    )

    # Numbered mistakes with character backgrounds
    mistake_chars = ["phone_scrolling", "frustrated", "phone_scrolling", "frustrated",
                     "phone_scrolling", "frustrated", "thinking"]
    mistakes = [
        ("Posting without a content plan", "Random posts = random results. A plan turns chaos into consistency."),
        ("Ignoring your analytics", "The data tells you exactly what works. Stop guessing, start reading."),
        ("Buying followers for vanity", "10K fake followers won't buy your product. Ever."),
        ("No consistent brand voice", "If your audience can't recognize you, you don't have a brand."),
        ("Same content everywhere", "What works on Instagram doesn't work on LinkedIn. Adapt."),
        ("Zero audience engagement", "Posting and disappearing tells the algorithm you don't care."),
        ("No post-publish strategy", "Publishing is 20% of the work. Distribution is the other 80%."),
    ]

    for i, (title, sub) in enumerate(mistakes):
        # Alternate between character slides and dark gradient slides
        if i % 2 == 0:
            build_character_numbered(
                char_paths[mistake_chars[i]], i+1, title, sub,
                i+2, 10, f"{dirs['mon']}/slide_{i+2:02d}.png",
                accent_color=ACCENT,
            )
        else:
            build_dark_gradient_slide(
                title.upper(), None, [sub], i+2, 10,
                f"{dirs['mon']}/slide_{i+2:02d}.png",
                accent=ACCENT,
            )

    build_recap_with_bg(
        char_paths["strategist"], "QUICK RECAP",
        ["No content plan", "Ignoring analytics", "Buying fake followers",
         "Inconsistent brand voice", "Same content everywhere",
         "Not engaging", "No post-publish strategy"],
        9, 10, f"{dirs['mon']}/slide_09_recap.png", accent=ACCENT,
    )

    build_cta_slide(
        char_paths["architect"], "FOLLOW FOR MORE",
        f"{dirs['mon']}/slide_10_cta.png", accent=ACCENT,
    )

    # ─── Step 3: Wednesday Carousel ───
    print(f"\n▸ STEP 3: WEDNESDAY — Perfect Content Calendar")
    print("─" * 50)

    build_character_hook(
        char_paths["presenting"],
        "STOP POSTING RANDOMLY.", "START POSTING STRATEGICALLY.",
        "Your weekly content framework",
        f"{dirs['wed']}/slide_01_hook.png", accent_color=ACCENT,
    )

    day_chars = ["thinking", "presenting", "celebrating", "strategist",
                 "celebrating", "thinking", "architect"]
    days = [
        ("Monday — Educational", "Tips, how-tos, frameworks. Prove your expertise."),
        ("Tuesday — Industry insights", "Share trends. Be the one who sees what's coming."),
        ("Wednesday — Case study", "Real numbers, real results. Nothing builds trust faster."),
        ("Thursday — Behind the scenes", "Show your process. People buy from people they trust."),
        ("Friday — Engagement post", "Ask questions. Run polls. Let your audience talk."),
        ("Weekend — Brand story", "Your mission. Your values. Build connection."),
        ("Secret — Batch on Monday", "Create the full week in one sitting. Then engage."),
    ]

    for i, (title, sub) in enumerate(days):
        if i % 2 == 0:
            build_character_numbered(
                char_paths[day_chars[i]], i+1, title, sub,
                i+2, 10, f"{dirs['wed']}/slide_{i+2:02d}.png",
                accent_color=ACCENT,
            )
        else:
            build_dark_gradient_slide(
                title.upper(), None, [sub], i+2, 10,
                f"{dirs['wed']}/slide_{i+2:02d}.png",
                accent=ACCENT,
            )

    build_recap_with_bg(
        char_paths["presenting"], "YOUR WEEKLY FRAMEWORK",
        ["MON — Educate", "TUE — Industry insights", "WED — Case studies",
         "THU — Behind the scenes", "FRI — Engage",
         "SAT/SUN — Brand story", "SECRET — Batch Monday"],
        9, 10, f"{dirs['wed']}/slide_09_recap.png", accent=ACCENT,
    )

    build_cta_slide(
        char_paths["architect"], "SAVE THIS FRAMEWORK",
        f"{dirs['wed']}/slide_10_cta.png", accent=ACCENT,
    )

    # ─── Step 4: Friday Mini Carousel ───
    print(f"\n▸ STEP 4: FRIDAY — The 3-Second Rule")
    print("─" * 50)

    build_character_hook(
        char_paths["clock_urgency"],
        "YOU HAVE 3 SECONDS.", "",
        "The rule that changes everything",
        f"{dirs['fri']}/slide_01_hook.png", accent_color=ACCENT,
    )

    build_dark_gradient_slide(
        "THE 3-SECOND RULE", None,
        [
            "Your audience decides in 3 seconds",
            "whether to stop or keep scrolling.",
            "",
            "Your hook is everything.",
            "Not your logo. Not your palette.",
            "Your first line.",
            "",
            "That's where the battle is won.",
        ],
        2, 3, f"{dirs['fri']}/slide_02.png", accent=ACCENT,
    )

    build_cta_slide(
        char_paths["rocket_growth"], "MAKE EVERY HOOK COUNT",
        f"{dirs['fri']}/slide_03_cta.png", accent=ACCENT,
    )

    # ─── Done ───
    print("\n" + "=" * 55)
    print(f"  DONE! All files saved to: {OUT}/")
    print("=" * 55)
    print(f"""
  📁 {OUT}/
     characters/  — 9 AI-generated 3D characters
     monday/      — 10 slides ready to post
     wednesday/   — 10 slides ready to post
     friday/      — 3 slides ready to post

  NEXT STEPS:
  1. Open the folder and check the images
  2. Upload to Instagram via business.facebook.com
  3. Copy captions from your GitHub repo
""")


if __name__ == "__main__":
    main()
