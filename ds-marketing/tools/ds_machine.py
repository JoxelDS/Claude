#!/usr/bin/env python3
"""
DS MARKETING — AUTONOMOUS DM MACHINE
═══════════════════════════════════════
ONE COMMAND. RUNS FOREVER. STOPS ONLY IF INSTAGRAM STOPS IT.

Targets business-hour states based on current time:
- EST (FL, GA, NC, NY) — 9am-8pm EST
- CST (TX, IL, TN, LA) — 9am-8pm CST
- MST (AZ, CO, NV) — 9am-8pm MST
- PST (CA, WA, OR) — 9am-8pm PST

Auto-retry after rate limits with exponential backoff.
Tracks everything. Never DMs the same person twice.

RUN: python3 ds_machine.py
"""

import os, sys, subprocess, json, time, random
from datetime import datetime, timezone, timedelta

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
SESSION_FILE = os.path.expanduser("~/.ds_ig_session.json")
SENT_FILE = os.path.expanduser("~/Documents/ds_dm_machine_sent.json")
PIPELINE_FILE = os.path.expanduser("~/Documents/ds_pipeline.json")
LOG_FILE = os.path.expanduser("~/Documents/ds_dm_machine_log.txt")

DM_DELAY_MIN = 55   # seconds between DMs (min)
DM_DELAY_MAX = 95   # seconds between DMs (max)
BATCH_SIZE = 18      # DMs per batch before long break
BATCH_BREAK = 900    # 15 min break between batches
RATE_LIMIT_WAIT = 7200  # 2 hours if rate limited
TAG_SEARCH_DELAY = 3  # seconds between hashtag searches

# ══════════════════════════════════════════════
# MULTI-STATE HASHTAGS — time-zone aware targeting
# ══════════════════════════════════════════════
STATE_TAGS = {
    "EST": {
        "offset": -5,
        "tags": [
            # Florida
            "miamibarber", "miamihairsalon", "miaminails", "miamitrainer",
            "miamiphotographer", "miamirealestate", "miamirestaurant",
            "miamitattoo", "miamiboutique", "miamibeauty", "miamimua",
            "miamilashes", "miamidetailing", "miamicleaning", "miamicakes",
            "miamismallbusiness", "miamientrepreneur", "miamifoodtruck",
            "fortlauderdalebusiness", "tampabarber", "tamparestaurant",
            "orlandobusiness", "orlandohairsalon", "jacksonvillebarber",
            # Georgia
            "atlantabarber", "atlantahairsalon", "atlantanails",
            "atlantatrainer", "atlantaphotographer", "atlantarestaurant",
            "atlantasmallbusiness", "atlantaboutique", "atlantabeauty",
            # New York
            "nycbarber", "nychairsalon", "nycnails", "nycphotographer",
            "nycrestaurant", "nycsmallbusiness", "brooklynbarber",
            "queensbusiness", "bronxbarber", "nycbeauty",
            # North Carolina
            "charlottebarber", "charlottehairsalon", "raleighbusiness",
        ],
    },
    "CST": {
        "offset": -6,
        "tags": [
            # Texas
            "houstonbarber", "houstonhairsalon", "houstonnails",
            "houstontrainer", "houstonrestaurant", "houstonsmallbusiness",
            "dallasbarber", "dallashairsalon", "dallasnails",
            "dallasrestaurant", "dallassmallbusiness", "dallasboutique",
            "austinbarber", "austinrestaurant", "austinsmallbusiness",
            "sanantoniobusiness", "sanantoniobarber",
            # Illinois
            "chicagobarber", "chicagohairsalon", "chicagonails",
            "chicagorestaurant", "chicagosmallbusiness",
            # Tennessee
            "nashvillebarber", "nashvillerestaurant", "nashvillebusiness",
            "memphisbarber", "memphisbusiness",
            # Louisiana
            "neworleansbarber", "neworleansrestaurant",
        ],
    },
    "MST": {
        "offset": -7,
        "tags": [
            # Arizona
            "phoenixbarber", "phoenixhairsalon", "phoenixrestaurant",
            "phoenixsmallbusiness", "scottsdalebeauty", "tucsonbusiness",
            # Colorado
            "denverbarber", "denverhairsalon", "denverrestaurant",
            "denversmallbusiness", "coloradospringsbusiness",
            # Nevada
            "lasvegasbarber", "lasvegashairsalon", "lasvegasrestaurant",
            "lasvegassmallbusiness", "lasvegasnails",
        ],
    },
    "PST": {
        "offset": -8,
        "tags": [
            # California
            "labarber", "lahairsalon", "lanails", "laphotographer",
            "larestaurant", "lasmallbusiness", "laboutique", "labeauty",
            "sandiegobarber", "sandiegohairsalon", "sandiegorestaurant",
            "sfbarber", "sfhairsalon", "sfrestaurant", "sfsmallbusiness",
            # Washington
            "seattlebarber", "seattlehairsalon", "seattlerestaurant",
            "seattlesmallbusiness",
            # Oregon
            "portlandbarber", "portlandhairsalon", "portlandrestaurant",
        ],
    },
}

