// Die App muss den Zustand so verstehen, wie ihn api-members liefert
// (Vertragsdatei), und richtig schalten.

import 'package:flutter_test/flutter_test.dart';
import 'package:fwv_core/fwv_core.dart';
import 'package:fwv_roterschopf/fwv_roterschopf.dart';
import 'package:material_ui/material_ui.dart';

import 'vertrag.dart';

class _Zugang extends RoterSchopfZugang {
  _Zugang(this.daten);

  final Map<String, dynamic> daten;
  final geschaltet = <(String, bool)>[];
  bool kaputt = false;

  @override
  Future<RoterSchopfZustand> zustand() async => RoterSchopfZustand.ausJson(daten);

  @override
  Future<void> schalten(String kennung, {required bool an}) async {
    if (kaputt) throw const ApiFehler('Zentrale nicht erreichbar', status: 502);
    geschaltet.add((kennung, an));
  }
}

void main() {
  final vertrag = roterSchopfVertrag();

  test('Vertrag: Gruppen, Lampen und Tiefkuehler', () {
    final z = RoterSchopfZustand.ausJson(vertrag);
    expect(z.zentrale, isTrue);
    expect(z.stand, isNotNull);
    expect(z.gruppen.map((g) => g.kennung), ['spots', 'arbeitsleuchten']);
    final spots = z.gruppen.first;
    expect([spots.anzahl, spots.anzahlAn, spots.an, spots.teilweise], [8, 2, false, true]);
    expect(z.lampen, hasLength(12));
    expect(z.lampen.where((l) => !l.erreichbar), hasLength(2));
    expect(z.lampen.firstWhere((l) => l.an).watt, 42);
    final eis = z.kuehlung.first;
    expect(eis.name, 'Tiefkühlschrank Eis');
    expect(
      [eis.temperatur, eis.grenze, eis.zuWarm, eis.stromAn, eis.watt],
      [-18.2, -12.0, false, true, 90],
    );
    final landi = z.kuehlung.last;
    expect([landi.temperatur, landi.zuWarm], [null, true]);
  });

  Future<_Zugang> zeigen(WidgetTester tester) async {
    final zugang = _Zugang(vertrag);
    tester.view.physicalSize = const Size(1080, 2400);
    tester.view.devicePixelRatio = 3;
    addTearDown(tester.view.reset);
    await tester.pumpWidget(MaterialApp(home: RoterSchopfScreen(zugang: zugang)));
    await tester.pumpAndSettle();
    return zugang;
  }

  testWidgets('Zeigt Gruppen und Tiefkuehler; Gruppe teilweise an -> einschalten', (tester) async {
    final zugang = await zeigen(tester);
    expect(find.text('Spots'), findsOneWidget);
    expect(find.text('2 von 8 an'), findsOneWidget);
    expect(find.text('4 Lampen · aus'), findsOneWidget);
    expect(find.text('-18,2 °C'), findsOneWidget);
    expect(find.text('Strom an · 90 W'), findsOneWidget);
    expect(find.text('Fühler liefert keinen Wert'), findsOneWidget);

    await tester.tap(find.text('Spots'));
    await tester.pump();
    expect(zugang.geschaltet, [('gruppe:spots', true)]);
    await tester.pump(const Duration(seconds: 5));
  });

  testWidgets('Einzelne Lampe schalten, stromlose Lampe gesperrt', (tester) async {
    final zugang = await zeigen(tester);
    await tester.scrollUntilVisible(find.text('Einzelne Lampen'), 200);
    await tester.tap(find.text('Einzelne Lampen'));
    await tester.pumpAndSettle();
    expect(find.text('10 von 12 erreichbar'), findsOneWidget);

    final ersteLampe = find.ancestor(of: find.text('Lampe 12/0'), matching: find.byType(ListTile));
    await tester.ensureVisible(ersteLampe);
    await tester.pumpAndSettle();
    await tester.tap(find.descendant(of: ersteLampe, matching: find.byType(Switch)));
    await tester.pump();
    expect(zugang.geschaltet, [('192.168.33.12:0', false)]);
    await tester.pump(const Duration(seconds: 5));

    final weg = find.ancestor(
      of: find.text('nicht erreichbar').first,
      matching: find.byType(ListTile),
    );
    final schalter = tester.widget<Switch>(find.descendant(of: weg, matching: find.byType(Switch)));
    expect(schalter.onChanged, isNull);
  });

  testWidgets('Fehler beim Schalten wird gemeldet', (tester) async {
    final zugang = await zeigen(tester);
    zugang.kaputt = true;
    await tester.tap(find.text('Arbeitsleuchten'));
    await tester.pumpAndSettle();
    expect(find.text('Zentrale nicht erreichbar'), findsOneWidget);
  });
}
