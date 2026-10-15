// Anlass-Verwaltung (Organisator und Vorstand): was
// `GET events/organisator-uebersicht` liefert
// (docker/backend-events/src/organisator-ansicht.js) und die Entwuerfe fuers
// Bearbeiten.
//
// Die App rechnet nichts: Personen, Begleitpersonen, Allergien, Menue,
// Status-Texte, Zahlen und welche Aktionen erlaubt sind — alles kommt fertig
// vom Backend (Vertrag: fixtures/organisator-uebersicht.json). Einzig die
// Anzeige fasst die Anmeldungen pro Person zusammen und sortiert nach Zeit
// ([anmeldungenNachPerson]).
//
// Die Entwuerfe (AnlassEntwurf, SchichtEntwurf, AnmeldungEntwurf) schicken
// beim Speichern nur, was sich geaendert hat. Das behebt drei Fehler der
// alten iOS-App:
//  - Anlass bearbeiten loeschte Menuewahl und Anmeldeschluss,
//  - beim Bearbeiten einer Schicht sprang das Datum auf heute,
//  - Anmeldung bearbeiten ueberschrieb die Bemerkungen (Begleitpersonen,
//    Allergien, Menue gingen verloren).

import 'dart:convert';
import 'dart:typed_data';

import 'package:fwv_core/fwv_core.dart';

/// Mit welchem Zugang die Uebersicht geholt wurde.
enum ZugangsArt {
  /// Mitglied, das Anlaesse organisiert.
  mitglied,

  /// Vorstand/Admin: alle aktuellen Anlaesse.
  vorstand,

  /// Externer Organisator (`events/login`): ein Anlass, wenige Aktionen.
  organisatorLogin;

  static ZugangsArt ausText(String? t) => switch (t) {
    'vorstand' => vorstand,
    'organisator-login' => organisatorLogin,
    _ => mitglied,
  };
}

class VerwaltungsUebersicht {
  const VerwaltungsUebersicht({this.zugang = ZugangsArt.mitglied, this.anlaesse = const []});

  factory VerwaltungsUebersicht.ausJson(Object? json) {
    final m = json is Map ? json : const {};
    return VerwaltungsUebersicht(
      zugang: ZugangsArt.ausText(jsonText(m['zugang'])),
      anlaesse: [
        if (m['anlaesse'] case final List l)
          for (final e in l)
            if (e is Map) VerwalteterAnlass.ausJson(e),
      ],
    );
  }

  final ZugangsArt zugang;

  /// Aktuelle zuerst, dann die eben vergangenen (Reihenfolge des Backends).
  final List<VerwalteterAnlass> anlaesse;

  VerwalteterAnlass? anlassMitId(String id) {
    for (final a in anlaesse) {
      if (a.anlass.id == id || a.anlass.slug == id) return a;
    }
    return null;
  }
}

/// Ein Anlass der Uebersicht: der Anlass selbst (wie `GET events`) und der
/// Organisator-Block.
class VerwalteterAnlass {
  const VerwalteterAnlass({
    required this.anlass,
    this.aktuell = true,
    this.zahlen = const AnmeldeZahlen(),
    this.rechte = const AnlassRechte(),
    this.anmeldungen = const [],
    this.organisatorId,
    this.organisatorEmail,
  });

  factory VerwalteterAnlass.ausJson(Map<dynamic, dynamic> m) {
    final o = m['organisator'] is Map ? m['organisator'] as Map : const {};
    return VerwalteterAnlass(
      anlass: Anlass.ausJson(m),
      aktuell: jsonWahr(o['aktuell']) ?? true,
      zahlen: AnmeldeZahlen.ausJson(o['zahlen']),
      rechte: AnlassRechte.ausJson(o['aktionen']),
      anmeldungen: jsonListe(o['anmeldungen'], VerwalteteAnmeldung.ausJson),
      organisatorId: jsonText(m['organizer_id']),
      organisatorEmail: jsonText(m['organizer_email']),
    );
  }

  /// Mitglied, das den Anlass organisiert (`organizer_id`), sonst null.
  final String? organisatorId;

  /// E-Mail des Organisators (`organizer_email`) - nur fuers Formular des
  /// Vorstands (Organisator zuweisen).
  final String? organisatorEmail;

  /// Organisator, wie das Formular des Vorstands ihn zeigt.
  OrganisatorAngabe get organisatorAngabe => OrganisatorAngabe(
    mitgliedId: organisatorId,
    name: anlass.organisator ?? '',
    email: organisatorEmail ?? '',
  );

  final Anlass anlass;

  /// false bei Anlaessen, die in den letzten Tagen zu Ende gingen.
  final bool aktuell;
  final AnmeldeZahlen zahlen;

