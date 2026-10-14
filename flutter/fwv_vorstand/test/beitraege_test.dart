// Beitraege: Kennzahlen, Liste, Suche und Filter, und dass bezahlt/offen/
// Referenz/Einzelversand die richtigen Aufrufe an api-accounting schicken -
// erst nach der Rueckfrage. Die Antworten haben die Form, die PostgreSQL
// liefert (COUNT und DECIMAL als Text, DATE als ISO-Zeitpunkt).

import 'package:flutter_test/flutter_test.dart';
import 'package:fwv_vorstand/fwv_vorstand.dart';
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
  String? bezahlt,
  bool adresse = true,
}) => {
  'id': id,
  'member_id': 'm-$id',
  'year': 2026,
  'amount': '50.00',
  'reference_nr': ref,
  'bank_reference': null,
  'status': status,
  'paid_date': bezahlt,
  'payment_method': null,
  'vorname': vorname,
  'nachname': nachname,
  'email': email,
  'strasse': adresse ? 'Dorfstrasse 1' : null,
  'plz': adresse ? '4303' : null,
  'ort': adresse ? 'Kaiseraugst' : null,
  'member_status': 'Aktivmitglied',
};

final _zahlungen = [
  _zahlung('p1', 'Erika', 'Muster', email: 'erika@example.ch', ref: '05590'),
  _zahlung(
    'p2',
    'Hans',
    'Bader',
    status: 'bezahlt',
    email: 'hans@example.ch',
    ref: '05601',
    bezahlt: '2026-03-15T00:00:00.000Z',
  ),
  _zahlung('p3', 'Ruth', 'Zimmerli', email: null, adresse: false),
];

const _summary = {
  'total': '3',
  'paid': '1',
  'open': '2',
  'total_amount': '1500.00',
  'paid_amount': '50.00',
  'open_amount': '100.00',
};

