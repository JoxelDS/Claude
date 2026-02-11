#!/usr/bin/env python3
"""
DS MARKETING MEGA ENGINE v1.0
═══════════════════════════════════════════════════════
The ultimate content pipeline. Chains every AI available.

IMAGE ENGINES (tried in order, best first):
  1. Google Gemini (Nano Banana) — best quality, free API key
  2. Together.ai FLUX — excellent open model, free API key
  3. Pollinations.ai — always works, no key needed

CONTENT ENGINE:
  - Ollama (local AI) — writes all copy, captions, hashtags
  - Falls back to premium defaults if Ollama not running

RENDERING ENGINE:
  - Playwright (headless Chrome) — real CSS, Google Fonts, retina 2x
  - Falls back to Pillow if Playwright not installed

OUTPUT:
  - 5 premium Instagram carousel posts (8-9 slides each)
  - AI-generated cover backgrounds
  - Ready-to-post captions with hashtags
  - 1080x1350 @ 2x retina (2160x2700 actual)

SETUP:
  1. Get free Gemini API key: https://aistudio.google.com/apikey
  2. Get free Together.ai key: https://api.together.ai/settings/api-keys
  3. Run: python3 ds_mega.py

The script asks for your keys on first run and saves them locally.
"""

import os, sys, subprocess, json, random, time, base64, io
import urllib.request, urllib.parse

# ══════════════════════════════════════════════
# AUTO-INSTALL
# ══════════════════════════════════════════════
def ensure(pkg, pip_name=None):
    try: __import__(pkg)
    except ImportError:
        print(f"  Installing {pip_name or pkg}...")
        subprocess.check_call([sys.executable, "-m", "pip", "install", pip_name or pkg],
                              stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)

ensure("requests")
ensure("PIL", "Pillow")
import requests
from PIL import Image

# ══════════════════════════════════════════════
# CONFIG
# ══════════════════════════════════════════════
W, H = 1080, 1350
OUT = "ds-marketing-mega"
KEYS_FILE = os.path.expanduser("~/.ds_marketing_keys.json")
OLLAMA_URL = "http://localhost:11434"
BRAND = "@dsmarketing.agency"
BRAND_SITE = "dsmarketing.lovable.app"


# ══════════════════════════════════════════════
# API KEY MANAGEMENT
# ══════════════════════════════════════════════
def load_keys():
    if os.path.exists(KEYS_FILE):
        with open(KEYS_FILE) as f:
            return json.load(f)
    return {}

def save_keys(keys):
    with open(KEYS_FILE, "w") as f:
        json.dump(keys, f, indent=2)

def setup_keys():
    """Interactive setup for API keys."""
    keys = load_keys()
    changed = False

    print()
    print("  ┌─────────────────────────────────────────────┐")
    print("  │  API KEY SETUP (free, no credit card)        │")
    print("  └─────────────────────────────────────────────┘")
    print()

    # Gemini
    if not keys.get("gemini"):
        print("  GEMINI (Nano Banana quality — BEST images):")
        print("  Get your free key here:")
        print("  → https://aistudio.google.com/apikey")
        print()
        key = input("  Paste your Gemini API key (or press Enter to skip): ").strip()
        if key:
            keys["gemini"] = key
            changed = True
            print("  ✓ Gemini key saved")
        else:
            print("  ⊘ Skipped (will use backup engines)")
        print()

    # Together.ai
    if not keys.get("together"):
        print("  TOGETHER.AI (FLUX model — excellent images):")
        print("  Get your free key here:")
        print("  → https://api.together.ai/settings/api-keys")
        print()
        key = input("  Paste your Together.ai API key (or press Enter to skip): ").strip()
        if key:
            keys["together"] = key
            changed = True
            print("  ✓ Together.ai key saved")
        else:
            print("  ⊘ Skipped (will use Pollinations fallback)")
        print()

    if changed:
        save_keys(keys)
        print(f"  Keys saved to {KEYS_FILE}")
        print()

    return keys


# ══════════════════════════════════════════════
# ENGINE 1: GOOGLE GEMINI (Nano Banana)
# ══════════════════════════════════════════════
def gemini_generate(prompt, api_key, out_path):
    """Generate image using Google Gemini (Nano Banana quality)."""
    try:
        url = f"https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash-exp:generateContent?key={api_key}"
        payload = {
            "contents": [{"parts": [{"text": f"Generate an image: {prompt}"}]}],
            "generationConfig": {"responseModalities": ["TEXT", "IMAGE"]}
        }
        r = requests.post(url, json=payload, timeout=60)
        if r.status_code != 200:
            return None
        data = r.json()
        # Extract image from response
        for candidate in data.get("candidates", []):
            for part in candidate.get("content", {}).get("parts", []):
                if "inlineData" in part:
                    img_data = base64.b64decode(part["inlineData"]["data"])
                    img = Image.open(io.BytesIO(img_data))
                    img.save(out_path, quality=95)
                    return out_path
        return None
    except Exception as e:
        return None


