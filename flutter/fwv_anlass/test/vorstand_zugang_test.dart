// VorstandZugang gegen ein nachgebautes Backend: Bestehendes ueber die
// `…-as-organizer`-Routen, Anlegen/Aendern/Loeschen/Vorschlaege ueber die
// Vorstand-Routen - mit genau den Feldern, die vorstand.html schickt.
// Dazu die reine Logik: Felder je Kategorie, Organisator-Payload,
// Springer-Schichten.

import 'dart:convert';
import 'dart:typed_data';

import 'package:flutter_test/flutter_test.dart';
import 'package:fwv_anlass/fwv_anlass.dart';
import 'package:fwv_core/fwv_core.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';

void main() {
  late List<http.Request> anfragen;
  late Object? Function(http.Request a) antwort;

  final api = ApiClient(
    http: MockClient((a) async {
      anfragen.add(a);
      final o = antwort(a);
      return http.Response.bytes(utf8.encode(jsonEncode(o)), 200);
    }),
  );
  final vorstand = VorstandZugang(api);

  setUp(() {
    anfragen = [];
    antwort = (a) => switch (a.url.path) {
      '/event-optionen' => {
        'kategorien': ['Dorffest', 'GV', 'Ausflug', 'Sonstiges'],
        'anmeldepflichtige_kategorien': ['Dorffest', 'GV', 'Aufbau', 'Abbau'],
      },
      '/events' when a.method == 'POST' => {'id': 'neu1', 'title': 'x'},
      _ => {'success': true},
    };
  });

  String route(http.Request a) => '${a.method} ${a.url.path}';
  Object? body(http.Request a) => a.body.isEmpty ? null : jsonDecode(a.body);
  Iterable<http.Request> ohneOptionen() => anfragen.where((a) => a.url.path != '/event-optionen');

  test('Bezeichnung und Rechte: anlegen/loeschen, Organisator nicht', () {
    expect(vorstand.bezeichnung, 'Anlässe');
    expect((vorstand.kannAnlegen, vorstand.kannLoeschen), (true, true));
    final o = OrganisatorZugang(api);
    expect((o.kannAnlegen, o.kannLoeschen), (false, false));
  });

  test('Organisator kann die Vorstand-Aufrufe nicht (NichtErlaubt, kein Aufruf)', () async {
    final o = OrganisatorZugang(api);
    await expectLater(o.anlassAnlegen(AnlassEntwurf(titel: 'x')), throwsA(isA<NichtErlaubt>()));
    await expectLater(o.anlassLoeschen('e1'), throwsA(isA<NichtErlaubt>()));
    await expectLater(o.vorschlaege(), throwsA(isA<NichtErlaubt>()));
    await expectLater(o.vorschlagFreigeben('e1'), throwsA(isA<NichtErlaubt>()));
    await expectLater(o.vorschlagAblehnen('e1'), throwsA(isA<NichtErlaubt>()));
    await expectLater(
      o.organisatorZuweisen('e1', const OrganisatorAngabe()),
      throwsA(isA<NichtErlaubt>()),
    );
    await expectLater(o.pdfAushangEntfernen('e1'), throwsA(isA<NichtErlaubt>()));
    expect(anfragen, isEmpty);
  });

  test('Bestehendes ueber die as-organizer-Routen', () async {
    await vorstand.bestaetigen('e1', 'r1');
    await vorstand.schichtLoeschen('e1', 's1');
    await vorstand.mitgliederVerzeichnis().catchError((_) => <VerzeichnisMitglied>[]);
    expect(anfragen.map(route), [
      'POST /events/e1/registrations/r1/approve-as-organizer',
      'DELETE /events/e1/shifts/s1/as-organizer',
      'GET /members/directory',
    ]);
  });

  test('Arbeitsplan senden: Vorstand-Route, Recht bei Anlaessen mit Schichten', () async {
    antwort = (_) => {'message': 'Arbeitsplan an 4 Empfänger versendet'};
    expect(await vorstand.arbeitsplanSenden('e1'), 'Arbeitsplan an 4 Empfänger versendet');
    expect(route(anfragen.single), 'POST /events/e1/send-arbeitsplan');

    VerwalteterAnlass mit(List<Object> schichten) => VerwalteterAnlass.ausJson({
      'id': 'e1',
      'title': 'Chilbi',
      'shifts': schichten,
      'organisator': {
        'aktionen': {'bestaetigen': true, 'schichten': true},
      },
    });
    expect(
      vorstand
          .rechte(
            mit([
              {'id': 's1'},
            ]),
          )
          .arbeitsplanSenden,
      isTrue,
    );
    expect(vorstand.rechte(mit([])).arbeitsplanSenden, isFalse);
    expect(vorstand.rechte(mit([])).schichten, isTrue, reason: 'Rest wie vom Backend');
    expect(
      OrganisatorZugang(api)
          .rechte(
            mit([
              {'id': 's1'},
            ]),
          )
          .arbeitsplanSenden,
      isFalse,
    );
  });

  group('Anlegen', () {
    test('Dorffest: POST events, Anmeldung Pflicht, ohne Anmelde-/Menuefelder', () async {
      final e = AnlassEntwurf(
        titel: ' Chilbi 2027 ',
        kategorie: 'Dorffest',
        beginn: Zeitpunkt(DateTime(2027, 10, 16), stunde: 17, minute: 0),
        ende: Zeitpunkt(DateTime(2027, 10, 17), stunde: 22, minute: 0),
        anmeldeschluss: Zeitpunkt(DateTime(2027, 10, 1)),
        maxTeilnehmer: 40,
        menueOptionen: ['Fleisch'],
        organisator: const OrganisatorAngabe(
          mitgliedId: 'm2',
          name: 'Hans Helfer',
          email: 'hans@example.ch',
        ),
      );
      expect(await vorstand.anlassAnlegen(e), 'neu1');
      final a = ohneOptionen().single;
      expect(route(a), 'POST /events');
      expect(body(a), {
        'title': 'Chilbi 2027',
        'subtitle': null,
        'category': 'Dorffest',
        'status': 'planned',
        'start_date': '2027-10-16 17:00:00',
        'end_date': '2027-10-17 22:00:00',
        'datum_offen': false,
        'location': null,
        'description': null,
        'cost': null,
        'registration_required': true,
        'registration_deadline': null,
        'max_participants': null,
        'meal_options': null,
        'organizer_id': 'm2',
        'organizer_name': 'Hans Helfer',
        'organizer_email': 'hans@example.ch',
        'create_access': false,
      });
    });

    test('GV: Anmeldung mit Menuewahl; extern mit Zugang; PDF; Termin offen', () async {
      final e = AnlassEntwurf(
        titel: 'GV 2027',
        kategorie: 'GV',
        beginn: Zeitpunkt(DateTime(2027, 3, 5)),
        datumOffen: true,
        anmeldeschluss: Zeitpunkt(DateTime(2027, 2, 20)),
        menueOptionen: [' Fleisch ', '', 'Vegi'],
        organisator: const OrganisatorAngabe(
          name: 'Max Muster',
          email: 'max@example.ch',
          zugangErstellen: true,
        ),
      )..pdfNeu = (bytes: Uint8List.fromList([37, 80, 68, 70]), dateiname: 'gv.pdf');
      await vorstand.anlassAnlegen(e);
      final b = body(ohneOptionen().single) as Map;
      expect(b['registration_required'], isTrue);
      expect(b['registration_deadline'], '2027-02-20');
      expect(b['meal_options'], ['Fleisch', 'Vegi']);
      expect(b['datum_offen'], isTrue);
      expect(b['start_date'], '2027-03-05');
      expect(
        [b['organizer_id'], b['organizer_name'], b['organizer_email'], b['create_access']],
        [null, 'Max Muster', 'max@example.ch', true],
      );
      expect((b['pdf_attachment'], b['pdf_filename']), ('JVBERg==', 'gv.pdf'));
    });

    test('Ausflug: keine Anmeldung; Sonstiges: Anmeldung nur, wenn eingeschaltet', () {
      final ausflug = AnlassEntwurf(titel: 'A', kategorie: 'Ausflug', anmeldungVerlangt: true)
        ..anmeldeschluss = Zeitpunkt(DateTime(2027, 1, 1));
      expect(
        ausflug.alsNeuJson(anmeldepflichtig: ['Dorffest']),
        allOf(
          containsPair('registration_required', false),
          containsPair('registration_deadline', null),
        ),
      );
      final sonst = AnlassEntwurf(titel: 'S', kategorie: 'Sonstiges', anmeldungVerlangt: true);
      expect(sonst.alsNeuJson()['registration_required'], isTrue);
      expect(sonst.alsNeuJson().containsKey('organizer_id'), isFalse, reason: 'ohne Angabe');
    });
  });

  test('Felder je Kategorie wie vorstand.html', () {
    String f(String? k) {
      final x = KategorieFelder.fuer(k);
      return [
        if (x.anmeldung) 'anmeldung',
        if (x.menue) 'menue',
        if (x.schichten) 'schichten',
        if (x.ohneAnmeldung) 'hinweis',
      ].join(',');
    }

    expect(f('Dorffest'), 'schichten');
    expect(f('GV'), 'anmeldung,menue');
    expect(f('Aufbau'), 'anmeldung');
    expect(f('Abbau'), 'anmeldung');
    expect(f('Ausflug mit Anmeldung'), 'anmeldung');
    expect(f('Ausflug'), 'hinweis');
    expect(f('Sonstiges'), 'anmeldung,schichten');
  });

  test('Aendern: PUT events/:id, nur Geaendertes - auch Organisator und Termin offen', () async {
    const anlass = Anlass(id: 'e1', titel: 'Chilbi', organisator: 'Erika Muster');
    const org = OrganisatorAngabe(mitgliedId: 'm1', name: 'Erika Muster', email: 'e@x.ch');
    final original = AnlassEntwurf.aus(anlass, organisator: org);
    final neu = AnlassEntwurf.aus(anlass, organisator: org);
    expect(await vorstand.anlassAendern('e1', original, neu), isFalse);
    expect(anfragen, isEmpty, reason: 'nichts geaendert, nichts geschickt');

    neu
      ..datumOffen = true
      ..organisator = const OrganisatorAngabe(mitgliedId: 'm2', name: 'Hans Helfer');
    expect(await vorstand.anlassAendern('e1', original, neu), isTrue);
    expect(route(anfragen.single), 'PUT /events/e1');
    expect(body(anfragen.single), {
      'datum_offen': true,
      'organizer_id': 'm2',
      'organizer_name': 'Hans Helfer',
      'organizer_email': null,
      'create_access': false,
    });
  });

  test('Externer Organisator: Zugang nachtraeglich erstellen schickt die Angaben mit', () {
    const anlass = Anlass(id: 'e1', titel: 'Ausflug');
    const org = OrganisatorAngabe(name: 'Max Muster', email: 'max@example.ch');
    final original = AnlassEntwurf.aus(anlass, organisator: org);
    final neu = AnlassEntwurf.aus(
      anlass,
      organisator: const OrganisatorAngabe(
        name: 'Max Muster',
        email: 'max@example.ch',
        zugangErstellen: true,
      ),
    );
    expect(neu.aenderungen(original), {
      'organizer_id': null,
      'organizer_name': 'Max Muster',
      'organizer_email': 'max@example.ch',
      'create_access': true,
    });
    // Ohne E-Mail gibt es keinen Zugang.
    expect(
      const OrganisatorAngabe(name: 'Ohne Mail', zugangErstellen: true).alsJson()['create_access'],
      isFalse,
    );
  });

  test('Organisator-Formular schickt nie Organisator oder datum_offen', () {
    const anlass = Anlass(id: 'e1', titel: 'Chilbi', organisator: 'Erika Muster');
    final original = AnlassEntwurf.aus(anlass);
    final neu = AnlassEntwurf.aus(anlass)..titel = 'Chilbi 2026';
    expect(neu.aenderungen(original), {'title': 'Chilbi 2026'});
  });

  test('Loeschen, Vorschlaege, genehmigen, ablehnen, zuweisen, PDF', () async {
    antwort = (a) => a.url.path == '/events/proposals'
        ? [
            {
              'id': 'v1',
              'title': 'Grillabend',
              'status': 'proposed',
              'start_date': '2027-06-12 18:00:00',
              'location': 'Schopf',
              'organizer_id': 'm7',
              'organizer_name': 'Erika Muster',
              'organizer_email': 'erika@example.ch',
              'organizer_vorname': 'Erika',
              'organizer_nachname': 'Muster',
              'datum_offen': false,
            },
          ]
        : {'success': true};
    final v = await vorstand.vorschlaege();
    expect(v.single.anlass.titel, 'Grillabend');
    expect(v.single.vorgeschlagenVon, 'Erika Muster');
    expect(v.single.wannText, '12.06.2027, 18:00');
    expect(v.single.organisator.mitgliedId, 'm7');
    expect(v.single.organisator.email, 'erika@example.ch');

    await vorstand.vorschlagFreigeben('v1');
    await vorstand.vorschlagAblehnen('v2');
    await vorstand.anlassLoeschen('e1');
    await vorstand.organisatorZuweisen(
      'e1',
      const OrganisatorAngabe(mitgliedId: 'm2', name: 'Hans Helfer', email: 'h@x.ch'),
    );
    await vorstand.pdfAushangSetzen('e1', (
      bytes: Uint8List.fromList([37, 80, 68, 70]),
      dateiname: 'aushang.pdf',
    ));
    await vorstand.pdfAushangEntfernen('e1');
    expect(anfragen.map(route), [
      'GET /events/proposals',
      'PUT /events/v1',
      'DELETE /events/v2',
      'DELETE /events/e1',
      'PUT /events/e1',
      'PUT /events/e1',
      'PUT /events/e1',
    ]);
    expect(body(anfragen[1]), {'status': 'planned'});
    expect(body(anfragen[4]), {
      'organizer_id': 'm2',
      'organizer_name': 'Hans Helfer',
      'organizer_email': 'h@x.ch',
      'create_access': false,
    });
    expect(body(anfragen[5]), {'pdf_attachment': 'JVBERg==', 'pdf_filename': 'aushang.pdf'});
    expect(body(anfragen[6]), {'pdf_attachment': null, 'pdf_filename': null});
  });

  test('Springer: je Zeitfenster einer, ohne doppelte und ohne Vorbereitung', () {
    final sa = DateTime(2027, 10, 16);
    SchichtEntwurf s(String bereich, String von, String bis, {DateTime? datum}) =>
        SchichtEntwurf(name: bereich, bereich: bereich, datum: datum ?? sa, von: von, bis: bis);
    final neu = springerSchichten([
      s('Bar', '17:00', '20:00'),
      s('Kueche', '17:00', '20:00'),
      s('Bar', '20:00', '23:00'),
      s('Springer', '20:00', '23:00'),
      s('Vorbereitung', '10:00', '12:00'),
      s('Bar', '', ''),
      s('Kasse', '17:00', '20:00', datum: DateTime(2027, 10, 17)),
    ]);
    expect(
      [for (final n in neu) '${isoDatum(n.datum!)} ${n.von}-${n.bis} ${n.bereich}'],
      ['2027-10-16 17:00-20:00 Springer', '2027-10-17 17:00-20:00 Springer'],
    );
    expect(neu.first.alsJson(), containsPair('needed', 1));
    expect(neu.first.name, 'Springer');
    expect(springerSchichten(neu), isEmpty, reason: 'nur Springer: keine Zeitfenster');
  });
}
