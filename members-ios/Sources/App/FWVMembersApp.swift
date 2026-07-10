import SwiftUI

/// Einstiegspunkt der FWV-Mitglieder-App (iOS).
/// Native SwiftUI-Pendant zur Android-App, gegen dieselben Backends.
@main
struct FWVMembersApp: App {
    @StateObject private var auth = AuthManager()

    var body: some Scene {
        WindowGroup {
            RootView()
                .environmentObject(auth)
        }
    }
}
