import SwiftUI

/// Kalender aus `GET calendar/items` — Anlässe, Beiträge und Versände in
/// einer Liste, nach Monat gruppiert.
///
/// Die Android-App zeigt dafür ein Monatsraster mit einer Fremdbibliothek.
/// Hier steht dieselbe Datenlage als gruppierte Liste: auf einem Telefon
/// besser lesbar, und ohne Abhängigkeit, die gepflegt werden müsste.
struct CalendarView: View {
    @EnvironmentObject var auth: AuthManager
    @State private var items: [CalendarItem] = []
    @State private var loading = true
    @State private var error: String?

    var body: some View {
        Group {
            if loading {
                ProgressView().frame(maxWidth: .infinity, maxHeight: .infinity)
            } else if let error {
                message(error, systemImage: "exclamationmark.triangle")
            } else if items.isEmpty {
                message("Keine Einträge.", systemImage: "calendar")
            } else {
                List {
                    ForEach(groups, id: \.key) { group in
                        Section(group.key) {
                            ForEach(group.items) { item in
                                CalendarRow(item: item)
                            }
                        }
                    }
                }
                .listStyle(.plain)
            }
        }
        .task { await load() }
        .refreshable { await load() }
    }

    /// Nach Monat gruppiert, in der Reihenfolge, die das Backend liefert.
    private var groups: [(key: String, items: [CalendarItem])] {
        var order: [String] = []
        var buckets: [String: [CalendarItem]] = [:]
        for item in items {
            let key = DateFormat.monthYear(item.date)
            if buckets[key] == nil {
                buckets[key] = []
                order.append(key)
            }
            buckets[key]?.append(item)
        }
        return order.map { ($0, buckets[$0] ?? []) }
    }

    private func message(_ text: String, systemImage: String) -> some View {
        VStack(spacing: 12) {
            Image(systemName: systemImage).font(.largeTitle).foregroundStyle(.secondary)
            Text(text).foregroundStyle(.secondary)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
    }

    private func load() async {
        loading = true
        error = nil
        do {
            items = try await auth.api().get("calendar/items")
        } catch {
            self.error = "Kalender konnte nicht geladen werden."
        }
        loading = false
    }
}

private struct CalendarRow: View {
    let item: CalendarItem

    /// Symbol und Farbe je Eintragsart — dieselben Typen, die das Backend
    /// in `type` liefert.
    private var appearance: (String, Color) {
        switch item.type {
        case "event": return ("calendar", .accentColor)
        case "board_meeting": return ("person.3", .purple)
        case "fee_due": return ("banknote", .orange)
        case "fee_paid": return ("checkmark.seal", .green)
        case "letter": return ("envelope", .brown)
        case "email": return ("paperplane", .blue)
        default: return ("circle", .secondary)
        }
    }

    var body: some View {
        HStack(alignment: .top, spacing: 12) {
            Image(systemName: appearance.0)
                .foregroundStyle(appearance.1)
                .frame(width: 24)
            VStack(alignment: .leading, spacing: 2) {
                Text(item.title).font(.subheadline.weight(.medium))
                if let subtitle = item.subtitle, !subtitle.isEmpty {
                    Text(subtitle).font(.caption).foregroundStyle(.secondary)
                }
                Text(DateFormat.swiss(item.date))
                    .font(.caption2)
                    .foregroundStyle(.secondary)
            }
        }
        .padding(.vertical, 2)
    }
}
