import Foundation

/// Schlanker REST-Client (URLSession + Codable), Gegenstück zu Androids
/// `EventsApi`/`MembersApi`.
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
        let data = try await send(path: path, method: "GET", body: nil)
        return try JSONDecoder().decode(T.self, from: data)
    }

    func post<Body: Encodable, T: Decodable>(_ path: String, body: Body) async throws -> T {
        let encoded = try JSONEncoder().encode(body)
        let data = try await send(path: path, method: "POST", body: encoded)
        return try JSONDecoder().decode(T.self, from: data)
    }

    func put<Body: Encodable, T: Decodable>(_ path: String, body: Body) async throws -> T {
        let encoded = try JSONEncoder().encode(body)
        let data = try await send(path: path, method: "PUT", body: encoded)
        return try JSONDecoder().decode(T.self, from: data)
    }

    /// PUT ohne verwertbare Antwort — das Backend schickt bei manchen
    /// Endpunkten einen leeren Body, den kein Decoder annehmen würde.
    func put<Body: Encodable>(_ path: String, body: Body) async throws {
        let encoded = try JSONEncoder().encode(body)
        _ = try await send(path: path, method: "PUT", body: encoded)
    }

    func delete(_ path: String) async throws {
        _ = try await send(path: path, method: "DELETE", body: nil)
    }

    /// Datei-Upload als `multipart/form-data`.
    ///
    /// Von Hand zusammengesetzt statt über eine Bibliothek: es geht um genau
    /// einen Teil, und URLSession bringt dafür nichts mit.
    func upload<T: Decodable>(
        _ path: String,
        fieldName: String,
        filename: String,
        mimeType: String,
        data fileData: Data
    ) async throws -> T {
        let boundary = "Boundary-\(UUID().uuidString)"
        var body = Data()
        func append(_ text: String) { body.append(Data(text.utf8)) }

        append("--\(boundary)\r\n")
        append("Content-Disposition: form-data; name=\"\(fieldName)\"; filename=\"\(filename)\"\r\n")
        append("Content-Type: \(mimeType)\r\n\r\n")
        body.append(fileData)
        append("\r\n--\(boundary)--\r\n")

        let response = try await send(
            path: path,
            method: "POST",
            body: body,
            contentType: "multipart/form-data; boundary=\(boundary)"
        )
        return try JSONDecoder().decode(T.self, from: response)
    }

    // MARK: Intern

    /// Führt die Anfrage aus und wiederholt sie einmal, wenn der Server mit
    /// 401 antwortet und der Refresh geklappt hat.
    ///
    /// Bewusst nur bei 401, nicht auch bei 403 wie in der Android-App: dort
    /// deckt der 403-Fall den stillen Re-Login mit dem QR-Token ab, den es
    /// auf iOS nicht gibt. Ein 403 heisst hier „angemeldet, aber nicht
    /// berechtigt" — daran ändert ein frischer Token nichts.
    private func send(
        path: String,
        method: String,
        body: Data?,
        contentType: String = "application/json"
    ) async throws -> Data {
        let (data, status) = try await perform(
            path: path, method: method, body: body, contentType: contentType)
        guard status == 401, let refresh else {
            return try verify(data: data, status: status)
        }
        guard await refresh() else {
            throw APIError.badStatus(status)
        }
        let (retryData, retryStatus) = try await perform(
            path: path, method: method, body: body, contentType: contentType)
        return try verify(data: retryData, status: retryStatus)
    }

    private func perform(
        path: String,
        method: String,
        body: Data?,
        contentType: String
    ) async throws -> (Data, Int) {
        var req = URLRequest(url: baseURL.appendingPathComponent(path))
        req.httpMethod = method
        req.setValue("application/json", forHTTPHeaderField: "Accept")
        if let body {
            req.httpBody = body
            req.setValue(contentType, forHTTPHeaderField: "Content-Type")
        }
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
