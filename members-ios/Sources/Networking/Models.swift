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
    let maxParticipants: Int?
    let shifts: [Shift]?

    enum CodingKeys: String, CodingKey {
        case id, title, subtitle, category, status, location, description, cost, shifts
        case startDate = "start_date"
        case endDate = "end_date"
        case organizerName = "organizer_name"
        case maxParticipants = "max_participants"
    }
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
    let eventTitle: String?
    let eventStartDate: String?
    let eventLocation: String?

    enum CodingKeys: String, CodingKey {
        case id, status
        case eventTitle = "event_title"
        case eventStartDate = "event_start_date"
        case eventLocation = "event_location"
    }
}
