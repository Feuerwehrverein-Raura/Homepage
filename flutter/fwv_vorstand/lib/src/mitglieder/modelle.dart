// Mitglieder aus Sicht des Vorstands: die ganze Zeile aus `members`
// (GET /members, GET /members/:id liefern `SELECT *`, snake_case), die
// Kennzahlen, das Formular und die Cloud-Gruppen.
//
// Feste Listen (Status, Funktionen, Feuerwehr-Zugehoerigkeit) wie in
// docker/frontend-website/vorstand.html - das Backend kennt keine Route
// dafuer (GET /funktionen liefert Personen, keine Auswahl).

import 'package:fwv_core/fwv_core.dart';

/// Status-Werte zur Auswahl, wie im Formular von vorstand.html. Dazu kommen
/// die Werte, die das Backend selbst setzt bzw. ausnimmt (Austritt, Tod:
/// OHNE_ZUGANG in PUT /members/:id).
const mitgliedStatusWerte = [
  'Aktivmitglied',
  'Aufnahme pendent',
  'Ehrenmitglied',
  'Testkonto',
  'Ausgetreten',
  'Verstorben',
];

/// Status, nach denen die Liste filtern kann (Filter in vorstand.html).
const mitgliedStatusFilter = ['Aktivmitglied', 'Aufnahme pendent', 'Ehrenmitglied', 'Testkonto'];

/// Funktionen mit Erklaerung, wie die Kaestchen in vorstand.html.
const mitgliedFunktionen = <(String, String)>[
  ('Admin', 'Volle Rechte'),
  ('Präsident', 'Vorstand'),
  ('Aktuar', 'Vorstand'),
  ('Kassier', 'Vorstand'),
  ('Materialwart', 'Vorstand'),
  ('Beisitzer', 'Vorstand'),
  ('Revisor', ''),
  ('Social Media', ''),
];

/// Vorstandsfunktionen (VORSTAND_ROLES in vorstand.html). Revisor schliesst
/// sie aus - wer prueft, sitzt nicht im Vorstand.
const vorstandFunktionen = ['Präsident', 'Aktuar', 'Kassier', 'Materialwart', 'Beisitzer'];

const revisor = 'Revisor';

/// Feuerwehr-Zugehoerigkeit: Wert fuers Backend und Text.
const feuerwehrZugehoerigkeiten = <(String, String)>[
  ('keine', 'Keine'),
  ('feuerwehr_raurica', 'Feuerwehr Raurica'),
  ('externe_feuerwehr', 'Externe Feuerwehr'),
  ('anderes', 'Anderes'),
];

/// Anrede wie vorstand.html.
const mitgliedAnreden = ['Herr', 'Frau'];

/// Geschlecht: Wert fuers Backend und Text.
const mitgliedGeschlechter = <(String, String)>[('M', 'Männlich'), ('W', 'Weiblich')];

/// Text zu einem Wert aus einer der Listen oben, sonst der Wert selbst.
String textZu(List<(String, String)> liste, String wert) =>
    liste.firstWhere((e) => e.$1 == wert, orElse: () => (wert, wert)).$2;

/// Funktionen aus dem Text des Backends ("Kassier, Admin").
List<String> funktionenAus(String? text) => [
  for (final f in (text ?? '').split(','))
    if (f.trim().isNotEmpty && f.trim() != '-') f.trim(),
];

/// Funktionen in der Reihenfolge der Auswahl; Unbekanntes hinten. So bleibt
/// der Text stabil, egal in welcher Reihenfolge man tippt.
List<String> funktionenSortiert(List<String> funktionen) {
  final reihenfolge = [for (final (f, _) in mitgliedFunktionen) f];
  int stelle(String f) {
    final i = reihenfolge.indexOf(f);
    return i < 0 ? reihenfolge.length : i;
  }

  final liste = [...funktionen];
  // Stabil sortieren (List.sort ist es nicht garantiert).
  final mitIndex = liste.indexed.toList()
    ..sort((a, b) {
      final c = stelle(a.$2).compareTo(stelle(b.$2));
      return c != 0 ? c : a.$1.compareTo(b.$1);
    });
  return [for (final (_, f) in mitIndex) f];
}

