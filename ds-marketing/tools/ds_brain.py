#!/usr/bin/env python3
"""
DS MARKETING AI BRAIN v1.0
═══════════════════════════════════════════
Powered by Ollama — YOUR local AI, running on YOUR machine.
No cloud. No API keys. No monthly fees. 100% yours.

WHAT IT DOES:
  1. Connects to Ollama (local AI) on your Mac
  2. Generates a full week of Instagram content using AI
  3. Writes carousel scripts, reel scripts, captions, hashtags
  4. Builds the actual images and videos automatically
  5. Everything ready to post — one command does it all

SETUP (one time):
  1. Install Ollama: https://ollama.com/download
  2. Open Ollama (just launch the app)
  3. Run: python3 ds_brain.py

That's it. The script handles the rest.
"""

import os, sys, subprocess, json, time, math, random, textwrap

# ══════════════════════════════════════════════
# AUTO-INSTALL DEPENDENCIES
# ══════════════════════════════════════════════
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
import urllib.request, urllib.parse


# ══════════════════════════════════════════════
# CONFIG
# ══════════════════════════════════════════════
OLLAMA_URL = "http://localhost:11434"
PREFERRED_MODELS = ["mistral", "llama3.2", "llama3.1", "gemma2", "phi3"]
OUT = "ds-marketing-ai"

# Brand
BRAND_NAME = "DS Marketing"
BRAND_HANDLE = "@dsmarketing.agency"
BRAND_NICHE = "social media marketing agency"
BRAND_AUDIENCE = "small business owners and entrepreneurs"
BRAND_COLORS = "black and white ONLY — never use colors"
BRAND_VOICE = "confident, direct, authoritative, no fluff, educational"

# Image sizes
SLIDE_W, SLIDE_H = 1080, 1080
REEL_W, REEL_H = 1080, 1920
GEN_SIZE = 1536
ATTEMPTS_PER_CHAR = 3

# Video
FPS = 20
VOICE = "en-US-DavisNeural"

BLACK = (0, 0, 0)
WHITE = (255, 255, 255)
DARK_GRAY = (26, 26, 26)
MED_GRAY = (128, 128, 128)
LIGHT_GRAY = (200, 200, 200)


# ══════════════════════════════════════════════
# FONTS
# ══════════════════════════════════════════════
_font_cache = {}
def _f(paths, sz):
    key = (tuple(paths), sz)
    if key in _font_cache:
        return _font_cache[key]
    for p in paths:
        if os.path.exists(p):
            try:
                f = ImageFont.truetype(p, sz)
                _font_cache[key] = f
                return f
            except: pass
    f = ImageFont.load_default()
    _font_cache[key] = f
    return f

def H_FONT(sz):
    return _f(["BebasNeue-Regular.ttf",
               "/System/Library/Fonts/Supplemental/Impact.ttf",
               "/Library/Fonts/Impact.ttf",
               "/usr/share/fonts/truetype/liberation/LiberationSans-Bold.ttf"], sz)

def B_FONT(sz):
    return _f(["/System/Library/Fonts/Supplemental/Arial Bold.ttf",
               "/Library/Fonts/Arial Bold.ttf",
               "/System/Library/Fonts/Helvetica-Bold.otf",
               "/usr/share/fonts/truetype/liberation/LiberationSans-Bold.ttf"], sz)

def R_FONT(sz):
    return _f(["/System/Library/Fonts/Supplemental/Arial.ttf",
               "/Library/Fonts/Arial.ttf",
               "/System/Library/Fonts/Helvetica.ttc",
               "/usr/share/fonts/truetype/liberation/LiberationSans-Regular.ttf"], sz)


# ══════════════════════════════════════════════
# OLLAMA CONNECTION
# ══════════════════════════════════════════════
def check_ollama():
    """Check if Ollama is running locally."""
    try:
        r = requests.get(OLLAMA_URL, timeout=5)
        return r.status_code == 200
    except:
        return False


def list_models():
    """List locally available models."""
    try:
        r = requests.get(f"{OLLAMA_URL}/api/tags", timeout=10)
        models = r.json().get("models", [])
        return [m["name"] for m in models]
    except:
        return []


def pull_model(name):
    """Pull a model from Ollama library."""
    print(f"    Downloading {name}... (this may take a few minutes)")
    try:
        r = requests.post(f"{OLLAMA_URL}/api/pull",
                          json={"model": name, "stream": True},
                          stream=True, timeout=600)
        last_status = ""
        for line in r.iter_lines():
            if line:
                data = json.loads(line)
                status = data.get("status", "")
                if status != last_status:
                    if "pulling" in status.lower():
                        total = data.get("total", 0)
                        completed = data.get("completed", 0)
                        if total > 0:
                            pct = int(completed / total * 100)
                            print(f"      {status} [{pct}%]", end="\r", flush=True)
                        else:
                            print(f"      {status}", end="\r", flush=True)
                    else:
                        print(f"      {status}")
                    last_status = status
        print(f"    Model {name} ready.")
        return True
    except Exception as e:
        print(f"    ! Failed to pull {name}: {e}")
        return False


def find_or_pull_model():
    """Find a usable model or pull one."""
    available = list_models()
    print(f"    Local models: {available if available else 'none'}")

    # Check if any preferred model is available
    for model in PREFERRED_MODELS:
        for avail in available:
            if model in avail:
                print(f"    Using model: {avail}")
                return avail

    # None found — pull mistral (best for marketing copy)
    print(f"    No preferred model found. Pulling mistral...")
    if pull_model("mistral"):
        return "mistral"

    # Fallback to any available
    if available:
        print(f"    Using fallback: {available[0]}")
        return available[0]

    return None


def ask_ollama(prompt, model, system=None, temperature=0.7, max_retries=2):
    """Send a prompt to Ollama and get a response."""
    messages = []
    if system:
        messages.append({"role": "system", "content": system})
    messages.append({"role": "user", "content": prompt})

    for attempt in range(max_retries + 1):
        try:
            r = requests.post(f"{OLLAMA_URL}/api/chat", json={
                "model": model,
                "messages": messages,
                "stream": False,
                "options": {"temperature": temperature}
            }, timeout=120)
            return r.json()["message"]["content"]
        except Exception as e:
            if attempt < max_retries:
                time.sleep(2)
            else:
                print(f"    ! Ollama error: {e}")
                return None


