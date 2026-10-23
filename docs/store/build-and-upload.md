# Build 1.0 (2) for the App Store — with account deletion, report / block and the camera permission

Why a new build is needed:
- The iPhone app carries its own copy of SDX Inspect. Website updates do not reach it; only a new build does.
- Build 1 has no account deletion and no report / block, and Apple asked for both.
- Build 1 has no camera and photo-library permission text in `Info.plist`, so iOS closes the app the first time someone taps 📷 or Scan. Build 2 fixes this.

What changed for the app in this repo (version v570):
- ☰ → My account (My reports, Blocked people, Privacy · Terms · Support, Delete my account).
- ⚑ Report + block on comments, messages, announcements and photos.
- Admin Panel → Reported content.
- Instant sign-up on the demo venue.
- `Info.plist`: camera + photo-library texts and "no non-exempt encryption", so the export question isn't asked each upload.
- `capacitor.config.json`: the public website no longer opens inside the app, so Privacy / Terms / Support open in Safari and the app stays as it was.
- Build number 2.

## A. With Xcode Cloud (the repo has `ios/App/ci_scripts/ci_post_clone.sh`)
1. App Store Connect → Apps → **SDX Inspect** → **Xcode Cloud** → your workflow → **Start Build** → branch **main**.
2. Wait for it to finish (about 15–25 min). The build lands in **TestFlight**. Xcode Cloud numbers the build by itself.
3. On your iPhone, open the **TestFlight** app and install the new build.
4. Record the review video (`review-recording.md`).
5. App Store Connect → the version waiting for review → **Build** → remove the old build → **+** → pick the new one.
6. Paste the notes (`app-review-reply.md`, Part B) → reply to App Review with Part A and the video → **Submit for Review** / **Resubmit**.

## B. On the Mac with Xcode
1. Terminal, in the project folder:
   ```bash
   git pull
   npm ci
   npm run build
   npx cap copy ios
   ```
   Use `cap copy`, not `cap sync`. Sync rewrites `CapApp-SPM/Package.swift` and un-vendors the plugins.
2. `open ios/App/App.xcodeproj`
3. In Xcode, select the **App** target → **Signing & Capabilities** → your Team.
   - Version **1.0**, Build **2**, already set in the project.
   - If Xcode says build 2 already exists, change it to 3.
4. Choose **Any iOS Device (arm64)** → **Product → Archive** → **Distribute App** → **App Store Connect** → **Upload**.
5. Wait for the email "has completed processing" → TestFlight → install it on the iPhone.
6. Then continue from step A4.

## Screenshots (Apple: "must show the app in use")
App Store Connect → the version → **Previews and Screenshots**:
- **iPhone 6.9" Display:** remove any sign-in / splash screenshots and drag in the 7 files from `docs/store/screenshots/iphone-69/` (1320 × 2868).
- **iPad 13" Display:** the 7 files from `docs/store/screenshots/ipad-13/` (2064 × 2752).

The order is the story: inspection → open problems with a BEFORE photo → Follow-ups → BEFORE / AFTER → the crew board → equipment temps → the stand's temperature log. They are all from the demo venue with made-up stands and people.

## Before you record: check on the iPhone
- **Camera:** 📷 BEFORE on a checklist row asks for camera permission (once) and takes a photo.
- **QR scanner:** 📷 Scan stand QR opens the camera.
- **Privacy link:** on the sign-in screen it opens in Safari. Come back to the app and it is still on the sign-in screen.
- **Demo:** badge 448800 → Open the demo → you are in.

## Android (Play Console), when you get there
- `android/app/build.gradle`: raise `versionCode` (1 → 2) before each upload.
- The camera permission is now declared in `AndroidManifest.xml`.
- Play's Data safety form needs the account-deletion web link: https://joxelds.github.io/Claude/support.html (section "Delete your account").
