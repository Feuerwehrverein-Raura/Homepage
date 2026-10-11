// Ausleihe — Modelle so, wie die Inventar-API sie liefert
// (simple-inventory-system/backend/src/ausleihe-routen.ts). Texte,
// Status-Farbe, Zeitraum und erlaubte Aktionen rechnet das Backend
// (`app`-Block); die App zeigt sie nur an. Fehlende Felder, null und
// falsche Typen fuehren nie zum Absturz.

import 'package:fwv_core/fwv_core.dart';

/// Status einer Ausleihe.
enum AusleiheStatus {
  reserviert('reserviert'),
  ausgegeben('ausgegeben'),
  zurueckgegeben('zurueckgegeben'),
  abgesagt('abgesagt');

  const AusleiheStatus(this.wert);

  final String wert;

  static AusleiheStatus aus(Object? wert) =>
      values.firstWhere((s) => s.wert == wert, orElse: () => AusleiheStatus.reserviert);
}

/// Zustand bei der Rueckgabe.
enum Zustand {
  ok('ok', 'In Ordnung'),
  beschaedigt('beschaedigt', 'Beschädigt'),
  fehlt('fehlt', 'Fehlt');

  const Zustand(this.wert, this.text);

  final String wert;
  final String text;

  static Zustand? aus(Object? wert) {
    for (final z in values) {
      if (z.wert == wert) return z;
    }
    return null;
  }
}

/// Listen fuer das Lager (`GET ausleihe?filter=`).
enum AusleiheFilter {
  kommend('kommend', 'Kommend'),
  ausgegeben('ausgegeben', 'Ausgegeben'),
  ueberfaellig('ueberfaellig', 'Überfällig'),
  erledigt('erledigt', 'Erledigt');

  const AusleiheFilter(this.wert, this.text);

  final String wert;
  final String text;
}

/// Ausleihbarer Artikel im Angebot, mit freier Menge fuer den Zeitraum.
class AngebotArtikel {
  const AngebotArtikel({
    required this.id,
    required this.name,
    this.einheit,
    this.kategorie,
    this.beschreibung,
    this.bild,
    this.frei = 0,
    this.freiText,
  });

  factory AngebotArtikel.ausJson(Map<String, dynamic> m) => AngebotArtikel(
    id: jsonZahl(m['id']) ?? 0,
    name: jsonText(m['name']) ?? 'Ohne Namen',
    einheit: jsonText(m['einheit']),
    kategorie: jsonText(m['kategorie']),
    beschreibung: jsonText(m['beschreibung']),
    bild: jsonText(m['image_url']),
    frei: jsonZahl(m['frei']) ?? 0,
    freiText: jsonText(m['frei_text']),
  );

  final int id;
  final String name;
  final String? einheit;
  final String? kategorie;
  final String? beschreibung;
  final String? bild;
  final int frei;

  /// "12 Stück frei" / "Ausgebucht".
  final String? freiText;
}

/// Eine Zeile im Inhalt einer Kiste (im Angebot, und in der Ausleihe mit
/// Rueckgabe). [id] gibt es erst, wenn der Inhalt beim Ausgeben
/// festgehalten wurde.
class KistenZeile {
  const KistenZeile({
    this.id,
    this.artikelId,
    required this.name,
    this.einheit,
    this.menge = 0,
    this.mengeText,
    this.zurueckMenge,
    this.zustand,
    this.zustandText,
    this.schaden,
  });

  factory KistenZeile.ausJson(Map<String, dynamic> m) => KistenZeile(
    id: jsonZahl(m['id']),
    artikelId: jsonZahl(m['item_id']),
    name: jsonText(m['name']) ?? 'Ohne Namen',
    einheit: jsonText(m['einheit']),
    menge: jsonZahl(m['menge']) ?? 0,
    mengeText: jsonText(m['menge_text']),
    zurueckMenge: jsonZahl(m['zurueck_menge']),
    zustand: Zustand.aus(m['zustand']),
    zustandText: jsonText(m['zustand_text']),
    schaden: jsonText(m['schaden']),
  );

