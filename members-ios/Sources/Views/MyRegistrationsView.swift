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

    private func shiftLabel(_ shift: RegistrationShift) -> String {
        let name = shift.name ?? "Schicht"
        switch (shift.startTime, shift.endTime) {
        case let (start?, end?): return "\(name) · \(start) – \(end)"
        case let (start?, nil): return "\(name) · \(start)"
        default: return name
        }
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
