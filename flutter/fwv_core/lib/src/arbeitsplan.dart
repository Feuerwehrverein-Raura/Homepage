// Arbeitsplan, wie ihn das Backend fertig liefert (GET /events/:id/arbeitsplan).
//
// Die App rechnet nichts: Tage, Zeitfenster und Bereiche kommen sortiert vom
// Server. `zellen` steht parallel zu `bereiche`; null heisst "in diesem
// Zeitfenster keine Schicht in diesem Bereich". Getestet gegen denselben
// Vertrag wie Backend, Website und die alten Apps
// (docker/backend-events/test/fixtures/arbeitsplan.json).

class Arbeitsplan {
  const Arbeitsplan({
    required this.verein,
    required this.titel,
    required this.anlass,
    required this.bereiche,
    required this.tage,
  });

  final String verein;
  final String titel;
  final String anlass;
  final List<String> bereiche;
  final List<ArbeitsplanTag> tage;

  factory Arbeitsplan.fromJson(Map<String, dynamic> json) => Arbeitsplan(
        verein: json['verein'] as String? ?? '',
        titel: json['titel'] as String? ?? '',
        anlass: json['anlass'] as String? ?? '',
        bereiche: [for (final b in json['bereiche'] as List? ?? []) b as String],
        tage: [
          for (final t in json['tage'] as List? ?? [])
            ArbeitsplanTag.fromJson(t as Map<String, dynamic>),
        ],
      );
}

class ArbeitsplanTag {
  const ArbeitsplanTag({this.datum, required this.bezeichnung, required this.zeilen});

  final String? datum;
  final String bezeichnung;
  final List<ArbeitsplanZeile> zeilen;

  factory ArbeitsplanTag.fromJson(Map<String, dynamic> json) => ArbeitsplanTag(
        datum: json['datum'] as String?,
        bezeichnung: json['bezeichnung'] as String? ?? json['datum'] as String? ?? '',
        zeilen: [
          for (final z in json['zeilen'] as List? ?? [])
            ArbeitsplanZeile.fromJson(z as Map<String, dynamic>),
        ],
      );
}

class ArbeitsplanZeile {
  const ArbeitsplanZeile({required this.zeit, required this.zellen});

  /// "HH:MM-HH:MM"
  final String zeit;
  final List<ArbeitsplanZelle?> zellen;

  factory ArbeitsplanZeile.fromJson(Map<String, dynamic> json) => ArbeitsplanZeile(
        zeit: json['zeit'] as String? ?? '',
        zellen: [
          for (final z in json['zellen'] as List? ?? [])
            z == null ? null : ArbeitsplanZelle.fromJson(z as Map<String, dynamic>),
        ],
      );

  /// Zeit fuer die Anzeige: "10:00–14:00 Uhr".
  String get zeitText => '${zeit.replaceFirst('-', '–')} Uhr';

  /// Inhalt der Karte auf dem Handy: nur Bereiche, die in diesem Zeitfenster
  /// eine Schicht haben, in der Reihenfolge der Bereiche.
  List<KartenEintrag> karte(List<String> bereiche) => [
        for (var i = 0; i < bereiche.length && i < zellen.length; i++)
          if (zellen[i] case final zelle?)
            KartenEintrag(bereich: bereiche[i], besetzt: zelle.besetzt, offen: zelle.offen),
      ];
}

class ArbeitsplanZelle {
  const ArbeitsplanZelle({required this.besetzt, required this.gebraucht, required this.offen});

  final List<String> besetzt;
  final int gebraucht;
  final int offen;

  factory ArbeitsplanZelle.fromJson(Map<String, dynamic> json) => ArbeitsplanZelle(
        besetzt: [for (final n in json['besetzt'] as List? ?? []) n as String],
        gebraucht: (json['gebraucht'] as num?)?.toInt() ?? 0,
        // negativ waere ein Backend-Fehler; nie "-1 Plaetze frei" anzeigen
        offen: ((json['offen'] as num?)?.toInt() ?? 0).clamp(0, 1 << 30),
      );
}

/// Ein Bereich auf der Karte eines Zeitfensters.
class KartenEintrag {
  const KartenEintrag({required this.bereich, required this.besetzt, required this.offen});

  final String bereich;
  final List<String> besetzt;
  final int offen;

  /// Namen mit Komma, leer heisst "noch niemand".
  String get namenText => besetzt.isEmpty ? 'noch niemand' : besetzt.join(', ');

  /// "1 Platz frei" / "3 Plätze frei", oder null wenn voll.
  String? get freiText => switch (offen) {
        <= 0 => null,
        1 => '1 Platz frei',
        _ => '$offen Plätze frei',
      };
}
