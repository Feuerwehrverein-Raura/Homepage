// Musik im Roten Schopf: Playlists und Radiosender gegen einen
// nachgebauten Zugang. Antworten im Format von api-members (/kiosk/...).

import 'package:flutter_test/flutter_test.dart';
import 'package:fwv_core/fwv_core.dart';
import 'package:fwv_roterschopf/fwv_roterschopf.dart';
import 'package:material_ui/material_ui.dart';

class _Zugang extends MusikZugang {
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

  Future<_Zugang> zeigen(WidgetTester tester) async {
    final z = _Zugang();
    tester.view.physicalSize = const Size(1080, 2400);
    tester.view.devicePixelRatio = 3;
    addTearDown(tester.view.reset);
    await tester.pumpWidget(MaterialApp(home: MusikScreen(zugang: z)));
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
}
