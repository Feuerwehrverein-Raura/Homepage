// Daten des Verwaltungsbereichs, die nicht zum Anlass selbst gehoeren:
// Person eintragen, Mitgliederverzeichnis, Ergebnis einer Mitteilung,
// Notizen mit Anhaengen, Rezepte, Material und Einkaufsliste. Gleich fuer
// Organisator und Vorstand.

import 'dart:convert';
import 'dart:typed_data';

import 'package:fwv_core/fwv_core.dart';

import 'modelle.dart';

/// Body fuer "Person hinzufuegen": Mitglied (ID) oder Gast (Name), auf
/// Wunsch gleich in Schichten ([schichtIds], `shift_ids`).
class NeuePerson {
  const NeuePerson({
    this.mitgliedId,
    this.name,
    this.email,
    this.telefon,
    this.personen = 1,
    this.bemerkung,
    this.schichtIds = const [],
  });

  final String? mitgliedId;
  final String? name;
  final String? email;
  final String? telefon;
  final int personen;
  final String? bemerkung;

  /// Schichten, in die die Person eingetragen wird; leer = ohne Schicht.
  final List<String> schichtIds;

  bool get gueltig => mitgliedId != null || (name?.trim().isNotEmpty ?? false);

  Map<String, Object?> alsJson() {
    String? t(String? s) => (s == null || s.trim().isEmpty) ? null : s.trim();
    final gast = mitgliedId == null;
    return {
      'member_id': ?mitgliedId,
      if (gast) 'guest_name': ?t(name),
      if (gast) 'guest_email': ?t(email),
      if (gast) 'guest_phone': ?t(telefon),
      'participants': personen,
      'notes': ?t(bemerkung),
      if (schichtIds.isNotEmpty) 'shift_ids': [...schichtIds.toSet()],
    };
  }
}

/// Eintrag aus `members/directory` bzw. `events/my-event/members`.
class VerzeichnisMitglied {
  const VerzeichnisMitglied({
    required this.id,
    required this.name,
    this.email,
    this.telefon,
    this.funktion,
  });

  factory VerzeichnisMitglied.ausJson(Map<String, dynamic> m) {
    final name =
        jsonText(m['name']) ??
        [jsonText(m['vorname']), jsonText(m['nachname'])].whereType<String>().join(' ');
    return VerzeichnisMitglied(
      id: jsonText(m['id']) ?? '',
      name: name,
      email: jsonText(m['email']),
      telefon: jsonText(m['mobile']) ?? jsonText(m['telefon']),
      funktion: jsonText(m['funktion']),
    );
  }

  final String id;
  final String name;
  final String? email;
  final String? telefon;
  final String? funktion;
}

/// Antwort von notify-registrants: wie viele wie erreicht wurden.
class MitteilungErgebnis {
  const MitteilungErgebnis({
    this.perEmail = 0,
    this.perPost = 0,
    this.perPush = 0,
    this.uebersprungen = 0,
    this.nichtErreicht = const [],
  });

  factory MitteilungErgebnis.ausJson(Object? json) {
    final m = json is Map ? json : const {};
    return MitteilungErgebnis(
      perEmail: jsonZahl(m['emailed']) ?? 0,
      perPost: jsonZahl(m['posted']) ?? 0,
      perPush: jsonZahl(m['pushed']) ?? 0,
      uebersprungen: jsonZahl(m['skipped']) ?? 0,
      nichtErreicht: [
        if (m['unreachable'] case final List l)
          for (final e in l) ?jsonText(e),
      ],
    );
  }

  final int perEmail;
  final int perPost;
  final int perPush;
  final int uebersprungen;

  /// Wen die Nachricht nicht erreicht hat — muss der Organisator sehen.
  final List<String> nichtErreicht;
}

/// Eine Notiz mit Anhaengen (ohne die Bytes).
class Notiz {
  const Notiz({required this.id, this.text, this.von, this.erstellt, this.anhaenge = const []});

  factory Notiz.ausJson(Map<String, dynamic> m) => Notiz(
    id: jsonText(m['id']) ?? '',
    text: jsonText(m['content']),
    von: jsonText(m['created_by']),
    erstellt: jsonText(m['created_at']),
    anhaenge: jsonListe(
      m['attachments'],
      (a) => NotizAnhang(
        id: jsonText(a['id']) ?? '',
        dateiname: jsonText(a['filename']) ?? 'Datei',
        typ: jsonText(a['content_type']) ?? 'application/octet-stream',
        groesse: jsonZahl(a['size']) ?? 0,
      ),
    ),
  );

