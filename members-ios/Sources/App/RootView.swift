import SwiftUI

/// Schaltet zwischen Login und Haupt-App, je nach Auth-Zustand.
struct RootView: View {
    @EnvironmentObject var auth: AuthManager

    var body: some View {
        if auth.isLoggedIn {
            MainTabView()
        } else {
            LoginView()
        }
    }
}
