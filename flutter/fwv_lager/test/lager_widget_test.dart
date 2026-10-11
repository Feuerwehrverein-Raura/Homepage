// Oberflaeche des Lagers mit nachgebautem Zugang (Daten aus der
// Vertragsdatei) und nachgebautem Scanner — auf Handy-Breite, hell und
// dunkel. Ueberlaeufe (seitliches Abschneiden) lassen die Tests scheitern.

import 'package:flutter_test/flutter_test.dart';
import 'package:fwv_lager/fwv_lager.dart';
import 'package:material_ui/material_ui.dart';

import 'vertrag.dart';

Map<String, dynamic> _m(Object? o) => Map<String, dynamic>.from(o as Map);

class _FalscherZugang extends LagerZugang {
  _FalscherZugang() {
    final v = vertrag();
    for (final e in v['items'] as List) {
      final a = Artikel.ausJson(_m(e));
      artikelListe[a.id] = a;
    }
    final detail = Artikel.ausJson(_m(v['item']));
    artikelListe[detail.id] = detail;
    verlaufListe = [for (final e in v['transactions'] as List) Buchung.ausJson(_m(e))];
    orte = [for (final e in v['locations_overview'] as List) Lagerort.ausJson(_m(e))];
    inhalt = LagerortInhalt.ausJson(v['location']);
    kategorienListe = [for (final e in v['categories'] as List) Kategorie.ausJson(_m(e))];
    unbekannt = ScanTreffer.ausJson('7610044000179', v['lookup_extern']) as Unbekannt;
  }

  final artikelListe = <int, Artikel>{};
  late List<Buchung> verlaufListe;
  late List<Lagerort> orte;
  late LagerortInhalt inhalt;
  late List<Kategorie> kategorienListe;
  late Unbekannt unbekannt;
  final aufrufe = <(String, List<Object?>)>[];

  List<Object?> letzter(String name) => aufrufe.lastWhere((a) => a.$1 == name).$2;
  bool gab(String name) => aufrufe.any((a) => a.$1 == name);

  @override
  Future<List<Artikel>> artikel({String? suche}) async {
    aufrufe.add(('artikel', [suche]));
    final s = (suche ?? '').trim().toLowerCase();
    return [
      for (final a in artikelListe.values)
        if (s.isEmpty || a.name.toLowerCase().contains(s)) a,
    ]..sort((a, b) => a.name.compareTo(b.name));
  }

  @override
  Future<Artikel> artikelDetail(int id) async {
    aufrufe.add(('detail', [id]));
    return artikelListe[id]!;
  }

  @override
  Future<List<Buchung>> verlauf(int artikelId, {int anzahl = 10}) async =>
      artikelId == 1 ? verlaufListe : const [];

  @override
  Future<int> buchen(int artikelId, BuchungsArt art, int menge, {String? notiz}) async {
    aufrufe.add(('buchen', [artikelId, art, menge, notiz]));
    final a = artikelListe[artikelId]!;
    final neu = art == BuchungsArt.eingang ? a.bestand + menge : a.bestand - menge;
    artikelListe[artikelId] = a.mitBestand(neu);
    return neu;
  }

  @override
  Future<ScanTreffer> codeSuchen(String code) async {
    aufrufe.add(('codeSuchen', [code]));
    for (final a in artikelListe.values) {
      if (a.eigenerCode == code || a.ean == code) return ImLager(code, a);
    }
    return Unbekannt(code, vorschlag: unbekannt.vorschlag, quelle: unbekannt.quelle);
  }

  @override
  Future<Artikel> codeZuordnen(int artikelId, String code) async {
    aufrufe.add(('codeZuordnen', [artikelId, code]));
    return artikelListe[artikelId]!;
  }

  @override
  Future<List<Lagerort>> lagerorte() async => orte;

  @override
  Future<LagerortInhalt> lagerort(int id) async {
    aufrufe.add(('lagerort', [id]));
    return inhalt;
  }

  @override
  Future<List<Artikel>> nachbestellen() async => [
    for (final a in artikelListe.values)
      if (a.nachbestellen) a,
  ];

  @override
  Future<List<Kategorie>> kategorien() async => kategorienListe;

