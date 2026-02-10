#!/usr/bin/env python3
"""
DS Marketing V4 — High Quality Character Slides
=================================================
python3 generate_v4.py

- Downloads premium 3D characters from Pollinations.ai
- Professional compositing with color grading
- Bold typography, strong neon accents, depth effects
"""

import urllib.request, urllib.parse, os, math, random, time, sys

try:
    from PIL import Image, ImageDraw, ImageFont, ImageFilter, ImageChops, ImageEnhance
except ImportError:
    os.system(f"{sys.executable} -m pip install Pillow")
    from PIL import Image, ImageDraw, ImageFont, ImageFilter, ImageChops, ImageEnhance

W, H = 1080, 1080
OUT = "ds-marketing-v4"
ACCENT = (0, 220, 160)
ACCENT2 = (0, 180, 255)  # Secondary blue accent

# ─── FONTS ───
def _find(paths, size):
    for p in paths:
        if os.path.exists(p):
            try: return ImageFont.truetype(p, size)
            except: continue
    return ImageFont.load_default()

def font_heavy(sz): return _find([
    "/System/Library/Fonts/Supplemental/Impact.ttf",
    "/Library/Fonts/Impact.ttf",
    "BebasNeue-Regular.ttf",
    "/System/Library/Fonts/Supplemental/Arial Bold.ttf",
    "/usr/share/fonts/truetype/liberation/LiberationSans-Bold.ttf",
], sz)

def font_bold(sz): return _find([
    "/System/Library/Fonts/Supplemental/Arial Bold.ttf",
    "/Library/Fonts/Arial Bold.ttf",
    "/usr/share/fonts/truetype/liberation/LiberationSans-Bold.ttf",
], sz)

def font_reg(sz): return _find([
    "/System/Library/Fonts/Supplemental/Arial.ttf",
    "/Library/Fonts/Arial.ttf",
    "/usr/share/fonts/truetype/liberation/LiberationSans-Regular.ttf",
], sz)


# ─── AI DOWNLOAD ───
def download_ai(prompt, path, w=1080, h=1080, model="flux-pro"):
    """Download high-quality AI image."""
    url = f"https://image.pollinations.ai/prompt/{urllib.parse.quote(prompt)}?width={w}&height={h}&model={model}&nologo=true&enhance=true&seed={random.randint(1,99999)}"
    headers = {"User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36"}
    for attempt in range(4):
        try:
            req = urllib.request.Request(url, headers=headers)
            data = urllib.request.urlopen(req, timeout=180).read()
            if len(data) > 5000:
                with open(path, "wb") as f: f.write(data)
                return True
        except Exception as e:
            wait = 2 ** (attempt + 1)
            print(f"    ⏳ Retry {attempt+1}/3 in {wait}s...")
            time.sleep(wait)
    return False


# ─── VISUAL ENGINE ───
def make_bg(cx=0.5, cy=0.35, r=0.65, c1=(25,35,70), c2=None):
    """Premium dark background with dual radial gradients."""
    img = Image.new("RGB", (W,H), (0,0,0))
    px = img.load()
    cx1, cy1 = int(W*cx), int(H*cy)
    rad = int(W*r)
    for y in range(0,H,2):
        for x in range(0,W,2):
            d = math.sqrt((x-cx1)**2+(y-cy1)**2)
            t = min(1.0, d/rad); t = t*t
            v = tuple(int(c1[i]*(1-t)) for i in range(3))
            px[x,y] = v
            if x+1<W: px[x+1,y] = v
            if y+1<H: px[x,y+1] = v
            if x+1<W and y+1<H: px[x+1,y+1] = v
    if c2:
        img2 = Image.new("RGB",(W,H),(0,0,0))
        px2 = img2.load()
        cx2,cy2 = int(W*c2[0]), int(H*c2[1])
        rad2 = int(W*0.5)
        for y in range(0,H,2):
            for x in range(0,W,2):
                d = math.sqrt((x-cx2)**2+(y-cy2)**2)
                t = min(1.0,d/rad2); t = t*t
                v = tuple(int(c2[2][i]*(1-t)) for i in range(3))
                px2[x,y] = v
                if x+1<W: px2[x+1,y] = v
                if y+1<H: px2[x,y+1] = v
                if x+1<W and y+1<H: px2[x+1,y+1] = v
        img = ImageChops.add(img, img2)
    return img

