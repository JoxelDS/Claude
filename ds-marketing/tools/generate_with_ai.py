"""
DS Marketing - AI Image & Video Generator
==========================================
Run this on YOUR computer (not in Claude Code).
Uses Pollinations.ai - 100% FREE, no API key, no signup.

INSTRUCTIONS:
1. Make sure you have Python 3 installed
2. Run: python3 generate_with_ai.py
3. Images save to ./ai-output/images/
4. Videos save to ./ai-output/reels/
5. Upload to Instagram!

Takes about 5-10 minutes to generate everything.
"""

import os
import time
import urllib.request
import urllib.parse

OUTPUT_DIR = "ai-output"
IMAGE_DIR = os.path.join(OUTPUT_DIR, "images")
VIDEO_DIR = os.path.join(OUTPUT_DIR, "reels")

# ─── IMAGE PROMPTS ────────────────────────────────────────────

MONDAY_SLIDES = {
    "monday/slide_01_hook.png": (
        "Premium dark cinematic social media poster 1080x1080 square format. "
        "Pure black background with dramatic smoke and fog texture. "
        "Bold white condensed sans-serif uppercase text centered that reads "
        "YOUR SOCIAL MEDIA ISN'T FAILING YOUR STRATEGY IS "
        "with dramatic spotlight effect on the text. Subtle lens flare accent. "
        "Small elegant white DS MARKETING logo text in bottom right corner. "
        "Moody luxurious editorial magazine aesthetic. Ultra high quality 4K detail."
    ),
    "monday/slide_02.png": (
        "Premium dark editorial carousel slide 1080x1080 square. Deep black background "
        "with subtle blue atmospheric lighting from left. Large bold white text 01 number "
        "top left with glow. Below clean white bold text Posting without a content plan. "
        "Smaller gray text Random posts equals random results. Bottom right 2/10 in small gray. "
        "Cinematic moody luxury brand aesthetic. Ultra high quality."
    ),
    "monday/slide_03.png": (
        "Premium dark editorial slide 1080x1080 square. Black background with dramatic "
        "diagonal light beam from top right. Large bold white 02 top left. "
        "White bold text Ignoring your analytics completely. "
        "Gray text The data tells you exactly what works. 3/10 bottom right. "
        "Luxury brand cinematic lighting. Ultra high quality."
    ),
    "monday/slide_04.png": (
        "Premium dark carousel slide 1080x1080 square. Pure black background with subtle "
        "smoke wisps and spotlight from above. Large white 03 top left. "
        "Bold white text Buying followers for vanity metrics. "
        "Gray text 10K fake followers will not buy your product Ever. 4/10 bottom right. "
        "Editorial luxury aesthetic cinematic mood lighting. Ultra high quality."
    ),
    "monday/slide_05.png": (
        "Premium dark editorial slide 1080x1080 square. Black background with subtle "
        "blue-purple atmospheric gradient in corner. Large white 04 top left. "
        "Bold white text No consistent brand voice. "
        "Gray text If your audience cannot recognize your content you do not have a brand. "
        "5/10 bottom right. Moody sophisticated luxury feel. Ultra high quality."
    ),
    "monday/slide_06.png": (
        "Premium dark carousel slide 1080x1080 square. Deep black background with warm "
        "light leak from left edge. Large bold white 05 top left. "
        "White text Treating every platform the same. "
        "Gray text What works on Instagram does not work on LinkedIn. 6/10 bottom right. "
        "Cinematic editorial dark luxury design. Ultra high quality."
    ),
    "monday/slide_07.png": (
        "Premium dark editorial carousel slide 1080x1080 square. Black background with "
        "dramatic overhead spotlight creating cone of light. Large white 06 top left. "
        "Bold white text Zero engagement with your audience. "
        "Gray text Posting and disappearing tells the algorithm you do not care. "
        "7/10 bottom right. Dark moody luxury aesthetic. Ultra high quality."
    ),
    "monday/slide_08.png": (
        "Premium dark carousel slide 1080x1080 square. Pure black background with subtle "
        "diagonal light streaks. Large white 07 top left with glow. "
        "Bold white text No strategy after hitting post. "
        "Gray text Publishing is 20 percent of the work Distribution is the other 80. "
        "8/10 bottom right. Cinematic luxury editorial aesthetic. Ultra high quality."
    ),
    "monday/slide_09_recap.png": (
        "Premium dark editorial summary slide 1080x1080 square. Black background with "
        "atmospheric fog and centered soft spotlight from above. Bold white header text "
        "QUICK RECAP at top with thin line underneath. Below a clean list in white text: "
        "No content plan. Ignoring analytics. Buying fake followers. "
        "Inconsistent brand voice. Same content everywhere. Not engaging. "
        "No post-publish strategy. 9/10 bottom right. Luxury magazine layout. Ultra high quality."
    ),
    "monday/slide_10_cta.png": (
        "Premium dark cinematic CTA slide 1080x1080 square. Pure black background with "
        "dramatic centered spotlight creating elegant glow. Large elegant white DS text "
        "with MARKETING below in clean sans-serif centered. Below thin horizontal white line "
        "bold white text FOLLOW FOR MORE and underneath in gray @dsmarketing.agency. "
        "Luxurious editorial premium brand aesthetic. Dramatic lighting. Ultra high quality."
    ),
}

