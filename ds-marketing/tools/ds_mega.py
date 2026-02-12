#!/usr/bin/env python3
"""
DS MARKETING MEGA ENGINE v3.0
═══════════════════════════════════════════════════════
AI visuals on EVERY slide. Not just text on black.

IMAGE ENGINES (best first):
  1. Google Gemini — best quality, free API key
  2. Together.ai FLUX — excellent open model
  3. Pollinations.ai — always works, no key

Per post generates: 1 cover background + 1 topic 3D icon
Cover bg shown at 50% brightness (actually visible)
3D icon displayed on all content slides in glowing circle

SETUP:
  1. Get free Gemini API key: https://aistudio.google.com/apikey
  2. Run: python3 ds_mega.py
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
    keys = load_keys()
    changed = False
    print()
    print("  ┌─────────────────────────────────────────────┐")
    print("  │  API KEY SETUP (free, no credit card)        │")
    print("  └─────────────────────────────────────────────┘")
    print()
    if not keys.get("gemini"):
        print("  GEMINI (best AI image generation):")
        print("  → https://aistudio.google.com/apikey")
        print()
        key = input("  Paste your Gemini API key (or Enter to skip): ").strip()
        if key:
            keys["gemini"] = key
            changed = True
            print("  ✓ Gemini key saved")
        else:
            print("  ⊘ Skipped")
        print()
    if not keys.get("together"):
        print("  TOGETHER.AI (FLUX backup):")
        print("  → https://api.together.ai/settings/api-keys")
        print()
        key = input("  Paste your Together.ai key (or Enter to skip): ").strip()
        if key:
            keys["together"] = key
            changed = True
            print("  ✓ Together.ai key saved")
        else:
            print("  ⊘ Skipped")
        print()
    if changed:
        save_keys(keys)
        print(f"  Keys saved to {KEYS_FILE}\n")
    return keys


# ══════════════════════════════════════════════
# IMAGE ENGINES
# ══════════════════════════════════════════════
def gemini_generate(prompt, api_key, out_path):
    try:
        url = f"https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash-exp:generateContent?key={api_key}"
        payload = {
            "contents": [{"parts": [{"text": f"Generate an image: {prompt}"}]}],
            "generationConfig": {"responseModalities": ["TEXT", "IMAGE"]}
        }
        r = requests.post(url, json=payload, timeout=60)
        if r.status_code != 200: return None
        data = r.json()
        for candidate in data.get("candidates", []):
            for part in candidate.get("content", {}).get("parts", []):
                if "inlineData" in part:
                    img_data = base64.b64decode(part["inlineData"]["data"])
                    img = Image.open(io.BytesIO(img_data))
                    img.save(out_path, quality=95)
                    return out_path
        return None
    except: return None

def gemini_imagen(prompt, api_key, out_path):
    try:
        url = f"https://generativelanguage.googleapis.com/v1beta/models/imagen-3.0-generate-002:predict?key={api_key}"
        payload = {"instances": [{"prompt": prompt}], "parameters": {"sampleCount": 1, "aspectRatio": "4:5"}}
        r = requests.post(url, json=payload, timeout=60)
        if r.status_code == 200:
            data = r.json()
            predictions = data.get("predictions", [])
            if predictions:
                img_bytes = base64.b64decode(predictions[0].get("bytesBase64Encoded", ""))
                img = Image.open(io.BytesIO(img_bytes))
                img.save(out_path, quality=95)
                return out_path
        # Fallback to flash
        url2 = f"https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash-exp:generateContent?key={api_key}"
        payload2 = {
            "contents": [{"parts": [{"text": f"Generate a high quality photorealistic image: {prompt}"}]}],
            "generationConfig": {"responseModalities": ["TEXT", "IMAGE"]}
        }
        r = requests.post(url2, json=payload2, timeout=60)
        if r.status_code != 200: return None
        data = r.json()
        for candidate in data.get("candidates", []):
            for part in candidate.get("content", {}).get("parts", []):
                if "inlineData" in part:
                    img_data = base64.b64decode(part["inlineData"]["data"])
                    img = Image.open(io.BytesIO(img_data))
                    img.save(out_path, quality=95)
                    return out_path
        return None
    except: return None

def flux_generate(prompt, api_key, out_path):
    try:
        r = requests.post("https://api.together.xyz/v1/images/generations",
            headers={"Authorization": f"Bearer {api_key}"},
            json={"model": "black-forest-labs/FLUX.1-schnell-Free", "prompt": prompt,
                  "width": 1024, "height": 1280, "steps": 4, "n": 1, "response_format": "b64_json"},
            timeout=60)
        if r.status_code != 200: return None
        data = r.json()
        img_data = base64.b64decode(data["data"][0]["b64_json"])
        img = Image.open(io.BytesIO(img_data))
        img.save(out_path, quality=95)
        return out_path
    except: return None

def pollinations_generate(prompt, out_path, w=1080, h=1080):
    try:
        seed = random.randint(1000, 99999)
        url = f"https://image.pollinations.ai/prompt/{urllib.parse.quote(prompt)}?width={w}&height={h}&model=flux&nologo=true&seed={seed}"
        urllib.request.urlretrieve(url, out_path)
        if os.path.exists(out_path) and os.path.getsize(out_path) > 5000: return out_path
        return None
    except: return None

def generate_image(prompt, out_path, keys, label="image"):
    if os.path.exists(out_path) and os.path.getsize(out_path) > 5000:
        print(f"      ✓ {label} (cached)")
        return out_path
    if keys.get("gemini"):
        print(f"      → Gemini...", end=" ", flush=True)
        result = gemini_generate(prompt, keys["gemini"], out_path)
        if not result: result = gemini_imagen(prompt, keys["gemini"], out_path)
        if result: print("✓"); return result
        print("✗")
    if keys.get("together"):
        print(f"      → FLUX...", end=" ", flush=True)
        result = flux_generate(prompt, keys["together"], out_path)
        if result: print("✓"); return result
        print("✗")
    print(f"      → Pollinations...", end=" ", flush=True)
    result = pollinations_generate(prompt, out_path)
    if result: print("✓"); return result
    print("✗ all failed")
    return None


# ══════════════════════════════════════════════
# OLLAMA
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
                {"role": "system", "content": "You are the creative director for DS Marketing, a premium social media marketing agency."},
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
# HTML TEMPLATES v3 — AI Visuals on Every Slide
# ══════════════════════════════════════════════

FONTS = """<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800;900&family=Poppins:wght@400;600;700;800;900&display=swap" rel="stylesheet">"""

