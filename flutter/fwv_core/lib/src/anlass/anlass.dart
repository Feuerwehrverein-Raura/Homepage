// Anlass, wie ihn `GET events` und `GET events/:id` liefern — mit den
// anzeigefertigen `app`-Bloecken (docker/backend-events/src/app-ansicht.js).
//
// Die App rechnet nichts: Datum, Uhrzeit, ob und warum man sich anmelden
// kann, Belegung der Schichten — alles kommt als Text vom Backend. Gelesen
// werden nur die Felder aus dem Vertrag (FELDER in
// docker/backend-events/test/app-vertrag.test.js) und die paar Felder, die
// nur die Detailansicht braucht (Untertitel, Beschreibung, Kosten,
// Organisator). Fehlende Schluessel lassen Felder leer, statt abzustuerzen.

import '../mitglied/json_lesen.dart';

class Anlass {
  const Anlass({
    required this.id,
    this.slug,
    required this.titel,
    this.untertitel,
    this.kategorie,
    this.status,
    this.ort,
    this.beschreibung,
    this.kosten,
    this.organisator,
    this.beginn,
    this.ende,
    this.anmeldeschluss,
    this.maxTeilnehmer,
    this.anmeldungVerlangt = false,
    this.menueOptionen = const [],
    this.pdfDateiname,
    this.app = const AnlassApp(),
    this.schichten = const [],
  });

  factory Anlass.ausJson(Object? json) {
    final m = json is Map ? json : const {};
    return Anlass(
      id: jsonText(m['id']) ?? '',
      slug: jsonText(m['slug']),
      titel: jsonText(m['title']) ?? '',
      untertitel: jsonText(m['subtitle']),
      kategorie: jsonText(m['category']),
      status: jsonText(m['status']),
      ort: jsonText(m['location']),
      beschreibung: jsonText(m['description']),
      kosten: jsonText(m['cost']),
      organisator: jsonText(m['organizer_name']),
      beginn: jsonText(m['start_date']),
      ende: jsonText(m['end_date']),
      anmeldeschluss: jsonText(m['registration_deadline']),
      maxTeilnehmer: jsonZahl(m['max_participants']),
      anmeldungVerlangt: jsonWahr(m['registration_required']) ?? false,
      menueOptionen: [
        if (m['meal_options'] case final List l)
          for (final e in l) ?jsonText(e),
      ],
      pdfDateiname: jsonText(m['pdf_filename']),
      app: AnlassApp.ausJson(m['app']),
      schichten: jsonListe(m['shifts'], Schicht.ausJson),
    );
  }

  final String id;
  final String? slug;
  final String titel;
  final String? untertitel;
  final String? kategorie;
  final String? status;
  final String? ort;
  final String? beschreibung;
  final String? kosten;

  /// Name des Organisators (nur Name; Kontaktdaten gibt das Backend
  /// oeffentlich nicht heraus).
  final String? organisator;

  /// Wie in der Datenbank: Ortszeit Zuerich ohne Zone, "2026-10-17 10:00:00".
  /// Nur fuer den Kalender-Export; angezeigt wird [AnlassApp.datumText].
  final String? beginn;
  final String? ende;
  final String? anmeldeschluss;
  final int? maxTeilnehmer;
  final bool anmeldungVerlangt;

  /// Menüwahl (GV), z.B. ["Fleisch", "Vegi"]; leer ohne Menüwahl.
  final List<String> menueOptionen;

  /// Name des angehängten PDFs (Aushang, `GET events/:id/pdf`), sonst null.
  final String? pdfDateiname;
  final AnlassApp app;
  final List<Schicht> schichten;

  bool get hatSchichten => schichten.isNotEmpty;
}

/// Anzeigefertiger Block eines Anlasses.
class AnlassApp {
  const AnlassApp({
    this.datumText,
    this.zeitText,
    this.datumOffen = false,
    this.gruppe = AnlassGruppe.kommend,
    this.abgesagt = false,
    this.anmeldung = const AnlassAnmeldung(),
    this.kannBearbeiten = false,
  });

  factory AnlassApp.ausJson(Object? json) {
    final m = json is Map ? json : const {};
    final datumOffen = jsonWahr(m['datum_offen']) ?? false;
    return AnlassApp(
      datumText: jsonText(m['datum_text']),
      zeitText: jsonText(m['zeit_text']),
      datumOffen: datumOffen,
      gruppe: switch (jsonText(m['gruppe'])) {
        'datum_offen' => AnlassGruppe.datumOffen,
        'kommend' => AnlassGruppe.kommend,
        _ => datumOffen ? AnlassGruppe.datumOffen : AnlassGruppe.kommend,
      },
      abgesagt: jsonWahr(m['abgesagt']) ?? false,
      anmeldung: AnlassAnmeldung.ausJson(m['anmeldung']),
      kannBearbeiten: jsonWahr(m['kann_bearbeiten']) ?? false,
    );
  }

  /// "Samstag, 17. Oktober 2026" bzw. "Sa 17.10. – So 18.10.2026".
  final String? datumText;

  /// "17:00–22:00 Uhr", "ab 10:00 Uhr" oder null (ganztaegig).
  final String? zeitText;

