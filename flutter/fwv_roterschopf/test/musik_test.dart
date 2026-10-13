// Musik im Roten Schopf: Playlists und Radiosender gegen einen
// nachgebauten Zugang. Antworten im Format von api-members (/kiosk/...).

import 'dart:async';

import 'package:flutter_test/flutter_test.dart';
import 'package:fwv_core/fwv_core.dart';
import 'package:fwv_roterschopf/fwv_roterschopf.dart';
import 'package:material_ui/material_ui.dart';

import 'vertrag.dart';

class _Wiedergabe implements Wiedergabe {
  final aufrufe = <String>[];
  List<WiedergabeEintrag> geladen = const [];
  final _stand = StreamController<WiedergabeStand>.broadcast();
  final _fehler = StreamController<WiedergabeFehler>.broadcast();
  int _index = 0;
  bool _spielt = false;

  void _melden({bool fertig = false}) =>
      _stand.add(WiedergabeStand(index: _index, spielt: _spielt, fertig: fertig));

  /// Der Titel an [i] laesst sich nicht abspielen.
  void kaputt(int i) => _fehler.add(
    WiedergabeFehler(
      index: i,
      code: '0',
      meldung: 'Source error: UnrecognizedInputFormatException',
    ),
  );
  void ende() {
    _spielt = false;
    _melden(fertig: true);
  }

  @override
  Future<void> laden(List<WiedergabeEintrag> liste, {int ab = 0}) async {
    geladen = liste;
    _index = ab;
    aufrufe.add('laden ${liste.length} ab $ab');
  }

  @override
  Future<void> spielen() async {
    aufrufe.add('spielen');
    _spielt = true;
    _melden();
  }

  @override
  Future<void> pause() async {
    aufrufe.add('pause');
    _spielt = false;
    _melden();
  }

  @override
  Future<void> stoppen() async {
    aufrufe.add('stoppen');
    _spielt = false;
    _melden();
  }

  @override
  Future<void> weiter() async {
    aufrufe.add('weiter');
    if (_index + 1 < geladen.length) _index++;
    _melden();
  }

  @override
  Future<void> zurueck() async {
    aufrufe.add('zurueck');
    if (_index > 0) _index--;
    _melden();
  }

  @override
  Future<void> springen(Duration position) async => aufrufe.add('springen ${position.inSeconds}');

  @override
  Future<void> springeZu(int index) async {
    aufrufe.add('springeZu $index');
    _index = index;
    _melden();
  }

  bool _zufall = false;

  @override
  Future<void> zufall(bool an) async {
    aufrufe.add('zufall $an');
    _zufall = an;
  }

  /// Bei Zufall rueckwaerts - vorhersehbar genug fuer den Test.
  @override
  List<int> get reihenfolge {
    final r = List.generate(geladen.length, (i) => i);
    return _zufall ? r.reversed.toList() : r;
  }

  @override
  Stream<WiedergabeStand> get stand => _stand.stream;

  @override
  Stream<Duration> get position => const Stream.empty();

  @override
  Stream<Duration?> get dauer => const Stream.empty();

  @override
  Stream<WiedergabeFehler> get fehler => _fehler.stream;

  @override
  Future<void> nochmals(int index, Duration position) async {
    aufrufe.add('nochmals $index');
    _index = index;
    _spielt = true;
    _melden();
  }

  @override
  Future<void> schliessen() async {
    await _stand.close();
    await _fehler.close();
  }
}

class _Zugang extends MusikZugang {
  final gemeldet = <(String?, String?, String?, int)>[];

  @override
  Future<void> fehlerMelden({
    String? pfad,
    String? quelle,
    String? code,
    String? meldung,
    int versuch = 1,
    Duration position = Duration.zero,
  }) async => gemeldet.add((pfad, quelle, meldung, versuch));

  final freigaben = <List<String>>[];
  bool freigabeKaputt = false;

  @override
  Future<List<Uri>> hoerAdressen(List<String> pfade) async {
    if (freigabeKaputt) throw const ApiFehler('Freigabe nicht moeglich', status: 500);
    freigaben.add(pfade);
    return [for (final p in pfade) Uri.parse('https://api.test/kiosk/hoeren?pfad=$p&t=x')];
  }

