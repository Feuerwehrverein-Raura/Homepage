import SwiftUI

/// Arbeitsplan eines Anlasses als Tabelle — Gegenstück zum Arbeitsplan-Modal
/// auf der Website.
///
/// Die Tabelle baut allein das Backend (GET /events/:id/arbeitsplan); die
/// App gruppiert und zählt nichts selbst, sie zeichnet nur, was kommt. So
/// sehen Web, App und PDF garantiert dasselbe.
///
/// Pro Tag eine Tabelle: Zeilen sind die Zeitfenster, Spalten die Bereiche.
/// In jeder Zelle stehen die genehmigten Helfer als "-Name", danach ein
/// grauer Strich pro noch offenem Platz. Wo es zu einer Zeit in einem
/// Bereich keine Schicht gibt, ist die Zelle schwarz — wie im PDF.
struct ArbeitsplanView: View {
    @EnvironmentObject var auth: AuthManager
    @Environment(\.dismiss) private var dismiss

    let event: Event
    /// Wird nach dem Bearbeiten aufgerufen, damit die Detailansicht neu lädt.
    var onEdited: () -> Void = {}

    @State private var plan: Arbeitsplan?
    @State private var error: String?
    @State private var showPDF = false
    @State private var isOrganizer = false
    @State private var editing = false

    var body: some View {
        NavigationStack {
            Group {
                if let plan {
                    content(plan)
                } else if let error {
                    VStack(spacing: 12) {
                        Image(systemName: "exclamationmark.triangle")
                            .font(.largeTitle).foregroundStyle(.secondary)
                        Text(error).foregroundStyle(.secondary)
                    }
                    .frame(maxWidth: .infinity, maxHeight: .infinity)
                } else {
                    ProgressView("Wird geladen …")
                        .frame(maxWidth: .infinity, maxHeight: .infinity)
                }
            }
            .safeAreaInset(edge: .bottom) {
                VStack(spacing: 8) {
                    Button {
                        showPDF = true
                    } label: {
                        Label("PDF herunterladen", systemImage: "arrow.down.doc")
                            .frame(maxWidth: .infinity)
                    }
                    .buttonStyle(.borderedProminent)
                    .disabled(plan?.tage.isEmpty ?? true)

                    HStack(spacing: 8) {
                        // Wie auf der Website, wo "Bearbeiten" ins
                        // Event-Dashboard führt — hier nur für den
                        // Organisator, denn nur er darf Schichten ändern.
                        if isOrganizer {
                            Button {
                                editing = true
                            } label: {
                                Label("Bearbeiten", systemImage: "pencil")
                                    .frame(maxWidth: .infinity)
                            }
                            .buttonStyle(.bordered)
                        }
                        Button {
                            dismiss()
                        } label: {
                            Text("Schließen").frame(maxWidth: .infinity)
                        }
                        .buttonStyle(.bordered)
                    }
                }
                .controlSize(.large)
                .padding(.horizontal)
                .padding(.vertical, 12)
                .background(.bar)
            }
            .navigationTitle("Arbeitsplan")
            .navigationBarTitleDisplayMode(.inline)
            .task {
                await load()
                await checkOrganizer()
            }
            .sheet(isPresented: $showPDF) {
                // Dieselbe Datenquelle wie die Tabelle oben, öffentlich lesbar.
                PDFPreview(title: "Arbeitsplan \(event.title)",
                           path: "events/\(event.id)/pdf/arbeitsplan")
                    .environmentObject(auth)
            }
            .sheet(isPresented: $editing) {
                OrganizerEditEventView(event: event) {
                    onEdited()
                    Task { await load() }
                }
                .environmentObject(auth)
            }
        }
    }