def gemini_imagen(prompt, api_key, out_path):
    """Generate image using Imagen 4 via Gemini API."""
    try:
        url = f"https://generativelanguage.googleapis.com/v1beta/models/imagen-3.0-generate-002:predict?key={api_key}"
        payload = {
            "instances": [{"prompt": prompt}],
            "parameters": {"sampleCount": 1, "aspectRatio": "4:5"}
        }
        r = requests.post(url, json=payload, timeout=60)
        if r.status_code != 200:
            # Try alternate endpoint
            url2 = f"https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash-exp:generateContent?key={api_key}"
            payload2 = {
                "contents": [{"parts": [{"text": f"Generate a high quality photorealistic image: {prompt}"}]}],
                "generationConfig": {"responseModalities": ["TEXT", "IMAGE"]}
            }
            r = requests.post(url2, json=payload2, timeout=60)
            if r.status_code != 200:
                return None

        data = r.json()

        # Check for Imagen response format
        predictions = data.get("predictions", [])
        if predictions:
            img_bytes = base64.b64decode(predictions[0].get("bytesBase64Encoded", ""))
            img = Image.open(io.BytesIO(img_bytes))
            img.save(out_path, quality=95)
            return out_path

        # Check for Gemini response format
        for candidate in data.get("candidates", []):
            for part in candidate.get("content", {}).get("parts", []):
                if "inlineData" in part:
                    img_data = base64.b64decode(part["inlineData"]["data"])
                    img = Image.open(io.BytesIO(img_data))
                    img.save(out_path, quality=95)
                    return out_path
        return None
    except:
        return None


# ══════════════════════════════════════════════
# ENGINE 2: TOGETHER.AI (FLUX)
# ══════════════════════════════════════════════
def flux_generate(prompt, api_key, out_path):
    """Generate image using Together.ai FLUX model."""
    try:
        r = requests.post("https://api.together.xyz/v1/images/generations",
            headers={"Authorization": f"Bearer {api_key}"},
            json={
                "model": "black-forest-labs/FLUX.1-schnell-Free",
                "prompt": prompt,
                "width": 1024,
                "height": 1280,  # 4:5 ratio
                "steps": 4,
                "n": 1,
                "response_format": "b64_json"
            },
            timeout=60
        )
        if r.status_code != 200:
            return None
        data = r.json()
        img_data = base64.b64decode(data["data"][0]["b64_json"])
        img = Image.open(io.BytesIO(img_data))
        img.save(out_path, quality=95)
        return out_path
    except:
        return None


# ══════════════════════════════════════════════
# ENGINE 3: POLLINATIONS (Free, no key)
# ══════════════════════════════════════════════
def pollinations_generate(prompt, out_path, w=1080, h=1350):
    """Generate image using Pollinations.ai (always available)."""
    try:
        seed = random.randint(1000, 99999)
        url = f"https://image.pollinations.ai/prompt/{urllib.parse.quote(prompt)}?width={w}&height={h}&model=flux&nologo=true&seed={seed}"
        urllib.request.urlretrieve(url, out_path)
        if os.path.exists(out_path) and os.path.getsize(out_path) > 5000:
            return out_path
        return None
    except:
        return None


# ══════════════════════════════════════════════
# MULTI-ENGINE CHAIN
# ══════════════════════════════════════════════
def generate_image(prompt, out_path, keys, label="image"):
    """Try all engines in order. Return path on success."""
    if os.path.exists(out_path) and os.path.getsize(out_path) > 5000:
        print(f"      ✓ {label} (cached)")
        return out_path

    # ENGINE 1: Gemini (Nano Banana)
    if keys.get("gemini"):
        print(f"      → Trying Gemini (Nano Banana)...", end=" ", flush=True)
        result = gemini_generate(prompt, keys["gemini"], out_path)
        if not result:
            result = gemini_imagen(prompt, keys["gemini"], out_path)
        if result:
            print("✓ GEMINI")
            return result
        print("✗")

    # ENGINE 2: Together.ai FLUX
    if keys.get("together"):
        print(f"      → Trying FLUX (Together.ai)...", end=" ", flush=True)
        result = flux_generate(prompt, keys["together"], out_path)
        if result:
            print("✓ FLUX")
            return result
        print("✗")

    # ENGINE 3: Pollinations (always works)
    print(f"      → Trying Pollinations...", end=" ", flush=True)
    result = pollinations_generate(prompt, out_path)
    if result:
        print("✓ POLLINATIONS")
        return result
    print("✗")

    print(f"      ! All engines failed for {label}")
    return None


# ══════════════════════════════════════════════
# OLLAMA — Content AI
# ══════════════════════════════════════════════
def check_ollama():
    try: return requests.get(OLLAMA_URL, timeout=5).status_code == 200
    except: return False

def find_model():
    try:
        models = [m["name"] for m in requests.get(f"{OLLAMA_URL}/api/tags", timeout=10).json().get("models", [])]
        for pref in ["mistral", "llama3.2", "llama3.1", "gemma2", "phi3"]:
            for m in models:
                if pref in m: return m
        return models[0] if models else None
    except: return None

