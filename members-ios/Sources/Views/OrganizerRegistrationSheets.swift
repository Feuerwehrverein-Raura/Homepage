import SwiftUI

/// Anmeldung von Hand eintragen
/// (`POST events/{id}/registrations-as-organizer`).
///
/// Gedacht für telefonisch gemeldete Gäste. Entweder ein Mitglied aus dem
/// Verzeichnis — dann kennt das Backend die Kontaktdaten schon — oder ein
/// Gast mit frei eingegebenem Namen.
struct AddRegistrationSheet: View {
    @EnvironmentObject var auth: AuthManager
    @Environment(\.dismiss) private var dismiss

    let event: Event
    var onAdded: () -> Void

    @State private var members: [DirectoryEntry] = []
    @State private var selectedMemberId: String?
    @State private var guestName = ""
    @State private var guestEmail = ""
    @State private var guestPhone = ""
    @State private var participants = 1
    @State private var notes = ""
    @State private var search = ""
    @State private var busy = false
    @State private var error: String?

    private var isMember: Bool { selectedMemberId != nil }

    private var canSave: Bool {
        isMember || !guestName.trimmingCharacters(in: .whitespaces).isEmpty
    }

    private var filtered: [DirectoryEntry] {
        guard !search.isEmpty else { return members }
        return members.filter {
            $0.fullName.localizedCaseInsensitiveContains(search)
        }
    }

    var body: some View {
        NavigationStack {
            Form {
                Section("Mitglied") {
                    TextField("Suchen", text: $search)
                        .autocorrectionDisabled()
                    if members.isEmpty {
                        Text("Verzeichnis wird geladen …")
                            .font(.caption).foregroundStyle(.secondary)
                    } else {
                        ForEach(filtered.prefix(searchLimit)) { member in
                            Button {
                                selectedMemberId =
                                    selectedMemberId == member.id ? nil : member.id
                            } label: {
                                HStack {
                                    Text(member.fullName).foregroundStyle(.primary)
                                    Spacer()
                                    if selectedMemberId == member.id {
                                        Image(systemName: "checkmark")
                                            .foregroundStyle(Color.accentColor)
                                    }
                                }
                            }
                        }
                    }
                }

                if !isMember {
                    Section("Oder Gast") {
                        TextField("Name", text: $guestName)
                        TextField("E-Mail", text: $guestEmail)
                            .keyboardType(.emailAddress)
                            .textInputAutocapitalization(.never)
                        TextField("Telefon", text: $guestPhone)
                            .keyboardType(.phonePad)
                    }
                }

                Section("Angaben") {
                    Stepper("Personen: \(participants)", value: $participants, in: 1...20)
                    TextField("Bemerkung", text: $notes, axis: .vertical)
                        .lineLimit(2...5)
                }

                if let error {
                    Section {
                        Label(error, systemImage: "exclamationmark.triangle")
                            .foregroundStyle(.red)
                    }
                }
            }
            .navigationTitle("Anmeldung erfassen")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Abbrechen") { dismiss() }
                }
                ToolbarItem(placement: .confirmationAction) {
                    if busy {
                        ProgressView()
                    } else {
                        Button("Eintragen") { Task { await save() } }
                            .disabled(!canSave)
                    }
                }
            }
            .task { await loadDirectory() }
        }
    }

    /// Nur so viele Treffer wie nötig zeichnen — das Verzeichnis kann einige
    /// hundert Einträge haben, und eine Form mag keine langen Listen.
    private var searchLimit: Int { search.isEmpty ? 20 : 50 }

    private func loadDirectory() async {
        members = (try? await auth.api().get("members/directory")) ?? []
    }

    private func save() async {
        busy = true
        error = nil
        defer { busy = false }
        func trimmed(_ value: String) -> String? {
            let t = value.trimmingCharacters(in: .whitespaces)
            return t.isEmpty ? nil : t
        }
        let request = OrganizerAddRegistrationRequest(
            memberId: selectedMemberId,
            guestName: isMember ? nil : trimmed(guestName),
            guestEmail: isMember ? nil : trimmed(guestEmail),
            guestPhone: isMember ? nil : trimmed(guestPhone),
            participants: participants,
            notes: trimmed(notes)
        )
        do {
            let response: PublicRegistrationResponse = try await auth.api().post(
                "events/\(event.id)/registrations-as-organizer", body: request)
            if response.success == false {
                error = response.message ?? "Eintragen wurde abgelehnt."
                return
            }
            onAdded()
            dismiss()
        } catch {
            self.error = "Eintragen fehlgeschlagen."
        }
    }
}

/// Anmeldung bearbeiten
/// (`PUT events/{eventId}/registrations/{regId}/as-organizer`) und löschen.
struct EditRegistrationSheet: View {
    @EnvironmentObject var auth: AuthManager
    @Environment(\.dismiss) private var dismiss

    let event: Event
    let registration: EventRegistration
    var onChanged: () -> Void

    @State private var name = ""
    @State private var email = ""
    @State private var phone = ""
    @State private var participants = 1
    @State private var notes = ""
    @State private var status = "pending"
    @State private var busy = false
    @State private var confirmDelete = false
    @State private var error: String?

