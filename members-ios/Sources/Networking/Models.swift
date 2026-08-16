import Foundation

/// Codable-Modelle, gespiegelt von der Android-App (gleiche JSON-Felder).

struct Event: Codable, Identifiable, Hashable {
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

    static func == (lhs: Event, rhs: Event) -> Bool { lhs.id == rhs.id }
    func hash(into hasher: inout Hasher) { hasher.combine(id) }
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

// MARK: Kalender

/// Eintrag aus `GET calendar/items` — fasst Anlässe, Beiträge und Versände
/// zusammen. `type` ist eines von: event, board_meeting, fee_due, fee_paid,
/// letter, email.
struct CalendarItem: Decodable, Identifiable {
    let id: String
    let type: String
    let date: String
    let title: String
    let subtitle: String?
    let description: String?
    let refId: String?
}

// MARK: Anlass vorschlagen

/// Body für `POST events/propose`.
///
/// Achtung, anders als bei `registrations/public`: hier will das Backend
/// **snake_case**. Die Android-App baut dafür von Hand eine Map, statt ihr
/// Datenmodell zu serialisieren — wer sich an der Anmeldung orientiert und
/// camelCase schickt, verliert Datum und Ort stillschweigend.
struct ProposeEventRequest: Encodable {
    let title: String
    let startDate: String
    var endDate: String?
    var location: String?
    var category: String?
    var cost: String?
    var description: String?

    enum CodingKeys: String, CodingKey {
        case title, location, category, cost, description
        case startDate = "start_date"
        case endDate = "end_date"
    }
}

// MARK: Newsletter

struct NewsletterEmailRequest: Encodable {
    let email: String
}

struct NewsletterResponse: Decodable {
    let success: Bool?
    let message: String?
}

// MARK: Anmeldung per QR-Code und Passwort-Reset

/// Inhalt eines gescannten Login-QR-Codes.
struct QrLoginPayload: Decodable {
    let v: Int?
    let type: String?
    let email: String?
    let token: String?

    /// Ob der Code zu einem Organisator gehört. Android unterscheidet am
    /// `type`-Feld bzw. am Präfix des Rohtextes.
    var isOrganizer: Bool { type == "fwv-organizer-login" }
}

struct QrLoginRequest: Encodable {
    let token: String
}

struct LoginResponse: Decodable {
    let success: Bool?
    let token: String?
    let eventId: String?

    enum CodingKeys: String, CodingKey {
        case success, token
        case eventId = "event_id"
    }
}

struct RequestResetRequest: Encodable {
    let email: String
}

/// Body für `POST auth/member/reset`.
///
/// `new_password` in snake_case — die Android-App setzt hier eigens ein
/// `@SerializedName`, während die übrigen Felder ihre Namen behalten.
struct ResetRequest: Encodable {
    let email: String
    let code: String
    let newPassword: String

    enum CodingKeys: String, CodingKey {
        case email, code
        case newPassword = "new_password"
    }
}

/// Antwort von `auth/member/login`, `-/reset` und `-/request-reset`.
/// Alle Felder optional, damit Erfolg und Fehler mit demselben Typ gelesen
/// werden können — das Backend schickt bei Fehlern `{error}`.
struct MemberAuthResponse: Decodable {
    let success: Bool?
    let token: String?
    let message: String?
    let error: String?
}

// MARK: Organisator

/// Eine Anmeldung, wie sie der Organisator sieht
/// (`GET events/{id}/organizer-registrations`).
struct EventRegistration: Decodable, Identifiable {
    let id: String
    let eventId: String?
    let memberId: String?
    let guestName: String?
    let guestEmail: String?
    let status: String?
    let notes: String?
    let createdAt: String?
    let memberVorname: String?
    let memberNachname: String?

    enum CodingKeys: String, CodingKey {
        case id, status, notes
        case eventId = "event_id"
        case memberId = "member_id"
        case guestName = "guest_name"
        case guestEmail = "guest_email"
        case createdAt = "created_at"
        case memberVorname = "member_vorname"
        case memberNachname = "member_nachname"
    }

    /// Angezeigter Name: Mitglied vor Gast.
    var displayName: String {
        let member = [memberVorname, memberNachname]
            .compactMap { $0 }
            .joined(separator: " ")
            .trimmingCharacters(in: .whitespaces)
        if !member.isEmpty { return member }
        return guestName ?? guestEmail ?? "Unbekannt"
    }
}

/// Begleitperson einer Anmeldung.
struct RegCompanion: Identifiable {
    let name: String
    let email: String?
    let phone: String?