BASE_CSS = """* { margin: 0; padding: 0; box-sizing: border-box; }
body { width: 1080px; height: 1350px; overflow: hidden; font-family: 'Inter', sans-serif; -webkit-font-smoothing: antialiased; }
.slide { width: 1080px; height: 1350px; position: relative; overflow: hidden; }
.brand-header { position: absolute; top: 40px; left: 50px; display: flex; align-items: center; gap: 14px; z-index: 10; }
.brand-circle { width: 42px; height: 42px; border-radius: 50%; border: 2px solid rgba(255,255,255,0.9); display: flex; align-items: center; justify-content: center; font-family: 'Poppins'; font-weight: 800; font-size: 15px; color: white; background: rgba(255,255,255,0.06); }
.brand-name { font-weight: 700; font-size: 20px; color: rgba(255,255,255,0.85); letter-spacing: 0.5px; }"""


# ──────────────────────────────────────────────
# COVER — Photo bg VISIBLE + rich layering
# ──────────────────────────────────────────────
def html_cover(lines, subtitle, bg_b64="", number=None, total=8, topic_tag="Social Media Tips"):
    lines_html = "\n".join(f'<div class="title-line">{l}</div>' for l in lines)
    num_html = f'<div class="num-badge">{number}</div>' if number else ""
    dots = "".join(f'<div class="dot {"active" if i==0 else ""}"></div>' for i in range(min(total, 8)))
    bg_style = f"background-image:url('{bg_b64}');" if bg_b64 and len(bg_b64) > 100 else ""
    return f"""<!DOCTYPE html><html><head>{FONTS}<style>
{BASE_CSS}
.slide {{ background: #000; }}

/* AI photo background — VISIBLE at 50% brightness */
.bg {{ position:absolute; inset:0; {bg_style} background-size:cover; background-position:center; filter:brightness(0.5) saturate(0.3) contrast(1.1); }}

/* Gradient orbs for atmosphere */
.orb1 {{ position:absolute; top:-20%; right:-15%; width:900px; height:900px; border-radius:50%; background:radial-gradient(circle,rgba(255,255,255,0.1) 0%,transparent 55%); }}
.orb2 {{ position:absolute; bottom:5%; left:-25%; width:700px; height:700px; border-radius:50%; background:radial-gradient(circle,rgba(255,255,255,0.06) 0%,transparent 50%); }}

/* Light streaks */
.streak1 {{ position:absolute; top:-200px; right:200px; width:2px; height:900px; background:linear-gradient(180deg,transparent,rgba(255,255,255,0.08),rgba(255,255,255,0.12),rgba(255,255,255,0.08),transparent); transform:rotate(25deg); }}
.streak2 {{ position:absolute; top:-100px; right:300px; width:1px; height:700px; background:linear-gradient(180deg,transparent,rgba(255,255,255,0.05),transparent); transform:rotate(25deg); }}

/* Bottom gradient to readable */
.overlay {{ position:absolute; inset:0; background:linear-gradient(180deg,
    rgba(0,0,0,0.1) 0%, rgba(0,0,0,0.0) 20%, rgba(0,0,0,0.15) 40%,
    rgba(0,0,0,0.7) 65%, rgba(0,0,0,0.92) 80%, #000 95%); }}

/* Grid texture */
.grid {{ position:absolute; inset:0; opacity:0.03;
    background-image: linear-gradient(rgba(255,255,255,0.5) 1px, transparent 1px),
                      linear-gradient(90deg, rgba(255,255,255,0.5) 1px, transparent 1px);
    background-size: 60px 60px; }}

/* Accent elements */
.accent-line {{ position:absolute; top:120px; left:50px; width:60px; height:3px; background:white; z-index:10; }}
.topic-tag {{ position:absolute; top:155px; left:50px; font-family:'Inter'; font-weight:600; font-size:13px; color:rgba(255,255,255,0.35); text-transform:uppercase; letter-spacing:5px; z-index:10; }}

/* Number badge */
.num-badge {{ position:absolute; top:28px; right:50px; font-family:'Poppins'; font-weight:900; font-size:140px; color:white; text-shadow:0 0 80px rgba(255,255,255,0.3),0 0 160px rgba(255,255,255,0.08); z-index:10; line-height:1; }}
.num-glow {{ position:absolute; top:10px; right:25px; width:230px; height:230px; border-radius:50%; background:radial-gradient(circle,rgba(255,255,255,0.12) 0%,transparent 60%); z-index:9; }}

/* Title */
.content {{ position:absolute; bottom:110px; left:50px; right:50px; z-index:10; }}
.title-line {{ font-family:'Poppins'; font-weight:900; font-size:88px; color:white; line-height:1.02; letter-spacing:-3px; text-shadow:0 4px 40px rgba(0,0,0,0.9); }}
.subtitle {{ font-family:'Inter'; font-weight:400; font-size:25px; color:rgba(255,255,255,0.55); margin-top:22px; }}

/* Footer */
.bottom-line {{ position:absolute; bottom:95px; left:50px; right:50px; height:1px; background:linear-gradient(90deg,rgba(255,255,255,0.3),rgba(255,255,255,0.02)); z-index:10; }}
.footer {{ position:absolute; bottom:30px; left:50px; right:50px; display:flex; justify-content:space-between; align-items:center; z-index:10; }}
.handle {{ font-size:17px; color:rgba(255,255,255,0.6); font-weight:700; }}
.swipe {{ font-size:14px; color:rgba(255,255,255,0.3); font-weight:500; letter-spacing:1px; }}
.dots {{ position:absolute; bottom:8px; left:50%; transform:translateX(-50%); display:flex; gap:8px; z-index:10; }}
.dot {{ width:8px; height:8px; border-radius:50%; background:rgba(255,255,255,0.2); }}
.dot.active {{ background:white; }}
</style></head><body><div class="slide">
<div class="bg"></div>
<div class="orb1"></div><div class="orb2"></div>
<div class="streak1"></div><div class="streak2"></div>
<div class="overlay"></div>
<div class="grid"></div>
<div class="brand-header"><div class="brand-circle">DS</div><div class="brand-name">DS Marketing</div></div>
<div class="accent-line"></div>
<div class="topic-tag">{topic_tag}</div>
{num_html}
{"<div class='num-glow'></div>" if number else ""}
<div class="content">{lines_html}<div class="subtitle">{subtitle}</div></div>
<div class="bottom-line"></div>
<div class="footer"><div class="handle">{BRAND}</div><div class="swipe">SWIPE &larr;</div></div>
<div class="dots">{dots}</div>
</div></body></html>"""


