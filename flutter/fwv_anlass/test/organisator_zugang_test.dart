// OrganisatorZugang gegen ein nachgebautes Backend: richtige Routen fuer
// Mitglieder und externe Organisatoren, und vor allem: beim Bearbeiten geht
// nur raus, was sich geaendert hat. Damit sind drei Fehler der alten
// iOS-App ausgeschlossen (Menuewahl/Anmeldeschluss geloescht, Schicht-Datum
// auf heute, Bemerkungen ueberschrieben).

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

  OrganisatorZugang dienst({bool extern = false}) => OrganisatorZugang(
    ApiClient(
      http: MockClient((a) async {
        anfragen.add(a);
        final o = antwort(a);
        if (o is Uint8List) return http.Response.bytes(o, 200);
        return http.Response.bytes(utf8.encode(jsonEncode(o)), 200);
      }),
    ),
    externerLogin: extern,
  );

  setUp(() {
    anfragen = [];
    antwort = (_) => {'success': true};
  });

  String route(http.Request a) => '${a.method} ${a.url.path}';
  Object? body(http.Request a) => a.body.isEmpty ? null : jsonDecode(a.body);

  const paar = VerwalteteAnmeldung(
    id: 'r6',
    name: 'Paar Gast',
    email: 'paar@example.ch',
    telefon: '+41 79 111 22 33',
    personen: 2,
    begleitpersonen: [Begleitperson(name: 'Peter Gast')],
    allergien: 'Nüsse',
    menue: 'Vegi',
    bemerkung: 'Kommen etwas später',
  );

  test('Uebersicht', () async {
    antwort = (_) => {
      'zugang': 'organisator-login',
      'anlaesse': [
        {
          'id': 'e2',
          'title': 'Ausflug',
          'organisator': {
            'zahlen': {'text': 'Noch keine Anmeldungen'},
            'aktionen': {'bestaetigen': true},
          },
        },
      ],
    };
    final u = await dienst().uebersicht();
    expect(route(anfragen.single), 'GET /events/organisator-uebersicht');
    expect(u.zugang, ZugangsArt.organisatorLogin);
    expect(u.anlaesse.single.zahlen.text, 'Noch keine Anmeldungen');
    expect(u.anlaesse.single.rechte.bestaetigen, isTrue);
    expect(u.anlaesse.single.rechte.anlassBearbeiten, isFalse);
  });

  group('Routen je nach Zugang', () {
    test('Mitglied: …-as-organizer', () async {
      final d = dienst();
      await d.bestaetigen('e1', 'r1');
      await d.ablehnen('e1', 'r1');
      await d.personHinzufuegen('e1', const NeuePerson(mitgliedId: 'm1', personen: 2));
      await d.mitgliederVerzeichnis();
      expect(anfragen.map(route), [
        'POST /events/e1/registrations/r1/approve-as-organizer',
        'POST /events/e1/registrations/r1/reject-as-organizer',
        'POST /events/e1/registrations-as-organizer',
        'GET /members/directory',
      ]);
      expect(body(anfragen[2]), {'member_id': 'm1', 'participants': 2});
    });

    test('Externer Organisator: events/my-event/…', () async {
      final d = dienst(extern: true);
      await d.bestaetigen('e2', 'r5');
      await d.ablehnen('e2', 'r5');
      await d.personHinzufuegen(
        'e2',
        const NeuePerson(name: ' Gast ', email: 'g@example.ch', telefon: '', bemerkung: 'tel.'),
      );
      antwort = (_) => [
        {
          'id': 'm1',
          'name': 'Erika Muster',
          'vorname': 'Erika',
          'email': 'e@x.ch',
          'telefon': '079',
        },
      ];
      final v = await d.mitgliederVerzeichnis();
      expect(anfragen.map(route), [
        'POST /events/my-event/registrations/r5/approve',
        'POST /events/my-event/registrations/r5/reject',
        'POST /events/my-event/registrations',
        'GET /events/my-event/members',
      ]);
      expect(body(anfragen[2]), {
        'guest_name': 'Gast',
        'guest_email': 'g@example.ch',
        'participants': 1,
        'notes': 'tel.',
      });
      expect((v.single.name, v.single.telefon), ('Erika Muster', '079'));
    });

    test('Verzeichnis aus members/directory: Name aus Vor- und Nachname', () async {
      antwort = (_) => [
        {
          'id': 'm2',
          'vorname': 'Hans',
          'nachname': 'Helfer',
          'mobile': '078',
          'funktion': 'Kassier',
        },
      ];
      final v = await dienst().mitgliederVerzeichnis();
      expect(
        (v.single.name, v.single.telefon, v.single.funktion),
        ('Hans Helfer', '078', 'Kassier'),
      );
    });
  });

  group('Anmeldung bearbeiten (iOS-Fehler: Bemerkungen ueberschrieben)', () {
    test('nur geaenderte Felder; Begleitpersonen, Allergien, Menue nie im Body', () async {
      final neu = AnmeldungEntwurf.aus(paar)..personen = 3;
      expect(await dienst().anmeldungAendern('e4', paar, neu), isTrue);
      expect(route(anfragen.single), 'PUT /events/e4/registrations/r6/as-organizer');
      expect(body(anfragen.single), {'participants': 3});
    });

    test('Bemerkung und Status', () async {
      final neu = AnmeldungEntwurf.aus(paar)
        ..bemerkung = 'Neu'
        ..status = 'approved';
      await dienst().anmeldungAendern('e4', paar, neu);
      expect(body(anfragen.single), {'notes': 'Neu', 'status': 'approved'});
    });

    test('Mitglied: Name und E-Mail gehen nie raus', () async {
      const m = VerwalteteAnmeldung(
        id: 'r1',
        name: 'Erika Muster',
        mitglied: true,
        email: 'e@x.ch',
      );
      final neu = AnmeldungEntwurf.aus(m)
        ..name = 'Anders'
        ..email = 'anders@x.ch'
        ..telefon = '079 1';
      await dienst().anmeldungAendern('e1', m, neu);
      expect(body(anfragen.single), {'guest_phone': '079 1'});
    });

    test('nichts geaendert: kein Aufruf', () async {
      expect(await dienst().anmeldungAendern('e4', paar, AnmeldungEntwurf.aus(paar)), isFalse);
      expect(anfragen, isEmpty);
    });

    test('Loeschen', () async {
      await dienst().anmeldungLoeschen('e4', 'r6');
      expect(route(anfragen.single), 'DELETE /events/e4/registrations/r6/as-organizer');
    });
  });

  group('Anlass bearbeiten (iOS-Fehler: Menuewahl und Anmeldeschluss geloescht)', () {
    const ge = Anlass(
      id: 'e4',
      titel: 'Helferessen',
      kategorie: 'GV',
      status: 'planned',
      beginn: '2026-10-31 19:00:00',
      ende: '2026-10-31 23:00:00',
      anmeldeschluss: '2026-10-20 18:00:00',
      maxTeilnehmer: 40,
      menueOptionen: ['Fleisch', 'Vegi'],
    );

    test('nur der Titel: Menue und Anmeldeschluss bleiben unberuehrt', () async {
      final original = AnlassEntwurf.aus(ge);
      final neu = AnlassEntwurf.aus(ge)..titel = 'Helferessen 2026';
      expect(await dienst().anlassAendern('e4', original, neu), isTrue);
      expect(route(anfragen.single), 'PUT /events/e4/as-organizer');
      expect(body(anfragen.single), {'title': 'Helferessen 2026'});
    });

    test('Menue ergaenzen, Anmeldeschluss entfernen, Uhrzeit aendern', () async {
      final original = AnlassEntwurf.aus(ge);
      final neu = AnlassEntwurf.aus(ge)
        ..menueOptionen = ['Fleisch', 'Vegi', ' Fisch ', '']
        ..anmeldeschluss = null
        ..beginn = original.beginn!.mitUhrzeit(18, 30);
      await dienst().anlassAendern('e4', original, neu);
      expect(body(anfragen.single), {
        'start_date': '2026-10-31 18:30:00',
        'registration_deadline': null,
        'meal_options': ['Fleisch', 'Vegi', 'Fisch'],
      });
    });

    test('ganztaegig: nur das Datum; nichts geaendert: kein Aufruf', () async {
      const ganz = Anlass(id: 'e2', titel: 'Ausflug', beginn: '2026-10-24 00:00:00');
      final e = AnlassEntwurf.aus(ganz);
      expect(e.beginn!.mitZeit, isFalse);
      expect(e.beginn!.alsDb(), '2026-10-24');
      expect(await dienst().anlassAendern('e2', e, AnlassEntwurf.aus(ganz)), isFalse);
      expect(anfragen, isEmpty);
    });
  });

  group('Schichten (iOS-Fehler: Datum sprang auf heute)', () {
    const s = Schicht(
      id: 's2',
      name: 'Schicht 1',
      bereich: 'Bar',
      datum: '2026-10-17',
      beginn: '12:00:00',
      ende: '14:00:00',
      gebraucht: 2,
    );

    test('Zeit aendern: Datum bleibt und geht gar nicht erst raus', () async {
      final original = SchichtEntwurf.aus(s);
      expect(isoDatum(original.datum!), '2026-10-17');
      final neu = SchichtEntwurf.aus(s)
        ..bis = '15:00'
        ..gebraucht = 3;
      await dienst().schichtAendern('e1', 's2', original, neu);
      expect(route(anfragen.single), 'PUT /events/e1/shifts/s2/as-organizer');
      expect(body(anfragen.single), {'end_time': '15:00', 'needed': 3});
    });

    test('Datum bewusst aendern', () async {
      final original = SchichtEntwurf.aus(s);
      final neu = SchichtEntwurf.aus(s)..datum = DateTime(2026, 10, 18);
      await dienst().schichtAendern('e1', 's2', original, neu);
      expect(body(anfragen.single), {'date': '2026-10-18'});
    });

    test('anlegen und loeschen', () async {
      final d = dienst();
      await d.schichtAnlegen(
        'e1',
        SchichtEntwurf(
          name: 'Abbau',
          bereich: 'Abbau',
          datum: DateTime(2026, 10, 19),
          von: '09:00',
          gebraucht: 4,
        ),
      );
      await d.schichtLoeschen('e1', 's9');
      expect(anfragen.map(route), [
        'POST /events/e1/shifts-as-organizer',
        'DELETE /events/e1/shifts/s9/as-organizer',
      ]);
      expect(body(anfragen.first), {
        'name': 'Abbau',
        'bereich': 'Abbau',
        'description': null,
        'date': '2026-10-19',
        'start_time': '09:00',
        'end_time': null,
        'needed': 4,
      });
    });
  });

  test('Alternative vorschlagen und Angemeldete informieren', () async {
    final d = dienst();
    antwort = (_) => {'success': true, 'message': 'Vorschlag gesendet'};
    final text = await d.alternativeVorschlagen(
      'e1',
      'r4',
      schichtId: 's1',
      schichtText: 'Aufbau · Fr 16.10. · 08:00',
      email: 'neu@example.ch',
      kommentar: ' ',
    );
    expect(text, 'Vorschlag gesendet');
    expect(
      route(anfragen.last),
      'POST /events/e1/registrations/r4/suggest-alternative-as-organizer',
    );
    expect(body(anfragen.last), {
      'newShiftId': 's1',
      'shiftInfo': 'Aufbau · Fr 16.10. · 08:00',
      'email': 'neu@example.ch',
    });

    antwort = (_) => {
      'success': true,
      'emailed': 3,
      'posted': 1,
      'skipped': 1,
      'pushed': 2,
      'unreachable': ['Ohne Adresse'],
    };
    final e = await d.mitteilen('e1', betreff: ' Neu ', nachricht: ' Treffpunkt 9 Uhr ');
    expect(body(anfragen.last), {'subject': 'Neu', 'message': 'Treffpunkt 9 Uhr'});
    expect((e.perEmail, e.perPost, e.perPush, e.uebersprungen), (3, 1, 2, 1));
    expect(e.nichtErreicht, ['Ohne Adresse']);
  });

  test('Notizen: Anhang als Base64, Liste, Download', () async {
    final d = dienst();
    await d.notizAnlegen(
      'e1',
      text: ' Schluessel bei Hans ',
      anhaenge: [
        AnhangUpload(
          dateiname: 'plan.jpg',
          typ: 'image/jpeg',
          bytes: Uint8List.fromList([1, 2, 3]),
        ),
      ],
    );
    expect(route(anfragen.last), 'POST /events/e1/organizer-notes');
    expect(body(anfragen.last), {
      'content': 'Schluessel bei Hans',
      'attachments': [
        {'filename': 'plan.jpg', 'content_type': 'image/jpeg', 'data': 'AQID'},
      ],
    });

    antwort = (_) => [
      {
        'id': 'n1',
        'content': 'Text',
        'created_by': 'Erika',
        'created_at': '2026-10-11 09:05:00.123',
        'attachments': [
          {'id': 'a1', 'filename': 'plan.jpg', 'content_type': 'image/jpeg', 'size': 3},
        ],
      },
    ];
    final n = (await d.notizen('e1')).single;
    expect(n.erstelltText, '11.10.2026, 09:05');
    expect(n.anhaenge.single.istBild, isTrue);

    antwort = (_) => Uint8List.fromList([9, 9]);
    expect(await d.anhang('e1', 'n1', 'a1'), [9, 9]);
    expect(route(anfragen.last), 'GET /events/e1/organizer-notes/n1/attachments/a1');
    await d.anhangLoeschen('e1', 'n1', 'a1');
    await d.notizLoeschen('e1', 'n1');
    expect(anfragen.reversed.take(2).map(route), [
      'DELETE /events/e1/organizer-notes/n1',
      'DELETE /events/e1/organizer-notes/n1/attachments/a1',
    ]);
  });

  test('Rezepte und Material: Zahlen als Text oder Zahl, Routen', () async {
    final d = dienst();
    antwort = (_) => {
      'items': [
        {
          'item_id': 7,
          'item_name': 'Bratwurst',
          'unit': 'Stk',
          'needed': '120',
          'in_stock': 20,
          'to_buy': '100.0',
        },
        {'item_id': 8, 'item_name': 'Becher', 'manual_needed': '50', 'needed': 50, 'to_buy': 0},
      ],
      'total_to_buy': 1,
      'estimated_total_cost': '84.50',
    };
    final l = await d.einkaufsliste('e1');
    expect(l.posten.first.zuKaufen, 100);
    expect(mengeText(l.posten.first.zuKaufen), '100');
    expect(mengeText(2.5), '2.5');
    expect(l.vonHand.single.name, 'Becher');
    expect(l.geschaetzteKosten, 84.5);

    antwort = (_) => [
      {'id': 3, 'recipe_id': 11, 'name': 'Risotto', 'servings': '40', 'available_portions': 12},
    ];
    final r = (await d.rezepte('e1')).single;
    expect((r.rezeptId, r.portionen, r.ausLagerMoeglich), (11, 40.0, 12.0));

    antwort = (_) => {'success': true};
    await d.rezeptVerknuepfen('e1', 11, 20);
    await d.portionenAendern('e1', 11, 60);
    await d.rezeptLoesen('e1', 11);
    await d.materialErfassen('e1', 8, 2.5);
    await d.materialEntfernen('e1', 8);
    expect(anfragen.reversed.take(5).toList().reversed.map(route), [
      'POST /events/e1/recipes',
      'PUT /events/e1/recipes/11',
      'DELETE /events/e1/recipes/11',
      'POST /events/e1/manual-items',
      'DELETE /events/e1/manual-items/8',
    ]);
    expect(body(anfragen[anfragen.length - 5]), {'recipe_id': 11, 'servings': 20});
    expect(body(anfragen[anfragen.length - 2]), {'item_id': 8, 'quantity': 2.5});
  });

  test('Einkauf: abhaken, Belege, zurueckbuchen (Proxy-Routen)', () async {
    final d = dienst();
    antwort = (_) => {
      'items': [
        {
          'item_id': 7,
          'item_name': 'Reis',
          'purchased': true,
          'purchased_by': 'erika@example.ch',
          'actual_quantity': '5.5',
          'restocked': false,
        },
        {'item_id': 8, 'item_name': 'Kaffee', 'purchased': true, 'restocked': true},
        {'item_id': 9, 'item_name': 'Becher', 'purchased': false},
      ],
      'total_purchased': 2,
    };
    final l = await d.einkaufsliste('e1');
    expect(l.gekauft, 2);
    expect(l.posten.first.gekauft, isTrue);
    expect(l.posten.first.gekauftVon, 'erika@example.ch');
    expect(l.posten.first.istMenge, 5.5);
    expect(l.zumZurueckbuchen, 1, reason: 'Kaffee ist schon im Lager');

    antwort = (_) => {'success': true};
    await d.gekauftSetzen('e1', 7, true, istMenge: 5.5);
    expect(route(anfragen.last), 'PATCH /events/e1/shopping-list/7');
    expect(body(anfragen.last), {'purchased': true, 'actual_quantity': 5.5});
    await d.gekauftSetzen('e1', 7, false);
    expect(body(anfragen.last), {'purchased': false});

    antwort = (_) => [
      {
        'id': 7,
        'image_url': '/api/uploads/item-abc.jpg',
        'amount': '42.50',
        'paid_by': 'erika@example.ch',
        'note': null,
        'uploaded_by': 'erika@example.ch',
        'created_at': '2026-10-10T08:00:00.000Z',
      },
    ];
    final b = (await d.belege('e1')).single;
    expect(route(anfragen.last), 'GET /events/e1/receipts');
    expect(
      (b.id, b.betrag, b.bezahltVon, b.datumText),
      (7, 42.5, 'erika@example.ch', '10.10.2026'),
    );

    antwort = (_) => {'id': 9};
    await d.belegHochladen('e1', Uint8List.fromList([0xff, 0xd8, 0xff, 0xd9]));
    final hoch = anfragen.last;
    expect(route(hoch), 'POST /events/e1/receipts');
    expect(hoch.headers['content-type'], startsWith('multipart/form-data'));
    final roh = latin1.decode(hoch.bodyBytes);
    expect(roh, contains('name="image"; filename="beleg.jpg"'));
    expect(roh, contains('image/jpeg'));

    antwort = (_) => Uint8List.fromList([1, 2, 3]);
    expect(await d.belegBild('e1', 7), [1, 2, 3]);
    expect(route(anfragen.last), 'GET /events/e1/receipts/7/image');

    antwort = (_) => {'success': true};
    await d.belegLoeschen('e1', 7);
    expect(route(anfragen.last), 'DELETE /events/e1/receipts/7');

    antwort = (_) => {
      'restocked': 2,
      'items': [
        {'item_id': 7, 'name': 'Reis', 'quantity': 6},
        {'item_id': 10, 'name': 'Servietten', 'quantity': '3'},
      ],
    };
    final z = await d.insLagerZurueckbuchen('e1');
    expect(route(anfragen.last), 'POST /events/e1/shopping-list/restock');
    expect(z.anzahl, 2);
    expect(z.text, 'Ins Lager gebucht: Reis +6, Servietten +3');
    expect(Zurueckbuchung.ausJson({'restocked': 0, 'items': []}).text, startsWith('Nichts'));
  });

  test('PDFs und Arbeitsplan senden', () async {
    final d = dienst(extern: true);
    antwort = (_) => Uint8List.fromList([37, 80, 68, 70]);
    await d.teilnehmerlistePdf('e1');
    await d.aushangPdf('e1');
    await d.arbeitsplanPdf('e1');
    antwort = (_) => {'success': true, 'message': 'Arbeitsplan an 4 Empfänger versendet'};
    expect(await d.arbeitsplanSenden('e1'), 'Arbeitsplan an 4 Empfänger versendet');
    expect(anfragen.map(route), [
      'GET /events/e1/pdf/teilnehmerliste',
      'GET /events/e1/pdf',
      'GET /events/e1/pdf/arbeitsplan',
      'POST /events/my-event/send-arbeitsplan',
    ]);
  });

  test('Fehler mit "reason" (Arbeitsplan senden) kommt als Meldung durch', () async {
    final d = OrganisatorZugang(
      ApiClient(
        http: MockClient(
          (_) async => http.Response.bytes(
            utf8.encode(jsonEncode({'success': false, 'reason': 'Keine Helfer bestätigt'})),
            400,
          ),
        ),
      ),
      externerLogin: true,
    );
    await expectLater(
      d.arbeitsplanSenden('e1'),
      throwsA(isA<ApiFehler>().having((e) => e.meldung, 'meldung', 'Keine Helfer bestätigt')),
    );
  });
}
