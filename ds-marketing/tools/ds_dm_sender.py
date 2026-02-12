#!/usr/bin/env python3
"""
DS MARKETING — INSTAGRAM DM SENDER
═══════════════════════════════════════════
Finds Miami businesses on Instagram and sends personalized DMs
offering $300 landing page service.

IMPORTANT:
  - Sends DMs with delays (60-120s) to avoid Instagram limits
  - Max 20-30 DMs per session to stay safe
  - Run 2-3 sessions per day with breaks between them
  - ALWAYS personalize — never spam

SETUP:
  pip install instagrapi
  python3 ds_dm_sender.py
"""

import os, sys, subprocess, json, time, random

def ensure(pkg, pip_name=None):
    try: __import__(pkg)
    except ImportError:
        print(f"  Installing {pip_name or pkg}...")
        subprocess.check_call([sys.executable, "-m", "pip", "install", pip_name or pkg],
                              stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)

ensure("instagrapi")
from instagrapi import Client

# ══════════════════════════════════════════════
# CONFIG
# ══════════════════════════════════════════════
CREDS_FILE = os.path.expanduser("~/.ds_ig_creds.json")
SENT_LOG = os.path.expanduser("~/Documents/ds_dm_sent.json")

# Miami business hashtags to search
MIAMI_HASHTAGS = [
    "miamibarber", "miamihairsalon", "miaminails", "miamitrainer",
    "miamifitness", "miamiphotographer", "miamirealestate", "miamirestaurant",
    "miamicatering", "miamifoodtruck", "miamiwedding", "miamievents",
    "miamitattoo", "miamiboutique", "miamifashion", "miamibeauty",
    "miamimua", "miamilashes", "miamicakes", "miamidetailing",
    "miamicleaning", "miamihandyman", "miamidj", "miamilandscaping",
    "miamidaycare", "miamidentist", "miamiplumber", "miamiroofing",
    "miamismallbusiness", "miamientrepreneur",
    "southbeachbarber", "baborasalonmiami", "wynwoodbusiness",
    "baboramiami", "coralgablesrestaurant", "dadeCountybusiness",
    "hialeahbusiness", "kendallbusiness", "doralrestaurant",
]

# DM Templates — {name} and {business} get replaced
DM_TEMPLATES = [
    """Hey! I came across your page and love what you're doing 🔥

Quick question — do you have a website or landing page? I build high-converting sites for Miami businesses.

Check out my work: dsmarketing.lovable.app

$300 flat, delivered in 24 hours. Design, copywriting, mobile-friendly — everything included.

Want me to show you what yours could look like?

— Joxel, DS Marketing
@dsmarketing.agency""",

    """Hey! Your page looks great 🙌

I help Miami businesses get more customers with professional websites and landing pages. My clients see results within the first week.

See examples of my work here: dsmarketing.lovable.app

$300 flat — no monthly fees. Delivered in 24 hours.

Want a free mockup? No strings attached.

— Joxel, DS Marketing""",

    """Hey! Love your content 🔥

I'm a web designer in Miami and I'm taking on 2 more projects this week at my launch price of $300.

Custom design, professional copy, mobile-friendly, live in 24 hours. Check my portfolio: dsmarketing.lovable.app

Interested? I can build a preview for you today!

— Joxel
@dsmarketing.agency""",

    """Hey! Had to reach out 🙌

A lot of businesses like yours are losing customers because people can't find you online. When someone wants to learn more — where do they go?

I fix that. $300, 24 hours, built for YOUR brand.

See what I do: dsmarketing.lovable.app

Want me to show you what yours could look like?

— Joxel, DS Marketing""",

    """Hey! Your business looks awesome 🔥

I noticed you might not have a website yet — I build professional sites for Miami businesses that actually convert visitors into customers.

Portfolio + booking: dsmarketing.lovable.app

$300 flat, no hidden fees. Live in 24 hours. Want a free mockup?

— Joxel
@dsmarketing.agency""",
]


def load_creds():
    if os.path.exists(CREDS_FILE):
        with open(CREDS_FILE) as f:
            return json.load(f)
    return {}

def save_creds(creds):
    with open(CREDS_FILE, "w") as f:
        json.dump(creds, f)

def load_sent():
    if os.path.exists(SENT_LOG):
        with open(SENT_LOG) as f:
            return json.load(f)
    return {"sent": [], "replies": []}

