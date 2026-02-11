#!/usr/bin/env python3
"""
DS MARKETING x ROMAN KNOX CAROUSEL ENGINE v1.0
═══════════════════════════════════════════════════
Premium Instagram carousels inspired by Roman Knox, CashFish, and Dark Gradients.

STYLE:
  - Cover: Dark AI-generated scene, massive bold text, brand glow
  - Content: Professional layouts, 3D AI objects, numbered sections
  - Quote: Elegant typography with styled quotation marks
  - CTA: Brand logo pulse, handle, follow CTA

POWERED BY:
  - Ollama (local AI) for content generation
  - Pollinations.ai for AI background scenes & 3D objects
  - Pillow for professional compositing

Run: python3 ds_knox.py
"""

import os, sys, subprocess, json, math, random, time, textwrap
import urllib.request, urllib.parse

def ensure(pkg, pip_name=None):
    try: __import__(pkg)
    except ImportError:
        print(f"  Installing {pip_name or pkg}...")
        subprocess.check_call([sys.executable, "-m", "pip", "install", pip_name or pkg],
                              stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)

ensure("PIL", "Pillow")
ensure("requests")
ensure("numpy")

from PIL import Image, ImageDraw, ImageFont, ImageFilter, ImageEnhance, ImageStat
import numpy as np
import requests


# ══════════════════════════════════════════════
# CONFIG
# ══════════════════════════════════════════════
W, H = 1080, 1350  # Instagram recommended carousel (4:5)
OUT = "ds-marketing-knox"
OLLAMA_URL = "http://localhost:11434"
PREFERRED_MODELS = ["mistral", "llama3.2", "llama3.1", "gemma2", "phi3"]

# Brand — Black & White
BLACK = (0, 0, 0)
WHITE = (255, 255, 255)
OFF_WHITE = (240, 240, 240)
LIGHT_GRAY = (190, 190, 190)
MED_GRAY = (120, 120, 120)
DARK_GRAY = (30, 30, 30)
NEAR_BLACK = (12, 12, 12)
BRAND_HANDLE = "@dsmarketing.agency"
BRAND_SITE = "dsmarketing.lovable.app"

# AI generation
GEN_SIZE = 1536
ATTEMPTS = 3


# ══════════════════════════════════════════════
# FONTS — Premium Typography
# ══════════════════════════════════════════════
_fc = {}
def _f(paths, sz):
    key = (tuple(paths), sz)
    if key not in _fc:
        for p in paths:
            if os.path.exists(p):
                try:
                    _fc[key] = ImageFont.truetype(p, sz)
                    return _fc[key]
                except: pass
        _fc[key] = ImageFont.load_default()
    return _fc[key]

def TITLE(sz):
    """Extra bold display font for headlines."""
    return _f([
        "/System/Library/Fonts/Supplemental/Impact.ttf",
        "/Library/Fonts/Impact.ttf",
        "BebasNeue-Regular.ttf",
        "/usr/share/fonts/truetype/liberation/LiberationSans-Bold.ttf",
    ], sz)

def BOLD(sz):
    """Bold sans-serif for subheads and body bold."""
    return _f([
        "/System/Library/Fonts/Supplemental/Arial Bold.ttf",
        "/Library/Fonts/Arial Bold.ttf",
        "/System/Library/Fonts/Helvetica-Bold.otf",
        "/usr/share/fonts/truetype/liberation/LiberationSans-Bold.ttf",
    ], sz)

def REGULAR(sz):
    """Regular weight for body text."""
    return _f([
        "/System/Library/Fonts/Supplemental/Arial.ttf",
        "/Library/Fonts/Arial.ttf",
        "/System/Library/Fonts/Helvetica.ttc",
        "/usr/share/fonts/truetype/liberation/LiberationSans-Regular.ttf",
    ], sz)

def ITALIC(sz):
    """Italic for quotes."""
    return _f([
        "/System/Library/Fonts/Supplemental/Arial Italic.ttf",
        "/Library/Fonts/Arial Italic.ttf",
        "/System/Library/Fonts/Supplemental/Times New Roman Italic.ttf",
        "/usr/share/fonts/truetype/liberation/LiberationSans-Italic.ttf",
    ], sz)


# ══════════════════════════════════════════════
# OLLAMA — Local AI Connection
# ══════════════════════════════════════════════
def check_ollama():
    try:
        r = requests.get(OLLAMA_URL, timeout=5)
        return r.status_code == 200
    except:
        return False

def list_models():
    try:
        r = requests.get(f"{OLLAMA_URL}/api/tags", timeout=10)
        return [m["name"] for m in r.json().get("models", [])]
    except:
        return []

def pull_model(name):
    print(f"    Downloading {name}...")
    try:
        r = requests.post(f"{OLLAMA_URL}/api/pull",
                          json={"model": name, "stream": True},
                          stream=True, timeout=600)
        for line in r.iter_lines():
            if line:
                data = json.loads(line)
                status = data.get("status", "")
                total = data.get("total", 0)
                completed = data.get("completed", 0)
                if total > 0:
                    print(f"      [{int(completed/total*100)}%] {status}", end="\r", flush=True)
        print(f"    Model {name} ready.")
        return True
    except:
        return False

def find_model():
    available = list_models()
    for model in PREFERRED_MODELS:
        for avail in available:
            if model in avail:
                return avail
    if pull_model("mistral"):
        return "mistral"
    return available[0] if available else None

def ask_ai(prompt, model, system=None, temp=0.7):
    messages = []
    if system:
        messages.append({"role": "system", "content": system})
    messages.append({"role": "user", "content": prompt})
    try:
        r = requests.post(f"{OLLAMA_URL}/api/chat", json={
            "model": model, "messages": messages,
            "stream": False, "options": {"temperature": temp}
        }, timeout=120)
        return r.json()["message"]["content"]
    except:
        return None