  final int? id;
  final int? artikelId;
  final String name;
  final String? einheit;
  final int menge;
  final String? mengeText;
  final int? zurueckMenge;
  final Zustand? zustand;
  final String? zustandText;
  final String? schaden;

  String get anzeige => mengeText ?? '$menge ${einheit ?? ''} $name'.trim();
}

/// Ausleihbare Kiste (Lagerort) im Angebot.
class AngebotKiste {
  const AngebotKiste({
    required this.id,
    required this.name,
    this.beschreibung,
    this.frei = false,
    this.freiText,
    this.inhalt = const [],
  });

  factory AngebotKiste.ausJson(Map<String, dynamic> m) => AngebotKiste(
    id: jsonZahl(m['id']) ?? 0,
    name: jsonText(m['name']) ?? 'Kiste',
    beschreibung: jsonText(m['beschreibung']),
    frei: jsonWahr(m['frei']) ?? false,
    freiText: jsonText(m['frei_text']),
    inhalt: jsonListe(m['inhalt'], KistenZeile.ausJson),
  );

  final int id;
  final String name;
  final String? beschreibung;
  final bool frei;
  final String? freiText;
  final List<KistenZeile> inhalt;
}

/// `GET ausleihe/angebot?von=&bis=`
class AusleiheAngebot {
  const AusleiheAngebot({
    required this.von,
    required this.bis,
    this.zeitraumText,
    this.artikel = const [],
    this.kisten = const [],
  });

  factory AusleiheAngebot.ausJson(Object? json) {
    final m = json is Map ? Map<String, dynamic>.from(json) : const <String, dynamic>{};
    return AusleiheAngebot(
      von: jsonDatum(m['von']),
      bis: jsonDatum(m['bis']),
      zeitraumText: jsonText(m['zeitraum_text']),
      artikel: jsonListe(m['artikel'], AngebotArtikel.ausJson),
      kisten: jsonListe(m['kisten'], AngebotKiste.ausJson),
    );
  }

  final DateTime? von;
  final DateTime? bis;
  final String? zeitraumText;
  final List<AngebotArtikel> artikel;
  final List<AngebotKiste> kisten;

  bool get leer => artikel.isEmpty && kisten.isEmpty;
}

/// Was die App ueber eine Ausleihe anzeigt — fertig vom Backend.
class AusleiheApp {
  const AusleiheApp({
    this.statusText,
    this.statusFarbe,
    this.zeitraumText,
    this.ausleiherText,
    this.hinweis,
    this.ueberfaellig = false,
    this.kannAbsagen = false,
    this.kannAusgeben = false,
    this.kannZuruecknehmen = false,
  });

  factory AusleiheApp.ausJson(Object? json) {
    final m = json is Map ? json : const {};
    return AusleiheApp(
      statusText: jsonText(m['status_text']),
      statusFarbe: jsonText(m['status_farbe']),
      zeitraumText: jsonText(m['zeitraum_text']),
      ausleiherText: jsonText(m['ausleiher_text']),
      hinweis: jsonText(m['hinweis']),
      ueberfaellig: jsonWahr(m['ueberfaellig']) ?? false,
      kannAbsagen: jsonWahr(m['kann_absagen']) ?? false,
      kannAusgeben: jsonWahr(m['kann_ausgeben']) ?? false,
      kannZuruecknehmen: jsonWahr(m['kann_zuruecknehmen']) ?? false,
    );
  }

  final String? statusText;

  /// gruen / gelb / rot / grau
  final String? statusFarbe;
  final String? zeitraumText;
  final String? ausleiherText;
  final String? hinweis;
  final bool ueberfaellig;
  final bool kannAbsagen;
  final bool kannAusgeben;
  final bool kannZuruecknehmen;
}