  var laptopZustand = LaptopZustand.ausJson(kioskMusikVertrag()['zustand']);
  bool laptopWeg = false;
  final laptopBefehle = <(String, Map<String, Object?>)>[];

  @override
  Future<LaptopZustand> laptop() async {
    if (laptopWeg) {
      throw const ApiFehler('Der Laptop im Roten Schopf antwortet nicht', status: 502);
    }
    return laptopZustand;
  }

  @override
  Future<void> laptopBefehl(String aktion, [Map<String, Object?> daten = const {}]) async =>
      laptopBefehle.add((aktion, daten));

  final gespeichert = <(String?, String, List<String>)>[];
  final senderNeu = <(String, String)>[];
  final geloescht = <String>[];
  var senderListe = [
    const Radiosender(
      id: 's1',
      name: 'Radio SRF 3',
      url: 'https://stream.srg-ssr.ch/srf3/mp3_128.m3u',
    ),
  ];

  @override
  Future<List<PlaylistKurz>> playlists() async => [
    PlaylistKurz.ausJson({
      'id': 'p1',
      'name': 'Chilbi Abend',
      'anzahl': 2,
      'erstellt_von_name': 'Erika Muster',
    }),
  ];

  @override
  Future<Playlist> playlist(String id) async => Playlist.ausJson({
    'id': 'p1',
    'name': 'Chilbi Abend',
    'titel': [
      {
        'pfad': 'Queen/Bohemian Rhapsody.mp3',
        'interpret': 'Queen',
        'titel': 'Bohemian Rhapsody',
        'vorhanden': true,
      },
      {'pfad': 'Weg/Alter Titel.mp3', 'interpret': null, 'titel': null, 'vorhanden': false},
    ],
  });

  @override
  Future<Bibliothek> bibliothek({String? suche}) async => Bibliothek.ausJson({
    'gesamt': 1153,
    'titel': [
      {'pfad': 'Queen/Bohemian Rhapsody.mp3', 'interpret': 'Queen', 'titel': 'Bohemian Rhapsody'},
      {'pfad': 'Baschi/Gib mer e Chance.mp3', 'interpret': 'Baschi', 'titel': 'Gib mer e Chance'},
    ],
  });

  @override
  Future<List<MusikTitel>> alleTitel() async => [
    for (var i = 0; i < 1153; i++)
      MusikTitel(pfad: 'Sammlung/Titel $i.mp3', interpret: 'Interpret $i', titel: 'Titel $i'),
  ];

  @override
  Future<Abgleich> abgleichen(String text) async => Abgleich.ausJson({
    'gelesen': 3,
    'gefunden': [
      {
        'zeile': 'Span – Louenesee',
        'pfad': 'Span/Louenesee.mp3',
        'interpret': 'Span',
        'titel': 'Louenesee',
        'sicher': true,
      },
      {
        'zeile': 'Bligg Manhatten',
        'pfad': 'Bligg/Manhattan.mp3',
        'interpret': 'Bligg',
        'titel': 'Manhattan',
        'sicher': false,
      },
    ],
    'fehlend': ['Unbekannt – Gibts nicht'],
  });

  @override
  Future<String> speichern({String? id, required String name, required List<String> pfade}) async {
    gespeichert.add((id, name, pfade));
    return id ?? 'neu';
  }

  @override
  Future<void> loeschen(String id) async => geloescht.add(id);

  @override
  Future<List<Radiosender>> sender() async => senderListe;

  @override
  Future<void> senderAnlegen({required String name, required String url}) async =>
      senderNeu.add((name, url));

  @override
  Future<void> senderLoeschen(String id) async => geloescht.add('sender:$id');
}

