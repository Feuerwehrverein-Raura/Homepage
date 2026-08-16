import Foundation
import OSLog
import Security

/// Minimaler Keychain-Wrapper für Tokens (generisches Passwort pro Account).
///
/// Die Rückgabewerte von `SecItemAdd` und Co. werden **nicht** verworfen:
/// schlägt das Schreiben fehl, merkt man das sonst erst daran, dass die App
/// bei jedem Start wieder nach der Anmeldung fragt — ohne jeden Hinweis
/// darauf, woran es liegt.
struct Keychain {
    let service: String

    private static let log = Logger(subsystem: "ch.fwvraura.members",
                                    category: "keychain")

    @discardableResult
    func set(_ value: String, for key: String) -> Bool {
        let base: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: service,
            kSecAttrAccount as String: key
        ]
        SecItemDelete(base as CFDictionary)

        var add = base
        add[kSecValueData as String] = Data(value.utf8)
        // Ohne diese Angabe gilt die Vorgabe „nur bei entsperrtem Geraet",
        // was hier passt — aber ausdrueckliches Setzen macht es lesbar.
        add[kSecAttrAccessible as String] = kSecAttrAccessibleAfterFirstUnlock

        let status = SecItemAdd(add as CFDictionary, nil)
        guard status == errSecSuccess else {
            Self.log.error("""
                Speichern von \(key, privacy: .public) fehlgeschlagen: \
                OSStatus \(status, privacy: .public) \
                (\(Self.describe(status), privacy: .public))
                """)
            return false
        }
        return true
    }

    func get(_ key: String) -> String? {
        let query: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: service,
            kSecAttrAccount as String: key,
            kSecReturnData as String: true,
            kSecMatchLimit as String: kSecMatchLimitOne
        ]
        var result: AnyObject?
        let status = SecItemCopyMatching(query as CFDictionary, &result)

        // Kein Eintrag vorhanden ist der Normalfall vor der ersten Anmeldung
        // und keine Meldung wert.
        if status == errSecItemNotFound { return nil }

        guard status == errSecSuccess,
              let data = result as? Data,
              let text = String(data: data, encoding: .utf8) else {
            Self.log.error("""
                Lesen von \(key, privacy: .public) fehlgeschlagen: \
                OSStatus \(status, privacy: .public) \
                (\(Self.describe(status), privacy: .public))
                """)
            return nil
        }
        return text
    }

    func remove(_ key: String) {
        let query: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: service,
            kSecAttrAccount as String: key
        ]
        let status = SecItemDelete(query as CFDictionary)
        if status != errSecSuccess && status != errSecItemNotFound {
            Self.log.error("""
                Loeschen von \(key, privacy: .public) fehlgeschlagen: \
                OSStatus \(status, privacy: .public)
                """)
        }
    }

    /// Die Statuscodes, die hier realistisch auftreten — damit im Protokoll
    /// nicht nur eine nackte Zahl steht.
    private static func describe(_ status: OSStatus) -> String {
        switch status {
        case -34018: return "errSecMissingEntitlement — App ohne Signatur/Entitlements gebaut"
        case errSecItemNotFound: return "errSecItemNotFound"
        case errSecDuplicateItem: return "errSecDuplicateItem"
        case errSecAuthFailed: return "errSecAuthFailed"
        case errSecInteractionNotAllowed: return "errSecInteractionNotAllowed — Geraet gesperrt"
        default:
            return SecCopyErrorMessageString(status, nil) as String? ?? "unbekannt"
        }
    }
}
