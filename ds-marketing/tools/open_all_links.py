"""
DS Marketing - Open All Image Links in Browser
================================================
Run this on YOUR computer. Opens all Pollinations.ai links
in your browser so you can save each image.

Usage: python3 open_all_links.py
"""

import webbrowser
import time
import urllib.parse

BASE = "https://image.pollinations.ai/prompt/"
VIDEO_BASE = "https://gen.pollinations.ai/image/"
PARAMS = "?width=1080&height=1080&model=flux&nologo=true"
VIDEO_PARAMS = "?model=seedance&nologo=true"


# All prompts organized by day
SLIDES = {
    # ── MONDAY ──
    "MON Slide 1 - Hook": (
        "Premium dark cinematic social media poster 1080x1080 square format. "
        "Pure black background with dramatic smoke and fog texture. "
        "Bold white condensed sans-serif uppercase text centered that reads "
        "YOUR SOCIAL MEDIA ISN'T FAILING YOUR STRATEGY IS "
        "with dramatic spotlight effect on the text. Subtle lens flare accent. "
        "Small elegant white DS MARKETING logo text in bottom right corner. "
        "Moody luxurious editorial magazine aesthetic. Ultra high quality 4K detail."
    ),
    "MON Slide 2 - 01": (
        "Premium dark editorial carousel slide 1080x1080 square. Deep black background "
        "with subtle blue atmospheric lighting from left. Large bold white 01 number "
        "top left with glow. Below clean white bold text Posting without a content plan. "
        "Smaller gray text Random posts equals random results. Bottom right 2/10 in small gray. "
        "Cinematic moody luxury brand aesthetic. Ultra high quality."
    ),
    "MON Slide 3 - 02": (
        "Premium dark editorial slide 1080x1080 square. Black background with dramatic "
        "diagonal light beam from top right. Large bold white 02 top left. "
        "White bold text Ignoring your analytics completely. "
        "Gray text The data tells you exactly what works. 3/10 bottom right. "
        "Luxury brand cinematic lighting. Ultra high quality."
    ),
    "MON Slide 4 - 03": (
        "Premium dark carousel slide 1080x1080 square. Pure black background with subtle "
        "smoke wisps and spotlight from above. Large white 03 top left. "
        "Bold white text Buying followers for vanity metrics. "
        "Gray text 10K fake followers will not buy your product Ever. 4/10 bottom right. "
        "Editorial luxury aesthetic cinematic mood lighting. Ultra high quality."
    ),
    "MON Slide 5 - 04": (
        "Premium dark editorial slide 1080x1080 square. Black background with subtle "
        "blue-purple atmospheric gradient in corner. Large white 04 top left. "
        "Bold white text No consistent brand voice. "
        "Gray text If your audience cannot recognize your content you do not have a brand. "
        "5/10 bottom right. Moody sophisticated luxury feel. Ultra high quality."
    ),
    "MON Slide 6 - 05": (
        "Premium dark carousel slide 1080x1080 square. Deep black background with warm "
        "light leak from left edge. Large bold white 05 top left. "
        "White text Treating every platform the same. "
        "Gray text What works on Instagram does not work on LinkedIn. 6/10 bottom right. "
        "Cinematic editorial dark luxury design. Ultra high quality."
    ),
    "MON Slide 7 - 06": (
        "Premium dark editorial carousel slide 1080x1080 square. Black background with "
        "dramatic overhead spotlight creating cone of light. Large white 06 top left. "
        "Bold white text Zero engagement with your audience. "
        "Gray text Posting and disappearing tells the algorithm you do not care. "
        "7/10 bottom right. Dark moody luxury aesthetic. Ultra high quality."
    ),
    "MON Slide 8 - 07": (
        "Premium dark carousel slide 1080x1080 square. Pure black background with subtle "
        "diagonal light streaks. Large white 07 top left with glow. "
        "Bold white text No strategy after hitting post. "
        "Gray text Publishing is 20 percent of the work Distribution is the other 80. "
        "8/10 bottom right. Cinematic luxury editorial aesthetic. Ultra high quality."
    ),
    "MON Slide 9 - Recap": (
        "Premium dark editorial summary slide 1080x1080 square. Black background with "
        "atmospheric fog and centered soft spotlight from above. Bold white header text "
        "QUICK RECAP at top with thin line underneath. Below a clean list in white text: "
        "No content plan. Ignoring analytics. Buying fake followers. "
        "Inconsistent brand voice. Same content everywhere. Not engaging. "
        "No post-publish strategy. 9/10 bottom right. Luxury magazine layout. Ultra high quality."
    ),
    "MON Slide 10 - CTA": (
        "Premium dark cinematic CTA slide 1080x1080 square. Pure black background with "
        "dramatic centered spotlight creating elegant glow. Large elegant white DS text "
        "with MARKETING below in clean sans-serif centered. Below thin horizontal white line "
        "bold white text FOLLOW FOR MORE and underneath in gray @dsmarketing.agency. "
        "Luxurious editorial premium brand aesthetic. Dramatic lighting. Ultra high quality."
    ),

    # ── WEDNESDAY ──
    "WED Slide 1 - Hook": (
        "Premium dark cinematic social media poster 1080x1080 square. Pure black background "
        "with dramatic atmospheric fog and blue-tinted spotlight from above. "
        "Bold white sans-serif uppercase text centered STOP POSTING RANDOMLY "
        "START POSTING STRATEGICALLY with dramatic lighting glow. "
        "Small DS MARKETING logo bottom right. Moody luxurious editorial aesthetic. Ultra high quality."
    ),
    "WED Slide 2 - Monday": (
        "Premium dark editorial carousel slide 1080x1080. Deep black background warm atmospheric "
        "lighting from left. Large bold white 01 top left with glow. Bold white text "
        "Monday Educational content. Gray text Tips how-tos frameworks Start the week proving "
        "your expertise. 2/10 bottom right. Cinematic luxury. Ultra high quality."
    ),
    "WED Slide 3 - Tuesday": (
        "Premium dark editorial slide 1080x1080. Black background cool blue diagonal light beam. "
        "Large white 02 top left. Bold white text Tuesday Industry insights. "
        "Gray text Share trends and data Be the one who sees what is coming. 3/10 bottom right. "
        "Dark moody luxury design. Ultra high quality."
    ),
    "WED Slide 4 - Wednesday": (
        "Premium dark carousel slide 1080x1080. Black background subtle smoke warm spotlight. "
        "Large white 03 top left. Bold white text Wednesday Case study or client win. "
        "Gray text Show proof Real numbers Real results Nothing builds trust faster. "
        "4/10 bottom right. Editorial luxury. Ultra high quality."
    ),
    "WED Slide 5 - Thursday": (
        "Premium dark editorial slide 1080x1080. Black background purple-tinted atmospheric lighting. "
        "Large white 04 top left. Bold white text Thursday Behind the scenes. "
        "Gray text Show your process your team People buy from people they trust. "
        "5/10 bottom right. Cinematic luxury brand. Ultra high quality."
    ),
    "WED Slide 6 - Friday": (
        "Premium dark carousel slide 1080x1080. Black background dramatic side lighting. "
        "Large white 05 top left. Bold white text Friday Engagement post. "
        "Gray text Ask questions Run polls Start debates Let your audience do the talking. "
        "6/10 bottom right. Dark moody editorial aesthetic. Ultra high quality."
    ),
    "WED Slide 7 - Weekend": (
        "Premium dark editorial slide 1080x1080. Black background warm golden light leak accent. "
        "Large white 06 top left. Bold white text Weekend Brand story content. "
        "Gray text Your mission Your values Build connection not just reach. "
        "7/10 bottom right. Luxury magazine quality. Ultra high quality."
    ),
    "WED Slide 8 - Secret": (
        "Premium dark carousel slide 1080x1080. Black background dramatic centered spotlight. "
        "Large white 07 top left with glow. Bold white text The secret Batch everything on Monday. "
        "Gray text Create the full week in one sitting Then focus on engaging. "
        "8/10 bottom right. Cinematic editorial luxury. Ultra high quality."
    ),
    "WED Slide 9 - Recap": (
        "Premium dark summary slide 1080x1080. Black background atmospheric fog overhead light. "
        "Bold white YOUR WEEKLY FRAMEWORK header thin line below. Clean white list: "
        "MON Educate. TUE Industry insights. WED Case studies. THU Behind the scenes. "
        "FRI Engage. SAT SUN Brand story. 9/10 bottom right. Luxury layout. Ultra high quality."
    ),
    "WED Slide 10 - CTA": (
        "Premium dark cinematic CTA slide 1080x1080. Pure black background dramatic spotlight smoke. "
        "Centered white DS MARKETING logo text thin line below then bold white "
        "SAVE THIS FRAMEWORK and gray @dsmarketing.agency below. "
        "Luxury editorial aesthetic dramatic lighting. Ultra high quality."
    ),

    # ── FRIDAY ──
    "FRI Slide 1 - Hook": (
        "Premium dark cinematic poster 1080x1080 square. Pure black background with dramatic "
        "single spotlight from above creating powerful beam of light. Huge bold white text "
        "centered YOU HAVE 3 SECONDS with the number 3 having a subtle golden glow effect. "
        "Small DS MARKETING logo bottom right. Extremely dramatic moody luxury editorial. "
        "Minimal and powerful. Ultra high quality 4K."
    ),
    "FRI Slide 2 - Content": (
        "Premium dark editorial slide 1080x1080. Deep black background subtle atmospheric "
        "blue lighting. Clean white bold text Your audience decides in 3 seconds whether to "
        "stop scrolling or keep going. Below smaller gray text That means your hook is everything "
        "Not your logo Not your color palette Your first line That is where the battle is won or lost. "
        "2/3 bottom right. Cinematic luxury aesthetic. Ultra high quality."
    ),
    "FRI Slide 3 - CTA": (
        "Premium dark cinematic CTA slide 1080x1080. Pure black background dramatic overhead "
        "spotlight lens flare. Centered white DS MARKETING logo thin divider line then bold "
        "white text MAKE EVERY HOOK IMPOSSIBLE TO IGNORE and gray @dsmarketing.agency below. "
        "Centered. Luxurious powerful editorial brand aesthetic. Ultra high quality."
    ),
}

