// Anmeldung auf dem Desktop (Loopback + PKCE): der Empfaenger der App ist
// echt (127.0.0.1), Authentik ein Nachbau - der "Browser" ruft die
// Rueckleitung selbst auf, Discovery und Token-Endpunkt beantwortet ein
// MockClient.

import 'dart:convert';
import 'dart:io';
import 'dart:math';

import 'package:crypto/crypto.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:fwv_core/fwv_core.dart';
import 'package:fwv_mitglieder/anmeldung/loopback_anmeldung.dart';
import 'package:fwv_mitglieder/desktop/desktop.dart';
import 'package:fwv_mitglieder/einstellungen/app_update.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';

const _discovery = {
  'authorization_endpoint': 'https://auth.example.org/application/o/authorize/',
  'token_endpoint': 'https://auth.example.org/application/o/token/',
};

String _idToken(Map<String, Object?> inhalt) {
  String teil(Object o) => base64Url.encode(utf8.encode(jsonEncode(o))).replaceAll('=', '');
  return '${teil({'alg': 'none'})}.${teil(inhalt)}.sig';
}

/// Ruft wie ein Browser eine Adresse auf und liefert Status und Text.
Future<(int, String)> _browserAufruf(Uri adresse) async {
  final client = HttpClient();
  try {
    final anfrage = await client.getUrl(adresse);
    final antwort = await anfrage.close();
    return (antwort.statusCode, await antwort.transform(utf8.decoder).join());
  } finally {
    client.close(force: true);
  }
}