/// Wendet die Revisor-Regel an, wenn [funktion] dazukommt: Revisor
/// entfernt alle Vorstandsfunktionen, eine Vorstandsfunktion den Revisor
/// (wie vorstand.html).
List<String> funktionUmschalten(List<String> bisher, String funktion, bool an) {
  final neu = [
    for (final f in bisher)
      if (f != funktion) f,
  ];
  if (an) {
    if (funktion == revisor) neu.removeWhere(vorstandFunktionen.contains);
    if (vorstandFunktionen.contains(funktion)) neu.remove(revisor);
    neu.add(funktion);
  }
  return funktionenSortiert(neu);
}

class VorstandMitglied {
  const VorstandMitglied({
    required this.id,
    this.anrede,
    this.geschlecht,
    this.vorname,
    this.nachname,
    this.geburtstag,
    this.email,
    this.versandEmail,
    this.telefon,
    this.mobile,
    this.strasse,
    this.adresszusatz,
    this.plz,
    this.ort,
    this.status,
    this.feuerwehrZugehoerigkeit,
    this.funktion,
    this.eintrittsdatum,
    this.zustellungEmail = true,
    this.zustellungPost = false,
    this.bemerkungen,
    this.foto,
    this.benutzername,
    this.authentikUserId,
  });

  factory VorstandMitglied.ausJson(Map<String, dynamic> m) => VorstandMitglied(
    id: jsonText(m['id']) ?? '',
    anrede: jsonText(m['anrede']),
    geschlecht: jsonText(m['geschlecht']),
    vorname: jsonText(m['vorname']),
    nachname: jsonText(m['nachname']),
    geburtstag: jsonDatum(m['geburtstag']),
    email: jsonText(m['email']),
    versandEmail: jsonText(m['versand_email']),
    telefon: jsonText(m['telefon']),
    mobile: jsonText(m['mobile']),
    strasse: jsonText(m['strasse']),
    adresszusatz: jsonText(m['adresszusatz']),
    plz: jsonText(m['plz']),
    ort: jsonText(m['ort']),
    status: jsonText(m['status']),
    feuerwehrZugehoerigkeit: jsonText(m['feuerwehr_zugehoerigkeit']),
    funktion: jsonText(m['funktion']),
    eintrittsdatum: jsonDatum(m['eintrittsdatum']),
    // Wie vorstand.html: E-Mail gilt, solange sie nicht ausdruecklich aus ist.
    zustellungEmail: jsonWahr(m['zustellung_email']) ?? true,
    zustellungPost: jsonWahr(m['zustellung_post']) ?? false,
    bemerkungen: jsonText(m['bemerkungen']),
    foto: jsonText(m['foto']),
    benutzername: jsonText(m['benutzername']),
    authentikUserId: jsonText(m['authentik_user_id']),
  );

  final String id;
  final String? anrede;

  /// `M` oder `W`.
  final String? geschlecht;
  final String? vorname;
  final String? nachname;
  final DateTime? geburtstag;
  final String? email;

  /// Abweichende Adresse fuer den Versand (Rundschreiben).
  final String? versandEmail;
  final String? telefon;
  final String? mobile;
  final String? strasse;
  final String? adresszusatz;
  final String? plz;
  final String? ort;
  final String? status;

  /// `keine`, `feuerwehr_raurica`, `externe_feuerwehr`, `anderes`.
  final String? feuerwehrZugehoerigkeit;

  /// Mehrere durch Komma ("Kassier, Admin").
  final String? funktion;
  final DateTime? eintrittsdatum;
  final bool zustellungEmail;
  final bool zustellungPost;
  final String? bemerkungen;

