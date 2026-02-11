#!/usr/bin/env python3
"""
DS MARKETING CAROUSEL PRO v1.0
═══════════════════════════════════════════════════════
Premium Instagram carousels rendered with real CSS.
Uses Playwright (headless Chrome) for Figma/Canva-quality output.

INSPIRED BY: Roman Knox | CashFish | Dark Gradients

FEATURES:
  - Google Fonts (Inter, Poppins) loaded automatically
  - CSS glassmorphism, gradients, shadows, glow effects
  - AI-generated backgrounds via Pollinations.ai
  - AI-written content via Ollama (local)
  - Retina 2x resolution output
  - 1080x1350 (4:5 Instagram recommended)

SETUP (one time):
  pip install playwright requests
  playwright install chromium

RUN:
  python3 ds_carousel_pro.py
"""

import os, sys, subprocess, json, random, time, base64, io
import urllib.request, urllib.parse

# ══════════════════════════════════════════════
# AUTO-INSTALL
# ══════════════════════════════════════════════
def ensure_pip(pkg, pip_name=None):
    try:
        __import__(pkg)
    except ImportError:
        print(f"  Installing {pip_name or pkg}...")
        subprocess.check_call([sys.executable, "-m", "pip", "install", pip_name or pkg],
                              stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)

ensure_pip("requests")