# ──────────────────────────────────────────────
# CONTENT — 3D icon + numbered bullets
# ──────────────────────────────────────────────
def html_content(num, headline, points, page, total, icon_b64=""):
    pts = ""
    for i, p in enumerate(points):
        letter = chr(65 + i)
        pts += f'''<div class="point">
            <div class="point-letter">{letter}</div>
            <div class="point-text">{p}</div>
        </div>'''

    icon_style = f"background-image:url('{icon_b64}');" if icon_b64 and len(icon_b64) > 100 else ""
    has_icon = "visible" if icon_style else "hidden"

    return f"""<!DOCTYPE html><html><head>{FONTS}<style>
{BASE_CSS}
.slide {{ background:linear-gradient(165deg,#0c0c0c 0%,#080808 100%); }}

/* Background */
.grid {{ position:absolute; inset:0; opacity:0.025;
    background-image: linear-gradient(rgba(255,255,255,0.5) 1px, transparent 1px),
                      linear-gradient(90deg, rgba(255,255,255,0.5) 1px, transparent 1px);
    background-size: 60px 60px; }}
.orb-r {{ position:absolute; top:200px; right:-100px; width:500px; height:500px; border-radius:50%; background:radial-gradient(circle,rgba(255,255,255,0.05) 0%,transparent 60%); }}
.orb-l {{ position:absolute; bottom:100px; left:-150px; width:500px; height:500px; border-radius:50%; background:radial-gradient(circle,rgba(255,255,255,0.04) 0%,transparent 55%); }}

/* Side accent */
.side-line {{ position:absolute; top:120px; left:50px; width:3px; height:70px; background:linear-gradient(180deg,white,transparent); z-index:10; }}

/* Number */
.num-section {{ position:absolute; top:105px; left:70px; z-index:10; }}
.big-num {{ font-family:'Poppins'; font-weight:900; font-size:160px; color:white; line-height:0.85; text-shadow:0 0 80px rgba(255,255,255,0.08); }}
.num-label {{ font-family:'Inter'; font-weight:600; font-size:12px; color:rgba(255,255,255,0.2); letter-spacing:4px; text-transform:uppercase; margin-top:5px; }}

/* Divider */
.divider {{ position:absolute; top:300px; left:50px; right:50px; height:1px; background:linear-gradient(90deg,rgba(255,255,255,0.35),rgba(255,255,255,0.02)); z-index:10; }}

/* Headline */
.headline {{ position:absolute; top:320px; left:50px; right:80px; font-family:'Poppins'; font-weight:800; font-size:46px; color:white; line-height:1.1; letter-spacing:-1.5px; z-index:10; }}

/* 3D Icon visual — THE GAME CHANGER */
.icon-glow {{ position:absolute; top:410px; left:50%; transform:translateX(-50%); width:360px; height:360px; border-radius:50%; background:radial-gradient(circle,rgba(255,255,255,0.08) 0%,transparent 60%); z-index:5; visibility:{has_icon}; }}
.icon-ring {{ position:absolute; top:430px; left:50%; transform:translateX(-50%); width:280px; height:280px; border-radius:50%; border:1px solid rgba(255,255,255,0.08); z-index:6; visibility:{has_icon}; }}
.icon-frame {{ position:absolute; top:440px; left:50%; transform:translateX(-50%); width:260px; height:260px; border-radius:50%; overflow:hidden; z-index:7; {icon_style} background-size:cover; background-position:center; visibility:{has_icon}; }}

/* Points cards — below icon */
.points {{ position:absolute; top:{740 if icon_style else 440}px; left:50px; right:50px; bottom:80px; display:flex; flex-direction:column; justify-content:flex-start; gap:12px; z-index:10; }}
.point {{ display:flex; align-items:center; gap:20px; padding:24px 28px; background:rgba(255,255,255,0.03); border-radius:14px; border:1px solid rgba(255,255,255,0.06); }}
.point-letter {{ flex-shrink:0; width:40px; height:40px; display:flex; align-items:center; justify-content:center; font-family:'Poppins'; font-weight:800; font-size:17px; color:white; background:rgba(255,255,255,0.08); border-radius:10px; }}
.point-text {{ font-family:'Inter'; font-weight:500; font-size:24px; color:rgba(255,255,255,0.8); line-height:1.45; }}

/* Footer */
.footer {{ position:absolute; bottom:28px; left:50px; right:50px; display:flex; justify-content:space-between; align-items:center; z-index:10; }}
.fh {{ font-size:14px; color:rgba(255,255,255,0.25); font-weight:600; }}
.page {{ padding:7px 18px; border:1px solid rgba(255,255,255,0.15); border-radius:8px; font-size:13px; font-weight:700; color:rgba(255,255,255,0.4); }}
.fs {{ font-size:14px; color:rgba(255,255,255,0.2); letter-spacing:1px; }}
</style></head><body><div class="slide">
<div class="grid"></div>
<div class="orb-r"></div><div class="orb-l"></div>
<div class="brand-header"><div class="brand-circle">DS</div><div class="brand-name">DS Marketing</div></div>
<div class="side-line"></div>
<div class="num-section">
    <div class="big-num">{num:02d}</div>
    <div class="num-label">Step {num} of {total - 2}</div>
</div>
<div class="divider"></div>
<div class="headline">{headline.upper()}</div>
<div class="icon-glow"></div>
<div class="icon-ring"></div>
<div class="icon-frame"></div>
<div class="points">{pts}</div>
<div class="footer"><div class="fh">{BRAND}</div><div class="page">{page} / {total}</div><div class="fs">SWIPE &larr;</div></div>
</div></body></html>"""


