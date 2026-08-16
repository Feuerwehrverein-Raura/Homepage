import PhotosUI
import SwiftUI

/// Notizen zu einem Anlass, mit Anhängen.
///
/// Anhänge gehen als Base64 im JSON hoch, kommen aber einzeln und
/// **authentifiziert** wieder herunter. Eine `AsyncImage`-URL funktioniert
/// dafür nicht — ohne Bearer-Token antwortet das Backend mit 401. Die
/// Vorschau lädt die Bytes deshalb über den API-Client.
struct OrganizerNotesView: View {
    @EnvironmentObject var auth: AuthManager
    let event: Event

    @State private var notes: [OrganizerNote] = []
    @State private var loading = true
    @State private var error: String?
    @State private var composing = false
    @State private var working: String?

    var body: some View {
        Group {
            if loading {
                ProgressView().frame(maxWidth: .infinity, maxHeight: .infinity)
            } else if let error {
                VStack(spacing: 12) {
                    Image(systemName: "exclamationmark.triangle")
                        .font(.largeTitle).foregroundStyle(.secondary)
                    Text(error).foregroundStyle(.secondary)
                }
                .frame(maxWidth: .infinity, maxHeight: .infinity)
            } else if notes.isEmpty {
                VStack(spacing: 12) {
                    Image(systemName: "note.text")
                        .font(.largeTitle).foregroundStyle(.secondary)
                    Text("Noch keine Notizen.").foregroundStyle(.secondary)
                }
                .frame(maxWidth: .infinity, maxHeight: .infinity)
            } else {
                List {
                    ForEach(notes) { note in
                        NoteCard(event: event, note: note,
                                 busy: working == note.id) {
                            Task { await deleteNote(note) }
                        } onAttachmentDeleted: {
                            Task { await load() }
                        }
                    }
                }
            }
        }
        .navigationTitle("Notizen")
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            Button {
                composing = true
            } label: {
                Label("Notiz", systemImage: "square.and.pencil")
            }
        }
        .task { await load() }
        .refreshable { await load() }
        .sheet(isPresented: $composing) {
            ComposeNoteSheet(event: event) { Task { await load() } }
                .environmentObject(auth)
        }
    }

    private func load() async {
        loading = true
        error = nil
        do {
            notes = try await auth.api().get("events/\(event.id)/organizer-notes")
        } catch {
            self.error = "Notizen konnten nicht geladen werden."
        }
        loading = false
    }

    private func deleteNote(_ note: OrganizerNote) async {
        working = note.id
        defer { working = nil }
        try? await auth.api().delete(
            "events/\(event.id)/organizer-notes/\(note.id)")
        await load()
    }
}

private struct NoteCard: View {
    @EnvironmentObject var auth: AuthManager
    let event: Event
    let note: OrganizerNote
    let busy: Bool
    var onDelete: () -> Void
    var onAttachmentDeleted: () -> Void

    @State private var confirmDelete = false

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            if let content = note.content, !content.isEmpty {
                Text(content)
            }

            ForEach(note.attachments) { attachment in
                AttachmentRow(event: event, note: note, attachment: attachment,
                              onDeleted: onAttachmentDeleted)
                    .environmentObject(auth)
            }

            HStack {
                if let created = note.createdAt {
                    Text(DateFormat.swiss(created))
                }
                if let by = note.createdBy, !by.isEmpty {
                    Text("· \(by)")
                }
                Spacer()
                if busy {
                    ProgressView()
                } else {
                    Button(role: .destructive) {
                        confirmDelete = true
                    } label: {
                        Image(systemName: "trash")
                    }
                    .buttonStyle(.borderless)
                }
            }
            .font(.caption2)
            .foregroundStyle(.secondary)
        }
        .padding(.vertical, 4)
        .confirmationDialog("Notiz löschen?", isPresented: $confirmDelete,
                            titleVisibility: .visible) {
            Button("Löschen", role: .destructive, action: onDelete)
            Button("Abbrechen", role: .cancel) {}
        } message: {
            Text("Die Notiz und ihre Anhänge werden entfernt.")
        }
    }
}

private struct AttachmentRow: View {
    @EnvironmentObject var auth: AuthManager
    let event: Event
    let note: OrganizerNote
    let attachment: OrganizerNoteAttachment
    var onDeleted: () -> Void

    @State private var image: UIImage?
    @State private var loading = false

