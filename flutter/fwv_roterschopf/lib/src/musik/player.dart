// Der Musik-Player der App: einzelne Titel vorhoeren, ganze Playlists
// durchhoeren - und notfalls das Handy statt des Laptops an die Anlage
// haengen. Deshalb laeuft er im Hintergrund weiter, mit Bedienung auf dem
// Sperrbildschirm (just_audio_background, eingerichtet in der App).
//
// Die Titel werden gestreamt, nicht erst ganz geladen: Der Player holt sich
// beim Server eine Hoer-Freigabe, die in der Adresse steht
// (GET /kiosk/hoeren?pfad=...&t=...). Sie taugt nur zum Hoeren und laeuft
// nach 12 Stunden ab - das Anmelde-Token verlaesst die App nie.
//
// Es gibt genau EINEN Player in der App; er lebt in den Diensten, damit
// die Musik beim Verlassen des Musik-Bereichs weiterlaeuft.

import 'dart:async';
import 'dart:math';

import 'package:just_audio/just_audio.dart';
import 'package:just_audio_background/just_audio_background.dart';
import 'package:material_ui/material_ui.dart';

import 'modelle.dart';
import 'radio.dart';
import 'zugang.dart';

/// Ein Eintrag der Warteschlange. [id] ist der Pfad des Titels, beim Radio
/// die Adresse des Senders.
class WiedergabeEintrag {
  const WiedergabeEintrag({
    required this.id,
    required this.adresse,
    required this.titel,
    this.interpret,
    this.album,
    this.bild,
  });

  final String id;
  final Uri adresse;
  final String titel;
  final String? interpret;
  final String? album;

  /// Beim Radio das Senderlogo - auch fuer Benachrichtigung und
  /// Sperrbildschirm.
  final Uri? bild;
}

class WiedergabeStand {
  const WiedergabeStand({this.index, this.spielt = false, this.laedt = false, this.fertig = false});

  final int? index;
  final bool spielt;
  final bool laedt;

  /// Die Warteschlange ist durchgespielt.
  final bool fertig;
}

/// Ein Titel spielt nicht: Index in der Warteschlange und was Android
/// meldet (ExoPlayer-Typ und Text).
class WiedergabeFehler {
  const WiedergabeFehler({this.index, this.code, this.meldung});

  final int? index;
  final String? code;
  final String? meldung;
}

/// Was tatsaechlich abspielt - in Tests ersetzt.
abstract class Wiedergabe {
  Future<void> laden(List<WiedergabeEintrag> liste, {int ab = 0});
  Future<void> spielen();
  Future<void> pause();
  Future<void> stoppen();
  Future<void> weiter();
  Future<void> zurueck();
  Future<void> springen(Duration position);
  Future<void> springeZu(int index);
  Future<void> zufall(bool an);

  /// Die Abspielreihenfolge (Indizes der Warteschlange) - bei Zufall nicht
  /// die geladene Reihenfolge.
  List<int> get reihenfolge;

  Stream<WiedergabeStand> get stand;
  Stream<Duration> get position;
  Stream<Duration?> get dauer;

  /// Ein Titel liess sich nicht abspielen.
  Stream<WiedergabeFehler> get fehler;

  /// Beim Radio: was der Sender gerade spielt (ICY "StreamTitle").
  Stream<String?> get liveTitel;

  /// Nach einem Fehler: Titel [index] neu laden, ab [position] weiter.
  Future<void> nochmals(int index, Duration position);
  Future<void> schliessen();
}

class JustAudioWiedergabe implements Wiedergabe {
  JustAudioWiedergabe() {
    void melden() {
      final s = _player.playerState.processingState;
      _stand.add(
        WiedergabeStand(
          index: _player.currentIndex,
          spielt: _player.playing,
          laedt: s == ProcessingState.loading || s == ProcessingState.buffering,
          fertig: s == ProcessingState.completed,
        ),
      );
    }

    _player.playerStateStream.listen((_) => melden());
    _player.currentIndexStream.listen((_) => melden());
    _player.shuffleIndicesStream.listen((_) => melden());
    _player.shuffleModeEnabledStream.listen((_) => melden());
  }

