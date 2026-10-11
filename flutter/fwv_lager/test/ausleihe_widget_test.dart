// Oberflaeche der Ausleihe mit nachgebautem Zugang (Daten aus der
// Vertragsdatei, "heute" = 11.10.2026) — auf Handy-Breite, hell und
// dunkel. Ueberlaeufe (seitliches Abschneiden) lassen die Tests scheitern.

import 'dart:typed_data';

import 'package:flutter_test/flutter_test.dart';
import 'package:fwv_core/fwv_core.dart';
import 'package:fwv_lager/fwv_lager.dart';
import 'package:material_ui/material_ui.dart';

import 'ausleihe_vertrag.dart';

Map<String, dynamic> _m(Object? o) => Map<String, dynamic>.from(o as Map);

class _FalscheAusleihe extends AusleiheZugang {
  _FalscheAusleihe() {
    for (final k in ['ausleihe_neu', 'ausleihe_extern']) {
      final a = Ausleihe.ausJson(_m(v[k]));
      daten[a.id] = a;
    }
    final u = Ausleihe.ausJson(_m((v['ueberfaellig'] as List).single));
    daten[u.id] = u;
  }

  final v = ausleiheVertrag();
  final daten = <int, Ausleihe>{};
  final aufrufe = <(String, List<Object?>)>[];
  bool belegt = false;
  int ueberbucht = 0;

  List<Object?> letzter(String name) => aufrufe.lastWhere((a) => a.$1 == name).$2;
  int anzahl(String name) => aufrufe.where((a) => a.$1 == name).length;

  Ausleihe _aus(String k) => Ausleihe.ausJson(_m(v[k]));

  @override
  Future<AusleiheAngebot> angebot(DateTime von, DateTime bis) async {
    aufrufe.add(('angebot', [isoDatum(von), isoDatum(bis)]));
    return AusleiheAngebot.ausJson(v[belegt ? 'angebot_belegt' : 'angebot']);
  }

  @override
  Future<Ausleihe> anlegen(NeueAusleihe neu) async {
    aufrufe.add(('anlegen', [neu.alsJson()]));
    if (ueberbucht > 0) {
      ueberbucht--;
      throw ApiFehler(_m(v['ausleihe_409'])['error'] as String, status: 409);
    }
    return neu.extern == null ? _aus('ausleihe_neu') : _aus('ausleihe_extern');
  }

  @override
  Future<List<Ausleihe>> meine() async => [daten[1]!];

  @override
  Future<List<Ausleihe>> liste(AusleiheFilter filter) async {
    aufrufe.add(('liste', [filter]));
    final alle = daten.values.toList();
    return switch (filter) {
      AusleiheFilter.kommend => [
        for (final a in alle)
          if (a.status == AusleiheStatus.reserviert) a,
      ],
      AusleiheFilter.ausgegeben => [
        for (final a in alle)
          if (a.status == AusleiheStatus.ausgegeben) a,
      ],
      AusleiheFilter.ueberfaellig => [
        for (final a in alle)
          if (a.app.ueberfaellig) a,
      ],
      AusleiheFilter.erledigt => [
        for (final a in alle)
          if (a.status == AusleiheStatus.zurueckgegeben || a.status == AusleiheStatus.abgesagt) a,
      ],
    };
  }

  @override
  Future<Ausleihe> ausleihe(int id) async => daten[id]!;

  @override
  Future<Ausleihe> absagen(int id) async {
    aufrufe.add(('absagen', [id]));
    return daten[id] = _aus('ausleihe_abgesagt');
  }

  @override
  Future<Ausleihe> ausgeben(int id) async {
    aufrufe.add(('ausgeben', [id]));
    return daten[id] = _aus('ausleihe_ausgegeben');
  }

  @override
  Future<Ausleihe> zuruecknehmen(int id, Rueckgabe rueckgabe) async {
    aufrufe.add(('zuruecknehmen', [id, rueckgabe.alsJson()]));
    return daten[id] = _aus(id == 3 ? 'ausleihe_zurueck_kiste' : 'ausleihe_zurueck');
  }

