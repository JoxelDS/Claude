#!/usr/bin/env python3
"""
DS MARKETING — COLD EMAIL OUTREACH ENGINE
═══════════════════════════════════════════
Legitimate B2B cold email system. CAN-SPAM compliant.

Features:
  1. Business Prospector — finds businesses via Google search
  2. Email Finder — extracts public emails from business websites
  3. Cold Email Sender — Gmail SMTP OR SendGrid API
  4. Pipeline Sync — connects to ds_acquisition.py pipeline
  5. Follow-Up Manager — automated follow-up scheduling

SETUP (choose one):
  Option A — Personal Gmail:
    1. Create a free personal Gmail (not Workspace)
    2. Enable 2FA → myaccount.google.com/security
    3. Create App Password → myaccount.google.com/apppasswords
    4. Run: python3 ds_outreach.py

  Option B — SendGrid (FREE, no Gmail needed):
    1. Go to signup.sendgrid.com (free account)
    2. Create an API key (Settings → API Keys)
    3. Run: python3 ds_outreach.py

Gmail limit: ~500/day (we cap at 80). SendGrid free: 100/day.
"""

import os, sys, subprocess, json, time, random, re
from datetime import datetime, timedelta
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
import smtplib
import ssl

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
ensure("bs4", "beautifulsoup4")

import requests
from bs4 import BeautifulSoup

# ══════════════════════════════════════════════
# CONFIG
# ══════════════════════════════════════════════
CONFIG_FILE = os.path.expanduser("~/.ds_email_config.json")
PROSPECTS_FILE = os.path.expanduser("~/Documents/ds_prospects.json")
PIPELINE_FILE = os.path.expanduser("~/Documents/ds_pipeline.json")
EMAIL_LOG_FILE = os.path.expanduser("~/Documents/ds_email_log.json")
FOLLOWUP_FILE = os.path.expanduser("~/Documents/ds_followups.json")

MAX_EMAILS_PER_DAY = 80      # Safe limit (Gmail: 500/day, SendGrid free: 100/day)
EMAIL_DELAY_MIN = 30          # seconds between emails
EMAIL_DELAY_MAX = 90          # seconds between emails
PHYSICAL_ADDRESS = "DS Marketing — Miami, FL"

HEADERS = {
    "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36"
}

# ══════════════════════════════════════════════
# EMAIL TEMPLATES — CAN-SPAM COMPLIANT
# ══════════════════════════════════════════════
SUBJECT_LINES = [
    "Quick question about {business_name}",
    "{business_name} — free website mockup",
    "Idea for {business_name}'s online presence",
    "Saw {business_name} — had to reach out",
]

EMAIL_TEMPLATES = [
    """Hi {owner_name},

I came across {business_name} and love what you've built.

I noticed you don't have a website yet (or your current one could use a refresh). I build professional, mobile-friendly landing pages for local businesses — designed to turn visitors into customers.

Here's my portfolio: https://dsmarketing.lovable.app

I'm currently offering a special rate:
- $300 flat fee (no monthly costs)
- Delivered in 24 hours
- Custom design + professional copywriting
- Mobile-optimized

Would you be open to seeing a free mockup of what yours could look like? No commitment needed.

Best,
Joxel Da Silva
DS Marketing
https://dsmarketing.lovable.app
@dsmarketing.agency on Instagram

{unsubscribe}""",

    """Hi {owner_name},

I help local businesses in Miami get more customers with professional websites and landing pages.

I saw {business_name} and thought — you'd benefit from a strong online presence. When customers Google your business, having a professional site makes a huge difference.

I build complete landing pages for $300 flat:
- Custom design matching your brand
- Professional copy that converts
- Mobile-friendly
- Live in 24 hours

Check out my work: https://dsmarketing.lovable.app

Want me to put together a free preview? Takes me about 30 minutes and there's zero obligation.

Best,
Joxel Da Silva
DS Marketing
https://dsmarketing.lovable.app

{unsubscribe}""",

    """Hi {owner_name},

Quick question — when someone discovers {business_name} and wants to learn more, where do they go?

A professional landing page makes that 10X easier. I build them for local businesses:

- $300, one-time payment
- Delivered in 24 hours
- Design, copywriting, mobile optimization — all included
- No monthly fees, no hidden costs

See examples: https://dsmarketing.lovable.app

I'm taking on 3 more projects this week. Would you like a free mockup?

Best,
Joxel Da Silva
DS Marketing | Miami, FL
https://dsmarketing.lovable.app

{unsubscribe}""",
]

