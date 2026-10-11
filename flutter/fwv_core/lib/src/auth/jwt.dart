// Angaben (Claims) aus einem JWT lesen — nur zur Anzeige und um zu
// entscheiden, welche Reiter die App zeigt. Die Signatur prueft immer das
// Backend; wer hier etwas faelscht, sieht hoechstens einen Reiter, dessen
// Aufrufe dann mit 403 scheitern.

import 'dart:convert';

/// Liest die Angaben (Claims) eines JWT, ohne die Signatur zu pruefen — nur
/// fuer die Anzeige. Gibt eine leere Map zurueck, wenn es kein JWT ist.
Map<String, dynamic> jwtAngaben(String? token) {
  final teile = token?.split('.');
  if (teile == null || teile.length != 3) return const {};
  try {
    final json = jsonDecode(utf8.decode(base64Url.decode(base64Url.normalize(teile[1]))));
    return json is Map<String, dynamic> ? json : const {};
  } on FormatException {
    return const {};
  }
}

/// Gruppen aus dem `groups`-Claim eines Access-Tokens (z.B. `Lager`,
/// `Vorstand`).
///
/// Zwei Arten von Tokens tragen Gruppen, und zwar dieselben:
///  - Authentik-Tokens (RS256, mit `iss`, ohne `type`),
///  - Mitglieder-Tokens von api-members (QR-Code, Anmeldebon, App-Passwort,
///    Passwort-Reset: HS256, `type: member`, ohne `iss`). api-members
///    schreibt die Authentik-Gruppen des Mitglieds hinein, damit diese
///    Anmeldung dieselben Rechte hat.
/// Organisator-Logins (`type: event-organizer`) und alles andere: keine.
/// Die Signatur prueft das Backend — eine hineingeschriebene Gruppe zeigt
/// hoechstens einen Reiter, dessen Aufrufe dann scheitern.
List<String> jwtGruppen(String? token) {
  final angaben = jwtAngaben(token);
  if (!_vonAuthentik(angaben) && !_mitgliederToken(angaben)) return const [];
  final g = angaben['groups'];
  if (g is! List) return const [];
  return List.unmodifiable([
    for (final e in g)
      if (e is String && e.trim().isNotEmpty) e.trim(),
  ]);
}

/// Stammt das Token von Authentik (RS256, mit `iss`)? QR-Login und
/// Passwort-Reset (HS256, `type: member`) und Organisator-Logins nicht.
bool jwtVonAuthentik(String? token) => _vonAuthentik(jwtAngaben(token));

/// Ist es ein Mitglieder-Token von api-members (QR-Code, Anmeldebon,
/// App-Passwort, Passwort-Reset: `type: member`, ohne `iss`)?
bool jwtMitgliederToken(String? token) => _mitgliederToken(jwtAngaben(token));

bool _vonAuthentik(Map<String, dynamic> angaben) {
  if (angaben['type'] != null) return false;
  final iss = angaben['iss'];
  return iss is String && iss.isNotEmpty;
}

bool _mitgliederToken(Map<String, dynamic> angaben) =>
    angaben['type'] == 'member' && angaben['iss'] == null;
