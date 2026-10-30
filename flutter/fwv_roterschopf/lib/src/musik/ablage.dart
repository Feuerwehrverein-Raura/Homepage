// Musik auf dem Computer speichern: ganze Playlists oder alle Titel eines
// Interpreten, damit sie auch ohne Netz spielen (Desktop-App FWV Musik).
//
// Geladen wird ueber dieselbe Hoer-Freigabe wie beim Streamen
// (GET /kiosk/hoeren?pfad=...&t=...) - nur eben die ganze Datei. Ein Titel,
// der in mehreren Sammlungen steckt, liegt nur einmal auf der Platte; das
// Verzeichnis ablage.json haelt fest, welche Datei zu welchem Pfad gehoert
// und was gespeichert ist. Faellt ein Titel aus allen Sammlungen, wird
// seine Datei geloescht.
//
// Die Mitglieder-App nutzt die Ablage nicht (MusikScreen ohne [MusikAblage]).

import 'dart:async';
import 'dart:convert';
import 'dart:io';

import 'package:fwv_core/fwv_core.dart' show ApiFehler;
import 'package:http/http.dart' as http;
import 'package:material_ui/material_ui.dart';

import 'modelle.dart';
import 'zugang.dart';

/// Eine gespeicherte Playlist oder ein gespeicherter Interpret.
class GespeicherteSammlung {
  const GespeicherteSammlung({
    required this.id,
    required this.name,
    required this.titel,
    required this.interpret,
  });

  factory GespeicherteSammlung.ausJson(Map<String, dynamic> j) => GespeicherteSammlung(
    id: '${j['id']}',
    name: '${j['name']}',
    interpret: j['art'] == 'interpret',
    titel: [
      for (final t in (j['titel'] as List? ?? const []))
        if (t is Map) MusikTitel.ausJson(Map<String, dynamic>.from(t)),
    ],
  );

  /// `playlist:<id>` oder `interpret:<Name>`.
  final String id;
  final String name;

  /// false: eine Playlist.
  final bool interpret;

  /// Nur Titel, die der Laptop hat - die anderen lassen sich nicht laden.
  final List<MusikTitel> titel;

  Map<String, Object?> zuJson() => {
    'id': id,
    'name': name,
    'art': interpret ? 'interpret' : 'playlist',
    'titel': [for (final t in titel) t.zuJson()],
  };

  static String playlistId(String id) => 'playlist:$id';
  static String interpretId(String name) => 'interpret:$name';

  /// Die ganze Sammlung ("Alle Titel").
  static const alleId = 'alle';

  bool get alle => id == alleId;
}

class MusikAblage extends ChangeNotifier {
  MusikAblage({required this.ordner, required this.zugang, http.Client? client})
    : _http = client ?? http.Client();

  /// Wo die Dateien liegen (in der App: Application Support/Musik). Erst
  /// beim [laden] gebraucht.
  final Future<Directory> Function() ordner;
  final MusikZugang zugang;
  final http.Client _http;

  Directory? _ort;
  final _sammlungen = <GespeicherteSammlung>[];

  /// Pfad des Titels -> (Dateiname, Bytes).
  final _dateien = <String, (String, int)>{};
  int _naechste = 1;
  Future<void>? _laden;

  // Laufendes Herunterladen
  bool _laeuft = false;
  String? _holt;
  String? _inArbeit; // Dateiname des Titels, der gerade geladen wird
  final _gescheitert = <String>{};
  String? _fehler;

  List<GespeicherteSammlung> get sammlungen => List.unmodifiable(_sammlungen);
  bool get laedtHerunter => _laeuft;

  /// Pfad des Titels, der gerade geladen wird.
  String? get holt => _holt;

  /// Letzter Grund, warum das Laden abbrach (meist: kein Netz).
  String? get fehler => _fehler;

  /// Belegter Platz auf der Platte, in Bytes.
  int get belegt => _dateien.values.fold(0, (s, d) => s + d.$2);
  int get anzahlTitel => _dateien.length;

  GespeicherteSammlung? sammlung(String id) {
    for (final s in _sammlungen) {
      if (s.id == id) return s;
    }
    return null;
  }

  /// Die Datei des Titels, wenn er gespeichert ist.
  File? datei(String pfad) {
    final d = _dateien[pfad];
    final ort = _ort;
    if (d == null || ort == null) return null;
    final f = File('${ort.path}${Platform.pathSeparator}${d.$1}');
    return f.existsSync() ? f : null;
  }

  /// Wie viele Titel der Sammlung schon da sind.
  int vorhanden(GespeicherteSammlung s) =>
      s.titel.where((t) => _dateien.containsKey(t.pfad)).length;

  /// Verzeichnis lesen. Mehrfach aufrufbar; laedt nur einmal.
  Future<void> laden() => _laden ??= _lesen();

