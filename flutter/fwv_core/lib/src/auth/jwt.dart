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

/// Authentik-Gruppen aus dem `groups`-Claim eines Access-Tokens.
///
/// Nur Authentik-Tokens (RS256, mit `iss`) tragen Gruppen. Die Tokens vom
/// QR-Login und Passwort-Reset (HS256, `type: member`) und die des
/// Organisator-Logins haben keine — dort gibt es also nie eine Gruppe, auch
/// wenn jemand eine hineinschreiben wollte.
List<String> jwtGruppen(String? token) {
  final angaben = jwtAngaben(token);
  if (angaben['type'] != null) return const [];
  final iss = angaben['iss'];
  if (iss is! String || iss.isEmpty) return const [];
  final g = angaben['groups'];
  if (g is! List) return const [];
  return List.unmodifiable([
    for (final e in g)
      if (e is String && e.trim().isNotEmpty) e.trim(),
  ]);
}
