// Geplante Auftraege (docs/vorstand-funktionen.md, Abschnitt 12): api-
// dispatch fuehrt sie minuetlich aus (docker/backend-dispatch/src/
// scheduled-jobs.js). Heute gibt es zwei Aktionen, beide fuer die
// Beitragsbriefe eines Jahres; der Worker ruft dann send-email-bulk bzw.
// send-post-bulk in api-accounting auf - mit denselben Regeln wie der
// sofortige Versand.

import 'package:fwv_core/fwv_core.dart';

import '../zeit.dart';

/// Aktionen, die das Backend kennt (registerHandler in index.js).
enum AuftragsArt {
  beitragEmail('membership_fees_email_bulk', 'Beitragsbriefe per E-Mail'),
  beitragPost('membership_fees_post_bulk', 'Beitragsbriefe per Post');

  const AuftragsArt(this.wert, this.titel);

  final String wert;
  final String titel;

  static AuftragsArt? aus(String? wert) {
    for (final a in values) {
      if (a.wert == wert) return a;
    }
    return null;
  }
}

/// Zustand eines Auftrags (Spalte status).
enum AuftragsStatus {
  geplant('scheduled', 'geplant'),
  laeuft('running', 'läuft'),
  erledigt('done', 'erledigt'),
  fehlgeschlagen('failed', 'fehlgeschlagen'),
  storniert('cancelled', 'storniert'),
  anderer('', '?');

  const AuftragsStatus(this.wert, this.titel);

  final String wert;
  final String titel;

  static AuftragsStatus aus(String? wert) {
    for (final s in values) {
      if (s.wert == wert && s != anderer) return s;
    }
    return anderer;
  }
}

class GeplanterAuftrag {
  const GeplanterAuftrag({
    required this.id,
    required this.aktion,
    required this.status,
    this.art,
    this.jahr,
    this.bezeichnung,
    this.zeitpunkt,
    this.erstelltVon,
    this.ergebnis,
  });

  factory GeplanterAuftrag.ausJson(Map<String, dynamic> j) {
    final payload = j['payload'] is Map ? j['payload'] as Map : const {};
    final aktion = jsonText(j['action']) ?? '?';
    return GeplanterAuftrag(
      id: jsonText(j['id']) ?? '',
      aktion: aktion,
      art: AuftragsArt.aus(aktion),
      status: AuftragsStatus.aus(jsonText(j['status'])),
      jahr: jsonZahl(payload['year']),
      bezeichnung: jsonText(j['label']),
      zeitpunkt: utcZeitpunkt(j['scheduled_at']),
      erstelltVon: jsonText(j['created_by']),
      ergebnis: j['result'] is Map ? Map<String, dynamic>.from(j['result'] as Map) : null,
    );
  }

  final String id;
  final String aktion;
  final AuftragsArt? art;
  final AuftragsStatus status;
  final int? jahr;
  final String? bezeichnung;

  /// Ortszeit.
  final DateTime? zeitpunkt;
  final String? erstelltVon;

  /// Antwort des Versands (success/failed/candidates) oder {error}.
  final Map<String, dynamic>? ergebnis;

  bool get stornierbar => status == AuftragsStatus.geplant;

  String get titel => bezeichnung ?? art?.titel ?? aktion;

  /// "12 gesendet, 1 fehlgeschlagen (von 13)" bzw. der Fehler.
  String? get ergebnisText {
    final e = ergebnis;
    if (e == null) return null;
    if (jsonText(e['error']) case final f?) return 'Fehler: $f';
    final ok = jsonZahl(e['success']);
    if (ok == null) return null;
    return '$ok gesendet, ${jsonZahl(e['failed']) ?? 0} fehlgeschlagen '
        '(von ${jsonZahl(e['candidates']) ?? ok})';
  }
}

class GeplanteAuftraegeDienst {
  const GeplanteAuftraegeDienst(this.api);

  final ApiClient api;

  /// Alle (bis 100), frueheste zuerst - wie das Backend sortiert.
  Future<List<GeplanterAuftrag>> liste() async =>
      jsonListe(await api.get('scheduled-jobs'), GeplanterAuftrag.ausJson);

  /// Beitragsbriefe [jahr] zum [zeitpunkt] (Ortszeit) planen.
  Future<GeplanterAuftrag> beitragsversandPlanen({
    required AuftragsArt art,
    required int jahr,
    required DateTime zeitpunkt,
  }) async {
    final j = await api.post(
      'scheduled-jobs',
      daten: {
        'action': art.wert,
        'payload': {'year': jahr},
        'label': 'Beitrag ${art == AuftragsArt.beitragEmail ? 'E-Mail' : 'Brief'}-Versand $jahr',
        // UTC mit Z: unabhaengig von der Zeitzone des Geraets eindeutig.
        'scheduled_at': zeitpunkt.toUtc().toIso8601String(),
      },
    );
    return GeplanterAuftrag.ausJson(j is Map ? Map<String, dynamic>.from(j) : const {});
  }

  /// Nur solange er noch nicht laeuft (sonst 404 vom Backend).
  Future<void> stornieren(String id) => api.delete('scheduled-jobs/${Uri.encodeComponent(id)}');
}
