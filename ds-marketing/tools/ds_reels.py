#!/usr/bin/env python3
"""
DS MARKETING REELS ENGINE v1.0
=================================
Creates Instagram Reels with:
- Animated slides (zoom, pan, transitions)
- AI voiceover (Microsoft neural voices — FREE, no API key)
- Background ambient music
- Ready-to-post MP4 files

REQUIREMENTS (auto-installed):
  pip install Pillow moviepy edge-tts numpy

Run: python3 ds_reels.py
"""

import os, sys, subprocess, asyncio, random, math, time

# ── Auto-install dependencies ──
def ensure(pkg, pip_name=None):
    try:
        __import__(pkg)
    except ImportError:
        print(f"  Installing {pip_name or pkg}...")
        subprocess.check_call([sys.executable, "-m", "pip", "install", pip_name or pkg],
                              stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)

ensure("PIL", "Pillow")
ensure("moviepy")
ensure("edge_tts", "edge-tts")
ensure("numpy")

from PIL import Image, ImageDraw, ImageFont, ImageFilter, ImageEnhance
import numpy as np

# moviepy imports
try:
    # moviepy 2.x
    from moviepy import (
        ImageClip, AudioFileClip, CompositeVideoClip,
        concatenate_videoclips, TextClip, ColorClip, CompositeAudioClip
    )
    MOVIEPY_V2 = True
except ImportError:
    # moviepy 1.x
    from moviepy.editor import (
        ImageClip, AudioFileClip, CompositeVideoClip,
        concatenate_videoclips, TextClip, ColorClip, CompositeAudioClip
    )
    MOVIEPY_V2 = False

import edge_tts


# ══════════════════════════════════════════════
# CONFIG
# ══════════════════════════════════════════════
W, H = 1080, 1920  # 9:16 vertical for Reels
OUT = "ds-marketing-reels"
VOICE = "en-US-GuyNeural"  # Professional male voice (free Microsoft neural)
# Other voice options:
#   "en-US-JennyNeural"     — female, friendly
#   "en-US-AriaNeural"      — female, professional
#   "en-US-DavisNeural"     — male, deep
#   "en-GB-RyanNeural"      — British male
#   "en-GB-SoniaNeural"     — British female

# Brand colors
BLACK = (0, 0, 0)
WHITE = (255, 255, 255)
DARK_BG = (5, 5, 5)
MED_GRAY = (128, 128, 128)
LIGHT_GRAY = (200, 200, 200)

FPS = 30


# ══════════════════════════════════════════════
# FONTS
# ══════════════════════════════════════════════
def _f(paths, sz):
    for p in paths:
        if os.path.exists(p):
            try: return ImageFont.truetype(p, sz)
            except: pass
    return ImageFont.load_default()

def HEADLINE(sz):
    return _f([
        "BebasNeue-Regular.ttf",
        "/System/Library/Fonts/Supplemental/Impact.ttf",
        "/Library/Fonts/Impact.ttf",
        "/usr/share/fonts/truetype/liberation/LiberationSans-Bold.ttf",
    ], sz)

def BODY_BOLD(sz):
    return _f([
        "/System/Library/Fonts/Supplemental/Arial Bold.ttf",
        "/Library/Fonts/Arial Bold.ttf",
        "/System/Library/Fonts/Helvetica-Bold.otf",
        "/usr/share/fonts/truetype/liberation/LiberationSans-Bold.ttf",
    ], sz)

def BODY(sz):
    return _f([
        "/System/Library/Fonts/Supplemental/Arial.ttf",
        "/Library/Fonts/Arial.ttf",
        "/System/Library/Fonts/Helvetica.ttc",
        "/usr/share/fonts/truetype/liberation/LiberationSans-Regular.ttf",
    ], sz)


# ══════════════════════════════════════════════
# AI VOICEOVER ENGINE (edge-tts — 100% free)
# ══════════════════════════════════════════════

async def _generate_voice(text, output_path, voice=VOICE, rate="+0%"):
    """Generate AI voiceover using Microsoft Edge neural voices."""
    communicate = edge_tts.Communicate(text, voice, rate=rate)
    await communicate.save(output_path)


