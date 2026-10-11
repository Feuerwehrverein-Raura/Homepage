// Reiter "Lager": nur mit Authentik-Gruppe Lager, Vorstand oder admin; die
// Aufrufe gehen an die Inventar-API mit demselben Token. Nachgebautes
// Backend (Events + Inventar mit der Vertragsdatei aus fwv_lager), keine
// Kamera, kein Netz.

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

Map<String, dynamic> _lagerVertrag([String name = 'inventar-api.json']) {
  var dir = Directory.current;
  while (true) {
    final f = File('${dir.path}/flutter/fwv_lager/test/fixtures/$name');
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
  final vertrag = _lagerVertrag();
  final ausleihe = _lagerVertrag('ausleihe-api.json');
  late List<http.Request> anfragen;

  late final client = MockClient((a) async {
    anfragen.add(a);
    http.Response json(Object? o, [int status = 200]) =>
        http.Response.bytes(utf8.encode(jsonEncode(o)), status);
    if (a.url.host == 'inventar.fwv-raura.ch') {
      final items = (vertrag['items'] as List).cast<Map<String, dynamic>>();
      return switch ('${a.method} ${a.url.path}') {
        'GET /api/items' => json(items),
        'GET /api/items/1' => json(vertrag['item']),
        'GET /api/items/2' => json(items.firstWhere((i) => i['id'] == 2)),
        'GET /api/transactions' => json(vertrag['transactions']),
        'GET /api/barcode/lookup/FWV000002' => json(vertrag['lookup_lokal']),
        'GET /api/locations/overview' => json(vertrag['locations_overview']),
        'GET /api/reports/low-stock' => json(vertrag['low_stock']),
        'GET /api/ausleihe/meine' => json(ausleihe['meine']),
        'GET /api/ausleihe/1' => json(ausleihe['ausleihe_neu']),
        'GET /api/ausleihe' => json(
          a.url.queryParameters['filter'] == 'kommend' ? [ausleihe['ausleihe_extern']] : [],
        ),
        _ => json({'error': 'nicht gefunden'}, 404),
      };
    }
    return switch ('${a.method} ${a.url.path}') {
      'GET /events' || 'GET /events/organized-by-me' => json([]),
      'GET /members/me' => json({'id': 'a1', 'vorname': 'Erika', 'nachname': 'Muster'}),
      _ => json({'error': 'nicht gefunden'}, 404),
    };
  });

  setUp(() => anfragen = []);

  Future<void> starten(WidgetTester tester, Sitzung sitzung, {List<String>? scans}) async {
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
      barcodeScannen: (_) async => (scans == null || scans.isEmpty) ? null : scans.removeAt(0),
    );
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

  testWidgets('Gruppe Lager: Reiter Lager, Artikel aus der Inventar-API mit demselben Token', (
    tester,
  ) async {
    final s = mitGruppen(['Mitglieder', 'Lager']);
    await starten(tester, s, scans: ['https://inventar.fwv-raura.ch/item/FWV000002']);
    expect(reiter('Lager'), findsOneWidget);
    expect(
      anfragen.where((a) => a.url.host == 'inventar.fwv-raura.ch'),
      isEmpty,
      reason: 'erst beim Oeffnen',
    );

    await tester.tap(reiter('Lager'));
    await tester.pumpAndSettle();
    expect(find.text('Mineral 1.5l'), findsOneWidget);
    final a = anfragen.firstWhere((a) => a.url.host == 'inventar.fwv-raura.ch');
    expect(a.url.toString(), 'https://inventar.fwv-raura.ch/api/items');
    expect(a.headers['Authorization'], 'Bearer ${s.accessToken}');

    // Scannen: QR-Etikett -> Artikel.
    await tester.tap(find.text('Scannen'));
    await tester.pumpAndSettle();
    expect(find.widgetWithText(AppBar, 'Teller'), findsOneWidget);
    expect(find.text('50 Stück'), findsOneWidget);
  });

  testWidgets('Vorstand und admin (Gross-/Kleinschreibung egal) sehen das Lager', (tester) async {
    await starten(tester, mitGruppen(['vorstand']));
    expect(reiter('Lager'), findsOneWidget);
  });

  testWidgets('Ohne Lager-Gruppe kein Reiter', (tester) async {
    await starten(tester, mitGruppen(['Mitglieder']));
    expect(reiter('Lager'), findsNothing);
    expect(reiter('Profil'), findsOneWidget);
  });

  Sitzung qrMitGruppen(List<String> g) => Sitzung(
    accessToken: _jwt({'type': 'member', 'sub': 'm1', 'email': 'e@x.ch', 'groups': g}),
    qrToken: 'qr',
    kontotyp: Kontotyp.mitglied,
  );

  testWidgets('QR-Login mit Gruppe Lager: Lager wie ueber Authentik', (tester) async {
    final s = qrMitGruppen(['Mitglieder', 'Lager']);
    await starten(tester, s);
    expect(reiter('Lager'), findsOneWidget);
    await tester.tap(reiter('Lager'));
    await tester.pumpAndSettle();
    expect(find.text('Mineral 1.5l'), findsOneWidget);
    final a = anfragen.firstWhere((a) => a.url.host == 'inventar.fwv-raura.ch');
    expect(a.headers['Authorization'], 'Bearer ${s.accessToken}');
  });

  testWidgets('QR-Login ohne Lager-Gruppe: kein Reiter', (tester) async {
    await starten(tester, qrMitGruppen(['Mitglieder']));
    expect(reiter('Lager'), findsNothing);
  });

  testWidgets('Externer Organisator: nie Lager, auch mit Gruppen im Token', (tester) async {
    await starten(
      tester,
      Sitzung(
        accessToken: _jwt({
          'iss': _iss,
          'groups': ['Lager'],
        }),
        kontotyp: Kontotyp.organisator,
        eventId: 'e1',
      ),
    );
    expect(reiter('Lager'), findsNothing);
  });

  group('Ausleihe', () {
    Future<void> profil(WidgetTester tester) async {
      await tester.tap(reiter('Profil'));
      await tester.pumpAndSettle();
      await tester.scrollUntilVisible(
        find.text('Material ausleihen'),
        200,
        scrollable: find.byType(Scrollable).last,
      );
    }

    testWidgets('Jedes Mitglied (ohne Lager-Gruppe): Meine Ausleihen aus der Inventar-API', (
      tester,
    ) async {
      final s = mitGruppen(['Mitglieder']);
      await starten(tester, s);
      await profil(tester);
      expect(find.byKey(const Key('ausleihe-hinweis')), findsNothing);
      await tester.tap(find.text('Meine Ausleihen'));
      await tester.pumpAndSettle();
      final a = anfragen.lastWhere((a) => a.url.host == 'inventar.fwv-raura.ch');
      expect(a.url.toString(), 'https://inventar.fwv-raura.ch/api/ausleihe/meine');
      expect(a.headers['Authorization'], 'Bearer ${s.accessToken}');
      expect(find.text('30 Stück Teller'), findsOneWidget);
      expect(find.text('Reserviert'), findsOneWidget);
      expect(
        find.byKey(const Key('ausleihen-neu')),
        findsOneWidget,
        reason: 'Ausleihen immer sichtbar',
      );

      await tester.tap(find.text('30 Stück Teller'));
      await tester.pumpAndSettle();
      expect(find.byKey(const Key('absagen')), findsOneWidget);
    });

    testWidgets('QR-Login: Ausleihe wie ueber Authentik, mit dem QR-Token', (tester) async {
      final s = Sitzung(
        accessToken: _jwt({'type': 'member', 'sub': 'm1', 'email': 'e@x.ch'}),
        qrToken: 'qr',
        kontotyp: Kontotyp.mitglied,
      );
      await starten(tester, s);
      await profil(tester);
      expect(find.byKey(const Key('ausleihe-hinweis')), findsNothing);
      expect(find.byKey(const Key('material-ausleihen')), findsOneWidget);
      await tester.tap(find.text('Meine Ausleihen'));
      await tester.pumpAndSettle();
      final a = anfragen.lastWhere((a) => a.url.host == 'inventar.fwv-raura.ch');
      expect(a.url.toString(), 'https://inventar.fwv-raura.ch/api/ausleihe/meine');
      expect(a.headers['Authorization'], 'Bearer ${s.accessToken}');
      expect(find.text('30 Stück Teller'), findsOneWidget);
    });

    testWidgets('Gruppe Lager: Ausleihen verwalten im Lager-Reiter', (tester) async {
      await starten(tester, mitGruppen(['Lager']));
      await tester.tap(reiter('Lager'));
      await tester.pumpAndSettle();
      await tester.tap(find.byTooltip('Ausleihen verwalten'));
      await tester.pumpAndSettle();
      expect(find.text('Hans Muster, Turnverein'), findsOneWidget);
      expect(
        anfragen.any(
          (a) => a.url.path == '/api/ausleihe' && a.url.queryParameters['filter'] == 'kommend',
        ),
        isTrue,
      );
      expect(find.byKey(const Key('ausleihe-extern')), findsOneWidget);
    });
  });
}
