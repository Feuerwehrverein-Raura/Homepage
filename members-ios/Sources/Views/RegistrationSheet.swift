import SwiftUI

/// Anmeldung zu einem Anlass — als Helfer für eine oder mehrere Schichten,
/// oder als Teilnehmer. Beides geht an denselben Endpunkt
/// (`POST registrations/public`), unterschieden über `type`, genau wie in
/// der Android-App.
struct RegistrationSheet: View {
    @EnvironmentObject var auth: AuthManager
    @Environment(\.dismiss) private var dismiss

    let event: Event
    /// Wird nach erfolgreicher Anmeldung aufgerufen, damit die Detailansicht
    /// die Schicht-Besetzung neu laden kann.
    var onRegistered: () -> Void

    @State private var name = ""
    @State private var email = ""
    @State private var phone = ""
    @State private var notes = ""
    @State private var allergies = ""
    @State private var participants = 1
    @State private var selectedShifts: Set<String> = []

    @State private var submitting = false
    @State private var error: String?

    private var isShiftRegistration: Bool { event.hasShifts }

    private var canSubmit: Bool {
        guard !name.trimmingCharacters(in: .whitespaces).isEmpty else { return false }
        if isShiftRegistration { return !selectedShifts.isEmpty }
        return true
    }

    var body: some View {
        NavigationStack {
            Form {
                if isShiftRegistration {
                    Section("Schichten") {
                        ForEach(event.shifts ?? []) { shift in
                            Button {
                                toggle(shift.id)
                            } label: {
                                HStack(alignment: .firstTextBaseline) {
                                    VStack(alignment: .leading, spacing: 2) {
                                        Text(shift.bereich ?? shift.name)
                                            .foregroundStyle(.primary)
                                        if let label = timeLabel(shift) {
                                            Text(label)
                                                .font(.caption)
                                                .foregroundStyle(.secondary)
                                        }
                                    }
                                    Spacer()
                                    Image(systemName: selectedShifts.contains(shift.id)
                                          ? "checkmark.circle.fill" : "circle")
                                        .foregroundStyle(selectedShifts.contains(shift.id)
                                                         ? Color.accentColor : Color.secondary)
                                }
                            }
                        }
                    }
                }

                Section("Kontakt") {
                    TextField("Name", text: $name)
                        .textContentType(.name)
                    TextField("E-Mail", text: $email)
                        .textContentType(.emailAddress)
                        .keyboardType(.emailAddress)
                        .textInputAutocapitalization(.never)
                    TextField("Telefon", text: $phone)
                        .textContentType(.telephoneNumber)
                        .keyboardType(.phonePad)
                }

                if !isShiftRegistration {
                    Section("Teilnahme") {
                        Stepper("Personen: \(participants)", value: $participants, in: 1...20)
                        TextField("Allergien / Unverträglichkeiten", text: $allergies)
                    }
                }

                Section("Bemerkung") {
                    TextField("Optional", text: $notes, axis: .vertical)
                        .lineLimit(3...6)
                }

                if let error {
                    Section {
                        Label(error, systemImage: "exclamationmark.triangle")
                            .foregroundStyle(.red)
                    }
                }
            }
            .navigationTitle(isShiftRegistration ? "Helfen" : "Anmelden")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Abbrechen") { dismiss() }
                }
                ToolbarItem(placement: .confirmationAction) {
                    if submitting {
                        ProgressView()
                    } else {
                        Button("Senden") { Task { await submit() } }
                            .disabled(!canSubmit)
                    }
                }
            }
            .task { await prefillFromProfile() }
        }
    }

    private func timeLabel(_ shift: Shift) -> String? {
        switch (shift.startTime, shift.endTime) {
        case let (start?, end?): return "\(start) – \(end)"
        case let (start?, nil): return start
        default: return nil
        }
    }

    private func toggle(_ id: String) {
        if selectedShifts.contains(id) {
            selectedShifts.remove(id)
        } else {
            selectedShifts.insert(id)
        }
    }

    /// Name und Kontakt aus dem eigenen Profil vorbelegen. Die Android-App
    /// tut das nicht — in einer App, in der man ohnehin angemeldet ist, seine
    /// eigenen Daten abzutippen, ist aber unnötig. Alle Felder bleiben
    /// änderbar, etwa wenn jemand für eine andere Person anmeldet.
    private func prefillFromProfile() async {
        guard name.isEmpty else { return }
        guard let profile: MemberProfile = try? await auth.api().get("members/me") else { return }
        name = [profile.vorname, profile.nachname]
            .compactMap { $0 }
            .joined(separator: " ")
            .trimmingCharacters(in: .whitespaces)
        if email.isEmpty { email = profile.email ?? "" }
        if phone.isEmpty { phone = profile.mobile ?? profile.telefon ?? "" }
    }

    private func submit() async {
        submitting = true
        error = nil
        func trimmed(_ value: String) -> String? {
            let t = value.trimmingCharacters(in: .whitespaces)
            return t.isEmpty ? nil : t
        }

        let request = PublicRegistrationRequest(
            type: isShiftRegistration ? "shift" : "participant",
            eventId: event.id,
            eventTitle: event.title,
            organizerEmail: event.organizerEmail,
            name: name.trimmingCharacters(in: .whitespaces),
            email: trimmed(email),
            phone: trimmed(phone),
            participants: isShiftRegistration ? nil : participants,
            notes: trimmed(notes),
            allergies: isShiftRegistration ? nil : trimmed(allergies),
            shiftIds: isShiftRegistration ? Array(selectedShifts) : nil
        )

        do {
            let response: PublicRegistrationResponse =
                try await auth.api().post("registrations/public", body: request)
            // Das Backend antwortet auch bei fachlichen Absagen mit HTTP 200
            // und success=false — die Meldung darf also nicht verschluckt
            // werden, nur weil der Statuscode stimmt.
            if response.success == true {
                onRegistered()
                dismiss()
            } else {
                error = response.message ?? "Anmeldung wurde abgelehnt."
            }
        } catch {
            self.error = "Anmeldung konnte nicht gesendet werden."
        }
        submitting = false
    }
}
