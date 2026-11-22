import 'package:flutter_test/flutter_test.dart';
import 'package:fwv_core/fwv_core.dart';

void main() {
  test('OffenerBeitrag aus dem Backend', () {
    final b = OffenerBeitrag.ausJson({
      'id': 'p1',
      'jahr': 2026,
      'betrag': '50.00',
      'faellig': '2026-03-31',
      'iban': 'CH64 3076 9442 4924 3200 1',
      'empfaenger': ['Feuerwehrverein Raura', 'Marksteinweg 12', '4304 Giebenach'],
      'referenz': '00 00000 00000 00000 00000 12345',
      'mitteilung': 'Mitgliederbeitrag 2026',
      'qr_inhalt': 'SPC\nEPD',
    });
    expect(b.jahr, 2026);
    expect(b.betrag, 50);
    expect(b.faellig, DateTime(2026, 3, 31));
    expect(b.empfaenger, hasLength(3));
    expect(b.qrInhalt, 'SPC\nEPD');
    expect(b.ueberfaellig(DateTime(2026, 3, 31, 18)), isFalse);
    expect(b.ueberfaellig(DateTime(2026, 4, 1)), isTrue);
  });

  test('ohne Referenz und Faelligkeit', () {
    final b = OffenerBeitrag.ausJson({'id': 'p2', 'jahr': 2025, 'betrag': 50, 'iban': 'CH64'});
    expect(b.referenz, isNull);
    expect(b.qrInhalt, isNull);
    expect(b.ueberfaellig(DateTime(2030)), isFalse);
  });
}