def ask_ai_json(prompt, model):
    try:
        r = requests.post(f"{OLLAMA_URL}/api/chat", json={
            "model": model,
            "messages": [
                {"role": "system", "content": "You are the creative director for DS Marketing, a premium social media marketing agency. Brand voice: confident, direct, no fluff."},
                {"role": "user", "content": prompt}
            ],
            "stream": False, "options": {"temperature": 0.6}
        }, timeout=180)
        content = r.json()["message"]["content"].strip()
        if content.startswith("```"):
            lines = content.split("\n")
            lines = [l for l in lines if not l.strip().startswith("```")]
            content = "\n".join(lines)
        return json.loads(content)
    except:
        try:
            start = content.index("[")
            end = content.rindex("]") + 1
            return json.loads(content[start:end])
        except: return None


# ══════════════════════════════════════════════
# HTML TEMPLATES — Playwright Rendering
# ══════════════════════════════════════════════

FONTS = """<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;600;700;800;900&family=Poppins:wght@400;600;700;800;900&display=swap" rel="stylesheet">"""

BASE_CSS = """* { margin: 0; padding: 0; box-sizing: border-box; }
body { width: 1080px; height: 1350px; overflow: hidden; font-family: 'Inter', sans-serif; -webkit-font-smoothing: antialiased; }
.slide { width: 1080px; height: 1350px; position: relative; overflow: hidden; }
.brand-header { position: absolute; top: 40px; left: 45px; display: flex; align-items: center; gap: 14px; z-index: 10; }
.brand-circle { width: 40px; height: 40px; border-radius: 50%; border: 2px solid rgba(255,255,255,0.85); display: flex; align-items: center; justify-content: center; font-family: 'Poppins'; font-weight: 800; font-size: 15px; color: white; background: rgba(255,255,255,0.08); backdrop-filter: blur(10px); }
.brand-name { font-weight: 700; font-size: 19px; color: rgba(255,255,255,0.85); letter-spacing: 0.3px; }"""

def html_cover(lines, subtitle, bg_b64="", number=None, total=8):
    lines_html = "\n".join(f'<div class="title-line">{l}</div>' for l in lines)
    num_html = f'<div class="num-badge">{number}</div>' if number else ""
    dots = "".join(f'<div class="dot {"active" if i==0 else ""}"></div>' for i in range(min(total,8)))
    return f"""<!DOCTYPE html><html><head>{FONTS}<style>
{BASE_CSS}
.slide {{ background: #000; }}
.bg {{ position:absolute; inset:0; background-image:url('{bg_b64}'); background-size:cover; background-position:center; filter:brightness(0.4) saturate(0.12) contrast(1.25); }}
.overlay {{ position:absolute; inset:0; background:linear-gradient(180deg, rgba(0,0,0,0.2) 0%, rgba(0,0,0,0.05) 25%, rgba(0,0,0,0.5) 55%, rgba(0,0,0,0.95) 82%, #000 100%); }}
.num-badge {{ position:absolute; top:32px; right:45px; font-family:'Poppins'; font-weight:900; font-size:110px; color:white; text-shadow:0 0 60px rgba(255,255,255,0.3),0 0 120px rgba(255,255,255,0.08); z-index:10; }}
.content {{ position:absolute; bottom:95px; left:50px; right:50px; z-index:10; }}
.title-line {{ font-family:'Poppins'; font-weight:900; font-size:86px; color:white; line-height:1.02; letter-spacing:-2px; text-shadow:0 4px 30px rgba(0,0,0,0.9); }}
.subtitle {{ font-family:'Inter'; font-weight:400; font-size:27px; color:rgba(255,255,255,0.65); margin-top:18px; }}
.footer {{ position:absolute; bottom:28px; left:50px; right:50px; display:flex; justify-content:space-between; align-items:center; z-index:10; }}
.handle {{ display:flex; flex-direction:column; }}
.handle-label {{ font-size:13px; color:rgba(255,255,255,0.4); font-weight:500; }}
.handle-name {{ font-size:17px; color:rgba(255,255,255,0.75); font-weight:700; }}
.swipe {{ font-size:16px; color:rgba(255,255,255,0.4); font-weight:500; }}
.dots {{ position:absolute; bottom:8px; left:50%; transform:translateX(-50%); display:flex; gap:8px; z-index:10; }}
.dot {{ width:8px; height:8px; border-radius:50%; background:rgba(255,255,255,0.25); }}
.dot.active {{ background:white; }}
</style></head><body><div class="slide">
<div class="bg"></div><div class="overlay"></div>
<div class="brand-header"><div class="brand-circle">DS</div><div class="brand-name">DS Marketing</div></div>
{num_html}
<div class="content">{lines_html}<div class="subtitle">{subtitle}</div></div>
<div class="footer"><div class="handle"><span class="handle-label">Instagram</span><span class="handle-name">DS.Marketing</span></div><div class="swipe">swipe &larr;</div></div>
<div class="dots">{dots}</div>
</div></body></html>"""


