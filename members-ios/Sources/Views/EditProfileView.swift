import SwiftUI
import PhotosUI

/// Eigenes Profil bearbeiten (`PUT members/me`) und das Profilfoto
/// austauschen. Änderbar sind nur die Felder, die das Backend einem
/// Mitglied selbst zugesteht — Funktion und Status gehören dem Vorstand.
struct EditProfileView: View {
    @EnvironmentObject var auth: AuthManager
    @Environment(\.dismiss) private var dismiss

    let profile: MemberProfile
    /// Wird nach dem Speichern aufgerufen, damit die Profilansicht neu lädt.
    var onSaved: () -> Void

    @State private var anrede = ""
    @State private var vorname = ""
    @State private var nachname = ""
    @State private var email = ""
    @State private var geburtstag = ""
    @State private var mobile = ""
    @State private var telefon = ""
    @State private var strasse = ""
    @State private var plz = ""
    @State private var ort = ""

    @State private var photoItem: PhotosPickerItem?
    @State private var photoStatus: String?
    @State private var uploading = false

    @State private var saving = false
    @State private var error: String?

    var body: some View {
        NavigationStack {
            Form {
                Section("Profilfoto") {
                    if let url = profile.fotoURL {
                        HStack {
                            AsyncImage(url: url) { image in
                                image.resizable().scaledToFill()
                            } placeholder: {
                                ProgressView()
                            }
                            .frame(width: 56, height: 56)
                            .clipShape(Circle())
                            Spacer()
                            Button("Entfernen", role: .destructive) {
                                Task { await deletePhoto() }
                            }
                            .font(.callout)
                            .disabled(uploading)
                        }
                    }

                    PhotosPicker(selection: $photoItem, matching: .images) {
                        HStack {
                            Label("Foto auswählen", systemImage: "camera")
                            if uploading {
                                Spacer()
                                ProgressView()
                            }
                        }
                    }
                    .disabled(uploading)

                    if let photoStatus {
                        Text(photoStatus)
                            .font(.footnote)
                            .foregroundStyle(.secondary)
                    }
                }

                Section("Name") {
                    TextField("Anrede", text: $anrede)
                    TextField("Vorname", text: $vorname)
                    TextField("Nachname", text: $nachname)
                    TextField("Geburtstag (JJJJ-MM-TT)", text: $geburtstag)
                        .keyboardType(.numbersAndPunctuation)
                }

                Section("Kontakt") {
                    TextField("E-Mail", text: $email)
                        .keyboardType(.emailAddress)
                        .textInputAutocapitalization(.never)
                    TextField("Mobile", text: $mobile)
                        .keyboardType(.phonePad)
                    TextField("Telefon", text: $telefon)
                        .keyboardType(.phonePad)
                }

                Section("Adresse") {
                    TextField("Strasse", text: $strasse)
                    TextField("PLZ", text: $plz)
                        .keyboardType(.numberPad)
                    TextField("Ort", text: $ort)
                }

                if let error {
                    Section {
                        Label(error, systemImage: "exclamationmark.triangle")
                            .foregroundStyle(.red)
                    }
                }
            }
            .navigationTitle("Profil bearbeiten")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Abbrechen") { dismiss() }
                }
                ToolbarItem(placement: .confirmationAction) {
                    if saving {
                        ProgressView()
                    } else {
                        Button("Sichern") { Task { await save() } }
                    }
                }
            }
            .onAppear(perform: fill)
            .onChange(of: photoItem) { _ in Task { await uploadPhoto() } }
        }
    }

    private func fill() {
        anrede = profile.anrede ?? ""
        vorname = profile.vorname ?? ""
        nachname = profile.nachname ?? ""
        email = profile.email ?? ""
        geburtstag = profile.geburtstag ?? ""
        mobile = profile.mobile ?? ""
        telefon = profile.telefon ?? ""
        strasse = profile.strasse ?? ""
        plz = profile.plz ?? ""
        ort = profile.ort ?? ""
    }

    private func save() async {
        saving = true
        error = nil
        func trimmed(_ value: String) -> String? {
            let t = value.trimmingCharacters(in: .whitespaces)
            return t.isEmpty ? nil : t
        }
        let update = MemberProfileUpdate(
            anrede: trimmed(anrede),
            vorname: trimmed(vorname),
            nachname: trimmed(nachname),
            email: trimmed(email),
            geburtstag: trimmed(geburtstag),
            mobile: trimmed(mobile),
            telefon: trimmed(telefon),
            strasse: trimmed(strasse),
            plz: trimmed(plz),
            ort: trimmed(ort)
        )
        do {
            let _: MemberProfile = try await auth.api().put("members/me", body: update)
            onSaved()
            dismiss()
        } catch {
            self.error = "Speichern fehlgeschlagen."
        }
        saving = false
    }

    private func uploadPhoto() async {
        guard let photoItem else { return }
        uploading = true
        photoStatus = nil
        defer { uploading = false }

        do {
            guard let raw = try await photoItem.loadTransferable(type: Data.self),
                  let image = UIImage(data: raw),
                  let jpeg = Self.downscaled(image) else {
                photoStatus = "Bild konnte nicht gelesen werden."
                return
            }
            let response: PhotoUploadResponse = try await auth.api().upload(
                "members/me/photo",
                fieldName: "photo",
                filename: "profil.jpg",
                mimeType: "image/jpeg",
                data: jpeg
            )
            if response.success == true {
                let kb = jpeg.count / 1024
                photoStatus = "Foto hochgeladen (\(kb) KB)."
                onSaved()
            } else {
                photoStatus = "Upload wurde abgelehnt."
            }
        } catch {
            photoStatus = "Upload fehlgeschlagen."
        }
    }

    private func deletePhoto() async {
        uploading = true
        photoStatus = nil
        defer { uploading = false }
        do {
            try await auth.api().delete("members/me/photo")
            photoStatus = "Foto entfernt."
            onSaved()
        } catch {
            photoStatus = "Foto konnte nicht entfernt werden."
        }
    }

    /// Verkleinert auf höchstens 1024 Pixel Kantenlänge und komprimiert als
    /// JPEG. Das Backend skaliert **nicht** selbst — ein Bild direkt aus der
    /// Kamera hätte mehrere Megabyte, und die landen so in der Datenbank.
    /// Die Android-App macht es aus demselben Grund.
    private static func downscaled(_ image: UIImage, maxEdge: CGFloat = 1024) -> Data? {
        let longest = max(image.size.width, image.size.height)
        let scale = longest > maxEdge ? maxEdge / longest : 1
        let target = CGSize(width: image.size.width * scale,
                            height: image.size.height * scale)
        let renderer = UIGraphicsImageRenderer(size: target)
        let resized = renderer.image { _ in
            image.draw(in: CGRect(origin: .zero, size: target))
        }
        return resized.jpegData(compressionQuality: 0.8)
    }
}