  @override
  Future<AusleiheFoto> fotoHochladen(int id, Uint8List jpeg, {int? positionId}) async {
    aufrufe.add(('foto', [id, jpeg.length, positionId]));
    return AusleiheFoto(id: 9, positionId: positionId, bild: '/api/uploads/x.jpg');
  }

  @override
  Future<void> fotoLoeschen(int id, int fotoId) async {}
}

void main() {
  late _FalscheAusleihe zugang;
  late Ausleihen ausleihen;

  Future<void> starten(
    WidgetTester tester,
    Widget Function(Ausleihen) screen, {
    bool dunkel = false,
  }) async {
    // Kleines Handy: 360 x 690 dp.
    tester.view.physicalSize = const Size(1080, 2070);
    tester.view.devicePixelRatio = 3;
    addTearDown(tester.view.reset);
    zugang = _FalscheAusleihe();
    ausleihen = Ausleihen(
      zugang: zugang,
      umgebung: AusleiheUmgebung(
        jetzt: () => DateTime(2026, 10, 11, 9),
        fotoWaehlen: ({required bool kamera}) async => Uint8List.fromList([1, 2, 3]),
        verkleinern: (roh) async => Uint8List.fromList([...roh, 4]),
      ),
    );
    await tester.pumpWidget(
      MaterialApp(
        theme: ThemeData(brightness: dunkel ? Brightness.dark : Brightness.light),
        home: screen(ausleihen),
      ),
    );
    await tester.pumpAndSettle();
  }

  /// Zeitraum 13.–15.10.2026 im Datumswaehler.
  Future<void> zeitraumWaehlen(WidgetTester tester) async {
    await tester.tap(find.byKey(const Key('zeitraum-waehlen')));
    await tester.pumpAndSettle();
    // Der Datumswaehler von Flutter: seine Kopfzeile laeuft nur mit der
    // breiten Test-Schrift (Ahem) ueber — nicht unser Code.
    tester.takeException();
    await tester.tap(find.text('13').first);
    await tester.pumpAndSettle();
    await tester.tap(find.text('15').first);
    await tester.pumpAndSettle();
    await tester.tap(find.text('OK'));
    await tester.pumpAndSettle();
  }

  testWidgets('Mitglied: Zeitraum, Mengen, Kiste, bestaetigen', (tester) async {
    await starten(tester, (a) => MeineAusleihenScreen(ausleihen: a));
    expect(find.text('13.10.2026 – 15.10.2026'), findsOneWidget);
    expect(find.text('Reserviert'), findsOneWidget);
    expect(find.text('30 Stück Teller'), findsOneWidget);

    await tester.tap(find.byKey(const Key('ausleihen-neu')));
    await tester.pumpAndSettle();
    expect(find.textContaining('Zuerst den Zeitraum wählen'), findsOneWidget);
    expect(tester.widget<FilledButton>(find.byKey(const Key('weiter'))).onPressed, isNull);

    await zeitraumWaehlen(tester);
    expect(zugang.letzter('angebot'), ['2026-10-13', '2026-10-15']);
    expect(find.text('50 Stück frei · Geschirr'), findsOneWidget);
    for (var i = 0; i < 3; i++) {
      await tester.tap(find.byKey(const Key('menge-2-plus')));
      await tester.pump();
    }
    expect(tester.widget<Text>(find.byKey(const Key('menge-2-wert'))).data, '3');
    await tester.tap(find.byKey(const Key('angebot-kiste-2')));
    await tester.pump();
    expect(find.text('Weiter (2)'), findsOneWidget);

    await tester.tap(find.byKey(const Key('weiter')));
    await tester.pumpAndSettle();
    expect(find.text('Ausleihe bestätigen'), findsOneWidget);
    expect(find.text('13.10.2026 – 15.10.2026'), findsOneWidget);
    expect(find.text('3 Stück'), findsOneWidget);
    expect(find.text('Festkiste'), findsOneWidget);
    expect(find.byKey(const Key('extern-name')), findsNothing);
    await tester.enterText(find.byKey(const Key('ausleihe-notiz')), 'Geburtstag');
    await tester.tap(find.byKey(const Key('ausleihen-absenden')));
    await tester.pumpAndSettle();

    expect(zugang.letzter('anlegen'), [
      {
        'von': '2026-10-13',
        'bis': '2026-10-15',
        'positionen': [
          {'item_id': 2, 'menge': 3},
          {'location_id': 2},
        ],
        'notizen': 'Geburtstag',
      },
    ]);
    expect(find.text('Meine Ausleihen'), findsOneWidget);
    expect(find.text('Reserviert — das Lager ist informiert.'), findsOneWidget);
    expect(tester.takeException(), isNull);
  });

  testWidgets('Inzwischen vergeben (409): Meldung, Angebot neu laden', (tester) async {
    await starten(
      tester,
      (a) => AusleiheNeuScreen(
        ausleihen: a,
        zeitraum: DateTimeRange(start: DateTime(2026, 10, 14), end: DateTime(2026, 10, 14)),
      ),
    );
    zugang.ueberbucht = 1;
    await tester.tap(find.byKey(const Key('menge-2-plus')));
    await tester.pump();
    await tester.tap(find.byKey(const Key('weiter')));
    await tester.pumpAndSettle();
    await tester.tap(find.byKey(const Key('ausleihen-absenden')));
    await tester.pumpAndSettle();
    expect(find.text('Nicht mehr frei'), findsOneWidget);
    expect(find.textContaining('nur noch 20 Stück frei'), findsOneWidget);

    zugang.belegt = true;
    await tester.tap(find.text('Auswahl anpassen'));
    await tester.pumpAndSettle();
    expect(zugang.anzahl('angebot'), 2, reason: 'neu geladen');
    expect(find.text('Ausgebucht · Geschirr'), findsOneWidget);
    expect(
      tester.widget<Text>(find.byKey(const Key('menge-2-wert'))).data,
      '0',
      reason: 'an frei angepasst',
    );
    expect(tester.widget<IconButton>(find.byKey(const Key('menge-2-plus'))).onPressed, isNull);
    expect(
      tester.widget<CheckboxListTile>(find.byKey(const Key('angebot-kiste-2'))).onChanged,
      isNull,
    );
    expect(
      find.text(
        'Schon ausgeliehen\nTeller und Mineral fürs Fest\nInhalt: 6 Flasche Mineral, 20 Stück Teller',
      ),
      findsOneWidget,
    );
  });

  testWidgets('Eigene Ausleihe absagen', (tester) async {
    await starten(tester, (a) => MeineAusleihenScreen(ausleihen: a));
    await tester.tap(find.byKey(const Key('ausleihe-1')));
    await tester.pumpAndSettle();
    expect(find.text('Abholen ab 13.10.2026'), findsOneWidget);
    expect(find.byKey(const Key('ausgeben')), findsNothing, reason: 'Mitglied gibt nicht aus');
    await tester.tap(find.byKey(const Key('absagen')));
    await tester.pumpAndSettle();
    await tester.tap(find.widgetWithText(FilledButton, 'Absagen'));
    await tester.pumpAndSettle();
    expect(zugang.letzter('absagen'), [1]);
    expect(find.text('Ausleihe abgesagt'), findsOneWidget);
    expect(find.byKey(const Key('absagen')), findsNothing);
  });

  testWidgets('Lager: Kommend -> ausgeben -> Kiste zuruecknehmen mit Fehlendem und Foto', (
    tester,
  ) async {
    await starten(tester, (a) => AusleihenVerwaltenScreen(ausleihen: a));
    expect(find.text('Hans Muster, Turnverein'), findsOneWidget);
    expect(find.text('Erika Muster'), findsOneWidget);
    await tester.tap(find.text('Hans Muster, Turnverein'));
    await tester.pumpAndSettle();
    expect(find.text('079 123 45 67'), findsOneWidget);
    expect(find.text('hans@example.ch'), findsOneWidget);

    await tester.tap(find.byKey(const Key('ausgeben')));
    await tester.pumpAndSettle();
    await tester.tap(find.widgetWithText(FilledButton, 'Ausgeben').last);
    await tester.pumpAndSettle();
    expect(zugang.letzter('ausgeben'), [3]);
    expect(find.text('Ausgegeben und ausgebucht'), findsOneWidget);

    await tester.tap(find.byKey(const Key('zuruecknehmen')));
    await tester.pumpAndSettle();
    expect(find.text('Rückgabe #3'), findsOneWidget);
    final c = Ausleihe.ausJson(_m(ausleiheVertrag()['ausleihe_ausgegeben'])).positionen.single;
    final mineral = c.inhalt.firstWhere((z) => z.name == 'Mineral');
    await tester.tap(find.byKey(Key('rueckgabe-zeile-${mineral.id}')));
    await tester.pumpAndSettle();
    // "In Ordnung" verlangt alles zurueck — Weniger schlaegt "Fehlt" vor.
    await tester.tap(find.byKey(const Key('zurueck-minus')));
    await tester.pump();
    await tester.tap(find.byKey(const Key('zurueck-minus')));
    await tester.pump();
    Finder segment(String text) =>
        find.descendant(of: find.byKey(const Key('zustand')), matching: find.text(text));
    expect(tester.widget<SegmentedButton<Zustand>>(find.byKey(const Key('zustand'))).selected, {
      Zustand.fehlt,
    });
    await tester.tap(segment('In Ordnung'));
    await tester.pump();
    expect(find.text('Bei «In Ordnung» muss alles zurück sein.'), findsOneWidget);
    expect(tester.widget<FilledButton>(find.byKey(const Key('rueckgabe-ok'))).onPressed, isNull);
    await tester.tap(segment('Fehlt'));
    await tester.pump();
    await tester.enterText(find.byKey(const Key('schaden')), '2 Flaschen fehlen');
    await tester.tap(find.byKey(const Key('foto-kamera')));
    await tester.pumpAndSettle();
    expect(find.text('1 Foto gespeichert'), findsOneWidget);
    expect(zugang.letzter('foto'), [3, 4, c.id], reason: 'verkleinert, zur Kiste');
    await tester.tap(find.byKey(const Key('rueckgabe-ok')));
    await tester.pumpAndSettle();
    expect(find.text('zurück 4 von 6 · Fehlt · 2 Flaschen fehlen'), findsOneWidget);

    await tester.tap(find.byKey(const Key('rueckgabe-buchen')));
    await tester.pumpAndSettle();
    await tester.tap(find.widgetWithText(FilledButton, 'Buchen'));
    await tester.pumpAndSettle();
    final teller = c.inhalt.firstWhere((z) => z.name == 'Teller');
    expect(zugang.letzter('zuruecknehmen'), [
      3,
      {
        'positionen': [
          {
            'id': c.id,
            'zustand': 'ok',
            'inhalt': [
              {'id': mineral.id, 'zurueck': 4, 'zustand': 'fehlt', 'schaden': '2 Flaschen fehlen'},
              {'id': teller.id, 'zurueck': 20, 'zustand': 'ok'},
            ],
          },
        ],
      },
    ]);
    expect(find.text('Zurückgenommen und eingebucht'), findsOneWidget);
    expect(find.text('Zurückgegeben'), findsOneWidget);
    expect(find.text('6 Flasche Mineral — zurück 4 von 6 · Fehlt'), findsOneWidget);
    expect(tester.takeException(), isNull);
  });

  testWidgets('Lager: Ueberfaellig und Externe erfassen', (tester) async {
    await starten(tester, (a) => AusleihenVerwaltenScreen(ausleihen: a));
    await tester.tap(find.text('Überfällig'));
    await tester.pumpAndSettle();
    expect(find.text('Seit 2 Tagen überfällig'), findsOneWidget);
    expect(zugang.letzter('liste'), [AusleiheFilter.ueberfaellig]);

    await tester.tap(find.byKey(const Key('ausleihe-extern')));
    await tester.pumpAndSettle();
    expect(find.text('Ausleihe für Externe'), findsOneWidget);
    await zeitraumWaehlen(tester);
    await tester.tap(find.byKey(const Key('angebot-kiste-2')));
    await tester.pump();
    await tester.tap(find.byKey(const Key('weiter')));
    await tester.pumpAndSettle();
    await tester.tap(find.byKey(const Key('ausleihen-absenden')));
    await tester.pumpAndSettle();
    expect(find.text('Bitte einen Namen angeben.'), findsOneWidget);
    expect(zugang.anzahl('anlegen'), 0);
    await tester.enterText(find.byKey(const Key('extern-name')), 'Hans Muster');
    await tester.enterText(find.byKey(const Key('extern-organisation')), 'Turnverein');
    await tester.enterText(find.byKey(const Key('extern-email')), 'hans@');
    await tester.tap(find.byKey(const Key('ausleihen-absenden')));
    await tester.pumpAndSettle();
    expect(find.text('Diese E-Mail-Adresse stimmt nicht.'), findsOneWidget);
    await tester.enterText(find.byKey(const Key('extern-email')), 'hans@example.ch');
    await tester.tap(find.byKey(const Key('ausleihen-absenden')));
    await tester.pumpAndSettle();
    expect(zugang.letzter('anlegen'), [
      {
        'von': '2026-10-13',
        'bis': '2026-10-15',
        'positionen': [
          {'location_id': 2},
        ],
        'extern': {'name': 'Hans Muster', 'organisation': 'Turnverein', 'email': 'hans@example.ch'},
      },
    ]);
    expect(find.text('Ausleihe #3 erfasst'), findsOneWidget);
  });

  testWidgets('Dunkelmodus ohne Fehler', (tester) async {
    await starten(tester, (a) => AusleihenVerwaltenScreen(ausleihen: a), dunkel: true);
    await tester.tap(find.text('Erika Muster'));
    await tester.pumpAndSettle();
    expect(find.text('30 Stück Teller'), findsOneWidget);
    expect(tester.takeException(), isNull);
  });

  testWidgets('Lager-Screen zeigt "Ausleihen verwalten" nur mit Ausleihe', (tester) async {
    tester.view.physicalSize = const Size(1080, 2070);
    tester.view.devicePixelRatio = 3;
    addTearDown(tester.view.reset);
    final a = Ausleihen(zugang: _FalscheAusleihe());
    await tester.pumpWidget(
      MaterialApp(
        home: LagerScreen(
          lager: Lager(zugang: _LeeresLager(), ausleihen: a),
        ),
      ),
    );
    await tester.pumpAndSettle();
    await tester.tap(find.byKey(const Key('ausleihen-verwalten')));
    await tester.pumpAndSettle();
    expect(find.text('Kommend'), findsOneWidget);
    expect(find.text('Hans Muster, Turnverein'), findsOneWidget);
  });
}