void main() {
  group('PKCE und Hilfen', () {
    test('Challenge nach RFC 7636, Anhang B', () {
      expect(
        pkceChallenge('dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk'),
        'E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM',
      );
    });

    test('Zufallstext: Laenge und erlaubte Zeichen', () {
      final t = zufallsText(Random(1));
      expect(t, hasLength(64));
      expect(RegExp(r'^[A-Za-z0-9\-._~]+$').hasMatch(t), isTrue);
      expect(zufallsText(Random(2)), isNot(t));
    });

    test('Rueckleitung: Code bei passendem state', () {
      final uri = Uri.parse('http://127.0.0.1:5000/callback?code=abc&state=s1');
      expect(rueckleitungAuswerten(uri, erwarteterState: 's1'), 'abc');
    });

    test('Rueckleitung: fremder oder fehlender state wird abgelehnt', () {
      expect(
        () => rueckleitungAuswerten(
          Uri.parse('http://127.0.0.1:5000/callback?code=abc&state=boese'),
          erwarteterState: 's1',
        ),
        throwsA(isA<AuthentikFehler>()),
      );
      expect(
        () => rueckleitungAuswerten(Uri.parse('http://127.0.0.1:5000/callback?code=abc'), erwarteterState: 's1'),
        throwsA(isA<AuthentikFehler>()),
      );
    });

    test('Rueckleitung: abgelehnt = abgebrochen, andere Fehler werfen', () {
      expect(
        rueckleitungAuswerten(
          Uri.parse('http://127.0.0.1:1/callback?error=access_denied&state=s1'),
          erwarteterState: 's1',
        ),
        isNull,
      );
      expect(
        () => rueckleitungAuswerten(
          Uri.parse('http://127.0.0.1:1/callback?error=invalid_request&state=s1'),
          erwarteterState: 's1',
        ),
        throwsA(isA<AuthentikFehler>()),
      );
      expect(
        () => rueckleitungAuswerten(Uri.parse('http://127.0.0.1:1/callback?state=s1'), erwarteterState: 's1'),
        throwsA(isA<AuthentikFehler>()),
      );
    });

    test('nonce aus dem ID-Token', () {
      expect(nonceAusIdToken(_idToken({'nonce': 'n1'})), 'n1');
      expect(nonceAusIdToken('kaputt'), isNull);
    });
  });

  group('LoopbackAnmeldung', () {
    late List<http.Request> anfragen;
    late Map<String, Object?> tokenAntwort;
    late int tokenStatus;

    MockClient authentik() => MockClient((anfrage) async {
      anfragen.add(anfrage);
      if (anfrage.url.path.endsWith('openid-configuration')) {
        return http.Response(jsonEncode(_discovery), 200);
      }
      if (anfrage.url.toString() == OidcKonfiguration.mitgliederApp.tokenEndpunkt) {
        return http.Response(jsonEncode(tokenAntwort), tokenStatus);
      }
      return http.Response('nicht gefunden', 404);
    });

    setUp(() {
      anfragen = [];
      tokenStatus = 200;
      tokenAntwort = {'access_token': 'zugang', 'refresh_token': 'erneuern'};
    });

    test('ganzer Ablauf: Browser, Rueckleitung, Token-Tausch mit Verifier', () async {
      late Uri geoeffnet;
      String? seite;
      final anmeldung = LoopbackAnmeldung(
        client: authentik(),
        browserOeffnen: (adresse) async {
          geoeffnet = adresse;
          final p = adresse.queryParameters;
          tokenAntwort['id_token'] = _idToken({'nonce': p['nonce']});
          // Der Browser fragt auch nach dem Symbol - das zaehlt nicht.
          final redirect = Uri.parse(p['redirect_uri']!);
          final (favStatus, _) = await _browserAufruf(redirect.replace(path: '/favicon.ico'));
          expect(favStatus, 404);
          final (status, text) = await _browserAufruf(
            redirect.replace(queryParameters: {'code': 'c0de', 'state': p['state']}),
          );
          expect(status, 200);
          seite = text;
          return true;
        },
      );

      final tokens = await anmeldung.anmelden();

      expect(tokens, isNotNull);
      expect(tokens!.accessToken, 'zugang');
      expect(tokens.refreshToken, 'erneuern');
      expect(seite, contains('Anmeldung abgeschlossen'));

      // Anfrage an Authentik
      final p = geoeffnet.queryParameters;
      expect('${geoeffnet.origin}${geoeffnet.path}', _discovery['authorization_endpoint']);
      expect(p['response_type'], 'code');
      expect(p['client_id'], 'fwv-members-app');
      expect(p['code_challenge_method'], 'S256');
      expect(p['scope'], 'openid profile email offline_access');
      expect(RegExp(r'^http://127\.0\.0\.1:\d+/callback$').hasMatch(p['redirect_uri']!), isTrue);

      // Token-Tausch: Code, gleiche redirect_uri, Verifier passt zur Challenge
      final tausch = anfragen.last;
      expect(tausch.method, 'POST');
      final body = tausch.bodyFields;
      expect(body['grant_type'], 'authorization_code');
      expect(body['code'], 'c0de');
      expect(body['client_id'], 'fwv-members-app');
      expect(body['redirect_uri'], p['redirect_uri']);
      expect(body.containsKey('client_secret'), isFalse);
      final verifier = body['code_verifier']!;
      expect(base64Url.encode(sha256.convert(ascii.encode(verifier)).bytes).replaceAll('=', ''), p['code_challenge']);

      // Der Empfaenger ist danach zu.
      await expectLater(_browserAufruf(Uri.parse(p['redirect_uri']!)), throwsA(isA<SocketException>()));
    });

    test('fremder state: Fehler, kein Token-Tausch', () async {
      final anmeldung = LoopbackAnmeldung(
        client: authentik(),
        browserOeffnen: (adresse) async {
          final redirect = Uri.parse(adresse.queryParameters['redirect_uri']!);
          await _browserAufruf(redirect.replace(queryParameters: {'code': 'c', 'state': 'gefaelscht'}));
          return true;
        },
      );
      await expectLater(anmeldung.anmelden(), throwsA(isA<AuthentikFehler>()));
      expect(anfragen.where((a) => a.method == 'POST'), isEmpty);
    });

    test('falsche nonce im ID-Token wird abgelehnt', () async {
      tokenAntwort['id_token'] = _idToken({'nonce': 'andere'});
      final anmeldung = LoopbackAnmeldung(
        client: authentik(),
        browserOeffnen: (adresse) async {
          final p = adresse.queryParameters;
          await _browserAufruf(
            Uri.parse(p['redirect_uri']!).replace(queryParameters: {'code': 'c', 'state': p['state']}),
          );
          return true;
        },
      );
      await expectLater(anmeldung.anmelden(), throwsA(isA<AuthentikFehler>()));
    });

    test('Token-Endpunkt lehnt ab: Fehler mit Meldung', () async {
      tokenStatus = 400;
      tokenAntwort = {'error': 'invalid_grant', 'error_description': 'Code abgelaufen'};
      final anmeldung = LoopbackAnmeldung(
        client: authentik(),
        browserOeffnen: (adresse) async {
          final p = adresse.queryParameters;
          await _browserAufruf(
            Uri.parse(p['redirect_uri']!).replace(queryParameters: {'code': 'c', 'state': p['state']}),
          );
          return true;
        },
      );
      await expectLater(
        anmeldung.anmelden(),
        throwsA(isA<AuthentikFehler>().having((e) => e.meldung, 'meldung', contains('Code abgelaufen'))),
      );
    });

    test('Abbrechen: null, Empfaenger zu', () async {
      late Uri redirect;
      final anmeldung = LoopbackAnmeldung(
        client: authentik(),
        browserOeffnen: (adresse) async {
          redirect = Uri.parse(adresse.queryParameters['redirect_uri']!);
          return true;
        },
      );
      final laufend = anmeldung.anmelden();
      await Future<void>.delayed(const Duration(milliseconds: 50));
      anmeldung.abbrechen();
      expect(await laufend, isNull);
      await expectLater(_browserAufruf(redirect), throwsA(isA<SocketException>()));
    });

    test('Zeitlimit: null', () async {
      final anmeldung = LoopbackAnmeldung(
        client: authentik(),
        zeitlimit: const Duration(milliseconds: 100),
        browserOeffnen: (_) async => true,
      );
      expect(await anmeldung.anmelden(), isNull);
    });

    test('ohne Discovery: bekannte Adresse von Authentik', () async {
      late Uri geoeffnet;
      final anmeldung = LoopbackAnmeldung(
        client: MockClient((_) async => http.Response('', 503)),
        zeitlimit: const Duration(milliseconds: 50),
        browserOeffnen: (adresse) async {
          geoeffnet = adresse;
          return true;
        },
      );
      await anmeldung.anmelden();
      expect(geoeffnet.path, '/application/o/authorize/');
      expect(geoeffnet.host, 'auth.fwv-raura.ch');
    });

    test('Browser laesst sich nicht oeffnen: Fehler', () async {
      final anmeldung = LoopbackAnmeldung(client: authentik(), browserOeffnen: (_) async => false);
      await expectLater(anmeldung.anmelden(), throwsA(isA<AuthentikFehler>()));
    });
  });

  group('Desktop', () {
    test('freier Dateiname', () {
      final belegt = {'/d/Liste.pdf', '/d/Liste (2).pdf'};
      String pfad(String n) => freierDateiname('/d', n, vorhanden: belegt.contains).replaceAll(r'\', '/');
      expect(pfad('Liste.pdf'), '/d/Liste (3).pdf');
      expect(pfad('neu.ics'), '/d/neu.ics');
      expect(pfad('../../etc/passwd'), '/d/passwd');
      expect(pfad(''), '/d/Datei');
    });

    test('Update-Hinweis fuehrt zur Release-Seite', () {
      const json = '{"version":"1.0.21","versionCode":10021,"apk":"https://example.org/a.apk"}';
      final s = desktopStand(json, '1.0.20 (10020)');
      expect(s, isA<DownloadUpdate>());
      expect(
        (s as DownloadUpdate).seite.toString(),
        'https://github.com/Feuerwehrverein-Raura/Homepage/releases/tag/members-v1.0.21',
      );
      expect(desktopStand(json, '1.0.21 (10021)'), isA<KeinUpdate>());
    });
  });
}
