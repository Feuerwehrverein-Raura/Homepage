// Oberflaeche der Anlass-Verwaltung mit nachgebautem Zugang. Die Daten
// kommen aus dem Vertrag mit dem Backend (organisator-uebersicht.json), die
// Screens sprechen nur mit der Schnittstelle — so wie spaeter auch mit dem
// Vorstand-Zugang.

import 'dart:convert';
import 'dart:io';
import 'dart:typed_data';

import 'package:flutter_test/flutter_test.dart';
import 'package:fwv_anlass/fwv_anlass.dart';
import 'package:fwv_core/fwv_core.dart';
import 'package:material_ui/material_ui.dart';

Map<String, dynamic> _vertrag() {
  var dir = Directory.current;
  while (true) {
    final f = File('${dir.path}/docker/backend-events/test/fixtures/organisator-uebersicht.json');
    if (f.existsSync()) return jsonDecode(f.readAsStringSync()) as Map<String, dynamic>;
    if (dir.parent.path == dir.path) throw StateError('Vertragsdatei nicht gefunden');
    dir = dir.parent;
  }
}

/// Nachgebauter Zugang: liefert den Vertrag, schreibt jeden Aufruf mit.
class _FalscherZugang extends AnlassVerwaltungZugang {
  _FalscherZugang(this.json);

  Map<String, dynamic> json;
  final aufrufe = <(String, List<Object?>)>[];
  final notizListe = <Notiz>[];

  Object? letzter(String name) => aufrufe.lastWhere((a) => a.$1 == name).$2;
  bool gab(String name) => aufrufe.any((a) => a.$1 == name);

  Future<T> _merken<T>(String name, List<Object?> args, T ergebnis) async {
    aufrufe.add((name, args));
    return ergebnis;
  }

  @override
  String get bezeichnung => 'Organisator';

  @override
  Future<VerwaltungsUebersicht> uebersicht() =>
      _merken('uebersicht', [], VerwaltungsUebersicht.ausJson(json));

  @override
  Future<EventOptionen> optionen() async => EventOptionen.ausJson({
    'kategorien': ['Dorffest', 'GV', 'Sonstiges'],
    'anmeldepflichtige_kategorien': ['Dorffest', 'GV'],
    'bereiche': [
      {'wert': 'Allgemein', 'text': 'Allgemein'},
      {'wert': 'Bar', 'text': 'Bar'},
      {'wert': 'Kueche', 'text': 'Küche'},
    ],
    'status': [
      {'wert': 'planned', 'text': 'Geplant'},
      {'wert': 'cancelled', 'text': 'Abgesagt'},
    ],
  });

  @override
  Future<void> bestaetigen(String a, String r) => _merken('bestaetigen', [a, r], null);
  @override
  Future<void> ablehnen(String a, String r) => _merken('ablehnen', [a, r], null);
  @override
  Future<bool> anmeldungAendern(String a, VerwalteteAnmeldung r, AnmeldungEntwurf neu) {
    final body = neu.aenderungen(AnmeldungEntwurf.aus(r), gast: !r.mitglied);
    return _merken('anmeldungAendern', [a, r.id, body], body.isNotEmpty);
  }

  @override
  Future<void> anmeldungLoeschen(String a, String r) => _merken('anmeldungLoeschen', [a, r], null);
  @override
  Future<void> personHinzufuegen(String a, NeuePerson p) =>
      _merken('personHinzufuegen', [a, p.alsJson()], null);
  @override
  Future<List<VerzeichnisMitglied>> mitgliederVerzeichnis() => _merken('verzeichnis', [], const [
    VerzeichnisMitglied(id: 'm1', name: 'Erika Muster'),
    VerzeichnisMitglied(id: 'm2', name: 'Hans Helfer', funktion: 'Kassier'),
  ]);
  @override
  Future<String> alternativeVorschlagen(
    String a,
    String r, {
    required String schichtId,
    required String schichtText,
    required String email,
    String? kommentar,
  }) => _merken('alternative', [a, r, schichtId, schichtText, email], 'Vorschlag gesendet');
  @override
  Future<MitteilungErgebnis> mitteilen(
    String a, {
    required String betreff,
    required String nachricht,
  }) => _merken('mitteilen', [
    a,
    betreff,
    nachricht,
  ], const MitteilungErgebnis(perEmail: 3, perPush: 2, nichtErreicht: ['Ohne Adresse']));
  @override
  Future<String> arbeitsplanSenden(String a) =>
      _merken('arbeitsplanSenden', [a], 'Arbeitsplan an 3 Empfänger versendet');
  @override
  Future<bool> anlassAendern(String a, AnlassEntwurf original, AnlassEntwurf neu) {
    final body = neu.aenderungen(original);
    return _merken('anlassAendern', [a, body], body.isNotEmpty);
  }

