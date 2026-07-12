import SwiftUI

struct EventDetailView: View {
    @EnvironmentObject var auth: AuthManager
    let eventId: String
    let fallback: Event
    @State private var event: Event?

    private var current: Event { event ?? fallback }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 16) {
                Text(current.title).font(.title2.bold())
                if let sub = current.subtitle, !sub.isEmpty {
                    Text(sub).foregroundStyle(.secondary)
                }

                VStack(alignment: .leading, spacing: 8) {
                    if let d = current.startDate {
                        let range = DateFormat.swiss(d) + (current.endDate.map { " – " + DateFormat.swiss($0) } ?? "")
                        Label(range, systemImage: "calendar")
                    }
                    if let loc = current.location, !loc.isEmpty {
                        Label(loc, systemImage: "mappin.and.ellipse")
                    }
                    if let cost = current.cost, !cost.isEmpty {
                        Label(cost, systemImage: "banknote")
                    }
                    if let org = current.organizerName, !org.isEmpty {
                        Label(org, systemImage: "person")
                    }
                }
                .font(.subheadline)

                if let desc = current.description, !desc.isEmpty {
                    Divider()
                    Text(desc)
                }

                if let shifts = current.shifts, !shifts.isEmpty {
                    Divider()
                    Text("Schichten").font(.headline)
                    ForEach(shifts) { shift in
                        ShiftRow(shift: shift)
                    }
                }
            }
            .padding()
        }
        .navigationTitle("Event")
        .navigationBarTitleDisplayMode(.inline)
        .task { await load() }
    }

    private func load() async {
        do {
            let api = APIClient(baseURL: AppConfig.apiBase, tokenProvider: { auth.accessToken })
            event = try await api.get("events/\(eventId)")
        } catch {
            // Bei Fehler bleibt der Listen-Fallback sichtbar.
        }
    }
}

private struct ShiftRow: View {
    let shift: Shift

    var body: some View {
        VStack(alignment: .leading, spacing: 2) {
            Text(shift.bereich ?? shift.name).font(.subheadline.weight(.medium))
            HStack(spacing: 8) {
                if let s = shift.startTime, let e = shift.endTime {
                    Text("\(s) – \(e)")
                } else if let s = shift.startTime {
                    Text(s)
                }
                if let n = shift.needed {
                    Text("· \(n) benötigt")
                }
            }
            .font(.caption)
            .foregroundStyle(.secondary)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(.vertical, 4)
    }
}
