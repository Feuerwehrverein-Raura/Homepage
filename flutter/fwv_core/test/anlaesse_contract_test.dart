// Vertrags-Tests: die App muss Anlaesse, eigene Anmeldungen und Kalender so
// verstehen, wie das Backend sie liefert (docker/backend-events/test/
// fixtures/, geschrieben von test/app-vertrag.test.js gegen den echten
// Server). Die Dateien werden nie kopiert, sondern aus dem Repo gelesen —
// aendert sich das Format nur auf einer Seite, wird die CI rot.

import 'dart:convert';
import 'dart:io';

import 'package:flutter_test/flutter_test.dart';
import 'package:fwv_core/fwv_core.dart';

Object? _vertrag(String name) {
  var dir = Directory.current;
  while (true) {
    final f = File('${dir.path}/docker/backend-events/test/fixtures/$name');
    if (f.existsSync()) return jsonDecode(f.readAsStringSync());
    if (dir.parent.path == dir.path) throw StateError('Vertragsdatei $name nicht gefunden');
    dir = dir.parent;
  }
}

void main() {
  group('anlaesse-app.json (GET events?aktuell=true)', () {
    late List<Anlass> anlaesse;
    Anlass titel(String t) => anlaesse.singleWhere((a) => a.titel == t);

    setUpAll(() {
      final json = _vertrag('anlaesse-app.json');
      anlaesse = [for (final e in json as List) Anlass.ausJson(e)];
    });

    test('Reihenfolge wie vom Backend, Abgesagte/Vergangene fehlen', () {
      expect(anlaesse.map((a) => a.titel), [
        'Herbstmarkt',
        'Chilbi 2026',
        'Vereinsausflug',
        'Helferessen',
        'Grillabend',
        'Bäckerei-Besuch',
        'Rega Besichtigung',
      ]);
      expect(anlaesse.map((a) => a.app.gruppe), [
        ...List.filled(5, AnlassGruppe.kommend),
        AnlassGruppe.datumOffen,
        AnlassGruppe.datumOffen,
      ]);
    });

    test('Ideen ohne Datum (draft): "Datum noch offen", keine Anmeldung', () {
      final idee = titel('Rega Besichtigung');
      expect(idee.status, 'draft');
      expect(idee.app.datumOffen, isTrue);
      expect(idee.app.datumText, 'Datum noch offen');
      expect(idee.app.zeitText, isNull);
      expect(idee.app.anmeldung.moeglich, isFalse);
      expect(idee.app.anmeldung.grund, 'Anmeldung, sobald das Datum feststeht');
      expect(anlassAlsIcs(idee), isNull, reason: 'Platzhalter-Datum nie exportieren');
      expect(titel('Chilbi 2026').app.datumOffen, isFalse);
    });

    test('Chilbi: Schicht-Anmeldung mit Datum, Zeit und Schichten', () {
      final a = titel('Chilbi 2026');
      expect(a.id, '00000000-0000-0000-0000-e00000000001');
      expect(a.slug, 'chilbi-2026');
      expect(a.ort, 'Roter Schopf');
      expect(a.kategorie, 'Dorffest');
      expect(a.beginn, '2026-10-17 10:00:00');
      expect(a.app.datumText, 'Sa 17.10. – So 18.10.2026');
      expect(a.app.zeitText, 'ab 10:00 Uhr');
      expect(a.app.abgesagt, isFalse);
      expect(a.app.kannBearbeiten, isFalse);
      final anm = a.app.anmeldung;
      expect(anm.moeglich, isTrue);
      expect(anm.grund, isNull);
      expect(anm.art, AnmeldeArt.schicht);
      expect(anm.pflicht, isTrue);
      expect(anm.anmeldeschlussText, 'Donnerstag, 15. Oktober 2026, 23:59 Uhr');
      expect(anm.plaetzeText, isNull);

      expect(a.schichten.map((s) => s.app.bereichText), ['Aufbau', 'Bar', 'Küche']);
      expect(a.schichten.map((s) => s.app.belegung.text), [
        '3 Plätze frei',
        'voll',
        '1 Platz frei',
      ]);
      expect(a.schichten.map((s) => s.app.waehlbar), [true, false, true]);
      final kueche = a.schichten[2];
      expect(kueche.id, '00000000-0000-0000-0000-500000000003');
      expect(kueche.app.datumText, 'Samstag, 17. Oktober 2026');
      expect(kueche.app.zeitText, '17:00–20:00 Uhr');
      expect(kueche.app.belegung.besetzt, 1);
      expect(kueche.app.belegung.gebraucht, 2);
      expect(kueche.app.belegung.offen, 1);
      expect(kueche.app.belegung.angefragt, 1);
      expect(a.schichten[0].app.zeitText, '08:00 Uhr');
    });

    test('Gruende, warum keine Anmeldung geht', () {
      final ausflug = titel('Vereinsausflug').app.anmeldung;
      expect(ausflug.moeglich, isFalse);
      expect(ausflug.grund, 'Anmeldeschluss vorbei');
      expect(ausflug.art, AnmeldeArt.teilnahme);
      expect(ausflug.plaetzeFrei, 9);
      expect(ausflug.plaetzeText, '9 Plätze frei');

      final essen = titel('Helferessen').app.anmeldung;
      expect(essen.grund, 'Ausgebucht');
      expect(essen.plaetzeText, 'voll');

      final grill = titel('Grillabend');
      expect(grill.app.anmeldung.grund, 'Keine Anmeldung nötig');
      expect(grill.app.anmeldung.art, isNull);
      expect(grill.app.datumText, 'Samstag, 7. November 2026');
      expect(grill.app.zeitText, '18:00 Uhr');
      expect(grill.ende, isNull);
    });

    test('Laufender Anlass: Teilnahme möglich', () {
      final markt = titel('Herbstmarkt');
      expect(markt.ort, isNull);
      expect(markt.app.datumText, 'Sa 10.10. – So 11.10.2026');
      expect(markt.app.anmeldung.moeglich, isTrue);
      expect(markt.app.anmeldung.art, AnmeldeArt.teilnahme);
      expect(markt.hatSchichten, isFalse);
    });

    test('Logo und Reihe: nur die Chilbi hat ein Logo', () {
      final chilbi = titel('Chilbi 2026');
      expect(chilbi.app.logo, Uri.parse('https://www.fwv-raura.ch/images/anlaesse/chilbi.png'));
      expect(chilbi.app.reihe, 'chilbi');
      for (final a in anlaesse.where((a) => a.titel != 'Chilbi 2026')) {
        expect(a.app.logo, isNull, reason: a.titel);
        expect(a.app.reihe, isNull, reason: a.titel);
      }
    });
  });

  group('meine-anmeldungen.json (GET registrations/mine)', () {
    late List<MeineAnmeldung> liste;

    setUpAll(() {
      final json = _vertrag('meine-anmeldungen.json');
      liste = [for (final e in json as List) MeineAnmeldung.ausJson(e as Map<String, dynamic>)];
    });

    test('Status-Text und Farbe kommen fertig', () {
      expect(liste.map((r) => r.anlassTitel), [
        'Helferessen',
        'Vereinsausflug',
        'Chilbi 2026',
        'Vergangener Anlass',
      ]);
      expect(liste.map((r) => r.statusText), ['abgelehnt', 'offen', 'bestätigt', 'bestätigt']);
      expect(liste.map((r) => r.statusFarbe), [
        StatusFarbe.rot,
        StatusFarbe.gelb,
        StatusFarbe.gruen,
        StatusFarbe.gruen,
      ]);
    });

    test('Chilbi: Datum und Schicht-Beschriftungen', () {
      final c = liste[2];
      expect(c.anlassId, '00000000-0000-0000-0000-e00000000001');
      expect(c.anlassOrt, 'Roter Schopf');
      expect(c.anlassDatumText, 'Sa 17.10. – So 18.10.2026');
      expect(c.schichten.map((s) => s.beschriftung), [
        'Aufbau · Fr 16.10. · 08:00',
        'Bar – Schicht 1 · Sa 17.10. · 12:00–14:00',
      ]);
    });
  });

  group('kalender-app.json (GET calendar/items)', () {
    late List<KalenderEintrag> eintraege;

    setUpAll(() {
      final json = _vertrag('kalender-app.json');
      eintraege = [
        for (final e in json as List) KalenderEintrag.ausJson(e as Map<String, dynamic>),
      ];
    });

    test('Einträge, Typen, Datum und datum_text', () {
      expect(eintraege, hasLength(8));
      expect(eintraege.first.typ, 'fee_paid');
      expect(eintraege.first.istAnlass, isFalse);
      expect(eintraege.first.datumText, 'Mittwoch, 15. April 2026');
      expect(eintraege.last.titel, 'Mitgliederbeitrag 2027 faellig');
      expect(eintraege.last.datum, DateTime(2027, 3, 31));

      final chilbi = eintraege.singleWhere((e) => e.titel == 'Chilbi 2026');
      expect(chilbi.istAnlass, isTrue);
      expect(chilbi.refId, '00000000-0000-0000-0000-e00000000001');
      expect(chilbi.datum, DateTime(2026, 10, 17));
      expect(chilbi.untertitel, '10:00 · Roter Schopf');
      expect(chilbi.datumText, 'Samstag, 17. Oktober 2026');
    });

    test('keine E-Mails/Briefe und keine Ideen ohne Datum', () {
      expect(eintraege.map((e) => e.typ).toSet(), {'fee_paid', 'event', 'fee_due'});
      expect(eintraege.map((e) => e.titel), isNot(contains('Rega Besichtigung')));
    });
  });

  group('robust bei fehlenden Schlüsseln', () {
    test('leerer Anlass', () {
      final a = Anlass.ausJson({'id': 'x'});
      expect(a.titel, '');
      expect(a.app.anmeldung.moeglich, isFalse);
      expect(a.app.anmeldung.art, isNull);
      expect(a.app.gruppe, AnlassGruppe.kommend);
      expect(AnlassApp.ausJson({'datum_offen': true}).gruppe, AnlassGruppe.datumOffen);
      expect(a.schichten, isEmpty);
      expect(a.app.logo, isNull);
      expect(a.app.reihe, isNull);
      expect(AnlassApp.ausJson({'logo': 'http://example.ch/a.png'}).logo, isNull);
      expect(AnlassApp.ausJson({'logo': '/images/a.png'}).logo, isNull);
      expect(AnlassApp.ausJson({'logo': 42}).logo, isNull);
      expect(Anlass.ausJson(null).id, '');
      final s = Schicht.ausJson({'id': 's', 'app': 'kaputt'});
      expect(s.app.waehlbar, isFalse);
      expect(s.app.belegung.text, isNull);
    });

    test('Anmeldung ohne Status-Farbe ist grau', () {
      final r = MeineAnmeldung.ausJson({'id': 'r', 'shifts': 'x'});
      expect(r.statusFarbe, StatusFarbe.grau);
      expect(r.schichten, isEmpty);
    });
  });
}
