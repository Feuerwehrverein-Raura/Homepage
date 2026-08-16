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
