#!/usr/bin/env python3
"""
DS MARKETING — CLIENT ACQUISITION & BOOKING SYSTEM
═══════════════════════════════════════════════════════
Daily automated pipeline: Find → Outreach → Follow up → Close → Book → Deliver

PIPELINE STAGES:
  1. PROSPECT  — Found on Instagram, no contact yet
  2. DM_SENT   — Cold DM sent
  3. REPLIED   — They responded
  4. CALL      — Call/meeting scheduled
  5. CLOSED    — Deal closed, invoice sent
  6. BUILDING  — Working on their project
  7. DELIVERED — Project delivered, paid in full
  8. LOST      — Didn't close (track reason)

DAILY AUTOMATION:
  - Morning: Find new prospects + send DMs
  - Afternoon: Follow up on replies + close deals
  - Evening: Status report + tomorrow's plan

SETUP:
  pip install instagrapi
  python3 ds_acquisition.py
"""

import os, sys, json, time, random, subprocess
from datetime import datetime, timedelta

# ══════════════════════════════════════════════
# CONFIG
# ══════════════════════════════════════════════
PIPELINE_FILE = os.path.expanduser("~/Documents/ds_pipeline.json")
DAILY_LOG = os.path.expanduser("~/Documents/ds_daily_logs/")
REVENUE_TARGET = 600  # per week
PRICE = 300

STAGES = ["prospect", "dm_sent", "replied", "call", "closed", "building", "delivered", "lost"]

STAGE_LABELS = {
    "prospect": "🔍 Prospect",
    "dm_sent":  "📩 DM Sent",
    "replied":  "💬 Replied",
    "call":     "📞 Call Booked",
    "closed":   "🤝 Closed",
    "building": "🔨 Building",
    "delivered": "✅ Delivered",
    "lost":     "❌ Lost",
}


# ══════════════════════════════════════════════
# PIPELINE DATABASE
# ══════════════════════════════════════════════
def load_pipeline():
    if os.path.exists(PIPELINE_FILE):
        with open(PIPELINE_FILE) as f:
            return json.load(f)
    return {"clients": [], "stats": {"total_revenue": 0, "total_closed": 0, "total_dms": 0}}

def save_pipeline(data):
    os.makedirs(os.path.dirname(PIPELINE_FILE), exist_ok=True)
    with open(PIPELINE_FILE, "w") as f:
        json.dump(data, f, indent=2)

def add_client(data, username, name="", source="instagram", notes=""):
    # Check if already exists
    for c in data["clients"]:
        if c["username"] == username:
            return False
    client = {
        "username": username,
        "name": name,
        "stage": "prospect",
        "source": source,
        "notes": notes,
        "added": datetime.now().isoformat(),
        "last_contact": "",
        "follow_ups": 0,
        "service": "landing_page",
        "price": PRICE,
        "paid": 0,
        "history": [{"date": datetime.now().isoformat(), "action": "Added to pipeline"}]
    }
    data["clients"].append(client)
    return True

def move_stage(data, username, new_stage, notes=""):
    for c in data["clients"]:
        if c["username"] == username:
            old = c["stage"]
            c["stage"] = new_stage
            c["last_contact"] = datetime.now().isoformat()
            c["history"].append({
                "date": datetime.now().isoformat(),
                "action": f"Moved from {old} → {new_stage}" + (f": {notes}" if notes else "")
            })
            if new_stage == "closed":
                data["stats"]["total_closed"] += 1
            if new_stage == "delivered":
                c["paid"] = c["price"]
                data["stats"]["total_revenue"] += c["price"]
            return True
    return False

def get_by_stage(data, stage):
    return [c for c in data["clients"] if c["stage"] == stage]

def needs_followup(data):
    """Clients who need follow-up (DM sent > 24h ago, no reply)."""
    results = []
    now = datetime.now()
    for c in data["clients"]:
        if c["stage"] == "dm_sent" and c["last_contact"]:
            try:
                last = datetime.fromisoformat(c["last_contact"])
                if (now - last).total_seconds() > 86400:  # 24 hours
                    results.append(c)
            except:
                results.append(c)
    return results


# ══════════════════════════════════════════════
# FOLLOW-UP MESSAGES
# ══════════════════════════════════════════════
FOLLOWUP_1 = """Hey! Just following up on my message — I'd love to put together a free mockup for your business. No obligation at all.

Want me to give it a shot? dsmarketing.lovable.app

— Joxel"""

