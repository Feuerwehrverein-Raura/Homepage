// E-Mail-Verwaltung: Postfaecher, Aliase, Speicher, Zustellliste gegen ein
// nachgebautes api-dispatch/api-members. Antworten wie Mailcow sie liefert
// (Groessen in Bytes, active als 1/0) bzw. wie /members/emails/zustellung.
// Geprueft wird vor allem, was rausgeht (MB beim Schreiben, nur geaenderte
// Felder) und dass Loeschen erst nach der Rueckfrage passiert.

import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:fwv_core/fwv_core.dart';
import 'package:fwv_vorstand/fwv_vorstand.dart';
import 'package:material_ui/material_ui.dart';

import 'hilfe.dart';

const _mb = 1024 * 1024;

final _postfaecher = [
  {
    'username': 'kassier@fwv-raura.ch',
    'local_part': 'kassier',
    'domain': 'fwv-raura.ch',
    'name': 'Kassier',
    'quota': 1024 * _mb,
    'quota_used': 950 * _mb,
    'active': 1,
    'messages': 1234,
  },
  {
    'username': 'aktuar@fwv-raura.ch',
    'local_part': 'aktuar',
    'domain': 'fwv-raura.ch',
    'name': 'Aktuar',
    'quota': 2048 * _mb,
    'quota_used': 100 * _mb,
    'active': '0',
  },
];

final _aliase = [
  {'id': 7, 'address': 'info@fwv-raura.ch', 'goto': 'aktuar@fwv-raura.ch', 'active': 1},
  {
    'id': 9,
    'address': 'mitglieder@fwv-raura.ch',
    'goto': 'a@example.ch,b@example.ch,c@example.ch,d@example.ch',
    'active': 1,
  },
];

