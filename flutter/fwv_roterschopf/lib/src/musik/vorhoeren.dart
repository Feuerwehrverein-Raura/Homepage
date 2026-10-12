// Vorhoeren: beim Zusammenstellen hoeren, ob "Zeitflug - Ich kann mir
// vertrau'n" wirklich der gemeinte Titel ist.
//
// Der Titel kommt angemeldet von api-members (GET /kiosk/anhoeren) und wird
// als Datei im Zwischenspeicher der App abgespielt. Bewusst NICHT als
// Stream mit Anmelde-Kopfzeile: Das loest just_audio ueber einen lokalen
// Proxy, der unter Android unverschluesselten Verkehr auf localhost
// verlangt - und das Token gehoert nicht in einen Proxy.
//
// Es spielt immer hoechstens ein Titel; ein neuer loest den alten ab.

import 'dart:async';
import 'dart:io';
import 'dart:typed_data';

import 'package:just_audio/just_audio.dart';
import 'package:material_ui/material_ui.dart';
import 'package:path_provider/path_provider.dart';

/// Was tatsaechlich abspielt - in Tests ersetzt.
abstract class Abspieler {
  Future<void> abspielen(Uint8List daten, String name);
  Future<void> anhalten();

  /// Meldet, wenn ein Titel zu Ende gespielt hat.
  Stream<void> get zuEnde;
  Future<void> schliessen();
}

class JustAudioAbspieler implements Abspieler {
  final _player = AudioPlayer();
  Directory? _ordner;

  @override
  Future<void> abspielen(Uint8List daten, String name) async {
    _ordner ??= await Directory('${(await getTemporaryDirectory()).path}/vorhoeren')
        .create(recursive: true);
    // Immer dieselbe Datei: Es spielt ohnehin nur einer, und der
    // Zwischenspeicher waechst so nicht mit jedem Titel.
    final datei = File('${_ordner!.path}/titel${_endung(name)}');
    await datei.writeAsBytes(daten, flush: true);
    await _player.stop();
    await _player.setFilePath(datei.path);
    unawaited(_player.play());
  }

  static String _endung(String name) {
    final i = name.lastIndexOf('.');
    return i > 0 && name.length - i <= 6 ? name.substring(i).toLowerCase() : '.mp3';
  }

  @override
  Future<void> anhalten() => _player.stop();

  @override
  Stream<void> get zuEnde =>
      _player.processingStateStream.where((s) => s == ProcessingState.completed);

  @override
  Future<void> schliessen() => _player.dispose();
}

/// Zustand fuer die Oberflaeche: welcher Titel laedt oder spielt.
class Vorhoerer extends ChangeNotifier {
  Vorhoerer({required this.laden, Abspieler? abspieler})
    : _abspieler = abspieler ?? JustAudioAbspieler() {
    _ende = _abspieler.zuEnde.listen((_) {
      _spielt = null;
      notifyListeners();
    });
  }

  /// Laedt die Datei zu einem Pfad der Sammlung.
  final Future<Uint8List> Function(String pfad) laden;
  final Abspieler _abspieler;
  late final StreamSubscription<void> _ende;

  String? _laedt;
  String? _spielt;
  int _nr = 0;

  String? get laedt => _laedt;
  String? get spielt => _spielt;

  /// Spielt [pfad] ab oder haelt ihn an, wenn er gerade laeuft.
  /// Wirft, wenn der Titel nicht geladen werden konnte.
  Future<void> umschalten(String pfad) async {
    if (_spielt == pfad || _laedt == pfad) {
      _nr++;
      _spielt = null;
      _laedt = null;
      notifyListeners();
      await _abspieler.anhalten();
      return;
    }
    final nr = ++_nr;
    _laedt = pfad;
    _spielt = null;
    notifyListeners();
    await _abspieler.anhalten();
    try {
      final daten = await laden(pfad);
      if (nr != _nr) return; // inzwischen ein anderer Titel gewaehlt
      await _abspieler.abspielen(daten, pfad.split('/').last);
      if (nr != _nr) return;
      _spielt = pfad;
    } finally {
      if (nr == _nr) {
        _laedt = null;
        notifyListeners();
      }
    }
  }

  Future<void> anhalten() async {
    _nr++;
    _spielt = null;
    _laedt = null;
    notifyListeners();
    await _abspieler.anhalten();
  }

  @override
  void dispose() {
    _ende.cancel();
    _abspieler.schliessen();
    super.dispose();
  }
}

/// Knopf zum Vorhoeren eines Titels; zeigt Laden, Abspielen, Anhalten.
class VorhoerKnopf extends StatelessWidget {
  const VorhoerKnopf({super.key, required this.vorhoerer, required this.pfad, this.beiFehler});

  final Vorhoerer vorhoerer;
  final String pfad;
  final void Function(Object fehler)? beiFehler;

  @override
  Widget build(BuildContext context) {
    return ListenableBuilder(
      listenable: vorhoerer,
      builder: (context, _) {
        if (vorhoerer.laedt == pfad) {
          return const Padding(
            padding: EdgeInsets.all(12),
            child: SizedBox.square(
              dimension: 24,
              child: CircularProgressIndicator(strokeWidth: 2.5),
            ),
          );
        }
        final spielt = vorhoerer.spielt == pfad;
        return IconButton(
          tooltip: spielt ? 'Anhalten' : 'Vorhören',
          icon: Icon(spielt ? Icons.stop_circle_outlined : Icons.play_circle_outline),
          onPressed: () => vorhoerer.umschalten(pfad).catchError((Object e) => beiFehler?.call(e)),
        );
      },
    );
  }
}