  /// Was an diesem Anlass geht (vom Backend, `organisator.aktionen`).
  final AnlassRechte rechte;

  /// Offene zuerst, dann bestaetigte, dann abgelehnte.
  final List<VerwalteteAnmeldung> anmeldungen;
}

class AnmeldeZahlen {
  const AnmeldeZahlen({
    this.anmeldungen = 0,
    this.offen = 0,
    this.bestaetigt = 0,
    this.abgelehnt = 0,
    this.personenTotal = 0,
    this.text,
  });

  factory AnmeldeZahlen.ausJson(Object? json) {
    final m = json is Map ? json : const {};
    return AnmeldeZahlen(
      anmeldungen: jsonZahl(m['anmeldungen']) ?? 0,
      offen: jsonZahl(m['offen']) ?? 0,
      bestaetigt: jsonZahl(m['bestaetigt']) ?? 0,
      abgelehnt: jsonZahl(m['abgelehnt']) ?? 0,
      personenTotal: jsonZahl(m['personen_total']) ?? 0,
      text: jsonText(m['text']),
    );
  }

  final int anmeldungen;
  final int offen;
  final int bestaetigt;
  final int abgelehnt;

  /// Personen (nicht Anmeldungen), offen + bestaetigt.
  final int personenTotal;

  /// "3 bestätigt · 1 offen · 4 Personen" bzw. "Noch keine Anmeldungen".
  final String? text;
}

/// Was der Anfragende an diesem Anlass tun darf (vom Backend). Die
/// Oberflaeche zeigt nur, was hier erlaubt ist.
class AnlassRechte {
  const AnlassRechte({
    this.bestaetigen = false,
    this.hinzufuegen = false,
    this.bearbeiten = false,
    this.loeschen = false,
    this.alternative = false,
    this.mitteilen = false,
    this.anlassBearbeiten = false,
    this.schichten = false,
    this.notizen = false,
    this.material = false,
    this.einkauf = false,
    this.arbeitsplanSenden = false,
    this.pdfTeilnehmerliste = false,
    this.pdfArbeitsplan = false,
    this.pdfAushang = false,
    this.organisatorenVerwalten = false,
  });

  factory AnlassRechte.ausJson(Object? json) {
    final m = json is Map ? json : const {};
    bool w(String k) => jsonWahr(m[k]) ?? false;
    return AnlassRechte(
      bestaetigen: w('bestaetigen'),
      hinzufuegen: w('hinzufuegen'),
      bearbeiten: w('bearbeiten'),
      loeschen: w('loeschen'),
      alternative: w('alternative'),
      mitteilen: w('mitteilen'),
      anlassBearbeiten: w('anlass_bearbeiten'),
      schichten: w('schichten'),
      notizen: w('notizen'),
      material: w('material'),
      einkauf: w('einkauf'),
      arbeitsplanSenden: w('arbeitsplan_senden'),
      pdfTeilnehmerliste: w('pdf_teilnehmerliste'),
      pdfArbeitsplan: w('pdf_arbeitsplan'),
      pdfAushang: w('pdf_aushang'),
      organisatorenVerwalten: w('organisatoren_verwalten'),
    );
  }

  final bool bestaetigen;
  final bool hinzufuegen;
  final bool bearbeiten;
  final bool loeschen;
  final bool alternative;
  final bool mitteilen;
  final bool anlassBearbeiten;
  final bool schichten;
  final bool notizen;
  final bool material;

  /// Einkauf: abhaken, Belege, ins Lager zurueckbuchen (im Reiter Material).
  final bool einkauf;
  final bool arbeitsplanSenden;
  final bool pdfTeilnehmerliste;
  final bool pdfArbeitsplan;
  final bool pdfAushang;

  /// Mitorganisatoren hinzufuegen und entfernen - nur der Vorstand und der
  /// Haupt-Organisator, nicht die Mitorganisatoren selbst.
  final bool organisatorenVerwalten;

  bool get einPdf => pdfTeilnehmerliste || pdfArbeitsplan || pdfAushang;
}

/// Eine Anmeldung, anzeigefertig.
class VerwalteteAnmeldung {
  const VerwalteteAnmeldung({
    required this.id,
    required this.name,
    this.status = 'pending',
    this.statusText,
    this.statusFarbe,
    this.art = AnmeldeArt.teilnahme,
    this.mitglied = false,
    this.memberId,
    this.email,
    this.telefon,
    this.personen = 1,
    this.begleitpersonen = const [],
    this.allergien,
    this.menue,
    this.bemerkung,
    this.schichtIds = const [],
    this.schichten = const [],
    this.alternative,
    this.angemeldetText,
  });

