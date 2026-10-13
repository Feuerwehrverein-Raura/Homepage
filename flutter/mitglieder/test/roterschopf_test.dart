// Reiter "Schopf": nur mit Authentik-Gruppe Roter Schopf, Vorstand oder
// admin; die Aufrufe gehen an api-members mit demselben Token. Nachgebautes
// Backend mit der Vertragsdatei aus docker/backend-members, kein Netz.

import 'dart:convert';
import 'dart:io';

import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:fwv_core/fwv_core.dart';
import 'package:fwv_mitglieder/anmeldung/authentik_anmeldung.dart';
import 'package:fwv_mitglieder/dienste.dart';
import 'package:fwv_mitglieder/einstellungen/kontakte_abgleich.dart';
import 'package:fwv_mitglieder/main.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:material_ui/material_ui.dart';

Map<String, dynamic> _vertrag([String name = 'roter-schopf-app.json']) {
  var dir = Directory.current;
  while (true) {
    final f = File('${dir.path}/docker/backend-members/test/fixtures/$name');
    if (f.existsSync()) return jsonDecode(f.readAsStringSync()) as Map<String, dynamic>;
    if (dir.parent.path == dir.path) throw StateError('$name nicht gefunden');
    dir = dir.parent;
  }
}

/// Unsigniertes JWT (die App prueft keine Signatur, das Backend schon).
String _jwt(Map<String, Object?> angaben) {
  String teil(Object o) => base64Url.encode(utf8.encode(jsonEncode(o))).replaceAll('=', '');
  return '${teil({'alg': 'RS256', 'typ': 'JWT'})}.${teil(angaben)}.signatur';
}

const _iss = 'https://auth.fwv-raura.ch/application/o/fwv-members-app/';

class _KeinBrowser implements AuthentikAnmeldung {
  @override
  Future<AuthentikTokens?> anmelden() async => null;
}

class _KeineAltdaten implements AltdatenQuelle {
  @override
  Future<Map<String, String>?> lesen() async => null;

  @override
  Future<void> loeschen() async {}
}

