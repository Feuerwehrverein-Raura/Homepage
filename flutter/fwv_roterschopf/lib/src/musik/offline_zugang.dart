// Ohne Netz: Was auf diesem Geraet gespeichert ist (MusikAblage), statt der
// Antwort des Servers - "Alle Titel", Interpreten, gespeicherte Playlists und
// die Titelsuche. Alles andere (bearbeiten, Sender, Laptop) geht
// unveraendert an den Server und meldet ohne Netz wie bisher einen Fehler.

import 'package:fwv_core/fwv_core.dart';
import 'package:material_ui/material_ui.dart' show ValueNotifier;

import 'ablage.dart';
import 'modelle.dart';
import 'zugang.dart';

class OfflineMusikZugang extends MusikZugang {
  OfflineMusikZugang(this.server, this.ablage);

  final MusikZugang server;
  final MusikAblage ablage;

  /// true, solange die letzte Abfrage aus der Ablage beantwortet wurde -
  /// fuer den Hinweis "Ohne Netz" im Musik-Bildschirm.
  final ohneNetz = ValueNotifier<bool>(false);

  /// Kein Netz (keine Antwort, Zeitueberschreitung) oder Server gestoert.
  /// Eine Ablehnung (4xx, Sitzung abgelaufen) bleibt ein Fehler.
  static bool _keinNetz(Object e) => e is! ApiFehler || e.status == null || e.status! >= 500;

  Future<T> _oderGespeichert<T>(Future<T> Function() frage, T? Function() gespeichert) async {
    try {
      final r = await frage();
      ohneNetz.value = false;
      return r;
    } on Object catch (e) {
      if (!_keinNetz(e)) rethrow;
      await ablage.laden();
      final lokal = gespeichert();
      if (lokal == null) rethrow;
      ohneNetz.value = true;
      return lokal;
    }
  }

  List<MusikTitel>? _lokaleTitel() {
    final t = ablage.lokaleTitel;
    return t.isEmpty ? null : t;
  }

  @override
  Future<List<MusikTitel>> alleTitel() => _oderGespeichert(server.alleTitel, _lokaleTitel);

  @override
  Future<List<PlaylistKurz>> playlists() => _oderGespeichert(server.playlists, () {
    final p = ablage.gespeichertePlaylists;
    return p.isEmpty
        ? null
        : [
            for (final s in p)
              PlaylistKurz(id: s.serverId!, name: s.name, anzahl: s.titel.length),
          ];
  });

  @override
  Future<Playlist> playlist(String id) => _oderGespeichert(() => server.playlist(id), () {
    final s = ablage.sammlung(GespeicherteSammlung.playlistId(id));
    return s == null ? null : Playlist(id: id, name: s.name, titel: s.titel);
  });

  @override
  Future<Bibliothek> bibliothek({String? suche}) =>
      _oderGespeichert(() => server.bibliothek(suche: suche), () {
        final alle = _lokaleTitel();
        if (alle == null) return null;
        final worte = (suche ?? '').toLowerCase().split(RegExp(r'\s+')).where((w) => w.isNotEmpty);
        final treffer = [
          for (final t in alle)
            if (worte.every('${t.anzeige} ${t.pfad}'.toLowerCase().contains)) t,
        ]..sort((a, b) => a.anzeige.toLowerCase().compareTo(b.anzeige.toLowerCase()));
        return Bibliothek(gesamt: alle.length, titel: treffer.take(100).toList());
      });

  // Alles andere unveraendert an den Server.

  @override
  Future<Abgleich> abgleichen(String text) => server.abgleichen(text);

  @override
  Future<String> speichern({String? id, required String name, required List<String> pfade}) =>
      server.speichern(id: id, name: name, pfade: pfade);

  @override
  Future<void> loeschen(String id) => server.loeschen(id);

  @override
  Future<List<Uri>> hoerAdressen(List<String> pfade) => server.hoerAdressen(pfade);

  @override
  Future<int?> platzbedarf(List<String> pfade) => server.platzbedarf(pfade);

  @override
  Future<void> fehlerMelden({
    String? pfad,
    String? quelle,
    String? code,
    String? meldung,
    int versuch = 1,
    Duration position = Duration.zero,
  }) => server.fehlerMelden(
    pfad: pfad,
    quelle: quelle,
    code: code,
    meldung: meldung,
    versuch: versuch,
    position: position,
  );

  @override
  Future<List<YoutubeTreffer>> youtubeSuchen(String begriff) => server.youtubeSuchen(begriff);

  @override
  Future<ErgaenzenAuftrag> ergaenzen(String quelle) => server.ergaenzen(quelle);

  @override
  Future<List<ErgaenzenAuftrag>> ergaenzenAuftraege() => server.ergaenzenAuftraege();

  @override
  Future<List<Radiosender>> sender() => server.sender();

  @override
  Future<void> senderAnlegen({required String name, required String url}) =>
      server.senderAnlegen(name: name, url: url);

  @override
  Future<void> senderLoeschen(String id) => server.senderLoeschen(id);

  @override
  Future<LaptopZustand> laptop() => server.laptop();

  @override
  Future<void> laptopBefehl(String aktion, [Map<String, Object?> daten = const {}]) =>
      server.laptopBefehl(aktion, daten);
}