def ask_ai_json(prompt, model, system=None):
    messages = []
    if system:
        messages.append({"role": "system", "content": system})
    messages.append({"role": "user", "content": prompt})
    try:
        r = requests.post(f"{OLLAMA_URL}/api/chat", json={
            "model": model, "messages": messages,
            "stream": False, "options": {"temperature": 0.6}
        }, timeout=120)
        content = r.json()["message"]["content"].strip()
        if content.startswith("```"):
            lines = content.split("\n")
            lines = [l for l in lines if not l.strip().startswith("```")]
            content = "\n".join(lines)
        return json.loads(content)
    except json.JSONDecodeError:
        try:
            start = content.index("[")
            end = content.rindex("]") + 1
            return json.loads(content[start:end])
        except:
            try:
                start = content.index("{")
                end = content.rindex("}") + 1
                return json.loads(content[start:end])
            except:
                return None
    except:
        return None


AI_SYSTEM = """You are the creative director for DS Marketing, a premium social media marketing agency.
Target audience: small business owners and entrepreneurs.
Brand voice: confident, direct, authoritative, no fluff, educational.
Visual identity: black and white ONLY.
Instagram: @dsmarketing.agency

You write content that STOPS the scroll and DELIVERS real value.
Every piece must hook in 3 words, teach something real, and end with a CTA."""


# ══════════════════════════════════════════════
# AI IMAGE GENERATION — Pollinations
# ══════════════════════════════════════════════
def score_img(img):
    try:
        stat = ImageStat.Stat(img.convert("L"))
        b = stat.mean[0] / 255.0
        c = stat.stddev[0] / 128.0
        edges = img.convert("L").filter(ImageFilter.FIND_EDGES)
        s = ImageStat.Stat(edges).mean[0] / 128.0
        return b * 2.0 + c * 1.5 + s * 1.0
    except:
        return 0

def generate_ai_image(prompt, out_path, width=GEN_SIZE, height=GEN_SIZE, attempts=ATTEMPTS):
    """Generate AI image with multi-seed quality selection."""
    if os.path.exists(out_path) and os.path.getsize(out_path) > 5000:
        return Image.open(out_path).convert("RGB")

    best_img = None
    best_score = -1

    for i in range(attempts):
        seed = random.randint(1000, 99999)
        url = f"https://image.pollinations.ai/prompt/{urllib.parse.quote(prompt)}?width={width}&height={height}&model=flux&nologo=true&seed={seed}"
        try:
            tmp = out_path + f"_tmp{i}.png"
            urllib.request.urlretrieve(url, tmp)
            img = Image.open(tmp).convert("RGB")
            s = score_img(img)
            if s > best_score:
                best_score = s
                best_img = img
            os.remove(tmp)
            time.sleep(0.5)
        except Exception as e:
            print(f"        attempt {i+1}: {e}")

    if best_img:
        best_img.save(out_path, quality=95)
        return best_img
    return None


def make_bw(img, brightness=1.3, contrast=1.2, desat=0.85):
    """Convert to B&W brand style."""
    img = ImageEnhance.Brightness(img).enhance(brightness)
    img = ImageEnhance.Contrast(img).enhance(contrast)
    img = ImageEnhance.Sharpness(img).enhance(1.4)
    gray = img.convert("L").convert("RGB")
    img = Image.blend(img, gray, desat)
    return ImageEnhance.Contrast(img).enhance(1.1)


# ══════════════════════════════════════════════
# COMPOSITING EFFECTS
# ══════════════════════════════════════════════
def add_noise(img, amount=8):
    """Add subtle film grain texture."""
    arr = np.array(img).astype(np.float32)
    noise = np.random.normal(0, amount, arr.shape)
    arr = np.clip(arr + noise, 0, 255).astype(np.uint8)
    return Image.fromarray(arr)

def add_vignette(img, strength=0.45):
    """Add edge darkening vignette."""
    w, h = img.size
    arr = np.array(img).astype(np.float32)
    cx, cy = w // 2, h // 2
    max_d = math.sqrt(cx**2 + cy**2)
    y, x = np.ogrid[:h, :w]
    dist = np.sqrt((x - cx)**2 + (y - cy)**2) / max_d
    mask = 1 - strength * (dist ** 1.6)
    mask = np.clip(mask, 0, 1)
    for c in range(3):
        arr[:,:,c] *= mask
    return Image.fromarray(arr.astype(np.uint8))

def add_gradient_overlay(img, direction="bottom", color=(0,0,0), strength=0.7, start_pct=0.4):
    """Add gradient overlay from a direction."""
    w, h = img.size
    overlay = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    draw = ImageDraw.Draw(overlay)

    if direction == "bottom":
        start_y = int(h * start_pct)
        for y in range(start_y, h):
            t = (y - start_y) / (h - start_y)
            a = int(255 * strength * (t ** 1.2))
            draw.line([(0, y), (w, y)], fill=(color[0], color[1], color[2], min(255, a)))
    elif direction == "top":
        end_y = int(h * (1 - start_pct))
        for y in range(0, end_y):
            t = 1 - (y / end_y)
            a = int(255 * strength * (t ** 1.2))
            draw.line([(0, y), (w, y)], fill=(color[0], color[1], color[2], min(255, a)))

    return Image.alpha_composite(img.convert("RGBA"), overlay).convert("RGB")

