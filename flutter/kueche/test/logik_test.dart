// Uebernommen aus der frueheren nativen App (KdsLogicTest.kt), ergaenzt um
// print_failed.

import 'dart:convert';

import 'package:flutter_test/flutter_test.dart';
import 'package:kueche/src/modelle.dart';
import 'package:kueche/src/token.dart';

// {"id": "pos-shared", "exp": 2000000000}
const token = 'eyJhbGciOiJIUzI1NiJ9.eyJpZCI6ICJwb3Mtc2hhcmVkIiwgImV4cCI6IDIwMDAwMDAwMDB9.sig';
final ablauf = DateTime.fromMillisecondsSinceEpoch(2000000000000, isUtc: true);

void main() {
  test('Ablauf aus dem Token', () {
    expect(tokenAblauf(token), ablauf);
    expect(tokenAblauf('kein.jwt'), isNull);
    expect(tokenAblauf('x'), isNull);
  });

  test('gueltig bis zum Ablauf, erneuern nach einem Tag', () {
    const ms = Duration(milliseconds: 1);
    expect(tokenGueltig(token, ablauf.subtract(ms)), isTrue);
    expect(tokenGueltig(token, ablauf.add(ms)), isFalse);
    expect(tokenGueltig(null, ablauf), isFalse);
    expect(tokenGueltig('', ablauf), isFalse);
    expect(tokenErneuern(token, ablauf.subtract(const Duration(days: 30))), isFalse);
    expect(
      tokenErneuern(token, ablauf.subtract(const Duration(days: 29)).add(const Duration(seconds: 1))),
      isTrue,
    );
    expect(tokenErneuern(token, ablauf.subtract(const Duration(days: 1))), isTrue);
  });

  test('Restversuche aus dem Servertext', () {
    expect(restVersuche('Falsches Passwort. Noch 2 Versuche übrig.'), 2);
    expect(restVersuche('Falsches Passwort. Noch 1 Versuche übrig.'), 1);
    expect(restVersuche('IP für 24 Stunden gesperrt nach zu vielen fehlgeschlagenen Versuchen.'), isNull);
    expect(restVersuche(null), isNull);
  });

  test('Versionsvergleich', () {
    expect(versionVergleichen('4.0', '3.4'), 1);
    expect(versionVergleichen('2.6.1', '2.6'), 1);
    expect(versionVergleichen('2.6', '2.6.0'), 0);
    expect(versionVergleichen('2.10', '10.0'), -1);
    expect(versionVergleichen('2.10', '2.9'), 1);
  });

  test('Bestellung wie sie der Server heute liefert', () {
    // Auszug aus GET /api/orders: Zahlen als Strings, neue Felder, items null
    final roh = jsonDecode('''[
      {"id": 7, "table_number": 4, "status": "pending", "total": "12.50",
       "payment_method": null, "created_at": "2026-10-15T16:00:00.000Z",
       "event_id": "00000000-0000-0000-0000-e00000000001", "event_titel": "Chilbi",
       "paid_amount": "0",
       "items": [
         {"id": 1, "item_name": "Bratwurst", "quantity": 2, "price": "6.25", "notes": null,
          "printer_station": "kitchen", "paid": false, "paid_at": null, "completed": false, "completed_at": null},
         {"id": 2, "item_name": "Bier", "quantity": 1, "price": "5.00", "notes": "",
          "printer_station": "bar", "paid": false, "paid_at": null, "completed": true,
          "completed_at": "2026-10-15T16:01:00.000Z"}
       ]},
      {"id": 8, "table_number": 0, "status": "paid", "total": "0", "created_at": null, "items": null}
    ]''') as List;
    final b = [for (final o in roh) Bestellung.ausJson(o as Map<String, dynamic>)];
    expect(b, hasLength(2));
    final o = b[0];
    expect(o.ort, 'Tisch 4');
    expect(o.offenFuer(Station.kueche), isTrue);
    expect(o.offenFuer(Station.bar), isFalse, reason: 'Bier schon erledigt');
    expect(o.fuer(Station.bar), hasLength(1));
    expect(o.positionen[1].notiz, isNull, reason: 'leere Notiz zaehlt nicht');
    expect(o.minuten(DateTime.utc(2026, 10, 15, 16, 12)), 12);
    expect(o.dringend(DateTime.utc(2026, 10, 15, 16, 12)), isTrue);
    expect(o.dringend(DateTime.utc(2026, 10, 15, 16, 10)), isFalse);
    expect(b[1].ort, 'Theke');
    expect(b[1].positionen, isEmpty);
    expect(b[1].offenFuer(Station.alle), isFalse);
    expect(b[1].minuten(DateTime.now()), 0);
  });

  test('Zeit ohne Zone gilt als UTC', () {
    final b = Bestellung.ausJson({'id': 1, 'table_number': 1, 'created_at': '2026-10-15T16:00:00'});
    expect(b.minuten(DateTime.utc(2026, 10, 15, 16, 5)), 5);
  });

  test('Allergie-Hinweis', () {
    Position p(String? n) => Position(id: 1, name: 'x', menge: 1, notiz: n);
    expect(p('Laktoseintolerant').allergie, isTrue);
    expect(p('NUSSALLERGIE').allergie, isTrue);
    expect(p('ohne Zwiebeln').allergie, isFalse);
    expect(p(null).allergie, isFalse);
  });

  test('items_completed mit order_id als Text; print_failed', () {
    final n = WsNachricht.ausJson(jsonDecode('{"type":"items_completed","order_id":"7","item_ids":[1,"2"]}'));
    expect(n, isA<PositionenErledigt>());
    expect((n! as PositionenErledigt).id, 7);
    expect((n as PositionenErledigt).positionen, [1, 2]);

    final f = WsNachricht.ausJson({
      'type': 'print_failed',
      'order_id': 12,
      'druckfehler': [
        {'station': 'kitchen', 'meldung': 'Drucker antwortet nicht'},
      ],
    });
    final d = (f! as Druckfehlermeldung).fehler.single;
    expect((d.bestellung, d.stationText, d.meldung), (12, 'Küche', 'Drucker antwortet nicht'));
    expect(WsNachricht.ausJson({'type': 'unbekannt'}), isNull);
    expect(WsNachricht.ausJson('kaputt'), isNull);
  });
}
