"""
DS Marketing - Premium Carousel Generator
Generates all Week 1 slides with premium dark cinematic design.
"""

from PIL import Image, ImageDraw, ImageFont, ImageFilter
import os
import math
import random

# ─── CONFIG ───
W, H = 1080, 1080
BEBAS = "/home/user/Claude/ds-marketing/tools/BebasNeue-Regular.ttf"
LIBSANS = "/usr/share/fonts/truetype/liberation/LiberationSans-Bold.ttf"
LIBSANS_REG = "/usr/share/fonts/truetype/liberation/LiberationSans-Regular.ttf"

OUT_MON = "/home/user/Claude/ds-marketing/week1/images/monday"
OUT_WED = "/home/user/Claude/ds-marketing/week1/images/wednesday"
OUT_FRI = "/home/user/Claude/ds-marketing/week1/images/friday"

for d in [OUT_MON, OUT_WED, OUT_FRI]:
    os.makedirs(d, exist_ok=True)


# ─── HELPERS ───

def make_gradient_bg(accent_color=(20, 30, 60), spotlight_x=0.5, spotlight_y=0.35, intensity=0.4):
    """Create a dark background with radial gradient spotlight."""
    img = Image.new("RGB", (W, H), (0, 0, 0))
    draw = ImageDraw.Draw(img)
    cx, cy = int(W * spotlight_x), int(H * spotlight_y)
    max_r = int(W * 0.8)
    for r in range(max_r, 0, -2):
        t = r / max_r
        alpha = (1 - t) * intensity
        c = tuple(int(accent_color[i] * alpha) for i in range(3))
        draw.ellipse([cx - r, cy - r, cx + r, cy + r], fill=c)
    return img


