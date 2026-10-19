// API-Zugriff und Erneuern der Sitzung gegen einen nachgebauten Server
// (keine echten Konten, keine echten Aufrufe).

import 'dart:convert';

import 'package:flutter_test/flutter_test.dart';
import 'package:fwv_core/fwv_core.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';

const _tokenEndpunkt = 'https://auth.fwv-raura.ch/application/o/token/';
const _backendErneuern = 'https://api.fwv-raura.ch/auth/refresh';

/// Nachgebauter Server: Backend und Authentik-Token-Endpunkt.
class _Server {
  /// Token, das das Backend gerade annimmt.
  String gueltig = 'neu-access';

  /// Antwort des Token-Endpunkts (null = Refresh-Token abgelehnt).
  Map<String, String>? refreshAntwort = {
    'access_token': 'neu-access',
    'refresh_token': 'neu-refresh',
  };

  /// Antwort von qr-login (null = QR-Code widerrufen).
  String? qrAntwort;

  /// Refresh-Token von api-members in der Antwort von qr-login (null =
  /// aelteres Backend ohne).
  String? qrRefresh;

  bool keinNetz = false;
  int refreshAufrufe = 0;
  int qrAufrufe = 0;
  final anfragen = <http.Request>[];

  late final client = MockClient((anfrage) async {
    anfragen.add(anfrage);
    if (keinNetz) throw http.ClientException('offline');
    final pfad = anfrage.url.toString();

    // Authentik (App) oder das Backend (Mitglieder-Web) - gleiche Form.
    if (pfad == _tokenEndpunkt || pfad == _backendErneuern) {
      refreshAufrufe++;
      // Etwas warten, damit parallele Aufrufe wirklich gleichzeitig ankommen.
      await Future<void>.delayed(const Duration(milliseconds: 20));
      final a = refreshAntwort;
      if (a == null) return http.Response('{"error":"invalid_grant"}', 400);
      gueltig = a['access_token']!;
      return http.Response(jsonEncode(a), 200);
    }
    if (pfad == 'https://api.fwv-raura.ch/auth/member/qr-login') {
      qrAufrufe++;
      final a = qrAntwort;
      if (a == null) return http.Response('{"error":"Ungueltiger oder widerrufener Token"}', 401);
      gueltig = a;
      return http.Response(
        jsonEncode({
          'success': true,
          'token': a,
          'refresh_token': ?qrRefresh,
          'user': {'id': 1, 'email': 'e@x.ch', 'name': 'Erika'},
        }),
        200,
      );
    }
    if (pfad == 'https://api.fwv-raura.ch/members/me') {
      if (anfrage.headers['Authorization'] != 'Bearer $gueltig') {
        return http.Response('{"error":"Token abgelaufen"}', 401);
      }
      return http.Response(
        jsonEncode({'vorname': 'Erika', 'ort': 'Kaiseraugst'}),
        200,
        headers: {'content-type': 'application/json; charset=utf-8'},
      );
    }
    return http.Response('{"error":"nicht gefunden"}', 404);
  });
}