void main() {
  group('Modell', () {
    test('Postfach: Bytes lesen, MB fuers Bearbeiten, Anteil', () {
      final p = Postfach.ausJson(_postfaecher.first);
      expect(p.adresse, 'kassier@fwv-raura.ch');
      expect(p.quotaMb, 1024);
      expect(p.anteil, closeTo(0.93, 0.01));
      expect(p.aktiv, isTrue);
      expect(Postfach.ausJson(_postfaecher[1]).aktiv, isFalse);
      expect(groesseText(950 * _mb), '950 MB');
      expect(groesseText(2048 * _mb), '2.0 GB');
    });

    test('Ziele aus Text: Komma, Zeilen, Leerzeichen', () {
      expect(zieleAusText('a@x.ch, b@y.ch\n c@z.ch;;'), ['a@x.ch', 'b@y.ch', 'c@z.ch']);
    });

    test('Mailcow-Fehler werden Saetze', () {
      const f = ApiFehler(
        'x',
        status: 500,
        daten: {
          'error': [
            {
              'type': 'danger',
              'msg': ['object_exists', 'kassier@fwv-raura.ch'],
            },
          ],
        },
      );
      expect(mailcowFehlerText(f), 'Diese Adresse gibt es schon.');
      expect(
        mailcowFehlerText(const ApiFehler('x', daten: {'error': 'unbekannt_x'})),
        'Mailcow meldet: unbekannt_x',
      );
      expect(mailcowFehlerText(const ApiFehler('Netz weg')), 'Netz weg');
    });
  });

  group('Ansicht', () {
    late FalschesBackend backend;

    setUp(() {
      backend = FalschesBackend((a) {
        final weg = '${a.method} ${a.url.path}';
        return switch (weg) {
          'GET /mailcow/mailboxes' => _postfaecher,
          'GET /mailcow/aliases' => _aliase,
          'GET /mailcow/quota' => [
            {
              'email': 'kassier@fwv-raura.ch',
              'name': 'Kassier',
              'quota': 1024 * _mb,
              'quota_used': 950 * _mb,
              'percent_used': 93,
            },
            {
              'email': 'aktuar@fwv-raura.ch',
              'name': 'Aktuar',
              'quota': 2048 * _mb,
              'quota_used': 100 * _mb,
              'percent_used': 5,
            },
          ],
          'GET /members/emails/zustellung' => {
            'count': 2,
            'emails': ['erika@example.ch', 'hans@example.ch'],
            'formatted': 'erika@example.ch, hans@example.ch',
            'members': [
              {
                'id': 'm1',
                'vorname': 'Erika',
                'nachname': 'Muster',
                'email': 'erika@example.ch',
                'status': 'Aktivmitglied',
              },
              {
                'id': 'm2',
                'vorname': 'Hans',
                'nachname': 'Helfer',
                'email': 'hans@example.ch',
                'status': 'Passivmitglied',
              },
            ],
          },
          'POST /members/emails/sync-alias' => {
            'success': true,
            'action': 'updated',
            'alias': 'mitglieder@fwv-raura.ch',
            'recipients': 2,
          },
          _ when a.method != 'GET' => [
            {'type': 'success', 'msg': 'ok'},
          ],
          _ => (404, {'error': 'nicht gefunden: $weg'}),
        };
      });
    });

    Future<void> oeffnen(WidgetTester tester, {Size groesse = handy}) =>
        zeigen(tester, EmailAnsicht(dienste: backend.dienste), groesse: groesse);

    testWidgets('Postfaecher mit Speicher, inaktiv markiert', (tester) async {
      await oeffnen(tester);
      expect(find.text('2 Postfächer @fwv-raura.ch'), findsOneWidget);
      // Sortiert nach Adresse.
      final aktuar = tester.getTopLeft(find.text('aktuar@fwv-raura.ch'));
      final kassier = tester.getTopLeft(find.text('kassier@fwv-raura.ch'));
      expect(aktuar.dy, lessThan(kassier.dy));
      expect(find.text('950 MB von 1.0 GB belegt · 1234 Mails'), findsOneWidget);
      expect(find.text('inaktiv'), findsOneWidget);
      expect(tester.takeException(), isNull);
    });

    testWidgets('Postfach anlegen: Quota in MB, Passwort Pflicht', (tester) async {
      await oeffnen(tester);
      await tippen(tester, find.byKey(const Key('postfach-neu')));
      await tippen(tester, find.byKey(const Key('postfach-speichern')));
      expect(find.text('Bitte eine Adresse angeben.'), findsOneWidget);
      expect(find.text('Bitte ein Passwort.'), findsOneWidget);
      expect(backend.aenderungen, isEmpty);

      await tester.enterText(find.byKey(const Key('postfach-lokal')), 'Social');
      await tester.enterText(find.byKey(const Key('postfach-name')), 'Social Media');
      await tester.enterText(find.byKey(const Key('postfach-passwort')), 'Geheim123');
      await tester.enterText(find.byKey(const Key('postfach-quota')), '512');
      await tippen(tester, find.byKey(const Key('postfach-speichern')));
      expect(backend.aenderungen, ['POST /mailcow/mailboxes']);
      expect(backend.body('POST /mailcow/mailboxes'), {
        'local_part': 'social',
        'name': 'Social Media',
        'password': 'Geheim123',
        'quota': 512,
        'active': 1,
      });
      expect(find.text('Postfach angelegt'), findsOneWidget);
    });

    testWidgets('Postfach bearbeiten: nur Geaendertes, leeres Passwort bleibt', (tester) async {
      await oeffnen(tester);
      await tippen(tester, find.text('kassier@fwv-raura.ch'));
      await tippen(tester, find.text('Bearbeiten'));
      // Unveraendert speichern: nichts geht raus.
      await tippen(tester, find.byKey(const Key('postfach-speichern')));
      expect(backend.aenderungen, isEmpty);

      await tippen(tester, find.text('kassier@fwv-raura.ch'));
      await tippen(tester, find.text('Bearbeiten'));
      expect(find.byKey(const Key('postfach-lokal')), findsNothing);
      await tester.enterText(find.byKey(const Key('postfach-quota')), '2048');
      await tippen(tester, find.byKey(const Key('postfach-aktiv')));
      await tippen(tester, find.byKey(const Key('postfach-speichern')));
      // @ kodiert; Express dekodiert req.params.
      expect(backend.aenderungen, ['PUT /mailcow/mailboxes/kassier%40fwv-raura.ch']);
      expect(backend.body('PUT /mailcow/mailboxes/kassier%40fwv-raura.ch'), {
        'quota': 2048,
        'active': 0,
      });
    });

    testWidgets('Mailcow-Fehler bleibt im Dialog stehen', (tester) async {
      await oeffnen(tester);
      backend.antwort = (a) => a.method == 'POST'
          ? (
              500,
              {
                'error': [
                  {
                    'type': 'danger',
                    'msg': ['object_exists'],
                  },
                ],
              },
            )
          : _postfaecher;
      await tippen(tester, find.byKey(const Key('postfach-neu')));
      await tester.enterText(find.byKey(const Key('postfach-lokal')), 'kassier');
      await tester.enterText(find.byKey(const Key('postfach-name')), 'Kassier');
      await tester.enterText(find.byKey(const Key('postfach-passwort')), 'Geheim123');
      await tippen(tester, find.byKey(const Key('postfach-speichern')));
      expect(find.text('Diese Adresse gibt es schon.'), findsOneWidget);
      expect(find.byType(AlertDialog), findsOneWidget);
    });

    testWidgets('Postfach loeschen erst nach Eintippen der Adresse', (tester) async {
      await oeffnen(tester);
      await tippen(tester, find.text('aktuar@fwv-raura.ch'));
      await tippen(tester, find.text('Löschen'));
      expect(find.textContaining('ALLEN E-Mails'), findsOneWidget);
      final ja = find.byKey(const Key('bestaetigen-ja'));
      expect(tester.widget<FilledButton>(ja).onPressed, isNull);
      await tester.enterText(find.byKey(const Key('bestaetigen-eingabe')), 'kassier');
      await tester.pump();
      expect(tester.widget<FilledButton>(ja).onPressed, isNull);
      await tester.enterText(find.byKey(const Key('bestaetigen-eingabe')), 'aktuar');
      await tester.pump();
      await tippen(tester, ja);
      expect(backend.aenderungen, ['DELETE /mailcow/mailboxes/aktuar%40fwv-raura.ch']);
    });

    testWidgets('Aliase: anlegen mit mehreren Zielen, bearbeiten, loeschen', (tester) async {
      await oeffnen(tester);
      await tippen(tester, find.byKey(const Key('email-teil-aliase')));
      expect(find.text('2 Aliase'), findsOneWidget);
      expect(find.text('a@example.ch, b@example.ch und 2 weitere'), findsOneWidget);

      await tippen(tester, find.byKey(const Key('alias-neu')));
      await tester.enterText(find.byKey(const Key('alias-adresse')), 'Lager');
      await tester.enterText(find.byKey(const Key('alias-ziele')), 'x@example.ch\nkaputt');
      await tippen(tester, find.byKey(const Key('alias-speichern')));
      expect(find.text('Ungültig: kaputt'), findsOneWidget);
      await tester.enterText(find.byKey(const Key('alias-ziele')), 'x@example.ch\ny@example.ch');
      await tippen(tester, find.byKey(const Key('alias-speichern')));
      expect(backend.body('POST /mailcow/aliases'), {
        'address': 'lager',
        'goto': 'x@example.ch,y@example.ch',
        'active': 1,
      });

      await tippen(tester, find.text('info@fwv-raura.ch'));
      await tippen(tester, find.text('Bearbeiten'));
      await tippen(tester, find.byKey(const Key('alias-aktiv')));
      await tippen(tester, find.byKey(const Key('alias-speichern')));
      expect(backend.body('PUT /mailcow/aliases/7'), {'active': 0});

      // mitglieder@: Hinweis auf den Abgleich.
      await tippen(tester, find.text('mitglieder@fwv-raura.ch'));
      await tippen(tester, find.text('Bearbeiten'));
      expect(find.textContaining('beim Abgleich in der Zustellliste'), findsOneWidget);
      await tippen(tester, imDialog('Abbrechen'));

      await tippen(tester, find.text('info@fwv-raura.ch'));
      await tippen(tester, find.text('Löschen'));
      await tippen(tester, imDialog('Abbrechen'));
      expect(backend.aenderungen.where((w) => w.startsWith('DELETE')), isEmpty);
      await tippen(tester, find.text('info@fwv-raura.ch'));
      await tippen(tester, find.text('Löschen'));
      await tippen(tester, imDialog('Löschen'));
      expect(backend.aenderungen.last, 'DELETE /mailcow/aliases/7');
    });

    testWidgets('Speicher: Summe, vollste zuerst (Desktop zweispaltig)', (tester) async {
      await oeffnen(tester, groesse: desktop);
      await tippen(tester, find.byKey(const Key('email-teil-speicher')));
      expect(find.text('1.0 GB von 3.0 GB belegt · 2 Postfächer · 1 fast voll'), findsOneWidget);
      expect(find.text('950 MB / 1.0 GB (93 %)'), findsOneWidget);
      final k = tester.getTopLeft(find.byKey(const Key('speicher-kassier@fwv-raura.ch')));
      final a = tester.getTopLeft(find.byKey(const Key('speicher-aktuar@fwv-raura.ch')));
      expect(a.dy, k.dy);
      expect(a.dx, greaterThan(k.dx));
      expect(tester.takeException(), isNull);
    });

    testWidgets('Zustellliste: kopieren, Alias abgleichen nach Rueckfrage', (tester) async {
      String? kopiert;
      tester.binding.defaultBinaryMessenger.setMockMethodCallHandler(SystemChannels.platform, (
        c,
      ) async {
        if (c.method == 'Clipboard.setData') kopiert = (c.arguments as Map)['text'] as String;
        return null;
      });
      addTearDown(
        () => tester.binding.defaultBinaryMessenger.setMockMethodCallHandler(
          SystemChannels.platform,
          null,
        ),
      );
      await oeffnen(tester);
      await tippen(tester, find.byKey(const Key('email-teil-zustellliste')));
      expect(find.text('2 Adressen mit E-Mail-Zustellung'), findsOneWidget);
      expect(find.text('Erika Muster'), findsOneWidget);

      await tippen(tester, find.byKey(const Key('zustellung-kopieren')));
      expect(kopiert, 'erika@example.ch, hans@example.ch');

      await tippen(tester, find.byKey(const Key('zustellung-abgleichen')));
      expect(find.textContaining('genau die 2 Adressen'), findsOneWidget);
      await tippen(tester, imDialog('Abbrechen'));
      expect(backend.aenderungen, isEmpty);
      await tippen(tester, find.byKey(const Key('zustellung-abgleichen')));
      await tippen(tester, imDialog('Abgleichen'));
      expect(backend.aenderungen, ['POST /members/emails/sync-alias']);
      expect(find.text('mitglieder@fwv-raura.ch aktualisiert: 2 Empfänger.'), findsWidgets);
    });
  });
}
