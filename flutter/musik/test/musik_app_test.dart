// Die Desktop-App von aussen: anmelden, Musik sehen, abmelden - mit
// nachgebautem Browser, Backend und Player (kein Netz, kein Ton).

import 'dart:async';
import 'dart:convert';

import 'package:flutter_test/flutter_test.dart';
import 'package:fwv_core/fwv_core.dart';
import 'package:fwv_musik/dienste.dart';
import 'package:fwv_musik/main.dart';
import 'package:fwv_roterschopf/fwv_roterschopf.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:material_ui/material_ui.dart';

class _FalscherBrowser implements AuthentikAnmeldung {
  AuthentikTokens? ergebnis;
  AuthentikFehler? fehler;

  @override
  Future<AuthentikTokens?> anmelden() async {
    if (fehler != null) throw fehler!;
    return ergebnis;
  }
}

class _StilleWiedergabe implements Wiedergabe {
  final _stand = StreamController<WiedergabeStand>.broadcast();
  int gestoppt = 0;

  @override
  Future<void> laden(List<WiedergabeEintrag> liste, {int ab = 0}) async {}
  @override
  Future<void> spielen() async {}
  @override
  Future<void> pause() async {}
  @override
  Future<void> stoppen() async => gestoppt++;
  @override
  Future<void> weiter() async {}
  @override
  Future<void> zurueck() async {}
  @override
  Future<void> springen(Duration position) async {}
  @override
  Future<void> springeZu(int index) async {}
  @override
  Future<void> zufall(bool an) async {}
  @override
  List<int> get reihenfolge => const [];
  @override
  Stream<WiedergabeStand> get stand => _stand.stream;
  @override
  Stream<Duration> get position => const Stream.empty();
  @override
  Stream<Duration?> get dauer => const Stream.empty();
  @override
  Stream<WiedergabeFehler> get fehler => const Stream.empty();
  @override
  Stream<String?> get liveTitel => const Stream.empty();
  @override
  Future<void> nochmals(int index, Duration position) async {}
  @override
  Future<void> schliessen() async {}
}

class _Zugang extends MusikZugang {
  @override
  Future<List<PlaylistKurz>> playlists() async => [
    PlaylistKurz.ausJson({'id': 'p1', 'name': 'Chilbi Abend', 'anzahl': 2}),
  ];
  @override
  Future<Playlist> playlist(String id) async =>
      Playlist.ausJson({'id': id, 'name': 'Chilbi Abend'});
  @override
  Future<Bibliothek> bibliothek({String? suche}) async => const Bibliothek();
  @override
  Future<List<MusikTitel>> alleTitel() async => const [];
  @override
  Future<Abgleich> abgleichen(String text) async => const Abgleich();
  @override
  Future<String> speichern({String? id, required String name, required List<String> pfade}) async =>
      id ?? 'neu';
  @override
  Future<void> loeschen(String id) async {}
  @override
  Future<List<Uri>> hoerAdressen(List<String> pfade) async => const [];
  @override
  Future<void> fehlerMelden({
    String? pfad,
    String? quelle,
    String? code,
    String? meldung,
    int versuch = 1,
    Duration position = Duration.zero,
  }) async {}
  @override
  Future<List<Radiosender>> sender() async => const [];
  @override
  Future<void> senderAnlegen({required String name, required String url}) async {}
  @override
  Future<void> senderLoeschen(String id) async {}
  @override
  Future<LaptopZustand> laptop() async => LaptopZustand.ausJson({
    'musik': {'erreichbar': true, 'laeuft': true, 'titel': 'Louenesee', 'interpret': 'Span'},
  });
  @override
  Future<void> laptopBefehl(String aktion, [Map<String, Object?> daten = const {}]) async {}
}

/// Wie ein Authentik-Token (RS256, mit `iss`) - nur dann zaehlen die Gruppen.
String _jwt(Map<String, Object> angaben) {
  String teil(Map<String, Object> m) =>
      base64Url.encode(utf8.encode(jsonEncode(m))).replaceAll('=', '');
  return '${teil({'alg': 'RS256'})}.${teil({'iss': 'https://auth.fwv-raura.ch/', ...angaben})}.sig';
}

void main() {
  late _FalscherBrowser browser;
  late _StilleWiedergabe wiedergabe;

  Dienste dienste() => Dienste(
    sitzung: SitzungsVerwaltung(
      speicher: SitzungsSpeicher(SpeicherImArbeitsspeicher()),
      http: MockClient((_) async => http.Response('{}', 200)),
    ),
    authentik: browser,
    musikZugang: (_) => _Zugang(),
    wiedergabe: wiedergabe,
  );

  AuthentikTokens tokens({List<String> gruppen = const []}) => AuthentikTokens(
    accessToken: _jwt({'groups': gruppen}),
    refreshToken: 'r',
    idToken: _jwt({'name': 'Erika Muster', 'email': 'e@x.ch'}),
  );

  setUp(() {
    browser = _FalscherBrowser();
    wiedergabe = _StilleWiedergabe();
  });

  testWidgets('Anmelden zeigt Playlists und Radiosender, ohne Gruppe kein "Im Schopf"', (
    tester,
  ) async {
    browser.ergebnis = tokens();
    await tester.pumpWidget(MusikApp(dienste: dienste()));
    await tester.pumpAndSettle();

    expect(find.text('FWV Musik'), findsOneWidget);
    await tester.tap(find.byKey(const Key('anmelden')));
    await tester.pumpAndSettle();

    expect(find.text('Playlists'), findsOneWidget);
    expect(find.text('Radiosender'), findsOneWidget);
    expect(find.text('Chilbi Abend'), findsOneWidget);
    expect(find.text('Im Schopf'), findsNothing);
  });

  testWidgets('Gruppe Roter Schopf darf den Laptop fernbedienen', (tester) async {
    browser.ergebnis = tokens(gruppen: ['Roter Schopf']);
    await tester.pumpWidget(MusikApp(dienste: dienste()));
    await tester.pumpAndSettle();
    await tester.tap(find.byKey(const Key('anmelden')));
    await tester.pumpAndSettle();

    expect(find.text('Im Schopf'), findsOneWidget);
    // Der Reiter fragt den Laptop alle paar Sekunden ab - danach aufraeumen.
    await tester.pumpWidget(const SizedBox());
  });

  testWidgets('Abmelden fragt nach, beendet den Player und fuehrt zum Login', (tester) async {
    browser.ergebnis = tokens();
    final d = dienste();
    await tester.pumpWidget(MusikApp(dienste: d));
    await tester.pumpAndSettle();
    await tester.tap(find.byKey(const Key('anmelden')));
    await tester.pumpAndSettle();
    d.player; // der Player existiert, sobald etwas gespielt hat

    await tester.tap(find.byKey(const Key('abmelden')));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Abmelden').last);
    await tester.pumpAndSettle();

    expect(d.sitzung.angemeldet, isFalse);
    expect(wiedergabe.gestoppt, 1);
    expect(find.byKey(const Key('anmelden')), findsOneWidget);
  });

  testWidgets('Fehlgeschlagene Anmeldung zeigt eine Meldung', (tester) async {
    browser.fehler = const AuthentikFehler('Redirect URI Error');
    await tester.pumpWidget(MusikApp(dienste: dienste()));
    await tester.pumpAndSettle();
    await tester.tap(find.byKey(const Key('anmelden')));
    await tester.pumpAndSettle();

    expect(find.text('Anmeldung fehlgeschlagen. Bitte erneut versuchen.'), findsOneWidget);
  });
}