  final _player = AudioPlayer();
  final _stand = StreamController<WiedergabeStand>.broadcast();

  @override
  Future<void> laden(List<WiedergabeEintrag> liste, {int ab = 0}) async {
    await _player.setAudioSources(
      [
        for (final e in liste)
          AudioSource.uri(
            e.adresse,
            // Steht in der Benachrichtigung und auf dem Sperrbildschirm.
            tag: MediaItem(
              id: e.id,
              title: e.titel,
              artist: e.interpret,
              album: e.album,
              artUri: e.bild,
            ),
          ),
      ],
      initialIndex: ab,
      // Nicht vorab: Ein kaputter erster Titel soll nicht das Laden der
      // ganzen Liste scheitern lassen, sondern als Fehler gemeldet werden.
      preload: false,
    );
  }

  // play() kehrt erst beim Anhalten zurueck - nicht darauf warten.
  @override
  Future<void> spielen() async => unawaited(_player.play());

  @override
  Future<void> pause() => _player.pause();

  @override
  Future<void> stoppen() => _player.stop();

  @override
  Future<void> weiter() => _player.seekToNext();

  /// Wie ueberall: nach den ersten Sekunden zurueck an den Anfang, sonst
  /// zum vorigen Titel.
  @override
  Future<void> zurueck() => _player.position > const Duration(seconds: 3) || !_player.hasPrevious
      ? _player.seek(Duration.zero)
      : _player.seekToPrevious();

  @override
  Future<void> springen(Duration position) => _player.seek(position);

  @override
  Future<void> springeZu(int index) => _player.seek(Duration.zero, index: index);

  @override
  Future<void> zufall(bool an) async {
    if (an) await _player.shuffle();
    await _player.setShuffleModeEnabled(an);
  }

  @override
  List<int> get reihenfolge => _player.shuffleModeEnabled
      ? List.of(_player.shuffleIndices)
      : List.generate(_player.sequence.length, (i) => i);

  @override
  Stream<WiedergabeStand> get stand => _stand.stream;

  @override
  Stream<Duration> get position => _player.positionStream;

  @override
  Stream<Duration?> get dauer => _player.durationStream;

  @override
  Stream<String?> get liveTitel => _player.icyMetadataStream.map((m) {
    final t = m?.info?.title?.trim();
    return t == null || t.isEmpty ? null : t;
  });

  @override
  Stream<WiedergabeFehler> get fehler => _player.errorStream.map(
    (e) => WiedergabeFehler(index: e.index, code: '${e.code}', meldung: e.message),
  );

  @override
  Future<void> nochmals(int index, Duration position) async {
    await _player.seek(position, index: index);
    await _player.load();
    unawaited(_player.play());
  }

  @override
  Future<void> schliessen() async {
    await _player.dispose();
    await _stand.close();
  }
}

/// Zustand fuer die Oberflaeche: Warteschlange, was laeuft, Fehler.
class MusikPlayer extends ChangeNotifier {
  MusikPlayer({
    required this.zugang,
    Wiedergabe? wiedergabe,
    Future<Uri> Function(Uri adresse)? senderAdresse,
  }) : _w = wiedergabe ?? JustAudioWiedergabe(),
       _senderAdresse = senderAdresse ?? senderAufloesen {
    _abos = [
      _w.stand.listen((s) {
        _index = s.index ?? _index;
        _spielt = s.spielt && !s.fertig;
        _puffert = s.laedt;
        notifyListeners();
      }),
      _w.position.listen((p) => _stelle = p),
      _w.liveTitel.listen((t) {
        if (t == _liveTitel) return;
        _liveTitel = t;
        notifyListeners();
      }),
      _w.fehler.listen(_beiFehler),
    ];
  }

  static const vorhoerQuelle = 'Vorhören';

  /// So oft wird ein Titel nach einem Fehler neu geladen, bevor der Player
  /// ihn ueberspringt.
  static const versuche = 2;

  /// Wartezeit vor dem Neuladen (in Tests null).
  Duration nochmalsNach = const Duration(seconds: 1);

