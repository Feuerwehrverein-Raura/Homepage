// Wer den Vorstand-Bereich sieht - und dass jeder Bereich baut.

import 'dart:convert';

import 'package:flutter_test/flutter_test.dart';
import 'package:fwv_core/fwv_core.dart';
import 'package:fwv_vorstand/fwv_vorstand.dart';

void main() {
  Sitzung mit(List<String> gruppen, {Kontotyp typ = Kontotyp.mitglied}) {
    // Gruppen kommen aus dem Token; hatGruppe liest sie dort.
    final angaben = jsonEncode({
      'iss': 'https://auth.fwv-raura.ch/application/o/fwv-members-app/',
      'groups': gruppen,
    });
    return Sitzung(accessToken: _jwt(angaben), kontotyp: typ);
  }

  test('Vorstand und admin, Gross/klein egal; nicht fuer externe Organisatoren', () {
    expect(istVorstand(mit(['Vorstand'])), isTrue);
    expect(istVorstand(mit(['vorstand'])), isTrue);
    expect(istVorstand(mit(['Mitglieder', 'admin'])), isTrue);
    expect(istVorstand(mit(['Mitglieder', 'Lager'])), isFalse);
    expect(istVorstand(mit(['Vorstand'], typ: Kontotyp.organisator)), isFalse);
    expect(istVorstand(null), isFalse);
  });

  test('Bereiche in fester Reihenfolge', () {
    expect(vorstandBereiche.map((b) => b.titel), [
      'Anlässe',
      'Anträge',
      'Mitglieder',
      'Beiträge',
      'Nachricht',
      'E-Mail',
      'Audit',
    ]);
  });

  test('Bereiche fuer Push-Mitteilungen ueber ihren Schluessel', () {
    expect(vorstandBereichIndex('anlaesse'), 0);
    expect(vorstandBereichIndex('antraege'), 1);
    expect(vorstandBereichIndex('mitglieder'), 2);
    expect(vorstandBereichIndex('gibtsnicht'), isNull);
    expect(vorstandBereichIndex(null), isNull);
  });
}

String _jwt(String angabenJson) {
  String teil(String s) => base64Url.encode(utf8.encode(s)).replaceAll('=', '');
  return '${teil('{"alg":"RS256"}')}.${teil(angabenJson)}.x';
}