FOLLOWUP_TEMPLATES = [
    """Hi {owner_name},

Just following up on my previous email about building a website for {business_name}.

I know you're busy running your business — that's exactly why I handle everything. You just tell me what you want, and I deliver a professional site in 24 hours.

Still interested in seeing a free mockup?

Best,
Joxel Da Silva
DS Marketing

{unsubscribe}""",

    """Hi {owner_name},

Last follow up from me — I don't want to be a bother.

If you ever need a professional website for {business_name}, my offer stands:
- $300 flat, delivered in 24 hours
- Portfolio: https://dsmarketing.lovable.app

Wishing you success!

Joxel Da Silva
DS Marketing

{unsubscribe}""",
]

UNSUBSCRIBE_TEXT = """---
To stop receiving emails from DS Marketing, reply with "unsubscribe".
DS Marketing — Miami, FL"""


# ══════════════════════════════════════════════
# DATA MANAGEMENT
# ══════════════════════════════════════════════
def load_json(path, default=None):
    if default is None:
        default = {}
    if os.path.exists(path):
        with open(path) as f:
            return json.load(f)
    return default

def save_json(path, data):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, "w") as f:
        json.dump(data, f, indent=2)

def load_config():
    return load_json(CONFIG_FILE, {
        "method": "",           # "gmail" or "sendgrid"
        "gmail_user": "",
        "gmail_app_password": "",
        "sendgrid_api_key": "",
        "sender_name": "Joxel Da Silva",
        "sender_email": "",
    })

def save_config(cfg):
    save_json(CONFIG_FILE, cfg)

def load_prospects():
    return load_json(PROSPECTS_FILE, {"prospects": [], "searched": []})

def save_prospects(data):
    save_json(PROSPECTS_FILE, data)

def load_email_log():
    return load_json(EMAIL_LOG_FILE, {"sent": [], "total": 0, "today_count": 0, "today_date": "", "bounces": []})

def save_email_log(log):
    save_json(EMAIL_LOG_FILE, log)

def load_followups():
    return load_json(FOLLOWUP_FILE, {"followups": []})

def save_followups(data):
    save_json(FOLLOWUP_FILE, data)


# ══════════════════════════════════════════════
# 1. BUSINESS PROSPECTOR
# ══════════════════════════════════════════════
SEARCH_QUERIES = [
    "{niche} {city} FL",
    "{niche} near {city} Florida",
    "{niche} {city} Florida contact",
    "best {niche} in {city} FL",
]

NICHES = [
    "barber shop", "hair salon", "nail salon", "beauty salon",
    "tattoo shop", "auto detailing", "personal trainer", "fitness studio",
    "restaurant", "bakery", "food truck", "cafe",
    "photographer", "videographer", "cleaning service", "landscaping",
    "pet grooming", "dog walker", "florist", "boutique",
    "yoga studio", "martial arts", "dance studio", "music school",
    "dentist", "chiropractor", "plumber", "electrician",
    "real estate agent", "insurance agent", "accountant", "lawyer",
]

CITIES = [
    "Miami", "Miami Beach", "Hialeah", "Coral Gables", "Doral",
    "Kendall", "Homestead", "North Miami", "Aventura", "Brickell",
    "Little Havana", "Wynwood", "Fort Lauderdale", "Hollywood FL",
    "Pompano Beach", "Boca Raton", "West Palm Beach",
    # Expand to other states
    "Atlanta", "Houston", "Dallas", "Austin", "San Antonio",
    "Charlotte", "Nashville", "Orlando", "Tampa", "Jacksonville",
    "Phoenix", "Denver", "Las Vegas", "Los Angeles", "San Diego",
    "Chicago", "Seattle", "Portland",
]


def search_google(query, num_results=10):
    """Search Google and return result URLs."""
    try:
        url = f"https://www.google.com/search?q={requests.utils.quote(query)}&num={num_results}"
        resp = requests.get(url, headers=HEADERS, timeout=10)
        soup = BeautifulSoup(resp.text, "html.parser")
        links = []
        for a in soup.find_all("a", href=True):
            href = a["href"]
            if href.startswith("/url?q="):
                real_url = href.split("/url?q=")[1].split("&")[0]
                if "google.com" not in real_url and "youtube.com" not in real_url:
                    links.append(real_url)
        return links[:num_results]
    except Exception as e:
        print(f"  Search error: {e}")
        return []


