import Foundation

enum DateFormat {
    /// Wandelt "2026-07-15" bzw. "2026-07-15T…" in "15.07.2026". Sonst Rohwert.
    static func swiss(_ raw: String?) -> String {
        guard let raw, raw.count >= 10 else { return raw ?? "" }
        let ymd = String(raw.prefix(10)).split(separator: "-")
        guard ymd.count == 3 else { return raw }
        return "\(ymd[2]).\(ymd[1]).\(ymd[0])"
    }

    private static let monthNames = [
        "Januar", "Februar", "März", "April", "Mai", "Juni",
        "Juli", "August", "September", "Oktober", "November", "Dezember"
    ]

    /// "2026-07-15" wird zu "Juli 2026" — fuer Abschnittsueberschriften.
    /// Bewusst ohne DateFormatter: die Werte kommen als feste ISO-Praefixe,
    /// und ein DateFormatter braeuchte hier nur Zeitzonen-Sorgfalt ohne
    /// Gegenwert.
    static func monthYear(_ raw: String?) -> String {
        guard let raw, raw.count >= 7 else { return raw ?? "" }
        let parts = String(raw.prefix(7)).split(separator: "-")
        guard parts.count == 2, let month = Int(parts[1]),
              (1...12).contains(month) else { return raw }
        return "\(monthNames[month - 1]) \(parts[0])"
    }
}