def save_sent(data):
    os.makedirs(os.path.dirname(SENT_LOG), exist_ok=True)
    with open(SENT_LOG, "w") as f:
        json.dump(data, f, indent=2)


def login():
    """Login to Instagram."""
    cl = Client()
    creds = load_creds()

    # Try session reuse first
    session_file = os.path.expanduser("~/.ds_ig_session.json")
    if os.path.exists(session_file):
        try:
            cl.load_settings(session_file)
            cl.login(creds.get("username", ""), creds.get("password", ""))
            print(f"    ✓ Logged in as @{cl.username} (session reuse)")
            return cl
        except:
            pass

    if not creds.get("username"):
        print()
        print("  Instagram Login")
        print("  " + "─" * 40)
        username = input("  Username: ").strip()
        password = input("  Password: ").strip()
        creds = {"username": username, "password": password}
        save_creds(creds)

    try:
        cl.login(creds["username"], creds["password"])
        cl.dump_settings(session_file)
        print(f"    ✓ Logged in as @{cl.username}")
        return cl
    except Exception as e:
        print(f"    ✗ Login failed: {e}")
        print("    If 2FA is required, you may need to handle the challenge.")
        return None


def find_businesses(cl, hashtags, max_per_tag=5, max_total=50):
    """Find business accounts from Miami hashtags."""
    sent_data = load_sent()
    already_sent = set(sent_data.get("sent", []))
    targets = []

    print(f"\n  Searching for Miami businesses...")
    print(f"  " + "─" * 50)

    for tag in hashtags:
        if len(targets) >= max_total:
            break
        try:
            print(f"    #{tag}...", end=" ", flush=True)
            medias = cl.hashtag_medias_recent(tag, amount=max_per_tag)
            found = 0
            for media in medias:
                user_id = media.user.pk
                username = media.user.username
                if username in already_sent or username in [t["username"] for t in targets]:
                    continue
                if username == cl.username:
                    continue

                # Get full user info
                try:
                    user_info = cl.user_info(user_id)
                    # Look for business accounts or accounts without websites
                    is_business = user_info.is_business or user_info.account_type == 2
                    has_website = bool(user_info.external_url)
                    followers = user_info.follower_count

                    # Target: 100-50K followers, preferably no website
                    if 100 <= followers <= 50000:
                        targets.append({
                            "user_id": user_id,
                            "username": username,
                            "full_name": user_info.full_name or username,
                            "bio": user_info.biography or "",
                            "followers": followers,
                            "has_website": has_website,
                            "is_business": is_business,
                            "hashtag": tag,
                        })
                        found += 1
                except:
                    continue

                if found >= max_per_tag:
                    break

                time.sleep(random.uniform(1, 3))  # Rate limit

            print(f"{found} found")
        except Exception as e:
            print(f"skip ({e})")
            time.sleep(5)

    # Sort: no website first, then by followers
    targets.sort(key=lambda t: (t["has_website"], -t["followers"]))
    print(f"\n    ✓ Found {len(targets)} target businesses")
    return targets


def send_dms(cl, targets, max_send=20):
    """Send personalized DMs to targets."""
    sent_data = load_sent()
    sent_count = 0

    print(f"\n  Sending DMs (max {max_send} per session)")
    print(f"  " + "─" * 50)
    print(f"  ⚠ Delays of 60-120s between DMs to stay safe")
    print()

    for target in targets[:max_send]:
        username = target["username"]
        name = target["full_name"].split()[0] if target["full_name"] else username

        # Pick a random template
        template = random.choice(DM_TEMPLATES)
        message = template.replace("{name}", name).replace("{business}", target["full_name"])

        print(f"    → @{username} ({target['followers']} followers, {'has site' if target['has_website'] else 'NO site'})...")

        try:
            cl.direct_send(message, user_ids=[target["user_id"]])
            sent_count += 1
            sent_data["sent"].append(username)
            save_sent(sent_data)
            print(f"      ✓ DM sent ({sent_count}/{max_send})")
        except Exception as e:
            print(f"      ✗ Failed: {e}")
            if "feedback_required" in str(e).lower() or "challenge" in str(e).lower():
                print(f"\n  ⚠ Instagram is rate limiting. Stop and wait 2-4 hours.")
                break

        # Random delay to avoid detection
        delay = random.uniform(60, 120)
        if sent_count < max_send and target != targets[min(max_send, len(targets))-1]:
            print(f"      ⏳ Waiting {int(delay)}s...")
            time.sleep(delay)

    return sent_count


