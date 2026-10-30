// Zugang zur Musik des Roten Schopfs - die einzige Stelle, die die Routen
// kennt (api-members, /kiosk/...). Jedes angemeldete Mitglied darf
// Playlists und Sender anlegen; fremde Playlists loeschen nur Vorstand und
// admin - das prueft das Backend.

import 'package:fwv_core/fwv_core.dart';

import 'modelle.dart';

abstract class MusikZugang {
  const MusikZugang();

  Future<List<PlaylistKurz>> playlists();
  Future<Playlist> playlist(String id);

  /// Ohne [suche] die ersten Titel alphabetisch, sonst die Treffer.
  Future<Bibliothek> bibliothek({String? suche});

  /// Die ganze Sammlung (fuer "Alle Titel" im Player).
  Future<List<MusikTitel>> alleTitel();

  Future<Abgleich> abgleichen(String text);

  /// Legt an ([id] null) oder ersetzt Name und ganze Titelliste. Gibt die Id
  /// zurueck.
  Future<String> speichern({String? id, required String name, required List<String> pfade});

  Future<void> loeschen(String id);

  /// Adressen zum Streamen der Titel (mit Hoer-Freigabe, ohne Anmeldung).
  Future<List<Uri>> hoerAdressen(List<String> pfade);

  /// Bytes, die [pfade] zusammen belegen (Speichern in der Desktop-App);
  /// null, wenn der Server es nicht sagen kann.
  Future<int?> platzbedarf(List<String> pfade) async => null;

  /// Meldet dem Server, dass ein Titel auf dem Handy nicht spielt.
  Future<void> fehlerMelden({
    String? pfad,
    String? quelle,
    String? code,
    String? meldung,
    int versuch = 1,
    Duration position = Duration.zero,
  });

  /// Songs ergaenzen (Gruppe Roter Schopf, Vorstand, admin): YouTube
  /// durchsuchen, Link oder Suchbegriff laden lassen, Auftraege sehen.
  Future<List<YoutubeTreffer>> youtubeSuchen(String begriff) =>
      throw UnsupportedError('Songs ergaenzen gibt es hier nicht');
  Future<ErgaenzenAuftrag> ergaenzen(String quelle) =>
      throw UnsupportedError('Songs ergaenzen gibt es hier nicht');
  Future<List<ErgaenzenAuftrag>> ergaenzenAuftraege() =>
      throw UnsupportedError('Songs ergaenzen gibt es hier nicht');

  Future<List<Radiosender>> sender();
  Future<void> senderAnlegen({required String name, required String url});
  Future<void> senderLoeschen(String id);

  /// Was der Laptop im Lokal spielt - nur Gruppe Roter Schopf, Vorstand,
  /// admin.
  Future<LaptopZustand> laptop();

  /// umschalten, weiter, zurueck, lautstaerke {wert}, playlist {name},
  /// radio {url}.
  Future<void> laptopBefehl(String aktion, [Map<String, Object?> daten = const {}]);
}

class ApiMusikZugang extends MusikZugang {
  ApiMusikZugang(this.api);

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
  Future<void> fehlerMelden({
    String? pfad,
    String? quelle,
    String? code,
    String? meldung,
    int versuch = 1,
    Duration position = Duration.zero,
  }) => api.post(
    'kiosk/hoeren/fehler',
    daten: {
      'pfad': pfad,
      'quelle': quelle,
      'code': code,
      'meldung': meldung,
      'versuch': versuch,
      'position': position.inMilliseconds / 1000,
    },
  );

  @override
  Future<List<MusikTitel>> alleTitel() async =>
      _maps(await api.get('kiosk/bibliothek/alle')).map(MusikTitel.ausJson).toList();

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

  String? _freigabe;
  DateTime? _freigabeBis;

  @override
  Future<List<Uri>> hoerAdressen(List<String> pfade) async {
    // Eine Freigabe gilt 12 Stunden; erneuert wird, solange noch mindestens
    // eine Stunde uebrig waere - lang genug fuer jede Playlist.
    final bis = _freigabeBis;
    if (_freigabe == null || bis == null || bis.difference(DateTime.now()).inMinutes < 60) {
      final json = await api.post('kiosk/hoeren/freigabe');
      if (json is! Map || json['token'] == null) {
        throw const FormatException('Der Server hat keine Hoer-Freigabe geliefert.');
      }
      _freigabe = '${json['token']}';
      _freigabeBis =
          DateTime.tryParse('${json['gueltig_bis']}') ??
          DateTime.now().add(const Duration(hours: 1, minutes: 30));
    }
    return [
      for (final p in pfade) api.adresse('kiosk/hoeren', {'pfad': p, 't': _freigabe!}),
    ];
  }

  @override
  Future<int?> platzbedarf(List<String> pfade) async {
    try {
      final json = await api.post('kiosk/hoeren/groesse', daten: {'pfade': pfade});
      return json is Map ? (json['bytes'] as num?)?.toInt() : null;
    } on ApiFehler catch (e) {
      // Aelteres Backend ohne die Route: speichern geht trotzdem.
      if (e.status == 404) return null;
      rethrow;
    }
  }

  @override
  Future<List<YoutubeTreffer>> youtubeSuchen(String begriff) async {
    final json = await api.get('kiosk/ergaenzen/suche', abfrage: {'q': begriff});
    return _maps(json is Map ? json['treffer'] : null).map(YoutubeTreffer.ausJson).toList();
  }

  @override
  Future<ErgaenzenAuftrag> ergaenzen(String quelle) async {
    final json = await api.post('kiosk/ergaenzen', daten: {'quelle': quelle});
    if (json is! Map) throw const FormatException('Unerwartete Antwort vom Server.');
    return ErgaenzenAuftrag.ausJson(Map<String, dynamic>.from(json));
  }

  @override
  Future<List<ErgaenzenAuftrag>> ergaenzenAuftraege() async {
    final json = await api.get('kiosk/ergaenzen');
    return _maps(json is Map ? json['auftraege'] : null).map(ErgaenzenAuftrag.ausJson).toList();
  }

  @override
  Future<List<Radiosender>> sender() async =>
      _maps(await api.get('kiosk/sender')).map(Radiosender.ausJson).toList();

  @override
  Future<void> senderAnlegen({required String name, required String url}) =>
      api.post('kiosk/sender', daten: {'name': name, 'url': url});

  @override
  Future<void> senderLoeschen(String id) => api.delete('kiosk/sender/${_e(id)}');

  @override
  Future<LaptopZustand> laptop() async => LaptopZustand.ausJson(await api.get('kiosk/t400/musik'));

  @override
  Future<void> laptopBefehl(String aktion, [Map<String, Object?> daten = const {}]) =>
      api.post('kiosk/t400/musik/${_e(aktion)}', daten: daten);
}