  @override
  Future<void> schichtAnlegen(String a, SchichtEntwurf s) =>
      _merken('schichtAnlegen', [a, s.alsJson()], null);
  @override
  Future<bool> schichtAendern(String a, String s, SchichtEntwurf original, SchichtEntwurf neu) {
    final body = neu.aenderungen(original);
    return _merken('schichtAendern', [a, s, body], body.isNotEmpty);
  }

  @override
  Future<void> schichtLoeschen(String a, String s) => _merken('schichtLoeschen', [a, s], null);
  @override
  Future<List<Notiz>> notizen(String a) => _merken('notizen', [a], List.of(notizListe));
  @override
  Future<void> notizAnlegen(String a, {String? text, List<AnhangUpload> anhaenge = const []}) {
    notizListe.add(Notiz(id: 'n${notizListe.length + 1}', text: text?.trim(), von: 'Erika'));
    return _merken('notizAnlegen', [a, text, anhaenge], null);
  }

  @override
  Future<void> notizLoeschen(String a, String n) => _merken('notizLoeschen', [a, n], null);
  @override
  Future<void> anhangLoeschen(String a, String n, String x) =>
      _merken('anhangLoeschen', [a, n, x], null);
  @override
  Future<Uint8List> anhang(String a, String n, String x) =>
      _merken('anhang', [a, n, x], Uint8List.fromList([1]));
  @override
  Future<List<VerknuepftesRezept>> rezepte(String a) => _merken(
    'rezepte',
    [a],
    const [VerknuepftesRezept(rezeptId: 11, name: 'Risotto', portionen: 40, ausLagerMoeglich: 12)],
  );
  @override
  Future<Einkaufsliste> einkaufsliste(String a) => _merken(
    'einkaufsliste',
    [a],
    const Einkaufsliste(
      posten: [
        EinkaufsPosten(
          materialId: 7,
          name: 'Reis',
          einheit: 'kg',
          bedarf: 8,
          lager: 2,
          zuKaufen: 6,
        ),
        EinkaufsPosten(materialId: 8, name: 'Becher', bedarf: 50, vonHand: 50, zuKaufen: 0),
        EinkaufsPosten(
          materialId: 10,
          name: 'Bier',
          einheit: 'Harass',
          bedarf: 10,
          lager: 4,
          zuKaufen: 6,
          gekauft: true,
          istMenge: 6,
        ),
        EinkaufsPosten(
          materialId: 11,
          name: 'Kaffee',
          bedarf: 2,
          zuKaufen: 2,
          gekauft: true,
          eingebucht: true,
        ),
      ],
      zuKaufen: 3,
      geschaetzteKosten: 18.5,
      gekauft: 2,
    ),
  );
  @override
  Future<List<AuswahlRezept>> verfuegbareRezepte(String a) =>
      _merken('verfuegbareRezepte', [a], const [AuswahlRezept(id: 12, name: 'Älplermagronen')]);
  @override
  Future<List<AuswahlMaterial>> verfuegbaresMaterial(String a) => _merken(
    'verfuegbaresMaterial',
    [a],
    const [AuswahlMaterial(id: 9, name: 'Servietten', einheit: 'Pack')],
  );
  @override
  Future<void> rezeptVerknuepfen(String a, int r, int p) =>
      _merken('rezeptVerknuepfen', [a, r, p], null);
  @override
  Future<void> portionenAendern(String a, int r, int p) =>
      _merken('portionenAendern', [a, r, p], null);
  @override
  Future<void> rezeptLoesen(String a, int r) => _merken('rezeptLoesen', [a, r], null);
  @override
  Future<void> materialErfassen(String a, int m, double n) =>
      _merken('materialErfassen', [a, m, n], null);
  @override
  Future<void> materialEntfernen(String a, int m) => _merken('materialEntfernen', [a, m], null);
  @override
  Future<void> gekauftSetzen(String a, int m, bool g, {double? istMenge}) =>
      _merken('gekauftSetzen', [a, m, g, istMenge], null);
  final belegListe = <Beleg>[
    Beleg(
      id: 7,
      betrag: 42.5,
      hochgeladenVon: 'erika@example.ch',
      erstellt: DateTime(2026, 10, 10),
    ),
  ];
  @override
  Future<List<Beleg>> belege(String a) => _merken('belege', [a], List.of(belegListe));
  @override
  Future<void> belegHochladen(String a, Uint8List jpeg) {
    belegListe.add(Beleg(id: 8, erstellt: DateTime(2026, 10, 11)));
    return _merken('belegHochladen', [a, jpeg], null);
  }

