import SwiftUI

struct EventsView: View {
    @EnvironmentObject var auth: AuthManager
    /// Alle Anlaesse ausser abgesagten — aufgeteilt wird erst beim Anzeigen.
    @State private var events: [Event] = []
    @State private var showPast = false
    @State private var loading = true
    @State private var error: String?
    @State private var showCalendar = false
    @State private var proposing = false

    var body: some View {
        NavigationStack {
            Group {
                if showCalendar {
                    CalendarView()
                } else if loading {
                    ProgressView().frame(maxWidth: .infinity, maxHeight: .infinity)
                } else if let error {
                    message(error, systemImage: "exclamationmark.triangle")
                } else {
                    List {
                        if visible.isEmpty {
                            Text(showPast ? "Keine vergangenen Anlässe."
                                          : "Zurzeit steht nichts an.")
                                .foregroundStyle(.secondary)
                        } else {
                            ForEach(visible) { event in
                                NavigationLink(destination: EventDetailView(
                                    eventId: event.id, fallback: event)) {
                                    EventRow(event: event)
                                }
                            }
                        }

                        // Der Weg zurueck steht am Ende der Liste, nicht oben:
                        // wer die App oeffnet, will wissen was ansteht — nicht
                        // was war. Gesucht wird Vergangenes bewusst.
                        Section {
                            Button {
                                withAnimation { showPast.toggle() }
                            } label: {
                                Label(showPast ? "Kommende Anlässe"
                                               : "Vergangene Anlässe",
                                      systemImage: showPast ? "arrow.uturn.left" : "clock.arrow.circlepath")
                                    .font(.subheadline)
                            }
                        }
                    }
                    .listStyle(.plain)
                }
            }
            .navigationTitle("Anlässe")
            .toolbar {
                ToolbarItem(placement: .principal) {
                    Picker("Ansicht", selection: $showCalendar) {
                        Text("Liste").tag(false)
                        Text("Kalender").tag(true)
                    }
                    .pickerStyle(.segmented)
                }
                ToolbarItem(placement: .primaryAction) {
                    Button {
                        proposing = true
                    } label: {
                        Label("Anlass vorschlagen", systemImage: "plus")
                    }
                }
            }
            .task { await load() }
            .refreshable { await load() }
            .sheet(isPresented: $proposing) {
                ProposeEventView { Task { await load() } }
                    .environmentObject(auth)
            }
        }
    }

    /// Kommende aufsteigend — das Naechste zuerst. Vergangene absteigend,
    /// denn rueckblickend interessiert das zuletzt Gewesene.
    private var visible: [Event] {
        showPast
            ? events.filter { !$0.isUpcoming }
                    .sorted { ($0.startDate ?? "") > ($1.startDate ?? "") }
            : events.filter(\.isUpcoming)
                    .sorted { ($0.startDate ?? "") < ($1.startDate ?? "") }
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
            // Abgesagte fliegen ganz raus, wie in der Android-App. Die
            // Trennung kommend/vergangen passiert beim Anzeigen, damit der
            // Umschalter unten ohne neuen Abruf funktioniert.
            let alle: [Event] = try await auth.api().get("events")
            events = alle.filter { $0.status != "cancelled" }
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
