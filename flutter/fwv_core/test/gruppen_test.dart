// Authentik-Gruppen in der Sitzung (fuer Reiter wie "Lager") und der
// Zugriff auf ein zweites Backend mit demselben Token (Inventar-API).

import 'dart:convert';

import 'package:flutter_test/flutter_test.dart';
import 'package:fwv_core/fwv_core.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';

/// Unsigniertes JWT mit den gegebenen Angaben (die App prueft keine
/// Signatur — das tut das Backend).
String _jwt(Map<String, Object?> angaben) {
  String teil(Object o) => base64Url.encode(utf8.encode(jsonEncode(o))).replaceAll('=', '');
  return '${teil({'alg': 'RS256', 'typ': 'JWT'})}.${teil(angaben)}.signatur';
}

const _iss = 'https://auth.fwv-raura.ch/application/o/fwv-members-app/';

void main() {
  group('jwtGruppen', () {
    test('Authentik-Token mit groups-Claim', () {
      expect(
        jwtGruppen(_jwt({'iss': _iss, 'groups': ['Mitglieder', ' Lager ', 3, '']})),
        ['Mitglieder', 'Lager'],
      );
    });

    test('QR-Login/Passwort-Reset (HS256, type member): nie Gruppen', () {
      expect(jwtGruppen(_jwt({'type': 'member', 'iss': _iss, 'groups': ['Vorstand']})), isEmpty);
      expect(jwtGruppen(_jwt({'type': 'member', 'email': 'e@x.ch'})), isEmpty);
    });

    test('ohne Issuer, ohne Claim, kein JWT', () {
      expect(jwtGruppen(_jwt({'groups': ['Lager']})), isEmpty);
      expect(jwtGruppen(_jwt({'iss': _iss})), isEmpty);
      expect(jwtGruppen(_jwt({'iss': _iss, 'groups': 'Lager'})), isEmpty);
      expect(jwtGruppen('kein-jwt'), isEmpty);
      expect(jwtGruppen(null), isEmpty);
    });
  });

  group('Sitzung.gruppen / hatGruppe', () {
    Sitzung mitglied(String token) => Sitzung(accessToken: token, kontotyp: Kontotyp.mitglied);

    test('Gross-/Kleinschreibung egal', () {
      final s = mitglied(_jwt({'iss': _iss, 'groups': ['Mitglieder', 'Lager']}));
      expect(s.gruppen, ['Mitglieder', 'Lager']);
      expect(s.hatGruppe(['lager']), isTrue);
      expect(s.hatGruppe(['LAGER', 'Vorstand']), isTrue);
      expect(s.hatGruppe(['Vorstand', 'admin']), isFalse);
      expect(mitglied(_jwt({'iss': _iss, 'groups': ['admin']})).hatGruppe(['Admin']), isTrue);
    });

    test('kein Teiltreffer', () {
      expect(mitglied(_jwt({'iss': _iss, 'groups': ['Lagerist']})).hatGruppe(['Lager']), isFalse);
    });

    test('QR-Token und externer Organisator: keine Gruppen', () {
      expect(mitglied(_jwt({'type': 'member', 'groups': ['Lager']})).hatGruppe(['Lager']), isFalse);
      final org = Sitzung(
        accessToken: _jwt({'iss': _iss, 'groups': ['Lager']}),
        kontotyp: Kontotyp.organisator,
      );
      expect(org.gruppen, isEmpty);
    });

    test('nach dem Erneuern gilt das neue Token', () {
      final alt = mitglied(_jwt({'iss': _iss, 'groups': ['Mitglieder']}));
      final neu = alt.kopieMit(accessToken: _jwt({'iss': _iss, 'groups': ['Mitglieder', 'Lager']}));
      expect(alt.hatGruppe(['Lager']), isFalse);
      expect(neu.hatGruppe(['Lager']), isTrue);
    });
  });

  group('vonAuthentik (Ausleihe: nur Authentik-Tokens)', () {
    Sitzung s(String token, [Kontotyp typ = Kontotyp.mitglied]) =>
        Sitzung(accessToken: token, kontotyp: typ);

    test('Authentik-Mitglied ja, QR/Reset/Organisator/kein JWT nein', () {
      expect(s(_jwt({'iss': _iss})).vonAuthentik, isTrue);
      expect(s(_jwt({'type': 'member', 'iss': _iss})).vonAuthentik, isFalse);
      expect(s(_jwt({'email': 'e@x.ch'})).vonAuthentik, isFalse);
      expect(s(_jwt({'iss': _iss}), Kontotyp.organisator).vonAuthentik, isFalse);
      expect(s('kein-jwt').vonAuthentik, isFalse);
      expect(jwtVonAuthentik(null), isFalse);
    });
  });

  group('apiFuer: zweites Backend mit demselben Token', () {
    test('Bearer, eigene Basis, Erneuern bei 403', () async {
      var gueltig = 'alt';
      final anfragen = <http.Request>[];
      final client = MockClient((a) async {
        anfragen.add(a);
        if (a.url.toString() == 'https://auth.fwv-raura.ch/application/o/token/') {
          gueltig = 'neu';
          return http.Response(jsonEncode({'access_token': 'neu', 'refresh_token': 'r2'}), 200);
        }
        if (a.headers['Authorization'] != 'Bearer $gueltig') {
          return http.Response('{"error":"Invalid token"}', 403);
        }
        return http.Response('[{"id":1}]', 200);
      });
      final speicher = SitzungsSpeicher(SpeicherImArbeitsspeicher());
      await speicher.speichern(
        const Sitzung(accessToken: 'abgelaufen', refreshToken: 'r1', kontotyp: Kontotyp.mitglied),
      );
      final v = SitzungsVerwaltung(speicher: speicher, http: client);
      await v.laden();
      gueltig = 'x';

      final lager = v.apiFuer(Uri.parse('https://inventar.fwv-raura.ch/api/'));
      expect(await lager.get('items', abfrage: {'search': 'Bier'}), [
        {'id': 1},
      ]);
      expect(anfragen.first.url.toString(), 'https://inventar.fwv-raura.ch/api/items?search=Bier');
      expect(anfragen.first.headers['Authorization'], 'Bearer abgelaufen');
      expect(anfragen.last.headers['Authorization'], 'Bearer neu');
      expect(v.sitzung!.accessToken, 'neu');
    });
  });

  group('ApiClient', () {
    test('PATCH schickt JSON', () async {
      late http.Request anfrage;
      final api = ApiClient(
        http: MockClient((a) async {
          anfrage = a;
          return http.Response('{"purchased":true}', 200);
        }),
      );
      expect(await api.patch('events/x/shopping-list/3', daten: {'purchased': true}), {
        'purchased': true,
      });
      expect(anfrage.method, 'PATCH');
      expect(jsonDecode(anfrage.body), {'purchased': true});
    });

    test('hochladen mit Text-Feldern', () async {
      late String body;
      late String typ;
      final api = ApiClient(
        http: MockClient((a) async {
          body = utf8.decode(a.bodyBytes, allowMalformed: true);
          typ = a.headers['content-type'] ?? '';
          return http.Response('{"id":9}', 201);
        }),
      );
      final antwort = await api.hochladen(
        'events/chilbi/receipts',
        feld: 'image',
        bytes: [1, 2, 3],
        dateiname: 'beleg.jpg',
        inhaltstyp: 'image/jpeg',
        felder: {'note': 'Volg'},
      );
      expect(antwort, {'id': 9});
      expect(typ, startsWith('multipart/form-data'));
      expect(body, contains('name="note"'));
      expect(body, contains('Volg'));
      expect(body, contains('name="image"; filename="beleg.jpg"'));
      expect(body, contains('image/jpeg'));
    });
  });
}
