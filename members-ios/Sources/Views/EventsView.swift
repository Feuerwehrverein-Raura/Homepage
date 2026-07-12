import SwiftUI

struct EventsView: View {
    @EnvironmentObject var auth: AuthManager
    @State private var events: [Event] = []
    @State private var loading = true
    @State private var error: String?

    var body: some View {
        NavigationStack {
            Group {
                if loading {
                    ProgressView().frame(maxWidth: .infinity, maxHeight: .infinity)
                } else if let error {
                    message(error, systemImage: "exclamationmark.triangle")
                } else if events.isEmpty {
                    message("Keine Events.", systemImage: "calendar")
                } else {
                    List(events) { event in
                        NavigationLink(destination: EventDetailView(eventId: event.id, fallback: event)) {
                            EventRow(event: event)
                        }
                    }
                    .listStyle(.plain)
                }
            }
            .navigationTitle("Events")
            .task { await load() }
            .refreshable { await load() }
        }
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
            let api = APIClient(baseURL: AppConfig.apiBase, tokenProvider: { auth.accessToken })
            events = try await api.get("events")
        } catch {
            self.error = "Events konnten nicht geladen werden."
        }
        loading = false
    }
}

private struct EventRow: View {
    let event: Event

    var body: some View {
        VStack(alignment: .leading, spacing: 4) {
            Text(event.title).font(.headline)
            HStack(spacing: 10) {
                if let d = event.startDate {
                    Label(DateFormat.swiss(d), systemImage: "calendar")
                }
                if let loc = event.location, !loc.isEmpty {
                    Label(loc, systemImage: "mappin.and.ellipse")
                }
            }
            .font(.caption)
            .foregroundStyle(.secondary)
        }
        .padding(.vertical, 4)
    }
}
