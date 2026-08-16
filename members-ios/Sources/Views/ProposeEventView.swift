import SwiftUI

/// Anlass vorschlagen (`POST events/propose`).
///
/// Erzeugt keinen veröffentlichten Anlass, sondern einen Vorschlag mit Status
/// „proposed", den der Vorstand prüft. Den Organisator setzt das Backend
/// selbst auf den Vorschlagenden — deshalb werden hier keine
/// Organisator-Felder mitgeschickt.
struct ProposeEventView: View {
    @EnvironmentObject var auth: AuthManager
    @Environment(\.dismiss) private var dismiss

    var onProposed: () -> Void

    @State private var title = ""
    @State private var startDate = Date()
    @State private var hasEnd = false
    @State private var endDate = Date()
    @State private var location = ""
    @State private var category = ""
    @State private var cost = ""
    @State private var description = ""

    @State private var sending = false
    @State private var error: String?

    private var canSend: Bool {
        !title.trimmingCharacters(in: .whitespaces).isEmpty
    }

    var body: some View {
        NavigationStack {
            Form {
                Section("Anlass") {
                    TextField("Titel", text: $title)
                    TextField("Ort", text: $location)
                    TextField("Kategorie", text: $category)
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

                Section("Beschreibung") {
                    TextField("Worum geht es?", text: $description, axis: .vertical)
                        .lineLimit(4...10)
                }

                Section {
                    Text("Der Vorschlag geht an den Vorstand. Erst nach dessen "
                       + "Freigabe wird daraus ein veröffentlichter Anlass.")
                        .font(.footnote)
                        .foregroundStyle(.secondary)
                }

                if let error {
                    Section {
                        Label(error, systemImage: "exclamationmark.triangle")
                            .foregroundStyle(.red)
                    }
                }
            }
            .navigationTitle("Anlass vorschlagen")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Abbrechen") { dismiss() }
                }
                ToolbarItem(placement: .confirmationAction) {
                    if sending {
                        ProgressView()
                    } else {
                        Button("Senden") { Task { await send() } }
                            .disabled(!canSend)
                    }
                }
            }
        }
    }

    /// Das Backend erwartet "JJJJ-MM-TT HH:MM" — dieselbe Form, die auch aus
    /// `GET events` zurueckkommt.
    private static func iso(_ date: Date) -> String {
        let formatter = DateFormatter()
        formatter.locale = Locale(identifier: "en_US_POSIX")
        formatter.dateFormat = "yyyy-MM-dd HH:mm"
        return formatter.string(from: date)
    }

    private func send() async {
        sending = true
        error = nil
        func trimmed(_ value: String) -> String? {
            let t = value.trimmingCharacters(in: .whitespaces)
            return t.isEmpty ? nil : t
        }
        let request = ProposeEventRequest(
            title: title.trimmingCharacters(in: .whitespaces),
            startDate: Self.iso(startDate),
            endDate: hasEnd ? Self.iso(endDate) : nil,
            location: trimmed(location),
            category: trimmed(category),
            cost: trimmed(cost),
            description: trimmed(description)
        )
        do {
            let _: Event = try await auth.api().post("events/propose", body: request)
            onProposed()
            dismiss()
        } catch {
            self.error = "Vorschlag konnte nicht gesendet werden."
        }
        sending = false
    }
}