def color_grade(img, tint=(0,10,25), contrast=1.2, saturation=1.1, sharp=1.3):
    """Cinema-style color grading."""
    t = Image.new("RGB",(W,H),tint)
    img = ImageChops.add(img, t, scale=3)
    img = ImageEnhance.Contrast(img).enhance(contrast)
    img = ImageEnhance.Color(img).enhance(saturation)
    img = ImageEnhance.Sharpness(img).enhance(sharp)
    return img

def grain(img, n=7):
    px = img.load(); random.seed(42)
    for _ in range(W*H//3):
        x,y = random.randint(0,W-1),random.randint(0,H-1)
        r,g,b = px[x,y]; v = random.randint(-n,n)
        px[x,y] = (max(0,min(255,r+v)),max(0,min(255,g+v)),max(0,min(255,b+v)))
    return img

def vignette(img, s=0.75):
    m = Image.new("L",(W,H),0); d = ImageDraw.Draw(m)
    cx,cy = W//2,H//2; mr = int(W*s)
    for r in range(mr,0,-1): d.ellipse([cx-r,cy-r,cx+r,cy+r], fill=int(255*r/mr))
    return Image.composite(img, Image.new("RGB",(W,H),(0,0,0)), m)

def darken_zone(img, y_start, y_end, strength=0.9):
    """Darken a horizontal zone with smooth gradient edges."""
    ov = Image.new("RGBA",(W,H),(0,0,0,0)); d = ImageDraw.Draw(ov)
    fade = 80  # px fade on each edge
    for y in range(max(0,y_start-fade), min(H,y_end+fade)):
        if y < y_start:
            a = int(255 * strength * (1 - (y_start-y)/fade))
        elif y > y_end:
            a = int(255 * strength * (1 - (y-y_end)/fade))
        else:
            a = int(255 * strength)
        a = max(0, min(255, a))
        d.line([(0,y),(W,y)], fill=(0,0,0,a))
    return Image.alpha_composite(img.convert("RGBA"), ov).convert("RGB")

def neon_h(draw, y, x1, x2, color=ACCENT, glow=16, w=2):
    for o in range(glow,0,-1):
        a = int(55*(1-o/glow)**0.5)
        gc = tuple(max(0,min(255,int(c*a/60))) for c in color)
        draw.line([(x1,y-o),(x2,y-o)],fill=gc)
        draw.line([(x1,y+o),(x2,y+o)],fill=gc)
    draw.line([(x1,y),(x2,y)],fill=color,width=w)

def neon_v(draw, x, y1, y2, color=ACCENT, glow=8, w=2):
    for o in range(glow,0,-1):
        a = int(55*(1-o/glow)**0.5)
        gc = tuple(max(0,min(255,int(c*a/60))) for c in color)
        draw.line([(x-o,y1),(x-o,y2)],fill=gc)
        draw.line([(x+o,y1),(x+o,y2)],fill=gc)
    draw.line([(x,y1),(x,y2)],fill=color,width=w)

def neon_rect(draw, box, color=ACCENT, glow=10, w=2):
    """Neon glowing rectangle."""
    x1,y1,x2,y2 = box
    neon_h(draw,y1,x1,x2,color,glow,w)
    neon_h(draw,y2,x1,x2,color,glow,w)
    neon_v(draw,x1,y1,y2,color,glow,w)
    neon_v(draw,x2,y1,y2,color,glow,w)

def glow_text(img, text, font, x, y, color=ACCENT, blur=14, alpha=100):
    """Strong neon glow behind text."""
    g = Image.new("RGBA",(W,H),(0,0,0,0))
    gd = ImageDraw.Draw(g)
    # Draw text multiple times for stronger glow
    for dx in range(-2,3):
        for dy in range(-2,3):
            gd.text((x+dx,y+dy), text, font=font, fill=(*color,alpha))
    g = g.filter(ImageFilter.GaussianBlur(radius=blur))
    return Image.alpha_composite(img.convert("RGBA"),g).convert("RGB")

def centered(draw, y, text, font, fill=(255,255,255)):
    bb = draw.textbbox((0,0),text,font=font)
    x = (W-(bb[2]-bb[0]))//2
    draw.text((x,y),text,font=font,fill=fill)
    return x, bb[3]-bb[1]

def wrap(text, font, mw, draw):
    words = text.split(); lines=[]; cur=""
    for w in words:
        t = f"{cur} {w}".strip()
        if draw.textbbox((0,0),t,font=font)[2]-draw.textbbox((0,0),t,font=font)[0] <= mw:
            cur = t
        else:
            if cur: lines.append(cur)
            cur = w
    if cur: lines.append(cur)
    return lines

def corners(draw, c=(50,50,55), m=42, l=55, w=2):
    for pts in [[(m,m),(m+l,m)],[(m,m),(m,m+l)],[(W-m-l,m),(W-m,m)],[(W-m,m),(W-m,m+l)],
                [(m,H-m),(m+l,H-m)],[(m,H-m-l),(m,H-m)],[(W-m-l,H-m),(W-m,H-m)],[(W-m,H-m-l),(W-m,H-m)]]:
        draw.line(pts, fill=c, width=w)

def dots(draw, sn, tot, y=H-75, ac=ACCENT):
    for i in range(min(tot,10)):
        dx = W//2-(tot*12)//2+i*24
        if i == sn-1:
            draw.ellipse([dx-5,y-5,dx+5,y+5], fill=ac)
        else:
            draw.ellipse([dx-3,y-3,dx+3,y+3], fill=(55,55,55))

def brand_footer(draw, ac=ACCENT):
    f = font_reg(17); h = "@dsmarketing.agency"
    bb = draw.textbbox((0,0),h,font=f)
    draw.text(((W-(bb[2]-bb[0]))//2, H-45), h, font=f, fill=(90,90,90))


# ─── PREMIUM CHARACTER PROMPTS (MUCH MORE DETAILED) ───
CHARS = {
    "strategist": (
        "Hyperrealistic 3D rendered character, confident powerful CEO businessman "
        "wearing premium tailored black suit with subtle sheen, arms crossed, standing "
        "in dramatic power pose, sharp jawline, determined expression, "
        "dark moody studio environment, volumetric fog, single dramatic key light "
        "from upper left creating rim lighting on shoulders, "
        "Pixar Dreamworks animation quality, subsurface scattering on skin, "
        "ray traced reflections, depth of field background blur, "
        "cinematic color grading teal and orange, 8K ultra detailed rendering, "
        "octane render, no text no words no letters no watermark"
    ),
    "frustrated": (
        "Hyperrealistic 3D rendered character, overwhelmed stressed businessman "
        "sitting at modern desk with head in both hands, messy papers scattered, "
        "laptop showing red declining charts, exhausted defeated expression, "
        "dark moody office with single overhead spotlight creating dramatic shadows, "
        "shallow depth of field, volumetric light rays through window blinds, "
        "Pixar quality rendering, cinematic blue-grey color grading, "
        "8K ultra detailed, octane render, emotional storytelling, "
        "no text no words no letters no watermark"
    ),
    "celebrating": (
        "Hyperrealistic 3D rendered character, ecstatic joyful businessman in black suit "
        "jumping in air with both fists raised in triumph celebration, huge genuine smile, "
        "golden confetti particles and sparkles swirling around, "
        "phone in pocket showing green upward growth charts, "
        "dark background with warm golden spotlight from above, lens flare, "
        "Pixar Dreamworks quality, ray traced, volumetric golden particles, "
        "cinematic warm color grading, 8K ultra detailed, "
        "no text no words no letters no watermark"
    ),
    "presenting": (
        "Hyperrealistic 3D rendered female character, confident professional businesswoman "
        "in sleek black blazer, pointing confidently at large floating holographic dashboard "
        "showing glowing green analytics charts metrics and graphs, "
        "dark futuristic executive office, blue and teal neon ambient lighting, "
        "holographic UI elements floating in air, volumetric fog, "
        "Pixar quality, subsurface skin scattering, ray traced holograms, "
        "cinematic teal color grading, 8K ultra detailed, "
        "no text no words no letters no watermark"
    ),
    "thinking": (
        "Hyperrealistic 3D rendered character, thoughtful contemplative businessman "
        "in premium black turtleneck, chin resting on hand thinking deeply, "
        "floating translucent calendar icons and clock symbols around head, "
        "dark atmospheric background with soft purple and blue accent lighting, "
        "shallow depth of field, bokeh light particles, "
        "Pixar quality, cinematic moody lighting, introspective mood, "
        "8K ultra detailed octane render, "
        "no text no words no letters no watermark"
    ),
    "scrolling": (
        "Hyperrealistic 3D rendered character, bored disengaged person in casual clothes "
        "mindlessly scrolling smartphone with glazed empty expression, slouching on couch, "
        "translucent social media notification icons hearts likes floating out of phone screen, "
        "dark room lit only by harsh blue phone screen light on face, "
        "dramatic chiaroscuro lighting, lonely moody atmosphere, "
        "Pixar quality, cinematic cold blue color grading, 8K ultra detailed, "
        "no text no words no letters no watermark"
    ),
    "architect": (
        "Hyperrealistic 3D rendered character, powerful visionary CEO in premium black suit "
        "standing behind glass desk, arms spread wide on desk surface, looking directly at camera, "
        "massive holographic blueprint of business systems floating in front, "
        "dark luxury executive corner office with panoramic city skyline night view, "
        "dramatic golden rim lighting from windows, volumetric atmosphere, "
        "Pixar Dreamworks quality, 8K cinematic, teal and gold color grading, "
        "no text no words no letters no watermark"
    ),
    "rocket": (
        "Hyperrealistic 3D rendered scene, sleek modern rocket ship launching vertically "
        "with massive flame exhaust trail, surrounded by floating glowing social media icons "
        "hearts stars engagement metrics in orbit, "
        "dark deep space background with colorful nebula and star field, "
        "dramatic upward camera angle, motion blur on rocket, volumetric fire particles, "
        "cinematic sci-fi lighting, lens flare from exhaust, 8K ultra detailed, "
        "no text no words no letters no watermark"
    ),
    "clock": (
        "Hyperrealistic 3D rendered dramatic scene, massive elegant golden luxury stopwatch "
        "floating in dark void showing number 3, cracking and exploding with light particles, "
        "golden energy sparks radiating outward, time pressure urgency concept, "
        "dark background with single powerful spotlight beam from above, "
        "volumetric dust particles catching light, shallow depth of field, "
        "cinematic dramatic lighting, 8K ultra detailed, "
        "no text no words no letters no watermark"
    ),
}


# ─── SLIDE TEMPLATES ───

def hook_slide(char_path, l1, l2, tag, out, ac=ACCENT):
    """Premium hook with character."""
    ch = Image.open(char_path).resize((W,H), Image.LANCZOS)
    ch = color_grade(ch, tint=(0,8,20), contrast=1.25, saturation=1.15, sharp=1.4)
    img = darken_zone(ch, 0, 220, 0.75)
    img = darken_zone(img, H-400, H, 0.88)
    img = vignette(img, 0.8)
    draw = ImageDraw.Draw(img)
    corners(draw, (60,60,65))

    # Brand + tag
    bf = font_bold(13); centered(draw, 45, "D S   M A R K E T I N G", bf, (100,100,100))
    if tag:
        tf = font_bold(20)
        bb = draw.textbbox((0,0),tag,font=tf); tw = bb[2]-bb[0]
        x = (W-tw)//2
        # Neon tag background
        neon_rect(draw, (x-15, 72, x+tw+15, 102), ac, glow=6, w=1)
        draw.text((x, 75), tag, font=tf, fill=ac)

    # Main headline with strong glow
    mf = font_heavy(92)
    lines = wrap(l1, mf, W-120, draw)
    total_h = len(lines)*100
    sy = H - 360 - total_h//2

    for i, ln in enumerate(lines):
        bb = draw.textbbox((0,0),ln,font=mf); x=(W-(bb[2]-bb[0]))//2
        img = glow_text(img, ln, mf, x, sy+i*100, ac, blur=18, alpha=110)
        draw = ImageDraw.Draw(img)
        # White text with slight shadow
        draw.text((x+2, sy+i*100+2), ln, font=mf, fill=(0,0,0))  # shadow
        centered(draw, sy+i*100, ln, mf, (255,255,255))

    if l2:
        f2 = font_heavy(78)
        bb = draw.textbbox((0,0),l2,font=f2); x=(W-(bb[2]-bb[0]))//2
        centered(draw, sy+len(lines)*100+10, l2, f2, (190,190,195))

    # Bottom bar
    neon_h(draw, H-140, 280, W-280, ac, glow=10)
    sf = font_reg(14); centered(draw, H-115, "S W I P E   →", sf, (110,110,110))
    brand_footer(draw, ac)
    img.save(out, quality=95); print(f"  ✓ {os.path.basename(out)}")


def num_slide_char(char_path, num, title, sub, sn, tot, out, ac=ACCENT):
    """Numbered slide with character background."""
    ch = Image.open(char_path).resize((W,H), Image.LANCZOS)
    ch = color_grade(ch, (0,5,15), 1.2, 1.1, 1.3)
    ch = ImageEnhance.Brightness(ch).enhance(0.45)
    img = darken_zone(ch, H-500, H, 0.92)
    img = vignette(img, 0.75)
    draw = ImageDraw.Draw(img)
    corners(draw, (50,50,55))

    # Large number with glow
    nf = font_heavy(160); ns = f"{num:02d}"
    nb = draw.textbbox((75,480), ns, font=nf)
    img = glow_text(img, ns, nf, 75, 480, ac, blur=20, alpha=120)
    draw = ImageDraw.Draw(img)
    draw.text((75,480), ns, font=nf, fill=(255,255,255))

    # Neon vertical line
    lx = nb[2]+20
    neon_v(draw, lx, 510, 660, ac, glow=10, w=3)

    # Title
    tf = font_heavy(44); tl = wrap(title.upper(), tf, W-lx-90, draw)
    ty = 520
    for ln in tl: draw.text((lx+28, ty), ln, font=tf, fill=(255,255,255)); ty+=52

    # Divider
    neon_h(draw, 720, 80, W-80, ac, glow=10)

    # Subtitle
    sf = font_reg(26); sl = wrap(sub, sf, W-170, draw)
    sy = 755
    for ln in sl: draw.text((90, sy), ln, font=sf, fill=(175,175,180)); sy+=38

    dots(draw, sn, tot); brand_footer(draw)
    img.save(out, quality=95); print(f"  ✓ {os.path.basename(out)}")


def num_slide_dark(num, title, sub, sn, tot, out, ac=ACCENT, bg=(22,30,58)):
    """Dark premium numbered slide (no character)."""
    img = make_bg(0.3, 0.25, 0.7, bg, (0.75, 0.8, (15,12,40)))
    img = grain(img, 6); img = vignette(img, 0.7)
    draw = ImageDraw.Draw(img)
    corners(draw)

    # Number with strong glow
    nf = font_heavy(160); ns = f"{num:02d}"
    nb = draw.textbbox((75,150), ns, font=nf)
    img = glow_text(img, ns, nf, 75, 150, ac, blur=22, alpha=130)
    draw = ImageDraw.Draw(img)
    draw.text((75,150), ns, font=nf, fill=(255,255,255))

    # Neon V line
    lx = nb[2]+22
    neon_v(draw, lx, 185, 340, ac, glow=10, w=3)

    # Title
    tf = font_heavy(48); tl = wrap(title.upper(), tf, W-lx-90, draw)
    ty = 200
    for ln in tl: draw.text((lx+28, ty), ln, font=tf, fill=(255,255,255)); ty+=58

    # Divider
    neon_h(draw, 430, 80, W-80, ac, glow=12)

    # Sub
    sf = font_reg(28); sl = wrap(sub, sf, W-180, draw)
    sy = 480
    for ln in sl: draw.text((95, sy), ln, font=sf, fill=(170,170,180)); sy+=42

    dots(draw, sn, tot); brand_footer(draw)
    img.save(out, quality=95); print(f"  ✓ {os.path.basename(out)}")


def num_slide_light(num, title, sub, sn, tot, out, ac=ACCENT):
    """Clean light numbered slide."""
    img = Image.new("RGB",(W,H),(238,238,238))
    # Subtle gradient
    px = img.load()
    for y in range(H):
        v = int(238 - 8*(y/H))
        for x in range(W): px[x,y] = (v,v,v+2)
    draw = ImageDraw.Draw(img)
    corners(draw, (195,195,200))

    # Number
    nf = font_heavy(160); ns = f"{num:02d}"
    nb = draw.textbbox((75,150), ns, font=nf)
    draw.text((75,150), ns, font=nf, fill=(20,20,20))
    lx = nb[2]+22
    neon_v(draw, lx, 185, 340, ac, glow=6, w=3)

    # Title
    tf = font_heavy(48); tl = wrap(title.upper(), tf, W-lx-90, draw)
    ty = 200
    for ln in tl: draw.text((lx+28, ty), ln, font=tf, fill=(15,15,15)); ty+=58

    # Divider
    neon_h(draw, 430, 80, W-80, ac, glow=8)

    # Sub
    sf = font_reg(28); sl = wrap(sub, sf, W-180, draw)
    sy = 480
    for ln in sl: draw.text((95, sy), ln, font=sf, fill=(85,85,90)); sy+=42

    dots(draw, sn, tot, ac=ac); brand_footer(draw, ac)
    img.save(out, quality=95); print(f"  ✓ {os.path.basename(out)}")


def recap_slide(char_path, title, points, sn, tot, out, ac=ACCENT):
    """Recap with darkened character bg."""
    ch = Image.open(char_path).resize((W,H), Image.LANCZOS)
    ch = ImageEnhance.Brightness(ch).enhance(0.2)
    ch = color_grade(ch, (0,8,18), 1.2, 1.0, 1.2)
    ov = Image.new("RGBA",(W,H),(0,0,0,190))
    img = Image.alpha_composite(ch.convert("RGBA"), ov).convert("RGB")
    img = vignette(img, 0.75)
    draw = ImageDraw.Draw(img)
    corners(draw, (55,55,60))

    # Title with gradient glow
    tf = font_heavy(54)
    bb = draw.textbbox((0,0),title,font=tf); x=(W-(bb[2]-bb[0]))//2
    img = glow_text(img, title, tf, x, 100, ac, blur=16, alpha=100)
    draw = ImageDraw.Draw(img)
    centered(draw, 100, title, tf, (255,255,255))
    neon_h(draw, 170, 230, W-230, ac, glow=10)

    # Points
    nf = font_heavy(26); pf = font_reg(25)
    y = 215
    for i,pt in enumerate(points):
        b = f"{i+1:02d}"
        draw.text((100,y), b, font=nf, fill=ac)
        neon_v(draw, 148, y+5, y+27, ac, glow=5, w=2)
        draw.text((165, y+2), pt, font=pf, fill=(220,220,225))
        y += 55

    dots(draw, sn, tot); brand_footer(draw)
    img.save(out, quality=95); print(f"  ✓ {os.path.basename(out)}")


def cta_slide(char_path, cta, out, ac=ACCENT):
    """Premium CTA slide."""
    ch = Image.open(char_path).resize((W,H), Image.LANCZOS)
    ch = ImageEnhance.Brightness(ch).enhance(0.35)
    ch = color_grade(ch, (0,8,20), 1.3, 1.1, 1.2)
    img = darken_zone(ch, 280, H-100, 0.85)
    img = vignette(img, 0.7)
    draw = ImageDraw.Draw(img)
    corners(draw, (55,55,60))

    # DS with massive glow
    df = font_heavy(130)
    bb = draw.textbbox((0,0),"DS",font=df); x=(W-(bb[2]-bb[0]))//2
    img = glow_text(img, "DS", df, x, 320, ac, blur=25, alpha=140)
    draw = ImageDraw.Draw(img)
    centered(draw, 320, "DS", df, (255,255,255))

    mf = font_heavy(55); centered(draw, 450, "MARKETING", mf, (190,190,195))

    # Neon box around CTA
    neon_h(draw, 525, 280, W-280, ac, glow=14, w=2)

    cf = font_heavy(40); centered(draw, 555, cta, cf, (255,255,255))

    # Handle in accent color
    hf = font_bold(24); centered(draw, 620, "@dsmarketing.agency", hf, ac)
    wf = font_reg(16); centered(draw, 665, "dsmarketing.lovable.app", wf, (75,75,75))

    brand_footer(draw)
    img.save(out, quality=95); print(f"  ✓ {os.path.basename(out)}")


def body_slide(title, lines, sn, tot, out, ac=ACCENT, bg=(20,25,52)):
    """Text body slide."""
    img = make_bg(0.5, 0.3, 0.7, bg)
    img = grain(img, 5); img = vignette(img, 0.7)
    draw = ImageDraw.Draw(img)
    corners(draw)

    tf = font_heavy(50)
    bb = draw.textbbox((0,0),title,font=tf); x=(W-(bb[2]-bb[0]))//2
    img = glow_text(img, title, tf, x, 115, ac, 14, 90)
    draw = ImageDraw.Draw(img)
    centered(draw, 115, title, tf, (255,255,255))
    neon_h(draw, 180, 260, W-260, ac, 8)

    bf = font_reg(28); y = 225
    for ln in lines:
        if ln == "": y += 24; continue
        centered(draw, y, ln, bf, (195,195,200)); y += 48

    dots(draw, sn, tot); brand_footer(draw)
    img.save(out, quality=95); print(f"  ✓ {os.path.basename(out)}")


# ═══════════════════════════════════════════
# MAIN
# ═══════════════════════════════════════════
def main():
    print("=" * 55)
    print("  DS MARKETING V4 — HIGH QUALITY CHARACTER SLIDES")
    print("=" * 55)

    dirs = {k: f"{OUT}/{k}" for k in ["characters","monday","wednesday","friday"]}
    for d in dirs.values(): os.makedirs(d, exist_ok=True)

    # ─── Download Characters ───
    print("\n▸ STEP 1: Downloading 3D Characters (3-8 min)...")
    print("─" * 50)
    cp = {}
    for name, prompt in CHARS.items():
        path = f"{dirs['characters']}/{name}.png"
        cp[name] = path
        if os.path.exists(path) and os.path.getsize(path) > 10000:
            print(f"  ✓ {name} (cached)"); continue
        print(f"  ⏳ {name}...")
        if not download_ai(prompt, path):
            print(f"  ⚠ Fallback for {name}")
            fb = make_bg(0.5,0.4,0.6,(30,40,70)); fb.save(path,quality=95)
        time.sleep(3)

    # ─── Monday ───
    print(f"\n▸ STEP 2: MONDAY — 7 Social Media Mistakes")
    print("─" * 50)

    hook_slide(cp["frustrated"], "YOUR SOCIAL MEDIA",
               "ISN'T FAILING. YOUR STRATEGY IS.",
               "7 mistakes killing your growth",
               f"{dirs['monday']}/slide_01_hook.png")

    mistakes = [
        ("Posting without a content plan", "Random posts = random results. A plan turns chaos into consistency and consistency builds trust.", "scrolling"),
        ("Ignoring your analytics", "The data tells you exactly what works and what doesn't. Stop guessing. Start reading the numbers.", None),
        ("Buying followers for vanity", "10K fake followers won't buy your product. Ever. Real engagement beats inflated numbers.", "scrolling"),
        ("No consistent brand voice", "If your audience can't recognize you in 2 seconds, you don't have a brand. You have noise.", None),
        ("Same content everywhere", "What works on Instagram doesn't work on LinkedIn. Each platform speaks its own language.", "frustrated"),
        ("Zero audience engagement", "Posting and disappearing tells the algorithm you don't care. And it stops showing your content.", None),
        ("No post-publish strategy", "Publishing is 20% of the work. Distribution, engagement, and repurposing is the other 80%.", "thinking"),
    ]

    for i, (title, sub, char) in enumerate(mistakes):
        if char:
            num_slide_char(cp[char], i+1, title, sub, i+2, 10,
                          f"{dirs['monday']}/slide_{i+2:02d}.png")
        elif i % 3 == 0:
            num_slide_light(i+1, title, sub, i+2, 10,
                           f"{dirs['monday']}/slide_{i+2:02d}.png")
        else:
            num_slide_dark(i+1, title, sub, i+2, 10,
                          f"{dirs['monday']}/slide_{i+2:02d}.png")

    recap_slide(cp["strategist"], "QUICK RECAP",
                ["No content plan","Ignoring analytics","Buying fake followers",
                 "Inconsistent brand voice","Same content everywhere",
                 "Not engaging","No post-publish strategy"],
                9, 10, f"{dirs['monday']}/slide_09_recap.png")

    cta_slide(cp["architect"], "FOLLOW FOR MORE",
              f"{dirs['monday']}/slide_10_cta.png")

    # ─── Wednesday ───
    print(f"\n▸ STEP 3: WEDNESDAY — Perfect Content Calendar")
    print("─" * 50)

    hook_slide(cp["presenting"], "STOP POSTING RANDOMLY.",
               "START POSTING STRATEGICALLY.",
               "Your weekly content framework",
               f"{dirs['wednesday']}/slide_01_hook.png")

    days = [
        ("Monday — Educational", "Tips, how-tos, frameworks. Start the week proving your expertise.", "thinking"),
        ("Tuesday — Industry insights", "Share trends your audience hasn't seen. Be the one who sees what's coming.", None),
        ("Wednesday — Case study", "Real numbers, real results. Nothing builds trust faster than evidence.", "celebrating"),
        ("Thursday — Behind the scenes", "Show your process, your team. People buy from people they trust.", None),
        ("Friday — Engagement", "Ask questions. Run polls. Start debates. Let your audience talk.", "presenting"),
        ("Weekend — Brand story", "Your mission. Your values. Build connection, not just reach.", None),
        ("Secret — Batch Monday", "Create the full week in one sitting. Then spend the rest engaging.", "architect"),
    ]

    for i, (title, sub, char) in enumerate(days):
        if char:
            num_slide_char(cp[char], i+1, title, sub, i+2, 10,
                          f"{dirs['wednesday']}/slide_{i+2:02d}.png")
        elif i % 3 == 0:
            num_slide_light(i+1, title, sub, i+2, 10,
                           f"{dirs['wednesday']}/slide_{i+2:02d}.png")
        else:
            num_slide_dark(i+1, title, sub, i+2, 10,
                          f"{dirs['wednesday']}/slide_{i+2:02d}.png")

    recap_slide(cp["presenting"], "YOUR WEEKLY FRAMEWORK",
                ["MON — Educate","TUE — Industry insights","WED — Case studies",
                 "THU — Behind the scenes","FRI — Engage",
                 "SAT/SUN — Brand story","SECRET — Batch Monday"],
                9, 10, f"{dirs['wednesday']}/slide_09_recap.png")

    cta_slide(cp["architect"], "SAVE THIS FRAMEWORK",
              f"{dirs['wednesday']}/slide_10_cta.png")

    # ─── Friday ───
    print(f"\n▸ STEP 4: FRIDAY — The 3-Second Rule")
    print("─" * 50)

    hook_slide(cp["clock"], "YOU HAVE 3 SECONDS.", "",
               "The rule that changes everything",
               f"{dirs['friday']}/slide_01_hook.png")

    body_slide("THE 3-SECOND RULE",
               ["Your audience decides in 3 seconds","whether to stop scrolling","or keep going.",
                "","That means your hook is everything.","","Not your logo.",
                "Not your color palette.","Not your font choice.","",
                "Your first line.","","That's where the battle","is won or lost."],
               2, 3, f"{dirs['friday']}/slide_02.png")

    cta_slide(cp["rocket"], "MAKE EVERY HOOK COUNT",
              f"{dirs['friday']}/slide_03_cta.png")

    print("\n" + "=" * 55)
    print(f"  ✅ ALL DONE! Files in: {OUT}/")
    print("=" * 55)
    print(f"\n  {OUT}/monday/     — 10 slides")
    print(f"  {OUT}/wednesday/  — 10 slides")
    print(f"  {OUT}/friday/     — 3 slides")
    print(f"  {OUT}/characters/ — 9 AI characters")
    print(f"\n  Upload to Instagram via business.facebook.com")
    print(f"  Copy captions from your GitHub repo\n")


if __name__ == "__main__":
    main()
