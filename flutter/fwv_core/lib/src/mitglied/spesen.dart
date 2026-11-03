// Spesen (api-members, docker/backend-members/src/spesen.js): jedes Mitglied
// reicht Auslagen mit Beleg ein (Profil -> Spesen), der Kassier zahlt aus
// oder lehnt ab (Vorstand -> Spesen). Pingen-Porto steht als Spesen des
// Aktuars (Quelle pingen).

import 'dart:convert';
import 'dart:typed_data';

import '../api/api_client.dart';
import 'json_lesen.dart';

/// Wie das Backend (KATEGORIEN).
const spesenKategorien = ['Einkauf', 'Porto', 'Fahrt', 'Material', 'Verpflegung', 'Anderes'];

enum SpesenStatus { eingereicht, bezahlt, abgelehnt }

SpesenStatus _status(Object? w) => switch (w) {
  'bezahlt' => SpesenStatus.bezahlt,
  'abgelehnt' => SpesenStatus.abgelehnt,
  _ => SpesenStatus.eingereicht,
};

String spesenStatusText(SpesenStatus s) => switch (s) {
  SpesenStatus.eingereicht => 'Eingereicht',
  SpesenStatus.bezahlt => 'Bezahlt',
  SpesenStatus.abgelehnt => 'Abgelehnt',
};

double _betrag(Object? w) => switch (w) {
  num n => n.toDouble(),
  String s => double.tryParse(s) ?? 0,
  _ => 0,
};

String spesenFranken(double betrag) => 'CHF ${betrag.toStringAsFixed(2)}';

class Spesen {
  const Spesen({
    required this.id,
    required this.betrag,
    required this.datum,
    required this.zweck,
    required this.kategorie,
    this.status = SpesenStatus.eingereicht,
    this.anlass,
    this.iban,
    this.belegName,
    this.belegTyp,
    this.grund,
    this.pingen = false,
    this.name,
    this.erstellt,
    this.erledigt,
    this.erledigtVon,
  });

  factory Spesen.ausJson(Map<String, dynamic> j) => Spesen(
    id: '${j['id']}',
    betrag: _betrag(j['betrag']),
    datum: jsonDatum(j['datum']) ?? DateTime.now(),
    zweck: jsonText(j['zweck']) ?? '',
    kategorie: jsonText(j['kategorie']) ?? 'Anderes',
    status: _status(j['status']),
    anlass: jsonText(j['anlass']),
    iban: jsonText(j['iban']),
    belegName: jsonText(j['beleg_name']),
    belegTyp: jsonText(j['beleg_typ']),
    grund: jsonText(j['grund']),
    pingen: j['quelle'] == 'pingen',
    name: [jsonText(j['vorname']), jsonText(j['nachname'])].whereType<String>().join(' '),
    erstellt: jsonZeitpunkt(j['erstellt_am']),
    erledigt: jsonZeitpunkt(j['erledigt_am']),
    erledigtVon: jsonText(j['erledigt_von']),
  );

  final String id;
  final double betrag;
  final DateTime datum;
  final String zweck;
  final String kategorie;
  final SpesenStatus status;
  final String? anlass;
  final String? iban;
  final String? belegName;
  final String? belegTyp;

  /// Begruendung bei abgelehnt.
  final String? grund;

  /// Automatisch aus der Pingen-Abrechnung (Porto, Aktuar).
  final bool pingen;

  /// Wer eingereicht hat (Liste des Kassiers).
  final String? name;
  final DateTime? erstellt;
  final DateTime? erledigt;
  final String? erledigtVon;
}

/// GET members/me/spesen: eigene Spesen und die IBAN fuer die Auszahlung.
class MeineSpesen {
  const MeineSpesen({this.spesen = const [], this.iban});

  final List<Spesen> spesen;

  /// Aus dem Profil; ohne IBAN kein Einreichen.
  final String? iban;
}

/// GET members/spesen: alle (Kassier), dazu was offen ist.
class SpesenUebersicht {
  const SpesenUebersicht({this.spesen = const [], this.offenAnzahl = 0, this.offenSumme = 0});

  final List<Spesen> spesen;
  final int offenAnzahl;
  final double offenSumme;
}

/// Beleg zum Einreichen: Bytes, Dateiname, MIME-Typ (PDF, JPEG, PNG).
typedef SpesenBeleg = ({Uint8List bytes, String dateiname, String typ});

/// MIME-Typ aus dem Dateinamen; null, wenn das Backend ihn nicht nimmt.
String? belegTyp(String dateiname) {
  final n = dateiname.toLowerCase();
  if (n.endsWith('.pdf')) return 'application/pdf';
  if (n.endsWith('.jpg') || n.endsWith('.jpeg')) return 'image/jpeg';
  if (n.endsWith('.png')) return 'image/png';
  return null;
}

List<Spesen> _liste(Object? w) => [
  for (final s in (w is List ? w : const []))
    if (s is Map) Spesen.ausJson(Map<String, dynamic>.from(s)),
];

/// Die einzige Stelle, die die Spesen-Routen kennt.
class SpesenDienst {
  const SpesenDienst(this.api);

  final ApiClient api;

  Future<MeineSpesen> meine() async {
    final j = await api.get('members/me/spesen');
    final m = j is Map ? j : const {};
    return MeineSpesen(spesen: _liste(m['spesen']), iban: jsonText(m['iban']));
  }

  Future<void> einreichen({
    required double betrag,
    required DateTime datum,
    required String zweck,
    required String kategorie,
    required SpesenBeleg beleg,
    String? anlassId,
  }) => api.post(
    'members/me/spesen',
    daten: {
      'betrag': betrag,
      'datum': isoDatum(datum),
      'zweck': zweck.trim(),
      'kategorie': kategorie,
      'event_id': ?anlassId,
      'beleg_base64': base64Encode(beleg.bytes),
      'beleg_name': beleg.dateiname,
      'beleg_typ': beleg.typ,
    },
    zeitlimit: const Duration(seconds: 60),
  );

  Future<void> zurueckziehen(String id) =>
      api.delete('members/me/spesen/${Uri.encodeComponent(id)}');

  Future<Uint8List> meinBeleg(String id) =>
      api.datei('members/me/spesen/${Uri.encodeComponent(id)}/beleg');

  // Kassier / Vorstand

  Future<SpesenUebersicht> alle({SpesenStatus? status}) async {
    final j = await api.get('members/spesen', abfrage: {if (status != null) 'status': status.name});
    final m = j is Map ? j : const {};
    final offen = m['offen'] is Map ? m['offen'] as Map : const {};
    return SpesenUebersicht(
      spesen: _liste(m['spesen']),
      offenAnzahl: jsonZahl(offen['anzahl']) ?? 0,
      offenSumme: _betrag(offen['summe']),
    );
  }

  Future<Uint8List> beleg(String id) =>
      api.datei('members/spesen/${Uri.encodeComponent(id)}/beleg');

  Future<void> bezahlt(String id) =>
      api.patch('members/spesen/${Uri.encodeComponent(id)}', daten: {'status': 'bezahlt'});

  Future<void> ablehnen(String id, String grund) => api.patch(
    'members/spesen/${Uri.encodeComponent(id)}',
    daten: {'status': 'abgelehnt', 'grund': grund.trim()},
  );
}
