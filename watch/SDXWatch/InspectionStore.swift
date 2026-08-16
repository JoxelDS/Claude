// Reads recent inspections from the SDX Inspect cloud database
// (Firestore REST API — read-only, same data the main app shows).
import Foundation

struct Inspection: Identifiable {
    let id: String
    let siteName: String
    let status: String       // "Pass" / "Fail" / etc.
    let scorePct: Int?       // 0-100 when available
    let savedAt: Date?

    var passed: Bool { status.lowercased() == "pass" }
}

@MainActor
final class InspectionStore: ObservableObject {
    @Published var inspections: [Inspection] = []
    @Published var loading = false
    @Published var errorText: String?

    private let projectId = "sodexoinspection"

    var todayCount: Int {
        let cal = Calendar.current
        return inspections.filter { $0.savedAt.map { cal.isDateInToday($0) } ?? false }.count
    }

    var passRate: Int? {
        guard !inspections.isEmpty else { return nil }
        let passes = inspections.filter { $0.passed }.count
        return Int((Double(passes) / Double(inspections.count)) * 100)
    }

    func refresh() async {
        loading = true
        errorText = nil
        defer { loading = false }

        // Firestore REST structured query: newest 25 inspections
        let url = URL(string: "https://firestore.googleapis.com/v1/projects/\(projectId)/databases/(default)/documents:runQuery")!
        var req = URLRequest(url: url)
        req.httpMethod = "POST"
        req.setValue("application/json", forHTTPHeaderField: "Content-Type")
        req.httpBody = try? JSONSerialization.data(withJSONObject: [
            "structuredQuery": [
                "from": [["collectionId": "inspections"]],
                "orderBy": [["field": ["fieldPath": "savedAt"], "direction": "DESCENDING"]],
                "limit": 25,
            ],
        ])

        do {
            let (data, _) = try await URLSession.shared.data(for: req)
            guard let rows = try JSONSerialization.jsonObject(with: data) as? [[String: Any]] else {
                throw URLError(.cannotParseResponse)
            }
            let iso = ISO8601DateFormatter()
            iso.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
            let isoPlain = ISO8601DateFormatter()

            self.inspections = rows.compactMap { row in
                guard let doc = row["document"] as? [String: Any],
                      let name = doc["name"] as? String,
                      let fields = doc["fields"] as? [String: Any] else { return nil }
                func str(_ key: String) -> String? {
                    (fields[key] as? [String: Any])?["stringValue"] as? String
                }
                func num(_ key: String) -> Int? {
                    if let s = (fields[key] as? [String: Any])?["integerValue"] as? String { return Int(s) }
                    if let d = (fields[key] as? [String: Any])?["doubleValue"] as? Double { return Int(d) }
                    return nil
                }
                let savedAtStr = str("savedAt") ?? ""
                let savedAt = iso.date(from: savedAtStr) ?? isoPlain.date(from: savedAtStr)
                return Inspection(
                    id: String(name.split(separator: "/").last ?? ""),
                    siteName: str("siteName") ?? str("location") ?? "Inspection",
                    status: str("overallStatus") ?? "—",
                    scorePct: num("scorePct") ?? num("compliancePct"),
                    savedAt: savedAt
                )
            }
        } catch {
            self.errorText = "Couldn't reach the cloud. Pull down to retry."
        }
    }
}
