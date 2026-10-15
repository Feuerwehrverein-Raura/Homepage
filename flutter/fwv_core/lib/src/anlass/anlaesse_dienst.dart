// Aufrufe rund um Anlaesse: Liste, Detail, Kalender, Arbeitsplan, Anmelden,
// eigene Anmeldungen, Vorschlagen. Ohne Oberflaeche (auch fuer die
// Vorstand-App).

import 'dart:typed_data';

import '../api/api_client.dart';
import '../arbeitsplan.dart';
import '../mitglied/json_lesen.dart';
import 'anlass.dart';
import 'kalender.dart';
import 'meine_anmeldung.dart';

class AnlaesseDienst {
  const AnlaesseDienst(this.api);

  final ApiClient api;

  /// Kommende und laufende Anlaesse, sortiert; abgesagte und vergangene
  /// filtert das Backend (`aktuell=true`). Mit Token stimmt
  /// `kann_bearbeiten`.
  Future<List<Anlass>> aktuelle() async =>
      jsonListe(await api.get('events', abfrage: {'aktuell': 'true'}), Anlass.ausJson);

  /// Ein Anlass (UUID oder Slug).
  Future<Anlass> anlass(String id) async =>
      Anlass.ausJson(await api.get('events/${Uri.encodeComponent(id)}'));

  Future<List<KalenderEintrag>> kalender() async =>
      jsonListe(await api.get('calendar/items'), KalenderEintrag.ausJson);

  Future<Arbeitsplan> arbeitsplan(String anlassId) async {
    final json = await api.get('events/${Uri.encodeComponent(anlassId)}/arbeitsplan');
    return Arbeitsplan.fromJson(json is Map ? Map<String, dynamic>.from(json) : const {});
  }

  Future<Uint8List> arbeitsplanPdf(String anlassId) =>
      api.datei('events/${Uri.encodeComponent(anlassId)}/pdf/arbeitsplan');

  Future<List<MeineAnmeldung>> meineAnmeldungen() async =>
      jsonListe(await api.get('registrations/mine'), MeineAnmeldung.ausJson);

  /// Anmelden (`POST registrations/public`). Gibt die Meldung des Backends
  /// zurueck; eine Absage mit `success: false` wird zum [ApiFehler].
  Future<AnmeldeErgebnis> anmelden(AnmeldeAnfrage anfrage) async {
    final antwort = await api.post('registrations/public', daten: anfrage.alsJson());
    final m = antwort is Map ? antwort : const {};
    final meldung = jsonText(m['message']);
    if (m['success'] == false) {
      throw ApiFehler(meldung ?? jsonText(m['error']) ?? 'Die Anmeldung wurde nicht angenommen.');
    }
    final bestaetigen = jsonWahr(m['pending_confirmation']) ?? false;
    return AnmeldeErgebnis(
      meldung: meldung ?? 'Anmeldung erfolgreich',
      mussBestaetigen: bestaetigen,
      bereitsAngemeldet: jsonWahr(m['bereits_angemeldet']) ?? false,
    );
  }

  /// Auswahllisten fuer Anlass-Formulare (`GET event-optionen`).
  Future<EventOptionen> optionen() async => EventOptionen.ausJson(await api.get('event-optionen'));

  /// Schlaegt einen Anlass vor (`POST events/propose`); der Vorstand
  /// entscheidet.
  Future<void> vorschlagen(AnlassVorschlag vorschlag) =>
      api.post('events/propose', daten: vorschlag.alsJson());
}

/// Body fuer `POST registrations/public`.
///
/// `eventTitle` und `organizerEmail` (schickten die alten Apps mit) gehen
/// bewusst nicht mehr raus: Den Titel liest das Backend aus der Datenbank,
/// und die Organisator-Adresse vom Geraet waere nur ein Ausweichwert, ueber
/// den ein Client die Benachrichtigung umleiten koennte.
class AnmeldeAnfrage {
  const AnmeldeAnfrage({
    required this.art,
    required this.anlassId,
    required this.name,
    this.email,
    this.telefon,
    this.personen,
    this.bemerkung,
    this.allergien,
    this.schichtIds = const [],
  });

  final AnmeldeArt art;
  final String anlassId;
  final String name;
  final String? email;
  final String? telefon;

