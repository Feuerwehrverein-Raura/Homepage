import SwiftUI

struct SettingsView: View {
    @EnvironmentObject var auth: AuthManager

    @AppStorage("newsletter.subscribed") private var newsletterOn = false
    @State private var newsletterBusy = false
    @State private var newsletterStatus: String?

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
                    Toggle("Newsletter abonniert", isOn: $newsletterOn)
                        .disabled(newsletterBusy)
                        .onChange(of: newsletterOn) { wanted in
                            Task { await setNewsletter(wanted) }
                        }
                    if let newsletterStatus {
                        Text(newsletterStatus)
                            .font(.footnote)
                            .foregroundStyle(.secondary)
                    }
                } header: {
                    Text("Newsletter")
                } footer: {
                    // Das Backend kennt keinen Abfrage-Endpunkt fuer den
                    // aktuellen Stand — es gibt nur an- und abmelden. Der
                    // Schalter zeigt darum, was du zuletzt hier getan hast,
                    // nicht zwingend den Stand auf dem Server.
                    Text("Beim Abonnieren schickt der Verein eine "
                       + "Bestätigungs-E-Mail mit einem Link.")
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

    private func setNewsletter(_ wanted: Bool) async {
        newsletterBusy = true
        newsletterStatus = nil
        defer { newsletterBusy = false }
        do {
            let profile: MemberProfile = try await auth.api().get("members/me")
            guard let email = profile.email, !email.isEmpty else {
                newsletterStatus = "Im Profil ist keine E-Mail hinterlegt."
                newsletterOn = !wanted
                return
            }
            let path = wanted ? "newsletter/subscribe" : "newsletter/unsubscribe"
            let response: NewsletterResponse = try await auth.api().post(
                path, body: NewsletterEmailRequest(email: email))
            if response.success == true {
                newsletterStatus = response.message
                    ?? (wanted ? "Bestätigungs-E-Mail unterwegs." : "Abgemeldet.")
            } else {
                newsletterStatus = response.message ?? "Hat nicht geklappt."
                newsletterOn = !wanted
            }
        } catch {
            newsletterStatus = "Verbindung fehlgeschlagen."
            newsletterOn = !wanted
        }
    }
}