/// Eine Position: Artikel mit Menge oder ganze Kiste.
class AusleihePosition {
  const AusleihePosition({
    required this.id,
    required this.istKiste,
    required this.name,
    this.artikelId,
    this.lagerortId,
    this.einheit,
    this.menge = 1,
    this.mengeText,
    this.zurueckMenge,
    this.zustand,
    this.zustandText,
    this.schaden,
    this.inhalt = const [],
  });

  factory AusleihePosition.ausJson(Map<String, dynamic> m) => AusleihePosition(
    id: jsonZahl(m['id']) ?? 0,
    istKiste: m['art'] == 'kiste',
    name: jsonText(m['name']) ?? 'Ohne Namen',
    artikelId: jsonZahl(m['item_id']),
    lagerortId: jsonZahl(m['location_id']),
    einheit: jsonText(m['einheit']),
    menge: jsonZahl(m['menge']) ?? 1,
    mengeText: jsonText(m['menge_text']),
    zurueckMenge: jsonZahl(m['zurueck_menge']),
    zustand: Zustand.aus(m['zustand']),
    zustandText: jsonText(m['zustand_text']),
    schaden: jsonText(m['schaden']),
    inhalt: jsonListe(m['inhalt'], KistenZeile.ausJson),
  );

  final int id;
  final bool istKiste;
  final String name;
  final int? artikelId;
  final int? lagerortId;
  final String? einheit;
  final int menge;

  /// "30 Stück Teller" bzw. der Name der Kiste.
  final String? mengeText;
  final int? zurueckMenge;
  final Zustand? zustand;
  final String? zustandText;
  final String? schaden;

  /// Inhalt der Kiste (reserviert: heutiger, ab Ausgabe: festgehaltener).
  final List<KistenZeile> inhalt;

  String get anzeige => mengeText ?? name;
}

class AusleiheFoto {
  const AusleiheFoto({required this.id, this.positionId, this.bild});

  factory AusleiheFoto.ausJson(Map<String, dynamic> m) => AusleiheFoto(
    id: jsonZahl(m['id']) ?? 0,
    positionId: jsonZahl(m['position_id']),
    bild: jsonText(m['image_url']),
  );

  final int id;
  final int? positionId;

  /// Pfad (`/api/uploads/…`).
  final String? bild;
}

class Ausleihe {
  const Ausleihe({
    required this.id,
    this.status = AusleiheStatus.reserviert,
    this.von,
    this.bis,
    this.extern = false,
    this.mitgliedEmail,
    this.mitgliedName,
    this.externName,
    this.externOrganisation,
    this.externTelefon,
    this.externEmail,
    this.notizen,
    this.rueckgabeNotiz,
    this.positionen = const [],
    this.fotos = const [],
    this.app = const AusleiheApp(),
  });

  factory Ausleihe.ausJson(Map<String, dynamic> m) => Ausleihe(
    id: jsonZahl(m['id']) ?? 0,
    status: AusleiheStatus.aus(m['status']),
    von: jsonDatum(m['von']),
    bis: jsonDatum(m['bis']),
    extern: m['art'] == 'extern',
    mitgliedEmail: jsonText(m['mitglied_email']),
    mitgliedName: jsonText(m['mitglied_name']),
    externName: jsonText(m['extern_name']),
    externOrganisation: jsonText(m['extern_organisation']),
    externTelefon: jsonText(m['extern_telefon']),
    externEmail: jsonText(m['extern_email']),
    notizen: jsonText(m['notizen']),
    rueckgabeNotiz: jsonText(m['rueckgabe_notiz']),
    positionen: jsonListe(m['positionen'], AusleihePosition.ausJson),
    fotos: jsonListe(m['fotos'], AusleiheFoto.ausJson),
    app: AusleiheApp.ausJson(m['app']),
  );

  /// Aus einer Antwort, die ein Objekt sein muss.
  static Ausleihe ausAntwort(Object? json) {
    if (json is! Map) throw const FormatException('Die Antwort enthält keine Ausleihe.');
    return Ausleihe.ausJson(Map<String, dynamic>.from(json));
  }