  Duration _stelle = Duration.zero;
  String? _liveTitel;

  /// Beim Radio: was gerade laeuft, z.B. "Span - Louenesee" (nicht jeder
  /// Sender schickt das mit).
  String? get liveTitel => _radio ? _liveTitel : null;
  final _fehlversuche = <int, int>{};

  Future<void> _beiFehler(WiedergabeFehler f) async {
    final i = f.index ?? _index;
    final e = (i >= 0 && i < _liste.length) ? _liste[i] : null;
    final versuch = (_fehlversuche[i] ?? 0) + 1;
    _fehlversuche[i] = versuch;
    // Der Server sieht den Fehler nicht (er hat mit 200 ausgeliefert) -
    // deshalb melden. Scheitert das Melden, ist das egal.
    unawaited(
      zugang
          .fehlerMelden(
            pfad: _radio ? null : e?.id,
            quelle: _radio ? 'Radio ${e?.titel}' : _quelle,
            code: f.code,
            meldung: f.meldung,
            versuch: versuch,
            position: _stelle,
          )
          .catchError((Object _) {}),
    );
    if (versuch <= versuche && e != null) {
      // Abgerissene Verbindung o.ae.: an derselben Stelle neu laden.
      await Future<void>.delayed(nochmalsNach);
      await _w.nochmals(i, _stelle);
      return;
    }
    _fehler = e == null
        ? 'Titel lässt sich nicht abspielen'
        : '„${e.titel}“ lässt sich nicht abspielen';
    notifyListeners();
    // Ein kaputter Titel haelt eine Playlist nicht an.
    if (naechste(anzahl: 1).isNotEmpty) {
      await _w.weiter();
      await _w.spielen();
    }
  }

  final MusikZugang zugang;
  final Wiedergabe _w;

  /// Radio-Adresse aufloesen (Weiterleitungen, https) - in Tests ersetzt.
  final Future<Uri> Function(Uri adresse) _senderAdresse;
  late final List<StreamSubscription<Object?>> _abos;

  List<WiedergabeEintrag> _liste = const [];
  String? _quelle;
  bool _radio = false;
  int _index = 0;
  bool _spielt = false;
  bool _puffert = false;
  bool _zufall = false;
  String? _holt; // Id, fuer die gerade die Freigabe geholt wird
  String? _fehler;
  int _nr = 0;

  List<WiedergabeEintrag> get liste => _liste;

  /// "Vorhören", der Name der Playlist oder des Senders.
  String? get quelle => _quelle;
  bool get radio => _radio;
  bool get aktiv => _liste.isNotEmpty;
  int get index => _index;
  WiedergabeEintrag? get aktuell => _index >= 0 && _index < _liste.length ? _liste[_index] : null;
  bool get spielt => _spielt;
  bool get zufall => _zufall;

  /// Laedt gerade (Freigabe holen oder Puffern).
  bool get laedt => _holt != null || _puffert;
  String? get fehler => _fehler;

  Stream<Duration> get position => _w.position;
  Stream<Duration?> get dauer => _w.dauer;

  /// Was nach dem aktuellen Titel kommt, in Abspielreihenfolge (Indizes
  /// in [liste]), hoechstens [anzahl].
  List<int> naechste({int anzahl = 100}) {
    final r = _w.reihenfolge;
    final hier = r.indexOf(_index);
    if (hier < 0) return const [];
    return r.skip(hier + 1).take(anzahl).toList();
  }

  /// true, wenn [id] gerade der aktuelle Eintrag ist (oder geholt wird).
  bool istAktuell(String id) => _holt == id || (_holt == null && aktuell?.id == id);