void main() {
  late _Server server;
  late SpeicherImArbeitsspeicher roh;
  late SitzungsSpeicher speicher;
  late SitzungsVerwaltung verwaltung;

  Future<void> anmelden(Sitzung s) async {
    await speicher.speichern(s);
    await verwaltung.laden();
  }

  setUp(() {
    server = _Server();
    roh = SpeicherImArbeitsspeicher();
    speicher = SitzungsSpeicher(roh);
    verwaltung = SitzungsVerwaltung(speicher: speicher, http: server.client);
  });

  group('ApiClient', () {
    test('Bearer, JSON und Basis-URL', () async {
      server.gueltig = 'abc';
      await anmelden(const Sitzung(accessToken: 'abc', kontotyp: Kontotyp.mitglied));

      final antwort = await verwaltung.api.get('members/me');

      expect(antwort, {'vorname': 'Erika', 'ort': 'Kaiseraugst'});
      final a = server.anfragen.single;
      expect(a.url.toString(), 'https://api.fwv-raura.ch/members/me');
      expect(a.headers['Authorization'], 'Bearer abc');
      expect(a.headers['Accept'], 'application/json');
    });

    test('POST schickt JSON', () async {
      final client = ApiClient(
        http: MockClient((a) async {
          expect(a.headers['Content-Type'], startsWith('application/json'));
          expect(jsonDecode(a.body), {'email': 'a@b.ch'});
          return http.Response('{"ok":true}', 200);
        }),
      );
      expect(await client.post('/newsletter/subscribe', daten: {'email': 'a@b.ch'}), {'ok': true});
    });

    test('Fehlertext des Backends kommt durch', () async {
      final client = ApiClient(
        http: MockClient((_) async => http.Response('{"error":"Der Code ist falsch."}', 400)),
      );
      await expectLater(
        client.post('auth/member/reset', daten: {}),
        throwsA(
          isA<ApiFehler>()
              .having((e) => e.status, 'status', 400)
              .having((e) => e.meldung, 'meldung', 'Der Code ist falsch.'),
        ),
      );
    });

    test('kein Netz', () async {
      final client = ApiClient(http: MockClient((_) async => throw http.ClientException('weg')));
      await expectLater(
        client.get('events'),
        throwsA(isA<ApiFehler>().having((e) => e.status, 'status', isNull)),
      );
    });
  });

  group('Erneuern', () {
    test('401 -> Refresh-Token einloesen, Aufruf wiederholen, neue Tokens speichern', () async {
      await anmelden(
        const Sitzung(accessToken: 'alt', refreshToken: 'r1', kontotyp: Kontotyp.mitglied),
      );

      expect(await verwaltung.api.get('members/me'), isNotNull);

      expect(server.refreshAufrufe, 1);
      final refresh = server.anfragen.firstWhere((a) => a.url.toString() == _tokenEndpunkt);
      expect(refresh.bodyFields, {
        'grant_type': 'refresh_token',
        'refresh_token': 'r1',
        'client_id': 'fwv-members-app',
      });
      final s = await speicher.laden();
      expect(s!.accessToken, 'neu-access');
      expect(s.refreshToken, 'neu-refresh');
      expect(server.anfragen.last.headers['Authorization'], 'Bearer neu-access');
    });

    test('Mitglieder-Web: erneuert beim Backend mit Client fwv-members', () async {
      verwaltung = SitzungsVerwaltung(
        speicher: speicher,
        http: server.client,
        oidc: OidcKonfiguration.website,
      );
      await anmelden(
        const Sitzung(accessToken: 'alt', refreshToken: 'r1', kontotyp: Kontotyp.mitglied),
      );

      expect(await verwaltung.api.get('members/me'), isNotNull);

      final refresh = server.anfragen.singleWhere((a) => a.url.toString() == _backendErneuern);
      expect(refresh.bodyFields, {
        'grant_type': 'refresh_token',
        'refresh_token': 'r1',
        'client_id': 'fwv-members',
      });
      expect(server.anfragen.any((a) => a.url.toString() == _tokenEndpunkt), isFalse);
      expect((await speicher.laden())!.refreshToken, 'neu-refresh');
    });

    test('ohne neuen Refresh-Token bleibt der alte', () async {
      server.refreshAntwort = {'access_token': 'neu-access'};
      await anmelden(
        const Sitzung(accessToken: 'alt', refreshToken: 'r1', kontotyp: Kontotyp.mitglied),
      );
      await verwaltung.api.get('members/me');
      expect((await speicher.laden())!.refreshToken, 'r1');
    });

    test('gleichzeitige Aufrufe teilen sich einen Refresh', () async {
      await anmelden(
        const Sitzung(accessToken: 'alt', refreshToken: 'r1', kontotyp: Kontotyp.mitglied),
      );

      final ergebnisse = await Future.wait([
        verwaltung.api.get('members/me'),
        verwaltung.api.get('members/me'),
        verwaltung.api.get('members/me'),
      ]);

      expect(ergebnisse, everyElement(isNotNull));
      expect(server.refreshAufrufe, 1);
    });

    test('Refresh abgelehnt -> stilles Neu-Anmelden mit dem QR-Code', () async {
      server.refreshAntwort = null;
      server.qrAntwort = 'qr-access';
      await anmelden(
        const Sitzung(
          accessToken: 'alt',
          refreshToken: 'r1',
          qrToken: 'fwv-member-1',
          kontotyp: Kontotyp.mitglied,
        ),
      );

      expect(await verwaltung.api.get('members/me'), isNotNull);

      expect(server.qrAufrufe, 1);
      final qr = server.anfragen.firstWhere((a) => a.url.path == '/auth/member/qr-login');
      expect(jsonDecode(qr.body), {'token': 'fwv-member-1', 'mit_erneuerung': true});
      expect(qr.headers['Authorization'], isNull);
      final s = await speicher.laden();
      expect(s!.accessToken, 'qr-access');
      expect(s.qrToken, 'fwv-member-1');
    });

    test(
      'Refresh-Token von api-members -> erneuert bei api-members, nicht bei Authentik',
      () async {
        await anmelden(
          const Sitzung(accessToken: 'alt', refreshToken: 'fwvm_r1', kontotyp: Kontotyp.mitglied),
        );

        expect(await verwaltung.api.get('members/me'), isNotNull);

        final refresh = server.anfragen.singleWhere((a) => a.url.toString() == _backendErneuern);
        expect(refresh.bodyFields['refresh_token'], 'fwvm_r1');
        expect(refresh.bodyFields['grant_type'], 'refresh_token');
        expect(server.anfragen.any((a) => a.url.toString() == _tokenEndpunkt), isFalse);
        final s = await speicher.laden();
        expect(s!.accessToken, 'neu-access');
        expect(s.refreshToken, 'neu-refresh');
      },
    );

    test(
      'alte QR-Sitzung bekommt beim Erneuern einen Refresh-Token, QR-Code wird vergessen',
      () async {
        server.qrAntwort = 'qr-access';
        server.qrRefresh = 'fwvm_neu';
        await anmelden(
          const Sitzung(accessToken: 'alt', qrToken: 'fwv-member-1', kontotyp: Kontotyp.mitglied),
        );

        expect(await verwaltung.api.get('members/me'), isNotNull);

        final s = await speicher.laden();
        expect(s!.accessToken, 'qr-access');
        expect(s.refreshToken, 'fwvm_neu');
        expect(s.qrToken, isNull);
      },
    );

    test('nichts klappt -> abgemeldet, Speicher leer, "Sitzung abgelaufen"', () async {
      server.refreshAntwort = null;
      await anmelden(
        const Sitzung(
          accessToken: 'alt',
          refreshToken: 'r1',
          qrToken: 'fwv-member-1',
          kontotyp: Kontotyp.mitglied,
        ),
      );
      var benachrichtigt = 0;
      verwaltung.addListener(() => benachrichtigt++);

      await expectLater(verwaltung.api.get('members/me'), throwsA(isA<SitzungAbgelaufen>()));

      expect(verwaltung.angemeldet, isFalse);
      expect(verwaltung.hinweis, contains('Sitzung abgelaufen'));
      expect(await speicher.laden(), isNull);
      expect(benachrichtigt, greaterThan(0));
    });

    test('Organisator-Token ohne Refresh -> abgelaufen, kein QR-Versuch', () async {
      await anmelden(
        const Sitzung(accessToken: 'alt', kontotyp: Kontotyp.organisator, eventId: '7'),
      );
      await expectLater(verwaltung.api.get('members/me'), throwsA(isA<SitzungAbgelaufen>()));
      expect(server.refreshAufrufe, 0);
      expect(server.qrAufrufe, 0);
    });

    test('ohne Netz bleibt die Sitzung', () async {
      await anmelden(
        const Sitzung(accessToken: 'alt', refreshToken: 'r1', kontotyp: Kontotyp.mitglied),
      );
      // Erster Aufruf kommt an (401), das Erneuern findet kein Netz.
      final verwaltungOffline = SitzungsVerwaltung(
        speicher: speicher,
        http: MockClient((a) async {
          if (a.url.toString() == _tokenEndpunkt) throw http.ClientException('offline');
          return http.Response('{"error":"abgelaufen"}', 401);
        }),
      );
      await verwaltungOffline.laden();

      await expectLater(
        verwaltungOffline.api.get('members/me'),
        throwsA(isA<ApiFehler>().having((e) => e.status, 'status', isNull)),
      );
      expect(verwaltungOffline.angemeldet, isTrue);
      expect(await speicher.laden(), isNotNull);
    });
  });

  group('Anmelden', () {
    test('QR-Code: Token und QR-Code werden gespeichert', () async {
      server.qrAntwort = 'jwt-qr';
      await verwaltung.mitQrCodeAnmelden('fwv-member-abc');
      final s = await speicher.laden();
      expect(s!.accessToken, 'jwt-qr');
      expect(s.qrToken, 'fwv-member-abc');
      expect(s.kontotyp, Kontotyp.mitglied);
      expect(s.name, 'Erika');
      expect(roh.werte['account_type'], 'member');
    });

    test('QR-Code: mit Refresh-Token von api-members wird der QR-Code nicht gespeichert', () async {
      server.qrAntwort = 'jwt-qr';
      server.qrRefresh = 'fwvm_q';
      await verwaltung.mitQrCodeAnmelden('fwv-member-abc');
      final anfrage = server.anfragen.singleWhere((a) => a.url.path == '/auth/member/qr-login');
      expect(jsonDecode(anfrage.body), {'token': 'fwv-member-abc', 'mit_erneuerung': true});
      final s = await speicher.laden();
      expect(s!.refreshToken, 'fwvm_q');
      expect(s.qrToken, isNull);
    });

    test('Anmeldebon: Refresh-Token wird gespeichert', () async {
      final v = SitzungsVerwaltung(
        speicher: speicher,
        http: MockClient((a) async {
          expect(a.url.path, '/auth/member/code-login');
          expect(jsonDecode(a.body), {'code': 'abc', 'mit_erneuerung': true});
          return http.Response(
            jsonEncode({'token': 'bon-jwt', 'refresh_token': 'fwvm_bon', 'name': 'Erika'}),
            200,
          );
        }),
      );
      await v.mitAnmeldebonAnmelden('abc');
      final s = await speicher.laden();
      expect(s!.accessToken, 'bon-jwt');
      expect(s.refreshToken, 'fwvm_bon');
      expect(s.name, 'Erika');
    });

    test('QR-Code widerrufen -> Fehler, nicht angemeldet', () async {
      await expectLater(verwaltung.mitQrCodeAnmelden('fwv-member-x'), throwsA(isA<ApiFehler>()));
      expect(verwaltung.angemeldet, isFalse);
    });

    test('externer Organisator: Antwort von events/login', () async {
      final v = SitzungsVerwaltung(
        speicher: speicher,
        http: MockClient((a) async {
          expect(a.url.toString(), 'https://api.fwv-raura.ch/events/login');
          expect(jsonDecode(a.body), {'email': 'fest@x.ch', 'password': 'geheim'});
          return http.Response(
            jsonEncode({
              'success': true,
              'token': 'org-jwt',
              'event': {
                'id': 17,
                'title': 'Grillfest',
                'slug': 'grillfest',
                'organizer_name': 'Hans',
              },
            }),
            200,
          );
        }),
      );
      await v.alsOrganisatorAnmelden(' fest@x.ch ', 'geheim');
      final s = await speicher.laden();
      expect(s!.kontotyp, Kontotyp.organisator);
      expect(s.eventId, '17');
      expect(s.name, 'Hans');
      expect(roh.werte['account_type'], 'organizer');
      expect(roh.werte['event_id'], '17');
    });

    test('Passwort-Reset meldet direkt an', () async {
      final v = SitzungsVerwaltung(
        speicher: speicher,
        http: MockClient((a) async {
          expect(a.url.path, '/auth/member/reset');
          expect(jsonDecode(a.body), {
            'email': 'e@x.ch',
            'code': '123456',
            'new_password': 'langesPasswort',
            'mit_erneuerung': true,
          });
          return http.Response(
            jsonEncode({
              'success': true,
              'token': 'reset-jwt',
              'refresh_token': 'fwvm_reset',
              'user': {'name': 'Erika'},
            }),
            200,
          );
        }),
      );
      await v.passwortZuruecksetzen(
        email: 'e@x.ch',
        code: ' 123456 ',
        neuesPasswort: 'langesPasswort',
      );
      expect(v.angemeldet, isTrue);
      expect((await speicher.laden())!.accessToken, 'reset-jwt');
      expect((await speicher.laden())!.refreshToken, 'fwvm_reset');
    });

    test('OIDC: Name aus dem ID-Token', () async {
      String teil(Map<String, Object> m) =>
          base64Url.encode(utf8.encode(jsonEncode(m))).replaceAll('=', '');
      final idToken =
          '${teil({'alg': 'none'})}.${teil({'name': 'Erika Muster', 'email': 'e@x.ch'})}.sig';
      await verwaltung.mitOidcTokensAnmelden(accessToken: 'a', refreshToken: 'r', idToken: idToken);
      final s = await speicher.laden();
      expect(s!.name, 'Erika Muster');
      expect(s.refreshToken, 'r');
    });
  });

  test('Abmelden: Haken laeuft vorher, Speicher leer (Markierung bleibt)', () async {
    String? tokenBeimHaken;
    final v = SitzungsVerwaltung(
      speicher: speicher,
      http: server.client,
      beimAbmelden: (api) async => tokenBeimHaken = api.tokenQuelle?.accessToken,
    );
    await roh.schreiben(SitzungsSchluessel.altdatenUebernommen, 'ja');
    await speicher.speichern(
      const Sitzung(
        accessToken: 'a',
        refreshToken: 'r',
        qrToken: 'q',
        kontotyp: Kontotyp.organisator,
        eventId: '1',
      ),
    );
    await v.laden();

    await v.abmelden();

    expect(tokenBeimHaken, 'a');
    expect(v.angemeldet, isFalse);
    expect(roh.werte, {SitzungsSchluessel.altdatenUebernommen: 'ja'});
  });

  group('beiNeuemToken', () {
    late List<String?> gemeldet;

    setUp(() {
      gemeldet = [];
      verwaltung.beiNeuemToken = (s) => gemeldet.add(s?.accessToken);
    });

    test('Start mit gespeicherter Sitzung, Erneuern, Abmelden', () async {
      await anmelden(
        const Sitzung(accessToken: 'alt', refreshToken: 'r1', kontotyp: Kontotyp.mitglied),
      );
      expect(gemeldet, ['alt']);
      await verwaltung.api.get('members/me');
      expect(gemeldet, ['alt', 'neu-access']);
      await verwaltung.abmelden();
      expect(gemeldet, ['alt', 'neu-access', null]);
    });

    test('Start ohne Sitzung meldet nichts', () async {
      await verwaltung.laden();
      expect(gemeldet, isEmpty);
    });

    test('nach jedem Login', () async {
      server.qrAntwort = 'qr-access';
      await verwaltung.mitQrCodeAnmelden('fwv-member-1');
      expect(gemeldet, ['qr-access']);
    });

    test('Sitzung abgelaufen -> null', () async {
      server.refreshAntwort = null;
      await anmelden(
        const Sitzung(accessToken: 'alt', refreshToken: 'r1', kontotyp: Kontotyp.mitglied),
      );
      await expectLater(verwaltung.api.get('members/me'), throwsA(isA<SitzungAbgelaufen>()));
      expect(gemeldet, ['alt', null]);
    });

    test('Fehler im Rueckruf stoert die Anmeldung nicht', () async {
      verwaltung.beiNeuemToken = (_) => throw StateError('kaputt');
      server.qrAntwort = 'qr-access';
      await verwaltung.mitQrCodeAnmelden('fwv-member-1');
      expect(verwaltung.angemeldet, isTrue);
    });
  });
}
