// Watch dashboard: today's activity + recent inspections at a glance.
import SwiftUI

struct DashboardView: View {
    @StateObject private var store = InspectionStore()

    var body: some View {
        NavigationStack {
            List {
                Section {
                    HStack {
                        StatTile(value: "\(store.todayCount)", label: "Today")
                        StatTile(value: store.passRate.map { "\($0)%" } ?? "—", label: "Pass rate")
                    }
                    .listRowBackground(Color.clear)
                }

                if let err = store.errorText {
                    Text(err)
                        .font(.footnote)
                        .foregroundStyle(.secondary)
                }

                Section("Recent") {
                    ForEach(store.inspections.prefix(10)) { insp in
                        HStack(spacing: 6) {
                            Circle()
                                .fill(insp.passed ? Color.green : Color.red)
                                .frame(width: 8, height: 8)
                            VStack(alignment: .leading, spacing: 1) {
                                Text(insp.siteName)
                                    .font(.footnote.weight(.semibold))
                                    .lineLimit(1)
                                HStack(spacing: 4) {
                                    Text(insp.status)
                                        .font(.caption2)
                                        .foregroundStyle(insp.passed ? .green : .red)
                                    if let s = insp.scorePct {
                                        Text("· \(s)%")
                                            .font(.caption2)
                                            .foregroundStyle(.secondary)
                                    }
                                }
                            }
                        }
                    }
                }
            }
            .navigationTitle("SDX Inspect")
            .refreshable { await store.refresh() }
            .task { await store.refresh() }
            .overlay {
                if store.loading && store.inspections.isEmpty {
                    ProgressView()
                }
            }
        }
    }
}

private struct StatTile: View {
    let value: String
    let label: String
    var body: some View {
        VStack(spacing: 2) {
            Text(value).font(.title3.weight(.bold))
            Text(label).font(.caption2).foregroundStyle(.secondary)
        }
        .frame(maxWidth: .infinity)
        .padding(.vertical, 6)
        .background(.quaternary, in: RoundedRectangle(cornerRadius: 10))
    }
}

#Preview { DashboardView() }
