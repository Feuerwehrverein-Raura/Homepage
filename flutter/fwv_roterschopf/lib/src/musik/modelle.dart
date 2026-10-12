// Musik fuer den Roten Schopf: was api-members unter /kiosk/... liefert
// (docker/backend-members/src/index.js, Abschnitt "Was der
// Mitgliederbereich ruft"). Der Laptop im Lokal spielt seine eigenen
// Dateien; hier wird nur zusammengestellt, WAS er spielt.

List<T> _liste<T>(Object? roh, T Function(Map<String, dynamic>) bauen) => roh is List
    ? [
        for (final e in roh)
          if (e is Map) bauen(Map<String, dynamic>.from(e)),
      ]
    : const [];

String? _text(Object? v) {
  final t = v?.toString().trim();
  return (t == null || t.isEmpty) ? null : t;
}

/// Ein Titel der Sammlung auf dem Laptop, erkannt am Dateipfad.
class MusikTitel {
  const MusikTitel({required this.pfad, this.interpret, this.titel, this.vorhanden = true});

  factory MusikTitel.ausJson(Map<String, dynamic> j) => MusikTitel(
    pfad: '${j['pfad']}',
    interpret: _text(j['interpret']),
    titel: _text(j['titel']),
    // Fehlt das Feld (Bibliothek, Abgleich), ist der Titel natuerlich da.
    vorhanden: j['vorhanden'] != false,
  );

  final String pfad;
  final String? interpret;
  final String? titel;

  /// false: steht in der Playlist, aber der Laptop meldet die Datei nicht
  /// mehr. Bleibt sichtbar, damit man merkt, dass die Liste kuerzer wurde.
  final bool vorhanden;

  /// "Interpret – Titel", sonst der Dateiname ohne Endung.
  String get anzeige {
    if (titel != null && interpret != null) return '$interpret – $titel';
    if (titel != null) return titel!;
    final datei = pfad.split('/').last;
    final punkt = datei.lastIndexOf('.');
    return punkt > 0 ? datei.substring(0, punkt) : datei;
  }
}

class PlaylistKurz {
  const PlaylistKurz({required this.id, required this.name, this.anzahl = 0, this.erstelltVon});

  factory PlaylistKurz.ausJson(Map<String, dynamic> j) => PlaylistKurz(
    id: '${j['id']}',
    name: '${j['name']}',
    anzahl: (j['anzahl'] as num?)?.toInt() ?? 0,
    erstelltVon: _text(j['erstellt_von_name']),
  );

  final String id;
  final String name;
  final int anzahl;
  final String? erstelltVon;
}

class Playlist {
  const Playlist({required this.id, required this.name, this.titel = const []});

  factory Playlist.ausJson(Map<String, dynamic> j) => Playlist(
    id: '${j['id']}',
    name: '${j['name']}',
    titel: _liste(j['titel'], MusikTitel.ausJson),
  );

  final String id;
  final String name;
  final List<MusikTitel> titel;
}

class Bibliothek {
  const Bibliothek({this.gesamt = 0, this.titel = const []});

  factory Bibliothek.ausJson(Object? j) {
    final m = j is Map ? j : const {};
    return Bibliothek(
      gesamt: (m['gesamt'] as num?)?.toInt() ?? 0,
      titel: _liste(m['titel'], MusikTitel.ausJson),
    );
  }

  /// Wie viele Titel der Laptop insgesamt gemeldet hat.
  final int gesamt;
  final List<MusikTitel> titel;
}

/// Ergebnis von "Liste abgleichen": eine eingefuegte Titelliste (Spotify,
/// YouTube ...) gegen die Sammlung gehalten.
class Abgleich {
  const Abgleich({this.gelesen = 0, this.gefunden = const [], this.fehlend = const []});