# ══════════════════════════════════════════════
# DM TEMPLATES
# ══════════════════════════════════════════════
DMS = [
    """Hey! I came across your page and love what you're doing 🔥

Quick question — do you have a website or landing page? I build high-converting sites for local businesses.

Check out my work: dsmarketing.lovable.app

$300 flat, delivered in 24 hours. Design, copywriting, mobile-friendly — everything included.

Want me to show you what yours could look like?

— Joxel, DS Marketing
@dsmarketing.agency""",

    """Hey! Your page looks great 🙌

I help local businesses get more customers with professional websites and landing pages.

See examples here: dsmarketing.lovable.app

$300 flat — no monthly fees. Delivered in 24 hours.

Want a free mockup? No strings attached.

— Joxel, DS Marketing""",

    """Hey! Love your content 🔥

I'm a web designer and I'm taking on 2 more projects this week at my launch price of $300.

Custom design, professional copy, mobile-friendly, live in 24 hours.

Portfolio: dsmarketing.lovable.app

Interested? I can build a preview for you today!

— Joxel
@dsmarketing.agency""",

    """Hey! Had to reach out 🙌

When someone finds your business and wants to learn more — where do they go? A professional landing page makes that 10X easier.

I build them for $300, delivered in 24 hours.

See what I do: dsmarketing.lovable.app

Want me to show you what yours could look like?

— Joxel, DS Marketing""",

    """Hey! Your business looks awesome 🔥

I build professional websites for local businesses that actually convert visitors into customers.

Portfolio + booking: dsmarketing.lovable.app

$300 flat, no hidden fees. Live in 24 hours. Want a free mockup?

— Joxel
@dsmarketing.agency""",
]


# ══════════════════════════════════════════════
# TRACKING
# ══════════════════════════════════════════════
def load_sent():
    if os.path.exists(SENT_FILE):
        with open(SENT_FILE) as f:
            return json.load(f)
    return {"sent": [], "total": 0, "sessions": 0, "rate_limits": 0}

def save_sent(data):
    os.makedirs(os.path.dirname(SENT_FILE), exist_ok=True)
    with open(SENT_FILE, "w") as f:
        json.dump(data, f, indent=2)

def add_to_pipeline(username, name=""):
    """Add to acquisition pipeline too."""
    try:
        if os.path.exists(PIPELINE_FILE):
            with open(PIPELINE_FILE) as f:
                pipe = json.load(f)
        else:
            pipe = {"clients": [], "stats": {"total_revenue": 0, "total_closed": 0, "total_dms": 0}}

        # Check if exists
        if any(c["username"] == username for c in pipe["clients"]):
            return

        pipe["clients"].append({
            "username": username,
            "name": name,
            "stage": "dm_sent",
            "source": "instagram_auto",
            "notes": "Auto DM",
            "added": datetime.now().isoformat(),
            "last_contact": datetime.now().isoformat(),
            "follow_ups": 0,
            "service": "landing_page",
            "price": 300,
            "paid": 0,
            "history": [{"date": datetime.now().isoformat(), "action": "Auto DM sent"}]
        })
        pipe["stats"]["total_dms"] = pipe["stats"].get("total_dms", 0) + 1

        with open(PIPELINE_FILE, "w") as f:
            json.dump(pipe, f, indent=2)
    except:
        pass

