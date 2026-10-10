// Vertrags-Test: die App muss den Arbeitsplan so verstehen, wie ihn das
// Backend liefert. Gleiche Datei wie Backend, Website und die alten Apps —
// aendert sich das Format nur auf einer Seite, wird die CI rot.
// Die Datei wird nie kopiert, sondern aus dem Repo gelesen.

import 'dart:convert';
import 'dart:io';

import 'package:flutter_test/flutter_test.dart';
import 'package:fwv_core/fwv_core.dart';

File _vertrag() {
  var dir = Directory.current;
  while (true) {
    final f = File('${dir.path}/docker/backend-events/test/fixtures/arbeitsplan.json');
    if (f.existsSync()) return f;
    if (dir.parent.path == dir.path) {
      throw StateError('Vertragsdatei arbeitsplan.json nicht gefunden');
    }
    dir = dir.parent;
  }
}

void main() {
  late Arbeitsplan plan;

  setUpAll(() {
    plan = Arbeitsplan.fromJson(jsonDecode(_vertrag().readAsStringSync()) as Map<String, dynamic>);
  });

  test('Kopf und Bereiche', () {
    expect(plan.verein, 'Feuerwehrverein Raura, Kaiseraugst');
    expect(plan.titel, 'Arbeitsplan Chilbi');
    expect(plan.anlass, 'Chilbi');
    expect(plan.bereiche, ['Allgemein', 'Bar', 'Grill']);
  });

  test('Tage und Zeitfenster', () {
    expect(plan.tage.map((t) => t.datum), ['2026-10-17', '2026-10-18']);
    expect(plan.tage.map((t) => t.bezeichnung), ['Samstag, 17.10.2026', 'Sonntag, 18.10.2026']);
    expect(plan.tage.map((t) => t.zeilen.length), [2, 1]);
    for (final z in plan.tage.expand((t) => t.zeilen)) {
      expect(z.zellen.length, plan.bereiche.length, reason: 'zellen parallel zu bereiche');
    }
  });

  test('Karten: nur Bereiche mit Schicht', () {
    final sa = plan.tage[0];
    final morgen = sa.zeilen[0].karte(plan.bereiche);
    expect(sa.zeilen[0].zeitText, '10:00–14:00 Uhr');
    expect(morgen.map((e) => e.bereich), ['Grill']);
    expect(morgen.single.namenText, 'noch niemand');
    expect(morgen.single.freiText, '1 Platz frei');

    final abend = sa.zeilen[1].karte(plan.bereiche);
    expect(abend.map((e) => e.bereich), ['Bar']);
    expect(abend.single.namenText, 'Anna A');
    expect(abend.single.freiText, '1 Platz frei');

    final so = plan.tage[1].zeilen[0].karte(plan.bereiche);
    expect(so.map((e) => e.bereich), ['Allgemein']);
    expect(so.single.namenText, 'Bea B, Cem C');
    expect(so.single.freiText, isNull, reason: 'überbucht: kein "frei"');
  });

  test('Mehrzahl und Grenzfälle', () {
    expect(const KartenEintrag(bereich: 'Bar', besetzt: [], offen: 3).freiText, '3 Plätze frei');
    final z = ArbeitsplanZeile.fromJson({
      'zeit': '08:00-09:00',
      'zellen': [null, {'besetzt': [], 'gebraucht': 1, 'offen': -2}],
    });
    expect(z.karte(['A', 'B']).single.freiText, isNull, reason: 'negativ wird 0');
    expect(z.karte(['A']), isEmpty, reason: 'fehlende Zellen werden übersprungen');
  });
}