# ──────────────────────────────────────────────
# STAT — Big number with bg image
# ──────────────────────────────────────────────
def html_stat(big_num, label, desc, page, total, bg_b64=""):
    bg_style = f"background-image:url('{bg_b64}');" if bg_b64 and len(bg_b64) > 100 else ""
    return f"""<!DOCTYPE html><html><head>{FONTS}<style>
{BASE_CSS}
.slide {{ background:#050505; display:flex; flex-direction:column; align-items:center; justify-content:center; }}

/* Background image — subtle */
.bg {{ position:absolute; inset:0; {bg_style} background-size:cover; background-position:center; filter:brightness(0.2) saturate(0.1) blur(8px); }}
.bg-overlay {{ position:absolute; inset:0; background:radial-gradient(ellipse at center, rgba(0,0,0,0.5) 0%, rgba(0,0,0,0.85) 70%); }}

/* Grid */
.grid {{ position:absolute; inset:0; opacity:0.02;
    background-image: linear-gradient(rgba(255,255,255,0.5) 1px, transparent 1px),
                      linear-gradient(90deg, rgba(255,255,255,0.5) 1px, transparent 1px);
    background-size: 60px 60px; }}

/* Glow + rings */
.glow {{ position:absolute; top:50%; left:50%; transform:translate(-50%,-55%); width:600px; height:600px; border-radius:50%; background:radial-gradient(circle,rgba(255,255,255,0.08) 0%,transparent 55%); }}
.ring {{ position:absolute; top:50%; left:50%; transform:translate(-50%,-55%); width:420px; height:420px; border-radius:50%; border:1px solid rgba(255,255,255,0.06); }}
.ring2 {{ position:absolute; top:50%; left:50%; transform:translate(-50%,-55%); width:500px; height:500px; border-radius:50%; border:1px solid rgba(255,255,255,0.03); }}

/* Corner marks */
.cm-tl {{ position:absolute; top:100px; left:50px; }}
.cm-tl::before {{ content:''; display:block; width:25px; height:1px; background:rgba(255,255,255,0.2); }}
.cm-tl::after {{ content:''; display:block; width:1px; height:25px; background:rgba(255,255,255,0.2); margin-top:-1px; }}
.cm-br {{ position:absolute; bottom:100px; right:50px; text-align:right; }}
.cm-br::before {{ content:''; display:block; width:25px; height:1px; background:rgba(255,255,255,0.2); margin-left:auto; }}
.cm-br::after {{ content:''; display:block; width:1px; height:25px; background:rgba(255,255,255,0.2); margin-left:auto; margin-top:-1px; }}

/* Content */
.data-label {{ font-family:'Inter'; font-weight:600; font-size:12px; color:rgba(255,255,255,0.2); letter-spacing:5px; text-transform:uppercase; margin-bottom:15px; z-index:5; }}
.stat-num {{ font-family:'Poppins'; font-weight:900; font-size:180px; color:white; text-shadow:0 0 80px rgba(255,255,255,0.2),0 0 160px rgba(255,255,255,0.06); letter-spacing:-5px; z-index:5; line-height:1; }}
.stat-label {{ font-family:'Poppins'; font-weight:700; font-size:38px; color:rgba(255,255,255,0.85); text-align:center; text-transform:uppercase; margin-top:15px; max-width:800px; line-height:1.2; z-index:5; }}
.stat-line {{ width:160px; height:2px; background:linear-gradient(90deg,transparent,rgba(255,255,255,0.3),transparent); margin:35px 0; z-index:5; }}
.stat-desc {{ font-family:'Inter'; font-weight:400; font-size:22px; color:rgba(255,255,255,0.4); text-align:center; max-width:700px; line-height:1.7; z-index:5; padding:0 30px; }}

/* Footer */
.footer {{ position:absolute; bottom:32px; left:50px; right:50px; display:flex; justify-content:space-between; align-items:center; z-index:10; }}
.fh {{ font-size:14px; color:rgba(255,255,255,0.25); font-weight:600; }}
.page {{ padding:7px 18px; border:1px solid rgba(255,255,255,0.15); border-radius:8px; font-size:13px; font-weight:700; color:rgba(255,255,255,0.4); }}
.fs {{ font-size:14px; color:rgba(255,255,255,0.2); letter-spacing:1px; }}
</style></head><body><div class="slide">
<div class="bg"></div><div class="bg-overlay"></div>
<div class="grid"></div>
<div class="glow"></div><div class="ring"></div><div class="ring2"></div>
<div class="brand-header"><div class="brand-circle">DS</div><div class="brand-name">DS Marketing</div></div>
<div class="cm-tl"></div><div class="cm-br"></div>
<div class="data-label">The Data Says</div>
<div class="stat-num">{big_num}</div>
<div class="stat-label">{label}</div>
<div class="stat-line"></div>
<div class="stat-desc">{desc}</div>
<div class="footer"><div class="fh">{BRAND}</div><div class="page">{page} / {total}</div><div class="fs">SWIPE &larr;</div></div>
</div></body></html>"""


