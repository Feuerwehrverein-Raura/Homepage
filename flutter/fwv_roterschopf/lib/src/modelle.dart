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
    this.ausgesteckt = 0,
  });

  factory LichtGruppe.ausJson(Map<String, dynamic> j) => LichtGruppe(
    kennung: '${j['kennung']}',
    name: '${j['name']}',
    anzahl: _ganz(j['anzahl']) ?? 0,
    anzahlAn: _ganz(j['anzahl_an']) ?? 0,
    an: j['an'] == true,
    teilweise: j['teilweise'] == true,
    erreichbar: j['erreichbar'] == true,
    ausgesteckt: _ganz(j['anzahl_aus_gesteckt']) ?? 0,
  );

  /// "spots", "arbeitsleuchten" — geschaltet wird mit `gruppe:<kennung>`.
  final String kennung;
  final String name;

  /// Lampen, die antworten (ausgesteckte zaehlen nicht mit).
  final int anzahl;
  final int anzahlAn;

  /// Alle erreichbaren Lampen der Gruppe brennen.
  final bool an;
  final bool teilweise;
  final bool erreichbar;

  /// Lampen, die nicht antworten (ausgesteckt oder stromlos).
  final int ausgesteckt;
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
    this.messstelle,
  });

  factory Kuehler.ausJson(Map<String, dynamic> j) => Kuehler(
    name: '${j['name']}',
    messstelle: j['messstelle'] is String ? j['messstelle'] as String : null,
    erreichbar: j['erreichbar'] == true,
    temperatur: (j['temperatur'] as num?)?.toDouble(),
    grenze: (j['grenze'] as num?)?.toDouble(),
    zuWarm: j['zu_warm'] == true,
    stromAn: j['strom_an'] is bool ? j['strom_an'] as bool : null,
    watt: _ganz(j['watt']),
  );

  final String name;

  /// "kuehler:eis" - fuer den Verlauf ([RoterSchopfZugang.verlauf]).
  final String? messstelle;
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
    this.messstelle,
  });

  factory Thermostat.ausJson(Map<String, dynamic> j) => Thermostat(
    name: '${j['name']}',
    messstelle: j['messstelle'] is String ? j['messstelle'] as String : null,
    erreichbar: j['erreichbar'] == true,
    temperatur: (j['temperatur'] as num?)?.toDouble(),
    soll: (j['soll'] as num?)?.toDouble(),
    ventil: _ganz(j['ventil']),
    batterie: _ganz(j['batterie']),
    fehler: j['fehler'] is List ? [for (final f in j['fehler'] as List) '$f'] : const [],
  );

  final String name;

  /// "heizung:..." - fuer den Verlauf.
  final String? messstelle;
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

/// SMS-Alarm der Tiefkuehler (api-members, src/kuehler-alarm.js): scharf
/// oder fuer eine Weile entschaerft.
class KuehlerAlarm {
  const KuehlerAlarm({
    required this.scharf,
    this.bis,
    this.von,
    this.geaendert,
    this.aktiv = true,
    this.offen = const [],
  });

  factory KuehlerAlarm.ausJson(Object? roh) {
    final j = roh is Map ? roh : const {};
    DateTime? zeit(Object? v) => v == null ? null : DateTime.tryParse('$v')?.toLocal();
    final von = '${j['von'] ?? ''}'.trim();
    return KuehlerAlarm(
      scharf: j['scharf'] != false,
      bis: zeit(j['bis']),
      von: von.isEmpty ? null : von,
      geaendert: zeit(j['geaendert']),
      aktiv: j['aktiv'] != false,
      offen: [
        for (final f in j['offen'] is List ? j['offen'] as List : const [])
          if (f is Map) OffenerAlarm.ausJson(f),
      ],
    );
  }

  final bool scharf;

  /// Entschaerft bis dahin; null = bis jemand wieder scharf stellt.
  final DateTime? bis;
  final String? von;
  final DateTime? geaendert;

  /// false: auf dem Server ganz abgeschaltet (KUEHLER_ALARM).
  final bool aktiv;

  /// Gemeldete Faelle ohne Entwarnung.
  final List<OffenerAlarm> offen;
}

