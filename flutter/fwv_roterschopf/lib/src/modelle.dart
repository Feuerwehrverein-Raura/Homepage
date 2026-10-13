// Was GET /kiosk/roter-schopf (api-members) liefert. Vertragsdatei:
// docker/backend-members/test/fixtures/roter-schopf-app.json.
//
// Das Backend rechnet alles aus (Gruppe an/teilweise, zu warm) — die App
// zeigt nur an.

class RoterSchopfZustand {
  const RoterSchopfZustand({
    required this.stand,
    required this.zentrale,
    required this.gruppen,
    required this.lampen,
    required this.kuehlung,
    this.thermostate = const [],
    this.hauptmessung,
  });

  factory RoterSchopfZustand.ausJson(Map<String, dynamic> j) => RoterSchopfZustand(
    stand: DateTime.tryParse('${j['stand']}')?.toLocal(),
    zentrale: j['zentrale'] == true,
    gruppen: _liste(j['gruppen'], LichtGruppe.ausJson),
    lampen: _liste(j['lampen'], Lampe.ausJson),
    kuehlung: _liste(j['kuehlung'], Kuehler.ausJson),
    thermostate: _liste(j['thermostate'], Thermostat.ausJson),
    hauptmessung: j['hauptmessung'] is Map
        ? Hauptmessung.ausJson(Map<String, dynamic>.from(j['hauptmessung'] as Map))
        : null,
  );

  /// Wann gemessen (das Backend teilt eine Messung bis zu 10 s).
  final DateTime? stand;

  /// Antwortet die Zentrale? Ist sie weg, sind zwangslaeufig alle Lampen
  /// weg — dann liegt der Fehler dort und nicht bei den Leuchten.
  final bool zentrale;
  final List<LichtGruppe> gruppen;
  final List<Lampe> lampen;
  final List<Kuehler> kuehlung;
  final List<Thermostat> thermostate;

  /// Stromzaehler des Lokals (die Zentrale, Pro 3EM); null bei aelteren
  /// Backends.
  final Hauptmessung? hauptmessung;
}

/// Strom im Lokal: Leistung jetzt (gesamt und je Phase) und Zaehlerstand.
class Hauptmessung {
  const Hauptmessung({
    required this.erreichbar,
    this.leistungW,
    this.phasen = const [],
    this.zaehlerKwh,
  });

  factory Hauptmessung.ausJson(Map<String, dynamic> j) => Hauptmessung(
    erreichbar: j['erreichbar'] == true,
    leistungW: _ganz(j['leistung_w']),
    phasen: _liste(j['phasen'], Phase.ausJson),
    zaehlerKwh: (j['zaehler_kwh'] as num?)?.toDouble(),
  );

  final bool erreichbar;
  final int? leistungW;
  final List<Phase> phasen;
  final double? zaehlerKwh;
}

class Phase {
  const Phase({required this.name, this.spannungV, this.stromA, this.leistungW});

  factory Phase.ausJson(Map<String, dynamic> j) => Phase(
    name: '${j['name']}',
    spannungV: (j['spannung_v'] as num?)?.toDouble(),
    stromA: (j['strom_a'] as num?)?.toDouble(),
    leistungW: _ganz(j['leistung_w']),
  );

  final String name;
  final double? spannungV;
  final double? stromA;
  final int? leistungW;
}

List<T> _liste<T>(Object? roh, T Function(Map<String, dynamic>) bauen) => roh is List
    ? [
        for (final e in roh)
          if (e is Map) bauen(Map<String, dynamic>.from(e)),
      ]
    : const [];

int? _ganz(Object? v) => v is num ? v.round() : null;

class LichtGruppe {
  const LichtGruppe({
    required this.kennung,
    required this.name,
    required this.anzahl,
    required this.anzahlAn,
    required this.an,
    required this.teilweise,
    required this.erreichbar,
  });

  factory LichtGruppe.ausJson(Map<String, dynamic> j) => LichtGruppe(
    kennung: '${j['kennung']}',
    name: '${j['name']}',
    anzahl: _ganz(j['anzahl']) ?? 0,
    anzahlAn: _ganz(j['anzahl_an']) ?? 0,
    an: j['an'] == true,
    teilweise: j['teilweise'] == true,
    erreichbar: j['erreichbar'] == true,
  );

  /// "spots", "arbeitsleuchten" — geschaltet wird mit `gruppe:<kennung>`.
  final String kennung;
  final String name;
  final int anzahl;
  final int anzahlAn;

  /// Alle Lampen der Gruppe brennen.
  final bool an;
  final bool teilweise;
  final bool erreichbar;
}

