// Oberflaeche der Anlass-Verwaltung mit nachgebautem Zugang. Die Daten
// kommen aus dem Vertrag mit dem Backend (organisator-uebersicht.json), die
// Screens sprechen nur mit der Schnittstelle — so wie spaeter auch mit dem
// Vorstand-Zugang.

import 'dart:convert';
import 'dart:io';
import 'dart:typed_data';

import 'package:flutter/rendering.dart' show RenderParagraph;
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

  /// Hinweis, den das Backend beim Eintragen meldet (volle Schicht).
  String? warnung;
  @override
  Future<String?> personHinzufuegen(String a, NeuePerson p) =>
      _merken('personHinzufuegen', [a, p.alsJson()], warnung);
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

  // Mitorganisatoren: Liste im Speicher, wie das Backend sie liefert.
  final mitorganisatorListe = <OrganisatorEintrag>[];
  @override
  Future<OrganisatorenListe> organisatoren(String a) => _merken(
    'organisatoren',
    [a],
    OrganisatorenListe(
      hauptorganisator: const OrganisatorEintrag(name: 'Erika Muster', mitgliedId: 'm1'),
      mitorganisatoren: List.of(mitorganisatorListe),
      darfVerwalten: true,
    ),
  );
  @override
  Future<OrganisatorEintrag> mitorganisatorHinzufuegen(String a, NeuerMitorganisator neu) {
    final e = OrganisatorEintrag(
      id: 'o${mitorganisatorListe.length + 1}',
      name: neu.istMitglied ? 'Hans Helfer' : neu.name.trim(),
      mitgliedId: neu.mitgliedId,
      email: neu.istMitglied ? null : neu.email.trim(),
      extern: !neu.istMitglied,
      zugangBis: neu.istMitglied ? null : DateTime(2027, 1, 24),
    );
    mitorganisatorListe.add(e);
    return _merken('mitorganisatorHinzufuegen', [a, neu.alsJson()], e);
  }

  @override
  Future<void> mitorganisatorEntfernen(String a, String id) {
    mitorganisatorListe.removeWhere((e) => e.id == id);
    return _merken('mitorganisatorEntfernen', [a, id], null);
  }
}

/// Nachgebauter Vorstand: alles vom Organisator plus anlegen, loeschen,
/// Vorschlaege (wie VorstandZugang).
class _FalscherVorstand extends _FalscherZugang {
  _FalscherVorstand(super.json);

  final vorschlagListe = [
    OffenerVorschlag.ausJson({
      'id': 'v1',
      'title': 'Grillabend',
      'start_date': '2027-06-12 18:00:00',
      'location': 'Schopf',
      'description': 'Gemütlich grillen.',
      'organizer_id': 'm1',
      'organizer_vorname': 'Erika',
      'organizer_nachname': 'Muster',
    }),
    OffenerVorschlag.ausJson({'id': 'v2', 'title': 'Kartbahn', 'organizer_name': 'Hans Helfer'}),
  ];

  @override
  String get bezeichnung => 'Anlässe';
  @override
  bool get kannAnlegen => true;
  @override
  bool get kannLoeschen => true;
  @override
  bool get kannVergangeneZeigen => true;

  /// Wie der Vertrag, dazu ein vergangener Anlass (wie `?vergangene=true`).
  @override
  Future<VerwaltungsUebersicht> uebersichtMitVergangenen() {
    final alt =
        jsonDecode(jsonEncode((this.json['anlaesse'] as List).first)) as Map<String, dynamic>;
    alt['id'] = _altesFest;
    alt['slug'] = 'altes-fest';
    alt['title'] = 'Altes Fest';
    (alt['organisator'] as Map)['aktuell'] = false;
    return _merken(
      'uebersichtMitVergangenen',
      [],
      VerwaltungsUebersicht.ausJson({
        ...this.json,
        'anlaesse': [...this.json['anlaesse'] as List, alt],
      }),
    );
  }

