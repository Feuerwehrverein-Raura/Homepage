// Kassen-/Kuechen-Token des Bestellsystems (JWT, 30 Tage gueltig).
// Massgebend ist das Ablaufdatum im Token (exp). Die App erneuert es selbst
// (POST /api/auth/refresh), sobald es aelter als ein Tag ist - so laeuft sie
// ohne erneute Passworteingabe, solange sie alle 30 Tage einmal online ist.

import 'dart:convert';

const erneuernUnterRestlaufzeit = Duration(days: 29);

/// Ablaufzeit aus dem JWT, null wenn nicht lesbar oder ohne exp.
DateTime? tokenAblauf(String token) {
  final teile = token.split('.');
  if (teile.length < 2) return null;
  try {
    final nutz = utf8.decode(base64Url.decode(base64Url.normalize(teile[1])));
    final exp = (jsonDecode(nutz) as Map)['exp'];
    if (exp is! num) return null;
    return DateTime.fromMillisecondsSinceEpoch(exp.toInt() * 1000, isUtc: true);
  } on Object {
    return null;
  }
}

bool tokenGueltig(String? token, DateTime jetzt) {
  if (token == null || token.isEmpty) return false;
  final ablauf = tokenAblauf(token);
  return ablauf == null || ablauf.isAfter(jetzt); // ohne exp: der Server entscheidet
}

bool tokenErneuern(String? token, DateTime jetzt) {
  if (token == null || token.isEmpty) return false;
  final ablauf = tokenAblauf(token);
  return ablauf != null && ablauf.difference(jetzt) < erneuernUnterRestlaufzeit;
}

/// «Noch 2 Versuche übrig» aus dem Fehlertext des Servers.
int? restVersuche(String? text) {
  final m = RegExp(r'Noch (\d+) Versuch').firstMatch(text ?? '');
  return m == null ? null : int.tryParse(m.group(1)!);
}

/// "2.10" > "2.9"; fehlende Stellen zaehlen als 0.
int versionVergleichen(String a, String b) {
  List<int> teile(String v) =>
      v.split('.').map((t) => int.tryParse(t.replaceAll(RegExp(r'[^0-9]'), '')) ?? 0).toList();
  final x = teile(a), y = teile(b);
  for (var i = 0; i < (x.length > y.length ? x.length : y.length); i++) {
    final d = (i < x.length ? x[i] : 0) - (i < y.length ? y[i] : 0);
    if (d != 0) return d.sign;
  }
  return 0;
}
