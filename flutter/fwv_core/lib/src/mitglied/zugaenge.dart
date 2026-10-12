// Die Zugaenge eines Mitglieds: `GET members/me/accesses`
// (backend-members, Schluessel in camelCase).
//
// Das Backend liefert ausserdem `organizerEvents`; das deckt in der App der
// Reiter Organisator ab. `smbCredentials` (Netzlaufwerk) wird gelesen wie im
// Mitgliederbereich der Webseite.

import 'json_lesen.dart';

class Zugaenge {
  const Zugaenge({
    this.funktionsMails = const [],
    this.cloudOrdner = const [],
    this.systeme = const [],
    this.geteilteKonten = const [],
    this.netzlaufwerk,
  });

  factory Zugaenge.ausJson(Object? json) {
    final m = json is Map ? json : const {};
    return Zugaenge(
      funktionsMails: jsonListe(m['functionEmails'], FunktionsMail.ausJson),
      cloudOrdner: jsonListe(m['nextcloudFolders'], CloudOrdner.ausJson),
      systeme: jsonListe(m['systemAccesses'], SystemZugang.ausJson),
      geteilteKonten: jsonListe(m['serviceAccounts'], GeteiltesKonto.ausJson),
      netzlaufwerk: m['smbCredentials'] is Map
          ? Netzlaufwerk.ausJson(Map<String, dynamic>.from(m['smbCredentials'] as Map))
          : null,
    );
  }

  final List<FunktionsMail> funktionsMails;
  final List<CloudOrdner> cloudOrdner;
  final List<SystemZugang> systeme;
  final List<GeteiltesKonto> geteilteKonten;

  /// Zugang zum Vereins-Netzlaufwerk (SMB) - je nach Rolle Vorstand,
  /// Social Media oder Mitglied; null, wenn das Backend keinen liefert.
  final Netzlaufwerk? netzlaufwerk;

  bool get leer =>
      funktionsMails.isEmpty &&
      cloudOrdner.isEmpty &&
      systeme.isEmpty &&
      geteilteKonten.isEmpty &&
      netzlaufwerk == null;
}

/// `smbCredentials`: Server, Benutzer, Passwort, Freigaben. Das Passwort
/// wechselt monatlich (am Ersten, nach `updatedAt`).
class Netzlaufwerk {
  const Netzlaufwerk({
    this.server,
    this.benutzer,
    this.passwort,
    this.freigaben = const [],
    this.geaendert,
    this.adresse,
  });

  factory Netzlaufwerk.ausJson(Map<String, dynamic> m) => Netzlaufwerk(
    server: jsonText(m['server']),
    benutzer: jsonText(m['user']),
    passwort: jsonText(m['password']),
    // Freigaben als Namen oder als Objekte mit `name` - beides lesen.
    freigaben: m['shares'] is List
        ? [
            for (final f in m['shares'] as List)
              if (f is String && f.trim().isNotEmpty)
                f.trim()
              else if (f is Map && jsonText(f['name']) != null)
                jsonText(f['name'])!,
          ]
        : const [],
    geaendert: jsonZeitpunkt(m['updatedAt']),
    adresse: jsonText(m['connectUrl']),
  );

  final String? server;
  final String? benutzer;
  final String? passwort;
  final List<String> freigaben;
  final DateTime? geaendert;

  /// `smb://smb.fwv-raura.ch/` - zum Verbinden im Dateimanager.
  final String? adresse;

  /// Erster des Folgemonats nach der letzten Aenderung.
  DateTime? get naechsterWechsel {
    final g = geaendert;
    if (g == null) return null;
    final l = g.toLocal();
    return DateTime(l.year, l.month + 1, 1);
  }
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
