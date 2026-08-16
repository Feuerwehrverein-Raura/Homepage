import SwiftUI

/// Zweistufiger Passwort-Reset ohne Browser, wie `PasswordResetActivity`
/// der Android-App:
///
/// 1. E-Mail eingeben, Code anfordern (`POST auth/member/request-reset`).
///    Die Antwort ist immer gleich, egal ob das Konto existiert — sonst
///    liesse sich damit herausfinden, wer Mitglied ist.
/// 2. Code und neues Passwort setzen (`POST auth/member/reset`). Bei Erfolg
///    liefert das Backend gleich ein Token; man ist dann angemeldet.
struct PasswordResetView: View {
    @EnvironmentObject var auth: AuthManager
    @Environment(\.dismiss) private var dismiss

    @State private var email = ""
    @State private var code = ""
    @State private var password = ""
    @State private var repeated = ""
    @State private var codeRequested = false
    @State private var busy = false
    @State private var notice: String?
    @State private var failed = false

    private var canRequest: Bool {
        email.contains("@") && !busy
    }

    private var canReset: Bool {
        !code.trimmingCharacters(in: .whitespaces).isEmpty
            && password.count >= 8
            && password == repeated
            && !busy
    }

    var body: some View {
        NavigationStack {
            Form {
                Section {
                    TextField("E-Mail", text: $email)
                        .keyboardType(.emailAddress)
                        .textInputAutocapitalization(.never)
                        .autocorrectionDisabled()
                        .disabled(codeRequested)
                    if !codeRequested {
                        Button("Code anfordern") {
                            Task { await requestCode() }
                        }
                        .disabled(!canRequest)
                    }
                } header: {
                    Text("Schritt 1")
                } footer: {
                    Text("Du bekommst einen Code per E-Mail.")
                }

                if codeRequested {
                    Section {
                        TextField("Code aus der E-Mail", text: $code)
                            .keyboardType(.numberPad)
                        SecureField("Neues Passwort", text: $password)
                        SecureField("Wiederholen", text: $repeated)
                        Button("Passwort setzen") {
                            Task { await reset() }
                        }
                        .disabled(!canReset)
                    } header: {
                        Text("Schritt 2")
                    } footer: {
                        if password.isEmpty {
                            Text("Mindestens 8 Zeichen.")
                        } else if password.count < 8 {
                            Text("Noch zu kurz — mindestens 8 Zeichen.")
                                .foregroundStyle(.orange)
                        } else if password != repeated {
                            Text("Die Wiederholung stimmt nicht überein.")
                                .foregroundStyle(.orange)
                        }
                    }
                }

                if let notice {
                    Section {
                        Label(notice, systemImage: failed
                              ? "exclamationmark.triangle" : "info.circle")
                            .foregroundStyle(failed ? .red : .secondary)
                    }
                }
            }
            .navigationTitle("Passwort zurücksetzen")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Abbrechen") { dismiss() }
                }
                ToolbarItem(placement: .confirmationAction) {
                    if busy { ProgressView() }
                }
            }
        }
    }

    private func requestCode() async {
        busy = true
        notice = nil
        failed = false
        defer { busy = false }
        do {
            let response: MemberAuthResponse = try await auth.api().post(
                "auth/member/request-reset",
                body: RequestResetRequest(email: email.trimmingCharacters(in: .whitespaces))
            )
            codeRequested = true
            notice = response.message
                ?? "Falls ein Konto zu dieser Adresse besteht, ist der Code unterwegs."
        } catch {
            notice = "Der Code konnte nicht angefordert werden."
            failed = true
        }
    }

    private func reset() async {
        busy = true
        notice = nil
        failed = false
        defer { busy = false }
        do {
            let response: MemberAuthResponse = try await auth.api().post(
                "auth/member/reset",
                body: ResetRequest(
                    email: email.trimmingCharacters(in: .whitespaces),
                    code: code.trimmingCharacters(in: .whitespaces),
                    newPassword: password
                )
            )
            if let token = response.token, response.error == nil {
                auth.acceptToken(token)
                dismiss()
            } else {
                notice = response.error ?? response.message ?? "Der Code wurde abgelehnt."
                failed = true
            }
        } catch {
            notice = "Das Passwort konnte nicht gesetzt werden."
            failed = true
        }
    }
}
