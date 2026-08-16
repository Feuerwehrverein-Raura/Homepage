import SwiftUI

struct MainTabView: View {
    var body: some View {
        TabView {
            EventsView()
                .tabItem { Label("Anlässe", systemImage: "calendar") }
            OrganizerView()
                .tabItem { Label("Organisator", systemImage: "person.badge.shield.checkmark") }
            ProfileView()
                .tabItem { Label("Profil", systemImage: "person.crop.circle") }
            SettingsView()
                .tabItem { Label("Einstellungen", systemImage: "gearshape") }
        }
    }
}
