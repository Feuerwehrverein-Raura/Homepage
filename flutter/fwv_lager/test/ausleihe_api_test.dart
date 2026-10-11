// ApiAusleiheZugang gegen einen nachgebauten Inventar-Server, der die
// Vertragsdatei ausliefert: Routen, Abfragen, Koerper, Fehlertexte.

import 'dart:convert';
import 'dart:typed_data';

import 'package:flutter_test/flutter_test.dart';
import 'package:fwv_core/fwv_core.dart';
import 'package:fwv_lager/fwv_lager.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';

import 'ausleihe_vertrag.dart';

void main() {
  final v = ausleiheVertrag();
  late List<http.Request> anfragen;
  late ApiAusleiheZugang zugang;

  http.Response json(Object? daten, [int status = 200]) => http.Response(
    jsonEncode(daten),
    status,
    headers: {'content-type': 'application/json; charset=utf-8'},
  );

  setUp(() {
    anfragen = [];
    final client = MockClient((a) async {
      anfragen.add(a);
      return switch ((a.method, a.url.path)) {
        ('GET', '/api/ausleihe/angebot') => json(v['angebot']),
        ('POST', '/api/ausleihe') =>
          (jsonDecode(a.body)['positionen'] as List).first['menge'] == 25
              ? json(v['ausleihe_409'], 409)
              : json(v['ausleihe_neu'], 201),
        ('GET', '/api/ausleihe/meine') => json(v['meine']),
        ('GET', '/api/ausleihe') => json(v['ueberfaellig']),
        ('GET', '/api/ausleihe/1') => json(v['ausleihe_neu']),
        ('POST', '/api/ausleihe/2/absagen') => json(v['ausleihe_abgesagt']),
        ('POST', '/api/ausleihe/3/ausgeben') => json(v['ausleihe_ausgegeben']),
        ('POST', '/api/ausleihe/1/zuruecknehmen') => json(v['ausleihe_zurueck']),
        ('POST', '/api/ausleihe/1/fotos') => json(v['foto'], 201),
        ('DELETE', '/api/ausleihe/1/fotos/1') => json({'success': true}),
        _ => json({'error': 'nicht gefunden'}, 404),
      };
    });
    zugang = ApiAusleiheZugang(
      ApiClient(http: client, tokenQuelle: _Token(), basis: inventarApiBasis),
    );
  });

  test('Angebot: Zeitraum als JJJJ-MM-TT, Bearer', () async {
    final a = await zugang.angebot(DateTime(2026, 10, 13, 15), DateTime(2026, 10, 15));
    expect(a.artikel, hasLength(2));
    expect(
      anfragen.single.url.toString(),
      'https://inventar.fwv-raura.ch/api/ausleihe/angebot?von=2026-10-13&bis=2026-10-15',
    );
    expect(anfragen.single.headers['Authorization'], 'Bearer authentik-token');
  });

  test('Anlegen und 409 mit deutscher Meldung', () async {
    final a = await zugang.anlegen(
      NeueAusleihe(
        von: DateTime(2026, 10, 13),
        bis: DateTime(2026, 10, 15),
        artikel: const {2: 30},
      ),
    );
    expect(a.id, 1);
    expect(jsonDecode(anfragen.last.body), {
      'von': '2026-10-13',
      'bis': '2026-10-15',
      'positionen': [
        {'item_id': 2, 'menge': 30},
      ],
    });
    await expectLater(
      zugang.anlegen(
        NeueAusleihe(
          von: DateTime(2026, 10, 14),
          bis: DateTime(2026, 10, 14),
          artikel: const {2: 25},
        ),
      ),
      throwsA(
        isA<ApiFehler>()
            .having((e) => e.status, 'status', 409)
            .having((e) => e.meldung, 'meldung', contains('nur noch 20 Stück frei')),
      ),
    );
  });

  test('Listen und Detail', () async {
    expect((await zugang.meine()).single.id, 1);
    final u = await zugang.liste(AusleiheFilter.ueberfaellig);
    expect(anfragen.last.url.queryParameters, {'filter': 'ueberfaellig'});
    expect(u.single.app.ueberfaellig, isTrue);
    expect((await zugang.ausleihe(1)).positionenText, '30 Stück Teller');
  });

  test('Absagen, Ausgeben, Zuruecknehmen', () async {
    expect((await zugang.absagen(2)).status, AusleiheStatus.abgesagt);
    expect((await zugang.ausgeben(3)).status, AusleiheStatus.ausgegeben);
    final r = await zugang.zuruecknehmen(
      1,
      const Rueckgabe(
        positionen: [RueckgabePosition(id: 1, zurueck: 27, zustand: Zustand.beschaedigt)],
      ),
    );
    expect(r.status, AusleiheStatus.zurueckgegeben);
    expect(jsonDecode(anfragen.last.body), {
      'positionen': [
        {'id': 1, 'zurueck': 27, 'zustand': 'beschaedigt'},
      ],
    });
  });

  test('Foto hochladen (multipart image + position_id) und loeschen', () async {
    final f = await zugang.fotoHochladen(
      1,
      Uint8List.fromList([0xff, 0xd8, 0xff, 0xd9]),
      positionId: 1,
    );
    expect(f.bild, '/api/uploads/item-foto.jpg');
    final body = utf8.decode(anfragen.last.bodyBytes, allowMalformed: true);
    expect(anfragen.last.headers['content-type'], startsWith('multipart/form-data'));
    expect(body, contains('name="image"; filename="schaden.jpg"'));
    expect(body, contains('name="position_id"'));
    await zugang.fotoLoeschen(1, 1);
    expect(anfragen.last.method, 'DELETE');
    expect(
      zugang.bildAdresse(f.bild).toString(),
      'https://inventar.fwv-raura.ch/api/uploads/item-foto.jpg',
    );
  });

  test('Unbekannte Route: Fehler mit Meldung', () async {
    await expectLater(
      zugang.ausleihe(99),
      throwsA(isA<ApiFehler>().having((e) => e.status, 'status', 404)),
    );
  });
}

class _Token implements TokenQuelle {
  @override
  String? get accessToken => 'authentik-token';

  @override
  Future<Erneuerung> erneuern(String? verbrauchtesToken) async => Erneuerung.abgelaufen;
}
