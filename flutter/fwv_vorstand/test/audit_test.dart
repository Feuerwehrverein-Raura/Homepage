// Audit-Log: Liste, Aktionsfilter, Suche, Aufklappen, Mehr laden gegen das
// nachgebaute api-members.

import 'package:flutter_test/flutter_test.dart';
import 'package:fwv_anlass/fwv_anlass.dart' show HinweisArt;
import 'package:fwv_vorstand/fwv_vorstand.dart';
import 'package:material_ui/material_ui.dart';

import 'falsches_backend.dart';

void main() {
  late FalschesBackend backend;

  setUp(() => backend = FalschesBackend());

  Future<void> zeigen(
    WidgetTester tester, {
    Size groesse = const Size(393, 852),
    int seite = auditSeite,
  }) async {
    tester.view.physicalSize = groesse * 3;
    tester.view.devicePixelRatio = 3;
    addTearDown(tester.view.reset);
    await tester.pumpWidget(
      MaterialApp(
        locale: const Locale('de', 'CH'),
        supportedLocales: const [Locale('de', 'CH')],
        localizationsDelegates: GlobalMaterialLocalizations.delegates,
        home: Scaffold(
          body: AuditAnsicht(dienste: backend.dienste(), seite: seite),
        ),
      ),
    );
    await tester.pumpAndSettle();
  }

  testWidgets('Neueste zuerst, mit Zeit, Benutzer, IP und lesbarer Aktion', (tester) async {
    await zeigen(tester);
    expect(backend.auditAbfragen(), [
      {'limit': '50', 'offset': '0'},
    ]);
    expect(find.text('Anmeldung fehlgeschlagen'), findsOneWidget);
    expect(find.text('14.10.2026 09:05'), findsOneWidget);
    expect(find.text('boese@example.ch · IP 203.0.113.7'), findsOneWidget);
    expect(find.text('Grund: Invalid credentials'), findsOneWidget);
    expect(find.text('Mitglied geändert'), findsOneWidget);
    expect(find.text('Antrag genehmigt'), findsOneWidget);
    expect(find.text('Carla Alt'), findsOneWidget);
    final oben = tester.getTopLeft(find.text('Anmeldung fehlgeschlagen')).dy;
    expect(oben, lessThan(tester.getTopLeft(find.text('Mitglied geändert')).dy));
    expect(find.text('4 Einträge'), findsOneWidget, reason: 'weniger als eine Seite: Ende');
  });

  testWidgets('Aufklappen zeigt Aenderungen und JSON', (tester) async {
    await zeigen(tester);
    expect(find.text('Geändert'), findsNothing);
    await tester.tap(find.text('Mitglied geändert'));
    await tester.pumpAndSettle();
    expect(find.text('Geändert'), findsOneWidget);
    expect(find.text('ort: Raura → Giebenach'), findsOneWidget);
    expect(find.text('Vorher'), findsOneWidget);
    expect(find.text('Nachher'), findsOneWidget);
    expect(find.textContaining('"ort": "Giebenach"'), findsOneWidget);
    expect(find.text('Aktion: MEMBER_UPDATE'), findsOneWidget);

    // details (api-events) als eigener Block.
    await tester.scrollUntilVisible(
      find.text('Schicht-Erinnerungen versandt'),
      200,
      scrollable: find.byType(Scrollable).last,
    );
    await tester.tap(find.text('Schicht-Erinnerungen versandt'));
    await tester.pumpAndSettle();
    expect(find.text('Details'), findsOneWidget);
    expect(find.textContaining('"sent": 12'), findsOneWidget);
  });

  testWidgets('Filter nach Aktion fragt das Backend und laesst sich entfernen', (tester) async {
    await zeigen(tester);
    await tester.tap(find.byKey(const Key('audit-filter')));
    await tester.pumpAndSettle();
    final imBlatt = find.descendant(
      of: find.byType(BottomSheet),
      matching: find.text('Antrag genehmigt'),
    );
    await tester.scrollUntilVisible(
      imBlatt,
      300,
      scrollable: find.descendant(of: find.byType(BottomSheet), matching: find.byType(Scrollable)),
    );
    await tester.tap(imBlatt);
    await tester.pumpAndSettle();

    expect(backend.auditAbfragen().last, {
      'limit': '50',
      'offset': '0',
      'action': 'REGISTRATION_APPROVED',
    });
    expect(find.text('Carla Alt'), findsOneWidget);
    expect(find.text('Anmeldung fehlgeschlagen'), findsNothing);
    expect(find.text('Antrag genehmigt'), findsNWidgets(2), reason: 'Filter-Chip und Eintrag');

    await tester.tap(find.byTooltip('Filter entfernen'));
    await tester.pumpAndSettle();
    expect(backend.auditAbfragen().last, {'limit': '50', 'offset': '0'});
    expect(find.text('Alle Aktionen'), findsOneWidget);
    expect(find.text('Anmeldung fehlgeschlagen'), findsOneWidget);
  });

  testWidgets('Suche nach Benutzer geht als email ans Backend', (tester) async {
    await zeigen(tester);
    await tester.enterText(find.byKey(const Key('audit-suche')), 'aktuar');
    await tester.pump(const Duration(milliseconds: 600));
    await tester.pumpAndSettle();
    expect(backend.auditAbfragen().last['email'], 'aktuar');
    expect(find.text('Carla Alt'), findsOneWidget);
    expect(find.text('Anmeldung fehlgeschlagen'), findsNothing);

    await tester.enterText(find.byKey(const Key('audit-suche')), 'niemand');
    await tester.testTextInput.receiveAction(TextInputAction.search);
    await tester.pumpAndSettle();
    expect(find.text('Keine Einträge zu dieser Suche.'), findsOneWidget);
  });

  testWidgets('Mehr laden haengt die naechste Seite an', (tester) async {
    await zeigen(tester, seite: 3);
    expect(find.text('Mehr laden'), findsOneWidget);
    await tester.scrollUntilVisible(
      find.text('Mehr laden'),
      200,
      scrollable: find.byType(Scrollable).last,
    );
    await tester.tap(find.text('Mehr laden'));
    await tester.pumpAndSettle();
    expect(backend.auditAbfragen().last, {'limit': '3', 'offset': '3'});
    await tester.scrollUntilVisible(
      find.text('4 Einträge'),
      200,
      scrollable: find.byType(Scrollable).last,
    );
    expect(find.text('Schicht-Erinnerungen versandt'), findsOneWidget);
    expect(find.text('Mehr laden'), findsNothing);
  });

  testWidgets('Breit (1300 dp): kein Ueberlauf, Inhalt mittig begrenzt', (tester) async {
    await zeigen(tester, groesse: const Size(1300, 900));
    expect(tester.takeException(), isNull);
    final links = tester.getTopLeft(find.byType(AuditKarte).first).dx;
    expect(links, greaterThan(100));
  });

  test('Aktionen: eindeutig, Unbekanntes als Code, Fehlschlaege rot', () {
    final codes = auditAktionen.map((a) => a.code).toList();
    expect(codes.toSet().length, codes.length);
    expect(auditAktion('LOGIN_SUCCESS').text, 'Anmeldung');
    expect(auditAktion('NEU_UNBEKANNT').text, 'NEU_UNBEKANNT');
    expect(auditAktion('IRGENDWAS_FAILED').art, HinweisArt.schlecht);
  });
}
