// Ein Anlass als iCalendar-Datei (.ics) fuer "Zum Kalender".
//
// Das Backend hat bisher nur den ganzen Feed (`GET calendar/ics`), keine
// Datei pro Anlass — deshalb baut die App sie hier selbst aus `start_date`/
// `end_date`. Die Werte sind Ortszeit Zuerich ohne Zone
// ("2026-10-17 10:00:00"); Mitternacht heisst "ganztaegig" (so speichert das
// Backend ganztaegige Anlaesse, siehe `zerlege` in app-ansicht.js).
// Kandidat fuers Backend: `GET events/:id/ics`.

import 'dart:convert';

import 'anlass.dart';

/// Inhalt einer .ics-Datei fuer [anlass], oder null, wenn das Datum fehlt
/// oder noch offen ist (dann ist `start_date` nur ein Platzhalter).
/// [jetzt] nur fuer Tests (DTSTAMP).
String? anlassAlsIcs(Anlass anlass, {DateTime? jetzt}) {
  if (anlass.app.datumOffen) return null;
  final beginn = _zerlege(anlass.beginn);
  if (beginn == null) return null;
  final ende = _zerlege(anlass.ende);
  final ganztags = beginn.zeit == null;

  final zeilen = <String>[
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Feuerwehrverein Raura//Mitglieder-App//DE',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    if (!ganztags) ..._vtimezoneZuerich,
    'BEGIN:VEVENT',
    'UID:anlass-${anlass.id}@fwv-raura.ch',
    'DTSTAMP:${_utc(jetzt ?? DateTime.now())}',
    if (ganztags) ...[
      'DTSTART;VALUE=DATE:${beginn.datum}',
      // Ende ist bei ganztaegigen Eintraegen exklusiv: Tag danach.
      'DTEND;VALUE=DATE:${_tagDanach(ende?.datum ?? beginn.datum)}',
    ] else ...[
      'DTSTART;TZID=Europe/Zurich:${beginn.datum}T${beginn.zeit}',
      if (ende != null) 'DTEND;TZID=Europe/Zurich:${ende.datum}T${ende.zeit ?? '235900'}',
    ],
    'SUMMARY:${_text(anlass.titel)}',
    if (anlass.ort != null) 'LOCATION:${_text(anlass.ort!)}',
    if (_beschreibung(anlass) case final b?) 'DESCRIPTION:${_text(b)}',
    'END:VEVENT',
    'END:VCALENDAR',
  ];
  return '${zeilen.map(_falten).join('\r\n')}\r\n';
}

/// Dateiname ohne Sonderzeichen: "Chilbi_2026.ics".
String icsDateiname(Anlass anlass) {
  final basis = anlass.titel
      .replaceAll(RegExp(r'[^A-Za-z0-9ÄÖÜäöüéèàç -]'), '')
      .trim()
      .replaceAll(RegExp(r'\s+'), '_');
  return '${basis.isEmpty ? 'Anlass' : basis}.ics';
}

String? _beschreibung(Anlass a) {
  final teile = [?a.untertitel, ?a.beschreibung];
  return teile.isEmpty ? null : teile.join('\n\n');
}

class _Zeitpunkt {
  const _Zeitpunkt(this.datum, this.zeit);

  /// YYYYMMDD
  final String datum;

  /// HHMMSS, null bei Mitternacht (ganztaegig)
  final String? zeit;
}

_Zeitpunkt? _zerlege(String? wert) {
  if (wert == null) return null;
  final m = RegExp(r'^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2}))?').firstMatch(wert);
  if (m == null) return null;
  final datum = '${m[1]}${m[2]}${m[3]}';
  final zeit = m[4] == null || (m[4] == '00' && m[5] == '00') ? null : '${m[4]}${m[5]}00';
  return _Zeitpunkt(datum, zeit);
}

String _tagDanach(String yyyymmdd) {
  final d = DateTime.utc(
    int.parse(yyyymmdd.substring(0, 4)),
    int.parse(yyyymmdd.substring(4, 6)),
    int.parse(yyyymmdd.substring(6, 8)) + 1,
  );
  return '${d.year.toString().padLeft(4, '0')}${_zwei(d.month)}${_zwei(d.day)}';
}

String _utc(DateTime t) {
  final u = t.toUtc();
  return '${u.year.toString().padLeft(4, '0')}${_zwei(u.month)}${_zwei(u.day)}'
      'T${_zwei(u.hour)}${_zwei(u.minute)}${_zwei(u.second)}Z';
}

String _zwei(int n) => n.toString().padLeft(2, '0');

/// Text-Werte nach RFC 5545 maskieren.
String _text(String s) => s
    .replaceAll(r'\', r'\\')
    .replaceAll(';', r'\;')
    .replaceAll(',', r'\,')
    .replaceAll(RegExp(r'\r\n|\r|\n'), r'\n');

/// Zeilen ueber 75 Bytes falten (Folgezeilen beginnen mit Leerzeichen).
/// Mehrbyte-Zeichen werden nicht zerschnitten.
String _falten(String zeile) {
  if (utf8.encode(zeile).length <= 75) return zeile;
  final teile = <String>[];
  final puffer = StringBuffer();
  var bytes = 0;
  var grenze = 75;
  for (final r in zeile.runes) {
    final zeichen = String.fromCharCode(r);
    final laenge = utf8.encode(zeichen).length;
    if (bytes + laenge > grenze) {
      teile.add(puffer.toString());
      puffer.clear();
      bytes = 0;
      grenze = 74; // Platz fuer das fuehrende Leerzeichen
    }
    puffer.write(zeichen);
    bytes += laenge;
  }
  teile.add(puffer.toString());
  return teile.join('\r\n ');
}

/// Mitteleuropaeische Zeit mit Sommerzeit (seit 1996 unveraendert).
const _vtimezoneZuerich = [
  'BEGIN:VTIMEZONE',
  'TZID:Europe/Zurich',
  'BEGIN:DAYLIGHT',
  'TZOFFSETFROM:+0100',
  'TZOFFSETTO:+0200',
  'TZNAME:CEST',
  'DTSTART:19700329T020000',
  'RRULE:FREQ=YEARLY;BYMONTH=3;BYDAY=-1SU',
  'END:DAYLIGHT',
  'BEGIN:STANDARD',
  'TZOFFSETFROM:+0200',
  'TZOFFSETTO:+0100',
  'TZNAME:CET',
  'DTSTART:19701025T030000',
  'RRULE:FREQ=YEARLY;BYMONTH=10;BYDAY=-1SU',
  'END:STANDARD',
  'END:VTIMEZONE',
];