def extract_emails_from_url(url):
    """Visit a webpage and extract email addresses."""
    try:
        resp = requests.get(url, headers=HEADERS, timeout=8)
        text = resp.text
        # Find emails using regex
        emails = re.findall(r'[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}', text)
        # Filter out common non-business emails
        filtered = []
        for email in set(emails):
            email = email.lower()
            skip = ["example.com", "sentry.io", "wixpress", "schema.org",
                     "wordpress", "w3.org", "googleapis", "cloudflare",
                     "noreply", "no-reply", "support@", "info@google",
                     ".png", ".jpg", ".gif", ".svg", ".css", ".js"]
            if not any(s in email for s in skip):
                filtered.append(email)
        return filtered
    except:
        return []


def extract_business_info(url):
    """Try to extract business name and info from a page."""
    try:
        resp = requests.get(url, headers=HEADERS, timeout=8)
        soup = BeautifulSoup(resp.text, "html.parser")
        title = soup.title.string if soup.title else ""
        # Clean up title
        title = title.split("|")[0].split("-")[0].split("–")[0].strip() if title else ""
        return title
    except:
        return ""


def prospect_businesses(niche=None, city=None, count=20):
    """Find businesses to email."""
    data = load_prospects()
    found = 0

    niches = [niche] if niche else random.sample(NICHES, min(5, len(NICHES)))
    cities = [city] if city else random.sample(CITIES, min(3, len(CITIES)))

    print(f"\n  Searching for businesses...")
    print(f"  Niches: {', '.join(niches)}")
    print(f"  Cities: {', '.join(cities)}\n")

    existing_emails = {p.get("email", "").lower() for p in data["prospects"]}

    for n in niches:
        for c in cities:
            if found >= count:
                break

            query = f"{n} {c} contact email"
            search_key = f"{n}|{c}"
            if search_key in data["searched"]:
                continue

            print(f"  Searching: {n} in {c}...")
            urls = search_google(query, num_results=8)

            for url in urls:
                if found >= count:
                    break

                emails = extract_emails_from_url(url)
                biz_name = extract_business_info(url)

                for email in emails:
                    if email.lower() in existing_emails:
                        continue

                    prospect = {
                        "email": email,
                        "business_name": biz_name or "Business",
                        "niche": n,
                        "city": c,
                        "source_url": url,
                        "found_date": datetime.now().isoformat(),
                        "status": "new",  # new, emailed, replied, followup1, followup2, closed, unsubscribed
                        "owner_name": "",  # Fill in manually or leave blank
                    }
                    data["prospects"].append(prospect)
                    existing_emails.add(email.lower())
                    found += 1
                    print(f"  ✓ Found: {email} — {biz_name or 'Unknown'} ({n}, {c})")

                time.sleep(random.uniform(2, 4))

            data["searched"].append(search_key)
            time.sleep(random.uniform(3, 6))

    save_prospects(data)
    print(f"\n  Done! Found {found} new prospects.")
    print(f"  Total prospects: {len(data['prospects'])}")
    return found


