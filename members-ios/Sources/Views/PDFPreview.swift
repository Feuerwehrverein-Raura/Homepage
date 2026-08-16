import QuickLook
import SwiftUI

/// Zeigt ein heruntergeladenes PDF an (Teilnehmerliste, Aushang).
///
/// Die Bytes kommen über den API-Client statt über eine URL: die
/// PDF-Endpunkte sind zwar öffentlich lesbar, aber so nimmt der Aufruf
/// dieselbe Token- und Wiederholungslogik mit wie alles andere — und wenn
/// das Backend sie später absichert, funktioniert es weiter.
struct PDFPreview: View {
    @EnvironmentObject var auth: AuthManager
    @Environment(\.dismiss) private var dismiss

    let title: String
    let path: String

    @State private var fileURL: URL?
    @State private var error: String?

    var body: some View {
        NavigationStack {
            Group {
                if let fileURL {
                    QuickLookView(url: fileURL)
                } else if let error {
                    VStack(spacing: 12) {
                        Image(systemName: "exclamationmark.triangle")
                            .font(.largeTitle).foregroundStyle(.secondary)
                        Text(error).foregroundStyle(.secondary)
                    }
                } else {
                    ProgressView("Wird geladen …")
                }
            }
            .navigationTitle(title)
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Fertig") { dismiss() }
                }
                ToolbarItem(placement: .primaryAction) {
                    if let fileURL {
                        ShareLink(item: fileURL)
                    }
                }
            }
            .task { await load() }
        }
    }

    private func load() async {
        do {
            let data = try await auth.api().data(path)
            // QuickLook und ShareLink brauchen eine Datei, keinen Speicherblock.
            let url = FileManager.default.temporaryDirectory
                .appendingPathComponent("\(UUID().uuidString).pdf")
            try data.write(to: url)
            fileURL = url
        } catch {
            self.error = "PDF konnte nicht geladen werden."
        }
    }
}

private struct QuickLookView: UIViewControllerRepresentable {
    let url: URL

    func makeUIViewController(context: Context) -> QLPreviewController {
        let controller = QLPreviewController()
        controller.dataSource = context.coordinator
        return controller
    }

    func updateUIViewController(_ controller: QLPreviewController, context: Context) {
        controller.reloadData()
    }

    func makeCoordinator() -> Coordinator { Coordinator(url: url) }

    final class Coordinator: NSObject, QLPreviewControllerDataSource {
        let url: URL
        init(url: URL) { self.url = url }

        func numberOfPreviewItems(in controller: QLPreviewController) -> Int { 1 }

        func previewController(_ controller: QLPreviewController,
                               previewItemAt index: Int) -> QLPreviewItem {
            url as QLPreviewItem
        }
    }
}