  factory VerwalteteAnmeldung.ausJson(Map<String, dynamic> m) {
    final alt = m['alternative'];
    return VerwalteteAnmeldung(
      id: jsonText(m['id']) ?? '',
      name: jsonText(m['name']) ?? '',
      status: jsonText(m['status']) ?? 'pending',
      statusText: jsonText(m['status_text']),
      statusFarbe: jsonText(m['status_farbe']),
      art: jsonText(m['art']) == 'schicht' ? AnmeldeArt.schicht : AnmeldeArt.teilnahme,
      mitglied: jsonWahr(m['mitglied']) ?? false,
      memberId: jsonText(m['member_id']),
      email: jsonText(m['email']),
      telefon: jsonText(m['phone']),
      personen: jsonZahl(m['personen']) ?? 1,
      begleitpersonen: jsonListe(
        m['begleitpersonen'],
        (b) => Begleitperson(
          name: jsonText(b['name']) ?? '',
          email: jsonText(b['email']),
          telefon: jsonText(b['phone']),
        ),
      ),
      allergien: jsonText(m['allergien']),
      menue: jsonText(m['menue']),
      bemerkung: jsonText(m['bemerkung']),
      schichtIds: [
        if (m['shift_ids'] case final List l)
          for (final e in l) ?jsonText(e),
      ],
      schichten: jsonListe(
        m['schichten'],
        (s) => (id: jsonText(s['id']) ?? '', beschriftung: jsonText(s['beschriftung']) ?? ''),
      ),
      alternative: alt is Map
          ? (
              schichtText: jsonText(alt['schicht_text']) ?? '',
              vorgeschlagenText: jsonText(alt['vorgeschlagen_text']),
            )
          : null,
      angemeldetText: jsonText(m['angemeldet_text']),
    );
  }

  final String id;
  final String name;

  /// pending, approved, rejected, ...
  final String status;

  /// "offen", "bestätigt", ...
  final String? statusText;

  /// gelb, gruen, rot, grau
  final String? statusFarbe;
  final AnmeldeArt art;
  final bool mitglied;
  final String? memberId;
  final String? email;
  final String? telefon;
  final int personen;
  final List<Begleitperson> begleitpersonen;
  final String? allergien;
  final String? menue;
  final String? bemerkung;
  final List<String> schichtIds;
  final List<({String id, String beschriftung})> schichten;

  /// Eine andere Schicht wurde vorgeschlagen.
  final ({String schichtText, String? vorgeschlagenText})? alternative;

  /// "15.09.2026"
  final String? angemeldetText;

  bool get offen => status == 'pending';
}

class Begleitperson {
  const Begleitperson({required this.name, this.email, this.telefon});

  final String name;
  final String? email;
  final String? telefon;
}

/// Alle Anmeldungen einer Person an einem Anlass - fuer eine Karte statt
/// einer pro Schicht. Gebildet von [anmeldungenNachPerson].
class AnmeldePerson {
  const AnmeldePerson({required this.schluessel, required this.anmeldungen});

  /// member:…, gast:… oder anmeldung:… (siehe [anmeldungenNachPerson]).
  final String schluessel;

  /// Chronologisch nach der fruehesten Schicht; ohne Schicht am Ende.
  final List<VerwalteteAnmeldung> anmeldungen;

  VerwalteteAnmeldung get erste => anmeldungen.first;
  String get name => erste.name;
  bool get mitglied => anmeldungen.any((r) => r.mitglied);
  String? get email => _erster((r) => r.email);
  String? get telefon => _erster((r) => r.telefon);

  /// Alle Anmeldungen im selben Status: der Status gehoert in den Kopf.
  bool get einStatus => anmeldungen.every((r) => r.status == erste.status);

  /// Zahl der Schichten ueber alle Anmeldungen.
  int get schichten => anmeldungen.fold(0, (n, r) => n + r.schichten.length);

  String? _erster(String? Function(VerwalteteAnmeldung r) wert) {
    for (final r in anmeldungen) {
      final w = wert(r);
      if (w != null && w.trim().isNotEmpty) return w;
    }
    return null;
  }
}