FOLLOWUP_2 = """Hey! Last follow up from me — I still have 1 spot open this week at $300 for a custom landing page.

After this week the price goes to $500. Let me know if you want in!

— Joxel, DS Marketing"""

CLOSE_MSG = """Amazing! Here's how we move forward:

1. Send me your logo + brand colors
2. What's the #1 goal? (bookings, leads, sales?)
3. Any text/copy you want included?

Payment: $150 upfront, $150 on delivery
I accept Zelle, Venmo, CashApp, or PayPal.

First draft ready in 12-24 hours! 🚀"""

INVOICE_TEMPLATE = """
═══════════════════════════════════════════
  INVOICE — DS MARKETING AGENCY
═══════════════════════════════════════════

  Client: {name} (@{username})
  Date:   {date}

  SERVICE: Custom Landing Page
  ─────────────────────────────
  • Custom design (brand matched)
  • Professional copywriting
  • Mobile responsive
  • Contact form / booking
  • Hosted and live
  • 1 round of revisions

  TOTAL:   ${price}
  DEPOSIT: ${deposit} (due now)
  BALANCE: ${balance} (on delivery)

  PAYMENT:
  • Zelle: [your email/phone]
  • Venmo: @joxeldasilva
  • CashApp: $joxeldasilva
  • PayPal: [your email]

  Thank you for choosing DS Marketing!
  @dsmarketing.agency
═══════════════════════════════════════════
"""


# ══════════════════════════════════════════════
# DAILY AUTOMATION ROUTINES
# ══════════════════════════════════════════════

def morning_routine(data):
    """Morning: Status check + plan for today."""
    print("\n  ☀️  MORNING ROUTINE")
    print("  " + "═" * 50)

    # Pipeline overview
    print("\n  PIPELINE STATUS:")
    for stage in STAGES:
        clients = get_by_stage(data, stage)
        if clients:
            label = STAGE_LABELS.get(stage, stage)
            print(f"    {label}: {len(clients)}")
            for c in clients[:5]:
                print(f"      → @{c['username']} ({c.get('name', '')})")

    # Follow-ups needed
    fu = needs_followup(data)
    if fu:
        print(f"\n  ⚡ FOLLOW-UPS NEEDED: {len(fu)}")
        for c in fu:
            print(f"    → @{c['username']} — DM sent {c.get('last_contact', 'unknown')[:10]}")

    # Revenue tracker
    stats = data["stats"]
    print(f"\n  💰 REVENUE:")
    print(f"    Total earned: ${stats.get('total_revenue', 0)}")
    print(f"    Deals closed: {stats.get('total_closed', 0)}")
    print(f"    Total DMs sent: {stats.get('total_dms', 0)}")
    pipeline_value = sum(c["price"] for c in data["clients"] if c["stage"] in ["replied", "call", "closed", "building"])
    print(f"    Pipeline value: ${pipeline_value}")

    # Today's plan
    replied = get_by_stage(data, "replied")
    calls = get_by_stage(data, "call")
    closed = get_by_stage(data, "closed")

    print(f"\n  📋 TODAY'S PLAN:")
    print(f"    1. Follow up on {len(fu)} stale DMs")
    print(f"    2. Close {len(replied)} replied leads")
    print(f"    3. Complete {len(calls)} scheduled calls")
    print(f"    4. Send invoices to {len(closed)} closed deals")
    print(f"    5. Send 20 new DMs to fresh prospects")


def send_followups(data):
    """Send follow-up DMs to stale conversations."""
    fu = needs_followup(data)
    if not fu:
        print("\n  No follow-ups needed right now.")
        return

    print(f"\n  📩 FOLLOW-UP MESSAGES ({len(fu)} to send)")
    print("  " + "─" * 50)

    for c in fu:
        follow_count = c.get("follow_ups", 0)
        if follow_count == 0:
            msg = FOLLOWUP_1
        elif follow_count == 1:
            msg = FOLLOWUP_2
        else:
            print(f"    ⊘ @{c['username']} — already followed up 2x, moving to lost")
            move_stage(data, c["username"], "lost", "No response after 2 follow-ups")
            continue

        print(f"\n    → @{c['username']} (follow-up #{follow_count + 1}):")
        print(f"    ┌{'─' * 48}┐")
        for line in msg.strip().split('\n'):
            print(f"    │ {line:<47}│")
        print(f"    └{'─' * 48}┘")

        # Update tracking
        c["follow_ups"] = follow_count + 1
        c["last_contact"] = datetime.now().isoformat()
        c["history"].append({
            "date": datetime.now().isoformat(),
            "action": f"Follow-up #{follow_count + 1} sent"
        })

    print(f"\n  Copy each message above and send via Instagram DMs.")
    print(f"  Or run ds_dm_sender.py to automate it.")


