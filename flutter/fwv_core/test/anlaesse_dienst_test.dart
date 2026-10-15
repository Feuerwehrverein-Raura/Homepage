// AnlaesseDienst gegen ein nachgebautes Backend: richtige Pfade, Bodies wie
// sie backend-events erwartet, Fehler mit der Meldung des Servers. Dazu der
// Kalender-Export (.ics).

import 'dart:convert';

import 'package:flutter_test/flutter_test.dart';
import 'package:fwv_core/fwv_core.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';

void main() {
  late List<http.Request> anfragen;

  AnlaesseDienst dienst(http.Response Function(http.Request a) antwort) {
    anfragen = [];
    return AnlaesseDienst(
      ApiClient(
        http: MockClient((a) async {
          anfragen.add(a);
          return antwort(a);
        }),
      ),
    );
  }

  http.Response json(Object? o, [int status = 200]) =>
      http.Response.bytes(utf8.encode(jsonEncode(o)), status);

  test('aktuelle Anlässe mit aktuell=true', () async {
    final d = dienst(
      (_) => json([
        {'id': 'a', 'title': 'X'},
      ]),
    );
    final liste = await d.aktuelle();
    expect(liste.single.titel, 'X');
    expect(anfragen.single.url.toString(), 'https://api.fwv-raura.ch/events?aktuell=true');
  });

  test('Anmeldung als Helfer: Body ohne eventTitle/organizerEmail', () async {
    final d = dienst((_) => json({'success': true, 'message': 'Anmeldung erfolgreich'}));
    final e = await d.anmelden(
      const AnmeldeAnfrage(
        art: AnmeldeArt.schicht,
        anlassId: 'e1',
        name: ' Erika Muster ',
        email: 'erika@example.ch',
        telefon: '',
        bemerkung: 'gern Bar',
        schichtIds: ['s1', 's3'],
      ),
    );
    expect(e.meldung, 'Anmeldung erfolgreich');
    expect(anfragen.single.url.path, '/registrations/public');
    expect(jsonDecode(anfragen.single.body), {
      'type': 'shift',
      'eventId': 'e1',
      'name': 'Erika Muster',
      'email': 'erika@example.ch',
      'notes': 'gern Bar',
      'shiftIds': ['s1', 's3'],
    });
  });

  test('Anmeldung als Teilnehmer mit Personen und Allergien', () async {
    final d = dienst(
      (_) => json({'success': true, 'pending_confirmation': true, 'message': 'Fast geschafft!'}),
    );
    final e = await d.anmelden(
      const AnmeldeAnfrage(
        art: AnmeldeArt.teilnahme,
        anlassId: 'e2',
        name: 'Gast',
        email: 'gast@example.ch',
        personen: 3,
        allergien: 'Nüsse',
      ),
    );
    expect(e.mussBestaetigen, isTrue);
    expect(e.meldung, 'Fast geschafft!');
    expect(jsonDecode(anfragen.single.body), {
      'type': 'participant',
      'eventId': 'e2',
      'name': 'Gast',
      'email': 'gast@example.ch',
      'participants': 3,
      'allergies': 'Nüsse',
    });
  });

  test('Schon angemeldet (Doppelklick): Erfolg mit Kennzeichen und Text', () async {
    final d = dienst(
      (_) => json({
        'success': true,
        'bereits_angemeldet': true,
        'registrationId': 'r1',
        'message': 'Du bist schon angemeldet (2 Personen). Eine zweite Anmeldung ist nicht nötig.',
      }),
    );
    final e = await d.anmelden(
      const AnmeldeAnfrage(art: AnmeldeArt.teilnahme, anlassId: 'e2', name: 'Heinz Degen'),
    );
    expect(e.bereitsAngemeldet, isTrue);
    expect(e.mussBestaetigen, isFalse);
    expect(e.meldung, startsWith('Du bist schon angemeldet (2 Personen).'));
  });

  test('Absage des Backends wird zum Fehler mit seiner Meldung', () async {
    final d = dienst(
      (_) => json({
        'success': false,
        'message': 'Das Event ist bereits voll.',
        'code': 'event_full',
      }, 409),
    );
    await expectLater(
      d.anmelden(const AnmeldeAnfrage(art: AnmeldeArt.teilnahme, anlassId: 'e', name: 'A')),
      throwsA(isA<ApiFehler>().having((f) => f.meldung, 'meldung', 'Das Event ist bereits voll.')),
    );
    final d2 = dienst((_) => json({'success': false, 'message': 'Nein'}));
    await expectLater(
      d2.anmelden(const AnmeldeAnfrage(art: AnmeldeArt.teilnahme, anlassId: 'e', name: 'A')),
      throwsA(isA<ApiFehler>().having((f) => f.meldung, 'meldung', 'Nein')),
    );
  });

  test('PDF als Bytes; Fehler mit Meldung', () async {
    final d = dienst(
      (a) => a.url.path.contains('e1')
          ? http.Response.bytes([37, 80, 68, 70], 200, headers: {'content-type': 'application/pdf'})
          : json({'error': 'No shifts found for this event'}, 400),
    );
    expect(await d.arbeitsplanPdf('e1'), [37, 80, 68, 70]);
    expect(anfragen.single.url.path, '/events/e1/pdf/arbeitsplan');
    await expectLater(
      d.arbeitsplanPdf('e2'),
      throwsA(
        isA<ApiFehler>().having((f) => f.meldung, 'meldung', 'No shifts found for this event'),
      ),
    );
  });

  test('Vorschlag und Optionen', () async {
    final d = dienst(
      (a) => a.url.path == '/event-optionen'
          ? json({
              'kategorien': ['Dorffest', 'Sonstiges'],
              'anmeldepflichtige_kategorien': ['Dorffest'],
              'bereiche': [
                {'wert': 'Kueche', 'text': 'Küche'},
              ],
            })
          : json({'id': 'neu'}, 201),
    );
    final o = await d.optionen();
    expect(o.kategorien, ['Dorffest', 'Sonstiges']);
    expect(o.bereiche.single.text, 'Küche');

    await d.vorschlagen(
      AnlassVorschlag(
        titel: ' Lotto ',
        beginn: DateTime(2026, 11, 20, 19, 30),
        ende: DateTime(2026, 11, 20),
        endeMitZeit: false,
        kategorie: 'Sonstiges',
        ort: '',
      ),
    );
    expect(jsonDecode(anfragen.last.body), {
      'title': 'Lotto',
      'start_date': '2026-11-20 19:30:00',
      'end_date': '2026-11-20',
      'location': null,
      'category': 'Sonstiges',
      'cost': null,
      'description': null,
    });
  });

  group('Kalender-Export', () {
    test('mit Uhrzeit: Zeitzone Zürich, Text maskiert', () {
      final ics = anlassAlsIcs(
        Anlass.ausJson({
          'id': 'e1',
          'title': 'Chilbi; 2026, Fest',
          'location': 'Roter Schopf',
          'start_date': '2026-10-17 10:00:00',
          'end_date': '2026-10-18 20:00:00',
          'description': 'Zeile 1\nZeile 2',
        }),
        jetzt: DateTime.utc(2026, 10, 11, 8),
      )!;
      expect(ics, contains('DTSTART;TZID=Europe/Zurich:20261017T100000\r\n'));
      expect(ics, contains('DTEND;TZID=Europe/Zurich:20261018T200000\r\n'));
      expect(ics, contains(r'SUMMARY:Chilbi\; 2026\, Fest'));
      expect(ics, contains(r'DESCRIPTION:Zeile 1\nZeile 2'));
      expect(ics, contains('DTSTAMP:20261011T080000Z'));
      expect(ics, contains('UID:anlass-e1@fwv-raura.ch'));
      expect(ics, contains('BEGIN:VTIMEZONE'));
      expect(ics.endsWith('END:VCALENDAR\r\n'), isTrue);
    });

    test('ganztägig (Mitternacht): Datum, Ende exklusiv', () {
      final ics = anlassAlsIcs(
        Anlass.ausJson({'id': 'e', 'title': 'GV', 'start_date': '2026-12-31 00:00:00'}),
      )!;
      expect(ics, contains('DTSTART;VALUE=DATE:20261231'));
      expect(ics, contains('DTEND;VALUE=DATE:20270101'));
      expect(ics, isNot(contains('VTIMEZONE')));
    });

    test('lange Zeilen werden gefaltet, ohne Datum keine Datei', () {
      final ics = anlassAlsIcs(
        Anlass.ausJson({'id': 'e', 'title': 'Ä' * 60, 'start_date': '2026-10-17'}),
      )!;
      for (final z in ics.split('\r\n')) {
        expect(utf8.encode(z).length, lessThanOrEqualTo(75));
      }
      expect(anlassAlsIcs(Anlass.ausJson({'id': 'e', 'title': 'X'})), isNull);
      expect(icsDateiname(Anlass.ausJson({'title': 'Chilbi 2026!'})), 'Chilbi_2026.ics');
    });
  });
}
