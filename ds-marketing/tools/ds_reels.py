#!/usr/bin/env python3
"""
DS MARKETING VIDEO ENGINE v3.0
==================================
REAL animated videos — not slideshows.
Frame-by-frame rendering with:
- Text that fades in word by word
- Floating particles that drift
- Smooth crossfade transitions
- Animated light pulses
- AI voiceover + cinematic music
- 9:16 vertical MP4 for Instagram Reels

Run: python3 ds_reels.py
"""

import os, sys, subprocess, asyncio, random, math, time, struct

def ensure(pkg, pip_name=None):
    try: __import__(pkg)
    except ImportError:
        print(f"  Installing {pip_name or pkg}...")
        subprocess.check_call([sys.executable, "-m", "pip", "install", pip_name or pkg],
                              stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)

ensure("PIL", "Pillow")
ensure("numpy")
ensure("edge_tts", "edge-tts")

from PIL import Image, ImageDraw, ImageFont, ImageFilter, ImageEnhance
import numpy as np

# Check moviepy
try:
    ensure("moviepy")
    try:
        from moviepy import ImageSequenceClip, AudioFileClip, CompositeAudioClip, concatenate_videoclips
    except ImportError:
        from moviepy.editor import ImageSequenceClip, AudioFileClip, CompositeAudioClip, concatenate_videoclips
except:
    pass

import edge_tts

# ══════════════════════════════════════════════
# CONFIG
# ══════════════════════════════════════════════
W, H = 1080, 1920
OUT = "ds-marketing-reels"
FPS = 20  # 20fps = good quality, faster render
VOICE = "en-US-DavisNeural"

BLACK = (0, 0, 0)
WHITE = (255, 255, 255)
LIGHT_GRAY = (190, 190, 190)
MED_GRAY = (100, 100, 100)


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
# VOICE ENGINE
# ══════════════════════════════════════════════
async def _gen_voice(text, path, voice, rate):
    c = edge_tts.Communicate(text, voice, rate=rate)
    await c.save(path)

def make_voice(text, path):
    if os.path.exists(path) and os.path.getsize(path) > 1000:
        print(f"    \u2713 voice cached")
        return True
    for v in [VOICE, "en-US-GuyNeural", "en-US-ChristopherNeural", "en-US-EricNeural"]:
        try:
            asyncio.run(_gen_voice(text, path, v, "-8%"))
            if os.path.exists(path) and os.path.getsize(path) > 1000:
                print(f"    \u2713 voice ({v})")
                return True
        except:
            continue
    print(f"    ! voice failed")
    return False


# ══════════════════════════════════════════════
# MUSIC ENGINE
# ══════════════════════════════════════════════
def make_music(path, duration=45, sr=44100):
    if os.path.exists(path) and os.path.getsize(path) > 5000:
        print(f"    \u2713 music cached")
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
        print(f"    \u2713 music generated")
        return True
    except Exception as e:
        print(f"    ! music: {e}")
        return False


# ══════════════════════════════════════════════
# ANIMATION ENGINE — Frame by Frame
# ══════════════════════════════════════════════

class Particle:
    """A floating light particle that drifts."""
    def __init__(self, rng):
        self.x = rng.randint(0, W)
        self.y = rng.randint(0, H)
        self.r = rng.randint(3, 18)
        self.alpha = rng.randint(10, 40)
        self.vx = rng.uniform(-0.3, 0.3)
        self.vy = rng.uniform(-0.5, -0.1)  # drift upward
        self.pulse_speed = rng.uniform(0.5, 2.0)
        self.pulse_offset = rng.uniform(0, 6.28)

    def update(self, dt):
        self.x += self.vx * dt * 60
        self.y += self.vy * dt * 60
        if self.y < -20: self.y = H + 20
        if self.x < -20: self.x = W + 20
        if self.x > W + 20: self.x = -20

    def draw(self, img_array, t):
        pulse = 0.6 + 0.4 * math.sin(t * self.pulse_speed + self.pulse_offset)
        a = int(self.alpha * pulse)
        r = self.r
        ix, iy = int(self.x), int(self.y)
        for dy in range(-r, r + 1):
            for dx in range(-r, r + 1):
                dist = math.sqrt(dx*dx + dy*dy)
                if dist <= r:
                    px, py = ix + dx, iy + dy
                    if 0 <= px < W and 0 <= py < H:
                        falloff = 1 - (dist / r)
                        blend = a * falloff * falloff / 255
                        img_array[py, px] = np.clip(
                            img_array[py, px] + np.array([255*blend, 255*blend, 255*blend]),
                            0, 255
                        ).astype(np.uint8)


