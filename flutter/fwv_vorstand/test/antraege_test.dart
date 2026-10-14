// Mitgliedschaftsantraege: Liste mit Statusfilter, Detail, Genehmigen und
// Ablehnen gegen das nachgebaute api-members.

import 'package:flutter_test/flutter_test.dart';
import 'package:fwv_vorstand/fwv_vorstand.dart';
import 'package:material_ui/material_ui.dart';

import 'falsches_backend.dart';

void main() {
  late FalschesBackend backend;

  setUp(() => backend = FalschesBackend());

  Future<void> zeigen(WidgetTester tester, {Size groesse = const Size(393, 852)}) async {
    tester.view.physicalSize = groesse * 3;
    tester.view.devicePixelRatio = 3;
    addTearDown(tester.view.reset);
    await tester.pumpWidget(
      MaterialApp(
        locale: const Locale('de', 'CH'),
        supportedLocales: const [Locale('de', 'CH')],
        localizationsDelegates: GlobalMaterialLocalizations.delegates,
        home: Scaffold(body: AntraegeAnsicht(dienste: backend.dienste())),
      ),
    );
    await tester.pumpAndSettle();
  }

  List<String> statusAbfragen() => [
    for (final a in backend.anfragen)
      if (a.url.path == '/member-registrations') a.url.queryParameters['status']!,
  ];

  testWidgets('Startet mit den offenen Antraegen und zeigt ihre Zahl', (tester) async {
    await zeigen(tester);
    expect(statusAbfragen(), ['pending']);
    expect(find.text('Anna Aktiv'), findsOneWidget);
    expect(find.text('Beat Gönner'), findsOneWidget);
    expect(find.text('Carla Alt'), findsNothing);
    expect(find.text('Ausstehend (2)'), findsOneWidget);
    expect(find.text('anna@example.ch'), findsOneWidget);
    expect(find.text('Feuerwehr: Ja, aktiv in der Feuerwehr Raurica'), findsOneWidget);
    expect(find.text('Eingegangen 12.10.2026 19:04'), findsOneWidget);
  });

  testWidgets('Statusfilter: Genehmigt, Abgelehnt, Alle', (tester) async {
    await zeigen(tester);
    await tester.tap(find.byKey(const Key('filter-approved')));
    await tester.pumpAndSettle();
    expect(find.text('Carla Alt'), findsOneWidget);
    expect(find.text('Anna Aktiv'), findsNothing);
    expect(find.text('Genehmigt'), findsNWidgets(2)); // Filter und Chip

    await tester.tap(find.byKey(const Key('filter-rejected')));
    await tester.pumpAndSettle();
    expect(find.text('Dario Nein'), findsOneWidget);
    expect(find.text('Feuerwehr: Ehemalige/r'), findsOneWidget, reason: 'alter Wert "former"');

    await tester.tap(find.byKey(const Key('filter-all')));
    await tester.pumpAndSettle();
    for (final n in ['Anna Aktiv', 'Beat Gönner', 'Carla Alt', 'Dario Nein']) {
      await tester.scrollUntilVisible(find.text(n), 200, scrollable: find.byType(Scrollable).last);
      expect(find.text(n), findsOneWidget);
    }
    expect(statusAbfragen(), ['pending', 'approved', 'rejected', 'all']);
  });

  testWidgets('Abgelehnter Antrag im Detail: Grund, bearbeitet von/am, keine Knoepfe', (
    tester,
  ) async {
    await zeigen(tester);
    await tester.tap(find.byKey(const Key('filter-rejected')));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Dario Nein'));
    await tester.pumpAndSettle();

    expect(backend.anfragen.last.url.path, '/member-registrations/r4');
    expect(find.text('Wohnt nicht in der Region'), findsOneWidget);
    expect(find.text('praesident@fwv-raura.ch'), findsOneWidget);
    expect(find.text('22.08.2026 09:00'), findsOneWidget);
    expect(find.text('12.05.1990'), findsOneWidget);
    expect(find.text('Frau · weiblich'), findsOneWidget);
    expect(find.text('Hauptstrasse 5, 4303 Kaiseraugst'), findsOneWidget);
    expect(find.text('Genehmigen'), findsNothing);
    expect(find.text('Ablehnen'), findsNothing);
  });

  testWidgets('Genehmigen nach Rueckfrage: POST approve, Liste und Zahl neu', (tester) async {
    await zeigen(tester);
    await tester.tap(find.text('Anna Aktiv'));
    await tester.pumpAndSettle();
    expect(find.text('Hauptstrasse 5, 4303 Kaiseraugst'), findsOneWidget);

    await tester.tap(find.text('Genehmigen'));
    await tester.pumpAndSettle();
    expect(find.text('Anna Aktiv aufnehmen?'), findsOneWidget);
    expect(find.textContaining('Angabe im Antrag: Ja, aktiv'), findsOneWidget);

    // Abbrechen schickt nichts.
    await tester.tap(find.text('Abbrechen'));
    await tester.pumpAndSettle();
    expect(backend.posts('/member-registrations/r1/approve'), isEmpty);

    await tester.tap(find.text('Genehmigen'));
    await tester.pumpAndSettle();
    await tester.tap(
      find.descendant(of: find.byType(AlertDialog), matching: find.text('Genehmigen')),
    );
    await tester.pumpAndSettle();

    // Den Status waehlt das Backend; der Body bleibt leer.
    expect(backend.posts('/member-registrations/r1/approve'), [<String, dynamic>{}]);
    expect(find.text('Antrag genehmigt – Mitglied angelegt.'), findsOneWidget);
    expect(find.text('Anna Aktiv'), findsNothing, reason: 'zurueck in der Liste, nicht mehr offen');
    expect(find.text('Beat Gönner'), findsOneWidget);
    expect(find.text('Ausstehend (1)'), findsOneWidget);
  });

  testWidgets('Ablehnen mit Grund', (tester) async {
    await zeigen(tester);
    await tester.tap(find.text('Beat Gönner'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Ablehnen'));
    await tester.pumpAndSettle();
    await tester.enterText(find.byKey(const Key('ablehnungsgrund')), '  Kein Bezug zu Raura  ');
    await tester.tap(
      find.descendant(of: find.byType(AlertDialog), matching: find.text('Ablehnen')),
    );
    await tester.pumpAndSettle();

    expect(backend.posts('/member-registrations/r2/reject'), [
      {'reason': 'Kein Bezug zu Raura'},
    ]);
    expect(find.text('Antrag abgelehnt.'), findsOneWidget);
    expect(find.text('Beat Gönner'), findsNothing);
    expect(find.text('Ausstehend (1)'), findsOneWidget);
  });

  testWidgets('Ablehnen ohne Grund schickt reason null', (tester) async {
    await zeigen(tester);
    await tester.tap(find.text('Beat Gönner'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Ablehnen'));
    await tester.pumpAndSettle();
    await tester.tap(
      find.descendant(of: find.byType(AlertDialog), matching: find.text('Ablehnen')),
    );
    await tester.pumpAndSettle();
    expect(backend.posts('/member-registrations/r2/reject'), [
      {'reason': null},
    ]);
  });

  testWidgets('Schon entschieden: deutsche Meldung, Antrag wird frisch gezeigt', (tester) async {
    await zeigen(tester);
    await tester.tap(find.text('Anna Aktiv'));
    await tester.pumpAndSettle();
    // Inzwischen hat jemand anders genehmigt.
    backend.antraege.first['status'] = 'approved';
    await tester.tap(find.text('Genehmigen'));
    await tester.pumpAndSettle();
    await tester.tap(
      find.descendant(of: find.byType(AlertDialog), matching: find.text('Genehmigen')),
    );
    await tester.pumpAndSettle();
    expect(find.text('Dieser Antrag wurde bereits bearbeitet.'), findsOneWidget);
    expect(find.text('Genehmigen'), findsNothing, reason: 'neu geladen: nicht mehr offen');
    expect(find.text('Bearbeitet von'), findsOneWidget);
  });

  testWidgets('Keine offenen Antraege: freundlicher Leer-Zustand', (tester) async {
    for (final r in backend.antraege) {
      r['status'] = 'approved';
    }
    await zeigen(tester);
    expect(find.text('Keine offenen Anträge – alles erledigt.'), findsOneWidget);
    expect(find.text('Ausstehend'), findsOneWidget, reason: 'ohne Zahl bei 0');
  });

  testWidgets('Breiter Bildschirm: Karten in Spalten, kein Ueberlauf', (tester) async {
    await zeigen(tester, groesse: const Size(1300, 900));
    await tester.tap(find.byKey(const Key('filter-all')));
    await tester.pumpAndSettle();
    final anna = tester.getTopLeft(find.text('Anna Aktiv'));
    final beat = tester.getTopLeft(find.text('Beat Gönner'));
    expect(anna.dy, beat.dy, reason: 'nebeneinander');
    expect(tester.takeException(), isNull);
  });

  test('AntraegeZaehler meldet die Zahl nur bei Aenderung', () async {
    final z = AntraegeZaehler(backend.dienste().antraege);
    var meldungen = 0;
    z.addListener(() => meldungen++);
    expect(z.anzahl, isNull);
    await z.aktualisieren();
    expect(z.anzahl, 2);
    await z.aktualisieren();
    expect(meldungen, 1);
    z.setzen(0);
    expect(meldungen, 2);
  });
}