  /// Spielt die vorhandenen [titel] der Reihe nach, ab Nummer [ab] - oder
  /// mit [zufall] durcheinander, wie "Alle Titel" auf dem Laptop.
  Future<void> spieleListe(
    String quelle,
    List<MusikTitel> titel, {
    int ab = 0,
    bool zufall = false,
  }) async {
    final da = [
      for (final (i, t) in titel.indexed)
        if (t.vorhanden) (i, t),
    ];
    if (da.isEmpty) throw const FormatException('Keine abspielbaren Titel.');
    final start = da.indexWhere((e) => e.$1 >= ab);
    final nr = ++_nr;
    _holt = da[start < 0 ? 0 : start].$2.pfad;
    _fehler = null;
    notifyListeners();
    try {
      final adressen = await zugang.hoerAdressen([for (final e in da) e.$2.pfad]);
      if (nr != _nr) return;
      await _starten(
        quelle,
        [
          for (final (i, e) in da.indexed)
            WiedergabeEintrag(
              id: e.$2.pfad,
              adresse: adressen[i],
              titel: e.$2.titel ?? e.$2.anzeige,
              interpret: e.$2.interpret,
              album: quelle,
            ),
        ],
        ab: zufall ? Random().nextInt(da.length) : (start < 0 ? 0 : start),
        radio: false,
        zufall: zufall,
      );
    } finally {
      if (nr == _nr) {
        _holt = null;
        notifyListeners();
      }
    }
  }

  /// Einzelner Titel: abspielen, oder anhalten/weiter, wenn er schon laeuft.
  Future<void> vorhoeren(MusikTitel t) async {
    if (istAktuell(t.pfad) && _holt == null) return umschalten();
    await spieleListe(vorhoerQuelle, [t]);
  }

  Future<void> spieleSender(Radiosender s) async {
    if (istAktuell(s.url) && _holt == null) return umschalten();
    final nr = ++_nr;
    _fehler = null;
    _holt = s.url;
    notifyListeners();
    try {
      final adresse = await _senderAdresse(Uri.parse(s.url));
      if (nr != _nr) return;
      await _starten(
        s.name,
        [
          WiedergabeEintrag(
            id: s.url,
            adresse: adresse,
            titel: s.name,
            album: 'Radio',
            bild: s.logo,
          ),
        ],
        ab: 0,
        radio: true,
        zufall: false,
      );
    } finally {
      if (nr == _nr) {
        _holt = null;
        notifyListeners();
      }
    }
  }

  Future<void> _starten(
    String quelle,
    List<WiedergabeEintrag> liste, {
    required int ab,
    required bool radio,
    required bool zufall,
  }) async {
    _liste = liste;
    _fehlversuche.clear();
    _liveTitel = null;
    _quelle = quelle;
    _radio = radio;
    _index = ab;
    _zufall = zufall;
    notifyListeners();
    await _w.laden(liste, ab: ab);
    await _w.zufall(zufall);
    await _w.spielen();
  }

  Future<void> umschalten() => _spielt ? _w.pause() : _w.spielen();
  Future<void> weiter() => _w.weiter();
  Future<void> zurueck() => _w.zurueck();
  Future<void> springen(Duration p) => _w.springen(p);

  Future<void> springeZu(int index) async {
    await _w.springeZu(index);
    await _w.spielen();
  }

  Future<void> zufallUmschalten() async {
    _zufall = !_zufall;
    notifyListeners();
    await _w.zufall(_zufall);
  }

  /// Anhalten und die Warteschlange leeren (Mini-Player verschwindet).
  Future<void> beenden() async {
    _nr++;
    _liste = const [];
    _quelle = null;
    _holt = null;
    _spielt = false;
    _fehler = null;
    notifyListeners();
    await _w.stoppen();
  }

  @override
  void dispose() {
    for (final a in _abos) {
      a.cancel();
    }
    _w.schliessen();
    super.dispose();
  }
}

/// Knopf neben einem Titel: vorhoeren, anhalten, weiterspielen.
class VorhoerKnopf extends StatelessWidget {
  const VorhoerKnopf({super.key, required this.player, required this.titel, this.beiFehler});

  final MusikPlayer player;
  final MusikTitel titel;
  final void Function(Object fehler)? beiFehler;