# ══════════════════════════════════════════════
# 2. EMAIL SENDER — CAN-SPAM COMPLIANT
# ══════════════════════════════════════════════
def setup_email():
    """Setup email sending method."""
    cfg = load_config()

    print("\n  ╔══════════════════════════════════════════════╗")
    print("  ║  EMAIL SETUP — Choose your sending method     ║")
    print("  ╚══════════════════════════════════════════════╝")
    print()
    print("  1. Gmail (personal Gmail + App Password)")
    print("  2. SendGrid (FREE — sign up at signup.sendgrid.com)")
    print()

    choice = input("  Choice [1/2]: ").strip()

    if choice == "2":
        print()
        print("  ── SendGrid Setup ──")
        print("  1. Go to signup.sendgrid.com → create free account")
        print("  2. Go to Settings → API Keys → Create API Key")
        print("  3. Give it 'Full Access' and copy the key")
        print()
        api_key = input("  SendGrid API Key: ").strip()
        sender_email = input("  Your email (sender 'from' address): ").strip()
        sender_name = input("  Your name [Joxel Da Silva]: ").strip() or "Joxel Da Silva"

        cfg["method"] = "sendgrid"
        cfg["sendgrid_api_key"] = api_key
        cfg["sender_email"] = sender_email
        cfg["sender_name"] = sender_name
        save_config(cfg)
        print("  ✓ SendGrid config saved!")

        # Verify sender identity
        print("\n  IMPORTANT: SendGrid requires sender verification.")
        print(f"  Check {sender_email} for a verification email from SendGrid.")
        print("  Click the link to verify before sending.")
    else:
        print()
        print("  ── Gmail Setup ──")
        print("  1. Use a PERSONAL Gmail (not Workspace)")
        print("  2. Enable 2-Step Verification → myaccount.google.com/security")
        print("  3. Create App Password → myaccount.google.com/apppasswords")
        print("  4. Copy the 16-character password")
        print()
        gmail = input("  Gmail address: ").strip()
        app_pass = input("  App Password (16 chars, no spaces): ").strip()
        sender_name = input("  Your name [Joxel Da Silva]: ").strip() or "Joxel Da Silva"

        cfg["method"] = "gmail"
        cfg["gmail_user"] = gmail
        cfg["gmail_app_password"] = app_pass
        cfg["sender_email"] = gmail
        cfg["sender_name"] = sender_name
        save_config(cfg)
        print("  ✓ Gmail config saved!")

    return cfg


def send_email(cfg, to_email, subject, body):
    """Send a single email via Gmail SMTP or SendGrid API."""
    method = cfg.get("method", "gmail")

    if method == "sendgrid":
        return send_via_sendgrid(cfg, to_email, subject, body)
    else:
        return send_via_gmail(cfg, to_email, subject, body)


def send_via_gmail(cfg, to_email, subject, body):
    """Send via Gmail SMTP."""
    msg = MIMEMultipart("alternative")
    msg["From"] = f"{cfg['sender_name']} <{cfg['gmail_user']}>"
    msg["To"] = to_email
    msg["Subject"] = subject
    msg["Reply-To"] = cfg["gmail_user"]
    msg.attach(MIMEText(body, "plain"))

    context = ssl.create_default_context()
    try:
        with smtplib.SMTP_SSL("smtp.gmail.com", 465, context=context) as server:
            server.login(cfg["gmail_user"], cfg["gmail_app_password"])
            server.sendmail(cfg["gmail_user"], to_email, msg.as_string())
        return True, None
    except Exception as e:
        return False, str(e)


def send_via_sendgrid(cfg, to_email, subject, body):
    """Send via SendGrid API (no SMTP needed)."""
    try:
        resp = requests.post(
            "https://api.sendgrid.com/v3/mail/send",
            headers={
                "Authorization": f"Bearer {cfg['sendgrid_api_key']}",
                "Content-Type": "application/json",
            },
            json={
                "personalizations": [{"to": [{"email": to_email}]}],
                "from": {
                    "email": cfg["sender_email"],
                    "name": cfg["sender_name"],
                },
                "subject": subject,
                "content": [{"type": "text/plain", "value": body}],
            },
            timeout=15,
        )
        if resp.status_code in (200, 201, 202):
            return True, None
        else:
            return False, f"SendGrid {resp.status_code}: {resp.text[:200]}"
    except Exception as e:
        return False, str(e)


def personalize_email(template, prospect):
    """Fill in template variables."""
    owner = prospect.get("owner_name") or "there"
    biz = prospect.get("business_name") or "your business"
    return template.replace("{owner_name}", owner)\
                   .replace("{business_name}", biz)\
                   .replace("{unsubscribe}", UNSUBSCRIBE_TEXT)


def personalize_subject(template, prospect):
    """Fill in subject line variables."""
    biz = prospect.get("business_name") or "your business"
    return template.replace("{business_name}", biz)