  /// Nur bei Teilnahme.
  final int? personen;
  final String? bemerkung;

  /// Nur bei Teilnahme.
  final String? allergien;

  /// Nur bei Schicht-Anmeldung.
  final List<String> schichtIds;

  Map<String, Object?> alsJson() {
    final schicht = art == AnmeldeArt.schicht;
    return {
      'type': schicht ? 'shift' : 'participant',
      'eventId': anlassId,
      'name': name.trim(),
      'email': ?_leerAlsNull(email),
      'phone': ?_leerAlsNull(telefon),
      'notes': ?_leerAlsNull(bemerkung),
      if (schicht) 'shiftIds': schichtIds,
      if (!schicht) 'participants': personen ?? 1,
      if (!schicht) 'allergies': ?_leerAlsNull(allergien),
    };
  }
}

class AnmeldeErgebnis {
  const AnmeldeErgebnis({
    required this.meldung,
    this.mussBestaetigen = false,
    this.bereitsAngemeldet = false,
  });

  /// Text des Backends, z.B. "Anmeldung erfolgreich (als Mitglied verknüpft)".
  final String meldung;

  /// Gaeste muessen per E-Mail-Link bestaetigen (Double-Opt-in).
  final bool mussBestaetigen;

  /// Dieselbe Person war schon angemeldet (z.B. Doppelklick): das Backend
  /// legt keine zweite Anmeldung an und gibt die bestehende zurueck.
  final bool bereitsAngemeldet;
}

/// `GET event-optionen`: die einzige Quelle fuer Kategorien usw.
class EventOptionen {
  const EventOptionen({
    this.kategorien = const [],
    this.anmeldepflichtigeKategorien = const [],
    this.bereiche = const [],
    this.status = const [],
  });

  factory EventOptionen.ausJson(Object? json) {
    final m = json is Map ? json : const {};
    List<String> texte(Object? l) => [
      if (l is List)
        for (final e in l) ?jsonText(e),
    ];
    return EventOptionen(
      kategorien: texte(m['kategorien']),
      anmeldepflichtigeKategorien: texte(m['anmeldepflichtige_kategorien']),
      bereiche: jsonListe(
        m['bereiche'],
        (b) => (wert: jsonText(b['wert']) ?? '', text: jsonText(b['text']) ?? ''),
      ),
      status: jsonListe(
        m['status'],
        (b) => (wert: jsonText(b['wert']) ?? '', text: jsonText(b['text']) ?? ''),
      ),
    );
  }

  final List<String> kategorien;
  final List<String> anmeldepflichtigeKategorien;
  final List<({String wert, String text})> bereiche;

  /// Status eines Anlasses (`planned` → "Geplant" usw.).
  final List<({String wert, String text})> status;
}

/// Body fuer `POST events/propose`. Zeitpunkte wie in der Datenbank:
/// Ortszeit ohne Zone ("2026-10-17 18:00:00"), ohne Uhrzeit nur das Datum.
class AnlassVorschlag {
  const AnlassVorschlag({
    required this.titel,
    required this.beginn,
    this.beginnMitZeit = true,
    this.ende,
    this.endeMitZeit = true,
    this.ort,
    this.kategorie,
    this.kosten,
    this.beschreibung,
  });

  final String titel;
  final DateTime beginn;
  final bool beginnMitZeit;
  final DateTime? ende;
  final bool endeMitZeit;
  final String? ort;
  final String? kategorie;
  final String? kosten;
  final String? beschreibung;

  Map<String, Object?> alsJson() => {
    'title': titel.trim(),
    'start_date': _zeitpunkt(beginn, beginnMitZeit),
    'end_date': ende == null ? null : _zeitpunkt(ende!, endeMitZeit),
    'location': _leerAlsNull(ort),
    'category': _leerAlsNull(kategorie),
    'cost': _leerAlsNull(kosten),
    'description': _leerAlsNull(beschreibung),
  };
}

String _zeitpunkt(DateTime d, bool mitZeit) => mitZeit
    ? '${isoDatum(d)} ${d.hour.toString().padLeft(2, '0')}:${d.minute.toString().padLeft(2, '0')}:00'
    : isoDatum(d);

String? _leerAlsNull(String? s) {
  final t = s?.trim();
  return (t == null || t.isEmpty) ? null : t;
}
