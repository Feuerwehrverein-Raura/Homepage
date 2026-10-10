import SwiftUI

/// Arbeitsplan eines Anlasses — Gegenstück zum Arbeitsplan-Modal auf der
/// Website (Handy-Ansicht).
///
/// Den Plan baut allein das Backend (GET /events/:id/arbeitsplan); die
/// App gruppiert und zählt nichts selbst, sie zeichnet nur, was kommt. So
/// sehen Web, App und PDF garantiert dasselbe.
///
/// Pro Tag eine Überschrift, pro Zeitfenster eine Karte mit den Bereichen,
/// in denen es eine Schicht gibt: Helfer mit Komma getrennt, dazu orange
/// "N Plätze frei". Nur senkrecht scrollen; die Knöpfe stehen fest unten.
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
        // Nur senkrecht scrollen: pro Zeitfenster eine Karte, darin nur die
        // Bereiche mit Schicht — wie die Handy-Ansicht der Website.
        ScrollView {
            VStack(alignment: .leading, spacing: 16) {
                VStack(spacing: 6) {
                    Text(plan.verein ?? "Feuerwehrverein Raura, Kaiseraugst")
                        .font(.subheadline)
                        .foregroundStyle(.secondary)
                    Text(plan.titel ?? "Arbeitsplan \(event.title)")
                        .font(.title2.bold())
                }
                .multilineTextAlignment(.center)
                .frame(maxWidth: .infinity)

                if plan.tage.isEmpty {
                    Text("Keine Schichten für dieses Event vorhanden.")
                        .foregroundStyle(.secondary)
                        .frame(maxWidth: .infinity)
                        .padding(.vertical, 32)
                }

                ForEach(Array(plan.tage.enumerated()), id: \.offset) { _, tag in
                    VStack(alignment: .leading, spacing: 10) {
                        if let bezeichnung = tag.bezeichnung ?? tag.datum {
                            Text(bezeichnung)
                                .font(.headline)
                                .padding(.top, 8)
                        }
                        ForEach(Array(tag.zeilen.enumerated()), id: \.offset) { _, zeile in
                            let eintraege = zeile.karte(bereiche: plan.bereiche)
                            if !eintraege.isEmpty {
                                ZeitKarte(titel: zeile.zeitText, eintraege: eintraege)
                            }
                        }
                    }
                }
            }
            .padding()
        }
        .background(Color(.systemGroupedBackground))
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

// MARK: - Karten (rein, ohne SwiftUI — vom Vertragstest geprüft)

extension Arbeitsplan {
    /// Ein Bereich in der Karte eines Zeitfensters.
    struct KartenEintrag: Equatable {
        /// Bereich zum Anzeigen, z.B. "Küche".
        let bereich: String
        /// Bestätigte Helfer, mit ", " verbunden; leer = noch niemand.
        let namenText: String
        /// Anzahl offener Plätze (nie negativ).
        let offen: Int

        /// "1 Platz frei" / "N Plätze frei", nil wenn nichts frei ist.
        var freiText: String? {
            switch offen {
            case ..<1: return nil
            case 1: return "1 Platz frei"
            default: return "\(offen) Plätze frei"
            }
        }
    }

    /// "Kueche" -> "Küche"; alles andere unverändert.
    static func bereichAnzeige(_ bereich: String) -> String {
        let b = bereich.trimmingCharacters(in: .whitespaces)
        return b == "Kueche" ? "Küche" : b
    }
}

extension Arbeitsplan.Zeile {
    /// Kartentitel, z.B. "10:00–14:00 Uhr".
    var zeitText: String {
        "\((zeit ?? "").replacingOccurrences(of: "-", with: "–")) Uhr"
    }

    /// Karte eines Zeitfensters wie auf der Website (zeichneTagAlsListe):
    /// nur Bereiche mit Schicht, Felder ohne Schicht (nil) fallen weg. Leer
    /// heisst: das Zeitfenster wird nicht gezeichnet.
    func karte(bereiche: [String]) -> [Arbeitsplan.KartenEintrag] {
        zellen.enumerated().compactMap { i, zelle in
            guard let zelle else { return nil }
            return Arbeitsplan.KartenEintrag(
                bereich: Arbeitsplan.bereichAnzeige(
                    bereiche.indices.contains(i) ? bereiche[i] : ""),
                namenText: (zelle.besetzt ?? []).joined(separator: ", "),
                offen: max(0, zelle.offen ?? 0)
            )
        }
    }
}

// MARK: - Karte

private struct ZeitKarte: View {
    let titel: String
    let eintraege: [Arbeitsplan.KartenEintrag]

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            Text(titel).font(.headline)
            ForEach(Array(eintraege.enumerated()), id: \.offset) { _, e in
                VStack(alignment: .leading, spacing: 2) {
                    Text(e.bereich.uppercased())
                        .font(.caption.weight(.semibold))
                        .foregroundStyle(.secondary)
                    zeile(e)
                }
            }
        }
        .padding(12)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(Color(.secondarySystemGroupedBackground),
                    in: RoundedRectangle(cornerRadius: 10))
        .overlay(RoundedRectangle(cornerRadius: 10)
            .stroke(Color(.separator), lineWidth: 0.5))
    }

    private func zeile(_ e: Arbeitsplan.KartenEintrag) -> Text {
        var text = e.namenText.isEmpty
            ? Text("noch niemand").foregroundColor(.secondary)
            : Text(e.namenText)
        if let frei = e.freiText {
            text = text + Text(" · ") + Text(frei).foregroundColor(.orange)
        }
        return text
    }
}