/// Ein gemeldeter Fall ("kuehler:eis:warm") und wer nachschaut
/// (POST kiosk/kuehler-alarm/schauen).
class OffenerAlarm {
  const OffenerAlarm({
    required this.schluessel,
    required this.text,
    this.seit,
    this.schaut,
    this.schautSeit,
    this.vorOrt = false,
  });

  factory OffenerAlarm.ausJson(Map<dynamic, dynamic> j) {
    final s = j['schaut'];
    final name = s is Map ? '${s['name'] ?? ''}'.trim() : '';
    return OffenerAlarm(
      schluessel: '${j['schluessel'] ?? ''}',
      // "FWV Schopf: " bzw. "FWV Schopf, noch immer: " weglassen.
      text: '${j['text'] ?? ''}'.replaceFirst(RegExp(r'^FWV Schopf[^:]*: '), ''),
      seit: j['seit'] == null ? null : DateTime.tryParse('${j['seit']}')?.toLocal(),
      schaut: name.isEmpty ? null : name,
      schautSeit: s is Map && s['zeit'] != null
          ? DateTime.tryParse('${s['zeit']}')?.toLocal()
          : null,
      vorOrt: s is Map && s['vor_ort'] == true,
    );
  }

  final String schluessel;
  final String text;
  final DateTime? seit;

  /// Name dessen, der nachschaut; null: noch niemand.
  final String? schaut;
  final DateTime? schautSeit;

  /// [schaut] hat den Sticker am Geraet gescannt.
  final bool vorOrt;
}

/// Zeitraeume des Verlaufs (GET /kiosk/roter-schopf/verlauf, zeitraum).
enum VerlaufZeitraum {
  tag('24h', '24 h'),
  woche('7d', '7 Tage'),
  monat('30d', '30 Tage'),
  jahr('1j', '1 Jahr');

  const VerlaufZeitraum(this.kennung, this.text);

  final String kennung;
  final String text;
}

/// Ein Abschnitt einer Reihe; [mittel] null = Luecke (Geraet nicht erreichbar).
class VerlaufPunkt {
  const VerlaufPunkt(this.t, this.mittel, {this.min, this.max});

  final DateTime t;
  final double? mittel;
  final double? min;
  final double? max;
}

/// Verlauf einer Messstelle (api-members src/schopf-verlauf.js): Reihen je
/// Groesse (temperatur, watt, an, soll, ventil, ...).
class Verlauf {
  const Verlauf({
    required this.messstelle,
    required this.von,
    required this.bis,
    required this.rasterS,
    required this.reihen,
    this.grenze,
  });

  factory Verlauf.ausJson(Object? roh) {
    final j = roh is Map ? roh : const {};
    double? zahl(Object? v) => v is num ? v.toDouble() : null;
    DateTime zeit(Object? v) => DateTime.tryParse('$v')?.toLocal() ?? DateTime.now();
    final reihen = <String, List<VerlaufPunkt>>{};
    final r = j['reihen'];
    if (r is Map) {
      for (final MapEntry(:key, :value) in r.entries) {
        if (value is! List) continue;
        reihen['$key'] = [
          for (final p in value)
            if (p is Map)
              VerlaufPunkt(
                zeit(p['t']),
                zahl(p['mittel']),
                min: zahl(p['min']),
                max: zahl(p['max']),
              ),
        ];
      }
    }
    return Verlauf(
      messstelle: '${j['messstelle'] ?? ''}',
      von: zeit(j['von']),
      bis: zeit(j['bis']),
      rasterS: (j['raster_s'] as num?)?.toInt() ?? 300,
      grenze: zahl(j['grenze']),
      reihen: reihen,
    );
  }

  final String messstelle;
  final DateTime von;
  final DateTime bis;

  /// Abstand der Abschnitte in Sekunden; fehlt einer, ist das eine Luecke.
  final int rasterS;

  /// Ab hier "zu warm" (nur Tiefkuehler).
  final double? grenze;
  final Map<String, List<VerlaufPunkt>> reihen;

  List<VerlaufPunkt> reihe(String groesse) => reihen[groesse] ?? const [];
}