# ──────────────────────────────────────────────
# QUOTE — With bg image subtle
# ──────────────────────────────────────────────
def html_quote(text, author, page, total, bg_b64=""):
    bg_style = f"background-image:url('{bg_b64}');" if bg_b64 and len(bg_b64) > 100 else ""
    return f"""<!DOCTYPE html><html><head>{FONTS}<style>
{BASE_CSS}
.slide {{ background:#030303; display:flex; flex-direction:column; align-items:center; justify-content:center; }}

/* Subtle bg image */
.bg {{ position:absolute; inset:0; {bg_style} background-size:cover; background-position:center; filter:brightness(0.15) saturate(0.05) blur(12px); }}
.bg-overlay {{ position:absolute; inset:0; background:radial-gradient(ellipse at center, rgba(0,0,0,0.4) 0%, rgba(0,0,0,0.9) 70%); }}

/* Grid */
.grid {{ position:absolute; inset:0; opacity:0.015;
    background-image: linear-gradient(rgba(255,255,255,0.5) 1px, transparent 1px),
                      linear-gradient(90deg, rgba(255,255,255,0.5) 1px, transparent 1px);
    background-size: 60px 60px; }}

/* Big decorative quote marks */
.quote-bg {{ position:absolute; top:180px; left:70px; font-family:'Poppins'; font-weight:900; font-size:350px; color:rgba(255,255,255,0.035); line-height:0.7; z-index:1; }}

/* Vertical lines */
.vline-l {{ position:absolute; top:25%; left:55px; width:1px; height:50%; background:linear-gradient(180deg,transparent,rgba(255,255,255,0.08),transparent); }}
.vline-r {{ position:absolute; top:20%; right:55px; width:1px; height:60%; background:linear-gradient(180deg,transparent,rgba(255,255,255,0.05),transparent); }}

/* Quote */
.quote-wrap {{ z-index:5; max-width:850px; padding:0 70px; display:flex; flex-direction:column; align-items:center; }}
.qmark {{ font-family:'Poppins'; font-weight:900; font-size:90px; color:rgba(255,255,255,0.15); line-height:0.6; margin-bottom:15px; }}
.qtext {{ font-family:'Inter'; font-weight:300; font-style:italic; font-size:36px; color:rgba(255,255,255,0.92); text-align:center; line-height:1.7; }}
.qline {{ width:120px; height:2px; background:linear-gradient(90deg,transparent,rgba(255,255,255,0.25),transparent); margin:40px 0 25px; }}
.qauthor {{ font-family:'Inter'; font-weight:600; font-size:20px; color:rgba(255,255,255,0.4); letter-spacing:3px; text-transform:uppercase; }}

/* Footer */
.footer {{ position:absolute; bottom:32px; left:50px; right:50px; display:flex; justify-content:space-between; align-items:center; z-index:10; }}
.fh {{ font-size:14px; color:rgba(255,255,255,0.25); font-weight:600; }}
.page {{ padding:7px 18px; border:1px solid rgba(255,255,255,0.15); border-radius:8px; font-size:13px; font-weight:700; color:rgba(255,255,255,0.4); }}
.fs {{ font-size:14px; color:rgba(255,255,255,0.2); letter-spacing:1px; }}
</style></head><body><div class="slide">
<div class="bg"></div><div class="bg-overlay"></div>
<div class="grid"></div>
<div class="quote-bg">&ldquo;</div>
<div class="vline-l"></div><div class="vline-r"></div>
<div class="brand-header"><div class="brand-circle">DS</div><div class="brand-name">DS Marketing</div></div>
<div class="quote-wrap">
    <div class="qmark">&ldquo;</div>
    <div class="qtext">{text}</div>
    <div class="qline"></div>
    <div class="qauthor">&mdash; {author}</div>
</div>
<div class="footer"><div class="fh">{BRAND}</div><div class="page">{page} / {total}</div><div class="fs">SWIPE &larr;</div></div>
</div></body></html>"""