def html_content(num, headline, points, page, total):
    pts = "\n".join(f'<div class="point"><span class="bullet">&#9670;</span><span class="pt">{p}</span></div>' for p in points)
    return f"""<!DOCTYPE html><html><head>{FONTS}<style>
{BASE_CSS}
.slide {{ background:linear-gradient(170deg,#0a0a0a 0%,#101010 50%,#0a0a0a 100%); }}
.glow {{ position:absolute; top:-150px; left:50%; transform:translateX(-50%); width:600px; height:500px; border-radius:50%; background:radial-gradient(circle,rgba(255,255,255,0.04) 0%,transparent 70%); }}
.big-num {{ font-family:'Poppins'; font-weight:900; font-size:190px; color:white; line-height:1; margin:110px 0 0 50px; text-shadow:0 0 80px rgba(255,255,255,0.12); }}
.divider {{ width:calc(100% - 100px); height:1px; background:linear-gradient(90deg,rgba(255,255,255,0.4),rgba(255,255,255,0.05)); margin:15px 50px; }}
.headline {{ font-family:'Poppins'; font-weight:800; font-size:50px; color:white; line-height:1.15; margin:20px 50px 0; letter-spacing:-1px; }}
.points {{ margin:35px 50px 0; display:flex; flex-direction:column; gap:20px; }}
.point {{ display:flex; align-items:flex-start; gap:14px; }}
.bullet {{ font-size:13px; color:rgba(255,255,255,0.35); margin-top:8px; }}
.pt {{ font-family:'Inter'; font-weight:400; font-size:25px; color:rgba(255,255,255,0.72); line-height:1.55; }}
.footer {{ position:absolute; bottom:32px; left:50px; right:50px; display:flex; justify-content:space-between; align-items:center; }}
.fh {{ font-size:15px; color:rgba(255,255,255,0.3); font-weight:500; }}
.page {{ padding:7px 18px; border:1px solid rgba(255,255,255,0.18); border-radius:7px; font-size:14px; font-weight:600; color:rgba(255,255,255,0.45); }}
.fs {{ font-size:15px; color:rgba(255,255,255,0.3); }}
</style></head><body><div class="slide">
<div class="glow"></div>
<div class="brand-header"><div class="brand-circle">DS</div><div class="brand-name">DS Marketing</div></div>
<div class="big-num">{num:02d}</div><div class="divider"></div>
<div class="headline">{headline.upper()}</div>
<div class="points">{pts}</div>
<div class="footer"><div class="fh">Instagram &nbsp;|&nbsp; DS.Marketing</div><div class="page">Page {page}/{total}</div><div class="fs">swipe &larr;</div></div>
</div></body></html>"""


def html_stat(big_num, label, desc, page, total):
    return f"""<!DOCTYPE html><html><head>{FONTS}<style>
{BASE_CSS}
.slide {{ background:#000; display:flex; flex-direction:column; align-items:center; justify-content:center; }}
.glow {{ position:absolute; top:50%; left:50%; transform:translate(-50%,-60%); width:500px; height:500px; border-radius:50%; background:radial-gradient(circle,rgba(255,255,255,0.06) 0%,transparent 65%); }}
.sn {{ font-family:'Poppins'; font-weight:900; font-size:175px; color:white; text-shadow:0 0 60px rgba(255,255,255,0.22),0 0 120px rgba(255,255,255,0.08); letter-spacing:-3px; z-index:2; }}
.sl {{ font-family:'Poppins'; font-weight:700; font-size:46px; color:rgba(255,255,255,0.82); text-align:center; text-transform:uppercase; margin-top:8px; max-width:800px; line-height:1.2; z-index:2; }}
.line {{ width:160px; height:1px; background:rgba(255,255,255,0.25); margin:30px 0; z-index:2; }}
.sd {{ font-family:'Inter'; font-weight:400; font-size:23px; color:rgba(255,255,255,0.45); text-align:center; max-width:680px; line-height:1.6; z-index:2; }}
.footer {{ position:absolute; bottom:32px; left:50px; right:50px; display:flex; justify-content:space-between; align-items:center; }}
.fh {{ font-size:15px; color:rgba(255,255,255,0.3); font-weight:500; }}
.page {{ padding:7px 18px; border:1px solid rgba(255,255,255,0.18); border-radius:7px; font-size:14px; font-weight:600; color:rgba(255,255,255,0.45); }}
.fs {{ font-size:15px; color:rgba(255,255,255,0.3); }}
</style></head><body><div class="slide">
<div class="glow"></div>
<div class="brand-header"><div class="brand-circle">DS</div><div class="brand-name">DS Marketing</div></div>
<div class="sn">{big_num}</div><div class="sl">{label}</div><div class="line"></div><div class="sd">{desc}</div>
<div class="footer"><div class="fh">Instagram &nbsp;|&nbsp; DS.Marketing</div><div class="page">Page {page}/{total}</div><div class="fs">swipe &larr;</div></div>
</div></body></html>"""


