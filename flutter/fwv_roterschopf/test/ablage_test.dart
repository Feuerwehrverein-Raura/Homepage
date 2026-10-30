// Musik auf dem Computer speichern: Ablage in einem Temp-Ordner, Server
// nachgebaut (Zugang und Datei-Download ueber MockClient).

import 'dart:async';
import 'dart:io';

import 'package:flutter_test/flutter_test.dart';
import 'package:fwv_core/fwv_core.dart';
import 'package:fwv_roterschopf/fwv_roterschopf.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';

const _queen = MusikTitel(
  pfad: 'Queen/Bohemian Rhapsody.mp3',
  interpret: 'Queen',
  titel: 'Bohemian Rhapsody',
);
const _queen2 = MusikTitel(pfad: 'Queen/Radio Ga Ga.mp3', interpret: 'Queen', titel: 'Radio Ga Ga');
const _span = MusikTitel(pfad: 'Span/Louenesee.flac', interpret: 'Span', titel: 'Louenesee');

class _Zugang extends MusikZugang {
  var playlistTitel = [_queen, _span, const MusikTitel(pfad: 'Weg/x.mp3', vorhanden: false)];
  var alle = [_queen, _queen2, _span];
  bool offline = false;
  final freigaben = <List<String>>[];

  ApiFehler? get _netz => offline ? const ApiFehler.keineVerbindung() : null;

  @override
  Future<Playlist> playlist(String id) async {
    if (_netz case final f?) throw f;
    return Playlist(id: id, name: 'Chilbi Abend', titel: playlistTitel);
  }

  @override
  Future<List<MusikTitel>> alleTitel() async {
    if (_netz case final f?) throw f;
    return alle;
  }

  @override
  Future<List<Uri>> hoerAdressen(List<String> pfade) async {
    if (_netz case final f?) throw f;
    freigaben.add(pfade);
    return [
      for (final p in pfade) Uri.https('api.test', '/kiosk/hoeren', {'pfad': p, 't': 'x'}),
    ];
  }

  @override
  Future<void> fehlerMelden({
    String? pfad,
    String? quelle,
    String? code,
    String? meldung,
    int versuch = 1,
    Duration position = Duration.zero,
  }) async {}

  @override
  dynamic noSuchMethod(Invocation invocation) => throw UnimplementedError();
}

class _Wiedergabe implements Wiedergabe {
  List<WiedergabeEintrag> geladen = const [];
  final _stand = StreamController<WiedergabeStand>.broadcast();

  @override
  Future<void> laden(List<WiedergabeEintrag> liste, {int ab = 0}) async => geladen = liste;
  @override
  Future<void> spielen() async {}
  @override
  Future<void> zufall(bool an) async {}
  @override
  List<int> get reihenfolge => List.generate(geladen.length, (i) => i);
  @override
  Stream<WiedergabeStand> get stand => _stand.stream;
  @override
  Stream<Duration> get position => const Stream.empty();
  @override
  Stream<Duration?> get dauer => const Stream.empty();
  @override
  Stream<WiedergabeFehler> get fehler => const Stream.empty();
  @override
  Stream<String?> get liveTitel => const Stream.empty();
  @override
  dynamic noSuchMethod(Invocation invocation) => Future<void>.value();
}

