// Mac-Programm: alle Sitzungsdaten in einem Schluesselbund-Eintrag, damit
// macOS nach einem Update nur einmal nach dem Passwort fragt.

import 'package:flutter_test/flutter_test.dart';
import 'package:fwv_core/fwv_core.dart';

void main() {
  test('Ganze Sitzung in einem Eintrag, Abmelden raeumt ihn weg', () async {
    final innen = SpeicherImArbeitsspeicher();
    final speicher = SitzungsSpeicher(GebuendelterSpeicher(innen));
    await speicher.speichern(
      const Sitzung(
        accessToken: 'a',
        refreshToken: 'r',
        kontotyp: Kontotyp.mitglied,
        name: 'Erika Muster',
        email: 'erika@example.ch',
      ),
    );
    expect(innen.werte.keys, ['fwv_daten']);

    // Neu gestartet: liest aus dem einen Eintrag.
    final s = await SitzungsSpeicher(GebuendelterSpeicher(innen)).laden();
    expect(s?.accessToken, 'a');
    expect(s?.refreshToken, 'r');
    expect(s?.name, 'Erika Muster');

    await speicher.leeren();
    expect(innen.werte, isEmpty);
  });

  test(
    'Fruehere Einzel-Eintraege werden nicht gelesen (sonst je eine Abfrage)',
    () async {
      final innen = SpeicherImArbeitsspeicher()..werte['auth_token'] = 'alt';
      expect(
        await SitzungsSpeicher(GebuendelterSpeicher(innen)).laden(),
        isNull,
      );
    },
  );

  test('Kaputter Eintrag gilt als abgemeldet', () async {
    final innen = SpeicherImArbeitsspeicher()..werte['fwv_daten'] = '{kaputt';
    expect(await SitzungsSpeicher(GebuendelterSpeicher(innen)).laden(), isNull);
  });
}
