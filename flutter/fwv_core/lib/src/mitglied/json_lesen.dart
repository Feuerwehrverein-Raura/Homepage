// Kleine Lese-Hilfen fuer Backend-JSON. Die Antworten kommen direkt aus der
// Datenbank (snake_case) oder sind von Hand gebaut (camelCase); fehlende
// Schluessel, null und falsche Typen sollen nie zum Absturz fuehren — dann
// bleibt das Feld eben leer.

/// Text, oder null bei leer/fehlend. Zahlen werden zu Text (PLZ kommt je
/// nach Datenbestand als Zahl).
String? jsonText(Object? wert) {
  if (wert is String) {
    final t = wert.trim();
    return t.isEmpty ? null : t;
  }
  if (wert is num) return wert.toString();
  return null;
}

int? jsonZahl(Object? wert) {
  if (wert is int) return wert;
  if (wert is num) return wert.toInt();
  if (wert is String) return int.tryParse(wert.trim());
  return null;
}

bool? jsonWahr(Object? wert) {
  if (wert is bool) return wert;
  if (wert is num) return wert != 0;
  if (wert is String) {
    return switch (wert.trim().toLowerCase()) {
      'true' || '1' || 't' => true,
      'false' || '0' || 'f' => false,
      _ => null,
    };
  }
  return null;
}

/// Liest eine Liste von Objekten; alles, was keine Map ist, wird uebergangen.
List<T> jsonListe<T>(Object? wert, T Function(Map<String, dynamic>) lesen) {
  if (wert is! List) return const [];
  return [
    for (final e in wert)
      if (e is Map) lesen(Map<String, dynamic>.from(e)),
  ];
}

/// Datum aus `YYYY-MM-DD` (die DATE-Spalten liefert das Backend als Text)
/// oder einem ISO-Zeitstempel; es zaehlen nur die ersten zehn Zeichen, wie in
/// den alten Apps.
DateTime? jsonDatum(Object? wert) {
  final t = jsonText(wert);
  if (t == null || t.length < 10) return null;
  final teile = t.substring(0, 10).split('-');
  if (teile.length != 3) return null;
  final j = int.tryParse(teile[0]);
  final m = int.tryParse(teile[1]);
  final d = int.tryParse(teile[2]);
  if (j == null || m == null || d == null) return null;
  return DateTime(j, m, d);
}

/// Zeitpunkt aus ISO-Text, oder null.
DateTime? jsonZeitpunkt(Object? wert) {
  final t = jsonText(wert);
  return t == null ? null : DateTime.tryParse(t)?.toLocal();
}

/// `YYYY-MM-DD`, wie es das Backend fuer DATE-Spalten erwartet.
String isoDatum(DateTime d) =>
    '${d.year.toString().padLeft(4, '0')}-${d.month.toString().padLeft(2, '0')}-'
    '${d.day.toString().padLeft(2, '0')}';

/// `TT.MM.JJJJ` fuer die Anzeige.
String schweizerDatum(DateTime d) =>
    '${d.day.toString().padLeft(2, '0')}.${d.month.toString().padLeft(2, '0')}.${d.year}';
