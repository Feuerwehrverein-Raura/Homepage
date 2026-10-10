// Login-QR-Code eines Mitglieds lesen.
//
// Auf dem gedruckten Datenblatt steht entweder JSON
//   {"v":1,"type":"fwv-member-login","token":"fwv-member-..."}
// oder nur das nackte Token "fwv-member-...". Der Organisator-QR der alten
// Android-App ("fwv-organizer-login", "fwv-org-...") entfaellt — dafuer gibt es
// im Backend keine Route (docs/flutter-mitglieder-app-plan.md, Entscheidung 2).

import 'dart:convert';

/// Warum ein gescannter Code nicht taugt — fuer eine verstaendliche Meldung.
enum QrCodeFehler {
  /// Kein Login-Code des Vereins (fremder QR-Code).
  fremderCode,

  /// Alter Organisator-Code; diese Anmeldung gibt es nicht mehr.
  organisatorCode,

  /// Login-Code ohne Zugang darin.
  ohneToken,
}

/// Ergebnis von [qrLoginCodeLesen]: entweder [token] oder [fehler].
class QrLoginCode {
  const QrLoginCode.gueltig(String this.token) : fehler = null;
  const QrLoginCode.ungueltig(QrCodeFehler this.fehler) : token = null;

  final String? token;
  final QrCodeFehler? fehler;

  bool get istGueltig => token != null;
}

const _mitgliedPraefix = 'fwv-member-';
const _organisatorPraefix = 'fwv-org-';

/// Liest den Inhalt eines gescannten QR-Codes.
QrLoginCode qrLoginCodeLesen(String roh) {
  final text = roh.trim();
  if (text.startsWith(_mitgliedPraefix)) return QrLoginCode.gueltig(text);
  if (text.startsWith(_organisatorPraefix)) {
    return const QrLoginCode.ungueltig(QrCodeFehler.organisatorCode);
  }

  Object? json;
  try {
    json = jsonDecode(text);
  } on FormatException {
    return const QrLoginCode.ungueltig(QrCodeFehler.fremderCode);
  }
  if (json is! Map) return const QrLoginCode.ungueltig(QrCodeFehler.fremderCode);

  switch (json['type']) {
    case 'fwv-member-login':
      final token = json['token'];
      if (token is String && token.trim().isNotEmpty) return QrLoginCode.gueltig(token.trim());
      return const QrLoginCode.ungueltig(QrCodeFehler.ohneToken);
    case 'fwv-organizer-login':
      return const QrLoginCode.ungueltig(QrCodeFehler.organisatorCode);
    default:
      return const QrLoginCode.ungueltig(QrCodeFehler.fremderCode);
  }
}