def send_cold_emails(max_count=None):
    """Send cold emails to new prospects."""
    cfg = load_config()
    if not cfg.get("method"):
        cfg = setup_email()

    data = load_prospects()
    log = load_email_log()

    # Check daily limit
    today = datetime.now().strftime("%Y-%m-%d")
    if log.get("today_date") != today:
        log["today_count"] = 0
        log["today_date"] = today

    remaining = MAX_EMAILS_PER_DAY - log["today_count"]
    if remaining <= 0:
        print(f"\n  Daily limit reached ({MAX_EMAILS_PER_DAY} emails). Try again tomorrow.")
        return

    # Get unsent prospects
    unsent = [p for p in data["prospects"] if p["status"] == "new"]
    if not unsent:
        print("\n  No new prospects to email. Run prospector first (option 1).")
        return

    to_send = unsent[:min(len(unsent), remaining, max_count or remaining)]
    print(f"\n  Sending {len(to_send)} emails (daily: {log['today_count']}/{MAX_EMAILS_PER_DAY})...\n")

    sent_count = 0
    for i, prospect in enumerate(to_send):
        template = random.choice(EMAIL_TEMPLATES)
        subject_tpl = random.choice(SUBJECT_LINES)

        subject = personalize_subject(subject_tpl, prospect)
        body = personalize_email(template, prospect)
        email = prospect["email"]

        print(f"  [{i+1}/{len(to_send)}] → {email}")
        ok, err = send_email(cfg, email, subject, body)

        if ok:
            prospect["status"] = "emailed"
            prospect["emailed_date"] = datetime.now().isoformat()
            log["sent"].append({"email": email, "date": datetime.now().isoformat(), "subject": subject})
            log["total"] += 1
            log["today_count"] += 1
            sent_count += 1
            print(f"         ✓ Sent! (Total today: {log['today_count']})")

            # Schedule follow-up in 3 days
            followups = load_followups()
            followups["followups"].append({
                "email": email,
                "prospect_index": data["prospects"].index(prospect),
                "followup_num": 1,
                "send_after": (datetime.now() + timedelta(days=3)).isoformat(),
                "sent": False,
            })
            save_followups(followups)

            # Add to pipeline
            add_to_pipeline(prospect)
        else:
            print(f"         ✗ Failed: {err}")
            if "authentication" in str(err).lower():
                print("\n  ⚠ Gmail auth failed. Run setup again (option 5).")
                break

        # Save progress after each email
        save_prospects(data)
        save_email_log(log)

        if i < len(to_send) - 1:
            delay = random.uniform(EMAIL_DELAY_MIN, EMAIL_DELAY_MAX)
            print(f"         ⏳ {int(delay)}s delay...")
            time.sleep(delay)

    print(f"\n  Done! Sent {sent_count} emails.")
    print(f"  Today total: {log['today_count']}/{MAX_EMAILS_PER_DAY}")
    print(f"  All-time total: {log['total']}")


# ══════════════════════════════════════════════
# 3. FOLLOW-UP MANAGER
# ══════════════════════════════════════════════
def send_followups():
    """Send scheduled follow-ups."""
    cfg = load_config()
    if not cfg.get("method"):
        print("  Setup email first (option 5).")
        return

    data = load_prospects()
    followups = load_followups()
    log = load_email_log()

    today = datetime.now().strftime("%Y-%m-%d")
    if log.get("today_date") != today:
        log["today_count"] = 0
        log["today_date"] = today

    now = datetime.now()
    due = [f for f in followups["followups"]
           if not f["sent"] and datetime.fromisoformat(f["send_after"]) <= now]

    if not due:
        print("\n  No follow-ups due right now.")
        return

    remaining = MAX_EMAILS_PER_DAY - log["today_count"]
    to_send = due[:min(len(due), remaining)]

    print(f"\n  Sending {len(to_send)} follow-ups...\n")
    sent_count = 0

    for fu in to_send:
        idx = fu.get("prospect_index", -1)
        if idx < 0 or idx >= len(data["prospects"]):
            fu["sent"] = True
            continue

        prospect = data["prospects"][idx]
        if prospect.get("status") in ["unsubscribed", "closed", "replied"]:
            fu["sent"] = True
            continue

        fu_num = fu.get("followup_num", 1)
        if fu_num <= len(FOLLOWUP_TEMPLATES):
            template = FOLLOWUP_TEMPLATES[fu_num - 1]
        else:
            fu["sent"] = True
            continue

        subject = f"Re: {personalize_subject(random.choice(SUBJECT_LINES), prospect)}"
        body = personalize_email(template, prospect)

        print(f"  Follow-up #{fu_num} → {prospect['email']}")
        ok, err = send_email(cfg, prospect["email"], subject, body)

        if ok:
            fu["sent"] = True
            prospect["status"] = f"followup{fu_num}"
            log["total"] += 1
            log["today_count"] += 1
            sent_count += 1
            print(f"  ✓ Sent!")

            # Schedule next follow-up if not the last
            if fu_num < len(FOLLOWUP_TEMPLATES):
                followups["followups"].append({
                    "email": prospect["email"],
                    "prospect_index": idx,
                    "followup_num": fu_num + 1,
                    "send_after": (datetime.now() + timedelta(days=5)).isoformat(),
                    "sent": False,
                })
        else:
            print(f"  ✗ Failed: {err}")

        save_email_log(log)
        save_followups(followups)
        save_prospects(data)

        delay = random.uniform(EMAIL_DELAY_MIN, EMAIL_DELAY_MAX)
        time.sleep(delay)

    print(f"\n  Done! Sent {sent_count} follow-ups.")


