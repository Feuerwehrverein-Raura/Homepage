import Contacts
import Foundation

/// Überträgt das Mitgliederverzeichnis ins iPhone-Adressbuch.
///
/// Bewusst ein manueller Import, kein Sync-Adapter wie auf Android: iOS hat
/// dafür kein Gegenstück, und ein eigenes Konto samt Hintergrundabgleich wäre
/// für ein Vereinsverzeichnis unverhältnismässig.
///
/// Damit ein zweiter Import keine Dubletten erzeugt, merkt sich die App pro
/// Mitglied die Kontakt-Kennung. Der naheliegende Weg — eine Markierung im
/// Notizfeld — scheidet aus: seit iOS 13 braucht der Zugriff auf
/// `CNContact.note` eine gesonderte, von Apple freizugebende Berechtigung.
struct ContactsImporter {

    struct Result {
        var added = 0
        var updated = 0
        var total: Int { added + updated }
    }

    enum ImportError: LocalizedError {
        case accessDenied

        var errorDescription: String? {
            switch self {
            case .accessDenied:
                return "Kein Zugriff aufs Adressbuch. In den iOS-Einstellungen "
                     + "unter Datenschutz → Kontakte freigeben."
            }
        }
    }

    /// Zuordnung Mitglieds-ID → Kontakt-Kennung aus früheren Importen.
    private static let mappingKey = "contacts.importedIdentifiers"

    private let store = CNContactStore()

    func `import`(_ entries: [DirectoryEntry]) async throws -> Result {
        guard try await requestAccess() else { throw ImportError.accessDenied }

        var mapping = UserDefaults.standard.dictionary(forKey: Self.mappingKey) as? [String: String] ?? [:]
        var result = Result()
        let save = CNSaveRequest()

        for entry in entries where !entry.fullName.isEmpty {
            if let identifier = mapping[entry.id],
               let existing = try? fetchContact(identifier) {
                let contact = existing.mutableCopy() as! CNMutableContact
                apply(entry, to: contact)
                save.update(contact)
                result.updated += 1
            } else {
                let contact = CNMutableContact()
                apply(entry, to: contact)
                // Ohne Container-Angabe landet der Kontakt im Standardkonto
                // des Geräts — das ist für einen manuellen Import gewollt.
                save.add(contact, toContainerWithIdentifier: nil)
                mapping[entry.id] = contact.identifier
                result.added += 1
            }
        }

        try store.execute(save)
        UserDefaults.standard.set(mapping, forKey: Self.mappingKey)
        return result
    }

    // MARK: Intern

    private func requestAccess() async throws -> Bool {
        switch CNContactStore.authorizationStatus(for: .contacts) {
        case .authorized:
            return true
        case .notDetermined:
            return try await store.requestAccess(for: .contacts)
        default:
            return false
        }
    }

    private func fetchContact(_ identifier: String) throws -> CNContact {
        let keys: [CNKeyDescriptor] = [CNContactVCardSerialization.descriptorForRequiredKeys()]
        return try store.unifiedContact(withIdentifier: identifier, keysToFetch: keys)
    }

    private func apply(_ entry: DirectoryEntry, to contact: CNMutableContact) {
        contact.givenName = entry.vorname ?? ""
        contact.familyName = entry.nachname ?? ""
        contact.organizationName = "Feuerwehrverein Raura"
        contact.jobTitle = entry.funktion ?? ""

        contact.emailAddresses = [entry.email]
            .compactMap { $0 }
            .filter { !$0.isEmpty }
            .map { CNLabeledValue(label: CNLabelWork, value: $0 as NSString) }

        var numbers: [CNLabeledValue<CNPhoneNumber>] = []
        if let mobile = entry.mobile, !mobile.isEmpty {
            numbers.append(CNLabeledValue(label: CNLabelPhoneNumberMobile,
                                          value: CNPhoneNumber(stringValue: mobile)))
        }
        if let phone = entry.telefon, !phone.isEmpty {
            numbers.append(CNLabeledValue(label: CNLabelHome,
                                          value: CNPhoneNumber(stringValue: phone)))
        }
        contact.phoneNumbers = numbers
    }
}
