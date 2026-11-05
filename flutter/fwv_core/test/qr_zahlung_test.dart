import 'package:flutter_test/flutter_test.dart';
import 'package:fwv_core/fwv_core.dart';

void main() {
  const zahlung = QrZahlung(
    iban: 'CH93 0076 2011 6238 5295 7',
    name: 'Pia Muster',
    strasse: 'Hauptstrasse 12a',
    plz: '4303',
    ort: 'Kaiseraugst',
    betrag: 22.3,
    mitteilung: 'Spesen: Porto – Pingen',
  );

  test('Inhalt nach SIX: 31 Zeilen, Adresse S, NON, EPD am Schluss', () {
    expect(zahlung.fehlt, isNull);
    final z = zahlung.inhalt.split('\n');
    expect(z, hasLength(31));
    expect(z.sublist(0, 11), [
      'SPC', '0200', '1', 'CH9300762011623852957', //
      'S', 'Pia Muster', 'Hauptstrasse', '12a', '4303', 'Kaiseraugst', 'CH',
    ]);
    expect(z.sublist(11, 18), everyElement(''));
    expect(z.sublist(18, 20), ['22.30', 'CHF']);
    expect(z.sublist(20, 27), everyElement(''));
    expect(z.sublist(27), ['NON', '', 'Spesen: Porto - Pingen', 'EPD']);
    expect(zahlung.inhalt.endsWith('EPD'), isTrue);
  });

  test('ohne Betrag: Feld leer, der Kassier tippt ihn ein', () {
    const q = QrZahlung(iban: 'CH9300762011623852957', name: 'A B', plz: '4303', ort: 'K');
    expect(q.inhalt.split('\n')[18], '');
  });

  test('kein QR-Code: Ausland, ohne Adresse, ungueltige IBAN', () {
    expect(
      const QrZahlung(iban: 'DE89370400440532013000', name: 'A', plz: '4303', ort: 'K').fehlt,
      contains('Schweizer'),
    );
    expect(const QrZahlung(iban: 'CH9300762011623852957', name: 'A').fehlt, contains('PLZ'));
    expect(
      const QrZahlung(iban: 'CH9300762011623852958', name: 'A', plz: '4303', ort: 'K').fehlt,
      contains('IBAN'),
    );
  });

  test('Strasse und Nummer trennen', () {
    expect(strasseTeilen('Hauptstrasse 12'), (strasse: 'Hauptstrasse', nummer: '12'));
    expect(strasseTeilen('Im Kleinen Feld 3 b'), (strasse: 'Im Kleinen Feld', nummer: '3b'));
    expect(strasseTeilen('Rheinweg 10/2'), (strasse: 'Rheinweg', nummer: '10/2'));
    expect(strasseTeilen('Postfach'), (strasse: 'Postfach', nummer: ''));
    expect(strasseTeilen('Weg 1234a'), (strasse: 'Weg', nummer: '1234a'));
  });

  test('PLZ und Land', () {
    expect(plzUndLand('4303'), (plz: '4303', land: 'CH'));
    expect(plzUndLand('9490'), (plz: '9490', land: 'LI'));
    expect(plzUndLand('DE-79618'), (plz: '79618', land: 'DE'));
    expect(plzUndLand('79618'), isNull);
    expect(plzUndLand(null), isNull);
  });

  test('Spesen liefern den QR-Code mit Zweck und Betrag', () {
    final s = Spesen.ausJson({
      'id': 's1',
      'betrag': '146.06',
      'datum': '2026-11-03',
      'zweck': 'Spesenabrechnung Pingen 2026',
      'iban': 'CH9300762011623852957',
      'vorname': 'Pia',
      'nachname': 'Muster',
      'strasse': 'Hauptstrasse 12',
      'plz': '4303',
      'ort': 'Kaiseraugst',
    });
    final z = s.qrZahlung!.inhalt.split('\n');
    expect(z[5], 'Pia Muster');
    expect(z[18], '146.06');
    expect(z[29], 'Spesen: Spesenabrechnung Pingen 2026');
  });
}
