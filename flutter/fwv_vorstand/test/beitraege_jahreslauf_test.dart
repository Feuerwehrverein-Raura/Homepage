// Beitraege Phase 2: Jahresbeitrag festlegen, Beitraege erzeugen, Briefe an
// alle, Erinnerungen, Versand planen und stornieren. Geprueft wird, was an
// api-accounting/api-dispatch geht - und dass die Rueckfrage die Zahl der
// Empfaenger nach den Regeln des Backends nennt, bevor etwas rausgeht.
// Nichts hier sendet echt: das Backend ist nachgebaut.

import 'package:flutter_test/flutter_test.dart';
import 'package:fwv_vorstand/fwv_vorstand.dart';
import 'package:http/http.dart' as http;
import 'package:material_ui/material_ui.dart';

import 'hilfe.dart';

final _heute = DateTime(2026, 10, 14);

Map<String, Object?> _zahlung(
  String id,
  String vorname,
  String nachname, {
  String status = 'offen',
  String? email,
  String ref = '',
  bool adresse = false,
  String mitgliedStatus = 'Aktivmitglied',
  String? erinnert,
}) => {
  'id': id,
  'member_id': 'm-$id',
  'year': 2026,
  'amount': '50.00',
  'reference_nr': ref,
  'status': status,
  'paid_date': status == 'bezahlt' ? '2026-03-15T00:00:00.000Z' : null,
  'last_reminder_at': erinnert,
  'vorname': vorname,
  'nachname': nachname,
  'email': email,
  'strasse': adresse ? 'Dorfstrasse 1' : null,
  'plz': adresse ? '4303' : null,
  'ort': adresse ? 'Kaiseraugst' : null,
  'member_status': mitgliedStatus,
};

final _zahlungen = [
  // E-Mail-Empfaengerin (vor 13 Tagen erinnert -> keine Erinnerung).
  _zahlung(
    'p1',
    'Erika',
    'Muster',
    email: 'erika@example.ch',
    ref: '05590',
    adresse: true,
    erinnert: '2026-10-01T00:00:00.000Z',
  ),
  _zahlung('p2', 'Hans', 'Bader', status: 'bezahlt', email: 'hans@example.ch', ref: '05601'),
  _zahlung('p3', 'Ruth', 'Zimmerli'),
  // Ehrenmitglied: nie.
  _zahlung(
    'p4',
    'Otto',
    'Alt',
    email: 'otto@example.ch',
    ref: '05611',
    mitgliedStatus: 'Ehrenmitglied',
  ),
  // Will E-Mail, hat aber keine Referenz.
  _zahlung('p5', 'Lea', 'Neu', email: 'lea@example.ch'),
  // Will Post.
  _zahlung('p6', 'Paul', 'Post', ref: '05622', adresse: true),
  // Mitglied fehlt in der Mitgliederliste: Zustellwunsch unbekannt.
  _zahlung('p7', 'Mia', 'Weg', email: 'mia@example.ch', ref: '05633'),
];

Map<String, Object?> _mitglied(String id, {bool email = true, bool post = false}) => {
  'id': id,
  'vorname': id,
  'nachname': id,
  'status': 'Aktivmitglied',
  'zustellung_email': email,
  'zustellung_post': post,
};

final _mitglieder = [
  _mitglied('m-p1'),
  _mitglied('m-p2'),
  _mitglied('m-p3'),
  _mitglied('m-p4'),
  _mitglied('m-p5'),
  _mitglied('m-p6', email: false, post: true),
];

final _job = {
  'id': 'j1',
  'action': 'membership_fees_email_bulk',
  'payload': {'year': 2026},
  'label': 'Beitrag E-Mail-Versand 2026',
  'scheduled_at': '2026-10-20T07:00:00.000Z',
  'status': 'scheduled',
  'result': null,
  'created_by': 'kassier@fwv-raura.ch',
};

final _jobErledigt = {
  'id': 'j0',
  'action': 'membership_fees_post_bulk',
  'payload': {'year': 2025},
  'label': 'Beitrag Brief-Versand 2025',
  'scheduled_at': '2025-04-01T07:00:00.000Z',
  'status': 'done',
  'result': {'success': 12, 'failed': 1, 'candidates': 13},
  'created_by': 'kassier@fwv-raura.ch',
};

List<Beitragszahlung> get _alle => [for (final j in _zahlungen) Beitragszahlung.ausJson(j)];

Map<String, Zustellwunsch> get _wuensche => {
  for (final m in _mitglieder)
    m['id']! as String: (
      email: m['zustellung_email']! as bool,
      post: m['zustellung_post']! as bool,
    ),
};