def ask_ollama_json(prompt, model, system=None, schema=None):
    """Get structured JSON from Ollama."""
    messages = []
    if system:
        messages.append({"role": "system", "content": system})
    messages.append({"role": "user", "content": prompt})

    payload = {
        "model": model,
        "messages": messages,
        "stream": False,
        "options": {"temperature": 0.6}
    }
    if schema:
        payload["format"] = schema

    try:
        r = requests.post(f"{OLLAMA_URL}/api/chat", json=payload, timeout=120)
        content = r.json()["message"]["content"]
        # Try to parse JSON from the response
        # Sometimes the model wraps it in ```json blocks
        content = content.strip()
        if content.startswith("```"):
            lines = content.split("\n")
            lines = [l for l in lines if not l.strip().startswith("```")]
            content = "\n".join(lines)
        return json.loads(content)
    except json.JSONDecodeError:
        # Try to extract JSON from the response
        try:
            start = content.index("{")
            end = content.rindex("}") + 1
            return json.loads(content[start:end])
        except:
            try:
                start = content.index("[")
                end = content.rindex("]") + 1
                return json.loads(content[start:end])
            except:
                return None
    except Exception as e:
        print(f"    ! JSON error: {e}")
        return None


# ══════════════════════════════════════════════
# AI CONTENT GENERATION
# ══════════════════════════════════════════════

SYSTEM_PROMPT = f"""You are the creative director for {BRAND_NAME}, a {BRAND_NICHE}.
Your audience: {BRAND_AUDIENCE}.
Brand voice: {BRAND_VOICE}.
Visual identity: {BRAND_COLORS}.
Instagram handle: {BRAND_HANDLE}

You write high-converting Instagram content. Every post must:
- Hook readers in the first 3 words
- Deliver real value (not generic advice)
- End with a clear CTA
- Use short, punchy sentences
- Sound like a mentor, not a textbook"""


def generate_carousel_topics(model, count=5):
    """Generate carousel post topics via Ollama."""
    prompt = f"""Generate {count} Instagram carousel post ideas for a social media marketing agency.

Return ONLY valid JSON — an array of objects with these exact keys:
- "topic": the carousel topic (5-8 words)
- "hook": the opening slide text that stops the scroll (under 8 words, ALL CAPS)
- "slides": array of exactly 6 strings, each a slide headline (4-8 words each)
- "caption": Instagram caption (2-3 sentences, include CTA)
- "hashtags": string of 15 relevant hashtags

Example format:
[{{"topic": "How to 10X Your Engagement", "hook": "YOUR ENGAGEMENT IS DYING.", "slides": ["Stop Posting Without a Plan", "Use Carousel Posts More", "Write Hooks That Stop Scrolls", "Reply to Every Comment", "Post at Peak Hours", "Track What Actually Works"], "caption": "Most brands post and pray. Here's what actually moves the needle. Save this and implement TODAY.", "hashtags": "#socialmedia #marketing #engagement #instagram #growth #digitalmarketing #contentcreator #smm #branding #entrepreneur #businesstips #marketingtips #socialmediamarketing #instagramgrowth #contentmarketing"}}]

Return ONLY the JSON array, no other text."""

    result = ask_ollama_json(prompt, model, SYSTEM_PROMPT)
    if result and isinstance(result, list):
        return result
    return None


def generate_reel_scripts(model, count=3):
    """Generate reel video scripts via Ollama."""
    prompt = f"""Generate {count} Instagram Reel script ideas for a social media marketing agency.
Each reel is 25-35 seconds, vertical video (9:16), black and white aesthetic.

Return ONLY valid JSON — an array of objects with these exact keys:
- "title": reel title (3-6 words)
- "hook": opening line that stops the scroll (under 10 words)
- "voice_text": the FULL voiceover script. Use "..." for natural pauses. Write it conversational, like talking to a friend. 150-200 words max. The voice should sound confident and direct.
- "scenes": array of scene objects, each with:
  - "type": one of "title", "number", "text", "day", "cta"
  - "lines": array of text lines shown on screen (2-4 words each, ALL CAPS)
  - "sub": optional subtitle text (regular case, 5-10 words)
  - "dur": duration in seconds (2.5 to 5)
  - "num": number (only for type "number")
  - "day": day name (only for type "day")
  - "desc": description (only for type "day")

The last scene must always be type "cta" with dur 4.
Total duration of all scenes should be 25-35 seconds.

Return ONLY the JSON array, no other text."""

    result = ask_ollama_json(prompt, model, SYSTEM_PROMPT)
    if result and isinstance(result, list):
        return result
    return None


def generate_character_prompts(model, count=5):
    """Generate optimized AI character prompts via Ollama."""
    prompt = f"""Generate {count} character image prompts for a social media marketing agency's Instagram.
These will be used to generate AI character images with a black and white aesthetic.

Each character should be a professional-looking person in a dramatic studio setting.

Return ONLY valid JSON — an array of objects with these exact keys:
- "name": short filename-safe name (e.g., "strategist", "analyst", "visionary")
- "prompt": a detailed image generation prompt. Must include:
  - "BRIGHT white studio lighting" and "pure solid black background"
  - Professional attire description
  - Confident pose/expression
  - "ultra-realistic, 8K, studio photography, cinematic lighting"
  - "dramatic rim lighting, high contrast black and white"

Return ONLY the JSON array, no other text."""

    result = ask_ollama_json(prompt, model, SYSTEM_PROMPT)
    if result and isinstance(result, list):
        return result
    return None


def generate_captions(model, topic, slide_text):
    """Generate an Instagram caption for a specific post."""
    prompt = f"""Write an Instagram caption for this carousel post:
Topic: {topic}
Slides: {slide_text}

Requirements:
- 2-4 short paragraphs
- First line is the hook (grabs attention immediately)
- Include a CTA (save, share, follow)
- Add 15 relevant hashtags at the end
- Brand voice: confident, direct, no fluff
- Mention {BRAND_HANDLE}

Return ONLY the caption text, no other formatting."""

    return ask_ollama(prompt, model, SYSTEM_PROMPT, temperature=0.8)


# ══════════════════════════════════════════════
# AI IMAGE ENGINE (from ds_engine.py)
# ══════════════════════════════════════════════

def score_image(img):
    """Score image quality: brightness, contrast, sharpness."""
    try:
        stat = ImageStat.Stat(img.convert("L"))
        brightness = stat.mean[0] / 255.0
        contrast = stat.stddev[0] / 128.0
        edges = img.convert("L").filter(ImageFilter.FIND_EDGES)
        sharpness = ImageStat.Stat(edges).mean[0] / 128.0
        return brightness * 2.0 + contrast * 1.5 + sharpness * 1.0
    except:
        return 0


