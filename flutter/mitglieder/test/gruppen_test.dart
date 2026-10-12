// Einstellungen -> Gruppen verwalten: nur Vorstand und admin; Aufnehmen und
// Entfernen gehen an api-members. Nachgebautes Backend mit der Vertragsdatei
// docker/backend-members/test/fixtures/gruppen-app.json, kein Netz.

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

Map<String, dynamic> _vertrag() {
  const name = 'gruppen-app.json';
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
  late List<http.Request> anfragen;

  late final client = MockClient((a) async {
    anfragen.add(a);
    http.Response json(Object? o, [int status = 200]) =>
        http.Response.bytes(utf8.encode(jsonEncode(o)), status);
    final weg = '${a.method} ${a.url.path}';
    if (weg == 'GET /vorstand/gruppen') return json(vertrag['gruppen']);
    if (weg == 'GET /vorstand/gruppen/kandidaten') return json(vertrag['kandidaten']);
    if (weg.startsWith('POST /vorstand/gruppen/') || weg.startsWith('DELETE /vorstand/gruppen/')) {
      return json({'ok': true, 'gruppe': 'Roter Schopf'});
    }
    return switch (weg) {
      'GET /events' || 'GET /events/organized-by-me' => json([]),
      'GET /members/me' => json({'id': 'a1', 'vorname': 'Erika', 'nachname': 'Muster'}),
      _ => json({'error': 'nicht gefunden'}, 404),
    };
  });

  setUp(() => anfragen = []);

  Future<void> starten(WidgetTester tester, List<String> gruppen) async {
    tester.binding.defaultBinaryMessenger.setMockMethodCallHandler(
      const MethodChannel(KontakteAbgleich.kanalName),
      (_) async => throw MissingPluginException(),
    );
    tester.view.physicalSize = const Size(1080, 2400);
    tester.view.devicePixelRatio = 3;
    addTearDown(tester.view.reset);
    final roh = SpeicherImArbeitsspeicher();
    final speicher = SitzungsSpeicher(roh);
    await speicher.speichern(
      Sitzung(
        accessToken: _jwt({'iss': _iss, 'sub': 'u1', 'groups': gruppen}),
        refreshToken: 'r',
        kontotyp: Kontotyp.mitglied,
        name: 'Erika Muster',
      ),
    );
    final d = Dienste(
      sitzung: SitzungsVerwaltung(speicher: speicher, http: client),
      authentik: _KeinBrowser(),
      uebernahme: AltdatenUebernahme(quelle: _KeineAltdaten(), speicher: speicher),
      speicher: roh,
      appVersion: () async => '1.0.0 (1)',
      plattform: Plattform.ios,
      roterSchopfTakt: null,
    );
    await tester.pumpWidget(FwvApp(dienste: d));
    await tester.pumpAndSettle();
    await tester.tap(find.descendant(of: find.byType(NavigationBar), matching: find.text('Mehr')));
    await tester.pumpAndSettle();
  }

  testWidgets('Ohne Vorstand kein Eintrag', (tester) async {
    await starten(tester, ['Mitglieder', 'Roter Schopf']);
    expect(find.text('Gruppen verwalten'), findsNothing);
  });

  testWidgets('Vorstand: Gruppen sehen, aufnehmen und entfernen', (tester) async {
    await starten(tester, ['Mitglieder', 'vorstand']);
    await tester.tap(find.text('Gruppen verwalten'));
    await tester.pumpAndSettle();
    expect(find.text('Roter Schopf'), findsOneWidget);
    expect(find.text('Lager'), findsOneWidget);
    expect(find.text('admin'), findsNothing);
    expect(find.text('automatisch'), findsNWidgets(3));

    await tester.tap(find.text('Roter Schopf'));
    await tester.pumpAndSettle();
    expect(find.text('Hans Beispiel'), findsOneWidget);

    // Aufnehmen: suchen, Mitglied ohne Konto ist gesperrt, mit Konto waehlen.
    await tester.tap(find.text('Aufnehmen'));
    await tester.pumpAndSettle();
    await tester.enterText(find.byType(TextField), 'Mu');
    await tester.pump(const Duration(milliseconds: 400));
    await tester.pumpAndSettle();
    expect(find.text('kein Login-Konto – kann nicht aufgenommen werden'), findsOneWidget);
    final suche = anfragen.lastWhere((a) => a.url.path == '/vorstand/gruppen/kandidaten');
    expect(suche.url.queryParameters['suche'], 'Mu');
    await tester.tap(find.text('Erika Muster'));
    await tester.pumpAndSettle();
    final post = anfragen.firstWhere((a) => a.method == 'POST');
    expect(post.url.path, '/vorstand/gruppen/g-rs/mitglieder');
    expect(jsonDecode(post.body), {'member_id': 'm-7'});
    expect(find.text('Erika Muster in „Roter Schopf“ aufgenommen'), findsOneWidget);
    await tester.pump(const Duration(seconds: 5));
    await tester.pumpAndSettle();

    // Entfernen mit Rueckfrage.
    await tester.tap(find.byTooltip('Entfernen').first);
    await tester.pumpAndSettle();
    expect(find.text('Aus „Roter Schopf“ entfernen?'), findsOneWidget);
    await tester.tap(find.widgetWithText(FilledButton, 'Entfernen'));
    await tester.pumpAndSettle();
    final del = anfragen.firstWhere((a) => a.method == 'DELETE');
    expect(del.url.path, '/vorstand/gruppen/g-rs/mitglieder/m-8');
    await tester.pump(const Duration(seconds: 5));
    await tester.pumpAndSettle();
  });
}
