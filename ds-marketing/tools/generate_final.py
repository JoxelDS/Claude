#!/usr/bin/env python3
"""
DS MARKETING — FINAL EDITION
==============================
The absolute best quality. Cinema-grade slides.

python3 generate_final.py
"""

import urllib.request, urllib.parse, os, math, random, time, sys, struct

try:
    from PIL import Image, ImageDraw, ImageFont, ImageFilter, ImageChops, ImageEnhance
except ImportError:
    os.system(f"{sys.executable} -m pip install Pillow")
    from PIL import Image, ImageDraw, ImageFont, ImageFilter, ImageChops, ImageEnhance

W, H = 1080, 1080
OUT = "ds-marketing-final"

# Brand colors
TEAL = (0, 230, 170)
GOLD = (255, 200, 60)
BLUE = (60, 140, 255)
WHITE = (255, 255, 255)
LIGHT_GRAY = (180, 180, 185)
DARK = (8, 8, 12)


# ═══════════════════════════════════════
# FONTS
# ═══════════════════════════════════════
def _f(paths, sz):
    for p in paths:
        if os.path.exists(p):
            try: return ImageFont.truetype(p, sz)
            except: pass
    return ImageFont.load_default()

def F_IMPACT(sz): return _f([
    "/System/Library/Fonts/Supplemental/Impact.ttf",
    "/Library/Fonts/Impact.ttf",
    "BebasNeue-Regular.ttf",
    "/usr/share/fonts/truetype/liberation/LiberationSans-Bold.ttf",
], sz)

def F_BOLD(sz): return _f([
    "/System/Library/Fonts/Supplemental/Arial Bold.ttf",
    "/Library/Fonts/Arial Bold.ttf",
    "/System/Library/Fonts/Helvetica-Bold.otf",
    "/usr/share/fonts/truetype/liberation/LiberationSans-Bold.ttf",
], sz)

def F_REG(sz): return _f([
    "/System/Library/Fonts/Supplemental/Arial.ttf",
    "/Library/Fonts/Arial.ttf",
    "/System/Library/Fonts/Helvetica.ttc",
    "/usr/share/fonts/truetype/liberation/LiberationSans-Regular.ttf",
], sz)


# ═══════════════════════════════════════
# AI DOWNLOAD
# ═══════════════════════════════════════
def dl(prompt, path, w=1080, h=1080):
    url = (f"https://image.pollinations.ai/prompt/{urllib.parse.quote(prompt)}"
           f"?width={w}&height={h}&model=flux&nologo=true&seed={random.randint(1,99999)}")
    hdr = {"User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36"}
    for a in range(4):
        try:
            r = urllib.request.Request(url, headers=hdr)
            d = urllib.request.urlopen(r, timeout=180).read()
            if len(d) > 8000:
                with open(path,"wb") as f: f.write(d)
                return True
        except Exception as e:
            print(f"    retry {a+1}... ({type(e).__name__})")
            time.sleep(3*(a+1))
    return False


# ═══════════════════════════════════════
# VISUAL ENGINE — MAXIMUM QUALITY
# ═══════════════════════════════════════

def radial(cx, cy, rad, inner, outer=(0,0,0)):
    """Smooth radial gradient."""
    img = Image.new("RGB",(W,H),outer); px = img.load()
    for y in range(0,H,2):
        for x in range(0,W,2):
            d = math.sqrt((x-cx)**2+(y-cy)**2)
            t = min(1.0, d/rad); t = t**1.8  # smoother falloff
            c = tuple(int(inner[i]*(1-t)+outer[i]*t) for i in range(3))
            px[x,y]=c
            if x+1<W: px[x+1,y]=c
            if y+1<H: px[x,y+1]=c
            if x+1<W and y+1<H: px[x+1,y+1]=c
    return img


def premium_bg(c1=(30,45,80), c2=None, c3=None):
    """Multi-layer gradient background."""
    img = radial(int(W*0.4), int(H*0.3), int(W*0.75), c1, DARK)
    if c2:
        l2 = radial(int(W*c2[0]), int(H*c2[1]), int(W*0.5), c2[2], (0,0,0))
        img = ImageChops.add(img, l2)
    if c3:
        l3 = radial(int(W*c3[0]), int(H*c3[1]), int(W*0.4), c3[2], (0,0,0))
        img = ImageChops.add(img, l3)
    return img