  @override
  Future<Uint8List> belegBild(String a, int b) => _merken('belegBild', [a, b], _png);
  @override
  Future<void> belegLoeschen(String a, int b) {
    belegListe.removeWhere((x) => x.id == b);
    return _merken('belegLoeschen', [a, b], null);
  }

  @override
  Future<Zurueckbuchung> insLagerZurueckbuchen(String a) => _merken(
    'zurueckbuchen',
    [a],
    Zurueckbuchung.ausJson({
      'restocked': 1,
      'items': [
        {'item_id': 10, 'name': 'Bier', 'quantity': 6},
      ],
    }),
  );
  @override
  Future<Uint8List> teilnehmerlistePdf(String a) =>
      _merken('teilnehmerlistePdf', [a], Uint8List.fromList([37, 80, 68, 70]));
  @override
  Future<Uint8List> aushangPdf(String a) => _merken('aushangPdf', [a], Uint8List(0));
  @override
  Future<Uint8List> arbeitsplanPdf(String a) => _merken('arbeitsplanPdf', [a], Uint8List(0));
}

// Kleinstes gueltiges PNG (1x1), fuer die Beleg-Ansicht.
final _png = Uint8List.fromList(
  base64Decode(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
  ),
);

const _chilbi = '00000000-0000-0000-0000-e00000000001';
const _essen = '00000000-0000-0000-0000-e00000000004';

