# The App Review screen recording — what to tap (≈ 4 minutes)

Apple wants:
- a recording made on a real iPhone running the latest iOS;
- that starts with launching the app;
- that shows sign-up, sign-in, account deletion, reporting / blocking, and the typical use.

Record it with the **TestFlight build 1.0 (2)**. The fixes are not in build 1. See `build-and-upload.md`.

**Before you start**
- Settings → Control Center: make sure **Screen Recording** is there.
- Delete the old SDX Inspect app from the phone (long press → Remove App). This way the recording really starts from the first launch.
- Install build 1.0 (2) from TestFlight.
- Have the demo admin badge ready (Claude gave it to you in the chat).
- Do it in one go. If something goes wrong, stop and start again.

## Steps

1. Swipe down from the top-right corner → tap **Screen Recording** (wait for 3‑2‑1) → swipe the panel away.
2. On the Home Screen, tap **SDX Inspect**. Wait for the sign-in screen.
3. **Sign in with the demo badge:**
   - Type **448800** → Sign In.
   - If it says "448800 is the demo badge", tap **Open the demo** and type 448800 → Sign In again.
4. **Inspection, about 1 minute:**
   - Pick **Regular** → tap **Tap here — I'm on site**.
   - Search **BURGER BASE** → tap it.
   - Open one checklist item → tap **✕** on one row → type "grease under the fryer".
   - Tap **🔴 BEFORE** → take a photo → tap **Finish & Save** → **Save anyway** if it asks.
5. Tap **🔁** (Follow-ups) at the top. Show the BURGER BASE cards and scroll a little.
6. **Report a comment:**
   - On the BURGER BASE card, find the crew comment "Coming after the lunch rush…" → tap **⚑ Report**.
   - Pick **Not about the work** → tick **Also block Demo Cleaning** → **Send report** → **OK**.
   - The comment now says "Hidden — you reported this".
7. **Report a photo:**
   - Tap a photo on a card → tap **⚑ Report this photo** → pick a reason → **Send report** → **OK**.
   - Tap outside the photo to close it.
8. Open **☰** → **My account · reports · delete**. Show **My reports** (both say Waiting) and **Blocked people**, then close it with ✕.
9. **Sign out:** ☰ → **Lock App** → **Yes, Lock**.
10. **The admin reviews the reports:**
    - Sign in with the **demo admin badge** → ☰ → **Admin Panel**.
    - Show **⚑ Reported content**.
    - On the comment: type a note ("Comments are for the job") → **Remove for everyone**.
    - On the photo → **Keep it**.
    - Tap **Done** to show both summaries.
11. ☰ → **Lock App** → **Yes, Lock**.
12. **Create a new account:**
    - Tap **New here? Request access**.
    - Badge: any new number (e.g. 246810). Name: "Review Tester". Leave Inspector.
    - Tap **Create my account**. You are signed in right away.
13. **Delete that account:**
    - ☰ → **My account · reports · delete** → **Delete my account**.
    - Type **DELETE** → **Delete forever**.
    - You are back on the sign-in screen, which says "Your account was deleted".
14. Type the same badge (246810) → Sign In. It says "This account was deleted…".
15. Stop the recording: tap the red pill at the top → Stop.

The video is saved in Photos. In App Store Connect, reply to App Review and attach the video (it accepts .mov / .mp4). If the file is too big, trim the waiting parts in Photos → Edit.

**Reviewer flows to mention (already in the notes):**
- the crew boards (777002 / 777001);
- the stand QR page (link in the notes, no account).
