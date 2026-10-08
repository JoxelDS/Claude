# DS Autopilot — what Joxel sets up once (about 30 minutes)

You asked (2026-10-08): *"automate all of the process, I just want to receive payments … connect my bank account … make the best websites."*
Everything below is a one-time setup that only you can do, because each one checks your ID or holds your money. After it, Claude finds the leads, builds the sites, writes the messages, takes the payment, buys the domain, puts the site live and tells the client. You send the Instagram DMs (Instagram allows no robot DMs) and you get paid.

## 1. Stripe = how you get paid (your bank is connected here)
1. Go to **stripe.com → Start now**. Sign up with the DS Marketing email.
2. **Activate payments**: business type (sole proprietor or your LLC), EIN or SSN, address, phone, and **your bank account (routing + account number)**. That is where the money lands, usually 2 business days after each payment. Stripe checks your ID.
3. Settings → Business → **Public details**: name "DS Marketing", statement descriptor `DSMARKETING`, support email/phone.
4. Settings → Payouts: **daily**.
5. Connect it to Claude: open https://claude.ai/customize/connectors → **Stripe** → Connect → approve.
   (Claude then creates the three payment links — Website $497, Website Pro $997, Care $49/month — and checks for new payments by itself.)

## 2. Porkbun = domains + hosting (we buy each client's domain)
1. **porkbun.com/account/create**. Verify your email, then your phone (needed to buy domains).
2. **Account → Credit**: save a card and add **$50**. Turn on **auto top-up** ($50 whenever the balance drops under $15).
3. **porkbun.com/account/api**: set the **monthly API limit** to **$300**. That covers about 20 domains + hosting a month. Claude can never spend more than this, and you get an email for every charge.
4. Connect it to Claude: https://claude.ai/customize/connectors → **Add custom connector** → URL `https://mcp.porkbun.com/mcp` → sign in → choose **Full access** and tick **"allow API access for all domains"**.
   Each client costs us about **$11/year (.com) + $3/month hosting**. The first year is inside the $497. After that it's covered by the $49/month care plan.

## 3. Make = more operations for 200 leads a day
Make → Organization → **Subscription** → raise operations to **40,000 / month** (Core 40k, or Pro). The current 10,000 covers about 50–80 lead checks a day.

## 4. Gmail in Make = the emails to leads that have an email
1. Make → **Connections → Create a connection → Google (Gmail)**. Sign in with the DS Gmail.
2. On the pipeline page (https://claude.ai/artifact/UPBKzoPBPrA2rgMngANBjp → Emails tab), type your **mailing address**. US law puts it on every sales email; a PO box works.

## 5. Start the autopilot
Connectors are read when a Claude session starts, so after steps 1–2 open a **new Claude Code session** on this repository and paste:

> Read docs/sales/autopilot.md and take over the DS Autopilot: re-point every routine to this session, set up Stripe and Porkbun, and run the first day.

That session takes over every routine: the daily leads, the 3 posts a day, payments and delivery, the weekly inspiration agent and POV Studio.

## What stays yours
- Sending the DMs from the pipeline page (≤ 25 a day; copy → open Instagram → paste → "I sent it"). Stop if Instagram shows any warning.
- Answering when a business replies. Paste the reply to Claude, or tell it "they said yes", and it sends the payment link and does the rest.
- Saying yes to anything that costs more than the limits above.