  @override
  Widget build(BuildContext context) {
    return ListenableBuilder(
      listenable: player,
      builder: (context, _) {
        final aktuell = player.istAktuell(titel.pfad);
        if (aktuell && player.laedt && !player.spielt) {
          return const Padding(
            padding: EdgeInsets.all(12),
            child: SizedBox.square(
              dimension: 24,
              child: CircularProgressIndicator(strokeWidth: 2.5),
            ),
          );
        }
        final spielt = aktuell && player.spielt;
        return IconButton(
          tooltip: spielt ? 'Anhalten' : 'Vorhören',
          icon: Icon(spielt ? Icons.pause_circle_outline : Icons.play_circle_outline),
          onPressed: () => player.vorhoeren(titel).catchError((Object e) => beiFehler?.call(e)),
        );
      },
    );
  }
}

String zeitText(Duration d) {
  final s = d.inSeconds;
  final h = s ~/ 3600;
  final m = (s % 3600) ~/ 60;
  final r = (s % 60).toString().padLeft(2, '0');
  return h > 0 ? '$h:${m.toString().padLeft(2, '0')}:$r' : '$m:$r';
}

/// Leiste unten im Musik-Bereich: was laeuft, Anhalten/Weiter. Antippen
/// oeffnet den ganzen Player. Unsichtbar, solange nichts geladen ist.
class MiniPlayer extends StatelessWidget {
  const MiniPlayer({super.key, required this.player});

  final MusikPlayer player;

  @override
  Widget build(BuildContext context) {
    return ListenableBuilder(
      listenable: player,
      builder: (context, _) {
        final e = player.aktuell;
        // Leer bleibt der Platz der Systemleiste frei: Mit einer unteren
        // Leiste nimmt das Scaffold dem Inhalt diesen Abstand weg.
        if (!player.aktiv || e == null) {
          return SizedBox(height: MediaQuery.paddingOf(context).bottom);
        }
        final farben = Theme.of(context).colorScheme;
        return Material(
          color: farben.surfaceContainerHigh,
          child: SafeArea(
            top: false,
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                if (!player.radio)
                  StreamBuilder<Duration?>(
                    stream: player.dauer,
                    builder: (context, d) => StreamBuilder<Duration>(
                      stream: player.position,
                      builder: (context, p) {
                        final ms = d.data?.inMilliseconds ?? 0;
                        return LinearProgressIndicator(
                          minHeight: 2,
                          value: ms <= 0 ? 0 : (p.data?.inMilliseconds ?? 0) / ms,
                        );
                      },
                    ),
                  ),
                ListTile(
                  key: const Key('mini-player'),
                  leading: player.radio ? SenderLogo(logo: e.bild) : const Icon(Icons.music_note),
                  title: Text(e.titel, maxLines: 1, overflow: TextOverflow.ellipsis),
                  subtitle: Text(
                    player.fehler ??
                        (player.radio
                            ? (player.liveTitel ?? 'Live-Radio')
                            : [?e.interpret, ?player.quelle].join(' · ')),
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: player.fehler == null ? null : TextStyle(color: farben.error),
                  ),
                  onTap: () => Navigator.of(context)
                      .push(MaterialPageRoute<void>(builder: (_) => PlayerScreen(player: player))),
                  trailing: Row(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      _SpielKnopf(player: player),
                      if (!player.radio && player.liste.length > 1)
                        IconButton(
                          tooltip: 'Nächster Titel',
                          icon: const Icon(Icons.skip_next),
                          onPressed: player.weiter,
                        ),
                      IconButton(
                        tooltip: 'Schliessen',
                        icon: const Icon(Icons.close),
                        onPressed: player.beenden,
                      ),
                    ],
                  ),
                ),
              ],
            ),
          ),
        );
      },
    );
  }
}

class _SpielKnopf extends StatelessWidget {
  const _SpielKnopf({required this.player, this.gross = false});

  final MusikPlayer player;
  final bool gross;