# ──────────────────────────────────────────────
# CTA — Follow + brand
# ──────────────────────────────────────────────
def html_cta(total):
    dots = "".join(f'<div class="dot {"active" if i==total-1 else ""}"></div>' for i in range(min(total, 8)))
    return f"""<!DOCTYPE html><html><head>{FONTS}<style>
{BASE_CSS}
.slide {{ background:#000; display:flex; flex-direction:column; align-items:center; justify-content:center; }}
.grid {{ position:absolute; inset:0; opacity:0.02;
    background-image: linear-gradient(rgba(255,255,255,0.5) 1px, transparent 1px),
                      linear-gradient(90deg, rgba(255,255,255,0.5) 1px, transparent 1px);
    background-size: 60px 60px; }}
.orb {{ position:absolute; top:20%; left:50%; transform:translateX(-50%); width:600px; height:600px; border-radius:50%; background:radial-gradient(circle,rgba(255,255,255,0.07) 0%,transparent 50%); }}
.ring {{ position:absolute; top:50%; left:50%; transform:translate(-50%,-52%); width:480px; height:480px; border-radius:50%; border:1px solid rgba(255,255,255,0.05); }}

/* Corner marks */
.cm {{ position:absolute; }}
.cm-tl {{ top:50px; left:50px; }}
.cm-tr {{ top:50px; right:50px; }}
.cm-bl {{ bottom:50px; left:50px; }}
.cm-br {{ bottom:50px; right:50px; }}
.cm::before, .cm::after {{ content:''; display:block; background:rgba(255,255,255,0.12); }}
.cm-tl::before, .cm-tr::before {{ width:20px; height:1px; }}
.cm-tl::after, .cm-tr::after {{ width:1px; height:20px; margin-top:-1px; }}
.cm-tr::before {{ margin-left:auto; }}
.cm-tr::after {{ margin-left:auto; }}
.cm-bl::before {{ width:1px; height:20px; }}
.cm-bl::after {{ width:20px; height:1px; }}
.cm-br::before {{ width:1px; height:20px; margin-left:auto; }}
.cm-br::after {{ width:20px; height:1px; margin-left:auto; }}

.logo {{ font-family:'Poppins'; font-weight:900; font-size:160px; color:white; letter-spacing:-6px; text-shadow:0 0 80px rgba(255,255,255,0.12); z-index:5; }}
.sub {{ font-family:'Poppins'; font-weight:700; font-size:36px; color:rgba(255,255,255,0.55); letter-spacing:14px; text-transform:uppercase; margin-top:-5px; z-index:5; }}
.line {{ width:350px; height:2px; background:linear-gradient(90deg,transparent,rgba(255,255,255,0.35),transparent); margin:35px 0; z-index:5; }}
.handle {{ font-family:'Inter'; font-weight:700; font-size:30px; color:white; z-index:5; }}
.site {{ font-family:'Inter'; font-weight:400; font-size:17px; color:rgba(255,255,255,0.25); margin-top:10px; z-index:5; }}
.btn {{ margin-top:50px; padding:18px 50px; border:2px solid white; border-radius:14px; font-family:'Poppins'; font-weight:700; font-size:22px; color:white; letter-spacing:3px; text-transform:uppercase; z-index:5; }}
.dots {{ position:absolute; bottom:12px; display:flex; gap:8px; z-index:10; }}
.dot {{ width:8px; height:8px; border-radius:50%; background:rgba(255,255,255,0.2); }}
.dot.active {{ background:white; }}
</style></head><body><div class="slide">
<div class="grid"></div><div class="orb"></div><div class="ring"></div>
<div class="cm cm-tl"></div><div class="cm cm-tr"></div><div class="cm cm-bl"></div><div class="cm cm-br"></div>
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
        print("  Installing Playwright + Chromium (~200MB)...")
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
# DEFAULT CONTENT — with icon prompts
# ══════════════════════════════════════════════
DEFAULTS = [
    {
        "topic": "5 Social Media Mistakes Killing Your Growth",
        "cover_lines": ["5 Mistakes", "Killing Your", "Growth"],
        "cover_sub": "Stop making these. Your competitors aren't.",
        "topic_tag": "Growth Strategy",
        "number": 5,
        "bg_prompt": "professional dark moody office desk with MacBook laptop showing analytics dashboard, coffee cup, dramatic cinematic studio lighting, dark background, shallow depth of field, ultra realistic, 8K",
        "icon_prompt": "3D glossy white chess knight piece floating on pure black background, minimal, soft studio lighting, product render, high detail, 8K",
        "slides": [
            {"headline": "Posting Without a Strategy", "points": ["Random posts = random results. Period.", "A content calendar isn't optional — it's the foundation.", "Plan 7 days ahead. Minimum."]},
            {"headline": "Ignoring Your Analytics", "points": ["The data tells you exactly what works.", "Check insights weekly, not monthly.", "Double down on your top 3 performing formats."]},
            {"headline": "No Hook in First Line", "points": ["80% of people never read past line one.", "Lead with a bold claim or question.", "Your hook IS your content strategy."]},
            {"headline": "Zero Engagement Plan", "points": ["Post and ghost? The algorithm notices.", "Reply to every comment within 1 hour.", "Spend 15 min/day engaging in your niche."]},
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
        "topic_tag": "Content Strategy",
        "number": 7,
        "bg_prompt": "modern minimalist workspace planner notebook and pen on dark wooden desk, dramatic rim lighting, cinematic dark moody, studio photography, 8K, shallow depth of field",
        "icon_prompt": "3D glossy white calendar planner with checkmarks floating on pure black background, minimal, soft studio lighting, product render, 8K",
        "slides": [
            {"headline": "Monday: Education", "points": ["Tips, frameworks, and how-to content.", "Teach something they can use TODAY.", "Carousels and infographics crush it here."]},
            {"headline": "Tuesday: Industry Insights", "points": ["Share trends and predictions.", "Position yourself as the go-to expert.", "Add your unique take — don't reshare."]},
            {"headline": "Wednesday: Case Studies", "points": ["Show real results with real numbers.", "Before and after is powerful.", "Let the data tell the story."]},
            {"headline": "Thursday: Behind Scenes", "points": ["Show your process, not just results.", "People connect with people, not logos.", "Raw > polished for BTS content."]},
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
        "topic_tag": "Copywriting",
        "number": 3,
        "bg_prompt": "dramatic close up of hands typing on laptop keyboard with blue screen glow, dark room, cinematic moody lighting, studio photography, ultra realistic, 8K",
        "icon_prompt": "3D glossy white fishing hook with sparkle effect floating on pure black background, minimal, soft studio lighting, product render, 8K",
        "slides": [
            {"headline": "Start With a Number", "points": ["Numbers stop the scroll instantly.", "'7 mistakes' hits harder than 'some mistakes'.", "Odd numbers outperform even ones."]},
            {"headline": "Ask a Loaded Question", "points": ["Questions trigger the curiosity gap.", "'Why is your content failing?' — they MUST know.", "Make them feel the problem first."]},
            {"headline": "Make a Bold Claim", "points": ["'Your marketing strategy is dead.'", "Controversy drives engagement.", "Be bold — but back it up with value."]},
        ],
        "quote": {"text": "You never get a second chance to make a first impression.", "author": "Will Rogers"},
        "stat": {"number": "3s", "label": "to stop the scroll", "desc": "If your hook doesn't grab them in 3 seconds, nothing else matters."},
        "caption": "Your hook is your entire strategy.\n\n3 seconds. That's the window. Miss it and they scroll past forever.\n\nWhich formula will you try first? Tell me below.\n\n@dsmarketing.agency\n\n#hooks #copywriting #instagramtips #contentcreator #marketing #socialmedia #digitalmarketing #instagramgrowth #writingtips #branding #entrepreneur #smm #engagement #contentmarketing #reels"
    },
    {
        "topic": "How to 10X Your Instagram Engagement",
        "cover_lines": ["10X Your", "Engagement"],
        "cover_sub": "Engagement isn't luck. It's strategy.",
        "topic_tag": "Engagement",
        "number": 5,
        "bg_prompt": "iPhone showing Instagram app with notification badges on dark marble desk, dramatic studio lighting, luxury aesthetic, dark background, 8K photography, shallow depth of field",
        "icon_prompt": "3D glossy white rocket ship launching with flame trail on pure black background, minimal, soft studio lighting, product render, 8K",
        "slides": [
            {"headline": "Reply to Every Comment", "points": ["The first hour is the golden window.", "Replies count as engagement signals.", "Turn comments into conversations."]},
            {"headline": "Use Carousel Posts", "points": ["Carousels get 3X the engagement.", "Each swipe signals the algorithm.", "Aim for 7-10 slides per carousel."]},
            {"headline": "Write Better Captions", "points": ["Long captions = more time on post.", "Tell stories, not just tips.", "End every caption with a CTA."]},
            {"headline": "Post at Peak Hours", "points": ["Check YOUR analytics, not generic advice.", "Test different times over 2 weeks.", "Consistency > perfect timing."]},
            {"headline": "Create Shareable Content", "points": ["If they won't share it, it's not enough.", "Saves and shares > likes.", "'Would I send this to a friend?'"]},
        ],
        "quote": {"text": "People don't buy goods and services. They buy relations, stories, and magic.", "author": "Seth Godin"},
        "stat": {"number": "312%", "label": "boost from carousel posts", "desc": "Carousels drive 312% more engagement than single image posts."},
        "caption": "Zero engagement? It's not the algorithm. It's your approach.\n\nThese 5 tactics have helped our clients build thriving communities.\n\nDouble tap if you're trying these today.\n\n@dsmarketing.agency\n\n#engagement #instagramengagement #socialmedia #marketing #instagramgrowth #contentcreator #digitalmarketing #smm #branding #entrepreneur #businesstips #socialmediamarketing #instagramtips #contentmarketing #growth"
    },
    {
        "topic": "Build a Brand People Remember",
        "cover_lines": ["Build a Brand", "People", "Remember"],
        "cover_sub": "If they can't recognize you in 2 seconds, you don't have a brand.",
        "topic_tag": "Branding",
        "number": 4,
        "bg_prompt": "luxury premium items on dark velvet background, leather notebook, fountain pen, expensive watch, dramatic studio lighting, cinematic dark moody, 8K",
        "icon_prompt": "3D glossy white crown with gemstone floating on pure black background, minimal, soft studio lighting, product render, high detail, 8K",
        "slides": [
            {"headline": "Define Your Voice", "points": ["Are you the mentor? The rebel? The expert?", "Pick 3 adjectives that define your brand.", "Use them in every piece of content."]},
            {"headline": "Visual Consistency", "points": ["Same colors. Same fonts. Same energy.", "Your grid should look like ONE brand.", "Templates build instant recognition."]},
            {"headline": "Tell Your Story", "points": ["People follow people, not logos.", "Share your why — not just your what.", "Vulnerability builds trust fast."]},
            {"headline": "Create a Signature", "points": ["One thing only YOU do.", "A catchphrase, format, or visual style.", "Make it impossible to confuse you."]},
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
    print("  ║  DS MARKETING MEGA ENGINE v3.0                          ║")
    print("  ║  AI Visuals on Every Slide — Not Just Text              ║")
    print("  ║  3D Icons + Visible Backgrounds + Premium CSS           ║")
    print("  ╚══════════════════════════════════════════════════════════╝")
    print()

    # API Keys
    keys = load_keys()
    if not keys.get("gemini") and not keys.get("together"):
        keys = setup_keys()
    else:
        print("  API Keys:")
        if keys.get("gemini"): print("    ✓ Gemini")
        if keys.get("together"): print("    ✓ Together.ai (FLUX)")
        if not keys.get("gemini") and not keys.get("together"):
            print("    ⊘ No keys — using Pollinations")
        print()

    engines = []
    if keys.get("gemini"): engines.append("Gemini")
    if keys.get("together"): engines.append("FLUX")
    engines.append("Pollinations")
    print(f"  Image engines: {' → '.join(engines)}")
    print()

    # Playwright
    print("  STEP 1: Rendering Engine")
    print("  " + "─" * 58)
    if not setup_playwright():
        print("    ! Playwright failed.")
        return
    from playwright.sync_api import sync_playwright
    print("    ✓ Playwright ready")
    print()

    # Ollama
    print("  STEP 2: Content AI")
    print("  " + "─" * 58)
    carousels = None
    if check_ollama():
        model = find_model()
        if model:
            print(f"    ✓ Ollama ({model})")
            print("    Generating content...")
            result = ask_ai_json("""Generate 5 Instagram carousel ideas for a social media marketing agency.