def log(msg):
    """Log to file and print."""
    ts = datetime.now().strftime("%H:%M:%S")
    line = f"[{ts}] {msg}"
    print(f"  {line}")
    try:
        os.makedirs(os.path.dirname(LOG_FILE), exist_ok=True)
        with open(LOG_FILE, "a") as f:
            f.write(line + "\n")
    except:
        pass


# ══════════════════════════════════════════════
# TIMEZONE LOGIC
# ══════════════════════════════════════════════
def get_active_zones():
    """Return time zones where it's currently business hours (9am-8pm)."""
    now_utc = datetime.now(timezone.utc)
    active = []
    for zone_name, zone_data in STATE_TAGS.items():
        local_hour = (now_utc.hour + zone_data["offset"]) % 24
        if 9 <= local_hour <= 20:  # 9am to 8pm
            active.append(zone_name)
    return active


def get_tags_for_now():
    """Get hashtags for currently active time zones."""
    active_zones = get_active_zones()
    if not active_zones:
        # If no zone is in business hours, use all (people check DMs anytime)
        all_tags = []
        for zone_data in STATE_TAGS.values():
            all_tags.extend(zone_data["tags"])
        return all_tags, ["ALL"]

    tags = []
    for zone in active_zones:
        tags.extend(STATE_TAGS[zone]["tags"])
    return tags, active_zones


# ══════════════════════════════════════════════
# INSTAGRAM ENGINE
# ══════════════════════════════════════════════
def login():
    cl = Client()

    # Load creds
    creds = {}
    if os.path.exists(CREDS_FILE):
        with open(CREDS_FILE) as f:
            creds = json.load(f)

    if not creds.get("username"):
        print()
        username = input("  Instagram username: ").strip()
        password = input("  Instagram password: ").strip()
        creds = {"username": username, "password": password}
        with open(CREDS_FILE, "w") as f:
            json.dump(creds, f)

    # Try session reuse
    if os.path.exists(SESSION_FILE):
        try:
            cl.load_settings(SESSION_FILE)
            cl.login(creds["username"], creds["password"])
            log(f"Logged in as @{cl.username} (session reuse)")
            return cl
        except:
            pass

    try:
        cl.login(creds["username"], creds["password"])
        cl.dump_settings(SESSION_FILE)
        log(f"Logged in as @{cl.username}")
        return cl
    except Exception as e:
        log(f"LOGIN FAILED: {e}")
        return None


def find_targets(cl, tags, sent_set, max_targets=25):
    """Find business targets from hashtags."""
    targets = []
    search_tags = random.sample(tags, min(10, len(tags)))

    for tag in search_tags:
        if len(targets) >= max_targets:
            break
        try:
            medias = cl.hashtag_medias_recent(tag, amount=5)
            for media in medias:
                uid = media.user.pk
                uname = media.user.username
                if uname in sent_set or uname in [t[1] for t in targets]:
                    continue
                if uname == cl.username:
                    continue
                try:
                    info = cl.user_info(uid)
                    fol = info.follower_count
                    if 100 <= fol <= 50000:
                        targets.append((uid, uname, info.full_name or uname, fol, bool(info.external_url)))
                except:
                    continue
                if len(targets) >= max_targets:
                    break
                time.sleep(random.uniform(1, 2))
        except:
            pass
        time.sleep(random.uniform(TAG_SEARCH_DELAY, TAG_SEARCH_DELAY + 2))

    # Prioritize no-website accounts
    targets.sort(key=lambda t: (t[4], -t[3]))
    return targets


def send_batch(cl, targets, tracking):
    """Send a batch of DMs. Returns count sent and whether rate limited."""
    sent_count = 0
    rate_limited = False

    for uid, uname, name, fol, has_site in targets:
        msg = random.choice(DMS)
        site_status = "NO SITE ★" if not has_site else "has site"
        log(f"→ @{uname} ({fol} fol, {site_status})")

        try:
            cl.direct_send(msg, user_ids=[uid])
            sent_count += 1
            tracking["sent"].append(uname)
            tracking["total"] += 1
            save_sent(tracking)
            add_to_pipeline(uname, name)
            log(f"  ✓ SENT — Total: {tracking['total']}")
        except Exception as e:
            err = str(e).lower()
            log(f"  ✗ FAILED: {e}")
            if any(w in err for w in ["feedback", "challenge", "limit", "spam", "flood", "block", "action_block"]):
                log(f"  ⚠ RATE LIMITED — pausing")
                tracking["rate_limits"] += 1
                save_sent(tracking)
                rate_limited = True
                break

        delay = random.uniform(DM_DELAY_MIN, DM_DELAY_MAX)
        log(f"  ⏳ {int(delay)}s delay")
        time.sleep(delay)

    return sent_count, rate_limited


