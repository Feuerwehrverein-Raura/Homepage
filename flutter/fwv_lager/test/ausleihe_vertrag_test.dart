// Vertrag mit der Inventar-API zur Ausleihe: test/fixtures/ausleihe-api.json
// enthaelt echte Antworten (geschrieben und geprueft von
// simple-inventory-system/backend/test/ausleihe.test.mjs). Hier wird
// geprueft, dass die App jede Antwort versteht.

import 'package:flutter_test/flutter_test.dart';
import 'package:fwv_lager/fwv_lager.dart';

import 'ausleihe_vertrag.dart';

Map<String, dynamic> _m(Object? o) => Map<String, dynamic>.from(o as Map);

void main() {
  final v = ausleiheVertrag();

  test('Angebot: Artikel mit freier Menge, Kisten mit Inhalt', () {
    final a = AusleiheAngebot.ausJson(v['angebot']);
    expect(a.von, DateTime(2026, 10, 13));
    expect(a.bis, DateTime(2026, 10, 15));
    expect(a.zeitraumText, '13.10.2026 – 15.10.2026');
    expect(
      [for (final x in a.artikel) (x.id, x.name, x.frei, x.freiText)],
      [(2, 'Teller', 50, '50 Stück frei'), (1, 'Festbank', 10, '10 Stück frei')],
    );
    expect(a.artikel.first.kategorie, 'Geschirr');
    final k = a.kisten.single;
    expect((k.name, k.frei, k.freiText), ('Festkiste', true, 'Frei'));
    expect(k.inhalt.map((i) => i.anzeige), ['6 Flasche Mineral', '20 Stück Teller']);
    expect(k.inhalt.first.id, isNull, reason: 'noch nicht festgehalten');

    final belegt = AusleiheAngebot.ausJson(v['angebot_belegt']);
    expect(belegt.artikel.first.frei, 0);
    expect(belegt.artikel.first.freiText, 'Ausgebucht');
    expect(belegt.kisten.single.frei, isFalse);
    expect(belegt.kisten.single.freiText, 'Schon ausgeliehen');
  });

  test('Neue Ausleihe eines Mitglieds', () {
    final a = Ausleihe.ausAntwort(v['ausleihe_neu']);
    expect(a.status, AusleiheStatus.reserviert);
    expect(a.extern, isFalse);
    expect(a.mitgliedName, 'Erika Muster');
    expect(a.notizen, 'Geburtstag');
    expect(a.positionenText, '30 Stück Teller');
    expect(a.app.statusText, 'Reserviert');
    expect(a.app.statusFarbe, 'gelb');
    expect(a.app.zeitraumText, '13.10.2026 – 15.10.2026');
    expect(a.app.hinweis, 'Abholen ab 13.10.2026');
    expect(a.app.kannAbsagen, isTrue);
    expect(a.app.kannAusgeben, isFalse, reason: 'Sicht des Mitglieds');
    expect(Ausleihe.ausJson(_m((v['meine'] as List).single)).id, a.id);
  });

  test('Externe mit Kiste: reserviert (heutiger Inhalt), ausgegeben (festgehalten)', () {
    final r = Ausleihe.ausAntwort(v['ausleihe_extern']);
    expect(r.extern, isTrue);
    expect(r.app.ausleiherText, 'Hans Muster, Turnverein');
    expect((r.externTelefon, r.externEmail), ('079 123 45 67', 'hans@example.ch'));
    final p = r.positionen.single;
    expect(p.istKiste, isTrue);
    expect(p.anzeige, 'Festkiste');
    expect(p.inhalt.every((i) => i.id == null), isTrue);
    expect(r.app.kannAusgeben, isTrue);

    final g = Ausleihe.ausAntwort(v['ausleihe_ausgegeben']);
    expect(g.status, AusleiheStatus.ausgegeben);
    expect(g.app.kannZuruecknehmen, isTrue);
    expect(g.positionen.single.inhalt.every((i) => i.id != null), isTrue);
  });

  test('Rueckgabe mit Schaden, Foto und Kiste mit Fehlendem', () {
    final a = Ausleihe.ausAntwort(v['ausleihe_zurueck']);
    expect(a.status, AusleiheStatus.zurueckgegeben);
    expect(a.rueckgabeNotiz, 'Sonst sauber');
    final p = a.positionen.single;
    expect(
      (p.zurueckMenge, p.zustand, p.zustandText, p.schaden),
      (27, Zustand.beschaedigt, 'Beschädigt', '3 Teller zerbrochen'),
    );
    expect(a.fotos.single.bild, '/api/uploads/item-foto.jpg');
    expect(a.fotos.single.positionId, p.id);
    expect(AusleiheFoto.ausJson(_m(v['foto'])).id, 1);

    final k = Ausleihe.ausAntwort(v['ausleihe_zurueck_kiste']).positionen.single;
    expect(k.zustand, Zustand.fehlt);
    expect(
      [for (final z in k.inhalt) (z.name, z.zurueckMenge, z.zustand)],
      [('Mineral', 4, Zustand.fehlt), ('Teller', 20, Zustand.ok)],
    );
  });

  test('Abgesagt, ueberfaellig, Listen', () {
    final ab = Ausleihe.ausAntwort(v['ausleihe_abgesagt']);
    expect(ab.status, AusleiheStatus.abgesagt);
    expect(ab.app.kannAbsagen, isFalse);

    final u = Ausleihe.ausJson(_m((v['ueberfaellig'] as List).single));
    expect(u.app.ueberfaellig, isTrue);
    expect(u.app.statusText, 'Überfällig');
    expect(u.app.statusFarbe, 'rot');
    expect(u.app.hinweis, 'Seit 2 Tagen überfällig');
    expect((v['ausgegeben'] as List).length, 2);
  });

  test('409-Meldung und ausleihbar', () {
    expect(
      _m(v['ausleihe_409'])['error'],
      'Von «Teller» sind am 14.10.2026 nur noch 20 Stück frei.',
    );
    expect(Artikel.ausJson(_m(v['ausleihbar_artikel'])).ausleihbar, isTrue);
    expect(Lagerort.ausJson(_m(v['ausleihbar_lagerort'])).ausleihbar, isTrue);
  });

  test('Anfragen an das Backend', () {
    final neu = NeueAusleihe(
      von: DateTime(2026, 10, 13),
      bis: DateTime(2026, 10, 15),
      artikel: const {2: 30, 1: 0},
      kisten: const {2},
      notizen: '  ',
      extern: const ExternePerson(name: ' Hans ', organisation: 'Turnverein', telefon: ' '),
    );
    expect(neu.alsJson(), {
      'von': '2026-10-13',
      'bis': '2026-10-15',
      'positionen': [
        {'item_id': 2, 'menge': 30},
        {'location_id': 2},
      ],
      'extern': {'name': 'Hans', 'organisation': 'Turnverein'},
    });
    expect(
      const Rueckgabe(
        notiz: 'ok',
        positionen: [
          RueckgabePosition(id: 1, zurueck: 27, zustand: Zustand.beschaedigt, schaden: '3 kaputt'),
          RueckgabePosition(
            id: 3,
            inhalt: [RueckgabeZeile(id: 1, zurueck: 4, zustand: Zustand.fehlt)],
          ),
        ],
      ).alsJson(),
      {
        'positionen': [
          {'id': 1, 'zurueck': 27, 'zustand': 'beschaedigt', 'schaden': '3 kaputt'},
          {
            'id': 3,
            'zustand': 'ok',
            'inhalt': [
              {'id': 1, 'zurueck': 4, 'zustand': 'fehlt'},
            ],
          },
        ],
        'notiz': 'ok',
      },
    );
  });

  test('kaputte Antworten fuehren nicht zum Absturz', () {
    final a = Ausleihe.ausJson({'id': '7', 'status': 'quatsch', 'positionen': 'x', 'app': null});
    expect(a.id, 7);
    expect(a.status, AusleiheStatus.reserviert);
    expect(a.positionen, isEmpty);
    expect(a.app.kannAbsagen, isFalse);
    expect(AusleiheAngebot.ausJson(null).leer, isTrue);
    expect(() => Ausleihe.ausAntwort(null), throwsFormatException);
  });
}