def html_quote(text, author, page, total):
    return f"""<!DOCTYPE html><html><head>{FONTS}<style>
{BASE_CSS}
.slide {{ background:#050505; display:flex; flex-direction:column; align-items:center; justify-content:center; }}
.glow {{ position:absolute; top:40%; left:50%; transform:translate(-50%,-50%); width:700px; height:400px; border-radius:50%; background:radial-gradient(ellipse,rgba(255,255,255,0.03) 0%,transparent 70%); }}
.qm {{ font-family:'Poppins'; font-weight:900; font-size:200px; color:rgba(255,255,255,0.07); line-height:0.8; margin-bottom:-30px; z-index:2; }}
.qt {{ font-family:'Inter'; font-weight:300; font-style:italic; font-size:35px; color:rgba(255,255,255,0.88); text-align:center; max-width:800px; line-height:1.65; z-index:2; padding:0 30px; }}
.ql {{ width:110px; height:1px; background:rgba(255,255,255,0.22); margin:40px 0 22px; z-index:2; }}
.qa {{ font-family:'Inter'; font-weight:600; font-size:21px; color:rgba(255,255,255,0.45); letter-spacing:2px; text-transform:uppercase; z-index:2; }}
.footer {{ position:absolute; bottom:32px; left:50px; right:50px; display:flex; justify-content:space-between; align-items:center; }}
.fh {{ font-size:15px; color:rgba(255,255,255,0.3); font-weight:500; }}
.page {{ padding:7px 18px; border:1px solid rgba(255,255,255,0.18); border-radius:7px; font-size:14px; font-weight:600; color:rgba(255,255,255,0.45); }}
.fs {{ font-size:15px; color:rgba(255,255,255,0.3); }}
</style></head><body><div class="slide">
<div class="glow"></div>
<div class="brand-header"><div class="brand-circle">DS</div><div class="brand-name">DS Marketing</div></div>
<div class="qm">&ldquo;</div><div class="qt">{text}</div><div class="ql"></div><div class="qa">&mdash; {author}</div>
<div class="footer"><div class="fh">Instagram &nbsp;|&nbsp; DS.Marketing</div><div class="page">Page {page}/{total}</div><div class="fs">swipe &larr;</div></div>
</div></body></html>"""


def html_cta(total):
    dots = "".join(f'<div class="dot {"active" if i==total-1 else ""}"></div>' for i in range(min(total,8)))
    return f"""<!DOCTYPE html><html><head>{FONTS}<style>
{BASE_CSS}
.slide {{ background:#000; display:flex; flex-direction:column; align-items:center; justify-content:center; }}
.glow {{ position:absolute; top:28%; left:50%; transform:translate(-50%,-50%); width:500px; height:500px; border-radius:50%; background:radial-gradient(circle,rgba(255,255,255,0.06) 0%,transparent 60%); }}
.logo {{ font-family:'Poppins'; font-weight:900; font-size:175px; color:white; letter-spacing:-5px; text-shadow:0 0 60px rgba(255,255,255,0.18),0 0 120px rgba(255,255,255,0.06); z-index:2; }}
.sub {{ font-family:'Poppins'; font-weight:700; font-size:40px; color:rgba(255,255,255,0.65); letter-spacing:12px; text-transform:uppercase; margin-top:-8px; z-index:2; }}
.line {{ width:380px; height:2px; background:linear-gradient(90deg,transparent,rgba(255,255,255,0.45),transparent); margin:32px 0; z-index:2; }}
.handle {{ font-family:'Inter'; font-weight:700; font-size:30px; color:white; z-index:2; }}
.site {{ font-family:'Inter'; font-weight:400; font-size:19px; color:rgba(255,255,255,0.35); margin-top:10px; z-index:2; }}
.btn {{ margin-top:45px; padding:16px 45px; border:2px solid white; border-radius:12px; font-family:'Poppins'; font-weight:700; font-size:26px; color:white; letter-spacing:2px; text-transform:uppercase; z-index:2; }}
.dots {{ position:absolute; bottom:12px; display:flex; gap:8px; z-index:10; }}
.dot {{ width:8px; height:8px; border-radius:50%; background:rgba(255,255,255,0.25); }}
.dot.active {{ background:white; }}
</style></head><body><div class="slide">
<div class="glow"></div>
<div class="logo">DS</div><div class="sub">Marketing</div><div class="line"></div>
<div class="handle">{BRAND}</div><div class="site">{BRAND_SITE}</div>
<div class="btn">Follow For More</div>
<div class="dots">{dots}</div>
</div></body></html>"""


