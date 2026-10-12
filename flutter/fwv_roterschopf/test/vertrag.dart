// Vertragsdatei von api-members: GET /kiosk/roter-schopf. Geschrieben vom
// Backend-Test (docker/backend-members/test/roter-schopf.test.js); die Datei
// wird nie kopiert, sondern aus dem Repo gelesen.

import 'dart:convert';
import 'dart:io';

Map<String, dynamic> roterSchopfVertrag() {
  var dir = Directory.current;
  while (true) {
    final f = File('${dir.path}/docker/backend-members/test/fixtures/roter-schopf-app.json');
    if (f.existsSync()) return jsonDecode(f.readAsStringSync()) as Map<String, dynamic>;
    if (dir.parent.path == dir.path) {
      throw StateError('Vertragsdatei roter-schopf-app.json nicht gefunden');
    }
    dir = dir.parent;
  }
}
