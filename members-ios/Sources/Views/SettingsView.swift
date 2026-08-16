import SwiftUI

struct SettingsView: View {
    @EnvironmentObject var auth: AuthManager

    var body: some View {
        NavigationStack {
            List {
                Section {
                    NavigationLink {
                        CardDAVSetupView()
                    } label: {
                        Label("Mitglieder-Adressbuch einrichten",
                              systemImage: "person.crop.circle.badge.plus")
                    }
                } header: {
                    Text("Adressbuch")
                } footer: {
                    Text("Legt die Mitglieder als Kontakte aufs Gerät und hält "
                       + "sie automatisch aktuell. Bei Anrufen zeigt das iPhone "
                       + "dann den Namen an.")
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
