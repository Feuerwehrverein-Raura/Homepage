// ApiLagerZugang gegen einen nachgebauten Inventar-Server, der die
// Vertragsdatei ausliefert: Routen, Abfragen, Koerper, Fehlertexte.

import 'dart:convert';

import 'package:flutter_test/flutter_test.dart';
import 'package:fwv_core/fwv_core.dart';
import 'package:fwv_lager/fwv_lager.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';

import 'vertrag.dart';

void main() {
  final v = vertrag();
  late List<http.Request> anfragen;
  late ApiLagerZugang zugang;

  http.Response json(Object? daten, [int status = 200]) => http.Response(
    jsonEncode(daten),
    status,
    headers: {'content-type': 'application/json; charset=utf-8'},
  );

  setUp(() {
    anfragen = [];
    final client = MockClient((a) async {
      anfragen.add(a);
      final pfad = a.url.path;
      return switch ((a.method, pfad)) {
        ('GET', '/api/items') => json(v['items']),
        ('GET', '/api/items/1') => json(v['item']),
        ('GET', '/api/transactions') => json(v['transactions']),
        ('POST', '/api/items/1/stock') =>
          jsonDecode(a.body)['quantity'] > 8
              ? json({'error': 'Nicht genug an Lager (Bestand: 8).'}, 400)
              : json(v['stock']),
        ('GET', '/api/barcode/lookup/FWV000002') => json(v['lookup_lokal']),
        ('GET', '/api/barcode/lookup/4000000000006') => json(v['lookup_unbekannt']),
        ('PATCH', '/api/items/2/barcode') => json(v['barcode_zuordnen']),
        ('PATCH', '/api/items/3/barcode') => json(v['barcode_zuordnen_doppelt'], 409),
        ('GET', '/api/locations/overview') => json(v['locations_overview']),
        ('GET', '/api/locations/2') => json(v['location']),
        ('GET', '/api/reports/low-stock') => json(v['low_stock']),
        ('GET', '/api/categories') => json(v['categories']),
        ('GET', '/api/barcode/next') => json(v['barcode_next']),
        ('POST', '/api/items') => json(v['item_neu']),
        _ => json({'error': 'nicht gefunden'}, 404),
      };
    });
    zugang = ApiLagerZugang(
      ApiClient(http: client, tokenQuelle: _Token(), basis: inventarApiBasis),
    );
  });

  test('Basis und Bearer', () async {
    await zugang.lagerorte();
    expect(anfragen.single.url.toString(), 'https://inventar.fwv-raura.ch/api/locations/overview');
    expect(anfragen.single.headers['Authorization'], 'Bearer authentik-token');
  });

  test('Artikel suchen: search nur mit Text', () async {
    expect((await zugang.artikel()).length, 5);
    expect(anfragen.last.url.query, isEmpty);
    await zugang.artikel(suche: '  Mineral ');
    expect(anfragen.last.url.queryParameters, {'search': 'Mineral'});
  });

  test('Detail und Verlauf', () async {
    final a = await zugang.artikelDetail(1);
    expect(a.orte, hasLength(2));
    final b = await zugang.verlauf(1, anzahl: 5);
    expect(b, isNotEmpty);
    expect(anfragen.last.url.queryParameters, {'item_id': '1', 'limit': '5'});
  });

  test('Buchen: ganze Zahl, Grund aus der Notiz oder Standard', () async {
    expect(await zugang.buchen(1, BuchungsArt.ausgang, 4, notiz: ' Apéro '), 8);
    expect(jsonDecode(anfragen.last.body), {'type': 'out', 'quantity': 4, 'reason': 'Apéro'});
    await zugang.buchen(1, BuchungsArt.eingang, 2);
    expect(jsonDecode(anfragen.last.body), {
      'type': 'in',
      'quantity': 2,
      'reason': 'Eingang (App)',
    });
  });

  test('Fehlermeldung des Backends kommt durch', () async {
    await expectLater(
      zugang.buchen(1, BuchungsArt.ausgang, 20),
      throwsA(
        isA<ApiFehler>()
            .having((e) => e.status, 'status', 400)
            .having((e) => e.meldung, 'meldung', 'Nicht genug an Lager (Bestand: 8).'),
      ),
    );
    await expectLater(
      zugang.codeZuordnen(3, '7611111111111'),
      throwsA(isA<ApiFehler>().having((e) => e.meldung, 'meldung', contains('gehört bereits'))),
    );
  });

  test('Code suchen und zuordnen', () async {
    expect(await zugang.codeSuchen('FWV000002'), isA<ImLager>());
    final u = await zugang.codeSuchen('4000000000006');
    expect(u, isA<Unbekannt>());
    final a = await zugang.codeZuordnen(2, ' 7611111111111 ');
    expect(a.ean, '7611111111111');
    expect(anfragen.last.method, 'PATCH');
    expect(jsonDecode(anfragen.last.body), {'ean_code': '7611111111111'});
  });

  test('Lagerort, Nachbestellen, Kategorien, naechster Code', () async {
    expect((await zugang.lagerort(2)).posten, hasLength(2));
    expect((await zugang.nachbestellen()).first.name, 'Mineral 1.5l');
    expect((await zugang.kategorien()).length, 2);
    expect(await zugang.naechsterCode(), 'FWV000007');
  });

  test('Anlegen: ohne EAN kein ean_code (dann vergibt das Backend den Code)', () async {
    final a = await zugang.anlegen(
      const NeuerArtikel(
        name: ' Becher ',
        kategorieId: 2,
        lagerortId: 2,
        bestand: 30,
        mindestbestand: 10,
      ),
    );
    expect(a.eigenerCode, 'FWV000007');
    expect(jsonDecode(anfragen.last.body), {
      'name': 'Becher',
      'category_id': 2,
      'location_id': 2,
      'unit': 'Stück',
      'quantity': 30,
      'min_quantity': 10,
    });
    await zugang.anlegen(const NeuerArtikel(name: 'Cola', ean: '5449000000996', einheit: ' '));
    expect(jsonDecode(anfragen.last.body), {
      'name': 'Cola',
      'ean_code': '5449000000996',
      'unit': 'Stück',
      'quantity': 0,
      'min_quantity': 0,
    });
  });

  test('Bildadresse gegen den Inventar-Server, Token nur dorthin', () {
    final b = zugang.bildAdresse('/api/uploads/item-1.jpg')!;
    expect(b.toString(), 'https://inventar.fwv-raura.ch/api/uploads/item-1.jpg');
    expect(zugang.bildKopfzeilen(b), {'Authorization': 'Bearer authentik-token'});
    final fremd = zugang.bildAdresse('https://images.openfoodfacts.org/x.jpg')!;
    expect(zugang.bildKopfzeilen(fremd), isEmpty);
    expect(zugang.bildAdresse(null), isNull);
    expect(zugang.bildAdresse('http://boese.example/x.jpg'), isNull);
  });

  test('QR-Etikett der Inventar-PWA -> Code', () {
    expect(codeAusScan('https://inventar.fwv-raura.ch/item/FWV000002'), 'FWV000002');
    expect(codeAusScan('https://inventar.fwv-raura.ch/item/fwv000002/'), 'FWV000002');
    expect(codeAusScan(' 7610000000001 '), '7610000000001');
    expect(codeAusScan('https://boese.example/item/FWV1'), 'https://boese.example/item/FWV1');
  });

  test('Lager-Reiter nur fuer Lager, Vorstand, admin', () {
    String jwt(Map<String, Object?> c) {
      String teil(Object o) => base64Url.encode(utf8.encode(jsonEncode(o))).replaceAll('=', '');
      return '${teil({'alg': 'RS256'})}.${teil(c)}.x';
    }

    const iss = 'https://auth.fwv-raura.ch/application/o/fwv-members-app/';
    Sitzung s(List<String> g) =>
        Sitzung(accessToken: jwt({'iss': iss, 'groups': g}), kontotyp: Kontotyp.mitglied);
    expect(hatLagerZugang(s(['Mitglieder', 'Lager'])), isTrue);
    expect(hatLagerZugang(s(['vorstand'])), isTrue);
    expect(hatLagerZugang(s(['admin'])), isTrue);
    expect(hatLagerZugang(s(['Mitglieder'])), isFalse);
    expect(hatLagerZugang(null), isFalse);
    expect(
      hatLagerZugang(
        Sitzung(
          accessToken: jwt({
            'type': 'member',
            'groups': ['Lager'],
          }),
          kontotyp: Kontotyp.mitglied,
        ),
      ),
      isFalse,
      reason: 'QR-Login',
    );
  });
}

class _Token implements TokenQuelle {
  @override
  String? get accessToken => 'authentik-token';

  @override
  Future<Erneuerung> erneuern(String? verbrauchtesToken) async => Erneuerung.abgelaufen;
}