/// Fasst die Anmeldungen pro Person zusammen und sortiert sie nach Zeit.
///
/// Person = gleiche `member_id`; bei Gaesten gleiche E-Mail (klein,
/// getrimmt) UND gleicher Name - Familien teilen sich oft eine Adresse,
/// zwei verschiedene Gaeste duerfen nicht in einer Karte landen. Ohne
/// beides bleibt jede Anmeldung fuer sich.
///
/// Reihenfolge: Personen nach ihrer fruehesten Schicht (Datum, Beginn), dann
/// Name; Personen ohne Schicht am Ende. In der Karte die Anmeldungen und
/// ihre Schichten chronologisch. Die Zeiten kommen aus den Schichten des
/// Anlasses ([schichtenDesAnlasses]); unbekannte Schichten zaehlen wie ohne
/// Datum (hinter die datierten).
List<AnmeldePerson> anmeldungenNachPerson(
  List<VerwalteteAnmeldung> anmeldungen,
  List<Schicht> schichtenDesAnlasses,
) {
  final zeit = {
    for (final s in schichtenDesAnlasses) s.id: '${s.datum ?? '9999-99-99'} ${s.beginn ?? '99:99'}',
  };
  // Ohne Schicht ganz ans Ende (hinter alle Zeiten).
  const ohne = '\u{10FFFF}';
  String schichtZeit(String id) => zeit[id] ?? '9999-99-99 99:99';
  String frueheste(VerwalteteAnmeldung r) {
    final zeiten = [for (final s in r.schichten) schichtZeit(s.id)]..sort();
    return zeiten.isEmpty ? ohne : zeiten.first;
  }

  String schluessel(VerwalteteAnmeldung r) {
    final m = r.memberId?.trim() ?? '';
    if (m.isNotEmpty) return 'member:$m';
    final e = r.email?.trim().toLowerCase() ?? '';
    if (e.isNotEmpty) return 'gast:$e|${r.name.trim().toLowerCase()}';
    return 'anmeldung:${r.id}';
  }

  final gruppen = <String, List<VerwalteteAnmeldung>>{};
  for (final r in anmeldungen) {
    // Schichten der Anmeldung selbst auch in zeitlicher Reihenfolge.
    final sortiert = [...r.schichten]
      ..sort((a, b) => schichtZeit(a.id).compareTo(schichtZeit(b.id)));
    final kopie = VerwalteteAnmeldung(
      id: r.id,
      name: r.name,
      status: r.status,
      statusText: r.statusText,
      statusFarbe: r.statusFarbe,
      art: r.art,
      mitglied: r.mitglied,
      memberId: r.memberId,
      email: r.email,
      telefon: r.telefon,
      personen: r.personen,
      begleitpersonen: r.begleitpersonen,
      allergien: r.allergien,
      menue: r.menue,
      bemerkung: r.bemerkung,
      schichtIds: r.schichtIds,
      schichten: sortiert,
      alternative: r.alternative,
      angemeldetText: r.angemeldetText,
    );
    gruppen.putIfAbsent(schluessel(r), () => []).add(kopie);
  }
  final personen = [
    for (final e in gruppen.entries)
      AnmeldePerson(
        schluessel: e.key,
        anmeldungen: [...e.value]..sort((a, b) => frueheste(a).compareTo(frueheste(b))),
      ),
  ];
  personen.sort((a, b) {
    final z = frueheste(a.erste).compareTo(frueheste(b.erste));
    if (z != 0) return z;
    final n = a.name.toLowerCase().compareTo(b.name.toLowerCase());
    return n != 0 ? n : a.erste.id.compareTo(b.erste.id);
  });
  return personen;
}

// ---------------------------------------------------------------------------
// Entwuerfe: Formularwerte, die nur Aenderungen verschicken

/// Formularwerte einer Anmeldung (`PUT …/registrations/:id/as-organizer`).
///
/// Das Backend fuehrt das notes-JSON zusammen; geschickt wird nur, was sich
/// geaendert hat. Begleitpersonen, Allergien und Menue kommen im Formular gar
/// nicht vor und bleiben so sicher erhalten.
class AnmeldungEntwurf {
  AnmeldungEntwurf({
    this.name = '',
    this.email = '',
    this.telefon = '',
    this.personen = 1,
    this.bemerkung = '',
    this.status = 'pending',
    List<String>? schichtIds,
  }) : schichtIds = schichtIds ?? [];

  factory AnmeldungEntwurf.aus(VerwalteteAnmeldung a) => AnmeldungEntwurf(
    name: a.name,
    email: a.email ?? '',
    telefon: a.telefon ?? '',
    personen: a.personen,
    bemerkung: a.bemerkung ?? '',
    status: a.status,
    schichtIds: List.of(a.schichtIds),
  );

  String name;
  String email;
  String telefon;
  int personen;
  String bemerkung;
  String status;

  /// Schichten der Anmeldung; geaendert ersetzt `shift_ids` alle bisherigen
  /// (leer = ohne Schicht).
  List<String> schichtIds;

