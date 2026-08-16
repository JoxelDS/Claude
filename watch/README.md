# SDX Inspect — Apple Watch app

SwiftUI companion app: today's inspection count, pass rate, and the 10 most
recent inspections with pass/fail colors. Reads the same cloud database as the
main app (read-only, Firestore REST).

## Add it to the Xcode project

1. Open `ios/App/App.xcodeproj` in Xcode.
2. **File → New → Target…** → watchOS tab → **App** → Next.
   - Product Name: `SDXWatch`
   - Interface: SwiftUI · Language: Swift
   - Check **"Watch App for Existing iOS App"** and pick the `App` target.
3. Xcode creates a `SDXWatch` folder with starter files. Replace the contents of
   its `SDXWatchApp.swift` / `ContentView.swift` with the files in
   `watch/SDXWatch/` (drag all three .swift files in, remove the generated
   ContentView).
4. Select the `SDXWatch` scheme + a watch simulator → Run.
5. To ship: bump the iOS Build number and Archive as usual — the watch app is
   embedded in the same upload and appears on the App Store listing
   automatically.

## Notes

- Notifications from the iPhone app mirror to the watch automatically — no code
  needed (ships with the Build that includes the LocalNotifications plugin).
- The watch app is read-only v1. Next steps when wanted: follow-ups list,
  complication showing today's count, and a "start inspection timer" button
  that hands off to the iPhone.
