"""
DS Marketing - Premium Carousel & Reels Generator V2
=====================================================
Generates Week 1 slides with cinematic design + animated video reels.
"""

from PIL import Image, ImageDraw, ImageFont, ImageFilter
import os
import math
import random
import struct
import zlib

# ─── CONFIG ───
W, H = 1080, 1080
BEBAS = "/home/user/Claude/ds-marketing/tools/BebasNeue-Regular.ttf"
LIBSANS = "/usr/share/fonts/truetype/liberation/LiberationSans-Bold.ttf"
LIBSANS_REG = "/usr/share/fonts/truetype/liberation/LiberationSans-Regular.ttf"

OUT_MON = "/home/user/Claude/ds-marketing/week1/images/monday"
OUT_WED = "/home/user/Claude/ds-marketing/week1/images/wednesday"
OUT_FRI = "/home/user/Claude/ds-marketing/week1/images/friday"
OUT_REELS = "/home/user/Claude/ds-marketing/week1/reels"

for d in [OUT_MON, OUT_WED, OUT_FRI, OUT_REELS]:
    os.makedirs(d, exist_ok=True)


# ═══════════════════════════════════════════
# VISUAL ENGINE
# ═══════════════════════════════════════════

def radial_gradient(w, h, cx, cy, radius, inner_color, outer_color=(0,0,0)):
    """Create a smooth radial gradient."""
    img = Image.new("RGB", (w, h), outer_color)
    pixels = img.load()
    for y in range(h):
        for x in range(w):
            dist = math.sqrt((x - cx)**2 + (y - cy)**2)
            t = min(1.0, dist / radius)
            t = t * t  # quadratic falloff for smoother look
            r = int(inner_color[0] * (1 - t) + outer_color[0] * t)
            g = int(inner_color[1] * (1 - t) + outer_color[1] * t)
            b = int(inner_color[2] * (1 - t) + outer_color[2] * t)
            pixels[x, y] = (r, g, b)
    return img


def make_cinematic_bg(accent=(30, 40, 80), spot_x=0.5, spot_y=0.35, radius=0.7, secondary=None):
    """Dark cinematic background with spotlight and optional secondary glow."""
    img = radial_gradient(W, H, int(W*spot_x), int(H*spot_y), int(W*radius), accent, (0,0,0))
    if secondary:
        img2 = radial_gradient(W, H, int(W*secondary[0]), int(H*secondary[1]),
                               int(W*0.5), secondary[2], (0,0,0))
        from PIL import ImageChops
        img = ImageChops.add(img, img2)
    return img


def make_light_bg(base=(240, 240, 240), accent=(220, 220, 230)):
    """Clean light background with subtle gradient."""
    img = Image.new("RGB", (W, H), base)
    draw = ImageDraw.Draw(img)
    # Subtle diagonal gradient overlay
    for y in range(H):
        t = y / H
        c = tuple(int(base[i] * (1-t*0.05) + accent[i] * t*0.05) for i in range(3))
        draw.line([(0, y), (W, y)], fill=c)
    return img


