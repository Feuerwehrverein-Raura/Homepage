// Push-Mitteilungen an den Vorstand (docker/backend-members/src/vorstand-melder.js):
// Antippen fuehrt in den Reiter Vorstand und den passenden Bereich; der
// Schalter "Vorstand-Mitteilungen" erscheint nur fuer den Vorstand.
// Nachgebautes Backend, kein Netz, kein Firebase.

import 'dart:convert';

import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:fwv_core/fwv_core.dart';
import 'package:fwv_mitglieder/dienste.dart';
import 'package:fwv_mitglieder/einstellungen/benachrichtigungen_screen.dart';
import 'package:fwv_mitglieder/einstellungen/kontakte_abgleich.dart';
import 'package:fwv_mitglieder/main.dart';
import 'package:fwv_mitglieder/push/push_dienst.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:material_ui/material_ui.dart';

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
  group('PushZiel.ausDaten', () {
    test('Vorstand-Mitteilungen mit Bereich und Kennung', () {
      expect(
        PushZiel.ausDaten({
          'notificationType': 'vorstand_antrag',
          'bereich': 'antraege',
          'id': '12',
        }),
        const VorstandZiel(bereich: 'antraege', id: '12'),
      );
      expect(
        PushZiel.ausDaten({'notificationType': 'vorstand_anmeldung', 'bereich': 'anlaesse'}),
        const VorstandZiel(bereich: 'anlaesse'),
      );
      // Ohne Bereich wenigstens in den Reiter Vorstand.
      expect(
        PushZiel.ausDaten({'notificationType': 'vorstand_austritt'}),
        const VorstandZiel(bereich: 'antraege'),
      );
    });

    test('andere Mitteilungen fuehren nicht in den Vorstand', () {
      expect(PushZiel.ausDaten({'notificationType': 'event_update', 'bereich': 'x'}), isNull);
      expect(PushZiel.ausDaten({}), isNull);
      expect(istVorstandMitteilung({'notificationType': 'vorstand_loeschung'}), isTrue);
      expect(istVorstandMitteilung({'notificationType': 'general'}), isFalse);
    });
  });

  late Map<String, Object?> gespeichert;
  late final client = MockClient((a) async {
    http.Response json(Object? o, [int status = 200]) =>
        http.Response.bytes(utf8.encode(jsonEncode(o)), status);
    final weg = '${a.method} ${a.url.path}';
    return switch (weg) {
      'GET /events' => json([]),
      'GET /events/organized-by-me' => json([]),
      'GET /events/organisator-uebersicht' => json({'zugang': 'vorstand', 'anlaesse': []}),
      'GET /events/proposals' => json([]),
      'GET /member-registrations' => json([]),
      'GET /members/me' => json({'id': 'a1', 'vorname': 'Erika', 'nachname': 'Muster'}),
      'GET /members/me/notifications' => json([
        {'notification_type': 'vorstand_mitteilungen', 'enabled': true},
      ]),
      'PUT /members/me/notifications' => () {
        gespeichert = jsonDecode(a.body) as Map<String, Object?>;
        return json(gespeichert['preferences']);
      }(),
      _ => json({'error': 'nicht gefunden'}, 404),
    };
  });

  Future<Dienste> dienste(WidgetTester tester, List<String> gruppen) async {
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
    return Dienste(
      sitzung: SitzungsVerwaltung(speicher: speicher, http: client),
      authentik: _KeinBrowser(),
      uebernahme: AltdatenUebernahme(quelle: _KeineAltdaten(), speicher: speicher),
      speicher: roh,
      appVersion: () async => '1.0.0 (1)',
      plattform: Plattform.ios,
      roterSchopfTakt: null,
    );
  }

  Finder reiter(String name) =>
      find.descendant(of: find.byType(NavigationBar), matching: find.text(name));

  int vorstandBereich(WidgetTester tester) {
    final leiste = find.ancestor(
      of: find.widgetWithText(Tab, 'Anträge'),
      matching: find.byType(TabBar),
    );
    return tester.widget<TabBar>(leiste).controller!.index;
  }

  testWidgets('Antippen bei offener App: Reiter Vorstand, Bereich Antraege', (tester) async {
    final d = await dienste(tester, ['Mitglieder', 'Vorstand']);
    await tester.pumpWidget(FwvApp(dienste: d));
    await tester.pumpAndSettle();
    expect(find.widgetWithText(Tab, 'Anträge'), findsNothing, reason: 'noch auf Anlaesse');

    d.pushAngetippt({'notificationType': 'vorstand_antrag', 'bereich': 'antraege', 'id': '7'});
    await tester.pumpAndSettle();
    expect(vorstandBereich(tester), 1);
    expect(d.pushZiel.value, isNull, reason: 'abgearbeitet');

    d.pushAngetippt({'notificationType': 'vorstand_austritt', 'bereich': 'mitglieder'});
    await tester.pumpAndSettle();
    expect(vorstandBereich(tester), 2);

    // Andere Mitteilungen (ohne Anlass, ohne Text) aendern nichts.
    d.pushAngetippt({'notificationType': 'event_update'});
    await tester.pumpAndSettle();
    expect(vorstandBereich(tester), 2);
    expect(tester.takeException(), isNull);
  });

  testWidgets('Mit einer Mitteilung gestartet: gleich im richtigen Bereich', (tester) async {
    final d = await dienste(tester, ['Vorstand']);
    d.pushAngetippt({'notificationType': 'vorstand_anmeldung', 'bereich': 'anlaesse', 'id': 'e1'});
    d.pushAngetippt({'notificationType': 'vorstand_loeschung', 'bereich': 'mitglieder'});
    await tester.pumpWidget(FwvApp(dienste: d));
    await tester.pumpAndSettle();
    expect(vorstandBereich(tester), 2);
    expect(d.pushZiel.value, isNull);
  });

  testWidgets('Kein Vorstand (mehr): Antippen bleibt ohne Folgen', (tester) async {
    final d = await dienste(tester, ['Mitglieder']);
    await tester.pumpWidget(FwvApp(dienste: d));
    await tester.pumpAndSettle();
    d.pushAngetippt({'notificationType': 'vorstand_antrag', 'bereich': 'antraege'});
    await tester.pumpAndSettle();
    expect(reiter('Vorstand'), findsNothing);
    expect(d.pushZiel.value, isNull);
  });

  Future<void> einstellungen(WidgetTester tester, Dienste d) async {
    await d.sitzung.laden();
    await tester.pumpWidget(MaterialApp(home: BenachrichtigungenScreen(dienste: d)));
    await tester.pumpAndSettle();
  }

  testWidgets('Schalter Vorstand-Mitteilungen nur fuer den Vorstand', (tester) async {
    final d = await dienste(tester, ['Vorstand']);
    await einstellungen(tester, d);
    final schalter = find.byKey(const Key('art-vorstand_mitteilungen'));
    expect(schalter, findsOneWidget);
    expect(tester.widget<SwitchListTile>(schalter).value, isTrue);

    await tester.tap(schalter);
    await tester.pumpAndSettle();
    final arten = {
      for (final p in (gespeichert['preferences'] as List).cast<Map>())
        p['notification_type']: p['enabled'],
    };
    expect(arten['vorstand_mitteilungen'], isFalse);
    expect(arten['general'], isTrue, reason: 'die anderen Arten gehen mit');
  });

  testWidgets('Mitglied ohne Vorstand sieht den Schalter nicht', (tester) async {
    final d = await dienste(tester, ['Mitglieder']);
    await einstellungen(tester, d);
    expect(find.byKey(const Key('art-vorstand_mitteilungen')), findsNothing);
    expect(find.byKey(const Key('art-general')), findsOneWidget);
  });
}