/// Lager ohne Inhalt (nur fuer den Einstieg in die Ausleihe).
class _LeeresLager extends LagerZugang {
  @override
  Future<List<Artikel>> artikel({String? suche}) async => const [];
  @override
  Future<Artikel> artikelDetail(int id) async => throw UnimplementedError();
  @override
  Future<List<Buchung>> verlauf(int artikelId, {int anzahl = 10}) async => const [];
  @override
  Future<int> buchen(int artikelId, BuchungsArt art, int menge, {String? notiz}) async => 0;
  @override
  Future<ScanTreffer> codeSuchen(String code) async => Unbekannt(code);
  @override
  Future<Artikel> codeZuordnen(int artikelId, String code) async => throw UnimplementedError();
  @override
  Future<List<Lagerort>> lagerorte() async => const [];
  @override
  Future<LagerortInhalt> lagerort(int id) async => throw UnimplementedError();
  @override
  Future<List<Artikel>> nachbestellen() async => const [];
  @override
  Future<List<Kategorie>> kategorien() async => const [];
  @override
  Future<String?> naechsterCode() async => null;
  @override
  Future<Artikel> anlegen(NeuerArtikel artikel) async => throw UnimplementedError();
  @override
  Future<void> artikelAusleihbar(int artikelId, bool ausleihbar) async {}
  @override
  Future<void> lagerortAusleihbar(int lagerortId, bool ausleihbar) async {}
}
