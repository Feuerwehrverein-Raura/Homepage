import SwiftUI

/// Alle Zugänge eines Mitglieds (`GET members/me/accesses`): Web-Systeme,
/// Nextcloud-Ordner, Funktions-E-Mails und geteilte Dienstkonten.
///
/// Hier stehen Passwörter im Klartext — das ist der Zweck der Seite, aber ein
/// Grund, sie nicht versehentlich offen liegen zu lassen. Sie werden darum
/// erst auf Tippen sichtbar.
struct AccessesView: View {
    @EnvironmentObject var auth: AuthManager
    @State private var accesses: AccessesResponse?
    @State private var loading = true
    @State private var error: String?
    @State private var changingPasswordFor: FunctionEmail?

    var body: some View {
        Group {
            if loading {
                ProgressView().frame(maxWidth: .infinity, maxHeight: .infinity)
            } else if let error {
                VStack(spacing: 12) {
                    Image(systemName: "exclamationmark.triangle")
                        .font(.largeTitle).foregroundStyle(.secondary)
                    Text(error).foregroundStyle(.secondary)
                }
                .frame(maxWidth: .infinity, maxHeight: .infinity)
            } else if let accesses {
                List {
                    if !accesses.systemAccesses.isEmpty {
                        Section("Systeme") {
                            ForEach(accesses.systemAccesses) { system in
                                SystemRow(system: system)
                            }
                        }
                    }

                    if !accesses.functionEmails.isEmpty {
                        Section("Funktions-E-Mails") {
                            ForEach(accesses.functionEmails) { mail in
                                FunctionEmailRow(mail: mail) {
                                    changingPasswordFor = mail
                                }
                            }
                        }
                    }

                    if !accesses.nextcloudFolders.isEmpty {
                        Section("Cloud-Ordner") {
                            ForEach(accesses.nextcloudFolders) { folder in
                                Label(folder.mountPoint ?? "Ordner",
                                      systemImage: "folder")
                            }
                        }
                    }

                    if !accesses.serviceAccounts.isEmpty {
                        Section("Geteilte Konten") {
                            ForEach(accesses.serviceAccounts) { account in
                                ServiceAccountRow(account: account)
                            }
                        }
                    }

                    if isEmpty(accesses) {
                        Text("Keine Zugänge hinterlegt.")
                            .foregroundStyle(.secondary)
                    }
                }
            }
        }
        .navigationTitle("Zugänge")
        .navigationBarTitleDisplayMode(.inline)
        .task { await load() }
        .refreshable { await load() }
        .sheet(item: $changingPasswordFor) { mail in
            ChangeMailPasswordSheet(mail: mail) { Task { await load() } }
                .environmentObject(auth)
        }
    }

    private func isEmpty(_ a: AccessesResponse) -> Bool {
        a.systemAccesses.isEmpty && a.functionEmails.isEmpty
            && a.nextcloudFolders.isEmpty && a.serviceAccounts.isEmpty
    }

    private func load() async {
        loading = true
        error = nil
        do {
            accesses = try await auth.api().get("members/me/accesses")
        } catch {
            self.error = "Zugänge konnten nicht geladen werden."
        }
        loading = false
    }
}

private struct SystemRow: View {
    let system: SystemAccess

    var body: some View {
        VStack(alignment: .leading, spacing: 2) {
            Text(system.system).font(.body)
            if let detail = [system.access, system.url].compactMap({ $0 })
                .filter({ !$0.isEmpty }).first {
                Text(detail).font(.caption).foregroundStyle(.secondary)
            }
        }
        .opacity(system.enabled == false ? 0.5 : 1)
    }
}

private struct FunctionEmailRow: View {
    let mail: FunctionEmail
    var onChangePassword: () -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: 4) {
            Text(mail.email).font(.body)
            Text(mail.function).font(.caption).foregroundStyle(.secondary)
            if let password = mail.password, !password.isEmpty {
                SecretField(label: "Passwort", value: password)
            }
            if let server = mail.server {
                Text("Server \(server)")
                    .font(.caption2).foregroundStyle(.secondary)
            }
            Button("Passwort ändern", action: onChangePassword)
                .font(.caption)
                .padding(.top, 2)
        }
        .padding(.vertical, 2)
    }
}

private struct ServiceAccountRow: View {
    let account: ServiceAccount

    var body: some View {
        VStack(alignment: .leading, spacing: 4) {
            Text(account.displayName ?? account.accountName ?? account.username)
            Text(account.username).font(.caption).foregroundStyle(.secondary)
            if let password = account.password, !password.isEmpty {
                SecretField(label: "Passwort", value: password)
            }
            if let next = account.nextRotation {
                Text("Nächster Wechsel: \(DateFormat.swiss(next))")
                    .font(.caption2).foregroundStyle(.secondary)
            }
        }
        .padding(.vertical, 2)
    }
}

/// Verdeckt einen Wert, bis er angetippt wird, und kopiert ihn bei langem
/// Druck. Schützt vor Schulterblicken, nicht vor Angreifern.
private struct SecretField: View {
    let label: String
    let value: String
    @State private var visible = false

    var body: some View {
        HStack {
            Text(visible ? value : String(repeating: "•", count: 10))
                .font(.caption.monospaced())
            Spacer()
            Image(systemName: visible ? "eye.slash" : "eye")
                .font(.caption)
                .foregroundStyle(.secondary)
        }
        .contentShape(Rectangle())
        .onTapGesture { visible.toggle() }
        .onLongPressGesture {
            UIPasteboard.general.string = value
            visible = true
        }
        .accessibilityLabel(label)
    }
}

/// Passwort einer Funktions-E-Mail ändern
/// (`PUT members/me/function-email-password`).
private struct ChangeMailPasswordSheet: View {
    @EnvironmentObject var auth: AuthManager
    @Environment(\.dismiss) private var dismiss

    let mail: FunctionEmail
    var onChanged: () -> Void

    @State private var password = ""
    @State private var repeated = ""
    @State private var saving = false
    @State private var error: String?

    private var valid: Bool {
        password.count >= 12 && password == repeated
    }

    var body: some View {
        NavigationStack {
            Form {
                Section {
                    SecureField("Neues Passwort", text: $password)
                    SecureField("Wiederholen", text: $repeated)
                } header: {
                    Text(mail.email)
                } footer: {
                    // Mindestens 12 Zeichen: ein Postfach mit einem kurzen
                    // Passwort wird binnen Tagen für Spam missbraucht.
                    if password.isEmpty {
                        Text("Mindestens 12 Zeichen.")
                    } else if password.count < 12 {
                        Text("Noch zu kurz — mindestens 12 Zeichen.")
                            .foregroundStyle(.orange)
                    } else if password != repeated {
                        Text("Die Wiederholung stimmt nicht überein.")
                            .foregroundStyle(.orange)
                    }
                }

                if let error {
                    Section {
                        Label(error, systemImage: "exclamationmark.triangle")
                            .foregroundStyle(.red)
                    }
                }
            }
            .navigationTitle("Passwort ändern")
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
                            .disabled(!valid)
                    }
                }
            }
        }
    }

    private func save() async {
        saving = true
        error = nil
        do {
            try await auth.api().put(
                "members/me/function-email-password",
                body: ChangeFunctionEmailPasswordRequest(
                    email: mail.email, password: password)
            )
            onChanged()
            dismiss()
        } catch {
            self.error = "Passwort konnte nicht geändert werden."
        }
        saving = false
    }
}
