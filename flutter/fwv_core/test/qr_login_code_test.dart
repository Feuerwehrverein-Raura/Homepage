// QR-Code vom Datenblatt lesen: JSON oder nacktes Token, Organisator-Codes
// werden abgelehnt (Entscheidung 2).

import 'package:flutter_test/flutter_test.dart';
import 'package:fwv_core/fwv_core.dart';

void main() {
  test('JSON-Code eines Mitglieds', () {
    final c = qrLoginCodeLesen('{"v":1,"type":"fwv-member-login","token":"fwv-member-abc123"}');
    expect(c.istGueltig, isTrue);
    expect(c.token, 'fwv-member-abc123');
  });

  test('nacktes Token, auch mit Leerzeichen rundherum', () {
    expect(qrLoginCodeLesen('  fwv-member-xyz\n').token, 'fwv-member-xyz');
  });

  test('Organisator-Codes gibt es nicht mehr', () {
    expect(qrLoginCodeLesen('fwv-org-123').fehler, QrCodeFehler.organisatorCode);
    expect(
      qrLoginCodeLesen('{"v":1,"type":"fwv-organizer-login","token":"fwv-org-1"}').fehler,
      QrCodeFehler.organisatorCode,
    );
  });

  test('fremde Codes', () {
    expect(qrLoginCodeLesen('https://example.com').fehler, QrCodeFehler.fremderCode);
    expect(qrLoginCodeLesen('[1,2]').fehler, QrCodeFehler.fremderCode);
    expect(qrLoginCodeLesen('{"type":"wifi"}').fehler, QrCodeFehler.fremderCode);
    expect(qrLoginCodeLesen('').fehler, QrCodeFehler.fremderCode);
  });

  test('Login-Code ohne Token', () {
    expect(qrLoginCodeLesen('{"v":1,"type":"fwv-member-login"}').fehler, QrCodeFehler.ohneToken);
    expect(
      qrLoginCodeLesen('{"v":1,"type":"fwv-member-login","token":"  "}').fehler,
      QrCodeFehler.ohneToken,
    );
  });

  test('Anmeldebon vom Bondrucker', () {
    final c = qrLoginCodeLesen('https://www.fwv-raura.ch/anmelden.html?code=AbC-123_x');
    expect(c.istGueltig, isTrue);
    expect(c.bonCode, 'AbC-123_x');
    expect(c.token, isNull);
  });

  test('Bon-Adresse einer fremden Seite', () {
    expect(qrLoginCodeLesen('https://evil.ch/anmelden.html?code=abc').fehler, QrCodeFehler.fremderCode);
    expect(qrLoginCodeLesen('https://fwv-raura.ch.evil.ch/anmelden.html?code=abc').fehler, QrCodeFehler.fremderCode);
  });
}