  /// Body mit den geaenderten Feldern. Name und E-Mail nur bei Gaesten —
  /// bei Mitgliedern stehen sie im Mitgliederverzeichnis.
  Map<String, Object?> aenderungen(AnmeldungEntwurf original, {required bool gast}) => {
    if (gast && name.trim() != original.name.trim()) 'guest_name': name.trim(),
    if (gast && email.trim() != original.email.trim()) 'guest_email': email.trim(),
    if (telefon.trim() != original.telefon.trim()) 'guest_phone': telefon.trim(),
    if (personen != original.personen) 'participants': personen,
    if (bemerkung.trim() != original.bemerkung.trim()) 'notes': bemerkung.trim(),
    if (status != original.status) 'status': status,
    if (!_gleicheSchichten(schichtIds, original.schichtIds)) 'shift_ids': List.of(schichtIds),
  };

  /// Reihenfolge spielt keine Rolle.
  static bool _gleicheSchichten(List<String> a, List<String> b) {
    final x = a.toSet();
    final y = b.toSet();
    return x.length == y.length && x.containsAll(y);
  }
}

/// Formularwerte eines Anlasses (`PUT events/:id/as-organizer`).
class AnlassEntwurf {
  AnlassEntwurf({
    this.titel = '',
    this.untertitel = '',
    this.ort = '',
    this.kategorie,
    this.kosten = '',
    this.beschreibung = '',
    this.status,
    this.beginn,
    this.ende,
    this.anmeldeschluss,
    this.maxTeilnehmer,
    this.anmeldungVerlangt = false,
    this.menueOptionen = const [],
    this.datumOffen = false,
    this.organisator,
  });

  /// Werte aus dem Anlass, so wie das Backend sie liefert — auch die, die
  /// das Formular nicht zeigt, gehen so nie verloren. [organisator] nur im
  /// Formular des Vorstands (sonst bleibt er unberuehrt).
  factory AnlassEntwurf.aus(Anlass a, {OrganisatorAngabe? organisator, bool? datumOffen}) =>
      AnlassEntwurf(
        titel: a.titel,
        untertitel: a.untertitel ?? '',
        ort: a.ort ?? '',
        kategorie: a.kategorie,
        kosten: a.kosten ?? '',
        beschreibung: a.beschreibung ?? '',
        status: a.status,
        beginn: Zeitpunkt.ausDb(a.beginn),
        ende: Zeitpunkt.ausDb(a.ende),
        anmeldeschluss: Zeitpunkt.ausDb(a.anmeldeschluss),
        maxTeilnehmer: a.maxTeilnehmer,
        anmeldungVerlangt: a.anmeldungVerlangt,
        menueOptionen: List.of(a.menueOptionen),
        datumOffen: datumOffen ?? a.app.datumOffen,
        organisator: organisator,
      );

  String titel;
  String untertitel;
  String ort;
  String? kategorie;
  String kosten;
  String beschreibung;
  String? status;
  Zeitpunkt? beginn;
  Zeitpunkt? ende;
  Zeitpunkt? anmeldeschluss;
  int? maxTeilnehmer;
  bool anmeldungVerlangt;
  List<String> menueOptionen;

  /// Termin steht noch nicht fest (`datum_offen`, nur Vorstand): der Beginn
  /// dient dann nur der Einordnung und wird nirgends angezeigt.
  bool datumOffen;

  /// Organisator (nur Vorstand); null: das Formular fasst ihn nicht an.
  OrganisatorAngabe? organisator;

  /// Neuer PDF-Aushang (nur Vorstand); null: keiner gewaehlt.
  GewaehlteDatei? pdfNeu;

  /// Bisherigen PDF-Aushang entfernen (nur Vorstand).
  bool pdfEntfernen = false;

  Map<String, Object?> get _pdf => {
    if (pdfNeu case final p?) ...{
      'pdf_attachment': base64Encode(p.bytes),
      'pdf_filename': p.dateiname,
    } else if (pdfEntfernen) ...{
      'pdf_attachment': null,
      'pdf_filename': null,
    },
  };

