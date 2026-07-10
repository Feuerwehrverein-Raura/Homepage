import SwiftUI

struct SettingsView: View {
    @EnvironmentObject var auth: AuthManager

    var body: some View {
        NavigationStack {
            List {
                Section("Adressbuch") {
                    Button {
                        // TODO Phase 4: Mitglieder via CNContacts einmalig ins
                        // iPhone-Adressbuch importieren (manuell, kein Auto-Sync).
                    } label: {
                        Label("Mitglieder ins Adressbuch importieren",
                              systemImage: "person.crop.circle.badge.plus")
                    }
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
}
