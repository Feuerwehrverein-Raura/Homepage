// Geraete und Versionen: Gruppen nach Version, veraltet markiert, Filter
// "Nur veraltete", Suche, Desktop in Spalten - gegen das nachgebaute
// api-members (GET /vorstand/app-geraete).

import 'package:flutter_test/flutter_test.dart';
import 'package:fwv_vorstand/fwv_vorstand.dart';
import 'package:material_ui/material_ui.dart';

import 'hilfe.dart';

final _jetzt = DateTime.utc(2026, 10, 15, 12).toLocal();

Map<String, Object?> _antwort() => {
  'neuste': {'version': '1.0.25', 'build_nummer': 10025, 'herkunft': 'geraete'},
  'geraete': [
    {
      'member_id': 'a',
      'name': 'Anna Aktiv',
      'plattform': 'android',
      'quelle': 'play',
      'app_version': '1.0.25',
      'build_nummer': 10025,
      'os_version': 'Android 16 (SDK 36)',
      'geraet_modell': 'samsung SM-A376B',
      'zuletzt': '2026-10-15 11:00:00',
      'veraltet': false,
    },
    {
      'member_id': 'b',
      'name': 'Beat Bremser',
      'plattform': 'android',
      'quelle': 'apk',
      'app_version': '1.0.23',
      'build_nummer': 10023,
      'zuletzt': '2026-10-12 12:00:00',
      'veraltet': true,
    },
    {
      'member_id': 'c',
      'name': 'Carla Computer',
      'plattform': 'windows',
      'quelle': 'desktop',
      'app_version': '1.0.25',
      'build_nummer': 10025,
      'zuletzt': '2026-10-14 08:00:00',
      'veraltet': false,
    },
    {
      'member_id': 'w',
      'name': 'Willi Web',
      'plattform': 'web',
      'quelle': 'web',
      'app_version': '1.0.0',
      'build_nummer': 1,
      'zuletzt': '2026-10-15 11:58:00',
      'veraltet': false,
    },
  ],
  'ohne_meldung': [
    {
      'member_id': 'x',
      'name': 'Xaver Alt',
      'plattform': 'android',
      'zuletzt': '2026-08-01 12:00:00',
    },
  ],
};

void main() {
  late FalschesBackend backend;

  setUp(() => backend = FalschesBackend((_) => _antwort()));

  Future<void> anzeigen(WidgetTester tester, {Size groesse = handy}) => zeigen(
    tester,
    GeraeteAnsicht(dienste: backend.dienste, jetzt: () => _jetzt),
    groesse: groesse,
  );

  Finder karte(String name) =>
      find.ancestor(of: find.text(name), matching: find.byType(GeraetKarte));

  testWidgets('Gruppiert nach Version, neuste zuerst, unbekannt am Schluss', (tester) async {
    await anzeigen(tester);
    expect(backend.anfragen.single.url.path, endsWith('/vorstand/app-geraete'));
    expect(
      find.text('Neuste Version: 1.0.25 (höchste von einem Android-Gerät gemeldete).'),
      findsOneWidget,
    );

    double oben(String gruppe) => tester.getTopLeft(find.byKey(Key('gruppe-$gruppe'))).dy;
    expect(oben('1.0.25'), lessThan(oben('1.0.23')));
    expect(oben('1.0.23'), lessThan(oben('1.0.0')));
    await tester.scrollUntilVisible(
      find.text('Xaver Alt'),
      200,
      scrollable: find.byType(Scrollable).last,
    );
    expect(find.byKey(const Key('gruppe-Version unbekannt (vor 1.0.24)')), findsOneWidget);
    expect(find.text('Xaver Alt'), findsOneWidget);
    expect(find.text('vor 2 Monaten'), findsOneWidget);
  });

  testWidgets('Karte: Plattform und Quelle, Modell, Version, zuletzt relativ', (tester) async {
    await anzeigen(tester);
    final anna = karte('Anna Aktiv');
    expect(find.descendant(of: anna, matching: find.text('Android · Play')), findsOneWidget);
    expect(
      find.descendant(of: anna, matching: find.text('samsung SM-A376B · Android 16 (SDK 36)')),
      findsOneWidget,
    );
    expect(find.descendant(of: anna, matching: find.text('vor 1 Stunde')), findsOneWidget);
    expect(find.descendant(of: anna, matching: find.text('1.0.25')), findsOneWidget);
    expect(
      find.descendant(of: karte('Beat Bremser'), matching: find.text('Android · APK')),
      findsOneWidget,
    );
    expect(
      find.descendant(of: karte('Beat Bremser'), matching: find.text('vor 3 Tagen')),
      findsOneWidget,
    );
    expect(
      find.descendant(of: karte('Carla Computer'), matching: find.text('Computer · Windows')),
      findsOneWidget,
    );
    expect(find.text('neuste'), findsOneWidget);
    expect(find.text('veraltet'), findsWidgets);
  });

  testWidgets('Nur veraltete: alte Version und ohne Meldung, Browser nie', (tester) async {
    await anzeigen(tester);
    await tester.tap(find.byKey(const Key('nur-veraltete')));
    await tester.pumpAndSettle();
    expect(find.text('Beat Bremser'), findsOneWidget);
    expect(find.text('Xaver Alt'), findsOneWidget);
    expect(find.text('Anna Aktiv'), findsNothing);
    expect(find.text('Willi Web'), findsNothing);
    expect(find.text('2 Geräte'), findsWidgets);
    expect(backend.anfragen, hasLength(1), reason: 'Filtern ohne neuen Abruf');
  });

  testWidgets('Suche nach Name oder Modell', (tester) async {
    await anzeigen(tester);
    await tester.enterText(find.byKey(const Key('geraete-suche')), 'sm-a37');
    await tester.pumpAndSettle();
    expect(find.text('Anna Aktiv'), findsOneWidget);
    expect(find.text('Beat Bremser'), findsNothing);
    await tester.enterText(find.byKey(const Key('geraete-suche')), 'niemand');
    await tester.pumpAndSettle();
    expect(find.text('Keine Geräte zu dieser Suche.'), findsOneWidget);
  });

  testWidgets('Noch keine Meldungen', (tester) async {
    backend.antwort = (_) => {
      'neuste': {'version': null, 'build_nummer': null, 'herkunft': null},
      'geraete': [],
      'ohne_meldung': [],
    };
    await anzeigen(tester);
    expect(find.text('Noch kein Gerät hat sich gemeldet.'), findsOneWidget);
  });

  testWidgets('Desktop: Karten in Spalten, kein Ueberlauf', (tester) async {
    await anzeigen(tester, groesse: desktop);
    expect(tester.takeException(), isNull);
    final anna = tester.getTopLeft(karte('Anna Aktiv'));
    final carla = tester.getTopLeft(karte('Carla Computer'));
    expect(anna.dy, carla.dy, reason: 'gleiche Version nebeneinander');
    expect(anna.dx, isNot(carla.dx));
  });

  test('Stand aus JSON: Herkunft, veraltet, ohne Meldung', () {
    final s = AppGeraeteStand.ausJson(_antwort());
    expect(s.neusteBuild, 10025);
    expect(s.herkunft, 'geraete');
    expect(s.alle, hasLength(5));
    expect(s.ohneMeldung.single.istVeraltet, isTrue);
    expect(s.ohneMeldung.single.versionText, 'Version unbekannt (vor 1.0.24)');
    expect(s.geraete[3].herkunftText, 'Browser');
    expect(AppGeraeteStand.ausJson(null).alle, isEmpty);
  });
}