void main() {
  late _FalscherZugang zugang;
  late List<(String, String)> geteilt;
  late List<Uri> links;

  setUp(() {
    zugang = _FalscherZugang(_vertrag());
    geteilt = [];
    links = [];
  });

  AnlassVerwaltung verwaltung() => AnlassVerwaltung(
    zugang: zugang,
    umgebung: VerwaltungsUmgebung(
      dateiTeilen: (bytes, name, typ, {ursprung}) async => geteilt.add((name, typ)),
      fotoWaehlen: ({required bool kamera}) async => Uint8List.fromList([1, 2, 3]),
      linkOeffnen: (u) async {
        links.add(u);
        return true;
      },
      anhangVerkleinern: (roh) async => roh,
    ),
  );

  Future<void> zeigen(
    WidgetTester tester,
    Widget kind, {
    Size groesse = const Size(360, 800),
  }) async {
    tester.view.physicalSize = groesse * 3;
    tester.view.devicePixelRatio = 3;
    addTearDown(tester.view.reset);
    await tester.pumpWidget(
      MaterialApp(
        locale: const Locale('de', 'CH'),
        supportedLocales: const [Locale('de', 'CH')],
        localizationsDelegates: GlobalMaterialLocalizations.delegates,
        theme: ThemeData(),
        darkTheme: ThemeData(brightness: Brightness.dark),
        home: kind,
      ),
    );
    await tester.pumpAndSettle();
  }

  Future<void> anlass(WidgetTester tester, String id) =>
      zeigen(tester, VerwaltungsAnlassScreen(verwaltung: verwaltung(), anlassId: id));

  Future<void> tippen(WidgetTester tester, Finder f) async {
    if (f.evaluate().isEmpty) {
      await tester.scrollUntilVisible(
        f,
        200,
        scrollable: find.byType(Scrollable).hitTestable().first,
      );
    }
    // Nur scrollen, wenn noetig: ensureVisible auf einem Knopf ausserhalb der
    // Liste (z.B. "Person") wuerde sonst die Reiter-Seite verschieben.
    if (f.hitTestable().evaluate().isEmpty) {
      await tester.ensureVisible(f);
      await tester.pumpAndSettle();
    }
    await tester.tap(f);
    await tester.pumpAndSettle();
  }

  /// Im Reiter Material zu [f] scrollen (runter, sonst hoch) und antippen.
  /// Meldungen unten werden vorher weggeraeumt, damit sie nichts verdecken.
  Future<void> imMaterial(WidgetTester tester, Finder f, {bool tippen = true}) async {
    tester.state<ScaffoldMessengerState>(find.byType(ScaffoldMessenger)).clearSnackBars();
    await tester.pumpAndSettle();
    final liste = find.byKey(const Key('material-liste'));
    if (f.hitTestable().evaluate().isEmpty) {
      try {
        await tester.dragUntilVisible(f, liste, const Offset(0, -150), maxIteration: 30);
      } on Object {
        await tester.dragUntilVisible(f, liste, const Offset(0, 150), maxIteration: 60);
      }
      await tester.pumpAndSettle();
      await tester.ensureVisible(f);
      await tester.pumpAndSettle();
    }
    expect(f, findsOneWidget);
    if (!tippen) return;
    await tester.tap(f);
    await tester.pumpAndSettle();
  }

  testWidgets('Uebersicht: Karten mit Zahlen, Antippen oeffnet den Anlass mit Reitern', (
    tester,
  ) async {
    await zeigen(tester, VerwaltungsUebersichtScreen(verwaltung: verwaltung()));
    expect(find.text('Organisator'), findsOneWidget);
    expect(find.text('Chilbi 2026'), findsOneWidget);
    expect(find.text('3 bestätigt · 1 offen · 4 Personen'), findsOneWidget);
    expect(find.text('1 offen'), findsNWidgets(2));

    await tippen(tester, find.text('Chilbi 2026'));
    for (final r in ['Anmeldungen', 'Schichten', 'Notizen', 'Material']) {
      expect(find.widgetWithText(Tab, r), findsOneWidget);
    }
    expect(find.byTooltip('Anlass bearbeiten'), findsOneWidget);
    expect(find.text('Gast Neu'), findsOneWidget);
    expect(find.text('Küche – Schicht 2 · Sa 17.10. · 17:00–20:00'), findsWidgets);
  });

  // In Tests gibt es kein Netz: Image.network schlaegt fehl. Das Logo muss
  // dann still verschwinden, die Karte bleibt heil.
  Future<void> bildFehlerAbwarten(WidgetTester tester) async {
    await tester.runAsync(() => Future<void>.delayed(const Duration(milliseconds: 200)));
    await tester.pumpAndSettle();
  }

  testWidgets('Logo: nur an der Chilbi (Karte und Kopf), Ladefehler macht nichts kaputt', (
    tester,
  ) async {
    await zeigen(tester, VerwaltungsUebersichtScreen(verwaltung: verwaltung()));
    final logo = find.byKey(const Key('anlass-logo'));
    expect(logo, findsOneWidget, reason: 'Helferessen hat kein Logo');
    expect(
      find.descendant(of: find.widgetWithText(Card, 'Chilbi 2026'), matching: logo),
      findsOneWidget,
    );
    expect(tester.widget<AnlassLogo>(logo).logo.toString(), endsWith('/anlaesse/chilbi.png'));
    expect(find.byIcon(Icons.chevron_right), findsNWidgets(2), reason: 'Pfeil bleibt');

    await bildFehlerAbwarten(tester);
    expect(tester.takeException(), isNull);
    expect(find.descendant(of: logo, matching: find.byType(ClipOval)), findsNothing);
    expect(find.text('Chilbi 2026'), findsOneWidget);

    await tippen(tester, find.text('Chilbi 2026'));
    expect(logo, findsOneWidget, reason: 'Kopf des Anlasses');
    await bildFehlerAbwarten(tester);
    expect(tester.takeException(), isNull);
  });

  testWidgets('Logo: ohne Logo kein Bild, mit Logo Bild in der gewuenschten Groesse', (
    tester,
  ) async {
    await zeigen(
      tester,
      Scaffold(
        body: Column(
          children: [
            const AnlassLogo(key: Key('ohne'), logo: null),
            AnlassLogo(
              key: const Key('mit'),
              logo: Uri.parse('https://www.fwv-raura.ch/images/anlaesse/chilbi.png'),
              groesse: 80,
            ),
          ],
        ),
      ),
    );
    expect(
      find.descendant(of: find.byKey(const Key('ohne')), matching: find.byType(Image)),
      findsNothing,
    );
    expect(tester.getSize(find.byKey(const Key('ohne'))), Size.zero);
    final mit = find.byKey(const Key('mit'));
    final bild = tester.widget<Image>(find.descendant(of: mit, matching: find.byType(Image)));
    expect((bild.width, bild.height), (80, 80));
    expect((bild.image as NetworkImage).url, 'https://www.fwv-raura.ch/images/anlaesse/chilbi.png');
    expect(bild.excludeFromSemantics, isTrue);

    await bildFehlerAbwarten(tester);
    expect(tester.takeException(), isNull);
    expect(tester.getSize(mit), Size.zero, reason: 'kaputtes Bild verschwindet');
  });

  testWidgets('Bestaetigen und Ablehnen (mit Rueckfrage)', (tester) async {
    await anlass(tester, _chilbi);
    await tippen(tester, find.text('Bestätigen'));
    expect(zugang.letzter('bestaetigen'), [_chilbi, '00000000-0000-0000-0000-700000000004']);
    expect(find.text('Gast Neu: bestätigt'), findsOneWidget);

    await tippen(tester, find.text('Ablehnen').first);
    expect(find.text('Anmeldung ablehnen?'), findsOneWidget);
    await tippen(tester, find.widgetWithText(FilledButton, 'Ablehnen'));
    expect(zugang.gab('ablehnen'), isTrue);
  });

  testWidgets('Anmeldung aendern: nur Personen, Begleitperson/Allergien/Menue bleiben', (
    tester,
  ) async {
    await anlass(tester, _essen);
    expect(find.text('Paar Gast (2 Personen)'), findsOneWidget);
    expect(find.text('Mit: Peter Gast'), findsOneWidget);
    expect(find.text('Allergien: Nüsse'), findsOneWidget);
    expect(find.text('Menü: Vegi'), findsOneWidget);

    await tippen(tester, find.text('Ändern').first);
    expect(find.text('Bleibt unverändert'), findsOneWidget);
    await tippen(tester, find.byTooltip('Mehr'));
    await tippen(tester, find.byKey(const Key('anmeldung-speichern')));
    final args = zugang.letzter('anmeldungAendern') as List;
    expect(args.last, {'participants': 3});
  });

  testWidgets('Anlass bearbeiten: nur der Titel geht raus, Menue und Anmeldeschluss bleiben', (
    tester,
  ) async {
    await anlass(tester, _essen);
    await tippen(tester, find.byTooltip('Anlass bearbeiten'));
    await tester.enterText(find.widgetWithText(TextFormField, 'Titel *'), 'Helferessen 2026');
    await tester.scrollUntilVisible(
      find.byKey(const Key('anlass-menue')),
      200,
      scrollable: find.byType(Scrollable).hitTestable().first,
    );
    expect(
      tester
          .widget<TextField>(
            find.descendant(
              of: find.byKey(const Key('anlass-menue')),
              matching: find.byType(TextField),
            ),
          )
          .controller!
          .text,
      'Fleisch\nVegi',
    );
    await tippen(tester, find.byKey(const Key('anlass-speichern')));
    expect((zugang.letzter('anlassAendern') as List).last, {'title': 'Helferessen 2026'});
    expect(find.text('Anlass gespeichert'), findsOneWidget);
  });

  testWidgets('Schicht aendern: Datum bleibt, nur Geaendertes', (tester) async {
    await anlass(tester, _chilbi);
    await tippen(tester, find.widgetWithText(Tab, 'Schichten'));
    await tippen(tester, find.byKey(const Key('schicht-00000000-0000-0000-0000-500000000002')));
    expect(find.text('17.10.2026'), findsOneWidget);
    await tippen(tester, find.byTooltip('Mehr'));
    await tippen(tester, find.byKey(const Key('schicht-speichern')));
    final args = zugang.letzter('schichtAendern') as List;
    expect(args.last, {'needed': 3});
  });

  testWidgets('Person als Gast eintragen', (tester) async {
    await anlass(tester, _chilbi);
    await tippen(tester, find.text('Person'));
    await tippen(tester, find.text('Gast'));
    await tester.enterText(find.widgetWithText(TextFormField, 'Name *'), 'Telefon Gast');
    await tippen(tester, find.byKey(const Key('person-eintragen')));
    expect((zugang.letzter('personHinzufuegen') as List).last, {
      'guest_name': 'Telefon Gast',
      'participants': 1,
    });
  });

  testWidgets('Mitglied aus dem Verzeichnis eintragen', (tester) async {
    await anlass(tester, _chilbi);
    await tippen(tester, find.text('Person'));
    await tester.enterText(find.byKey(const Key('mitglied-suche')), 'hans');
    await tester.pumpAndSettle();
    expect(find.text('Erika Muster'), findsNothing);
    await tippen(tester, find.text('Hans Helfer'));
    await tippen(tester, find.byKey(const Key('person-eintragen')));
    expect((zugang.letzter('personHinzufuegen') as List).last, {
      'member_id': 'm2',
      'participants': 1,
    });
  });

  testWidgets('Andere Schicht vorschlagen', (tester) async {
    await anlass(tester, _chilbi);
    await tippen(tester, find.text('Andere Schicht').first);
    await tippen(tester, find.byType(RadioListTile<String>).first);
    await tippen(tester, find.text('Vorschlag senden'));
    final args = zugang.letzter('alternative') as List;
    expect(args[4], 'neu@example.ch');
  });

  testWidgets('Informieren zeigt, wen es erreicht hat', (tester) async {
    await anlass(tester, _chilbi);
    await tippen(tester, find.text('Informieren'));
    await tester.enterText(find.byKey(const Key('mitteilung-text')), 'Treffpunkt neu');
    await tippen(tester, find.byKey(const Key('mitteilung-senden')));
    expect((zugang.letzter('mitteilen') as List)[2], 'Treffpunkt neu');
    expect(find.text('Per E-Mail: 3'), findsOneWidget);
    expect(find.text('• Ohne Adresse'), findsOneWidget);
  });

  testWidgets('PDF Teilnehmerliste ueber das Teilen-Menue', (tester) async {
    await anlass(tester, _chilbi);
    await tippen(tester, find.text('PDF'));
    await tippen(tester, find.text('Teilnehmerliste'));
    expect(geteilt, [('Teilnehmerliste_Chilbi_2026.pdf', 'application/pdf')]);
  });

  testWidgets('Notiz mit Foto', (tester) async {
    await anlass(tester, _chilbi);
    await tippen(tester, find.widgetWithText(Tab, 'Notizen'));
    await tippen(tester, find.byTooltip('Foto auswählen'));
    expect(find.text('foto-1.jpg'), findsOneWidget);
    await tester.enterText(find.byKey(const Key('notiz-text')), 'Schlüssel bei Hans');
    await tippen(tester, find.byTooltip('Notiz speichern'));
    final args = zugang.letzter('notizAnlegen') as List;
    expect(args[1], 'Schlüssel bei Hans');
    expect((args[2] as List<AnhangUpload>).single.typ, 'image/jpeg');
    expect(find.text('Schlüssel bei Hans'), findsOneWidget);
  });

  testWidgets('Material: Werte des Backends, Rezept verknuepfen', (tester) async {
    await anlass(tester, _chilbi);
    await tippen(tester, find.widgetWithText(Tab, 'Material'));
    expect(find.text('Risotto'), findsOneWidget);
    expect(find.text('40 Portionen · aus Lager möglich: 12'), findsOneWidget);
    expect(find.text('6 kg'), findsOneWidget);
    await tippen(tester, find.text('Rezept verknüpfen'));
    await tippen(tester, find.text('Älplermagronen'));
    await tippen(tester, find.text('Übernehmen'));
    expect(zugang.letzter('rezeptVerknuepfen'), [_chilbi, 12, 20]);
    await imMaterial(tester, find.text('Geschätzte Kosten: CHF 18.50'), tippen: false);
  });

  testWidgets('Einkauf: abhaken mit Menge, Beleg fotografieren, ins Lager zurueckbuchen', (
    tester,
  ) async {
    await anlass(tester, _chilbi);
    await tippen(tester, find.widgetWithText(Tab, 'Material'));
    expect(zugang.gab('belege'), isTrue, reason: 'Vertrag: aktionen.einkauf = true');

    // Reis abhaken: Vorschlag ist die fehlende Menge (6 kg), geaendert auf 5.
    final reis = find.descendant(
      of: find.byKey(const Key('posten-7')),
      matching: find.byType(Checkbox),
    );
    await imMaterial(tester, reis);
    expect(find.text('Gekauft: Reis'), findsOneWidget);
    expect(find.widgetWithText(TextField, '6'), findsOneWidget);
    await tester.enterText(find.byKey(const Key('material-menge')), '5,5');
    await tester.pump();
    await tippen(tester, find.widgetWithText(FilledButton, 'Abhaken'));
    expect(zugang.letzter('gekauftSetzen'), [_chilbi, 7, true, 5.5]);

    // Bier wieder entfernen: ohne Rueckfrage. Kaffee ist schon im Lager.
    await imMaterial(
      tester,
      find.descendant(of: find.byKey(const Key('posten-10')), matching: find.byType(Checkbox)),
    );
    expect(zugang.letzter('gekauftSetzen'), [_chilbi, 10, false, null]);
    expect(
      tester
          .widget<Checkbox>(
            find.descendant(
              of: find.byKey(const Key('posten-11')),
              matching: find.byType(Checkbox),
            ),
          )
          .onChanged,
      isNull,
    );
    await imMaterial(tester, find.text('im Lager'), tippen: false);

    // Beleg fotografieren: verkleinert (Umgebung) und hochgeladen.
    await imMaterial(tester, find.byKey(const Key('beleg-kamera')));
    final hoch = zugang.letzter('belegHochladen') as List;
    expect(hoch[0], _chilbi);
    expect(hoch[1], [1, 2, 3]);
    expect(find.byKey(const Key('beleg-8')), findsOneWidget);

    // Beleg ansehen und teilen.
    await imMaterial(tester, find.text('10.10.2026 · CHF 42.50'));
    expect(zugang.letzter('belegBild'), [_chilbi, 7]);
    expect(find.byType(Image), findsOneWidget);
    await tester.tap(find.byTooltip('Teilen'));
    await tester.pumpAndSettle();
    expect(geteilt.last, ('beleg-7.jpg', 'image/jpeg'));
    await tester.tap(find.byTooltip('Zurück').last);
    await tester.pumpAndSettle();

    // Beleg loeschen (mit Rueckfrage).
    await imMaterial(
      tester,
      find.descendant(
        of: find.byKey(const Key('beleg-7')),
        matching: find.byTooltip('Beleg löschen'),
      ),
    );
    await tippen(tester, find.widgetWithText(FilledButton, 'Löschen'));
    expect(zugang.letzter('belegLoeschen'), [_chilbi, 7]);

    // Zurueckbuchen: Bier ist abgehakt und noch nicht im Lager -> (1).
    await imMaterial(tester, find.byKey(const Key('zurueckbuchen')));
    expect(find.text('Ins Lager zurückbuchen?'), findsOneWidget);
    await tippen(tester, find.widgetWithText(FilledButton, 'Zurückbuchen'));
    expect(zugang.gab('zurueckbuchen'), isTrue);
    expect(find.text('Ins Lager gebucht: Bier +6'), findsOneWidget);
    expect(tester.takeException(), isNull);
  });

  testWidgets('Material ohne Einkaufsrecht: keine Haken, keine Belege', (tester) async {
    final json = _vertrag();
    for (final a in json['anlaesse'] as List) {
      ((a as Map)['organisator']['aktionen'] as Map)['einkauf'] = false;
    }
    zugang.json = json;
    await anlass(tester, _chilbi);
    await tippen(tester, find.widgetWithText(Tab, 'Material'));
    expect(find.byType(Checkbox), findsNothing);
    expect(find.text('Belege'), findsNothing);
    expect(zugang.gab('belege'), isFalse);
  });

  testWidgets('Externer Organisator: nur bestaetigen/ablehnen, keine Reiter', (tester) async {
    final json = _vertrag();
    for (final a in json['anlaesse'] as List) {
      (a as Map)['organisator']['aktionen'] = {
        'bestaetigen': true,
        'hinzufuegen': true,
        'arbeitsplan_senden': true,
        'pdf_arbeitsplan': true,
      };
    }
    zugang.json = json;
    await zeigen(
      tester,
      VerwaltungsAnlassScreen(verwaltung: verwaltung(), anlassId: null, eingebettet: true),
    );
    expect(find.text('Chilbi 2026'), findsOneWidget, reason: 'ohne ID der erste Anlass');
    expect(find.byType(TabBar), findsNothing);
    expect(find.byTooltip('Anlass bearbeiten'), findsNothing);
    expect(find.text('Ändern'), findsNothing);
    expect(find.text('Bestätigen'), findsOneWidget);
    await tippen(tester, find.text('Arbeitsplan senden'));
    await tippen(tester, find.widgetWithText(FilledButton, 'Senden'));
    expect(zugang.letzter('arbeitsplanSenden'), [_chilbi]);
  });

  testWidgets('schmales Handy im Dunkelmodus: nichts laeuft ueber', (tester) async {
    tester.platformDispatcher.platformBrightnessTestValue = Brightness.dark;
    addTearDown(tester.platformDispatcher.clearPlatformBrightnessTestValue);
    await zeigen(
      tester,
      VerwaltungsAnlassScreen(verwaltung: verwaltung(), anlassId: _essen),
      groesse: const Size(320, 640),
    );
    for (final r in ['Schichten', 'Notizen', 'Material', 'Anmeldungen']) {
      await tippen(tester, find.widgetWithText(Tab, r));
    }
    await tippen(tester, find.text('Ändern').first);
    await tester.tap(find.byTooltip('Zurück'));
    await tester.pumpAndSettle();
    await tippen(tester, find.byTooltip('Anlass bearbeiten'));
    await tester.enterText(find.widgetWithText(TextFormField, 'Titel *'), 'Helferessen 2026');
    await tester.scrollUntilVisible(
      find.byKey(const Key('anlass-menue')),
      200,
      scrollable: find.byType(Scrollable).hitTestable().first,
    );
    expect(tester.takeException(), isNull);
  });
}
