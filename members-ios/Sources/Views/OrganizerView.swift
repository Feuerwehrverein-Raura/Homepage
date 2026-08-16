import SwiftUI

/// Organisator-Bereich: die selbst organisierten Anlässe und deren
/// Anmeldungen, mit Genehmigen und Ablehnen.
///
/// Wer Organisator ist, entscheidet das Backend über die E-Mail-Adresse
/// (`organizer_email` des Anlasses). Wer nichts organisiert, bekommt hier
/// eine leere Liste — der Tab bleibt trotzdem sichtbar, wie auf Android.
struct OrganizerView: View {
    @EnvironmentObject var auth: AuthManager
    @State private var events: [Event] = []
    @State private var registrations: [String: [EventRegistration]] = [:]
    @State private var loading = true
    @State private var error: String?
    @State private var working: String?
    @State private var adding: Event?
    @State private var notifying: Event?
    @State private var editing: EditTarget?
    @State private var suggesting: EditTarget?
    @State private var editingEvent: Event?
    @State private var notesFor: Event?
    @State private var pdf: PDFTarget?

    struct PDFTarget: Identifiable {
        let event: Event
        let title: String
        let path: String
        var id: String { path }
    }

    /// Anlass und Anmeldung gehoeren beim Bearbeiten zusammen.
    struct EditTarget: Identifiable {
        let event: Event
        let registration: EventRegistration
        var id: String { registration.id }
    }

    var body: some View {
        NavigationStack {
            Group {
                if loading {
                    ProgressView().frame(maxWidth: .infinity, maxHeight: .infinity)
                } else if let error {
                    message(error, systemImage: "exclamationmark.triangle")
                } else if events.isEmpty {
                    message("Du organisierst zurzeit keinen Anlass.",
                            systemImage: "person.badge.shield.checkmark")
                } else {
                    List {
                        ForEach(events) { event in
                            Section {
                                let regs = registrations[event.id] ?? []
                                if regs.isEmpty {
                                    Text("Noch keine Anmeldungen.")
                                        .font(.footnote)
                                        .foregroundStyle(.secondary)
                                } else {
                                    ForEach(regs) { registration in
                                        RegistrationCard(
                                            registration: registration,
                                            busy: working == registration.id,
                                            approve: {
                                                Task { await decide(event, registration, approve: true) }
                                            },
                                            reject: {
                                                Task { await decide(event, registration, approve: false) }
                                            },
                                            edit: {
                                                editing = EditTarget(event: event,
                                                                     registration: registration)
                                            },
                                            suggest: event.hasShifts ? {
                                                suggesting = EditTarget(event: event,
                                                                        registration: registration)
                                            } : nil
                                        )
                                    }
                                }
                                HStack(spacing: 16) {
                                    Button {
                                        adding = event
                                    } label: {
                                        Label("Erfassen", systemImage: "person.badge.plus")
                                            .font(.caption)
                                    }
                                    Button {
                                        notifying = event
                                    } label: {
                                        Label("Benachrichtigen", systemImage: "envelope")
                                            .font(.caption)
                                    }
                                    Button {
                                        editingEvent = event
                                    } label: {
                                        Label("Bearbeiten", systemImage: "square.and.pencil")
                                            .font(.caption)
                                    }
                                }
                                HStack(spacing: 16) {
                                    Button {
                                        notesFor = event
                                    } label: {
                                        Label("Notizen", systemImage: "note.text")
                                            .font(.caption)
                                    }
                                    Button {
                                        pdf = PDFTarget(
                                            event: event,
                                            title: "Teilnehmerliste",
                                            path: "events/\(event.id)/pdf/teilnehmerliste")
                                    } label: {
                                        Label("Teilnehmerliste", systemImage: "doc.text")
                                            .font(.caption)
                                    }
                                    Button {
                                        pdf = PDFTarget(
                                            event: event,
                                            title: "Aushang",
                                            path: "events/\(event.id)/pdf")
                                    } label: {
                                        Label("Aushang", systemImage: "doc.richtext")
                                            .font(.caption)
                                    }
                                }
                                .buttonStyle(.borderless)
                                .padding(.vertical, 2)
                                .buttonStyle(.borderless)
                                .padding(.vertical, 2)
                            } header: {
                                EventHeader(event: event,
                                            pending: pendingCount(event))
                            }
                        }
                    }
                }
            }
            .navigationTitle("Organisator")
            .task { await load() }
            .refreshable { await load() }
            .sheet(item: $adding) { event in
                AddRegistrationSheet(event: event) { Task { await load() } }
                    .environmentObject(auth)
            }
            .sheet(item: $notifying) { event in
                NotifyRegistrantsSheet(event: event)
                    .environmentObject(auth)
            }
            .sheet(item: $notesFor) { event in
                NavigationStack {
                    OrganizerNotesView(event: event).environmentObject(auth)
                }
            }
            .sheet(item: $pdf) { target in
                PDFPreview(title: target.title, path: target.path)
                    .environmentObject(auth)
            }
            .sheet(item: $editingEvent) { event in
                OrganizerEditEventView(event: event) { Task { await load() } }
                    .environmentObject(auth)
            }
            .sheet(item: $suggesting) { target in
                SuggestAlternativeSheet(event: target.event,
                                        registration: target.registration) {
                    Task { await load() }
                }
                .environmentObject(auth)
            }
            .sheet(item: $editing) { target in
                EditRegistrationSheet(event: target.event,
                                      registration: target.registration) {
                    Task { await load() }
                }
                .environmentObject(auth)
            }
        }
    }

