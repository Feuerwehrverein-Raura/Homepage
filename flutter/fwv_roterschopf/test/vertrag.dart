// Vertragsdateien von api-members, geschrieben von den Backend-Tests
// (docker/backend-members/test/roter-schopf.test.js fuer GET
// /kiosk/roter-schopf, kiosk-musik.test.js fuer GET /kiosk/t400/musik). Die
// Dateien werden nie kopiert, sondern aus dem Repo gelesen.

import 'dart:convert';
import 'dart:io';

Map<String, dynamic> _lesen(String name) {
  var dir = Directory.current;
  while (true) {
    final f = File('${dir.path}/docker/backend-members/test/fixtures/$name');
    if (f.existsSync()) return jsonDecode(f.readAsStringSync()) as Map<String, dynamic>;
    if (dir.parent.path == dir.path) throw StateError('Vertragsdatei $name nicht gefunden');
    dir = dir.parent;
  }
}

Map<String, dynamic> roterSchopfVertrag() => _lesen('roter-schopf-app.json');

Map<String, dynamic> kioskMusikVertrag() => _lesen('kiosk-musik-app.json');
