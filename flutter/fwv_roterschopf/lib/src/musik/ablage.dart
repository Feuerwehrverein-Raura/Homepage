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

  /// Kommt so lange kein Byte, gilt die Verbindung als eingeschlafen.
  Duration stillstand = const Duration(seconds: 30);

  /// So oft wird ein Titel nach einem Stillstand neu versucht.
  static const versucheJeTitel = 3;

  /// Pause vor dem neuen Versuch (in Tests null).
  Duration nochmalsNach = const Duration(seconds: 5);

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

  /// Der Titel, der gerade geladen wird (fuer die Anzeige).
  MusikTitel? get holtTitel {
    for (final s in _sammlungen) {
      for (final t in s.titel) {
        if (t.pfad == _holt) return t;
      }
    }
    return null;
  }

  /// Wie weit der aktuelle Titel ist; [holtGesamt] null, wenn der Server
  /// die Groesse nicht mitschickt. Bei langsamer Leitung dauert ein Titel
  /// Minuten - ohne das saehe es aus, als passiere nichts.
  int get holtBytes => _holtBytes;
  int? get holtGesamt => _holtGesamt;
  int _holtBytes = 0;
  int? _holtGesamt;

  /// Titel, die noch fehlen (alle Sammlungen, jeder Titel einmal).
  int get offen => {
    for (final s in _sammlungen)
      for (final t in s.titel)
        if (!_dateien.containsKey(t.pfad)) t.pfad,
  }.length;

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
    _frei = await _freierPlatz();
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
  /// Playlist speichern (oder auf Stand bringen); [p] vom Server geholt.
  Future<void> playlistSpeichern(Playlist p) async {
    await laden();
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
  Future<void> allesSpeichern(List<MusikTitel> alle) async {
    await laden();
    await _merken(
      GespeicherteSammlung(
        id: GespeicherteSammlung.alleId,
        name: 'Alle Titel',
        interpret: false,
        titel: [
          for (final t in alle)
            if (t.vorhanden) t,
        ],
      ),
    );
  }

  /// Was das Speichern von [titel] braucht: nur Titel, die noch nicht da
  /// sind. Bytes und freier Platz null, wenn sie sich nicht bestimmen
  /// lassen (aelteres Backend, kein df).
  Future<Platzbedarf> platzbedarf(List<MusikTitel> titel) async {
    await laden();
    final neu = {
      for (final t in titel)
        if (t.vorhanden && !_dateien.containsKey(t.pfad)) t.pfad,
    }.toList();
    final bytes = neu.isEmpty ? 0 : await zugang.platzbedarf(neu);
    _frei = await _freierPlatz();
    notifyListeners();
    return Platzbedarf(titel: neu.length, bytes: bytes, frei: _frei);
  }

  int? _frei;

  /// Freier Platz auf der Platte der Ablage (zuletzt gemessen), null wenn
  /// unbekannt.
  int? get frei => _frei;

  Future<int?> _freierPlatz() async {
    final ort = _ort;
    if (ort == null) return null;
    try {
      if (Platform.isWindows) {
        final r = await Process.run('powershell', [
          '-NoProfile',
          '-Command',
          "(Get-Item -LiteralPath '${ort.path.replaceAll("'", "''")}').PSDrive.Free",
        ]);
        return int.tryParse('${r.stdout}'.trim());
      }
      // df -P: eine Zeile pro Laufwerk, 4. Spalte = frei in KB.
      final r = await Process.run('df', ['-Pk', ort.path]);
      final zeilen = '${r.stdout}'.trim().split('\n');
      final spalten = zeilen.last.trim().split(RegExp(r'\s+'));
      final kb = spalten.length > 3 ? int.tryParse(spalten[3]) : null;
      return kb == null ? null : kb * 1024;
    } on Object {
      return null;
    }
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
    _frei = await _freierPlatz();
    notifyListeners();
  }

  /// Fehlende Titel der Reihe nach laden. Bricht bei einem Netzfehler ab;
  /// ein einzelner kaputter Titel wird uebersprungen.
  Future<void> _herunterladen() async {
    if (_laeuft) return;
    _laeuft = true;
    _fehler = null;
    notifyListeners();
    var versuch = 0;
    try {
      while (true) {
        final pfad = _naechsterFehlender();
        if (pfad == null) break;
        if (_holt != pfad) versuch = 0;
        _holt = pfad;
        notifyListeners();
        try {
          await _einenLaden(pfad);
        } on TimeoutException catch (_) {
          // Verbindung eingeschlafen (kommt nach einem Netzwechsel vor): mit
          // frischer Verbindung nochmals, nach dem dritten Mal aufhoeren.
          if (++versuch < versucheJeTitel) {
            await Future<void>.delayed(nochmalsNach);
            continue;
          }
          _fehler = 'Die Verbindung steht still – später nochmals abgleichen.';
          break;
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
      _frei = await _freierPlatz();
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
    final antwort = await _http.send(http.Request('GET', adresse)).timeout(stillstand);
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
    _holtBytes = 0;
    _holtGesamt = antwort.contentLength;
    var gemeldet = 0;
    try {
      // Kommt eine Weile nichts mehr, nicht ewig warten.
      await for (final stueck in antwort.stream.timeout(stillstand)) {
        aus.add(stueck);
        _holtBytes += stueck.length;
        if (_holtBytes - gemeldet >= 64 * 1024) {
          gemeldet = _holtBytes;
          notifyListeners();
        }
      }
      await aus.close();
    } on Object {
      await aus.close().catchError((Object _) {});
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

class Platzbedarf {
  const Platzbedarf({required this.titel, this.bytes, this.frei});

  /// Titel, die neu auf den Computer kommen.
  final int titel;
  final int? bytes;
  final int? frei;

  /// Etwas Luft lassen: Ein ganz voller Computer laeuft nicht mehr rund.
  static const reserve = 2 * 1000 * 1000 * 1000;

  /// false nur, wenn sicher zu wenig Platz ist.
  bool get reicht => bytes == null || frei == null || bytes! + reserve <= frei!;
}

class _TitelFehlt implements Exception {
  const _TitelFehlt(this.meldung);

  final String meldung;
}

/// "1,2 GB", "350 MB", "4,2 MB", "800 KB".
String groesseText(int bytes) {
  String komma(double v) => v.toStringAsFixed(1).replaceAll('.', ',');
  if (bytes >= 1e9) return '${komma(bytes / 1e9)} GB';
  if (bytes >= 1e7) return '${(bytes / 1e6).round()} MB';
  if (bytes >= 1e6) return '${komma(bytes / 1e6)} MB';
  return '${(bytes / 1e3).round()} KB';
}
