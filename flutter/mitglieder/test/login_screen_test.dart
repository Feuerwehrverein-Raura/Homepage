// Login-Screen und Startseite mit nachgebautem Backend, Browser und Scanner —
// keine echten Konten, kein Netz.

import 'dart:convert';

import 'package:flutter_test/flutter_test.dart';
import 'package:fwv_core/fwv_core.dart';
import 'package:fwv_mitglieder/anmeldung/authentik_anmeldung.dart';
import 'package:fwv_mitglieder/dienste.dart';
import 'package:fwv_mitglieder/einstellungen/einstellungen_tab.dart';
import 'package:fwv_mitglieder/main.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:material_ui/material_ui.dart';

class _FalscherBrowser implements AuthentikAnmeldung {
  AuthentikTokens? ergebnis;
  int aufrufe = 0;

  @override
  Future<AuthentikTokens?> anmelden() async {
    aufrufe++;
    return ergebnis;
  }
}

class _KeineAltdaten implements AltdatenQuelle {
  @override
  Future<Map<String, String>?> lesen() async => null;

  @override
  Future<void> loeschen() async {}
}

String _jwt(Map<String, Object> angaben) {
  String teil(Map<String, Object> m) =>
      base64Url.encode(utf8.encode(jsonEncode(m))).replaceAll('=', '');
  return '${teil({'alg': 'none'})}.${teil(angaben)}.sig';
}

