import SwiftUI

/// Eigene Anmeldungen (`GET registrations/mine`) — inklusive der Schichten,
/// die das Backend gleich mitliefert.
struct MyRegistrationsView: View {
    @EnvironmentObject var auth: AuthManager
    @State private var registrations: [MyRegistration] = []
    @State private var loading = true
    @State private var error: String?

    var body: some View {
        Group {
            if loading {
                ProgressView().frame(maxWidth: .infinity, maxHeight: .infinity)
            } else if let error {
                message(error, systemImage: "exclamationmark.triangle")
            } else if registrations.isEmpty {
                message("Keine Anmeldungen.", systemImage: "checklist")
            } else {
                List(registrations) { registration in
                    RegistrationRow(registration: registration)
                }
                .listStyle(.plain)
            }
        }
        .navigationTitle("Meine Anmeldungen")
        .navigationBarTitleDisplayMode(.inline)
        .task { await load() }
        .refreshable { await load() }
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
            registrations = try await auth.api().get("registrations/mine")
        } catch {
            self.error = "Anmeldungen konnten nicht geladen werden."
        }
        loading = false
    }
}

private struct RegistrationRow: View {
    let registration: MyRegistration

    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            HStack(alignment: .firstTextBaseline) {
                Text(registration.eventTitle ?? "Anlass")
                    .font(.headline)
                Spacer()
                StatusBadge(status: registration.status)
            }

            HStack(spacing: 10) {
                if let date = registration.eventStartDate {
                    Label(DateFormat.swiss(date), systemImage: "calendar")
                }
                if let location = registration.eventLocation, !location.isEmpty {
                    Label(location, systemImage: "mappin.and.ellipse")
                }
            }
            .font(.caption)
            .foregroundStyle(.secondary)

            if let shifts = registration.shifts, !shifts.isEmpty {
                ForEach(shifts) { shift in
                    Label(shiftLabel(shift), systemImage: "clock")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                }
            }
        }
        .padding(.vertical, 4)
    }

    /// Baut "Bar – Schicht 1 · Sa 17.10. · 12:00 – 14:00".
    ///
    /// Vorher stand hier nur der Name und die Zeit. Bei der Chilbi ergab das
    /// viermal "Schicht 1 · 12:00 – 14:00" — Samstag und Sonntag, Bar und
    /// Kueche — und niemand wusste, wofuer er sich eingetragen hatte.
    private func shiftLabel(_ shift: RegistrationShift) -> String {
        let name = shift.name ?? "Schicht"
        let bereich = shift.bereich?.trimmingCharacters(in: .whitespaces)
        let lesbar: String? = {
            guard let b = bereich, !b.isEmpty, b != "Allgemein" else { return nil }
            return b == "Kueche" ? "Küche" : b
        }()
        let kopf = lesbar.map { "\($0) – \(name)" } ?? name

        var teile = [kopf]
        if let tag = kurzerTag(shift.date) { teile.append(tag) }
        switch (shift.startTime, shift.endTime) {
        case let (start?, end?): teile.append("\(start) – \(end)")
        case let (start?, nil): teile.append(start)
        default: break
        }
        return teile.joined(separator: " · ")
    }

    /// "2026-10-17" → "Sa 17.10."
    ///
    /// Aus den Bestandteilen gebaut, nicht per ISO8601DateFormatter: Ein
    /// reines Datum wird sonst als UTC gelesen und rutscht bei uns auf den
    /// Vortag.
    private func kurzerTag(_ iso: String?) -> String? {
        guard let iso, iso.count >= 10 else { return nil }
        let teile = iso.prefix(10).split(separator: "-")
        guard teile.count == 3,
              let jahr = Int(teile[0]), let monat = Int(teile[1]), let tag = Int(teile[2])
        else { return nil }
        var komponenten = DateComponents()
        komponenten.year = jahr
        komponenten.month = monat
        komponenten.day = tag
        var kalender = Calendar(identifier: .gregorian)
        kalender.timeZone = TimeZone(identifier: "Europe/Zurich") ?? .current
        guard let datum = kalender.date(from: komponenten) else { return nil }
        let f = DateFormatter()
        f.locale = Locale(identifier: "de_CH")
        f.timeZone = kalender.timeZone
        f.dateFormat = "EE dd.MM."
        return f.string(from: datum)
    }
}

private struct StatusBadge: View {
    let status: String?

    /// Statuswerte wie im Backend: pending/approved/rejected.
    private var appearance: (String, Color) {
        switch status {
        case "approved": return ("bestätigt", .green)
        case "rejected": return ("abgelehnt", .red)
        case "pending": return ("offen", .orange)
        default: return (status ?? "—", .secondary)
        }
    }

    var body: some View {
        Text(appearance.0)
            .font(.caption2.weight(.medium))
            .padding(.horizontal, 8)
            .padding(.vertical, 3)
            .background(appearance.1.opacity(0.15), in: Capsule())
            .foregroundStyle(appearance.1)
    }
}
