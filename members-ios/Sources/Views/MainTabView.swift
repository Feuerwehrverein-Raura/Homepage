import SwiftUI

struct MainTabView: View {
    var body: some View {
        TabView {
            EventsView()
                .tabItem { Label("Events", systemImage: "calendar") }
            ProfileView()
                .tabItem { Label("Profil", systemImage: "person.crop.circle") }
            SettingsView()
                .tabItem { Label("Einstellungen", systemImage: "gearshape") }
        }
    }
}