def close_deal(data, username):
    """Generate closing message and invoice for a client."""
    client = None
    for c in data["clients"]:
        if c["username"] == username:
            client = c
            break

    if not client:
        print(f"  Client @{username} not found.")
        return

    print(f"\n  🤝 CLOSING @{username}")
    print("  " + "─" * 50)

    print(f"\n  Send this closing message:")
    print(f"  ┌{'─' * 48}┐")
    for line in CLOSE_MSG.strip().split('\n'):
        print(f"  │ {line:<47}│")
    print(f"  └{'─' * 48}┘")

    # Generate invoice
    invoice = INVOICE_TEMPLATE.format(
        name=client.get("name", username),
        username=username,
        date=datetime.now().strftime("%B %d, %Y"),
        price=client["price"],
        deposit=client["price"] // 2,
        balance=client["price"] - client["price"] // 2,
    )
    print(invoice)

    # Save invoice
    inv_dir = os.path.expanduser("~/Documents/ds_invoices/")
    os.makedirs(inv_dir, exist_ok=True)
    inv_path = f"{inv_dir}/invoice_{username}_{datetime.now().strftime('%Y%m%d')}.txt"
    with open(inv_path, "w") as f:
        f.write(invoice)
    print(f"  Invoice saved: {inv_path}")

    move_stage(data, username, "closed", "Deal closed, invoice sent")


