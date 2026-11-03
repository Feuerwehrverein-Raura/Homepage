// Posteingang (api-dispatch /imap, /contacts): Antwort-Entwurf, Adressen,
// Liste, Lesen mit Anhang, Antworten mit Kette, Loeschen, ohne Postfach.

import 'dart:convert';

import 'package:flutter_test/flutter_test.dart';
import 'package:fwv_vorstand/fwv_vorstand.dart';
import 'package:http/http.dart' as http;
import 'package:material_ui/material_ui.dart';

import 'hilfe.dart';

const _mail = Mail(
  uid: 7,
  betreff: 'Re: Chilbi Helfer',
  von: 'Anna Muster <anna@example.ch>',
  an: 'aktuar@fwv-raura.ch, "Beat, Brief" <beat@example.ch>',
  cc: 'kassier@fwv-raura.ch',
  text: 'Ich komme.\nGruss Anna',
  messageId: '<m7@example.ch>',
  referenzen: '<m6@fwv-raura.ch>',
);

class Postfach {
  Postfach({this.konten = const ['aktuar@fwv-raura.ch']}) {
    backend = FalschesBackend(antwort);
  }

  final List<String> konten;
  late final FalschesBackend backend;
  var mails = [
    {
      'uid': 7,
      'subject': 'Re: Chilbi Helfer',
      'from': 'Anna Muster <anna@example.ch>',
      'date': '2026-11-02T08:15:00.000Z',
      'seen': false,
    },
    {
      'uid': 5,
      'subject': 'Rechnung',
      'from': 'lieferant@example.ch',
      'date': '2026-10-01T10:00:00.000Z',
      'seen': true,
    },
  ];

  Object? antwort(http.Request a) {
    final weg = '${a.method} ${a.url.path}';
    switch (weg) {
      case 'GET /imap/accounts':
        return {
          'accounts': konten,
          'missing': konten.isEmpty ? ['kassier@fwv-raura.ch'] : [],
        };
      case 'GET /imap/folders':
        return [
          {'path': 'INBOX', 'name': 'INBOX', 'unseen': 1},
          {'path': 'Sent', 'name': 'Sent', 'specialUse': r'\Sent', 'unseen': 0},
          {'path': 'Trash', 'name': 'Trash', 'specialUse': r'\Trash', 'unseen': 0},
        ];
      case 'GET /imap/messages':
        return {'messages': mails, 'total': mails.length, 'unseen': 1};
      case 'GET /imap/search':
        return {
          'messages': [
            for (final m in mails)
              if ('${m['subject']}'.contains(a.url.queryParameters['q']!)) m,
          ],
        };
      case 'GET /imap/messages/7':
        return {
          'uid': 7,
          'subject': 'Re: Chilbi Helfer',
          'from': 'Anna Muster <anna@example.ch>',
          'to': 'aktuar@fwv-raura.ch',
          'date': '2026-11-02T08:15:00.000Z',
          'text': 'Ich komme.\nGruss Anna',
          'messageId': '<m7@example.ch>',
          'attachments': [
            {'index': 0, 'filename': 'Plan.pdf', 'contentType': 'application/pdf', 'size': 2048},
          ],
        };
      case 'GET /imap/messages/7/attachments/0':
        return 'PDF';
      case 'POST /imap/send':
        return {'success': true};
      case 'DELETE /imap/messages/7':
        mails = [...mails.where((m) => m['uid'] != 7)];
        return {'success': true};
      case 'GET /contacts':
        return {
          'shared': [
            {'name': 'Gemeinde Kaiseraugst', 'email': 'gemeinde@example.ch', 'source': 'shared'},
          ],
          'members': <Object>[],
          'discovered': <Object>[],
        };
    }
    return (404, {'error': 'nicht gefunden: $weg'});
  }

  List<Map<String, dynamic>> gesendet() => [
    for (final a in backend.anfragen)
      if (a.method == 'POST' && a.url.path == '/imap/send')
        jsonDecode(a.body) as Map<String, dynamic>,
  ];
}