def add_film_grain(img, amount=10):
    """Realistic film grain."""
    pixels = img.load()
    random.seed(42)
    for _ in range(W * H // 3):
        x = random.randint(0, W-1)
        y = random.randint(0, H-1)
        r, g, b = pixels[x, y]
        n = random.randint(-amount, amount)
        pixels[x, y] = (max(0,min(255,r+n)), max(0,min(255,g+n)), max(0,min(255,b+n)))
    return img


def add_vignette(img, strength=0.8):
    """Cinematic vignette."""
    vignette = Image.new("L", (W, H), 0)
    draw = ImageDraw.Draw(vignette)
    cx, cy = W//2, H//2
    max_r = int(W * 0.75)
    for r in range(max_r, 0, -1):
        t = r / max_r
        alpha = int(255 * t)
        draw.ellipse([cx-r, cy-r, cx+r, cy+r], fill=alpha)
    black = Image.new("RGB", (W, H), (0, 0, 0))
    return Image.composite(img, black, vignette)


def draw_spotlight_beam(img, x, top_width=30, bottom_width=200, alpha=25):
    """Draw a subtle vertical light beam."""
    overlay = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    draw = ImageDraw.Draw(overlay)
    for y in range(H):
        t = y / H
        width = int(top_width + (bottom_width - top_width) * t)
        a = int(alpha * (1 - t * 0.7))
        draw.line([(x - width//2, y), (x + width//2, y)], fill=(255, 255, 255, a))
    img = img.convert("RGBA")
    img = Image.alpha_composite(img, overlay)
    return img.convert("RGB")


def draw_horizontal_glow_line(draw, y, margin=200, color=(255,255,255), thickness=1, glow=15):
    """Draw a glowing horizontal line."""
    cx = W // 2
    length = W - 2 * margin
    for offset in range(glow, 0, -1):
        a = max(5, int(30 * (1 - offset / glow)))
        c = (color[0], color[1], color[2])
        # Approximate glow with lighter shades
        gc = tuple(max(0, min(255, int(ci * a / 60))) for ci in c)
        draw.line([(margin, y - offset), (W - margin, y - offset)], fill=gc, width=1)
        draw.line([(margin, y + offset), (W - margin, y + offset)], fill=gc, width=1)
    draw.line([(margin, y), (W - margin, y)], fill=color, width=thickness)


def draw_decorative_corners(draw, margin=45, length=50, color=(60,60,60), width=2):
    """Elegant corner brackets."""
    m, l = margin, length
    draw.line([(m, m), (m+l, m)], fill=color, width=width)
    draw.line([(m, m), (m, m+l)], fill=color, width=width)
    draw.line([(W-m-l, m), (W-m, m)], fill=color, width=width)
    draw.line([(W-m, m), (W-m, m+l)], fill=color, width=width)
    draw.line([(m, H-m), (m+l, H-m)], fill=color, width=width)
    draw.line([(m, H-m-l), (m, H-m)], fill=color, width=width)
    draw.line([(W-m-l, H-m), (W-m, H-m)], fill=color, width=width)
    draw.line([(W-m, H-m-l), (W-m, H-m)], fill=color, width=width)


def draw_vertical_accent_line(draw, x, y1, y2, color=(80,80,80), width=2):
    """Vertical decorative line."""
    draw.line([(x, y1), (x, y2)], fill=color, width=width)


def centered_text(draw, y, text, font, fill=(255,255,255)):
    """Draw centered text, return (x, text_height)."""
    bbox = draw.textbbox((0,0), text, font=font)
    tw = bbox[2] - bbox[0]
    th = bbox[3] - bbox[1]
    x = (W - tw) // 2
    draw.text((x, y), text, font=font, fill=fill)
    return x, th


def wrap_text(text, font, max_width, draw):
    """Word-wrap text."""
    words = text.split()
    lines, current = [], ""
    for word in words:
        test = f"{current} {word}".strip()
        bbox = draw.textbbox((0,0), test, font=font)
        if bbox[2] - bbox[0] <= max_width:
            current = test
        else:
            if current: lines.append(current)
            current = word
    if current: lines.append(current)
    return lines


def draw_number_badge(draw, x, y, number, size=140, dark_mode=True):
    """Draw a large stylish number with accent line."""
    num_font = ImageFont.truetype(BEBAS, size)
    num_str = f"{number:02d}"
    if dark_mode:
        draw.text((x, y), num_str, font=num_font, fill=(255, 255, 255))
    else:
        draw.text((x, y), num_str, font=num_font, fill=(20, 20, 20))
    bbox = draw.textbbox((x, y), num_str, font=num_font)
    return bbox[2]  # right edge of number


def add_brand_footer(draw, dark_mode=True, slide_num=None, total=None):
    """Add branded footer with handle and optional slide number."""
    handle_font = ImageFont.truetype(LIBSANS_REG, 18)
    handle = "@dsmarketing.agency"
    if dark_mode:
        hcolor = (100, 100, 100)
        sncolor = (70, 70, 70)
    else:
        hcolor = (150, 150, 150)
        sncolor = (180, 180, 180)

    bbox = draw.textbbox((0,0), handle, font=handle_font)
    tw = bbox[2] - bbox[0]
    draw.text(((W - tw)//2, H - 52), handle, font=handle_font, fill=hcolor)

    if slide_num and total:
        sn_font = ImageFont.truetype(LIBSANS_REG, 16)
        sn = f"{slide_num}/{total}"
        sb = draw.textbbox((0,0), sn, font=sn_font)
        draw.text((W - 80, H - 52), sn, font=sn_font, fill=sncolor)


# ═══════════════════════════════════════════
# SLIDE TEMPLATES V2
# ═══════════════════════════════════════════

def make_hook_v2(line1, line2, output_path, accent=(25, 35, 70)):
    """Premium hook slide with spotlight beam and glow text."""
    img = make_cinematic_bg(accent, spot_y=0.38, radius=0.65,
                            secondary=(0.7, 0.8, (15, 10, 40)))
    img = draw_spotlight_beam(img, W//2, top_width=20, bottom_width=160, alpha=18)
    img = add_film_grain(img, 8)
    img = add_vignette(img, 0.75)
    draw = ImageDraw.Draw(img)
    draw_decorative_corners(draw, color=(55, 55, 55))

    # Brand at top
    brand_font = ImageFont.truetype(LIBSANS, 14)
    centered_text(draw, 55, "D S   M A R K E T I N G", brand_font, fill=(80, 80, 80))
    draw_horizontal_glow_line(draw, 82, margin=410, color=(60, 60, 60), glow=5)

    # Main text
    main_font = ImageFont.truetype(BEBAS, 88)
    lines = wrap_text(line1, main_font, W - 140, draw)
    block_h = len(lines) * 95
    start_y = 340 - block_h // 2

    for i, line in enumerate(lines):
        centered_text(draw, start_y + i*95, line, main_font, fill=(255, 255, 255))

    if line2:
        sub_font = ImageFont.truetype(BEBAS, 78)
        lines2 = wrap_text(line2, sub_font, W - 140, draw)
        y2 = start_y + len(lines) * 95 + 15
        for i, line in enumerate(lines2):
            centered_text(draw, y2 + i*85, line, sub_font, fill=(180, 180, 180))

    # Bottom accent
    draw_horizontal_glow_line(draw, H - 155, margin=320, color=(50, 50, 50), glow=5)
    swipe_font = ImageFont.truetype(LIBSANS_REG, 16)
    centered_text(draw, H - 125, "S W I P E   T O   L E A R N   M O R E   →", swipe_font, fill=(100, 100, 100))

    add_brand_footer(draw, dark_mode=True)
    img.save(output_path, quality=95)
    print(f"  ✓ {os.path.basename(output_path)}")


def make_numbered_v2(number, title, subtitle, slide_num, total, output_path,
                     dark=True, accent=(25, 30, 60)):
    """Premium numbered content slide."""
    if dark:
        img = make_cinematic_bg(accent, spot_x=0.3, spot_y=0.25, radius=0.7)
        img = add_film_grain(img, 6)
        img = add_vignette(img, 0.6)
        txt_c = (255, 255, 255)
        sub_c = (155, 155, 165)
        line_c = (55, 55, 65)
        corner_c = (45, 45, 50)
        num_c = (255, 255, 255)
    else:
        img = make_light_bg((242, 242, 242), (235, 235, 240))
        txt_c = (15, 15, 15)
        sub_c = (90, 90, 95)
        line_c = (205, 205, 210)
        corner_c = (200, 200, 205)
        num_c = (25, 25, 25)

    draw = ImageDraw.Draw(img)
    draw_decorative_corners(draw, color=corner_c)

    # Large number
    num_font = ImageFont.truetype(BEBAS, 160)
    num_str = f"{number:02d}"
    draw.text((85, 150), num_str, font=num_font, fill=num_c)
    num_bbox = draw.textbbox((85, 150), num_str, font=num_font)
    line_x = num_bbox[2] + 25

    # Vertical accent line
    draw_vertical_accent_line(draw, line_x, 185, 340, color=line_c, width=2)

    # Title
    title_font = ImageFont.truetype(BEBAS, 48)
    title_lines = wrap_text(title.upper(), title_font, W - line_x - 100, draw)
    ty = 200
    for line in title_lines:
        draw.text((line_x + 25, ty), line, font=title_font, fill=txt_c)
        ty += 55

    # Divider with glow
    draw_horizontal_glow_line(draw, 430, margin=85, color=line_c, glow=4 if dark else 2)

    # Subtitle
    sub_font = ImageFont.truetype(LIBSANS_REG, 28)
    sub_lines = wrap_text(subtitle, sub_font, W - 200, draw)
    sy = 480
    for line in sub_lines:
        draw.text((100, sy), line, font=sub_font, fill=sub_c)
        sy += 44

    # Bottom decorative dots
    dot_y = H - 100
    for i in range(5):
        dx = W//2 - 40 + i*20
        r = 3
        dot_c = line_c if i != slide_num - 1 else txt_c
        draw.ellipse([dx-r, dot_y-r, dx+r, dot_y+r], fill=dot_c)

    add_brand_footer(draw, dark_mode=dark, slide_num=slide_num, total=total)
    img.save(output_path, quality=95)
    print(f"  ✓ {os.path.basename(output_path)}")


def make_recap_v2(title, points, slide_num, total, output_path, accent=(20, 25, 55)):
    """Premium recap slide with styled list."""
    img = make_cinematic_bg(accent, spot_y=0.25, radius=0.65)
    img = add_film_grain(img, 6)
    img = add_vignette(img, 0.65)
    draw = ImageDraw.Draw(img)
    draw_decorative_corners(draw, color=(50, 50, 55))

    # Title
    title_font = ImageFont.truetype(BEBAS, 56)
    centered_text(draw, 95, title, title_font, fill=(255, 255, 255))
    draw_horizontal_glow_line(draw, 165, margin=280, color=(70, 70, 80), glow=6)

    # Points with styled bullets
    point_font = ImageFont.truetype(LIBSANS, 26)
    y = 210
    for i, point in enumerate(points):
        # Numbered bullet
        bullet_font = ImageFont.truetype(BEBAS, 28)
        bullet = f"{i+1:02d}"
        draw.text((110, y), bullet, font=bullet_font, fill=(80, 80, 100))
        # Thin line between number and text
        draw.line([(158, y+6), (158, y+24)], fill=(60, 60, 70), width=1)
        draw.text((172, y+2), point, font=point_font, fill=(210, 210, 215))
        y += 52

    # Bottom bar accent
    bar_y = H - 115
    draw.rectangle([(W//2 - 30, bar_y), (W//2 + 30, bar_y + 3)], fill=(60, 60, 70))

    add_brand_footer(draw, dark_mode=True, slide_num=slide_num, total=total)
    img.save(output_path, quality=95)
    print(f"  ✓ {os.path.basename(output_path)}")


def make_cta_v2(cta_text, output_path, accent=(30, 25, 60)):
    """Premium CTA slide with centered brand."""
    img = make_cinematic_bg(accent, spot_y=0.45, radius=0.55,
                            secondary=(0.5, 0.7, (20, 15, 45)))
    img = draw_spotlight_beam(img, W//2, top_width=40, bottom_width=200, alpha=15)
    img = add_film_grain(img, 6)
    img = add_vignette(img, 0.75)
    draw = ImageDraw.Draw(img)
    draw_decorative_corners(draw, color=(50, 50, 55))

    # Large DS
    ds_font = ImageFont.truetype(BEBAS, 120)
    centered_text(draw, 280, "DS", ds_font, fill=(255, 255, 255))

    # MARKETING
    mkt_font = ImageFont.truetype(BEBAS, 52)
    centered_text(draw, 400, "MARKETING", mkt_font, fill=(180, 180, 185))

    # Glow line
    draw_horizontal_glow_line(draw, 475, margin=330, color=(70, 70, 80), glow=8)

    # CTA
    cta_font = ImageFont.truetype(BEBAS, 40)
    centered_text(draw, 510, cta_text, cta_font, fill=(255, 255, 255))

    # Handle
    handle_font = ImageFont.truetype(LIBSANS_REG, 22)
    centered_text(draw, 575, "@dsmarketing.agency", handle_font, fill=(120, 120, 125))

    # Website
    web_font = ImageFont.truetype(LIBSANS_REG, 15)
    centered_text(draw, 625, "dsmarketing.lovable.app", web_font, fill=(70, 70, 75))

    add_brand_footer(draw, dark_mode=True)
    img.save(output_path, quality=95)
    print(f"  ✓ {os.path.basename(output_path)}")


def make_body_slide_v2(title, body_lines, slide_num, total, output_path, accent=(20, 25, 50)):
    """Text-heavy content slide for longer messages."""
    img = make_cinematic_bg(accent, spot_y=0.3, radius=0.7)
    img = add_film_grain(img, 6)
    img = add_vignette(img, 0.65)
    draw = ImageDraw.Draw(img)
    draw_decorative_corners(draw, color=(50, 50, 55))

    # Title
    title_font = ImageFont.truetype(BEBAS, 46)
    centered_text(draw, 120, title, title_font, fill=(255, 255, 255))
    draw_horizontal_glow_line(draw, 180, margin=280, color=(60, 60, 70), glow=5)

    # Body
    body_font = ImageFont.truetype(LIBSANS_REG, 28)
    y = 230
    for line in body_lines:
        if line == "":
            y += 22
            continue
        centered_text(draw, y, line, body_font, fill=(190, 190, 195))
        y += 46

    add_brand_footer(draw, dark_mode=True, slide_num=slide_num, total=total)
    img.save(output_path, quality=95)
    print(f"  ✓ {os.path.basename(output_path)}")


# ═══════════════════════════════════════════
# GENERATE ALL SLIDES
# ═══════════════════════════════════════════

print("\n" + "═" * 50)
print("  DS MARKETING — PREMIUM SLIDE GENERATOR V2")
print("═" * 50)

# ─── MONDAY ───
print("\n▸ MONDAY: 7 Social Media Mistakes")
print("─" * 45)

make_hook_v2(
    "YOUR SOCIAL MEDIA",
    "ISN'T FAILING. YOUR STRATEGY IS.",
    f"{OUT_MON}/slide_01_hook.png",
    accent=(20, 30, 65),
)

mistakes = [
    ("Posting without a content plan", "Random posts = random results. A plan turns chaos into consistency and consistency builds trust."),
    ("Ignoring your analytics completely", "The data tells you exactly what works and what doesn't. Stop guessing. Start reading the numbers."),
    ("Buying followers for vanity metrics", "10K fake followers won't buy your product. Ever. Real engagement beats inflated numbers every time."),
    ("No consistent brand voice", "If your audience can't recognize your content in 2 seconds, you don't have a brand. You have noise."),
    ("Treating every platform the same", "What works on Instagram doesn't work on LinkedIn. Each platform has its own language. Learn it."),
    ("Zero engagement with your audience", "Posting and disappearing tells the algorithm you don't care. And it will stop showing your content."),
    ("No strategy after hitting post", "Publishing is 20% of the work. Distribution, engagement, and repurposing is the other 80%."),
]

for i, (title, sub) in enumerate(mistakes):
    make_numbered_v2(
        number=i+1, title=title, subtitle=sub,
        slide_num=i+2, total=10,
        output_path=f"{OUT_MON}/slide_{i+2:02d}.png",
        dark=(i % 2 != 0),
        accent=[(22, 28, 58), (28, 22, 52), (18, 32, 55), (32, 18, 48)][i % 4],
    )

make_recap_v2(
    "QUICK RECAP",
    ["No content plan", "Ignoring analytics", "Buying fake followers",
     "Inconsistent brand voice", "Same content everywhere",
     "Not engaging with audience", "No post-publish strategy"],
    9, 10, f"{OUT_MON}/slide_09_recap.png",
)

make_cta_v2("FOLLOW FOR MORE", f"{OUT_MON}/slide_10_cta.png")


# ─── WEDNESDAY ───
print("\n▸ WEDNESDAY: The Perfect Content Calendar")
print("─" * 45)

make_hook_v2(
    "STOP POSTING RANDOMLY.",
    "START POSTING STRATEGICALLY.",
    f"{OUT_WED}/slide_01_hook.png",
    accent=(22, 18, 55),
)

days = [
    ("Monday — Educational content", "Tips, how-tos, frameworks. Start the week proving you know what you're talking about."),
    ("Tuesday — Industry insights", "Share trends and data your audience hasn't seen yet. Be the one who sees what's coming."),
    ("Wednesday — Case study", "Show proof. Real numbers, real results, real clients. Nothing builds trust faster than evidence."),
    ("Thursday — Behind the scenes", "Show your process, your team, your workspace. People buy from people they feel they know."),
    ("Friday — Engagement post", "Ask questions. Run polls. Start debates. Let your audience do the talking for you."),
    ("Weekend — Brand story", "Your mission. Your values. Your origin story. Build connection, not just reach."),
    ("The Secret — Batch on Monday", "Create the full week of content in one focused sitting. Then spend the rest of the week engaging."),
]

for i, (title, sub) in enumerate(days):
    make_numbered_v2(
        number=i+1, title=title, subtitle=sub,
        slide_num=i+2, total=10,
        output_path=f"{OUT_WED}/slide_{i+2:02d}.png",
        dark=(i % 2 == 0),
        accent=[(18, 25, 55), (25, 20, 50), (22, 30, 48), (30, 18, 55)][i % 4],
    )

make_recap_v2(
    "YOUR WEEKLY FRAMEWORK",
    ["MON — Educate your audience", "TUE — Share industry insights",
     "WED — Showcase case studies", "THU — Go behind the scenes",
     "FRI — Drive engagement", "SAT/SUN — Tell your brand story",
     "SECRET — Batch everything Monday"],
    9, 10, f"{OUT_WED}/slide_09_recap.png",
)

make_cta_v2("SAVE THIS FRAMEWORK", f"{OUT_WED}/slide_10_cta.png")


# ─── FRIDAY ───
print("\n▸ FRIDAY: The 3-Second Rule")
print("─" * 45)

make_hook_v2(
    "YOU HAVE 3 SECONDS.",
    "",
    f"{OUT_FRI}/slide_01_hook.png",
    accent=(35, 22, 50),
)

make_body_slide_v2(
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
    2, 3, f"{OUT_FRI}/slide_02.png",
)

make_cta_v2("MAKE EVERY HOOK COUNT", f"{OUT_FRI}/slide_03_cta.png")

print("\n✓ All 23 slides generated!")


# ═══════════════════════════════════════════
# VIDEO REELS (GIF format — plays everywhere)
# ═══════════════════════════════════════════
print("\n" + "═" * 50)
print("  GENERATING VIDEO REELS")
print("═" * 50)

import numpy as np


def create_text_reveal_reel(text_lines, output_path, accent=(25, 30, 60),
                            duration_sec=6, fps=15):
    """Create an animated text reveal reel as GIF."""
    total_frames = int(duration_sec * fps)
    frames = []

    for frame_idx in range(total_frames):
        t = frame_idx / total_frames  # 0.0 to 1.0

        # Background with animated spotlight
        spot_y = 0.35 + 0.05 * math.sin(t * math.pi * 2)
        spot_intensity = 0.5 + 0.15 * math.sin(t * math.pi)

        # Simplified bg for speed - use gradient approximation
        img = Image.new("RGB", (W, H), (0, 0, 0))
        draw = ImageDraw.Draw(img)

        # Animated radial glow (simplified for speed)
        cx, cy = W//2, int(H * spot_y)
        max_r = int(W * 0.6)
        for r_step in range(max_r, 0, -8):  # Step by 8 for speed
            rt = r_step / max_r
            a = (1 - rt) * spot_intensity
            c = (int(accent[0] * a), int(accent[1] * a), int(accent[2] * a))
            draw.ellipse([cx-r_step, cy-r_step, cx+r_step, cy+r_step], fill=c)

        # Corner accents
        draw_decorative_corners(draw, color=(40, 40, 45))

        # Brand at top (always visible)
        brand_font = ImageFont.truetype(LIBSANS, 14)
        centered_text(draw, 55, "D S   M A R K E T I N G", brand_font, fill=(70, 70, 70))

        # Text reveal animation
        main_font = ImageFont.truetype(BEBAS, 80)
        total_lines = len(text_lines)

        for i, line in enumerate(text_lines):
            line_start = i / total_lines * 0.6  # Stagger start times
            line_t = max(0, min(1, (t - line_start) / 0.25))  # Fade in over 25% of timeline

            if line_t <= 0:
                continue

            # Fade + slide up effect
            alpha = int(255 * line_t)
            offset_y = int(30 * (1 - line_t))  # Slide up

            y_pos = 350 + i * 95 + offset_y
            color = (alpha, alpha, alpha)

            lines_wrapped = wrap_text(line, main_font, W - 140, draw)
            for j, wl in enumerate(lines_wrapped):
                centered_text(draw, y_pos + j * 90, wl, main_font, fill=color)

        # Handle at bottom
        handle_font = ImageFont.truetype(LIBSANS_REG, 18)
        centered_text(draw, H - 52, "@dsmarketing.agency", handle_font, fill=(80, 80, 80))

        # Convert to numpy for imageio
        frames.append(np.array(img))

    # Save as GIF
    import imageio
    imageio.mimsave(output_path, frames, duration=1000/fps, loop=0)
    file_size = os.path.getsize(output_path) / (1024 * 1024)
    print(f"  ✓ {os.path.basename(output_path)} ({file_size:.1f} MB)")


def create_stats_reel(stats, output_path, accent=(30, 20, 55), duration_sec=8, fps=12):
    """Animated stats/numbers reveal reel."""
    total_frames = int(duration_sec * fps)
    frames = []

    for frame_idx in range(total_frames):
        t = frame_idx / total_frames

        img = Image.new("RGB", (W, H), (0, 0, 0))
        draw = ImageDraw.Draw(img)

        # Animated glow
        cx, cy = W//2, H//2
        max_r = int(W * 0.5)
        for r_step in range(max_r, 0, -8):
            rt = r_step / max_r
            a = (1 - rt) * 0.4
            c = (int(accent[0]*a), int(accent[1]*a), int(accent[2]*a))
            draw.ellipse([cx-r_step, cy-r_step, cx+r_step, cy+r_step], fill=c)

        draw_decorative_corners(draw, color=(40, 40, 45))

        # Title
        title_font = ImageFont.truetype(BEBAS, 50)
        title_alpha = min(255, int(255 * min(1, t / 0.15)))
        centered_text(draw, 120, "THE NUMBERS DON'T LIE", title_font,
                      fill=(title_alpha, title_alpha, title_alpha))

        if t > 0.1:
            draw_horizontal_glow_line(draw, 185, margin=300,
                                      color=(50, 50, 55), glow=4)

        # Stats reveal one by one
        stat_font = ImageFont.truetype(BEBAS, 72)
        label_font = ImageFont.truetype(LIBSANS_REG, 22)

        for i, (value, label) in enumerate(stats):
            start = 0.15 + i * 0.18
            st = max(0, min(1, (t - start) / 0.15))
            if st <= 0:
                continue

            alpha = int(255 * st)
            y_base = 240 + i * 140

            # Animated counter
            if "%" in value:
                num = int(value.replace("%", ""))
                shown = f"{int(num * st)}%"
            elif "x" in value.lower():
                num = float(value.lower().replace("x", ""))
                shown = f"{num * st:.1f}x"
            else:
                shown = value

            centered_text(draw, y_base, shown, stat_font, fill=(alpha, alpha, alpha))
            centered_text(draw, y_base + 70, label, label_font,
                          fill=(int(alpha*0.6), int(alpha*0.6), int(alpha*0.65)))

        # Brand
        handle_font = ImageFont.truetype(LIBSANS_REG, 18)
        centered_text(draw, H - 52, "@dsmarketing.agency", handle_font, fill=(80, 80, 80))

        frames.append(np.array(img))

    import imageio
    imageio.mimsave(output_path, frames, duration=1000/fps, loop=0)
    file_size = os.path.getsize(output_path) / (1024 * 1024)
    print(f"  ✓ {os.path.basename(output_path)} ({file_size:.1f} MB)")


# ─── Generate Reels ───
print("\n▸ Reel 1: Strategy Reveal")
create_text_reveal_reel(
    ["YOUR SOCIAL MEDIA", "ISN'T FAILING.", "YOUR STRATEGY IS."],
    f"{OUT_REELS}/reel_01_strategy.gif",
    accent=(20, 30, 65),
    duration_sec=5, fps=12,
)

print("\n▸ Reel 2: Content Calendar Reveal")
create_text_reveal_reel(
    ["STOP POSTING", "RANDOMLY.", "START POSTING", "STRATEGICALLY."],
    f"{OUT_REELS}/reel_02_calendar.gif",
    accent=(22, 18, 55),
    duration_sec=5, fps=12,
)

print("\n▸ Reel 3: Stats Animation")
create_stats_reel(
    [("73%", "of brands fail without a content strategy"),
     ("3x", "more engagement with consistent posting"),
     ("80%", "of results come from distribution, not creation")],
    f"{OUT_REELS}/reel_03_stats.gif",
    accent=(30, 22, 55),
    duration_sec=7, fps=12,
)

print("\n" + "═" * 50)
print("  ALL DONE! 23 slides + 3 reels generated.")
print("═" * 50)