# ══════════════════════════════════════════════
# MAIN — RUNS FOREVER
# ══════════════════════════════════════════════
def main():
    print()
    print("  ╔══════════════════════════════════════════════════════════╗")
    print("  ║  DS MARKETING — AUTONOMOUS DM MACHINE                    ║")
    print("  ║  Multi-state • Auto-retry • Runs until you stop it      ║")
    print("  ║  Press Ctrl+C to stop                                    ║")
    print("  ╚══════════════════════════════════════════════════════════╝")
    print()

    # Login
    cl = login()
    if not cl:
        return

    tracking = load_sent()
    tracking["sessions"] += 1
    save_sent(tracking)
    sent_set = set(tracking["sent"])

    session_total = 0
    session_start = datetime.now()

    log(f"═══ SESSION #{tracking['sessions']} STARTED ═══")
    log(f"All-time DMs sent: {tracking['total']}")
    log(f"All-time rate limits: {tracking['rate_limits']}")

    try:
        while True:
            # Get time-zone appropriate hashtags
            tags, zones = get_tags_for_now()
            log(f"Active zones: {', '.join(zones)} — {len(tags)} hashtags available")

            # Find targets
            log(f"Searching for targets...")
            targets = find_targets(cl, tags, sent_set, max_targets=BATCH_SIZE + 5)

            if not targets:
                log(f"No new targets found. Waiting 10 min and trying different tags...")
                time.sleep(600)
                continue

            log(f"Found {len(targets)} targets — sending batch of {min(BATCH_SIZE, len(targets))}")

            # Send batch
            sent, rate_limited = send_batch(cl, targets[:BATCH_SIZE], tracking)
            session_total += sent
            sent_set.update(t[1] for t in targets[:sent])

            log(f"Batch done: {sent} sent this batch, {session_total} this session, {tracking['total']} all-time")

            if rate_limited:
                wait = RATE_LIMIT_WAIT + random.randint(0, 600)
                log(f"⚠ RATE LIMITED — waiting {wait // 60} minutes before retry...")
                log(f"  (Instagram usually lifts after 1-2 hours)")

                # Countdown
                end_time = time.time() + wait
                while time.time() < end_time:
                    remaining = int(end_time - time.time())
                    mins = remaining // 60
                    secs = remaining % 60
                    print(f"\r  ⏳ Resuming in {mins}m {secs}s...   ", end="", flush=True)
                    time.sleep(30)
                print()

                # Re-login after rate limit wait
                log("Re-logging in...")
                cl = login()
                if not cl:
                    log("Re-login failed. Waiting 30 min...")
                    time.sleep(1800)
                    cl = login()
                    if not cl:
                        log("FATAL: Cannot re-login. Exiting.")
                        break
                continue

            # Batch break
            log(f"Batch complete. Taking {BATCH_BREAK // 60} min break...")
            log(f"Next batch targets different hashtags for variety.")
            time.sleep(BATCH_BREAK + random.randint(0, 300))

    except KeyboardInterrupt:
        pass

    # Final stats
    elapsed = (datetime.now() - session_start).total_seconds() / 60
    log(f"\n═══ SESSION COMPLETE ═══")
    log(f"Session DMs sent: {session_total}")
    log(f"Session duration: {int(elapsed)} minutes")
    log(f"All-time total: {tracking['total']} DMs")
    log(f"Expected replies: ~{int(tracking['total'] * 0.12)}")
    log(f"Expected clients: ~{max(1, int(tracking['total'] * 0.12 * 0.17))}")
    log(f"Expected revenue: ${max(1, int(tracking['total'] * 0.12 * 0.17)) * 300}")
    print(f"\n  Check replies in Instagram. Go close them! 💰\n")


if __name__ == "__main__":
    main()
