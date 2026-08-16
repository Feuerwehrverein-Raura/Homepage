import SwiftUI
import UIKit

/// Richtet das Mitglieder-Adressbuch als CardDAV-Konto ein.
///
/// Warum das nicht die App selbst erledigt: iOS lässt Apps kein CardDAV-Konto
/// anlegen. Solche Konten entstehen entweder von Hand in den
/// Systemeinstellungen oder über ein Konfigurationsprofil — und ein Profil
/// kann nur Safari installieren, nicht die App. Ein Deeplink direkt in
/// „Account hinzufügen“ existiert ebenfalls nicht; die `App-Prefs:`-URLs sind
/// nicht öffentlich und führen zur Ablehnung im App Store.
///
/// Darum beides: der bequeme Weg über das Profil, und die Handanleitung für
/// den Fall, dass die Installation eines Profils Unbehagen auslöst — sie
/// zeigt „Nicht verifiziert“, weil das Profil unsigniert ist.
struct CardDAVSetupView: View {
    @Environment(\.openURL) private var openURL
    @State private var copied = false

    private static let profileURL = URL(string: "https://www.fwv-raura.ch/carddav.mobileconfig")!

    private let steps = [
        "Einstellungen öffnen, dann Apps → Kontakte → Accounts",
        "Account hinzufügen → Andere → CardDAV-Account",
        "Als Server \(AppConfig.cardDAVServer) eintragen",
        "Benutzername und Passwort vom Nextcloud-Konto eingeben",
        "Sichern — das Adressbuch \(AppConfig.cardDAVAddressBook) erscheint in den Kontakten"
    ]

    var body: some View {
        List {
            Section {
                Button {
                    openURL(Self.profileURL)
                } label: {
                    Label("Profil installieren", systemImage: "arrow.down.doc")
                }
            } header: {
                Text("Empfohlen")
            } footer: {
                Text("Öffnet Safari und lädt ein Konfigurationsprofil. Danach in "
                   + "den Einstellungen bestätigen und das Nextcloud-Passwort "
                   + "eingeben — fertig. Der Hinweis „Nicht verifiziert“ ist "
                   + "erwartbar: das Profil ist unsigniert, weil dafür ein "
                   + "Apple-Entwicklerzertifikat nötig wäre.")
            }

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

                ForEach(Array(steps.enumerated()), id: \.offset) { index, step in
                    HStack(alignment: .top, spacing: 12) {
                        Text("\(index + 1)")
                            .font(.caption.weight(.bold))
                            .frame(width: 22, height: 22)
                            .background(Color.accentColor.opacity(0.15), in: Circle())
                        Text(step)
                            .font(.subheadline)
                            .frame(maxWidth: .infinity, alignment: .leading)
                    }
                    .padding(.vertical, 2)
                }
            } header: {
                Text("Oder von Hand")
            } footer: {
                Text("Den Servernamen antippen, um ihn zu kopieren. Mehr braucht "
                   + "iOS nicht — den Rest findet es selbst.")
            }

            Section {
                Label("Änderungen kommen von allein an — das Adressbuch wird "
                    + "nachts aus der Mitgliederdatenbank aufgefrischt.",
                      systemImage: "arrow.triangle.2.circlepath")
                Label("Bei einem Anruf zeigt das iPhone den Namen an, wie bei "
                    + "jedem anderen Kontakt.",
                      systemImage: "phone")
                Label("Voraussetzung ist ein Nextcloud-Konto.",
                      systemImage: "person.badge.key")
            } header: {
                Text("Was das bringt")
            }
        }
        .navigationTitle("Adressbuch")
        .navigationBarTitleDisplayMode(.inline)
    }
}