  factory Abgleich.ausJson(Object? j) {
    final m = j is Map ? j : const {};
    return Abgleich(
      gelesen: (m['gelesen'] as num?)?.toInt() ?? 0,
      gefunden: _liste(m['gefunden'], AbgleichTreffer.ausJson),
      fehlend: [
        for (final z in (m['fehlend'] as List? ?? const []))
          if (_text(z) != null) _text(z)!,
      ],
    );
  }

  final int gelesen;
  final List<AbgleichTreffer> gefunden;

  /// Zeilen ohne passenden Titel - die Antwort auf "was fehlt der Sammlung?".
  final List<String> fehlend;
}

class AbgleichTreffer {
  const AbgleichTreffer({required this.zeile, required this.titel, required this.sicher});

  factory AbgleichTreffer.ausJson(Map<String, dynamic> j) => AbgleichTreffer(
    zeile: '${j['zeile']}',
    titel: MusikTitel.ausJson(j),
    sicher: j['sicher'] == true,
  );

  /// So stand es in der eingefuegten Liste.
  final String zeile;
  final MusikTitel titel;

  /// false: knapper Treffer - lohnt einen zweiten Blick.
  final bool sicher;
}

class Radiosender {
  const Radiosender({required this.id, required this.name, required this.url});

  factory Radiosender.ausJson(Map<String, dynamic> j) =>
      Radiosender(id: '${j['id']}', name: '${j['name']}', url: '${j['url']}');

  final String id;
  final String name;
  final String url;
}

/// Was der Laptop im Lokal gerade spielt (GET /kiosk/t400/musik, aus dem
/// Kiosk-Dienst roterschopf-kiosk/dienst/kiosk.py).
class LaptopMusik {
  const LaptopMusik({
    required this.erreichbar,
    this.laeuft = false,
    this.titel,
    this.interpret,
    this.position = Duration.zero,
    this.dauer = Duration.zero,
    this.lautstaerke,
    this.zufall = false,
    this.naechste = const [],
  });

  factory LaptopMusik.ausJson(Object? roh) {
    final j = roh is Map ? Map<String, dynamic>.from(roh) : const <String, dynamic>{};
    Duration sek(Object? v) => Duration(milliseconds: ((v as num?) ?? 0).toDouble() * 1000 ~/ 1);
    final vol = (j['lautstaerke'] as num?)?.toInt();
    final titel = _text(j['titel']);
    return LaptopMusik(
      erreichbar: j['erreichbar'] == true,
      laeuft: j['laeuft'] == true,
      titel: titel == '—' ? null : titel,
      interpret: _text(j['interpret']),
      position: sek(j['position']),
      dauer: sek(j['dauer']),
      // MPD meldet -1, wenn es die Lautstaerke nicht kennt.
      lautstaerke: vol == null || vol < 0 ? null : vol,
      zufall: j['zufall'] == true,
      naechste: [
        for (final n in _liste(j['naechste'], (m) => m))
          if (_text(n['name']) != null) _text(n['name'])!,
      ],
    );
  }

  /// false: MPD auf dem Laptop antwortet nicht.
  final bool erreichbar;
  final bool laeuft;
  final String? titel;
  final String? interpret;
  final Duration position;

  /// Null beim Radio.
  final Duration dauer;
  final int? lautstaerke;
  final bool zufall;
  final List<String> naechste;
}

class LaptopZustand {
  const LaptopZustand({required this.musik, this.playlists = const [], this.sender = const []});

  factory LaptopZustand.ausJson(Object? roh) {
    final j = roh is Map ? Map<String, dynamic>.from(roh) : const <String, dynamic>{};
    return LaptopZustand(
      musik: LaptopMusik.ausJson(j['musik']),
      playlists: [
        if (j['playlists'] is List)
          for (final p in j['playlists'] as List)
            if (_text(p) != null) _text(p)!,
      ],
      sender: _liste(
        j['sender'],
        (m) => Radiosender(id: '${m['url']}', name: '${m['name']}', url: '${m['url']}'),
      ),
    );
  }

  final LaptopMusik musik;

  /// Namen, "Alle Titel" zuerst.
  final List<String> playlists;
  final List<Radiosender> sender;
}