void main() {
  late Directory ordner;
  late _Zugang zugang;
  late List<String> geholt;
  late Set<String> kaputt;
  Completer<void>? sperre; // haelt den naechsten Download an

  MusikAblage neueAblage() => MusikAblage(
    ordner: () async => ordner,
    zugang: zugang,
    client: MockClient((r) async {
      final pfad = r.url.queryParameters['pfad']!;
      geholt.add(pfad);
      if (sperre case final s?) await s.future;
      if (kaputt.contains(pfad)) return http.Response('weg', 404);
      return http.Response('ton:$pfad', 200);
    }),
  );

  Future<void> fertig(MusikAblage a) async {
    while (a.laedtHerunter) {
      await Future<void>.delayed(const Duration(milliseconds: 5));
    }
  }

  setUp(() async {
    ordner = await Directory.systemTemp.createTemp('fwv-ablage-');
    zugang = _Zugang();
    geholt = [];
    kaputt = {};
    sperre = null;
  });

  tearDown(() => ordner.delete(recursive: true));

  test('Playlist speichern: laedt die vorhandenen Titel, uebersteht einen Neustart', () async {
    final a = neueAblage();
    await a.playlistSpeichern('p1');
    await fertig(a);

    final s = a.sammlung(GespeicherteSammlung.playlistId('p1'))!;
    expect(s.name, 'Chilbi Abend');
    expect(s.titel.map((t) => t.pfad), [_queen.pfad, _span.pfad]);
    expect(a.vorhanden(s), 2);
    expect(geholt, [_queen.pfad, _span.pfad]);
    expect(await a.datei(_span.pfad)!.readAsString(), 'ton:${_span.pfad}');
    expect(a.datei(_span.pfad)!.path, endsWith('.flac'));
    expect(a.belegt, greaterThan(0));

    final nochmals = neueAblage();
    await nochmals.laden();
    expect(nochmals.sammlungen.single.name, 'Chilbi Abend');
    expect(nochmals.datei(_queen.pfad), isNotNull);
  });

  test(
    'Interpret speichern; gemeinsamer Titel liegt einmal da und bleibt beim Entfernen',
    () async {
      final a = neueAblage();
      await a.playlistSpeichern('p1');
      await fertig(a);
      await a.interpretSpeichern('Queen', [_queen, _queen2]);
      await fertig(a);
      expect(geholt.where((p) => p == _queen.pfad), hasLength(1));
      expect(a.anzahlTitel, 3);

      await a.entfernen(GespeicherteSammlung.playlistId('p1'));
      expect(a.datei(_queen.pfad), isNotNull);
      expect(a.datei(_span.pfad), isNull);
      expect(a.anzahlTitel, 2);
      // Nur noch Verzeichnis und die zwei Queen-Titel.
      expect(ordner.listSync(), hasLength(3));

      await a.leeren();
      expect(a.sammlungen, isEmpty);
      expect(ordner.listSync().map((e) => e.uri.pathSegments.last), ['ablage.json']);
    },
  );

  test('Kaputter Titel wird uebersprungen; ohne Netz bricht das Laden ab', () async {
    kaputt.add(_queen.pfad);
    final a = neueAblage();
    await a.playlistSpeichern('p1');
    await fertig(a);
    final s = a.sammlungen.single;
    expect(a.vorhanden(s), 1);
    expect(a.fehler, contains('Bohemian Rhapsody'));

    kaputt.clear();
    zugang.offline = true;
    await expectLater(a.aktualisieren(), throwsA(isA<ApiFehler>()));
    expect(a.vorhanden(s), 1);

    zugang.offline = false;
    await a.aktualisieren();
    await fertig(a);
    expect(a.vorhanden(a.sammlungen.single), 2);
  });

  test('Aktualisieren: neue Titel kommen dazu, entfernte verschwinden', () async {
    final a = neueAblage();
    await a.playlistSpeichern('p1');
    await a.interpretSpeichern('Queen', [_queen]);
    await fertig(a);

    zugang.playlistTitel = [_span];
    zugang.alle = [_queen, _queen2, _span];
    await a.aktualisieren();
    await fertig(a);
    expect(a.sammlung(GespeicherteSammlung.interpretId('Queen'))!.titel, hasLength(2));
    expect(a.datei(_queen2.pfad), isNotNull);
    // Queen 1 steckt noch im Interpreten, bleibt also.
    expect(a.datei(_queen.pfad), isNotNull);
  });

  test('Alles speichern: ganze Sammlung zuletzt geladen, beim Abgleich neue Titel dazu', () async {
    final a = neueAblage();
    // Der erste Titel haengt, bis auch der Interpret eingetragen ist.
    sperre = Completer<void>();
    await a.allesSpeichern();
    await a.interpretSpeichern('Span', [_span]);
    sperre!.complete();
    sperre = null;
    await fertig(a);
    expect(a.sammlung(GespeicherteSammlung.alleId)!.titel, hasLength(3));
    expect(a.anzahlTitel, 3);
    // Der erste Titel lief schon; danach kam der Interpret vor dem Rest.
    expect(geholt, [_queen.pfad, _span.pfad, _queen2.pfad]);

    const neu = MusikTitel(pfad: 'Baschi/Gib mer e Chance.mp3', interpret: 'Baschi');
    zugang.alle = [...zugang.alle, neu];
    await a.aktualisieren();
    await fertig(a);
    expect(a.datei(neu.pfad), isNotNull);
  });

  test('Player: Gespeichertes von der Platte, ohne Netz nur Gespeichertes', () async {
    final a = neueAblage();
    await a.interpretSpeichern('Span', [_span]);
    await fertig(a);
    final w = _Wiedergabe();
    final player = MusikPlayer(zugang: zugang, ablage: a, wiedergabe: w);

    await player.spieleListe('Mix', [_queen, _span]);
    expect(zugang.freigaben.last, [_queen.pfad]);
    expect(w.geladen.map((e) => e.adresse.scheme), ['https', 'file']);

    zugang.offline = true;
    await player.spieleListe('Mix', [_queen, _span]);
    expect(w.geladen.map((e) => e.id), [_span.pfad]);
    expect(w.geladen.single.adresse, Uri.file(a.datei(_span.pfad)!.path));

    // Nichts gespeichert und kein Netz: der Fehler kommt durch.
    await expectLater(player.spieleListe('Queen', [_queen]), throwsA(isA<ApiFehler>()));
  });
}