def generate_voiceover(text, output_path, voice=VOICE, rate="+0%"):
    """Sync wrapper for voice generation."""
    if os.path.exists(output_path) and os.path.getsize(output_path) > 1000:
        print(f"    \u2713 voice cached")
        return True
    try:
        asyncio.run(_generate_voice(text, output_path, voice, rate))
        if os.path.exists(output_path) and os.path.getsize(output_path) > 1000:
            print(f"    \u2713 voice generated")
            return True
    except Exception as e:
        print(f"    ! voice failed: {e}")
    return False


# ══════════════════════════════════════════════
# BACKGROUND MUSIC GENERATOR (pure Python)
# ══════════════════════════════════════════════

def generate_ambient_music(output_path, duration=30, sample_rate=44100):
    """
    Generate subtle ambient background music.
    Dark, moody, cinematic low drone — perfect for B&W brand reels.
    Pure Python + numpy, no external APIs needed.
    """
    if os.path.exists(output_path) and os.path.getsize(output_path) > 5000:
        print(f"    \u2713 music cached")
        return True

    try:
        import wave, struct

        t = np.linspace(0, duration, int(sample_rate * duration), endpoint=False)

        # Deep cinematic drone (very low frequencies)
        drone1 = 0.15 * np.sin(2 * np.pi * 55 * t)       # A1 - deep bass
        drone2 = 0.10 * np.sin(2 * np.pi * 82.5 * t)     # E2 - fifth
        drone3 = 0.06 * np.sin(2 * np.pi * 110 * t)      # A2 - octave

        # Slow pulsing pad
        pulse = 0.08 * np.sin(2 * np.pi * 165 * t) * (0.5 + 0.5 * np.sin(2 * np.pi * 0.15 * t))

        # Subtle high shimmer
        shimmer = 0.03 * np.sin(2 * np.pi * 440 * t) * (0.3 + 0.3 * np.sin(2 * np.pi * 0.08 * t))

        # Combine
        audio = drone1 + drone2 + drone3 + pulse + shimmer

        # Fade in/out
        fade_len = int(sample_rate * 2)
        fade_in = np.linspace(0, 1, fade_len)
        fade_out = np.linspace(1, 0, fade_len)
        audio[:fade_len] *= fade_in
        audio[-fade_len:] *= fade_out

        # Normalize
        audio = audio / np.max(np.abs(audio)) * 0.4

        # Convert to 16-bit WAV
        audio_16 = (audio * 32767).astype(np.int16)

        with wave.open(output_path, 'w') as wf:
            wf.setnchannels(1)
            wf.setsampwidth(2)
            wf.setframerate(sample_rate)
            wf.writeframes(audio_16.tobytes())

        print(f"    \u2713 ambient music generated ({duration}s)")
        return True
    except Exception as e:
        print(f"    ! music failed: {e}")
        return False


# ══════════════════════════════════════════════
# VIDEO FRAME GENERATOR
# ══════════════════════════════════════════════

def create_reel_frame(width=W, height=H):
    """Create a black 9:16 background frame."""
    return Image.new("RGB", (width, height), BLACK)


