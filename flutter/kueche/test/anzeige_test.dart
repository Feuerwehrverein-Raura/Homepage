// Anzeige, Anmeldung und Uebernahme der alten Einstellungen - mit Attrappen
// fuer Bestellsystem und WebSocket.

import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:kueche/main.dart';
import 'package:kueche/src/dienste.dart';
import 'package:kueche/src/geraet.dart';
import 'package:kueche/src/modelle.dart';
import 'package:kueche/src/netz.dart';
import 'package:shared_preferences/shared_preferences.dart';

import 'logik_test.dart' show token;

final jetzt = DateTime.utc(2026, 11, 2, 18, 0);

class FakeSystem implements Bestellsystem {
  FakeSystem(this.liste);

  List<Bestellung> liste;
  final erledigt = <int>[];
  final positionen = <(int, List<int>)>[];
  Object? fehler;

  @override
  String get url => cloudUrl;

  @override
  Future<List<Bestellung>> bestellungen() async {
    if (fehler != null) throw fehler!;
    return liste;
  }

  @override
  Future<void> bestellungErledigt(int id) async => erledigt.add(id);

  @override
  Future<void> positionenErledigt(int id, List<int> p) async => positionen.add((id, p));
}

class FakeLive implements LiveVerbindung {
  final strom = StreamController<WsNachricht?>.broadcast();
  final _ende = Completer<void>();

  @override
  Stream<WsNachricht?> get nachrichten => strom.stream;

  @override
  Future<void> get ende => _ende.future;

  @override
  void schliessen() {
    strom.close();
    if (!_ende.isCompleted) _ende.complete();
  }
}

Bestellung bestellung(int id, {int tisch = 3, int minutenAlt = 2, List<Position>? positionen}) => Bestellung(
  id: id,
  tisch: tisch,
  status: 'paid',
  erstellt: jetzt.subtract(Duration(minutes: minutenAlt)),
  positionen:
      positionen ??
      [
        Position(id: id * 10 + 1, name: 'Bratwurst', menge: 2, station: 'kitchen', notiz: 'ohne Senf'),
        Position(id: id * 10 + 2, name: 'Pommes', menge: 1, station: 'kitchen', notiz: 'Glutenallergie'),
        Position(id: id * 10 + 3, name: 'Bier', menge: 2, station: 'bar'),
      ],
);

class Aufbau {
  Aufbau(this.system);

  final FakeSystem system;
  FakeLive? live;
  final toene = <String>[];
  AuthErgebnis erneuern = const AuthUnerreichbar('aus');
  AuthErgebnis anmelden = AuthOk(token);

  NeueVersion? neu;

  Future<Dienste> dienste({Map<String, Object> werte = const {}}) async {
    SharedPreferences.setMockInitialValues({
      'uebernommen': true,
      'token': token,
      'station': 'kitchen',
      ...werte,
    });
    return Dienste(
      einstellungen: await Einstellungen.laden(const Geraet()),
      geraet: const Geraet(),
      system: (url, t) => system,
      live: (url, t) async => live = FakeLive(),
      vorOrt: () async => false,
      anmelden: (url, pw) async => anmelden,
      qrAnmelden: (url, code) async => anmelden,
      erneuern: (url, t) async => erneuern,
      updateSuche: () async => neu,
      version: '4.0',
      jetzt: () => jetzt,
    );
  }
}

Future<void> zeigen(WidgetTester tester, Dienste d) async {
  tester.view.physicalSize = const Size(1280, 800);
  tester.view.devicePixelRatio = 1;
  addTearDown(tester.view.reset);
  await tester.pumpWidget(KuechenApp(dienste: d));
  await tester.pump();
  await tester.pump();
}

/// Abbauen, damit keine Timer offen bleiben.
Future<void> abbauen(WidgetTester tester) async {
  await tester.pumpWidget(const SizedBox());
  await tester.pump(const Duration(seconds: 1));
}