WEDNESDAY_SLIDES = {
    "wednesday/slide_01_hook.png": (
        "Premium dark cinematic social media poster 1080x1080 square. Pure black background "
        "with dramatic atmospheric fog and blue-tinted spotlight from above. "
        "Bold white sans-serif uppercase text centered STOP POSTING RANDOMLY "
        "START POSTING STRATEGICALLY with dramatic lighting glow. "
        "Small DS MARKETING logo bottom right. Moody luxurious editorial aesthetic. Ultra high quality."
    ),
    "wednesday/slide_02.png": (
        "Premium dark editorial carousel slide 1080x1080. Deep black background warm atmospheric "
        "lighting from left. Large bold white 01 top left with glow. Bold white text "
        "Monday Educational content. Gray text Tips how-tos frameworks Start the week proving "
        "your expertise. 2/10 bottom right. Cinematic luxury. Ultra high quality."
    ),
    "wednesday/slide_03.png": (
        "Premium dark editorial slide 1080x1080. Black background cool blue diagonal light beam. "
        "Large white 02 top left. Bold white text Tuesday Industry insights. "
        "Gray text Share trends and data Be the one who sees what is coming. 3/10 bottom right. "
        "Dark moody luxury design. Ultra high quality."
    ),
    "wednesday/slide_04.png": (
        "Premium dark carousel slide 1080x1080. Black background subtle smoke warm spotlight. "
        "Large white 03 top left. Bold white text Wednesday Case study or client win. "
        "Gray text Show proof Real numbers Real results Nothing builds trust faster. "
        "4/10 bottom right. Editorial luxury. Ultra high quality."
    ),
    "wednesday/slide_05.png": (
        "Premium dark editorial slide 1080x1080. Black background purple-tinted atmospheric lighting. "
        "Large white 04 top left. Bold white text Thursday Behind the scenes. "
        "Gray text Show your process your team People buy from people they trust. "
        "5/10 bottom right. Cinematic luxury brand. Ultra high quality."
    ),
    "wednesday/slide_06.png": (
        "Premium dark carousel slide 1080x1080. Black background dramatic side lighting. "
        "Large white 05 top left. Bold white text Friday Engagement post. "
        "Gray text Ask questions Run polls Start debates Let your audience do the talking. "
        "6/10 bottom right. Dark moody editorial aesthetic. Ultra high quality."
    ),
    "wednesday/slide_07.png": (
        "Premium dark editorial slide 1080x1080. Black background warm golden light leak accent. "
        "Large white 06 top left. Bold white text Weekend Brand story content. "
        "Gray text Your mission Your values Build connection not just reach. "
        "7/10 bottom right. Luxury magazine quality. Ultra high quality."
    ),
    "wednesday/slide_08.png": (
        "Premium dark carousel slide 1080x1080. Black background dramatic centered spotlight. "
        "Large white 07 top left with glow. Bold white text The secret Batch everything on Monday. "
        "Gray text Create the full week in one sitting Then focus on engaging. "
        "8/10 bottom right. Cinematic editorial luxury. Ultra high quality."
    ),
    "wednesday/slide_09_recap.png": (
        "Premium dark summary slide 1080x1080. Black background atmospheric fog overhead light. "
        "Bold white YOUR WEEKLY FRAMEWORK header thin line below. Clean white list: "
        "MON Educate. TUE Industry insights. WED Case studies. THU Behind the scenes. "
        "FRI Engage. SAT SUN Brand story. 9/10 bottom right. Luxury layout. Ultra high quality."
    ),
    "wednesday/slide_10_cta.png": (
        "Premium dark cinematic CTA slide 1080x1080. Pure black background dramatic spotlight smoke. "
        "Centered white DS MARKETING logo text thin line below then bold white "
        "SAVE THIS FRAMEWORK and gray @dsmarketing.agency below. "
        "Luxury editorial aesthetic dramatic lighting. Ultra high quality."
    ),
}