# ══════════════════════════════════════════════
# RENDERER
# ══════════════════════════════════════════════
def setup_playwright():
    try:
        from playwright.sync_api import sync_playwright
        return True
    except ImportError:
        print("  Installing Playwright + Chromium (one time, ~200MB)...")
        subprocess.check_call([sys.executable, "-m", "pip", "install", "playwright"],
                              stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        subprocess.check_call([sys.executable, "-m", "playwright", "install", "chromium"],
                              stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        try:
            from playwright.sync_api import sync_playwright
            return True
        except: return False

def render_html(browser, html, out_path):
    page = browser.new_page(viewport={"width": W, "height": H}, device_scale_factor=2)
    page.set_content(html)
    try: page.wait_for_load_state("networkidle", timeout=15000)
    except: pass
    try: page.wait_for_function("document.fonts.ready", timeout=10000)
    except: pass
    page.wait_for_timeout(500)
    page.screenshot(path=out_path)
    page.close()

def img_to_b64(path):
    if not path or not os.path.exists(path): return ""
    with open(path, "rb") as f:
        return f"data:image/png;base64,{base64.b64encode(f.read()).decode()}"


# ══════════════════════════════════════════════
# DEFAULT CONTENT
# ══════════════════════════════════════════════
DEFAULTS = [
    {
        "topic": "5 Social Media Mistakes Killing Your Growth",
        "cover_lines": ["5 Mistakes", "Killing Your", "Growth"],
        "cover_sub": "Stop making these. Your competitors aren't.",
        "number": 5,
        "bg_prompt": "professional dark moody office desk with MacBook laptop showing analytics, coffee cup, dramatic cinematic studio lighting, dark background, shallow depth of field, ultra realistic, 8K photography",
        "slides": [
            {"headline": "Posting Without a Strategy", "points": ["Random posts give random results. Period.", "A content calendar isn't optional — it's the foundation.", "Plan 7 days ahead. Minimum."]},
            {"headline": "Ignoring Your Analytics", "points": ["The data tells you exactly what works.", "Check insights weekly, not monthly.", "Double down on your top 3 performing formats."]},
            {"headline": "No Hook in the First Line", "points": ["80% of people never read past line one.", "Lead with a bold claim or question.", "Your hook IS your content strategy."]},
            {"headline": "Zero Engagement Strategy", "points": ["Post and ghost? The algorithm notices.", "Reply to every comment within 1 hour.", "Spend 15 min/day engaging in your niche."]},
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
        "bg_prompt": "modern minimalist workspace planner notebook and pen on dark wooden desk, dramatic rim lighting from the side, cinematic dark moody atmosphere, studio photography, 8K, shallow depth of field",
        "slides": [
            {"headline": "Monday: Education", "points": ["Tips, frameworks, and how-to content.", "Teach something they can use TODAY.", "Carousels and infographics crush it here."]},
            {"headline": "Tuesday: Industry Insights", "points": ["Share trends and predictions.", "Position yourself as the go-to expert.", "Add your unique take — don't just reshare."]},
            {"headline": "Wednesday: Case Studies", "points": ["Show real results with real numbers.", "Before and after is powerful.", "Let the data tell the story."]},
            {"headline": "Thursday: Behind the Scenes", "points": ["Show your process, not just results.", "People connect with people, not logos.", "Raw > polished for BTS content."]},
            {"headline": "Friday: Engagement", "points": ["Ask questions. Start conversations.", "Polls, quizzes, and hot takes.", "The algorithm rewards real interaction."]},
        ],
        "quote": {"text": "Content is fire. Social media is gasoline.", "author": "Jay Baer"},
        "stat": {"number": "4X", "label": "more engagement with consistent posting", "desc": "Brands that post 4+ times per week see 4X the engagement."},
        "caption": "Stop guessing what to post.\n\nThis content calendar framework has helped dozens of brands go from random posting to strategic growth.\n\nSave this for your next planning session.\n\n@dsmarketing.agency\n\n#contentcalendar #socialmedia #marketing #instagramstrategy #contentplan #digitalmarketing #smm #contentcreation #marketingstrategy #branding #entrepreneur #businessgrowth #instagramtips #growthhacking #socialmediamanager"
    },
    {
        "topic": "The Hook Formula That Stops the Scroll",
        "cover_lines": ["The Hook", "Formula"],
        "cover_sub": "3 seconds. That's all you get.",
        "number": 3,
        "bg_prompt": "dramatic close up of hands typing on laptop keyboard with blue screen glow reflecting on face, dark room, cinematic moody lighting, studio photography, ultra realistic, 8K",
        "slides": [
            {"headline": "Start With a Number", "points": ["Numbers stop the scroll instantly.", "'7 mistakes' hits harder than 'some mistakes'.", "Odd numbers outperform even ones."]},
            {"headline": "Ask a Loaded Question", "points": ["Questions trigger the curiosity gap.", "'Why is your content failing?' — they HAVE to know.", "Make them feel the problem before the solution."]},
            {"headline": "Make a Bold Claim", "points": ["'Your marketing strategy is dead.'", "Controversy drives engagement.", "Be bold — but always back it up with value."]},
        ],
        "quote": {"text": "You never get a second chance to make a first impression.", "author": "Will Rogers"},
        "stat": {"number": "3s", "label": "to stop the scroll", "desc": "If your hook doesn't grab them in 3 seconds, nothing else matters."},
        "caption": "Your hook is your entire strategy.\n\n3 seconds. That's the window. Miss it and they scroll past forever.\n\nWhich formula will you try first? Tell me below.\n\n@dsmarketing.agency\n\n#hooks #copywriting #instagramtips #contentcreator #marketing #socialmedia #digitalmarketing #instagramgrowth #writingtips #branding #entrepreneur #smm #engagement #contentmarketing #reels"
    },
    {
        "topic": "How to 10X Your Instagram Engagement",
        "cover_lines": ["10X Your", "Engagement"],
        "cover_sub": "Engagement isn't luck. It's strategy.",
        "number": 5,
        "bg_prompt": "iPhone showing Instagram app with notification badges on dark marble desk next to small plant, soft dramatic studio lighting, luxury aesthetic, dark background, 8K photography, shallow depth of field",
        "slides": [
            {"headline": "Reply to Every Comment", "points": ["The first hour is the golden window.", "Replies count as engagement signals too.", "Turn comments into real conversations."]},
            {"headline": "Use Carousel Posts", "points": ["Carousels get 3X the engagement of single images.", "Each swipe signals the algorithm you're valuable.", "Aim for 7-10 slides per carousel."]},
            {"headline": "Write Better Captions", "points": ["Long captions = more time spent on your post.", "Tell stories, not just tips.", "End every caption with a question or CTA."]},
            {"headline": "Post at Peak Hours", "points": ["Check YOUR analytics — not generic advice.", "Test different times over 2 weeks.", "Consistency matters more than perfect timing."]},
            {"headline": "Create Shareable Content", "points": ["If they won't share it, it's not valuable enough.", "Saves and shares matter more than likes.", "Think: 'Would I send this to a friend?'"]},
        ],
        "quote": {"text": "People don't buy goods and services. They buy relations, stories, and magic.", "author": "Seth Godin"},
        "stat": {"number": "312%", "label": "boost from carousel posts", "desc": "Carousels drive 312% more engagement than single image posts."},
        "caption": "Zero engagement? It's not the algorithm. It's your approach.\n\nThese 5 tactics have helped our clients build thriving communities.\n\nDouble tap if you're trying these today.\n\n@dsmarketing.agency\n\n#engagement #instagramengagement #socialmedia #marketing #instagramgrowth #contentcreator #digitalmarketing #smm #branding #entrepreneur #businesstips #socialmediamarketing #instagramtips #contentmarketing #growth"
    },
    {
        "topic": "Build a Brand People Remember",
        "cover_lines": ["Build a Brand", "People", "Remember"],
        "cover_sub": "If they can't recognize you in 2 seconds, you don't have a brand.",
        "number": 4,
        "bg_prompt": "luxury premium items on dark velvet background, leather notebook, fountain pen, expensive watch, dramatic studio lighting, high contrast, cinematic dark moody photography, 8K",
        "slides": [
            {"headline": "Define Your Voice", "points": ["Are you the mentor? The rebel? The expert?", "Pick 3 adjectives that define your brand.", "Use them consistently in every piece of content."]},
            {"headline": "Visual Consistency", "points": ["Same colors. Same fonts. Same energy.", "Your grid should look like ONE brand.", "Templates save time and build instant recognition."]},
            {"headline": "Tell Your Story", "points": ["People follow people, not logos.", "Share your why — not just your what.", "Vulnerability builds trust faster than expertise."]},
            {"headline": "Create a Signature", "points": ["One thing only YOU do.", "A catchphrase, a format, a visual style.", "Make it impossible to confuse you with anyone else."]},
        ],
        "quote": {"text": "Your brand is what people say about you when you're not in the room.", "author": "Jeff Bezos"},
        "stat": {"number": "2s", "label": "to recognize a strong brand", "desc": "The best brands are instantly recognizable. Is yours?"},
        "caption": "You don't have a brand. You have a logo.\n\nA real brand is felt, not just seen. Build something they can't forget.\n\nTag someone building their brand right now.\n\n@dsmarketing.agency\n\n#branding #brandidentity #marketing #personalbranding #instagram #entrepreneur #businessowner #digitalmarketing #contentcreator #smm #socialmedia #brandstrategy #design #growth #mindset"
    },
]


# ══════════════════════════════════════════════
# MAIN
# ══════════════════════════════════════════════
def main():
    print()
    print("  ╔══════════════════════════════════════════════════════════╗")
    print("  ║  DS MARKETING MEGA ENGINE v1.0                          ║")
    print("  ║  Gemini (Nano Banana) → FLUX → Pollinations             ║")
    print("  ║  Ollama Content AI → Playwright CSS Rendering           ║")
    print("  ╚══════════════════════════════════════════════════════════╝")
    print()

    # API Keys
    keys = load_keys()
    if not keys.get("gemini") and not keys.get("together"):
        keys = setup_keys()
    else:
        print("  API Keys:")
        if keys.get("gemini"): print(f"    ✓ Gemini (Nano Banana)")
        if keys.get("together"): print(f"    ✓ Together.ai (FLUX)")
        if not keys.get("gemini") and not keys.get("together"):
            print(f"    ⊘ No keys — using Pollinations fallback")
        print()

    # Engines status
    engines = []
    if keys.get("gemini"): engines.append("Gemini (Nano Banana)")
    if keys.get("together"): engines.append("FLUX (Together.ai)")
    engines.append("Pollinations (fallback)")
    print(f"  Image engines: {' → '.join(engines)}")
    print()

    # Playwright
    print("  STEP 1: Rendering Engine")
    print("  " + "─" * 58)
    if not setup_playwright():
        print("    ! Playwright failed. Run: pip install playwright && playwright install chromium")
        return
    from playwright.sync_api import sync_playwright
    print("    ✓ Playwright ready (Chromium + Google Fonts)")
    print()

    # Ollama
    print("  STEP 2: Content AI (Ollama)")
    print("  " + "─" * 58)
    carousels = None
    if check_ollama():
        model = find_model()
        if model:
            print(f"    ✓ Ollama ({model})")
            print("    Generating content...")
            result = ask_ai_json("""Generate 5 Instagram carousel ideas for a social media marketing agency.
Return ONLY JSON array with objects: "topic" (string), "cover_lines" (array of 2-3 strings), "cover_sub" (string), "number" (int), "bg_prompt" (dark moody cinematic image prompt), "slides" (array of objects with "headline" and "points" array of 3 strings), "quote" (object: "text","author"), "stat" (object: "number","label","desc"), "caption" (string with hashtags).
Return ONLY JSON.""", model)
            if result and isinstance(result, list) and len(result) >= 3:
                carousels = result
                print(f"    ✓ {len(carousels)} posts generated")
    if not carousels:
        carousels = DEFAULTS
        print(f"    Using {len(carousels)} premium defaults")
    print()

    os.makedirs(OUT, exist_ok=True)
    os.makedirs(f"{OUT}/captions", exist_ok=True)

    # Build
    print("  STEP 3: Building Carousels")
    print("  " + "─" * 58)
    print(f"    Output: {W}x{H} @ 2x retina ({W*2}x{H*2}px)")
    print(f"    Fonts: Poppins + Inter (Google Fonts)")
    print()

    with sync_playwright() as p:
        browser = p.chromium.launch()

        for idx, c in enumerate(carousels):
            topic = c.get("topic", f"Post {idx+1}")
            slides = c.get("slides", [])
            has_stat = bool(c.get("stat"))
            has_quote = bool(c.get("quote"))
            total = 1 + len(slides) + int(has_stat) + int(has_quote) + 1

            post_dir = f"{OUT}/post_{idx+1:02d}"
            os.makedirs(post_dir, exist_ok=True)

            print(f"  POST {idx+1}: {topic}")
            print("  " + "─" * 58)

            # AI Background
            bg_prompt = c.get("bg_prompt", "dark professional desk, dramatic lighting, 8K")
            bg_path = f"{post_dir}/_bg.png"
            print(f"    Generating cover background...")
            generate_image(bg_prompt, bg_path, keys, "cover background")
            bg_b64 = img_to_b64(bg_path)

            n = 1
            # Cover
            print(f"    Rendering slides...")
            render_html(browser, html_cover(c.get("cover_lines",["TITLE"]), c.get("cover_sub",""), bg_b64, c.get("number"), total), f"{post_dir}/{n:02d}_cover.png")
            n += 1

            # Content
            for si, s in enumerate(slides):
                render_html(browser, html_content(si+1, s.get("headline",""), s.get("points",[]), n, total), f"{post_dir}/{n:02d}_content.png")
                n += 1

            # Stat
            if has_stat:
                st = c["stat"]
                render_html(browser, html_stat(st.get("number",""), st.get("label",""), st.get("desc",""), n, total), f"{post_dir}/{n:02d}_stat.png")
                n += 1

            # Quote
            if has_quote:
                q = c["quote"]
                render_html(browser, html_quote(q.get("text",""), q.get("author",""), n, total), f"{post_dir}/{n:02d}_quote.png")
                n += 1

            # CTA
            render_html(browser, html_cta(total), f"{post_dir}/{n:02d}_cta.png")

            # Caption
            cap = c.get("caption", "")
            if cap:
                with open(f"{post_dir}/caption.txt", "w") as f: f.write(cap)
                with open(f"{OUT}/captions/post_{idx+1:02d}.txt", "w") as f: f.write(f"TOPIC: {topic}\n\n{cap}")

            # Cleanup bg
            try: os.remove(bg_path)
            except: pass

            print(f"    ✓ {total} slides done\n")

        browser.close()

    print("  ╔══════════════════════════════════════════════════════════╗")
    print("  ║  ALL DONE — MEGA ENGINE COMPLETE                        ║")
    print("  ╚══════════════════════════════════════════════════════════╝")
    print(f"\n  Your content: {OUT}/\n")
    for i, c in enumerate(carousels):
        print(f"     post_{i+1:02d}/  {c.get('topic','')}")
    print(f"""
  Each post: cover + content slides + stat + quote + CTA + caption
  Style: Roman Knox x CashFish x Dark Gradients (B&W)
  Rendering: Real CSS (Poppins/Inter) @ 2x retina
  Images: {'Gemini (Nano Banana)' if keys.get('gemini') else 'FLUX' if keys.get('together') else 'Pollinations'}

  Upload directly to Instagram as carousel posts.
  Captions ready in {OUT}/captions/
""")


if __name__ == "__main__":
    main()