def text_frame(lines, subtitle=None, number=None):
    """
    Create a text-focused 9:16 frame.
    Large bold text centered on black background.
    """
    img = create_reel_frame()
    draw = ImageDraw.Draw(img)

    # Subtle gradient
    for y in range(H):
        v = int(5 + 8 * (1 - abs(y - H // 2) / (H // 2)) ** 2)
        draw.line([(0, y), (W, y)], fill=(v, v, v))

    y_pos = H // 2 - len(lines) * 50

    # Number if provided
    if number:
        nf = HEADLINE(200)
        bb = draw.textbbox((0, 0), number, font=nf)
        nx = (W - (bb[2] - bb[0])) // 2
        draw.text((nx, y_pos - 220), number, font=nf, fill=(30, 30, 30))
        # White outline number
        for dx in range(-3, 4):
            for dy in range(-3, 4):
                if dx * dx + dy * dy <= 9:
                    draw.text((nx + dx, y_pos - 220 + dy), number, font=nf, fill=BLACK)
        draw.text((nx, y_pos - 220), number, font=nf, fill=WHITE)

    # Main text lines
    hf = HEADLINE(72)
    for i, line in enumerate(lines):
        bb = draw.textbbox((0, 0), line, font=hf)
        x = (W - (bb[2] - bb[0])) // 2
        draw.text((x, y_pos + i * 90), line, font=hf, fill=WHITE)

    # Subtitle
    if subtitle:
        sf = BODY(36)
        # Word wrap subtitle
        words = subtitle.split()
        sub_lines = []
        current = ""
        for word in words:
            test = f"{current} {word}".strip()
            if draw.textbbox((0, 0), test, font=sf)[2] <= W - 140:
                current = test
            else:
                if current: sub_lines.append(current)
                current = word
        if current: sub_lines.append(current)

        sy = y_pos + len(lines) * 90 + 60
        for sl in sub_lines:
            bb = draw.textbbox((0, 0), sl, font=sf)
            x = (W - (bb[2] - bb[0])) // 2
            draw.text((x, sy), sl, font=sf, fill=LIGHT_GRAY)
            sy += 50

    # Brand footer
    bf = BODY_BOLD(28)
    bb = draw.textbbox((0, 0), "@dsmarketing.agency", font=bf)
    bx = (W - (bb[2] - bb[0])) // 2
    draw.text((bx, H - 180), "@dsmarketing.agency", font=bf, fill=MED_GRAY)

    # Thin line above footer
    draw.line([(200, H - 220), (W - 200, H - 220)], fill=(40, 40, 40), width=1)

    return img


def char_text_frame(char_path, lines, subtitle=None):
    """
    Create a 9:16 frame with character image + text overlay.
    Character fills top portion, text at bottom.
    """
    img = create_reel_frame()

    # Load character and fit to top portion
    if os.path.exists(char_path):
        char_img = Image.open(char_path).convert("RGB")
        # Scale character to fill width, position at top
        char_w = W
        char_h = int(char_img.height * (W / char_img.width))
        char_img = char_img.resize((char_w, char_h), Image.LANCZOS)

        # Brighten and desaturate
        char_img = ImageEnhance.Brightness(char_img).enhance(1.3)
        char_img = ImageEnhance.Contrast(char_img).enhance(1.2)
        gray = char_img.convert("L").convert("RGB")
        char_img = Image.blend(char_img, gray, 0.85)

        # Paste at top center
        y_offset = max(0, (H // 2 - char_h) // 2)
        img.paste(char_img, (0, y_offset))

    # Gradient overlay for text area (bottom half)
    overlay = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    od = ImageDraw.Draw(overlay)
    for y in range(H // 3, H):
        alpha = int(240 * ((y - H // 3) / (H - H // 3)) ** 1.2)
        od.line([(0, y), (W, y)], fill=(0, 0, 0, min(255, alpha)))
    img = Image.alpha_composite(img.convert("RGBA"), overlay).convert("RGB")

    draw = ImageDraw.Draw(img)

    # Text in bottom half
    hf = HEADLINE(68)
    y_pos = H * 3 // 5

    for i, line in enumerate(lines):
        bb = draw.textbbox((0, 0), line, font=hf)
        x = (W - (bb[2] - bb[0])) // 2
        # Shadow
        draw.text((x + 2, y_pos + i * 85 + 2), line, font=hf, fill=BLACK)
        draw.text((x, y_pos + i * 85), line, font=hf, fill=WHITE)

    if subtitle:
        sf = BODY(34)
        words = subtitle.split()
        sub_lines = []
        current = ""
        for word in words:
            test = f"{current} {word}".strip()
            if draw.textbbox((0, 0), test, font=sf)[2] <= W - 140:
                current = test
            else:
                if current: sub_lines.append(current)
                current = word
        if current: sub_lines.append(current)

        sy = y_pos + len(lines) * 85 + 40
        for sl in sub_lines:
            bb = draw.textbbox((0, 0), sl, font=sf)
            x = (W - (bb[2] - bb[0])) // 2
            draw.text((x, sy), sl, font=sf, fill=LIGHT_GRAY)
            sy += 48

    # Brand
    bf = BODY_BOLD(26)
    bb = draw.textbbox((0, 0), "@dsmarketing.agency", font=bf)
    bx = (W - (bb[2] - bb[0])) // 2
    draw.text((bx, H - 160), "@dsmarketing.agency", font=bf, fill=MED_GRAY)

    return img


def zoom_effect(clip, zoom_start=1.0, zoom_end=1.15):
    """Apply slow zoom (Ken Burns) effect to a clip."""
    duration = clip.duration
    w, h = clip.size

    def apply_zoom(get_frame, t):
        progress = t / duration if duration > 0 else 0
        zoom = zoom_start + (zoom_end - zoom_start) * progress
        frame = get_frame(t)

        # Calculate crop
        new_w = int(w / zoom)
        new_h = int(h / zoom)
        x1 = (w - new_w) // 2
        y1 = (h - new_h) // 2

        cropped = frame[y1:y1 + new_h, x1:x1 + new_w]

        # Resize back
        from PIL import Image as PILImage
        pil_img = PILImage.fromarray(cropped)
        pil_img = pil_img.resize((w, h), PILImage.LANCZOS)
        return np.array(pil_img)

    return clip.transform(apply_zoom)


def build_reel(scenes, voice_path, music_path, output_path, total_duration=None):
    """
    Build final reel video from scenes.
    Each scene = {"image": PIL Image, "duration": seconds}
    """
    clips = []

    for i, scene in enumerate(scenes):
        # Save frame as temp image
        temp_path = f"{OUT}/_temp_frame_{i}.png"
        scene["image"].save(temp_path, quality=95)

        clip = ImageClip(temp_path).with_duration(scene["duration"])

        # Alternate zoom directions for dynamism
        if i % 2 == 0:
            clip = zoom_effect(clip, 1.0, 1.08)
        else:
            clip = zoom_effect(clip, 1.08, 1.0)

        clips.append(clip)

    # Concatenate all scenes
    video = concatenate_videoclips(clips, method="compose")

    # Add audio
    audio_tracks = []

    # Voiceover
    if voice_path and os.path.exists(voice_path):
        try:
            voice_audio = AudioFileClip(voice_path)
            # Trim voice if longer than video
            if voice_audio.duration > video.duration:
                voice_audio = voice_audio.subclipped(0, video.duration)
            audio_tracks.append(voice_audio)
        except Exception as e:
            print(f"    ! voice audio error: {e}")

    # Background music (lower volume)
    if music_path and os.path.exists(music_path):
        try:
            music = AudioFileClip(music_path)
            # Trim or loop music to match video duration
            try:
                if music.duration >= video.duration:
                    music = music.subclipped(0, video.duration)
                else:
                    # Simple approach: just use what we have
                    pass
            except AttributeError:
                # moviepy 1.x
                if music.duration >= video.duration:
                    music = music.subclip(0, video.duration)

            # Lower music volume (30% when voice is present, 60% without)
            vol = 0.3 if audio_tracks else 0.6
            try:
                from moviepy.audio.fx import MultiplyVolume
                music = music.with_effects([MultiplyVolume(factor=vol)])
            except (ImportError, AttributeError):
                try:
                    music = music.volumex(vol)
                except:
                    pass  # Skip volume adjustment if nothing works
            audio_tracks.append(music)
        except Exception as e:
            print(f"    ! music audio error: {e}")

    # Combine audio tracks
    if audio_tracks:
        if len(audio_tracks) > 1:
            final_audio = CompositeAudioClip(audio_tracks)
        else:
            final_audio = audio_tracks[0]
        video = video.with_audio(final_audio)

    # Export
    video.write_videofile(
        output_path,
        fps=FPS,
        codec="libx264",
        audio_codec="aac",
        logger=None,
    )

    # Clean temp frames
    for i in range(len(scenes)):
        temp_path = f"{OUT}/_temp_frame_{i}.png"
        if os.path.exists(temp_path):
            os.remove(temp_path)

    print(f"  \u2713 {os.path.basename(output_path)}")


# ══════════════════════════════════════════════
# REEL DEFINITIONS
# ══════════════════════════════════════════════

REELS = [
    {
        "name": "reel_01_mistakes",
        "title": "7 Social Media Mistakes",
        "voice_text": (
            "Your social media isn't failing. Your strategy is. "
            "Here are 7 mistakes killing your growth. "
            "Number one. Posting without a content plan. Random posts give random results. "
            "Number two. Ignoring your analytics. The data tells you exactly what works. "
            "Number three. Buying followers for vanity. Fake followers will never buy your product. "
            "Number four. No consistent brand voice. If they can't recognize you in two seconds, you don't have a brand. "
            "Number five. Same content everywhere. Each platform speaks its own language. "
            "Number six. Zero audience engagement. If you don't engage, the algorithm stops showing your content. "
            "Number seven. No post-publish strategy. Publishing is only twenty percent of the work. "
            "Follow DS Marketing for more."
        ),
        "scenes": [
            {"lines": ["YOUR SOCIAL MEDIA", "ISN'T FAILING."], "subtitle": "Your strategy is.", "char": "frustrated", "dur": 4},
            {"lines": ["01", "NO CONTENT PLAN"], "subtitle": "Random posts = random results.", "dur": 3.5},
            {"lines": ["02", "IGNORING ANALYTICS"], "subtitle": "The data tells you what works.", "dur": 3},
            {"lines": ["03", "BUYING FOLLOWERS"], "subtitle": "Fake followers won't buy.", "dur": 3},
            {"lines": ["04", "NO BRAND VOICE"], "subtitle": "Unrecognizable = invisible.", "dur": 3},
            {"lines": ["05", "SAME EVERYWHERE"], "subtitle": "Each platform is different.", "dur": 3},
            {"lines": ["06", "ZERO ENGAGEMENT"], "subtitle": "Algorithm punishes silence.", "dur": 3},
            {"lines": ["07", "NO DISTRIBUTION"], "subtitle": "Publishing is only 20%.", "dur": 3},
            {"lines": ["FOLLOW FOR MORE"], "subtitle": "@dsmarketing.agency", "char": "ceo", "dur": 4},
        ],
    },
    {
        "name": "reel_02_calendar",
        "title": "Content Calendar Framework",
        "voice_text": (
            "Stop posting randomly. Start posting strategically. "
            "Here's your perfect weekly content framework. "
            "Monday. Educational content. Tips, how-tos, and frameworks. "
            "Tuesday. Share industry insights and trends. "
            "Wednesday. Post a case study with real numbers. "
            "Thursday. Behind the scenes. Show your process. "
            "Friday. Engagement day. Ask questions and start conversations. "
            "Weekend. Share your brand story and mission. "
            "And the secret? Batch everything on Monday. "
            "Save this framework. DS Marketing."
        ),
        "scenes": [
            {"lines": ["STOP POSTING", "RANDOMLY."], "subtitle": "Start posting strategically.", "char": "presenter", "dur": 4},
            {"lines": ["MONDAY"], "subtitle": "Educational: Tips & Frameworks", "dur": 3},
            {"lines": ["TUESDAY"], "subtitle": "Industry Insights & Trends", "dur": 2.5},
            {"lines": ["WEDNESDAY"], "subtitle": "Case Studies: Real Results", "dur": 2.5},
            {"lines": ["THURSDAY"], "subtitle": "Behind the Scenes", "dur": 2.5},
            {"lines": ["FRIDAY"], "subtitle": "Engagement: Questions & Polls", "dur": 2.5},
            {"lines": ["WEEKEND"], "subtitle": "Brand Story & Mission", "dur": 2.5},
            {"lines": ["THE SECRET:", "BATCH MONDAY"], "subtitle": "Create the whole week in one sitting.", "char": "visionary", "dur": 4},
            {"lines": ["SAVE THIS"], "subtitle": "@dsmarketing.agency", "char": "ceo", "dur": 3},
        ],
    },
    {
        "name": "reel_03_three_seconds",
        "title": "The 3-Second Rule",
        "voice_text": (
            "You have three seconds. "
            "Three seconds to stop the scroll. Three seconds to grab attention. "
            "Your audience decides in three seconds whether to keep going or swipe away. "
            "That means your hook is everything. "
            "Not your logo. Not your color palette. Not your font choice. "
            "Your first line. That's where the battle is won or lost. "
            "Make every hook count. DS Marketing."
        ),
        "scenes": [
            {"lines": ["YOU HAVE", "3 SECONDS."], "subtitle": None, "char": "clock", "dur": 3.5},
            {"lines": ["3 SECONDS", "TO STOP", "THE SCROLL."], "subtitle": None, "dur": 3.5},
            {"lines": ["YOUR HOOK IS", "EVERYTHING."], "subtitle": None, "dur": 3.5},
            {"lines": ["NOT YOUR LOGO.", "NOT YOUR FONTS."], "subtitle": "Not your color palette.", "dur": 3.5},
            {"lines": ["YOUR", "FIRST LINE."], "subtitle": "That's where the battle is won.", "dur": 4},
            {"lines": ["MAKE EVERY", "HOOK COUNT."], "subtitle": "@dsmarketing.agency", "char": "rocket", "dur": 4},
        ],
    },
]


# ══════════════════════════════════════════════
# MAIN
# ══════════════════════════════════════════════

def main():
    print()
    print("  \u2554" + "\u2550" * 50 + "\u2557")
    print("  \u2551  DS MARKETING REELS ENGINE v1.0               \u2551")
    print("  \u2551  AI Voiceover + Animated Video + Music         \u2551")
    print("  \u2551  Pure Black & White. Ready for Instagram.      \u2551")
    print("  \u255a" + "\u2550" * 50 + "\u255d")
    print()

    os.makedirs(OUT, exist_ok=True)
    os.makedirs(f"{OUT}/audio", exist_ok=True)

    # Check for character images from the Image Engine
    char_dir = "ds-marketing-engine/characters"
    if not os.path.exists(char_dir):
        char_dir = "ds-marketing-bw/characters"
    if not os.path.exists(char_dir):
        char_dir = "ds-marketing-final/characters"

    has_chars = os.path.exists(char_dir)
    if has_chars:
        print(f"  Found characters in: {char_dir}/")
    else:
        print("  No character folder found — using text-only frames.")
        print("  (Run ds_engine.py first for character images)")
    print()

    # ─── Generate background music ───
    print("  STEP 1: Generating Background Music")
    print("  " + "\u2500" * 50)
    music_path = f"{OUT}/audio/ambient_bg.wav"
    generate_ambient_music(music_path, duration=35)

    # ─── Generate reels ───
    for reel_idx, reel in enumerate(REELS):
        print(f"\n  STEP {reel_idx + 2}: {reel['title']}")
        print("  " + "\u2500" * 50)

        # Generate voiceover
        voice_path = f"{OUT}/audio/{reel['name']}_voice.mp3"
        print(f"    Generating AI voiceover...")
        generate_voiceover(reel["voice_text"], voice_path, rate="-5%")

        # Build scene frames
        print(f"    Building video frames...")
        scenes = []
        for scene in reel["scenes"]:
            char_path = None
            if scene.get("char") and has_chars:
                cp = f"{char_dir}/{scene['char']}.png"
                if os.path.exists(cp):
                    char_path = cp

            if char_path:
                frame = char_text_frame(char_path, scene["lines"], scene.get("subtitle"))
            else:
                # Determine if first line looks like a number
                num = None
                text_lines = scene["lines"]
                if len(text_lines) >= 2 and text_lines[0] in ["01","02","03","04","05","06","07","08","09","10"]:
                    num = text_lines[0]
                    text_lines = text_lines[1:]

                frame = text_frame(text_lines, scene.get("subtitle"), num)

            scenes.append({"image": frame, "duration": scene["dur"]})

        # Build final video
        print(f"    Rendering video...")
        output_path = f"{OUT}/{reel['name']}.mp4"
        try:
            build_reel(scenes, voice_path, music_path, output_path)
        except Exception as e:
            print(f"    ! Video render error: {e}")
            print(f"    Trying without music...")
            try:
                build_reel(scenes, voice_path, None, output_path)
            except Exception as e2:
                print(f"    ! Render failed: {e2}")
                # Last resort: video without any audio
                try:
                    build_reel(scenes, None, None, output_path)
                    print(f"    (exported without audio)")
                except Exception as e3:
                    print(f"    ! Complete failure: {e3}")

    # ─── Done ───
    print()
    print("  \u2554" + "\u2550" * 50 + "\u2557")
    print("  \u2551  ALL DONE \u2014 REELS ENGINE COMPLETE              \u2551")
    print("  \u255a" + "\u2550" * 50 + "\u255d")
    print(f"""
  Your reels: {OUT}/

     reel_01_mistakes.mp4    — 7 Social Media Mistakes
     reel_02_calendar.mp4    — Content Calendar Framework
     reel_03_three_seconds.mp4 — The 3-Second Rule

  Each reel includes:
     AI voiceover (Microsoft neural voice)
     Background ambient music
     Animated zoom transitions
     9:16 vertical format (Instagram Reels)

  HOW TO POST:
  1. Open the {OUT}/ folder
  2. Upload reels to Instagram
  3. Add trending audio on top if you want (optional)

  Pure Black & White. Professional voiceover. Ready to post.
""")


if __name__ == "__main__":
    main()