  @override
  Future<String?> naechsterCode() async => 'FWV000009';

  @override
  Future<Artikel> anlegen(NeuerArtikel artikel) async {
    aufrufe.add(('anlegen', [artikel.alsJson()]));
    final a = Artikel(
      id: 99,
      name: artikel.name.trim(),
      ean: artikel.ean,
      eigenerCode: artikel.ean == null || artikel.ean!.isEmpty ? 'FWV000009' : null,
      bestand: artikel.bestand,
      mindestbestand: artikel.mindestbestand,
      einheit: artikel.einheit,
    );
    artikelListe[99] = a;
    return a;
  }

  @override
  Future<void> artikelAusleihbar(int artikelId, bool ausleihbar) async {
    aufrufe.add(('artikelAusleihbar', [artikelId, ausleihbar]));
    artikelListe[artikelId] = artikelListe[artikelId]!.mitAusleihbar(ausleihbar);
  }

  @override
  Future<void> lagerortAusleihbar(int lagerortId, bool ausleihbar) async {
    aufrufe.add(('lagerortAusleihbar', [lagerortId, ausleihbar]));
  }
}

void main() {
  late _FalscherZugang zugang;
  late List<String?> scans;

  Future<void> starten(WidgetTester tester, {bool dunkel = false}) async {
    // Kleines Handy: 360 x 690 dp.
    tester.view.physicalSize = const Size(1080, 2070);
    tester.view.devicePixelRatio = 3;
    addTearDown(tester.view.reset);
    zugang = _FalscherZugang();
    scans = [];
    await tester.pumpWidget(
      MaterialApp(
        theme: ThemeData(brightness: dunkel ? Brightness.dark : Brightness.light),
        home: LagerScreen(
          lager: Lager(
            zugang: zugang,
            umgebung: LagerUmgebung(scannen: (_) async => scans.isEmpty ? null : scans.removeAt(0)),
          ),
        ),
      ),
    );
    await tester.pumpAndSettle();
  }

  testWidgets('Artikelliste mit Bestand, Suche', (tester) async {
    await starten(tester);
    expect(find.text('Mineral 1.5l'), findsOneWidget);
    expect(find.text('8 Flasche'), findsOneWidget);
    expect(find.text('Teller'), findsOneWidget);
    expect(find.text('Scannen'), findsOneWidget, reason: 'Scannen immer sichtbar');

    await tester.enterText(find.byKey(const Key('artikel-suche')), 'tell');
    await tester.pump(const Duration(milliseconds: 400));
    await tester.pumpAndSettle();
    expect(zugang.letzter('artikel'), ['tell']);
    expect(find.text('Teller'), findsOneWidget);
    expect(find.text('Mineral 1.5l'), findsNothing);
  });

  testWidgets('Detail: Bestand je Lagerort, Verlauf, Eingang mit Notiz', (tester) async {
    await starten(tester);
    await tester.tap(find.text('Mineral 1.5l'));
    await tester.pumpAndSettle();

    expect(find.byKey(const Key('bestand')), findsOneWidget);
    expect(find.text('Mindestbestand 10 Flasche'), findsOneWidget);
    expect(find.text('Nachbestellen'), findsOneWidget);
    expect(find.text('Kiste 1'), findsOneWidget);
    await tester.scrollUntilVisible(
      find.text('Apéro Vorstand'),
      200,
      scrollable: find.byType(Scrollable).first,
    );
    expect(find.text('Apéro Vorstand'), findsOneWidget);
    expect(find.text('−4'), findsOneWidget);
    expect(find.byKey(const Key('eingang')), findsOneWidget);

    await tester.tap(find.byKey(const Key('eingang')));
    await tester.pumpAndSettle();
    await tester.enterText(find.byKey(const Key('buchen-menge')), '12');
    await tester.enterText(find.byKey(const Key('buchen-notiz')), 'Lieferung Volg');
    await tester.tap(find.byKey(const Key('buchen-ok')));
    await tester.pumpAndSettle();

    expect(zugang.letzter('buchen'), [1, BuchungsArt.eingang, 12, 'Lieferung Volg']);
    await tester.scrollUntilVisible(
      find.byKey(const Key('bestand')),
      -200,
      scrollable: find.byType(Scrollable).first,
    );
    expect(tester.widget<Text>(find.byKey(const Key('bestand'))).data, '20 Flasche');
    expect(find.textContaining('neuer Bestand: 20 Flasche'), findsOneWidget);

    // Zurueck: die Liste laedt neu und zeigt den neuen Bestand.
    await tester.pageBack();
    await tester.pumpAndSettle();
    expect(find.text('20 Flasche'), findsOneWidget);
  });

  testWidgets('Ausgang: Menge muss ganze Zahl ueber 0 sein, ohne Notiz', (tester) async {
    await starten(tester);
    await tester.tap(find.text('Teller'));
    await tester.pumpAndSettle();
    await tester.tap(find.byKey(const Key('ausgang')));
    await tester.pumpAndSettle();
    await tester.enterText(find.byKey(const Key('buchen-menge')), '0');
    await tester.pump();
    expect(tester.widget<FilledButton>(find.byKey(const Key('buchen-ok'))).onPressed, isNull);
    await tester.enterText(find.byKey(const Key('buchen-menge')), '5');
    await tester.pump();
    await tester.tap(find.byTooltip('Mehr'));
    await tester.pump();
    await tester.tap(find.byKey(const Key('buchen-ok')));
    await tester.pumpAndSettle();
    expect(zugang.letzter('buchen'), [2, BuchungsArt.ausgang, 6, null]);
  });

  testWidgets('Scannen: QR-Etikett oeffnet den Artikel', (tester) async {
    await starten(tester);
    scans.add('https://inventar.fwv-raura.ch/item/FWV000002');
    await tester.tap(find.byKey(const Key('scannen')));
    await tester.pumpAndSettle();
    expect(zugang.letzter('codeSuchen'), ['FWV000002']);
    expect(find.widgetWithText(AppBar, 'Teller'), findsOneWidget);
  });

  testWidgets('Scannen abgebrochen: nichts passiert', (tester) async {
    await starten(tester);
    await tester.tap(find.byKey(const Key('scannen')));
    await tester.pumpAndSettle();
    expect(zugang.gab('codeSuchen'), isFalse);
  });

  testWidgets('Unbekannter Code: neu anlegen mit vorbelegtem Namen und EAN', (tester) async {
    await starten(tester);
    scans.add('7610044000179');
    await tester.tap(find.byKey(const Key('scannen')));
    await tester.pumpAndSettle();
    expect(find.text('Unbekannter Code'), findsOneWidget);
    expect(find.textContaining('Open Food Facts'), findsOneWidget);

    await tester.tap(find.byKey(const Key('code-anlegen')));
    await tester.pumpAndSettle();
    expect(find.text('Rivella Rivella Rot'), findsOneWidget);
    await tester.enterText(find.byKey(const Key('anlegen-name')), 'Rivella Rot 1.5l');
    await tester.enterText(find.byKey(const Key('anlegen-bestand')), '24');
    await tester.enterText(find.byKey(const Key('anlegen-minimum')), '6');
    expect(find.textContaining('FWV000009'), findsNothing, reason: 'mit EAN kein eigener Code');
    await tester.tap(find.byKey(const Key('anlegen-ok')));
    await tester.pumpAndSettle();

    expect(zugang.letzter('anlegen'), [
      {
        'name': 'Rivella Rot 1.5l',
        'description': 'Erfrischungsgetränk mit Milchserum',
        'ean_code': '7610044000179',
        'unit': 'Stück',
        'quantity': 24,
        'min_quantity': 6,
      },
    ]);
    // Danach der neue Artikel; zurueck landet man in der Liste.
    expect(find.widgetWithText(AppBar, 'Rivella Rot 1.5l'), findsOneWidget);
    await tester.pageBack();
    await tester.pumpAndSettle();
    expect(find.text('Rivella Rot 1.5l'), findsOneWidget);
    expect(find.text('Unbekannter Code'), findsNothing);
  });

  testWidgets('Unbekannter Code: bestehendem Artikel zuordnen', (tester) async {
    await starten(tester);
    scans.add('4000000000006');
    await tester.tap(find.byKey(const Key('scannen')));
    await tester.pumpAndSettle();
    await tester.tap(find.byKey(const Key('code-zuordnen')));
    await tester.pumpAndSettle();
    await tester.enterText(find.byKey(const Key('zuordnen-suche')), 'bech');
    await tester.pump();
    await tester.tap(find.text('Becher'));
    await tester.pumpAndSettle();
    expect(zugang.letzter('codeZuordnen'), [7, '4000000000006']);
    expect(find.widgetWithText(AppBar, 'Becher'), findsOneWidget);
  });

  testWidgets('Anlegen ohne EAN: Hinweis auf den eigenen Code, Name Pflicht', (tester) async {
    await starten(tester);
    await tester.tap(find.byTooltip('Artikel anlegen'));
    await tester.pumpAndSettle();
    expect(find.textContaining('FWV000009'), findsOneWidget);
    await tester.tap(find.byKey(const Key('anlegen-ok')));
    await tester.pumpAndSettle();
    expect(find.text('Bitte einen Namen angeben'), findsOneWidget);
    expect(zugang.gab('anlegen'), isFalse);

    await tester.enterText(find.byKey(const Key('anlegen-name')), 'Servietten rot');
    await tester.tap(find.byKey(const Key('anlegen-kategorie')));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Geschirr').last);
    await tester.pumpAndSettle();
    await tester.tap(find.byKey(const Key('anlegen-ok')));
    await tester.pumpAndSettle();
    final body = zugang.letzter('anlegen').single as Map;
    expect(body['category_id'], 2);
    expect(body.containsKey('ean_code'), isFalse);
  });

  testWidgets('Lagerorte und Nachbestellen', (tester) async {
    await starten(tester);
    await tester.tap(find.text('Lagerorte'));
    await tester.pumpAndSettle();
    expect(find.text('Keller'), findsOneWidget);
    expect(find.text('2 Artikel'), findsOneWidget);
    await tester.tap(find.text('Kiste 1'));
    await tester.pumpAndSettle();
    expect(zugang.letzter('lagerort'), [2]);
    expect(find.text('50 Stück'), findsOneWidget);
    await tester.pageBack();
    await tester.pumpAndSettle();

    await tester.tap(find.text('Nachbestellen'));
    await tester.pumpAndSettle();
    expect(find.text('Mineral 1.5l'), findsOneWidget);
    expect(find.text('Teller'), findsNothing);
  });

  testWidgets('Ausleihbar: Artikel und ganze Kiste (Lager markiert)', (tester) async {
    await starten(tester);
    expect(find.byKey(const Key('ausleihen-verwalten')), findsNothing, reason: 'ohne Ausleihe');
    await tester.tap(find.text('Teller'));
    await tester.pumpAndSettle();
    await tester.scrollUntilVisible(
      find.byKey(const Key('ausleihbar')),
      200,
      scrollable: find.byType(Scrollable).first,
    );
    expect(tester.widget<SwitchListTile>(find.byKey(const Key('ausleihbar'))).value, isFalse);
    await tester.tap(find.byKey(const Key('ausleihbar')));
    await tester.pumpAndSettle();
    expect(zugang.letzter('artikelAusleihbar'), [2, true]);
    expect(tester.widget<SwitchListTile>(find.byKey(const Key('ausleihbar'))).value, isTrue);
    expect(find.text('Kann jetzt ausgeliehen werden'), findsOneWidget);
    await tester.pageBack();
    await tester.pumpAndSettle();

    await tester.tap(find.text('Lagerorte'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Kiste 1'));
    await tester.pumpAndSettle();
    await tester.tap(find.byKey(const Key('kiste-ausleihbar')));
    await tester.pumpAndSettle();
    expect(zugang.letzter('lagerortAusleihbar'), [2, true]);
    expect(tester.widget<SwitchListTile>(find.byKey(const Key('kiste-ausleihbar'))).value, isTrue);
  });

  testWidgets('Dunkelmodus ohne Fehler', (tester) async {
    await starten(tester, dunkel: true);
    await tester.tap(find.text('Mineral 1.5l'));
    await tester.pumpAndSettle();
    expect(find.byKey(const Key('ausgang')), findsOneWidget);
    expect(tester.takeException(), isNull);
  });
}