  final String id;
  final String? text;
  final String? von;

  /// Wie in der Datenbank ("2026-10-11 10:00:00.123").
  final String? erstellt;
  final List<NotizAnhang> anhaenge;

  /// "11.10.2026, 10:00"
  String? get erstelltText {
    final z = Zeitpunkt.ausDb(erstellt);
    if (z == null) return null;
    final m = RegExp(r'[T ](\d{2}:\d{2})').firstMatch(erstellt!);
    return m == null ? schweizerDatum(z.datum) : '${schweizerDatum(z.datum)}, ${m[1]}';
  }
}

class NotizAnhang {
  const NotizAnhang({
    required this.id,
    required this.dateiname,
    required this.typ,
    this.groesse = 0,
  });

  final String id;
  final String dateiname;
  final String typ;
  final int groesse;

  bool get istBild => typ.toLowerCase().startsWith('image/');
}

/// Ein hochzuladender Anhang (Base64 ohne `data:`-Praefix).
class AnhangUpload {
  const AnhangUpload({required this.dateiname, required this.typ, required this.bytes});

  final String dateiname;
  final String typ;
  final Uint8List bytes;

  Map<String, Object?> alsJson() => {
    'filename': dateiname,
    'content_type': typ,
    'data': base64Encode(bytes),
  };
}

/// Zahl, die die Inventar-API als Zahl oder als Text liefert ("2.50").
double? _lockereZahl(Object? wert) {
  if (wert is num) return wert.toDouble();
  if (wert is String) return double.tryParse(wert.trim().replaceAll(',', '.'));
  return null;
}

/// Zahl zur Anzeige: "2", "2.5" — so, wie das Backend sie meint.
String mengeText(double? wert) {
  if (wert == null) return '';
  if (wert == wert.roundToDouble()) return wert.toStringAsFixed(0);
  return wert.toStringAsFixed(2).replaceFirst(RegExp(r'0$'), '');
}

/// Mit dem Anlass verknuepftes Rezept.
class VerknuepftesRezept {
  const VerknuepftesRezept({
    this.rezeptId,
    this.name,
    this.portionen,
    this.kategorie,
    this.ausLagerMoeglich,
  });

  factory VerknuepftesRezept.ausJson(Map<String, dynamic> m) => VerknuepftesRezept(
    // Fuer Aendern/Loesen: recipe_id, sonst id (je nach Inventar-Route).
    rezeptId: jsonZahl(m['recipe_id']) ?? jsonZahl(m['id']),
    name: jsonText(m['name']),
    portionen: _lockereZahl(m['servings']),
    kategorie: jsonText(m['category_name']),
    ausLagerMoeglich: _lockereZahl(m['available_portions']),
  );

  final int? rezeptId;
  final String? name;
  final double? portionen;
  final String? kategorie;

  /// Portionen, die sich mit dem Lagerbestand herstellen lassen.
  final double? ausLagerMoeglich;
}

class AuswahlRezept {
  const AuswahlRezept({required this.id, this.name, this.kategorie});

  factory AuswahlRezept.ausJson(Map<String, dynamic> m) => AuswahlRezept(
    id: jsonZahl(m['id']) ?? 0,
    name: jsonText(m['name']),
    kategorie: jsonText(m['category_name']),
  );

  final int id;
  final String? name;
  final String? kategorie;
}

class AuswahlMaterial {
  const AuswahlMaterial({required this.id, this.name, this.einheit, this.kategorie});

  factory AuswahlMaterial.ausJson(Map<String, dynamic> m) => AuswahlMaterial(
    id: jsonZahl(m['id']) ?? 0,
    name: jsonText(m['name']),
    einheit: jsonText(m['unit']),
    kategorie: jsonText(m['category_name']),
  );

  final int id;
  final String? name;
  final String? einheit;
  final String? kategorie;
}

/// Einkaufsliste: gerechnet von der Inventar-API (Rezepte + Material von
/// Hand gegen den Lagerbestand). Die App zeigt nur an.
class Einkaufsliste {
  const Einkaufsliste({
    this.posten = const [],
    this.zuKaufen,
    this.geschaetzteKosten,
    this.gekauft,
  });

