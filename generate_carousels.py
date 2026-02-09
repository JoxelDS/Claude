"""
DS Marketing - Carousel Image Generator
Generates Instagram-ready 1080x1080 carousel slides
using the DS Marketing black & white brand aesthetic.
"""

from PIL import Image, ImageDraw, ImageFont
import os
import textwrap

# Paths
FONT_DIR = "/home/user/Claude/fonts"
OUTPUT_DIR = "/home/user/Claude/images"

# Fonts
BEBAS = os.path.join(FONT_DIR, "BebasNeue-Regular.ttf")
MONT_BOLD = "/usr/share/fonts/truetype/liberation/LiberationSans-Bold.ttf"
MONT_REG = "/usr/share/fonts/truetype/liberation/LiberationSans-Regular.ttf"
MONT_LIGHT = "/usr/share/fonts/truetype/liberation/LiberationSans-Regular.ttf"

# Canvas
W, H = 1080, 1080
BLACK = (0, 0, 0)
WHITE = (255, 255, 255)
DARK_GRAY = (26, 26, 26)
MED_GRAY = (128, 128, 128)
LIGHT_GRAY = (245, 245, 245)

# Margins
MARGIN_X = 108  # 10% of 1080
MARGIN_Y = 86   # 8% of 1080


def font(path, size):
    return ImageFont.truetype(path, size)


def text_bbox_size(draw, text, fnt):
    bbox = draw.textbbox((0, 0), text, font=fnt)
    return bbox[2] - bbox[0], bbox[3] - bbox[1]


def draw_centered_text(draw, text, y, fnt, fill):
    """Draw text centered horizontally at given y."""
    tw, th = text_bbox_size(draw, text, fnt)
    x = (W - tw) // 2
    draw.text((x, y), text, font=fnt, fill=fill)
    return th


def draw_wrapped_centered(draw, text, y, fnt, fill, max_width):
    """Draw multiline text centered."""
    lines = text.split("\n")
    total_h = 0
    for line in lines:
        tw, th = text_bbox_size(draw, line, fnt)
        x = (W - tw) // 2
        draw.text((x, y + total_h), line, font=fnt, fill=fill)
        total_h += th + 16
    return total_h


def draw_left_text(draw, text, x, y, fnt, fill, line_spacing=16):
    """Draw multiline text left-aligned."""
    lines = text.split("\n")
    total_h = 0
    for line in lines:
        draw.text((x, y + total_h), line, font=fnt, fill=fill)
        _, th = text_bbox_size(draw, line, fnt)
        total_h += th + line_spacing
    return total_h


def wrap_text(text, fnt, max_width, draw):
    """Word-wrap text to fit within max_width pixels."""
    words = text.split()
    lines = []
    current = ""
    for word in words:
        test = f"{current} {word}".strip()
        tw, _ = text_bbox_size(draw, test, fnt)
        if tw <= max_width:
            current = test
        else:
            if current:
                lines.append(current)
            current = word
    if current:
        lines.append(current)
    return "\n".join(lines)


def draw_logo_text(draw, x, y, size=28):
    """Draw a simple 'DS MARKETING' text logo."""
    ds_font = font(BEBAS, size + 10)
    mkt_font = font(MONT_REG, max(12, int(size * 0.45)))
    draw.text((x, y), "DS", font=ds_font, fill=WHITE)
    ds_w, _ = text_bbox_size(draw, "DS", ds_font)
    draw.text((x, y + size + 6), "MARKETING", font=mkt_font, fill=WHITE)


