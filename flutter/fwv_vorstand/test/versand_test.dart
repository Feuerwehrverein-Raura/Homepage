// Nachricht per E-Mail/Brief, Versandverlauf und Pingen gegen ein
// nachgebautes api-dispatch (docker/backend-dispatch/src/index.js,
// nachricht-routen.js). Nichts geht wirklich raus.
//
// Wichtig ist, dass die Zahlen der Rueckfrage zu dem passen, was das Backend
// tut (E-Mail nur mit Adresse, Brief nur mit Strasse/PLZ/Ort, Auto nach
// Zustellwunsch), und dass die Aufrufe die richtigen Felder tragen.

import 'dart:convert';
import 'dart:typed_data';

import 'package:flutter_test/flutter_test.dart';
import 'package:fwv_core/fwv_core.dart';
import 'package:fwv_vorstand/fwv_vorstand.dart';
import 'package:http/http.dart' as http;
import 'package:material_ui/material_ui.dart';

import 'hilfe.dart' hide tippen;

/// Sichtbar machen (auch in verschachtelten Listen) und antippen.
Future<void> tippen(WidgetTester tester, Finder f) async {
  await tester.ensureVisible(f);
  await tester.pumpAndSettle();
  await tester.tap(f);
  await tester.pumpAndSettle();
}

Map<String, Object?> mitgliedJson(
  String id,
  String vorname,
  String nachname, {
  String status = 'Aktivmitglied',
  String? email,
  bool zEmail = true,
  bool zPost = false,
  bool adresse = true,
  String plz = '4303',
}) => {
  'id': id,
  'vorname': vorname,
  'nachname': nachname,
  'anrede': 'Frau',
  'status': status,
  'email': email ?? '${vorname.toLowerCase()}@example.ch',
  'zustellung_email': zEmail,
  'zustellung_post': zPost,
  'strasse': adresse ? 'Hauptstrasse 5' : null,
  'plz': adresse ? plz : null,
  'ort': adresse ? 'Kaiseraugst' : null,
};

final mitgliederStart = [
  mitgliedJson('m1', 'Anna', 'Aktiv'),
  mitgliedJson('m2', 'Beat', 'Brief', zEmail: false, zPost: true),
  mitgliedJson('m3', 'Carla', 'Beides', status: 'Ehrenmitglied', zPost: true, plz: '79618'),
  mitgliedJson('m4', 'Dora', 'Ohne', status: 'Aufnahme pendent', email: '', adresse: false),
  mitgliedJson('m5', 'Emil', 'Alt', status: 'Ausgetreten'),
  mitgliedJson('m6', 'Test', 'Konto', status: 'Testkonto'),
];

List<VorstandMitglied> mitglieder([List<Map<String, Object?>>? json]) => [
  for (final m in json ?? mitgliederStart) VorstandMitglied.ausJson(m),
];

final logStart = [
  {
    'id': 'l1',
    'type': 'email',
    'member_id': 'm1',
    'recipient_email': 'anna@example.ch',
    'subject': 'Einladung GV',
    'body': 'Liebe Anna\n\nWir laden ein.',
    'status': 'sent',
    'external_id': '<abc@fwv>',
    'created_at': '2026-10-13 08:00:00',
    'sent_at': '2026-10-13 08:00:01',
  },
  {
    'id': 'l2',
    'type': 'pingen',
    'member_id': 'm2',
    'recipient_address':
        '{"name":"Beat Brief","street":"Hauptstrasse 5","zip":"4303","city":"Kaiseraugst"}',
    'subject': '[Staging] Einladung GV',
    'status': 'processing',
    'external_id': 'P-2',
    'created_at': '2026-10-13 08:01:00',
    'sent_at': '2026-10-13 08:01:00',
    'vorname': 'Beat',
    'nachname': 'Brief',
  },
];

class Dispatch {
  Dispatch() {
    backend = FalschesBackend(antwort);
  }

  late final FalschesBackend backend;
  var members = [...mitgliederStart];

  /// member_id, deren Brief beim Senden scheitert.
  final briefFehler = <String>{};