  Future<void> _lesen() async {
    final ort = await ordner();
    await ort.create(recursive: true);
    _ort = ort;
    final f = _verzeichnis(ort);
    if (await f.exists()) {
      try {
        final j = jsonDecode(await f.readAsString()) as Map<String, dynamic>;
        _naechste = (j['naechste'] as num?)?.toInt() ?? 1;
        for (final MapEntry(:key, :value) in (j['dateien'] as Map? ?? const {}).entries) {
          if (value is Map) {
            _dateien['$key'] = ('${value['datei']}', (value['groesse'] as num?)?.toInt() ?? 0);
          }
        }
        for (final s in (j['sammlungen'] as List? ?? const [])) {
          if (s is Map) _sammlungen.add(GespeicherteSammlung.ausJson(Map<String, dynamic>.from(s)));
        }
      } on FormatException {
        // Kaputtes Verzeichnis: neu anfangen, die Dateien raeumt _aufraeumen weg.
      }
    }
    // Was nicht mehr auf der Platte liegt, ist nicht gespeichert.
    _dateien.removeWhere(
      (_, d) => !File('${ort.path}${Platform.pathSeparator}${d.$1}').existsSync(),
    );
    notifyListeners();
  }

  File _verzeichnis(Directory ort) => File('${ort.path}${Platform.pathSeparator}ablage.json');

  Future<void> _schreiben() async {
    final ort = _ort!;
    final f = _verzeichnis(ort);
    final neu = File('${f.path}.neu');
    await neu.writeAsString(
      jsonEncode({
        'naechste': _naechste,
        'dateien': {
          for (final MapEntry(:key, :value) in _dateien.entries)
            key: {'datei': value.$1, 'groesse': value.$2},
        },
        'sammlungen': [for (final s in _sammlungen) s.zuJson()],
      }),
    );
    // Umbenennen statt ueberschreiben: Stuerzt die App ab, bleibt das alte
    // Verzeichnis ganz.
    await neu.rename(f.path);
  }

  /// Playlist holen und speichern (oder auf Stand bringen).
  Future<void> playlistSpeichern(String id) async {
    await laden();
    final p = await zugang.playlist(id);
    await _merken(
      GespeicherteSammlung(
        id: GespeicherteSammlung.playlistId(p.id),
        name: p.name,
        interpret: false,
        titel: [
          for (final t in p.titel)
            if (t.vorhanden) t,
        ],
      ),
    );
  }

  /// Alle [titel] des Interpreten [name] speichern.
  Future<void> interpretSpeichern(String name, List<MusikTitel> titel) async {
    await laden();
    await _merken(
      GespeicherteSammlung(
        id: GespeicherteSammlung.interpretId(name),
        name: name,
        interpret: true,
        titel: [
          for (final t in titel)
            if (t.vorhanden) t,
        ],
      ),
    );
  }

  /// Die ganze Sammlung speichern - zuletzt geladen, nach Playlists und
  /// Interpreten.
  Future<void> allesSpeichern() async {
    await laden();
    await _merken(
      GespeicherteSammlung(
        id: GespeicherteSammlung.alleId,
        name: 'Alle Titel',
        interpret: false,
        titel: [
          for (final t in await zugang.alleTitel())
            if (t.vorhanden) t,
        ],
      ),
    );
  }

  Future<void> _merken(GespeicherteSammlung s) async {
    final i = _sammlungen.indexWhere((x) => x.id == s.id);
    if (i < 0) {
      _sammlungen.add(s);
    } else {
      _sammlungen[i] = s;
    }
    _sammlungen.sort((a, b) => a.name.toLowerCase().compareTo(b.name.toLowerCase()));
    await _aufraeumen();
    _gescheitert.clear();
    unawaited(_herunterladen());
  }

  /// Sammlung vom Computer nehmen; Titel, die sonst niemand braucht, werden
  /// geloescht.
  Future<void> entfernen(String id) async {
    await laden();
    _sammlungen.removeWhere((s) => s.id == id);
    await _aufraeumen();
  }

  /// Alles vom Computer loeschen (beim Abmelden).
  Future<void> leeren() async {
    await laden();
    _sammlungen.clear();
    await _aufraeumen();
  }

  /// Gespeicherte Sammlungen mit dem Server abgleichen: neue Titel laden,
  /// entfernte loeschen. Ohne Netz bleibt alles, wie es ist.
  Future<void> aktualisieren() async {
    await laden();
    List<MusikTitel>? alle;
    for (final s in List.of(_sammlungen)) {
      try {
        if (s.alle) {
          alle ??= await zugang.alleTitel();
          final neu = [
            for (final t in alle)
              if (t.vorhanden) t,
          ];
          if (neu.isNotEmpty) {
            _sammlungen[_sammlungen.indexOf(s)] = GespeicherteSammlung(
              id: s.id,
              name: s.name,
              interpret: false,
              titel: neu,
            );
          }
        } else if (s.interpret) {
          alle ??= await zugang.alleTitel();
          final neu = [
            for (final t in alle)
              if (t.interpret == s.name && t.vorhanden) t,
          ];
          if (neu.isNotEmpty) {
            _sammlungen[_sammlungen.indexOf(s)] = GespeicherteSammlung(
              id: s.id,
              name: s.name,
              interpret: true,
              titel: neu,
            );
          }
        } else {
          final p = await zugang.playlist(s.id.substring('playlist:'.length));
          _sammlungen[_sammlungen.indexOf(s)] = GespeicherteSammlung(
            id: s.id,
            name: p.name,
            interpret: false,
            titel: [
              for (final t in p.titel)
                if (t.vorhanden) t,
            ],
          );
        }
      } on ApiFehler catch (e) {
        // Auf dem Server geloescht: die gespeicherte Fassung bleibt, bis man
        // sie selbst entfernt.
        if (e.status != 404) rethrow;
      }
    }
    await _aufraeumen();
    _gescheitert.clear();
    await _herunterladen();
  }