def add_noise(img, amount=8):
    """Add subtle film grain."""
    import random
    pixels = img.load()
    for _ in range(W * H // 4):
        x = random.randint(0, W - 1)
        y = random.randint(0, H - 1)
        r, g, b = pixels[x, y]
        noise = random.randint(-amount, amount)
        pixels[x, y] = (
            max(0, min(255, r + noise)),
            max(0, min(255, g + noise)),
            max(0, min(255, b + noise)),
        )
    return img


def add_vignette(img, strength=0.7):
    """Add dark vignette around edges."""
    vignette = Image.new("RGB", (W, H), (0, 0, 0))
    mask = Image.new("L", (W, H), 0)
    draw = ImageDraw.Draw(mask)
    cx, cy = W // 2, H // 2
    max_r = int(W * 0.7)
    for r in range(max_r, 0, -2):
        t = r / max_r
        alpha = int(255 * t * t)
        draw.ellipse([cx - r, cy - r, cx + r, cy + r], fill=alpha)
    img = Image.composite(img, vignette, mask)
    return img


def draw_glow_text(draw, pos, text, font, fill=(255, 255, 255), glow_color=(255, 255, 255), glow_radius=3):
    """Draw text with subtle glow effect."""
    x, y = pos
    # Create glow by drawing text multiple times with offset
    glow_img = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    glow_draw = ImageDraw.Draw(glow_img)
    glow_fill = (*glow_color[:3], 30)
    for dx in range(-glow_radius, glow_radius + 1):
        for dy in range(-glow_radius, glow_radius + 1):
            if dx * dx + dy * dy <= glow_radius * glow_radius:
                glow_draw.text((x + dx, y + dy), text, font=font, fill=glow_fill)
    # Blur the glow
    glow_img = glow_img.filter(ImageFilter.GaussianBlur(radius=glow_radius))
    return glow_img


def centered_text(draw, y, text, font, fill=(255, 255, 255)):
    """Draw centered text."""
    bbox = draw.textbbox((0, 0), text, font=font)
    tw = bbox[2] - bbox[0]
    x = (W - tw) // 2
    draw.text((x, y), text, font=font, fill=fill)
    return x, bbox[3] - bbox[1]


def wrap_text(text, font, max_width, draw):
    """Word-wrap text to fit within max_width."""
    words = text.split()
    lines = []
    current = ""
    for word in words:
        test = f"{current} {word}".strip()
        bbox = draw.textbbox((0, 0), test, font=font)
        if bbox[2] - bbox[0] <= max_width:
            current = test
        else:
            if current:
                lines.append(current)
            current = word
    if current:
        lines.append(current)
    return lines


def draw_thin_line(draw, y, margin=200, color=(255, 255, 255), width=1, opacity=80):
    """Draw a thin horizontal line."""
    c = (*color, opacity) if len(color) == 3 else color
    draw.line([(margin, y), (W - margin, y)], fill=color, width=width)


def draw_corner_accents(draw, color=(40, 40, 40)):
    """Draw subtle corner accent lines."""
    length = 60
    margin = 50
    # Top-left
    draw.line([(margin, margin), (margin + length, margin)], fill=color, width=2)
    draw.line([(margin, margin), (margin, margin + length)], fill=color, width=2)
    # Top-right
    draw.line([(W - margin - length, margin), (W - margin, margin)], fill=color, width=2)
    draw.line([(W - margin, margin), (W - margin, margin + length)], fill=color, width=2)
    # Bottom-left
    draw.line([(margin, H - margin), (margin + length, H - margin)], fill=color, width=2)
    draw.line([(margin, H - margin - length), (margin, H - margin)], fill=color, width=2)
    # Bottom-right
    draw.line([(W - margin - length, H - margin), (W - margin, H - margin)], fill=color, width=2)
    draw.line([(W - margin, H - margin - length), (W - margin, H - margin)], fill=color, width=2)


def add_brand_watermark(draw, handle="@dsmarketing.agency"):
    """Add small brand text at bottom."""
    font = ImageFont.truetype(LIBSANS_REG, 18)
    bbox = draw.textbbox((0, 0), handle, font=font)
    tw = bbox[2] - bbox[0]
    draw.text(((W - tw) // 2, H - 55), handle, font=font, fill=(100, 100, 100))


def add_slide_number(draw, current, total):
    """Add slide number indicator."""
    font = ImageFont.truetype(LIBSANS_REG, 20)
    text = f"{current} / {total}"
    bbox = draw.textbbox((0, 0), text, font=font)
    tw = bbox[2] - bbox[0]
    draw.text((W - 80 - tw // 2, H - 55), text, font=font, fill=(80, 80, 80))


# ─── SLIDE TEMPLATES ───

def make_hook_slide(hook_line1, hook_line2, output_path, accent=(15, 25, 55)):
    """Template: Hook slide with dramatic centered text."""
    img = make_gradient_bg(accent_color=accent, spotlight_y=0.4, intensity=0.5)
    img = add_noise(img, 6)
    img = add_vignette(img, 0.7)
    draw = ImageDraw.Draw(img)
    draw_corner_accents(draw, color=(50, 50, 50))

    # Small "DS MARKETING" at top
    top_font = ImageFont.truetype(LIBSANS, 16)
    centered_text(draw, 60, "D S   M A R K E T I N G", top_font, fill=(90, 90, 90))

    # Thin line below brand
    draw_thin_line(draw, 90, margin=420, color=(60, 60, 60))

    # Main hook text
    hook_font = ImageFont.truetype(BEBAS, 82)
    lines = wrap_text(hook_line1, hook_font, W - 160, draw)
    total_h = len(lines) * 90
    start_y = 320 - total_h // 2
    for i, line in enumerate(lines):
        centered_text(draw, start_y + i * 90, line, hook_font, fill=(255, 255, 255))

    # Second line (if exists)
    if hook_line2:
        hook_font2 = ImageFont.truetype(BEBAS, 82)
        lines2 = wrap_text(hook_line2, hook_font2, W - 160, draw)
        start_y2 = start_y + len(lines) * 90 + 20
        for i, line in enumerate(lines2):
            centered_text(draw, start_y2 + i * 90, line, hook_font2, fill=(200, 200, 200))

    # Bottom thin line
    draw_thin_line(draw, H - 160, margin=350, color=(60, 60, 60))

    # Swipe prompt
    small_font = ImageFont.truetype(LIBSANS_REG, 18)
    centered_text(draw, H - 130, "SWIPE TO LEARN MORE  →", small_font, fill=(120, 120, 120))

    add_brand_watermark(draw)
    img.save(output_path, quality=95)
    print(f"  ✓ {output_path}")


def make_numbered_slide(number, title, subtitle, slide_num, total, output_path,
                         bg_white=False, accent=(20, 30, 55)):
    """Template: Numbered content slide."""
    if bg_white:
        img = Image.new("RGB", (W, H), (245, 245, 245))
        txt_color = (10, 10, 10)
        sub_color = (80, 80, 80)
        num_color = (30, 30, 30)
        line_color = (200, 200, 200)
        corner_color = (210, 210, 210)
        brand_color = (160, 160, 160)
        sn_color = (180, 180, 180)
    else:
        img = make_gradient_bg(accent_color=accent, spotlight_x=0.3, spotlight_y=0.3, intensity=0.3)
        img = add_noise(img, 5)
        img = add_vignette(img, 0.6)
        txt_color = (255, 255, 255)
        sub_color = (160, 160, 160)
        num_color = (255, 255, 255)
        line_color = (60, 60, 60)
        corner_color = (50, 50, 50)
        brand_color = (100, 100, 100)
        sn_color = (80, 80, 80)

    draw = ImageDraw.Draw(img)
    draw_corner_accents(draw, color=corner_color)

    # Large number
    num_font = ImageFont.truetype(BEBAS, 180)
    num_str = f"{number:02d}"
    draw.text((90, 140), num_str, font=num_font, fill=num_color)

    # Thin vertical line next to number
    num_bbox = draw.textbbox((90, 140), num_str, font=num_font)
    line_x = num_bbox[2] + 30
    draw.line([(line_x, 180), (line_x, 360)], fill=line_color, width=2)

    # Title
    title_font = ImageFont.truetype(BEBAS, 52)
    title_lines = wrap_text(title, title_font, W - line_x - 80, draw)
    for i, line in enumerate(title_lines):
        draw.text((line_x + 30, 200 + i * 60), line, font=title_font, fill=txt_color)

    # Horizontal divider
    draw_thin_line(draw, 440, margin=90, color=line_color)

    # Subtitle / explanation
    sub_font = ImageFont.truetype(LIBSANS, 30)
    sub_lines = wrap_text(subtitle, sub_font, W - 200, draw)
    for i, line in enumerate(sub_lines):
        draw.text((100, 490 + i * 48), line, font=sub_font, fill=sub_color)

    # Slide number
    sn_font = ImageFont.truetype(LIBSANS_REG, 20)
    sn_text = f"{slide_num} / {total}"
    sn_bbox = draw.textbbox((0, 0), sn_text, font=sn_font)
    draw.text((W - 90 - (sn_bbox[2] - sn_bbox[0]) // 2, H - 55), sn_text, font=sn_font, fill=sn_color)

    add_brand_watermark(draw)
    img.save(output_path, quality=95)
    print(f"  ✓ {output_path}")


def make_recap_slide(title, points, slide_num, total, output_path, accent=(20, 20, 50)):
    """Template: Summary/recap slide."""
    img = make_gradient_bg(accent_color=accent, spotlight_y=0.3, intensity=0.35)
    img = add_noise(img, 5)
    img = add_vignette(img, 0.6)
    draw = ImageDraw.Draw(img)
    draw_corner_accents(draw, color=(50, 50, 50))

    # Title
    title_font = ImageFont.truetype(BEBAS, 60)
    centered_text(draw, 100, title, title_font, fill=(255, 255, 255))

    # Thin line
    draw_thin_line(draw, 175, margin=300, color=(80, 80, 80))

    # Points
    point_font = ImageFont.truetype(LIBSANS, 28)
    check_font = ImageFont.truetype(LIBSANS, 28)
    y = 220
    for i, point in enumerate(points):
        # Bullet marker
        draw.text((120, y), "—", font=check_font, fill=(100, 100, 100))
        draw.text((170, y), point, font=point_font, fill=(220, 220, 220))
        y += 52

    # Slide number
    add_slide_number(draw, slide_num, total)
    add_brand_watermark(draw)
    img.save(output_path, quality=95)
    print(f"  ✓ {output_path}")


def make_cta_slide(cta_text, output_path, accent=(25, 20, 50)):
    """Template: Call-to-action final slide."""
    img = make_gradient_bg(accent_color=accent, spotlight_y=0.45, intensity=0.5)
    img = add_noise(img, 5)
    img = add_vignette(img, 0.7)
    draw = ImageDraw.Draw(img)
    draw_corner_accents(draw, color=(50, 50, 50))

    # DS MARKETING large brand
    brand_font = ImageFont.truetype(BEBAS, 100)
    centered_text(draw, 300, "DS", brand_font, fill=(255, 255, 255))
    brand_font2 = ImageFont.truetype(BEBAS, 50)
    centered_text(draw, 400, "MARKETING", brand_font2, fill=(200, 200, 200))

    # Thin line
    draw_thin_line(draw, 475, margin=350, color=(80, 80, 80))

    # CTA text
    cta_font = ImageFont.truetype(BEBAS, 42)
    centered_text(draw, 510, cta_text, cta_font, fill=(255, 255, 255))

    # Handle
    handle_font = ImageFont.truetype(LIBSANS_REG, 24)
    centered_text(draw, 580, "@dsmarketing.agency", handle_font, fill=(130, 130, 130))

    # Bottom extras
    small_font = ImageFont.truetype(LIBSANS_REG, 16)
    centered_text(draw, 650, "dsmarketing.lovable.app", small_font, fill=(80, 80, 80))

    add_brand_watermark(draw)
    img.save(output_path, quality=95)
    print(f"  ✓ {output_path}")


# ═══════════════════════════════════════════
# MONDAY: "7 Social Media Mistakes"
# ═══════════════════════════════════════════
print("\n▸ MONDAY CAROUSEL: 7 Social Media Mistakes")
print("─" * 45)

make_hook_slide(
    "YOUR SOCIAL MEDIA",
    "ISN'T FAILING. YOUR STRATEGY IS.",
    f"{OUT_MON}/slide_01_hook.png",
    accent=(15, 20, 55),
)

mistakes = [
    ("Posting without a content plan", "Random posts = random results. A plan turns chaos into consistency."),
    ("Ignoring your analytics completely", "The data tells you exactly what works. Stop guessing, start reading."),
    ("Buying followers for vanity metrics", "10K fake followers won't buy your product. Ever. Focus on real engagement."),
    ("No consistent brand voice", "If your audience can't recognize your content, you don't have a brand."),
    ("Treating every platform the same", "What works on Instagram doesn't work on LinkedIn. Adapt or get ignored."),
    ("Zero engagement with your audience", "Posting and disappearing tells the algorithm you don't care."),
    ("No strategy after hitting post", "Publishing is 20% of the work. Distribution is the other 80%."),
]

for i, (title, sub) in enumerate(mistakes):
    make_numbered_slide(
        number=i + 1,
        title=title,
        subtitle=sub,
        slide_num=i + 2,
        total=10,
        output_path=f"{OUT_MON}/slide_{i+2:02d}.png",
        bg_white=(i % 2 == 0),  # Alternate black/white
        accent=[(20, 25, 55), (25, 15, 45), (15, 30, 50), (30, 20, 50)][i % 4],
    )

make_recap_slide(
    "QUICK RECAP",
    [
        "No content plan",
        "Ignoring analytics",
        "Buying fake followers",
        "Inconsistent brand voice",
        "Same content everywhere",
        "Not engaging with audience",
        "No post-publish strategy",
    ],
    9, 10,
    f"{OUT_MON}/slide_09_recap.png",
)

make_cta_slide(
    "FOLLOW FOR MORE",
    f"{OUT_MON}/slide_10_cta.png",
)


# ═══════════════════════════════════════════
# WEDNESDAY: "The Perfect Content Calendar"
# ═══════════════════════════════════════════
print("\n▸ WEDNESDAY CAROUSEL: The Perfect Content Calendar")
print("─" * 45)

make_hook_slide(
    "STOP POSTING RANDOMLY.",
    "START POSTING STRATEGICALLY.",
    f"{OUT_WED}/slide_01_hook.png",
    accent=(20, 15, 50),
)

days = [
    ("Monday: Educational content", "Tips, how-tos, frameworks. Start the week proving your expertise."),
    ("Tuesday: Industry insights", "Share trends and data. Be the one who sees what's coming."),
    ("Wednesday: Case study or client win", "Show proof. Real numbers, real results. Nothing builds trust faster."),
    ("Thursday: Behind the scenes", "Show your process, your team. People buy from people they trust."),
    ("Friday: Engagement post", "Ask questions. Run polls. Start debates. Let your audience talk."),
    ("Weekend: Brand story content", "Your mission. Your values. Build connection, not just reach."),
    ("The secret: Batch everything Monday", "Create the full week in one sitting. Then focus on engaging."),
]

for i, (title, sub) in enumerate(days):
    make_numbered_slide(
        number=i + 1,
        title=title,
        subtitle=sub,
        slide_num=i + 2,
        total=10,
        output_path=f"{OUT_WED}/slide_{i+2:02d}.png",
        bg_white=(i % 2 == 1),
        accent=[(15, 25, 50), (25, 20, 55), (20, 30, 45), (30, 15, 55)][i % 4],
    )

make_recap_slide(
    "YOUR WEEKLY FRAMEWORK",
    [
        "MON — Educate",
        "TUE — Industry insights",
        "WED — Case studies",
        "THU — Behind the scenes",
        "FRI — Engage",
        "SAT/SUN — Brand story",
        "SECRET — Batch on Monday",
    ],
    9, 10,
    f"{OUT_WED}/slide_09_recap.png",
)

make_cta_slide(
    "SAVE THIS FRAMEWORK",
    f"{OUT_WED}/slide_10_cta.png",
)


# ═══════════════════════════════════════════
# FRIDAY: "The 3-Second Rule"
# ═══════════════════════════════════════════
print("\n▸ FRIDAY MINI CAROUSEL: The 3-Second Rule")
print("─" * 45)

make_hook_slide(
    "YOU HAVE 3 SECONDS.",
    "",
    f"{OUT_FRI}/slide_01_hook.png",
    accent=(30, 20, 45),
)

# Content slide (special - longer text)
img = make_gradient_bg(accent_color=(20, 25, 50), spotlight_y=0.35, intensity=0.35)
img = add_noise(img, 5)
img = add_vignette(img, 0.6)
draw = ImageDraw.Draw(img)
draw_corner_accents(draw, color=(50, 50, 50))

title_font = ImageFont.truetype(BEBAS, 48)
centered_text(draw, 140, "THE 3-SECOND RULE", title_font, fill=(255, 255, 255))
draw_thin_line(draw, 205, margin=300, color=(70, 70, 70))

body_font = ImageFont.truetype(LIBSANS, 30)
body_lines = [
    "Your audience decides in 3 seconds",
    "whether to stop scrolling",
    "or keep going.",
    "",
    "That means your hook is everything.",
    "",
    "Not your logo.",
    "Not your color palette.",
    "Your first line.",
    "",
    "That's where the battle",
    "is won or lost.",
]
y = 250
for line in body_lines:
    if line == "":
        y += 20
        continue
    centered_text(draw, y, line, body_font, fill=(200, 200, 200))
    y += 46

add_slide_number(draw, 2, 3)
add_brand_watermark(draw)
img.save(f"{OUT_FRI}/slide_02.png", quality=95)
print(f"  ✓ {OUT_FRI}/slide_02.png")

make_cta_slide(
    "MAKE EVERY HOOK IMPOSSIBLE TO IGNORE",
    f"{OUT_FRI}/slide_03_cta.png",
)

print("\n" + "═" * 45)
print("DONE! All 23 slides generated.")
print("═" * 45)
