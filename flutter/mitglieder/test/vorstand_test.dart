// Reiter "Vorstand": Vorstandsmitglieder sehen ihn an Stelle von
// "Organisator" (auch wenn sie selbst Anlaesse organisieren); alle anderen
// Organisatoren behalten "Organisator". Nachgebautes Backend, kein Netz.

import 'dart:convert';

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
  late final client = MockClient((a) async {
    http.Response json(Object? o, [int status = 200]) =>
        http.Response.bytes(utf8.encode(jsonEncode(o)), status);
    final weg = '${a.method} ${a.url.path}';
    return switch (weg) {
      'GET /events' => json([]),
      // Erika organisiert einen Anlass - als Vorstand trotzdem kein Organisator-Reiter.
      'GET /events/organized-by-me' => json([
        {'id': 'e1', 'title': 'Chilbi 2026'},
      ]),
      'GET /events/organisator-uebersicht' => json({'zugang': 'vorstand', 'anlaesse': []}),
      'GET /events/proposals' => json([
        {'id': 'v1', 'title': 'Grillabend', 'status': 'proposed', 'organizer_name': 'Hans'},
      ]),
      'GET /members/me' => json({'id': 'a1', 'vorname': 'Erika', 'nachname': 'Muster'}),
      _ => json({'error': 'nicht gefunden'}, 404),
    };
  });

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
  }

  Finder reiter(String name) =>
      find.descendant(of: find.byType(NavigationBar), matching: find.text(name));

  testWidgets('Vorstand: Reiter Vorstand statt Organisator, mit Bereichen', (tester) async {
    await starten(tester, ['Mitglieder', 'Vorstand']);
    expect(reiter('Vorstand'), findsOneWidget);
    expect(reiter('Organisator'), findsNothing);

    await tester.tap(reiter('Vorstand'));
    await tester.pumpAndSettle();
    for (final b in ['Anlässe', 'Anträge', 'Mitglieder', 'Beiträge']) {
      expect(find.widgetWithText(Tab, b), findsOneWidget);
    }
    // Anlaesse mit dem Vorstand-Zugang: Vorschlaege und "Neuer Anlass".
    expect(find.text('Vorschläge (1)'), findsOneWidget);
    expect(find.text('Grillabend'), findsOneWidget);
    expect(find.text('Neuer Anlass'), findsOneWidget);
    expect(tester.takeException(), isNull);
  });

  testWidgets('admin gilt als Vorstand (Gross/klein egal)', (tester) async {
    await starten(tester, ['ADMIN']);
    expect(reiter('Vorstand'), findsOneWidget);
    expect(reiter('Organisator'), findsNothing);
  });

  testWidgets('Organisator ohne Vorstand: Organisator wie bisher', (tester) async {
    await starten(tester, ['Mitglieder']);
    expect(reiter('Organisator'), findsOneWidget);
    expect(reiter('Vorstand'), findsNothing);
  });
}