    private func pendingCount(_ event: Event) -> Int {
        (registrations[event.id] ?? []).filter { $0.status == "pending" }.count
    }

    private func message(_ text: String, systemImage: String) -> some View {
        VStack(spacing: 12) {
            Image(systemName: systemImage).font(.largeTitle).foregroundStyle(.secondary)
            Text(text).foregroundStyle(.secondary).multilineTextAlignment(.center)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .padding()
    }

    private func load() async {
        loading = true
        error = nil
        do {
            let api = auth.api()
            let mine: [Event] = try await api.get("events/organized-by-me")
            events = mine
            // Die Anmeldungen haengen an je einem eigenen Endpunkt. Nacheinander
            // statt nebenlaeufig: es sind wenige Anlaesse, und so bleibt die
            // Reihenfolge nachvollziehbar, wenn einer davon scheitert.
            var collected: [String: [EventRegistration]] = [:]
            for event in mine {
                let regs: [EventRegistration] = (try? await api.get(
                    "events/\(event.id)/organizer-registrations")) ?? []
                collected[event.id] = regs
            }
            registrations = collected
        } catch {
            self.error = "Organisator-Daten konnten nicht geladen werden."
        }
        loading = false
    }

    private func decide(_ event: Event,
                        _ registration: EventRegistration,
                        approve: Bool) async {
        working = registration.id
        defer { working = nil }
        let action = approve ? "approve-as-organizer" : "reject-as-organizer"
        do {
            let _: PublicRegistrationResponse = try await auth.api().post(
                "events/\(event.id)/registrations/\(registration.id)/\(action)",
                body: [String: String]()
            )
            await load()
        } catch {
            self.error = approve
                ? "Genehmigen fehlgeschlagen."
                : "Ablehnen fehlgeschlagen."
        }
    }
}

private struct EventHeader: View {
    let event: Event
    let pending: Int

    var body: some View {
        HStack {
            VStack(alignment: .leading, spacing: 2) {
                Text(event.title)
                HStack(spacing: 8) {
                    if let date = event.startDate {
                        Text(DateFormat.swiss(date))
                    }
                    if let location = event.location, !location.isEmpty {
                        Text(location)
                    }
                }
                .font(.caption2)
                .foregroundStyle(.secondary)
            }
            Spacer()
            if pending > 0 {
                Text("\(pending) offen")
                    .font(.caption2.weight(.medium))
                    .padding(.horizontal, 8)
                    .padding(.vertical, 3)
                    .background(Color.orange.opacity(0.2), in: Capsule())
                    .foregroundStyle(.orange)
            }
        }
        .textCase(nil)
    }
}

private struct RegistrationCard: View {
    let registration: EventRegistration
    let busy: Bool
    var approve: () -> Void
    var reject: () -> Void
    var edit: () -> Void
    var suggest: (() -> Void)?

    private var notes: RegNotes { RegNotes.parse(registration.notes) }

    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            HStack {
                Text(registration.displayName).font(.subheadline.weight(.medium))
                Spacer()
                StatusPill(status: registration.status)
            }

            if let email = registration.guestEmail, !email.isEmpty {
                Text(email).font(.caption).foregroundStyle(.secondary)
            }

            // Aufbereitet statt roh: im notes-Feld steckt JSON.
            if notes.participants > 1 {
                Label("\(notes.participants) Personen", systemImage: "person.2")
                    .font(.caption).foregroundStyle(.secondary)
            }
            if let phone = notes.phone {
                Label(phone, systemImage: "phone").font(.caption).foregroundStyle(.secondary)
            }
            ForEach(notes.companions) { companion in
                Label(companion.name, systemImage: "person")
                    .font(.caption).foregroundStyle(.secondary)
            }
            if let allergies = notes.allergies {
                Label(allergies, systemImage: "allergens")
                    .font(.caption).foregroundStyle(.orange)
            }
            if let meal = notes.mealSelection {
                Label(meal, systemImage: "fork.knife")
                    .font(.caption).foregroundStyle(.secondary)
            }
            if let text = notes.text {
                Text(text).font(.caption).foregroundStyle(.secondary)
            }

            HStack(spacing: 12) {
                if registration.status == "pending" {
                    Button(action: approve) {
                        Label("Genehmigen", systemImage: "checkmark")
                            .font(.caption)
                    }
                    .buttonStyle(.borderedProminent)
                    .controlSize(.small)

                    Button(action: reject) {
                        Label("Ablehnen", systemImage: "xmark")
                            .font(.caption)
                    }
                    .buttonStyle(.bordered)
                    .controlSize(.small)
                }

                Button(action: edit) {
                    Label("Bearbeiten", systemImage: "pencil")
                        .font(.caption)
                }
                .buttonStyle(.bordered)
                .controlSize(.small)

                if let suggest {
                    Button(action: suggest) {
                        Label("Andere Schicht", systemImage: "arrow.triangle.swap")
                            .font(.caption)
                    }
                    .buttonStyle(.bordered)
                    .controlSize(.small)
                }

                if busy { ProgressView() }
            }
            .buttonStyle(.borderless)
            .disabled(busy)
            .padding(.top, 2)
        }
        .padding(.vertical, 4)
    }
}

private struct StatusPill: View {
    let status: String?

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