def draw_logo_text_centered(draw, y, size=60):
    """Draw centered DS MARKETING logo text."""
    ds_font = font(BEBAS, size + 20)
    mkt_font = font(MONT_REG, int(size * 0.5))
    ds_w, ds_h = text_bbox_size(draw, "DS", ds_font)
    mkt_w, mkt_h = text_bbox_size(draw, "MARKETING", mkt_font)
    draw.text(((W - ds_w) // 2, y), "DS", font=ds_font, fill=WHITE)
    draw.text(((W - mkt_w) // 2, y + ds_h + 8), "MARKETING", font=mkt_font, fill=WHITE)
    return ds_h + mkt_h + 8


# ─── SLIDE TEMPLATES ─────────────────────────────────────────

def make_hook_slide(hook_text, output_path):
    """Template 1: Bold statement hook slide (black bg, white text)."""
    img = Image.new("RGB", (W, H), BLACK)
    draw = ImageDraw.Draw(img)

    # Determine font size based on text length
    if len(hook_text) < 40:
        fsize = 120
    elif len(hook_text) < 60:
        fsize = 100
    elif len(hook_text) < 100:
        fsize = 85
    else:
        fsize = 70

    fnt = font(BEBAS, fsize)
    wrapped = wrap_text(hook_text.upper(), fnt, W - MARGIN_X * 2, draw)
    lines = wrapped.split("\n")

    # Calculate total height
    total_h = 0
    for line in lines:
        _, th = text_bbox_size(draw, line, fnt)
        total_h += th + 20
    total_h -= 20

    y_start = (H - total_h) // 2 - 30
    for line in lines:
        tw, th = text_bbox_size(draw, line, fnt)
        x = (W - tw) // 2
        draw.text((x, y_start), line, font=fnt, fill=WHITE)
        y_start += th + 20

    # Logo bottom right
    draw_logo_text(draw, W - 200, H - 80, size=24)

    img.save(output_path, quality=95)
    print(f"  Created: {output_path}")


def make_numbered_white(number, main_text, support_text, slide_num, total, output_path):
    """Template 2: Numbered point on white background."""
    img = Image.new("RGB", (W, H), WHITE)
    draw = ImageDraw.Draw(img)

    # Large number
    num_font = font(BEBAS, 140)
    num_str = f"{number:02d}"
    draw.text((MARGIN_X, MARGIN_Y), num_str, font=num_font, fill=BLACK)

    # Main text
    main_font = font(MONT_BOLD, 54)
    wrapped_main = wrap_text(main_text, main_font, W - MARGIN_X * 2, draw)
    draw_left_text(draw, wrapped_main, MARGIN_X, 260, main_font, BLACK, line_spacing=20)

    # Support text
    if support_text:
        sup_font = font(MONT_REG, 36)
        wrapped_sup = wrap_text(support_text, sup_font, W - MARGIN_X * 2, draw)
        # Calculate where main text ends
        main_lines = wrapped_main.split("\n")
        main_h = len(main_lines) * 74
        draw_left_text(draw, wrapped_sup, MARGIN_X, 260 + main_h + 30, sup_font, DARK_GRAY, line_spacing=16)

    # Slide number
    sn_font = font(MONT_LIGHT, 28)
    sn_text = f"{slide_num}/{total}"
    sn_w, _ = text_bbox_size(draw, sn_text, sn_font)
    draw.text((W - MARGIN_X - sn_w + 40, H - MARGIN_Y - 10), sn_text, font=sn_font, fill=MED_GRAY)

    img.save(output_path, quality=95)
    print(f"  Created: {output_path}")


def make_numbered_black(number, main_text, support_text, slide_num, total, output_path):
    """Template 3: Numbered point on black background (inverted)."""
    img = Image.new("RGB", (W, H), BLACK)
    draw = ImageDraw.Draw(img)

    # Large number
    num_font = font(BEBAS, 140)
    num_str = f"{number:02d}"
    draw.text((MARGIN_X, MARGIN_Y), num_str, font=num_font, fill=WHITE)

    # Main text
    main_font = font(MONT_BOLD, 54)
    wrapped_main = wrap_text(main_text, main_font, W - MARGIN_X * 2, draw)
    draw_left_text(draw, wrapped_main, MARGIN_X, 260, main_font, WHITE, line_spacing=20)

    # Support text
    if support_text:
        sup_font = font(MONT_REG, 36)
        wrapped_sup = wrap_text(support_text, sup_font, W - MARGIN_X * 2, draw)
        main_lines = wrapped_main.split("\n")
        main_h = len(main_lines) * 74
        draw_left_text(draw, wrapped_sup, MARGIN_X, 260 + main_h + 30, sup_font, MED_GRAY, line_spacing=16)

    # Slide number
    sn_font = font(MONT_LIGHT, 28)
    sn_text = f"{slide_num}/{total}"
    sn_w, _ = text_bbox_size(draw, sn_text, sn_font)
    draw.text((W - MARGIN_X - sn_w + 40, H - MARGIN_Y - 10), sn_text, font=sn_font, fill=WHITE)

    img.save(output_path, quality=95)
    print(f"  Created: {output_path}")


def make_summary_slide(title, points, slide_num, total, output_path):
    """Template 4: Summary/recap slide (light gray bg)."""
    img = Image.new("RGB", (W, H), LIGHT_GRAY)
    draw = ImageDraw.Draw(img)

    # Header
    title_font = font(BEBAS, 80)
    tw, th = text_bbox_size(draw, title.upper(), title_font)
    draw.text((MARGIN_X, MARGIN_Y + 20), title.upper(), font=title_font, fill=BLACK)

    # Thin line under header
    line_y = MARGIN_Y + 20 + th + 20
    draw.line([(MARGIN_X, line_y), (MARGIN_X + 300, line_y)], fill=BLACK, width=3)

    # Points
    pt_font = font(MONT_REG, 40)
    y = line_y + 40
    for pt in points:
        text = f"\u2192  {pt}"
        wrapped = wrap_text(text, pt_font, W - MARGIN_X * 2, draw)
        h = draw_left_text(draw, wrapped, MARGIN_X, y, pt_font, BLACK, line_spacing=12)
        y += h + 20

    # Slide number
    sn_font = font(MONT_LIGHT, 28)
    sn_text = f"{slide_num}/{total}"
    sn_w, _ = text_bbox_size(draw, sn_text, sn_font)
    draw.text((W - MARGIN_X - sn_w + 40, H - MARGIN_Y - 10), sn_text, font=sn_font, fill=MED_GRAY)

    img.save(output_path, quality=95)
    print(f"  Created: {output_path}")


def make_cta_slide(cta_text, handle, output_path):
    """Template 5: CTA slide (black bg, centered logo + CTA)."""
    img = Image.new("RGB", (W, H), BLACK)
    draw = ImageDraw.Draw(img)

    # Logo centered
    logo_h = draw_logo_text_centered(draw, 280, size=80)

    # Thin line
    line_y = 280 + logo_h + 60
    draw.line([(W // 2 - 100, line_y), (W // 2 + 100, line_y)], fill=WHITE, width=2)

    # CTA text
    cta_font = font(BEBAS, 80)
    cta_y = line_y + 50
    tw, th = text_bbox_size(draw, cta_text.upper(), cta_font)
    draw.text(((W - tw) // 2, cta_y), cta_text.upper(), font=cta_font, fill=WHITE)

    # Handle
    handle_font = font(MONT_REG, 40)
    hw, _ = text_bbox_size(draw, handle, handle_font)
    draw.text(((W - hw) // 2, cta_y + th + 30), handle, font=handle_font, fill=MED_GRAY)

    img.save(output_path, quality=95)
    print(f"  Created: {output_path}")


# ─── MONDAY CAROUSEL ─────────────────────────────────────────

def generate_monday():
    """7 Social Media Mistakes Killing Your Growth"""
    out = os.path.join(OUTPUT_DIR, "monday")
    os.makedirs(out, exist_ok=True)
    total = 10

    print("\n=== MONDAY: 7 Social Media Mistakes ===")

    make_hook_slide(
        "YOUR SOCIAL MEDIA ISN'T FAILING. YOUR STRATEGY IS.",
        os.path.join(out, "slide_01_hook.png"),
    )

    slides = [
        (1, "Posting without a content plan",
         "Random posts = random results. Strategy-first brands win every time."),
        (2, "Ignoring your analytics completely",
         "The data tells you exactly what works. Most brands never bother to check."),
        (3, "Buying followers for vanity metrics",
         "10K fake followers won't buy your product. Ever."),
        (4, "No consistent brand voice",
         "If your audience can't recognize your content instantly, you don't have a brand."),
        (5, "Treating every platform the same",
         "What works on Instagram doesn't work on LinkedIn. Adapt or get ignored."),
        (6, "Zero engagement with your audience",
         "Posting and disappearing tells the algorithm you don't care. It responds accordingly."),
        (7, "No strategy after hitting post",
         "Publishing is 20% of the work. Distribution and engagement is the other 80%."),
    ]

    for i, (num, main, support) in enumerate(slides):
        slide_num = i + 2
        if slide_num % 2 == 0:
            make_numbered_white(num, main, support, slide_num, total,
                                os.path.join(out, f"slide_{slide_num:02d}.png"))
        else:
            make_numbered_black(num, main, support, slide_num, total,
                                os.path.join(out, f"slide_{slide_num:02d}.png"))

    make_summary_slide("QUICK RECAP", [
        "No content plan",
        "Ignoring analytics",
        "Buying fake followers",
        "Inconsistent brand voice",
        "Same content everywhere",
        "Not engaging with audience",
        "No post-publish strategy",
    ], 9, total, os.path.join(out, "slide_09_recap.png"))

    make_cta_slide("FOLLOW FOR MORE", "@dsmarketing.agency",
                   os.path.join(out, "slide_10_cta.png"))


# ─── WEDNESDAY CAROUSEL ───────────────────────────────────────

def generate_wednesday():
    """The Perfect Social Media Content Calendar"""
    out = os.path.join(OUTPUT_DIR, "wednesday")
    os.makedirs(out, exist_ok=True)
    total = 10

    print("\n=== WEDNESDAY: Perfect Content Calendar ===")

    make_hook_slide(
        "STOP POSTING RANDOMLY. START POSTING STRATEGICALLY.",
        os.path.join(out, "slide_01_hook.png"),
    )

    slides = [
        (1, "Monday: Educational content",
         "Tips, how-tos, frameworks. Start the week by proving your expertise."),
        (2, "Tuesday: Industry insights",
         "Share news, trends, or data. Position yourself as the one who sees what's coming."),
        (3, "Wednesday: Case study or client win",
         "Show proof. Real numbers. Real results. Nothing builds trust faster."),
        (4, "Thursday: Behind the scenes",
         "Show your process, your team, your tools. People buy from people they trust."),
        (5, "Friday: Engagement post",
         "Ask questions. Run polls. Start debates. Let your audience do the talking."),
        (6, "Weekend: Brand story content",
         "Your mission. Your values. Your journey. Build connection, not just reach."),
        (7, "The secret: Batch everything on Monday",
         "Create the full week in one sitting. Schedule it. Then focus on engaging all week."),
    ]

    for i, (num, main, support) in enumerate(slides):
        slide_num = i + 2
        if slide_num % 2 == 0:
            make_numbered_white(num, main, support, slide_num, total,
                                os.path.join(out, f"slide_{slide_num:02d}.png"))
        else:
            make_numbered_black(num, main, support, slide_num, total,
                                os.path.join(out, f"slide_{slide_num:02d}.png"))

    make_summary_slide("YOUR WEEKLY FRAMEWORK", [
        "MON \u2014 Educate",
        "TUE \u2014 Industry insights",
        "WED \u2014 Case studies",
        "THU \u2014 Behind the scenes",
        "FRI \u2014 Engage",
        "SAT/SUN \u2014 Brand story",
    ], 9, total, os.path.join(out, "slide_09_recap.png"))

    make_cta_slide("SAVE THIS FRAMEWORK", "@dsmarketing.agency",
                   os.path.join(out, "slide_10_cta.png"))


# ─── FRIDAY CAROUSEL ──────────────────────────────────────────

def generate_friday():
    """The 3-Second Rule - Mini Carousel"""
    out = os.path.join(OUTPUT_DIR, "friday")
    os.makedirs(out, exist_ok=True)

    print("\n=== FRIDAY: The 3-Second Rule ===")

    make_hook_slide(
        "YOU HAVE 3 SECONDS.",
        os.path.join(out, "slide_01_hook.png"),
    )

    # Custom slide 2 - white bg with longer text
    img = Image.new("RGB", (W, H), WHITE)
    draw = ImageDraw.Draw(img)

    title_font = font(MONT_BOLD, 48)
    body_font = font(MONT_REG, 38)

    title = "Your audience decides in 3 seconds whether to stop scrolling or keep going."
    wrapped_title = wrap_text(title, title_font, W - MARGIN_X * 2, draw)
    h = draw_left_text(draw, wrapped_title, MARGIN_X, MARGIN_Y + 40, title_font, BLACK, line_spacing=16)

    body_lines = [
        "That means your hook is everything.",
        "",
        "Not your logo.",
        "Not your color palette.",
        "Not your perfectly curated feed.",
        "",
        "Your first line. Your first slide.",
        "That's where the battle is",
        "won or lost.",
    ]
    body_text = "\n".join(body_lines)
    y_start = MARGIN_Y + 40 + h + 50
    draw_left_text(draw, body_text, MARGIN_X, y_start, body_font, DARK_GRAY, line_spacing=14)

    sn_font = font(MONT_LIGHT, 28)
    sn_w, _ = text_bbox_size(draw, "2/3", sn_font)
    draw.text((W - MARGIN_X - sn_w + 40, H - MARGIN_Y - 10), "2/3", font=sn_font, fill=MED_GRAY)

    img.save(os.path.join(out, "slide_02.png"), quality=95)
    print(f"  Created: {os.path.join(out, 'slide_02.png')}")

    make_cta_slide("MAKE EVERY HOOK IMPOSSIBLE TO IGNORE", "@dsmarketing.agency",
                   os.path.join(out, "slide_03_cta.png"))


# ─── MAIN ─────────────────────────────────────────────────────

if __name__ == "__main__":
    os.makedirs(OUTPUT_DIR, exist_ok=True)
    generate_monday()
    generate_wednesday()
    generate_friday()
    print(f"\nDone! All images saved to {OUTPUT_DIR}/")
    print(f"  monday/    - 10 slides")
    print(f"  wednesday/ - 10 slides")
    print(f"  friday/    - 3 slides")
