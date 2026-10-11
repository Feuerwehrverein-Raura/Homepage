// Eintrag aus `GET registrations/mine`: eigene Anmeldung mit fertigem
// Status-Text, Status-Farbe, Anlass-Datum und Schicht-Beschriftung.

import '../mitglied/json_lesen.dart';

/// Farbe des Status-Chips, wie das Backend sie nennt.
enum StatusFarbe { gelb, gruen, rot, grau }

class MeineAnmeldung {
  const MeineAnmeldung({
    required this.id,
    required this.anlassId,
    required this.anlassTitel,
    this.anlassSlug,
    this.anlassOrt,
    this.anlassDatumText,
    this.status,
    this.statusText,
    this.statusFarbe = StatusFarbe.grau,
    this.schichten = const [],
  });

  factory MeineAnmeldung.ausJson(Map<String, dynamic> m) => MeineAnmeldung(
    id: jsonText(m['id']) ?? '',
    anlassId: jsonText(m['event_id']) ?? '',
    anlassTitel: jsonText(m['event_title']) ?? '',
    anlassSlug: jsonText(m['event_slug']),
    anlassOrt: jsonText(m['event_location']),
    anlassDatumText: jsonText(m['event_datum_text']),
    status: jsonText(m['status']),
    statusText: jsonText(m['status_text']),
    statusFarbe: switch (jsonText(m['status_farbe'])) {
      'gelb' => StatusFarbe.gelb,
      'gruen' => StatusFarbe.gruen,
      'rot' => StatusFarbe.rot,
      _ => StatusFarbe.grau,
    },
    schichten: jsonListe(m['shifts'], AngemeldeteSchicht.ausJson),
  );

  final String id;
  final String anlassId;
  final String anlassTitel;
  final String? anlassSlug;
  final String? anlassOrt;
  final String? anlassDatumText;

  /// Roh-Status (pending, approved, ...) — angezeigt wird [statusText].
  final String? status;

  /// "offen", "bestätigt", "abgelehnt", "abgesagt".
  final String? statusText;
  final StatusFarbe statusFarbe;
  final List<AngemeldeteSchicht> schichten;
}

class AngemeldeteSchicht {
  const AngemeldeteSchicht({required this.id, this.name, this.bereich, this.beschriftung});

  factory AngemeldeteSchicht.ausJson(Map<String, dynamic> m) => AngemeldeteSchicht(
    id: jsonText(m['id']) ?? '',
    name: jsonText(m['name']),
    bereich: jsonText(m['bereich']),
    beschriftung: jsonText(m['beschriftung']),
  );

  final String id;
  final String? name;
  final String? bereich;

  /// "Bar – Schicht 1 · Sa 17.10. · 12:00–14:00".
  final String? beschriftung;
}