  /// Body fuer einen neuen Anlass (`POST events`, nur Vorstand). Wie
  /// vorstand.html: Anmeldung verlangt, wenn die Kategorie sie braucht
  /// ([anmeldepflichtig]) oder sie eingeschaltet ist; Anmeldefelder und
  /// Menuewahl nur, wenn die Kategorie sie hat ([KategorieFelder]).
  Map<String, Object?> alsNeuJson({List<String> anmeldepflichtig = const []}) {
    String? leer(String s) => s.trim().isEmpty ? null : s.trim();
    final felder = KategorieFelder.fuer(kategorie);
    final menue = [
      for (final m in menueOptionen)
        if (m.trim().isNotEmpty) m.trim(),
    ];
    return {
      'title': titel.trim(),
      'subtitle': leer(untertitel),
      'category': kategorie,
      'status': status ?? 'planned',
      'start_date': beginn?.alsDb(),
      'end_date': ende?.alsDb(),
      'datum_offen': datumOffen,
      'location': leer(ort),
      'description': leer(beschreibung),
      'cost': leer(kosten),
      'registration_required':
          (felder.anmeldung && anmeldungVerlangt) || anmeldepflichtig.contains(kategorie),
      'registration_deadline': felder.anmeldung ? anmeldeschluss?.alsDb() : null,
      'max_participants': felder.anmeldung ? maxTeilnehmer : null,
      'meal_options': felder.menue && menue.isNotEmpty ? menue : null,
      ...?organisator?.alsJson(),
      ..._pdf,
    };
  }

  /// Body mit den geaenderten Feldern; leer, wenn nichts geaendert wurde.
  Map<String, Object?> aenderungen(AnlassEntwurf original) {
    String? leer(String s) => s.trim().isEmpty ? null : s.trim();
    final menue = [
      for (final m in menueOptionen)
        if (m.trim().isNotEmpty) m.trim(),
    ];
    final menueAlt = [
      for (final m in original.menueOptionen)
        if (m.trim().isNotEmpty) m.trim(),
    ];
    return {
      if (titel.trim() != original.titel.trim()) 'title': titel.trim(),
      if (leer(untertitel) != leer(original.untertitel)) 'subtitle': leer(untertitel),
      if (leer(ort) != leer(original.ort)) 'location': leer(ort),
      if (kategorie != original.kategorie) 'category': kategorie,
      if (leer(kosten) != leer(original.kosten)) 'cost': leer(kosten),
      if (leer(beschreibung) != leer(original.beschreibung)) 'description': leer(beschreibung),
      if (status != original.status) 'status': status,
      if (beginn?.alsDb() != original.beginn?.alsDb()) 'start_date': beginn?.alsDb(),
      if (ende?.alsDb() != original.ende?.alsDb()) 'end_date': ende?.alsDb(),
      if (anmeldeschluss?.alsDb() != original.anmeldeschluss?.alsDb())
        'registration_deadline': anmeldeschluss?.alsDb(),
      if (maxTeilnehmer != original.maxTeilnehmer) 'max_participants': maxTeilnehmer,
      if (anmeldungVerlangt != original.anmeldungVerlangt)
        'registration_required': anmeldungVerlangt,
      if (!_gleich(menue, menueAlt)) 'meal_options': menue.isEmpty ? null : menue,
      if (datumOffen != original.datumOffen) 'datum_offen': datumOffen,
      if (organisator case final o? when !o.gleich(original.organisator)) ...o.alsJson(),
      ..._pdf,
    };
  }
}

/// Eine vom Geraet gewaehlte Datei (z.B. der PDF-Aushang).
typedef GewaehlteDatei = ({Uint8List bytes, String dateiname});

/// Welche Teile des Anlass-Formulars eine Kategorie braucht - wie
/// `updateEventFormByCategory` in vorstand.html.
class KategorieFelder {
  const KategorieFelder({
    this.anmeldung = true,
    this.menue = false,
    this.schichten = true,
    this.ohneAnmeldung = false,
  });

  static KategorieFelder fuer(String? kategorie) => switch (kategorie) {
    // Dorffest: nur Schichten
    'Dorffest' => const KategorieFelder(anmeldung: false),
    // GV: Anmeldung und Menuewahl
    'GV' => const KategorieFelder(menue: true, schichten: false),
    'Aufbau' || 'Abbau' || 'Ausflug mit Anmeldung' => const KategorieFelder(schichten: false),
    // Ausflug: keine Anmeldung
    'Ausflug' => const KategorieFelder(anmeldung: false, schichten: false, ohneAnmeldung: true),
    // Sonstiges (und Unbekanntes): beides, der Vorstand entscheidet
    _ => const KategorieFelder(),
  };

  /// Teilnehmer-Anmeldung (Anmeldeschluss, Max. Teilnehmer).
  final bool anmeldung;

  /// Menuewahl (GV).
  final bool menue;

  /// Helfer-Schichten.
  final bool schichten;

  /// Hinweis "Bei Ausflug keine Anmeldung".
  final bool ohneAnmeldung;
}

/// Organisator eines Anlasses, wie der Vorstand ihn setzt: ein Mitglied
/// ([mitgliedId], verwaltet den Anlass in der Mitglieder-App) oder extern
/// (Name und E-Mail; auf Wunsch mit eigenem Organisator-Zugang).
class OrganisatorAngabe {
  const OrganisatorAngabe({
    this.mitgliedId,
    this.name = '',
    this.email = '',
    this.zugangErstellen = false,
  });

