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
  Future<SchopfFreigabe> freigabe() async => const SchopfFreigabe(zugang: true);

  @override
  Future<void> schalten(String kennung, {required bool an}) async {
    if (kaputt) throw const ApiFehler('Zentrale nicht erreichbar', status: 502);
    geschaltet.add((kennung, an));
  }

  var alarm = KuehlerAlarm.ausJson({
    'scharf': true,
    'von': 'Erika Muster',
    'geaendert': '2026-10-31T12:00:00Z',
  });
  final alarmGesetzt = <(bool, int?)>[];

  @override
  Future<KuehlerAlarm> kuehlerAlarm() async => alarm;

  @override
  Future<KuehlerAlarm> kuehlerAlarmSetzen({required bool scharf, int? stunden}) async {
    alarmGesetzt.add((scharf, stunden));
    return alarm = KuehlerAlarm(
      scharf: scharf,
      bis: scharf || stunden == null ? null : DateTime.now().add(Duration(hours: stunden)),
      von: 'Stefan Müller',
      geaendert: DateTime.now(),
    );
  }

  final geschaut = <String?>[];

  final gescannt = <String?>[];

  @override
  Future<KuehlerAlarm> kuehlerAlarmSchauen([String? schluessel, String? sticker]) async {
    geschaut.add(schluessel);
    gescannt.add(sticker);
    return alarm = KuehlerAlarm.ausJson({
      'scharf': true,
      'offen': [
        {
          'schluessel': schluessel,
          'text': 'FWV Schopf: Eis zu warm',
          'schaut': {
            'name': 'Stefan Müller',
            'zeit': DateTime.now().toIso8601String(),
            'vor_ort': sticker != null,
          },
        },
      ],
    });
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
    expect(
      [spots.anzahl, spots.anzahlAn, spots.an, spots.teilweise, spots.ausgesteckt],
      [7, 2, false, true, 1],
    );
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
    final trv = z.thermostate.single;
    expect(
      [trv.name, trv.erreichbar, trv.temperatur, trv.soll, trv.ventil, trv.batterie],
      ['Heizkörper', true, 21.3, 21.0, 0, 100],
    );
    expect(trv.fehler, ['not_calibrated']);
  });

  Future<_Zugang> zeigen(WidgetTester tester, {bool alarm = false, String? scan}) async {
    final zugang = _Zugang(vertrag);
    tester.view.physicalSize = const Size(1080, 2400);
    tester.view.devicePixelRatio = 3;
    addTearDown(tester.view.reset);
    await tester.pumpWidget(
      MaterialApp(
        home: RoterSchopfScreen(
          zugang: zugang,
          alarmSchalten: alarm,
          qrScannen: scan == null ? null : () async => scan,
        ),
      ),
    );
    await tester.pumpAndSettle();
    return zugang;
  }

  testWidgets('Zwei Unter-Reiter: Lampen und Temperaturen; Gruppe teilweise an -> einschalten', (
    tester,
  ) async {
    final zugang = await zeigen(tester);
    expect(find.text('Spots'), findsOneWidget);
    expect(find.text('2 von 7 an · 1 ausgesteckt'), findsOneWidget);
    expect(find.text('3 Lampen · aus · 1 ausgesteckt'), findsOneWidget);
    expect(find.text('-18,2 °C'), findsNothing, reason: 'Temperaturen im zweiten Reiter');

    await tester.tap(find.text('Messwerte'));
    await tester.pumpAndSettle();
    // Hauptmessung der Zentrale zuoberst.
    expect(find.text('227 W'), findsOneWidget);
    expect(find.text('134 W'), findsOneWidget);
    expect(find.text('239 V · 0,41 A'), findsOneWidget);
    expect(find.text('2118,9 kWh'), findsOneWidget);
    await tester.scrollUntilVisible(
      find.text('Heizkörper'),
      200,
      scrollable: find.byType(Scrollable).last,
    );
    expect(find.text('-18,2 °C'), findsOneWidget);
    expect(find.text('Strom an · 90 W'), findsOneWidget);
    expect(find.text('Fühler liefert keinen Wert'), findsOneWidget);
    expect(find.text('Heizkörper'), findsOneWidget);
    expect(find.text('21,3 °C'), findsOneWidget);
    expect(
      find.text('Soll 21,0 °C · Ventil 0 % · Batterie 100 % · nicht kalibriert'),
      findsOneWidget,
    );

    await tester.tap(find.text('Lampen'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Spots'));
    await tester.pump();
    expect(zugang.geschaltet, [('gruppe:spots', true)]);
    await tester.pump(const Duration(seconds: 5));
  });

  testWidgets('Einzelne Lampe schalten, stromlose Lampe gesperrt', (tester) async {
    final zugang = await zeigen(tester);
    expect(find.text('Einzelne Lampen'), findsOneWidget);
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

  test('Schopf-Freigabe liest die Vertragsdatei (Gruppe, Schicht, keine)', () {
    final v = schopfZugangVertrag();
    final g = SchopfFreigabe.ausJson(v['gruppe']);
    expect((g.zugang, g.ueberSchicht, g.bis), (true, false, null));
    final s = SchopfFreigabe.ausJson(v['schicht']);
    expect(
      (s.zugang, s.ueberSchicht, s.schicht, s.anlass),
      (true, true, 'Nachtschicht', 'Chilbi 2026'),
    );
    expect(s.bis!.toUtc(), DateTime.utc(2026, 10, 15, 1));
    expect(SchopfFreigabe.ausJson(v['kein']).zugang, isFalse);
    expect(SchopfFreigabe.ausJson(null).zugang, isFalse);
  });

  testWidgets('SMS-Alarm: nur mit Berechtigung; entschaerfen mit Dauer, wieder scharf', (
    tester,
  ) async {
    await zeigen(tester);
    await tester.tap(find.text('Messwerte'));
    await tester.pumpAndSettle();
    expect(find.byKey(const Key('kuehler-alarm')), findsNothing);

    final z = await zeigen(tester, alarm: true);
    await tester.tap(find.text('Messwerte'));
    await tester.pumpAndSettle();
    expect(find.text('SMS-Alarm scharf'), findsOneWidget);
    expect(find.textContaining('Zuletzt: Erika Muster'), findsOneWidget);

    await tester.tap(find.byType(Switch));
    await tester.pumpAndSettle();
    expect(find.text('SMS-Alarm entschärfen'), findsOneWidget);
    await tester.tap(find.byKey(const Key('entschaerfen-4')));
    await tester.pumpAndSettle();
    expect(z.alarmGesetzt.last, (false, 4));
    expect(find.textContaining('SMS-Alarm entschärft bis'), findsOneWidget);

    // Abbrechen aendert nichts; wieder scharf geht ohne Rueckfrage.
    await tester.tap(find.byType(Switch));
    await tester.pumpAndSettle();
    expect(z.alarmGesetzt.last, (true, null));
    expect(find.text('SMS-Alarm scharf'), findsOneWidget);

    await tester.tap(find.byType(Switch));
    await tester.pumpAndSettle();
    await tester.tap(find.byKey(const Key('entschaerfen-0')));
    await tester.pumpAndSettle();
    expect(z.alarmGesetzt.last, (false, null));
    expect(find.text('SMS-Alarm entschärft'), findsOneWidget);
  });

  testWidgets('Offener Alarm: wer nachschaut, Knopf "Ich gehe schauen"', (tester) async {
    final z = await zeigen(tester, alarm: true);
    z.alarm = KuehlerAlarm.ausJson({
      'scharf': true,
      'offen': [
        {
          'schluessel': 'kuehler:eis:warm',
          'text': 'FWV Schopf, noch immer: Eis zu warm: -9 C',
          'seit': '2026-11-02T13:00:00Z',
        },
      ],
    });
    await tester.tap(find.text('Messwerte'));
    await tester.pumpAndSettle();
    expect(find.text('Eis zu warm: -9 C'), findsOneWidget);
    expect(find.text('Noch niemand schaut nach'), findsOneWidget);
    await tester.tap(find.byKey(const Key('schauen-kuehler:eis:warm')));
    await tester.pumpAndSettle();
    expect(z.geschaut, ['kuehler:eis:warm']);
    expect(find.textContaining('Stefan Müller schaut nach (seit'), findsOneWidget);
    expect(find.text('Ich gehe auch'), findsOneWidget);
    expect(find.text('Vor Ort: Sticker scannen'), findsNothing, reason: 'ohne Kamera kein Knopf');
  });

  testWidgets('Vor Ort: Sticker scannen geht mit dem Inhalt an den Server', (tester) async {
    final z = await zeigen(
      tester,
      alarm: true,
      scan: 'fwv-vor-ort:kuehler:eis:0123456789abcdef0123',
    );
    z.alarm = KuehlerAlarm.ausJson({
      'scharf': true,
      'offen': [
        {'schluessel': 'kuehler:eis:warm', 'text': 'FWV Schopf: Eis zu warm'},
      ],
    });
    await tester.tap(find.text('Messwerte'));
    await tester.pumpAndSettle();
    await tester.tap(find.byKey(const Key('vor-ort-kuehler:eis:warm')));
    await tester.pumpAndSettle();
    expect(z.gescannt, ['fwv-vor-ort:kuehler:eis:0123456789abcdef0123']);
    expect(find.textContaining('Stefan Müller war vor Ort (seit'), findsOneWidget);
    expect(find.text('Ich gehe auch'), findsNothing);
  });
}
