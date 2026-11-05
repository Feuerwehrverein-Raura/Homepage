// Swiss QR Code (Zahlteil der QR-Rechnung) fuer Auszahlungen an Mitglieder:
// der Kassier scannt ihn mit der Bank-App, IBAN, Name, Adresse, Betrag und
// Zweck stehen dann schon drin - nichts mehr abtippen.
//
// Nach den Swiss Implementation Guidelines QR-bill von SIX (Version 2.4 vom
// 24.02.2026, Kapitel 4 und 6; 2.3 gilt bis November 2027):
// Kopf SPC/0200/1, nur IBAN mit CH oder LI, nur strukturierte Adresse (S,
// seit 21.11.2025), ohne Referenz (NON), Mitteilung bis 140 Zeichen, Schluss
// EPD. Zeilen mit LF getrennt, nach der letzten keine. Fehlerkorrektur M.
// Gleich gebaut wie docker/backend-dispatch/src/qr-zahlung.js (Mails).

import 'profil.dart';

/// Empfaenger und Betrag einer Auszahlung.
class QrZahlung {
  const QrZahlung({
    required this.iban,
    required this.name,
    this.strasse,
    this.plz,
    this.ort,
    this.betrag,
    this.mitteilung,
  });

  final String iban;

  /// Vor- und Nachname wie beim Konto.
  final String name;

  /// Wie im Profil: "Hauptstrasse 12a" - Nummer wird abgetrennt.
  final String? strasse;

  /// "4303" oder mit Land "DE-79618".
  final String? plz;
  final String? ort;
  final double? betrag;
  final String? mitteilung;

  /// Warum es keinen QR-Code gibt, sonst null.
  String? get fehlt {
    final i = ibanKompakt(iban);
    if (!ibanGueltig(i)) return 'Keine gültige IBAN.';
    if (!i.startsWith('CH') && !i.startsWith('LI')) {
      return 'QR-Code nur für Schweizer und Liechtensteiner Konten.';
    }
    if (_zeichen(name).isEmpty) return 'Name fehlt.';
    if (_zeichen(ort ?? '').isEmpty || plzUndLand(plz) == null) {
      return 'Adresse (PLZ und Ort) fehlt im Profil – die Bank braucht sie.';
    }
    final b = betrag;
    if (b != null && (b < 0.01 || b > 999999999.99)) return 'Betrag ausserhalb des Erlaubten.';
    return null;
  }

  /// Inhalt des QR-Codes; nur aufrufen, wenn [fehlt] null ist.
  String get inhalt {
    assert(fehlt == null, fehlt);
    final (:strasse, :nummer) = strasseTeilen(this.strasse ?? '');
    final (:plz, :land) = plzUndLand(this.plz)!;
    String feld(String t, int max) {
      final z = _zeichen(t);
      return z.length > max ? z.substring(0, max).trim() : z;
    }

    return [
      'SPC',
      '0200',
      '1',
      ibanKompakt(iban),
      'S',
      feld(name, 70),
      feld(strasse, 70),
      feld(nummer, 16),
      feld(plz, 16),
      feld(ort ?? '', 35),
      land,
      // Endgueltiger Zahlungsempfaenger: bleibt leer (fuer spaeter reserviert).
      '', '', '', '', '', '', '',
      betrag == null ? '' : betrag!.toStringAsFixed(2),
      'CHF',
      // Endgueltiger Zahlungspflichtiger: weggelassen.
      '', '', '', '', '', '', '',
      'NON',
      '',
      feld(mitteilung ?? '', 140),
      'EPD',
    ].join('\n');
  }
}

/// "Hauptstrasse 12a" -> (strasse: "Hauptstrasse", nummer: "12a").
/// Ohne Nummer am Ende bleibt alles Strasse.
({String strasse, String nummer}) strasseTeilen(String s) {
  final t = s.trim().replaceAll(RegExp(r'\s+'), ' ');
  final m = RegExp(r'^(.*\D)\s+(\d+(?:\s?[a-zA-Z])?(?:\s?[/-]\s?\d+[a-zA-Z]?)?)$').firstMatch(t);
  if (m == null) return (strasse: t, nummer: '');
  return (strasse: m[1]!.trim(), nummer: m[2]!.replaceAll(' ', ''));
}

/// "4303" -> CH, 9485-9498 -> LI, "DE-79618" -> DE. Sonst null (Land
/// unbekannt; die Bank verlangt es).
({String plz, String land})? plzUndLand(String? plz) {
  final t = (plz ?? '').trim().toUpperCase();
  final mitLand = RegExp(r'^([A-Z]{2})\s*-\s*(\S.*)$').firstMatch(t);
  if (mitLand != null) return (plz: mitLand[2]!, land: mitLand[1]!);
  if (!RegExp(r'^\d{4}$').hasMatch(t)) return null;
  final n = int.parse(t);
  return (plz: t, land: n >= 9485 && n <= 9498 ? 'LI' : 'CH');
}

/// Nur Zeichen, die der Swiss QR Code erlaubt (Kapitel 4.1.1: Basic Latin,
/// Latin-1, Latin Extended A, Ș ș Ț ț €); Zeilenumbrueche als Leerzeichen,
/// typografische Striche und Anfuehrungszeichen als einfache.
String _zeichen(String s) {
  final ersetzt = s
      .replaceAll(RegExp(r'[\r\n\t]+'), ' ')
      .replaceAll(RegExp('[‐-―]'), '-')
      .replaceAll(RegExp('[‘’‚]'), "'")
      .replaceAll(RegExp('[“”„]'), '"')
      .replaceAll('…', '...');
  final erlaubt = ersetzt.runes.where(
    (r) =>
        (r >= 0x20 && r <= 0x7e) ||
        (r >= 0xa0 && r <= 0x17f) ||
        (r >= 0x218 && r <= 0x21b) ||
        r == 0x20ac,
  );
  return String.fromCharCodes(erlaubt).replaceAll(RegExp(r' {2,}'), ' ').trim();
}
