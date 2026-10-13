// Vertrag Organisator-Uebersicht: die App muss
// docker/backend-events/test/fixtures/organisator-uebersicht.json so
// verstehen, wie der echte Server sie liefert (geschrieben von
// test/app-vertrag.test.js). Die Datei wird aus dem Repo gelesen, nie kopiert.

import 'dart:convert';
import 'dart:io';

import 'package:flutter_test/flutter_test.dart';
import 'package:fwv_anlass/fwv_anlass.dart';
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
  late VerwaltungsUebersicht u;
  setUpAll(() => u = VerwaltungsUebersicht.ausJson(_vertrag('organisator-uebersicht.json')));

  VerwalteterAnlass anlass(String slug) => u.anlaesse.singleWhere((a) => a.anlass.slug == slug);

  test('Zugang und Reihenfolge', () {
    expect(u.zugang, ZugangsArt.mitglied);
    expect(u.anlaesse.map((a) => a.anlass.titel), ['Chilbi 2026', 'Helferessen']);
    expect(u.anlassMitId('00000000-0000-0000-0000-e00000000001')?.anlass.slug, 'chilbi-2026');
    expect(u.anlassMitId('helferessen')?.anlass.titel, 'Helferessen');
  });

  test('Chilbi: Zahlen, Aktionen, Anmeldungen mit Schichten', () {
    final c = anlass('chilbi-2026');
    expect(c.aktuell, isTrue);
    expect(c.anlass.app.datumText, 'Sa 17.10. – So 18.10.2026');
    expect(c.anlass.app.kannBearbeiten, isTrue);
    expect(c.anlass.organisator, 'Erika Muster');
    expect(c.anlass.app.logo, Uri.parse('https://www.fwv-raura.ch/images/anlaesse/chilbi.png'));
    expect(c.anlass.app.reihe, 'chilbi');
    expect(anlass('helferessen').anlass.app.logo, isNull);
    expect(c.zahlen.text, '3 bestätigt · 1 offen · 4 Personen');
    expect((c.zahlen.offen, c.zahlen.bestaetigt, c.zahlen.personenTotal), (1, 3, 4));
    expect(c.rechte.anlassBearbeiten, isTrue);
    expect(c.rechte.alternative, isTrue);
    expect(c.rechte.arbeitsplanSenden, isFalse);
    expect(c.rechte.pdfArbeitsplan, isTrue);
    expect(c.rechte.pdfAushang, isFalse);

    final erste = c.anmeldungen.first;
    expect(erste.name, 'Gast Neu');
    expect(erste.offen, isTrue);
    expect(erste.statusText, 'offen');
    expect(erste.statusFarbe, 'gelb');
    expect(erste.art, AnmeldeArt.schicht);
    expect(erste.telefon, '061 000 00 00');
    expect(erste.bemerkung, 'Nur bis 19 Uhr');
    expect(erste.schichten.single.beschriftung, 'Küche – Schicht 2 · Sa 17.10. · 17:00–20:00');
    expect(erste.angemeldetText, '15.09.2026');

    final erika = c.anmeldungen.singleWhere((a) => a.name == 'Erika Muster');
    expect(erika.mitglied, isTrue);
    expect(erika.email, 'erika@example.ch');
    expect(erika.schichtIds, hasLength(2));
    expect(c.anmeldungen.singleWhere((a) => a.name == 'Gast Koch').bemerkung, 'Bringt Schürze mit');

    final schicht = c.anlass.schichten.firstWhere((s) => s.name == 'Schicht 1');
    expect(schicht.bereich, 'Bar');
    expect(schicht.datum, '2026-10-17');
    expect(schicht.beginn, '12:00:00');
    expect(schicht.app.belegung.text, 'voll');
  });

  test('Helferessen: Begleitpersonen, Allergien, Menue, Menue-Optionen', () {
    final h = anlass('helferessen');
    expect(h.anlass.menueOptionen, ['Fleisch', 'Vegi']);
    expect(h.anlass.maxTeilnehmer, 2);
    expect(h.anlass.kategorie, 'GV');
    final paar = h.anmeldungen.first;
    expect(paar.name, 'Paar Gast');
    expect(paar.art, AnmeldeArt.teilnahme);
    expect(paar.personen, 2);
    expect(paar.begleitpersonen.single.name, 'Peter Gast');
    expect(paar.allergien, 'Nüsse');
    expect(paar.menue, 'Vegi');
    expect(paar.bemerkung, 'Kommen etwas später');
    expect(paar.telefon, '+41 79 111 22 33');
    expect(h.anmeldungen.last.statusText, 'abgelehnt');
    expect(h.zahlen.text, '1 offen · 2 Personen');
    expect(h.rechte.alternative, isFalse, reason: 'keine Schichten');
  });

  test('Bearbeiten-Formular aus dem Vertrag: unveraendert -> nichts zu senden', () {
    final h = anlass('helferessen').anlass;
    final original = AnlassEntwurf.aus(h);
    final neu = AnlassEntwurf.aus(h);
    expect(neu.aenderungen(original), isEmpty);
    expect(original.beginn!.alsDb(), '2026-10-31 19:00:00');

    final schicht = anlass('chilbi-2026').anlass.schichten.first;
    expect(SchichtEntwurf.aus(schicht).aenderungen(SchichtEntwurf.aus(schicht)), isEmpty);

    final reg = anlass('helferessen').anmeldungen.first;
    expect(AnmeldungEntwurf.aus(reg).aenderungen(AnmeldungEntwurf.aus(reg), gast: true), isEmpty);
  });
}