REELS = {
    "Reel - Social Mistakes": (
        "Cinematic dark moody marketing agency brand video. Dramatic smoke and fog swirling "
        "in pure black background with spotlights slowly revealing bold white text that says "
        "YOUR SOCIAL MEDIA IS NOT FAILING YOUR STRATEGY IS. "
        "Atmospheric particles floating. Premium luxury editorial feel. "
        "Slow dramatic camera movement. 4K cinematic quality."
    ),
    "Reel - Content Calendar": (
        "Dark cinematic brand video with atmospheric smoke. Pure black background with "
        "dramatic blue-tinted lighting slowly illuminating bold white text "
        "STOP POSTING RANDOMLY START POSTING STRATEGICALLY. "
        "Floating light particles. Premium luxury aesthetic. "
        "Slow elegant camera push. 4K cinematic."
    ),
    "Reel - 3-Second Rule": (
        "Dramatic dark cinematic video. Pure black void with single powerful spotlight "
        "beam cutting through atmospheric fog revealing bold white text YOU HAVE 3 SECONDS. "
        "The number 3 glows with golden light. Dust particles floating. "
        "Intense premium editorial feel. Slow dramatic reveal. 4K quality."
    ),
}


def main():
    print("=" * 50)
    print("DS MARKETING - Opening All Links in Browser")
    print("=" * 50)
    print()

    # Open image links
    print(f"Opening {len(SLIDES)} image links...")
    for name, prompt in SLIDES.items():
        encoded = urllib.parse.quote(prompt)
        url = f"{BASE}{encoded}{PARAMS}"
        print(f"  -> {name}")
        webbrowser.open(url)
        time.sleep(1.5)  # Slight delay so browser can handle tabs

    print()
    print(f"Opening {len(REELS)} reel/video links...")
    for name, prompt in REELS.items():
        encoded = urllib.parse.quote(prompt)
        url = f"{VIDEO_BASE}{encoded}{VIDEO_PARAMS}"
        print(f"  -> {name}")
        webbrowser.open(url)
        time.sleep(1.5)

    print()
    print("=" * 50)
    print("DONE! All links opened in your browser.")
    print()
    print("NEXT STEPS:")
    print("  1. Wait for each tab to load (10-30 sec per image)")
    print("  2. Right-click each image -> Save image as...")
    print("  3. Name them: slide_01_hook.png, slide_02.png, etc.")
    print("  4. Upload to Instagram via Meta Business Suite")
    print("  5. Copy captions from week1/captions/ folder")
    print("=" * 50)


if __name__ == "__main__":
    main()
