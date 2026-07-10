import SwiftUI

/// Platzhalter — Events + Anmeldung folgen in Phase 2.
struct EventsView: View {
    var body: some View {
        NavigationStack {
            VStack(spacing: 12) {
                Image(systemName: "calendar")
                    .font(.largeTitle)
                    .foregroundStyle(.secondary)
                Text("Events & Anmeldung folgen in Phase 2.")
                    .foregroundStyle(.secondary)
                    .multilineTextAlignment(.center)
            }
            .padding()
            .navigationTitle("Events")
        }
    }
}