  final int id;
  final AusleiheStatus status;
  final DateTime? von;
  final DateTime? bis;
  final bool extern;
  final String? mitgliedEmail;
  final String? mitgliedName;
  final String? externName;
  final String? externOrganisation;
  final String? externTelefon;
  final String? externEmail;
  final String? notizen;
  final String? rueckgabeNotiz;
  final List<AusleihePosition> positionen;
  final List<AusleiheFoto> fotos;
  final AusleiheApp app;

  /// "30 Stück Teller, Festkiste"
  String get positionenText => positionen.map((p) => p.anzeige).join(', ');
}

/// Externe Person/Organisation (erfasst das Lager).
class ExternePerson {
  const ExternePerson({required this.name, this.organisation, this.telefon, this.email});

  final String name;
  final String? organisation;
  final String? telefon;
  final String? email;

  Map<String, Object?> alsJson() => {
    'name': name.trim(),
    if (_t(organisation) != null) 'organisation': _t(organisation),
    if (_t(telefon) != null) 'telefon': _t(telefon),
    if (_t(email) != null) 'email': _t(email),
  };
}

String? _t(String? s) => s == null || s.trim().isEmpty ? null : s.trim();

/// Neue Ausleihe (`POST ausleihe`).
class NeueAusleihe {
  const NeueAusleihe({
    required this.von,
    required this.bis,
    this.artikel = const {},
    this.kisten = const {},
    this.notizen,
    this.extern,
  });

  final DateTime von;
  final DateTime bis;

  /// Artikel-Id -> Menge.
  final Map<int, int> artikel;

  /// Lagerort-Ids ganzer Kisten.
  final Set<int> kisten;
  final String? notizen;

  /// Nur das Lager: fuer Externe.
  final ExternePerson? extern;

  bool get leer => artikel.values.every((m) => m <= 0) && kisten.isEmpty;

  Map<String, Object?> alsJson() => {
    'von': isoDatum(von),
    'bis': isoDatum(bis),
    'positionen': [
      for (final e in artikel.entries)
        if (e.value > 0) {'item_id': e.key, 'menge': e.value},
      for (final k in kisten) {'location_id': k},
    ],
    if (_t(notizen) != null) 'notizen': _t(notizen),
    if (extern != null) 'extern': extern!.alsJson(),
  };
}

/// Rueckgabe einer Zeile: [zurueck] geht wieder ins Lager, der Rest ist
/// beschaedigt oder fehlt ([zustand]).
class RueckgabeZeile {
  const RueckgabeZeile({
    required this.id,
    required this.zurueck,
    required this.zustand,
    this.schaden,
  });

  final int id;
  final int zurueck;
  final Zustand zustand;
  final String? schaden;

  Map<String, Object?> alsJson() => {
    'id': id,
    'zurueck': zurueck,
    'zustand': zustand.wert,
    if (_t(schaden) != null) 'schaden': _t(schaden),
  };
}

/// Rueckgabe einer Position. Bei Kisten: [inhalt] je Zeile, dazu Zustand
/// und Schaden der Kiste selbst.
class RueckgabePosition {
  const RueckgabePosition({
    required this.id,
    this.zurueck,
    this.zustand = Zustand.ok,
    this.schaden,
    this.inhalt = const [],
  });

  final int id;
  final int? zurueck;
  final Zustand zustand;
  final String? schaden;
  final List<RueckgabeZeile> inhalt;

  Map<String, Object?> alsJson() => {
    'id': id,
    'zurueck': ?zurueck,
    'zustand': zustand.wert,
    if (_t(schaden) != null) 'schaden': _t(schaden),
    if (inhalt.isNotEmpty) 'inhalt': [for (final z in inhalt) z.alsJson()],
  };
}

class Rueckgabe {
  const Rueckgabe({required this.positionen, this.notiz});

  final List<RueckgabePosition> positionen;
  final String? notiz;

  Map<String, Object?> alsJson() => {
    'positionen': [for (final p in positionen) p.alsJson()],
    if (_t(notiz) != null) 'notiz': _t(notiz),
  };
}
