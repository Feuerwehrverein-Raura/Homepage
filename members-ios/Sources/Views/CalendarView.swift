import SwiftUI

/// Kalender aus `GET calendar/items` als Monatsraster — Gegenstück zur
/// Monatsansicht der Android-App, dort mit einer Fremdbibliothek gebaut.
///
/// Hier von Hand mit `Calendar` und einem `LazyVGrid`: das Raster ist
/// überschaubar, und eine Abhängigkeit weniger ist eine Abhängigkeit weniger,
/// die bei einem iOS-Wechsel nachgezogen werden muss.
struct CalendarView: View {
    @EnvironmentObject var auth: AuthManager
    @State private var items: [CalendarItem] = []
    @State private var loading = true
    @State private var error: String?
    @State private var month = Date()
    @State private var selectedKey: String?

    /// Wochenbeginn Montag, wie hierzulande üblich — `Calendar.current`
    /// richtet sich nach der Systemsprache und könnte auf Sonntag stehen.
    private var calendar: Calendar {
        var cal = Calendar(identifier: .gregorian)
        cal.firstWeekday = 2
        return cal
    }

    private let weekdays = ["Mo", "Di", "Mi", "Do", "Fr", "Sa", "So"]

    var body: some View {
        VStack(spacing: 0) {
            header
            weekdayRow
            grid
            Divider()
            dayList
        }
        .task { await load() }
        .refreshable { await load() }
    }

    // MARK: Kopf

    private var header: some View {
        HStack {
            Button {
                shiftMonth(-1)
            } label: {
                Image(systemName: "chevron.left")
            }
            Spacer()
            Text(DateFormat.monthYear(key(for: month)))
                .font(.headline)
            Spacer()
            Button {
                shiftMonth(1)
            } label: {
                Image(systemName: "chevron.right")
            }
        }
        .padding(.horizontal)
        .padding(.vertical, 8)
        .overlay(alignment: .trailing) {
            if loading {
                ProgressView().padding(.trailing, 44)
            }
        }
    }

    private var weekdayRow: some View {
        HStack(spacing: 0) {
            ForEach(weekdays, id: \.self) { day in
                Text(day)
                    .font(.caption2.weight(.semibold))
                    .foregroundStyle(.secondary)
                    .frame(maxWidth: .infinity)
            }
        }
        .padding(.bottom, 4)
    }

    private var grid: some View {
        LazyVGrid(columns: Array(repeating: GridItem(.flexible(), spacing: 2), count: 7),
                  spacing: 2) {
            ForEach(Array(monthCells.enumerated()), id: \.offset) { _, day in
                if let day {
                    DayCell(
                        day: calendar.component(.day, from: day),
                        types: types(on: key(for: day)),
                        isToday: calendar.isDateInToday(day),
                        isSelected: selectedKey == key(for: day)
                    )
                    .contentShape(Rectangle())
                    .onTapGesture {
                        let k = key(for: day)
                        selectedKey = (selectedKey == k) ? nil : k
                    }
                } else {
                    Color.clear.frame(height: 40)
                }
            }
        }
        .padding(.horizontal, 8)
    }

    // MARK: Liste unter dem Raster

    private var dayList: some View {
        Group {
            if let error {
                info(error, systemImage: "exclamationmark.triangle")
            } else if visibleItems.isEmpty {
                info(selectedKey == nil ? "Keine Einträge in diesem Monat."
                                        : "Keine Einträge an diesem Tag.",
                     systemImage: "calendar")
            } else {
                List(visibleItems) { item in
                    CalendarRow(item: item)
                }
                .listStyle(.plain)
            }
        }
    }