  factory Einkaufsliste.ausJson(Object? json) {
    final m = json is Map ? json : const {};
    return Einkaufsliste(
      posten: jsonListe(m['items'], EinkaufsPosten.ausJson),
      zuKaufen: jsonZahl(m['total_to_buy']),
      geschaetzteKosten: _lockereZahl(m['estimated_total_cost']),
      gekauft: jsonZahl(m['total_purchased']),
    );
  }

  final List<EinkaufsPosten> posten;
  final int? zuKaufen;
  final double? geschaetzteKosten;

  /// Abgehakte Positionen (`total_purchased`).
  final int? gekauft;

  /// Abgehakt, aber noch nicht ins Lager zurueckgebucht.
  int get zumZurueckbuchen => posten.where((p) => p.gekauft && !p.eingebucht).length;

  /// Material von Hand: Posten mit manuellem Bedarf.
  List<EinkaufsPosten> get vonHand => [
    for (final p in posten)
      if ((p.vonHand ?? 0) > 0) p,
  ];
}

class EinkaufsPosten {
  const EinkaufsPosten({
    this.materialId,
    this.name,
    this.einheit,
    this.bedarf,
    this.vonHand,
    this.lager,
    this.zuKaufen,
    this.lieferant,
    this.gekauft = false,
    this.gekauftVon,
    this.istMenge,
    this.eingebucht = false,
  });

  factory EinkaufsPosten.ausJson(Map<String, dynamic> m) => EinkaufsPosten(
    materialId: jsonZahl(m['item_id']),
    name: jsonText(m['item_name']),
    einheit: jsonText(m['unit']),
    bedarf: _lockereZahl(m['needed']),
    vonHand: _lockereZahl(m['manual_needed']),
    lager: _lockereZahl(m['in_stock']),
    zuKaufen: _lockereZahl(m['to_buy']),
    lieferant: jsonText(m['supplier']),
    gekauft: jsonWahr(m['purchased']) ?? false,
    gekauftVon: jsonText(m['purchased_by']),
    istMenge: _lockereZahl(m['actual_quantity']),
    eingebucht: jsonWahr(m['restocked']) ?? false,
  );

  final int? materialId;
  final String? name;
  final String? einheit;
  final double? bedarf;
  final double? vonHand;
  final double? lager;
  final double? zuKaufen;
  final String? lieferant;

  /// Abgehakt beim Einkauf (`purchased`), von wem (`purchased_by`).
  final bool gekauft;
  final String? gekauftVon;

  /// Tatsaechlich gekaufte Menge (`actual_quantity`); ohne sie bucht das
  /// Inventar "Bedarf minus Bestand" zurueck.
  final double? istMenge;

  /// Schon ins Lager zurueckgebucht (`restocked`).
  final bool eingebucht;
}

/// Ein Beleg (Kassenzettel-Foto) zum Einkauf eines Anlasses
/// (`GET events/:id/receipts`).
class Beleg {
  const Beleg({
    required this.id,
    this.betrag,
    this.bezahltVon,
    this.notiz,
    this.hochgeladenVon,
    this.erstellt,
  });

  factory Beleg.ausJson(Map<String, dynamic> m) => Beleg(
    id: jsonZahl(m['id']) ?? 0,
    betrag: _lockereZahl(m['amount']),
    bezahltVon: jsonText(m['paid_by']),
    notiz: jsonText(m['note']),
    hochgeladenVon: jsonText(m['uploaded_by']),
    erstellt: jsonZeitpunkt(m['created_at']),
  );

  final int id;
  final double? betrag;
  final String? bezahltVon;
  final String? notiz;
  final String? hochgeladenVon;
  final DateTime? erstellt;

  /// "10.10.2026" bzw. leer.
  String? get datumText => erstellt == null ? null : schweizerDatum(erstellt!);
}

/// Ergebnis von "ins Lager zurueckbuchen"
/// (`POST events/:id/shopping-list/restock`).
class Zurueckbuchung {
  const Zurueckbuchung({this.anzahl = 0, this.posten = const []});