void main() {
  group('Regeln wie im Backend', () {
    List<String> ids(List<Beitragszahlung> l) => [for (final z in l) z.id];

    test('E-Mail: offen, will E-Mail, hat E-Mail und Referenz, kein Ehrenmitglied', () {
      final v = versandVorschau(_alle, BriefKanal.email, _wuensche);
      expect(ids(v.empfaenger), ['p1']);
      expect(ids(v.ohneReferenz), ['p5']);
      expect(ids(v.unbekannt), ['p7']);
      expect(v.hoechstens, 2);
    });

    test('Post: will Post, ganze Adresse', () {
      final v = versandVorschau(_alle, BriefKanal.post, _wuensche);
      expect(ids(v.empfaenger), ['p6']);
      expect(v.ohneReferenz, isEmpty);
    });

    test('Ohne Zustellwunsch: alle offenen mit Referenz sind unbekannt', () {
      final v = versandVorschau(_alle, BriefKanal.email, null);
      expect(v.empfaenger, isEmpty);
      expect(ids(v.unbekannt), ['p1', 'p7']);
    });

    test('Erinnerung: faellig, nicht bezahlt, 30 Tage Abstand', () {
      final e = BeitragsEinstellung(jahr: 2026, betrag: 50, faellig: DateTime(2026, 3, 31));
      expect(ids(erinnerungFaellig(_alle, e, _heute)), ['p3', 'p4', 'p5', 'p6', 'p7']);
      // Vor der Faelligkeit: niemand.
      expect(erinnerungFaellig(_alle, e, DateTime(2026, 3, 1)), isEmpty);
      expect(erinnerungFaellig(_alle, null, _heute), isEmpty);
    });
  });

  group('Ansicht', () {
    late FalschesBackend backend;
    late List<Map<String, Object?>> jobs;
    late bool mitgliederKaputt;

    setUp(() {
      jobs = [_jobErledigt, _job];
      mitgliederKaputt = false;
      backend = FalschesBackend((a) {
        final weg = '${a.method} ${a.url.path}';
        return switch (weg) {
          'GET /membership-fees/payments' => _zahlungen,
          'GET /membership-fees/summary' => {'total': '7', 'paid': '1', 'open': '6'},
          'GET /membership-fees/settings/2026' => {
            'year': 2026,
            'amount': '50.00',
            'gv_date': '14. März 2026',
            'due_date': '2026-03-31T00:00:00.000Z',
            'description': 'Beschreibung alt',
          },
          'GET /members' => mitgliederKaputt ? (500, {'error': 'kaputt'}) : _mitglieder,
          'POST /membership-fees/settings' => {
            'year': 2026,
            'amount': '60.00',
            'gv_date': 'GV 2026',
            'due_date': '2026-03-31',
          },
          'POST /membership-fees/payments/generate' => {'created': 6, 'skipped': 0, 'total': 6},
          'POST /membership-fees/send-email-bulk' || 'POST /membership-fees/send-post-bulk' => {
            'year': 2026,
            'candidates': 1,
            'success': 1,
            'failed': 0,
            'skipped': 6,
            'failures': <Object>[],
          },
          'POST /membership-fees/send-reminders' => {
            'success': true,
            'pushed': 5,
            'emailed': 3,
            'candidates': 5,
          },
          'GET /scheduled-jobs' => jobs,
          'POST /scheduled-jobs' => {..._job, 'id': 'j2'},
          'DELETE /scheduled-jobs/j1' => {..._job, 'status': 'cancelled'},
          _ => (404, {'error': 'nicht gefunden: $weg'}),
        };
      });
    });

    Future<void> oeffnen(WidgetTester tester, {Size groesse = handy}) => zeigen(
      tester,
      BeitraegeAnsicht(dienste: backend.dienste, heute: _heute),
      groesse: groesse,
    );

    Finder knopf(String id) => find.byKey(Key('jahreslauf-$id'));

    /// Knopf ganz in den Blick holen (die Liste ist lang) und antippen.
    Future<void> druecken(WidgetTester tester, Finder f) async {
      if (f.evaluate().isEmpty) {
        await tester.scrollUntilVisible(f, 300, scrollable: find.byType(Scrollable).first);
      }
      await tester.ensureVisible(f);
      await tester.pumpAndSettle();
      await tippen(tester, f);
    }

    testWidgets('Jahresbeitrag bearbeiten schickt alle Felder, Beschreibung bleibt', (
      tester,
    ) async {
      await oeffnen(tester);
      await tippen(tester, find.byKey(const Key('einstellung-bearbeiten')));
      expect(find.text('Jahresbeitrag 2026'), findsOneWidget);
      expect(find.text('Ändert die schon erzeugten Beiträge nicht.'), findsOneWidget);
      await tester.enterText(find.byKey(const Key('einstellung-betrag')), '60');
      await tester.enterText(find.byKey(const Key('einstellung-gv')), 'GV 2026');
      await tippen(tester, find.byKey(const Key('einstellung-speichern')));
      expect(backend.aenderungen, ['POST /membership-fees/settings']);
      expect(backend.body('POST /membership-fees/settings'), {
        'year': 2026,
        'amount': 60,
        'gv_date': 'GV 2026',
        'due_date': '2026-03-31',
        'description': 'Beschreibung alt',
      });
      expect(find.text('Jahresbeitrag 2026 gespeichert'), findsOneWidget);
    });

    testWidgets('Betrag Pflicht', (tester) async {
      await oeffnen(tester);
      await tippen(tester, find.byKey(const Key('einstellung-bearbeiten')));
      await tester.enterText(find.byKey(const Key('einstellung-betrag')), '0');
      await tippen(tester, find.byKey(const Key('einstellung-speichern')));
      expect(find.text('Bitte einen Betrag.'), findsOneWidget);
      expect(backend.aenderungen, isEmpty);
    });

    testWidgets('Beitraege erzeugen: Rueckfrage mit Betrag, dann generate', (tester) async {
      await oeffnen(tester);
      await druecken(tester, knopf('erzeugen'));
      expect(find.text('Beiträge 2026 erzeugen?'), findsOneWidget);
      expect(find.textContaining('über CHF 50.00'), findsOneWidget);
      await tippen(tester, imDialog('Abbrechen'));
      expect(backend.aenderungen, isEmpty);

      await druecken(tester, knopf('erzeugen'));
      await tippen(tester, imDialog('Erzeugen'));
      expect(backend.aenderungen, ['POST /membership-fees/payments/generate']);
      expect(backend.body('POST /membership-fees/payments/generate'), {'year': 2026, 'amount': 50});
      // Gleich viele vorher und nachher: 0 neu (das Backend sagt "6 created").
      expect(find.textContaining('0 Beiträge neu erzeugt'), findsOneWidget);
    });

    testWidgets('Briefe an alle per E-Mail: Zahl nennen, Haken, dann senden', (tester) async {
      await oeffnen(tester);
      await druecken(tester, knopf('an-alle-email'));
      expect(find.text('Beitragsbriefe 2026: 1 E-Mail senden?'), findsOneWidget);
      expect(
        find.textContaining('1 weitere ohne Referenz werden übersprungen: Lea Neu'),
        findsOneWidget,
      );
      expect(find.textContaining('Bei 1 ist der Zustellwunsch unbekannt'), findsOneWidget);
      expect(find.textContaining('Höchstens 2 insgesamt'), findsOneWidget);
      final ja = find.byKey(const Key('bestaetigen-ja'));
      expect(tester.widget<FilledButton>(ja).onPressed, isNull);
      // Abbrechen: nichts geht raus.
      await tippen(tester, imDialog('Abbrechen'));
      expect(backend.aenderungen, isEmpty);

      await druecken(tester, knopf('an-alle-email'));
      await tippen(tester, find.byKey(const Key('bestaetigen-haken')));
      await tippen(tester, ja);
      expect(backend.aenderungen, ['POST /membership-fees/send-email-bulk']);
      expect(backend.body('POST /membership-fees/send-email-bulk'), {'year': 2026});
      expect(
        find.text('1 gesendet, 0 fehlgeschlagen (von 1 Empfängern; 6 übersprungen).'),
        findsOneWidget,
      );
    });

    testWidgets('Per Post: Kostenhinweis; ohne Mitgliederliste entscheidet das Backend', (
      tester,
    ) async {
      await oeffnen(tester);
      await druecken(tester, knopf('an-alle-post'));
      expect(find.text('Beitragsbriefe 2026: 1 Brief senden?'), findsOneWidget);
      expect(find.textContaining('ca. CHF 1.– pro Brief'), findsOneWidget);
      await tippen(tester, imDialog('Abbrechen'));

      mitgliederKaputt = true;
      await druecken(tester, knopf('an-alle-post'));
      expect(find.text('Beitragsbriefe 2026 per Brief an alle?'), findsOneWidget);
      expect(find.textContaining('liess sich nicht laden'), findsOneWidget);
      expect(find.textContaining('höchstens 2'), findsOneWidget);
      await tippen(tester, find.byKey(const Key('bestaetigen-haken')));
      await tippen(tester, find.byKey(const Key('bestaetigen-ja')));
      expect(backend.aenderungen, ['POST /membership-fees/send-post-bulk']);
    });

    testWidgets('Keine Antwort beim Massenversand: nicht erneut ausloesen', (tester) async {
      await oeffnen(tester);
      final normal = backend.antwort;
      backend.antwort = (a) {
        if (a.url.path == '/membership-fees/send-email-bulk') {
          throw http.ClientException('Verbindung weg');
        }
        return normal(a);
      };
      await druecken(tester, knopf('an-alle-email'));
      await tippen(tester, find.byKey(const Key('bestaetigen-haken')));
      await tippen(tester, find.byKey(const Key('bestaetigen-ja')));
      expect(find.text('Keine Antwort erhalten'), findsOneWidget);
      expect(find.textContaining('NICHT erneut'), findsOneWidget);
    });

    testWidgets('Zahlungserinnerungen: Zahl fuer das Jahr, Ergebnis', (tester) async {
      await oeffnen(tester);
      await druecken(tester, knopf('erinnern'));
      expect(find.textContaining('nach heutigem Stand 5'), findsOneWidget);
      expect(find.textContaining('für alle Jahre'), findsOneWidget);
      await tippen(tester, imDialog('Abbrechen'));
      expect(backend.aenderungen, isEmpty);
      await druecken(tester, knopf('erinnern'));
      await tippen(tester, imDialog('Erinnerungen senden'));
      expect(backend.aenderungen, ['POST /membership-fees/send-reminders']);
      expect(find.text('5 fällig: 5 App-Mitteilungen, 3 E-Mails.'), findsOneWidget);
    });

    testWidgets('Geplanter Versand: offene Liste, alle zeigen, stornieren', (tester) async {
      await oeffnen(tester);
      await tester.scrollUntilVisible(
        find.text('Beitrag E-Mail-Versand 2026'),
        300,
        scrollable: find.byType(Scrollable).first,
      );
      expect(find.text('Beitrag E-Mail-Versand 2026'), findsOneWidget);
      expect(find.text('Beitrag Brief-Versand 2025'), findsNothing);
      await druecken(tester, find.byKey(const Key('geplant-alle')));
      expect(find.textContaining('12 gesendet, 1 fehlgeschlagen (von 13)'), findsOneWidget);
      // Erledigte lassen sich nicht stornieren.
      expect(find.byKey(const Key('geplant-stornieren-j0')), findsNothing);

      await druecken(tester, find.byKey(const Key('geplant-stornieren-j1')));
      expect(find.textContaining('20.10.2026, '), findsWidgets);
      await tippen(tester, imDialog('Stornieren'));
      expect(backend.aenderungen, ['DELETE /scheduled-jobs/j1']);
      expect(find.text('Auftrag storniert'), findsOneWidget);
    });

    testWidgets('Versand planen: Kanal, morgen 09:00, POST scheduled-jobs', (tester) async {
      await oeffnen(tester);
      await druecken(tester, knopf('planen'));
      expect(find.text('Beitragsbriefe 2026 planen'), findsOneWidget);
      expect(find.text('09:00 Uhr'), findsOneWidget);
      await tippen(tester, find.text('Post'));
      await tippen(tester, find.byKey(const Key('planen-weiter')));
      expect(find.text('Versand per Post planen?'), findsOneWidget);
      expect(find.textContaining('Nach heutigem Stand 1 × Brief'), findsOneWidget);
      await tippen(tester, imDialog('Planen'));
      expect(backend.aenderungen, ['POST /scheduled-jobs']);
      final body = backend.body('POST /scheduled-jobs')! as Map;
      expect(body['action'], 'membership_fees_post_bulk');
      expect(body['payload'], {'year': 2026});
      expect(body['label'], 'Beitrag Brief-Versand 2026');
      final wann = DateTime.parse(body['scheduled_at'] as String);
      expect(wann.isUtc, isTrue);
      final ort = wann.toLocal();
      final morgen = DateTime.now().add(const Duration(days: 1));
      expect(
        (ort.year, ort.month, ort.day, ort.hour, ort.minute),
        (morgen.year, morgen.month, morgen.day, 9, 0),
      );
    });

    testWidgets('Desktop: Jahreslauf ohne Ueberlauf', (tester) async {
      await oeffnen(tester, groesse: desktop);
      await tester.scrollUntilVisible(
        knopf('erinnern'),
        300,
        scrollable: find.byType(Scrollable).first,
      );
      expect(tester.takeException(), isNull);
    });
  });
}
