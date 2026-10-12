// Zugang zur Musik des Roten Schopfs - die einzige Stelle, die die Routen
// kennt (api-members, /kiosk/...). Jedes angemeldete Mitglied darf
// Playlists und Sender anlegen; fremde Playlists loeschen nur Vorstand und
// admin - das prueft das Backend.

import 'dart:typed_data';

import 'package:fwv_core/fwv_core.dart';

import 'modelle.dart';

abstract class MusikZugang {
  const MusikZugang();

  Future<List<PlaylistKurz>> playlists();
  Future<Playlist> playlist(String id);

  /// Ohne [suche] die ersten Titel alphabetisch, sonst die Treffer.
  Future<Bibliothek> bibliothek({String? suche});

  Future<Abgleich> abgleichen(String text);

  /// Legt an ([id] null) oder ersetzt Name und ganze Titelliste. Gibt die Id
  /// zurueck.
  Future<String> speichern({String? id, required String name, required List<String> pfade});

  Future<void> loeschen(String id);

  /// Die Datei eines Titels zum Vorhoeren (angemeldet geladen).
  Future<Uint8List> titelLaden(String pfad);

  Future<List<Radiosender>> sender();
  Future<void> senderAnlegen({required String name, required String url});
  Future<void> senderLoeschen(String id);
}

class ApiMusikZugang extends MusikZugang {
  const ApiMusikZugang(this.api);

  /// `SitzungsVerwaltung.api` (api-members).
  final ApiClient api;

  static String _e(String s) => Uri.encodeComponent(s);

  List<Map<String, dynamic>> _maps(Object? json) => json is List
      ? [
          for (final e in json)
            if (e is Map) Map<String, dynamic>.from(e),
        ]
      : const [];

  @override
  Future<List<PlaylistKurz>> playlists() async =>
      _maps(await api.get('kiosk/playlists')).map(PlaylistKurz.ausJson).toList();

  @override
  Future<Playlist> playlist(String id) async {
    final json = await api.get('kiosk/playlists/${_e(id)}');
    if (json is! Map) throw const FormatException('Unerwartete Antwort vom Server.');
    return Playlist.ausJson(Map<String, dynamic>.from(json));
  }

  @override
  Future<Bibliothek> bibliothek({String? suche}) async {
    final s = suche?.trim();
    return Bibliothek.ausJson(
      await api.get(
        'kiosk/bibliothek',
        abfrage: {if (s != null && s.isNotEmpty) 'suche': s, 'grenze': '100'},
      ),
    );
  }

  @override
  Future<Abgleich> abgleichen(String text) async =>
      Abgleich.ausJson(await api.post('kiosk/abgleich', daten: {'text': text}));

  @override
  Future<String> speichern({String? id, required String name, required List<String> pfade}) async {
    final daten = {'name': name, 'pfade': pfade};
    final json = id == null
        ? await api.post('kiosk/playlists', daten: daten)
        : await api.put('kiosk/playlists/${_e(id)}', daten: daten);
    return json is Map && json['id'] != null ? '${json['id']}' : (id ?? '');
  }

  @override
  Future<void> loeschen(String id) => api.delete('kiosk/playlists/${_e(id)}');

  @override
  Future<Uint8List> titelLaden(String pfad) => api.datei('kiosk/anhoeren', abfrage: {'pfad': pfad});

  @override
  Future<List<Radiosender>> sender() async =>
      _maps(await api.get('kiosk/sender')).map(Radiosender.ausJson).toList();

  @override
  Future<void> senderAnlegen({required String name, required String url}) =>
      api.post('kiosk/sender', daten: {'name': name, 'url': url});

  @override
  Future<void> senderLoeschen(String id) => api.delete('kiosk/sender/${_e(id)}');
}
