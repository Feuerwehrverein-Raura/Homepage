import Foundation

/// Schlanker REST-Client (URLSession + Codable). Konkrete Endpunkte/Modelle
/// kommen in Phase 2 (Spiegel von Android `EventsApi`/`MembersApi`).
struct APIClient {
    let baseURL: URL
    let tokenProvider: () -> String?

    enum APIError: Error {
        case badStatus(Int)
    }

    func get<T: Decodable>(_ path: String) async throws -> T {
        var req = URLRequest(url: baseURL.appendingPathComponent(path))
        req.httpMethod = "GET"
        req.setValue("application/json", forHTTPHeaderField: "Accept")
        if let token = tokenProvider() {
            req.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        }
        let (data, resp) = try await URLSession.shared.data(for: req)
        guard let http = resp as? HTTPURLResponse, (200..<300).contains(http.statusCode) else {
            throw APIError.badStatus((resp as? HTTPURLResponse)?.statusCode ?? -1)
        }
        return try JSONDecoder().decode(T.self, from: data)
    }
}
