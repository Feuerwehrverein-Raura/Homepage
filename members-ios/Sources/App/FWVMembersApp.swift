import SwiftUI
import UIKit

/// Einstiegspunkt der FWV-Mitglieder-App (iOS).
/// Native SwiftUI-Pendant zur Android-App, gegen dieselben Backends.
@main
struct FWVMembersApp: App {
    @UIApplicationDelegateAdaptor(AppDelegate.self) private var appDelegate
    @StateObject private var auth = AuthManager()

    var body: some Scene {
        WindowGroup {
            RootView()
                .environmentObject(auth)
                .task {
                    // Der Token gehoert zum Konto — erst nach der Anmeldung
                    // laesst er sich hinterlegen.
                    PushService.shared.auth = auth
                    await PushService.shared.registerCurrentTokenIfPossible()
                }
        }
    }
}

/// Fuer Push braucht es einen App-Delegate: die APNs-Rueckmeldungen des
/// Systems kommen nur dort an, SwiftUI bietet dafuer keinen Ersatz.
final class AppDelegate: NSObject, UIApplicationDelegate {
    func application(
        _ application: UIApplication,
        didFinishLaunchingWithOptions options: [UIApplication.LaunchOptionsKey: Any]? = nil
    ) -> Bool {
        Task { @MainActor in PushService.shared.start() }
        return true
    }

    func application(
        _ application: UIApplication,
        didRegisterForRemoteNotificationsWithDeviceToken deviceToken: Data
    ) {
        Task { @MainActor in PushService.shared.setAPNsToken(deviceToken) }
    }

    func application(
        _ application: UIApplication,
        didFailToRegisterForRemoteNotificationsWithError error: Error
    ) {
        // Im Simulator ohne Apple-Konto der Normalfall — kein Grund zur Sorge.
    }
}