    private var path: String {
        "events/\(event.id)/organizer-notes/\(note.id)/attachments/\(attachment.id)"
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 4) {
            if attachment.isImage {
                if let image {
                    Image(uiImage: image)
                        .resizable()
                        .scaledToFit()
                        .frame(maxHeight: 220)
                        .clipShape(RoundedRectangle(cornerRadius: 8))
                } else if loading {
                    ProgressView().frame(height: 60)
                }
            }

            HStack {
                Label(attachment.filename,
                      systemImage: attachment.isImage ? "photo" : "doc")
                    .font(.caption)
                    .lineLimit(1)
                Spacer()
                if attachment.size > 0 {
                    Text("\(attachment.size / 1024) KB")
                        .font(.caption2).foregroundStyle(.secondary)
                }
                Button(role: .destructive) {
                    Task { await deleteAttachment() }
                } label: {
                    Image(systemName: "xmark.circle")
                }
                .buttonStyle(.borderless)
                .font(.caption)
            }
        }
        .task { await loadImage() }
    }

    private func loadImage() async {
        guard attachment.isImage, image == nil, !loading else { return }
        loading = true
        defer { loading = false }
        if let data = try? await auth.api().data(path) {
            image = UIImage(data: data)
        }
    }

    private func deleteAttachment() async {
        try? await auth.api().delete(path)
        onDeleted()
    }
}

/// Neue Notiz schreiben. Bilder werden vor dem Hochladen verkleinert — sie
/// gehen als Base64 durch das JSON, was die Nutzlast ohnehin um rund ein
/// Drittel aufbläht.
private struct ComposeNoteSheet: View {
    @EnvironmentObject var auth: AuthManager
    @Environment(\.dismiss) private var dismiss

    let event: Event
    var onSaved: () -> Void

    @State private var content = ""
    @State private var picked: [PhotosPickerItem] = []
    @State private var uploads: [NoteAttachmentUpload] = []
    @State private var preparing = false
    @State private var saving = false
    @State private var error: String?

    private var canSave: Bool {
        !content.trimmingCharacters(in: .whitespaces).isEmpty || !uploads.isEmpty
    }

    var body: some View {
        NavigationStack {
            Form {
                Section("Text") {
                    TextField("Notiz", text: $content, axis: .vertical)
                        .lineLimit(4...12)
                }

                Section {
                    PhotosPicker(selection: $picked, matching: .images) {
                        HStack {
                            Label("Bilder anhängen", systemImage: "photo.badge.plus")
                            if preparing {
                                Spacer()
                                ProgressView()
                            }
                        }
                    }
                    ForEach(Array(uploads.enumerated()), id: \.offset) { _, upload in
                        Label(upload.filename, systemImage: "photo")
                            .font(.caption)
                    }
                } header: {
                    Text("Anhänge")
                } footer: {
                    Text("Text oder Anhang muss vorhanden sein.")
                }

                if let error {
                    Section {
                        Label(error, systemImage: "exclamationmark.triangle")
                            .foregroundStyle(.red)
                    }
                }
            }
            .navigationTitle("Neue Notiz")
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
                            .disabled(!canSave)
                    }
                }
            }
            .onChange(of: picked) { _ in Task { await prepare() } }
        }
    }

    private func prepare() async {
        preparing = true
        defer { preparing = false }
        var prepared: [NoteAttachmentUpload] = []
        for (index, item) in picked.enumerated() {
            guard let raw = try? await item.loadTransferable(type: Data.self),
                  let image = UIImage(data: raw),
                  let jpeg = downscale(image) else { continue }
            prepared.append(NoteAttachmentUpload(
                filename: "notiz-\(index + 1).jpg",
                contentType: "image/jpeg",
                data: jpeg.base64EncodedString()
            ))
        }
        uploads = prepared
    }

    private func downscale(_ image: UIImage, maxEdge: CGFloat = 1600) -> Data? {
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

    private func save() async {
        saving = true
        error = nil
        defer { saving = false }
        let text = content.trimmingCharacters(in: .whitespaces)
        do {
            let _: OrganizerNote = try await auth.api().post(
                "events/\(event.id)/organizer-notes",
                body: CreateOrganizerNoteRequest(
                    content: text.isEmpty ? nil : text,
                    attachments: uploads.isEmpty ? nil : uploads
                )
            )
            onSaved()
            dismiss()
        } catch {
            self.error = "Notiz konnte nicht gespeichert werden."
        }
    }
}