def check_replies(cl):
    """Check for replies to your DMs."""
    print(f"\n  Checking for replies...")
    print(f"  " + "─" * 50)

    try:
        threads = cl.direct_threads(amount=20)
        reply_count = 0
        for thread in threads:
            if thread.messages and len(thread.messages) > 1:
                last_msg = thread.messages[0]
                if last_msg.user_id != cl.user_id:
                    users = [u.username for u in thread.users]
                    print(f"    💬 Reply from @{', '.join(users)}: {last_msg.text[:80]}...")
                    reply_count += 1

        if reply_count == 0:
            print("    No new replies yet. Keep sending!")
        else:
            print(f"\n    ✓ {reply_count} replies — GO CLOSE THEM! 💰")
    except Exception as e:
        print(f"    Error checking replies: {e}")


def show_stats():
    """Show outreach stats."""
    sent_data = load_sent()
    total_sent = len(sent_data.get("sent", []))
    print(f"\n  📊 OUTREACH STATS")
    print(f"  " + "─" * 40)
    print(f"    Total DMs sent: {total_sent}")
    print(f"    Expected replies: ~{int(total_sent * 0.12)} (12% rate)")
    print(f"    Expected clients: ~{max(1, int(total_sent * 0.12 * 0.17))} (17% close)")
    print(f"    Expected revenue: ${max(1, int(total_sent * 0.12 * 0.17)) * 300}")
    print()
    if total_sent < 50:
        print(f"    ⚠ Need more volume! Send {50 - total_sent} more DMs.")
    elif total_sent < 100:
        print(f"    Getting there! {100 - total_sent} more DMs to hit target.")
    else:
        print(f"    ✓ Great volume! Focus on closing replies now.")


def main():
    print()
    print("  ╔══════════════════════════════════════════════════════════╗")
    print("  ║  DS MARKETING — INSTAGRAM DM OUTREACH                   ║")
    print("  ║  Find Miami businesses → Send DMs → Close $300 deals    ║")
    print("  ╚══════════════════════════════════════════════════════════╝")
    print()

    # Login
    print("  STEP 1: Login")
    print("  " + "─" * 50)
    cl = login()
    if not cl:
        return

    while True:
        print()
        print("  ┌─────────────────────────────────┐")
        print("  │  What do you want to do?         │")
        print("  │                                   │")
        print("  │  1. Find & DM Miami businesses    │")
        print("  │  2. Check for replies             │")
        print("  │  3. View stats                    │")
        print("  │  4. Exit                          │")
        print("  └─────────────────────────────────┘")

        try:
            choice = input("\n  Choice (1-4): ").strip()
        except (KeyboardInterrupt, EOFError):
            break

        if choice == "1":
            print()
            try:
                max_dms = int(input("  How many DMs to send? (recommended: 15-20): ").strip() or "15")
            except:
                max_dms = 15
            max_dms = min(max_dms, 25)  # Safety cap

            # Pick random subset of hashtags
            tags = random.sample(MIAMI_HASHTAGS, min(10, len(MIAMI_HASHTAGS)))
            targets = find_businesses(cl, tags, max_per_tag=5, max_total=max_dms + 10)

            if targets:
                print(f"\n  Top targets:")
                for i, t in enumerate(targets[:10]):
                    site = "✓ site" if t["has_website"] else "✗ NO site"
                    print(f"    {i+1}. @{t['username']} — {t['followers']} followers — {site}")

                confirm = input(f"\n  Send {min(max_dms, len(targets))} DMs? (y/n): ").strip().lower()
                if confirm in ("y", "yes", ""):
                    sent = send_dms(cl, targets, max_send=max_dms)
                    print(f"\n  ✓ Sent {sent} DMs this session!")
                    show_stats()
            else:
                print("  No targets found. Try again in a few minutes.")

        elif choice == "2":
            check_replies(cl)

        elif choice == "3":
            show_stats()

        elif choice == "4":
            break

    print("\n  Go get that $600! 💰\n")


if __name__ == "__main__":
    main()