  @override
  Widget build(BuildContext context) {
    if (player.laedt && !player.spielt) {
      return Padding(
        padding: const EdgeInsets.all(12),
        child: SizedBox.square(
          dimension: gross ? 48 : 24,
          child: const CircularProgressIndicator(strokeWidth: 2.5),
        ),
      );
    }
    final icon = Icon(player.spielt ? Icons.pause : Icons.play_arrow);
    return gross
        ? IconButton.filled(
            tooltip: player.spielt ? 'Pause' : 'Abspielen',
            iconSize: 48,
            onPressed: player.umschalten,
            icon: icon,
          )
        : IconButton(
            tooltip: player.spielt ? 'Pause' : 'Abspielen',
            onPressed: player.umschalten,
            icon: icon,
          );
  }
}

/// Der ganze Player: Titel, Fortschritt zum Springen, Warteschlange.
class PlayerScreen extends StatelessWidget {
  const PlayerScreen({super.key, required this.player});

  final MusikPlayer player;

  @override
  Widget build(BuildContext context) {
    return ListenableBuilder(
      listenable: player,
      builder: (context, _) {
        final e = player.aktuell;
        final text = Theme.of(context).textTheme;
        if (e != null && player.radio) {
          return Scaffold(
            appBar: AppBar(title: const Text('Radio')),
            body: _RadioAnsicht(player: player, sender: e),
          );
        }
        return Scaffold(
          appBar: AppBar(title: Text(player.quelle ?? 'Player')),
          body: e == null
              ? const Center(child: Text('Es läuft nichts.'))
              : Column(
                  children: [
                    Padding(
                      padding: const EdgeInsets.fromLTRB(24, 24, 24, 8),
                      child: Column(
                        children: [
                          Text(e.titel, style: text.headlineSmall, textAlign: TextAlign.center),
                          if (e.interpret != null)
                            Text(
                              e.interpret!,
                              style: text.titleMedium,
                              textAlign: TextAlign.center,
                            ),
                          if (player.fehler != null)
                            Padding(
                              padding: const EdgeInsets.only(top: 8),
                              child: Text(
                                player.fehler!,
                                style: TextStyle(color: Theme.of(context).colorScheme.error),
                              ),
                            ),
                        ],
                      ),
                    ),
                    if (!player.radio) _Fortschritt(player: player),
                    Row(
                      mainAxisAlignment: MainAxisAlignment.center,
                      children: [
                        if (!player.radio) ...[
                          IconButton(
                            tooltip: player.zufall ? 'Zufall aus' : 'Zufall ein',
                            isSelected: player.zufall,
                            icon: const Icon(Icons.shuffle),
                            onPressed: player.zufallUmschalten,
                          ),
                          IconButton(
                            tooltip: 'Zurück',
                            iconSize: 36,
                            icon: const Icon(Icons.skip_previous),
                            onPressed: player.zurueck,
                          ),
                        ],
                        const SizedBox(width: 8),
                        _SpielKnopf(player: player, gross: true),
                        const SizedBox(width: 8),
                        if (!player.radio) ...[
                          IconButton(
                            tooltip: 'Nächster Titel',
                            iconSize: 36,
                            icon: const Icon(Icons.skip_next),
                            onPressed: player.weiter,
                          ),
                          IconButton(
                            tooltip: 'Beenden',
                            icon: const Icon(Icons.stop),
                            onPressed: () {
                              player.beenden();
                              Navigator.of(context).pop();
                            },
                          ),
                        ],
                      ],
                    ),
                    const Divider(),
                    if (!player.radio) ...[
                      Padding(
                        padding: const EdgeInsets.fromLTRB(16, 4, 16, 0),
                        child: Row(
                          children: [
                            Text('Als Nächstes', style: text.titleSmall),
                            const SizedBox(width: 12),
                            Expanded(
                              child: Text(
                                '${player.index + 1} von ${player.liste.length}'
                                '${player.zufall ? ' · zufällig' : ''}',
                                style: text.bodySmall,
                                textAlign: TextAlign.end,
                                maxLines: 1,
                                overflow: TextOverflow.ellipsis,
                              ),
                            ),
                          ],
                        ),
                      ),
                      Expanded(child: _Naechste(player: player)),
                    ],
                  ],
                ),
        );
      },
    );
  }
}

/// Die naechsten Titel in Abspielreihenfolge - bei "Alle Titel" sonst eine
/// alphabetische Liste von ueber tausend Eintraegen, die nichts ueber die
/// Wiedergabe sagt.
class _Naechste extends StatelessWidget {
  const _Naechste({required this.player});