# ══════════════════════════════════════════════
# 4. PIPELINE SYNC
# ══════════════════════════════════════════════
def add_to_pipeline(prospect):
    """Add prospect to acquisition pipeline."""
    try:
        pipe = load_json(PIPELINE_FILE, {"clients": [], "stats": {"total_revenue": 0, "total_closed": 0, "total_dms": 0}})

        # Check if already exists
        email = prospect["email"]
        if any(c.get("email") == email for c in pipe["clients"]):
            return

        pipe["clients"].append({
            "username": prospect.get("business_name", "Unknown"),
            "email": email,
            "name": prospect.get("owner_name", ""),
            "stage": "dm_sent",
            "source": "cold_email",
            "notes": f"{prospect.get('niche', '')} in {prospect.get('city', '')}",
            "added": datetime.now().isoformat(),
            "last_contact": datetime.now().isoformat(),
            "follow_ups": 0,
            "service": "landing_page",
            "price": 300,
            "paid": 0,
            "history": [{"date": datetime.now().isoformat(), "action": f"Cold email sent to {email}"}]
        })
        pipe["stats"]["total_dms"] = pipe["stats"].get("total_dms", 0) + 1
        save_json(PIPELINE_FILE, pipe)
    except Exception as e:
        print(f"  Pipeline sync error: {e}")


# ══════════════════════════════════════════════
# 5. MANUAL PROSPECT ENTRY
# ══════════════════════════════════════════════
def add_manual_prospect():
    """Add a prospect manually (from in-person visits or research)."""
    data = load_prospects()

    print("\n  Add a new prospect manually:")
    biz = input("  Business name: ").strip()
    email = input("  Email: ").strip()
    owner = input("  Owner name (optional): ").strip()
    niche = input("  Business type (barber, salon, etc.): ").strip()
    city = input("  City: ").strip()
    phone = input("  Phone (optional): ").strip()

    if not email:
        print("  ✗ Email required.")
        return

    prospect = {
        "email": email,
        "business_name": biz,
        "owner_name": owner,
        "niche": niche,
        "city": city,
        "phone": phone,
        "source_url": "manual",
        "found_date": datetime.now().isoformat(),
        "status": "new",
    }
    data["prospects"].append(prospect)
    save_prospects(data)
    print(f"  ✓ Added {biz} ({email})")


def add_bulk_prospects():
    """Add multiple prospects from a CSV-style input."""
    data = load_prospects()

    print("\n  Paste prospects (one per line):")
    print("  Format: email, business_name, city, niche")
    print("  Example: john@barbershop.com, John's Barber, Miami, barber")
    print("  (Type 'done' when finished)\n")

    count = 0
    while True:
        line = input("  > ").strip()
        if line.lower() == "done":
            break
        parts = [p.strip() for p in line.split(",")]
        if len(parts) < 1 or "@" not in parts[0]:
            print("  ✗ Invalid. Need at least an email.")
            continue

        prospect = {
            "email": parts[0],
            "business_name": parts[1] if len(parts) > 1 else "",
            "city": parts[2] if len(parts) > 2 else "Miami",
            "niche": parts[3] if len(parts) > 3 else "",
            "owner_name": "",
            "phone": "",
            "source_url": "bulk_import",
            "found_date": datetime.now().isoformat(),
            "status": "new",
        }
        data["prospects"].append(prospect)
        count += 1
        print(f"  ✓ Added: {parts[0]}")

    save_prospects(data)
    print(f"\n  Added {count} prospects. Total: {len(data['prospects'])}")


