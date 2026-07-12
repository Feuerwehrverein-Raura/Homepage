import SwiftUI

struct ProfileView: View {
    @EnvironmentObject var auth: AuthManager
    @State private var profile: MemberProfile?
    @State private var loading = true
    @State private var error: String?

    var body: some View {
        NavigationStack {
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
                } else if let p = profile {
                    List {
                        Section {
                            LabeledContent("Name",
                                value: [p.vorname, p.nachname].compactMap { $0 }.joined(separator: " "))
                            if let s = p.status, !s.isEmpty { LabeledContent("Status", value: s) }
                            if let f = p.funktion, !f.isEmpty { LabeledContent("Funktion", value: f) }
                            if let g = p.geburtstag, !g.isEmpty {
                                LabeledContent("Geburtstag", value: DateFormat.swiss(g))
                            }
                        }
                        Section("Kontakt") {
                            if let e = p.email, !e.isEmpty { LabeledContent("E-Mail", value: e) }
                            if let m = p.mobile, !m.isEmpty { LabeledContent("Mobile", value: m) }
                            if let t = p.telefon, !t.isEmpty { LabeledContent("Telefon", value: t) }
                        }
                        Section("Adresse") {
                            if let s = p.strasse, !s.isEmpty { LabeledContent("Strasse", value: s) }
                            let plzOrt = [p.plz, p.ort].compactMap { $0 }.joined(separator: " ")
                            if !plzOrt.isEmpty { LabeledContent("Ort", value: plzOrt) }
                        }
                    }
                }
            }
            .navigationTitle("Profil")
            .task { await load() }
            .refreshable { await load() }
        }
    }

    private func load() async {
        loading = true
        error = nil
        do {
            let api = APIClient(baseURL: AppConfig.apiBase, tokenProvider: { auth.accessToken })
            profile = try await api.get("members/me")
        } catch {
            self.error = "Profil konnte nicht geladen werden."
        }
        loading = false
    }
}
