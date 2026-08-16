// SDX Inspect — Apple Watch companion app
// Add via Xcode: File → New → Target → watchOS → App ("SDXWatch"),
// then replace the generated files with the ones in this folder.
import SwiftUI

@main
struct SDXWatchApp: App {
    var body: some Scene {
        WindowGroup {
            DashboardView()
        }
    }
}
