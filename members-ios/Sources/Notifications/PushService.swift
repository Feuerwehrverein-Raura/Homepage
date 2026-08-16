import Foundation
import UIKit
import UserNotifications

#if canImport(FirebaseCore)
import FirebaseCore
#endif
#if canImport(FirebaseMessaging)
import FirebaseMessaging
#endif

/// Push-Benachrichtigungen.
///
/// Das Backend nimmt unter `POST members/me/fcm-token` einen **FCM**-Token
/// entgegen, keinen APNs-Token — Android und iOS teilen sich denselben
/// Zustellweg über Firebase. iOS braucht dafür Firebase Cloud Messaging,
/// das seinerseits einen APNs-Schlüssel aus dem Apple Developer Program
/// verlangt.
///
/// Damit die App auch ohne diese Einrichtung läuft, ist alles zweifach
/// abgesichert: das Firebase-SDK wird nur eingebunden, wenn es vorhanden ist
/// (`canImport`), und `configure()` läuft nur, wenn eine
/// `GoogleService-Info.plist` im Bündel liegt. Fehlt sie, bleibt die App
/// vollständig benutzbar — nur ohne Mitteilungen aufs Gerät, während
/// E-Mail-Zustellung weiterläuft.
@MainActor
final class PushService: NSObject {
    static let shared = PushService()

    /// Wird gesetzt, sobald sich jemand angemeldet hat — der Token gehört
    /// zum Konto und kann vorher nicht hinterlegt werden.
    weak var auth: AuthManager?

    private var lastRegisteredToken: String?

    /// Ob die Firebase-Einrichtung vollständig ist.
    static var isConfigured: Bool {
        Bundle.main.path(forResource: "GoogleService-Info", ofType: "plist") != nil
    }

    /// Beim App-Start aufzurufen.
    func start() {
        UNUserNotificationCenter.current().delegate = self

        #if canImport(FirebaseCore)
        guard Self.isConfigured else {
            // Ohne Konfigurationsdatei wuerde FirebaseApp.configure()
            // abstuerzen. Lieber stillschweigend ohne Push weiterlaufen.
            return
        }
        if FirebaseApp.app() == nil {
            FirebaseApp.configure()
        }
        #if canImport(FirebaseMessaging)
        Messaging.messaging().delegate = self
        #endif
        #endif
    }

    static func authorizationStatus() async -> UNAuthorizationStatus {
        await UNUserNotificationCenter.current().notificationSettings()
            .authorizationStatus
    }

    /// Erlaubnis erfragen und beim APNs anmelden.
    func requestAuthorization() async {
        let center = UNUserNotificationCenter.current()
        let granted = (try? await center.requestAuthorization(
            options: [.alert, .badge, .sound])) ?? false
        guard granted else { return }
        UIApplication.shared.registerForRemoteNotifications()
    }

    /// Den APNs-Token an Firebase weiterreichen. Ohne diesen Schritt kann
    /// Firebase keinen FCM-Token ausstellen.
    func setAPNsToken(_ deviceToken: Data) {
        #if canImport(FirebaseMessaging)
        guard Self.isConfigured else { return }
        Messaging.messaging().apnsToken = deviceToken
        #endif
    }

    /// Token beim Backend hinterlegen. Mehrfach aufzurufen ist harmlos —
    /// wiederholte Registrierungen desselben Tokens werden hier abgefangen.
    func register(token: String) async {
        guard let auth, auth.isLoggedIn, token != lastRegisteredToken else { return }
        do {
            let _: EmptyResponse = try await auth.api().post(
                "members/me/fcm-token",
                body: FcmTokenRegistration(
                    token: token,
                    deviceId: UIDevice.current.identifierForVendor?.uuidString
                )
            )
            lastRegisteredToken = token
        } catch {
            // Kein Grund, den Nutzer zu behelligen: beim naechsten Start
            // versucht es die App erneut.
        }
    }

    /// Nach einer Anmeldung den bereits vorliegenden Token nachreichen.
    func registerCurrentTokenIfPossible() async {
        #if canImport(FirebaseMessaging)
        guard Self.isConfigured else { return }
        if let token = try? await Messaging.messaging().token() {
            await register(token: token)
        }
        #endif
    }
}

extension PushService: UNUserNotificationCenterDelegate {
    /// Mitteilungen auch anzeigen, während die App offen ist — sonst
    /// verpasst man genau die Meldung, auf die man gerade wartet.
    nonisolated func userNotificationCenter(
        _ center: UNUserNotificationCenter,
        willPresent notification: UNNotification
    ) async -> UNNotificationPresentationOptions {
        [.banner, .sound, .badge]
    }
}

#if canImport(FirebaseMessaging)
extension PushService: MessagingDelegate {
    nonisolated func messaging(_ messaging: Messaging,
                               didReceiveRegistrationToken token: String?) {
        guard let token else { return }
        Task { @MainActor in
            await PushService.shared.register(token: token)
        }
    }
}
#endif

/// Für Endpunkte, deren Antwort nicht ausgewertet wird.
struct EmptyResponse: Decodable {
    init(from decoder: Decoder) throws {}
}