Return ONLY JSON array. Each object needs: "topic" (string), "cover_lines" (array 2-3 strings), "cover_sub" (subtitle), "topic_tag" (2-word label), "number" (int), "bg_prompt" (dark cinematic photo prompt), "icon_prompt" (3D white object on black background prompt), "slides" (array of {"headline","points":[3 strings]}), "quote" ({"text","author"}), "stat" ({"number","label","desc"}), "caption" (with hashtags).
Return ONLY valid JSON.""", model)
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
    print(f"    Resolution: {W}x{H} @ 2x retina ({W*2}x{H*2}px)")
    print(f"    Per post: 1 cover bg + 1 3D icon = 2 AI images")
    print(f"    Total AI images: {len(carousels) * 2}")
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

            # AI Background for cover
            bg_prompt = c.get("bg_prompt", "dark professional desk, dramatic lighting, 8K")
            bg_path = f"{post_dir}/_bg.png"
            print(f"    Generating cover background...")
            generate_image(bg_prompt, bg_path, keys, "cover bg")
            bg_b64 = img_to_b64(bg_path)

            # AI 3D Icon for content slides
            icon_prompt = c.get("icon_prompt", "3D glossy white geometric shape on pure black background, minimal, studio lighting, 8K")
            icon_path = f"{post_dir}/_icon.png"
            print(f"    Generating 3D icon...")
            generate_image(icon_prompt, icon_path, keys, "3D icon")
            icon_b64 = img_to_b64(icon_path)

            n = 1
            print(f"    Rendering {total} slides...")

            # Cover
            topic_tag = c.get("topic_tag", "Social Media Tips")
            render_html(browser, html_cover(
                c.get("cover_lines", ["TITLE"]), c.get("cover_sub", ""),
                bg_b64, c.get("number"), total, topic_tag
            ), f"{post_dir}/{n:02d}_cover.png")
            n += 1

            # Content slides — each gets the 3D icon
            for si, s in enumerate(slides):
                render_html(browser, html_content(
                    si+1, s.get("headline", ""), s.get("points", []),
                    n, total, icon_b64
                ), f"{post_dir}/{n:02d}_content.png")
                n += 1

            # Stat — gets bg image
            if has_stat:
                st = c["stat"]
                render_html(browser, html_stat(
                    st.get("number", ""), st.get("label", ""), st.get("desc", ""),
                    n, total, bg_b64
                ), f"{post_dir}/{n:02d}_stat.png")
                n += 1

            # Quote — gets bg image
            if has_quote:
                q = c["quote"]
                render_html(browser, html_quote(
                    q.get("text", ""), q.get("author", ""),
                    n, total, bg_b64
                ), f"{post_dir}/{n:02d}_quote.png")
                n += 1

            # CTA
            render_html(browser, html_cta(total), f"{post_dir}/{n:02d}_cta.png")

            # Caption
            cap = c.get("caption", "")
            if cap:
                with open(f"{post_dir}/caption.txt", "w") as f: f.write(cap)
                with open(f"{OUT}/captions/post_{idx+1:02d}.txt", "w") as f: f.write(f"TOPIC: {topic}\n\n{cap}")

            # Cleanup temp images
            for tmp in [bg_path, icon_path]:
                try: os.remove(tmp)
                except: pass

            print(f"    ✓ Done\n")

        browser.close()

    print("  ╔══════════════════════════════════════════════════════════╗")
    print("  ║  ALL DONE — MEGA ENGINE v3.0 COMPLETE                   ║")
    print("  ╚══════════════════════════════════════════════════════════╝")
    print(f"\n  Your content: {OUT}/\n")
    for i, c in enumerate(carousels):
        print(f"     post_{i+1:02d}/  {c.get('topic','')}")
    print(f"""
  v3.0 — WHAT'S NEW:
    ✓ AI-generated cover backgrounds ACTUALLY VISIBLE (50% brightness)
    ✓ AI-generated 3D icon on EVERY content slide (glowing circle)
    ✓ Background imagery on stat + quote slides too
    ✓ 2 AI images per post ({len(carousels) * 2} total generated)
    ✓ Card-style bullet points with letter markers
    ✓ Grid texture + gradient orbs on every slide

  Rendering: Playwright CSS @ 2x retina (Poppins + Inter)
  Images: {'Gemini' if keys.get('gemini') else 'FLUX' if keys.get('together') else 'Pollinations'}

  Upload directly to Instagram as carousel posts.
  Captions: {OUT}/captions/
""")


if __name__ == "__main__":
    main()
