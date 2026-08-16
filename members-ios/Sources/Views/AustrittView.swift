import SwiftUI

/// Austritt aus dem Verein beantragen (`POST members/me/austritt`).
///
/// Der Antrag löscht nichts und beendet nichts — der Vorstand entscheidet.
/// Genau das sagt die Ansicht auch, damit niemand glaubt, mit dem Tippen sei
/// die Mitgliedschaft beendet.
struct AustrittView: View {
    @EnvironmentObject var auth: AuthManager
    @Environment(\.dismiss) private var dismiss

    @State private var reason = ""
    @State private var datum = ""
    @State private var confirming = false
    @State private var sending = false
    @State private var result: String?
    @State private var failed = false

    var body: some View {
        Form {
            Section {
                Text("Der Antrag geht an den Vorstand. Deine Mitgliedschaft "
                   + "und deine Daten bleiben bestehen, bis der Vorstand "
                   + "darüber entschieden hat.")
                    .font(.footnote)
                    .foregroundStyle(.secondary)
            }

            Section("Angaben") {
                TextField("Wunschdatum (JJJJ-MM-TT, optional)", text: $datum)
                    .keyboardType(.numbersAndPunctuation)
                TextField("Begründung (optional)", text: $reason, axis: .vertical)
                    .lineLimit(3...6)
            }

            Section {
                Button(role: .destructive) {
                    confirming = true
                } label: {
                    HStack {
                        Text("Austritt beantragen")
                        if sending {
                            Spacer()
                            ProgressView()
                        }
                    }
                }
                .disabled(sending)
            }

            if let result {
                Section {
                    Label(result, systemImage: failed
                          ? "exclamationmark.triangle" : "checkmark.circle")
                        .foregroundStyle(failed ? .red : .green)
                }
            }
        }
        .navigationTitle("Austritt")
        .navigationBarTitleDisplayMode(.inline)
        .confirmationDialog("Austritt beantragen?",
                            isPresented: $confirming,
                            titleVisibility: .visible) {
            Button("Antrag senden", role: .destructive) {
                Task { await send() }
            }
            Button("Abbrechen", role: .cancel) {}
        } message: {
            Text("Der Vorstand wird über deinen Antrag informiert.")
        }
    }

    private func send() async {
        sending = true
        result = nil
        failed = false
        func trimmed(_ value: String) -> String? {
            let t = value.trimmingCharacters(in: .whitespaces)
            return t.isEmpty ? nil : t
        }
        do {
            let response: AustrittResponse = try await auth.api().post(
                "members/me/austritt",
                body: AustrittRequest(reason: trimmed(reason),
                                      austrittsdatum: trimmed(datum))
            )
            if response.success == true {
                result = response.message ?? "Antrag wurde übermittelt."
            } else {
                result = response.message ?? "Antrag wurde abgelehnt."
                failed = true
            }
        } catch {
            result = "Antrag konnte nicht gesendet werden."
            failed = true
        }
        sending = false
    }
}
