// Profil, Zugaenge, Benachrichtigungen und die Aufrufe des MitgliederDienst
// gegen einen nachgebauten Server (keine echten Konten, keine echten
// Aufrufe). Die Antworten sind so aufgebaut wie in backend-members.

import 'dart:convert';

import 'package:flutter_test/flutter_test.dart';
import 'package:fwv_core/fwv_core.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';

class _Token implements TokenQuelle {
  @override
  String? accessToken = 'jwt';

  @override
  Future<Erneuerung> erneuern(String? verbrauchtesToken) async => Erneuerung.abgelaufen;
}

/// Antwort als UTF-8 (wie Express sie schickt).
http.Response _antwort(String json, int status) => http.Response.bytes(utf8.encode(json), status);

void main() {
  group('MitgliedProfil', () {
    test('liest die Zeile aus members', () {
      final p = MitgliedProfil.ausJson({
        'id': 'a1',
        'anrede': 'Frau',
        'vorname': 'Erika',
        'nachname': 'Muster',
        'email': 'erika@example.ch',
        'mobile': '+41 79 000 00 00',
        'strasse': 'Weg 1',
        'plz': 4303,
        'ort': 'Kaiseraugst',
        'funktion': 'Kassier, Admin',
        'geburtstag': '1990-05-04',
        'foto': '/uploads/photo-1.jpg',
        'iban': 'unbekannt — wird ignoriert',
      });
      expect(p.name, 'Erika Muster');
      expect(p.plz, '4303');
      expect(p.adresszeilen, ['Weg 1', '4303 Kaiseraugst']);
      expect(p.geburtstag, DateTime(1990, 5, 4));
      expect(
        p.fotoAdresse(Uri.parse('https://api.fwv-raura.ch/')).toString(),
        'https://api.fwv-raura.ch/uploads/photo-1.jpg',
      );
    });

    test('fehlende Schluessel, null und falsche Typen', () {
      final p = MitgliedProfil.ausJson({'vorname': null, 'nachname': 3, 'geburtstag': 'kaputt'});
      expect(p.vorname, isNull);
      expect(p.nachname, '3');
      expect(p.geburtstag, isNull);
      expect(p.adresszeilen, isEmpty);
      expect(p.fotoAdresse(apiBasis), isNull);
      expect(MitgliedProfil.ausJson(null).name, isNull);
      expect(MitgliedProfil.ausJson('Unsinn').email, isNull);
    });

    test('absolute Foto-Adresse bleibt', () {
      expect(
        profilFotoAdresse('https://cdn.example.ch/a.jpg', apiBasis).toString(),
        'https://cdn.example.ch/a.jpg',
      );
    });

    test('Zeitstempel als Geburtstag: nur das Datum zaehlt', () {
      expect(
        MitgliedProfil.ausJson({'geburtstag': '1985-12-01T00:00:00.000Z'}).geburtstag,
        DateTime(1985, 12, 1),
      );
    });

    test('ProfilAenderung schickt alle Felder, leer als null', () {
      final json = ProfilAenderung(
        vorname: ' Erika ',
        nachname: 'Muster',
        email: 'e@x.ch',
        telefon: '  ',
        geburtstag: DateTime(2001, 2, 3),
      ).alsJson();
      expect(json.keys, containsAll(['anrede', 'mobile', 'telefon', 'strasse', 'plz', 'ort']));
      expect(json['vorname'], 'Erika');
      expect(json['telefon'], isNull);
      expect(json['geburtstag'], '2001-02-03');
    });
  });

  group('Zugaenge', () {
    test('liest alle vier Bereiche (camelCase)', () {
      final z = Zugaenge.ausJson({
        'functionEmails': [
          {
            'function': 'Kassier',
            'email': 'kassier@fwv-raura.ch',
            'password': 'geheim-fake',
            'passwordUpdatedAt': '2026-09-01T10:00:00.000Z',
            'server': 'mail.example.net',
            'imapPort': 993,
            'smtpPort': '587',
            'webmail': 'https://mail.example.net',
          },
        ],
        'nextcloudFolders': [
          {
            'id': 3,
            'name': 'Vorstand',
            'groups': ['Vorstand', null],
          },
          {'id': 4, 'mount_point': 'Alt'},
        ],
        'systemAccesses': [
          {
            'system': 'Website',
            'url': 'https://fwv-raura.ch',
            'access': 'Mitglied',
            'enabled': true,
          },
        ],
        'serviceAccounts': [
          {
            'accountName': 'order-system',
            'username': '',
            'displayName': 'Kasse & Kueche',
            'password': 'fake',
            'rotationDays': 7,
            'nextRotation': '2026-10-18T00:00:00.000Z',
          },
        ],
        'organizerEvents': [],
        'smbCredentials': null,
      });
      expect(z.funktionsMails.single.email, 'kassier@fwv-raura.ch');
      expect(z.funktionsMails.single.smtpPort, 587);
      expect(z.funktionsMails.single.passwortGeaendert, isNotNull);
      expect(z.cloudOrdner.map((o) => o.name), ['Vorstand', 'Alt']);
      expect(z.cloudOrdner.first.gruppen, ['Vorstand']);
      expect(z.systeme.single.rolle, 'Mitglied');
      expect(z.geteilteKonten.single.titel, 'Kasse & Kueche');
      expect(z.geteilteKonten.single.benutzername, isNull);
      expect(z.leer, isFalse);
    });

    test('leere oder kaputte Antwort', () {
      expect(Zugaenge.ausJson({}).leer, isTrue);
      expect(Zugaenge.ausJson(null).leer, isTrue);
      expect(
        Zugaenge.ausJson({
          'functionEmails': 'kaputt',
          'systemAccesses': [1, 'x'],
        }).leer,
        isTrue,
      );
      final ohneName = Zugaenge.ausJson({
        'systemAccesses': [{}],
      });
      expect(ohneName.systeme.single.system, '');
      expect(ohneName.systeme.single.aktiv, isTrue);
    });
  });

  group('BenachrichtigungsEinstellungen', () {
    test('fehlende Arten gelten als eingeschaltet', () {
      final e = BenachrichtigungsEinstellungen.ausJson([
        {'id': 1, 'notification_type': 'newsletter', 'enabled': false, 'alternative_email': null},
        {'notification_type': 'event_invitation', 'enabled': false},
        'kaputt',
        {'enabled': false},
      ]);
      expect(e.aktiv('newsletter'), isFalse);
      expect(e.aktiv('shift_reminder'), isTrue);
      expect(BenachrichtigungsEinstellungen.ausJson(null).aktiv('general'), isTrue);
    });

    test('PUT schickt alle bekannten und unbekannten Arten', () {
      final e = BenachrichtigungsEinstellungen.ausJson([
        {'notification_type': 'event_invitation', 'enabled': false},
      ]).mit('general', false);
      final liste = (e.alsJson()['preferences'] as List).cast<Map>();
      final arten = {for (final p in liste) p['notification_type']: p['enabled']};
      expect(arten, {
        'shift_reminder': true,
        'event_update': true,
        'newsletter': true,
        'general': false,
        'event_invitation': false,
      });
      expect(liste.first.containsKey('alternative_email'), isFalse);
    });

    test('nur die Arten, die das Backend kennt', () {
      expect(BenachrichtigungsArt.alle.map((a) => a.schluessel), [
        'shift_reminder',
        'event_update',
        'newsletter',
        'general',
      ]);
    });
  });

  group('MitgliederDienst', () {
    late List<http.BaseRequest> anfragen;
    late List<String> koerper;
    late Map<String, http.Response Function(http.Request)> routen;
    late MitgliederDienst dienst;

    setUp(() {
      anfragen = [];
      koerper = [];
      routen = {};
      final client = MockClient.streaming((anfrage, strom) async {
        anfragen.add(anfrage);
        final bytes = await strom.toBytes();
        koerper.add(utf8.decode(bytes, allowMalformed: true));
        final r = http.Request(anfrage.method, anfrage.url)
          ..headers.addAll(anfrage.headers)
          ..bodyBytes = bytes;
        final antwort =
            routen['${anfrage.method} ${anfrage.url.path}']?.call(r) ??
            _antwort('{"error":"nicht gefunden"}', 404);
        return http.StreamedResponse(
          Stream.value(antwort.bodyBytes),
          antwort.statusCode,
          headers: {'content-type': 'application/json'},
        );
      });
      dienst = MitgliederDienst(ApiClient(http: client, tokenQuelle: _Token()));
    });

    test('Profil laden und speichern', () async {
      routen['GET /members/me'] = (_) => _antwort(jsonEncode({'vorname': 'Erika'}), 200);
      routen['PUT /members/me'] = (r) {
        final b = jsonDecode(r.body) as Map;
        return _antwort(jsonEncode({...b, 'id': 'a1'}), 200);
      };
      expect((await dienst.profil()).vorname, 'Erika');
      final neu = await dienst.profilSpeichern(
        ProfilAenderung(vorname: 'Erika', nachname: 'Neu', geburtstag: DateTime(1990, 1, 2)),
      );
      expect(neu.nachname, 'Neu');
      expect(neu.geburtstag, DateTime(1990, 1, 2));
      expect(anfragen.last.headers['Authorization'], 'Bearer jwt');
    });

    test('Foto als multipart im Feld "photo"', () async {
      routen['POST /members/me/photo'] = (r) {
        expect(r.headers['content-type'], startsWith('multipart/form-data'));
        return _antwort('{"success":true,"photo_url":"/uploads/photo-9.jpg"}', 200);
      };
      expect(await dienst.fotoHochladen([1, 2, 3]), '/uploads/photo-9.jpg');
      expect(koerper.last, contains('name="photo"; filename="profil.jpg"'));
      expect(koerper.last, contains('content-type: image/jpeg'));
      expect(anfragen.last.headers['Authorization'], 'Bearer jwt');
    });

    test('Austritt mit Grund und Datum', () async {
      routen['POST /members/me/austritt'] = (_) =>
          _antwort('{"success":true,"message":"Gesendet."}', 200);
      expect(
        await dienst.austrittBeantragen(grund: ' Umzug ', wunschdatum: DateTime(2026, 12, 31)),
        'Gesendet.',
      );
      expect(jsonDecode(koerper.last), {'reason': 'Umzug', 'austrittsdatum': '2026-12-31'});
      await dienst.austrittBeantragen();
      expect(jsonDecode(koerper.last), isEmpty);
    });

    test('Austritt: Fehlermeldung des Backends kommt an', () async {
      routen['POST /members/me/austritt'] = (_) =>
          _antwort('{"error":"Austritt wurde bereits beantragt oder ist erfolgt."}', 409);
      await expectLater(
        dienst.austrittBeantragen(),
        throwsA(
          isA<ApiFehler>().having(
            (e) => e.meldung,
            'meldung',
            'Austritt wurde bereits beantragt oder ist erfolgt.',
          ),
        ),
      );
    });

    test('Funktions-Mail-Passwort', () async {
      routen['PUT /members/me/function-email-password'] = (_) =>
          _antwort('{"success":true,"message":"Passwort erfolgreich geändert"}', 200);
      expect(
        await dienst.funktionsMailPasswortAendern(
          email: 'kassier@fwv-raura.ch',
          passwort: 'x' * 12,
        ),
        'Passwort erfolgreich geändert',
      );
      expect(jsonDecode(koerper.last), {'email': 'kassier@fwv-raura.ch', 'password': 'x' * 12});
    });

    test('Benachrichtigungen laden und speichern', () async {
      routen['GET /members/me/notifications'] = (_) => _antwort('[]', 200);
      routen['PUT /members/me/notifications'] = (r) =>
          _antwort(jsonEncode((jsonDecode(r.body) as Map)['preferences']), 200);
      final e = await dienst.benachrichtigungen();
      final neu = await dienst.benachrichtigungenSpeichern(e.mit('newsletter', false));
      expect(neu.aktiv('newsletter'), isFalse);
      expect(neu.aktiv('general'), isTrue);
    });

    test('Push-Token an- und abmelden', () async {
      routen['POST /members/me/fcm-token'] = (_) => _antwort('{"success":true}', 200);
      routen['DELETE /members/me/fcm-token'] = (_) => _antwort('{"success":true,"removed":0}', 200);
      await dienst.pushTokenRegistrieren(token: 'fcm-1', geraeteId: 'g1', plattform: 'android');
      expect(jsonDecode(koerper.last), {
        'token': 'fcm-1',
        'device_id': 'g1',
        'platform': 'android',
      });
      await dienst.pushTokenAbmelden('fcm-1');
      expect(anfragen.last.method, 'DELETE');
      expect(jsonDecode(koerper.last), {'token': 'fcm-1'});
    });

    test('Newsletter an und ab', () async {
      routen['POST /newsletter/subscribe'] = (_) =>
          _antwort('{"success":true,"message":"Bitte bestätigen"}', 200);
      routen['POST /newsletter/unsubscribe'] = (_) =>
          _antwort('{"success":false,"message":"Nicht gefunden"}', 200);
      expect(await dienst.newsletter(anmelden: true, email: ' e@x.ch '), 'Bitte bestätigen');
      expect(jsonDecode(koerper.last), {'email': 'e@x.ch'});
      await expectLater(
        dienst.newsletter(anmelden: false, email: 'e@x.ch'),
        throwsA(isA<ApiFehler>()),
      );
    });

    test('organisiert Anlaesse?', () async {
      routen['GET /events/organized-by-me'] = (_) => _antwort('[]', 200);
      expect(await dienst.organisiertAnlaesse(), isFalse);
      routen['GET /events/organized-by-me'] = (_) => _antwort('[{"id":"e1"}]', 200);
      expect(await dienst.organisiertAnlaesse(), isTrue);
    });
  });

  test('kopfzeilenFuer: Token nur fuer das eigene Backend', () {
    final api = ApiClient(
      http: MockClient((_) async => http.Response('', 200)),
      tokenQuelle: _Token(),
    );
    expect(api.kopfzeilenFuer(Uri.parse('https://api.fwv-raura.ch/uploads/a.jpg')), {
      'Authorization': 'Bearer jwt',
    });
    expect(api.kopfzeilenFuer(Uri.parse('https://example.com/a.jpg')), isEmpty);
    expect(api.kopfzeilenFuer(Uri.parse('http://api.fwv-raura.ch/a.jpg')), isEmpty);
  });

  group('IBAN', () {
    test('Pruefziffer, Laenge, Format', () {
      expect(ibanGueltig('CH93 0076 2011 6238 5295 7'), isTrue);
      expect(ibanGueltig('ch9300762011623852957'), isTrue);
      expect(ibanGueltig('CH93 0076 2011 6238 5295 8'), isFalse, reason: 'Pruefziffer');
      expect(ibanGueltig('CH93 0076 2011 6238 5295'), isFalse, reason: 'CH hat 21 Zeichen');
      expect(ibanGueltig('DE89 3704 0044 0532 0130 00'), isTrue);
      expect(ibanGueltig('kein iban'), isFalse);
      expect(ibanFormatieren('ch9300762011623852957'), 'CH93 0076 2011 6238 5295 7');
    });

    test('Profil liest und ProfilAenderung schickt sie formatiert; leer loescht', () {
      expect(
        MitgliedProfil.ausJson({'iban': 'CH9300762011623852957'}).iban,
        'CH9300762011623852957',
      );
      expect(
        const ProfilAenderung(iban: 'ch9300762011623852957').alsJson()['iban'],
        'CH93 0076 2011 6238 5295 7',
      );
      expect(const ProfilAenderung(iban: '  ').alsJson()['iban'], isNull);
    });
  });
}
