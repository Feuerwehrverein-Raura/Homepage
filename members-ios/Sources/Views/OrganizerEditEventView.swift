import SwiftUI

/// Anlass als Organisator bearbeiten (`PUT events/{id}/as-organizer`) und
/// dessen Schichten verwalten.
///
/// Es sind nicht alle Felder änderbar — das Backend lässt Organisatoren nur
/// an die Grunddaten. Alles Weitere bleibt dem Vorstand.
struct OrganizerEditEventView: View {
    @EnvironmentObject var auth: AuthManager
    @Environment(\.dismiss) private var dismiss

    let event: Event
    var onSaved: () -> Void

    @State private var title = ""
    @State private var subtitle = ""
    @State private var location = ""
    @State private var category = ""
    @State private var cost = ""
    @State private var descriptionText = ""
    @State private var status = "planned"
    @State private var startDate = Date()
    @State private var hasEnd = false
    @State private var endDate = Date()
    @State private var hasDeadline = false
    @State private var deadline = Date()
    @State private var maxParticipants = ""
    @State private var mealOptions = ""

    @State private var shifts: [Shift] = []
    @State private var editingShift: ShiftDraft?
    @State private var saving = false
    @State private var error: String?

    /// Ob die gewählte Kategorie eine Anmeldung verlangt. Wie auf Android
    /// abgeleitet und nicht von Hand gesetzt — sonst driften Kategorie und
    /// Anmeldepflicht auseinander.
    private var registrationRequired: Bool {
        OrganizerOptions.registrationRequiredCategories.contains(category)
    }

    var body: some View {
        NavigationStack {
            Form {
                Section("Anlass") {
                    TextField("Titel", text: $title)
                    TextField("Untertitel", text: $subtitle)
                    TextField("Ort", text: $location)
                    Picker("Kategorie", selection: $category) {
                        Text("—").tag("")
                        ForEach(OrganizerOptions.categories, id: \.self) {
                            Text($0).tag($0)
                        }
                    }
                    TextField("Kosten", text: $cost)
                }

                Section("Termin") {
                    DatePicker("Beginn", selection: $startDate,
                               displayedComponents: [.date, .hourAndMinute])
                    Toggle("Ende angeben", isOn: $hasEnd)
                    if hasEnd {
                        DatePicker("Ende", selection: $endDate,
                                   displayedComponents: [.date, .hourAndMinute])
                    }
                }

                Section {
                    LabeledContent("Anmeldung") {
                        Text(registrationRequired ? "erforderlich" : "nicht nötig")
                            .foregroundStyle(.secondary)
                    }
                    Toggle("Anmeldeschluss", isOn: $hasDeadline)
                    if hasDeadline {
                        DatePicker("Bis", selection: $deadline,
                                   displayedComponents: [.date, .hourAndMinute])
                    }
                    TextField("Max. Teilnehmer", text: $maxParticipants)
                        .keyboardType(.numberPad)
                    if category == "GV" {
                        TextField("Menü-Optionen (kommagetrennt)", text: $mealOptions)
                    }
                } header: {
                    Text("Anmeldung")
                } footer: {
                    Text("Ob eine Anmeldung nötig ist, ergibt sich aus der "
                       + "Kategorie — genau wie in der Android-App.")
                }

                Section("Beschreibung") {
                    TextField("Text", text: $descriptionText, axis: .vertical)
                        .lineLimit(4...12)
                }

                Section("Status") {
                    Picker("Status", selection: $status) {
                        ForEach(Array(OrganizerOptions.statusValues.enumerated()),
                                id: \.offset) { index, value in
                            Text(OrganizerOptions.statusDisplay[index]).tag(value)
                        }
                    }
                }

                Section {
                    ForEach(shifts) { shift in
                        Button {
                            editingShift = ShiftDraft(shift: shift)
                        } label: {
                            VStack(alignment: .leading, spacing: 2) {
                                Text(shift.bereich ?? shift.name)
                                    .foregroundStyle(.primary)
                                HStack(spacing: 8) {
                                    if let start = shift.startTime {
                                        Text(start)
                                    }
                                    if let needed = shift.needed {
                                        Text("\(needed) benötigt")
                                    }
                                }
                                .font(.caption)
                                .foregroundStyle(.secondary)
                            }
                        }
                    }
                    .onDelete { indexes in
                        Task { await deleteShifts(indexes) }
                    }

                    Button {
                        editingShift = ShiftDraft()
                    } label: {
                        Label("Schicht hinzufügen", systemImage: "plus")
                    }
                } header: {
                    Text("Schichten")
                } footer: {
                    Text("Zum Löschen nach links wischen.")
                }

                if let error {
                    Section {
                        Label(error, systemImage: "exclamationmark.triangle")
                            .foregroundStyle(.red)
                    }
                }
            }
            .navigationTitle("Anlass bearbeiten")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Abbrechen") { dismiss() }
                }
                ToolbarItem(placement: .confirmationAction) {
                    if saving {
                        ProgressView()
                    } else {
                        Button("Sichern") { Task { await save() } }
                    }
                }
            }
            .onAppear(perform: fill)
            .sheet(item: $editingShift) { draft in
                ShiftSheet(event: event, draft: draft) {
                    Task { await reloadShifts() }
                }
                .environmentObject(auth)
            }
        }
    }

    private func fill() {
        title = event.title
        subtitle = event.subtitle ?? ""
        location = event.location ?? ""
        category = event.category ?? ""
        cost = event.cost ?? ""
        descriptionText = event.description ?? ""
        status = event.status ?? "planned"
        startDate = Self.parse(event.startDate) ?? Date()
        if let end = Self.parse(event.endDate) {
            hasEnd = true
            endDate = end
        }
        if let max = event.maxParticipants { maxParticipants = String(max) }
        shifts = event.shifts ?? []
    }

    private static func parse(_ raw: String?) -> Date? {
        guard let raw else { return nil }
        let formatter = DateFormatter()
        formatter.locale = Locale(identifier: "en_US_POSIX")
        for pattern in ["yyyy-MM-dd HH:mm:ss", "yyyy-MM-dd HH:mm", "yyyy-MM-dd"] {
            formatter.dateFormat = pattern
            if let date = formatter.date(from: raw) { return date }
        }
        return nil
    }

    private static func iso(_ date: Date) -> String {
        let formatter = DateFormatter()
        formatter.locale = Locale(identifier: "en_US_POSIX")
        formatter.dateFormat = "yyyy-MM-dd HH:mm"
        return formatter.string(from: date)
    }

    private func save() async {
        saving = true
        error = nil
        defer { saving = false }
        func trimmed(_ value: String) -> String? {
            let t = value.trimmingCharacters(in: .whitespaces)
            return t.isEmpty ? nil : t
        }
        let update = OrganizerEventUpdate(
            title: title.trimmingCharacters(in: .whitespaces),
            subtitle: trimmed(subtitle),
            description: trimmed(descriptionText),
            startDate: Self.iso(startDate),
            endDate: hasEnd ? Self.iso(endDate) : nil,
            location: trimmed(location),
            category: trimmed(category),
            registrationRequired: registrationRequired,
            registrationDeadline: hasDeadline ? Self.iso(deadline) : nil,
            maxParticipants: Int(maxParticipants),
            cost: trimmed(cost),
            status: status,
            // Ausserhalb einer GV das Menue ausdruecklich leeren, sonst bliebe
            // eine alte Auswahl stehen.
            mealOptions: category == "GV" ? .some(trimmed(mealOptions)) : .some(nil)
        )
        do {
            let _: Event = try await auth.api()
                .put("events/\(event.id)/as-organizer", body: update)
            onSaved()
            dismiss()
        } catch {
            self.error = "Speichern fehlgeschlagen."
        }
    }

    private func reloadShifts() async {
        if let fresh: Event = try? await auth.api().get("events/\(event.id)") {
            shifts = fresh.shifts ?? []
            onSaved()
        }
    }

    private func deleteShifts(_ indexes: IndexSet) async {
        for index in indexes {
            let shift = shifts[index]
            try? await auth.api().delete(
                "events/\(event.id)/shifts/\(shift.id)/as-organizer")
        }
        await reloadShifts()
    }
}