  final MusikPlayer player;

  @override
  Widget build(BuildContext context) {
    final naechste = player.naechste();
    if (naechste.isEmpty) {
      return const Padding(padding: EdgeInsets.all(16), child: Text('Danach ist Schluss.'));
    }
    return ListView.builder(
      padding: EdgeInsets.only(bottom: MediaQuery.paddingOf(context).bottom),
      itemCount: naechste.length,
      itemBuilder: (context, n) {
        final i = naechste[n];
        final t = player.liste[i];
        return ListTile(
          dense: true,
          leading: SizedBox(width: 24, child: Text('${n + 1}', textAlign: TextAlign.center)),
          title: Text(t.titel, maxLines: 1, overflow: TextOverflow.ellipsis),
          subtitle: t.interpret == null ? null : Text(t.interpret!),
          onTap: () => player.springeZu(i),
        );
      },
    );
  }
}

/// Logo eines Radiosenders im Kreis. Ohne Logo, solange es laedt und wenn
/// es sich nicht laden laesst, steht [platzhalter] da (sonst das Radio-
/// Symbol) - ein kaputtes Logo darf nie die Liste oder den Player stoeren.
class SenderLogo extends StatelessWidget {
  const SenderLogo({
    super.key,
    required this.logo,
    this.groesse = 40,
    this.platzhalter = const Icon(Icons.radio),
  });

  final Uri? logo;
  final double groesse;
  final Widget platzhalter;

  @override
  Widget build(BuildContext context) {
    final logo = this.logo;
    if (logo == null) return platzhalter;
    return Image.network(
      logo.toString(),
      key: const Key('sender-logo'),
      width: groesse,
      height: groesse,
      // Logos sind fuer hellen Grund gemacht, auch im dunklen Design.
      frameBuilder: (context, bild, frame, sofort) => frame == null && !sofort
          ? platzhalter
          : Container(
              width: groesse,
              height: groesse,
              padding: EdgeInsets.all(groesse * 0.1),
              clipBehavior: Clip.antiAlias,
              decoration: const BoxDecoration(color: Colors.white, shape: BoxShape.circle),
              child: bild,
            ),
      errorBuilder: (context, _, _) =>
          KeyedSubtree(key: const Key('sender-logo-platzhalter'), child: platzhalter),
      fit: BoxFit.contain,
    );
  }
}

/// Radio im grossen Player: Sender, was gerade laeuft, andere Sender.
class _RadioAnsicht extends StatefulWidget {
  const _RadioAnsicht({required this.player, required this.sender});

  final MusikPlayer player;
  final WiedergabeEintrag sender;

  @override
  State<_RadioAnsicht> createState() => _RadioAnsichtState();
}

class _RadioAnsichtState extends State<_RadioAnsicht> {
  // Einmal laden, nicht bei jedem neuen Titel.
  late final Future<List<Radiosender>> _sender = widget.player.zugang.sender();