def ease_out(t):
    """Smooth ease-out curve."""
    return 1 - (1 - t) ** 3

def ease_in_out(t):
    """Smooth ease in-out."""
    if t < 0.5:
        return 4 * t * t * t
    return 1 - (-2 * t + 2) ** 3 / 2


def render_text_centered(draw, y, text, font, alpha=255, img_w=W):
    """Render centered text with alpha (approximated via grayscale)."""
    bb = draw.textbbox((0, 0), text, font=font)
    x = (img_w - (bb[2] - bb[0])) // 2
    if alpha >= 250:
        # Full opacity — draw with outline for readability
        for ddx in range(-3, 4):
            for ddy in range(-3, 4):
                if ddx*ddx + ddy*ddy <= 9:
                    draw.text((x+ddx, y+ddy), text, font=font, fill=(0, 0, 0))
        draw.text((x, y), text, font=font, fill=WHITE)
    else:
        c = max(0, min(255, alpha))
        for ddx in range(-2, 3):
            for ddy in range(-2, 3):
                if ddx*ddx + ddy*ddy <= 4:
                    draw.text((x+ddx, y+ddy), text, font=font, fill=(0, 0, 0))
        draw.text((x, y), text, font=font, fill=(c, c, c))
    return x


def render_scene_frame(scene, t, scene_duration, particles):
    """
    Render a single frame of a scene at time t.
    Returns a numpy array (H, W, 3).
    """
    img = Image.new("RGB", (W, H), BLACK)

    # Subtle animated background glow
    pulse = 0.5 + 0.5 * math.sin(t * 0.8)
    glow_v = int(6 + 8 * pulse)
    draw = ImageDraw.Draw(img)
    cx, cy = W // 2, int(H * 0.4)
    # Simple radial gradient (optimized — skip pixels)
    for y_pos in range(0, H, 4):
        for x_pos in range(0, W, 4):
            d = math.sqrt((x_pos - cx)**2 + (y_pos - cy)**2)
            tt = min(1.0, d / (max(W, H) * 0.45))
            v = int(glow_v * (1 - tt**1.3))
            if v > 0:
                for dy in range(4):
                    for dx in range(4):
                        if y_pos+dy < H and x_pos+dx < W:
                            img.putpixel((x_pos+dx, y_pos+dy), (v, v, v))

    # Character background if available
    if scene.get("char_img"):
        char_img = scene["char_img"]
        # Fade character in during first 0.5s
        char_alpha = min(1.0, t / 0.5) if t < 0.5 else 1.0
        if char_alpha > 0:
            # Blend character onto background
            ch_array = np.array(char_img).astype(np.float32)
            bg_array = np.array(img).astype(np.float32)
            blended = bg_array * (1 - char_alpha) + ch_array * char_alpha
            img = Image.fromarray(blended.astype(np.uint8))

    draw = ImageDraw.Draw(img)

    # Progress through scene (0.0 to 1.0)
    progress = t / scene_duration if scene_duration > 0 else 1.0

    scene_type = scene.get("type", "text")

    if scene_type == "title":
        # Animated title reveal — lines fade in one by one
        lines = scene.get("lines", [])
        sub = scene.get("sub")
        stagger = 0.4  # seconds between each line appearing
        hf = H_FONT(90)

        y_start = int(H * 0.35) if not scene.get("char_img") else int(H * 0.58)

        for i, ln in enumerate(lines):
            line_start = i * stagger
            line_progress = max(0, min(1, (t - line_start) / 0.4))
            alpha = int(255 * ease_out(line_progress))
            # Slide up effect
            y_offset = int(30 * (1 - ease_out(line_progress)))
            if alpha > 0:
                render_text_centered(draw, y_start + i * 105 + y_offset, ln, hf, alpha)

        # Subtitle fades in after all lines
        if sub:
            sub_start = len(lines) * stagger + 0.3
            sub_progress = max(0, min(1, (t - sub_start) / 0.5))
            sub_alpha = int(255 * ease_out(sub_progress))
            if sub_alpha > 0:
                sf = R_FONT(38)
                c = max(0, min(190, int(190 * ease_out(sub_progress))))
                bb = draw.textbbox((0, 0), sub, font=sf)
                sx = (W - (bb[2] - bb[0])) // 2
                draw.text((sx, y_start + len(lines) * 105 + 40), sub, font=sf, fill=(c, c, c))

    elif scene_type == "number":
        # Giant number zooms in, then title fades in
        num = scene.get("num", 1)
        title = scene.get("title", "")
        sub = scene.get("sub")

        # Number animation: scale from 0 to full in 0.5s
        num_progress = min(1.0, t / 0.5)
        num_scale = ease_out(num_progress)
        num_alpha = int(255 * num_scale)

        if num_alpha > 5:
            ns = f"{num:02d}"
            font_size = int(280 * num_scale)
            if font_size > 20:
                nf = H_FONT(max(20, font_size))
                bb = draw.textbbox((0, 0), ns, font=nf)
                nx = (W - (bb[2] - bb[0])) // 2
                ny = int(H * 0.2) + int(40 * (1 - num_scale))
                c = min(255, num_alpha)
                # Outline
                for ddx in range(-4, 5):
                    for ddy in range(-4, 5):
                        if ddx*ddx + ddy*ddy <= 16:
                            draw.text((nx+ddx, ny+ddy), ns, font=nf, fill=(0,0,0))
                draw.text((nx, ny), ns, font=nf, fill=(c, c, c))

        # Line appears at 0.5s
        line_progress = max(0, min(1, (t - 0.5) / 0.3))
        if line_progress > 0:
            line_w = int((W - 400) * ease_out(line_progress))
            line_x = (W - line_w) // 2
            line_y = int(H * 0.48)
            draw.line([(line_x, line_y), (line_x + line_w, line_y)], fill=WHITE, width=2)

        # Title fades in at 0.7s
        title_progress = max(0, min(1, (t - 0.7) / 0.4))
        if title_progress > 0:
            tf = H_FONT(60)
            ta = int(255 * ease_out(title_progress))
            y_off = int(20 * (1 - ease_out(title_progress)))
            # Word wrap
            words = title.upper().split()
            lines_t = []
            cur = ""
            for w in words:
                test = f"{cur} {w}".strip()
                if draw.textbbox((0, 0), test, font=tf)[2] <= W - 120: cur = test
                else:
                    if cur: lines_t.append(cur)
                    cur = w
            if cur: lines_t.append(cur)

            ty = int(H * 0.5) + 20 + y_off
            for ln in lines_t:
                render_text_centered(draw, ty, ln, tf, ta)
                ty += 72

        # Subtitle at 1.0s
        if sub:
            sub_progress = max(0, min(1, (t - 1.0) / 0.4))
            if sub_progress > 0:
                sf = R_FONT(32)
                c = int(190 * ease_out(sub_progress))
                # wrap
                words = sub.split()
                lines_s = []
                cur = ""
                for w in words:
                    test = f"{cur} {w}".strip()
                    if draw.textbbox((0, 0), test, font=sf)[2] <= W - 140: cur = test
                    else:
                        if cur: lines_s.append(cur)
                        cur = w
                if cur: lines_s.append(cur)
                sy = int(H * 0.68)
                for sl in lines_s:
                    bb = draw.textbbox((0, 0), sl, font=sf)
                    sx = (W - (bb[2] - bb[0])) // 2
                    draw.text((sx, sy), sl, font=sf, fill=(c, c, c))
                    sy += 44

    elif scene_type == "day":
        # Day name zooms in big, description slides up
        day = scene.get("day", "")
        desc = scene.get("desc", "")

        day_progress = min(1.0, t / 0.5)
        day_scale = ease_out(day_progress)

        font_size = int(120 * day_scale)
        if font_size > 20:
            df = H_FONT(max(20, font_size))
            c = int(255 * day_scale)
            bb = draw.textbbox((0, 0), day.upper(), font=df)
            dx = (W - (bb[2] - bb[0])) // 2
            dy = int(H * 0.32) + int(30 * (1 - day_scale))
            for ddx in range(-3, 4):
                for ddy in range(-3, 4):
                    if ddx*ddx + ddy*ddy <= 9:
                        draw.text((dx+ddx, dy+ddy), day.upper(), font=df, fill=(0,0,0))
            draw.text((dx, dy), day.upper(), font=df, fill=(c, c, c))

        # Line
        line_progress = max(0, min(1, (t - 0.4) / 0.3))
        if line_progress > 0:
            lw = int((W - 360) * ease_out(line_progress))
            lx = (W - lw) // 2
            ly = int(H * 0.46)
            draw.line([(lx, ly), (lx + lw, ly)], fill=WHITE, width=1)

        # Description
        desc_progress = max(0, min(1, (t - 0.6) / 0.4))
        if desc_progress > 0:
            sf = R_FONT(36)
            c = int(190 * ease_out(desc_progress))
            y_off = int(20 * (1 - ease_out(desc_progress)))
            words = desc.split()
            lines_d = []
            cur = ""
            for w in words:
                test = f"{cur} {w}".strip()
                if draw.textbbox((0, 0), test, font=sf)[2] <= W - 140: cur = test
                else:
                    if cur: lines_d.append(cur)
                    cur = w
            if cur: lines_d.append(cur)
            sy = int(H * 0.49) + y_off
            for sl in lines_d:
                bb = draw.textbbox((0, 0), sl, font=sf)
                sx = (W - (bb[2] - bb[0])) // 2
                draw.text((sx, sy), sl, font=sf, fill=(c, c, c))
                sy += 50

    elif scene_type == "cta":
        # DS logo pulses, then text fades in
        pulse_alpha = 0.7 + 0.3 * math.sin(t * 2)

        ds_progress = min(1.0, t / 0.6)
        ds_scale = ease_out(ds_progress)
        font_size = int(180 * ds_scale)
        if font_size > 20:
            dsf = H_FONT(max(20, font_size))
            c = int(255 * ds_scale * pulse_alpha)
            bb = draw.textbbox((0, 0), "DS", font=dsf)
            dx = (W - (bb[2] - bb[0])) // 2
            dy = int(H * 0.26) + int(40 * (1 - ds_scale))
            for ddx in range(-4, 5):
                for ddy in range(-4, 5):
                    if ddx*ddx + ddy*ddy <= 16:
                        draw.text((dx+ddx, dy+ddy), "DS", font=dsf, fill=(0,0,0))
            draw.text((dx, dy), "DS", font=dsf, fill=(c, c, c))

        # MARKETING
        mkt_progress = max(0, min(1, (t - 0.4) / 0.4))
        if mkt_progress > 0:
            mf = H_FONT(65)
            c = int(190 * ease_out(mkt_progress))
            render_text_centered(draw, int(H * 0.42), "MARKETING", mf, c)

        # Line
        line_prog = max(0, min(1, (t - 0.7) / 0.3))
        if line_prog > 0:
            lw = int(500 * ease_out(line_prog))
            lx = (W - lw) // 2
            draw.line([(lx, int(H*0.5)), (lx+lw, int(H*0.5))], fill=WHITE, width=2)

        # Handle
        h_prog = max(0, min(1, (t - 0.9) / 0.3))
        if h_prog > 0:
            hf = B_FONT(34)
            c = int(255 * ease_out(h_prog))
            bb = draw.textbbox((0,0), "@dsmarketing.agency", font=hf)
            hx = (W - (bb[2]-bb[0])) // 2
            draw.text((hx, int(H*0.54)), "@dsmarketing.agency", font=hf, fill=(c,c,c))

        wf_prog = max(0, min(1, (t - 1.1) / 0.3))
        if wf_prog > 0:
            wf = R_FONT(22)
            c = int(100 * ease_out(wf_prog))
            bb = draw.textbbox((0,0), "dsmarketing.lovable.app", font=wf)
            wx = (W - (bb[2]-bb[0])) // 2
            draw.text((wx, int(H*0.6)), "dsmarketing.lovable.app", font=wf, fill=(c,c,c))

        ff_prog = max(0, min(1, (t - 1.3) / 0.4))
        if ff_prog > 0:
            ff = H_FONT(50)
            c = int(255 * ease_out(ff_prog))
            render_text_centered(draw, int(H*0.68), "FOLLOW FOR MORE", ff, c)

    else:
        # Generic text scene — lines fade in with stagger
        lines = scene.get("lines", [])
        sub = scene.get("sub")
        stagger = 0.35
        hf = H_FONT(80)
        y_start = (H - len(lines) * 100) // 2 - 50

        for i, ln in enumerate(lines):
            line_start = i * stagger
            lp = max(0, min(1, (t - line_start) / 0.4))
            alpha = int(255 * ease_out(lp))
            y_off = int(25 * (1 - ease_out(lp)))
            if alpha > 0:
                render_text_centered(draw, y_start + i * 100 + y_off, ln, hf, alpha)

        if sub:
            sub_start = len(lines) * stagger + 0.3
            sp = max(0, min(1, (t - sub_start) / 0.5))
            if sp > 0:
                sf = R_FONT(34)
                c = int(190 * ease_out(sp))
                bb = draw.textbbox((0,0), sub, font=sf)
                sx = (W - (bb[2]-bb[0])) // 2
                draw.text((sx, y_start + len(lines)*100 + 50), sub, font=sf, fill=(c,c,c))

    # Brand watermark (always visible, subtle)
    bf = B_FONT(22)
    draw.text((W//2 - 90, H - 140), "@dsmarketing.agency", font=bf, fill=(50, 50, 50))

    # Scene fade-in (first 0.3s) and fade-out (last 0.3s)
    arr = np.array(img)

    if t < 0.3:
        arr = (arr * (t / 0.3)).astype(np.uint8)
    if scene_duration - t < 0.3:
        arr = (arr * ((scene_duration - t) / 0.3)).astype(np.uint8)

    # Draw particles onto array
    for p in particles:
        p.update(1.0 / FPS)
        p.draw(arr, t)

    return arr


def render_reel_animated(scenes, voice_path, music_path, output_path):
    """
    Render a full reel frame-by-frame with real animation.
    """
    # Initialize particles
    rng = random.Random(42)
    particles = [Particle(rng) for _ in range(25)]

    all_frames = []
    total_frames = 0

    for sc_idx, scene in enumerate(scenes):
        dur = scene["dur"]
        n_frames = int(dur * FPS)
        total_frames += n_frames
        print(f"      scene {sc_idx+1}/{len(scenes)}: {n_frames} frames ({dur}s)...", end=" ", flush=True)

        for f_idx in range(n_frames):
            t = f_idx / FPS
            frame = render_scene_frame(scene, t, dur, particles)
            all_frames.append(frame)

        print("done")

    print(f"    Total: {total_frames} frames ({total_frames/FPS:.1f}s)")
    print(f"    Encoding video...")

    # Save frames as temporary files and build video
    temp_dir = f"{OUT}/_frames"
    os.makedirs(temp_dir, exist_ok=True)

    frame_paths = []
    for i, frame in enumerate(all_frames):
        p = f"{temp_dir}/f_{i:05d}.png"
        Image.fromarray(frame).save(p, quality=90)
        frame_paths.append(p)

    # Build video with moviepy
    video = ImageSequenceClip(frame_paths, fps=FPS)

    # Audio
    audio_tracks = []
    if voice_path and os.path.exists(voice_path):
        try:
            va = AudioFileClip(voice_path)
            if va.duration > video.duration:
                try: va = va.subclipped(0, video.duration)
                except: va = va.subclip(0, video.duration)
            audio_tracks.append(va)
        except Exception as e:
            print(f"    ! voice: {e}")

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
        except Exception as e:
            print(f"    ! music: {e}")

    if audio_tracks:
        if len(audio_tracks) > 1:
            video = video.with_audio(CompositeAudioClip(audio_tracks))
        else:
            video = video.with_audio(audio_tracks[0])

    video.write_videofile(output_path, fps=FPS, codec="libx264", audio_codec="aac", logger=None)

    # Cleanup
    for p in frame_paths:
        try: os.remove(p)
        except: pass
    try: os.rmdir(temp_dir)
    except: pass

    print(f"  \u2713 {os.path.basename(output_path)}")


# ══════════════════════════════════════════════
# REEL CONTENT
# ══════════════════════════════════════════════

def load_char(char_dir, name):
    """Load and prepare character for video frames."""
    if not char_dir:
        return None
    for n in [name, name + "_desk", name + "_launch"]:
        p = f"{char_dir}/{n}.png"
        if os.path.exists(p):
            ch = Image.open(p).convert("RGB")
            # Scale to fill width
            scale = W / ch.width
            new_h = int(ch.height * scale)
            if new_h < int(H * 0.65):
                scale = (H * 0.7) / ch.height
            new_w = int(ch.width * scale)
            new_h = int(ch.height * scale)
            ch = ch.resize((new_w, new_h), Image.LANCZOS)

            # Brighten + desaturate
            ch = ImageEnhance.Brightness(ch).enhance(1.3)
            ch = ImageEnhance.Contrast(ch).enhance(1.2)
            gray = ch.convert("L").convert("RGB")
            ch = Image.blend(ch, gray, 0.85)

            # Place on black canvas
            canvas = Image.new("RGB", (W, H), BLACK)
            x_off = (W - new_w) // 2
            canvas.paste(ch, (x_off, 0))

            # Gradient overlay bottom
            ov = Image.new("RGBA", (W, H), (0,0,0,0))
            d = ImageDraw.Draw(ov)
            for y in range(int(H*0.3), H):
                t = (y - H*0.3) / (H*0.7)
                a = int(240 * t**1.1)
                d.line([(0,y),(W,y)], fill=(0,0,0,min(255,a)))
            canvas = Image.alpha_composite(canvas.convert("RGBA"), ov).convert("RGB")

            return canvas
    return None


REELS = [
    {
        "name": "reel_01_mistakes",
        "title": "7 Social Media Mistakes",
        "voice_text": (
            "Your social media isn't failing... your strategy is. "
            "And here are the seven mistakes... that are killing your growth right now. "
            "One... posting without a content plan. Random posts? Random results. It's that simple. "
            "Two... ignoring your analytics. The data is literally telling you what works. Why aren't you reading it? "
            "Three... buying followers. Ten thousand fake followers will never buy your product. Ever. "
            "Four... no consistent brand voice. If people can't recognize you in two seconds? You don't have a brand. "
            "Five... posting the same content everywhere. Instagram and LinkedIn are completely different. "
            "Six... zero engagement. Post and ghost? The algorithm notices. "
            "Seven... no distribution strategy. Publishing is only twenty percent of the work. "
            "Follow D S Marketing... for more."
        ),
        "scenes": [
            {"type": "title", "char": "frustrated", "lines": ["YOUR SOCIAL", "MEDIA ISN'T", "FAILING."], "sub": "Your strategy is.", "dur": 5},
            {"type": "number", "num": 1, "title": "No Content Plan", "sub": "Random posts give random results.", "dur": 4},
            {"type": "number", "num": 2, "title": "Ignoring Analytics", "sub": "The data tells you what works.", "dur": 3.5},
            {"type": "number", "num": 3, "title": "Buying Followers", "sub": "Fake followers never buy.", "dur": 3.5},
            {"type": "number", "num": 4, "title": "No Brand Voice", "sub": "Unrecognizable = invisible.", "dur": 3.5},
            {"type": "number", "num": 5, "title": "Same Everywhere", "sub": "Each platform is different.", "dur": 3.5},
            {"type": "number", "num": 6, "title": "Zero Engagement", "sub": "The algorithm notices silence.", "dur": 3.5},
            {"type": "number", "num": 7, "title": "No Distribution", "sub": "Publishing is only 20%.", "dur": 3.5},
            {"type": "cta", "dur": 4.5},
        ],
    },
    {
        "name": "reel_02_calendar",
        "title": "Your Content Calendar",
        "voice_text": (
            "Stop posting randomly... and start posting strategically. "
            "Here's the content framework... that actually works. "
            "Monday... education. Tips, frameworks, how-to's. "
            "Tuesday... industry insights. See what's coming. "
            "Wednesday... case studies. Real numbers. "
            "Thursday... behind the scenes. Your process. "
            "Friday... engagement. Questions and conversations. "
            "Weekends... brand story. Mission and values. "
            "The secret weapon? Batch everything on Monday. "
            "Save this... D S Marketing."
        ),
        "scenes": [
            {"type": "title", "char": "presenter", "lines": ["STOP POSTING", "RANDOMLY."], "sub": "Start posting strategically.", "dur": 4.5},
            {"type": "day", "day": "Monday", "desc": "Education. Tips, frameworks, how-to's.", "dur": 3},
            {"type": "day", "day": "Tuesday", "desc": "Industry insights. See what's coming.", "dur": 2.8},
            {"type": "day", "day": "Wednesday", "desc": "Case studies. Real numbers, real results.", "dur": 2.8},
            {"type": "day", "day": "Thursday", "desc": "Behind the scenes. Your process.", "dur": 2.8},
            {"type": "day", "day": "Friday", "desc": "Engagement. Questions and conversations.", "dur": 2.8},
            {"type": "day", "day": "Weekend", "desc": "Brand story. Mission and values.", "dur": 2.8},
            {"type": "title", "char": "visionary", "lines": ["THE SECRET:", "BATCH MONDAY."], "sub": "Create the full week in one sitting.", "dur": 4},
            {"type": "cta", "dur": 3.5},
        ],
    },
    {
        "name": "reel_03_hook",
        "title": "The 3-Second Rule",
        "voice_text": (
            "You have three seconds... "
            "Three seconds to stop the scroll... "
            "Your audience decides in three seconds... whether to keep watching... or swipe away. "
            "Your hook... is everything. "
            "Not your logo... not your colors... not your fonts... "
            "Your first line... that's where the battle is won... or lost. "
            "Make every hook count... D S Marketing."
        ),
        "scenes": [
            {"type": "title", "char": "clock", "lines": ["YOU HAVE", "3 SECONDS."], "dur": 3.5},
            {"type": "text", "lines": ["3 SECONDS", "TO STOP", "THE SCROLL."], "dur": 3.5},
            {"type": "text", "lines": ["YOUR HOOK IS", "EVERYTHING."], "dur": 3.5},
            {"type": "text", "lines": ["NOT YOUR LOGO.", "NOT YOUR FONTS.", "NOT YOUR COLORS."], "dur": 3.5},
            {"type": "text", "lines": ["YOUR", "FIRST LINE."], "sub": "That's where the battle is won.", "dur": 4.5},
            {"type": "cta", "dur": 4},
        ],
    },
]


# ══════════════════════════════════════════════
# MAIN
# ══════════════════════════════════════════════

def main():
    print()
    print("  \u2554" + "\u2550" * 54 + "\u2557")
    print("  \u2551  DS MARKETING VIDEO ENGINE v3.0                  \u2551")
    print("  \u2551  Real Animation. Frame by Frame. Not Slideshows. \u2551")
    print("  \u2551  AI Voice + Cinematic Music + Moving Particles.  \u2551")
    print("  \u255a" + "\u2550" * 54 + "\u255d")
    print()
    print(f"  Rendering at {FPS}fps | {W}x{H} | 9:16 vertical")
    print()

    os.makedirs(OUT, exist_ok=True)
    os.makedirs(f"{OUT}/audio", exist_ok=True)

    # Find characters
    char_dir = None
    for d in ["ds-marketing-engine/characters", "ds-marketing-bw/characters", "ds-marketing-final/characters"]:
        if os.path.exists(d):
            char_dir = d
            break

    if char_dir:
        print(f"  Characters: {char_dir}/")
    else:
        print("  No characters found. Run ds_engine.py first for character images.")
    print()

    # Music
    print("  STEP 1: Cinematic Soundtrack")
    print("  " + "\u2500" * 54)
    music_path = f"{OUT}/audio/cinematic_bg.wav"
    make_music(music_path, 50)

    # Reels
    for idx, reel in enumerate(REELS):
        print(f"\n  STEP {idx + 2}: {reel['title']}")
        print("  " + "\u2500" * 54)

        # Voice
        vp = f"{OUT}/audio/{reel['name']}_voice.mp3"
        print(f"    Generating voice...")
        make_voice(reel["voice_text"], vp)

        # Load characters for scenes
        print(f"    Loading characters...")
        for sc in reel["scenes"]:
            if sc.get("char"):
                sc["char_img"] = load_char(char_dir, sc["char"])

        # Render animation frame by frame
        print(f"    Rendering animation (this takes a few minutes)...")
        op = f"{OUT}/{reel['name']}.mp4"
        try:
            render_reel_animated(reel["scenes"], vp, music_path, op)
        except Exception as e:
            print(f"    ! Error: {e}")
            import traceback
            traceback.print_exc()

    print()
    print("  \u2554" + "\u2550" * 54 + "\u2557")
    print("  \u2551  ALL DONE \u2014 VIDEO ENGINE v3.0 COMPLETE           \u2551")
    print("  \u255a" + "\u2550" * 54 + "\u255d")
    print(f"""
  Your reels: {OUT}/

     reel_01_mistakes.mp4      7 Social Media Mistakes
     reel_02_calendar.mp4      Content Calendar Framework
     reel_03_hook.mp4          The 3-Second Rule

  REAL ANIMATION:
     Text fades in word by word
     Numbers zoom and scale up
     Floating particles that drift
     Smooth crossfade transitions
     Pulsing light effects
     AI voiceover + cinematic music

  Upload directly to Instagram Reels.
""")


if __name__ == "__main__":
    main()