void main() {
  late List<String> kanal;
  var besitzer = false;
  setUp(() {
    kanal = [];
    besitzer = false;
    TestDefaultBinaryMessengerBinding.instance.defaultBinaryMessenger.setMockMethodCallHandler(
      const MethodChannel('ch.fwvraura.kitchendisplay/geraet'),
      (c) async {
        kanal.add(c.method);
        return switch (c.method) {
          'sperre' => {'besitzer': besitzer, 'aktiv': besitzer},
          'darfInstallieren' => besitzer, // wie MainActivity: Geraetebesitzer darf immer
          _ => null,
        };
      },
    );
  });

  testWidgets('Geraetesperre: Update von selbst, aber erst wenn nichts mehr offen ist', (tester) async {
    besitzer = true;
    final a = Aufbau(FakeSystem([bestellung(1)]))..neu = const NeueVersion('4.1', 'https://x/k.apk', null);
    await zeigen(tester, await a.dienste());
    await tester.pump(const Duration(seconds: 16)); // erste Update-Suche nach 15 s
    expect(find.textContaining('Neue Version 4.1'), findsOneWidget);
    expect(kanal, isNot(contains('installieren')), reason: 'Bestellung offen');

    await tester.tap(find.text('Erledigt (2)'));
    await tester.pump();
    await tester.pump();
    expect(kanal, contains('installieren'));
    expect(find.textContaining('startet gleich neu'), findsOneWidget);
    await abbauen(tester);
  });

  testWidgets('Ohne Sperre: Update nur auf Tipp', (tester) async {
    final a = Aufbau(FakeSystem([]))..neu = const NeueVersion('4.1', 'https://x/k.apk', null);
    await zeigen(tester, await a.dienste());
    await tester.pump(const Duration(seconds: 16));
    expect(find.textContaining('Neue Version 4.1'), findsOneWidget);
    expect(kanal, isNot(contains('installieren')));
    await abbauen(tester);
  });

  testWidgets('Kueche: Bestellungen, Position antippen, Erledigt (N)', (tester) async {
    final a = Aufbau(FakeSystem([bestellung(1), bestellung(2, tisch: 0, minutenAlt: 12)]));
    await zeigen(tester, await a.dienste());
    expect(find.text('Tisch 3'), findsOneWidget);
    expect(find.text('Theke'), findsOneWidget);
    expect(find.text('12 min'), findsOneWidget);
    expect(find.text('Bier'), findsNothing, reason: 'Bar-Positionen nicht in der Kueche');
    expect(find.text('Glutenallergie'), findsNWidgets(2));

    await tester.tap(find.text('Bratwurst').first);
    await tester.pump();
    expect(a.system.positionen.single.$1, 1);
    expect(a.system.positionen.single.$2, [11]);
    expect(find.byIcon(Icons.check), findsOneWidget);
    expect(find.text('Erledigt (1)'), findsOneWidget);

    await tester.tap(find.text('Erledigt (1)'));
    await tester.pump();
    expect(a.system.positionen.last.$2, [12]);
    expect(find.text('Tisch 3'), findsNothing, reason: 'nichts mehr offen fuer die Kueche');
    await abbauen(tester);
  });

  testWidgets('WebSocket: neue Bestellung mit Ton, andere Anzeige erledigt, Druckfehler', (tester) async {
    final a = Aufbau(FakeSystem([]));
    await zeigen(tester, await a.dienste());
    expect(find.text('Keine offenen Bestellungen'), findsOneWidget);
    expect(find.text('Verbunden · Cloud'), findsOneWidget);

    a.live!.strom.add(NeueBestellung(bestellung(5, tisch: 7)));
    await tester.pump();
    await tester.pump(); // Ereignis kommt nach dem Bild an
    expect(find.text('Tisch 7'), findsOneWidget);
    expect(kanal, contains('ton'));
    await tester.pump(const Duration(milliseconds: 300)); // Blitz vorbei

    a.live!.strom.add(const PositionenErledigt(5, [51, 52]));
    await tester.pump();
    await tester.pump();
    expect(find.text('Tisch 7'), findsNothing);

    a.live!.strom.add(
      const Druckfehlermeldung([
        Druckfehler(bestellung: 5, station: 'kitchen', meldung: 'Papier leer'),
        Druckfehler(bestellung: 5, station: 'bar', meldung: 'aus'),
      ]),
    );
    await tester.pump();
    await tester.pump();
    expect(find.text('Bon Küche für Bestellung #5 nicht gedruckt: Papier leer'), findsOneWidget);
    await tester.tap(find.byTooltip('Gesehen'));
    await tester.pump();
    expect(find.byKey(const Key('druckfehler')), findsNothing);
    await abbauen(tester);
  });

  testWidgets('Alle: Erledigt schliesst die ganze Bestellung', (tester) async {
    final a = Aufbau(FakeSystem([bestellung(1)]));
    await zeigen(tester, await a.dienste(werte: {'station': 'all'}));
    expect(find.text('Bier'), findsOneWidget);
    await tester.tap(find.text('Erledigt (3)'));
    await tester.pump();
    expect(a.system.erledigt, [1]);
    expect(find.text('Tisch 1'), findsNothing);
    await abbauen(tester);
  });

  testWidgets('Token abgelehnt und Erneuerung abgelehnt: zur Anmeldung mit Hinweis', (tester) async {
    final a = Aufbau(FakeSystem([])..fehler = const AnmeldungAbgelehnt(401))
      ..erneuern = const AuthAbgelehnt(401, 'ungueltig');
    final d = await a.dienste();
    await zeigen(tester, d);
    await tester.pump();
    expect(find.byKey(const Key('hinweis')), findsOneWidget);
    expect(find.textContaining('nicht mehr akzeptiert'), findsOneWidget);
    expect(d.einstellungen.token, isNull);
    await abbauen(tester);
  });

  testWidgets('Anmeldung: Fehlversuch mit Restversuchen, Warnung, dann Anzeige', (tester) async {
    final a = Aufbau(FakeSystem([bestellung(1)]))
      ..anmelden = const AuthAbgelehnt(401, 'Falsches Passwort. Noch 2 Versuche übrig.');
    final d = await a.dienste(werte: {'token': ''});
    await zeigen(tester, d);
    expect(find.text('Anmelden'), findsOneWidget);
    await tester.tap(find.text('Bar'));
    await tester.enterText(find.byKey(const Key('passwort')), 'falsch');
    await tester.tap(find.byKey(const Key('anmelden')));
    await tester.pump();
    expect(find.textContaining('Noch 2 Versuch(e), danach ist der Schopf 24 h gesperrt'), findsOneWidget);

    a.anmelden = AuthOk(token);
    await tester.tap(find.byKey(const Key('anmelden')));
    await tester.pumpAndSettle();
    expect(find.text('Achtung: IP-Sperre'), findsOneWidget);
    await tester.tap(find.text('Trotzdem senden'));
    await tester.pump();
    await tester.pump();
    expect(d.einstellungen.station, Station.bar);
    expect(find.text('Bier'), findsOneWidget, reason: 'Anzeige fuer die Bar');
    await abbauen(tester);
  });

  test('Einstellungen der frueheren App werden einmal uebernommen', () async {
    TestDefaultBinaryMessengerBinding.instance.defaultBinaryMessenger.setMockMethodCallHandler(
      const MethodChannel('ch.fwvraura.kitchendisplay/geraet'),
      (c) async => c.method == 'alteEinstellungen'
          ? {
              'token': token,
              'station': 'bar',
              'server_url': null,
              'sound_enabled': false,
              'exit_code': '4711',
              'as_home': true,
            }
          : null,
    );
    SharedPreferences.setMockInitialValues({});
    final e = await Einstellungen.laden(const Geraet());
    expect(e.token, token);
    expect(e.station, Station.bar);
    expect(e.serverUrl, cloudUrl);
    expect(e.ton, isFalse);
    expect(e.code, '4711');
    expect(e.alsStart, isTrue);

    // Zweiter Start: nichts mehr uebernehmen (Abmelden bleibt abgemeldet)
    await e.tokenSetzen(null);
    final e2 = await Einstellungen.laden(const Geraet());
    expect(e2.token, isNull);
  });
}