def add_glow(img, x, y, radius=120, intensity=40, color=(255,255,255)):
    """Add a soft glow effect at a position."""
    arr = np.array(img).astype(np.float32)
    h, w = arr.shape[:2]
    for dy in range(-radius, radius+1, 2):
        for dx in range(-radius, radius+1, 2):
            px, py = x + dx, y + dy
            if 0 <= px < w and 0 <= py < h:
                d = math.sqrt(dx*dx + dy*dy)
                if d < radius:
                    falloff = (1 - d/radius) ** 2
                    for c in range(3):
                        arr[py, px, c] = min(255, arr[py, px, c] + color[c] * falloff * intensity / 255)
                    # Fill adjacent pixels for speed
                    if px+1 < w:
                        for c in range(3):
                            arr[py, px+1, c] = min(255, arr[py, px+1, c] + color[c] * falloff * intensity / 255)
                    if py+1 < h:
                        for c in range(3):
                            arr[py+1, px, c] = min(255, arr[py+1, px, c] + color[c] * falloff * intensity / 255)
    return Image.fromarray(arr.astype(np.uint8))

def draw_text_shadow(draw, pos, text, font, fill=WHITE, shadow_color=(0,0,0), shadow_blur=4):
    """Draw text with shadow for readability."""
    x, y = pos
    for dx in range(-shadow_blur, shadow_blur+1):
        for dy in range(-shadow_blur, shadow_blur+1):
            if dx*dx + dy*dy <= shadow_blur*shadow_blur:
                draw.text((x+dx, y+dy), text, font=font, fill=shadow_color)
    draw.text((x, y), text, font=font, fill=fill)

def center_x(draw, text, font, canvas_w=W):
    """Get centered X position for text."""
    bb = draw.textbbox((0, 0), text, font=font)
    return (canvas_w - (bb[2] - bb[0])) // 2

def text_width(draw, text, font):
    bb = draw.textbbox((0, 0), text, font=font)
    return bb[2] - bb[0]

def text_height(draw, text, font):
    bb = draw.textbbox((0, 0), text, font=font)
    return bb[3] - bb[1]

def word_wrap(draw, text, font, max_width):
    """Wrap text to fit within max_width."""
    words = text.split()
    lines = []
    current = ""
    for word in words:
        test = f"{current} {word}".strip()
        if text_width(draw, test, font) <= max_width:
            current = test
        else:
            if current:
                lines.append(current)
            current = word
    if current:
        lines.append(current)
    return lines


# ══════════════════════════════════════════════
# BRAND ELEMENTS
# ══════════════════════════════════════════════
def draw_ds_logo(draw, x, y, size=40):
    """Draw the DS brand mark."""
    f = TITLE(size)
    draw.text((x, y), "DS", font=f, fill=WHITE)

def draw_brand_header(draw, img=None):
    """Draw brand logo top-left (like CashFish style)."""
    # DS circle logo
    margin = 40
    logo_size = 42
    # Draw circle
    cx, cy = margin + 18, margin + 18
    r = 18
    draw.ellipse([(cx-r, cy-r), (cx+r, cy+r)], outline=WHITE, width=2)
    f = BOLD(18)
    bb = draw.textbbox((0,0), "DS", font=f)
    tx = cx - (bb[2]-bb[0])//2
    ty = cy - (bb[3]-bb[1])//2 - 2
    draw.text((tx, ty), "DS", font=f, fill=WHITE)

    # Brand name
    nf = BOLD(20)
    draw.text((cx + r + 12, cy - 10), "DS Marketing", font=nf, fill=WHITE)

def draw_brand_footer(draw, page=None, total=None, show_handle=True, y_pos=None):
    """Draw footer with handle + page number + swipe."""
    if y_pos is None:
        y_pos = H - 70

    if show_handle:
        # Instagram icon area (simplified)
        hf = BOLD(18)
        draw.text((40, y_pos), "Instagram", font=REGULAR(14), fill=MED_GRAY)
        draw.text((40, y_pos + 18), BRAND_HANDLE.replace("@", ""), font=hf, fill=LIGHT_GRAY)

    if page is not None and total is not None:
        pf = BOLD(16)
        page_text = f"Page  {page}/{total}"
        px = center_x(draw, page_text, pf)
        # Page badge
        pw = text_width(draw, page_text, pf)
        ph = text_height(draw, page_text, pf)
        badge_x = px - 14
        badge_y = y_pos + 4
        draw.rounded_rectangle(
            [(badge_x, badge_y), (badge_x + pw + 28, badge_y + ph + 16)],
            radius=8, outline=MED_GRAY, width=1
        )
        draw.text((px, y_pos + 12), page_text, font=pf, fill=LIGHT_GRAY)

def draw_swipe_arrow(draw, x=None, y=None, direction="left"):
    """Draw a swipe arrow indicator."""
    if x is None:
        x = W - 100
    if y is None:
        y = H - 55

    af = BOLD(16)
    draw.text((x, y), "swipe", font=af, fill=MED_GRAY)

    # Arrow
    arrow_x = x + 65
    arrow_y = y + 8
    if direction == "left":
        draw.line([(arrow_x, arrow_y), (arrow_x - 20, arrow_y)], fill=MED_GRAY, width=2)
        draw.line([(arrow_x - 20, arrow_y), (arrow_x - 14, arrow_y - 6)], fill=MED_GRAY, width=2)
        draw.line([(arrow_x - 20, arrow_y), (arrow_x - 14, arrow_y + 6)], fill=MED_GRAY, width=2)
    else:
        draw.line([(arrow_x - 20, arrow_y), (arrow_x, arrow_y)], fill=MED_GRAY, width=2)
        draw.line([(arrow_x, arrow_y), (arrow_x - 6, arrow_y - 6)], fill=MED_GRAY, width=2)
        draw.line([(arrow_x, arrow_y), (arrow_x - 6, arrow_y + 6)], fill=MED_GRAY, width=2)

def draw_carousel_dots(draw, current=0, total=5, y=None):
    """Draw carousel page indicator dots."""
    if y is None:
        y = H - 20
    dot_r = 4
    spacing = 16
    total_w = total * spacing
    start_x = (W - total_w) // 2

    for i in range(total):
        cx = start_x + i * spacing + dot_r
        color = WHITE if i == current else (60, 60, 60)
        draw.ellipse([(cx-dot_r, y-dot_r), (cx+dot_r, y+dot_r)], fill=color)