# ══════════════════════════════════════════════
# 6. UNSUBSCRIBE HANDLER
# ══════════════════════════════════════════════
def handle_unsubscribe():
    """Mark an email as unsubscribed."""
    data = load_prospects()
    email = input("\n  Email to unsubscribe: ").strip().lower()

    for p in data["prospects"]:
        if p["email"].lower() == email:
            p["status"] = "unsubscribed"
            save_prospects(data)
            print(f"  ✓ {email} unsubscribed — will not receive further emails.")
            return

    print(f"  Not found: {email}")


# ══════════════════════════════════════════════
# 7. DASHBOARD
# ══════════════════════════════════════════════
def show_dashboard():
    """Show outreach stats."""
    data = load_prospects()
    log = load_email_log()
    followups = load_followups()

    total = len(data["prospects"])
    new = sum(1 for p in data["prospects"] if p["status"] == "new")
    emailed = sum(1 for p in data["prospects"] if p["status"] == "emailed")
    replied = sum(1 for p in data["prospects"] if p["status"] == "replied")
    followup1 = sum(1 for p in data["prospects"] if p["status"] == "followup1")
    followup2 = sum(1 for p in data["prospects"] if p["status"] == "followup2")
    closed = sum(1 for p in data["prospects"] if p["status"] == "closed")
    unsub = sum(1 for p in data["prospects"] if p["status"] == "unsubscribed")

    pending_fu = sum(1 for f in followups.get("followups", []) if not f["sent"])

    today = datetime.now().strftime("%Y-%m-%d")
    today_sent = log.get("today_count", 0) if log.get("today_date") == today else 0

    print()
    print("  ╔══════════════════════════════════════════════════════════╗")
    print("  ║  DS MARKETING — COLD EMAIL DASHBOARD                     ║")
    print("  ╠══════════════════════════════════════════════════════════╣")
    print(f"  ║  Total Prospects:  {total:<38}║")
    print(f"  ║  New (not emailed): {new:<37}║")
    print(f"  ║  Emailed:           {emailed:<37}║")
    print(f"  ║  Follow-up 1:       {followup1:<37}║")
    print(f"  ║  Follow-up 2:       {followup2:<37}║")
    print(f"  ║  Replied:           {replied:<37}║")
    print(f"  ║  Closed/Won:        {closed:<37}║")
    print(f"  ║  Unsubscribed:      {unsub:<37}║")
    print("  ╠══════════════════════════════════════════════════════════╣")
    print(f"  ║  Emails sent today: {today_sent}/{MAX_EMAILS_PER_DAY}{' ' * (34 - len(str(today_sent)) - len(str(MAX_EMAILS_PER_DAY)))}║")
    print(f"  ║  All-time emails:   {log.get('total', 0):<37}║")
    print(f"  ║  Pending follow-ups: {pending_fu:<36}║")
    print("  ╠══════════════════════════════════════════════════════════╣")
    est_replies = max(1, int(log.get("total", 0) * 0.08))
    est_clients = max(1, int(est_replies * 0.15))
    est_revenue = est_clients * 300
    print(f"  ║  Est. replies:      ~{est_replies:<36}║")
    print(f"  ║  Est. clients:      ~{est_clients:<36}║")
    print(f"  ║  Est. revenue:      ${est_revenue:<36}║")
    print("  ╚══════════════════════════════════════════════════════════╝")
    print()


# ══════════════════════════════════════════════
# 8. MARK REPLIES
# ══════════════════════════════════════════════
def mark_reply():
    """Mark a prospect as replied."""
    data = load_prospects()
    email = input("\n  Email that replied: ").strip().lower()

    for p in data["prospects"]:
        if p["email"].lower() == email:
            p["status"] = "replied"
            p["replied_date"] = datetime.now().isoformat()
            save_prospects(data)
            print(f"  ✓ {email} marked as replied!")
            print(f"  → Follow up and close the deal!")
            return

    print(f"  Not found: {email}")


def mark_closed():
    """Mark a prospect as closed/won."""
    data = load_prospects()
    email = input("\n  Client email: ").strip().lower()

    for p in data["prospects"]:
        if p["email"].lower() == email:
            p["status"] = "closed"
            p["closed_date"] = datetime.now().isoformat()
            save_prospects(data)

            # Update pipeline
            try:
                pipe = load_json(PIPELINE_FILE, {"clients": [], "stats": {}})
                for c in pipe["clients"]:
                    if c.get("email", "").lower() == email:
                        c["stage"] = "closed"
                        c["paid"] = 300
                pipe["stats"]["total_closed"] = pipe["stats"].get("total_closed", 0) + 1
                pipe["stats"]["total_revenue"] = pipe["stats"].get("total_revenue", 0) + 300
                save_json(PIPELINE_FILE, pipe)
            except:
                pass

            print(f"  ✓ {email} CLOSED! +$300 revenue!")
            return

    print(f"  Not found: {email}")