FRIDAY_SLIDES = {
    "friday/slide_01_hook.png": (
        "Premium dark cinematic poster 1080x1080 square. Pure black background with dramatic "
        "single spotlight from above creating powerful beam of light. Huge bold white text "
        "centered YOU HAVE 3 SECONDS with the number 3 having a subtle golden glow effect. "
        "Small DS MARKETING logo bottom right. Extremely dramatic moody luxury editorial. "
        "Minimal and powerful. Ultra high quality 4K."
    ),
    "friday/slide_02.png": (
        "Premium dark editorial slide 1080x1080. Deep black background subtle atmospheric "
        "blue lighting. Clean white bold text Your audience decides in 3 seconds whether to "
        "stop scrolling or keep going. Below smaller gray text That means your hook is everything "
        "Not your logo Not your color palette Your first line That is where the battle is won or lost. "
        "2/3 bottom right. Cinematic luxury aesthetic. Ultra high quality."
    ),
    "friday/slide_03_cta.png": (
        "Premium dark cinematic CTA slide 1080x1080. Pure black background dramatic overhead "
        "spotlight lens flare. Centered white DS MARKETING logo thin divider line then bold "
        "white text MAKE EVERY HOOK IMPOSSIBLE TO IGNORE and gray @dsmarketing.agency below. "
        "Centered. Luxurious powerful editorial brand aesthetic. Ultra high quality."
    ),
}

# ─── VIDEO/REEL PROMPTS ───────────────────────────────────────

REEL_PROMPTS = {
    "reel_social_mistakes.mp4": (
        "Cinematic dark moody marketing agency brand video. Dramatic smoke and fog swirling "
        "in pure black background with spotlights slowly revealing bold white text that says "
        "YOUR SOCIAL MEDIA IS NOT FAILING YOUR STRATEGY IS. "
        "Atmospheric particles floating. Premium luxury editorial feel. "
        "Slow dramatic camera movement. 4K cinematic quality."
    ),
    "reel_content_calendar.mp4": (
        "Dark cinematic brand video with atmospheric smoke. Pure black background with "
        "dramatic blue-tinted lighting slowly illuminating bold white text "
        "STOP POSTING RANDOMLY START POSTING STRATEGICALLY. "
        "Floating light particles. Premium luxury aesthetic. "
        "Slow elegant camera push. 4K cinematic."
    ),
    "reel_3_second_rule.mp4": (
        "Dramatic dark cinematic video. Pure black void with single powerful spotlight "
        "beam cutting through atmospheric fog revealing bold white text YOU HAVE 3 SECONDS. "
        "The number 3 glows with golden light. Dust particles floating. "
        "Intense premium editorial feel. Slow dramatic reveal. 4K quality."
    ),
}