  /// Idee ohne festes Datum (Status `draft`; `datum_text` ist dann
  /// "Datum noch offen", das gespeicherte Datum nur ein Platzhalter).
  final bool datumOffen;

  /// In welchem Abschnitt der Liste der Anlass steht.
  final AnlassGruppe gruppe;
  final bool abgesagt;
  final AnlassAnmeldung anmeldung;

  /// Ob der Anfragende den Anlass bearbeiten darf (Vorstand, Organisator).
  final bool kannBearbeiten;
}

/// Abschnitt der Anlass-Liste. Das Backend liefert die Ideen ohne Datum
/// nach allen kommenden Anlaessen.
enum AnlassGruppe {
  /// Kommende und laufende Anlaesse.
  kommend,

  /// Ideen – Datum noch offen.
  datumOffen,
}

/// Art der Anmeldung an einem Anlass.
enum AnmeldeArt {
  /// Helfen in Schichten.
  schicht,

  /// Teilnehmen (ohne Schichten).
  teilnahme,
}

class AnlassAnmeldung {
  const AnlassAnmeldung({
    this.moeglich = false,
    this.grund,
    this.art,
    this.pflicht = false,
    this.anmeldeschlussText,
    this.plaetzeFrei,
    this.plaetzeText,
  });

  factory AnlassAnmeldung.ausJson(Object? json) {
    final m = json is Map ? json : const {};
    return AnlassAnmeldung(
      moeglich: jsonWahr(m['moeglich']) ?? false,
      grund: jsonText(m['grund']),
      art: switch (jsonText(m['art'])) {
        'schicht' => AnmeldeArt.schicht,
        'teilnahme' => AnmeldeArt.teilnahme,
        _ => null,
      },
      pflicht: jsonWahr(m['pflicht']) ?? false,
      anmeldeschlussText: jsonText(m['anmeldeschluss_text']),
      plaetzeFrei: jsonZahl(m['plaetze_frei']),
      plaetzeText: jsonText(m['plaetze_text']),
    );
  }

  final bool moeglich;

  /// Warum nicht ("Anmeldeschluss vorbei", "Ausgebucht", ...), sonst null.
  final String? grund;
  final AnmeldeArt? art;
  final bool pflicht;
  final String? anmeldeschlussText;
  final int? plaetzeFrei;

  /// "9 Plätze frei", "voll" — nur bei Teilnahme mit Limit.
  final String? plaetzeText;
}

class Schicht {
  const Schicht({
    required this.id,
    this.name,
    this.beschreibung,
    this.bereich,
    this.datum,
    this.beginn,
    this.ende,
    this.gebraucht,
    this.app = const SchichtApp(),
  });

  factory Schicht.ausJson(Map<String, dynamic> m) => Schicht(
    id: jsonText(m['id']) ?? '',
    name: jsonText(m['name']),
    beschreibung: jsonText(m['description']),
    bereich: jsonText(m['bereich']),
    datum: jsonText(m['date']),
    beginn: jsonText(m['start_time']),
    ende: jsonText(m['end_time']),
    gebraucht: jsonZahl(m['needed']),
    app: SchichtApp.ausJson(m['app']),
  );

  final String id;
  final String? name;
  final String? beschreibung;

  /// Wert wie in der Datenbank ("Kueche"); lesbar steht in [SchichtApp.bereichText].
  final String? bereich;

  /// "2026-10-17"
  final String? datum;
  final String? beginn;
  final String? ende;
  final int? gebraucht;
  final SchichtApp app;
}

class SchichtApp {
  const SchichtApp({
    this.datumText,
    this.zeitText,
    this.bereichText,
    this.belegung = const Belegung(),
    this.waehlbar = false,
  });

  factory SchichtApp.ausJson(Object? json) {
    final m = json is Map ? json : const {};
    return SchichtApp(
      datumText: jsonText(m['datum_text']),
      zeitText: jsonText(m['zeit_text']),
      bereichText: jsonText(m['bereich_text']),
      belegung: Belegung.ausJson(m['belegung']),
      waehlbar: jsonWahr(m['waehlbar']) ?? false,
    );
  }

  final String? datumText;
  final String? zeitText;

  /// Lesbarer Bereich ("Küche"), bei "Allgemein" der Schichtname.
  final String? bereichText;
  final Belegung belegung;

  /// Ob man sich fuer diese Schicht anmelden kann.
  final bool waehlbar;
}

class Belegung {
  const Belegung({
    this.besetzt = 0,
    this.gebraucht = 0,
    this.offen = 0,
    this.angefragt = 0,
    this.text,
  });

  factory Belegung.ausJson(Object? json) {
    final m = json is Map ? json : const {};
    return Belegung(
      besetzt: jsonZahl(m['besetzt']) ?? 0,
      gebraucht: jsonZahl(m['gebraucht']) ?? 0,
      offen: jsonZahl(m['offen']) ?? 0,
      angefragt: jsonZahl(m['angefragt']) ?? 0,
      text: jsonText(m['text']),
    );
  }

  final int besetzt;
  final int gebraucht;
  final int offen;
  final int angefragt;

  /// "1 Platz frei", "3 Plätze frei" oder "voll".
  final String? text;
}