void main() {
  group('Daten', () {
    test('CHF mit Hochkomma, zwei Stellen', () {
      expect(chf(50), 'CHF 50.00');
      expect(chf(1234.5), 'CHF 1’234.50');
      expect(chf(1234567), 'CHF 1’234’567.00');
      expect(chf(0), 'CHF 0.00');
    });

    test('Kennzahlen und Zahlungen aus Text-Zahlen', () {
      final k = BeitragsKennzahlen.ausJson(_summary);
      expect((k.gesamt, k.bezahlt, k.offen), (3, 1, 2));
      expect(k.betragBezahlt, 50);
      final z = Beitragszahlung.ausJson(_zahlungen[1]);
      expect(z.betrag, 50);
      expect(z.bezahlt, isTrue);
      expect(datumText(z.bezahltAm!), '15.03.2026');
      expect(z.name, 'Bader Hans');
      expect(kalendertag('2026-03-31'), DateTime(2026, 3, 31));
    });

    test('Suche nach Name (beide Reihenfolgen), E-Mail, Referenz; Filter', () {
      final alle = [for (final j in _zahlungen) Beitragszahlung.ausJson(j)];
      List<String> ids(List<Beitragszahlung> l) => [for (final z in l) z.id];
      expect(ids(beitraegeFiltern(alle, suche: 'erika muster')), ['p1']);
      expect(ids(beitraegeFiltern(alle, suche: 'MUSTER ERIKA')), ['p1']);
      expect(ids(beitraegeFiltern(alle, suche: 'hans@')), ['p2']);
      expect(ids(beitraegeFiltern(alle, suche: '0560')), ['p2']);
      expect(ids(beitraegeFiltern(alle, filter: BeitragsFilter.offen)), ['p1', 'p3']);
      expect(ids(beitraegeFiltern(alle, filter: BeitragsFilter.bezahlt)), ['p2']);
      expect(ids(beitraegeFiltern(alle, filter: BeitragsFilter.bezahlt, suche: 'erika')), []);
    });

    test('Referenz: nur Ziffern, hoechstens 20, fuehrende Nullen fallen weg', () {
      expect(referenzAusEingabe(' 05 590 '), '05590');
      expect(referenzAusEingabe(''), '');
      expect(referenzAusEingabe('12a'), isNull);
      expect(referenzAusEingabe('00 00000 00000 00000 00000 05590'), '5590');
      expect(referenzAusEingabe('1' * 21), isNull);
    });
  });

  group('Ansicht', () {
    late FalschesBackend backend;
    late bool einstellungDa;

    setUp(() {
      einstellungDa = true;
      backend = FalschesBackend((a) {
        final weg = '${a.method} ${a.url.path}';
        if (weg == 'GET /membership-fees/payments') return _zahlungen;
        if (weg == 'GET /membership-fees/summary') return _summary;
        if (weg.startsWith('GET /membership-fees/settings/')) {
          if (!einstellungDa) return (404, {'error': 'Keine Einstellung fuer dieses Jahr'});
          return {
            'year': 2026,
            'amount': '50.00',
            'gv_date': '14. März 2026',
            'due_date': '2026-03-31T00:00:00.000Z',
          };
        }
        if (a.method == 'PATCH' || a.method == 'POST') return {'id': 'p1', 'success': true};
        return (404, {'error': 'nicht gefunden'});
      });
    });

    Future<void> oeffnen(WidgetTester tester, {Size groesse = handy}) => zeigen(
      tester,
      BeitraegeAnsicht(dienste: backend.dienste, heute: _heute),
      groesse: groesse,
    );

    String text(WidgetTester tester, String key) => tester.widget<Text>(find.byKey(Key(key))).data!;

    testWidgets('Kennzahlen, Einstellung und Liste (Handy)', (tester) async {
      await oeffnen(tester);
      final gets = [for (final a in backend.anfragen) '${a.url.path}?${a.url.query}'];
      expect(gets, contains('/membership-fees/payments?year=2026'));
      expect(gets, contains('/membership-fees/summary?year=2026'));
      expect(gets, contains('/membership-fees/settings/2026?'));

      expect(text(tester, 'kennzahl-Gesamt'), '3');
      expect(text(tester, 'kennzahl-Bezahlt'), '1');
      expect(text(tester, 'kennzahl-Offen'), '2');
      expect(text(tester, 'kennzahl-Eingenommen'), 'CHF 50.00');
      expect(find.text('von CHF 1’500.00'), findsOneWidget);
      expect(
        find.textContaining('Jahresbeitrag CHF 50.00 · fällig am 31.03.2026 · GV 14. März 2026'),
        findsOneWidget,
      );

      expect(find.text('Muster Erika'), findsOneWidget);
      expect(find.text('Bader Hans'), findsOneWidget);
      expect(find.text('bezahlt am 15.03.2026'), findsOneWidget);
      expect(find.text('Zimmerli Ruth'), findsOneWidget);
      expect(find.text('Alle (3)'), findsOneWidget);
      expect(find.text('Offen (2)'), findsOneWidget);
      expect(find.text('Bezahlt (1)'), findsOneWidget);
      // Phone: Kennzahlen zwei mal zwei.
      final g = tester.getTopLeft(find.byKey(const Key('kennzahl-Gesamt')));
      final o = tester.getTopLeft(find.byKey(const Key('kennzahl-Offen')));
      expect(o.dy, greaterThan(g.dy));
      expect(tester.takeException(), isNull);
    });

    testWidgets('Desktop: Kennzahlen in einer Reihe, lesbare Breite', (tester) async {
      await oeffnen(tester, groesse: desktop);
      final g = tester.getTopLeft(find.byKey(const Key('kennzahl-Gesamt')));
      final e = tester.getTopLeft(find.byKey(const Key('kennzahl-Eingenommen')));
      expect(e.dy, g.dy);
      // Inhalt mittig, hoechstens 840 breit.
      final suche = tester.getRect(find.byKey(const Key('beitraege-suche')));
      expect(suche.width, lessThanOrEqualTo(840));
      expect(suche.left, greaterThan(200));
      expect(tester.takeException(), isNull);
    });

    testWidgets('Suche und Filter', (tester) async {
      await oeffnen(tester);
      await tester.enterText(find.byKey(const Key('beitraege-suche')), 'erika');
      await tester.pumpAndSettle();
      expect(find.text('Muster Erika'), findsOneWidget);
      expect(find.text('Bader Hans'), findsNothing);

      await tester.tap(find.byTooltip('Suche leeren'));
      await tester.pumpAndSettle();
      await tippen(tester, find.text('Bezahlt (1)'));
      expect(find.text('Bader Hans'), findsOneWidget);
      expect(find.text('Muster Erika'), findsNothing);
      expect(find.text('Zimmerli Ruth'), findsNothing);

      await tester.enterText(find.byKey(const Key('beitraege-suche')), 'ruth');
      await tester.pumpAndSettle();
      expect(find.text('Keine Treffer.'), findsOneWidget);
    });

    testWidgets('Als bezahlt markieren: erst nach Rueckfrage, dann neu laden', (tester) async {
      await oeffnen(tester);
      await tippen(tester, find.text('Muster Erika'));
      await tippen(tester, find.text('Als bezahlt markieren'));
      expect(find.text('Als bezahlt markieren?'), findsOneWidget);
      expect(find.textContaining('Erika Muster (CHF 50.00)'), findsOneWidget);

      // Abbrechen: nichts geht raus.
      await tippen(tester, imDialog('Abbrechen'));
      expect(backend.aenderungen, isEmpty);

      final vorher = backend.anfragen.length;
      await tippen(tester, find.text('Muster Erika'));
      await tippen(tester, find.text('Als bezahlt markieren'));
      await tippen(tester, imDialog('Als bezahlt markieren'));
      expect(backend.aenderungen, ['PATCH /membership-fees/payments/p1/pay']);
      expect(backend.body('PATCH /membership-fees/payments/p1/pay'), <String, Object?>{});
      // Kennzahlen und Liste frisch geladen.
      final danach = backend.anfragen.skip(vorher).map((a) => a.url.path).toList();
      expect(danach, containsAll(['/membership-fees/payments', '/membership-fees/summary']));
      expect(find.text('Erika Muster: bezahlt.'), findsOneWidget);
    });

    testWidgets('Zuruecksetzen schickt unpay ohne Inhalt', (tester) async {
      await oeffnen(tester);
      await tippen(tester, find.text('Bader Hans'));
      expect(find.text('Als bezahlt markieren'), findsNothing);
      await tippen(tester, find.text('Zurücksetzen'));
      await tippen(tester, imDialog('Zurücksetzen'));
      expect(backend.aenderungen, ['PATCH /membership-fees/payments/p2/unpay']);
      expect(backend.body('PATCH /membership-fees/payments/p2/unpay'), isNull);
    });

    testWidgets('Referenz setzen: nur Ziffern, als reference_nr', (tester) async {
      await oeffnen(tester);
      await tippen(tester, find.text('Zimmerli Ruth'));
      await tippen(tester, find.text('Referenz setzen'));
      expect(find.text('QR-Referenz der Bank'), findsOneWidget);
      await tester.enterText(find.byType(TextField).last, '12 345');
      await tippen(tester, imDialog('Speichern'));
      expect(backend.aenderungen, ['PATCH /membership-fees/payments/p3/reference']);
      expect(backend.body('PATCH /membership-fees/payments/p3/reference'), {
        'reference_nr': '12345',
      });
      expect(find.text('Referenz gespeichert.'), findsOneWidget);
    });

    testWidgets('Referenz unveraendert: kein Aufruf', (tester) async {
      await oeffnen(tester);
      await tippen(tester, find.text('Muster Erika'));
      await tippen(tester, find.text('Referenz setzen'));
      await tippen(tester, imDialog('Speichern'));
      expect(backend.aenderungen, isEmpty);
    });

    testWidgets('Beitragsbrief: nur mit Referenz, Rueckfrage nennt 1 E-Mail', (tester) async {
      await oeffnen(tester);
      // Ruth: keine Referenz, keine Adresse - beide Versandwege gesperrt.
      await tippen(tester, find.text('Zimmerli Ruth'));
      final email = tester.widget<ListTile>(
        find.widgetWithText(ListTile, 'Beitragsbrief per E-Mail'),
      );
      expect(email.enabled, isFalse);
      await tester.tapAt(const Offset(10, 10));
      await tester.pumpAndSettle();

      await tippen(tester, find.text('Muster Erika'));
      await tippen(tester, find.text('Beitragsbrief per E-Mail'));
      expect(find.text('Beitragsbrief per E-Mail senden?'), findsOneWidget);
      expect(find.textContaining('Sendet jetzt 1 E-Mail'), findsOneWidget);
      await tippen(tester, imDialog('1 E-Mail senden'));
      expect(backend.aenderungen, ['POST /membership-fees/payments/p1/send']);
      expect(backend.body('POST /membership-fees/payments/p1/send'), {'channel': 'email'});
    });

    testWidgets('Fehler des Backends wird gemeldet', (tester) async {
      await oeffnen(tester);
      backend.antwort = (a) =>
          a.method == 'PATCH' ? (404, {'error': 'Zahlung nicht gefunden'}) : _zahlungen;
      await tippen(tester, find.text('Muster Erika'));
      await tippen(tester, find.text('Als bezahlt markieren'));
      await tippen(tester, imDialog('Als bezahlt markieren'));
      expect(find.text('Zahlung nicht gefunden'), findsOneWidget);
    });

    testWidgets('Jahr wechseln laedt das andere Jahr; ohne Einstellung ein Hinweis', (
      tester,
    ) async {
      einstellungDa = false;
      await oeffnen(tester);
      expect(find.text('Für 2026 ist noch kein Jahresbeitrag hinterlegt.'), findsOneWidget);

      await tester.tap(find.byKey(const Key('beitraege-jahr')));
      await tester.pumpAndSettle();
      // Auswahl: dieses Jahr bis vier zurueck.
      expect(find.text('2022'), findsOneWidget);
      expect(find.text('2021'), findsNothing);
      await tester.tap(find.text('2025').last);
      await tester.pumpAndSettle();
      expect(
        backend.anfragen.map((a) => '${a.url.path}?${a.url.query}'),
        contains('/membership-fees/payments?year=2025'),
      );
      expect(find.text('Für 2025 ist noch kein Jahresbeitrag hinterlegt.'), findsOneWidget);
    });

    testWidgets('Keine Beitraege im Jahr: Hinweis, Website-Link', (tester) async {
      backend.antwort = (a) => switch (a.url.path) {
        '/membership-fees/payments' => <Object>[],
        '/membership-fees/summary' => {'total': '0', 'paid': '0', 'open': '0'},
        _ => (404, {'error': 'nicht gefunden'}),
      };
      await oeffnen(tester);
      expect(find.textContaining('noch keine Beiträge erfasst'), findsOneWidget);
      await tippen(tester, find.text('Website öffnen'));
      expect(backend.links, [Uri.parse('https://www.fwv-raura.ch/vorstand.html')]);
    });
  });
}