def generate_image(prompt, filepath, width=1080, height=1080, model="flux"):
    """Generate image via Pollinations.ai (free, no API key)."""
    encoded = urllib.parse.quote(prompt)
    url = (
        f"https://image.pollinations.ai/prompt/{encoded}"
        f"?width={width}&height={height}&model={model}&nologo=true"
    )

    os.makedirs(os.path.dirname(filepath), exist_ok=True)

    print(f"  Generating: {os.path.basename(filepath)}...", end=" ", flush=True)
    for attempt in range(3):
        try:
            urllib.request.urlretrieve(url, filepath)
            size_kb = os.path.getsize(filepath) // 1024
            print(f"OK ({size_kb} KB)")
            return True
        except Exception as e:
            if attempt < 2:
                print(f"retry {attempt + 1}...", end=" ", flush=True)
                time.sleep(5)
            else:
                print(f"FAILED: {e}")
                return False
    return False


def generate_video(prompt, filepath, model="seedance"):
    """Generate video via Pollinations.ai (free, no API key)."""
    encoded = urllib.parse.quote(prompt)
    url = f"https://gen.pollinations.ai/image/{encoded}?model={model}&nologo=true"

    os.makedirs(os.path.dirname(filepath), exist_ok=True)

    print(f"  Generating: {os.path.basename(filepath)}...", end=" ", flush=True)
    print("(videos take 1-3 minutes)...", end=" ", flush=True)
    for attempt in range(3):
        try:
            urllib.request.urlretrieve(url, filepath)
            size_kb = os.path.getsize(filepath) // 1024
            print(f"OK ({size_kb} KB)")
            return True
        except Exception as e:
            if attempt < 2:
                print(f"retry {attempt + 1}...", end=" ", flush=True)
                time.sleep(10)
            else:
                print(f"FAILED: {e}")
                return False
    return False


def main():
    print("=" * 60)
    print("DS MARKETING - AI Content Generator")
    print("Using Pollinations.ai (FREE, no API key)")
    print("=" * 60)

    # ── IMAGES ──
    all_slides = {}
    all_slides.update(MONDAY_SLIDES)
    all_slides.update(WEDNESDAY_SLIDES)
    all_slides.update(FRIDAY_SLIDES)

    total = len(all_slides)
    print(f"\n--- Generating {total} carousel images ---\n")

    success = 0
    for i, (filename, prompt) in enumerate(all_slides.items(), 1):
        filepath = os.path.join(IMAGE_DIR, filename)
        print(f"[{i}/{total}]", end=" ")
        if generate_image(prompt, filepath):
            success += 1
        time.sleep(2)  # Be nice to the free API

    print(f"\nImages: {success}/{total} generated successfully")
    print(f"Saved to: {IMAGE_DIR}/")

    # ── VIDEOS/REELS ──
    print(f"\n--- Generating {len(REEL_PROMPTS)} video reels ---\n")

    vid_success = 0
    for i, (filename, prompt) in enumerate(REEL_PROMPTS.items(), 1):
        filepath = os.path.join(VIDEO_DIR, filename)
        print(f"[{i}/{len(REEL_PROMPTS)}]", end=" ")
        if generate_video(prompt, filepath):
            vid_success += 1
        time.sleep(5)

    print(f"\nVideos: {vid_success}/{len(REEL_PROMPTS)} generated successfully")
    print(f"Saved to: {VIDEO_DIR}/")

    # ── SUMMARY ──
    print("\n" + "=" * 60)
    print("DONE!")
    print(f"  Images: {IMAGE_DIR}/monday/  (10 slides)")
    print(f"          {IMAGE_DIR}/wednesday/  (10 slides)")
    print(f"          {IMAGE_DIR}/friday/  (3 slides)")
    print(f"  Reels:  {VIDEO_DIR}/  (3 videos)")
    print()
    print("NEXT STEPS:")
    print("  1. Check the images in the output folders")
    print("  2. Upload monday/ slides to Instagram (Mon 11 AM)")
    print("  3. Upload wednesday/ slides to Instagram (Wed 11 AM)")
    print("  4. Upload friday/ slides to Instagram (Fri 11 AM)")
    print("  5. Upload reels to Instagram Reels")
    print("  6. Copy captions from the captions/ folder")
    print("=" * 60)


if __name__ == "__main__":
    main()