  Object? antwort(http.Request a) {
    final weg = '${a.method} ${a.url.path}';
    final q = a.url.queryParameters;
    final body = a.body.isEmpty ? const <String, dynamic>{} : jsonDecode(a.body) as Map;
    switch (weg) {
      case 'GET /members':
        return members;
      case 'GET /templates':
        return [
          {
            'id': 't1',
            'name': 'Event Einladung',
            'type': 'email',
            'subject': 'Einladung: {{event_title}}',
            'body': r'Liebe/r {{anrede}} {{nachname}}\n\nWir laden ein.',
          },
          {
            'id': 't2',
            'name': 'GV',
            'type': 'brief_ch',
            'subject': 'Generalversammlung',
            'body':
                '<html><head><style>p{}</style></head><body><p>Hallo {{vorname}}</p>'
                '<p>Bis bald&nbsp;&amp; gruss</p></body></html>',
          },
        ];
      case 'POST /email/bulk':
        final ids = (body['member_ids'] as List).cast<String>();
        return {
          'results': [
            for (final id in ids) {'member_id': id, 'success': true},
          ],
          'total': ids.length,
          'success': ids.length,
          'failed': 0,
          'skipped': 0,
        };
      case 'POST /dispatch/brief':
        final id = body['member_id'] as String;
        return {
          'html': '<html>$id</html>',
          'pdf_margin': {'top': '15mm', 'right': '0', 'bottom': '20mm', 'left': '0'},
          'recipient': {'name': 'Name $id', 'country': 'CH'},
          'subject': body['subject'],
          if (body['vorschau'] == true) 'pdf_base64': base64Encode(utf8.encode('%PDF-1.4')),
        };
      case 'POST /dispatch/send-post':
        if (briefFehler.contains(body['member_id'])) {
          return (500, {'error': 'Pingen: invalid address'});
        }
        return {'success': true, 'letter_id': 'L-${body['member_id']}'};
      case 'GET /dispatch-log':
        return [
          for (final l in logStart)
            if (q['type'] == null || l['type'] == q['type']) l,
        ];
      case 'GET /pingen/account':
        final staging = q['staging'] == 'true';
        return {
          'name': 'FWV Raura',
          'balance': staging ? 100 : 42.5,
          'currency': 'CHF',
          'isStaging': staging,
        };
      case 'GET /pingen/stats':
        return {
          'total': '12',
          'sent': '10',
          'pending': '1',
          'failed': '1',
          'last_7_days': '2',
          'last_30_days': '5',
        };
      case 'GET /pingen/letters':
        return [logStart[1]];
      case 'GET /pingen/letters/P-2/status':
        return {'letterId': 'P-2', 'status': 'sent'};
      case 'POST /pingen/send-bulk-pdf':
        final ids = (body['member_ids'] as List).cast<String>();
        return {
          'totalRecipients': ids.length,
          'successCount': ids.length,
          'failedCount': 0,
          'success': [
            for (final id in ids) {'name': id, 'letterId': 'P-$id'},
          ],
          'failed': <Object>[],
          'staging': body['staging'],
        };
    }
    return (404, {'error': 'nicht gefunden: $weg'});
  }

  List<Map<String, dynamic>> posts(String pfad) => [
    for (final a in backend.anfragen)
      if (a.method == 'POST' && a.url.path == pfad) jsonDecode(a.body) as Map<String, dynamic>,
  ];
}

