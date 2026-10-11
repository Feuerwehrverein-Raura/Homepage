// Die Zugaenge eines Mitglieds: `GET members/me/accesses`
// (backend-members, Schluessel in camelCase).
//
// Das Backend liefert ausserdem `organizerEvents` und `smbCredentials`; beide
// zeigten die alten Apps nicht an, deshalb werden sie hier (noch) nicht
// gelesen.

import 'json_lesen.dart';

class Zugaenge {
  const Zugaenge({
    this.funktionsMails = const [],
    this.cloudOrdner = const [],
    this.systeme = const [],
    this.geteilteKonten = const [],
  });

  factory Zugaenge.ausJson(Object? json) {
    final m = json is Map ? json : const {};
    return Zugaenge(
      funktionsMails: jsonListe(m['functionEmails'], FunktionsMail.ausJson),
      cloudOrdner: jsonListe(m['nextcloudFolders'], CloudOrdner.ausJson),
      systeme: jsonListe(m['systemAccesses'], SystemZugang.ausJson),
      geteilteKonten: jsonListe(m['serviceAccounts'], GeteiltesKonto.ausJson),
    );
  }

  final List<FunktionsMail> funktionsMails;
  final List<CloudOrdner> cloudOrdner;
  final List<SystemZugang> systeme;
  final List<GeteiltesKonto> geteilteKonten;

  bool get leer =>
      funktionsMails.isEmpty && cloudOrdner.isEmpty && systeme.isEmpty && geteilteKonten.isEmpty;
}

/// Postfach einer Vereinsfunktion (z.B. kassier@fwv-raura.ch).
class FunktionsMail {
  const FunktionsMail({
    required this.funktion,
    required this.email,
    this.passwort,
    this.passwortGeaendert,
    this.server,
    this.imapPort,
    this.smtpPort,
    this.webmail,
  });

  factory FunktionsMail.ausJson(Map<String, dynamic> m) => FunktionsMail(
    funktion: jsonText(m['function']) ?? '',
    email: jsonText(m['email']) ?? '',
    passwort: jsonText(m['password']),
    passwortGeaendert: jsonZeitpunkt(m['passwordUpdatedAt']),
    server: jsonText(m['server']),
    imapPort: jsonZahl(m['imapPort']),
    smtpPort: jsonZahl(m['smtpPort']),
    webmail: jsonText(m['webmail']),
  );

  final String funktion;
  final String email;

  /// Das hinterlegte Passwort (geteiltes Postfach), oder null.
  final String? passwort;
  final DateTime? passwortGeaendert;
  final String? server;
  final int? imapPort;
  final int? smtpPort;
  final String? webmail;
}

/// Gruppenordner in der Nextcloud.
class CloudOrdner {
  const CloudOrdner({required this.name, this.id, this.gruppen = const []});

  /// Das Backend nennt den Ordner `name` (aus `mount_point`). Die alte
  /// Android-App las `mount_point` und zeigte darum nie einen Namen —
  /// beides wird angenommen.
  factory CloudOrdner.ausJson(Map<String, dynamic> m) => CloudOrdner(
    id: jsonZahl(m['id']),
    name: jsonText(m['name']) ?? jsonText(m['mount_point']) ?? 'Ordner',
    gruppen: m['groups'] is List ? [for (final g in m['groups'] as List) ?jsonText(g)] : const [],
  );

  final int? id;
  final String name;
  final List<String> gruppen;
}

/// Ein System, auf das das Mitglied Zugriff hat (Website, Vorstand-Portal...).
class SystemZugang {
  const SystemZugang({required this.system, this.url, this.rolle, this.aktiv = true});

  factory SystemZugang.ausJson(Map<String, dynamic> m) => SystemZugang(
    system: jsonText(m['system']) ?? '',
    url: jsonText(m['url']),
    rolle: jsonText(m['access']),
    aktiv: jsonWahr(m['enabled']) ?? true,
  );

  final String system;
  final String? url;

  /// Art des Zugriffs ("Mitglied", "Vorstand", ...).
  final String? rolle;
  final bool aktiv;
}

/// Gemeinsam genutztes Konto (z.B. Kasse und Kueche).
class GeteiltesKonto {
  const GeteiltesKonto({
    this.kontoName,
    this.benutzername,
    this.anzeigename,
    this.passwort,
    this.beschreibung,
    this.wechselTage,
    this.naechsterWechsel,
  });

  factory GeteiltesKonto.ausJson(Map<String, dynamic> m) => GeteiltesKonto(
    kontoName: jsonText(m['accountName']),
    benutzername: jsonText(m['username']),
    anzeigename: jsonText(m['displayName']),
    passwort: jsonText(m['password']),
    beschreibung: jsonText(m['description']),
    wechselTage: jsonZahl(m['rotationDays']),
    naechsterWechsel: jsonZeitpunkt(m['nextRotation']),
  );

  final String? kontoName;
  final String? benutzername;
  final String? anzeigename;
  final String? passwort;
  final String? beschreibung;
  final int? wechselTage;
  final DateTime? naechsterWechsel;

  String get titel => anzeigename ?? kontoName ?? benutzername ?? 'Konto';
}

/// Mindestlaenge fuer ein neues Passwort einer Funktions-Mail. Das Backend
/// verlangt nur 8; die App verlangt wie die alte iOS-App 12.
const funktionsMailPasswortMindestlaenge = 12;
