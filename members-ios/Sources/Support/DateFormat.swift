import Foundation

enum DateFormat {
    /// Wandelt "2026-07-15" bzw. "2026-07-15T…" in "15.07.2026". Sonst Rohwert.
    static func swiss(_ raw: String?) -> String {
        guard let raw, raw.count >= 10 else { return raw ?? "" }
        let ymd = String(raw.prefix(10)).split(separator: "-")
        guard ymd.count == 3 else { return raw }
        return "\(ymd[2]).\(ymd[1]).\(ymd[0])"
    }
}
