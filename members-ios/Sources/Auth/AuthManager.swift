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
    private var refreshToken: String?

    /// Laufender Refresh. Mehrere Views laden beim Start gleichzeitig, und
    /// jede von ihnen kann ein 401 kassieren — ohne diese Klammer würden sie
    /// denselben Refresh-Token mehrfach parallel einlösen. Authentik gibt bei
    /// Rotation jedes Mal einen neuen aus, der zweite Versuch liefe also mit
    /// einem bereits verbrauchten Token ins Leere und würde uns abmelden.
    private var refreshTask: Task<Bool, Never>?

    init() {
        accessToken = keychain.get(accessKey)
        refreshToken = keychain.get(refreshKey)
        isLoggedIn = accessToken != nil
    }

    /// API-Client, der seine Tokens von hier bezieht und bei 401 selbst
    /// erneuern lässt. Views sollen ihn hierüber holen, statt sich einen
    /// eigenen zu bauen — sonst hängt er nicht am Refresh.
    func api() -> APIClient {
        APIClient(
            baseURL: AppConfig.apiBase,
            tokenProvider: { [weak self] in self?.accessToken },
            refresh: { [weak self] in await self?.refreshTokens() ?? false }
        )
    }

    func login() async {
        lastError = nil
        do {
            store(try await oidc.login())
            isLoggedIn = true
        } catch {
            lastError = "Anmeldung fehlgeschlagen."
        }
    }

    /// Löst den Refresh-Token ein. Gibt `true` zurück, wenn danach ein
    /// frischer Access-Token bereitsteht. Schlägt der Refresh fehl, ist die
    /// Sitzung endgültig vorbei — dann wird abgemeldet, damit der Nutzer den
    /// Login-Screen sieht statt einer App, die nur noch Ladefehler zeigt.
    func refreshTokens() async -> Bool {
        if let refreshTask {
            return await refreshTask.value
        }
        let task = Task<Bool, Never> { [weak self] in
            guard let self else { return false }
            return await self.performRefresh()
        }
        refreshTask = task
        let success = await task.value
        refreshTask = nil
        return success
    }

    func logout() {
        keychain.remove(accessKey)
        keychain.remove(refreshKey)
        accessToken = nil
        refreshToken = nil
        isLoggedIn = false
    }

    // MARK: Intern

    private func performRefresh() async -> Bool {
        guard let refreshToken else {
            // Ohne Refresh-Token (z.B. Login ohne offline_access) hilft nur
            // eine neue Anmeldung.
            expire()
            return false
        }
        do {
            store(try await oidc.refresh(refreshToken: refreshToken))
            return true
        } catch {
            expire()
            return false
        }
    }

    /// Sitzung abgelaufen: abmelden und den Grund am Login-Screen anzeigen.
    private func expire() {
        logout()
        lastError = "Sitzung abgelaufen — bitte neu anmelden."
    }

    private func store(_ tokens: OIDCClient.Tokens) {
        keychain.set(tokens.accessToken, for: accessKey)
        accessToken = tokens.accessToken
        // Authentik rotiert den Refresh-Token; liefert es keinen neuen mit,
        // bleibt der bisherige gültig und muss erhalten bleiben.
        if let refresh = tokens.refreshToken {
            keychain.set(refresh, for: refreshKey)
            refreshToken = refresh
        }
    }
}