def dashboard(data):
    """Full revenue and pipeline dashboard."""
    print("\n  ╔══════════════════════════════════════════════════════════╗")
    print("  ║  DS MARKETING — ACQUISITION DASHBOARD                    ║")
    print("  ╚══════════════════════════════════════════════════════════╝")

    stats = data["stats"]
    total = len(data["clients"])

    # Revenue
    print(f"\n  💰 REVENUE")
    print(f"  {'─' * 50}")
    print(f"    Earned:        ${stats.get('total_revenue', 0)}")
    print(f"    Target:        ${REVENUE_TARGET}/week")
    progress = min(100, int((stats.get('total_revenue', 0) / REVENUE_TARGET) * 100))
    bar = "█" * (progress // 5) + "░" * (20 - progress // 5)
    print(f"    Progress:      [{bar}] {progress}%")
    remaining = max(0, REVENUE_TARGET - stats.get('total_revenue', 0))
    print(f"    Remaining:     ${remaining} ({remaining // PRICE} more clients)")

    # Pipeline funnel
    print(f"\n  📊 PIPELINE FUNNEL")
    print(f"  {'─' * 50}")
    for stage in STAGES:
        clients = get_by_stage(data, stage)
        count = len(clients)
        bar = "█" * min(count, 30)
        label = STAGE_LABELS.get(stage, stage)
        print(f"    {label:<20} {count:>3}  {bar}")

    # Conversion rates
    dms = len([c for c in data["clients"] if c["stage"] != "prospect"])
    replies = len([c for c in data["clients"] if c["stage"] in ["replied", "call", "closed", "building", "delivered"]])
    closed = len([c for c in data["clients"] if c["stage"] in ["closed", "building", "delivered"]])

    print(f"\n  📈 CONVERSION RATES")
    print(f"  {'─' * 50}")
    if dms > 0:
        print(f"    DM → Reply:    {replies}/{dms} ({int(replies/dms*100) if dms else 0}%)")
    if replies > 0:
        print(f"    Reply → Close: {closed}/{replies} ({int(closed/replies*100) if replies else 0}%)")
    if dms > 0:
        print(f"    DM → Close:    {closed}/{dms} ({int(closed/dms*100) if dms else 0}%)")

    # Today's hot leads
    replied = get_by_stage(data, "replied")
    calls = get_by_stage(data, "call")
    if replied or calls:
        print(f"\n  🔥 HOT LEADS (close these TODAY)")
        print(f"  {'─' * 50}")
        for c in replied + calls:
            print(f"    @{c['username']} — {STAGE_LABELS[c['stage']]} — ${c['price']}")

    # This week's schedule
    building = get_by_stage(data, "building")
    if building:
        print(f"\n  🔨 IN PROGRESS (deliver these)")
        print(f"  {'─' * 50}")
        for c in building:
            print(f"    @{c['username']} — {c.get('name', '')} — ${c['price']}")


def daily_report(data):
    """End of day report."""
    print(f"\n  📊 END OF DAY REPORT — {datetime.now().strftime('%B %d, %Y')}")
    print("  " + "═" * 50)

    today = datetime.now().strftime("%Y-%m-%d")
    today_actions = []
    for c in data["clients"]:
        for h in c.get("history", []):
            if h["date"][:10] == today:
                today_actions.append(f"@{c['username']}: {h['action']}")

    if today_actions:
        print(f"\n  Today's activity ({len(today_actions)} actions):")
        for a in today_actions:
            print(f"    • {a}")
    else:
        print(f"\n  No activity logged today. Get to work!")

    stats = data["stats"]
    print(f"\n  Revenue: ${stats.get('total_revenue', 0)} / ${REVENUE_TARGET} target")

    # Save daily log
    os.makedirs(DAILY_LOG, exist_ok=True)
    log_path = f"{DAILY_LOG}/{today}.json"
    with open(log_path, "w") as f:
        json.dump({"date": today, "actions": today_actions, "stats": stats}, f, indent=2)


# ══════════════════════════════════════════════
# MAIN MENU
# ══════════════════════════════════════════════
def main():
    print()
    print("  ╔══════════════════════════════════════════════════════════╗")
    print("  ║  DS MARKETING — CLIENT ACQUISITION SYSTEM                ║")
    print("  ║  Find → Outreach → Follow Up → Close → Book → Deliver   ║")
    print("  ╚══════════════════════════════════════════════════════════╝")

    data = load_pipeline()

    while True:
        print(f"""
  ┌──────────────────────────────────────┐
  │  MENU                                │
  │                                      │
  │  1. ☀️  Morning Routine (daily plan) │
  │  2. 📊 Dashboard                     │
  │  3. ➕ Add Prospect                  │
  │  4. 📩 Send Follow-ups              │
  │  5. ⬆️  Move Client Stage           │
  │  6. 🤝 Close Deal (+ invoice)       │
  │  7. 📋 Daily Report                 │
  │  8. 🚀 Run DM Sender               │
  │  9. 🔍 Search Pipeline              │
  │  0. Exit                             │
  └──────────────────────────────────────┘""")

        try:
            choice = input("\n  Choice: ").strip()
        except (KeyboardInterrupt, EOFError):
            break

        if choice == "1":
            morning_routine(data)

        elif choice == "2":
            dashboard(data)

        elif choice == "3":
            username = input("  Instagram @username: ").strip().replace("@", "")
            name = input("  Business name: ").strip()
            notes = input("  Notes: ").strip()
            if add_client(data, username, name, notes=notes):
                print(f"  ✓ @{username} added to pipeline")
                save_pipeline(data)
            else:
                print(f"  Already in pipeline")

        elif choice == "4":
            send_followups(data)
            save_pipeline(data)

        elif choice == "5":
            username = input("  Instagram @username: ").strip().replace("@", "")
            print(f"  Stages: {', '.join(STAGES)}")
            new_stage = input("  New stage: ").strip()
            notes = input("  Notes (optional): ").strip()
            if new_stage in STAGES:
                if move_stage(data, username, new_stage, notes):
                    print(f"  ✓ @{username} → {STAGE_LABELS.get(new_stage, new_stage)}")
                    save_pipeline(data)
                else:
                    print(f"  Client not found")
            else:
                print(f"  Invalid stage")

        elif choice == "6":
            username = input("  Instagram @username to close: ").strip().replace("@", "")
            close_deal(data, username)
            save_pipeline(data)

        elif choice == "7":
            daily_report(data)

        elif choice == "8":
            print("  Launching DM sender...")
            try:
                subprocess.run([sys.executable, os.path.expanduser("~/Documents/ds_dm_sender.py")])
            except:
                print("  Run: python3 ~/Documents/ds_dm_sender.py")

        elif choice == "9":
            query = input("  Search: ").strip().lower()
            results = [c for c in data["clients"] if query in c["username"].lower() or query in c.get("name", "").lower()]
            if results:
                for c in results:
                    print(f"    @{c['username']} — {c.get('name', '')} — {STAGE_LABELS[c['stage']]} — ${c['price']}")
                    for h in c.get("history", [])[-3:]:
                        print(f"      {h['date'][:10]}: {h['action']}")
            else:
                print("  No results")

        elif choice == "0":
            save_pipeline(data)
            break

    save_pipeline(data)
    print("\n  Pipeline saved. Go close those deals! 💰\n")


if __name__ == "__main__":
    main()
