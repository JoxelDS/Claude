# DS Marketing — websites for Miami small businesses

Goal: sell websites through @dsmarketing.agency. First target: $1,000 = two Quick Starts ($500) or one Growth Site ($1,000).

## The offer

| | Quick Start Website | Growth Site | Premium Site | Care plan |
|---|---|---|---|---|
| Price | **$500** one time | **$1,000** one time | **$1,500** one time | **$49/mo** |
| Live in | 48 hours after we get their info | 5 days | agreed per project | ongoing |
| What | One-page mobile-first site · their own domain connected · Call / Instagram / Directions buttons · Google-ready basics (titles, map, fast load) · 1 round of changes | Everything in Quick Start + booking, ordering or lead capture wired in (their Square / Vagaro / Booksy / Toast / DoorDash link or a lead form) · up to 5 pages · menu or services with prices · gallery · Google Business Profile setup · 2 rounds of changes | Full build with automations (lead / order notifications, email flows) and ongoing updates | Hosting, updates, small text / photo / price edits each month |
| Payment | 100% up front (Stripe link) | 100% up front (Stripe link) | 100% up front (Stripe link) | monthly |

- Domain: about $12–15 a year, registered **in the client's name** (Porkbun, Namecheap or Cloudflare). We set it up on a screen share or with their login. They own it.
- Hosting: free static hosting (Netlify or Cloudflare Pages) under DS's account. What Care covers is ONE list, in "Care plan terms" below — never describe it any other way.
- Payment: Stripe Payment Links on Joxel's account (joxelbusinessllc) — one link per product (Quick Start $500 · Growth $1,000 · Premium $1,500); add `?client_reference_id=<slug>` so the payment matches the preview. The 2026-10-09 link https://buy.stripe.com/4gM3cv5PI9XyfFh3DC1oI00 bundles all three ($3,000) — never send it. Never take card numbers in a DM.


## Care plan terms — shown next to EVERY Care link (Stripe page, DMs, emails). Draft: Joxel fills the [brackets] once, then the same words go everywhere.
> **Care plan: $49 per month.** Your card is charged today and on the same date every month until you cancel. No minimum term. Includes: [the exact list, e.g. hosting, domain renewal, menu / hours / photo updates when you text us]. Cancel anytime at [the Stripe customer-portal link] or by replying CANCEL to any email from us; cancelling stops the next charge [and the current month is not refunded]. [What happens to the site and the domain after cancelling.]
>
> **Plan Care: $49 al mes.** Se cobra hoy y el mismo día cada mes hasta que cancele. Sin plazo mínimo. Incluye: [lista exacta]. Cancele cuando quiera en [enlace del portal de Stripe] o respondiendo CANCELAR a cualquier correo nuestro; al cancelar se detiene el próximo cobro [y el mes en curso no se reembolsa]. [Qué pasa con el sitio y el dominio si cancela.]

Stripe settings for the Care Payment Link: a required, unchecked terms box with the text "I agree to be charged $49 every month until I cancel." / "Acepto que se me cobren $49 cada mes hasta que cancele."; the text above as the custom text next to the button; the no-code customer portal turned on, its link in the receipt and the confirmation message. Until Joxel fills the brackets and turns these on, the Care link is not sent to anyone.

## How a deal happens

1. **Find**: Miami business with an active Instagram and no website (only a Linktree, a DoorDash / Square page, or nothing).
2. **Build a free preview**: `node tools/ds/site.mjs leads.json --out public/p` (v2; art direction per lead in `tools/ds/site-art.json`: display font, divider motif, hero photo) → `https://joxelds.github.io/Claude/p/<slug>/`. It uses only facts from their public profile; the niche sample photos (`food-1.jpg` …) are never credited as theirs and never go in the hero; the footer says it is not their official site.
3. **DM from @dsmarketing.agency** (Joxel sends by hand; cold DMs cannot be automated). Short, their name, the link, one question.
4. **Reply in under 10 minutes** while they're warm. Answers below.
5. **Close**: send the payment link + the 6 questions (below). 48 h starts when both are in.
6. **Deliver**: real photos, their words, their domain. Then offer Pro or the Care plan.

## DM 1 (with the preview)

