// Nachricht, Teil App-Push: geht erst nach der Rueckfrage raus, mit
// title/body wie api-events POST /push/broadcast erwartet; die Zahl aus
// `sent` wird angezeigt. E-Mail/Brief, Verlauf, Pingen: versand_test.dart.

import 'package:flutter_test/flutter_test.dart';
import 'package:fwv_vorstand/fwv_vorstand.dart';
import 'package:material_ui/material_ui.dart';

import 'hilfe.dart';

void main() {
  late FalschesBackend backend;

  setUp(() {
    backend = FalschesBackend((a) {
      if ('${a.method} ${a.url.path}' == 'POST /push/broadcast') {
        return {'success': true, 'sent': 37};
      }
      return (404, {'error': 'nicht gefunden'});
    });
  });

  Future<void> oeffnen(WidgetTester tester, {Size groesse = handy}) => zeigen(
    tester,
    NachrichtAnsicht(dienste: backend.dienste, start: NachrichtTeil.push),
    groesse: groesse,
  );

  FilledButton senden(WidgetTester tester) =>
      tester.widget<FilledButton>(find.byKey(const Key('push-senden')));

  Future<void> ausfuellen(WidgetTester tester) async {
    await tester.enterText(find.byKey(const Key('push-titel')), '  Übung am Samstag ');
    await tester.enterText(find.byKey(const Key('push-text')), 'Treffpunkt 9 Uhr Magazin.');
    await tester.pumpAndSettle();
  }

  testWidgets('Senden erst mit Titel und Text; Vorschau folgt der Eingabe', (tester) async {
    await oeffnen(tester);
    expect(senden(tester).onPressed, isNull);
    expect(find.text('Titel und Text erscheinen hier.'), findsOneWidget);

    await ausfuellen(tester);
    expect(senden(tester).onPressed, isNotNull);
    final vorschau = find.byKey(const Key('push-vorschau'));
    expect(find.descendant(of: vorschau, matching: find.text('Übung am Samstag')), findsOneWidget);
    expect(
      find.descendant(of: vorschau, matching: find.text('Treffpunkt 9 Uhr Magazin.')),
      findsOneWidget,
    );
    expect(tester.takeException(), isNull);
  });

  testWidgets('Rueckfrage: Abbrechen schickt nichts, Senden schickt title/body', (tester) async {
    await oeffnen(tester);
    await ausfuellen(tester);

    await tippen(tester, find.byKey(const Key('push-senden')));
    expect(find.text('An alle App-Nutzer senden?'), findsOneWidget);
    await tippen(tester, imDialog('Abbrechen'));
    expect(backend.aenderungen, isEmpty);

    await tippen(tester, find.byKey(const Key('push-senden')));
    await tippen(tester, imDialog('An alle senden'));
    expect(backend.aenderungen, ['POST /push/broadcast']);
    expect(backend.body('POST /push/broadcast'), {
      'title': 'Übung am Samstag',
      'body': 'Treffpunkt 9 Uhr Magazin.',
    });

    final ergebnis = find.byKey(const Key('push-ergebnis'));
    expect(
      find.descendant(of: ergebnis, matching: find.text('An 37 Geräte zugestellt.')),
      findsOneWidget,
    );
    // Formular wieder leer - kein versehentliches zweites Senden.
    expect(senden(tester).onPressed, isNull);
  });

  testWidgets('Fehler: Meldung, Eingabe bleibt', (tester) async {
    backend.antwort = (_) => (502, {'error': 'Push-Broadcast fehlgeschlagen'});
    await oeffnen(tester);
    await ausfuellen(tester);
    await tippen(tester, find.byKey(const Key('push-senden')));
    await tippen(tester, imDialog('An alle senden'));
    expect(find.text('Push fehlgeschlagen: Push-Broadcast fehlgeschlagen'), findsOneWidget);
    expect(find.byKey(const Key('push-ergebnis')), findsNothing);
    expect(senden(tester).onPressed, isNotNull);
  });

  testWidgets('Langer Titel: Hinweis aufs Abschneiden', (tester) async {
    await oeffnen(tester);
    await tester.enterText(find.byKey(const Key('push-titel')), 'x' * 60);
    await tester.pumpAndSettle();
    expect(find.text('Über 50 Zeichen: wird oft abgeschnitten.'), findsOneWidget);
  });

  testWidgets('Desktop: Formular und Vorschau nebeneinander', (tester) async {
    await oeffnen(tester, groesse: desktop);
    final formular = tester.getTopLeft(find.byKey(const Key('push-titel')));
    final vorschau = tester.getTopLeft(find.byKey(const Key('push-vorschau')));
    expect(vorschau.dx, greaterThan(formular.dx + 300));
    expect(tester.takeException(), isNull);
  });

  test('PushAnAlleDienst liest sent als Zahl oder Text', () async {
    backend.antwort = (_) => {'success': true, 'sent': '5'};
    expect(await backend.dienste.push.anAlle(titel: 'a', text: 'b'), 5);
    backend.antwort = (_) => {'success': true, 'sent': null};
    expect(await backend.dienste.push.anAlle(titel: 'a', text: 'b'), isNull);
  });
}