  @override
  Future<String> anlassAnlegen(AnlassEntwurf e) => _merken('anlassAnlegen', [
    e.alsNeuJson(anmeldepflichtig: ['Dorffest', 'GV']),
  ], 'neu1');
  @override
  Future<bool> anlassAendern(String a, AnlassEntwurf original, AnlassEntwurf neu) {
    final body = neu.aenderungen(original);
    return _merken('anlassAendern', [a, body], body.isNotEmpty);
  }

  @override
  Future<void> anlassLoeschen(String a) => _merken('anlassLoeschen', [a], null);
  @override
  Future<List<OffenerVorschlag>> vorschlaege() =>
      _merken('vorschlaege', [], List.of(vorschlagListe));
  @override
  Future<void> vorschlagFreigeben(String a) {
    vorschlagListe.removeWhere((v) => v.anlass.id == a);
    return _merken('vorschlagFreigeben', [a], null);
  }

  @override
  Future<void> vorschlagAblehnen(String a) {
    vorschlagListe.removeWhere((v) => v.anlass.id == a);
    return _merken('vorschlagAblehnen', [a], null);
  }
}

// Kleinstes gueltiges PNG (1x1), fuer die Beleg-Ansicht.
final _png = Uint8List.fromList(
  base64Decode(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
  ),
);

const _chilbi = '00000000-0000-0000-0000-e00000000001';
const _essen = '00000000-0000-0000-0000-e00000000004';
const _altesFest = '00000000-0000-0000-0000-e00000000099';