def add_bokeh(img, count=25, seed=42):
    """Add floating bokeh light particles."""
    ov = Image.new("RGBA",(W,H),(0,0,0,0))
    random.seed(seed)
    for _ in range(count):
        x = random.randint(0,W)
        y = random.randint(0,H)
        r = random.randint(8, 45)
        a = random.randint(8, 35)
        color = random.choice([(*TEAL,a), (*GOLD,a), (255,255,255,a), (*BLUE,a)])
        circle = Image.new("RGBA",(r*2,r*2),(0,0,0,0))
        cd = ImageDraw.Draw(circle)
        cd.ellipse([0,0,r*2,r*2], fill=color)
        circle = circle.filter(ImageFilter.GaussianBlur(radius=r//2))
        ov.paste(circle, (x-r,y-r), circle)
    return Image.alpha_composite(img.convert("RGBA"), ov).convert("RGB")


def add_light_rays(img, x=540, top_w=8, bot_w=250, alpha=18):
    """Volumetric light beam from top."""
    ov = Image.new("RGBA",(W,H),(0,0,0,0)); d = ImageDraw.Draw(ov)
    for y in range(H):
        t = y/H
        w = int(top_w + (bot_w-top_w)*t*t)
        a = int(alpha * (1-t*0.6))
        d.line([(x-w//2,y),(x+w//2,y)], fill=(255,255,255,a))
    return Image.alpha_composite(img.convert("RGBA"), ov).convert("RGB")


def add_scan_lines(img, opacity=12, spacing=3):
    """Subtle horizontal scan lines for cinematic feel."""
    ov = Image.new("RGBA",(W,H),(0,0,0,0)); d = ImageDraw.Draw(ov)
    for y in range(0,H,spacing):
        d.line([(0,y),(W,y)], fill=(0,0,0,opacity))
    return Image.alpha_composite(img.convert("RGBA"), ov).convert("RGB")


def grain(img, n=6):
    px = img.load(); random.seed(99)
    for _ in range(W*H//3):
        x,y = random.randint(0,W-1),random.randint(0,H-1)
        r,g,b = px[x,y]; v = random.randint(-n,n)
        px[x,y] = (max(0,min(255,r+v)),max(0,min(255,g+v)),max(0,min(255,b+v)))
    return img


def vignette(img, s=0.78):
    m = Image.new("L",(W,H),0); d = ImageDraw.Draw(m)
    cx,cy = W//2,H//2; mr = int(W*s)
    for r in range(mr,0,-1): d.ellipse([cx-r,cy-r,cx+r,cy+r], fill=int(255*(r/mr)**0.8))
    return Image.composite(img, Image.new("RGB",(W,H),DARK), m)


def color_grade(img, tint=(0,8,20), con=1.25, sat=1.15, sharp=1.4, bright=1.0):
    """Cinema color grading."""
    t = Image.new("RGB",(W,H),tint)
    img = ImageChops.add(img, t, scale=3)
    if bright != 1.0: img = ImageEnhance.Brightness(img).enhance(bright)
    img = ImageEnhance.Contrast(img).enhance(con)
    img = ImageEnhance.Color(img).enhance(sat)
    img = ImageEnhance.Sharpness(img).enhance(sharp)
    return img


def smooth_darken(img, y_start, y_end, strength=0.9, fade=100):
    """Smooth gradient darkening zone."""
    ov = Image.new("RGBA",(W,H),(0,0,0,0)); d = ImageDraw.Draw(ov)
    for y in range(max(0,y_start-fade), min(H,y_end+fade)):
        if y < y_start: a = strength*(1-(y_start-y)/fade)
        elif y > y_end: a = strength*(1-(y-y_end)/fade)
        else: a = strength
        d.line([(0,y),(W,y)], fill=(0,0,0,max(0,min(255,int(255*a)))))
    return Image.alpha_composite(img.convert("RGBA"), ov).convert("RGB")


# ─── NEON EFFECTS (enhanced) ───
def neon_h(draw, y, x1, x2, color=TEAL, glow=18, w=2):
    """Premium horizontal neon line."""
    for o in range(glow,0,-1):
        a = int(60*(1-o/glow)**0.6)
        gc = tuple(max(0,min(255,int(c*a/60))) for c in color)
        draw.line([(x1,y-o),(x2,y-o)],fill=gc)
        draw.line([(x1,y+o),(x2,y+o)],fill=gc)
    draw.line([(x1,y),(x2,y)],fill=color,width=w)

def neon_v(draw, x, y1, y2, color=TEAL, glow=10, w=3):
    for o in range(glow,0,-1):
        a = int(60*(1-o/glow)**0.6)
        gc = tuple(max(0,min(255,int(c*a/60))) for c in color)
        draw.line([(x-o,y1),(x-o,y2)],fill=gc)
        draw.line([(x+o,y1),(x+o,y2)],fill=gc)
    draw.line([(x,y1),(x,y2)],fill=color,width=w)


def glow_text(img, text, font, x, y, color=TEAL, blur=18, alpha=120):
    """Multi-pass text glow for maximum impact."""
    g = Image.new("RGBA",(W,H),(0,0,0,0)); gd = ImageDraw.Draw(g)
    for dx in range(-3,4):
        for dy in range(-3,4):
            gd.text((x+dx,y+dy), text, font=font, fill=(*color,alpha))
    g = g.filter(ImageFilter.GaussianBlur(radius=blur))
    return Image.alpha_composite(img.convert("RGBA"),g).convert("RGB")


def outlined_text(draw, x, y, text, font, fill=WHITE, outline=(0,0,0), ow=3):
    """Text with outline for maximum readability."""
    for dx in range(-ow,ow+1):
        for dy in range(-ow,ow+1):
            if dx*dx+dy*dy <= ow*ow:
                draw.text((x+dx,y+dy), text, font=font, fill=outline)
    draw.text((x,y), text, font=font, fill=fill)


# ─── LAYOUT HELPERS ───
def centered(draw, y, text, font, fill=WHITE):
    bb = draw.textbbox((0,0),text,font=font)
    x = (W-(bb[2]-bb[0]))//2
    draw.text((x,y),text,font=font,fill=fill)
    return x, bb[3]-bb[1]

def centered_outlined(draw, y, text, font, fill=WHITE, outline=(0,0,0), ow=2):
    bb = draw.textbbox((0,0),text,font=font)
    x = (W-(bb[2]-bb[0]))//2
    outlined_text(draw, x, y, text, font, fill, outline, ow)
    return x, bb[3]-bb[1]

def wrap(text, font, mw, draw):
    words = text.split(); lines=[]; cur=""
    for w in words:
        t = f"{cur} {w}".strip()
        if draw.textbbox((0,0),t,font=font)[2] <= mw: cur=t
        else:
            if cur: lines.append(cur); cur=w
    if cur: lines.append(cur)
    return lines

def brand_bar_top(draw):
    """Professional branded top bar."""
    draw.rectangle([(0,0),(W,36)], fill=(12,12,16))
    draw.line([(0,36),(W,36)], fill=(40,40,45), width=1)
    f = F_BOLD(11)
    draw.text((42,11), "DS MARKETING", font=f, fill=(120,120,125))
    # Accent dot
    draw.ellipse([28,15,35,22], fill=TEAL)
    # Right side
    draw.text((W-200, 11), "dsmarketing.agency", font=f, fill=(80,80,85))

def brand_bar_bottom(draw, sn=None, tot=None, ac=TEAL):
    """Professional branded bottom bar."""
    draw.rectangle([(0,H-42),(W,H)], fill=(12,12,16))
    draw.line([(0,H-42),(W,H-42)], fill=(40,40,45), width=1)
    f = F_REG(12)
    draw.text((42, H-30), "@dsmarketing.agency", font=f, fill=(100,100,105))
    if sn and tot:
        # Dots
        for i in range(min(tot,10)):
            dx = W//2-(tot*12)//2+i*24
            if i == sn-1:
                draw.ellipse([dx-4,H-28,dx+4,H-20], fill=ac)
            else:
                draw.ellipse([dx-2,H-26,dx+2,H-22], fill=(50,50,55))
    # Right
    draw.text((W-180, H-30), "dsmarketing.lovable.app", font=f, fill=(60,60,65))

def corners(draw, c=(50,55,60), m=48, l=50, w=2):
    for pts in [[(m,m),(m+l,m)],[(m,m),(m,m+l)],[(W-m-l,m),(W-m,m)],[(W-m,m),(W-m,m+l)],
                [(m,H-m),(m+l,H-m)],[(m,H-m-l),(m,H-m)],[(W-m-l,H-m),(W-m,H-m)],[(W-m,H-m-l),(W-m,H-m)]]:
        draw.line(pts, fill=c, width=w)


# ═══════════════════════════════════════
# CHARACTER PROMPTS — MAXIMUM DETAIL
# ═══════════════════════════════════════
CHARS = {
    "strategist": (
        "Hyperrealistic 3D Pixar quality character render, "
        "confident powerful male CEO in tailored black suit, crossed arms, slight knowing smirk, "
        "dramatic studio lighting with teal rim light on left shoulder and warm key light from right, "
        "dark atmospheric background with volumetric fog and floating particle dust, "
        "shallow depth of field f1.4, subsurface skin scattering, physically based rendering, "
        "Unreal Engine 5 quality, cinematic 35mm lens, film grain, "
        "award winning character design, magazine cover quality, "
        "no text no words no letters no writing no watermark"
    ),
    "frustrated": (
        "Hyperrealistic 3D Pixar quality character render, "
        "stressed exhausted businessman at modern desk, head in both hands, eyes closed in frustration, "
        "laptop screen casting blue light on face showing red declining analytics, papers scattered, "
        "dark moody office, single dramatic overhead spotlight creating hard shadows, "
        "volumetric light rays through venetian blinds from left, atmospheric haze, "
        "shallow DOF, teal and orange color grading, cinematic 50mm lens, "
        "emotionally powerful, award winning 3D art, "
        "no text no words no letters no writing no watermark"
    ),
    "celebrating": (
        "Hyperrealistic 3D Pixar quality character render, "
        "ecstatic triumphant businessman in black suit leaping in air, both fists raised high, "
        "huge genuine smile of pure joy, golden confetti explosion surrounding him, "
        "sparkle particles and light orbs floating everywhere, "
        "dark background with dramatic warm golden spotlight from above creating god rays, "
        "volumetric golden haze, lens flare, motion energy, "
        "cinematic wide angle 24mm, award winning animation quality, "
        "no text no words no letters no writing no watermark"
    ),
    "presenting": (
        "Hyperrealistic 3D Pixar quality female character render, "
        "confident professional businesswoman in sleek black blazer, "
        "hand extended presenting large floating holographic interface with glowing teal charts, "
        "futuristic translucent UI panels with metrics and analytics data floating in air, "
        "dark high-tech office, teal and blue neon ambient lighting reflections, "
        "volumetric fog, ray traced hologram reflections, "
        "shallow DOF, cinematic 35mm, sci-fi meets corporate, "
        "no text no words no letters no writing no watermark"
    ),
    "thinking": (
        "Hyperrealistic 3D Pixar quality character render, "
        "thoughtful contemplative businessman in black turtleneck like Steve Jobs, "
        "hand on chin deep in thought, eyes looking up with spark of inspiration, "
        "floating translucent light bulb and gear icons dissolving into particles around head, "
        "dark atmospheric background with purple and blue accent fog, "
        "single dramatic Rembrandt lighting, bokeh particles, "
        "shallow DOF f1.2, cinematic mood, introspective, "
        "no text no words no letters no writing no watermark"
    ),
    "scrolling": (
        "Hyperrealistic 3D Pixar quality character render, "
        "bored disengaged person in hoodie mindlessly doom-scrolling smartphone, "
        "glazed empty eyes illuminated by harsh blue phone screen in dark room, "
        "translucent social media icons hearts and notifications floating from phone, "
        "surrounding darkness with only the phone as light source creating dramatic chiaroscuro, "
        "lonely isolated mood, cold blue color grading, cinematic shallow DOF, "
        "no text no words no letters no writing no watermark"
    ),
    "architect": (
        "Hyperrealistic 3D Pixar quality character render, "
        "powerful visionary CEO standing in dark luxury corner office at night, "
        "hands on glass desk leaning forward with commanding presence, "
        "massive holographic teal blueprint of interconnected business systems floating before him, "
        "panoramic floor-to-ceiling windows showing glowing city skyline at night, "
        "golden warm rim lighting from city lights, teal hologram reflections on face, "
        "volumetric atmosphere, shallow DOF, cinematic wide angle, "
        "no text no words no letters no writing no watermark"
    ),
    "rocket": (
        "Hyperrealistic 3D rendered dramatic scene, "
        "sleek futuristic rocket ship with metallic reflections launching vertically with massive "
        "teal and blue flame exhaust trail, surrounded by orbiting glowing social media "
        "engagement icons likes hearts and stars with energy trails, "
        "epic dark deep space background with colorful purple nebula and dense star field, "
        "motion blur on rocket, volumetric fire and smoke particles, lens flare from engines, "
        "cinematic upward camera angle, epic scale, blockbuster movie quality, "
        "no text no words no letters no writing no watermark"
    ),
    "clock": (
        "Hyperrealistic 3D rendered dramatic scene, "
        "massive ornate golden luxury stopwatch floating in dark void, "
        "watch face showing large number 3, glass cracking with golden light beams shooting out, "
        "golden energy particles and time fragments exploding outward in slow motion, "
        "dramatic single spotlight beam from directly above cutting through volumetric fog, "
        "dark background with floating dust particles catching light, "
        "shallow DOF, cinematic dramatic, time-pressure urgency, epic, "
        "no text no words no letters no writing no watermark"
    ),
}


# ═══════════════════════════════════════
# SLIDE TEMPLATES — FINAL EDITION
# ═══════════════════════════════════════

def HOOK(char_path, l1, l2, tag, out, ac=TEAL):
    """HOOK SLIDE — Maximum impact."""
    ch = Image.open(char_path).resize((W,H), Image.LANCZOS)
    ch = color_grade(ch, (0,6,18), con=1.3, sat=1.2, sharp=1.5)

    # Heavy cinematic darken zones
    img = smooth_darken(ch, 0, 130, 0.82, fade=60)
    img = smooth_darken(img, H-420, H, 0.9, fade=80)
    img = vignette(img, 0.82)
    img = add_light_rays(img, W//2, 6, 120, 12)
    img = add_bokeh(img, 18, seed=hash(out)%9999)
    img = add_scan_lines(img, 8, 4)
    img = grain(img, 5)

    draw = ImageDraw.Draw(img)
    brand_bar_top(draw)

    # Tag in neon box
    if tag:
        tf = F_BOLD(18)
        bb = draw.textbbox((0,0),tag,font=tf); tw=bb[2]-bb[0]
        x = (W-tw)//2
        # Glow box background
        box_img = Image.new("RGBA",(W,H),(0,0,0,0))
        bd = ImageDraw.Draw(box_img)
        bd.rectangle([(x-18,56),(x+tw+18,84)], fill=(*ac,30))
        box_img = box_img.filter(ImageFilter.GaussianBlur(4))
        img = Image.alpha_composite(img.convert("RGBA"),box_img).convert("RGB")
        draw = ImageDraw.Draw(img)
        # Neon border
        for o in range(6,0,-1):
            gc = tuple(max(0,min(255,int(c*(40-o*5)/40))) for c in ac)
            draw.rectangle([(x-18-o,56-o),(x+tw+18+o,84+o)], outline=gc)
        draw.rectangle([(x-18,56),(x+tw+18,84)], outline=ac)
        draw.text((x,59), tag, font=tf, fill=ac)

    # MAIN HEADLINE — massive, glowing, shadowed
    mf = F_IMPACT(96)
    lines = wrap(l1, mf, W-100, draw)
    bh = len(lines)*105
    sy = H-380 - bh//2

    for i,ln in enumerate(lines):
        bb = draw.textbbox((0,0),ln,font=mf); x=(W-(bb[2]-bb[0]))//2
        # Strong glow
        img = glow_text(img, ln, mf, x, sy+i*105, ac, blur=22, alpha=140)
        draw = ImageDraw.Draw(img)
        # Shadow
        draw.text((x+3,sy+i*105+3), ln, font=mf, fill=(0,0,0))
        draw.text((x+1,sy+i*105+1), ln, font=mf, fill=(20,20,25))
        # Main text
        draw.text((x,sy+i*105), ln, font=mf, fill=WHITE)

    if l2:
        f2 = F_IMPACT(82)
        bb = draw.textbbox((0,0),l2,font=f2); x=(W-(bb[2]-bb[0]))//2
        draw.text((x+2,sy+len(lines)*105+15+2), l2, font=f2, fill=(0,0,0))
        draw.text((x,sy+len(lines)*105+15), l2, font=f2, fill=(195,195,200))

    # Bottom neon line
    neon_h(draw, H-95, 260, W-260, ac, glow=14)

    # Swipe
    sf = F_REG(13)
    centered(draw, H-72, "S W I P E   T O   L E A R N   M O R E   →", sf, (110,110,115))

    brand_bar_bottom(draw, ac=ac)
    img.save(out, quality=95)
    print(f"  ✓ {os.path.basename(out)}")


def NUM_CHAR(char_path, num, title, sub, sn, tot, out, ac=TEAL):
    """NUMBERED SLIDE with character background."""
    ch = Image.open(char_path).resize((W,H), Image.LANCZOS)
    ch = color_grade(ch, (0,5,14), 1.25, 1.1, 1.4, bright=0.4)
    img = smooth_darken(ch, H-480, H, 0.92, 70)
    img = vignette(img, 0.75)
    img = add_bokeh(img, 12, seed=sn*7)
    img = add_scan_lines(img, 6, 4)
    img = grain(img, 5)
    draw = ImageDraw.Draw(img)
    brand_bar_top(draw)
    corners(draw, (50,55,60), m=48, l=45)

    # Large number
    nf = F_IMPACT(170); ns = f"{num:02d}"
    nb = draw.textbbox((70,460), ns, font=nf)
    img = glow_text(img, ns, nf, 70, 460, ac, blur=24, alpha=140)
    draw = ImageDraw.Draw(img)
    outlined_text(draw, 70, 460, ns, nf, WHITE, (0,0,0), 3)

    # Neon vertical
    lx = nb[2]+22
    neon_v(draw, lx, 490, 640, ac, 12, 3)

    # Title
    tf = F_IMPACT(46); tl = wrap(title.upper(), tf, W-lx-80, draw)
    ty = 505
    for ln in tl:
        outlined_text(draw, lx+28, ty, ln, tf, WHITE, (0,0,0), 2)
        ty += 55

    # Divider
    neon_h(draw, 710, 70, W-70, ac, 12)

    # Subtitle
    sf = F_REG(25); sl = wrap(sub, sf, W-160, draw)
    sy = 745
    for ln in sl: draw.text((85,sy), ln, font=sf, fill=LIGHT_GRAY); sy+=36

    brand_bar_bottom(draw, sn, tot, ac)
    img.save(out, quality=95)
    print(f"  ✓ {os.path.basename(out)}")


def NUM_DARK(num, title, sub, sn, tot, out, ac=TEAL, c1=(25,38,72)):
    """DARK NUMBERED slide — no character."""
    img = premium_bg(c1, (0.8,0.75,(12,10,35)), (0.2,0.8,(10,18,30)))
    img = add_light_rays(img, int(W*0.3), 4, 100, 10)
    img = add_bokeh(img, 15, seed=sn*13)
    img = add_scan_lines(img, 6, 4)
    img = grain(img, 5); img = vignette(img, 0.72)
    draw = ImageDraw.Draw(img)
    brand_bar_top(draw)
    corners(draw)

    # Number
    nf = F_IMPACT(170); ns = f"{num:02d}"
    nb = draw.textbbox((70,140), ns, font=nf)
    img = glow_text(img, ns, nf, 70, 140, ac, 24, 140)
    draw = ImageDraw.Draw(img)
    draw.text((70,140), ns, font=nf, fill=WHITE)
    lx = nb[2]+22
    neon_v(draw, lx, 175, 330, ac, 12, 3)

    # Title
    tf = F_IMPACT(50); tl = wrap(title.upper(), tf, W-lx-80, draw)
    ty = 190
    for ln in tl: draw.text((lx+28,ty), ln, font=tf, fill=WHITE); ty+=60

    # Divider
    neon_h(draw, 420, 70, W-70, ac, 14)

    # Sub
    sf = F_REG(28); sl = wrap(sub, sf, W-170, draw)
    sy = 470
    for ln in sl: draw.text((90,sy), ln, font=sf, fill=LIGHT_GRAY); sy+=42

    brand_bar_bottom(draw, sn, tot, ac)
    img.save(out, quality=95)
    print(f"  ✓ {os.path.basename(out)}")


def NUM_LIGHT(num, title, sub, sn, tot, out, ac=TEAL):
    """CLEAN LIGHT slide."""
    img = Image.new("RGB",(W,H),(235,235,238))
    px = img.load()
    for y in range(H):
        for x in range(0,W,2):
            v = int(235-6*(y/H)+3*math.sin(x/200))
            px[x,y]=(v,v,v+1)
            if x+1<W: px[x+1,y]=(v,v,v+1)
    draw = ImageDraw.Draw(img)
    # Light top bar
    draw.rectangle([(0,0),(W,36)], fill=(250,250,252))
    draw.line([(0,36),(W,36)], fill=(210,210,215), width=1)
    bf = F_BOLD(11)
    draw.ellipse([28,15,35,22], fill=ac)
    draw.text((42,11), "DS MARKETING", font=bf, fill=(60,60,65))
    draw.text((W-200,11), "dsmarketing.agency", font=bf, fill=(140,140,145))

    corners(draw, (200,200,205), 48, 45)

    # Number
    nf = F_IMPACT(170); ns = f"{num:02d}"
    nb = draw.textbbox((70,130), ns, font=nf)
    draw.text((70,130), ns, font=nf, fill=(20,20,22))
    lx = nb[2]+22
    neon_v(draw, lx, 165, 320, ac, 6, 3)

    # Title
    tf = F_IMPACT(50); tl = wrap(title.upper(), tf, W-lx-80, draw)
    ty = 180
    for ln in tl: draw.text((lx+28,ty), ln, font=tf, fill=(15,15,18)); ty+=60

    # Divider
    neon_h(draw, 410, 70, W-70, ac, 8)

    # Sub
    sf = F_REG(28); sl = wrap(sub, sf, W-170, draw)
    sy = 460
    for ln in sl: draw.text((90,sy), ln, font=sf, fill=(80,80,88)); sy+=42

    # Bottom bar light version
    draw.rectangle([(0,H-42),(W,H)], fill=(250,250,252))
    draw.line([(0,H-42),(W,H-42)], fill=(210,210,215), width=1)
    f = F_REG(12)
    draw.text((42,H-30), "@dsmarketing.agency", font=f, fill=(140,140,145))
    for i in range(min(tot,10)):
        dx = W//2-(tot*12)//2+i*24
        if i==sn-1: draw.ellipse([dx-4,H-28,dx+4,H-20], fill=ac)
        else: draw.ellipse([dx-2,H-26,dx+2,H-22], fill=(190,190,195))
    draw.text((W-180,H-30), "dsmarketing.lovable.app", font=f, fill=(170,170,175))

    img.save(out, quality=95)
    print(f"  ✓ {os.path.basename(out)}")


def RECAP(char_path, title, points, sn, tot, out, ac=TEAL):
    ch = Image.open(char_path).resize((W,H), Image.LANCZOS)
    ch = ImageEnhance.Brightness(ch).enhance(0.18)
    ch = color_grade(ch, (0,6,16), 1.2, 1.0, 1.2)
    ov = Image.new("RGBA",(W,H),(8,8,12,195))
    img = Image.alpha_composite(ch.convert("RGBA"),ov).convert("RGB")
    img = vignette(img, 0.78)
    img = add_bokeh(img, 10, seed=55)
    img = add_scan_lines(img, 6, 4)
    img = grain(img, 4)
    draw = ImageDraw.Draw(img)
    brand_bar_top(draw)
    corners(draw, (55,60,65))

    tf = F_IMPACT(56)
    bb = draw.textbbox((0,0),title,font=tf); x=(W-(bb[2]-bb[0]))//2
    img = glow_text(img, title, tf, x, 90, ac, 18, 110)
    draw = ImageDraw.Draw(img)
    centered(draw, 90, title, tf, WHITE)
    neon_h(draw, 160, 210, W-210, ac, 12)

    nf = F_IMPACT(27); pf = F_REG(24)
    y = 200
    for i,pt in enumerate(points):
        b = f"{i+1:02d}"
        img_temp = glow_text(img, b, nf, 95, y, ac, 8, 80)
        draw = ImageDraw.Draw(img_temp); img = img_temp
        draw.text((95,y), b, font=nf, fill=ac)
        neon_v(draw, 142, y+5, y+28, ac, 5, 2)
        draw.text((158,y+2), pt, font=pf, fill=(225,225,230))
        y += 56

    brand_bar_bottom(draw, sn, tot, ac)
    img.save(out, quality=95)
    print(f"  ✓ {os.path.basename(out)}")


def CTA(char_path, cta, out, ac=TEAL):
    ch = Image.open(char_path).resize((W,H), Image.LANCZOS)
    ch = ImageEnhance.Brightness(ch).enhance(0.3)
    ch = color_grade(ch, (0,8,18), 1.3, 1.1, 1.2)
    img = smooth_darken(ch, 260, H-80, 0.88, 80)
    img = vignette(img, 0.72)
    img = add_light_rays(img, W//2, 10, 180, 14)
    img = add_bokeh(img, 15, seed=77)
    img = add_scan_lines(img, 6, 4)
    img = grain(img, 4)
    draw = ImageDraw.Draw(img)
    brand_bar_top(draw)
    corners(draw, (55,60,65))

    # DS with massive glow
    df = F_IMPACT(140)
    bb = draw.textbbox((0,0),"DS",font=df); x=(W-(bb[2]-bb[0]))//2
    img = glow_text(img, "DS", df, x, 310, ac, 30, 160)
    draw = ImageDraw.Draw(img)
    outlined_text(draw, x, 310, "DS", df, WHITE, (0,0,0), 3)

    mf = F_IMPACT(58)
    centered(draw, 450, "MARKETING", mf, (195,195,200))

    neon_h(draw, 530, 260, W-260, ac, 18, 3)

    cf = F_IMPACT(42)
    centered(draw, 565, cta, cf, WHITE)

    hf = F_BOLD(26)
    centered(draw, 630, "@dsmarketing.agency", hf, ac)

    wf = F_REG(16)
    centered(draw, 678, "dsmarketing.lovable.app", wf, (75,75,80))

    brand_bar_bottom(draw, ac=ac)
    img.save(out, quality=95)
    print(f"  ✓ {os.path.basename(out)}")


def BODY(title, lines, sn, tot, out, ac=TEAL, c1=(22,30,58)):
    img = premium_bg(c1, (0.7,0.7,(14,12,38)))
    img = add_light_rays(img, W//2, 5, 90, 10)
    img = add_bokeh(img, 12, seed=33)
    img = add_scan_lines(img, 6, 4)
    img = grain(img, 5); img = vignette(img, 0.72)
    draw = ImageDraw.Draw(img)
    brand_bar_top(draw)
    corners(draw)

    tf = F_IMPACT(52)
    bb = draw.textbbox((0,0),title,font=tf); x=(W-(bb[2]-bb[0]))//2
    img = glow_text(img, title, tf, x, 105, ac, 16, 100)
    draw = ImageDraw.Draw(img)
    centered(draw, 105, title, tf, WHITE)
    neon_h(draw, 172, 240, W-240, ac, 10)

    bf = F_REG(28); y = 215
    for ln in lines:
        if ln=="": y+=26; continue
        centered(draw, y, ln, bf, (200,200,205)); y+=48

    brand_bar_bottom(draw, sn, tot, ac)
    img.save(out, quality=95)
    print(f"  ✓ {os.path.basename(out)}")


# ═══════════════════════════════════════
# MAIN
# ═══════════════════════════════════════
def main():
    print()
    print("  ╔══════════════════════════════════════════╗")
    print("  ║   DS MARKETING — FINAL EDITION           ║")
    print("  ║   Maximum Quality Character Slides        ║")
    print("  ╚══════════════════════════════════════════╝")

    dirs = {k: f"{OUT}/{k}" for k in ["characters","monday","wednesday","friday"]}
    for d in dirs.values(): os.makedirs(d, exist_ok=True)

    # ─── Characters ───
    print("\n  ▸ Downloading 3D Characters (5-10 min)...")
    print("  " + "─"*45)
    cp = {}
    for name, prompt in CHARS.items():
        p = f"{dirs['characters']}/{name}.png"; cp[name] = p
        if os.path.exists(p) and os.path.getsize(p)>10000:
            print(f"    ✓ {name} (cached)"); continue
        print(f"    ⏳ {name}...")
        if not dl(prompt, p):
            fb = premium_bg((30,45,75)); fb.save(p,quality=95)
        time.sleep(3)

    # ─── MONDAY ───
    print(f"\n  ▸ MONDAY — 7 Social Media Mistakes")
    print("  " + "─"*45)
    M = dirs["monday"]

    HOOK(cp["frustrated"], "YOUR SOCIAL MEDIA",
         "ISN'T FAILING. YOUR STRATEGY IS.",
         "7 MISTAKES KILLING YOUR GROWTH",
         f"{M}/slide_01_hook.png")

    data = [
        (1,"Posting without a content plan","Random posts = random results. A plan turns chaos into consistency and consistency builds trust.","scrolling"),
        (2,"Ignoring your analytics","The data tells you exactly what works. Stop guessing. Start reading the numbers.",None),
        (3,"Buying followers for vanity","10K fake followers won't buy your product. Ever. Real engagement beats inflated numbers every time.","scrolling"),
        (4,"No consistent brand voice","If your audience can't recognize you in 2 seconds, you don't have a brand. You have noise.",None),
        (5,"Same content everywhere","What works on Instagram doesn't work on LinkedIn. Each platform speaks its own language.","frustrated"),
        (6,"Zero audience engagement","Posting and disappearing tells the algorithm you don't care. It stops showing your content.",None),
        (7,"No post-publish strategy","Publishing is 20% of the work. Distribution, engagement, and repurposing is the other 80%.","thinking"),
    ]
    for num,t,s,ch in data:
        sn = num+1
        if ch: NUM_CHAR(cp[ch],num,t,s,sn,10,f"{M}/slide_{sn:02d}.png")
        elif num%3==1: NUM_LIGHT(num,t,s,sn,10,f"{M}/slide_{sn:02d}.png")
        else: NUM_DARK(num,t,s,sn,10,f"{M}/slide_{sn:02d}.png")

    RECAP(cp["strategist"],"QUICK RECAP",
          ["No content plan","Ignoring analytics","Buying fake followers",
           "Inconsistent brand voice","Same content everywhere",
           "Not engaging","No post-publish strategy"],
          9,10,f"{M}/slide_09_recap.png")
    CTA(cp["architect"],"FOLLOW FOR MORE",f"{M}/slide_10_cta.png")

    # ─── WEDNESDAY ───
    print(f"\n  ▸ WEDNESDAY — Perfect Content Calendar")
    print("  " + "─"*45)
    WD = dirs["wednesday"]

    HOOK(cp["presenting"],"STOP POSTING RANDOMLY.",
         "START POSTING STRATEGICALLY.",
         "YOUR WEEKLY CONTENT FRAMEWORK",
         f"{WD}/slide_01_hook.png")

    data2 = [
        (1,"Monday — Educational","Tips, how-tos, frameworks. Prove your expertise from day one.","thinking"),
        (2,"Tuesday — Industry insights","Share trends your audience hasn't seen. Be the one who sees what's coming.",None),
        (3,"Wednesday — Case study","Real numbers, real results. Nothing builds trust faster than evidence.","celebrating"),
        (4,"Thursday — Behind the scenes","Show your process, your team. People buy from people they trust.",None),
        (5,"Friday — Engagement","Ask questions. Run polls. Start debates. Let your audience talk.","presenting"),
        (6,"Weekend — Brand story","Your mission. Your values. Build connection, not just reach.",None),
        (7,"Secret — Batch Monday","Create the full week in one sitting. Then spend the rest engaging.","architect"),
    ]
    for num,t,s,ch in data2:
        sn = num+1
        if ch: NUM_CHAR(cp[ch],num,t,s,sn,10,f"{WD}/slide_{sn:02d}.png")
        elif num%3==0: NUM_LIGHT(num,t,s,sn,10,f"{WD}/slide_{sn:02d}.png")
        else: NUM_DARK(num,t,s,sn,10,f"{WD}/slide_{sn:02d}.png")

    RECAP(cp["presenting"],"YOUR WEEKLY FRAMEWORK",
          ["MON — Educate","TUE — Industry insights","WED — Case studies",
           "THU — Behind the scenes","FRI — Engage",
           "SAT/SUN — Brand story","SECRET — Batch Monday"],
          9,10,f"{WD}/slide_09_recap.png")
    CTA(cp["architect"],"SAVE THIS FRAMEWORK",f"{WD}/slide_10_cta.png")

    # ─── FRIDAY ───
    print(f"\n  ▸ FRIDAY — The 3-Second Rule")
    print("  " + "─"*45)
    FR = dirs["friday"]

    HOOK(cp["clock"],"YOU HAVE 3 SECONDS.","",
         "THE RULE THAT CHANGES EVERYTHING",
         f"{FR}/slide_01_hook.png")

    BODY("THE 3-SECOND RULE",
         ["Your audience decides in 3 seconds","whether to stop scrolling","or keep going.",
          "","That means your hook is everything.","","Not your logo.",
          "Not your color palette.","Not your font choice.","",
          "Your first line.","","That's where the battle","is won or lost."],
         2,3,f"{FR}/slide_02.png")

    CTA(cp["rocket"],"MAKE EVERY HOOK COUNT",f"{FR}/slide_03_cta.png")

    # ─── DONE ───
    print()
    print("  ╔══════════════════════════════════════════╗")
    print("  ║   ✅ ALL DONE — FINAL EDITION COMPLETE    ║")
    print("  ╚══════════════════════════════════════════╝")
    print(f"""
  📁 {OUT}/
     monday/      → 10 slides ready to post
     wednesday/   → 10 slides ready to post
     friday/      → 3 slides ready to post
     characters/  → 9 AI 3D characters

  NEXT:
  1. Open the folder and check images
  2. Upload to Instagram via business.facebook.com
  3. Copy captions from GitHub repo
""")

if __name__ == "__main__":
    main()