void main() {
  group('Antwort-Entwurf', () {
    test('Antworten: an den Absender, AW ohne doppeltes Praefix, Zitat, Kette', () {
      final e = antwortEntwurf(_mail, ich: 'aktuar@fwv-raura.ch');
      expect(e.an, 'Anna Muster <anna@example.ch>');
      expect(e.cc, '');
      expect(e.betreff, 'AW: Chilbi Helfer');
      expect(e.text, contains('> Ich komme.\n> Gruss Anna'));
      expect(e.text, startsWith('\n\nAnna Muster <anna@example.ch> schrieb:\n'));
      expect(e.inReplyTo, '<m7@example.ch>');
      expect(e.references, '<m6@fwv-raura.ch> <m7@example.ch>');
    });

    test('Allen antworten: alle ausser mir in Cc', () {
      final e = antwortEntwurf(_mail, ich: 'aktuar@fwv-raura.ch', allen: true);
      expect(e.cc, '"Beat, Brief" <beat@example.ch>, kassier@fwv-raura.ch');
    });

    test('Weiterleiten: ohne Empfaenger und Kette, mit Kopf der Mail', () {
      final e = antwortEntwurf(_mail, ich: 'aktuar@fwv-raura.ch', weiter: true);
      expect(e.an, '');
      expect(e.betreff, 'WG: Chilbi Helfer');
      expect(e.text, contains('Von: Anna Muster <anna@example.ch>'));
      expect(e.inReplyTo, isNull);
    });

    test('Adressen trennen, Kommas in Anfuehrungszeichen bleiben', () {
      expect(adressenTeilen('a@x; "B, C" <b@y>, '), ['a@x', '"B, C" <b@y>']);
    });
  });

  group('Oberflaeche', () {
    testWidgets('Ohne Postfach: Hinweis', (tester) async {
      final p = Postfach(konten: const []);
      await zeigen(tester, PosteingangAnsicht(dienste: p.backend.dienste));
      expect(find.byKey(const Key('posteingang-keins')), findsOneWidget);
      expect(find.textContaining('kassier@fwv-raura.ch'), findsOneWidget);
    });

    testWidgets('Liste, lesen mit Anhang, antworten, loeschen', (tester) async {
      final p = Postfach();
      await zeigen(tester, PosteingangAnsicht(dienste: p.backend.dienste));
      expect(find.text('Anna Muster'), findsOneWidget);
      expect(find.text('Posteingang (1)'), findsOneWidget);

      // Suche
      await tester.enterText(find.byKey(const Key('posteingang-suche')), 'Rechnung');
      await tester.testTextInput.receiveAction(TextInputAction.search);
      await tester.pumpAndSettle();
      expect(find.text('Anna Muster'), findsNothing);
      expect(find.text('lieferant@example.ch'), findsOneWidget);
      await tippen(tester, find.byTooltip('Suche löschen'));

      // Lesen
      await tippen(tester, find.byKey(const Key('mail-7')));
      expect(find.text('Ich komme.\nGruss Anna'), findsOneWidget);
      await tippen(tester, find.byKey(const Key('mail-anhang-0')));
      expect(p.backend.geteilt.single.$1, 'Plan.pdf');

      // Antworten
      await tippen(tester, find.byKey(const Key('mail-antworten')));
      expect(find.text('AW: Chilbi Helfer'), findsOneWidget);
      await tippen(tester, find.byKey(const Key('mail-senden')));
      final s = p.gesendet().single;
      expect(s['account'], 'aktuar@fwv-raura.ch');
      expect(s['to'], 'Anna Muster <anna@example.ch>');
      expect(s['inReplyTo'], '<m7@example.ch>');
      expect(find.text('Gesendet.'), findsOneWidget);

      // Loeschen (in den Papierkorb, ohne Rueckfrage)
      await tippen(tester, find.byKey(const Key('mail-mehr')));
      await tippen(tester, find.text('Löschen'));
      final loeschen = p.backend.anfragen.lastWhere((a) => a.method == 'DELETE');
      expect(loeschen.url.queryParameters, {'account': 'aktuar@fwv-raura.ch', 'folder': 'INBOX'});
      expect(find.text('Anna Muster'), findsNothing, reason: 'Liste neu geladen');
    });

    testWidgets('Neue Mail: Adressbuch schlaegt vor', (tester) async {
      final p = Postfach();
      await zeigen(tester, PosteingangAnsicht(dienste: p.backend.dienste));
      await tippen(tester, find.byKey(const Key('posteingang-neu')));
      await tester.enterText(find.byKey(const Key('mail-an-feld')), 'Gemei');
      await tester.pumpAndSettle();
      await tippen(tester, find.text('Gemeinde Kaiseraugst'));
      await tester.enterText(find.byKey(const Key('mail-betreff')), 'Bewilligung');
      await tippen(tester, find.byKey(const Key('mail-senden')));
      expect(p.gesendet().single['to'], 'Gemeinde Kaiseraugst <gemeinde@example.ch>');
      expect(p.gesendet().single.containsKey('inReplyTo'), isFalse);
    });
  });
}