  final String? mitgliedId;
  final String name;
  final String email;

  /// Nur extern: Login fuers Event-Dashboard erstellen; die Zugangsdaten
  /// gehen per E-Mail an den Organisator (`create_access`).
  final bool zugangErstellen;

  bool get istMitglied => mitgliedId != null;

  /// Felder fuer `POST events` / `PUT events/:id` (wie saveEvent in
  /// vorstand.html). Ein Mitglied bekommt nie einen eigenen Zugang.
  Map<String, Object?> alsJson() {
    String? t(String s) => s.trim().isEmpty ? null : s.trim();
    return {
      'organizer_id': mitgliedId,
      'organizer_name': t(name),
      'organizer_email': t(email),
      'create_access': !istMitglied && zugangErstellen && t(email) != null,
    };
  }

  bool gleich(OrganisatorAngabe? o) =>
      o != null &&
      mitgliedId == o.mitgliedId &&
      name.trim() == o.name.trim() &&
      email.trim() == o.email.trim() &&
      zugangErstellen == o.zugangErstellen;
}

/// Ein Anlass-Vorschlag eines Mitglieds (`GET events/proposals`, Status
/// `proposed`): der Vorstand genehmigt, bearbeitet oder lehnt ab.
class OffenerVorschlag {
  const OffenerVorschlag({
    required this.anlass,
    this.vorgeschlagenVon,
    this.organisator = const OrganisatorAngabe(),
    this.datumOffen = false,
  });

  factory OffenerVorschlag.ausJson(Map<String, dynamic> m) {
    final mitglied = [
      jsonText(m['organizer_vorname']),
      jsonText(m['organizer_nachname']),
    ].whereType<String>().join(' ').trim();
    return OffenerVorschlag(
      anlass: Anlass.ausJson(m),
      vorgeschlagenVon: mitglied.isNotEmpty
          ? mitglied
          : jsonText(m['organizer_name']) ??
                jsonText(m['organizer_member_email']) ??
                jsonText(m['organizer_email']),
      organisator: OrganisatorAngabe(
        mitgliedId: jsonText(m['organizer_id']),
        name: mitglied.isNotEmpty ? mitglied : (jsonText(m['organizer_name']) ?? ''),
        email: jsonText(m['organizer_email']) ?? jsonText(m['organizer_member_email']) ?? '',
      ),
      datumOffen: jsonWahr(m['datum_offen']) ?? false,
    );
  }

  /// Die Zeile, wie sie ist (ohne `app`-Block).
  final Anlass anlass;
  final String? vorgeschlagenVon;
  final OrganisatorAngabe organisator;
  final bool datumOffen;

  /// "17.10.2026, 10:00" bzw. "Datum noch offen".
  String? get wannText => datumOffen ? 'Datum noch offen' : Zeitpunkt.ausDb(anlass.beginn)?.anzeige;
}

/// Springer-Schichten fuer alle Zeitfenster (Datum, Von, Bis) der
/// [vorhandene]n Schichten, die noch keinen Springer haben - wie
/// `generateSpringerShifts` in vorstand.html. Springer- und
/// Vorbereitungs-Schichten selbst zaehlen nicht als Zeitfenster.
List<SchichtEntwurf> springerSchichten(Iterable<SchichtEntwurf> vorhandene) {
  String schluessel(SchichtEntwurf s) => '${isoDatum(s.datum!)}|${s.von.trim()}|${s.bis.trim()}';
  final mitSpringer = {
    for (final s in vorhandene)
      if (s.bereich == 'Springer' && s.datum != null) schluessel(s),
  };
  final neu = <String, SchichtEntwurf>{};
  for (final s in vorhandene) {
    if (s.bereich == 'Springer' || s.bereich == 'Vorbereitung') continue;
    if (s.datum == null || s.von.trim().isEmpty) continue;
    final k = schluessel(s);
    if (mitSpringer.contains(k) || neu.containsKey(k)) continue;
    neu[k] = SchichtEntwurf(
      name: 'Springer',
      bereich: 'Springer',
      datum: s.datum,
      von: s.von.trim(),
      bis: s.bis.trim(),
    );
  }
  return neu.values.toList();
}

bool _gleich(List<String> a, List<String> b) {
  if (a.length != b.length) return false;
  for (var i = 0; i < a.length; i++) {
    if (a[i] != b[i]) return false;
  }
  return true;
}