void main() {
  test('Modelle: fehlende Datei bleibt sichtbar, Anzeige faellt auf den Dateinamen zurueck', () {
    final p = Playlist.ausJson({
      'id': 'p',
      'name': 'x',
      'titel': [
        {'pfad': 'Weg/Alter Titel.mp3', 'vorhanden': false},
        {'pfad': 'a.mp3', 'interpret': 'A', 'titel': 'B'},
      ],
    });
    expect(p.titel.first.vorhanden, isFalse);
    expect(p.titel.first.anzeige, 'Alter Titel');
    expect(p.titel.last.anzeige, 'A – B');
    expect(Bibliothek.ausJson(null).titel, isEmpty);
  });

  late _Wiedergabe wiedergabe;

  Future<_Zugang> zeigen(WidgetTester tester, {bool laptop = false}) async {
    final z = _Zugang();
    wiedergabe = _Wiedergabe();
    tester.view.physicalSize = const Size(1080, 2400);
    tester.view.devicePixelRatio = 3;
    addTearDown(tester.view.reset);
    await tester.pumpWidget(
      MaterialApp(
        home: MusikScreen(
          zugang: z,
          wiedergabe: wiedergabe,
          laptopSteuern: laptop,
          senderAdresse: (u) async => u,
        ),
      ),
    );
    await tester.pumpAndSettle();
    return z;
  }

  testWidgets('Playlist bearbeiten: Titel suchen, abgleichen, entfernen, speichern', (
    tester,
  ) async {
    final z = await zeigen(tester);
    expect(find.text('Chilbi Abend'), findsOneWidget);
    expect(find.text('2 Titel · von Erika Muster'), findsOneWidget);

    await tester.tap(find.text('Chilbi Abend'));
    await tester.pumpAndSettle();
    expect(find.text('Queen – Bohemian Rhapsody'), findsOneWidget);
    expect(find.text('nicht mehr auf dem Laptop'), findsOneWidget);

    // Suchen: Queen ist schon drin, Baschi dazu.
    await tester.tap(find.text('Titel suchen'));
    await tester.pumpAndSettle();
    expect(find.text('2 von 1153 Titeln'), findsOneWidget);
    expect(find.text('schon in der Playlist'), findsOneWidget);
    await tester.tap(find.text('Baschi – Gib mer e Chance'));
    await tester.pump();
    await tester.tap(find.text('Übernehmen (1)'));
    await tester.pumpAndSettle();
    expect(find.text('3 Titel'), findsOneWidget);

    // Abgleich: knappen Treffer abwaehlen.
    await tester.tap(find.text('Liste abgleichen'));
    await tester.pumpAndSettle();
    await tester.enterText(find.byType(TextField), 'Span – Louenesee\nBligg Manhatten\nUnbekannt');
    await tester.tap(find.widgetWithText(FilledButton, 'Abgleichen'));
    await tester.pumpAndSettle();
    expect(find.text('3 Zeilen gelesen · 2 gefunden · 1 nicht in der Sammlung'), findsOneWidget);
    expect(find.text('knapp – bitte prüfen: Bligg Manhatten'), findsOneWidget);
    expect(find.text('• Unbekannt – Gibts nicht'), findsOneWidget);
    await tester.tap(find.text('Bligg – Manhattan'));
    await tester.pump();
    await tester.tap(find.text('Übernehmen (1)'));
    await tester.pumpAndSettle();
    expect(find.text('4 Titel'), findsOneWidget);

    // Den nicht mehr vorhandenen Titel entfernen und speichern.
    final weg = find.ancestor(
      of: find.text('nicht mehr auf dem Laptop'),
      matching: find.byType(ListTile),
    );
    await tester.tap(find.descendant(of: weg, matching: find.byTooltip('Entfernen')));
    await tester.pumpAndSettle();
    await tester.tap(find.byTooltip('Speichern'));
    await tester.pumpAndSettle();

    expect(z.gespeichert.single.$1, 'p1');
    expect(z.gespeichert.single.$2, 'Chilbi Abend');
    expect(z.gespeichert.single.$3, [
      'Queen/Bohemian Rhapsody.mp3',
      'Baschi/Gib mer e Chance.mp3',
      'Span/Louenesee.mp3',
    ]);
  });

  testWidgets('Neue Playlist braucht einen Namen; Zurueck mit Aenderungen fragt nach', (
    tester,
  ) async {
    final z = await zeigen(tester);
    await tester.tap(find.text('Neue Playlist'));
    await tester.pumpAndSettle();
    await tester.tap(find.byTooltip('Speichern'));
    await tester.pump();
    expect(find.text('Die Playlist braucht einen Namen.'), findsOneWidget);
    expect(z.gespeichert, isEmpty);

    await tester.enterText(find.byType(TextField), 'Apéro');
    await tester.pump();
    await tester.pageBack();
    await tester.pumpAndSettle();
    expect(find.text('Änderungen verwerfen?'), findsOneWidget);
  });

  testWidgets('Radiosender: Adresse wird geprueft, Anlegen und Entfernen', (tester) async {
    final z = await zeigen(tester);
    await tester.tap(find.text('Radiosender'));
    await tester.pumpAndSettle();
    expect(find.text('Radio SRF 3'), findsOneWidget);

    await tester.tap(find.text('Sender'));
    await tester.pumpAndSettle();
    await tester.enterText(find.widgetWithText(TextFormField, 'Name'), 'Radio 32');
    await tester.enterText(
      find.widgetWithText(TextFormField, 'Stream-Adresse (https://…)'),
      'file:///etc/passwd',
    );
    await tester.tap(find.text('Hinzufügen'));
    await tester.pump();
    expect(find.text('Die Adresse muss mit http:// oder https:// beginnen.'), findsOneWidget);
    await tester.enterText(
      find.widgetWithText(TextFormField, 'Stream-Adresse (https://…)'),
      'https://radio32.ch/stream.mp3',
    );
    await tester.tap(find.text('Hinzufügen'));
    await tester.pumpAndSettle();
    expect(z.senderNeu.single, ('Radio 32', 'https://radio32.ch/stream.mp3'));

    await tester.tap(find.byTooltip('Entfernen'));
    await tester.pumpAndSettle();
    await tester.tap(find.widgetWithText(FilledButton, 'Entfernen'));
    await tester.pumpAndSettle();
    expect(z.geloescht, ['sender:s1']);
  });

  test('ApiFehler ist erreichbar (fuer fehlerText)', () {
    expect(const ApiFehler('x').meldung, 'x');
  });

  testWidgets('Vorhoeren: streamt, haelt an, anderer Titel loest ab, Fehler wird gemeldet', (
    tester,
  ) async {
    final z = await zeigen(tester);
    await tester.tap(find.text('Chilbi Abend'));
    await tester.pumpAndSettle();

    // Nur der vorhandene Titel hat einen Vorhoer-Knopf.
    expect(find.byTooltip('Vorhören'), findsOneWidget);
    await tester.tap(find.byTooltip('Vorhören'));
    await tester.pumpAndSettle();
    expect(z.freigaben.single, ['Queen/Bohemian Rhapsody.mp3']);
    expect(
      wiedergabe.geladen.single.adresse.toString(),
      'https://api.test/kiosk/hoeren?pfad=Queen/Bohemian%20Rhapsody.mp3&t=x',
    );
    expect(wiedergabe.geladen.single.titel, 'Bohemian Rhapsody');
    expect(wiedergabe.geladen.single.interpret, 'Queen');
    expect(find.byTooltip('Anhalten'), findsOneWidget);
    // Mini-Player unten zeigt, was laeuft.
    expect(
      find.descendant(
        of: find.byKey(const Key('mini-player')),
        matching: find.text('Bohemian Rhapsody'),
      ),
      findsOneWidget,
    );

    await tester.tap(find.byTooltip('Anhalten'));
    await tester.pumpAndSettle();
    expect(wiedergabe.aufrufe.last, 'pause');
    expect(find.byTooltip('Vorhören'), findsOneWidget);

    // Nochmals: spielt weiter, statt neu zu laden.
    await tester.tap(find.byTooltip('Vorhören'));
    await tester.pumpAndSettle();
    expect(z.freigaben, hasLength(1));
    expect(wiedergabe.aufrufe.last, 'spielen');

    // Zu Ende gespielt: Knopf springt zurueck.
    wiedergabe.ende();
    await tester.pumpAndSettle();
    expect(find.byTooltip('Anhalten'), findsNothing);

    // In der Suche: anderer Titel loest den laufenden ab.
    await tester.tap(find.text('Titel suchen'));
    await tester.pumpAndSettle();
    await tester.tap(find.byTooltip('Vorhören').last);
    await tester.pumpAndSettle();
    expect(z.freigaben.last, ['Baschi/Gib mer e Chance.mp3']);
    expect(find.byTooltip('Anhalten'), findsOneWidget);

    z.freigabeKaputt = true;
    await tester.tap(find.byTooltip('Vorhören').first);
    await tester.pumpAndSettle();
    expect(find.text('Freigabe nicht moeglich'), findsOneWidget);
  });

  testWidgets('Ganze Playlist abspielen: Warteschlange, weiter, kaputter Titel, Player', (
    tester,
  ) async {
    final z = await zeigen(tester);
    await tester.tap(find.byTooltip('Abspielen'));
    await tester.pumpAndSettle();

    // Nur der vorhandene Titel kommt in die Warteschlange.
    expect(z.freigaben.single, ['Queen/Bohemian Rhapsody.mp3']);
    expect(wiedergabe.aufrufe, ['laden 1 ab 0', 'zufall false', 'spielen']);
    final mini = find.byKey(const Key('mini-player'));
    expect(find.descendant(of: mini, matching: find.text('Queen · Chilbi Abend')), findsOneWidget);

    // Im Editor: alle abspielen, inklusive neu gesuchtem Titel.
    await tester.tap(find.text('Chilbi Abend'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Titel suchen'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Baschi – Gib mer e Chance'));
    await tester.pump();
    await tester.tap(find.text('Übernehmen (1)'));
    await tester.pumpAndSettle();
    await tester.tap(find.byTooltip('Alle abspielen'));
    await tester.pumpAndSettle();
    expect(z.freigaben.last, ['Queen/Bohemian Rhapsody.mp3', 'Baschi/Gib mer e Chance.mp3']);

    // Fehler: zweimal an derselben Stelle neu laden, jedes Mal an den
    // Server melden ...
    for (var v = 1; v <= 2; v++) {
      wiedergabe.kaputt(0);
      await tester.pump(const Duration(seconds: 1));
      await tester.pumpAndSettle();
      expect(wiedergabe.aufrufe.last, 'nochmals 0');
      expect(find.text('„Bohemian Rhapsody“ lässt sich nicht abspielen'), findsNothing);
    }
    // ... erst beim dritten Mal ueberspringen.
    wiedergabe.kaputt(0);
    await tester.pumpAndSettle();
    expect(find.text('„Bohemian Rhapsody“ lässt sich nicht abspielen'), findsOneWidget);
    expect(wiedergabe.aufrufe.reversed.take(2), ['spielen', 'weiter']);
    expect(z.gemeldet, [
      for (var v = 1; v <= 3; v++)
        (
          'Queen/Bohemian Rhapsody.mp3',
          'Chilbi Abend',
          'Source error: UnrecognizedInputFormatException',
          v,
        ),
    ]);

    // Grosser Player: der letzte Titel laeuft, danach kommt nichts.
    await tester.tap(find.byKey(const Key('mini-player')));
    await tester.pumpAndSettle();
    expect(find.text('2 von 2'), findsOneWidget);
    expect(find.text('Danach ist Schluss.'), findsOneWidget);

    // Zurueck: "Als Nächstes" zeigt den Titel danach, antippen springt hin.
    await tester.tap(find.byTooltip('Zurück'));
    await tester.pumpAndSettle();
    expect(find.text('1 von 2'), findsOneWidget);
    await tester.tap(find.text('Gib mer e Chance'));
    await tester.pumpAndSettle();
    expect(wiedergabe.aufrufe.reversed.take(2), ['spielen', 'springeZu 1']);

    // Zufall: die Liste folgt der Abspielreihenfolge, nicht der geladenen.
    await tester.tap(find.byTooltip('Zufall ein'));
    await tester.pumpAndSettle();
    expect(wiedergabe.aufrufe.last, 'zufall true');
    expect(find.text('2 von 2 · zufällig'), findsOneWidget);
    expect(find.text('Bohemian Rhapsody'), findsOneWidget);

    // Beenden: Mini-Player verschwindet.
    await tester.tap(find.byTooltip('Beenden'));
    await tester.pumpAndSettle();
    expect(wiedergabe.aufrufe.last, 'stoppen');
    expect(find.byKey(const Key('mini-player')), findsNothing);
  });

  testWidgets('Alle Titel: ganze Sammlung zufaellig auf dem Handy', (tester) async {
    final z = await zeigen(tester);
    expect(find.text('Alle Titel'), findsOneWidget);
    await tester.tap(find.byTooltip('Alle Titel abspielen'));
    await tester.pumpAndSettle();
    expect(z.freigaben.single, hasLength(1153));
    expect(wiedergabe.geladen, hasLength(1153));
    expect(wiedergabe.aufrufe.skip(1), ['zufall true', 'spielen']);
    final mini = find.byKey(const Key('mini-player'));
    expect(find.descendant(of: mini, matching: find.textContaining('Alle Titel')), findsOneWidget);
  });

  testWidgets('Radiosender auf dem Handy hoeren', (tester) async {
    await zeigen(tester);
    await tester.tap(find.text('Radiosender'));
    await tester.pumpAndSettle();
    await tester.tap(find.byTooltip('Auf dem Handy hören'));
    await tester.pumpAndSettle();
    expect(
      wiedergabe.geladen.single.adresse.toString(),
      'https://stream.srg-ssr.ch/srf3/mp3_128.m3u',
    );
    expect(find.byTooltip('Anhalten'), findsOneWidget);
    await tester.tap(find.byTooltip('Anhalten'));
    await tester.pumpAndSettle();
    expect(wiedergabe.aufrufe.last, 'pause');
  });

  test('Laptop-Zustand liest die Vertragsdatei von api-members', () {
    final z = LaptopZustand.ausJson(kioskMusikVertrag()['zustand']);
    expect(z.musik.erreichbar, isTrue);
    expect(z.musik.titel, 'Louenesee');
    expect(z.musik.interpret, 'Span');
    expect(z.musik.position, const Duration(milliseconds: 61300));
    expect(z.musik.dauer, const Duration(seconds: 255));
    expect(z.musik.lautstaerke, 60);
    expect(z.musik.naechste, ['Baschi — Gib mer e chance']);
    expect(z.playlists, ['Alle Titel', 'Chilbi Abend']);
    expect(z.sender.single.url, 'https://stream.srg-ssr.ch/m/drs3/mp3_128');
    expect(LaptopMusik.ausJson({'erreichbar': false}).erreichbar, isFalse);
    expect(LaptopMusik.ausJson({'erreichbar': true, 'lautstaerke': -1}).lautstaerke, isNull);
  });

  testWidgets('Ohne Berechtigung kein Reiter Im Schopf', (tester) async {
    await zeigen(tester);
    expect(find.text('Im Schopf'), findsNothing);
  });

  testWidgets('Im Schopf: nur mit Berechtigung, steuern, Playlist erst nach Rueckfrage', (
    tester,
  ) async {
    final z = await zeigen(tester, laptop: true);
    await tester.tap(find.text('Im Schopf'));
    await tester.pumpAndSettle();
    expect(find.text('Läuft im Schopf'), findsOneWidget);
    expect(find.text('Louenesee'), findsOneWidget);
    expect(find.text('1:01'), findsOneWidget);

    await tester.tap(find.byTooltip('Pause im Schopf'));
    await tester.pump();
    await tester.tap(find.byTooltip('Nächster Titel im Schopf'));
    await tester.pump();
    expect(z.laptopBefehle.map((b) => b.$1), ['umschalten', 'weiter']);

    await tester.scrollUntilVisible(
      find.text('Chilbi Abend'),
      200,
      scrollable: find.byType(Scrollable).last,
    );
    await tester.tap(find.text('Chilbi Abend'));
    await tester.pump(const Duration(milliseconds: 500));
    expect(find.text('„Chilbi Abend“ im Schopf spielen?'), findsOneWidget);
    await tester.tap(find.widgetWithText(FilledButton, 'Abspielen'));
    await tester.pump(const Duration(milliseconds: 500));
    expect(z.laptopBefehle.last.$1, 'playlist');
    expect(z.laptopBefehle.last.$2, {'name': 'Chilbi Abend'});

    z.laptopWeg = true;
    await tester.pump(const Duration(seconds: 3));
    expect(find.text('Der Laptop im Roten Schopf antwortet nicht'), findsOneWidget);
    // Abbauen, damit der Takt stehen bleibt.
    await tester.pumpWidget(const SizedBox());
  });
}