void main() {
  late SpeicherImArbeitsspeicher roh;
  late _FalscherBrowser browser;
  late List<http.Request> anfragen;
  late String? gescannt;

  Dienste dienste() {
    final speicher = SitzungsSpeicher(roh);
    return Dienste(
      sitzung: SitzungsVerwaltung(
        speicher: speicher,
        http: MockClient((a) async {
          anfragen.add(a);
          switch (a.url.path) {
            case '/events/login':
              final b = jsonDecode(a.body) as Map;
              if (b['password'] != 'richtig') {
                return http.Response('{"error":"Ungueltige Zugangsdaten"}', 401);
              }
              return http.Response(
                jsonEncode({
                  'success': true,
                  'token': 'org',
                  'event': {'id': 5, 'title': 'Grillfest', 'organizer_name': 'Hans Organisator'},
                }),
                200,
              );
            case '/members/me':
              return http.Response('{"error":"Token abgelaufen"}', 401);
            case '/auth/member/qr-login':
              return http.Response(
                jsonEncode({
                  'success': true,
                  'token': 'qr-jwt',
                  'user': {'name': 'Erika QR'},
                }),
                200,
              );
          }
          return http.Response('{}', 404);
        }),
      ),
      authentik: browser,
      uebernahme: AltdatenUebernahme(quelle: _KeineAltdaten(), speicher: speicher),
      qrScannen: () async => gescannt,
      appVersion: () async => '1.0.0 (1)',
    );
  }

  /// Nach der Anmeldung steht der Name in den Einstellungen.
  Future<void> zuDenEinstellungen(WidgetTester tester) async {
    await tester.tap(find.text('Mehr'));
    await tester.pumpAndSettle();
  }

  Future<void> starten(WidgetTester tester) async {
    await tester.pumpWidget(FwvApp(dienste: dienste()));
    await tester.pumpAndSettle();
  }

  setUp(() {
    roh = SpeicherImArbeitsspeicher();
    browser = _FalscherBrowser();
    anfragen = [];
    gescannt = null;
  });

  testWidgets('Login-Screen zeigt Reiter und Organisator-Zugang', (tester) async {
    await starten(tester);

    expect(find.text('Mitglied'), findsOneWidget);
    expect(find.text('QR-Code'), findsOneWidget);
    expect(find.text('Mit Vereinskonto anmelden'), findsOneWidget);
    expect(find.text('Passwort vergessen?'), findsOneWidget);
    expect(find.text('Externer Organisator? Hier anmelden'), findsOneWidget);
  });

  testWidgets('Authentik-Anmeldung, Hauptseite, Abmelden', (tester) async {
    browser.ergebnis = AuthentikTokens(
      accessToken: 'a',
      refreshToken: 'r',
      idToken: _jwt({'name': 'Erika Muster', 'email': 'e@x.ch'}),
    );
    await starten(tester);

    await tester.tap(find.text('Mit Vereinskonto anmelden'));
    await tester.pumpAndSettle();

    // Reiter eines Mitglieds; "Organisator" nur, wenn es Anlaesse gibt.
    expect(find.text('Anlässe'), findsWidgets);
    expect(find.text('Profil'), findsOneWidget);
    expect(find.text('Organisator'), findsNothing);
    await zuDenEinstellungen(tester);
    expect(find.text('Angemeldet als'), findsOneWidget);
    expect(find.text('Erika Muster'), findsOneWidget);
    expect(roh.werte['refresh_token'], 'r');

    await tester.scrollUntilVisible(
      find.text('Abmelden'),
      300,
      scrollable: find
          .descendant(of: find.byType(EinstellungenTab), matching: find.byType(Scrollable))
          .first,
    );
    await tester.tap(find.text('Abmelden'));
    await tester.pumpAndSettle();

    expect(find.text('Mit Vereinskonto anmelden'), findsOneWidget);
    expect(roh.werte.containsKey('auth_token'), isFalse);
  });

  testWidgets('Abbruch im Browser: keine Fehlermeldung', (tester) async {
    await starten(tester);
    await tester.tap(find.text('Mit Vereinskonto anmelden'));
    await tester.pumpAndSettle();
    expect(browser.aufrufe, 1);
    expect(find.byKey(const Key('login-meldung')), findsNothing);
  });

  testWidgets('QR-Code scannen meldet an', (tester) async {
    gescannt = '{"v":1,"type":"fwv-member-login","token":"fwv-member-123"}';
    await starten(tester);

    await tester.tap(find.text('QR-Code'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('QR-Code scannen'));
    await tester.pumpAndSettle();

    await zuDenEinstellungen(tester);
    expect(find.text('Erika QR'), findsOneWidget);
    expect(roh.werte['qr_token'], 'fwv-member-123');
  });

  testWidgets('fremder QR-Code wird abgelehnt', (tester) async {
    gescannt = 'https://example.com';
    await starten(tester);
    await tester.tap(find.text('QR-Code'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('QR-Code scannen'));
    await tester.pumpAndSettle();

    expect(find.text('Das ist kein Login-Code des Vereins.'), findsOneWidget);
    expect(anfragen, isEmpty);
  });

  testWidgets('externer Organisator: falsches, dann richtiges Passwort', (tester) async {
    await starten(tester);
    await tester.ensureVisible(find.text('Externer Organisator? Hier anmelden'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Externer Organisator? Hier anmelden'));
    await tester.pumpAndSettle();

    await tester.enterText(find.widgetWithText(TextField, 'E-Mail'), 'fest@x.ch');
    await tester.enterText(find.widgetWithText(TextField, 'Passwort'), 'falsch');
    await tester.tap(find.widgetWithText(FilledButton, 'Anmelden'));
    await tester.pumpAndSettle();
    expect(find.text('Ungueltige Zugangsdaten'), findsOneWidget);

    await tester.enterText(find.widgetWithText(TextField, 'Passwort'), 'richtig');
    await tester.tap(find.widgetWithText(FilledButton, 'Anmelden'));
    await tester.pumpAndSettle();

    // Externe Organisatoren starten im Reiter "Organisator", ohne Profil.
    expect(find.text('Organisator'), findsWidgets);
    expect(find.text('Profil'), findsNothing);
    await zuDenEinstellungen(tester);
    expect(find.text('Hans Organisator'), findsOneWidget);
    expect(find.text('Angemeldet als Externer Organisator'), findsOneWidget);
    expect(find.text('Benachrichtigungen'), findsNothing);
    expect(roh.werte['account_type'], 'organizer');
    expect(roh.werte['event_id'], '5');
  });

  testWidgets('Passwort-Reset prueft Laenge und Wiederholung', (tester) async {
    await starten(tester);
    await tester.tap(find.text('Passwort vergessen?'));
    await tester.pumpAndSettle();

    await tester.enterText(find.widgetWithText(TextField, 'Code aus der E-Mail'), '123456');
    await tester.enterText(find.widgetWithText(TextField, 'Neues Passwort'), 'kurz');
    await tester.enterText(find.widgetWithText(TextField, 'Wiederholen'), 'kurz');
    await tester.tap(find.text('Passwort setzen'));
    await tester.pump();
    expect(find.text('Das Passwort muss mindestens 8 Zeichen haben.'), findsOneWidget);

    await tester.enterText(find.widgetWithText(TextField, 'Neues Passwort'), 'langesPasswort');
    await tester.enterText(find.widgetWithText(TextField, 'Wiederholen'), 'anderesPasswort');
    await tester.tap(find.text('Passwort setzen'));
    await tester.pump();
    expect(find.text('Die Wiederholung stimmt nicht überein.'), findsOneWidget);
    expect(anfragen, isEmpty);
  });

  testWidgets('abgelaufene Sitzung fuehrt zum Login mit Hinweis', (tester) async {
    // Angemeldet mit einem Token, das das Backend nicht mehr annimmt, ohne
    // Refresh-Token und ohne QR-Code.
    await SitzungsSpeicher(roh).speichern(
      const Sitzung(accessToken: 'abgelaufen', kontotyp: Kontotyp.mitglied, name: 'Erika'),
    );
    final d = dienste();
    await tester.pumpWidget(FwvApp(dienste: d));
    await tester.pumpAndSettle();
    await zuDenEinstellungen(tester);
    expect(find.text('Erika'), findsOneWidget);

    await tester.runAsync(() async {
      await expectLater(d.sitzung.api.get('members/me'), throwsA(isA<SitzungAbgelaufen>()));
    });
    await tester.pumpAndSettle();

    expect(find.text('Sitzung abgelaufen — bitte neu anmelden.'), findsOneWidget);
    expect(find.text('Mit Vereinskonto anmelden'), findsOneWidget);
  });

  testWidgets('Farben wie die alte App: Rot, rote Leiste, kein dunkler Modus', (tester) async {
    browser.ergebnis = AuthentikTokens(
      accessToken: 'a',
      refreshToken: 'r',
      idToken: _jwt({'name': 'Erika Muster', 'email': 'e@x.ch'}),
    );
    await starten(tester);

    final app = tester.widget<MaterialApp>(find.byType(MaterialApp));
    expect(app.theme!.colorScheme.primary, const Color(0xFFB91C1C));
    expect(app.themeMode, ThemeMode.light);
    expect(app.darkTheme, isNull);
    // Login auf dunklem Rot wie activity_login.xml.
    expect(
      tester.widget<Scaffold>(find.byType(Scaffold).first).backgroundColor,
      const Color(0xFF7F1D1D),
    );

    await tester.tap(find.text('Mit Vereinskonto anmelden'));
    await tester.pumpAndSettle();

    // Die Leiste oben ist rot mit weisser Schrift.
    final leiste = find.byType(AppBar).first;
    final flaeche = tester.widget<Material>(
      find.descendant(of: leiste, matching: find.byType(Material)).first,
    );
    expect(flaeche.color, const Color(0xFFB91C1C));
    final titel = tester.widget<Text>(
      find.descendant(of: leiste, matching: find.byType(Text)).first,
    );
    expect(DefaultTextStyle.of(tester.element(find.byWidget(titel))).style.color, Colors.white);
  });
}