/// Entwurf einer Schicht — leer für neue, gefüllt für bestehende.
struct ShiftDraft: Identifiable {
    var shiftId: String?
    var name = ""
    var description = ""
    var date = Date()
    var startTime = ""
    var endTime = ""
    var needed = ""
    var bereich = "Allgemein"

    var id: String { shiftId ?? "neu" }

    init() {}

    init(shift: Shift) {
        shiftId = shift.id
        name = shift.name
        description = shift.description ?? ""
        startTime = shift.startTime ?? ""
        endTime = shift.endTime ?? ""
        needed = shift.needed.map(String.init) ?? ""
        bereich = shift.bereich ?? "Allgemein"
    }
}

private struct ShiftSheet: View {
    @EnvironmentObject var auth: AuthManager
    @Environment(\.dismiss) private var dismiss

    let event: Event
    @State var draft: ShiftDraft
    var onSaved: () -> Void

    @State private var busy = false
    @State private var error: String?

    var body: some View {
        NavigationStack {
            Form {
                Section {
                    TextField("Name", text: $draft.name)
                    Picker("Bereich", selection: $draft.bereich) {
                        ForEach(OrganizerOptions.bereiche, id: \.self) {
                            Text($0).tag($0)
                        }
                    }
                    TextField("Beschreibung", text: $draft.description)
                }

                Section("Zeit") {
                    DatePicker("Datum", selection: $draft.date,
                               displayedComponents: .date)
                    TextField("Von (HH:MM)", text: $draft.startTime)
                    TextField("Bis (HH:MM)", text: $draft.endTime)
                    TextField("Benötigte Personen", text: $draft.needed)
                        .keyboardType(.numberPad)
                }

                if let error {
                    Section {
                        Label(error, systemImage: "exclamationmark.triangle")
                            .foregroundStyle(.red)
                    }
                }
            }
            .navigationTitle(draft.shiftId == nil ? "Neue Schicht" : "Schicht")
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
        }
    }

    private func save() async {
        busy = true
        error = nil
        defer { busy = false }
        func trimmed(_ value: String) -> String? {
            let t = value.trimmingCharacters(in: .whitespaces)
            return t.isEmpty ? nil : t
        }
        let formatter = DateFormatter()
        formatter.locale = Locale(identifier: "en_US_POSIX")
        formatter.dateFormat = "yyyy-MM-dd"

        let payload = ShiftPayload(
            name: trimmed(draft.name) ?? draft.bereich,
            description: trimmed(draft.description),
            date: formatter.string(from: draft.date),
            startTime: trimmed(draft.startTime),
            endTime: trimmed(draft.endTime),
            needed: Int(draft.needed),
            bereich: trimmed(draft.bereich)
        )
        do {
            if let shiftId = draft.shiftId {
                try await auth.api().put(
                    "events/\(event.id)/shifts/\(shiftId)/as-organizer", body: payload)
            } else {
                let _: PublicRegistrationResponse = try await auth.api().post(
                    "events/\(event.id)/shifts-as-organizer", body: payload)
            }
            onSaved()
            dismiss()
        } catch {
            self.error = "Schicht konnte nicht gespeichert werden."
        }
    }
}