    private func info(_ text: String, systemImage: String) -> some View {
        VStack(spacing: 8) {
            Image(systemName: systemImage).font(.title2).foregroundStyle(.secondary)
            Text(text).font(.footnote).foregroundStyle(.secondary)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
    }

    /// Ausgewählter Tag, sonst der ganze Monat.
    private var visibleItems: [CalendarItem] {
        if let selectedKey {
            return items.filter { $0.date.hasPrefix(selectedKey) }
        }
        let monthKey = String(key(for: month).prefix(7))
        return items.filter { $0.date.hasPrefix(monthKey) }
    }

    // MARK: Raster-Berechnung

    private var monthCells: [Date?] {
        let cal = calendar
        guard let first = cal.date(from: cal.dateComponents([.year, .month], from: month)),
              let range = cal.range(of: .day, in: .month, for: first) else { return [] }
        // Wie viele Leerfelder vor dem Ersten stehen, haengt am Wochenbeginn.
        let weekday = cal.component(.weekday, from: first)
        let leading = (weekday - cal.firstWeekday + 7) % 7
        var cells: [Date?] = Array(repeating: nil, count: leading)
        for offset in range {
            cells.append(cal.date(byAdding: .day, value: offset - 1, to: first))
        }
        return cells
    }

    /// Tagesschlüssel "JJJJ-MM-TT". Der Abgleich läuft über Zeichenketten,
    /// nicht über `Date`: die Backend-Werte sind ISO-Präfixe ohne Zeitzone,
    /// und ein Vergleich als Zeitpunkt würde je nach Zone einen Tag daneben
    /// liegen.
    private func key(for date: Date) -> String {
        let c = calendar.dateComponents([.year, .month, .day], from: date)
        return String(format: "%04d-%02d-%02d", c.year ?? 0, c.month ?? 0, c.day ?? 0)
    }

    private func types(on key: String) -> [String] {
        items.filter { $0.date.hasPrefix(key) }.map(\.type)
    }

    private func shiftMonth(_ delta: Int) {
        if let next = calendar.date(byAdding: .month, value: delta, to: month) {
            month = next
            selectedKey = nil
        }
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

/// Ein Tag im Raster: Zahl, darunter bis zu drei Punkte für die Arten der
/// Einträge an diesem Tag.
private struct DayCell: View {
    let day: Int
    let types: [String]
    let isToday: Bool
    let isSelected: Bool

    var body: some View {
        VStack(spacing: 3) {
            Text("\(day)")
                .font(.callout)
                .fontWeight(isToday ? .bold : .regular)
                .foregroundStyle(isSelected ? Color.white
                                 : (isToday ? Color.accentColor : Color.primary))
                .frame(width: 28, height: 28)
                .background {
                    if isSelected {
                        Circle().fill(Color.accentColor)
                    } else if isToday {
                        Circle().stroke(Color.accentColor, lineWidth: 1)
                    }
                }

            HStack(spacing: 2) {
                ForEach(Array(types.prefix(3).enumerated()), id: \.offset) { _, type in
                    Circle()
                        .fill(CalendarAppearance.color(for: type))
                        .frame(width: 5, height: 5)
                }
            }
            .frame(height: 5)
        }
        .frame(height: 44)
    }
}

/// Symbol und Farbe je Eintragsart — dieselben Werte, die das Backend in
/// `type` liefert.
enum CalendarAppearance {
    static func color(for type: String) -> Color {
        switch type {
        case "event": return .accentColor
        case "board_meeting": return .purple
        case "fee_due": return .orange
        case "fee_paid": return .green
        case "letter": return .brown
        case "email": return .blue
        default: return .secondary
        }
    }

    static func symbol(for type: String) -> String {
        switch type {
        case "event": return "calendar"
        case "board_meeting": return "person.3"
        case "fee_due": return "banknote"
        case "fee_paid": return "checkmark.seal"
        case "letter": return "envelope"
        case "email": return "paperplane"
        default: return "circle"
        }
    }
}

private struct CalendarRow: View {
    let item: CalendarItem

    var body: some View {
        HStack(alignment: .top, spacing: 12) {
            Image(systemName: CalendarAppearance.symbol(for: item.type))
                .foregroundStyle(CalendarAppearance.color(for: item.type))
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
