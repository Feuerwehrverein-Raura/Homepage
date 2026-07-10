import Foundation
import AuthenticationServices
import CryptoKit
import UIKit

/// OIDC-Login gegen Authentik via Authorization-Code-Flow mit PKCE.
/// Nutzt ASWebAuthenticationSession (System-Browser) — kein Fremd-SDK.
final class OIDCClient: NSObject, ASWebAuthenticationPresentationContextProviding {

    struct Tokens {
        let accessToken: String
        let refreshToken: String?
    }

    enum OIDCError: Error {
        case discoveryFailed
        case noCode
        case cancelled
        case cannotStart
        case tokenExchangeFailed
    }

    /// Muss stark referenziert bleiben, solange der Browser-Dialog offen ist.
    private var authSession: ASWebAuthenticationSession?

    // MARK: Ablauf

    func login() async throws -> Tokens {
        let discovery = try await fetchDiscovery()
        let verifier = Self.randomURLSafe(64)
        let challenge = Self.codeChallenge(for: verifier)

        let authURL = buildAuthorizationURL(endpoint: discovery.authorizationEndpoint, challenge: challenge)
        let callback = try await presentAuth(url: authURL)

        guard let code = URLComponents(url: callback, resolvingAgainstBaseURL: false)?
            .queryItems?.first(where: { $0.name == "code" })?.value else {
            throw OIDCError.noCode
        }
        return try await exchange(code: code, verifier: verifier, tokenEndpoint: discovery.tokenEndpoint)
    }

    // MARK: Discovery

    private struct Discovery: Decodable {
        let authorizationEndpoint: URL
        let tokenEndpoint: URL
        enum CodingKeys: String, CodingKey {
            case authorizationEndpoint = "authorization_endpoint"
            case tokenEndpoint = "token_endpoint"
        }
    }

    private func fetchDiscovery() async throws -> Discovery {
        let url = AppConfig.oidcIssuer.appendingPathComponent(".well-known/openid-configuration")
        do {
            let (data, _) = try await URLSession.shared.data(from: url)
            return try JSONDecoder().decode(Discovery.self, from: data)
        } catch {
            throw OIDCError.discoveryFailed
        }
    }

    // MARK: Authorization-Request

    private func buildAuthorizationURL(endpoint: URL, challenge: String) -> URL {
        var comps = URLComponents(url: endpoint, resolvingAgainstBaseURL: false)!
        comps.queryItems = [
            URLQueryItem(name: "client_id", value: AppConfig.oidcClientID),
            URLQueryItem(name: "response_type", value: "code"),
            URLQueryItem(name: "redirect_uri", value: AppConfig.oidcRedirectURI),
            URLQueryItem(name: "scope", value: AppConfig.oidcScopes.joined(separator: " ")),
            URLQueryItem(name: "code_challenge", value: challenge),
            URLQueryItem(name: "code_challenge_method", value: "S256"),
            URLQueryItem(name: "state", value: Self.randomURLSafe(16))
        ]
        return comps.url!
    }

    @MainActor
    private func presentAuth(url: URL) async throws -> URL {
        try await withCheckedThrowingContinuation { (cont: CheckedContinuation<URL, Error>) in
            let session = ASWebAuthenticationSession(
                url: url,
                callbackURLScheme: AppConfig.oidcCallbackScheme
            ) { callbackURL, error in
                if let callbackURL {
                    cont.resume(returning: callbackURL)
                } else {
                    cont.resume(throwing: error ?? OIDCError.cancelled)
                }
            }
            session.presentationContextProvider = self
            session.prefersEphemeralWebBrowserSession = false
            authSession = session
            if !session.start() {
                cont.resume(throwing: OIDCError.cannotStart)
            }
        }
    }

    // MARK: Token-Exchange

    private func exchange(code: String, verifier: String, tokenEndpoint: URL) async throws -> Tokens {
        var req = URLRequest(url: tokenEndpoint)
        req.httpMethod = "POST"
        req.setValue("application/x-www-form-urlencoded", forHTTPHeaderField: "Content-Type")
        let form: [String: String] = [
            "grant_type": "authorization_code",
            "code": code,
            "redirect_uri": AppConfig.oidcRedirectURI,
            "client_id": AppConfig.oidcClientID,
            "code_verifier": verifier
        ]
        req.httpBody = form
            .map { "\($0.key)=\(Self.formEncode($0.value))" }
            .joined(separator: "&")
            .data(using: .utf8)

        struct TokenResponse: Decodable {
            let accessToken: String
            let refreshToken: String?
            enum CodingKeys: String, CodingKey {
                case accessToken = "access_token"
                case refreshToken = "refresh_token"
            }
        }

        let (data, resp) = try await URLSession.shared.data(for: req)
        guard let http = resp as? HTTPURLResponse, (200..<300).contains(http.statusCode) else {
            throw OIDCError.tokenExchangeFailed
        }
        let tr = try JSONDecoder().decode(TokenResponse.self, from: data)
        return Tokens(accessToken: tr.accessToken, refreshToken: tr.refreshToken)
    }

    // MARK: PKCE-Helfer

    private static func randomURLSafe(_ length: Int) -> String {
        var bytes = [UInt8](repeating: 0, count: length)
        _ = SecRandomCopyBytes(kSecRandomDefault, length, &bytes)
        return Data(bytes).base64URLEncodedString()
    }

    private static func codeChallenge(for verifier: String) -> String {
        let hash = SHA256.hash(data: Data(verifier.utf8))
        return Data(hash).base64URLEncodedString()
    }

    private static func formEncode(_ value: String) -> String {
        var allowed = CharacterSet.alphanumerics
        allowed.insert(charactersIn: "-._~")
        return value.addingPercentEncoding(withAllowedCharacters: allowed) ?? value
    }

    // MARK: ASWebAuthenticationPresentationContextProviding

    func presentationAnchor(for session: ASWebAuthenticationSession) -> ASPresentationAnchor {
        UIApplication.shared.connectedScenes
            .compactMap { $0 as? UIWindowScene }
            .flatMap { $0.windows }
            .first { $0.isKeyWindow } ?? ASPresentationAnchor()
    }
}