void main() {
  late _FalscherZugang zugang;
  late List<(String, String)> geteilt;
  late List<Uri> links;

  setUp(() {
    zugang = _FalscherZugang(_vertrag());
    geteilt = [];
    links = [];
  });

  AnlassVerwaltung verwaltung([
    AnlassVerwaltungZugang? anderer,
    Future<GewaehlteDatei?> Function()? pdfWaehlen,
  ]) => AnlassVerwaltung(
    zugang: anderer ?? zugang,
    umgebung: VerwaltungsUmgebung(
      pdfWaehlen:
          pdfWaehlen ??
          () async =>
              (bytes: Uint8List.fromList(utf8.encode('%PDF-1.4 x')), dateiname: 'aushang.pdf'),
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

  // Chilbi: Aufbau (1/4), Schicht 1 (2/2, voll), Schicht 2 (1/2).
  const aufbau = '00000000-0000-0000-0000-500000000001';
  const schicht1 = '00000000-0000-0000-0000-500000000002';
  const schicht2 = '00000000-0000-0000-0000-500000000003';

  bool angekreuzt(WidgetTester tester, String schichtId) =>
      tester.widget<CheckboxListTile>(find.byKey(Key('schicht-wahl-$schichtId'))).value!;

  testWidgets('Knopf an der Schicht: Formular mit der Schicht vorausgewaehlt', (tester) async {
    zugang.warnung = 'Schicht bereits voll, trotzdem eingetragen: Schicht 1 2/2';
    await anlass(tester, _chilbi);
    await tippen(tester, find.widgetWithText(Tab, 'Schichten'));
    await tippen(tester, find.byKey(const Key('schicht-person-$schicht1')));
    expect(find.byKey(const Key('person-eintragen')), findsOneWidget, reason: 'Formular offen');
    expect(find.byKey(const Key('person-schichten-kurz')), findsOneWidget);
    expect(find.text('Für die Schicht'), findsOneWidget);
    await tester.scrollUntilVisible(
      find.byKey(const Key('schicht-wahl-$schicht2')),
      200,
      scrollable: find.byType(Scrollable).hitTestable().first,
    );
    expect(angekreuzt(tester, schicht1), isTrue);
    expect(angekreuzt(tester, aufbau), isFalse);
    expect(angekreuzt(tester, schicht2), isFalse);
    expect(find.text('2/2 voll'), findsOneWidget, reason: 'Belegung x/y');
    expect(find.text('1/4'), findsOneWidget);
    expect(tester.takeException(), isNull);

    await tester.scrollUntilVisible(
      find.byKey(const Key('mitglied-suche')),
      -200,
      scrollable: find.byType(Scrollable).hitTestable().first,
    );
    await tester.enterText(find.byKey(const Key('mitglied-suche')), 'hans');
    await tester.pumpAndSettle();
    await tippen(tester, find.text('Hans Helfer'));
    await tippen(tester, find.byKey(const Key('person-eintragen')));
    expect(zugang.letzter('personHinzufuegen'), [
      _chilbi,
      {
        'member_id': 'm2',
        'participants': 1,
        'shift_ids': [schicht1],
      },
    ]);
    expect(find.textContaining('Schicht bereits voll'), findsOneWidget, reason: 'Hinweis');
    expect(find.byKey(const Key('person-eintragen')), findsNothing, reason: 'Formular zu');
  });

  testWidgets('Person eintragen: Schichten ankreuzen, in Reihenfolge der Schichten', (
    tester,
  ) async {
    await anlass(tester, _chilbi);
    await tippen(tester, find.text('Person'));
    expect(find.byKey(const Key('person-schichten-kurz')), findsNothing);
    await tippen(tester, find.text('Gast'));
    await tester.enterText(find.widgetWithText(TextFormField, 'Name *'), 'Muendlich');
    await tippen(tester, find.byKey(const Key('schicht-wahl-$schicht2')));
    await tippen(tester, find.byKey(const Key('schicht-wahl-$aufbau')));
    expect(find.text('Für die Schichten'), findsOneWidget);
    await tippen(tester, find.byKey(const Key('person-eintragen')));
    expect((zugang.letzter('personHinzufuegen') as List).last, {
      'guest_name': 'Muendlich',
      'participants': 1,
      'shift_ids': [aufbau, schicht2],
    });
  });

  testWidgets('Anmeldung aendern: Schichten tauschen', (tester) async {
    await anlass(tester, _chilbi);
    // Erste Anmeldung: Gast Neu, Schicht 2
    await tippen(tester, find.text('Ändern').first);
    await tester.scrollUntilVisible(
      find.byKey(const Key('schicht-wahl-$schicht2')),
      200,
      scrollable: find.byType(Scrollable).hitTestable().first,
    );
    expect(angekreuzt(tester, schicht2), isTrue);
    expect(find.textContaining('Schicht: '), findsNothing, reason: 'nicht mehr nur Anzeige');
    await tippen(tester, find.byKey(const Key('schicht-wahl-$schicht2')));
    await tippen(tester, find.byKey(const Key('schicht-wahl-$aufbau')));
    await tippen(tester, find.byKey(const Key('anmeldung-speichern')));
    expect((zugang.letzter('anmeldungAendern') as List).last, {
      'shift_ids': [aufbau],
    });
  });

  for (final groesse in [const Size(360, 640), const Size(1400, 900)]) {
    testWidgets('Schichten und Person eintragen bei ${groesse.width} dp: nichts laeuft ueber', (
      tester,
    ) async {
      await zeigen(
        tester,
        VerwaltungsAnlassScreen(verwaltung: verwaltung(), anlassId: _chilbi),
        groesse: groesse,
      );
      await tippen(tester, find.widgetWithText(Tab, 'Schichten'));
      expect(find.byKey(const Key('schicht-person-$schicht2')), findsOneWidget);
      await tippen(tester, find.byKey(const Key('schicht-person-$schicht2')));
      await tester.scrollUntilVisible(
        find.byKey(const Key('schicht-wahl-$schicht2')),
        200,
        scrollable: find.byType(Scrollable).hitTestable().first,
      );
      expect(tester.takeException(), isNull);
      await tester.tap(find.byTooltip('Zurück'));
      await tester.pumpAndSettle();
      await tippen(tester, find.widgetWithText(Tab, 'Anmeldungen'));
      await tippen(tester, find.text('Ändern').first);
      await tester.scrollUntilVisible(
        find.byKey(const Key('anmeldung-schichten')),
        200,
        scrollable: find.byType(Scrollable).hitTestable().first,
      );
      expect(tester.takeException(), isNull);
    });
  }

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

  testWidgets('Organisatoren: Mitglied und Externen hinzufuegen, entfernen mit Rueckfrage', (
    tester,
  ) async {
    await anlass(tester, _chilbi);
    await tippen(tester, find.widgetWithText(ActionChip, 'Organisatoren'));
    expect(zugang.letzter('organisatoren'), [_chilbi]);
    expect(find.text('Erika Muster'), findsOneWidget);
    expect(find.text('Mitorganisatoren (0)'), findsOneWidget);

    // Mitglied aus dem Verzeichnis
    await tippen(tester, find.byKey(const Key('mitorganisator-neu')));
    await tippen(tester, find.byKey(const Key('mitorganisator-mitglied')));
    expect(find.text('Mitorganisator wählen'), findsOneWidget);
    await tippen(tester, find.text('Hans Helfer'));
    expect(zugang.letzter('mitorganisatorHinzufuegen'), [
      _chilbi,
      {'member_id': 'm2'},
    ]);
    expect(find.text('Hans Helfer ist jetzt Mitorganisator'), findsOneWidget);
    expect(find.text('Mitorganisatoren (1)'), findsOneWidget);

    // Extern: Name und E-Mail, ungueltige E-Mail abgewiesen
    await tippen(tester, find.byKey(const Key('mitorganisator-neu')));
    await tippen(tester, find.byKey(const Key('mitorganisator-extern')));
    await tester.enterText(find.byKey(const Key('extern-name')), 'Eva Extern');
    await tester.enterText(find.byKey(const Key('extern-email')), 'keine-mail');
    await tippen(tester, find.byKey(const Key('extern-hinzufuegen')));
    expect(find.text('Bitte eine gültige E-Mail angeben.'), findsOneWidget);
    await tester.enterText(find.byKey(const Key('extern-email')), ' eva@example.ch ');
    await tippen(tester, find.byKey(const Key('extern-hinzufuegen')));
    expect(zugang.letzter('mitorganisatorHinzufuegen'), [
      _chilbi,
      {'name': 'Eva Extern', 'email': 'eva@example.ch'},
    ]);
    expect(find.textContaining('Zugangsdaten an eva@example.ch gesendet'), findsOneWidget);
    expect(find.textContaining('Extern · Zugang bis 24.01.2027'), findsOneWidget);

    // Entfernen nur nach Rueckfrage
    await tippen(tester, find.byKey(const Key('mitorganisator-entfernen-o2')));
    expect(find.text('Mitorganisator entfernen?'), findsOneWidget);
    expect(
      find.textContaining('Der Zugang zum Event-Dashboard gilt ab sofort nicht mehr.'),
      findsOneWidget,
    );
    await tippen(tester, find.widgetWithText(FilledButton, 'Entfernen'));
    expect(zugang.letzter('mitorganisatorEntfernen'), [_chilbi, 'o2']);
    expect(find.text('Mitorganisatoren (1)'), findsOneWidget);
    expect(find.text('Eva Extern'), findsNothing);
  });

  testWidgets('Mitorganisator: kein Knopf "Organisatoren", sonst alle Rechte', (tester) async {
    final json = _vertrag();
    for (final a in json['anlaesse'] as List) {
      (a as Map)['organisator']['aktionen']['organisatoren_verwalten'] = false;
    }
    zugang.json = json;
    await anlass(tester, _chilbi);
    expect(find.widgetWithText(ActionChip, 'Organisatoren'), findsNothing);
    expect(find.widgetWithText(ActionChip, 'Informieren'), findsOneWidget);
    expect(find.byTooltip('Anlass bearbeiten'), findsOneWidget);
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

  // Samsung A37 (384 dp) zeigte "Anmeldun": Jeder Reitertext muss ganz
  // hineinpassen, auch auf schmalen Handys.
  for (final breite in [360.0, 384.0, 393.0]) {
    testWidgets('Reiter bei $breite dp: jeder Text ganz sichtbar', (tester) async {
      await zeigen(
        tester,
        VerwaltungsAnlassScreen(verwaltung: verwaltung(), anlassId: _chilbi),
        groesse: Size(breite, 800),
      );
      for (final r in ['Anmeldungen', 'Schichten', 'Notizen', 'Material']) {
        final text = tester.renderObject<RenderParagraph>(
          find.descendant(of: find.widgetWithText(Tab, r), matching: find.text(r)),
        );
        expect(
          text.size.width,
          greaterThanOrEqualTo(text.getMaxIntrinsicWidth(double.infinity) - 0.5),
          reason: '"$r" abgeschnitten',
        );
      }
      // Der letzte Reiter ist erreichbar.
      await tippen(tester, find.widgetWithText(Tab, 'Material'));
      expect(tester.takeException(), isNull);
    });
  }

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

  // ---------------------------------------------------------------------
  // Vorstand

  Future<void> eingeben(WidgetTester tester, Finder f, String text) async {
    if (f.evaluate().isEmpty) {
      await tester.scrollUntilVisible(
        f,
        200,
        scrollable: find.byType(Scrollable).hitTestable().first,
      );
    }
    await tester.ensureVisible(f);
    await tester.pumpAndSettle();
    await tester.enterText(f, text);
    await tester.pumpAndSettle();
  }

  testWidgets('Organisator: kein "Neuer Anlass", kein Loeschen, Formular wie bisher', (
    tester,
  ) async {
    await zeigen(tester, VerwaltungsUebersichtScreen(verwaltung: verwaltung()));
    expect(find.text('Neuer Anlass'), findsNothing);
    expect(find.textContaining('Vorschläge'), findsNothing);
    expect(find.byKey(const Key('vergangene-anzeigen')), findsNothing, reason: 'nur Vorstand');
    await tippen(tester, find.text('Chilbi 2026'));
    expect(find.byTooltip('Anlass löschen'), findsNothing);
    await tippen(tester, find.widgetWithText(Tab, 'Schichten'));
    expect(find.byKey(const Key('springer-generieren')), findsNothing);
    await tippen(tester, find.byTooltip('Anlass bearbeiten'));
    for (final k in ['organisator-art', 'anlass-datum-offen', 'anlass-pdf']) {
      await tester.drag(find.byType(ListView).last, const Offset(0, -2000));
      await tester.pumpAndSettle();
      expect(find.byKey(Key(k)), findsNothing, reason: k);
    }
    expect(zugang.gab('vorschlaege'), isFalse);
  });

  testWidgets('Vorstand: Vorschlaege oben - genehmigen, ablehnen mit Rueckfrage', (tester) async {
    final v = _FalscherVorstand(_vertrag());
    await zeigen(tester, VerwaltungsUebersichtScreen(verwaltung: verwaltung(v)));
    expect(find.text('Anlässe'), findsOneWidget);
    expect(find.text('Vorschläge (2)'), findsOneWidget);
    expect(find.text('Vorschlag von Erika Muster'), findsOneWidget);
    expect(find.text('12.06.2027, 18:00 · Schopf'), findsOneWidget);
    expect(find.text('Chilbi 2026'), findsOneWidget, reason: 'die Anlaesse bleiben');
    expect(find.text('Neuer Anlass'), findsOneWidget);

    await tippen(tester, find.widgetWithText(FilledButton, 'Genehmigen').first);
    expect(v.letzter('vorschlagFreigeben'), ['v1']);
    expect(find.text('Vorschläge (1)'), findsOneWidget);

    await tippen(tester, find.widgetWithText(TextButton, 'Ablehnen'));
    expect(find.text('Vorschlag ablehnen?'), findsOneWidget);
    await tippen(tester, find.widgetWithText(FilledButton, 'Ablehnen'));
    expect(v.letzter('vorschlagAblehnen'), ['v2']);
    expect(find.textContaining('Vorschläge'), findsNothing);
  });

  testWidgets('Vorstand: Vorschlag bearbeiten oeffnet das Formular mit Organisator', (
    tester,
  ) async {
    final v = _FalscherVorstand(_vertrag());
    await zeigen(tester, VerwaltungsUebersichtScreen(verwaltung: verwaltung(v)));
    await tippen(tester, find.widgetWithText(OutlinedButton, 'Bearbeiten').first);
    expect(find.text('Anlass bearbeiten'), findsOneWidget);
    await tester.scrollUntilVisible(
      find.byKey(const Key('organisator-mitglied')),
      200,
      scrollable: find.byType(Scrollable).hitTestable().first,
    );
    expect(
      find.descendant(
        of: find.byKey(const Key('organisator-mitglied')),
        matching: find.text('Erika Muster'),
      ),
      findsOneWidget,
    );
    await tippen(tester, find.byKey(const Key('anlass-speichern')));
    expect(v.letzter('anlassAendern'), ['v1', <String, Object?>{}], reason: 'nichts geaendert');
  });

  testWidgets('Vorstand: neuer Anlass (Dorffest) mit Mitglied, Schicht und Springer', (
    tester,
  ) async {
    final v = _FalscherVorstand(_vertrag());
    await zeigen(tester, VerwaltungsUebersichtScreen(verwaltung: verwaltung(v)));
    await tippen(tester, find.text('Neuer Anlass'));
    expect(find.text('Neuer Anlass'), findsOneWidget, reason: 'Titel des Formulars');
    await eingeben(tester, find.widgetWithText(TextFormField, 'Titel *'), 'Chilbi 2027');

    // Dorffest: nur Schichten, keine Anmeldefelder (siehe Body unten).
    await tippen(tester, find.byKey(const Key('anlass-kategorie')));
    await tippen(tester, find.text('Dorffest').last);

    await tippen(
      tester,
      find.descendant(
        of: find.byKey(const Key('anlass-beginn')),
        matching: find.text('Datum wählen'),
      ),
    );
    await tippen(tester, find.text('OK'));

    await tippen(tester, find.text('Mitglied wählen'));
    await tippen(tester, find.text('Hans Helfer'));
    expect(find.text('Hans Helfer'), findsOneWidget);

    await tippen(tester, find.byKey(const Key('neue-schicht')));
    expect(find.text('Neue Schicht'), findsOneWidget);
    expect(find.text('Schicht löschen'), findsNothing);
    await tester.enterText(find.byKey(const Key('schicht-name')), 'Bar 1');
    await tippen(tester, find.text('Von'));
    await tippen(tester, find.text('OK'));
    await tippen(tester, find.text('Bis'));
    await tippen(tester, find.text('OK'));
    await tippen(tester, find.byKey(const Key('schicht-speichern')));
    expect(v.gab('schichtAnlegen'), isFalse, reason: 'erst beim Anlegen des Anlasses');

    await tippen(tester, find.byKey(const Key('springer-generieren')));
    expect(find.text('1 Springer-Schicht ergänzt'), findsOneWidget);
    expect(find.text('Springer – Springer'), findsOneWidget);

    await tippen(tester, find.byKey(const Key('anlass-speichern')));
    final body = (v.letzter('anlassAnlegen') as List).single as Map<String, Object?>;
    final heute = isoDatum(DateTime.now());
    expect(body, {
      'title': 'Chilbi 2027',
      'subtitle': null,
      'category': 'Dorffest',
      'status': 'planned',
      'start_date': heute,
      'end_date': null,
      'datum_offen': false,
      'location': null,
      'description': null,
      'cost': null,
      'registration_required': true,
      'registration_deadline': null,
      'max_participants': null,
      'meal_options': null,
      'organizer_id': 'm2',
      'organizer_name': 'Hans Helfer',
      'organizer_email': null,
      'create_access': false,
    });
    final schichten = [
      for (final a in v.aufrufe)
        if (a.$1 == 'schichtAnlegen') a.$2,
    ];
    expect(schichten, [
      [
        'neu1',
        {
          'name': 'Bar 1',
          'bereich': 'Allgemein',
          'description': null,
          'date': heute,
          'start_time': '12:00',
          'end_time': '12:00',
          'needed': 1,
        },
      ],
      [
        'neu1',
        {
          'name': 'Springer',
          'bereich': 'Springer',
          'description': null,
          'date': heute,
          'start_time': '12:00',
          'end_time': '12:00',
          'needed': 1,
        },
      ],
    ]);
    expect(find.text('Anlass angelegt'), findsOneWidget);
    expect(find.text('Chilbi 2026'), findsOneWidget, reason: 'zurueck in der Uebersicht');
  });

  testWidgets('Vorstand: extern mit Zugang, Termin offen, PDF - nur Geaendertes', (tester) async {
    final v = _FalscherVorstand(_vertrag());
    await zeigen(tester, VerwaltungsAnlassScreen(verwaltung: verwaltung(v), anlassId: _chilbi));
    await tippen(tester, find.byTooltip('Anlass bearbeiten'));
    await tippen(tester, find.byKey(const Key('anlass-datum-offen')));
    // Organisator ohne Mitglied-ID: steht als extern im Formular.
    await eingeben(tester, find.byKey(const Key('organisator-name')), 'Max Muster');
    await eingeben(tester, find.byKey(const Key('organisator-email')), 'max@example.ch');
    await tippen(tester, find.byKey(const Key('organisator-zugang')));
    await tippen(tester, find.byKey(const Key('pdf-waehlen')));
    expect(find.text('aushang.pdf'), findsOneWidget);
    expect(find.text('1 KB · Wird beim Speichern hochgeladen'), findsOneWidget);
    await tippen(tester, find.byKey(const Key('anlass-speichern')));
    expect(v.letzter('anlassAendern'), [
      _chilbi,
      {
        'datum_offen': true,
        'organizer_id': null,
        'organizer_name': 'Max Muster',
        'organizer_email': 'max@example.ch',
        'create_access': true,
        'pdf_attachment': base64Encode(utf8.encode('%PDF-1.4 x')),
        'pdf_filename': 'aushang.pdf',
      },
    ]);
  });

  testWidgets('Vorstand: Vergangene anzeigen - Standard aus, eingeschaltet unter "Vorbei"', (
    tester,
  ) async {
    final v = _FalscherVorstand(_vertrag());
    await zeigen(tester, VerwaltungsUebersichtScreen(verwaltung: verwaltung(v)));
    final schalter = find.byKey(const Key('vergangene-anzeigen'));
    // unter den aktuellen Anlaessen
    await tester.scrollUntilVisible(schalter, 200);
    expect(tester.widget<SwitchListTile>(schalter).value, isFalse);
    expect(find.text('Altes Fest'), findsNothing);
    expect(find.text('Vorbei'), findsNothing);
    expect(v.gab('uebersichtMitVergangenen'), isFalse);

    await tippen(tester, schalter);
    expect(tester.widget<SwitchListTile>(schalter).value, isTrue);
    expect(v.gab('uebersichtMitVergangenen'), isTrue);
    await tester.scrollUntilVisible(find.text('Altes Fest'), 200);
    final vorbei = tester.getRect(find.text('Vorbei'));
    expect(tester.getRect(find.text('Altes Fest')).top, greaterThan(vorbei.top));
    expect(
      find.text('Chilbi 2026', skipOffstage: false),
      findsOneWidget,
      reason: 'aktuelle bleiben',
    );

    // Oeffnen: den vergangenen Anlass kennt nur die Uebersicht mit Vergangenen.
    await tippen(tester, find.text('Altes Fest'));
    expect(find.widgetWithText(Tab, 'Anmeldungen'), findsOneWidget);
    expect(find.byTooltip('Anlass bearbeiten'), findsOneWidget, reason: 'voll verwaltbar');
    expect(find.byTooltip('Anlass löschen'), findsOneWidget);

    Navigator.of(tester.element(find.byType(VerwaltungsAnlassScreen))).pop();
    await tester.pumpAndSettle();
    await tippen(tester, schalter);
    expect(find.text('Altes Fest', skipOffstage: false), findsNothing);
  });

  testWidgets('Vorstand: PDF zu gross oder kein PDF - Meldung, nichts gewaehlt', (tester) async {
    final v = _FalscherVorstand(_vertrag());
    final antworten = <Future<GewaehlteDatei?> Function()>[
      () async => throw const ApiFehler('Das PDF darf höchstens 10 MB gross sein.'),
      () async => (
        bytes: Uint8List(pdfHoechstGroesse + 1)..setAll(0, utf8.encode('%PDF')),
        dateiname: 'riesig.pdf',
      ),
      () async => (bytes: Uint8List.fromList(utf8.encode('kein pdf')), dateiname: 'x.pdf'),
      () async => null,
    ];
    var i = 0;
    await zeigen(
      tester,
      VerwaltungsAnlassScreen(verwaltung: verwaltung(v, () => antworten[i++]()), anlassId: _chilbi),
    );
    await tippen(tester, find.byTooltip('Anlass bearbeiten'));
    for (final text in [
      'Das PDF darf höchstens 10 MB gross sein.',
      'Das PDF darf höchstens 10 MB gross sein.',
      'Bitte ein PDF wählen.',
      null,
    ]) {
      tester.state<ScaffoldMessengerState>(find.byType(ScaffoldMessenger)).clearSnackBars();
      await tester.pumpAndSettle();
      await tippen(tester, find.byKey(const Key('pdf-waehlen')));
      if (text != null) expect(find.text(text), findsOneWidget);
      expect(find.text('Kein PDF angehängt'), findsOneWidget);
    }
    expect(i, 4);
  });

  test('dateiGroesseText', () {
    expect(dateiGroesseText(10), '1 KB');
    expect(dateiGroesseText(850 * 1024), '850 KB');
    expect(dateiGroesseText((2.4 * 1024 * 1024).round()), '2,4 MB');
  });

  testWidgets('Vorstand: Anlass loeschen nur nach Rueckfrage', (tester) async {
    final v = _FalscherVorstand(_vertrag());
    await zeigen(tester, VerwaltungsAnlassScreen(verwaltung: verwaltung(v), anlassId: _chilbi));
    await tippen(tester, find.byTooltip('Anlass löschen'));
    expect(find.text('Anlass löschen?'), findsOneWidget);
    await tippen(tester, find.text('Abbrechen'));
    expect(v.gab('anlassLoeschen'), isFalse);

    await tippen(tester, find.byTooltip('Anlass löschen'));
    await tippen(tester, find.widgetWithText(FilledButton, 'Löschen'));
    expect(v.letzter('anlassLoeschen'), [_chilbi]);
    expect(find.text('Anlass gelöscht'), findsOneWidget);
  });

  testWidgets('Vorstand: Springer im Reiter Schichten - je Zeitfenster einer', (tester) async {
    final v = _FalscherVorstand(_vertrag());
    await zeigen(tester, VerwaltungsAnlassScreen(verwaltung: verwaltung(v), anlassId: _chilbi));
    await tippen(tester, find.widgetWithText(Tab, 'Schichten'));
    await tippen(tester, find.byKey(const Key('springer-generieren')));
    expect(find.text('3 Springer-Schichten anlegen?'), findsOneWidget);
    await tippen(tester, find.widgetWithText(FilledButton, 'Anlegen'));
    final neu = [
      for (final a in v.aufrufe)
        if (a.$1 == 'schichtAnlegen') a.$2.last as Map,
    ];
    expect(
      [for (final s in neu) '${s['date']} ${s['start_time']}-${s['end_time']}'],
      ['2026-10-16 08:00-null', '2026-10-17 12:00-14:00', '2026-10-17 17:00-20:00'],
    );
    expect(neu.every((s) => s['bereich'] == 'Springer' && s['needed'] == 1), isTrue);
  });

  testWidgets('Vorstand am Desktop: Uebersicht in Spalten, Formular lesbar breit', (tester) async {
    final v = _FalscherVorstand(_vertrag());
    await zeigen(
      tester,
      VerwaltungsUebersichtScreen(verwaltung: verwaltung(v)),
      groesse: const Size(1400, 900),
    );
    final k1 = tester.getRect(find.byKey(const Key('vorschlag-v1')));
    final k2 = tester.getRect(find.byKey(const Key('vorschlag-v2')));
    expect(k1.top, k2.top, reason: 'nebeneinander');
    await tippen(tester, find.text('Neuer Anlass'));
    final titel = tester.getRect(find.widgetWithText(TextFormField, 'Titel *'));
    expect(titel.width, lessThanOrEqualTo(840));
    expect(tester.takeException(), isNull);
  });
}
