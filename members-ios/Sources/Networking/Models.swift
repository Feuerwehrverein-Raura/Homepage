import Foundation

/// Codable-Modelle, gespiegelt von der Android-App (gleiche JSON-Felder).

struct Event: Codable, Identifiable {
    let id: String
    let title: String
    let subtitle: String?
    let category: String?
    let status: String?
    let startDate: String?
    let endDate: String?
    let location: String?
    let description: String?
    let cost: String?
    let organizerName: String?
    let organizerEmail: String?
    let maxParticipants: Int?
    let registrationRequired: Bool?
    let shifts: [Shift]?

    enum CodingKeys: String, CodingKey {
        case id, title, subtitle, category, status, location, description, cost, shifts
        case startDate = "start_date"
        case endDate = "end_date"
        case organizerName = "organizer_name"
        case organizerEmail = "organizer_email"
        case maxParticipants = "max_participants"
        case registrationRequired = "registration_required"
    }

    /// Wie in der Android-App: anmelden kann man, wenn der Anlass es verlangt
    /// oder wenn es Schichten zu besetzen gibt.
    var allowsRegistration: Bool {
        (registrationRequired ?? false) || !(shifts ?? []).isEmpty
    }

    var hasShifts: Bool { !(shifts ?? []).isEmpty }
}

struct Shift: Codable, Identifiable {
    let id: String
    let name: String
    let description: String?
    let date: String?
    let startTime: String?
    let endTime: String?
    let needed: Int?
    let bereich: String?

    enum CodingKeys: String, CodingKey {
        case id, name, description, date, needed, bereich
        case startTime = "start_time"
        case endTime = "end_time"
    }
}

struct MemberProfile: Codable {
    let id: String?
    let vorname: String?
    let nachname: String?
    let email: String?
    let anrede: String?
    let mobile: String?
    let telefon: String?
    let strasse: String?
    let plz: String?
    let ort: String?
    let funktion: String?
    let status: String?
    let geburtstag: String?
    /// Relativer Pfad wie "/uploads/abc.jpg" — das Backend liefert keine
    /// vollstaendige URL.
    let foto: String?

    /// Vollstaendige Bild-URL. Die Dateien liegen hinter express.static ohne
    /// Anmeldung, ein Token wird zum Laden also nicht gebraucht.
    var fotoURL: URL? {
        guard let foto, !foto.isEmpty else { return nil }
        return URL(string: foto, relativeTo: AppConfig.apiBase)
    }

    var fullName: String {
        [vorname, nachname].compactMap { $0 }
            .joined(separator: " ")
            .trimmingCharacters(in: .whitespaces)
    }
}

struct MyRegistration: Codable, Identifiable {
    let id: String
    let status: String?
    let eventId: String?
    let eventTitle: String?
    let eventStartDate: String?
    let eventEndDate: String?
    let eventLocation: String?
    let createdAt: String?
    let shifts: [RegistrationShift]?

    enum CodingKeys: String, CodingKey {
        case id, status, shifts
        case eventId = "event_id"
        case eventTitle = "event_title"
        case eventStartDate = "event_start_date"
        case eventEndDate = "event_end_date"
        case eventLocation = "event_location"
        case createdAt = "created_at"
    }
}

/// Schicht-Details, die das Backend zu einer eigenen Anmeldung mitliefert.
struct RegistrationShift: Codable, Identifiable {
    let id: String
    let name: String?
    let startTime: String?
    let endTime: String?

    enum CodingKeys: String, CodingKey {
        case id, name
        case startTime = "start_time"
        case endTime = "end_time"
    }
}

/// Body für POST /registrations/public.
///
/// Achtung bei den Schlüsseln: die Android-App schickt hier bewusst
/// **camelCase** (`eventId`, `shiftIds`), weil Gson ohne `@SerializedName`
/// die Feldnamen unverändert übernimmt. Das Backend erwartet es genau so —
/// eine Umschreibung auf snake_case würde die Anmeldung stillschweigend
/// unvollständig ankommen lassen.
struct PublicRegistrationRequest: Encodable {
    var type: String = "participant"
    let eventId: String
    var eventTitle: String?
    var organizerEmail: String?
    let name: String
    var email: String?
    var phone: String?
    var participants: Int?
    var notes: String?
    var allergies: String?
    /// Bei Schicht-Anmeldungen: IDs der gewählten Schichten.
    var shiftIds: [String]?
}

struct PublicRegistrationResponse: Decodable {
    let success: Bool?
    let message: String?
    let registrationId: String?
    let isMember: Bool?
}

// MARK: Eigene Daten bearbeiten

/// Body für `PUT members/me` — nur die Felder, die ein Mitglied selbst
/// ändern darf. Schlüssel wie in der Android-App (Gson ohne
/// `@SerializedName`), also unverändert die Feldnamen.
struct MemberProfileUpdate: Encodable {
    var anrede: String?
    var vorname: String?
    var nachname: String?
    var email: String?
    var geburtstag: String?
    var mobile: String?
    var telefon: String?
    var strasse: String?
    var plz: String?
    var ort: String?
}

struct PhotoUploadResponse: Decodable {
    let success: Bool?
    let photoUrl: String?

    enum CodingKeys: String, CodingKey {
        case success
        case photoUrl = "photo_url"
    }
}

/// Austritt beantragen. Löscht nichts — der Vorstand entscheidet.
struct AustrittRequest: Encodable {
    var reason: String?
    var austrittsdatum: String?
}

struct AustrittResponse: Decodable {
    let success: Bool?
    let message: String?
}

// MARK: Zugänge

/// Antwort von `GET members/me/accesses` — alles in einem Rutsch.
struct AccessesResponse: Decodable {
    var functionEmails: [FunctionEmail] = []
    var nextcloudFolders: [NextcloudFolder] = []
    var systemAccesses: [SystemAccess] = []
    var serviceAccounts: [ServiceAccount] = []
}

struct SystemAccess: Decodable, Identifiable {
    let system: String
    let url: String?
    let access: String?
    var enabled: Bool? = true

    var id: String { system }
}

/// Nextcloud-Gruppenordner. Das Schema kommt direkt von Nextcloud —
/// übernommen sind nur die Felder, die hier gebraucht werden.
struct NextcloudFolder: Decodable, Identifiable {
    let id: Int?
    let mountPoint: String?

    enum CodingKeys: String, CodingKey {
        case id
        case mountPoint = "mount_point"
    }
}

/// Funktions-E-Mail, etwa praesident@fwv-raura.ch.
struct FunctionEmail: Decodable, Identifiable {
    let function: String
    let email: String
    let password: String?
    let server: String?
    let imapPort: Int?
    let smtpPort: Int?
    let webmail: String?

    var id: String { email }
}

/// Geteilter Zugang, etwa für Kasse oder Küchendisplay.
struct ServiceAccount: Decodable, Identifiable {
    let accountName: String?
    let username: String
    let displayName: String?
    let password: String?
    let description: String?
    let rotationDays: Int?
    let nextRotation: String?

    var id: String { username }
}

struct ChangeFunctionEmailPasswordRequest: Encodable {
    let email: String
    let password: String
}
