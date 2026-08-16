import SwiftUI

struct SettingsView: View {
    @EnvironmentObject var auth: AuthManager

    @State private var importing = false
    @State private var importMessage: String?
    @State private var importFailed = false

    var body: some View {
        NavigationStack {
            List {
                Section {
                    NavigationLink {
                        CardDAVSetupView()
                    } label: {
                        Label("Live-Adressbuch einrichten (CardDAV)",
                              systemImage: "arrow.triangle.2.circlepath")
                    }
                } header: {
                    Text("Adressbuch")
                } footer: {
                    Text("Empfohlen: die Mitglieder bleiben dauerhaft aktuell, "
                       + "ohne dass du etwas nachziehen musst. Braucht ein "
                       + "Nextcloud-Konto.")
                }

                Section {
                    Button {
                        Task { await importContacts() }
                    } label: {
                        HStack {
                            Label("Mitglieder ins Adressbuch importieren",
                                  systemImage: "person.crop.circle.badge.plus")
                            if importing {
                                Spacer()
                                ProgressView()
                            }
                        }
                    }
                    .disabled(importing)

                    if let importMessage {
                        Label(importMessage,
                              systemImage: importFailed ? "exclamationmark.triangle" : "checkmark.circle")
                            .font(.footnote)
                            .foregroundStyle(importFailed ? .red : .green)
                    }
                } header: {
                    Text("Einmaliger Import")
                } footer: {
                    Text("Für alle ohne Nextcloud-Konto: überträgt Name, Funktion "
                       + "und Kontaktdaten einmalig in deine Kontakte. Ein "
                       + "erneuter Import aktualisiert die bestehenden Einträge, "
                       + "statt sie zu verdoppeln — er bleibt aber eine "
                       + "Momentaufnahme.")
                }

                Section {
                    Button(role: .destructive) {
                        auth.logout()
                    } label: {
                        Label("Abmelden", systemImage: "rectangle.portrait.and.arrow.right")
                    }
                }
            }
            .navigationTitle("Einstellungen")
        }
    }

    private func importContacts() async {
        importing = true
        importMessage = nil
        importFailed = false
        do {
            let entries: [DirectoryEntry] = try await auth.api().get("members/directory")
            let result = try await ContactsImporter().import(entries)
            importMessage = switch (result.added, result.updated) {
            case (0, 0): "Keine Einträge übertragen."
            case (let added, 0): "\(added) Kontakte angelegt."
            case (0, let updated): "\(updated) Kontakte aktualisiert."
            case (let added, let updated): "\(added) angelegt, \(updated) aktualisiert."
            }
        } catch let error as ContactsImporter.ImportError {
            importMessage = error.errorDescription
            importFailed = true
        } catch {
            importMessage = "Verzeichnis konnte nicht geladen werden."
            importFailed = true
        }
        importing = false
    }
}