  /// Meist relativ (`/uploads/photo-123.jpg`).
  final String? foto;

  /// Anmeldename (geht anstelle der E-Mail-Adresse).
  final String? benutzername;

  /// Login-Konto (Authentik). Ohne gibt es kein Passwort und keine Gruppen.
  final String? authentikUserId;

  bool get hatKonto => authentikUserId != null;

  List<String> get funktionen => funktionenAus(funktion);

  String get name {
    final n = [vorname, nachname].whereType<String>().join(' ').trim();
    return n.isNotEmpty ? n : (email ?? 'Ohne Namen');
  }

  /// Fuer das Rundbild ohne Foto ("EM").
  String get initialen {
    final teile = [vorname, nachname].whereType<String>().where((t) => t.isNotEmpty);
    final i = teile.map((t) => String.fromCharCode(t.runes.first).toUpperCase()).join();
    return i.isEmpty ? '?' : i;
  }

  /// Die Nummer zum Anrufen: Mobile vor Festnetz.
  String? get nummer => mobile ?? telefon;

  /// Adresse in Zeilen; leer, wenn nichts bekannt ist.
  List<String> get adresszeilen {
    final ortZeile = [plz, ort].whereType<String>().join(' ').trim();
    return [?strasse, ?adresszusatz, if (ortZeile.isNotEmpty) ortZeile];
  }

  Uri? fotoAdresse(Uri apiBasis) => profilFotoAdresse(foto, apiBasis);
}

/// GET /members/stats/overview. Die Zahlen kommen als Text (COUNT in
/// Postgres ist bigint).
class MitgliederKennzahlen {
  const MitgliederKennzahlen({
    required this.gesamt,
    required this.aktiv,
    required this.pendent,
    required this.ehren,
  });

  factory MitgliederKennzahlen.ausJson(Object? json) {
    final m = json is Map ? json : const {};
    return MitgliederKennzahlen(
      gesamt: jsonZahl(m['total']) ?? 0,
      aktiv: jsonZahl(m['aktiv']) ?? 0,
      pendent: jsonZahl(m['pendent']) ?? 0,
      ehren: jsonZahl(m['ehren']) ?? 0,
    );
  }

  final int gesamt;
  final int aktiv;
  final int pendent;
  final int ehren;
}

/// Die drei Cloud-Gruppen (Authentik) eines Mitglieds.
class CloudGruppen {
  const CloudGruppen({
    required this.hatKonto,
    this.nextcloudAdmin = false,
    this.vorstandGruppe = false,
    this.socialMedia = false,
  });

  final bool hatKonto;
  final bool nextcloudAdmin;
  final bool vorstandGruppe;
  final bool socialMedia;

  /// Wie die Gruppen nach den Funktionen sein sollen (syncCloudPermissions
  /// in vorstand.html): Admin -> Nextcloud-Admin, Vorstandsfunktion ->
  /// Vorstand-Gruppe, Social Media -> Social-Media-Gruppe.
  factory CloudGruppen.nachFunktion(List<String> funktionen) => CloudGruppen(
    hatKonto: true,
    nextcloudAdmin: funktionen.contains('Admin'),
    vorstandGruppe: funktionen.any(vorstandFunktionen.contains),
    socialMedia: funktionen.contains('Social Media'),
  );

  bool gleichWie(CloudGruppen o) =>
      nextcloudAdmin == o.nextcloudAdmin &&
      vorstandGruppe == o.vorstandGruppe &&
      socialMedia == o.socialMedia;
}

