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
    private let qrKey = "qr_token"
    private let accountTypeKey = "account_type"

    /// Access-Token für authentifizierte API-Aufrufe (Bearer).
    private(set) var accessToken: String?
    private var refreshToken: String?
    /// Der gescannte QR-Token. Anders als ein Refresh-Token laeuft er nicht
    /// ab: der gedruckte Code IST die dauerhafte Berechtigung. Er dient
    /// deshalb als zweiter Weg, eine abgelaufene Sitzung zu erneuern.
    private var qrToken: String?
    private(set) var accountType: String?

    /// Laufender Refresh. Mehrere Views laden beim Start gleichzeitig, und
    /// jede von ihnen kann ein 401 kassieren — ohne diese Klammer würden sie
    /// denselben Refresh-Token mehrfach parallel einlösen. Authentik gibt bei
    /// Rotation jedes Mal einen neuen aus, der zweite Versuch liefe also mit
    /// einem bereits verbrauchten Token ins Leere und würde uns abmelden.
    private var refreshTask: Task<Bool, Never>?

    init() {
        accessToken = keychain.get(accessKey)
        refreshToken = keychain.get(refreshKey)
        qrToken = keychain.get(qrKey)
        accountType = keychain.get(accountTypeKey)
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

    /// Anmeldung mit einem gescannten QR-Code.
    /// Mitglieder und Organisatoren haben eigene Endpunkte.
    func loginWithQR(token: String, organizer: Bool) async -> String? {
        lastError = nil
        let path = organizer ? "auth/organizer/qr-login" : "auth/member/qr-login"
        do {
            let response: LoginResponse = try await api()
                .post(path, body: QrLoginRequest(token: token))
            guard let access = response.token, response.success != false else {
                return "Der Code wurde nicht angenommen."
            }
            keychain.set(access, for: accessKey)
            keychain.set(token, for: qrKey)
            keychain.set(organizer ? "organizer" : "member", for: accountTypeKey)
            accessToken = access
            qrToken = token
            accountType = organizer ? "organizer" : "member"
            isLoggedIn = true
            return nil
        } catch {
            return "Anmeldung mit dem Code ist fehlgeschlagen."
        }
    }

    /// Nach erfolgreichem Passwort-Reset liefert das Backend gleich ein
    /// Token — dann ist man ohne weiteren Schritt angemeldet.
    func acceptToken(_ token: String) {
        keychain.set(token, for: accessKey)
        accessToken = token
        accountType = "member"
        keychain.set("member", for: accountTypeKey)
        isLoggedIn = true
    }

    func logout() {
        keychain.remove(accessKey)
        keychain.remove(refreshKey)
        keychain.remove(qrKey)
        keychain.remove(accountTypeKey)
        accessToken = nil
        refreshToken = nil
        qrToken = nil
        accountType = nil
        isLoggedIn = false
    }

    // MARK: Intern

    private func performRefresh() async -> Bool {
        // Zwei Wege, wie in Androids AuthInterceptor: erst der OIDC-Refresh,
        // dann als Rueckfall der stille Re-Login mit dem QR-Token. Ohne den
        // zweiten Weg wuerden QR-Nutzer beim Ablaufen des Tokens hinausgeworfen
        // und muessten den gedruckten Code erneut scannen.
        if let refreshToken {
            do {
                store(try await oidc.refresh(refreshToken: refreshToken))
                return true
            } catch {
                // Weiter zum QR-Weg, statt hier schon aufzugeben.
            }
        }

        if let qrToken {
            let failure = await loginWithQR(
                token: qrToken, organizer: accountType == "organizer")
            if failure == nil { return true }
        }

        expire()
        return false
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