  /// Dateien loeschen, die keine Sammlung mehr braucht; Verzeichnis
  /// schreiben.
  Future<void> _aufraeumen() async {
    final ort = _ort!;
    final gebraucht = {
      for (final s in _sammlungen)
        for (final t in s.titel) t.pfad,
    };
    final weg = [
      for (final p in _dateien.keys)
        if (!gebraucht.contains(p)) p,
    ];
    for (final p in weg) {
      final f = File('${ort.path}${Platform.pathSeparator}${_dateien.remove(p)!.$1}');
      if (await f.exists()) await f.delete();
    }
    // Liegengebliebenes (abgebrochene Downloads, kaputtes Verzeichnis).
    final bekannt = {for (final d in _dateien.values) d.$1, 'ablage.json'};
    await for (final e in ort.list()) {
      final name = e.uri.pathSegments.last;
      if (e is File &&
          !bekannt.contains(name) &&
          (_inArbeit == null || !name.startsWith(_inArbeit!))) {
        await e.delete();
      }
    }
    await _schreiben();
    notifyListeners();
  }

  /// Fehlende Titel der Reihe nach laden. Bricht bei einem Netzfehler ab;
  /// ein einzelner kaputter Titel wird uebersprungen.
  Future<void> _herunterladen() async {
    if (_laeuft) return;
    _laeuft = true;
    _fehler = null;
    notifyListeners();
    try {
      while (true) {
        final pfad = _naechsterFehlender();
        if (pfad == null) break;
        _holt = pfad;
        notifyListeners();
        try {
          await _einenLaden(pfad);
        } on _TitelFehlt catch (e) {
          // Nur dieser Titel: weiter mit dem naechsten.
          _gescheitert.add(pfad);
          _fehler = e.meldung;
        } on ApiFehler catch (e) {
          _fehler = e.meldung;
          break;
        } on Object catch (_) {
          // Abgerissene Verbindung, Platte voll ...
          _fehler = 'Das Laden wurde unterbrochen.';
          break;
        }
      }
    } finally {
      _laeuft = false;
      _holt = null;
      _inArbeit = null;
      notifyListeners();
    }
  }

  String? _naechsterFehlender() {
    // Die ganze Sammlung zuletzt: Playlists und Interpreten sind schneller da.
    for (final s in [..._sammlungen.where((s) => !s.alle), ..._sammlungen.where((s) => s.alle)]) {
      for (final t in s.titel) {
        if (!_dateien.containsKey(t.pfad) && !_gescheitert.contains(t.pfad)) return t.pfad;
      }
    }
    return null;
  }

  Future<void> _einenLaden(String pfad) async {
    final ort = _ort!;
    final adresse = (await zugang.hoerAdressen([pfad])).single;
    final antwort = await _http.send(http.Request('GET', adresse));
    if (antwort.statusCode != 200) {
      await antwort.stream.drain<void>();
      throw _TitelFehlt('„${pfad.split('/').last}“ liess sich nicht laden.');
    }
    final punkt = pfad.lastIndexOf('.');
    final endung = punkt > pfad.lastIndexOf('/') ? pfad.substring(punkt).toLowerCase() : '.mp3';
    final name = '${_naechste++}$endung';
    _inArbeit = name;
    final teil = File('${ort.path}${Platform.pathSeparator}$name.teil');
    final aus = teil.openWrite();
    try {
      await antwort.stream.pipe(aus);
    } on Object {
      if (await teil.exists()) await teil.delete();
      rethrow;
    }
    final fertig = await teil.rename('${ort.path}${Platform.pathSeparator}$name');
    // Waehrenddessen entfernt? Dann nicht behalten.
    if (!_sammlungen.any((s) => s.titel.any((t) => t.pfad == pfad))) {
      await fertig.delete();
      return;
    }
    _dateien[pfad] = (name, await fertig.length());
    await _schreiben();
  }

  @override
  void dispose() {
    _http.close();
    super.dispose();
  }
}

class _TitelFehlt implements Exception {
  const _TitelFehlt(this.meldung);

  final String meldung;
}

/// "1,2 GB", "350 MB".
String groesseText(int bytes) {
  if (bytes >= 1000 * 1000 * 1000) {
    return '${(bytes / 1e9).toStringAsFixed(1).replaceAll('.', ',')} GB';
  }
  return '${(bytes / 1e6).round()} MB';
}