# ══════════════════════════════════════════════
# SLIDE BUILDERS — Roman Knox Style
# ══════════════════════════════════════════════

def build_cover_slide(title_lines, subtitle, bg_image=None, topic_number=None, total_slides=5):
    """
    Cover slide — Roman Knox style.
    Dark AI background, massive bold text, brand elements.
    """
    img = Image.new("RGB", (W, H), BLACK)

    # AI background
    if bg_image:
        bg = bg_image.copy()
        # Scale to fill
        scale = max(W / bg.width, H / bg.height)
        new_w = int(bg.width * scale)
        new_h = int(bg.height * scale)
        bg = bg.resize((new_w, new_h), Image.LANCZOS)
        # Center crop
        left = (new_w - W) // 2
        top = (new_h - H) // 2
        bg = bg.crop((left, top, left + W, top + H))
        # Darken for text readability
        bg = ImageEnhance.Brightness(bg).enhance(0.45)
        bg = make_bw(bg, brightness=0.7, contrast=1.3, desat=0.9)
        img.paste(bg)

    # Gradient overlay bottom for text area
    img = add_gradient_overlay(img, "bottom", BLACK, 0.85, 0.35)

    draw = ImageDraw.Draw(img)

    # Brand header
    draw_brand_header(draw)

    # Title text — BIG and BOLD at bottom
    title_font = TITLE(105)
    y_start = H - 120 - len(title_lines) * 115

    for i, line in enumerate(title_lines):
        line_upper = line.upper()
        x = 60  # Left-aligned like Roman Knox
        draw_text_shadow(draw, (x, y_start + i * 115), line_upper, title_font, WHITE, BLACK, 5)

    # Subtitle
    if subtitle:
        sf = REGULAR(30)
        sub_y = y_start + len(title_lines) * 115 + 10
        draw.text((60, sub_y), subtitle, font=sf, fill=LIGHT_GRAY)

    # Number badge top-right (like "5" in "5 Claude Code Plugins")
    if topic_number:
        nf = TITLE(180)
        num_text = str(topic_number)
        nx = W - 200
        ny = 100
        # Glow behind number
        img = add_glow(img, nx + 50, ny + 80, radius=100, intensity=25)
        draw = ImageDraw.Draw(img)
        draw_text_shadow(draw, (nx, ny), num_text, nf, WHITE, BLACK, 6)

    # Swipe arrow bottom-right
    draw_swipe_arrow(draw, W - 130, H - 90, "left")

    # Footer handle
    hf = BOLD(18)
    # Instagram style badge
    draw.text((40, H - 70), "Instagram", font=REGULAR(13), fill=(100,100,100))
    draw.text((40, H - 50), "DS.Marketing", font=hf, fill=LIGHT_GRAY)

    # Dots
    draw_carousel_dots(draw, 0, total_slides, H - 15)

    # Finish
    img = add_noise(img, 6)
    img = add_vignette(img, 0.35)
    return img


def build_content_slide(number, headline, body_points, page, total_slides, bg_image=None):
    """
    Content slide — educational, numbered.
    Large number, bold headline, bullet points, 3D object.
    """
    img = Image.new("RGB", (W, H), NEAR_BLACK)
    draw = ImageDraw.Draw(img)

    # Subtle gradient background
    for y in range(H):
        t = y / H
        v = int(12 + 8 * math.sin(t * math.pi))
        draw.line([(0, y), (W, y)], fill=(v, v, v))

    # Brand header
    draw_brand_header(draw)

    # 3D object in background (if provided)
    if bg_image:
        obj = bg_image.copy()
        obj_size = 320
        obj = obj.resize((obj_size, obj_size), Image.LANCZOS)
        obj = make_bw(obj, brightness=0.5, contrast=1.1, desat=0.95)
        # Place right side, middle
        obj_x = W - obj_size - 40
        obj_y = 200
        # Blend with transparency effect
        arr = np.array(img).astype(np.float32)
        obj_arr = np.array(obj).astype(np.float32)
        for oy in range(obj_size):
            for ox in range(obj_size):
                px, py = obj_x + ox, obj_y + oy
                if 0 <= px < W and 0 <= py < H:
                    # Distance from center for circular mask
                    d = math.sqrt((ox - obj_size/2)**2 + (oy - obj_size/2)**2) / (obj_size/2)
                    if d < 1:
                        alpha = 0.25 * (1 - d**2)
                        arr[py, px] = arr[py, px] * (1 - alpha) + obj_arr[oy, ox] * alpha
        img = Image.fromarray(arr.astype(np.uint8))
        draw = ImageDraw.Draw(img)

    # Large number
    nf = TITLE(200)
    num_str = f"{number:02d}"
    draw_text_shadow(draw, (60, 100), num_str, nf, WHITE, BLACK, 4)

    # Horizontal line under number
    line_y = 320
    draw.line([(60, line_y), (W - 60, line_y)], fill=MED_GRAY, width=1)

    # Headline
    hf = TITLE(58)
    headline_lines = word_wrap(draw, headline.upper(), hf, W - 120)
    hy = 345
    for hl in headline_lines:
        draw.text((60, hy), hl, font=hf, fill=WHITE)
        hy += 68

    # Body bullet points
    bf = REGULAR(28)
    bullet_y = hy + 30
    for point in body_points:
        # Star bullet (like Roman Knox)
        draw.text((60, bullet_y), "◆", font=REGULAR(16), fill=MED_GRAY)
        # Wrap point text
        point_lines = word_wrap(draw, point, bf, W - 160)
        for pl in point_lines:
            draw.text((90, bullet_y), pl, font=bf, fill=LIGHT_GRAY)
            bullet_y += 38
        bullet_y += 12

    # Footer
    draw_brand_footer(draw, page, total_slides, True)

    # Finish
    img = add_noise(img, 5)
    img = add_vignette(img, 0.25)
    return img