class Lampe {
  const Lampe({
    required this.kennung,
    required this.gruppe,
    required this.name,
    required this.erreichbar,
    required this.an,
    required this.watt,
  });

  factory Lampe.ausJson(Map<String, dynamic> j) => Lampe(
    kennung: '${j['kennung']}',
    gruppe: '${j['gruppe']}',
    name: j['name'] is String ? j['name'] as String : '${j['kennung']}',
    erreichbar: j['erreichbar'] == true,
    an: j['an'] == true,
    watt: _ganz(j['watt']),
  );

  /// "192.168.33.4:1" — Geraet im Netz der Zentrale und Kanal.
  final String kennung;
  final String gruppe;
  final String name;
  final bool erreichbar;
  final bool an;
  final int? watt;
}

class Kuehler {
  const Kuehler({
    required this.name,
    required this.erreichbar,
    required this.temperatur,
    required this.grenze,
    required this.zuWarm,
    required this.stromAn,
    required this.watt,
  });

  factory Kuehler.ausJson(Map<String, dynamic> j) => Kuehler(
    name: '${j['name']}',
    erreichbar: j['erreichbar'] == true,
    temperatur: (j['temperatur'] as num?)?.toDouble(),
    grenze: (j['grenze'] as num?)?.toDouble(),
    zuWarm: j['zu_warm'] == true,
    stromAn: j['strom_an'] is bool ? j['strom_an'] as bool : null,
    watt: _ganz(j['watt']),
  );

  final String name;
  final bool erreichbar;

  /// Grad Celsius; null, wenn der Fuehler nichts liefert.
  final double? temperatur;

  /// Ab hier gilt "zu warm" (dieselbe Grenze wie im Skript auf dem Geraet).
  final double? grenze;

  /// Waermer als die Grenze oder Fuehler ohne Wert.
  final bool zuWarm;
  final bool? stromAn;
  final int? watt;
}

/// Heizkoerper-Thermostat (Shelly BLU TRV am BLU Gateway). Nur Anzeige.
class Thermostat {
  const Thermostat({
    required this.name,
    required this.erreichbar,
    required this.temperatur,
    required this.soll,
    required this.ventil,
    required this.batterie,
    required this.fehler,
  });

  factory Thermostat.ausJson(Map<String, dynamic> j) => Thermostat(
    name: '${j['name']}',
    erreichbar: j['erreichbar'] == true,
    temperatur: (j['temperatur'] as num?)?.toDouble(),
    soll: (j['soll'] as num?)?.toDouble(),
    ventil: _ganz(j['ventil']),
    batterie: _ganz(j['batterie']),
    fehler: j['fehler'] is List ? [for (final f in j['fehler'] as List) '$f'] : const [],
  );

  final String name;
  final bool erreichbar;

  /// Gemessene Raumtemperatur am Heizkoerper (Grad Celsius).
  final double? temperatur;

  /// Eingestellte Solltemperatur.
  final double? soll;

  /// Ventiloeffnung in Prozent.
  final int? ventil;

  /// Batterie in Prozent.
  final int? batterie;

  /// Fehler des Geraets, z.B. "not_calibrated".
  final List<String> fehler;
}

/// Antwort von GET /kiosk/roter-schopf/zugang: Darf diese Anmeldung in den
/// Roten Schopf - ueber die Gruppe oder, ohne Gruppe, waehrend einer Schicht
/// (1 h vorher bis 1 h nachher, api-members src/schicht-zugang.js)?
class SchopfFreigabe {
  const SchopfFreigabe({
    required this.zugang,
    this.ueberSchicht = false,
    this.schicht,
    this.anlass,
    this.bis,
  });

  factory SchopfFreigabe.ausJson(Object? roh) {
    final j = roh is Map ? Map<String, dynamic>.from(roh) : const <String, dynamic>{};
    final s = j['schicht'] is Map ? Map<String, dynamic>.from(j['schicht'] as Map) : null;
    return SchopfFreigabe(
      zugang: j['zugang'] == true,
      ueberSchicht: j['grund'] == 'schicht',
      schicht: s?['name']?.toString(),
      anlass: s?['anlass']?.toString(),
      bis: DateTime.tryParse('${s?['bis']}')?.toLocal(),
    );
  }

  static const keine = SchopfFreigabe(zugang: false);

  final bool zugang;

  /// true: nur wegen einer Schicht, nicht ueber die Gruppe.
  final bool ueberSchicht;
  final String? schicht;
  final String? anlass;

  /// Ende des Zugangs (Schichtende + 1 h); null ueber die Gruppe.
  final DateTime? bis;
}
