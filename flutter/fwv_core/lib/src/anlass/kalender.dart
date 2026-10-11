// Eintrag aus `GET calendar/items`: Anlaesse und Beitraege, sortiert, mit
// fertigem `datum_text`. Was ein Mitglied nicht sehen soll (E-Mails, Briefe),
// laesst das Backend schon weg.

import '../mitglied/json_lesen.dart';

class KalenderEintrag {
  const KalenderEintrag({
    required this.id,
    required this.typ,
    this.datum,
    required this.titel,
    this.untertitel,
    this.refId,
    this.datumText,
  });

  factory KalenderEintrag.ausJson(Map<String, dynamic> m) => KalenderEintrag(
    id: jsonText(m['id']) ?? '',
    typ: jsonText(m['type']) ?? '',
    datum: jsonDatum(m['date']),
    titel: jsonText(m['title']) ?? '',
    untertitel: jsonText(m['subtitle']),
    refId: jsonText(m['refId']),
    datumText: jsonText(m['datum_text']),
  );

  final String id;

  /// "event", "fee_due", "fee_paid", ...
  final String typ;

  /// Tag des Eintrags (nur fuer die Einordnung im Monatsraster).
  final DateTime? datum;
  final String titel;

  /// "10:00 · Roter Schopf", "CHF 50.00".
  final String? untertitel;

  /// Bei Anlaessen die Anlass-ID.
  final String? refId;

  /// "Samstag, 17. Oktober 2026".
  final String? datumText;

  bool get istAnlass => typ == 'event' && refId != null;
}
