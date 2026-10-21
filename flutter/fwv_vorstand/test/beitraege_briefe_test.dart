// Beitragsbriefe als PDF: einen Brief ansehen, alle als ein PDF, Kassier als
// Absender (nur bei mehreren) - und dass die Wahl auch beim Senden mitgeht.
// Nachgebautes api-accounting, kein Netz.

import 'package:flutter_test/flutter_test.dart';
import 'package:fwv_vorstand/fwv_vorstand.dart';
import 'package:material_ui/material_ui.dart';

import 'hilfe.dart';

Map<String, Object?> _zahlung(String id, String vorname, String ref) => {
  'id': id,
  'member_id': 'm-$id',
  'year': 2026,
  'amount': '50.00',
  'reference_nr': ref,
  'status': 'offen',
  'vorname': vorname,
  'nachname': 'Muster',
  'email': '$vorname@example.ch',
  'strasse': 'Dorfstrasse 1',
  'plz': '4303',
  'ort': 'Kaiseraugst',
  'member_status': 'Aktivmitglied',
};

void main() {
  late FalschesBackend b;
  late List<Object> kassiere;

  setUp(() {
    kassiere = [
      {'id': 'k1', 'name': 'Anna Kasse'},
    ];
    b = FalschesBackend((a) {
      final weg = '${a.method} ${a.url.path}';
      return switch (weg) {
        'GET /membership-fees/payments' => [
          _zahlung('p1', 'Erika', '05590'),
          _zahlung('p2', 'Hans', ''),
        ],
        'GET /membership-fees/summary' => {'total': '2', 'paid': '0', 'open': '2'},
        'GET /membership-fees/kassiere' => kassiere,
        'GET /membership-fees/payments/p1/brief.pdf' => 'PDF',
        'GET /membership-fees/briefe.pdf' => 'PDF',
        'POST /membership-fees/payments/p1/send' => {'success': true},
        _ when weg.startsWith('GET /membership-fees/settings/') => {
          'year': 2026,
          'amount': '50.00',
          'due_date': '2026-03-31T00:00:00.000Z',
        },
        _ => (404, {'error': 'nicht gefunden'}),
      };
    });
  });

  Future<void> oeffnen(WidgetTester tester) =>
      zeigen(tester, BeitraegeAnsicht(dienste: b.dienste, heute: DateTime(2026, 10, 21)));

  Iterable<Uri> abrufe(String pfad) => [
    for (final a in b.anfragen)
      if (a.url.path == pfad) a.url,
  ];

  testWidgets('Brief ansehen: PDF der Zahlung; ohne Referenz gesperrt', (tester) async {
    await oeffnen(tester);
    await tippen(tester, find.text('Muster Hans'));
    expect(tester.widget<ListTile>(find.byKey(const Key('brief-ansehen'))).enabled, isFalse);
    await tester.tapAt(const Offset(10, 10));
    await tester.pumpAndSettle();

    await tippen(tester, find.text('Muster Erika'));
    await tippen(tester, find.byKey(const Key('brief-ansehen')));
    expect(abrufe('/membership-fees/payments/p1/brief.pdf').single.query, isEmpty);
    expect(b.geteilt.single.$1, endsWith('.pdf'));
    expect(b.aenderungen, isEmpty);
  });

  testWidgets('Ein Kassier: keine Auswahl; alle Briefe als PDF fuers Jahr', (tester) async {
    await oeffnen(tester);
    await tester.scrollUntilVisible(
      find.byKey(const Key('alle-briefe-pdf')),
      300,
      scrollable: find.byType(Scrollable).first,
    );
    expect(find.byKey(const Key('kassier-wahl')), findsNothing);
    await tippen(tester, find.byKey(const Key('alle-briefe-pdf')));
    expect(abrufe('/membership-fees/briefe.pdf').single.queryParameters, {'year': '2026'});
    expect(b.geteilt.single.$1, 'Beitragsbriefe_2026.pdf');
  });

  testWidgets('Zwei Kassiere: Wahl geht an PDF und Versand mit', (tester) async {
    kassiere = [
      {'id': 'k1', 'name': 'Anna Kasse'},
      {'id': 'k2', 'name': 'Beat Batzen'},
    ];
    await oeffnen(tester);
    await tester.scrollUntilVisible(
      find.byKey(const Key('kassier-wahl')),
      300,
      scrollable: find.byType(Scrollable).first,
    );
    await tippen(tester, find.byKey(const Key('kassier-wahl')));
    await tippen(tester, find.text('Beat Batzen').last);
    await tippen(tester, find.byKey(const Key('alle-briefe-pdf')));
    expect(abrufe('/membership-fees/briefe.pdf').single.queryParameters, {
      'year': '2026',
      'kassier_id': 'k2',
    });

    await tester.scrollUntilVisible(
      find.text('Muster Erika'),
      -300,
      scrollable: find.byType(Scrollable).first,
    );
    await tippen(tester, find.text('Muster Erika'));
    await tippen(tester, find.byKey(const Key('brief-ansehen')));
    expect(abrufe('/membership-fees/payments/p1/brief.pdf').single.queryParameters, {
      'kassier_id': 'k2',
    });

    await tippen(tester, find.text('Muster Erika'));
    await tippen(tester, find.text('Beitragsbrief per E-Mail'));
    await tippen(tester, imDialog('1 E-Mail senden'));
    expect(b.body('POST /membership-fees/payments/p1/send'), {
      'channel': 'email',
      'kassier_id': 'k2',
    });
  });
}