    var id: String { name }
}

/// Aus dem rohen `notes`-Feld geparste Zusatzdaten.
///
/// Das Backend legt dort JSON ab: `{phone, participants, companions,
/// allergies, meal_selection, notes}`. Ganz alte Anmeldungen enthalten
/// stattdessen reinen Freitext. Ohne die Unterscheidung stünde im
/// Organisator-Bereich rohes JSON auf dem Bildschirm.
struct RegNotes {
    var phone: String?
    var participants: Int = 1
    var companions: [RegCompanion] = []
    var allergies: String?
    var mealSelection: String?
    var text: String?

    var isEmpty: Bool {
        (phone?.isEmpty ?? true) && companions.isEmpty
            && (allergies?.isEmpty ?? true) && (mealSelection?.isEmpty ?? true)
            && (text?.isEmpty ?? true)
    }

    /// Defensiv wie `parseRegNotes` der Android-App: kein JSON-Objekt heisst
    /// Freitext, Begleitpersonen können Zeichenkette oder Objekt sein, und
    /// jeder Fehler fällt sicher auf Freitext zurück.
    static func parse(_ raw: String?) -> RegNotes {
        guard let raw, !raw.trimmingCharacters(in: .whitespaces).isEmpty else {
            return RegNotes()
        }
        guard let data = raw.data(using: .utf8),
              let object = try? JSONSerialization.jsonObject(with: data),
              let dict = object as? [String: Any] else {
            return RegNotes(text: raw)
        }

        func string(_ key: String) -> String? {
            guard let value = dict[key] as? String else { return nil }
            return value.isEmpty ? nil : value
        }

        var notes = RegNotes()
        notes.phone = string("phone")
        if let count = dict["participants"] as? Int, count >= 1 {
            notes.participants = count
        }
        notes.allergies = string("allergies")
        notes.mealSelection = string("meal_selection")
        notes.text = string("notes")

        if let raw = dict["companions"] as? [Any] {
            notes.companions = raw.compactMap { entry in
                if let name = entry as? String, !name.isEmpty {
                    return RegCompanion(name: name, email: nil, phone: nil)
                }
                if let object = entry as? [String: Any],
                   let name = object["name"] as? String, !name.isEmpty {
                    return RegCompanion(name: name,
                                        email: object["email"] as? String,
                                        phone: object["phone"] as? String)
                }
                return nil
            }
        }
        return notes
    }
}

/// Body für `POST events/{id}/registrations-as-organizer` — der Organisator
/// trägt jemanden von Hand ein, etwa nach einer telefonischen Meldung.
/// Entweder ein Mitglied (`member_id`) oder ein Gast mit Namen.
struct OrganizerAddRegistrationRequest: Encodable {
    var memberId: String?
    var guestName: String?
    var guestEmail: String?
    var guestPhone: String?
    var participants: Int?
    var notes: String?

    enum CodingKeys: String, CodingKey {
        case participants, notes
        case memberId = "member_id"
        case guestName = "guest_name"
        case guestEmail = "guest_email"
        case guestPhone = "guest_phone"
    }
}

/// Body für `PUT events/{eventId}/registrations/{regId}/as-organizer`.
/// Felder, die null bleiben, rührt das Backend nicht an.
struct OrganizerEditRegistrationRequest: Encodable {
    var guestName: String?
    var guestEmail: String?
    var guestPhone: String?
    var participants: Int?
    var notes: String?
    var status: String?

    enum CodingKeys: String, CodingKey {
        case participants, notes, status
        case guestName = "guest_name"
        case guestEmail = "guest_email"
        case guestPhone = "guest_phone"
    }
}

/// Ergebnis von `POST events/{id}/notify-registrants-as-organizer`.
/// `unreachable` zählt auf, wen die Nachricht nicht erreicht hat — der
/// Organisator sollte das sehen, statt zu glauben, alle seien informiert.
struct NotifyResult: Decodable {
    let success: Bool?
    let emailed: Int?
    let posted: Int?
    let skipped: Int?
    let unreachable: [String]?
}

struct NotifyRequest: Encodable {
    let subject: String
    let message: String
}

/// Eintrag des Mitgliederverzeichnisses (`GET members/directory`) — hier für
/// die Auswahl beim Eintragen von Hand.
struct DirectoryEntry: Decodable, Identifiable {
    let id: String
    let vorname: String?
    let nachname: String?
    let email: String?
    let mobile: String?
    let telefon: String?
    let funktion: String?

    var fullName: String {
        [vorname, nachname].compactMap { $0 }
            .joined(separator: " ")
            .trimmingCharacters(in: .whitespaces)
    }
}
