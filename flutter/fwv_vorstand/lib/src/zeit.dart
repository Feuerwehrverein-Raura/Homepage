// Zeitstempel aus api-members (created_at, processed_at, Audit): Das Backend
// reicht TIMESTAMP-Spalten roh als Text ohne Zeitzone durch
// ("2026-10-14 12:43:26.740218"). Gespeichert ist UTC (NOW() auf dem
// Server). Ohne Angabe gelesen, zeigte die App UTC als Ortszeit - zwei
// Stunden zu frueh. Nur fuer solche Protokollzeiten: Anlasszeiten wie
// "17:00" sind Ortszeit und laufen weiter ueber jsonZeitpunkt.

import 'package:fwv_core/fwv_core.dart';

final _mitZone = RegExp(r'(Z|[+-]\d\d(:?\d\d)?)$');

DateTime? utcZeitpunkt(Object? wert) {
  final t = jsonText(wert);
  if (t == null) return null;
  final iso = t.contains(' ') && !t.contains('T') ? t.replaceFirst(' ', 'T') : t;
  return DateTime.tryParse(_mitZone.hasMatch(iso) ? iso : '${iso}Z')?.toLocal();
}