def generate_character(name, prompt_text, output_dir):
    """Generate a character with multi-seed selection."""
    os.makedirs(output_dir, exist_ok=True)
    out_path = f"{output_dir}/{name}.png"
    if os.path.exists(out_path):
        print(f"      Cached: {name}")
        return out_path

    best_img = None
    best_score = -1

    for attempt in range(ATTEMPTS_PER_CHAR):
        seed = random.randint(1000, 99999)
        url = f"https://image.pollinations.ai/prompt/{urllib.parse.quote(prompt_text)}?width={GEN_SIZE}&height={GEN_SIZE}&model=flux&nologo=true&seed={seed}"
        try:
            tmp = f"{output_dir}/_tmp_{name}_{attempt}.png"
            urllib.request.urlretrieve(url, tmp)
            img = Image.open(tmp).convert("RGB")
            s = score_image(img)
            print(f"      {name} seed={seed}: score={s:.2f}", end="")
            if s > best_score:
                best_score = s
                best_img = img
                print(" BEST", end="")
            print()
            os.remove(tmp)
        except Exception as e:
            print(f"      {name} attempt {attempt}: {e}")

    if best_img:
        # Post-process: resize, brightness, contrast, B&W
        best_img = best_img.resize((SLIDE_W, SLIDE_H), Image.LANCZOS)
        best_img = ImageEnhance.Brightness(best_img).enhance(1.35)
        best_img = ImageEnhance.Contrast(best_img).enhance(1.25)
        best_img = ImageEnhance.Sharpness(best_img).enhance(1.6)
        gray = best_img.convert("L").convert("RGB")
        best_img = Image.blend(best_img, gray, 0.85)
        best_img = ImageEnhance.Contrast(best_img).enhance(1.15)
        best_img.save(out_path, quality=95)
        print(f"      Saved: {name} (score: {best_score:.2f})")
        return out_path
    return None


# ══════════════════════════════════════════════
# CAROUSEL SLIDE BUILDER
# ══════════════════════════════════════════════

def draw_vignette(img, strength=0.4):
    """Draw edge vignette."""
    w, h = img.size
    arr = np.array(img).astype(np.float32)
    cx, cy = w // 2, h // 2
    max_d = math.sqrt(cx**2 + cy**2)
    y, x = np.ogrid[:h, :w]
    dist = np.sqrt((x - cx)**2 + (y - cy)**2) / max_d
    mask = 1 - strength * (dist ** 1.8)
    mask = np.clip(mask, 0, 1)
    for c in range(3):
        arr[:,:,c] *= mask
    return Image.fromarray(arr.astype(np.uint8))