# ══════════════════════════════════════════════
# 9. VIEW PROSPECTS LIST
# ══════════════════════════════════════════════
def view_prospects():
    """Show all prospects."""
    data = load_prospects()
    if not data["prospects"]:
        print("\n  No prospects yet. Run prospector first (option 1).")
        return

    print(f"\n  {'#':<4} {'Status':<14} {'Email':<35} {'Business':<25} {'City':<15}")
    print("  " + "═" * 95)

    for i, p in enumerate(data["prospects"]):
        status = p.get("status", "new")
        marker = {"new": "○", "emailed": "→", "followup1": "↻", "followup2": "↻↻",
                  "replied": "★", "closed": "✓", "unsubscribed": "✗"}.get(status, "?")
        print(f"  {i+1:<4} {marker} {status:<12} {p['email']:<35} {p.get('business_name', '')[:24]:<25} {p.get('city', ''):<15}")

    print(f"\n  Total: {len(data['prospects'])} prospects")


# ══════════════════════════════════════════════
# 10. AUTO-RUN MODE
# ══════════════════════════════════════════════
def auto_run():
    """Run prospector + email sender + follow-ups automatically."""
    print("\n  ═══ AUTO-RUN MODE ═══")
    print("  1. Finding new prospects...")
    prospect_businesses(count=30)

    print("\n  2. Sending follow-ups...")
    send_followups()

    print("\n  3. Sending cold emails to new prospects...")
    send_cold_emails(max_count=50)

    print("\n  4. Dashboard:")
    show_dashboard()

    print("  ═══ AUTO-RUN COMPLETE ═══")
    print("  Run again tomorrow for follow-ups + new prospects!")


# ══════════════════════════════════════════════
# MAIN MENU
# ══════════════════════════════════════════════
def main():
    print()
    print("  ╔══════════════════════════════════════════════════════════╗")
    print("  ║  DS MARKETING — COLD EMAIL OUTREACH ENGINE               ║")
    print("  ║  Legitimate B2B outreach • CAN-SPAM compliant           ║")
    print("  ╚══════════════════════════════════════════════════════════╝")
    print()

    while True:
        print("  ┌─ MENU ─────────────────────────────────────────────┐")
        print("  │  1. Find new prospects (auto-search)               │")
        print("  │  2. Send cold emails                               │")
        print("  │  3. Send follow-ups                                │")
        print("  │  4. Auto-run (find + email + follow-up)            │")
        print("  │  5. Setup email (Gmail or SendGrid)                │")
        print("  │  6. Add prospect manually                          │")
        print("  │  7. Add prospects in bulk                          │")
        print("  │  8. View all prospects                             │")
        print("  │  9. Mark reply received                            │")
        print("  │ 10. Mark deal closed                               │")
        print("  │ 11. Handle unsubscribe                             │")
        print("  │ 12. Dashboard                                      │")
        print("  │  0. Exit                                           │")
        print("  └────────────────────────────────────────────────────┘")

        choice = input("\n  Choice: ").strip()

        if choice == "1":
            niche = input("  Niche (blank for auto): ").strip() or None
            city = input("  City (blank for auto): ").strip() or None
            count = input("  How many prospects [20]: ").strip()
            prospect_businesses(niche, city, int(count) if count else 20)
        elif choice == "2":
            count = input("  Max emails to send [50]: ").strip()
            send_cold_emails(int(count) if count else 50)
        elif choice == "3":
            send_followups()
        elif choice == "4":
            auto_run()
        elif choice == "5":
            setup_email()
        elif choice == "6":
            add_manual_prospect()
        elif choice == "7":
            add_bulk_prospects()
        elif choice == "8":
            view_prospects()
        elif choice == "9":
            mark_reply()
        elif choice == "10":
            mark_closed()
        elif choice == "11":
            handle_unsubscribe()
        elif choice == "12":
            show_dashboard()
        elif choice == "0":
            print("\n  Go close those deals! 💰\n")
            break
        else:
            print("  Invalid choice.")

        print()


if __name__ == "__main__":
    main()
