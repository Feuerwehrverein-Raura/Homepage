// Geraete und App-Versionen der Mitglieder ("Welcher Tester hat welche
// Version?"): GET /vorstand/app-geraete bei api-members
// (docker/backend-members/src/app-geraete.js). Die Mitglieder-App meldet sich
// einmal pro Start; Push-Tokens ohne Meldung stammen von Apps vor 1.0.24.
//
// Die neuste Version bestimmt das Backend (env APP_NEUSTE_VERSION, sonst die
// hoechste Meldung eines Android-Geraets) und markiert veraltete Geraete
// selbst - die App zeigt nur an.

import 'package:fwv_core/fwv_core.dart';

import '../zeit.dart';

/// Ein Geraet eines Mitglieds. [ohneMeldung]: nur ein Push-Token bekannt,
/// Version unbekannt (App vor 1.0.24).
class AppGeraet {
  const AppGeraet({
    required this.mitgliedId,
    required this.name,
    this.plattform,
    this.quelle,
    this.version,
    this.build,
    this.os,
    this.modell,
    this.zuletzt,
    this.veraltet,
    this.ohneMeldung = false,
  });

  factory AppGeraet.ausJson(Map<String, dynamic> j) => AppGeraet(
    mitgliedId: jsonText(j['member_id']) ?? '',
    name: jsonText(j['name']) ?? 'Unbekannt',
    plattform: jsonText(j['plattform']),
    quelle: jsonText(j['quelle']),
    version: jsonText(j['app_version']),
    build: jsonZahl(j['build_nummer']),
    os: jsonText(j['os_version']),
    modell: jsonText(j['geraet_modell']),
    zuletzt: utcZeitpunkt(j['zuletzt']),
    veraltet: jsonWahr(j['veraltet']),
  );

  factory AppGeraet.ohneMeldungAusJson(Map<String, dynamic> j) => AppGeraet(
    mitgliedId: jsonText(j['member_id']) ?? '',
    name: jsonText(j['name']) ?? 'Unbekannt',
    plattform: jsonText(j['plattform']),
    zuletzt: utcZeitpunkt(j['zuletzt']),
    ohneMeldung: true,
  );

  final String mitgliedId;
  final String name;
  final String? plattform;
  final String? quelle;
  final String? version;
  final int? build;
  final String? os;
  final String? modell;
  final DateTime? zuletzt;

  /// Vom Backend: true = aelter als die neuste Version; null = unbekannt.
  final bool? veraltet;
  final bool ohneMeldung;

  /// Gilt als veraltet: vom Backend markiert, oder gar keine Meldung (vor
  /// 1.0.24 - sicher alt).
  bool get istVeraltet => ohneMeldung || veraltet == true;

  /// "Android · Play", "Android · APK", "Browser", "Computer · Windows",
  /// "iPhone/iPad".
  String get herkunftText {
    final p = switch (plattform) {
      'android' => 'Android',
      'ios' => 'iPhone/iPad',
      'web' => 'Browser',
      'windows' => 'Computer · Windows',
      'macos' => 'Computer · macOS',
      'linux' => 'Computer · Linux',
      final String andere => andere,
      null => 'Unbekannt',
    };
    final q = switch (quelle) {
      'play' => 'Play',
      'apk' => 'APK',
      _ => null,
    };
    return q == null ? p : '$p · $q';
  }

  /// "1.0.23" bzw. "Version unbekannt".
  String get versionText => ohneMeldung
      ? 'Version unbekannt (vor 1.0.24)'
      : version ?? (build != null ? 'Build $build' : 'Version unbekannt');
}

/// Antwort von GET /vorstand/app-geraete.
class AppGeraeteStand {
  const AppGeraeteStand({
    required this.geraete,
    required this.ohneMeldung,
    this.neusteVersion,
    this.neusteBuild,
    this.herkunft,
  });

  factory AppGeraeteStand.ausJson(Object? json) {
    final j = json is Map ? json.cast<String, dynamic>() : const <String, dynamic>{};
    final neuste = j['neuste'] is Map
        ? (j['neuste'] as Map).cast<String, dynamic>()
        : const <String, dynamic>{};
    return AppGeraeteStand(
      geraete: jsonListe(j['geraete'], AppGeraet.ausJson),
      ohneMeldung: jsonListe(j['ohne_meldung'], AppGeraet.ohneMeldungAusJson),
      neusteVersion: jsonText(neuste['version']),
      neusteBuild: jsonZahl(neuste['build_nummer']),
      herkunft: jsonText(neuste['herkunft']),
    );
  }

  final List<AppGeraet> geraete;
  final List<AppGeraet> ohneMeldung;
  final String? neusteVersion;
  final int? neusteBuild;

  /// "env" (fest eingestellt) oder "geraete" (hoechste Android-Meldung).
  final String? herkunft;

  /// Alle zusammen, die ohne Meldung am Schluss.
  List<AppGeraet> get alle => [...geraete, ...ohneMeldung];
}

/// Eine Gruppe in der Liste: alle Geraete mit derselben Version.
typedef VersionsGruppe = ({String titel, int? build, bool veraltet, List<AppGeraet> geraete});

/// Gruppiert nach Version, neuste zuerst; "Version unbekannt" am Schluss.
/// [nurVeraltete] und [suche] (Name, Modell, Version) filtern vorher.
List<VersionsGruppe> nachVersion(
  AppGeraeteStand stand, {
  bool nurVeraltete = false,
  String suche = '',
}) {
  final s = suche.trim().toLowerCase();
  bool passt(AppGeraet g) =>
      (!nurVeraltete || g.istVeraltet) &&
      (s.isEmpty ||
          g.name.toLowerCase().contains(s) ||
          (g.modell?.toLowerCase().contains(s) ?? false) ||
          (g.version?.contains(s) ?? false) ||
          g.herkunftText.toLowerCase().contains(s));

  final gruppen = <String, List<AppGeraet>>{};
  for (final g in stand.alle.where(passt)) {
    gruppen.putIfAbsent(g.versionText, () => []).add(g);
  }
  final liste = [
    for (final MapEntry(key: titel, value: geraete) in gruppen.entries)
      (
        titel: titel,
        build: geraete.map((g) => g.build).whereType<int>().fold<int?>(null, _max),
        veraltet: geraete.any((g) => g.istVeraltet),
        geraete: geraete..sort(_nachZeit),
      ),
  ];
  liste.sort((a, b) {
    final ua = a.geraete.first.ohneMeldung, ub = b.geraete.first.ohneMeldung;
    if (ua != ub) return ua ? 1 : -1;
    return (b.build ?? -1).compareTo(a.build ?? -1);
  });
  return liste;
}

int? _max(int? a, int b) => a == null || b > a ? b : a;

/// Zuletzt gesehen zuerst, dann nach Name.
int _nachZeit(AppGeraet a, AppGeraet b) {
  final za = a.zuletzt, zb = b.zuletzt;
  if (za != null && zb != null && za != zb) return zb.compareTo(za);
  if ((za == null) != (zb == null)) return za == null ? 1 : -1;
  return a.name.compareTo(b.name);
}

class AppGeraeteDienst {
  const AppGeraeteDienst(this.api);

  final ApiClient api;

  Future<AppGeraeteStand> laden() async =>
      AppGeraeteStand.ausJson(await api.get('vorstand/app-geraete'));
}