def build_slide_cover(topic, hook_text, char_path=None):
    """Build the cover/hook slide."""
    img = Image.new("RGB", (SLIDE_W, SLIDE_H), BLACK)
    draw = ImageDraw.Draw(img)

    # Character background
    if char_path and os.path.exists(char_path):
        ch = Image.open(char_path).convert("RGB")
        ch = ch.resize((SLIDE_W, SLIDE_H), Image.LANCZOS)
        ch = ImageEnhance.Brightness(ch).enhance(0.6)
        img.paste(ch)
        draw = ImageDraw.Draw(img)
        # Gradient overlay
        for y in range(SLIDE_H // 3, SLIDE_H):
            t = (y - SLIDE_H // 3) / (SLIDE_H * 2 // 3)
            a = int(230 * t)
            draw.line([(0, y), (SLIDE_W, y)], fill=(0, 0, 0))
        draw = ImageDraw.Draw(img)

    # Hook text
    hf = H_FONT(110)
    lines = []
    words = hook_text.upper().split()
    cur = ""
    for w in words:
        test = f"{cur} {w}".strip()
        bb = draw.textbbox((0, 0), test, font=hf)
        if bb[2] - bb[0] <= SLIDE_W - 120:
            cur = test
        else:
            if cur: lines.append(cur)
            cur = w
    if cur: lines.append(cur)

    total_h = len(lines) * 115
    y = (SLIDE_H - total_h) // 2 + (100 if char_path else 0)
    for ln in lines:
        bb = draw.textbbox((0, 0), ln, font=hf)
        x = (SLIDE_W - (bb[2] - bb[0])) // 2
        # Shadow
        for dx in range(-4, 5):
            for dy in range(-4, 5):
                if dx*dx + dy*dy <= 16:
                    draw.text((x+dx, y+dy), ln, font=hf, fill=(0, 0, 0))
        draw.text((x, y), ln, font=hf, fill=WHITE)
        y += 115

    # Brand watermark
    bf = B_FONT(24)
    draw.text((SLIDE_W // 2 - 90, SLIDE_H - 80), BRAND_HANDLE, font=bf, fill=(60, 60, 60))

    img = draw_vignette(img)
    return img


def build_slide_content(number, text, dark=True):
    """Build a content slide (numbered)."""
    bg = (5, 5, 5) if dark else (245, 245, 245)
    fg = WHITE if dark else BLACK
    accent = (180, 180, 180) if dark else (80, 80, 80)

    img = Image.new("RGB", (SLIDE_W, SLIDE_H), bg)
    draw = ImageDraw.Draw(img)

    # Number
    nf = H_FONT(220)
    num_str = f"{number:02d}" if isinstance(number, int) else str(number)
    bb = draw.textbbox((0, 0), num_str, font=nf)
    nx = (SLIDE_W - (bb[2] - bb[0])) // 2
    draw.text((nx, 120), num_str, font=nf, fill=fg)

    # Separator line
    draw.line([(200, 380), (SLIDE_W - 200, 380)], fill=accent, width=2)

    # Text
    tf = H_FONT(70)
    words = text.upper().split()
    lines = []
    cur = ""
    for w in words:
        test = f"{cur} {w}".strip()
        bb = draw.textbbox((0, 0), test, font=tf)
        if bb[2] - bb[0] <= SLIDE_W - 140:
            cur = test
        else:
            if cur: lines.append(cur)
            cur = w
    if cur: lines.append(cur)

    ty = 430
    for ln in lines:
        bb = draw.textbbox((0, 0), ln, font=tf)
        tx = (SLIDE_W - (bb[2] - bb[0])) // 2
        draw.text((tx, ty), ln, font=tf, fill=fg)
        ty += 85

    # Brand
    bf = B_FONT(22)
    draw.text((SLIDE_W // 2 - 90, SLIDE_H - 80), BRAND_HANDLE, font=bf, fill=accent)

    if dark:
        img = draw_vignette(img, 0.25)
    return img


def build_slide_cta():
    """Build the CTA (last) slide."""
    img = Image.new("RGB", (SLIDE_W, SLIDE_H), BLACK)
    draw = ImageDraw.Draw(img)

    # DS logo
    lf = H_FONT(200)
    bb = draw.textbbox((0, 0), "DS", font=lf)
    lx = (SLIDE_W - (bb[2] - bb[0])) // 2
    draw.text((lx, 200), "DS", font=lf, fill=WHITE)

    # MARKETING
    mf = H_FONT(60)
    bb = draw.textbbox((0, 0), "MARKETING", font=mf)
    mx = (SLIDE_W - (bb[2] - bb[0])) // 2
    draw.text((mx, 430), "MARKETING", font=mf, fill=LIGHT_GRAY)

    # Line
    draw.line([(250, 520), (SLIDE_W - 250, 520)], fill=WHITE, width=2)

    # Handle
    hf = B_FONT(38)
    bb = draw.textbbox((0, 0), BRAND_HANDLE, font=hf)
    hx = (SLIDE_W - (bb[2] - bb[0])) // 2
    draw.text((hx, 560), BRAND_HANDLE, font=hf, fill=WHITE)

    # CTA
    cf = H_FONT(55)
    cta = "FOLLOW FOR MORE"
    bb = draw.textbbox((0, 0), cta, font=cf)
    cx = (SLIDE_W - (bb[2] - bb[0])) // 2
    draw.text((cx, 700), cta, font=cf, fill=LIGHT_GRAY)

    img = draw_vignette(img, 0.3)
    return img


# ══════════════════════════════════════════════
# VIDEO / REEL ENGINE (from ds_reels.py)
# ══════════════════════════════════════════════

class Particle:
    def __init__(self, rng, w, h):
        self.w, self.h = w, h
        self.x = rng.randint(0, w)
        self.y = rng.randint(0, h)
        self.r = rng.randint(3, 18)
        self.alpha = rng.randint(10, 40)
        self.vx = rng.uniform(-0.3, 0.3)
        self.vy = rng.uniform(-0.5, -0.1)
        self.pulse_speed = rng.uniform(0.5, 2.0)
        self.pulse_offset = rng.uniform(0, 6.28)

    def update(self, dt):
        self.x += self.vx * dt * 60
        self.y += self.vy * dt * 60
        if self.y < -20: self.y = self.h + 20
        if self.x < -20: self.x = self.w + 20
        if self.x > self.w + 20: self.x = -20

    def draw(self, arr, t):
        pulse = 0.6 + 0.4 * math.sin(t * self.pulse_speed + self.pulse_offset)
        a = int(self.alpha * pulse)
        r = self.r
        ix, iy = int(self.x), int(self.y)
        for dy in range(-r, r + 1):
            for dx in range(-r, r + 1):
                dist = math.sqrt(dx*dx + dy*dy)
                if dist <= r:
                    px, py = ix + dx, iy + dy
                    if 0 <= px < self.w and 0 <= py < self.h:
                        falloff = 1 - (dist / r)
                        blend = a * falloff * falloff / 255
                        arr[py, px] = np.clip(
                            arr[py, px] + np.array([255*blend, 255*blend, 255*blend]),
                            0, 255
                        ).astype(np.uint8)


def ease_out(t):
    return 1 - (1 - min(1, max(0, t))) ** 3

def ease_in_out(t):
    t = min(1, max(0, t))
    if t < 0.5:
        return 4 * t * t * t
    return 1 - (-2 * t + 2) ** 3 / 2


def render_text_centered(draw, y, text, font, alpha=255, w=REEL_W):
    bb = draw.textbbox((0, 0), text, font=font)
    x = (w - (bb[2] - bb[0])) // 2
    c = max(0, min(255, alpha))
    for ddx in range(-3, 4):
        for ddy in range(-3, 4):
            if ddx*ddx + ddy*ddy <= 9:
                draw.text((x+ddx, y+ddy), text, font=font, fill=(0, 0, 0))
    draw.text((x, y), text, font=font, fill=(c, c, c))


def render_scene_frame(scene, t, dur, particles, w=REEL_W, h=REEL_H):
    img = Image.new("RGB", (w, h), BLACK)

    # Animated background glow
    pulse = 0.5 + 0.5 * math.sin(t * 0.8)
    glow_v = int(6 + 8 * pulse)
    cx, cy = w // 2, int(h * 0.4)
    draw = ImageDraw.Draw(img)

    for y_pos in range(0, h, 6):
        for x_pos in range(0, w, 6):
            d = math.sqrt((x_pos - cx)**2 + (y_pos - cy)**2)
            tt = min(1.0, d / (max(w, h) * 0.45))
            v = int(glow_v * (1 - tt**1.3))
            if v > 0:
                for ddy in range(6):
                    for ddx in range(6):
                        if y_pos+ddy < h and x_pos+ddx < w:
                            img.putpixel((x_pos+ddx, y_pos+ddy), (v, v, v))

    draw = ImageDraw.Draw(img)
    progress = t / dur if dur > 0 else 1.0
    scene_type = scene.get("type", "text")

    if scene_type == "title":
        lines = scene.get("lines", [])
        sub = scene.get("sub")
        stagger = 0.4
        hf = H_FONT(90)
        y_start = int(h * 0.35)

        for i, ln in enumerate(lines):
            line_start = i * stagger
            lp = max(0, min(1, (t - line_start) / 0.4))
            alpha = int(255 * ease_out(lp))
            y_off = int(30 * (1 - ease_out(lp)))
            if alpha > 0:
                render_text_centered(draw, y_start + i * 105 + y_off, ln, hf, alpha, w)

        if sub:
            sub_start = len(lines) * stagger + 0.3
            sp = max(0, min(1, (t - sub_start) / 0.5))
            if sp > 0:
                sf = R_FONT(38)
                c = int(190 * ease_out(sp))
                bb = draw.textbbox((0, 0), sub, font=sf)
                sx = (w - (bb[2] - bb[0])) // 2
                draw.text((sx, y_start + len(lines) * 105 + 40), sub, font=sf, fill=(c, c, c))

    elif scene_type == "number":
        num = scene.get("num", 1)
        title = scene.get("title", "")
        sub = scene.get("sub")

        np_ = min(1.0, t / 0.5)
        ns = ease_out(np_)
        na = int(255 * ns)

        if na > 5:
            num_s = f"{num:02d}" if isinstance(num, int) else str(num)
            fs = int(280 * ns)
            if fs > 20:
                nf = H_FONT(max(20, fs))
                bb = draw.textbbox((0, 0), num_s, font=nf)
                nx = (w - (bb[2] - bb[0])) // 2
                ny = int(h * 0.2) + int(40 * (1 - ns))
                c = min(255, na)
                for ddx in range(-4, 5):
                    for ddy in range(-4, 5):
                        if ddx*ddx + ddy*ddy <= 16:
                            draw.text((nx+ddx, ny+ddy), num_s, font=nf, fill=(0,0,0))
                draw.text((nx, ny), num_s, font=nf, fill=(c, c, c))

        lp = max(0, min(1, (t - 0.5) / 0.3))
        if lp > 0:
            lw = int((w - 400) * ease_out(lp))
            lx = (w - lw) // 2
            ly = int(h * 0.48)
            draw.line([(lx, ly), (lx + lw, ly)], fill=WHITE, width=2)

        tp = max(0, min(1, (t - 0.7) / 0.4))
        if tp > 0:
            tf = H_FONT(60)
            ta = int(255 * ease_out(tp))
            y_off = int(20 * (1 - ease_out(tp)))
            words = title.upper().split()
            lines_t = []
            cur = ""
            for ww in words:
                test = f"{cur} {ww}".strip()
                if draw.textbbox((0, 0), test, font=tf)[2] <= w - 120: cur = test
                else:
                    if cur: lines_t.append(cur)
                    cur = ww
            if cur: lines_t.append(cur)
            ty = int(h * 0.5) + 20 + y_off
            for ln in lines_t:
                render_text_centered(draw, ty, ln, tf, ta, w)
                ty += 72

        if sub:
            sp = max(0, min(1, (t - 1.0) / 0.4))
            if sp > 0:
                sf = R_FONT(32)
                c = int(190 * ease_out(sp))
                words = sub.split()
                lines_s = []
                cur = ""
                for ww in words:
                    test = f"{cur} {ww}".strip()
                    if draw.textbbox((0, 0), test, font=sf)[2] <= w - 140: cur = test
                    else:
                        if cur: lines_s.append(cur)
                        cur = ww
                if cur: lines_s.append(cur)
                sy = int(h * 0.68)
                for sl in lines_s:
                    bb = draw.textbbox((0, 0), sl, font=sf)
                    sx = (w - (bb[2] - bb[0])) // 2
                    draw.text((sx, sy), sl, font=sf, fill=(c, c, c))
                    sy += 44

    elif scene_type == "day":
        day = scene.get("day", "")
        desc = scene.get("desc", "")
        dp = min(1.0, t / 0.5)
        ds = ease_out(dp)
        fs = int(120 * ds)
        if fs > 20:
            df = H_FONT(max(20, fs))
            c = int(255 * ds)
            bb = draw.textbbox((0, 0), day.upper(), font=df)
            dx = (w - (bb[2] - bb[0])) // 2
            dy = int(h * 0.32) + int(30 * (1 - ds))
            for ddx in range(-3, 4):
                for ddy in range(-3, 4):
                    if ddx*ddx + ddy*ddy <= 9:
                        draw.text((dx+ddx, dy+ddy), day.upper(), font=df, fill=(0,0,0))
            draw.text((dx, dy), day.upper(), font=df, fill=(c, c, c))

        lp = max(0, min(1, (t - 0.4) / 0.3))
        if lp > 0:
            lw = int((w - 360) * ease_out(lp))
            lx = (w - lw) // 2
            ly = int(h * 0.46)
            draw.line([(lx, ly), (lx + lw, ly)], fill=WHITE, width=1)

        desc_p = max(0, min(1, (t - 0.6) / 0.4))
        if desc_p > 0:
            sf = R_FONT(36)
            c = int(190 * ease_out(desc_p))
            y_off = int(20 * (1 - ease_out(desc_p)))
            words = desc.split()
            lines_d = []
            cur = ""
            for ww in words:
                test = f"{cur} {ww}".strip()
                if draw.textbbox((0, 0), test, font=sf)[2] <= w - 140: cur = test
                else:
                    if cur: lines_d.append(cur)
                    cur = ww
            if cur: lines_d.append(cur)
            sy = int(h * 0.49) + y_off
            for sl in lines_d:
                bb = draw.textbbox((0, 0), sl, font=sf)
                sx = (w - (bb[2] - bb[0])) // 2
                draw.text((sx, sy), sl, font=sf, fill=(c, c, c))
                sy += 50

    elif scene_type == "cta":
        pulse_a = 0.7 + 0.3 * math.sin(t * 2)
        dp = min(1.0, t / 0.6)
        ds = ease_out(dp)
        fs = int(180 * ds)
        if fs > 20:
            dsf = H_FONT(max(20, fs))
            c = int(255 * ds * pulse_a)
            bb = draw.textbbox((0, 0), "DS", font=dsf)
            dx = (w - (bb[2] - bb[0])) // 2
            dy = int(h * 0.26) + int(40 * (1 - ds))
            for ddx in range(-4, 5):
                for ddy in range(-4, 5):
                    if ddx*ddx + ddy*ddy <= 16:
                        draw.text((dx+ddx, dy+ddy), "DS", font=dsf, fill=(0,0,0))
            draw.text((dx, dy), "DS", font=dsf, fill=(c, c, c))

        mp = max(0, min(1, (t - 0.4) / 0.4))
        if mp > 0:
            mf = H_FONT(65)
            c = int(190 * ease_out(mp))
            render_text_centered(draw, int(h * 0.42), "MARKETING", mf, c, w)

        lp = max(0, min(1, (t - 0.7) / 0.3))
        if lp > 0:
            lw = int(500 * ease_out(lp))
            lx = (w - lw) // 2
            draw.line([(lx, int(h*0.5)), (lx+lw, int(h*0.5))], fill=WHITE, width=2)

        hp = max(0, min(1, (t - 0.9) / 0.3))
        if hp > 0:
            hf = B_FONT(34)
            c = int(255 * ease_out(hp))
            bb = draw.textbbox((0,0), BRAND_HANDLE, font=hf)
            hx = (w - (bb[2]-bb[0])) // 2
            draw.text((hx, int(h*0.54)), BRAND_HANDLE, font=hf, fill=(c,c,c))

        fp = max(0, min(1, (t - 1.1) / 0.4))
        if fp > 0:
            ff = H_FONT(50)
            c = int(255 * ease_out(fp))
            render_text_centered(draw, int(h*0.68), "FOLLOW FOR MORE", ff, c, w)

    else:
        lines = scene.get("lines", [])
        sub = scene.get("sub")
        stagger = 0.35
        hf = H_FONT(80)
        y_start = (h - len(lines) * 100) // 2 - 50
        for i, ln in enumerate(lines):
            ls = i * stagger
            lp = max(0, min(1, (t - ls) / 0.4))
            alpha = int(255 * ease_out(lp))
            y_off = int(25 * (1 - ease_out(lp)))
            if alpha > 0:
                render_text_centered(draw, y_start + i * 100 + y_off, ln, hf, alpha, w)
        if sub:
            ss = len(lines) * stagger + 0.3
            sp = max(0, min(1, (t - ss) / 0.5))
            if sp > 0:
                sf = R_FONT(34)
                c = int(190 * ease_out(sp))
                bb = draw.textbbox((0,0), sub, font=sf)
                sx = (w - (bb[2]-bb[0])) // 2
                draw.text((sx, y_start + len(lines)*100 + 50), sub, font=sf, fill=(c,c,c))

    # Watermark
    bf = B_FONT(22)
    draw.text((w//2 - 90, h - 140), BRAND_HANDLE, font=bf, fill=(50, 50, 50))

    # Scene fade
    arr = np.array(img)
    if t < 0.3:
        arr = (arr * (t / 0.3)).astype(np.uint8)
    if dur - t < 0.3:
        arr = (arr * ((dur - t) / 0.3)).astype(np.uint8)

    for p in particles:
        p.update(1.0 / FPS)
        p.draw(arr, t)

    return arr


# ══════════════════════════════════════════════
# VOICE ENGINE
# ══════════════════════════════════════════════
def setup_voice():
    try:
        ensure("edge_tts", "edge-tts")
        import edge_tts as et
        return True
    except:
        return False

async def _gen_voice(text, path, voice, rate):
    import edge_tts
    c = edge_tts.Communicate(text, voice, rate=rate)
    await c.save(path)

def make_voice(text, path):
    import asyncio
    if os.path.exists(path) and os.path.getsize(path) > 1000:
        return True
    for v in [VOICE, "en-US-GuyNeural", "en-US-ChristopherNeural", "en-US-EricNeural"]:
        try:
            asyncio.run(_gen_voice(text, path, v, "-8%"))
            if os.path.exists(path) and os.path.getsize(path) > 1000:
                return True
        except:
            continue
    return False


# ══════════════════════════════════════════════
# MUSIC ENGINE
# ══════════════════════════════════════════════
def make_music(path, duration=45, sr=44100):
    if os.path.exists(path) and os.path.getsize(path) > 5000:
        return True
    try:
        import wave
        t = np.linspace(0, duration, int(sr * duration), endpoint=False)
        audio = (0.18 * np.sin(2*np.pi*36*t) +
                 0.12 * np.sin(2*np.pi*55*t) +
                 0.08 * np.sin(2*np.pi*82.5*t) +
                 0.05 * np.sin(2*np.pi*110*t) +
                 0.07 * np.sin(2*np.pi*146.8*t) * (0.4 + 0.6*np.sin(2*np.pi*0.08*t)) +
                 0.04 * np.sin(2*np.pi*220*t) * (0.3 + 0.4*np.sin(2*np.pi*0.05*t)) +
                 0.015 * np.sin(2*np.pi*660*t) * (0.2 + 0.3*np.sin(2*np.pi*0.12*t)) +
                 0.06 * np.sin(2*np.pi*73.4*t) * np.abs(np.sin(2*np.pi*0.5*t))**4)
        fade = int(sr * 3)
        audio[:fade] *= np.linspace(0, 1, fade)
        audio[-fade:] *= np.linspace(1, 0, fade)
        audio = (audio / np.max(np.abs(audio)) * 0.35 * 32767).astype(np.int16)
        with wave.open(path, 'w') as wf:
            wf.setnchannels(1); wf.setsampwidth(2); wf.setframerate(sr)
            wf.writeframes(audio.tobytes())
        return True
    except Exception as e:
        print(f"    ! music: {e}")
        return False


# ══════════════════════════════════════════════
# VIDEO BUILDER
# ══════════════════════════════════════════════
def build_reel(reel_data, voice_path, music_path, output_path):
    """Build a complete animated reel."""
    try:
        try:
            from moviepy import ImageSequenceClip, AudioFileClip, CompositeAudioClip
        except ImportError:
            from moviepy.editor import ImageSequenceClip, AudioFileClip, CompositeAudioClip
    except:
        print("    ! moviepy not available — skipping video")
        return False

    rng = random.Random(42)
    particles = [Particle(rng, REEL_W, REEL_H) for _ in range(25)]
    scenes = reel_data["scenes"]

    all_frames = []
    for sc_idx, sc in enumerate(scenes):
        dur = sc.get("dur", sc.get("duration", 3))
        n_frames = int(dur * FPS)
        print(f"      scene {sc_idx+1}/{len(scenes)}: {n_frames} frames ({dur}s)...", end=" ", flush=True)
        for f_idx in range(n_frames):
            t = f_idx / FPS
            frame = render_scene_frame(sc, t, dur, particles)
            all_frames.append(frame)
        print("done")

    print(f"    Total: {len(all_frames)} frames ({len(all_frames)/FPS:.1f}s)")
    print(f"    Encoding...")

    temp_dir = f"{OUT}/_frames"
    os.makedirs(temp_dir, exist_ok=True)
    frame_paths = []
    for i, frame in enumerate(all_frames):
        p = f"{temp_dir}/f_{i:05d}.png"
        Image.fromarray(frame).save(p, quality=90)
        frame_paths.append(p)

    video = ImageSequenceClip(frame_paths, fps=FPS)

    audio_tracks = []
    if voice_path and os.path.exists(voice_path):
        try:
            va = AudioFileClip(voice_path)
            if va.duration > video.duration:
                try: va = va.subclipped(0, video.duration)
                except: va = va.subclip(0, video.duration)
            audio_tracks.append(va)
        except: pass

    if music_path and os.path.exists(music_path):
        try:
            mus = AudioFileClip(music_path)
            if mus.duration > video.duration:
                try: mus = mus.subclipped(0, video.duration)
                except: mus = mus.subclip(0, video.duration)
            vol = 0.25 if audio_tracks else 0.5
            try:
                from moviepy.audio.fx import MultiplyVolume
                mus = mus.with_effects([MultiplyVolume(factor=vol)])
            except:
                try: mus = mus.volumex(vol)
                except: pass
            audio_tracks.append(mus)
        except: pass

    if audio_tracks:
        if len(audio_tracks) > 1:
            video = video.with_audio(CompositeAudioClip(audio_tracks))
        else:
            video = video.with_audio(audio_tracks[0])

    video.write_videofile(output_path, fps=FPS, codec="libx264", audio_codec="aac", logger=None)

    for p in frame_paths:
        try: os.remove(p)
        except: pass
    try: os.rmdir(temp_dir)
    except: pass

    print(f"    Saved: {os.path.basename(output_path)}")
    return True


# ══════════════════════════════════════════════
# MAIN PIPELINE
# ══════════════════════════════════════════════

def main():
    print()
    print("  ╔══════════════════════════════════════════════════════╗")
    print("  ║  DS MARKETING AI BRAIN v1.0                         ║")
    print("  ║  Powered by Ollama — Your Local AI                  ║")
    print("  ║  No Cloud. No API Keys. 100% Yours.                 ║")
    print("  ╚══════════════════════════════════════════════════════╝")
    print()

    os.makedirs(OUT, exist_ok=True)
    os.makedirs(f"{OUT}/carousels", exist_ok=True)
    os.makedirs(f"{OUT}/reels", exist_ok=True)
    os.makedirs(f"{OUT}/reels/audio", exist_ok=True)
    os.makedirs(f"{OUT}/characters", exist_ok=True)
    os.makedirs(f"{OUT}/captions", exist_ok=True)

    # ─── STEP 1: Connect to Ollama ───
    print("  STEP 1: Connecting to Ollama")
    print("  " + "─" * 54)

    if not check_ollama():
        print()
        print("  ⚠  Ollama is not running!")
        print()
        print("  To set up Ollama:")
        print("    1. Download from: https://ollama.com/download")
        print("    2. Install and open the Ollama app")
        print("    3. Run this script again")
        print()
        print("  Ollama runs AI models locally on your Mac.")
        print("  No cloud. No subscriptions. Completely free.")
        print()
        return

    print("    ✓ Ollama is running")
    model = find_or_pull_model()
    if not model:
        print("    ✗ No model available. Run: ollama pull mistral")
        return
    print()

    # ─── STEP 2: Generate Content Plan ───
    print("  STEP 2: AI Content Generation (Ollama)")
    print("  " + "─" * 54)

    print("    Generating carousel topics...")
    carousels = generate_carousel_topics(model, 5)
    if carousels:
        print(f"    ✓ {len(carousels)} carousel topics generated")
        for i, c in enumerate(carousels):
            print(f"      {i+1}. {c.get('topic', 'untitled')}")
    else:
        print("    ! Carousel generation failed — using defaults")
        carousels = [
            {"topic": "5 Social Media Mistakes Killing Your Growth", "hook": "YOUR GROWTH IS DYING.", "slides": ["No Content Strategy", "Ignoring Analytics", "Posting Without Hooks", "Zero Engagement", "No Distribution Plan"], "caption": "Stop making these mistakes. Your competitors aren't.", "hashtags": "#socialmedia #marketing #growth"},
            {"topic": "The Content Calendar That Actually Works", "hook": "STOP POSTING RANDOMLY.", "slides": ["Monday: Education", "Tuesday: Industry News", "Wednesday: Case Studies", "Thursday: Behind The Scenes", "Friday: Engagement"], "caption": "Framework beats random every time. Save this.", "hashtags": "#contentcalendar #marketing #socialmedia"},
            {"topic": "Hook Writing Formula for Instagram", "hook": "YOUR HOOKS ARE WEAK.", "slides": ["Start With a Number", "Ask a Question", "Make a Bold Claim", "Use Power Words", "Create Urgency"], "caption": "Master the hook. Master the scroll. Save this formula.", "hashtags": "#hooks #instagram #copywriting"},
            {"topic": "How To 10X Your Instagram Engagement", "hook": "ZERO ENGAGEMENT?", "slides": ["Reply to Every Comment", "Use Carousel Posts", "Write Better Captions", "Post at Peak Times", "Create Shareable Content"], "caption": "Engagement isn't luck. It's strategy.", "hashtags": "#engagement #instagram #marketing"},
            {"topic": "Brand Identity Checklist", "hook": "YOU DON'T HAVE A BRAND.", "slides": ["Define Your Voice", "Choose 2-3 Colors", "Pick Your Fonts", "Write Your Bio", "Create Templates"], "caption": "If they can't recognize you in 2 seconds, you don't have a brand.", "hashtags": "#branding #identity #marketing"},
        ]

    print()
    print("    Generating reel scripts...")
    reels = generate_reel_scripts(model, 3)
    if reels:
        print(f"    ✓ {len(reels)} reel scripts generated")
        for i, r in enumerate(reels):
            print(f"      {i+1}. {r.get('title', 'untitled')}")
    else:
        print("    ! Reel generation failed — using defaults")
        reels = [
            {
                "title": "The Hook Formula",
                "voice_text": "Your hook... is everything. Three seconds. That's all you get... to stop the scroll... or lose them forever. Here's the formula that works... every single time. Start with a bold statement... something they can't ignore. Then add urgency... why should they care right now? And finish with a promise... what will they learn? Master this... and you'll never struggle with engagement again. Follow DS Marketing... for more.",
                "scenes": [
                    {"type": "title", "lines": ["YOUR HOOK IS", "EVERYTHING."], "sub": "3 seconds to stop the scroll.", "dur": 4.5},
                    {"type": "number", "num": 1, "title": "Bold Statement", "sub": "Something they can't ignore.", "dur": 3.5},
                    {"type": "number", "num": 2, "title": "Add Urgency", "sub": "Why should they care right now?", "dur": 3.5},
                    {"type": "number", "num": 3, "title": "Make a Promise", "sub": "What will they learn?", "dur": 3.5},
                    {"type": "text", "lines": ["MASTER THIS.", "NEVER STRUGGLE", "AGAIN."], "dur": 4},
                    {"type": "cta", "dur": 4},
                ],
            },
            {
                "title": "Content That Converts",
                "voice_text": "Stop creating content... that nobody saves. If people aren't saving your posts... they're not valuable enough. Here's what actually converts... Education posts... teach something specific. Carousel posts... get the highest saves. Controversial takes... spark conversations. And transformation posts... show the before and after. Create content worth saving... DS Marketing.",
                "scenes": [
                    {"type": "title", "lines": ["STOP CREATING", "CONTENT NOBODY", "SAVES."], "dur": 4},
                    {"type": "text", "lines": ["IF THEY DON'T", "SAVE IT..."], "sub": "It's not valuable enough.", "dur": 3.5},
                    {"type": "number", "num": 1, "title": "Education Posts", "sub": "Teach something specific.", "dur": 3},
                    {"type": "number", "num": 2, "title": "Carousel Posts", "sub": "Highest save rate on Instagram.", "dur": 3},
                    {"type": "number", "num": 3, "title": "Controversial Takes", "sub": "Spark real conversations.", "dur": 3},
                    {"type": "number", "num": 4, "title": "Transformation Posts", "sub": "Show before and after.", "dur": 3},
                    {"type": "cta", "dur": 4},
                ],
            },
            {
                "title": "Algorithm Secrets",
                "voice_text": "The algorithm isn't against you... you're just not speaking its language. Here's what it actually wants... Watch time... Keep people on your content longer. Saves and shares... These matter more than likes. Consistency... Post at least four times a week. And conversations... Real comments, not just emojis. Give the algorithm what it wants... and it will reward you. DS Marketing.",
                "scenes": [
                    {"type": "title", "lines": ["THE ALGORITHM", "ISN'T AGAINST", "YOU."], "sub": "You're not speaking its language.", "dur": 4.5},
                    {"type": "number", "num": 1, "title": "Watch Time", "sub": "Keep them on your content longer.", "dur": 3.5},
                    {"type": "number", "num": 2, "title": "Saves & Shares", "sub": "These matter more than likes.", "dur": 3.5},
                    {"type": "number", "num": 3, "title": "Consistency", "sub": "At least 4 times a week.", "dur": 3.5},
                    {"type": "number", "num": 4, "title": "Conversations", "sub": "Real comments, not emojis.", "dur": 3.5},
                    {"type": "cta", "dur": 4},
                ],
            },
        ]

    print()
    print("    Generating character prompts...")
    char_prompts = generate_character_prompts(model, 5)
    if char_prompts:
        print(f"    ✓ {len(char_prompts)} character prompts generated")
    else:
        print("    ! Using default character prompts")
        char_prompts = [
            {"name": "strategist", "prompt": "Professional male marketing strategist in dark suit, BRIGHTLY lit face, pure solid black background, arms crossed confidently, ultra-realistic, 8K, studio photography, cinematic lighting, dramatic rim lighting, high contrast black and white"},
            {"name": "analyst", "prompt": "Professional female data analyst with glasses, BRIGHTLY lit face, pure solid black background, looking at camera with confident smile, ultra-realistic, 8K, studio photography, cinematic lighting, dramatic rim lighting, high contrast black and white"},
            {"name": "creative", "prompt": "Young creative director with modern hairstyle, BRIGHTLY lit face, pure solid black background, holding a tablet, ultra-realistic, 8K, studio photography, cinematic lighting, dramatic rim lighting, high contrast black and white"},
            {"name": "executive", "prompt": "CEO in premium black turtleneck, BRIGHTLY lit face, pure solid black background, hands together in thinking pose, ultra-realistic, 8K, studio photography, cinematic lighting, dramatic rim lighting, high contrast black and white"},
            {"name": "presenter", "prompt": "Professional female presenter in elegant black blazer, BRIGHTLY lit face, pure solid black background, gesturing while speaking, ultra-realistic, 8K, studio photography, cinematic lighting, dramatic rim lighting, high contrast black and white"},
        ]

    # Save AI output
    with open(f"{OUT}/ai_content_plan.json", "w") as f:
        json.dump({"carousels": carousels, "reels": reels, "characters": char_prompts}, f, indent=2)
    print(f"    ✓ Content plan saved: {OUT}/ai_content_plan.json")
    print()

    # ─── STEP 3: Generate Characters ───
    print("  STEP 3: AI Character Generation")
    print("  " + "─" * 54)
    char_dir = f"{OUT}/characters"
    for cp in char_prompts:
        name = cp.get("name", "char")
        prompt = cp.get("prompt", "professional person, studio lighting, black background")
        print(f"    Generating: {name}")
        generate_character(name, prompt, char_dir)
    print()

    # ─── STEP 4: Build Carousels ───
    print("  STEP 4: Building Carousels")
    print("  " + "─" * 54)

    char_files = [f for f in os.listdir(char_dir) if f.endswith(".png")]

    for idx, carousel in enumerate(carousels):
        topic = carousel.get("topic", f"Post {idx+1}")
        hook = carousel.get("hook", topic.upper())
        slides_text = carousel.get("slides", [])
        caption = carousel.get("caption", "")
        hashtags = carousel.get("hashtags", "")

        post_dir = f"{OUT}/carousels/post_{idx+1:02d}"
        os.makedirs(post_dir, exist_ok=True)

        print(f"    Post {idx+1}: {topic}")

        # Cover slide with character
        char_path = None
        if char_files:
            char_path = f"{char_dir}/{char_files[idx % len(char_files)]}"
        cover = build_slide_cover(topic, hook, char_path)
        cover.save(f"{post_dir}/01_cover.png", quality=95)

        # Content slides
        for si, slide_text in enumerate(slides_text):
            dark = (si % 2 == 0)
            slide = build_slide_content(si + 1, slide_text, dark)
            slide.save(f"{post_dir}/{si+2:02d}_slide.png", quality=95)

        # CTA slide
        cta = build_slide_cta()
        cta.save(f"{post_dir}/{len(slides_text)+2:02d}_cta.png", quality=95)

        # Save caption
        full_caption = f"{caption}\n\n{hashtags}\n\n{BRAND_HANDLE}"
        with open(f"{post_dir}/caption.txt", "w") as f:
            f.write(full_caption)

        # Also save to captions dir
        with open(f"{OUT}/captions/post_{idx+1:02d}.txt", "w") as f:
            f.write(f"TOPIC: {topic}\n\n{full_caption}")

        print(f"      ✓ {len(slides_text) + 2} slides + caption")

    print()

    # ─── STEP 5: Build Reels ───
    print("  STEP 5: Building Animated Reels")
    print("  " + "─" * 54)

    has_voice = setup_voice()
    try:
        ensure("moviepy")
        has_moviepy = True
    except:
        has_moviepy = False

    if not has_moviepy:
        print("    ! moviepy not available — skipping video generation")
        print("    Install it: pip install moviepy")
    else:
        music_path = f"{OUT}/reels/audio/cinematic_bg.wav"
        print("    Generating music...")
        make_music(music_path, 50)

        for idx, reel in enumerate(reels):
            title = reel.get("title", f"Reel {idx+1}")
            print(f"\n    Reel {idx+1}: {title}")

            # Voice
            vp = f"{OUT}/reels/audio/reel_{idx+1:02d}_voice.mp3"
            if has_voice and reel.get("voice_text"):
                print(f"      Voice...")
                make_voice(reel["voice_text"], vp)
            else:
                vp = None

            # Ensure all scenes have "dur" key
            for sc in reel.get("scenes", []):
                if "dur" not in sc:
                    sc["dur"] = sc.get("duration", 3)

            # Build video
            print(f"      Rendering animation...")
            op = f"{OUT}/reels/reel_{idx+1:02d}_{title.lower().replace(' ', '_')}.mp4"
            try:
                build_reel(reel, vp, music_path, op)
            except Exception as e:
                print(f"      ! Error: {e}")
                import traceback
                traceback.print_exc()

    print()
    print("  ╔══════════════════════════════════════════════════════╗")
    print("  ║  ALL DONE — DS MARKETING AI BRAIN v1.0 COMPLETE     ║")
    print("  ╚══════════════════════════════════════════════════════╝")

    nc = len(carousels) if carousels else 0
    nr = len(reels) if reels else 0
    nch = len(char_prompts) if char_prompts else 0

    print(f"""
  Your content: {OUT}/

  CAROUSELS ({nc} posts):
     {OUT}/carousels/post_01/ ... post_{nc:02d}/
     Each has: cover, slides, CTA, caption.txt

  REELS ({nr} videos):
     {OUT}/reels/
     Animated MP4 with voiceover + music

  CHARACTERS ({nch} AI models):
     {OUT}/characters/

  CAPTIONS:
     {OUT}/captions/

  AI CONTENT PLAN:
     {OUT}/ai_content_plan.json

  HOW IT WORKS:
     Ollama (on your Mac) wrote all the content.
     No cloud. No API keys. 100% your AI.

  TO REGENERATE:
     python3 ds_brain.py

  Upload carousels and reels directly to Instagram.
""")


if __name__ == "__main__":
    main()
