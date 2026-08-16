import SwiftUI

struct ProfileView: View {
    @EnvironmentObject var auth: AuthManager
    @State private var profile: MemberProfile?
    @State private var loading = true
    @State private var error: String?
    @State private var editing = false

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
                            ProfileHeader(profile: p)
                        }

                        Section {
                            NavigationLink {
                                MyRegistrationsView()
                            } label: {
                                Label("Meine Anmeldungen", systemImage: "checklist")
                            }
                            NavigationLink {
                                AccessesView()
                            } label: {
                                Label("Zugänge", systemImage: "key")
                            }
                        }

                        Section {
                            if let s = p.status, !s.isEmpty {
                                LabeledContent("Status", value: s)
                            }
                            if let f = p.funktion, !f.isEmpty {
                                LabeledContent("Funktion", value: f)
                            }
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

                        Section {
                            NavigationLink {
                                AustrittView()
                            } label: {
                                Label("Austritt beantragen", systemImage: "door.left.hand.open")
                                    .foregroundStyle(.red)
                            }
                        }
                    }
                }
            }
            .navigationTitle("Profil")
            .toolbar {
                if profile != nil {
                    Button("Bearbeiten") { editing = true }
                }
            }
            .task { await load() }
            .refreshable { await load() }
            .sheet(isPresented: $editing) {
                if let p = profile {
                    EditProfileView(profile: p) {
                        Task { await load() }
                    }
                    .environmentObject(auth)
                }
            }
        }
    }

    private func load() async {
        loading = true
        error = nil
        do {
            profile = try await auth.api().get("members/me")
        } catch {
            self.error = "Profil konnte nicht geladen werden."
        }
        loading = false
    }
}

private struct ProfileHeader: View {
    let profile: MemberProfile

    var body: some View {
        HStack(spacing: 16) {
            // Die Bilddateien liegen offen unter /uploads — kein Token nötig,
            // AsyncImage genügt.
            AsyncImage(url: profile.fotoURL) { phase in
                switch phase {
                case .success(let image):
                    image.resizable().scaledToFill()
                case .empty where profile.fotoURL != nil:
                    ProgressView()
                default:
                    Image(systemName: "person.crop.circle.fill")
                        .resizable()
                        .foregroundStyle(.secondary)
                }
            }
            .frame(width: 72, height: 72)
            .clipShape(Circle())

            VStack(alignment: .leading, spacing: 4) {
                Text(profile.fullName.isEmpty ? "Mitglied" : profile.fullName)
                    .font(.headline)
                if let funktion = profile.funktion, !funktion.isEmpty {
                    Text(funktion).font(.subheadline).foregroundStyle(.secondary)
                }
            }
            Spacer()
        }
        .padding(.vertical, 4)
    }
}
