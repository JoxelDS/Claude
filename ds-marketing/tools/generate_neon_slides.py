"""Generate neon-accent dark gradient slides (no external API needed)."""
from PIL import Image, ImageDraw, ImageFont, ImageFilter
import os, math, random

W, H = 1080, 1080
BEBAS = "/home/user/Claude/ds-marketing/tools/BebasNeue-Regular.ttf"
LIBSANS = "/usr/share/fonts/truetype/liberation/LiberationSans-Bold.ttf"
LIBSANS_REG = "/usr/share/fonts/truetype/liberation/LiberationSans-Regular.ttf"

OUT_MON = "/home/user/Claude/ds-marketing/week1/images/monday"
OUT_WED = "/home/user/Claude/ds-marketing/week1/images/wednesday"
OUT_FRI = "/home/user/Claude/ds-marketing/week1/images/friday"
for d in [OUT_MON, OUT_WED, OUT_FRI]: os.makedirs(d, exist_ok=True)

ACCENT = (0, 210, 150)  # Neon green

def radial_grad(cx, cy, radius, inner, outer=(0,0,0)):
    img = Image.new("RGB", (W, H), outer)
    px = img.load()
    for y in range(0, H, 2):
        for x in range(0, W, 2):
            d = math.sqrt((x-cx)**2+(y-cy)**2)
            t = min(1.0, d/radius); t = t*t
            c = tuple(int(inner[i]*(1-t)+outer[i]*t) for i in range(3))
            px[x,y] = c
            if x+1<W: px[x+1,y] = c
            if y+1<H: px[x,y+1] = c
            if x+1<W and y+1<H: px[x+1,y+1] = c
    return img