void main() {
  group('Empfaenger und Aufteilung', () {
    final alle = mitglieder();

    test('Alle ohne Ausgetretene, Verstorbene, Testkonten', () {
      final e = empfaengerWaehlen(alle, const Empfaengerwahl());
      expect(e.map((m) => m.id), ['m1', 'm2', 'm3', 'm4']);
    });

    test('Status mit den echten Werten', () {
      List<String> nach(String s) => [
        for (final m in empfaengerWaehlen(
          alle,
          Empfaengerwahl(art: EmpfaengerArt.status, status: s),
        ))
          m.id,
      ];
      expect(nach('Aktivmitglied'), ['m1', 'm2']);
      expect(nach('Aufnahme pendent'), ['m4']);
      expect(nach('Ehrenmitglied'), ['m3']);
      expect(nach('Ausgetreten'), ['m5']);
    });

    test('Zustellart und Einzelauswahl', () {
      final post = empfaengerWaehlen(
        alle,
        const Empfaengerwahl(art: EmpfaengerArt.zustellart, zustellart: Zustellart.post),
      );
      expect(post.map((m) => m.id), ['m2', 'm3']);
      final einzeln = empfaengerWaehlen(
        alle,
        const Empfaengerwahl(art: EmpfaengerArt.einzeln, ids: {'m5', 'm1'}),
      );
      expect(einzeln.map((m) => m.id), ['m1', 'm5']);
    });

    test('Auto nach Wunsch, E-Mail an alle mit Adresse, Brief an alle mit Anschrift', () {
      final e = empfaengerWaehlen(alle, const Empfaengerwahl());
      final auto = versandPlanen(e, Versandart.auto);
      expect(auto.email.map((m) => m.id), ['m1', 'm3']);
      expect(auto.post.map((m) => m.id), ['m2', 'm3']);
      expect(auto.ohne.map((m) => m.id), ['m4']);
      expect(auto.beides, 1);
      expect(auto.kosten, 2.0);

      final email = versandPlanen(e, Versandart.email);
      expect(email.email.map((m) => m.id), ['m1', 'm2', 'm3']);
      expect(email.post, isEmpty);
      expect(email.ohne.map((m) => m.id), ['m4']);

      final post = versandPlanen(e, Versandart.post);
      expect(post.post.map((m) => m.id), ['m1', 'm2', 'm3']);
      expect(post.kosten, 3.0);
    });

    test('Rueckfrage nennt Zahlen pro Kanal, Kosten bzw. Staging', () {
      final plan = versandPlanen(empfaengerWaehlen(alle, const Empfaengerwahl()), Versandart.auto);
      final live = versandRueckfrage(plan, betreff: 'GV', staging: false);
      expect(live, contains('• 2 E-Mails'));
      expect(live, contains('• 2 Briefe per Post – ca. CHF 2.00'));
      expect(live, contains('1 Mitglied wünscht beides'));
      expect(live, contains('• 1 ohne passende Adresse'));
      expect(live, contains('gedruckt'));
      final test = versandRueckfrage(plan, betreff: 'GV', staging: true);
      expect(test, contains('Staging (Test, kostet nichts'));
      expect(test, isNot(contains('CHF')));
    });

    test('Platzhalter, unbekannte Platzhalter, Vorlagen als Text', () {
      final anna = alle.first;
      expect(
        platzhalterErsetzen('Liebe {{vorname}} {{ nachname }} {{x}}', anna),
        'Liebe Anna Aktiv {{x}}',
      );
      expect(unbekanntePlatzhalter('{{vorname}} {{event_title}} {{event_title}}'), [
        '{{event_title}}',
      ]);
      expect(htmlZuText(r'A\nB'), 'A\nB');
      expect(
        htmlZuText(
          '<html><head><style>p{}</style></head><body><p>Hallo</p><p>a&nbsp;&amp; b</p></body></html>',
        ),
        'Hallo\na & b',
      );
    });
  });

  group('VersandDienst', () {
    late Dispatch d;
    setUp(() => d = Dispatch());

    test('E-Mails in Paketen zu 5, Layout im Backend; Briefe einzeln mit Brief-HTML', () async {
      d.members = [
        for (var i = 0; i < 7; i++) mitgliedJson('e$i', 'E$i', 'Mail'),
        mitgliedJson('p1', 'Paul', 'Post', zEmail: false, zPost: true),
      ];
      final plan = versandPlanen(mitglieder(d.members), Versandart.auto);
      final schritte = <(int, int)>[];
      final r = await d.backend.dienste.versand.senden(
        plan,
        betreff: 'GV {{vorname}}',
        text: 'Hallo {{vorname}}',
        staging: true,
        fortschritt: (f, g) => schritte.add((f, g)),
      );
      final mails = d.posts('/email/bulk');
      expect(mails.map((m) => (m['member_ids'] as List).length), [5, 2]);
      expect(mails.first['layout'], 'standard');
      expect(mails.first['subject'], 'GV {{vorname}}');
      expect(mails.first['body'], 'Hallo {{vorname}}');
      expect(mails.first.containsKey('praeferenz_ignorieren'), isFalse);

      expect(d.posts('/dispatch/brief').single, {
        'member_id': 'p1',
        'subject': 'GV {{vorname}}',
        'body': 'Hallo {{vorname}}',
      });
      final post = d.posts('/dispatch/send-post').single;
      expect(post['html'], '<html>p1</html>');
      expect(post['member_id'], 'p1');
      expect(post['staging'], true);
      expect(post['pdf_margin'], {'top': '15mm', 'right': '0', 'bottom': '20mm', 'left': '0'});
      expect(post['recipient'], {'name': 'Name p1', 'country': 'CH'});

      expect(r.emails, 7);
      expect(r.briefe, 1);
      expect(r.fehler, isEmpty);
      expect(schritte.last, (8, 8));
    });

    test('Versandart E-Mail ignoriert den Zustellwunsch ausdruecklich', () async {
      final plan = versandPlanen(mitglieder().take(2).toList(), Versandart.email);
      await d.backend.dienste.versand.senden(plan, betreff: 'a', text: 'b', staging: false);
      expect(d.posts('/email/bulk').single['praeferenz_ignorieren'], true);
      expect(d.posts('/dispatch/send-post'), isEmpty);
    });

    test('Einladung: der Anlass geht mit E-Mail und Brief mit (sein PDF)', () async {
      final plan = versandPlanen(mitglieder(), Versandart.auto);
      await d.backend.dienste.versand.senden(
        plan,
        betreff: 'a',
        text: 'b',
        staging: false,
        anlassId: 'e1',
      );
      expect(d.posts('/email/bulk').map((m) => m['event_id']).toSet(), {'e1'});
      expect(d.posts('/dispatch/send-post').map((m) => m['event_id']).toSet(), {'e1'});
      expect(d.posts('/email/bulk').map((m) => m['layout']).toSet(), {'einladung'});
      expect(d.posts('/dispatch/brief').map((m) => (m['vorlage'], m['event_id'])).toSet(), {
        ('einladung', 'e1'),
      });
    });

    test('Ohne Anlass kein event_id', () async {
      final plan = versandPlanen(mitglieder(), Versandart.auto);
      await d.backend.dienste.versand.senden(plan, betreff: 'a', text: 'b', staging: false);
      expect(d.posts('/email/bulk').any((m) => m.containsKey('event_id')), isFalse);
      expect(d.posts('/email/bulk').map((m) => m['layout']).toSet(), {'standard'});
      expect(d.posts('/dispatch/brief').any((m) => m.containsKey('vorlage')), isFalse);
      expect(d.posts('/dispatch/send-post').any((m) => m.containsKey('event_id')), isFalse);
    });

    test('Ein Brief scheitert: steht im Ergebnis, die anderen gehen raus', () async {
      d.briefFehler.add('m2');
      final plan = versandPlanen(mitglieder(), Versandart.post);
      final r = await d.backend.dienste.versand.senden(
        plan,
        betreff: 'a',
        text: 'b',
        staging: false,
      );
      expect(r.briefe, plan.post.length - 1);
      expect(r.fehler.single.name, 'Beat Brief (Brief)');
      expect(r.fehler.single.grund, 'Pingen: invalid address');
      expect(r.abgebrochen, isFalse);
    });

    test('Keine Verbindung: Abbruch, Rest geht nicht raus', () async {
      d.backend.antwort = (a) => throw http.ClientException('weg');
      final plan = versandPlanen(mitglieder(), Versandart.post);
      final r = await d.backend.dienste.versand.senden(
        plan,
        betreff: 'a',
        text: 'b',
        staging: false,
      );
      expect(r.abgebrochen, isTrue);
      expect(d.backend.anfragen, hasLength(1));
    });

    test('Vorschau: PDF aus pdf_base64, mit Zonen', () async {
      final pdf = await d.backend.dienste.versand.briefVorschau(
        mitgliedId: 'm2',
        betreff: 'x',
        text: 'y',
      );
      expect(utf8.decode(pdf), '%PDF-1.4');
      expect(d.posts('/dispatch/brief').single['zonen'], true);
    });

    test('PDF an Auswahl: Pakete mit member_ids, nie leer', () async {
      final v = d.backend.dienste.versand;
      final leer = await v.pdfAnAuswahl(
        pdf: Uint8List(3),
        betreff: 'x',
        mitglieder: const [],
        staging: false,
      );
      expect(leer.briefe, 0);
      expect(d.backend.anfragen, isEmpty);

      final alle = [
        for (var i = 0; i < 6; i++) VorstandMitglied.ausJson(mitgliedJson('p$i', 'P$i', 'X')),
      ];
      final r = await v.pdfAnAuswahl(
        pdf: Uint8List.fromList([1, 2, 3]),
        betreff: 'Jahresprogramm',
        mitglieder: alle,
        staging: true,
      );
      final posts = d.posts('/pingen/send-bulk-pdf');
      expect(posts.map((p) => (p['member_ids'] as List).length), [5, 1]);
      expect(posts.first['pdf_base64'], base64Encode([1, 2, 3]));
      expect(posts.first['staging'], true);
      expect(posts.first['subject'], 'Jahresprogramm');
      expect(r.briefe, 6);
    });

    test('Verlauf, Konto, Statistik, Status mit der Pingen-ID', () async {
      final v = d.backend.dienste.versand;
      final log = await v.verlauf(typ: 'pingen');
      expect(d.backend.anfragen.last.url.queryParameters, {'type': 'pingen', 'limit': '100'});
      final brief = log.single;
      expect(brief.empfaenger, 'Beat Brief');
      expect(brief.empfaengerAdresse, 'Hauptstrasse 5, 4303 Kaiseraugst');
      expect(brief.staging, isTrue);
      // Protokollzeit ist UTC.
      expect(brief.erstellt, DateTime.utc(2026, 10, 13, 8, 1).toLocal());

      expect((await v.pingenKonto(staging: true)).guthaben, 100);
      final s = await v.pingenStatistik();
      expect((s.total, s.gesendet, s.tage30), (12, 10, 5));
      expect(await v.briefStatus('P-2', staging: true), 'sent');
      expect(d.backend.anfragen.last.url.queryParameters, {'staging': 'true'});
    });
  });

  group('Oberflaeche', () {
    late Dispatch d;
    setUp(() => d = Dispatch());

    Future<void> oeffnen(WidgetTester tester, {Size groesse = handy, NachrichtTeil? start}) =>
        zeigen(
          tester,
          NachrichtAnsicht(dienste: d.backend.dienste, start: start ?? NachrichtTeil.verfassen),
          groesse: groesse,
        );

    String zahlen(WidgetTester tester) => [
      for (final t in tester.widgetList<Text>(
        find.descendant(of: find.byKey(const Key('versand-zahlen')), matching: find.byType(Text)),
      ))
        t.data,
    ].join(' | ');

    testWidgets('Handy: alle vier Teile ohne Ueberlauf', (tester) async {
      d.backend.pdf = (bytes: Uint8List(1), dateiname: 'a.pdf');
      await oeffnen(tester);
      for (final teil in ['Verlauf', 'Pingen', 'App-Push', 'Verfassen']) {
        await tester.tap(
          find.descendant(of: find.byKey(const Key('nachricht-teil')), matching: find.text(teil)),
        );
        await tester.pumpAndSettle();
        expect(tester.takeException(), isNull, reason: teil);
      }
      // Pingen und Verlauf erst beim Oeffnen geladen, je einmal.
      expect(d.backend.anfragen.where((a) => a.url.path == '/pingen/account'), hasLength(1));
    });

    testWidgets('Verfassen: Zahlen folgen Empfaengern und Versandart; Rueckfrage, Senden', (
      tester,
    ) async {
      await oeffnen(tester);
      expect(
        zahlen(tester),
        '4 gewählt | 2 per E-Mail | 2 Briefe · ca. CHF 2.00 | 1 nicht erreichbar',
      );

      await tippen(tester, find.byKey(const Key('empfaenger-status')));
      await tippen(tester, find.byKey(const Key('empfaenger-status-wahl')));
      await tippen(tester, find.text('Ehrenmitglied (1)').last);
      expect(zahlen(tester), '1 gewählt | 1 per E-Mail | 1 Brief · ca. CHF 1.00');

      await tippen(tester, find.byKey(const Key('empfaenger-alle')));
      await tippen(
        tester,
        find.descendant(of: find.byKey(const Key('versand-art')), matching: find.text('E-Mail')),
      );
      expect(zahlen(tester), '4 gewählt | 3 per E-Mail | 1 nicht erreichbar');
      expect(find.byKey(const Key('versand-staging')), findsNothing);

      final senden = find.byKey(const Key('versand-senden'));
      expect(tester.widget<FilledButton>(senden).onPressed, isNull);
      await tester.enterText(find.byKey(const Key('versand-betreff')), 'GV 2027');
      await tester.enterText(find.byKey(const Key('versand-text')), 'Liebe {{vorname}}');
      await tester.pumpAndSettle();
      // Vorschau mit dem ersten E-Mail-Empfaenger.
      expect(
        find.descendant(
          of: find.byKey(const Key('versand-vorschau')),
          matching: find.text('Liebe Anna'),
        ),
        findsOneWidget,
      );

      await tippen(tester, senden);
      expect(find.textContaining('• 3 E-Mails'), findsOneWidget);
      await tippen(tester, imDialog('Abbrechen'));
      expect(d.backend.aenderungen, isEmpty);

      await tippen(tester, senden);
      await tippen(tester, imDialog('Senden'));
      expect(d.posts('/email/bulk').single['member_ids'], ['m1', 'm2', 'm3']);
      expect(find.text('3 E-Mails gesendet'), findsOneWidget);
      // Formular leer - kein zweites Senden.
      expect(tester.widget<FilledButton>(senden).onPressed, isNull);
    });

    testWidgets('Auto mit Briefen: Rueckfrage nennt Kosten, Staging schaltet sie ab', (
      tester,
    ) async {
      await oeffnen(tester);
      await tester.enterText(find.byKey(const Key('versand-betreff')), 'GV');
      await tester.enterText(find.byKey(const Key('versand-text')), 'Text');
      await tester.pumpAndSettle();

      await tippen(tester, find.byKey(const Key('versand-senden')));
      expect(
        find.descendant(
          of: find.byType(AlertDialog),
          matching: find.textContaining('ca. CHF 2.00'),
        ),
        findsOneWidget,
      );
      expect(imDialog('Senden und Briefe bezahlen'), findsOneWidget);
      await tippen(tester, imDialog('Abbrechen'));

      await tippen(tester, find.byKey(const Key('versand-staging')));
      await tippen(tester, find.byKey(const Key('versand-senden')));
      expect(
        find.descendant(
          of: find.byType(AlertDialog),
          matching: find.textContaining('Staging (Test'),
        ),
        findsOneWidget,
      );
      await tippen(tester, imDialog('Senden'));
      final briefe = d.posts('/dispatch/send-post');
      expect(briefe.map((b) => b['member_id']), ['m2', 'm3']);
      expect(briefe.every((b) => b['staging'] == true), isTrue);
      expect(find.text('2 Briefe an Pingen (Staging, Test)'), findsOneWidget);
    });

    testWidgets('Einzelauswahl mit Suche und Kaestchen', (tester) async {
      await oeffnen(tester);
      await tippen(tester, find.byKey(const Key('empfaenger-einzeln')));
      expect(zahlen(tester), startsWith('0 gewählt'));
      await tippen(tester, find.byKey(const Key('empfaenger-auswaehlen')));
      await tester.enterText(find.byKey(const Key('auswahl-suche')), 'alt');
      await tester.pumpAndSettle();
      expect(find.byKey(const Key('auswahl-m1')), findsNothing);
      await tippen(tester, find.byKey(const Key('auswahl-m5')));
      await tester.enterText(find.byKey(const Key('auswahl-suche')), '');
      await tester.pumpAndSettle();
      await tippen(tester, find.byKey(const Key('auswahl-m2')));
      await tippen(tester, find.byKey(const Key('auswahl-fertig')));
      // Emil (ausgetreten, E-Mail) und Beat (Post).
      expect(zahlen(tester), '2 gewählt | 1 per E-Mail | 1 Brief · ca. CHF 1.00');
    });

    testWidgets('Vorlage fuellt Betreff und Text; unbekannte Platzhalter warnen', (tester) async {
      await oeffnen(tester);
      await tippen(tester, find.byKey(const Key('versand-vorlage')));
      await tippen(tester, find.text('Event Einladung (email)').last);
      expect(
        tester.widget<TextField>(find.byKey(const Key('versand-text'))).controller!.text,
        'Liebe/r {{anrede}} {{nachname}}\n\nWir laden ein.',
      );
      expect(find.byKey(const Key('versand-unbekannt')), findsOneWidget);
    });

    testWidgets('Brief-Vorschau geht als PDF ins Teilen-Menue', (tester) async {
      await oeffnen(tester);
      await tester.enterText(find.byKey(const Key('versand-text')), 'Hallo');
      await tester.pumpAndSettle();
      await tippen(tester, find.byKey(const Key('versand-brief-vorschau')));
      expect(d.backend.geteilt, [('Vorschau_Beat_Brief.pdf', 8)]);
      expect(d.posts('/dispatch/brief').single['member_id'], 'm2');
    });

    testWidgets('Desktop: Einstellungen und Inhalt nebeneinander', (tester) async {
      await oeffnen(tester, groesse: desktop);
      final art = tester.getTopLeft(find.byKey(const Key('versand-art')));
      final text = tester.getTopLeft(find.byKey(const Key('versand-betreff')));
      expect(text.dx, greaterThan(art.dx + 300));
      expect(tester.takeException(), isNull);
    });

    testWidgets('Verlauf: Filter nach Typ, Einzelheiten', (tester) async {
      await oeffnen(tester, start: NachrichtTeil.verlauf);
      expect(find.text('Einladung GV'), findsOneWidget);
      expect(find.text('[Staging] Einladung GV'), findsOneWidget);
      await tippen(tester, find.byKey(const Key('verlauf-typ-email')));
      expect(d.backend.anfragen.last.url.queryParameters['type'], 'email');
      expect(find.text('[Staging] Einladung GV'), findsNothing);
      await tippen(tester, find.text('Einladung GV'));
      expect(find.text('Liebe Anna\n\nWir laden ein.'), findsOneWidget);
    });

    testWidgets('Pingen: Guthaben live/staging, Status pruefen, PDF senden', (tester) async {
      d.backend.pdf = (bytes: Uint8List.fromList([1, 2]), dateiname: 'Programm.pdf');
      await oeffnen(tester, start: NachrichtTeil.pingen, groesse: desktop);
      expect(find.text('CHF 42.50'), findsOneWidget);
      expect(find.text('In Prüfung'), findsOneWidget);

      await tippen(tester, find.byKey(const Key('pingen-status-l2')));
      expect(d.backend.anfragen.last.url.path, '/pingen/letters/P-2/status');
      expect(d.backend.anfragen.last.url.queryParameters['staging'], 'true');
      expect(
        find.descendant(
          of: find.byKey(const Key('pingen-briefe')),
          matching: find.text('Versendet'),
        ),
        findsOneWidget,
      );

      await tippen(tester, find.byKey(const Key('pingen-pdf-waehlen')));
      await tippen(tester, find.byKey(const Key('pingen-empfaenger')));
      await tippen(tester, find.text('Alle mit Post-Zustellung'));
      await tippen(tester, find.byKey(const Key('auswahl-fertig')));
      expect(find.text('2 Briefe · ca. CHF 2.00'), findsOneWidget);

      await tippen(tester, find.byKey(const Key('pingen-senden')));
      expect(find.textContaining('ca. CHF 2.00'), findsWidgets);
      await tippen(tester, imDialog('Abbrechen'));
      expect(d.posts('/pingen/send-bulk-pdf'), isEmpty);

      await tippen(tester, find.text('Staging'));
      expect(find.text('CHF 100.00'), findsOneWidget);
      await tippen(tester, find.byKey(const Key('pingen-senden')));
      await tippen(tester, imDialog('Senden (Test)'));
      final p = d.posts('/pingen/send-bulk-pdf').single;
      expect(p['member_ids'], ['m2', 'm3']);
      expect(p['staging'], true);
      expect(p['subject'], 'Programm');
      expect(find.text('2 Briefe an Pingen (Staging, Test)'), findsOneWidget);
    });
  });

  test('ApiFehler ohne Status gilt als keine Verbindung', () {
    expect(const ApiFehler.keineVerbindung().status, isNull);
  });
}
