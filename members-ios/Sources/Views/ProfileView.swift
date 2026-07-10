import SwiftUI

/// Platzhalter — Profil folgt in Phase 2.
struct ProfileView: View {
    var body: some View {
        NavigationStack {
            VStack(spacing: 12) {
                Image(systemName: "person.crop.circle")
                    .font(.system(size: 64))
                    .foregroundStyle(.secondary)
                Text("Profil folgt in Phase 2.")
                    .foregroundStyle(.secondary)
            }
            .padding()
            .navigationTitle("Profil")
        }
    }
}
