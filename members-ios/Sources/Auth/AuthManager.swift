import Foundation

/// Hält den Anmeldezustand und die Tokens (im Keychain) und kapselt den
/// OIDC-Login. Wird als EnvironmentObject in die View-Hierarchie gereicht.
@MainActor
final class AuthManager: ObservableObject {
    @Published private(set) var isLoggedIn = false
    @Published var lastError: String?

    private let keychain = Keychain(service: "ch.fwvraura.members")
    private let oidc = OIDCClient()

    private let accessKey = "access_token"
    private let refreshKey = "refresh_token"

    /// Access-Token für authentifizierte API-Aufrufe (Bearer).
    private(set) var accessToken: String?

    init() {
        accessToken = keychain.get(accessKey)
        isLoggedIn = accessToken != nil
    }

    func login() async {
        lastError = nil
        do {
            let tokens = try await oidc.login()
            keychain.set(tokens.accessToken, for: accessKey)
            if let refresh = tokens.refreshToken {
                keychain.set(refresh, for: refreshKey)
            }
            accessToken = tokens.accessToken
            isLoggedIn = true
        } catch {
            lastError = "Anmeldung fehlgeschlagen."
        }
    }

    func logout() {
        keychain.remove(accessKey)
        keychain.remove(refreshKey)
        accessToken = nil
        isLoggedIn = false
    }
}