def setup_playwright():
    """Install playwright and chromium if needed."""
    try:
        from playwright.sync_api import sync_playwright
        return True
    except ImportError:
        print("  Installing playwright...")
        subprocess.check_call([sys.executable, "-m", "pip", "install", "playwright"],
                              stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        print("  Installing Chromium browser (~200MB, one time only)...")
        subprocess.check_call([sys.executable, "-m", "playwright", "install", "chromium"],
                              stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        try:
            from playwright.sync_api import sync_playwright
            return True
        except:
            return False

import requests


# ══════════════════════════════════════════════
# CONFIG
# ══════════════════════════════════════════════
W, H = 1080, 1350
OUT = "ds-marketing-pro"
OLLAMA_URL = "http://localhost:11434"
PREFERRED_MODELS = ["mistral", "llama3.2", "llama3.1", "gemma2", "phi3"]
BRAND_HANDLE = "@dsmarketing.agency"
BRAND_SITE = "dsmarketing.lovable.app"


# ══════════════════════════════════════════════
# OLLAMA — Local AI
# ══════════════════════════════════════════════
def check_ollama():
    try:
        return requests.get(OLLAMA_URL, timeout=5).status_code == 200
    except:
        return False

def find_model():
    try:
        available = [m["name"] for m in requests.get(f"{OLLAMA_URL}/api/tags", timeout=10).json().get("models", [])]
    except:
        return None
    for model in PREFERRED_MODELS:
        for avail in available:
            if model in avail:
                return avail
    return available[0] if available else None

def ask_ai_json(prompt, model, system=None):
    messages = []
    if system:
        messages.append({"role": "system", "content": system})
    messages.append({"role": "user", "content": prompt})
    try:
        r = requests.post(f"{OLLAMA_URL}/api/chat", json={
            "model": model, "messages": messages,
            "stream": False, "options": {"temperature": 0.6}
        }, timeout=180)
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
            return None
    except:
        return None


AI_SYSTEM = """You are the creative director for DS Marketing, a premium social media marketing agency.
Brand voice: confident, direct, authoritative, no fluff.
You write content that STOPS the scroll and DELIVERS real value."""


# ══════════════════════════════════════════════
# AI BACKGROUND GENERATION
# ══════════════════════════════════════════════
def generate_bg(prompt, path, w=1536, h=1920):
    """Generate AI background via Pollinations."""
    if os.path.exists(path) and os.path.getsize(path) > 5000:
        return path
    best_path = None
    best_size = 0
    for i in range(2):
        seed = random.randint(1000, 99999)
        url = f"https://image.pollinations.ai/prompt/{urllib.parse.quote(prompt)}?width={w}&height={h}&model=flux&nologo=true&seed={seed}"
        try:
            tmp = path + f"_tmp{i}.png"
            urllib.request.urlretrieve(url, tmp)
            sz = os.path.getsize(tmp)
            if sz > best_size:
                best_size = sz
                if best_path and best_path != tmp:
                    try: os.remove(best_path)
                    except: pass
                best_path = tmp
            else:
                os.remove(tmp)
            time.sleep(0.3)
        except:
            pass
    if best_path:
        os.rename(best_path, path)
        return path
    return None


def img_to_base64(path):
    """Convert image to base64 data URI for embedding in HTML."""
    if not path or not os.path.exists(path):
        return ""
    with open(path, "rb") as f:
        data = base64.b64encode(f.read()).decode()
    return f"data:image/png;base64,{data}"


# ══════════════════════════════════════════════
# HTML/CSS TEMPLATES — The Magic
# ══════════════════════════════════════════════

GOOGLE_FONTS = """
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;600;700;800;900&family=Poppins:wght@400;600;700;800;900&display=swap" rel="stylesheet">
"""

BASE_STYLE = """
* { margin: 0; padding: 0; box-sizing: border-box; }
body {
    width: 1080px;
    height: 1350px;
    overflow: hidden;
    font-family: 'Inter', sans-serif;
    -webkit-font-smoothing: antialiased;
}
.slide {
    width: 1080px;
    height: 1350px;
    position: relative;
    overflow: hidden;
}
"""


def html_cover(title_lines, subtitle, bg_base64="", number=None, page=1, total=8):
    """Cover slide — Roman Knox dark photo style."""
    # Build title HTML with largest word highlighted
    title_html = ""
    for line in title_lines:
        title_html += f'<div class="title-line">{line}</div>\n'

    number_html = ""
    if number:
        number_html = f'<div class="number-badge">{number}</div>'

    return f"""<!DOCTYPE html>
<html>
<head>
{GOOGLE_FONTS}
<style>
{BASE_STYLE}
.slide {{
    background: #000;
}}
.bg {{
    position: absolute;
    top: 0; left: 0; right: 0; bottom: 0;
    background-image: url('{bg_base64}');
    background-size: cover;
    background-position: center;
    filter: brightness(0.4) saturate(0.15) contrast(1.2);
}}
.bg-overlay {{
    position: absolute;
    top: 0; left: 0; right: 0; bottom: 0;
    background: linear-gradient(
        180deg,
        rgba(0,0,0,0.3) 0%,
        rgba(0,0,0,0.1) 30%,
        rgba(0,0,0,0.5) 55%,
        rgba(0,0,0,0.92) 80%,
        rgba(0,0,0,1) 100%
    );
}}
.brand-header {{
    position: absolute;
    top: 40px; left: 40px;
    display: flex;
    align-items: center;
    gap: 14px;
    z-index: 10;
}}
.brand-circle {{
    width: 42px; height: 42px;
    border-radius: 50%;
    border: 2px solid rgba(255,255,255,0.9);
    display: flex;
    align-items: center;
    justify-content: center;
    font-family: 'Poppins', sans-serif;
    font-weight: 800;
    font-size: 16px;
    color: white;
    backdrop-filter: blur(10px);
    background: rgba(255,255,255,0.1);
}}
.brand-name {{
    font-family: 'Inter', sans-serif;
    font-weight: 700;
    font-size: 20px;
    color: rgba(255,255,255,0.9);
    letter-spacing: 0.5px;
}}
.number-badge {{
    position: absolute;
    top: 35px; right: 45px;
    font-family: 'Poppins', sans-serif;
    font-weight: 900;
    font-size: 120px;
    color: white;
    text-shadow:
        0 0 60px rgba(255,255,255,0.3),
        0 0 120px rgba(255,255,255,0.1);
    z-index: 10;
}}
.content {{
    position: absolute;
    bottom: 100px;
    left: 55px;
    right: 55px;
    z-index: 10;
}}
.title-line {{
    font-family: 'Poppins', sans-serif;
    font-weight: 900;
    font-size: 88px;
    color: white;
    line-height: 1.0;
    letter-spacing: -2px;
    text-shadow:
        0 2px 20px rgba(0,0,0,0.8),
        0 0 60px rgba(0,0,0,0.5);
}}
.subtitle {{
    font-family: 'Inter', sans-serif;
    font-weight: 400;
    font-size: 28px;
    color: rgba(255,255,255,0.7);
    margin-top: 20px;
    letter-spacing: 0.5px;
}}
.footer {{
    position: absolute;
    bottom: 30px;
    left: 55px;
    right: 55px;
    display: flex;
    justify-content: space-between;
    align-items: center;
    z-index: 10;
}}
.handle-badge {{
    display: flex;
    align-items: center;
    gap: 10px;
}}
.ig-icon {{
    width: 30px; height: 30px;
    border-radius: 8px;
    background: linear-gradient(45deg, #833ab4, #fd1d1d, #fcb045);
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 16px;
    color: white;
}}
.handle-text {{
    font-size: 16px;
    color: rgba(255,255,255,0.6);
}}
.handle-name {{
    font-weight: 700;
    color: rgba(255,255,255,0.8);
    font-size: 17px;
}}
.swipe {{
    display: flex;
    align-items: center;
    gap: 8px;
    font-size: 16px;
    color: rgba(255,255,255,0.5);
    font-weight: 500;
}}
.swipe-arrow {{
    font-size: 22px;
}}
.dots {{
    position: absolute;
    bottom: 8px;
    left: 50%;
    transform: translateX(-50%);
    display: flex;
    gap: 8px;
    z-index: 10;
}}
.dot {{
    width: 8px; height: 8px;
    border-radius: 50%;
    background: rgba(255,255,255,0.3);
}}
.dot.active {{
    background: white;
}}
</style>
</head>
<body>
<div class="slide">
    <div class="bg"></div>
    <div class="bg-overlay"></div>

    <div class="brand-header">
        <div class="brand-circle">DS</div>
        <div class="brand-name">DS Marketing</div>
    </div>

    {number_html}

    <div class="content">
        {title_html}
        <div class="subtitle">{subtitle}</div>
    </div>

    <div class="footer">
        <div class="handle-badge">
            <div class="ig-icon">&#9741;</div>
            <div>
                <div class="handle-text">Instagram</div>
                <div class="handle-name">DS.Marketing</div>
            </div>
        </div>
        <div class="swipe">
            swipe <span class="swipe-arrow">&larr;</span>
        </div>
    </div>

    <div class="dots">
        {"".join(f'<div class="dot {"active" if i == 0 else ""}"></div>' for i in range(min(total, 8)))}
    </div>
</div>
</body>
</html>"""


def html_content(number, headline, points, page, total):
    """Content slide — numbered, educational."""
    points_html = ""
    for p in points:
        points_html += f"""
        <div class="point">
            <div class="bullet">&#9670;</div>
            <div class="point-text">{p}</div>
        </div>"""

    return f"""<!DOCTYPE html>
<html>
<head>
{GOOGLE_FONTS}
<style>
{BASE_STYLE}
.slide {{
    background: linear-gradient(170deg, #0a0a0a 0%, #111 40%, #0d0d0d 100%);
}}
.grain {{
    position: absolute;
    top: 0; left: 0; right: 0; bottom: 0;
    opacity: 0.03;
    background-image: url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noise'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noise)'/%3E%3C/svg%3E");
    background-size: 256px;
}}
.glow {{
    position: absolute;
    top: -200px; left: 50%;
    transform: translateX(-50%);
    width: 600px; height: 600px;
    border-radius: 50%;
    background: radial-gradient(circle, rgba(255,255,255,0.04) 0%, transparent 70%);
}}
.brand-header {{
    position: absolute;
    top: 40px; left: 50px;
    display: flex;
    align-items: center;
    gap: 14px;
    z-index: 10;
}}
.brand-circle {{
    width: 38px; height: 38px;
    border-radius: 50%;
    border: 1.5px solid rgba(255,255,255,0.6);
    display: flex; align-items: center; justify-content: center;
    font-family: 'Poppins', sans-serif;
    font-weight: 800; font-size: 14px; color: rgba(255,255,255,0.8);
}}
.brand-name {{
    font-weight: 600; font-size: 18px;
    color: rgba(255,255,255,0.6);
}}
.big-number {{
    font-family: 'Poppins', sans-serif;
    font-weight: 900;
    font-size: 200px;
    color: white;
    line-height: 1;
    margin: 120px 0 0 50px;
    text-shadow: 0 0 80px rgba(255,255,255,0.15);
}}
.divider {{
    width: calc(100% - 100px);
    height: 1px;
    background: linear-gradient(90deg, rgba(255,255,255,0.4) 0%, rgba(255,255,255,0.1) 100%);
    margin: 20px 50px;
}}
.headline {{
    font-family: 'Poppins', sans-serif;
    font-weight: 800;
    font-size: 52px;
    color: white;
    line-height: 1.15;
    margin: 25px 50px 0;
    letter-spacing: -1px;
}}
.points {{
    margin: 40px 50px 0;
    display: flex;
    flex-direction: column;
    gap: 22px;
}}
.point {{
    display: flex;
    align-items: flex-start;
    gap: 16px;
}}
.bullet {{
    font-size: 14px;
    color: rgba(255,255,255,0.4);
    margin-top: 6px;
    flex-shrink: 0;
}}
.point-text {{
    font-family: 'Inter', sans-serif;
    font-weight: 400;
    font-size: 26px;
    color: rgba(255,255,255,0.75);
    line-height: 1.5;
}}
.footer {{
    position: absolute;
    bottom: 35px;
    left: 50px;
    right: 50px;
    display: flex;
    justify-content: space-between;
    align-items: center;
}}
.footer-handle {{
    font-size: 15px;
    color: rgba(255,255,255,0.35);
    font-weight: 500;
}}
.page-badge {{
    padding: 8px 20px;
    border: 1px solid rgba(255,255,255,0.2);
    border-radius: 8px;
    font-size: 15px;
    font-weight: 600;
    color: rgba(255,255,255,0.5);
}}
.footer-swipe {{
    font-size: 15px;
    color: rgba(255,255,255,0.35);
}}
</style>
</head>
<body>
<div class="slide">
    <div class="grain"></div>
    <div class="glow"></div>

    <div class="brand-header">
        <div class="brand-circle">DS</div>
        <div class="brand-name">DS Marketing</div>
    </div>

    <div class="big-number">{number:02d}</div>
    <div class="divider"></div>
    <div class="headline">{headline.upper()}</div>

    <div class="points">
        {points_html}
    </div>

    <div class="footer">
        <div class="footer-handle">Instagram &nbsp;|&nbsp; DS.Marketing</div>
        <div class="page-badge">Page {page}/{total}</div>
        <div class="footer-swipe">swipe &larr;</div>
    </div>
</div>
</body>
</html>"""


def html_stat(big_number, label, description, page, total):
    """Statistics slide — giant number with glow."""
    return f"""<!DOCTYPE html>
<html>
<head>
{GOOGLE_FONTS}
<style>
{BASE_STYLE}
.slide {{
    background: #000;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
}}
.glow {{
    position: absolute;
    top: 50%; left: 50%;
    transform: translate(-50%, -60%);
    width: 500px; height: 500px;
    border-radius: 50%;
    background: radial-gradient(circle, rgba(255,255,255,0.06) 0%, transparent 65%);
}}
.brand-header {{
    position: absolute;
    top: 40px; left: 50px;
    display: flex; align-items: center; gap: 14px;
}}
.brand-circle {{
    width: 38px; height: 38px;
    border-radius: 50%;
    border: 1.5px solid rgba(255,255,255,0.6);
    display: flex; align-items: center; justify-content: center;
    font-family: 'Poppins'; font-weight: 800; font-size: 14px; color: rgba(255,255,255,0.8);
}}
.brand-name {{ font-weight: 600; font-size: 18px; color: rgba(255,255,255,0.6); }}
.stat-number {{
    font-family: 'Poppins', sans-serif;
    font-weight: 900;
    font-size: 180px;
    color: white;
    text-shadow:
        0 0 60px rgba(255,255,255,0.25),
        0 0 120px rgba(255,255,255,0.1);
    letter-spacing: -4px;
    z-index: 2;
}}
.stat-label {{
    font-family: 'Poppins', sans-serif;
    font-weight: 700;
    font-size: 48px;
    color: rgba(255,255,255,0.85);
    text-align: center;
    text-transform: uppercase;
    margin-top: 10px;
    max-width: 800px;
    line-height: 1.2;
    letter-spacing: -1px;
    z-index: 2;
}}
.stat-line {{
    width: 180px; height: 1px;
    background: rgba(255,255,255,0.3);
    margin: 30px 0;
    z-index: 2;
}}
.stat-desc {{
    font-family: 'Inter', sans-serif;
    font-weight: 400;
    font-size: 24px;
    color: rgba(255,255,255,0.5);
    text-align: center;
    max-width: 700px;
    line-height: 1.6;
    z-index: 2;
}}
.footer {{
    position: absolute;
    bottom: 35px; left: 50px; right: 50px;
    display: flex; justify-content: space-between; align-items: center;
}}
.footer-handle {{ font-size: 15px; color: rgba(255,255,255,0.35); font-weight: 500; }}
.page-badge {{
    padding: 8px 20px; border: 1px solid rgba(255,255,255,0.2);
    border-radius: 8px; font-size: 15px; font-weight: 600; color: rgba(255,255,255,0.5);
}}
.footer-swipe {{ font-size: 15px; color: rgba(255,255,255,0.35); }}
</style>
</head>
<body>
<div class="slide">
    <div class="glow"></div>
    <div class="brand-header">
        <div class="brand-circle">DS</div>
        <div class="brand-name">DS Marketing</div>
    </div>
    <div class="stat-number">{big_number}</div>
    <div class="stat-label">{label}</div>
    <div class="stat-line"></div>
    <div class="stat-desc">{description}</div>
    <div class="footer">
        <div class="footer-handle">Instagram &nbsp;|&nbsp; DS.Marketing</div>
        <div class="page-badge">Page {page}/{total}</div>
        <div class="footer-swipe">swipe &larr;</div>
    </div>
</div>
</body>
</html>"""


def html_quote(quote_text, author, page, total):
    """Quote slide — elegant typography."""
    return f"""<!DOCTYPE html>
<html>
<head>
{GOOGLE_FONTS}
<style>
{BASE_STYLE}
.slide {{
    background: #050505;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
}}
.glow {{
    position: absolute;
    top: 40%; left: 50%;
    transform: translate(-50%, -50%);
    width: 700px; height: 400px;
    border-radius: 50%;
    background: radial-gradient(ellipse, rgba(255,255,255,0.03) 0%, transparent 70%);
}}
.brand-header {{
    position: absolute;
    top: 40px; left: 50px;
    display: flex; align-items: center; gap: 14px;
}}
.brand-circle {{
    width: 38px; height: 38px; border-radius: 50%;
    border: 1.5px solid rgba(255,255,255,0.6);
    display: flex; align-items: center; justify-content: center;
    font-family: 'Poppins'; font-weight: 800; font-size: 14px; color: rgba(255,255,255,0.8);
}}
.brand-name {{ font-weight: 600; font-size: 18px; color: rgba(255,255,255,0.6); }}
.quote-mark {{
    font-family: 'Poppins', sans-serif;
    font-weight: 900;
    font-size: 200px;
    color: rgba(255,255,255,0.08);
    line-height: 0.8;
    margin-bottom: -40px;
    z-index: 2;
}}
.quote-text {{
    font-family: 'Inter', sans-serif;
    font-weight: 300;
    font-style: italic;
    font-size: 36px;
    color: rgba(255,255,255,0.9);
    text-align: center;
    max-width: 820px;
    line-height: 1.6;
    z-index: 2;
    padding: 0 40px;
}}
.quote-line {{
    width: 120px; height: 1px;
    background: rgba(255,255,255,0.25);
    margin: 40px 0 25px;
    z-index: 2;
}}
.quote-author {{
    font-family: 'Inter', sans-serif;
    font-weight: 600;
    font-size: 22px;
    color: rgba(255,255,255,0.5);
    letter-spacing: 2px;
    text-transform: uppercase;
    z-index: 2;
}}
.footer {{
    position: absolute;
    bottom: 35px; left: 50px; right: 50px;
    display: flex; justify-content: space-between; align-items: center;
}}
.footer-handle {{ font-size: 15px; color: rgba(255,255,255,0.35); font-weight: 500; }}
.page-badge {{
    padding: 8px 20px; border: 1px solid rgba(255,255,255,0.2);
    border-radius: 8px; font-size: 15px; font-weight: 600; color: rgba(255,255,255,0.5);
}}
.footer-swipe {{ font-size: 15px; color: rgba(255,255,255,0.35); }}
</style>
</head>
<body>
<div class="slide">
    <div class="glow"></div>
    <div class="brand-header">
        <div class="brand-circle">DS</div>
        <div class="brand-name">DS Marketing</div>
    </div>
    <div class="quote-mark">&ldquo;</div>
    <div class="quote-text">{quote_text}</div>
    <div class="quote-line"></div>
    <div class="quote-author">{author}</div>
    <div class="footer">
        <div class="footer-handle">Instagram &nbsp;|&nbsp; DS.Marketing</div>
        <div class="page-badge">Page {page}/{total}</div>
        <div class="footer-swipe">swipe &larr;</div>
    </div>
</div>
</body>
</html>"""


def html_cta(total):
    """CTA slide — brand, follow button."""
    return f"""<!DOCTYPE html>
<html>
<head>
{GOOGLE_FONTS}
<style>
{BASE_STYLE}
.slide {{
    background: #000;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
}}
.glow {{
    position: absolute;
    top: 30%; left: 50%;
    transform: translate(-50%, -50%);
    width: 500px; height: 500px;
    border-radius: 50%;
    background: radial-gradient(circle, rgba(255,255,255,0.06) 0%, transparent 60%);
}}
.ds-logo {{
    font-family: 'Poppins', sans-serif;
    font-weight: 900;
    font-size: 180px;
    color: white;
    letter-spacing: -5px;
    text-shadow:
        0 0 60px rgba(255,255,255,0.2),
        0 0 120px rgba(255,255,255,0.08);
    z-index: 2;
}}
.ds-sub {{
    font-family: 'Poppins', sans-serif;
    font-weight: 700;
    font-size: 42px;
    color: rgba(255,255,255,0.7);
    letter-spacing: 12px;
    text-transform: uppercase;
    margin-top: -10px;
    z-index: 2;
}}
.ds-line {{
    width: 400px; height: 2px;
    background: linear-gradient(90deg, transparent, rgba(255,255,255,0.5), transparent);
    margin: 35px 0;
    z-index: 2;
}}
.ds-handle {{
    font-family: 'Inter', sans-serif;
    font-weight: 700;
    font-size: 32px;
    color: white;
    z-index: 2;
}}
.ds-site {{
    font-family: 'Inter', sans-serif;
    font-weight: 400;
    font-size: 20px;
    color: rgba(255,255,255,0.4);
    margin-top: 12px;
    z-index: 2;
}}
.follow-btn {{
    margin-top: 50px;
    padding: 18px 50px;
    border: 2px solid white;
    border-radius: 14px;
    font-family: 'Poppins', sans-serif;
    font-weight: 700;
    font-size: 28px;
    color: white;
    letter-spacing: 2px;
    text-transform: uppercase;
    z-index: 2;
    transition: all 0.3s;
}}
.dots {{
    position: absolute;
    bottom: 15px;
    display: flex;
    gap: 8px;
    z-index: 10;
}}
.dot {{ width: 8px; height: 8px; border-radius: 50%; background: rgba(255,255,255,0.3); }}
.dot.active {{ background: white; }}
</style>
</head>
<body>
<div class="slide">
    <div class="glow"></div>
    <div class="ds-logo">DS</div>
    <div class="ds-sub">Marketing</div>
    <div class="ds-line"></div>
    <div class="ds-handle">{BRAND_HANDLE}</div>
    <div class="ds-site">{BRAND_SITE}</div>
    <div class="follow-btn">Follow For More</div>
    <div class="dots">
        {"".join(f'<div class="dot {"active" if i == total-1 else ""}"></div>' for i in range(min(total, 8)))}
    </div>
</div>
</body>
</html>"""


# ══════════════════════════════════════════════
# DEFAULT CAROUSEL DATA
# ══════════════════════════════════════════════

DEFAULT_CAROUSELS = [
    {
        "topic": "5 Social Media Mistakes Killing Your Growth",
        "cover_lines": ["5 Mistakes", "Killing Your", "Growth"],
        "cover_sub": "Stop making these. Your competitors aren't.",
        "number": 5,
        "bg_prompt": "professional dark office desk with laptop showing analytics dashboard and coffee cup, dramatic moody cinematic lighting, dark background, studio photography, 8K, shallow depth of field",
        "slides": [
            {"headline": "Posting Without a Strategy", "points": ["Random posts give random results. Period.", "A content calendar isn't optional — it's the foundation.", "Plan 7 days ahead. Minimum."]},
            {"headline": "Ignoring Your Analytics", "points": ["The data tells you exactly what works.", "Check insights weekly, not monthly.", "Double down on your top 3 performing formats."]},
            {"headline": "No Hook in the First Line", "points": ["80% of people never read past line one.", "Lead with a bold claim or question.", "Your hook IS your content strategy."]},
            {"headline": "Zero Engagement Strategy", "points": ["Post and ghost? The algorithm notices.", "Reply to every comment within 1 hour.", "Spend 15 min/day engaging with your niche."]},
            {"headline": "Same Content Everywhere", "points": ["Instagram and LinkedIn are different worlds.", "Repurpose the idea, not the post.", "Each platform has its own language."]},
        ],
        "quote": {"text": "The best marketing doesn't feel like marketing.", "author": "Tom Fishburne"},
        "stat": {"number": "73%", "label": "of marketers post without a plan", "desc": "Don't be one of them. Strategy beats random every time."},
        "caption": "Your social media isn't broken. Your strategy is.\n\nThese 5 mistakes are costing you followers, engagement, and revenue every single day.\n\nSave this. Share it with someone who needs it.\n\n@dsmarketing.agency\n\n#socialmedia #marketing #socialmediamarketing #instagram #growth #entrepreneur #businesstips #digitalmarketing #contentmarketing #branding #smm #marketingtips #instagramgrowth #contentcreator #smallbusiness"
    },
    {
        "topic": "The Content Calendar That Actually Works",
        "cover_lines": ["The Content", "Calendar That", "Works"],
        "cover_sub": "Framework beats random. Every time.",
        "number": 7,
        "bg_prompt": "modern minimalist desk with planner notebook pen and coffee on dark wood, dramatic rim lighting, cinematic photography, dark moody atmosphere, shallow depth of field, 8K",
        "slides": [
            {"headline": "Monday: Education", "points": ["Tips, frameworks, and how-to content.", "Teach something they can use TODAY.", "Carousels and infographics crush it here."]},
            {"headline": "Tuesday: Industry Insights", "points": ["Share trends and predictions.", "Position yourself as the expert.", "Add your unique take — don't just reshare."]},
            {"headline": "Wednesday: Case Studies", "points": ["Show real results with real numbers.", "Before and after is powerful.", "Let the data tell the story."]},
            {"headline": "Thursday: Behind the Scenes", "points": ["Show your process, not just results.", "People connect with people, not logos.", "Raw > polished for BTS content."]},
            {"headline": "Friday: Engagement", "points": ["Ask questions. Start conversations.", "Polls, quizzes, and hot takes.", "The algorithm rewards real interaction."]},
        ],
        "quote": {"text": "Content is fire. Social media is gasoline.", "author": "Jay Baer"},
        "stat": {"number": "4X", "label": "more engagement with consistent posting", "desc": "Brands that post 4+ times per week see 4X the engagement."},
        "caption": "Stop guessing what to post.\n\nThis framework has helped dozens of brands go from random posting to strategic growth.\n\nSave this for your next planning session.\n\n@dsmarketing.agency\n\n#contentcalendar #socialmedia #marketing #instagramstrategy #contentplan #socialmediamanager #digitalmarketing #contentcreation #marketingstrategy #smm #branding #entrepreneur #businessgrowth #instagramtips #growthhacking"
    },
    {
        "topic": "The Hook Formula That Stops the Scroll",
        "cover_lines": ["The Hook", "Formula"],
        "cover_sub": "3 seconds. That's all you get.",
        "number": 3,
        "bg_prompt": "dramatic close up of person typing on MacBook laptop with screen glow on face in dark room, cinematic moody lighting, studio photography, 8K",
        "slides": [
            {"headline": "Start With a Number", "points": ["Numbers stop the scroll instantly.", "'7 mistakes' hits harder than 'some mistakes'.", "Odd numbers outperform even ones."]},
            {"headline": "Ask a Loaded Question", "points": ["Questions trigger the curiosity gap.", "'Why is your content failing?' — they HAVE to know.", "Make them feel the problem."]},
            {"headline": "Make a Bold Claim", "points": ["'Your marketing strategy is dead.'", "Controversy drives engagement.", "Be bold — but always back it up."]},
        ],
        "quote": {"text": "You never get a second chance to make a first impression.", "author": "Will Rogers"},
        "stat": {"number": "3s", "label": "to stop the scroll", "desc": "If your hook doesn't grab them in 3 seconds, nothing else matters."},
        "caption": "Your hook is your entire strategy.\n\n3 seconds. That's the window. Miss it and they're gone. These formulas have generated millions of impressions.\n\nWhich one will you try first?\n\n@dsmarketing.agency\n\n#hooks #copywriting #instagramtips #contentcreator #marketing #socialmedia #digitalmarketing #instagramgrowth #writingtips #branding #entrepreneur #smm #engagement #contentmarketing #reels"
    },
    {
        "topic": "How to 10X Your Instagram Engagement",
        "cover_lines": ["10X Your", "Engagement"],
        "cover_sub": "Engagement isn't luck. It's strategy.",
        "number": 5,
        "bg_prompt": "smartphone showing instagram app with notifications on dark marble desk with plant, dramatic studio lighting, luxury aesthetic, dark background, 8K, shallow depth of field",
        "slides": [
            {"headline": "Reply to Every Comment", "points": ["The first hour is the golden window.", "Replies count as engagement signals too.", "Turn comments into real conversations."]},
            {"headline": "Use Carousel Posts", "points": ["Carousels get 3X the engagement of single images.", "Each swipe is a signal to the algorithm.", "Aim for 7-10 slides per carousel."]},
            {"headline": "Write Better Captions", "points": ["Long captions = more time spent on post.", "Tell stories, not just tips.", "End every caption with a question or CTA."]},
            {"headline": "Post at Peak Hours", "points": ["Check YOUR analytics — not generic advice.", "Test different times for 2 weeks.", "Consistency matters more than perfect timing."]},
            {"headline": "Create Shareable Content", "points": ["If they won't share it, it's not valuable enough.", "Saves and shares > likes. Always.", "Think: 'Would I send this to a friend?'"]},
        ],
        "quote": {"text": "People don't buy goods and services. They buy relations, stories, and magic.", "author": "Seth Godin"},
        "stat": {"number": "312%", "label": "boost from carousel posts", "desc": "Carousels drive 312% more engagement than single image posts."},
        "caption": "Zero engagement? It's not the algorithm.\n\nThese 5 tactics have helped clients go from ghost town to thriving community.\n\nDouble tap if you're implementing these today.\n\n@dsmarketing.agency\n\n#engagement #instagramengagement #socialmedia #marketing #instagramgrowth #contentcreator #digitalmarketing #smm #branding #entrepreneur #businesstips #socialmediamarketing #instagramtips #contentmarketing #growth"
    },
    {
        "topic": "Build a Brand People Remember",
        "cover_lines": ["Build a Brand", "People", "Remember"],
        "cover_sub": "If they can't recognize you in 2 seconds, you don't have a brand.",
        "number": 4,
        "bg_prompt": "luxury brand items on dark velvet background premium watch leather notebook fountain pen, dramatic studio lighting, high contrast, cinematic photography, 8K, moody dark",
        "slides": [
            {"headline": "Define Your Voice", "points": ["Are you the mentor? The rebel? The expert?", "Pick 3 adjectives that define your brand.", "Use them consistently in every piece of content."]},
            {"headline": "Visual Consistency", "points": ["Same colors. Same fonts. Same energy.", "Your grid should look like ONE brand.", "Templates save time and build instant recognition."]},
            {"headline": "Tell Your Story", "points": ["People follow people, not logos.", "Share your why — not just your what.", "Vulnerability builds trust faster than expertise."]},
            {"headline": "Create a Signature", "points": ["One thing only YOU do.", "A catchphrase, a format, a visual style.", "Make it impossible to confuse you with anyone."]},
        ],
        "quote": {"text": "Your brand is what people say about you when you're not in the room.", "author": "Jeff Bezos"},
        "stat": {"number": "2s", "label": "to recognize a strong brand", "desc": "The best brands are instantly recognizable. Is yours?"},
        "caption": "You don't have a brand. You have a logo.\n\nA real brand is felt, not just seen. It's the voice, the consistency, the story.\n\nBuild something they can't forget.\n\n@dsmarketing.agency\n\n#branding #brandidentity #marketing #personalbranding #instagram #entrepreneur #businessowner #digitalmarketing #contentcreator #smm #socialmedia #brandstrategy #design #growth #mindset"
    },
]


# ══════════════════════════════════════════════
# RENDERER — Playwright
# ══════════════════════════════════════════════

def render_slides(carousel_data, post_dir, browser):
    """Render all slides for one carousel post using Playwright."""
    slides = carousel_data.get("slides", [])
    quote_data = carousel_data.get("quote")
    stat_data = carousel_data.get("stat")

    total = 1 + len(slides) + (1 if stat_data else 0) + (1 if quote_data else 0) + 1

    # Generate AI background
    bg_prompt = carousel_data.get("bg_prompt", "dark professional workspace, cinematic lighting, 8K")
    bg_path = f"{post_dir}/bg.png"
    print(f"    Generating AI background...")
    generate_bg(bg_prompt, bg_path)
    bg_b64 = img_to_base64(bg_path)

    slide_num = 1

    # COVER
    print(f"    Rendering cover...")
    html = html_cover(
        carousel_data.get("cover_lines", ["TITLE"]),
        carousel_data.get("cover_sub", ""),
        bg_b64,
        carousel_data.get("number"),
        1, total
    )
    render_html(browser, html, f"{post_dir}/{slide_num:02d}_cover.png")
    slide_num += 1

    # CONTENT SLIDES
    for si, slide in enumerate(slides):
        headline = slide.get("headline", "")
        points = slide.get("points", [])
        print(f"    Rendering slide {slide_num}: {headline}")
        html = html_content(si + 1, headline, points, slide_num, total)
        render_html(browser, html, f"{post_dir}/{slide_num:02d}_content.png")
        slide_num += 1

    # STAT SLIDE
    if stat_data:
        print(f"    Rendering stat slide...")
        html = html_stat(
            stat_data.get("number", ""),
            stat_data.get("label", ""),
            stat_data.get("desc", ""),
            slide_num, total
        )
        render_html(browser, html, f"{post_dir}/{slide_num:02d}_stat.png")
        slide_num += 1

    # QUOTE SLIDE
    if quote_data:
        print(f"    Rendering quote slide...")
        html = html_quote(
            quote_data.get("text", ""),
            quote_data.get("author", ""),
            slide_num, total
        )
        render_html(browser, html, f"{post_dir}/{slide_num:02d}_quote.png")
        slide_num += 1

    # CTA SLIDE
    print(f"    Rendering CTA slide...")
    html = html_cta(total)
    render_html(browser, html, f"{post_dir}/{slide_num:02d}_cta.png")

    # CAPTION
    caption = carousel_data.get("caption", "")
    if caption:
        with open(f"{post_dir}/caption.txt", "w") as f:
            f.write(caption)

    return total


def render_html(browser, html, output_path):
    """Render HTML to PNG using Playwright."""
    page = browser.new_page(
        viewport={"width": W, "height": H},
        device_scale_factor=2  # 2x retina quality
    )
    page.set_content(html)
    # Wait for fonts to load
    try:
        page.wait_for_load_state("networkidle", timeout=15000)
    except:
        pass
    try:
        page.wait_for_function("document.fonts.ready", timeout=10000)
    except:
        pass
    # Small extra wait for rendering
    page.wait_for_timeout(500)
    page.screenshot(path=output_path)
    page.close()


# ══════════════════════════════════════════════
# MAIN
# ══════════════════════════════════════════════

def main():
    print()
    print("  \u2554" + "\u2550" * 58 + "\u2557")
    print("  \u2551  DS MARKETING CAROUSEL PRO v1.0                       \u2551")
    print("  \u2551  Real CSS Rendering \u2014 Figma/Canva Quality             \u2551")
    print("  \u2551  Powered by: Playwright + Ollama + Pollinations        \u2551")
    print("  \u255a" + "\u2550" * 58 + "\u255d")
    print()

    # Setup Playwright
    print("  STEP 1: Browser Engine")
    print("  " + "\u2500" * 58)
    if not setup_playwright():
        print("    ! Failed to install Playwright")
        print("    Run manually: pip install playwright && playwright install chromium")
        return

    from playwright.sync_api import sync_playwright
    print("    \u2713 Playwright ready (Chromium)")
    print()

    # Ollama
    print("  STEP 2: AI Brain (Ollama)")
    print("  " + "\u2500" * 58)
    carousels = None

    if check_ollama():
        model = find_model()
        if model:
            print(f"    \u2713 Ollama connected ({model})")
            print("    Generating carousel content...")
            prompt = """Generate 5 Instagram carousel post ideas for a social media marketing agency.

Return ONLY valid JSON array with objects having:
- "topic": string (5-8 words)
- "cover_lines": array of 2-3 strings (3-5 words each, title case)
- "cover_sub": string (one sentence subtitle)
- "number": integer (key number in the topic)
- "bg_prompt": string (image prompt: dark moody professional scene, cinematic, 8K)
- "slides": array of 3-5 objects with "headline" (string) and "points" (array of 3 strings)
- "quote": object with "text" and "author"
- "stat": object with "number" (like "73%"), "label", "desc"
- "caption": string (Instagram caption with hashtags)

Return ONLY the JSON array."""
            result = ask_ai_json(prompt, model, AI_SYSTEM)
            if result and isinstance(result, list) and len(result) >= 3:
                carousels = result
                print(f"    \u2713 {len(carousels)} posts generated by AI")
    else:
        print("    Ollama not running \u2014 using premium defaults")
        print("    (Install from ollama.com for AI-generated content)")

    if not carousels:
        carousels = DEFAULT_CAROUSELS
        print(f"    Using {len(carousels)} premium default posts")

    print()
    os.makedirs(OUT, exist_ok=True)
    os.makedirs(f"{OUT}/captions", exist_ok=True)

    # Render with Playwright
    print("  STEP 3: Rendering Carousels")
    print("  " + "\u2500" * 58)
    print(f"    Resolution: {W}x{H} @ 2x retina ({W*2}x{H*2} actual)")
    print(f"    Fonts: Google Fonts (Poppins, Inter)")
    print()

    with sync_playwright() as p:
        browser = p.chromium.launch()

        for idx, carousel in enumerate(carousels):
            topic = carousel.get("topic", f"Post {idx+1}")
            post_dir = f"{OUT}/post_{idx+1:02d}"
            os.makedirs(post_dir, exist_ok=True)

            print(f"  POST {idx+1}: {topic}")
            print("  " + "\u2500" * 58)

            total = render_slides(carousel, post_dir, browser)

            # Save caption to shared folder too
            caption = carousel.get("caption", "")
            if caption:
                with open(f"{OUT}/captions/post_{idx+1:02d}.txt", "w") as f:
                    f.write(f"TOPIC: {topic}\n\n{caption}")

            print(f"    \u2713 {total} slides saved\n")

        browser.close()

    # Clean up background files
    for idx in range(len(carousels)):
        bg = f"{OUT}/post_{idx+1:02d}/bg.png"
        if os.path.exists(bg):
            try: os.remove(bg)
            except: pass

    # Summary
    print()
    print("  \u2554" + "\u2550" * 58 + "\u2557")
    print("  \u2551  ALL DONE \u2014 CAROUSEL PRO COMPLETE                     \u2551")
    print("  \u255a" + "\u2550" * 58 + "\u255d")
    print(f"""
  Your content: {OUT}/
""")
    for i, c in enumerate(carousels):
        t = c.get("topic", f"Post {i+1}")
        s = len(c.get("slides",[])) + 3
        print(f"     post_{i+1:02d}/  ({s} slides)  {t}")

    print(f"""
  EACH POST HAS:
     \u2022 AI-generated cover with cinematic background
     \u2022 Numbered content slides with bullets
     \u2022 Statistics slide with glowing numbers
     \u2022 Quote slide with elegant typography
     \u2022 CTA slide with follow button
     \u2022 Ready-to-post caption.txt

  TECH:
     \u2022 Rendered with real CSS (Poppins + Inter fonts)
     \u2022 2x retina resolution ({W*2}x{H*2} pixels)
     \u2022 Glassmorphism, gradients, shadows, glow effects
     \u2022 Same rendering engine as Chrome/Figma

  Captions: {OUT}/captions/
  Upload directly to Instagram as carousel posts.
""")


if __name__ == "__main__":
    main()
