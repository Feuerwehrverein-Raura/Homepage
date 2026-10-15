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

/// "gerade eben", "vor 5 Minuten", "vor 3 Stunden", "gestern",
/// "vor 3 Tagen", "vor 2 Monaten", "vor 1 Jahr" - fuer "zuletzt gesehen".
String vorZeit(DateTime zeit, DateTime jetzt) {
  final d = jetzt.difference(zeit);
  String vor(int n, String eins, String mehr) => 'vor $n ${n == 1 ? eins : mehr}';
  if (d.inMinutes < 1) return 'gerade eben';
  if (d.inMinutes < 60) return vor(d.inMinutes, 'Minute', 'Minuten');
  if (d.inHours < 24) return vor(d.inHours, 'Stunde', 'Stunden');
  if (d.inDays < 2) return 'gestern';
  if (d.inDays < 31) return vor(d.inDays, 'Tag', 'Tagen');
  if (d.inDays < 365) return vor(d.inDays ~/ 30, 'Monat', 'Monaten');
  return vor(d.inDays ~/ 365, 'Jahr', 'Jahren');
}
