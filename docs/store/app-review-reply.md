# App Review — reply to "Guideline 2.1, Information Needed"

How to use this file:

1. In App Store Connect, open the message from App Review and choose **Reply**.
2. Paste **Part A** into the reply and attach the screen recording (see `review-recording.md`).
3. Paste **Part B** into **App Review Information → Notes**.
4. Fill **Sign-In Information** as shown in Part B.

The demo admin badge is not written here, because this file is public. Joxel has it.

---

## Part A — the reply

Hello, and thank you for the review. Here is the information you asked for. The screen recording is attached. It was made on an iPhone running the latest iOS with build 1.0 (2), and starts at app launch.

**1. Screen recording**

The recording shows, in order:
- launching the app;
- creating an account (Request access);
- the main inspection flow: pick the inspection type, pick a stand, mark a problem with a photo, save the report;
- Follow-ups;
- reporting another person's comment and blocking that person;
- the admin's "Reported content" review;
- deleting the account: ☰ → My account → Delete my account. The badge is refused afterwards.

**2. What the app is for and who uses it**

SDX Inspect is a food-safety inspection and follow-up app for food-service venues: stadium and arena food stands, campuses, hotels and commercial kitchens.

- **Inspectors** walk each stand with a checklist, record temperatures, and flag problems with a BEFORE photo.
- **Maintenance and cleaning crews** get each problem on their phone and send back an AFTER photo when it is fixed.
- **Stand supervisors** scan the QR poster at their stand to log temperatures.

The problem it solves: findings written on paper or sent in text messages get lost, and nobody can prove a problem was fixed. The app keeps one record per stand, from the problem to the proof of the fix.

**3. How to access the main features**

Use the demo venue. It has made-up stands, people and reports; no real business data.

- **Inspector:** tap Sign In, type badge **448800**, tap Sign In. If the screen says "448800 is the demo badge", tap **Open the demo**.
- **New account (registration):** on the demo venue, tap **New here? Request access**, type any badge number (at least 3 digits) and a name, then tap **Create my account**. On the demo the account opens right away. On a real venue an administrator approves it.
- **Delete the account:** ☰ (top right) → **My account · reports · delete** → **Delete my account** → type DELETE → **Delete forever**.
- **Admin** (sees Admin → Reported content): badge **[DEMO ADMIN BADGE — given in the Notes field]**.
- **Cleaning crew:** badge **777002**. **Maintenance crew:** badge **777001**.
- **Stand team** (no account, the page a stand's QR poster opens): https://joxelds.github.io/Claude/?v=riverside-demo&haccp=1&site=BURGER+BASE&unit=101&loctype=Concession

**User-generated content**

Photos, comments, messages and announcements are posted only by members of a venue's team. Every one of them posted by someone else has **⚑ Report**; for a photo, open it full size and tap "⚑ Report this photo".

- **When something is reported:** it is hidden for the reporter at once. The reporter can also **block** the person who posted it, which hides everything from that person on their phone.
- **Admin review:** the venue's administrator is notified and reviews each report in **Admin Panel → Reported content**. The admin can remove it for everyone or keep it, with a note.
- **Outcome:** the reporter gets a notification with a summary of what was done, and so does the author when a post is removed. The summary is also kept in ☰ → My account → My reports.
- **Removing a person:** admins can remove a person's access from the team list.
- **Rules and contact:** the Terms of Use ban objectionable content. The Support page gives a contact address.

**4. External services**

- Google Firebase: Cloud Firestore (database), Cloud Storage (photos), Firebase Cloud Messaging with Apple Push Notification service (alerts).
- The Google Translate web widget, used only when someone picks another language with the language button.

There is no payment processor, AI service, advertising, analytics or tracking SDK, and no third-party sign-in.

**5. Regions**

The app works the same in every region. It is built for U.S. food-service rules: temperatures in °F and the U.S. FDA Food Code. It is available in English, plus Spanish and Haitian Creole on the stand and crew screens.

**6. Regulated industry / third-party material**

SDX Inspect is a record-keeping tool. It does not issue licenses, permits or certifications, and it is not a government inspection. Its food-safety reference uses the public U.S. FDA Food Code. It contains no protected third-party material.

**About in-app purchase and business use**

The app has no purchases and no paid content. All features are free to use. Venues that adopt it sign a service agreement with us outside the app, for their own staff.

It is not built for one company. Any food-service business can use it: the demo needs no account, and a new venue sets itself up in the app (team, stands, QR posters, equipment stickers).

Privacy: https://joxelds.github.io/Claude/privacy.html · Terms: https://joxelds.github.io/Claude/terms.html · Support: https://joxelds.github.io/Claude/support.html

Thank you!

---

## Part B — App Review Information

**Sign-In Information**
- Sign-in required: **Yes**
- User name: **448800**
- Password: **448800**

  The app signs in with a badge number only and has no password. The note below says so.

**Notes** (paste; replace the admin badge):

```
SDX Inspect signs in with a work badge number only (no password). Use the public demo venue (made-up data):

• Inspector: type badge 448800 → Sign In. If it says "448800 is the demo badge", tap "Open the demo", then sign in again.
• Admin (Admin Panel → Reported content): badge [DEMO ADMIN BADGE]
• Cleaning crew: 777002 · Maintenance crew: 777001
• Registration: on the demo, "New here? Request access" → any badge (3+ digits) + a name → "Create my account" (opens at once on the demo; on real venues an admin approves it).
• Account deletion: ☰ → "My account · reports · delete" → "Delete my account" → type DELETE → "Delete forever". The badge is refused afterwards.
• Report / block: "⚑ Report" next to any comment, message or announcement someone else posted; open a photo full size → "⚑ Report this photo". "Also block" hides that person's posts. The admin reviews in Admin Panel → Reported content; the reporter is notified with a summary of what was done.
• Stand team (no account, what a stand's QR poster opens): https://joxelds.github.io/Claude/?v=riverside-demo&haccp=1&site=BURGER+BASE&unit=101&loctype=Concession

Services: Google Firebase (Firestore, Cloud Storage, Cloud Messaging/APNs) and the optional Google Translate web widget. No in-app purchases, ads, tracking or AI services. Works the same in all regions (U.S. food code, °F; English, Spanish, Haitian Creole).
Privacy https://joxelds.github.io/Claude/privacy.html · Terms https://joxelds.github.io/Claude/terms.html · Support https://joxelds.github.io/Claude/support.html
```

**Contact information**: Joxel's name, phone and email (as already entered).

---

## If Apple answers with Guideline 3.2 ("for specific businesses")

Reply that the app is offered to any food-service business, with a public demo and self-serve venue setup.

If they still insist: App Store Connect → the app → **Distribution → App Distribution Methods → Unlisted**. Request it with this text:

> "SDX Inspect is used by food-service venues that receive a link from us; it is not intended for the general public to discover."

The app stays the same; only the store page is hidden from search.