/// Formularwerte einer Schicht (`POST events/:id/shifts-as-organizer`,
/// `PUT events/:id/shifts/:shiftId/as-organizer`).
class SchichtEntwurf {
  SchichtEntwurf({
    this.name = '',
    this.bereich = 'Allgemein',
    this.beschreibung = '',
    this.datum,
    this.von = '',
    this.bis = '',
    this.gebraucht = 1,
  });

  /// Werte der bestehenden Schicht — das Datum bleibt, wie es ist.
  factory SchichtEntwurf.aus(Schicht s) => SchichtEntwurf(
    name: s.name ?? '',
    bereich: s.bereich ?? 'Allgemein',
    beschreibung: s.beschreibung ?? '',
    datum: jsonDatum(s.datum),
    von: _hhmm(s.beginn),
    bis: _hhmm(s.ende),
    gebraucht: s.gebraucht ?? 1,
  );

  String name;
  String bereich;
  String beschreibung;
  DateTime? datum;

  /// "HH:MM" oder leer.
  String von;
  String bis;
  int gebraucht;

  /// Body zum Anlegen.
  Map<String, Object?> alsJson() => {
    'name': name.trim(),
    'bereich': bereich,
    'description': beschreibung.trim().isEmpty ? null : beschreibung.trim(),
    'date': datum == null ? null : isoDatum(datum!),
    'start_time': von.trim().isEmpty ? null : von.trim(),
    'end_time': bis.trim().isEmpty ? null : bis.trim(),
    'needed': gebraucht,
  };

  /// Body mit den geaenderten Feldern. Das Backend laesst alles, was fehlt
  /// (oder null ist), unveraendert — Leeren geht deshalb nicht.
  Map<String, Object?> aenderungen(SchichtEntwurf original) => {
    if (name.trim() != original.name.trim()) 'name': name.trim(),
    if (bereich != original.bereich) 'bereich': bereich,
    if (beschreibung.trim() != original.beschreibung.trim()) 'description': beschreibung.trim(),
    if (datum != null && (original.datum == null || isoDatum(datum!) != isoDatum(original.datum!)))
      'date': isoDatum(datum!),
    if (von.trim().isNotEmpty && von.trim() != original.von.trim()) 'start_time': von.trim(),
    if (bis.trim().isNotEmpty && bis.trim() != original.bis.trim()) 'end_time': bis.trim(),
    if (gebraucht != original.gebraucht) 'needed': gebraucht,
  };
}

String _hhmm(String? zeit) {
  final m = RegExp(r'^(\d{2}):(\d{2})').firstMatch(zeit ?? '');
  return m == null ? '' : '${m[1]}:${m[2]}';
}

/// Datum mit oder ohne Uhrzeit, wie die Datenbank es speichert: Ortszeit
/// ohne Zone, "2026-10-17 10:00:00"; ohne Uhrzeit Mitternacht.
class Zeitpunkt {
  const Zeitpunkt(this.datum, {this.stunde, this.minute});

  /// Liest "2026-10-17 10:00:00", "2026-10-17T10:00" oder "2026-10-17".
  /// Mitternacht heisst "ohne Uhrzeit" (wie app-ansicht.js im Backend).
  static Zeitpunkt? ausDb(String? wert) {
    final m = RegExp(r'^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2}))?').firstMatch(wert ?? '');
    if (m == null) return null;
    final datum = DateTime(int.parse(m[1]!), int.parse(m[2]!), int.parse(m[3]!));
    final h = m[4] == null ? null : int.parse(m[4]!);
    final min = m[5] == null ? null : int.parse(m[5]!);
    if (h == null || (h == 0 && min == 0)) return Zeitpunkt(datum);
    return Zeitpunkt(datum, stunde: h, minute: min);
  }

  /// Nur das Datum zaehlt (Stunden usw. von [datum] werden ignoriert).
  final DateTime datum;
  final int? stunde;
  final int? minute;

  bool get mitZeit => stunde != null;

  Zeitpunkt mitDatum(DateTime d) => Zeitpunkt(d, stunde: stunde, minute: minute);

  Zeitpunkt mitUhrzeit(int? h, int? min) =>
      Zeitpunkt(datum, stunde: h, minute: h == null ? null : (min ?? 0));

  /// "2026-10-17 10:00:00" bzw. "2026-10-17".
  String alsDb() =>
      mitZeit ? '${isoDatum(datum)} ${_zwei(stunde!)}:${_zwei(minute ?? 0)}:00' : isoDatum(datum);

  /// "17.10.2026" bzw. "17.10.2026, 10:00" (nur im Formular).
  String get anzeige => mitZeit
      ? '${schweizerDatum(datum)}, ${_zwei(stunde!)}:${_zwei(minute ?? 0)}'
      : schweizerDatum(datum);
}

String _zwei(int n) => n.toString().padLeft(2, '0');