def build_quote_slide(quote_text, author, page, total_slides):
    """
    Quote slide — elegant typography.
    Large quotation marks, centered quote, author attribution.
    """
    img = Image.new("RGB", (W, H), BLACK)
    draw = ImageDraw.Draw(img)

    # Subtle radial gradient
    cx, cy = W // 2, H // 2
    for y in range(H):
        for x in range(0, W, 3):
            d = math.sqrt((x - cx)**2 + (y - cy)**2)
            t = min(1.0, d / (max(W, H) * 0.5))
            v = int(18 * (1 - t**1.5))
            if v > 0:
                img.putpixel((x, y), (v, v, v))
                if x+1 < W: img.putpixel((x+1, y), (v, v, v))
                if x+2 < W: img.putpixel((x+2, y), (v, v, v))

    draw = ImageDraw.Draw(img)

    # Brand header
    draw_brand_header(draw)

    # Large quotation mark — styled (like CashFish green quotes but in white)
    qf = TITLE(250)
    draw.text((60, 180), "\u201C", font=qf, fill=(50, 50, 50))

    # Quote text
    quote_font = ITALIC(36)
    quote_lines = word_wrap(draw, quote_text, quote_font, W - 160)
    qy = 400
    for ql in quote_lines:
        qx = center_x(draw, ql, quote_font)
        draw.text((qx, qy), ql, font=quote_font, fill=OFF_WHITE)
        qy += 52

    # Closing quote
    draw.text((W - 140, qy + 10), "\u201D", font=qf, fill=(50, 50, 50))

    # Horizontal line
    line_y = qy + 80
    line_w = 200
    lx = (W - line_w) // 2
    draw.line([(lx, line_y), (lx + line_w, line_y)], fill=MED_GRAY, width=1)

    # Author
    af = BOLD(26)
    author_text = f"\u2014 {author}"
    ax = center_x(draw, author_text, af)
    draw.text((ax, line_y + 20), author_text, font=af, fill=MED_GRAY)

    # Footer
    draw_brand_footer(draw, page, total_slides, True)

    img = add_noise(img, 5)
    img = add_vignette(img, 0.3)
    return img