    var body: some View {
        NavigationStack {
            Form {
                Section("Person") {
                    TextField("Name", text: $name)
                    TextField("E-Mail", text: $email)
                        .keyboardType(.emailAddress)
                        .textInputAutocapitalization(.never)
                    TextField("Telefon", text: $phone)
                        .keyboardType(.phonePad)
                }

                Section("Angaben") {
                    Stepper("Personen: \(participants)", value: $participants, in: 1...20)
                    TextField("Bemerkung", text: $notes, axis: .vertical)
                        .lineLimit(2...5)
                    Picker("Status", selection: $status) {
                        Text("Offen").tag("pending")
                        Text("Bestätigt").tag("approved")
                        Text("Abgelehnt").tag("rejected")
                    }
                }

                Section {
                    Button(role: .destructive) {
                        confirmDelete = true
                    } label: {
                        Label("Anmeldung löschen", systemImage: "trash")
                    }
                    .disabled(busy)
                }

                if let error {
                    Section {
                        Label(error, systemImage: "exclamationmark.triangle")
                            .foregroundStyle(.red)
                    }
                }
            }
            .navigationTitle("Anmeldung bearbeiten")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Abbrechen") { dismiss() }
                }
                ToolbarItem(placement: .confirmationAction) {
                    if busy {
                        ProgressView()
                    } else {
                        Button("Sichern") { Task { await save() } }
                    }
                }
            }
            .onAppear(perform: fill)
            .confirmationDialog("Anmeldung löschen?",
                                isPresented: $confirmDelete,
                                titleVisibility: .visible) {
                Button("Löschen", role: .destructive) { Task { await remove() } }
                Button("Abbrechen", role: .cancel) {}
            } message: {
                Text("Die Anmeldung von \(registration.displayName) wird entfernt.")
            }
        }
    }

    private func fill() {
        let parsed = RegNotes.parse(registration.notes)
        name = registration.guestName ?? registration.displayName
        email = registration.guestEmail ?? ""
        phone = parsed.phone ?? ""
        participants = parsed.participants
        notes = parsed.text ?? ""
        status = registration.status ?? "pending"
    }

    private func save() async {
        busy = true
        error = nil
        defer { busy = false }
        func trimmed(_ value: String) -> String? {
            let t = value.trimmingCharacters(in: .whitespaces)
            return t.isEmpty ? nil : t
        }
        do {
            try await auth.api().put(
                "events/\(event.id)/registrations/\(registration.id)/as-organizer",
                body: OrganizerEditRegistrationRequest(
                    guestName: trimmed(name),
                    guestEmail: trimmed(email),
                    guestPhone: trimmed(phone),
                    participants: participants,
                    notes: trimmed(notes),
                    status: status
                )
            )
            onChanged()
            dismiss()
        } catch {
            self.error = "Speichern fehlgeschlagen."
        }
    }

    private func remove() async {
        busy = true
        error = nil
        defer { busy = false }
        do {
            try await auth.api().delete(
                "events/\(event.id)/registrations/\(registration.id)/as-organizer")
            onChanged()
            dismiss()
        } catch {
            self.error = "Löschen fehlgeschlagen."
        }
    }
}

/// Alle Angemeldeten eines Anlasses benachrichtigen
/// (`POST events/{id}/notify-registrants-as-organizer`).
struct NotifyRegistrantsSheet: View {
    @EnvironmentObject var auth: AuthManager
    @Environment(\.dismiss) private var dismiss

    let event: Event

    @State private var subject = ""
    @State private var message = ""
    @State private var busy = false
    @State private var result: NotifyResult?
    @State private var error: String?

    private var canSend: Bool {
        !subject.trimmingCharacters(in: .whitespaces).isEmpty
            && !message.trimmingCharacters(in: .whitespaces).isEmpty
    }

    var body: some View {
        NavigationStack {
            Form {
                Section {
                    TextField("Betreff", text: $subject)
                    TextField("Nachricht", text: $message, axis: .vertical)
                        .lineLimit(5...12)
                } header: {
                    Text(event.title)
                } footer: {
                    Text("Geht an alle, die sich für diesen Anlass angemeldet "
                       + "haben.")
                }

                if let result {
                    Section("Ergebnis") {
                        LabeledContent("Per E-Mail", value: "\(result.emailed ?? 0)")
                        if let posted = result.posted, posted > 0 {
                            LabeledContent("Per Post", value: "\(posted)")
                        }
                        if let skipped = result.skipped, skipped > 0 {
                            LabeledContent("Übersprungen", value: "\(skipped)")
                        }
                        // Wen die Nachricht nicht erreicht hat, muss der
                        // Organisator sehen — sonst hält er alle für
                        // informiert.
                        if let unreachable = result.unreachable, !unreachable.isEmpty {
                            VStack(alignment: .leading, spacing: 2) {
                                Text("Nicht erreicht:")
                                    .font(.caption.weight(.medium))
                                    .foregroundStyle(.orange)
                                ForEach(unreachable, id: \.self) { entry in
                                    Text(entry).font(.caption)
                                        .foregroundStyle(.secondary)
                                }
                            }
                        }
                    }
                }

                if let error {
                    Section {
                        Label(error, systemImage: "exclamationmark.triangle")
                            .foregroundStyle(.red)
                    }
                }
            }
            .navigationTitle("Benachrichtigen")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button(result == nil ? "Abbrechen" : "Fertig") { dismiss() }
                }
                ToolbarItem(placement: .confirmationAction) {
                    if busy {
                        ProgressView()
                    } else if result == nil {
                        Button("Senden") { Task { await send() } }
                            .disabled(!canSend)
                    }
                }
            }
        }
    }

    private func send() async {
        busy = true
        error = nil
        defer { busy = false }
        do {
            result = try await auth.api().post(
                "events/\(event.id)/notify-registrants-as-organizer",
                body: NotifyRequest(
                    subject: subject.trimmingCharacters(in: .whitespaces),
                    message: message.trimmingCharacters(in: .whitespaces))
            )
        } catch {
            self.error = "Benachrichtigung fehlgeschlagen."
        }
    }
}