  factory Zurueckbuchung.ausJson(Object? json) {
    final m = json is Map ? json : const {};
    return Zurueckbuchung(
      anzahl: jsonZahl(m['restocked']) ?? 0,
      posten: [
        if (m['items'] is List)
          for (final e in m['items'] as List)
            if (e is Map)
              (name: jsonText(e['name']) ?? 'Posten', menge: _lockereZahl(e['quantity']) ?? 0),
      ],
    );
  }

  final int anzahl;
  final List<({String name, double menge})> posten;

  /// "Reis +6, Becher +50" bzw. "Nichts zurückzubuchen."
  String get text => posten.isEmpty
      ? 'Nichts zurückzubuchen — erst Gekauftes abhaken.'
      : 'Ins Lager gebucht: ${posten.map((p) => '${p.name} +${mengeText(p.menge)}').join(', ')}';
}

/// Organisatoren eines Anlasses (`GET events/:id/organizers`): der
/// Haupt-Organisator (Kontaktperson; aendern kann ihn nur der Vorstand) und
/// die Mitorganisatoren mit denselben Rechten.
class OrganisatorenListe {
  const OrganisatorenListe({
    this.hauptorganisator,
    this.mitorganisatoren = const [],
    this.darfVerwalten = false,
  });

  factory OrganisatorenListe.ausJson(Object? json) {
    final m = json is Map ? json : const {};
    final h = m['hauptorganisator'];
    return OrganisatorenListe(
      hauptorganisator: h is Map ? OrganisatorEintrag.ausJson(Map<String, dynamic>.from(h)) : null,
      mitorganisatoren: jsonListe(m['mitorganisatoren'], OrganisatorEintrag.ausJson),
      darfVerwalten: jsonWahr(m['darf_verwalten']) ?? false,
    );
  }

  final OrganisatorEintrag? hauptorganisator;
  final List<OrganisatorEintrag> mitorganisatoren;

  /// Vorstand oder Haupt-Organisator: hinzufuegen und entfernen.
  final bool darfVerwalten;
}

/// Ein Organisator: Mitglied (verwaltet in der App) oder extern (eigener
/// Login fuers Event-Dashboard, befristet).
class OrganisatorEintrag {
  const OrganisatorEintrag({
    this.id,
    required this.name,
    this.mitgliedId,
    this.email,
    this.extern = false,
    this.zugangBis,
  });

  factory OrganisatorEintrag.ausJson(Map<String, dynamic> m) => OrganisatorEintrag(
    id: jsonText(m['id']),
    name: jsonText(m['name']) ?? jsonText(m['email']) ?? 'Ohne Namen',
    mitgliedId: jsonText(m['member_id']),
    email: jsonText(m['email']),
    extern: jsonText(m['art']) == 'extern',
    zugangBis: jsonDatum(m['zugang_bis']),
  );

  /// Eintrag der Mitorganisatoren; null beim Haupt-Organisator.
  final String? id;
  final String name;
  final String? mitgliedId;
  final String? email;
  final bool extern;

  /// Nur extern: bis wann der Login gilt.
  final DateTime? zugangBis;

  /// "Mitglied", "Extern · Zugang bis 24.01.2027"
  String get artText {
    if (!extern) return mitgliedId != null ? 'Mitglied' : 'Extern';
    final b = zugangBis;
    if (b == null) return 'Extern';
    String zwei(int z) => z.toString().padLeft(2, '0');
    return 'Extern · Zugang bis ${zwei(b.day)}.${zwei(b.month)}.${b.year}';
  }
}

/// Body fuer "Mitorganisator hinzufuegen": Mitglied (ID) oder extern (Name
/// und E-Mail; das Backend erstellt einen Login und schickt ihn per E-Mail).
class NeuerMitorganisator {
  const NeuerMitorganisator.mitglied(String this.mitgliedId) : name = '', email = '';

  const NeuerMitorganisator.extern({required this.name, required this.email}) : mitgliedId = null;

  final String? mitgliedId;
  final String name;
  final String email;

  bool get istMitglied => mitgliedId != null;

  static final _emailMuster = RegExp(r'^[^\s@]+@[^\s@]+\.[^\s@]+$');

  bool get gueltig =>
      istMitglied || (name.trim().isNotEmpty && _emailMuster.hasMatch(email.trim()));

  Map<String, Object?> alsJson() =>
      istMitglied ? {'member_id': mitgliedId} : {'name': name.trim(), 'email': email.trim()};
}