    @ViewBuilder
    private func content(_ plan: Arbeitsplan) -> some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 16) {
                VStack(spacing: 6) {
                    Text(plan.verein ?? "Feuerwehrverein Raura, Kaiseraugst")
                        .font(.headline)
                    Text(plan.titel ?? "Arbeitsplan \(event.title)")
                        .font(.title2.bold())
                        .underline()
                        .multilineTextAlignment(.center)
                }
                .frame(maxWidth: .infinity)

                if plan.tage.isEmpty {
                    Text("Keine Schichten für dieses Event vorhanden.")
                        .foregroundStyle(.secondary)
                        .frame(maxWidth: .infinity)
                        .padding(.vertical, 32)
                }

                ForEach(Array(plan.tage.enumerated()), id: \.offset) { _, tag in
                    if let bezeichnung = tag.bezeichnung ?? tag.datum {
                        Text(bezeichnung)
                            .font(.headline)
                            .underline()
                            .padding(.top, 8)
                    }
                    ScrollView(.horizontal, showsIndicators: true) {
                        DayTable(tag: tag, bereiche: plan.bereiche)
                    }
                }
            }
            .padding()
        }
    }

    private func load() async {
        do {
            plan = try await auth.api().get("events/\(event.id)/arbeitsplan")
            error = nil
        } catch {
            if plan == nil {
                self.error = "Arbeitsplan konnte nicht geladen werden."
            }
        }
    }

    /// Organisator ist, wessen Anlässe /events/organized-by-me liefert —
    /// dieselbe Quelle wie der Organisator-Tab. Scheitert der Aufruf, bleibt
    /// der Knopf einfach weg.
    private func checkOrganizer() async {
        let mine: [Event]? = try? await auth.api().get("events/organized-by-me")
        isOrganizer = mine?.contains { $0.id == event.id } ?? false
    }
}

// MARK: - Zelleninhalt

extension Arbeitsplan.Zeile {
    /// Zelle in Spalte `index` (parallel zu `bereiche`). Fehlt der Eintrag
    /// oder ist er null, gibt es dort keine Schicht (schwarze Zelle).
    func zelle(at index: Int) -> Arbeitsplan.Zelle? {
        guard zellen.indices.contains(index) else { return nil }
        return zellen[index]
    }
}

extension Arbeitsplan.Zelle {
    enum Linie: Equatable {
        /// Genehmigter Helfer, gezeichnet als "-Name".
        case name(String)
        /// Noch offener Platz, gezeichnet als grauer Strich.
        case offen
    }

    /// Zeilen der Zelle: erst die Helfer, dann ein Strich pro offenem Platz.
    /// Ueberbuchte Schichten (`offen: 0`) bekommen keinen Strich.
    var linien: [Linie] {
        (besetzt ?? []).map(Linie.name)
            + Array(repeating: .offen, count: max(0, offen ?? 0))
    }
}

// MARK: - Tabelle

/// Bewusst in festen Farben (weiss/schwarz) wie das gedruckte PDF, auch im
/// Dunkelmodus: sonst wären die schwarzen "keine Schicht"-Zellen nicht vom
/// Hintergrund zu unterscheiden.
private struct DayTable: View {
    let tag: Arbeitsplan.Tag
    let bereiche: [String]

    var body: some View {
        Grid(alignment: .topLeading, horizontalSpacing: 0, verticalSpacing: 0) {
            GridRow {
                header("Zeit")
                ForEach(bereiche, id: \.self) { header($0) }
            }
            ForEach(Array(tag.zeilen.enumerated()), id: \.offset) { _, zeile in
                GridRow {
                    cell {
                        Text(zeile.zeit ?? "").fontWeight(.medium)
                    }
                    ForEach(bereiche.indices, id: \.self) { i in
                        if let zelle = zeile.zelle(at: i) {
                            cell {
                                VStack(alignment: .leading, spacing: 2) {
                                    ForEach(Array(zelle.linien.enumerated()), id: \.offset) { _, linie in
                                        switch linie {
                                        case .name(let name):
                                            Text("-\(name)")
                                        case .offen:
                                            Text("-").foregroundColor(.gray)
                                        }
                                    }
                                }
                            }
                        } else {
                            cell(background: .black) { Color.clear.frame(height: 1) }
                        }
                    }
                }
            }
        }
        .font(.footnote)
        .foregroundColor(.black)
        .overlay(Rectangle().stroke(Color.gray, lineWidth: 1))
    }

    private func header(_ title: String) -> some View {
        cell(background: Color(white: 0.95)) {
            Text(title).fontWeight(.bold)
        }
    }

    private func cell<Content: View>(
        background: Color = .white,
        @ViewBuilder content: () -> Content
    ) -> some View {
        content()
            .padding(.horizontal, 10)
            .padding(.vertical, 6)
            .frame(minWidth: 90, maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
            .background(background)
            .border(Color.gray, width: 0.5)
    }
}