void main() {
  final vertrag = _vertrag();
  final zugangVertrag = _vertrag('schopf-zugang-app.json');
  late List<http.Request> anfragen;
  // Was GET /kiosk/roter-schopf/zugang antwortet: gruppe, schicht oder kein.
  var zugangFall = 'kein';
  // Nachtschicht der Vertragsdatei: Zugang bis 15.10.2026 01:00 UTC.
  var jetzt = DateTime.utc(2026, 10, 14, 21, 30);

  late final client = MockClient((a) async {
    anfragen.add(a);
    http.Response json(Object? o, [int status = 200]) =>
        http.Response.bytes(utf8.encode(jsonEncode(o)), status);
    return switch ('${a.method} ${a.url.path}') {
      'GET /kiosk/roter-schopf' => json(vertrag),
      'GET /kiosk/roter-schopf/zugang' => json(zugangVertrag[zugangFall]),
      'POST /kiosk/roter-schopf/licht' => json({'ok': true}),
      'GET /events' || 'GET /events/organized-by-me' => json([]),
      'GET /members/me' => json({'id': 'a1', 'vorname': 'Erika', 'nachname': 'Muster'}),
      _ => json({'error': 'nicht gefunden'}, 404),
    };
  });

  setUp(() {
    anfragen = [];
    zugangFall = 'kein';
    jetzt = DateTime.utc(2026, 10, 14, 21, 30);
  });

  late Dienste dienste;

  Future<void> starten(WidgetTester tester, Sitzung sitzung) async {
    tester.binding.defaultBinaryMessenger.setMockMethodCallHandler(
      const MethodChannel(KontakteAbgleich.kanalName),
      (_) async => throw MissingPluginException(),
    );
    tester.view.physicalSize = const Size(1080, 2400);
    tester.view.devicePixelRatio = 3;
    addTearDown(tester.view.reset);
    final roh = SpeicherImArbeitsspeicher();
    final speicher = SitzungsSpeicher(roh);
    await speicher.speichern(sitzung);
    final d = Dienste(
      sitzung: SitzungsVerwaltung(speicher: speicher, http: client),
      authentik: _KeinBrowser(),
      uebernahme: AltdatenUebernahme(quelle: _KeineAltdaten(), speicher: speicher),
      speicher: roh,
      appVersion: () async => '1.0.0 (1)',
      plattform: Plattform.ios,
      roterSchopfTakt: null,
      schopfPruefTakt: null,
      jetzt: () => jetzt,
    );
    dienste = d;
    await tester.pumpWidget(FwvApp(dienste: d));
    await tester.pumpAndSettle();
  }

  Sitzung mitGruppen(List<String> g) => Sitzung(
    accessToken: _jwt({'iss': _iss, 'sub': 'u1', 'groups': g}),
    refreshToken: 'r',
    kontotyp: Kontotyp.mitglied,
    name: 'Erika Muster',
  );

  Finder reiter(String text) =>
      find.descendant(of: find.byType(NavigationBar), matching: find.text(text));

  testWidgets('Gruppe Roter Schopf: Reiter Schopf, Zustand und Schalten mit demselben Token', (
    tester,
  ) async {
    final s = mitGruppen(['Mitglieder', 'Roter Schopf']);
    await starten(tester, s);
    expect(reiter('Schopf'), findsOneWidget);
    expect(
      anfragen.where((a) => a.url.path.startsWith('/kiosk/roter-schopf')),
      isEmpty,
      reason: 'erst beim Oeffnen',
    );

    await tester.tap(reiter('Schopf'));
    await tester.pumpAndSettle();
    expect(find.text('Spots'), findsOneWidget);
    await tester.tap(find.text('Messwerte'));
    await tester.pumpAndSettle();
    expect(find.text('Tiefkühlschrank Eis'), findsOneWidget);
    await tester.scrollUntilVisible(
      find.text('Heizkörper'),
      200,
      scrollable: find.byType(Scrollable).last,
    );
    expect(find.text('Heizkörper'), findsOneWidget);
    await tester.tap(find.text('Lampen'));
    await tester.pumpAndSettle();
    final a = anfragen.firstWhere((a) => a.url.path == '/kiosk/roter-schopf');
    expect(a.url.toString(), 'https://api.fwv-raura.ch/kiosk/roter-schopf');
    expect(a.headers['Authorization'], 'Bearer ${s.accessToken}');

    await tester.tap(find.text('Arbeitsleuchten'));
    await tester.pump();
    final p = anfragen.firstWhere((a) => a.method == 'POST');
    expect(p.url.path, '/kiosk/roter-schopf/licht');
    expect(jsonDecode(p.body), {'kennung': 'gruppe:arbeitsleuchten', 'an': true});
    await tester.pump(const Duration(seconds: 5));
    await tester.pumpAndSettle();
  });

  testWidgets('Vorstand und admin (Gross-/Kleinschreibung egal) sehen den Schopf', (tester) async {
    await starten(tester, mitGruppen(['vorstand']));
    expect(reiter('Schopf'), findsOneWidget);
  });

  testWidgets('Gross-/Kleinschreibung der Gruppe egal', (tester) async {
    await starten(tester, mitGruppen(['roter schopf']));
    expect(reiter('Schopf'), findsOneWidget);
  });

  testWidgets('Ohne Gruppe kein Reiter', (tester) async {
    await starten(tester, mitGruppen(['Mitglieder', 'Lager']));
    expect(reiter('Schopf'), findsNothing);
    expect(reiter('Lager'), findsOneWidget);
  });

  testWidgets('QR-Login mit Gruppe Roter Schopf: Reiter wie ueber Authentik', (tester) async {
    await starten(
      tester,
      Sitzung(
        accessToken: _jwt({
          'type': 'member',
          'sub': 'm1',
          'email': 'e@x.ch',
          'groups': ['Roter Schopf'],
        }),
        qrToken: 'qr',
        kontotyp: Kontotyp.mitglied,
      ),
    );
    expect(reiter('Schopf'), findsOneWidget);
  });

  testWidgets('Externer Organisator: nie Schopf, auch mit Gruppe im Token', (tester) async {
    await starten(
      tester,
      Sitzung(
        accessToken: _jwt({
          'iss': _iss,
          'groups': ['Roter Schopf'],
        }),
        kontotyp: Kontotyp.organisator,
        eventId: 'e1',
      ),
    );
    expect(reiter('Schopf'), findsNothing);
  });

  testWidgets('Ohne Gruppe, aber mit Schicht: Reiter mit Hinweis, nach dem Ende wieder weg', (
    tester,
  ) async {
    zugangFall = 'schicht';
    await starten(tester, mitGruppen(['Mitglieder']));
    expect(reiter('Schopf'), findsOneWidget);
    expect(anfragen.where((a) => a.url.path == '/kiosk/roter-schopf/zugang'), hasLength(1));

    await tester.tap(reiter('Schopf'));
    await tester.pumpAndSettle();
    final bis = DateTime.utc(2026, 10, 15, 1).toLocal();
    final uhr = '${bis.hour.toString().padLeft(2, '0')}:${bis.minute.toString().padLeft(2, '0')}';
    expect(find.text('Für deine Schicht «Nachtschicht» (Chilbi 2026) bis $uhr'), findsOneWidget);
    expect(find.text('Spots'), findsOneWidget);

    // Nach dem Ende: der Server sagt nein, der Reiter verschwindet.
    jetzt = DateTime.utc(2026, 10, 15, 1, 1);
    zugangFall = 'kein';
    await dienste.schopfPruefung.pruefen();
    await tester.pumpAndSettle();
    expect(reiter('Schopf'), findsNothing);
  });

  testWidgets('Ohne Gruppe und ohne Schicht: kein Reiter; mit Gruppe keine Nachfrage', (
    tester,
  ) async {
    await starten(tester, mitGruppen(['Mitglieder']));
    expect(reiter('Schopf'), findsNothing);
    expect(anfragen.where((a) => a.url.path == '/kiosk/roter-schopf/zugang'), hasLength(1));
  });

  testWidgets('Mit Gruppe fragt die App nicht nach der Schicht', (tester) async {
    await starten(tester, mitGruppen(['Roter Schopf']));
    expect(anfragen.where((a) => a.url.path == '/kiosk/roter-schopf/zugang'), isEmpty);
  });

  testWidgets('Schopf buendelt alles: Musik-Reiter und Bildschirm; Mehr ohne Doppel', (
    tester,
  ) async {
    await starten(tester, mitGruppen(['Roter Schopf']));
    await tester.tap(reiter('Schopf'));
    await tester.pumpAndSettle();
    expect(find.widgetWithText(Tab, 'Musik'), findsOneWidget);
    expect(find.byTooltip('Bildschirm Roter Schopf'), findsOneWidget);

    // Unter "Mehr": Musik (Hoeren, Playlists) bleibt, der Bildschirm nicht.
    await tester.tap(reiter('Mehr'));
    await tester.pumpAndSettle();
    expect(find.widgetWithText(ListTile, 'Musik'), findsOneWidget);
    expect(find.text('Bildschirm Roter Schopf'), findsNothing);
  });

  testWidgets('Ohne Schopf-Reiter: Bildschirm bleibt unter Mehr', (tester) async {
    await starten(tester, mitGruppen(['Mitglieder']));
    await tester.tap(reiter('Mehr'));
    await tester.pumpAndSettle();
    await tester.scrollUntilVisible(
      find.text('Bildschirm Roter Schopf'),
      200,
      scrollable: find.byType(Scrollable).last,
    );
    expect(find.text('Bildschirm Roter Schopf'), findsOneWidget);
  });
}
