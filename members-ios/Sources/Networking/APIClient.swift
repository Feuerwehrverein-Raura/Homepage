import Foundation

/// Schlanker REST-Client (URLSession + Codable). Konkrete Endpunkte/Modelle
/// kommen in Phase 2 (Spiegel von Android `EventsApi`/`MembersApi`).
struct APIClient {
    let baseURL: URL
    let tokenProvider: () async -> String?
    /// Erneuert die Tokens und meldet, ob danach ein frischer Access-Token
    /// bereitsteht. Wird bei 401 genau einmal pro Anfrage aufgerufen.
    var refresh: (() async -> Bool)?

    enum APIError: Error {
        case badStatus(Int)
        case noResponse
    }

    func get<T: Decodable>(_ path: String) async throws -> T {
        let data = try await send(path: path)
        return try JSONDecoder().decode(T.self, from: data)
    }

    // MARK: Intern

    /// Führt die Anfrage aus und wiederholt sie einmal, wenn der Server mit
    /// 401 antwortet und der Refresh geklappt hat.
    ///
    /// Bewusst nur bei 401, nicht auch bei 403 wie in der Android-App: dort
    /// deckt der 403-Fall den stillen Re-Login mit dem QR-Token ab, den es
    /// auf iOS nicht gibt. Ein 403 heisst hier „angemeldet, aber nicht
    /// berechtigt" — daran ändert ein frischer Token nichts.
    private func send(path: String) async throws -> Data {
        let (data, status) = try await perform(path: path)
        guard status == 401, let refresh else {
            return try verify(data: data, status: status)
        }
        guard await refresh() else {
            throw APIError.badStatus(status)
        }
        let (retryData, retryStatus) = try await perform(path: path)
        return try verify(data: retryData, status: retryStatus)
    }

    private func perform(path: String) async throws -> (Data, Int) {
        var req = URLRequest(url: baseURL.appendingPathComponent(path))
        req.httpMethod = "GET"
        req.setValue("application/json", forHTTPHeaderField: "Accept")
        if let token = await tokenProvider() {
            req.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        }
        let (data, resp) = try await URLSession.shared.data(for: req)
        guard let http = resp as? HTTPURLResponse else {
            throw APIError.noResponse
        }
        return (data, http.statusCode)
    }

    private func verify(data: Data, status: Int) throws -> Data {
        guard (200..<300).contains(status) else {
            throw APIError.badStatus(status)
        }
        return data
    }
}
