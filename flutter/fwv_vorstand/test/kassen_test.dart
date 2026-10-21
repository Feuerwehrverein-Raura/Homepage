// Kassen im Bereich "Geraete": Anmeldebon, Freigabe durchsetzen,
// Kassen-Geraete freigeben/sperren/umbenennen - gegen das nachgebaute
// api-members (/vorstand/kassen-geraete, /vorstand/kassenbon).

import 'package:flutter_test/flutter_test.dart';
import 'package:fwv_vorstand/fwv_vorstand.dart';
import 'package:material_ui/material_ui.dart';

import 'hilfe.dart';

final _jetzt = DateTime.utc(2026, 10, 21, 12).toLocal();

void main() {
  late FalschesBackend b;
  late bool freigabeAn;

  setUp(() {
    freigabeAn = false;
    b = FalschesBackend(
      (a) => switch ((a.method, a.url.path)) {
        ('GET', '/vorstand/kassen-geraete') => {
          'modus': freigabeAn ? 'an' : 'aus',
          'geraete': [
            {
              'id': 'k1-lang',
              'code': 'K7Q2',
              'name': 'Kassen-Handy 1',
              'typ': 'app',
              'zuletzt': '2026-10-21T11:00:00.000Z',
              'freigegeben': true,
              'gesperrt': false,
            },
            {
              'id': 'k2-lang',
              'code': 'W3X9',
              'name': null,
              'typ': 'pwa',
              'zuletzt': '2026-10-20T08:00:00.000Z',
              'freigegeben': false,
              'gesperrt': false,
            },
          ],
        },
        ('PUT', '/vorstand/kassen-geraete/modus') => {'modus': 'an'},
        ('PUT', _) => {'ok': true},
        ('POST', '/vorstand/kassenbon') => {
          'gilt_bis': '2026-10-21T13:00:00.000Z',
          'warteschlange': true,
        },
        ('GET', '/vorstand/app-geraete') => {'geraete': <Object>[], 'ohne_meldung': <Object>[]},
        _ => (404, {'error': 'unbekannt'}),
      },
    );
  });

  Future<void> anzeigen(WidgetTester tester, {Size groesse = handy}) async {
    await zeigen(
      tester,
      GeraeteAnsicht(dienste: b.dienste, jetzt: () => _jetzt),
      groesse: groesse,
    );
    await tester.tap(find.text('Kassen'));
    await tester.pumpAndSettle();
  }

  /// Menue eines Geraets oeffnen (vorher ins Bild scrollen).
  Future<void> menue(WidgetTester tester, String id) async {
    final knopf = find.byKey(Key('kasse-menue-$id'));
    await tester.ensureVisible(knopf);
    await tester.pumpAndSettle();
    await tester.tap(knopf);
    await tester.pumpAndSettle();
  }

  Future<void> waehlen(WidgetTester tester, String eintrag) async {
    await tester.tap(find.text(eintrag));
    await tester.pumpAndSettle();
  }

  testWidgets('Liste: Code, Name, Typ, zuletzt, Stand', (tester) async {
    await anzeigen(tester);
    expect(find.text('2 Kassen-Geräte'), findsOneWidget);
    expect(find.text('K7Q2 · Kassen-Handy 1'), findsOneWidget);
    expect(find.text('App · zuletzt vor 1 Stunde'), findsOneWidget);
    expect(find.text('W3X9 · Gerät'), findsOneWidget);
    expect(find.text('Web-Kasse · zuletzt gestern'), findsOneWidget);
    expect(find.text('freigegeben'), findsOneWidget);
    expect(find.text('neu'), findsOneWidget);
    expect(tester.takeException(), isNull);
  });

  testWidgets('Freigeben, Sperren, Umbenennen', (tester) async {
    await anzeigen(tester);
    await menue(tester, 'k2-lang');
    await waehlen(tester, 'Freigeben');
    expect(b.body('PUT /vorstand/kassen-geraete/k2-lang'), {
      'freigegeben': true,
      'gesperrt': false,
    });
    expect(find.text('W3X9 ist freigegeben.'), findsOneWidget);

    await menue(tester, 'k1-lang');
    expect(find.text('Freigeben'), findsNothing);
    await waehlen(tester, 'Sperren');
    expect(b.body('PUT /vorstand/kassen-geraete/k1-lang'), {'gesperrt': true});

    await menue(tester, 'k2-lang');
    await waehlen(tester, 'Umbenennen');
    await tester.enterText(find.byKey(const Key('kasse-name')), ' Bar-Tablet ');
    await tippen(tester, imDialog('Speichern'));
    expect(b.body('PUT /vorstand/kassen-geraete/k2-lang'), {'name': 'Bar-Tablet'});
  });

  testWidgets('Freigabe einschalten nur nach Rueckfrage', (tester) async {
    await anzeigen(tester);
    await tippen(tester, find.byKey(const Key('freigabe-durchsetzen')));
    expect(find.text('Freigabe einschalten?'), findsOneWidget);
    await tippen(tester, imDialog('Abbrechen'));
    expect(b.aenderungen, isEmpty);

    await tippen(tester, find.byKey(const Key('freigabe-durchsetzen')));
    freigabeAn = true;
    await tippen(tester, imDialog('Einschalten'));
    expect(b.body('PUT /vorstand/kassen-geraete/modus'), {'an': true});
    expect(find.text('Freigabe ist eingeschaltet.'), findsOneWidget);
    expect(
      tester.widget<SwitchListTile>(find.byKey(const Key('freigabe-durchsetzen'))).value,
      isTrue,
    );
  });

  testWidgets('Anmeldebon drucken', (tester) async {
    await anzeigen(tester);
    await tippen(tester, find.byKey(const Key('kassenbon-drucken')));
    expect(b.aenderungen, ['POST /vorstand/kassenbon']);
    final bis = DateTime.utc(2026, 10, 21, 13).toLocal();
    final uhr = '${bis.hour.toString().padLeft(2, '0')}:${bis.minute.toString().padLeft(2, '0')}';
    expect(
      find.text(
        'Bon geht an den Bar-Drucker im Schopf (kommt in wenigen Sekunden) – '
        'gilt einmal bis $uhr Uhr.',
      ),
      findsOneWidget,
    );
  });

  testWidgets('Desktop: kein Ueberlauf', (tester) async {
    await anzeigen(tester, groesse: desktop);
    expect(find.text('K7Q2 · Kassen-Handy 1'), findsOneWidget);
    expect(tester.takeException(), isNull);
  });
}