def grain(img, n=8):
    px = img.load()
    random.seed(0)
    for _ in range(W*H//3):
        x,y = random.randint(0,W-1), random.randint(0,H-1)
        r,g,b = px[x,y]; v = random.randint(-n,n)
        px[x,y] = (max(0,min(255,r+v)),max(0,min(255,g+v)),max(0,min(255,b+v)))
    return img

def vignette(img):
    mask = Image.new("L",(W,H),0); d = ImageDraw.Draw(mask)
    cx,cy = W//2,H//2; mr = int(W*0.72)
    for r in range(mr,0,-1):
        d.ellipse([cx-r,cy-r,cx+r,cy+r], fill=int(255*r/mr))
    return Image.composite(img, Image.new("RGB",(W,H),(0,0,0)), mask)

def corners(draw, c=(45,45,50)):
    m,l = 45,50
    for pts in [[(m,m),(m+l,m)],[(m,m),(m,m+l)],[(W-m-l,m),(W-m,m)],[(W-m,m),(W-m,m+l)],
                [(m,H-m),(m+l,H-m)],[(m,H-m-l),(m,H-m)],[(W-m-l,H-m),(W-m,H-m)],[(W-m,H-m-l),(W-m,H-m)]]:
        draw.line(pts, fill=c, width=2)

def neon_h(draw, y, x1, x2, color=ACCENT, glow=12):
    for o in range(glow,0,-1):
        a = max(2, int(45*(1-o/glow)))
        gc = tuple(max(0,min(255,int(ci*a/80))) for ci in color)
        draw.line([(x1,y-o),(x2,y-o)], fill=gc); draw.line([(x1,y+o),(x2,y+o)], fill=gc)
    draw.line([(x1,y),(x2,y)], fill=color, width=2)

def neon_v(draw, x, y1, y2, color=ACCENT, glow=6):
    for o in range(glow,0,-1):
        a = max(2,int(40*(1-o/glow)))
        gc = tuple(max(0,min(255,int(ci*a/80))) for ci in color)
        draw.line([(x-o,y1),(x-o,y2)], fill=gc); draw.line([(x+o,y1),(x+o,y2)], fill=gc)
    draw.line([(x,y1),(x,y2)], fill=color, width=2)

def spotlight(img, x, tw=25, bw=180, alpha=20):
    ov = Image.new("RGBA",(W,H),(0,0,0,0)); d = ImageDraw.Draw(ov)
    for y in range(H):
        t = y/H; w = int(tw+(bw-tw)*t); a = int(alpha*(1-t*0.7))
        d.line([(x-w//2,y),(x+w//2,y)], fill=(255,255,255,a))
    return Image.alpha_composite(img.convert("RGBA"), ov).convert("RGB")

def ct(draw, y, text, font, fill=(255,255,255)):
    bb = draw.textbbox((0,0),text,font=font); tw = bb[2]-bb[0]
    x = (W-tw)//2; draw.text((x,y),text,font=font,fill=fill); return x, bb[3]-bb[1]

def wrap(text, font, mw, draw):
    words = text.split(); lines=[]; cur=""
    for w in words:
        t = f"{cur} {w}".strip(); bb = draw.textbbox((0,0),t,font=font)
        if bb[2]-bb[0]<=mw: cur=t
        else:
            if cur: lines.append(cur); cur=w
    if cur: lines.append(cur)
    return lines

def grad_text(img, text, font, y, c1, c2):
    """Gradient-colored text."""
    d = ImageDraw.Draw(img)
    bb = d.textbbox((0,0),text,font=font); tw,th = bb[2]-bb[0],bb[3]-bb[1]
    x = (W-tw)//2
    txt = Image.new("RGBA",(W,H),(0,0,0,0)); td = ImageDraw.Draw(txt)
    td.text((x,y),text,font=font,fill=(255,255,255,255))
    grad = Image.new("RGBA",(W,H),(0,0,0,0)); gp = grad.load(); tp = txt.load()
    for py in range(H):
        t = max(0,min(1,(py-y)/max(1,th)))
        c = tuple(int(c1[i]*(1-t)+c2[i]*t) for i in range(3))
        for px in range(W):
            if tp[px,py][3]>0: gp[px,py] = (*c,tp[px,py][3])
    img.paste(grad,(0,0),grad)
    return x, th

def neon_shadow(img, text, font, x, y, color=ACCENT, blur=10):
    g = Image.new("RGBA",(W,H),(0,0,0,0)); ImageDraw.Draw(g).text((x,y),text,font=font,fill=(*color,90))
    g = g.filter(ImageFilter.GaussianBlur(radius=blur))
    return Image.alpha_composite(img.convert("RGBA"),g).convert("RGB")

def dots(draw, sn, total, y=H-80):
    for i in range(min(total,10)):
        dx = W//2-(total*10)//2+i*20; r = 4 if i==sn-1 else 3
        draw.ellipse([dx-r,y-r,dx+r,y+r], fill=ACCENT if i==sn-1 else (50,50,50))

def footer(draw):
    f = ImageFont.truetype(LIBSANS_REG,16)
    ct(draw, H-42, "@dsmarketing.agency", f, fill=(90,90,90))

# ════ HOOK ════
def hook(l1, l2, sub, path, acc=(18,28,60)):
    img = radial_grad(W//2,int(H*0.35),int(W*0.65),acc)
    img = spotlight(img, W//2, 20, 160, 18)
    img = grain(img,7); img = vignette(img)
    draw = ImageDraw.Draw(img)
    corners(draw)
    bf = ImageFont.truetype(LIBSANS,14)
    ct(draw,50,"D S   M A R K E T I N G",bf,(80,80,80))
    if sub:
        sf = ImageFont.truetype(LIBSANS_REG,20); ct(draw,78,sub,sf,ACCENT)
    neon_h(draw,105,400,W-400,ACCENT,6)
    mf = ImageFont.truetype(BEBAS,88); lines = wrap(l1,mf,W-140,draw)
    bh = len(lines)*95; sy = 360-bh//2
    for i,ln in enumerate(lines):
        bb = draw.textbbox((0,0),ln,font=mf); x = (W-(bb[2]-bb[0]))//2
        img = neon_shadow(img,ln,mf,x,sy+i*95,ACCENT,12); draw = ImageDraw.Draw(img)
        ct(draw,sy+i*95,ln,mf,(255,255,255))
    if l2:
        f2 = ImageFont.truetype(BEBAS,76); ct(draw,sy+len(lines)*95+15,l2,f2,(185,185,185))
    neon_h(draw,H-155,310,W-310,ACCENT,6)
    sw = ImageFont.truetype(LIBSANS_REG,14); ct(draw,H-125,"S W I P E   →",sw,(100,100,100))
    footer(draw); img.save(path, quality=95); print(f"  ✓ {os.path.basename(path)}")

# ════ NUMBERED ════
def numbered(num, title, sub, sn, tot, path, dark=True, acc=(22,28,55)):
    if dark:
        img = radial_grad(int(W*0.3),int(H*0.25),int(W*0.7),acc)
        img = grain(img,6); img = vignette(img)
        tc,sc,lc,nc = (255,255,255),(160,160,170),(55,55,65),(255,255,255)
    else:
        img = Image.new("RGB",(W,H),(240,240,240))
        d = ImageDraw.Draw(img)
        for y in range(H):
            t=y/H; c=tuple(int(240*(1-t*0.03)+235*t*0.03) for _ in range(3))
            d.line([(0,y),(W,y)],fill=c)
        tc,sc,lc,nc = (15,15,15),(90,90,95),(200,200,210),(20,20,20)
    draw = ImageDraw.Draw(img)
    corners(draw, (45,45,50) if dark else (200,200,205))
    # Number with neon glow
    nf = ImageFont.truetype(BEBAS,150); ns = f"{num:02d}"
    if dark:
        img = neon_shadow(img,ns,nf,80,160,ACCENT,15); draw = ImageDraw.Draw(img)
    draw.text((80,160),ns,font=nf,fill=nc)
    nb = draw.textbbox((80,160),ns,font=nf); lx = nb[2]+22
    neon_v(draw,lx,195,350,ACCENT if dark else (100,200,150),6 if dark else 3)
    # Title
    tf = ImageFont.truetype(BEBAS,46); tl = wrap(title.upper(),tf,W-lx-100,draw)
    ty = 210
    for ln in tl: draw.text((lx+25,ty),ln,font=tf,fill=tc); ty+=55
    # Divider
    neon_h(draw,440,85,W-85,ACCENT if dark else (100,200,150),8 if dark else 4)
    # Sub
    sf = ImageFont.truetype(LIBSANS_REG,27); sl = wrap(sub,sf,W-200,draw)
    sy = 490
    for ln in sl: draw.text((100,sy),ln,font=sf,fill=sc); sy+=42
    dots(draw,sn,tot); footer(draw)
    img.save(path, quality=95); print(f"  ✓ {os.path.basename(path)}")

# ════ RECAP ════
def recap(title, points, sn, tot, path, acc=(18,22,52)):
    img = radial_grad(W//2,int(H*0.25),int(W*0.65),acc)
    img = grain(img,5); img = vignette(img)
    draw = ImageDraw.Draw(img); corners(draw)
    tf = ImageFont.truetype(BEBAS,54)
    grad_text(img,title,tf,100,ACCENT,(255,255,255)); draw = ImageDraw.Draw(img)
    neon_h(draw,170,250,W-250,ACCENT,8)
    pf = ImageFont.truetype(BEBAS,24); df = ImageFont.truetype(LIBSANS_REG,24)
    y = 215
    for i,pt in enumerate(points):
        draw.text((110,y),f"{i+1:02d}",font=pf,fill=ACCENT)
        neon_v(draw,155,y+4,y+26,ACCENT,3)
        draw.text((170,y+2),pt,font=df,fill=(215,215,220)); y+=52
    dots(draw,sn,tot); footer(draw)
    img.save(path, quality=95); print(f"  ✓ {os.path.basename(path)}")

# ════ CTA ════
def cta(text, path, acc=(28,22,55)):
    img = radial_grad(W//2,int(H*0.45),int(W*0.55),acc)
    img = spotlight(img,W//2,40,200,15)
    img = grain(img,5); img = vignette(img)
    draw = ImageDraw.Draw(img); corners(draw)
    df = ImageFont.truetype(BEBAS,110); bb = draw.textbbox((0,0),"DS",font=df)
    x = (W-(bb[2]-bb[0]))//2
    img = neon_shadow(img,"DS",df,x,290,ACCENT,18); draw = ImageDraw.Draw(img)
    ct(draw,290,"DS",df,(255,255,255))
    mf = ImageFont.truetype(BEBAS,50); ct(draw,405,"MARKETING",mf,(180,180,185))
    neon_h(draw,478,320,W-320,ACCENT,14)
    cf = ImageFont.truetype(BEBAS,38); ct(draw,515,text,cf,(255,255,255))
    hf = ImageFont.truetype(LIBSANS_REG,22); ct(draw,575,"@dsmarketing.agency",hf,ACCENT)
    wf = ImageFont.truetype(LIBSANS_REG,15); ct(draw,620,"dsmarketing.lovable.app",wf,(70,70,70))
    footer(draw); img.save(path, quality=95); print(f"  ✓ {os.path.basename(path)}")

# ════ BODY (for Friday) ════
def body(title, lines, sn, tot, path, acc=(20,25,50)):
    img = radial_grad(W//2,int(H*0.3),int(W*0.7),acc)
    img = grain(img,5); img = vignette(img)
    draw = ImageDraw.Draw(img); corners(draw)
    tf = ImageFont.truetype(BEBAS,46)
    grad_text(img,title,tf,120,ACCENT,(255,255,255)); draw = ImageDraw.Draw(img)
    neon_h(draw,182,270,W-270,ACCENT,6)
    bf = ImageFont.truetype(LIBSANS_REG,28); y = 225
    for ln in lines:
        if ln == "": y+=22; continue
        ct(draw,y,ln,bf,(195,195,200)); y+=46
    dots(draw,sn,tot); footer(draw)
    img.save(path, quality=95); print(f"  ✓ {os.path.basename(path)}")

# ═══════════════════════════════════
print("\n" + "=" * 50)
print("  DS MARKETING — NEON PREMIUM SLIDES")
print("=" * 50)

print("\n▸ MONDAY: 7 Social Media Mistakes")
print("─"*45)
hook("YOUR SOCIAL MEDIA","ISN'T FAILING. YOUR STRATEGY IS.","7 mistakes killing your growth",
     f"{OUT_MON}/slide_01_hook.png")
mistakes = [
    ("Posting without a content plan","Random posts = random results. A plan turns chaos into consistency."),
    ("Ignoring your analytics","The data tells you exactly what works. Stop guessing, start reading."),
    ("Buying followers for vanity","10K fake followers won't buy your product. Ever. Focus on real engagement."),
    ("No consistent brand voice","If your audience can't recognize you in 2 seconds, you have noise not a brand."),
    ("Same content everywhere","What works on Instagram doesn't work on LinkedIn. Each platform has its own language."),
    ("Zero audience engagement","Posting and disappearing tells the algorithm you don't care about your audience."),
    ("No post-publish strategy","Publishing is 20% of the work. Distribution and engagement is the other 80%."),
]
for i,(t,s) in enumerate(mistakes):
    numbered(i+1,t,s,i+2,10,f"{OUT_MON}/slide_{i+2:02d}.png",dark=(i%2!=0),
             acc=[(22,28,58),(28,22,52),(18,32,55),(32,18,48)][i%4])
recap("QUICK RECAP",["No content plan","Ignoring analytics","Buying fake followers",
      "Inconsistent brand voice","Same content everywhere","Not engaging","No post-publish strategy"],
      9,10,f"{OUT_MON}/slide_09_recap.png")
cta("FOLLOW FOR MORE",f"{OUT_MON}/slide_10_cta.png")

print("\n▸ WEDNESDAY: Perfect Content Calendar")
print("─"*45)
hook("STOP POSTING RANDOMLY.","START POSTING STRATEGICALLY.","Your weekly content framework",
     f"{OUT_WED}/slide_01_hook.png",(22,18,55))
days = [
    ("Monday — Educational","Tips, how-tos, frameworks. Prove your expertise."),
    ("Tuesday — Industry insights","Share trends your audience hasn't seen. Be the one who sees what's coming."),
    ("Wednesday — Case study","Real numbers, real results, real clients. Nothing builds trust faster."),
    ("Thursday — Behind the scenes","Show your process, your team. People buy from people they trust."),
    ("Friday — Engagement post","Ask questions. Run polls. Start debates. Let your audience talk."),
    ("Weekend — Brand story","Your mission. Your values. Build connection, not just reach."),
    ("Secret — Batch on Monday","Create the full week in one sitting. Then spend the rest engaging."),
]
for i,(t,s) in enumerate(days):
    numbered(i+1,t,s,i+2,10,f"{OUT_WED}/slide_{i+2:02d}.png",dark=(i%2==0),
             acc=[(18,25,55),(25,20,50),(22,30,48),(30,18,55)][i%4])
recap("YOUR WEEKLY FRAMEWORK",["MON — Educate","TUE — Industry insights","WED — Case studies",
      "THU — Behind the scenes","FRI — Engage","SAT/SUN — Brand story","SECRET — Batch Monday"],
      9,10,f"{OUT_WED}/slide_09_recap.png")
cta("SAVE THIS FRAMEWORK",f"{OUT_WED}/slide_10_cta.png",(22,18,55))

print("\n▸ FRIDAY: The 3-Second Rule")
print("─"*45)
hook("YOU HAVE 3 SECONDS.","","The rule that changes everything",f"{OUT_FRI}/slide_01_hook.png",(35,22,50))
body("THE 3-SECOND RULE",["Your audience decides in 3 seconds","whether to stop scrolling","or keep going.",
     "","That means your hook is everything.","","Not your logo.","Not your color palette.",
     "Not your font choice.","","Your first line.","","That's where the battle","is won or lost."],
     2,3,f"{OUT_FRI}/slide_02.png")
cta("MAKE EVERY HOOK COUNT",f"{OUT_FRI}/slide_03_cta.png",(32,20,48))

print("\n" + "=" * 50)
print("  ✓ ALL 23 NEON PREMIUM SLIDES GENERATED")
print("=" * 50)