> Hey {first name or business}! I'm Joxel from DS Marketing in Miami. I saw you don't have a website yet, so I made you a free preview: {PREVIEW_URL}
> It's yours if you want it: live on your own domain in 48 hours for $500. Want me to put your real photos and menu on it?

Spanish:

> ¡Hola {nombre}! Soy Joxel de DS Marketing en Miami. Vi que todavía no tienen página web y les hice una vista previa gratis: {PREVIEW_URL}
> Si les gusta, la ponemos en vivo con su propio dominio en 48 horas por $500. ¿Quieren que le ponga sus fotos y su menú?

Rules: send between 10 am and 7 pm, max 25 cold DMs a day from a fresh-ish account (IG limits), never copy-paste the same text 25 times in a row — change the first line per business.

## Follow-ups

- **+24 h, no reply**: "Did the link open OK? I can send a screenshot if it's easier 🙂"
- **+3 days, no reply**: "Last one from me: I'll keep the preview up till Friday. If you want it live, just reply YES and I'll send the 6 questions."
- Seen but no reply twice → stop. Mark "no" in the pipeline.

## Answers to what they'll say

| They say | You answer |
|---|---|
| "How much?" | "$500 one time, live in 48 hours on your own domain. Domain is about $15 a year and it's in your name. No monthly fee unless you add the Care plan ($49/mo, cancel anytime — terms below)." |
| "I already have Instagram" | "Instagram is great for people who already follow you. Google sends people who are searching right now, 'tacos near me', and they want a site with your hours, menu and a button to call. This is that page." |
| "Too expensive" | "Totally fair. One or two new customers from Google usually pays for it. If timing is the issue, I can split it in two payments of $250." (Keep the price; offer the split, not a discount.) |
| "Send me more info" | Send story 2 (`docs/social/ds/website-offer-story2.png`) + "The fastest way to see it is the preview: {PREVIEW_URL}. Want it live?" |
| "Who are you?" | "DS Marketing, a small Miami agency. Our work: dsmarketing.company/portfolio. Happy to jump on a 5-minute call." |
| "Do you do logos / ads / reels?" | "Yes. Let's get the site live first and I'll send you options." (Upsell later.) |
| "YES" / "Let's do it" | Close below. |

## Close

> Amazing 🙌 Here's the payment link: {PAY_LINK}. Once it's in, send me:
> 1. Your logo (or say "no logo")
> 2. 6–10 photos you like
> 3. Hours and address
> 4. Menu / services with prices
> 5. The domain you'd like (e.g. elborimiami.com) — I'll check it's free
> 6. Booking / ordering link if you have one
> Your 48 hours start when I have these.

## Upsells (at delivery, when they're happiest)

1. **Growth $1,000** (credit the $500 if they upgrade within 14 days → $500 more).
2. **Care $49/mo**: say it with the full "Care plan terms" text below (monthly, renews until cancelled, how to cancel).
3. **Google Business Profile tune-up $150** (photos, categories, hours, link to the site).
4. Later: Reels / ads packages from DS.

## Money math for the first $1,000

- 30 good leads → 30 DMs with previews → ~25% open and reply (7–8) → ~25–30% of replies buy (2) = **$994**.
- That's a realistic pace for a few days, not a guarantee for tomorrow. Faster: reply within minutes, call when they're warm, and post the offer stories daily so inbound DMs come in too.

## Content that brings inbound DMs

- Story 1: `docs/social/ds/website-offer-story1.png` (offer + previews).
- Story 2: `docs/social/ds/website-offer-story2.png` (Starter vs Pro).
- Post: `docs/social/ds/website-offer-post.png`, caption below.
- The call to action is always DM "WEBSITE" (no link in bio).
- When someone DMs "WEBSITE": ask for their Instagram or business name → build their preview the same day → send it.

Post caption:

> No website? We build it in 48 hours. 🖥️📱
> A real site on your own domain: mobile-first, fast, with buttons to call you, see your Instagram and get directions.
> 💸 $500, one time. We make you a free preview first, so you only pay if you love it.
> DM "WEBSITE" and we'll send yours.
> ·
> ¿No tienes página web? Te la hacemos en 48 horas. Vista previa gratis primero. Escríbenos "WEBSITE".
> ·
> #miamismallbusiness #miamibusiness #webdesignmiami #miamifood #miamibarber #miamientrepreneur #smallbusinessmiami #websitedesign #dsmarketing