def build_stat_slide(big_number, label, description, page, total_slides):
    """
    Statistics slide — like CashFish "1,000+ New Users".
    Giant number, label, description.
    """
    img = Image.new("RGB", (W, H), BLACK)
    draw = ImageDraw.Draw(img)

    # Brand header
    draw_brand_header(draw)

    # Giant number
    nf = TITLE(220)
    nx = center_x(draw, big_number, nf)
    ny = 220

    # Glow behind number
    img = add_glow(img, W // 2, ny + 100, radius=200, intensity=15)
    draw = ImageDraw.Draw(img)

    draw_text_shadow(draw, (nx, ny), big_number, nf, WHITE, BLACK, 5)

    # Label
    lf = TITLE(60)
    label_lines = word_wrap(draw, label.upper(), lf, W - 120)
    ly = ny + 240
    for ll in label_lines:
        lx = center_x(draw, ll, lf)
        draw.text((lx, ly), ll, font=lf, fill=LIGHT_GRAY)
        ly += 72

    # Line
    line_y = ly + 20
    draw.line([(200, line_y), (W - 200, line_y)], fill=MED_GRAY, width=1)

    # Description
    df = REGULAR(26)
    desc_lines = word_wrap(draw, description, df, W - 160)
    dy = line_y + 30
    for dl in desc_lines:
        dx = center_x(draw, dl, df)
        draw.text((dx, dy), dl, font=df, fill=MED_GRAY)
        dy += 38

    draw_brand_footer(draw, page, total_slides, True)
    img = add_noise(img, 5)
    img = add_vignette(img, 0.3)
    return img


def build_cta_slide(total_slides):
    """
    CTA slide — DS brand pulse, follow CTA.
    """
    img = Image.new("RGB", (W, H), BLACK)

    # Centered glow
    img = add_glow(img, W // 2, int(H * 0.35), radius=250, intensity=20)

    draw = ImageDraw.Draw(img)

    # DS logo — large
    ds_font = TITLE(200)
    ds_x = center_x(draw, "DS", ds_font)
    ds_y = int(H * 0.2)
    draw_text_shadow(draw, (ds_x, ds_y), "DS", ds_font, WHITE, BLACK, 6)

    # MARKETING
    mf = TITLE(55)
    mx = center_x(draw, "MARKETING", mf)
    draw.text((mx, ds_y + 210), "MARKETING", font=mf, fill=LIGHT_GRAY)

    # Line
    line_y = ds_y + 290
    draw.line([(250, line_y), (W - 250, line_y)], fill=WHITE, width=2)

    # Handle
    hf = BOLD(36)
    hx = center_x(draw, BRAND_HANDLE, hf)
    draw.text((hx, line_y + 30), BRAND_HANDLE, font=hf, fill=WHITE)

    # Website
    wf = REGULAR(22)
    wx = center_x(draw, BRAND_SITE, wf)
    draw.text((wx, line_y + 80), BRAND_SITE, font=wf, fill=MED_GRAY)

    # Follow CTA
    ff = TITLE(52)
    follow_text = "FOLLOW FOR MORE"
    fx = center_x(draw, follow_text, ff)
    fy = line_y + 160

    # CTA box
    fw = text_width(draw, follow_text, ff)
    fh = text_height(draw, follow_text, ff)
    draw.rounded_rectangle(
        [(fx - 30, fy - 10), (fx + fw + 30, fy + fh + 20)],
        radius=12, outline=WHITE, width=2
    )
    draw.text((fx, fy), follow_text, font=ff, fill=WHITE)

    # Dots
    draw_carousel_dots(draw, total_slides - 1, total_slides, H - 15)

    img = add_noise(img, 5)
    img = add_vignette(img, 0.35)
    return img


# ══════════════════════════════════════════════
# CONTENT GENERATION
# ══════════════════════════════════════════════

DEFAULT_CAROUSELS = [
    {
        "topic": "5 Social Media Mistakes Killing Your Growth",
        "cover_lines": ["5 MISTAKES", "KILLING YOUR", "GROWTH"],
        "cover_sub": "Stop making these. Your competitors aren't.",
        "topic_number": 5,
        "bg_prompt": "professional dark office desk with laptop showing analytics dashboard, dramatic moody lighting, cinematic, dark background, studio photography, 8K",
        "slides": [
            {"headline": "Posting Without a Strategy", "points": ["Random posts give random results.", "A content calendar isn't optional \u2014 it's the foundation.", "Plan 7 days ahead minimum."]},
            {"headline": "Ignoring Your Analytics", "points": ["The data tells you exactly what works.", "Check insights weekly, not monthly.", "Double down on your top 3 performing formats."]},
            {"headline": "No Hook in the First Line", "points": ["80% of people never read past line one.", "Lead with a bold claim or question.", "Your hook IS your content strategy."]},
            {"headline": "Zero Engagement Strategy", "points": ["Post and ghost? The algorithm notices.", "Reply to every comment within 1 hour.", "Spend 15 min/day engaging with your niche."]},
            {"headline": "Same Content Everywhere", "points": ["Instagram and LinkedIn are different worlds.", "Repurpose, don't copy-paste.", "Each platform has its own language."]},
        ],
        "quote": {"text": "The best marketing doesn't feel like marketing.", "author": "Tom Fishburne"},
        "stat": {"number": "73%", "label": "of marketers post without a plan", "desc": "Don't be one of them. Strategy beats random every time."},
        "caption": "Your social media isn't broken. Your strategy is.\n\nThese 5 mistakes are costing you followers, engagement, and revenue every single day. The fix? It's simpler than you think.\n\nSave this. Share it with someone who needs it.\n\n#socialmedia #marketing #socialmediamarketing #instagram #growth #entrepreneur #businesstips #digitalmarketing #contentmarketing #branding #smm #marketingtips #instagramgrowth #contentcreator #smallbusiness"
    },
    {
        "topic": "The Content Calendar That Actually Works",
        "cover_lines": ["THE CONTENT", "CALENDAR THAT", "WORKS"],
        "cover_sub": "Framework beats random. Every time.",
        "topic_number": 7,
        "bg_prompt": "modern minimalist workspace with calendar planner and coffee on dark wooden desk, dramatic rim lighting, studio photography, dark moody atmosphere, 8K",
        "slides": [
            {"headline": "Monday: Education", "points": ["Tips, frameworks, how-to's.", "Teach something they can use TODAY.", "Carousels and infographics perform best."]},
            {"headline": "Tuesday: Industry Insights", "points": ["Share trends and predictions.", "Position yourself as the expert.", "Add your unique take \u2014 don't just reshare."]},
            {"headline": "Wednesday: Case Studies", "points": ["Show real results with real numbers.", "Before and after is powerful.", "Let the data tell the story."]},
            {"headline": "Thursday: Behind the Scenes", "points": ["Show your process, not just results.", "People connect with people, not brands.", "Raw > polished for BTS content."]},
            {"headline": "Friday: Engagement", "points": ["Ask questions. Start conversations.", "Polls, quizzes, hot takes.", "The algorithm rewards interaction."]},
        ],
        "quote": {"text": "Content is fire. Social media is gasoline.", "author": "Jay Baer"},
        "stat": {"number": "4X", "label": "more engagement with consistent posting", "desc": "Brands that post 4+ times per week see 4X the engagement."},
        "caption": "Stop guessing what to post.\n\nThis content calendar framework has helped dozens of brands go from random posting to strategic growth. Each day has a purpose. Each post builds on the last.\n\nSave this for your next content planning session.\n\n#contentcalendar #socialmedia #marketing #instagramstrategy #contentplan #socialmediamanager #digitalmarketing #contentcreation #marketingstrategy #smm #branding #entrepreneur #businessgrowth #instagramtips #growthhacking"
    },
    {
        "topic": "Hook Writing Formula for Instagram",
        "cover_lines": ["THE HOOK", "FORMULA"],
        "cover_sub": "3 seconds. That's all you get.",
        "topic_number": 3,
        "bg_prompt": "dramatic close up of hands typing on keyboard with screen glow reflecting on face, dark room, cinematic lighting, studio photography, 8K, moody",
        "slides": [
            {"headline": "Start With a Number", "points": ["Numbers stop the scroll instantly.", "'7 mistakes' hits harder than 'some mistakes'.", "Odd numbers outperform even ones."]},
            {"headline": "Ask a Loaded Question", "points": ["Questions trigger curiosity.", "'Why is your content failing?' \u2014 they HAVE to know.", "Make them feel the problem."]},
            {"headline": "Make a Bold Claim", "points": ["'Your marketing strategy is dead.'", "Controversy drives engagement.", "Be bold but back it up."]},
        ],
        "quote": {"text": "You never get a second chance to make a first impression.", "author": "Will Rogers"},
        "stat": {"number": "3s", "label": "to stop the scroll", "desc": "If your hook doesn't grab them in 3 seconds, nothing else matters."},
        "caption": "Your hook is your entire strategy.\n\n3 seconds. That's the window. Miss it and they're gone forever. These three formulas have generated millions of impressions for our clients.\n\nWhich formula will you try first? Tell me in the comments.\n\n#hooks #copywriting #instagramtips #contentcreator #marketing #socialmedia #digitalmarketing #instagramgrowth #writingtips #branding #entrepreneur #smm #engagement #contentmarketing #reels"
    },
    {
        "topic": "How to 10X Your Instagram Engagement",
        "cover_lines": ["10X YOUR", "ENGAGEMENT"],
        "cover_sub": "Engagement isn't luck. It's strategy.",
        "topic_number": 5,
        "bg_prompt": "smartphone showing Instagram app with notifications on dark marble desk, soft dramatic lighting, studio photography, dark background, luxury aesthetic, 8K",
        "slides": [
            {"headline": "Reply to Every Comment", "points": ["Within the first hour \u2014 that's the golden window.", "Replies count as engagement too.", "Turn comments into conversations."]},
            {"headline": "Use Carousel Posts More", "points": ["Carousels get 3X the engagement of single images.", "Each swipe is a signal to the algorithm.", "Aim for 7-10 slides per carousel."]},
            {"headline": "Write Better Captions", "points": ["Long captions = more time on post.", "Tell stories, not just tips.", "End with a question or CTA."]},
            {"headline": "Post at Peak Hours", "points": ["Check YOUR analytics \u2014 not generic advice.", "Test different times for 2 weeks.", "Consistency matters more than timing."]},
            {"headline": "Create Shareable Content", "points": ["If they won't share it, it's not valuable enough.", "Saves and shares > likes.", "Think: 'Would I send this to a friend?'"]},
        ],
        "quote": {"text": "People don't buy goods and services. They buy relations, stories, and magic.", "author": "Seth Godin"},
        "stat": {"number": "312%", "label": "boost from carousel posts", "desc": "Carousels drive 312% more engagement than single image posts."},
        "caption": "Zero engagement? It's not the algorithm. It's your strategy.\n\nThese 5 tactics have helped our clients go from ghost town to thriving community. The secret? Be human. Be consistent. Be strategic.\n\nDouble tap if you're implementing these today.\n\n#engagement #instagramengagement #socialmedia #marketing #instagramgrowth #contentcreator #digitalmarketing #smm #branding #entrepreneur #businesstips #socialmediamarketing #instagramtips #contentmarketing #growth"
    },
    {
        "topic": "Build a Brand People Remember",
        "cover_lines": ["BUILD A BRAND", "PEOPLE", "REMEMBER"],
        "cover_sub": "If they can't recognize you in 2 seconds, you don't have a brand.",
        "topic_number": 4,
        "bg_prompt": "luxury brand items on dark velvet background, premium watch and notebook, dramatic studio lighting, high contrast, cinematic photography, 8K, dark moody",
        "slides": [
            {"headline": "Define Your Voice", "points": ["Are you the mentor? The rebel? The expert?", "Pick 3 adjectives that ARE your brand.", "Use them in every piece of content."]},
            {"headline": "Visual Consistency", "points": ["Same colors. Same fonts. Same energy.", "Your grid should look like ONE brand.", "Templates save time and build recognition."]},
            {"headline": "Tell Your Story", "points": ["People follow people, not logos.", "Share your why \u2014 not just your what.", "Vulnerability builds trust."]},
            {"headline": "Create a Signature", "points": ["One thing only YOU do.", "A catchphrase. A format. A style.", "Make it impossible to confuse you with anyone else."]},
        ],
        "quote": {"text": "Your brand is what people say about you when you're not in the room.", "author": "Jeff Bezos"},
        "stat": {"number": "2s", "label": "to recognize a strong brand", "desc": "The best brands are instantly recognizable. Is yours?"},
        "caption": "You don't have a brand. You have a logo.\n\nA real brand is felt, not just seen. It's the voice, the consistency, the story, the feeling people get when they see your content. Build something people can't forget.\n\nTag someone building their brand right now.\n\n#branding #brandidentity #marketing #personalbranding #instagram #entrepreneur #businessowner #digitalmarketing #contentcreator #smm #socialmedia #brandstrategy #design #growth #mindset"
    },
]


# ══════════════════════════════════════════════
# MAIN PIPELINE
# ══════════════════════════════════════════════

def main():
    print()
    print("  \u2554" + "\u2550" * 58 + "\u2557")
    print("  \u2551  DS MARKETING x ROMAN KNOX CAROUSEL ENGINE v1.0        \u2551")
    print("  \u2551  Premium Carousels. AI-Powered. Ollama + Pollinations.  \u2551")
    print("  \u2551  Inspired by: Roman Knox | CashFish | Dark Gradients    \u2551")
    print("  \u255a" + "\u2550" * 58 + "\u255d")
    print()

    os.makedirs(OUT, exist_ok=True)
    os.makedirs(f"{OUT}/backgrounds", exist_ok=True)
    os.makedirs(f"{OUT}/captions", exist_ok=True)

    # ─── OLLAMA ───
    print("  STEP 1: AI Brain (Ollama)")
    print("  " + "\u2500" * 58)

    model = None
    carousels = None

    if check_ollama():
        print("    \u2713 Ollama connected")
        model = find_model()
        if model:
            print(f"    \u2713 Model: {model}")
            print("    Generating carousel content...")
            prompt = """Generate 5 Instagram carousel post ideas for a social media marketing agency.
Each carousel should be educational and high-value.

Return ONLY valid JSON — an array of objects with:
- "topic": carousel topic (5-8 words)
- "cover_lines": array of 2-3 short lines for the cover slide (3-5 words each, will be ALL CAPS)
- "cover_sub": subtitle for cover (one short sentence)
- "topic_number": the key number in the topic (e.g., 5 for "5 mistakes")
- "bg_prompt": image generation prompt for the cover background (dark, moody, professional desk/tech/office scene, cinematic, 8K)
- "slides": array of 3-5 objects with "headline" (4-8 words) and "points" (array of 3 short bullet points)
- "quote": object with "text" (marketing quote) and "author"
- "stat": object with "number" (like "73%" or "4X"), "label" (what the number means), "desc" (one sentence context)
- "caption": full Instagram caption with hashtags

Return ONLY the JSON array."""

            result = ask_ai_json(prompt, model, AI_SYSTEM)
            if result and isinstance(result, list) and len(result) >= 3:
                carousels = result
                print(f"    \u2713 {len(carousels)} carousels generated by AI")
                for i, c in enumerate(carousels):
                    print(f"      {i+1}. {c.get('topic', 'untitled')}")
            else:
                print("    ! AI generation failed \u2014 using premium defaults")
    else:
        print("    Ollama not running \u2014 using premium default content")
        print("    (Install Ollama from ollama.com for AI-generated content)")

    if not carousels:
        carousels = DEFAULT_CAROUSELS

    print()

    # ─── BUILD CAROUSELS ───
    for idx, carousel in enumerate(carousels):
        topic = carousel.get("topic", f"Post {idx+1}")
        cover_lines = carousel.get("cover_lines", [topic.upper()])
        cover_sub = carousel.get("cover_sub", "")
        topic_number = carousel.get("topic_number")
        bg_prompt = carousel.get("bg_prompt", "dark professional desk setup, dramatic lighting, studio photography, 8K")
        slides_data = carousel.get("slides", [])
        quote_data = carousel.get("quote")
        stat_data = carousel.get("stat")
        caption = carousel.get("caption", "")

        total_slides = 1 + len(slides_data) + (1 if stat_data else 0) + (1 if quote_data else 0) + 1  # cover + content + stat + quote + cta

        post_dir = f"{OUT}/post_{idx+1:02d}"
        os.makedirs(post_dir, exist_ok=True)

        print(f"  POST {idx+1}: {topic}")
        print("  " + "\u2500" * 58)

        # Generate AI background for cover
        print(f"    Generating AI background...")
        bg_path = f"{OUT}/backgrounds/bg_{idx+1:02d}.png"
        bg_img = generate_ai_image(bg_prompt, bg_path, GEN_SIZE, int(GEN_SIZE * H / W))

        # SLIDE 1: Cover
        print(f"    Building cover slide...")
        cover = build_cover_slide(cover_lines, cover_sub, bg_img, topic_number, total_slides)
        cover.save(f"{post_dir}/01_cover.png", quality=95)

        # SLIDES 2-N: Content
        for si, slide in enumerate(slides_data):
            page = si + 2
            headline = slide.get("headline", f"Point {si+1}")
            points = slide.get("points", [])

            # Generate 3D object for some slides
            obj_img = None
            # Only generate objects for first and last content slides to save time
            if si == 0 or si == len(slides_data) - 1:
                obj_prompt = f"3D rendered icon of {headline.lower()}, dark background, isometric view, studio lighting, minimalist, high quality render, 8K"
                obj_path = f"{OUT}/backgrounds/obj_{idx+1:02d}_{si+1:02d}.png"
                print(f"    Generating 3D object for slide {page}...")
                obj_img = generate_ai_image(obj_prompt, obj_path, 512, 512, attempts=1)

            print(f"    Building slide {page}: {headline}")
            content = build_content_slide(si + 1, headline, points, page, total_slides, obj_img)
            content.save(f"{post_dir}/{page:02d}_content.png", quality=95)

        next_page = len(slides_data) + 2

        # STAT SLIDE
        if stat_data:
            print(f"    Building stat slide...")
            stat = build_stat_slide(
                stat_data.get("number", "100%"),
                stat_data.get("label", ""),
                stat_data.get("desc", ""),
                next_page, total_slides
            )
            stat.save(f"{post_dir}/{next_page:02d}_stat.png", quality=95)
            next_page += 1

        # QUOTE SLIDE
        if quote_data:
            print(f"    Building quote slide...")
            quote = build_quote_slide(
                quote_data.get("text", ""),
                quote_data.get("author", ""),
                next_page, total_slides
            )
            quote.save(f"{post_dir}/{next_page:02d}_quote.png", quality=95)
            next_page += 1

        # CTA SLIDE
        print(f"    Building CTA slide...")
        cta = build_cta_slide(total_slides)
        cta.save(f"{post_dir}/{next_page:02d}_cta.png", quality=95)

        # CAPTION
        if caption:
            with open(f"{post_dir}/caption.txt", "w") as f:
                f.write(caption)
            with open(f"{OUT}/captions/post_{idx+1:02d}.txt", "w") as f:
                f.write(f"TOPIC: {topic}\n\n{caption}")

        print(f"    \u2713 {total_slides} slides saved to {post_dir}/")
        print()

    # Summary
    print("  \u2554" + "\u2550" * 58 + "\u2557")
    print("  \u2551  ALL DONE \u2014 ROMAN KNOX CAROUSELS COMPLETE             \u2551")
    print("  \u255a" + "\u2550" * 58 + "\u255d")
    print(f"""
  Your content: {OUT}/

  {len(carousels)} PREMIUM CAROUSEL POSTS:
""")
    for i, c in enumerate(carousels):
        t = c.get("topic", f"Post {i+1}")
        s = len(c.get("slides", [])) + 3  # cover + stat + quote + cta
        print(f"     post_{i+1:02d}/  ({s} slides)  {t}")

    print(f"""
  EACH POST INCLUDES:
     \u2022 AI-generated cover with background scene
     \u2022 Numbered content slides with bullet points
     \u2022 Statistics slide with big numbers
     \u2022 Quote slide with elegant typography
     \u2022 CTA slide with brand + follow button
     \u2022 Ready-to-post caption with hashtags

  STYLE: Roman Knox x CashFish x Dark Gradients
  BRAND: Pure Black & White

  Captions: {OUT}/captions/

  Upload directly to Instagram as carousel posts.
  The order is already numbered (01, 02, 03...).
""")


if __name__ == "__main__":
    main()