  @override
  Widget build(BuildContext context) {
    final player = widget.player;
    final sender = widget.sender;
    final text = Theme.of(context).textTheme;
    final farben = Theme.of(context).colorScheme;
    final live = player.liveTitel;
    // "Interpret - Titel" (so schicken es die meisten Sender) in zwei Zeilen.
    final teile = live?.split(' - ');
    final titel = teile != null && teile.length >= 2 ? teile.sublist(1).join(' - ') : live;
    final interpret = teile != null && teile.length >= 2 ? teile.first : null;
    return ListView(
      padding: EdgeInsets.fromLTRB(24, 24, 24, 24 + MediaQuery.paddingOf(context).bottom),
      children: [
        Center(
          child: SenderLogo(
            logo: sender.bild,
            groesse: 120,
            platzhalter: Container(
              width: 120,
              height: 120,
              decoration: BoxDecoration(color: farben.primaryContainer, shape: BoxShape.circle),
              child: Icon(Icons.radio, size: 60, color: farben.onPrimaryContainer),
            ),
          ),
        ),
        const SizedBox(height: 16),
        Text(sender.titel, style: text.headlineSmall, textAlign: TextAlign.center),
        const SizedBox(height: 8),
        Center(
          child: Chip(
            avatar: Icon(
              Icons.circle,
              size: 10,
              color: player.spielt ? farben.error : farben.outline,
            ),
            label: Text(player.spielt ? 'LIVE' : 'Pausiert'),
          ),
        ),
        const SizedBox(height: 16),
        Text('Läuft gerade', style: text.labelLarge, textAlign: TextAlign.center),
        const SizedBox(height: 4),
        Text(
          titel ?? 'Der Sender meldet keinen Titel',
          key: const Key('radio-titel'),
          style: text.titleLarge,
          textAlign: TextAlign.center,
        ),
        if (interpret != null)
          Text(interpret, style: text.titleMedium, textAlign: TextAlign.center),
        if (player.fehler != null)
          Padding(
            padding: const EdgeInsets.only(top: 8),
            child: Text(
              player.fehler!,
              style: TextStyle(color: farben.error),
              textAlign: TextAlign.center,
            ),
          ),
        const SizedBox(height: 16),
        Row(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            _SpielKnopf(player: player, gross: true),
            const SizedBox(width: 16),
            IconButton(
              tooltip: 'Beenden',
              icon: const Icon(Icons.stop),
              onPressed: () {
                player.beenden();
                Navigator.of(context).pop();
              },
            ),
          ],
        ),
        const Divider(height: 32),
        Text('Andere Sender', style: text.titleSmall),
        FutureBuilder<List<Radiosender>>(
          future: _sender,
          builder: (context, s) {
            final liste = (s.data ?? const <Radiosender>[])
                .where((x) => x.url != sender.id)
                .toList();
            if (s.connectionState != ConnectionState.done) {
              return const Padding(
                padding: EdgeInsets.all(16),
                child: Center(child: CircularProgressIndicator()),
              );
            }
            return Column(
              children: [
                for (final x in liste)
                  ListTile(
                    contentPadding: EdgeInsets.zero,
                    leading: SenderLogo(logo: x.logo),
                    title: Text(x.name),
                    trailing: const Icon(Icons.play_arrow),
                    onTap: () => player.spieleSender(x),
                  ),
              ],
            );
          },
        ),
      ],
    );
  }
}

class _Fortschritt extends StatefulWidget {
  const _Fortschritt({required this.player});

  final MusikPlayer player;

  @override
  State<_Fortschritt> createState() => _FortschrittState();
}

class _FortschrittState extends State<_Fortschritt> {
  double? _ziehen; // waehrend des Ziehens die Stelle des Reglers

  @override
  Widget build(BuildContext context) {
    return StreamBuilder<Duration?>(
      stream: widget.player.dauer,
      builder: (context, d) => StreamBuilder<Duration>(
        stream: widget.player.position,
        builder: (context, p) {
          final dauer = d.data ?? Duration.zero;
          final ms = dauer.inMilliseconds.toDouble();
          final pos = (p.data ?? Duration.zero).inMilliseconds.toDouble().clamp(0.0, ms);
          final wert = _ziehen ?? pos;
          return Padding(
            padding: const EdgeInsets.symmetric(horizontal: 16),
            child: Column(
              children: [
                Slider(
                  value: ms <= 0 ? 0 : wert,
                  max: ms <= 0 ? 1 : ms,
                  onChanged: ms <= 0 ? null : (v) => setState(() => _ziehen = v),
                  onChangeEnd: (v) {
                    widget.player.springen(Duration(milliseconds: v.round()));
                    setState(() => _ziehen = null);
                  },
                ),
                Padding(
                  padding: const EdgeInsets.symmetric(horizontal: 8),
                  child: Row(
                    mainAxisAlignment: MainAxisAlignment.spaceBetween,
                    children: [
                      Text(zeitText(Duration(milliseconds: wert.round()))),
                      Text(zeitText(dauer)),
                    ],
                  ),
                ),
              ],
            ),
          );
        },
      ),
    );
  }
}
