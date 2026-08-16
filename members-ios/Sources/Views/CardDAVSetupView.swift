import SwiftUI
import UIKit

/// Anleitung, um das Mitglieder-Adressbuch als CardDAV-Konto einzurichten.
///
/// Warum eine Anleitung und kein Knopf: iOS lässt Apps kein CardDAV-Konto
/// anlegen. Konten dieser Art entstehen entweder von Hand in den
/// Systemeinstellungen oder über ein Konfigurationsprofil, und ein solches
/// Profil kann nur Safari installieren, nicht die App. Ein Deeplink direkt
/// in „Account hinzufügen" existiert ebenfalls nicht — die `App-Prefs:`-URLs
/// sind nicht öffentlich und führen zur Ablehnung im App Store.
struct CardDAVSetupView: View {
    @State private var copied = false

    private let steps: [(String, String)] = [
        ("1", "Einstellungen öffnen, dann Apps → Kontakte → Accounts"),
        ("2", "Account hinzufügen → Andere → CardDAV-Account"),
        ("3", "Als Server \(AppConfig.cardDAVServer) eintragen"),
        ("4", "Benutzername und Passwort vom Nextcloud-Konto eingeben"),
        ("5", "Sichern — das Adressbuch \(AppConfig.cardDAVAddressBook) erscheint in den Kontakten")
    ]

    var body: some View {
        List {
            Section {
                Button {
                    UIPasteboard.general.string = AppConfig.cardDAVServer
                    copied = true
                } label: {
                    HStack {
                        VStack(alignment: .leading, spacing: 2) {
                            Text("Server")
                                .font(.caption)
                                .foregroundStyle(.secondary)
                            Text(AppConfig.cardDAVServer)
                                .font(.body.monospaced())
                                .foregroundStyle(.primary)
                        }
                        Spacer()
                        Image(systemName: copied ? "checkmark" : "doc.on.doc")
                            .foregroundStyle(copied ? .green : .accentColor)
                    }
                }
            } footer: {
                Text("Tippen zum Kopieren. Mehr als den Servernamen braucht "
                   + "iOS nicht — den Rest findet es selbst.")
            }

            Section("Einrichten") {
                ForEach(steps, id: \.0) { step in
                    HStack(alignment: .top, spacing: 12) {
                        Text(step.0)
                            .font(.caption.weight(.bold))
                            .frame(width: 22, height: 22)
                            .background(Color.accentColor.opacity(0.15), in: Circle())
                        Text(step.1)
                            .font(.subheadline)
                            .frame(maxWidth: .infinity, alignment: .leading)
                    }
                    .padding(.vertical, 2)
                }
            }

            Section {
                Label("Änderungen kommen von allein an — das Adressbuch wird "
                    + "nachts aus der Mitgliederdatenbank aufgefrischt.",
                      systemImage: "arrow.triangle.2.circlepath")
                Label("Bei einem Anruf zeigt das iPhone den Namen an, wie bei "
                    + "jedem anderen Kontakt.",
                      systemImage: "phone")
                Label("Ein Nextcloud-Konto ist Voraussetzung. Ohne ein solches "
                    + "hilft der einmalige Import in den Einstellungen.",
                      systemImage: "person.badge.key")
            } header: {
                Text("Was das bringt")
            }
        }
        .navigationTitle("Live-Adressbuch")
        .navigationBarTitleDisplayMode(.inline)
    }
}