/// Das Formular "Mitglied anlegen/bearbeiten". [alsJson] ist der Body fuer
/// POST /members; [aenderungen] nur die geaenderten Felder fuer
/// PUT /members/:id (das Backend setzt genau die Felder, die kommen).
class MitgliedEntwurf {
  const MitgliedEntwurf({
    this.anrede,
    this.geschlecht,
    this.vorname = '',
    this.nachname = '',
    this.geburtstag,
    this.email,
    this.versandEmail,
    this.telefon,
    this.mobile,
    this.strasse,
    this.adresszusatz,
    this.plz,
    this.ort,
    this.status = 'Aktivmitglied',
    this.feuerwehrZugehoerigkeit = 'keine',
    this.funktionen = const [],
    this.eintrittsdatum,
    this.zustellungEmail = true,
    this.zustellungPost = false,
    this.bemerkungen,
  });

  factory MitgliedEntwurf.aus(VorstandMitglied m) => MitgliedEntwurf(
    anrede: m.anrede,
    geschlecht: m.geschlecht,
    vorname: m.vorname ?? '',
    nachname: m.nachname ?? '',
    geburtstag: m.geburtstag,
    email: m.email,
    versandEmail: m.versandEmail,
    telefon: m.telefon,
    mobile: m.mobile,
    strasse: m.strasse,
    adresszusatz: m.adresszusatz,
    plz: m.plz,
    ort: m.ort,
    status: m.status ?? 'Aktivmitglied',
    feuerwehrZugehoerigkeit: m.feuerwehrZugehoerigkeit ?? 'keine',
    funktionen: funktionenSortiert(m.funktionen),
    eintrittsdatum: m.eintrittsdatum,
    zustellungEmail: m.zustellungEmail,
    zustellungPost: m.zustellungPost,
    bemerkungen: m.bemerkungen,
  );

  final String? anrede;
  final String? geschlecht;
  final String vorname;
  final String nachname;
  final DateTime? geburtstag;
  final String? email;
  final String? versandEmail;
  final String? telefon;
  final String? mobile;
  final String? strasse;
  final String? adresszusatz;
  final String? plz;
  final String? ort;
  final String status;
  final String feuerwehrZugehoerigkeit;
  final List<String> funktionen;
  final DateTime? eintrittsdatum;
  final bool zustellungEmail;
  final bool zustellungPost;
  final String? bemerkungen;

  /// Alle Felder; Leeres als null, damit man einen Eintrag auch loeschen
  /// kann.
  Map<String, Object?> alsJson() {
    String? t(String? s) => (s == null || s.trim().isEmpty) ? null : s.trim();
    return {
      'anrede': t(anrede),
      'geschlecht': t(geschlecht),
      'vorname': vorname.trim(),
      'nachname': nachname.trim(),
      'geburtstag': geburtstag == null ? null : isoDatum(geburtstag!),
      'email': t(email),
      'versand_email': t(versandEmail),
      'telefon': t(telefon),
      'mobile': t(mobile),
      'strasse': t(strasse),
      'adresszusatz': t(adresszusatz),
      'plz': t(plz),
      'ort': t(ort),
      'status': status,
      'feuerwehr_zugehoerigkeit': feuerwehrZugehoerigkeit,
      'funktion': funktionen.isEmpty ? null : funktionen.join(', '),
      'eintrittsdatum': eintrittsdatum == null ? null : isoDatum(eintrittsdatum!),
      'zustellung_email': zustellungEmail,
      'zustellung_post': zustellungPost,
      'bemerkungen': t(bemerkungen),
    };
  }

  /// Nur was sich gegenueber [original] geaendert hat. Das Backend
  /// verschickt dem Mitglied eine Mail mit den Aenderungen und gleicht
  /// Login, Gruppen und Verteiler nur bei den betroffenen Feldern ab.
  Map<String, Object?> aenderungen(MitgliedEntwurf original) {
    final alt = original.alsJson();
    return {
      for (final MapEntry(:key, :value) in alsJson().entries)
        if (alt[key] != value) key: value,
    };
  }
}

/// Was POST /members/:id/reset-password zurueckgibt.
class TemporaeresPasswort {
  const TemporaeresPasswort({required this.passwort, this.meldung});

  final String passwort;
  final String? meldung;
}
