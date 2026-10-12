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
  });

  final String id;
  final Uri adresse;
  final String titel;
  final String? interpret;
  final String? album;
}

class WiedergabeStand {
  const WiedergabeStand({this.index, this.spielt = false, this.laedt = false, this.fertig = false});

  final int? index;
  final bool spielt;
  final bool laedt;

  /// Die Warteschlange ist durchgespielt.
  final bool fertig;
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

  Stream<WiedergabeStand> get stand;
  Stream<Duration> get position;
  Stream<Duration?> get dauer;

  /// Ein Titel liess sich nicht abspielen (Index in der Warteschlange).
  Stream<int?> get fehler;
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
            tag: MediaItem(id: e.id, title: e.titel, artist: e.interpret, album: e.album),
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
  Stream<WiedergabeStand> get stand => _stand.stream;

  @override
  Stream<Duration> get position => _player.positionStream;

  @override
  Stream<Duration?> get dauer => _player.durationStream;

  @override
  Stream<int?> get fehler => _player.errorStream.map((e) => e.index);

  @override
  Future<void> schliessen() async {
    await _player.dispose();
    await _stand.close();
  }
}

/// Zustand fuer die Oberflaeche: Warteschlange, was laeuft, Fehler.
class MusikPlayer extends ChangeNotifier {
  MusikPlayer({required this.zugang, Wiedergabe? wiedergabe})
    : _w = wiedergabe ?? JustAudioWiedergabe() {
    _abos = [
      _w.stand.listen((s) {
        _index = s.index ?? _index;
        _spielt = s.spielt && !s.fertig;
        _puffert = s.laedt;
        notifyListeners();
      }),
      _w.fehler.listen((i) {
        final e = (i != null && i >= 0 && i < _liste.length) ? _liste[i] : aktuell;
        _fehler = e == null
            ? 'Titel lässt sich nicht abspielen'
            : '„${e.titel}“ lässt sich nicht abspielen';
        notifyListeners();
        // Ein kaputter Titel haelt eine Playlist nicht an.
        if (i != null && i + 1 < _liste.length) unawaited(_w.weiter().then((_) => _w.spielen()));
      }),
    ];
  }

  static const vorhoerQuelle = 'Vorhören';

  final MusikZugang zugang;
  final Wiedergabe _w;
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
    _nr++;
    _fehler = null;
    await _starten(
      s.name,
      [WiedergabeEintrag(id: s.url, adresse: Uri.parse(s.url), titel: s.name, album: 'Radio')],
      ab: 0,
      radio: true,
      zufall: false,
    );
  }

  Future<void> _starten(
    String quelle,
    List<WiedergabeEintrag> liste, {
    required int ab,
    required bool radio,
    required bool zufall,
  }) async {
    _liste = liste;
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
                  leading: Icon(player.radio ? Icons.radio : Icons.music_note),
                  title: Text(e.titel, maxLines: 1, overflow: TextOverflow.ellipsis),
                  subtitle: Text(
                    player.fehler ?? [?e.interpret, ?player.quelle].join(' · '),
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
                    Expanded(
                      child: ListView.builder(
                        padding: EdgeInsets.only(bottom: MediaQuery.paddingOf(context).bottom),
                        itemCount: player.liste.length,
                        itemBuilder: (context, i) {
                          final t = player.liste[i];
                          final jetzt = i == player.index;
                          return ListTile(
                            dense: true,
                            selected: jetzt,
                            leading: jetzt
                                ? const Icon(Icons.equalizer)
                                : SizedBox(
                                    width: 24,
                                    child: Text('${i + 1}', textAlign: TextAlign.center),
                                  ),
                            title: Text(t.titel, maxLines: 1, overflow: TextOverflow.ellipsis),
                            subtitle: t.interpret == null ? null : Text(t.interpret!),
                            onTap: () => player.springeZu(i),
                          );
                        },
                      ),
                    ),
                  ],
                ),
        );
      },
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
